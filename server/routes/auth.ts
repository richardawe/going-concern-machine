import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { audit } from '../audit';
import { hmac, safeEqual, sixDigits } from '../crypto';
import { codeMail } from '../email';
import { domainMatches, emailDomain, fail, needTenant, parse, type Deps } from '../http';
import { clearSessionCookie, startTenantSession } from '../sessions';

// Signing in to a university: any address on its email domains gets a 6-digit code by email (a code, not a link,
// because university mail scanners open links and would use them up). The first correct code creates the account,
// as a student unless an admin has invited them as a lecturer or admin.

const CODE_TTL_MIN = 10, MAX_TRIES = 5, PER_EMAIL_15MIN = 5, PER_IP_HOUR = 300; // campus networks put whole lectures behind one IP
const Email = z.object({ email: z.string().trim().toLowerCase().email('Enter your full university email address.').max(254) });

export const authRoutes: FastifyPluginAsync<Deps> = async (app, d) => {
  async function allowedDomains(tenantId: string) {
    return d.db.tenant(tenantId, q => q.many<{ domain: string; include_subdomains: boolean }>('select domain, include_subdomains from tenant_domains where tenant_id = $1', [tenantId]));
  }
  const describe = (rules: { domain: string; include_subdomains: boolean }[]) =>
    rules.map(r => `@${r.domain}${r.include_subdomains ? ` (or @…${r.domain})` : ''}`).join(', ');

  app.post('/api/auth/code', async req => {
    const tenant = needTenant(req);
    if (tenant.status === 'suspended' || tenant.status === 'closed') return fail(403, `${tenant.name}'s access to Going Concern Lab is paused. Ask your university's administrator.`);
    const { email } = parse(Email, req.body), domain = emailDomain(email);
    const rules = await allowedDomains(tenant.id);
    if (!rules.some(r => domainMatches(domain, r))) return fail(400, `${tenant.name} only accepts addresses ending ${describe(rules)}. Use your university email.`, { reason: 'domain' });
    const code = sixDigits();
    await d.db.tenant(tenant.id, async q => {
      const user = await q.maybe<{ status: string }>('select status from users where tenant_id = $1 and email = $2', [tenant.id, email]);
      if (user?.status === 'deactivated') return fail(403, 'This account has been deactivated. Ask your university’s Going Concern Lab administrator.');
      const recent = await q.one<{ by_email: number; by_ip: number }>(
        `select count(*) filter (where email = $2 and created_at > now() - interval '15 minutes') as by_email,
                count(*) filter (where ip = $3 and created_at > now() - interval '1 hour') as by_ip
           from login_codes where tenant_id = $1 and created_at > now() - interval '1 hour'`, [tenant.id, email, req.clientIp]);
      if (recent.by_email >= PER_EMAIL_15MIN) return fail(429, 'You’ve asked for several codes. Use the newest one, or wait 15 minutes and try again.');
      if (recent.by_ip >= PER_IP_HOUR) return fail(429, 'Too many sign-in attempts from this network. Wait a while and try again.');
      await q.exec(`update login_codes set used_at = now() where tenant_id = $1 and email = $2 and used_at is null`, [tenant.id, email]);
      await q.exec(`insert into login_codes (tenant_id, email, code_hash, ip, expires_at) values ($1, $2, $3, $4, now() + interval '${CODE_TTL_MIN} minutes')`,
        [tenant.id, email, hmac(d.config.SESSION_SECRET, `${tenant.id}:${email}:${code}`), req.clientIp]);
    });
    try { await d.mailer.send(codeMail(email, code, tenant.name)); }
    catch (err) { req.log.error(err); return fail(503, 'We couldn’t send your sign-in email just now. Try again in a few minutes. If it keeps happening, tell your lecturer.'); }
    return { sent: true, minutes: CODE_TTL_MIN };
  });

  app.post('/api/auth/verify', async (req, reply) => {
    const tenant = needTenant(req);
    if (tenant.status === 'suspended' || tenant.status === 'closed') return fail(403, `${tenant.name}'s access to Going Concern Lab is paused.`);
    const { email, code } = parse(Email.extend({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from the email.') }), req.body);
    const result = await d.db.tenant(tenant.id, async q => {
      const row = await q.maybe<{ id: string; code_hash: string; attempts: number }>(
        `select id, code_hash, attempts from login_codes where tenant_id = $1 and email = $2 and used_at is null and expires_at > now()
          order by created_at desc limit 1 for update`, [tenant.id, email]);
      if (!row) return { error: 'That code has expired or was already used. Ask for a new one.' };
      if (row.attempts >= MAX_TRIES) return { error: 'Too many wrong codes. Ask for a new one.' };
      if (!safeEqual(row.code_hash, hmac(d.config.SESSION_SECRET, `${tenant.id}:${email}:${code}`))) {
        await q.exec('update login_codes set attempts = attempts + 1 where id = $1', [row.id]);
        const left = MAX_TRIES - row.attempts - 1;
        return { error: left > 0 ? `That code isn’t right. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong codes. Ask for a new one.' };
      }
      await q.exec('update login_codes set used_at = now() where id = $1', [row.id]);
      // The domain list may have changed since the code was sent.
      const rules = await q.many<{ domain: string; include_subdomains: boolean }>('select domain, include_subdomains from tenant_domains where tenant_id = $1', [tenant.id]);
      if (!rules.some(r => domainMatches(emailDomain(email), r))) return { error: `${tenant.name} no longer accepts this address.` };
      let user = await q.maybe<{ id: string; role: 'student' | 'lecturer' | 'admin'; status: string }>('select id, role, status from users where tenant_id = $1 and email = $2', [tenant.id, email]);
      if (user?.status === 'deactivated') return { error: 'This account has been deactivated.' };
      if (!user) {
        // Read live, not from the cached tenant, so a limit raised in the console applies at once.
        const { seat_limit: limit } = await q.one<{ seat_limit: number | null }>('select seat_limit from tenants where id = $1', [tenant.id]);
        if (limit) {
          const { n } = await q.one<{ n: number }>("select count(*) as n from users where tenant_id = $1 and role = 'student' and status = 'active'", [tenant.id]);
          if (n >= limit) return { error: `${tenant.name} has used all its student places on Going Concern Lab. Ask your lecturer to contact the university’s administrator.` };
        }
        user = await q.one<{ id: string; role: 'student' | 'lecturer' | 'admin'; status: string }>('insert into users (tenant_id, email) values ($1, $2) returning id, role, status', [tenant.id, email]);
      } else if (user.status === 'invited') {
        await q.exec("update users set status = 'active' where id = $1", [user.id]);
      }
      await q.exec('update users set last_seen_at = now() where id = $1', [user.id]);
      if (user.role !== 'student') await audit(q, req, 'sign-in', email, { role: user.role }, tenant.id);
      return { user };
    });
    if ('error' in result) return fail(400, result.error!);
    await startTenantSession(d, req, reply, tenant, result.user!);
    return { ok: true };
  });

  app.post('/api/auth/sign-out', async (req, reply) => {
    const tenant = needTenant(req);
    if (req.user) await d.db.tenant(tenant.id, q => q.exec('delete from sessions where id = $1', [req.user!.session_id]));
    clearSessionCookie(d, reply, false);
    return { ok: true };
  });
};
