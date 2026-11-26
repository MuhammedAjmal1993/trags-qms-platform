import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, fileUrl } from '../api';
import { useApp } from '../ctx';
import { Spinner, Drawer, statusChip, FileDrop } from '../components/ui';
import { snapshot, exportChartsToPptx, ChartCard, BarChart, DonutChart } from '../components/Charts';
import { HUBS } from '../nav';
import { fmtDate } from '../../shared/logic';
import { compressImage } from '../lib/images';

// ---------- Hub overview ----------
export function Hub() {
  const { hub = '' } = useParams();
  const h = HUBS[hub];
  const { registers } = useApp();
  const nav = useNavigate();
  const [c, setC] = useState<any[]>([]);
  useEffect(() => { api.get('/api/stats/hubcounts').then(setC).catch(() => {}); }, []);
  if (!h) return <div className="empty">Unknown hub.</div>;
  const cm = Object.fromEntries(c.map((x) => [x.register, x]));
  return (
    <div>
      <div className="page-head"><div><h1>{h.title}</h1><div className="muted small">{h.text}</div></div><div className="row">{h.links.map((l) => <button key={l.to} onClick={() => nav(l.to)}>{l.label}</button>)}</div></div>
      <div className="cards">
        {h.registers.map((code) => {
          const r = registers.find((x) => x.code === code);
          if (!r) return null;
          const s = cm[code] || {};
          return (
            <div key={code} className="card hubcard" onClick={() => nav(code === 'TLB' ? '/library' : `/r/${code}`)}>
              <h3>{r.name.replace(/^\d+\s/, '')}</h3>
              <div className="row" style={{ gap: 18, marginTop: 6 }}>
                <div><div className="big">{s.total ?? 0}</div><div className="muted small">records</div></div>
                <div><div className="big">{s.open ?? 0}</div><div className="muted small">open / active</div></div>
                <div><div className={`big ${s.overdue ? 'red' : ''}`}>{s.overdue ?? 0}</div><div className="muted small">overdue</div></div>
              </div>
              <div className="muted small" style={{ marginTop: 6 }}>Last update {s.last ? s.last.slice(0, 16) : '–'} UTC</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Disposition & RCA tracker ----------
const STAGES = [
  { k: 'await', l: 'Awaiting disposition', hint: 'Open, no root cause or corrective action yet' },
  { k: 'disp', l: 'Disposition received', hint: 'Root cause / CA proposed, approval pending' },
  { k: 'impl', l: 'CA approved · implementing', hint: 'Approved, close-out pending' },
  { k: 'eff', l: 'Closed · effectiveness pending', hint: 'Closed, effectiveness check not recorded' },
  { k: 'done', l: 'Verified effective', hint: 'Closed and effective' },
];
function stageOf(d: any): string {
  const closed = /^(closed|cancelled)$/i.test(d.status || '');
  if (closed) return /^effective$/i.test(d.effectiveness_result || '') ? 'done' : 'eff';
  if (d.ca_approval_date) return 'impl';
  if ((d.root_cause || '').trim() || (d.corrective_action || '').trim()) return 'disp';
  return 'await';
}
const age = (iso?: string) => (iso ? Math.floor((Date.now() - new Date(iso + 'T00:00:00Z').getTime()) / 86400000) : null);

export function Disposition() {
  const nav = useNavigate();
  const [rows, setRows] = useState<any[] | null>(null);
  const [f, setF] = useState({ type: '', client: '', q: '', year: String(new Date().getFullYear()) });
  useEffect(() => { api.get('/api/records/FND').then((d) => setRows(d.rows)); }, []);
  const view = useMemo(() => (rows || []).filter((r) => {
    const d = r.data;
    if (f.type && String(d.finding_type).toUpperCase() !== f.type) return false;
    if (f.client && d.client !== f.client) return false;
    if (f.year && !String(d.issue_date || '').startsWith(f.year) && !(stageOf(d) !== 'done' && stageOf(d) !== 'eff')) return false;
    if (f.q && !JSON.stringify(d).toLowerCase().includes(f.q.toLowerCase())) return false;
    return true;
  }), [rows, f]);
  if (!rows) return <Spinner />;
  const clients = [...new Set(rows.map((r) => r.data.client).filter(Boolean))].sort();
  const by = (k: string) => view.filter((r) => stageOf(r.data) === k);
  const closedRows = view.filter((r) => /closed/i.test(r.data.status) && r.data.issue_date && r.data.closeout_date);
  const within90 = closedRows.filter((r) => (new Date(r.data.closeout_date).getTime() - new Date(r.data.issue_date).getTime()) / 86400000 <= 90).length;
  const appr = view.filter((r) => r.data.ca_approval_date && r.data.issue_date);
  const within14 = appr.filter((r) => (new Date(r.data.ca_approval_date).getTime() - new Date(r.data.issue_date).getTime()) / 86400000 <= 14).length;
  const withRca = view.filter((r) => (r.data.root_cause || '').trim()).length;
  return (
    <div>
      <div className="page-head"><div><h1>Disposition &amp; RCA Tracker</h1><div className="muted small">Every NCR, CAR and observation from issue to verified close-out. Timelines: CA proposed within 14 days, implemented within 90 days (QSP-07 §8.4); observation root cause within 15 days (QSP-21 §8.2).</div></div></div>
      <div className="row card" style={{ padding: 10, marginBottom: 12 }}>
        <label className="f">Issued in<select value={f.year} onChange={(e) => setF({ ...f, year: e.target.value })}><option value="">All years</option>{[0, 1, 2, 3].map((i) => <option key={i}>{new Date().getFullYear() - i}</option>)}</select></label>
        <label className="f">Type<select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="">All</option><option>NCR</option><option>OBSERVATION</option><option>AFI</option></select></label>
        <label className="f">Client<select value={f.client} onChange={(e) => setF({ ...f, client: e.target.value })}><option value="">All</option>{clients.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="f">Search<input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></label>
        <span className="muted small">Open items of earlier years stay visible.</span>
      </div>
      <div className="kpis">
        <div className="kpi"><div className="l">In scope</div><div className="v">{view.length}</div></div>
        <div className="kpi amber"><div className="l">Open</div><div className="v">{view.filter((r) => !/closed|cancelled/i.test(r.data.status)).length}</div></div>
        <div className="kpi"><div className="l">Root cause recorded</div><div className="v">{view.length ? Math.round((withRca / view.length) * 100) : 0}%</div></div>
        <div className={`kpi ${appr.length && within14 / appr.length < 0.8 ? 'red' : 'green'}`}><div className="l">CA approved ≤ 14 days</div><div className="v">{appr.length ? Math.round((within14 / appr.length) * 100) + '%' : '–'}</div><div className="s">{within14}/{appr.length}</div></div>
        <div className={`kpi ${closedRows.length && within90 / closedRows.length < 0.8 ? 'red' : 'green'}`}><div className="l">Closed ≤ 90 days</div><div className="v">{closedRows.length ? Math.round((within90 / closedRows.length) * 100) + '%' : '–'}</div><div className="s">{within90}/{closedRows.length}</div></div>
      </div>
      <div className="kanban">
        {STAGES.map((s) => (
          <div key={s.k} className="kcol">
            <div className="khead"><b>{s.l}</b><span className="chip">{by(s.k).length}</span><div className="muted small">{s.hint}</div></div>
            {by(s.k).slice(0, 60).map((r) => {
              const d = r.data, a = age(d.issue_date);
              return (
                <div key={r.id} className="kcard" onClick={() => nav(`/r/FND?id=${r.id}&year=`)}>
                  <div className="row" style={{ justifyContent: 'space-between' }}><b>{d.finding_no || d.report_no || d.uid}</b><span className={`chip ${String(d.finding_type).toUpperCase() === 'NCR' ? 'red' : 'amber'}`}>{d.finding_type}</span></div>
                  <div className="small">{d.client} · {d.won}</div>
                  <div className="small muted clip">{d.description}</div>
                  <div className="row small" style={{ justifyContent: 'space-between', marginTop: 4 }}><span>{d.actionee || d.recipient || '—'}</span>{a !== null && s.k !== 'done' && s.k !== 'eff' && <span className={a > 90 ? 'red' : a > 30 ? 'amber-t' : ''}>{a} d</span>}</div>
                </div>
              );
            })}
            {by(s.k).length > 60 && <div className="muted small">+ {by(s.k).length - 60} more (use filters)</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Organization chart ----------
export function OrgChart() {
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<any[] | null>(null);
  const [site, setSite] = useState('');
  useEffect(() => { api.get('/api/records/PPL').then((d) => setRows(d.rows)); }, []);
  if (!rows) return <Spinner />;
  const active = rows.filter((r) => !/resigned|terminated|transferred/i.test(r.data.status || '') && (!site || r.data.site === site));
  const byEmp = new Map(active.map((r) => [String(r.data.emp_no), r]));
  const kids = new Map<string, any[]>();
  const roots: any[] = [];
  for (const r of active) {
    const p = String(r.data.reports_to || '');
    if (p && byEmp.has(p) && p !== String(r.data.emp_no)) (kids.get(p) || kids.set(p, []).get(p)!).push(r);
    else roots.push(r);
  }
  const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const joiners = rows.filter((r) => (r.data.join_date || '') >= since);
  const leavers = rows.filter((r) => (r.data.exit_date || '') >= since);
  const sites = [...new Set(rows.map((r) => r.data.site).filter(Boolean))].sort();
  const count = (k: string) => Object.entries(active.reduce((m: any, r) => { const v = r.data[k] || '(blank)'; m[v] = (m[v] || 0) + 1; return m; }, {})).sort((a: any, b: any) => b[1] - a[1]);
  const Node = ({ r, depth }: { r: any; depth: number }) => (
    <li>
      <div className="onode" onClick={() => nav(`/r/PPL?id=${r.id}`)}>
        <b>{r.data.name}</b><div className="small">{r.data.designation}</div><div className="muted small">{[r.data.discipline, r.data.site].filter(Boolean).join(' · ')}</div>
      </div>
      {(kids.get(String(r.data.emp_no)) || []).length > 0 && depth < 6 && <ul>{kids.get(String(r.data.emp_no))!.map((k) => <Node key={k.id} r={k} depth={depth + 1} />)}</ul>}
    </li>
  );
  return (
    <div ref={ref}>
      <div className="page-head">
        <div><h1>QA/QC Organization Chart</h1><div className="muted small">Built from the Resource List (Reports To). Updates as people join, move or leave.</div></div>
        <div className="row no-print"><select value={site} onChange={(e) => setSite(e.target.value)}><option value="">All sites</option>{sites.map((s) => <option key={s}>{s}</option>)}</select><button onClick={() => ref.current && snapshot(ref.current, 'QA-QC Organization Chart')}>Snapshot</button><button className="primary" onClick={() => nav('/r/PPL')}>Resource list</button></div>
      </div>
      <div className="kpis">
        <div className="kpi"><div className="l">Active headcount</div><div className="v">{active.length}</div></div>
        <div className="kpi green"><div className="l">Joined (90 d)</div><div className="v">{joiners.length}</div></div>
        <div className="kpi amber"><div className="l">Left (90 d)</div><div className="v">{leavers.length}</div></div>
        {count('site').slice(0, 4).map(([k, v]: any) => <div key={k} className="kpi"><div className="l">{k}</div><div className="v">{v}</div></div>)}
      </div>
      {!active.length ? <div className="empty">Add people to the QA/QC Resource List (import the inspector master list in the Upload Center) to build the chart.</div> : (
        <div className="card org"><ul className="otree">{roots.map((r) => <Node key={r.id} r={r} depth={0} />)}</ul></div>
      )}
      <div className="cards" style={{ marginTop: 12 }}>
        <ChartCard title="Headcount by designation"><BarChart horizontal labels={count('designation').map((x: any) => x[0])} series={[{ label: 'People', data: count('designation').map((x: any) => x[1]) }]} /></ChartCard>
        <ChartCard title="Headcount by discipline"><DonutChart labels={count('discipline').map((x: any) => x[0])} data={count('discipline').map((x: any) => x[1])} /></ChartCard>
      </div>
    </div>
  );
}

// ---------- Training library ----------
export function Library() {
  const { can } = useApp();
  const nav = useNavigate();
  const [rows, setRows] = useState<any[] | null>(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  useEffect(() => { api.get('/api/records/TLB').then((d) => setRows(d.rows)); }, []);
  if (!rows) return <Spinner />;
  const cats = Object.entries(rows.reduce((m: any, r) => { const c = r.data.category || 'Other'; m[c] = (m[c] || 0) + 1; return m; }, {})).sort((a: any, b: any) => b[1] - a[1]);
  const view = rows.filter((r) => (!cat || (r.data.category || 'Other') === cat) && (!q || JSON.stringify(r.data).toLowerCase().includes(q.toLowerCase())) && r.data.status !== 'Archived');
  return (
    <div>
      <div className="page-head">
        <div><h1>Training Library</h1><div className="muted small">{rows.length} training materials · searchable by title, category and keywords</div></div>
        <div className="row">{can('training', 'create') && <button className="primary" onClick={() => nav('/r/TLB?new=1')}>+ Add material</button>}<button onClick={() => nav('/r/TLB')}>Table view</button></div>
      </div>
      <input style={{ width: 'min(480px, 100%)', marginBottom: 10 }} placeholder="Search training materials" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="row" style={{ marginBottom: 12 }}>
        <button className={`sm ${!cat ? 'primary' : ''}`} onClick={() => setCat('')}>All ({rows.length})</button>
        {cats.map(([c, n]: any) => <button key={c} className={`sm ${cat === c ? 'primary' : ''}`} onClick={() => setCat(c)}>{c} ({n})</button>)}
      </div>
      <div className="cards">
        {view.slice(0, 300).map((r) => (
          <div key={r.id} className="card libcard" onClick={() => nav(`/r/TLB?id=${r.id}`)}>
            <div className="row" style={{ justifyContent: 'space-between' }}><span className="chip">{r.data.category || 'Other'}</span><span className="muted small">{r.data.format} {r.data.duration_hrs ? `· ${r.data.duration_hrs} h` : ''}</span></div>
            <h3 style={{ margin: '8px 0 4px' }}>{r.data.title}</h3>
            <div className="muted small">{r.data.ref} {r.data.level ? `· ${r.data.level}` : ''} {r.data.audience ? `· ${r.data.audience}` : ''}</div>
            {r.data.link && <a className="small" href={/^https?:/.test(r.data.link) ? r.data.link : undefined} title={r.data.link} onClick={(e) => e.stopPropagation()} target="_blank">{/^https?:/.test(r.data.link) ? 'Open material' : r.data.link}</a>}
          </div>
        ))}
      </div>
      {!view.length && <div className="empty">No materials match. Import the training library list in the Upload Center, or add materials one by one.</div>}
    </div>
  );
}

// ---------- Photo library ----------
const PHOTO_TYPES = ['Audit', 'Surveillance', 'Quality Walkabout', 'Inspection', 'Training', 'Event', 'Award', 'Special Job', 'Other'];
export function Photos() {
  const { can, toast } = useApp();
  const [rows, setRows] = useState<any[] | null>(null);
  const [f, setF] = useState({ type: '', won: '', year: '' });
  const [view, setView] = useState<any>(null);
  const [add, setAdd] = useState(false);
  const load = () => api.get(`/api/stats/photos?${new URLSearchParams(Object.entries(f).filter(([, v]) => v) as any)}`).then(setRows);
  useEffect(() => { load(); }, [f]);
  return (
    <div>
      <div className="page-head">
        <div><h1>Photo Library</h1><div className="muted small">Audit, surveillance, walkabout, training, event, award and special-job photos, tagged by date, project and type.</div></div>
        {can('culture', 'create') && <button className="primary" onClick={() => setAdd(true)}>+ Add photos</button>}
      </div>
      <div className="row" style={{ marginBottom: 12 }}>
        <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="">All types</option>{PHOTO_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        <input placeholder="WON" style={{ width: 110 }} value={f.won} onChange={(e) => setF({ ...f, won: e.target.value.trim() })} />
        <select value={f.year} onChange={(e) => setF({ ...f, year: e.target.value })}><option value="">All years</option>{[0, 1, 2, 3, 4].map((i) => <option key={i}>{new Date().getFullYear() - i}</option>)}</select>
      </div>
      {!rows ? <Spinner /> : !rows.length ? <div className="empty">No photos yet.</div> : (
        <div className="gallery">
          {rows.map((p) => (
            <figure key={p.id} onClick={() => setView(p)}>
              <img loading="lazy" src={fileUrl(p.r2_key)} alt={p.caption || p.filename} />
              <figcaption><b>{p.caption || p.filename}</b><span>{[p.type || p.register, p.won, fmtDate(p.date)].filter(Boolean).join(' · ')}</span></figcaption>
            </figure>
          ))}
        </div>
      )}
      {view && <div className="overlay center" onClick={() => setView(null)}><div className="lightbox"><img src={fileUrl(view.r2_key)} alt="" /><div className="muted">{view.caption} · {view.type || view.register} · {view.won} · {fmtDate(view.date)}</div></div></div>}
      {add && <AddPhotos onClose={() => setAdd(false)} onDone={() => { setAdd(false); load(); toast('Photos uploaded.'); }} />}
    </div>
  );
}

function AddPhotos({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { toast } = useApp();
  const [v, setV] = useState<any>({ type: 'Audit', date: new Date().toISOString().slice(0, 10) });
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState('');
  const save = async () => {
    if (!v.title || !files.length) return toast('Title and at least one photo are required.', 'err');
    try {
      setBusy('Creating album…');
      const rec = await api.post('/api/records/PHO', { data: v });
      for (let i = 0; i < files.length; i++) {
        setBusy(`Uploading ${i + 1} of ${files.length}…`);
        const fd = new FormData(); fd.append('file', await compressImage(files[i]));
        await api.form(`/api/item/${rec.id}/attachments`, fd);
      }
      onDone();
    } catch (e: any) { toast(e.message, 'err'); setBusy(''); }
  };
  return (
    <Drawer title="Add photos" onClose={onClose} footer={<><button onClick={onClose}>Cancel</button><button className="primary" disabled={!!busy} onClick={save}>{busy || `Upload ${files.length} photo(s)`}</button></>}>
      <div className="form-grid">
        <label className="f full">Album / title *<input value={v.title || ''} onChange={(e) => setV({ ...v, title: e.target.value })} /></label>
        <label className="f">Type<select value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })}>{PHOTO_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label className="f">Date<input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></label>
        <label className="f">WON<input value={v.won || ''} onChange={(e) => setV({ ...v, won: e.target.value })} /></label>
        <label className="f">Location<input value={v.location || ''} onChange={(e) => setV({ ...v, location: e.target.value })} /></label>
        <label className="f">Linked ref (UID / report no.)<input value={v.linked_ref || ''} onChange={(e) => setV({ ...v, linked_ref: e.target.value })} /></label>
      </div>
      <div style={{ marginTop: 12 }}><FileDrop accept="image/*" onFiles={(f) => setFiles([...files, ...f])}><div><b>Drop photos here</b><div className="muted small">Photos are resized to 1600 px before upload</div></div></FileDrop></div>
      {files.length > 0 && <div className="muted small" style={{ marginTop: 6 }}>{files.length} photo(s) selected</div>}
    </Drawer>
  );
}

// ---------- Department showcase ----------
export function Showcase() {
  const ref = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  const [d, setD] = useState<any>(null);
  useEffect(() => {
    const y = new Date().getFullYear();
    Promise.all([
      api.get(`/api/stats/dashboard?from=${y}-01-01&to=${y}-12-31`),
      api.get('/api/records/INI'), api.get('/api/records/AWD'), api.get('/api/records/SPJ'), api.get('/api/records/EVT'),
      api.get('/api/records/PPL'), api.get('/api/records/PCR'), api.get('/api/documents'), api.get('/api/stats/photos'),
    ]).then(([dash, ini, awd, spj, evt, ppl, pcr, docs, photos]) => setD({ dash, ini: ini.rows, awd: awd.rows, spj: spj.rows, evt: evt.rows, ppl: ppl.rows, pcr: pcr.rows, docs, photos }));
  }, []);
  if (!d) return <Spinner />;
  const k = d.dash.kpi;
  const y = new Date().getFullYear();
  const certs = d.docs.filter((x: any) => /certificate/i.test(x.category) && x.status !== 'Withdrawn');
  const client = d.docs.filter((x: any) => /client|capabilit|presentation/i.test(x.category + ' ' + x.title));
  const highlights = d.ini.filter((r: any) => r.data.showcase !== 'No' && /achievement|appreciation|zero|initiative|improvement|contingency/i.test(r.data.type || '')).slice(-8).reverse();
  const awards = [...d.awd].sort((a: any, b: any) => String(b.data.date).localeCompare(String(a.data.date))).slice(0, 8);
  const photoFor = (id: number) => d.photos.find((p: any) => p.record_id === id);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div>
      <div className="page-head no-print">
        <div><h1>QA/QC Department Showcase</h1><div className="muted small">Live view for client visits, GM meetings and World Quality Week. Content comes from the registers.</div></div>
        <div className="row"><button onClick={() => ref.current && snapshot(ref.current, `TRAGS QA-QC Showcase ${y}`)}>Snapshot</button><button className="primary" onClick={() => ref.current && exportChartsToPptx(ref.current, 'TRAGS QA/QC Department', String(y))}>Export to PowerPoint</button></div>
      </div>
      <div ref={ref}>
        <div className="hero">
          <div><div className="hero-k">TRAGS · Quality Assurance &amp; Quality Control</div><h1>Quality you can verify, on every work order.</h1>
            <div>Trading and Agency Services Limited Company W.L.L. · Doha, Mesaieed, Ras Laffan</div></div>
        </div>
        <div className="kpis chart-card" data-title={`QA/QC at a glance ${y}`}>
          <div className="kpi"><div className="l">QA/QC team</div><div className="v">{d.ppl.filter((r: any) => !/resigned|terminated|transferred/i.test(r.data.status || '')).length}</div><div className="s">active personnel</div></div>
          <div className="kpi"><div className="l">Personnel certifications</div><div className="v">{d.pcr.filter((r: any) => !r.data.expiry_date || r.data.expiry_date >= today).length}</div><div className="s">valid</div></div>
          <div className="kpi"><div className="l">Audits {y}</div><div className="v">{k.audits_conducted}</div><div className="s">conducted</div></div>
          <div className="kpi"><div className="l">Findings closed</div><div className="v">{k.findings_total - k.findings_open}</div><div className="s">of {k.findings_total} raised in {y}</div></div>
          <div className="kpi"><div className="l">Weld repair rate</div><div className="v">{k.repair_rate === null ? '–' : (k.repair_rate * 100).toFixed(2) + '%'}</div><div className="s">film based, {y}</div></div>
          <div className="kpi"><div className="l">Training delivered</div><div className="v">{k.trainings_conducted}</div><div className="s">{k.participants} participants</div></div>
          <div className="kpi"><div className="l">Company certifications</div><div className="v">{certs.length}</div><div className="s">ISO, ASME and quality</div></div>
        </div>
        <div className="section-title"><h2>Certifications</h2></div>
        <div className="chips-wrap">{certs.map((c: any) => <span key={c.id} className="cert">{c.title}{c.expiry_date ? <small> · valid to {fmtDate(c.expiry_date)}</small> : null}</span>)}{!certs.length && <span className="muted">Upload certificates in the Document Library.</span>}</div>
        <div className="split" style={{ marginTop: 14 }}>
          <div className="card chart-card" data-title="Achievements and initiatives">
            <h2>Achievements &amp; initiatives</h2>
            {highlights.map((r: any) => <div key={r.id} className="li" onClick={() => nav(`/r/INI?id=${r.id}`)}><div><div className="li-t">{r.data.title}</div><div className="muted small">{r.data.type} · {fmtDate(r.data.start_date)}</div></div></div>)}
            {!highlights.length && <div className="muted">Record achievements, client appreciation and initiatives in Initiatives &amp; Records.</div>}
          </div>
          <div className="card chart-card" data-title="Recognition">
            <h2>Recognition</h2>
            {awards.map((r: any) => <div key={r.id} className="li" onClick={() => nav(`/r/AWD?id=${r.id}`)}><div><div className="li-t">{r.data.winner}</div><div className="muted small">{r.data.award} · {r.data.period}</div></div>{photoFor(r.id) && <img className="thumb" src={fileUrl(photoFor(r.id).r2_key)} alt="" />}</div>)}
            {!awards.length && <div className="muted">Record Quality Performer and Welder of the Month awards in Recognition &amp; Awards.</div>}
          </div>
        </div>
        <div className="section-title"><h2>Special jobs</h2></div>
        <div className="cards">
          {d.spj.slice(-6).reverse().map((r: any) => (
            <div key={r.id} className="card chart-card" data-title={`Special job: ${r.data.title}`} onClick={() => nav(`/r/SPJ?id=${r.id}`)}>
              {photoFor(r.id) && <img className="cover" src={fileUrl(photoFor(r.id).r2_key)} alt="" />}
              <h3 style={{ marginTop: 8 }}>{r.data.title}</h3><div className="muted small">{r.data.client} · {r.data.category} · {fmtDate(r.data.date)}</div>
              <div className="small clip">{r.data.scope}</div>
            </div>
          ))}
          {!d.spj.length && <div className="muted">Add special jobs with photos and client approvals in Special Jobs.</div>}
        </div>
        <div className="split" style={{ marginTop: 14 }}>
          <div className="card"><h2>Upcoming quality events</h2>{d.evt.filter((r: any) => (r.data.date || '') >= today).slice(0, 6).map((r: any) => <div key={r.id} className="li"><div><div className="li-t">{r.data.title}</div><div className="muted small">{r.data.type} · {fmtDate(r.data.date)}</div></div></div>)}</div>
          <div className="card"><h2>Client-facing material</h2>{client.map((c: any) => <div key={c.id} className="li"><div><div className="li-t">{c.title}</div><div className="muted small">{c.category} · Rev {c.rev}</div></div>{c.r2_key && <a href={fileUrl(c.r2_key)} target="_blank">Open</a>}</div>)}{!client.length && <div className="muted small">Add client presentations and capability statements to the Document Library (category Client Presentation / Capability).</div>}</div>
        </div>
      </div>
    </div>
  );
}

export { statusChip };
