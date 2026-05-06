export default function BearLogo({ size = 64, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 72 72"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="bl-helm" x1="25%" y1="0%" x2="75%" y2="100%">
          <stop offset="0%" stopColor="#4a4e74" />
          <stop offset="40%" stopColor="#2e3254" />
          <stop offset="100%" stopColor="#1a1e3e" />
        </linearGradient>
        <radialGradient id="bl-sheen" cx="30%" cy="20%" r="55%">
          <stop offset="0%" stopColor="#5e628c" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#2e3254" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="bl-visor" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a5b4fc" stopOpacity="0.18" />
          <stop offset="50%" stopColor="#6366f1" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#312e81" stopOpacity="0.18" />
        </linearGradient>
        <radialGradient id="bl-eye" cx="38%" cy="32%" r="55%">
          <stop offset="0%" stopColor="#e0e7ff" />
          <stop offset="40%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#4f46e5" />
        </radialGradient>
        <linearGradient id="bl-collar" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#525678" />
          <stop offset="100%" stopColor="#363a5c" />
        </linearGradient>
        <radialGradient id="bl-ear" cx="50%" cy="42%" r="50%">
          <stop offset="0%" stopColor="#818cf8" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#818cf8" stopOpacity="0.04" />
        </radialGradient>
        <radialGradient id="bl-nose" cx="42%" cy="35%" r="55%">
          <stop offset="0%" stopColor="#a5b4fc" />
          <stop offset="100%" stopColor="#6366f1" />
        </radialGradient>
        <filter id="bl-shadow">
          <feDropShadow dx="0" dy="1" stdDeviation="3" floodColor="#06061a" floodOpacity="0.4" />
        </filter>
        <clipPath id="bl-clip">
          <ellipse cx="36" cy="32" rx="17" ry="14.5" />
        </clipPath>
      </defs>

      {/* Helmet */}
      <path d="M13 34 Q13 12 36 8 Q59 12 59 34 Q59 44 50 47 L22 47 Q13 44 13 34 Z"
        fill="url(#bl-helm)" stroke="#424670" strokeWidth="1" filter="url(#bl-shadow)" />
      <path d="M13 34 Q13 12 36 8 Q59 12 59 34 Q59 44 50 47 L22 47 Q13 44 13 34 Z"
        fill="url(#bl-sheen)" />

      {/* Ear bumps */}
      <path d="M13 25 Q9 16 16 11 Q22 8 26 16 Q27 20 22 26" fill="url(#bl-helm)" stroke="#424670" strokeWidth="0.8" />
      <path d="M59 25 Q63 16 56 11 Q50 8 46 16 Q45 20 50 26" fill="url(#bl-helm)" stroke="#424670" strokeWidth="0.8" />

      {/* Visor gasket */}
      <ellipse cx="36" cy="32" rx="19" ry="16.5" fill="none" stroke="#3a3e68" strokeWidth="2.5" />

      {/* Bear face */}
      <g clipPath="url(#bl-clip)">
        <rect x="16" y="14" width="40" height="38" fill="#0c0c20" />
        <ellipse cx="36" cy="34" rx="16" ry="15" fill="#1e1e38" />
        {/* Ears */}
        <circle cx="23" cy="22" r="6" fill="#1e1e38" stroke="#2a2a4a" strokeWidth="0.5" />
        <circle cx="49" cy="22" r="6" fill="#1e1e38" stroke="#2a2a4a" strokeWidth="0.5" />
        <circle cx="23" cy="22" r="3.5" fill="url(#bl-ear)" />
        <circle cx="49" cy="22" r="3.5" fill="url(#bl-ear)" />
        {/* Eyes */}
        <circle cx="29" cy="31" r="3.2" fill="url(#bl-eye)" />
        <circle cx="43" cy="31" r="3.2" fill="url(#bl-eye)" />
        <circle cx="30.2" cy="29.8" r="1.1" fill="#fff" opacity="0.9" />
        <circle cx="44.2" cy="29.8" r="1.1" fill="#fff" opacity="0.9" />
        <circle cx="27.8" cy="32.5" r="0.5" fill="#fff" opacity="0.3" />
        <circle cx="41.8" cy="32.5" r="0.5" fill="#fff" opacity="0.3" />
        {/* Nose */}
        <ellipse cx="36" cy="36" rx="2.5" ry="1.8" fill="url(#bl-nose)" opacity="0.5" />
        {/* Mouth */}
        <path d="M33 39 Q34.5 41 36 39 Q37.5 41 39 39" fill="none" stroke="#36365c" strokeWidth="0.8" strokeLinecap="round" />
      </g>

      {/* Visor glass */}
      <ellipse cx="36" cy="32" rx="17" ry="14.5" fill="url(#bl-visor)" />
      <path d="M23 26 Q30 19 45 22" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M25 28 Q28 25 33 24" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.8" strokeLinecap="round" />

      {/* Chin */}
      <path d="M22 45 Q36 52 50 45 L48 49 Q36 54 24 49 Z" fill="#2a2e50" stroke="#3a3e68" strokeWidth="0.6" />

      {/* Collar */}
      <ellipse cx="36" cy="58" rx="16" ry="4" fill="url(#bl-collar)" stroke="#4e527a" strokeWidth="0.8" />

      {/* Antenna */}
      <line x1="36" y1="7" x2="36" y2="1" stroke="#424670" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="36" cy="0" r="2.2" fill="#1e2250" stroke="#4a4e78" strokeWidth="0.6" />
      <circle cx="36" cy="0" r="1.3" fill="#818cf8" opacity="0.8">
        <animate attributeName="opacity" values="0.8;0.15;0.8" dur="1.5s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}
