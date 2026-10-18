import type { FigureSpec } from '../ui/IsoFigure';
import { box, cyl, fmt, pipe, poly, tank, type V } from '../ui/iso';

// Fig 3, the reservoir on a rotary conveyor (Module 3): money rides the conveyor from cash, into stock, out to customers
// and back as collections. The longer customers take to pay, the longer the loop and the more crates ride it, and the
// emptier the reservoir. An illustrative manufacturer kept simple enough to check by hand: sales of 365 a year (1.00 a
// day), cost of sales 0.70 a day, stock held 60 days, suppliers paid in 45, operating profit 30 a year, short-term debt
// of 40 and a credit line of 25. At 45 debtor days the reservoir holds 20; every extra day ties up another 1.00.

export const DAILY = 1, COGS = .7, DIO = 60, DPO = 45, DSO = 45, CASH = 20, PROFIT = 30, SHORT_DEBT = 40, LINE = 25;
export function conveyor(dso: number) {
  const receivables = dso * DAILY, inventory = DIO * COGS, payables = DPO * COGS, cycle = dso + DIO - DPO;
  const cash = CASH - (dso - DSO) * DAILY, held = Math.max(0, cash), drawn = Math.min(LINE, Math.max(0, -cash)), liabilities = payables + SHORT_DEBT + drawn;
  return {
    receivables, inventory, payables, cycle, workingCapital: receivables + inventory - payables, cash, drawn, headroom: LINE - drawn, profit: PROFIT,
    current: (held + receivables + inventory) / liabilities, quick: (held + receivables) / liabilities, cashRatio: held / liabilities,
  };
}
export function readout(dso: number): [string, string] {
  const c = conveyor(dso);
  return [`debtor days ${dso.toFixed(0)} · cash cycle ${c.cycle.toFixed(0)} days · working capital ${c.workingCapital.toFixed(1)}`,
    c.cash >= 0 ? `cash ${c.cash.toFixed(1)} · current ratio ${c.current.toFixed(2)} · cash ratio ${c.cashRatio.toFixed(2)} · profit ${PROFIT.toFixed(1)}`
      : `cash ${fmt(c.cash)}: ${c.drawn.toFixed(1)} drawn on the credit line, ${c.headroom.toFixed(1)} left · profit still ${PROFIT.toFixed(1)}`];
}

const TK = { x: 312, y: 84, r: 30, z0: 20, z1: 140 }, BELT = { y: 90, r: 30, x0: 34, z: 34 }, GAP = 15;
const end = (cycle: number) => BELT.x0 + 2 * BELT.r + 1.5 * cycle;
/** A point at distance d along the belt loop: back run left to right, round the right roller, front run back, round the left. */
function along(d: number, x1: number): V {
  const { y, r, x0, z } = BELT, a = x0 + r, b = x1 - r, run = b - a, arc = Math.PI * r, loop = 2 * run + 2 * arc;
  d = ((d % loop) + loop) % loop;
  if (d < run) return [a + d, y - r, z];
  if ((d -= run) < arc) { const t = -Math.PI / 2 + d / r; return [b + r * Math.cos(t), y + r * Math.sin(t), z]; }
  if ((d -= arc) < run) return [b - d, y + r, z];
  d -= run; const t = Math.PI / 2 + d / r; return [a + r * Math.cos(t), y + r * Math.sin(t), z];
}
function stadium(x1: number, r: number, z: number): V[] {
  const a = BELT.x0 + BELT.r, b = x1 - BELT.r, y = BELT.y, out: V[] = [];
  for (let i = 0; i <= 16; i++) { const t = -Math.PI / 2 + Math.PI * i / 16; out.push([b + r * Math.cos(t), y + r * Math.sin(t), z]); }
  for (let i = 0; i <= 16; i++) { const t = Math.PI / 2 + Math.PI * i / 16; out.push([a + r * Math.cos(t), y + r * Math.sin(t), z]); }
  return out;
}

export const rotaryConveyor: FigureSpec<{ d: number; level: number; x1: number }> = {
  title: 'Reservoir on a rotary conveyor',
  control: { label: 'Debtor days', hint: 'Drag the days lever', min: 30, max: 90, step: 1, home: DSO, say: d => `${d.toFixed(0)} debtor days` },
  base: '',
  init: dso => ({ d: 0, level: conveyor(dso).cash / 40, x1: end(conveyor(dso).cycle) }),
  step: (s, dso, dt) => { const c = conveyor(dso); s.d += dt * 22; s.level += (Math.max(0, c.cash) / 40 - s.level) * Math.min(1, dt * 2.5); s.x1 = end(c.cycle); },
  draw: (s, dso, t) => {
    const c = conveyor(dso), x1 = s.x1, { y, r, x0, z } = BELT;
    // Credit line from the back: it only flows once the reservoir is empty.
    let out = pipe([[350, 14, 60], [TK.x, 14, 60], [TK.x, TK.y - TK.r - 4, 60]], 'out', c.drawn > 0 ? -t * .02 : 0, c.drawn > 0 ? 2 : .01);
    // Rollers and belt: the loop is as long as the cash conversion cycle.
    for (const cx of [x0 + r, x1 - r]) out += cyl(cx, y, 10, z - 6, 8, 'f-top', 'f-s2 e') + cyl(cx, y, z - 6, z - 1, r - 2);
    out += poly(stadium(x1, r + 6, z), 'f-s0 e') + poly(stadium(x1, r - 6, z), 'f-top e');
    for (const cx of [x0 + r, x1 - r]) out += cyl(cx, y, z, z + 3, 7, 'f-lit', 'f-s2 e');
    // Crates of money ride the belt, one for every 15 of distance; painted back to front.
    const loop = 2 * (x1 - x0 - 2 * r) + 2 * Math.PI * r, n = Math.floor(loop / GAP);
    const crates = Array.from({ length: n }, (_, i) => along(s.d + i * loop / n, x1)).sort((p, q) => p[0] + p[1] - q[0] - q[1]);
    for (const [cx, cy] of crates) out += box(cx - 3.5, cy - 3.5, z, 7, 7, 6, 'f-lit');
    // Collections run from the belt's end to the reservoir; payments to suppliers drain out of it.
    out += pipe([[x1 - 4, y - 10, 24], [TK.x - 24, y - 10, 24]], 'in', -t * .02);
    out += pipe([[TK.x + 20, TK.y + 22, 16], [TK.x + 20, 204, 16], [TK.x + 20, 212, 12]], 'out', -t * .016);
    return out + tank(TK.x, TK.y, TK.z0, TK.z1, TK.r, s.level);
  },
  readout, loss: dso => conveyor(dso).cash < 0,
  legend: [{ flow: 'in', label: 'collections in' }, { flow: 'out', label: 'payments and borrowing' }, { label: 'loop length = cash cycle' }],
  caption: 'An illustrative manufacturer: sales of 365 a year (1.00 a day), cost of sales 0.70 a day, stock held 60 days, suppliers paid in 45, operating profit 30 a year, short-term debt of 40 and a 25 credit line. At 45 debtor days the reservoir holds 20 of cash. Every extra day customers take ties up another day of sales.',
};
