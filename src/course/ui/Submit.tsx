import { useEffect, useState } from 'react';
import type { ArchetypeFile } from '../../ceo/archetypes';
import { moduleStart, type ModuleGrade } from '../grade';
import { moduleById, SUBMISSION_REPO } from '../modules';
import { buildPayload, stats, verificationCode } from '../payload';
import { pdfName, submissionPdf } from '../pdf';
import { download, readHandin, saveHandin, type Handin } from '../progress';
import { seal } from '../seal';
import type { Course, Payload, Progress } from '../types';
import { grade } from './grading';

/** The course's public key, published with the site by `npm run course:keygen`. */
async function publicKey(): Promise<JsonWebKey> {
  const r = await fetch(`${import.meta.env.BASE_URL}course/submission-key.json`, { cache: 'no-cache' });
  if (!r.ok) throw new Error('The course key isn’t published yet, so work can’t be sealed. Ask your lecturer.');
  return (await r.json()).publicKey;
}
/** Grades for every finished module in a submission, replayed in a worker. */
export async function gradesFor(payload: Payload, archetypes: ArchetypeFile): Promise<Record<string, ModuleGrade | null>> {
  const out: Record<string, ModuleGrade | null> = {};
  for (const m of payload.modules) {
    const def = moduleById(m.id)!;
    out[m.id] = m.completed && m.decisions.length ? (await grade('grade', def.id, moduleStart(def, archetypes), m.decisions.map(d => d.card))).grade : null;
  }
  return out;
}
const issueUrl = (course: Course, sealed: string) => {
  const base = `https://github.com/${SUBMISSION_REPO}/issues/new?template=submission.yml&title=${encodeURIComponent(`Hand-in ${course.code}`)}`;
  const filled = `${base}&sealed=${encodeURIComponent(sealed)}`;
  return filled.length < 7500 ? { url: filled, prefilled: true } : { url: base, prefilled: false };
};

export default function Submit({ course, progress, archetypes, home }: { course: Course; progress: Progress; archetypes: ArchetypeFile | null; home: () => void }) {
  const [handin, setHandin] = useState<Handin | null>(() => readHandin(course.id));
  const [agree, setAgree] = useState(false), [busy, setBusy] = useState(''), [error, setError] = useState(''), [copied, setCopied] = useState('');
  const draft = buildPayload(progress, course, new Date().toISOString()), s = stats(draft);
  const details = !!progress.student.name.trim() && !!progress.student.id.trim();
  const changed = !!handin && (JSON.stringify(handin.payload.modules) !== JSON.stringify(draft.modules) || JSON.stringify(handin.payload.student) !== JSON.stringify(draft.student));
  useEffect(() => { setCopied(''); }, [handin?.code]);

  const doSeal = async () => {
    setBusy('Sealing…'); setError('');
    try {
      const payload = buildPayload(progress, course, new Date().toISOString());
      const h = { payload, sealed: await seal(payload, course.id, await publicKey()), code: await verificationCode(payload) };
      saveHandin(course.id, h); setHandin(h);
    } catch (e) { setError(e instanceof Error ? e.message : 'Sealing failed.'); }
    setBusy('');
  };
  const copy = async () => {
    if (!handin) return;
    try { await navigator.clipboard.writeText(handin.sealed); setCopied('Copied. Paste it into the hand-in form.'); }
    catch { const el = document.getElementById('sealed-code') as HTMLTextAreaElement | null; el?.select(); setCopied('Selected. Copy it with Ctrl+C or ⌘C.'); }
  };
  const pdf = async () => {
    if (!handin || !archetypes) return;
    setBusy('Building your PDF…'); setError('');
    try { download(pdfName(course, handin.payload), await submissionPdf({ payload: handin.payload, course, code: handin.code, grades: await gradesFor(handin.payload, archetypes) }) as BlobPart, 'application/pdf'); }
    catch (e) { setError(e instanceof Error ? e.message : 'The PDF could not be built.'); }
    setBusy('');
  };
  const issue = handin && issueUrl(course, handin.sealed);

  return <section className="stack-lg">
    <div className="banner"><div className="stack-sm"><span className="eyebrow">Hand in · {course.code}</span><h1>Hand in your work</h1>
      <p className="muted lede">Your work is sealed (encrypted) in this browser and handed in through GitHub, which passes it to your lecturer. Then download the PDF and upload it to Canvas. Both show the same verification code.</p></div></div>
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
        <div className={`hstep ${handin && !changed ? 'done' : 'now'}`}><i>1</i><div className="stack-sm"><b>Seal your work</b><span className="small muted">Encrypted here, so only your lecturer can read it.</span>
          <button className="btn primary" disabled={!agree || !details || !!busy || !s.responses} onClick={doSeal}>{handin && !changed ? 'Seal again' : 'Seal my work'}</button>
          {changed && <span className="small warn-text">You’ve changed your work since sealing. Seal again before handing in.</span>}
        </div></div>
        {handin && <>
          <div className="hstep now"><i>2</i><div className="stack-sm"><b>Hand in on GitHub</b>
            <span className="small muted">{issue!.prefilled ? 'The form opens with your sealed code filled in. Press Create.' : 'Copy the code, open the form, paste it into the box and press Create.'} You need to be signed in to GitHub. Don’t add your name: the page is public.</span>
            <textarea id="sealed-code" className="sealed" readOnly value={handin.sealed} rows={4} onFocus={e => e.currentTarget.select()} />
            <div className="row"><button className="btn" onClick={copy}>Copy sealed code</button><a className="btn primary" href={issue!.url} target="_blank" rel="noopener noreferrer">Open the hand-in form ↗</a></div>
            {copied && <span className="small" role="status">{copied}</span>}
          </div></div>
          <div className="hstep"><i>3</i><div className="stack-sm"><b>Check your receipt</b><span className="small muted">Within a minute or two a reply on your issue confirms it with this verification code:</span><code className="vcode">{handin.code}</code></div></div>
          <hr />
          <button className="btn" disabled={!archetypes || !!busy} onClick={pdf}>Download PDF for Canvas</button>
          <span className="small muted">{pdfName(course, handin.payload)}</span>
        </>}
        {busy && <p className="small" role="status">{busy}</p>}
        {error && <p className="c-notice" role="alert">{error}</p>}
      </aside>
    </div>
  </section>;
}
