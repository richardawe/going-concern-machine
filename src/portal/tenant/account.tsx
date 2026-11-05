import { useState } from 'react';
import { api, useLoad } from '../api';
import { Action, ago, Notice } from '../ui';
import type { Me } from './TenantApp';

// Every person's own page: the name on their hand-ins, where they're signed in, and their data.

const device = (ua: string) => {
  const os = /iPhone|iPad/.test(ua) ? 'iPhone or iPad' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'browser';
  return `${os} · ${browser}`;
};

export function Profile({ me, university, onSaved, welcome }: { me: Me; university: string; onSaved: () => void; welcome?: boolean }) {
  const [name, setName] = useState(me.name), [sid, setSid] = useState(me.studentId), [saved, setSaved] = useState('');
  const save = async () => { await api('/api/me', { method: 'PATCH', body: { name, studentId: sid } }); setSaved('Saved.'); onSaved(); };
  return <form className="card pad stack" onSubmit={e => e.preventDefault()}>
    {welcome ? <div className="stack-sm"><span className="eyebrow">Welcome to {university}</span><h1>What should we call you?</h1><p className="small muted">Your name goes on everything you hand in. You can change it later on the Account page.</p></div> : <span className="eyebrow">Profile</span>}
    <div className="field"><label htmlFor="p-name">Full name</label><input id="p-name" autoComplete="name" value={name} onChange={e => setName(e.target.value)} /></div>
    {me.role === 'student' && <div className="field"><label htmlFor="p-sid">Student ID (optional)</label><input id="p-sid" value={sid} onChange={e => setSid(e.target.value)} /></div>}
    <div className="field"><label>Email</label><span className="mono small">{me.email}</span><span className="small muted">From your university sign-in; it can’t be changed here.</span></div>
    <Action className="btn primary" disabled={name.trim().length < 2} run={save}>{welcome ? 'Continue' : 'Save'}</Action>
    {saved && !welcome && <span className="small" role="status">{saved}</span>}
  </form>;
}

export function Account({ me, university, onSaved }: { me: Me; university: string; onSaved: () => void }) {
  const sessions = useLoad<{ id: string; device: string; lastSeenAt: string; current: boolean }[]>('/api/me/sessions');
  const [msg, setMsg] = useState('');
  return <section className="stack-lg">
    <div className="stack-sm"><span className="eyebrow">Account</span><h1>{me.name || me.email}</h1></div>
    <div className="mods">
      <Profile me={me} university={university} onSaved={onSaved} />
      <div className="card pad stack-sm">
        <span className="eyebrow">Where you’re signed in</span>
        {sessions.data?.map(s => <div key={s.id} className="row spread small"><span>{device(s.device)}</span>{s.current ? <span className="c-tag good">This device</span> : <span className="muted">{ago(s.lastSeenAt)}</span>}</div>)}
        <Action className="btn small-btn" run={async () => { const r = await api<{ signedOut: number }>('/api/me/sessions/sign-out-others', { body: {} }); setMsg(r.signedOut ? `Signed out of ${r.signedOut} other ${r.signedOut === 1 ? 'device' : 'devices'}.` : 'You weren’t signed in anywhere else.'); await sessions.reload(true); }}>Sign out everywhere else</Action>
        {msg && <span className="small" role="status">{msg}</span>}
      </div>
      <div className="card pad stack-sm">
        <span className="eyebrow">Your data</span>
        <p className="small">{university} keeps your work for a set period after each course ends, then it is deleted. You can download everything held about you at any time.</p>
        <a className="btn" href="/api/me/export">Download my data</a>
        <p className="small"><a href="/legal/privacy">Privacy notice</a></p>
      </div>
    </div>
    {sessions.error && <Notice kind="error">{sessions.error.message}</Notice>}
  </section>;
}
