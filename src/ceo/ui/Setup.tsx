import { useState } from 'react';
import { ArrowRight, Dices } from 'lucide-react';
import { archetypeLabels, type ArchetypeFile, type ArchetypeId } from '../archetypes';
import { cases } from '../cases';
import { realCompanies } from '../company';

export type CompanyChoice = { kind: 'fictional'; archetype: ArchetypeId; seed: number } | { kind: 'real'; ticker: string };
const REAL: Record<string, string> = { MSFT: 'Microsoft', WMT: 'Walmart', JPM: 'JPMorgan Chase' };

export default function Setup({ archetypes, begin }: { archetypes: ArchetypeFile; begin: (caseId: string, choice: CompanyChoice) => void }) {
  const [caseId, setCaseId] = useState(cases[0].id);
  const chosen = cases.find(c => c.id === caseId)!;
  const available = archetypes.archetypes.map(a => a.id);
  const [archetype, setArchetype] = useState<ArchetypeId | null>(null);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e6));
  const [real, setReal] = useState<string | null>(null);
  const industry = archetype ?? (available.includes(chosen.archetype) ? chosen.archetype : available[0]);
  const choice: CompanyChoice = real ? { kind: 'real', ticker: real } : { kind: 'fictional', archetype: industry, seed };

  return <section className="ceo-setup" aria-labelledby="ceo-setup-title">
    <h2 id="ceo-setup-title" className="ceo-section-title"><span className="eyebrow">STEP 1</span> Choose a situation</h2>
    <div className="case-grid" role="radiogroup" aria-label="Scenario">
      {cases.map(c => <button key={c.id} role="radio" aria-checked={c.id === caseId} className="case-card" onClick={() => { setCaseId(c.id); setArchetype(null); }}>
        <span className="eyebrow">{archetypeLabels[c.archetype].toUpperCase()} · {c.turns.length} YEARS</span>
        <strong>{c.title}</strong><span>{c.tagline}</span>
      </button>)}
    </div>
    <h2 className="ceo-section-title"><span className="eyebrow">STEP 2</span> Choose your company</h2>
    <div className="company-choice">
      <div className={`choice-panel ${real ? '' : 'is-chosen'}`}>
        <label className="choice-radio"><input type="radio" name="company" checked={!real} onChange={() => setReal(null)} /> <strong>A fictional company</strong> <span className="tag">RECOMMENDED</span></label>
        <p>Realistic but not real. Its margins, capital intensity and growth are drawn from the middle half of real SEC filers in the industry you pick.</p>
        <div className="choice-row">
          <label className="select-label">Industry<select value={industry} onChange={e => { setArchetype(e.target.value as ArchetypeId); setReal(null); }}>
            {archetypes.archetypes.map(a => <option key={a.id} value={a.id}>{archetypeLabels[a.id]} · {a.n} filers</option>)}
          </select></label>
          <button onClick={() => { setSeed(Math.floor(Math.random() * 1e6)); setReal(null); }}><Dices size={14} /> New company</button>
        </div>
      </div>
      <div className={`choice-panel ${real ? 'is-chosen' : ''}`}>
        <span className="choice-radio"><strong>Or take over a real company</strong></span>
        <p>Start from reported figures; everything after Year 0 is hypothetical. Pay, morale and price sensitivity remain game assumptions.</p>
        <div className="choice-row" role="radiogroup" aria-label="Real company">
          {Object.keys(realCompanies).map(t => <button key={t} role="radio" aria-checked={real === t} className="ticker-chip" onClick={() => setReal(t)}><strong>{t}</strong><span>{REAL[t]}</span></button>)}
        </div>
        {real && <p className="muted small">{realCompanies[real].note}</p>}
      </div>
    </div>
    <div className="setup-go"><button className="primary-button big" onClick={() => begin(caseId, choice)}>Read the briefing <ArrowRight size={15} /></button></div>
  </section>;
}
