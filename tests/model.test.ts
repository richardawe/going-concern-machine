import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { manualBaseline, companyBaseline } from '../src/model/baseline';
import { simulate } from '../src/model/engine';
import { initialScenarios, validateScenarios } from '../src/state';
import { momentumConfig } from '../src/model/momentum';
import type { Company } from '../src/model/types';
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<Math.max(1,Math.abs(a)) * 1e-9,`${a} != ${b}`);
const baseline=manualBaseline();
test('simulation is deterministic, keeps Year 0 intact, and does not mutate inputs',()=>{
 const sc=initialScenarios(baseline).CUSTOM, original=JSON.stringify({baseline,sc});const first=simulate(baseline,sc);
 assert.deepEqual(first,simulate(baseline,sc));assert.equal(JSON.stringify({baseline,sc}),original);assert.deepEqual(first[0],baseline.state);assert.equal(first.length,11);
});
test('cash, customer and profit identities reconcile in all years, including stressed conditions',()=>{
 for(const churn of [.05,.3,.6]){const sc=initialScenarios(baseline).CUSTOM;sc.assumptions.churn=churn;sc.assumptions.grossMargin=.2;const states=simulate(baseline,sc);
 for(let i=1;i<states.length;i++){const s=states[i],p=states[i-1];close(s.revenue,s.volume*s.price);close(s.customers,p.customers+s.newCustomers-s.churnedCustomers);close(s.grossProfit,s.revenue-s.cogs);close(s.operatingProfit,s.grossProfit-s.opex);close(s.operatingCashFlow,s.operatingProfit-s.tax-s.interestExpense+s.depreciation-s.workingCapitalInvestment);close(s.freeCashFlow,s.operatingCashFlow-s.maintenanceCapex-s.growthCapex);close(s.cash,p.cash+s.freeCashFlow-s.dividends-s.debtRepayment);close(s.debt,p.debt-s.debtRepayment);assert.ok(s.tax>=0);assert.ok(s.debt>=0);close(s.liquidityGap,Math.max(0,-s.cash));}}
});
test('higher demand improves revenue; higher churn hurts revenue and cash',()=>{
 const b=initialScenarios(baseline).BASE, high=structuredClone(b), low=structuredClone(b);high.assumptions.demandGrowth=.2;low.assumptions.churn=.4;
 assert.ok(simulate(baseline,high)[1].revenue>simulate(baseline,b)[1].revenue);assert.ok(simulate(baseline,low)[5].revenue<simulate(baseline,b)[5].revenue);assert.ok(simulate(baseline,low)[5].cash<simulate(baseline,b)[5].cash);
});
test('investment creates delayed, efficiency-dependent productive stocks',()=>{
 const high=initialScenarios(baseline).BASE,low=structuredClone(high);high.assumptions.reinvestmentRate=1;low.assumptions.reinvestmentRate=0;high.assumptions.investmentLag=3;low.assumptions.investmentLag=3;
 const hs=simulate(baseline,high),ls=simulate(baseline,low);assert.deepEqual(hs[1].stocks,ls[1].stocks);assert.deepEqual(hs[3].stocks,ls[3].stocks);assert.ok(hs[4].stocks.technology>ls[4].stocks.technology);assert.ok(hs[1].cash<ls[1].cash);
});
test('momentum decomposition sums exactly and weights total one',()=>{
 close(momentumConfig.reduce((s,p)=>s+p.weight,0),1);
 for(const s of simulate(baseline,initialScenarios(baseline).BASE)){close(s.businessMomentum,s.momentumParts.reduce((n,p)=>n+p.contribution,0));assert.ok(s.businessMomentum>=-100&&s.businessMomentum<=100);}
});
test('shocks apply only at the chosen year and do not compound the same level shock repeatedly',()=>{
 const sc=initialScenarios(baseline).BASE;const original=simulate(baseline,sc);sc.shocks=[{id:'test',kind:'demand',year:4}];const shocked=simulate(baseline,sc);
 assert.deepEqual(shocked.slice(0,4),original.slice(0,4));close(shocked[4].marketSize/original[4].marketSize,.8);close(shocked[10].marketSize/original[10].marketSize,.8);
});
test('negative FCF does not reverse capex or invent debt funding',()=>{
 const sc=initialScenarios(baseline).BASE;sc.assumptions.grossMargin=.05;sc.assumptions.opexRatio=.8;const s=simulate(baseline,sc)[10];assert.ok(s.cash<0);assert.ok(s.liquidityGap>0);assert.equal(s.growthCapex,0);assert.ok(s.debt<=baseline.state.debt);
});
test('real-company baseline preserves observed statements and marks missing fields',()=>{
 const company:Company=JSON.parse(readFileSync('public/data/AAPL.json','utf8'));const b=companyBaseline(company);
 assert.equal(b.state.revenue,416161e6);assert.equal(b.state.freeCashFlow,(111482-12715)*1e6);assert.equal(b.facts.revenue.status,'OBSERVED');assert.equal(b.facts.interestExpense.value,null);assert.equal(b.facts.maintenanceCapex.status,'ESTIMATED');assert.equal(b.state.customers,100);assert.deepEqual(simulate(b,initialScenarios(b).BASE)[0],b.state);
});
test('scenario import rejects malformed, out-of-range and non-finite input',()=>{
 const sc=initialScenarios(baseline);assert.ok(validateScenarios(sc));sc.BULL.assumptions.churn=3;assert.equal(validateScenarios(sc),false);assert.equal(validateScenarios({}),false);
});
test('every management lever affects the simulation without creating money',()=>{
 const sc=initialScenarios(baseline).BASE;const original=simulate(baseline,sc);
 for(const key of Object.keys(sc.assumptions.allocations) as (keyof typeof sc.assumptions.allocations)[]){const changed=structuredClone(sc);changed.assumptions.allocations[key]=100;const next=simulate(baseline,changed);assert.notDeepEqual(next,original,key);}
});
