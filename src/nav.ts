// Side ribbon structure: Home, Insights, six hubs, data and admin.
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Lightbulb, FileBarChart, Briefcase, ClipboardCheck, AlertTriangle, Wrench, MessageSquareHeart, BookOpen,
  Search, FileCheck2, FileSearch, HardHat, Flame, BadgeCheck, Users, Network, GraduationCap, Library, IdCard, FolderOpen, Award,
  Target, RefreshCw, Sparkles, Presentation, ListChecks, Rocket, CalendarDays, Trophy, Star, Images, Upload, Inbox, QrCode, LayoutGrid,
} from 'lucide-react';

export interface NavItem { label: string; to: string; module: string; register?: string; icon: LucideIcon; badge?: string }
export interface NavGroup { id: string; label: string; color: string; items: NavItem[] }

const r = (code: string, label: string, module: string, icon: LucideIcon): NavItem => ({ label, to: `/r/${code}`, module, register: code, icon });

export const NAV: NavGroup[] = [
  { id: 'insight', label: 'Monitor & Insights', color: '#60a5fa', items: [
    { label: 'Master Dashboard', to: '/dashboard', module: 'dashboard', icon: LayoutDashboard },
    { label: 'Insights & Patterns', to: '/insights', module: 'insights', icon: Lightbulb },
    { label: 'Reports & Exports', to: '/reports', module: 'reports', icon: FileBarChart },
  ] },
  { id: 'h1', label: 'Projects & Work Orders', color: '#2dd4bf', items: [
    { label: 'Projects & Health', to: '/wo', module: 'workorders', icon: Briefcase },
  ] },
  { id: 'h2', label: 'Audit & Findings', color: '#fb7185', items: [
    { label: 'Hub overview', to: '/hub/h2', module: 'audits', icon: LayoutGrid },
    r('AUD', 'Audit Plan', 'audits', ClipboardCheck),
    r('FND', 'Findings (NCR / CAR / OBS)', 'findings', AlertTriangle),
    { label: 'Review queue (raised)', to: '/review', module: 'findings', icon: Inbox, badge: 'review' },
    { label: 'Disposition & RCA', to: '/disposition', module: 'findings', icon: Wrench },
    r('CFB', 'Customer Feedback', 'feedback', MessageSquareHeart),
    r('LLR', 'Lessons Learnt', 'findings', BookOpen),
  ] },
  { id: 'h3', label: 'Inspection & Welding', color: '#fbbf24', items: [
    { label: 'Hub overview', to: '/hub/h3', module: 'inspections', icon: LayoutGrid },
    r('SRC', 'Source Inspection', 'inspections', Search),
    r('NFI', 'NFI Register', 'inspections', FileSearch),
    r('RFI', 'RFI Register', 'inspections', FileCheck2),
    r('WLD', 'Welders', 'welding', HardHat),
    r('WRR', 'Weld Repair Monitoring', 'welding', Flame),
    r('ASM', 'ASME Capabilities', 'inspections', BadgeCheck),
  ] },
  { id: 'h4', label: 'People & Training', color: '#a78bfa', items: [
    { label: 'Hub overview', to: '/hub/h4', module: 'people', icon: LayoutGrid },
    r('PPL', 'QA/QC Resource List', 'people', Users),
    { label: 'Organization Chart', to: '/orgchart', module: 'people', icon: Network },
    r('TRN', 'Training Plan & Records', 'training', GraduationCap),
    { label: 'Training Library', to: '/library', module: 'training', icon: Library },
    r('PCR', 'Personnel Certifications', 'people', IdCard),
  ] },
  { id: 'h5', label: 'QMS Documents & Plans', color: '#34d399', items: [
    { label: 'Document Library', to: '/documents', module: 'documents', icon: FolderOpen },
    { label: 'Certificates & Expiry', to: '/documents?tab=cert', module: 'documents', icon: Award },
    { label: 'Plans & Objectives', to: '/plans', module: 'plans', icon: Target },
    r('ITT', 'ISO 9001:2026 Transition', 'plans', RefreshCw),
  ] },
  { id: 'h6', label: 'Quality Culture & Showcase', color: '#f472b6', items: [
    { label: 'Department Showcase', to: '/showcase', module: 'culture', icon: Sparkles },
    r('MRM', 'Management Review (MRM)', 'culture', Presentation),
    r('MRA', 'MRM Action Tracker', 'culture', ListChecks),
    r('INI', 'Initiatives & Records', 'culture', Rocket),
    r('EVT', 'Quality Events', 'culture', CalendarDays),
    r('AWD', 'Recognition & Awards', 'culture', Trophy),
    r('SPJ', 'Special Jobs', 'culture', Star),
    { label: 'Photo Library', to: '/photos', module: 'culture', icon: Images },
  ] },
  { id: 'data', label: 'Data Input', color: '#93c5fd', items: [
    { label: 'Upload Center', to: '/ingest', module: 'ingest', icon: Upload },
    { label: 'Quick-raise QR codes', to: '/qr', module: 'findings', icon: QrCode },
  ] },
];

export const HUBS: Record<string, { title: string; text: string; registers: string[]; links: { label: string; to: string }[] }> = {
  h2: { title: 'Audit & Findings', text: 'Audit programme, NCR / CAR / observation lifecycle from disposition to verified close-out, customer feedback and lessons learnt.', registers: ['AUD', 'FND', 'CFB', 'LLR'], links: [{ label: 'Disposition & RCA tracker', to: '/disposition' }, { label: 'Recurring issues', to: '/insights' }] },
  h3: { title: 'Inspection & Welding', text: 'Source inspection, NFI and RFI control, welder qualification and weld repair performance, ASME scope.', registers: ['SRC', 'NFI', 'RFI', 'WLD', 'WRR', 'ASM'], links: [{ label: 'Weld repair trend', to: '/dashboard' }] },
  h4: { title: 'People & Training', text: 'QA/QC resources, organization chart, training plan and records, training library and personnel certification expiry.', registers: ['PPL', 'TRN', 'TLB', 'PCR'], links: [{ label: 'Organization chart', to: '/orgchart' }, { label: 'Training library', to: '/library' }] },
};
