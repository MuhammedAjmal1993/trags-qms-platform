import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api, fileUrl } from '../api';
import { useApp } from '../ctx';
import { FileDrop, Spinner, Drawer, statusChip, Confirm } from '../components/ui';
import { RecordForm } from '../components/RecordForm';
import type { RegisterConfig, Column } from '../../shared/registers';
import { mapHeaders, normHeader } from '../../shared/logic';
import { readWorkbook, analyseSheets, readRows, readValidationLists, matchListToColumn } from '../lib/excel';

const DOC_KINDS = [
  ['auto', 'Detect automatically'], ['register', 'Excel register (structured import)'], ['audit_notification', 'Audit notification'],
  ['findings_report', 'Audit / surveillance / QWA / NCR report'], ['inspection_report', 'Inspection report (source / NFI / RFI)'],
  ['site_report', 'Site quality report'], ['training_record', 'Training record'], ['customer_feedback', 'Customer feedback'], ['hr_update', 'Joiner / resignation / transfer notice'],
];

export default function Ingest() {
  const [sp] = useSearchParams();
  const { toast, registers, can } = useApp();
  const [kind, setKind] = useState(sp.get('target') ? 'register' : 'auto');
  const [list, setList] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [excel, setExcel] = useState<{ file: File; uploadId: number } | null>(null);
  const [review, setReview] = useState<number | null>(null);
  const load = () => api.get('/api/uploads').then(setList).catch(() => {});
  useEffect(() => { load(); }, []);

  const onFiles = async (files: File[]) => {
    for (const file of files) {
      const isXlsx = /\.(xlsx|xlsm)$/i.test(file.name);
      const k = isXlsx && (kind === 'auto' || kind === 'register') ? 'register' : kind;
      setBusy(`Uploading ${file.name}…`);
      try {
        const fd = new FormData();
        fd.append('file', file); fd.append('kind', k);
        if (sp.get('target')) fd.append('target', sp.get('target')!);
        if (k !== 'register') setBusy(`Extracting ${file.name} with Workers AI… (up to a minute for scans)`);
        const r = await api.form('/api/uploads', fd);
        if (k === 'register') setExcel({ file, uploadId: r.id });
        else if (r.status === 'review') { toast(`${file.name}: ${r.proposals.length} row(s) extracted for review.`); setReview(r.id); }
        else toast(`${file.name}: ${r.error || r.status}`, 'err');
      } catch (e: any) { toast(`${file.name}: ${e.message}`, 'err'); }
    }
    setBusy(null);
    load();
  };

  return (
    <div>
      <div className="page-head"><div><h1>Upload Center</h1><div className="muted small">Excel registers are mapped by header name. Documents and scans are read by Workers AI; every extracted row is reviewed before it is saved.</div></div></div>
      {can('ingest', 'create') && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="row" style={{ marginBottom: 10 }}>
            <label className="f">Document type<select value={kind} onChange={(e) => setKind(e.target.value)}>{DOC_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            {sp.get('target') && <span className="chip">Target register: {registers.find((r) => r.code === sp.get('target'))?.name}</span>}
          </div>
          <FileDrop onFiles={onFiles} accept=".xlsx,.xlsm,.xls,.pdf,.docx,.png,.jpg,.jpeg,.webp,.gif,.bmp,.csv,.html,.htm" />
          {busy && <div className="row" style={{ marginTop: 10 }}><Spinner /> {busy}</div>}
        </div>
      )}
      <h2>Upload history</h2>
      <div className="grid-wrap" style={{ maxHeight: 520 }}>
        <table className="grid"><thead><tr><th>#</th><th>File</th><th>Type</th><th>Status</th><th>Uploaded by</th><th>Date (UTC)</th><th /></tr></thead>
          <tbody>{list.map((u) => (
            <tr key={u.id} onClick={() => (u.status === 'review' || u.status === 'applied' || u.status === 'error') && u.kind !== 'register' && setReview(u.id)}>
              <td>{u.id}</td><td>{u.filename}</td><td>{u.kind}</td><td>{statusChip(u.status)} {u.error && <span className="red small">{u.error.slice(0, 80)}</span>}</td>
              <td>{u.uploaded_by}</td><td>{u.created_at}</td><td>{u.status === 'review' && <button className="sm primary">Review</button>}</td>
            </tr>))}</tbody></table>
        {!list.length && <div className="empty">No uploads yet.</div>}
      </div>
      {excel && <ExcelImport file={excel.file} uploadId={excel.uploadId} target={sp.get('target')} onClose={() => { setExcel(null); load(); }} />}
      {review && <ReviewExtraction id={review} onClose={() => { setReview(null); load(); }} />}
    </div>
  );
}

function ExcelImport({ file, uploadId, target, onClose }: { file: File; uploadId: number; target: string | null; onClose: () => void }) {
  const { registers, toast, can, refreshRegisters } = useApp();
  const nav = useNavigate();
  const [wb, setWb] = useState<any>(null);
  const [code, setCode] = useState<string>(target || '');
  const [sheet, setSheet] = useState('');
  const [headerRow, setHeaderRow] = useState(1);
  const [mapping, setMapping] = useState<(string | null)[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mode, setMode] = useState<'upsert' | 'append' | 'reload'>('upsert');
  const [lists, setLists] = useState<Record<string, string[]>>({});
  const [useLists, setUseLists] = useState(true);
  const [addCols, setAddCols] = useState(true);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [confirm, setConfirm] = useState(false);
  const cfg = registers.find((r) => r.code === code) as RegisterConfig | undefined;

  useEffect(() => {
    readWorkbook(file).then((w) => {
      setWb(w);
      setLists(readValidationLists(w));
      if (!target) {
        // Pick the register whose labels best match a sheet's headers.
        let best = { code: '', score: -1 };
        for (const r of registers) { const s = analyseSheets(w, r as RegisterConfig)[0]; if (s && s.score > best.score) best = { code: r.code, score: s.score }; }
        setCode(best.code);
      }
    }).catch((e) => toast(`Could not read workbook: ${e.message}`, 'err'));
  }, [file]);

  const sheets = useMemo(() => (wb && cfg ? analyseSheets(wb, cfg) : []), [wb, cfg]);
  useEffect(() => { if (sheets[0]) { setSheet(sheets[0].name); setHeaderRow(sheets[0].headerRow); } }, [sheets]);
  useEffect(() => {
    if (!wb || !cfg || !sheet) return;
    const ws = wb.getWorksheet(sheet);
    const h: string[] = [];
    ws.getRow(headerRow).eachCell({ includeEmpty: true }, (c: any, i: number) => { h[i - 1] = String((c.value && typeof c.value === 'object' ? c.value.richText?.map((t: any) => t.text).join('') ?? c.value.result ?? c.value.text : c.value) ?? '').trim(); });
    setHeaders(h);
    setMapping(mapHeaders(cfg, h));
  }, [wb, cfg, sheet, headerRow]);

  const unmapped = headers.map((h, i) => ({ h, i })).filter((x) => x.h && !mapping[x.i]);
  const preview = useMemo(() => (wb && sheet && cfg ? readRows(wb, sheet, headerRow, mapping).rows : []), [wb, sheet, headerRow, mapping, cfg]);

  const run = async () => {
    if (!cfg) return;
    setConfirm(false);
    try {
      let conf: RegisterConfig = JSON.parse(JSON.stringify(cfg));
      let map = [...mapping];
      // Adopt unmapped workbook columns so the platform register matches the Excel layout.
      if (addCols && unmapped.length && can('admin', 'edit')) {
        for (const { h, i } of unmapped) {
          let key = normHeader(h).replace(/\s+/g, '_').slice(0, 40) || `col_${i + 1}`;
          while (conf.columns.some((c) => c.key === key)) key += '_x';
          conf.columns.push({ key, label: h, type: 'text' } as Column);
          map[i] = key;
        }
      }
      if (useLists && can('admin', 'edit')) {
        for (const [name, vals] of Object.entries(lists)) {
          const k = matchListToColumn(conf, name);
          const col = conf.columns.find((c) => c.key === k);
          if (col) col.options = [...new Set([...(col.options || []), ...vals])];
        }
      }
      if (JSON.stringify(conf) !== JSON.stringify(cfg) && can('admin', 'edit')) { await api.put(`/api/admin/registers/${code}`, conf); }
      const rows = readRows(wb, sheet, headerRow, map).rows;
      if (mode === 'reload') { setProgress('Clearing current rows (restorable)…'); await api.post(`/api/records/${code}/clear`); }
      const tot = { inserted: 0, updated: 0, unchanged: 0, total: 0 };
      for (let i = 0; i < rows.length; i += 200) {
        setProgress(`Importing rows ${i + 1}–${Math.min(i + 200, rows.length)} of ${rows.length}…`);
        const r = await api.post(`/api/records/${code}/bulk`, { rows: rows.slice(i, i + 200), mode: mode === 'upsert' ? 'upsert' : 'append', uploadId, seqStart: mode === 'reload' ? i : undefined });
        for (const k of Object.keys(tot) as (keyof typeof tot)[]) tot[k] += r[k];
      }
      if (code === 'FND' || code === 'AUD') { setProgress('Running Finding Register check…'); await api.post('/api/records/FND/resync'); }
      await api.post(`/api/uploads/${uploadId}/status`, { status: 'applied', target: code, result: { ...tot, sheet, headerRow } });
      setResult(tot); setProgress(null);
      refreshRegisters();
      toast(`Import complete: ${tot.inserted} new, ${tot.updated} updated, ${tot.unchanged} unchanged.`);
    } catch (e: any) { setProgress(null); toast(e.message, 'err'); }
  };

  return (
    <Drawer wide title={`Import ${file.name}`} onClose={onClose} footer={result ? <><button onClick={() => nav(`/r/${code}`)}>Open register</button><button className="primary" onClick={onClose}>Done</button></> :
      <><button onClick={onClose}>Cancel</button><button className="primary" disabled={!cfg || !!progress || !preview.length} onClick={() => setConfirm(true)}>Import {preview.length} rows</button></>}>
      {!wb ? <Spinner /> : (
        <div className="col" style={{ gap: 12 }}>
          <div className="row">
            <label className="f">Target register<select value={code} onChange={(e) => setCode(e.target.value)}>{registers.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}</select></label>
            <label className="f">Sheet<select value={sheet} onChange={(e) => { setSheet(e.target.value); const s = sheets.find((x) => x.name === e.target.value); if (s) setHeaderRow(s.headerRow); }}>{sheets.map((s) => <option key={s.name} value={s.name}>{s.name} ({s.score} matched headers)</option>)}</select></label>
            <label className="f">Header row<input type="number" min={1} value={headerRow} onChange={(e) => setHeaderRow(Number(e.target.value))} style={{ width: 80 }} /></label>
            <label className="f">Mode<select value={mode} onChange={(e) => setMode(e.target.value as any)}>
              <option value="upsert">Update by key, add new rows</option><option value="append">Append all rows</option>
              {can('admin', 'delete') && <option value="reload">Full reload (replace register)</option>}</select></label>
          </div>
          {can('admin', 'edit') && <div className="row small">
            <label className="row"><input type="checkbox" checked={addCols} onChange={(e) => setAddCols(e.target.checked)} /> Add {unmapped.length} unmapped workbook column(s) to the register</label>
            {Object.keys(lists).length > 0 && <label className="row"><input type="checkbox" checked={useLists} onChange={(e) => setUseLists(e.target.checked)} /> Load {Object.keys(lists).length} dropdown list(s) from the Validation sheet</label>}
          </div>}
          <h3>Column mapping (by header name)</h3>
          <div className="grid-wrap" style={{ maxHeight: 300 }}>
            <table className="grid"><thead><tr><th>Workbook header</th><th>Register column</th><th>Sample</th></tr></thead><tbody>
              {headers.map((h, i) => h ? (
                <tr key={i}><td>{h}</td><td>
                  <select value={mapping[i] || ''} onChange={(e) => { const m = [...mapping]; m[i] = e.target.value || null; setMapping(m); }}>
                    <option value="">— not imported{addCols ? ' (added as new column)' : ''} —</option>{cfg?.columns.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></td>
                  <td className="small">{String(preview[0]?.[mapping[i] || ''] ?? '').slice(0, 60)}</td></tr>) : null)}
            </tbody></table>
          </div>
          <div className="muted small">{preview.length} data rows found below header row {headerRow}. Blank rows and formula-only placeholder rows are skipped. Blank cells stay blank.</div>
          {progress && <div className="row"><Spinner /> {progress}</div>}
          {result && <div className="card"><b>Imported.</b> {result.inserted} new · {result.updated} updated · {result.unchanged} unchanged · {result.total} rows read.</div>}
        </div>
      )}
      {confirm && <Confirm danger={mode === 'reload'} yes="Import" onNo={() => setConfirm(false)} onYes={run}
        text={mode === 'reload' ? `Full reload: all current rows of ${cfg?.name} move to Deleted (restorable) and ${preview.length} rows are loaded from the workbook.` : `Import ${preview.length} rows into ${cfg?.name}?`} />}
    </Drawer>
  );
}

function ReviewExtraction({ id, onClose }: { id: number; onClose: () => void }) {
  const { registers, toast } = useApp();
  const [u, setU] = useState<any>(null);
  const [rows, setRows] = useState<{ register: string; data: any; include: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const [wos, setWos] = useState<any[]>([]);
  const load = () => api.get(`/api/uploads/${id}`).then((x) => { setU(x); setRows((x.extracted?.proposals || []).map((p: any) => ({ ...p, include: true }))); });
  useEffect(() => { load(); api.get('/api/stats/filters').then((f) => setWos(f.workorders)).catch(() => {}); }, [id]);

  const reextract = async (kind: string) => {
    setBusy(true);
    try { const r = await api.post(`/api/uploads/${id}/reextract`, { kind }); setRows(r.proposals.map((p: any) => ({ ...p, include: true }))); toast(`${r.proposals.length} row(s) extracted.`); } catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const apply = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/api/uploads/${id}/apply`, { rows: rows.filter((x) => x.include).map(({ register, data }) => ({ register, data })) });
      const ok = r.results.filter((x: any) => !x.error);
      const bad = r.results.filter((x: any) => x.error);
      toast(`${ok.length} row(s) saved${bad.length ? `, ${bad.length} failed: ${bad.map((b: any) => b.error).join('; ')}` : ''}.`, bad.length ? 'err' : 'ok');
      load();
    } catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  if (!u) return <Drawer title="Loading…" onClose={onClose}><Spinner /></Drawer>;
  const applied = u.status === 'applied';
  return (
    <Drawer wide title={`Review: ${u.filename}`} onClose={onClose}
      footer={<><a className="btn" href={fileUrl(u.r2_key)} target="_blank">Open source file</a><span style={{ flex: 1 }} />
        <select disabled={busy || applied} value="" onChange={(e) => e.target.value && reextract(e.target.value)}><option value="">Re-extract as…</option>{DOC_KINDS.slice(2).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <button onClick={onClose}>Close</button>{!applied && <button className="primary" disabled={busy || !rows.some((r) => r.include)} onClick={apply}>{busy ? 'Saving…' : `Save ${rows.filter((r) => r.include).length} row(s) to registers`}</button>}</>}>
      <div className="muted small" style={{ marginBottom: 8 }}>Detected type: <b>{u.kind}</b>. Red fields are inferred or missing in the source; check them against the document before saving. Audit notifications update the matching Audit Plan row (same report or notification number) or add a new planned audit.</div>
      {u.error && <div className="red">{u.error}</div>}
      {applied && <div className="card" style={{ marginBottom: 10 }}><b>Applied.</b> {(u.result || []).map((r: any, i: number) => <div key={i} className="small">{r.register} {r.uid || r.id || ''} {r.action || ''} {r.error && <span className="red">{r.error}</span>}</div>)}</div>}
      {rows.map((r, i) => {
        const cfg = registers.find((x) => x.code === r.register) as RegisterConfig | undefined;
        if (!cfg) return null;
        return (
          <div key={i} className="card" style={{ marginBottom: 10, opacity: r.include ? 1 : 0.5 }}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <label className="row"><input type="checkbox" checked={r.include} disabled={applied} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))} /> <b>{cfg.name}</b></label>
              <select value={r.register} disabled={applied} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, register: e.target.value } : x)))}>{registers.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}</select>
            </div>
            <RecordForm cfg={cfg} value={r.data} readOnly={applied} workorders={wos} onChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, data: v } : x)))} />
          </div>
        );
      })}
      {!rows.length && <div className="empty">Nothing was extracted. Re-extract with a specific document type, or key the record in by form.</div>}
      {u.text_content && <details><summary className="small">Extracted text</summary><pre className="box">{u.text_content.slice(0, 20000)}</pre></details>}
    </Drawer>
  );
}
