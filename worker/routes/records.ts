import { Hono } from 'hono';
import { type AppEnv, type Env, HttpError, requirePerm, logAudit, getConfig, getConfigs, can } from '../lib';
import { insertRecord, updateRecord, nextNumber, runSyncRules } from '../core';
import { MODULE_OF_REGISTER, type RegisterConfig } from '../../shared/registers';
import { normaliseRow, promote } from '../../shared/logic';
import { putFile, hasR2 } from '../storage';

export const recordRoutes = new Hono<AppEnv>();

const mod = (code: string) => MODULE_OF_REGISTER[code] || 'findings';

recordRoutes.get('/registers', async (c) => {
  const user = c.get('user');
  const cfgs = await getConfigs(c.env);
  const counts = await c.env.DB.prepare('SELECT register, COUNT(*) AS n FROM records WHERE deleted = 0 GROUP BY register').all<any>();
  const cm = Object.fromEntries(counts.results.map((r) => [r.register, r.n]));
  return c.json([...cfgs.values()].filter((r) => can(user, mod(r.code), 'view')).map((r) => ({ ...r, count: cm[r.code] || 0 })));
});

recordRoutes.get('/registers/:code', async (c) => {
  const cfg = await getConfig(c.env, c.req.param('code'));
  requirePerm(c, mod(cfg.code), 'view');
  return c.json(cfg);
});

function rowOut(r: any) {
  const data = JSON.parse(r.data);
  return { id: r.id, seq: r.seq, data, updated_at: r.updated_at, source: r.source };
}

// List with filters. Returns all matching rows (registers are a few thousand rows at most).
recordRoutes.get('/records/:code', async (c) => {
  const code = c.req.param('code');
  const cfg = await getConfig(c.env, code);
  requirePerm(c, mod(code), 'view');
  const q = c.req.query();
  const where = ['register = ?', 'deleted = 0'];
  const args: unknown[] = [code];
  if (q.won) { where.push('won = ?'); args.push(q.won); }
  if (q.status) { where.push('status = ?'); args.push(q.status); }
  if (q.year) { where.push("(substr(COALESCE(plan_date, actual_date, close_date),1,4) = ?)"); args.push(String(q.year)); }
  if (q.from) { where.push('COALESCE(plan_date, actual_date) >= ?'); args.push(q.from); }
  if (q.to) { where.push('COALESCE(plan_date, actual_date) <= ?'); args.push(q.to); }
  if (q.q) { where.push('data LIKE ?'); args.push(`%${q.q}%`); }
  const limit = Math.min(Number(q.limit || 20000), 20000);
  const r = await c.env.DB.prepare(`SELECT id, seq, data, updated_at, source FROM records WHERE ${where.join(' AND ')} ORDER BY seq LIMIT ?`).bind(...args, limit).all<any>();
  // Stored data is already JSON: concatenate instead of parse + stringify (keeps CPU low on the free plan).
  const body = '{"register":' + JSON.stringify(cfg.code) + ',"rows":[' + r.results.map((x) => `{"id":${x.id},"seq":${x.seq},"updated_at":"${x.updated_at}","source":${JSON.stringify(x.source)},"data":${x.data}}`).join(',') + ']}';
  return new Response(body, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
});

recordRoutes.post('/records/:code', async (c) => {
  const code = c.req.param('code');
  await getConfig(c.env, code);
  requirePerm(c, mod(code), 'create');
  const body = await c.req.json<any>();
  const data = body.data || body;
  await checkDuplicate(c.env, code, data, null);
  const id = await insertRecord(c.env, code, data, { user: c.get('user'), source: body.source || 'form', uploadId: body.upload_id ?? null });
  await logAudit(c, 'record.create', code, id);
  const r = await c.env.DB.prepare('SELECT id, seq, data, updated_at, source FROM records WHERE id = ?').bind(id).first<any>();
  return c.json(rowOut(r));
});

async function checkDuplicate(env: Env, code: string, data: Record<string, unknown>, exceptId: number | null) {
  const cfg = await getConfig(env, code);
  const norm = normaliseRow(cfg, data);
  const p = promote(cfg, norm);
  if (!p.row_key.replace(/\|/g, '')) return;
  if (cfg.keyFields.length === 1 && cfg.keyFields[0] === 'uid') return;
  if (/^(n\/?a\|?)+$/i.test(p.row_key)) return;
  const dup = await env.DB.prepare('SELECT id FROM records WHERE register = ? AND deleted = 0 AND row_key = ? AND id <> ?').bind(code, p.row_key, exceptId ?? -1).first<any>();
  if (dup) throw new HttpError(409, `Duplicate key (${cfg.keyFields.join(' + ')}): ${p.row_key.replace(/\|/g, ' / ')} already exists.`);
}

recordRoutes.get('/item/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const r = await c.env.DB.prepare('SELECT * FROM records WHERE id = ?').bind(id).first<any>();
  if (!r) throw new HttpError(404, 'Record not found');
  requirePerm(c, mod(r.register), 'view');
  const hist = await c.env.DB.prepare('SELECT * FROM record_history WHERE record_id = ? ORDER BY id DESC LIMIT 200').bind(id).all();
  const att = await c.env.DB.prepare('SELECT * FROM attachments WHERE record_id = ? ORDER BY id DESC').bind(id).all();
  return c.json({ ...rowOut(r), register: r.register, deleted: r.deleted, history: hist.results, attachments: att.results });
});

recordRoutes.put('/item/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const r = await c.env.DB.prepare('SELECT register FROM records WHERE id = ?').bind(id).first<any>();
  if (!r) throw new HttpError(404, 'Record not found');
  requirePerm(c, mod(r.register), 'edit');
  const body = await c.req.json<any>();
  const patch = body.data || body;
  const cur = await c.env.DB.prepare('SELECT data FROM records WHERE id = ?').bind(id).first<any>();
  await checkDuplicate(c.env, r.register, { ...JSON.parse(cur.data), ...patch }, id);
  await updateRecord(c.env, id, patch, { user: c.get('user'), source: 'form' });
  await logAudit(c, 'record.update', r.register, id, Object.keys(patch));
  const out = await c.env.DB.prepare('SELECT id, seq, data, updated_at, source FROM records WHERE id = ?').bind(id).first<any>();
  return c.json(rowOut(out));
});

recordRoutes.delete('/item/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const r = await c.env.DB.prepare('SELECT register, uid FROM records WHERE id = ?').bind(id).first<any>();
  if (!r) throw new HttpError(404, 'Record not found');
  requirePerm(c, mod(r.register), 'delete');
  await c.env.DB.prepare("UPDATE records SET deleted = 1, updated_by = ?, updated_at = datetime('now') WHERE id = ?").bind(c.get('user').id, id).run();
  await c.env.DB.prepare("INSERT INTO record_history (record_id, register, action, user_id, user_name) VALUES (?,?, 'delete', ?, ?)").bind(id, r.register, c.get('user').id, c.get('user').name).run();
  await logAudit(c, 'record.delete', r.register, id, { uid: r.uid });
  return c.json({ ok: true });
});

recordRoutes.post('/item/:id/restore', async (c) => {
  const id = Number(c.req.param('id'));
  const r = await c.env.DB.prepare('SELECT register FROM records WHERE id = ?').bind(id).first<any>();
  if (!r) throw new HttpError(404, 'Record not found');
  requirePerm(c, mod(r.register), 'delete');
  await c.env.DB.prepare('UPDATE records SET deleted = 0 WHERE id = ?').bind(id).run();
  await logAudit(c, 'record.restore', r.register, id);
  return c.json({ ok: true });
});

// Attachments (evidence, signed forms, photos) stored in R2.
recordRoutes.post('/item/:id/attachments', async (c) => {
  const id = Number(c.req.param('id'));
  const r = await c.env.DB.prepare('SELECT register FROM records WHERE id = ?').bind(id).first<any>();
  if (!r) throw new HttpError(404, 'Record not found');
  requirePerm(c, mod(r.register), 'edit');
  const form = await c.req.formData();
  const file = form.get('file') as unknown as File | null;
  if (!file || typeof file === 'string') throw new HttpError(400, 'No file.');
  const max = hasR2(c.env) ? 50 : 25;
  if (file.size > max * 1024 * 1024) throw new HttpError(413, `File larger than ${max} MB.`);
  const key = `attachments/${r.register}/${id}/${Date.now()}-${file.name.replace(/[^\w.\- ]+/g, '_')}`;
  await putFile(c.env, key, await file.arrayBuffer(), file.type || 'application/octet-stream');
  await c.env.DB.prepare('INSERT INTO attachments (record_id, register, r2_key, filename, mime, size, uploaded_by) VALUES (?,?,?,?,?,?,?)')
    .bind(id, r.register, key, file.name, file.type, file.size, c.get('user').id).run();
  await logAudit(c, 'attachment.add', r.register, id, { file: file.name });
  return c.json({ ok: true, key });
});

// Bulk upsert used by the Excel import (client sends chunks of up to 200 rows).
recordRoutes.post('/records/:code/bulk', async (c) => {
  const code = c.req.param('code');
  const cfg = await getConfig(c.env, code);
  requirePerm(c, mod(code), 'create');
  requirePerm(c, mod(code), 'edit');
  const body = await c.req.json<{ rows: Record<string, unknown>[]; mode: 'upsert' | 'append'; uploadId?: number; seqStart?: number; matchBy?: 'key' | 'uid' }>();
  const user = c.get('user');
  const res = await bulkUpsert(c.env, cfg, body.rows || [], body.mode || 'upsert', user, body.uploadId ?? null, body.seqStart, body.matchBy || 'key');
  await logAudit(c, 'record.bulk', code, null, res);
  return c.json(res);
});

export async function bulkUpsert(env: Env, cfg: RegisterConfig, rows: Record<string, unknown>[], mode: string, user: any, uploadId: number | null, seqStart?: number, matchBy: 'key' | 'uid' = 'key') {
  const code = cfg.code;
  const existing = await env.DB.prepare('SELECT id, row_key, uid FROM records WHERE register = ? AND deleted = 0').bind(code).all<any>();
  const byKey = new Map<string, any>();
  for (const e of existing.results) byKey.set(matchBy === 'uid' ? String(e.uid ?? '') : e.row_key, e);
  // Load stored data only for the rows this chunk will update.
  if (mode === 'upsert') {
    const ids: number[] = [];
    for (const raw of rows) { const p0 = promote(cfg, normaliseRow(cfg, raw)); const k0 = matchBy === 'uid' ? String(p0.uid ?? '') : p0.row_key; const h = byKey.get(k0); if (h) ids.push(h.id); }
    for (let i = 0; i < ids.length; i += 90) {
      const part = ids.slice(i, i + 90);
      const got = await env.DB.prepare(`SELECT id, data FROM records WHERE id IN (${part.map(() => '?').join(',')})`).bind(...part).all<any>();
      const m = new Map(got.results.map((g) => [g.id, g.data]));
      for (const e of byKey.values()) if (m.has(e.id)) e.data = m.get(e.id);
    }
  }
  const maxSeq = await env.DB.prepare('SELECT COALESCE(MAX(seq),0) AS m FROM records WHERE register = ?').bind(code).first<{ m: number }>();
  let seq = seqStart ?? (maxSeq?.m ?? 0);
  let inserted = 0, updated = 0, unchanged = 0;
  const stmts: D1PreparedStatement[] = [];
  const COLS = 'uid, row_key, won, client, status, category, sub_category, ext_int, finding_type, report_no, process, criticality, plan_date, actual_date, close_date, due_date, num1, num2, num3, num4';
  for (const raw of rows) {
    const data = normaliseRow(cfg, raw);
    const p = promote(cfg, data);
    const vals = [p.uid, p.row_key, p.won, p.client, p.status, p.category, p.sub_category, p.ext_int, p.finding_type, p.report_no, p.process, p.criticality, p.plan_date, p.actual_date, p.close_date, p.due_date, p.num1, p.num2, p.num3, p.num4];
    seq += 1;
    const k = matchBy === 'uid' ? String(p.uid ?? '') : p.row_key;
    const found = mode === 'upsert' && k.replace(/\|/g, '') ? byKey.get(k) : undefined;
    const hit = found && found.id !== -1 ? found : undefined; // a key repeated inside the same file is inserted as-is (duplicate check flags it)
    if (hit) {
      const before = JSON.parse(hit.data);
      const merged = { ...before, ...data, _flags: before._flags };
      const changes: Record<string, unknown[]> = {};
      for (const key of Object.keys(data)) if (JSON.stringify(before[key] ?? null) !== JSON.stringify(data[key] ?? null)) changes[key] = [before[key] ?? null, data[key] ?? null];
      if (!Object.keys(changes).length) { unchanged++; continue; }
      const mp = promote(cfg, merged);
      const mvals = [mp.uid, mp.row_key, mp.won, mp.client, mp.status, mp.category, mp.sub_category, mp.ext_int, mp.finding_type, mp.report_no, mp.process, mp.criticality, mp.plan_date, mp.actual_date, mp.close_date, mp.due_date, mp.num1, mp.num2, mp.num3, mp.num4];
      stmts.push(env.DB.prepare(`UPDATE records SET ${COLS.split(', ').map((x) => `${x} = ?`).join(', ')}, data = ?, updated_by = ?, updated_at = datetime('now'), upload_id = COALESCE(?, upload_id) WHERE id = ?`).bind(...mvals, JSON.stringify(merged), user?.id ?? null, uploadId, hit.id));
      stmts.push(env.DB.prepare("INSERT INTO record_history (record_id, register, action, changes, user_id, user_name) VALUES (?,?, 'update:import', ?, ?, ?)").bind(hit.id, code, JSON.stringify(changes), user?.id ?? null, user?.name ?? null));
      updated++;
    } else {
      stmts.push(env.DB.prepare(`INSERT INTO records (register, ${COLS}, seq, data, source, upload_id, created_by, updated_by) VALUES (?,${'?,'.repeat(20)}?,?,'import',?,?,?)`).bind(code, ...vals, seq, JSON.stringify(data), uploadId, user?.id ?? null, user?.id ?? null));
      byKey.set(k, { id: -1, row_key: k, data: JSON.stringify(data) });
      inserted++;
    }
  }
  for (let i = 0; i < stmts.length; i += 80) await env.DB.batch(stmts.slice(i, i + 80));
  return { inserted, updated, unchanged, total: rows.length };
}

// Recompute derived links after an import (Audit Plan counts from the Finding Register).
recordRoutes.post('/records/:code/resync', async (c) => {
  const code = c.req.param('code');
  requirePerm(c, mod(code), 'edit');
  const ids = await c.env.DB.prepare('SELECT id FROM records WHERE register = ? AND deleted = 0 AND report_no IS NOT NULL').bind(code).all<{ id: number }>();
  for (const r of ids.results) await runSyncRules(c.env, code, r.id, { user: c.get('user'), source: 'sync' });
  return c.json({ ok: true, processed: ids.results.length });
});

// Full reload of a register from Excel: soft-delete current rows first (admin only, logged, restorable).
recordRoutes.post('/records/:code/clear', async (c) => {
  const code = c.req.param('code');
  requirePerm(c, 'admin', 'delete');
  const n = await c.env.DB.prepare("UPDATE records SET deleted = 1, updated_by = ?, updated_at = datetime('now') WHERE register = ? AND deleted = 0").bind(c.get('user').id, code).run();
  await logAudit(c, 'record.clear', code, null, { rows: n.meta.changes });
  return c.json({ ok: true, cleared: n.meta.changes });
});

recordRoutes.get('/records/:code/duplicates', async (c) => {
  const code = c.req.param('code');
  requirePerm(c, mod(code), 'view');
  const r = await c.env.DB.prepare("SELECT row_key, COUNT(*) AS n, GROUP_CONCAT(id) AS ids FROM records WHERE register = ? AND deleted = 0 AND row_key IS NOT NULL AND REPLACE(row_key,'|','') <> '' AND LOWER(row_key) NOT IN ('n/a','na') GROUP BY row_key HAVING n > 1").bind(code).all();
  return c.json(r.results);
});

recordRoutes.get('/deleted/:code', async (c) => {
  const code = c.req.param('code');
  requirePerm(c, mod(code), 'delete');
  const r = await c.env.DB.prepare('SELECT id, seq, data, updated_at, source FROM records WHERE register = ? AND deleted = 1 ORDER BY updated_at DESC LIMIT 500').bind(code).all<any>();
  return c.json(r.results.map(rowOut));
});

recordRoutes.get('/numbering/next/:series', async (c) => {
  return c.json({ value: await nextNumber(c.env, c.req.param('series'), c.req.query('year') ? Number(c.req.query('year')) : undefined, true) });
});
recordRoutes.post('/numbering/reserve/:series', async (c) => {
  const s = await c.env.DB.prepare('SELECT register FROM numbering_series WHERE code = ?').bind(c.req.param('series')).first<any>();
  if (s?.register) requirePerm(c, mod(s.register), 'create');
  const v = await nextNumber(c.env, c.req.param('series'), c.req.query('year') ? Number(c.req.query('year')) : undefined);
  await logAudit(c, 'numbering.reserve', 'numbering', c.req.param('series'), { value: v });
  return c.json({ value: v });
});
recordRoutes.get('/numbering', async (c) => {
  const r = await c.env.DB.prepare('SELECT code, label, pattern, register, field FROM numbering_series WHERE active = 1 ORDER BY code').all();
  return c.json(r.results);
});

// Work orders
recordRoutes.get('/workorders', async (c) => {
  requirePerm(c, 'workorders', 'view');
  const r = await c.env.DB.prepare(`SELECT w.*, (SELECT COUNT(*) FROM records r WHERE r.won = w.won AND r.deleted = 0) AS linked FROM work_orders w ORDER BY w.won`).all();
  return c.json(r.results);
});
recordRoutes.post('/workorders', async (c) => {
  requirePerm(c, 'workorders', 'create');
  const b = await c.req.json<any>();
  const list: any[] = Array.isArray(b) ? b : [b];
  const stmts = list.filter((w) => w.won).map((w) => c.env.DB.prepare(`INSERT INTO work_orders (won, client, project_no, contract_no, title, project_name, location, project_manager, qc_lead, status, start_date, end_date, notes, updated_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(won) DO UPDATE SET client=COALESCE(excluded.client, client), project_no=COALESCE(excluded.project_no, project_no), contract_no=COALESCE(excluded.contract_no, contract_no),
     title=COALESCE(excluded.title, title), project_name=COALESCE(excluded.project_name, project_name), location=COALESCE(excluded.location, location), project_manager=COALESCE(excluded.project_manager, project_manager),
     qc_lead=COALESCE(excluded.qc_lead, qc_lead), status=COALESCE(excluded.status, status), start_date=COALESCE(excluded.start_date, start_date), end_date=COALESCE(excluded.end_date, end_date), notes=COALESCE(excluded.notes, notes), updated_by=excluded.updated_by, updated_at=datetime('now')`)
    .bind(String(w.won).replace(/\.0$/, '').trim(), w.client ?? null, w.project_no ?? null, w.contract_no ?? null, w.title ?? null, w.project_name ?? null, w.location ?? null, w.project_manager ?? null, w.qc_lead ?? null, w.status ?? null, w.start_date ?? null, w.end_date ?? null, w.notes ?? null, c.get('user').id));
  for (let i = 0; i < stmts.length; i += 80) await c.env.DB.batch(stmts.slice(i, i + 80));
  await logAudit(c, 'workorder.upsert', 'work_order', list.length === 1 ? list[0].won : null, { count: list.length });
  return c.json({ ok: true, count: stmts.length });
});
recordRoutes.put('/workorders/:won', async (c) => {
  requirePerm(c, 'workorders', 'edit');
  const b = await c.req.json<any>();
  const won = c.req.param('won');
  await c.env.DB.prepare(`UPDATE work_orders SET client=?, project_no=?, contract_no=?, title=?, project_name=?, location=?, project_manager=?, qc_lead=?, status=?, start_date=?, end_date=?, health_override=?, notes=?, updated_by=?, updated_at=datetime('now') WHERE won=?`)
    .bind(b.client ?? null, b.project_no ?? null, b.contract_no ?? null, b.title ?? null, b.project_name ?? null, b.location ?? null, b.project_manager ?? null, b.qc_lead ?? null, b.status ?? null, b.start_date ?? null, b.end_date ?? null, b.health_override ?? null, b.notes ?? null, c.get('user').id, won).run();
  await logAudit(c, 'workorder.update', 'work_order', won);
  return c.json({ ok: true });
});
