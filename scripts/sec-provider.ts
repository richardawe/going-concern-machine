import type { Company, Fact, Statement } from '../src/model/types';
import type { FinancialDataProvider } from '../src/data/provider';
export interface SecFact { val: number; start?: string; end: string; filed: string; form: string; accn: string; fy?: number; fp?: string; }
export type SecFacts = Record<string, { units?: Record<string, SecFact[]> }>;
const tags: Record<string, string[]> = {
  revenue: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet'],
  cogs: ['CostOfRevenue', 'CostOfGoodsAndServicesSold'], grossProfit: ['GrossProfit'], operatingProfit: ['OperatingIncomeLoss'],
  operatingCashFlow: ['NetCashProvidedByUsedInOperatingActivities'], capex: ['PaymentsToAcquirePropertyPlantAndEquipment'],
  cash: ['CashAndCashEquivalentsAtCarryingValue'], equity: ['StockholdersEquity'],
  debtCurrent: ['LongTermDebtCurrent'], debtNoncurrent: ['LongTermDebtNoncurrent'], commercialPaper: ['CommercialPaper'],
  interestExpense: ['InterestExpenseNonOperating', 'InterestExpense'], tax: ['IncomeTaxExpenseBenefit'],
  depreciation: ['DepreciationDepletionAndAmortization', 'DepreciationDepletionAndAmortizationPropertyPlantAndEquipment', 'DepreciationAmortizationAndAccretionNet'],
  rd: ['ResearchAndDevelopmentExpense'], dividends: ['PaymentsOfDividends', 'PaymentsOfDividendsCommonStock'],
};
const instants = new Set(['cash', 'equity', 'debtCurrent', 'debtNoncurrent', 'commercialPaper']);
export function selectFact(facts: SecFacts, names: string[], end: string, instant: boolean): { fact: SecFact; tag: string } | null {
  for (const tag of names) {
    const rows = (facts[tag]?.units?.USD ?? []).filter(f => ['10-K','10-K/A'].includes(f.form) && f.end === end && Number.isFinite(f.val) && (instant ? !f.start : !!f.start && (Date.parse(f.end)-Date.parse(f.start))/86400000 > 330 && (Date.parse(f.end)-Date.parse(f.start))/86400000 < 380));
    rows.sort((a,b) => b.filed.localeCompare(a.filed));
    if (rows[0]) return { fact: rows[0], tag };
  }
  return null;
}
export function normalizeCompany(raw: { entityName: string; facts: { 'us-gaap': SecFacts } }, ticker: string, cik: string): Company {
  const facts = raw.facts['us-gaap'];
  if (!facts) throw new Error('US GAAP facts unavailable');
  const periods = [...new Set(tags.revenue.flatMap(t => (facts[t]?.units?.USD ?? []).filter(f => ['10-K','10-K/A'].includes(f.form) && f.start && (Date.parse(f.end)-Date.parse(f.start))/86400000 > 330 && (Date.parse(f.end)-Date.parse(f.start))/86400000 < 380).map(f=>f.end)))].sort().reverse().slice(0,4);
  const statements: Statement[] = periods.map(period=>{
    const normalized: Record<string, Fact> = {};
    for (const [key,names] of Object.entries(tags)) {
      const picked = selectFact(facts,names,period,instants.has(key));
      normalized[key] = picked ? { value: picked.fact.val, status:'OBSERVED', source:`SEC us-gaap:${picked.tag} · filed ${picked.fact.filed}`, url:`https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${picked.fact.accn.replaceAll('-','')}/`, period } : { value:null,status:'UNAVAILABLE',source:'No matching annual USD fact',period };
    }
    if (normalized.grossProfit.value == null && normalized.revenue.value != null && normalized.cogs.value != null) normalized.grossProfit = { value:normalized.revenue.value-normalized.cogs.value,status:'CALCULATED',calculation:'Revenue − cost of revenue',source:'SEC annual facts',period };
    // Do not equate an absent debt component to zero. Keep the aggregate unavailable.
    const debtParts = ['debtCurrent','debtNoncurrent','commercialPaper'].map(k=>normalized[k].value);
    normalized.debt = debtParts.every(v=>v!=null) ? { value:debtParts.reduce<number>((s,v)=>s+v!,0),status:'CALCULATED',source:'SEC annual facts',calculation:'Current debt + noncurrent debt + commercial paper (excludes leases)',period } : {value:null,status:'UNAVAILABLE',source:'One or more debt components unavailable',period};
    return { period,fiscalYear:Number(period.slice(0,4)),facts:normalized };
  });
  if (!statements.length) throw new Error('No annual financials found');
  for(const k of ['revenue','grossProfit','operatingProfit','operatingCashFlow','capex','cash']) if(statements[0].facts[k]?.value==null) throw new Error(`Incomplete annual statement: ${k}`);
  return {ticker,name:raw.entityName,currency:'USD',updated:new Date().toISOString(),provider:'SEC EDGAR Company Facts',statements};
}
export class SecFinancialDataProvider implements FinancialDataProvider {
  constructor(private userAgent: string, private companies: Record<string,string>) {}
  async getCompany(ticker: string): Promise<Company> {
    const cik = this.companies[ticker]; if (!cik) throw new Error(`Unsupported ticker ${ticker}`);
    const response = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik.padStart(10,'0')}.json`, {headers:{'User-Agent':this.userAgent,Accept:'application/json'},signal:AbortSignal.timeout(30000)});
    if(!response.ok) throw new Error(`SEC returned ${response.status} for ${ticker}`);
    return normalizeCompany(await response.json(),ticker,cik);
  }
  async getHistoricalFinancials(ticker: string) { return (await this.getCompany(ticker)).statements; }
}
