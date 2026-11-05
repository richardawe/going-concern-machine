import { useCallback, useEffect, useRef, useState } from 'react';
import type { ModuleProgress } from '../../course/types';
import { api, ApiError } from '../api';

// A student's saved work for one course, kept on the server. Each change saves two seconds after typing stops; a copy
// stays in this browser until the server has it, so a dropped connection loses nothing and catches up when it returns.
// If another tab or device saved first, the newer copy wins and the student is told.

export type SaveState = 'saved' | 'saving' | 'waiting' | 'offline' | 'replaced' | 'error';
interface Slot { data: ModuleProgress; version: number; dirty: boolean }
const DELAY = 2000, RETRY = 6000;

export function useCourseProgress(userId: string, courseId: string) {
  const [modules, setModules] = useState<Record<string, ModuleProgress>>({});
  const [loaded, setLoaded] = useState(false), [state, setState] = useState<SaveState>('saved'), [error, setError] = useState('');
  const slots = useRef<Record<string, Slot>>({}), timers = useRef<Record<string, number>>({}), inflight = useRef<Set<string>>(new Set());
  const key = (m: string) => `gcm:portal:v1:${userId}:${courseId}:${m}`;
  const keep = (m: string) => { try { localStorage.setItem(key(m), JSON.stringify(slots.current[m])); } catch { /* storage full or blocked */ } };
  const forget = (m: string) => { try { localStorage.removeItem(key(m)); } catch { /* ignore */ } };
  const anyDirty = () => Object.values(slots.current).some(s => s.dirty);

  const save = useCallback(async (m: string) => {
    const slot = slots.current[m];
    if (!slot?.dirty || inflight.current.has(m)) return;
    inflight.current.add(m); setState('saving');
    const sent = slot.data;
    try {
      const r = await api<{ version: number }>(`/api/courses/${courseId}/progress/${m}`, { method: 'PUT', body: { version: slot.version, data: sent } });
      const now = slots.current[m];
      slots.current[m] = { data: now.data, version: r.version, dirty: now.data !== sent };
      if (slots.current[m].dirty) keep(m); else forget(m);
      setState(anyDirty() ? 'waiting' : 'saved'); setError('');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const d = e.data as { data: ModuleProgress | null; version: number };
        slots.current[m] = { data: d.data ?? slot.data, version: d.version, dirty: !d.data };
        forget(m); setModules(prev => ({ ...prev, [m]: slots.current[m].data })); setState('replaced');
      } else if (e instanceof ApiError && (e.status === 0 || e.status >= 500)) {
        setState('offline'); timers.current[m] = window.setTimeout(() => void save(m), RETRY);
      } else { setState('error'); setError(e instanceof Error ? e.message : 'Your work could not be saved.'); }
    } finally { inflight.current.delete(m); }
    if (slots.current[m]?.dirty && !timers.current[m]) timers.current[m] = window.setTimeout(() => { delete timers.current[m]; void save(m); }, 300);
  }, [courseId]);

  useEffect(() => {
    let live = true;
    api<{ modules: Record<string, { data: ModuleProgress; version: number }> }>(`/api/courses/${courseId}/progress`).then(r => {
      if (!live) return;
      const next: Record<string, Slot> = {};
      for (const [m, v] of Object.entries(r.modules)) next[m] = { data: v.data, version: v.version, dirty: false };
      // Unsaved work left in this browser from a lost connection, if it was based on what the server still has.
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i); if (!k?.startsWith(key(''))) continue;
        try {
          const local = JSON.parse(localStorage.getItem(k)!) as Slot, m = k.slice(key('').length);
          if (local.dirty && local.version === (next[m]?.version ?? 0)) { next[m] = local; } else localStorage.removeItem(k);
        } catch { /* ignore a bad copy */ }
      }
      slots.current = next;
      setModules(Object.fromEntries(Object.entries(next).map(([m, s]) => [m, s.data])));
      setLoaded(true);
      for (const m of Object.keys(next)) if (next[m].dirty) void save(m);
    }).catch(e => { if (live) { setError(e instanceof Error ? e.message : 'Your work could not be loaded.'); setLoaded(true); } });
    return () => { live = false; };
  }, [courseId]);

  // Send anything unsaved when the page closes.
  useEffect(() => {
    const flush = () => { for (const [m, s] of Object.entries(slots.current)) if (s.dirty) void api(`/api/courses/${courseId}/progress/${m}`, { method: 'PUT', body: { version: s.version, data: s.data }, keepalive: true }).catch(() => {}); };
    addEventListener('pagehide', flush);
    return () => { removeEventListener('pagehide', flush); for (const t of Object.values(timers.current)) clearTimeout(t); };
  }, [courseId]);

  const update = useCallback((m: string, f: (p: ModuleProgress) => ModuleProgress, empty: () => ModuleProgress) => {
    const cur = slots.current[m], data = f(cur?.data ?? empty());
    slots.current[m] = { data, version: cur?.version ?? 0, dirty: true };
    keep(m); setModules(prev => ({ ...prev, [m]: data })); setState('waiting');
    clearTimeout(timers.current[m]); timers.current[m] = window.setTimeout(() => { delete timers.current[m]; void save(m); }, DELAY);
  }, [save]);

  /** Saves everything now (before handing in). */
  const flush = useCallback(async () => {
    for (const m of Object.keys(slots.current)) { clearTimeout(timers.current[m]); delete timers.current[m]; }
    for (let i = 0; i < 20 && (anyDirty() || inflight.current.size); i++) {
      await Promise.all(Object.keys(slots.current).map(m => save(m)));
      if (inflight.current.size) await new Promise(r => setTimeout(r, 150));
    }
    if (anyDirty()) throw new Error('Some of your work hasn’t saved yet. Check your connection and try again.');
  }, [save]);

  return { modules, loaded, state, error, update, flush };
}

export const saveLabel = (s: SaveState) => ({ saved: '✓ Saved to your account', saving: 'Saving…', waiting: 'Saving…', offline: 'Offline: kept on this device, will save when you reconnect', replaced: 'Updated with newer work from your other tab or device', error: 'Not saved' })[s];
