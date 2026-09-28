import { useEffect, useRef, useState } from 'react';
import { Download, RotateCcw } from 'lucide-react';
import { money, percent } from '../../presentation';
import { debrief, dimensionFormulas, dimensionLabels, percentile, type Debrief as Result, type Outcome } from '../assess';
import { findCard } from '../game';
import { dimensions, type Game, type YearRecord } from '../types';

type Metric = { id: string; label: string; value: (r: YearRecord) => number; format: (n: number) => string };

export default function Debrief({ game, again, quit }: { game: Game; again: () => void; quit: () => void }) {
  const [result, setResult] = useState<Result | null>(null);
  // Scoring replays the game over a thousand times; let the page paint first.
  useEffect(() => { const t = setTimeout(() => setResult(debrief(game)), 30); return () => clearTimeout(t); }, [game]);
  if (!result) return <p className="empty-state" role="status">The board is reviewing your tenure…</p>;
  const { you, statusQuo, reference, space } = result, c = game.start.baseline.currency;
  const metrics: Metric[] = [
    { id: 'revenue', label: 'Revenue', value: r => r.state.revenue, format: n => money(n, c) },
    { id: 'fcf', label: 'Free cash flow', value: r => r.state.freeCashFlow, format: n => money(n, c) },
    { id: 'cash', label: 'Cash', value: r => r.state.cash, format: n => money(n, c) },
    { id: 'roic', label: 'ROIC', value: r => r.state.roic, format: percent },
    { id: 'morale', label: 'Morale', value: r => r.people.morale * 100, format: n => n.toFixed(0) },
  ];
  const vsNothing = you.card.overall - statusQuo.card.overall;
  const download = () => {
    const report = { case: game.caseDef.title, company: game.start.name, companyId: game.start.id, seed: game.seed, decisions: game.decisions.map((d, i) => ({ year: i + 1, card: findCard(game, i + 1, d.card)?.title ?? 'Hold course', levers: d.levers })), scores: { you: you.card, doingNothing: statusQuo.card, reference: reference.card }, strategyRank: { percentile: space.percentile, grade: space.grade, strategies: space.scores.length }, attribution: result.attribution, lessons: result.lessons };
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })); a.download = `ceo-debrief-${game.caseDef.id}.json`; a.click(); URL.revokeObjectURL(a.href);
  };

  return <section className="ceo-debrief" aria-labelledby="debrief-title">
    <div className="verdict">
      <div className="grade" aria-label={`Grade ${space.grade}`}>{space.grade}</div>
      <div>
        <span className="eyebrow">DEBRIEF · {game.caseDef.title.toUpperCase()} · {game.start.name.toUpperCase()}</span>
        <h2 id="debrief-title">Your strategy beat {Math.round(space.percentile * 100)}% of the {space.scores.length.toLocaleString('en-GB')} possible card strategies.</h2>
        <p>Score {you.card.overall} · doing nothing {statusQuo.card.overall} ({vsNothing >= 0 ? '+' : '−'}{Math.abs(vsNothing)}) · reference path {reference.card.overall} · best card strategy found {space.best.overall}. All played in the same world: same events, same luck.</p>
      </div>
    </div>

    <div className="debrief-grid">
      <section aria-labelledby="objectives-title" className="objectives">
        <h3 id="objectives-title" className="panel-title">WHAT THIS CASE WAS TESTING</h3>
        <ol>{game.caseDef.objectives.map(o => <li key={o}>{o}</li>)}</ol>
      </section>
      <Scorecard outcomes={[you, statusQuo, reference]} weights={game.caseDef.weights} />
    </div>

    <Paths outcomes={[you, reference, statusQuo]} metrics={metrics} />

    <div className="debrief-grid">
      <section aria-labelledby="attr-title">
        <h3 id="attr-title" className="panel-title">WHAT EACH DECISION DID</h3>
        <p className="muted small">Each decision is replayed as “hold course” with everything else unchanged. The difference is its effect by year {game.decisions.length}.</p>
        {result.attribution.length ? <table className="impact-table attribution"><thead><tr><th scope="col">Decision</th><th scope="col">Score</th><th scope="col">Revenue</th><th scope="col">Cash</th><th scope="col">Morale</th></tr></thead>
          <tbody>{result.attribution.map(a => <tr key={a.year}><th scope="row"><small>Y{a.year}</small> {a.title}</th>{[[a.delta.overall, (x: number) => x.toFixed(0)], [a.delta.revenue, (x: number) => money(x, c)], [a.delta.cash, (x: number) => money(x, c)], [a.delta.morale * 100, (x: number) => x.toFixed(1)]].map(([v, f], i) => <td key={i} className={(v as number) > 0 ? 'up' : (v as number) < 0 ? 'down' : ''}>{(v as number) > 0 ? '+' : (v as number) < 0 ? '−' : '±'}{(f as (x: number) => string)(Math.abs(v as number))}</td>)}</tr>)}</tbody></table>
          : <p>You held course every year, so there is nothing to attribute.</p>}
      </section>
      <Luck you={result.luck.you} nothing={result.luck.statusQuo} actual={you.card.overall} />
    </div>

    <section aria-labelledby="lessons-title" className="lessons">
      <h3 id="lessons-title" className="panel-title">LESSONS FROM YOUR PLAY</h3>
      <ul>{result.lessons.map(l => <li key={l}>{l}</li>)}</ul>
      <details><summary>The reference path</summary><ol>{game.caseDef.reference.map((r, i) => <li key={i}>Year {i + 1}: {findCard(game, i + 1, r.card)?.title ?? 'Hold course'}{r.levers ? ` · levers: ${Object.entries(r.levers).map(([k, v]) => `${k} ${v}`).join(', ')}` : ''}</li>)}</ol></details>
    </section>
    <div className="desk-actions">
      <button className="text-button" onClick={quit}>Choose another situation</button>
      <span><button onClick={download}><Download size={14} /> Download report</button> <button className="primary-button big" onClick={again}><RotateCcw size={14} /> Replay this case</button></span>
    </div>
  </section>;
}

function Scorecard({ outcomes, weights }: { outcomes: Outcome[]; weights: Game['caseDef']['weights'] }) {
  return <section aria-labelledby="score-title">
    <h3 id="score-title" className="panel-title">SCORECARD <small>50 = kept pace with the starting position</small></h3>
    <table className="scorecard"><thead><tr><th scope="col">Dimension</th><th scope="col">Weight</th>{outcomes.map(o => <th key={o.label} scope="col">{o.label}</th>)}</tr></thead>
      <tbody>{dimensions.map(d => <tr key={d}><th scope="row" title={dimensionFormulas[d]}>{dimensionLabels[d]}</th><td>{Math.round(weights[d] * 100)}%</td>
        {outcomes.map((o, i) => <td key={o.label}>{i === 0 ? <span className="score-bar"><i style={{ width: `${o.card.scores[d]}%` }} /><b>{o.card.scores[d]}</b></span> : o.card.scores[d]}</td>)}</tr>)}
        <tr className="total"><th scope="row">Overall</th><td /> {outcomes.map(o => <td key={o.label}><strong>{o.card.overall}</strong></td>)}</tr></tbody></table>
    <details><summary>How each score is calculated</summary><dl className="formulas">{dimensions.map(d => <div key={d}><dt>{dimensionLabels[d]}</dt><dd>{dimensionFormulas[d]}</dd></div>)}</dl><p className="muted small">σ is the logistic curve, so no score saturates. The grade ranks your overall score among every card strategy the case allows, played with default levers in the same world.</p></details>
  </section>;
}

const seriesClass = ['you', 'reference', 'nothing'];
function Paths({ outcomes, metrics }: { outcomes: Outcome[]; metrics: Metric[] }) {
  const [metric, setMetric] = useState(metrics[0]), [hover, setHover] = useState<number | null>(null);
  // Drawn at the container's real width so text stays at its intended size on every screen.
  const box = useRef<HTMLDivElement>(null), [W, setW] = useState(720);
  useEffect(() => { const el = box.current; if (!el) return; const ro = new ResizeObserver(([e]) => setW(Math.max(300, Math.round(e.contentRect.width)))); ro.observe(el); return () => ro.disconnect(); }, []);
  const years = outcomes[0].records.length - 1, H = W < 520 ? 220 : 280, L = 64, R = W < 520 ? 12 : 112, T = 14, B = 26;
  const values = outcomes.map(o => o.records.map(metric.value)), all = values.flat();
  let lo = Math.min(...all), hi = Math.max(...all); if (lo > 0 && lo / hi > .3) lo = lo * .9; else lo = Math.min(0, lo); if (hi === lo) hi = lo + 1;
  const x = (i: number) => L + i * (W - L - R) / years, y = (v: number) => T + (hi - v) / (hi - lo) * (H - T - B);
  const ticks = [lo, lo + (hi - lo) / 2, hi];
  // Direct labels at the line ends, nudged apart so they never overlap.
  const ends = values.map((v, i) => ({ i, y: y(v.at(-1)!) })).sort((a, b) => a.y - b.y);
  ends.forEach((e, k) => { if (k && e.y - ends[k - 1].y < 13) e.y = ends[k - 1].y + 13; });
  return <section className="paths" aria-labelledby="paths-title">
    <div className="paths-head">
      <h3 id="paths-title" className="panel-title">THREE FUTURES FOR THE SAME COMPANY</h3>
      <div className="segmented" role="tablist" aria-label="Metric">{metrics.map(m => <button key={m.id} role="tab" aria-selected={m.id === metric.id} onClick={() => setMetric(m)}>{m.label}</button>)}</div>
    </div>
    <ul className="legend">{outcomes.map((o, i) => <li key={o.label} className={seriesClass[i]}><svg width="22" height="8" aria-hidden="true"><line x1="0" x2="22" y1="4" y2="4" /></svg>{o.label}</li>)}</ul>
    <div className="chart-wrap" ref={box}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${metric.label} by year for ${outcomes.map(o => o.label).join(', ')}`} onMouseLeave={() => setHover(null)}
        onMouseMove={e => { const b = e.currentTarget.getBoundingClientRect(), px = (e.clientX - b.left) / b.width * W; setHover(Math.max(0, Math.min(years, Math.round((px - L) / ((W - L - R) / years))))); }}>
        {ticks.map(t => <g key={t} className="grid"><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} /><text x={L - 8} y={y(t) + 4} textAnchor="end">{metric.format(t)}</text></g>)}
        {Array.from({ length: years + 1 }, (_, i) => <text key={i} className="axis" x={x(i)} y={H - 6} textAnchor="middle">{i ? `Y${i}` : 'Start'}</text>)}
        {hover != null && <line className="crosshair" x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} />}
        {values.map((v, i) => <polyline key={i} className={`series ${seriesClass[i]}`} points={v.map((p, j) => `${x(j)},${y(p)}`).join(' ')} />)}
        {hover != null && values.map((v, i) => <circle key={i} className={`dot ${seriesClass[i]}`} cx={x(hover)} cy={y(v[hover])} r="4" />)}
        {R > 40 && ends.map(e => <text key={e.i} className="end-label" x={W - R + 8} y={e.y + 4}>{outcomes[e.i].label}</text>)}
      </svg>
      {hover != null && <div className="chart-tip" style={{ left: x(hover) > W * .6 ? x(hover) - 196 : x(hover) }}><strong>{hover ? `Year ${hover}` : 'Start'}</strong>{outcomes.map((o, i) => <span key={o.label} className={seriesClass[i]}>{o.label}<b>{metric.format(values[i][hover])}</b></span>)}</div>}
    </div>
    <details><summary>Show as a table</summary><table className="impact-table"><thead><tr><th scope="col">{metric.label}</th>{values[0].map((_, j) => <th key={j} scope="col">{j ? `Y${j}` : 'Start'}</th>)}</tr></thead><tbody>{outcomes.map((o, i) => <tr key={o.label}><th scope="row">{o.label}</th>{values[i].map((v, j) => <td key={j}>{metric.format(v)}</td>)}</tr>)}</tbody></table></details>
  </section>;
}

function Luck({ you, nothing, actual }: { you: number[]; nothing: number[]; actual: number }) {
  const band = (s: number[]) => [percentile(s, .1), percentile(s, .5), percentile(s, .9)];
  const [a, b] = [band(you), band(nothing)], at = (v: number) => `${v}%`;
  return <section aria-labelledby="luck-title" className="luck">
    <h3 id="luck-title" className="panel-title">SKILL OR LUCK?</h3>
    <p className="muted small">The same decisions played in {you.length} other possible worlds, with different demand swings and different luck on risky cards. Bars span the 10th–90th percentile; the tick is the median.</p>
    {[['Your decisions', a, 'you'], ['Doing nothing', b, 'nothing']].map(([label, [p10, p50, p90], cls]) => <div key={label as string} className="luck-row"><span>{label as string}</span>
      <div className="luck-track" aria-label={`${label}: ${p10} to ${p90}, median ${p50}`}><i className={cls as string} style={{ left: at(p10 as number), width: at((p90 as number) - (p10 as number)) }} /><b style={{ left: at(p50 as number) }} />{cls === 'you' && <em style={{ left: at(actual) }} title={`Your actual score: ${actual}`} />}</div>
      <small>{p10 as number}–{p90 as number}</small></div>)}
    <p className="small">{a[0] > b[2] ? 'Your decisions beat doing nothing in almost every possible world: that is skill.' : a[1] > b[1] ? 'Your decisions beat doing nothing in most worlds, but luck could have flipped it.' : 'In most worlds, doing nothing would have scored as well or better.'} {actual > a[2] ? 'This time you were lucky.' : actual < a[0] ? 'This time you were unlucky.' : ''}</p>
  </section>;
}
