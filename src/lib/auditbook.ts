// Parser for the TRAGS internal audit workbook (IAR-xx-yy): Audit Notification, Audit Report,
// Audit Finding Log and the two attendance sheets. Produces review proposals; nothing is saved here.
import { cellValue, readWorkbook } from './excel';
import { toIsoDate } from '../../shared/logic';

type Proposal = { register: string; data: Record<string, unknown> };

const txt = (ws: any, addr: string) => {
  if (!ws) return '';
  const v = cellValue(ws.getCell(addr).value);
  if (v == null) return '';
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).replace(/\s+/g, ' ').trim();
};
const iso = (ws: any, addr: string) => { const v = cellValue(ws?.getCell(addr).value); return v instanceof Date ? v.toISOString().slice(0, 10) : toIsoDate(v as any) || null; };
const sheet = (wb: any, re: RegExp) => wb.worksheets.find((w: any) => re.test(w.name));
const CRIT: Record<string, string> = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };
const TYPE: Record<string, string> = { CAR: 'NCR', NCR: 'NCR', OBS: 'OBSERVATION', OBSERVATION: 'OBSERVATION', OFI: 'AFI', AFI: 'AFI' };

export function isAuditWorkbook(wb: any) {
  return !!sheet(wb, /Audit Notification/i) && !!sheet(wb, /Audit Finding Log/i);
}

function attendees(ws: any) {
  const out: string[] = [];
  if (!ws) return out;
  for (let r = 12; r <= Math.min(ws.rowCount, 60); r++) {
    const name = txt(ws, `B${r}`);
    if (!name || /^name/i.test(name)) continue;
    const emp = txt(ws, `G${r}`), co = txt(ws, `I${r}`);
    out.push([name, emp && `ID ${emp}`, co].filter(Boolean).join(', '));
  }
  return out;
}

export async function parseAuditWorkbook(file: File): Promise<{ proposals: Proposal[]; summary: string } | null> {
  const wb = await readWorkbook(file);
  if (!isAuditWorkbook(wb)) return null;
  const an = sheet(wb, /Audit Notification/i), rep = sheet(wb, /Audit Report/i), log = sheet(wb, /Audit Finding Log/i);
  const reportNo = txt(an, 'F5') || txt(rep, 'F5') || txt(log, 'K2');
  const typeRaw = (txt(an, 'O5') || txt(rep, 'O7') || 'Internal').toUpperCase();
  const ext = /EXT/.test(typeRaw) ? 'EXTERNAL' : 'INTERNAL';
  const auditDate = iso(an, 'F6') || iso(rep, 'F7') || iso(log, 'M2');
  const reportDate = iso(rep, 'O5');
  const process = txt(an, 'G7') || txt(rep, 'G9');
  const contract = txt(an, 'G8') || txt(rep, 'G10');
  const auditors: string[] = [];
  for (let r = 12; r <= 20; r++) { const n = txt(an, `B${r}`); if (!n || /^\d\.0|AUDIT OPENING/i.test(n) || /^\d\.0/.test(txt(an, `A${r}`))) break; auditors.push(n); }
  let scope = '';
  for (let r = 24; r <= 30; r++) if (/AUDIT SCOPE/i.test(txt(an, `A${r}`))) { scope = txt(an, `A${r + 1}`); break; }
  const opening = attendees(sheet(wb, /^B; Audit Attendees/i));
  const closing = attendees(sheet(wb, /^D; Audit Attendees/i));
  const flags: Record<string, string> = { won: 'WON not stated in the workbook; select it.' };
  if (!process) flags.process = 'Department/Process not stated; select.';

  const findings: Proposal[] = [];
  let ncr = 0, obs = 0, afi = 0;
  if (log) for (let r = 5; r <= Math.min(log.rowCount, 200); r++) {
    const desc = txt(log, `I${r}`);
    if (!desc) { if (!txt(log, `C${r}`)) break; continue; }
    const no = txt(log, `C${r}`), cat = txt(log, `D${r}`).toUpperCase(), critRaw = txt(log, `E${r}`).toUpperCase();
    const ff: Record<string, string> = { ...flags };
    let type = TYPE[cat] || '';
    const prefix = (no.match(/^[A-Z]+/) || [''])[0];
    if (TYPE[prefix] && TYPE[prefix] !== type) { ff.finding_type = `Finding No ${no} indicates ${TYPE[prefix]}; category cell says ${cat || 'blank'}. Confirm.`; type = TYPE[prefix]; }
    if (!type) { type = 'OBSERVATION'; ff.finding_type = 'Category not stated; OBSERVATION applied.'; }
    const crit = CRIT[critRaw] || 'Medium';
    if (!CRIT[critRaw]) ff.criticality = 'Not stated in the source; Medium applied.';
    const raisedRaw = txt(log, `G${r}`);
    const raised = raisedRaw && !CRIT[raisedRaw.toUpperCase()] ? raisedRaw : (ext === 'EXTERNAL' ? 'External (Client Repr.) ' : auditors[0] || null);
    if (raisedRaw && CRIT[raisedRaw.toUpperCase()]) ff.raised_by = `Raised-by cell holds "${raisedRaw}"; lead auditor applied.`;
    const st = txt(log, `N${r}`).toUpperCase();
    if (type === 'NCR') ncr++; else if (type === 'AFI') afi++; else obs++;
    findings.push({ register: 'FND', data: {
      primary: 'QMS', sub_category: 'Audit', ext_int: ext, won: null, client: null,
      issue_date: iso(log, `A${r}`) || reportDate || auditDate, finding_no: no || null, nature: 'NEGETIVE', finding_type: type, criticality: crit,
      report_no: txt(log, `F${r}`) || reportNo, raised_by: raised, process: txt(log, `H${r}`) || process || null,
      description: desc, correction: txt(log, `J${r}`) || null, root_cause: txt(log, `K${r}`) || null, corrective_action: txt(log, `L${r}`) || null,
      ca_target: iso(log, `M${r}`), status: st === 'CLOSED' ? 'Closed' : 'Open', _flags: ff } });
  }

  const remarks = [contract && `Contract: ${contract}`, scope && `Scope: ${scope}`, opening.length && `Opening meeting (${opening.length}): ${opening.join('; ')}`, closing.length && `Closing meeting (${closing.length}): ${closing.join('; ')}`].filter(Boolean).join('\n');
  const audit: Proposal = { register: 'AUD', data: {
    primary: 'QMS', sub_category: 'Audit', ext_int: ext, won: null, client: null, plan_date: auditDate, actual_date: reportDate ? auditDate : null,
    report_no: reportNo || null, process: process || null, project: contract || null, auditor: auditors.join(', ') || null, auditee: process || null,
    obs_no: obs ? String(obs) : null, ncr_no: ncr ? String(ncr) : null, ofi_no: afi ? String(afi) : null,
    status: reportDate ? 'Conducted' : 'Notified', remarks: remarks || null, _flags: { ...flags, ...(reportNo ? {} : { report_no: 'Audit ID not found; enter it.' }) } } };
  return { proposals: [audit, ...findings], summary: `${reportNo || file.name}: 1 audit, ${findings.length} finding(s), ${opening.length + closing.length} attendance entries` };
}
