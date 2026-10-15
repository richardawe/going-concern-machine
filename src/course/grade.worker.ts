import { debrief } from '../ceo/assess';
import type { StartCompany } from '../ceo/types';
import { gradeModule, moduleGame } from './grade';
import { moduleById } from './modules';

// Grading replays the case a few thousand times; running it here keeps the page responsive.
// 'grade' returns the grades only (for PDFs); 'debrief' also returns the module debrief.
const post = (m: unknown) => (self as unknown as Worker).postMessage(m);
self.onmessage = (e: MessageEvent<{ id: number; kind: 'grade' | 'debrief'; module: string; start: StartCompany; cards: (string | null)[] }>) => {
  const { id, kind, module, start, cards } = e.data;
  try {
    const def = moduleById(module)!, grade = gradeModule(def, start, cards);
    if (kind === 'grade') { post({ id, grade }); return; }
    const d = debrief(moduleGame(def, start, cards), 0);
    post({ id, grade, debrief: { you: d.you, statusQuo: d.statusQuo, reference: d.reference, attribution: d.attribution, lessons: d.lessons } });
  } catch (err) { post({ id, error: err instanceof Error ? err.message : 'Grading failed.' }); }
};
