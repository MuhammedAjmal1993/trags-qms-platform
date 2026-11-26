// Public pages: the showcase landing page and the quick-raise form (no sign-in).
// Only approved, non-confidential content is shown: counts, certificates and photos marked public.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, LogIn, Camera, ShieldCheck, ClipboardCheck, Flame, GraduationCap, FolderOpen, Sparkles, Briefcase,
  Send, CheckCircle2, Search, Wrench, BadgeCheck, BookOpen, Users, Award, X, MapPin, Lightbulb, ThumbsUp, AlertTriangle, MessageSquareHeart,
} from 'lucide-react';
import { api } from '../api';
import { Logo, Monogram } from '../components/Brand';
import { CountUp } from '../components/ui';
import { compressImage } from '../lib/images';
import { fmtDate } from '../../shared/logic';

interface Summary {
  tagline: string; hasLogo: boolean; year: number;
  stats: null | { team: number; audits: number; findingsClosed: number; trainings: number; participants: number; projects: number; specialJobs: number };
  certificates: { title: string; category: string; expiry: string | null }[];
  photos: { id: number; caption: string | null; type: string | null }[];
}

function useReveal() {
  useEffect(() => {
    const els = [...document.querySelectorAll('.reveal')];
    if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
    const io = new IntersectionObserver((ents) => ents.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  });
}

const HUB_TILES = [
  { icon: Briefcase, c: 'linear-gradient(135deg,#0f766e,#2dd4bf)', t: 'Projects & Work Orders', d: 'Every record is tied to its work order, so the quality status of each project is one click away.' },
  { icon: ClipboardCheck, c: 'linear-gradient(135deg,#e11d48,#fb7185)', t: 'Audit & Findings', d: 'Audit programme, NCR, CAR and observations from raise to verified close-out, with root cause analysis.' },
  { icon: Flame, c: 'linear-gradient(135deg,#d97706,#fbbf24)', t: 'Inspection & Welding', d: 'Source inspection, NFI and RFI control, welder qualification and film-based weld repair rate.' },
  { icon: GraduationCap, c: 'linear-gradient(135deg,#6d28d9,#a78bfa)', t: 'People & Training', d: 'Inspector resources, organization chart, training plan, training library and certificate expiry.' },
  { icon: FolderOpen, c: 'linear-gradient(135deg,#047857,#34d399)', t: 'QMS Documents & Plans', d: 'Controlled documents in four levels, revision history, quality objectives and signed plans.' },
  { icon: Sparkles, c: 'linear-gradient(135deg,#be185d,#f472b6)', t: 'Quality Culture', d: 'Management review, initiatives, quality events, recognition and the photo library.' },
];

const FLOW = [
  { k: '01', icon: Camera, t: 'Raise', d: 'Anyone on site raises an observation from a phone, with photos. No account needed.' },
  { k: '02', icon: Search, t: 'Review', d: 'QA/QC reviews each submission before it enters the Finding Register.' },
  { k: '03', icon: Wrench, t: 'Disposition & RCA', d: 'Correction, root cause and corrective action, with owners and target dates.' },
  { k: '04', icon: BadgeCheck, t: 'Verify & close', d: 'Evidence is checked, the effectiveness is confirmed and the finding is closed.' },
  { k: '05', icon: BookOpen, t: 'Learn', d: 'Recurring issues and lessons learnt feed training and management review.' },
];

const KINDS = [
  { v: 'Observation', icon: AlertTriangle, d: 'Quality concern or deviation' },
  { v: 'Positive practice', icon: ThumbsUp, d: 'Good work worth recognising' },
  { v: 'Improvement idea', icon: Lightbulb, d: 'Suggestion to do better' },
  { v: 'Customer feedback', icon: MessageSquareHeart, d: 'Comment from a client' },
];
const SITES = ['Mesaieed', 'Ras Laffan', 'Doha', 'Workshop', 'Other'];

export function QuickRaise() {
  const [f, setF] = useState({ kind: 'Observation', site: '', won: '', location: '', client: '', description: '', raised_by: '', contact: '', date: new Date().toISOString().slice(0, 10), website: '' });
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');
  const inp = useRef<HTMLInputElement>(null);
  useEffect(() => { try { const n = localStorage.getItem('raise_name'); if (n) setF((x) => ({ ...x, raised_by: n })); } catch { /* ignore */ } }, []);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const add = async (files: File[]) => {
    const list = await Promise.all(files.filter((x) => x.type.startsWith('image/')).slice(0, 5 - photos.length).map(async (x) => { const c = await compressImage(x); return { file: c, url: URL.createObjectURL(c) }; }));
    setPhotos((p) => [...p, ...list].slice(0, 5));
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    if (f.description.trim().length < 10) return setErr('Describe what you saw (at least 10 characters).');
    setBusy(true);
    try {
      const fd = new FormData();
      Object.entries(f).forEach(([k, v]) => fd.append(k, v));
      photos.forEach((p) => fd.append('photos', p.file, p.file.name));
      const r = await api.form<{ ref: string }>('/api/public/raise', fd);
      try { localStorage.setItem('raise_name', f.raised_by); } catch { /* ignore */ }
      setDone(r.ref);
    } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  const again = () => { setDone(''); setPhotos([]); setF((x) => ({ ...x, description: '', location: '', won: '', client: '' })); };

  return (
    <div className="raise">
      <div className="head">
        <Link to="/"><Logo size={64} white /></Link>
        <div><div style={{ fontWeight: 800, fontSize: 19 }}>Raise an observation</div><div style={{ color: '#b8cbeb', fontSize: 12.5 }}>TRAGS QA/QC · reviewed before it enters the Finding Register</div></div>
      </div>
      {done ? (
        <div className="card page" style={{ textAlign: 'center' }}>
          <div className="done-mark"><CheckCircle2 size={40} /></div>
          <h1>Thank you</h1>
          <p className="muted">Your submission reference is <b style={{ color: 'var(--navy)' }}>{done}</b>. QA/QC will review it.</p>
          <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}><button className="primary" onClick={again}><Send size={15} /> Raise another</button><Link className="btn" to="/">Done</Link></div>
        </div>
      ) : (
        <form className="card page col" onSubmit={submit} style={{ gap: 14 }}>
          <div>
            <div className="small muted" style={{ fontWeight: 600, marginBottom: 6 }}>What are you raising?</div>
            <div className="seg">{KINDS.map((k) => <button type="button" key={k.v} className={f.kind === k.v ? 'on' : ''} onClick={() => set('kind', k.v)}><k.icon size={20} /><b>{k.v}</b><span className="muted small">{k.d}</span></button>)}</div>
          </div>
          <div>
            <div className="small muted" style={{ fontWeight: 600, marginBottom: 6 }}><MapPin size={12} /> Site</div>
            <div className="row">{SITES.map((x) => <button type="button" key={x} className={`sm ${f.site === x ? 'primary' : ''}`} onClick={() => set('site', f.site === x ? '' : x)}>{x}</button>)}</div>
          </div>
          <label className="f">What did you see?<textarea rows={5} value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="Describe the observation: what, where, which equipment or activity." required /></label>
          <div>
            <div className="small muted" style={{ fontWeight: 600, marginBottom: 6 }}>Photos (up to 5)</div>
            <div className="thumbs">
              {photos.map((p, i) => <div key={p.url} className="t"><img src={p.url} alt="" /><button type="button" onClick={() => setPhotos((x) => x.filter((_, j) => j !== i))} aria-label="Remove photo"><X size={11} /></button></div>)}
              {photos.length < 5 && <button type="button" onClick={() => inp.current?.click()} style={{ width: 76, height: 76, justifyContent: 'center', flexDirection: 'column', gap: 4, borderStyle: 'dashed' }}><Camera size={20} /><span className="small">Add</span></button>}
            </div>
            <input ref={inp} type="file" accept="image/*" multiple hidden onChange={(e) => { const x = [...(e.target.files || [])]; e.target.value = ''; add(x); }} />
          </div>
          <div className="form-grid">
            <label className="f">Exact location / area<input value={f.location} onChange={(e) => set('location', e.target.value)} placeholder="Unit, tank no., bay" /></label>
            <label className="f">Work order no. (if known)<input inputMode="numeric" value={f.won} onChange={(e) => set('won', e.target.value.replace(/\D/g, '').slice(0, 7))} placeholder="7 digits" /></label>
            <label className="f">Date<input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} /></label>
            <label className="f">Your name<input value={f.raised_by} onChange={(e) => set('raised_by', e.target.value)} required autoComplete="name" /></label>
            <label className="f">Phone or email (optional)<input value={f.contact} onChange={(e) => set('contact', e.target.value)} autoComplete="email" /></label>
          </div>
          <input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set('website', e.target.value)} style={{ position: 'absolute', left: -9999, width: 1, height: 1 }} aria-hidden />
          {err && <div className="red small">{err}</div>}
          <button className="primary" disabled={busy} style={{ justifyContent: 'center', padding: '12px 16px', fontSize: 15 }}>{busy ? 'Sending…' : <><Send size={16} /> Submit</>}</button>
          <div className="muted small" style={{ textAlign: 'center' }}>Do not include personal or confidential client information beyond what is needed to describe the observation.</div>
        </form>
      )}
    </div>
  );
}
