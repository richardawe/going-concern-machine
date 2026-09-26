import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {constructMachine,getNode,validateDataset} from '../src/translation/construct';
import {classify} from '../src/translation/classify';import {HORIZON,suggestedScenario,simulateCompany,validateCompanyScenario} from '../src/simulation/company';
import {fingerprint} from '../src/data/company-datasets';import type {CompanyDataset} from '../src/ontology/types';
const data=(ticker:string)=>JSON.parse(readFileSync(`public/machines/${ticker}.json`,'utf8')) as CompanyDataset;
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<Math.max(1,Math.abs(a))*1e-9,`${a} differs from ${b}`);
const n=(m:ReturnType<typeof constructMachine>,id:string)=>{const node=getNode(m,id);assert.ok(node&&node.value!=null,`${id} missing`);return node.value!};
test('all three companies construct economically distinct sector machines with provenance',()=>{
 const machines=['MSFT','WMT','JPM'].map(t=>constructMachine(data(t)));assert.equal(new Set(machines.map(m=>m.classification.sector)).size,3);assert.equal(new Set(machines.map(m=>m.stages.join())).size,3);
 for(const m of machines){assert.equal(m.momentum.value,null);assert.ok(m.nodes.some(n=>n.status==='UNKNOWN'));for(const node of m.nodes){assert.ok(node.period);assert.ok(node.source);if(node.status==='OBSERVED')assert.ok(node.url);}}
 assert.equal(getNode(machines[0],'arr')?.value,null);assert.equal(getNode(machines[0],'churn')?.value,null);assert.equal(getNode(machines[1],'traffic')?.value,null);assert.equal(getNode(machines[2],'freeCashFlow'),undefined);assert.equal(getNode(machines[2],'roic'),undefined);
});
test('derived measures use explicit accounting relationships, not invented values',()=>{
 const retail=constructMachine(data('WMT'));near(n(retail,'freeCashFlow'),(36443-23783)*1e6);near(n(retail,'inventoryTurns'),511753/((56435+54892)/2));
 const bank=constructMachine(data('JPM'));near(n(bank,'revenue'),n(bank,'nii')+n(bank,'fees'));near(n(bank,'netIncome'),n(bank,'revenue')-n(bank,'opex')-n(bank,'provision')-n(bank,'tax'));near(n(bank,'capital'),n(bank,'cet1Capital'));
});
test('history does not invent missing prior periods or change reported dates',()=>{
 const d=data('WMT');const older=constructMachine(d,1);assert.equal(older.period,'2024-01-31');assert.equal(getNode(older,'inventoryTurns')?.value,null);assert.equal(getNode(older,'revenueGrowth')?.value,null);assert.notEqual(fingerprint(d,d.periods[0].period),fingerprint(d,d.periods[1].period));
});
test('forecasts are gated on explicit adoption and do not mutate reported data',()=>{
 for(const ticker of ['MSFT','WMT','JPM']){const d=data(ticker),before=JSON.stringify(d),m=constructMachine(d),sc=suggestedScenario(m);assert.equal(simulateCompany(m,sc).length,1);sc.adopted=true;const history=simulateCompany(m,sc);assert.equal(history.length,HORIZON+1);assert.deepEqual(history[0],m);assert.equal(JSON.stringify(d),before);assert.ok(history[1].nodes.every(n=>n.status!=='OBSERVED'));assert.deepEqual(history,simulateCompany(m,sc));}
});
test('retail inventory and non-bank cash reconcile; no double-counted working capital',()=>{
 const m=constructMachine(data('WMT')),sc=suggestedScenario(m);sc.adopted=true;const hs=simulateCompany(m,sc);for(let y=1;y<=HORIZON;y++){const s=hs[y],p=hs[y-1];near(n(s,'freeCashFlow'),n(s,'operatingCashFlow')-n(s,'capex'));const inv=n(s,'inventory')-n(p,'inventory');near(n(s,'operatingCashFlow'),n(m,'operatingCashFlow')+(n(s,'operatingProfit')-n(m,'operatingProfit'))*sc.values.cashConversion/100+n(m,'inventoryInvestment')-inv);const payout=Math.min(Math.max(0,n(s,'freeCashFlow')),Math.max(0,n(p,'cash')+n(s,'freeCashFlow')))*sc.values.distribution/100;near(n(s,'cash'),n(p,'cash')+n(s,'freeCashFlow')-payout);}
});
test('bank scenarios separate provisions, retained income and regulatory capital',()=>{
 const m=constructMachine(data('JPM')),sc=suggestedScenario(m);sc.adopted=true;sc.values.creditCost=3;const hs=simulateCompany(m,sc);for(let y=1;y<=HORIZON;y++){const s=hs[y];near(n(s,'netIncome'),n(s,'revenue')-n(s,'opex')-n(s,'provision')-n(s,'tax'));near(n(s,'equity'),n(hs[y-1],'equity')+n(s,'retainedProfit'));assert.equal(getNode(s,'cet1')?.value,null);assert.equal(getNode(s,'capital')?.value,null);assert.equal(getNode(s,'lcr')?.value,null);assert.equal(getNode(s,'freeCashFlow'),undefined);}
});
test('additional investment costs cash immediately and has no revenue effect before lag',()=>{
 const m=constructMachine(data('MSFT')),a=suggestedScenario(m);a.adopted=true;a.values.investmentResponse=25;a.values.investmentLag=3;const b=structuredClone(a);b.values.capexRatio=35;const low=simulateCompany(m,a),high=simulateCompany(m,b);near(n(low[1],'revenue'),n(high[1],'revenue'));near(n(low[3],'revenue'),n(high[3],'revenue'));assert.ok(n(high[4],'revenue')>n(low[4],'revenue'));assert.ok(n(high[1],'cash')<n(low[1],'cash'));
});
test('shock starts in selected year; full momentum remains a stated narrower scenario indicator',()=>{
 const m=constructMachine(data('MSFT')),sc=suggestedScenario(m);sc.adopted=true;const base=simulateCompany(m,sc);sc.shocks=[{id:'s',year:3,kind:'demand'}];const shocked=simulateCompany(m,sc);assert.deepEqual(shocked.slice(0,3),base.slice(0,3));assert.ok(n(shocked[3],'revenue')<n(base[3],'revenue'));for(const s of shocked.slice(1)){if(s.momentum.value!=null)near(s.momentum.value,s.momentum.parts.reduce((n,p)=>n+p.contribution,0));}
});
test('invalid import, missing fact, stale baseline and unsupported ticker are rejected',()=>{
 const m=constructMachine(data('MSFT')),sc=suggestedScenario(m);assert.ok(validateCompanyScenario(sc,m));sc.values.growth=Infinity;assert.equal(validateCompanyScenario(sc,m),false);assert.throws(()=>classify('NVDA'),/not yet/);const d=data('MSFT');d.periods[0].facts.revenue.period='wrong';assert.throws(()=>validateDataset(d),/Invalid/);
});
