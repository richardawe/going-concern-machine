import { useEffect, useRef, useState, type ReactNode } from 'react';
import ThemeSwitch from '../components/ThemeSwitch';
import { Link } from './router';
import { Drawing } from '../site/Drawing';

// Shared pieces for every portal page, built on the course app's instrument-card look (course.css).

export const ukDateTime = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–';
export const ukDate = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric' }) : '–';
export const ago = (iso: string | null | undefined) => {
  if (!iso) return 'never';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : s < 172800 ? 'yesterday' : ukDate(iso);
};
/** <input type="datetime-local"> works in the browser's own time zone; convert both ways. */
export const toLocalInput = (iso: string | null | undefined) => { if (!iso) return ''; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
export const fromLocalInput = (v: string) => v ? new Date(v).toISOString() : null;
export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

export interface NavItem { to: string; label: string; active: boolean }

export function Shell({ brand, place, crest, color, nav, who, role, children, onSignOut }: {
  brand: string; place?: string; crest: string; color?: string | null; nav: NavItem[]; who?: string; role?: string; children: ReactNode; onSignOut?: () => void;
}) {
  return <div className="course portal" style={color ? { ['--uni' as string]: color } : undefined}>
    <header className="course-top">
      <Drawing name="millGearing" className="page-drawing" fit="cover" />
      <div className="course-top-row">
        <Link className="course-brand portal-brand" to="/"><span className={`crest${color ? '' : ' plain'}`} aria-hidden="true">{crest}</span><b>{brand}</b>{place && <span>{place}</span>}</Link>
        <nav className="course-nav" aria-label="Main">
          {nav.map(n => <Link key={n.to} to={n.to} aria-current={n.active ? 'page' : undefined}>{n.label}</Link>)}
          {who && <span className="portal-who" title={who}>{role && <span className="c-tag">{role}</span>}</span>}
          {onSignOut && <button className="link small portal-signout" onClick={onSignOut}>Sign out</button>}
          <ThemeSwitch />
        </nav>
      </div>
    </header>
    <main className="course-main">{children}</main>
    <footer className="course-foot portal-foot"><span>{place ? `${place} · ` : ''}Going Concern</span><span><a href="/legal/privacy">Privacy</a> · <a href="/legal/accessibility">Accessibility</a></span></footer>
  </div>;
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'error' | 'good' | 'warn'; children: ReactNode }) {
  return <p className={`c-notice portal-notice ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</p>;
}

export function Kpis({ items }: { items: { value: ReactNode; label: ReactNode; bar?: number }[] }) {
  return <div className="kpis">{items.map((k, i) => <div className="card kpi" key={i}><b>{k.value}</b><span>{k.label}</span>{k.bar !== undefined && <div className="progress"><i style={{ width: `${Math.min(100, Math.max(0, k.bar))}%` }} /></div>}</div>)}</div>;
}

export function Loading({ what = 'Loading…' }: { what?: string }) { return <p className="small muted" role="status">{what}</p>; }

export function Tabs<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return <div className="portal-tabs" role="tablist" aria-label={label}>
    {options.map(o => <button key={o.id} role="tab" aria-selected={o.id === value} className={o.id === value ? 'on' : ''} onClick={() => onChange(o.id)}>{o.label}</button>)}
  </div>;
}

/** A button that runs an async action, shows it is busy, and reports failure next to itself. */
export function Action({ run, children, className = 'btn', disabled, confirm }: { run: () => Promise<unknown>; children: ReactNode; className?: string; disabled?: boolean; confirm?: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [asking, setAsking] = useState(false);
  const go = async () => {
    if (confirm && !asking) { setAsking(true); return; }
    setAsking(false); setBusy(true); setError('');
    try { await run(); } catch (e) { setError(e instanceof Error ? e.message : 'That didn’t work.'); }
    setBusy(false);
  };
  return <span className="action">
    <button className={className} disabled={disabled || busy} onClick={go}>{busy ? 'Working…' : asking ? confirm : children}</button>
    {asking && <button className="link small" onClick={() => setAsking(false)}>Cancel</button>}
    {error && <span className="small portal-error" role="alert">{error}</span>}
  </span>;
}

/** Six boxes for a sign-in code; pasting the whole code fills them all. */
export function CodeInput({ value, onChange, onDone, label }: { value: string; onChange: (v: string) => void; onDone?: (v: string) => void; label: string }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => { refs.current[0]?.focus(); }, []);
  const set = (v: string) => { const d = v.replace(/\D/g, '').slice(0, 6); onChange(d); if (d.length === 6) onDone?.(d); return d; };
  return <div className="codebox" role="group" aria-label={label}>
    {Array.from({ length: 6 }, (_, i) => <input key={i} ref={el => { refs.current[i] = el; }} inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} aria-label={`Digit ${i + 1}`}
      value={value[i] ?? ''} maxLength={i === 0 ? 6 : 1}
      onChange={e => {
        const typed = e.target.value.replace(/\D/g, '');
        if (typed.length > 1) { const d = set(typed); refs.current[Math.min(d.length, 5)]?.focus(); return; }
        const next = (value.slice(0, i) + typed + value.slice(i + 1)).slice(0, 6);
        set(next); if (typed && i < 5) refs.current[i + 1]?.focus();
      }}
      onKeyDown={e => { if (e.key === 'Backspace' && !value[i] && i > 0) refs.current[i - 1]?.focus(); }}
      onPaste={e => { e.preventDefault(); const d = set(e.clipboardData.getData('text')); refs.current[Math.min(d.length, 5)]?.focus(); }} />)}
  </div>;
}

export function Empty({ children }: { children: ReactNode }) { return <div className="card pad portal-empty"><p className="small muted">{children}</p></div>; }
