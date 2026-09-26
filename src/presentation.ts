import type { Baseline, State } from './model/types';
import { clamp, ratio } from './model/config';
export const percent = (n: number) => `${(n * 100).toFixed(1)}%`;
export function money(n: number, currency = 'GBP') {
  const sign = n < 0 ? '−' : ''; const symbol = currency === 'USD' ? '$' : '£'; const value = Math.abs(n);
  const [div, unit] = value >= 1e9 ? [1e9, 'bn'] : value >= 1e6 ? [1e6, 'm'] : value >= 1000 ? [1000, 'k'] : [1, ''];
  return `${sign}${symbol}${(value / (div as number)).toFixed(1)}${unit}`;
}
export function machineView(s: State, b: Baseline) {
  const momentum = s.businessMomentum;
  return {
    speed: s.cash < 0 ? 0 : clamp(2 + (momentum + 100) * .13, .3, 28),
    gearSpeed: clamp(ratio(s.revenue, b.state.revenue) * 14, .2, 45),
    flowDuration: clamp(5 / Math.max(.1, ratio(Math.abs(s.freeCashFlow), b.state.revenue * .1)), .45, 25),
    fill: clamp(s.cash / Math.max(1, b.state.cash * 2, b.state.revenue * .25), 0, 1),
    charge: clamp(s.availableCapital / Math.max(1, b.state.availableCapital * 2), 0, 1),
    brake: clamp((s.churnRate + Math.max(0, s.costOfCapital - s.roic) + ratio(s.interestExpense, s.revenue)) * 2, .03, 1),
    status: s.cash < 0 ? 'UNFUNDED / STALLED' : momentum > 5 ? 'ACCELERATING' : momentum < -5 ? 'DECAYING' : 'EQUILIBRIUM',
    stress: s.cash < 0 || momentum < -20, loss: s.freeCashFlow < 0,
    stocks: Object.fromEntries(Object.entries(s.stocks).map(([k, v]) => [k, clamp(ratio(v, b.state.stocks[k as keyof typeof s.stocks]), 0, 2)])),
    liquidity: s.liquidityGap > 0 ? `Funding gap ${money(s.liquidityGap, b.currency)}` : s.runway == null ? 'FCF positive · no burn' : `Runway ${s.runway.toFixed(0)} months`,
  };
}
export type MachineView = ReturnType<typeof machineView>;
