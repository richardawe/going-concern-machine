import {useEffect,useState} from 'react';
type Mode='system'|'light'|'dark';
const read=():Mode=>{try{const v=localStorage.getItem('gcm:theme');return v==='light'||v==='dark'?v:'system'}catch{return 'system'}};
// System follows the OS; Light and Dark pin the theme via data-theme on <html> (see theme.css).
export default function ThemeSwitch(){
 const [mode,setMode]=useState<Mode>(read);
 useEffect(()=>{const root=document.documentElement;if(mode==='system')root.removeAttribute('data-theme');else root.setAttribute('data-theme',mode);try{localStorage.setItem('gcm:theme',mode)}catch{}},[mode]);
 return <div className="theme-switch" role="group" aria-label="Colour theme">{(['system','light','dark'] as Mode[]).map(m=><button key={m} aria-pressed={mode===m} onClick={()=>setMode(m)}>{m[0].toUpperCase()+m.slice(1)}</button>)}</div>;
}
