import { Hono } from 'hono';
import { type AppEnv, type Env, HttpError, requirePerm, logAudit, can, getConfig } from '../lib';
import { insertRecord, updateRecord } from '../core';
import { MODULE_OF_REGISTER } from '../../shared/registers';
import { toIsoDate } from '../../shared/logic';

export const ingestRoutes = new Hono<AppEnv>();

const DEFAULT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

// Extraction targets. Each kind maps the document to rows of one or more registers.
export const KINDS: Record<string, { label: string; schema: any; instructions: string }> = {
  audit_notification: {
    label: 'Audit notification / audit schedule',
    instructions: 'The document notifies TRAGS of one or more planned audits, surveillances or QWAs (client, certification body or internal). Extract one entry per audit.',
    schema: { type: 'object', properties: { audits: { type: 'array', items: { type: 'object', properties: {
      notification_ref: { type: 'string' }, report_no: { type: 'string' }, primary: { type: 'string', enum: ['QMS', 'PROJECT'] },
      sub_category: { type: 'string', enum: ['Audit', 'Surveillance', 'QWA'] }, ext_int: { type: 'string', enum: ['INTERNAL', 'EXTERNAL'] },
      client: { type: 'string' }, project_no: { type: 'string' }, contract_no: { type: 'string' }, won: { type: 'string' },
      plan_date: { type: 'string', description: 'planned audit date as written' }, process: { type: 'string' },
      auditor: { type: 'string' }, auditee: { type: 'string' }, scope: { type: 'string' } } } } }, required: ['audits'] },
  },
  findings_report: {
    label: 'Audit / surveillance / QWA / NCR report with findings',
    instructions: 'The document is an audit, surveillance, QWA, inspection or NCR/CAR report. Extract the report header once and every finding (NCR, observation, AFI/OFI) separately. Copy each finding description word for word from the document; do not summarise or add text.',
    schema: { type: 'object', properties: {
      report: { type: 'object', properties: { report_no: { type: 'string' }, issue_date: { type: 'string' }, primary: { type: 'string', enum: ['QMS', 'PROJECT'] },
        sub_category: { type: 'string', enum: ['Audit', 'Surveillance', 'QWA', 'Inspection'] }, ext_int: { type: 'string', enum: ['INTERNAL', 'EXTERNAL'] },
        client: { type: 'string' }, project_no: { type: 'string' }, contract_no: { type: 'string' }, won: { type: 'string' }, raised_by: { type: 'string' }, recipient: { type: 'string' } } },
      findings: { type: 'array', items: { type: 'object', properties: { finding_no: { type: 'string' }, finding_type: { type: 'string', enum: ['NCR', 'OBSERVATION', 'AFI'] },
        criticality: { type: 'string', enum: ['High', 'Medium', 'Low'] }, description: { type: 'string' }, process: { type: 'string' }, location: { type: 'string' } } } } }, required: ['report', 'findings'] },
  },
  inspection_report: {
    label: 'Inspection report (source inspection, NFI, RFI)',
    instructions: 'The document is an inspection report or inspection request. Extract each inspection and any inspection findings (rejections, punch items, NCRs) separately.',
    schema: { type: 'object', properties: {
      inspections: { type: 'array', items: { type: 'object', properties: { report_no: { type: 'string' }, rfi_no: { type: 'string' }, nfi_no: { type: 'string' }, won: { type: 'string' }, project_no: { type: 'string' },
        po_no: { type: 'string' }, vendor: { type: 'string' }, item: { type: 'string' }, inspection_type: { type: 'string' }, inspection_date: { type: 'string' }, location: { type: 'string' },
        inspector: { type: 'string' }, result: { type: 'string', enum: ['Accepted', 'Rejected', 'Accepted with Comment', 'Approved', 'AWC'] }, findings: { type: 'string' } } } },
      findings: { type: 'array', items: { type: 'object', properties: { finding_no: { type: 'string' }, finding_type: { type: 'string', enum: ['NCR', 'OBSERVATION', 'AFI'] }, description: { type: 'string' } } } } }, required: ['inspections'] },
  },
  site_report: {
    label: 'Site / daily quality report',
    instructions: 'The document is a site quality report. Extract inspections carried out (RFIs), findings raised, trainings or toolbox talks held, and weld repair figures if stated. Leave out anything not stated.',
    schema: { type: 'object', properties: {
      won: { type: 'string' }, project_no: { type: 'string' }, report_date: { type: 'string' },
      inspections: { type: 'array', items: { type: 'object', properties: { rfi_no: { type: 'string' }, activity: { type: 'string' }, discipline: { type: 'string' }, inspection_date: { type: 'string' }, location: { type: 'string' }, inspector: { type: 'string' }, status: { type: 'string' } } } },
      findings: { type: 'array', items: { type: 'object', properties: { finding_no: { type: 'string' }, finding_type: { type: 'string', enum: ['NCR', 'OBSERVATION', 'AFI'] }, description: { type: 'string' }, raised_by: { type: 'string' } } } },
      trainings: { type: 'array', items: { type: 'object', properties: { subject: { type: 'string' }, date: { type: 'string' }, conducted_by: { type: 'string' }, participants: { type: 'number' } } } } } },
  },
  training_record: {
    label: 'Training attendance / training record',
    instructions: 'The document records a training or awareness session. Extract each session.',
    schema: { type: 'object', properties: { trainings: { type: 'array', items: { type: 'object', properties: { subject: { type: 'string' }, sub_category: { type: 'string', enum: ['Training', 'Awareness'] },
      date: { type: 'string' }, location: { type: 'string' }, conducted_by: { type: 'string' }, participants: { type: 'number' }, duration_hrs: { type: 'number' }, won: { type: 'string' }, process: { type: 'string' } } } } }, required: ['trainings'] },
  },
  customer_feedback: {
    label: 'Customer feedback (appreciation, complaint, survey)',
    instructions: 'The document is customer feedback to TRAGS: appreciation email, award, complaint or satisfaction survey. Extract each item. Description = email subject or headline without RE:/FW: prefixes.',
    schema: { type: 'object', properties: { feedback: { type: 'array', items: { type: 'object', properties: { sub_category: { type: 'string', enum: ['Achievements', 'Complaint', 'Customer Satisfaction Survey', 'Email Appreciation'] },
      date: { type: 'string' }, client: { type: 'string' }, won: { type: 'string' }, contract: { type: 'string' }, description: { type: 'string' }, process: { type: 'string' } } } } }, required: ['feedback'] },
  },
};

async function ai(env: Env): Promise<string> {
  const s = await env.DB.prepare("SELECT value FROM settings WHERE key='ai_model'").first<{ value: string }>();
  return s?.value || DEFAULT_MODEL;
}

async function toText(env: Env, name: string, bytes: ArrayBuffer): Promise<string> {
  const res: any = await (env.AI as any).toMarkdown({ name, blob: new Blob([bytes]) });
  const r = Array.isArray(res) ? res[0] : res;
  if (!r || r.format === 'error') throw new HttpError(422, `Text extraction failed: ${r?.error || 'unknown error'}`);
  return String(r.data || '');
}

async function classify(env: Env, text: string): Promise<string> {
  const kinds = Object.entries(KINDS).map(([k, v]) => `${k}: ${v.label}`).join('\n');
  const out: any = await env.AI.run((await ai(env)) as any, {
    messages: [
      { role: 'system', content: 'Classify the TRAGS quality document. Reply with only the kind key.' },
      { role: 'user', content: `Kinds:\n${kinds}\n\nDocument (start):\n${text.slice(0, 6000)}` },
    ],
    max_tokens: 20,
  } as any);
  const k = String(out?.response || '').trim().toLowerCase().replace(/[^a-z_]/g, '');
  return KINDS[k] ? k : 'findings_report';
}

async function extract(env: Env, kind: string, text: string): Promise<any> {
  const def = KINDS[kind];
  const system = `You extract structured data from TRAGS (Trading and Agency Services, Doha) quality documents for the QA/QC registers.
Rules: use only facts written in the document. Never invent numbers, dates, names or work order numbers. Leave a field empty when the document does not state it. Copy descriptions verbatim. Dates exactly as written. Return JSON matching the schema.`;
  const out: any = await env.AI.run((await ai(env)) as any, {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: `${def.instructions}\n\nDocument:\n"""\n${text.slice(0, 60000)}\n"""` },
    ],
    response_format: { type: 'json_schema', json_schema: def.schema },
    max_tokens: 4096,
  } as any);
  let r = out?.response;
  if (typeof r === 'string') {
    const m = r.match(/\{[\s\S]*\}/);
    r = m ? JSON.parse(m[0]) : {};
  }
  return r || {};
}

// Resolve a WON from project/contract numbers against the Work Order master. Returns a suggestion and why.
async function resolveWon(env: Env, hint: { won?: string; project_no?: string; contract_no?: string; client?: string }): Promise<{ won: string | null; basis: string | null; certain: boolean }> {
  const w = String(hint.won || '').replace(/\D/g, '');
  if (w.length === 7) {
    const hit = await env.DB.prepare('SELECT won FROM work_orders WHERE won = ?').bind(w).first();
    return { won: w, basis: hit ? 'stated in document' : 'stated in document; not in Work Order master', certain: !!hit };
  }
  if (hint.project_no) {
    const p = String(hint.project_no).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const rows = await env.DB.prepare("SELECT won, project_no FROM work_orders WHERE project_no IS NOT NULL").all<any>();
    const hits = rows.results.filter((r) => String(r.project_no).replace(/[^A-Za-z0-9]/g, '').toUpperCase() === p);
    if (hits.length === 1) return { won: hits[0].won, basis: `Project No. ${hint.project_no} in Work Order master`, certain: true };
  }
  if (hint.contract_no) {
    const rows = await env.DB.prepare('SELECT won FROM work_orders WHERE contract_no = ?').bind(String(hint.contract_no).trim()).all<any>();
    if (rows.results.length === 1) return { won: rows.results[0].won, basis: `Contract ${hint.contract_no} (single WON)`, certain: false };
    if (rows.results.length > 1) return { won: null, basis: `Contract ${hint.contract_no} is a frame contract covering ${rows.results.length} WONs; select the WON`, certain: false };
  }
  return { won: null, basis: null, certain: false };
}

// Turn the AI output into proposed register rows, with review flags on inferred fields.
async function propose(env: Env, kind: string, x: any): Promise<{ register: string; data: Record<string, unknown> }[]> {
  const out: { register: string; data: Record<string, unknown> }[] = [];
  const flagWon = async (h: any) => {
    const r = await resolveWon(env, h);
    const flags: Record<string, string> = {};
    if (!r.certain) flags.won = r.basis || 'WON not stated in the document; select it.';
    let client = h.client || null;
    if (r.won) {
      const wo = await env.DB.prepare('SELECT client FROM work_orders WHERE won = ?').bind(r.won).first<any>();
      if (wo?.client) client = wo.client;
    }
    return { won: r.won, client, flags };
  };
  if (kind === 'audit_notification') {
    for (const a of x.audits || []) {
      const w = await flagWon(a);
      out.push({ register: 'AUD', data: { primary: a.primary || (w.won === '1010010' ? 'QMS' : 'PROJECT'), sub_category: a.sub_category || 'Audit', ext_int: a.ext_int || 'EXTERNAL', won: w.won, client: w.client,
        plan_date: toIsoDate(a.plan_date) || a.plan_date || null, report_no: a.report_no || null, process: a.process || null, auditor: a.auditor || null, auditee: a.auditee || null,
        notification_ref: a.notification_ref || null, remarks: a.scope ? `Scope: ${a.scope}` : null, status: 'Notified', _flags: { ...w.flags, ...(a.process ? {} : { process: 'Not stated; select.' }) } } });
    }
  } else if (kind === 'findings_report') {
    const r = x.report || {};
    const w = await flagWon(r);
    const ext = r.ext_int || 'EXTERNAL';
    const raised = ext === 'EXTERNAL' ? 'External (Client Repr.) ' : r.raised_by || null;
    for (const f of x.findings || []) {
      out.push({ register: 'FND', data: { primary: r.primary || 'PROJECT', sub_category: r.sub_category || 'Audit', ext_int: ext, won: w.won, client: w.client,
        issue_date: toIsoDate(r.issue_date) || r.issue_date || null, finding_no: f.finding_no || null, nature: 'NEGETIVE', finding_type: f.finding_type || 'OBSERVATION',
        criticality: f.criticality || 'Medium', report_no: r.report_no || null, raised_by: raised, process: f.process || null, location: f.location || null, recipient: r.recipient || null,
        description: f.description || '', status: 'Open',
        _flags: { ...w.flags, ...(f.criticality ? {} : { criticality: 'Not stated in the source; Medium applied.' }), ...(f.process ? {} : { process: 'Select Process/Area.' }), ...(f.finding_no ? {} : { finding_no: 'Finding No not stated; enter it.' }) } } });
    }
  } else if (kind === 'inspection_report') {
    for (const i of x.inspections || []) {
      const w = await flagWon(i);
      if (i.rfi_no) out.push({ register: 'RFI', data: { rfi_no: i.rfi_no, won: w.won, client: w.client, inspection_date: toIsoDate(i.inspection_date), activity: i.item, location: i.location, inspector: i.inspector, status: i.result === 'Accepted' ? 'Approved' : i.result, _flags: w.flags } });
      else out.push({ register: 'SRC', data: { report_no: i.report_no || i.nfi_no, won: w.won, po_no: i.po_no, vendor: i.vendor, item: i.item, inspection_type: i.inspection_type, actual_date: toIsoDate(i.inspection_date), location: i.location, inspector: i.inspector, result: i.result, findings: i.findings, status: 'Closed', _flags: w.flags } });
    }
    const first = (x.inspections || [])[0] || {};
    const w = await flagWon(first);
    for (const f of x.findings || []) out.push({ register: 'FND', data: { primary: 'PROJECT', sub_category: 'Inspection', ext_int: 'INTERNAL', won: w.won, client: w.client, issue_date: toIsoDate(first.inspection_date), finding_no: f.finding_no, finding_type: f.finding_type || 'NCR', report_no: first.report_no || first.rfi_no, description: f.description, status: 'Open', _flags: { ...w.flags, criticality: 'Select criticality.' } } });
  } else if (kind === 'site_report') {
    const w = await flagWon(x);
    for (const i of x.inspections || []) out.push({ register: 'RFI', data: { rfi_no: i.rfi_no, won: w.won, client: w.client, inspection_date: toIsoDate(i.inspection_date) || toIsoDate(x.report_date), discipline: i.discipline, activity: i.activity, location: i.location, inspector: i.inspector, status: i.status, _flags: w.flags } });
    for (const f of x.findings || []) out.push({ register: 'FND', data: { primary: 'PROJECT', sub_category: 'Inspection', ext_int: 'INTERNAL', won: w.won, client: w.client, issue_date: toIsoDate(x.report_date), finding_no: f.finding_no, finding_type: f.finding_type || 'OBSERVATION', raised_by: f.raised_by, description: f.description, status: 'Open', _flags: { ...w.flags, report_no: 'Enter the report number.' } } });
    for (const t of x.trainings || []) out.push({ register: 'TRN', data: { primary: 'PROJECT', sub_category: 'Awareness', ext_int: 'INTERNAL', won: w.won, plan_date: toIsoDate(t.date), actual_date: toIsoDate(t.date), subject: t.subject, conducted_by: t.conducted_by, participants: t.participants, _flags: w.flags } });
  } else if (kind === 'training_record') {
    for (const t of x.trainings || []) {
      const w = await flagWon(t);
      out.push({ register: 'TRN', data: { primary: w.won === '1010010' ? 'QMS' : 'PROJECT', sub_category: t.sub_category || 'Training', ext_int: 'INTERNAL', won: w.won, plan_date: toIsoDate(t.date), actual_date: toIsoDate(t.date), subject: t.subject, location: t.location, conducted_by: t.conducted_by, participants: t.participants, duration_hrs: t.duration_hrs, process: t.process, _flags: w.flags } });
    }
  } else if (kind === 'customer_feedback') {
    for (const f of x.feedback || []) {
      const w = await flagWon(f);
      out.push({ register: 'CFB', data: { primary: 'PROJECT', sub_category: f.sub_category, ext_int: 'EXTERNAL', won: w.won, id_date: toIsoDate(f.date), client: f.client || w.client, contract: f.contract, description: f.description, process: f.process, status: f.sub_category === 'Complaint' ? 'Open' : null, _flags: w.flags } });
    }
  }
  return out;
}

ingestRoutes.get('/kinds', (c) => c.json(Object.entries(KINDS).map(([k, v]) => ({ kind: k, label: v.label }))));

ingestRoutes.get('/', async (c) => {
  requirePerm(c, 'ingest', 'view');
  const r = await c.env.DB.prepare('SELECT u.id, u.filename, u.mime, u.size, u.kind, u.status, u.target_register, u.won, u.error, u.created_at, u.applied_at, us.name AS uploaded_by FROM uploads u LEFT JOIN users us ON us.id = u.uploaded_by ORDER BY u.id DESC LIMIT 300').all();
  return c.json(r.results);
});

ingestRoutes.get('/:id', async (c) => {
  requirePerm(c, 'ingest', 'view');
  const r = await c.env.DB.prepare('SELECT * FROM uploads WHERE id = ?').bind(Number(c.req.param('id'))).first<any>();
  if (!r) throw new HttpError(404, 'Upload not found');
  return c.json({ ...r, extracted: r.extracted ? JSON.parse(r.extracted) : null, result: r.result ? JSON.parse(r.result) : null });
});

// Store the file. Excel registers are parsed in the browser; documents are extracted here.
ingestRoutes.post('/', async (c) => {
  requirePerm(c, 'ingest', 'create');
  const form = await c.req.formData();
  const file = form.get('file') as unknown as File | null;
  if (!file || typeof file === 'string') throw new HttpError(400, 'No file received.');
  if (file.size > 50 * 1024 * 1024) throw new HttpError(413, 'File larger than 50 MB.');
  const kind = String(form.get('kind') || 'auto');
  const target = (form.get('target') as string) || null;
  const key = `uploads/${new Date().toISOString().slice(0, 7)}/${Date.now()}-${file.name.replace(/[^\w.\- ]+/g, '_')}`;
  const bytes = await file.arrayBuffer();
  await c.env.FILES.put(key, bytes, { httpMetadata: { contentType: file.type || 'application/octet-stream' } });
  const isExcel = /\.(xlsx|xlsm)$/i.test(file.name) && kind === 'register';
  const row = await c.env.DB.prepare('INSERT INTO uploads (filename, r2_key, mime, size, kind, status, target_register, uploaded_by) VALUES (?,?,?,?,?,?,?,?) RETURNING id')
    .bind(file.name, key, file.type, file.size, isExcel ? 'register' : kind, isExcel ? 'parsing' : 'extracting', target, c.get('user').id).first<{ id: number }>();
  const id = row!.id;
  await logAudit(c, 'upload', 'upload', id, { file: file.name, kind });
  if (isExcel) return c.json({ id, status: 'parsing' });
  try {
    const text = await toText(c.env, file.name, bytes);
    const k = kind === 'auto' ? await classify(c.env, text) : kind;
    if (!KINDS[k]) throw new HttpError(400, `Unknown document type ${k}`);
    const extracted = await extract(c.env, k, text);
    const proposals = await propose(c.env, k, extracted);
    await c.env.DB.prepare("UPDATE uploads SET kind = ?, status = 'review', text_content = ?, extracted = ? WHERE id = ?")
      .bind(k, text.slice(0, 200000), JSON.stringify({ raw: extracted, proposals }), id).run();
    return c.json({ id, status: 'review', kind: k, proposals });
  } catch (e: any) {
    await c.env.DB.prepare("UPDATE uploads SET status = 'error', error = ? WHERE id = ?").bind(String(e.message || e).slice(0, 1000), id).run();
    return c.json({ id, status: 'error', error: String(e.message || e) }, 200);
  }
});

// Re-run extraction with a different document type.
ingestRoutes.post('/:id/reextract', async (c) => {
  requirePerm(c, 'ingest', 'create');
  const id = Number(c.req.param('id'));
  const { kind } = await c.req.json<any>();
  const u = await c.env.DB.prepare('SELECT * FROM uploads WHERE id = ?').bind(id).first<any>();
  if (!u) throw new HttpError(404, 'Upload not found');
  let text = u.text_content;
  if (!text) {
    const obj = await c.env.FILES.get(u.r2_key);
    if (!obj) throw new HttpError(404, 'File missing in storage');
    text = await toText(c.env, u.filename, await obj.arrayBuffer());
  }
  const extracted = await extract(c.env, kind, text);
  const proposals = await propose(c.env, kind, extracted);
  await c.env.DB.prepare("UPDATE uploads SET kind = ?, status = 'review', error = NULL, text_content = ?, extracted = ? WHERE id = ?").bind(kind, text.slice(0, 200000), JSON.stringify({ raw: extracted, proposals }), id).run();
  return c.json({ id, status: 'review', kind, proposals });
});

// Apply reviewed rows: audit notifications upsert the Audit Plan; everything else inserts.
ingestRoutes.post('/:id/apply', async (c) => {
  const id = Number(c.req.param('id'));
  const u = await c.env.DB.prepare('SELECT * FROM uploads WHERE id = ?').bind(id).first<any>();
  if (!u) throw new HttpError(404, 'Upload not found');
  const { rows } = await c.req.json<{ rows: { register: string; data: Record<string, unknown> }[] }>();
  const user = c.get('user');
  const results: any[] = [];
  for (const r of rows) {
    await getConfig(c.env, r.register);
    const module = MODULE_OF_REGISTER[r.register];
    if (!can(user, module, 'create')) { results.push({ register: r.register, error: `No permission to add to ${r.register}` }); continue; }
    try {
      if (r.register === 'AUD') {
        const ref = (r.data.report_no as string) || null;
        const nref = (r.data.notification_ref as string) || null;
        const ex = ref || nref
          ? await c.env.DB.prepare("SELECT id FROM records WHERE register='AUD' AND deleted=0 AND ((report_no IS NOT NULL AND report_no = ?) OR (json_extract(data,'$.notification_ref') IS NOT NULL AND json_extract(data,'$.notification_ref') = ?))").bind(ref, nref).first<{ id: number }>()
          : null;
        if (ex) {
          await updateRecord(c.env, ex.id, { ...r.data }, { user, source: `upload:${id}`, uploadId: id });
          results.push({ register: 'AUD', id: ex.id, action: 'updated' });
          continue;
        }
      }
      const rid = await insertRecord(c.env, r.register, r.data, { user, source: `upload:${id}`, uploadId: id });
      const rec = await c.env.DB.prepare('SELECT uid FROM records WHERE id = ?').bind(rid).first<any>();
      results.push({ register: r.register, id: rid, uid: rec?.uid, action: 'created' });
    } catch (e: any) {
      results.push({ register: r.register, error: String(e.message || e) });
    }
  }
  await c.env.DB.prepare("UPDATE uploads SET status = 'applied', result = ?, applied_at = datetime('now'), applied_by = ? WHERE id = ?").bind(JSON.stringify(results), user.id, id).run();
  await logAudit(c, 'upload.apply', 'upload', id, results);
  return c.json({ results });
});

ingestRoutes.post('/:id/status', async (c) => {
  requirePerm(c, 'ingest', 'create');
  const { status, target, result } = await c.req.json<any>();
  await c.env.DB.prepare('UPDATE uploads SET status = ?, target_register = COALESCE(?, target_register), result = COALESCE(?, result), applied_at = CASE WHEN ? = \'applied\' THEN datetime(\'now\') ELSE applied_at END WHERE id = ?')
    .bind(status, target ?? null, result ? JSON.stringify(result) : null, status, Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});
