import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Column } from '../../shared/registers';
import { fmtDate } from '../../shared/logic';

export function Drawer({ title, onClose, children, footer, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer" style={wide ? { width: 'min(1200px,100%)' } : undefined}>
        <div className="dhead"><h2 style={{ margin: 0 }}>{title}</h2><button className="ghost" onClick={onClose}>✕</button></div>
        <div className="dbody">{children}</div>
        {footer && <div className="dfoot">{footer}</div>}
      </div>
    </div>
  );
}

export function Modal({ title, onClose, children, footer }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="overlay center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="dhead"><h2 style={{ margin: 0 }}>{title}</h2><button className="ghost" onClick={onClose}>✕</button></div>
        <div className="dbody">{children}</div>
        {footer && <div className="dfoot">{footer}</div>}
      </div>
    </div>
  );
}

export function Spinner() { return <span className="spinner" />; }

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
