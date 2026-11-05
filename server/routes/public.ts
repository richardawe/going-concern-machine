import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { tenantOrigin } from '../hosts';
import { domainMatches, emailDomain, fail, parse, type Deps } from '../http';

// Health, the context every page starts from, and "find your university" on the public site.

export const publicRoutes: FastifyPluginAsync<Deps> = async (app, d) => {
  const started = Date.now();
  app.get('/healthz', async (_req, reply) => {
    let database = 'ok';
    try { await d.db.platform(q => q.one('select 1 as ok')); } catch { database = 'down'; }
    return reply.code(database === 'ok' ? 200 : 503).header('cache-control', 'no-store')
      .send({ ok: database === 'ok', release: d.config.RELEASE, environment: d.config.ENVIRONMENT_NAME, database, uptime: Math.round((Date.now() - started) / 1000) });
  });

  app.get('/api/context', async req => {
    const base = { kind: req.site.kind, release: d.config.RELEASE, environment: d.config.ENVIRONMENT_NAME, baseDomain: d.config.BASE_DOMAIN };
    if (req.site.kind === 'platform') return { ...base, admin: req.admin };
    if (req.site.kind !== 'tenant') return base;
    const t = req.tenant;
    if (!t) return { ...base, kind: 'missing' };
    const domains = await d.db.tenant(t.id, q => q.many<{ domain: string; include_subdomains: boolean }>('select domain, include_subdomains from tenant_domains where tenant_id = $1 order by domain', [t.id]));
    const open = t.status === 'trial' || t.status === 'active';
    return {
      ...base,
      tenant: { name: t.name, slug: t.slug, brandColor: t.brand_color, open, termsAccepted: !!t.terms_accepted_at, domains: domains.map(x => ({ domain: x.domain, includeSubdomains: x.include_subdomains })) },
      user: req.user && { id: req.user.id, email: req.user.email, name: req.user.name, studentId: req.user.student_id, role: req.user.role },
    };
  });

  app.post('/api/find-university', async req => {
    if (req.site.kind !== 'public') return fail(404, 'Not found.');
    const { email } = parse(z.object({ email: z.string().trim().toLowerCase().email('Enter your full university email address.').max(254) }), req.body);
    const domain = emailDomain(email);
    const rules = await d.db.platform(q => q.many<{ domain: string; include_subdomains: boolean; slug: string; name: string; status: string }>(
      `select td.domain, td.include_subdomains, t.slug, t.name, t.status from tenant_domains td join tenants t on t.id = td.tenant_id
        where td.domain = $1 or $1 like '%.' || td.domain`, [domain]));
    const hit = rules.filter(r => domainMatches(domain, r) && (r.status === 'active' || r.status === 'trial')).sort((a, b) => b.domain.length - a.domain.length)[0];
    if (!hit) return fail(404, `No university on Going Concern uses ${domain} yet. Check the address, or ask your lecturer for your university's link.`);
    return { name: hit.name, url: `${tenantOrigin(hit.slug, d.config.BASE_DOMAIN, d.config.SECURE_COOKIES, d.config.SECURE_COOKIES ? undefined : d.config.PORT)}/sign-in?email=${encodeURIComponent(email)}` };
  });
};
