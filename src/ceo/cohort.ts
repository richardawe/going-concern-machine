import { describeDecision, gradeFor, judgeAgainst, judgementBenchmark, score, strategySpace, verdict, type Judgement } from './assess';
import { decodeChallenge, extractCodes, worldKey, type Challenge } from './challenge';
import { findCard, play, statusQuo } from './game';
import type { CaseDef, Dimension, Game, StartCompany } from './types';

// Instructor view: grade a whole class from the results codes students hand in. Every grade is recomputed here from the
// decisions in the code (nothing a student sends can claim a score), and it all runs in the instructor's browser.
export type Submission = Challenge & { caseDef: CaseDef };
export interface Rejected { entry: number; reason: string }
export interface Parsed { submissions: Submission[]; rejected: Rejected[]; key: string | null }

/** Reads pasted text into submissions for one world: the assignment's if given, otherwise the most common one. */
export function parseSubmissions(text: string, expect?: { caseId: string; choice: Challenge['choice']; sandbox?: Challenge['sandbox']; id?: string }): Parsed {
  const codes = extractCodes(text), decoded = codes.map(decodeChallenge);
  const counts = new Map<string, number>();
  for (const d of decoded) if (d) counts.set(worldKey(d), (counts.get(worldKey(d)) ?? 0) + 1);
  const key = expect ? worldKey(expect) : [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const submissions: Submission[] = [], rejected: Rejected[] = [];
  decoded.forEach((d, i) => {
    if (!d) rejected.push({ entry: i + 1, reason: 'Not a valid results code (incomplete or edited)' });
    else if (worldKey(d) !== key) rejected.push({ entry: i + 1, reason: `Played a different scenario or company${d.name ? ` (${d.name})` : ''}` });
    else if (expect?.id && d.assignment && d.assignment !== expect.id) rejected.push({ entry: i + 1, reason: `From a different assignment${d.name ? ` (${d.name})` : ''}` });
    else if (d.decisions.length !== d.caseDef.turns.length) rejected.push({ entry: i + 1, reason: 'Unfinished game' });
    else submissions.push(d);
  });
  return { submissions, rejected, key };
}

export interface CohortRow {
  name: string; duplicate: boolean; judgement: Judgement;
  outcome: { score: number; percentile: number; grade: string }; scores: Record<Dimension, number>;
  verdict: string; decisions: string[]; cards: (string | null)[];
}
export interface Pattern { year: number; choices: { label: string; count: number; judgement: number }[] }
export interface Cohort { rows: CohortRow[]; patterns: Pattern[]; caseTitle: string; company: string; strategies: number }

export function scoreCohort(start: StartCompany, caseDef: CaseDef, submissions: Submission[]): Cohort {
  const n = caseDef.turns.length, base: Game = { start, caseDef, seed: caseDef.seed, decisions: statusQuo(start, n) };
  // Computed once for the class: the strategy benchmark for judgement, and every card strategy's score for outcome.
  const bench = judgementBenchmark(base), space = strategySpace(base).paths.map(p => p.overall);
  const rank = (x: number) => (space.filter(s => s < x).length + .5 * space.filter(s => s === x).length) / space.length;
  const seen = new Map<string, number>();
  for (const s of submissions) { const k = (s.name ?? '').toLowerCase(); seen.set(k, (seen.get(k) ?? 0) + 1); }
  const rows = submissions.map((s, i): CohortRow => {
    const game = { ...base, decisions: s.decisions }, records = play(game);
    const card = score(records, caseDef.weights, start.params.baseAttrition, start.baseline.assumptions.demandGrowth, start.baseline.assumptions.taxRate);
    const j = judgeAgainst(game, bench), outcome = { score: card.overall, percentile: rank(card.overall), grade: gradeFor(rank(card.overall)) };
    return { name: s.name ?? `Unnamed ${i + 1}`, duplicate: (seen.get((s.name ?? '').toLowerCase()) ?? 0) > 1, judgement: j, outcome, scores: card.scores, verdict: verdict(j.percentile, outcome.percentile).title, decisions: s.decisions.map((_, y) => describeDecision(game, y)), cards: s.decisions.map(d => d.card) };
  });
  const patterns: Pattern[] = Array.from({ length: n }, (_, y) => {
    const by = new Map<string, number[]>();
    rows.forEach(r => { const label = findCard(base, y + 1, r.cards[y])?.title ?? 'Hold course'; by.set(label, [...(by.get(label) ?? []), r.judgement.percentile]); });
    return { year: y + 1, choices: [...by.entries()].map(([label, js]) => ({ label, count: js.length, judgement: js.reduce((a, b) => a + b, 0) / js.length })).sort((a, b) => b.count - a.count) };
  });
  return { rows, patterns, caseTitle: caseDef.title, company: start.name, strategies: bench.scored.length };
}

const csvCell = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : s; };
/** Spreadsheet-safe CSV (formula-looking names are neutralised). */
export function cohortCsv(c: Cohort): string {
  const years = c.rows[0]?.decisions.length ?? 0;
  const head = ['Student', 'Judgement grade', 'Judgement percentile', 'Outcome grade', 'Outcome score', 'Outcome percentile', 'Verdict', 'Value', 'Survival', 'Growth', 'People', 'Customers', ...Array.from({ length: years }, (_, i) => `Year ${i + 1}`)];
  const lines = c.rows.map(r => [r.name, r.judgement.grade, Math.round(r.judgement.percentile * 100), r.outcome.grade, r.outcome.score, Math.round(r.outcome.percentile * 100), r.verdict, r.scores.value, r.scores.survival, r.scores.growth, r.scores.people, r.scores.customers, ...r.decisions]);
  return [head, ...lines].map(l => l.map(csvCell).join(',')).join('\n') + '\n';
}
