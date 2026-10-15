import type { Outcome, Attribution } from '../../ceo/assess';
import type { StartCompany } from '../../ceo/types';
import type { ModuleGrade } from '../grade';
import { gradeModule, moduleGame } from '../grade';
import { debrief as runDebrief } from '../../ceo/assess';
import { moduleById } from '../modules';

export interface ModuleDebrief { you: Outcome; statusQuo: Outcome; reference: Outcome; attribution: Attribution[]; lessons: string[] }
export interface Graded { grade: ModuleGrade; debrief?: ModuleDebrief }

let worker: Worker | null = null, next = 0;
const waiting = new Map<number, (r: Graded | { error: string }) => void>();
function getWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('../grade.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number } & (Graded | { error: string })>) => { waiting.get(e.data.id)?.(e.data); waiting.delete(e.data.id); };
    worker.onerror = () => { worker = null; };
  } catch { worker = null; }
  return worker;
}
/** Grades (and optionally the debrief) for one module, off the main thread where workers are available. */
export function grade(kind: 'grade' | 'debrief', module: string, start: StartCompany, cards: (string | null)[]): Promise<Graded> {
  const w = getWorker();
  if (!w) return new Promise(resolve => setTimeout(() => {
    const def = moduleById(module)!, g = gradeModule(def, start, cards);
    resolve(kind === 'grade' ? { grade: g } : { grade: g, debrief: runDebrief(moduleGame(def, start, cards), 0) });
  }, 30));
  const id = ++next;
  return new Promise((resolve, reject) => { waiting.set(id, r => 'error' in r ? reject(new Error(r.error)) : resolve(r)); w.postMessage({ id, kind, module, start, cards }); });
}
