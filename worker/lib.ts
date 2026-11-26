import type { Context } from 'hono';
import type { RegisterConfig } from '../shared/registers';

export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  AI: Ai;
  ASSETS: Fetcher;
  APP_NAME: string;
}

export interface SessionUser {
  id: number; email: string; name: string; title: string | null; site: string | null;
  role: string; role_id: number; permissions: Record<string, string[]>; must_change_pw: number;
}

export type AppEnv = { Bindings: Env; Variables: { user: SessionUser } };
export type Ctx = Context<AppEnv>;

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function can(user: SessionUser | undefined, module: string, action: string): boolean {
  if (!user) return false;
  const p = user.permissions || {};
  return Array.isArray(p[module]) && p[module].includes(action);
}

export function requirePerm(c: Ctx, module: string, action: string) {
  if (!can(c.get('user'), module, action)) throw new HttpError(403, `Permission required: ${module}.${action}`);
}

export async function logAudit(c: Ctx, action: string, entity: string, entityId: string | number | null, detail?: unknown) {
  const u = c.get('user');
  await c.env.DB.prepare('INSERT INTO audit_log (user_id, user_name, action, entity, entity_id, detail, ip) VALUES (?,?,?,?,?,?,?)')
    .bind(u?.id ?? null, u?.name ?? null, action, entity, entityId === null ? null : String(entityId), detail === undefined ? null : JSON.stringify(detail).slice(0, 4000), c.req.header('cf-connecting-ip') ?? null)
    .run();
}

// ---- crypto helpers -------------------------------------------------------
const enc = new TextEncoder();
export function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
export function randomToken(bytes = 32): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return b64(a).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export async function sha256(s: string): Promise<string> {
  return b64(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}
export async function hashPassword(password: string, saltB64?: string): Promise<{ hash: string; salt: string }> {
  const salt = saltB64 ? Uint8Array.from(atob(saltB64), (ch) => ch.charCodeAt(0)) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256);
  return { hash: b64(bits), salt: b64(salt) };
}
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
export function passwordProblems(pw: string): string | null {
  if (!pw || pw.length < 10) return 'Password must be at least 10 characters.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Password must contain letters and numbers.';
  return null;
}

// ---- register config cache ------------------------------------------------
let cfgCache: { at: number; map: Map<string, RegisterConfig> } | null = null;
export function invalidateConfig() { cfgCache = null; }
export async function getConfigs(env: Env): Promise<Map<string, RegisterConfig>> {
  if (cfgCache && Date.now() - cfgCache.at < 30000) return cfgCache.map;
  const rows = await env.DB.prepare('SELECT code, config FROM registers ORDER BY sort').all<{ code: string; config: string }>();
  const map = new Map<string, RegisterConfig>();
  for (const r of rows.results) map.set(r.code, JSON.parse(r.config));
  cfgCache = { at: Date.now(), map };
  return map;
}
export async function getConfig(env: Env, code: string): Promise<RegisterConfig> {
  const cfg = (await getConfigs(env)).get(code);
  if (!cfg) throw new HttpError(404, `Unknown register ${code}`);
  return cfg;
}

export function currentYear(): number { return new Date().getUTCFullYear(); }
