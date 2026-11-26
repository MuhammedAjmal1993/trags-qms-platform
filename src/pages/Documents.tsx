import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, fileUrl } from '../api';
import { useApp } from '../ctx';
import { Drawer, FileDrop, Spinner, statusChip, PageSkeleton } from '../components/ui';
import { fmtDate } from '../../shared/logic';
import { exportTable } from '../lib/excel';

export const LEVELS: Record<number, string> = {
  1: 'Level 1 · Policy, Quality Manual & Certificates', 2: 'Level 2 · Procedures (QSP)', 3: 'Level 3 · Work Instructions & Guidelines', 4: 'Level 4 · Formats & Records',
};
const CATEGORIES = ['Quality Manual', 'Policy', 'ISO Certificate', 'Quality Certificate', 'ASME Certificate', 'Procedure', 'Work Instruction', 'Guideline', 'Format', 'Plan', 'Manual', 'Quality Memo', 'Client Presentation', 'Capability Statement', 'ASME Structure', 'Other'];

export default function Documents() {
  const { can, toast } = useApp();
  const [docs, setDocs] = useState<any[] | null>(null);
  const [sp] = useSearchParams();
  const [tab, setTab] = useState<string>(sp.get('tab') || '1');
  useEffect(() => { if (sp.get('tab')) setTab(sp.get('tab')!); }, [sp]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<any>(null);
  const [newDoc, setNewDoc] = useState(false);
  const load = () => api.get('/api/documents').then(setDocs);
  useEffect(() => { load(); }, []);
  const view = useMemo(() => (docs || []).filter((d) => (tab === 'cert' ? /certificate/i.test(d.category) : String(d.level) === tab && !/certificate/i.test(d.category)) && (!q || JSON.stringify(d).toLowerCase().includes(q.toLowerCase()))), [docs, tab, q]);
  const soon = (d: any) => d.expiry_date && d.expiry_date < new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

  if (!docs) return <PageSkeleton />;
  return (
    <div>
      <div className="page-head">
        <div><h1>QMS Document Library</h1><div className="muted small">Controlled copies with revision history. The current revision is the one shown; superseded revisions stay in the history.</div></div>
        <div className="row">
          {can('documents', 'create') && <button className="primary" onClick={() => setNewDoc(true)}>+ Add document(s)</button>}
          <button onClick={() => exportTable('Master List', ['Level', 'Doc No', 'Title', 'Category', 'Entity', 'Issue', 'Current Rev', 'Rev Date', 'Expiry', 'Status', 'Owner'], docs.map((d) => [d.level, d.doc_no, d.title, d.category, d.entity, d.issue_no, d.rev, d.rev_date, d.expiry_date, d.status, d.owner]), 'TRAGS QMS Master Document List.xlsx')}>Master list (Excel)</button>
        </div>
      </div>
      <div className="tabs">
        {[1, 2, 3, 4].map((l) => <button key={l} className={tab === String(l) ? 'on' : ''} onClick={() => setTab(String(l))}>{LEVELS[l]} ({docs.filter((d) => d.level === l && !/certificate/i.test(d.category)).length})</button>)}
        <button className={tab === 'cert' ? 'on' : ''} onClick={() => setTab('cert')}>ISO &amp; Quality Certificates ({docs.filter((d) => /certificate/i.test(d.category)).length})</button>
      </div>
      <input style={{ width: 300, marginBottom: 10 }} placeholder="Search documents" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="grid-wrap">
        <table className="grid"><thead><tr><th>Doc No.</th><th>Title</th><th>Category</th><th>Entity</th><th>Issue</th><th>Current Rev</th><th>Rev Date</th>{tab === 'cert' && <th>Expiry</th>}<th>Revisions</th><th>Status</th><th>File</th></tr></thead>
          <tbody>{view.map((d) => (
            <tr key={d.id} onClick={() => setOpen(d)}>
              <td><b>{d.doc_no}</b></td><td>{d.title}</td><td>{d.category}</td><td>{d.entity}</td><td>{d.issue_no}</td><td>{d.rev}</td><td>{fmtDate(d.rev_date)}</td>
              {tab === 'cert' && <td className={soon(d) ? 'flag' : ''}>{fmtDate(d.expiry_date)}</td>}
              <td className="num">{d.revisions}</td><td>{statusChip(d.status)}</td>
              <td>{d.r2_key && <a href={fileUrl(d.r2_key)} target="_blank" onClick={(e) => e.stopPropagation()}>View</a>}</td>
            </tr>))}</tbody></table>
        {!view.length && <div className="empty">No documents in this level yet.</div>}
      </div>
      {open && <DocDrawer id={open.id} onClose={() => { setOpen(null); load(); }} />}
      {newDoc && <NewDocs level={tab === 'cert' ? 1 : Number(tab)} cert={tab === 'cert'} onClose={() => { setNewDoc(false); load(); }} />}
    </div>
  );
}

function NewDocs({ level, cert, onClose }: { level: number; cert: boolean; onClose: () => void }) {
  const { toast } = useApp();
  const [files, setFiles] = useState<File[]>([]);
  const [meta, setMeta] = useState<any>({ level, category: cert ? 'ISO Certificate' : level === 2 ? 'Procedure' : level === 4 ? 'Format' : level === 3 ? 'Work Instruction' : 'Policy', rev: '0', entity: 'TRAGS' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    let n = 0;
    for (const f of files) {
      const fd = new FormData();
      const base = f.name.replace(/\.[^.]+$/, '');
      const no = base.match(/^(QSP[.\-\s]?\d+|QM[-\s]?\d+|F[-\s]?\d+|Format\s*\d+|WI[-\s.]?\d+|GL[.\-\s]?\d+|WP[.\-\s]?\d+)/i)?.[0];
      fd.append('title', files.length === 1 && meta.title ? meta.title : base);
      if (files.length === 1 && meta.doc_no) fd.append('doc_no', meta.doc_no); else if (no) fd.append('doc_no', no.toUpperCase().replace(/\s+/g, ''));
      for (const k of ['level', 'category', 'entity', 'issue_no', 'rev', 'rev_date', 'expiry_date', 'owner']) if (meta[k]) fd.append(k, meta[k]);
      fd.append('file', f);
      try { await api.form('/api/documents', fd); n++; } catch (e: any) { toast(`${f.name}: ${e.message}`, 'err'); }
    }
    setBusy(false);
    toast(`${n} document(s) added.`);
    onClose();
  };
  return (
    <Drawer title="Add documents" onClose={onClose} footer={<><button onClick={onClose}>Cancel</button><button className="primary" disabled={!files.length || busy} onClick={save}>{busy ? 'Uploading…' : `Add ${files.length} document(s)`}</button></>}>
      <FileDrop capture={false} onFiles={(f) => setFiles([...files, ...f])} />
      {files.length > 0 && <ul>{files.map((f) => <li key={f.name}>{f.name}</li>)}</ul>}
      <div className="form-grid" style={{ marginTop: 12 }}>
        {files.length <= 1 && <><label className="f">Doc No.<input value={meta.doc_no || ''} onChange={(e) => setMeta({ ...meta, doc_no: e.target.value })} /></label>
          <label className="f full">Title<input value={meta.title || ''} placeholder="Defaults to file name" onChange={(e) => setMeta({ ...meta, title: e.target.value })} /></label></>}
        <label className="f">Level<select value={meta.level} onChange={(e) => setMeta({ ...meta, level: Number(e.target.value) })}>{[1, 2, 3, 4].map((l) => <option key={l} value={l}>{LEVELS[l]}</option>)}</select></label>
        <label className="f">Category<select value={meta.category} onChange={(e) => setMeta({ ...meta, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="f">Entity<select value={meta.entity} onChange={(e) => setMeta({ ...meta, entity: e.target.value })}><option>TRAGS</option><option>Qatar Factory for Gas and Petroleum Equipment</option><option>TRAGS Security Services</option></select></label>
        <label className="f">Issue No.<input value={meta.issue_no || ''} onChange={(e) => setMeta({ ...meta, issue_no: e.target.value })} /></label>
        <label className="f">Revision<input value={meta.rev || ''} onChange={(e) => setMeta({ ...meta, rev: e.target.value })} /></label>
        <label className="f">Revision date<input type="date" value={meta.rev_date || ''} onChange={(e) => setMeta({ ...meta, rev_date: e.target.value })} /></label>
        {/certificate/i.test(meta.category) && <label className="f">Expiry date<input type="date" value={meta.expiry_date || ''} onChange={(e) => setMeta({ ...meta, expiry_date: e.target.value })} /></label>}
        <label className="f">Owner<input value={meta.owner || ''} onChange={(e) => setMeta({ ...meta, owner: e.target.value })} /></label>
      </div>
    </Drawer>
  );
}

function DocDrawer({ id, onClose }: { id: number; onClose: () => void }) {
  const { can, toast } = useApp();
  const [d, setD] = useState<any>(null);
  const [edit, setEdit] = useState<any>(null);
  const [rev, setRev] = useState<any>({});
  const [file, setFile] = useState<File | null>(null);
  const load = () => api.get(`/api/documents/${id}`).then((x) => { setD(x); setEdit(x); });
  useEffect(() => { load(); }, [id]);
  if (!d) return <Drawer title="Loading…" onClose={onClose}><Spinner /></Drawer>;
  const saveMeta = async () => { try { await api.put(`/api/documents/${id}`, edit); toast('Saved.'); load(); } catch (e: any) { toast(e.message, 'err'); } };
  const upload = async () => {
    if (!file || !rev.rev) return toast('Select the file and enter the revision number.', 'err');
    const fd = new FormData();
    fd.append('file', file);
    for (const k of ['rev', 'rev_date', 'change_summary', 'issue_no', 'expiry_date']) if (rev[k]) fd.append(k, rev[k]);
    try { await api.form(`/api/documents/${id}/revisions`, fd); toast(`Revision ${rev.rev} uploaded and set as current.`); setRev({}); setFile(null); load(); } catch (e: any) { toast(e.message, 'err'); }
  };
  return (
    <Drawer wide title={`${d.doc_no || ''} ${d.title}`} onClose={onClose} footer={<><button onClick={onClose}>Close</button>{can('documents', 'edit') && <button className="primary" onClick={saveMeta}>Save details</button>}</>}>
      <div className="form-grid">
        {[['doc_no', 'Doc No.'], ['title', 'Title'], ['issue_no', 'Issue No.'], ['owner', 'Owner'], ['entity', 'Entity']].map(([k, l]) => <label key={k} className={`f ${k === 'title' ? 'full' : ''}`}>{l}<input value={edit[k] || ''} disabled={!can('documents', 'edit')} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} /></label>)}
        <label className="f">Level<select value={edit.level} disabled={!can('documents', 'edit')} onChange={(e) => setEdit({ ...edit, level: Number(e.target.value) })}>{[1, 2, 3, 4].map((l) => <option key={l} value={l}>{LEVELS[l]}</option>)}</select></label>
        <label className="f">Category<select value={edit.category} disabled={!can('documents', 'edit')} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="f">Status<select value={edit.status} disabled={!can('documents', 'edit')} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option>Current</option><option>Under Revision</option><option>Withdrawn</option><option>Obsolete</option></select></label>
        <label className="f">Expiry date<input type="date" value={edit.expiry_date || ''} disabled={!can('documents', 'edit')} onChange={(e) => setEdit({ ...edit, expiry_date: e.target.value })} /></label>
        <label className="f">Review date<input type="date" value={edit.review_date || ''} disabled={!can('documents', 'edit')} onChange={(e) => setEdit({ ...edit, review_date: e.target.value })} /></label>
      </div>
      <h2 style={{ marginTop: 18 }}>Revision history</h2>
      <table className="plain"><thead><tr><th>Rev</th><th>Rev date</th><th>Change summary</th><th>File</th><th>Uploaded</th><th /></tr></thead><tbody>
        {d.revisions.map((r: any) => (
          <tr key={r.id}><td><b>{r.rev}</b> {r.is_current ? <span className="chip closed">Current</span> : <span className="chip">Superseded</span>}</td><td>{fmtDate(r.rev_date)}</td><td>{r.change_summary}</td>
            <td>{r.r2_key && <a href={fileUrl(r.r2_key)} target="_blank">{r.filename}</a>}</td><td className="small">{r.uploaded_by_name} · {r.uploaded_at}</td>
            <td>{!r.is_current && can('documents', 'approve') && <button className="sm" onClick={async () => { await api.post(`/api/documents/${id}/revisions/${r.id}/current`); load(); }}>Set current</button>}</td></tr>))}
      </tbody></table>
      {can('documents', 'edit') && (
        <div className="card" style={{ marginTop: 14 }}>
          <h3>Upload new revision</h3>
          <div className="form-grid">
            <label className="f">File<input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
            <label className="f">Revision No. *<input value={rev.rev || ''} onChange={(e) => setRev({ ...rev, rev: e.target.value })} /></label>
            <label className="f">Revision date<input type="date" value={rev.rev_date || ''} onChange={(e) => setRev({ ...rev, rev_date: e.target.value })} /></label>
            <label className="f">Issue No.<input value={rev.issue_no || ''} onChange={(e) => setRev({ ...rev, issue_no: e.target.value })} /></label>
            <label className="f full">Summary of change<textarea value={rev.change_summary || ''} onChange={(e) => setRev({ ...rev, change_summary: e.target.value })} /></label>
          </div>
          <button className="primary" style={{ marginTop: 8 }} onClick={upload}>Upload revision</button>
        </div>
      )}
    </Drawer>
  );
}
