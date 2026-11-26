import { useEffect, useState } from 'react';
import { api, fileUrl } from '../api';
import { useApp } from '../ctx';
import { Drawer, Spinner, Confirm } from '../components/ui';
import { MODULES, ACTIONS, type RegisterConfig, type Column } from '../../shared/registers';
import { forgetLogo } from '../components/Brand';
import { listPdfFields, F271_DEFAULT_MAP, type FieldMapEntry } from '../lib/forms';

const TABS = ['Users', 'Roles & permissions', 'Registers', 'Numbering', 'Form templates', 'Settings', 'Audit log'] as const;

export default function Admin() {
  const { can } = useApp();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Users');
  if (!can('admin')) return <div className="empty">Administrator access required.</div>;
  return (
    <div>
      <div className="page-head"><div><h1>Admin Panel</h1><div className="muted small">Users, roles and access rights, register configuration, numbering, templates and the activity log.</div></div></div>
      <div className="tabs">{TABS.map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
      {tab === 'Users' && <Users />}
      {tab === 'Roles & permissions' && <Roles />}
      {tab === 'Registers' && <Registers />}
      {tab === 'Numbering' && <Numbering />}
      {tab === 'Form templates' && <Templates />}
      {tab === 'Settings' && <Settings />}
      {tab === 'Audit log' && <AuditLog />}
    </div>
  );
}

function Users() {
  const { toast } = useApp();
  const [users, setUsers] = useState<any[] | null>(null);
  const [roles, setRoles] = useState<any[]>([]);
  const [edit, setEdit] = useState<any>(null);
  const load = () => Promise.all([api.get('/api/admin/users'), api.get('/api/admin/roles')]).then(([u, r]) => { setUsers(u); setRoles(r); });
  useEffect(() => { load(); }, []);
  const save = async () => {
    try {
      if (edit.id) await api.put(`/api/admin/users/${edit.id}`, edit);
      else await api.post('/api/admin/users', edit);
      toast(edit.id ? 'User updated.' : 'User created. They must change the initial password at first sign-in.');
      setEdit(null); load();
    } catch (e: any) { toast(e.message, 'err'); }
  };
  if (!users) return <Spinner />;
  return (
    <div>
      <button className="primary" style={{ marginBottom: 10 }} onClick={() => setEdit({ role_id: roles.find((r) => r.name === 'Site Inspector')?.id })}>+ New user</button>
      <table className="plain"><thead><tr><th>Name</th><th>Email</th><th>Title</th><th>Site</th><th>Role</th><th>Status</th><th>Last sign-in</th></tr></thead><tbody>
        {users.map((u) => <tr key={u.id} onClick={() => setEdit({ ...u, password: '' })} style={{ cursor: 'pointer' }}><td><b>{u.name}</b></td><td>{u.email}</td><td>{u.title}</td><td>{u.site}</td><td>{u.role}</td>
          <td>{u.active ? <span className="chip closed">Active</span> : <span className="chip red">Disabled</span>} {u.must_change_pw ? <span className="chip">Must change password</span> : null}</td><td className="small">{u.last_login}</td></tr>)}
      </tbody></table>
      {edit && (
        <Drawer title={edit.id ? `Edit ${edit.name}` : 'New user'} onClose={() => setEdit(null)} footer={<><button onClick={() => setEdit(null)}>Cancel</button><button className="primary" onClick={save}>Save</button></>}>
          <div className="form-grid">
            <label className="f">Full name<input value={edit.name || ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
            <label className="f">Email<input type="email" value={edit.email || ''} disabled={!!edit.id} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></label>
            <label className="f">Job title<input value={edit.title || ''} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></label>
            <label className="f">Site / location<select value={edit.site || ''} onChange={(e) => setEdit({ ...edit, site: e.target.value })}><option value="" /><option>Doha</option><option>Mesaieed</option><option>Ras Laffan</option><option>Dukhan</option><option>Offshore</option><option>Workshop</option></select></label>
            <label className="f">Role<select value={edit.role_id || ''} onChange={(e) => setEdit({ ...edit, role_id: Number(e.target.value) })}>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
            {edit.id && <label className="f">Status<select value={edit.active ? 1 : 0} onChange={(e) => setEdit({ ...edit, active: Number(e.target.value) })}><option value={1}>Active</option><option value={0}>Disabled</option></select></label>}
            <label className="f full">{edit.id ? 'Reset password (leave blank to keep)' : 'Initial password (user must change it at first sign-in)'}<input type="password" autoComplete="new-password" value={edit.password || ''} onChange={(e) => setEdit({ ...edit, password: e.target.value })} /></label>
          </div>
          <p className="muted small">Passwords need at least 10 characters with letters and numbers. Hand the initial password to the user directly; it is not shown again.</p>
        </Drawer>
      )}
    </div>
  );
}

function Roles() {
  const { toast } = useApp();
  const [roles, setRoles] = useState<any[] | null>(null);
  const [edit, setEdit] = useState<any>(null);
  const load = () => api.get('/api/admin/roles').then(setRoles);
  useEffect(() => { load(); }, []);
  const toggle = (m: string, a: string) => {
    const p = { ...edit.permissions };
    const s = new Set<string>(p[m] || []);
    s.has(a) ? s.delete(a) : s.add(a);
    p[m] = [...s];
    setEdit({ ...edit, permissions: p });
  };
  const save = async () => { try { edit.id ? await api.put(`/api/admin/roles/${edit.id}`, edit) : await api.post('/api/admin/roles', edit); toast('Role saved.'); setEdit(null); load(); } catch (e: any) { toast(e.message, 'err'); } };
  if (!roles) return <Spinner />;
  return (
    <div>
      <button className="primary" style={{ marginBottom: 10 }} onClick={() => setEdit({ name: '', description: '', permissions: {} })}>+ New role</button>
      <table className="plain"><thead><tr><th>Role</th><th>Description</th><th>Users</th></tr></thead><tbody>
        {roles.map((r) => <tr key={r.id} onClick={() => setEdit(r)} style={{ cursor: 'pointer' }}><td><b>{r.name}</b> {r.is_system ? <span className="chip">system</span> : null}</td><td>{r.description}</td><td>{r.users}</td></tr>)}
      </tbody></table>
      {edit && (
        <Drawer wide title={edit.id ? `Role: ${edit.name}` : 'New role'} onClose={() => setEdit(null)} footer={<>
          {edit.id && !edit.is_system && <button className="danger" onClick={async () => { try { await api.del(`/api/admin/roles/${edit.id}`); setEdit(null); load(); } catch (e: any) { toast(e.message, 'err'); } }}>Delete role</button>}
          <span style={{ flex: 1 }} /><button onClick={() => setEdit(null)}>Cancel</button><button className="primary" onClick={save}>Save</button></>}>
          <div className="form-grid" style={{ marginBottom: 12 }}>
            <label className="f">Name<input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
            <label className="f full">Description<input value={edit.description || ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></label>
          </div>
          <table className="plain"><thead><tr><th>Module</th>{ACTIONS.map((a) => <th key={a}>{a}</th>)}</tr></thead><tbody>
            {MODULES.map((m) => <tr key={m}><td><b>{m}</b></td>{ACTIONS.map((a) => <td key={a}><input type="checkbox" checked={(edit.permissions[m] || []).includes(a)} onChange={() => toggle(m, a)} /></td>)}</tr>)}
          </tbody></table>
        </Drawer>
      )}
    </div>
  );
}

function Registers() {
  const { registers, refreshRegisters, toast } = useApp();
  const [code, setCode] = useState(registers[0]?.code || '');
  const [cfg, setCfg] = useState<RegisterConfig | null>(null);
  const [listCol, setListCol] = useState<Column | null>(null);
  useEffect(() => { if (code) api.get(`/api/registers/${code}`).then(setCfg); }, [code]);
  if (!cfg) return <Spinner />;
  const upd = (i: number, patch: Partial<Column>) => setCfg({ ...cfg, columns: cfg.columns.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const move = (i: number, d: number) => { const cols = [...cfg.columns]; const [x] = cols.splice(i, 1); cols.splice(Math.max(0, Math.min(cols.length, i + d)), 0, x); setCfg({ ...cfg, columns: cols }); };
  const save = async () => { try { await api.put(`/api/admin/registers/${code}`, cfg); toast('Register configuration saved.'); refreshRegisters(); } catch (e: any) { toast(e.message, 'err'); } };
  return (
    <div>
      <div className="row" style={{ marginBottom: 10 }}>
        <select value={code} onChange={(e) => setCode(e.target.value)}>{registers.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}</select>
        <label className="f">Register name<input value={cfg.name} onChange={(e) => setCfg({ ...cfg, name: e.target.value })} /></label>
        <label className="f">Duplicate key (column keys, comma separated)<input value={cfg.keyFields.join(',')} onChange={(e) => setCfg({ ...cfg, keyFields: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} /></label>
        <button onClick={() => setCfg({ ...cfg, columns: [...cfg.columns, { key: `col_${cfg.columns.length + 1}`, label: 'New column', type: 'text' }] })}>+ Column</button>
        <button className="primary" onClick={save}>Save configuration</button>
      </div>
      <div className="grid-wrap">
        <table className="grid"><thead><tr><th>#</th><th>Header (Excel label)</th><th>Key</th><th>Type</th><th>Role</th><th>Required</th><th>Hidden</th><th>Dropdown list</th><th>Import aliases</th><th /></tr></thead><tbody>
          {cfg.columns.map((c, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td><input value={c.label} onChange={(e) => upd(i, { label: e.target.value })} style={{ width: 240 }} /></td>
              <td><input value={c.key} onChange={(e) => upd(i, { key: e.target.value.replace(/[^a-z0-9_]/g, '') })} style={{ width: 130 }} /></td>
              <td><select value={c.type} onChange={(e) => upd(i, { type: e.target.value as any })}>{['text', 'textarea', 'number', 'percent', 'date', 'select', 'computed', 'uid'].map((t) => <option key={t}>{t}</option>)}</select>{c.type === 'computed' && <input value={c.compute || ''} placeholder="month(x)" onChange={(e) => upd(i, { compute: e.target.value })} style={{ width: 150 }} />}</td>
              <td><input value={c.role || ''} onChange={(e) => upd(i, { role: (e.target.value || undefined) as any })} style={{ width: 100 }} /></td>
              <td><input type="checkbox" checked={!!c.required} onChange={(e) => upd(i, { required: e.target.checked })} /></td>
              <td><input type="checkbox" checked={!!c.hidden} onChange={(e) => upd(i, { hidden: e.target.checked })} /></td>
              <td>{c.type === 'select' && <button className="sm" onClick={() => setListCol({ ...c, key: String(i) })}>{(c.options || []).length} values</button>}</td>
              <td><input value={(c.aliases || []).join('; ')} onChange={(e) => upd(i, { aliases: e.target.value.split(';').map((s) => s.trim()).filter(Boolean) })} style={{ width: 160 }} /></td>
              <td className="row" style={{ flexWrap: 'nowrap' }}><button className="sm" onClick={() => move(i, -1)}>↑</button><button className="sm" onClick={() => move(i, 1)}>↓</button><button className="sm danger" onClick={() => setCfg({ ...cfg, columns: cfg.columns.filter((_, j) => j !== i) })}>✕</button></td>
            </tr>))}
        </tbody></table>
      </div>
      <p className="muted small">Roles link a column to dashboards and sync rules: uid, won, client, status, category, sub_category, ext_int, finding_type, report_no, process, criticality, plan_date, actual_date, close_date, due_date, num1–num4, description, finding_no. Removing a column hides it; stored values are kept.</p>
      {listCol && (
        <Drawer title={`Dropdown list: ${listCol.label}`} onClose={() => setListCol(null)} footer={<button className="primary" onClick={() => setListCol(null)}>Done</button>}>
          <p className="muted small">One value per line, spelled exactly as in the Validation sheet (trailing spaces are kept).</p>
          <textarea style={{ width: '100%', minHeight: 420, fontFamily: 'Consolas, monospace' }} value={(cfg.columns[Number(listCol.key)].options || []).join('\n')}
            onChange={(e) => upd(Number(listCol.key), { options: e.target.value.split('\n').filter((s) => s !== '') })} />
        </Drawer>
      )}
    </div>
  );
}

function Numbering() {
  const { toast } = useApp();
  const [rows, setRows] = useState<any[] | null>(null);
  const [edit, setEdit] = useState<any>(null);
  const load = () => api.get('/api/admin/numbering').then(setRows);
  useEffect(() => { load(); }, []);
  const save = async () => { try { await api.put(`/api/admin/numbering/${edit.code}`, edit); toast('Numbering saved.'); setEdit(null); load(); } catch (e: any) { toast(e.message, 'err'); } };
  if (!rows) return <Spinner />;
  return (
    <div>
      <p className="muted small">Patterns: {'{NNN}'} sequence (zero padded), {'{YY}'} / {'{YYYY}'} year. The counter never falls behind the highest number already in the register. Numbers are assigned when a record is saved (UIDs) or with the "Next #" button.</p>
      <button className="primary" style={{ marginBottom: 10 }} onClick={() => setEdit({ code: '', label: '', pattern: '{NNN}-XX-{YY}', reset_yearly: 1, pad: 3, active: 1 })}>+ Series</button>
      <table className="plain"><thead><tr><th>Code</th><th>Label</th><th>Pattern</th><th>Register / field</th><th>Yearly reset</th><th>Next number</th></tr></thead><tbody>
        {rows.map((r) => <tr key={r.code} onClick={() => setEdit(r)} style={{ cursor: 'pointer' }}><td><b>{r.code}</b></td><td>{r.label}</td><td><code>{r.pattern}</code></td><td>{r.register} · {r.field}</td><td>{r.reset_yearly ? 'Yes' : 'No'}</td><td><b>{r.next}</b></td></tr>)}
      </tbody></table>
      {edit && (
        <Drawer title={edit.code ? `Series ${edit.code}` : 'New series'} onClose={() => setEdit(null)} footer={<><button onClick={() => setEdit(null)}>Cancel</button><button className="primary" onClick={save}>Save</button></>}>
          <div className="form-grid">
            {['code', 'label', 'pattern', 'register', 'field'].map((k) => <label key={k} className="f">{k}<input value={edit[k] || ''} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} /></label>)}
            <label className="f">Min digits<input type="number" value={edit.pad} onChange={(e) => setEdit({ ...edit, pad: Number(e.target.value) })} /></label>
            <label className="f">Reset each year<select value={edit.reset_yearly ? 1 : 0} onChange={(e) => setEdit({ ...edit, reset_yearly: Number(e.target.value) })}><option value={1}>Yes</option><option value={0}>No</option></select></label>
            <label className="f">Set last used number (optional)<input type="number" value={edit.setLast ?? ''} onChange={(e) => setEdit({ ...edit, setLast: e.target.value })} /></label>
            <label className="f">for year<input type="number" value={edit.year ?? new Date().getFullYear()} onChange={(e) => setEdit({ ...edit, year: e.target.value })} /></label>
          </div>
        </Drawer>
      )}
    </div>
  );
}

function Templates() {
  const { toast } = useApp();
  const [rows, setRows] = useState<any[] | null>(null);
  const [edit, setEdit] = useState<any>(null);
  const [fields, setFields] = useState<{ name: string; type: string }[]>([]);
  const load = () => api.get('/api/templates').then(setRows);
  useEffect(() => { load(); }, []);
  const open = async (t: any) => {
    setEdit({ ...t, map: Array.isArray(t.field_map) && t.field_map.length ? t.field_map : t.code === 'F271' ? F271_DEFAULT_MAP : [] });
    setFields([]);
    if (t.r2_key) { try { const b = await (await fetch(fileUrl(t.r2_key))).arrayBuffer(); setFields(await listPdfFields(b)); } catch { /* ignore */ } }
  };
  const upload = async (f: File) => {
    const fd = new FormData(); fd.append('file', f);
    await api.form(`/api/templates/${edit.code}`, fd);
    setFields(await listPdfFields(await f.arrayBuffer()));
    toast('Template uploaded.'); load();
  };
  const saveMap = async () => { const fd = new FormData(); fd.append('field_map', JSON.stringify(edit.map)); await api.form(`/api/templates/${edit.code}`, fd); toast('Field map saved.'); load(); };
  if (!rows) return <Spinner />;
  return (
    <div>
      <p className="muted small">Upload the controlled fillable PDF (for example F271 R1 Observation Disposition Form, and the TRAGS NCR format) and map each PDF field to a Finding Register column. Section C and signature fields are left blank for the QE/QM.</p>
      <table className="plain"><thead><tr><th>Code</th><th>Form</th><th>Template file</th><th>Mapped fields</th><th>Updated</th></tr></thead><tbody>
        {rows.map((t) => <tr key={t.code} onClick={() => open(t)} style={{ cursor: 'pointer' }}><td><b>{t.code}</b></td><td>{t.label}</td><td>{t.filename || <span className="red">not uploaded</span>}</td><td>{Array.isArray(t.field_map) ? t.field_map.length : 0}</td><td className="small">{t.updated_at}</td></tr>)}
      </tbody></table>
      {edit && (
        <Drawer wide title={`Template ${edit.code}`} onClose={() => setEdit(null)} footer={<><button onClick={() => setEdit(null)}>Close</button><button className="primary" onClick={saveMap}>Save field map</button></>}>
          <label className="f">Upload fillable PDF<input type="file" accept=".pdf" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></label>
          {fields.length > 0 && <div className="small muted" style={{ margin: '8px 0' }}>PDF fields: {fields.map((f) => `${f.name} (${f.type})`).join(', ')}</div>}
          <table className="plain" style={{ marginTop: 10 }}><thead><tr><th>PDF field</th><th>Type</th><th>Register column key</th><th>Tick when equals / date format</th><th /></tr></thead><tbody>
            {edit.map.map((m: FieldMapEntry, i: number) => (
              <tr key={i}>
                <td><input list="pdf-fields" value={m.field} onChange={(e) => setEdit({ ...edit, map: edit.map.map((x: any, j: number) => (j === i ? { ...x, field: e.target.value } : x)) })} /></td>
                <td><select value={m.type} onChange={(e) => setEdit({ ...edit, map: edit.map.map((x: any, j: number) => (j === i ? { ...x, type: e.target.value } : x)) })}><option>text</option><option>date</option><option>check</option></select></td>
                <td><input value={m.source} onChange={(e) => setEdit({ ...edit, map: edit.map.map((x: any, j: number) => (j === i ? { ...x, source: e.target.value } : x)) })} /></td>
                <td><input value={m.type === 'check' ? m.equals || '' : m.format || ''} placeholder={m.type === 'date' ? 'dd-MMM-yyyy' : ''} onChange={(e) => setEdit({ ...edit, map: edit.map.map((x: any, j: number) => (j === i ? (m.type === 'check' ? { ...x, equals: e.target.value } : { ...x, format: e.target.value }) : x)) })} /></td>
                <td><button className="sm danger" onClick={() => setEdit({ ...edit, map: edit.map.filter((_: any, j: number) => j !== i) })}>✕</button></td>
              </tr>))}
          </tbody></table>
          <datalist id="pdf-fields">{fields.map((f) => <option key={f.name} value={f.name} />)}</datalist>
          <button className="sm" style={{ marginTop: 8 }} onClick={() => setEdit({ ...edit, map: [...edit.map, { field: '', source: '', type: 'text' }] })}>+ Field</button>
        </Drawer>
      )}
    </div>
  );
}

function Settings() {
  const { toast } = useApp();
  const [s, setS] = useState<any>(null);
  const [logoV, setLogoV] = useState(0);
  useEffect(() => { api.get('/api/admin/settings').then(setS); }, []);
  if (!s) return <Spinner />;
  const F = [['company_name', 'Company name', 'Trading and Agency Services Limited Company W.L.L.'], ['wrr_target', 'Weld repair rate target (fraction, e.g. 0.02)', '0.02'], ['ai_model', 'Workers AI extraction model', '@cf/meta/llama-3.3-70b-instruct-fp8-fast'], ['followup_days', 'Audit follow-up days after actual date', '30']];
  const save = async () => {
    const keys = [...F.map((x) => x[0]), 'public_tagline', 'public_show_stats'];
    await api.put('/api/admin/settings', Object.fromEntries(keys.map((k) => [k, s[k] ?? ''])));
    toast('Settings saved.');
  };
  const upLogo = async (file?: File) => {
    if (!file) return;
    const fd = new FormData(); fd.append('file', file);
    try { await api.form('/api/admin/logo', fd); forgetLogo(); toast('Logo updated.'); setLogoV(Date.now()); } catch (e: any) { toast(e.message, 'err'); }
  };
  return (
    <div className="cards wide" style={{ alignItems: 'start' }}>
      <div className="card">
        <h2>General</h2>
        <div className="form-grid">{F.map(([k, l, ph]) => <label key={k} className="f full">{l}<input value={s[k] ?? ''} placeholder={ph} onChange={(e) => setS({ ...s, [k]: e.target.value })} /></label>)}</div>
        <button className="primary" style={{ marginTop: 12 }} onClick={save}>Save settings</button>
      </div>
      <div className="card">
        <h2>Branding and public showcase page</h2>
        <div className="row" style={{ gap: 16, marginBottom: 12 }}>
          <div style={{ width: 120, height: 80, borderRadius: 12, border: '1px dashed var(--line-2)', display: 'grid', placeItems: 'center', background: '#f8fafc' }}>
            <img key={logoV} src={`/api/public/logo?v=${logoV}`} alt="" style={{ maxWidth: 110, maxHeight: 70 }} onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
          </div>
          <label className="btn">Upload logo (PNG, SVG, JPG ≤ 2 MB)<input type="file" hidden accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e) => upLogo(e.target.files?.[0])} /></label>
        </div>
        <div className="form-grid">
          <label className="f full">Landing page headline<input value={s.public_tagline ?? ''} onChange={(e) => setS({ ...s, public_tagline: e.target.value })} placeholder="Quality you can verify, on every work order." /></label>
          <label className="f">Show department counters on the public page<select value={s.public_show_stats ?? 'Yes'} onChange={(e) => setS({ ...s, public_show_stats: e.target.value })}><option>Yes</option><option>No</option></select></label>
        </div>
        <div className="muted small" style={{ marginTop: 8 }}>The public page shows only counts, current company certificates and photos marked "Show on public landing page" in the Photo Library register. No client names, finding details or QMS text are shown.</div>
        <div className="row" style={{ marginTop: 12 }}><button className="primary" onClick={save}>Save</button><a className="btn" href="/welcome" target="_blank" rel="noreferrer">Open showcase page</a><a className="btn" href="/qr">QR poster</a></div>
      </div>
    </div>
  );
}

function AuditLog() {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { api.get('/api/admin/audit-log?limit=1000').then(setRows); }, []);
  if (!rows) return <Spinner />;
  return (
    <div className="grid-wrap"><table className="grid"><thead><tr><th>Time (UTC)</th><th>User</th><th>Action</th><th>Entity</th><th>ID</th><th>Detail</th><th>IP</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.id}><td>{r.at}</td><td>{r.user_name}</td><td>{r.action}</td><td>{r.entity}</td><td>{r.entity_id}</td><td className="small"><div className="clip">{r.detail}</div></td><td className="small">{r.ip}</td></tr>)}</tbody></table></div>
  );
}

export { Confirm };
