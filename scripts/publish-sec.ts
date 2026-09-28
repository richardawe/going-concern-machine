// Publishes automatically translated company machines from SEC EDGAR.
//   SEC_USER_AGENT="App contact@example.com" npm run data:publish -- AAPL [--save-fixtures]
//   npm run data:publish -- AAPL --fixtures        (offline, from tests/fixtures/sec)
//   npm run data:publish -- --universe data/universe/sp500.json   (every company in a list)
// Verified companies are never overwritten. A company that fails a quality gate is skipped with its reasons,
// and whatever was published for it before stays in place. A machine that cannot run a scenario is still published
// (its reported figures are sound) but marked inspect-only in the index, with the reason.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { DataQualityError, secToDataset, trimFacts, type SecCompanyFacts, type SecSubmission } from '../src/data/sec';
import { companyRegistry } from '../src/translation/classify';
import { constructMachine, validateDataset } from '../src/translation/construct';
import { whyInspectOnly } from '../src/simulation/company';
import type { CompanyDataset } from '../src/ontology/types';

const args = process.argv.slice(2), offline = args.includes('--fixtures'), save = args.includes('--save-fixtures');
type Listed = { ticker: string; cik: number; annualReportsCik?: number };
const readList = async (path: string) => (JSON.parse(await readFile(path, 'utf8')) as { companies: Listed[] }).companies;
const universeAt = args.indexOf('--universe'), universe = universeAt >= 0 ? await readList(args[universeAt + 1]) : [];
const tickers = [...new Set([...args.filter((a, i) => !a.startsWith('--') && (universeAt < 0 || i !== universeAt + 1)).map(t => t.toUpperCase()), ...universe.map(c => c.ticker.toUpperCase())])];
// The curated list's CIKs win over SEC's ticker map, which can point a ticker at a new holding company with no filings yet.
const known = [...universe, ...(existsSync('data/universe/sp500.json') ? await readList('data/universe/sp500.json') : [])];
const agent = process.env.SEC_USER_AGENT;
if (!offline && (!agent || !agent.includes('@'))) throw Error('Set SEC_USER_AGENT to an application name and contact email (SEC requires it), or pass --fixtures.');
if (!tickers.length) throw Error('Name at least one ticker.');
const today = new Date().toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function sec<T>(url: string): Promise<T> {
 const res = await fetch(url, { headers: { 'User-Agent': agent!, Accept: 'application/json' }, signal: AbortSignal.timeout(60000) });
 if (!res.ok) throw Error(`SEC returned ${res.status} for ${url}`);
 await sleep(150); // SEC asks for at most 10 requests per second
 return res.json() as Promise<T>;
}
let cikMap: Record<string, number> | null = null;
async function cikFor(ticker: string) {
 const listed = known.find(c => c.ticker.toUpperCase() === ticker); if (listed) return listed.annualReportsCik ?? listed.cik;
 cikMap ??= Object.fromEntries(Object.values(await sec<Record<string, { cik_str: number; ticker: string }>>('https://www.sec.gov/files/company_tickers.json')).map(r => [r.ticker.toUpperCase(), r.cik_str]));
 const cik = cikMap[ticker] ?? cikMap[ticker.replace(/\./g, '-')]; if (!cik) throw Error(`${ticker}: not found in SEC’s ticker list`); return cik;
}
async function load(ticker: string): Promise<{ facts: SecCompanyFacts; sub: SecSubmission; retrieved: string }> {
 const file = `tests/fixtures/sec/${ticker}.json`;
 if (offline) { const f = JSON.parse(await readFile(file, 'utf8')); return { facts: f.facts, sub: f.submission, retrieved: f.retrieved }; }
 const cik = String(await cikFor(ticker)).padStart(10, '0');
 const raw = await sec<SecSubmission & Record<string, unknown>>(`https://data.sec.gov/submissions/CIK${cik}.json`);
 const sub: SecSubmission = { cik: raw.cik, name: raw.name, sic: raw.sic, sicDescription: raw.sicDescription };
 const facts = await sec<SecCompanyFacts>(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`);
 return { facts, sub, retrieved: today };
}

const indexPath = 'public/machines/index.json';
const index = JSON.parse(await readFile(indexPath, 'utf8')) as { schemaVersion: 2; coverage: string; companies: Record<string, unknown>[] };
const report: { ticker: string; status: string; reasons?: string[] }[] = [];
await mkdir('tests/fixtures/sec', { recursive: true });
let done = 0;
for (const ticker of tickers) {
 if (++done % 25 === 0) console.log(`… ${done}/${tickers.length}`);
 if (companyRegistry[ticker]) { report.push({ ticker, status: 'skipped: verified dataset is curated by hand' }); continue; }
 try {
  const { facts, sub, retrieved } = await load(ticker);
  const dataset: CompanyDataset = secToDataset(ticker, facts, sub, retrieved);
  validateDataset(dataset);
  dataset.periods.forEach((_, i) => constructMachine(dataset, i));
  const inspectOnly = whyInspectOnly(constructMachine(dataset));
  if (save) await writeFile(`tests/fixtures/sec/${ticker}.json`, JSON.stringify({ retrieved, submission: sub, facts: trimFacts(facts, dataset.classification!.sector) }) + '\n');
  await writeFile(`public/machines/${ticker}.json`, JSON.stringify(dataset, null, 2) + '\n');
  const entry = { ticker, name: dataset.name, periods: dataset.periods.map(p => p.period), retrieved, verified: false, sector: dataset.classification!.sector, ...(inspectOnly ? { inspectOnly } : {}) };
  index.companies = [...index.companies.filter(c => c.ticker !== ticker), entry];
  report.push(inspectOnly ? { ticker, status: 'published: inspect only', reasons: [inspectOnly] } : { ticker, status: 'published' });
 } catch (e) {
  report.push({ ticker, status: existsSync(`public/machines/${ticker}.json`) ? 'failed: previous dataset kept' : 'failed: not published', reasons: e instanceof DataQualityError ? e.reasons : [e instanceof Error ? e.message : String(e)] });
 }
}
index.companies.sort((a, b) => String(a.ticker).localeCompare(String(b.ticker)));
await writeFile(indexPath, JSON.stringify(index, null, 2) + '\n');
await mkdir('artifacts/refresh', { recursive: true });
await writeFile('artifacts/refresh/publish-report.json', JSON.stringify(report, null, 2) + '\n');
for (const r of report) console.log(`${r.ticker}: ${r.status}${r.reasons ? ' — ' + r.reasons.join('; ') : ''}`);
const count = (p: string) => report.filter(r => r.status.startsWith(p)).length;
const summary = [`### Company machines · ${today}`, '', `Published ${count('published')} (${count('published: inspect only')} inspect only) · skipped ${count('skipped')} (verified) · not published ${count('failed')} of ${report.length}.`, '',
 ...(report.some(r => r.reasons) ? ['| Ticker | Status | Why |', '| --- | --- | --- |', ...report.filter(r => r.reasons).map(r => `| ${r.ticker} | ${r.status} | ${(r.reasons ?? []).join('; ').replace(/\|/g, '/')} |`)] : [])].join('\n');
await writeFile('artifacts/refresh/publish-report.md', summary + '\n');
if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, summary + '\n', { flag: 'a' });
if (report.every(r => r.status.startsWith('failed'))) process.exitCode = 1;
