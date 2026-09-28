import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { Fn, Game, Levers } from '../types';

const fnLabels: Record<Fn, string> = { finance: 'FINANCE', people: 'PEOPLE / HR', product: 'PRODUCT', marketing: 'MARKETING & PRICING', operations: 'OPERATIONS', strategy: 'STRATEGY' };
type LeverSpec = { key: keyof Levers; label: string; min: number; max: number; unit: string; hint: string };
const thisYear: LeverSpec[] = [
  { key: 'price', label: 'Price change', min: -20, max: 20, unit: '%', hint: 'Changes price relative to the market. Unit costs do not change with price.' },
  { key: 'workforce', label: 'Staffing beyond need', min: -20, max: 20, unit: '%', hint: 'Staffing already follows revenue. Negative means layoffs, with severance and a morale hit.' },
];
const standing: LeverSpec[] = [
  { key: 'pay', label: 'Pay vs market', min: -10, max: 15, unit: 'pp', hint: 'Above market lifts morale and cuts attrition; every point costs payroll.' },
  { key: 'reinvestment', label: 'Reinvestment rate', min: 0, max: 100, unit: '%', hint: 'Share of operating cash reinvested. Benefits arrive after a lag.' },
  { key: 'marketing', label: 'Marketing weight', min: 0, max: 100, unit: '', hint: 'Share of reinvestment building brand.' },
  { key: 'rd', label: 'R&D weight', min: 0, max: 100, unit: '', hint: 'Share of reinvestment building technology.' },
  { key: 'people', label: 'Training weight', min: 0, max: 100, unit: '', hint: 'Share of reinvestment building human capital.' },
  { key: 'dividends', label: 'Dividend weight', min: 0, max: 100, unit: '', hint: 'Share of free cash paid out rather than kept or used to repay debt.' },
];

export default function DecisionDesk({ game, year, levers, setLevers, commit, quit }: { game: Game; year: number; levers: Levers; setLevers: (l: Levers) => void; commit: (card: string | null) => void; quit: () => void }) {
  const turn = game.caseDef.turns.find(t => t.year === year);
  const [card, setCard] = useState<string | null>(null);
  const slider = (s: LeverSpec) => <label className="slider-control" key={s.key}>
    <span>{s.label}<output>{s.unit === '%' || s.unit === 'pp' ? `${levers[s.key] > 0 ? '+' : ''}${levers[s.key]}${s.unit === '%' ? '%' : ' pp'}` : levers[s.key]}</output></span>
    <input type="range" aria-label={s.label} min={s.min} max={s.max} step={1} value={levers[s.key]} onChange={e => setLevers({ ...levers, [s.key]: +e.target.value })} />
    <small>{s.hint}</small>
  </label>;
  return <section className="decision-desk" aria-labelledby="desk-title">
    <div className="desk-memo">
      <span className="eyebrow">YEAR {year} OF {game.caseDef.turns.length} · DECISION</span>
      <h2 id="desk-title">{turn?.memo ?? 'Set your policies for the year.'}</h2>
    </div>
    <div className="desk-grid">
      <fieldset className="cards">
        <legend className="panel-title">PLAY ONE CARD</legend>
        {turn?.cards.map(c => <label key={c.id} className={`decision-card ${card === c.id ? 'is-chosen' : ''}`}>
          <input type="radio" name={`card-${year}`} checked={card === c.id} onChange={() => setCard(c.id)} />
          <span className="eyebrow">{fnLabels[c.fn]}</span><strong>{c.title}</strong><span>{c.pitch}</span>
        </label>)}
        <label className={`decision-card hold ${card === null ? 'is-chosen' : ''}`}>
          <input type="radio" name={`card-${year}`} checked={card === null} onChange={() => setCard(null)} />
          <span className="eyebrow">NO CARD</span><strong>Hold course</strong><span>Sometimes the best move is none.</span>
        </label>
      </fieldset>
      <div className="levers">
        <fieldset><legend className="panel-title">THIS YEAR ONLY</legend>{thisYear.map(slider)}</fieldset>
        <fieldset><legend className="panel-title">STANDING POLICIES</legend><div className="lever-grid">{standing.map(slider)}</div></fieldset>
      </div>
    </div>
    <div className="desk-actions">
      <button className="text-button" onClick={quit}>Abandon this game</button>
      <button className="primary-button big" onClick={() => commit(card)}>Play year {year} <ArrowRight size={15} /></button>
    </div>
  </section>;
}
