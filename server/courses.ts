import { buildPayload, stats, validatePayload, verificationCode } from '../src/course/payload';
import { submissionPdf } from '../src/course/pdf';
import type { Course, ModuleProgress, Payload } from '../src/course/types';
import type { Q } from './db';
import { fail } from './http';
import type { Grades } from './grading';

// Shared by the student and lecturer routes: reading a course, building a hand-in from saved progress, and the PDF.

export interface CourseRow {
  id: string; tenant_id: string; code: string; title: string; term: string; modules: string[]; due_at: string | null;
  late_policy: 'flag' | 'block'; join_code: string; join_open: boolean; snapshot_id: string; archived: boolean; created_at: string;
}
export const COURSE_COLUMNS = 'c.id, c.tenant_id, c.code, c.title, c.term, c.modules, c.due_at, c.late_policy, c.join_code, c.join_open, c.snapshot_id, c.archived, c.created_at';

export async function staffNames(q: Q, courseId: string): Promise<string> {
  const rows = await q.many<{ name: string; email: string }>(
    'select u.name, u.email from course_staff s join users u on u.id = s.user_id where s.course_id = $1 order by u.name', [courseId]);
  return rows.map(r => r.name || r.email).join(', ') || 'Your lecturer';
}

export const ukDate = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** The Course shape the shared course code (payload, PDF) expects. */
export const asCourse = (c: CourseRow, lecturer: string): Course => ({ id: c.id, code: c.code, title: c.title, lecturer, due: c.due_at ? ukDate(c.due_at) : undefined, modules: c.modules });

/** When this student's work is due: the course date, or their extension if later. */
export const dueFor = (c: CourseRow, extension: string | null) => !c.due_at ? null : extension && extension > c.due_at ? extension : c.due_at;

/** A hand-in built on the server from the student's saved progress and their account, then checked like any untrusted input. */
export async function buildHandIn(q: Q, c: CourseRow, user: { id: string; name: string; email: string; student_id: string }, lecturer: string, at: Date) {
  const rows = await q.many<{ module_id: string; data: ModuleProgress }>('select module_id, data from module_progress where course_id = $1 and user_id = $2', [c.id, user.id]);
  const modules: Record<string, ModuleProgress> = {};
  for (const r of rows) if (c.modules.includes(r.module_id)) modules[r.module_id] = r.data;
  const draft = buildPayload({ course: c.id, student: { name: user.name, id: user.student_id, email: user.email }, modules }, asCourse(c, lecturer), at.toISOString());
  const checked = validatePayload(JSON.parse(JSON.stringify(draft)));
  if (!checked.ok) return fail(400, `Your saved work couldn’t be handed in: ${checked.error}`);
  return { payload: checked.payload, course: asCourse(c, lecturer), code: await verificationCode(checked.payload), stats: stats(checked.payload) };
}

/** The PDF, built from the stored hand-in alone, so the student's and lecturer's copies are always byte-for-byte identical. */
export function handInPdf(s: { payload: Payload; course_info: Course; code: string; grades: Grades | null }) {
  if (!s.grades) return fail(409, 'This hand-in is still being graded. Try again in a few seconds.');
  return submissionPdf({ payload: s.payload, course: s.course_info, code: s.code, grades: s.grades });
}
