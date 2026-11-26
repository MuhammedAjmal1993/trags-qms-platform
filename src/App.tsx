import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Home as HomeIcon, Settings, Search, Menu, ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen, LogOut, KeyRound, Globe, Camera } from 'lucide-react';
import { useApp } from './ctx';
import { api, clearCache, useSWR } from './api';
import { Login, Setup, ChangePassword } from './pages/Auth';
import { Logo } from './components/Brand';
import { PageSkeleton } from './components/ui';

// Pages load on demand so the first screen arrives quickly.
const L = <T extends Record<string, any>>(f: () => Promise<T>, k: keyof T = 'default') => lazy<React.ComponentType<any>>(() => f().then((m) => ({ default: m[k] as React.ComponentType<any> })));
const Home = L(() => import('./pages/Home'));
const Dashboard = L(() => import('./pages/Dashboard'));
const Insights = L(() => import('./pages/Insights'));
const RegisterPage = L(() => import('./pages/RegisterPage'));
const WorkOrders = L(() => import('./pages/WorkOrders'), 'WorkOrders');
const WorkOrderDetail = L(() => import('./pages/WorkOrders'), 'WorkOrderDetail');
const Ingest = L(() => import('./pages/Ingest'));
const Documents = L(() => import('./pages/Documents'));
const Plans = L(() => import('./pages/Plans'));
const Reports = L(() => import('./pages/Reports'));
const Admin = L(() => import('./pages/Admin'));
const Review = L(() => import('./pages/Review'));
const QrPosters = L(() => import('./pages/Review'), 'QrPosters');
const Landing = L(() => import('./pages/Public'), 'Landing');
const QuickRaise = L(() => import('./pages/Public'), 'QuickRaise');
const Hub = L(() => import('./pages/Hubs'), 'Hub');
const Disposition = L(() => import('./pages/Hubs'), 'Disposition');
const OrgChart = L(() => import('./pages/Hubs'), 'OrgChart');
const Library = L(() => import('./pages/Hubs'), 'Library');
const Photos = L(() => import('./pages/Hubs'), 'Photos');
const Showcase = L(() => import('./pages/Hubs'), 'Showcase');
const Blank = () => <div style={{ minHeight: '100vh', background: '#061a33' }} />;
import { NAV } from './nav';

function Side({ rail, onRail, onNavigate }: { rail: boolean; onRail: () => void; onNavigate: () => void }) {
  const { can, registers } = useApp();
  const loc = useLocation();
  const { data: home } = useSWR<any>('/api/stats/home');
  const counts = Object.fromEntries(registers.map((r) => [r.code, r.count]));
  const badges: Record<string, number> = { review: home?.review || 0 };
  const [open, setOpen] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem('nav') || '{}'); } catch { return {}; } });
  const isOpen = (id: string) => (open[id] === undefined ? id === 'insight' : open[id]);
  const toggle = (id: string) => { const n = { ...open, [id]: !isOpen(id) }; setOpen(n); try { localStorage.setItem('nav', JSON.stringify(n)); } catch { /* ignore */ } };
  const active = (g: typeof NAV[number]) => g.items.some((i) => loc.pathname + loc.search === i.to || loc.pathname === i.to.split('?')[0]);
  return (
    <aside className="side" onClick={(e) => { if ((e.target as HTMLElement).closest('a.nav')) onNavigate(); }}>
      <div className="brand"><div className="logo"><Logo size={34} /></div><div><b>TRAGS QA/QC</b><span>Quality Management Platform</span></div></div>
      <NavLink className="nav" to="/" end title="Home"><HomeIcon size={17} /><span className="lbl">Home</span></NavLink>
      {NAV.map((g) => {
        const items = g.items.filter((i) => can(i.module));
        if (!items.length) return null;
        const o = rail || isOpen(g.id) || active(g);
        return (
          <div key={g.id} className="nav-sec">
            <button className={`nav-head ${active(g) ? 'on' : ''}`} onClick={() => toggle(g.id)}>
              <span className="hl"><span className="hdot" style={{ background: g.color }} />{g.label}</span>{o ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
            {o && items.map((i) => {
              const b = i.badge ? badges[i.badge] : 0;
              return (
                <NavLink key={i.to} className="nav" to={i.to} end={!i.to.includes('?')} title={i.label}>
                  <i.icon size={17} /><span className="lbl">{i.label}</span>
                  {b ? <span className="badge">{b}</span> : i.register && counts[i.register] !== undefined ? <span className="count">{counts[i.register]}</span> : null}
                </NavLink>
              );
            })}
          </div>
        );
      })}
      {can('admin') && <div className="nav-sec"><NavLink className="nav" to="/admin" title="Admin panel"><Settings size={17} /><span className="lbl">Admin Panel</span></NavLink></div>}
      <button className="sm rail-btn hide-sm" onClick={onRail} title={rail ? 'Expand menu' : 'Collapse menu'}>{rail ? <PanelLeftOpen size={15} /> : <><PanelLeftClose size={15} /><span className="lbl">Collapse</span></>}</button>
    </aside>
  );
}

function Shell() {
  const { user, refresh } = useApp();
  const nav = useNavigate();
  const loc = useLocation();
  const [q, setQ] = useState('');
  const [rail, setRail] = useState(() => { try { return localStorage.getItem('rail') === '1'; } catch { return false; } });
  const [mob, setMob] = useState(false);
  const [menu, setMenu] = useState(false);
  useEffect(() => { setMob(false); setMenu(false); window.scrollTo(0, 0); }, [loc.pathname]);
  const toggleRail = () => { setRail(!rail); try { localStorage.setItem('rail', rail ? '0' : '1'); } catch { /* ignore */ } };
  const logout = async () => { await api.post('/api/auth/logout'); clearCache(); await refresh(); nav('/'); };
  const search = (e: React.FormEvent) => {
    e.preventDefault();
    const v = q.trim();
    if (/^\d{7}$/.test(v)) nav(`/wo/${v}`);
    else if (v) nav(`/r/FND?q=${encodeURIComponent(v)}&year=`);
  };
  const initials = (user?.name || '?').split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className={`shell ${rail ? 'rail' : ''} ${mob ? 'mobile-open' : ''}`}>
      <Side rail={rail} onRail={toggleRail} onNavigate={() => setMob(false)} />
      {mob && <div className="overlay only-sm" style={{ zIndex: 55 }} onClick={() => setMob(false)} />}
      <div className="main">
        <div className="topbar">
          <button className="ghost only-sm" onClick={() => setMob(true)} aria-label="Menu"><Menu size={20} /></button>
          <form onSubmit={search} className="search"><Search size={15} /><input placeholder="Search WON (7 digits), report no. or finding text" value={q} onChange={(e) => setQ(e.target.value)} /></form>
          <span className="grow" />
          <a className="btn sm hide-sm" href="/raise" target="_blank" rel="noreferrer"><Camera size={14} /> Quick raise</a>
          <div style={{ position: 'relative' }}>
            <button className="ghost" onClick={() => setMenu(!menu)} style={{ padding: 2, gap: 8 }}>
              <span className="avatar">{initials}</span>
              <span className="hide-sm" style={{ textAlign: 'left', lineHeight: 1.2 }}><b style={{ display: 'block', fontSize: 12.5, color: 'var(--navy)' }}>{user?.name}</b><span className="muted" style={{ fontSize: 11 }}>{user?.role}</span></span>
              <ChevronDown size={14} />
            </button>
            {menu && (
              <div className="card" style={{ position: 'absolute', right: 0, top: 46, width: 210, padding: 6, zIndex: 40 }} onMouseLeave={() => setMenu(false)}>
                <button className="ghost" style={{ width: '100%' }} onClick={() => nav('/welcome')}><Globe size={15} /> Showcase page</button>
                <button className="ghost" style={{ width: '100%' }} onClick={() => nav('/password')}><KeyRound size={15} /> Change password</button>
                <button className="ghost" style={{ width: '100%', color: 'var(--red)' }} onClick={logout}><LogOut size={15} /> Sign out</button>
              </div>
            )}
          </div>
        </div>
        <div className="content" key={loc.pathname}>
          <Suspense fallback={<PageSkeleton />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/insights" element={<Insights />} />
            <Route path="/wo" element={<WorkOrders />} />
            <Route path="/wo/:won" element={<WorkOrderDetail />} />
            <Route path="/r/:code" element={<RegisterPage />} />
            <Route path="/hub/:hub" element={<Hub />} />
            <Route path="/disposition" element={<Disposition />} />
            <Route path="/review" element={<Review />} />
            <Route path="/qr" element={<QrPosters />} />
            <Route path="/orgchart" element={<OrgChart />} />
            <Route path="/library" element={<Library />} />
            <Route path="/photos" element={<Photos />} />
            <Route path="/showcase" element={<Showcase />} />
            <Route path="/ingest" element={<Ingest />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/plans" element={<Plans />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/password" element={<ChangePassword />} />
            <Route path="/login" element={<Navigate to="/" />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
          </Suspense>
        </div>
      </div>
    </div>
  );
}

function Public() {
  return (
    <Suspense fallback={<Blank />}>
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/welcome" element={<Landing />} />
      <Route path="/raise" element={<QuickRaise />} />
      <Route path="*" element={<Login />} />
    </Routes>
    </Suspense>
  );
}

export default function App() {
  const { user, loading, needsSetup } = useApp();
  const [mustChange, setMustChange] = useState(false);
  useEffect(() => {
    const f = () => setMustChange(true);
    window.addEventListener('auth:mustchange', f);
    return () => window.removeEventListener('auth:mustchange', f);
  }, []);
  const path = location.pathname;
  // Public pages render without waiting for the session check.
  if (path === '/raise') return <BrowserRouter><Suspense fallback={<Blank />}><Routes><Route path="*" element={<QuickRaise />} /></Routes></Suspense></BrowserRouter>;
  if (loading) return <div className="auth"><div className="row" style={{ color: '#fff', gap: 12 }}><Logo size={44} /><span className="spinner" /></div></div>;
  return (
    <BrowserRouter>
      {needsSetup ? <Setup />
        : !user ? <Public />
        : user.must_change_pw || mustChange ? <ChangePassword forced />
        : <Suspense fallback={<Blank />}><Routes><Route path="/welcome" element={<Landing signedIn />} /><Route path="/raise" element={<QuickRaise />} /><Route path="*" element={<Shell />} /></Routes></Suspense>}
    </BrowserRouter>
  );
}
