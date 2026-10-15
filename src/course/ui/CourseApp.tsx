import { useEffect, useMemo, useState } from 'react';
import ThemeSwitch from '../../components/ThemeSwitch';
import { useArchetypes } from '../../ceo/ui/load';
import { moduleStart } from '../grade';
import { courseById, moduleById } from '../modules';
import { emptyModule, updateModule, useProgress } from '../progress';
import Home from './Home';
import Lecturer from './Lecturer';
import ModuleRunner from './ModuleRunner';
import Submit from './Submit';
import './course.css';

// Going Concern Modules, the university edition: #/course (modules), #/course/m/<module>, #/course/submit and
// #/course/lecturer. A lecturer's link can name the course with ?c=<id>.
function useRoute() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => { const f = () => setHash(location.hash); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  const [path, query] = hash.replace(/^#\/course\/?/, '').split('?');
  return { parts: path.split('/').filter(Boolean), course: new URLSearchParams(query ?? '').get('c') };
}

export default function CourseApp() {
  const route = useRoute(), course = courseById(route.course);
  const [progress, update, restore] = useProgress(course), [archetypes, archetypeError] = useArchetypes();
  const suffix = route.course ? `?c=${route.course}` : '';
  const nav = (path: string) => { location.hash = `#/course${path}${suffix}`; window.scrollTo(0, 0); };
  const [view, id] = route.parts, def = view === 'm' && id ? moduleById(id) : undefined;
  const start = useMemo(() => { try { return def && archetypes ? moduleStart(def, archetypes) : null; } catch { return null; } }, [def, archetypes]);
  const startError = archetypeError || (def && archetypes && !start ? 'The company for this module could not be built.' : '');
  useEffect(() => { document.title = `${def ? `${def.title} · ` : ''}Going Concern Modules`; }, [def]);

  return <div className="course">
    <header className="course-top">
      <div className="course-top-row">
        <a className="course-brand" href={`#/course${suffix}`}><b>GOING CONCERN · MODULES</b><span>{course.code}</span></a>
        <nav className="course-nav" aria-label="Course">
          <a href={`#/course${suffix}`} aria-current={!view ? 'page' : undefined}>Modules</a>
          <a href={`#/course/submit${suffix}`} aria-current={view === 'submit' ? 'page' : undefined}>Hand in</a>
          <a href={`#/course/lecturer${suffix}`} aria-current={view === 'lecturer' ? 'page' : undefined}>Lecturer</a>
          <ThemeSwitch />
        </nav>
      </div>
      <p className="course-proto">Prototype</p>
    </header>
    <main className="course-main">
      {!view && <Home course={course} progress={progress} restore={restore} open={m => nav(`/m/${m}`)} submit={() => nav('/submit')}
        setStudent={(k, v) => update(p => ({ ...p, student: { ...p.student, [k]: v } }))} />}
      {view === 'm' && (def?.ready
        ? <ModuleRunner def={def} progress={progress.modules[def.id] ?? emptyModule()} update={f => update(p => updateModule(p, def.id, f))}
            start={start} startError={startError} home={() => nav('')} submit={() => nav('/submit')} />
        : <p className="c-notice">That module isn’t available yet. <a href={`#/course${suffix}`}>Back to modules</a></p>)}
      {view === 'submit' && <Submit course={course} progress={progress} archetypes={archetypes} home={() => nav('')} />}
      {view === 'lecturer' && <Lecturer archetypes={archetypes} />}
    </main>
    <footer className="course-foot">A teaching simulation on fictional companies. It is not financial advice or a forecast of any real company.</footer>
  </div>;
}
