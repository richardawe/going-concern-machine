// Seeded randomness. Every draw is keyed by (seed, labels), not by call order, so replaying a game with one decision
// changed sees exactly the same luck everywhere else. That is what makes counterfactuals fair.
export function hash(...parts: (string | number)[]): number {
  let h = 2166136261;
  for (const ch of parts.join('|')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/** Uniform in [0, 1). */
export function uniform(...parts: (string | number)[]): number {
  let t = hash(...parts) + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
/** Standard normal via Box–Muller. */
export function normal(...parts: (string | number)[]): number {
  const u = Math.max(1e-12, uniform(...parts, 'a')), v = uniform(...parts, 'b');
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
