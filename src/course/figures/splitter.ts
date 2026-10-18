import type { FigureSpec } from '../ui/IsoFigure';
import { box, cyl, fmt, gear, line, pipe, poly, tank, wheel } from '../ui/iso';

// Fig 6, the three-way splitter valve (Module 6): the business's cash engine sends its cash into a splitter. One branch
// keeps the plant running, one pays shareholders, and one is reinvested back into the engine, which then turns faster
// next year. The lever is the payout ratio. An illustrative company: 120 of operating cash flow, 20 of it needed to
// maintain the plant, leaving 100 of free cash flow; after-tax operating profit (NOPAT) of 100; reinvested cash earns a
// 12% return on invested capital (ROIC) and the cost of capital (WACC) is 9%.

export const OPERATING = 120, MAINTAIN = 20, FCF = OPERATING - MAINTAIN, NOPAT = 100, ROIC = .12, WACC = .09;
export function splitter(payout: number, roic = ROIC) {
  const dividends = payout * FCF, reinvested = FCF - dividends, growth = reinvested * roic / NOPAT;
  return { dividends, reinvested, maintenance: MAINTAIN, growth, next: NOPAT * (1 + growth), valueAdded: reinvested * (roic - WACC) / WACC };
}
export function readout(p: number): [string, string] {
  const s = splitter(p);
  return [`payout ${(p * 100).toFixed(0)}% · dividends ${s.dividends.toFixed(1)} · reinvested ${s.reinvested.toFixed(1)} · upkeep ${MAINTAIN.toFixed(1)}`,
    `growth ${(s.growth * 100).toFixed(1)}% a year · value added by reinvesting ${fmt(s.valueAdded)} (ROIC 12%, WACC 9%)`];
}

const EN = { x: 92, y: 82, r: 46 }, SP = { x: 190, y: 118 }, TK = { x: 308, y: 96, r: 30, z0: 20, z1: 130 };
const width = (v: number) => .4 + v / 28;

export const splitterValve: FigureSpec<{ angle: number; valve: number; level: number }> = {
  title: 'Three-way splitter valve',
  control: { label: 'Payout ratio', hint: 'Drag the payout lever', min: 0, max: 1, step: .05, home: .6, say: p => `payout ${(p * 100).toFixed(0)}% of free cash flow` },
  base: cyl(EN.x, EN.y, 10, 18, 26, 'f-top', 'f-s2 e') + box(EN.x - 34, 18, 10, 26, 16, 26, 'f-s0'),
  init: p => ({ angle: 0, valve: p * Math.PI, level: .04 + .9 * p }),
  step: (s, p, dt) => { s.angle += dt * .7 * (1 + splitter(p).growth * 6); s.valve += (p * Math.PI - s.valve) * Math.min(1, dt * 6); s.level += (.04 + .9 * p - s.level) * Math.min(1, dt * 2); },
  draw: (s, p, t) => {
    const v = splitter(p), speed = (x: number) => -t * .0004 * x;
    // Upkeep goes back to the plant behind the engine; reinvestment loops round into the engine itself.
    let out = pipe([[SP.x - 8, SP.y - 12, 24], [SP.x - 8, 26, 24], [EN.x - 21, 26, 24]], 'out', speed(MAINTAIN), width(MAINTAIN)).replace(/flow out/, 'flow keep');
    out += pipe([[SP.x + 6, SP.y + 14, 24], [SP.x + 6, 168, 24], [EN.x, 168, 24], [EN.x, EN.y + EN.r + 6, 24]], 'in', speed(v.reinvested), width(v.reinvested));
    out += wheel(EN.x, EN.y, 18, 28, EN.r, 32, s.angle);
    // Cash out of the engine into the splitter, and dividends out to the shareholders' tank.
    out += pipe([[EN.x + EN.r - 4, SP.y, 24], [SP.x - 14, SP.y, 24]], 'in', speed(FCF + MAINTAIN), width(FCF));
    out += box(SP.x - 14, SP.y - 14, 10, 28, 28, 24) + cyl(SP.x, SP.y, 34, 40, 5);
    out += poly(gear(SP.x, SP.y, 41, 12, 8, s.valve, 2.5), 'f-top e') + line([[SP.x, SP.y, 41.5], [SP.x + 10 * Math.cos(s.valve), SP.y + 10 * Math.sin(s.valve), 41.5]], 'l hi');
    out += pipe([[SP.x + 14, SP.y, 24], [TK.x - 26, SP.y, 24]], 'out', speed(v.dividends), width(v.dividends));
    return out + tank(TK.x, TK.y, TK.z0, TK.z1, TK.r, s.level);
  },
  readout, loss: () => false,
  legend: [{ flow: 'in', label: 'reinvested' }, { flow: 'out', label: 'paid to shareholders' }, { label: 'grey = upkeep' }, { label: 'wheel speed = growth' }],
  caption: 'An illustrative company: 120 of operating cash flow, of which 20 keeps the plant running, leaving 100 of free cash flow. After-tax operating profit is 100. Cash reinvested earns a 12% return (ROIC) against a 9% cost of capital (WACC). Pipe width is the size of each flow; the tank is what shareholders receive.',
};
