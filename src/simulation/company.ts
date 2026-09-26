import { sectors } from '../sectors';
import { getNode } from '../translation/construct';
import { unknown, type CompanyScenario, type MachineDefinition } from '../ontology/types';
import { concepts } from '../ontology/catalog';
export function suggestedScenario(machine:MachineDefinition):CompanyScenario{
 const values=Object.fromEntries(sectors[machine.classification.sector].controls.map(c=>[c.id,c.defaultValue]));
 const n=(k:string)=>getNode(machine,k)?.value;
 if(n('revenue')&&n('capex')!=null)values.capexRatio=Math.max(0,Math.min(40,n('capex')!/n('revenue')!*100));
 if(machine.classification.sector==='retail'&&n('cogs')&&n('inventory')!=null)values.inventoryDays=n('inventory')!/n('cogs')!*365;
 if(machine.classification.sector==='banking'&&n('loans')&&n('provision')!=null){values.creditCost=n('provision')!/n('loans')!*100;const pretax=n('revenue')!-n('opex')!-n('provision')!;if(pretax>0&&n('tax')!=null)values.taxRate=n('tax')!/pretax*100;}
 return {adopted:false,values,shocks:[]};
}
export function validateCompanyScenario(input:unknown,machine:MachineDefinition):input is CompanyScenario{
 const s=input as CompanyScenario;if(!s||typeof s.adopted!=='boolean'||!s.values||!Array.isArray(s.shocks)||s.shocks.length>20)return false;
 if(!sectors[machine.classification.sector].controls.every(c=>Number.isFinite(s.values[c.id])&&s.values[c.id]>=c.min&&s.values[c.id]<=c.max))return false;
 return s.shocks.every(x=>typeof x.id==='string'&&Number.isInteger(x.year)&&x.year>=1&&x.year<=10&&['demand','cost','credit'].includes(x.kind));
}
export function simulateCompany(opening:MachineDefinition,scenario:CompanyScenario,years=10):MachineDefinition[]{
 if(!validateCompanyScenario(scenario,opening))throw new Error('Invalid sector assumptions.');if(!scenario.adopted)return [structuredClone(opening)];
 const a=scenario.values,sector=opening.classification.sector;const init=(k:string)=>{const n=getNode(opening,k)?.value;if(n==null)throw new Error(`Cannot simulate: opening ${concepts[k]?.label||k} is UNKNOWN.`);return n;};
 const required=sector==='banking'?['revenue','nii','fees','loans','deposits','provision','opex','netIncome','equity']:['revenue','cogs','grossProfit','opex','operatingProfit','operatingCashFlow','capex','cash'];required.forEach(init);if(sector==='retail'){init('inventory');}
 const history=[structuredClone(opening)];
 for(let year=1;year<=years;year++){
  const prev=history[year-1];const m=structuredClone(opening);m.year=year;m.period=`${opening.period} + ${year} year${year>1?'s':''}`;
  m.nodes=m.nodes.map(n=>({...n,...unknown(n.unit,m.period,'Not projected by this sector model.')}));
  const set=(id:string,value:number,calculation:string,inputs:string[])=>{if(!Number.isFinite(value))throw new Error('Non-finite model result');let n=m.nodes.find(n=>n.id===id);if(!n){const c=concepts[id];if(!c)throw new Error(`Unknown concept: ${id}`);n={id,...c,...unknown(c.unit,m.period),role:'core'};m.nodes.push(n);}Object.assign(n,{value,period:m.period,status:'CALCULATED',source:'Deterministic sector scenario / explicitly adopted user assumptions',calculation,inputs});};
  const value=(k:string)=>getNode(m,k)?.value??null;const prior=(k:string)=>{const v=getNode(prev,k)?.value;if(v==null)throw new Error(`Missing preceding ${k}`);return v;};
  const shocks=scenario.shocks.filter(s=>s.year<=year);const demand=Math.pow(.8,shocks.filter(s=>s.kind==='demand').length),cost=Math.pow(1.1,shocks.filter(s=>s.kind==='cost').length),credit=Math.pow(2,shocks.filter(s=>s.kind==='credit').length);
  if(sector==='banking'){
   set('loans',init('loans')*Math.pow(1+a.loanGrowth/100,year)*demand,'Opening loans × (1 + loan growth)^year × demand shock',['loans']);
   set('deposits',init('deposits')*Math.pow(1+a.depositGrowth/100,year),'Opening deposits × (1 + deposit growth)^year',['deposits']);
   const avgLoans=(prior('loans')+value('loans')!)/2;
   set('nii',init('nii')*avgLoans/init('loans')*(1+a.niiChange/100),'Opening NII × average scenario loans / opening loans × (1 + NII sensitivity)',['loans','nii']);
   set('fees',init('fees')*Math.pow(1+a.feeGrowth/100,year),'Opening noninterest revenue × (1 + assumed growth)^year',['fees']);
   set('revenue',value('nii')!+value('fees')!,'Net interest income + noninterest revenue',['nii','fees']);
   set('provision',avgLoans*a.creditCost/100*credit,'Average loans × provision rate × credit shock',['loans']);
   set('opex',init('opex')*Math.pow(1+a.opexGrowth/100,year)*cost,'Opening noninterest expense × expense growth × cost shock',['opex']);
   const pretax=value('revenue')!-value('opex')!-value('provision')!;set('tax',Math.max(0,pretax)*a.taxRate/100,'Max(0, pretax income) × adopted tax rate',['revenue','opex','provision']);
   set('netIncome',pretax-value('tax')!,'Revenue − noninterest expense − credit provision − tax',['revenue','opex','provision','tax']);
   set('retainedProfit',value('netIncome')!-Math.max(0,value('netIncome')!)*a.payout/100,'Net income − positive net income × payout rate',['netIncome']);
   set('equity',prior('equity')+value('retainedProfit')!,'Prior book equity + retained profit; no OCI, issuance or regulatory adjustments modeled',['equity','retainedProfit']);
   set('loanDeposit',value('loans')!/value('deposits')!,'Closing loans / closing deposits',['loans','deposits']);
  }else{
   const due=Math.max(1,Math.round(a.investmentLag));let lift=0;
   for(let t=1;t<=year-due;t++){const past=history[t];lift+=Math.max(0,(getNode(past,'capex')?.value||0)-init('capex'))/init('revenue')*a.investmentResponse/100;}
   set('revenue',init('revenue')*Math.pow(1+a.growth/100,year)*demand*(1+lift),'Opening revenue × adopted growth × shock × (1 + delayed additional-investment response)',['revenue','capex']);
   const margin=Math.max(-.5,Math.min(.95,init('grossProfit')/init('revenue')+a.marginChange/100));
   set('cogs',value('revenue')!*(1-margin)*cost,'Revenue × (1 − adopted gross margin) × cost shock',['revenue']);set('grossProfit',value('revenue')!-value('cogs')!,'Revenue − cost to deliver',['revenue','cogs']);
   set('grossMargin',value('grossProfit')!/value('revenue')!,'Gross profit / revenue',['grossProfit','revenue']);
   set('opex',init('opex')*Math.pow(1+a.opexGrowth/100,year),'Opening operating expense × (1 + cost growth)^year',['opex']);set('operatingProfit',value('grossProfit')!-value('opex')!,'Gross profit − operating expense',['grossProfit','opex']);
   set('operatingMargin',value('operatingProfit')!/value('revenue')!,'Operating profit / revenue',['operatingProfit','revenue']);
   let inventoryAdjustment=0;
   if(sector==='retail'){
    set('inventory',value('cogs')!*a.inventoryDays/365,'Cost of sales × target inventory days / 365',['cogs']);
    set('inventoryTurns',value('cogs')!/((prior('inventory')+value('inventory')!)/2),'COGS / mean prior and closing inventory',['cogs','inventory']);
    const initialInv=getNode(opening,'inventoryInvestment')?.value;
    if(initialInv==null)throw new Error('Opening inventory cash investment is UNKNOWN.');
    inventoryAdjustment=initialInv-(value('inventory')!-prior('inventory'));
   }
   set('operatingCashFlow',init('operatingCashFlow')+(value('operatingProfit')!-init('operatingProfit'))*a.cashConversion/100+inventoryAdjustment,'Opening CFO + change in operating profit × adopted conversion; retail adds back opening inventory cash investment and subtracts current inventory increase',['operatingProfit',...(sector==='retail'?['inventory']:[])]);
   set('capex',value('revenue')!*a.capexRatio/100,'Scenario revenue × adopted CapEx ratio',['revenue']);set('freeCashFlow',value('operatingCashFlow')!-value('capex')!,'Operating cash flow − total CapEx',['operatingCashFlow','capex']);
   const distribution=Math.min(Math.max(0,value('freeCashFlow')!),Math.max(0,prior('cash')+value('freeCashFlow')!))*a.distribution/100;
   set('cash',prior('cash')+value('freeCashFlow')!-distribution,'Prior cash + FCF − distributions; no invented debt financing',['cash','freeCashFlow']);set('capital',Math.max(0,value('cash')!),'Max(0, closing cash)',['cash']);set('fundingGap',Math.max(0,-value('cash')!),'Max(0, − closing cash); an unfunded requirement',['cash']);
  }
  set('revenueGrowth',(value('revenue')!-prior('revenue'))/Math.abs(prior('revenue')),'Current / prior modeled revenue − 1',['revenue']);
  // Deliberately narrower than the original full-business composite. Every contribution is exposed.
  const earnings=sector==='banking'?'netIncome':'operatingProfit';const oldProfit=getNode(prev,earnings)?.value;
  if(oldProfit!=null&&Math.abs(oldProfit)>1){const signals=[{label:'Revenue growth',raw:value('revenueGrowth')!/.2,weight:.4,formula:'Revenue growth / 20%, clipped ±1 × 40'},{label:'Profit change',raw:(value(earnings)!-oldProfit)/Math.abs(oldProfit)/.2,weight:.4,formula:'Profit growth / 20%, clipped ±1 × 40'},{label:sector==='banking'?'Funding mix change':'Cash movement',raw:sector==='banking'?(prior('loans')/prior('deposits')-value('loanDeposit')!)/.1:(value('cash')!-prior('cash'))/init('revenue')/.1,weight:.2,formula:sector==='banking'?'Improvement in loans/deposits / 10pp, clipped ±1 × 20':'Cash change / opening revenue / 10%, clipped ±1 × 20'}];
   const parts=signals.map(p=>({label:p.label,contribution:Math.max(-1,Math.min(1,p.raw))*p.weight*100,formula:p.formula}));m.momentum={value:parts.reduce((s,p)=>s+p.contribution,0),parts};set('momentum',m.momentum.value!,'Scenario-only indicator: revenue growth (40%) + profit change (40%) + cash / funding change (20%). Not a complete health score.',['revenueGrowth',earnings,sector==='banking'?'loanDeposit':'cash']);
  }else m.momentum={value:null,parts:[],reason:'Prior profit is zero or unavailable; growth-based momentum is undefined.'};
  m.edges=m.edges.map(e=>({...e,lag:e.lag?Math.round(a.investmentLag||e.lag):0}));history.push(m);
 }
 return history;
}
