import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { addUser, BASE, call, finishedModule, harness, lastCode, makeTenant, signIn, type Harness } from './helpers';

let h: Harness, north = '', south = '';
before(async () => {
  h = await harness();
  north = await makeTenant(h, 'northgate', ['northgate.ac.uk'], { seatLimit: 3 });
  south = await makeTenant(h, 'southfield', ['southfield.ac.uk']);
});
after(() => h.close());
const N = `northgate.${BASE}`, S = `southfield.${BASE}`;

test('sign-in: only the university’s domains, a code that expires after wrong tries, and accounts made on first sign-in', async () => {
  const gmail = await call(h.app, { url: '/api/auth/code', host: N, body: { email: 'someone@gmail.com' } });
  assert.equal(gmail.status, 400); assert.match(gmail.json.error, /@northgate\.ac\.uk/);
  assert.equal((await call(h.app, { url: '/api/auth/code', host: N, body: { email: 'a@southfield.ac.uk' } })).status, 400, 'another university’s domain');

  // A subdomain of an allowed domain (student.northgate.ac.uk) is accepted by default.
  const email = 'A.Okafor@Student.Northgate.ac.uk';
  assert.equal((await call(h.app, { url: '/api/auth/code', host: N, body: { email } })).status, 200);
  const code = lastCode(h.mailer, email.toLowerCase());
  for (let i = 0; i < 5; i++) await call(h.app, { url: '/api/auth/verify', host: N, body: { email, code: code === '111111' ? '222222' : '111111' } });
  const locked = await call(h.app, { url: '/api/auth/verify', host: N, body: { email, code } });
  assert.equal(locked.status, 400); assert.match(locked.json.error, /new one/);

  const cookie = await signIn(h, 'northgate', email);
  const me = await call(h.app, { url: '/api/me', host: N, cookie });
  assert.equal(me.json.email, 'a.okafor@student.northgate.ac.uk'); assert.equal(me.json.role, 'student');
  assert.equal((await call(h.app, { method: 'PATCH', url: '/api/me', host: N, cookie, body: { name: 'Amaka Okafor', studentId: 'N2210934' } })).status, 200);
});

test('a session never works at another university, and the database refuses to mix them even without a filter', async () => {
  const cookie = await signIn(h, 'northgate', 'b.byrne@northgate.ac.uk');
  assert.equal((await call(h.app, { url: '/api/me', host: N, cookie })).status, 200);
  assert.equal((await call(h.app, { url: '/api/me', host: S, cookie })).status, 401);

  await signIn(h, 'southfield', 'c.south@southfield.ac.uk');
  const seenFromNorth = await h.db.tenant(north, q => q.many<{ email: string }>('select email from users'));
  assert.ok(seenFromNorth.length >= 2 && seenFromNorth.every(u => u.email.endsWith('northgate.ac.uk')));
  await assert.rejects(h.db.tenant(north, q => q.exec("insert into users (tenant_id, email) values ($1, 'x@southfield.ac.uk')", [south])), /row-level security/);
  const sessions = await h.db.tenant(south, q => q.many('select * from sessions'));
  assert.ok(sessions.length >= 1 && sessions.every(s => s.tenant_id === south));
  assert.equal((await h.db.tenant(north, q => q.many('select * from platform_admins'))).length, 0, 'a university can’t see the platform tables');
});

test('requests that change something must come from our pages', async () => {
  const noHeader = await h.app.inject({ method: 'POST', url: '/api/auth/code', headers: { host: N }, payload: { email: 'x@northgate.ac.uk' } });
  assert.equal(noHeader.statusCode, 403);
  const foreign = await h.app.inject({ method: 'POST', url: '/api/auth/code', headers: { host: N, 'x-gcm': '1', origin: 'https://evil.example' }, payload: { email: 'x@northgate.ac.uk' } });
  assert.equal(foreign.statusCode, 403);
});

test('seat limit: new students are refused once a university’s places are used', async () => {
  const n = await h.db.platform(q => q.one<{ n: number }>("select count(*)::int as n from users where tenant_id = $1 and role = 'student'", [north]));
  assert.equal(n.n, 2);
  await signIn(h, 'northgate', 'third@northgate.ac.uk');
  await call(h.app, { url: '/api/auth/code', host: N, body: { email: 'fourth@northgate.ac.uk' } });
  const r = await call(h.app, { url: '/api/auth/verify', host: N, body: { email: 'fourth@northgate.ac.uk', code: lastCode(h.mailer, 'fourth@northgate.ac.uk') } });
  assert.equal(r.status, 400); assert.match(r.json.error, /student places/);
  await h.db.platform(q => q.exec('update tenants set seat_limit = null where id = $1', [north]));
});

test('find your university from the public site', async () => {
  const r = await call(h.app, { url: '/api/find-university', host: BASE, body: { email: 'x@student.southfield.ac.uk' } });
  assert.equal(r.json.name, 'Southfield University'); assert.match(r.json.url, /^http:\/\/southfield\.goingconcern\.test/);
  assert.equal((await call(h.app, { url: '/api/find-university', host: BASE, body: { email: 'x@nowhere.ac.uk' } })).status, 404);
});

test('university admin: invite a lecturer, change roles, deactivate, never remove the last admin', async () => {
  const { id: adminId } = await addUser(h, south, 'head@southfield.ac.uk', 'admin', 'Sunita Patel');
  const cookie = await signIn(h, 'southfield', 'head@southfield.ac.uk');
  assert.equal((await call(h.app, { url: '/api/admin/people', host: S, cookie, body: { email: 'j.wu@southfield.ac.uk', name: 'James Wu', role: 'lecturer' } })).status, 200);
  assert.equal(h.mailer.outbox.at(-1)!.tag, 'invite');
  assert.equal((await call(h.app, { url: '/api/admin/people', host: S, cookie, body: { email: 'j.wu@northgate.ac.uk', role: 'lecturer' } })).status, 400);
  const people = await call(h.app, { url: '/api/admin/people?role=lecturer', host: S, cookie });
  assert.equal(people.json.people[0].status, 'invited');
  const lecturer = await signIn(h, 'southfield', 'j.wu@southfield.ac.uk');
  assert.equal((await call(h.app, { url: '/api/me', host: S, cookie: lecturer })).json.role, 'lecturer');
  assert.equal((await call(h.app, { url: '/api/admin/overview', host: S, cookie: lecturer })).status, 403);

  assert.equal((await call(h.app, { method: 'PATCH', url: `/api/admin/people/${adminId}`, host: S, cookie, body: { role: 'lecturer' } })).status, 400);
  const student = (await call(h.app, { url: '/api/admin/people?role=student', host: S, cookie })).json.people[0];
  assert.equal((await call(h.app, { method: 'PATCH', url: `/api/admin/people/${student.id}`, host: S, cookie, body: { status: 'deactivated' } })).status, 200);
  const blocked = await call(h.app, { url: '/api/auth/code', host: S, body: { email: student.email } });
  assert.equal(blocked.status, 403); assert.match(blocked.json.error, /deactivated/);
  const imported = await call(h.app, { url: '/api/admin/people/import', host: S, cookie, body: { csv: 'email,name,role\nr.lowe@southfield.ac.uk,Rachel Lowe,lecturer\nbad@gmail.com,X,lecturer' } });
  assert.equal(imported.json.invited, 1); assert.equal(imported.json.problems.length, 1);
});

test('course: create, join, autosave with conflict detection, hand in, grade, identical PDFs, CSV and zip', async () => {
  const lecturer = await signIn(h, 'southfield', 'j.wu@southfield.ac.uk');
  await call(h.app, { method: 'PATCH', url: '/api/me', host: S, cookie: lecturer, body: { name: 'James Wu' } });
  const created = await call(h.app, { url: '/api/teach/courses', host: S, cookie: lecturer, body: {
    title: 'Corporate Finance', code: 'FIN 7102', term: 'Autumn 2026', modules: ['price-war', 'cash-crunch'], dueAt: '2030-11-06T17:00:00.000Z', coLecturers: ['r.lowe@southfield.ac.uk'],
  } });
  assert.equal(created.status, 200, JSON.stringify(created.json));
  const course = created.json;
  assert.match(course.joinCode, /^[A-Z0-9]{3}-[A-Z0-9]{3}$/); assert.equal(course.staff.length, 2);

  const student = await signIn(h, 'southfield', 'amy@student.southfield.ac.uk');
  assert.equal((await call(h.app, { url: `/api/courses/${course.id}`, host: S, cookie: student })).status, 404, 'not enrolled yet');
  const join = await call(h.app, { url: '/api/join', host: S, cookie: student, body: { code: course.joinCode.toLowerCase() } });
  assert.equal(join.json.courseId, course.id);
  const elsewhere = await signIn(h, 'northgate', 'spy@northgate.ac.uk');
  assert.equal((await call(h.app, { url: '/api/join', host: N, cookie: elsewhere, body: { code: course.joinCode } })).status, 404, 'join codes are per university');

  const snap = await call(h.app, { url: `/api/courses/${course.id}/snapshot`, host: S, cookie: student });
  assert.ok(snap.json.archetypes.length > 3);

  const save = (version: number, data: unknown, module = 'price-war') => call(h.app, { method: 'PUT', url: `/api/courses/${course.id}/progress/${module}`, host: S, cookie: student, body: { version, data } });
  const draft = { ...finishedModule(), stage: 'concepts' };
  assert.equal((await save(0, draft)).json.version, 1);
  const stale = await save(0, draft);
  assert.equal(stale.status, 409); assert.equal(stale.json.version, 1);
  assert.equal((await save(1, finishedModule())).json.version, 2);
  assert.equal((await save(2, finishedModule(), 'growth-at-any-cost')).status, 404, 'module not on this course');

  const noName = await call(h.app, { url: `/api/courses/${course.id}/hand-in`, host: S, cookie: student, body: { confirm: true } });
  assert.equal(noName.status, 400); assert.match(noName.json.error, /name/);
  await call(h.app, { method: 'PATCH', url: '/api/me', host: S, cookie: student, body: { name: 'Amy Adeyemi', studentId: 'S1234' } });
  const handed = await call(h.app, { url: `/api/courses/${course.id}/hand-in`, host: S, cookie: student, body: { confirm: true } });
  assert.equal(handed.status, 200, JSON.stringify(handed.json));
  assert.match(handed.json.code, /^GCM-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(handed.json.late, false); assert.equal(handed.json.attempt, 1);
  assert.ok(h.mailer.outbox.some(m => m.to === 'amy@student.southfield.ac.uk' && m.tag === 'receipt'));
  assert.equal((await call(h.app, { url: `/api/courses/${course.id}/hand-in.pdf`, host: S, cookie: student })).status, 409, 'still grading');

  assert.equal(await h.grader.runOnce(), true);
  assert.equal(await h.grader.runOnce(), false);
  const roster = await call(h.app, { url: `/api/teach/courses/${course.id}/roster`, host: S, cookie: lecturer });
  const row = roster.json[0];
  assert.equal(row.status, 'handed-in'); assert.equal(row.handIn.code, handed.json.code); assert.equal(row.handIn.pasted, 1);
  assert.ok(row.handIn.grades['price-war'].outcome.grade);

  const mine = await call(h.app, { url: `/api/courses/${course.id}/hand-in.pdf`, host: S, cookie: student });
  const theirs = await call(h.app, { url: `/api/teach/courses/${course.id}/students/${row.userId}/hand-in.pdf`, host: S, cookie: lecturer });
  assert.equal(mine.status, 200); assert.equal(mine.res.headers['content-type'], 'application/pdf');
  assert.ok(mine.res.rawPayload.equals(theirs.res.rawPayload), 'student and lecturer PDFs are byte-for-byte identical');

  // Renaming the course afterwards doesn't change the PDF already handed in.
  await call(h.app, { method: 'PATCH', url: `/api/teach/courses/${course.id}`, host: S, cookie: lecturer, body: { title: 'Corporate Finance II' } });
  assert.ok((await call(h.app, { url: `/api/courses/${course.id}/hand-in.pdf`, host: S, cookie: student })).res.rawPayload.equals(mine.res.rawPayload));

  const csv = await call(h.app, { url: `/api/teach/courses/${course.id}/export.csv`, host: S, cookie: lecturer });
  assert.match(csv.res.body, /Amy Adeyemi,S1234,amy@student\.southfield\.ac\.uk,Handed in/);
  const zip = await call(h.app, { url: `/api/teach/courses/${course.id}/hand-ins.zip`, host: S, cookie: lecturer });
  assert.equal(zip.status, 200); assert.equal(zip.res.rawPayload.subarray(0, 2).toString(), 'PK');

  // Another university's lecturer can't see this course, even with its id.
  const otherLecturer = await addUser(h, north, 'prof@northgate.ac.uk', 'lecturer');
  const other = await signIn(h, 'northgate', 'prof@northgate.ac.uk');
  assert.ok(otherLecturer.id);
  assert.equal((await call(h.app, { url: `/api/teach/courses/${course.id}/roster`, host: N, cookie: other })).status, 404);
  assert.equal((await call(h.app, { url: `/api/teach/courses/${course.id}/roster`, host: S, cookie: other })).status, 401);

  // Handing in again replaces the hand-in and counts the attempt; grades are recomputed.
  const again = await call(h.app, { url: `/api/courses/${course.id}/hand-in`, host: S, cookie: student, body: { confirm: true } });
  assert.equal(again.json.attempt, 2);
  await h.grader.drain();
  assert.equal((await call(h.app, { url: `/api/courses/${course.id}/hand-in`, host: S, cookie: student })).json.handIn.graded, true);
});

test('deadlines: late work is flagged, or refused when the course says so, and extensions move the date', async () => {
  const lecturer = await signIn(h, 'southfield', 'j.wu@southfield.ac.uk');
  const c = (await call(h.app, { url: '/api/teach/courses', host: S, cookie: lecturer, body: { title: 'Liquidity', code: 'FIN 6200', modules: ['cash-crunch'], dueAt: '2020-01-01T12:00:00Z', latePolicy: 'block' } })).json;
  const student = await signIn(h, 'southfield', 'amy@student.southfield.ac.uk');
  await call(h.app, { url: '/api/join', host: S, cookie: student, body: { code: c.joinCode } });
  await call(h.app, { method: 'PUT', url: `/api/courses/${c.id}/progress/cash-crunch`, host: S, cookie: student, body: { version: 0, data: finishedModule('cash-crunch') } });
  const refused = await call(h.app, { url: `/api/courses/${c.id}/hand-in`, host: S, cookie: student, body: { confirm: true } });
  assert.equal(refused.status, 403); assert.match(refused.json.error, /extension/);

  const me = (await call(h.app, { url: `/api/teach/courses/${c.id}/roster`, host: S, cookie: lecturer })).json[0];
  assert.equal((await call(h.app, { method: 'PUT', url: `/api/teach/courses/${c.id}/students/${me.userId}/extension`, host: S, cookie: lecturer, body: { until: '2031-01-01T12:00:00Z' } })).status, 200);
  const ok = await call(h.app, { url: `/api/courses/${c.id}/hand-in`, host: S, cookie: student, body: { confirm: true } });
  assert.equal(ok.status, 200); assert.equal(ok.json.late, false);

  await call(h.app, { method: 'PATCH', url: `/api/teach/courses/${c.id}`, host: S, cookie: lecturer, body: { latePolicy: 'flag' } });
  await call(h.app, { method: 'PUT', url: `/api/teach/courses/${c.id}/students/${me.userId}/extension`, host: S, cookie: lecturer, body: { until: null } });
  const late = await call(h.app, { url: `/api/courses/${c.id}/hand-in`, host: S, cookie: student, body: { confirm: true } });
  assert.equal(late.json.late, true);
});

test('account: sessions, sign out elsewhere, and a full download of my data', async () => {
  const a = await signIn(h, 'southfield', 'amy@student.southfield.ac.uk'), b = await signIn(h, 'southfield', 'amy@student.southfield.ac.uk');
  assert.ok((await call(h.app, { url: '/api/me/sessions', host: S, cookie: a })).json.length >= 2);
  await call(h.app, { url: '/api/me/sessions/sign-out-others', host: S, cookie: a, body: {} });
  assert.equal((await call(h.app, { url: '/api/me', host: S, cookie: b })).status, 401);
  const data = await call(h.app, { url: '/api/me/export', host: S, cookie: a });
  assert.equal(data.json.account.email, 'amy@student.southfield.ac.uk'); assert.ok(data.json.handIns.length >= 1);
});

test('pages: the app shell knows which kind of host it is on, with security headers', async () => {
  const page = await call(h.app, { url: '/courses/whatever', host: S });
  assert.equal(page.status, 200); assert.match(page.res.body, /<meta name="gcm-host" content="tenant">/);
  assert.match(String(page.res.headers['content-security-policy']), /frame-ancestors 'none'/);
  assert.match((await call(h.app, { url: '/', host: `nowhere.${BASE}` })).res.body, /content="missing"/);
  assert.equal((await call(h.app, { url: '/x', host: `www.${BASE}` })).status, 301);
  assert.equal((await call(h.app, { url: '/healthz', host: '127.0.0.1' })).json.ok, true);
  // The static pages are served from their folders, with the trailing slash their relative links need.
  const uni = await call(h.app, { url: '/universities/', host: BASE });
  assert.equal(uni.status, 200); assert.match(uni.res.body, /Going Concern Modules for universities/);
  assert.equal((await call(h.app, { url: '/demo/', host: BASE })).status, 200);
  const bare = await call(h.app, { url: '/universities', host: BASE });
  assert.equal(bare.status, 301); assert.equal(bare.res.headers.location, '/universities/');
});
