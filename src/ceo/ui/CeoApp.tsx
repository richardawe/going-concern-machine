import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { CompanyDatasetProvider } from '../../data/company-datasets';
import ThemeSwitch from '../../components/ThemeSwitch';
import type { ArchetypeFile } from '../archetypes';
import { resolveCase, type SandboxConfig } from '../sandbox';
import { fictionalCompany, prepareStart, realCompany } from '../company';
import type { Decision, Game, StartCompany } from '../types';
import Setup, { type CompanyChoice } from './Setup';
import Briefing from './Briefing';
import Play from './Play';
import Debrief from './Debrief';
import './ceo.css';

const provider = new CompanyDatasetProvider();
const STORAGE = 'gcm:ceo:v1:game';
interface Saved { caseId: string; choice: CompanyChoice; decisions: Decision[]; stage: Stage; sandbox?: SandboxConfig }
type Stage = 'briefing' | 'play' | 'debrief';

const leverKeys = ['price', 'workforce', 'pay', 'marketing', 'rd', 'people', 'dividends', 'reinvestment'] as const;
/** A saved game is only resumed if it still fits the current cases; anything else starts afresh. */
function valid(s: unknown): s is Saved {
  const x = s as Saved, c = x && resolveCase(x.caseId, x.sandbox);
  if (!c || !['briefing', 'play', 'debrief'].includes(x.stage) || !Array.isArray(x.decisions) || x.decisions.length > c.turns.length) return false;
  const choice = x.choice as CompanyChoice;
  if (!(choice?.kind === 'real' && typeof choice.ticker === 'string') && !(choice?.kind === 'fictional' && typeof choice.archetype === 'string' && Number.isFinite(choice.seed))) return false;
  return x.decisions.every((d, i) => (d.card === null || c.turns[i]?.cards.some(k => k.id === d.card)) && leverKeys.every(k => Number.isFinite(d.levers?.[k]) && Math.abs(d.levers[k]) <= 100));
}
const read = (): Saved | null => { try { const s = JSON.parse(localStorage.getItem(STORAGE) || 'null'); return valid(s) ? s : null; } catch { return null; } };
const write = (s: Saved | null) => { try { if (s) localStorage.setItem(STORAGE, JSON.stringify(s)); else localStorage.removeItem(STORAGE); } catch { /* Storage is optional. */ } };

async function startFor(choice: CompanyChoice, archetypes: ArchetypeFile): Promise<StartCompany> {
  if (choice.kind === 'real') return realCompany(await provider.getCompany(choice.ticker));
  const a = archetypes.archetypes.find(x => x.id === choice.archetype);
  if (!a) throw new Error('That industry archetype is not available.');
  return fictionalCompany(a, choice.seed);
}

export default function CeoApp() {
  const [archetypes, setArchetypes] = useState<ArchetypeFile | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<Saved | null>(read);
  const [start, setStart] = useState<StartCompany | null>(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}ceo/archetypes.json`).then(r => { if (!r.ok) throw new Error('The industry archetypes could not be loaded.'); return r.json(); }).then(setArchetypes).catch(e => setError(e.message));
  }, []);
  const caseDef = useMemo(() => saved ? resolveCase(saved.caseId, saved.sandbox) : undefined, [saved?.caseId, JSON.stringify(saved?.sandbox)]);
  useEffect(() => {
    if (!saved || !archetypes || !caseDef) { setStart(null); return; }
    let live = true;
    startFor(saved.choice, archetypes).then(s => { if (live) setStart(prepareStart(s, caseDef.setup)); }).catch(e => { if (live) { setError(e.message); update(null); } });
    return () => { live = false; };
  }, [caseDef, JSON.stringify(saved?.choice), archetypes]);

  const update = (next: Saved | null) => { setSaved(next); write(next); };
  const game: Game | null = useMemo(() => start && caseDef && saved ? { start, caseDef, seed: caseDef.seed, decisions: saved.decisions } : null, [start, caseDef, saved]);
  const ready = game && start?.id && saved;

  return <main className="app-shell ceo-app">
    <header className="masthead ceo-masthead">
      <div className="brand"><div className="edition">ECONOMIC SYSTEMS LAB <span>CEO MODE / TRAINING GAME</span> <ThemeSwitch /></div><h1>The Going Concern Machine</h1><p>You are the CEO. Decide, then watch the machine play the year forward.</p></div>
      <a className="text-button back-link" href="#/"><ArrowLeft size={13} /> Company machines</a>
    </header>
    {error && <div className="notice" role="alert">{error} <button className="text-button" onClick={() => setError('')}>Dismiss</button></div>}
    {!saved && (archetypes ? <Setup archetypes={archetypes} begin={(caseId, choice, sandbox) => { setError(''); update({ caseId, choice, decisions: [], stage: 'briefing', sandbox }); }} /> : !error && <p className="empty-state">Loading industries…</p>)}
    {saved && !ready && !error && <p className="empty-state">Preparing your company…</p>}
    {ready && saved.stage === 'briefing' && <Briefing game={game} begin={() => update({ ...saved, stage: 'play' })} quit={() => update(null)} />}
    {ready && saved.stage === 'play' && <Play key={game.start.id + game.caseDef.id} game={game} decide={d => update({ ...saved, decisions: [...saved.decisions, d] })} finish={() => update({ ...saved, stage: 'debrief' })} quit={() => update(null)} />}
    {ready && saved.stage === 'debrief' && <Debrief game={game} again={() => update({ ...saved, decisions: [], stage: 'briefing' })} quit={() => update(null)} />}
    <footer className="ceo-footer">A training game on fictional or hypothetical futures. It is not financial advice or a forecast of any real company.</footer>
  </main>;
}
