const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
// Going Concern Modules end to end on the production build: a student completes Module 1 (8 concepts, 5 decisions with
// reasons, debrief, check), hands in and downloads the PDF; the hand-in appears on the lecturer page open in another tab
// of the same browser, with no server and no GitHub, and the lecturer rebuilds the identical PDF.
const words = (n, w = 'margin') => Array.from({ length: n }, (_, i) => `${w}${i % 7 ? '' : ' cash'}`).join(' ');
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 }, reducedMotion: 'reduce', acceptDownloads: true });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await context.route('https://gcm.test/**', async route => {
    const url = new URL(route.request().url()), part = url.pathname.replace(/^\/going-concern-machine\//, '').replace(/^\//, ''), file = path.resolve('dist', part || 'index.html');
    if (!file.startsWith(path.resolve('dist') + path.sep)) { await route.abort(); return; }
    try { await route.fulfill({ body: await readFile(file), contentType: file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.json') ? 'application/json' : 'text/html' }); }
    catch { await route.fulfill({ status: 404, body: 'Not found' }); }
  });
  await mkdir('artifacts', { recursive: true });
  const shot = async name => { await page.screenshot({ path: `artifacts/course-${name}.png`, fullPage: true }); };

  // Course home: details, then Module 1.
  await page.goto('https://gcm.test/going-concern-machine/#/course');
  await page.getByLabel('Full name').fill('Test Student');
  await page.getByLabel('Student ID').fill('20419377');
  await page.getByLabel('University email').fill('test@student.example.ac.uk');
  assert.equal(await page.locator('.mod:disabled').count(), 5, 'modules 2–6 are listed but not open yet');
  await shot('home');
  await page.locator('.mod').first().click();
  await page.getByRole('heading', { name: 'The Price War' }).waitFor();
  await page.getByText(/fictional company/i).first().waitFor();
  await shot('briefing');
  await page.getByRole('button', { name: /Start concept 1/ }).click();

  // Eight concepts: each needs 40 typed words before moving on. Concept 2 is pasted, and is flagged.
  for (let i = 1; i <= 8; i++) {
    await page.getByText(`Concept ${i} of 8`).waitFor();
    const next = page.getByRole('button', { name: i < 8 ? 'Save and continue →' : 'Save and go to the decisions →' });
    const box = page.getByLabel('In your own words · required');
    await box.fill(words(20)); assert.ok(await next.isDisabled(), 'locked below the minimum');
    if (i === 2) await box.dispatchEvent('paste');
    await box.fill(words(44));
    if (i === 2) await page.getByText('Contains pasted text').waitFor();
    if (i === 3) { await page.locator('svg.iso').focus(); await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(300); await shot('concept'); }
    await next.click();
  }

  // Five decisions, each with a reason.
  for (let year = 1; year <= 5; year++) {
    const play = page.getByRole('button', { name: `Play year ${year} →` });
    await play.waitFor();
    if (year === 1) await page.getByRole('radio', { name: /Match the discounter/ }).click();
    else await page.getByRole('radio', { name: /Hold course/ }).click();
    assert.ok(await play.isDisabled(), 'a reason is required');
    await page.getByLabel('Why this decision? · required').fill(words(28, 'because'));
    if (year === 1) await shot('decision');
    await play.click();
    await page.getByText(`Year ${year} · what happened`).waitFor();
  }
  await shot('year5');
  await page.getByRole('button', { name: 'See the debrief →' }).click();
  await page.locator('.c-grade').first().waitFor({ timeout: 60000 });
  await page.getByText('Three futures').waitFor();
  await page.getByLabel('Reflection · required').fill(words(45, 'reflect'));
  await shot('debrief');
  await page.getByRole('button', { name: 'Go to the end-of-module check →' }).click();

  // The check: three multiple choice, four typed answers of 60+ words.
  await page.getByText('Q1 · Multiple choice').waitFor();
  await page.getByText('23.9%').click(); await page.getByText('+57%').click(); await page.getByText('Gross profit is now below fixed overheads').click();
  await page.getByText('In year 1 you chose: Match the discounter’s prices.').waitFor();
  const typed = page.getByLabel('Your answer', { exact: true });
  assert.equal(await typed.count(), 4);
  for (let i = 0; i < 4; i++) await typed.nth(i).fill(words(62, 'leverage'));
  await page.getByRole('button', { name: 'Check answers' }).click();
  await page.getByText('Multiple choice: 3 of 3 correct.', { exact: false }).waitFor();
  assert.equal(await page.getByText('Model answer', { exact: true }).count(), 4);
  await shot('check');
  await page.getByRole('button', { name: 'Finish module →' }).click();
  await page.getByText('Module 1 complete').waitFor();

  // Hand in: seal, then download the PDF.
  await page.getByRole('button', { name: 'Hand in →' }).click();
  await page.getByRole('heading', { name: 'Hand in your work' }).waitFor();
  // The lecturer page is already open in another tab, with nothing in it yet.
  const outside = []; context.on('request', r => { if (!r.url().startsWith('https://gcm.test/') && !r.url().startsWith('https://fonts.')) outside.push(r.url()); });
  const lecturer = await context.newPage(); lecturer.on('pageerror', e => errors.push(e.message));
  await lecturer.goto('https://gcm.test/going-concern-machine/#/course/lecturer');
  await lecturer.getByText('No hand-ins yet.').waitFor();
  await page.bringToFront();
  await page.getByLabel('I confirm these answers are my own work.').check();
  await page.getByRole('button', { name: 'Hand it in' }).click();
  await page.getByText(/^Handed in/).waitFor();
  const code = (await page.locator('.vcode').textContent()).trim();
  assert.match(code, /^GCM-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  await shot('handin');
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('button', { name: 'Download PDF' }).click()]);
  const pdfPath = 'artifacts/course-student.pdf'; await download.saveAs(pdfPath);
  const pdf = await readFile(pdfPath); assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.equal(download.suggestedFilename(), 'GCM101_20419377_Student.pdf');

  // The hand-in appears in the lecturer's tab without a refresh, with the same code and an identical PDF.
  await lecturer.getByText('Test Student').waitFor();
  assert.ok(await lecturer.getByText(code).count(), 'the lecturer sees the same verification code');
  const [again] = await Promise.all([lecturer.waitForEvent('download', { timeout: 60000 }), lecturer.getByRole('button', { name: 'PDF', exact: true }).click()]);
  await again.saveAs('artifacts/course-lecturer.pdf');
  assert.deepEqual(await readFile('artifacts/course-lecturer.pdf'), pdf, 'the lecturer’s PDF is byte-for-byte the student’s');
  // Handing in again replaces the earlier hand-in rather than adding a second row.
  await page.getByRole('button', { name: 'Hand in again' }).click();
  await lecturer.getByText('handed in 2 times').waitFor();
  assert.equal(await lecturer.locator('.inbox tbody tr').count(), 1);
  await lecturer.screenshot({ path: 'artifacts/course-lecturer.png', fullPage: true });
  assert.deepEqual(outside, [], 'nothing leaves the browser');

  // Phone width: no sideways scroll on the module and hand-in pages, in dark mode.
  await page.setViewportSize({ width: 390, height: 900 }); await page.emulateMedia({ colorScheme: 'dark' });
  for (const route of ['#/course', '#/course/m/price-war', '#/course/submit']) {
    await page.goto(`https://gcm.test/going-concern-machine/${route}`); await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, `${route} fits a phone`);
  }
  await shot('phone-dark');
  assert.deepEqual(errors, []);
  console.log('course browser test passed');
} finally { await browser.close(); }
