import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { api, fileUrl, qs } from '../api';
import { useApp } from '../ctx';
import type { RegisterConfig } from '../../shared/registers';
import { MODULE_OF_REGISTER } from '../../shared/registers';
import { Grid, type Row } from '../components/Grid';
import { RecordForm, missingRequired } from '../components/RecordForm';
import { Drawer, Spinner, Confirm, Modal } from '../components/ui';
import { exportRegister } from '../lib/excel';
import { fillPdfForm, printFindingForm, F271_DEFAULT_MAP } from '../lib/forms';

export default function RegisterPage() {
  const { code = '' } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { can, toast, refreshRegisters } = useApp();
  const module = MODULE_OF_REGISTER[code] || 'findings';
  const [cfg, setCfg] = useState<RegisterConfig | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(sp.get('q') || '');
  const [year, setYear] = useState(sp.get('year') || '');
  const [won, setWon] = useState(sp.get('won') || '');
  const [open, setOpen] = useState<Row | 'new' | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [showCols, setShowCols] = useState(false);
  const [wos, setWos] = useState<any[]>([]);
  const [binOpen, setBinOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const c: RegisterConfig = await api.get(`/api/registers/${code}`);
      setCfg(c);
      const saved = localStorage.getItem(`cols:${code}`);
      setHidden(new Set(saved ? JSON.parse(saved) : c.columns.filter((x) => x.hidden).map((x) => x.key)));
      const r = await api.get(`/api/records/${code}${qs({ year, won })}`);
      setRows(r.rows);
    } catch (e: any) { toast(e.message, 'err'); } finally { setLoading(false); }
  }, [code, year, won, toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get('/api/stats/filters').then((f) => setWos(f.workorders)).catch(() => {}); }, []);
  useEffect(() => { const id = sp.get('id'); if (id && rows.length) { const r = rows.find((x) => String(x.id) === id); if (r) setOpen(r); } }, [rows, sp]);

  const years = useMemo(() => {
    const ys = new Set<string>();
    if (cfg) for (const r of rows) for (const c of cfg.columns) if (c.type === 'date' && typeof r.data[c.key] === 'string') { const y = r.data[c.key].slice(0, 4); if (/^\d{4}$/.test(y)) ys.add(y); }
    return [...ys].sort().reverse();
  }, [rows, cfg]);

  const toggleCol = (k: string) => {
    const n = new Set(hidden);
    n.has(k) ? n.delete(k) : n.add(k);
    setHidden(n);
    localStorage.setItem(`cols:${code}`, JSON.stringify([...n]));
  };

  if (!cfg) return loading ? <Spinner /> : <div className="empty">Register not found.</div>;
  return (
    <div>
      <div className="page-head">
        <div><h1>{cfg.name}</h1><div className="muted small">Key: {cfg.keyFields.join(' + ')} · exact match duplicates highlighted · red = review required</div></div>
        <div className="row">
          {can(module, 'create') && <button className="primary" onClick={() => setOpen('new')}>+ New record</button>}
          {can('ingest', 'create') && <button onClick={() => nav(`/ingest?target=${code}`)}>Import / upload</button>}
          {can(module, 'export') && <button onClick={() => exportRegister(cfg, rows)}>Export Excel</button>}
          <button onClick={() => setShowCols(true)}>Columns</button>
          {can(module, 'delete') && <button onClick={() => setBinOpen(true)}>Deleted</button>}
          {code === 'AUD' && can(module, 'edit') && <button title="Recount NCR/OBS/OFI per audit from the Finding Register" onClick={async () => { const r = await api.post('/api/records/FND/resync'); toast(`Finding Register check run on ${r.processed} findings.`); load(); }}>Finding Register check</button>}
        </div>
      </div>
      <div className="row" style={{ marginBottom: 10 }}>
        <input style={{ width: 280 }} placeholder="Search all columns" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={year} onChange={(e) => setYear(e.target.value)}><option value="">All years</option>{years.map((y) => <option key={y}>{y}</option>)}</select>
        <input style={{ width: 120 }} placeholder="WON" value={won} onChange={(e) => setWon(e.target.value.trim())} />
        {loading && <Spinner />}
      </div>
      <Grid cfg={cfg} rows={rows} hidden={hidden} globalQ={q} onOpen={(r) => setOpen(r)} />

      {open && <RecordDrawer cfg={cfg} row={open === 'new' ? null : open} wos={wos} onClose={() => setOpen(null)}
        onSaved={() => { setOpen(null); load(); refreshRegisters(); }} />}
      {showCols && (
        <Modal title="Visible columns" onClose={() => setShowCols(false)}>
          <div className="form-grid">{cfg.columns.map((c) => <label key={c.key} className="row"><input type="checkbox" checked={!hidden.has(c.key)} onChange={() => toggleCol(c.key)} /> {c.label}</label>)}</div>
        </Modal>
      )}
      {binOpen && <DeletedBin cfg={cfg} onClose={() => setBinOpen(false)} onRestored={load} />}
    </div>
  );
}

function RecordDrawer({ cfg, row, wos, onClose, onSaved }: { cfg: RegisterConfig; row: Row | null; wos: any[]; onClose: () => void; onSaved: () => void }) {
  const { can, toast } = useApp();
  const module = MODULE_OF_REGISTER[cfg.code];
  const [val, setVal] = useState<Record<string, any>>(row ? { ...row.data } : defaults(cfg));
  const [detail, setDetail] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [tab, setTab] = useState<'form' | 'history' | 'files'>('form');
  const editable = row ? can(module, 'edit') : can(module, 'create');

  const loadDetail = useCallback(() => { if (row) api.get(`/api/item/${row.id}`).then(setDetail).catch(() => {}); }, [row]);
  useEffect(() => { loadDetail(); }, [loadDetail]);

  const save = async () => {
    const miss = missingRequired(cfg, val);
    if (miss.length) return toast(`Required: ${miss.join(', ')}`, 'err');
    setBusy(true);
    try {
      if (row) await api.put(`/api/item/${row.id}`, { data: val });
      else await api.post(`/api/records/${cfg.code}`, { data: val });
      toast(row ? 'Record updated.' : 'Record created.');
      onSaved();
    } catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const del = async () => {
    try { await api.del(`/api/item/${row!.id}`); toast('Record deleted (restorable from Deleted).'); onSaved(); } catch (e: any) { toast(e.message, 'err'); }
  };
  const attach = async (f: File) => {
    const fd = new FormData(); fd.append('file', f);
    try { await api.form(`/api/item/${row!.id}/attachments`, fd); toast('Attachment uploaded.'); loadDetail(); } catch (e: any) { toast(e.message, 'err'); }
  };
  const genForm = async (code: 'F271' | 'NCR') => {
    const tpls = await api.get('/api/templates');
    const t = tpls.find((x: any) => x.code === code);
    const name = `${code === 'F271' ? 'F271 OBS' : 'NCR'} ${val.finding_no || val.uid || ''}`.trim() + '.pdf';
    if (t?.r2_key) {
      const map = Array.isArray(t.field_map) && t.field_map.length ? t.field_map : code === 'F271' ? F271_DEFAULT_MAP : [];
      if (!map.length) return toast('NCR template has no field map yet. Set it in Admin → Form templates.', 'err');
      const w = await fillPdfForm(t.r2_key, map, val, name);
      toast(w.length ? `Form generated with warnings: ${w.join(' ')}` : 'Form generated.', w.length ? 'err' : 'ok');
    } else {
      printFindingForm(code === 'NCR' ? 'NCR' : 'OBS', val);
      toast('Controlled template not uploaded yet; TRAGS print layout opened.');
    }
  };

  const flagsCount = Object.keys(val._flags || {}).length;
  return (
    <Drawer wide title={row ? `${cfg.name.replace(/^\d+\s/, '')} · ${val.uid || val[cfg.keyFields[0]] || '#' + row.id}` : `New ${cfg.name.replace(/^\d+\s/, '')} record`} onClose={onClose}
      footer={<>
        {row && can(module, 'delete') && <button className="danger" onClick={() => setConfirmDel(true)}>Delete</button>}
        <span style={{ flex: 1 }} />
        {cfg.code === 'FND' && <><button onClick={() => genForm('F271')}>Observation form (F271)</button><button onClick={() => genForm('NCR')}>NCR form</button></>}
        <button onClick={onClose}>Close</button>
        {editable && <button className="primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>}
      </>}>
      {flagsCount > 0 && <div className="card" style={{ borderColor: '#f3c0c0', background: '#fff7f7', marginBottom: 10 }}><b className="red">{flagsCount} field(s) need review.</b> <span className="small">Red fields were inferred or conflict with another register. Editing a field clears its flag.</span></div>}
      {row && <div className="tabs"><button className={tab === 'form' ? 'on' : ''} onClick={() => setTab('form')}>Record</button><button className={tab === 'files' ? 'on' : ''} onClick={() => setTab('files')}>Attachments {detail?.attachments?.length ? `(${detail.attachments.length})` : ''}</button><button className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>History</button></div>}
      {tab === 'form' && <>
        <RecordForm cfg={cfg} value={val} onChange={setVal} readOnly={!editable} workorders={wos} />
        {cfg.code !== 'WLD' && val.won && <div style={{ marginTop: 12 }}><a href={`/wo/${val.won}`}>Open work order {val.won} drill-down →</a></div>}
      </>}
      {tab === 'files' && detail && (
        <div className="col">
          {editable && <input type="file" onChange={(e) => e.target.files?.[0] && attach(e.target.files[0])} />}
          <table className="plain"><thead><tr><th>File</th><th>Size</th><th>Uploaded</th></tr></thead><tbody>
            {detail.attachments.map((a: any) => <tr key={a.id}><td><a href={fileUrl(a.r2_key)} target="_blank">{a.filename}</a></td><td>{Math.round(a.size / 1024)} KB</td><td>{a.uploaded_at}</td></tr>)}
          </tbody></table>
          {!detail.attachments.length && <div className="muted">No attachments.</div>}
        </div>
      )}
      {tab === 'history' && detail && (
        <div className="hist">
          {detail.history.map((h: any) => (
            <div key={h.id}><b>{h.action}</b> · {h.user_name || 'system'} · <span className="muted">{h.at} UTC</span>
              {h.changes && h.action.startsWith('update') && <div className="small">{Object.entries(JSON.parse(h.changes)).map(([k, v]: any) => <div key={k}><span className="muted">{cfg.columns.find((c) => c.key === k)?.label || k}:</span> {String(v[0] ?? '∅').slice(0, 120)} → <b>{String(v[1] ?? '∅').slice(0, 120)}</b></div>)}</div>}
            </div>
          ))}
        </div>
      )}
      {confirmDel && <Confirm danger yes="Delete" text="Delete this record? It moves to the Deleted list and can be restored." onNo={() => setConfirmDel(false)} onYes={del} />}
    </Drawer>
  );
}

function defaults(cfg: RegisterConfig): Record<string, any> {
  const d: Record<string, any> = {};
  if (cfg.code === 'FND') Object.assign(d, { status: 'Open', nature: 'NEGETIVE' });
  if (cfg.code === 'AUD') Object.assign(d, { status: 'Planned' });
  if (cfg.code === 'TRN') Object.assign(d, { ext_int: 'INTERNAL' });
  return d;
}

function DeletedBin({ cfg, onClose, onRestored }: { cfg: RegisterConfig; onClose: () => void; onRestored: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const { toast } = useApp();
  const load = () => api.get(`/api/deleted/${cfg.code}`).then(setRows);
  useEffect(() => { load(); }, []);
  return (
    <Drawer title={`Deleted records · ${cfg.name}`} onClose={onClose}>
      <table className="plain"><thead><tr><th>Key</th><th>Deleted</th><th /></tr></thead><tbody>
        {rows.map((r) => <tr key={r.id}><td>{cfg.keyFields.map((k) => r.data[k]).filter(Boolean).join(' / ') || r.data.uid || r.id}</td><td>{r.updated_at}</td>
          <td><button className="sm" onClick={async () => { await api.post(`/api/item/${r.id}/restore`); toast('Restored.'); load(); onRestored(); }}>Restore</button></td></tr>)}
      </tbody></table>
      {!rows.length && <div className="empty">Nothing deleted.</div>}
    </Drawer>
  );
}
