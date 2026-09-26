import { concepts } from '../ontology/catalog';
import { unknown, type CompanyDataset, type Datum, type MachineDefinition } from '../ontology/types';
import { sectors } from '../sectors';
import { classify } from './classify';

export function validateDataset(input:unknown):asserts input is CompanyDataset {
 const d=input as CompanyDataset;
 if(!d||d.schemaVersion!==2||typeof d.ticker!=='string'||typeof d.name!=='string'||!Array.isArray(d.periods)||!d.periods.length)throw new Error('Invalid published company dataset.');
 classify(d.ticker);
 const dates=new Set<string>();
 for(const p of d.periods){if(!/^\d{4}-\d{2}-\d{2}$/.test(p.period)||dates.has(p.period)||!Number.isInteger(p.fiscalYear)||!p.facts)throw new Error('Invalid or duplicated reporting period.');dates.add(p.period);
 for(const [id,f] of Object.entries(p.facts)){if(!f||!['USD','ratio','count','multiple','index'].includes(f.unit)||!['OBSERVED','CALCULATED','ESTIMATED','USER ASSUMPTION','UNKNOWN'].includes(f.status)||f.period!==p.period||typeof f.source!=='string'||(f.value!==null&&!Number.isFinite(f.value)))throw new Error('Invalid fact unit, value or provenance.');if((f.status==='UNKNOWN'&&f.value!==null)||(concepts[id]&&concepts[id].unit!==f.unit))throw new Error('Invalid fact status or concept unit.');if(f.status==='OBSERVED'&&(f.value===null||!f.url||!/^https:\/\//.test(f.url)))throw new Error('Observed facts require a value and a source URL.');}
 }
}
export function constructMachine(dataset:CompanyDataset,periodIndex=0):MachineDefinition {
 validateDataset(dataset);const classification=classify(dataset.ticker),module=sectors[classification.sector];const selected=dataset.periods[periodIndex];if(!selected)throw new Error('Reporting period unavailable.');
 const {period,fiscalYear}=selected;const facts:Record<string,Datum>=structuredClone(selected.facts);
 const derive=(id:string,inputs:string[],fn:(...n:number[])=>number,calculation:string)=>{const rows=inputs.map(k=>facts[k]);if(rows.some(f=>f?.value==null))return;const value=fn(...rows.map(f=>f.value!));if(!Number.isFinite(value))return;facts[id]={value,unit:concepts[id]?.unit||'USD',status:'CALCULATED',source:rows.map(f=>f.source).filter((v,i,a)=>a.indexOf(v)===i).join('; '),period,inputs,calculation,url:rows.find(r=>r.url)?.url};};
 const prior=dataset.periods.find(p=>p.fiscalYear===fiscalYear-1);
 if(prior?.facts.revenue?.value!=null && facts.revenue?.value!=null && prior.facts.revenue.value!==0)facts.revenueGrowth={value:(facts.revenue.value-prior.facts.revenue.value)/Math.abs(prior.facts.revenue.value),unit:'ratio',status:'CALCULATED',source:dataset.provider,period,calculation:`Revenue ${period} / revenue ${prior.period} − 1`,inputs:['revenue'],url:facts.revenue.url};
 if(classification.sector==='banking'){
  derive('loanDeposit',['loans','deposits'],(l,d)=>l/d,'Period-end loans / period-end deposits');
  derive('pretaxIncome',['revenue','opex','provision'],(r,o,p)=>r-o-p,'Total net revenue − noninterest expense − provision for credit losses');
  if(facts.cet1Capital)facts.capital={...facts.cet1Capital,calculation:'Reported CET1 capital; not spendable cash or book equity'};
 }else{
  if(!facts.grossProfit)derive('grossProfit',['revenue','cogs'],(r,c)=>r-c,'Total revenue − cost of sales');
  derive('grossMargin',['grossProfit','revenue'],(g,r)=>g/r,'Gross profit / total revenue');derive('operatingMargin',['operatingProfit','revenue'],(o,r)=>o/r,'Operating profit / total revenue');
  derive('freeCashFlow',['operatingCashFlow','capex'],(c,i)=>c-i,'Reported operating cash flow − total cash CapEx; working capital already included');
  if(!facts.opex)derive('opex',['grossProfit','operatingProfit'],(g,o)=>g-o,'Gross profit − operating profit');
  if(facts.capex?.value!=null)for(const id of ['capexExcess','investmentLift'])facts[id]={value:0,unit:'ratio',status:'CALCULATED',source:'Definition of the scenario fork',period,calculation:'Zero by definition at the reported opening state: no additional investment has been made yet'};
  if(facts.cash)facts.capital={...facts.cash,calculation:'Cash and cash equivalents; no double counting of retained earnings'};
  if(classification.sector==='retail'&&prior?.facts.inventory?.value!=null&&facts.inventory?.value!=null&&facts.cogs?.value!=null){const avg=(facts.inventory.value+prior.facts.inventory.value)/2;if(avg>0)facts.inventoryTurns={value:facts.cogs.value/avg,unit:'multiple',status:'CALCULATED',source:dataset.provider,period,calculation:`Annual cost of sales / average inventory at ${prior.period} and ${period}`,inputs:['cogs','inventory'],url:facts.inventory.url};}
 }
 const all=[...new Set([...module.stages,...module.moduleNodes,...module.gauges,...module.edges.flatMap(e=>[e.from,e.to]),...Object.keys(facts).filter(k=>k in concepts),'momentum'])];
 const nodes=all.map(id=>{const concept=concepts[id]||{label:id,meaning:'Supporting model input',unit:'USD' as const};return {id,...concept,...(facts[id]||unknown(concept.unit,period)),role:module.moduleNodes.includes(id)?'sector' as const:'core' as const};});
 return {ticker:dataset.ticker,name:dataset.name,period,fiscalYear,classification,nodes,edges:structuredClone(module.edges),gauges:module.gauges,stages:module.stages,moduleNodes:module.moduleNodes,limitations:[...module.limitations,classification.coverage],year:0,momentum:{value:null,parts:[],reason:'Reported financials do not establish customer retention, productive stocks or a complete momentum model. UNKNOWN is not zero.'}};
}
export const getNode=(m:MachineDefinition,key:string)=>m.nodes.find(n=>n.id===key);
