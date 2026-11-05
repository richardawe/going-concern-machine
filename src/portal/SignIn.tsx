import { useState, type ReactNode } from 'react';
import { api, errorText } from './api';
import { CodeInput, Notice } from './ui';

// Email, then the 6-digit code we send. Used by every university and by the platform console.

export default function SignIn({ title, intro, emailLabel, placeholder, codeUrl, verifyUrl, initialEmail = '', onSignedIn, footer }: {
  title: ReactNode; intro?: ReactNode; emailLabel: string; placeholder: string; codeUrl: string; verifyUrl: string; initialEmail?: string;
  onSignedIn: (result: unknown) => void; footer?: ReactNode;
}) {
  const [email, setEmail] = useState(initialEmail), [code, setCode] = useState(''), [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [note, setNote] = useState('');

  const send = async () => {
    setBusy(true); setError(''); setNote('');
    try { await api(codeUrl, { body: { email } }); setStep('code'); setCode(''); }
    catch (e) { setError(errorText(e)); }
    setBusy(false);
  };
  const verify = async (value = code) => {
    if (value.length !== 6) return;
    setBusy(true); setError('');
    try { onSignedIn(await api(verifyUrl, { body: { email, code: value } })); }
    catch (e) { setError(errorText(e)); setCode(''); }
    setBusy(false);
  };

  return <section className="signin">
    <div className="signin-head">{title}{intro}</div>
    {step === 'email' ? <form className="stack" onSubmit={e => { e.preventDefault(); void send(); }}>
      <div className="field"><label htmlFor="signin-email">{emailLabel}</label>
        <input id="signin-email" type="email" autoComplete="email" autoFocus required placeholder={placeholder} value={email} onChange={e => setEmail(e.target.value)} /></div>
      <button className="btn primary uni block" disabled={busy || !email.includes('@')}>{busy ? 'Sending…' : 'Email me a sign-in code'}</button>
      <p className="small muted center">No password needed. We’ll email you a 6-digit code that works for 10 minutes.</p>
    </form> : <form className="stack" onSubmit={e => { e.preventDefault(); void verify(); }}>
      <p className="center">We sent a code to <b className="ink">{email}</b></p>
      <CodeInput value={code} onChange={setCode} onDone={v => void verify(v)} label="Sign-in code" />
      <button className="btn primary uni block" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Sign in'}</button>
      <div className="row small center-row">
        <button type="button" className="link" disabled={busy} onClick={() => { void send().then(() => setNote('We sent a new code.')); }}>Send a new code</button>
        <span className="muted">·</span>
        <button type="button" className="link" onClick={() => { setStep('email'); setError(''); }}>Use a different email</button>
      </div>
      <p className="small muted center">Not there after a minute? Check your junk folder. Your IT team may need to allow emails from Going Concern.</p>
    </form>}
    {note && <Notice kind="good">{note}</Notice>}
    {error && <Notice kind="error">{error}</Notice>}
    {footer}
  </section>;
}
