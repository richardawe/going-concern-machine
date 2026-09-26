import type { Assumptions, Baseline, ScenarioName, Scenario } from './model/types';
import { allocationKeys } from './model/types';
export const scenarioNames: ScenarioName[] = ['BASE','BULL','BEAR','CUSTOM'];
export function initialScenarios(b: Baseline): Record<ScenarioName, Scenario> { return Object.fromEntries(scenarioNames.map(n=>[n,{assumptions:structuredClone(b.assumptions),shocks:[]}])) as unknown as Record<ScenarioName,Scenario>; }
export const limits: Record<Exclude<keyof Assumptions,'allocations'>, [number,number]> = {
 demandGrowth:[-.2,.25],priceGrowth:[-.2,.25],churn:[0,.6],grossMargin:[.05,.9],opexRatio:[.01,.8],cac:[.01,1e12],interestRate:[0,.3],taxRate:[0,.5],maintenanceRatio:[0,.25],reinvestmentRate:[0,1],productivityGrowth:[-.1,.2],costOfCapital:[0,.3],workingCapitalRatio:[0,.5],depreciationRate:[0,.5],investmentLag:[1,5],investmentEfficiency:[0,1.5],competition:[0,.3],
};
export function validateScenarios(input: unknown): input is Record<ScenarioName,Scenario> {
  if(!input || typeof input!=='object')return false;
  return scenarioNames.every(n=>{
    const sc=(input as Record<string,Scenario>)[n]; if(!sc?.assumptions||!Array.isArray(sc.shocks)||sc.shocks.length>30)return false;
    const a=sc.assumptions;
    if(!Object.entries(limits).every(([k,[lo,hi]])=>Number.isFinite(a[k as keyof typeof limits]) && a[k as keyof typeof limits]>=lo && a[k as keyof typeof limits]<=hi))return false;
    if(!allocationKeys.every(k=>Number.isFinite(a.allocations?.[k])&&a.allocations[k]>=0&&a.allocations[k]<=100))return false;
    return sc.shocks.every(s=>typeof s.id==='string' && ['demand','interest','churn','cogs','cac','recession','regulation','productivity','price'].includes(s.kind)&&Number.isInteger(s.year)&&s.year>=1&&s.year<=10);
  });
}
export function loadScenarios(b:Baseline): Record<ScenarioName, Scenario> {
 try{const data=JSON.parse(localStorage.getItem(`gcm:v1:${b.id}`)||'null');if(data?.version===1&&validateScenarios(data.scenarios))return {...data.scenarios,BASE:initialScenarios(b).BASE};}catch{/* Storage is optional. */}
 return initialScenarios(b);
}
