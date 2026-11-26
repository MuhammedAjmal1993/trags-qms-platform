import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../ctx';
import { Spinner, statusChip, pct } from '../components/ui';
import { fmtDate } from '../../shared/logic';
import { exportRegister } from '../lib/excel';
import type { RegisterConfig } from '../../shared/registers';

const days = (d: string) => Math.round((new Date(d + 'T00:00:00Z').getTime() - Date.now()) / 86400000);

export default function Home() {
  const { user, can, registers, toast } = useApp();
  const nav = useNavigate();
  const [d, setD] = useState<any>(null);
  const [exp, setExp] = useState('');
  useEffect(() => { api.get('/api/stats/home').then(setD).catch((e) => toast(e.message, 'err')); }, [toast]);
  const doExport = async (code: string) => {
    const cfg = registers.find((r) => r.code === code) as RegisterConfig;
    if (!cfg) return;
    const rows = await api.get(`/api/records/${code}`);
    await exportRegister(cfg, rows.rows);
    setExp('');
  };
  if (!d) return <Spinner />;
  const P = d.pending;
  const hour = new Date().getHours();
  return (
    <div>
      <div className="page-head">
        <div><h1>{hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'}, {user?.name?.split(' ')[0]}</h1><div className="muted small">TRAGS QA/QC · what needs attention today</div></div>
      </div>

      <div className="quick">
        {can('ingest', 'create') && <button className="qbtn" onClick={() => nav('/ingest')}><b>⇪</b>Upload</button>}
        {can('findings', 'create') && <button className="qbtn" onClick={() => nav('/r/FND?new=NCR')}><b>＋</b>New NCR</button>}
        {can('findings', 'create') && <button className="qbtn" onClick={() => nav('/r/FND?new=OBSERVATION')}><b>＋</b>New Observation</button>}
        {can('reports', 'view') && <button className="qbtn" onClick={() => nav('/reports')}><b>▤</b>Monthly Report</button>}
        <div className="qbtn sel"><b>⤓</b><select value={exp} onChange={(e) => { setExp(e.target.value); if (e.target.value) doExport(e.target.value); }}><option value="">Export Excel…</option>{registers.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}</select></div>
      </div>

      <div className="kpis">
        <Tile l="Audits overdue" v={P.audits.length} tone={P.audits.length ? 'red' : 'green'} onClick={() => nav('/r/AUD')} />
        <Tile l="Open findings" v={P.findings?.n ?? 0} s={`${P.findings?.ncr ?? 0} NCR open`} tone={P.findings?.ncr ? 'amber' : 'green'} onClick={() => nav('/disposition')} />
        <Tile l="Findings > 90 days" v={P.findings?.over90 ?? 0} tone={P.findings?.over90 ? 'red' : 'green'} onClick={() => nav('/disposition')} />
        <Tile l="Pending trainings" v={P.trainingsCount} tone={P.trainingsCount ? 'amber' : 'green'} onClick={() => nav('/r/TRN')} />
        <Tile l="MRM actions overdue" v={P.mrmActions.length} tone={P.mrmActions.length ? 'red' : 'green'} onClick={() => nav('/r/MRA')} />
        <Tile l="Expiring in 120 days" v={d.upcoming.expiries.length} tone={d.upcoming.expiries.some((x: any) => x.expiry < new Date().toISOString().slice(0, 10)) ? 'red' : d.upcoming.expiries.length ? 'amber' : 'green'} onClick={() => nav('/documents?tab=cert')} />
      </div>

      <div className="cards wide">
        <Panel title="Pending actions" link="/disposition">
          <List empty="No overdue items." items={[
            ...P.audits.map((a: any) => ({ k: `a${a.id}`, t: `Audit ${a.report_no || a.uid || ''} · ${a.sub_category || ''}`, s: `${a.client || ''} ${a.won || ''} · planned ${fmtDate(a.plan_date)}`, b: <span className="chip red">{-days(a.plan_date)} d late</span>, go: `/r/AUD?id=${a.id}` })),
            ...P.overdueFindings.map((f: any) => ({ k: `f${f.id}`, t: `${f.finding_type || 'Finding'} ${f.finding_no || f.report_no || ''}`, s: `${f.client || ''} ${f.won || ''} · ${f.actionee || 'no actionee'}`, b: <span className="chip red">{f.age} d open</span>, go: `/r/FND?id=${f.id}` })),
            ...P.trainings.map((t: any) => ({ k: `t${t.id}`, t: `Training: ${t.subject || t.uid}`, s: `planned ${fmtDate(t.plan_date)} · ${t.process || ''}`, b: <span className="chip amber">pending</span>, go: `/r/TRN?id=${t.id}` })),
            ...P.mrmActions.map((m: any) => ({ k: `m${m.id}`, t: `MRM action ${m.report_no}`, s: `${(m.action || '').slice(0, 80)} · ${m.owner || ''}`, b: <span className="chip red">due {fmtDate(m.due_date)}</span>, go: `/r/MRA?id=${m.id}` })),
          ]} />
        </Panel>
        <Panel title="Upcoming" link="/r/AUD">
          <List empty="Nothing scheduled in the coming weeks." items={[
            ...d.upcoming.audits.map((a: any) => ({ k: `a${a.id}`, t: `${a.sub_category || 'Audit'} · ${a.client || ''}`, s: `${a.report_no || ''} ${a.process || ''} · ${a.ext_int || ''}`, b: <span className="chip open">{fmtDate(a.plan_date)}</span>, go: `/r/AUD?id=${a.id}` })),
            ...d.upcoming.events.map((e: any) => ({ k: `e${e.id}`, t: e.register === 'MRM' ? `MRM ${e.report_no}` : e.title, s: e.register === 'MRM' ? 'Management review meeting' : e.type || 'Quality event', b: <span className="chip">{fmtDate(e.plan_date)}</span>, go: `/r/${e.register}?id=${e.id}` })),
            ...d.upcoming.expiries.map((x: any, i: number) => ({ k: `x${i}`, t: x.name, s: `${x.kind}${x.ref ? ' · ' + x.ref : ''}`, b: <span className={`chip ${days(x.expiry) < 0 ? 'red' : days(x.expiry) < 30 ? 'amber' : ''}`}>{days(x.expiry) < 0 ? 'expired' : 'expires'} {fmtDate(x.expiry)}</span>, go: x.kind === 'Company certificate' ? '/documents?tab=cert' : x.kind === 'ASME stamp' ? '/r/ASM' : x.kind === 'Welder continuity' ? '/r/WLD' : '/r/PCR' })),
          ]} />
        </Panel>
      </div>

      <div className="section-title"><h2>Project health</h2><a href="/wo">All projects →</a></div>
      <div className="grid-wrap" style={{ maxHeight: 420 }}>
        <table className="grid"><thead><tr><th>Health</th><th>WON</th><th>Client</th><th>Project</th><th>Open findings</th><th>Open NCR</th><th>Repair rate (90 d)</th><th>Why</th><th>Last activity</th></tr></thead>
          <tbody>{d.projects.map((p: any) => (
            <tr key={p.won} onClick={() => nav(`/wo/${p.won}`)}>
              <td><span className="health"><span className={`dot ${p.status}`} /> {p.status}</span></td><td><b>{p.won}</b></td><td>{p.client}</td><td><div className="clip">{p.project_no ? `${p.project_no} · ` : ''}{p.title}</div></td>
              <td className="num">{p.open || ''}</td><td className={`num ${p.ncr ? 'flag' : ''}`}>{p.ncr || ''}</td><td className="num">{p.repairRate === null ? '' : pct(p.repairRate, 2)}</td><td className="small">{p.reasons.join('; ')}</td><td>{fmtDate(p.last)}</td>
            </tr>))}</tbody></table>
        {!d.projects.length && <div className="empty">No project activity in the last 180 days.</div>}
      </div>
    </div>
  );
}

function Tile({ l, v, s, tone, onClick }: { l: string; v: any; s?: string; tone?: string; onClick?: () => void }) {
  return <div className={`kpi ${tone || ''}`} onClick={onClick} style={{ cursor: onClick ? 'pointer' : undefined }}><div className="l">{l}</div><div className="v">{v}</div>{s && <div className="s">{s}</div>}</div>;
}
function Panel({ title, link, children }: { title: string; link?: string; children: React.ReactNode }) {
  return <div className="card"><div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}><h2 style={{ margin: 0 }}>{title}</h2>{link && <a href={link} className="small">Open →</a>}</div>{children}</div>;
}
function List({ items, empty }: { items: { k: string; t: string; s?: string; b?: React.ReactNode; go?: string }[]; empty: string }) {
  const nav = useNavigate();
  if (!items.length) return <div className="empty">{empty}</div>;
  return (
    <div className="list">
      {items.slice(0, 18).map((i) => (
        <div key={i.k} className="li" onClick={() => i.go && nav(i.go)}>
          <div><div className="li-t">{i.t}</div>{i.s && <div className="muted small">{i.s}</div>}</div><div>{i.b}</div>
        </div>
      ))}
      {items.length > 18 && <div className="muted small" style={{ padding: 6 }}>+ {items.length - 18} more</div>}
    </div>
  );
}

export { statusChip };
