import type { FastifyPluginAsync } from 'fastify';
import { zipSync } from 'fflate';
import { z } from 'zod';
import { modules as allModules } from '../../src/course/modules';
import { pdfName } from '../../src/course/pdf';
import { stats } from '../../src/course/payload';
import type { Course, Payload } from '../../src/course/types';
import { audit } from '../audit';
import { formatJoin, joinCode } from '../crypto';
import { COURSE_COLUMNS, handInPdf, ukDate, type CourseRow } from '../courses';
import type { Q } from '../db';
import { currentSnapshotId, type Grades } from '../grading';
import { attachment, csvCell, fail, needUser, parse, type Deps, type User } from '../http';

// The lecturer side. Lecturers see the courses they teach; a university admin sees every course at the university.

const ready = new Set(allModules.filter(m => m.ready).map(m => m.id));
const CourseBody = z.object({
  title: z.string().trim().min(2, 'Give the course a title.').max(120),
  code: z.string().trim().min(1, 'Give the course a code, such as FIN 7102.').max(30),
  term: z.string().trim().max(40).default(''),
  modules: z.array(z.string()).min(1, 'Choose at least one module.').max(12).refine(m => m.every(id => ready.has(id)) && new Set(m).size === m.length, 'Choose modules from the list.'),
  dueAt: z.string().datetime({ offset: true, message: 'Enter a valid due date.' }).nullable().default(null),
  latePolicy: z.enum(['flag', 'block']).default('flag'),
  coLecturers: z.array(z.string().trim().toLowerCase().email()).max(10).default([]),
});

type Roster = {
  user_id: string; name: string; email: string; student_id: string; joined_at: string; extension_until: string | null; status: string;
  complete: number; started: number; last_saved: string | null;
  payload: Payload | null; code: string | null; handed_in_at: string | null; late: boolean | null; attempt: number | null; grades: Grades | null; grade_error: string | null;
};

export const teachRoutes: FastifyPluginAsync<Deps> = async (app, d) => {
  const teacher = (req: Parameters<typeof needUser>[0]) => needUser(req, ['lecturer', 'admin']);

  async function teachable(q: Q, u: User, courseId: string): Promise<CourseRow> {
    if (!/^[0-9a-f-]{36}$/.test(courseId)) return fail(404, 'That course doesn’t exist.');
    const c = await q.maybe<CourseRow & { mine: boolean }>(`select ${COURSE_COLUMNS}, exists (select 1 from course_staff s where s.course_id = c.id and s.user_id = $2) as mine from courses c where c.id = $1`, [courseId, u.id]);
    if (!c) return fail(404, 'That course doesn’t exist.');
    if (!c.mine && u.role !== 'admin') return fail(403, 'You don’t teach this course.');
    return c;
  }
  async function addStaff(q: Q, tenantId: string, courseId: string, emails: string[]) {
    const missing: string[] = [];
    for (const email of emails) {
      const s = await q.maybe<{ id: string }>("select id from users where tenant_id = $1 and email = $2 and role in ('lecturer', 'admin') and status <> 'deactivated'", [tenantId, email]);
      if (!s) { missing.push(email); continue; }
      await q.exec('insert into course_staff (tenant_id, course_id, user_id) values ($1, $2, $3) on conflict do nothing', [tenantId, courseId, s.id]);
    }
    if (missing.length) return fail(400, `${missing.join(', ')} ${missing.length === 1 ? 'isn’t a lecturer' : 'aren’t lecturers'} here yet. Ask your university admin to invite them first.`);
  }
  const roster = (q: Q, courseId: string) => q.many<Roster>(
    `select u.id as user_id, u.name, u.email, u.student_id, e.joined_at, e.extension_until, u.status,
            (select count(*) from module_progress p where p.course_id = e.course_id and p.user_id = u.id and p.data->>'stage' = 'complete')::int as complete,
            (select count(*) from module_progress p where p.course_id = e.course_id and p.user_id = u.id)::int as started,
            (select max(updated_at) from module_progress p where p.course_id = e.course_id and p.user_id = u.id) as last_saved,
            s.payload, s.code, s.handed_in_at, s.late, s.attempt, s.grades, s.grade_error
       from enrolments e join users u on u.id = e.user_id left join submissions s on s.course_id = e.course_id and s.user_id = u.id
      where e.course_id = $1 order by lower(coalesce(nullif(u.name, ''), u.email))`, [courseId]);
  const gradeText = (g: Grades | null) => g ? Object.entries(g).filter(([, x]) => x).map(([id, x]) => `${allModules.find(m => m.id === id)?.number ?? id}: ${x!.outcome.grade}/${x!.judgement.grade}`).join(' · ') : '';
  const courseOut = async (q: Q, c: CourseRow) => ({
    id: c.id, code: c.code, title: c.title, term: c.term, modules: c.modules, dueAt: c.due_at, latePolicy: c.late_policy,
    joinCode: formatJoin(c.join_code), joinOpen: c.join_open, archived: c.archived, snapshotId: c.snapshot_id, createdAt: c.created_at,
    staff: await q.many<{ id: string; name: string; email: string }>('select u.id, u.name, u.email from course_staff s join users u on u.id = s.user_id where s.course_id = $1 order by u.name', [c.id]),
  });

  app.get('/api/teach/courses', async req => {
    const u = teacher(req);
    return d.db.tenant(u.tenant.id, async q => {
      const rows = await q.many<CourseRow & { mine: boolean; enrolled: number; handed_in: number; late: number; in_progress: number }>(
        `select ${COURSE_COLUMNS}, exists (select 1 from course_staff s where s.course_id = c.id and s.user_id = $1) as mine,
                (select count(*) from enrolments e where e.course_id = c.id)::int as enrolled,
                (select count(*) from submissions s where s.course_id = c.id)::int as handed_in,
                (select count(*) from submissions s where s.course_id = c.id and s.late)::int as late,
                (select count(distinct p.user_id) from module_progress p where p.course_id = c.id and not exists (select 1 from submissions s where s.course_id = c.id and s.user_id = p.user_id))::int as in_progress
           from courses c where c.tenant_id = $3 and ($2 or exists (select 1 from course_staff s where s.course_id = c.id and s.user_id = $1))
          order by c.archived, coalesce(c.due_at, c.created_at) desc`, [u.id, u.role === 'admin', u.tenant.id]);
      return Promise.all(rows.map(async c => ({ ...(await courseOut(q, c)), mine: c.mine, enrolled: c.enrolled, handedIn: c.handed_in, late: c.late, inProgress: c.in_progress })));
    });
  });

  app.post('/api/teach/courses', async req => {
    const u = teacher(req), body = parse(CourseBody, req.body), snapshotId = await currentSnapshotId(d.db, d.config.STATIC_DIR);
    return d.db.tenant(u.tenant.id, async q => {
      let id = '';
      for (let i = 0; i < 5 && !id; i++) {
        const code = joinCode();
        if (await q.maybe('select 1 from courses where tenant_id = $1 and join_code = $2', [u.tenant.id, code])) continue;
        id = (await q.one<{ id: string }>(
          `insert into courses (tenant_id, code, title, term, modules, due_at, late_policy, join_code, snapshot_id, created_by)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
          [u.tenant.id, body.code, body.title, body.term, body.modules, body.dueAt, body.latePolicy, code, snapshotId, u.id])).id;
      }
      await q.exec('insert into course_staff (tenant_id, course_id, user_id) values ($1, $2, $3)', [u.tenant.id, id, u.id]);
      await addStaff(q, u.tenant.id, id, body.coLecturers.filter(e => e !== u.email));
      await audit(q, req, 'course.create', `${body.code} ${body.title}`, { courseId: id });
      return courseOut(q, await teachable(q, u, id));
    });
  });

  app.get<{ Params: { id: string } }>('/api/teach/courses/:id', async req => {
    const u = teacher(req);
    return d.db.tenant(u.tenant.id, async q => courseOut(q, await teachable(q, u, req.params.id)));
  });

  app.patch<{ Params: { id: string } }>('/api/teach/courses/:id', async req => {
    const u = teacher(req);
    const body = parse(CourseBody.omit({ coLecturers: true }).partial().extend({ joinOpen: z.boolean().optional(), archived: z.boolean().optional(), newJoinCode: z.boolean().optional() }), req.body);
    return d.db.tenant(u.tenant.id, async q => {
      const c = await teachable(q, u, req.params.id);
      await q.exec(
        `update courses set title = coalesce($2, title), code = coalesce($3, code), term = coalesce($4, term), modules = coalesce($5, modules),
                due_at = case when $6 then $7::timestamptz else due_at end, late_policy = coalesce($8, late_policy), join_open = coalesce($9, join_open),
                archived = coalesce($10, archived), join_code = coalesce($11, join_code) where id = $1`,
        [c.id, body.title ?? null, body.code ?? null, body.term ?? null, body.modules ?? null, body.dueAt !== undefined, body.dueAt ?? null,
          body.latePolicy ?? null, body.joinOpen ?? null, body.archived ?? null, body.newJoinCode ? joinCode() : null]);
      await audit(q, req, 'course.update', `${c.code} ${c.title}`, { courseId: c.id, changed: Object.keys(body) });
      return courseOut(q, await teachable(q, u, c.id));
    });
  });

  app.post<{ Params: { id: string } }>('/api/teach/courses/:id/staff', async req => {
    const u = teacher(req), { email } = parse(z.object({ email: z.string().trim().toLowerCase().email('Enter the lecturer’s university email.') }), req.body);
    return d.db.tenant(u.tenant.id, async q => {
      const c = await teachable(q, u, req.params.id);
      await addStaff(q, u.tenant.id, c.id, [email]);
      await audit(q, req, 'course.staff.add', email, { courseId: c.id });
      return courseOut(q, c);
    });
  });
  app.delete<{ Params: { id: string; userId: string } }>('/api/teach/courses/:id/staff/:userId', async req => {
    const u = teacher(req);
    return d.db.tenant(u.tenant.id, async q => {
      const c = await teachable(q, u, req.params.id);
      const { n } = await q.one<{ n: number }>('select count(*)::int as n from course_staff where course_id = $1', [c.id]);
      if (n <= 1) return fail(400, 'A course needs at least one lecturer.');
      await q.exec('delete from course_staff where course_id = $1 and user_id = $2', [c.id, req.params.userId]);
      await audit(q, req, 'course.staff.remove', req.params.userId, { courseId: c.id });
      return courseOut(q, c);
    });
  });

  app.get<{ Params: { id: string } }>('/api/teach/courses/:id/roster', async req => {
    const u = teacher(req);
    return d.db.tenant(u.tenant.id, async q => {
      const c = await teachable(q, u, req.params.id);
      const rows = await roster(q, c.id);
      return rows.map(r => {
        const s = r.payload ? stats(r.payload) : null;
        return {
          userId: r.user_id, name: r.name, email: r.email, studentId: r.student_id, joinedAt: r.joined_at, extensionUntil: r.extension_until, deactivated: r.status === 'deactivated',
          status: r.handed_in_at ? 'handed-in' : r.started ? 'in-progress' : 'not-started',
          modulesComplete: r.payload ? s!.completed : r.complete, lastSaved: r.last_saved,
          changedSinceHandIn: !!(r.handed_in_at && r.last_saved && r.last_saved > r.handed_in_at),
          handIn: r.handed_in_at ? { code: r.code, handedInAt: r.handed_in_at, late: r.late, attempt: r.attempt, words: s!.words, responses: s!.responses, pasted: s!.pasted, grades: r.grades, gradeError: r.grade_error } : null,
        };
      });
    });
  });

  app.get<{ Params: { id: string; userId: string } }>('/api/teach/courses/:id/students/:userId', async req => {
    const u = teacher(req);
    return d.db.tenant(u.tenant.id, async q => {
      const c = await teachable(q, u, req.params.id);
      const r = (await roster(q, c.id)).find(x => x.user_id === req.params.userId);
      if (!r) return fail(404, 'That student isn’t on this course.');
      return {
        course: { id: c.id, code: c.code, title: c.title, modules: c.modules, dueAt: c.due_at },
        student: { userId: r.user_id, name: r.name, email: r.email, studentId: r.student_id, joinedAt: r.joined_at, extensionUntil: r.extension_until, modulesComplete: r.complete, lastSaved: r.last_saved },
        handIn: r.payload && { payload: r.payload, code: r.code, handedInAt: r.handed_in_at, late: r.late, attempt: r.attempt, grades: r.grades, gradeError: r.grade_error, stats: stats(r.payload) },
      };
    });
  });

  app.put<{ Params: { id: string; userId: string } }>('/api/teach/courses/:id/students/:userId/extension', async req => {
    const u = teacher(req), { until } = parse(z.object({ until: z.string().datetime({ offset: true, message: 'Enter a valid date.' }).nullable() }), req.body);
    return d.db.tenant(u.tenant.id, async q => {
      const c = await teachable(q, u, req.params.id);
      const n = await q.exec('update enrolments set extension_until = $3 where course_id = $1 and user_id = $2', [c.id, req.params.userId, until]);
      if (!n) return fail(404, 'That student isn’t on this course.');
      await audit(q, req, until ? 'extension.set' : 'extension.clear', req.params.userId, { courseId: c.id, until });
      return { extensionUntil: until };
    });
  });

  app.get<{ Params: { id: string; userId: string } }>('/api/teach/courses/:id/students/:userId/hand-in.pdf', async (req, reply) => {
    const u = teacher(req);
    const s = await d.db.tenant(u.tenant.id, async q => {
      const c = await teachable(q, u, req.params.id);
      return q.maybe<{ payload: Payload; course_info: Course; code: string; grades: Grades | null }>('select payload, course_info, code, grades from submissions where course_id = $1 and user_id = $2', [c.id, req.params.userId]);
    });
    if (!s) return fail(404, 'This student hasn’t handed in.');
    return attachment(reply, pdfName(s.course_info, s.payload), 'application/pdf').send(Buffer.from(await handInPdf(s)));
  });

  app.get<{ Params: { id: string } }>('/api/teach/courses/:id/export.csv', async (req, reply) => {
    const u = teacher(req);
    const { c, rows } = await d.db.tenant(u.tenant.id, async q => { const c = await teachable(q, u, req.params.id); return { c, rows: await roster(q, c.id) }; });
    const head = ['Name', 'Student ID', 'Email', 'Status', 'Handed in (UK time)', 'Late', 'Attempts', 'Modules complete', 'Typed responses', 'Words', 'Pasted answers', 'Extension until', 'Grades (outcome/judgement)', 'Verification'];
    const lines = rows.map(r => {
      const s = r.payload ? stats(r.payload) : null;
      return [r.name, r.student_id, r.email, r.handed_in_at ? 'Handed in' : r.started ? 'In progress' : 'Not started', r.handed_in_at ? ukDate(r.handed_in_at) : '',
        r.late ? 'Yes' : '', r.attempt ?? '', s ? s.completed : r.complete, s?.responses ?? '', s?.words ?? '', s?.pasted ?? '', r.extension_until ? ukDate(r.extension_until) : '',
        gradeText(r.grades), r.code ?? ''].map(csvCell).join(',');
    });
    return attachment(reply, `${c.code.replace(/\s+/g, '')}-hand-ins.csv`, 'text/csv; charset=utf-8').send('﻿' + [head.join(','), ...lines].join('\r\n'));
  });

  app.get<{ Params: { id: string } }>('/api/teach/courses/:id/hand-ins.zip', async (req, reply) => {
    const u = teacher(req);
    const { c, subs } = await d.db.tenant(u.tenant.id, async q => {
      const c = await teachable(q, u, req.params.id);
      return { c, subs: await q.many<{ payload: Payload; course_info: Course; code: string; grades: Grades | null }>('select payload, course_info, code, grades from submissions where course_id = $1', [c.id]) };
    });
    if (!subs.length) return fail(404, 'Nobody has handed in yet.');
    if (subs.some(s => !s.grades)) return fail(409, 'Some hand-ins are still being graded. Try again in a minute.');
    const files: Record<string, Uint8Array> = {};
    for (const s of subs) {
      let name = pdfName(s.course_info, s.payload);
      for (let i = 2; files[name]; i++) name = name.replace(/(_\d+)?\.pdf$/, `_${i}.pdf`);
      files[name] = await handInPdf(s);
    }
    return attachment(reply, `${c.code.replace(/\s+/g, '')}-hand-ins.zip`, 'application/zip').send(Buffer.from(zipSync(files, { level: 0 })));
  });
};
