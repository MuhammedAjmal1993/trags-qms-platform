import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, useSWR } from '../api';
import { useApp } from '../ctx';
import { Search } from 'lucide-react';
import { Drawer, Spinner, statusChip, pct, PageSkeleton, ErrorState } from '../components/ui';
import { snapshot } from '../components/Charts';
import { fmtDate } from '../../shared/logic';
import { readWorkbook, cellValue, exportTable } from '../lib/excel';

const WO_FIELDS = [
  ['won', 'WON'], ['client', 'Client'], ['project_no', 'Project No.'], ['contract_no', 'Contract No.'], ['title', 'Title'],
  ['project_name', 'Project name'], ['location', 'Location'], ['project_manager', 'Project Manager'], ['qc_lead', 'QA/QC lead'],
  ['status', 'Status'], ['start_date', 'Start date'], ['end_date', 'End date'], ['notes', 'Notes'],
] as const;

export function WorkOrders() {
  const { can, toast } = useApp();
  const nav = useNavigate();
  const { data: d, reload: load, error: loadErr } = useSWR<{ workorders: any[]; unregistered: any[] }>('/api/stats/workorders');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<any>(null);
  const rows = useMemo(() => (d?.workorders || []).filter((w) => !q || JSON.stringify(w).toLowerCase().includes(q.toLowerCase())), [d, q]);

  const importList = async (file: File) => {
    try {
      const wb = await readWorkbook(file);
      const ws = wb.worksheets[0];
      let hdrRow = 1, map: Record<number, string> = {};
      for (let r = 1; r <= 10; r++) {
        const m: Record<number, string> = {};
        ws.getRow(r).eachCell((c: any, i: number) => {
          const h = String(cellValue(c.value) ?? '').toLowerCase();
          if (/^(won|wo#|wo no|work ?order)/.test(h)) m[i] = 'won';
          else if (/client|customer/.test(h)) m[i] = 'client';
          else if (/project ?no|p\.? ?no/.test(h)) m[i] = 'project_no';
          else if (/contract/.test(h)) m[i] = 'contract_no';
          else if (/title|description|project name|scope/.test(h)) m[i] = 'title';
          else if (/location|site/.test(h)) m[i] = 'location';
          else if (/manager|pm/.test(h)) m[i] = 'project_manager';
          else if (/status/.test(h)) m[i] = 'status';
        });
        if (Object.values(m).includes('won')) { hdrRow = r; map = m; break; }
      }
      if (!Object.values(map).includes('won')) return toast('No WON column found in the first 10 rows.', 'err');
      const list: any[] = [];
      for (let r = hdrRow + 1; r <= ws.rowCount; r++) {
        const o: any = {};
        for (const [i, k] of Object.entries(map)) { const v = cellValue(ws.getRow(r).getCell(Number(i)).value); if (v !== null && v !== '') o[k] = String(v).trim(); }
        if (o.won && /^\d{6,8}(\.0)?$/.test(o.won)) list.push(o);
      }
      for (let i = 0; i < list.length; i += 200) await api.post('/api/workorders', list.slice(i, i + 200));
      toast(`${list.length} work orders imported or updated.`);
      load();
    } catch (e: any) { toast(e.message, 'err'); }
  };
  const fileRef = useRef<HTMLInputElement>(null);

  if (!d) return loadErr ? <ErrorState message={loadErr} onRetry={load} /> : <PageSkeleton />;
  return (
    <div>
      <div className="page-head">
        <div><h1>Projects &amp; Work Orders</h1><div className="muted small">The work order number (WON) is the primary key across every register.</div></div>
        <div className="row">
          {can('workorders', 'create') && <button className="primary" onClick={() => setEdit({})}>+ Work order</button>}
          {can('workorders', 'create') && <><button onClick={() => fileRef.current?.click()}>Import WO list (Excel)</button><input ref={fileRef} type="file" hidden accept=".xlsx" onChange={(e) => e.target.files?.[0] && importList(e.target.files[0])} /></>}
          {can('workorders', 'export') && <button onClick={() => exportTable('Work Orders', [...WO_FIELDS.map((f) => f[1] as string), 'Linked records', 'Open findings', 'Open NCR'], rows.map((w) => [...WO_FIELDS.map((f) => w[f[0]]), w.linked, w.open_findings, w.open_ncr]), 'TRAGS Work Orders.xlsx')}>Export Excel</button>}
        </div>
      </div>
      <input style={{ width: 320, marginBottom: 10 }} placeholder="Search WON, client, project, contract" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="grid-wrap">
        <table className="grid"><thead><tr><th>WON</th><th>Client</th><th>Project No.</th><th>Contract</th><th>Title</th><th>Status</th><th>Linked</th><th>Open findings</th><th>Open NCR</th><th>Last activity</th></tr></thead>
          <tbody>{rows.map((w) => (
            <tr key={w.won} onClick={() => nav(`/wo/${w.won}`)}>
              <td><b>{w.won}</b></td><td>{w.client}</td><td>{w.project_no}</td><td>{w.contract_no}</td><td><div className="clip">{w.title}</div></td><td>{statusChip(w.status)}</td>
              <td className="num">{w.linked}</td><td className="num">{w.open_findings || ''}</td><td className={`num ${w.open_ncr ? 'flag' : ''}`}>{w.open_ncr || ''}</td><td>{fmtDate(w.last_activity)}</td>
            </tr>))}</tbody></table>
      </div>
      {d.unregistered.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <h3>WONs used in registers but missing from the Work Order master ({d.unregistered.length})</h3>
          <div className="row">{d.unregistered.map((u) => <button key={u.won} className="sm" onClick={() => nav(`/wo/${u.won}`)}>{u.won} <span className="muted">({u.linked})</span></button>)}</div>
        </div>
      )}
      {edit && <WoEditor wo={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}

function WoEditor({ wo, onClose, onSaved }: { wo: any; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp();
  const [v, setV] = useState<any>({ status: 'Active', ...wo });
  const isNew = !wo.won;
  const save = async () => {
    if (!/^\d{7}$/.test(String(v.won || ''))) return toast('WON must be 7 digits.', 'err');
    try { isNew ? await api.post('/api/workorders', v) : await api.put(`/api/workorders/${v.won}`, v); toast('Work order saved.'); onSaved(); } catch (e: any) { toast(e.message, 'err'); }
  };
  return (
    <Drawer title={isNew ? 'New work order' : `Work order ${wo.won}`} onClose={onClose} footer={<><button onClick={onClose}>Cancel</button><button className="primary" onClick={save}>Save</button></>}>
      <div className="form-grid">
        {WO_FIELDS.map(([k, l]) => (
          <label key={k} className={`f ${k === 'title' || k === 'notes' ? 'full' : ''}`}>{l}
            {k === 'title' || k === 'notes' ? <textarea value={v[k] ?? ''} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
              : k.endsWith('_date') ? <input type="date" value={v[k] ?? ''} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
                : k === 'status' ? <select value={v[k] ?? ''} onChange={(e) => setV({ ...v, [k]: e.target.value })}><option>Active</option><option>On hold</option><option>Completed</option><option>Closed</option></select>
                  : <input value={v[k] ?? ''} disabled={k === 'won' && !isNew} onChange={(e) => setV({ ...v, [k]: e.target.value })} />}
          </label>
        ))}
        <label className="f">Health override<select value={v.health_override ?? ''} onChange={(e) => setV({ ...v, health_override: e.target.value || null })}><option value="">Automatic</option><option>Green</option><option>Amber</option><option>Red</option></select></label>
      </div>
    </Drawer>
  );
}

const REG_LABEL: Record<string, string> = { AUD: 'Audits', FND: 'Findings', NFI: 'NFI inspections', RFI: 'RFIs', SRC: 'Source inspections', WRR: 'Weld repair', WLD: 'Welders', TRN: 'Training', CFB: 'Customer feedback', LLR: 'Lessons learnt' };
const REG_COLS: Record<string, [string, string][]> = {
  AUD: [['uid', 'UID'], ['report_no', 'Report No.'], ['sub_category', 'Type'], ['plan_date', 'Plan'], ['actual_date', 'Actual'], ['status', 'Status']],
  FND: [['uid', 'UID'], ['report_no', 'Report No.'], ['finding_type', 'Type'], ['plan_date', 'Issued'], ['status', 'Status'], ['description', 'Description']],
  NFI: [['report_no', 'NFI No'], ['plan_date', 'Received'], ['actual_date', 'Inspected'], ['finding_type', 'Result'], ['status', 'Status']],
  RFI: [['report_no', 'RFI No'], ['plan_date', 'Date'], ['process', 'Discipline'], ['status', 'Status']],
  SRC: [['report_no', 'Report No'], ['actual_date', 'Date'], ['finding_type', 'Result'], ['status', 'Status']],
  WRR: [['sub_category', 'Week'], ['report_no', 'Welder'], ['actual_date', 'Input date'], ['films_rt', "Films RT'd"], ['films_rej', 'Rejected']],
  WLD: [['report_no', 'Welder ID'], ['description', 'Name'], ['status', 'Status']],
  TRN: [['uid', 'UID'], ['sub_category', 'Type'], ['plan_date', 'Planned'], ['actual_date', 'Actual'], ['subject', 'Subject'], ['status', 'Status']],
  CFB: [['uid', 'UID'], ['sub_category', 'Type'], ['plan_date', 'Date'], ['description', 'Description'], ['status', 'Status']],
  LLR: [['uid', 'UID'], ['plan_date', 'Date'], ['description', 'Lesson'], ['status', 'Status']],
};

export function WorkOrderDetail() {
  const { won = '' } = useParams();
  const nav = useNavigate();
  const { toast } = useApp();
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<{ status?: number; msg: string } | null>(null);
  const [tab, setTab] = useState('');
  const [tries, setTries] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setD(null); setErr(null);
    api.get(`/api/stats/wo/${won}`).then((x) => { setD(x); setTab(Object.keys(x.records)[0] || ''); }).catch((e) => setErr({ status: e.status, msg: e.message }));
  }, [won, tries]);
  if (err) return err.status === 404
    ? <div className="card state-card"><div className="state-ic info"><Search size={22} /></div><b>No records for WON {won}</b><div className="muted">No work order or register entries use this number yet. Check the 7-digit WON, or browse all projects.</div><div className="row" style={{ justifyContent: 'center', marginTop: 6 }}><button className="primary" onClick={() => nav('/wo')}>All projects</button><button onClick={() => nav(-1)}>Go back</button></div></div>
    : <ErrorState message={err.msg} onRetry={() => setTries((n) => n + 1)} />;
  if (!d) return <PageSkeleton />;
  const wo = d.workorder || {};
  const h = wo.health_override ? { ...d.health, status: wo.health_override, reasons: [`Manual override (automatic: ${d.health.status})`, ...d.health.reasons] } : d.health;
  const val = (r: any, k: string) => (k in r && r[k] !== undefined && !['films_rt', 'films_rej', 'subject', 'description'].includes(k) ? r[k] : r.data[k]);
  return (
    <div ref={ref}>
      <div className="page-head">
        <div>
          <h1>WON {won} <span className="health" style={{ fontSize: 14, marginLeft: 10 }}><span className={`dot ${h.status}`} /> {h.status}</span></h1>
          <div className="muted">{[wo.client, wo.project_no, wo.contract_no].filter(Boolean).join(' · ') || 'Not in the Work Order master'}</div>
          {wo.title && <div style={{ maxWidth: 900 }}>{wo.title}</div>}
        </div>
        <div className="row no-print"><button onClick={() => ref.current && snapshot(ref.current, `WON ${won}`)}>Snapshot</button><button onClick={() => nav('/wo')}>All work orders</button></div>
      </div>
      <div className="kpis">
        <div className={`kpi ${h.status === 'Red' ? 'red' : h.status === 'Amber' ? 'amber' : 'green'}`}><div className="l">Project health</div><div className="v">{h.status}</div><div className="s">{h.reasons.join('; ') || 'No open issues'}</div></div>
        <div className="kpi"><div className="l">Open findings</div><div className="v">{d.health.openFindings}</div><div className="s">{d.health.openNcr} NCR open · {d.health.overdue} &gt; 90 days</div></div>
        <div className="kpi"><div className="l">Weld repair rate (90 d)</div><div className="v">{pct(d.health.repairRate, 2)}</div></div>
        <div className="kpi"><div className="l">RFI rejection (90 d)</div><div className="v">{pct(d.health.rfiRejection)}</div></div>
        {Object.entries(d.records).map(([k, v]: any) => <div key={k} className="kpi" style={{ cursor: 'pointer' }} onClick={() => setTab(k)}><div className="l">{REG_LABEL[k] || k}</div><div className="v">{v.length}</div></div>)}
      </div>
      <div className="tabs">{Object.keys(d.records).map((k) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{REG_LABEL[k] || k} ({d.records[k].length})</button>)}</div>
      {tab && d.records[tab] && (
        <div className="grid-wrap">
          <table className="grid"><thead><tr>{(REG_COLS[tab] || []).map(([, l]) => <th key={l}>{l}</th>)}</tr></thead>
            <tbody>{d.records[tab].map((r: any) => (
              <tr key={r.id} onClick={() => nav(`/r/${tab}?id=${r.id}&won=${won}`)}>
                {(REG_COLS[tab] || []).map(([k]) => { const v = val(r, k); return <td key={k}>{k === 'status' ? statusChip(v) : /date/.test(k) ? fmtDate(v) : <div className="clip">{v ?? ''}</div>}</td>; })}
              </tr>))}</tbody></table>
        </div>
      )}
      {!Object.keys(d.records).length && <div className="empty">No records linked to this work order yet.</div>}
    </div>
  );
}
