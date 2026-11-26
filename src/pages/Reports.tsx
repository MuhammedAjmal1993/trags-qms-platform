import { useEffect, useMemo, useRef, useState } from 'react';
import { api, qs } from '../api';
import { useApp } from '../ctx';
import { Spinner, pct } from '../components/ui';
import { ChartCard, BarChart, LineChart, TYPE_COLORS, exportChartsToPptx } from '../components/Charts';
import { monthsBetween, mLabel } from './Dashboard';
import { monthlyReportDocx } from '../lib/report';
import { exportRegister, exportTable, saveBlob } from '../lib/excel';
import { fmtDate } from '../../shared/logic';
import type { RegisterConfig } from '../../shared/registers';

function prevMonth() {
  const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1);
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${y}-${String(m).padStart(2, '0')}-01`, to: `${y}-${String(m).padStart(2, '0')}-${last}` };
}

export default function Reports() {
  const [tab, setTab] = useState<'monthly' | 'exports' | 'audit'>('monthly');
  return (
    <div>
      <div className="page-head"><div><h1>Reports &amp; Exports</h1><div className="muted small">TRAGS QC Monthly Report for any period, register exports, NCR / observation lists and audit reports.</div></div></div>
      <div className="tabs">
        <button className={tab === 'monthly' ? 'on' : ''} onClick={() => setTab('monthly')}>QC Monthly Report</button>
        <button className={tab === 'exports' ? 'on' : ''} onClick={() => setTab('exports')}>Register &amp; finding exports</button>
        <button className={tab === 'audit' ? 'on' : ''} onClick={() => setTab('audit')}>Audit report</button>
      </div>
      {tab === 'monthly' ? <Monthly /> : tab === 'exports' ? <Exports /> : <AuditReport />}
    </div>
  );
}

function Monthly() {
  const { user, toast } = useApp();
  const [p, setP] = useState(prevMonth());
  const [f, setF] = useState({ client: '', won: '', extint: '' });
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const charts = useRef<HTMLDivElement>(null);
  const label = useMemo(() => (p.from.slice(0, 7) === p.to.slice(0, 7) ? mLabel(p.from.slice(0, 7)).replace('-', ' 20') : `${fmtDate(p.from)} to ${fmtDate(p.to)}`), [p]);
  const gen = async () => { setBusy(true); try { setD(await api.get(`/api/stats/monthly${qs({ ...p, ...f })}`)); } catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); } };
  useEffect(() => { gen(); }, []);
  const months = monthsBetween(p.from, p.to);
  const k = d?.kpi;
  return (
    <div>
      <div className="row card no-print" style={{ padding: 10, marginBottom: 12 }}>
        <label className="f">Month<input type="month" value={p.from.slice(0, 7)} onChange={(e) => { const [y, m] = e.target.value.split('-').map(Number); const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); setP({ from: `${e.target.value}-01`, to: `${e.target.value}-${last}` }); }} /></label>
        <label className="f">or from<input type="date" value={p.from} onChange={(e) => setP({ ...p, from: e.target.value })} /></label>
        <label className="f">to<input type="date" value={p.to} onChange={(e) => setP({ ...p, to: e.target.value })} /></label>
        <label className="f">Client<input value={f.client} placeholder="All" onChange={(e) => setF({ ...f, client: e.target.value })} /></label>
        <label className="f">WON<input value={f.won} placeholder="All" style={{ width: 110 }} onChange={(e) => setF({ ...f, won: e.target.value.trim() })} /></label>
        <button className="primary" onClick={gen} disabled={busy}>{busy ? 'Generating…' : 'Generate'}</button>
        {d && <>
          <button onClick={async () => { setBusy(true); try { await monthlyReportDocx(d, { ...p, label }, charts.current, user?.name || ''); } finally { setBusy(false); } }}>Word (.docx)</button>
          <button onClick={() => window.print()}>PDF / Print</button>
          <button onClick={() => charts.current && exportChartsToPptx(charts.current, 'TRAGS QA/QC Monthly Update', label)}>PowerPoint (charts)</button>
          <button onClick={() => exportTable('Findings', ['UID', 'Report No', 'Finding No', 'Type', 'Criticality', 'WON', 'Client', 'Source', 'Ext/Int', 'Issued', 'Status', 'Description'], d.lists.newFindings.map((x: any) => [x.uid, x.report_no, x.finding_no, x.finding_type, x.criticality, x.won, x.client, x.sub_category, x.ext_int, x.plan_date, x.status, x.description]), `Findings ${label}.xlsx`)}>Excel (findings)</button>
        </>}
      </div>
      {!d ? <Spinner /> : (
        <div className="report">
          <div className="muted small">TRADING AND AGENCY SERVICES LIMITED COMPANY W.L.L. (TRAGS)</div>
          <h1>QA/QC Monthly Report · {label}</h1>
          <div className="muted small">Generated {fmtDate(new Date().toISOString().slice(0, 10))} from platform data{f.client ? ` · ${f.client}` : ''}{f.won ? ` · WON ${f.won}` : ''}</div>
          <div className="kpis" style={{ marginTop: 14 }}>
            <div className="kpi"><div className="l">Audits conducted</div><div className="v">{k.audits_conducted}/{k.audits_planned}</div><div className="s">{pct(k.audit_completion)} completion</div></div>
            <div className="kpi"><div className="l">Findings raised</div><div className="v">{k.findings_total}</div><div className="s">NCR {k.ncr} · OBS {k.obs} · AFI {k.afi}</div></div>
            <div className="kpi"><div className="l">Closure rate</div><div className="v">{pct(k.closure_rate)}</div></div>
            <div className="kpi"><div className="l">Weld repair rate</div><div className="v">{pct(k.repair_rate, 2)}</div><div className="s">{k.films_rej}/{k.films_rt} films</div></div>
            <div className="kpi"><div className="l">RFI rejection</div><div className="v">{pct(k.rfi_rejection)}</div><div className="s">{k.rfi_total} RFIs</div></div>
            <div className="kpi"><div className="l">Training</div><div className="v">{k.trainings_conducted}</div><div className="s">{k.participants} participants</div></div>
            <div className="kpi"><div className="l">Customer feedback</div><div className="v">{k.feedback_total}</div><div className="s">{k.complaints_open} complaints open</div></div>
          </div>
          <div className="cards" ref={charts}>
            <ChartCard title="Findings by type"><BarChart stacked labels={months.map(mLabel)} series={['NCR', 'OBSERVATION', 'AFI'].map((t) => ({ label: t, color: TYPE_COLORS[t], data: months.map((m) => Number(d.findings.byMonth.find((r: any) => r.m === m && r.t === t)?.n ?? 0)) }))} /></ChartCard>
            <ChartCard title="Findings by source"><BarChart labels={d.findings.bySub.map((r: any) => r.k)} series={[{ label: 'Raised', data: d.findings.bySub.map((r: any) => r.n) }, { label: 'Closed', data: d.findings.bySub.map((r: any) => r.closed), color: '#2e7d32' }]} /></ChartCard>
            <ChartCard title="Weld repair rate"><LineChart pct labels={months.map(mLabel)} series={[{ label: 'Repair rate', data: months.map((m) => { const r = d.welding.byMonth.find((x: any) => x.m === m); return r?.films ? r.rej / r.films : null; }) }, { label: 'Target 2%', data: months.map(() => 0.02), color: '#c62828', dashed: true }]} /></ChartCard>
            <ChartCard title="Findings by client"><BarChart horizontal labels={d.findings.byClient.map((r: any) => r.k)} series={[{ label: 'Total', data: d.findings.byClient.map((r: any) => r.n), color: '#9fbfe3' }, { label: 'Open', data: d.findings.byClient.map((r: any) => r.open), color: '#c62828' }]} /></ChartCard>
          </div>
          <Section title="Audits" rows={d.lists.audits} cols={[['uid', 'UID'], ['report_no', 'Report No.'], ['sub_category', 'Type'], ['ext_int', 'Ext/Int'], ['client', 'Client'], ['won', 'WON'], ['plan_date', 'Plan'], ['actual_date', 'Actual'], ['ncr', 'NCR'], ['obs', 'OBS'], ['afi', 'AFI'], ['status', 'Status']]} />
          <Section title="Findings raised" rows={d.lists.newFindings} cols={[['uid', 'UID'], ['report_no', 'Report No.'], ['finding_no', 'Finding No.'], ['finding_type', 'Type'], ['criticality', 'Criticality'], ['client', 'Client'], ['won', 'WON'], ['plan_date', 'Issued'], ['status', 'Status']]} />
          <Section title="Findings closed" rows={d.lists.closedFindings} cols={[['uid', 'UID'], ['report_no', 'Report No.'], ['finding_no', 'Finding No.'], ['finding_type', 'Type'], ['client', 'Client'], ['close_date', 'Closed']]} />
          <Section title="Open findings (all years)" rows={d.lists.openFindings} cols={[['uid', 'UID'], ['report_no', 'Report No.'], ['finding_no', 'Finding No.'], ['finding_type', 'Type'], ['client', 'Client'], ['plan_date', 'Issued'], ['age', 'Age (d)'], ['actionee', 'Actionee']]} />
          <Section title="Training conducted" rows={d.lists.trainings} cols={[['uid', 'UID'], ['sub_category', 'Type'], ['subject', 'Subject'], ['won', 'WON'], ['actual_date', 'Date'], ['participants', 'Participants']]} />
          <Section title="Customer feedback" rows={d.lists.feedback} cols={[['uid', 'UID'], ['sub_category', 'Type'], ['client', 'Client'], ['plan_date', 'Date'], ['description', 'Description'], ['status', 'Status']]} />
        </div>
      )}
    </div>
  );
}

function Section({ title, rows, cols }: { title: string; rows: any[]; cols: [string, string][] }) {
  return (
    <div style={{ marginTop: 18 }}>
      <h2>{title} ({rows.length})</h2>
      {rows.length ? <table className="plain"><thead><tr>{cols.map(([, l]) => <th key={l}>{l}</th>)}</tr></thead><tbody>
        {rows.map((r, i) => <tr key={i}>{cols.map(([k]) => <td key={k}>{/date/.test(k) ? fmtDate(r[k]) : r[k]}</td>)}</tr>)}</tbody></table> : <div className="muted">None.</div>}
    </div>
  );
}

function Exports() {
  const { registers, can, toast } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const y = new Date().getFullYear();
  const [p, setP] = useState({ from: `${y}-01-01`, to: `${y}-12-31` });
  const exp = async (r: RegisterConfig) => {
    setBusy(r.code);
    try { const d = await api.get(`/api/records/${r.code}`); await exportRegister(r, d.rows); } catch (e: any) { toast(e.message, 'err'); } finally { setBusy(null); }
  };
  const findingList = async (type: 'NCR' | 'OBSERVATION' | 'AFI') => {
    const fnd = registers.find((r) => r.code === 'FND') as RegisterConfig;
    const d = await api.get(`/api/records/FND${qs(p)}`);
    const rows = d.rows.filter((r: any) => String(r.data.finding_type || '').toUpperCase() === type);
    await exportRegister(fnd, rows, `${type === 'NCR' ? 'NCR' : type === 'OBSERVATION' ? 'Observation' : 'AFI'} Report ${p.from} to ${p.to}.xlsx`);
  };
  return (
    <div>
      <h2>One-click register exports</h2>
      <div className="cards" style={{ marginBottom: 18 }}>
        {registers.map((r) => <div key={r.code} className="card row" style={{ justifyContent: 'space-between' }}><div><b>{r.name}</b><div className="muted small">{r.count} rows</div></div>
          {can('reports', 'export') || can('findings', 'export') ? <button disabled={busy === r.code} onClick={() => exp(r)}>{busy === r.code ? 'Exporting…' : 'Excel'}</button> : null}</div>)}
      </div>
      <h2>NCR / observation / AFI reports</h2>
      <div className="row card">
        <label className="f">From<input type="date" value={p.from} onChange={(e) => setP({ ...p, from: e.target.value })} /></label>
        <label className="f">To<input type="date" value={p.to} onChange={(e) => setP({ ...p, to: e.target.value })} /></label>
        <button onClick={() => findingList('NCR')}>NCR report (Excel)</button>
        <button onClick={() => findingList('OBSERVATION')}>Observation report (Excel)</button>
        <button onClick={() => findingList('AFI')}>AFI report (Excel)</button>
        <span className="muted small">Individual NCR and F271 observation forms are generated from each finding in the Finding Register.</span>
      </div>
    </div>
  );
}

function AuditReport() {
  const { toast } = useApp();
  const [audits, setAudits] = useState<any[]>([]);
  const [sel, setSel] = useState('');
  useEffect(() => { api.get('/api/records/AUD').then((d) => setAudits(d.rows.filter((r: any) => r.data.report_no).reverse())); }, []);
  const gen = async () => {
    const a = audits.find((x) => String(x.id) === sel);
    if (!a) return;
    const f = await api.get(`/api/records/FND${qs({ q: a.data.report_no })}`);
    const findings = f.rows.filter((r: any) => r.data.report_no === a.data.report_no);
    const docx: any = await import('docx');
    const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType } = docx;
    const cell = (t: any, head = false) => new TableCell({ shading: head ? { type: ShadingType.CLEAR, color: 'auto', fill: '1E4F86' } : undefined, children: [new Paragraph({ children: [new TextRun({ text: String(t ?? ''), bold: head, color: head ? 'FFFFFF' : '1B2733', size: 18 })] })] });
    const kv = (rows: [string, any][]) => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: rows.map(([k, v]) => new TableRow({ children: [cell(k, true), cell(v)] })) });
    const d = a.data;
    const doc = new Document({ sections: [{ children: [
      new Paragraph({ children: [new TextRun({ text: 'TRADING AND AGENCY SERVICES LIMITED COMPANY W.L.L. (TRAGS)', bold: true, size: 18, color: '5D6B7A' })] }),
      new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: `${d.sub_category || 'Audit'} Report ${d.report_no}`, bold: true, size: 36, color: '0B3A6E' })] }),
      kv([['UID', d.uid], ['Type', `${d.primary || ''} · ${d.sub_category || ''} · ${d.ext_int || ''}`], ['Client / WON', `${d.client || ''} / ${d.won || ''}`], ['Project', d.project], ['Department / Process', d.process], ['Auditor', d.auditor], ['Auditee', d.auditee], ['Planned date', fmtDate(d.plan_date)], ['Actual date', fmtDate(d.actual_date)], ['Follow-up date', fmtDate(d.followup_date)], ['Findings', `NCR ${d.ncr_no || 0} · Observation ${d.obs_no || 0} · AFI/OFI ${d.ofi_no || 0}`], ['Status', d.status]]),
      new Paragraph({ spacing: { before: 240, after: 120 }, children: [new TextRun({ text: 'Findings', bold: true, size: 26, color: '0B3A6E' })] }),
      findings.length ? new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ tableHeader: true, children: ['Finding No.', 'Type', 'Criticality', 'Process/Area', 'Description', 'Actionee', 'Status'].map((h) => cell(h, true)) }),
        ...findings.map((r: any) => new TableRow({ children: [r.data.finding_no, r.data.finding_type, r.data.criticality, r.data.process, r.data.description, r.data.actionee, r.data.status].map((v) => cell(v)) }))] })
        : new Paragraph({ children: [new TextRun({ text: 'No findings recorded against this report number in the Finding Register.' })] }),
      new Paragraph({ spacing: { before: 240 }, children: [new TextRun({ text: 'Corrective actions are proposed within 14 days and implemented within 90 days of the report (QSP-07 §8.4). Verify against the current controlled copy on the QMS server.', italics: true, size: 18, color: '5D6B7A' })] }),
    ] }] });
    saveBlob(await Packer.toBlob(doc), `Audit Report ${d.report_no}.docx`);
    toast('Audit report generated.');
  };
  return (
    <div className="card row">
      <label className="f" style={{ minWidth: 420 }}>Audit (from the Audit Plan)<select value={sel} onChange={(e) => setSel(e.target.value)}><option value="">Select…</option>
        {audits.map((a) => <option key={a.id} value={a.id}>{a.data.report_no} · {a.data.sub_category} · {a.data.client} · {fmtDate(a.data.actual_date || a.data.plan_date)}</option>)}</select></label>
      <button className="primary" disabled={!sel} onClick={gen}>Generate audit report (Word)</button>
    </div>
  );
}
