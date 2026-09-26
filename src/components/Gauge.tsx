import { useId } from 'react';
export default function Gauge({label,value,level,onClick,detail,negative=false}:{label:string;value:string;level:number|null;onClick:()=>void;detail:string;negative?:boolean}){
 const id=useId().replace(/:/g,'');const angle=Math.max(-115,Math.min(115,(level??.5)*230-115));
 return <button className={`gauge ${negative?'negative':''}`} onClick={onClick} title={detail} aria-label={`Inspect ${label}: ${value}`}>
  <svg viewBox="0 0 110 82" aria-hidden="true"><defs><radialGradient id={id}><stop stopColor="#fff9e9"/><stop offset=".82" stopColor="#eee8d6"/><stop offset="1" stopColor="#b3b19a"/></radialGradient></defs><circle cx="55" cy="43" r="36" fill={`url(#${id})`} stroke="#4b5941" strokeWidth="2.5"/><path d="M25 57A33 33 0 1 1 85 57" fill="none" stroke="#5a7d4d" strokeWidth="3"/><path d="M81 23A33 33 0 0 1 85 57" fill="none" stroke="#ae5741" strokeWidth="3"/>{Array.from({length:11},(_,i)=><path key={i} d="M55 11V17" transform={`rotate(${-115+i*23} 55 43)`} stroke="#59634c"/>)}{level!==null&&<path className="gauge-needle" d="M55 48V17" transform={`rotate(${angle} 55 43)`} stroke="#354331" strokeWidth="2"/>}<circle cx="55" cy="43" r="3.5" fill="#354331"/></svg>
  <strong>{value}</strong><span>{label}</span>
 </button>;
}
