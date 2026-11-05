import { useState } from 'react';
import { cases } from '../../ceo/cases';
import type { ModuleGrade } from '../../course/grade';
import { moduleById, modules as allModules } from '../../course/modules';
import { wordCount } from '../../course/text';
import type { Answer, Payload } from '../../course/types';
import { api, errorText, useLoad } from '../api';
import { Link, navigate } from '../router';
import { Action, Empty, fromLocalInput, Kpis, Loading, Notice, plural, Tabs, toLocalInput, ukDateTime } from '../ui';

// The lecturer pages: my courses, creating and editing a course, the hand-ins table, and one student's work.

interface Staff { id: string; name: string; email: string }
interface TeachCourse {
  id: string; code: string; title: string; term: string; modules: string[]; dueAt: string | null; latePolicy: 'flag' | 'block'; joinCode: string; joinOpen: boolean; archived: boolean;
  snapshotId: string; staff: Staff[]; mine?: boolean; enrolled?: number; handedIn?: number; late?: number; inProgress?: number;
}
type Grades = Record<string, ModuleGrade | null>;
interface RosterRow {
  userId: string; name: string; email: string; studentId: string; joinedAt: string; extensionUntil: string | null; deactivated: boolean;
  status: 'handed-in' | 'in-progress' | 'not-started'; modulesComplete: number; lastSaved: string | null; changedSinceHandIn: boolean;
  handIn: { code: string; handedInAt: string; late: boolean; attempt: number; words: number; responses: number; pasted: number; grades: Grades | null; gradeError: string | null } | null;
}

const joinUrl = (code: string) => `${location.origin}/join/${code}`;
const gradeSummary = (g: Grades | null) => g ? Object.entries(g).filter(([, x]) => x).sort(([a], [b]) => (moduleById(a)?.number ?? 0) - (moduleById(b)?.number ?? 0)).map(([id, x]) => `M${moduleById(id)?.number ?? '?'} ${x!.outcome.grade}/${x!.judgement.grade}`).join(' · ') || '–' : null;

export function TeachCourses() {
  const { data, error, loading } = useLoad<TeachCourse[]>('/api/teach/courses');
  const open = data?.filter(c => !c.archived) ?? [], closed = data?.filter(c => c.archived) ?? [];
  return <section className="stack-lg">
    <div className="banner"><div className="stack-sm"><span className="eyebrow">Teaching</span><h1>Courses</h1></div><Link className="btn primary" to="/teach/new">New course</Link></div>
    {loading && !data && <Loading />}
    {error && <Notice kind="error">{error.message}</Notice>}
    {data && !data.length && <Empty>No courses yet. Create one, choose its modules, and share the join link with your students.</Empty>}
    {open.length > 0 && <div className="mods">{open.map(c => <CourseCard key={c.id} c={c} />)}</div>}
    {closed.length > 0 && <details><summary className="small muted">Closed courses ({closed.length})</summary><div className="mods" style={{ marginTop: 12 }}>{closed.map(c => <CourseCard key={c.id} c={c} />)}</div></details>}
  </section>;
}
function CourseCard({ c }: { c: TeachCourse }) {
  const hours = c.dueAt ? (Date.parse(c.dueAt) - Date.now()) / 3.6e6 : null;
  return <Link className="card mod" to={`/teach/${c.id}`}>
    <div className="row spread"><span className="eyebrow">{c.code}{c.term ? ` · ${c.term}` : ''}</span>{c.dueAt && <span className={`c-tag ${hours! < 0 ? '' : hours! < 48 ? 'warn' : ''}`}>{hours! < 0 ? 'Past due' : `Due ${ukDateTime(c.dueAt)}`}</span>}</div>
    <h3>{c.title}</h3>
    <span className="small muted">{plural(c.modules.length, 'module')} · {plural(c.enrolled ?? 0, 'student')}{c.mine === false ? ' · not yours' : ''}</span>
    <div className="progress"><i style={{ width: `${c.enrolled ? Math.round(100 * (c.handedIn ?? 0) / c.enrolled) : 0}%` }} /></div>
    <span className="small"><b>{c.handedIn ?? 0}</b> handed in · {c.inProgress ?? 0} in progress · {Math.max(0, (c.enrolled ?? 0) - (c.handedIn ?? 0) - (c.inProgress ?? 0))} not started</span>
  </Link>;
}

export function CourseForm({ id }: { id?: string }) {
  const existing = useLoad<TeachCourse>(id ? `/api/teach/courses/${id}` : null);
  if (id && !existing.data) return existing.error ? <Notice kind="error">{existing.error.message}</Notice> : <Loading />;
  return <CourseFormInner initial={existing.data ?? undefined} />;
}
function CourseFormInner({ initial }: { initial?: TeachCourse }) {
  const ready = allModules.filter(m => m.ready);
  const [title, setTitle] = useState(initial?.title ?? ''), [code, setCode] = useState(initial?.code ?? ''), [term, setTerm] = useState(initial?.term ?? '');
  const [mods, setMods] = useState<string[]>(initial?.modules ?? ready.map(m => m.id)), [due, setDue] = useState(toLocalInput(initial?.dueAt));
  const [late, setLate] = useState<'flag' | 'block'>(initial?.latePolicy ?? 'flag'), [co, setCo] = useState(''), [error, setError] = useState('');
  const toggle = (m: string) => setMods(cur => cur.includes(m) ? cur.filter(x => x !== m) : ready.map(r => r.id).filter(r => cur.includes(r) || r === m));
  const submit = async () => {
    setError('');
    const body = { title, code, term, modules: mods, dueAt: fromLocalInput(due), latePolicy: late, ...(initial ? {} : { coLecturers: co.split(/[\s,;]+/).filter(Boolean) }) };
    try {
      const c = await api<TeachCourse>(initial ? `/api/teach/courses/${initial.id}` : '/api/teach/courses', { method: initial ? 'PATCH' : 'POST', body });
      navigate(`/teach/${c.id}`);
    } catch (e) { setError(errorText(e)); }
  };
  return <section className="stack-lg">
    <div className="stack-sm"><Link className="small" to={initial ? `/teach/${initial.id}` : '/teach'}>← {initial ? initial.code : 'Courses'}</Link><h1>{initial ? 'Edit course' : 'New course'}</h1></div>
    <form className="two-pane" onSubmit={e => { e.preventDefault(); void submit(); }}>
      <div className="stack">
        <div className="card pad form-grid">
          <div className="field wide"><label htmlFor="c-title">Course title</label><input id="c-title" required value={title} onChange={e => setTitle(e.target.value)} placeholder="Corporate Finance" /></div>
          <div className="field"><label htmlFor="c-code">Course code</label><input id="c-code" required value={code} onChange={e => setCode(e.target.value)} placeholder="FIN 7102" /></div>
          <div className="field"><label htmlFor="c-term">Term</label><input id="c-term" value={term} onChange={e => setTerm(e.target.value)} placeholder="Autumn 2026" /></div>
        </div>
        <fieldset className="card pad stack-sm"><legend className="eyebrow">Modules · about 45 minutes each</legend>
          {ready.map(m => <label key={m.id} className="check"><input type="checkbox" checked={mods.includes(m.id)} onChange={() => toggle(m.id)} /><span><b className="ink">{m.number} · {m.title}</b> <span className="muted">{m.topic}</span></span></label>)}
          {initial && <p className="small muted">Removing a module from a course students have started hides their work on it from the hand-in.</p>}
        </fieldset>
        <div className="card pad form-grid">
          <div className="field"><label htmlFor="c-due">Due (your time zone)</label><input id="c-due" type="datetime-local" value={due} onChange={e => setDue(e.target.value)} /></div>
          <div className="field"><label htmlFor="c-late">Late hand-ins</label><select id="c-late" value={late} onChange={e => setLate(e.target.value as 'flag' | 'block')}><option value="flag">Accept and mark as late</option><option value="block">Refuse after the deadline</option></select></div>
          {!initial && <div className="field wide"><label htmlFor="c-co">Co-lecturers (optional)</label><input id="c-co" value={co} onChange={e => setCo(e.target.value)} placeholder="their university emails, separated by commas" /><span className="small muted">They must already be lecturers here. Your university admin invites them.</span></div>}
        </div>
      </div>
      <aside className="card pad stack sendbox">
        <span className="eyebrow">{initial ? 'Save changes' : 'Create the course'}</span>
        <p className="small">{initial ? 'Students see changes straight away.' : 'You’ll get a join link and a short code to share on Canvas or a slide. Grades use this week’s data, fixed for the life of the course.'}</p>
        <button className="btn primary" disabled={!title.trim() || !code.trim() || !mods.length}>{initial ? 'Save' : 'Create course'}</button>
        {error && <Notice kind="error">{error}</Notice>}
      </aside>
    </form>
  </section>;
}

export function CourseRoster({ id }: { id: string }) {
  const course = useLoad<TeachCourse>(`/api/teach/courses/${id}`), roster = useLoad<RosterRow[]>(`/api/teach/courses/${id}/roster`);
  const [filter, setFilter] = useState<'all' | 'handed-in' | 'in-progress' | 'not-started' | 'flagged'>('all'), [q, setQ] = useState('');
  const [copied, setCopied] = useState(''), [extending, setExtending] = useState<string | null>(null), [extDate, setExtDate] = useState('');
  const c = course.data, rows = roster.data ?? [];
  if (course.error) return <Notice kind="error">{course.error.message}</Notice>;
  if (!c) return <Loading />;
  const counts = { all: rows.length, 'handed-in': rows.filter(r => r.status === 'handed-in').length, 'in-progress': rows.filter(r => r.status === 'in-progress').length, 'not-started': rows.filter(r => r.status === 'not-started').length, flagged: rows.filter(r => r.handIn && (r.handIn.pasted || r.handIn.late)).length };
  const shown = rows.filter(r => (filter === 'all' || (filter === 'flagged' ? !!r.handIn && (r.handIn.pasted > 0 || r.handIn.late) : r.status === filter)) && (!q || `${r.name} ${r.email} ${r.studentId}`.toLowerCase().includes(q.toLowerCase())));
  const copy = async (text: string, what: string) => { try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(''), 2000); } catch { setCopied('Select and copy it by hand.'); } };
  const patch = async (body: Record<string, unknown>) => { await api(`/api/teach/courses/${id}`, { method: 'PATCH', body }); await course.reload(true); };
  const extend = async (userId: string, until: string | null) => { await api(`/api/teach/courses/${id}/students/${userId}/extension`, { method: 'PUT', body: { until } }); setExtending(null); await roster.reload(true); };
  const late = rows.filter(r => r.handIn?.late).length, ungraded = rows.some(r => r.handIn && !r.handIn.grades && !r.handIn.gradeError);

  return <section className="stack-lg">
    <div className="banner">
      <div className="stack-sm"><Link className="small" to="/teach">← Courses</Link><span className="eyebrow">{c.code}{c.term ? ` · ${c.term}` : ''}{c.dueAt ? ` · due ${ukDateTime(c.dueAt)}` : ''}{c.archived ? ' · closed' : ''}</span><h1>{c.title}</h1>
        <span className="small muted">{c.staff.map(s => s.name || s.email).join(', ')}</span></div>
      <div className="row"><a className="btn" href={`/api/teach/courses/${id}/export.csv`}>Export CSV</a>
        {counts['handed-in'] > 0 && (ungraded ? <span className="small muted">PDFs ready once grading finishes</span> : <a className="btn" href={`/api/teach/courses/${id}/hand-ins.zip`}>All PDFs (.zip)</a>)}
        <Link className="btn" to={`/teach/${id}/edit`}>Edit</Link></div>
    </div>
    <div className="card pad join-panel">
      <div className="stack-sm"><span className="eyebrow">Join link</span><code className="mono join-url">{joinUrl(c.joinCode)}</code>
        <span className="small muted">Or the code <b className="mono ink">{c.joinCode}</b> at {location.host}. Students sign in with their university email and land on this course.</span></div>
      <div className="row">
        <button className="btn small-btn" onClick={() => copy(joinUrl(c.joinCode), 'Link copied')}>Copy link</button>
        <Action className="btn small-btn" run={() => patch({ joinOpen: !c.joinOpen })}>{c.joinOpen ? 'Stop new joins' : 'Allow joining'}</Action>
        <Action className="btn small-btn" confirm="Old link stops working. Confirm" run={() => patch({ newJoinCode: true })}>New code</Action>
        {!c.joinOpen && <span className="c-tag">Joining closed</span>}
        {copied && <span className="small" role="status">{copied}</span>}
      </div>
    </div>
    <Kpis items={[{ value: counts.all, label: 'Enrolled' }, { value: counts['handed-in'], label: `Handed in${late ? ` · ${late} late` : ''}`, bar: counts.all ? 100 * counts['handed-in'] / counts.all : 0 }, { value: counts['in-progress'], label: 'In progress' }, { value: counts['not-started'], label: 'Not started' }]} />
    <div className="row spread">
      <Tabs label="Show" value={filter} onChange={setFilter} options={[{ id: 'all', label: `All · ${counts.all}` }, { id: 'handed-in', label: `Handed in · ${counts['handed-in']}` }, { id: 'in-progress', label: `In progress · ${counts['in-progress']}` }, { id: 'not-started', label: `Not started · ${counts['not-started']}` }, { id: 'flagged', label: `Flagged · ${counts.flagged}` }]} />
      <input className="search" placeholder="Search name, email or ID" aria-label="Search students" value={q} onChange={e => setQ(e.target.value)} />
    </div>
    {roster.loading && !roster.data && <Loading />}
    {!rows.length && roster.data && <Empty>No students yet. Share the join link above.</Empty>}
    {shown.length > 0 && <div className="card"><div className="table-wrap"><table className="years inbox">
      <thead><tr><th>Student</th><th>Status</th><th>Modules</th><th>Words</th><th>Pasted</th><th>Grades (outcome / judgement)</th><th>Verification</th><th></th></tr></thead>
      <tbody>{shown.map(r => <tr key={r.userId}>
        <th><Link to={`/teach/${id}/students/${r.userId}`}><b>{r.name || r.email}</b></Link>{r.studentId && <span className="small muted mono"> {r.studentId}</span>}<div className="small muted">{r.email}</div></th>
        <td className="status-cell">{r.status === 'handed-in' ? <span className={`c-tag ${r.handIn!.late ? 'warn' : 'good'}`}>{r.handIn!.late ? 'Late' : 'Handed in'} {ukDateTime(r.handIn!.handedInAt)}</span> : r.status === 'in-progress' ? <span className="c-tag accent">In progress</span> : <span className="c-tag bad">Not started</span>}
          {r.changedSinceHandIn && <div className="small warn-text">Changed since</div>}{r.handIn && r.handIn.attempt > 1 && <div className="small muted">{plural(r.handIn.attempt, 'attempt')}</div>}
          {r.extensionUntil && <div className="small muted">Extension to {ukDateTime(r.extensionUntil)}</div>}</td>
        <td>{r.modulesComplete} / {c.modules.length}</td>
        <td>{r.handIn ? r.handIn.words.toLocaleString('en-GB') : '–'}</td>
        <td>{r.handIn?.pasted ? <span className="flag">{r.handIn.pasted}</span> : '–'}</td>
        <td className="small grades-cell">{r.handIn ? r.handIn.gradeError ? <span className="warn-text">Grading failed</span> : gradeSummary(r.handIn.grades) ?? <span className="muted">Grading…</span> : '–'}</td>
        <td className="mono small">{r.handIn?.code ?? '–'}</td>
        <td className="actions-cell">
          {r.handIn?.grades && <a className="btn small-btn" href={`/api/teach/courses/${id}/students/${r.userId}/hand-in.pdf`}>PDF</a>}
          {extending === r.userId ? <span className="row"><input type="datetime-local" aria-label="Extension until" value={extDate} onChange={e => setExtDate(e.target.value)} />
            <Action className="btn small-btn" disabled={!extDate} run={() => extend(r.userId, fromLocalInput(extDate))}>Save</Action>
            {r.extensionUntil && <Action className="link small" run={() => extend(r.userId, null)}>Remove</Action>}
            <button className="link small" onClick={() => setExtending(null)}>Cancel</button></span>
            : <button className="btn small-btn" onClick={() => { setExtending(r.userId); setExtDate(toLocalInput(r.extensionUntil ?? c.dueAt)); }}>Extend</button>}
        </td>
      </tr>)}</tbody>
    </table></div></div>}
  </section>;
}

interface StudentWork {
  course: { id: string; code: string; title: string; modules: string[]; dueAt: string | null };
  student: { userId: string; name: string; email: string; studentId: string; joinedAt: string; extensionUntil: string | null; modulesComplete: number; lastSaved: string | null };
  handIn: { payload: Payload; code: string; handedInAt: string; late: boolean; attempt: number; grades: Grades | null; gradeError: string | null; stats: { completed: number; responses: number; words: number; pasted: number } } | null;
}
const AnswerBox = ({ label, a }: { label: string; a?: Answer }) => <div className="stack-sm answer-row">
  <div className="row spread"><span className="eyebrow">{label}</span><span className="small muted">{a ? `${wordCount(a.text)} words` : 'No answer'}{a?.pasted && <span className="flag" style={{ marginLeft: 8 }}>Pasted</span>}</span></div>
  {a && <p className="answer-text">{a.text}</p>}
</div>;

export function StudentWorkPage({ courseId, userId }: { courseId: string; userId: string }) {
  const { data, error } = useLoad<StudentWork>(`/api/teach/courses/${courseId}/students/${userId}`);
  const [tab, setTab] = useState<string>('');
  if (error) return <Notice kind="error">{error.message}</Notice>;
  if (!data) return <Loading />;
  const { student: s, handIn: h, course: c } = data, payload = h?.payload;
  const current = tab || payload?.modules[0]?.id || '';
  const m = payload?.modules.find(x => x.id === current), def = m && moduleById(m.id), caseDef = def && cases.find(x => x.id === def.caseId), g = h?.grades?.[current];
  return <section className="stack-lg">
    <div className="banner">
      <div className="stack-sm"><Link className="small" to={`/teach/${courseId}`}>← {c.code}</Link><h1>{s.name || s.email}</h1>
        <span className="small muted">{s.email}{s.studentId ? ` · ${s.studentId}` : ''}{h ? ` · handed in ${ukDateTime(h.handedInAt)}${h.late ? ' (late)' : ''} · ${h.attempt === 1 ? 'first attempt' : plural(h.attempt, 'attempt')}` : ''}</span></div>
      {h?.grades && <a className="btn" href={`/api/teach/courses/${courseId}/students/${userId}/hand-in.pdf`}>Download PDF</a>}
    </div>
    {!h && <Empty>{s.name || 'This student'} hasn’t handed in yet. {s.modulesComplete} of {c.modules.length} modules complete; last saved {s.lastSaved ? ukDateTime(s.lastSaved) : 'never'}.</Empty>}
    {h && payload && <>
      <div className="row"><span className="small muted">Verification</span><code className="vcode">{h.code}</code><span className="small muted">{h.stats.responses} typed responses · {h.stats.words.toLocaleString('en-GB')} words{h.stats.pasted ? ` · ${h.stats.pasted} pasted` : ''}</span></div>
      <Tabs label="Module" value={current} onChange={setTab} options={payload.modules.map(x => ({ id: x.id, label: `M${moduleById(x.id)?.number} · ${moduleById(x.id)?.title}${x.completed ? '' : ' (unfinished)'}` }))} />
      {def && m && <div className="two-pane">
        <div className="card pad stack">
          {def.concepts.map((k, i) => <AnswerBox key={k.id} label={`Concept ${i + 1} · ${k.title}`} a={m.concepts[k.id]} />)}
          {m.decisions.map((dcs, i) => <AnswerBox key={i} label={`Year ${i + 1} decision · ${caseDef?.turns[i]?.cards.find(x => x.id === dcs.card)?.title ?? 'Kept the plan'}`} a={dcs.reason} />)}
          {m.reflection && <AnswerBox label="Debrief reflection" a={m.reflection} />}
          {def.check.map((q, i) => { const v = m.check[q.id]; return q.kind === 'mcq'
            ? <div key={q.id} className="stack-sm answer-row"><span className="eyebrow">Check {i + 1} · multiple choice</span><p className="small">{q.stem}</p><p className="small">{typeof v === 'number' ? <>{q.options[v]} <span className={`c-tag ${v === q.answer ? 'good' : 'bad'}`}>{v === q.answer ? 'Right' : 'Wrong'}</span></> : <span className="muted">Not answered</span>}</p></div>
            : <AnswerBox key={q.id} label={`Check ${i + 1} · ${q.stem.slice(0, 80)}${q.stem.length > 80 ? '…' : ''}`} a={typeof v === 'object' ? v : undefined} />; })}
        </div>
        <aside className="card pad stack-sm sendbox">
          <span className="eyebrow">Module {def.number} grades</span>
          {g ? <>
            <div className="row spread small"><span>Outcome</span><b className="ink">{g.outcome.grade}</b></div>
            <div className="row spread small"><span>Judgement</span><b className="ink">{g.judgement.grade}</b></div>
            <div className="row spread small"><span>Check questions</span><b className="ink">{def.check.filter(q => q.kind === 'mcq' && m.check[q.id] === q.answer).length} / {def.check.filter(q => q.kind === 'mcq').length}</b></div>
            <p className="small muted">{g.verdict}</p>
          </> : <p className="small muted">{m.completed ? (h.gradeError ? 'Grading failed for this hand-in.' : 'Grading…') : 'Not graded: the module wasn’t finished.'}</p>}
        </aside>
      </div>}
    </>}
  </section>;
}
