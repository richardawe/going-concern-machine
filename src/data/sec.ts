import type { CompanyDataset, CompanyPeriod, Datum, SectorId } from '../ontology/types';
import { automaticClassification } from '../translation/classify';
// Translates SEC EDGAR XBRL "company facts" into a published company dataset. Only annual 10-K facts are used;
// anything that is not tagged consistently stays out of the dataset (and therefore UNKNOWN in the machine).
export interface SecFact { val: number; start?: string; end: string; filed: string; form: string; accn: string; fy?: number; fp?: string; }
export interface SecCompanyFacts { cik: number; entityName: string; facts: { 'us-gaap'?: Record<string, { units?: Record<string, SecFact[]> }> }; }
export interface SecSubmission { cik: string; name: string; sic: string; sicDescription: string; }
// `largest`: companies sometimes tag a component under the generic name, so take the biggest candidate (e.g. J&J's R&D).
type Rule = { tags: string[]; instant?: boolean; largest?: boolean };
const r = (tags: string[], instant = false, largest = false): Rule => ({ tags, instant, largest });
const industrial: Record<string, Rule> = {
 revenue: r(['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax']),
 cogs: r(['CostOfGoodsAndServicesSold', 'CostOfRevenue', 'CostOfGoodsSold', 'CostOfGoodsAndServiceExcludingDepreciationDepletionAndAmortization']),
 grossProfit: r(['GrossProfit']),
 operatingProfit: r(['OperatingIncomeLoss']),
 operatingCashFlow: r(['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations']),
 capex: r(['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets', 'PaymentsToAcquireOtherPropertyPlantAndEquipment', 'PaymentsToAcquireOilAndGasPropertyAndEquipment', 'PaymentsToAcquireOilAndGasProperty', 'PaymentsToAcquireOtherProductiveAssets', 'PaymentsForConstructionInProcess']),
 rd: r(['ResearchAndDevelopmentExpense', 'ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost'], false, true),
 dividends: r(['PaymentsOfDividends', 'PaymentsOfDividendsCommonStock']),
 tax: r(['IncomeTaxExpenseBenefit']),
 netIncome: r(['NetIncomeLoss']),
 inventoryInvestment: r(['IncreaseDecreaseInInventories']),
 cash: r(['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'], true),
 equity: r(['StockholdersEquity'], true),
 ppe: r(['PropertyPlantAndEquipmentNet'], true),
 inventory: r(['InventoryNet', 'FIFOInventoryAmount'], true),
};
const bank: Record<string, Rule> = {
 nii: r(['InterestIncomeExpenseNet']),
 fees: r(['NoninterestIncome']),
 revenue: r(['Revenues']),
 opex: r(['NoninterestExpense']),
 // Banks moved to CECL-era tags after 2021; the loan credit-loss expense is the closest consistent provision figure.
 provision: r(['ProvisionForLoanLeaseAndOtherLosses', 'ProvisionForLoanAndLeaseLosses', 'ProvisionForCreditLosses', 'ProvisionForLoanLossesExpensed', 'FinancingReceivableExcludingAccruedInterestCreditLossExpenseReversal']),
 tax: r(['IncomeTaxExpenseBenefit']),
 netIncome: r(['NetIncomeLoss']),
 deposits: r(['Deposits'], true),
 loans: r(['LoansAndLeasesReceivableNetReportedAmount', 'LoansAndLeasesReceivableGrossCarryingAmount'], true),
 equity: r(['StockholdersEquity'], true),
};
export const secRules = (sector: SectorId) => sector === 'banking' ? bank : industrial;
// A fallback tag measures something slightly different from the standard one; the difference is stated on the figure.
const fallbackNotes: Record<string, string> = {
 FIFOInventoryAmount: 'Inventory at FIFO cost, before the LIFO reserve the company deducts on its balance sheet, so it is higher than the carrying amount.',
 CostOfGoodsAndServiceExcludingDepreciationDepletionAndAmortization: 'Cost of sales excluding depreciation and amortization, which the company reports as a separate line. Gross profit derived from it is higher than a conventional gross profit.',
 CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents: 'Includes restricted cash: the company does not report cash and cash equivalents separately, so this overstates freely available cash.',
 NetCashProvidedByUsedInOperatingActivitiesContinuingOperations: 'Continuing operations only: cash flow from discontinued operations is excluded.',
 PaymentsToAcquireProductiveAssets: 'Reported as payments for productive assets, which can include intangible assets as well as property and equipment.',
 PaymentsToAcquireOtherPropertyPlantAndEquipment: 'Reported as payments for (other) property, plant and equipment; the standard CapEx line is not tagged.',
 PaymentsToAcquireOilAndGasPropertyAndEquipment: 'Reported as payments for oil and gas property and equipment, the company’s main capital spending line.',
 PaymentsToAcquireOilAndGasProperty: 'Reported as payments for oil and gas property, the company’s main capital spending line.',
 PaymentsToAcquireOtherProductiveAssets: 'Reported as payments for other productive assets; the standard CapEx line is not tagged.',
 PaymentsForConstructionInProcess: 'Reported as payments for construction in progress, the company’s main capital spending line.',
};
// Used only to estimate operating profit when a company reports no operating-income line.
const totalCosts = r(['CostsAndExpenses']);
const pretax = r(['IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest', 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments']);
/** Industries whose economics need their own module; they are not published on the general core. */
export function unsupportedIndustry(sic: number): string | null {
 if (sic >= 6310 && sic <= 6411) return 'insurance needs its own sector module (premiums, claims, reserves)';
 if (sic === 6798) return 'real estate investment trusts need their own sector module (property, rents, FFO)';
 return null;
}
const annualForms = new Set(['10-K', '10-K/A']);
const days = (f: SecFact) => f.start ? (Date.parse(f.end) - Date.parse(f.start)) / 864e5 : 0;
const isAnnual = (f: SecFact) => annualForms.has(f.form) && Number.isFinite(f.val) && days(f) > 330 && days(f) < 380;
const usd = (facts: SecCompanyFacts, tag: string) => facts.facts['us-gaap']?.[tag]?.units?.USD ?? [];
/** 52/53-week years that end in the first days of January belong to the previous fiscal year. */
export const fiscalYearOf = (end: string) => { const [y, m, d] = end.split('-').map(Number); return m === 1 && d <= 7 ? y - 1 : y; };
export class DataQualityError extends Error { constructor(public ticker: string, public reasons: string[]) { super(`${ticker}: ${reasons.join('; ')}`); } }

function pick(facts: SecCompanyFacts, rule: Rule, end: string, cik: number): Datum | undefined {
 if (rule.largest) { const all = rule.tags.map(t => pick(facts, { tags: [t], instant: rule.instant }, end, cik)).filter((d): d is Datum => !!d); return all.sort((a, b) => b.value! - a.value!)[0]; }
 for (const tag of rule.tags) {
  const rows = usd(facts, tag).filter(f => annualForms.has(f.form) && f.end === end && Number.isFinite(f.val) && (rule.instant ? !f.start : isAnnual(f)));
  rows.sort((a, b) => b.filed.localeCompare(a.filed));
  const f = rows[0];
  if (f) return { value: f.val, unit: 'USD', status: 'OBSERVED', period: end, source: `SEC XBRL us-gaap:${tag} · ${f.form} filed ${f.filed}`, url: `https://www.sec.gov/Archives/edgar/data/${cik}/${f.accn.replace(/-/g, '')}/`, ...(fallbackNotes[tag] ? { calculation: fallbackNotes[tag] } : {}) };
 }
}
export function secToDataset(ticker: string, facts: SecCompanyFacts, sub: SecSubmission, retrieved: string, periods = 3): CompanyDataset {
 const unsupported = unsupportedIndustry(Number(sub.sic));
 if (unsupported) throw new DataQualityError(ticker, [`${sub.sicDescription}: ${unsupported}`]);
 const classification = automaticClassification(sub.sic, sub.sicDescription, String(Number(sub.cik)));
 const rules = secRules(classification.sector), anchor = classification.sector === 'banking' ? rules.nii : rules.revenue;
 const ends = [...new Set(anchor.tags.flatMap(t => usd(facts, t).filter(isAnnual).map(f => f.end)))].sort().reverse().slice(0, periods);
 if (!ends.length) throw new DataQualityError(ticker, ['no annual 10-K facts in US GAAP (foreign or IFRS filers are not supported yet)']);
 const out: CompanyPeriod[] = ends.map(end => {
  const row: Record<string, Datum> = {};
  for (const [id, rule] of Object.entries(rules)) { const d = pick(facts, rule, end, facts.cik); if (d) row[id] = d; }
  if (classification.sector !== 'banking' && !row.operatingProfit && row.revenue) { const est = estimateOperatingProfit(facts, end, row.revenue); if (est) row.operatingProfit = est; }
  if (classification.sector === 'banking' && !row.revenue && row.nii && row.fees) row.revenue = { value: row.nii.value! + row.fees.value!, unit: 'USD', status: 'CALCULATED', period: end, source: 'SEC XBRL annual facts', calculation: 'Net interest income + noninterest income', url: row.nii.url };
  return { period: end, fiscalYear: fiscalYearOf(end), facts: row };
 });
 const reasons = checkDataset(out, classification.sector);
 if (reasons.length) throw new DataQualityError(ticker, reasons);
 return { schemaVersion: 2, ticker, name: facts.entityName, retrieved, provider: 'SEC EDGAR XBRL company facts · automatic translation', periods: out, classification };
}
/** No operating-income line: revenue − total costs and expenses, marked ESTIMATED with its formula. */
function estimateOperatingProfit(facts: SecCompanyFacts, end: string, revenue: Datum): Datum | undefined {
 const note = 'No operating income is reported, so this may include non-operating items such as interest, investment gains or other income.';
 const costs = pick(facts, totalCosts, end, facts.cik);
 if (costs) return { value: revenue.value! - costs.value!, unit: 'USD', status: 'ESTIMATED', period: end, inputs: ['revenue'], url: costs.url, source: `Derived from ${revenue.source.split(' · ')[0]} and ${costs.source}`, calculation: `Revenue − total costs and expenses (us-gaap:CostsAndExpenses). ${note}` };
 const before = pick(facts, pretax, end, facts.cik);
 if (before) return { value: before.value!, unit: 'USD', status: 'ESTIMATED', period: end, inputs: ['revenue'], url: before.url, source: `Derived from ${before.source}`, calculation: `Revenue − total costs and expenses, taken as reported pretax income from continuing operations (revenue less all costs and expenses). ${note}` };
}
/** Publication gates: identities must hold and the latest period must carry the facts the core machine needs. */
export function checkDataset(periods: CompanyPeriod[], sector: SectorId): string[] {
 const reasons: string[] = [], v = (p: CompanyPeriod, k: string) => p.facts[k]?.value ?? null;
 const years = new Set<number>();
 for (const p of periods) {
  if (years.has(p.fiscalYear)) reasons.push(`two annual periods map to fiscal year ${p.fiscalYear}`);
  years.add(p.fiscalYear);
  const rev = v(p, 'revenue'), cogs = v(p, 'cogs'), gp = v(p, 'grossProfit') ?? (rev != null && cogs != null ? rev - cogs : null), op = v(p, 'operatingProfit');
  if (rev != null && rev <= 0) reasons.push(`${p.period}: revenue is not positive`);
  if (rev != null && cogs != null && v(p, 'grossProfit') != null && Math.abs(rev - cogs - v(p, 'grossProfit')!) > .005 * rev) reasons.push(`${p.period}: gross profit ≠ revenue − cost of revenue`);
  if (rev != null && op != null && op > rev) reasons.push(`${p.period}: operating profit exceeds revenue`);
  if (gp != null && op != null && op > gp * 1.005) reasons.push(`${p.period}: operating profit exceeds gross profit (would imply negative operating costs)`);
  for (const k of ['capex', 'cash', 'inventory', 'deposits', 'loans']) { const x = v(p, k); if (x != null && x < 0) reasons.push(`${p.period}: ${k} is negative`); }
  if (sector === 'banking') { const n = v(p, 'nii'), f = v(p, 'fees'); if (rev != null && n != null && f != null && Math.abs(n + f - rev) > .01 * rev) reasons.push(`${p.period}: revenue ≠ net interest income + noninterest income`); }
 }
 const latest = periods[0], need = sector === 'banking' ? ['revenue', 'nii', 'fees', 'opex', 'provision', 'netIncome'] : ['revenue', 'operatingProfit', 'operatingCashFlow', 'capex', 'cash'];
 for (const k of need) if (v(latest, k) == null) reasons.push(`latest period ${latest.period} lacks ${k}`);
 return reasons;
}
/** Keeps only what the translation reads, so a saved fixture stays small. */
export function trimFacts(facts: SecCompanyFacts, sector: SectorId): SecCompanyFacts {
 const keep = new Set(Object.values(secRules(sector)).flatMap(r => r.tags)), g = facts.facts['us-gaap'] ?? {};
 return { cik: facts.cik, entityName: facts.entityName, facts: { 'us-gaap': Object.fromEntries(Object.entries(g).filter(([t]) => keep.has(t)).map(([t, v]) => [t, { units: { USD: (v.units?.USD ?? []).filter(f => annualForms.has(f.form)) } }])) } };
}
