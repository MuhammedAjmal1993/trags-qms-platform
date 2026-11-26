import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, AlertTriangle, Eye, FileBarChart, FileSpreadsheet, ClipboardX, Clock4, Inbox, GraduationCap, ListChecks, Award, ArrowRight, LayoutDashboard, CalendarClock } from 'lucide-react';
import { api, useSWR } from '../api';
import { useApp } from '../ctx';
import { statusChip, pct, Stat, CountUp, PageSkeleton } from '../components/ui';
import { fmtDate } from '../../shared/logic';
import { exportRegister } from '../lib/excel';
import type { RegisterConfig } from '../../shared/registers';

const days = (d: string) => Math.round((new Date(d + 'T00:00:00Z').getTime() - Date.now()) / 86400000);

export default function Home() {
  const { user, can, registers, toast } = useApp();
  const nav = useNavigate();
  const { data: d, error } = useSWR<any>('/api/stats/home');
  const [exp, setExp] = useState('');
  const doExport = async (code: string) => {
    const cfg = registers.find((r) => r.code === code) as RegisterConfig;
    if (!cfg) return;
    const rows = await api.get(`/api/records/${code}`);
    await exportRegister(cfg, rows.rows);
    setExp('');
  };
  if (!d) return error ? <div className="card empty red">{error}</div> : <PageSkeleton />;
  const P = d.pending;
  const hour = new Date().getHours();
  const today = new Date();
  const expired = d.upcoming.expiries.filter((x: any) => x.expiry < today.toISOString().slice(0, 10)).length;
  const go = (to: string) => () => nav(to);
  const bg = (I: any) => <I className="bg" size={74} />;
  return (
    <div className="page">
      <div className="hero">
        <div className="hero-k">{today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
        <h1>{hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'}, {user?.name?.split(' ')[0]}</h1>
        <p>Here is what needs attention across TRAGS QA/QC today.</p>
        <div className="row" style={{ marginTop: 14, gap: 10, flexWrap: 'wrap', position: 'relative', zIndex: 1 }}>
          {can('dashboard') && <button className="primary" onClick={go('/dashboard')}><LayoutDashboard size={15} /> Master dashboard</button>}
          {can('insights') && <button className="btn glass" onClick={go('/insights')}>Insights & patterns <ArrowRight size={15} /></button>}
        </div>
        <svg className="hero-art hide-sm" width="220" height="120" viewBox="0 0 220 120" aria-hidden>
          {[30, 52, 40, 70, 58, 86, 74, 100].map((h, i) => <rect key={i} x={10 + i * 26} y={115 - h} width="16" height={h} rx="5" fill={i % 2 ? 'rgba(167,139,250,.75)' : 'rgba(96,165,250,.75)'} style={{ animation: `fadeUp .6s ease ${i * 70}ms both` }} />)}
        </svg>
      </div>

      <div className="section-title" style={{ marginTop: 6 }}><h2><Clock4 size={17} color="#e11d48" /> Pending and overdue</h2></div>
      <div className="status-board stagger">
        <Stat tone={P.audits.length ? 'red' : 'green'} pulse={!!P.audits.length} n={<CountUp value={P.audits.length} />} t="Audits overdue" d="Planned date passed, not conducted" icon={bg(ClipboardX)} onClick={go('/r/AUD')} />
        <Stat tone={P.findings?.ncr ? 'amber' : 'green'} n={<CountUp value={P.findings?.n ?? 0} />} t="Open findings" d={`${P.findings?.ncr ?? 0} NCR open`} icon={bg(AlertTriangle)} onClick={go('/disposition')} />
        <Stat tone={P.findings?.over90 ? 'red' : 'green'} pulse={!!P.findings?.over90} n={<CountUp value={P.findings?.over90 ?? 0} />} t="Findings over 90 days" d="CA implementation limit" icon={bg(Clock4)} onClick={go('/disposition')} />
        {can('findings') && <Stat tone={d.review ? 'violet' : 'grey'} pulse={!!d.review} n={<CountUp value={d.review || 0} />} t="Raised, awaiting review" d="Quick-form submissions" icon={bg(Inbox)} onClick={go('/review')} />}
        <Stat tone={P.trainingsCount ? 'amber' : 'green'} n={<CountUp value={P.trainingsCount} />} t="Trainings pending" d="Planned date reached" icon={bg(GraduationCap)} onClick={go('/r/TRN')} />
        <Stat tone={P.mrmActions.length ? 'red' : 'green'} n={<CountUp value={P.mrmActions.length} />} t="MRM actions overdue" d="Past due date" icon={bg(ListChecks)} onClick={go('/r/MRA')} />
        <Stat tone={expired ? 'red' : d.upcoming.expiries.length ? 'amber' : 'teal'} n={<CountUp value={d.upcoming.expiries.length} />} t="Certificates expiring" d={expired ? `${expired} already expired` : 'Within 120 days'} icon={bg(Award)} onClick={go('/documents?tab=cert')} />
      </div>

      <div className="quick stagger">
        {can('ingest', 'create') && <button className="qbtn" onClick={go('/ingest')}><span className="qi" style={{ background: 'linear-gradient(135deg,#1463f3,#60a5fa)' }}><Upload size={18} /></span>Upload</button>}
        {can('findings', 'create') && <button className="qbtn" onClick={go('/r/FND?new=NCR')}><span className="qi" style={{ background: 'linear-gradient(135deg,#e11d48,#fb7185)' }}><AlertTriangle size={18} /></span>New NCR</button>}
        {can('findings', 'create') && <button className="qbtn" onClick={go('/r/FND?new=OBSERVATION')}><span className="qi" style={{ background: 'linear-gradient(135deg,#d97706,#fbbf24)' }}><Eye size={18} /></span>New Observation</button>}
        {can('reports', 'view') && <button className="qbtn" onClick={go('/reports')}><span className="qi" style={{ background: 'linear-gradient(135deg,#6d28d9,#a78bfa)' }}><FileBarChart size={18} /></span>Monthly Report</button>}
        <div className="qbtn sel"><span className="qi" style={{ background: 'linear-gradient(135deg,#047857,#34d399)' }}><FileSpreadsheet size={18} /></span><select value={exp} onChange={(e) => { setExp(e.target.value); if (e.target.value) doExport(e.target.value); }}><option value="">Export Excel…</option>{registers.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}</select></div>
      </div>

      <div className="cards wide">
        <Panel title="Pending actions" icon={<Clock4 size={16} color="#e11d48" />} link="/disposition">
          <List empty="No overdue items." items={[
            ...P.audits.map((a: any) => ({ k: `a${a.id}`, t: `Audit ${a.report_no || a.uid || ''} · ${a.sub_category || ''}`, s: `${a.client || ''} ${a.won || ''} · planned ${fmtDate(a.plan_date)}`, b: <span className="chip red">{-days(a.plan_date)} d late</span>, go: `/r/AUD?id=${a.id}` })),
            ...P.overdueFindings.map((f: any) => ({ k: `f${f.id}`, t: `${f.finding_type || 'Finding'} ${f.finding_no || f.report_no || ''}`, s: `${f.client || ''} ${f.won || ''} · ${f.actionee || 'no actionee'}`, b: <span className="chip red">{f.age} d open</span>, go: `/r/FND?id=${f.id}` })),
            ...P.trainings.map((t: any) => ({ k: `t${t.id}`, t: `Training: ${t.subject || t.uid}`, s: `planned ${fmtDate(t.plan_date)} · ${t.process || ''}`, b: <span className="chip amber">pending</span>, go: `/r/TRN?id=${t.id}` })),
            ...P.mrmActions.map((m: any) => ({ k: `m${m.id}`, t: `MRM action ${m.report_no}`, s: `${(m.action || '').slice(0, 80)} · ${m.owner || ''}`, b: <span className="chip red">due {fmtDate(m.due_date)}</span>, go: `/r/MRA?id=${m.id}` })),
          ]} />
        </Panel>
        <Panel title="Upcoming" icon={<CalendarClock size={16} color="#1463f3" />} link="/r/AUD">
          <List empty="Nothing scheduled in the coming weeks." items={[
            ...d.upcoming.audits.map((a: any) => ({ k: `a${a.id}`, t: `${a.sub_category || 'Audit'} · ${a.client || ''}`, s: `${a.report_no || ''} ${a.process || ''} · ${a.ext_int || ''}`, b: <span className="chip open">{fmtDate(a.plan_date)}</span>, go: `/r/AUD?id=${a.id}` })),
            ...d.upcoming.events.map((e: any) => ({ k: `e${e.id}`, t: e.register === 'MRM' ? `MRM ${e.report_no}` : e.title, s: e.register === 'MRM' ? 'Management review meeting' : e.type || 'Quality event', b: <span className="chip">{fmtDate(e.plan_date)}</span>, go: `/r/${e.register}?id=${e.id}` })),
            ...d.upcoming.expiries.map((x: any, i: number) => ({ k: `x${i}`, t: x.name, s: `${x.kind}${x.ref ? ' · ' + x.ref : ''}`, b: <span className={`chip ${days(x.expiry) < 0 ? 'red' : days(x.expiry) < 30 ? 'amber' : ''}`}>{days(x.expiry) < 0 ? 'expired' : 'expires'} {fmtDate(x.expiry)}</span>, go: x.kind === 'Company certificate' ? '/documents?tab=cert' : x.kind === 'ASME stamp' ? '/r/ASM' : x.kind === 'Welder continuity' ? '/r/WLD' : '/r/PCR' })),
          ]} />
        </Panel>
      </div>

      <div className="section-title"><h2>Project health</h2><div className="row small"><span className="health"><span className="dot Red" />{d.projects.filter((p: any) => p.status === 'Red').length}</span><span className="health"><span className="dot Amber" />{d.projects.filter((p: any) => p.status === 'Amber').length}</span><span className="health"><span className="dot Green" />{d.projects.filter((p: any) => p.status === 'Green').length}</span><a href="/wo">All projects →</a></div></div>
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

function Panel({ title, link, icon, children }: { title: string; link?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return <div className="card"><div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}><h2 style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'center' }}>{icon}{title}</h2>{link && <a href={link} className="small">Open →</a>}</div>{children}</div>;
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
