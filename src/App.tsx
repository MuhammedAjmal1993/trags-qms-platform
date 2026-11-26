import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useApp } from './ctx';
import { api } from './api';
import { Login, Setup, ChangePassword } from './pages/Auth';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import Insights from './pages/Insights';
import RegisterPage from './pages/RegisterPage';
import { WorkOrders, WorkOrderDetail } from './pages/WorkOrders';
import Ingest from './pages/Ingest';
import Documents from './pages/Documents';
import Plans from './pages/Plans';
import Reports from './pages/Reports';
import Admin from './pages/Admin';
import { Hub, Disposition, OrgChart, Library, Photos, Showcase } from './pages/Hubs';
import { NAV } from './nav';

function Side() {
  const { can, registers } = useApp();
  const loc = useLocation();
  const counts = Object.fromEntries(registers.map((r) => [r.code, r.count]));
  const [open, setOpen] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem('nav') || '{}'); } catch { return {}; } });
  const toggle = (id: string) => { const n = { ...open, [id]: !isOpen(id) }; setOpen(n); try { localStorage.setItem('nav', JSON.stringify(n)); } catch { /* ignore */ } };
  const active = (g: typeof NAV[number]) => g.items.some((i) => loc.pathname + loc.search === i.to || loc.pathname === i.to.split('?')[0]);
  const isOpen = (id: string) => (open[id] === undefined ? id === 'insight' : open[id]);
  return (
    <aside className="side">
      <div className="brand"><div className="logo">Q</div><div><b>TRAGS QA/QC</b><span>Quality Management Platform</span></div></div>
      <NavLink className="nav home" to="/" end>⌂ Home</NavLink>
      {NAV.map((g) => {
        const items = g.items.filter((i) => can(i.module));
        if (!items.length) return null;
        const o = isOpen(g.id) || active(g);
        return (
          <div key={g.id} className="nav-sec">
            <button className={`nav-head ${active(g) ? 'on' : ''}`} onClick={() => toggle(g.id)}><span>{g.icon} {g.label}</span><span className="caret">{o ? '▾' : '▸'}</span></button>
            {o && items.map((i) => (
              <NavLink key={i.to} className="nav" to={i.to} end={!i.to.includes('?')}>
                <span>{i.label}</span>{i.register && counts[i.register] !== undefined && <span className="count">{counts[i.register]}</span>}
              </NavLink>
            ))}
          </div>
        );
      })}
      {can('admin') && <NavLink className="nav admin" to="/admin">⚙ Admin Panel</NavLink>}
    </aside>
  );
}

function Shell() {
  const { user, refresh } = useApp();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const logout = async () => { await api.post('/api/auth/logout'); await refresh(); nav('/'); };
  const search = (e: React.FormEvent) => {
    e.preventDefault();
    const v = q.trim();
    if (/^\d{7}$/.test(v)) nav(`/wo/${v}`);
    else if (v) nav(`/r/FND?q=${encodeURIComponent(v)}&year=`);
  };
  return (
    <div className="shell">
      <Side />
      <div className="main">
        <div className="topbar">
          <form onSubmit={search} className="row grow"><input style={{ width: 'min(360px, 60vw)' }} placeholder="Search WON (7 digits), report no. or finding text" value={q} onChange={(e) => setQ(e.target.value)} /></form>
          <span className="muted small hide-sm">{user?.name} · {user?.role}</span>
          <button className="sm" onClick={() => nav('/password')}>Password</button>
          <button className="sm" onClick={logout}>Sign out</button>
        </div>
        <div className="content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/insights" element={<Insights />} />
            <Route path="/wo" element={<WorkOrders />} />
            <Route path="/wo/:won" element={<WorkOrderDetail />} />
            <Route path="/r/:code" element={<RegisterPage />} />
            <Route path="/hub/:hub" element={<Hub />} />
            <Route path="/disposition" element={<Disposition />} />
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
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
      </div>
    </div>
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
  if (loading) return <div className="auth"><div className="card">Loading…</div></div>;
  return (
    <BrowserRouter>
      {needsSetup ? <Setup /> : !user ? <Routes><Route path="*" element={<Login />} /></Routes> : user.must_change_pw || mustChange ? <ChangePassword forced /> : <Shell />}
    </BrowserRouter>
  );
}
