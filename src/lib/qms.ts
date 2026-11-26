// TRAGS QMS reference used by the Insights interface analysis.
// Source: QSP-00 Rev 1 document register (QSP titles and ISO 9001:2015 clauses).
export const QSP: Record<string, { title: string; iso: string }> = {
  'QSP-01': { title: 'Tender & Contract Review', iso: '8.2' },
  'QSP-02': { title: 'Document Control', iso: '7.5' },
  'QSP-03': { title: 'Context & Risk Management', iso: '4.1, 4.2, 6.1' },
  'QSP-04': { title: 'Operation Control', iso: '8.1, 8.5, 8.6' },
  'QSP-05': { title: 'Correspondence & Communication', iso: '7.4, 8.2.1' },
  'QSP-06': { title: 'Management Review, Monitoring, Measurement & Improvement', iso: '9.1, 9.3, 10.3' },
  'QSP-07': { title: 'Internal Audit', iso: '9.2' },
  'QSP-09': { title: 'Recruitment, Training & Competency', iso: '7.1.2, 7.2, 7.3' },
  'QSP-10': { title: 'Procurement', iso: '8.4' },
  'QSP-13': { title: 'Material Handling', iso: '8.5.2–8.5.4' },
  'QSP-14': { title: 'Inspection & Testing', iso: '8.6, 8.7' },
  'QSP-15': { title: 'Inspection, Measuring & Test Equipment', iso: '7.1.5' },
  'QSP-18': { title: 'Preventive & Breakdown Maintenance', iso: '7.1.3' },
  'QSP-20': { title: 'Customer Feedback & Complaints', iso: '9.1.2, 10.2' },
  'QSP-21': { title: 'Control of Non-Conformance', iso: '8.7, 10.2' },
  'QSP-22': { title: 'Design & Change Control', iso: '8.3, 8.5.6' },
  'HSE': { title: 'HSE (outside the QMS scope; ISO 45001 / 14001)', iso: '—' },
  'Unmapped': { title: 'Process not mapped to a QSP', iso: '—' },
};

// Default Process/Area → owning QSP rules (first match wins). Editable in Admin → Settings (qms_map).
export const DEFAULT_MAP: [string, string][] = [
  ['hse|safety|environment|health', 'HSE'],
  ['procure|purchas|vendor|supplier|buyer|subcontract', 'QSP-10'],
  ['document|record|transmittal|dcc', 'QSP-02'],
  ['train|competen|recruit|human resource|\\bhr\\b|personnel', 'QSP-09'],
  ['store|material|warehouse|handling|preserv|traceab|logistic', 'QSP-13'],
  ['calibrat|imte|measuring', 'QSP-15'],
  ['maint|plant|machine|lifting|vehicle|equipment', 'QSP-18'],
  ['customer|complain|feedback', 'QSP-20'],
  ['design|engineer|drawing', 'QSP-22'],
  ['tender|contract|estimat|bid|commercial', 'QSP-01'],
  ['risk|context', 'QSP-03'],
  ['communicat|correspond', 'QSP-05'],
  ['management review|objective|kpi|top management|improvement', 'QSP-06'],
  ['audit', 'QSP-07'],
  ['inspect|\\bqc\\b|qa/qc|quality|test|ndt|weld|fabricat|mechanical|piping|e&i|electrical|instrument|civil|coating|paint|construction|site', 'QSP-14'],
  ['project|planning|operation|execution|resource', 'QSP-04'],
];

export function mapProcess(process: string | null | undefined, rules: [string, string][] = DEFAULT_MAP): string {
  const p = String(process || '').toLowerCase();
  if (!p) return 'Unmapped';
  for (const [rx, q] of rules) { try { if (new RegExp(rx, 'i').test(p)) return q; } catch { /* bad rule */ } }
  return 'Unmapped';
}

const STOP = new Set(('a an the and or of to in on at for by with from as is are was were be been being not no it its this that these those which who whom whose has have had do does did shall should will would may might can could per via into than then there their they them our we you your his her he she during after before under over between within without also any all each other such same only both more most some few found observed noted not available provided carried out carry being done during site area work works activity activities report reported required requirement as per refer ref document documents no. nos number shown being' +
  ' trags client contractor subcontractor project however where when while being found observation ncr finding').split(/\s+/));

export function tokens(text: string): string[] {
  return String(text || '').toLowerCase().replace(/[^a-z0-9\s/-]+/g, ' ').split(/\s+/).map((w) => w.replace(/^[-/]+|[-/]+$/g, '')).filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));
}
