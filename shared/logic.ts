import type { Column, RegisterConfig } from './registers';
import { MONTHS } from './registers';

// Dates are stored as ISO YYYY-MM-DD strings.
export function excelSerialToIso(n: number): string | null {
  if (!isFinite(n) || n < 20000 || n > 80000) return null; // 1954..2119 guard
  const ms = Math.round((n - 25569) * 86400 * 1000);
  return new Date(ms).toISOString().slice(0, 10);
}

const MON: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

export function toIsoDate(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === 'number') return excelSerialToIso(v);
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{5}(\.\d+)?$/.test(s)) return excelSerialToIso(Number(s));
  // day-first formats used in TRAGS documents: 8-Jul-26, 08/07/2026, 08.07.2026, 8 July 2026
  let m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s\-\/.]([A-Za-z]{3,9})[\s\-\/.,]+(\d{2,4})$/);
  if (m) {
    const mo = MON[m[2].toLowerCase().slice(0, 4)] ?? MON[m[2].toLowerCase().slice(0, 3)];
    if (mo) return iso(+m[3], mo, +m[1]);
  }
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (m) return iso(+m[3], +m[2], +m[1]);
  m = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) {
    const mo = MON[m[1].toLowerCase().slice(0, 3)];
    if (mo) return iso(+m[3], mo, +m[2]);
  }
  return null;
}

function iso(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return dt.toISOString().slice(0, 10);
}

export function fmtDate(isoStr: string | null | undefined): string {
  if (!isoStr) return '';
  const [y, m, d] = isoStr.split('-').map(Number);
  if (!y || !m || !d) return String(isoStr);
  return `${d}-${MONTHS[m - 1]}-${String(y).slice(2)}`;
}

export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[,%\s]/g, ''));
  return isFinite(n) ? n : null;
}

function addDays(isoStr: string, n: number): string {
  const d = new Date(isoStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Evaluate computed columns. Mirrors the Excel formulas of the source registers.
export function computeColumn(col: Column, data: Record<string, unknown>): unknown {
  const expr = col.compute || '';
  const m = expr.match(/^(\w+)\(([^)]*)\)$/);
  if (!m) return null;
  const args = m[2].split(',').map((a) => a.trim());
  const val = (k: string) => data[k];
  switch (m[1]) {
    case 'month': {
      const d = toIsoDate(val(args[0]));
      return d ? MONTHS[Number(d.slice(5, 7)) - 1] : '';
    }
    case 'actual_month': {
      const d = toIsoDate(val(args[0]));
      return d ? MONTHS[Number(d.slice(5, 7)) - 1] : 'Not Conducted';
    }
    case 'add_days': {
      const d = toIsoDate(val(args[0]));
      return d ? addDays(d, Number(args[1] || 0)) : null;
    }
    case 'ratio': {
      const a = num(val(args[0])), b = num(val(args[1]));
      return a !== null && b ? a / b : null;
    }
    case 'product': {
      const a = num(val(args[0])), b = num(val(args[1]));
      return a !== null && b !== null ? a * b : null;
    }
    default:
      return null;
  }
}

// Normalise raw values to column types and fill computed columns.
export function normaliseRow(cfg: RegisterConfig, raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const col of cfg.columns) {
    let v = raw[col.key];
    if (col.type === 'computed') continue;
    if (v === undefined) continue;
    if (typeof v === 'string') v = v.replace(/\r\n/g, '\n');
    if (col.type === 'date') out[col.key] = toIsoDate(v) ?? (v === '' || v === null ? null : String(v));
    else if (col.type === 'number' || col.type === 'percent') out[col.key] = num(v) ?? (v === '' || v === null ? null : String(v));
    else out[col.key] = v === null ? null : typeof v === 'string' ? v : String(v);
  }
  // keep unknown keys (extra workbook columns) untouched
  for (const k of Object.keys(raw)) if (!(k in out) && !cfg.columns.some((c) => c.key === k)) out[k] = raw[k];
  for (const col of cfg.columns) if (col.type === 'computed') out[col.key] = computeColumn(col, out);
  return out;
}

export interface Promoted {
  uid: string | null; won: string | null; client: string | null; status: string | null;
  category: string | null; sub_category: string | null; ext_int: string | null; finding_type: string | null;
  report_no: string | null; process: string | null; criticality: string | null;
  plan_date: string | null; actual_date: string | null; close_date: string | null; due_date: string | null;
  num1: number | null; num2: number | null; num3: number | null; num4: number | null;
  row_key: string;
}

const PROMOTED_ROLES = ['uid', 'won', 'client', 'status', 'category', 'sub_category', 'ext_int', 'finding_type', 'report_no', 'process', 'criticality', 'plan_date', 'actual_date', 'close_date', 'due_date', 'num1', 'num2', 'num3', 'num4'] as const;

export function promote(cfg: RegisterConfig, data: Record<string, unknown>): Promoted {
  const p: any = {};
  for (const r of PROMOTED_ROLES) p[r] = null;
  for (const col of cfg.columns) {
    if (!col.role || !(PROMOTED_ROLES as readonly string[]).includes(col.role)) continue;
    const v = data[col.key];
    if (v === null || v === undefined || v === '') continue;
    if (col.role.startsWith('num')) p[col.role] = num(v);
    else if (col.role.endsWith('_date')) p[col.role] = toIsoDate(v);
    else p[col.role] = String(v).trim();
  }
  if (p.won) p.won = String(p.won).replace(/\.0$/, '').trim();
  p.row_key = rowKey(cfg, data);
  return p as Promoted;
}

export function rowKey(cfg: RegisterConfig, data: Record<string, unknown>): string {
  return cfg.keyFields.map((k) => (data[k] === null || data[k] === undefined ? '' : String(data[k]).trim())).join('|');
}

export function isClosed(cfg: RegisterConfig, status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.trim().toLowerCase();
  return (cfg.closedStatuses || ['Closed']).some((c) => c.toLowerCase() === s);
}

export function normHeader(h: string): string {
  return String(h || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Map workbook headers to register columns by header name (label or alias).
export function mapHeaders(cfg: RegisterConfig, headers: string[]): (string | null)[] {
  const used = new Set<string>();
  return headers.map((h) => {
    const n = normHeader(h);
    if (!n) return null;
    const col = cfg.columns.find((c) => !used.has(c.key) && (normHeader(c.label) === n || (c.aliases || []).some((a) => normHeader(a) === n)));
    if (col) { used.add(col.key); return col.key; }
    return null;
  });
}

export function formatPattern(pattern: string, n: number, year: number, pad: number): string {
  const yy = String(year).slice(2);
  return pattern
    .replace(/\{N+\}/g, (m) => String(n).padStart(Math.max(m.length - 2, pad), '0'))
    .replace('{YYYY}', String(year))
    .replace('{YY}', yy);
}

// Parse the sequence number back out of an existing number for counter sync.
export function parsePattern(pattern: string, value: string): { n: number; yy: string | null } | null {
  const esc = pattern.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
  const rx = new RegExp('^' + esc.replace(/\\?\{N+\\?\}/g, '(\\d+)').replace(/\\?\{YYYY\\?\}/, '(\\d{4})').replace(/\\?\{YY\\?\}/, '(\\d{2})') + '$');
  const m = String(value).trim().match(rx);
  if (!m) return null;
  const order = [...pattern.matchAll(/\{(N+|YYYY|YY)\}/g)].map((x) => x[1]);
  let n = 0, yy: string | null = null;
  order.forEach((t, i) => {
    if (t.startsWith('N')) n = Number(m[i + 1]);
    else yy = t === 'YYYY' ? m[i + 1].slice(2) : m[i + 1];
  });
  return { n, yy };
}
