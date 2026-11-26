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
