import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { cases } from '../../src/ceo/cases';
import { moduleById } from '../../src/course/modules';
import { answer } from '../../src/course/text';
import type { ModuleProgress } from '../../src/course/types';
import { buildApp } from '../../server/app';
import { loadConfig } from '../../server/config';
import { Db } from '../../server/db';
import { createMailer, type Mailer } from '../../server/email';
import { createGrader } from '../../server/grader';
import { migrate } from '../../server/migrate';

// A real PostgreSQL, wiped and migrated for each test file, reached as a role that is NOT a superuser, so row-level
// security applies exactly as in production. Local default: the gcm_test role and database (see docs/DEVELOPMENT.md).

export const BASE = 'goingconcern.test';
export const DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://gcm_test:gcm_test@127.0.0.1:5432/gcm_test';

export interface Harness { app: FastifyInstance; db: Db; mailer: Mailer; grader: ReturnType<typeof createGrader>; close(): Promise<void> }

export async function harness(): Promise<Harness> {
  const admin = new pg.Client({ connectionString: DATABASE_URL });
  await admin.connect();
  const su = (await admin.query('select rolsuper from pg_roles where rolname = current_user')).rows[0].rolsuper;
  if (su) throw new Error('Run the server tests as a non-superuser role: superusers skip row-level security, so isolation would go untested.');
  await admin.query('drop schema public cascade; create schema public;');
  await admin.end();
  await migrate(DATABASE_URL, 'migrations', () => {});
  const config = loadConfig({
    NODE_ENV: 'test', BASE_DOMAIN: BASE, DATABASE_URL, SESSION_SECRET: 'test-secret-test-secret-test-secret-0123', EMAIL_MODE: 'memory',
    SECURE_COOKIES: 'false', STATIC_DIR: 'public', GRADER: 'inline', RELEASE: 'test',
  });
  const db = new Db(DATABASE_URL, 5), mailer = createMailer(config), grader = createGrader(db, 'inline', () => {});
  const app = await buildApp(config, db, mailer, () => {});
  return { app, db, mailer, grader, close: async () => { await app.close(); await grader.stop(); await db.close(); } };
}

export type Call = { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; url: string; host: string; body?: unknown; cookie?: string; headers?: Record<string, string> };
export async function call(app: FastifyInstance, c: Call) {
  const res = await app.inject({
    method: c.method ?? (c.body === undefined ? 'GET' : 'POST'), url: c.url, payload: c.body as never,
    headers: { host: c.host, 'x-gcm': '1', ...(c.cookie ? { cookie: c.cookie } : {}), ...c.headers },
  });
  let json: any = null; try { json = res.json(); } catch { /* not JSON */ }
  return { status: res.statusCode, json, res, cookie: res.cookies.map(k => `${k.name}=${k.value}`).join('; ') };
}

export const lastCode = (mailer: Mailer, to: string) => {
  const m = [...mailer.outbox].reverse().find(x => x.to === to && x.tag === 'sign-in-code');
  if (!m) throw new Error(`No sign-in code sent to ${to}`);
  return m.subject.slice(0, 6);
};

export async function signIn(h: Harness, slug: string, email: string) {
  const host = `${slug}.${BASE}`;
  const r1 = await call(h.app, { url: '/api/auth/code', host, body: { email } });
  if (r1.status !== 200) throw new Error(`code: ${r1.status} ${JSON.stringify(r1.json)}`);
  const r2 = await call(h.app, { url: '/api/auth/verify', host, body: { email, code: lastCode(h.mailer, email.toLowerCase()) } });
  if (r2.status !== 200) throw new Error(`verify: ${r2.status} ${JSON.stringify(r2.json)}`);
  return r2.cookie;
}

/** A university made directly in the database, for tests that aren't about provisioning. */
export async function makeTenant(h: Harness, slug: string, domains: string[], extra: { seatLimit?: number; terms?: boolean } = {}) {
  return h.db.platform(async q => {
    const t = await q.one<{ id: string }>('insert into tenants (slug, name, seat_limit, terms_accepted_at) values ($1, $2, $3, $4) returning id',
      [slug, `${slug[0].toUpperCase()}${slug.slice(1)} University`, extra.seatLimit ?? null, extra.terms === false ? null : new Date().toISOString()]);
    for (const d of domains) await q.exec('insert into tenant_domains (tenant_id, domain) values ($1, $2)', [t.id, d]);
    return t.id;
  });
}
export const addUser = (h: Harness, tenantId: string, email: string, role: 'student' | 'lecturer' | 'admin', name = '') =>
  h.db.platform(q => q.one<{ id: string }>("insert into users (tenant_id, email, role, name, status) values ($1, $2, $3, $4, 'active') returning id", [tenantId, email, role, name]));

const words = (n: number, w = 'margin') => Array.from({ length: n }, () => w).join(' ');
/** A finished module, the same shape the module runner saves. */
export function finishedModule(id = 'price-war'): ModuleProgress {
  const def = moduleById(id)!, caseDef = cases.find(c => c.id === def.caseId)!;
  return {
    stage: 'complete', concept: def.concepts.length - 1, checked: true, completedAt: '2026-11-04T20:00:00.000Z',
    concepts: Object.fromEntries(def.concepts.map(c => [c.id, answer(words(45))])),
    decisions: caseDef.turns.map((t, i) => ({ card: t.cards[0].id, reason: answer(words(30), i === 2) })),
    check: Object.fromEntries(def.check.map(q => [q.id, q.kind === 'mcq' ? q.answer : answer(words(65))])),
    reflection: answer(words(50)),
  };
}
