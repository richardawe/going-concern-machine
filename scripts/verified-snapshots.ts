// Writes the three verified company snapshots (MSFT, WMT, JPM) from their latest Form 10-K.
//   node --import tsx scripts/verified-snapshots.ts
// Every value is typed from the filing's XBRL instance (USD millions), with the tag it came from. The prior year is
// the new 10-K's own comparative, and was checked against the previous verified snapshot. The script refuses to write
// if an accounting identity fails. It only replaces these three entries in public/machines/index.json.
import { readFile, writeFile } from 'node:fs/promises';
import type { CompanyDataset, CompanyPeriod, Datum } from '../src/ontology/types';

const retrieved = '2026-09-28';
type Row = [field: string, tag: string, values: [number, number], note?: string];
interface Filing { ticker: string; name: string; label: string; filed: string; url: string; periods: [[number, string], [number, string]]; rows: Row[]; derived?: (v: (k: string, i: number) => number, i: number) => Record<string, Datum> }

const filings: Filing[] = [
 { ticker: 'MSFT', name: 'Microsoft Corporation', label: 'Microsoft FY2026 Form 10-K', filed: '2026-07-29',
  url: 'https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/msft-20260630.htm', periods: [[2026, '2026-06-30'], [2025, '2025-06-30']],
  rows: [
   ['revenue', 'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax', [331839, 281724]],
   ['cogs', 'us-gaap:CostOfGoodsAndServicesSold', [106374, 87831]],
   ['grossProfit', 'us-gaap:GrossProfit', [225465, 193893]],
   ['operatingProfit', 'us-gaap:OperatingIncomeLoss', [155237, 128528]],
   ['tax', 'us-gaap:IncomeTaxExpenseBenefit', [32185, 21795]],
   ['operatingCashFlow', 'us-gaap:NetCashProvidedByUsedInOperatingActivities', [182935, 136162]],
   ['capex', 'us-gaap:PaymentsToAcquirePropertyPlantAndEquipment', [115948, 64551]],
   ['cash', 'us-gaap:CashAndCashEquivalentsAtCarryingValue', [20935, 30242]],
   ['equity', 'us-gaap:StockholdersEquity', [442387, 343479]],
   ['rd', 'us-gaap:ResearchAndDevelopmentExpense', [35562, 32488]],
   ['dividends', 'us-gaap:PaymentsOfDividendsCommonStock', [26445, 24082]],
   ['cloudRevenue', 'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax [StatementBusinessSegmentsAxis = Intelligent Cloud]', [137791, 106265], 'Intelligent Cloud segment revenue'],
   ['ppe', 'us-gaap:PropertyPlantAndEquipmentNet', [313076, 204966]],
   ['debtCurrent', 'us-gaap:LongTermDebtCurrent', [9227, 2999]],
   ['debtNoncurrent', 'us-gaap:LongTermDebtNoncurrent', [31067, 40152]],
  ],
  derived: (v, i) => ({ debt: { value: (v('debtCurrent', i) + v('debtNoncurrent', i)) * 1e6, unit: 'USD', status: 'CALCULATED', calculation: 'Current term debt + noncurrent term debt; no commercial paper outstanding; excludes lease liabilities', source: '', period: '' } }) },
 { ticker: 'WMT', name: 'Walmart Inc.', label: 'Walmart FY2026 Form 10-K', filed: '2026-03-13',
  url: 'https://www.sec.gov/Archives/edgar/data/104169/000010416926000055/wmt-20260131.htm', periods: [[2026, '2026-01-31'], [2025, '2025-01-31']],
  rows: [
   ['revenue', 'us-gaap:Revenues', [713163, 680985]],
   ['cogs', 'us-gaap:CostOfRevenue', [535395, 511753]],
   ['operatingProfit', 'us-gaap:OperatingIncomeLoss', [29825, 29348]],
   ['opex', 'us-gaap:SellingGeneralAndAdministrativeExpense', [147943, 139884], 'Operating, selling, general and administrative expenses'],
   ['operatingCashFlow', 'us-gaap:NetCashProvidedByUsedInOperatingActivities', [41565, 36443]],
   ['capex', 'us-gaap:PaymentsToAcquirePropertyPlantAndEquipment', [26642, 23783]],
   ['cash', 'us-gaap:CashAndCashEquivalentsAtCarryingValue', [10727, 9037]],
   ['inventory', 'us-gaap:InventoryNet', [58851, 56435]],
   ['inventoryInvestment', 'us-gaap:IncreaseDecreaseInRetailRelatedInventories', [1443, 2755], 'Increase in inventories (cash absorbed by stock)'],
   ['ppe', 'us-gaap:PropertyPlantAndEquipmentNet', [136083, 119993]],
   ['equity', 'us-gaap:StockholdersEquity', [99617, 91013], 'Total Walmart shareholders’ equity, excluding noncontrolling interest'],
  ] },
 { ticker: 'JPM', name: 'JPMorgan Chase & Co.', label: 'JPMorgan Chase FY2025 Form 10-K', filed: '2026-02-13',
  url: 'https://www.sec.gov/Archives/edgar/data/19617/000162828026008131/jpm-20251231.htm', periods: [[2025, '2025-12-31'], [2024, '2024-12-31']],
  rows: [
   ['revenue', 'us-gaap:Revenues', [182447, 177556], 'Total net revenue, reported GAAP'],
   ['nii', 'us-gaap:InterestIncomeExpenseNet', [95443, 92583]],
   ['fees', 'us-gaap:NoninterestIncome', [87004, 84973]],
   ['opex', 'us-gaap:NoninterestExpense', [95640, 91797]],
   ['provision', 'us-gaap:ProvisionForLoanLeaseAndOtherLosses', [14212, 10678]],
   ['tax', 'us-gaap:IncomeTaxExpenseBenefit', [15547, 16610]],
   ['netIncome', 'us-gaap:NetIncomeLoss', [57048, 58471]],
   ['deposits', 'us-gaap:Deposits', [2559320, 2406032]],
   ['loans', 'jpm:FinancingReceivableExcludingAccruedInterestBeforeAllowanceForCreditLossesNetOfDeferredIncome', [1493429, 1347988], 'Total loans, before the allowance for credit losses'],
   ['equity', 'us-gaap:StockholdersEquity', [362438, 344758]],
   ['cet1Capital', 'jpm:CommonEquityTier1Capital [Firm, Basel III Standardized]', [288469, 275513]],
   ['rwa', 'us-gaap:RiskWeightedAssets [Firm, Basel III Standardized]', [1981692, 1757460]],
   ['cet1', 'jpm:CommonEquityTier1CapitaltoRiskWeightedAssets [Firm, Basel III Standardized]', [.146, .157]],
   ['lcr', 'Not XBRL-tagged: Liquidity Risk Management table, average LCR for the three months ended December 31', [1.11, 1.13], 'Firm average liquidity coverage ratio, fourth quarter'],
  ] },
];

const ratios = new Set(['cet1', 'lcr']), helpers = new Set(['debtCurrent', 'debtNoncurrent']);
const out: CompanyDataset[] = filings.map(f => {
 const v = (k: string, i: number) => f.rows.find(r => r[0] === k)![2][i];
 const check = (label: string, a: number, b: number, tolerance = 0) => { if (Math.abs(a - b) > tolerance) throw Error(`${f.ticker} ${label}: ${a} ≠ ${b}`); };
 for (const i of [0, 1]) {
  if (f.ticker === 'MSFT') check('gross profit = revenue − cost of revenue', v('grossProfit', i), v('revenue', i) - v('cogs', i));
  if (f.ticker === 'WMT') check('operating income = revenue − cost of sales − operating expenses', v('operatingProfit', i), v('revenue', i) - v('cogs', i) - v('opex', i));
  if (f.ticker === 'JPM') {
   check('revenue = NII + noninterest revenue', v('revenue', i), v('nii', i) + v('fees', i));
   check('net income = revenue − expense − provision − tax', v('netIncome', i), v('revenue', i) - v('opex', i) - v('provision', i) - v('tax', i));
   check('CET1 ratio = CET1 capital / RWA (to 0.1pp)', v('cet1', i), v('cet1Capital', i) / v('rwa', i), .0005);
  }
 }
 const periods: CompanyPeriod[] = f.periods.map(([fiscalYear, period], i) => {
  const source = `${f.label}, filed ${f.filed} with the SEC`;
  const facts: Record<string, Datum> = Object.fromEntries(f.rows.filter(([k]) => !helpers.has(k)).map(([k, tag, vals, note]) => [k, {
   value: ratios.has(k) ? vals[i] : vals[i] * 1e6, unit: ratios.has(k) ? 'ratio' : 'USD', status: 'OBSERVED', period, url: f.url,
   source: `${source} · ${tag}${i ? ' · prior-year comparative' : ''}`, ...(note ? { calculation: note } : {}) } as Datum]));
  for (const [k, d] of Object.entries(f.derived?.(v, i) ?? {})) facts[k] = { ...d, source, url: f.url, period };
  return { period, fiscalYear, facts };
 });
 return { schemaVersion: 2, ticker: f.ticker, name: f.name, retrieved, provider: `${f.label} (SEC XBRL), verified by hand`, periods };
});

for (const d of out) await writeFile(`public/machines/${d.ticker}.json`, JSON.stringify(d, null, 2) + '\n');
const index = JSON.parse(await readFile('public/machines/index.json', 'utf8'));
for (const d of out) {
 const entry = index.companies.find((c: { ticker: string }) => c.ticker === d.ticker);
 Object.assign(entry, { name: d.name, periods: d.periods.map(p => p.period), retrieved });
}
await writeFile('public/machines/index.json', JSON.stringify(index, null, 2) + '\n');
console.log(out.map(d => `${d.ticker}: ${d.periods.map(p => `FY${p.fiscalYear}`).join(', ')}`).join('\n'));
