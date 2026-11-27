import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { qs, useSWR } from '../api';
import { useApp } from '../ctx';
import { Spinner, Drawer, PageSkeleton, ErrorState } from '../components/ui';
import { ChartCard, BarChart, LineChart, TYPE_COLORS, snapshot, exportChartsToPptx } from '../components/Charts';
import { QSP, DEFAULT_MAP, mapProcess, tokens } from '../lib/qms';
import { MONTHS } from '../../shared/registers';
import { fmtDate } from '../../shared/logic';

type F = { id: number; uid: string; r: string; n: string; won: string; cl: string; p: string; s: string; t: string; e: string; st: string; d: string; cd: string; ca: string; cr: string; rc: string; root: string; x: string; a: string; loc: string; eff: string; cat: string };
const isClosed = (s: string) => /^(closed|cancelled)$/i.test(s || '');
const dd = (a?: string, b?: string) => (a && b ? (new Date(b).getTime() - new Date(a).getTime()) / 86400000 : null);
const SOURCES = ['Audit', 'Surveillance', 'QWA', 'Inspection', 'Customer Complaint', 'Other'];

export default function Insights() {
  const nav = useNavigate();
  const { toast } = useApp();
  const y = new Date().getFullYear();
  const [p, setP] = useState({ from: `${y - 2}-01-01`, to: `${y}-12-31`, ext: '', client: '' });
  const { data: d, error, reload } = useSWR<any>(`/api/stats/insights${qs({ from: p.from, to: p.to })}`);
  const [tab, setTab] = useState<'overview' | 'functions' | 'recurring' | 'interface'>('overview');
  const [drill, setDrill] = useState<{ title: string; rows: F[] } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { if (error) toast(error, 'err'); }, [error, toast]);

  const rules: [string, string][] = d?.qmsMap || DEFAULT_MAP;
  const F: F[] = useMemo(() => (d?.findings || []).filter((f: F) => (!p.ext || f.e === p.ext) && (!p.client || f.cl === p.client)), [d, p.ext, p.client]);
  const A = useMemo(() => analyse(F, d, rules), [F, d, rules]);
  if (!d) return error ? <ErrorState message={error} onRetry={reload} /> : <PageSkeleton />;
  const clients = [...new Set((d.findings as F[]).map((f) => f.cl).filter(Boolean))].sort();
  const open = (title: string, rows: F[]) => setDrill({ title, rows });

  return (
    <div ref={root}>
      <div className="page-head">
        <div><h1>Insights &amp; Patterns</h1><div className="muted small">Recurring issues, department and function performance, and the interface between QA/QC activities and the TRAGS QMS (QSPs and ISO 9001 clauses).</div></div>
        <div className="row no-print"><button onClick={() => root.current && snapshot(root.current, 'TRAGS QA-QC Insights')}>Snapshot</button><button className="primary" onClick={() => root.current && exportChartsToPptx(root.current, 'TRAGS QA/QC Insights', `${fmtDate(p.from)} to ${fmtDate(p.to)}`)}>Export to PowerPoint</button></div>
      </div>
      <div className="row card no-print" style={{ padding: 10, marginBottom: 12 }}>
        <label className="f">From<input type="date" value={p.from} onChange={(e) => setP({ ...p, from: e.target.value })} /></label>
        <label className="f">To<input type="date" value={p.to} onChange={(e) => setP({ ...p, to: e.target.value })} /></label>
        <label className="f">Ext/Int<select value={p.ext} onChange={(e) => setP({ ...p, ext: e.target.value })}><option value="">All</option><option>EXTERNAL</option><option>INTERNAL</option></select></label>
        <label className="f">Client<select value={p.client} onChange={(e) => setP({ ...p, client: e.target.value })}><option value="">All</option>{clients.map((c) => <option key={c}>{c}</option>)}</select></label>
        <span className="muted small">{F.length} findings analysed</span>
      </div>
      <div className="tabs no-print">
        {([['overview', 'Key insights'], ['functions', 'Departments & functions'], ['recurring', 'Recurring issues'], ['interface', 'QMS interface']] as const).map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === 'overview' && (
        <div>
          <div className="card chart-card" data-title="Key insights" style={{ marginBottom: 12 }}>
            <h2>Key insights</h2>
            <ul className="insights">{A.headlines.map((h, i) => <li key={i} className={h.tone}>{h.text}</li>)}</ul>
            {!A.headlines.length && <div className="muted">Not enough findings in the period for pattern analysis.</div>}
          </div>
          <div className="cards wide">
            <ChartCard title="Findings trend by type"><BarChart stacked labels={A.months.map(lbl)} series={['NCR', 'OBSERVATION', 'AFI'].map((t) => ({ label: t, color: TYPE_COLORS[t], data: A.months.map((m) => F.filter((f) => f.d?.startsWith(m) && f.t === t).length) }))} /></ChartCard>
            <ChartCard title="External vs internal findings"><LineChart labels={A.months.map(lbl)} series={[{ label: 'External', data: A.months.map((m) => F.filter((f) => f.d?.startsWith(m) && f.e === 'EXTERNAL').length), color: '#c62828' }, { label: 'Internal', data: A.months.map((m) => F.filter((f) => f.d?.startsWith(m) && f.e === 'INTERNAL').length), color: '#2f80d1' }]} /></ChartCard>
            <ChartCard title="Root cause categories" sub="From the RCA category of each finding"><BarChart horizontal labels={A.rca.map((r) => r[0])} series={[{ label: 'Findings', data: A.rca.map((r) => r[1]), color: '#7b5ea7' }]} /></ChartCard>
            <ChartCard title="Top recurring themes" sub="Word pairs repeated across finding descriptions"><BarChart horizontal labels={A.themes.slice(0, 12).map((t) => t.term)} series={[{ label: 'Findings', data: A.themes.slice(0, 12).map((t) => t.rows.length), color: '#e69500' }]} /></ChartCard>
          </div>
        </div>
      )}

      {tab === 'functions' && (
        <div>
          <div className="card chart-card" data-title="Department and function scorecard" style={{ marginBottom: 12 }}>
            <h2>Department / function scorecard</h2>
            <div className="grid-wrap" style={{ maxHeight: 460 }}>
              <table className="grid"><thead><tr><th>Process / Area</th><th>Owning QSP</th><th>Findings</th><th>NCR</th><th>OBS</th><th>Open</th><th>Avg days to close</th><th>Closed ≤ 90 d</th><th>Repeat themes</th><th>External %</th></tr></thead>
                <tbody>{A.byProcess.map((r) => (
                  <tr key={r.p} onClick={() => open(`Process: ${r.p}`, r.rows)}>
                    <td><b>{r.p}</b></td><td>{r.qsp}</td><td className="num">{r.n}</td><td className={`num ${r.ncr ? 'flag' : ''}`}>{r.ncr || ''}</td><td className="num">{r.obs || ''}</td><td className="num">{r.open || ''}</td>
                    <td className="num">{r.avgClose === null ? '–' : Math.round(r.avgClose)}</td><td className="num">{r.in90 === null ? '–' : Math.round(r.in90 * 100) + '%'}</td><td className="num">{r.repeats || ''}</td><td className="num">{Math.round(r.ext * 100)}%</td>
                  </tr>))}</tbody></table>
            </div>
          </div>
          <div className="card chart-card" data-title="Findings heat map: process by month" style={{ marginBottom: 12 }}>
            <h2>Heat map: process × month</h2>
            <Heat rows={A.byProcess.slice(0, 15).map((r) => r.p)} cols={A.months.slice(-12)} colLabel={lbl} val={(r, c) => F.filter((f) => (f.p || '(blank)') === r && f.d?.startsWith(c)).length} onCell={(r, c) => open(`${r} · ${lbl(c)}`, F.filter((f) => (f.p || '(blank)') === r && f.d?.startsWith(c)))} />
          </div>
          <div className="cards wide">
            <ChartCard title="Findings by process and source" sub="Which QA/QC activity detects issues in each function"><BarChart stacked horizontal labels={A.byProcess.slice(0, 12).map((r) => r.p)} series={SOURCES.map((s, i) => ({ label: s, data: A.byProcess.slice(0, 12).map((r) => r.rows.filter((f) => (f.s || 'Other') === s).length), color: ['#0b3a6e', '#2f80d1', '#00897b', '#e69500', '#c62828', '#9e9d24'][i] }))} /></ChartCard>
            <ChartCard title="Open findings by actionee"><BarChart horizontal labels={A.byActionee.map((r) => r[0])} series={[{ label: 'Open', data: A.byActionee.map((r) => r[1]), color: '#c62828' }]} /></ChartCard>
            <ChartCard title="Findings by client"><BarChart horizontal labels={A.byClient.map((r) => r[0])} series={[{ label: 'Findings', data: A.byClient.map((r) => r[1]) }]} /></ChartCard>
          </div>
        </div>
      )}

      {tab === 'recurring' && (
        <div>
          <div className="cards wide">
            <div className="card chart-card" data-title="Recurring clusters: same process and root cause category">
              <h2>Same process, same root cause (≥ 3)</h2>
              <table className="plain"><thead><tr><th>Process / Area</th><th>Root cause category</th><th>Findings</th><th>Last</th></tr></thead><tbody>
                {A.clusters.map((c) => <tr key={c.key} onClick={() => open(c.key, c.rows)} style={{ cursor: 'pointer' }}><td>{c.p}</td><td>{c.rc}</td><td className="num red">{c.rows.length}</td><td>{fmtDate(c.last)}</td></tr>)}
              </tbody></table>
              {!A.clusters.length && <div className="muted small">No cluster of 3 or more. Record the Root Cause Category on each finding to strengthen this analysis.</div>}
            </div>
            <div className="card chart-card" data-title="Repeat issues on the same work order">
              <h2>Same work order, same process (≥ 2 in 12 months)</h2>
              <table className="plain"><thead><tr><th>WON</th><th>Client</th><th>Process</th><th>Findings</th></tr></thead><tbody>
                {A.woRepeat.map((c) => <tr key={c.key} onClick={() => open(c.key, c.rows)} style={{ cursor: 'pointer' }}><td><a onClick={(e) => { e.stopPropagation(); nav(`/wo/${c.won}`); }}>{c.won}</a></td><td>{c.cl}</td><td>{c.p}</td><td className="num red">{c.rows.length}</td></tr>)}
              </tbody></table>
              {!A.woRepeat.length && <div className="muted small">No repeats on a work order.</div>}
            </div>
          </div>
          <div className="card chart-card" data-title="Recurring themes in finding descriptions" style={{ marginTop: 12 }}>
            <h2>Recurring themes in finding descriptions</h2>
            <div className="chips-wrap">{A.themes.map((t) => <button key={t.term} className="sm" onClick={() => open(`Theme: ${t.term}`, t.rows)}>{t.term} <b>{t.rows.length}</b> <span className="muted">· {t.procs} process(es)</span></button>)}</div>
          </div>
          <div className="card chart-card" data-title="Possible repeat findings" style={{ marginTop: 12 }}>
            <h2>Possible repeat findings (similar wording, same process, within 12 months)</h2>
            <table className="plain"><thead><tr><th>Earlier</th><th>Later</th><th>Process</th><th>Similarity</th></tr></thead><tbody>
              {A.pairs.slice(0, 40).map((pr, i) => <tr key={i} onClick={() => open('Possible repeat', [pr.a, pr.b])} style={{ cursor: 'pointer' }}><td>{pr.a.n || pr.a.r} · {fmtDate(pr.a.d)}<div className="muted small clip">{pr.a.x}</div></td><td>{pr.b.n || pr.b.r} · {fmtDate(pr.b.d)}<div className="muted small clip">{pr.b.x}</div></td><td>{pr.a.p}</td><td className="num">{Math.round(pr.sim * 100)}%</td></tr>)}
            </tbody></table>
            {!A.pairs.length && <div className="muted small">No closely similar findings detected.</div>}
          </div>
        </div>
      )}

      {tab === 'interface' && (
        <div>
          <div className="card chart-card" data-title="QMS interface matrix" style={{ marginBottom: 12 }}>
            <h2>QA/QC activity × QMS element (owning QSP and ISO 9001:2015 clause)</h2>
            <div className="muted small" style={{ marginBottom: 8 }}>Each finding is mapped from its Process/Area to the owning QSP. All NCRs are also controlled under QSP-21. Mapping rules are editable in Admin → Settings.</div>
            <div className="grid-wrap" style={{ maxHeight: 520 }}>
              <table className="grid heat"><thead><tr><th>QSP</th><th>ISO clause</th>{SOURCES.map((s) => <th key={s}>{s}</th>)}<th>Total</th><th>NCR</th><th>Open</th><th>Training actions</th></tr></thead>
                <tbody>{A.matrix.map((m) => (
                  <tr key={m.q}>
                    <td><b>{m.q}</b> <span className="muted small">{QSP[m.q]?.title}</span></td><td>{QSP[m.q]?.iso}</td>
                    {SOURCES.map((s) => { const rows = m.rows.filter((f) => (f.s || 'Other') === s); return <td key={s} className="num" style={heatStyle(rows.length, A.maxCell)} onClick={() => rows.length && open(`${m.q} · ${s}`, rows)}>{rows.length || ''}</td>; })}
                    <td className="num" onClick={() => open(m.q, m.rows)}><b>{m.rows.length}</b></td><td className={`num ${m.ncr ? 'flag' : ''}`}>{m.ncr || ''}</td><td className="num">{m.open || ''}</td><td className="num">{m.training || ''}</td>
                  </tr>))}</tbody></table>
            </div>
          </div>
          <div className="card chart-card" data-title="QSP timeline compliance">
            <h2>QMS timeline compliance</h2>
            <table className="plain"><thead><tr><th>Control</th><th>Requirement</th><th>Result</th><th>Basis</th></tr></thead><tbody>
              {A.compliance.map((c) => <tr key={c.ref}><td><b>{c.ref}</b></td><td>{c.req}</td><td className={c.ok === false ? 'red' : c.ok ? 'green-t' : ''}><b>{c.result}</b></td><td className="small muted">{c.basis}</td></tr>)}
            </tbody></table>
            <div className="muted small" style={{ marginTop: 6 }}>Verify requirements against the current controlled copy on the QMS server.</div>
          </div>
        </div>
      )}

      {drill && (
        <Drawer wide title={`${drill.title} (${drill.rows.length})`} onClose={() => setDrill(null)}>
          <table className="plain"><thead><tr><th>UID</th><th>Report / Finding</th><th>Type</th><th>Source</th><th>Client / WON</th><th>Process</th><th>Issued</th><th>Status</th><th>Description</th></tr></thead><tbody>
            {drill.rows.map((f) => <tr key={f.id} onClick={() => nav(`/r/FND?id=${f.id}&year=`)} style={{ cursor: 'pointer' }}><td>{f.uid}</td><td>{f.r} {f.n}</td><td>{f.t}</td><td>{f.s}</td><td>{f.cl} {f.won}</td><td>{f.p}</td><td>{fmtDate(f.d)}</td><td>{f.st}</td><td className="small">{(f.x || '').slice(0, 220)}</td></tr>)}
          </tbody></table>
        </Drawer>
      )}
    </div>
  );
}

const lbl = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]}-${ym.slice(2, 4)}`;
function heatStyle(v: number, max: number) {
  if (!v) return {};
  const a = Math.min(1, v / Math.max(1, max));
  return { background: `rgba(198, 40, 40, ${0.1 + a * 0.6})`, color: a > 0.55 ? '#fff' : undefined, cursor: 'pointer' };
}

function Heat({ rows, cols, val, colLabel, onCell }: { rows: string[]; cols: string[]; val: (r: string, c: string) => number; colLabel: (c: string) => string; onCell: (r: string, c: string) => void }) {
  const data = rows.map((r) => cols.map((c) => val(r, c)));
  const max = Math.max(1, ...data.flat());
  return (
    <div className="grid-wrap" style={{ maxHeight: 520 }}>
      <table className="grid heat"><thead><tr><th>Process / Area</th>{cols.map((c) => <th key={c}>{colLabel(c)}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={r}><td><b>{r}</b></td>{data[i].map((v, j) => <td key={j} className="num" style={heatStyle(v, max)} onClick={() => v && onCell(r, cols[j])}>{v || ''}</td>)}</tr>)}</tbody></table>
    </div>
  );
}

function analyse(F: F[], d: any, rules: [string, string][]) {
  const empty = { months: [] as string[], headlines: [] as { text: string; tone: string }[], byProcess: [] as any[], rca: [] as [string, number][], themes: [] as any[], clusters: [] as any[], woRepeat: [] as any[], pairs: [] as any[], matrix: [] as any[], maxCell: 1, compliance: [] as any[], byActionee: [] as [string, number][], byClient: [] as [string, number][] };
  if (!d) return empty;
  const months: string[] = [];
  { let yy = +d.from.slice(0, 4), mm = +d.from.slice(5, 7); const ey = +d.to.slice(0, 4), em = +d.to.slice(5, 7); while ((yy < ey || (yy === ey && mm <= em)) && months.length < 48) { months.push(`${yy}-${String(mm).padStart(2, '0')}`); mm++; if (mm > 12) { mm = 1; yy++; } } }
  const today = new Date().toISOString().slice(0, 10);
  const cutoff = months.filter((m) => m <= today.slice(0, 7));
  const group = <K,>(rows: F[], key: (f: F) => K) => { const m = new Map<K, F[]>(); for (const f of rows) { const k = key(f); (m.get(k) || m.set(k, []).get(k)!).push(f); } return m; };
  const count = (m: Map<string, F[]>) => [...m].map(([k, v]) => [k, v.length] as [string, number]).sort((a, b) => b[1] - a[1]);

  // themes: word pairs (bigrams) repeated across findings
  const tok = new Map<number, string[]>();
  const big = new Map<string, Set<F>>();
  for (const f of F) {
    const t = tokens(f.x);
    tok.set(f.id, t);
    const seen = new Set<string>();
    for (let i = 0; i < t.length - 1; i++) { const b = `${t[i]} ${t[i + 1]}`; if (!seen.has(b)) { seen.add(b); (big.get(b) || big.set(b, new Set()).get(b)!).add(f); } }
  }
  const themes = [...big].filter(([, s]) => s.size >= 3).map(([term, s]) => ({ term, rows: [...s], procs: new Set([...s].map((f) => f.p)).size })).sort((a, b) => b.rows.length - a.rows.length).slice(0, 40);

  // per process
  const themeCount = new Map<string, number>();
  for (const t of themes) for (const f of t.rows) themeCount.set(f.p || '(blank)', (themeCount.get(f.p || '(blank)') || 0) + 1);
  const byProcess = [...group(F, (f) => f.p || '(blank)')].map(([p, rows]) => {
    const closed = rows.filter((f) => isClosed(f.st) && f.cd && f.d);
    const days = closed.map((f) => dd(f.d, f.cd)!).filter((x) => x >= 0);
    return { p, rows, qsp: mapProcess(p, rules), n: rows.length, ncr: rows.filter((f) => f.t === 'NCR').length, obs: rows.filter((f) => f.t === 'OBSERVATION').length, open: rows.filter((f) => !isClosed(f.st)).length,
      avgClose: days.length ? days.reduce((a, b) => a + b, 0) / days.length : null, in90: days.length ? days.filter((x) => x <= 90).length / days.length : null, repeats: themeCount.get(p) || 0, ext: rows.filter((f) => f.e === 'EXTERNAL').length / rows.length };
  }).sort((a, b) => b.n - a.n);

  // clusters
  const clusters = [...group(F.filter((f) => f.rc), (f) => `${f.p || '(blank)'} | ${f.rc}`)].filter(([, v]) => v.length >= 3).map(([key, rows]) => ({ key, p: rows[0].p, rc: rows[0].rc, rows, last: rows.map((f) => f.d).sort().pop() })).sort((a, b) => b.rows.length - a.rows.length);
  const yearAgo = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  const woRepeat = [...group(F.filter((f) => f.won && f.d >= yearAgo), (f) => `${f.won} | ${f.p || '(blank)'}`)].filter(([, v]) => v.length >= 2 && new Set(v.map((f) => f.r)).size >= 2).map(([key, rows]) => ({ key, won: rows[0].won, cl: rows[0].cl, p: rows[0].p, rows })).sort((a, b) => b.rows.length - a.rows.length).slice(0, 30);

  // similar wording pairs (Jaccard) within a process, 365 days apart at most, different reports
  const pairs: { a: F; b: F; sim: number }[] = [];
  const procGroups = group(F.slice(-1500), (f) => f.p || '(blank)');
  for (const rows of procGroups.values()) {
    const sorted = [...rows].sort((a, b) => (a.d || '').localeCompare(b.d || ''));
    for (let i = 0; i < sorted.length; i++) {
      const A = new Set(tok.get(sorted[i].id));
      if (A.size < 4) continue;
      for (let j = i + 1; j < sorted.length; j++) {
        const g = dd(sorted[i].d, sorted[j].d);
        if (g !== null && g > 365) break;
        if (sorted[i].r === sorted[j].r) continue;
        const B = new Set(tok.get(sorted[j].id));
        if (B.size < 4) continue;
        let inter = 0; for (const w of A) if (B.has(w)) inter++;
        const sim = inter / (A.size + B.size - inter);
        if (sim >= 0.45) pairs.push({ a: sorted[i], b: sorted[j], sim });
      }
    }
  }
  pairs.sort((a, b) => b.sim - a.sim);

  // QMS interface matrix
  const trainingRefs = new Set<string>((d.trainings || []).map((t: any) => String(t.ref || '').trim()).filter(Boolean));
  const byQsp = group(F, (f) => mapProcess(f.p, rules));
  const ncrAll = F.filter((f) => f.t === 'NCR');
  const matrix = [...byQsp].map(([q, rows]) => ({ q, rows, ncr: rows.filter((f) => f.t === 'NCR').length, open: rows.filter((f) => !isClosed(f.st)).length, training: rows.filter((f) => trainingRefs.has(String(f.n || '').trim()) || trainingRefs.has(String(f.r || '').trim())).length }))
    .concat(ncrAll.length ? [{ q: 'QSP-21', rows: ncrAll, ncr: ncrAll.length, open: ncrAll.filter((f) => !isClosed(f.st)).length, training: 0 }] : [])
    .sort((a, b) => a.q.localeCompare(b.q, undefined, { numeric: true }));
  let maxCell = 1;
  for (const m of matrix) for (const s of SOURCES) maxCell = Math.max(maxCell, m.rows.filter((f) => (f.s || 'Other') === s).length);

  // compliance with QSP timelines
  const appr = F.filter((f) => f.ca && f.d);
  const in14 = appr.filter((f) => dd(f.d, f.ca)! <= 14).length;
  const closedF = F.filter((f) => isClosed(f.st) && f.cd && f.d);
  const in90 = closedF.filter((f) => dd(f.d, f.cd)! <= 90).length;
  const obs = F.filter((f) => f.t === 'OBSERVATION');
  const obsRca = obs.filter((f) => (f.root || '').trim()).length;
  const complaints = (d.feedback || []).filter((c: any) => c.s === 'Complaint');
  const compClosed = complaints.filter((c: any) => c.cd && c.d);
  const comp30 = compClosed.filter((c: any) => dd(c.d, c.cd)! <= 30).length;
  const sixAgo = new Date(Date.now() - 183 * 86400000).toISOString().slice(0, 10);
  const audited = new Set((d.audits || []).filter((a: any) => (a.ad || '') >= sixAgo).map((a: any) => String(a.p || '').trim().toLowerCase()));
  const functions = [...new Set((d.audits || []).map((a: any) => String(a.p || '').trim()).filter(Boolean))] as string[];
  const notAudited = functions.filter((p) => !audited.has(p.toLowerCase()));
  const mrmDates = (d.mrm || []).map((m: any) => m.ad || '').filter(Boolean).sort();
  const lastMrm = mrmDates[mrmDates.length - 1];
  const mrmGap = lastMrm ? dd(lastMrm, today)! : null;
  const ncrTrained = ncrAll.filter((f) => trainingRefs.has(String(f.n || '').trim())).length;
  const pctS = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}% (${a}/${b})` : 'no data');
  const compliance = [
    { ref: 'QSP-07 §8.4', req: 'Corrective action proposed within 14 days', result: pctS(in14, appr.length), ok: appr.length ? in14 / appr.length >= 0.9 : null, basis: 'CA approval date vs issue date' },
    { ref: 'QSP-07 §8.4', req: 'Corrective action implemented within 90 days', result: pctS(in90, closedF.length), ok: closedF.length ? in90 / closedF.length >= 0.9 : null, basis: 'Close-out date vs issue date' },
    { ref: 'QSP-21 §8.2', req: 'Relevant observation: root cause and correction within 15 days', result: `${pctS(obsRca, obs.length)} with root cause recorded`, ok: obs.length ? obsRca / obs.length >= 0.9 : null, basis: 'Record date of the root cause is not captured; share of observations with a root cause shown' },
    { ref: 'QSP-20 Table 9.4', req: 'Customer complaints closed within 30 days', result: pctS(comp30, compClosed.length), ok: compClosed.length ? comp30 / compClosed.length >= 0.9 : null, basis: 'Customer Feedback Register closure date' },
    { ref: 'QSP-07 §8.1.1', req: 'Each function audited at least every 6 months', result: functions.length ? `${functions.length - notAudited.length}/${functions.length} functions audited in last 6 months` : 'no data', ok: functions.length ? !notAudited.length : null, basis: notAudited.length ? `Not audited: ${notAudited.slice(0, 8).join(', ')}` : 'Audit Plan actual dates by department/process' },
    { ref: 'QSP-06 §8.4', req: 'Management review at least every 6 months', result: lastMrm ? `Last MRM ${fmtDate(lastMrm)} (${Math.round(mrmGap!)} days ago)` : 'no MRM recorded', ok: mrmGap === null ? null : mrmGap <= 183, basis: 'Management Review Meetings register' },
    { ref: 'QSP-09 / QSP-21', req: 'NCRs followed by a training action (Observation/NCR ref in the Training Register)', result: pctS(ncrTrained, ncrAll.length), ok: null, basis: 'Interface indicator, not a QSP timeline' },
  ];

  // headlines
  const headlines: { text: string; tone: string }[] = [];
  if (byProcess[0] && F.length >= 5) headlines.push({ text: `${byProcess[0].p} raises the most findings: ${byProcess[0].n} of ${F.length} (${Math.round((byProcess[0].n / F.length) * 100)}%), owning procedure ${byProcess[0].qsp}.`, tone: 'warn' });
  const last6 = cutoff.slice(-6), prev6 = cutoff.slice(-12, -6);
  const cnt = (ms: string[], t?: string) => F.filter((f) => ms.some((m) => f.d?.startsWith(m)) && (!t || f.t === t)).length;
  if (prev6.length === 6) {
    const a = cnt(last6), b = cnt(prev6);
    if (b) headlines.push({ text: `Findings in the last 6 months: ${a} vs ${b} in the previous 6 months (${a >= b ? '+' : ''}${Math.round(((a - b) / b) * 100)}%).`, tone: a > b ? 'bad' : 'good' });
    const na = cnt(last6, 'NCR'), nb = cnt(prev6, 'NCR');
    if (na || nb) headlines.push({ text: `NCRs: ${na} in the last 6 months vs ${nb} before.`, tone: na > nb ? 'bad' : 'good' });
  }
  if (clusters.length) headlines.push({ text: `${clusters.length} recurring cluster(s) of the same process and root cause; largest: ${clusters[0].p} / ${clusters[0].rc} (${clusters[0].rows.length}).`, tone: 'bad' });
  if (woRepeat.length) headlines.push({ text: `${woRepeat.length} work order(s) show repeat findings in the same process within 12 months; top: WON ${woRepeat[0].won} ${woRepeat[0].p} (${woRepeat[0].rows.length}).`, tone: 'bad' });
  if (themes[0]) headlines.push({ text: `Most repeated theme: "${themes[0].term}" in ${themes[0].rows.length} findings across ${themes[0].procs} process(es).`, tone: 'warn' });
  if (pairs.length) headlines.push({ text: `${pairs.length} pair(s) of findings with similar wording in the same process within 12 months: candidates for ineffective corrective action.`, tone: 'bad' });
  const slow = byProcess.filter((r) => r.in90 !== null && r.in90 < 0.7 && r.n >= 3);
  if (slow.length) headlines.push({ text: `Slow close-out (< 70% within 90 days): ${slow.slice(0, 4).map((r) => r.p).join(', ')}.`, tone: 'bad' });
  const noRca = F.filter((f) => !f.rc).length;
  if (F.length && noRca / F.length > 0.5) headlines.push({ text: `${Math.round((noRca / F.length) * 100)}% of findings have no root cause category recorded; pattern analysis by root cause is limited.`, tone: 'warn' });
  for (const c of compliance) if (c.ok === false) headlines.push({ text: `${c.ref}: ${c.req} — ${c.result}.`, tone: 'bad' });

  const byActionee = count(group(F.filter((f) => !isClosed(f.st)), (f) => f.a || '(not assigned)')).slice(0, 12);
  const byClient = count(group(F, (f) => f.cl || '(blank)')).slice(0, 12);
  const rca = count(group(F, (f) => f.rc || '(not recorded)'));
  return { months: cutoff, headlines, byProcess, rca, themes, clusters, woRepeat, pairs, matrix, maxCell, compliance, byActionee, byClient };
}
