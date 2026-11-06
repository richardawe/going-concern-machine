import { useEffect } from 'react';
import SiteNav, { SiteFooter } from './SiteNav';
import { Drawing, EngineStage } from './Drawing';
import { credits } from './drawings';

export default function Credits() {
  useEffect(() => { document.title = 'Drawings and credits · Going Concern Lab'; }, []);
  return <div className="site">
    <SiteNav current="credits" />
    <section className="site-block site-credits">
      <div className="site-head"><div><div className="site-kicker">Drawings and credits</div><h2>The machines behind the machine</h2></div>
        <p>Every drawing on this site is a real measured drawing or engraving, in the public domain. We recolour them with the site's ink and set some of them in motion; the originals are linked below.</p></div>
      <ul className="site-credit-list">{credits.map(c =>
        <li key={c.name}>
          <div className="site-credit-art">{c.name === 'beamEngine' ? <EngineStage /> : <Drawing name={c.name} fit="cover" />}</div>
          <div><h3>{c.title}</h3><p>{c.place}</p><p className="site-credit-meta">{c.source} · Used for: {c.usedFor}</p><a href={c.url} target="_blank" rel="noreferrer">View the original on Wikimedia Commons →</a></div>
        </li>)}</ul>
      <p className="site-credit-foot">Historic American Engineering Record drawings were made for the US government and carry no known copyright restrictions. The 1765 <i>Encyclopédie</i> plate is long out of copyright. Credit is given as good practice.</p>
    </section>
    <SiteFooter />
  </div>;
}
