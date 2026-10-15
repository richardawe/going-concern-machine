import { gameScore, gradeFor, judgement, strategySpace, verdict } from '../ceo/assess';
import type { ArchetypeFile } from '../ceo/archetypes';
import { cases } from '../ceo/cases';
import { fictionalCompany, prepareStart } from '../ceo/company';
import { play, statusQuo } from '../ceo/game';
import type { CaseDef, Game, StartCompany } from '../ceo/types';
import type { ModuleDef } from './types';

// Grades are recomputed from a student's card choices every time a submission is read, in the browser and in the
// intake Action alike. Modules play the case on its own fictional company with default levers, so a module's world is
// fixed by the case seed and the published industry archetypes.

export const caseFor = (m: ModuleDef): CaseDef => {
  const c = cases.find(x => x.id === m.caseId); if (!c) throw new Error(`Module ${m.id} has no case.`);
  return c;
};
export function moduleStart(m: ModuleDef, archetypes: ArchetypeFile): StartCompany {
  const caseDef = caseFor(m), a = archetypes.archetypes.find(x => x.id === caseDef.archetype);
  if (!a) throw new Error(`The ${caseDef.archetype} industry archetype is not available.`);
  return prepareStart(fictionalCompany(a, caseDef.seed), caseDef.setup);
}
export function moduleGame(m: ModuleDef, start: StartCompany, cards: (string | null)[]): Game {
  const caseDef = caseFor(m), base = statusQuo(start, cards.length);
  return { start, caseDef, seed: caseDef.seed, decisions: base.map((d, i) => ({ ...d, card: cards[i] })) };
}

export interface ModuleGrade {
  outcome: { grade: string; percentile: number; score: number };
  judgement: { grade: string; percentile: number };
  verdict: string; emergencies: number; finalCash: number; startCash: number; revenueGrowth: number; currency: string;
}
/** Outcome ranks the result among every card strategy in this world; judgement ranks the choices across 12 worlds. */
export function gradeModule(m: ModuleDef, start: StartCompany, cards: (string | null)[]): ModuleGrade {
  const game = moduleGame(m, start, cards), records = play(game), card = gameScore(game, records);
  const space = strategySpace(game).paths.map(p => p.overall);
  const pct = (space.filter(s => s < card.overall).length + .5 * space.filter(s => s === card.overall).length) / space.length;
  const j = judgement(game), first = records[0].state, last = records.at(-1)!.state;
  return {
    outcome: { grade: gradeFor(pct), percentile: pct, score: card.overall },
    judgement: { grade: j.grade, percentile: j.percentile },
    verdict: verdict(j.percentile, pct).title,
    emergencies: records.filter(r => r.emergency > 0).length,
    finalCash: last.cash, startCash: first.cash,
    revenueGrowth: Math.pow(last.revenue / first.revenue, 1 / Math.max(1, records.length - 1)) - 1,
    currency: start.baseline.currency,
  };
}
