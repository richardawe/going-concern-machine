import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, GraduationCap, Swords } from 'lucide-react';
import ThemeSwitch from '../../components/ThemeSwitch';
import { archetypeLabels } from '../archetypes';
import { assignmentFromHash, challengeFromHash, decodeAssignment, decodeChallenge, leverRange, type Assignment, type Challenge, type CompanyChoice } from '../challenge';
import { resolveCase, type SandboxConfig } from '../sandbox';
import { prepareStart } from '../company';
import type { Decision, Game, StartCompany } from '../types';
import Setup from './Setup';
import Briefing from './Briefing';
import Play from './Play';
import Debrief from './Debrief';
import Instructor from './Instructor';
import { startFor, useArchetypes } from './load';
import './ceo.css';

const STORAGE = 'gcm:ceo:v1:game';
/** `challenge` holds the decisions of whoever sent the link, replayed in the debrief for comparison; `assignment` marks a
 * game started from an instructor's class link, so the debrief asks the student to submit their results. */
interface Saved { caseId: string; choice: CompanyChoice; decisions: Decision[]; stage: Stage; sandbox?: SandboxConfig; challenge?: { name?: string; decisions: Decision[]; revenue: number }; assignment?: { id: string; title: string } }
type Stage = 'briefing' | 'play' | 'debrief';

const leverKeys = ['price', 'workforce', 'pay', 'marketing', 'rd', 'people', 'dividends', 'reinvestment'] as const;
/** A saved game is only resumed if it still fits the current cases; anything else starts afresh. */
function valid(s: unknown): s is Saved {
  const x = s as Saved, c = x && resolveCase(x.caseId, x.sandbox);
  if (!c || !['briefing', 'play', 'debrief'].includes(x.stage) || !Array.isArray(x.decisions) || x.decisions.length > c.turns.length) return false;
  const choice = x.choice as CompanyChoice;
  if (!(choice?.kind === 'real' && typeof choice.ticker === 'string') && !(choice?.kind === 'fictional' && typeof choice.archetype === 'string' && Number.isFinite(choice.seed))) return false;
  const ok = (list: Decision[]) => Array.isArray(list) && list.every((d, i) => (d.card === null || c.turns[i]?.cards.some(k => k.id === d.card)) && leverKeys.every(k => Number.isFinite(d.levers?.[k]) && d.levers[k] >= leverRange[k][0] && d.levers[k] <= leverRange[k][1]));
  if (x.assignment && (typeof x.assignment.id !== 'string' || typeof x.assignment.title !== 'string')) return false;
  return ok(x.decisions) && (!x.challenge || (x.challenge.decisions.length === c.turns.length && ok(x.challenge.decisions) && Number.isFinite(x.challenge.revenue)));
}
const REAL_NAMES: Record<string, string> = { MSFT: 'Microsoft', WMT: 'Walmart', JPM: 'JPMorgan Chase' };
const describeChoice = (c: CompanyChoice) => c.kind === 'real' ? REAL_NAMES[c.ticker] ?? c.ticker : `a fictional ${archetypeLabels[c.archetype].toLowerCase()} company`;
const read = (): Saved | null => { try { const s = JSON.parse(localStorage.getItem(STORAGE) || 'null'); return valid(s) ? s : null; } catch { return null; } };
const write = (s: Saved | null) => { try { if (s) localStorage.setItem(STORAGE, JSON.stringify(s)); else localStorage.removeItem(STORAGE); } catch { /* Storage is optional. */ } };

export default function CeoApp() {
  const [archetypes, loadError] = useArchetypes();
  const [error, setError] = useState('');
  useEffect(() => { if (loadError) setError(loadError); }, [loadError]);
  const [route, setRoute] = useState(location.hash);
  const [saved, setSaved] = useState<Saved | null>(read);
  const [start, setStart] = useState<StartCompany | null>(null);
  // A challenge link (#/ceo?challenge=…) is offered, never started without the player's say-so.
  // A class assignment link (#/ceo?assignment=…) is offered the same way.
  const [incoming, setIncoming] = useState<ReturnType<typeof decodeChallenge>>(null), [badLink, setBadLink] = useState(false);
  const [classLink, setClassLink] = useState<ReturnType<typeof decodeAssignment>>(null);
  useEffect(() => {
    const check = () => {
      setRoute(location.hash);
      const code = challengeFromHash(location.hash), assignment = assignmentFromHash(location.hash);
      if (code) { const c = decodeChallenge(code); setIncoming(c); setBadLink(!c); }
      if (assignment) { const a = decodeAssignment(assignment); setClassLink(a); setBadLink(!a); }
    };
    check(); addEventListener('hashchange', check); return () => removeEventListener('hashchange', check);
  }, []);
  const clearLink = () => { setIncoming(null); setClassLink(null); setBadLink(false); history.replaceState(null, '', `${location.pathname}${location.search}#/ceo`); };
  const join = (a: Assignment) => { setError(''); update({ caseId: a.caseId, choice: a.choice, sandbox: a.sandbox, decisions: [], stage: 'briefing', assignment: { id: a.id, title: a.title } }); clearLink(); };
  const accept = (c: Challenge) => { setError(''); update({ caseId: c.caseId, choice: c.choice, sandbox: c.sandbox, decisions: [], stage: 'briefing', challenge: { name: c.name, decisions: c.decisions, revenue: c.revenue } }); clearLink(); };

  const caseDef = useMemo(() => saved ? resolveCase(saved.caseId, saved.sandbox) : undefined, [saved?.caseId, JSON.stringify(saved?.sandbox)]);
  useEffect(() => {
    setStart(null);
    if (!saved || !archetypes || !caseDef) return;
    let live = true;
    startFor(saved.choice, archetypes).then(s => { if (live) setStart(prepareStart(s, caseDef.setup)); }).catch(e => { if (live) { setError(e.message); update(null); } });
    return () => { live = false; };
  }, [caseDef, JSON.stringify(saved?.choice), archetypes]);

  const update = (next: Saved | null) => { setSaved(next); write(next); };
  const game: Game | null = useMemo(() => start && caseDef && saved ? { start, caseDef, seed: caseDef.seed, decisions: saved.decisions } : null, [start, caseDef, saved]);
  const ready = game && start?.id && saved;
  const instructor = route.startsWith('#/ceo/instructor');

  return <main className="app-shell ceo-app">
    <header className="masthead ceo-masthead">
      <div className="brand"><div className="edition">ECONOMIC SYSTEMS LAB <span>CEO MODE / TRAINING GAME</span> <ThemeSwitch /></div><h1>The Going Concern Machine</h1><p>You are the CEO. Decide, then watch the machine play the year forward.</p></div>
      <nav className="ceo-nav"><a className="text-button back-link" href={instructor ? '#/ceo' : '#/ceo/instructor'}><GraduationCap size={13} /> {instructor ? 'Play CEO mode' : 'Instructor view'}</a><a className="text-button back-link" href="#/"><ArrowLeft size={13} /> Company machines</a></nav>
    </header>
    {instructor ? <Instructor archetypes={archetypes} /> : <>
    {classLink && <section className="challenge-banner" aria-labelledby="class-title">
      <GraduationCap size={22} aria-hidden="true" />
      <div><h2 id="class-title">Class assignment: {classLink.title}</h2>
        <p>Your instructor set <strong>{classLink.caseDef.title}</strong> as {describeChoice(classLink.choice)}. Everyone in the class plays the same world. At the end you will get a results link to hand in.{saved ? ' Starting replaces your game in progress.' : ''}</p></div>
      <div className="challenge-actions"><button className="primary-button" onClick={() => join(classLink)}>Start the assignment</button><button className="text-button" onClick={clearLink}>Not now</button></div>
    </section>}
    {incoming && <section className="challenge-banner" aria-labelledby="challenge-title">
      <Swords size={22} aria-hidden="true" />
      <div><h2 id="challenge-title">{incoming.name ? `${incoming.name} challenged you` : 'You have been challenged'}</h2>
        <p>Play <strong>{incoming.caseDef.title}</strong> as {describeChoice(incoming.choice)}: the same world, the same events and the same luck. Their decisions stay hidden until your debrief; beat their judgement grade.{saved ? ' Accepting replaces your game in progress.' : ''}</p></div>
      <div className="challenge-actions"><button className="primary-button" onClick={() => accept(incoming)}>Accept the challenge</button><button className="text-button" onClick={clearLink}>Not now</button></div>
    </section>}
    {badLink && <div className="notice" role="alert">That link is incomplete or no longer matches the game. Ask for a new one. <button className="text-button" onClick={clearLink}>Dismiss</button></div>}
    {error && <div className="notice" role="alert">{error} <button className="text-button" onClick={() => setError('')}>Dismiss</button></div>}
    {!saved && (archetypes ? <Setup archetypes={archetypes} begin={(caseId, choice, sandbox) => { setError(''); update({ caseId, choice, decisions: [], stage: 'briefing', sandbox }); }} /> : !error && <p className="empty-state">Loading industries…</p>)}
    {saved && !ready && !error && <p className="empty-state">Preparing your company…</p>}
    {ready && saved.stage === 'briefing' && <Briefing game={game} challenger={saved.challenge && { name: saved.challenge.name, refreshed: Math.round(game.start.baseline.state.revenue) !== saved.challenge.revenue }} assignment={saved.assignment} begin={() => update({ ...saved, stage: 'play' })} quit={() => update(null)} />}
    {ready && saved.stage === 'play' && <Play key={game.start.id + game.caseDef.id} game={game} decide={d => update({ ...saved, decisions: [...saved.decisions, d] })} finish={() => update({ ...saved, stage: 'debrief' })} quit={() => update(null)} />}
    {ready && saved.stage === 'debrief' && <Debrief game={game} share={{ choice: saved.choice, sandbox: saved.sandbox, assignment: saved.assignment }} challenger={saved.challenge} again={() => update({ ...saved, decisions: [], stage: 'briefing' })} quit={() => update(null)} />}
    </>}
    <footer className="ceo-footer">A training game on fictional or hypothetical futures. It is not financial advice or a forecast of any real company.</footer>
  </main>;
}
