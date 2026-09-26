import { defaultAssumptions, ratio, stockWeights, clamp } from './config';
import { emptyStocks } from './investment';
import { momentum } from './momentum';
import { stockKeys } from './types';
import type { Baseline, Company, State, Fact } from './types';
export function manualBaseline(): Baseline {
  const a = structuredClone(defaultAssumptions);
  const state: State = { year: 0, marketSize: 100000, demand: 10000, customers: 10000, newCustomers: 1300, churnedCustomers: 500, churnRate: .05, retention: .95, price: 1000, volume: 10000, revenue: 1e7, cogs: 5.8e6, grossProfit: 4.2e6, grossMargin: .42, opex: 2.844e6, operatingProfit: 1.356e6, depreciation: 544000, tax: 294000, interestExpense: 180000, workingCapital: 1.2e6, workingCapitalInvestment: 0, maintenanceCapex: 250000, growthCapex: 400000, operatingCashFlow: 1426000, freeCashFlow: 776000, cash: 3.8e6, debt: 3e6, equity: 8.8e6, investedCapital: 8e6, availableCapital: 3.8e6, dividends: 0, debtRepayment: 0, reinvestmentRate: .6, investment: 400000, expenseInvestment: 0, productiveCapacity: 1, productivity: 1, stocks: emptyStocks(), stockInvestment: emptyStocks(), cac: 500, ltv: 8400, roic: .127125, costOfCapital: .09, capitalTurnover: 1.25, businessMomentum: 0, momentumParts: [], runway: null, liquidityGap: 0 };
  for (const k of stockKeys) state.stocks[k] = state.investedCapital * stockWeights[k];
  const m = momentum(state, state); state.businessMomentum = m.value; state.momentumParts = m.parts;
  return { id: 'manual', name: 'Your hypothetical business', currency: 'GBP', period: 'Year 0 · manual baseline', state, assumptions: a, facts: {}, notes: ['All initial values are user assumptions.', 'Productive stocks are modeled economic assets, not accounting book values.'] };
}
export function companyBaseline(company: Company): Baseline {
  const b = manualBaseline(); const statement = company.statements[0];
  if (!statement) throw new Error('No annual financial statements available.');
  const f = statement.facts; const v = (key: string) => f[key]?.value;
  const required = ['revenue', 'grossProfit', 'operatingProfit', 'operatingCashFlow', 'capex', 'cash'];
  for (const key of required) if (v(key) == null) throw new Error(`Cannot load this business: ${key} is unavailable.`);
  const s = b.state; const a = b.assumptions;
  s.revenue = v('revenue')!; s.grossProfit = v('grossProfit')!; s.cogs = s.revenue - s.grossProfit; s.grossMargin = ratio(s.grossProfit, s.revenue);
  s.operatingProfit = v('operatingProfit')!; s.opex = s.grossProfit - s.operatingProfit;
  s.operatingCashFlow = v('operatingCashFlow')!; s.cash = v('cash')!; s.debt = v('debt') ?? 0; s.equity = v('equity') ?? 0;
  s.freeCashFlow = s.operatingCashFlow - v('capex')!; s.availableCapital = Math.max(0, s.cash);
  s.depreciation = v('depreciation') ?? s.revenue * .03; s.interestExpense = v('interestExpense') ?? 0; s.tax = v('tax') ?? 0;
  s.investedCapital = Math.max(1, s.debt + s.equity - s.cash);
  a.grossMargin = s.grossMargin; a.opexRatio = Math.max(0, (s.opex - s.depreciation) / s.revenue);
  a.taxRate = clamp(ratio(s.tax, s.operatingProfit - s.interestExpense, .25), 0, .5);
  a.interestRate = v('interestExpense') == null ? .06 : clamp(ratio(s.interestExpense, s.debt, .06), 0, .5);
  a.maintenanceRatio = v('capex')! * .6 / s.revenue;
  s.maintenanceCapex = v('capex')! * .6; s.growthCapex = v('capex')! * .4;
  s.investment = s.growthCapex;
  // Public-company customer counts are not fabricated. A 100-unit activity index is used for scenarios.
  s.customers = 100; s.demand = 100; s.marketSize = 1000; s.newCustomers = 0; s.churnedCustomers = 0; s.volume = 100; s.price = s.revenue / 100;
  a.cac = s.price * .5; s.cac = a.cac;
  s.workingCapital = s.revenue * a.workingCapitalRatio;
  a.depreciationRate = clamp(ratio(s.depreciation, Math.max(1, s.investedCapital - s.workingCapital)), 0, .5);
  s.roic = ratio(s.operatingProfit * (1 - a.taxRate), s.investedCapital);
  s.capitalTurnover = ratio(s.revenue, s.investedCapital);
  s.runway = s.freeCashFlow < 0 ? Math.max(0, s.cash) / (-s.freeCashFlow / 12) : null;
  s.ltv = s.price * s.grossMargin / a.churn;
  for (const k of stockKeys) s.stocks[k] = Math.max(s.investedCapital, s.revenue * .5) * stockWeights[k];
  const prior = company.statements[1]?.facts.revenue?.value;
  a.demandGrowth = clamp(prior ? (s.revenue - prior) / prior : .03, -.2, .25);
  const m = momentum(s, { ...s, revenue: prior ?? s.revenue }); s.businessMomentum = m.value; s.momentumParts = m.parts;
  const calculated = (value: number, calculation: string): Fact => ({ value, calculation, period: statement.period, source: company.provider, status: 'CALCULATED' });
  b.facts = { ...f, freeCashFlow: calculated(s.freeCashFlow, 'Operating cash flow − total reported CapEx'), grossMargin: calculated(s.grossMargin, 'Gross profit / revenue'), investedCapital: calculated(s.investedCapital, 'Debt + equity − cash; end-period proxy, floor 1'), roic: calculated(s.roic, 'Operating profit × (1 − effective tax-rate proxy) / end-period (debt + equity − cash). Not average operating capital.'), maintenanceCapex: { ...calculated(s.maintenanceCapex, '60% of total CapEx; user-editable split'), status: 'ESTIMATED' }, growthCapex: { ...calculated(s.growthCapex, '40% of total CapEx; user-editable split'), status: 'ESTIMATED' } };
  b.id = company.ticker; b.name = company.name; b.currency = company.currency; b.period = statement.period; b.company = company;
  b.notes = ['Customer activity starts at index 100; customer counts, churn, CAC and LTV are not reported data.', 'CapEx is split 60% maintenance / 40% growth as an estimate. Working capital, cost of capital, stocks and investment effects are assumptions.', 'Year 0 preserves reported cash flow. Forecast CFO is modeled separately; opening working capital is an assumption.', 'Reported ROIC uses end-period financing capital as a proxy. Forecast ROIC uses average modeled operating capital.', ...(v('interestExpense') == null ? ['Interest expense is unavailable; future interest uses an assumed 6% rate.'] : []), ...(v('debt') == null ? ['Debt is unavailable; scenarios assume zero opening debt.'] : [])];
  return b;
}
