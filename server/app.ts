import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ZodError } from 'zod';
import type { Config } from './config';
import { NotFound, type Db } from './db';
import type { Mailer } from './email';
import { classifyHost } from './hosts';
import { HttpError, type Deps, type Tenant } from './http';
import { accountRoutes } from './routes/account';
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { platformRoutes } from './routes/platform';
import { publicRoutes } from './routes/public';
import { studentRoutes } from './routes/student';
import { teachRoutes } from './routes/teach';
import { readPlatformSession, readTenantSession } from './sessions';
import { pageHtml, REDIRECTS, robotsTxt, sitemapXml } from './site';

// One process serves every host. Each request is first classified by its Host header: the public site, the platform
// console (admin.<domain>) or a university (<slug>.<domain>). University pages and API calls only ever see that
// university's rows (see db.ts and the row-level security in migrations/001_init.sql).

const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "font-src 'self'",
  "img-src 'self' data: blob:", "media-src 'self'", "connect-src 'self'", "worker-src 'self' blob:", "frame-ancestors 'none'", "base-uri 'self'",
  "form-action 'self'", "object-src 'none'",
].join('; ');

export async function buildApp(config: Config, db: Db, mailer: Mailer, kickGrader: () => void = () => {}): Promise<FastifyInstance> {
  const app = Fastify({
    // Logs carry no personal data: no cookies, and no query strings (a sign-in link can carry an email address).
    logger: config.NODE_ENV === 'test' ? false : {
      level: 'info',
      serializers: { req: r => ({ method: r.method, url: String(r.url).split('?')[0], host: r.headers?.host }) },
    },
    trustProxy: ['127.0.0.1', '::1'],
    bodyLimit: 1_000_000,
  });
  const deps: Deps = { config, db, mailer, kickGrader };

  // Tenants by subdomain, cached briefly. Suspension still takes effect at once, because sessions are checked live.
  const tenantCache = new Map<string, { at: number; tenant: Tenant | null }>();
  const findTenant = async (slug: string) => {
    const hit = tenantCache.get(slug);
    if (hit && Date.now() - hit.at < 30_000) return hit.tenant;
    const tenant = await db.platform(q => q.maybe<Tenant>(
      'select id, slug, name, status, brand_color, seat_limit, retention_months, terms_accepted_at from tenants where slug = $1', [slug]));
    tenantCache.set(slug, { at: Date.now(), tenant });
    return tenant;
  };
  app.decorate('forgetTenant', (slug: string) => tenantCache.delete(slug));

  await app.register(cookie);
  app.decorateRequest('site', null as never);
  app.decorateRequest('tenant', null);
  app.decorateRequest('user', null);
  app.decorateRequest('admin', null);
  app.decorateRequest('clientIp', '');

  app.addHook('onRequest', async (req, reply) => {
    req.site = classifyHost(req.headers.host, config.BASE_DOMAIN);
    const cf = req.headers['cf-connecting-ip'];
    req.clientIp = config.TRUST_CLOUDFLARE && typeof cf === 'string' ? cf : req.ip;
    if (req.url === '/healthz') return;
    if (req.site.kind === 'www') return reply.redirect(`${config.SECURE_COOKIES ? 'https' : 'http'}://${config.BASE_DOMAIN}${req.url}`, 301);

    // Requests that change something must come from our own pages: a custom header (which a cross-site form or
    // simple request can't add) and, when the browser sends one, an Origin on this same host.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin;
      if (req.headers['x-gcm'] !== '1' || (origin && origin.replace(/^https?:\/\//, '').toLowerCase() !== String(req.headers.host).toLowerCase())) {
        return reply.code(403).send({ error: 'This request did not come from a Going Concern Lab page.' });
      }
    }
    if (req.site.kind === 'tenant') {
      req.tenant = await findTenant(req.site.slug);
      if (req.tenant && (req.tenant.status === 'trial' || req.tenant.status === 'active') && req.url.startsWith('/api/')) req.user = await readTenantSession(deps, req, req.tenant);
    }
    if (req.site.kind === 'platform' && req.url.startsWith('/api/')) req.admin = await readPlatformSession(deps, req);
  });

  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('content-security-policy', CSP);
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'strict-origin-when-cross-origin');
    reply.header('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    reply.header('x-frame-options', 'DENY');
    if (config.SECURE_COOKIES) reply.header('strict-transport-security', 'max-age=31536000; includeSubDomains');
    if (req.url.startsWith('/api/') && !reply.getHeader('cache-control')) reply.header('cache-control', 'no-store');
    return payload;
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) return reply.code(err.status).send({ error: err.message, ...err.extra });
    if (err instanceof NotFound) return reply.code(404).send({ error: err.message });
    if (err instanceof ZodError) return reply.code(400).send({ error: err.issues[0]?.message ?? 'Check the request.' });
    const e = err as { statusCode?: number; code?: string; message?: string };
    if (e.code === '23505') return reply.code(409).send({ error: 'That already exists.' });
    if (e.statusCode && e.statusCode < 500) return reply.code(e.statusCode).send({ error: e.message });
    req.log.error(err);
    return reply.code(500).send({ error: 'Something went wrong on our side. Try again in a moment.' });
  });

  await app.register(publicRoutes, deps);
  await app.register(authRoutes, deps);
  await app.register(accountRoutes, deps);
  await app.register(studentRoutes, deps);
  await app.register(teachRoutes, deps);
  await app.register(adminRoutes, deps);
  await app.register(platformRoutes, deps);

  // The web app. Files are served as built; every other page path gets index.html, told which kind of host it is on.
  const root = resolve(config.STATIC_DIR);
  await app.register(fastifyStatic, {
    root, index: false, wildcard: true, decorateReply: true,
    setHeaders: (res, path) => res.setHeader('cache-control', path.includes(`${join(root, 'assets')}`) ? 'public, max-age=31536000, immutable' : 'public, max-age=300'),
  });
  // The static pages (public/universities, public/demo) are folders with an index.html. Directory indexes are off
  // above, so serve these two explicitly, and add the trailing slash their relative links need.
  for (const dir of ['universities', 'demo']) {
    app.get(`/${dir}`, (_req, reply) => reply.redirect(`/${dir}/`, 301));
    app.get(`/${dir}/`, (_req, reply) => reply.header('cache-control', 'public, max-age=300').sendFile(`${dir}/index.html`));
  }
  // Only the public site is indexed: universities' portals and the console tell search engines to stay out.
  const origin = `${config.SECURE_COOKIES ? 'https' : 'http'}://${config.BASE_DOMAIN}`;
  app.get('/robots.txt', (req, reply) => reply.type('text/plain; charset=utf-8').header('cache-control', 'public, max-age=3600').send(robotsTxt(origin, req.site.kind === 'public')));
  app.get('/sitemap.xml', (req, reply) => req.site.kind !== 'public' ? reply.code(404).send({ error: 'Not found.' })
    : reply.type('application/xml; charset=utf-8').header('cache-control', 'public, max-age=3600').send(sitemapXml(origin)));

  for (const [from, to] of Object.entries(REDIRECTS)) {
    app.get(from, (req, reply) => {
      if (req.site.kind !== 'public') return page(req, reply);
      const q = String(req.url).indexOf('?');
      return reply.redirect(q < 0 ? to : to + String(req.url).slice(q), 301);
    });
  }

  let indexHtml: string | null = null;
  const page = async (req: FastifyRequest, reply: FastifyReply) => {
    indexHtml ??= await readFile(join(root, 'index.html'), 'utf8').catch(() => '<!doctype html><html><head><title>Going Concern Lab</title></head><body><div id="root"></div></body></html>');
    const kind = req.site.kind === 'tenant' ? (req.tenant ? 'tenant' : 'missing') : req.site.kind === 'platform' ? 'platform' : req.site.kind === 'unknown' ? 'missing' : 'public';
    return reply.code(kind === 'missing' ? 404 : 200).header('content-type', 'text/html; charset=utf-8').header('cache-control', 'no-cache')
      .send(pageHtml(indexHtml, { origin, path: String(req.url).split('?')[0], indexable: kind === 'public', hostKind: kind }));
  };
  app.get('/', page);
  app.setNotFoundHandler(async (req, reply) => {
    if (req.url.startsWith('/api/') || req.method !== 'GET') return reply.code(404).send({ error: 'Not found.' });
    return page(req, reply);
  });

  return app;
}

declare module 'fastify' { interface FastifyInstance { forgetTenant(slug: string): void } }
