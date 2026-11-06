import { useState } from 'react';
import { api, errorText, useLoad } from '../api';
import { Link } from '../router';
import { Action, ago, Empty, Kpis, Loading, Notice, plural, Tabs, ukDate, ukDateTime } from '../ui';

// A university's own admin pages: overview, people, settings and activity.

export function AdminNav({ at }: { at: 'overview' | 'people' | 'settings' | 'activity' }) {
  return <nav className="portal-tabs subnav" aria-label="Admin">
    {([['overview', '/admin', 'Overview'], ['people', '/admin/people', 'People'], ['settings', '/admin/settings', 'Settings'], ['activity', '/admin/activity', 'Activity']] as const)
      .map(([id, to, label]) => <Link key={id} to={to} className={at === id ? 'on' : ''} aria-current={at === id ? 'page' : undefined}>{label}</Link>)}
  </nav>;
}

export function Terms({ university, onAccepted }: { university: string; onAccepted: () => void }) {
  const [agree, setAgree] = useState(false);
  return <section className="stack-lg narrow">
    <div className="stack-sm"><span className="eyebrow">Before you start</span><h1>Terms for {university}</h1></div>
    <div className="card pad stack">
      <p>As {university}’s administrator on Going Concern Lab, you accept the terms of service and the data processing agreement in your contract, on the university’s behalf. In short:</p>
      <ul className="list small">
        <li>{university} decides whose data is held (its students and staff) and why. Going Concern Lab processes it only to run the courses.</li>
        <li>Data is held in the UK, on servers Going Concern Lab runs, and in encrypted off-site backups.</li>
        <li>Student work is kept for the period in your contract after each course ends, then deleted. You can export everything at any time.</li>
        <li>Anyone with an address on {university}’s email domains can sign in as a student. You decide who becomes a lecturer or an admin.</li>
        <li>Tell Going Concern Lab straight away if you suspect someone has misused an account.</li>
      </ul>
      <label className="check"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} /><span>I accept the terms of service and data processing agreement on behalf of {university}.</span></label>
      <Action className="btn primary" disabled={!agree} run={async () => { await api('/api/admin/terms', { body: { accept: true } }); onAccepted(); }}>Accept and continue</Action>
    </div>
  </section>;
}

interface Overview { counts: { students: number; lecturers: number; admins: number; invited: number }; seatLimit: number | null; handinsThisTerm: number; courses: { id: string; code: string; title: string; due_at: string | null; archived: boolean; enrolled: number; handed_in: number; lecturers: string }[] }
export function AdminOverview({ university }: { university: string }) {
  const { data, error } = useLoad<Overview>('/api/admin/overview');
  if (error) return <Notice kind="error">{error.message}</Notice>;
  if (!data) return <Loading />;
  const k = data.counts, open = data.courses.filter(c => !c.archived);
  return <section className="stack-lg">
    <div className="banner"><div className="stack-sm"><span className="eyebrow">Admin</span><h1>{university}</h1></div><AdminNav at="overview" /></div>
    <Kpis items={[
      { value: k.students.toLocaleString('en-GB'), label: data.seatLimit ? `Students · ${data.seatLimit.toLocaleString('en-GB')} places` : 'Students', bar: data.seatLimit ? 100 * k.students / data.seatLimit : undefined },
      { value: k.lecturers, label: `Lecturers${k.invited ? ` · ${k.invited} invited` : ''}` }, { value: open.length, label: 'Open courses' }, { value: data.handinsThisTerm, label: 'Hand-ins this term' }]} />
    <div className="two-pane">
      <div className="card pad stack-sm"><span className="eyebrow">Courses</span>
        {!data.courses.length ? <p className="small muted">No courses yet. Lecturers create them from the Teaching page.</p>
          : <div className="table-wrap"><table className="years"><thead><tr><th>Course</th><th>Lecturers</th><th>Students</th><th>Handed in</th><th>Due</th></tr></thead>
            <tbody>{data.courses.map(c => <tr key={c.id}><th><Link to={`/teach/${c.id}`}><b>{c.code}</b> {c.title}</Link>{c.archived && <span className="small muted"> · closed</span>}</th><td className="small">{c.lecturers}</td><td>{c.enrolled}</td><td>{c.handed_in}</td><td className="small">{c.due_at ? ukDateTime(c.due_at) : '–'}</td></tr>)}</tbody></table></div>}
      </div>
      <div className="card pad stack-sm"><span className="eyebrow">Getting started</span>
        <Step done={k.lecturers + k.admins > 1 || k.invited > 0}>Invite your lecturers on the <Link to="/admin/people">People</Link> page</Step>
        <Step done={data.courses.length > 0}>A lecturer creates a course and shares its join link</Step>
        <Step done={false}>Send the <Link to="/admin/settings">IT note</Link> to your service desk so sign-in emails aren’t filtered</Step>
      </div>
    </div>
  </section>;
}
const Step = ({ done, children }: { done: boolean; children: React.ReactNode }) => <div className="row small step-row"><span className={`c-tag ${done ? 'good' : ''}`}>{done ? 'Done' : 'To do'}</span><span>{children}</span></div>;

interface Person { id: string; email: string; name: string; studentId: string; role: 'student' | 'lecturer' | 'admin'; status: 'invited' | 'active' | 'deactivated'; createdAt: string; lastSeenAt: string | null; courses: number }
export function People({ meId }: { meId: string }) {
  const [role, setRole] = useState(''), [q, setQ] = useState(''), [search, setSearch] = useState('');
  const { data, error, reload } = useLoad<{ counts: Record<string, number>; people: Person[] }>(`/api/admin/people?role=${role}&q=${encodeURIComponent(search)}`);
  const [email, setEmail] = useState(''), [name, setName] = useState(''), [newRole, setNewRole] = useState<'lecturer' | 'admin'>('lecturer'), [msg, setMsg] = useState('');
  const [csv, setCsv] = useState(''), [showImport, setShowImport] = useState(false);
  const change = async (p: Person, body: Record<string, unknown>) => { await api(`/api/admin/people/${p.id}`, { method: 'PATCH', body }); await reload(true); };
  const invite = async () => { await api('/api/admin/people', { body: { email, name, role: newRole } }); setMsg(`Invite sent to ${email}.`); setEmail(''); setName(''); await reload(true); };
  const runImport = async () => { const r = await api<{ invited: number; problems: string[] }>('/api/admin/people/import', { body: { csv } }); setMsg(`${plural(r.invited, 'invite')} sent.${r.problems.length ? ` Not invited: ${r.problems.join('; ')}` : ''}`); setCsv(''); await reload(true); };
  const c = data?.counts;
  return <section className="stack-lg">
    <div className="banner"><div className="stack-sm"><span className="eyebrow">Admin</span><h1>People</h1></div><AdminNav at="people" /></div>
    <form className="card pad invite-row" onSubmit={e => { e.preventDefault(); }}>
      <div className="field"><label htmlFor="inv-email">Invite by university email</label><input id="inv-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@university.ac.uk" /></div>
      <div className="field"><label htmlFor="inv-name">Name (optional)</label><input id="inv-name" value={name} onChange={e => setName(e.target.value)} /></div>
      <div className="field"><label htmlFor="inv-role">As</label><select id="inv-role" value={newRole} onChange={e => setNewRole(e.target.value as 'lecturer' | 'admin')}><option value="lecturer">Lecturer</option><option value="admin">Admin</option></select></div>
      <Action className="btn primary" disabled={!email.includes('@')} run={invite}>Send invite</Action>
      <button type="button" className="link small" onClick={() => setShowImport(!showImport)}>{showImport ? 'Hide import' : 'Import a list'}</button>
    </form>
    {showImport && <div className="card pad stack-sm">
      <label className="eyebrow" htmlFor="imp">One person per line: email, name, role (lecturer or admin)</label>
      <textarea id="imp" rows={5} value={csv} onChange={e => setCsv(e.target.value)} placeholder={'j.wu@university.ac.uk, James Wu, lecturer\ns.patel@university.ac.uk, Sunita Patel, admin'} />
      <Action className="btn" disabled={!csv.includes('@')} run={runImport}>Send invites</Action>
    </div>}
    {msg && <Notice kind="good">{msg}</Notice>}
    <p className="small muted">Students don’t need inviting: anyone with your university email signs in as a student. Invite lecturers and admins here.</p>
    <div className="row spread">
      <Tabs label="Role" value={role} onChange={setRole} options={[{ id: '', label: `All · ${c?.all ?? 0}` }, { id: 'student', label: `Students · ${c?.student ?? 0}` }, { id: 'lecturer', label: `Lecturers · ${c?.lecturer ?? 0}` }, { id: 'admin', label: `Admins · ${c?.admin ?? 0}` }]} />
      <form onSubmit={e => { e.preventDefault(); setSearch(q); }}><input className="search" aria-label="Search people" placeholder="Search name or email" value={q} onChange={e => setQ(e.target.value)} onBlur={() => setSearch(q)} /></form>
    </div>
    {error && <Notice kind="error">{error.message}</Notice>}
    {data && !data.people.length && <Empty>Nobody matches.</Empty>}
    {data && data.people.length > 0 && <div className="card"><div className="table-wrap"><table className="years">
      <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Courses</th><th>Last signed in</th><th></th></tr></thead>
      <tbody>{data.people.map(p => <tr key={p.id} className={p.status === 'deactivated' ? 'dim' : ''}>
        <th>{p.name || <span className="muted">–</span>}{p.studentId && <span className="small muted mono"> {p.studentId}</span>}</th>
        <td className="mono small">{p.email}</td>
        <td>{p.status === 'deactivated' ? <span className="c-tag bad">Deactivated</span> : p.id === meId ? <span className="c-tag uni">{p.role} (you)</span>
          : <select aria-label={`Role for ${p.email}`} value={p.role} onChange={e => void change(p, { role: e.target.value }).catch(err => setMsg(errorText(err)))}><option value="student">Student</option><option value="lecturer">Lecturer</option><option value="admin">Admin</option></select>}
          {p.status === 'invited' && <span className="c-tag accent">Invited</span>}</td>
        <td>{p.courses}</td>
        <td className="small">{p.status === 'invited' ? <span className="muted">Not yet</span> : ago(p.lastSeenAt)}</td>
        <td className="actions-cell">{p.id !== meId && (p.status === 'deactivated'
          ? <Action className="btn small-btn" run={() => change(p, { status: 'active' })}>Reactivate</Action>
          : <>{p.status === 'invited' && p.role !== 'student' && <Action className="btn small-btn" run={() => change(p, { resend: true })}>Resend</Action>}
            <Action className="btn small-btn danger" confirm="Sign them out and block sign-in?" run={() => change(p, { status: 'deactivated' })}>Deactivate</Action></>)}</td>
      </tr>)}</tbody>
    </table></div></div>}
  </section>;
}

interface Settings { name: string; brandColor: string | null; retentionMonths: number; termsAcceptedAt: string | null; termsAcceptedBy: string | null; contractEnd: string | null; seatLimit: number | null; domains: { domain: string; includeSubdomains: boolean }[] }
/** WCAG contrast of white text on the colour, so the brand colour stays readable on buttons. */
const contrastOnWhite = (hex: string) => {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  const l = .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; return 1.05 / (l + .05);
};
export function SettingsPage({ onChanged, from }: { onChanged: () => void; from: string }) {
  const { data, error } = useLoad<Settings>('/api/admin/settings');
  const [name, setName] = useState<string | null>(null), [color, setColor] = useState<string | null>(null), [saved, setSaved] = useState('');
  if (error) return <Notice kind="error">{error.message}</Notice>;
  if (!data) return <Loading />;
  const n = name ?? data.name, col = color ?? data.brandColor ?? '#6d1f3b', ratio = contrastOnWhite(col);
  return <section className="stack-lg">
    <div className="banner"><div className="stack-sm"><span className="eyebrow">Admin</span><h1>Settings</h1></div><AdminNav at="settings" /></div>
    <div className="mods">
      <div className="card pad stack">
        <span className="eyebrow">Branding</span>
        <div className="field"><label htmlFor="s-name">Name students see</label><input id="s-name" value={n} onChange={e => setName(e.target.value)} /></div>
        <div className="field"><label htmlFor="s-col">Colour</label><div className="row"><input id="s-col" type="color" value={col} onChange={e => setColor(e.target.value)} /><span className="mono small">{col.toUpperCase()}</span>
          <span className={`small ${ratio >= 4.5 ? '' : 'warn-text'}`}>{ratio >= 4.5 ? '✓ Readable on buttons' : 'Too light for white text on buttons. Choose a darker colour.'}</span></div></div>
        <Action className="btn primary" disabled={ratio < 4.5 || !n.trim()} run={async () => { await api('/api/admin/settings', { method: 'PATCH', body: { name: n, brandColor: col } }); setSaved('Saved.'); onChanged(); }}>Save branding</Action>
        {saved && <span className="small" role="status">{saved}</span>}
      </div>
      <div className="card pad stack-sm">
        <span className="eyebrow">Who can sign in</span>
        {data.domains.map(d => <span key={d.domain} className="mono small">@{d.domain}{d.includeSubdomains ? ` and @…${d.domain}` : ''}</span>)}
        <p className="small muted">To change these, contact Going Concern Lab support. Changes to who can sign in are confirmed in writing.</p>
        <span className="eyebrow" style={{ marginTop: 8 }}>Note for your IT service desk</span>
        <p className="small">Sign-in codes come from <b className="mono">{from}</b>. Please make sure mail from this sender isn’t quarantined, and that links to {location.host} aren’t blocked. No DNS or single sign-on changes are needed.</p>
      </div>
      <div className="card pad stack-sm">
        <span className="eyebrow">Your data</span>
        <p className="small">Student work is kept for {plural(data.retentionMonths, 'month')} after each course ends, then deleted automatically.</p>
        {data.seatLimit && <p className="small">Student places: {data.seatLimit.toLocaleString('en-GB')}{data.contractEnd ? ` · contract to ${ukDate(data.contractEnd)}` : ''}</p>}
        <a className="btn" href="/api/admin/export">Export all data (JSON)</a>
        {data.termsAcceptedAt && <p className="small muted">Terms accepted by {data.termsAcceptedBy} on {ukDate(data.termsAcceptedAt)}.</p>}
      </div>
    </div>
  </section>;
}

export function Activity() {
  const { data, error } = useLoad<{ at: string; actorKind: string; actorEmail: string | null; action: string; target: string | null }[]>('/api/admin/audit');
  return <section className="stack-lg">
    <div className="banner"><div className="stack-sm"><span className="eyebrow">Admin</span><h1>Activity</h1></div><AdminNav at="activity" /></div>
    {error && <Notice kind="error">{error.message}</Notice>}
    {data && !data.length && <Empty>Nothing yet.</Empty>}
    {data && data.length > 0 && <div className="card"><div className="table-wrap"><table className="years"><thead><tr><th>When</th><th>Who</th><th>What</th><th>About</th></tr></thead>
      <tbody>{data.map((a, i) => <tr key={i}><td className="small">{ukDateTime(a.at)}</td><td className="small">{a.actorKind === 'platform' ? 'Going Concern Lab support' : a.actorEmail ?? 'System'}</td><td className="mono small">{a.action}</td><td className="small">{a.target ?? ''}</td></tr>)}</tbody></table></div></div>}
  </section>;
}
