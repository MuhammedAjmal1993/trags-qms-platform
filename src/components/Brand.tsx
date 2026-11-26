import { useState } from 'react';

// Placeholder mark used until the TRAGS logo is uploaded in Admin > Branding.
export function Monogram({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <defs>
        <linearGradient id="mg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1463f3" /><stop offset="1" stopColor="#7c3aed" /></linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill="url(#mg)" />
      <path d="M12 14h24v6h-9v16h-6V20h-9z" fill="#fff" />
      <circle cx="35" cy="34" r="6" fill="#14b8a6" stroke="#fff" strokeWidth="2" />
      <path d="M32.3 34.2l1.8 1.8 3.4-3.6" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

let logoOk: boolean | null = (() => { try { const v = sessionStorage.getItem('logo'); return v === null ? null : v === '1'; } catch { return null; } })();
const remember = (ok: boolean) => { logoOk = ok; try { sessionStorage.setItem('logo', ok ? '1' : '0'); } catch { /* ignore */ } };
export function forgetLogo() { logoOk = null; try { sessionStorage.removeItem('logo'); } catch { /* ignore */ } }

export function Logo({ size = 40 }: { size?: number }) {
  // Shows the monogram until the uploaded logo has loaded, so the layout never flashes empty.
  const [loaded, setLoaded] = useState<boolean | null>(logoOk);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      {loaded !== true && <Monogram size={size} />}
      {loaded !== false && (
        <img src="/api/public/logo" alt="TRAGS" style={{ height: size, width: 'auto', maxWidth: size * 3, display: loaded ? 'block' : 'none' }}
          onLoad={() => { remember(true); setLoaded(true); }} onError={() => { remember(false); setLoaded(false); }} />
      )}
    </span>
  );
}
