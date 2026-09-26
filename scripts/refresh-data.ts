import {mkdir,writeFile} from 'node:fs/promises';
// Refreshes are review artifacts. Sector-specific disclosures require verification
// before replacing the curated public/machines snapshots used by Pages.
const agent=process.env.SEC_USER_AGENT;
if(!agent||!agent.includes('@'))throw Error('Set SEC_USER_AGENT to the application name and a real contact email in Actions secrets.');
const companies={MSFT:'789019',WMT:'104169',JPM:'19617'};
const tickers=(process.env.TICKERS||'MSFT,WMT,JPM').split(',').map(t=>t.trim().toUpperCase());
if(tickers.some(t=>!(t in companies)))throw Error('Only MSFT, WMT and JPM are supported.');
await mkdir('artifacts/refresh',{recursive:true});
const manifest:{ticker:string;url:string;retrieved:string;status:string}[]=[];
for(const ticker of tickers){
 const cik=companies[ticker as keyof typeof companies];
 const url=`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik.padStart(10,'0')}.json`;
 const response=await fetch(url,{headers:{'User-Agent':agent,Accept:'application/json'},signal:AbortSignal.timeout(60000)});
 if(!response.ok)throw Error(`${ticker}: SEC returned ${response.status}. Published data is unchanged.`);
 const raw=await response.json();
 if(Number(raw.cik)!==Number(cik)||!raw.facts||!raw.entityName)throw Error(`${ticker}: invalid company facts response.`);
 await writeFile(`artifacts/refresh/${ticker}-raw.json`,JSON.stringify(raw,null,2)+'\n');
 manifest.push({ticker,url,retrieved:new Date().toISOString(),status:'RAW — NOT YET VERIFIED OR PUBLISHED'});
 await new Promise(resolve=>setTimeout(resolve,1100));
}
await writeFile('artifacts/refresh/manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log('Source artifacts retrieved. Verify sector mappings and fiscal periods before updating public/machines. No published dataset was changed.');
