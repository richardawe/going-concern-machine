import { useCallback, useEffect, useState } from 'react';

// Talking to the server. Every request that changes something carries the x-gcm header, which the server requires,
// so another site can't make a signed-in browser act on our behalf.

export class ApiError extends Error {
  constructor(public status: number, message: string, public data: Record<string, unknown> | null) { super(message); }
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; keepalive?: boolean } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
      headers: { 'x-gcm': '1', ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin', keepalive: opts.keepalive,
    });
  } catch { throw new ApiError(0, 'Can’t reach Going Concern. Check your connection and try again.', null); }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Something went wrong (${res.status}).`, data);
  return data as T;
}

/** Loads a path and keeps it fresh: { data, error, loading, reload }. */
export function useLoad<T>(path: string | null) {
  const [state, setState] = useState<{ data: T | null; error: ApiError | null; loading: boolean }>({ data: null, error: null, loading: !!path });
  const load = useCallback(async (quiet = false) => {
    if (!path) return;
    if (!quiet) setState(s => ({ ...s, loading: true }));
    try { const data = await api<T>(path); setState({ data, error: null, loading: false }); }
    catch (e) { setState(s => ({ data: s.data, error: e as ApiError, loading: false })); }
  }, [path]);
  useEffect(() => { void load(); }, [load]);
  return { ...state, reload: load, setData: (f: (d: T | null) => T | null) => setState(s => ({ ...s, data: f(s.data) })) };
}

export const errorText = (e: unknown) => e instanceof Error ? e.message : 'Something went wrong.';
