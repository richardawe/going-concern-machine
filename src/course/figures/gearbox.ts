import type { FigureSpec } from '../ui/IsoFigure';
import { box, cyl, dot, fmt, gear, line, P, pipe, poly, ring, tank, type V } from '../ui/iso';

// Fig 1, the margin gearbox (Module 1): a price lever sets the flywheel's speed (gross profit); gross profit fills the
// cash tank and fixed overheads drain it. An illustrative retailer kept simple enough to check by hand: 100 units at a
// price of 1.00, unit cost 0.67, fixed overheads of 27, and volume moving 1.5% for every 1% change in price.

export const UNIT_COST = .67, ELASTICITY = 1.5, OVERHEADS = 27;
export function gearbox(p: number) {
  const price = 1 + p, volume = 100 * (1 - ELASTICITY * p), grossProfit = volume * (price - UNIT_COST);
  return { price, volume, grossProfit, margin: (price - UNIT_COST) / price, cash: grossProfit - OVERHEADS };
}
const BASE = gearbox(0);
export function readout(p: number): [string, string] {
  const g = gearbox(p);
  return [`price ${fmt(p * 100, 0)}% · volume ${fmt(g.volume - 100, 0)}% · margin ${(g.margin * 100).toFixed(1)}%`, `gross profit ${g.grossProfit.toFixed(1)} (${fmt((g.grossProfit / BASE.grossProfit - 1) * 100, 0)}%) · cash ${fmt(g.cash)} a year`];
}

const FW = { x: 110, y: 104, r: 72 }, PN = { x: 178, y: 162, r: 16 }, TK = { x: 305, y: 86, r: 34, z0: 20, z1: 150 };

export const marginGearbox: FigureSpec<{ angle: number; level: number }> = {
  title: 'Margin gearbox',
  control: { label: 'Price lever', hint: 'Drag the price lever', min: -.15, max: .05, step: .01, home: 0, say: p => `price ${fmt(p * 100, 0)}%` },
  base: cyl(FW.x, FW.y, 10, 16, 30, 'f-top', 'f-s2 e') + cyl(FW.x, FW.y, 16, 26, 20),
  init: () => ({ angle: 0, level: .55 }),
  step: (s, p, dt) => { const g = gearbox(p); s.angle += dt * .9 * Math.max(0, g.grossProfit) / BASE.grossProfit; s.level = Math.max(.04, Math.min(.96, s.level + dt * g.cash / 120)); },
  draw: ({ angle, level }, p, t) => {
    let s = '';
    const z0 = 26, z1 = 36;
    // Flywheel: toothed rim, spokes and rivets turn with gross profit.
    s += cyl(FW.x, FW.y, z0, z1 - .1, FW.r - 4) + poly(gear(FW.x, FW.y, z1, FW.r, 44, angle), 'f-top e');
    s += line([...ring(FW.x, FW.y, z1, FW.r - 12, 64), ring(FW.x, FW.y, z1, FW.r - 12, 64)[0]], 'l mid');
    for (let k = 0; k < 6; k++) { const a = angle + k * Math.PI / 3; s += line([[FW.x + 15 * Math.cos(a), FW.y + 15 * Math.sin(a), z1], [FW.x + (FW.r - 12) * Math.cos(a), FW.y + (FW.r - 12) * Math.sin(a), z1]], 'l hi'); }
    for (let k = 0; k < 12; k++) { const a = angle + k * Math.PI / 6 + .26; s += dot(FW.x + (FW.r - 7) * Math.cos(a), FW.y + (FW.r - 7) * Math.sin(a), z1, .8); }
    s += cyl(FW.x, FW.y, z1, z1 + 8, 13, 'f-lit', 'f-s2 e') + cyl(FW.x, FW.y, z1 + 8, z1 + 11, 5);
    // Pinion meshing with the rim.
    const pa = -angle * FW.r / PN.r + .2;
    s += cyl(PN.x, PN.y, 10, 26, 5) + cyl(PN.x, PN.y, z0, z1 - .1, PN.r - 4, 'f-top', 'f-s2 e') + poly(gear(PN.x, PN.y, z1, PN.r, 10, pa, 3.5), 'f-top e') + cyl(PN.x, PN.y, z1, z1 + 4, 4, 'f-lit');
    // Outlet, feed pipe into the tank, and the overheads drain out of it.
    s += box(186, 76, 10, 20, 20, 22);
    const flow = Math.max(0, gearbox(p).grossProfit) / BASE.grossProfit;
    s += pipe([[206, 86, 22], [271, 86, 22]], 'in', -t * .02 * flow) + pipe([[TK.x + 24, TK.y + 24, 16], [TK.x + 24, 204, 16], [TK.x + 24, 210, 12]], 'out', -t * .016);
    for (const q of [[206, 86, 22], [262, 86, 22]] as V[]) { const [x, y] = P(...q); s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.6" class="f-top e"/>`; }
    s += box(TK.x + 14, 204, 10, 20, 14, 3, 'f-s3');
    for (let i = 0; i < 4; i++) s += line([[TK.x + 17 + i * 4.5, 206, 13], [TK.x + 17 + i * 4.5, 216, 13]], 'l mid');
    return s + tank(TK.x, TK.y, TK.z0, TK.z1, TK.r, level);
  },
  readout, loss: p => gearbox(p).cash < 0,
  legend: [{ flow: 'in', label: 'gross profit in' }, { flow: 'out', label: 'overheads out' }, { label: 'flywheel speed = gross profit' }],
  caption: 'An illustrative retailer: 100 units at a price of 1.00, unit cost 0.67 (a 33% gross margin), fixed overheads of 27, and volume moving 1.5% for every 1% change in price. The flywheel turns at the speed of gross profit; the tank holds the year’s cash after overheads.',
};
