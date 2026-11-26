// File storage. Uses R2 when the FILES binding exists; otherwise stores files in D1
// as 1 MB BLOB chunks (free plan: 5 GB). Keys are the same either way, so files move
// to R2 later without changing any record.
import type { Env } from './lib';

const CHUNK = 1024 * 1024;

export function hasR2(env: Env): boolean {
  return !!(env as any).FILES && typeof (env as any).FILES.put === 'function';
}

export async function putFile(env: Env, key: string, data: ArrayBuffer | ReadableStream | Blob, contentType: string): Promise<number> {
  if (hasR2(env)) {
    const body = data instanceof Blob ? data.stream() : data;
    const obj = await env.FILES.put(key, body as any, { httpMetadata: { contentType } });
    return obj?.size ?? 0;
  }
  const buf = data instanceof ArrayBuffer ? data : data instanceof Blob ? await data.arrayBuffer() : await new Response(data).arrayBuffer();
  const n = Math.max(1, Math.ceil(buf.byteLength / CHUNK));
  await env.DB.prepare('DELETE FROM file_chunks WHERE key = ?').bind(key).run();
  await env.DB.prepare('INSERT OR REPLACE INTO file_meta (key, mime, size, chunks) VALUES (?,?,?,?)').bind(key, contentType, buf.byteLength, n).run();
  for (let i = 0; i < n; i++) {
    await env.DB.prepare('INSERT INTO file_chunks (key, idx, data) VALUES (?,?,?)').bind(key, i, buf.slice(i * CHUNK, (i + 1) * CHUNK)).run();
  }
  return buf.byteLength;
}

export async function getFile(env: Env, key: string): Promise<{ body: ReadableStream | ArrayBuffer; contentType: string; size: number } | null> {
  if (hasR2(env)) {
    const obj = await env.FILES.get(key);
    if (obj) return { body: obj.body, contentType: obj.httpMetadata?.contentType || 'application/octet-stream', size: obj.size };
  }
  const meta = await env.DB.prepare('SELECT mime, size, chunks FROM file_meta WHERE key = ?').bind(key).first<{ mime: string; size: number; chunks: number }>();
  if (!meta) return null;
  let i = 0;
  const stream = new ReadableStream({
    async pull(ctrl) {
      if (i >= meta.chunks) { ctrl.close(); return; }
      const row = await env.DB.prepare('SELECT data FROM file_chunks WHERE key = ? AND idx = ?').bind(key, i).first<{ data: ArrayBuffer | number[] }>();
      i++;
      if (row?.data) ctrl.enqueue(row.data instanceof ArrayBuffer ? new Uint8Array(row.data) : new Uint8Array(row.data as number[]));
    },
  });
  return { body: stream, contentType: meta.mime || 'application/octet-stream', size: meta.size };
}

export async function getFileBytes(env: Env, key: string): Promise<ArrayBuffer | null> {
  const f = await getFile(env, key);
  if (!f) return null;
  return f.body instanceof ArrayBuffer ? f.body : await new Response(f.body).arrayBuffer();
}

export async function deleteFile(env: Env, key: string) {
  if (hasR2(env)) await env.FILES.delete(key);
  await env.DB.batch([env.DB.prepare('DELETE FROM file_chunks WHERE key = ?').bind(key), env.DB.prepare('DELETE FROM file_meta WHERE key = ?').bind(key)]);
}
