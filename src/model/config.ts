import type { Assumptions, StockKey } from './types';
export const stockLabels: Record<StockKey, string> = { human: 'Human capital', technology: 'Technology / IP', physical: 'Physical assets', brand: 'Brand', distribution: 'Distribution', relationships: 'Customer relationships', data: 'Data', organization: 'Organizational capability' };
export const defaultAssumptions: Assumptions = {
  demandGrowth: .08, priceGrowth: 0, churn: .05, grossMargin: .42, opexRatio: .23, cac: 500,
  interestRate: .06, taxRate: .25, maintenanceRatio: .025, reinvestmentRate: .6,
  productivityGrowth: .015, costOfCapital: .09, workingCapitalRatio: .12, depreciationRate: .08,
  investmentLag: 2, investmentEfficiency: .8, competition: .02,
  allocations: { rd: 50, product: 40, people: 50, marketing: 40, sales: 35, infrastructure: 30, automation: 30, maintenance: 25, acquisitions: 0, debtRepayment: 30, dividends: 15, reserves: 55 },
};
export const stockWeights: Record<StockKey, number> = { human: .18, technology: .18, physical: .18, brand: .12, distribution: .1, relationships: .1, data: .06, organization: .08 };
export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const ratio = (a: number, b: number, fallback = 0) => Math.abs(b) > 1e-9 ? a / b : fallback;
