import { useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Target, Camera, Presentation, ClipboardX, AlertTriangle, Clock4, MessageSquareWarning, Flame, CalendarRange, Filter, RotateCcw, ClipboardCheck, Search, GraduationCap, LayoutGrid } from 'lucide-react';
import { qs, useSWR } from '../api';
import { useApp } from '../ctx';
import { ChartCard, BarChart, LineChart, DonutChart, Ring, TYPE_COLORS, snapshot, exportChartsToPptx } from '../components/Charts';
import { pct, Spinner, statusChip, Stat, Kpi, CountUp, PageSkeleton } from '../components/ui';
import { MONTHS } from '../../shared/registers';
import { fmtDate } from '../../shared/logic';

export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7));
  const ey = Number(to.slice(0, 4)), em = Number(to.slice(5, 7));
  while ((y < ey || (y === ey && m <= em)) && out.length < 60) { out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } }
  return out;
}
export const mLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]}-${ym.slice(2, 4)}`;

export function useFilters() {
  const y = new Date().getFullYear();
  const [f, setF] = useState({ from: `${y}-01-01`, to: `${y}-12-31`, client: '', won: '', extint: '' });
  const { data } = useSWR<{ clients: string[]; years: string[]; workorders: any[] }>('/api/stats/filters');
  const opts = data || { clients: [], years: [], workorders: [] };
  return { f, setF, opts };
}

export function FilterBar({ f, setF, opts }: ReturnType<typeof useFilters>) {
  const setYear = (y: string) => setF({ ...f, from: `${y}-01-01`, to: `${y}-12-31` });
  const y = new Date().getFullYear();
  const reset = () => setF({ from: `${y}-01-01`, to: `${y}-12-31`, client: '', won: '', extint: '' });
  return (
    <div className="row card no-print" style={{ padding: '10px 12px', marginBottom: 14, alignItems: 'flex-end' }}>
      <span className="row muted small" style={{ alignSelf: 'center', gap: 4 }}><Filter size={14} /> Filters</span>
      <label className="f">Year<select value={f.from.slice(0, 4)} onChange={(e) => setYear(e.target.value)}>{[...new Set([String(new Date().getFullYear()), ...opts.years])].sort().reverse().map((y) => <option key={y}>{y}</option>)}</select></label>
      <label className="f">From<input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
      <label className="f">To<input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
      <label className="f">Client<select value={f.client} onChange={(e) => setF({ ...f, client: e.target.value })}><option value="">All clients</option>{opts.clients.map((c) => <option key={c}>{c}</option>)}</select></label>
      <label className="f">Work order<input list="dash-won" value={f.won} placeholder="All" onChange={(e) => setF({ ...f, won: e.target.value.trim() })} style={{ width: 120 }} />
        <datalist id="dash-won">{opts.workorders.map((w: any) => <option key={w.won} value={w.won}>{[w.client, w.title].filter(Boolean).join(' · ').slice(0, 80)}</option>)}</datalist></label>
      <label className="f">Ext/Int<select value={f.extint} onChange={(e) => setF({ ...f, extint: e.target.value })}><option value="">All</option><option>EXTERNAL</option><option>INTERNAL</option></select></label>
      <button className="ghost sm" onClick={reset} title="Reset filters"><RotateCcw size={14} /> Reset</button>
    </div>
  );
}

const TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'audits', label: 'Audits', icon: ClipboardCheck },
  { id: 'findings', label: 'Findings', icon: AlertTriangle },
  { id: 'inspection', label: 'Inspection & Welding', icon: Search },
  { id: 'people', label: 'Training & Feedback', icon: GraduationCap },
];

export default function Dashboard() {
  const flt = useFilters();
  const { f } = flt;
  const { can } = useApp();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') || 'overview';
  const { data: d, loading } = useSWR<any>(`/api/stats/dashboard${qs(f)}`);
  const { data: home } = useSWR<any>('/api/stats/home');
  const root = useRef<HTMLDivElement>(null);
  const months = useMemo(() => monthsBetween(f.from, f.to), [f.from, f.to]);
  const by = (rows: any[], m: string, k: string) => Number(rows?.find((r) => r.m === m)?.[k] ?? 0);
  const period = `${fmtDate(f.from)} to ${fmtDate(f.to)}`;
  if (!d) return <PageSkeleton />;
  const k = d.kpi;
  const fType = (t: string) => months.map((m) => Number(d.findings.byMonth.find((r: any) => r.m === m && r.t === t)?.n ?? 0));
  const wrT = Number(d.targets?.repair_rate ?? 0.015);
  const wrrRate = months.map((m) => { const r = d.welding.byMonth.find((x: any) => x.m === m); return r && r.films ? r.rej / r.films : null; });
  const rfiRate = months.map((m) => { const r = d.inspections.rfi.find((x: any) => x.m === m); return r && r.n - r.canc ? r.rej / (r.n - r.canc) : null; });
  const go = (to: string) => () => nav(to);
  const bg = (I: any) => <I className="bg" size={74} />;
  const tabLabel = TABS.find((t) => t.id === tab)?.label || 'Overview';
  const subLine = `${period}${f.client ? ` · ${f.client}` : ''}${f.won ? ` · WON ${f.won}` : ''}${f.extint ? ` · ${f.extint}` : ''}`;
  const subs = [...new Set(d.audits.bySub.map((r: any) => r.k))] as string[];

  const auditPlanVsDone = <ChartCard title="Audits planned vs conducted" sub="By plan month"><BarChart labels={months.map(mLabel)} series={[{ label: 'Planned', data: months.map((m) => by(d.audits.byMonth, m, 'planned')), color: '#bfd4fb' }, { label: 'Conducted', data: months.map((m) => by(d.audits.byMonth, m, 'conducted')), color: '#1463f3' }]} /></ChartCard>;
  const findingsByMonth = <ChartCard title="Findings raised by month" sub="NCR / Observation / AFI"><BarChart stacked labels={months.map(mLabel)} series={['NCR', 'OBSERVATION', 'AFI'].map((t) => ({ label: t, data: fType(t), color: TYPE_COLORS[t] }))} /></ChartCard>;
  const findingsByClient = <ChartCard title="Findings by client" sub="Total vs still open"><BarChart horizontal labels={d.findings.byClient.map((r: any) => r.k)} series={[{ label: 'Total', data: d.findings.byClient.map((r: any) => r.n), color: '#bfd4fb' }, { label: 'Open', data: d.findings.byClient.map((r: any) => r.open), color: '#f43f5e' }]} /></ChartCard>;
  const ageing = <ChartCard title="Open findings ageing" sub="All open findings, days since issue"><BarChart labels={['≤ 30 d', '31–60 d', '61–90 d', '> 90 d']} series={[{ label: 'Open findings', data: [k.aging?.d30, k.aging?.d60, k.aging?.d90, k.aging?.over90].map(Number), color: '#f59e0b' }]} /></ChartCard>;
  const wrr = <ChartCard title="Weld repair rate (film based)" sub="Rejected films / films RT'd"><LineChart pct labels={months.map(mLabel)} series={[{ label: 'Repair rate', data: wrrRate, color: '#7c3aed' }, { label: `Target ${(wrT * 100).toFixed(1)}%`, data: months.map(() => wrT), color: '#f43f5e', dashed: true }]} /></ChartCard>;

  return (
    <div ref={root} className="page">
      <div className="page-head">
        <div><div className="eyebrow">Monitor & Insights</div><h1>Master Dashboard</h1><div className="sub row" style={{ gap: 6 }}><CalendarRange size={13} />{subLine} {loading && <Spinner />}</div></div>
        <div className="row no-print">
          <button onClick={() => root.current && snapshot(root.current, `QA-QC Dashboard ${tabLabel} ${period}`)}><Camera size={15} /> Snapshot</button>
          {can('reports', 'export') || can('dashboard', 'export') ? <button className="primary" onClick={() => root.current && exportChartsToPptx(root.current, `TRAGS QA/QC Dashboard · ${tabLabel}`, period)}><Presentation size={15} /> Export to PowerPoint</button> : null}
        </div>
      </div>
      <div className="tabs no-print">{TABS.map((t) => <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setSp(t.id === 'overview' ? {} : { tab: t.id }, { replace: true })}><t.icon size={14} /> {t.label}</button>)}</div>
      <FilterBar {...flt} />

      {tab === 'overview' && (
        <div className="stagger" key="ov">
          <div className="status-board">
            <Stat tone={k.audits_overdue ? 'red' : 'green'} pulse={!!k.audits_overdue} n={<CountUp value={k.audits_overdue} />} t="Audits overdue" d={`${k.audits_conducted}/${k.audits_planned} conducted in period`} icon={bg(ClipboardX)} onClick={go('/r/AUD')} />
            <Stat tone={k.findings_open ? 'amber' : 'green'} n={<CountUp value={k.findings_open} />} t="Findings open (period)" d={`NCR ${k.ncr} · OBS ${k.obs} · AFI ${k.afi} raised`} icon={bg(AlertTriangle)} onClick={go('/disposition')} />
            <Stat tone={k.aging?.over90 ? 'red' : 'green'} pulse={!!k.aging?.over90} n={<CountUp value={k.aging?.over90 ?? 0} />} t="Open over 90 days" d={`${k.aging?.open ?? 0} open in total, all years`} icon={bg(Clock4)} onClick={go('/disposition')} />
            <Stat tone={k.complaints_open ? 'pink' : 'green'} n={<CountUp value={k.complaints_open} />} t="Open complaints" d={`${k.feedback_total} feedback records`} icon={bg(MessageSquareWarning)} onClick={go('/r/CFB')} />
            <Stat tone={k.repair_rate > wrT ? 'red' : 'teal'} n={k.repair_rate === null ? '–' : <CountUp value={k.repair_rate * 100} fmt={(n) => n.toFixed(2) + '%'} />} t="Weld repair rate" d={`${k.films_rej} / ${k.films_rt} films · target ≤ ${(wrT * 100).toFixed(1)}%`} icon={bg(Flame)} onClick={() => setSp({ tab: 'inspection' })} />
          </div>
          <div className="section-title" style={{ marginTop: 0 }}><h2><Target size={16} color="#1463f3" /> KPI scorecard against 2026 targets</h2></div>
          <div className="scorecard">
            {[
              { l: 'Audit completion', v: k.audit_completion, t: d.targets.audit_completion, hi: true },
              { l: 'Finding closure', v: k.closure_rate, t: d.targets.ncr_closure, hi: true },
              { l: 'Weld repair rate', v: k.repair_rate, t: d.targets.repair_rate, hi: false, dp: 2 },
              { l: 'RFI rejection', v: k.rfi_rejection, t: d.targets.rfi_rejection, hi: false, dp: 2 },
              { l: 'Training completion', v: k.training_completion, t: d.targets.training_completion, hi: true },
              { l: 'Customer survey score', v: k.survey_score, t: d.targets.customer_satisfaction, hi: true },
            ].map((x) => {
              const ok = x.v === null || x.v === undefined ? null : x.hi ? x.v >= x.t : x.v <= x.t;
              return (
                <div key={x.l} className={`sc ${ok === null ? '' : ok ? 'ok' : 'bad'}`}>
                  <div className="l">{x.l}</div>
                  <div className="v">{pct(x.v, x.dp || 1)}</div>
                  <div className="t">Target {x.hi ? '≥' : '≤'} {pct(x.t, x.dp ? 1 : 0)} <span className="chip">{ok === null ? 'No data' : ok ? 'On target' : 'Off target'}</span></div>
                </div>
              );
            })}
          </div>
          <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', marginBottom: 14 }}>
            {[
              { l: 'Audit completion', v: k.audit_completion, c: '#1463f3', s: `${k.audits_conducted} of ${k.audits_planned} planned` },
              { l: 'Finding closure rate', v: k.closure_rate, c: '#10b981', s: `${k.findings_total - k.findings_open} of ${k.findings_total} closed` },
              { l: 'Training completion', v: k.training_completion, c: '#7c3aed', s: `${k.trainings_conducted}/${k.trainings_planned} · ${k.participants} participants` },
              { l: 'Customer survey score', v: k.survey_score, c: '#14b8a6', s: k.survey_score === null ? 'No survey in period' : 'Average of surveys in period' },
            ].map((x) => (
              <div key={x.l} className="card row" style={{ gap: 16, flexWrap: 'nowrap' }}>
                <Ring value={x.v} color={x.c} size={84} />
                <div><div className="ring-l">{x.l}</div><div className="muted small" style={{ marginTop: 4 }}>{x.s}</div></div>
              </div>
            ))}
          </div>
          <div className="cards wide">
            {findingsByMonth}
            {auditPlanVsDone}
            {ageing}
            {wrr}
          </div>
          {home && (
            <div className="cards wide" style={{ marginTop: 14 }}>
              <div className="card"><h2 className="row"><Clock4 size={16} color="#e11d48" /> Overdue findings</h2>
                <table className="plain"><thead><tr><th>Finding</th><th>Client / WON</th><th>Actionee</th><th>Age</th></tr></thead><tbody>
                  {home.pending.overdueFindings.slice(0, 10).map((x: any) => <tr key={x.id} style={{ cursor: 'pointer' }} onClick={go(`/r/FND?id=${x.id}`)}><td><b>{x.finding_type}</b> {x.finding_no || x.report_no}</td><td>{x.client} <span className="muted small">{x.won}</span></td><td>{x.actionee || <span className="muted">–</span>}</td><td><span className="chip red">{x.age} d</span></td></tr>)}
                </tbody></table>
                {!home.pending.overdueFindings.length && <div className="empty">No overdue findings.</div>}
              </div>
              <div className="card"><h2 className="row"><ClipboardX size={16} color="#e11d48" /> Overdue and upcoming audits</h2>
                <table className="plain"><thead><tr><th>Date</th><th>Type</th><th>Client / WON</th><th>Status</th></tr></thead><tbody>
                  {[...home.pending.audits.map((a: any) => ({ ...a, late: true })), ...d.audits.upcoming.slice(0, 8)].slice(0, 12).map((a: any) => <tr key={a.id} style={{ cursor: 'pointer' }} onClick={go(`/r/AUD?id=${a.id}`)}><td>{fmtDate(a.plan_date)}</td><td>{a.sub_category}</td><td>{a.client} <span className="muted small">{a.won}</span></td><td>{a.late ? <span className="chip red">Overdue</span> : statusChip(a.status)}</td></tr>)}
                </tbody></table>
                {!home.pending.audits.length && !d.audits.upcoming.length && <div className="empty">Nothing overdue or due in 60 days.</div>}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'audits' && (
        <div className="stagger" key="au">
          <div className="kpis">
            <Kpi l="Audits planned" v={<CountUp value={k.audits_planned} />} s={`${k.audits_conducted} conducted`} icon={<ClipboardCheck size={16} />} />
            <Kpi l="Audit completion" v={pct(k.audit_completion)} bar={k.audit_completion} tone="green" />
            <Kpi l="Overdue" v={<CountUp value={k.audits_overdue} />} tone={k.audits_overdue ? 'red' : 'green'} onClick={go('/r/AUD')} />
            <Kpi l="Upcoming (60 days)" v={<CountUp value={d.audits.upcoming.length} />} tone="violet" />
          </div>
          <div className="status-board">
            <Stat tone="amber" n={<CountUp value={d.audits.due?.d7 ?? 0} />} t="Due in next 7 days" icon={bg(CalendarRange)} onClick={go('/r/AUD')} />
            <Stat tone="blue" n={<CountUp value={d.audits.due?.d30 ?? 0} />} t="Due in next 30 days" icon={bg(CalendarRange)} onClick={go('/r/AUD')} />
            <Stat tone="green" n={<CountUp value={d.audits.due?.done10 ?? 0} />} t="Conducted in last 10 days" icon={bg(ClipboardCheck)} onClick={go('/r/AUD')} />
          </div>
          <div className="cards wide" style={{ marginBottom: 14 }}>
            <div className="card chart-card" data-title="Planned / Actual / Pending by audit type">
              <h3>Planned / Actual / Pending by audit type</h3>
              <table className="plain"><thead><tr><th>Type</th><th className="num">Planned</th><th className="num">Actual</th><th className="num">Pending</th><th className="num">Cancelled / postponed</th><th>Completion</th></tr></thead><tbody>
                {d.audits.matrix.map((r: any) => <tr key={r.k}><td><b>{r.k}</b></td><td className="num">{r.planned}</td><td className="num">{r.actual}</td><td className="num" style={{ color: r.pending ? '#be123c' : undefined }}>{r.pending}</td><td className="num">{r.cancelled}</td><td style={{ minWidth: 120 }}><div className="meter"><i style={{ width: `${r.planned ? (r.actual / r.planned) * 100 : 0}%`, background: 'var(--grad)' }} /></div><span className="small muted">{pct(r.planned ? r.actual / r.planned : null)}</span></td></tr>)}
              </tbody></table>
            </div>
            <div className="card chart-card" data-title="Auditor summary">
              <h3>Auditor summary</h3>
              <div style={{ maxHeight: 300, overflow: 'auto' }}><table className="plain"><thead><tr><th>Auditor</th><th className="num">Planned</th><th className="num">Conducted</th><th className="num">NCR</th><th className="num">OBS</th></tr></thead><tbody>
                {d.audits.auditors.map((r: any) => <tr key={r.k}><td>{r.k}</td><td className="num">{r.n}</td><td className="num">{r.done}</td><td className="num">{r.ncr}</td><td className="num">{r.obs}</td></tr>)}
              </tbody></table></div>
            </div>
          </div>
          <div className="cards wide">
            {auditPlanVsDone}
            <ChartCard title="Audits by type" sub="Audit / Surveillance / QWA, internal vs external">
              <BarChart stacked labels={subs} series={['EXTERNAL', 'INTERNAL'].map((e, i) => ({ label: e, color: i ? '#14b8a6' : '#1463f3', data: subs.map((x) => Number(d.audits.bySub.find((r: any) => r.k === x && r.e === e)?.n ?? 0)) }))} />
            </ChartCard>
            <div className="card chart-card" data-title="Upcoming audits (next 60 days)">
              <div className="row" style={{ justifyContent: 'space-between' }}><h3>Upcoming audits (next 60 days)</h3><a className="no-snap small" href="/r/AUD">Audit Plan →</a></div>
              <div style={{ maxHeight: 260, overflow: 'auto' }}>
                <table className="plain"><thead><tr><th>Date</th><th>Type</th><th>Client / WON</th><th>Process</th><th>Status</th></tr></thead><tbody>
                  {d.audits.upcoming.map((a: any) => <tr key={a.id} onClick={go(`/r/AUD?id=${a.id}`)} style={{ cursor: 'pointer' }}><td>{fmtDate(a.plan_date)}</td><td>{a.sub_category} <span className="muted small">{a.ext_int}</span></td><td>{a.client} <span className="muted small">{a.won}</span></td><td>{a.process}</td><td>{statusChip(a.status)}</td></tr>)}
                </tbody></table>
                {!d.audits.upcoming.length && <div className="empty">No audits planned in the next 60 days.</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'findings' && (
        <div className="stagger" key="fi">
          <div className="kpis">
            <Kpi l="Findings raised" v={<CountUp value={k.findings_total} />} s={`NCR ${k.ncr} · OBS ${k.obs} · AFI ${k.afi}`} icon={<AlertTriangle size={16} />} />
            <Kpi l="Open" v={<CountUp value={k.findings_open} />} tone={k.findings_open ? 'amber' : 'green'} onClick={go('/disposition')} />
            <Kpi l="Closure rate" v={pct(k.closure_rate)} bar={k.closure_rate} tone="green" />
            <Kpi l="Open > 90 days" v={<CountUp value={k.aging?.over90 ?? 0} />} s="All years" tone={k.aging?.over90 ? 'red' : 'green'} onClick={go('/disposition')} />
          </div>
          <div className="cards wide">
            {findingsByMonth}
            <ChartCard title="Findings by source" sub="Audit, surveillance, QWA, inspection">
              <BarChart labels={d.findings.bySub.map((r: any) => r.k)} series={[{ label: 'Raised', data: d.findings.bySub.map((r: any) => r.n), color: '#1463f3' }, { label: 'Closed', data: d.findings.bySub.map((r: any) => r.closed), color: '#10b981' }]} />
            </ChartCard>
            {findingsByClient}
            <ChartCard title="Findings by process / area">
              <BarChart horizontal labels={d.findings.byProcess.map((r: any) => r.k)} series={[{ label: 'Findings', data: d.findings.byProcess.map((r: any) => r.n), color: '#7c3aed' }]} />
            </ChartCard>
            {ageing}
            <ChartCard title="Findings: external vs internal">
              <DonutChart labels={d.findings.byExt.map((r: any) => r.k)} data={d.findings.byExt.map((r: any) => r.n)} center="Findings" />
            </ChartCard>
            <ChartCard title="Issue categories (recurring themes)" sub="Classification from the 5-year analysis and keyword rules">
              <BarChart horizontal labels={d.findings.byCategory.map((r: any) => r.k)} series={[{ label: 'Findings', data: d.findings.byCategory.map((r: any) => r.n), color: '#1463f3' }, { label: 'Open', data: d.findings.byCategory.map((r: any) => r.open), color: '#f43f5e' }]} />
            </ChartCard>
            <HeatCard rows={d.findings.heat} />
            <div className="card chart-card" data-title="Open findings by actionee">
              <h3>Open findings by actionee</h3>
              <div style={{ maxHeight: 300, overflow: 'auto' }}><table className="plain"><thead><tr><th>Actionee</th><th className="num">Raised</th><th className="num">Open</th><th className="num">Open &gt; 90 d</th></tr></thead><tbody>
                {d.findings.actionee.map((r: any) => <tr key={r.k}><td>{r.k}</td><td className="num">{r.n}</td><td className="num">{r.open ? <span className="chip amber">{r.open}</span> : 0}</td><td className="num">{r.over90 ? <span className="chip red">{r.over90}</span> : 0}</td></tr>)}
              </tbody></table></div>
            </div>
          </div>
        </div>
      )}

      {tab === 'inspection' && (
        <div className="stagger" key="in">
          <div className="kpis">
            <Kpi l="RFIs" v={<CountUp value={k.rfi_total} />} icon={<Search size={16} />} />
            <Kpi l="RFI rejection" v={pct(k.rfi_rejection)} tone={k.rfi_rejection > 0.1 ? 'red' : 'green'} />
            <Kpi l="Films RT'd" v={<CountUp value={k.films_rt} />} tone="violet" />
            <Kpi l="Weld repair rate" v={pct(k.repair_rate, 2)} s={`${k.films_rej} rejected · target ≤ ${(wrT * 100).toFixed(1)}%`} tone={k.repair_rate > wrT ? 'red' : 'green'} />
          </div>
          <div className="cards wide">
            <ChartCard title="RFI volume and rejections">
              <BarChart labels={months.map(mLabel)} series={[{ label: 'RFIs', data: months.map((m) => by(d.inspections.rfi, m, 'n')), color: '#bfd4fb' }, { label: 'Rejected', data: months.map((m) => by(d.inspections.rfi, m, 'rej')), color: '#f43f5e' }]} />
            </ChartCard>
            <ChartCard title="RFI rejection rate trend">
              <LineChart pct labels={months.map(mLabel)} series={[{ label: 'Rejection rate', data: rfiRate, color: '#f43f5e' }]} />
            </ChartCard>
            {wrr}
            <ChartCard title="Weld repair rate by site">
              <BarChart pct labels={d.welding.bySite.map((r: any) => r.k)} series={[{ label: 'Repair rate', data: d.welding.bySite.map((r: any) => (r.films ? r.rej / r.films : 0)), color: '#7c3aed' }]} />
            </ChartCard>
            <ChartCard title="Welders with most rejected films" sub="Period total">
              <BarChart horizontal labels={d.welding.byWelder.map((r: any) => `${r.welder}${r.name ? ' ' + r.name : ''}`.slice(0, 32))} series={[{ label: 'Rejected films', data: d.welding.byWelder.map((r: any) => r.rej), color: '#f43f5e' }, { label: "Films RT'd", data: d.welding.byWelder.map((r: any) => r.films), color: '#bfd4fb' }]} />
            </ChartCard>
            <div className="card chart-card" data-title="RFI summary by discipline">
              <h3>RFI summary by discipline</h3>
              <div style={{ maxHeight: 300, overflow: 'auto' }}><table className="plain"><thead><tr><th>Discipline</th><th className="num">Raised</th><th className="num">Approved</th><th className="num">AWC</th><th className="num">Rejected</th><th className="num">Cancelled</th><th className="num">Open</th><th className="num">Rejection</th></tr></thead><tbody>
                {d.inspections.byDiscipline.map((r: any) => <tr key={r.k}><td>{r.k}</td><td className="num">{r.n}</td><td className="num">{r.appr}</td><td className="num">{r.awc}</td><td className="num">{r.rej}</td><td className="num">{r.canc}</td><td className="num">{r.open}</td><td className="num">{pct(r.n - r.canc ? r.rej / (r.n - r.canc) : null, 2)}</td></tr>)}
              </tbody></table></div>
            </div>
            <div className="card chart-card" data-title="Welding summary by site">
              <h3>Welding summary by site</h3>
              <div style={{ maxHeight: 300, overflow: 'auto' }}><table className="plain"><thead><tr><th>Site</th><th className="num">Welders</th><th className="num">Joints</th><th className="num">Inch-dia</th><th className="num">Joints RT</th><th className="num">Films RT</th><th className="num">Rejected</th><th className="num">Repair rate</th></tr></thead><tbody>
                {d.welding.sites.map((r: any) => <tr key={r.k}><td>{r.k}</td><td className="num">{r.welders}</td><td className="num">{Math.round(r.joints).toLocaleString()}</td><td className="num">{Math.round(r.inch).toLocaleString()}</td><td className="num">{Math.round(r.jrt).toLocaleString()}</td><td className="num">{Math.round(r.films).toLocaleString()}</td><td className="num">{r.rej}</td><td className="num">{pct(r.films ? r.rej / r.films : null, 2)}</td></tr>)}
              </tbody></table></div>
            </div>
            <ChartCard title="NFI / source inspection status">
              <DonutChart labels={[...d.inspections.nfi.map((r: any) => `NFI ${r.k}`), ...d.inspections.src.map((r: any) => `Source ${r.k}`)]} data={[...d.inspections.nfi.map((r: any) => r.n), ...d.inspections.src.map((r: any) => r.n)]} center="Inspections" />
            </ChartCard>
          </div>
        </div>
      )}

      {tab === 'people' && (
        <div className="stagger" key="pe">
          <div className="kpis">
            <Kpi l="Trainings planned" v={<CountUp value={k.trainings_planned} />} s={`${k.trainings_conducted} conducted`} icon={<GraduationCap size={16} />} />
            <Kpi l="Training completion" v={pct(k.training_completion)} bar={k.training_completion} tone="violet" />
            <Kpi l="Participants" v={<CountUp value={k.participants} />} tone="teal" />
            <Kpi l="Customer feedback" v={<CountUp value={k.feedback_total} />} s={`${k.complaints_open} open complaints`} tone={k.complaints_open ? 'amber' : 'green'} onClick={go('/r/CFB')} />
          </div>
          <div className="cards wide">
            <ChartCard title="Training planned vs conducted">
              <BarChart labels={months.map(mLabel)} series={[{ label: 'Planned', data: months.map((m) => by(d.training.byMonth, m, 'planned')), color: '#ddd6fe' }, { label: 'Conducted', data: months.map((m) => by(d.training.byMonth, m, 'conducted')), color: '#7c3aed' }]} />
            </ChartCard>
            <ChartCard title="Training participants by month">
              <LineChart labels={months.map(mLabel)} series={[{ label: 'Participants', data: months.map((m) => by(d.training.byMonth, m, 'participants')), color: '#14b8a6' }]} />
            </ChartCard>
            <ChartCard title="Customer feedback by type">
              <DonutChart labels={d.feedback.map((r: any) => r.k)} data={d.feedback.map((r: any) => r.n)} colors={['#10b981', '#f43f5e', '#1463f3', '#f59e0b', '#7c3aed']} center="Records" />
            </ChartCard>
          </div>
        </div>
      )}
    </div>
  );
}

function HeatCard({ rows }: { rows: { k: string; c: string; n: number }[] }) {
  const crits = ['High', 'Medium', 'Low', '(blank)'].filter((c) => rows.some((r) => r.c === c));
  const locs = Array.from(new Set(rows.map((r) => r.k)));
  const tot = (l: string) => rows.filter((r) => r.k === l).reduce((a, r) => a + r.n, 0);
  locs.sort((a, b) => tot(b) - tot(a));
  const max = Math.max(1, ...rows.map((r) => r.n));
  const col = (c: string, n: number) => { const a = 0.12 + (n / max) * 0.8; return c === 'High' ? `rgba(244,63,94,${a})` : c === 'Medium' ? `rgba(245,158,11,${a})` : c === 'Low' ? `rgba(20,184,166,${a})` : `rgba(100,116,139,${a})`; };
  return (
    <div className="card chart-card" data-title="Findings heat map: location x criticality">
      <h3>Findings heat map: location × criticality</h3>
      <div style={{ maxHeight: 300, overflow: 'auto' }}><table className="plain"><thead><tr><th>Location</th>{crits.map((c) => <th key={c} className="num">{c}</th>)}<th className="num">Total</th></tr></thead><tbody>
        {locs.slice(0, 14).map((l) => <tr key={l}><td>{l}</td>{crits.map((c) => { const n = rows.find((r) => r.k === l && r.c === c)?.n || 0; return <td key={c} className="num" style={{ background: n ? col(c, n) : undefined, fontWeight: n ? 700 : 400 }}>{n || ''}</td>; })}<td className="num"><b>{tot(l)}</b></td></tr>)}
      </tbody></table></div>
    </div>
  );
}
