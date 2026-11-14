export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden className="logo">
      <rect width="512" height="512" rx="112" fill="var(--accent)" />
      <g fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16">
        <rect x="104" y="112" width="76" height="76" rx="18" />
        <path d="M122 150l16 16 28-32" />
        <rect x="104" y="218" width="76" height="76" rx="18" />
        <path d="M122 256l16 16 28-32" />
        <rect x="104" y="324" width="76" height="76" rx="18" />
      </g>
      <g fill="#fff">
        <rect x="216" y="134" width="192" height="32" rx="16" opacity=".6" />
        <rect x="216" y="240" width="160" height="32" rx="16" opacity=".6" />
        <rect x="216" y="346" width="192" height="32" rx="16" />
      </g>
    </svg>
  );
}
