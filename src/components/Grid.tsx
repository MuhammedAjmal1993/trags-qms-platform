import { useMemo, useState } from 'react';
import type { RegisterConfig } from '../../shared/registers';
import { computeColumn, rowKey } from '../../shared/logic';
import { fmtValue, statusChip, pressable } from './ui';

export interface Row { id: number; seq: number; data: Record<string, any>; updated_at?: string }

// Excel-style register grid: sticky header, per-column filters, sort, duplicate highlight, flagged cells in red.
export function Grid({ cfg, rows, onOpen, hidden, globalQ }: { cfg: RegisterConfig; rows: Row[]; onOpen: (r: Row) => void; hidden: Set<string>; globalQ: string }) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [limit, setLimit] = useState(300);
  const cols = cfg.columns.filter((c) => !hidden.has(c.key));

  const dupKeys = useMemo(() => {
    if (cfg.keyFields.length === 1 && cfg.keyFields[0] === 'uid') return new Set<string>();
    const cnt = new Map<string, number>();
    for (const r of rows) {
      const k = rowKey(cfg, r.data);
      if (!k.replace(/\|/g, '') || /^(n\/?a\|?)+$/i.test(k)) continue;
      cnt.set(k, (cnt.get(k) || 0) + 1);
    }
    return new Set([...cnt].filter(([, n]) => n > 1).map(([k]) => k));
  }, [rows, cfg]);

  // Column lookup by key (the RFI register has ~25k rows; a linear find per cell made sorting slow).
  const colMap = useMemo(() => new Map(cfg.columns.map((c) => [c.key, c])), [cfg]);
  // Search text per row is built once per data load, not on every keystroke.
  const haystack = useMemo(() => new Map(rows.map((r) => [r.id, JSON.stringify(r.data).toLowerCase()])), [rows]);

  const view = useMemo(() => {
    const val = (r: Row, key: string) => {
      const col = colMap.get(key);
      return col?.type === 'computed' ? computeColumn(col, r.data) : r.data[key];
    };
    const q = globalQ.trim().toLowerCase();
    const active = Object.entries(filters).filter(([, f]) => f).map(([k, f]) => ({ k, f: f.toLowerCase(), raw: f, col: colMap.get(k) }));
    let out = rows.filter((r) => {
      if (q && !haystack.get(r.id)!.includes(q)) return false;
      for (const { k, f, raw, col } of active) {
        const s = fmtValue(col, val(r, k)).toLowerCase();
        if (raw === '(blank)') { if (s) return false; }
        else if (col?.type === 'select' || col?.role === 'status') { if (s !== f) return false; }
        else if (!s.includes(f)) return false;
      }
      return true;
    });
    if (sort) {
      const coll = new Intl.Collator(undefined, { numeric: true });
      const keyed = out.map((r) => ({ r, v: val(r, sort.key) }));
      keyed.sort((a, b) => {
        const x = a.v, y = b.v;
        if (x === y) return 0;
        if (x === null || x === undefined || x === '') return 1;
        if (y === null || y === undefined || y === '') return -1;
        return (typeof x === 'number' && typeof y === 'number' ? x - y : coll.compare(String(x), String(y))) * sort.dir;
      });
      out = keyed.map((k) => k.r);
    }
    return out;
  }, [rows, filters, sort, globalQ, colMap, haystack]);

  // Dropdown options for select/status columns, computed once per data load.
  const options = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of cfg.columns) {
      if (c.type !== 'select' && c.role !== 'status') continue;
      const s = new Set<string>();
      for (const r of rows) { const v = fmtValue(c, r.data[c.key]); if (v) s.add(v); }
      m.set(c.key, [...s].sort());
    }
    return m;
  }, [rows, cfg]);
  const optionsFor = (key: string) => options.get(key) || [];
  const filtered = Object.values(filters).some(Boolean);
  const toggleSort = (key: string) => setSort((s) => (s?.key === key ? (s.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }));

  return (
    <>
      <div className="grid-wrap">
        <table className="grid">
          <thead>
            <tr>
              {cols.map((c, i) => (
                <th key={c.key} className={i === 0 ? 'sticky' : ''} style={{ minWidth: c.width || (c.type === 'textarea' ? 260 : 90) }}
                  aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}
                  tabIndex={0} onClick={() => toggleSort(c.key)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSort(c.key); } }}>
                  {c.label}{sort?.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
            <tr>
              {cols.map((c, i) => (
                <th key={c.key} className={`filter-row ${i === 0 ? 'sticky' : ''}`}>
                  {c.type === 'select' || c.role === 'status' ? (
                    <select aria-label={`Filter ${c.label}`} value={filters[c.key] || ''} onChange={(e) => setFilters({ ...filters, [c.key]: e.target.value })}>
                      <option value="">All</option><option value="(blank)">(blank)</option>
                      {optionsFor(c.key).map((o) => <option key={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input aria-label={`Filter ${c.label}`} value={filters[c.key] || ''} placeholder="filter" onChange={(e) => setFilters({ ...filters, [c.key]: e.target.value })} />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.slice(0, limit).map((r) => {
              const flags = r.data._flags || {};
              const dup = dupKeys.has(rowKey(cfg, r.data));
              return (
                <tr key={r.id} {...pressable(() => onOpen(r))}>
                  {cols.map((c, i) => {
                    const v = c.type === 'computed' ? computeColumn(c, r.data) : r.data[c.key];
                    const isKey = cfg.keyFields.includes(c.key);
                    const cls = [i === 0 ? 'sticky' : '', flags[c.key] ? 'flag' : '', dup && isKey ? 'dup' : '', c.type === 'number' || c.type === 'computed' ? 'num' : ''].join(' ');
                    return (
                      <td key={c.key} className={cls} title={flags[c.key] || undefined}>
                        {c.role === 'status' ? statusChip(v) : <div className={c.type === 'textarea' ? 'clip' : ''}>{fmtValue(c, v)}</div>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!view.length && (
          <div className="empty">
            {!rows.length ? 'No records in this register yet. Use “New record” or Import / upload to add the first one.'
              : <>No rows match the current filters. {filtered && <button className="sm" style={{ marginLeft: 6 }} onClick={() => setFilters({})}>Clear column filters</button>}</>}
          </div>
        )}
      </div>
      <div className="grid-foot">
        <span>{view.length} of {rows.length} rows{dupKeys.size ? <> · <b className="red">{dupKeys.size} duplicate key(s)</b> highlighted</> : null}</span>
        {view.length > limit && <button className="sm" onClick={() => setLimit(limit + 500)}>Show 500 more</button>}
      </div>
    </>
  );
}
