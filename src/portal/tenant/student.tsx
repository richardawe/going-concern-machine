import { useEffect, useMemo, useState } from 'react';
import type { ArchetypeFile } from '../../ceo/archetypes';
import { moduleStart } from '../../course/grade';
import { moduleById } from '../../course/modules';
import { buildPayload, stats } from '../../course/payload';
import { complete } from '../../course/text';
import { emptyModule } from '../../course/progress';
import { MIN_WORDS, type ModuleDef, type ModuleProgress } from '../../course/types';
import ModuleRunner from '../../course/ui/ModuleRunner';
import { api, errorText, useLoad } from '../api';
import { Link, navigate } from '../router';
import { Action, Empty, Loading, Notice, plural, ukDateTime } from '../ui';
import type { Me } from './TenantApp';
import { saveLabel, useCourseProgress } from './useCourseProgress';

// The student pages: my courses, joining, a course's modules, a module, and handing in.

interface MyCourse { id: string; code: string; title: string; term: string; lecturer: string; modules: string[]; dueAt: string | null; extended: boolean; complete: number; started: boolean; handedInAt: string | null; late: boolean | null; changedSinceHandIn: boolean }
interface Receipt { code: string; handedInAt: string; late: boolean; attempt: number; graded: boolean; gradeError: boolean; modulesComplete: number }
interface CourseDetail { id: string; code: string; title: string; term: string; lecturer: string; modules: string[]; snapshotId: string; dueAt: string | null; dueText: string | null; extended: boolean; latePolicy: 'flag' | 'block'; archived: boolean; handIn: Receipt | null }

const dueTag = (iso: string | null) => {
  if (!iso) return null;
  const hours = (Date.parse(iso) - Date.now()) / 3.6e6;
  return <span className={`c-tag ${hours < 0 ? 'bad' : hours < 48 ? 'warn' : ''}`}>{hours < 0 ? `Was due ${ukDateTime(iso)}` : `Due ${ukDateTime(iso)}`}</span>;
};

export function MyCourses({ me }: { me: Me }) {
  const { data, error, loading } = useLoad<MyCourse[]>('/api/my/courses');
  const [code, setCode] = useState(''), [joinError, setJoinError] = useState('');
  const join = async () => {
    setJoinError('');
    try { const r = await api<{ courseId: string }>('/api/join', { body: { code } }); navigate(`/courses/${r.courseId}`); }
    catch (e) { setJoinError(errorText(e)); }
  };
  return <section className="stack-lg">
    <div className="banner">
      <div className="stack-sm"><span className="eyebrow">My courses</span><h1>Hello{me.name ? `, ${me.name.split(' ')[0]}` : ''}</h1></div>
      <form className="row" onSubmit={e => { e.preventDefault(); void join(); }}>
        <label className="sr-only" htmlFor="join-code">Course code</label>
        <input id="join-code" className="code-field" placeholder="Course code, e.g. KX7-42Q" value={code} onChange={e => setCode(e.target.value)} />
        <button className="btn" disabled={code.trim().length < 4}>Join</button>
      </form>
    </div>
    {joinError && <Notice kind="error">{joinError}</Notice>}
    {loading && !data && <Loading />}
    {error && <Notice kind="error">{error.message}</Notice>}
    {data && !data.length && <Empty>You haven’t joined a course yet. Use the join link your lecturer shared, or type the course code above.</Empty>}
    {data && data.length > 0 && <div className="mods">{data.map(c => <Link key={c.id} to={`/courses/${c.id}`} className="card mod">
      <div className="row spread"><span className="eyebrow">{c.code}{c.term ? ` · ${c.term}` : ''}</span>{c.handedInAt ? <span className={`c-tag ${c.changedSinceHandIn ? 'warn' : 'good'}`}>{c.changedSinceHandIn ? 'Changed since hand-in' : 'Handed in'}</span> : dueTag(c.dueAt)}</div>
      <h3>{c.title}</h3>
      <span className="small muted">{c.lecturer}</span>
      <div className="progress"><i style={{ width: `${Math.round(100 * c.complete / c.modules.length)}%` }} /></div>
      <span className="small">{c.complete} of {c.modules.length} modules complete{c.extended ? ' · extension' : ''}</span>
    </Link>)}</div>}
  </section>;
}

export function JoinPage({ code }: { code: string }) {
  const [error, setError] = useState('');
  useEffect(() => { api<{ courseId: string }>('/api/join', { body: { code } }).then(r => navigate(`/courses/${r.courseId}`, { replace: true })).catch(e => setError(errorText(e))); }, [code]);
  return <section className="stack">{error ? <><Notice kind="error">{error}</Notice><Link to="/">Go to my courses</Link></> : <Loading what="Joining the course…" />}</section>;
}

function moduleStatus(def: ModuleDef, m: ModuleProgress | undefined) {
  if (!m) return { tag: '~45 min', cls: '', pct: 0, note: 'Not started' };
  if (m.stage === 'complete') return { tag: 'Complete', cls: 'good', pct: 100, note: 'Ready to hand in' };
  const concepts = def.concepts.filter(c => complete(m.concepts[c.id], MIN_WORDS.concept)).length;
  const note = m.stage === 'concepts' || m.stage === 'briefing' ? `Concept ${Math.min(concepts + 1, def.concepts.length)} of ${def.concepts.length}` : m.stage === 'decisions' ? `Year ${m.decisions.length + 1} of 5` : m.stage === 'debrief' ? 'Debrief' : 'End-of-module check';
  const pct = Math.round(100 * (concepts + m.decisions.length + (m.reflection ? 1 : 0) + Object.keys(m.check).length) / (def.concepts.length + 5 + 1 + def.check.length));
  return { tag: 'In progress', cls: 'accent', pct, note };
}

/** Course home, a module, and the hand-in page share one loaded course and one autosaving progress store. */
export function CoursePages({ me, courseId, view, moduleId }: { me: Me; courseId: string; view: 'home' | 'module' | 'hand-in'; moduleId?: string }) {
  const course = useLoad<CourseDetail>(`/api/courses/${courseId}`);
  const snapshot = useLoad<ArchetypeFile>(course.data ? `/api/courses/${courseId}/snapshot` : null);
  const progress = useCourseProgress(me.id, courseId);
  const c = course.data, def = view === 'module' && moduleId ? moduleById(moduleId) : undefined;
  const start = useMemo(() => { try { return def && snapshot.data ? moduleStart(def, snapshot.data) : null; } catch { return null; } }, [def, snapshot.data]);
  useEffect(() => { document.title = `${def ? `${def.title} · ` : ''}${c ? c.title : 'Course'} · Going Concern Lab`; }, [c, def]);

  if (course.error) return <section className="stack"><Notice kind="error">{course.error.message}</Notice><Link to="/">Back to my courses</Link></section>;
  if (!c || !progress.loaded) return <Loading />;
  const save = <span className={`saved-state ${progress.state}`} role="status">{saveLabel(progress.state)}{progress.error ? `: ${progress.error}` : ''}</span>;

  if (view === 'module') {
    if (!def || !c.modules.includes(def.id)) return <Notice kind="error">That module isn’t part of this course. <Link to={`/courses/${c.id}`}>Back to the course</Link></Notice>;
    return <div className="stack">
      <div className="row spread small"><Link to={`/courses/${c.id}`}>← {c.code} modules</Link>{save}</div>
      <ModuleRunner def={def} progress={progress.modules[def.id] ?? emptyModule()} update={f => progress.update(def.id, f, emptyModule)}
        start={start} startError={snapshot.error?.message || (snapshot.data && !start ? 'The company for this module could not be built.' : '')}
        home={() => navigate(`/courses/${c.id}`)} submit={() => navigate(`/courses/${c.id}/hand-in`)} />
    </div>;
  }
  if (view === 'hand-in') return <HandIn me={me} course={c} modules={progress.modules} flush={progress.flush} reload={() => course.reload(true)} save={save} />;

  const list = c.modules.map(id => moduleById(id)!).filter(Boolean), done = list.filter(m => progress.modules[m.id]?.stage === 'complete').length;
  return <section className="stack-lg">
    <div className="banner">
      <div className="stack-sm"><span className="eyebrow">{c.code}{c.term ? ` · ${c.term}` : ''}</span><h1>{c.title}</h1><p className="muted">{c.lecturer}{c.dueText ? ` · hand in by ${c.dueText}${c.extended ? ' (your extension)' : ''}` : ''}</p></div>
      <div className="row"><span className="c-tag accent">{done} of {list.length} complete</span><Link className="btn" to={`/courses/${c.id}/hand-in`}>Hand in</Link></div>
    </div>
    {c.handIn && <Notice kind="good">Handed in {ukDateTime(c.handIn.handedInAt)}{c.handIn.late ? ' (late)' : ''} · verification <span className="mono">{c.handIn.code}</span>. <Link to={`/courses/${c.id}/hand-in`}>See your receipt</Link></Notice>}
    <div className="mods">{list.map(m => { const s = moduleStatus(m, progress.modules[m.id]); return <Link key={m.id} className="card mod" to={`/courses/${c.id}/m/${m.id}`}>
      <div className="row spread"><span className="eyebrow">Module {m.number} · {m.topic}</span><span className={`c-tag ${s.cls}`}>{s.tag}</span></div>
      <h3>{m.title}</h3><p className="small">{m.summary}</p>
      <div className="progress"><i style={{ width: `${s.pct}%` }} /></div><span className="small muted mono">{s.note}</span>
    </Link>; })}</div>
    <div className="small">{save}</div>
  </section>;
}

function HandIn({ me, course: c, modules, flush, reload, save }: { me: Me; course: CourseDetail; modules: Record<string, ModuleProgress>; flush: () => Promise<void>; reload: () => void; save: React.ReactNode }) {
  const [receipt, setReceipt] = useState<Receipt | null>(c.handIn), [agree, setAgree] = useState(false), [error, setError] = useState('');
  const draft = buildPayload({ course: c.id, student: { name: me.name, id: me.studentId, email: me.email }, modules }, { id: c.id, code: c.code, title: c.title, lecturer: c.lecturer, modules: c.modules }, new Date().toISOString());
  const s = stats(draft), late = !!c.dueAt && Date.now() > Date.parse(c.dueAt), blocked = late && c.latePolicy === 'block';

  // Grading takes a few seconds after handing in; check until the PDF is ready.
  useEffect(() => {
    if (!receipt || receipt.graded || receipt.gradeError) return;
    const t = setInterval(() => api<{ handIn: Receipt }>(`/api/courses/${c.id}/hand-in`).then(r => { if (r.handIn) setReceipt(r.handIn); }).catch(() => {}), 2500);
    return () => clearInterval(t);
  }, [receipt, c.id]);

  const handIn = async () => {
    setError('');
    await flush();
    const r = await api<Receipt>(`/api/courses/${c.id}/hand-in`, { body: { confirm: true } });
    setReceipt(r); setAgree(false); reload();
  };

  return <section className="stack-lg">
    <div className="banner"><div className="stack-sm"><span className="eyebrow">Hand in · {c.code}</span><h1>{receipt ? 'Handed in' : 'Hand in your work'}</h1>
      <p className="muted lede">Your lecturer sees your work as soon as you hand it in. {c.dueText ? `It’s due ${c.dueText}${c.extended ? ' (your extension)' : ''}.` : ''}</p></div></div>
    {receipt && <div className="receipt card pad stack-sm">
      <span className="eyebrow">Receipt</span>
      <div className="row spread"><b className="ink">{c.title} · {c.code}</b><span className="small">{ukDateTime(receipt.handedInAt)} UK time{receipt.late ? ' · late' : ''}{receipt.attempt > 1 ? ` · attempt ${receipt.attempt}` : ''}</span></div>
      <span className="small muted">Verification code</span><code className="vcode big">{receipt.code}</code>
      <span className="small">{plural(receipt.modulesComplete, 'module')} complete. A copy of this receipt has been emailed to you.</span>
      <div className="row">{receipt.graded ? <a className="btn primary" href={`/api/courses/${c.id}/hand-in.pdf`}>Download PDF</a> : receipt.gradeError ? <span className="small warn-text">Your PDF can’t be built right now. Your hand-in is safe; your lecturer can see it.</span> : <span className="small muted" role="status">Preparing your PDF…</span>}
        <Link className="btn" to={`/courses/${c.id}`}>Back to the course</Link></div>
      <p className="small muted">If your course also uses Canvas, upload the PDF there. Its verification code matches this one.</p>
    </div>}
    <div className="submit">
      <div className="card pad stack">
        <span className="eyebrow">What you’re handing in</span>
        <div className="table-wrap"><table className="years">
          <thead><tr><th>Module</th><th>Status</th><th>Typed responses</th><th>Pasted</th></tr></thead>
          <tbody>{c.modules.map(id => { const def = moduleById(id)!, m = draft.modules.find(x => x.id === id), st = m && stats({ ...draft, modules: [m] });
            return <tr key={id}><th>{def.number} · {def.title}</th><td>{!m ? 'Not started' : m.completed ? 'Complete' : 'In progress'}</td><td>{st ? `${st.responses} · ${st.words} words` : '–'}</td><td>{st?.pasted ? <span className="flag">{st.pasted}</span> : '–'}</td></tr>; })}</tbody>
        </table></div>
        <p className="small muted">{s.completed} of {c.modules.length} modules complete · {s.responses} typed responses · {s.words.toLocaleString('en-GB')} words. Unfinished modules are handed in as they are.</p>
      </div>
      <aside className="card pad stack sendbox">
        <div className="stack-sm small"><span className="muted">Handing in as</span><b className="ink">{me.name || <span className="warn-text">No name yet</span>}</b><span className="muted">{me.email}{me.studentId ? ` · ${me.studentId}` : ''}</span>
          {!me.name && <Link to="/account">Add your name on the Account page</Link>}</div>
        <label className="check"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} /><span>I confirm these answers are my own work.</span></label>
        {blocked && <Notice kind="warn">The deadline has passed and this course doesn’t accept late work. Ask your lecturer for an extension.</Notice>}
        {late && !blocked && <Notice kind="warn">The deadline has passed. You can still hand in, and it will be marked as late.</Notice>}
        <Action className="btn primary" disabled={!agree || !me.name || blocked || !s.responses || c.archived} run={() => handIn().catch(e => { setError(errorText(e)); throw e; })}>{receipt ? 'Hand in again' : 'Hand it in'}</Action>
        {receipt && <span className="small muted">Handing in again replaces your earlier hand-in.</span>}
        {error && <span className="sr-only">{error}</span>}
        <div className="small">{save}</div>
      </aside>
    </div>
  </section>;
}
