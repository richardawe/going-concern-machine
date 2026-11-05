import { useCallback, useEffect, useState } from 'react';
import '../course/ui/course.css';
import { api, errorText } from './api';
import Legal from './Legal';
import PlatformApp from './platform/PlatformApp';
import { usePath } from './router';
import TenantApp from './tenant/TenantApp';
import { Loading, Notice, Shell } from './ui';
import './portal.css';

// The signed-in side of Going Concern. The server tells the page which kind of host it is on (a university, the
// platform console, or the public site) with <meta name="gcm-host">; /api/context then says who is signed in.

export interface Context {
  kind: 'public' | 'platform' | 'tenant' | 'missing'; release: string; environment: string; baseDomain: string; emailFrom?: string;
  tenant?: { name: string; slug: string; brandColor: string | null; open: boolean; termsAccepted: boolean; domains: { domain: string; includeSubdomains: boolean }[] };
  user?: { id: string; email: string; name: string; studentId: string; role: 'student' | 'lecturer' | 'admin' } | null;
  admin?: { id: string; email: string; name: string; totp_enabled: boolean; mfa: boolean } | null;
}

export default function PortalApp({ kind }: { kind: string }) {
  const path = usePath();
  const [ctx, setCtx] = useState<Context | null>(null), [error, setError] = useState('');
  const load = useCallback(() => api<Context>('/api/context').then(c => { setCtx(c); setError(''); }).catch(e => setError(errorText(e))), []);
  useEffect(() => { void load(); }, [load]);

  if (path.startsWith('/legal/')) return <Legal page={path.slice(7)} />;
  if (kind === 'missing') return <NoUniversity />;
  if (error) return <Shell brand="GOING CONCERN" crest="G" nav={[]}><Notice kind="error">{error} <button className="link" onClick={() => void load()}>Try again</button></Notice></Shell>;
  if (!ctx) return <Shell brand="GOING CONCERN" crest="G" nav={[]}><Loading /></Shell>;
  if (ctx.kind === 'platform') return <PlatformApp ctx={ctx} reload={load} />;
  if (ctx.kind === 'tenant' && ctx.tenant) return <TenantApp ctx={ctx} reload={load} />;
  if (ctx.kind === 'missing') return <NoUniversity />;
  return <FindUniversity />;
}

function FindUniversity() {
  const [email, setEmail] = useState(''), [error, setError] = useState(''), [found, setFound] = useState<{ name: string; url: string } | null>(null);
  useEffect(() => { document.title = 'Sign in · Going Concern'; }, []);
  const go = async () => {
    setError(''); setFound(null);
    try { const r = await api<{ name: string; url: string }>('/api/find-university', { body: { email } }); setFound(r); location.assign(r.url); }
    catch (e) { setError(errorText(e)); }
  };
  return <Shell brand="GOING CONCERN" crest="G" nav={[{ to: '/', label: 'Company machine', active: false }, { to: '/universities/', label: 'For universities', active: false }]}>
    <section className="signin">
      <div className="signin-head"><h1>Sign in</h1><p className="muted">Enter your university email and we’ll take you to your university’s Going Concern.</p></div>
      <form className="stack" onSubmit={e => { e.preventDefault(); void go(); }}>
        <div className="field"><label htmlFor="find-email">University email</label><input id="find-email" type="email" autoComplete="email" autoFocus value={email} onChange={e => setEmail(e.target.value)} placeholder="name@university.ac.uk" /></div>
        <button className="btn primary block" disabled={!email.includes('@')}>Continue</button>
      </form>
      {found && <Notice kind="good">Found {found.name}. Taking you there…</Notice>}
      {error && <Notice kind="error">{error}</Notice>}
    </section>
  </Shell>;
}

function NoUniversity() {
  const base = location.hostname.split('.').slice(1).join('.');
  return <Shell brand="GOING CONCERN" crest="G" nav={[]}>
    <section className="signin">
      <div className="signin-head"><h1>There’s no university here</h1><p className="muted">Check the address your lecturer gave you, or find your university by email.</p></div>
      <a className="btn primary block" href={`${location.protocol}//${base}${location.port ? `:${location.port}` : ''}/sign-in`}>Find your university</a>
    </section>
  </Shell>;
}
