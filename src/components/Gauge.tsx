import { useId } from 'react';
import NumberFlow from '@number-flow/react';
import type { MachineNode } from '../ontology/types';
// Figures roll to their new value so a change is visible, not just a swapped string.
function Figure({n,text}:{n?:Pick<MachineNode,'value'|'unit'>;text:string}){
 if(n?.value==null||(n.unit!=='USD'&&n.unit!=='ratio'))return <>{text}</>;
 if(n.unit==='ratio')return <NumberFlow value={n.value} format={{style:'percent',minimumFractionDigits:1,maximumFractionDigits:1}}/>;
 const a=Math.abs(n.value),[d,s]=a>=1e12?[1e12,'tn']:a>=1e9?[1e9,'bn']:a>=1e6?[1e6,'m']:[1,''];
 return <NumberFlow value={n.value/d} prefix="$" suffix={s} format={{minimumFractionDigits:1,maximumFractionDigits:1}}/>;
}
export default function Gauge({label,value,node,level,onClick,detail,negative=false}:{label:string;value:string;node?:Pick<MachineNode,'value'|'unit'>;level:number|null;onClick:()=>void;detail:string;negative?:boolean}){
 const id=useId().replace(/:/g,'');const angle=Math.max(-115,Math.min(115,(level??.5)*230-115));
 return <button className={`gauge ${negative?'negative':''}`} onClick={onClick} title={detail} aria-label={`Inspect ${label}: ${value}`}>
  <svg viewBox="0 0 110 82" aria-hidden="true"><defs><radialGradient id={id}><stop stopColor="var(--n11)"/><stop offset=".82" stopColor="var(--n9)"/><stop offset="1" stopColor="var(--n7)"/></radialGradient></defs><circle cx="55" cy="43" r="36" fill={`url(#${id})`} stroke="var(--n3)" strokeWidth="2.5"/><path d="M25 57A33 33 0 1 1 85 57" fill="none" stroke="var(--n4)" strokeWidth="3"/><path d="M81 23A33 33 0 0 1 85 57" fill="none" stroke="var(--warn1)" strokeWidth="3"/>{Array.from({length:11},(_,i)=><path key={i} d="M55 11V17" transform={`rotate(${-115+i*23} 55 43)`} stroke="var(--n3)"/>)}{level!==null&&<path className="gauge-needle" d="M55 48V17" transform={`rotate(${angle} 55 43)`} stroke="var(--n2)" strokeWidth="2"/>}<circle cx="55" cy="43" r="3.5" fill="var(--n2)"/></svg>
  <strong><Figure n={node} text={value}/></strong><span>{label}</span>
 </button>;
}
