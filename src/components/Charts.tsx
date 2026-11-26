import { useRef, type ReactNode } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Tooltip, Legend, Filler, Title } from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { saveBlob } from '../lib/excel';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Tooltip, Legend, Filler, Title);
ChartJS.defaults.font.family = '"Segoe UI", system-ui, Arial, sans-serif';
ChartJS.defaults.font.size = 11;
ChartJS.defaults.color = '#3b4856';

export const PALETTE = ['#0b3a6e', '#2f80d1', '#e69500', '#2e7d32', '#c62828', '#7b5ea7', '#00897b', '#8d6e63', '#5c6bc0', '#9e9d24'];
export const TYPE_COLORS: Record<string, string> = { NCR: '#c62828', OBSERVATION: '#e69500', AFI: '#2f80d1' };

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
        <div className="row no-snap">{actions}<button className="sm ghost" title="Download PNG snapshot" onClick={() => ref.current && snapshot(ref.current, title)}>PNG</button></div>
      </div>
      <div className={`chart-box ${tall ? 'tall' : ''}`}>{children}</div>
    </div>
  );
}

const base = (stacked = false, pct = false) => ({
  responsive: true, maintainAspectRatio: false, animation: false as const,
  plugins: { legend: { position: 'bottom' as const, labels: { boxWidth: 12 } }, tooltip: { callbacks: pct ? { label: (c: any) => `${c.dataset.label}: ${(c.parsed.y * 100).toFixed(2)}%` } : {} } },
  scales: { x: { stacked, grid: { display: false } }, y: { stacked, beginAtZero: true, ticks: pct ? { callback: (v: any) => (v * 100).toFixed(1) + '%' } : { precision: 0 } } },
});

export function BarChart({ labels, series, stacked, horizontal, pct }: { labels: string[]; series: { label: string; data: (number | null)[]; color?: string; type?: 'line' }[]; stacked?: boolean; horizontal?: boolean; pct?: boolean }) {
  const opts: any = base(stacked, pct);
  if (horizontal) { opts.indexAxis = 'y'; opts.scales = { x: { stacked, beginAtZero: true, ticks: { precision: 0 } }, y: { stacked, grid: { display: false } } }; }
  return <Bar options={opts} data={{ labels, datasets: series.map((s, i) => ({ type: s.type as any, label: s.label, data: s.data, backgroundColor: s.color || PALETTE[i % PALETTE.length], borderColor: s.color || PALETTE[i % PALETTE.length], borderRadius: 3, maxBarThickness: 38 })) as any }} />;
}

export function LineChart({ labels, series, pct }: { labels: string[]; series: { label: string; data: (number | null)[]; color?: string; dashed?: boolean }[]; pct?: boolean }) {
  return <Line options={base(false, pct) as any} data={{ labels, datasets: series.map((s, i) => ({ label: s.label, data: s.data, borderColor: s.color || PALETTE[i % PALETTE.length], backgroundColor: s.color || PALETTE[i % PALETTE.length], tension: 0.25, borderDash: s.dashed ? [6, 4] : undefined, pointRadius: 3, spanGaps: true })) }} />;
}

export function DonutChart({ labels, data, colors }: { labels: string[]; data: number[]; colors?: string[] }) {
  return <Doughnut options={{ responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { position: 'right', labels: { boxWidth: 12 } } }, cutout: '58%' } as any}
    data={{ labels, datasets: [{ data, backgroundColor: colors || PALETTE, borderWidth: 1 }] }} />;
}

// Export every chart card on the page to a PowerPoint deck (one chart per slide) for MRM / GM meetings.
export async function exportChartsToPptx(root: HTMLElement, title: string, subtitle: string) {
  const { toPng } = await import('html-to-image');
  const Pptx = (await import('pptxgenjs')).default as any;
  const pptx = new Pptx();
  pptx.layout = 'LAYOUT_WIDE';
  const cover = pptx.addSlide();
  cover.background = { color: '0B3A6E' };
  cover.addText(title, { x: 0.6, y: 2.4, w: 12, h: 1, fontSize: 32, bold: true, color: 'FFFFFF', fontFace: 'Segoe UI' });
  cover.addText(subtitle, { x: 0.6, y: 3.4, w: 12, h: 0.6, fontSize: 16, color: 'D6E4F5', fontFace: 'Segoe UI' });
  const cards = [...root.querySelectorAll<HTMLElement>('.chart-card, .kpis')];
  for (const card of cards) {
    const png = await toPng(card, { backgroundColor: '#ffffff', pixelRatio: 2, filter: (n) => !(n as HTMLElement).classList?.contains('no-snap') });
    const s = pptx.addSlide();
    const t = card.dataset.title || 'Key Performance Indicators';
    s.addText(t, { x: 0.5, y: 0.25, w: 12.3, h: 0.6, fontSize: 22, bold: true, color: '0B3A6E', fontFace: 'Segoe UI' });
    s.addShape('rect', { x: 0.5, y: 0.88, w: 12.3, h: 0.04, fill: { color: '1F6FBF' }, line: { color: '1F6FBF' } });
    const ratio = card.offsetHeight / card.offsetWidth;
    const w = Math.min(12.3, 6.2 / ratio);
    s.addImage({ data: png, x: 0.5 + (12.3 - w) / 2, y: 1.05, w, h: w * ratio });
    s.addText(`TRAGS QA/QC · ${subtitle}`, { x: 0.5, y: 7.05, w: 12.3, h: 0.3, fontSize: 9, color: '8A97A6' });
  }
  await pptx.writeFile({ fileName: `${title} - ${subtitle}.pptx` });
}
