import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { audit } from '../audit';
import type { Q } from '../db';
import { inviteMail } from '../email';
import { tenantOrigin } from '../hosts';
import { attachment, domainMatches, emailDomain, fail, needUser, parse, type Deps, type Tenant } from '../http';

// A university's own admin pages: people, branding, terms and a full data export. Email domains, seats and contract
// dates belong to the platform console, because changing who can sign in is a security decision.

export const TERMS_VERSION = '2026-11';

export async function invitePerson(d: Deps, q: Q, req: FastifyRequest, tenant: Pick<Tenant, 'id' | 'name' | 'slug'>, email: string, name: string, role: 'lecturer' | 'admin', by: string) {
  const rules = await q.many<{ domain: string; include_subdomains: boolean }>('select domain, include_subdomains from tenant_domains where tenant_id = $1', [tenant.id]);
  if (!rules.some(r => domainMatches(emailDomain(email), r))) return fail(400, `${email} isn’t on ${tenant.name}’s email domains (${rules.map(r => r.domain).join(', ')}).`);
  const existing = await q.maybe<{ id: string; role: string; status: string }>('select id, role, status from users where tenant_id = $1 and email = $2', [tenant.id, email]);
  let id: string;
  if (existing) {
    if (existing.status === 'deactivated') return fail(400, `${email} is deactivated. Reactivate them first.`);
    await q.exec('update users set role = $2, name = case when name = \'\' then $3 else name end where id = $1', [existing.id, role, name]);
    id = existing.id;
  } else {
    id = (await q.one<{ id: string }>("insert into users (tenant_id, email, name, role, status, invited_by) values ($1, $2, $3, $4, 'invited', $5) returning id",
      [tenant.id, email, name, role, req.user?.id ?? null])).id;
  }
  await audit(q, req, existing ? 'person.role' : 'person.invite', email, { role }, tenant.id);
  const url = `${tenantOrigin(tenant.slug, d.config.BASE_DOMAIN, d.config.SECURE_COOKIES, d.config.SECURE_COOKIES ? undefined : d.config.PORT)}/sign-in?email=${encodeURIComponent(email)}`;
  await d.mailer.send(inviteMail(email, role, tenant.name, url, by));
  return id;
}

export const adminRoutes: FastifyPluginAsync<Deps> = async (app, d) => {
  /** University admins only, and only once the terms are accepted (except for the terms page itself). */
  const admin = (req: FastifyRequest, { terms = true } = {}) => {
    const u = needUser(req, ['admin']);
    if (terms && !u.tenant.terms_accepted_at) return fail(403, 'Accept the terms first.', { terms: true });
    return u;
  };

  app.get('/api/admin/terms', async req => {
    const u = admin(req, { terms: false });
    return { version: TERMS_VERSION, acceptedAt: u.tenant.terms_accepted_at };
  });
  app.post('/api/admin/terms', async req => {
    const u = admin(req, { terms: false });
    parse(z.object({ accept: z.literal(true, { errorMap: () => ({ message: 'Tick the box to accept the terms.' }) }) }), req.body);
    await d.db.tenant(u.tenant.id, async q => {
      await q.exec('update tenants set terms_accepted_at = now(), terms_accepted_by = $2 where id = $1', [u.tenant.id, u.id]);
      await audit(q, req, 'terms.accept', TERMS_VERSION);
    });
    app.forgetTenant(u.tenant.slug);
    return { ok: true };
  });

  app.get('/api/admin/overview', async req => {
    const u = admin(req);
    return d.db.tenant(u.tenant.id, async q => {
      const counts = await q.one<Record<string, number>>(
        `select count(*) filter (where role = 'student' and status = 'active')::int as students,
                count(*) filter (where role = 'lecturer' and status <> 'deactivated')::int as lecturers,
                count(*) filter (where role = 'admin' and status <> 'deactivated')::int as admins,
                count(*) filter (where status = 'invited')::int as invited
           from users where tenant_id = $1`, [u.tenant.id]);
      const courses = await q.many<{ id: string; code: string; title: string; due_at: string | null; archived: boolean; enrolled: number; handed_in: number; lecturers: string }>(
        `select c.id, c.code, c.title, c.due_at, c.archived,
                (select count(*) from enrolments e where e.course_id = c.id)::int as enrolled,
                (select count(*) from submissions s where s.course_id = c.id)::int as handed_in,
                coalesce((select string_agg(coalesce(nullif(x.name, ''), x.email), ', ') from course_staff cs join users x on x.id = cs.user_id where cs.course_id = c.id), '') as lecturers
           from courses c where c.tenant_id = $1 order by c.archived, coalesce(c.due_at, c.created_at) desc limit 50`, [u.tenant.id]);
      const { handins } = await q.one<{ handins: number }>("select count(*)::int as handins from submissions where tenant_id = $1 and handed_in_at > now() - interval '120 days'", [u.tenant.id]);
      return { counts, seatLimit: u.tenant.seat_limit, handinsThisTerm: handins, courses };
    });
  });

  app.get<{ Querystring: { role?: string; q?: string; status?: string } }>('/api/admin/people', async req => {
    const u = admin(req);
    const role = ['student', 'lecturer', 'admin'].includes(req.query.role ?? '') ? req.query.role! : null;
    const status = ['invited', 'active', 'deactivated'].includes(req.query.status ?? '') ? req.query.status! : null;
    const search = (req.query.q ?? '').trim().toLowerCase().slice(0, 100);
    return d.db.tenant(u.tenant.id, async q => ({
      counts: await q.one(`select count(*)::int as all, count(*) filter (where role = 'student')::int as student, count(*) filter (where role = 'lecturer')::int as lecturer,
                                  count(*) filter (where role = 'admin')::int as admin, count(*) filter (where status = 'invited')::int as invited from users where tenant_id = $1`, [u.tenant.id]),
      people: await q.many(
        `select u.id, u.email, u.name, u.student_id as "studentId", u.role, u.status, u.created_at as "createdAt", u.last_seen_at as "lastSeenAt",
                ((select count(*) from enrolments e where e.user_id = u.id) + (select count(*) from course_staff s where s.user_id = u.id))::int as courses
           from users u where u.tenant_id = $1 and ($2::text is null or u.role = $2) and ($3::text is null or u.status = $3)
            and ($4 = '' or lower(u.name) like '%' || $4 || '%' or u.email like '%' || $4 || '%')
          order by case u.role when 'admin' then 0 when 'lecturer' then 1 else 2 end, lower(coalesce(nullif(u.name, ''), u.email)) limit 500`,
        [u.tenant.id, role, status, search]),
    }));
  });

  app.post('/api/admin/people', async req => {
    const u = admin(req);
    const body = parse(z.object({
      email: z.string().trim().toLowerCase().email('Enter their university email address.'),
      name: z.string().trim().max(100).default(''),
      role: z.enum(['lecturer', 'admin']),
    }), req.body);
    const id = await d.db.tenant(u.tenant.id, q => invitePerson(d, q, req, u.tenant, body.email, body.name, body.role, u.name || u.email));
    return { id };
  });

  // Many invites at once: one "email, name, role" per line (a CSV pasted or uploaded from a spreadsheet).
  app.post('/api/admin/people/import', async req => {
    const u = admin(req);
    const { csv } = parse(z.object({ csv: z.string().max(100_000) }), req.body);
    const rows = csv.split(/\r?\n/).map(l => l.split(',').map(s => s.trim().replace(/^"|"$/g, ''))).filter(r => r[0] && r[0].includes('@'));
    if (!rows.length) return fail(400, 'No email addresses found. Put one person per line: email, name, role.');
    if (rows.length > 300) return fail(400, 'Import up to 300 people at a time.');
    const done: string[] = [], problems: string[] = [];
    for (const [rawEmail, name = '', rawRole = 'lecturer'] of rows) {
      const email = rawEmail.toLowerCase(), role = rawRole.toLowerCase().startsWith('admin') ? 'admin' : 'lecturer';
      try { await d.db.tenant(u.tenant.id, q => invitePerson(d, q, req, u.tenant, email, name, role, u.name || u.email)); done.push(email); }
      catch (e) { problems.push(`${email}: ${e instanceof Error ? e.message : 'failed'}`); }
    }
    return { invited: done.length, problems };
  });

  app.patch<{ Params: { id: string } }>('/api/admin/people/:id', async req => {
    const u = admin(req);
    const body = parse(z.object({ role: z.enum(['student', 'lecturer', 'admin']).optional(), status: z.enum(['active', 'deactivated']).optional(), resend: z.boolean().optional() }), req.body);
    if (!/^[0-9a-f-]{36}$/.test(req.params.id)) return fail(404, 'That person doesn’t exist.');
    if (req.params.id === u.id && (body.role && body.role !== 'admin' || body.status === 'deactivated')) return fail(400, 'You can’t remove your own admin access. Ask another admin.');
    return d.db.tenant(u.tenant.id, async q => {
      const p = await q.maybe<{ id: string; email: string; name: string; role: 'student' | 'lecturer' | 'admin'; status: string }>('select id, email, name, role, status from users where id = $1', [req.params.id]);
      if (!p) return fail(404, 'That person doesn’t exist.');
      if (body.resend) {
        if (p.status !== 'invited' || p.role === 'student') return fail(400, 'Only pending invites can be resent.');
        await invitePerson(d, q, req, u.tenant, p.email, p.name, p.role, u.name || u.email);
        return { ok: true };
      }
      if (p.role === 'admin' && (body.role && body.role !== 'admin' || body.status === 'deactivated')) {
        const { n } = await q.one<{ n: number }>("select count(*)::int as n from users where tenant_id = $1 and role = 'admin' and status <> 'deactivated'", [u.tenant.id]);
        if (n <= 1) return fail(400, 'A university needs at least one admin.');
      }
      const nextStatus = body.status === 'active' && p.status === 'deactivated' ? 'active' : body.status === 'deactivated' ? 'deactivated' : p.status;
      await q.exec('update users set role = coalesce($2, role), status = $3 where id = $1', [p.id, body.role ?? null, nextStatus]);
      if (nextStatus === 'deactivated' || (body.role && body.role !== p.role)) await q.exec('delete from sessions where user_id = $1', [p.id]);
      await audit(q, req, body.status === 'deactivated' ? 'person.deactivate' : body.status === 'active' ? 'person.reactivate' : 'person.role', p.email, { role: body.role });
      return { ok: true };
    });
  });

  app.get('/api/admin/settings', async req => {
    const u = admin(req);
    return d.db.tenant(u.tenant.id, async q => {
      const t = await q.one<{ name: string; brand_color: string | null; retention_months: number; terms_accepted_at: string | null; accepted_by: string | null; contract_end: string | null; seat_limit: number | null }>(
        `select t.name, t.brand_color, t.retention_months, t.terms_accepted_at, t.contract_end, t.seat_limit,
                (select coalesce(nullif(x.name, ''), x.email) from users x where x.id = t.terms_accepted_by) as accepted_by from tenants t where t.id = $1`, [u.tenant.id]);
      const domains = await q.many<{ domain: string; include_subdomains: boolean }>('select domain, include_subdomains from tenant_domains where tenant_id = $1 order by domain', [u.tenant.id]);
      return { name: t.name, brandColor: t.brand_color, retentionMonths: t.retention_months, termsAcceptedAt: t.terms_accepted_at, termsAcceptedBy: t.accepted_by, contractEnd: t.contract_end, seatLimit: t.seat_limit, domains: domains.map(x => ({ domain: x.domain, includeSubdomains: x.include_subdomains })) };
    });
  });

  app.patch('/api/admin/settings', async req => {
    const u = admin(req);
    const body = parse(z.object({
      name: z.string().trim().min(2, 'Enter the university’s name.').max(120).optional(),
      brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #6D1F3B.').nullable().optional(),
    }), req.body);
    await d.db.tenant(u.tenant.id, async q => {
      await q.exec('update tenants set name = coalesce($2, name), brand_color = case when $3 then $4 else brand_color end where id = $1',
        [u.tenant.id, body.name ?? null, body.brandColor !== undefined, body.brandColor ?? null]);
      await audit(q, req, 'settings.update', null, body);
    });
    app.forgetTenant(u.tenant.slug);
    return { ok: true };
  });

  app.get('/api/admin/audit', async req => {
    const u = admin(req);
    return d.db.tenant(u.tenant.id, q => q.many(
      'select at, actor_kind as "actorKind", actor_email as "actorEmail", action, target, detail from audit_log where tenant_id = $1 order by at desc limit 200', [u.tenant.id]));
  });

  app.get('/api/admin/export', async (req, reply) => {
    const u = admin(req);
    const data = await d.db.tenant(u.tenant.id, async q => {
      await audit(q, req, 'data.export', null);
      return exportTenant(q, u.tenant.id);
    });
    return attachment(reply, `${u.tenant.slug}-going-concern-export-${new Date().toISOString().slice(0, 10)}.json`, 'application/json').send(JSON.stringify(data, null, 1));
  });
};

/** Everything held for one university, for its own records or at the end of a contract. */
export async function exportTenant(q: Q, tenantId: string) {
  return {
    exportedAt: new Date().toISOString(),
    university: await q.one('select name, slug, status, created_at, terms_accepted_at, retention_months from tenants where id = $1', [tenantId]),
    domains: await q.many('select domain, include_subdomains from tenant_domains where tenant_id = $1', [tenantId]),
    people: await q.many('select id, email, name, student_id, role, status, created_at, last_seen_at from users where tenant_id = $1 order by email', [tenantId]),
    courses: await q.many('select id, code, title, term, modules, due_at, late_policy, archived, created_at, snapshot_id from courses where tenant_id = $1', [tenantId]),
    courseStaff: await q.many('select course_id, user_id from course_staff where tenant_id = $1', [tenantId]),
    enrolments: await q.many('select course_id, user_id, joined_at, extension_until from enrolments where tenant_id = $1', [tenantId]),
    progress: await q.many('select course_id, user_id, module_id, data, updated_at from module_progress where tenant_id = $1', [tenantId]),
    handIns: await q.many('select course_id, user_id, payload, code, handed_in_at, late, attempt, grades from submissions where tenant_id = $1', [tenantId]),
  };
}
