import {useState} from 'react';
import CompanyWorkbench from './components/CompanyWorkbench';
import ManualApp from './ManualApp';
import {Toaster} from 'sonner';
import {useThemeMode} from './components/ThemeSwitch';
export default function App(){const [manual,setManual]=useState(false);const [mode]=useThemeMode();const [ticker,setTicker]=useState('MSFT');return manual?<><div className="return-to-companies"><button onClick={()=>setManual(false)}>← Company machines · MSFT / WMT / JPM</button></div><ManualApp onCompany={value=>{setTicker(value);setManual(false)}}/></>:<><CompanyWorkbench initialTicker={ticker} manual={()=>setManual(true)}/><Toaster position="bottom-center" theme={mode} toastOptions={{className:'gcm-toast'}}/></>}
