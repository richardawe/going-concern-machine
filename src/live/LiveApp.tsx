import { lazy, Suspense, type ReactNode, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CircleAlert, CircleCheck, Focus, Gauge as GaugeIcon, Info, Newspaper, Pause, Play as PlayIcon, RotateCcw, TrendingUp, Wallet, X } from 'lucide-react';
import ThemeSwitch from '../components/ThemeSwitch';
import Inspector from '../components/Inspector';
import { leverRange, type CompanyChoice } from '../ceo/challenge';
import { prepareStart } from '../ceo/company';
import { gameScore } from '../ceo/assess';
import { defaultLevers, play, statusQuo } from '../ceo/game';
import { resolveCase, type SandboxConfig } from '../ceo/sandbox';
import type { Decision, Game, StartCompany, YearRecord } from '../ceo/types';
import Setup from '../ceo/ui/Setup';
import Briefing from '../ceo/ui/Briefing';
import DecisionDesk from '../ceo/ui/DecisionDesk';
import { startFor, useArchetypes } from '../ceo/ui/load';
import { money, percent } from '../presentation';
import { healthLabels, sceneFrame, type Health } from './frame';
import type { Labels, Part } from './scene/Campus';
import '../ceo/ui/ceo.css';
import './live.css';

// LIVE COMPANY (#/live): CEO mode's game, played on a 3D company campus. It reuses the game engine and the CEO mode
// screens as they are and keeps its own saved game, so CEO mode and the machine workbench are untouched.
const LiveScene = lazy(() => import('./scene/LiveScene'));
const STORAGE = 'gcm:live:v1';
const YEAR_MS = 2600;
type Stage = 'briefing' | 'play' | 'finale';
interface Saved { caseId: string; choice: CompanyChoice; sandbox?: SandboxConfig; decisions: Decision[]; stage: Stage }

const leverKeys = Object.keys(leverRange) as (keyof typeof leverRange)[];
function valid(s: unknown): s is Saved {
  const x = s as Saved, c = x && resolveCase(x.caseId, x.sandbox);
  if (!c || !['briefing', 'play', 'finale'].includes(x.stage) || !Array.isArray(x.decisions) || x.decisions.length > c.turns.length) return false;
  const ch = x.choice;
  if (!(ch?.kind === 'real' && typeof ch.ticker === 'string') && !(ch?.kind === 'fictional' && typeof ch.archetype === 'string' && Number.isFinite(ch.seed))) return false;
  return x.decisions.every((d, i) => (d.card === null || c.turns[i]?.cards.some(k => k.id === d.card)) && leverKeys.every(k => Number.isFinite(d.levers?.[k]) && d.levers[k] >= leverRange[k][0] && d.levers[k] <= leverRange[k][1]));
}
const read = (): Saved | null => { try { const s = JSON.parse(localStorage.getItem(STORAGE) || 'null'); return valid(s) ? s : null; } catch { return null; } };
const write = (s: Saved | null) => { try { if (s) localStorage.setItem(STORAGE, JSON.stringify(s)); else localStorage.removeItem(STORAGE); } catch { /* Storage is optional. */ } };
/** Same as CEO mode's "hold course": no card, standing levers unchanged, no one-off price or staffing move. */
const holdCourse = (game: Game, year: number): Decision => ({ card: null, levers: { ...(game.decisions[year - 2]?.levers ?? defaultLevers(game.start)), price: 0, workforce: 0 } });
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const hasWebGL = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } };

export default function LiveApp() {
  const [archetypes, loadError] = useArchetypes();
  const [error, setError] = useState('');
  useEffect(() => { if (loadError) setError(loadError); }, [loadError]);
  const [saved, setSaved] = useState<Saved | null>(read);
  const [start, setStart] = useState<StartCompany | null>(null);
  const update = (next: Saved | null) => { setSaved(next); write(next); };
  const caseDef = useMemo(() => saved ? resolveCase(saved.caseId, saved.sandbox) : undefined, [saved?.caseId, JSON.stringify(saved?.sandbox)]);
  useEffect(() => {
    setStart(null);
    if (!saved || !archetypes || !caseDef) return;
    let live = true;
    startFor(saved.choice, archetypes).then(s => { if (live) setStart(prepareStart(s, caseDef.setup)); }).catch(e => { if (live) { setError(e.message); update(null); } });
    return () => { live = false; };
  }, [caseDef, JSON.stringify(saved?.choice), archetypes]);
  const game: Game | null = useMemo(() => start && caseDef && saved ? { start, caseDef, seed: caseDef.seed, decisions: saved.decisions } : null, [start, caseDef, saved]);
  const ready = game && saved;

  return <main className="app-shell ceo-app live-app">
    <header className="masthead ceo-masthead">
      <div className="brand"><div className="edition">ECONOMIC SYSTEMS LAB <span>LIVE COMPANY / 3D</span> <ThemeSwitch /></div><h1>The Going Concern Machine</h1><p>Run the company and watch it live: every building, flow and figure on site is driven by the game’s numbers.</p></div>
      <nav className="ceo-nav"><a className="text-button back-link" href="#/ceo">CEO mode</a><a className="text-button back-link" href="#/"><ArrowLeft size={13} /> Company machines</a></nav>
    </header>
    {error && <div className="notice" role="alert">{error} <button className="text-button" onClick={() => setError('')}>Dismiss</button></div>}
    {!saved && (archetypes ? <Setup archetypes={archetypes} begin={(caseId, choice, sandbox) => { setError(''); update({ caseId, choice, sandbox, decisions: [], stage: 'briefing' }); }} /> : !error && <p className="empty-state">Loading industries…</p>)}
    {saved && !ready && !error && <p className="empty-state">Preparing your company…</p>}
    {ready && saved.stage === 'briefing' && <Briefing game={game} begin={() => update({ ...saved, stage: 'play' })} quit={() => update(null)} />}
    {ready && saved.stage !== 'briefing' && <LivePlay key={game.start.id + game.caseDef.id} game={game} finished={saved.stage === 'finale'}
      decide={d => update({ ...saved, decisions: [...saved.decisions, d] })} finish={() => update({ ...saved, stage: 'finale' })}
      again={() => update({ ...saved, decisions: [], stage: 'play' })} quit={() => update(null)} />}
    <footer className="ceo-footer">A training game on fictional or hypothetical futures. It is not financial advice or a forecast of any real company. The 3D scene changes no rules: it only draws the numbers the game computes.</footer>
  </main>;
}

function labelsFor(r: YearRecord, start: YearRecord, currency: string): Labels {
  const s = r.state;
  return {
    revenue: money(s.revenue, currency), momentum: signedInt(s.businessMomentum), cash: money(s.cash, currency), debt: money(s.debt, currency),
    staff: Math.round(r.people.headcount).toLocaleString('en-GB'), customers: `${(s.customers / start.state.customers * 100).toFixed(0)}% of Y0`,
  };
}

function LivePlay({ game, finished, decide, finish, again, quit }: { game: Game; finished: boolean; decide: (d: Decision) => void; finish: () => void; again: () => void; quit: () => void }) {
  const records = useMemo(() => play(game), [game]);
  const n = game.caseDef.turns.length, played = game.decisions.length, c = game.start.baseline.currency;
  const ghostRecords = useMemo(() => play({ ...game, decisions: statusQuo(game.start, Math.max(played, finished ? n : 0)) }), [game, played, finished, n]);
  const reduced = useMemo(reducedMotion, []), webgl = useMemo(hasWebGL, []);
  const [phase, setPhase] = useState<'decide' | 'running' | 'result'>(played === n ? 'result' : 'decide');
  const [ghostOn, setGhostOn] = useState(false);
  const [inspect, setInspect] = useState<string | null>(null);
  const [legend, setLegend] = useState(false), [reset, setReset] = useState(0);
  // The detail card follows the part under the pointer, else the part last clicked, else the company.
  const [hovered, setHovered] = useState<Part | null>(null), [selected, setSelected] = useState<Part | null>(null);
  const focus = hovered ?? selected;
  // Replay (after the last year): steps through the years beside the company that held course throughout.
  const [replay, setReplay] = useState<number | null>(null), [replaying, setReplaying] = useState(false);
  const [draft, setDraft] = useState(() => holdCourse(game, played + 1).levers);
  useEffect(() => { setDraft(holdCourse(game, played + 1).levers); if (played === 0) { setPhase('decide'); setReplay(null); setReplaying(false); } }, [played]);
  useEffect(() => { if (phase !== 'running') return; const t = setTimeout(() => setPhase('result'), reduced ? 0 : YEAR_MS); return () => clearTimeout(t); }, [phase, reduced]);
  useEffect(() => {
    if (!replaying || replay == null) return;
    if (replay >= played) { setReplaying(false); return; }
    const t = setTimeout(() => setReplay(replay + 1), reduced ? 1200 : YEAR_MS); return () => clearTimeout(t);
  }, [replaying, replay, played, reduced]);

  const year = replay ?? played, shown = records[year];
  const showGhost = replay != null || ghostOn;
  const you = useMemo(() => sceneFrame(game, records, year), [game, records, year]);
  const ghost = useMemo(() => showGhost && ghostRecords[year] ? sceneFrame(game, ghostRecords, year) : undefined, [showGhost, game, ghostRecords, year]);
  const health = you.health, board = gameScore(game, records).overall;
  const prev = records[Math.max(0, year - 1)];

  return <section className="live-play" aria-label="Live company">
    <div className="ceo-status">
      <div><span className="eyebrow">{game.caseDef.title.toUpperCase()}</span><strong>{game.start.name}</strong><small>{game.start.tagline}</small></div>
      <ol className="year-track" aria-label="Years">
        {Array.from({ length: n + 1 }, (_, i) => <li key={i} className={`${i === year ? 'current' : ''} ${i <= played ? 'done' : ''}`} aria-current={i === year ? 'step' : undefined}><span>{i === 0 ? 'Start' : `Y${i}`}</span></li>)}
      </ol>
      <div className="board-meter" title="What the board would score you if judged today.">
        <span className="eyebrow">BOARD CONFIDENCE</span>
        <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={board} aria-label="Board confidence"><i style={{ width: `${played ? board : 0}%` }} /></div>
        <strong>{played ? board : '—'}</strong>
      </div>
    </div>

    <div className={`live-stage ${health}`}>
      <div className="live-canvas">
        {webgl ? <Suspense fallback={<p className="live-loading">Building the site…</p>}>
          <LiveScene you={you} ghost={ghost} labels={labelsFor(shown, records[0], c)} reduced={reduced} youTitle={showGhost ? 'YOUR COMPANY' : undefined} reset={reset}
            interaction={{ pick: setSelected, hover: setHovered, hovered: focus }} />
        </Suspense> : <p className="live-loading">This browser cannot draw 3D (WebGL is off). The numbers around it still tell the story.</p>}
        {phase === 'running' && <div className="live-running" role="status"><span>PLAYING YEAR {played}…</span><small>{shown.headlines[0]?.text}</small></div>}
      </div>
      <div className="live-kpis" role="status" aria-live="polite">
        <Kpi icon={<TrendingUp size={16} />} label="Revenue" value={money(shown.state.revenue, c)} change={year ? shown.state.revenue / prev.state.revenue - 1 : null} sub={year === 0 ? 'starting position' : `year ${year}${replay != null ? ' · replay' : ''}`} />
        <Kpi icon={<Wallet size={16} />} label="Cash" value={money(shown.state.cash, c)} change={year ? (prev.state.cash ? shown.state.cash / prev.state.cash - 1 : null) : null} sub={`FCF ${money(shown.state.freeCashFlow, c)}`} bad={shown.state.freeCashFlow < 0} />
        <Kpi icon={<GaugeIcon size={16} />} label="Momentum" value={signedInt(shown.state.businessMomentum)} change={null} sub={healthLabels[health].toLowerCase()} bad={shown.state.businessMomentum < 0} />
      </div>
      <div className="live-map-tools">
        <button aria-label="Reset the view" title="Reset the view" onClick={() => setReset(r => r + 1)}><Focus size={15} /></button>
        <button aria-label={legend ? 'Hide the key' : 'What am I looking at?'} title="What am I looking at?" aria-expanded={legend} onClick={() => setLegend(!legend)}><Info size={15} /></button>
      </div>
      <DetailCard part={focus} pinned={selected != null && hovered == null} close={() => setSelected(null)} inspect={setInspect} record={shown} prev={prev} start={records[0]} health={health} company={game.start} board={played ? board : null} />
      {ghost && <div className="live-ghost-hud"><span className="eyebrow">HOLDING COURSE · YEAR {year}</span><span>Revenue <b>{money(ghostRecords[year].state.revenue, c)}</b></span><span>Cash <b>{money(ghostRecords[year].state.cash, c)}</b></span><span className={`live-health small ${ghost.health}`}>{healthLabels[ghost.health]}</span></div>}
      <YearStepper records={records} game={game} n={n} played={played} year={year} />
      <aside className="live-card live-news" aria-label="This year">
        <header><span className="live-card-icon"><Newspaper size={14} /></span><strong>{year === 0 ? 'Before you take the chair' : `Year ${year} at a glance`}</strong></header>
        <ul>{(year === 0 ? [{ text: game.caseDef.tagline, tone: 'neutral' as const }] : shown.headlines.length ? shown.headlines.slice(0, 3) : [{ text: 'A quiet year.', tone: 'neutral' as const }]).map(h => <li key={h.text} className={h.tone}><i />{h.text}</li>)}</ul>
        {shown.emergency > 0 && <p className="live-alarm"><CircleAlert size={13} /> Emergency loan {money(shown.emergency, c)}</p>}
        {replay == null && <label className="live-toggle"><input type="checkbox" checked={ghostOn} onChange={e => setGhostOn(e.target.checked)} /> Show the company that held course</label>}
      </aside>
      {legend && <Legend />}
    </div>

    {phase === 'decide' && played < n && <DecisionDesk key={played + 1} game={game} year={played + 1} levers={draft} setLevers={setDraft} commit={card => { decide({ card, levers: draft }); setPhase('running'); }} quit={quit} />}
    {phase === 'result' && !finished && played > 0 && <section className="year-result live-result" aria-labelledby="live-news">
      <Headlines record={records[played]} year={played} />
      <div className="impact"><button className="primary-button big" onClick={played < n ? () => setPhase('decide') : finish}>{played < n ? `Decide year ${played + 1}` : 'See how it ended'} <ArrowRight size={15} /></button></div>
    </section>}
    {finished && <Finale game={game} records={records} ghost={ghostRecords} replay={replay} replaying={replaying}
      watch={() => { setReplay(0); setReplaying(true); }} pause={() => setReplaying(!replaying)} scrub={y => { setReplaying(false); setReplay(y); }} exit={() => { setReplay(null); setReplaying(false); }} again={again} quit={quit} />}
    {inspect && <Inspector metric={inspect} state={shown.state} baseline={game.start.baseline} history={records.slice(0, year + 1).map(r => r.state)} close={() => setInspect(null)} />}
  </section>;
}

const signedInt = (x: number) => { const n = Math.round(x); return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}`; };
const signedPct = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)}%`;
function Kpi({ icon, label, value, change, sub, bad }: { icon: ReactNode; label: string; value: string; change: number | null; sub: string; bad?: boolean }) {
  return <div className="live-card live-kpi">
    <span className="live-card-icon">{icon}</span>
    <div><span className="live-kpi-label">{label}</span><strong className={bad ? 'neg' : ''}>{value}{change != null && Number.isFinite(change) && <em className={change < 0 ? 'down' : 'up'}>{signedPct(change)}</em>}</strong><small>{sub}</small></div>
  </div>;
}

type Row = [string, string, boolean?];
function DetailCard({ part, pinned, close, inspect, record: r, prev, start, health, company, board }: { part: Part | null; pinned: boolean; close: () => void; inspect: (m: string) => void; record: YearRecord; prev: YearRecord; start: YearRecord; health: Health; company: StartCompany; board: number | null }) {
  const s = r.state, c = company.baseline.currency, p = r.people;
  const growth = r.year ? s.revenue / prev.state.revenue - 1 : 0;
  const cards: Record<Part | 'company', { eyebrow: string; title: string; chip: string; rows: Row[]; note: string; metric?: string }> = {
    company: { eyebrow: company.tagline.toUpperCase(), title: company.name, chip: healthLabels[health], note: 'Point at a building, the flywheel, the cash silo, the debt hoist, the yard or the road to see what drives it.',
      rows: [['Free cash flow', money(s.freeCashFlow, c), s.freeCashFlow < 0], ['Debt', money(s.debt, c)], ['Staff', Math.round(p.headcount).toLocaleString('en-GB')], ['Morale', (p.morale * 100).toFixed(0), p.morale < .5], ['Customer activity', `${(s.customers / start.state.customers * 100).toFixed(0)}% of start`], ['Board confidence', board == null ? '—' : String(board)]] },
    revenue: { eyebrow: 'OFFICE TOWER', title: 'Revenue', chip: money(s.revenue, c), metric: 'revenue', note: 'One storey for every sixth of starting revenue. Lit windows show team productivity.',
      rows: [['Change on last year', r.year ? signedPct(growth) : '—', growth < 0], ['Operating profit', money(s.operatingProfit, c), s.operatingProfit < 0], ['Gross margin', percent(s.grossMargin)], ['Productivity', `${p.productivity.toFixed(2)}×`, p.productivity < .95]] },
    businessMomentum: { eyebrow: 'FLYWHEEL', title: 'Business momentum', chip: signedInt(s.businessMomentum), metric: 'businessMomentum', note: 'Spins faster as the business compounds; wobbles and slows as it decays.',
      rows: [...s.momentumParts].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, 4).map(m => [m.label, `${m.contribution > 0 ? '+' : ''}${m.contribution.toFixed(1)}`, m.contribution < 0] as Row) },
    cash: { eyebrow: 'CASH SILO', title: 'Cash reserve', chip: money(s.cash, c), metric: 'cash', note: 'The silo level is cash; amber flows in along the pipe with positive free cash flow, red drains out with negative.',
      rows: [['Free cash flow', money(s.freeCashFlow, c), s.freeCashFlow < 0], ['Runway', s.runway == null ? 'No burn' : `${s.runway.toFixed(0)} months`, s.runway != null], ['Dividends', money(s.dividends, c)], ['Emergency loan', r.emergency ? money(r.emergency, c) : 'None', r.emergency > 0]] },
    debt: { eyebrow: 'DEBT HOIST', title: 'Debt', chip: money(s.debt, c), metric: 'debt', note: 'Each red weight is debt worth a tenth of starting revenue.',
      rows: [['Interest this year', money(s.interestExpense, c)], ['Change on last year', money(s.debt - prev.state.debt, c), s.debt > prev.state.debt], ['Raised since start', money(r.raised, c)]] },
    staff: { eyebrow: 'YARD CREW', title: 'People', chip: Math.round(p.headcount).toLocaleString('en-GB'), note: 'Each figure is a slice of headcount. They move briskly when morale is high; leavers walk off site.',
      rows: [['Morale', (p.morale * 100).toFixed(0), p.morale < .5], ['Attrition', percent(p.attrition), p.attrition > company.params.baseAttrition * 1.3], ['Staffing vs need', `${(p.headcount / p.natural * 100).toFixed(0)}%`], ['Productivity', `${p.productivity.toFixed(2)}×`, p.productivity < .95]] },
    customers: { eyebrow: 'ROAD & DOCKS', title: 'Customers', chip: `${(s.customers / start.state.customers * 100).toFixed(0)}%`, metric: 'customers', note: 'Busy bays get a delivery truck; grey trucks driving past are customers lost to churn.',
      rows: [['Customer activity', `${(s.customers / start.state.customers * 100).toFixed(0)}% of start`], ['Churn', percent(s.churnRate), s.churnRate > prev.state.churnRate], ['New customers', s.newCustomers.toLocaleString('en-GB', { maximumFractionDigits: 0 })]] },
  };
  const k = cards[part ?? 'company'];
  return <aside className="live-card live-detail" aria-label={`${k.title} details`}>
    <header>
      <div><span className="live-card-eyebrow">{k.eyebrow}</span><strong>{k.title}</strong></div>
      {pinned && <button className="live-icon-button" aria-label="Close" onClick={close}><X size={14} /></button>}
    </header>
    <span className={`live-chip ${part ? '' : health}`}>{k.chip}</span>
    <dl>{k.rows.map(([label, value, bad]) => <div key={label}><dt>{label}</dt><dd className={bad ? 'neg' : ''}>{value}</dd></div>)}</dl>
    <p className="live-note">{k.note}</p>
    {k.metric && <button className="live-link" onClick={() => inspect(k.metric!)}>Open the inspector <ArrowRight size={12} /></button>}
  </aside>;
}

function YearStepper({ records, game, n, played, year }: { records: YearRecord[]; game: Game; n: number; played: number; year: number }) {
  return <aside className="live-card live-steps" aria-label="Years">
    <header><span className="live-card-icon"><TrendingUp size={14} /></span><strong>Five-year journey</strong><small>{game.caseDef.title}</small></header>
    <ol>{Array.from({ length: n + 1 }, (_, i) => {
      const h = i <= played ? sceneFrame(game, records, i).health : null;
      return <li key={i} className={`${i < year ? 'done' : ''} ${i === year ? 'current' : ''} ${h ?? 'future'}`} aria-current={i === year ? 'step' : undefined}>
        <span className="dot">{i < year ? <Check size={11} /> : i === year ? <i /> : null}</span>
        <b>{i === 0 ? 'Start' : `Year ${i}`}</b><small>{h ? healthLabels[h].toLowerCase() : 'to play'}</small>
      </li>;
    })}</ol>
  </aside>;
}

function Headlines({ record, year }: { record: YearRecord; year: number }) {
  return <div className="headlines">
    <h2 id="live-news" className="ceo-section-title">Year {year} in the news</h2>
    <ul>{record.headlines.length ? record.headlines.map(h => <li key={h.text} className={h.tone}>{h.tone === 'bad' ? <CircleAlert size={14} aria-label="Warning" /> : h.tone === 'good' ? <CircleCheck size={14} aria-label="Good news" /> : <PlayIcon size={12} aria-label="Update" />}{h.text}</li>) : <li className="neutral">A quiet year.</li>}</ul>
  </div>;
}

const endings: Record<Health, { title: string; line: string }> = {
  thriving: { title: 'You drove it to success', line: 'The flywheel is spinning up, cash is building and the tower has grown.' },
  steady: { title: 'A going concern', line: 'The company is still standing and paying its way, but it is not compounding yet.' },
  struggling: { title: 'Running on fumes', line: 'Momentum is fading or cash is leaking. Another bad year could stall it.' },
  stalled: { title: 'The machine has stalled', line: 'Cash ran out or momentum collapsed. The lenders are in charge now.' },
};

function Finale({ game, records, ghost, replay, replaying, watch, pause, scrub, exit, again, quit }: {
  game: Game; records: YearRecord[]; ghost: YearRecord[]; replay: number | null; replaying: boolean;
  watch: () => void; pause: () => void; scrub: (y: number) => void; exit: () => void; again: () => void; quit: () => void;
}) {
  const n = records.length - 1, last = records[n], hold = ghost[n], c = game.start.baseline.currency;
  const end = sceneFrame(game, records, n).health, holdEnd = sceneFrame(game, ghost, n).health, e = endings[end];
  const rows: [string, number, number, (x: number) => string][] = [
    ['Revenue', last.state.revenue, hold.state.revenue, x => money(x, c)], ['Cash', last.state.cash, hold.state.cash, x => money(x, c)],
    ['Debt', last.state.debt, hold.state.debt, x => money(x, c)], ['Staff morale', last.people.morale * 100, hold.people.morale * 100, x => x.toFixed(0)],
    ['Momentum', last.state.businessMomentum, hold.state.businessMomentum, x => x.toFixed(0)],
  ];
  return <section className="live-finale" aria-labelledby="finale-title">
    <div className={`live-ending ${end}`}>
      <span className="eyebrow">AFTER {n} YEARS · {healthLabels[end]}</span>
      <h2 id="finale-title">{e.title}</h2>
      <p>{e.line} Had you held course every year, the company would be <strong>{healthLabels[holdEnd].toLowerCase()}</strong>.</p>
      <table className="impact-table"><thead><tr><th scope="col">Year {n}</th><th scope="col">You</th><th scope="col">Held course</th></tr></thead>
        <tbody>{rows.map(([label, a, b, f]) => <tr key={label}><th scope="row">{label}</th><td>{f(a)}</td><td>{f(b)}</td></tr>)}</tbody></table>
      <p className="muted small">Same world, same events, same luck: the only difference is your decisions. For grades and a full breakdown, play the case in <a href="#/ceo">CEO mode</a>.</p>
    </div>
    <div className="live-replay">
      <h3 className="panel-title">REPLAY</h3>
      {replay == null ? <button className="primary-button big" onClick={watch}><PlayIcon size={15} /> Watch your {n} years beside the company that held course</button> : <>
        <div className="replay-controls">
          <button onClick={pause} aria-label={replaying ? 'Pause replay' : 'Play replay'}>{replaying ? <Pause size={14} /> : <PlayIcon size={14} />}</button>
          <input type="range" min={0} max={n} step={1} value={replay} aria-label="Replay year" onChange={ev => scrub(+ev.target.value)} />
          <output>{replay === 0 ? 'Start' : `Year ${replay}`}</output>
        </div>
        <button className="text-button" onClick={exit}>Back to the final year</button>
      </>}
      <div className="live-again"><button onClick={again}><RotateCcw size={14} /> Play this world again</button><button className="text-button" onClick={quit}>Choose a different situation</button></div>
    </div>
  </section>;
}

function Legend() {
  return <aside className="live-legend" aria-label="What the scene shows">
    <ul>
      <li><b>Office tower</b> grows a storey for every sixth of starting revenue; <b>lit windows</b> show productivity.</li>
      <li><b>Flywheel</b> business momentum: fast when compounding, wobbling and slowing as it decays.</li>
      <li><b>Cash silo</b> cash. <b>Pipe</b> free cash flow: amber in, red out.</li>
      <li><b>Red weights</b> on the hoist are debt, one per 10% of starting revenue. A <b>flashing red beacon</b> means an emergency loan this year.</li>
      <li><b>Delivery trucks</b> are customers: busy docks have their doors up and a truck unloading. <b>Grey trucks</b> driving past are customers lost to churn.</li>
      <li><b>Crew in hi-vis</b> is headcount: they move briskly when morale is high, and leavers walk off through the gate. <b>Forklifts</b> speed up with productivity.</li>
      <li><b>Cranes</b> mean investment still to pay off. <b>Sky</b> shows this year’s events and overall health; <b>smoke</b> means trouble. The <b>flag and dock lights</b> show the health colour.</li>
      <li>Point at the tower, flywheel, silo, hoist, yard or road for details; click to keep the card open.</li>
    </ul>
  </aside>;
}
