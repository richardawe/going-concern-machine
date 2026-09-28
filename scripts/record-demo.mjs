// Records the canonical 60–90 second demonstration from the built app (dist/) and encodes it to MP4.
// Everything on screen is the real app driving the real model; the script only adds captions, a visible
// cursor and a spotlight that follows the propagation order the explainer reports.
//   npm run build && FFMPEG=/path/to/ffmpeg node scripts/record-demo.mjs [--theme dark|light] [--out artifacts/demo]
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const theme = arg('theme', 'dark'), out = path.resolve(arg('out', 'artifacts/demo')), frames = path.join(out, 'frames');
// The page is laid out at 2232×1256 CSS px and the screencast scales it to 1920×1080, so the whole machine fits.
const ffmpeg = process.env.FFMPEG || 'ffmpeg', W = 1920, H = 1080, VW = 2232, VH = 1256;
await rm(frames, { recursive: true, force: true }); await mkdir(frames, { recursive: true });

const types = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.html': 'text/html', '.woff2': 'font/woff2' };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: VW, height: VH }, colorScheme: theme === 'dark' ? 'dark' : 'light' });
await page.route('http://gcm.test/**', async route => {
 const part = new URL(route.request().url()).pathname.replace(/^\/going-concern-machine\//, '').replace(/^\//, '');
 const file = path.resolve('dist', part || 'index.html');
 try { await route.fulfill({ body: await readFile(file), contentType: types[path.extname(file)] || 'application/octet-stream' }); } catch { await route.fulfill({ status: 404 }); }
});
// Web fonts go through curl so they load behind proxies the browser cannot use.
await page.route(/fonts\.(googleapis|gstatic)\.com/, async route => {
 try { const body = execFileSync('curl', ['-sf', '-A', 'Mozilla/5.0 Chrome/120', route.request().url()]); await route.fulfill({ body, contentType: route.request().url().includes('css') ? 'text/css' : 'font/woff2', headers: { 'access-control-allow-origin': '*' } }); } catch { await route.abort(); }
});

const errors = []; page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.text().startsWith('REC-ODD')) errors.push(m.text()); });
await page.goto('http://gcm.test/going-concern-machine/');
await page.locator('.company-svg').waitFor();
await page.evaluate(() => document.fonts.ready);

// ---------- Overlay: captions, cursor, spotlight, propagation chain ----------
await page.evaluate(() => {
 const css = document.createElement('style');
 css.textContent = `
 #rec-cap{position:fixed;left:0;top:0;width:1334px;height:137px;z-index:2147483600;display:flex;flex-direction:column;justify-content:center;padding:0 51px;
  background:linear-gradient(90deg,rgba(8,12,18,.97) 0%,rgba(8,12,18,.93) 80%,rgba(8,12,18,0));color:#f4f6f8;font-family:Archivo,'DM Sans',Arial,sans-serif;
  transition:opacity .35s cubic-bezier(.23,1,.32,1)}
 #rec-cap .k{font:600 17px 'IBM Plex Mono',monospace;letter-spacing:2px;color:#7fa7ff;margin-bottom:7px}
 #rec-cap .t{font-weight:600;font-size:39px;letter-spacing:-.5px;line-height:1.1}
 #rec-cap .s{font-size:22px;color:#b8c2cf;margin-top:7px}
 #rec-cur{position:fixed;left:0;top:0;width:35px;height:35px;z-index:2147483647;pointer-events:none;transform:translate(-116px,-116px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))}
 .rec-ripple{position:fixed;width:53px;height:53px;margin:-27px 0 0 -27px;border-radius:50%;border:3px solid #4f86ff;z-index:2147483646;pointer-events:none;animation:rec-rip .5s cubic-bezier(.23,1,.32,1) forwards}
 @keyframes rec-rip{from{transform:scale(.3);opacity:1}to{transform:scale(1.4);opacity:0}}
 #rec-spot{position:fixed;z-index:2147483500;pointer-events:none;border-radius:50%;border:5px solid #ffb020;box-shadow:0 0 0 4640px rgba(5,8,12,.38),0 0 42px 9px rgba(255,176,32,.75);
  opacity:0;transition:left .55s cubic-bezier(.77,0,.175,1),top .55s cubic-bezier(.77,0,.175,1),width .55s cubic-bezier(.77,0,.175,1),height .55s cubic-bezier(.77,0,.175,1),opacity .3s}
 #rec-tag{position:fixed;z-index:2147483501;pointer-events:none;background:#ffb020;color:#141414;font:700 23px 'IBM Plex Mono',monospace;padding:7px 14px;border-radius:5px;opacity:0;
  transition:opacity .25s;white-space:nowrap}
 #rec-chain{position:fixed;left:0;right:0;bottom:90px;z-index:2147483550;display:flex;justify-content:center;gap:12px;opacity:0;transition:opacity .35s;pointer-events:none}
 #rec-chain span{font:600 20px 'IBM Plex Mono',monospace;padding:10px 16px;border-radius:7px;background:rgba(8,12,18,.88);color:#6d7886;border:1px solid #2a3340;transition:all .35s cubic-bezier(.23,1,.32,1)}
 #rec-chain span.on{color:#141414;background:#ffb020;border-color:#ffb020}
 #rec-chain span.done{color:#f4f6f8;border-color:#4f86ff}
 #rec-card{position:fixed;inset:0;pointer-events:none;z-index:2147483640;background:#070a0f;color:#f4f6f8;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;
  font-family:Archivo,'DM Sans',Arial,sans-serif;transition:opacity .6s cubic-bezier(.23,1,.32,1)}
 #rec-card .k{font:600 21px 'IBM Plex Mono',monospace;letter-spacing:5px;color:#7fa7ff}
 #rec-card h1{font-size:107px;margin:21px 0 12px;letter-spacing:-2px;font-weight:600}
 #rec-card p{font-size:32px;color:#b8c2cf;margin:7px 0;max-width:1508px}
 #rec-card .u{font:500 28px 'IBM Plex Mono',monospace;color:#ffb020;margin-top:39px}`;
 document.head.append(css);
 const el = (id, tag = 'div') => { const e = document.createElement(tag); e.id = id; document.documentElement.append(e); return e; };
 el('rec-cap').style.opacity = '0'; el('rec-spot'); el('rec-tag'); el('rec-chain');
 const cur = el('rec-cur');
 cur.innerHTML = '<svg viewBox="0 0 24 24" width="30" height="30"><path d="M3 2l7 19 2.6-7.6L20 11z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  addEventListener('mousemove', e => { cur.style.transform = `translate(${e.clientX - 3}px,${e.clientY - 2}px)`; }, true);
 new MutationObserver(() => { const v = document.querySelector('.company-svg .momentum-value')?.textContent || ''; if (/tn$|\d{4,}\.\dbn/.test(v)) console.log('REC-ODD hub ' + v); }).observe(document.body, { subtree: true, characterData: true, childList: true });
 addEventListener('mousedown', e => { const r = document.createElement('div'); r.className = 'rec-ripple'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; document.documentElement.append(r); setTimeout(() => r.remove(), 600); }, true);
});

const hud = {
 caption: (k, t, s = '') => page.evaluate(([k, t, s]) => { const c = document.getElementById('rec-cap'); c.innerHTML = `<div class="k">${k}</div><div class="t">${t}</div>${s ? `<div class="s">${s}</div>` : ''}`; c.style.opacity = '1'; }, [k, t, s]),
 hideCaption: () => page.evaluate(() => { document.getElementById('rec-cap').style.opacity = '0'; }),
 card: (html) => page.evaluate(h => { let c = document.getElementById('rec-card'); if (!c) { c = document.createElement('div'); c.id = 'rec-card'; document.documentElement.append(c); } c.innerHTML = h; c.style.opacity = '1'; }, html),
 hideCard: () => page.evaluate(() => { const c = document.getElementById('rec-card'); if (c) c.style.opacity = '0'; }),
 chain: (steps, on) => page.evaluate(([steps, on]) => { const c = document.getElementById('rec-chain'); c.innerHTML = steps.map((s, i) => `<span class="${i === on ? 'on' : i < on ? 'done' : ''}">${s}</span>`).join('<span style="border:0;background:none;padding:9px 0;color:#6d7886">→</span>'); c.style.opacity = steps.length ? '1' : '0'; }, [steps, on]),
 // Spotlight a machine part by selector (screen rect is scaled by the page zoom).
 // Spotlight a machine part: the ring travels first, then its tag appears beside it.
 spot: (selector, tag, pad = 18) => page.evaluate(([sel, tag, pad]) => {
  const s = document.getElementById('rec-spot'), t = document.getElementById('rec-tag');
  clearTimeout(window.__recTag); t.style.opacity = '0';
  if (!sel) { s.style.opacity = '0'; return; }
  const part = document.querySelector(sel), r = (part.querySelector('circle,path') || part).getBoundingClientRect(), d = Math.max(r.width, r.height) + pad * 2, cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  Object.assign(s.style, { left: `${cx - d / 2}px`, top: `${cy - d / 2}px`, width: `${d}px`, height: `${d}px`, opacity: '1' });
  if (tag) window.__recTag = setTimeout(() => { t.textContent = tag; Object.assign(t.style, { left: `${cx + d / 2 - 12}px`, top: `${cy - d / 2 - 14}px`, opacity: '1' }); }, 480);
 }, [selector, tag, pad]),
};
const wait = ms => page.waitForTimeout(ms);
const T0 = Date.now(), mark = l => process.env.REC_TIMING && console.log(((Date.now() - T0) / 1000).toFixed(1).padStart(6), l);
let mouse = { x: VW / 2, y: VH / 2 };
// Time-based easing, so a move lasts `ms` however slow each protocol round trip is while the screencast runs.
async function moveTo(x, y, ms = 650) { const from = { ...mouse }, t0 = Date.now(); for (;;) { const k = Math.min(1, (Date.now() - t0) / ms), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e); if (k === 1) break; } mouse = { x, y }; }
async function center(loc) { const b = await loc.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }
async function click(loc, ms) { const c = await center(loc); await moveTo(c.x, c.y, ms); await wait(120); await page.mouse.down(); await wait(70); await page.mouse.up(); }
const gear = label => `.company-svg g.sector-gear[aria-label="Inspect ${label}"]`;
const badge = label => page.evaluate(sel => document.querySelector(sel)?.querySelector('.delta-badge text')?.textContent || '', gear(label));
const hubValue = () => page.evaluate(() => document.querySelector('.company-svg .momentum-value')?.textContent || '');

// ---------- Screencast ----------
const cdp = await page.context().newCDPSession(page);
const shots = [];
cdp.on('Page.screencastFrame', async f => { shots.push({ t: f.metadata.timestamp, data: f.data }); try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch {} });
await hud.card(`<div class="k">ECONOMIC SYSTEMS LAB</div><h1>The Going Concern Machine</h1><p>A public company's own filings, rebuilt as a working economic machine.</p><p>Pull one lever. Watch it propagate. Every change explained.</p>`);
await page.mouse.move(mouse.x, mouse.y);
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
await wait(2800);

mark('// 1. Load');
// 1. Load Microsoft
await hud.hideCard();
await hud.caption('1 / LOAD', 'Microsoft, from its 10-K', 'Every figure is taken from SEC EDGAR filings, and each gear is one line of the accounts.');
await wait(500);
const tickerBox = page.locator('#company-ticker');
await click(tickerBox, 800); await tickerBox.fill('');
for (const ch of 'MSFT') { await tickerBox.press(ch === ch.toUpperCase() ? `Shift+${ch}` : ch); await wait(90); }
await click(page.getByRole('button', { name: 'Construct' }), 450);
await page.getByRole('group', { name: 'MSFT Software + cloud infrastructure economic machine' }).waitFor();
await moveTo(1160, 742, 700);
await wait(1400);

mark('// 2. Inspect');
// 2. Inspect: where each number came from, and how it is wired
const inspectPart = async (selector, caption, sub, scrollTo) => {
 await hud.caption('2 / INSPECT', caption, sub);
 await click(page.locator(selector).first(), 550);
 const dialog = page.locator('dialog.inspector[open]'); await dialog.waitFor(); await wait(1200);
 if (scrollTo) { await dialog.evaluate((d, text) => { const h = [...d.querySelectorAll('h3')].find(h => h.textContent.includes(text)); d.querySelector('.inspector-inner')?.scrollTo?.({ top: 0 }); if (h) d.scrollTo({ top: h.offsetTop - 30, behavior: 'smooth' }); }, scrollTo); await wait(1300); }
 else await wait(700);
 await page.keyboard.press('Escape'); await wait(350);
};
await inspectPart(gear('Revenue'), 'Revenue: $281.7bn', 'The value, the 10-K it came from, and the equation that drives it forward.', 'Forecast equation');
await inspectPart('.company-svg g.machine-hit[aria-label="Inspect Intelligent Cloud"]', 'Cloud: a reported segment', 'Shown as reported. It is not projected separately, and the app says so.', 'What feeds');
await inspectPart('.company-svg g.machine-hit[aria-label="Inspect R&D expense"]', 'R&D: $32.5bn', 'It is part of operating costs. The link is drawn but not simulated separately.', 'What does it affect');
await inspectPart(gear('Capital'), 'Capital: the cash the machine keeps', 'Prior cash + free cash flow − distributions. No debt financing is invented.', 'Forecast equation');

mark('// 3. One');
// 3. One meaningful assumption: growth falls sharply
const lever = page.locator('g.lever[aria-label="Demand / sales growth"]');
const from = await lever.getAttribute('aria-valuenow'), target = -10;
await hud.caption('3 / PULL ONE LEVER', `Growth falls sharply: +${(+from).toFixed(0)}% → ${target}% a year`, `The lever on the revenue gear. BASE keeps the neutral +${(+from).toFixed(0)}% assumption, and every other setting stays where it was.`);
{ // Drag the knob along its arc, then settle on the exact value with the keyboard, as a user would.
 const pts = await lever.evaluate((g, target) => {
  const track = g.querySelector('.lever-track'), ctm = g.getScreenCTM(), d = track.getAttribute('d').match(/-?[\d.]+/g).map(Number);
  const [x0, y0, R, , , , , x1, y1] = d, a0 = Math.atan2(y0, x0), a1raw = Math.atan2(y1, x1); let a1 = a1raw; while (a1 < a0) a1 += 2 * Math.PI;
  const min = +g.getAttribute('aria-valuemin'), max = +g.getAttribute('aria-valuemax'), now = +g.getAttribute('aria-valuenow');
  const at = v => { const a = a0 + (a1 - a0) * (v - min) / (max - min), p = new DOMPoint(R * Math.cos(a), R * Math.sin(a)).matrixTransform(ctm); return { x: p.x, y: p.y }; };
  return Array.from({ length: 25 }, (_, i) => at(now + (target - now) * i / 24));
 }, target);
 await moveTo(pts[0].x, pts[0].y, 800); await wait(250); await page.mouse.down();
 for (const p of pts.slice(1)) { await page.mouse.move(p.x, p.y); mouse = p; await wait(45); }
 await page.mouse.up();
 let presses = 0;
 for (; presses < 400; presses++) { const v = +(await lever.getAttribute('aria-valuenow')); if (Math.abs(v - target) < 1e-6) break; await lever.press(v > target ? 'ArrowLeft' : 'ArrowRight'); }
 mark(`lever settled with ${presses} key presses`);
}
await moveTo(1160, 1150, 500);
await page.getByText('Y1 PROPAGATION').waitFor();
await wait(900);

mark('// Walk the');
// Walk the propagation in the order the explainer reports it.
const chain = ['GROWTH', 'REVENUE', 'OPERATING ECONOMICS', 'CASH GENERATION', 'INVESTMENT CAPACITY', 'FUTURE CAPACITY', 'MACHINE STATE'];
const walk = [
 [0, 'g.lever[aria-label="Demand / sales growth"]', `${target}%/yr`, 'Growth: the one lever that moved', 'Year 1 against BASE, which keeps the reported path. Nothing else was touched.'],
 [1, gear('Revenue'), null, 'Revenue', 'Opening revenue × (1 + growth)^year.'],
 [2, gear('Operating profit'), null, 'Operating economics', 'Gross profit falls with revenue but costs keep their own schedule, so operating profit falls harder.'],
 [3, gear('Operating cash flow'), null, 'Cash generation', 'The change in operating profit × cash conversion reaches operating cash flow.'],
 [4, gear('Capital investment'), null, 'Investment capacity', 'CapEx is a share of revenue, so less revenue means less infrastructure spend.'],
 [5, '.company-svg .ghost-part[aria-label="Inspect Productive capacity"]', 'NOT MEASURED', 'Future productive capacity', 'No filing measures capacity, so it is drawn as a ghost and not simulated.'],
 [6, '.company-svg g.machine-hit[aria-label="Inspect Operating cash flow"]', null, 'Machine state', 'The flywheel speed is operating cash flow compared with FY2025.'],
];
for (const [i, sel, fixed, t, s] of walk) {
 const label = sel.match(/Inspect ([^"]+)"/)?.[1];
 const delta = fixed ?? (label ? (await badge(label)) || (label === 'Operating cash flow' ? await page.evaluate(() => document.querySelector('.company-svg g.machine-hit .delta-badge text')?.textContent || '') : '') : '');
 await hud.chain(chain, i); await hud.caption(`PROPAGATION / YEAR 1 · ${i + 1} OF 7`, t, s);
 await hud.spot(sel, delta || null, sel.includes('lever') ? 30 : 20);
 await wait(i === 0 ? 2000 : 1750);
}
await hud.spot(null); await wait(300);

mark('// 4. RUN');
// 4. RUN: five years, each change explained
await hud.chain(chain, 7);
await hud.caption('4 / RUN', 'Five years, one lever', 'The machine re-runs each year. Every difference is traced back to the lever.');
await click(page.getByRole('button', { name: /^Run 5 years/ }), 700);
await moveTo(1160, 1160, 500);
for (let y = 1; y <= 5; y++) {
 await page.getByText(`CUSTOM · SCENARIO YEAR ${y}`, { exact: true }).waitFor({ timeout: 4000 });
 await hud.caption(`4 / RUN · YEAR ${y} of 5`, `Operating cash flow ${await hubValue()}`, `Revenue ${await badge('Revenue')} · operating profit ${await badge('Operating profit')} · free cash flow ${await badge('Free cash flow')}, all compared with BASE.`);
}
await wait(900);
mark('// Explain one');
// Explain one resulting change down to the lever.
await hud.chain([], 0);
await hud.caption('EXPLAIN', `Free cash flow in year 5: ${await badge('Free cash flow')}`, 'Split into the inputs of its own equation, then traced back to the root cause: the lever.');
await click(page.locator(gear('Free cash flow')), 700);
{ const dialog = page.locator('dialog.inspector[open]'); await dialog.waitFor(); await wait(900);
 await dialog.evaluate(d => { const h = [...d.querySelectorAll('h3')].find(h => h.textContent.includes('Why did this change')); if (h) d.scrollTo({ top: h.offsetTop - 20, behavior: 'smooth' }); }); await wait(3300);
 await page.keyboard.press('Escape'); await wait(300); }

mark('// 5. Reset');
// 5. Reset, load Walmart
await hud.caption('5 / RESET', 'Back to the reported company', 'The scenario is discarded and the reported history is unchanged.');
await click(page.locator('.scenario-banner').getByRole('button', { name: 'Back to reported' }), 700);
await page.getByText('ACTUAL COMPANY', { exact: true }).waitFor(); await wait(700);
await click(page.locator('.company-picker').getByRole('button', { name: /^WMT/ }), 800);
await page.getByRole('group', { name: /^WMT .* economic machine$/ }).waitFor();
await hud.caption('SAME CORE · DIFFERENT MACHINE', 'Walmart: retail and inventory', 'An inventory reservoir takes the place of cloud infrastructure. Cash is tied up in stock before it becomes sales.');
await moveTo(1220, 812, 600); await wait(3300);

mark('// 6. JPMorgan');
// 6. JPMorgan: the money shot
await click(page.locator('.company-picker').getByRole('button', { name: /^JPM/ }), 800);
await page.getByRole('group', { name: /^JPM .* economic machine$/ }).waitFor();
await hud.caption('SAME CORE · RADICALLY DIFFERENT MACHINE', 'JPMorgan: deposits in, credit out', 'Deposits are funding, not revenue. Credit provisions replace CapEx, and CET1 capital replaces the cash tank.');
await moveTo(1220, 812, 600); await wait(4600);
await hud.hideCaption();
await hud.card(`<div class="k">ONE UNIVERSAL CORE · SECTOR MODULES</div><h1>Every company is a machine.</h1><p>402 S&amp;P 500 companies, built from SEC filings. Nothing invented, and every change explained.</p><div class="u">richardawe.github.io/going-concern-machine</div>`);
await wait(3800);
mark("await cdp.send('Page.stopScreencast');");
await cdp.send('Page.stopScreencast');
await browser.close();
if (errors.length) { console.error('Page errors:', errors); process.exit(1); }

// ---------- Encode: frames carry their own timestamps; hold each until the next ----------
const list = [];
for (let i = 0; i < shots.length; i++) {
 const name = `f${String(i).padStart(5, '0')}.jpg`; await writeFile(path.join(frames, name), Buffer.from(shots[i].data, 'base64'));
 const dur = i + 1 < shots.length ? shots[i + 1].t - shots[i].t : 1 / 30; list.push(`file '${name}'`, `duration ${Math.max(1 / 60, dur).toFixed(4)}`);
}
list.push(`file 'f${String(shots.length - 1).padStart(5, '0')}.jpg'`);
await writeFile(path.join(frames, 'list.txt'), list.join('\n'));
const mp4 = path.join(out, `going-concern-machine-demo-${theme}.mp4`);
execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(frames, 'list.txt'), '-vf', `fps=30,scale=${W}:${H}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-movflags', '+faststart', mp4], { stdio: 'inherit' });
console.log(`${shots.length} frames, ${(shots.at(-1).t - shots[0].t).toFixed(1)}s → ${mp4}`);
