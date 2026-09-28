import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {DataQualityError,fiscalYearOf,secToDataset,type SecCompanyFacts} from '../src/data/sec';
import {classify,sectorFromSic} from '../src/translation/classify';
import {constructMachine,getNode} from '../src/translation/construct';
import {demoScenarios} from '../src/simulation/demos';
import {simulateCompany,suggestedScenario,whyInspectOnly} from '../src/simulation/company';
import {controlsFor} from '../src/sectors';
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
const synth=(tags:Record<string,number>,instant:string[]=[])=>({cik:9,entityName:'Test Co',facts:{'us-gaap':Object.fromEntries(Object.entries(tags).map(([t,val])=>[t,{units:{USD:[{val,end:'2025-12-31',...(instant.includes(t)?{}:{start:'2025-01-01'}),filed:'2026-02-20',form:'10-K',accn:'0000000009-26-000001'}]}}]))}}) as SecCompanyFacts;
const core={RevenueFromContractWithCustomerExcludingAssessedTax:100e9,CostOfGoodsAndServicesSold:40e9,NetCashProvidedByUsedInOperatingActivities:30e9,PaymentsToAcquirePropertyPlantAndEquipment:8e9,CashAndCashEquivalentsAtCarryingValue:15e9};
const general={cik:'9',name:'Test Co',sic:'2911',sicDescription:'Petroleum Refining'};
test('no operating-income line: operating profit is estimated as revenue − total costs, labelled and never observed',()=>{
 const a=secToDataset('TC',synth({...core,CostsAndExpenses:88e9},['CashAndCashEquivalentsAtCarryingValue']),general,'2026-09-27').periods[0].facts.operatingProfit;
 assert.equal(a.value,12e9);assert.equal(a.status,'ESTIMATED');assert.match(a.calculation!,/Revenue − total costs and expenses/);assert.match(a.calculation!,/may include non-operating items/);
 const b=secToDataset('TC',synth({...core,IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest:25e9},['CashAndCashEquivalentsAtCarryingValue']),general,'2026-09-27').periods[0].facts.operatingProfit;
 assert.equal(b.value,25e9);assert.equal(b.status,'ESTIMATED');assert.match(b.calculation!,/pretax income/);
 const m=constructMachine(secToDataset('TC',synth({...core,CostsAndExpenses:88e9},['CashAndCashEquivalentsAtCarryingValue']),general,'2026-09-27'));
 assert.equal(getNode(m,'operatingProfit')!.status,'ESTIMATED');assert.equal(getNode(m,'opex')!.status,'ESTIMATED','anything derived from an estimate stays an estimate');
 assert.throws(()=>secToDataset('TC',synth({...core,CostsAndExpenses:30e9},['CashAndCashEquivalentsAtCarryingValue']),general,'2026-09-27'),/exceeds gross profit/);
 assert.throws(()=>secToDataset('TC',synth(core,['CashAndCashEquivalentsAtCarryingValue']),general,'2026-09-27'),/lacks operatingProfit/);
});
test('insurers and REITs are refused until they have their own sector modules',()=>{
 const f=synth({...core,OperatingIncomeLoss:20e9},['CashAndCashEquivalentsAtCarryingValue']);
 assert.throws(()=>secToDataset('INS',f,{...general,sic:'6331',sicDescription:'Fire, Marine & Casualty Insurance'},'2026-09-27'),/insurance needs its own sector module/);
 assert.throws(()=>secToDataset('RT',f,{...general,sic:'6798',sicDescription:'Real Estate Investment Trusts'},'2026-09-27'),/real estate investment trusts need their own sector module/);
});
test('R&D takes the full line when a company tags only a component under the generic name',()=>{
 const d=secToDataset('TC',synth({...core,OperatingIncomeLoss:20e9,ResearchAndDevelopmentExpense:.109e9,ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost:14.665e9},['CashAndCashEquivalentsAtCarryingValue']),general,'2026-09-27');
 assert.equal(d.periods[0].facts.rd.value,14.665e9);assert.match(d.periods[0].facts.rd.source,/ExcludingAcquiredInProcessCost/);
});
test('fallback tags recover missing cash, cash flow and CapEx, and say how they differ',()=>{
 const {CashAndCashEquivalentsAtCarryingValue:_c,NetCashProvidedByUsedInOperatingActivities:_o,PaymentsToAcquirePropertyPlantAndEquipment:_p,...rest}=core;
 const d=secToDataset('TC',synth({...rest,OperatingIncomeLoss:20e9,CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents:15e9,NetCashProvidedByUsedInOperatingActivitiesContinuingOperations:30e9,PaymentsToAcquireOtherProductiveAssets:8e9},['CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents']),general,'2026-09-27').periods[0].facts;
 assert.match(d.cash.calculation!,/Includes restricted cash/);assert.match(d.operatingCashFlow.calculation!,/Continuing operations only/);assert.match(d.capex.calculation!,/other productive assets/);
 const std=secToDataset('TC',synth({...core,OperatingIncomeLoss:20e9},['CashAndCashEquivalentsAtCarryingValue']),general,'2026-09-27').periods[0].facts;
 assert.equal(std.cash.calculation,undefined,'standard tags carry no caveat');
});
test('cost of sales excluding D&A is used when it is the only cost line, and the derived gross profit says so',()=>{
 const {CostOfGoodsAndServicesSold:_c,...rest}=core;
 const d=secToDataset('TC',synth({...rest,CostOfGoodsAndServiceExcludingDepreciationDepletionAndAmortization:40e9,OperatingIncomeLoss:20e9},['CashAndCashEquivalentsAtCarryingValue']),general,'2026-09-27');
 assert.equal(d.periods[0].facts.cogs.value,40e9);assert.match(d.periods[0].facts.cogs.calculation!,/excluding depreciation and amortization/);
 const gp=getNode(constructMachine(d),'grossProfit')!;assert.equal(gp.value,60e9);assert.equal(gp.status,'CALCULATED');assert.match(gp.calculation!,/higher than a conventional gross profit/);
});
test('no cost-of-sales line: the machine runs on total operating costs, and gross profit stays UNKNOWN',()=>{
 const {CostOfGoodsAndServicesSold:_c,...rest}=core;
 const m=constructMachine(secToDataset('TC',synth({...rest,OperatingIncomeLoss:20e9},['CashAndCashEquivalentsAtCarryingValue']),general,'2026-09-27'));
 assert.equal(m.costBasis,'total');assert.equal(getNode(m,'grossProfit')?.value??null,null);assert.equal(getNode(m,'grossMargin')?.value??null,null);
 const tc=getNode(m,'totalCosts')!;assert.equal(tc.value,80e9);assert.equal(tc.status,'CALCULATED');assert.match(tc.calculation!,/no cost-of-sales line/);
 assert.ok(m.stages.includes('totalCosts')&&!m.stages.includes('grossProfit'));assert.ok(m.limitations.some(l=>/total operating costs/.test(l)));
 assert.ok(!controlsFor(m).some(c=>c.id==='opexGrowth'),'operating cost growth does not apply');
 assert.equal(whyInspectOnly(m),null,'the machine runs');
 const base={...suggestedScenario(m),adopted:true},h=simulateCompany(m,base);
 assert.ok(Math.abs(getNode(h[5],'operatingMargin')!.value!-.2)<1e-12,'costs keep their reported share of revenue');
 const cut=structuredClone(base);cut.values.growth=-10;const x=explainExperiment(m,base,cut);
 assert.deepEqual(x.changes.filter(c=>c.year===1).slice(0,3).map(c=>c.node),['revenue','totalCosts','operatingProfit']);
 for(const c of x.changes){assert.ok(Math.abs(c.contributions.reduce((s,p)=>s+p.effect,0)+c.interaction-c.delta)<=1e-6*Math.max(1,Math.abs(c.delta)));const last=rootPath(x,c).at(-1)!;assert.ok('ref' in last&&isLeverRef(last.ref));}
 assert.ok(m.edges.some(e=>e.from==='totalCosts'&&e.to==='operatingProfit')&&!m.edges.some(e=>e.to==='grossProfit'),'the causal graph follows the equations that run');
});
test('a machine that cannot run a scenario is identified as inspect-only, with the reason',()=>{
 const f=(val:number,instant=false)=>({units:{USD:[{val,end:'2025-12-31',...(instant?{}:{start:'2025-01-01'}),filed:'2026-02-20',form:'10-K',accn:'0000000001-26-000001'}]}});
 const facts:SecCompanyFacts={cik:1,entityName:'Test Bank',facts:{'us-gaap':{InterestIncomeExpenseNet:f(60e9),NoninterestIncome:f(40e9),NoninterestExpense:f(65e9),ProvisionForCreditLosses:f(5e9),NetIncomeLoss:f(22e9),IncomeTaxExpenseBenefit:f(7e9),Deposits:f(2e12,true),StockholdersEquity:f(3e11,true)}}};
 const m=constructMachine(secToDataset('TB',facts,{cik:'1',name:'Test Bank',sic:'6021',sicDescription:'National Commercial Banks'},'2026-09-27'));
 assert.match(whyInspectOnly(m)!,/Loan assets is UNKNOWN/);
 assert.equal(whyInspectOnly(constructMachine(build())),null);
});
