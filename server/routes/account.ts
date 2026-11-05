import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { attachment, needUser, parse, type Deps } from '../http';

// What every signed-in person can do for themselves: fix their name, see and end their sessions, and download
// everything held about them (a subject access request without anyone else involved).

export const accountRoutes: FastifyPluginAsync<Deps> = async (app, d) => {
  app.get('/api/me', async req => {
    const u = needUser(req);
    return { id: u.id, email: u.email, name: u.name, studentId: u.student_id, role: u.role };
  });

  app.patch('/api/me', async req => {
    const u = needUser(req);
    const body = parse(z.object({
      name: z.string().trim().min(2, 'Enter your full name.').max(100, 'That name is too long.').optional(),
      studentId: z.string().trim().max(40, 'That student ID is too long.').regex(/^[\w ./-]*$/, 'Use letters, digits and - / . only in the student ID.').optional(),
    }), req.body);
    await d.db.tenant(u.tenant.id, q => q.exec('update users set name = coalesce($2, name), student_id = coalesce($3, student_id) where id = $1', [u.id, body.name ?? null, body.studentId ?? null]));
    return { ok: true };
  });

  app.get('/api/me/sessions', async req => {
    const u = needUser(req);
    const rows = await d.db.tenant(u.tenant.id, q => q.many<{ id: string; user_agent: string; created_at: string; last_seen_at: string }>(
      'select id, user_agent, created_at, last_seen_at from sessions where user_id = $1 and expires_at > now() order by last_seen_at desc', [u.id]));
    return rows.map(r => ({ id: r.id, device: r.user_agent, createdAt: r.created_at, lastSeenAt: r.last_seen_at, current: r.id === u.session_id }));
  });

  app.post('/api/me/sessions/sign-out-others', async req => {
    const u = needUser(req);
    const n = await d.db.tenant(u.tenant.id, q => q.exec('delete from sessions where user_id = $1 and id <> $2', [u.id, u.session_id]));
    return { signedOut: n };
  });

  app.get('/api/me/export', async (req, reply) => {
    const u = needUser(req);
    const data = await d.db.tenant(u.tenant.id, async q => ({
      exportedAt: new Date().toISOString(),
      university: u.tenant.name,
      account: await q.one('select email, name, student_id, role, status, created_at, last_seen_at from users where id = $1', [u.id]),
      courses: await q.many(`select c.code, c.title, c.term, e.joined_at, e.extension_until from enrolments e join courses c on c.id = e.course_id where e.user_id = $1`, [u.id]),
      progress: await q.many(`select c.code as course, p.module_id, p.data, p.updated_at from module_progress p join courses c on c.id = p.course_id where p.user_id = $1`, [u.id]),
      handIns: await q.many(`select c.code as course, s.payload, s.code, s.handed_in_at, s.late, s.attempt, s.grades from submissions s join courses c on c.id = s.course_id where s.user_id = $1`, [u.id]),
      signIns: await q.many('select user_agent, created_at, last_seen_at from sessions where user_id = $1', [u.id]),
    }));
    return attachment(reply, `going-concern-my-data-${new Date().toISOString().slice(0, 10)}.json`, 'application/json').send(JSON.stringify(data, null, 1));
  });
};
