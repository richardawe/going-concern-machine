// The whole platform in a real browser, against the built server and a fresh database:
// the platform console provisions a university from the UK directory, its admin accepts the terms and invites a
// lecturer, the lecturer creates a course, a student joins by link, hands in, and both download identical PDFs.
// Needs: npm run build (with BASE_PATH=/) and npm run build:server, and a non-superuser test database.
// Usage: TEST_DATABASE_URL=postgres://gcm_test:gcm_test@127.0.0.1:5432/gcm_test npm run test:portal [-- --shots dir]
const { spawn, execFileSync } = require('child_process');
const { chromium } = require('playwright');
const fs = require('fs'), crypto = require('crypto'), path = require('path');
const DB = process.env.TEST_DATABASE_URL || 'postgres://gcm_test:gcm_test@127.0.0.1:5432/gcm_test';
const shotsAt = process.argv.indexOf('--shots'), DIR = shotsAt > 0 ? process.argv[shotsAt + 1] : null, PORT = 3199, P = 'http://';
const finished = () => JSON.parse(execFileSync('node', ['--import', 'tsx', '-e', "import('./tests/server/helpers.ts').then(h => { const ids = ['price-war','talent-exodus','cash-crunch','growth-at-any-cost','automation-bet','dividend-pressure']; process.stdout.write(JSON.stringify(Object.fromEntries(ids.map(i => [i, h.finishedModule(i)])))); process.exit(0); })"], { maxBuffer: 1e8 }).toString());
let LOGTEXT = '', mark = 0;
const code = async email => { for (let i = 0; i < 40; i++) { const m = [...LOGTEXT.slice(mark).matchAll(/To (\S+): (\d{6}) is your/g)].filter(x => x[1] === email).at(-1); if (m) return m[2]; await new Promise(r => setTimeout(r, 250)); } throw new Error('no code for ' + email); };
let server;
const b32 = s => { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = 0, v = 0; const out = []; for (const c of s.replace(/\s/g, '')) { v = (v << 5) | A.indexOf(c); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); };
const totp = s => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000))); const h = crypto.createHmac('sha1', b32(s)).update(b).digest(), o = h[19] & 15; return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0'); };
const errors = [];
async function page(browser, name) { const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } }); const p = await ctx.newPage(); p.on('pageerror', e => errors.push(`${name}: ${e.message}`)); p.on('console', m => { if (m.type() === 'error' && !/401|404|409/.test(m.text())) errors.push(`${name}: ${m.text()}`); }); return p; }
async function signIn(p, url, email) {
  await p.goto(url); await p.fill('#signin-email', email); mark = LOGTEXT.length; await p.click('text=Email me a sign-in code');
  const c = await code(email); await p.locator('.codebox input').first().fill(c);
}
const shot = (p, n) => DIR ? p.screenshot({ path: `${DIR}/${n}.png`, fullPage: true }) : null;
(async () => {
  const pg = require('pg'), c = new pg.Client({ connectionString: DB }); await c.connect(); await c.query('drop schema public cascade; create schema public'); await c.end();
  const env = { ...process.env, NODE_ENV: 'development', PORT: String(PORT), BASE_DOMAIN: 'localhost', DATABASE_URL: DB, SESSION_SECRET: 'portal-browser-test-secret-0123456789abc', EMAIL_MODE: 'log', SECURE_COOKIES: 'false', STATIC_DIR: 'dist', RELEASE: 'browser-test' };
  execFileSync('node', ['dist-server/migrate.js'], { env, stdio: 'ignore' });
  execFileSync('node', ['dist-server/platform-admin.js', 'add', 'owner@example.com', 'Owner'], { env, stdio: 'ignore' });
  server = spawn('node', ['dist-server/main.js'], { env }); server.stdout.on('data', d => { LOGTEXT += d; }); server.stderr.on('data', d => { LOGTEXT += d; });
  for (let i = 0; i < 40; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/healthz`)).ok) break; } catch {} await new Promise(r => setTimeout(r, 250)); }
  const browser = await chromium.launch();
  // 1. Platform console
  const a = await page(browser, 'platform');
  await signIn(a, `${P}admin.localhost:${PORT}/`, 'owner@example.com');
  await a.waitForSelector('code.secret'); await shot(a, '01-platform-2fa');
  const secret = (await a.textContent('code.secret')).trim();
  await a.locator('.codebox input').first().fill(totp(secret));
  await a.waitForSelector('text=Provision a university'); await shot(a, '02-platform-empty');
  await a.click('text=Provision a university');
  await a.fill('#dir-q', 'strath'); await a.waitForSelector('.dir-hits button'); await shot(a, '03-provision-search');
  await a.click('.dir-hits button:has-text("University of Strathclyde")');
  await a.fill('#p-aemail', 'f.campbell@strath.ac.uk'); await a.fill('#p-aname', 'Fiona Campbell'); await a.fill('#p-seats', '400');
  await a.waitForSelector('text=Available'); await shot(a, '04-provision-form');
  await a.click('button:has-text("Provision University of Strathclyde")');
  await a.waitForSelector('text=is ready at'); await shot(a, '05-university-detail');
  // 2. University admin
  const ad = await page(browser, 'uni-admin');
  await ad.goto(`${P}strathclyde.localhost:${PORT}/`); await shot(ad, '06-uni-signin');
  await signIn(ad, `${P}strathclyde.localhost:${PORT}/`, 'f.campbell@strath.ac.uk');
  await ad.waitForSelector('text=Teaching'); await ad.goto(`${P}strathclyde.localhost:${PORT}/admin`);
  await ad.waitForSelector('text=Accept and continue'); await shot(ad, '07-terms');
  await ad.check('input[type=checkbox]'); await ad.click('text=Accept and continue');
  await ad.waitForSelector('text=Getting started'); await shot(ad, '08-admin-overview');
  await ad.click('a:has-text("People")'); await ad.fill('#inv-email', 'j.wu@strath.ac.uk'); await ad.fill('#inv-name', 'James Wu'); await ad.click('text=Send invite');
  await ad.waitForSelector('text=Invite sent'); await shot(ad, '09-people');
  // 3. Lecturer creates a course
  const l = await page(browser, 'lecturer');
  await signIn(l, `${P}strathclyde.localhost:${PORT}/`, 'j.wu@strath.ac.uk');
  await l.waitForSelector('text=New course'); await l.click('text=New course');
  await l.fill('#c-title', 'Corporate Finance'); await l.fill('#c-code', 'FIN 7102'); await l.fill('#c-term', 'Autumn 2026'); await l.fill('#c-due', '2026-12-06T17:00');
  await shot(l, '10-new-course'); await l.click('button:has-text("Create course")');
  await l.waitForSelector('text=Join link'); const joinUrl = (await l.textContent('.join-url')).trim();
  // 4. Student joins by link before signing in, works and hands in
  const s = await page(browser, 'student');
  await s.goto(joinUrl.replace('https://', 'http://'));
  await signIn(s, joinUrl, 'amy.adeyemi@uni.strath.ac.uk');
  await s.waitForSelector('#p-name'); await s.fill('#p-name', 'Amy Adeyemi'); await s.fill('#p-sid', '202611042'); await s.click('button:has-text("Continue")');
  await s.waitForSelector('text=Module 1 · Pricing and margin'); await shot(s, '11-course-home');
  await s.click('text=The Price War'); await s.waitForSelector('.module-head'); await s.waitForTimeout(800); await shot(s, '12-module');
  const courseId = s.url().split('/courses/')[1].split('/')[0];
  const progress = finished();
  await s.evaluate(async ({ id, data }) => { for (const [m, d] of Object.entries(data)) { const r = await fetch(`/api/courses/${id}/progress/${m}`, { method: 'PUT', headers: { 'content-type': 'application/json', 'x-gcm': '1' }, body: JSON.stringify({ version: 0, data: d }) }); if (!r.ok) throw new Error(await r.text()); } }, { id: courseId, data: progress });
  await s.goto(`${P}strathclyde.localhost:${PORT}/courses/${courseId}/hand-in`); await s.waitForSelector('text=What you’re handing in');
  await s.check('input[type=checkbox]'); await shot(s, '13-hand-in'); await s.click('button:has-text("Hand it in")');
  await s.waitForSelector('text=Receipt'); await s.waitForSelector('a:has-text("Download PDF")', { timeout: 30000 }); await shot(s, '14-receipt');
  const [dl] = await Promise.all([s.waitForEvent('download'), s.click('a:has-text("Download PDF")')]); const studentPdf = fs.readFileSync(await dl.path());
  await s.goto(`${P}strathclyde.localhost:${PORT}/`); await s.waitForSelector('text=Handed in'); await shot(s, '15-my-courses');
  // 5. Lecturer sees it
  await l.reload(); await l.waitForSelector('td.mono'); await shot(l, '16-roster');
  await l.click('a:has-text("Amy Adeyemi")'); await l.waitForSelector('text=Module 1 grades'); await shot(l, '17-student-work');
  const [dl2] = await Promise.all([l.waitForEvent('download'), l.click('a:has-text("Download PDF")')]); if (!studentPdf.equals(fs.readFileSync(await dl2.path()))) throw new Error('The student and lecturer PDFs differ.');
  // Isolation: the student's cookie at another subdomain, and the console
  await a.goto(`${P}admin.localhost:${PORT}/system`); await a.waitForSelector('text=Deadlines'); await shot(a, '18-system');
  await a.goto(`${P}admin.localhost:${PORT}/`); await a.waitForSelector('td'); await shot(a, '19-universities');
  const pub = await page(browser, 'public'); await pub.goto(`${P}localhost:${PORT}/sign-in`); await pub.fill('#find-email', 'x@strath.ac.uk'); await shot(pub, '20-find');
  await pub.goto(`${P}nowhere.localhost:${PORT}/`); await pub.waitForSelector('text=no university here'); 
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 } }); const mp = await mob.newPage(); await mp.goto(`${P}strathclyde.localhost:${PORT}/`); await mp.waitForSelector('#signin-email'); if (DIR) await mp.screenshot({ path: DIR + '/21-mobile-signin.png' });
  await browser.close();
  if (errors.length) throw new Error('Browser errors:\n' + errors.join('\n'));
  console.log('Portal walkthrough passed: provision → admin → lecturer → student hand-in → identical PDFs.');
})().then(() => server.kill(), e => { console.error('FAILED', e); server?.kill(); process.exit(1); });
