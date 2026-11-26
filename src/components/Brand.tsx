// TRAGS brand marks. The logo files are static assets in /brand so they load instantly from the CDN.
export function Logo({ size = 40, white = false, className }: { size?: number; white?: boolean; className?: string }) {
  return <img className={className} src={white ? '/brand/trags-logo-white.png' : '/brand/trags-logo.png'} alt="TRAGS" style={{ height: size * 0.62, width: 'auto', display: 'block', alignSelf: 'flex-start', objectFit: 'contain' }} />;
}

// Square mark for tight spots (sidebar, favicon-like badges).
export function Monogram({ size = 40 }: { size?: number }) {
  return (
    <span style={{ width: size, height: size, borderRadius: size * 0.26, background: 'linear-gradient(135deg,#0b2447,#327cff)', display: 'grid', placeItems: 'center', flex: 'none' }}>
      <img src="/brand/trags-logo-white.png" alt="TRAGS" style={{ width: size * 0.78, height: 'auto' }} />
    </span>
  );
}

export function forgetLogo() { /* logo is static; kept for the Admin branding screen */ }
