import { useEffect, useState } from 'react';
import type { ArchetypeFile } from '../../ceo/archetypes';
import type { ModuleGrade } from '../grade';
import { courseById } from '../modules';
import { stats } from '../payload';
import { pdfName, submissionPdf } from '../pdf';
import { clearInbox, download, INBOX_KEY, readInbox, type InboxEntry } from '../progress';
import { gradesFor } from './Submit';

// The lecturer's inbox. PROTOTYPE: hand-ins are read from this browser's storage, so they show up when the student
// hands in on the same browser (in another tab, they appear without a refresh). A server replaces this later.

type Row = InboxEntry & { grades?: Record<string, ModuleGrade | null> };
const csvCell = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : s; };
const sorted = () => readInbox().sort((a, b) => a.payload.student.name.localeCompare(b.payload.student.name));

export default function Lecturer({ archetypes }: { archetypes: ArchetypeFile | null }) {
  const [rows, setRows] = useState<Row[]>(sorted), [busy, setBusy] = useState(''), [error, setError] = useState('');
  // Keep grades already replayed for hand-ins that haven't changed.
  const reload = () => setRows(prev => sorted().map(e => ({ ...e, grades: prev.find(p => p.code === e.code)?.grades })));
  useEffect(() => {
    const f = (e: StorageEvent) => { if (e.key === INBOX_KEY || e.key === null) reload(); };
    addEventListener('storage', f); addEventListener('focus', reload);
    return () => { removeEventListener('storage', f); removeEventListener('focus', reload); };
  }, []);
  const gradeAll = async () => {
    if (!archetypes) return;
    for (let i = 0; i < rows.length; i++) {
      setBusy(`Replaying decisions: ${i + 1} of ${rows.length}…`);
      const grades = await gradesFor(rows[i].payload, archetypes);
      setRows(rs => rs.map((r, k) => k === i ? { ...r, grades } : r));
    }
    setBusy('');
  };
  const pdf = async (r: Row) => {
    if (!archetypes) return;
    setBusy(`Building ${r.payload.student.name}’s PDF…`);
    try {
      const grades = r.grades ?? await gradesFor(r.payload, archetypes), course = courseById(r.payload.course);
      download(pdfName(course, r.payload), await submissionPdf({ payload: r.payload, course, code: r.code, grades }) as BlobPart, 'application/pdf');
    } catch (e) { setError(e instanceof Error ? e.message : 'The PDF could not be built.'); }
    setBusy('');
  };
  const csv = () => {
    const head = ['Name', 'Student ID', 'Email', 'Handed in', 'Modules complete', 'Typed responses', 'Words', 'Pasted answers', 'Verification', 'Grades'];
    const lines = rows.map(r => { const s = stats(r.payload); return [r.payload.student.name, r.payload.student.id, r.payload.student.email, r.handedInAt, s.completed, s.responses, s.words, s.pasted, r.code, r.grades ? Object.entries(r.grades).filter(([, g]) => g).map(([id, g]) => `${id}: outcome ${g!.outcome.grade}, judgement ${g!.judgement.grade}`).join('; ') : ''].map(csvCell).join(','); });
    download('going-concern-hand-ins.csv', [head.join(','), ...lines].join('\n'), 'text/csv');
  };

  return <section className="stack-lg">
    <h1>Hand-ins</h1>
    <div className="card pad stack-sm">
      <div className="row"><button className="btn primary" disabled={!!busy} onClick={reload}>Refresh</button>
        <button className="btn" disabled={!!busy || !rows.length || !archetypes} onClick={gradeAll}>Replay all grades</button>
        <button className="btn" disabled={!rows.length} onClick={csv}>Export CSV</button>
        <span className="small muted">{rows.length} hand-in{rows.length === 1 ? '' : 's'}</span>
        {rows.length > 0 && <button className="link small" onClick={() => { clearInbox(); reload(); }}>Clear all</button>}</div>
      {!rows.length && <p className="small muted">No hand-ins yet. When a student hands in, their work appears here.</p>}
    </div>
    {busy && <p className="c-notice" role="status">{busy}</p>}
    {error && <p className="c-notice" role="alert">{error}</p>}
    {rows.length > 0 && <div className="card"><div className="table-wrap"><table className="years inbox">
      <thead><tr><th>Student</th><th>Handed in</th><th>Modules</th><th>Typed</th><th>Pasted</th><th>Grades</th><th>Verification</th><th></th></tr></thead>
      <tbody>{rows.map(r => { const s = stats(r.payload); return <tr key={r.code}>
        <th><b>{r.payload.student.name}</b><span className="small muted mono"> {r.payload.student.id}</span>{r.replaced > 0 && <span className="small muted"> · handed in {r.replaced + 1} times</span>}</th>
        <td className="mono small">{new Date(r.handedInAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
        <td>{s.completed} / {courseById(r.payload.course).modules.length}</td>
        <td>{s.responses} · {s.words.toLocaleString('en-GB')} words</td>
        <td>{s.pasted ? <span className="flag">{s.pasted}</span> : '–'}</td>
        <td className="small">{r.grades ? Object.entries(r.grades).filter(([, g]) => g).map(([id, g]) => <div key={id}>{id}: {g!.outcome.grade} / {g!.judgement.grade}</div>) : '–'}</td>
        <td className="mono small">{r.code}</td>
        <td><button className="btn small-btn" disabled={!!busy || !archetypes} onClick={() => pdf(r)}>PDF</button></td>
      </tr>; })}</tbody>
    </table></div></div>}
  </section>;
}
