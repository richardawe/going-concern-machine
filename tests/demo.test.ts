import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {constructMachine,getNode} from '../src/translation/construct';
import {HORIZON,simulateCompany,suggestedScenario} from '../src/simulation/company';
import {equationsFor,refKind,refNode} from '../src/simulation/equations';
import {demoScenarios,demonstrations} from '../src/simulation/demos';
import {explainExperiment,isLeverRef,rootPath} from '../src/simulation/explain';
import {sectors} from '../src/sectors';
import type {CompanyDataset} from '../src/ontology/types';
const data=(ticker:string)=>JSON.parse(readFileSync(`public/machines/${ticker}.json`,'utf8')) as CompanyDataset;
const tickers=Object.keys(demonstrations);
const close=(a:number,b:number)=>Math.abs(a-b)<=1e-6*Math.max(1,Math.abs(a),Math.abs(b));

test('the causal graph is generated from the equations the simulator evaluates',()=>{
 for(const t of tickers){const m=constructMachine(data(t)),eqs=equationsFor(m);
  for(const e of m.edges.filter(e=>e.kind!=='concept'))assert.ok(eqs.some(q=>q.target===e.to&&q.inputs.some(r=>refNode(r)===e.from)),`${t}: edge ${e.id} has no equation`);
  for(const q of eqs)for(const r of q.inputs){const from=refNode(r);if(from&&refKind(r)!=='opening')assert.ok(m.edges.some(e=>e.from===from&&e.to===q.target),`${t}: input ${r} of ${q.target} is not drawn`);if(refKind(r)==='assume')assert.ok(sectors[m.classification.sector].controls.some(c=>`assume:${c.id}`===r),`${t}: ${r} is not a control`);}
  // Every computed node is evaluated after its same-year inputs.
  eqs.forEach((q,i)=>q.inputs.filter(r=>refKind(r)==='now').forEach(r=>assert.ok(eqs.findIndex(p=>p.target===r)<i,`${t}: ${q.target} reads ${r} before it is computed`)));
 }
});
test('each demonstration changes exactly one lever and leaves reported data untouched',()=>{
 for(const t of tickers){const d=data(t),before=JSON.stringify(d),m=constructMachine(d),{demo,base,lever}=demoScenarios(m),x=explainExperiment(m,base,lever);
  assert.equal(x.levers.length,1);assert.equal(x.levers[0].ref,`assume:${demo.lever}`);assert.deepEqual(x.base[0],m);assert.deepEqual(x.scen[0],m);assert.equal(JSON.stringify(d),before);
  assert.equal(x.base.length,HORIZON+1);assert.ok(x.changes.some(c=>c.year===HORIZON),`${t}: lever has no year-${HORIZON} effect`);
 }
});
test('every resulting change is explained: input effects reconcile to the delta and trace back to the lever',()=>{
 for(const t of tickers){const m=constructMachine(data(t)),{base,lever}=demoScenarios(m),x=explainExperiment(m,base,lever);assert.ok(x.changes.length>10);
  for(let y=1;y<=HORIZON;y++)for(const n of x.scen[y].nodes){const b=getNode(x.base[y],n.id)?.value;if(n.value==null||b==null||close(n.value,b))continue;assert.ok(x.changes.some(c=>c.node===n.id&&c.year===y),`${t} Y${y}: ${n.id} changed without an explanation`);}
  for(const c of x.changes){assert.ok(c.contributions.length,`${t} ${c.node} Y${c.year} has no attributed input`);assert.ok(close(c.contributions.reduce((s,p)=>s+p.effect,0)+c.interaction,c.delta),`${t} ${c.node} Y${c.year} does not reconcile`);
   const path=rootPath(x,c),last=path.at(-1)!;assert.ok('ref' in last&&isLeverRef(last.ref),`${t} ${c.node} Y${c.year} does not reach the lever`);}
 }
});
test('propagation follows causal order and reaches sector machinery',()=>{
 const expect:Record<string,string[]>={MSFT:['capex','freeCashFlow','cash'],WMT:['inventory','inventoryInvestment','operatingCashFlow','cash'],JPM:['provision','netIncome','equity']};
 for(const t of tickers){const m=constructMachine(data(t)),{base,lever}=demoScenarios(m),x=explainExperiment(m,base,lever),y1=x.changes.filter(c=>c.year===1);
  assert.deepEqual(y1.map(c=>c.order),[...y1.map(c=>c.order)].sort((a,b)=>a-b));for(const id of expect[t])assert.ok(y1.some(c=>c.node===id),`${t}: ${id} did not move in year 1`);}
 const bank=explainExperiment(constructMachine(data('JPM')),demoScenarios(constructMachine(data('JPM'))).base,demoScenarios(constructMachine(data('JPM'))).lever);
 assert.ok(!bank.changes.some(c=>c.node==='freeCashFlow'||c.node==='cet1'),'bank demo must not invent FCF or future CET1');
});
test('an unchanged but reachable node says why (MSFT: no revenue benefit without an adopted investment response)',()=>{
 const m=constructMachine(data('MSFT')),{base,lever}=demoScenarios(m),x=explainExperiment(m,base,lever);
 assert.ok(!x.changes.some(c=>c.node==='revenue'));const lift=x.absorbed.find(a=>a.node==='investmentLift');assert.ok(lift&&lift.year===1+Math.round(base.values.investmentLag));assert.match(lift.reason,/Investment response is 0/);
 const withResponse=structuredClone({base,lever});withResponse.base.values.investmentResponse=withResponse.lever.values.investmentResponse=25;
 const y=explainExperiment(m,withResponse.base,withResponse.lever),rev=y.changes.filter(c=>c.node==='revenue');assert.ok(rev.length&&rev[0].year===1+Math.round(base.values.investmentLag),'revenue moves only after the investment lag');
});
test('suggested assumptions are calibrated only from reported ratios and say so',()=>{
 const m=constructMachine(data('MSFT')),s=suggestedScenario(m);assert.equal(s.values.capexRatio,+(64551/281724*100).toFixed(1));assert.equal(s.values.distribution,+(24082/(136162-64551)*100).toFixed(1));assert.equal(s.values.growth,sectors['software-cloud'].controls.find(c=>c.id==='growth')!.defaultValue);
 const bank=constructMachine(data('JPM')),b=suggestedScenario(bank);assert.equal(b.values.creditCost,+(10678/1347988*100).toFixed(2));
 assert.deepEqual(simulateCompany(m,s),[m],'unadopted suggestions do not forecast');
});
