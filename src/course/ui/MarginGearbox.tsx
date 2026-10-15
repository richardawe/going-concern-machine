import { useEffect, useRef } from 'react';

// Fig 1, the margin gearbox: Module 1's Anatomy-style figure. A price lever sets the flywheel's speed (gross profit);
// gross profit fills the cash tank and fixed overheads drain it. Every number comes from `gearbox` below, the same
// illustrative model the concepts and check questions use. Drawn in isometric projection (x, y on the floor, z up),
// back to front; parts that move are rebuilt each frame from refs, never through React state.

export const UNIT_COST = .67, ELASTICITY = 1.5, OVERHEADS = 27, MIN_PRICE = -.15, MAX_PRICE = .05;
export function gearbox(p: number) {
  const price = 1 + p, volume = 100 * (1 - ELASTICITY * p), grossProfit = volume * (price - UNIT_COST);
  return { price, volume, grossProfit, margin: (price - UNIT_COST) / price, cash: grossProfit - OVERHEADS };
}
const BASE = gearbox(0);

const C = Math.cos(Math.PI / 6), S = .5;
type V = [number, number, number];
const P = (x: number, y: number, z: number) => [(x - y) * C, (x + y) * S - z];
const pts = (a: V[]) => a.map(p => P(...p).map(n => n.toFixed(1)).join(',')).join(' ');
const poly = (a: V[], c: string) => `<polygon class="${c}" points="${pts(a)}"/>`;
const line = (a: V[], c = 'l') => `<polyline class="${c}" points="${pts(a)}"/>`;
const dot = (x: number, y: number, z: number, r = 1) => { const [a, b] = P(x, y, z); return `<circle class="dot" cx="${a.toFixed(1)}" cy="${b.toFixed(1)}" r="${r}"/>`; };
const ring = (cx: number, cy: number, z: number, r: number, n = 48): V[] => Array.from({ length: n }, (_, i) => { const t = i / n * 2 * Math.PI; return [cx + r * Math.cos(t), cy + r * Math.sin(t), z]; });
const half = (cx: number, cy: number, z: number, r: number, n = 24): V[] => Array.from({ length: n + 1 }, (_, i) => { const t = (-45 + 180 * i / n) * Math.PI / 180; return [cx + r * Math.cos(t), cy + r * Math.sin(t), z]; });
const box = (x: number, y: number, z: number, w: number, d: number, h: number, top = 'f-top') =>
  poly([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]], 'f-s1 e') + poly([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]], 'f-s2 e') + poly([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]], `${top} e`);
const cyl = (cx: number, cy: number, z0: number, z1: number, r: number, top = 'f-top', side = 'f-s1 e') =>
  poly([...half(cx, cy, z0, r), ...half(cx, cy, z1, r).reverse()], side) + poly(ring(cx, cy, z1, r), `${top} e`);
function gear(cx: number, cy: number, z: number, r: number, teeth: number, angle: number, depth = 4): V[] {
  const out: V[] = [];
  for (let i = 0; i < teeth; i++) {
    const b = angle + i * 2 * Math.PI / teeth, s = Math.PI / teeth;
    for (const [t, rr] of [[b - s * .5, r - depth], [b - s * .25, r], [b + s * .25, r], [b + s * .5, r - depth], [b + s * .75, r - depth]]) out.push([cx + rr * Math.cos(t), cy + rr * Math.sin(t), z]);
  }
  return out;
}

const FW = { x: 110, y: 104, r: 72 }, PN = { x: 178, y: 162, r: 16 }, TK = { x: 305, y: 86, r: 34, z0: 20, z1: 150 }, SL = { x0: 44, x1: 164, y: 200 };
const toX = (p: number) => SL.x0 + (p - MIN_PRICE) / (MAX_PRICE - MIN_PRICE) * (SL.x1 - SL.x0);
const toP = (x: number) => Math.max(MIN_PRICE, Math.min(MAX_PRICE, (x - SL.x0) / (SL.x1 - SL.x0) * (MAX_PRICE - MIN_PRICE) + MIN_PRICE));

const STATIC = (() => {
  let s = '';
  for (const [x, y] of [[14, 14], [346, 14], [14, 211], [346, 211]]) s += cyl(x, y, -7, 0, 7, 'f-s0', 'f-s3 e');
  s += box(0, 0, 0, 360, 225, 10);
  for (let i = 0; i <= 36; i++) { const x = 6 + i * 9.5; s += line([[x, 219, 10], [x, i % 5 ? 216 : 212, 10]], i % 5 ? 'l faint' : 'l'); }
  for (const [x, y] of [[10, 10], [350, 10], [10, 215], [350, 215]]) s += dot(x, y, 10, 1.1);
  s += cyl(FW.x, FW.y, 10, 16, 30, 'f-top', 'f-s2 e') + cyl(FW.x, FW.y, 16, 26, 20);
  return s;
})();
function moving(angle: number, price: number, level: number, t: number) {
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
  const feed: V[] = [[206, 86, 22], [271, 86, 22]], drain: V[] = [[TK.x + 24, TK.y + 24, 16], [TK.x + 24, 204, 16], [TK.x + 24, 210, 12]];
  for (const pipe of [feed, drain]) s += line(pipe, 'pipe-out') + line(pipe, 'pipe-in');
  const flow = Math.max(0, gearbox(price).grossProfit) / BASE.grossProfit;
  s += `<polyline class="flow in" style="stroke-dashoffset:${(-t * .02 * flow).toFixed(1)}" points="${pts(feed)}"/>`;
  s += `<polyline class="flow out" style="stroke-dashoffset:${(-t * .016).toFixed(1)}" points="${pts(drain)}"/>`;
  for (const p of [[206, 86, 22], [262, 86, 22]] as V[]) { const [x, y] = P(...p); s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.6" class="f-top e"/>`; }
  s += box(TK.x + 14, 204, 10, 20, 14, 3, 'f-s3');
  for (let i = 0; i < 4; i++) s += line([[TK.x + 17 + i * 4.5, 206, 13], [TK.x + 17 + i * 4.5, 216, 13]], 'l mid');
  // Cash tank: collar, liquid at the current level, glass, scale, bands and cap.
  const { x, y, r, z1: top } = TK, lz = TK.z0 + 4 + level * (top - TK.z0 - 12);
  s += cyl(x, y, 10, TK.z0, r + 5) + cyl(x, y, TK.z0, lz, r - 3, 'liquid-top', 'liquid');
  s += poly([...half(x, y, TK.z0, r), ...half(x, y, top, r).reverse()], 'glass');
  for (let i = 0; i <= 12; i++) { const z = TK.z0 + 6 + i * (top - TK.z0 - 14) / 12, a = Math.PI / 4 + .35, d = i % 4 ? .08 : .16; s += line([[x + r * Math.cos(a), y + r * Math.sin(a), z], [x + r * Math.cos(a + d), y + r * Math.sin(a + d), z]], i % 4 ? 'l mid' : 'l hi'); }
  for (const z of [60, 108]) s += line(half(x, y, z, r + 1.5), 'l hi');
  s += cyl(x, y, top, top + 8, r + 5) + cyl(x, y, top + 8, top + 14, 10, 'f-lit', 'f-s2 e');
  // Price lever on its slotted quadrant, with a tick for every percentage point.
  s += box(SL.x0 - 14, SL.y - 12, 10, SL.x1 - SL.x0 + 28, 24, 9);
  s += poly([[SL.x0, SL.y - 2.5, 19], [SL.x1, SL.y - 2.5, 19], [SL.x1, SL.y + 2.5, 19], [SL.x0, SL.y + 2.5, 19]], 'f-s0 e');
  for (let i = 0; i <= 20; i++) { const p = MIN_PRICE + i * .01, xx = toX(p), major = i % 5 === 0; s += line([[xx, SL.y + 6, 19], [xx, SL.y + (major ? 11 : 8.5), 19]], Math.abs(p) < 1e-9 ? 'l hi' : major ? 'l mid' : 'l faint'); }
  for (const [a, b] of [[SL.x0 - 9, SL.y - 7], [SL.x1 + 9, SL.y - 7], [SL.x0 - 9, SL.y + 7], [SL.x1 + 9, SL.y + 7]]) s += dot(a, b, 19, .9);
  const kx = toX(price), [bx, by] = P(kx, SL.y, 44);
  s += `<g class="knob">${cyl(kx, SL.y, 19, 23, 7, 'f-top', 'f-s2 e')}${cyl(kx, SL.y, 23, 40, 2.4)}<circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="6.5" class="f-lit e"/></g>`;
  return s;
}

const fmt = (n: number, d = 1) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(d)}`;
export function readout(p: number) {
  const g = gearbox(p);
  return [`price ${fmt(p * 100, 0)}% · volume ${fmt(g.volume - 100, 0)}% · margin ${(g.margin * 100).toFixed(1)}%`, `gross profit ${g.grossProfit.toFixed(1)} (${fmt((g.grossProfit / BASE.grossProfit - 1) * 100, 0)}%) · cash ${fmt(g.cash)} a year`];
}

export default function MarginGearbox({ price, onPrice, title = 'Margin gearbox', figure = 1 }: { price: number; onPrice: (p: number) => void; title?: string; figure?: number }) {
  const svg = useRef<SVGSVGElement>(null), layer = useRef<SVGGElement>(null), out = useRef<HTMLSpanElement>(null);
  const target = useRef(price), onPriceRef = useRef(onPrice);
  target.current = price; onPriceRef.current = onPrice;

  useEffect(() => {
    let shown = target.current, angle = 0, level = .55, last = 0, raf = 0, visible = true;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const io = new IntersectionObserver(e => { visible = e[0].isIntersecting; }); if (svg.current) io.observe(svg.current);
    const frame = (now: number) => {
      const dt = Math.min(.05, (now - (last || now)) / 1000); last = now;
      shown += (target.current - shown) * (reduced ? 1 : 1 - Math.exp(-dt * 8));
      const g = gearbox(shown);
      if (!reduced) { angle += dt * .9 * Math.max(0, g.grossProfit) / BASE.grossProfit; level = Math.max(.04, Math.min(.96, level + dt * g.cash / 120)); }
      if (visible && layer.current) layer.current.innerHTML = moving(angle, shown, level, now);
      if (out.current) { const [a, b] = readout(shown); out.current.firstChild!.textContent = a; out.current.lastChild!.textContent = b; out.current.dataset.loss = String(g.cash < 0); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, []);

  // Drag the knob along its slot, or use the arrow keys when the figure has focus.
  useEffect(() => {
    const el = svg.current; if (!el) return;
    let dragging = false;
    const worldX = (e: PointerEvent) => { const m = el.getScreenCTM(); if (!m) return null; const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()); return (q.x - P(0, SL.y, 0)[0]) / C; };
    const down = (e: PointerEvent) => { if (!(e.target as Element).closest('.knob, .slot-hit')) return; dragging = true; el.setPointerCapture(e.pointerId); move(e); };
    const move = (e: PointerEvent) => { if (!dragging) return; const x = worldX(e); if (x != null) onPriceRef.current(Math.round(toP(x) * 100) / 100); };
    const up = () => { dragging = false; };
    const key = (e: KeyboardEvent) => { if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return; e.preventDefault(); onPriceRef.current(Math.max(MIN_PRICE, Math.min(MAX_PRICE, Math.round((target.current + (e.key === 'ArrowLeft' ? -.01 : .01)) * 100) / 100))); };
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('keydown', key);
    return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); el.removeEventListener('keydown', key); };
  }, []);

  const [a, b] = readout(price), slot = [P(SL.x0 - 6, SL.y - 8, 19), P(SL.x1 + 6, SL.y - 8, 19), P(SL.x1 + 6, SL.y + 8, 19), P(SL.x0 - 6, SL.y + 8, 19)].map(p => p.join(',')).join(' ');
  return <figure className="iso-card">
    <div className="iso-stage">
    <span className="iso-corner tl">Fig {figure}</span>
    <span className="iso-corner tr">{title}</span>
    <svg ref={svg} className="iso" viewBox="-212 -26 535 336" tabIndex={0} role="slider" aria-label="Price lever" aria-valuemin={MIN_PRICE * 100} aria-valuemax={MAX_PRICE * 100} aria-valuenow={Math.round(price * 100)} aria-valuetext={`${a}; ${b}`}>
      <g dangerouslySetInnerHTML={{ __html: STATIC }} />
      <g ref={layer} />
      <polygon className="slot-hit" points={slot} />
    </svg>
    <span className="iso-corner bl">Drag the price lever · ← →</span>
    <span className="iso-corner br" ref={out} aria-hidden="true"><span>{a}</span><br /><span>{b}</span></span>
    </div>
    <figcaption>
      <span className="iso-legend"><i className="in" />gross profit in</span><span className="iso-legend"><i className="out" />overheads out</span><span className="iso-legend"><i />flywheel speed = gross profit</span>
      <p>An illustrative retailer: 100 units at a price of 1.00, unit cost 0.67 (a 33% gross margin), fixed overheads of 27, and volume moving 1.5% for every 1% change in price. The flywheel turns at the speed of gross profit; the tank holds the year’s cash after overheads.</p>
    </figcaption>
  </figure>;
}
