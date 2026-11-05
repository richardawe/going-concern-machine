import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './theme.css';
import './styles.css';
class ErrorBoundary extends React.Component<{children:React.ReactNode},{error:boolean}> {
 state={error:false};static getDerivedStateFromError(){return {error:true}}
 render(){return this.state.error?<main className="fatal"><h1>The machine has stopped</h1><p>The saved model could not be rendered. Reset saved scenarios to reload the company machines.</p><button onClick={()=>{for(const key of Object.keys(localStorage))if(key.startsWith('gcm:v1:')||key.startsWith('gcm:v2:')||key.startsWith('gcm:ceo:'))localStorage.removeItem(key);location.reload()}}>Reset saved scenarios</button></main>:this.props.children}
}
// On the platform server, the page is told which kind of host it is on: a university or the platform console get the
// signed-in portal; the public site keeps the company machine (and /sign-in and /legal pages from the portal).
const host=document.querySelector('meta[name="gcm-host"]')?.getAttribute('content')??'';
const portal=host==='tenant'||host==='platform'||host==='missing'||(host==='public'&&(location.pathname==='/sign-in'||location.pathname.startsWith('/legal/')));
const PortalApp=lazy(()=>import('./portal/PortalApp'));
class PortalBoundary extends React.Component<{children:React.ReactNode},{error:boolean}> {
 state={error:false};static getDerivedStateFromError(){return {error:true}}
 render(){return this.state.error?<main className="fatal"><h1>Something went wrong</h1><p>Your saved work is safe. Reload the page to carry on.</p><button onClick={()=>location.reload()}>Reload</button></main>:this.props.children}
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>{portal
 ?<PortalBoundary><Suspense fallback={<p className="empty-state">Loading…</p>}><PortalApp kind={host}/></Suspense></PortalBoundary>
 :<ErrorBoundary><App/></ErrorBoundary>}</React.StrictMode>);
