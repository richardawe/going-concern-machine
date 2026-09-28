import { ArrowRight } from 'lucide-react';
import { money, percent } from '../../presentation';
import { initialPeople } from '../game';
import type { Game } from '../types';

export default function Briefing({ game, begin, quit }: { game: Game; begin: () => void; quit: () => void }) {
  const { start, caseDef } = game, s = start.baseline.state, c = start.baseline.currency, people = initialPeople(start);
  return <section className="ceo-briefing" aria-labelledby="briefing-title">
    <div className="memo">
      <span className="eyebrow">BOARD MEMO · CONFIDENTIAL</span>
      <h2 id="briefing-title">{caseDef.title}</h2>
      <p className="memo-lead">{caseDef.briefing}</p>
      <p>You will make one decision a year for {caseDef.turns.length} years. Each turn you may play one decision card and adjust your standing levers: price, staffing, pay, budgets, reinvestment and payout. Then the machine plays the year forward.</p>
      <p className="muted">How you will be judged stays sealed until the debrief.</p>
      <div className="memo-actions"><button className="primary-button big" onClick={begin}>Take the chair <ArrowRight size={15} /></button><button className="text-button" onClick={quit}>Choose a different situation</button></div>
    </div>
    <aside className="company-card" aria-label="Your company">
      <span className="eyebrow">{start.tagline.toUpperCase()}</span>
      <h3>{start.name}</h3>
      <dl className="stat-list">
        <dt>Revenue</dt><dd>{money(s.revenue, c)}</dd>
        <dt>Gross margin</dt><dd>{percent(s.grossMargin)}</dd>
        <dt>Operating profit</dt><dd>{money(s.operatingProfit, c)}</dd>
        <dt>Free cash flow</dt><dd>{money(s.freeCashFlow, c)}</dd>
        <dt>Cash</dt><dd>{money(s.cash, c)}</dd>
        <dt>Debt</dt><dd>{money(s.debt, c)}</dd>
        <dt>Payroll</dt><dd>{money(people.payroll, c)} <small>game assumption</small></dd>
      </dl>
      <details><summary>Where these numbers come from</summary>
        <table className="provenance"><tbody>{start.provenance.map(p => <tr key={p.label}><th>{p.label}</th><td>{p.value}</td><td>{p.basis}</td></tr>)}</tbody></table>
        {start.baseline.notes.map(n => <p key={n} className="muted small">{n}</p>)}
      </details>
    </aside>
  </section>;
}
