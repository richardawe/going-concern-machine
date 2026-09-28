import { sectors } from '../sectors';
import { getNode } from '../translation/construct';
import { unknown, type CompanyScenario, type MachineDefinition } from '../ontology/types';
import { concepts } from '../ontology/catalog';
import { equationsFor, momentumParts, refKind, refNode, type Equation, type Ref } from './equations';
export const HORIZON=5;
const round=(v:number,d=1)=>Math.round(v*10**d)/10**d;
// Each suggested value states where it came from: calibrated from a reported ratio, or a neutral placeholder.
export function suggestedBasis(machine:MachineDefinition):Record<string,string>{
 const n=(k:string)=>getNode(machine,k)?.value,fy=`FY${machine.fiscalYear}`,basis:Record<string,string>={};
 if(n('revenue')&&n('capex')!=null)basis.capexRatio=`Calibrated: ${fy} reported CapEx / revenue`;
 if(machine.classification.sector==='retail'&&n('cogs')&&n('inventory')!=null)basis.inventoryDays=`Calibrated: ${fy} inventory / cost of sales × 365`;
 if(n('dividends')!=null&&n('freeCashFlow'))basis.distribution=`Calibrated: ${fy} dividends / free cash flow (buybacks excluded)`;
 if(machine.classification.sector==='banking'&&n('loans')&&n('provision')!=null){basis.creditCost=`Calibrated: ${fy} provision / period-end loans`;if(n('pretaxIncome')&&n('tax')!=null)basis.taxRate=`Calibrated: ${fy} tax / pretax income`;}
 return basis;
}
export function suggestedScenario(machine:MachineDefinition):CompanyScenario{
 const values=Object.fromEntries(sectors[machine.classification.sector].controls.map(c=>[c.id,c.defaultValue]));
 const n=(k:string)=>getNode(machine,k)?.value;const basis=suggestedBasis(machine);
 if(basis.capexRatio)values.capexRatio=round(Math.max(0,Math.min(40,n('capex')!/n('revenue')!*100)));
 if(basis.inventoryDays)values.inventoryDays=Math.round(n('inventory')!/n('cogs')!*365);
 if(basis.distribution)values.distribution=round(Math.max(0,Math.min(100,n('dividends')!/n('freeCashFlow')!*100)));
 if(basis.creditCost)values.creditCost=round(Math.max(-2,Math.min(8,n('provision')!/n('loans')!*100)),2);
 if(basis.taxRate)values.taxRate=round(Math.max(0,Math.min(50,n('tax')!/n('pretaxIncome')!*100)));
 return {adopted:false,values,shocks:[]};
}
export function validateCompanyScenario(input:unknown,machine:MachineDefinition):input is CompanyScenario{
 const s=input as CompanyScenario;if(!s||typeof s.adopted!=='boolean'||!s.values||!Array.isArray(s.shocks)||s.shocks.length>20)return false;
 if(!sectors[machine.classification.sector].controls.every(c=>Number.isFinite(s.values[c.id])&&s.values[c.id]>=c.min&&s.values[c.id]<=c.max))return false;
 return s.shocks.every(x=>typeof x.id==='string'&&Number.isInteger(x.year)&&x.year>=1&&x.year<=10&&['demand','cost','credit'].includes(x.kind));
}
export const shockFactor=(s:CompanyScenario,kind:string,year:number)=>Math.pow(kind==='demand'?.8:kind==='cost'?1.1:2,s.shocks.filter(x=>x.kind===kind&&x.year<=year).length);
export const lagYears=(s:CompanyScenario)=>Math.max(1,Math.round(s.values.investmentLag??2));
/** Resolve every input of an equation for one simulated year. `history[year]` must hold the partially computed year. */
export function resolveInputs(e:Equation,history:MachineDefinition[],year:number,scenario:CompanyScenario):Record<Ref,number>{
 const opening=history[0],x:Record<Ref,number>={};
 for(const ref of e.inputs){const kind=refKind(ref),node=refNode(ref);let v:number|null|undefined;
  if(kind==='assume')v=scenario.values[ref.slice(7)];else if(kind==='shock')v=shockFactor(scenario,ref.slice(6),year);else if(kind==='year')v=year;
  else if(kind==='opening'){v=getNode(opening,node!)?.value;if(v==null)throw new Error(`Cannot simulate: opening ${concepts[node!]?.label||node} is UNKNOWN.`);}
  else if(kind==='prior'){v=getNode(history[year-1],node!)?.value;if(v==null)v=equationsFor(opening).find(q=>q.target===node)?.initial;}
  else if(kind==='lagged'){const t=year-lagYears(scenario);v=t<1?0:getNode(history[t],node!)?.value;}
  else v=getNode(history[year],node!)?.value;
  if(v==null||!Number.isFinite(v))throw new Error(`Cannot compute ${concepts[e.target]?.label||e.target}: input ${ref} is UNKNOWN.`);x[ref]=v;}
 return x;
}
export function simulateCompany(opening:MachineDefinition,scenario:CompanyScenario,years=HORIZON):MachineDefinition[]{
 if(!validateCompanyScenario(scenario,opening))throw new Error('Invalid sector assumptions.');if(!scenario.adopted)return [structuredClone(opening)];
 const bank=opening.classification.sector==='banking';const history=[structuredClone(opening)];
 for(let year=1;year<=years;year++){
  const m=structuredClone(opening);m.year=year;m.period=`${opening.period} + ${year} year${year>1?'s':''}`;
  m.nodes=m.nodes.map(n=>({...n,...unknown(n.unit,m.period,'Not projected by this sector model.')}));history.push(m);
  for(const e of equationsFor(opening)){
   const x=resolveInputs(e,history,year,scenario),value=e.f(x);let n=getNode(m,e.target);
   if(!n){const c=concepts[e.target];if(!c)throw new Error(`Unknown concept: ${e.target}`);n={id:e.target,...c,...unknown(c.unit,m.period),role:'core'};m.nodes.push(n);}
   if(value==null){Object.assign(n,unknown(n.unit,m.period,'Prior profit is zero or unavailable; growth-based momentum is undefined.'));continue;}
   if(!Number.isFinite(value))throw new Error('Non-finite model result');
   Object.assign(n,{value,period:m.period,status:'CALCULATED',source:'Deterministic sector scenario / explicitly adopted user assumptions',calculation:e.formula,inputs:e.inputs,reason:undefined});
   if(e.target==='momentum')m.momentum={value,parts:momentumParts(bank,x)};
  }
  if(getNode(m,'momentum')?.value==null)m.momentum={value:null,parts:[],reason:'Prior profit is zero or unavailable; growth-based momentum is undefined.'};
  m.edges=m.edges.map(e=>e.from==='capexExcess'&&e.to==='investmentLift'?{...e,lag:lagYears(scenario)}:e);
 }
 return history;
}
/** Why a machine cannot run a scenario, or null when it can: the suggested scenario must simulate end to end. */
export function whyInspectOnly(opening:MachineDefinition):string|null{
 try{simulateCompany(opening,{...suggestedScenario(opening),adopted:true},1);return null}catch(e){return e instanceof Error?e.message:String(e)}
}
