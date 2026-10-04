import {lazy,Suspense,useEffect,useState} from 'react';
import CompanyWorkbench from './components/CompanyWorkbench';
import ManualApp from './ManualApp';
import CeoApp from './ceo/ui/CeoApp';
import {Toaster} from 'sonner';
import {useThemeMode} from './components/ThemeSwitch';
const LiveApp=lazy(()=>import('./live/LiveApp'));
// #/ceo opens CEO mode, the training game; #/live plays it on a 3D company (loaded on demand); anything else is the company workbench.
const useRoute=()=>{const [hash,setHash]=useState(location.hash);useEffect(()=>{const f=()=>{setHash(location.hash);window.scrollTo(0,0)};addEventListener('hashchange',f);return()=>removeEventListener('hashchange',f)},[]);return hash};
export default function App(){const route=useRoute();const [manual,setManual]=useState(false);const [mode]=useThemeMode();const [ticker,setTicker]=useState('MSFT');if(route.startsWith('#/ceo'))return <CeoApp/>;if(route.startsWith('#/live'))return <Suspense fallback={<p className="empty-state">Loading the live company…</p>}><LiveApp/></Suspense>;return manual?<><div className="return-to-companies"><button onClick={()=>setManual(false)}>← Company machines · MSFT / WMT / JPM</button></div><ManualApp onCompany={value=>{setTicker(value);setManual(false)}}/></>:<><CompanyWorkbench initialTicker={ticker} manual={()=>setManual(true)}/><Toaster position="bottom-center" theme={mode} toastOptions={{className:'gcm-toast'}}/></>}
