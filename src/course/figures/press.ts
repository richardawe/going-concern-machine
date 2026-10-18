import type { FigureSpec } from '../ui/IsoFigure';
import { box, cyl, dial, fmt, poly, type V } from '../ui/iso';

// Fig 5, the press with a payback dial (Module 5): eight blocks are the eight years of savings an automation line
// brings, each pressed down to its present value by the discount rate. The two columns compare what the line costs with
// what its savings are worth today; the dial reads the discounted payback. An illustrative project: 100 spent now saves
// 25 a year for 8 years, straight-line depreciation over the same 8 years, no tax.

export const COST = 100, SAVING = 25, LIFE = 8;
export const presentValues = (r: number) => Array.from({ length: LIFE }, (_, i) => SAVING / Math.pow(1 + r, i + 1));
export function irr() { let lo = 0, hi = 1; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (press(m).npv > 0) lo = m; else hi = m; } return (lo + hi) / 2; }
export function press(r: number) {
  const pv = presentValues(r), total = pv.reduce((a, b) => a + b, 0);
  let sum = 0, discountedPayback: number | null = null;
  for (let i = 0; i < pv.length && discountedPayback == null; i++) { if (sum + pv[i] >= COST) discountedPayback = i + (COST - sum) / pv[i]; sum += pv[i]; }
  return { pv, total, npv: total - COST, payback: COST / SAVING, discountedPayback, depreciation: COST / LIFE, profitUplift: SAVING - COST / LIFE };
}
const IRR = irr();
export function readout(r: number): [string, string] {
  const p = press(r);
  return [`discount rate ${(r * 100).toFixed(0)}% · present value ${p.total.toFixed(1)} · NPV ${fmt(p.npv)} · IRR ${(IRR * 100).toFixed(1)}%`,
    `payback ${p.payback.toFixed(1)} years · discounted payback ${p.discountedPayback == null ? `beyond ${LIFE} years` : `${p.discountedPayback.toFixed(1)} years`}`];
}

const ROW = { x0: 34, y: 66, w: 17, gap: 6, d: 30 }, K = .7, KB = 1.6, COL = { y: 164, cost: 252, value: 290, w: 24 }, DL = { x: 336, y: 120 };
const blockX = (i: number) => ROW.x0 + i * (ROW.w + ROW.gap);

export const paybackPress: FigureSpec<{ bob: number; dp: number }> = {
  title: 'Press with a payback dial',
  viewBox: '-212 -60 535 370',
  control: { label: 'Discount rate', hint: 'Drag the rate lever', min: 0, max: .25, step: .01, home: .1, say: r => `discount rate ${(r * 100).toFixed(0)}%` },
  base: box(ROW.x0 - 8, ROW.y - 6, 10, blockX(LIFE) - ROW.x0 + 10, ROW.d + 12, 6, 'f-s0') + box(COL.cost - 6, COL.y - 6, 10, COL.value + COL.w - COL.cost + 12, COL.w + 12, 4, 'f-s0'),
  init: r => ({ bob: 0, dp: press(r).discountedPayback ?? LIFE + 1 }),
  step: (s, r, dt) => { s.bob += dt; const dp = press(r).discountedPayback ?? LIFE + 1; s.dp += (dp - s.dp) * Math.min(1, dt * 4); },
  draw: (s, r, t) => {
    const p = press(r), h = p.pv.map(v => v * KB), squeeze = t ? 1.5 * Math.abs(Math.sin(s.bob * 1.4)) : 0;
    let out = '';
    // Columns of the press frame, behind the blocks.
    for (const x of [ROW.x0 - 6, blockX(LIFE) - 6]) out += box(x, ROW.y - 12, 16, 6, 6, SAVING * KB + 16);
    // Savings blocks, year 1 to 8, each at its present value.
    p.pv.forEach((_, i) => { out += box(blockX(i), ROW.y, 16, ROW.w, ROW.d, Math.max(.5, h[i] - squeeze * (i / LIFE)), 'liquid-top'); });
    // The press head: its underside follows the tops of the blocks, so a higher rate tilts it down towards later years.
    const top = 16 + SAVING * KB + 16, under: V[] = [], over: V[] = [];
    for (let i = 0; i < LIFE; i++) for (const dx of [0, ROW.w]) under.push([blockX(i) + dx, ROW.y + ROW.d, 16 + h[i] + 1 - squeeze * (i / LIFE)]);
    for (const q of [...under].reverse()) over.push([q[0], q[1], top]);
    out += poly([[ROW.x0 - 6, ROW.y - 6, top], [blockX(LIFE), ROW.y - 6, top], [blockX(LIFE), ROW.y + ROW.d, top], [ROW.x0 - 6, ROW.y + ROW.d, top]], 'f-top e');
    out += poly([[ROW.x0 - 6, ROW.y + ROW.d, top], [ROW.x0 - 6, ROW.y + ROW.d, 16 + h[0] + 1], ...under, [blockX(LIFE), ROW.y + ROW.d, under.at(-1)![2]], [blockX(LIFE), ROW.y + ROW.d, top]], 'f-s1 e');
    out += poly([[blockX(LIFE), ROW.y - 6, top], [blockX(LIFE), ROW.y + ROW.d, top], [blockX(LIFE), ROW.y + ROW.d, under.at(-1)![2]], [blockX(LIFE), ROW.y - 6, under.at(-1)![2]]], 'f-s2 e');
    out += cyl((ROW.x0 + blockX(LIFE)) / 2, ROW.y + 12, top, top + 18, 7, 'f-lit', 'f-s2 e');
    // What it costs against what its savings are worth today.
    out += box(COL.cost, COL.y, 14, COL.w, COL.w, COST * K, 'f-s0');
    let z = 14;
    p.pv.forEach(v => { out += box(COL.value, COL.y, z, COL.w, COL.w, v * K, 'liquid-top'); z += v * K; });
    // Discounted payback dial: 0–9 years, the last ninth meaning "not within the line's life".
    return out + dial(DL.x, DL.y, 24, 14, Math.min(LIFE + 1, s.dp) / (LIFE + 1), 1 / (LIFE + 1));
  },
  readout, loss: r => press(r).npv < 0,
  legend: [{ label: 'blocks = each year’s saving, in today’s money' }, { label: 'dark column = cost' }, { label: 'stacked column = present value' }, { label: 'dial = discounted payback' }],
  caption: 'An illustrative automation line: 100 spent now saves 25 a year for 8 years, and is depreciated straight-line over those 8 years. The press squeezes each year’s saving down to its present value at the discount rate on the lever. The project is worth doing when the stacked column is taller than the cost.',
};
