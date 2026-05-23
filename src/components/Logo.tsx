export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-label="smutstream">
      <defs>
        <linearGradient id="ss-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff3d7f" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <rect x="6" y="6" width="88" height="88" rx="22" fill="url(#ss-g)" />
      <path
        d="M22 30 L34 12 L40 32 Z"
        fill="url(#ss-g)"
        stroke="#fff"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M78 30 L66 12 L60 32 Z"
        fill="url(#ss-g)"
        stroke="#fff"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M40 32 L72 50 L40 68 Z" fill="#fff" />
    </svg>
  );
}
