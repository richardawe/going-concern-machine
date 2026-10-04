const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
// Live company (#/live) end to end on the production build: play every year on the 3D campus, reach the ending and
// replay it beside the company that held course; then load a reckless and a patient game to see failure and success.
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const serve = async page => page.route('http://gcm.test/**', async route => { const url = new URL(route.request().url()); const part = url.pathname.replace(/^\/going-concern-machine\//, '').replace(/^\//, ''); const file = path.resolve('dist', part || 'index.html'); if (!file.startsWith(path.resolve('dist') + path.sep)) { await route.abort(); return } try { const body = await readFile(file); await route.fulfill({ body, contentType: file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.json') ? 'application/json' : 'text/html' }) } catch { await route.fulfill({ status: 404, body: 'Not found' }) } });
const URL_LIVE = 'http://gcm.test/going-concern-machine/#/live';
try {
 await mkdir('artifacts', { recursive: true });
 const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
 await serve(page);
 await page.goto(URL_LIVE);
 await page.getByRole('radiogroup', { name: 'Scenario' }).waitFor();
 await page.getByRole('radio', { name: /The Price War/ }).click();
 await page.getByRole('button', { name: /Read the briefing/ }).click();
 await page.getByRole('button', { name: /Take the chair/ }).click();
 await page.locator('.live-stage canvas').waitFor({ timeout: 30000 });
 await page.waitForTimeout(1500); await page.screenshot({ path: 'artifacts/live-start.png' });
 for (let year = 1; year <= 5; year++) {
  if (year === 1) await page.getByText('Hold prices; invest in service and loyalty').click();
  await page.getByRole('button', { name: `Play year ${year}` }).click();
  await page.getByText(`PLAYING YEAR ${year}…`).waitFor();
  if (year === 1) { await page.waitForTimeout(900); await page.screenshot({ path: 'artifacts/live-running.png' }); }
  await page.getByRole('heading', { name: `Year ${year} in the news` }).waitFor({ timeout: 15000 });
  if (year === 1) { await page.getByLabel('Show the company that held course').check(); await page.waitForTimeout(2500); await page.screenshot({ path: 'artifacts/live-ghost.png' }); await page.getByLabel('Show the company that held course').uncheck(); }
  await page.getByRole('button', { name: year < 5 ? `Decide year ${year + 1}` : 'See how it ended' }).click();
 }
 await page.locator('#finale-title').waitFor();
 // Clicking the cash tank opens the inspector for cash.
 await page.getByRole('button', { name: 'What am I looking at?' }).click(); await page.locator('.live-legend').waitFor();
 await page.screenshot({ path: 'artifacts/live-finale.png', fullPage: true });
 await page.getByRole('button', { name: 'Hide' }).click();
 await page.getByRole('button', { name: /Watch your 5 years/ }).click();
 await page.getByText('HOLDING COURSE · YEAR 0').waitFor(); await page.getByText('HOLDING COURSE · YEAR 1').waitFor({ timeout: 10000 });
 await page.getByRole('button', { name: 'Pause replay' }).click(); await page.getByLabel('Replay year').fill('3');
 await page.getByText('HOLDING COURSE · YEAR 3').waitFor(); await page.waitForTimeout(2500); await page.screenshot({ path: 'artifacts/live-replay.png' });
 await page.emulateMedia({ colorScheme: 'dark' }); await page.screenshot({ path: 'artifacts/live-replay-dark.png' }); await page.emulateMedia({ colorScheme: 'light' });
 // Mobile width: no horizontal scroll.
 await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(500);
 assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal scroll on a phone');
 await page.screenshot({ path: 'artifacts/live-mobile.png' });
 // CEO mode keeps its own game: the live game did not touch it.
 assert.equal(await page.evaluate(() => localStorage.getItem('gcm:ceo:v1:game')), null);

 // Reckless and patient games, loaded straight into their final year.
 const lv = { price: 0, workforce: 0, pay: -10, marketing: 40, rd: 50, people: 50, dividends: 100, reinvestment: 0 };
 const seeded = {
  failure: { caseId: 'sandbox', sandbox: { archetype: 'retail', events: [{ kind: 'recession', year: 1 }, { kind: 'creditSqueeze', year: 2 }, { kind: 'rateRise', year: 2 }, { kind: 'costInflation', year: 3 }, { kind: 'customerLoss', year: 4 }] }, choice: { kind: 'fictional', archetype: 'retail', seed: 5150 }, stage: 'play', decisions: ['priceCut', 'layoffs', 'debt', 'priceCut'].map(card => ({ card, levers: lv })) },
  success: { caseId: 'sandbox', sandbox: { archetype: 'software', events: [{ kind: 'demandBoom', year: 2 }] }, choice: { kind: 'fictional', archetype: 'software', seed: 5150 }, stage: 'play', decisions: ['rd', 'brand', null, 'automate'].map(card => ({ card, levers: { ...lv, pay: 3, reinvestment: 80, dividends: 0 } })) },
 };
 await page.setViewportSize({ width: 1440, height: 1000 });
 for (const [name, game] of Object.entries(seeded)) {
  await page.evaluate(g => localStorage.setItem('gcm:live:v1', JSON.stringify(g)), game); await page.reload();
  await page.getByRole('button', { name: 'Play year 5' }).waitFor({ timeout: 30000 });
  await page.locator('.live-stage canvas').waitFor(); await page.waitForTimeout(2500);
  await page.screenshot({ path: `artifacts/live-${name}-y4.png` });
 }
 assert.deepEqual(errors, []); console.log('Live company browser flow passed. Screenshots in artifacts/.');
} finally { await browser.close() }
