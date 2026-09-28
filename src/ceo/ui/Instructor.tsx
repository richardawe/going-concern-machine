import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Dices, Download, Link2, Upload } from 'lucide-react';
import { archetypeLabels, type ArchetypeFile, type ArchetypeId } from '../archetypes';
import { assignmentUrl, decodeAssignment, encodeAssignment, newAssignmentId, type Assignment, type CompanyChoice } from '../challenge';
import { cohortCsv, parseSubmissions, scoreCohort, type Cohort, type CohortRow, type Parsed, type Submission } from '../cohort';
import { cases } from '../cases';
import { prepareStart, realCompanies } from '../company';
import type { CaseDef, StartCompany } from '../types';
import { startFor } from './load';

// The instructor's page. Assignments fix one world for a class; results links come back through the course's own
// submission box, get pasted here, and are graded in this browser. Nothing is uploaded anywhere.
const STORAGE = 'gcm:ceo:v1:assignments';
interface SavedAssignment { code: string; created: string }
const readSaved = (): SavedAssignment[] => { try { const x = JSON.parse(localStorage.getItem(STORAGE) || '[]'); return Array.isArray(x) ? x.filter(a => typeof a?.code === 'string' && decodeAssignment(a.code)) : []; } catch { return []; } };
const writeSaved = (list: SavedAssignment[]) => { try { localStorage.setItem(STORAGE, JSON.stringify(list.slice(0, 30))); } catch { /* Storage is optional. */ } };
const REAL: Record<string, string> = { MSFT: 'Microsoft', WMT: 'Walmart', JPM: 'JPMorgan Chase' };
const pct = (p: number) => `${Math.round(p * 100)}%`;

export default function Instructor({ archetypes }: { archetypes: ArchetypeFile | null }) {
  const [saved, setSaved] = useState<SavedAssignment[]>(readSaved);
  const [selected, setSelected] = useState<string>(() => readSaved()[0]?.code ?? '');
  const remember = (code: string) => { const next = [{ code, created: new Date().toISOString().slice(0, 10) }, ...saved.filter(a => a.code !== code)]; setSaved(next); writeSaved(next); setSelected(code); };
  return <section className="instructor" aria-labelledby="instructor-title">
    <h2 id="instructor-title" className="ceo-section-title">Instructor view</h2>
    <p className="instructor-lead">Set a class assignment, collect results links through your usual submission box, then paste them here to grade the class. Grades are recomputed from each student’s decisions in this browser; nothing is uploaded.</p>
    <Builder archetypes={archetypes} onCreate={remember} />
    <Review archetypes={archetypes} saved={saved} selected={selected} setSelected={setSelected} />
  </section>;
}

function Builder({ archetypes, onCreate }: { archetypes: ArchetypeFile | null; onCreate: (code: string) => void }) {
  const [title, setTitle] = useState(''), [caseId, setCaseId] = useState(cases[0].id), [kind, setKind] = useState<'fictional' | 'real'>('fictional');
  const caseDef = cases.find(c => c.id === caseId)!, available = archetypes?.archetypes.map(a => a.id) ?? [];
  const [archetype, setArchetype] = useState<ArchetypeId | null>(null), [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e6)), [ticker, setTicker] = useState('MSFT');
  const industry = archetype ?? (available.includes(caseDef.archetype) ? caseDef.archetype : available[0]);
  const choice: CompanyChoice = kind === 'real' ? { kind: 'real', ticker } : { kind: 'fictional', archetype: industry, seed };
  const [preview, setPreview] = useState(''), [link, setLink] = useState(''), [status, setStatus] = useState('');
  useEffect(() => { let live = true; setPreview(''); if (archetypes && (kind === 'real' || industry)) startFor(choice, archetypes).then(s => live && setPreview(`${s.name} · ${s.tagline}`)).catch(() => live && setPreview('')); return () => { live = false; }; }, [archetypes, JSON.stringify(choice)]);
  const create = () => {
    const code = encodeAssignment({ id: newAssignmentId(), title: title.trim() || `${caseDef.title}`, caseId, choice });
    const url = assignmentUrl(code); setLink(url); setStatus(''); onCreate(code);
    navigator.clipboard?.writeText(url).then(() => setStatus('Link copied. Share it with your class.'), () => setStatus('Copy the link below and share it with your class.'));
  };
  return <section className="instructor-card" aria-labelledby="builder-title">
    <h3 id="builder-title" className="panel-title">1 · CREATE A CLASS ASSIGNMENT</h3>
    <div className="builder-grid">
      <label>Assignment title<input value={title} maxLength={80} onChange={e => setTitle(e.target.value)} placeholder={`e.g. Week 4: ${caseDef.title}`} /></label>
      <label>Scenario<select value={caseId} onChange={e => { setCaseId(e.target.value); setArchetype(null); }}>{cases.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
      <label>Company<select value={kind} onChange={e => setKind(e.target.value as 'fictional' | 'real')}><option value="fictional">Fictional company</option><option value="real">Real company opening</option></select></label>
      {kind === 'fictional' ? <label>Industry<select value={industry ?? ''} onChange={e => setArchetype(e.target.value as ArchetypeId)}>{archetypes?.archetypes.map(a => <option key={a.id} value={a.id}>{archetypeLabels[a.id]}</option>)}</select></label>
        : <label>Company<select value={ticker} onChange={e => setTicker(e.target.value)}>{Object.keys(realCompanies).map(t => <option key={t} value={t}>{REAL[t] ?? t}</option>)}</select></label>}
    </div>
    <p className="builder-preview">Every student will run <strong>{preview || '…'}</strong> in <strong>{caseDef.title}</strong>. {kind === 'fictional' && <button className="text-button" onClick={() => setSeed(Math.floor(Math.random() * 1e6))}><Dices size={13} /> Different company</button>}</p>
    <button className="primary-button" onClick={create} disabled={!archetypes}><Link2 size={14} /> Create assignment link</button>
    {link && <><input className="share-url" aria-label="Assignment link" readOnly value={link} onFocus={e => e.currentTarget.select()} /><small role="status">{status}</small></>}
  </section>;
}

type Sort = { key: 'name' | 'judgement' | 'outcome'; dir: 1 | -1 };
function Review({ archetypes, saved, selected, setSelected }: { archetypes: ArchetypeFile | null; saved: SavedAssignment[]; selected: string; setSelected: (c: string) => void }) {
  const [text, setText] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [result, setResult] = useState<{ cohort: Cohort; parsed: Parsed; assignment?: Assignment } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const load = async (e: ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); e.target.value = ''; };
  const grade = async () => {
    setError(''); setResult(null);
    const assignment = selected ? decodeAssignment(selected) ?? undefined : undefined;
    const parsed = parseSubmissions(text, assignment);
    if (!parsed.submissions.length) { setError(parsed.rejected.length ? 'None of the pasted links could be graded for this assignment; see the reasons below.' : 'Paste at least one results link.'); setResult(parsed.rejected.length ? { cohort: { rows: [], patterns: [], caseTitle: '', company: '', strategies: 0 }, parsed, assignment } : null); return; }
    if (!archetypes) { setError('Industries are still loading; try again in a moment.'); return; }
    setBusy(true);
    try {
      const first = parsed.submissions[0], caseDef = first.caseDef as CaseDef;
      const start = prepareStart(await startFor(first.choice, archetypes), caseDef.setup);
      const cohort = await gradeInWorker(start, caseDef, parsed.submissions);
      setResult({ cohort, parsed, assignment });
    } catch (e) { setError(e instanceof Error ? e.message : 'Grading failed.'); } finally { setBusy(false); }
  };
  return <section className="instructor-card" aria-labelledby="review-title">
    <h3 id="review-title" className="panel-title">2 · GRADE SUBMISSIONS</h3>
    <div className="builder-grid">
      <label>Assignment<select value={selected} onChange={e => setSelected(e.target.value)}>
        <option value="">Any (use the most common scenario and company)</option>
        {saved.map(a => { const d = decodeAssignment(a.code)!; return <option key={a.code} value={a.code}>{d.title} · created {a.created}</option>; })}
      </select></label>
    </div>
    <label className="paste-label">Results links, one per line, or pasted straight from an export<textarea value={text} onChange={e => setText(e.target.value)} rows={6} placeholder="https://…#/ceo?challenge=…" /></label>
    <div className="review-actions">
      <button onClick={() => file.current?.click()}><Upload size={14} /> Load a .txt or .csv file</button>
      <input ref={file} type="file" accept=".txt,.csv,text/plain,text/csv" hidden onChange={load} aria-label="Results file" />
      <button className="primary-button" onClick={grade} disabled={busy}>{busy ? 'Grading…' : 'Grade the class'}</button>
    </div>
    {error && <p className="notice" role="alert">{error}</p>}
    {result && <Results {...result} />}
  </section>;
}

function gradeInWorker(start: StartCompany, caseDef: CaseDef, submissions: Submission[]): Promise<Cohort> {
  return new Promise(resolve => {
    const onPage = () => setTimeout(() => resolve(scoreCohort(start, caseDef, submissions)), 30);
    try {
      const w = new Worker(new URL('../cohort.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<Cohort>) => { resolve(e.data); w.terminate(); };
      w.onerror = () => { w.terminate(); onPage(); };
      w.postMessage({ start, caseDef, submissions });
    } catch { onPage(); }
  });
}

function Results({ cohort, parsed, assignment }: { cohort: Cohort; parsed: Parsed; assignment?: Assignment }) {
  const [sort, setSort] = useState<Sort>({ key: 'judgement', dir: -1 });
  const rows = useMemo(() => [...cohort.rows].sort((a, b) => sort.dir * (sort.key === 'name' ? a.name.localeCompare(b.name) : sort.key === 'judgement' ? a.judgement.percentile - b.judgement.percentile : a.outcome.score - b.outcome.score)), [cohort, sort]);
  const n = cohort.rows.length;
  const median = n ? [...cohort.rows].sort((a, b) => a.judgement.percentile - b.judgement.percentile)[Math.floor((n - 1) / 2)].judgement : null;
  const count = (t: string) => cohort.rows.filter(r => r.verdict === t).length;
  const download = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([cohortCsv(cohort)], { type: 'text/csv' })); a.download = `ceo-class-${(assignment?.title ?? cohort.caseTitle).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`; a.click(); URL.revokeObjectURL(a.href); };
  const header = (key: Sort['key'], label: string) => <th scope="col" aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}><button className="sort-button" onClick={() => setSort({ key, dir: sort.key === key ? (sort.dir === 1 ? -1 : 1) : key === 'name' ? 1 : -1 })}>{label}{sort.key === key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}</button></th>;
  return <div className="cohort">
    {n > 0 && <>
      <div className="cohort-head"><div><span className="eyebrow">{(assignment?.title ?? 'CLASS RESULTS').toUpperCase()}</span><h3>{cohort.caseTitle} · {cohort.company}</h3></div><button onClick={download}><Download size={14} /> Export CSV</button></div>
      <dl className="cohort-tiles">
        <div><dt>Students graded</dt><dd>{n}</dd></div>
        <div><dt>Median judgement</dt><dd>{median ? `${median.grade} · ${pct(median.percentile)}` : '—'}</dd></div>
        <div><dt>Sound decisions, unlucky outcome</dt><dd>{count('Sound decisions, unlucky outcome')}</dd></div>
        <div><dt>A lucky result</dt><dd>{count('A lucky result')}</dd></div>
      </dl>
      <Scatter rows={cohort.rows} />
      <div className="cohort-table-wrap"><table className="impact-table cohort-table"><thead><tr>{header('name', 'Student')}{header('judgement', 'Judgement')}{header('outcome', 'Outcome')}<th scope="col">Verdict</th>{cohort.rows[0].decisions.map((_, i) => <th key={i} scope="col">Year {i + 1}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}><th scope="row">{r.name}{r.duplicate && <small className="dup"> duplicate name</small>}</th><td>{r.judgement.grade} · {pct(r.judgement.percentile)}</td><td>{r.outcome.grade} · {r.outcome.score}</td><td>{r.verdict}</td>{r.decisions.map((d, j) => <td key={j} className="decision-cell">{d}</td>)}</tr>)}</tbody></table></div>
      <section aria-labelledby="patterns-title"><h4 id="patterns-title" className="panel-title">WHAT THE CLASS CHOSE, YEAR BY YEAR</h4>
        <p className="muted small">Each card, how many students played it, and their average judgement percentile. The judgement benchmark ranks against {cohort.strategies} card strategies across 12 worlds.</p>
        <div className="patterns">{cohort.patterns.map(p => <table key={p.year} className="impact-table"><caption>Year {p.year}</caption><thead><tr><th scope="col">Choice</th><th scope="col">Students</th><th scope="col">Avg judgement</th></tr></thead><tbody>{p.choices.map(c => <tr key={c.label}><th scope="row">{c.label}</th><td>{c.count}</td><td>{pct(c.judgement)}</td></tr>)}</tbody></table>)}</div>
      </section>
    </>}
    {parsed.rejected.length > 0 && <details className="rejected" open={n === 0}><summary>{parsed.rejected.length} link{parsed.rejected.length === 1 ? '' : 's'} not graded</summary><ul>{parsed.rejected.map(r => <li key={r.entry}>Entry {r.entry}: {r.reason}</li>)}</ul></details>}
  </div>;
}

/** Judgement (how good the choices were) against outcome (how it turned out), one dot per student. */
function Scatter({ rows }: { rows: CohortRow[] }) {
  const box = useRef<HTMLDivElement>(null), [W, setW] = useState(640), [hover, setHover] = useState<number | null>(null);
  useEffect(() => { const el = box.current; if (!el) return; const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width)))); ro.observe(el); return () => ro.disconnect(); }, []);
  const H = Math.min(360, Math.max(260, W * .5)), L = 46, R = 14, T = 12, B = 40;
  const x = (p: number) => L + p * (W - L - R), y = (p: number) => T + (1 - p) * (H - T - B);
  const h = hover == null ? null : rows[hover];
  return <section className="scatter" aria-labelledby="scatter-title">
    <h4 id="scatter-title" className="panel-title">JUDGEMENT VS OUTCOME</h4>
    <p className="muted small">Right means better choices across the possible worlds; up means a better result in the world played. Bottom-right students were unlucky; top-left were lucky.</p>
    <div className="chart-wrap" ref={box}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Judgement against outcome percentile for ${rows.length} students`} onMouseLeave={() => setHover(null)}>
        <rect className="zone" x={x(.7)} y={y(.45)} width={x(1) - x(.7)} height={y(0) - y(.45)} /><rect className="zone" x={x(0)} y={y(1)} width={x(.45) - x(0)} height={y(.7) - y(1)} />
        <text className="zone-label" x={x(.98)} y={y(.03)} textAnchor="end">Sound, unlucky</text><text className="zone-label" x={x(.02)} y={y(.95)}>Lucky</text>
        <text className="zone-label" x={x(.98)} y={y(.95)} textAnchor="end">Sound, paid off</text><text className="zone-label" x={x(.02)} y={y(.03)}>Weak choices, weak result</text>
        {[0, .5, 1].map(t => <g key={t} className="grid"><line x1={x(t)} x2={x(t)} y1={T} y2={H - B} /><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} /><text x={x(t)} y={H - B + 16} textAnchor="middle">{pct(t)}</text><text x={L - 8} y={y(t) + 4} textAnchor="end">{pct(t)}</text></g>)}
        <text className="axis-title" x={(L + W - R) / 2} y={H - 4} textAnchor="middle">Judgement percentile</text>
        <text className="axis-title" transform={`translate(12 ${(T + H - B) / 2}) rotate(-90)`} textAnchor="middle">Outcome percentile</text>
        {rows.map((r, i) => <circle key={i} className={`student-dot ${hover === i ? 'active' : ''}`} cx={x(r.judgement.percentile)} cy={y(r.outcome.percentile)} r={hover === i ? 7 : 5} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} role="img" aria-label={`${r.name}: judgement ${pct(r.judgement.percentile)}, outcome ${pct(r.outcome.percentile)}`} />)}
      </svg>
      {h && <div className="chart-tip" style={{ left: x(h.judgement.percentile) > W * .6 ? x(h.judgement.percentile) - 196 : x(h.judgement.percentile), top: y(h.outcome.percentile) }}><strong>{h.name}</strong><span>Judgement<b>{h.judgement.grade} · {pct(h.judgement.percentile)}</b></span><span>Outcome<b>{h.outcome.grade} · {h.outcome.score}</b></span><span>{h.verdict}</span></div>}
    </div>
  </section>;
}
