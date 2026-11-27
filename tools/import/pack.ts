import fs from 'node:fs';
import { REGISTERS } from '/home/claude/trags-qms/shared/registers';
import { normaliseRow, promote } from '/home/claude/trags-qms/shared/logic';
import { applyRegisterDefaults } from '/home/claude/trags-qms/worker/core';
import WO_SEED from '/home/claude/trags-qms/shared/wo-seed.json';

const RAW = '/tmp/build/raw/';
const OUT = '/tmp/build/chunks/';
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const PROMO = 'uid, row_key, won, client, status, category, sub_category, ext_int, finding_type, report_no, process, criticality, plan_date, actual_date, close_date, due_date, num1, num2, num3, num4';
const INSERT = `INSERT INTO records (register, ${PROMO}, seq, data, source) VALUES (?,${'?,'.repeat(20)}?,?,?)`;
const load = (c: string) => (fs.existsSync(RAW + c + '.json') ? JSON.parse(fs.readFileSync(RAW + c + '.json', 'utf8')) : []);
type Chunk = { kind: 'rows'; label: string; sql: string; rows: unknown[][]; est: number } | { kind: 'sql'; label: string; stmts: [string, unknown[]][]; est: number } | { kind: 'file'; label: string; key: string; mime: string; path: string; est: number };
const chunks: Chunk[] = [];

// ---- work order master
const woClient = new Map<string, Map<string, number>>(); const woTitle = new Map<string, Map<string, number>>(); const woContract = new Map<string, Map<string, number>>();
const bump = (m: Map<string, Map<string, number>>, k: any, v: any) => { if (!k || !v) return; k = String(k).trim(); v = String(v).trim(); if (!/^\d{7}$/.test(k) || !v || /^(na|n\/a|-|null)$/i.test(v)) return; const x = m.get(k) || new Map(); x.set(v, (x.get(v) || 0) + 1); m.set(k, x); };
const top = (m: Map<string, Map<string, number>>, k: string) => { const x = m.get(k); if (!x) return null; return [...x.entries()].sort((a, b) => b[1] - a[1])[0][0]; };
for (const r of load('FND')) bump(woClient, r.won, r.client);
for (const r of load('AUD')) { bump(woClient, r.won, r.client); bump(woTitle, r.won, r.project); }
for (const r of load('CFB')) { bump(woClient, r.won, r.client); bump(woContract, r.won, r.contract); }
for (const r of load('RFI')) bump(woContract, r.won, r.contract_no);
for (const r of load('LLR')) bump(woTitle, r.won, r.project_title);
const seedWon = new Set((WO_SEED as any[]).map((w) => String(w.won)));
const allWon = new Set<string>();
for (const c of ['FND', 'AUD', 'CFB', 'RFI', 'LLR', 'TRN', 'NFI', 'WRR', 'AWD', 'RSK']) for (const r of load(c)) if (r.won && /^\d{7}$/.test(String(r.won).trim())) allWon.add(String(r.won).trim());
const woStmts: [string, unknown[]][] = [];
for (const w of [...allWon].sort()) {
  const cl = top(woClient, w), ti = top(woTitle, w), co = top(woContract, w);
  if (!seedWon.has(w)) woStmts.push(["INSERT OR IGNORE INTO work_orders (won, client, contract_no, title, status, notes) VALUES (?,?,?,?, 'Active', 'Imported from TRAGS registers (Nov 2026)')", [w, cl, co, ti || `WON ${w}`]]);
  else {
    if (cl) woStmts.push(["UPDATE work_orders SET client = ? WHERE won = ? AND (client IS NULL OR client = '')", [cl, w]]);
    if (co) woStmts.push(["UPDATE work_orders SET contract_no = ? WHERE won = ? AND (contract_no IS NULL OR contract_no = '')", [co, w]]);
  }
}
const clientOf = (w: string) => top(woClient, w) || (WO_SEED as any[]).find((x) => String(x.won) === w)?.client || null;
for (let i = 0; i < woStmts.length; i += 150) chunks.push({ kind: 'sql', label: `Work orders ${i}`, stmts: woStmts.slice(i, i + 150), est: woStmts.slice(i, i + 150).length * 2 });

// ---- settings / branding files
chunks.push({ kind: 'file', label: 'Logo', key: 'public/logo-trags.png', mime: 'image/png', path: '/tmp/build/files/logo.png', est: 3 });
chunks.push({ kind: 'file', label: 'Hero', key: 'public/hero.jpg', mime: 'image/jpeg', path: '/tmp/build/files/hero.jpg', est: 3 });
chunks.push({ kind: 'sql', label: 'Branding settings', est: 4, stmts: [
  ["INSERT INTO settings (key, value) VALUES ('logo_key','public/logo-trags.png') ON CONFLICT(key) DO UPDATE SET value = excluded.value", []],
  ["INSERT INTO settings (key, value) VALUES ('hero_key','public/hero.jpg') ON CONFLICT(key) DO UPDATE SET value = excluded.value", []],
  ["INSERT INTO settings (key, value) VALUES ('public_tagline','Quality you can verify, on every work order.') ON CONFLICT(key) DO NOTHING", []],
  ["INSERT INTO settings (key, value) VALUES ('kpi_targets','{\"audit_completion\":0.9,\"ncr_closure\":0.9,\"repair_rate\":0.015,\"rfi_rejection\":0.02,\"training_completion\":0.95,\"customer_satisfaction\":0.95,\"nfi_closure\":0.9,\"nc_closeout\":0.9}') ON CONFLICT(key) DO NOTHING", []],
] });

// ---- registers
function packRegister(code: string, rows: any[], size = 120, sortFn?: (a: any, b: any) => number) {
  const cfg = REGISTERS.find((r) => r.code === code)!;
  if (!rows.length) return;
  if (sortFn) rows.sort(sortFn);
  const wonCol = cfg.columns.find((c) => c.role === 'won'), clCol = cfg.columns.find((c) => c.role === 'client');
  const out: unknown[][] = [];
  rows.forEach((raw, i) => {
    const src = { ...raw }; delete src._row; delete src._sheet;
    let d = normaliseRow(cfg, src);
    d = applyRegisterDefaults(cfg, d);
    if (wonCol && clCol && d[wonCol.key] && !d[clCol.key] && !['NFI', 'SRC', 'CRT'].includes(code)) { const c = clientOf(String(d[wonCol.key]).trim()); if (c) d[clCol.key] = c; }
    for (const k of Object.keys(d)) if (d[k] === null || d[k] === undefined || d[k] === '') delete d[k];
    const p = promote(cfg, d);
    out.push([code, p.uid, p.row_key, p.won, p.client, p.status, p.category, p.sub_category, p.ext_int, p.finding_type, p.report_no, p.process, p.criticality, p.plan_date, p.actual_date, p.close_date, p.due_date, p.num1, p.num2, p.num3, p.num4, i + 1, JSON.stringify(d), 'import:2026-11']);
  });
  for (let i = 0; i < out.length; i += size) chunks.push({ kind: 'rows', label: `${code} ${i + 1}-${Math.min(out.length, i + size)} of ${out.length}`, sql: INSERT, rows: out.slice(i, i + size), est: out.slice(i, i + size).length * 6 });
}
const byDate = (k: string) => (a: any, b: any) => String(a[k] || '').localeCompare(String(b[k] || '')) || (a._row || 0) - (b._row || 0);
for (const c of ['CRT', 'NWS', 'MRM', 'MRA', 'EVT', 'INI', 'OPP', 'RSK', 'TLB', 'PPL', 'WLD']) packRegister(c, load(c));
packRegister('AWD', load('AWD'), 120, byDate('date'));
packRegister('LLR', load('LLR'));
packRegister('CFB', load('CFB'), 100, byDate('id_date'));
packRegister('AUD', load('AUD'), 120, byDate('plan_date'));
packRegister('TRN', load('TRN'), 120, byDate('plan_date'));
packRegister('NFI', load('NFI'), 100);
packRegister('FND', load('FND'), 90, (a: any, b: any) => String(a.issue_date || '').localeCompare(String(b.issue_date || '')) || String(a.uid || '').localeCompare(String(b.uid || '')) || (a._row || 0) - (b._row || 0));

// objectives
const obj = load('_objectives');
chunks.push({ kind: 'sql', label: 'Quality objectives 2026', est: obj.length * 2 + 2, stmts: [
  ['DELETE FROM objectives WHERE year = 2026', []],
  ...obj.map((o: any) => ["INSERT INTO objectives (year, ref, objective, kpi, target, unit, direction, frequency, owner, department, metric, monthly, status, remarks, sort) VALUES (?,?,?,?,?,'','',?,?,?,?,?,?,?,?)",
    [o.year, o.ref, o.objective, null, o.target, o.frequency, o.owner, o.department, { '4.1': 'rfi_rejection', '4.2': 'repair_rate', '4.3': 'training_completion' }[o.ref as string] || null, JSON.stringify(Object.fromEntries(Object.entries(o.monthly).map(([k, v]) => [k === '6' ? 'Jun' : k, v]))), o.status, o.remarks, o.sort]] as [string, unknown[]]),
] });

// photos: files + PHO records + attachments
const photos = load('_photos');
const phoCfg = REGISTERS.find((r) => r.code === 'PHO')!;
photos.forEach((p: any, i: number) => {
  const key = `photos/import/${p.file.split('/').pop()}`;
  chunks.push({ kind: 'file', label: `Photo ${i + 1}`, key, mime: 'image/jpeg', path: p.file, est: 3 });
});
const phoRows: unknown[][] = []; const attStmts: [string, unknown[]][] = [];
photos.forEach((p: any, i: number) => {
  const d: any = normaliseRow(phoCfg, { title: p.title, type: p.type, date: p.date, location: p.location, notes: p.notes, public: p.public });
  for (const k of Object.keys(d)) if (d[k] === null || d[k] === undefined) delete d[k];
  const pr = promote(phoCfg, d);
  phoRows.push(['PHO', pr.uid, pr.row_key, pr.won, pr.client, pr.status, pr.category, pr.sub_category, pr.ext_int, pr.finding_type, pr.report_no, pr.process, pr.criticality, pr.plan_date, pr.actual_date, pr.close_date, pr.due_date, pr.num1, pr.num2, pr.num3, pr.num4, i + 1, JSON.stringify(d), 'import:2026-11']);
  const key = `photos/import/${p.file.split('/').pop()}`;
  attStmts.push(["INSERT INTO attachments (record_id, register, r2_key, filename, mime, size) VALUES ((SELECT id FROM records WHERE register='PHO' AND row_key = ? AND deleted = 0 ORDER BY id DESC LIMIT 1), 'PHO', ?, ?, 'image/jpeg', ?)", [pr.row_key, key, p.file.split('/').pop(), fs.statSync(p.file).size]]);
});
chunks.push({ kind: 'rows', label: 'PHO records', sql: INSERT, rows: phoRows, est: phoRows.length * 6 });
chunks.push({ kind: 'sql', label: 'PHO attachments', stmts: attStmts, est: attStmts.length * 3 });

// documents
const docs = load('_docs');
const mimeOf = (f: string) => f.endsWith('.pdf') ? 'application/pdf' : f.endsWith('.png') ? 'image/png' : f.endsWith('.jpg') ? 'image/jpeg' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
docs.forEach((d: any, i: number) => chunks.push({ kind: 'file', label: `Document ${i + 1}`, key: `documents/import/${d.file.split('/').pop()}`, mime: mimeOf(d.file), path: d.file, est: 4 }));
const docStmts: [string, unknown[]][] = [];
for (const d of docs) {
  const key = `documents/import/${d.file.split('/').pop()}`;
  docStmts.push(["INSERT INTO documents (doc_no, title, level, category, entity, owner, status, issue_no, expiry_date, notes) VALUES (?,?,?,?,?,?, 'Current', ?, ?, ?)", [d.doc_no || null, d.title, d.level, d.category, d.entity, d.owner, d.rev || null, d.expiry || null, d.notes || null]]);
  docStmts.push(["INSERT INTO document_revisions (document_id, rev, rev_date, r2_key, filename, mime, size, change_summary, is_current) VALUES ((SELECT MAX(id) FROM documents WHERE title = ?), ?, ?, ?, ?, ?, ?, 'Imported from QMS Platform Inputs (Nov 2026)', 1)", [d.title, d.rev || '0', d.issue || null, key, d.filename, mimeOf(d.file), fs.statSync(d.file).size]]);
}
chunks.push({ kind: 'sql', label: 'Documents', stmts: docStmts, est: docStmts.length * 3 });

// big registers last
packRegister('WRR', load('WRR'), 150, byDate('input_date'));
packRegister('RFI', load('RFI'), 150); // already newest first

// write
const manifest = chunks.map((c, i) => {
  const name = `c${String(i + 1).padStart(4, '0')}`;
  if (c.kind === 'file') fs.writeFileSync(OUT + name + '.json', JSON.stringify({ kind: 'file', key: c.key, mime: c.mime, path: c.path }));
  else fs.writeFileSync(OUT + name + '.json', JSON.stringify(c));
  return { name, kind: c.kind, label: c.label, est: c.est, rows: c.kind === 'rows' ? c.rows.length : c.kind === 'sql' ? c.stmts.length : 1 };
});
fs.writeFileSync(OUT + 'manifest.json', JSON.stringify(manifest));
console.log('chunks', manifest.length, 'est writes', manifest.reduce((a, b) => a + b.est, 0));
const byReg: Record<string, number> = {};
for (const c of chunks) if (c.kind === 'rows') byReg[c.label.split(' ')[0]] = (byReg[c.label.split(' ')[0]] || 0) + c.rows.length;
console.log(byReg);
