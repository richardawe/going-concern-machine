import { clamp, ratio, stockWeights } from './config';
import { allocateInvestment, emptyStocks } from './investment';
import { momentum } from './momentum';
import { stockKeys } from './types';
import type { Assumptions, Baseline, Scenario, State, Stocks, Shock } from './types';

export const shockLabels: Record<Shock['kind'], string> = { demand: 'Demand −20%', interest: 'Interest +300 bps', churn: 'Churn doubles', cogs: 'COGS +15%', cac: 'CAC +40%', recession: 'Recession', regulation: 'Operating costs +10%', productivity: 'Productivity +20%', price: 'Price +10%' };
function withShocks(base: Assumptions, shocks: Shock[], year: number) {
  const a = structuredClone(base);
  let demandFactor = 1, priceFactor = 1, productivityFactor = 1;
  for (const shock of shocks.filter(s => s.year <= year)) {
    switch (shock.kind) {
      case 'demand': demandFactor *= .8; break;
      case 'interest': a.interestRate += .03; break;
      case 'churn': a.churn = Math.min(.95, a.churn * 2); break;
      case 'cogs': a.grossMargin = 1 - (1 - a.grossMargin) * 1.15; break;
      case 'cac': a.cac *= 1.4; break;
      case 'recession': demandFactor *= .8; a.churn = Math.min(.95, a.churn + .05); break;
      case 'regulation': a.opexRatio *= 1.1; break;
      case 'productivity': productivityFactor *= 1.2; break;
      case 'price': priceFactor *= 1.1; break;
    }
  }
  return { a, demandFactor, priceFactor, productivityFactor };
}

export function simulate(baseline: Baseline, scenario: Scenario, years = 10): State[] {
  const initial = structuredClone(baseline.state);
  const history = [initial];
  const queue: { due: number; stocks: Stocks }[] = [];
  for (let year = 1; year <= years; year++) {
    const prev = history[year - 1];
    const { a, demandFactor, priceFactor, productivityFactor } = withShocks(scenario.assumptions, scenario.shocks, year);
    const s: State = { ...prev, year, stocks: { ...prev.stocks }, stockInvestment: emptyStocks() };
    // Economic assets are model stocks, not book assets. Investment benefits arrive after the stated lag.
    for (const k of stockKeys) {
      const arrived = queue.filter(q => q.due === year).reduce((sum, q) => sum + q.stocks[k], 0);
      s.stocks[k] = Math.max(0, prev.stocks[k] * (1 - a.depreciationRate) + arrived * a.investmentEfficiency);
    }
    s.productiveCapacity = stockKeys.reduce((sum, k) => sum + stockWeights[k] * ratio(s.stocks[k], initial.stocks[k], 1), 0);
    s.productivity = Math.pow(1 + a.productivityGrowth, year) * productivityFactor * Math.pow(Math.max(.02, s.productiveCapacity), .15);
    const customerValue = clamp(Math.pow(Math.max(.02, s.productiveCapacity), .1), .7, 1.3);
    s.marketSize = initial.marketSize * Math.pow(1 + a.demandGrowth, year) * demandFactor;
    s.demand = Math.max(0, initial.customers * Math.pow(1 + a.demandGrowth, year) * demandFactor * customerValue * Math.pow(1 - a.competition * .15, year));
    s.churnRate = clamp(a.churn / customerValue, 0, .95); s.retention = 1 - s.churnRate;
    s.churnedCustomers = prev.customers * s.churnRate;
    // Acquisition budget is included in baseline opex; brand/distribution improve efficiency after investment matures.
    const baseAcquisitionBudget = initial.customers * (baseline.assumptions.churn + Math.max(0, baseline.assumptions.demandGrowth)) * baseline.assumptions.cac;
    const acquisitionBudget = baseAcquisitionBudget * Math.pow(1 + a.demandGrowth, year) + (prev.stockInvestment.brand + prev.stockInvestment.distribution) * .3;
    s.cac = Math.max(.01, a.cac / customerValue);
    s.newCustomers = Math.min(acquisitionBudget / s.cac, Math.max(0, s.demand - (prev.customers - s.churnedCustomers)));
    s.customers = Math.max(0, Math.min(s.demand, prev.customers - s.churnedCustomers + s.newCustomers));
    // Demand loss can remove customers beyond voluntary churn; preserve the customer identity.
    s.churnedCustomers = prev.customers + s.newCustomers - s.customers;
    s.price = initial.price * Math.pow(1 + a.priceGrowth, year) * priceFactor;
    s.volume = s.customers * s.productivity;
    s.revenue = s.volume * s.price;
    s.grossMargin = clamp(a.grossMargin - a.competition * .05, -.5, .95);
    s.cogs = s.revenue * (1 - s.grossMargin); s.grossProfit = s.revenue - s.cogs;
    const initialFixedAssets = Math.max(0, initial.investedCapital - initial.workingCapital);
    const fixedAssets = Math.max(0, prev.investedCapital - prev.workingCapital);
    s.depreciation = fixedAssets * a.depreciationRate;
    // A mix of fixed and variable costs creates operating leverage.
    const cashOpex = initial.revenue * a.opexRatio * .4 + s.revenue * a.opexRatio * .6;
    s.interestExpense = prev.debt * a.interestRate;
    s.workingCapital = s.revenue * a.workingCapitalRatio;
    s.workingCapitalInvestment = s.workingCapital - prev.workingCapital;
    s.maintenanceCapex = s.revenue * a.maintenanceRatio * (.5 + a.allocations.maintenance / 50);
    const beforeInvestmentProfit = s.grossProfit - cashOpex - s.depreciation;
    const preInvestmentCash = beforeInvestmentProfit - Math.max(0, beforeInvestmentProfit - s.interestExpense) * a.taxRate - s.interestExpense + s.depreciation - s.workingCapitalInvestment - s.maintenanceCapex;
    const budget = Math.max(0, preInvestmentCash) * a.reinvestmentRate;
    const investment = allocateInvestment(budget, a.allocations);
    s.investment = investment.spent; s.growthCapex = investment.capex; s.expenseInvestment = investment.expense; s.stockInvestment = investment.stocks;
    // Maintenance preserves physical capacity, but no investment automatically guarantees success.
    const queued = { ...investment.stocks, physical: investment.stocks.physical + s.maintenanceCapex };
    queue.push({ due: year + Math.max(1, Math.round(a.investmentLag)), stocks: queued });
    s.opex = cashOpex + s.depreciation + s.expenseInvestment;
    s.operatingProfit = s.grossProfit - s.opex;
    s.tax = Math.max(0, s.operatingProfit - s.interestExpense) * a.taxRate;
    s.operatingCashFlow = s.operatingProfit - s.tax - s.interestExpense + s.depreciation - s.workingCapitalInvestment;
    s.freeCashFlow = s.operatingCashFlow - s.maintenanceCapex - s.growthCapex;
    const distributable = Math.min(Math.max(0, s.freeCashFlow), Math.max(0, prev.cash + s.freeCashFlow));
    const payoutWeight = a.allocations.dividends + a.allocations.debtRepayment + a.allocations.reserves;
    s.dividends = distributable * ratio(a.allocations.dividends, payoutWeight);
    s.debtRepayment = Math.min(prev.debt, distributable * ratio(a.allocations.debtRepayment, payoutWeight));
    s.cash = prev.cash + s.freeCashFlow - s.dividends - s.debtRepayment;
    s.liquidityGap = Math.max(0, -s.cash); // Never silently borrow or clamp away an unfunded cash shortfall.
    s.debt = prev.debt - s.debtRepayment;
    s.equity = prev.equity + s.operatingProfit - s.interestExpense - s.tax - s.dividends;
    s.investedCapital = Math.max(0, fixedAssets - s.depreciation + s.maintenanceCapex + s.growthCapex) + s.workingCapital;
    s.availableCapital = Math.max(0, s.cash); s.reinvestmentRate = a.reinvestmentRate;
    const averageCapital = (prev.investedCapital + s.investedCapital) / 2;
    s.roic = ratio(s.operatingProfit * (1 - a.taxRate), averageCapital);
    s.costOfCapital = a.costOfCapital; s.capitalTurnover = ratio(s.revenue, averageCapital);
    s.ltv = s.churnRate > 0 ? s.price * s.productivity * s.grossMargin / s.churnRate : 0;
    s.runway = s.freeCashFlow < 0 ? Math.max(0, s.cash) / (-s.freeCashFlow / 12) : null;
    const m = momentum(s, prev); s.businessMomentum = m.value; s.momentumParts = m.parts;
    if (!Number.isFinite(initialFixedAssets) || Object.values(s).some(v => typeof v === 'number' && !Number.isFinite(v))) throw new Error('Invalid model input: non-finite result.');
    history.push(s);
  }
  return history;
}
