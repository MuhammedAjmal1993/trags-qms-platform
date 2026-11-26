import { Hono } from 'hono';
import { type AppEnv, HttpError, requirePerm, logAudit, can } from '../lib';
import { MODULE_OF_REGISTER } from '../../shared/registers';

export const docRoutes = new Hono<AppEnv>();

const safe = (n: string) => n.replace(/[^\w.\- ()]+/g, '_');

async function putFile(c: any, prefix: string, file: File): Promise<string> {
  if (file.size > 100 * 1024 * 1024) throw new HttpError(413, 'File larger than 100 MB.');
  const key = `${prefix}/${Date.now()}-${safe(file.name)}`;
  await c.env.FILES.put(key, file.stream(), { httpMetadata: { contentType: file.type || 'application/octet-stream' } });
  return key;
}

// ---- file download (permission by storage area) ----
docRoutes.get('/files', async (c) => {
  const key = c.req.query('key') || '';
  const user = c.get('user');
  const area = key.split('/')[0];
  let ok = false;
  if (area === 'documents' || area === 'templates' || area === 'plans' || area === 'signoffs') ok = can(user, 'documents', 'view') || can(user, 'plans', 'view');
  else if (area === 'uploads') ok = can(user, 'ingest', 'view');
  else if (area === 'attachments') ok = can(user, MODULE_OF_REGISTER[key.split('/')[1]] || 'findings', 'view');
  if (!ok) throw new HttpError(403, 'No access to this file.');
  const obj = await c.env.FILES.get(key);
  if (!obj) throw new HttpError(404, 'File not found');
  const name = key.split('/').pop()!.replace(/^\d+-/, '');
  return new Response(obj.body, { headers: { 'content-type': obj.httpMetadata?.contentType || 'application/octet-stream', 'content-disposition': `${c.req.query('dl') ? 'attachment' : 'inline'}; filename="${name.replace(/"/g, '')}"`, 'cache-control': 'private, max-age=300' } });
});

// ---- QMS document library ----
docRoutes.get('/documents', async (c) => {
  requirePerm(c, 'documents', 'view');
  const r = await c.env.DB.prepare(`SELECT d.*, r.rev, r.rev_date, r.r2_key, r.filename, r.id AS rev_id, (SELECT COUNT(*) FROM document_revisions x WHERE x.document_id = d.id) AS revisions
    FROM documents d LEFT JOIN document_revisions r ON r.document_id = d.id AND r.is_current = 1 ORDER BY d.level, d.category, d.doc_no, d.title`).all();
  return c.json(r.results);
});
docRoutes.get('/documents/:id', async (c) => {
  requirePerm(c, 'documents', 'view');
  const id = Number(c.req.param('id'));
  const d = await c.env.DB.prepare('SELECT * FROM documents WHERE id = ?').bind(id).first();
  if (!d) throw new HttpError(404, 'Document not found');
  const revs = await c.env.DB.prepare('SELECT r.*, u.name AS uploaded_by_name FROM document_revisions r LEFT JOIN users u ON u.id = r.uploaded_by WHERE document_id = ? ORDER BY r.id DESC').bind(id).all();
  return c.json({ ...d, revisions: revs.results });
});
// Create a document with its first revision (multipart: file + fields).
docRoutes.post('/documents', async (c) => {
  requirePerm(c, 'documents', 'create');
  const f = await c.req.formData();
  const title = String(f.get('title') || '').trim();
  if (!title) throw new HttpError(400, 'Title is required.');
  const d = await c.env.DB.prepare('INSERT INTO documents (doc_no, title, level, category, entity, owner, issue_no, expiry_date, review_date, notes, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?) RETURNING id')
    .bind(f.get('doc_no') || null, title, Number(f.get('level') || 2), f.get('category') || 'Procedure', f.get('entity') || null, f.get('owner') || null, f.get('issue_no') || null, f.get('expiry_date') || null, f.get('review_date') || null, f.get('notes') || null, c.get('user').id).first<{ id: number }>();
  const file = f.get('file') as unknown as File | null;
  if (file && typeof file !== 'string') {
    const key = await putFile(c, `documents/${d!.id}`, file);
    await c.env.DB.prepare('INSERT INTO document_revisions (document_id, rev, rev_date, r2_key, filename, mime, size, change_summary, uploaded_by) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(d!.id, String(f.get('rev') || '0'), f.get('rev_date') || null, key, file.name, file.type, file.size, f.get('change_summary') || 'Initial upload', c.get('user').id).run();
  }
  await logAudit(c, 'document.create', 'document', d!.id, { title });
  return c.json({ id: d!.id });
});
docRoutes.put('/documents/:id', async (c) => {
  requirePerm(c, 'documents', 'edit');
  const b = await c.req.json<any>();
  const id = Number(c.req.param('id'));
  await c.env.DB.prepare('UPDATE documents SET doc_no=?, title=?, level=?, category=?, entity=?, owner=?, status=?, issue_no=?, expiry_date=?, review_date=?, notes=? WHERE id=?')
    .bind(b.doc_no ?? null, b.title, Number(b.level || 2), b.category, b.entity ?? null, b.owner ?? null, b.status || 'Current', b.issue_no ?? null, b.expiry_date ?? null, b.review_date ?? null, b.notes ?? null, id).run();
  await logAudit(c, 'document.update', 'document', id);
  return c.json({ ok: true });
});
// New revision: previous current revision becomes superseded (kept for history).
docRoutes.post('/documents/:id/revisions', async (c) => {
  requirePerm(c, 'documents', 'edit');
  const id = Number(c.req.param('id'));
  const f = await c.req.formData();
  const file = f.get('file') as unknown as File | null;
  if (!file || typeof file === 'string') throw new HttpError(400, 'Revision file is required.');
  const rev = String(f.get('rev') || '').trim();
  if (!rev) throw new HttpError(400, 'Revision number is required.');
  const dup = await c.env.DB.prepare('SELECT id FROM document_revisions WHERE document_id = ? AND rev = ?').bind(id, rev).first();
  if (dup) throw new HttpError(409, `Revision ${rev} already exists for this document.`);
  const key = await putFile(c, `documents/${id}`, file);
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE document_revisions SET is_current = 0 WHERE document_id = ?').bind(id),
    c.env.DB.prepare('INSERT INTO document_revisions (document_id, rev, rev_date, r2_key, filename, mime, size, change_summary, uploaded_by, is_current) VALUES (?,?,?,?,?,?,?,?,?,1)')
      .bind(id, rev, f.get('rev_date') || null, key, file.name, file.type, file.size, f.get('change_summary') || null, c.get('user').id),
    c.env.DB.prepare("UPDATE documents SET status = 'Current', issue_no = COALESCE(?, issue_no), expiry_date = COALESCE(?, expiry_date) WHERE id = ?").bind(f.get('issue_no') || null, f.get('expiry_date') || null, id),
  ]);
  await logAudit(c, 'document.revision', 'document', id, { rev, file: file.name });
  return c.json({ ok: true });
});
docRoutes.post('/documents/:id/revisions/:rid/current', async (c) => {
  requirePerm(c, 'documents', 'approve');
  const id = Number(c.req.param('id')), rid = Number(c.req.param('rid'));
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE document_revisions SET is_current = 0 WHERE document_id = ?').bind(id),
    c.env.DB.prepare('UPDATE document_revisions SET is_current = 1 WHERE id = ? AND document_id = ?').bind(rid, id),
  ]);
  await logAudit(c, 'document.set_current', 'document', id, { rid });
  return c.json({ ok: true });
});
docRoutes.delete('/documents/:id', async (c) => {
  requirePerm(c, 'documents', 'delete');
  const id = Number(c.req.param('id'));
  await c.env.DB.prepare("UPDATE documents SET status = 'Withdrawn' WHERE id = ?").bind(id).run();
  await logAudit(c, 'document.withdraw', 'document', id);
  return c.json({ ok: true });
});

// ---- plans (quality plan, training plan, audit plan documents) ----
docRoutes.get('/plans', async (c) => {
  requirePerm(c, 'plans', 'view');
  const r = await c.env.DB.prepare('SELECT * FROM plans ORDER BY year DESC, type, title').all();
  return c.json(r.results);
});
docRoutes.post('/plans', async (c) => {
  requirePerm(c, 'plans', 'create');
  const f = await c.req.formData();
  const file = f.get('file') as unknown as File | null;
  let key: string | null = null, name: string | null = null;
  if (file && typeof file !== 'string') { key = await putFile(c, 'plans', file); name = file.name; }
  const r = await c.env.DB.prepare('INSERT INTO plans (type, year, title, won, doc_no, rev, status, r2_key, filename, notes, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?) RETURNING id')
    .bind(f.get('type'), Number(f.get('year')) || null, f.get('title'), f.get('won') || null, f.get('doc_no') || null, f.get('rev') || null, f.get('status') || 'Draft', key, name, f.get('notes') || null, c.get('user').id).first<{ id: number }>();
  await logAudit(c, 'plan.create', 'plan', r!.id);
  return c.json({ id: r!.id });
});
docRoutes.put('/plans/:id', async (c) => {
  requirePerm(c, 'plans', 'edit');
  const b = await c.req.json<any>();
  await c.env.DB.prepare('UPDATE plans SET type=?, year=?, title=?, won=?, doc_no=?, rev=?, status=?, notes=? WHERE id=?').bind(b.type, b.year, b.title, b.won ?? null, b.doc_no ?? null, b.rev ?? null, b.status, b.notes ?? null, Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});
docRoutes.delete('/plans/:id', async (c) => {
  requirePerm(c, 'plans', 'delete');
  await c.env.DB.prepare('DELETE FROM plans WHERE id = ?').bind(Number(c.req.param('id'))).run();
  await logAudit(c, 'plan.delete', 'plan', c.req.param('id'));
  return c.json({ ok: true });
});

// ---- quality objectives ----
docRoutes.get('/objectives', async (c) => {
  requirePerm(c, 'plans', 'view');
  const year = Number(c.req.query('year') || new Date().getUTCFullYear());
  const r = await c.env.DB.prepare('SELECT * FROM objectives WHERE year = ? ORDER BY sort, id').bind(year).all<any>();
  const s = await c.env.DB.prepare("SELECT * FROM signoffs WHERE subject = 'objectives' AND subject_ref = ? ORDER BY id").bind(String(year)).all();
  return c.json({ year, objectives: r.results.map((o) => ({ ...o, monthly: JSON.parse(o.monthly || '{}') })), signoffs: s.results });
});
docRoutes.post('/objectives', async (c) => {
  requirePerm(c, 'plans', 'create');
  const b = await c.req.json<any>();
  const r = await c.env.DB.prepare('INSERT INTO objectives (year, ref, objective, kpi, target, unit, direction, frequency, owner, department, metric, monthly, status, remarks, sort) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id')
    .bind(b.year, b.ref ?? null, b.objective, b.kpi ?? null, b.target ?? null, b.unit ?? null, b.direction || '>=', b.frequency ?? null, b.owner ?? null, b.department ?? null, b.metric ?? null, JSON.stringify(b.monthly || {}), b.status ?? null, b.remarks ?? null, b.sort ?? 0).first<{ id: number }>();
  await logAudit(c, 'objective.create', 'objective', r!.id);
  return c.json({ id: r!.id });
});
docRoutes.put('/objectives/:id', async (c) => {
  requirePerm(c, 'plans', 'edit');
  const b = await c.req.json<any>();
  const id = Number(c.req.param('id'));
  const obj = await c.env.DB.prepare('SELECT year FROM objectives WHERE id = ?').bind(id).first<any>();
  const signed = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM signoffs WHERE subject='objectives' AND subject_ref = ?").bind(String(obj?.year)).first<any>();
  if (signed?.n && !b.allowAfterSignoff) throw new HttpError(409, 'The objectives report for this year is signed. Withdraw the sign-off before editing.');
  await c.env.DB.prepare('UPDATE objectives SET ref=?, objective=?, kpi=?, target=?, unit=?, direction=?, frequency=?, owner=?, department=?, metric=?, monthly=?, status=?, remarks=?, sort=? WHERE id=?')
    .bind(b.ref ?? null, b.objective, b.kpi ?? null, b.target ?? null, b.unit ?? null, b.direction || '>=', b.frequency ?? null, b.owner ?? null, b.department ?? null, b.metric ?? null, JSON.stringify(b.monthly || {}), b.status ?? null, b.remarks ?? null, b.sort ?? 0, id).run();
  await logAudit(c, 'objective.update', 'objective', id);
  return c.json({ ok: true });
});
docRoutes.delete('/objectives/:id', async (c) => {
  requirePerm(c, 'plans', 'delete');
  await c.env.DB.prepare('DELETE FROM objectives WHERE id = ?').bind(Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});
// Sign-off: each signatory signs for themselves under their own login (GM or QA/QC Manager role).
docRoutes.post('/objectives/:year/signoff', async (c) => {
  requirePerm(c, 'plans', 'approve');
  const year = c.req.param('year');
  const b = await c.req.json<any>();
  const role = b.role === 'GM' ? 'GM' : 'QAQC_MANAGER';
  const user = c.get('user');
  const ex = await c.env.DB.prepare("SELECT id FROM signoffs WHERE subject='objectives' AND subject_ref=? AND role=?").bind(year, role).first();
  if (ex) throw new HttpError(409, 'This role has already signed the report for this year.');
  await c.env.DB.prepare("INSERT INTO signoffs (subject, subject_ref, role, user_id, name, title, comment) VALUES ('objectives',?,?,?,?,?,?)").bind(year, role, user.id, user.name, user.title ?? null, b.comment ?? null).run();
  await logAudit(c, 'objectives.signoff', 'objectives', year, { role });
  return c.json({ ok: true });
});
docRoutes.delete('/objectives/:year/signoff/:id', async (c) => {
  requirePerm(c, 'plans', 'approve');
  const s = await c.env.DB.prepare('SELECT user_id FROM signoffs WHERE id = ?').bind(Number(c.req.param('id'))).first<any>();
  if (!s) throw new HttpError(404, 'Sign-off not found');
  if (s.user_id !== c.get('user').id && !(c.get('user').permissions.admin || []).includes('edit')) throw new HttpError(403, 'Only the signatory or an administrator can withdraw this sign-off.');
  await c.env.DB.prepare('DELETE FROM signoffs WHERE id = ?').bind(Number(c.req.param('id'))).run();
  await logAudit(c, 'objectives.signoff_withdraw', 'objectives', c.req.param('year'));
  return c.json({ ok: true });
});
// Signed scan of the objectives report (wet-ink copy) stored with the year.
docRoutes.post('/objectives/:year/signed-copy', async (c) => {
  requirePerm(c, 'plans', 'edit');
  const f = await c.req.formData();
  const file = f.get('file') as unknown as File | null;
  if (!file || typeof file === 'string') throw new HttpError(400, 'File required.');
  const key = await putFile(c, `signoffs/objectives-${c.req.param('year')}`, file);
  await c.env.DB.prepare("INSERT INTO signoffs (subject, subject_ref, role, user_id, name, r2_key) VALUES ('objectives',?, 'SIGNED_COPY', ?, ?, ?)").bind(c.req.param('year'), c.get('user').id, file.name, key).run();
  return c.json({ ok: true, key });
});

// ---- form templates (F271, NCR) ----
docRoutes.get('/templates', async (c) => {
  const r = await c.env.DB.prepare('SELECT code, label, kind, r2_key, filename, field_map, updated_at FROM templates').all<any>();
  return c.json(r.results.map((t) => ({ ...t, field_map: JSON.parse(t.field_map || '{}') })));
});
docRoutes.post('/templates/:code', async (c) => {
  requirePerm(c, 'admin', 'edit');
  const code = c.req.param('code');
  const f = await c.req.formData();
  const file = f.get('file') as unknown as File | null;
  const label = f.get('label') as string | null;
  const fieldMap = f.get('field_map') as string | null;
  let key: string | null = null, name: string | null = null;
  if (file && typeof file !== 'string') { key = await putFile(c, 'templates', file); name = file.name; }
  await c.env.DB.prepare("INSERT INTO templates (code, label, kind, r2_key, filename, field_map) VALUES (?,?, 'pdf-form', ?, ?, COALESCE(?, '{}')) ON CONFLICT(code) DO UPDATE SET label = COALESCE(?, label), r2_key = COALESCE(?, r2_key), filename = COALESCE(?, filename), field_map = COALESCE(?, field_map), updated_at = datetime('now')")
    .bind(code, label || code, key, name, fieldMap, label, key, name, fieldMap).run();
  await logAudit(c, 'template.update', 'template', code);
  return c.json({ ok: true });
});
