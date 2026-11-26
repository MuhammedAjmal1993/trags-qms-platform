import { useMemo, useState } from 'react';
import type { RegisterConfig } from '../../shared/registers';
import { computeColumn, rowKey } from '../../shared/logic';
import { fmtValue, statusChip } from './ui';

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

  const view = useMemo(() => {
    const val = (r: Row, key: string) => {
      const col = cfg.columns.find((c) => c.key === key);
      const v = col?.type === 'computed' ? computeColumn(col, r.data) : r.data[key];
      return v;
    };
    const q = globalQ.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (q && !JSON.stringify(r.data).toLowerCase().includes(q)) return false;
      for (const [k, f] of Object.entries(filters)) {
        if (!f) continue;
        const col = cfg.columns.find((c) => c.key === k);
        const s = fmtValue(col, val(r, k)).toLowerCase();
        if (f === '(blank)') { if (s) return false; }
        else if (col?.type === 'select' || col?.role === 'status') { if (s !== f.toLowerCase()) return false; }
        else if (!s.includes(f.toLowerCase())) return false;
      }
      return true;
    });
    if (sort) {
      out = [...out].sort((a, b) => {
        const x = val(a, sort.key), y = val(b, sort.key);
        if (x === y) return 0;
        if (x === null || x === undefined || x === '') return 1;
        if (y === null || y === undefined || y === '') return -1;
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * sort.dir;
      });
    }
    return out;
  }, [rows, filters, sort, globalQ, cfg]);

  const optionsFor = (key: string) => {
    const col = cfg.columns.find((c) => c.key === key)!;
    const s = new Set<string>();
    for (const r of rows) { const v = fmtValue(col, r.data[key]); if (v) s.add(v); }
    return [...s].sort();
  };

  return (
    <>
      <div className="grid-wrap">
        <table className="grid">
          <thead>
            <tr>
              {cols.map((c, i) => (
                <th key={c.key} className={i === 0 ? 'sticky' : ''} style={{ minWidth: c.width || (c.type === 'textarea' ? 260 : 90) }}
                  onClick={() => setSort((s) => (s?.key === c.key ? (s.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 }))}>
                  {c.label}{sort?.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
            <tr>
              {cols.map((c, i) => (
                <th key={c.key} className={`filter-row ${i === 0 ? 'sticky' : ''}`}>
                  {c.type === 'select' || c.role === 'status' ? (
                    <select value={filters[c.key] || ''} onChange={(e) => setFilters({ ...filters, [c.key]: e.target.value })}>
                      <option value="">All</option><option value="(blank)">(blank)</option>
                      {optionsFor(c.key).map((o) => <option key={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input value={filters[c.key] || ''} placeholder="filter" onChange={(e) => setFilters({ ...filters, [c.key]: e.target.value })} />
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
                <tr key={r.id} onClick={() => onOpen(r)}>
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
        {!view.length && <div className="empty">No rows match.</div>}
      </div>
      <div className="grid-foot">
        <span>{view.length} of {rows.length} rows{dupKeys.size ? <> · <b className="red">{dupKeys.size} duplicate key(s)</b> highlighted</> : null}</span>
        {view.length > limit && <button className="sm" onClick={() => setLimit(limit + 500)}>Show 500 more</button>}
      </div>
    </>
  );
}
