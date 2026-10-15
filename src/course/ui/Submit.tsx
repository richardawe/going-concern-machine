import { useState } from 'react';
import type { ArchetypeFile } from '../../ceo/archetypes';
import { moduleStart, type ModuleGrade } from '../grade';
import { moduleById } from '../modules';
import { buildPayload, stats, verificationCode } from '../payload';
import { pdfName, submissionPdf } from '../pdf';
import { addToInbox, download, readHandin, saveHandin, type Handin } from '../progress';
import type { Course, Payload, Progress } from '../types';
import { grade } from './grading';

/** Grades for every finished module in a submission, replayed in a worker. */
export async function gradesFor(payload: Payload, archetypes: ArchetypeFile): Promise<Record<string, ModuleGrade | null>> {
  const out: Record<string, ModuleGrade | null> = {};
  for (const m of payload.modules) {
    const def = moduleById(m.id)!;
    out[m.id] = m.completed && m.decisions.length ? (await grade('grade', def.id, moduleStart(def, archetypes), m.decisions.map(d => d.card))).grade : null;
  }
  return out;
}

export default function Submit({ course, progress, archetypes, home, lecturer }: { course: Course; progress: Progress; archetypes: ArchetypeFile | null; home: () => void; lecturer: string }) {
  const [handin, setHandin] = useState<Handin | null>(() => readHandin(course.id));
  const [agree, setAgree] = useState(false), [busy, setBusy] = useState(''), [error, setError] = useState(''), [at, setAt] = useState('');
  const draft = buildPayload(progress, course, new Date().toISOString()), s = stats(draft);
  const details = !!progress.student.name.trim() && !!progress.student.id.trim();
  const changed = !!handin && (JSON.stringify(handin.payload.modules) !== JSON.stringify(draft.modules) || JSON.stringify(handin.payload.student) !== JSON.stringify(draft.student));

  const handIn = async () => {
    setBusy('Handing in…'); setError('');
    try {
      const payload = buildPayload(progress, course, new Date().toISOString()), h = { payload, code: await verificationCode(payload) };
      if (!addToInbox(h)) throw new Error('This browser blocked saving the hand-in. Allow site data for this page and try again.');
      saveHandin(course.id, h); setHandin(h); setAt(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) { setError(e instanceof Error ? e.message : 'Handing in failed.'); }
    setBusy('');
  };
  const pdf = async () => {
    if (!handin || !archetypes) return;
    setBusy('Building your PDF…'); setError('');
    try { download(pdfName(course, handin.payload), await submissionPdf({ payload: handin.payload, course, code: handin.code, grades: await gradesFor(handin.payload, archetypes) }) as BlobPart, 'application/pdf'); }
    catch (e) { setError(e instanceof Error ? e.message : 'The PDF could not be built.'); }
    setBusy('');
  };
  const done = !!handin && !changed;

  return <section className="stack-lg">
    <div className="banner"><div className="stack-sm"><span className="eyebrow">Hand in · {course.code}</span><h1>Hand in your work</h1>
      <p className="muted lede">Hand in your work and it appears on your lecturer’s page straight away. Then download the PDF and upload it to Canvas. Both show the same verification code.</p></div></div>
    <div className="submit">
      <div className="card pad stack">
        <span className="eyebrow">What you are handing in</span>
        <div className="table-wrap"><table className="years">
          <thead><tr><th>Module</th><th>Status</th><th>Typed responses</th><th>Pasted</th></tr></thead>
          <tbody>{course.modules.map(id => { const def = moduleById(id)!, m = draft.modules.find(x => x.id === id), st = m && stats({ ...draft, modules: [m] });
            return <tr key={id}><th>{def.number} · {def.title}</th><td>{!def.ready ? 'Coming soon' : !m ? 'Not started' : m.completed ? 'Complete' : 'In progress'}</td><td>{st ? `${st.responses} · ${st.words} words` : '–'}</td><td>{st?.pasted ? <span className="flag">{st.pasted}</span> : '–'}</td></tr>; })}</tbody>
        </table></div>
        <p className="small muted">{s.completed} module{s.completed === 1 ? '' : 's'} complete · {s.responses} typed responses · {s.words.toLocaleString('en-GB')} words. Unfinished modules are handed in as they are and marked in progress.</p>
        {!details && <p className="c-notice">Add your full name and student ID on the <button className="link" onClick={home}>modules page</button> first.</p>}
      </div>
      <aside className="card pad stack sendbox">
        <label className="check"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} /><span>I confirm these answers are my own work.</span></label>
        <div className={`hstep ${done ? 'done' : 'now'}`}><i>1</i><div className="stack-sm"><b>Hand it in</b>
          <button className="btn primary" disabled={!agree || !details || !!busy || !s.responses} onClick={handIn}>{handin ? 'Hand in again' : 'Hand it in'}</button>
          {changed && <span className="small warn-text">You’ve changed your work since handing in. Hand in again so your lecturer sees the latest version.</span>}
          {done && <span className="small" role="status">Handed in{at ? ` at ${at}` : ''}. <a href={lecturer}>Open the lecturer page</a></span>}
          {handin && <><span className="small muted">Verification code</span><code className="vcode">{handin.code}</code></>}
        </div></div>
        {handin && <div className={`hstep ${done ? 'now' : ''}`}><i>2</i><div className="stack-sm"><b>Download the PDF for Canvas</b>
          <button className="btn" disabled={!archetypes || !!busy} onClick={pdf}>Download PDF</button>
          <span className="small muted">{pdfName(course, handin.payload)}</span>
        </div></div>}
        {busy && <p className="small" role="status">{busy}</p>}
        {error && <p className="c-notice" role="alert">{error}</p>}
      </aside>
    </div>
  </section>;
}
