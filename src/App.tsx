import {lazy,Suspense,useEffect,useState} from 'react';
import CompanyWorkbench from './components/CompanyWorkbench';
import ManualApp from './ManualApp';
import CeoApp from './ceo/ui/CeoApp';
import {Toaster} from 'sonner';
import {useThemeMode} from './components/ThemeSwitch';
import Landing from './site/Landing';
import SiteNav from './site/SiteNav';
const LiveApp=lazy(()=>import('./live/LiveApp'));const CourseApp=lazy(()=>import('./course/ui/CourseApp'));const Credits=lazy(()=>import('./site/Credits'));
// Routes: / is the home page; #/machine opens the company workbench (#/machine/AAPL loads a ticker, #/machine/build the
// hypothetical business); #/ceo the training game; #/live plays it on a 3D company; #/course the university modules;
// #/credits lists the drawings. Older links to the workbench (#/ followed by nothing) land on the home page.
const useRoute=()=>{const [hash,setHash]=useState(location.hash);useEffect(()=>{const f=()=>{setHash(location.hash);window.scrollTo(0,0)};addEventListener('hashchange',f);return()=>removeEventListener('hashchange',f)},[]);return hash};
export default function App(){
 const route=useRoute();const [mode]=useThemeMode();
 if(route.startsWith('#/course'))return <Suspense fallback={<p className="empty-state">Loading the course…</p>}><CourseApp/></Suspense>;
 if(route.startsWith('#/ceo'))return <CeoApp/>;
 if(route.startsWith('#/live'))return <Suspense fallback={<p className="empty-state">Loading the live company…</p>}><LiveApp/></Suspense>;
 if(route.startsWith('#/credits'))return <Suspense fallback={<p className="empty-state">Loading…</p>}><Credits/></Suspense>;
 if(route.startsWith('#/machine')){
  const arg=decodeURIComponent(route.slice('#/machine'.length).replace(/^\//,'').split(/[/?]/)[0]??'').toUpperCase();
  if(arg==='BUILD')return <><SiteNav current="machine"/><ManualApp onCompany={t=>{location.hash=t?`#/machine/${encodeURIComponent(t)}`:'#/machine'}}/></>;
  return <><SiteNav current="machine"/><CompanyWorkbench initialTicker={/^[A-Z0-9.-]{1,10}$/.test(arg)?arg:'MSFT'} manual={()=>{location.hash='#/machine/build'}}/><Toaster position="bottom-center" theme={mode} toastOptions={{className:'gcm-toast'}}/></>;
 }
 return <Landing/>;
}
