export default function AstronautBear({ size = 120, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      className={className}
      aria-hidden="true"
    >
      <defs>
        {/* Helmet — deep metallic with warm edge */}
        <linearGradient id="ab-helm" x1="25%" y1="0%" x2="75%" y2="100%">
          <stop offset="0%" stopColor="#4e5278" />
          <stop offset="15%" stopColor="#3e4268" />
          <stop offset="40%" stopColor="#2a2e54" />
          <stop offset="70%" stopColor="#1e2246" />
          <stop offset="100%" stopColor="#14183a" />
        </linearGradient>
        <radialGradient id="ab-helm-sheen" cx="32%" cy="22%" r="55%">
          <stop offset="0%" stopColor="#6a6e98" stopOpacity="0.35" />
          <stop offset="40%" stopColor="#4a4e78" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#2a2e54" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ab-rim-light" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#818cf8" stopOpacity="0" />
          <stop offset="25%" stopColor="#818cf8" stopOpacity="0.06" />
          <stop offset="50%" stopColor="#c7d2fe" stopOpacity="0.14" />
          <stop offset="75%" stopColor="#818cf8" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#818cf8" stopOpacity="0" />
        </linearGradient>

        {/* Visor — deep tinted glass with environment color */}
        <linearGradient id="ab-visor" x1="0%" y1="20%" x2="100%" y2="80%">
          <stop offset="0%" stopColor="#a5b4fc" stopOpacity="0.2" />
          <stop offset="20%" stopColor="#818cf8" stopOpacity="0.06" />
          <stop offset="50%" stopColor="#4338ca" stopOpacity="0.1" />
          <stop offset="80%" stopColor="#312e81" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#1e1b4b" stopOpacity="0.2" />
        </linearGradient>
        <linearGradient id="ab-visor-env" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#1e1b4b" stopOpacity="0.12" />
          <stop offset="50%" stopColor="#312e81" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#818cf8" stopOpacity="0.05" />
        </linearGradient>
        {/* Animated sweep reflection */}
        <linearGradient id="ab-sweep" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="45%" stopColor="#fff" stopOpacity="0" />
          <stop offset="50%" stopColor="#fff" stopOpacity="0.06" />
          <stop offset="55%" stopColor="#fff" stopOpacity="0" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>

        {/* Collar & chin */}
        <linearGradient id="ab-collar" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#5e6284" />
          <stop offset="30%" stopColor="#4c5072" />
          <stop offset="100%" stopColor="#363a5e" />
        </linearGradient>
        <linearGradient id="ab-chin" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#383c60" />
          <stop offset="100%" stopColor="#262a50" />
        </linearGradient>

        {/* Bear face */}
        <radialGradient id="ab-fur" cx="50%" cy="38%" r="58%">
          <stop offset="0%" stopColor="#282848" />
          <stop offset="50%" stopColor="#1e1e3a" />
          <stop offset="100%" stopColor="#161632" />
        </radialGradient>
        <radialGradient id="ab-snout" cx="50%" cy="40%" r="55%">
          <stop offset="0%" stopColor="#1a1a38" />
          <stop offset="100%" stopColor="#121230" />
        </radialGradient>
        <radialGradient id="ab-ear-in" cx="50%" cy="42%" r="50%">
          <stop offset="0%" stopColor="#818cf8" stopOpacity="0.5" />
          <stop offset="50%" stopColor="#818cf8" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#818cf8" stopOpacity="0.03" />
        </radialGradient>
        <radialGradient id="ab-eye-l" cx="38%" cy="32%" r="58%">
          <stop offset="0%" stopColor="#eef2ff" />
          <stop offset="20%" stopColor="#c7d2fe" />
          <stop offset="50%" stopColor="#818cf8" />
          <stop offset="80%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#4338ca" />
        </radialGradient>
        <radialGradient id="ab-eye-r" cx="62%" cy="32%" r="58%">
          <stop offset="0%" stopColor="#eef2ff" />
          <stop offset="20%" stopColor="#c7d2fe" />
          <stop offset="50%" stopColor="#818cf8" />
          <stop offset="80%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#4338ca" />
        </radialGradient>
        <radialGradient id="ab-nose" cx="42%" cy="32%" r="58%">
          <stop offset="0%" stopColor="#a5b4fc" />
          <stop offset="60%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#6366f1" />
        </radialGradient>

        {/* Hose */}
        <linearGradient id="ab-hose" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#444870" />
          <stop offset="50%" stopColor="#30345c" />
          <stop offset="100%" stopColor="#444870" />
        </linearGradient>

        {/* Ambient */}
        <radialGradient id="ab-ambient" cx="50%" cy="40%" r="54%">
          <stop offset="55%" stopColor="#818cf8" stopOpacity="0" />
          <stop offset="80%" stopColor="#818cf8" stopOpacity="0.035" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0.07" />
        </radialGradient>

        <filter id="ab-glow">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="ab-deep-shadow">
          <feDropShadow dx="0" dy="2" stdDeviation="14" floodColor="#06061a" floodOpacity="0.6" />
          <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor="#818cf8" floodOpacity="0.06" />
        </filter>

        <clipPath id="ab-visor-clip">
          <ellipse cx="100" cy="88" rx="44" ry="38" />
        </clipPath>

        {/* Eyelid clip for blink */}
        <clipPath id="ab-blink-l">
          <rect x="68" y="70" width="28" height="22">
            <animate attributeName="height" values="22;1;22" dur="5s" keyTimes="0;0.04;0.08" keySplines="0.4 0 0.2 1;0.4 0 0.2 1" calcMode="spline" repeatCount="indefinite" begin="2.5s" />
            <animate attributeName="y" values="70;86;70" dur="5s" keyTimes="0;0.04;0.08" keySplines="0.4 0 0.2 1;0.4 0 0.2 1" calcMode="spline" repeatCount="indefinite" begin="2.5s" />
          </rect>
        </clipPath>
        <clipPath id="ab-blink-r">
          <rect x="104" y="70" width="28" height="22">
            <animate attributeName="height" values="22;1;22" dur="5s" keyTimes="0;0.04;0.08" keySplines="0.4 0 0.2 1;0.4 0 0.2 1" calcMode="spline" repeatCount="indefinite" begin="2.5s" />
            <animate attributeName="y" values="70;86;70" dur="5s" keyTimes="0;0.04;0.08" keySplines="0.4 0 0.2 1;0.4 0 0.2 1" calcMode="spline" repeatCount="indefinite" begin="2.5s" />
          </rect>
        </clipPath>
      </defs>

      {/* Ambient aura */}
      <ellipse cx="100" cy="92" rx="92" ry="84" fill="url(#ab-ambient)" />

      {/* ── Life support hoses ── */}
      <path d="M56 118 Q42 132 40 152 Q39 160 46 164" fill="none" stroke="url(#ab-hose)" strokeWidth="6.5" strokeLinecap="round" />
      <path d="M56 118 Q42 132 40 152 Q39 160 46 164" fill="none" stroke="#525688" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="0 8.5" />
      <path d="M144 118 Q158 132 160 152 Q161 160 154 164" fill="none" stroke="url(#ab-hose)" strokeWidth="6.5" strokeLinecap="round" />
      <path d="M144 118 Q158 132 160 152 Q161 160 154 164" fill="none" stroke="#525688" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="0 8.5" />
      <circle cx="46" cy="165" r="5" fill="#2e3258" stroke="#525688" strokeWidth="1.2" />
      <circle cx="46" cy="165" r="2" fill="#3e4270" />
      <circle cx="154" cy="165" r="5" fill="#2e3258" stroke="#525688" strokeWidth="1.2" />
      <circle cx="154" cy="165" r="2" fill="#3e4270" />

      {/* ── Main helmet ── */}
      <path d="M36 96 Q36 40 100 32 Q164 40 164 96 Q164 122 142 130 L58 130 Q36 122 36 96 Z"
        fill="url(#ab-helm)" stroke="#464a78" strokeWidth="1.8" filter="url(#ab-deep-shadow)" />
      <path d="M36 96 Q36 40 100 32 Q164 40 164 96 Q164 122 142 130 L58 130 Q36 122 36 96 Z"
        fill="url(#ab-helm-sheen)" />
      {/* Inner bevel */}
      <path d="M40 96 Q40 44 100 36 Q160 44 160 96 Q160 120 140 127 L60 127 Q40 120 40 96 Z"
        fill="none" stroke="#222650" strokeWidth="1" />

      {/* Panel lines — engineering detail */}
      <path d="M68 36 L62 70" fill="none" stroke="#2e3260" strokeWidth="0.5" opacity="0.6" />
      <path d="M132 36 L138 70" fill="none" stroke="#2e3260" strokeWidth="0.5" opacity="0.6" />
      <path d="M44 80 L56 82" fill="none" stroke="#2e3260" strokeWidth="0.5" opacity="0.5" />
      <path d="M156 80 L144 82" fill="none" stroke="#2e3260" strokeWidth="0.5" opacity="0.5" />
      {/* Micro rivets along panel lines */}
      <circle cx="64" cy="50" r="0.8" fill="#3a3e68" />
      <circle cx="136" cy="50" r="0.8" fill="#3a3e68" />
      <circle cx="62" cy="60" r="0.8" fill="#3a3e68" />
      <circle cx="138" cy="60" r="0.8" fill="#3a3e68" />

      {/* Wear marks */}
      <path d="M48 62 L52 64" stroke="rgba(255,255,255,0.02)" strokeWidth="0.5" strokeLinecap="round" />
      <path d="M155 74 L152 76 L154 78" stroke="rgba(255,255,255,0.015)" strokeWidth="0.4" strokeLinecap="round" />

      {/* ── Ear bumps ── */}
      <path d="M36 70 Q28 48 42 36 Q56 28 64 46 Q66 58 56 70" fill="url(#ab-helm)" stroke="#464a78" strokeWidth="1.2" />
      <path d="M38 68 Q32 50 44 40 Q54 34 62 48 Q64 56 55 68" fill="url(#ab-helm-sheen)" />
      <path d="M164 70 Q172 48 158 36 Q144 28 136 46 Q134 58 144 70" fill="url(#ab-helm)" stroke="#464a78" strokeWidth="1.2" />
      <path d="M162 68 Q168 50 156 40 Q146 34 138 48 Q136 56 145 68" fill="url(#ab-helm-sheen)" />
      {/* Ear bump seam */}
      <path d="M44 40 Q50 46 56 58" fill="none" stroke="#2e3260" strokeWidth="0.4" opacity="0.5" />
      <path d="M156 40 Q150 46 144 58" fill="none" stroke="#2e3260" strokeWidth="0.4" opacity="0.5" />

      {/* ── Side panels ── */}
      <rect x="30" y="82" width="11" height="26" rx="3" fill="#161a3e" stroke="#3a3e68" strokeWidth="0.8" />
      <rect x="32.5" y="85" width="6" height="3.5" rx="1" fill="#0e1230" />
      <rect x="32.5" y="91" width="4.5" height="1.8" rx="0.5" fill="#818cf8" opacity="0.3">
        <animate attributeName="width" values="4.5;2;4.5" dur="3s" repeatCount="indefinite" />
      </rect>
      <rect x="32.5" y="95" width="6" height="1.8" rx="0.5" fill="#4ade80" opacity="0.2">
        <animate attributeName="width" values="6;3;6" dur="4s" repeatCount="indefinite" />
      </rect>
      <rect x="32.5" y="99" width="3" height="1.8" rx="0.5" fill="#fbbf24" opacity="0.15" />
      <rect x="32.5" y="103" width="5" height="1.8" rx="0.5" fill="#818cf8" opacity="0.12" />

      <rect x="159" y="82" width="11" height="26" rx="3" fill="#161a3e" stroke="#3a3e68" strokeWidth="0.8" />
      <circle cx="164.5" cy="89" r="2.8" fill="#818cf8" opacity="0.45">
        <animate attributeName="opacity" values="0.45;0.08;0.45" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="164.5" cy="97" r="2.8" fill="#4ade80" opacity="0.35">
        <animate attributeName="opacity" values="0.35;0.06;0.35" dur="2.8s" repeatCount="indefinite" />
      </circle>
      <circle cx="164.5" cy="104" r="1.5" fill="#fbbf24" opacity="0.2">
        <animate attributeName="opacity" values="0.2;0.04;0.2" dur="4s" repeatCount="indefinite" />
      </circle>

      {/* ── Visor gasket ── */}
      <ellipse cx="100" cy="88" rx="48.5" ry="42.5" fill="none" stroke="#3e4270" strokeWidth="5.5" />
      <ellipse cx="100" cy="88" rx="51.5" ry="45.5" fill="none" stroke="#2a2e5c" strokeWidth="0.8" />
      <ellipse cx="100" cy="88" rx="45.5" ry="39.5" fill="none" stroke="#2a2e5c" strokeWidth="0.8" />
      {/* Gasket corner bolts */}
      <circle cx="55" cy="74" r="2" fill="#505480" stroke="#62668e" strokeWidth="0.4" />
      <circle cx="145" cy="74" r="2" fill="#505480" stroke="#62668e" strokeWidth="0.4" />
      <circle cx="55" cy="102" r="2" fill="#505480" stroke="#62668e" strokeWidth="0.4" />
      <circle cx="145" cy="102" r="2" fill="#505480" stroke="#62668e" strokeWidth="0.4" />
      {/* Top center bolt */}
      <circle cx="100" cy="48" r="1.5" fill="#505480" />

      {/* ── Bear face ── */}
      <g clipPath="url(#ab-visor-clip)">
        <rect x="48" y="42" width="104" height="96" fill="#0a0a1e" />
        {/* Interior display glow on walls */}
        <ellipse cx="68" cy="100" rx="12" ry="18" fill="#818cf8" opacity="0.015" />
        <ellipse cx="132" cy="100" rx="12" ry="18" fill="#4ade80" opacity="0.01" />
        {/* Head */}
        <ellipse cx="100" cy="92" rx="44" ry="42" fill="url(#ab-fur)" />
        {/* Fur texture — directional strokes */}
        <ellipse cx="100" cy="90" rx="40" ry="38" fill="none" stroke="#2a2a4e" strokeWidth="0.35" opacity="0.6" />
        <ellipse cx="100" cy="88" rx="34" ry="32" fill="none" stroke="#222244" strokeWidth="0.25" opacity="0.4" />
        <path d="M76 72 Q78 68 82 66" fill="none" stroke="#2a2a4c" strokeWidth="0.35" opacity="0.4" />
        <path d="M72 76 Q74 72 78 70" fill="none" stroke="#2a2a4c" strokeWidth="0.3" opacity="0.35" />
        <path d="M124 72 Q122 68 118 66" fill="none" stroke="#2a2a4c" strokeWidth="0.35" opacity="0.4" />
        <path d="M128 76 Q126 72 122 70" fill="none" stroke="#2a2a4c" strokeWidth="0.3" opacity="0.35" />
        <path d="M80 106 Q86 110 92 112" fill="none" stroke="#222244" strokeWidth="0.3" opacity="0.3" />
        <path d="M120 106 Q114 110 108 112" fill="none" stroke="#222244" strokeWidth="0.3" opacity="0.3" />

        {/* Ears */}
        <circle cx="64" cy="60" r="16" fill="#1e1e3a" stroke="#2e2e52" strokeWidth="1" />
        <circle cx="136" cy="60" r="16" fill="#1e1e3a" stroke="#2e2e52" strokeWidth="1" />
        <circle cx="64" cy="60" r="9.5" fill="url(#ab-ear-in)" />
        <circle cx="136" cy="60" r="9.5" fill="url(#ab-ear-in)" />
        {/* Inner ear detail */}
        <circle cx="64" cy="60" r="5" fill="#818cf8" opacity="0.06" />
        <circle cx="136" cy="60" r="5" fill="#818cf8" opacity="0.06" />

        {/* Brow ridge shadow */}
        <ellipse cx="100" cy="78" rx="30" ry="7" fill="#12122c" opacity="0.5" />

        {/* Snout */}
        <ellipse cx="100" cy="100" rx="17" ry="13" fill="url(#ab-snout)" />
        <ellipse cx="100" cy="99" rx="15" ry="11" fill="#1a1a3a" />

        {/* ── Eyes with blink ── */}
        {/* Left eye */}
        <g clipPath="url(#ab-blink-l)">
          <ellipse cx="82" cy="86" rx="10.5" ry="10" fill="#0e0e28" />
          <circle cx="82" cy="86" r="8.5" fill="url(#ab-eye-l)" filter="url(#ab-glow)" />
          {/* Iris ring */}
          <circle cx="82" cy="86" r="7" fill="none" stroke="#4338ca" strokeWidth="0.6" opacity="0.3" />
          {/* Pupil */}
          <circle cx="82" cy="87" r="4.5" fill="#312e81" opacity="0.3" />
          <circle cx="82" cy="88" r="2.5" fill="#1e1b4b" opacity="0.25" />
          {/* Catch lights */}
          <circle cx="85.5" cy="82.5" r="3" fill="#fff" opacity="0.93" />
          <circle cx="79" cy="89.5" r="1.3" fill="#fff" opacity="0.4" />
          <circle cx="87" cy="80.5" r="0.7" fill="#fff" opacity="0.2" />
        </g>
        {/* Right eye */}
        <g clipPath="url(#ab-blink-r)">
          <ellipse cx="118" cy="86" rx="10.5" ry="10" fill="#0e0e28" />
          <circle cx="118" cy="86" r="8.5" fill="url(#ab-eye-r)" filter="url(#ab-glow)" />
          <circle cx="118" cy="86" r="7" fill="none" stroke="#4338ca" strokeWidth="0.6" opacity="0.3" />
          <circle cx="118" cy="87" r="4.5" fill="#312e81" opacity="0.3" />
          <circle cx="118" cy="88" r="2.5" fill="#1e1b4b" opacity="0.25" />
          <circle cx="121.5" cy="82.5" r="3" fill="#fff" opacity="0.93" />
          <circle cx="115" cy="89.5" r="1.3" fill="#fff" opacity="0.4" />
          <circle cx="123" cy="80.5" r="0.7" fill="#fff" opacity="0.2" />
        </g>
        {/* Eyelid lines (visible during blink) */}
        <path d="M72 86 Q82 83 92 86" fill="none" stroke="#2a2a50" strokeWidth="0.6" opacity="0.3" />
        <path d="M108 86 Q118 83 128 86" fill="none" stroke="#2a2a50" strokeWidth="0.6" opacity="0.3" />

        {/* Nose */}
        <ellipse cx="100" cy="96" rx="6" ry="4.2" fill="url(#ab-nose)" opacity="0.55" />
        <ellipse cx="99" cy="95" rx="2.5" ry="1.1" fill="#fff" opacity="0.12" />
        {/* Nostrils */}
        <circle cx="97" cy="97.5" r="0.8" fill="#4338ca" opacity="0.2" />
        <circle cx="103" cy="97.5" r="0.8" fill="#4338ca" opacity="0.2" />
        {/* Nose bridge */}
        <line x1="100" y1="90" x2="100" y2="93" stroke="#2a2a52" strokeWidth="0.7" strokeLinecap="round" />

        {/* Mouth */}
        <path d="M92 105 Q96 109 100 105.5 Q104 109 108 105" fill="none" stroke="#3a3a64" strokeWidth="1.3" strokeLinecap="round" />
        {/* Lower lip highlight */}
        <path d="M96 107 Q100 108.5 104 107" fill="none" stroke="#2e2e56" strokeWidth="0.5" strokeLinecap="round" />

        {/* Cheek blush */}
        <ellipse cx="66" cy="96" rx="7" ry="4.5" fill="#818cf8" opacity="0.035" />
        <ellipse cx="134" cy="96" rx="7" ry="4.5" fill="#818cf8" opacity="0.035" />

        {/* Whisker dots */}
        <circle cx="76" cy="100" r="0.8" fill="#3e3e6a" />
        <circle cx="73" cy="97" r="0.8" fill="#3e3e6a" />
        <circle cx="73" cy="103" r="0.7" fill="#3e3e6a" />
        <circle cx="124" cy="100" r="0.8" fill="#3e3e6a" />
        <circle cx="127" cy="97" r="0.8" fill="#3e3e6a" />
        <circle cx="127" cy="103" r="0.7" fill="#3e3e6a" />
      </g>

      {/* ── Visor glass ── */}
      <ellipse cx="100" cy="88" rx="44" ry="38" fill="url(#ab-visor)" />
      <ellipse cx="100" cy="88" rx="44" ry="38" fill="url(#ab-visor-env)" />
      {/* Animated sweep reflection */}
      <ellipse cx="100" cy="88" rx="44" ry="38" fill="url(#ab-sweep)">
        <animate attributeName="opacity" values="0;0;1;0;0" dur="8s" repeatCount="indefinite" />
      </ellipse>
      {/* Primary reflection arc */}
      <path d="M64 70 Q82 52 126 60" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M68 76 Q78 64 98 62" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="2" strokeLinecap="round" />
      <path d="M72 80 Q76 76 84 75" fill="none" stroke="rgba(255,255,255,0.035)" strokeWidth="1.2" strokeLinecap="round" />
      {/* Bottom rim glow */}
      <path d="M70 118 Q100 126 130 118" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="1.5" strokeLinecap="round" />

      {/* Star reflections */}
      <circle cx="134" cy="70" r="1.1" fill="#fff" opacity="0.14" />
      <circle cx="128" cy="77" r="0.7" fill="#fff" opacity="0.09" />
      <circle cx="138" cy="82" r="0.5" fill="#fff" opacity="0.06" />
      <circle cx="68" cy="112" r="0.8" fill="#fff" opacity="0.06" />
      <circle cx="136" cy="108" r="0.5" fill="#c084fc" opacity="0.05" />
      <circle cx="72" cy="66" r="0.6" fill="#fff" opacity="0.11">
        <animate attributeName="opacity" values="0.11;0.02;0.11" dur="4.5s" repeatCount="indefinite" />
      </circle>
      <circle cx="130" cy="114" r="0.4" fill="#2dd4bf" opacity="0.05">
        <animate attributeName="opacity" values="0.05;0.01;0.05" dur="6s" repeatCount="indefinite" />
      </circle>

      {/* ── Rim light ── */}
      <path d="M46 54 Q100 28 154 54" fill="none" stroke="url(#ab-rim-light)" strokeWidth="2" />

      {/* ── Chin guard ── */}
      <path d="M60 124 Q100 142 140 124 L136 134 Q100 150 64 134 Z" fill="url(#ab-chin)" stroke="#424670" strokeWidth="1" />
      {/* Chin vents */}
      <line x1="86" y1="132" x2="86" y2="139" stroke="#282c54" strokeWidth="1" strokeLinecap="round" />
      <line x1="91" y1="133" x2="91" y2="140" stroke="#282c54" strokeWidth="1" strokeLinecap="round" />
      <line x1="96" y1="133.5" x2="96" y2="140.5" stroke="#282c54" strokeWidth="1" strokeLinecap="round" />
      <line x1="101" y1="133.5" x2="101" y2="140.5" stroke="#282c54" strokeWidth="1" strokeLinecap="round" />
      <line x1="106" y1="133" x2="106" y2="140" stroke="#282c54" strokeWidth="1" strokeLinecap="round" />
      <line x1="111" y1="132" x2="111" y2="139" stroke="#282c54" strokeWidth="1" strokeLinecap="round" />
      {/* Chin center emblem */}
      <circle cx="100" cy="132" r="3" fill="#222650" stroke="#3a3e68" strokeWidth="0.6" />
      <circle cx="100" cy="132" r="1.5" fill="#818cf8" opacity="0.2" />

      {/* ── Collar ── */}
      <ellipse cx="100" cy="154" rx="40" ry="11" fill="url(#ab-collar)" stroke="#585c88" strokeWidth="1.5" />
      <ellipse cx="100" cy="151.5" rx="36" ry="8" fill="none" stroke="#424670" strokeWidth="0.6" />
      <ellipse cx="100" cy="156.5" rx="36" ry="8" fill="none" stroke="#424670" strokeWidth="0.6" />
      {/* Collar bolts */}
      <circle cx="66" cy="155" r="2.3" fill="#5a5e88" stroke="#6e729a" strokeWidth="0.5" />
      <circle cx="78" cy="152" r="2.3" fill="#5a5e88" stroke="#6e729a" strokeWidth="0.5" />
      <circle cx="122" cy="152" r="2.3" fill="#5a5e88" stroke="#6e729a" strokeWidth="0.5" />
      <circle cx="134" cy="155" r="2.3" fill="#5a5e88" stroke="#6e729a" strokeWidth="0.5" />
      {/* Center ports */}
      <rect x="91" y="161" width="7" height="4.5" rx="1.5" fill="#282c54" stroke="#424670" strokeWidth="0.7" />
      <rect x="102" y="161" width="7" height="4.5" rx="1.5" fill="#282c54" stroke="#424670" strokeWidth="0.7" />
      <rect x="93" y="162.5" width="3" height="1.5" rx="0.4" fill="#818cf8" opacity="0.18" />
      <rect x="104" y="162.5" width="3" height="1.5" rx="0.4" fill="#4ade80" opacity="0.12" />
      {/* Collar highlight */}
      <ellipse cx="100" cy="148" rx="30" ry="5" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.8" />

      {/* ── Antenna ── */}
      <rect x="93" y="29" width="14" height="7" rx="3" fill="#2e3260" stroke="#464a78" strokeWidth="0.8" />
      <line x1="100" y1="29" x2="100" y2="8" stroke="#464a78" strokeWidth="3" strokeLinecap="round" />
      <line x1="100" y1="29" x2="100" y2="8" stroke="#585c88" strokeWidth="1.2" strokeLinecap="round" />
      {/* Stalk segments */}
      <line x1="96" y1="22" x2="104" y2="22" stroke="#585c88" strokeWidth="1" />
      <line x1="96" y1="16" x2="104" y2="16" stroke="#585c88" strokeWidth="1" />
      {/* Tip housing */}
      <circle cx="100" cy="6" r="6.5" fill="#1e2250" stroke="#525688" strokeWidth="1.2" />
      <circle cx="100" cy="6" r="4.5" fill="#181c42" />
      <circle cx="100" cy="6" r="3" fill="#818cf8" opacity="0.8">
        <animate attributeName="opacity" values="0.8;0.12;0.8" dur="1.5s" repeatCount="indefinite" />
      </circle>
      {/* Antenna tip highlight */}
      <circle cx="98.5" cy="4.5" r="1" fill="#fff" opacity="0.15" />
      {/* Signal rings */}
      <circle cx="100" cy="6" r="6.5" fill="none" stroke="#818cf8" strokeWidth="0.7" opacity="0.22">
        <animate attributeName="r" values="6.5;20;6.5" dur="2.5s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.22;0;0.22" dur="2.5s" repeatCount="indefinite" />
      </circle>
      <circle cx="100" cy="6" r="6.5" fill="none" stroke="#818cf8" strokeWidth="0.4" opacity="0.1">
        <animate attributeName="r" values="6.5;32;6.5" dur="2.5s" begin="0.6s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.1;0;0.1" dur="2.5s" begin="0.6s" repeatCount="indefinite" />
      </circle>

      {/* ── Floating particles ── */}
      <circle cx="18" cy="50" r="1" fill="#818cf8" opacity="0.1">
        <animate attributeName="cy" values="50;42;50" dur="7s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.1;0.02;0.1" dur="7s" repeatCount="indefinite" />
      </circle>
      <circle cx="182" cy="70" r="0.8" fill="#c084fc" opacity="0.08">
        <animate attributeName="cy" values="70;62;70" dur="8s" repeatCount="indefinite" />
      </circle>
      <circle cx="12" cy="124" r="0.6" fill="#fff" opacity="0.05">
        <animate attributeName="cy" values="124;118;124" dur="5.5s" repeatCount="indefinite" />
      </circle>
      <circle cx="188" cy="40" r="0.7" fill="#818cf8" opacity="0.06">
        <animate attributeName="cy" values="40;34;40" dur="9s" repeatCount="indefinite" />
      </circle>
      <circle cx="26" cy="155" r="0.5" fill="#a5b4fc" opacity="0.05">
        <animate attributeName="cy" values="155;150;155" dur="6s" repeatCount="indefinite" />
      </circle>
      <circle cx="174" cy="155" r="0.4" fill="#2dd4bf" opacity="0.04">
        <animate attributeName="cy" values="155;150;155" dur="7.5s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}
