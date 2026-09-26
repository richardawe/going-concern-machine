import {useState} from 'react';
import CompanyWorkbench from './components/CompanyWorkbench';
import ManualApp from './ManualApp';
export default function App(){const [manual,setManual]=useState(false);const [ticker,setTicker]=useState('MSFT');return manual?<><div className="return-to-companies"><button onClick={()=>setManual(false)}>← Company machines · MSFT / WMT / JPM</button></div><ManualApp onCompany={value=>{setTicker(value);setManual(false)}}/></>:<CompanyWorkbench initialTicker={ticker} manual={()=>setManual(true)}/>}
