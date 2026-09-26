export const stockKeys = ['human', 'technology', 'physical', 'brand', 'distribution', 'relationships', 'data', 'organization'] as const;
export type StockKey = typeof stockKeys[number];
export const allocationKeys = ['rd', 'product', 'people', 'marketing', 'sales', 'infrastructure', 'automation', 'maintenance', 'acquisitions', 'debtRepayment', 'dividends', 'reserves'] as const;
export type AllocationKey = typeof allocationKeys[number];
export type Allocations = Record<AllocationKey, number>;
export type Stocks = Record<StockKey, number>;
export type DataStatus = 'OBSERVED' | 'CALCULATED' | 'ESTIMATED' | 'USER ASSUMPTION' | 'UNAVAILABLE';
export interface Fact { value: number | null; status: DataStatus; source: string; url?: string; period: string; calculation?: string; }
export interface Statement { period: string; fiscalYear: number; facts: Record<string, Fact>; }
export interface Company { ticker: string; name: string; currency: 'USD' | 'GBP'; updated: string; provider: string; statements: Statement[]; }
export interface Assumptions {
  demandGrowth: number; priceGrowth: number; churn: number; grossMargin: number; opexRatio: number;
  cac: number; interestRate: number; taxRate: number; maintenanceRatio: number; reinvestmentRate: number;
  productivityGrowth: number; costOfCapital: number; workingCapitalRatio: number; depreciationRate: number;
  investmentLag: number; investmentEfficiency: number; competition: number; allocations: Allocations;
}
export interface MomentumPart { label: string; raw: number; normalized: number; weight: number; contribution: number; definition: string; }
export interface State {
  year: number; marketSize: number; demand: number; customers: number; newCustomers: number; churnedCustomers: number;
  churnRate: number; retention: number; price: number; volume: number; revenue: number; cogs: number;
  grossProfit: number; grossMargin: number; opex: number; operatingProfit: number; depreciation: number;
  tax: number; interestExpense: number; workingCapital: number; workingCapitalInvestment: number;
  maintenanceCapex: number; growthCapex: number; operatingCashFlow: number; freeCashFlow: number;
  cash: number; debt: number; equity: number; investedCapital: number; availableCapital: number;
  dividends: number; debtRepayment: number; reinvestmentRate: number; investment: number; expenseInvestment: number;
  productiveCapacity: number; productivity: number; stocks: Stocks; stockInvestment: Stocks;
  cac: number; ltv: number; roic: number; costOfCapital: number; capitalTurnover: number;
  businessMomentum: number; momentumParts: MomentumPart[]; runway: number | null; liquidityGap: number;
}
export interface Baseline { id: string; name: string; currency: 'GBP' | 'USD'; period: string; state: State; assumptions: Assumptions; facts: Record<string, Fact>; company?: Company; notes: string[]; }
export type ShockKind = 'demand' | 'interest' | 'churn' | 'cogs' | 'cac' | 'recession' | 'regulation' | 'productivity' | 'price';
export interface Shock { id: string; kind: ShockKind; year: number; }
export interface Scenario { assumptions: Assumptions; shocks: Shock[]; }
export type ScenarioName = 'BASE' | 'BULL' | 'BEAR' | 'CUSTOM';
