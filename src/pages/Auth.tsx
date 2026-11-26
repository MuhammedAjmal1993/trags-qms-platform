import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Camera } from 'lucide-react';
import { Logo } from '../components/Brand';
import { api } from '../api';
import { useApp } from '../ctx';

export function Login() {
  const { refresh } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await api.post('/api/auth/login', { email, password }); await refresh(); } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <div className="auth">
      <Link className="back row" to="/"><ArrowLeft size={16} /> Back to showcase</Link>
      <form className="card col" onSubmit={submit} style={{ gap: 12 }}>
        <div className="row" style={{ gap: 12, marginBottom: 4 }}><Logo size={46} /><div><h1 style={{ margin: 0 }}>Welcome back</h1><div className="muted small">TRAGS Quality Management Platform</div></div></div>
        <label className="f">Email<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="f">Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {err && <div className="red small">{err}</div>}
        <button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <div className="muted small">Accounts are created by the platform administrator.</div>
        <Link className="btn" to="/raise" style={{ justifyContent: 'center' }}><Camera size={15} /> Raise an observation without an account</Link>
      </form>
    </div>
  );
}

export function Setup() {
  const { refresh } = useApp();
  const [f, setF] = useState({ code: '', name: '', email: '', password: '', confirm: '' });
  const [err, setErr] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    if (f.password !== f.confirm) return setErr('Passwords do not match.');
    try { await api.post('/api/auth/setup', f); await refresh(); } catch (x: any) { setErr(x.message); }
  };
  return (
    <div className="auth">
      <form className="card col" onSubmit={submit} style={{ gap: 12 }}>
        <Logo size={46} />
        <h1>First-time setup</h1>
        <div className="muted small">Create the administrator account. The one-time setup code was supplied with the deployment.</div>
        <label className="f">Setup code<input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} required /></label>
        <label className="f">Full name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></label>
        <label className="f">Email<input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></label>
        <label className="f">Password (min 10, letters and numbers)<input type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></label>
        <label className="f">Confirm password<input type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} required /></label>
        {err && <div className="red small">{err}</div>}
        <button className="primary">Create administrator</button>
      </form>
    </div>
  );
}

export function ChangePassword({ forced }: { forced?: boolean }) {
  const { refresh, toast } = useApp();
  const nav = useNavigate();
  const [f, setF] = useState({ current: '', password: '', confirm: '' });
  const [err, setErr] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    if (f.password !== f.confirm) return setErr('Passwords do not match.');
    try { await api.post('/api/auth/password', f); toast('Password changed.'); await refresh(); nav('/'); location.reload(); } catch (x: any) { setErr(x.message); }
  };
  const body = (
    <form className="card col" onSubmit={submit} style={{ maxWidth: 420 }}>
      <h1>Change password</h1>
      {forced && <div className="muted small">Set your own password before continuing.</div>}
      <label className="f">Current password<input type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} required /></label>
      <label className="f">New password (min 10, letters and numbers)<input type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></label>
      <label className="f">Confirm new password<input type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} required /></label>
      {err && <div className="red small">{err}</div>}
      <button className="primary">Save password</button>
    </form>
  );
  return forced ? <div className="auth">{body}</div> : body;
}
