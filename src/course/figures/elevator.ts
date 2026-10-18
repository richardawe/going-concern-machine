import type { FigureSpec } from '../ui/IsoFigure';
import { box, cyl, dot, fmt, line, pipe, poly, tank, type V } from '../ui/iso';

// Fig 4, the bucket elevator with holed buckets (Module 4): buckets lift new customers into the customer base, and leak
// on the way up. The lever sets churn, the share of customers who leave each year. An illustrative software company:
// 1,000 customers each paying 1.00 a year at an 80% gross margin (0.80 a year each), 300 new customers a year, and a
// customer acquisition cost (CAC) of 1.60. Lifetime values are undiscounted, to keep the arithmetic visible.

export const PRICE = 1, MARGIN = .8, CAC = 1.6, CUSTOMERS = 1000, NEW = 300;
export function elevator(churn: number) {
  const contribution = PRICE * MARGIN, ltv = contribution / churn, next = CUSTOMERS + NEW - churn * CUSTOMERS;
  return { churn, lifetime: 1 / churn, ltv, ratio: ltv / CAC, payback: CAC / contribution, next, growth: next / CUSTOMERS - 1, steady: NEW / churn };
}
const n0 = (n: number) => Math.round(n).toLocaleString('en-GB');
export function readout(churn: number): [string, string] {
  const e = elevator(churn);
  return [`churn ${(churn * 100).toFixed(0)}% · average life ${e.lifetime.toFixed(1)} years · LTV ${e.ltv.toFixed(2)} · LTV/CAC ${e.ratio.toFixed(1)}×`,
    `next year ${n0(e.next)} customers (${fmt(e.growth * 100, 0)}%) · settles at ${n0(e.steady)} · payback ${e.payback.toFixed(1)} years`];
}

const EL = { x: 112, y: 104, r: 15, zb: 34, zt: 168 }, TK = { x: 304, y: 92, r: 32, z0: 20, z1: 142 }, SPACING = 22;
/** A point at distance d along the vertical belt: up the right-hand run, over the top pulley, down the left, under the bottom. */
function along(d: number): V {
  const { x, y, r, zb, zt } = EL, run = zt - zb, arc = Math.PI * r, loop = 2 * run + 2 * arc;
  d = ((d % loop) + loop) % loop;
  if (d < run) return [x + r, y, zb + d];
  if ((d -= run) < arc) { const t = d / r; return [x + r * Math.cos(t), y, zt + r * Math.sin(t)]; }
  if ((d -= arc) < run) return [x - r, y, zt - d];
  d -= run; const t = Math.PI + d / r; return [x + r * Math.cos(t), y, zb + r * Math.sin(t)];
}
const disc = (cx: number, z: number, r: number): V[] => Array.from({ length: 28 }, (_, i) => { const t = i / 28 * 2 * Math.PI; return [cx + r * Math.cos(t), EL.y, z + r * Math.sin(t)]; });

export const bucketElevator: FigureSpec<{ d: number; level: number }> = {
  title: 'Bucket elevator',
  viewBox: '-212 -122 535 432',
  control: { label: 'Churn dial', hint: 'Drag the churn lever', min: .05, max: .5, step: .01, home: .2, say: c => `churn ${(c * 100).toFixed(0)}% a year` },
  base: box(EL.x - 30, EL.y - 18, 10, 60, 30, 10) + box(EL.x - 24, EL.y - 14, 20, 6, 6, EL.zt) + box(EL.x + 18, EL.y - 14, 20, 6, 6, EL.zt)
    + box(EL.x - 26, EL.y - 16, EL.zt + 20, 52, 10, 8),
  init: c => ({ d: 0, level: Math.min(.96, elevator(c).steady / 3200) }),
  step: (s, c, dt) => { s.d += dt * 26; s.level += (Math.min(.96, elevator(c).steady / 3200) - s.level) * Math.min(1, dt * 1.5); },
  draw: (s, churn, t) => {
    const { x, y, r, zb, zt } = EL;
    // New customers arrive in the hopper at the foot; the chute at the head pours them into the customer base.
    let out = pipe([[20, y + 4, 24], [x - r - 10, y + 4, 24]], 'in', -t * .02);
    out += pipe([[x + r + 10, y, zt + 4], [TK.x - 6, TK.y, TK.z1 + 18]], 'in', -t * .02);
    // Pulleys and belt in the upright plane.
    for (const z of [zb, zt]) out += poly(disc(x, z, r - 1), 'f-s2 e') + poly(disc(x, z, 4), 'f-lit e');
    out += line([[x + r, y, zb], [x + r, y, zt]], 'l hi') + line([[x - r, y, zb], [x - r, y, zt]], 'l hi');
    // Buckets: full and leaking on the way up, empty on the way down.
    const loop = 2 * (zt - zb) + 2 * Math.PI * r, n = Math.floor(loop / SPACING), drips = Math.max(1, Math.round(churn * 10));
    for (let i = 0; i < n; i++) {
      const p = along(s.d + i * loop / n), rising = p[0] > x + r - .5 && p[2] < zt;
      if (rising) {
        out += box(p[0], y - 5, p[2] - 3, 7, 10, 6, 'liquid-top');
        for (let k = 0; k < drips; k++) { const f = ((t * .0008 + k / drips + i * .13) % 1); out += dot(p[0] + 4, y + 1, Math.max(12, p[2] - 4 - f * (p[2] - 16)), 1.1, 'drop'); }
      } else out += box(p[0] - (p[0] < x ? 7 : 0), y - 5, p[2] - 3, 7, 10, 6);
    }
    out += box(x - 30, y + 8, 10, 26, 18, 16, 'f-s0');
    return out + tank(TK.x, TK.y, TK.z0, TK.z1, TK.r, s.level);
  },
  readout, loss: c => elevator(c).growth <= 0,
  legend: [{ flow: 'in', label: 'new customers in' }, { label: 'drips = customers lost' }, { label: 'tank = where the base settles' }],
  caption: 'An illustrative software company: 1,000 customers paying 1.00 a year at an 80% gross margin, 300 new customers a year, and an acquisition cost (CAC) of 1.60 a customer. Lifetime value here is undiscounted: 0.80 a year for as long as a customer stays. The tank shows where the customer base settles: new customers ÷ churn.',
};
