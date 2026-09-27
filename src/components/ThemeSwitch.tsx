import {useEffect,useState} from 'react';
export type Mode='system'|'light'|'dark';
const read=():Mode=>{try{const v=localStorage.getItem('gcm:theme');return v==='light'||v==='dark'?v:'system'}catch{return 'system'}};
const listeners=new Set<(m:Mode)=>void>();let current:Mode=read();
const apply=(m:Mode)=>{if(typeof document!=='undefined'){const root=document.documentElement;if(m==='system')root.removeAttribute('data-theme');else root.setAttribute('data-theme',m)}};
apply(current);
/** The chosen colour mode, shared by the switch and anything else that renders its own theme (the toaster). */
export function useThemeMode():[Mode,(m:Mode)=>void]{
 const [mode,setLocal]=useState<Mode>(current);
 useEffect(()=>{listeners.add(setLocal);return()=>{listeners.delete(setLocal)}},[]);
 return [mode,(m:Mode)=>{current=m;apply(m);try{localStorage.setItem('gcm:theme',m)}catch{}listeners.forEach(l=>l(m))}];
}
// System follows the OS; Light and Dark pin the theme via data-theme on <html> (see theme.css).
export default function ThemeSwitch(){
 const [mode,setMode]=useThemeMode();
 return <div className="theme-switch" role="group" aria-label="Colour theme">{(['system','light','dark'] as Mode[]).map(m=><button key={m} aria-pressed={mode===m} onClick={()=>setMode(m)}>{m[0].toUpperCase()+m.slice(1)}</button>)}</div>;
}
