import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {DataQualityError,fiscalYearOf,secToDataset,type SecCompanyFacts} from '../src/data/sec';
import {classify,sectorFromSic} from '../src/translation/classify';
import {constructMachine,getNode} from '../src/translation/construct';
import {demoScenarios} from '../src/simulation/demos';
import {explainExperiment,isLeverRef,rootPath} from '../src/simulation/explain';
import type {CompanyDataset} from '../src/ontology/types';
const fixture=()=>JSON.parse(readFileSync('tests/fixtures/sec/AAPL.json','utf8'));
const build=(f=fixture())=>secToDataset('AAPL',f.facts,f.submission,f.retrieved);
const published=()=>JSON.parse(readFileSync('public/machines/AAPL.json','utf8')) as CompanyDataset;

test('the translation is deterministic, and the published AAPL file comes from it (or from a newer weekly refresh)',()=>{
 const d=build();assert.deepEqual(d,build());const p=published();
 assert.equal(p.provider,d.provider);assert.equal(p.classification?.sector,d.classification?.sector);
 if(p.retrieved===d.retrieved)assert.deepEqual(p,d);else assert.ok(p.retrieved>d.retrieved,'a published file is never older than the fixture');
});
test('SEC translation agrees with Apple’s own published statements',()=>{
 // Independent source: figures typed in from Apple's FY2025 earnings release (public/data/AAPL.json).
 const curated=JSON.parse(readFileSync('public/data/AAPL.json','utf8')).statements as {period:string;facts:Record<string,{value:number|null}>}[];
 const d=build();let compared=0;
 for(const s of curated){const p=d.periods.find(p=>p.period===s.period);assert.ok(p,`missing ${s.period}`);
  for(const k of ['revenue','cogs','grossProfit','operatingProfit','operatingCashFlow','capex','cash','equity','rd','dividends','tax']){assert.equal(p.facts[k]?.value,s.facts[k].value,`${s.period} ${k}`);compared++;}}
 assert.equal(compared,22);
});
test('every automatic figure links to its SEC filing and names the XBRL tag',()=>{
 for(const p of build().periods)for(const f of Object.values(p.facts)){assert.match(f.url!,/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/320193\//);assert.match(f.source,/us-gaap:\w+ · 10-K/);}
});
test('classification: SEC industry codes route banks and retailers; everything else is general and unverified',()=>{
 assert.equal(sectorFromSic(6021),'banking');assert.equal(sectorFromSic(5331),'retail');assert.equal(sectorFromSic(3571),'general');assert.equal(sectorFromSic(7372),'general');
 const c=build().classification!;assert.equal(c.sector,'general');assert.equal(c.verified,false);assert.equal(c.sic,'3571');
 assert.equal(classify('MSFT',{classification:c}).verified,true,'a verified mapping always wins');
 assert.throws(()=>classify('NVDA'),/not published yet/);
});
test('fiscal years follow the period end, with early-January 52/53-week year ends assigned to the prior year',()=>{
 assert.equal(fiscalYearOf('2025-09-27'),2025);assert.equal(fiscalYearOf('2025-01-31'),2025);assert.equal(fiscalYearOf('2025-01-03'),2024);
});
test('quality gates refuse to publish broken or incomplete translations',()=>{
 const tamper=(fn:(f:SecCompanyFacts)=>void)=>{const f=fixture();fn(f.facts);return ()=>secToDataset('AAPL',f.facts,f.submission,f.retrieved)};
 const gross=tamper(f=>{for(const row of f.facts['us-gaap']!.GrossProfit.units!.USD)row.val*=1.1});
 assert.throws(gross,(e:unknown)=>e instanceof DataQualityError&&e.reasons.some(r=>/gross profit/.test(r)));
 const capex=tamper(f=>{delete f.facts['us-gaap']!.PaymentsToAcquirePropertyPlantAndEquipment});
 assert.throws(capex,(e:unknown)=>e instanceof DataQualityError&&e.reasons.some(r=>/lacks capex/.test(r)));
 const none=tamper(f=>{f.facts['us-gaap']={}});
 assert.throws(none,/no annual 10-K facts/);
});
test('missing SEC fields stay UNKNOWN instead of being filled in',()=>{
 const m=constructMachine(build());for(const id of ['customers','arr','churn','demand'])assert.equal(getNode(m,id)?.value??null,null);
 assert.equal(getNode(m,'revenueGrowth')!.status,'CALCULATED');
});
test('AAPL runs the same end-to-end demonstration: every change reconciles and traces to the lever',()=>{
 const m=constructMachine(published()),{demo,base,lever}=demoScenarios(m),x=explainExperiment(m,base,lever);
 assert.equal(demo.lever,'capexRatio');assert.match(demo.question,/Apple Inc\./);assert.equal(x.levers.length,1);assert.ok(x.changes.length>10);
 for(const c of x.changes){assert.ok(Math.abs(c.contributions.reduce((s,p)=>s+p.effect,0)+c.interaction-c.delta)<=1e-6*Math.max(1,Math.abs(c.delta)));const last=rootPath(x,c).at(-1)!;assert.ok('ref' in last&&isLeverRef(last.ref));}
});
test('banks that report CECL-era credit-loss tags still get a provision figure',()=>{
 const f=(val:number,instant=false)=>({units:{USD:[{val,end:'2025-12-31',...(instant?{}:{start:'2025-01-01'}),filed:'2026-02-20',form:'10-K',accn:'0000000001-26-000001'}]}});
 const facts:SecCompanyFacts={cik:1,entityName:'Test Bank',facts:{'us-gaap':{InterestIncomeExpenseNet:f(60e9),NoninterestIncome:f(40e9),NoninterestExpense:f(65e9),FinancingReceivableExcludingAccruedInterestCreditLossExpenseReversal:f(5.6e9),NetIncomeLoss:f(22e9),IncomeTaxExpenseBenefit:f(7e9),Deposits:f(2e12,true),LoansAndLeasesReceivableNetReportedAmount:f(1e12,true),StockholdersEquity:f(3e11,true)}}};
 const d=secToDataset('TB',facts,{cik:'1',name:'Test Bank',sic:'6021',sicDescription:'National Commercial Banks'},'2026-09-27');
 assert.equal(d.classification!.sector,'banking');assert.equal(d.periods[0].facts.provision.value,5.6e9);assert.match(d.periods[0].facts.provision.source,/CreditLossExpenseReversal/);
 assert.equal(d.periods[0].facts.revenue.status,'CALCULATED','revenue is derived as NII + noninterest income when not tagged');
});
