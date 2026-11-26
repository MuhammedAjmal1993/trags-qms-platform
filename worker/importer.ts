// One-off data loader: reads encrypted data chunks bundled under /import/ and writes them to D1.
// Runs from the cron trigger (and from the admin endpoint), within a daily write budget so that
// normal use of the platform always keeps write capacity on the free plan.
import type { Env } from './lib';
import { putFile } from './storage';
import { bumpVersion } from './cache';

interface ChunkInfo { name: string; kind: string; label: string; est: number; rows: number }
interface Manifest { batch: string; chunks: ChunkInfo[] }

const DAILY_BUDGET = 70000; // rows written per UTC day reserved for the import (free plan limit is 100,000)
let manifestCache: Manifest | null = null;

async function getSetting(env: Env, k: string) {
  return (await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(k).first<{ value: string }>())?.value ?? null;
}
async function setSetting(env: Env, k: string, v: string) {
  await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, v).run();
}
async function manifest(env: Env): Promise<Manifest | null> {
  if (manifestCache) return manifestCache;
  const r = await env.ASSETS.fetch(new Request('https://assets.local/import/manifest.json'));
  if (!r.ok) return null;
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('json')) return null; // SPA fallback page, not a manifest
  manifestCache = await r.json() as Manifest;
  return manifestCache;
}
const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function decrypt(env: Env, keyB64: string, name: string): Promise<Uint8Array> {
  const r = await env.ASSETS.fetch(new Request(`https://assets.local/import/${name}.bin`));
  if (!r.ok) throw new Error(`chunk ${name} missing`);
  const buf = new Uint8Array(await r.arrayBuffer());
  const key = await crypto.subtle.importKey('raw', b64(keyB64), 'AES-GCM', false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, key, buf.slice(12));
  return new Uint8Array(pt);
}

async function apply(env: Env, pt: Uint8Array): Promise<number> {
  if (pt[0] === 2) {
    const hl = new DataView(pt.buffer, pt.byteOffset + 1, 4).getUint32(0);
    const hdr = JSON.parse(new TextDecoder().decode(pt.slice(5, 5 + hl)));
    const body = pt.slice(5 + hl);
    await putFile(env, hdr.key, body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer, hdr.mime);
    return Math.ceil(body.byteLength / (1024 * 1024)) + 2;
  }
  const json = await new Response(new Blob([pt.slice(1)]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  const c = JSON.parse(json);
  let res: D1Result[] = [];
  if (c.kind === 'rows') {
    const st = env.DB.prepare(c.sql);
    res = await env.DB.batch((c.rows as unknown[][]).map((r) => st.bind(...r)));
  } else if (c.kind === 'sql') {
    res = await env.DB.batch((c.stmts as [string, unknown[]][]).map(([s, p]) => env.DB.prepare(s).bind(...p)));
  }
  return res.reduce((a, r) => a + Number((r.meta as any)?.rows_written ?? 0), 0);
}

export async function importStatus(env: Env) {
  const m = await manifest(env);
  if (!m) return { active: false };
  const pos = Number(await getSetting(env, `import_pos:${m.batch}`) || 0);
  const today = new Date().toISOString().slice(0, 10);
  const day = await getSetting(env, 'import_day');
  const used = day === today ? Number(await getSetting(env, 'import_used') || 0) : 0;
  const remaining = m.chunks.slice(pos);
  return {
    active: true, batch: m.batch, done: pos, total: m.chunks.length, next: m.chunks[pos]?.label || null,
    usedToday: used, budget: DAILY_BUDGET, rowsLeft: remaining.reduce((a, c) => a + (c.kind === 'rows' ? c.rows : 0), 0),
    error: await getSetting(env, 'import_error'), hasKey: !!(await getSetting(env, 'import_key')),
  };
}

export async function importStep(env: Env, maxChunks = 1): Promise<{ processed: number; stopped?: string }> {
  const m = await manifest(env);
  if (!m) return { processed: 0, stopped: 'no manifest' };
  const key = await getSetting(env, 'import_key');
  if (!key) return { processed: 0, stopped: 'no key' };
  const posKey = `import_pos:${m.batch}`;
  let pos = Number(await getSetting(env, posKey) || 0);
  if (pos >= m.chunks.length) return { processed: 0, stopped: 'complete' };
  const today = new Date().toISOString().slice(0, 10);
  let used = (await getSetting(env, 'import_day')) === today ? Number(await getSetting(env, 'import_used') || 0) : 0;
  let processed = 0;
  while (processed < maxChunks && pos < m.chunks.length) {
    const ch = m.chunks[pos];
    if (used + ch.est > DAILY_BUDGET) { await setSetting(env, 'import_day', today); await setSetting(env, 'import_used', String(used)); return { processed, stopped: 'daily budget reached' }; }
    try {
      const written = await apply(env, await decrypt(env, key, ch.name));
      used += Math.max(written, 1);
      pos++; processed++;
      await env.DB.batch([
        env.DB.prepare('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(posKey, String(pos)),
        env.DB.prepare('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind('import_day', today),
        env.DB.prepare('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind('import_used', String(used)),
        env.DB.prepare("DELETE FROM settings WHERE key = 'import_error'"),
      ]);
    } catch (e: any) {
      const msg = String(e?.message || e);
      try { await setSetting(env, 'import_error', `${ch.label}: ${msg}`.slice(0, 500)); } catch { /* write limit reached */ }
      return { processed, stopped: msg };
    }
  }
  if (processed) await bumpVersion(env);
  return { processed };
}
