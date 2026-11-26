// Routes reachable without sign-in: showcase landing data and the quick-raise form.
// Only approved, non-confidential content is exposed here.
import { Hono } from 'hono';
import { type AppEnv, HttpError } from '../lib';
import { putFile, getFile } from '../storage';
import { cached } from '../cache';

export const publicRoutes = new Hono<AppEnv>();

async function setting(c: any, key: string): Promise<string | null> {
  const r = await c.env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  return r?.value ?? null;
}

publicRoutes.get('/summary', async (c) => cached(c.env, 'public:summary', async () => {
  const y = new Date().getUTCFullYear();
  const showStats = (await setting(c, 'public_show_stats')) !== 'No';
  const res = await c.env.DB.batch([
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM records WHERE register='PPL' AND deleted=0 AND LOWER(COALESCE(status,'')) NOT IN ('resigned','terminated','transferred')"),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM records WHERE register='AUD' AND deleted=0 AND substr(actual_date,1,4) = ?").bind(String(y)),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM records WHERE register='FND' AND deleted=0 AND LOWER(COALESCE(status,''))='closed' AND substr(close_date,1,4) = ?").bind(String(y)),
    c.env.DB.prepare("SELECT COUNT(*) AS n, SUM(COALESCE(num1,0)) AS p FROM records WHERE register='TRN' AND deleted=0 AND substr(actual_date,1,4) = ?").bind(String(y)),
    c.env.DB.prepare("SELECT title, category, expiry_date FROM documents WHERE category LIKE '%Certificate%' AND status = 'Current' ORDER BY title"),
    c.env.DB.prepare("SELECT COUNT(DISTINCT won) AS n FROM records WHERE deleted=0 AND won IS NOT NULL AND won <> '1010010' AND COALESCE(actual_date, plan_date) >= date('now','-365 day')"),
    c.env.DB.prepare("SELECT a.id, json_extract(r.data,'$.title') AS caption, json_extract(r.data,'$.type') AS type FROM attachments a JOIN records r ON r.id = a.record_id WHERE r.register='PHO' AND r.deleted=0 AND json_extract(r.data,'$.public')='Yes' AND a.mime LIKE 'image/%' ORDER BY a.id DESC LIMIT 12"),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM records WHERE register='SPJ' AND deleted=0"),
  ]);
  const v = (i: number) => (res[i].results[0] as any) || {};
  return JSON.stringify({
    tagline: (await setting(c, 'public_tagline')) || 'Quality you can verify, on every work order.',
    hasLogo: !!(await setting(c, 'logo_key')),
    year: y,
    stats: showStats ? { team: v(0).n || 0, audits: v(1).n || 0, findingsClosed: v(2).n || 0, trainings: v(3).n || 0, participants: v(3).p || 0, projects: v(5).n || 0, specialJobs: v(7).n || 0 } : null,
    certificates: (res[4].results as any[]).map((r) => ({ title: r.title, category: r.category, expiry: r.expiry_date })),
    photos: res[6].results,
  });
}));

publicRoutes.get('/logo', async (c) => {
  const key = await setting(c, 'logo_key');
  const f = key ? await getFile(c.env, key) : null;
  if (!f) throw new HttpError(404, 'No logo');
  return new Response(f.body, { headers: { 'content-type': f.contentType, 'cache-control': 'public, max-age=300', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" } });
});

publicRoutes.get('/photo/:id', async (c) => {
  const a = await c.env.DB.prepare("SELECT a.r2_key FROM attachments a JOIN records r ON r.id = a.record_id WHERE a.id = ? AND r.register='PHO' AND r.deleted=0 AND json_extract(r.data,'$.public')='Yes'").bind(Number(c.req.param('id'))).first<{ r2_key: string }>();
  const f = a ? await getFile(c.env, a.r2_key) : null;
  if (!f) throw new HttpError(404, 'Not found');
  return new Response(f.body, { headers: { 'content-type': f.contentType, 'cache-control': 'public, max-age=3600', 'content-security-policy': "default-src 'none'; sandbox" } });
});

// Quick raise: anyone with the link or QR code. Goes to the QA/QC review queue only.
publicRoutes.post('/raise', async (c) => {
  const ip = c.req.header('cf-connecting-ip') || 'unknown';
  const hour = new Date().toISOString().slice(0, 13);
  const rl = await c.env.DB.prepare("INSERT INTO rate_limits (k, n, window) VALUES (?, 1, ?) ON CONFLICT(k) DO UPDATE SET n = CASE WHEN window = excluded.window THEN n + 1 ELSE 1 END, window = excluded.window RETURNING n").bind(`raise:${ip}`, hour).first<{ n: number }>();
  if ((rl?.n ?? 0) > 15) throw new HttpError(429, 'Too many submissions from this connection. Try again within the hour.');
  const f = await c.req.formData();
  if (String(f.get('website') || '')) throw new HttpError(400, 'Rejected.'); // honeypot
  const get = (k: string, max = 400) => String(f.get(k) || '').trim().slice(0, max);
  const data = {
    kind: get('kind', 40) || 'Observation', site: get('site', 60), won: get('won', 12), location: get('location', 160), client: get('client', 80),
    description: get('description', 4000), raised_by: get('raised_by', 120), contact: get('contact', 120), date: get('date', 10) || new Date().toISOString().slice(0, 10),
  };
  if (data.description.length < 10) throw new HttpError(400, 'Describe the observation (at least 10 characters).');
  if (!data.raised_by) throw new HttpError(400, 'Enter your name.');
  const row = await c.env.DB.prepare('INSERT INTO submissions (kind, data, ip) VALUES (?,?,?) RETURNING id').bind(data.kind, JSON.stringify(data), ip).first<{ id: number }>();
  const id = row!.id;
  const ref = `SUB-${String(id).padStart(4, '0')}`;
  const photos: string[] = [];
  for (const p of f.getAll('photos').slice(0, 5)) {
    const file = p as unknown as File;
    if (!file || typeof file === 'string' || !file.size) continue;
    if (!/^image\//.test(file.type) || file.size > 6 * 1024 * 1024) continue;
    const key = `submissions/${id}/${Date.now()}-${file.name.replace(/[^\w.\- ]+/g, '_')}`;
    await putFile(c.env, key, await file.arrayBuffer(), file.type);
    photos.push(key);
  }
  await c.env.DB.prepare('UPDATE submissions SET ref = ?, photos = ? WHERE id = ?').bind(ref, JSON.stringify(photos), id).run();
  return c.json({ ok: true, ref });
});
