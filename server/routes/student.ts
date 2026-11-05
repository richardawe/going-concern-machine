import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { pdfName } from '../../src/course/pdf';
import type { Course, Payload } from '../../src/course/types';
import { parseJoin } from '../crypto';
import { COURSE_COLUMNS, buildHandIn, dueFor, handInPdf, staffNames, ukDate, type CourseRow } from '../courses';
import { receiptMail } from '../email';
import type { Grades } from '../grading';
import { snapshot } from '../grading';
import { tenantOrigin } from '../hosts';
import { attachment, fail, needUser, parse, type Deps } from '../http';

// The student side: join a course, autosave each module, hand in, and get the receipt and PDF.

const MAX_PROGRESS_BYTES = 200_000;
const Progress = z.object({
  stage: z.enum(['briefing', 'concepts', 'decisions', 'debrief', 'check', 'complete']),
  concept: z.number().int().min(0).max(50),
  concepts: z.record(z.unknown()), decisions: z.array(z.unknown()).max(12), check: z.record(z.unknown()), checked: z.boolean(),
}).passthrough();

type Submission = { payload: Payload; course_info: Course; code: string; handed_in_at: string; late: boolean; attempt: number; grades: Grades | null; grade_error: string | null };

export const studentRoutes: FastifyPluginAsync<Deps> = async (app, d) => {
  /** The course, if this student is enrolled on it. */
  async function enrolled(tenantId: string, userId: string, courseId: string) {
    if (!/^[0-9a-f-]{36}$/.test(courseId)) return fail(404, 'That course doesn’t exist.');
    const row = await d.db.tenant(tenantId, q => q.maybe<CourseRow & { extension_until: string | null }>(
      `select ${COURSE_COLUMNS}, e.extension_until from courses c join enrolments e on e.course_id = c.id and e.user_id = $2 where c.id = $1`, [courseId, userId]));
    return row ?? fail(404, 'You’re not on that course. Use the join link your lecturer gave you.');
  }
  const receipt = (s: Submission | null) => s && ({
    code: s.code, handedInAt: s.handed_in_at, late: s.late, attempt: s.attempt, graded: !!s.grades, gradeError: !!s.grade_error,
    modulesComplete: s.payload.modules.filter(m => m.completed).length,
  });

  app.get('/api/my/courses', async req => {
    const u = needUser(req);
    return d.db.tenant(u.tenant.id, async q => {
      const rows = await q.many<CourseRow & { extension_until: string | null; complete: number; started: number; handed_in_at: string | null; late: boolean | null; changed: boolean }>(
        `select ${COURSE_COLUMNS}, e.extension_until,
                (select count(*) from module_progress p where p.course_id = c.id and p.user_id = $1 and p.data->>'stage' = 'complete' and p.module_id = any(c.modules))::int as complete,
                (select count(*) from module_progress p where p.course_id = c.id and p.user_id = $1)::int as started,
                s.handed_in_at, s.late,
                exists (select 1 from module_progress p where p.course_id = c.id and p.user_id = $1 and p.updated_at > s.handed_in_at) as changed
           from enrolments e join courses c on c.id = e.course_id left join submissions s on s.course_id = c.id and s.user_id = $1
          where e.user_id = $1 and not c.archived order by coalesce(c.due_at, c.created_at)`, [u.id]);
      return Promise.all(rows.map(async c => ({
        id: c.id, code: c.code, title: c.title, term: c.term, lecturer: await staffNames(q, c.id), modules: c.modules,
        dueAt: dueFor(c, c.extension_until), extended: !!c.extension_until, complete: c.complete, started: c.started > 0,
        handedInAt: c.handed_in_at, late: c.late, changedSinceHandIn: !!c.changed,
      })));
    });
  });

  app.post('/api/join', async req => {
    const u = needUser(req);
    const { code } = parse(z.object({ code: z.string().trim().min(4, 'Enter the course code your lecturer gave you.').max(20) }), req.body);
    return d.db.tenant(u.tenant.id, async q => {
      const c = await q.maybe<{ id: string; title: string; join_open: boolean; archived: boolean }>('select id, title, join_open, archived from courses where tenant_id = $1 and join_code = $2', [u.tenant.id, parseJoin(code)]);
      if (!c) return fail(404, 'No course has that code. Check it with your lecturer.');
      if (await q.maybe('select 1 from course_staff where course_id = $1 and user_id = $2', [c.id, u.id])) return fail(400, 'You teach this course, so you can’t join it as a student.');
      if (await q.maybe('select 1 from enrolments where course_id = $1 and user_id = $2', [c.id, u.id])) return { courseId: c.id, title: c.title, already: true };
      if (!c.join_open || c.archived) return fail(403, 'This course isn’t taking new students. Ask your lecturer.');
      await q.exec('insert into enrolments (tenant_id, course_id, user_id) values ($1, $2, $3)', [u.tenant.id, c.id, u.id]);
      return { courseId: c.id, title: c.title, already: false };
    });
  });

  app.get<{ Params: { id: string } }>('/api/courses/:id', async req => {
    const u = needUser(req), c = await enrolled(u.tenant.id, u.id, req.params.id);
    const [lecturer, s] = await d.db.tenant(u.tenant.id, async q => [await staffNames(q, c.id),
      await q.maybe<Submission>('select payload, course_info, code, handed_in_at, late, attempt, grades, grade_error from submissions where course_id = $1 and user_id = $2', [c.id, u.id])] as const);
    const due = dueFor(c, c.extension_until);
    return {
      id: c.id, code: c.code, title: c.title, term: c.term, lecturer, modules: c.modules, snapshotId: c.snapshot_id,
      dueAt: due, dueText: due ? ukDate(due) : null, extended: !!c.extension_until, latePolicy: c.late_policy, archived: c.archived,
      handIn: receipt(s),
    };
  });

  // The data snapshot a course grades against; immutable, so browsers may cache it for good.
  app.get<{ Params: { id: string } }>('/api/courses/:id/snapshot', async (req, reply) => {
    const u = needUser(req), c = await enrolled(u.tenant.id, u.id, req.params.id);
    return reply.header('cache-control', 'private, max-age=31536000, immutable').send(await snapshot(d.db, c.snapshot_id));
  });

  app.get<{ Params: { id: string } }>('/api/courses/:id/progress', async req => {
    const u = needUser(req), c = await enrolled(u.tenant.id, u.id, req.params.id);
    const rows = await d.db.tenant(u.tenant.id, q => q.many<{ module_id: string; data: unknown; version: number; updated_at: string }>(
      'select module_id, data, version, updated_at from module_progress where course_id = $1 and user_id = $2', [c.id, u.id]));
    return { modules: Object.fromEntries(rows.map(r => [r.module_id, { data: r.data, version: r.version, updatedAt: r.updated_at }])) };
  });

  // Autosave. The client sends the version it started from; a mismatch (another tab or device saved first) returns
  // the newer copy instead of overwriting it.
  app.put<{ Params: { id: string; module: string } }>('/api/courses/:id/progress/:module', async (req, reply) => {
    const u = needUser(req), c = await enrolled(u.tenant.id, u.id, req.params.id);
    if (!c.modules.includes(req.params.module)) return fail(404, 'That module isn’t part of this course.');
    const body = parse(z.object({ version: z.number().int().min(0), data: Progress }), req.body);
    const json = JSON.stringify(body.data);
    if (json.length > MAX_PROGRESS_BYTES) return fail(413, 'This module’s answers are too long to save. Shorten the longest answers.');
    return d.db.tenant(u.tenant.id, async q => {
      const cur = await q.maybe<{ data: unknown; version: number }>('select data, version from module_progress where course_id = $1 and user_id = $2 and module_id = $3 for update', [c.id, u.id, req.params.module]);
      if ((cur?.version ?? 0) !== body.version) return reply.code(409).send({ error: 'This module was saved from another tab or device.', data: cur?.data ?? null, version: cur?.version ?? 0 });
      if (!cur) await q.exec('insert into module_progress (tenant_id, course_id, user_id, module_id, data) values ($1, $2, $3, $4, $5)', [u.tenant.id, c.id, u.id, req.params.module, json]);
      else await q.exec('update module_progress set data = $4, version = version + 1, updated_at = now() where course_id = $1 and user_id = $2 and module_id = $3', [c.id, u.id, req.params.module, json]);
      return { version: body.version + 1 };
    });
  });

  app.post<{ Params: { id: string } }>('/api/courses/:id/hand-in', async req => {
    const u = needUser(req), c = await enrolled(u.tenant.id, u.id, req.params.id);
    parse(z.object({ confirm: z.literal(true, { errorMap: () => ({ message: 'Confirm that the answers are your own work.' }) }) }), req.body);
    if (c.archived) return fail(403, 'This course is closed.');
    if (!u.name.trim()) return fail(400, 'Add your full name on the Account page first. It goes on your hand-in.');
    const now = new Date(), due = dueFor(c, c.extension_until), late = !!due && now.toISOString() > due;
    if (late && c.late_policy === 'block') return fail(403, `The deadline (${ukDate(due!)}) has passed and this course doesn’t accept late work. Ask your lecturer for an extension.`);
    const result = await d.db.tenant(u.tenant.id, async q => {
      const h = await buildHandIn(q, c, u, await staffNames(q, c.id), now);
      if (!h.stats.responses) return fail(400, 'There’s nothing to hand in yet. Start a module first.');
      const row = await q.one<{ attempt: number; handed_in_at: string }>(
        `insert into submissions (tenant_id, course_id, user_id, payload, course_info, code, handed_in_at, late, snapshot_id)
              values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         on conflict (course_id, user_id) do update set payload = excluded.payload, course_info = excluded.course_info, code = excluded.code,
              handed_in_at = excluded.handed_in_at, late = excluded.late, snapshot_id = excluded.snapshot_id, attempt = submissions.attempt + 1,
              grades = null, grade_error = null, grading_claimed_at = null
         returning attempt, handed_in_at`,
        [u.tenant.id, c.id, u.id, JSON.stringify(h.payload), JSON.stringify(h.course), h.code, now.toISOString(), late, c.snapshot_id]);
      return { ...h, ...row };
    });
    d.kickGrader();
    const url = `${tenantOrigin(u.tenant.slug, d.config.BASE_DOMAIN, d.config.SECURE_COOKIES, d.config.SECURE_COOKIES ? undefined : d.config.PORT)}/courses/${c.id}/hand-in`;
    d.mailer.send(receiptMail(u.email, { course: `${c.code} ${c.title}`, code: result.code, when: `${ukDate(result.handed_in_at)} UK time`, late, url, university: u.tenant.name }))
      .catch(e => req.log.warn({ err: e }, 'Receipt email failed'));
    return { code: result.code, handedInAt: result.handed_in_at, late, attempt: result.attempt, graded: false, gradeError: false, modulesComplete: result.stats.completed, stats: result.stats };
  });

  app.get<{ Params: { id: string } }>('/api/courses/:id/hand-in', async req => {
    const u = needUser(req), c = await enrolled(u.tenant.id, u.id, req.params.id);
    const s = await d.db.tenant(u.tenant.id, q => q.maybe<Submission>('select payload, course_info, code, handed_in_at, late, attempt, grades, grade_error from submissions where course_id = $1 and user_id = $2', [c.id, u.id]));
    return { handIn: receipt(s), payload: s?.payload ?? null };
  });

  app.get<{ Params: { id: string } }>('/api/courses/:id/hand-in.pdf', async (req, reply) => {
    const u = needUser(req), c = await enrolled(u.tenant.id, u.id, req.params.id);
    const s = await d.db.tenant(u.tenant.id, q => q.maybe<Submission>('select payload, course_info, code, handed_in_at, late, attempt, grades, grade_error from submissions where course_id = $1 and user_id = $2', [c.id, u.id]));
    if (!s) return fail(404, 'You haven’t handed in yet.');
    const pdf = await handInPdf(s);
    return attachment(reply, pdfName(s.course_info, s.payload), 'application/pdf').send(Buffer.from(pdf));
  });
};
