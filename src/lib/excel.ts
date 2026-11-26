import type { RegisterConfig } from '../../shared/registers';
import { computeColumn, mapHeaders, normHeader, toIsoDate } from '../../shared/logic';

async function ExcelJS() {
  const m: any = await import('exceljs');
  return m.default || m;
}

export function cellValue(v: any): any {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return cellValue(v.result);
    if ('richText' in v) return v.richText.map((t: any) => t.text).join('');
    if ('text' in v) return typeof v.text === 'object' ? cellValue(v.text) : v.text;
    if ('error' in v) return null;
    if ('hyperlink' in v) return v.hyperlink;
    return null;
  }
  return v;
}

export interface SheetInfo { name: string; rows: number; headerRow: number; headers: string[]; score: number }

export async function readWorkbook(file: File) {
  const X = await ExcelJS();
  const wb = new X.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  return wb;
}

// Find the header row: the row (within the first 12) that matches the most register labels.
export function analyseSheets(wb: any, cfg: RegisterConfig): SheetInfo[] {
  const out: SheetInfo[] = [];
  wb.eachSheet((ws: any) => {
    let best = { row: 1, score: -1, headers: [] as string[] };
    for (let r = 1; r <= Math.min(12, ws.rowCount); r++) {
      const headers: string[] = [];
      ws.getRow(r).eachCell({ includeEmpty: true }, (cell: any, col: number) => { headers[col - 1] = String(cellValue(cell.value) ?? '').trim(); });
      const mapped = mapHeaders(cfg, headers).filter(Boolean).length;
      if (mapped > best.score) best = { row: r, score: mapped, headers };
    }
    out.push({ name: ws.name, rows: ws.rowCount, headerRow: best.row, headers: best.headers, score: best.score });
  });
  return out.sort((a, b) => b.score - a.score);
}

export function readRows(wb: any, sheet: string, headerRow: number, mapping: (string | null)[]): { rows: Record<string, unknown>[]; extraHeaders: string[] } {
  const ws = wb.getWorksheet(sheet);
  const rows: Record<string, unknown>[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const rec: Record<string, unknown> = {};
    let filled = 0;
    mapping.forEach((key, i) => {
      if (!key) return;
      let v = cellValue(row.getCell(i + 1).value);
      if (v instanceof Date) v = v.toISOString().slice(0, 10);
      if (typeof v === 'string') { if (!v.trim()) v = null; }
      if (v !== null && v !== undefined) filled++;
      rec[key] = v;
    });
    if (filled >= 2) rows.push(rec); // skip blank and formula-only placeholder rows
  }
  return { rows, extraHeaders: [] };
}

// Validation sheet: each column header = list name, values below = dropdown options.
export function readValidationLists(wb: any): Record<string, string[]> {
  const ws = wb.worksheets.find((w: any) => /validation|list/i.test(w.name));
  if (!ws) return {};
  const lists: Record<string, string[]> = {};
  const cols = ws.columnCount;
  for (let c = 1; c <= cols; c++) {
    let header = '';
    const vals: string[] = [];
    for (let r = 1; r <= ws.rowCount; r++) {
      const v = cellValue(ws.getRow(r).getCell(c).value);
      if (v === null || v === undefined || String(v) === '') continue;
      if (!header) { header = String(v).trim(); continue; }
      vals.push(String(v));
    }
    if (header && vals.length) lists[header] = [...new Set(vals)];
  }
  return lists;
}

export function matchListToColumn(cfg: RegisterConfig, listName: string): string | null {
  const n = normHeader(listName);
  const col = cfg.columns.find((c) => c.type === 'select' && (normHeader(c.label) === n || normHeader(c.label).includes(n) || n.includes(normHeader(c.label)) || (c.aliases || []).some((a) => normHeader(a) === n)));
  return col?.key ?? null;
}

const NAVY = 'FF1E4F86';

export async function exportRegister(cfg: RegisterConfig, rows: { data: Record<string, any> }[], filename?: string) {
  const X = await ExcelJS();
  const wb = new X.Workbook();
  wb.creator = 'TRAGS Quality Management Platform';
  const ws = wb.addWorksheet(cfg.name.slice(0, 31).replace(/[\\/?*[\]:]/g, ''), { views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }] });
  ws.columns = cfg.columns.map((c) => ({ header: c.label, key: c.key, width: c.type === 'textarea' ? 50 : c.type === 'date' ? 12 : Math.min(Math.max(c.label.length + 2, 10), 28) }));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  head.alignment = { vertical: 'middle', wrapText: true };
  head.height = 30;
  const keyCount = new Map<string, number>();
  const keyOf = (d: any) => cfg.keyFields.map((k) => String(d[k] ?? '').trim()).join('|');
  for (const r of rows) { const k = keyOf(r.data); if (k.replace(/\|/g, '')) keyCount.set(k, (keyCount.get(k) || 0) + 1); }
  const dupCheck = !(cfg.keyFields.length === 1 && cfg.keyFields[0] === 'uid');
  rows.forEach((r, i) => {
    const row = ws.getRow(i + 2);
    const flags = r.data._flags || {};
    const isDup = dupCheck && (keyCount.get(keyOf(r.data)) || 0) > 1 && !/^(n\/?a\|?)+$/i.test(keyOf(r.data));
    cfg.columns.forEach((c, ci) => {
      const cell = row.getCell(ci + 1);
      let v = c.type === 'computed' ? computeColumn(c, r.data) : r.data[c.key];
      if ((c.type === 'date' || /^add_days/.test(c.compute || '')) && v) {
        const iso = toIsoDate(v);
        if (iso) { cell.value = new Date(iso + 'T00:00:00Z'); cell.numFmt = 'd-mmm-yy'; } else cell.value = String(v);
      } else if (/^ratio/.test(c.compute || '') && typeof v === 'number') { cell.value = v; cell.numFmt = '0.00%'; }
      else if (c.role === 'won' && v && /^\d+$/.test(String(v))) cell.value = Number(v);
      else if (c.role === 'uid' && v && cfg.uncPath) {
        const iso = toIsoDate(r.data[cfg.columns.find((x) => x.role === 'plan_date')?.key || '']);
        const year = iso ? iso.slice(0, 4) : `20${String(v).slice(-2)}`;
        cell.value = { text: String(v), hyperlink: cfg.uncPath.replace('{YYYY}', year).replace('{UID}', String(v)), tooltip: `Open folder ${v}` };
        cell.font = { color: { argb: 'FF0563C1' }, underline: true };
      } else cell.value = v === undefined ? null : v;
      if (c.type === 'textarea') cell.alignment = { wrapText: true, vertical: 'top' };
      if (flags[c.key]) { cell.font = { ...(cell.font || {}), color: { argb: 'FFFF0000' } }; cell.note = String(flags[c.key]); }
      if (isDup && cfg.keyFields.includes(c.key)) { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } }; cell.font = { color: { argb: 'FF9C0006' }, bold: true }; }
    });
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, rows.length + 1), column: cfg.columns.length } };
  // Validation sheet with the dropdown lists, as in the source workbooks.
  const val = wb.addWorksheet('Validation');
  let vc = 1;
  for (const c of cfg.columns) {
    if (c.type !== 'select' || !(c.options || []).length) continue;
    val.getCell(1, vc).value = c.label;
    val.getCell(1, vc).font = { bold: true };
    (c.options || []).forEach((o, i) => (val.getCell(i + 2, vc).value = o));
    val.getColumn(vc).width = 26;
    vc++;
  }
  await download(wb, filename || `${cfg.name} ${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function exportTable(name: string, headers: string[], rows: unknown[][], filename: string) {
  const X = await ExcelJS();
  const wb = new X.Workbook();
  const ws = wb.addWorksheet(name.slice(0, 31));
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  for (const r of rows) ws.addRow(r);
  ws.columns.forEach((c: any) => (c.width = 18));
  await download(wb, filename);
}

async function download(wb: any, filename: string) {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveBlob(blob, filename);
}

export function saveBlob(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename.replace(/[\\/:*?"<>|]+/g, '_');
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
