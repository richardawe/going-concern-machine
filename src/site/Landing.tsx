import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, Play } from 'lucide-react';
import SiteNav, { SiteFooter, onPlatform, staticPage } from './SiteNav';
import { Drawing, RunningEngine, usePlotIn } from './Drawing';
import type { DrawingName } from './drawings';

type Card = { name: Exclude<DrawingName, 'beamEngine'>; kicker: string; title: string; text: React.ReactNode; go: string; href: string; wide?: boolean; isNew?: boolean; position?: string; size?: string };
const cards: Card[] = [
  { name: 'gearsTrain', kicker: 'Explore', title: 'Company machine', text: 'Load a public company and see its revenue, margins, capital and free cash flow as one moving system. Pull a lever to fork a scenario and run it forward five years.', go: 'Open the machine', href: '#/machine', wide: true },
  { name: 'engineIsometric', kicker: 'Play', title: 'CEO mode', text: <>Price wars, talent exodus, cash crunch… Make five years of decisions, then get graded on <b>judgement</b> as well as outcome, and challenge a friend to the same world.</>, go: 'Choose a case', href: '#/ceo', wide: true, position: '50% 28%' },
  { name: 'artOfMilling', kicker: 'Watch', title: 'Live 3D company', text: "Play a case on a 3D site where every building, flow and figure is driven by the game's numbers.", go: 'Enter the site', href: '#/live', isNew: true, position: '30% 40%' },
  { name: 'millGearing', kicker: 'Learn', title: 'Going Concern Modules', text: 'Six modules that teach finance by running the company, with written answers, decisions and a verifiable PDF hand-in.', go: 'Try a module', href: '#/course' },
  { name: 'molino', kicker: 'Build', title: 'Your own business', text: 'No ticker needed. Enter revenue, cash, debt and capital for any business, then test it with shocks and scenarios.', go: 'Build a business', href: '#/machine/build', position: '0% 0%', size: '170%' },
];
const steps: [string, string, string, number, number][] = [
  ['Reported', 'Annual figures come from SEC filings, dated and sourced: the raw material.', '01', 13, 32],
  ['Translated', 'A sector module maps them onto gears, pipes and reservoirs.', '02', 38, 20],
  ['Explained', 'Click any part to see the calculation and where it came from.', '03', 53, 46],
  ['Simulated', 'Change a lever and watch cause and effect play out year by year.', '04', 78, 20],
];

export default function Landing() {
  const [ticker, setTicker] = useState(''), [kick, setKick] = useState(0), [count, setCount] = useState<number | null>(null);
  const [plotRef, plotted] = usePlotIn<HTMLDivElement>();
  useEffect(() => { document.title = 'Going Concern Lab · see any business as a machine'; }, []);
  useEffect(() => {
    let live = true;
    fetch(`${import.meta.env.BASE_URL}machines/index.json`).then(r => r.ok ? r.json() : null).then(d => { if (live && Array.isArray(d?.companies)) setCount(d.companies.length); }).catch(() => {});
    return () => { live = false; };
  }, []);
  const open = (e: FormEvent) => { e.preventDefault(); const t = ticker.trim().toUpperCase(); location.hash = t ? `#/machine/${encodeURIComponent(t)}` : '#/machine'; };
  const companies = count ? String(count) : '400+';
  return <div className="site">
    <SiteNav current="home" />
    <header className="site-hero">
      <div className="site-hero-copy">
        <div className="site-kicker">Economic Systems Lab · est. 2026</div>
        <h1>See any business as a <em>machine</em>. Then run it.</h1>
        <p className="site-lede">Going Concern Lab turns real company accounts into a working machine of cash, capital and momentum. Explore {companies} public companies, take the CEO's chair in a training game, or teach a whole cohort with assessed university modules.</p>
        <form className="site-ticker" onSubmit={open}>
          <label className="visually-hidden" htmlFor="landing-ticker">Company ticker</label>
          <input id="landing-ticker" value={ticker} maxLength={10} autoComplete="off" placeholder="Type a ticker, e.g. AAPL" onChange={e => { setTicker(e.target.value.toUpperCase()); setKick(k => k + 1); }} />
          <button className="site-btn primary" type="submit">Build the machine <ArrowRight size={15} /></button>
        </form>
        <div className="site-quick"><span>Try:</span>{['MSFT', 'WMT', 'JPM', 'AAPL'].map(t => <a key={t} href={`#/machine/${t}`}>{t}</a>)}<a href="#/machine/build">Build your own</a></div>
        <div className="site-cta"><button className="site-btn big" type="button" onClick={() => document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' })}><Play size={15} /> Watch the 75-second demo</button><a className="site-btn big" href="#/ceo">Play CEO mode</a></div>
      </div>
      <RunningEngine kick={kick} />
    </header>

    <div className="site-stats">
      <div><b>{companies}</b><span>public companies published from SEC filings</span></div>
      <div><b>6 + sandbox</b><span>CEO cases, each five years of decisions</span></div>
      <div><b>6 modules</b><span>48 finance concepts, assessed and graded</span></div>
      <div><b>0 setup</b><span>runs in the browser, nothing to install</span></div>
    </div>

    <section className="site-block">
      <div className="site-head"><div><div className="site-kicker">What you can do</div><h2>Five ways into the same machine</h2></div><p>Every tool runs on the same economic model, so what a student learns in a module is exactly what moves the gears in the company machine.</p></div>
      <div className="site-cards">{cards.map(c =>
        <a key={c.title} className={`site-card ${c.wide ? 'wide' : ''}`} href={c.href}>
          <div className="site-card-art"><Drawing name={c.name} fit="cover" position={c.position} size={c.size} /></div>
          <div className="site-card-body"><div className="site-kicker">{c.kicker}{c.isNew && <span className="site-tag">New</span>}</div><h3>{c.title}</h3><p>{c.text}</p><span className="site-go">{c.go} →</span></div>
        </a>)}</div>
    </section>

    <section className="site-block">
      <div className="site-head"><div><div className="site-kicker">How it works</div><h2>From filings to a running machine</h2></div><p>Raw cane goes in on the left, the gears transmit, and the engine keeps it all turning. A company works the same way.</p></div>
      <div className="site-how">
        <div ref={plotRef} className={`site-plot ${plotted ? 'in' : ''}`}>
          <Drawing name="caneMillLine" />
          {steps.map(([, , n, x, y]) => <span key={n} className="site-marker" style={{ left: `${x}%`, top: `${y}%` }}>{n}</span>)}
        </div>
        <ol className="site-steps">{steps.map(([title, text, n]) => <li key={n}><b>{n}</b><h3>{title}</h3><p>{text}</p></li>)}</ol>
      </div>
    </section>

    <section className="site-block">
      <div className="site-head"><div><div className="site-kicker">Who it's for</div><h2>Built for people who need to understand a business, not just read it</h2></div></div>
      <div className="site-audiences">
        <div><h3>Students and learners</h3><p>See why profit isn't cash, why growth can destroy value, and what a CEO actually trades off, by doing it.</p><a href="#/ceo">Start with CEO mode →</a></div>
        <div><h3>Lecturers and universities</h3><p>Assign modules or a CEO case to a whole cohort. Every hand-in is graded the same way and comes with a verifiable PDF.</p><a href={staticPage('universities/')}>See the university edition →</a></div>
        <div><h3>Investors and analysts</h3><p>Turn a 10-K into a machine you can inspect: every figure is sourced, dated and marked reported or assumed.</p><a href="#/machine">Load a company →</a></div>
      </div>
    </section>

    <section className="site-block site-demo" id="demo">
      <video controls preload="none" playsInline src={staticPage('demo/going-concern-machine-demo.mp4')} aria-label="75-second demo of the company machine" />
      <div><div className="site-kicker">75-second demo</div><h2>Watch a company come apart and put itself back together</h2><p>A quick tour of the machine: loading a real company, forking a scenario, injecting a shock and reading what changed.</p><a className="site-btn" href={staticPage('demo/')}>Open the demo page</a></div>
    </section>

    <section className="site-block">
      <div className="site-uni">
        <Drawing name="encyclopedie" className="site-uni-art" fit="cover" />
        <div><div className="site-kicker">For universities</div><h2>Bring the machine to your course</h2><p>Your own space on goingconcernlab.com, where students sign in with their university email. Lecturers create courses, follow progress and download graded hand-ins.</p>
          <div className="site-cta"><a className="site-btn primary big" href={staticPage('universities/')}>See the university edition →</a>{onPlatform() && <a className="site-btn big" href="/sign-in">University sign-in</a>}</div></div>
        <ul><li>Six assessed modules and CEO cases</li><li>Sign-in with university email, no passwords</li><li>Each university's data kept separate</li><li>Grades and verifiable PDF hand-ins, CSV export</li><li>Available now as a pilot</li></ul>
      </div>
    </section>
    <SiteFooter />
  </div>;
}
