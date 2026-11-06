import { useEffect } from 'react';
import SiteNav, { SiteFooter, onPlatform, staticPage } from './SiteNav';
import { Drawing } from './Drawing';

// Teaching tools that aren't public land here: the modules prototype (#/course) and the CEO mode class tool
// (#/ceo/instructor). Universities that sign up get them on their own site; the console shows them as demos.
const copy = {
  modules: { kicker: 'Going Concern Modules', title: 'The modules are for universities', text: "Students reach them through their university's own space on Going Concern Lab, signing in with their university email. If your university uses Going Concern Lab, sign in to carry on; if you'd like it for your course, see the university edition." },
  classes: { kicker: 'CEO mode classes', title: 'Class tools are for universities', text: "Setting a CEO mode assignment and grading the class is part of the university edition: lecturers find it under Teaching on their university's site. Anyone can still play CEO mode, and class links you've been given keep working." },
};
export default function ForUniversities({ tool }: { tool: keyof typeof copy }) {
  const c = copy[tool];
  useEffect(() => { document.title = `${c.kicker} · Going Concern Lab`; }, [c.kicker]);
  return <div className="site">
    <SiteNav current="universities" />
    <section className="site-block site-closed">
      <Drawing name="millGearing" className="site-closed-art" fit="cover" />
      <div className="site-kicker">{c.kicker}</div>
      <h2>{c.title}</h2>
      <p>{c.text}</p>
      <div className="site-cta">{onPlatform() && <a className="site-btn primary big" href="/sign-in">University sign-in →</a>}<a className="site-btn big" href={staticPage('universities/')}>See the university edition</a></div>
    </section>
    <SiteFooter />
  </div>;
}
