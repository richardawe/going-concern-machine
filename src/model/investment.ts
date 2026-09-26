import type { Allocations, Stocks, StockKey } from './types';
import { stockKeys } from './types';
export const emptyStocks = (): Stocks => Object.fromEntries(stockKeys.map(k => [k, 0])) as Stocks;
export function allocateInvestment(budget: number, a: Allocations) {
  const map: Partial<Record<keyof Allocations, StockKey>> = { rd: 'technology', product: 'relationships', people: 'human', marketing: 'brand', sales: 'distribution', infrastructure: 'physical', automation: 'data', acquisitions: 'organization' };
  const stocks = emptyStocks();
  const total = Object.keys(map).reduce((sum, k) => sum + a[k as keyof Allocations], 0);
  let capex = 0;
  if (total === 0) return { stocks, capex: 0, expense: 0, spent: 0 };
  Object.entries(map).forEach(([k, stock]) => {
    const amount = budget * a[k as keyof Allocations] / total;
    stocks[stock] += amount;
    if (['infrastructure', 'automation', 'acquisitions'].includes(k)) capex += amount;
  });
  return { stocks, capex, expense: budget - capex, spent: budget };
}
