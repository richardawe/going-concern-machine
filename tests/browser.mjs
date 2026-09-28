const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://gcm.test/**',async route=>{const url=new URL(route.request().url());const part=url.pathname.replace(/^\/going-concern-machine\//,'').replace(/^\//,'');const file=path.resolve('dist',part||'index.html');if(!file.startsWith(path.resolve('dist')+path.sep)){await route.abort();return}try{const body=await readFile(file);await route.fulfill({body,contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html'})}catch{await route.fulfill({status:404,body:'Not found'})}});
 await page.goto('http://gcm.test/going-concern-machine/');await page.getByRole('group',{name:'MSFT Software + cloud infrastructure economic machine'}).waitFor();await page.getByRole('button',{name:'Reduce motion',exact:true}).click();
 // Theme switch: pins light/dark on <html>, survives a reload, and System hands control back to the OS.
 await page.getByRole('group',{name:'Colour theme'}).getByRole('button',{name:'Dark',exact:true}).click();
 assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');
 await page.reload();await page.getByRole('group',{name:'MSFT Software + cloud infrastructure economic machine'}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark','theme choice persists');
 await page.screenshot({path:'artifacts/msft-dark.png'});
 await page.getByRole('group',{name:'Colour theme'}).getByRole('button',{name:'System',exact:true}).click();
 assert.equal(await page.evaluate(()=>document.documentElement.hasAttribute('data-theme')),false);
 // Levers on the machine: keyboard pull starts a scenario at once, reports the value, and propagates.
 {const lever=page.locator('g.lever[aria-label="CapEx / revenue"]');assert.match(await lever.getAttribute('aria-valuetext'),/^22\.9%; reported setting 22\.9%/);
  await lever.focus();for(let i=0;i<75;i++)await lever.press('ArrowRight');
  assert.match(await lever.getAttribute('aria-valuetext'),/^30\.4%/);
  await page.locator('.scenario-banner').getByText('lever changed from the reported settings').waitFor();
  await page.getByText('Y1 PROPAGATION').waitFor();await page.getByText('Scenario started').waitFor();
  await lever.press('0');assert.match(await lever.getAttribute('aria-valuetext'),/^22\.9%/,'0 returns to the reported setting');
  await page.locator('.scenario-banner').getByRole('button',{name:'Back to reported'}).click();
  await page.getByText('ACTUAL COMPANY',{exact:true}).waitFor();assert.equal(await page.locator('.scenario-banner:not(.idle)').count(),0);}

 // No cost-of-sales line: the machine runs on total operating costs; a machine that cannot run is inspect-only.
 for(const [t,check] of [['MCD',async()=>{assert.equal(await page.locator('.v2-business-bar').getByText('TOTAL-COST BASIS').count(),1);await page.locator('.company-svg g.sector-gear[aria-label="Inspect Total operating costs"]').waitFor();assert.equal(await page.locator('g.lever[aria-label="Operating cost growth"]').count(),0);assert.equal(await page.locator('g.lever[aria-label="Margin change"]').count(),1);}],
  ['WFC',async()=>{assert.equal(await page.locator('.v2-business-bar').getByText('INSPECT ONLY').count(),1);assert.equal(await page.locator('g.lever').count(),0);assert.ok(await page.getByRole('button',{name:'Run 5 years'}).isDisabled());await page.locator('.scenario-banner').getByText(/can be inspected but not run: opening Loan assets is UNKNOWN/).waitFor();}]]){
  await page.fill('#company-ticker',t);await page.getByRole('button',{name:'Construct'}).click();await page.getByRole('group',{name:new RegExp(`^${t} `)}).waitFor();await check();}
 await page.fill('#company-ticker','MSFT');await page.getByRole('button',{name:'Construct'}).click();await page.getByRole('group',{name:'MSFT Software + cloud infrastructure economic machine'}).waitFor();
 await page.getByRole('button',{name:'Reduce motion',exact:true}).click();
 await mkdir('artifacts',{recursive:true});
 // Canonical demonstration, repeated for each verified business model.
 for(const [ticker,label,lever,changed] of [['MSFT','Software + cloud','CapEx / revenue','Capital investment'],['WMT','Retail','Inventory days','Inventory reservoir'],['JPM','Banking','Credit provision / loans','Credit-loss provision']]){
  await page.getByRole('button',{name:`${ticker} ${label}`,exact:true}).click();await page.getByRole('region',{name:'Canonical demonstration'}).getByText(`GUIDED TOUR / ${ticker}`).waitFor();
  const rail=page.getByRole('region',{name:'Canonical demonstration'});
  assert.equal(await rail.locator('.demo-body').count(),0,'the tour starts collapsed under the machine');await rail.getByRole('tab',{name:/Reported data/}).click();
  assert.ok(await rail.getByRole('link').count()>3,`${ticker}: reported data needs source links`);
  await rail.getByRole('tab',{name:/Causal model/}).click();assert.ok(await rail.locator('.equation-list li').count()>10);
  await rail.getByRole('tab',{name:/Pull one lever/}).click();await rail.getByRole('button',{name:new RegExp(`^Pull lever: ${lever.replace(/[/]/g,'\\/')}`)}).click();
  await page.getByText('Y1 PROPAGATION').waitFor();assert.ok(await rail.locator('.propagation-list li').filter({hasText:changed}).count());
  if(ticker==='MSFT')await page.screenshot({path:'artifacts/msft-propagation.png',fullPage:true});
  await rail.getByRole('tab',{name:/Five years/}).click();await rail.getByRole('button',{name:'Run five years'}).click();await page.getByText('CUSTOM · SCENARIO YEAR 5').waitFor({timeout:15000});
  await rail.getByRole('tab',{name:/Explain every change/}).click();const rows=rail.locator('.ledger details');assert.ok(await rows.count()>3,`${ticker}: year-5 ledger is empty`);await rows.first().locator('summary').click();await rail.locator('.root-path').first().getByText('(lever)').waitFor();
  if(ticker==='MSFT')await page.screenshot({path:'artifacts/msft-explain.png',fullPage:true});
  await page.getByRole('button',{name:`Inspect ${changed}`,exact:true}).first().dispatchEvent('click');const inspector=page.locator('dialog.inspector');await inspector.waitFor();await inspector.getByText(/Why did this change\? · year 5 vs BASE/).waitFor();await inspector.getByText('Forecast equation').waitFor();await page.getByRole('button',{name:'Close inspector'}).click();
  await page.getByRole('button',{name:'Reset',exact:true}).click();
 }
 await page.getByRole('button',{name:'MSFT Software + cloud',exact:true}).click();await page.getByRole('group',{name:'MSFT Software + cloud infrastructure economic machine'}).waitFor();
 await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/msft-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Inspect ARR',exact:true}).count().then(n=>console.log('ARR direct controls',n));
 await page.getByRole('button',{name:'WMT Retail',exact:true}).click();await page.getByRole('group',{name:'WMT Omnichannel retail + memberships economic machine'}).waitFor();await page.screenshot({path:'artifacts/wmt-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'FY2024 2024-01-31',exact:true}).click();assert.ok(await page.getByText('No earlier consecutive annual observation is published.').isVisible());
 await page.getByRole('button',{name:'Fork into a scenario',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Adopt assumptions & fork'}).click();await page.getByText('CUSTOM · SCENARIO YEAR 1').waitFor();
 await page.getByRole('slider',{name:'Forecast year',exact:true}).fill('5');await page.getByText('CUSTOM · SCENARIO YEAR 5').waitFor();
 await page.getByRole('button',{name:'Inspect Revenue',exact:true}).dispatchEvent('click');await page.getByRole('dialog').getByText('CALCULATED',{exact:true}).waitFor();await page.getByRole('button',{name:'Close inspector'}).click();
 await page.getByRole('button',{name:'Reset',exact:true}).click();await page.getByText('ACTUAL COMPANY',{exact:true}).waitFor();
 await page.getByRole('button',{name:'JPM Banking',exact:true}).click();await page.getByRole('group',{name:'JPM Diversified banking + financial services economic machine'}).waitFor();assert.equal(await page.getByRole('button',{name:'Inspect Free cash flow',exact:true}).count(),0);await page.screenshot({path:'artifacts/jpm-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Fork into a scenario',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Adopt assumptions & fork'}).click();await page.getByRole('button',{name:'Credit losses ×2',exact:true}).click();await page.getByText('CUSTOM · SCENARIO YEAR 2').waitFor();
 await page.getByRole('button',{name:'Inspect CET1 ratio',exact:true}).dispatchEvent('click');assert.ok(await page.getByRole('dialog').getByText('UNKNOWN',{exact:true}).count());await page.getByRole('button',{name:'Close inspector'}).click();
 await page.getByRole('button',{name:'Compare machines',exact:true}).click();assert.equal(await page.locator('svg.company-svg').count(),2);await page.getByRole('button',{name:'Compare machines',exact:true}).click();
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Page must not overflow horizontally');
 await page.setViewportSize({width:1440,height:1000});
 // Typed ticker → automatic SEC translation, same end-to-end demonstration
 await page.getByLabel('LOAD A BUSINESS',{exact:true}).fill('AAPL');await page.getByRole('button',{name:'Construct',exact:true}).click();
 await page.getByRole('group',{name:'AAPL General company · Electronic Computers economic machine'}).waitFor();await page.getByText('AUTOMATIC · UNVERIFIED').waitFor();
 {const rail=page.getByRole('region',{name:'Canonical demonstration'});await rail.getByRole('tab',{name:/Reported data/}).click();assert.ok(await rail.getByRole('link').count()>5,'AAPL figures need SEC source links');
  await rail.getByRole('tab',{name:/Pull one lever/}).click();await rail.getByRole('button',{name:/^Pull lever: CapEx \/ revenue/}).click();await page.getByText('Y1 PROPAGATION').waitFor();
  await page.screenshot({path:'artifacts/aapl-desktop.png',fullPage:true});await page.getByRole('button',{name:'Reset',exact:true}).click();}
 await page.setViewportSize({width:390,height:844});
 await page.getByLabel('LOAD A BUSINESS',{exact:true}).fill('ZZZZ');await page.getByRole('button',{name:'Construct',exact:true}).click();await page.getByRole('alert').filter({hasText:'is not published yet'}).waitFor();
 assert.deepEqual(errors,[]);console.log('Browser flow passed. Screenshots in artifacts/.');
}finally{await browser.close()}
