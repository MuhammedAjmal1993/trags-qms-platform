import { MIGRATIONS } from './schema';
import WO_SEED from '../shared/wo-seed.json';
import { REGISTERS, NUMBERING_SEED, ROLE_SEED, type RegisterConfig } from '../shared/registers';
import { normaliseRow, promote, formatPattern, parsePattern, toIsoDate } from '../shared/logic';
import { type Env, type SessionUser, getConfig, HttpError, invalidateConfig } from './lib';

let schemaReady = false;

export async function ensureSchema(env: Env) {
  if (schemaReady) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, applied_at TEXT DEFAULT (datetime(\'now\')))').run();
  const done = new Set((await env.DB.prepare('SELECT id FROM schema_migrations').all<{ id: number }>()).results.map((r) => r.id));
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    await env.DB.batch([...m.sql.map((s) => env.DB.prepare(s)), env.DB.prepare('INSERT INTO schema_migrations (id) VALUES (?)').bind(m.id)]);
  }
  await seed(env);
  schemaReady = true;
}

async function seed(env: Env) {
  const stmts: D1PreparedStatement[] = [];
  for (const r of ROLE_SEED) {
    stmts.push(env.DB.prepare('INSERT OR IGNORE INTO roles (name, description, permissions, is_system) VALUES (?,?,?,1)').bind(r.name, r.description, JSON.stringify(r.permissions)));
  }
  for (const cfg of REGISTERS) {
    stmts.push(env.DB.prepare('INSERT OR IGNORE INTO registers (code, name, module, sort, config) VALUES (?,?,?,?,?)').bind(cfg.code, cfg.name, cfg.module, cfg.sort, JSON.stringify(cfg)));
  }
  for (const n of NUMBERING_SEED) {
    stmts.push(env.DB.prepare('INSERT OR IGNORE INTO numbering_series (code, label, pattern, register, field, pad) VALUES (?,?,?,?,?,?)').bind(n.code, n.label, n.pattern, n.register, n.field, n.pad));
  }
  const woCount = await env.DB.prepare('SELECT COUNT(*) AS n FROM work_orders').first<{ n: number }>();
  if (!woCount?.n) for (const w of WO_SEED as any[]) stmts.push(env.DB.prepare("INSERT OR IGNORE INTO work_orders (won, client, project_no, contract_no, title, status, notes) VALUES (?,?,?,?,?, 'Active', ?)").bind(w.won, w.client, w.project_no ?? null, w.contract_no ?? null, w.title, `Seeded: ${w.note}`));
  const itt = await env.DB.prepare("SELECT COUNT(*) AS n FROM records WHERE register='ITT'").first<{ n: number }>();
  if (!itt?.n) {
    const src = 'External source (ISO/FDIS 9001:2026 summaries by LRQA, DNV, SGS, ANSI; publication 16-Sep-2026); not a TRAGS requirement until adopted.';
    const items = [
      ['ITT-01', 'Cl. 3', 'Core terms and definitions included in the standard (from ISO 9000).', 'QM-01 definitions', 'Review QM-01 and QSP definitions against clause 3.'],
      ['ITT-02', 'Cl. 5.1 / 7.3', 'Quality culture and ethical behaviour embedded in leadership and awareness requirements.', 'QM-01 §5, Annex 11 Quality Policy; QSP-09', 'Define how leadership promotes quality culture and ethics; update awareness programme.'],
      ['ITT-03', 'Cl. 6.1', 'Risks and opportunities separated, with distinct requirements for determining and addressing each.', 'QSP-03, Format 188', 'Split risk and opportunity treatment in QSP-03 and the risk register.'],
      ['ITT-04', 'Cl. 6.3', 'Strengthened planning of changes to the QMS: planning, communication, monitoring and review of changes.', 'QSP-06, QSP-02', 'Add QMS change-management steps and records.'],
      ['ITT-05', 'Cl. 4.1 / 4.2', 'Climate change consideration in context and interested parties (ISO 9001:2015/Amd 1:2024), carried into the 2026 edition.', 'QSP-03 SWOT/PESTEL (F202, F209)', 'Record climate change relevance in the context review.'],
      ['ITT-06', 'Annex A', 'Expanded Annex A guidance on applying the requirements.', 'Internal audit programme (QSP-07)', 'Brief internal auditors; update audit checklists.'],
      ['ITT-07', 'Certification', 'Transition audit with the certification body within the transition period (expected to Sep 2029).', 'Certificates: ISO 9001 (TRAGS, Qatar Factory, TSS)', 'Agree transition audit date with the certification body.'],
    ];
    for (const [ref, clause, change, docs, action] of items) {
      const data = { ref, clause, change, affected_docs: docs, action, status: 'Not started', gap: 'To be assessed', evidence: src };
      stmts.push(env.DB.prepare("INSERT INTO records (register, row_key, report_no, category, process, status, seq, data, source) VALUES ('ITT',?,?,?,?, 'Not started', ?, ?, 'seed')").bind(ref, ref, clause, docs, Number(ref.slice(4)), JSON.stringify(data)));
    }
  }
  stmts.push(env.DB.prepare("INSERT OR IGNORE INTO templates (code, label, kind) VALUES ('F271','F271 R1 Observation Disposition Form','pdf-form'),('NCR','NCR Form (TRAGS format)','pdf-form')"));
  await env.DB.batch(stmts);
  // Non-destructive config upgrade: columns added in code are appended to stored (admin-edited) configs.
  const stored = await env.DB.prepare('SELECT code, config FROM registers').all<{ code: string; config: string }>();
  const ups: D1PreparedStatement[] = [];
  for (const row of stored.results) {
    const code = REGISTERS.find((r) => r.code === row.code);
    if (!code) continue;
    const cur = JSON.parse(row.config);
    const have = new Set((cur.columns || []).map((c: any) => c.key));
    const add = code.columns.filter((c) => !have.has(c.key) && !(cur.removedKeys || []).includes(c.key));
    if (add.length) { cur.columns = [...cur.columns, ...add]; ups.push(env.DB.prepare('UPDATE registers SET config = ? WHERE code = ?').bind(JSON.stringify(cur), row.code)); }
  }
  if (ups.length) await env.DB.batch(ups);
  invalidateConfig();
}

// ---- numbering --------------------------------------------------------------
export async function nextNumber(env: Env, seriesCode: string, year?: number, dryRun = false): Promise<string> {
  const s = await env.DB.prepare('SELECT * FROM numbering_series WHERE code = ? AND active = 1').bind(seriesCode).first<any>();
  if (!s) throw new HttpError(404, `Numbering series ${seriesCode} not found`);
  const y = s.reset_yearly ? (year ?? new Date().getUTCFullYear()) : 0;
  // Counter never falls behind numbers already present in the register.
  await syncCounterFromRecords(env, s, y);
  if (dryRun) {
    const cur = await env.DB.prepare('SELECT last FROM counters WHERE series=? AND year=?').bind(seriesCode, y).first<{ last: number }>();
    return formatPattern(s.pattern, (cur?.last ?? 0) + 1, y || new Date().getUTCFullYear(), s.pad);
  }
  const row = await env.DB.prepare('INSERT INTO counters (series, year, last) VALUES (?,?,1) ON CONFLICT(series, year) DO UPDATE SET last = last + 1 RETURNING last')
    .bind(seriesCode, y).first<{ last: number }>();
  return formatPattern(s.pattern, row!.last, y || new Date().getUTCFullYear(), s.pad);
}

async function syncCounterFromRecords(env: Env, s: any, year: number) {
  if (!s.register || !s.field) return;
  const yy = String(year).slice(2);
  const col = s.field === 'uid' ? 'uid' : s.field === 'report_no' ? 'report_no' : null;
  const rows = col
    ? await env.DB.prepare(`SELECT ${col} AS v FROM records WHERE register = ? AND deleted = 0 AND ${col} IS NOT NULL`).bind(s.register).all<{ v: string }>()
    : await env.DB.prepare(`SELECT json_extract(data, '$.' || ?) AS v FROM records WHERE register = ? AND deleted = 0`).bind(s.field, s.register).all<{ v: string }>();
  let max = 0;
  for (const r of rows.results) {
    if (!r.v) continue;
    const p = parsePattern(s.pattern, String(r.v));
    if (p && (p.yy === null || p.yy === yy || !s.reset_yearly)) max = Math.max(max, p.n);
  }
  if (max > 0) {
    await env.DB.prepare('INSERT INTO counters (series, year, last) VALUES (?,?,?) ON CONFLICT(series, year) DO UPDATE SET last = MAX(last, excluded.last)').bind(s.code, year, max).run();
  }
}

// ---- record writes ----------------------------------------------------------
export interface WriteOpts { user?: SessionUser | null; source?: string; uploadId?: number | null; skipSync?: boolean; autoUid?: boolean }

function promotedValues(cfg: RegisterConfig, data: Record<string, unknown>) {
  const p = promote(cfg, data);
  return [p.uid, p.row_key, p.won, p.client, p.status, p.category, p.sub_category, p.ext_int, p.finding_type, p.report_no, p.process, p.criticality, p.plan_date, p.actual_date, p.close_date, p.due_date, p.num1, p.num2, p.num3, p.num4];
}
const PROMO_COLS = 'uid, row_key, won, client, status, category, sub_category, ext_int, finding_type, report_no, process, criticality, plan_date, actual_date, close_date, due_date, num1, num2, num3, num4';

export async function insertRecord(env: Env, code: string, raw: Record<string, unknown>, opts: WriteOpts = {}): Promise<number> {
  const cfg = await getConfig(env, code);
  let data = normaliseRow(cfg, raw);
  data = applyRegisterDefaults(cfg, data);
  await fillFromWorkOrder(env, cfg, data);
  const uidCol = cfg.columns.find((c) => c.role === 'uid');
  let seq: number | null = null;
  // Finding Register: all findings of one report share the report's UID and sit as the next rows of that group.
  if (code === 'FND' && data.report_no) {
    const grp = await env.DB.prepare("SELECT uid, MAX(seq) AS s FROM records WHERE register='FND' AND deleted=0 AND report_no = ? GROUP BY uid ORDER BY s DESC LIMIT 1").bind(String(data.report_no).trim()).first<any>();
    if (grp?.uid) {
      if (uidCol && !data[uidCol.key]) data[uidCol.key] = grp.uid;
      const after = await env.DB.prepare("SELECT MIN(seq) AS s FROM records WHERE register='FND' AND seq > ?").bind(grp.s).first<any>();
      seq = after?.s ? (grp.s + after.s) / 2 : grp.s + 1;
    }
  }
  if (data._autonum) {
    const series = String(data._autonum);
    delete data._autonum;
    const s = await env.DB.prepare('SELECT field FROM numbering_series WHERE code = ?').bind(series).first<{ field: string }>();
    if (s?.field && !data[s.field]) {
      const d = toIsoDate(data[cfg.columns.find((c) => c.role === 'plan_date')?.key || ''] as string);
      data[s.field] = await nextNumber(env, series, d ? Number(d.slice(0, 4)) : undefined);
    }
  }
  if (cfg.uidSeries && opts.autoUid !== false) {
    const series = await env.DB.prepare('SELECT field FROM numbering_series WHERE code = ?').bind(cfg.uidSeries).first<{ field: string }>();
    const field = series?.field || uidCol?.key;
    if (field && !data[field]) {
      const d = toIsoDate(data[cfg.columns.find((c) => c.role === 'plan_date')?.key || ''] as string);
      data[field] = await nextNumber(env, cfg.uidSeries, d ? Number(d.slice(0, 4)) : undefined);
    }
  }
  const maxSeq = await env.DB.prepare('SELECT COALESCE(MAX(seq),0) AS m FROM records WHERE register = ?').bind(code).first<{ m: number }>();
  const vals = promotedValues(cfg, data);
  const res = await env.DB.prepare(`INSERT INTO records (register, ${PROMO_COLS}, seq, data, source, upload_id, created_by, updated_by) VALUES (?,${'?,'.repeat(20)}?,?,?,?,?,?) RETURNING id`)
    .bind(code, ...vals, seq ?? (maxSeq?.m ?? 0) + 1, JSON.stringify(data), opts.source ?? 'form', opts.uploadId ?? null, opts.user?.id ?? null, opts.user?.id ?? null)
    .first<{ id: number }>();
  const id = res!.id;
  await env.DB.prepare('INSERT INTO record_history (record_id, register, action, changes, user_id, user_name) VALUES (?,?,?,?,?,?)')
    .bind(id, code, 'create', JSON.stringify({ source: opts.source ?? 'form' }), opts.user?.id ?? null, opts.user?.name ?? opts.source ?? null).run();
  if (!opts.skipSync) await runSyncRules(env, code, id, opts);
  return id;
}

export async function updateRecord(env: Env, id: number, patch: Record<string, unknown>, opts: WriteOpts = {}): Promise<Record<string, unknown>> {
  const row = await env.DB.prepare('SELECT * FROM records WHERE id = ? AND deleted = 0').bind(id).first<any>();
  if (!row) throw new HttpError(404, 'Record not found');
  const cfg = await getConfig(env, row.register);
  const before = JSON.parse(row.data);
  const merged = { ...before, ...patch };
  let data = normaliseRow(cfg, merged);
  data = applyRegisterDefaults(cfg, data);
  // A user edit to a flagged field clears its review flag.
  const flags = { ...((before._flags as Record<string, string>) || {}) };
  if (!opts.source || opts.source === 'form') for (const k of Object.keys(patch)) delete flags[k];
  if (patch._flags && typeof patch._flags === 'object') Object.assign(flags, patch._flags);
  data._flags = flags;
  const changes: Record<string, [unknown, unknown]> = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(data)])) {
    if (k === '_flags') continue;
    if (JSON.stringify(before[k] ?? null) !== JSON.stringify(data[k] ?? null)) changes[k] = [before[k] ?? null, data[k] ?? null];
  }
  if (!Object.keys(changes).length && JSON.stringify(before._flags || {}) === JSON.stringify(flags)) return data;
  const vals = promotedValues(cfg, data);
  await env.DB.prepare(`UPDATE records SET ${PROMO_COLS.split(', ').map((c) => `${c} = ?`).join(', ')}, data = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(...vals, JSON.stringify(data), opts.user?.id ?? null, id).run();
  if (Object.keys(changes).length) {
    await env.DB.prepare('INSERT INTO record_history (record_id, register, action, changes, user_id, user_name) VALUES (?,?,?,?,?,?)')
      .bind(id, row.register, opts.source && opts.source !== 'form' ? `update:${opts.source}` : 'update', JSON.stringify(changes), opts.user?.id ?? null, opts.user?.name ?? opts.source ?? null).run();
  }
  if (!opts.skipSync) await runSyncRules(env, row.register, id, opts);
  return data;
}

// WON is the key: a blank client is taken from the Work Order master.
async function fillFromWorkOrder(env: Env, cfg: RegisterConfig, data: Record<string, unknown>) {
  const wonCol = cfg.columns.find((c) => c.role === 'won');
  if (cfg.code === 'NFI' || cfg.code === 'SRC') return; // client role there holds the TPI agency / vendor
  const clientCol = cfg.columns.find((c) => c.role === 'client');
  if (!wonCol || !clientCol || !data[wonCol.key] || data[clientCol.key]) return;
  const wo = await env.DB.prepare('SELECT client FROM work_orders WHERE won = ?').bind(String(data[wonCol.key]).trim()).first<{ client: string }>();
  if (wo?.client) data[clientCol.key] = wo.client;
}

// Register-specific defaults applied on every write.
function applyRegisterDefaults(cfg: RegisterConfig, data: Record<string, unknown>): Record<string, unknown> {
  if (cfg.code === 'FND') {
    if (!data.status) data.status = 'Open';
    if (!data.nature) data.nature = 'NEGETIVE';
  }
  if (cfg.code === 'AUD' && !data.status_locked) {
    const hasActual = !!toIsoDate(data.actual_date as string);
    const cur = String(data.status || '');
    if (!['Cancelled', 'Postponed', 'Closed'].includes(cur)) data.status = hasActual ? 'Conducted' : cur === 'Notified' ? 'Notified' : 'Planned';
  }
  if (cfg.code === 'TRN' && !data.status_locked) {
    if (!['Cancelled', 'Rescheduled'].includes(String(data.status || ''))) data.status = toIsoDate(data.actual_date as string) ? 'Conducted' : 'Planned';
  }
  if (cfg.code === 'CFB' && data.score === undefined) {
    const sc = String(data.sub_category || '');
    if (sc === 'Email Appreciation') data.score = 1;
    else if (sc === 'Complaint') data.score = -0.25;
    else if (sc === 'Customer Satisfaction Survey') {
      const vals = Array.from({ length: 10 }, (_, i) => Number(data[`s${i + 1}`])).filter((n) => isFinite(n) && n !== 0);
      data.score = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length / 100 : null;
    }
  }
  return data;
}

// ---- register sync rules (Audit Plan <-> Finding Register) ----------------
const AUDIT_SUBCATS = ['audit', 'surveillance', 'qwa'];
const normReport = (s: string) => s.trim().toUpperCase().replace(/-0+(\d)/g, '-$1').replace(/\s+/g, '');

export async function runSyncRules(env: Env, code: string, id: number, opts: WriteOpts) {
  if (code === 'FND') {
    const f = await env.DB.prepare('SELECT * FROM records WHERE id = ?').bind(id).first<any>();
    if (f?.report_no) await syncAuditFromFindings(env, f.report_no, f, opts);
  } else if (code === 'AUD') {
    const a = await env.DB.prepare('SELECT report_no FROM records WHERE id = ?').bind(id).first<any>();
    if (a?.report_no) await recountAudit(env, a.report_no, opts);
  }
}

async function syncAuditFromFindings(env: Env, reportNo: string, finding: any, opts: WriteOpts) {
  const sub = String(finding.sub_category || '').toLowerCase();
  if (!AUDIT_SUBCATS.includes(sub)) return; // Inspection findings never enter the Audit Plan
  if (!reportNo || /^n\/?a$/i.test(reportNo)) return;
  const plan = await env.DB.prepare("SELECT id FROM records WHERE register='AUD' AND deleted=0 AND report_no = ?").bind(reportNo).first<{ id: number }>();
  if (!plan) {
    // Format variant (IAR-07-26 vs IAR-7-26) is held for review, not added.
    const all = await env.DB.prepare("SELECT id, report_no FROM records WHERE register='AUD' AND deleted=0 AND report_no IS NOT NULL").all<any>();
    const variant = all.results.find((r) => normReport(r.report_no) === normReport(reportNo));
    if (variant) {
      await flagRecord(env, variant.id, { report_no: `Finding Register uses "${reportNo}"; plan uses "${variant.report_no}". Confirm the report number.` });
      return;
    }
    const fd = JSON.parse(finding.data);
    const prev = await env.DB.prepare("SELECT data FROM records WHERE register='AUD' AND deleted=0 AND won = ? ORDER BY seq DESC LIMIT 1").bind(finding.won).first<{ data: string }>();
    const project = prev ? JSON.parse(prev.data).project : null;
    const flags: Record<string, string> = {};
    if (!project) flags.project = 'No earlier plan row with this WON; PROJECT left blank.';
    const raised = String(fd.raised_by || '');
    await insertRecord(env, 'AUD', {
      primary: fd.primary, sub_category: fd.sub_category, ext_int: fd.ext_int, won: fd.won, client: fd.client,
      plan_date: fd.issue_date, actual_date: fd.issue_date, report_no: reportNo, process: fd.process, project,
      auditor: /^External \(Client Repr\.\)/.test(raised) ? 'External Auditor (Client Repr.)' : raised || null,
      auditee: fd.recipient, remarks: `Added from Finding Register ${fd.uid || ''}`.trim(), _flags: flags,
    }, { ...opts, source: 'sync:finding' });
    return;
  }
  // Matched: compare WON, sub category and date; flag differences on the plan row.
  const p = await env.DB.prepare('SELECT * FROM records WHERE id = ?').bind(plan.id).first<any>();
  const flags: Record<string, string> = {};
  if (finding.won && p.won && String(finding.won) !== String(p.won)) flags.won = `Finding Register shows WON ${finding.won}.`;
  if (finding.sub_category && p.sub_category && finding.sub_category !== p.sub_category) flags.sub_category = `Finding Register shows ${finding.sub_category}.`;
  if (finding.plan_date && p.actual_date && finding.plan_date !== p.actual_date) flags.actual_date = `Finding issue date is ${finding.plan_date}.`;
  if (Object.keys(flags).length) await flagRecord(env, p.id, flags);
  await recountAudit(env, reportNo, opts);
}

async function recountAudit(env: Env, reportNo: string, opts: WriteOpts) {
  const plan = await env.DB.prepare("SELECT id, data FROM records WHERE register='AUD' AND deleted=0 AND report_no = ?").bind(reportNo).first<any>();
  if (!plan) return;
  const rows = await env.DB.prepare("SELECT UPPER(finding_type) AS t, status FROM records WHERE register='FND' AND deleted=0 AND report_no = ?").bind(reportNo).all<any>();
  const agg = (t: string) => {
    const r = rows.results.filter((x) => x.t === t);
    const open = r.filter((x) => !/^(closed|cancelled)$/i.test(x.status || '')).length;
    return { n: r.length || null, st: r.length ? (open ? `${open} Open / ${r.length - open} Closed` : 'Closed') : null };
  };
  const ncr = agg('NCR'), obs = agg('OBSERVATION'), afi = agg('AFI');
  const d = JSON.parse(plan.data);
  const patch: Record<string, unknown> = { ncr_no: ncr.n, ncr_status: ncr.st, obs_no: obs.n, obs_status: obs.st, ofi_no: afi.n, ofi_status: afi.st };
  const total = rows.results.length;
  const open = rows.results.filter((x) => !/^(closed|cancelled)$/i.test(x.status || '')).length;
  if (!d.status_locked && total > 0 && open === 0 && d.actual_date) patch.status = 'Closed';
  const changed = Object.entries(patch).some(([k, v]) => (d[k] ?? null) !== v);
  if (changed) await updateRecord(env, plan.id, patch, { ...opts, source: 'sync:counts', skipSync: true });
}

async function flagRecord(env: Env, id: number, flags: Record<string, string>) {
  const row = await env.DB.prepare('SELECT data FROM records WHERE id = ?').bind(id).first<{ data: string }>();
  if (!row) return;
  const d = JSON.parse(row.data);
  d._flags = { ...(d._flags || {}), ...flags };
  await env.DB.prepare('UPDATE records SET data = ? WHERE id = ?').bind(JSON.stringify(d), id).run();
}
