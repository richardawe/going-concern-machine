import { useEffect } from 'react';
import SiteNav, { SiteFooter, onPlatform, staticPage } from './SiteNav';
import { Drawing } from './Drawing';

// Old links to the modules prototype (#/course) land here: the modules are for universities that sign up, and the
// prototype is shown from the platform console.
export default function ModulesClosed() {
  useEffect(() => { document.title = 'Going Concern Modules · for universities'; }, []);
  return <div className="site">
    <SiteNav current="universities" />
    <section className="site-block site-closed">
      <Drawing name="millGearing" className="site-closed-art" fit="cover" />
      <div className="site-kicker">Going Concern Modules</div>
      <h2>The modules are for universities</h2>
      <p>Students reach them through their university's own space on Going Concern, signing in with their university email. If your university uses Going Concern, sign in to carry on; if you'd like it for your course, see the university edition.</p>
      <div className="site-cta">{onPlatform() && <a className="site-btn primary big" href="/sign-in">University sign-in →</a>}<a className="site-btn big" href={staticPage('universities/')}>See the university edition</a></div>
    </section>
    <SiteFooter />
  </div>;
}
