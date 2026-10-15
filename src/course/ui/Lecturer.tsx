import { useRef, useState } from 'react';
import type { ArchetypeFile } from '../../ceo/archetypes';
import type { ModuleGrade } from '../grade';
import { courseById, SUBMISSION_REPO } from '../modules';
import { stats, validatePayload, verificationCode } from '../payload';
import { pdfName, submissionPdf } from '../pdf';
import { download } from '../progress';
import { findAllSealed, unseal } from '../seal';
import type { Payload } from '../types';
import { gradesFor } from './Submit';

// The lecturer's inbox. Hand-ins are public GitHub issues holding sealed codes; this page reads them, opens each with
// the private key file (which never leaves this browser), and rebuilds each student's PDF here.

interface Row { issue?: number; url?: string; author?: string; payload: Payload; code: string; superseded: number; grades?: Record<string, ModuleGrade | null> }
interface Failure { source: string; reason: string }
const KEY = 'gcm:course:lecturer-key';
const csvCell = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : s; };

async function loadIssues(): Promise<{ number: number; html_url: string; user?: { login: string }; body: string | null }[]> {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const r = await fetch(`https://api.github.com/repos/${SUBMISSION_REPO}/issues?state=all&per_page=100&page=${page}`, { headers: { Accept: 'application/vnd.github+json' } });
    if (r.status === 403) throw new Error('GitHub’s rate limit for this network was reached. Try again in an hour, or paste the codes below.');
    if (!r.ok) throw new Error(`GitHub returned ${r.status}.`);
    const batch = await r.json() as { number: number; html_url: string; user?: { login: string }; body: string | null; pull_request?: unknown }[];
    out.push(...batch.filter(i => !i.pull_request && i.body?.includes('GCM1.')));
    if (batch.length < 100) break;
  }
  return out;
}

export default function Lecturer({ archetypes }: { archetypes: ArchetypeFile | null }) {
  const [key, setKey] = useState<JsonWebKey | null>(() => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } });
  const [remember, setRemember] = useState(() => { try { return !!localStorage.getItem(KEY); } catch { return false; } });
  const [rows, setRows] = useState<Row[]>([]), [failures, setFailures] = useState<Failure[]>([]);
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [pasted, setPasted] = useState('');
  const file = useRef<HTMLInputElement>(null);

  const loadKey = async (text: string) => {
    setError('');
    try {
      const jwk = JSON.parse(text) as JsonWebKey;
      await crypto.subtle.importKey('jwk', jwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']);
      setKey(jwk); if (remember) try { localStorage.setItem(KEY, JSON.stringify(jwk)); } catch { /* memory only */ }
    } catch { setError('That isn’t a course private key file.'); }
  };
  const forget = () => { setKey(null); setRemember(false); try { localStorage.removeItem(KEY); } catch { /* nothing stored */ } };

  async function open(entries: { source: string; text: string; issue?: number; url?: string; author?: string }[]) {
    if (!key) return;
    const found: Row[] = [], failed: Failure[] = [];
    for (const e of entries) {
      const codes = findAllSealed(e.text);
      if (!codes.length) { failed.push({ source: e.source, reason: 'No sealed code found.' }); continue; }
      for (const c of codes) {
        try {
          const v = validatePayload(await unseal(c, key));
          if (!v.ok) failed.push({ source: e.source, reason: v.error });
          else found.push({ issue: e.issue, url: e.url, author: e.author, payload: v.payload, code: await verificationCode(v.payload), superseded: 0 });
        } catch (err) { failed.push({ source: e.source, reason: err instanceof Error ? err.message : 'Could not be opened.' }); }
      }
    }
    // One row per student (by ID, else name): the latest hand-in counts.
    const latest = new Map<string, Row>();
    for (const r of found.sort((a, b) => a.payload.submittedAt.localeCompare(b.payload.submittedAt))) {
      const k = (r.payload.student.id || r.payload.student.name).toLowerCase(), prev = latest.get(k);
      latest.set(k, { ...r, superseded: prev ? prev.superseded + 1 : 0 });
    }
    setRows([...latest.values()].sort((a, b) => a.payload.student.name.localeCompare(b.payload.student.name)));
    setFailures(failed);
  }
  const fromGitHub = async () => {
    setBusy('Reading hand-ins from GitHub…'); setError('');
    try { const issues = await loadIssues(); await open(issues.map(i => ({ source: `Issue #${i.number}`, text: i.body ?? '', issue: i.number, url: i.html_url, author: i.user?.login }))); }
    catch (e) { setError(e instanceof Error ? e.message : 'GitHub could not be read.'); }
    setBusy('');
  };
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
    const head = ['Name', 'Student ID', 'Email', 'Issue', 'Submitted', 'Modules complete', 'Typed responses', 'Words', 'Pasted answers', 'Verification', 'Grades'];
    const lines = rows.map(r => { const s = stats(r.payload); return [r.payload.student.name, r.payload.student.id, r.payload.student.email, r.issue ?? '', r.payload.submittedAt, s.completed, s.responses, s.words, s.pasted, r.code, r.grades ? Object.entries(r.grades).filter(([, g]) => g).map(([id, g]) => `${id}: outcome ${g!.outcome.grade}, judgement ${g!.judgement.grade}`).join('; ') : ''].map(csvCell).join(','); });
    download('going-concern-hand-ins.csv', [head.join(','), ...lines].join('\n'), 'text/csv');
  };

  return <section className="stack-lg">
    <div className="banner"><div className="stack-sm"><span className="eyebrow">Lecturer</span><h1>Hand-ins</h1>
      <p className="muted lede">Students hand in sealed codes as issues on <a href={`https://github.com/${SUBMISSION_REPO}/issues?q=label%3Asubmission`} target="_blank" rel="noopener noreferrer">{SUBMISSION_REPO}</a>. Load the course private key to open them. The key stays in this browser.</p></div></div>
    <div className="card pad stack-sm">
      <span className="eyebrow">Course key</span>
      {key ? <div className="row"><span className="c-tag good">Key loaded</span><button className="link" onClick={forget}>Forget the key</button></div>
        : <div className="row">
          <button className="btn primary" onClick={() => file.current?.click()}>Load private key file</button>
          <label className="check small"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} /><span>Remember on this device</span></label>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={async e => { const f = e.target.files?.[0]; if (f) await loadKey(await f.text()); e.target.value = ''; }} />
        </div>}
    </div>
    {key && <div className="card pad stack-sm">
      <div className="row"><button className="btn primary" disabled={!!busy} onClick={fromGitHub}>Load hand-ins from GitHub</button>
        <button className="btn" disabled={!!busy || !rows.length || !archetypes} onClick={gradeAll}>Replay all grades</button>
        <button className="btn" disabled={!rows.length} onClick={csv}>Export CSV</button></div>
      <details><summary className="small">Or paste sealed codes</summary>
        <textarea rows={4} value={pasted} onChange={e => setPasted(e.target.value)} placeholder="GCM1.pilot.… (one or many)" />
        <button className="btn" disabled={!pasted.trim() || !!busy} onClick={() => open([{ source: 'Pasted codes', text: pasted }])}>Open pasted codes</button>
      </details>
    </div>}
    {busy && <p className="c-notice" role="status">{busy}</p>}
    {error && <p className="c-notice" role="alert">{error}</p>}
    {rows.length > 0 && <div className="card"><div className="table-wrap"><table className="years inbox">
      <thead><tr><th>Student</th><th>Issue</th><th>Submitted</th><th>Modules</th><th>Typed</th><th>Pasted</th><th>Grades</th><th>Verification</th><th></th></tr></thead>
      <tbody>{rows.map(r => { const s = stats(r.payload); return <tr key={r.code}>
        <th><b>{r.payload.student.name}</b><span className="small muted mono"> {r.payload.student.id}</span>{r.superseded > 0 && <span className="small muted"> · {r.superseded} earlier</span>}</th>
        <td>{r.issue ? <a href={r.url} target="_blank" rel="noopener noreferrer">#{r.issue}</a> : '–'}</td>
        <td className="mono small">{r.payload.submittedAt.slice(0, 16).replace('T', ' ')}</td>
        <td>{s.completed} / {courseById(r.payload.course).modules.length}</td>
        <td>{s.responses} · {s.words.toLocaleString('en-GB')} words</td>
        <td>{s.pasted ? <span className="flag">{s.pasted}</span> : '–'}</td>
        <td className="small">{r.grades ? Object.entries(r.grades).filter(([, g]) => g).map(([id, g]) => <div key={id}>{id}: {g!.outcome.grade} / {g!.judgement.grade}</div>) : '–'}</td>
        <td className="mono small">{r.code}</td>
        <td><button className="btn small-btn" disabled={!!busy || !archetypes} onClick={() => pdf(r)}>PDF</button></td>
      </tr>; })}</tbody>
    </table></div></div>}
    {failures.length > 0 && <div className="card pad stack-sm"><span className="eyebrow">Couldn’t be opened</span><ul className="list small">{failures.map((f, i) => <li key={i}><b>{f.source}:</b> {f.reason}</li>)}</ul></div>}
  </section>;
}
