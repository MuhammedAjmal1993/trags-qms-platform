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

export function Landing({ signedIn }: { signedIn?: boolean }) {
  const [s, setS] = useState<Summary | null>(null);
  const [solid, setSolid] = useState(false);
  const [intro] = useState(() => { try { if (sessionStorage.getItem('intro')) return false; sessionStorage.setItem('intro', '1'); } catch { /* ignore */ } return true; });
  const [qr, setQr] = useState('');
  useEffect(() => { api.get<Summary>('/api/public/summary').then(setS).catch(() => setS({ tagline: '', hasLogo: false, year: new Date().getFullYear(), stats: null, certificates: [], photos: [] })); }, []);
  useEffect(() => { const f = () => setSolid(window.scrollY > 40); f(); window.addEventListener('scroll', f, { passive: true }); return () => window.removeEventListener('scroll', f); }, []);
  useEffect(() => { import('qrcode').then((Q) => Q.toDataURL(`${location.origin}/raise`, { margin: 1, width: 360, color: { dark: '#0a2540', light: '#ffffff' } }).then(setQr)).catch(() => {}); }, []);
  useReveal();
  const st = s?.stats;
  const tagline = s?.tagline || 'Quality you can verify, on every work order.';
  const words = tagline.split(' ');
  const cut = Math.max(1, Math.ceil(words.length / 2));

  return (
    <div className="landing">
      {intro && (
        <div className="intro"><div className="mark"><Logo size={84} /><div className="word">TRAGS</div><div className="tag">Quality Assurance · Quality Control</div></div></div>
      )}
      <nav className={`lnav ${solid ? 'solid' : ''}`}>
        <div className="lbrand"><Logo size={38} /><span>TRAGS QA/QC</span></div>
        <div className="links">
          <a className="lk" href="#hubs">What we track</a>
          <a className="lk" href="#flow">How it works</a>
          {!!s?.certificates.length && <a className="lk" href="#certs">Certifications</a>}
          <Link className="btn sm" to="/raise" style={solid ? undefined : { background: 'rgba(255,255,255,.12)', color: '#fff', borderColor: 'rgba(255,255,255,.25)' }}><Camera size={14} />Raise</Link>
          <Link className="btn primary sm" to={signedIn ? '/' : '/login'}><LogIn size={14} />{signedIn ? 'Open platform' : 'Sign in'}</Link>
        </div>
      </nav>

      <header className="lhero">
        <div className="grid-bg" />
        <div className="orb" style={{ width: 260, height: 260, right: '38%', top: '8%', background: 'radial-gradient(circle at 30% 30%, rgba(96,165,250,.55), transparent 70%)' }} />
        <div className="orb" style={{ width: 180, height: 180, left: '4%', bottom: '12%', background: 'radial-gradient(circle at 30% 30%, rgba(45,212,191,.5), transparent 70%)', animationDelay: '-3s' }} />
        <div className="inner">
          <span className="pill"><ShieldCheck size={14} /> Trading and Agency Services · Doha, Qatar</span>
          <h1>{words.slice(0, cut).join(' ')} <span className="gr">{words.slice(cut).join(' ')}</span></h1>
          <p className="lead">One platform for the TRAGS QA/QC department: audits, findings, inspections, welding, training and QMS documents, tracked by work order and visible to management in real time.</p>
          <div className="cta">
            <Link className="btn primary" to={signedIn ? '/' : '/login'}>{signedIn ? 'Open platform' : 'Sign in'} <ArrowRight size={16} /></Link>
            <Link className="btn glass" to="/raise"><Camera size={16} /> Raise an observation</Link>
          </div>
        </div>
        <div className="mock" aria-hidden>
          <div className="mockcard">
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
              <div className="row"><Monogram size={26} /><b style={{ color: 'var(--navy)' }}>Quality overview</b></div>
              <span className="chip green">Live</span>
            </div>
            <div className="mrow">
              <div className="mk" style={{ background: 'linear-gradient(135deg,#1463f3,#60a5fa)' }}><b>{st ? <CountUp value={st.audits} /> : '–'}</b><span>Audits {s?.year}</span></div>
              <div className="mk" style={{ background: 'linear-gradient(135deg,#047857,#34d399)' }}><b>{st ? <CountUp value={st.findingsClosed} /> : '–'}</b><span>Findings closed</span></div>
              <div className="mk" style={{ background: 'linear-gradient(135deg,#6d28d9,#a78bfa)' }}><b>{st ? <CountUp value={st.trainings} /> : '–'}</b><span>Trainings</span></div>
            </div>
            <svg viewBox="0 0 320 120" width="100%" height="120" preserveAspectRatio="none">
              <defs><linearGradient id="lg1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1463f3" stopOpacity=".35" /><stop offset="1" stopColor="#1463f3" stopOpacity="0" /></linearGradient></defs>
              {[18, 34, 26, 48, 40, 62, 55, 72, 66, 84, 78, 92].map((h, i) => <rect key={i} x={8 + i * 26} y={110 - h} width="14" height={h} rx="4" fill={i % 3 === 0 ? '#7c3aed' : '#c7d8fb'} />)}
              <path d="M8 92 C 60 80, 90 70, 130 60 S 220 30, 310 20 L310 120 L8 120Z" fill="url(#lg1)" />
              <path d="M8 92 C 60 80, 90 70, 130 60 S 220 30, 310 20" stroke="#1463f3" strokeWidth="3" fill="none" strokeDasharray="400" style={{ animation: 'drawLine 2.4s ease forwards' }} />
            </svg>
          </div>
          <div className="floaty" style={{ left: -40, bottom: -26 }}><CheckCircle2 size={18} color="#10b981" /><div><b>Finding closed</b><div className="muted">effectiveness verified</div></div></div>
          <div className="floaty" style={{ right: -20, top: -30, animationDelay: '-2s' }}><ShieldCheck size={18} color="#7c3aed" /><div><b>Audit-ready records</b><div className="muted">traceable by work order</div></div></div>
        </div>
      </header>

      {st && (
        <section className="lstats">
          {[
            { n: st.team, t: 'QA/QC team members' }, { n: st.projects, t: 'Work orders active (12 months)' }, { n: st.audits, t: `Audits conducted in ${s?.year}` },
            { n: st.findingsClosed, t: `Findings closed in ${s?.year}` }, { n: st.participants, t: `Training participants ${s?.year}` },
          ].filter((x) => x.n > 0).map((x) => <div key={x.t} className="lstat reveal"><div className="n"><CountUp value={x.n} ms={1400} /></div><div className="t">{x.t}</div></div>)}
        </section>
      )}

      <section className="lsec" id="hubs">
        <div className="eyebrow reveal">What we track</div>
        <h2 className="reveal">Six hubs, one quality picture</h2>
        <p className="sec-lead reveal">Registers that used to live in separate spreadsheets now share one database, one numbering system and one dashboard.</p>
        <div className="hubs">
          {HUB_TILES.map((h, i) => (
            <div key={h.t} className="hubtile reveal" style={{ transitionDelay: `${i * 60}ms` }}>
              <span className="num">{i + 1}</span>
              <div className="hi" style={{ background: h.c }}><h.icon size={24} /></div>
              <h3>{h.t}</h3><p>{h.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lsec lband" id="flow">
        <div className="orb" style={{ width: 340, height: 340, right: -80, top: -80, background: 'radial-gradient(circle, rgba(124,58,237,.4), transparent 70%)' }} />
        <div className="eyebrow reveal">How it works</div>
        <h2 className="reveal">From a photo on site to a closed finding</h2>
        <p className="sec-lead reveal">Every observation follows the same controlled route, so nothing is lost between the site, QA/QC and management.</p>
        <div className="steps">
          {FLOW.map((f, i) => (
            <div key={f.k} className="step reveal" style={{ transitionDelay: `${i * 80}ms` }}>
              <div className="row" style={{ justifyContent: 'space-between' }}><span className="k">{f.k}</span><f.icon size={20} color="#93c5fd" /></div>
              <h3>{f.t}</h3><p>{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {!!s?.certificates.length && (
        <section className="lsec" id="certs">
          <div className="eyebrow reveal">Certifications</div>
          <h2 className="reveal">Certified and audited</h2>
          <div className="certwall">
            {s.certificates.map((c) => (
              <div key={c.title} className="certcard reveal"><div className="ci"><Award size={22} /></div><div><b>{c.title}</b><div className="muted small">{c.category}{c.expiry ? ` · valid to ${fmtDate(c.expiry)}` : ''}</div></div></div>
            ))}
          </div>
        </section>
      )}

      {!!s?.photos.length && (
        <section className="lsec" style={{ paddingTop: s?.certificates.length ? 0 : undefined }}>
          <div className="eyebrow reveal">On site</div>
          <h2 className="reveal">Quality in action</h2>
          <div className="photo-strip">
            {s.photos.map((p) => <figure key={p.id} className="reveal"><img src={`/api/public/photo/${p.id}`} alt={p.caption || 'TRAGS QA/QC'} loading="lazy" />{p.caption && <figcaption>{p.caption}</figcaption>}</figure>)}
          </div>
        </section>
      )}

      <section className="lsec" style={{ paddingTop: 20 }}>
        <div className="card reveal" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 24, alignItems: 'center', padding: 28, borderRadius: 22, background: 'linear-gradient(135deg,#eaf2ff,#f5efff)' }}>
          <div>
            <div className="eyebrow">Seen something?</div>
            <h2 style={{ fontSize: 28 }}>Raise an observation in under a minute</h2>
            <p className="muted" style={{ fontSize: 15, maxWidth: 560 }}>Scan the code or open the form on your phone. Add a photo and a short description. QA/QC reviews it and follows it up.</p>
            <Link className="btn primary" to="/raise"><Camera size={16} /> Open the quick form</Link>
          </div>
          {qr && <img src={qr} alt="QR code for the quick-raise form" style={{ width: 170, height: 170, borderRadius: 16, background: '#fff', padding: 8, boxShadow: 'var(--shadow-lg)' }} className="hide-sm" />}
        </div>
      </section>

      <footer className="lfoot">
        <span>© {new Date().getFullYear()} Trading and Agency Services Limited Company W.L.L. · QA/QC Department</span>
        <span className="row"><Users size={14} /> Internal platform · accounts issued by QA/QC</span>
      </footer>
    </div>
  );
}

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
        <Link to="/"><Logo size={44} /></Link>
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
