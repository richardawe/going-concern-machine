import type { SectorId } from '../ontology/types';
// The equation registry IS the forecast model. The causal graph, the simulator and the change explainer all read
// from these rows, so what the machine shows is exactly what is computed.
// Input references: 'x' = same-year node, 'prior:x' = previous year, 'opening:x' = reported opening value,
// 'lagged:x' = value `investmentLag` years earlier (0 before year 1), 'assume:x' = adopted lever,
// 'shock:x' = cumulative shock multiplier, 'year' = years since the reported period.
export type Ref = string;
export interface Equation { target: string; formula: string; inputs: Ref[]; kind: 'accounting' | 'hypothesis'; initial?: number; absorbs?: string; f: (x: Record<Ref, number>) => number | null; }
const eq = (target: string, formula: string, inputs: Ref[], f: Equation['f'], kind: Equation['kind'] = 'accounting', initial?: number, absorbs?: string): Equation => ({ target, formula, inputs, f, kind, initial, absorbs });
const pct = (v: number) => v / 100;
const clip = (v: number) => Math.max(-1, Math.min(1, v));
export const refNode = (ref: Ref) => ref.includes(':') ? ref.split(':')[0] === 'assume' || ref.split(':')[0] === 'shock' ? null : ref.split(':')[1] : ref === 'year' ? null : ref;
export const refKind = (ref: Ref) => ref.includes(':') ? ref.split(':')[0] as 'prior' | 'opening' | 'lagged' | 'assume' | 'shock' : ref === 'year' ? 'year' : 'now';

export function momentumParts(bank: boolean, x: Record<Ref, number>) {
 const earnings = bank ? 'netIncome' : 'operatingProfit';
 return [
  { label: 'Revenue growth', contribution: clip(x.revenueGrowth / .2) * 40, formula: 'Revenue growth / 20%, clipped ±1 × 40' },
  { label: 'Profit change', contribution: clip((x[earnings] - x[`prior:${earnings}`]) / Math.abs(x[`prior:${earnings}`]) / .2) * 40, formula: 'Profit growth / 20%, clipped ±1 × 40' },
  bank ? { label: 'Funding mix change', contribution: clip((x['prior:loans'] / x['prior:deposits'] - x.loanDeposit) / .1) * 20, formula: 'Improvement in loans/deposits / 10pp, clipped ±1 × 20' }
   : { label: 'Cash movement', contribution: clip((x.cash - x['prior:cash']) / x['opening:revenue'] / .1) * 20, formula: 'Cash change / opening revenue / 10%, clipped ±1 × 20' },
 ];
}
const momentum = (bank: boolean) => {
 const earnings = bank ? 'netIncome' : 'operatingProfit';
 return eq('momentum', 'Scenario-only indicator: revenue growth (40%) + profit change (40%) + ' + (bank ? 'funding mix' : 'cash') + ' change (20%). Not a complete health score.',
  bank ? ['revenueGrowth', earnings, `prior:${earnings}`, 'loanDeposit', 'prior:loans', 'prior:deposits'] : ['revenueGrowth', earnings, `prior:${earnings}`, 'cash', 'prior:cash', 'opening:revenue'],
  x => Math.abs(x[`prior:${earnings}`]) > 1 ? momentumParts(bank, x).reduce((s, p) => s + p.contribution, 0) : null, 'hypothesis', undefined, 'each signal is clipped at ±1, so a signal already at its limit cannot move further');
};

const industrial = (retail: boolean): Equation[] => [
 eq('investmentLift', 'Prior lift + additional CapEx intensity from `investment lag` years earlier × adopted investment response', ['prior:investmentLift', 'lagged:capexExcess', 'assume:investmentResponse'], x => x['prior:investmentLift'] + x['lagged:capexExcess'] * pct(x['assume:investmentResponse']), 'hypothesis', 0, 'additional investment only lifts revenue when the adopted investment response is above zero'),
 eq('revenue', 'Opening revenue × (1 + growth)^year × demand shock × (1 + investment lift)', ['opening:revenue', 'assume:growth', 'year', 'shock:demand', 'investmentLift'], x => x['opening:revenue'] * Math.pow(1 + pct(x['assume:growth']), x.year) * x['shock:demand'] * (1 + x.investmentLift), 'hypothesis'),
 eq('cogs', 'Revenue × (1 − (opening gross margin + margin change)) × cost shock', ['revenue', 'opening:grossProfit', 'opening:revenue', 'assume:marginChange', 'shock:cost'], x => x.revenue * (1 - Math.max(-.5, Math.min(.95, x['opening:grossProfit'] / x['opening:revenue'] + pct(x['assume:marginChange'])))) * x['shock:cost'], 'hypothesis'),
 eq('grossProfit', 'Revenue − cost to deliver', ['revenue', 'cogs'], x => x.revenue - x.cogs),
 eq('grossMargin', 'Gross profit / revenue', ['grossProfit', 'revenue'], x => x.grossProfit / x.revenue),
 eq('opex', 'Opening operating expense × (1 + cost growth)^year', ['opening:opex', 'assume:opexGrowth', 'year'], x => x['opening:opex'] * Math.pow(1 + pct(x['assume:opexGrowth']), x.year), 'hypothesis'),
 eq('operatingProfit', 'Gross profit − operating expense', ['grossProfit', 'opex'], x => x.grossProfit - x.opex),
 eq('operatingMargin', 'Operating profit / revenue', ['operatingProfit', 'revenue'], x => x.operatingProfit / x.revenue),
 ...(retail ? [
  eq('inventory', 'Cost of sales × target inventory days / 365', ['cogs', 'assume:inventoryDays'], x => x.cogs * x['assume:inventoryDays'] / 365),
  eq('inventoryTurns', 'Cost of sales / mean of prior and closing inventory', ['cogs', 'prior:inventory', 'inventory'], x => x.cogs / ((x['prior:inventory'] + x.inventory) / 2)),
  eq('inventoryInvestment', 'Closing inventory − prior inventory (cash tied up in stock)', ['inventory', 'prior:inventory'], x => x.inventory - x['prior:inventory']),
  eq('operatingCashFlow', 'Opening CFO + (operating profit − opening operating profit) × cash conversion + opening inventory investment − scenario inventory investment', ['opening:operatingCashFlow', 'operatingProfit', 'opening:operatingProfit', 'assume:cashConversion', 'opening:inventoryInvestment', 'inventoryInvestment'], x => x['opening:operatingCashFlow'] + (x.operatingProfit - x['opening:operatingProfit']) * pct(x['assume:cashConversion']) + x['opening:inventoryInvestment'] - x.inventoryInvestment, 'hypothesis'),
 ] : [
  eq('operatingCashFlow', 'Opening CFO + (operating profit − opening operating profit) × cash conversion', ['opening:operatingCashFlow', 'operatingProfit', 'opening:operatingProfit', 'assume:cashConversion'], x => x['opening:operatingCashFlow'] + (x.operatingProfit - x['opening:operatingProfit']) * pct(x['assume:cashConversion']), 'hypothesis'),
 ]),
 eq('capex', 'Revenue × CapEx / revenue', ['revenue', 'assume:capexRatio'], x => x.revenue * pct(x['assume:capexRatio'])),
 eq('capexExcess', 'Max(0, CapEx − opening CapEx) / opening revenue', ['capex', 'opening:capex', 'opening:revenue'], x => Math.max(0, x.capex - x['opening:capex']) / x['opening:revenue'], 'accounting', undefined, 'CapEx stays at or below the reported opening level in both runs'),
 eq('freeCashFlow', 'Operating cash flow − CapEx', ['operatingCashFlow', 'capex'], x => x.operatingCashFlow - x.capex),
 eq('distributions', 'Min(positive FCF, positive cash before payout) × distribution share', ['freeCashFlow', 'prior:cash', 'assume:distribution'], x => Math.min(Math.max(0, x.freeCashFlow), Math.max(0, x['prior:cash'] + x.freeCashFlow)) * pct(x['assume:distribution']), 'accounting', undefined, 'payouts are limited to positive free cash flow and available cash'),
 eq('cash', 'Prior cash + FCF − distributions; no invented debt financing', ['prior:cash', 'freeCashFlow', 'distributions'], x => x['prior:cash'] + x.freeCashFlow - x.distributions),
 eq('capital', 'Max(0, closing cash)', ['cash'], x => Math.max(0, x.cash), 'accounting', undefined, 'closing cash is negative in both runs, so available capital stays at zero'),
 eq('fundingGap', 'Max(0, − closing cash); an unfunded requirement', ['cash'], x => Math.max(0, -x.cash), 'accounting', undefined, 'closing cash stays positive in both runs, so no unfunded requirement appears'),
 eq('revenueGrowth', '(Revenue − prior revenue) / prior revenue', ['revenue', 'prior:revenue'], x => (x.revenue - x['prior:revenue']) / Math.abs(x['prior:revenue'])),
 momentum(false),
];

const banking: Equation[] = [
 eq('loans', 'Opening loans × (1 + loan growth)^year × demand shock', ['opening:loans', 'assume:loanGrowth', 'year', 'shock:demand'], x => x['opening:loans'] * Math.pow(1 + pct(x['assume:loanGrowth']), x.year) * x['shock:demand'], 'hypothesis'),
 eq('deposits', 'Opening deposits × (1 + deposit growth)^year', ['opening:deposits', 'assume:depositGrowth', 'year'], x => x['opening:deposits'] * Math.pow(1 + pct(x['assume:depositGrowth']), x.year), 'hypothesis'),
 eq('nii', 'Opening NII × mean(prior, closing loans) / opening loans × (1 + NII sensitivity)', ['opening:nii', 'prior:loans', 'loans', 'opening:loans', 'assume:niiChange'], x => x['opening:nii'] * (x['prior:loans'] + x.loans) / 2 / x['opening:loans'] * (1 + pct(x['assume:niiChange'])), 'hypothesis'),
 eq('fees', 'Opening noninterest revenue × (1 + fee growth)^year', ['opening:fees', 'assume:feeGrowth', 'year'], x => x['opening:fees'] * Math.pow(1 + pct(x['assume:feeGrowth']), x.year), 'hypothesis'),
 eq('revenue', 'Net interest income + noninterest revenue', ['nii', 'fees'], x => x.nii + x.fees),
 eq('provision', 'Mean(prior, closing loans) × provision rate × credit shock', ['prior:loans', 'loans', 'assume:creditCost', 'shock:credit'], x => (x['prior:loans'] + x.loans) / 2 * pct(x['assume:creditCost']) * x['shock:credit'], 'hypothesis'),
 eq('opex', 'Opening noninterest expense × (1 + cost growth)^year × cost shock', ['opening:opex', 'assume:opexGrowth', 'year', 'shock:cost'], x => x['opening:opex'] * Math.pow(1 + pct(x['assume:opexGrowth']), x.year) * x['shock:cost'], 'hypothesis'),
 eq('pretaxIncome', 'Revenue − noninterest expense − credit provision', ['revenue', 'opex', 'provision'], x => x.revenue - x.opex - x.provision),
 eq('tax', 'Max(0, pretax income) × tax rate', ['pretaxIncome', 'assume:taxRate'], x => Math.max(0, x.pretaxIncome) * pct(x['assume:taxRate']), 'accounting', undefined, 'no tax is charged on a pretax loss'),
 eq('netIncome', 'Pretax income − tax', ['pretaxIncome', 'tax'], x => x.pretaxIncome - x.tax),
 eq('retainedProfit', 'Net income − positive net income × payout', ['netIncome', 'assume:payout'], x => x.netIncome - Math.max(0, x.netIncome) * pct(x['assume:payout'])),
 eq('equity', 'Prior book equity + retained profit; no OCI, issuance or regulatory adjustments', ['prior:equity', 'retainedProfit'], x => x['prior:equity'] + x.retainedProfit),
 eq('loanDeposit', 'Closing loans / closing deposits', ['loans', 'deposits'], x => x.loans / x.deposits),
 eq('revenueGrowth', '(Revenue − prior revenue) / prior revenue', ['revenue', 'prior:revenue'], x => (x.revenue - x['prior:revenue']) / Math.abs(x['prior:revenue'])),
 momentum(true),
];

export const equations: Record<SectorId, Equation[]> = { 'software-cloud': industrial(false), retail: industrial(true), banking };
export const equationFor = (sector: SectorId, target: string) => equations[sector].find(e => e.target === target);
