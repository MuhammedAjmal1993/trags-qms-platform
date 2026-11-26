import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, qs } from '../api';
import { useApp } from '../ctx';
import { ChartCard, BarChart, LineChart, DonutChart, TYPE_COLORS, snapshot, exportChartsToPptx } from '../components/Charts';
import { pct, Spinner, statusChip } from '../components/ui';
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
  const [opts, setOpts] = useState<{ clients: string[]; years: string[]; workorders: any[] }>({ clients: [], years: [], workorders: [] });
  useEffect(() => { api.get('/api/stats/filters').then(setOpts).catch(() => {}); }, []);
  return { f, setF, opts };
}

export function FilterBar({ f, setF, opts }: ReturnType<typeof useFilters>) {
  const setYear = (y: string) => setF({ ...f, from: `${y}-01-01`, to: `${y}-12-31` });
  return (
    <div className="row card" style={{ padding: 10, marginBottom: 12 }}>
      <label className="f">Year<select value={f.from.slice(0, 4)} onChange={(e) => setYear(e.target.value)}>{[...new Set([String(new Date().getFullYear()), ...opts.years])].sort().reverse().map((y) => <option key={y}>{y}</option>)}</select></label>
      <label className="f">From<input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
      <label className="f">To<input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
      <label className="f">Client<select value={f.client} onChange={(e) => setF({ ...f, client: e.target.value })}><option value="">All clients</option>{opts.clients.map((c) => <option key={c}>{c}</option>)}</select></label>
      <label className="f">Work order<input list="dash-won" value={f.won} placeholder="All" onChange={(e) => setF({ ...f, won: e.target.value.trim() })} style={{ width: 120 }} />
        <datalist id="dash-won">{opts.workorders.map((w: any) => <option key={w.won} value={w.won}>{[w.client, w.title].filter(Boolean).join(' · ').slice(0, 80)}</option>)}</datalist></label>
      <label className="f">Ext/Int<select value={f.extint} onChange={(e) => setF({ ...f, extint: e.target.value })}><option value="">All</option><option>EXTERNAL</option><option>INTERNAL</option></select></label>
    </div>
  );
}

export default function Dashboard() {
  const flt = useFilters();
  const { f } = flt;
  const { can } = useApp();
  const nav = useNavigate();
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { setLoading(true); api.get(`/api/stats/dashboard${qs(f)}`).then(setD).finally(() => setLoading(false)); }, [f]);
  const months = useMemo(() => monthsBetween(f.from, f.to), [f.from, f.to]);
  const by = (rows: any[], m: string, k: string) => Number(rows?.find((r) => r.m === m)?.[k] ?? 0);
  const period = `${fmtDate(f.from)} to ${fmtDate(f.to)}`;
  if (!d) return <Spinner />;
  const k = d.kpi;
  const fType = (t: string) => months.map((m) => Number(d.findings.byMonth.find((r: any) => r.m === m && r.t === t)?.n ?? 0));
  const wrrRate = months.map((m) => { const r = d.welding.byMonth.find((x: any) => x.m === m); return r && r.films ? r.rej / r.films : null; });
  const rfiRate = months.map((m) => { const r = d.inspections.rfi.find((x: any) => x.m === m); return r && r.n - r.canc ? r.rej / (r.n - r.canc) : null; });

  return (
    <div ref={root}>
      <div className="page-head">
        <div><h1>QA/QC Dashboard</h1><div className="muted small">{period}{f.client ? ` · ${f.client}` : ''}{f.won ? ` · WON ${f.won}` : ''}{f.extint ? ` · ${f.extint}` : ''} {loading && <Spinner />}</div></div>
        <div className="row no-print">
          <button onClick={() => root.current && snapshot(root.current, `QA-QC Dashboard ${period}`)}>Snapshot (PNG)</button>
          {can('reports', 'export') || can('dashboard', 'export') ? <button className="primary" onClick={() => root.current && exportChartsToPptx(root.current, 'TRAGS QA/QC Dashboard', period)}>Export charts to PowerPoint</button> : null}
        </div>
      </div>
      <FilterBar {...flt} />

      <div className="kpis">
        <Kpi l="Audits planned" v={k.audits_planned} s={`${k.audits_conducted} conducted`} />
        <Kpi l="Audit completion" v={pct(k.audit_completion)} s={`${k.audits_overdue} overdue`} tone={k.audits_overdue ? 'amber' : 'green'} />
        <Kpi l="Findings raised" v={k.findings_total} s={`NCR ${k.ncr} · OBS ${k.obs} · AFI ${k.afi}`} />
        <Kpi l="Open findings" v={k.findings_open} s={`${k.aging?.over90 ?? 0} open > 90 days (all years)`} tone={k.aging?.over90 ? 'red' : 'green'} />
        <Kpi l="Closure rate" v={pct(k.closure_rate)} />
        <Kpi l="Weld repair rate" v={pct(k.repair_rate, 2)} s={`${k.films_rej} / ${k.films_rt} films`} tone={k.repair_rate > 0.02 ? 'red' : 'green'} />
        <Kpi l="RFI rejection" v={pct(k.rfi_rejection)} s={`${k.rfi_total} RFIs`} />
        <Kpi l="Training completion" v={pct(k.training_completion)} s={`${k.trainings_conducted}/${k.trainings_planned} · ${k.participants} participants`} />
        <Kpi l="Customer feedback" v={k.feedback_total} s={`Survey ${k.survey_score !== null ? pct(k.survey_score) : '–'} · ${k.complaints_open} open complaints`} tone={k.complaints_open ? 'amber' : undefined} />
      </div>

      <div className="section-title"><h2>Audits</h2></div>
      <div className="cards wide">
        <ChartCard title="Audits planned vs conducted" sub="By plan month">
          <BarChart labels={months.map(mLabel)} series={[{ label: 'Planned', data: months.map((m) => by(d.audits.byMonth, m, 'planned')), color: '#9fbfe3' }, { label: 'Conducted', data: months.map((m) => by(d.audits.byMonth, m, 'conducted')), color: '#0b3a6e' }]} />
        </ChartCard>
        <ChartCard title="Audits by type" sub="Audit / Surveillance / QWA, internal vs external">
          <BarChart stacked labels={[...new Set(d.audits.bySub.map((r: any) => r.k))] as string[]} series={['EXTERNAL', 'INTERNAL'].map((e, i) => ({ label: e, color: i ? '#2f80d1' : '#0b3a6e', data: ([...new Set(d.audits.bySub.map((r: any) => r.k))] as string[]).map((s) => Number(d.audits.bySub.find((r: any) => r.k === s && r.e === e)?.n ?? 0)) }))} />
        </ChartCard>
        <div className="card chart-card" data-title="Upcoming audits (next 60 days)">
          <div className="row" style={{ justifyContent: 'space-between' }}><h3>Upcoming audits (next 60 days)</h3><a className="no-snap small" href="/r/AUD">Audit Plan →</a></div>
          <div style={{ maxHeight: 250, overflow: 'auto' }}>
            <table className="plain"><thead><tr><th>Date</th><th>Type</th><th>Client / WON</th><th>Process</th><th>Status</th></tr></thead><tbody>
              {d.audits.upcoming.map((a: any) => <tr key={a.id} onClick={() => nav(`/r/AUD?id=${a.id}`)} style={{ cursor: 'pointer' }}><td>{fmtDate(a.plan_date)}</td><td>{a.sub_category} <span className="muted small">{a.ext_int}</span></td><td>{a.client} <span className="muted small">{a.won}</span></td><td>{a.process}</td><td>{statusChip(a.status)}</td></tr>)}
            </tbody></table>
            {!d.audits.upcoming.length && <div className="empty">No audits planned in the next 60 days.</div>}
          </div>
        </div>
      </div>

      <div className="section-title"><h2>Findings</h2></div>
      <div className="cards wide">
        <ChartCard title="Findings raised by month" sub="NCR / Observation / AFI">
          <BarChart stacked labels={months.map(mLabel)} series={['NCR', 'OBSERVATION', 'AFI'].map((t) => ({ label: t, data: fType(t), color: TYPE_COLORS[t] }))} />
        </ChartCard>
        <ChartCard title="Findings by source" sub="Audit, surveillance, QWA, inspection">
          <BarChart labels={d.findings.bySub.map((r: any) => r.k)} series={[{ label: 'Raised', data: d.findings.bySub.map((r: any) => r.n), color: '#2f80d1' }, { label: 'Closed', data: d.findings.bySub.map((r: any) => r.closed), color: '#2e7d32' }]} />
        </ChartCard>
        <ChartCard title="Findings by client" sub="Open vs total">
          <BarChart horizontal labels={d.findings.byClient.map((r: any) => r.k)} series={[{ label: 'Total', data: d.findings.byClient.map((r: any) => r.n), color: '#9fbfe3' }, { label: 'Open', data: d.findings.byClient.map((r: any) => r.open), color: '#c62828' }]} />
        </ChartCard>
        <ChartCard title="Findings by process / area">
          <BarChart horizontal labels={d.findings.byProcess.map((r: any) => r.k)} series={[{ label: 'Findings', data: d.findings.byProcess.map((r: any) => r.n), color: '#0b3a6e' }]} />
        </ChartCard>
        <ChartCard title="Open findings ageing" sub="All open findings, days since issue">
          <BarChart labels={['≤30 d', '31–60 d', '61–90 d', '> 90 d']} series={[{ label: 'Open findings', data: [k.aging?.d30, k.aging?.d60, k.aging?.d90, k.aging?.over90].map(Number), color: '#e69500' }]} />
        </ChartCard>
        <ChartCard title="Findings: external vs internal">
          <DonutChart labels={d.findings.byExt.map((r: any) => r.k)} data={d.findings.byExt.map((r: any) => r.n)} />
        </ChartCard>
      </div>

      <div className="section-title"><h2>Inspections and welding</h2></div>
      <div className="cards wide">
        <ChartCard title="RFI volume and rejection rate">
          <BarChart labels={months.map(mLabel)} series={[{ label: 'RFIs', data: months.map((m) => by(d.inspections.rfi, m, 'n')), color: '#9fbfe3' }, { label: 'Rejected', data: months.map((m) => by(d.inspections.rfi, m, 'rej')), color: '#c62828' }]} />
        </ChartCard>
        <ChartCard title="RFI rejection rate trend">
          <LineChart pct labels={months.map(mLabel)} series={[{ label: 'Rejection rate', data: rfiRate, color: '#c62828' }]} />
        </ChartCard>
        <ChartCard title="Weld repair rate (film based)" sub="Rejected films / films RT'd">
          <LineChart pct labels={months.map(mLabel)} series={[{ label: 'Repair rate', data: wrrRate, color: '#0b3a6e' }, { label: 'Target 2%', data: months.map(() => 0.02), color: '#c62828', dashed: true }]} />
        </ChartCard>
        <ChartCard title="Weld repair rate by site">
          <BarChart pct labels={d.welding.bySite.map((r: any) => r.k)} series={[{ label: 'Repair rate', data: d.welding.bySite.map((r: any) => (r.films ? r.rej / r.films : 0)), color: '#2f80d1' }]} />
        </ChartCard>
        <ChartCard title="Welders with most rejected films" sub="Period total">
          <BarChart horizontal labels={d.welding.byWelder.map((r: any) => `${r.welder}${r.name ? ' ' + r.name : ''}`.slice(0, 32))} series={[{ label: 'Rejected films', data: d.welding.byWelder.map((r: any) => r.rej), color: '#c62828' }, { label: "Films RT'd", data: d.welding.byWelder.map((r: any) => r.films), color: '#9fbfe3' }]} />
        </ChartCard>
        <ChartCard title="NFI / source inspection status">
          <DonutChart labels={[...d.inspections.nfi.map((r: any) => `NFI ${r.k}`), ...d.inspections.src.map((r: any) => `Source ${r.k}`)]} data={[...d.inspections.nfi.map((r: any) => r.n), ...d.inspections.src.map((r: any) => r.n)]} />
        </ChartCard>
      </div>

      <div className="section-title"><h2>Training and customer feedback</h2></div>
      <div className="cards wide">
        <ChartCard title="Training planned vs conducted">
          <BarChart labels={months.map(mLabel)} series={[{ label: 'Planned', data: months.map((m) => by(d.training.byMonth, m, 'planned')), color: '#9fbfe3' }, { label: 'Conducted', data: months.map((m) => by(d.training.byMonth, m, 'conducted')), color: '#2e7d32' }]} />
        </ChartCard>
        <ChartCard title="Training participants by month">
          <BarChart labels={months.map(mLabel)} series={[{ label: 'Participants', data: months.map((m) => by(d.training.byMonth, m, 'participants')), color: '#00897b' }]} />
        </ChartCard>
        <ChartCard title="Customer feedback by type">
          <DonutChart labels={d.feedback.map((r: any) => r.k)} data={d.feedback.map((r: any) => r.n)} colors={['#2e7d32', '#c62828', '#2f80d1', '#e69500']} />
        </ChartCard>
      </div>
    </div>
  );
}

function Kpi({ l, v, s, tone }: { l: string; v: any; s?: string; tone?: string }) {
  return <div className={`kpi ${tone || ''}`}><div className="l">{l}</div><div className="v">{v ?? '–'}</div>{s && <div className="s">{s}</div>}</div>;
}
