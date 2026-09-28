import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CircleAlert, CircleCheck, Newspaper, Play as PlayIcon } from 'lucide-react';
import Machine from '../../components/Machine';
import Gauge from '../../components/Gauge';
import Inspector from '../../components/Inspector';
import { clamp } from '../../model/config';
import { machineView, money, percent } from '../../presentation';
import { gameScore } from '../assess';
import { defaultLevers, play } from '../game';
import type { Decision, Game, Levers, YearRecord } from '../types';
import DecisionDesk from './DecisionDesk';

const signed = (n: number, f: (x: number) => string) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${f(Math.abs(n))}`;
/** "Hold course" for a year: no card, standing levers unchanged, no one-off price or staffing move. */
export const holdCourse = (game: Game, year: number): Decision => {
  const prior = game.decisions[year - 2]?.levers ?? defaultLevers(game.start);
  return { card: null, levers: { ...prior, price: 0, workforce: 0 } };
};

export default function Play({ game, decide, finish, quit }: { game: Game; decide: (d: Decision) => void; finish: () => void; quit: () => void }) {
  const records = useMemo(() => play(game), [game]);
  const n = game.caseDef.turns.length, played = game.decisions.length, last = records.at(-1)!;
  const [phase, setPhase] = useState<'decide' | 'running' | 'result'>(played === n ? 'result' : 'decide');
  const [inspect, setInspect] = useState<string | null>(null);
  useEffect(() => {
    if (phase !== 'running') return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = setTimeout(() => setPhase('result'), reduced ? 0 : 1100); return () => clearTimeout(t);
  }, [phase]);
  const shown = phase === 'running' ? records[played - 1] : last;
  const base = game.start.baseline, c = base.currency, view = machineView(shown.state, base);
  const board = gameScore(game, records).overall;
  const nextYear = played + 1;
  const [draft, setDraft] = useState<Levers>(() => holdCourse(game, nextYear).levers);
  useEffect(() => { setDraft(holdCourse(game, played + 1).levers); }, [played]);

  return <section className="ceo-play" aria-label="CEO game">
    <div className="ceo-status">
      <div><span className="eyebrow">{game.caseDef.title.toUpperCase()}</span><strong>{game.start.name}</strong><small>{game.start.tagline}</small></div>
      <ol className="year-track" aria-label="Years">
        {records.concat(Array.from({ length: n - played }, () => null as unknown as YearRecord)).map((r, i) => <li key={i} className={`${i === shown.year ? 'current' : ''} ${i <= played ? 'done' : ''}`} aria-current={i === shown.year ? 'step' : undefined}><span>{i === 0 ? 'Start' : `Y${i}`}</span></li>)}
      </ol>
      <div className="board-meter" title="What the board would score you if judged today. The full formula is revealed in the debrief.">
        <span className="eyebrow">BOARD CONFIDENCE</span>
        <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={board} aria-label="Board confidence"><i style={{ width: `${played ? board : 0}%` }} /></div>
        <strong>{played ? board : '—'}</strong>
      </div>
    </div>

    <div className="ceo-workspace">
      <div className="ceo-machine">
        <Machine state={shown.state} baseline={base} view={view} motion inspect={setInspect} />
        {phase === 'running' && <div className="running-overlay" role="status"><span>PLAYING YEAR {played}…</span><i /></div>}
      </div>
      <aside className="instrument-panel ceo-panel" aria-label="Instruments">
        <h2 className="panel-title">YEAR {shown.year} INSTRUMENTS</h2>
        <div className="gauges">
          <Gauge label="Revenue" value={money(shown.state.revenue, c)} level={clamp(shown.state.revenue / base.state.revenue / 2, 0, 1)} onClick={() => setInspect('revenue')} detail="Customer activity × productivity × price" />
          <Gauge label="Free cash flow" value={money(shown.state.freeCashFlow, c)} negative={shown.state.freeCashFlow < 0} level={clamp(.5 + shown.state.freeCashFlow / Math.max(1, base.state.revenue) * 2.5, 0, 1)} onClick={() => setInspect('freeCashFlow')} detail="Operating cash flow − CapEx" />
          <Gauge label="ROIC" value={percent(shown.state.roic)} negative={shown.state.roic < shown.state.costOfCapital} level={clamp(shown.state.roic / .4 + .25, 0, 1)} onClick={() => setInspect('roic')} detail={`Cost of capital ${percent(shown.state.costOfCapital)}`} />
          <Gauge label="Cash" value={money(shown.state.cash, c)} level={view.fill} onClick={() => setInspect('cash')} detail={view.liquidity} />
        </div>
        <People record={shown} baseAttrition={game.start.params.baseAttrition} />
      </aside>
    </div>

    {phase === 'decide' && played < n && <DecisionDesk key={nextYear} game={game} year={nextYear} levers={draft} setLevers={setDraft} commit={card => { decide({ card, levers: draft }); setPhase('running'); }} quit={quit} />}
    {phase === 'result' && <YearResult game={game} records={records} next={played < n ? () => setPhase('decide') : finish} last={played === n} />}
    {inspect && <Inspector metric={inspect} state={shown.state} baseline={base} history={records.map(r => r.state)} close={() => setInspect(null)} />}
  </section>;
}

function People({ record: r, baseAttrition }: { record: YearRecord; baseAttrition: number }) {
  const p = r.people, workforce = p.headcount / p.natural;
  return <section className="people-panel" aria-label="People">
    <h3 className="panel-title">PEOPLE <small>game assumptions</small></h3>
    <div className="people-row"><span>Morale</span><div className="bar" aria-hidden="true"><i style={{ width: `${p.morale * 100}%` }} className={p.morale < .5 ? 'low' : ''} /></div><strong>{(p.morale * 100).toFixed(0)}</strong></div>
    <div className="people-row"><span>Attrition</span><div className="bar" aria-hidden="true"><i style={{ width: `${Math.min(1, p.attrition / .6) * 100}%` }} className={p.attrition > baseAttrition * 1.3 ? 'low' : ''} /></div><strong>{percent(p.attrition)}</strong></div>
    <div className="people-row"><span>Staffing vs need</span><div className="bar" aria-hidden="true"><i style={{ width: `${Math.min(1, workforce / 1.5) * 100}%` }} className={workforce < .92 ? 'low' : ''} /></div><strong>{(workforce * 100).toFixed(0)}%</strong></div>
    <div className="people-row"><span>Team productivity</span><div className="bar" aria-hidden="true"><i style={{ width: `${Math.min(1, p.productivity / 1.5) * 100}%` }} className={p.productivity < .95 ? 'low' : ''} /></div><strong>{p.productivity.toFixed(2)}×</strong></div>
    <p className="muted small">Normal attrition for this industry: {percent(baseAttrition)}. Morale 70 is neutral.</p>
  </section>;
}

function YearResult({ game, records, next, last }: { game: Game; records: YearRecord[]; next: () => void; last: boolean }) {
  const year = records.length - 1, r = records[year], c = game.start.baseline.currency;
  // What this year's decision changed: replay with only this year switched to "hold course". Same seed, same luck.
  const hold = useMemo(() => play({ ...game, decisions: [...game.decisions.slice(0, -1), holdCourse(game, year)] })[year], [game, year]);
  const rows: [string, number, number, (x: number) => string][] = [
    ['Revenue', r.state.revenue, hold.state.revenue, x => money(x, c)], ['Operating profit', r.state.operatingProfit, hold.state.operatingProfit, x => money(x, c)],
    ['Free cash flow', r.state.freeCashFlow, hold.state.freeCashFlow, x => money(x, c)], ['Cash', r.state.cash, hold.state.cash, x => money(x, c)],
    ['Morale', r.people.morale * 100, hold.people.morale * 100, x => x.toFixed(1)], ['Customer activity', r.state.customers, hold.state.customers, x => x.toFixed(1)],
  ];
  const same = rows.every(([, a, b]) => Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(a)));
  return <section className="year-result" aria-labelledby="result-title">
    <div className="headlines">
      <h2 id="result-title" className="ceo-section-title"><Newspaper size={16} /> Year {year} in the news</h2>
      <ul>{r.headlines.length ? r.headlines.map(h => <li key={h.text} className={h.tone}>{h.tone === 'bad' ? <CircleAlert size={14} aria-label="Warning" /> : h.tone === 'good' ? <CircleCheck size={14} aria-label="Good news" /> : <PlayIcon size={12} aria-label="Update" />}{h.text}</li>) : <li className="neutral">A quiet year.</li>}</ul>
      {r.pending.length > 0 && <><h3 className="panel-title">STILL IN THE PIPELINE</h3><ul className="pending">{r.pending.map(p => <li key={p}>{p}</li>)}</ul></>}
    </div>
    <div className="impact">
      <h2 className="ceo-section-title">What your decision did this year</h2>
      <p className="muted small">Compared with holding course this year: same history, same luck, same events.</p>
      {same ? <p>No difference this year: you held course, or the effects have not arrived yet.</p> :
        <table className="impact-table"><thead><tr><th scope="col">Year {year}</th><th scope="col">Your decision</th><th scope="col">Hold course</th><th scope="col">Impact</th></tr></thead>
          <tbody>{rows.map(([label, a, b, f]) => <tr key={label}><th scope="row">{label}</th><td>{f(a)}</td><td>{f(b)}</td><td className={a - b > 0 ? 'up' : a - b < 0 ? 'down' : ''}>{signed(a - b, f)}</td></tr>)}</tbody></table>}
      <p className="muted small">Many effects arrive later: investment matures after a lag, and morale moves attrition the following year.</p>
      <button className="primary-button big" onClick={next}>{last ? 'Open the debrief' : `Decide year ${year + 1}`} <ArrowRight size={15} /></button>
    </div>
  </section>;
}
