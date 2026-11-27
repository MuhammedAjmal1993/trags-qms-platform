import { useEffect, useRef, useState, useCallback } from 'react';
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function handle(res: Response) {
  const ct = res.headers.get('content-type') || '';
  const body = ct.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = typeof body === 'object' && body && 'error' in body ? (body as any).error : String(body || res.statusText);
    if (res.status === 401 && !location.pathname.startsWith('/login')) window.dispatchEvent(new CustomEvent('auth:expired'));
    if (res.status === 428) window.dispatchEvent(new CustomEvent('auth:mustchange'));
    throw new ApiError(res.status, msg);
  }
  return body;
}

export const api = {
  get: <T = any>(url: string): Promise<T> => fetch(url, { credentials: 'same-origin' }).then(handle),
  post: <T = any>(url: string, data?: unknown): Promise<T> =>
    fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data ?? {}) }).then(handle),
  put: <T = any>(url: string, data?: unknown): Promise<T> =>
    fetch(url, { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data ?? {}) }).then(handle),
  del: <T = any>(url: string): Promise<T> => fetch(url, { method: 'DELETE', credentials: 'same-origin' }).then(handle),
  form: <T = any>(url: string, fd: FormData): Promise<T> => fetch(url, { method: 'POST', credentials: 'same-origin', body: fd }).then(handle),
};

export const fileUrl = (key: string, download = false) => `/api/files?key=${encodeURIComponent(key)}${download ? '&dl=1' : ''}`;

export function qs(o: Record<string, unknown>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

// ---- Stale-while-revalidate cache: show the last result instantly, refresh in the background. ----

const mem = new Map<string, { t: number; v: unknown }>();
const KEY = (u: string) => `swr:${u}`;
function readCache<T>(url: string): T | undefined {
  const m = mem.get(url);
  if (m) return m.v as T;
  try { const s = sessionStorage.getItem(KEY(url)); if (s) { const p = JSON.parse(s); mem.set(url, p); return p.v as T; } } catch { /* storage unavailable */ }
  return undefined;
}
function writeCache(url: string, v: unknown) {
  const e = { t: Date.now(), v };
  mem.set(url, e);
  try { const s = JSON.stringify(e); if (s.length < 1_500_000) sessionStorage.setItem(KEY(url), s); } catch { /* quota or private mode */ }
}
export const peekCache = readCache;
export const putCache = writeCache;

export function clearCache() {
  mem.clear();
  inflight.clear();
  try { for (const k of Object.keys(sessionStorage)) if (k.startsWith('swr:')) sessionStorage.removeItem(k); } catch { /* ignore */ }
}
// Any write invalidates cached reads (the server bumps its data version on every write too).
for (const m of ['post', 'put', 'del', 'form'] as const) {
  const orig = (api as any)[m];
  (api as any)[m] = (...a: unknown[]) => orig(...a).then((r: unknown) => { if (!String(a[0]).startsWith('/api/public')) clearCache(); return r; });
}

// Components that mount together (sidebar badge, page, filter bar) often ask for the same URL at once:
// share one request per URL while it is in flight.
const inflight = new Map<string, Promise<unknown>>();
function getShared<T>(url: string): Promise<T> {
  let p = inflight.get(url) as Promise<T> | undefined;
  if (!p) {
    p = api.get<T>(url).finally(() => inflight.delete(url));
    inflight.set(url, p);
  }
  return p;
}

export function useSWR<T = any>(url: string | null, opts: { refreshMs?: number } = {}) {
  const [data, setData] = useState<T | undefined>(() => (url ? readCache<T>(url) : undefined));
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const cur = useRef(url);
  const load = useCallback(async () => {
    if (!url) return;
    cur.current = url;
    setLoading(true);
    try {
      const v = await getShared<T>(url);
      if (cur.current === url) { setData(v); setError(''); writeCache(url, v); }
    } catch (e: any) { if (cur.current === url) setError(e.message || 'Failed to load'); }
    finally { if (cur.current === url) setLoading(false); }
  }, [url]);
  useEffect(() => {
    if (!url) return;
    const c = readCache<T>(url);
    if (c !== undefined) setData(c);
    load();
    if (opts.refreshMs) { const t = setInterval(load, opts.refreshMs); return () => clearInterval(t); }
  }, [url, load, opts.refreshMs]);
  return { data, error, loading, reload: load, stale: loading && data !== undefined };
}
