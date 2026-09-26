const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://gcm.test/**',async route=>{const url=new URL(route.request().url());const part=url.pathname.replace(/^\/going-concern-machine\//,'').replace(/^\//,'');const file=path.resolve('dist',part||'index.html');if(!file.startsWith(path.resolve('dist')+path.sep)){await route.abort();return}try{const body=await readFile(file);await route.fulfill({body,contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html'})}catch{await route.fulfill({status:404,body:'Not found'})}});
 await page.goto('http://gcm.test/going-concern-machine/');await page.getByRole('group',{name:'MSFT Software + cloud infrastructure economic machine'}).waitFor();
 await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/msft-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Inspect ARR',exact:true}).count().then(n=>console.log('ARR direct controls',n));
 await page.getByRole('button',{name:'WMT Retail',exact:true}).click();await page.getByRole('group',{name:'WMT Omnichannel retail + memberships economic machine'}).waitFor();await page.screenshot({path:'artifacts/wmt-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'FY2024 2024-01-31',exact:true}).click();assert.ok(await page.getByText('No earlier consecutive annual observation is published.').isVisible());
 await page.getByRole('button',{name:'Fork into a scenario',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Adopt assumptions & fork'}).click();await page.getByText('CUSTOM · SCENARIO YEAR 1').waitFor();
 await page.getByRole('slider',{name:'Forecast year',exact:true}).fill('5');await page.getByText('CUSTOM · SCENARIO YEAR 5').waitFor();
 await page.getByRole('button',{name:'Inspect Revenue',exact:true}).click();await page.getByRole('dialog').getByText('CALCULATED',{exact:true}).waitFor();await page.getByRole('button',{name:'Close inspector'}).click();
 await page.getByRole('button',{name:'Reset',exact:true}).click();await page.getByText('ACTUAL COMPANY',{exact:true}).waitFor();
 await page.getByRole('button',{name:'JPM Banking',exact:true}).click();await page.getByRole('group',{name:'JPM Diversified banking + financial services economic machine'}).waitFor();assert.equal(await page.getByRole('button',{name:'Inspect Free cash flow',exact:true}).count(),0);await page.screenshot({path:'artifacts/jpm-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Fork into a scenario',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Adopt assumptions & fork'}).click();await page.getByRole('button',{name:'Credit losses ×2',exact:true}).click();await page.getByText('CUSTOM · SCENARIO YEAR 2').waitFor();
 await page.getByRole('button',{name:'Inspect CET1 ratio',exact:true}).click();assert.ok(await page.getByRole('dialog').getByText('UNKNOWN',{exact:true}).count());await page.getByRole('button',{name:'Close inspector'}).click();
 await page.getByRole('button',{name:'Compare machines',exact:true}).click();assert.equal(await page.locator('svg.company-svg').count(),2);await page.getByRole('button',{name:'Compare machines',exact:true}).click();
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Page must not overflow horizontally');
 await page.getByLabel('LOAD A BUSINESS',{exact:true}).fill('NVDA');await page.getByRole('button',{name:'Construct',exact:true}).click();await page.getByRole('alert').filter({hasText:'does not yet have a verified sector translation'}).waitFor();
 assert.deepEqual(errors,[]);console.log('Browser flow passed. Screenshots in artifacts/.');
}finally{await browser.close()}
