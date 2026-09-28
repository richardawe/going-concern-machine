import { companyBaseline } from '../model/baseline';
import { clamp } from '../model/config';
import type { Company, Fact } from '../model/types';
import type { CompanyDataset } from '../ontology/types';
import { archetypeLabels, type Archetype, type ArchetypeId, type RatioKey } from './archetypes';
import { uniform } from './random';
import type { CaseDef, GameParams, StartCompany } from './types';

export const gameParams: Record<ArchetypeId, GameParams> = {
  software: { avgPay: 160000, laborShare: .6, elasticity: .8, baseAttrition: .13, churn: .08 },
  hardware: { avgPay: 120000, laborShare: .35, elasticity: 1.2, baseAttrition: .1, churn: .1 },
  health: { avgPay: 130000, laborShare: .35, elasticity: .5, baseAttrition: .1, churn: .06 },
  consumer: { avgPay: 70000, laborShare: .25, elasticity: 1.6, baseAttrition: .12, churn: .12 },
  retail: { avgPay: 38000, laborShare: .45, elasticity: 2, baseAttrition: .3, churn: .15 },
  industrial: { avgPay: 80000, laborShare: .35, elasticity: 1.1, baseAttrition: .1, churn: .08 },
  energy: { avgPay: 110000, laborShare: .2, elasticity: .4, baseAttrition: .08, churn: .04 },
  services: { avgPay: 90000, laborShare: .55, elasticity: 1, baseAttrition: .14, churn: .1 },
};
/** Used when an archetype has too few filers reporting a ratio. */
const fallback: Record<RatioKey, number> = { grossMargin: .4, operatingMargin: .1, capexRatio: .04, rdRatio: .02, inventoryDays: 45, revenueGrowth: .05, cashRatio: .1, payout: .3, taxRate: .21 };

const first = ['Kestrel', 'Larkspur', 'Halden', 'Brightwater', 'Corvane', 'Ashgrove', 'Pellam', 'Quillon', 'Tamsin', 'Oakhollow', 'Veridan', 'Marlow', 'Stonecrop', 'Wrenfield', 'Calloway', 'Northwind'];
const last: Record<ArchetypeId, string[]> = {
  software: ['Cloudworks', 'Software', 'Labs', 'Platforms'], hardware: ['Devices', 'Microsystems', 'Instruments', 'Circuits'],
  health: ['Therapeutics', 'Medical', 'Biosciences', 'Health'], consumer: ['Brands', 'Foods', 'Goods Co.', 'Home'],
  retail: ['Stores', 'Market', 'Outfitters', 'Supply'], industrial: ['Industries', 'Engineering', 'Works', 'Manufacturing'],
  energy: ['Energy', 'Power', 'Resources', 'Utilities'], services: ['Partners', 'Services', 'Group', 'Solutions'],
};
const pick = <T,>(list: T[], ...key: (string | number)[]) => list[Math.floor(uniform(...key) * list.length)];
const fact = (value: number, period: string, status: Fact['status'], source: string, calculation?: string): Fact => ({ value, status, source, period, calculation });

/** Shared by fictional and real companies: turns opening facts into an engine baseline plus game settings. */
function assemble(company: Company, archetype: ArchetypeId, params: GameParams, opts: { growth: number; inventoryDays: number; payout: number }) {
  const b = companyBaseline(company), a = b.assumptions, s = b.state;
  a.churn = params.churn; s.churnRate = params.churn; s.retention = 1 - params.churn;
  a.demandGrowth = clamp(opts.growth, -.05, .15); a.competition = .02; a.priceGrowth = 0;
  a.workingCapitalRatio = clamp(opts.inventoryDays / 365 * (1 - s.grossMargin) + .04, .02, .4); s.workingCapital = s.revenue * a.workingCapitalRatio;
  // Operating capital = fixed assets + working capital. Financing-side capital can sit below working capital (e.g. a
  // retailer funded by suppliers), which would imply absurd decay rates, so fixed assets are floored at ten years of
  // depreciation and the decay rate kept within 3–20% a year.
  const fixed = Math.max(s.investedCapital - s.workingCapital, s.depreciation / .1);
  s.investedCapital = fixed + s.workingCapital; a.depreciationRate = clamp(s.depreciation / fixed, .03, .2);
  s.roic = s.operatingProfit * (1 - a.taxRate) / s.investedCapital; s.capitalTurnover = s.revenue / s.investedCapital;
  a.allocations.dividends = Math.round(clamp(opts.payout, 0, 1) * 60); a.reinvestmentRate = .5;
  a.allocations.rd = archetype === 'software' || archetype === 'health' || archetype === 'hardware' ? 60 : 30;
  b.currency = 'USD';
  return b;
}

/** A fictional company drawn inside the archetype's interquartile range, rescaled to a playable size. */
export function fictionalCompany(archetype: Archetype, seed: number): StartCompany {
  const id = archetype.id, params = gameParams[id];
  const draw = (k: RatioKey) => { const q = archetype.ratios[k], u = 2 * uniform(seed, id, k) - 1; if (!q) return fallback[k]; return q.median + .9 * u * (u < 0 ? q.median - q.p25 : q.p75 - q.median); };
  const revenue = +Number(Math.exp(Math.log(8e7) + uniform(seed, id, 'size') * Math.log(20))).toPrecision(3);
  const gm = clamp(draw('grossMargin'), .15, .9), om = clamp(draw('operatingMargin'), .03, gm - .08);
  const capex = clamp(draw('capexRatio'), .01, .35), growth = draw('revenueGrowth'), cash = clamp(draw('cashRatio'), .04, .4);
  const tax = clamp(draw('taxRate'), .12, .28), debtRatio = .1 + uniform(seed, id, 'debt') * .35;
  const period = 'Year 0', src = `Calibrated: ${archetype.label} quartiles of ${archetype.n} SEC filers`, game = 'Game assumption';
  const opProfit = revenue * om, depreciation = revenue * Math.max(capex * .8, .015), debt = revenue * debtRatio, interest = debt * .06;
  const taxPaid = Math.max(0, opProfit - interest) * tax;
  const facts: Record<string, Fact> = {
    revenue: fact(revenue, period, 'ESTIMATED', game, 'Random draw between $80m and $1.6bn'),
    grossProfit: fact(revenue * gm, period, 'ESTIMATED', src, 'Revenue × gross margin drawn within p25–p75'),
    operatingProfit: fact(opProfit, period, 'ESTIMATED', src, 'Revenue × operating margin drawn within p25–p75'),
    capex: fact(revenue * capex, period, 'ESTIMATED', src),
    depreciation: fact(depreciation, period, 'ESTIMATED', game, 'Max(80% of CapEx, 1.5% of revenue)'),
    cash: fact(revenue * cash, period, 'ESTIMATED', src),
    debt: fact(debt, period, 'ESTIMATED', game, '10–45% of revenue'),
    interestExpense: fact(interest, period, 'ESTIMATED', game, 'Debt × 6%'),
    tax: fact(taxPaid, period, 'ESTIMATED', src),
    operatingCashFlow: fact(opProfit - taxPaid - interest + depreciation, period, 'ESTIMATED', game, 'Operating profit − tax − interest + depreciation'),
    equity: fact(revenue * (.5 + uniform(seed, id, 'equity') * .4), period, 'ESTIMATED', game),
  };
  const name = `${pick(first, seed, id, 'first')} ${pick(last[id], seed, id, 'last')}`;
  const company: Company = { ticker: name, name, currency: 'USD', updated: '', provider: src, statements: [{ period, fiscalYear: 0, facts }, { period: 'Year −1', fiscalYear: -1, facts: { revenue: fact(revenue / (1 + growth), 'Year −1', 'ESTIMATED', src) } }] };
  const baseline = assemble(company, id, params, { growth, inventoryDays: draw('inventoryDays'), payout: draw('payout') });
  baseline.id = `fictional:${id}:${seed}`; baseline.period = 'Year 0 · fictional';
  baseline.notes = ['This is a fictional company. Its opening ratios are drawn inside the interquartile range of real SEC filers in the same industry group; it does not represent any real business.', 'Customer activity is an index starting at 100. Headcount, pay, morale and price sensitivity are game assumptions.'];
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`, range = (k: RatioKey) => { const q = archetype.ratios[k]; return q ? `p25–p75 ${pct(q.p25)}–${pct(q.p75)} (n=${q.n})` : 'no quartile; game default'; };
  return { id: baseline.id, name, kind: 'fictional', archetype: id, tagline: `${archetypeLabels[id]} · fictional`, baseline, params, provenance: [
    { label: 'Gross margin', value: pct(gm), basis: range('grossMargin') }, { label: 'Operating margin', value: pct(om), basis: range('operatingMargin') },
    { label: 'CapEx / revenue', value: pct(capex), basis: range('capexRatio') }, { label: 'Revenue growth', value: pct(growth), basis: range('revenueGrowth') },
    { label: 'Cash / revenue', value: pct(cash), basis: range('cashRatio') }, { label: 'Debt, pay, morale, price sensitivity', value: '—', basis: 'Game assumptions' },
  ] };
}

export const realCompanies: Record<string, { archetype: ArchetypeId; note: string }> = {
  MSFT: { archetype: 'software', note: 'Reported FY figures from the verified MSFT dataset; the future is entirely hypothetical.' },
  WMT: { archetype: 'retail', note: 'Reported FY figures from the verified WMT dataset. Tax and debt are not in the dataset, so a 24% tax rate and zero debt are game assumptions.' },
  JPM: { archetype: 'services', note: 'A bank does not fit this general business engine. Credit-loss provisions are treated as the cost of delivering revenue, net income stands in for operating cash flow, and CapEx and cash are game assumptions. Deposits, loans and regulatory capital are not modelled.' },
};

/** Opens a CEO game on a real, verified company: reported opening figures, a hypothetical future. */
export function realCompany(d: CompanyDataset): StartCompany {
  const meta = realCompanies[d.ticker]; if (!meta) throw new Error(`${d.ticker} is not available in CEO mode.`);
  const [now, prior] = d.periods, v = (k: string) => now.facts[k]?.value ?? null, period = now.period;
  const reported = (k: string) => { const f = now.facts[k]; return fact(f.value!, period, f.status === 'OBSERVED' ? 'OBSERVED' : 'CALCULATED', f.source); };
  const game = (value: number, calculation: string) => fact(value, period, 'ESTIMATED', 'Game assumption', calculation);
  const facts: Record<string, Fact> = {}, provenance: StartCompany['provenance'] = [];
  for (const k of ['revenue', 'grossProfit', 'operatingProfit', 'operatingCashFlow', 'capex', 'cash', 'debt', 'equity', 'tax']) if (v(k) != null) facts[k] = reported(k);
  const revenue = v('revenue')!;
  if (!facts.grossProfit && v('cogs') != null) facts.grossProfit = fact(revenue - v('cogs')!, period, 'CALCULATED', 'Revenue − cost of sales');
  if (d.ticker === 'WMT') { facts.tax = game(v('operatingProfit')! * .24, 'Operating profit × 24%'); facts.debt = game(0, 'Debt not in dataset'); }
  if (d.ticker === 'JPM') {
    facts.grossProfit = fact(revenue - v('provision')!, period, 'CALCULATED', 'Revenue − credit-loss provisions (treated as cost of delivery)');
    facts.operatingProfit = fact(revenue - v('provision')! - v('opex')!, period, 'CALCULATED', 'Revenue − provisions − noninterest expense');
    facts.operatingCashFlow = game(v('netIncome')!, 'Net income as a cash proxy');
    facts.capex = game(revenue * .03, '3% of revenue'); facts.cash = game(revenue * .15, '15% of revenue'); facts.debt = game(0, 'Bank funding not modelled');
  }
  const growth = prior?.facts.revenue?.value ? revenue / prior.facts.revenue.value - 1 : .03;
  const company: Company = { ticker: d.ticker, name: d.name, currency: 'USD', updated: d.retrieved, provider: d.provider, statements: [{ period, fiscalYear: now.fiscalYear, facts }, ...(prior?.facts.revenue?.value ? [{ period: prior.period, fiscalYear: prior.fiscalYear, facts: { revenue: fact(prior.facts.revenue.value, prior.period, 'OBSERVED', prior.facts.revenue.source) } }] : [])] };
  const params = gameParams[meta.archetype];
  const inventoryDays = v('inventory') != null && v('cogs') ? v('inventory')! / v('cogs')! * 365 : 20;
  const payout = v('dividends') != null && v('netIncome') ? v('dividends')! / v('netIncome')! : v('dividends') != null && v('operatingProfit') ? v('dividends')! / (v('operatingProfit')! * .8) : .3;
  const baseline = assemble(company, meta.archetype, params, { growth, inventoryDays, payout });
  baseline.id = `real:${d.ticker}`; baseline.name = d.name; baseline.period = `FY${now.fiscalYear} reported · ${period}`;
  baseline.notes = [meta.note, 'Customer activity is an index starting at 100. Headcount, pay, morale and price sensitivity are game assumptions, not company disclosures. This is a training game, not an analysis or a forecast of the company.'];
  for (const [k, f] of Object.entries(facts)) provenance.push({ label: k, value: `$${(f.value! / 1e9).toFixed(1)}bn`, basis: f.status === 'OBSERVED' ? `Reported · ${f.source}` : `${f.status === 'CALCULATED' ? 'Calculated' : 'Game assumption'} · ${f.calculation ?? f.source}` });
  return { id: baseline.id, name: d.name, kind: 'real', archetype: meta.archetype, tagline: `${d.ticker} · reported start, hypothetical future`, baseline, params, provenance };
}

/** Applies a case's starting situation (e.g. a stretched balance sheet) to whichever company the player chose. */
export function prepareStart(start: StartCompany, setup: CaseDef['setup']): StartCompany {
  if (!setup) return start;
  const out = structuredClone(start), s = out.baseline.state, a = out.baseline.assumptions;
  if (setup.cashToRevenue != null) { s.cash = s.revenue * setup.cashToRevenue; s.availableCapital = s.cash; }
  if (setup.debtToOperatingProfit != null) { s.debt = Math.max(0, s.operatingProfit) * setup.debtToOperatingProfit; s.interestExpense = s.debt * a.interestRate; }
  s.runway = s.freeCashFlow < 0 ? Math.max(0, s.cash) / (-s.freeCashFlow / 12) : null;
  out.baseline.notes = [`Case setup: ${setup.note}`, ...out.baseline.notes];
  out.provenance = [{ label: 'Case setup', value: [setup.cashToRevenue != null && `cash ${(setup.cashToRevenue * 100).toFixed(0)}% of revenue`, setup.debtToOperatingProfit != null && `debt ${setup.debtToOperatingProfit}× operating profit`].filter(Boolean).join(', '), basis: `Scenario premise, not company data: ${setup.note}` }, ...out.provenance];
  return out;
}
