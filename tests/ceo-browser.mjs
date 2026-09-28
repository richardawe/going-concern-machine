const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
// CEO mode end to end on the production build: pick a case and company, play every year, reach the debrief.
const browser = await chromium.launch({ headless: true });
try {
 const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' }); const errors = []; page.on('pageerror', e => errors.push(e.message));
 await page.route('http://gcm.test/**', async route => { const url = new URL(route.request().url()); const part = url.pathname.replace(/^\/going-concern-machine\//, '').replace(/^\//, ''); const file = path.resolve('dist', part || 'index.html'); if (!file.startsWith(path.resolve('dist') + path.sep)) { await route.abort(); return } try { const body = await readFile(file); await route.fulfill({ body, contentType: file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.json') ? 'application/json' : 'text/html' }) } catch { await route.fulfill({ status: 404, body: 'Not found' }) } });
 await mkdir('artifacts', { recursive: true });
 // The company workbench links to CEO mode.
 await page.goto('http://gcm.test/going-concern-machine/'); await page.getByRole('link', { name: /CEO mode/ }).click();
 await page.getByRole('radiogroup', { name: 'Scenario' }).waitFor();
 await page.screenshot({ path: 'artifacts/ceo-setup.png', fullPage: true });
 // Fictional company in The Price War.
 await page.getByRole('radio', { name: /The Price War/ }).click();
 await page.getByRole('button', { name: /Read the briefing/ }).click();
 await page.getByRole('heading', { name: 'The Price War' }).waitFor();
 assert.ok(await page.getByText(/fictional/i).count());
 await page.screenshot({ path: 'artifacts/ceo-briefing.png', fullPage: true });
 await page.getByRole('button', { name: /Take the chair/ }).click();
 for (let year = 1; year <= 5; year++) {
  await page.getByRole('heading', { level: 2 }).filter({ hasText: /./ }).first().waitFor();
  await page.getByRole('button', { name: `Play year ${year}` }).waitFor();
  if (year === 1) { await page.getByText('Hold prices; invest in service and loyalty').click(); await page.getByRole('slider', { name: 'Pay vs market' }).fill('3'); await page.screenshot({ path: 'artifacts/ceo-decision.png', fullPage: true }); }
  if (year === 2) await page.getByText('Build an online and click-and-collect channel').click();
  await page.getByRole('button', { name: `Play year ${year}` }).click();
  await page.getByRole('heading', { name: `Year ${year} in the news` }).waitFor();
  if (year === 1) { await page.getByText('Discounter opens 40 stores').first().waitFor(); await page.locator('.impact-table').waitFor(); await page.screenshot({ path: 'artifacts/ceo-result.png', fullPage: true }); }
  await page.getByRole('button', { name: year < 5 ? `Decide year ${year + 1}` : 'Open the debrief' }).click();
 }
 await page.getByRole('heading', { name: /possible card strategies/ }).waitFor({ timeout: 20000 });
 await page.getByText('WHAT THIS CASE WAS TESTING').waitFor();
 assert.ok(await page.locator('.attribution tbody tr').count() >= 2, 'both played cards are attributed');
 await page.getByRole('tab', { name: 'Cash', exact: true }).click();
 await page.locator('.chart-wrap svg').hover(); await page.locator('.chart-tip').waitFor();
 await page.screenshot({ path: 'artifacts/ceo-debrief.png', fullPage: true });
 await page.emulateMedia({ colorScheme: 'dark' }); await page.screenshot({ path: 'artifacts/ceo-debrief-dark.png', fullPage: true }); await page.emulateMedia({ colorScheme: 'light' });
 // Progress survives a reload.
 await page.reload(); await page.getByRole('heading', { name: /possible card strategies/ }).waitFor({ timeout: 20000 });
 // A real company in another case, on a phone.
 await page.getByRole('button', { name: 'Choose another situation' }).click();
 await page.setViewportSize({ width: 390, height: 844 });
 await page.getByRole('radio', { name: /Talent Exodus/ }).click(); await page.getByRole('radio', { name: /MSFT/ }).click();
 await page.getByRole('button', { name: /Read the briefing/ }).click(); await page.getByRole('heading', { name: 'Microsoft Corporation' }).waitFor();
 await page.getByRole('button', { name: /Take the chair/ }).click(); await page.getByRole('button', { name: 'Play year 1' }).click(); await page.getByRole('heading', { name: 'Year 1 in the news' }).waitFor();
 assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal page scroll on a phone');
 await page.screenshot({ path: 'artifacts/ceo-mobile.png', fullPage: true });
 // Sandbox: pick shocks, hold course every year, and get a sampled strategy ranking.
 await page.setViewportSize({ width: 1440, height: 1000 });
 await page.getByRole('button', { name: 'Decide year 2' }).click(); await page.getByRole('button', { name: 'Abandon this game' }).click();
 await page.getByRole('radio', { name: /Sandbox/ }).click();
 await page.getByLabel('Bank cuts the credit line', { exact: true }).check(); await page.getByRole('combobox', { name: 'Bank cuts the credit line: year' }).selectOption('3');
 await page.screenshot({ path: 'artifacts/ceo-sandbox-setup.png', fullPage: true });
 await page.getByRole('button', { name: /Read the briefing/ }).click(); await page.getByText(/bank cuts the credit line in year 3/i).waitFor();
 await page.getByRole('button', { name: /Take the chair/ }).click();
 for (let year = 1; year <= 5; year++) { await page.getByRole('button', { name: `Play year ${year}` }).click(); if (year === 3) await page.getByText('Your bank demands 20% of your debt back').first().waitFor(); await page.getByRole('button', { name: year < 5 ? `Decide year ${year + 1}` : 'Open the debrief' }).click(); }
 await page.getByRole('heading', { name: /1,000 sampled card strategies/ }).waitFor({ timeout: 30000 });
 assert.deepEqual(errors, []); console.log('CEO browser flow passed. Screenshots in artifacts/.');
} finally { await browser.close() }
