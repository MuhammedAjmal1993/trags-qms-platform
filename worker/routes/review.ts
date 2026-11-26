// QA/QC review queue for quick-raise submissions.
import { Hono } from 'hono';
import { type AppEnv, HttpError, requirePerm, logAudit } from '../lib';
import { insertRecord } from '../core';
import { MODULE_OF_REGISTER } from '../../shared/registers';

export const reviewRoutes = new Hono<AppEnv>();

reviewRoutes.get('/', async (c) => {
  requirePerm(c, 'findings', 'view');
  const status = c.req.query('status') || 'Pending';
  const r = await c.env.DB.prepare('SELECT s.*, u.name AS reviewer FROM submissions s LEFT JOIN users u ON u.id = s.reviewed_by WHERE s.status = ? ORDER BY s.id DESC LIMIT 300').bind(status).all<any>();
  const counts = await c.env.DB.prepare('SELECT status, COUNT(*) AS n FROM submissions GROUP BY status').all<any>();
  return c.json({ rows: r.results.map((x) => ({ ...x, data: JSON.parse(x.data), photos: JSON.parse(x.photos) })), counts: Object.fromEntries(counts.results.map((x) => [x.status, x.n])) });
});

reviewRoutes.post('/:id/accept', async (c) => {
  const id = Number(c.req.param('id'));
  const { register = 'FND', data } = await c.req.json<{ register: string; data: Record<string, unknown> }>();
  requirePerm(c, MODULE_OF_REGISTER[register] || 'findings', 'create');
  const s = await c.env.DB.prepare('SELECT * FROM submissions WHERE id = ?').bind(id).first<any>();
  if (!s) throw new HttpError(404, 'Submission not found');
  if (s.status !== 'Pending') throw new HttpError(409, `Already ${s.status.toLowerCase()}.`);
  const recId = await insertRecord(c.env, register, { ...data, remarks: [data.remarks, `Raised via quick form ${s.ref}`].filter(Boolean).join(' · ') }, { user: c.get('user'), source: `quickraise:${s.ref}` });
  for (const key of JSON.parse(s.photos || '[]') as string[]) {
    await c.env.DB.prepare('INSERT INTO attachments (record_id, register, r2_key, filename, mime, size, uploaded_by) VALUES (?,?,?,?,?,?,?)')
      .bind(recId, register, key, key.split('/').pop(), 'image/jpeg', null, c.get('user').id).run();
  }
  await c.env.DB.prepare("UPDATE submissions SET status = 'Accepted', reviewed_by = ?, reviewed_at = datetime('now'), record_id = ?, review_note = ? WHERE id = ?").bind(c.get('user').id, recId, register, id).run();
  await logAudit(c, 'submission.accept', 'submission', id, { record: recId, register });
  const rec = await c.env.DB.prepare('SELECT uid FROM records WHERE id = ?').bind(recId).first<any>();
  return c.json({ ok: true, record_id: recId, uid: rec?.uid });
});

reviewRoutes.post('/:id/reject', async (c) => {
  requirePerm(c, 'findings', 'edit');
  const id = Number(c.req.param('id'));
  const { note } = await c.req.json<any>();
  await c.env.DB.prepare("UPDATE submissions SET status = 'Rejected', reviewed_by = ?, reviewed_at = datetime('now'), review_note = ? WHERE id = ? AND status = 'Pending'").bind(c.get('user').id, String(note || '').slice(0, 500), id).run();
  await logAudit(c, 'submission.reject', 'submission', id, { note });
  return c.json({ ok: true });
});
