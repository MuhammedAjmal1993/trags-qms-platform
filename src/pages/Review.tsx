// QA/QC review queue for quick-raise submissions, and printable QR posters for each site.
import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Inbox, MapPin, User, Calendar, Printer, QrCode, Camera } from 'lucide-react';
import { api, fileUrl, useSWR } from '../api';
import { useApp } from '../ctx';
import type { RegisterConfig } from '../../shared/registers';
import { RecordForm, missingRequired } from '../components/RecordForm';
import { Drawer, Modal, PageSkeleton } from '../components/ui';
import { Logo } from '../components/Brand';
import { fmtDate } from '../../shared/logic';

interface Sub { id: number; ref: string; kind: string; status: string; data: Record<string, string>; photos: string[]; created_at: string; reviewer?: string; review_note?: string; record_id?: number }

const TARGET: Record<string, string> = { 'Customer feedback': 'CFB', 'Improvement idea': 'INI' };

function prefill(cfg: RegisterConfig, s: Sub): Record<string, unknown> {
  const v: Record<string, unknown> = {};
  const role = (r: string) => cfg.columns.find((c) => c.role === r)?.key;
  const has = (k: string) => cfg.columns.some((c) => c.key === k);
  const d = s.data;
  const desc = [d.description, d.location ? `Location: ${d.location}` : '', d.site ? `Site: ${d.site}` : ''].filter(Boolean).join('\n');
  if (role('description')) v[role('description')!] = cfg.code === 'INI' ? d.description.slice(0, 120) : desc;
  if (role('plan_date')) v[role('plan_date')!] = d.date;
  if (role('won') && d.won) v[role('won')!] = d.won;
  if (has('location') && d.location) v.location = d.location;
  if (cfg.code === 'FND') {
    v.finding_type = 'OBSERVATION';
    v.nature = s.kind === 'Positive practice' ? 'POSITIVE' : 'NEGETIVE';
  }
  if (has('remarks')) v.remarks = `Raised by ${d.raised_by}${d.contact ? ` (${d.contact})` : ''}`;
  return v;
}

export default function Review() {
  const { can, toast, registers } = useApp();
  const [tab, setTab] = useState('Pending');
  const { data, reload } = useSWR<{ rows: Sub[]; counts: Record<string, number> }>(`/api/review?status=${tab}`);
  const [acc, setAcc] = useState<{ s: Sub; reg: string; v: Record<string, unknown> } | null>(null);
  const [rej, setRej] = useState<Sub | null>(null);
  const [note, setNote] = useState('');
  const [img, setImg] = useState('');
  const [wos, setWos] = useState<any[]>([]);
  useEffect(() => { api.get('/api/stats/filters').then((f) => setWos(f.workorders)).catch(() => {}); }, []);
  const cfgOf = (code: string) => registers.find((r) => r.code === code) as RegisterConfig | undefined;

  const startAccept = (s: Sub, reg = TARGET[s.kind] || 'FND') => {
    const cfg = cfgOf(reg);
    if (!cfg) return toast(`You do not have access to the ${reg} register.`, 'err');
    setAcc({ s, reg, v: prefill(cfg, s) });
  };
  const accept = async () => {
    if (!acc) return;
    const cfg = cfgOf(acc.reg)!;
    const miss = missingRequired(cfg, acc.v);
    if (miss.length) return toast(`Complete the required fields: ${miss.join(', ')}`, 'err');
    try {
      const r = await api.post(`/api/review/${acc.s.id}/accept`, { register: acc.reg, data: acc.v });
      toast(`${acc.s.ref} accepted as ${cfg.name} ${r.uid || ''}`);
      setAcc(null); reload();
    } catch (e: any) { toast(e.message, 'err'); }
  };
  const reject = async () => {
    if (!rej) return;
    try { await api.post(`/api/review/${rej.id}/reject`, { note }); toast(`${rej.ref} rejected`); setRej(null); setNote(''); reload(); } catch (e: any) { toast(e.message, 'err'); }
  };

  if (!data) return <PageSkeleton />;
  const c = data.counts || {};
  return (
    <div className="page">
      <div className="page-head">
        <div><div className="eyebrow">Audit & Findings</div><h1>Review queue</h1><div className="sub">Observations raised through the public quick form. Nothing enters a register until a QA/QC user accepts it.</div></div>
        <a className="btn" href="/qr"><QrCode size={15} /> QR posters</a>
      </div>
      <div className="tabs">{['Pending', 'Accepted', 'Rejected'].map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t} <span className="chip" style={{ marginLeft: 4 }}>{c[t] || 0}</span></button>)}</div>
      {!data.rows.length && <div className="card empty"><Inbox size={34} color="#94a3b8" /><div style={{ marginTop: 8 }}>No {tab.toLowerCase()} submissions.</div></div>}
      <div className="cards stagger">
        {data.rows.map((s) => (
          <div key={s.id} className="card col" style={{ gap: 10 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="row"><b style={{ color: 'var(--navy)' }}>{s.ref}</b><span className={`chip ${s.kind === 'Positive practice' ? 'green' : s.kind === 'Observation' ? 'amber' : 'blue'}`}>{s.kind}</span></div>
              <span className="muted small">{fmtDate(s.created_at.slice(0, 10))}</span>
            </div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{s.data.description}</div>
            <div className="row small muted">
              {s.data.site && <span className="row" style={{ gap: 4 }}><MapPin size={13} />{s.data.site}{s.data.location ? ` · ${s.data.location}` : ''}</span>}
              {s.data.won && <span className="chip">WON {s.data.won}</span>}
              <span className="row" style={{ gap: 4 }}><User size={13} />{s.data.raised_by}{s.data.contact ? ` · ${s.data.contact}` : ''}</span>
              <span className="row" style={{ gap: 4 }}><Calendar size={13} />{fmtDate(s.data.date)}</span>
            </div>
            {!!s.photos.length && <div className="thumbs">{s.photos.map((k) => <img key={k} src={fileUrl(k)} alt="" style={{ cursor: 'zoom-in' }} onClick={() => setImg(fileUrl(k))} />)}</div>}
            {s.status === 'Pending' && can('findings', 'create') && (
              <div className="row" style={{ marginTop: 4 }}>
                <button className="primary sm" onClick={() => startAccept(s)}><CheckCircle2 size={14} /> Accept as {cfgOf(TARGET[s.kind] || 'FND')?.name || 'finding'}</button>
                {TARGET[s.kind] && <button className="sm" onClick={() => startAccept(s, 'FND')}>Accept as finding</button>}
                <button className="sm danger" onClick={() => setRej(s)}><XCircle size={14} /> Reject</button>
              </div>
            )}
            {s.status !== 'Pending' && <div className="small muted">{s.status} by {s.reviewer || '–'}{s.status === 'Rejected' && s.review_note ? ` · ${s.review_note}` : ''}{s.record_id ? <> · <a href={`/r/${s.review_note || 'FND'}?id=${s.record_id}`}>open record</a></> : null}</div>}
          </div>
        ))}
      </div>

      {acc && (
        <Drawer title={`Accept ${acc.s.ref} into ${cfgOf(acc.reg)?.name}`} onClose={() => setAcc(null)} footer={<><button onClick={() => setAcc(null)}>Cancel</button><button className="primary" onClick={accept}><CheckCircle2 size={15} /> Accept and create record</button></>}>
          <div className="card" style={{ background: '#f6f8fc', marginBottom: 14 }}><b>Submitted text</b><div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{acc.s.data.description}</div></div>
          <RecordForm cfg={cfgOf(acc.reg)!} value={acc.v as any} onChange={(v) => setAcc({ ...acc, v })} workorders={wos} />
          <div className="muted small" style={{ marginTop: 10 }}>Photos are attached to the new record automatically.</div>
        </Drawer>
      )}
      {rej && (
        <Modal title={`Reject ${rej.ref}`} onClose={() => setRej(null)} footer={<><button onClick={() => setRej(null)}>Cancel</button><button className="danger" onClick={reject}>Reject</button></>}>
          <label className="f">Reason (kept in the log)<textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Duplicate of an existing finding, not a quality matter, insufficient detail…" /></label>
        </Modal>
      )}
      {img && <div className="overlay center" onClick={() => setImg('')}><div className="lightbox"><img src={img} alt="" /></div></div>}
    </div>
  );
}

export function QrPosters() {
  const [site, setSite] = useState('');
  const [qr, setQr] = useState('');
  const url = `${location.origin}/raise`;
  useEffect(() => { import('qrcode').then((Q) => Q.toDataURL(url, { margin: 1, width: 600, color: { dark: '#0a2540', light: '#ffffff' } }).then(setQr)); }, [url]);
  return (
    <div className="page">
      <div className="page-head no-print">
        <div><div className="eyebrow">Data input</div><h1>Quick-raise QR poster</h1><div className="sub">Print and post at site offices, workshops and inspection areas. Anyone can scan and raise an observation; submissions go to the review queue.</div></div>
        <div className="row"><input placeholder="Site name on poster (optional)" value={site} onChange={(e) => setSite(e.target.value)} /><button className="primary" onClick={() => window.print()}><Printer size={15} /> Print</button></div>
      </div>
      <div className="card qr-sheet" style={{ maxWidth: 560, margin: '0 auto', padding: 34, borderRadius: 22 }}>
        <div className="row" style={{ justifyContent: 'center', marginBottom: 10 }}><Logo size={52} /></div>
        <div className="eyebrow">TRAGS QA/QC</div>
        <h1 style={{ fontSize: 30, margin: '4px 0 6px' }}>Seen a quality issue?</h1>
        <div className="muted" style={{ fontSize: 15 }}>Scan to raise an observation with a photo. It takes under a minute.</div>
        {site && <div className="chip blue" style={{ marginTop: 10, fontSize: 13 }}><MapPin size={13} /> {site}</div>}
        <div style={{ margin: '20px auto' }}>{qr ? <img src={qr} alt="QR code" style={{ width: 300, height: 300 }} /> : <div className="skel" style={{ width: 300, height: 300, margin: '0 auto' }} />}</div>
        <div className="row" style={{ justifyContent: 'center', gap: 18 }} >
          <span className="row small"><Camera size={14} /> Photo</span><span className="row small"><MapPin size={14} /> Location</span><span className="row small"><CheckCircle2 size={14} /> Reviewed by QA/QC</span>
        </div>
        <div className="muted small" style={{ marginTop: 14 }}>{url}</div>
      </div>
    </div>
  );
}
