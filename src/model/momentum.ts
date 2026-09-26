import { clamp, ratio } from './config';
import type { State, MomentumPart } from './types';
// Each raw signal is divided by its published scale, clipped to [-1, 1], then weighted.
// Weights sum to 1. This is a scenario indicator, not a measured physical quantity or investment rating.
export const momentumConfig = [
  { label: 'Revenue growth', weight: .24, scale: .2, definition: '(Revenue − prior revenue) / |prior revenue|; scale 20%' },
  { label: 'FCF improvement', weight: .16, scale: .1, definition: '(FCF − prior FCF) / |prior revenue|; scale 10% (safe around zero FCF)' },
  { label: 'ROIC spread', weight: .22, scale: .15, definition: 'ROIC − cost of capital; scale 15 percentage points' },
  { label: 'Customer growth', weight: .12, scale: .15, definition: '(Customers − prior customers) / prior customers; scale 15%' },
  { label: 'Retention', weight: .08, scale: .1, definition: 'Retention − 90% reference; scale 10 percentage points' },
  { label: 'Productivity growth', weight: .08, scale: .1, definition: '(Productivity − prior productivity) / prior productivity; scale 10%' },
  { label: 'Liquidity resilience', weight: .1, scale: .25, definition: '(Cash − 25% of debt) / annual revenue − 10% buffer; scale 25%' },
] as const;
export function momentum(s: State, previous: State): { value: number; parts: MomentumPart[] } {
  const raw = [ratio(s.revenue - previous.revenue, Math.abs(previous.revenue)), ratio(s.freeCashFlow - previous.freeCashFlow, Math.abs(previous.revenue)), s.roic - s.costOfCapital, ratio(s.customers - previous.customers, previous.customers), s.retention - .9, ratio(s.productivity - previous.productivity, previous.productivity), ratio(s.cash - .25 * s.debt, s.revenue) - .1];
  const parts = momentumConfig.map((c, i) => ({ ...c, raw: raw[i], normalized: clamp(raw[i] / c.scale, -1, 1), contribution: clamp(raw[i] / c.scale, -1, 1) * c.weight * 100 }));
  return { value: parts.reduce((sum, p) => sum + p.contribution, 0), parts };
}
