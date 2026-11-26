import { MONTHS } from '../../shared/registers';
import { fmtDate } from '../../shared/logic';
import { saveBlob } from './excel';

const NAVY = '0B3A6E';
const pctS = (v: any, d = 1) => (v === null || v === undefined || isNaN(v) ? '–' : (Number(v) * 100).toFixed(d) + '%');

async function D() { return await import('docx'); }

function table(docx: any, headers: string[], rows: (string | number | null | undefined)[][], widths?: number[]) {
  const { Table, TableRow, TableCell, Paragraph, TextRun, WidthType, ShadingType } = docx;
  const cell = (t: any, head = false) => new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text: t === null || t === undefined ? '' : String(t), bold: head, color: head ? 'FFFFFF' : '1B2733', size: 17 })] })],
    shading: head ? { type: ShadingType.CLEAR, color: 'auto', fill: '1E4F86' } : undefined,
    margins: { top: 40, bottom: 40, left: 70, right: 70 },
  });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: widths,
    rows: [new TableRow({ tableHeader: true, children: headers.map((h) => cell(h, true)) }), ...rows.map((r) => new TableRow({ children: r.map((c) => cell(c)) }))],
  });
}

const h = (docx: any, text: string, level = 1) => new docx.Paragraph({ heading: level === 1 ? docx.HeadingLevel.HEADING_1 : docx.HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 }, children: [new docx.TextRun({ text, color: NAVY, bold: true, size: level === 1 ? 28 : 24 })] });
const p = (docx: any, text: string, opts: any = {}) => new docx.Paragraph({ spacing: { after: 100 }, children: [new docx.TextRun({ text, size: 20, ...opts })] });

async function imagesFrom(root: HTMLElement | null): Promise<{ title: string; data: ArrayBuffer; w: number; h: number }[]> {
  if (!root) return [];
  const { toPng } = await import('html-to-image');
  const out: { title: string; data: ArrayBuffer; w: number; h: number }[] = [];
  for (const el of root.querySelectorAll<HTMLElement>('.chart-card')) {
    const url = await toPng(el, { backgroundColor: '#ffffff', pixelRatio: 2, filter: (n) => !(n as HTMLElement).classList?.contains('no-snap') });
    out.push({ title: el.dataset.title || '', data: await (await fetch(url)).arrayBuffer(), w: el.offsetWidth, h: el.offsetHeight });
  }
  return out;
}

export async function monthlyReportDocx(d: any, period: { from: string; to: string; label: string }, chartsRoot: HTMLElement | null, prepared: string) {
  const docx = await D();
  const { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, PageBreak, Footer, PageNumber } = docx as any;
  const k = d.kpi;
  const imgs = await imagesFrom(chartsRoot);
  const L = d.lists;
  const children: any[] = [
    new Paragraph({ alignment: AlignmentType.LEFT, spacing: { after: 60 }, children: [new TextRun({ text: 'TRADING AND AGENCY SERVICES LIMITED COMPANY W.L.L. (TRAGS)', bold: true, size: 20, color: '5D6B7A' })] }),
    new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: 'QA/QC Monthly Report', bold: true, size: 44, color: NAVY })] }),
    p(docx, `Reporting period: ${period.label}`, { bold: true, size: 24 }),
    p(docx, `Generated from the TRAGS Quality Management Platform on ${fmtDate(new Date().toISOString().slice(0, 10))}. Prepared by: ${prepared}.`, { color: '5D6B7A' }),
    h(docx, '1. Key performance indicators'),
    table(docx, ['Indicator', 'Value', 'Basis'], [
      ['Audits planned / conducted', `${k.audits_planned} / ${k.audits_conducted}`, `Completion ${pctS(k.audit_completion)}; ${k.audits_overdue} overdue`],
      ['Findings raised', k.findings_total, `NCR ${k.ncr} · Observation ${k.obs} · AFI ${k.afi}`],
      ['Findings open (raised in period)', k.findings_open, `Closure rate ${pctS(k.closure_rate)}`],
      ['Open findings older than 90 days (all years)', k.aging?.over90 ?? 0, `${k.aging?.open ?? 0} open in total`],
      ['Weld repair rate (film based)', pctS(k.repair_rate, 2), `${k.films_rej} rejected / ${k.films_rt} films RT'd`],
      ['RFI rejection rate', pctS(k.rfi_rejection), `${k.rfi_total} RFIs`],
      ['Training completion', pctS(k.training_completion), `${k.trainings_conducted} of ${k.trainings_planned} sessions; ${k.participants} participants`],
      ['Customer feedback', k.feedback_total, `Survey score ${k.survey_score !== null ? pctS(k.survey_score) : '–'}; ${k.complaints_open} complaints open`],
    ]),
    h(docx, '2. Audits'),
    L.audits.length ? table(docx, ['UID', 'Report No.', 'Type', 'Client / WON', 'Plan', 'Actual', 'NCR', 'OBS', 'AFI', 'Status'],
      L.audits.map((a: any) => [a.uid, a.report_no, `${a.sub_category || ''} ${a.ext_int || ''}`, `${a.client || ''} ${a.won || ''}`, fmtDate(a.plan_date), fmtDate(a.actual_date), a.ncr, a.obs, a.afi, a.status])) : p(docx, 'No audits in the period.'),
    h(docx, '3. Findings raised in the period'),
    L.newFindings.length ? table(docx, ['UID', 'Report / Finding No.', 'Type', 'Criticality', 'Client / WON', 'Issued', 'Status'],
      L.newFindings.map((f: any) => [f.uid, `${f.report_no || ''} ${f.finding_no || ''}`, f.finding_type, f.criticality, `${f.client || ''} ${f.won || ''}`, fmtDate(f.plan_date), f.status])) : p(docx, 'No findings raised in the period.'),
    h(docx, '4. Findings closed in the period'),
    L.closedFindings.length ? table(docx, ['UID', 'Report / Finding No.', 'Type', 'Client / WON', 'Closed'], L.closedFindings.map((f: any) => [f.uid, `${f.report_no || ''} ${f.finding_no || ''}`, f.finding_type, `${f.client || ''} ${f.won || ''}`, fmtDate(f.close_date)])) : p(docx, 'No findings closed in the period.'),
    h(docx, '5. Open findings (all years)'),
    L.openFindings.length ? table(docx, ['UID', 'Report / Finding No.', 'Type', 'Client / WON', 'Issued', 'Age (days)', 'Actionee'], L.openFindings.map((f: any) => [f.uid, `${f.report_no || ''} ${f.finding_no || ''}`, f.finding_type, `${f.client || ''} ${f.won || ''}`, fmtDate(f.plan_date), f.age, f.actionee])) : p(docx, 'No open findings.'),
    h(docx, '6. Inspections and welding'),
    table(docx, ['Month', 'RFIs', 'Rejected', "Films RT'd", 'Films rejected', 'Repair rate'], monthsIn(period.from, period.to).map((m) => {
      const r = d.inspections.rfi.find((x: any) => x.m === m) || {}; const w = d.welding.byMonth.find((x: any) => x.m === m) || {};
      return [`${MONTHS[Number(m.slice(5)) - 1]}-${m.slice(2, 4)}`, r.n ?? 0, r.rej ?? 0, w.films ?? 0, w.rej ?? 0, w.films ? pctS(w.rej / w.films, 2) : '–'];
    })),
    p(docx, ''),
    d.welding.bySite.length ? table(docx, ['Site', "Films RT'd", 'Rejected', 'Repair rate'], d.welding.bySite.map((s: any) => [s.k, s.films, s.rej, s.films ? pctS(s.rej / s.films, 2) : '–'])) : p(docx, 'No weld data in the period.'),
    h(docx, '7. Training'),
    L.trainings.length ? table(docx, ['UID', 'Type', 'Subject', 'WON', 'Date', 'Participants'], L.trainings.map((t: any) => [t.uid, t.sub_category, t.subject, t.won, fmtDate(t.actual_date), t.participants])) : p(docx, 'No training conducted in the period.'),
    h(docx, '8. Customer feedback'),
    L.feedback.length ? table(docx, ['UID', 'Type', 'Client', 'Date', 'Description', 'Status'], L.feedback.map((f: any) => [f.uid, f.sub_category, f.client, fmtDate(f.plan_date), f.description, f.status])) : p(docx, 'No customer feedback in the period.'),
  ];
  if (imgs.length) {
    children.push(new Paragraph({ children: [new PageBreak()] }), h(docx, 'Annex: charts'));
    for (const im of imgs) {
      const w = 600, hh = Math.round((w * im.h) / im.w);
      children.push(new Paragraph({ children: [new ImageRun({ data: im.data, transformation: { width: w, height: hh }, type: 'png' })] }));
    }
  }
  const doc = new Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 20 } } } },
    sections: [{
      properties: { page: { margin: { top: 900, bottom: 900, left: 900, right: 900 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `TRAGS QA/QC Monthly Report · ${period.label} · Page `, size: 16, color: '8A97A6' }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '8A97A6' })] })] }) },
      children,
    }],
  });
  saveBlob(await Packer.toBlob(doc), `TRAGS QC Monthly Report ${period.label}.docx`);
}

function monthsIn(from: string, to: string) {
  const out: string[] = [];
  let y = +from.slice(0, 4), m = +from.slice(5, 7);
  while ((y < +to.slice(0, 4) || (y === +to.slice(0, 4) && m <= +to.slice(5, 7))) && out.length < 36) { out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } }
  return out;
}

export async function objectivesDocx(year: number, objectives: any[], signoffs: any[]) {
  const docx = await D();
  const { Document, Packer, Paragraph, TextRun, PageOrientation } = docx as any;
  const sig = (role: string) => signoffs.find((s) => s.role === role);
  const qm = sig('QAQC_MANAGER'), gm = sig('GM');
  const doc = new Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 18 } } } },
    sections: [{
      properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 700, bottom: 700, left: 700, right: 700 } } },
      children: [
        new Paragraph({ children: [new TextRun({ text: 'TRADING AND AGENCY SERVICES LIMITED COMPANY W.L.L. (TRAGS)', bold: true, size: 18, color: '5D6B7A' })] }),
        new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: `Quality Objectives ${year}`, bold: true, size: 36, color: NAVY })] }),
        table(docx, ['Ref', 'Objective', 'KPI', 'Target', 'Owner', ...MONTHS, 'Status'], objectives.map((o) => [o.ref, o.objective, o.kpi, `${o.direction || ''} ${o.target || ''}${o.unit || ''}`, o.owner, ...MONTHS.map((m) => o.monthly?.[m] ?? ''), o.status])),
        new Paragraph({ spacing: { before: 400 }, children: [] }),
        table(docx, ['', 'QA/QC Manager', 'General Manager'], [
          ['Name', qm?.name || '', gm?.name || ''],
          ['Signature', qm ? 'Signed electronically on the platform' : '', gm ? 'Signed electronically on the platform' : ''],
          ['Date', qm ? fmtDate(qm.signed_at.slice(0, 10)) : '', gm ? fmtDate(gm.signed_at.slice(0, 10)) : ''],
        ]),
      ],
    }],
  });
  saveBlob(await Packer.toBlob(doc), `TRAGS Quality Objectives ${year}.docx`);
}

export { pctS };
