import { Hono } from 'hono';
import { type AppEnv, type Env, HttpError, requirePerm, can } from '../lib';

export const statRoutes = new Hono<AppEnv>();

interface Filt { from: string; to: string; won?: string; client?: string; extint?: string }

function filt(q: Record<string, string>): Filt {
  const y = new Date().getUTCFullYear();
  return { from: q.from || `${y}-01-01`, to: q.to || `${y}-12-31`, won: q.won || undefined, client: q.client || undefined, extint: q.extint || undefined };
}
function extra(f: Filt, args: unknown[]): string {
  let s = '';
  if (f.won) { s += ' AND won = ?'; args.push(f.won); }
  if (f.client) { s += ' AND client = ?'; args.push(f.client); }
  if (f.extint) { s += ' AND ext_int = ?'; args.push(f.extint); }
  return s;
}
async function q<T = any>(env: Env, sql: string, args: unknown[]): Promise<T[]> {
  return (await env.DB.prepare(sql).bind(...args).all<T>()).results;
}
const CLOSED = "LOWER(COALESCE(status,'')) IN ('closed','cancelled')";

export async function buildDashboard(env: Env, f: Filt) {
  const today = new Date().toISOString().slice(0, 10);
  const in60 = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);

  // Audits: planned vs conducted by month, completion rate, upcoming
  let a: unknown[] = [f.from, f.to];
  const audByMonth = await q(env, `SELECT substr(plan_date,1,7) AS m, COUNT(*) AS planned, SUM(CASE WHEN actual_date IS NOT NULL THEN 1 ELSE 0 END) AS conducted
    FROM records WHERE register='AUD' AND deleted=0 AND plan_date BETWEEN ? AND ? ${extra(f, a)} GROUP BY m ORDER BY m`, a);
  a = [f.from, f.to];
  const audBySub = await q(env, `SELECT COALESCE(sub_category,'(blank)') AS k, ext_int AS e, COUNT(*) AS n, SUM(CASE WHEN actual_date IS NOT NULL THEN 1 ELSE 0 END) AS done
    FROM records WHERE register='AUD' AND deleted=0 AND plan_date BETWEEN ? AND ? ${extra(f, a)} GROUP BY k, e`, a);
  a = [today, in60];
  const upcoming = await q(env, `SELECT id, uid, won, client, sub_category, ext_int, report_no, process, plan_date, status, json_extract(data,'$.auditor') AS auditor, json_extract(data,'$.auditee') AS auditee
    FROM records WHERE register='AUD' AND deleted=0 AND actual_date IS NULL AND plan_date BETWEEN ? AND ? ${extra(f, a)} AND LOWER(COALESCE(status,'')) NOT IN ('cancelled') ORDER BY plan_date LIMIT 50`, a);
  a = [today];
  const overdueAudits = await q(env, `SELECT COUNT(*) AS n FROM records WHERE register='AUD' AND deleted=0 AND actual_date IS NULL AND plan_date < ? AND LOWER(COALESCE(status,'')) NOT IN ('cancelled','postponed') ${extra(f, a)}`, a);

  // Findings
  a = [f.from, f.to];
  const fBase = `FROM records WHERE register='FND' AND deleted=0 AND plan_date BETWEEN ? AND ?`;
  const fndByMonth = await q(env, `SELECT substr(plan_date,1,7) AS m, UPPER(COALESCE(finding_type,'')) AS t, COUNT(*) AS n ${fBase} ${extra(f, a)} GROUP BY m, t ORDER BY m`, a);
  a = [f.from, f.to];
  const fndTotals = await q(env, `SELECT UPPER(COALESCE(finding_type,'')) AS t, COUNT(*) AS n, SUM(CASE WHEN ${CLOSED} THEN 1 ELSE 0 END) AS closed ${fBase} ${extra(f, a)} GROUP BY t`, a);
  a = [f.from, f.to];
  const fndBySub = await q(env, `SELECT COALESCE(sub_category,'(blank)') AS k, COUNT(*) AS n, SUM(CASE WHEN ${CLOSED} THEN 1 ELSE 0 END) AS closed ${fBase} ${extra(f, a)} GROUP BY k ORDER BY n DESC`, a);
  a = [f.from, f.to];
  const fndByClient = await q(env, `SELECT COALESCE(client,'(blank)') AS k, COUNT(*) AS n, SUM(CASE WHEN ${CLOSED} THEN 0 ELSE 1 END) AS open ${fBase} ${extra(f, a)} GROUP BY k ORDER BY n DESC LIMIT 12`, a);
  a = [f.from, f.to];
  const fndByProcess = await q(env, `SELECT COALESCE(process,'(blank)') AS k, COUNT(*) AS n ${fBase} ${extra(f, a)} GROUP BY k ORDER BY n DESC LIMIT 12`, a);
  a = [f.from, f.to];
  const fndByExt = await q(env, `SELECT COALESCE(ext_int,'(blank)') AS k, COUNT(*) AS n ${fBase} ${extra(f, a)} GROUP BY k`, a);
  a = [];
  const aging = await q(env, `SELECT
      SUM(CASE WHEN julianday('now') - julianday(plan_date) <= 30 THEN 1 ELSE 0 END) AS d30,
      SUM(CASE WHEN julianday('now') - julianday(plan_date) BETWEEN 30.0001 AND 60 THEN 1 ELSE 0 END) AS d60,
      SUM(CASE WHEN julianday('now') - julianday(plan_date) BETWEEN 60.0001 AND 90 THEN 1 ELSE 0 END) AS d90,
      SUM(CASE WHEN julianday('now') - julianday(plan_date) > 90 THEN 1 ELSE 0 END) AS over90,
      COUNT(*) AS open
    FROM records WHERE register='FND' AND deleted=0 AND NOT (${CLOSED}) AND plan_date IS NOT NULL ${extra(f, a)}`, a);

  // Inspections
  a = [f.from, f.to];
  const rfi = await q(env, `SELECT substr(COALESCE(actual_date, plan_date),1,7) AS m, COUNT(*) AS n,
      SUM(CASE WHEN UPPER(status) LIKE 'REJECT%' THEN 1 ELSE 0 END) AS rej, SUM(CASE WHEN UPPER(status) LIKE 'CANCEL%' THEN 1 ELSE 0 END) AS canc
    FROM records WHERE register='RFI' AND deleted=0 AND COALESCE(actual_date, plan_date) BETWEEN ? AND ? ${extra(f, a)} GROUP BY m ORDER BY m`, a);
  a = [f.from, f.to];
  const nfi = await q(env, `SELECT COALESCE(status,'(blank)') AS k, COUNT(*) AS n FROM records WHERE register='NFI' AND deleted=0 AND COALESCE(plan_date, actual_date) BETWEEN ? AND ? ${extra(f, a)} GROUP BY k`, a);
  a = [f.from, f.to];
  const src = await q(env, `SELECT COALESCE(finding_type,'(blank)') AS k, COUNT(*) AS n FROM records WHERE register='SRC' AND deleted=0 AND COALESCE(actual_date, plan_date) BETWEEN ? AND ? ${extra(f, a)} GROUP BY k`, a);

  // Welding (film-based repair rate = rejected films / films RT'd)
  a = [f.from, f.to];
  const wrrByMonth = await q(env, `SELECT substr(actual_date,1,7) AS m, SUM(COALESCE(num1,0)) AS films, SUM(COALESCE(num2,0)) AS rej, SUM(COALESCE(num3,0)) AS joints
    FROM records WHERE register='WRR' AND deleted=0 AND actual_date BETWEEN ? AND ? ${extra(f, a)} GROUP BY m ORDER BY m`, a);
  a = [f.from, f.to];
  const wrrBySite = await q(env, `SELECT COALESCE(process,'(blank)') AS k, SUM(COALESCE(num1,0)) AS films, SUM(COALESCE(num2,0)) AS rej
    FROM records WHERE register='WRR' AND deleted=0 AND actual_date BETWEEN ? AND ? ${extra(f, a)} GROUP BY k ORDER BY films DESC`, a);
  a = [f.from, f.to];
  const wrrByWelder = await q(env, `SELECT report_no AS welder, MAX(json_extract(data,'$.welder_name')) AS name, SUM(COALESCE(num1,0)) AS films, SUM(COALESCE(num2,0)) AS rej
    FROM records WHERE register='WRR' AND deleted=0 AND actual_date BETWEEN ? AND ? ${extra(f, a)} GROUP BY welder HAVING films > 0 ORDER BY rej DESC, films DESC LIMIT 15`, a);

  // Training
  a = [f.from, f.to];
  const trnByMonth = await q(env, `SELECT substr(plan_date,1,7) AS m, COUNT(*) AS planned, SUM(CASE WHEN actual_date IS NOT NULL THEN 1 ELSE 0 END) AS conducted,
      SUM(COALESCE(num1,0)) AS participants, SUM(COALESCE(num1,0) * COALESCE(num2,0)) AS manhours
    FROM records WHERE register='TRN' AND deleted=0 AND plan_date BETWEEN ? AND ? ${extra(f, a)} GROUP BY m ORDER BY m`, a);
  a = [f.from, f.to];
  const trnBySub = await q(env, `SELECT COALESCE(sub_category,'(blank)') AS k, COALESCE(category,'') AS p, COUNT(*) AS n, SUM(CASE WHEN actual_date IS NOT NULL THEN 1 ELSE 0 END) AS done
    FROM records WHERE register='TRN' AND deleted=0 AND plan_date BETWEEN ? AND ? ${extra(f, a)} GROUP BY k, p`, a);

  // Customer feedback
  a = [f.from, f.to];
  const cfb = await q(env, `SELECT COALESCE(sub_category,'(blank)') AS k, COUNT(*) AS n, AVG(CASE WHEN sub_category='Customer Satisfaction Survey' THEN num1 END) AS survey,
      SUM(CASE WHEN sub_category='Complaint' AND NOT (${CLOSED}) THEN 1 ELSE 0 END) AS open_complaints
    FROM records WHERE register='CFB' AND deleted=0 AND plan_date BETWEEN ? AND ? ${extra(f, a)} GROUP BY k`, a);

  const sum = (rows: any[], k: string) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const planned = sum(audByMonth, 'planned'), conducted = sum(audByMonth, 'conducted');
  const fTotal = sum(fndTotals, 'n'), fClosed = sum(fndTotals, 'closed');
  const rfiN = sum(rfi, 'n'), rfiRej = sum(rfi, 'rej'), rfiCanc = sum(rfi, 'canc');
  const films = sum(wrrByMonth, 'films'), filmsRej = sum(wrrByMonth, 'rej');
  const trnPlanned = sum(trnByMonth, 'planned'), trnDone = sum(trnByMonth, 'conducted');
  const surveys = cfb.find((r: any) => r.k === 'Customer Satisfaction Survey');
  return {
    filter: f,
    kpi: {
      audits_planned: planned, audits_conducted: conducted, audit_completion: planned ? conducted / planned : null, audits_overdue: overdueAudits[0]?.n ?? 0,
      findings_total: fTotal, findings_open: fTotal - fClosed, closure_rate: fTotal ? fClosed / fTotal : null,
      ncr: fndTotals.find((r: any) => r.t === 'NCR')?.n ?? 0, obs: fndTotals.find((r: any) => r.t === 'OBSERVATION')?.n ?? 0, afi: fndTotals.find((r: any) => r.t === 'AFI')?.n ?? 0,
      rfi_total: rfiN, rfi_rejection: rfiN - rfiCanc ? rfiRej / (rfiN - rfiCanc) : null,
      films_rt: films, films_rej: filmsRej, repair_rate: films ? filmsRej / films : null,
      trainings_planned: trnPlanned, trainings_conducted: trnDone, training_completion: trnPlanned ? trnDone / trnPlanned : null, participants: sum(trnByMonth, 'participants'),
      feedback_total: sum(cfb, 'n'), survey_score: surveys?.survey ?? null, complaints_open: sum(cfb, 'open_complaints'),
      aging: aging[0] || {},
    },
    audits: { byMonth: audByMonth, bySub: audBySub, upcoming },
    findings: { byMonth: fndByMonth, totals: fndTotals, bySub: fndBySub, byClient: fndByClient, byProcess: fndByProcess, byExt: fndByExt },
    inspections: { rfi, nfi, src },
    welding: { byMonth: wrrByMonth, bySite: wrrBySite, byWelder: wrrByWelder },
    training: { byMonth: trnByMonth, bySub: trnBySub },
    feedback: cfb,
  };
}

statRoutes.get('/dashboard', async (c) => {
  requirePerm(c, 'dashboard', 'view');
  return c.json(await buildDashboard(c.env, filt(c.req.query())));
});

statRoutes.get('/filters', async (c) => {
  const clients = await q(c.env, "SELECT DISTINCT client FROM records WHERE deleted=0 AND client IS NOT NULL AND client <> '' ORDER BY client", []);
  const wons = await q(c.env, "SELECT w.won, w.client, w.title, w.project_no FROM work_orders w ORDER BY w.won", []);
  const recWons = await q(c.env, "SELECT DISTINCT won FROM records WHERE deleted=0 AND won IS NOT NULL ORDER BY won", []);
  const years = await q(c.env, "SELECT DISTINCT substr(COALESCE(plan_date, actual_date),1,4) AS y FROM records WHERE deleted=0 AND COALESCE(plan_date, actual_date) IS NOT NULL ORDER BY y DESC", []);
  return c.json({ clients: clients.map((r: any) => r.client), workorders: wons, wons: recWons.map((r: any) => r.won), years: years.map((r: any) => r.y).filter((y: string) => /^\d{4}$/.test(y)) });
});

// Health of one work order from its linked records.
async function health(env: Env, won: string) {
  const settings = Object.fromEntries((await q(env, "SELECT key, value FROM settings WHERE key LIKE 'health_%' OR key = 'wrr_target'", [])).map((r: any) => [r.key, r.value]));
  const wrrTarget = Number(settings.wrr_target || 0.02);
  const openNcr = (await q(env, `SELECT COUNT(*) AS n FROM records WHERE register='FND' AND deleted=0 AND won=? AND UPPER(finding_type)='NCR' AND NOT (${CLOSED})`, [won]))[0].n;
  const overdue = (await q(env, `SELECT COUNT(*) AS n FROM records WHERE register='FND' AND deleted=0 AND won=? AND NOT (${CLOSED}) AND julianday('now') - julianday(plan_date) > 90`, [won]))[0].n;
  const openObs = (await q(env, `SELECT COUNT(*) AS n FROM records WHERE register='FND' AND deleted=0 AND won=? AND NOT (${CLOSED})`, [won]))[0].n;
  const w = (await q(env, `SELECT SUM(COALESCE(num1,0)) AS films, SUM(COALESCE(num2,0)) AS rej FROM records WHERE register='WRR' AND deleted=0 AND won=? AND actual_date >= date('now','-90 day')`, [won]))[0];
  const rate = w.films ? w.rej / w.films : null;
  const r = (await q(env, `SELECT COUNT(*) AS n, SUM(CASE WHEN UPPER(status) LIKE 'REJECT%' THEN 1 ELSE 0 END) AS rej FROM records WHERE register='RFI' AND deleted=0 AND won=? AND COALESCE(actual_date, plan_date) >= date('now','-90 day')`, [won]))[0];
  const rfiRate = r.n ? r.rej / r.n : null;
  const reasons: string[] = [];
  let level = 0;
  if (openNcr > 0) { reasons.push(`${openNcr} open NCR`); level = Math.max(level, openNcr >= 3 ? 2 : 1); }
  if (overdue > 0) { reasons.push(`${overdue} finding(s) open > 90 days`); level = Math.max(level, 2); }
  if (rate !== null && rate > wrrTarget) { reasons.push(`Weld repair rate ${(rate * 100).toFixed(2)}% (90 d) above ${(wrrTarget * 100).toFixed(1)}% target`); level = Math.max(level, rate > 2 * wrrTarget ? 2 : 1); }
  if (rfiRate !== null && rfiRate > 0.1) { reasons.push(`RFI rejection ${(rfiRate * 100).toFixed(1)}% (90 d)`); level = Math.max(level, 1); }
  if (openObs > 5 && level === 0) { reasons.push(`${openObs} open findings`); level = 1; }
  return { status: ['Green', 'Amber', 'Red'][level], reasons, openNcr, openFindings: openObs, overdue, repairRate: rate, rfiRejection: rfiRate };
}

statRoutes.get('/workorders', async (c) => {
  requirePerm(c, 'workorders', 'view');
  const rows = await q(c.env, `SELECT w.*,
      (SELECT COUNT(*) FROM records r WHERE r.won=w.won AND r.deleted=0) AS linked,
      (SELECT COUNT(*) FROM records r WHERE r.won=w.won AND r.deleted=0 AND r.register='FND' AND NOT (LOWER(COALESCE(r.status,'')) IN ('closed','cancelled'))) AS open_findings,
      (SELECT COUNT(*) FROM records r WHERE r.won=w.won AND r.deleted=0 AND r.register='FND' AND UPPER(r.finding_type)='NCR' AND NOT (LOWER(COALESCE(r.status,'')) IN ('closed','cancelled'))) AS open_ncr,
      (SELECT MAX(COALESCE(r.actual_date, r.plan_date)) FROM records r WHERE r.won=w.won AND r.deleted=0) AS last_activity
    FROM work_orders w ORDER BY last_activity DESC NULLS LAST, w.won`, []);
  const orphan = await q(c.env, `SELECT won, COUNT(*) AS linked FROM records WHERE deleted=0 AND won IS NOT NULL AND won NOT IN (SELECT won FROM work_orders) GROUP BY won ORDER BY linked DESC`, []);
  return c.json({ workorders: rows, unregistered: orphan });
});

statRoutes.get('/wo/:won', async (c) => {
  requirePerm(c, 'workorders', 'view');
  const won = c.req.param('won');
  const user = c.get('user');
  const wo = await c.env.DB.prepare('SELECT * FROM work_orders WHERE won = ?').bind(won).first();
  const recs = await q(c.env, `SELECT id, register, uid, report_no, status, category, sub_category, finding_type, plan_date, actual_date, close_date, client, process, data FROM records WHERE won = ? AND deleted = 0 ORDER BY register, seq`, [won]);
  const mods: Record<string, string> = { AUD: 'audits', FND: 'findings', LLR: 'findings', NFI: 'inspections', RFI: 'inspections', SRC: 'inspections', WLD: 'welding', WRR: 'welding', TRN: 'training', CFB: 'feedback' };
  const byReg: Record<string, any[]> = {};
  for (const r of recs) {
    if (!can(user, mods[r.register] || 'findings', 'view')) continue;
    (byReg[r.register] ||= []).push({ ...r, data: JSON.parse(r.data) });
  }
  if (!wo && !recs.length) throw new HttpError(404, `No work order or records for WON ${won}`);
  return c.json({ won, workorder: wo, health: await health(c.env, won), records: byReg });
});

// Monthly QC report data for any period.
statRoutes.get('/monthly', async (c) => {
  requirePerm(c, 'reports', 'view');
  const f = filt(c.req.query());
  const dash = await buildDashboard(c.env, f);
  const a: unknown[] = [f.from, f.to];
  const newFindings = await q(c.env, `SELECT uid, report_no, json_extract(data,'$.finding_no') AS finding_no, finding_type, criticality, won, client, sub_category, ext_int, plan_date, status, json_extract(data,'$.description') AS description
    FROM records WHERE register='FND' AND deleted=0 AND plan_date BETWEEN ? AND ? ${extra(f, a)} ORDER BY plan_date, seq`, a);
  const b: unknown[] = [f.from, f.to];
  const closedFindings = await q(c.env, `SELECT uid, report_no, json_extract(data,'$.finding_no') AS finding_no, finding_type, won, client, close_date FROM records WHERE register='FND' AND deleted=0 AND close_date BETWEEN ? AND ? ${extra(f, b)} ORDER BY close_date`, b);
  const d: unknown[] = [f.from, f.to];
  const audits = await q(c.env, `SELECT uid, report_no, sub_category, ext_int, won, client, process, plan_date, actual_date, status, num1 AS ncr, num2 AS obs, num3 AS afi FROM records WHERE register='AUD' AND deleted=0 AND (plan_date BETWEEN ? AND ? OR actual_date BETWEEN ? AND ?) ORDER BY COALESCE(actual_date, plan_date)`, [f.from, f.to, f.from, f.to]);
  const e: unknown[] = [f.from, f.to];
  const trainings = await q(c.env, `SELECT uid, sub_category, won, plan_date, actual_date, json_extract(data,'$.subject') AS subject, num1 AS participants, status FROM records WHERE register='TRN' AND deleted=0 AND (actual_date BETWEEN ? AND ?) ${extra(f, e)} ORDER BY actual_date`, e);
  const g: unknown[] = [f.from, f.to];
  const feedback = await q(c.env, `SELECT uid, sub_category, client, won, plan_date, json_extract(data,'$.description') AS description, status FROM records WHERE register='CFB' AND deleted=0 AND plan_date BETWEEN ? AND ? ${extra(f, g)} ORDER BY plan_date`, g);
  const openList = await q(c.env, `SELECT uid, report_no, json_extract(data,'$.finding_no') AS finding_no, finding_type, won, client, plan_date, CAST(julianday('now') - julianday(plan_date) AS INTEGER) AS age, json_extract(data,'$.actionee') AS actionee
    FROM records WHERE register='FND' AND deleted=0 AND NOT (${CLOSED}) ${extra(f, [])} ORDER BY plan_date LIMIT 200`, f.won || f.client || f.extint ? (() => { const x: unknown[] = []; extra(f, x); return x; })() : []);
  return c.json({ ...dash, lists: { newFindings, closedFindings, audits, trainings, feedback, openFindings: openList } });
});
