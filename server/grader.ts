import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { ArchetypeFile } from '../src/ceo/archetypes';
import type { Payload } from '../src/course/types';
import type { Db } from './db';
import { gradePayload, snapshot, type Grades } from './grading';

// A small queue in the database: hand-ins with no grades yet. Each server process claims one at a time with
// FOR UPDATE SKIP LOCKED, so several PM2 workers share the load without grading anything twice, and anything left
// half-done by a restart is picked up again two minutes later.

type Job = { tenant_id: string; course_id: string; user_id: string; code: string; payload: Payload; snapshot_id: string };

function workerGrader() {
  // Bundled: dist-server/grade-worker.js next to main.js. Under tsx (dev and tests): the .ts file, loaded through tsx.
  const js = fileURLToPath(new URL('./grade-worker.js', import.meta.url)), ts = fileURLToPath(new URL('./grade-worker.ts', import.meta.url));
  const bundled = existsSync(js);
  let worker: Worker | null = null, next = 0;
  const waiting = new Map<number, { resolve: (g: Grades) => void; reject: (e: Error) => void }>();
  const get = () => {
    if (worker) return worker;
    worker = bundled ? new Worker(js) : new Worker(ts, { execArgv: ['--import', 'tsx'] });
    worker.on('message', (m: { id: number; grades?: Grades; error?: string }) => {
      const w = waiting.get(m.id); waiting.delete(m.id);
      if (m.error) w?.reject(new Error(m.error)); else w?.resolve(m.grades!);
    });
    worker.on('error', e => { for (const w of waiting.values()) w.reject(e); waiting.clear(); worker = null; });
    worker.on('exit', () => { worker = null; });
    worker.unref();
    return worker;
  };
  return {
    grade: (payload: Payload, archetypes: ArchetypeFile) => new Promise<Grades>((resolve, reject) => {
      const id = ++next; waiting.set(id, { resolve, reject }); get().postMessage({ id, payload, archetypes });
    }),
    stop: async () => { await worker?.terminate(); worker = null; },
  };
}

export function createGrader(db: Db, mode: 'on' | 'off' | 'inline', log: (msg: string, err?: unknown) => void) {
  const w = mode === 'on' ? workerGrader() : null;
  const grade = (p: Payload, a: ArchetypeFile) => w ? w.grade(p, a) : Promise.resolve(gradePayload(p, a));
  let running = false, timer: NodeJS.Timeout | null = null, again = false;

  /** Grades one waiting hand-in; returns false when the queue is empty. */
  async function runOnce(): Promise<boolean> {
    const job = await db.platform(async q => {
      const j = await q.maybe<Job>(
        `select tenant_id, course_id, user_id, code, payload, snapshot_id from submissions
          where grades is null and grade_error is null and (grading_claimed_at is null or grading_claimed_at < now() - interval '2 minutes')
          order by handed_in_at limit 1 for update skip locked`);
      if (j) await q.exec('update submissions set grading_claimed_at = now() where course_id = $1 and user_id = $2', [j.course_id, j.user_id]);
      return j;
    });
    if (!job) return false;
    let grades: Grades | null = null, error: string | null = null;
    try { grades = await grade(job.payload, await snapshot(db, job.snapshot_id)); }
    catch (e) { error = e instanceof Error ? e.message : String(e); log('Grading failed', e); }
    // Only store the result if the student hasn't handed in again meanwhile (the code would differ).
    await db.platform(q => q.exec(
      'update submissions set grades = $3, grade_error = $4, grading_claimed_at = null where course_id = $1 and user_id = $2 and code = $5',
      [job.course_id, job.user_id, grades ? JSON.stringify(grades) : null, error, job.code]));
    return true;
  }

  async function drain() {
    if (running) { again = true; return; }
    running = true;
    try { do { again = false; while (await runOnce()); } while (again); }
    catch (e) { log('The grading queue stopped', e); }
    finally { running = false; }
  }

  return {
    runOnce, drain,
    kick: () => { if (mode !== 'off') void drain(); },
    start: () => { if (mode === 'on' && !timer) { timer = setInterval(() => void drain(), 5_000); timer.unref(); void drain(); } },
    stop: async () => { if (timer) clearInterval(timer); timer = null; await w?.stop(); },
  };
}
