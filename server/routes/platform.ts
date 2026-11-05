import type { FastifyPluginAsync } from 'fastify';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { audit } from '../audit';
import { hmac, newTotpSecret, safeEqual, sixDigits, totpUri, totpValid } from '../crypto';
import { byDirectoryId, searchDirectory } from '../directory';
import { codeMail } from '../email';
import { slugProblem, tenantOrigin } from '../hosts';
import { FREE_MAIL, attachment, domainMatches, emailDomain, fail, needPlatform, parse, type Deps } from '../http';
import { clearSessionCookie, startPlatformSession } from '../sessions';
import { exportTenant, invitePerson } from './admin';

// The platform console at admin.<domain>: you, signing in with an emailed code and an authenticator app, provisioning
// and looking after universities.

const DOMAIN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const Domain = z.object({
  domain: z.string().trim().toLowerCase().transform(s => s.replace(/^@/, '')).pipe(z.string().regex(DOMAIN, 'Enter a domain like northgate.ac.uk.')
    .refine(d => !FREE_MAIL.has(d), 'Personal email domains such as gmail.com can’t belong to a university.')),
  includeSubdomains: z.boolean().default(true),
});
const Plan = {
  status: z.enum(['trial', 'active', 'suspended', 'closed']),
  seatLimit: z.number().int().positive().max(1_000_000).nullable(),
  contractStart: z.string().date().nullable(),
  contractEnd: z.string().date().nullable(),
  retentionMonths: z.number().int().min(1).max(120),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #6D1F3B.').nullable(),
};

export const platformRoutes: FastifyPluginAsync<Deps> = async (app, d) => {
  const origin = (slug: string) => tenantOrigin(slug, d.config.BASE_DOMAIN, d.config.SECURE_COOKIES, d.config.SECURE_COOKIES ? undefined : d.config.PORT);

  // Sign-in: emailed code, then the authenticator app (set up on first sign-in). -----------------------------------
  app.post('/api/platform/auth/code', async req => {
    if (req.site.kind !== 'platform') return fail(404, 'Not found.');
    const { email } = parse(z.object({ email: z.string().trim().toLowerCase().email('Enter your email address.') }), req.body);
    const code = sixDigits();
    const send = await d.db.platform(async q => {
      const recent = await q.one<{ n: number }>("select count(*)::int as n from platform_login_codes where (email = $1 or ip = $2) and created_at > now() - interval '15 minutes'", [email, req.clientIp]);
      if (recent.n >= 5) return fail(429, 'Too many codes requested. Wait 15 minutes and try again.');
      const known = await q.maybe('select 1 from platform_admins where email = $1', [email]);
      // Same answer either way, so the form doesn't reveal who the platform admins are.
      await q.exec("insert into platform_login_codes (email, code_hash, ip, expires_at) values ($1, $2, $3, now() + interval '10 minutes')", [email, hmac(d.config.SESSION_SECRET, `platform:${email}:${code}`), req.clientIp]);
      return !!known;
    });
    if (send) await d.mailer.send(codeMail(email, code, 'the Going Concern platform console'));
    return { sent: true };
  });

  app.post('/api/platform/auth/verify', async (req, reply) => {
    if (req.site.kind !== 'platform') return fail(404, 'Not found.');
    const { email, code } = parse(z.object({ email: z.string().trim().toLowerCase().email(), code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code.') }), req.body);
    const result = await d.db.platform(async q => {
      const row = await q.maybe<{ id: string; code_hash: string; attempts: number }>(
        'select id, code_hash, attempts from platform_login_codes where email = $1 and used_at is null and expires_at > now() order by created_at desc limit 1 for update', [email]);
      if (!row || row.attempts >= 5) return { error: 'That code has expired. Ask for a new one.' };
      if (!safeEqual(row.code_hash, hmac(d.config.SESSION_SECRET, `platform:${email}:${code}`))) {
        await q.exec('update platform_login_codes set attempts = attempts + 1 where id = $1', [row.id]);
        return { error: 'That code isn’t right.' };
      }
      await q.exec('update platform_login_codes set used_at = now() where id = $1', [row.id]);
      const admin = await q.maybe<{ id: string; totp_enabled_at: string | null }>('select id, totp_enabled_at from platform_admins where email = $1', [email]);
      if (!admin) return { error: 'That code isn’t right.' };
      await q.exec('update platform_admins set last_seen_at = now() where id = $1', [admin.id]);
      return { admin };
    });
    if ('error' in result) return fail(400, result.error!);
    await startPlatformSession(d, req, reply, result.admin!.id);
    return { needsTotp: true, totpSetUp: !!result.admin!.totp_enabled_at };
  });

  app.post('/api/platform/auth/totp/setup', async req => {
    const a = needPlatform(req, { mfa: false });
    if (a.totp_enabled) return fail(400, 'Your authenticator app is already set up.');
    const secret = newTotpSecret();
    await d.db.platform(q => q.exec('update platform_admins set totp_secret = $2 where id = $1 and totp_enabled_at is null', [a.id, secret]));
    return { secret, uri: totpUri(secret, a.email) };
  });

  app.post('/api/platform/auth/totp', async req => {
    const a = needPlatform(req, { mfa: false });
    const { code } = parse(z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app.') }), req.body);
    await d.db.platform(async q => {
      const row = await q.one<{ totp_secret: string | null; totp_enabled_at: string | null }>('select totp_secret, totp_enabled_at from platform_admins where id = $1', [a.id]);
      if (!row.totp_secret) return fail(400, 'Set up your authenticator app first.');
      if (!totpValid(row.totp_secret, code)) return fail(400, 'That code isn’t right. Check your phone’s clock is set automatically.');
      if (!row.totp_enabled_at) await q.exec('update platform_admins set totp_enabled_at = now() where id = $1', [a.id]);
      await q.exec('update platform_sessions set mfa_at = now() where id = $1', [a.session_id]);
      await audit(q, req, 'platform.sign-in', a.email, {}, null);
    });
    return { ok: true };
  });

  app.post('/api/platform/auth/sign-out', async (req, reply) => {
    if (req.admin) await d.db.platform(q => q.exec('delete from platform_sessions where id = $1', [req.admin!.session_id]));
    clearSessionCookie(d, reply, true);
    return { ok: true };
  });

  // The UK directory ----------------------------------------------------------------------------------------------------
  app.get<{ Querystring: { q?: string } }>('/api/platform/directory', async req => {
    needPlatform(req);
    const hits = searchDirectory(String(req.query.q ?? '').slice(0, 80));
    const taken = await d.db.platform(q => q.many<{ id: string; directory_id: string | null; slug: string; domains: string[] }>(
      'select t.id, t.directory_id, t.slug, array(select domain from tenant_domains x where x.tenant_id = t.id) as domains from tenants t'));
    return hits.map(u => {
      const t = taken.find(x => x.directory_id === u.id || u.domains.some(dm => x.domains.includes(dm)));
      return { ...u, provisioned: t ? { id: t.id, slug: t.slug } : null, slugTaken: taken.some(x => x.slug === u.slug) };
    });
  });

  app.get<{ Querystring: { slug?: string } }>('/api/platform/slug-check', async req => {
    needPlatform(req);
    const slug = String(req.query.slug ?? '').toLowerCase();
    const problem = slugProblem(slug);
    if (problem) return { ok: false, message: problem };
    const used = await d.db.platform(q => q.maybe('select 1 from tenants where slug = $1', [slug]));
    return used ? { ok: false, message: `${slug}.${d.config.BASE_DOMAIN} is already in use.` } : { ok: true, message: 'Available' };
  });

  // Universities ---------------------------------------------------------------------------------------------------------
  app.get('/api/platform/universities', async req => {
    needPlatform(req);
    return d.db.platform(q => q.many(
      `select t.id, t.slug, t.name, t.status, t.seat_limit as "seatLimit", t.contract_start as "contractStart", t.contract_end as "contractEnd", t.created_at as "createdAt",
              t.directory_id as "directoryId", t.terms_accepted_at as "termsAcceptedAt",
              array(select domain from tenant_domains x where x.tenant_id = t.id order by domain) as domains,
              (select count(*) from users u where u.tenant_id = t.id and u.role = 'student' and u.status = 'active')::int as students,
              (select count(*) from users u where u.tenant_id = t.id and u.role = 'lecturer' and u.status <> 'deactivated')::int as lecturers,
              (select count(*) from users u where u.tenant_id = t.id and u.role = 'admin' and u.status = 'active')::int as "activeAdmins",
              (select count(*) from submissions s where s.tenant_id = t.id and s.handed_in_at > now() - interval '7 days')::int as "handinsThisWeek"
         from tenants t order by t.name`));
  });

  app.post('/api/platform/universities', async req => {
    const a = needPlatform(req);
    const body = parse(z.object({
      name: z.string().trim().min(2, 'Enter the university’s name.').max(120),
      slug: z.string().trim().toLowerCase(),
      domains: z.array(Domain).min(1, 'Add at least one email domain.').max(10),
      adminEmail: z.string().trim().toLowerCase().email('Enter the university admin’s email address.'),
      adminName: z.string().trim().max(100).default(''),
      directoryId: z.string().max(60).nullable().default(null),
      status: Plan.status.default('active'), seatLimit: Plan.seatLimit.default(null), contractStart: Plan.contractStart.default(null),
      contractEnd: Plan.contractEnd.default(null), retentionMonths: Plan.retentionMonths.default(12), brandColor: Plan.brandColor.default(null),
    }), req.body);
    const problem = slugProblem(body.slug); if (problem) return fail(400, problem);
    if (body.directoryId && !byDirectoryId(body.directoryId)) return fail(400, 'Unknown directory entry.');
    if (!body.domains.some(r => domainMatches(emailDomain(body.adminEmail), { domain: r.domain, include_subdomains: r.includeSubdomains }))) return fail(400, `The admin’s email must be on one of the university’s domains.`);
    const tenant = await d.db.platform(async q => {
      if (await q.maybe('select 1 from tenants where slug = $1', [body.slug])) return fail(409, `${body.slug}.${d.config.BASE_DOMAIN} is already in use.`);
      const clash = await q.maybe<{ domain: string; name: string }>('select x.domain, t.name from tenant_domains x join tenants t on t.id = x.tenant_id where x.domain = any($1)', [body.domains.map(r => r.domain)]);
      if (clash) return fail(409, `${clash.domain} already belongs to ${clash.name}.`);
      const t = await q.one<{ id: string; slug: string; name: string }>(
        `insert into tenants (slug, name, status, seat_limit, contract_start, contract_end, retention_months, brand_color, directory_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id, slug, name`,
        [body.slug, body.name, body.status, body.seatLimit, body.contractStart, body.contractEnd, body.retentionMonths, body.brandColor, body.directoryId]);
      for (const r of body.domains) await q.exec('insert into tenant_domains (tenant_id, domain, include_subdomains) values ($1, $2, $3)', [t.id, r.domain, r.includeSubdomains]);
      await audit(q, req, 'university.provision', body.name, { slug: body.slug, domains: body.domains, adminEmail: body.adminEmail }, t.id);
      await invitePerson(d, q, req, t, body.adminEmail, body.adminName, 'admin', `${a.name || 'The Going Concern team'}`);
      return t;
    });
    app.forgetTenant(tenant.slug);
    return { id: tenant.id, slug: tenant.slug, url: origin(tenant.slug) };
  });

  app.get<{ Params: { id: string } }>('/api/platform/universities/:id', async req => {
    needPlatform(req);
    if (!/^[0-9a-f-]{36}$/.test(req.params.id)) return fail(404, 'No such university.');
    return d.db.platform(async q => {
      const t = await q.maybe<Record<string, unknown> & { slug: string }>(
        `select id, slug, name, status, brand_color as "brandColor", seat_limit as "seatLimit", contract_start as "contractStart", contract_end as "contractEnd",
                retention_months as "retentionMonths", directory_id as "directoryId", terms_accepted_at as "termsAcceptedAt", created_at as "createdAt" from tenants where id = $1`, [req.params.id]);
      if (!t) return fail(404, 'No such university.');
      return {
        ...t, url: origin(t.slug),
        domains: (await q.many<{ domain: string; include_subdomains: boolean }>('select domain, include_subdomains from tenant_domains where tenant_id = $1 order by domain', [req.params.id])).map(x => ({ domain: x.domain, includeSubdomains: x.include_subdomains })),
        admins: await q.many(`select id, email, name, status, last_seen_at as "lastSeenAt" from users where tenant_id = $1 and role = 'admin' order by email`, [req.params.id]),
        counts: await q.one(`select count(*) filter (where role = 'student' and status = 'active')::int as students, count(*) filter (where role = 'lecturer' and status <> 'deactivated')::int as lecturers,
                                    (select count(*) from courses c where c.tenant_id = $1)::int as courses, (select count(*) from submissions s where s.tenant_id = $1)::int as "handIns"
                               from users where tenant_id = $1`, [req.params.id]),
        audit: await q.many('select at, actor_kind as "actorKind", actor_email as "actorEmail", action, target from audit_log where tenant_id = $1 order by at desc limit 25', [req.params.id]),
      };
    });
  });

  app.patch<{ Params: { id: string } }>('/api/platform/universities/:id', async req => {
    needPlatform(req);
    const body = parse(z.object({ name: z.string().trim().min(2).max(120), ...Plan }).partial(), req.body);
    const slug = await d.db.platform(async q => {
      const t = await q.maybe<{ slug: string; status: string }>('select slug, status from tenants where id = $1', [req.params.id]);
      if (!t) return fail(404, 'No such university.');
      const set: string[] = [], values: unknown[] = [req.params.id];
      const col: Record<string, string> = { name: 'name', status: 'status', seatLimit: 'seat_limit', contractStart: 'contract_start', contractEnd: 'contract_end', retentionMonths: 'retention_months', brandColor: 'brand_color' };
      for (const [k, v] of Object.entries(body)) if (v !== undefined) { values.push(v); set.push(`${col[k]} = $${values.length}`); }
      if (set.length) await q.exec(`update tenants set ${set.join(', ')} where id = $1`, values);
      // Suspending or closing signs everyone out at once.
      if (body.status === 'suspended' || body.status === 'closed') await q.exec('delete from sessions where tenant_id = $1', [req.params.id]);
      await audit(q, req, body.status && body.status !== t.status ? `university.${body.status}` : 'university.update', t.slug, body, req.params.id);
      return t.slug;
    });
    app.forgetTenant(slug);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/platform/universities/:id/domains', async req => {
    needPlatform(req);
    const body = parse(Domain, req.body);
    await d.db.platform(async q => {
      const clash = await q.maybe<{ name: string }>('select t.name from tenant_domains x join tenants t on t.id = x.tenant_id where x.domain = $1', [body.domain]);
      if (clash) return fail(409, `${body.domain} already belongs to ${clash.name}.`);
      await q.exec('insert into tenant_domains (tenant_id, domain, include_subdomains) values ($1, $2, $3)', [req.params.id, body.domain, body.includeSubdomains]);
      await audit(q, req, 'domain.add', body.domain, { includeSubdomains: body.includeSubdomains }, req.params.id);
    });
    return { ok: true };
  });

  app.delete<{ Params: { id: string; domain: string } }>('/api/platform/universities/:id/domains/:domain', async req => {
    needPlatform(req);
    await d.db.platform(async q => {
      const { n } = await q.one<{ n: number }>('select count(*)::int as n from tenant_domains where tenant_id = $1', [req.params.id]);
      if (n <= 1) return fail(400, 'A university needs at least one email domain. Add the new one before removing this one.');
      if (!await q.exec('delete from tenant_domains where tenant_id = $1 and domain = $2', [req.params.id, req.params.domain])) return fail(404, 'No such domain.');
      await audit(q, req, 'domain.remove', req.params.domain, {}, req.params.id);
    });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/platform/universities/:id/admins', async req => {
    const a = needPlatform(req);
    const body = parse(z.object({ email: z.string().trim().toLowerCase().email('Enter their email address.'), name: z.string().trim().max(100).default('') }), req.body);
    await d.db.platform(async q => {
      const t = await q.maybe<{ id: string; slug: string; name: string }>('select id, slug, name from tenants where id = $1', [req.params.id]);
      if (!t) return fail(404, 'No such university.');
      await invitePerson(d, q, req, t, body.email, body.name, 'admin', a.name || 'The Going Concern team');
    });
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>('/api/platform/universities/:id/export', async (req, reply) => {
    needPlatform(req);
    const data = await d.db.platform(async q => { await audit(q, req, 'data.export', null, {}, req.params.id); return exportTenant(q, req.params.id); });
    return attachment(reply, `${(data.university as { slug: string }).slug}-export-${new Date().toISOString().slice(0, 10)}.json`, 'application/json').send(JSON.stringify(data, null, 1));
  });

  // System and audit -------------------------------------------------------------------------------------------------
  app.get('/api/platform/system', async req => {
    needPlatform(req);
    const db = await d.db.platform(async q => ({
      size: (await q.one<{ size: string }>('select pg_size_pretty(pg_database_size(current_database())) as size')).size,
      version: (await q.one<{ v: string }>("select current_setting('server_version') as v")).v,
      queue: (await q.one<{ n: number }>('select count(*)::int as n from submissions where grades is null and grade_error is null')).n,
      gradeErrors: (await q.one<{ n: number }>('select count(*)::int as n from submissions where grade_error is not null')).n,
      deadlines: await q.many(
        `select c.id, c.code, c.title, c.due_at as "dueAt", t.name as university, (select count(*) from enrolments e where e.course_id = c.id)::int as students
           from courses c join tenants t on t.id = c.tenant_id where c.due_at between now() - interval '1 day' and now() + interval '14 days' and not c.archived order by c.due_at limit 20`),
      migrations: (await q.many<{ name: string }>('select name from schema_migrations order by name')).map(r => r.name),
    }));
    let lastBackup: { file: string; at: string; bytes: number } | null = null;
    if (d.config.BACKUP_DIR) {
      try {
        const files = (await readdir(d.config.BACKUP_DIR)).filter(f => /\.(dump|sql\.gz)$/.test(f));
        for (const f of files) { const s = await stat(join(d.config.BACKUP_DIR, f)); if (!lastBackup || s.mtime.toISOString() > lastBackup.at) lastBackup = { file: f, at: s.mtime.toISOString(), bytes: s.size }; }
      } catch { /* directory missing: reported as no backup */ }
    }
    return { release: d.config.RELEASE, environment: d.config.ENVIRONMENT_NAME, node: process.version, uptimeSeconds: Math.round(process.uptime()), memoryMb: Math.round(process.memoryUsage().rss / 1e6), database: db, lastBackup, backupsConfigured: !!d.config.BACKUP_DIR };
  });

  app.get<{ Querystring: { tenant?: string } }>('/api/platform/audit', async req => {
    needPlatform(req);
    const tenant = /^[0-9a-f-]{36}$/.test(req.query.tenant ?? '') ? req.query.tenant! : null;
    return d.db.platform(q => q.many(
      `select a.at, a.actor_kind as "actorKind", a.actor_email as "actorEmail", a.action, a.target, a.detail, t.name as university
         from audit_log a left join tenants t on t.id = a.tenant_id where ($1::uuid is null or a.tenant_id = $1) order by a.at desc limit 300`, [tenant]));
  });
};
