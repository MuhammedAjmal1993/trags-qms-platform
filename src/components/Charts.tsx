import { useRef, type ReactNode } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Tooltip, Legend, Filler, Title } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { Download } from 'lucide-react';
import { saveBlob } from '../lib/excel';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Tooltip, Legend, Filler, Title, ChartDataLabels);
ChartJS.defaults.font.family = '"Inter Variable", "Segoe UI", system-ui, Arial, sans-serif';
ChartJS.defaults.font.size = 11;
ChartJS.defaults.color = '#475569';
ChartJS.defaults.borderColor = '#eef2f8';
ChartJS.defaults.plugins.tooltip.backgroundColor = '#0f172a';
ChartJS.defaults.plugins.tooltip.padding = 10;
ChartJS.defaults.plugins.tooltip.cornerRadius = 10;
ChartJS.defaults.plugins.legend.labels.usePointStyle = true;
ChartJS.defaults.plugins.legend.labels.pointStyle = 'circle';
(ChartJS.defaults.plugins as any).datalabels = { display: false };

export const PALETTE = ['#1463f3', '#7c3aed', '#14b8a6', '#f59e0b', '#f43f5e', '#06b6d4', '#ec4899', '#10b981', '#6366f1', '#84cc16'];
export const TYPE_COLORS: Record<string, string> = { NCR: '#f43f5e', OBSERVATION: '#f59e0b', AFI: '#1463f3' };
const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const ANIM = reduced() ? (false as const) : { duration: 600, easing: 'easeOutQuart' as const };
// Hover shows every series for the month under the pointer, not only the bar touched.
ChartJS.defaults.interaction.mode = 'index';
ChartJS.defaults.interaction.intersect = false;
ChartJS.defaults.plugins.tooltip.boxPadding = 4;
ChartJS.defaults.plugins.tooltip.titleFont = { weight: 'bold', size: 12 } as any;

const isEmpty = (vals: (number | null | undefined)[][]) => vals.every((s) => s.every((v) => v === null || v === undefined || v === 0 || Number.isNaN(v)));
function NoData() {
  return <div className="chart-empty"><span className="chart-empty-ic" aria-hidden>∅</span><b>No data for the selected period</b><span>Change the filters or load the register to see this chart.</span></div>;
}
const LABEL = { display: (c: any) => { const v = c.dataset.data[c.dataIndex]; return typeof v === 'number' && v > 0 && (c.chart.data.labels?.length || 0) <= 16; }, color: '#334155', anchor: 'end' as const, align: 'end' as const, offset: -2, font: { weight: 600 as const, size: 10 }, clamp: true };

export async function snapshot(el: HTMLElement, name: string) {
  const { toPng } = await import('html-to-image');
  const url = await toPng(el, { backgroundColor: '#ffffff', pixelRatio: 2, filter: (n) => !(n as HTMLElement).classList?.contains('no-snap') });
  const blob = await (await fetch(url)).blob();
  saveBlob(blob, `${name}.png`);
}

export function ChartCard({ title, sub, children, tall, actions }: { title: string; sub?: ReactNode; children: ReactNode; tall?: boolean; actions?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div className="card chart-card" ref={ref} data-title={title}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
        <div><h3 style={{ margin: 0 }}>{title}</h3>{sub && <div className="muted small">{sub}</div>}</div>
        <div className="row no-snap">{actions}<button className="sm ghost" title="Download PNG snapshot" aria-label={`Download ${title} as PNG`} onClick={() => ref.current && snapshot(ref.current, title).catch(() => {})}><Download size={14} /></button></div>
      </div>
      <div className={`chart-box ${tall ? 'tall' : ''}`} role="img" aria-label={`Chart: ${title}${typeof sub === 'string' ? `, ${sub}` : ''}`}>{children}</div>
    </div>
  );
}

const base = (stacked = false, pct = false, labels = false) => ({
  responsive: true, maintainAspectRatio: false, animation: ANIM,
  layout: { padding: { top: labels ? 14 : 4 } },
  plugins: {
    legend: { position: 'bottom' as const, labels: { boxWidth: 8, boxHeight: 8, padding: 14 } },
    tooltip: { callbacks: pct ? { label: (c: any) => `${c.dataset.label}: ${(c.parsed.y * 100).toFixed(2)}%` } : {} },
    datalabels: labels && !stacked ? { ...LABEL, formatter: pct ? (v: number) => (v * 100).toFixed(1) + '%' : undefined } : { display: false },
  },
  scales: { x: { stacked, grid: { display: false }, border: { display: false } }, y: { stacked, beginAtZero: true, border: { display: false }, grid: { color: '#f1f4f9' }, ticks: pct ? { callback: (v: any) => (v * 100).toFixed(1) + '%' } : { precision: 0 } } },
});

export function BarChart({ labels, series, stacked, horizontal, pct, values = true }: { labels: string[]; series: { label: string; data: (number | null)[]; color?: string; type?: 'line' }[]; stacked?: boolean; horizontal?: boolean; pct?: boolean; values?: boolean }) {
  if (!labels.length || isEmpty(series.map((s) => s.data))) return <NoData />;
  const opts: any = base(stacked, pct, values);
  if (series.length === 1) opts.plugins.legend.display = false;
  if (horizontal) {
    opts.indexAxis = 'y';
    opts.layout = { padding: { right: values ? 26 : 4 } };
    opts.scales = { x: { stacked, beginAtZero: true, border: { display: false }, grid: { color: '#f1f4f9' }, ticks: { precision: 0 } }, y: { stacked, grid: { display: false }, border: { display: false } } };
    if (values && !stacked) opts.plugins.datalabels = { ...LABEL, display: (c: any) => (c.dataset.data[c.dataIndex] || 0) > 0 };
  }
  return <Bar options={opts} data={{ labels, datasets: series.map((s, i) => {
    const c = s.color || PALETTE[i % PALETTE.length];
    return s.type === 'line'
      ? { type: 'line', label: s.label, data: s.data, borderColor: c, backgroundColor: c, tension: 0.35, pointRadius: 3, borderWidth: 2.5, datalabels: { display: false } }
      : { label: s.label, data: s.data, backgroundColor: c, borderColor: c, borderRadius: 6, borderSkipped: false, maxBarThickness: 34 };
  }) as any }} />;
}

function areaFill(color: string) {
  return (ctx: any) => {
    const { chart } = ctx; const { ctx: c, chartArea } = chart;
    if (!chartArea) return color + '22';
    const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    g.addColorStop(0, color + '44'); g.addColorStop(1, color + '00');
    return g;
  };
}

export function LineChart({ labels, series, pct, fill = true }: { labels: string[]; series: { label: string; data: (number | null)[]; color?: string; dashed?: boolean }[]; pct?: boolean; fill?: boolean }) {
  // Ignore dashed target lines when deciding whether there is any real data to plot.
  if (!labels.length || isEmpty(series.filter((s) => !s.dashed).map((s) => s.data))) return <NoData />;
  const opts: any = base(false, pct);
  if (series.length === 1) opts.plugins.legend.display = false;
  return <Line options={opts} data={{ labels, datasets: series.map((s, i) => {
    const c = s.color || PALETTE[i % PALETTE.length];
    return { label: s.label, data: s.data, borderColor: c, backgroundColor: fill && !s.dashed ? areaFill(c) : c, fill: fill && !s.dashed, tension: 0.35, borderWidth: 2.5, borderDash: s.dashed ? [6, 4] : undefined, pointRadius: 3, pointHoverRadius: 6, pointBackgroundColor: '#fff', pointBorderWidth: 2, spanGaps: true };
  }) as any }} />;
}

const centerText = {
  id: 'centerText',
  afterDraw(chart: any) {
    const t = chart.options.plugins?.centerText;
    if (!t || t.value === undefined) return;
    const { ctx, chartArea } = chart;
    const meta = chart.getDatasetMeta(0);
    const x = meta?.data?.[0]?.x ?? (chartArea.left + chartArea.right) / 2;
    const y = meta?.data?.[0]?.y ?? (chartArea.top + chartArea.bottom) / 2;
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#0a2540'; ctx.font = '800 22px "Inter Variable", system-ui'; ctx.fillText(t.value, x, y - 7);
    ctx.fillStyle = '#64748b'; ctx.font = '600 10.5px "Inter Variable", system-ui'; ctx.fillText(t.label, x, y + 13);
    ctx.restore();
  },
};

export function DonutChart({ labels, data, colors, center }: { labels: string[]; data: number[]; colors?: string[]; center?: string }) {
  const total = data.reduce((a, b) => a + (b || 0), 0);
  if (!total) return <NoData />;
  return <Doughnut plugins={[centerText as any]} options={{ responsive: true, maintainAspectRatio: false, animation: reduced() ? false : { animateRotate: true, duration: 700 }, interaction: { mode: 'nearest', intersect: true }, plugins: {
    legend: { position: 'right', labels: { boxWidth: 8, boxHeight: 8, padding: 10 } },
    centerText: { value: String(total), label: center || 'Total' },
    datalabels: { display: (c: any) => total > 0 && (c.dataset.data[c.dataIndex] / total) >= 0.07, color: '#fff', font: { weight: 700, size: 11 }, formatter: (v: number) => v },
  }, cutout: '66%' } as any}
    data={{ labels, datasets: [{ data, backgroundColor: colors || PALETTE, borderWidth: 2, borderColor: '#fff', hoverOffset: 6 }] }} />;
}

// Animated ring gauge for percentages (0..1).
export function Ring({ value, size = 96, color = '#1463f3', label }: { value: number | null; size?: number; color?: string; label?: string }) {
  const r = (size - 12) / 2; const c = 2 * Math.PI * r;
  const v = value === null || isNaN(value) ? 0 : Math.max(0, Math.min(1, value));
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={`${label ? label + ': ' : ''}${value === null ? 'no data' : Math.round(v * 100) + '%'}`}>
      <svg width={size} height={size} aria-hidden><circle cx={size / 2} cy={size / 2} r={r} stroke="#eef2f8" strokeWidth="10" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="10" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset 1s ease' }} /></svg>
      <span className="rv" style={{ fontSize: size > 90 ? 20 : 15 }}>{value === null ? '–' : Math.round(v * 100) + '%'}</span>
      {label && <div className="muted small" style={{ position: 'absolute', bottom: -18, whiteSpace: 'nowrap' }}>{label}</div>}
    </div>
  );
}

// Export every chart card on the page to a PowerPoint deck (one chart per slide) for MRM / GM meetings.
export async function exportChartsToPptx(root: HTMLElement, title: string, subtitle: string) {
  const { toPng } = await import('html-to-image');
  const Pptx = (await import('pptxgenjs')).default as any;
  const pptx = new Pptx();
  pptx.layout = 'LAYOUT_WIDE';
  const cover = pptx.addSlide();
  cover.background = { color: '0A2540' };
  cover.addText(title, { x: 0.6, y: 2.4, w: 12, h: 1, fontSize: 32, bold: true, color: 'FFFFFF', fontFace: 'Segoe UI' });
  cover.addText(subtitle, { x: 0.6, y: 3.4, w: 12, h: 0.6, fontSize: 16, color: 'D6E4F5', fontFace: 'Segoe UI' });
  const cards = [...root.querySelectorAll<HTMLElement>('.chart-card, .kpis')];
  for (const card of cards) {
    const png = await toPng(card, { backgroundColor: '#ffffff', pixelRatio: 2, filter: (n) => !(n as HTMLElement).classList?.contains('no-snap') });
    const s = pptx.addSlide();
    const t = card.dataset.title || 'Key Performance Indicators';
    s.addText(t, { x: 0.5, y: 0.25, w: 12.3, h: 0.6, fontSize: 22, bold: true, color: '0A2540', fontFace: 'Segoe UI' });
    s.addShape('rect', { x: 0.5, y: 0.88, w: 12.3, h: 0.04, fill: { color: '1463F3' }, line: { color: '1463F3' } });
    const ratio = card.offsetHeight / card.offsetWidth;
    const w = Math.min(12.3, 6.2 / ratio);
    s.addImage({ data: png, x: 0.5 + (12.3 - w) / 2, y: 1.05, w, h: w * ratio });
    s.addText(`TRAGS QA/QC · ${subtitle}`, { x: 0.5, y: 7.05, w: 12.3, h: 0.3, fontSize: 9, color: '8A97A6' });
  }
  await pptx.writeFile({ fileName: `${title} - ${subtitle}.pptx` });
}
