import { useEffect, useId, useRef, useState, type KeyboardEvent as RKeyboardEvent, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw, X } from 'lucide-react';
import type { Column } from '../../shared/registers';
import { fmtDate } from '../../shared/logic';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Shared dialog behaviour: Escape closes, focus moves into the dialog, Tab stays inside it,
// and focus returns to the control that opened it.
const dialogStack: object[] = [];
function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const me = {};
    dialogStack.push(me);
    const prev = document.activeElement as HTMLElement | null;
    const box = ref.current;
    if (box && !box.contains(document.activeElement)) (box.querySelector<HTMLElement>('[autofocus]') || box).focus({ preventScroll: true });
    const k = (e: KeyboardEvent) => {
      if (dialogStack[dialogStack.length - 1] !== me) return; // only the top-most dialog reacts
      if (e.key === 'Escape') { close.current(); return; }
      if (e.key !== 'Tab' || !box) return;
      const f = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === box)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', k);
    const body = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', k);
      dialogStack.splice(dialogStack.indexOf(me), 1);
      document.body.style.overflow = body;
      if (prev && document.contains(prev)) prev.focus({ preventScroll: true });
    };
  }, []);
  return ref;
}

export function Drawer({ title, onClose, children, footer, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useDialog(onClose);
  const id = useId();
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="drawer" role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1} style={wide ? { width: 'min(1200px,100%)' } : undefined}>
        <div className="dhead"><h2 id={id} style={{ margin: 0 }}>{title}</h2><button className="ghost icon" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
        <div className="dbody">{children}</div>
        {footer && <div className="dfoot">{footer}</div>}
      </div>
    </div>
  );
}

export function Modal({ title, onClose, children, footer }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useDialog(onClose);
  const id = useId();
  return (
    <div className="overlay center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1}>
        <div className="dhead"><h2 id={id} style={{ margin: 0 }}>{title}</h2><button className="ghost icon" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
        <div className="dbody">{children}</div>
        {footer && <div className="dfoot">{footer}</div>}
      </div>
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) { return <span className="spinner" role="status" aria-label={label} />; }

// Shown when a page's data could not be loaded, instead of an endless loader.
export function ErrorState({ message, onRetry, action }: { message: string; onRetry?: () => void; action?: ReactNode }) {
  return (
    <div className="card state-card" role="alert">
      <div className="state-ic"><AlertTriangle size={22} /></div>
      <b>Could not load this page</b>
      <div className="muted">{message || 'The server did not respond. Check your connection and try again.'}</div>
      <div className="row" style={{ justifyContent: 'center', marginTop: 6 }}>
        {onRetry && <button className="primary" onClick={onRetry}><RotateCcw size={15} /> Try again</button>}
        {action}
      </div>
    </div>
  );
}

// Keyboard support for clickable non-button elements (rows, cards).
export const pressable = (fn?: () => void) => fn ? {
  role: 'button' as const, tabIndex: 0, onClick: fn,
  onKeyDown: (e: RKeyboardEvent) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); fn(); } },
} : {};

export function statusChip(s: unknown) {
  const v = String(s ?? '');
  if (!v) return null;
  const l = v.toLowerCase();
  const cls = /closed|conducted|approved|accepted|completed|implemented|active/.test(l) ? 'closed' : /open|ongoing|planned|notified|due|scheduled/.test(l) ? 'open' : /reject|cancel|overdue|expired/.test(l) ? 'red' : '';
  return <span className={`chip ${cls}`}>{v}</span>;
}

export function fmtValue(col: Column | undefined, v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  if (!col) return String(v);
  if (col.type === 'date' || (col.type === 'computed' && /^add_days/.test(col.compute || ''))) return fmtDate(String(v)) || String(v);
  if (col.type === 'computed' && /^ratio/.test(col.compute || '')) return typeof v === 'number' ? (v * 100).toFixed(2) + '%' : String(v);
  if (col.type === 'percent') return typeof v === 'number' ? (v <= 1 ? (v * 100).toFixed(1) : v.toFixed(1)) + '%' : String(v);
  if (col.type === 'number' && typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2);
  return String(v);
}

export function pct(v: number | null | undefined, d = 1) { return v === null || v === undefined || isNaN(v) ? '–' : (v * 100).toFixed(d) + '%'; }

export function FileDrop({ onFiles, accept, multiple = true, children, capture }: { onFiles: (f: File[]) => void; accept?: string; multiple?: boolean; children?: ReactNode; capture?: boolean }) {
  const [over, setOver] = useState(false);
  const inp = useRef<HTMLInputElement>(null);
  const cam = useRef<HTMLInputElement>(null);
  return (
    <div className={`drop ${over ? 'over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = [...e.dataTransfer.files]; if (f.length) onFiles(multiple ? f : f.slice(0, 1)); }}>
      {children || <div><b>Drag and drop files here</b><div className="muted small">Excel registers, PDF reports, scans, photos, Word documents</div></div>}
      <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
        <button type="button" className="primary" onClick={() => inp.current?.click()}>Upload file</button>
        {capture !== false && <button type="button" onClick={() => cam.current?.click()}>Scan with camera</button>}
      </div>
      <input ref={inp} type="file" hidden accept={accept} multiple={multiple} onChange={(e) => { const f = [...(e.target.files || [])]; e.target.value = ''; if (f.length) onFiles(f); }} />
      <input ref={cam} type="file" hidden accept="image/*" capture="environment" onChange={(e) => { const f = [...(e.target.files || [])]; e.target.value = ''; if (f.length) onFiles(f); }} />
    </div>
  );
}

export function Confirm({ text, onYes, onNo, yes = 'Confirm', danger }: { text: ReactNode; onYes: () => void; onNo: () => void; yes?: string; danger?: boolean }) {
  return (
    <Modal title="Confirm" onClose={onNo} footer={<><button onClick={onNo}>Cancel</button><button className={danger ? 'danger' : 'primary'} onClick={onYes}>{yes}</button></>}>
      <div>{text}</div>
    </Modal>
  );
}

export function useDebounced<T>(v: T, ms = 250): T {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

// Animated number: counts up from 0 to the target when it first appears.
export function CountUp({ value, ms = 900, fmt }: { value: number | null | undefined; ms?: number; fmt?: (n: number) => string }) {
  const [n, setN] = useState(0);
  const target = Number(value ?? 0);
  useEffect(() => {
    if (!isFinite(target)) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setN(target); return; }
    let raf = 0; const t0 = performance.now(); const from = 0;
    const step = (t: number) => { const p = Math.min(1, (t - t0) / ms); const e = 1 - Math.pow(1 - p, 3); setN(from + (target - from) * e); if (p < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  if (value === null || value === undefined || !isFinite(target)) return <>–</>;
  return <>{fmt ? fmt(n) : Math.round(n).toLocaleString()}</>;
}

export function Kpi({ l, v, s, tone, icon, onClick, bar }: { l: string; v: ReactNode; s?: ReactNode; tone?: string; icon?: ReactNode; onClick?: () => void; bar?: number | null }) {
  return (
    <div className={`kpi ${tone || ''} ${onClick ? 'clickable' : ''}`} {...pressable(onClick)}>
      {icon && <div className="ic">{icon}</div>}
      <div className="l">{l}</div><div className="v">{v ?? '–'}</div>{s && <div className="s">{s}</div>}
      {bar !== undefined && bar !== null && <div className="bar"><i style={{ width: `${Math.max(0, Math.min(100, bar * 100))}%` }} /></div>}
    </div>
  );
}

export function Stat({ n, t, d, tone, icon, onClick, pulse }: { n: ReactNode; t: string; d?: ReactNode; tone: string; icon?: ReactNode; onClick?: () => void; pulse?: boolean }) {
  return (
    <button type="button" className={`stat ${tone} ${pulse ? 'pulse' : ''}`} onClick={onClick}>
      <div className="n">{n}</div><div className="t">{t}</div>{d && <div className="d">{d}</div>}
      {icon}
    </button>
  );
}

export function Skeleton({ h = 120, n = 1 }: { h?: number; n?: number }) {
  return <>{Array.from({ length: n }).map((_, i) => <div key={i} className="skel" style={{ height: h, marginBottom: 12 }} />)}</>;
}

export function PageSkeleton() {
  return (
    <div className="page">
      <div className="skel" style={{ height: 34, width: 280, marginBottom: 16 }} />
      <div className="kpis">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skel" style={{ height: 92 }} />)}</div>
      <div className="cards wide">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skel" style={{ height: 290 }} />)}</div>
    </div>
  );
}
