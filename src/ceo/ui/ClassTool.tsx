import Instructor from './Instructor';
import { useArchetypes } from './load';
import './ceo.css';

// The CEO mode class tool (assignment links and class grading), for signed-in lecturers on a university's site and
// for the platform console. It isn't on the public site. Students still play on the public site, so `playUrl`
// points the class links there.
export default function ClassTool({ playUrl }: { playUrl: string }) {
  const [archetypes, error] = useArchetypes();
  return <div className="ceo ceo-class-tool">
    {error && <p className="notice" role="alert">{error}</p>}
    <Instructor archetypes={archetypes} playUrl={playUrl} />
  </div>;
}
