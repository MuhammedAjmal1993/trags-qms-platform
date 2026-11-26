import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, fileUrl, qs } from '../api';
import { useApp } from '../ctx';
import { Drawer, Spinner, statusChip, Modal, pct } from '../components/ui';
import { MONTHS } from '../../shared/registers';
import { fmtDate } from '../../shared/logic';
import { objectivesDocx } from '../lib/report';

const METRICS: Record<string, string> = {
  '': 'Manual entry', audit_completion: 'Audit completion %', closure_rate: 'Finding closure rate %', repair_rate: 'Weld repair rate % (film)',
  training_completion: 'Training completion %', rfi_rejection: 'RFI rejection %', survey_score: 'Customer survey score %', complaints: 'Customer complaints (count)', ncr: 'NCRs raised (count)',
};

export default function Plans() {
  const [tab, setTab] = useState<'obj' | 'plans'>('obj');
  return (
    <div>
      <div className="page-head"><div><h1>Plans &amp; Objectives</h1><div className="muted small">Quality, training and audit plans; yearly quality objectives with GM and QA/QC Manager sign-off.</div></div></div>
      <div className="tabs"><button className={tab === 'obj' ? 'on' : ''} onClick={() => setTab('obj')}>Quality objectives</button><button className={tab === 'plans' ? 'on' : ''} onClick={() => setTab('plans')}>Quality, training &amp; audit plans</button></div>
      {tab === 'obj' ? <Objectives /> : <PlanDocs />}
    </div>
  );
}

function Objectives() {
  const { can, toast, user } = useApp();
  const [year, setYear] = useState(new Date().getFullYear());
  const [d, setD] = useState<any>(null);
  const [edit, setEdit] = useState<any>(null);
  const [sign, setSign] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const load = () => api.get(`/api/objectives?year=${year}`).then(setD);
  useEffect(() => { load(); }, [year]);
  const signed = (d?.signoffs || []).filter((s: any) => s.role !== 'SIGNED_COPY');
  const locked = signed.length > 0;

  const fillFromData = async () => {
    const dash = await api.get(`/api/stats/dashboard${qs({ from: `${year}-01-01`, to: `${year}-12-31` })}`);
    const m = (k: string, i: number) => {
      const ym = `${year}-${String(i + 1).padStart(2, '0')}`;
      const pick = (rows: any[]) => rows.find((r: any) => r.m === ym);
      switch (k) {
        case 'audit_completion': { const r = pick(dash.audits.byMonth); return r?.planned ? r.conducted / r.planned : null; }
        case 'repair_rate': { const r = pick(dash.welding.byMonth); return r?.films ? r.rej / r.films : null; }
        case 'training_completion': { const r = pick(dash.training.byMonth); return r?.planned ? r.conducted / r.planned : null; }
        case 'rfi_rejection': { const r = pick(dash.inspections.rfi); return r && r.n - r.canc ? r.rej / (r.n - r.canc) : null; }
        case 'ncr': return dash.findings.byMonth.filter((r: any) => r.m === ym && r.t === 'NCR').reduce((s: number, r: any) => s + r.n, 0);
        default: return null;
      }
    };
    let n = 0;
    for (const o of d.objectives) {
      if (!o.metric || ['closure_rate', 'survey_score', 'complaints'].includes(o.metric)) continue;
      const monthly = { ...o.monthly };
      MONTHS.forEach((mo, i) => { const v = m(o.metric, i); if (v !== null && v !== undefined) monthly[mo] = /rate|completion|rejection/.test(o.metric) ? Number((v * 100).toFixed(2)) : v; });
      await api.put(`/api/objectives/${o.id}`, { ...o, monthly });
      n++;
    }
    toast(`${n} objective(s) updated from platform data (month-level metrics only; closure rate, survey score and complaints stay manual).`);
    load();
  };

  if (!d) return <Spinner />;
  return (
    <div>
      <div className="row" style={{ marginBottom: 10 }}>
        <label className="f">Year<select value={year} onChange={(e) => setYear(Number(e.target.value))}>{Array.from({ length: 8 }, (_, i) => new Date().getFullYear() + 1 - i).map((y) => <option key={y}>{y}</option>)}</select></label>
        {can('plans', 'create') && !locked && <button className="primary" onClick={() => setEdit({ year, direction: '>=', monthly: {} })}>+ Objective</button>}
        {can('plans', 'edit') && !locked && <button onClick={fillFromData}>Fill monthly actuals from platform data</button>}
        <button onClick={() => objectivesDocx(year, d.objectives, d.signoffs)}>Objectives report (Word)</button>
        <button onClick={() => window.print()}>Print</button>
      </div>
      <div className="report">
        <h1>TRAGS Quality Objectives {year}</h1>
        <div className="muted small">Trading and Agency Services Limited Company W.L.L. · Quality Management System (ISO 9001:2015 §6.2)</div>
        <table className="plain" style={{ marginTop: 12 }}>
          <thead><tr><th>Ref</th><th>Objective</th><th>KPI</th><th>Target</th><th>Owner</th>{MONTHS.map((m) => <th key={m}>{m}</th>)}<th>Status</th></tr></thead>
          <tbody>{d.objectives.map((o: any) => (
            <tr key={o.id} onClick={() => can('plans', 'edit') && !locked && setEdit(o)} style={{ cursor: can('plans', 'edit') && !locked ? 'pointer' : 'default' }}>
              <td>{o.ref}</td><td>{o.objective}</td><td>{o.kpi}{o.metric && <div className="muted small">auto: {METRICS[o.metric]}</div>}</td><td>{o.direction} {o.target}{o.unit}</td><td>{o.owner}</td>
              {MONTHS.map((m) => { const v = o.monthly?.[m]; const t = Number(o.target); const ok = v === undefined || v === '' || isNaN(t) ? null : o.direction === '<=' ? Number(v) <= t : Number(v) >= t; return <td key={m} className={ok === false ? 'red' : ''}>{v ?? ''}</td>; })}
              <td>{statusChip(o.status)}</td>
            </tr>))}</tbody>
        </table>
        {!d.objectives.length && <div className="empty">No objectives for {year}.</div>}
        <div className="split" style={{ marginTop: 24 }}>
          {[['QAQC_MANAGER', 'QA/QC Manager'], ['GM', 'General Manager']].map(([role, label]) => {
            const s = signed.find((x: any) => x.role === role);
            return (
              <div key={role} className="card">
                <div className="muted small">{label}</div>
                {s ? <><div style={{ fontSize: 16, fontWeight: 600, marginTop: 6 }}>{s.name}</div><div className="small">Signed electronically {s.signed_at} UTC{s.comment ? ` · ${s.comment}` : ''}</div>
                  {(s.user_id === user?.id || can('admin', 'edit')) && <button className="sm no-print" style={{ marginTop: 6 }} onClick={async () => { await api.del(`/api/objectives/${year}/signoff/${s.id}`); load(); }}>Withdraw</button>}</>
                  : <><div className="muted" style={{ marginTop: 6 }}>Not signed</div>{can('plans', 'approve') && <button className="sm primary no-print" style={{ marginTop: 6 }} onClick={() => setSign(role)}>Sign as {label}</button>}</>}
              </div>
            );
          })}
        </div>
        <div className="no-print" style={{ marginTop: 12 }}>
          <div className="small muted">Wet-ink signed copy:</div>
          {(d.signoffs || []).filter((s: any) => s.role === 'SIGNED_COPY').map((s: any) => <div key={s.id}><a href={fileUrl(s.r2_key)} target="_blank">{s.name}</a> <span className="muted small">{s.signed_at}</span></div>)}
          {can('plans', 'edit') && <input type="file" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const fd = new FormData(); fd.append('file', f); await api.form(`/api/objectives/${year}/signed-copy`, fd); toast('Signed copy uploaded.'); load(); }} />}
        </div>
      </div>
      {edit && <ObjectiveEditor o={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      {sign && (
        <Modal title="Sign the objectives report" onClose={() => setSign(null)} footer={<><button onClick={() => setSign(null)}>Cancel</button><button className="primary" onClick={async () => { try { await api.post(`/api/objectives/${year}/signoff`, { role: sign, comment }); toast('Signed.'); setSign(null); load(); } catch (e: any) { toast(e.message, 'err'); } }}>Sign as {user?.name}</button></>}>
          <p>You are signing the {year} Quality Objectives report as <b>{sign === 'GM' ? 'General Manager' : 'QA/QC Manager'}</b> under your own login ({user?.email}). The sign-off is recorded with date and time and locks the objectives against editing.</p>
          <label className="f">Comment (optional)<input value={comment} onChange={(e) => setComment(e.target.value)} /></label>
        </Modal>
      )}
    </div>
  );
}

function ObjectiveEditor({ o, onClose, onSaved }: { o: any; onClose: () => void; onSaved: () => void }) {
  const { toast, can } = useApp();
  const [v, setV] = useState<any>({ ...o, monthly: { ...(o.monthly || {}) } });
  const save = async () => {
    if (!v.objective) return toast('Objective text is required.', 'err');
    try { v.id ? await api.put(`/api/objectives/${v.id}`, v) : await api.post('/api/objectives', v); onSaved(); } catch (e: any) { toast(e.message, 'err'); }
  };
  return (
    <Drawer title={v.id ? `Objective ${v.ref || ''}` : 'New objective'} onClose={onClose} footer={<>{v.id && can('plans', 'delete') && <button className="danger" onClick={async () => { await api.del(`/api/objectives/${v.id}`); onSaved(); }}>Delete</button>}<span style={{ flex: 1 }} /><button onClick={onClose}>Cancel</button><button className="primary" onClick={save}>Save</button></>}>
      <div className="form-grid">
        <label className="f">Ref<input value={v.ref || ''} onChange={(e) => setV({ ...v, ref: e.target.value })} /></label>
        <label className="f full">Objective<textarea value={v.objective || ''} onChange={(e) => setV({ ...v, objective: e.target.value })} /></label>
        <label className="f">KPI<input value={v.kpi || ''} onChange={(e) => setV({ ...v, kpi: e.target.value })} /></label>
        <label className="f">Direction<select value={v.direction} onChange={(e) => setV({ ...v, direction: e.target.value })}><option>&gt;=</option><option>&lt;=</option></select></label>
        <label className="f">Target<input value={v.target || ''} onChange={(e) => setV({ ...v, target: e.target.value })} /></label>
        <label className="f">Unit<input value={v.unit || ''} placeholder="%" onChange={(e) => setV({ ...v, unit: e.target.value })} /></label>
        <label className="f">Frequency<input value={v.frequency || ''} placeholder="Monthly" onChange={(e) => setV({ ...v, frequency: e.target.value })} /></label>
        <label className="f">Owner<input value={v.owner || ''} onChange={(e) => setV({ ...v, owner: e.target.value })} /></label>
        <label className="f">Department<input value={v.department || ''} onChange={(e) => setV({ ...v, department: e.target.value })} /></label>
        <label className="f">Auto metric<select value={v.metric || ''} onChange={(e) => setV({ ...v, metric: e.target.value })}>{Object.entries(METRICS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="f">Status<select value={v.status || ''} onChange={(e) => setV({ ...v, status: e.target.value })}><option value="" /><option>On track</option><option>At risk</option><option>Achieved</option><option>Not achieved</option></select></label>
        <label className="f full">Remarks<textarea value={v.remarks || ''} onChange={(e) => setV({ ...v, remarks: e.target.value })} /></label>
      </div>
      <h3 style={{ marginTop: 12 }}>Monthly actuals</h3>
      <div className="form-grid">{MONTHS.map((m) => <label key={m} className="f">{m}<input value={v.monthly[m] ?? ''} onChange={(e) => setV({ ...v, monthly: { ...v.monthly, [m]: e.target.value } })} /></label>)}</div>
    </Drawer>
  );
}

function PlanDocs() {
  const { can, toast } = useApp();
  const nav = useNavigate();
  const [rows, setRows] = useState<any[] | null>(null);
  const [add, setAdd] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);
  const load = () => api.get('/api/plans').then(setRows);
  useEffect(() => { load(); }, []);
  const save = async () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(add)) if (v) fd.append(k, String(v));
    if (file) fd.append('file', file);
    try { await api.form('/api/plans', fd); setAdd(null); setFile(null); load(); } catch (e: any) { toast(e.message, 'err'); }
  };
  const y = new Date().getFullYear();
  return (
    <div>
      <div className="cards" style={{ marginBottom: 14 }}>
        <div className="card"><h3>Audit plan {y}</h3><div className="muted small">Live from the Audit Plan Register; audit notifications update plan dates automatically.</div><button style={{ marginTop: 8 }} onClick={() => nav(`/r/AUD?year=${y}`)}>Open audit plan</button></div>
        <div className="card"><h3>Training plan {y}</h3><div className="muted small">Live from the Training Register (planned vs conducted).</div><button style={{ marginTop: 8 }} onClick={() => nav(`/r/TRN?year=${y}`)}>Open training plan</button></div>
        <div className="card"><h3>Quality plans</h3><div className="muted small">Project quality plans (PQP) and the QMS quality plan, controlled below.</div>{can('plans', 'create') && <button style={{ marginTop: 8 }} className="primary" onClick={() => setAdd({ type: 'Quality Plan', year: y, status: 'Approved' })}>+ Add plan document</button>}</div>
      </div>
      {!rows ? <Spinner /> : (
        <table className="plain"><thead><tr><th>Type</th><th>Year</th><th>Title</th><th>WON</th><th>Doc No.</th><th>Rev</th><th>Status</th><th>File</th><th /></tr></thead><tbody>
          {rows.map((p) => <tr key={p.id}><td>{p.type}</td><td>{p.year}</td><td>{p.title}</td><td>{p.won && <a href={`/wo/${p.won}`}>{p.won}</a>}</td><td>{p.doc_no}</td><td>{p.rev}</td><td>{statusChip(p.status)}</td>
            <td>{p.r2_key && <a href={fileUrl(p.r2_key)} target="_blank">{p.filename}</a>}</td><td>{can('plans', 'delete') && <button className="sm danger" onClick={async () => { await api.del(`/api/plans/${p.id}`); load(); }}>Remove</button>}</td></tr>)}
        </tbody></table>
      )}
      {add && (
        <Drawer title="Add plan document" onClose={() => setAdd(null)} footer={<><button onClick={() => setAdd(null)}>Cancel</button><button className="primary" onClick={save}>Save</button></>}>
          <div className="form-grid">
            <label className="f">Type<select value={add.type} onChange={(e) => setAdd({ ...add, type: e.target.value })}><option>Quality Plan</option><option>Project Quality Plan (PQP)</option><option>Training Plan</option><option>Audit Plan</option><option>Inspection &amp; Test Plan</option></select></label>
            <label className="f">Year<input type="number" value={add.year} onChange={(e) => setAdd({ ...add, year: e.target.value })} /></label>
            <label className="f full">Title<input value={add.title || ''} onChange={(e) => setAdd({ ...add, title: e.target.value })} /></label>
            <label className="f">WON<input value={add.won || ''} onChange={(e) => setAdd({ ...add, won: e.target.value })} /></label>
            <label className="f">Doc No.<input value={add.doc_no || ''} onChange={(e) => setAdd({ ...add, doc_no: e.target.value })} /></label>
            <label className="f">Rev<input value={add.rev || ''} onChange={(e) => setAdd({ ...add, rev: e.target.value })} /></label>
            <label className="f">Status<select value={add.status} onChange={(e) => setAdd({ ...add, status: e.target.value })}><option>Draft</option><option>Submitted</option><option>Approved</option><option>Superseded</option></select></label>
            <label className="f full">File<input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
          </div>
        </Drawer>
      )}
    </div>
  );
}

export { pct, fmtDate };
