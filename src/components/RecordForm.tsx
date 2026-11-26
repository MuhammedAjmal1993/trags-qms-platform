import { useEffect, useState } from 'react';
import type { Column, RegisterConfig } from '../../shared/registers';
import { computeColumn, toIsoDate } from '../../shared/logic';
import { api } from '../api';
import { fmtValue } from './ui';

// Config-driven form. Flagged fields (inferred or conflicting) show in red with the reason.
export function RecordForm({ cfg, value, onChange, readOnly, workorders }: {
  cfg: RegisterConfig; value: Record<string, any>; onChange: (v: Record<string, any>) => void; readOnly?: boolean;
  workorders?: { won: string; client: string; title: string; project_no: string }[];
}) {
  const flags: Record<string, string> = value._flags || {};
  const set = (k: string, v: any) => {
    const next = { ...value, [k]: v };
    // WON drives client: fill client from the Work Order master when blank.
    if (k === 'won' && workorders) {
      const wo = workorders.find((w) => w.won === String(v).trim());
      const clientCol = cfg.columns.find((c) => c.role === 'client');
      if (wo?.client && clientCol && !value[clientCol.key]) next[clientCol.key] = wo.client;
    }
    onChange(next);
  };
  const [series, setSeries] = useState<any[]>([]);
  useEffect(() => { api.get('/api/numbering').then((s) => setSeries(s.filter((x: any) => x.register === cfg.code))).catch(() => {}); }, [cfg.code]);

  const reserve = async (col: Column) => {
    const s = series.find((x) => x.field === col.key);
    if (!s) return;
    const d = toIsoDate(value[cfg.columns.find((c) => c.role === 'plan_date')?.key || '']);
    const r = await api.post(`/api/numbering/reserve/${s.code}${d ? `?year=${d.slice(0, 4)}` : ''}`);
    set(col.key, r.value);
  };

  return (
    <div className="form-grid">
      {cfg.columns.map((col) => {
        const flagged = !!flags[col.key];
        const wide = col.type === 'textarea';
        const v = value[col.key];
        if (col.type === 'computed') {
          return (
            <label key={col.key} className="f"><span>{col.label}</span>
              <input value={fmtValue(col, computeColumn(col, value))} disabled readOnly />
            </label>
          );
        }
        const hasSeries = series.some((s) => s.field === col.key);
        return (
          <label key={col.key} className={`f ${flagged ? 'flag' : ''} ${wide ? 'full' : ''}`}>
            <span>{col.label}{col.required && <b className="red"> *</b>}</span>
            {col.type === 'uid' ? (
              <input value={v ?? ''} placeholder="Assigned on save" onChange={(e) => set(col.key, e.target.value)} disabled={readOnly} />
            ) : col.type === 'select' ? (
              <>
                <input list={`dl-${cfg.code}-${col.key}`} value={v ?? ''} onChange={(e) => set(col.key, e.target.value)} disabled={readOnly} />
                <datalist id={`dl-${cfg.code}-${col.key}`}>{(col.options || []).map((o) => <option key={o} value={o} />)}</datalist>
              </>
            ) : col.type === 'textarea' ? (
              <textarea rows={col.role === 'description' ? 5 : 3} value={v ?? ''} onChange={(e) => set(col.key, e.target.value)} disabled={readOnly} />
            ) : col.type === 'date' ? (
              <input type="date" value={toIsoDate(v) ?? ''} onChange={(e) => set(col.key, e.target.value || null)} disabled={readOnly} />
            ) : col.type === 'number' || col.type === 'percent' ? (
              <input type="number" step="any" value={v ?? ''} onChange={(e) => set(col.key, e.target.value === '' ? null : Number(e.target.value))} disabled={readOnly} />
            ) : col.role === 'won' ? (
              <>
                <input list="dl-won" value={v ?? ''} onChange={(e) => set(col.key, e.target.value)} disabled={readOnly} />
                <datalist id="dl-won">{(workorders || []).map((w) => <option key={w.won} value={w.won}>{[w.client, w.project_no, w.title].filter(Boolean).join(' · ').slice(0, 90)}</option>)}</datalist>
              </>
            ) : (
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input style={{ flex: 1 }} value={v ?? ''} onChange={(e) => set(col.key, e.target.value)} disabled={readOnly} />
                {hasSeries && !readOnly && <button type="button" className="sm" title="Assign next number" onClick={() => reserve(col)}>Next #</button>}
              </div>
            )}
            {flagged && <span className="flagnote">{flags[col.key]}</span>}
          </label>
        );
      })}
    </div>
  );
}

export function missingRequired(cfg: RegisterConfig, v: Record<string, any>): string[] {
  return cfg.columns.filter((c) => c.required && c.type !== 'uid' && (v[c.key] === undefined || v[c.key] === null || String(v[c.key]).trim() === '')).map((c) => c.label);
}
