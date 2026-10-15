import { useRef, useState } from 'react';
import { modules } from '../modules';
import { download } from '../progress';
import { complete } from '../text';
import { MIN_WORDS, type Course, type ModuleDef, type Progress } from '../types';

function status(def: ModuleDef, p: Progress) {
  const m = p.modules[def.id];
  if (!def.ready) return { tag: 'Coming soon', cls: '', pct: 0, note: `${def.planned?.length ?? 0} concepts planned` };
  if (!m) return { tag: '~45 min', cls: '', pct: 0, note: 'Not started' };
  if (m.stage === 'complete') return { tag: 'Complete', cls: 'good', pct: 100, note: 'Ready to hand in' };
  const concepts = def.concepts.filter(c => complete(m.concepts[c.id], MIN_WORDS.concept)).length;
  const note = m.stage === 'concepts' || m.stage === 'briefing' ? `Concept ${Math.min(concepts + 1, def.concepts.length)} of ${def.concepts.length}` : m.stage === 'decisions' ? `Year ${m.decisions.length + 1} of 5` : m.stage === 'debrief' ? 'Debrief' : 'End-of-module check';
  const pct = Math.round(100 * (concepts + m.decisions.length + (m.reflection ? 1 : 0) + Object.keys(m.check).length) / (def.concepts.length + 5 + 1 + def.check.length));
  return { tag: 'In progress', cls: 'accent', pct, note };
}

export default function Home({ course, progress, setStudent, open, submit, restore }: {
  course: Course; progress: Progress; setStudent: (k: keyof Progress['student'], v: string) => void; open: (id: string) => void; submit: () => void; restore: (text: string) => string | null;
}) {
  const file = useRef<HTMLInputElement>(null), [message, setMessage] = useState('');
  const list = course.modules.map(id => modules.find(m => m.id === id)!).filter(Boolean);
  const done = list.filter(m => progress.modules[m.id]?.stage === 'complete').length;
  return <section className="stack-lg">
    <div className="banner">
      <div className="stack-sm"><span className="eyebrow">Course</span><h1>{course.title}</h1><p className="muted">{course.code} · {course.lecturer}{course.due ? ` · hand in by ${course.due}` : ''}</p></div>
      <div className="row"><span className="c-tag accent">{done} of {list.length} complete</span><button className="btn" onClick={submit}>Hand in</button></div>
    </div>
    <div className="card student">
      {(['name', 'id', 'email'] as const).map(k => <div className="field" key={k}>
        <label htmlFor={`student-${k}`}>{k === 'name' ? 'Full name' : k === 'id' ? 'Student ID' : 'University email'}</label>
        <input id={`student-${k}`} type={k === 'email' ? 'email' : 'text'} autoComplete={k === 'name' ? 'name' : k === 'email' ? 'email' : 'off'} value={progress.student[k]} onChange={e => setStudent(k, e.target.value)} />
      </div>)}
    </div>
    <div className="mods">
      {list.map(m => { const s = status(m, progress); return <button key={m.id} className="card mod" disabled={!m.ready} onClick={() => open(m.id)}>
        <div className="row spread"><span className="eyebrow">Module {m.number} · {m.topic}</span><span className={`c-tag ${s.cls}`}>{s.tag}</span></div>
        <h3>{m.title}</h3>
        <p className="small">{m.summary}</p>
        <p className="small muted concepts-line">{(m.ready ? m.concepts.map(c => c.short) : m.planned ?? []).join(' · ')}</p>
        <div className="progress"><i style={{ width: `${s.pct}%` }} /></div>
        <span className="small muted mono">{s.note}</span>
      </button>; })}
    </div>
    <div className="row small muted">
      <span>Your work is saved in this browser.</span>
      <button className="link" onClick={() => download(`going-concern-${course.id}-progress.json`, JSON.stringify(progress), 'application/json')}>Export progress</button>
      <button className="link" onClick={() => file.current?.click()}>Import progress</button>
      <input ref={file} type="file" accept="application/json,.json" hidden onChange={async e => { const f = e.target.files?.[0]; if (!f) return; const err = restore(await f.text()); setMessage(err ?? 'Progress imported.'); e.target.value = ''; }} />
      {message && <span role="status">{message}</span>}
    </div>
  </section>;
}
