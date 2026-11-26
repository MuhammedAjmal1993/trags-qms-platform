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
  const y = new Date().getUTCFullYear(), ys = String(y);
  const showStats = (await setting(c, 'public_show_stats')) !== 'No';
  const P = (sql: string, ...b: unknown[]) => c.env.DB.prepare(sql).bind(...b);
  const res = await c.env.DB.batch([
    P("SELECT COUNT(*) AS n FROM records WHERE register='PPL' AND deleted=0 AND status = 'Active'"),
    P("SELECT COUNT(*) AS n FROM records WHERE register='AUD' AND deleted=0 AND substr(actual_date,1,4) = ?", ys),
    P("SELECT COUNT(*) AS n FROM records WHERE register='FND' AND deleted=0 AND LOWER(COALESCE(status,''))='closed' AND substr(plan_date,1,4) = ?", ys),
    P("SELECT COUNT(*) AS n, SUM(COALESCE(num1,0)) AS p FROM records WHERE register='TRN' AND deleted=0 AND substr(actual_date,1,4) = ?", ys),
    P(`SELECT json_extract(data,'$.certification') AS name, category AS family, client AS body, process AS site, due_date AS expiry
       FROM records WHERE register='CRT' AND deleted=0 AND json_extract(data,'$.public')='Yes' ORDER BY id`),
    P("SELECT COUNT(DISTINCT won) AS n FROM records WHERE deleted=0 AND won IS NOT NULL AND won <> '1010010' AND COALESCE(actual_date, plan_date) >= date('now','-365 day')"),
    P(`SELECT a.id, json_extract(r.data,'$.title') AS caption, json_extract(r.data,'$.type') AS type FROM attachments a JOIN records r ON r.id = a.record_id
       WHERE r.register='PHO' AND r.deleted=0 AND json_extract(r.data,'$.public')='Yes' AND a.mime LIKE 'image/%' ORDER BY r.plan_date DESC, a.id DESC LIMIT 30`),
    P("SELECT COUNT(*) AS n, SUM(CASE WHEN UPPER(status) LIKE 'REJECT%' THEN 1 ELSE 0 END) AS rej, SUM(CASE WHEN UPPER(status) LIKE 'CANCEL%' THEN 1 ELSE 0 END) AS canc FROM records WHERE register='RFI' AND deleted=0 AND substr(plan_date,1,4) = ?", ys),
    P("SELECT SUM(COALESCE(num1,0)) AS films, SUM(COALESCE(num2,0)) AS rej, SUM(COALESCE(json_extract(data,'$.joints_welded'),0)) AS joints, SUM(COALESCE(json_extract(data,'$.inch_dia'),0)) AS inch FROM records WHERE register='WRR' AND deleted=0 AND substr(actual_date,1,4) = ?", ys),
    P(`SELECT json_extract(data,'$.title') AS title, plan_date AS date, category, process AS location, json_extract(data,'$.summary') AS summary
       FROM records WHERE register='NWS' AND deleted=0 AND json_extract(data,'$.public')='Yes' ORDER BY plan_date DESC LIMIT 8`),
    P("SELECT COUNT(*) AS n FROM records WHERE register='AWD' AND deleted=0 AND status IN ('Selected','Winner')"),
    P("SELECT COUNT(*) AS n FROM records WHERE register='FND' AND deleted=0"),
    P("SELECT MIN(substr(plan_date,1,4)) AS y FROM records WHERE register IN ('FND','AUD') AND deleted=0 AND plan_date IS NOT NULL"),
    P("SELECT AVG(num1) AS s FROM records WHERE register='CFB' AND deleted=0 AND sub_category LIKE '%Survey%' AND substr(plan_date,1,4) = ?", ys),
    P("SELECT COUNT(*) AS n FROM records WHERE register='NFI' AND deleted=0"),
  ]);
  const v = (i: number) => (res[i].results[0] as any) || {};
  const rfi = v(7), w = v(8);
  return JSON.stringify({
    tagline: (await setting(c, 'public_tagline')) || 'Quality you can verify, on every work order.',
    year: y,
    stats: showStats ? {
      team: v(0).n || 0, audits: v(1).n || 0, findingsClosed: v(2).n || 0, trainings: v(3).n || 0, participants: v(3).p || 0, projects: v(5).n || 0,
      rfis: rfi.n || 0, rfiRejection: rfi.n - rfi.canc > 0 ? rfi.rej / (rfi.n - rfi.canc) : null,
      films: Math.round(w.films || 0), joints: Math.round(w.joints || 0), inchDia: Math.round(w.inch || 0), repairRate: w.films ? (w.rej || 0) / w.films : null,
      welderAwards: v(10).n || 0, findingsTracked: v(11).n || 0, since: v(12).y || null, survey: v(13).s ?? null, nfis: v(14).n || 0,
    } : null,
    certificates: res[4].results,
    news: res[9].results,
    photos: res[6].results,
  });
}));

publicRoutes.get('/hero', async (c) => {
  const key = await setting(c, 'hero_key');
  const f = key ? await getFile(c.env, key) : null;
  if (!f) throw new HttpError(404, 'No hero image');
  return new Response(f.body, { headers: { 'content-type': f.contentType, 'cache-control': 'public, max-age=3600', 'content-security-policy': "default-src 'none'; sandbox" } });
});

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
