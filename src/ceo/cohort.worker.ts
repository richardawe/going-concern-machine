import { scoreCohort, type Submission } from './cohort';
import type { CaseDef, StartCompany } from './types';
// Grading a class replays every student's decisions across the judgement worlds; this keeps the page responsive.
self.onmessage = (e: MessageEvent<{ start: StartCompany; caseDef: CaseDef; submissions: Submission[] }>) => {
  const { start, caseDef, submissions } = e.data;
  (self as unknown as Worker).postMessage(scoreCohort(start, caseDef, submissions));
};
