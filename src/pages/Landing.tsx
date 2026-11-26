// Public showcase page for the TRAGS QA/QC Department. Shows only approved, non-confidential content:
// performance counts, company certifications, public news and photos marked public.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, LogIn, Camera, ShieldCheck, ClipboardCheck, Flame, GraduationCap, FolderOpen, Sparkles, Briefcase, Search, Wrench, BadgeCheck,
  BookOpen, Award, Users, Trophy, Newspaper, X, ChevronDown, FlaskConical, Factory, Leaf, HardHat, MapPin, CalendarDays, Gauge, Target, Radiation,
} from 'lucide-react';
import { api } from '../api';
import { Logo } from '../components/Brand';
import { CountUp } from '../components/ui';
import { fmtDate } from '../../shared/logic';

interface Stats {
  team: number; audits: number; findingsClosed: number; trainings: number; participants: number; projects: number; rfis: number; rfiRejection: number | null;
  films: number; joints: number; inchDia: number; repairRate: number | null; welderAwards: number; findingsTracked: number; since: string | null; survey: number | null; nfis: number;
}
interface Summary {
  tagline: string; year: number; stats: Stats | null;
  certificates: { name: string; family: string; body: string; site: string; expiry: string | null }[];
  news: { title: string; date: string; category: string; location: string; summary: string }[];
  photos: { id: number; caption: string | null; type: string | null }[];
}

function useReveal(dep: unknown) {
  useEffect(() => {
    const els = [...document.querySelectorAll('.reveal:not(.in)')];
    if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
    const io = new IntersectionObserver((ents) => ents.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [dep]);
}

const HUBS = [
  { icon: Briefcase, c: '#14b8a6', t: 'Projects & Work Orders', d: 'Every audit, finding, inspection and weld record is linked to its work order, so each project has a live quality status.' },
  { icon: ClipboardCheck, c: '#f43f5e', t: 'Audit & Findings', d: 'Internal, project and supplier audits; NCR, CAR and observations from raise to verified close-out with root cause analysis.' },
  { icon: Flame, c: '#f59e0b', t: 'Inspection & Welding', d: 'RFI and NFI control, third-party inspection, welder qualification and film-based weld repair monitoring.' },
  { icon: GraduationCap, c: '#8b5cf6', t: 'People & Training', d: 'Inspector resources, the yearly training plan, a training library of more than 100 topics and certificate expiry tracking.' },
  { icon: FolderOpen, c: '#22c55e', t: 'QMS Documents & Plans', d: 'Controlled documents, certifications, risk and opportunity registers, and quality objectives signed by management.' },
  { icon: Sparkles, c: '#ec4899', t: 'Quality Culture', d: 'Management review, initiatives, World Quality Week, Welder of the Month and the Quality Performer of the Year award.' },
];
const FLOW = [
  { k: '01', icon: Camera, t: 'Raise', d: 'Anyone on site raises an observation from a phone, with photos. No account needed.' },
  { k: '02', icon: Search, t: 'Review', d: 'QA/QC reviews each submission before it enters the Finding Register.' },
  { k: '03', icon: Wrench, t: 'Disposition & RCA', d: 'Correction, root cause and corrective action, with owners and target dates.' },
  { k: '04', icon: BadgeCheck, t: 'Verify & close', d: 'Evidence is checked, effectiveness is confirmed and the finding is closed.' },
  { k: '05', icon: BookOpen, t: 'Learn', d: 'Recurring issues and lessons learnt feed training and management review.' },
];
const FAMILY_ICON: Record<string, any> = { 'ISO Management System': ShieldCheck, Laboratory: FlaskConical, 'ASME / National Board': Factory, 'National Programme': Award };
const certIcon = (c: { name: string; family: string }) => (/14001|50001|14067/.test(c.name) ? Leaf : /45001/.test(c.name) ? HardHat : FAMILY_ICON[c.family] || ShieldCheck);
const pct = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? '–' : `${(v * 100).toFixed(d)}%`);

function Meter({ value, target, lowerIsBetter }: { value: number | null; target: number; lowerIsBetter?: boolean }) {
  if (value === null) return null;
  const ok = lowerIsBetter ? value <= target : value >= target;
  const w = lowerIsBetter ? Math.min(100, (value / (target * 2)) * 100) : Math.min(100, value * 100);
  return (
    <div className="lp-meter">
      <div className="bar"><i style={{ width: `${w}%`, background: ok ? 'linear-gradient(90deg,#22c55e,#86efac)' : 'linear-gradient(90deg,#f43f5e,#fb7185)' }} /><b style={{ left: `${lowerIsBetter ? 50 : target * 100}%` }} /></div>
      <span className={ok ? 'ok' : 'bad'}>{ok ? 'Within' : 'Outside'} target {lowerIsBetter ? '≤' : '≥'} {pct(target, target < 0.1 ? 1 : 0)}</span>
    </div>
  );
}

export function Landing({ signedIn }: { signedIn?: boolean }) {
  const [s, setS] = useState<Summary | null>(null);
  const [solid, setSolid] = useState(false);
  const [intro, setIntro] = useState(() => {
    try { if (matchMedia('(prefers-reduced-motion: reduce)').matches || sessionStorage.getItem('intro')) return false; sessionStorage.setItem('intro', '1'); } catch { /* ignore */ }
    return true;
  });
  // The intro fades out by CSS; remove it from the page afterwards so it can never block the view.
  useEffect(() => { if (!intro) return; const t = setTimeout(() => setIntro(false), 2800); return () => clearTimeout(t); }, [intro]);
  const [qr, setQr] = useState('');
  const [img, setImg] = useState<{ id: number; caption: string | null } | null>(null);
  const [gf, setGf] = useState('All');
  useEffect(() => { api.get<Summary>('/api/public/summary').then((x) => setS({ ...x, certificates: x.certificates || [], news: x.news || [], photos: x.photos || [] })).catch(() => setS({ tagline: '', year: new Date().getFullYear(), stats: null, certificates: [], news: [], photos: [] })); }, []);
  useEffect(() => { const f = () => setSolid(window.scrollY > 60); f(); window.addEventListener('scroll', f, { passive: true }); return () => window.removeEventListener('scroll', f); }, []);
  useEffect(() => { import('qrcode').then((Q) => Q.toDataURL(`${location.origin}/raise`, { margin: 1, width: 360, color: { dark: '#0b1f3a', light: '#ffffff' } }).then(setQr)).catch(() => {}); }, []);
  useReveal(s);
  const st = s?.stats;
  const y = s?.year || new Date().getFullYear();
  const photos = s?.photos || [];
  const find = (re: RegExp) => photos.find((p) => re.test(p.caption || ''));
  const award = find(/award presentation/i) || find(/Quality Performer/i);
  const welderPics = photos.filter((p) => /Welder/i.test(p.caption || '')).slice(0, 3);
  const scope = photos.find((p) => p.type === 'Infographic');
  const gallery = photos.filter((p) => p.type !== 'Infographic' && p !== award && !/medal|corporate poster/i.test(p.caption || ''));
  const types = ['All', ...Array.from(new Set(gallery.map((p) => p.type || 'Other')))];
  const shown = gf === 'All' ? gallery : gallery.filter((p) => (p.type || 'Other') === gf);
  const certs = s?.certificates || [];
  const fams = useMemo(() => Array.from(new Set(certs.map((c) => c.family))), [certs]);
  const ticker = certs.map((c) => c.name);

  return (
    <div className="lp">
      {intro && (
        <div className="lp-intro"><div className="mark"><Logo size={150} white /><div className="line" /><div className="tag">Quality Assurance · Quality Control</div></div></div>
      )}
      <nav className={`lp-nav ${solid ? 'solid' : ''}`}>
        <a href="#top" className="lbrand"><Logo size={56} white={!solid} /><span className="sep" /><span className="dept">QA/QC<br /><small>Department</small></span></a>
        <div className="links">
          <a className="lk" href="#performance">Performance</a>
          <a className="lk" href="#certifications">Certifications</a>
          <a className="lk" href="#recognition">Recognition</a>
          {!!s?.news.length && <a className="lk" href="#news">News</a>}
          <a className="lk" href="#gallery">Gallery</a>
          <Link className="btn sm lp-ghost" to="/raise"><Camera size={14} />Raise</Link>
          <Link className="btn primary sm" to={signedIn ? '/' : '/login'}><LogIn size={14} />{signedIn ? 'Open platform' : 'Sign in'}</Link>
        </div>
      </nav>

      <header className="lp-hero" id="top">
        <div className="bg" style={{ backgroundImage: 'url(/brand/hero.jpg), url(/brand/hero-sm.jpg)' }} />
        <div className="shade" />
        <div className="inner">
          <span className="pill"><ShieldCheck size={14} /> Trading and Agency Services · Doha, Qatar</span>
          <h1>Quality you can verify,<br /><span className="gr">on every work order.</span></h1>
          <p className="lead">The TRAGS QA/QC Department runs audits, inspections, welding control, training and certification for TRAGS, Qatar Factory for Gas and Petroleum Equipment and TRAGS Security Services, with every record traceable from site to management review.</p>
          <div className="cta">
            <Link className="btn primary lg" to={signedIn ? '/' : '/login'}>{signedIn ? 'Open platform' : 'Sign in to the platform'} <ArrowRight size={17} /></Link>
            <Link className="btn lg lp-ghost" to="/raise"><Camera size={17} /> Raise an observation</Link>
          </div>
          {!!ticker.length && <div className="trust">{Array.from(new Set(certs.filter((c) => /9001|14001|45001|17025|'U'|NB 'R'/.test(c.name)).map((c) => c.name.replace(/\s*\(.*\)/, '')))).slice(0, 7).map((n) => <span key={n}>{n}</span>)}</div>}
        </div>
        {st && (
          <div className="glass-stack">
            <div className="glass"><div className="gi" style={{ background: '#327cff' }}><Search size={18} /></div><div><b><CountUp value={st.rfis} ms={1600} /></b><span>RFIs inspected in {y}</span></div></div>
            <div className="glass"><div className="gi" style={{ background: '#8b5cf6' }}><Radiation size={18} /></div><div><b>{pct(st.repairRate, 2)}</b><span>Weld repair rate {y} · target ≤ 1.5%</span></div></div>
            <div className="glass"><div className="gi" style={{ background: '#14b8a6' }}><ClipboardCheck size={18} /></div><div><b><CountUp value={st.findingsTracked} ms={1600} /></b><span>Findings tracked{st.since ? ` since ${st.since}` : ''}</span></div></div>
          </div>
        )}
        <a href="#performance" className="scroll-cue" aria-label="Scroll"><ChevronDown size={22} /></a>
      </header>

      {!!ticker.length && (
        <div className="lp-ticker" aria-hidden>
          <div className="track">{[...ticker, ...ticker, ...ticker].map((t, i) => <span key={i}><ShieldCheck size={15} />{t}</span>)}</div>
        </div>
      )}

      {st && (
        <section className="lp-sec" id="performance">
          <div className="head reveal"><div className="eyebrow">Quality in numbers · {y}</div><h2>Measured every week, reviewed every month</h2>
            <p>Figures below are calculated live from the department registers: audits, findings, RFIs, weld radiography and training.</p></div>
          <div className="lp-kpis">
            {[
              { icon: ClipboardCheck, c: '#327cff', n: st.audits, l: 'Audits conducted', s: `Internal, project and supplier · ${y}` },
              { icon: BadgeCheck, c: '#22c55e', n: st.findingsClosed, l: 'Findings closed', s: `Raised in ${y} and verified closed` },
              { icon: Search, c: '#0ea5e9', n: st.rfis, l: 'RFIs inspected', s: `Request for inspection · ${y}` },
              { icon: Radiation, c: '#8b5cf6', n: st.films, l: 'Films radiographed', s: `${st.joints.toLocaleString()} joints · ${st.inchDia.toLocaleString()} inch-dia welded` },
              { icon: GraduationCap, c: '#f59e0b', n: st.trainings, l: 'Training sessions', s: `${st.participants.toLocaleString()} participants trained` },
              { icon: Trophy, c: '#ec4899', n: st.welderAwards, l: 'Welders recognised', s: 'Welder of the Month programme' },
              { icon: Users, c: '#14b8a6', n: st.team, l: 'QA/QC professionals', s: 'Engineers, inspectors and coordinators' },
              { icon: Briefcase, c: '#64748b', n: st.projects, l: 'Work orders covered', s: 'Active in the last 12 months' },
            ].map((k, i) => (
              <div key={k.l} className="lp-kpi reveal" style={{ transitionDelay: `${i * 50}ms` }}>
                <div className="ki" style={{ background: `${k.c}1a`, color: k.c }}><k.icon size={20} /></div>
                <div className="n"><CountUp value={k.n} ms={1500} /></div><div className="l">{k.l}</div><div className="s">{k.s}</div>
              </div>
            ))}
          </div>
          <div className="lp-targets">
            <div className="lp-target reveal"><Gauge size={20} color="#327cff" /><div className="grow"><div className="row" style={{ justifyContent: 'space-between' }}><b>RFI rejection rate</b><span className="big2">{pct(st.rfiRejection, 2)}</span></div><Meter value={st.rfiRejection} target={0.02} lowerIsBetter /></div></div>
            <div className="lp-target reveal"><Target size={20} color="#8b5cf6" /><div className="grow"><div className="row" style={{ justifyContent: 'space-between' }}><b>Weld repair rate (film)</b><span className="big2">{pct(st.repairRate, 2)}</span></div><Meter value={st.repairRate} target={0.015} lowerIsBetter /></div></div>
          </div>
        </section>
      )}

      <section className="lp-sec lp-dark" id="certifications">
        <div className="orb" style={{ width: 420, height: 420, right: -120, top: -120, background: 'radial-gradient(circle, rgba(50,124,255,.35), transparent 70%)' }} />
        <div className="head reveal"><div className="eyebrow">Certifications & accreditations</div><h2>Certified management systems and code stamps</h2>
          <p>{certs.length ? `${certs.length} active certifications across management systems, laboratory accreditation and ASME / National Board code stamps.` : 'Company certifications are listed here once published.'}</p></div>
        <div className="lp-certgrid">
          <div className="lp-certs">
            {fams.map((f) => (
              <div key={f} className="reveal">
                <div className="fam">{f}</div>
                <div className="lp-certlist">
                  {certs.filter((c) => c.family === f).map((c) => { const I = certIcon(c); return (
                    <div key={c.name} className="lp-cert"><div className="ci"><I size={18} /></div><div><b>{c.name}</b><span>{[c.body, c.site].filter(Boolean).join(' · ')}{c.expiry && /^\d{4}/.test(c.expiry) ? ` · valid to ${fmtDate(c.expiry)}` : ''}</span></div></div>
                  ); })}
                </div>
              </div>
            ))}
          </div>
          {scope && <figure className="lp-scope reveal" onClick={() => setImg(scope)}><img src={`/api/public/photo/${scope.id}`} alt="TRAGS certification scope" loading="lazy" /><figcaption>Certification scope</figcaption></figure>}
        </div>
      </section>

      <section className="lp-sec" id="hubs">
        <div className="head reveal"><div className="eyebrow">What the platform covers</div><h2>Six hubs, one quality picture</h2>
          <p>Registers that used to live in separate spreadsheets now share one database, one numbering system and one dashboard.</p></div>
        <div className="lp-hubs">
          {HUBS.map((h, i) => (
            <div key={h.t} className="lp-hub reveal" style={{ transitionDelay: `${i * 60}ms`, ['--c' as any]: h.c }}>
              <div className="hi"><h.icon size={22} /></div><h3>{h.t}</h3><p>{h.d}</p><span className="num">0{i + 1}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-sec lp-flow" id="flow">
        <div className="head reveal"><div className="eyebrow">How it works</div><h2>From a photo on site to a closed finding</h2>
          <p>Every observation follows the same controlled route, so nothing is lost between the site, QA/QC and management.</p></div>
        <div className="steps">
          {FLOW.map((f, i) => (
            <div key={f.k} className="step reveal" style={{ transitionDelay: `${i * 80}ms` }}>
              <div className="row" style={{ justifyContent: 'space-between' }}><span className="k">{f.k}</span><f.icon size={20} /></div>
              <h3>{f.t}</h3><p>{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {(award || welderPics.length > 0) && (
        <section className="lp-sec lp-gold" id="recognition">
          <div className="head reveal"><div className="eyebrow">Recognition</div><h2>Celebrating quality performance</h2>
            <p>The Quality Performer of the Year award recognises the team with the strongest quality record; the Welder of the Month programme recognises welders for productivity, quality and safe behaviour.</p></div>
          <div className="lp-award">
            {award && (
              <figure className="poster reveal" onClick={() => setImg(award)}>
                <img src={`/api/public/photo/${award.id}`} alt={award.caption || ''} loading="lazy" />
              </figure>
            )}
            <div className="col reveal" style={{ gap: 14 }}>
              <div className="lp-awardcard"><Trophy size={28} color="#f5b83d" /><div><b>Quality Performer of the Year 2025</b><span>Presented by the General Manager, Mr. Ivan Morgan, to the Combined Project Team led by Jad Azar, Project Manager.</span></div></div>
              <div className="lp-awardcard"><Award size={28} color="#f5b83d" /><div><b>Welder of the Month</b><span>{st?.welderAwards ? `${st.welderAwards} welders selected so far. ` : ''}Five welders a month are nominated by project leadership and reviewed by QA/QC.</span></div></div>
              {!!welderPics.length && <div className="lp-mini">{welderPics.map((p) => <img key={p.id} src={`/api/public/photo/${p.id}`} alt={p.caption || ''} loading="lazy" onClick={() => setImg(p)} />)}</div>}
            </div>
          </div>
        </section>
      )}

      {!!s?.news.length && (
        <section className="lp-sec" id="news">
          <div className="head reveal"><div className="eyebrow">TRAGS Times · Quality news</div><h2>Latest from the department</h2></div>
          <div className="lp-news">
            {s.news.map((n, i) => (
              <article key={n.title} className={`lp-newscard reveal ${i === 0 ? 'lead' : ''}`} style={{ transitionDelay: `${(i % 3) * 60}ms` }}>
                <div className="row" style={{ justifyContent: 'space-between' }}><span className="chip blue">{n.category}</span><span className="muted small row" style={{ gap: 4 }}><CalendarDays size={13} />{fmtDate(n.date)}</span></div>
                <h3>{n.title}</h3><p>{n.summary}</p>
                {n.location && <span className="muted small row" style={{ gap: 4 }}><MapPin size={13} />{n.location}</span>}
              </article>
            ))}
          </div>
        </section>
      )}

      {!!gallery.length && (
        <section className="lp-sec lp-dark" id="gallery">
          <div className="head reveal"><div className="eyebrow">Gallery</div><h2>Quality in action</h2></div>
          <div className="lp-filters">{types.map((t) => <button key={t} className={gf === t ? 'on' : ''} onClick={() => setGf(t)}>{t}</button>)}</div>
          <div className="lp-masonry">
            {shown.map((p) => (
              <figure key={p.id} onClick={() => setImg(p)}><img src={`/api/public/photo/${p.id}`} alt={p.caption || 'TRAGS QA/QC'} loading="lazy" />{p.caption && <figcaption>{p.caption}</figcaption>}</figure>
            ))}
          </div>
        </section>
      )}

      <section className="lp-sec">
        <div className="lp-raise reveal">
          <div>
            <div className="eyebrow">Seen something?</div>
            <h2>Raise an observation in under a minute</h2>
            <p>Scan the code or open the form on your phone. Add a photo and a short description. QA/QC reviews it and follows it up.</p>
            <Link className="btn primary lg" to="/raise"><Camera size={17} /> Open the quick form</Link>
          </div>
          {qr && <img src={qr} alt="QR code for the quick-raise form" className="qr hide-sm" />}
        </div>
      </section>

      <footer className="lp-foot">
        <div className="cols">
          <div><Logo size={70} white /><p>QA/QC Department<br />Trading and Agency Services Limited Company W.L.L.<br />Doha, State of Qatar</p></div>
          <div><b>Group entities</b><span>Trading and Agency Services (TRAGS)</span><span>Qatar Factory for Gas and Petroleum Equipment</span><span>TRAGS Security Services</span></div>
          <div><b>Platform</b><Link to={signedIn ? '/' : '/login'}>Sign in</Link><Link to="/raise">Raise an observation</Link><a href="#certifications">Certifications</a><a href="#news">News</a></div>
        </div>
        <div className="base"><span>© {new Date().getFullYear()} TRAGS · QA/QC Department</span><span><Newspaper size={13} /> Internal platform · accounts issued by QA/QC</span></div>
      </footer>

      {img && <div className="overlay center" onClick={() => setImg(null)}><div className="lightbox"><button className="ghost" style={{ position: 'absolute', right: 8, top: 8 }} aria-label="Close"><X size={18} /></button><img src={`/api/public/photo/${img.id}`} alt={img.caption || ''} />{img.caption && <div className="small">{img.caption}</div>}</div></div>}
    </div>
  );
}

export default Landing;
