import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { pageHtml } from '../../server/site';
import { BASE, call, harness, type Harness } from './helpers';

let h: Harness;
before(async () => { h = await harness(); });
after(() => h.close());

test('www sends every path to the apex with a 301', async () => {
  const r = await call(h.app, { url: '/universities/?x=1', host: `www.${BASE}` });
  assert.equal(r.status, 301);
  assert.equal(r.res.headers.location, `http://${BASE}/universities/?x=1`);
});

test('robots.txt and sitemap.xml: the public site is indexed, universities and the console are not', async () => {
  const pub = await call(h.app, { url: '/robots.txt', host: BASE });
  assert.equal(pub.status, 200); assert.match(String(pub.res.headers['content-type']), /^text\/plain/);
  assert.match(pub.res.body, /Allow: \//); assert.match(pub.res.body, new RegExp(`Sitemap: http://${BASE}/sitemap.xml`));
  for (const host of [`admin.${BASE}`, `strathclyde.${BASE}`]) {
    const r = await call(h.app, { url: '/robots.txt', host });
    assert.equal(r.status, 200); assert.match(r.res.body, /Disallow: \/\n/);
    assert.equal((await call(h.app, { url: '/sitemap.xml', host })).status, 404);
  }
  const map = await call(h.app, { url: '/sitemap.xml', host: BASE });
  assert.equal(map.status, 200); assert.match(String(map.res.headers['content-type']), /^application\/xml/);
  for (const p of ['/', '/universities/', '/demo/', '/legal/privacy']) assert.ok(map.res.body.includes(`<loc>http://${BASE}${p}</loc>`), p);
});

test('every page served from index.html gets its own title, description, Open Graph and Twitter card tags', () => {
  const index = readFileSync('index.html', 'utf8');
  const origin = 'https://goingconcernlab.com';
  const privacy = pageHtml(index, { origin, path: '/legal/privacy', indexable: true, hostKind: 'public' });
  assert.match(privacy, /<title>Privacy · Going Concern Lab<\/title>/);
  assert.match(privacy, /<meta property="og:url" content="https:\/\/goingconcernlab.com\/legal\/privacy"\/>/);
  assert.match(privacy, /<meta property="og:image" content="https:\/\/goingconcernlab.com\/og-image.png"\/>/);
  assert.match(privacy, /<meta name="twitter:card" content="summary_large_image"\/>/);
  assert.equal((privacy.match(/og:title/g) ?? []).length, 1, 'the default tags are replaced, not repeated');
  assert.match(privacy, /<meta name="gcm-host" content="public">/);
  const other = pageHtml(index, { origin, path: '/no-such-page', indexable: true, hostKind: 'public' });
  assert.match(other, /og:url" content="https:\/\/goingconcernlab.com\/"/);
  const tenant = pageHtml(index, { origin, path: '/', indexable: false, hostKind: 'tenant' });
  assert.match(tenant, /noindex/); assert.doesNotMatch(tenant, /og:title/);
  for (const page of ['public/universities/index.html', 'public/demo/index.html']) {
    const html = readFileSync(page, 'utf8');
    for (const tag of ['og:title', 'og:description', 'og:url', 'og:image', 'og:image:width" content="1200', 'og:image:height" content="630', 'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) assert.ok(html.includes(tag), `${page}: ${tag}`);
  }
});

test('the contact form emails us, with Reply-To set to the sender', async () => {
  const body = { name: 'Ada Lovelace', email: 'Ada@Example.ac.uk', university: 'University of Example', role: 'Lecturer', message: 'We would like to pilot the modules with our MBA cohort next term.' };
  const before = h.mailer.outbox.length;
  const r = await call(h.app, { url: '/api/contact', host: BASE, body });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const mail = h.mailer.outbox.at(-1)!;
  assert.equal(h.mailer.outbox.length, before + 1);
  assert.equal(mail.to, 'hello@goingconcernlab.com'); assert.equal(mail.tag, 'contact');
  assert.deepEqual(mail.replyTo, { email: 'ada@example.ac.uk', name: 'Ada Lovelace' });
  assert.match(mail.text, /University of Example/); assert.match(mail.text, /MBA cohort/);

  const missing = await call(h.app, { url: '/api/contact', host: BASE, body: { ...body, university: ' ' } });
  assert.equal(missing.status, 400); assert.match(missing.json.error, /university/);
  const bot = await call(h.app, { url: '/api/contact', host: BASE, body: { ...body, website: 'http://spam.example' } });
  assert.equal(bot.status, 200); assert.equal(h.mailer.outbox.length, before + 1, 'a filled-in hidden field sends nothing');
  assert.equal((await call(h.app, { url: '/api/contact', host: `admin.${BASE}`, body })).status, 404);
  assert.equal((await call(h.app, { url: '/api/contact', host: BASE, body, headers: { 'x-gcm': '' } })).status, 403);

  let last = 200;
  for (let i = 0; i < 6; i++) last = (await call(h.app, { url: '/api/contact', host: BASE, body })).status;
  assert.equal(last, 429, 'a few messages an hour from one address, then a pointer to the email address');
});

test('finding a university with a personal address says a university email is required', async () => {
  const r = await call(h.app, { url: '/api/find-university', host: BASE, body: { email: 'someone@gmail.com' } });
  assert.equal(r.status, 400); assert.match(r.json.error, /university email address/);
});
