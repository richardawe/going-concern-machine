import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { totpAt, totpValid } from '../../server/crypto';
import { searchDirectory, universities } from '../../server/directory';
import { classifyHost, slugProblem } from '../../server/hosts';
import { BASE, call, harness, lastCode, signIn, type Harness } from './helpers';

let h: Harness;
before(async () => { h = await harness(); });
after(() => h.close());
const admin = `admin.${BASE}`;

test('hosts: apex, www, console, universities, and names that can never be a university', () => {
  assert.deepEqual(classifyHost('goingconcern.test', BASE), { kind: 'public' });
  assert.deepEqual(classifyHost('WWW.goingconcern.test:443', BASE), { kind: 'www' });
  assert.deepEqual(classifyHost('admin.goingconcern.test', BASE), { kind: 'platform' });
  assert.deepEqual(classifyHost('northgate.goingconcern.test', BASE), { kind: 'tenant', slug: 'northgate' });
  for (const h of ['cpanel.goingconcern.test', 'webmail.goingconcern.test', 'a.b.goingconcern.test', 'evil.com', 'goingconcern.test.evil.com', '-x.goingconcern.test'])
    assert.equal(classifyHost(h, BASE).kind, 'unknown', h);
  assert.match(slugProblem('mail')!, /reserved/);
  assert.equal(slugProblem('northgate'), null);
});

test('TOTP matches the RFC 6238 test vector and tolerates one step of clock drift', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // "12345678901234567890"
  assert.equal(totpAt(secret, 59_000), '287082');
  assert.equal(totpAt(secret, 1_111_111_109_000), '081804');
  assert.ok(totpValid(secret, totpAt(secret, 1_000_000 - 30_000), 1_000_000));
  assert.ok(!totpValid(secret, totpAt(secret, 1_000_000 - 90_000), 1_000_000));
});

test('the UK directory: every institution is unique, and search finds them by name, short name or domain', () => {
  assert.ok(universities.length >= 160);
  assert.equal(new Set(universities.map(u => u.slug)).size, universities.length);
  assert.equal(new Set(universities.flatMap(u => u.domains)).size, universities.flatMap(u => u.domains).length);
  assert.equal(searchDirectory('LSE')[0].name, 'London School of Economics and Political Science');
  assert.equal(searchDirectory('bayes')[0].name, "City St George's, University of London");
  assert.equal(searchDirectory('kcl.ac.uk')[0].name, "King's College London");
  assert.equal(searchDirectory('queens belfast')[0].name, "Queen's University Belfast");
  const manchester = searchDirectory('manchester').map(u => u.name);
  assert.ok(manchester.includes('University of Manchester') && manchester.includes('Manchester Metropolitan University'));
});

test('platform console: emailed code, then an authenticator app, before anything else works', async () => {
  await h.db.platform(q => q.exec("insert into platform_admins (email, name) values ('owner@example.com', 'Owner')"));
  assert.equal((await call(h.app, { url: '/api/platform/universities', host: admin })).status, 401);

  // An unknown address gets the same answer and no email.
  assert.equal((await call(h.app, { url: '/api/platform/auth/code', host: admin, body: { email: 'stranger@example.com' } })).status, 200);
  assert.ok(!h.mailer.outbox.some(m => m.to === 'stranger@example.com'));

  await call(h.app, { url: '/api/platform/auth/code', host: admin, body: { email: 'owner@example.com' } });
  const wrong = await call(h.app, { url: '/api/platform/auth/verify', host: admin, body: { email: 'owner@example.com', code: '000000' } });
  assert.equal(wrong.status, 400);
  const v = await call(h.app, { url: '/api/platform/auth/verify', host: admin, body: { email: 'owner@example.com', code: lastCode(h.mailer, 'owner@example.com') } });
  assert.equal(v.status, 200); assert.deepEqual(v.json, { needsTotp: true, totpSetUp: false });
  const cookie = v.cookie;
  assert.equal((await call(h.app, { url: '/api/platform/universities', host: admin, cookie })).status, 401, 'no access before the second factor');

  const setup = await call(h.app, { url: '/api/platform/auth/totp/setup', host: admin, cookie, body: {} });
  assert.match(setup.json.uri, /^otpauth:\/\/totp\//);
  assert.equal((await call(h.app, { url: '/api/platform/auth/totp', host: admin, cookie, body: { code: '123456' === totpAt(setup.json.secret) ? '654321' : '123456' } })).status, 400);
  assert.equal((await call(h.app, { url: '/api/platform/auth/totp', host: admin, cookie, body: { code: totpAt(setup.json.secret) } })).status, 200);
  assert.equal((await call(h.app, { url: '/api/platform/universities', host: admin, cookie })).status, 200);

  // Search the directory and provision from it.
  const found = await call(h.app, { url: '/api/platform/directory?q=strathclyde', host: admin, cookie });
  const uni = found.json[0];
  assert.equal(uni.name, 'University of Strathclyde'); assert.equal(uni.provisioned, null);
  assert.equal((await call(h.app, { url: `/api/platform/slug-check?slug=${uni.slug}`, host: admin, cookie })).json.ok, true);
  assert.equal((await call(h.app, { url: '/api/platform/slug-check?slug=cpanel', host: admin, cookie })).json.ok, false);

  const bad = await call(h.app, { url: '/api/platform/universities', host: admin, cookie, body: { name: uni.name, slug: uni.slug, domains: [{ domain: 'gmail.com' }], adminEmail: 'x@gmail.com' } });
  assert.equal(bad.status, 400); assert.match(bad.json.error, /Personal email/);
  const offDomain = await call(h.app, { url: '/api/platform/universities', host: admin, cookie, body: { name: uni.name, slug: uni.slug, domains: [{ domain: 'strath.ac.uk' }], adminEmail: 'head@elsewhere.ac.uk' } });
  assert.equal(offDomain.status, 400);

  const made = await call(h.app, { url: '/api/platform/universities', host: admin, cookie, body: {
    name: uni.name, slug: uni.slug, directoryId: uni.id, domains: uni.domains.map((domain: string) => ({ domain, includeSubdomains: true })),
    adminEmail: 'f.campbell@strath.ac.uk', adminName: 'Fiona Campbell', seatLimit: 400, contractStart: '2026-11-05', contractEnd: '2027-08-31',
  } });
  assert.equal(made.status, 200, JSON.stringify(made.json));
  assert.equal(made.json.url, `http://strathclyde.${BASE}:3100`);
  const invite = h.mailer.outbox.find(m => m.to === 'f.campbell@strath.ac.uk' && m.tag === 'invite')!;
  assert.match(invite.text, /strathclyde\.goingconcern\.test/);
  assert.equal((await call(h.app, { url: '/api/platform/directory?q=strathclyde', host: admin, cookie })).json[0].provisioned.slug, 'strathclyde');
  const again = await call(h.app, { url: '/api/platform/universities', host: admin, cookie, body: { name: 'Copy', slug: 'strath2', domains: [{ domain: 'strath.ac.uk' }], adminEmail: 'a@strath.ac.uk' } });
  assert.equal(again.status, 409); assert.match(again.json.error, /already belongs/);

  // The invited admin signs in, lands as an admin, and must accept the terms.
  const adminCookie = await signIn(h, 'strathclyde', 'f.campbell@strath.ac.uk');
  const ctx = await call(h.app, { url: '/api/context', host: `strathclyde.${BASE}`, cookie: adminCookie });
  assert.equal(ctx.json.user.role, 'admin');
  assert.equal((await call(h.app, { url: '/api/admin/overview', host: `strathclyde.${BASE}`, cookie: adminCookie })).json.terms, true);
  assert.equal((await call(h.app, { url: '/api/admin/terms', host: `strathclyde.${BASE}`, cookie: adminCookie, body: { accept: true } })).status, 200);
  assert.equal((await call(h.app, { url: '/api/admin/overview', host: `strathclyde.${BASE}`, cookie: adminCookie })).status, 200);

  // Suspending signs everyone out and stops sign-in.
  const detail = await call(h.app, { url: `/api/platform/universities/${made.json.id}`, host: admin, cookie });
  assert.equal(detail.json.admins[0].status, 'active');
  assert.equal((await call(h.app, { method: 'PATCH', url: `/api/platform/universities/${made.json.id}`, host: admin, cookie, body: { status: 'suspended' } })).status, 200);
  assert.equal((await call(h.app, { url: '/api/me', host: `strathclyde.${BASE}`, cookie: adminCookie })).status, 401);
  assert.equal((await call(h.app, { url: '/api/auth/code', host: `strathclyde.${BASE}`, body: { email: 'f.campbell@strath.ac.uk' } })).status, 403);

  const log = await call(h.app, { url: '/api/platform/audit', host: admin, cookie });
  assert.ok(['university.provision', 'person.invite', 'terms.accept', 'university.suspended'].every(a => log.json.some((e: { action: string }) => e.action === a)));
  assert.equal((await call(h.app, { url: '/api/platform/system', host: admin, cookie })).json.database.migrations[0], '001_init.sql');
});

test('the console only answers on its own host', async () => {
  assert.equal((await call(h.app, { url: '/api/platform/auth/code', host: `strathclyde.${BASE}`, body: { email: 'owner@example.com' } })).status, 404);
  assert.equal((await call(h.app, { url: '/api/platform/auth/code', host: BASE, body: { email: 'owner@example.com' } })).status, 404);
});
