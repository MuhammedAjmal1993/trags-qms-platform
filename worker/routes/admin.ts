import { Hono } from 'hono';
import { type AppEnv, HttpError, hashPassword, passwordProblems, requirePerm, logAudit, invalidateConfig, getConfigs } from '../lib';
import { nextNumber } from '../core';
import { putFile } from '../storage';

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.use('*', async (c, next) => { requirePerm(c, 'admin', 'view'); await next(); });

// ---- users ----
adminRoutes.get('/users', async (c) => {
  const r = await c.env.DB.prepare('SELECT u.id, u.email, u.name, u.title, u.site, u.active, u.must_change_pw, u.last_login, u.created_at, u.role_id, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id ORDER BY u.name').all();
  return c.json(r.results);
});

adminRoutes.post('/users', async (c) => {
  requirePerm(c, 'admin', 'create');
  const b = await c.req.json<any>();
  if (!b.email || !b.name || !b.role_id) throw new HttpError(400, 'Name, email and role are required.');
  const problem = passwordProblems(b.password);
  if (problem) throw new HttpError(400, problem);
  const { hash, salt } = await hashPassword(b.password);
  try {
    const r = await c.env.DB.prepare('INSERT INTO users (email, name, title, site, role_id, password_hash, password_salt, must_change_pw) VALUES (?,?,?,?,?,?,?,1) RETURNING id')
      .bind(String(b.email).trim(), String(b.name).trim(), b.title ?? null, b.site ?? null, b.role_id, hash, salt).first<{ id: number }>();
    await logAudit(c, 'user.create', 'user', r!.id, { email: b.email, role_id: b.role_id });
    return c.json({ id: r!.id });
  } catch (e: any) {
    if (String(e.message).includes('UNIQUE')) throw new HttpError(409, 'A user with this email already exists.');
    throw e;
  }
});

adminRoutes.put('/users/:id', async (c) => {
  requirePerm(c, 'admin', 'edit');
  const id = Number(c.req.param('id'));
  const b = await c.req.json<any>();
  if (id === c.get('user').id && (b.active === 0 || b.active === false)) throw new HttpError(400, 'You cannot deactivate your own account.');
  await c.env.DB.prepare('UPDATE users SET name = COALESCE(?, name), title = ?, site = ?, role_id = COALESCE(?, role_id), active = COALESCE(?, active) WHERE id = ?')
    .bind(b.name ?? null, b.title ?? null, b.site ?? null, b.role_id ?? null, b.active === undefined ? null : b.active ? 1 : 0, id).run();
  if (b.active === 0 || b.active === false) await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run();
  if (b.password) {
    const problem = passwordProblems(b.password);
    if (problem) throw new HttpError(400, problem);
    const { hash, salt } = await hashPassword(b.password);
    await c.env.DB.prepare('UPDATE users SET password_hash = ?, password_salt = ?, must_change_pw = 1, failed_logins = 0, locked_until = NULL WHERE id = ?').bind(hash, salt, id).run();
    await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run();
  }
  await logAudit(c, 'user.update', 'user', id, { ...b, password: b.password ? '***' : undefined });
  return c.json({ ok: true });
});

// ---- roles ----
adminRoutes.get('/roles', async (c) => {
  const r = await c.env.DB.prepare('SELECT r.*, (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id) AS users FROM roles r ORDER BY r.id').all<any>();
  return c.json(r.results.map((x) => ({ ...x, permissions: JSON.parse(x.permissions) })));
});
adminRoutes.post('/roles', async (c) => {
  requirePerm(c, 'admin', 'create');
  const b = await c.req.json<any>();
  if (!b.name) throw new HttpError(400, 'Role name is required.');
  const r = await c.env.DB.prepare('INSERT INTO roles (name, description, permissions) VALUES (?,?,?) RETURNING id').bind(b.name, b.description ?? null, JSON.stringify(b.permissions || {})).first<{ id: number }>();
  await logAudit(c, 'role.create', 'role', r!.id, b);
  return c.json({ id: r!.id });
});
adminRoutes.put('/roles/:id', async (c) => {
  requirePerm(c, 'admin', 'edit');
  const id = Number(c.req.param('id'));
  const b = await c.req.json<any>();
  const role = await c.env.DB.prepare('SELECT name FROM roles WHERE id = ?').bind(id).first<any>();
  if (role?.name === 'Administrator' && b.permissions && !(b.permissions.admin || []).includes('edit')) throw new HttpError(400, 'The Administrator role must keep admin.edit.');
  await c.env.DB.prepare('UPDATE roles SET name = COALESCE(?, name), description = COALESCE(?, description), permissions = COALESCE(?, permissions) WHERE id = ?')
    .bind(b.name ?? null, b.description ?? null, b.permissions ? JSON.stringify(b.permissions) : null, id).run();
  await logAudit(c, 'role.update', 'role', id, b);
  return c.json({ ok: true });
});
adminRoutes.delete('/roles/:id', async (c) => {
  requirePerm(c, 'admin', 'delete');
  const id = Number(c.req.param('id'));
  const r = await c.env.DB.prepare('SELECT is_system, (SELECT COUNT(*) FROM users WHERE role_id = ?) AS n FROM roles WHERE id = ?').bind(id, id).first<any>();
  if (!r) throw new HttpError(404, 'Role not found');
  if (r.is_system) throw new HttpError(400, 'System roles cannot be deleted.');
  if (r.n) throw new HttpError(400, 'Role is assigned to users.');
  await c.env.DB.prepare('DELETE FROM roles WHERE id = ?').bind(id).run();
  await logAudit(c, 'role.delete', 'role', id);
  return c.json({ ok: true });
});

// ---- register configuration ----
adminRoutes.put('/registers/:code', async (c) => {
  requirePerm(c, 'admin', 'edit');
  const code = c.req.param('code');
  const cfg = await c.req.json<any>();
  if (!cfg || cfg.code !== code || !Array.isArray(cfg.columns)) throw new HttpError(400, 'Invalid register configuration.');
  const keys = new Set<string>();
  for (const col of cfg.columns) {
    if (!col.key || !/^[a-z0-9_]+$/.test(col.key)) throw new HttpError(400, `Invalid column key "${col.key}".`);
    if (keys.has(col.key)) throw new HttpError(400, `Duplicate column key "${col.key}".`);
    keys.add(col.key);
  }
  await c.env.DB.prepare("UPDATE registers SET name = ?, config = ?, updated_at = datetime('now') WHERE code = ?").bind(cfg.name, JSON.stringify(cfg), code).run();
  invalidateConfig();
  await logAudit(c, 'register.config', 'register', code, { columns: cfg.columns.length });
  return c.json({ ok: true });
});

// ---- numbering ----
adminRoutes.get('/numbering', async (c) => {
  const s = await c.env.DB.prepare('SELECT * FROM numbering_series ORDER BY code').all<any>();
  const out: any[] = [];
  for (const row of s.results) {
    let next = '';
    try { next = await nextNumber(c.env, row.code, undefined, true); } catch { next = ''; }
    out.push({ ...row, next });
  }
  return c.json(out);
});
adminRoutes.put('/numbering/:code', async (c) => {
  requirePerm(c, 'admin', 'edit');
  const b = await c.req.json<any>();
  const code = c.req.param('code');
  await c.env.DB.prepare('INSERT INTO numbering_series (code, label, pattern, register, field, reset_yearly, pad, active) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET label=excluded.label, pattern=excluded.pattern, register=excluded.register, field=excluded.field, reset_yearly=excluded.reset_yearly, pad=excluded.pad, active=excluded.active')
    .bind(code, b.label, b.pattern, b.register ?? null, b.field ?? null, b.reset_yearly ? 1 : 0, Number(b.pad || 3), b.active === false ? 0 : 1).run();
  if (b.setLast !== undefined && b.setLast !== null && b.setLast !== '') {
    const y = b.reset_yearly ? Number(b.year || new Date().getUTCFullYear()) : 0;
    await c.env.DB.prepare('INSERT INTO counters (series, year, last) VALUES (?,?,?) ON CONFLICT(series, year) DO UPDATE SET last = excluded.last').bind(code, y, Number(b.setLast)).run();
  }
  await logAudit(c, 'numbering.update', 'numbering', code, b);
  return c.json({ ok: true });
});

// ---- settings and log ----
adminRoutes.get('/audit-log', async (c) => {
  const limit = Math.min(Number(c.req.query('limit') || 300), 2000);
  const r = await c.env.DB.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').bind(limit).all();
  return c.json(r.results);
});
adminRoutes.get('/settings', async (c) => {
  const r = await c.env.DB.prepare("SELECT key, value FROM settings WHERE key NOT LIKE '%hash%'").all<any>();
  return c.json(Object.fromEntries(r.results.map((x) => [x.key, x.value])));
});
adminRoutes.put('/settings', async (c) => {
  requirePerm(c, 'admin', 'edit');
  const b = await c.req.json<Record<string, string>>();
  for (const [k, v] of Object.entries(b)) {
    if (k.includes('hash') || ['data_version', 'logo_key', 'setup_code', 'qms_map'].includes(k)) continue;
    await c.env.DB.prepare('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, String(v)).run();
  }
  await logAudit(c, 'settings.update', 'settings', null, Object.keys(b));
  return c.json({ ok: true });
});
adminRoutes.post('/logo', async (c) => {
  requirePerm(c, 'admin', 'edit');
  const f = await c.req.formData();
  const file = f.get('file') as unknown as File | null;
  if (!file || typeof file === 'string' || !/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) throw new HttpError(400, 'Upload a PNG, SVG, WEBP or JPG logo.');
  if (file.size > 2 * 1024 * 1024) throw new HttpError(413, 'Logo larger than 2 MB.');
  const key = `public/logo-${Date.now()}-${file.name.replace(/[^\w.\- ]+/g, '_')}`;
  await putFile(c.env, key, await file.arrayBuffer(), file.type);
  await c.env.DB.prepare("INSERT INTO settings (key, value) VALUES ('logo_key', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(key).run();
  await logAudit(c, 'logo.update', 'settings', 'logo_key');
  return c.json({ ok: true });
});

adminRoutes.get('/stats', async (c) => {
  const regs = await getConfigs(c.env);
  const counts = await c.env.DB.prepare('SELECT register, COUNT(*) AS n FROM records WHERE deleted = 0 GROUP BY register').all<any>();
  return c.json({ registers: [...regs.keys()], counts: counts.results });
});
