// Dashboard tabs that mirror the TRAGS Looker Studio pages: welding, welder card, RFI, source inspection,
// training, customer feedback, trade awards and the five-year finding view. Each tab loads its own data.
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame, Search, Ruler, Award, UserSearch, PackageCheck, GraduationCap, MessageSquareHeart, History, Clock4 } from 'lucide-react';
import { qs, useSWR } from '../api';
import { ChartCard, BarChart, LineChart, DonutChart, TYPE_COLORS, PALETTE } from '../components/Charts';
import { pct, Stat, Kpi, CountUp, Skeleton, statusChip, Spinner, Drawer } from '../components/ui';
import { fmtDate } from '../../shared/logic';
import { mLabel } from './Dashboard';

type F = { from: string; to: string; client: string; won: string; extint: string };
const n0 = (v: unknown) => Math.round(Number(v) || 0).toLocaleString();
const bg = (I: any) => <I className="bg" size={74} />;

function useSection<T = any>(name: string, f: F) {
  return useSWR<T>(`/api/stats/section/${name}${qs(f)}`);
}

function Table({ title, head, rows, empty, max = 320 }: { title: string; head: ReactNode[]; rows: ReactNode[][]; empty?: string; max?: number }) {
  return (
    <div className="card chart-card" data-title={title}>
      <h3>{title}</h3>
      <div style={{ maxHeight: max, overflow: 'auto' }}>
        <table className="plain"><thead><tr>{head.map((h, i) => <th key={i} className={i ? 'num' : ''}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={j ? 'num' : ''}>{c}</td>)}</tr>)}</tbody></table>
        {!rows.length && <div className="empty">{empty || 'No records in the selected period.'}</div>}
      </div>
    </div>
  );
}

function Band({ label, children }: { label: string; children: ReactNode }) {
  return <div className="band"><div className="band-l">{label}</div><div className="status-board band-tiles">{children}</div></div>;
}

const Loading = () => <><Skeleton h={96} n={1} /><div className="cards wide">{[1, 2, 3, 4].map((i) => <div key={i} className="skel" style={{ height: 280 }} />)}</div></>;

// ---------------------------------------------------------------- Welding
export function WeldingTab({ f, months, target }: { f: F; months: string[]; target: number }) {
  const { data: d } = useSection('welding', f);
  const [welder, setWelder] = useState('');
  const [open, setOpen] = useState('');
  if (!d) return <Loading />;
  const t = d.totals[0] || {};
  const rate = t.films ? t.rej / t.films : null;
  const jrej = (t.jrt || 0) - (t.jacc || 0);
  const lrate = t.lm ? t.lmrej / t.lm : null;
  const by = (m: string, k: string) => Number(d.byMonth.find((r: any) => r.m === m)?.[k] ?? 0);
  const list = welder ? d.welders.filter((w: any) => `${w.id} ${w.name || ''}`.toLowerCase().includes(welder.toLowerCase())) : d.welders;
  return (
    <div className="stagger" key="we">
      <Band label="Piping summary">
        <Stat tone="blue" n={<CountUp value={t.joints} />} t="No. of joints" icon={bg(Flame)} />
        <Stat tone="blue" n={<CountUp value={t.inch} />} t="Total inch-dia" />
        <Stat tone="blue" n={<CountUp value={t.jrt} />} t="Joints RT done" />
        <Stat tone="violet" n={<CountUp value={t.films} />} t="Films RT'd" d={`${t.welders || 0} welders`} />
      </Band>
      <Band label="Repair rate">
        <Stat tone="amber" n={<CountUp value={jrej > 0 ? jrej : 0} />} t="Joints RT rejected" />
        <Stat tone="amber" n={<CountUp value={t.rej} />} t="Films RT rejected" />
        <Stat tone={rate !== null && rate > target ? 'red' : 'green'} n={pct(rate, 2)} t="Repair rate (film)" d={`Target ≤ ${(target * 100).toFixed(1)}%`} />
      </Band>
      <Band label="Linear weld summary">
        <Stat tone="blue" n={<CountUp value={t.lm} fmt={(n) => n.toLocaleString(undefined, { maximumFractionDigits: 0 })} />} t="Linear metres welded" icon={bg(Ruler)} />
        <Stat tone="amber" n={Number(t.lmrej || 0).toFixed(2)} t="NDT rejected (m)" />
        <Stat tone={lrate !== null && lrate > target ? 'red' : 'green'} n={pct(lrate, 2)} t="Linear repair rate" />
      </Band>
      <div className="cards wide">
        <ChartCard title="Joints welded and films rejected by month">
          <BarChart labels={months.map(mLabel)} series={[{ label: 'Joints welded', data: months.map((m) => by(m, 'joints')), color: '#bfd4fb' }, { label: 'Films rejected', data: months.map((m) => by(m, 'rej')), color: '#f43f5e' }]} />
        </ChartCard>
        <ChartCard title="Repair rate by month" sub="Rejected films / films RT'd">
          <LineChart pct labels={months.map(mLabel)} series={[{ label: 'Repair rate', data: months.map((m) => (by(m, 'films') ? by(m, 'rej') / by(m, 'films') : null)), color: '#7c3aed' }, { label: 'Target', data: months.map(() => target), color: '#f43f5e', dashed: true }]} />
        </ChartCard>
        <ChartCard title="Inch-dia by welder type">
          <DonutChart labels={d.byType.map((r: any) => r.k)} data={d.byType.map((r: any) => Math.round(r.inch))} center="Inch-dia" />
        </ChartCard>
        <Table title="Linear weld summary by site (structural)" head={['Site', 'Linear m welded', 'NDT rejected (m)', 'Linear repair rate']}
          rows={d.linear.map((r: any) => [r.k, n0(r.lm), Number(r.lmrej).toFixed(2), pct(r.lm ? r.lmrej / r.lm : null, 2)])} />
        <div className="card chart-card" data-title="Welder performance">
          <div className="row" style={{ justifyContent: 'space-between' }}><h3>Welder performance</h3>
            <input className="no-snap" placeholder="Search welder ID or name" value={welder} onChange={(e) => setWelder(e.target.value)} style={{ width: 200 }} /></div>
          <div style={{ maxHeight: 320, overflow: 'auto' }}><table className="plain"><thead><tr><th>Welder</th><th>Site</th><th className="num">Joints</th><th className="num">Films</th><th className="num">Rejected</th><th className="num">Repair rate</th></tr></thead><tbody>
            {list.slice(0, 120).map((w: any) => <tr key={w.id} style={{ cursor: 'pointer' }} onClick={() => setOpen(String(w.id))}><td><b>{w.id}</b> <span className="muted small">{w.name}</span></td><td>{w.site}</td><td className="num">{n0(w.joints)}</td><td className="num">{n0(w.films)}</td><td className="num">{w.rej || ''}</td>
              <td className="num">{w.rej ? <span className={`chip ${w.rej / w.films > target ? 'red' : 'amber'}`}>{pct(w.rej / w.films, 2)}</span> : pct(0, 1)}</td></tr>)}
          </tbody></table>{!list.length && <div className="empty">No welder matches.</div>}</div>
          <div className="muted small" style={{ marginTop: 6 }}>Select a welder to open the performance card.</div>
        </div>
      </div>
      {open && <WelderCard id={open} onClose={() => setOpen('')} target={target} />}
    </div>
  );
}

export function WelderCard({ id, onClose, target }: { id: string; onClose: () => void; target: number }) {
  const { data: d, error } = useSWR<any>(`/api/stats/welder/${encodeURIComponent(id)}`);
  const tot = (k: string) => (d?.months || []).reduce((a: number, r: any) => a + (Number(r[k]) || 0), 0);
  const films = tot('films'), rej = tot('rej');
  return (
    <Drawer wide title={<span className="row"><UserSearch size={18} /> Welder performance card · {id}</span>} onClose={onClose}>
        <div>
          {error && <div className="empty">{error}</div>}
          {!d && !error && <Spinner />}
          {d && (<>
            <div className="row" style={{ gap: 18, marginBottom: 12 }}>
              <div><div className="muted small">Name</div><b>{d.info?.name || '–'}</b></div>
              <div><div className="muted small">Emp No.</div><b>{d.info?.emp || '–'}</b></div>
              <div><div className="muted small">Welder type</div><b>{d.info?.type || '–'}</b></div>
              <div><div className="muted small">Sites</div><b>{d.info?.sites || '–'}</b></div>
              <div><div className="muted small">Active</div><b>{fmtDate(d.info?.first)} – {fmtDate(d.info?.last)}</b></div>
            </div>
            <div className="kpis">
              <Kpi l="Joints welded" v={n0(tot('joints'))} s={`${n0(tot('inch'))} inch-dia`} />
              <Kpi l="Films RT'd" v={n0(films)} tone="violet" />
              <Kpi l="Films rejected" v={n0(rej)} tone={rej ? 'amber' : 'green'} />
              <Kpi l="Repair rate" v={pct(films ? rej / films : null, 2)} tone={films && rej / films > target ? 'red' : 'green'} s={`Target ≤ ${(target * 100).toFixed(1)}%`} />
              <Kpi l="Welder of the Month" v={d.awards.filter((a: any) => ['Selected', 'Winner'].includes(a.status)).length} s={`${d.awards.length} nomination(s)`} tone="pink" />
            </div>
            {d.months.length > 0 && <ChartCard title="Monthly repair rate">
              <LineChart pct labels={d.months.map((r: any) => mLabel(r.m))} series={[{ label: 'Repair rate', data: d.months.map((r: any) => (r.films ? r.rej / r.films : null)), color: '#7c3aed' }, { label: 'Target', data: d.months.map(() => target), color: '#f43f5e', dashed: true }]} />
            </ChartCard>}
            {d.awards.length > 0 && <table className="plain" style={{ marginTop: 12 }}><thead><tr><th>Period</th><th>Status</th><th>Site</th><th>Score</th><th>Nominator</th></tr></thead>
              <tbody>{d.awards.map((a: any, i: number) => <tr key={i}><td>{a.period}</td><td>{statusChip(a.status || 'Nominated')}</td><td>{a.site}</td><td>{a.score ?? '–'}</td><td>{a.nominator}</td></tr>)}</tbody></table>}
            {d.qualification.length > 0 && <div style={{ marginTop: 12 }}><h3>Qualification record</h3>
              {d.qualification.map((q: any) => <div key={q.id} className="muted small">{q.report_no} · {q.status || ''} · continuity due {fmtDate(q.due_date)} · {[q.data.process, q.data.position, q.data.material].filter(Boolean).join(' · ')}</div>)}</div>}
          </>)}
        </div>
    </Drawer>
  );
}

// ---------------------------------------------------------------- RFI
export function RfiTab({ f, d: main, months }: { f: F; d: any; months: string[] }) {
  const { data: d } = useSection('rfi', f);
  if (!d) return <Loading />;
  const st = (k: string) => Number(d.status.find((r: any) => r.k === k)?.n ?? 0);
  const total = d.status.reduce((a: number, r: any) => a + r.n, 0);
  const rej = st('Rejected'), canc = st('Cancelled');
  const by = (m: string, k: string) => Number(main.inspections.rfi.find((r: any) => r.m === m)?.[k] ?? 0);
  const rr = (r: any) => pct(r.n - r.canc ? r.rej / (r.n - r.canc) : null, 2);
  return (
    <div className="stagger" key="rf">
      <Band label="RFI summary">
        <Stat tone="blue" n={<CountUp value={total} />} t="RFI raised" icon={bg(Search)} />
        <Stat tone="green" n={<CountUp value={st('Approved')} />} t="Approved" />
        <Stat tone="teal" n={<CountUp value={st('AWC')} />} t="Approved with comments" />
        <Stat tone="violet" n={<CountUp value={st('Open')} />} t="Open" />
      </Band>
      <Band label="RFI rejection summary">
        <Stat tone="grey" n={<CountUp value={canc} />} t="Cancelled" />
        <Stat tone="red" n={<CountUp value={rej} />} t="Rejected" />
        <Stat tone={total - canc && rej / (total - canc) > (main.targets?.rfi_rejection ?? 0.02) ? 'red' : 'green'} n={pct(total - canc ? rej / (total - canc) : null, 2)} t="RFI rejection rate" d={`Target ≤ ${pct(main.targets?.rfi_rejection ?? 0.02, 1)}`} />
      </Band>
      {!total && <div className="card empty" style={{ marginBottom: 14 }}>RFI history is still loading into the platform (free-plan daily write limit). Figures appear here automatically as it completes.</div>}
      <div className="cards wide">
        <ChartCard title="RFI volume and rejections by month">
          <BarChart labels={months.map(mLabel)} series={[{ label: 'RFIs', data: months.map((m) => by(m, 'n')), color: '#bfd4fb' }, { label: 'Rejected', data: months.map((m) => by(m, 'rej')), color: '#f43f5e' }]} />
        </ChartCard>
        <ChartCard title="RFI status">
          <DonutChart labels={d.status.map((r: any) => r.k)} data={d.status.map((r: any) => r.n)} colors={['#1463f3', '#14b8a6', '#f59e0b', '#94a3b8', '#f43f5e', '#7c3aed']} center="RFIs" />
        </ChartCard>
        <Table title="Discipline summary" head={['Discipline', 'RFIs', 'Rejected', 'Rejection']} rows={main.inspections.byDiscipline.map((r: any) => [r.k, n0(r.n), r.rej, rr(r)])} />
        <Table title="WON-wise RFI summary" head={['WON', 'RFIs', 'Rejected', 'Rejection']} rows={d.byWon.map((r: any) => [<><b>{r.k}</b> <span className="muted small">{r.client}</span></>, n0(r.n), r.rej, rr(r)])} />
        <Table title="Custodian (inspector) summary" head={['Inspector', 'RFIs', 'Rejected', 'Rejection']} rows={d.byInspector.map((r: any) => [r.k, n0(r.n), r.rej, rr(r)])} />
        <Table title="Location summary" head={['Location', 'RFIs', 'Rejected', 'Rejection']} rows={d.byLocation.map((r: any) => [r.k, n0(r.n), r.rej, rr(r)])} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Source inspection (NFI)
export function NfiTab({ f, months }: { f: F; months: string[] }) {
  const { data: d } = useSection('nfi', f);
  const nav = useNavigate();
  if (!d) return <Loading />;
  const s = (k: string) => Number(d.status.find((r: any) => r.k === k)?.n ?? 0);
  const i = (k: string) => Number(d.insp.find((r: any) => r.k === k)?.n ?? 0);
  const total = d.status.reduce((a: number, r: any) => a + r.n, 0);
  const by = (m: string, k: string) => Number(d.byMonth.find((r: any) => r.m === m)?.[k] ?? 0);
  const row = (r: any) => [r.k, r.n, r.open ? <span className="chip amber">{r.open}</span> : 0, r.closed];
  return (
    <div className="stagger" key="nf">
      <Band label="NFI status">
        <Stat tone="blue" n={<CountUp value={total} />} t="NFI raised" icon={bg(PackageCheck)} onClick={() => nav('/r/NFI')} />
        <Stat tone="green" n={<CountUp value={s('Closed')} />} t="NFI closed" d={`Closure ${pct(total ? s('Closed') / total : null, 0)}`} />
        <Stat tone="red" n={<CountUp value={s('Open')} />} t="NFI open" />
        <Stat tone="grey" n={<CountUp value={s('Cancelled') + s('Rejected')} />} t="Cancelled / rejected" />
      </Band>
      <Band label="Inspection status">
        <Stat tone="amber" n={<CountUp value={i('Ongoing')} />} t="Ongoing" />
        <Stat tone="blue" n={<CountUp value={i('Scheduled')} />} t="Scheduled" />
        <Stat tone="green" n={<CountUp value={i('Completed')} />} t="Completed" />
        <Stat tone="grey" n={<CountUp value={i('Cancelled')} />} t="Cancelled" />
      </Band>
      <div className="cards wide">
        <ChartCard title="NFIs received by month">
          <BarChart stacked labels={months.map(mLabel)} series={[{ label: 'Closed', data: months.map((m) => by(m, 'closed')), color: '#10b981' }, { label: 'Open', data: months.map((m) => by(m, 'open')), color: '#f59e0b' }]} />
        </ChartCard>
        <ChartCard title="Inspection result">
          <DonutChart labels={d.result.map((r: any) => r.k)} data={d.result.map((r: any) => r.n)} colors={['#10b981', '#14b8a6', '#f43f5e', '#94a3b8', '#f59e0b']} center="NFIs" />
        </ChartCard>
        <Table title="NFI summary: PO-wise" head={['PO number', 'NFI', 'Open', 'Closed']} rows={d.byPO.map(row)} />
        <Table title="NFI summary: location-wise" head={['Location', 'NFI', 'Open', 'Closed']} rows={d.byLocation.map(row)} />
        <Table title="NFI summary: TPI agency" head={['TPI agency', 'NFI', 'Open', 'Closed']} rows={d.byTPI.map(row)} />
        <Table title="Open NFIs" head={['NFI', 'Item', 'Location', 'Required']} rows={d.open.map((r: any) => [<a onClick={() => nav(`/r/NFI?id=${r.id}`)} style={{ cursor: 'pointer' }}>{r.report_no}</a>, (r.item || '').slice(0, 40), r.location, fmtDate(r.due_date)])} empty="No open NFIs." />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Training
export function TrainingTab({ f, d: main, months }: { f: F; d: any; months: string[] }) {
  const { data: d } = useSection('training', f);
  if (!d) return <Loading />;
  const sum = (sub: string | null, k: string) => d.matrix.filter((r: any) => !sub || r.k === sub).reduce((a: number, r: any) => a + Number(r[k] || 0), 0);
  const by = (m: string, k: string) => Number(main.training.byMonth.find((r: any) => r.m === m)?.[k] ?? 0);
  const band = (label: string, k: string, tone: string) => (
    <Band label={label}>
      <Stat tone={tone} n={<CountUp value={sum(null, k)} />} t="Total" icon={bg(GraduationCap)} />
      <Stat tone={tone} n={<CountUp value={sum('Training', k)} />} t="Trainings" />
      <Stat tone={tone} n={<CountUp value={sum('Awareness', k)} />} t="Awareness" />
    </Band>
  );
  return (
    <div className="stagger" key="tr">
      {band('Planned', 'planned', 'blue')}
      {band('Conducted', 'done', 'green')}
      {band('Pending', 'pending', 'red')}
      <div className="cards wide">
        <ChartCard title="Training planned vs conducted">
          <BarChart labels={months.map(mLabel)} series={[{ label: 'Planned', data: months.map((m) => by(m, 'planned')), color: '#ddd6fe' }, { label: 'Conducted', data: months.map((m) => by(m, 'conducted')), color: '#7c3aed' }]} />
        </ChartCard>
        <ChartCard title="Participants by month">
          <LineChart labels={months.map(mLabel)} series={[{ label: 'Participants', data: months.map((m) => by(m, 'participants')), color: '#14b8a6' }]} />
        </ChartCard>
        <Table title="Category-wise count (conducted)" head={['Type', 'QMS', 'PROJECT', 'Participants']}
          rows={['Training', 'Awareness'].map((t) => [t, d.matrix.find((r: any) => r.k === t && r.p === 'QMS')?.done ?? 0, d.matrix.find((r: any) => r.k === t && r.p === 'PROJECT')?.done ?? 0, n0(sum(t, 'participants'))])} />
        <ChartCard title="Location-wise (conducted)">
          <BarChart horizontal labels={d.byLocation.map((r: any) => r.k)} series={[{ label: 'Sessions', data: d.byLocation.map((r: any) => r.n), color: '#7c3aed' }]} />
        </ChartCard>
        <Table title="Trainers" head={['Conducted by', 'Sessions', 'Participants']} rows={d.byTrainer.map((r: any) => [r.k, r.n, n0(r.p)])} />
        <Table title="Pending trainings (plan date passed)" head={['Planned', 'Subject', 'Type', 'Location']} rows={d.pending.map((r: any) => [fmtDate(r.plan_date), (r.subject || '').slice(0, 50), `${r.sub_category} · ${r.category}`, r.location])} empty="No pending trainings." />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Customer feedback
const SAT = (v: number | null) => v === null ? '–' : v >= 0.9 ? 'Excellent' : v >= 0.8 ? 'Very good' : v >= 0.7 ? 'Good' : v >= 0.5 ? 'Fair' : 'Poor';
export function FeedbackTab({ f, d: main, months }: { f: F; d: any; months: string[] }) {
  const { data: d } = useSection('feedback', f);
  if (!d) return <Loading />;
  const s = (k: string) => Number(d.bySub.find((r: any) => r.k === k)?.n ?? 0);
  const total = d.bySub.reduce((a: number, r: any) => a + r.n, 0);
  const score = main.kpi.survey_score;
  const subs = d.bySub.map((r: any) => r.k);
  return (
    <div className="stagger" key="cf">
      <div className="status-board">
        <Stat tone="blue" n={<CountUp value={total} />} t="Feedbacks" icon={bg(MessageSquareHeart)} />
        <Stat tone="teal" n={<CountUp value={s('Customer Satisfaction Survey')} />} t="Surveys (CSF)" />
        <Stat tone="violet" n={<CountUp value={s('Email Appreciation')} />} t="Email appreciation" />
        <Stat tone="amber" n={<CountUp value={s('Achievements')} />} t="Achievements" />
        <Stat tone={s('Complaint') ? 'red' : 'green'} n={<CountUp value={s('Complaint')} />} t="Complaints" d={`${main.kpi.complaints_open} open`} />
        <Stat tone={score === null ? 'grey' : score >= (main.targets?.customer_satisfaction ?? 0.95) ? 'green' : 'amber'} n={pct(score, 1)} t="Survey score" d={`Satisfaction: ${SAT(score)}`} />
      </div>
      <div className="cards wide">
        <ChartCard title="Monthly feedback summary">
          <BarChart stacked labels={months.map(mLabel)} series={subs.map((k: string, i: number) => ({ label: k, color: PALETTE[i % PALETTE.length], data: months.map((m) => Number(d.byMonth.find((r: any) => r.m === m && r.k === k)?.n ?? 0)) }))} />
        </ChartCard>
        <ChartCard title="Feedback by type">
          <DonutChart labels={d.bySub.map((r: any) => r.k)} data={d.bySub.map((r: any) => r.n)} colors={['#10b981', '#1463f3', '#f59e0b', '#f43f5e', '#7c3aed']} center="Records" />
        </ChartCard>
        <Table title="Client-wise summary" head={['Client', 'Feedback', 'Surveys', 'Avg. survey score']} rows={d.byClient.map((r: any) => [r.k, r.n, r.surveys, r.score === null ? '–' : pct(r.score, 0)])} />
        <Table title="Process / area summary" head={['Process / area', 'Feedback']} rows={d.byProcess.map((r: any) => [r.k, r.n])} />
        <Table title="Feedback log" head={['Date', 'Type', 'Client', 'Status']} rows={d.list.map((r: any) => [fmtDate(r.plan_date), r.sub_category, r.client, statusChip(r.status)])} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Trade awards
export function AwardsTab({ f }: { f: F }) {
  const { data: d } = useSection('awards', f);
  if (!d) return <Loading />;
  const t = d.totals[0] || {};
  return (
    <div className="stagger" key="aw">
      <div className="status-board">
        <Stat tone="blue" n={<CountUp value={t.nominated} />} t="Nominated" icon={bg(Award)} />
        <Stat tone="amber" n={<CountUp value={t.selected} />} t="Selected" d={`Selection ${pct(t.nominated ? t.selected / t.nominated : null, 0)}`} />
        <Stat tone="violet" n={<CountUp value={t.welders} />} t="Welders nominated" />
        {d.qpa[0] && <Stat tone="pink" n={d.qpa[0].report_no || fmtDate(d.qpa[0].plan_date)} t="Quality Performer of the Year" d={d.qpa[0].winner} />}
      </div>
      {!t.nominated && <div className="card empty" style={{ marginBottom: 14 }}>No Welder of the Month nominations in the selected period. The programme started in October 2025; widen the date range to see earlier months.</div>}
      <div className="cards wide">
        <ChartCard title="Nominated vs selected by month">
          <BarChart labels={d.byMonth.map((r: any) => mLabel(r.m))} series={[{ label: 'Nominated', data: d.byMonth.map((r: any) => r.nominated), color: '#1463f3' }, { label: 'Selected', data: d.byMonth.map((r: any) => r.selected), color: '#f59e0b' }]} />
        </ChartCard>
        <ChartCard title="Nominations by site">
          <DonutChart labels={d.bySite.map((r: any) => r.k)} data={d.bySite.map((r: any) => r.nominated)} center="Nominated" />
        </ChartCard>
        <Table title="Site-wise summary" head={['Project / site', 'Nominated', 'Selected']} rows={d.bySite.map((r: any) => [r.k, r.nominated, r.selected])} />
        <Table title="Work-order-wise summary" head={['Work order', 'Nominated', 'Selected']} rows={d.byWon.map((r: any) => [r.k, r.nominated, r.selected])} />
        <Table title="Welder category" head={['Category', 'Nominated', 'Selected']} rows={d.byCraft.map((r: any) => [r.k, r.nominated, r.selected])} />
        <Table title="Most recognised welders" head={['Welder', 'Site', 'Nominated', 'Selected', 'Avg. score']} rows={d.top.map((r: any) => [<><b>{r.id}</b> <span className="muted small">{r.name}</span></>, r.site, r.nominated, r.selected, r.score ?? '–'])} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Five-year findings
export function TrendTab({ f }: { f: F }) {
  const { data: d } = useSection('trend', f);
  if (!d) return <Loading />;
  const years = [...new Set(d.byYear.map((r: any) => r.y))] as string[];
  const T = ['NCR', 'OBSERVATION', 'AFI'];
  const tot = (t: string) => d.byYear.filter((r: any) => r.t === t).reduce((a: number, r: any) => a + r.n, 0);
  const ext = (e: string, t: string) => Number(d.byExt.find((r: any) => r.e === e && r.t === t)?.n ?? 0);
  const subs = [...new Set(d.bySub.map((r: any) => r.k))] as string[];
  return (
    <div className="stagger" key="fy">
      <div className="muted small" style={{ marginBottom: 8 }}><History size={13} /> Last five calendar years ({years[0] || '–'} to {years[years.length - 1] || '–'}). Client, work order and Ext/Int filters apply; the date filter does not.</div>
      <div className="status-board">
        <Stat tone="red" n={<CountUp value={tot('NCR')} />} t="NCR" d="Five-year total" />
        <Stat tone="amber" n={<CountUp value={tot('OBSERVATION')} />} t="Observations" />
        <Stat tone="blue" n={<CountUp value={tot('AFI')} />} t="AFI / OFI" />
        <Stat tone="violet" n={T.map((t) => ext('EXTERNAL', t)).reduce((a, b) => a + b, 0).toLocaleString()} t="External (client)" d={`NCR ${ext('EXTERNAL', 'NCR')} · OBS ${ext('EXTERNAL', 'OBSERVATION')}`} />
        <Stat tone="teal" n={T.map((t) => ext('INTERNAL', t)).reduce((a, b) => a + b, 0).toLocaleString()} t="Internal" d={`NCR ${ext('INTERNAL', 'NCR')} · OBS ${ext('INTERNAL', 'OBSERVATION')}`} />
      </div>
      <div className="cards wide">
        <ChartCard title="Findings by year" sub="NCR / Observation / AFI">
          <BarChart stacked labels={years} series={T.map((t) => ({ label: t, color: TYPE_COLORS[t], data: years.map((y) => Number(d.byYear.find((r: any) => r.y === y && r.t === t)?.n ?? 0)) }))} />
        </ChartCard>
        <ChartCard title="Average close-out time" sub="Days from issue to closure, by year of issue">
          <BarChart labels={d.closeout.map((r: any) => r.y)} series={[{ label: 'Days', data: d.closeout.map((r: any) => r.days), color: '#14b8a6' }]} />
        </ChartCard>
        <ChartCard title="Finding status by source" sub="Audit, surveillance, inspection, QWA">
          <BarChart stacked horizontal labels={subs} series={T.map((t) => ({ label: t, color: TYPE_COLORS[t], data: subs.map((k) => Number(d.bySub.find((r: any) => r.k === k && r.t === t)?.n ?? 0)) }))} />
        </ChartCard>
        <ChartCard title="Process / area / department: five-year summary">
          <BarChart stacked horizontal labels={d.byProcess.map((r: any) => r.k)} series={[{ label: 'NCR', data: d.byProcess.map((r: any) => r.ncr), color: TYPE_COLORS.NCR }, { label: 'OBSERVATION', data: d.byProcess.map((r: any) => r.obs), color: TYPE_COLORS.OBSERVATION }, { label: 'AFI', data: d.byProcess.map((r: any) => r.afi), color: TYPE_COLORS.AFI }]} />
        </ChartCard>
        <Table title="Year summary" head={['Year', 'NCR', 'OBS', 'AFI', 'Closed', 'Closure']} rows={years.map((y) => { const rs = d.byYear.filter((r: any) => r.y === y); const n = rs.reduce((a: number, r: any) => a + r.n, 0), c = rs.reduce((a: number, r: any) => a + r.closed, 0); return [y, ...T.map((t) => rs.find((r: any) => r.t === t)?.n ?? 0), c, pct(n ? c / n : null, 0)]; })} />
        <Table title="Client summary" head={['Client', 'Findings', 'NCR']} rows={d.byClient.map((r: any) => [r.k, r.n, r.ncr])} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Overview: audit summary (Looker master page)
export function AuditSummary({ rows }: { rows: any[] }) {
  return (
    <div className="card chart-card" data-title="Audit summary" style={{ marginBottom: 14 }}>
      <h3 className="row"><Clock4 size={15} color="#1463f3" /> Audit summary</h3>
      <table className="plain"><thead><tr><th>Source</th><th className="num">Reports</th><th className="num">NCR</th><th className="num">OBS</th><th className="num">AFI</th><th className="num">Open NCR</th><th className="num">Open OBS</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.k}><td><b>{r.k}</b></td><td className="num">{r.reports}</td><td className="num">{r.ncr}</td><td className="num">{r.obs}</td><td className="num">{r.afi}</td>
          <td className="num">{r.open_ncr ? <span className="chip red">{r.open_ncr}</span> : 0}</td><td className="num">{r.open_obs ? <span className="chip amber">{r.open_obs}</span> : 0}</td></tr>)}</tbody></table>
      {!rows.length && <div className="empty">No findings in the selected period.</div>}
    </div>
  );
}
