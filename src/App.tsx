import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useApp } from './ctx';
import { api } from './api';
import { Login, Setup, ChangePassword } from './pages/Auth';
import Dashboard from './pages/Dashboard';
import RegisterPage from './pages/RegisterPage';
import { WorkOrders, WorkOrderDetail } from './pages/WorkOrders';
import Ingest from './pages/Ingest';
import Documents from './pages/Documents';
import Plans from './pages/Plans';
import Reports from './pages/Reports';
import Admin from './pages/Admin';
import { MODULE_OF_REGISTER } from '../shared/registers';

const GROUPS: { label: string; modules: string[] }[] = [
  { label: 'Audits', modules: ['audits'] },
  { label: 'Findings', modules: ['findings'] },
  { label: 'Inspections', modules: ['inspections'] },
  { label: 'Welding', modules: ['welding'] },
  { label: 'Training', modules: ['training'] },
  { label: 'Customer Feedback', modules: ['feedback'] },
];

function Shell() {
  const { user, registers, can, refresh } = useApp();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const logout = async () => { await api.post('/api/auth/logout'); await refresh(); nav('/login'); };
  const search = (e: React.FormEvent) => {
    e.preventDefault();
    const v = q.trim();
    if (/^\d{7}$/.test(v)) nav(`/wo/${v}`);
    else if (v) nav(`/r/FND?q=${encodeURIComponent(v)}`);
  };
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand"><div className="logo">Q</div><div><b>TRAGS QMS</b><span>Quality Management Platform</span></div></div>
        {can('dashboard') && <NavLink className="nav" to="/" end>Dashboard</NavLink>}
        {can('workorders') && <NavLink className="nav" to="/wo">Projects &amp; Work Orders</NavLink>}
        {GROUPS.map((g) => {
          const regs = registers.filter((r) => g.modules.includes(MODULE_OF_REGISTER[r.code]));
          if (!regs.length) return null;
          return (
            <div key={g.label}>
              <div className="nav-group">{g.label}</div>
              {regs.map((r) => <NavLink key={r.code} className="nav" to={`/r/${r.code}`}><span>{r.name.replace(/^\d+\s/, '')}</span><span className="count">{r.count}</span></NavLink>)}
            </div>
          );
        })}
        <div className="nav-group">Data &amp; outputs</div>
        {can('ingest') && <NavLink className="nav" to="/ingest">Upload Center</NavLink>}
        {can('reports') && <NavLink className="nav" to="/reports">Reports &amp; Exports</NavLink>}
        <div className="nav-group">QMS</div>
        {can('documents') && <NavLink className="nav" to="/documents">Document Library</NavLink>}
        {can('plans') && <NavLink className="nav" to="/plans">Plans &amp; Objectives</NavLink>}
        {can('admin') && <><div className="nav-group">Administration</div><NavLink className="nav" to="/admin">Admin Panel</NavLink></>}
      </aside>
      <div className="main">
        <div className="topbar">
          <form onSubmit={search} className="row grow"><input style={{ width: 340 }} placeholder="Search WON (7 digits) or finding text / report no." value={q} onChange={(e) => setQ(e.target.value)} /></form>
          <span className="muted small">{user?.name} · {user?.role}</span>
          <button className="sm" onClick={() => nav('/password')}>Password</button>
          <button className="sm" onClick={logout}>Sign out</button>
        </div>
        <div className="content">
          <Routes>
            <Route path="/" element={can('dashboard') ? <Dashboard /> : <Navigate to="/wo" />} />
            <Route path="/wo" element={<WorkOrders />} />
            <Route path="/wo/:won" element={<WorkOrderDetail />} />
            <Route path="/r/:code" element={<RegisterPage />} />
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
