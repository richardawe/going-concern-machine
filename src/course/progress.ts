import { useCallback, useEffect, useState } from 'react';
import type { Course, ModuleProgress, Payload, Progress } from './types';

// A student's work lives in this browser until they hand it in. Export and import move it between devices.
const key = (course: string) => `gcm:course:v1:${course}`;
const handinKey = (course: string) => `gcm:course:v1:${course}:handin`;

export const emptyModule = (): ModuleProgress => ({ stage: 'briefing', concept: 0, concepts: {}, decisions: [], check: {}, checked: false });
export const emptyProgress = (course: Course): Progress => ({ course: course.id, student: { name: '', id: '', email: '' }, modules: {} });

function looksValid(x: unknown, course: string): x is Progress {
  const p = x as Progress;
  return !!p && typeof p === 'object' && p.course === course && !!p.student && typeof p.student.name === 'string' && !!p.modules && typeof p.modules === 'object';
}
export function readProgress(course: Course): Progress {
  try { const p = JSON.parse(localStorage.getItem(key(course.id)) || 'null'); if (looksValid(p, course.id)) return p; } catch { /* storage blocked or corrupt */ }
  return emptyProgress(course);
}

/** Saved progress for a course, written back on every change. */
export function useProgress(course: Course): [Progress, (f: (p: Progress) => Progress) => void, (text: string) => string | null] {
  const [progress, setProgress] = useState(() => readProgress(course));
  useEffect(() => setProgress(readProgress(course)), [course.id]);
  const update = useCallback((f: (p: Progress) => Progress) => setProgress(prev => {
    const next = f(prev);
    try { localStorage.setItem(key(course.id), JSON.stringify(next)); } catch { /* keep working in memory */ }
    return next;
  }), [course.id]);
  /** Replaces progress from an exported file; returns an error message, or null. */
  const restore = (text: string) => {
    try { const p = JSON.parse(text); if (!looksValid(p, course.id)) return 'That file is not saved progress for this course.'; update(() => p); return null; }
    catch { return 'That file could not be read.'; }
  };
  return [progress, update, restore];
}
export const updateModule = (p: Progress, id: string, f: (m: ModuleProgress) => ModuleProgress): Progress => ({ ...p, modules: { ...p.modules, [id]: f(p.modules[id] ?? emptyModule()) } });

/** The last hand-in: kept so the PDF can be downloaded again with the same verification code. */
export interface Handin { payload: Payload; sealed: string; code: string }
export function readHandin(course: string): Handin | null { try { return JSON.parse(localStorage.getItem(handinKey(course)) || 'null'); } catch { return null; } }
export function saveHandin(course: string, h: Handin) { try { localStorage.setItem(handinKey(course), JSON.stringify(h)); } catch { /* still usable this session */ } }

export function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type })), a = document.createElement('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
