import qrcode from 'qrcode-generator';
import { useEffect, useMemo, useState } from 'react';
import { api, errorText, useLoad } from '../api';
import type { Context } from '../PortalApp';
import { Link, match, navigate, usePath } from '../router';
import SignIn from '../SignIn';
import { Action, ago, CodeInput, Empty, Kpis, Loading, Notice, plural, Shell, ukDate, ukDateTime, type NavItem } from '../ui';

// The platform console at admin.<domain>: provision universities from the UK directory and look after them.

export default function PlatformApp({ ctx, reload }: { ctx: Context; reload: () => void }) {
  const path = usePath(), a = ctx.admin;
  useEffect(() => { document.title = 'Platform · Going Concern'; }, []);
  const nav: NavItem[] = a?.mfa ? [
    { to: '/', label: 'Universities', active: path === '/' || path.startsWith('/universities') },
    { to: '/system', label: 'System', active: path === '/system' },
    { to: '/audit', label: 'Audit log', active: path === '/audit' },
  ] : [];
  const shell = (body: React.ReactNode) => <Shell brand="GOING CONCERN · PLATFORM" place={ctx.environment !== 'production' ? ctx.environment : undefined} crest="G" nav={nav} who={a?.email}
    onSignOut={a ? () => void api('/api/platform/auth/sign-out', { body: {} }).then(() => { navigate('/'); reload(); }) : undefined}>{body}</Shell>;

  if (!a) return shell(<SignIn title={<><span className="crest big plain" aria-hidden="true">G</span><h1>Platform console</h1></>} emailLabel="Your email" placeholder="you@example.com"
    codeUrl="/api/platform/auth/code" verifyUrl="/api/platform/auth/verify" onSignedIn={reload} />);
  if (!a.mfa) return shell(<SecondFactor setUp={a.totp_enabled} onDone={reload} />);
  let m: Record<string, string> | null, page: React.ReactNode;
  if (path === '/' || path === '/universities') page = <Universities />;
  else if (path === '/universities/new') page = <Provision baseDomain={ctx.baseDomain} />;
  else if ((m = match('/universities/:id', path))) page = <University id={m.id} baseDomain={ctx.baseDomain} />;
  else if (path === '/system') page = <System />;
  else if (path === '/audit') page = <Audit />;
  else page = <Notice kind="error">There’s no page here.</Notice>;
  return shell(page);
}

function SecondFactor({ setUp, onDone }: { setUp: boolean; onDone: () => void }) {
  const [secret, setSecret] = useState<{ secret: string; uri: string } | null>(null), [code, setCode] = useState(''), [error, setError] = useState('');
  useEffect(() => { if (!setUp) api<{ secret: string; uri: string }>('/api/platform/auth/totp/setup', { body: {} }).then(setSecret).catch(e => setError(errorText(e))); }, [setUp]);
  const qr = useMemo(() => { if (!secret) return ''; const q = qrcode(0, 'M'); q.addData(secret.uri); q.make(); return q.createDataURL(5, 2); }, [secret]);
  const verify = async (v = code) => { setError(''); try { await api('/api/platform/auth/totp', { body: { code: v } }); onDone(); } catch (e) { setError(errorText(e)); setCode(''); } };
  return <section className="signin">
    <div className="signin-head"><span className="eyebrow">Second step</span><h1>{setUp ? 'Enter your authenticator code' : 'Set up your authenticator app'}</h1>
      {!setUp && <p className="small muted">The console controls every university, so it needs a second factor. Scan this with an authenticator app (Microsoft Authenticator, Google Authenticator, 1Password…), then enter the 6-digit code it shows.</p>}</div>
    {secret && <div className="stack-sm center-col"><img className="qr" src={qr} alt="QR code for your authenticator app" width={200} height={200} /><span className="small muted">Can’t scan? Enter this key:</span><code className="mono small secret">{secret.secret.match(/.{1,4}/g)!.join(' ')}</code></div>}
    <form className="stack" onSubmit={e => { e.preventDefault(); void verify(); }}>
      <CodeInput value={code} onChange={setCode} onDone={v => void verify(v)} label="Authenticator code" />
      <button className="btn primary block" disabled={code.length !== 6}>Continue</button>
    </form>
    {error && <Notice kind="error">{error}</Notice>}
    {setUp && <p className="small muted center">Lost your phone? Reset it on the server: <code className="mono">platform-admin reset-2fa you@example.com</code></p>}
  </section>;
}

interface Uni { id: string; slug: string; name: string; status: string; seatLimit: number | null; contractStart: string | null; contractEnd: string | null; createdAt: string; directoryId: string | null; termsAcceptedAt: string | null; domains: string[]; students: number; lecturers: number; activeAdmins: number; handinsThisWeek: number }
const statusTag = (u: { status: string; activeAdmins?: number; contractEnd?: string | null }) => {
  if (u.status === 'suspended') return <span className="c-tag bad">Suspended</span>;
  if (u.status === 'closed') return <span className="c-tag">Closed</span>;
  if (u.activeAdmins === 0) return <span className="c-tag accent">Invite sent</span>;
  const days = u.contractEnd ? Math.ceil((Date.parse(u.contractEnd) - Date.now()) / 8.64e7) : null;
  if (u.status === 'trial') return <span className="c-tag warn">Trial{days !== null && days >= 0 ? ` · ${days} days left` : ''}</span>;
  return <span className="c-tag good">Active{days !== null && days < 45 ? ` · renews in ${days} days` : ''}</span>;
};

function Universities() {
  const { data, error } = useLoad<Uni[]>('/api/platform/universities'), [q, setQ] = useState('');
  const shown = (data ?? []).filter(u => !q || `${u.name} ${u.slug} ${u.domains.join(' ')}`.toLowerCase().includes(q.toLowerCase()));
  const sum = (k: 'students' | 'handinsThisWeek') => (data ?? []).reduce((n, u) => n + u[k], 0);
  return <section className="stack-lg">
    <div className="banner"><div className="stack-sm"><span className="eyebrow">Platform</span><h1>Universities</h1></div><Link className="btn primary" to="/universities/new">Provision a university</Link></div>
    {data && <Kpis items={[{ value: data.length, label: `Universities · ${data.filter(u => u.status === 'active' || u.status === 'trial').length} open` }, { value: sum('students').toLocaleString('en-GB'), label: 'Students' }, { value: sum('handinsThisWeek'), label: 'Hand-ins this week' }]} />}
    {error && <Notice kind="error">{error.message}</Notice>}
    {data && !data.length && <Empty>No universities yet. Provision your first one: search for it by name and the details fill themselves in.</Empty>}
    {data && data.length > 0 && <>
      <input className="search" placeholder="Search by name, subdomain or email domain" aria-label="Search universities" value={q} onChange={e => setQ(e.target.value)} />
      <div className="card"><div className="table-wrap"><table className="years">
        <thead><tr><th>University</th><th>Subdomain</th><th>Email domains</th><th>Status</th><th>Students</th><th>Lecturers</th><th>Contract ends</th></tr></thead>
        <tbody>{shown.map(u => <tr key={u.id}><th><Link to={`/universities/${u.id}`}><b>{u.name}</b></Link></th><td className="mono small">{u.slug}</td>
          <td className="mono small">{u.domains[0]}{u.domains.length > 1 ? ` +${u.domains.length - 1}` : ''}</td><td>{statusTag(u)}</td>
          <td>{u.students.toLocaleString('en-GB')}{u.seatLimit ? <span className="muted"> / {u.seatLimit.toLocaleString('en-GB')}</span> : ''}</td><td>{u.lecturers}</td><td className="small">{ukDate(u.contractEnd)}</td></tr>)}</tbody>
      </table></div></div>
    </>}
  </section>;
}

interface DirEntry { id: string; name: string; aliases: string[]; domains: string[]; nation: string; slug: string; provisioned: { id: string; slug: string } | null; slugTaken: boolean }
interface DomainRule { domain: string; includeSubdomains: boolean }

function Provision({ baseDomain }: { baseDomain: string }) {
  const [q, setQ] = useState(''), [hits, setHits] = useState<DirEntry[]>([]), [picked, setPicked] = useState<DirEntry | null>(null), [manual, setManual] = useState(false);
  const [name, setName] = useState(''), [slug, setSlug] = useState(''), [slugMsg, setSlugMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [domains, setDomains] = useState<DomainRule[]>([]), [newDomain, setNewDomain] = useState('');
  const [adminEmail, setAdminEmail] = useState(''), [adminName, setAdminName] = useState('');
  const [status, setStatus] = useState<'active' | 'trial'>('active'), [seats, setSeats] = useState(''), [start, setStart] = useState(new Date().toISOString().slice(0, 10)), [end, setEnd] = useState(''), [retention, setRetention] = useState('12');
  const [error, setError] = useState('');

  useEffect(() => {
    if (picked || q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(() => api<DirEntry[]>(`/api/platform/directory?q=${encodeURIComponent(q)}`).then(setHits).catch(() => setHits([])), 150);
    return () => clearTimeout(t);
  }, [q, picked]);
  useEffect(() => {
    if (!slug) { setSlugMsg(null); return; }
    const t = setTimeout(() => api<{ ok: boolean; message: string }>(`/api/platform/slug-check?slug=${encodeURIComponent(slug)}`).then(setSlugMsg).catch(() => setSlugMsg(null)), 200);
    return () => clearTimeout(t);
  }, [slug]);

  const choose = (u: DirEntry) => {
    setPicked(u); setManual(false); setName(u.name); setSlug(u.slug); setDomains(u.domains.map(domain => ({ domain, includeSubdomains: true }))); setQ(u.name); setHits([]);
  };
  const addDomain = () => { const d = newDomain.trim().toLowerCase().replace(/^@/, ''); if (d && !domains.some(x => x.domain === d)) setDomains([...domains, { domain: d, includeSubdomains: true }]); setNewDomain(''); };
  const ready = name.trim() && slugMsg?.ok && domains.length && adminEmail.includes('@');
  const submit = async () => {
    setError('');
    try {
      const r = await api<{ id: string }>('/api/platform/universities', { body: {
        name, slug, domains, adminEmail, adminName, directoryId: picked?.id ?? null, status,
        seatLimit: seats ? Number(seats) : null, contractStart: start || null, contractEnd: end || null, retentionMonths: Number(retention) || 12,
      } });
      navigate(`/universities/${r.id}?new=1`);
    } catch (e) { setError(errorText(e)); }
  };
  const showForm = picked || manual;

  return <section className="stack-lg">
    <div className="stack-sm"><Link className="small" to="/">← Universities</Link><h1>Provision a university</h1></div>
    <div className="card pad stack-sm directory">
      <label className="eyebrow" htmlFor="dir-q">Find the university</label>
      <input id="dir-q" className="search big" autoFocus autoComplete="off" placeholder="Start typing: Strathclyde, LSE, Bayes, kcl.ac.uk…" value={q}
        onChange={e => { setQ(e.target.value); if (picked) { setPicked(null); } }} />
      {hits.length > 0 && <ul className="dir-hits" role="listbox" aria-label="Matching universities">{hits.map(u => <li key={u.id}>
        <button disabled={!!u.provisioned} onClick={() => choose(u)}>
          <b>{u.name}</b><span className="small muted">{u.nation} · {u.domains.join(', ')}{u.aliases.length ? ` · ${u.aliases.slice(0, 3).join(', ')}` : ''}</span>
          {u.provisioned && <span className="c-tag good">Already on Going Concern</span>}
        </button>
        {u.provisioned && <Link className="small" to={`/universities/${u.provisioned.id}`}>Open</Link>}
      </li>)}</ul>}
      {q.trim().length >= 2 && !hits.length && !picked && <p className="small muted">No match in the UK directory.</p>}
      {!showForm && <button className="link small" onClick={() => { setManual(true); setPicked(null); setName(q); setSlug(''); setDomains([]); }}>Not listed? Enter the details yourself</button>}
    </div>
    {showForm && <form className="two-pane" onSubmit={e => { e.preventDefault(); void submit(); }}>
      <div className="stack">
        <div className="card pad form-grid">
          <span className="eyebrow wide">Identity</span>
          <div className="field wide"><label htmlFor="p-name">Name</label><input id="p-name" required value={name} onChange={e => setName(e.target.value)} /></div>
          <div className="field wide"><label htmlFor="p-slug">Subdomain</label><div className="suffix-input"><input id="p-slug" required value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} /><span className="mono small muted">.{baseDomain}</span></div>
            {slugMsg && <span className={`small ${slugMsg.ok ? 'good-text' : 'warn-text'}`}>{slugMsg.ok ? '✓ ' : ''}{slugMsg.message}</span>}
            <span className="small muted">Short and permanent: it appears in every link students see.</span></div>
        </div>
        <div className="card pad stack-sm">
          <span className="eyebrow">Who can sign in</span>
          {domains.map((d, i) => <div key={d.domain} className="row domain-row"><span className="mono">@{d.domain}</span>
            <label className="check small"><input type="checkbox" checked={d.includeSubdomains} onChange={e => setDomains(domains.map((x, k) => k === i ? { ...x, includeSubdomains: e.target.checked } : x))} />and its subdomains (e.g. @student.{d.domain})</label>
            <button type="button" className="link small" onClick={() => setDomains(domains.filter((_, k) => k !== i))}>Remove</button></div>)}
          <div className="row"><input aria-label="Add an email domain" placeholder="Add a domain, e.g. students.example.ac.uk" value={newDomain} onChange={e => setNewDomain(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDomain(); } }} /><button type="button" className="btn small-btn" onClick={addDomain}>Add</button></div>
          {picked && <p className="small muted">These are the university’s usual domains from the directory. Confirm them with its IT team: some use a separate student domain.</p>}
        </div>
        <div className="card pad form-grid">
          <span className="eyebrow wide">University admin</span>
          <div className="field"><label htmlFor="p-aemail">Email</label><input id="p-aemail" type="email" required value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder={domains[0] ? `name@${domains[0].domain}` : ''} /></div>
          <div className="field"><label htmlFor="p-aname">Name</label><input id="p-aname" value={adminName} onChange={e => setAdminName(e.target.value)} /></div>
          <span className="small muted wide">They get an invite, sign in with their university email, and accept the terms on the university’s behalf.</span>
        </div>
        <div className="card pad form-grid">
          <span className="eyebrow wide">Contract</span>
          <div className="field"><label htmlFor="p-status">Status</label><select id="p-status" value={status} onChange={e => setStatus(e.target.value as 'active' | 'trial')}><option value="active">Active (paid)</option><option value="trial">Trial</option></select></div>
          <div className="field"><label htmlFor="p-seats">Student places</label><input id="p-seats" inputMode="numeric" value={seats} onChange={e => setSeats(e.target.value.replace(/\D/g, ''))} placeholder="No limit" /></div>
          <div className="field"><label htmlFor="p-start">Starts</label><input id="p-start" type="date" value={start} onChange={e => setStart(e.target.value)} /></div>
          <div className="field"><label htmlFor="p-end">Ends</label><input id="p-end" type="date" value={end} onChange={e => setEnd(e.target.value)} /></div>
          <div className="field"><label htmlFor="p-ret">Keep student work for</label><select id="p-ret" value={retention} onChange={e => setRetention(e.target.value)}>{[6, 12, 24, 36, 72].map(n => <option key={n} value={n}>{n} months after each course</option>)}</select></div>
        </div>
      </div>
      <aside className="card pad stack sendbox">
        <span className="eyebrow">When you click Provision</span>
        <ol className="list small">
          <li><span className="mono">{slug || '…'}.{baseDomain}</span> works at once. No DNS change is needed.</li>
          <li>An invite goes to <b>{adminEmail || 'the admin'}</b>.</li>
          <li>Anyone on {domains.length ? domains.map(d => `@${d.domain}`).join(', ') : 'the domains'} can sign in as a student.</li>
          <li>It’s recorded in the audit log under your name.</li>
        </ol>
        <button className="btn primary" disabled={!ready}>Provision {name || 'university'}</button>
        <span className="small muted">You can change everything later except the subdomain.</span>
        {error && <Notice kind="error">{error}</Notice>}
      </aside>
    </form>}
  </section>;
}

interface UniDetail {
  id: string; slug: string; name: string; status: 'trial' | 'active' | 'suspended' | 'closed'; brandColor: string | null; seatLimit: number | null; contractStart: string | null; contractEnd: string | null;
  retentionMonths: number; termsAcceptedAt: string | null; createdAt: string; url: string; domains: DomainRule[];
  admins: { id: string; email: string; name: string; status: string; lastSeenAt: string | null }[];
  counts: { students: number; lecturers: number; courses: number; handIns: number };
  audit: { at: string; actorKind: string; actorEmail: string | null; action: string; target: string | null }[];
}
function University({ id, baseDomain }: { id: string; baseDomain: string }) {
  const { data: u, error, reload } = useLoad<UniDetail>(`/api/platform/universities/${id}`);
  const [domain, setDomain] = useState(''), [subs, setSubs] = useState(true), [adminEmail, setAdminEmail] = useState(''), [adminName, setAdminName] = useState('');
  const [plan, setPlan] = useState<{ seats: string; start: string; end: string; retention: string } | null>(null);
  const fresh = new URLSearchParams(location.search).has('new');
  if (error) return <Notice kind="error">{error.message}</Notice>;
  if (!u) return <Loading />;
  const patch = async (body: Record<string, unknown>) => { await api(`/api/platform/universities/${id}`, { method: 'PATCH', body }); await reload(true); };
  const p = plan ?? { seats: u.seatLimit ? String(u.seatLimit) : '', start: u.contractStart ?? '', end: u.contractEnd ?? '', retention: String(u.retentionMonths) };
  return <section className="stack-lg">
    {fresh && <Notice kind="good">{u.name} is ready at <a href={u.url}>{u.slug}.{baseDomain}</a>. The admin’s invite is on its way.</Notice>}
    <div className="banner">
      <div className="stack-sm"><Link className="small" to="/">← Universities</Link><div className="row"><h1>{u.name}</h1>{statusTag({ status: u.status, activeAdmins: u.admins.filter(a => a.status === 'active').length, contractEnd: u.contractEnd })}</div>
        <a className="mono small" href={u.url}>{u.slug}.{baseDomain}</a></div>
      <div className="row">
        <a className="btn" href={`/api/platform/universities/${id}/export`}>Export data</a>
        {u.status === 'suspended' || u.status === 'closed'
          ? <Action className="btn" run={() => patch({ status: 'active' })}>Reactivate</Action>
          : <Action className="btn danger" confirm="Sign everyone out and block sign-in?" run={() => patch({ status: 'suspended' })}>Suspend</Action>}
      </div>
    </div>
    <Kpis items={[{ value: `${u.counts.students.toLocaleString('en-GB')}${u.seatLimit ? ` / ${u.seatLimit.toLocaleString('en-GB')}` : ''}`, label: 'Students · places', bar: u.seatLimit ? 100 * u.counts.students / u.seatLimit : undefined },
      { value: u.counts.lecturers, label: 'Lecturers' }, { value: u.counts.courses, label: 'Courses' }, { value: u.counts.handIns, label: 'Hand-ins' }]} />
    <div className="mods">
      <div className="card pad stack-sm">
        <span className="eyebrow">Email domains</span>
        {u.domains.map(d => <div key={d.domain} className="row spread small"><span className="mono">@{d.domain}{d.includeSubdomains ? ' + subdomains' : ''}</span>
          <Action className="link small" confirm="Remove?" run={async () => { await api(`/api/platform/universities/${id}/domains/${encodeURIComponent(d.domain)}`, { method: 'DELETE' }); await reload(true); }}>Remove</Action></div>)}
        <div className="row"><input aria-label="New domain" placeholder="students.example.ac.uk" value={domain} onChange={e => setDomain(e.target.value)} /></div>
        <label className="check small"><input type="checkbox" checked={subs} onChange={e => setSubs(e.target.checked)} />Include subdomains</label>
        <Action className="btn small-btn" disabled={!domain.includes('.')} run={async () => { await api(`/api/platform/universities/${id}/domains`, { body: { domain, includeSubdomains: subs } }); setDomain(''); await reload(true); }}>Add domain</Action>
      </div>
      <div className="card pad stack-sm">
        <span className="eyebrow">University admins</span>
        {u.admins.map(a => <div key={a.id} className="row spread small"><span>{a.name || a.email}<span className="muted mono"> {a.name ? a.email : ''}</span></span>{a.status === 'invited' ? <span className="c-tag accent">Invited</span> : <span className="muted">{ago(a.lastSeenAt)}</span>}</div>)}
        <input aria-label="Admin email" type="email" placeholder="Invite another admin by email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} />
        <input aria-label="Admin name" placeholder="Their name" value={adminName} onChange={e => setAdminName(e.target.value)} />
        <Action className="btn small-btn" disabled={!adminEmail.includes('@')} run={async () => { await api(`/api/platform/universities/${id}/admins`, { body: { email: adminEmail, name: adminName } }); setAdminEmail(''); setAdminName(''); await reload(true); }}>Send invite</Action>
        <span className="small muted">{u.termsAcceptedAt ? `Terms accepted ${ukDate(u.termsAcceptedAt)}.` : 'Terms not yet accepted.'}</span>
      </div>
      <div className="card pad stack-sm">
        <span className="eyebrow">Contract</span>
        <div className="form-grid tight">
          <div className="field"><label htmlFor="u-seats">Places</label><input id="u-seats" inputMode="numeric" value={p.seats} placeholder="No limit" onChange={e => setPlan({ ...p, seats: e.target.value.replace(/\D/g, '') })} /></div>
          <div className="field"><label htmlFor="u-ret">Retention (months)</label><input id="u-ret" inputMode="numeric" value={p.retention} onChange={e => setPlan({ ...p, retention: e.target.value.replace(/\D/g, '') })} /></div>
          <div className="field"><label htmlFor="u-start">Starts</label><input id="u-start" type="date" value={p.start} onChange={e => setPlan({ ...p, start: e.target.value })} /></div>
          <div className="field"><label htmlFor="u-end">Ends</label><input id="u-end" type="date" value={p.end} onChange={e => setPlan({ ...p, end: e.target.value })} /></div>
        </div>
        <div className="row">
          <Action className="btn small-btn" disabled={!plan} run={async () => { await patch({ seatLimit: p.seats ? Number(p.seats) : null, contractStart: p.start || null, contractEnd: p.end || null, retentionMonths: Number(p.retention) || 12 }); setPlan(null); }}>Save contract</Action>
          {u.status === 'trial' && <Action className="btn small-btn" run={() => patch({ status: 'active' })}>Mark as paid</Action>}
        </div>
      </div>
    </div>
    <div className="card pad stack-sm"><span className="eyebrow">Recent activity</span>
      {!u.audit.length ? <p className="small muted">Nothing yet.</p> : <div className="table-wrap"><table className="years"><tbody>{u.audit.map((e, i) => <tr key={i}><td className="small">{ukDateTime(e.at)}</td><td className="small">{e.actorKind === 'platform' ? `${e.actorEmail} (platform)` : e.actorEmail ?? 'system'}</td><td className="mono small">{e.action}</td><td className="small">{e.target}</td></tr>)}</tbody></table></div>}
    </div>
  </section>;
}

interface SystemInfo { release: string; environment: string; node: string; uptimeSeconds: number; memoryMb: number; backupsConfigured: boolean; lastBackup: { file: string; at: string; bytes: number } | null;
  database: { size: string; version: string; queue: number; gradeErrors: number; deadlines: { id: string; code: string; title: string; dueAt: string; university: string; students: number }[]; migrations: string[] } }
function System() {
  const { data: s, error } = useLoad<SystemInfo>('/api/platform/system');
  if (error) return <Notice kind="error">{error.message}</Notice>;
  if (!s) return <Loading />;
  const backupAge = s.lastBackup ? (Date.now() - Date.parse(s.lastBackup.at)) / 3.6e6 : null;
  return <section className="stack-lg">
    <div className="stack-sm"><span className="eyebrow">Platform</span><h1>System</h1></div>
    <Kpis items={[{ value: <span className="mono">{s.release.slice(0, 10)}</span>, label: `${s.environment} · up ${Math.round(s.uptimeSeconds / 3600)} h` },
      { value: s.lastBackup ? ago(s.lastBackup.at) : 'None', label: s.backupsConfigured ? (backupAge !== null && backupAge < 26 ? 'Last backup' : 'Last backup: overdue') : 'Backups not configured' },
      { value: s.database.size, label: `PostgreSQL ${(s.database.version ?? '').split(' ')[0]}` }, { value: s.database.queue, label: `Waiting to be graded${s.database.gradeErrors ? ` · ${s.database.gradeErrors} failed` : ''}` }]} />
    <div className="two-pane">
      <div className="card pad stack-sm"><span className="eyebrow">Deadlines in the next 14 days</span>
        {!s.database.deadlines.length ? <p className="small muted">None. A quiet time to deploy.</p> : <div className="table-wrap"><table className="years"><thead><tr><th>When</th><th>University</th><th>Course</th><th>Students</th></tr></thead>
          <tbody>{s.database.deadlines.map(d => <tr key={d.id}><td className="small">{ukDateTime(d.dueAt)}</td><td>{d.university}</td><td>{d.code} {d.title}</td><td>{d.students}</td></tr>)}</tbody></table></div>}
      </div>
      <div className="card pad stack-sm small"><span className="eyebrow">Server</span>
        <span>Node {s.node} · {s.memoryMb} MB in use</span><span>Migrations: {s.database.migrations.join(', ')}</span>
        {s.lastBackup && <span>Backup file {s.lastBackup.file} · {(s.lastBackup.bytes / 1e6).toFixed(1)} MB</span>}
      </div>
    </div>
  </section>;
}

function Audit() {
  const { data, error } = useLoad<{ at: string; actorKind: string; actorEmail: string | null; action: string; target: string | null; university: string | null }[]>('/api/platform/audit');
  return <section className="stack-lg">
    <div className="stack-sm"><span className="eyebrow">Platform</span><h1>Audit log</h1><p className="small muted">The latest 300 entries across every university.</p></div>
    {error && <Notice kind="error">{error.message}</Notice>}
    {data && <div className="card"><div className="table-wrap"><table className="years"><thead><tr><th>When</th><th>University</th><th>Who</th><th>What</th><th>About</th></tr></thead>
      <tbody>{data.map((a, i) => <tr key={i}><td className="small">{ukDateTime(a.at)}</td><td className="small">{a.university ?? '–'}</td><td className="small">{a.actorEmail ?? 'system'}{a.actorKind === 'platform' ? ' (platform)' : ''}</td><td className="mono small">{a.action}</td><td className="small">{a.target}</td></tr>)}</tbody></table></div></div>}
    {data && !data.length && <Empty>Nothing yet.</Empty>}
    <p className="small muted">{data ? plural(data.length, 'entry', 'entries') : ''}</p>
  </section>;
}
