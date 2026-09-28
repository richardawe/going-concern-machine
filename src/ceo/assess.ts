import { clamp, ratio } from '../model/config';
import { defaultLevers, findCard, play, statusQuo } from './game';
import { uniform } from './random';
import { dimensions, type Decision, type Dimension, type Game, type Levers, type YearRecord } from './types';

// The debrief. Every score is a published formula over the played years, and every comparison replays the same seed,
// so differences come from decisions, not luck.
export const dimensionLabels: Record<Dimension, string> = { value: 'Value creation', survival: 'Survival & liquidity', growth: 'Growth', people: 'People', customers: 'Customers' };
// Each dimension measures the change the CEO made to the business, not how good it was to begin with: 50 means it
// kept pace with its starting position; the logistic curve never saturates, so strong companies still show differences.
export const dimensionFormulas: Record<Dimension, string> = {
  value: '100 × σ(Δ / 3pp), Δ = average economic profit / revenue over the played years − the Year 0 level. Economic profit = NOPAT − cost of capital × (invested capital + all new debt and equity raised).',
  survival: '100 × σ(Δ / 5pp) − 25 per emergency loan, Δ = lowest (cash − new borrowing) / revenue in any year − Year 0 cash / revenue.',
  growth: '100 × σ(Δ / 4pp), Δ = revenue CAGR − the starting market growth assumption.',
  people: '100 × σ(Δ / 0.1), Δ = (final morale − 0.7 neutral) − 2 × average attrition above normal.',
  customers: '100 × σ(Δ / 0.1), Δ = customer activity vs its trend path + 3 × change in retention.',
};
export interface Scorecard { scores: Record<Dimension, number>; overall: number }
const sigmoid = (x: number) => 100 / (1 + Math.exp(-x));

export function score(records: YearRecord[], weights: Record<Dimension, number>, baseAttrition: number, trend: number, taxRate: number): Scorecard {
  const played = records.slice(1), first = records[0], last = records.at(-1)!, n = played.length;
  const avg = (f: (r: YearRecord) => number) => n ? played.reduce((x, r) => x + f(r), 0) / n : 0;
  const ep = (r: YearRecord) => ratio(r.state.operatingProfit * (1 - taxRate) - r.state.costOfCapital * (r.state.investedCapital + r.raised), r.state.revenue);
  const netCash = (r: YearRecord) => ratio(r.state.cash - Math.max(0, r.state.debt - first.state.debt), r.state.revenue), cash0 = ratio(first.state.cash, first.state.revenue);
  const cagr = n ? Math.pow(Math.max(1e-9, last.state.revenue / first.state.revenue), 1 / n) - 1 : trend;
  const emergencies = played.filter(r => r.emergency > 0).length;
  const scores: Record<Dimension, number> = {
    value: n ? sigmoid((avg(ep) - ep(first)) / .03) : 50,
    survival: n ? sigmoid((Math.min(...played.map(netCash)) - cash0) / .05) - 25 * emergencies : 50,
    growth: sigmoid((cagr - trend) / .04),
    people: sigmoid((last.people.morale - .7 - 2 * avg(r => Math.max(0, r.people.attrition - baseAttrition))) / .1),
    customers: sigmoid((ratio(last.state.customers, first.state.customers * Math.pow(1 + trend, n), 1) - 1 + 3 * (last.state.retention - first.state.retention)) / .1),
  };
  for (const d of dimensions) scores[d] = Math.round(clamp(scores[d], 0, 100));
  const total = dimensions.reduce((x, d) => x + weights[d], 0);
  return { scores, overall: Math.round(dimensions.reduce((x, d) => x + scores[d] * weights[d], 0) / total) };
}
export const gameScore = (game: Game, records = play(game)) => score(records, game.caseDef.weights, game.start.params.baseAttrition, game.start.baseline.assumptions.demandGrowth, game.start.baseline.assumptions.taxRate);

export interface Outcome { label: string; records: YearRecord[]; card: Scorecard }
export interface Attribution { year: number; title: string; delta: { overall: number; revenue: number; cash: number; cumulativeFcf: number; morale: number } }
export interface Debrief { you: Outcome; statusQuo: Outcome; reference: Outcome; attribution: Attribution[]; luck: { you: number[]; statusQuo: number[] }; lessons: string[];
  /** Where your result ranks among every card strategy the case allows (default levers), in the same world. */
  space: { scores: number[]; best: { overall: number; cards: (string | null)[] }; percentile: number; grade: string; total: number; sampled: boolean } }

export const MAX_STRATEGIES = 1500;
/** Every path through the cards, played with default levers; above MAX_STRATEGIES paths, a fixed random sample. */
export function strategySpace(game: Game) {
  const n = game.decisions.length, base = statusQuo(game.start, n);
  const options = Array.from({ length: n }, (_, i) => [null, ...(game.caseDef.turns.find(t => t.year === i + 1)?.cards.map(c => c.id) ?? [])]);
  const total = options.reduce((x, o) => x * o.length, 1), sampled = total > MAX_STRATEGIES;
  const paths: (string | null)[][] = [];
  if (sampled) for (let k = 0; k < 1000; k++) paths.push(options.map((o, i) => o[Math.floor(uniform(game.seed, 'strategy', k, i) * o.length)]));
  else { const walk = (i: number, cards: (string | null)[]) => { if (i === n) paths.push(cards); else for (const id of options[i]) walk(i + 1, [...cards, id]); }; walk(0, []); }
  const out = paths.map(cards => ({ cards, overall: gameScore({ ...game, decisions: base.map((d, j) => ({ ...d, card: cards[j] })) }).overall }));
  return { paths: out.sort((a, b) => a.overall - b.overall), total, sampled };
}
export const gradeFor = (percentile: number) => percentile >= .9 ? 'A' : percentile >= .7 ? 'B' : percentile >= .45 ? 'C' : percentile >= .2 ? 'D' : 'E';

const cumulativeFcf = (r: YearRecord[]) => r.slice(1).reduce((n, x) => n + x.state.freeCashFlow, 0);
const standing = ['pay', 'reinvestment', 'marketing', 'rd', 'people', 'dividends'] as const;
const leverNames: Record<keyof Levers, string> = { price: 'price', workforce: 'staffing', pay: 'pay', reinvestment: 'reinvestment', marketing: 'marketing', rd: 'R&D', people: 'training', dividends: 'dividends' };
const priorLevers = (game: Game, i: number): Levers => i === 0 ? defaultLevers(game.start) : game.decisions[i - 1].levers;
/** What changed in year i+1 relative to the year before: a card, one-off moves, or new standing policies. */
export function leverChanges(game: Game, i: number): [keyof Levers, number][] {
  const now = game.decisions[i].levers, before = priorLevers(game, i);
  return [...(['price', 'workforce'] as const).filter(k => now[k] !== 0).map(k => [k, now[k]] as [keyof Levers, number]), ...standing.filter(k => now[k] !== before[k]).map(k => [k, now[k] - before[k]] as [keyof Levers, number])];
}
export function describeDecision(game: Game, i: number): string {
  const card = findCard(game, i + 1, game.decisions[i].card)?.title;
  const levers = leverChanges(game, i).map(([k, v]) => `${leverNames[k]} ${v > 0 ? '+' : '−'}${Math.abs(v)}`).join(', ');
  return [card, levers].filter(Boolean).join(' · ') || 'Hold course';
}
/** The decisions with year i+1 turned into "hold course", or null when it already was. */
export function undoDecision(game: Game, i: number): Decision[] | null {
  if (!game.decisions[i].card && !leverChanges(game, i).length) return null;
  const before = priorLevers(game, i), set = game.decisions[i].levers, out = structuredClone(game.decisions);
  out[i] = { card: null, levers: { ...before, price: 0, workforce: 0 } };
  for (const k of standing) for (let j = i + 1; j < out.length && game.decisions[j].levers[k] === set[k]; j++) out[j].levers[k] = before[k];
  return out;
}
export function referenceDecisions(game: Game): Decision[] {
  const sq = statusQuo(game.start, game.decisions.length);
  return sq.map((d, i) => ({ card: game.caseDef.reference[i]?.card ?? null, levers: { ...d.levers, ...game.caseDef.reference[i]?.levers } }));
}

export function debrief(game: Game, luckRuns = 40): Debrief {
  const n = game.decisions.length, outcome = (label: string, decisions: Decision[]): Outcome => { const g = { ...game, decisions }; const records = play(g); return { label, records, card: gameScore(g, records) }; };
  const you = outcome('Your decisions', game.decisions), quo = outcome('Doing nothing', statusQuo(game.start, n)), reference = outcome('Reference path', referenceDecisions(game));
  // Each decision's marginal effect: replay with that decision undone. A standing policy set that year is undone for as
  // long as later years simply kept it; a later change to the same lever is that later year's own decision.
  const attribution = game.decisions.flatMap((d, i): Attribution[] => {
    const without = undoDecision(game, i); if (!without) return [];
    const g = { ...game, decisions: without }, records = play(g), card = gameScore(g, records);
    const last = you.records.at(-1)!, alt = records.at(-1)!;
    return [{ year: i + 1, title: describeDecision(game, i), delta: { overall: you.card.overall - card.overall, revenue: last.state.revenue - alt.state.revenue, cash: last.state.cash - alt.state.cash, cumulativeFcf: cumulativeFcf(you.records) - cumulativeFcf(records), morale: last.people.morale - alt.people.morale } }];
  });
  // Luck: the same decisions in other possible worlds (different demand noise and risk draws; scheduled events stay).
  const runs = (decisions: Decision[]) => Array.from({ length: luckRuns }, (_, k) => gameScore({ ...game, decisions, seed: worldSeed(game, k) }).overall).sort((a, b) => a - b);
  const taken = new Set(game.decisions.map(d => d.card).filter(Boolean));
  const lessons = game.caseDef.lessons.filter(l => l.when === 'always' || (l.when.startsWith('took:') && taken.has(l.when.slice(5))) || (l.when.startsWith('skipped:') && !taken.has(l.when.slice(8))) || (l.when === 'emergency' && you.records.some(r => r.emergency > 0))).map(l => l.note);
  const { paths, total, sampled } = strategySpace(game), scores = paths.map(p => p.overall), best = paths.at(-1)!;
  const percentile = (scores.filter(x => x < you.card.overall).length + .5 * scores.filter(x => x === you.card.overall).length) / scores.length;
  return { you, statusQuo: quo, reference, attribution, luck: { you: runs(game.decisions), statusQuo: runs(statusQuo(game.start, n)) }, lessons, space: { scores, best, percentile, grade: gradeFor(percentile), total, sampled } };
}
export const percentile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)))];

/** The k-th alternative world: same case, same company, different demand swings and risk draws. */
export const worldSeed = (game: Game, k: number) => game.seed * 7919 + k + 1;

export const JUDGEMENT_WORLDS = 12, JUDGEMENT_STRATEGIES = 240;
export interface Judgement {
  /** Share of alternative strategies whose average score across the worlds is below yours (ties count half). */
  percentile: number; grade: string;
  /** Your average score across the worlds, and the same for the benchmarks. */
  expected: number; statusQuo: number; reference: number;
  best: { cards: (string | null)[]; expected: number };
  worlds: number; strategies: number; sampled: boolean;
}
/**
 * Judgement separates the decisions from the luck. The played world plus JUDGEMENT_WORLDS − 1 alternative worlds are
 * replayed for your decisions and for each alternative card strategy (default levers); each strategy is scored by its
 * average across those worlds, and your average is ranked among them. The outcome grade asks "how did it turn out?";
 * this asks "how good were the choices, given what could have happened?"
 */
/** Everything judgement needs that does not depend on the player's decisions: the worlds and every strategy's average
 * across them. Computed once per world, it lets a whole class be graded with a dozen replays per student. */
export interface JudgementBenchmark { seeds: number[]; scored: { cards: (string | null)[]; expected: number }[]; statusQuo: number; reference: number; sampled: boolean }
export function judgementBenchmark(game: Game): JudgementBenchmark {
  const n = game.caseDef.turns.length, base = statusQuo(game.start, n);
  const seeds = [game.seed, ...Array.from({ length: JUDGEMENT_WORLDS - 1 }, (_, k) => worldSeed(game, k))];
  const expected = (decisions: Decision[]) => seeds.reduce((x, seed) => x + gameScore({ ...game, decisions, seed }).overall, 0) / seeds.length;
  const options = Array.from({ length: n }, (_, i) => [null, ...(game.caseDef.turns.find(t => t.year === i + 1)?.cards.map(c => c.id) ?? [])]);
  const total = options.reduce((x, o) => x * o.length, 1), sampled = total > JUDGEMENT_STRATEGIES;
  const paths: (string | null)[][] = [];
  if (sampled) for (let k = 0; k < JUDGEMENT_STRATEGIES; k++) paths.push(options.map((o, i) => o[Math.floor(uniform(game.seed, 'judgement', k, i) * o.length)]));
  else { const walk = (i: number, cards: (string | null)[]) => { if (i === n) paths.push(cards); else for (const id of options[i]) walk(i + 1, [...cards, id]); }; walk(0, []); }
  const scored = paths.map(cards => ({ cards, expected: expected(base.map((d, j) => ({ ...d, card: cards[j] }))) }));
  return { seeds, scored, statusQuo: expected(base), reference: expected(referenceDecisions({ ...game, decisions: base })), sampled };
}
export function judgeAgainst(game: Game, bench: JudgementBenchmark): Judgement {
  const mine = bench.seeds.reduce((x, seed) => x + gameScore({ ...game, seed }).overall, 0) / bench.seeds.length;
  const below = bench.scored.filter(p => p.expected < mine).length, equal = bench.scored.filter(p => p.expected === mine).length;
  const percentile = (below + equal / 2) / bench.scored.length;
  const best = bench.scored.reduce((a, b) => b.expected > a.expected ? b : a);
  return { percentile, grade: gradeFor(percentile), expected: mine, statusQuo: bench.statusQuo, reference: bench.reference, best, worlds: bench.seeds.length, strategies: bench.scored.length, sampled: bench.sampled };
}
export const judgement = (game: Game): Judgement => judgeAgainst(game, judgementBenchmark(game));

/** How judgement and outcome combine, in the words a coach would use. */
export function verdict(judgementPercentile: number, outcomePercentile: number): { title: string; detail: string } {
  const good = (p: number) => p >= .7, poor = (p: number) => p < .45;
  if (good(judgementPercentile) && good(outcomePercentile)) return { title: 'Sound decisions, and they paid off', detail: 'Your choices rank well across the possible worlds, and this world rewarded them.' };
  if (good(judgementPercentile) && poor(outcomePercentile)) return { title: 'Sound decisions, unlucky outcome', detail: 'Across the possible worlds your choices rank well; this particular world went against you. Keep the reasoning, not the regret.' };
  if (poor(judgementPercentile) && good(outcomePercentile)) return { title: 'A lucky result', detail: 'This world flattered your choices. Across the possible worlds the same decisions usually rank lower: do not mistake the outcome for the judgement.' };
  if (poor(judgementPercentile) && poor(outcomePercentile)) return { title: 'The decisions drove a weak result', detail: 'Both the outcome and the choices behind it rank low. The attribution table shows which decisions cost the most.' };
  return { title: 'Middle of the pack', detail: 'Neither clearly strong nor weak: the attribution table shows which decision to rethink first.' };
}
