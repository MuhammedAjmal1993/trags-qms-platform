// Response cache keyed by request + data version. Any record write bumps data_version,
// so dashboards are recomputed only after data changes; repeat views are served instantly.
import type { Env } from './lib';

let memVersion: { v: number; at: number } | null = null;

export async function dataVersion(env: Env): Promise<number> {
  if (memVersion && Date.now() - memVersion.at < 3000) return memVersion.v;
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key='data_version'").first<{ value: string }>();
  memVersion = { v: Number(r?.value || 1), at: Date.now() };
  return memVersion.v;
}

export async function bumpVersion(env: Env) {
  await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('data_version','2') ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1").run();
  memVersion = null;
}

export async function cached(env: Env, key: string, build: () => Promise<string>): Promise<Response> {
  const v = await dataVersion(env);
  const hit = await env.DB.prepare('SELECT v, body FROM api_cache WHERE k = ?').bind(key).first<{ v: number; body: string }>();
  let body: string;
  if (hit && hit.v === v) body = hit.body;
  else {
    body = await build();
    if (body.length < 1_800_000) await env.DB.prepare("INSERT INTO api_cache (k, v, body, at) VALUES (?,?,?,datetime('now')) ON CONFLICT(k) DO UPDATE SET v = excluded.v, body = excluded.body, at = excluded.at").bind(key, v, body).run();
  }
  return new Response(body, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-data-version': String(v) } });
}
