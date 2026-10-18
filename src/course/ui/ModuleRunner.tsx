import { useEffect, useMemo, useState } from 'react';
import { play } from '../../ceo/game';
import type { StartCompany } from '../../ceo/types';
import { money, percent } from '../../presentation';
import { caseFor, moduleGame } from '../grade';
import { complete } from '../text';
import { MIN_WORDS, type Answer, type ModuleDef, type ModuleProgress, type Stage } from '../types';
import { figures } from '../figures';
import { grade, type Graded } from './grading';
import IsoFigure from './IsoFigure';
import TypedAnswer from './TypedAnswer';

const STAGES: { id: Stage; label: string }[] = [{ id: 'briefing', label: 'Briefing' }, { id: 'concepts', label: 'Concepts' }, { id: 'decisions', label: 'Decisions' }, { id: 'debrief', label: 'Debrief' }, { id: 'check', label: 'Check' }];
const order = (s: Stage) => s === 'complete' ? STAGES.length : STAGES.findIndex(x => x.id === s);

export default function ModuleRunner({ def, progress, update, start, startError, home, submit }: {
  def: ModuleDef; progress: ModuleProgress; update: (f: (m: ModuleProgress) => ModuleProgress) => void;
  start: StartCompany | null; startError: string; home: () => void; submit: () => void;
}) {
  const go = (stage: Stage) => { update(m => ({ ...m, stage })); window.scrollTo(0, 0); };
  const reached = order(progress.stage);
  return <section className="module" aria-label={def.title}>
    <div className="module-head">
      <div><span className="eyebrow">Module {def.number} · {def.topic} · {def.concepts.length} concepts</span><h1>{def.title}</h1></div>
      <ol className="stepper" aria-label="Module stages">
        {STAGES.map((s, i) => <li key={s.id} className={i < reached ? 'done' : i === reached ? 'now' : ''} aria-current={i === reached ? 'step' : undefined}>{s.label}</li>)}
      </ol>
    </div>
    {progress.stage === 'briefing' && <Briefing def={def} start={start} startError={startError} begin={() => go('concepts')} />}
    {progress.stage === 'concepts' && <Concepts def={def} progress={progress} update={update} done={() => go('decisions')} />}
    {progress.stage === 'decisions' && (start ? <Decisions def={def} start={start} progress={progress} update={update} done={() => go('debrief')} /> : <p className="c-notice">{startError || 'Loading the company…'}</p>)}
    {progress.stage === 'debrief' && start && <Debrief def={def} start={start} progress={progress} update={update} done={() => go('check')} />}
    {progress.stage === 'check' && <Check def={def} progress={progress} update={update} finish={() => { update(m => ({ ...m, stage: 'complete', completedAt: new Date().toISOString() })); window.scrollTo(0, 0); }} />}
    {progress.stage === 'complete' && <Complete def={def} progress={progress} home={home} submit={submit} />}
  </section>;
}

function Briefing({ def, start, startError, begin }: { def: ModuleDef; start: StartCompany | null; startError: string; begin: () => void }) {
  const caseDef = caseFor(def);
  return <div className="two-col">
    <div className="stack">
      <div className="card c-memo"><span className="eyebrow">Board briefing</span><p>{caseDef.briefing}</p></div>
      <div className="card pad stack-sm">
        <span className="eyebrow">By the end of this module you can</span>
        <ul className="list">{def.outcomes.map(o => <li key={o}>{o}</li>)}</ul>
      </div>
      <div className="row"><button className="btn primary" onClick={begin}>Start concept 1 →</button><span className="muted small">About 45 minutes. Your work saves in this browser as you go.</span></div>
    </div>
    <aside className="stack">
      <div className="card pad stack-sm">
        <span className="eyebrow">Your company</span>
        {start ? <><h3>{start.name}</h3><p className="small">{start.tagline}</p><p className="small muted">A fictional company. Its figures are calibrated on real filers in its industry; its future is hypothetical.</p></> : <p className="small muted">{startError || 'Loading…'}</p>}
      </div>
      <div className="card pad stack-sm">
        <span className="eyebrow">How this module works</span>
        <ol className="list small">
          <li><b>8 concepts.</b> Explore each on the figure, then explain it in your own words (at least {MIN_WORDS.concept} words).</li>
          <li><b>5 decisions.</b> One a year, each with a reason (at least {MIN_WORDS.reason} words).</li>
          <li><b>Debrief.</b> See how it turned out, and reflect.</li>
          <li><b>Check.</b> 3 multiple-choice and 4 typed questions (at least {MIN_WORDS.check} words each).</li>
        </ol>
      </div>
    </aside>
  </div>;
}

function Concepts({ def, progress, update, done }: { def: ModuleDef; progress: ModuleProgress; update: (f: (m: ModuleProgress) => ModuleProgress) => void; done: () => void }) {
  const i = Math.min(progress.concept, def.concepts.length - 1), c = def.concepts[i], last = i === def.concepts.length - 1;
  const [lever, setLever] = useState(c.lever);
  useEffect(() => setLever(c.lever), [c.id]);
  const answered = (k: number) => complete(progress.concepts[def.concepts[k].id], MIN_WORDS.concept);
  const open = (k: number) => { update(m => ({ ...m, concept: k })); };
  return <div className="play">
    {def.figure && <IsoFigure spec={figures[def.figure]} value={lever} onChange={setLever} title={def.figureTitle} figure={def.number} />}
    <div className="stack">
      <nav className="rail" aria-label="Concepts">
        {def.concepts.map((k, n) => <button key={k.id} className={n === i ? 'now' : answered(n) ? 'done' : ''} disabled={n > i && !def.concepts.slice(0, n).every((_, x) => answered(x))} onClick={() => open(n)} aria-current={n === i ? 'step' : undefined}>{answered(n) && n !== i ? '✓' : n + 1} {k.short}</button>)}
      </nav>
      <div className="card pad stack">
        <span className="eyebrow">Concept {i + 1} of {def.concepts.length}</span>
        <h2>{c.title}</h2>
        <p>{c.body}</p>
        {c.formula && <p className="formula">{c.formula}</p>}
        <div className="task"><span className="eyebrow">On the figure</span><span>{c.task}</span></div>
        <TypedAnswer key={c.id} label="In your own words · required" prompt={c.prompt} min={MIN_WORDS.concept} value={progress.concepts[c.id]}
          onChange={a => update(m => ({ ...m, concepts: { ...m.concepts, [c.id]: a } }))} />
        <div className="row spread">
          <button className="btn" disabled={i === 0} onClick={() => open(i - 1)}>← Concept {i}</button>
          <button className="btn primary" disabled={!answered(i)} onClick={() => last ? done() : open(i + 1)}>{last ? 'Save and go to the decisions →' : 'Save and continue →'}</button>
        </div>
      </div>
    </div>
  </div>;
}

function YearTable({ records, currency }: { records: ReturnType<typeof play>; currency: string }) {
  return <div className="table-wrap"><table className="years">
    <thead><tr><th></th>{records.map(r => <th key={r.year}>{r.year === 0 ? 'Start' : `Year ${r.year}`}</th>)}</tr></thead>
    <tbody>
      <tr><th>Revenue</th>{records.map(r => <td key={r.year}>{money(r.state.revenue, currency)}</td>)}</tr>
      <tr><th>Gross margin</th>{records.map(r => <td key={r.year}>{percent(r.state.grossMargin)}</td>)}</tr>
      <tr><th>Operating profit</th>{records.map(r => <td key={r.year} className={r.state.operatingProfit < 0 ? 'neg' : ''}>{money(r.state.operatingProfit, currency)}</td>)}</tr>
      <tr><th>Free cash flow</th>{records.map(r => <td key={r.year} className={r.state.freeCashFlow < 0 ? 'neg' : ''}>{money(r.state.freeCashFlow, currency)}</td>)}</tr>
      <tr><th>Cash</th>{records.map(r => <td key={r.year}>{money(r.state.cash, currency)}{r.emergency > 0 && <small className="neg"> loan</small>}</td>)}</tr>
    </tbody>
  </table></div>;
}

function Decisions({ def, start, progress, update, done }: { def: ModuleDef; start: StartCompany; progress: ModuleProgress; update: (f: (m: ModuleProgress) => ModuleProgress) => void; done: () => void }) {
  const caseDef = caseFor(def), n = caseDef.turns.length, played = progress.decisions.length;
  const records = useMemo(() => play(moduleGame(def, start, progress.decisions.map(d => d.card))), [def, start, progress.decisions]);
  const turn = caseDef.turns[played], draft = progress.draft ?? {}, currency = start.baseline.currency;
  const chosen = draft.card !== undefined, ready = chosen && complete(draft.reason, MIN_WORDS.reason);
  const setDraft = (d: Partial<NonNullable<ModuleProgress['draft']>>) => update(m => ({ ...m, draft: { ...m.draft, ...d } }));
  const playYear = () => update(m => ({ ...m, decisions: [...m.decisions, { card: draft.card ?? null, reason: draft.reason! }], draft: undefined }));
  const lastYear = records.at(-1)!;
  return <div className="stack">
    <div className="years-track" aria-label={`Year ${Math.min(played + 1, n)} of ${n}`}>{caseDef.turns.map((t, k) => <i key={t.year} className={k < played ? 'on' : k === played ? 'now' : ''} />)}</div>
    {played > 0 && <div className="card pad stack-sm">
      <span className="eyebrow">Year {played} · what happened</span>
      <ul className="c-headlines">{lastYear.headlines.map((h, k) => <li key={k} className={h.tone}>{h.text}</li>)}</ul>
      {lastYear.pending.length > 0 && <p className="small muted">Still to come: {lastYear.pending.join('; ')}.</p>}
      <YearTable records={records} currency={currency} />
    </div>}
    {turn ? <div className="two-col">
      <div className="stack">
        <div className="card c-memo"><span className="eyebrow">Year {turn.year} · board memo</span><p>{turn.memo}</p></div>
        <div className="choices" role="radiogroup" aria-label={`Year ${turn.year} decision`}>
          {[...turn.cards, null].map(c => <button key={c?.id ?? 'hold'} role="radio" aria-checked={draft.card === (c?.id ?? null)} className="choice" onClick={() => setDraft({ card: c?.id ?? null })}>
            <span className="fn">{c?.fn ?? 'hold'}</span><span><b>{c?.title ?? 'Hold course'}</b><span>{c?.pitch ?? 'Make no new move this year. Sometimes that is the hardest decision to beat.'}</span></span>
          </button>)}
        </div>
      </div>
      <div className="card pad stack">
        <TypedAnswer key={`reason-${turn.year}`} label="Why this decision? · required" prompt="Name the concept you are relying on, and say what you expect to happen to cash." min={MIN_WORDS.reason} rows={5} value={draft.reason}
          onChange={a => setDraft({ reason: a })} />
        <div className="row spread"><span className="small muted">{chosen ? 'Decisions are final once a year is played.' : 'Choose a card, or hold course.'}</span><button className="btn primary" disabled={!ready} onClick={playYear}>Play year {turn.year} →</button></div>
      </div>
    </div> : <div className="row"><button className="btn primary" onClick={done}>See the debrief →</button><span className="muted small">All {n} years played.</span></div>}
  </div>;
}

function Debrief({ def, start, progress, update, done }: { def: ModuleDef; start: StartCompany; progress: ModuleProgress; update: (f: (m: ModuleProgress) => ModuleProgress) => void; done: () => void }) {
  const [result, setResult] = useState<Graded | null>(null), [error, setError] = useState('');
  const cards = progress.decisions.map(d => d.card);
  useEffect(() => { let live = true; grade('debrief', def.id, start, cards).then(r => { if (live) setResult(r); }).catch(e => { if (live) setError(e.message); }); return () => { live = false; }; }, [def.id, start, cards.join()]);
  const currency = start.baseline.currency, d = result?.debrief, g = result?.grade;
  const sumFcf = (r: { records: ReturnType<typeof play> }) => r.records.slice(1).reduce((s, x) => s + x.state.freeCashFlow, 0);
  return <div className="stack">
    {error && <p className="c-notice">{error}</p>}
    {!result && !error && <p className="c-notice">Replaying your five years against every other strategy…</p>}
    {g && d && <>
      <div className="c-grades">
        <div className="card pad"><span className="eyebrow">Outcome</span><b className="c-grade">{g.outcome.grade}</b><span className="small">Better than {Math.round(g.outcome.percentile * 100)}% of every possible strategy, in this world.</span></div>
        <div className="card pad"><span className="eyebrow">Judgement</span><b className="c-grade">{g.judgement.grade}</b><span className="small">Better than {Math.round(g.judgement.percentile * 100)}% of strategies, averaged across 12 possible worlds.</span></div>
        <div className="card pad"><span className="eyebrow">Verdict</span><b className="c-verdict">{g.verdict}</b><span className="small">Cash {money(g.startCash, currency)} → {money(g.finalCash, currency)}{g.emergencies ? `, with ${g.emergencies} emergency loan${g.emergencies > 1 ? 's' : ''}` : ''}.</span></div>
      </div>
      <div className="card pad stack-sm">
        <span className="eyebrow">Three futures</span>
        <div className="table-wrap"><table className="years">
          <thead><tr><th></th><th>Score</th><th>Final revenue</th><th>Final cash</th><th>Free cash flow, 5 years</th></tr></thead>
          <tbody>{[d.you, d.statusQuo, d.reference].map(o => <tr key={o.label}><th>{o.label}</th><td>{o.card.overall}</td><td>{money(o.records.at(-1)!.state.revenue, currency)}</td><td>{money(o.records.at(-1)!.state.cash, currency)}</td><td className={sumFcf(o) < 0 ? 'neg' : ''}>{money(sumFcf(o), currency)}</td></tr>)}</tbody>
        </table></div>
        {d.attribution.length > 0 && <><span className="eyebrow">What each decision did to your score</span>
          <ul className="attrib">{d.attribution.map(a => <li key={a.year}><span>Year {a.year}: {a.title}</span><b className={a.delta.overall < 0 ? 'neg' : 'pos'}>{a.delta.overall > 0 ? '+' : ''}{a.delta.overall.toFixed(1)}</b></li>)}</ul></>}
      </div>
      <div className="card pad stack-sm"><span className="eyebrow">Lessons</span><ul className="list">{d.lessons.map(l => <li key={l}>{l}</li>)}</ul></div>
    </>}
    <div className="card pad stack">
      <TypedAnswer label="Reflection · required" prompt={def.reflection} min={MIN_WORDS.reflection} value={progress.reflection} onChange={a => update(m => ({ ...m, reflection: a }))} />
      <div className="row spread"><span className="small muted">Your decisions and reasons are in your submission.</span><button className="btn primary" disabled={!complete(progress.reflection, MIN_WORDS.reflection)} onClick={done}>Go to the end-of-module check →</button></div>
    </div>
  </div>;
}

function Check({ def, progress, update, finish }: { def: ModuleDef; progress: ModuleProgress; update: (f: (m: ModuleProgress) => ModuleProgress) => void; finish: () => void }) {
  const caseDef = caseFor(def), checked = progress.checked;
  const answered = (id: string) => { const q = def.check.find(x => x.id === id)!, a = progress.check[id]; return q.kind === 'mcq' ? typeof a === 'number' : typeof a !== 'number' && complete(a, MIN_WORDS.check); };
  const count = def.check.filter(q => answered(q.id)).length, mcq = def.check.filter(q => q.kind === 'mcq');
  const right = mcq.filter(q => q.kind === 'mcq' && progress.check[q.id] === q.answer).length;
  const set = (id: string, v: number | Answer) => update(m => ({ ...m, check: { ...m.check, [id]: v } }));
  return <div className="quiz">
    <div className="stack">
      <p className="lede">Three multiple-choice questions and four typed answers of at least {MIN_WORDS.check} words. Multiple-choice answers get feedback when you check them. Typed answers go to your lecturer word for word, and you’ll see a model answer once you check.</p>
      {def.check.map((q, i) => {
        const a = progress.check[q.id];
        const personal = q.kind === 'text' ? q.personal : undefined, year = personal ? progress.decisions[personal.year - 1] : undefined;
        const chose = personal && year ? caseDef.turns[personal.year - 1].cards.find(c => c.id === year.card)?.title ?? 'Hold course' : null;
        return <div key={q.id} className="card pad stack-sm q">
          <div className="row spread"><span className="eyebrow">Q{i + 1} · {q.kind === 'mcq' ? 'Multiple choice' : 'Typed answer'}</span>
            {checked && (q.kind === 'mcq' ? <span className={`c-tag ${a === q.answer ? 'good' : 'bad'}`}>{a === q.answer ? 'Correct' : 'Not quite'}</span> : <span className="c-tag accent">Sent to your lecturer</span>)}</div>
          <p className="stem">{q.stem}</p>
          {chose && <p className="personal">In year {personal!.year} you chose: {chose}.</p>}
          {q.kind === 'mcq'
            ? <div className="opts" role="radiogroup">{q.options.map((o, k) => <label key={k} className={`opt ${checked ? (k === q.answer ? 'right' : a === k ? 'wrong' : '') : ''}`}><input type="radio" name={q.id} checked={a === k} disabled={checked} onChange={() => set(q.id, k)} /><span>{o}</span></label>)}</div>
            : <TypedAnswer key={q.id} label="Your answer" min={MIN_WORDS.check} value={typeof a === 'number' ? undefined : a} readOnly={checked} onChange={v => set(q.id, v)} />}
          {checked && <div className="feedback"><b>{q.kind === 'mcq' ? 'Why' : 'Model answer'}</b><span>{q.kind === 'mcq' ? q.why : q.model}</span></div>}
        </div>;
      })}
    </div>
    <aside className="card pad stack-sm sticky">
      <span className="eyebrow">Progress</span>
      <div className="qmap">{def.check.map((q, i) => <span key={q.id} className={checked ? (q.kind === 'mcq' ? (progress.check[q.id] === q.answer ? 'right' : 'wrong') : 'typed') : answered(q.id) ? 'ans' : ''}>{i + 1}</span>)}</div>
      <p className="small muted">{checked ? `Multiple choice: ${right} of ${mcq.length} correct. ${def.check.length - mcq.length} typed answers recorded.` : `${count} of ${def.check.length} complete`}</p>
      {!checked ? <button className="btn primary" disabled={count < def.check.length} onClick={() => update(m => ({ ...m, checked: true }))}>Check answers</button>
        : <button className="btn primary" onClick={finish}>Finish module →</button>}
      {!checked && <p className="small muted">Checking locks your answers.</p>}
    </aside>
  </div>;
}

function Complete({ def, progress, home, submit }: { def: ModuleDef; progress: ModuleProgress; home: () => void; submit: () => void }) {
  const typed = [...Object.values(progress.concepts), ...progress.decisions.map(d => d.reason), ...Object.values(progress.check).filter((a): a is Answer => typeof a !== 'number'), ...(progress.reflection ? [progress.reflection] : [])];
  return <div className="card pad stack done-card">
    <span className="eyebrow">Module {def.number} complete</span>
    <h2>Well done. {typed.length} typed responses, {typed.reduce((n, a) => n + a.words, 0).toLocaleString('en-GB')} words.</h2>
    <p>Hand in when you are ready. You can hand in after each module or once at the end; your lecturer uses your latest hand-in.</p>
    <div className="row"><button className="btn primary" onClick={submit}>Hand in →</button><button className="btn" onClick={home}>Back to modules</button></div>
  </div>;
}
