import type { MachineNode, Unit } from './ontology/types';
export function showValue(n:Pick<MachineNode,'value'|'unit'>|undefined):string{
 if(n?.value==null)return 'UNKNOWN';const v=n.value;if(n.unit==='ratio')return `${(v*100).toFixed(1)}%`;if(n.unit==='multiple')return `${v.toFixed(1)}×`;if(n.unit==='index')return v.toFixed(1);if(n.unit==='count')return v.toLocaleString('en-GB');
 const abs=Math.abs(v);const d=abs>=1e12?1e12:abs>=1e9?1e9:abs>=1e6?1e6:abs>=1e3?1e3:1;return `${v<0?'−':''}$${(abs/d).toFixed(1)}${d===1e12?'tn':d===1e9?'bn':d===1e6?'m':d===1e3?'k':''}`;
}
/** Signed change: USD as money, ratios in percentage points, indices in points. */
export function showDelta(delta:number,unit:Unit):string{
 const sign=delta>0?'+':delta<0?'−':'±',abs=Math.abs(delta);
 if(unit==='ratio')return `${sign}${(abs*100).toFixed(abs*100<.1?2:1)}pp`;if(unit==='multiple')return `${sign}${abs.toFixed(2)}×`;if(unit==='index')return `${sign}${abs.toFixed(1)} pts`;if(unit==='count')return `${sign}${abs.toLocaleString('en-GB')}`;
 return sign+showValue({value:abs,unit}).replace(/^\$/,'$');
}
