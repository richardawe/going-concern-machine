import { useEffect, useState, type AnchorHTMLAttributes, type ReactNode } from 'react';

// A small history-based router: real paths (/courses/…), so links can be shared and bookmarked.

const EVENT = 'gcm:navigate';
export function navigate(to: string, { replace = false } = {}) {
  if (replace) history.replaceState(null, '', to); else history.pushState(null, '', to);
  dispatchEvent(new Event(EVENT));
  window.scrollTo(0, 0);
}
export function usePath() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const f = () => setPath(location.pathname);
    addEventListener('popstate', f); addEventListener(EVENT, f);
    return () => { removeEventListener('popstate', f); removeEventListener(EVENT, f); };
  }, []);
  return path;
}
export const query = (name: string) => new URLSearchParams(location.search).get(name);

/** Matches /courses/:id against a path; returns the params or null. */
export function match(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split('/').filter(Boolean), b = path.split('/').filter(Boolean);
  if (a.length !== b.length) return null;
  const out: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) out[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return out;
}

export function Link({ to, children, ...rest }: { to: string; children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a href={to} {...rest} onClick={e => {
    rest.onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault(); navigate(to);
  }}>{children}</a>;
}
