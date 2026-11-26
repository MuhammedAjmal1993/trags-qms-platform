// Side ribbon structure: Home, Insights, six hubs, data and admin.
export interface NavItem { label: string; to: string; module: string; register?: string }
export interface NavGroup { id: string; label: string; icon: string; items: NavItem[] }

const r = (code: string, label: string, module: string): NavItem => ({ label, to: `/r/${code}`, module, register: code });

export const NAV: NavGroup[] = [
  { id: 'insight', label: 'Monitor & Insights', icon: '◎', items: [
    { label: 'QA/QC Dashboard', to: '/dashboard', module: 'dashboard' },
    { label: 'Insights & Patterns', to: '/insights', module: 'insights' },
    { label: 'Reports & Exports', to: '/reports', module: 'reports' },
  ] },
  { id: 'h1', label: '1 · Projects & Work Orders', icon: '▣', items: [
    { label: 'Projects & Health', to: '/wo', module: 'workorders' },
  ] },
  { id: 'h2', label: '2 · Audit & Findings', icon: '✓', items: [
    { label: 'Hub overview', to: '/hub/h2', module: 'audits' },
    r('AUD', 'Audit Plan', 'audits'),
    r('FND', 'Findings (NCR / CAR / OBS)', 'findings'),
    { label: 'Disposition & RCA Tracker', to: '/disposition', module: 'findings' },
    r('CFB', 'Customer Feedback', 'feedback'),
    r('LLR', 'Lessons Learnt', 'findings'),
  ] },
  { id: 'h3', label: '3 · Inspection & Welding', icon: '⚙', items: [
    { label: 'Hub overview', to: '/hub/h3', module: 'inspections' },
    r('SRC', 'Source Inspection', 'inspections'),
    r('NFI', 'NFI Register', 'inspections'),
    r('RFI', 'RFI Register', 'inspections'),
    r('WLD', 'Welders', 'welding'),
    r('WRR', 'Weld Repair Monitoring', 'welding'),
    r('ASM', 'ASME Capabilities', 'inspections'),
  ] },
  { id: 'h4', label: '4 · People & Training', icon: '◉', items: [
    { label: 'Hub overview', to: '/hub/h4', module: 'people' },
    r('PPL', 'QA/QC Resource List', 'people'),
    { label: 'Organization Chart', to: '/orgchart', module: 'people' },
    r('TRN', 'Training Plan & Records', 'training'),
    { label: 'Training Library', to: '/library', module: 'training' },
    r('PCR', 'Personnel Certifications', 'people'),
  ] },
  { id: 'h5', label: '5 · QMS Documents & Plans', icon: '▤', items: [
    { label: 'Document Library', to: '/documents', module: 'documents' },
    { label: 'Certificates & Expiry', to: '/documents?tab=cert', module: 'documents' },
    { label: 'Plans & Objectives', to: '/plans', module: 'plans' },
    r('ITT', 'ISO 9001:2026 Transition', 'plans'),
  ] },
  { id: 'h6', label: '6 · Quality Culture & Showcase', icon: '★', items: [
    { label: 'Department Showcase', to: '/showcase', module: 'culture' },
    r('MRM', 'Management Review (MRM)', 'culture'),
    r('MRA', 'MRM Action Tracker', 'culture'),
    r('INI', 'Initiatives & Records', 'culture'),
    r('EVT', 'Quality Events', 'culture'),
    r('AWD', 'Recognition & Awards', 'culture'),
    r('SPJ', 'Special Jobs', 'culture'),
    { label: 'Photo Library', to: '/photos', module: 'culture' },
  ] },
  { id: 'data', label: 'Data', icon: '⇪', items: [
    { label: 'Upload Center', to: '/ingest', module: 'ingest' },
  ] },
];

export const HUBS: Record<string, { title: string; text: string; registers: string[]; links: { label: string; to: string }[] }> = {
  h2: { title: 'Audit & Findings', text: 'Audit programme, NCR / CAR / observation lifecycle from disposition to verified close-out, customer feedback and lessons learnt.', registers: ['AUD', 'FND', 'CFB', 'LLR'], links: [{ label: 'Disposition & RCA tracker', to: '/disposition' }, { label: 'Recurring issues', to: '/insights' }] },
  h3: { title: 'Inspection & Welding', text: 'Source inspection, NFI and RFI control, welder qualification and weld repair performance, ASME scope.', registers: ['SRC', 'NFI', 'RFI', 'WLD', 'WRR', 'ASM'], links: [{ label: 'Weld repair trend', to: '/dashboard' }] },
  h4: { title: 'People & Training', text: 'QA/QC resources, organization chart, training plan and records, training library and personnel certification expiry.', registers: ['PPL', 'TRN', 'TLB', 'PCR'], links: [{ label: 'Organization chart', to: '/orgchart' }, { label: 'Training library', to: '/library' }] },
};
