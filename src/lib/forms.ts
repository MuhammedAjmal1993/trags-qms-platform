import { MONTHS } from '../../shared/registers';
import { toIsoDate } from '../../shared/logic';
import { fileUrl } from '../api';
import { saveBlob } from './excel';

// Field map entry: fills one PDF form field from a register value.
export interface FieldMapEntry { field: string; source: string; type: 'text' | 'date' | 'check'; equals?: string; format?: string }

// Verified against TRAGS F271 R1 (Format No. 271, Dt 13.10.2021). Section C stays blank for the QE/QM.
export const F271_DEFAULT_MAP: FieldMapEntry[] = [
  { field: 'Observation No', source: 'finding_no', type: 'text' },
  { field: 'Ref', source: 'report_no', type: 'text' },
  { field: 'Date1_af_date', source: 'issue_date', type: 'date', format: 'dd-MMM-yyyy' },
  { field: 'Check Box3', source: 'primary', type: 'check', equals: 'PROJECT' },
  { field: 'Check Box6', source: 'ext_int', type: 'check', equals: 'INTERNAL' },
  { field: 'Check Box7', source: 'ext_int', type: 'check', equals: 'EXTERNAL' },
  { field: 'Check Box8', source: 'sub_category', type: 'check', equals: 'Audit' },
  { field: 'Check Box10', source: 'sub_category', type: 'check', equals: 'Inspection' },
  { field: 'Text16', source: 'description', type: 'text' },
  { field: 'Text17', source: 'correction', type: 'text' },
  { field: 'Text18', source: 'root_cause', type: 'text' },
  { field: 'Text19', source: 'corrective_action', type: 'text' },
];

function fmt(iso: string | null, f = 'dd-MMM-yyyy') {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return f.replace('dd', d).replace('d', String(Number(d))).replace('MMM', MONTHS[Number(m) - 1]).replace('yyyy', y).replace('yy', y.slice(2)).replace('MM', m);
}

export async function listPdfFields(bytes: ArrayBuffer): Promise<{ name: string; type: string }[]> {
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return pdf.getForm().getFields().map((f) => ({ name: f.getName(), type: f.constructor.name.replace('PDF', '') }));
}

// Fill the controlled TRAGS PDF form; the output stays editable for signatures and Section C.
export async function fillPdfForm(templateKey: string, map: FieldMapEntry[], data: Record<string, any>, filename: string): Promise<string[]> {
  const { PDFDocument, PDFTextField, PDFCheckBox } = await import('pdf-lib');
  const res = await fetch(fileUrl(templateKey), { credentials: 'same-origin' });
  if (!res.ok) throw new Error('Template file could not be loaded.');
  const pdf = await PDFDocument.load(await res.arrayBuffer(), { ignoreEncryption: true });
  const form = pdf.getForm();
  const warnings: string[] = [];
  for (const m of map) {
    let field: any;
    try { field = form.getField(m.field); } catch { warnings.push(`Field "${m.field}" not found in template.`); continue; }
    const raw = data[m.source];
    if (m.type === 'check') {
      if (!(field instanceof PDFCheckBox)) continue;
      if (raw && String(raw).trim().toUpperCase() === String(m.equals).toUpperCase()) field.check(); else field.uncheck();
    } else if (field instanceof PDFTextField) {
      const v = m.type === 'date' ? fmt(toIsoDate(raw), m.format) : raw === null || raw === undefined ? '' : String(raw);
      field.setText(v);
      if (v.length > 400) { try { field.setFontSize(6); } catch { /* keep default */ } }
    }
  }
  const out = await pdf.save({ updateFieldAppearances: true });
  saveBlob(new Blob([out as BlobPart], { type: 'application/pdf' }), filename);
  return warnings;
}

// Fallback when no template is uploaded: TRAGS-layout print form (browser Save as PDF).
export function printFindingForm(kind: 'NCR' | 'OBS', d: Record<string, any>) {
  const esc = (s: unknown) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!)).replace(/\n/g, '<br>');
  const tick = (on: boolean) => (on ? '☒' : '☐');
  const title = kind === 'NCR' ? 'NON-CONFORMANCE REPORT (NCR)' : 'OBSERVATION DISPOSITION FORM';
  const html = `<!doctype html><html><head><title>${esc(d.finding_no || d.uid)}</title><style>
  body{font-family:Arial,sans-serif;font-size:11px;margin:18mm 14mm;color:#000} table{width:100%;border-collapse:collapse} td,th{border:1px solid #000;padding:5px;vertical-align:top}
  .h{background:#dfe7f1;font-weight:bold} .big{min-height:90px} h1{font-size:15px;text-align:center;margin:0 0 4px} .sub{text-align:center;font-size:10px;margin-bottom:10px}
  .sig td{height:42px}</style></head><body>
  <h1>TRADING AND AGENCY SERVICES LIMITED COMPANY W.L.L. (TRAGS)</h1><h1>${title}</h1>
  <div class="sub">Generated from the TRAGS Quality Management Platform. Replace with the controlled format when the template is uploaded.</div>
  <table><tr><td class="h">${kind === 'NCR' ? 'NCR No.' : 'Observation No.'}</td><td>${esc(d.finding_no)}</td><td class="h">Date</td><td>${esc(fmt(toIsoDate(d.issue_date)))}</td><td class="h">Ref</td><td>${esc(d.report_no)}</td></tr>
  <tr><td class="h">UID</td><td>${esc(d.uid)}</td><td class="h">WON</td><td>${esc(d.won)}</td><td class="h">Client</td><td>${esc(d.client)}</td></tr>
  <tr><td class="h">Category</td><td colspan="5">${tick(d.primary === 'PROJECT')} PROJECT &nbsp; ${tick(d.primary === 'QMS')} DEPARTMENT/QMS &nbsp; | &nbsp; ${tick(d.ext_int === 'INTERNAL')} INTERNAL &nbsp; ${tick(d.ext_int === 'EXTERNAL')} EXTERNAL &nbsp; | &nbsp; Source: ${tick(d.sub_category === 'Audit')} AUDIT ${tick(d.sub_category === 'Inspection')} INSPECTION ${tick(!['Audit', 'Inspection'].includes(d.sub_category))} OTHERS (${esc(d.sub_category)})</td></tr>
  <tr><td class="h">Process/Area</td><td colspan="2">${esc(d.process)}</td><td class="h">Criticality</td><td colspan="2">${esc(d.criticality)}</td></tr>
  <tr><td class="h">Raised by</td><td colspan="2">${esc(d.raised_by)}</td><td class="h">Recipient / Actionee</td><td colspan="2">${esc(d.recipient)} ${d.actionee ? ' / ' + esc(d.actionee) : ''}</td></tr>
  <tr><td colspan="6" class="h">A. Description of ${kind === 'NCR' ? 'Non-Conformance' : 'Observation'}</td></tr><tr><td colspan="6" class="big">${esc(d.description)}</td></tr>
  <tr><td colspan="6" class="h">B.1 Correction</td></tr><tr><td colspan="6" class="big">${esc(d.correction)}</td></tr>
  <tr><td colspan="6" class="h">B.2 Root Cause</td></tr><tr><td colspan="6" class="big">${esc(d.root_cause)}</td></tr>
  <tr><td colspan="6" class="h">B.3 Corrective Action</td></tr><tr><td colspan="6" class="big">${esc(d.corrective_action)}</td></tr>
  <tr class="sig"><td class="h">Proposed by / Date</td><td colspan="2"></td><td class="h">Approved by (QA/QC) / Date</td><td colspan="2"></td></tr>
  <tr><td colspan="6" class="h">C. Verification of Effectiveness (QA/QC)</td></tr><tr class="sig"><td colspan="6"></td></tr>
  <tr class="sig"><td class="h">Closed by / Date</td><td colspan="2"></td><td class="h">Status</td><td colspan="2">${esc(d.status)}</td></tr></table>
  <script>window.onload=()=>window.print()</script></body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
}
