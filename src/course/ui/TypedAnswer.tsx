import { useId, useRef } from 'react';
import { answer, wordCount } from '../text';
import type { Answer } from '../types';

/** A required typed answer: live word count against the minimum, and pasting is allowed but flagged to the lecturer. */
export default function TypedAnswer({ label, prompt, value, min, onChange, readOnly, rows = 6, placeholder }: {
  label: string; prompt?: string; value: Answer | undefined; min: number; onChange: (a: Answer) => void; readOnly?: boolean; rows?: number; placeholder?: string;
}) {
  // Paste fires before the change it causes, so the flag is held in a ref until that change arrives.
  const pasted = useRef(false), id = useId(), words = wordCount(value?.text ?? ''), done = words >= min;
  return <div className="typed">
    <label htmlFor={id}>{label}</label>
    {prompt && <p className="typed-prompt">{prompt}</p>}
    <textarea id={id} rows={rows} value={value?.text ?? ''} readOnly={readOnly} placeholder={placeholder ?? 'In your own words. Use the numbers where you can.'}
      onChange={e => onChange(answer(e.target.value, !!value?.pasted || pasted.current))}
      onPaste={() => { pasted.current = true; }} />
    <div className="typed-foot">
      <span>{value?.pasted ? <span className="flag">Contains pasted text</span> : null} {value?.pasted ? 'Your lecturer will see this flag.' : 'Typed answers only. Pasted text is flagged to your lecturer.'}</span>
      <span className={`count ${done ? 'ok' : ''}`}>{words} / {min} words</span>
    </div>
  </div>;
}
