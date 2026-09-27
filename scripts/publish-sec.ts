// Publishes automatically translated company machines from SEC EDGAR.
//   SEC_USER_AGENT="App contact@example.com" npm run data:publish -- AAPL [--save-fixtures]
//   npm run data:publish -- AAPL --fixtures        (offline, from tests/fixtures/sec)
// Verified companies are never overwritten. A company that fails a quality gate is skipped with its reasons,
// and whatever was published for it before stays in place.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { DataQualityError, secToDataset, trimFacts, type SecCompanyFacts, type SecSubmission } from '../src/data/sec';
import { companyRegistry } from '../src/translation/classify';
import { constructMachine, validateDataset } from '../src/translation/construct';
import type { CompanyDataset } from '../src/ontology/types';

const args = process.argv.slice(2), offline = args.includes('--fixtures'), save = args.includes('--save-fixtures');
const tickers = args.filter(a => !a.startsWith('--')).map(t => t.toUpperCase());
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
 cikMap ??= Object.fromEntries(Object.values(await sec<Record<string, { cik_str: number; ticker: string }>>('https://www.sec.gov/files/company_tickers.json')).map(r => [r.ticker.toUpperCase(), r.cik_str]));
 const cik = cikMap[ticker]; if (!cik) throw Error(`${ticker}: not found in SEC’s ticker list`); return cik;
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
for (const ticker of tickers) {
 if (companyRegistry[ticker]) { report.push({ ticker, status: 'skipped: verified dataset is curated by hand' }); continue; }
 try {
  const { facts, sub, retrieved } = await load(ticker);
  const dataset: CompanyDataset = secToDataset(ticker, facts, sub, retrieved);
  validateDataset(dataset);
  dataset.periods.forEach((_, i) => constructMachine(dataset, i));
  if (save) await writeFile(`tests/fixtures/sec/${ticker}.json`, JSON.stringify({ retrieved, submission: sub, facts: trimFacts(facts, dataset.classification!.sector) }) + '\n');
  await writeFile(`public/machines/${ticker}.json`, JSON.stringify(dataset, null, 2) + '\n');
  const entry = { ticker, name: dataset.name, periods: dataset.periods.map(p => p.period), retrieved, verified: false, sector: dataset.classification!.sector };
  index.companies = [...index.companies.filter(c => c.ticker !== ticker), entry];
  report.push({ ticker, status: 'published' });
 } catch (e) {
  report.push({ ticker, status: existsSync(`public/machines/${ticker}.json`) ? 'failed: previous dataset kept' : 'failed: not published', reasons: e instanceof DataQualityError ? e.reasons : [e instanceof Error ? e.message : String(e)] });
 }
}
index.companies.sort((a, b) => String(a.ticker).localeCompare(String(b.ticker)));
await writeFile(indexPath, JSON.stringify(index, null, 2) + '\n');
await mkdir('artifacts/refresh', { recursive: true });
await writeFile('artifacts/refresh/publish-report.json', JSON.stringify(report, null, 2) + '\n');
for (const r of report) console.log(`${r.ticker}: ${r.status}${r.reasons ? ' — ' + r.reasons.join('; ') : ''}`);
if (report.every(r => r.status.startsWith('failed'))) process.exitCode = 1;
