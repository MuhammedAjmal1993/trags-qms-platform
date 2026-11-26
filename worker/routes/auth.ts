import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { type AppEnv, type Env, type SessionUser, HttpError, hashPassword, verifyPassword, passwordProblems, randomToken, sha256, timingSafeEqual } from '../lib';

export const SESSION_COOKIE = 'tqms_session';
const SESSION_HOURS = 12;

export async function loadSession(env: Env, token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const id = await sha256(token);
  const row = await env.DB.prepare(`SELECT u.id, u.email, u.name, u.title, u.site, u.must_change_pw, u.active, r.id AS role_id, r.name AS role, r.permissions, s.expires_at
      FROM sessions s JOIN users u ON u.id = s.user_id JOIN roles r ON r.id = u.role_id WHERE s.id = ?`).bind(id).first<any>();
  if (!row || !row.active || row.expires_at < new Date().toISOString()) return null;
  return { id: row.id, email: row.email, name: row.name, title: row.title, site: row.site, role: row.role, role_id: row.role_id, permissions: JSON.parse(row.permissions || '{}'), must_change_pw: row.must_change_pw };
}

async function createSession(c: any, userId: number) {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_HOURS * 3600 * 1000).toISOString();
  await c.env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at, ip, ua) VALUES (?,?,?,?,?)')
    .bind(await sha256(token), userId, expires, c.req.header('cf-connecting-ip') ?? null, (c.req.header('user-agent') ?? '').slice(0, 200)).run();
  await c.env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(new Date().toISOString()).run();
  setCookie(c, SESSION_COOKIE, token, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: SESSION_HOURS * 3600 });
}

export const authRoutes = new Hono<AppEnv>();

authRoutes.get('/status', async (c) => {
  const n = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
  const user = await loadSession(c.env, getCookie(c, SESSION_COOKIE));
  return c.json({ needsSetup: (n?.n ?? 0) === 0, user, appName: c.env.APP_NAME });
});

// First-run setup: allowed only while no user exists, and only with the one-time setup code.
authRoutes.post('/setup', async (c) => {
  const n = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
  if ((n?.n ?? 0) > 0) throw new HttpError(403, 'Setup already completed.');
  const { code, email, name, password } = await c.req.json<any>();
  const stored = await c.env.DB.prepare("SELECT value FROM settings WHERE key='setup_code_hash'").first<{ value: string }>();
  if (!stored?.value) throw new HttpError(403, 'Setup code not configured.');
  if (!code || !timingSafeEqual(await sha256(String(code).trim()), stored.value)) throw new HttpError(403, 'Invalid setup code.');
  const problem = passwordProblems(password);
  if (problem) throw new HttpError(400, problem);
  if (!email || !name) throw new HttpError(400, 'Name and email are required.');
  const role = await c.env.DB.prepare("SELECT id FROM roles WHERE name='Administrator'").first<{ id: number }>();
  const { hash, salt } = await hashPassword(password);
  const u = await c.env.DB.prepare('INSERT INTO users (email, name, role_id, password_hash, password_salt, must_change_pw) VALUES (?,?,?,?,?,0) RETURNING id')
    .bind(String(email).trim(), String(name).trim(), role!.id, hash, salt).first<{ id: number }>();
  await c.env.DB.prepare("DELETE FROM settings WHERE key='setup_code_hash'").run();
  await createSession(c, u!.id);
  await c.env.DB.prepare("INSERT INTO audit_log (user_id, user_name, action, entity) VALUES (?,?, 'setup', 'system')").bind(u!.id, name).run();
  return c.json({ ok: true });
});

authRoutes.post('/login', async (c) => {
  const { email, password } = await c.req.json<any>();
  const u = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(String(email || '').trim()).first<any>();
  const fail = () => { throw new HttpError(401, 'Invalid email or password.'); };
  if (!u || !u.active) {
    await hashPassword(String(password || 'x')); // equalise timing
    fail();
  }
  if (u.locked_until && u.locked_until > new Date().toISOString()) throw new HttpError(429, 'Account locked after repeated failed logins. Try again in 15 minutes or ask the administrator.');
  if (!(await verifyPassword(String(password || ''), u.password_hash, u.password_salt))) {
    const fails = u.failed_logins + 1;
    const lock = fails >= 5 ? new Date(Date.now() + 15 * 60000).toISOString() : null;
    await c.env.DB.prepare('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?').bind(lock ? 0 : fails, lock, u.id).run();
    fail();
  }
  await c.env.DB.prepare("UPDATE users SET failed_logins = 0, locked_until = NULL, last_login = datetime('now') WHERE id = ?").bind(u.id).run();
  await createSession(c, u.id);
  await c.env.DB.prepare("INSERT INTO audit_log (user_id, user_name, action, entity, ip) VALUES (?,?, 'login', 'user', ?)").bind(u.id, u.name, c.req.header('cf-connecting-ip') ?? null).run();
  return c.json({ ok: true, mustChange: !!u.must_change_pw });
});

authRoutes.post('/logout', async (c) => {
  const t = getCookie(c, SESSION_COOKIE);
  if (t) await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256(t)).run();
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

authRoutes.post('/password', async (c) => {
  const user = await loadSession(c.env, getCookie(c, SESSION_COOKIE));
  if (!user) throw new HttpError(401, 'Not signed in.');
  const { current, password } = await c.req.json<any>();
  const u = await c.env.DB.prepare('SELECT password_hash, password_salt FROM users WHERE id = ?').bind(user.id).first<any>();
  if (!(await verifyPassword(String(current || ''), u.password_hash, u.password_salt))) throw new HttpError(400, 'Current password is incorrect.');
  const problem = passwordProblems(password);
  if (problem) throw new HttpError(400, problem);
  const np = await hashPassword(password);
  await c.env.DB.prepare('UPDATE users SET password_hash = ?, password_salt = ?, must_change_pw = 0 WHERE id = ?').bind(np.hash, np.salt, user.id).run();
  // Sign out every other session of this user.
  const t = getCookie(c, SESSION_COOKIE)!;
  await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?').bind(user.id, await sha256(t)).run();
  return c.json({ ok: true });
});
