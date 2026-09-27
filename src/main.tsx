import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './theme.css';
import './styles.css';
class ErrorBoundary extends React.Component<{children:React.ReactNode},{error:boolean}> {
 state={error:false};static getDerivedStateFromError(){return {error:true}}
 render(){return this.state.error?<main className="fatal"><h1>The machine has stopped</h1><p>The saved model could not be rendered. Reset saved scenarios to reload the company machines.</p><button onClick={()=>{for(const key of Object.keys(localStorage))if(key.startsWith('gcm:v1:')||key.startsWith('gcm:v2:'))localStorage.removeItem(key);location.reload()}}>Reset saved scenarios</button></main>:this.props.children}
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary><App/></ErrorBoundary></React.StrictMode>);
