import type { FigureSpec } from '../ui/IsoFigure';
import { box, cyl, dial, dot, fmt, half, line, pipe, poly, wheel } from '../ui/iso';

// Fig 2, the leaking pressure vessel (Module 2): the vessel holds the team's productive capacity, leavers spray out of
// it, hires flow back in, and the output wheel turns at the speed of what the team produces. The lever is the pay valve.
// An illustrative software team: 100 engineers paid 1.00 each, each producing 2.00 of revenue a year at full speed,
// other costs of 50. A rival's offers push attrition to 24% at current pay; every point of pay takes 1.5 points off it,
// down to a floor of 10% that no pay rise removes. Each leaver costs 0.50 to replace and half a year of output (1.00).

export const TEAM = 100, OUTPUT = 2, REPLACE = .5, OTHER = 50, ATTRITION = .24, FLOOR = .1, PAY_EFFECT = 1.5;
export function vessel(p: number) {
  const attrition = Math.max(FLOOR, ATTRITION - PAY_EFFECT * p), leavers = TEAM * attrition, payroll = TEAM * (1 + p);
  const replacement = leavers * REPLACE, capacity = TEAM - leavers * .5, revenue = OUTPUT * capacity;
  return { attrition, leavers, payroll, replacement, capacity, revenue, attritionCost: replacement + leavers * .5 * OUTPUT, profit: revenue - payroll - replacement - OTHER };
}
const BASE = vessel(0);
export function readout(p: number): [string, string] {
  const v = vessel(p);
  return [`pay ${fmt(p * 100, 0)}% · attrition ${(v.attrition * 100).toFixed(1)}% · ${v.leavers.toFixed(1)} leavers · capacity ${v.capacity.toFixed(1)}`, `payroll ${v.payroll.toFixed(1)} · cost of attrition ${v.attritionCost.toFixed(1)} · profit ${fmt(v.profit)} a year`];
}

const VS = { x: 112, y: 96, r: 46, z0: 16, z1: 128 }, WH = { x: 272, y: 78, r: 38 }, GA = { x: 292, y: 168 };
// Where the leaks are: fixed points on the visible face of the vessel, in the order they open as attrition rises.
const HOLES = Array.from({ length: 14 }, (_, i) => ({ a: (-25 + ((i * 47) % 130)) * Math.PI / 180, z: VS.z0 + 18 + ((i * 37) % 84), phase: (i * .37) % 1 }));

export const pressureVessel: FigureSpec<{ angle: number; level: number }> = {
  title: 'Leaking pressure vessel',
  viewBox: '-212 -84 535 394',
  control: { label: 'Pay valve', hint: 'Drag the pay valve', min: 0, max: .15, step: .01, home: 0, say: p => `pay ${fmt(p * 100, 0)}% against today` },
  base: cyl(VS.x, VS.y, 10, VS.z0, VS.r + 7, 'f-top', 'f-s2 e') + box(WH.x - 12, WH.y - 12, 10, 24, 24, 14) + box(GA.x - 16, GA.y - 16, 10, 32, 32, 12),
  init: p => ({ angle: 0, level: (vessel(p).capacity - 80) / 20 }),
  step: (s, p, dt) => { const v = vessel(p); s.angle += dt * .9 * v.revenue / BASE.revenue; s.level += ((v.capacity - 80) / 20 - s.level) * Math.min(1, dt * 2); },
  draw: ({ angle, level }, p, t) => {
    const v = vessel(p), { x, y, r, z0, z1 } = VS;
    // Hires flow in at the top to replace the leavers; the drive shaft carries the team's output to the wheel.
    let s = box(240, 8, 10, 20, 20, 16) + pipe([[250, 18, 26], [250, 18, z1 + 22], [x, y, z1 + 22], [x, y, z1 + 10]], 'in', -t * .004 * v.leavers);
    s += box(x + 30, y - 22, 34, WH.x - x - 30, 8, 8, 'f-s0');
    s += wheel(WH.x, WH.y, 24, 32, WH.r, 30, angle);
    // The vessel: team inside, glass, bands, and the cap the hiring pipe feeds.
    const lz = z0 + 4 + Math.max(.04, Math.min(.96, level)) * (z1 - z0 - 12);
    s += cyl(x, y, z0, lz, r - 3, 'liquid-top', 'liquid') + poly([...half(x, y, z0, r), ...half(x, y, z1, r).reverse()], 'glass');
    for (const z of [z0 + 30, z0 + 72]) s += line(half(x, y, z, r + 1.5), 'l hi');
    s += cyl(x, y, z1, z1 + 10, r + 4) + cyl(x, y, z1 + 10, z1 + 14, 14, 'f-lit', 'f-s2 e');
    for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8; s += dot(x + (r + 1) * Math.cos(a), y + (r + 1) * Math.sin(a), z1 + 10, .7); }
    // Leaks: one jet for every two leavers, each a short arc of droplets falling away from the vessel.
    const open = Math.round(v.leavers / 2);
    for (const h of HOLES.slice(0, open)) {
      const hx = x + r * Math.cos(h.a), hy = y + r * Math.sin(h.a);
      s += dot(hx, hy, h.z, 1.4, 'hole');
      for (let k = 0; k < 4; k++) {
        const d = ((t * .0006 + h.phase + k / 4) % 1) * 30;
        s += dot(hx + d * Math.cos(h.a), hy + d * Math.sin(h.a), Math.max(10, h.z - d * d * .05), 1.1, 'drop');
      }
    }
    // Attrition gauge: 0–30%, red above 20%.
    s += dial(GA.x, GA.y, 28, 14, v.attrition / .3, 1 / 3);
    return s;
  },
  readout, loss: p => vessel(p).profit < BASE.profit,
  legend: [{ flow: 'in', label: 'hires in' }, { flow: 'out', label: 'leavers out' }, { label: 'wheel speed = output' }, { label: 'gauge = attrition' }],
  caption: 'An illustrative software team: 100 engineers paid 1.00 each, each producing 2.00 of revenue a year, other costs of 50. A rival pushes attrition to 24% at today’s pay; each point of pay takes 1.5 points off it, down to a 10% floor. Each leaver costs 0.50 to replace and half a year of output. The liquid is the team’s capacity.',
};
