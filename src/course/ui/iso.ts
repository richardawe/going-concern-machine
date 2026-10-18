// Isometric drawing kit shared by the module figures. World coordinates: x and y on the floor, z up; every figure
// stands on the same 360 × 225 base plate, with its lever in a slotted quadrant at the front left.

export const C = Math.cos(Math.PI / 6), S = .5;
export type V = [number, number, number];
export const P = (x: number, y: number, z: number) => [(x - y) * C, (x + y) * S - z];
export const pts = (a: V[]) => a.map(p => P(...p).map(n => n.toFixed(1)).join(',')).join(' ');
export const poly = (a: V[], c: string) => `<polygon class="${c}" points="${pts(a)}"/>`;
export const line = (a: V[], c = 'l') => `<polyline class="${c}" points="${pts(a)}"/>`;
export const dot = (x: number, y: number, z: number, r = 1, c = 'dot') => { const [a, b] = P(x, y, z); return `<circle class="${c}" cx="${a.toFixed(1)}" cy="${b.toFixed(1)}" r="${r}"/>`; };
export const ring = (cx: number, cy: number, z: number, r: number, n = 48): V[] => Array.from({ length: n }, (_, i) => { const t = i / n * 2 * Math.PI; return [cx + r * Math.cos(t), cy + r * Math.sin(t), z]; });
export const half = (cx: number, cy: number, z: number, r: number, n = 24): V[] => Array.from({ length: n + 1 }, (_, i) => { const t = (-45 + 180 * i / n) * Math.PI / 180; return [cx + r * Math.cos(t), cy + r * Math.sin(t), z]; });
export const box = (x: number, y: number, z: number, w: number, d: number, h: number, top = 'f-top') =>
  poly([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]], 'f-s1 e') + poly([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]], 'f-s2 e') + poly([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]], `${top} e`);
export const cyl = (cx: number, cy: number, z0: number, z1: number, r: number, top = 'f-top', side = 'f-s1 e') =>
  poly([...half(cx, cy, z0, r), ...half(cx, cy, z1, r).reverse()], side) + poly(ring(cx, cy, z1, r), `${top} e`);
export function gear(cx: number, cy: number, z: number, r: number, teeth: number, angle: number, depth = 4): V[] {
  const out: V[] = [];
  for (let i = 0; i < teeth; i++) {
    const b = angle + i * 2 * Math.PI / teeth, s = Math.PI / teeth;
    for (const [t, rr] of [[b - s * .5, r - depth], [b - s * .25, r], [b + s * .25, r], [b + s * .5, r - depth], [b + s * .75, r - depth]]) out.push([cx + rr * Math.cos(t), cy + rr * Math.sin(t), z]);
  }
  return out;
}
/** A toothed wheel lying flat at height z0–z1, with spokes and a lit hub, turned to `angle`. */
export function wheel(cx: number, cy: number, z0: number, z1: number, r: number, teeth: number, angle: number, spokes = 6) {
  let s = cyl(cx, cy, z0, z1 - .1, r - 4) + poly(gear(cx, cy, z1, r, teeth, angle, Math.min(4, r / 5)), 'f-top e');
  if (r > 24) s += line([...ring(cx, cy, z1, r - 10, 48), ring(cx, cy, z1, r - 10, 48)[0]], 'l mid');
  for (let k = 0; k < spokes; k++) { const a = angle + k * 2 * Math.PI / spokes; s += line([[cx + .2 * r * Math.cos(a), cy + .2 * r * Math.sin(a), z1], [cx + (r - 10) * Math.cos(a), cy + (r - 10) * Math.sin(a), z1]], 'l hi'); }
  return s + cyl(cx, cy, z1, z1 + 5, Math.max(4, r * .18), 'f-lit', 'f-s2 e');
}
/** A pipe along a path, with dashes moving along it at a speed set by `offset` (in-flow or out-flow colours). */
export const pipe = (path: V[], flow: 'in' | 'out', offset: number, width?: number) =>
  line(path, 'pipe-out') + line(path, 'pipe-in') + `<polyline class="flow ${flow}" style="stroke-dashoffset:${offset.toFixed(1)}${width ? `;stroke-width:${width.toFixed(2)}` : ''}" points="${pts(path)}"/>`;
/** A glass tank with liquid filled to `level` (0–1). */
export function tank(x: number, y: number, z0: number, z1: number, r: number, level: number) {
  const lz = z0 + 4 + Math.max(0, Math.min(1, level)) * (z1 - z0 - 12);
  let s = cyl(x, y, 10, z0, r + 5) + cyl(x, y, z0, lz, r - 3, 'liquid-top', 'liquid');
  s += poly([...half(x, y, z0, r), ...half(x, y, z1, r).reverse()], 'glass');
  for (let i = 0; i <= 12; i++) { const z = z0 + 6 + i * (z1 - z0 - 14) / 12, a = Math.PI / 4 + .35, d = i % 4 ? .08 : .16; s += line([[x + r * Math.cos(a), y + r * Math.sin(a), z], [x + r * Math.cos(a + d), y + r * Math.sin(a + d), z]], i % 4 ? 'l mid' : 'l hi'); }
  for (const z of [z0 + (z1 - z0) * .3, z0 + (z1 - z0) * .68]) s += line(half(x, y, z, r + 1.5), 'l hi');
  return s + cyl(x, y, z1, z1 + 8, r + 5) + cyl(x, y, z1 + 8, z1 + 14, 10, 'f-lit', 'f-s2 e');
}
/** A flat dial seen from above: a scale arc from a0 to a1 (radians), with a needle at fraction f. */
export function dial(x: number, y: number, z: number, r: number, f: number, danger = 0) {
  const a0 = Math.PI * .75, a1 = Math.PI * 2.25, at = (t: number) => a0 + (a1 - a0) * t;
  let s = cyl(x, y, z - 6, z, r + 3, 'f-top', 'f-s2 e');
  for (let i = 0; i <= 10; i++) { const a = at(i / 10), rr = i % 5 ? r - 3 : r - 5; s += line([[x + r * Math.cos(a), y + r * Math.sin(a), z], [x + rr * Math.cos(a), y + rr * Math.sin(a), z]], i % 5 ? 'l mid' : 'l hi'); }
  if (danger > 0) s += line(Array.from({ length: 9 }, (_, i) => { const a = at(1 - danger + danger * i / 8); return [x + (r - 1.5) * Math.cos(a), y + (r - 1.5) * Math.sin(a), z] as V; }), 'l warn');
  const a = at(Math.max(0, Math.min(1, f)));
  return s + line([[x, y, z + .5], [x + (r - 4) * Math.cos(a), y + (r - 4) * Math.sin(a), z + .5]], 'l needle') + cyl(x, y, z, z + 2, 2.2, 'f-lit', 'f-s2 e');
}

export const PLATE = (() => {
  let s = '';
  for (const [x, y] of [[14, 14], [346, 14], [14, 211], [346, 211]]) s += cyl(x, y, -7, 0, 7, 'f-s0', 'f-s3 e');
  s += box(0, 0, 0, 360, 225, 10);
  for (let i = 0; i <= 36; i++) { const x = 6 + i * 9.5; s += line([[x, 219, 10], [x, i % 5 ? 216 : 212, 10]], i % 5 ? 'l faint' : 'l'); }
  for (const [x, y] of [[10, 10], [350, 10], [10, 215], [350, 215]]) s += dot(x, y, 10, 1.1);
  return s;
})();

/** The lever's slotted quadrant at the front left of the plate. */
export const SL = { x0: 44, x1: 164, y: 200 };
export function lever(f: number, ticks: number, home: number) {
  let s = box(SL.x0 - 14, SL.y - 12, 10, SL.x1 - SL.x0 + 28, 24, 9);
  s += poly([[SL.x0, SL.y - 2.5, 19], [SL.x1, SL.y - 2.5, 19], [SL.x1, SL.y + 2.5, 19], [SL.x0, SL.y + 2.5, 19]], 'f-s0 e');
  for (let i = 0; i <= ticks; i++) { const xx = SL.x0 + i / ticks * (SL.x1 - SL.x0), major = i % 5 === 0; s += line([[xx, SL.y + 6, 19], [xx, SL.y + (major ? 11 : 8.5), 19]], i === home ? 'l hi' : major ? 'l mid' : 'l faint'); }
  for (const [a, b] of [[SL.x0 - 9, SL.y - 7], [SL.x1 + 9, SL.y - 7], [SL.x0 - 9, SL.y + 7], [SL.x1 + 9, SL.y + 7]]) s += dot(a, b, 19, .9);
  const kx = SL.x0 + f * (SL.x1 - SL.x0), [bx, by] = P(kx, SL.y, 44);
  return s + `<g class="knob">${cyl(kx, SL.y, 19, 23, 7, 'f-top', 'f-s2 e')}${cyl(kx, SL.y, 23, 40, 2.4)}<circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="6.5" class="f-lit e"/></g>`;
}
export const slotHit = () => [P(SL.x0 - 6, SL.y - 8, 19), P(SL.x1 + 6, SL.y - 8, 19), P(SL.x1 + 6, SL.y + 8, 19), P(SL.x0 - 6, SL.y + 8, 19)].map(p => p.join(',')).join(' ');

/** Signed number with a true minus sign. */
export const fmt = (n: number, d = 1) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(d)}`;
export const pct = (n: number, d = 0) => `${(n * 100).toFixed(d)}%`;
