import { mergeProps } from 'solid-js';
import type { ThemeName } from './ThemeBg';

export default function AstronautBear(props: { size?: number; class?: string; accent?: string; theme?: ThemeName }) {
  const p = mergeProps({ size: 120, class: '', accent: '#818cf8', theme: 'darkbear' as ThemeName }, props);
  return (
    <svg width={p.size} height={p.size} viewBox="0 0 200 200" class={p.class} aria-hidden="true">
      <defs>
        <radialGradient id="ab-fur" cx="45%" cy="35%" r="60%">
          <stop offset="0%" stop-color="#8d6555" />
          <stop offset="50%" stop-color="#7a5444" />
          <stop offset="100%" stop-color="#5c3d2e" />
        </radialGradient>
        <radialGradient id="ab-snout" cx="50%" cy="35%" r="55%">
          <stop offset="0%" stop-color="#b8978a" />
          <stop offset="100%" stop-color="#9b7868" />
        </radialGradient>
        <radialGradient id="ab-ear-in" cx="50%" cy="42%" r="50%">
          <stop offset="0%" stop-color={p.accent} stop-opacity="0.55" />
          <stop offset="100%" stop-color={p.accent} stop-opacity="0.08" />
        </radialGradient>
        <radialGradient id="ab-eye-l" cx="38%" cy="32%" r="58%">
          <stop offset="0%" stop-color="#eef2ff" />
          <stop offset="20%" stop-color="#e0e8ff" />
          <stop offset="60%" stop-color={p.accent} />
          <stop offset="100%" stop-color={p.accent} stop-opacity="0.5" />
        </radialGradient>
        <radialGradient id="ab-eye-r" cx="62%" cy="32%" r="58%">
          <stop offset="0%" stop-color="#eef2ff" />
          <stop offset="20%" stop-color="#e0e8ff" />
          <stop offset="60%" stop-color={p.accent} />
          <stop offset="100%" stop-color={p.accent} stop-opacity="0.5" />
        </radialGradient>
        <radialGradient id="ab-nose" cx="42%" cy="32%" r="58%">
          <stop offset="0%" stop-color="#fff" stop-opacity="0.3" />
          <stop offset="50%" stop-color="#2d1f18" />
          <stop offset="100%" stop-color="#1a1210" />
        </radialGradient>
        <radialGradient id="ab-ambient" cx="50%" cy="42%" r="54%">
          <stop offset="55%" stop-color={p.accent} stop-opacity="0" />
          <stop offset="100%" stop-color={p.accent} stop-opacity="0.08" />
        </radialGradient>
        <radialGradient id="ab-body" cx="50%" cy="25%" r="70%">
          <stop offset="0%" stop-color="#7a5444" />
          <stop offset="100%" stop-color="#5c3d2e" />
        </radialGradient>
        <filter id="ab-glow">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="ab-shadow">
          <feDropShadow dx="0" dy="3" stdDeviation="10" flood-color="#06061a" flood-opacity="0.5" />
          <feDropShadow dx="0" dy="0" stdDeviation="6" flood-color={p.accent} flood-opacity="0.06" />
        </filter>
        <clipPath id="ab-blink-l">
          <rect x="58" y="64" width="28" height="24">
            <animate attributeName="height" values="24;1;24" dur="5s" keyTimes="0;0.04;0.08" keySplines="0.4 0 0.2 1;0.4 0 0.2 1" calcMode="spline" repeatCount="indefinite" begin="2.5s" />
            <animate attributeName="y" values="64;82;64" dur="5s" keyTimes="0;0.04;0.08" keySplines="0.4 0 0.2 1;0.4 0 0.2 1" calcMode="spline" repeatCount="indefinite" begin="2.5s" />
          </rect>
        </clipPath>
        <clipPath id="ab-blink-r">
          <rect x="114" y="64" width="28" height="24">
            <animate attributeName="height" values="24;1;24" dur="5s" keyTimes="0;0.04;0.08" keySplines="0.4 0 0.2 1;0.4 0 0.2 1" calcMode="spline" repeatCount="indefinite" begin="2.5s" />
            <animate attributeName="y" values="64;82;64" dur="5s" keyTimes="0;0.04;0.08" keySplines="0.4 0 0.2 1;0.4 0 0.2 1" calcMode="spline" repeatCount="indefinite" begin="2.5s" />
          </rect>
        </clipPath>
      </defs>

      <ellipse cx="100" cy="95" rx="95" ry="85" fill="url(#ab-ambient)" />

      {/* ═══ BODY ═══ */}
      <ellipse cx="100" cy="158" rx="38" ry="30" fill="url(#ab-body)" stroke="#5a3d30" stroke-width="1" filter="url(#ab-shadow)" />
      {/* Paws */}
      <ellipse cx="66" cy="164" rx="10" ry="8" fill="#6b4838" stroke="#5a3d30" stroke-width="0.8" />
      <ellipse cx="134" cy="164" rx="10" ry="8" fill="#6b4838" stroke="#5a3d30" stroke-width="0.8" />
      <ellipse cx="66" cy="166" rx="4" ry="2.5" fill="#9b7868" opacity="0.5" />
      <ellipse cx="134" cy="166" rx="4" ry="2.5" fill="#9b7868" opacity="0.5" />

      {/* ═══ THEME OUTFITS ═══ */}
      {p.theme === 'darkbear' && <>
        <ellipse cx="100" cy="158" rx="37" ry="29" fill="#2d2852" stroke="#4338ca" stroke-width="1.2" />
        <path d="M74 144 Q100 138 126 144" fill="none" stroke="#6366f1" stroke-width="2.5" />
        <rect x="86" y="146" width="28" height="4" rx="2" fill="#818cf8" opacity="0.5" />
        <path d="M80 150 L80 175" stroke="#4338ca" stroke-width="1" opacity="0.3" />
        <rect x="92" y="156" width="16" height="10" rx="2" fill="#1e1b4b" stroke="#6366f1" stroke-width="0.6" opacity="0.6" />
      </>}
      {p.theme === 'midnight' && <>
        <ellipse cx="100" cy="158" rx="37" ry="29" fill="#0f1633" stroke="#4f5bab" stroke-width="1" />
        <path d="M68 148 Q100 140 132 148" fill="none" stroke="#8b9cf8" stroke-width="2" />
        {[82,92,100,108,118].map((x, i) => (
          <circle cx={x} cy={155 + (i % 2) * 4} r="1.5" fill="#c7d2fe" opacity={0.5}>
            <animate attributeName="opacity" values="0.5;0.15;0.5" dur={`${2 + i * 0.3}s`} repeatCount="indefinite" />
          </circle>
        ))}
      </>}
      {p.theme === 'obsidian' && <>
        <ellipse cx="100" cy="158" rx="37" ry="29" fill="#1a0f2e" stroke="#7c3aed" stroke-width="1" />
        <polygon points="100,144 94,156 106,156" fill="#a78bfa" opacity="0.5" />
        <polygon points="86,148 82,158 90,158" fill="#c4b5fd" opacity="0.35" />
        <polygon points="114,148 118,158 110,158" fill="#c4b5fd" opacity="0.35" />
      </>}
      {p.theme === 'nord' && <>
        <ellipse cx="100" cy="158" rx="37" ry="29" fill="#3b4252" stroke="#88c0d0" stroke-width="1" />
        <path d="M66 150 Q100 142 134 150" fill="none" stroke="#88c0d0" stroke-width="2.5" />
        <path d="M68 148 Q78 144 88 146 Q100 142 112 146 Q122 144 132 148" fill="none" stroke="#eceff4" stroke-width="3.5" opacity="0.4" />
      </>}
      {p.theme === 'gruvbox' && <>
        <ellipse cx="100" cy="158" rx="37" ry="29" fill="#282828" stroke="#d79921" stroke-width="1.2" />
        <path d="M76 144 Q100 140 124 144" fill="none" stroke="#fabd2f" stroke-width="2" />
        <rect x="92" y="144" width="16" height="6" rx="2" fill="#d79921" opacity="0.5" />
      </>}
      {p.theme === 'rose-pine' && <>
        <ellipse cx="100" cy="158" rx="37" ry="29" fill="#26233a" stroke="#908caa" stroke-width="1" />
        <path d="M72 148 Q86 142 100 144 Q114 142 128 148" fill="none" stroke="#9ccfd8" stroke-width="2" />
        <path d="M66 152 Q100 160 134 152" fill="none" stroke="#eb6f92" stroke-width="1" opacity="0.5" />
      </>}
      {p.theme === 'abyss' && <>
        <ellipse cx="100" cy="158" rx="37" ry="29" fill="#0a1628" stroke="#0ea5e9" stroke-width="1.2" />
        <path d="M74 146 Q100 138 126 146" fill="none" stroke="#2dd4bf" stroke-width="2" />
        <path d="M76 146 Q100 140 124 146" fill="none" stroke="#0ea5e9" stroke-width="1.5" opacity="0.6" />
      </>}
      {p.theme === 'ember' && <>
        <ellipse cx="100" cy="158" rx="37" ry="29" fill="#2a0e04" stroke="#ea580c" stroke-width="1.2" />
        <path d="M76 150 Q80 142 86 154 Q90 148 96 160 Q100 152 104 160 Q110 148 114 154 Q120 142 124 150"
          fill="none" stroke="#f97316" stroke-width="1.5" opacity="0.5" />
      </>}
      {p.theme === 'aurora' && <>
        <ellipse cx="100" cy="158" rx="37" ry="29" fill="#1a3830" stroke="#34d399" stroke-width="1" />
        <path d="M70 155 Q85 150 100 155 Q115 150 130 155" fill="none" stroke="#6ee7b7" stroke-width="2.5" opacity="0.4" />
        <path d="M72 162 Q87 158 100 162 Q113 158 128 162" fill="none" stroke="#6ee7b7" stroke-width="2" opacity="0.3" />
      </>}
      {p.theme === 'catppuccin' && <>
        <ellipse cx="100" cy="158" rx="37" ry="29" fill="#1e1e2e" stroke="#cba6f7" stroke-width="1" />
        <path d="M60 126 Q100 140 140 126" fill="none" stroke="#f5c2e7" stroke-width="3.5" opacity="0.6" />
        <circle cx="100" cy="137" r="6" fill="#f9e2af" opacity="0.6" stroke="#df8e1d" stroke-width="1" />
        <circle cx="100" cy="137" r="2.5" fill="#f9e2af" opacity="0.4" />
      </>}
      {p.theme === 'tokyo-night' && <>
        <ellipse cx="100" cy="158" rx="37" ry="29" fill="#16161e" stroke="#7aa2f7" stroke-width="1" />
        <path d="M78 150 L78 172" stroke="#7aa2f7" stroke-width="1.5" opacity="0.35" />
        <path d="M122 150 L122 172" stroke="#7aa2f7" stroke-width="1.5" opacity="0.35" />
        <rect x="88" y="146" width="24" height="8" rx="2" fill="#7aa2f7" opacity="0.2" />
        <rect x="92" y="148" width="16" height="4" rx="1" fill="#bb9af7" opacity="0.25" />
      </>}
      {p.theme === 'dracula' && <>
        <path d="M52 136 Q46 158 46 182 Q46 196 58 198 L100 192 L142 198 Q154 196 154 182 Q154 158 148 136"
          fill="#2d1b4e" stroke="#bd93f9" stroke-width="1.2" opacity="0.7" />
        <path d="M56 138 Q50 160 50 182" fill="none" stroke="#ff5555" stroke-width="1" opacity="0.25" />
        <path d="M144 138 Q150 160 150 182" fill="none" stroke="#ff5555" stroke-width="1" opacity="0.25" />
        <ellipse cx="100" cy="158" rx="35" ry="27" fill="#282a36" />
      </>}
      {p.theme === 'solarized' && <>
        <path d="M58 140 Q56 158 56 180 Q56 188 62 190 L100 186 L138 190 Q144 188 144 180 Q144 158 142 140"
          fill="#fdf6e3" stroke="#93a1a1" stroke-width="1" opacity="0.55" />
        <ellipse cx="100" cy="158" rx="35" ry="27" fill="url(#ab-body)" />
        <line x1="100" y1="140" x2="100" y2="180" stroke="#93a1a1" stroke-width="0.8" opacity="0.2" />
        <rect x="112" y="152" width="10" height="8" rx="1.5" fill="#268bd2" opacity="0.25" />
      </>}
      {p.theme === 'starfield' && <>
        <ellipse cx="100" cy="158" rx="37" ry="29" fill="#0d1030" stroke="#4f5bab" stroke-width="1" />
        {[82,90,100,110,118].map((x, i) => (
          <circle cx={x} cy={154 + (i % 2) * 6} r="1.2" fill="#c7d2fe" opacity={0.5}>
            <animate attributeName="opacity" values="0.5;0.1;0.5" dur={`${2 + i * 0.3}s`} repeatCount="indefinite" />
          </circle>
        ))}
      </>}
      {p.theme === 'lightning' && <>
        <ellipse cx="100" cy="158" rx="37" ry="29" fill="#0c1a3d" stroke="#3b82f6" stroke-width="1.2" />
        <path d="M86 148 L90 158 L84 156 L92 170" fill="none" stroke="#60a5fa" stroke-width="1.8" opacity="0.45" />
        <path d="M114 148 L110 158 L116 156 L108 170" fill="none" stroke="#93c5fd" stroke-width="1.5" opacity="0.4" />
      </>}
      {p.theme === 'phoenix' && <>
        <ellipse cx="100" cy="158" rx="37" ry="29" fill="#2a0e02" stroke="#ea580c" stroke-width="1.2" />
        <path d="M78 150 Q82 142 88 155 Q94 146 100 158 Q106 146 112 155 Q118 142 122 150"
          fill="none" stroke="#f59e0b" stroke-width="1.5" opacity="0.45" />
      </>}
      {p.theme === 'retro' && <>
        <ellipse cx="100" cy="158" rx="37" ry="29" fill="#1a0a2e" stroke="#e879f9" stroke-width="1.2" />
        <rect x="82" y="148" width="36" height="10" rx="3" fill="#06b6d4" opacity="0.2" />
        <path d="M70 152 L130 152" stroke="#ff00ff" stroke-width="1.5" opacity="0.3" />
        <path d="M70 160 L130 160" stroke="#00ffff" stroke-width="1" opacity="0.2" />
      </>}
      {p.theme === 'light' && <>
        <ellipse cx="100" cy="158" rx="37" ry="29" fill="#f5f0e8" stroke="#d4c8b8" stroke-width="1.2" />
        <path d="M74 146 Q100 140 126 146" fill="none" stroke="#eab308" stroke-width="1.5" opacity="0.3" />
      </>}
      {p.theme === 'custom' && <>
        <ellipse cx="100" cy="158" rx="37" ry="29" fill="#1c2333" stroke="#f59e0b" stroke-width="1" />
        <path d="M66 158 Q100 164 134 158" fill="none" stroke="#92400e" stroke-width="3.5" opacity="0.6" />
        <rect x="82" y="156" width="8" height="10" rx="1.5" fill="#6b7280" opacity="0.45" />
        <rect x="110" y="156" width="8" height="10" rx="1.5" fill="#6b7280" opacity="0.45" />
        <rect x="96" y="155" width="8" height="11" rx="1.5" fill="#f59e0b" opacity="0.35" />
      </>}

      {/* ═══ EARS ═══ */}
      {p.theme === 'catppuccin' ? <>
        <path d="M48 58 L28 2 L74 42" fill="#7a5444" stroke="#5a3d30" stroke-width="1.5" />
        <path d="M44 46 L32 8 L68 38" fill="#6b4838" />
        <path d="M42 40 L35 14 L62 36" fill="#cba6f7" opacity="0.3" />
        <path d="M152 58 L172 2 L126 42" fill="#7a5444" stroke="#5a3d30" stroke-width="1.5" />
        <path d="M156 46 L168 8 L132 38" fill="#6b4838" />
        <path d="M158 40 L165 14 L138 36" fill="#f5c2e7" opacity="0.3" />
      </> : p.theme === 'dracula' ? <>
        <path d="M52 54 L34 8 L72 42" fill="#7a5444" stroke="#5a3d30" stroke-width="1.2" />
        <path d="M48 42 L38 14 L66 38" fill="url(#ab-ear-in)" opacity="0.7" />
        <path d="M148 54 L166 8 L128 42" fill="#7a5444" stroke="#5a3d30" stroke-width="1.2" />
        <path d="M152 42 L162 14 L134 38" fill="url(#ab-ear-in)" opacity="0.7" />
      </> : <>
        <circle cx="56" cy="40" r="20" fill="#7a5444" stroke="#5a3d30" stroke-width="1.2" />
        <circle cx="144" cy="40" r="20" fill="#7a5444" stroke="#5a3d30" stroke-width="1.2" />
        <circle cx="56" cy="40" r="12" fill="url(#ab-ear-in)" />
        <circle cx="144" cy="40" r="12" fill="url(#ab-ear-in)" />
      </>}

      {/* ═══ HEAD ═══ */}
      <ellipse cx="100" cy="82" rx="52" ry="48" fill="url(#ab-fur)" stroke="#5a3d30" stroke-width="1.2" filter="url(#ab-shadow)" />
      <path d="M66 58 Q68 54 72 52" fill="none" stroke="#5a3d30" stroke-width="0.4" opacity="0.3" />
      <path d="M134 58 Q132 54 128 52" fill="none" stroke="#5a3d30" stroke-width="0.4" opacity="0.3" />

      {/* ═══ FACE ═══ */}
      <ellipse cx="100" cy="72" rx="32" ry="7" fill="#5c3d2e" opacity="0.35" />
      <ellipse cx="100" cy="96" rx="20" ry="16" fill="url(#ab-snout)" />
      <ellipse cx="100" cy="95" rx="18" ry="14" fill="#9b7868" />

      {/* Eyes */}
      <g clip-path="url(#ab-blink-l)">
        <ellipse cx="80" cy="78" rx="12" ry="11" fill="#1a1210" />
        <circle cx="80" cy="78" r="9.5" fill="url(#ab-eye-l)" filter="url(#ab-glow)" />
        <circle cx="80" cy="78" r="8" fill="none" stroke={p.accent} stroke-width="0.5" opacity="0.25" />
        <circle cx="80" cy="79" r="5" fill="#000" opacity="0.3" />
        <circle cx="80" cy="80" r="3" fill="#000" opacity="0.2" />
        <circle cx="83.5" cy="74.5" r="3.2" fill="#fff" opacity="0.92" />
        <circle cx="77" cy="81.5" r="1.5" fill="#fff" opacity="0.35" />
      </g>
      <g clip-path="url(#ab-blink-r)">
        <ellipse cx="120" cy="78" rx="12" ry="11" fill="#1a1210" />
        <circle cx="120" cy="78" r="9.5" fill="url(#ab-eye-r)" filter="url(#ab-glow)" />
        <circle cx="120" cy="78" r="8" fill="none" stroke={p.accent} stroke-width="0.5" opacity="0.25" />
        <circle cx="120" cy="79" r="5" fill="#000" opacity="0.3" />
        <circle cx="120" cy="80" r="3" fill="#000" opacity="0.2" />
        <circle cx="123.5" cy="74.5" r="3.2" fill="#fff" opacity="0.92" />
        <circle cx="117" cy="81.5" r="1.5" fill="#fff" opacity="0.35" />
      </g>

      <path d="M66 74 Q74 68 88 72" fill="none" stroke="#5a3d30" stroke-width="0.6" opacity="0.25" />
      <path d="M134 74 Q126 68 112 72" fill="none" stroke="#5a3d30" stroke-width="0.6" opacity="0.25" />

      <ellipse cx="100" cy="90" rx="7" ry="5" fill="url(#ab-nose)" />
      <ellipse cx="99" cy="89" rx="2.8" ry="1.2" fill="#fff" opacity="0.1" />
      <circle cx="96.5" cy="91.5" r="0.8" fill="#3d2a1e" opacity="0.3" />
      <circle cx="103.5" cy="91.5" r="0.8" fill="#3d2a1e" opacity="0.3" />
      <line x1="100" y1="84" x2="100" y2="87" stroke="#5a3d30" stroke-width="0.6" stroke-linecap="round" opacity="0.3" />

      <path d="M90 102 Q94 107 100 102 Q106 107 110 102" fill="none" stroke="#4a3228" stroke-width="1.4" stroke-linecap="round" />
      <path d="M94 104 Q100 106 106 104" fill="none" stroke="#3d2a1f" stroke-width="0.5" stroke-linecap="round" opacity="0.3" />

      <ellipse cx="62" cy="90" rx="8" ry="5" fill={p.accent} opacity="0.08" />
      <ellipse cx="138" cy="90" rx="8" ry="5" fill={p.accent} opacity="0.08" />

      <circle cx="70" cy="94" r="0.9" fill="#6b5040" />
      <circle cx="67" cy="91" r="0.9" fill="#6b5040" />
      <circle cx="67" cy="97" r="0.8" fill="#6b5040" />
      <circle cx="130" cy="94" r="0.9" fill="#6b5040" />
      <circle cx="133" cy="91" r="0.9" fill="#6b5040" />
      <circle cx="133" cy="97" r="0.8" fill="#6b5040" />

      {/* Dracula fangs */}
      {p.theme === 'dracula' && <>
        <path d="M91 104 L93.5 112 L96 104" fill="#fff" opacity="0.7" />
        <path d="M104 104 L106.5 112 L109 104" fill="#fff" opacity="0.7" />
      </>}

      {/* ═══ THEME HEADGEAR & ACCESSORIES ═══ */}

      {/* === DARKBEAR: DJ Headphones === */}
      {p.theme === 'darkbear' && <>
        <path d="M44 60 Q44 24 100 20 Q156 24 156 60" fill="none" stroke="#312e81" stroke-width="6" stroke-linecap="round" />
        <path d="M44 60 Q44 26 100 22 Q156 26 156 60" fill="none" stroke="#4338ca" stroke-width="3" stroke-linecap="round" />
        <rect x="34" y="52" width="18" height="22" rx="5" fill="#1e1b4b" stroke="#6366f1" stroke-width="1.5" />
        <rect x="37" y="56" width="12" height="14" rx="3" fill="#818cf8" opacity="0.4" />
        <rect x="148" y="52" width="18" height="22" rx="5" fill="#1e1b4b" stroke="#6366f1" stroke-width="1.5" />
        <rect x="151" y="56" width="12" height="14" rx="3" fill="#818cf8" opacity="0.4" />
        {/* Mic boom */}
        <path d="M52 68 Q42 80 38 92" fill="none" stroke="#312e81" stroke-width="2.5" stroke-linecap="round" opacity="0.5" />
        <circle cx="38" cy="94" r="3.5" fill="#312e81" opacity="0.5" />
        <circle cx="38" cy="94" r="2" fill="#818cf8" opacity="0.3" />
        {/* EQ bars */}
        {[{x:88,y:160,h:8},{x:93,y:157,h:14},{x:98,y:155,h:18},{x:103,y:157,h:14},{x:108,y:159,h:10}].map((b, i) => (
          <rect x={b.x} y={b.y} width="3" height={b.h} rx="1" fill="#818cf8" opacity="0.3">
            <animate attributeName="height" values={`${b.h};${b.h * 0.4};${b.h}`} dur={`${0.8 + i * 0.15}s`} repeatCount="indefinite" />
          </rect>
        ))}
      </>}

      {/* === MIDNIGHT: Tall Wizard Hat === */}
      {p.theme === 'midnight' && <>
        <path d="M54 52 L100 -30 L146 52" fill="#0f1633" stroke="#4f5bab" stroke-width="1.5" />
        <path d="M58 52 L100 -24 L142 52" fill="#1a2150" />
        <path d="M48 54 Q100 66 152 54 Q100 72 48 54" fill="#0c1030" stroke="#8b9cf8" stroke-width="1.2" />
        <circle cx="100" cy="-22" r="8" fill="#8b9cf8" opacity="0.6">
          <animate attributeName="opacity" values="0.6;0.25;0.6" dur="3s" repeatCount="indefinite" />
        </circle>
        {[{x:76,y:16,r:3},{x:118,y:10,r:2.8},{x:88,y:-6,r:2.2},{x:108,y:0,r:2.5},{x:96,y:26,r:2}].map((s, i) => (
          <circle cx={s.x} cy={s.y} r={s.r} fill="#c7d2fe" opacity={0.45}>
            <animate attributeName="opacity" values="0.45;0.1;0.45" dur={`${2.5 + i * 0.5}s`} repeatCount="indefinite" />
          </circle>
        ))}
        {/* Crescent moon */}
        <path d="M126 8 Q136 16 126 28 Q140 20 126 8" fill="#c7d2fe" opacity="0.4" />
        {/* Magic wand in left paw */}
        <g transform="translate(58,158) rotate(-35)">
          <rect x="-1.5" y="-28" width="3" height="30" rx="1" fill="#3b3080" opacity="0.6" />
          <circle cx="0" cy="-30" r="4" fill="#c7d2fe" opacity="0.5">
            <animate attributeName="opacity" values="0.5;0.8;0.5" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle cx="0" cy="-30" r="2" fill="#fff" opacity="0.3" />
        </g>
        {/* Wand sparkle trail */}
        {[{x:28,y:130,d:2.5},{x:22,y:122,d:3},{x:34,y:118,d:3.5}].map((s, i) => (
          <circle cx={s.x} cy={s.y} r="1.5" fill="#c7d2fe" opacity="0.35">
            <animate attributeName="opacity" values="0.35;0;0.35" dur={`${s.d}s`} repeatCount="indefinite" />
          </circle>
        ))}
      </>}

      {/* === OBSIDIAN: Crystal Crown === */}
      {p.theme === 'obsidian' && <>
        <polygon points="100,-4 90,40 110,40" fill="#7c3aed" opacity="0.7" stroke="#a78bfa" stroke-width="1.2" />
        <polygon points="72,16 62,48 84,46" fill="#a78bfa" opacity="0.6" stroke="#c4b5fd" stroke-width="1" />
        <polygon points="128,16 138,48 116,46" fill="#a78bfa" opacity="0.6" stroke="#c4b5fd" stroke-width="1" />
        <polygon points="52,32 46,54 62,52" fill="#c4b5fd" opacity="0.4" />
        <polygon points="148,32 154,54 138,52" fill="#c4b5fd" opacity="0.4" />
        <polygon points="100,-1 94,36 106,36" fill="#e9d5ff" opacity="0.25" />
        <polygon points="72,19 66,44 80,42" fill="#e9d5ff" opacity="0.15" />
        <polygon points="128,19 134,44 120,42" fill="#e9d5ff" opacity="0.15" />
        <circle cx="100" cy="42" r="5" fill="#7c3aed" opacity="0.35">
          <animate attributeName="opacity" values="0.35;0.12;0.35" dur="2.5s" repeatCount="indefinite" />
        </circle>
        {/* Orbiting sparkles around crystals */}
        {[0,120,240].map((deg, i) => (
          <circle cx="100" cy="20" r="1.8" fill="#e9d5ff" opacity="0.4">
            <animateTransform attributeName="transform" type="rotate" values={`${deg} 100 20;${deg + 360} 100 20`} dur={`${6 + i}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.4;0.1;0.4" dur={`${3 + i}s`} repeatCount="indefinite" />
          </circle>
        ))}
      </>}

      {/* === NORD: Viking Helmet + Horns === */}
      {p.theme === 'nord' && <>
        <path d="M46 58 Q46 24 100 16 Q154 24 154 58" fill="#434c5e" stroke="#88c0d0" stroke-width="1.2" />
        <path d="M42 60 Q100 70 158 60 Q100 76 42 60" fill="#3b4252" stroke="#88c0d0" stroke-width="1" />
        <path d="M46 56 Q16 32 4 -4 Q0 -16 6 -18" fill="none" stroke="#d8dee9" stroke-width="9" stroke-linecap="round" />
        <path d="M46 56 Q18 34 8 0 Q4 -12 8 -14" fill="none" stroke="#eceff4" stroke-width="4" stroke-linecap="round" opacity="0.4" />
        <path d="M154 56 Q184 32 196 -4 Q200 -16 194 -18" fill="none" stroke="#d8dee9" stroke-width="9" stroke-linecap="round" />
        <path d="M154 56 Q182 34 192 0 Q196 -12 192 -14" fill="none" stroke="#eceff4" stroke-width="4" stroke-linecap="round" opacity="0.4" />
        <circle cx="6" cy="-18" r="5" fill="#eceff4" opacity="0.6" />
        <circle cx="194" cy="-18" r="5" fill="#eceff4" opacity="0.6" />
        {/* Nose guard */}
        <line x1="100" y1="44" x2="100" y2="60" stroke="#88c0d0" stroke-width="2" opacity="0.4" />
        {/* Rune marks */}
        <g opacity="0.35">
          <line x1="76" y1="38" x2="76" y2="52" stroke="#88c0d0" stroke-width="1.5" />
          <line x1="73" y1="43" x2="79" y2="47" stroke="#88c0d0" stroke-width="1.5" />
          <line x1="124" y1="38" x2="124" y2="52" stroke="#88c0d0" stroke-width="1.5" />
          <line x1="121" y1="43" x2="127" y2="47" stroke="#88c0d0" stroke-width="1.5" />
        </g>
        {/* Round shield */}
        <g transform="translate(20,110)">
          <circle r="18" fill="#434c5e" stroke="#d8dee9" stroke-width="2" opacity="0.5" />
          <circle r="12" fill="none" stroke="#88c0d0" stroke-width="1.5" opacity="0.35" />
          <circle r="5" fill="#88c0d0" opacity="0.2" />
          <line x1="-6" y1="0" x2="6" y2="0" stroke="#88c0d0" stroke-width="1" opacity="0.3" />
          <line x1="0" y1="-6" x2="0" y2="6" stroke="#88c0d0" stroke-width="1" opacity="0.3" />
        </g>
      </>}

      {/* === GRUVBOX: Top Hat + Monocle + Bow Tie === */}
      {p.theme === 'gruvbox' && <>
        <rect x="66" y="-2" width="68" height="42" rx="5" fill="#3c3836" stroke="#d79921" stroke-width="1.5" />
        <rect x="56" y="34" width="88" height="14" rx="4" fill="#282828" stroke="#d79921" stroke-width="1.2" />
        <rect x="68" y="32" width="64" height="6" rx="2" fill="#d79921" opacity="0.45" />
        <circle cx="100" cy="35" r="4.5" fill="#fabd2f" opacity="0.4" />
        {/* Monocle */}
        <circle cx="132" cy="78" r="13" fill="none" stroke="#d79921" stroke-width="2.5" opacity="0.5" />
        <circle cx="132" cy="78" r="9" fill="#fabd2f" opacity="0.06" />
        <line x1="145" y1="78" x2="162" y2="100" stroke="#d79921" stroke-width="1.2" opacity="0.35" />
        {/* Bow tie */}
        <path d="M88 130 L100 138 L112 130 L100 126 Z" fill="#cc241d" opacity="0.55" stroke="#9d0006" stroke-width="0.8" />
        <circle cx="100" cy="132" r="3" fill="#d79921" opacity="0.4" />
        {/* Pocket watch chain */}
        <path d="M100 148 Q108 152 114 158 Q120 164 124 170" fill="none" stroke="#d79921" stroke-width="1" opacity="0.35" />
        <circle cx="126" cy="172" r="4" fill="#282828" stroke="#d79921" stroke-width="1" opacity="0.4" />
        <circle cx="126" cy="172" r="2" fill="#fabd2f" opacity="0.25" />
      </>}

      {/* === ROSE-PINE: Flower Crown === */}
      {p.theme === 'rose-pine' && <>
        {[{x:52,y:40,r:-30,s:1.6},{x:68,y:26,r:-12,s:1.8},{x:86,y:20,r:0,s:2},{x:114,y:20,r:0,s:2},{x:132,y:26,r:12,s:1.8},{x:148,y:40,r:30,s:1.6}].map((f, i) => (
          <g transform={`translate(${f.x},${f.y}) rotate(${f.r}) scale(${f.s})`} opacity="0.7">
            {[0,72,144,216,288].map((a, j) => {
              const rad = a * Math.PI / 180;
              return <ellipse cx={4 * Math.cos(rad)} cy={4 * Math.sin(rad)} rx="2.5" ry="5" fill={j % 2 === 0 ? '#eb6f92' : '#f6c177'} opacity="0.65" transform={`rotate(${a + 90},${4 * Math.cos(rad)},${4 * Math.sin(rad)})`} />;
            })}
            <circle r="2.8" fill="#f6d6a8" opacity="0.7" />
          </g>
        ))}
        <path d="M46 46 Q64 18 86 16 Q100 14 114 16 Q136 18 154 46" fill="none" stroke="#31748f" stroke-width="1.8" opacity="0.35" />
        {/* Leaf accents */}
        <ellipse cx="60" cy="34" rx="4" ry="8" fill="#31748f" opacity="0.3" transform="rotate(-20,60,34)" />
        <ellipse cx="140" cy="34" rx="4" ry="8" fill="#31748f" opacity="0.3" transform="rotate(20,140,34)" />
        {/* Butterfly */}
        <g transform="translate(170,30)">
          <path d="M0 0 Q-8 -6 -6 -12 Q-2 -8 0 0" fill="#eb6f92" opacity="0.55" />
          <path d="M0 0 Q8 -6 6 -12 Q2 -8 0 0" fill="#f6c177" opacity="0.55" />
          <path d="M0 0 Q-6 4 -4 10 Q-1 6 0 0" fill="#eb6f92" opacity="0.4" />
          <path d="M0 0 Q6 4 4 10 Q1 6 0 0" fill="#f6c177" opacity="0.4" />
          <line x1="0" y1="0" x2="0" y2="-2" stroke="#31748f" stroke-width="0.5" opacity="0.4" />
          <animateTransform attributeName="transform" type="translate" values="170,30;168,26;170,30;172,28;170,30" dur="4s" repeatCount="indefinite" />
        </g>
      </>}

      {/* === ABYSS: Deep Sea Diving Goggles + Snorkel === */}
      {p.theme === 'abyss' && <>
        <circle cx="78" cy="54" r="16" fill="none" stroke="#0ea5e9" stroke-width="4" opacity="0.6" />
        <circle cx="122" cy="54" r="16" fill="none" stroke="#0ea5e9" stroke-width="4" opacity="0.6" />
        <line x1="94" y1="54" x2="106" y2="54" stroke="#0ea5e9" stroke-width="3.5" opacity="0.5" />
        <circle cx="78" cy="54" r="11" fill="#0ea5e9" opacity="0.1" />
        <circle cx="122" cy="54" r="11" fill="#0ea5e9" opacity="0.1" />
        <circle cx="74" cy="50" r="4" fill="#fff" opacity="0.08" />
        <circle cx="118" cy="50" r="4" fill="#fff" opacity="0.08" />
        {/* Strap */}
        <path d="M62 54 Q56 52 52 56" stroke="#0ea5e9" stroke-width="2" fill="none" opacity="0.35" />
        <path d="M138 54 Q144 52 148 56" stroke="#0ea5e9" stroke-width="2" fill="none" opacity="0.35" />
        {/* Snorkel */}
        <path d="M154 54 Q164 48 166 34 Q168 16 162 8" fill="none" stroke="#2dd4bf" stroke-width="4" stroke-linecap="round" opacity="0.5" />
        <circle cx="162" cy="6" r="5" fill="#2dd4bf" opacity="0.35" />
        {/* Bubbles */}
        {[{x:168,y:0,r:3.5,d:4},{x:176,y:-6,r:2.5,d:5},{x:172,y:-14,r:1.8,d:6}].map((b, i) => (
          <circle cx={b.x} cy={b.y} r={b.r} fill="none" stroke="#2dd4bf" stroke-width="1" opacity="0.35">
            <animate attributeName="cy" values={`${b.y};${b.y - 25};${b.y}`} dur={`${b.d}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.35;0;0.35" dur={`${b.d}s`} repeatCount="indefinite" />
          </circle>
        ))}
        {/* Small fish */}
        <g opacity="0.4">
          <path d="M22 170 Q16 166 22 162 Q28 166 22 170 Z" fill="#2dd4bf">
            <animate attributeName="d" values="M22 170 Q16 166 22 162 Q28 166 22 170 Z;M22 172 Q14 168 22 164 Q30 168 22 172 Z;M22 170 Q16 166 22 162 Q28 166 22 170 Z" dur="3s" repeatCount="indefinite" />
          </path>
          <path d="M14 166 L10 162 L10 170 Z" fill="#2dd4bf" opacity="0.6" />
          <circle cx="24" cy="166" r="1" fill="#0a1628" />
          <animateTransform attributeName="transform" type="translate" values="0,0;6,-4;0,0;-4,2;0,0" dur="5s" repeatCount="indefinite" />
        </g>
        {/* Seaweed */}
        <path d="M186 196 Q182 180 186 168 Q190 156 184 148" fill="none" stroke="#2dd4bf" stroke-width="2" opacity="0.2">
          <animate attributeName="d" values="M186 196 Q182 180 186 168 Q190 156 184 148;M186 196 Q190 180 184 168 Q180 156 186 148;M186 196 Q182 180 186 168 Q190 156 184 148" dur="4s" repeatCount="indefinite" />
        </path>
      </>}

      {/* === EMBER: Blazing Flame Mane === */}
      {p.theme === 'ember' && <>
        <path d="M52 54 Q62 10 74 30 Q78 -8 88 18 Q92 -18 100 14 Q108 -18 112 18 Q116 -8 126 30 Q136 10 148 54"
          fill="#f97316" opacity="0.55" stroke="#ef4444" stroke-width="1.2">
          <animate attributeName="opacity" values="0.55;0.35;0.55" dur="1.5s" repeatCount="indefinite" />
        </path>
        <path d="M60 50 Q70 14 82 30 Q88 0 98 20 Q100 -10 102 20 Q112 0 118 30 Q128 14 140 50"
          fill="#ef4444" opacity="0.35">
          <animate attributeName="opacity" values="0.35;0.55;0.35" dur="1.2s" repeatCount="indefinite" />
        </path>
        <path d="M68 48 Q78 22 90 34 Q96 10 100 26 Q104 10 110 34 Q122 22 132 48"
          fill="#fbbf24" opacity="0.2">
          <animate attributeName="opacity" values="0.2;0.4;0.2" dur="1s" repeatCount="indefinite" />
        </path>
        {/* Ember particles */}
        {[{x:46,y:40,d:3},{x:154,y:35,d:4},{x:38,y:58,d:3.5},{x:160,y:55,d:5},{x:42,y:20,d:4.5}].map((e, i) => (
          <circle cx={e.x} cy={e.y} r={2.5 - i * 0.2} fill={i % 2 === 0 ? '#f97316' : '#ef4444'} opacity="0.45">
            <animate attributeName="cy" values={`${e.y};${e.y - 24};${e.y}`} dur={`${e.d}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.45;0;0.45" dur={`${e.d}s`} repeatCount="indefinite" />
          </circle>
        ))}
        {/* Heat shimmer */}
        <path d="M70 130 Q80 124 90 130 Q100 124 110 130 Q120 124 130 130" fill="none" stroke="#f97316" stroke-width="0.8" opacity="0.15">
          <animate attributeName="d" values="M70 130 Q80 124 90 130 Q100 124 110 130 Q120 124 130 130;M70 130 Q80 136 90 130 Q100 136 110 130 Q120 136 130 130;M70 130 Q80 124 90 130 Q100 124 110 130 Q120 124 130 130" dur="2s" repeatCount="indefinite" />
        </path>
      </>}

      {/* === AURORA: Knit Beanie + Scarf === */}
      {p.theme === 'aurora' && <>
        <path d="M46 60 Q46 22 100 12 Q154 22 154 60" fill="#1a5c48" stroke="#34d399" stroke-width="1.2" />
        <path d="M44 62 Q100 72 156 62 Q100 78 44 62" fill="#134e3a" stroke="#34d399" stroke-width="1" />
        {/* Knit chevron pattern */}
        <path d="M56 36 L66 28 L76 36 L86 28 L96 36 L106 28 L116 36 L126 28 L136 36 L146 28" fill="none" stroke="#6ee7b7" stroke-width="2.5" opacity="0.3" />
        <path d="M52 46 L62 38 L72 46 L82 38 L92 46 L102 38 L112 46 L122 38 L132 46 L142 38 L152 46" fill="none" stroke="#6ee7b7" stroke-width="2" opacity="0.25" />
        {/* Pom-pom */}
        <circle cx="100" cy="8" r="12" fill="#134e3a" opacity="0.7" />
        <circle cx="100" cy="8" r="8" fill="#6ee7b7" opacity="0.25" />
        <circle cx="96" cy="5" r="3" fill="#a7f3d0" opacity="0.15" />
        {/* Scarf */}
        <path d="M56 128 Q100 144 144 128 Q100 150 56 128" fill="#1a5c48" stroke="#34d399" stroke-width="1" opacity="0.6" />
        <path d="M70 134 Q64 152 62 172 Q60 184 66 186" fill="#1a5c48" stroke="#34d399" stroke-width="1" opacity="0.5" />
        <line x1="62" y1="154" x2="72" y2="150" stroke="#6ee7b7" stroke-width="1.5" opacity="0.25" />
        <line x1="60" y1="166" x2="70" y2="162" stroke="#6ee7b7" stroke-width="1.5" opacity="0.25" />
        {/* Snowflakes */}
        {[{x:16,y:30,s:4,d:7},{x:180,y:20,s:3,d:9},{x:10,y:100,s:3.5,d:8},{x:190,y:90,s:2.5,d:10},{x:24,y:160,s:3,d:6}].map((sf, i) => (
          <g opacity="0.3">
            <line x1={sf.x - sf.s} y1={sf.y} x2={sf.x + sf.s} y2={sf.y} stroke="#e0f2fe" stroke-width="0.8" />
            <line x1={sf.x} y1={sf.y - sf.s} x2={sf.x} y2={sf.y + sf.s} stroke="#e0f2fe" stroke-width="0.8" />
            <line x1={sf.x - sf.s * 0.7} y1={sf.y - sf.s * 0.7} x2={sf.x + sf.s * 0.7} y2={sf.y + sf.s * 0.7} stroke="#e0f2fe" stroke-width="0.5" />
            <line x1={sf.x + sf.s * 0.7} y1={sf.y - sf.s * 0.7} x2={sf.x - sf.s * 0.7} y2={sf.y + sf.s * 0.7} stroke="#e0f2fe" stroke-width="0.5" />
            <animate attributeName="opacity" values="0.3;0.08;0.3" dur={`${sf.d}s`} repeatCount="indefinite" />
          </g>
        ))}
        {/* Hot cocoa mug in right paw */}
        <g transform="translate(142,156)">
          <rect x="-5" y="-8" width="10" height="12" rx="2" fill="#6b3e26" opacity="0.5" stroke="#5a3d30" stroke-width="0.8" />
          <path d="M5 -4 Q10 -4 10 0 Q10 4 5 4" fill="none" stroke="#6b3e26" stroke-width="1.5" opacity="0.4" />
          <path d="M-2 -10 Q0 -14 2 -10" fill="none" stroke="#d1fae5" stroke-width="0.8" opacity="0.3">
            <animate attributeName="opacity" values="0.3;0.08;0.3" dur="3s" repeatCount="indefinite" />
          </path>
        </g>
      </>}

      {/* === CATPPUCCIN: Cat Whiskers + Bell Collar === */}
      {p.theme === 'catppuccin' && <>
        <line x1="52" y1="86" x2="18" y2="78" stroke="#cba6f7" stroke-width="1.2" opacity="0.35" />
        <line x1="52" y1="92" x2="14" y2="92" stroke="#cba6f7" stroke-width="1.2" opacity="0.3" />
        <line x1="52" y1="98" x2="18" y2="106" stroke="#cba6f7" stroke-width="1.2" opacity="0.35" />
        <line x1="148" y1="86" x2="182" y2="78" stroke="#f5c2e7" stroke-width="1.2" opacity="0.35" />
        <line x1="148" y1="92" x2="186" y2="92" stroke="#f5c2e7" stroke-width="1.2" opacity="0.3" />
        <line x1="148" y1="98" x2="182" y2="106" stroke="#f5c2e7" stroke-width="1.2" opacity="0.35" />
        {/* Yarn ball near left paw */}
        <circle cx="42" cy="170" r="9" fill="#f5c2e7" opacity="0.35" stroke="#cba6f7" stroke-width="1" />
        <path d="M36 164 Q42 170 48 164" fill="none" stroke="#cba6f7" stroke-width="0.8" opacity="0.25" />
        <path d="M34 170 Q42 176 50 170" fill="none" stroke="#cba6f7" stroke-width="0.8" opacity="0.25" />
        <path d="M52 168 Q56 164 60 166" fill="none" stroke="#f5c2e7" stroke-width="0.6" opacity="0.25" />
      </>}

      {/* === TOKYO-NIGHT: Cyberpunk Visor + LED Ear Tips === */}
      {p.theme === 'tokyo-night' && <>
        <path d="M52 76 Q100 66 148 76 Q148 86 144 90 Q100 82 56 90 Q52 86 52 76 Z" fill="#1a1b2e" stroke="#7aa2f7" stroke-width="1.5" opacity="0.75" />
        <path d="M56 78 L142 78" fill="none" stroke="#7aa2f7" stroke-width="1" opacity="0.3">
          <animate attributeName="opacity" values="0.3;0.6;0.3" dur="2s" repeatCount="indefinite" />
        </path>
        <path d="M56 82 L142 82" fill="none" stroke="#bb9af7" stroke-width="0.8" opacity="0.2" />
        <line x1="98" y1="74" x2="102" y2="74" stroke="#ff9e64" stroke-width="2" opacity="0.5" />
        {/* LED ear tips */}
        <circle cx="56" cy="22" r="3.5" fill="#7aa2f7" opacity="0.5">
          <animate attributeName="opacity" values="0.5;0.1;0.5" dur="1.5s" repeatCount="indefinite" />
        </circle>
        <circle cx="144" cy="22" r="3.5" fill="#ff7b72" opacity="0.45">
          <animate attributeName="opacity" values="0.45;0.1;0.45" dur="2s" repeatCount="indefinite" />
        </circle>
        {/* Antenna */}
        <line x1="144" y1="22" x2="160" y2="4" stroke="#ff7b72" stroke-width="1.5" opacity="0.3" />
        <circle cx="160" cy="4" r="2.5" fill="#ff7b72" opacity="0.35">
          <animate attributeName="opacity" values="0.35;0.1;0.35" dur="1s" repeatCount="indefinite" />
        </circle>
        {/* Holographic data streams */}
        {[{x:20,y:140,h:30},{x:176,y:150,h:25}].map((d, i) => (
          <g opacity="0.2">
            <rect x={d.x} y={d.y} width="6" height={d.h} rx="1" fill="#7aa2f7">
              <animate attributeName="height" values={`${d.h};${d.h * 0.3};${d.h}`} dur={`${1.5 + i * 0.5}s`} repeatCount="indefinite" />
            </rect>
            <rect x={d.x + 8} y={d.y + 4} width="4" height={d.h - 8} rx="1" fill="#bb9af7">
              <animate attributeName="height" values={`${d.h - 8};${(d.h - 8) * 0.5};${d.h - 8}`} dur={`${1.8 + i * 0.3}s`} repeatCount="indefinite" />
            </rect>
          </g>
        ))}
        {/* Circuit lines on outfit */}
        <path d="M82 154 L88 154 L88 162 L96 162" fill="none" stroke="#7aa2f7" stroke-width="0.8" opacity="0.25" />
        <path d="M118 154 L112 154 L112 162 L104 162" fill="none" stroke="#bb9af7" stroke-width="0.8" opacity="0.25" />
        <circle cx="88" cy="154" r="1.2" fill="#7aa2f7" opacity="0.3" />
        <circle cx="112" cy="154" r="1.2" fill="#bb9af7" opacity="0.3" />
      </>}

      {/* === DRACULA: Slicked Hair + Cape Collar === */}
      {p.theme === 'dracula' && <>
        <path d="M82 36 Q90 16 100 24 Q110 16 118 36" fill="#2d1b4e" opacity="0.6" />
        <path d="M86 34 Q94 20 102 28 Q108 20 114 34" fill="#44275c" opacity="0.45" />
        {/* Cape high collar */}
        <path d="M54 126 Q48 108 52 90" fill="none" stroke="#bd93f9" stroke-width="2.5" opacity="0.4" />
        <path d="M146 126 Q152 108 148 90" fill="none" stroke="#bd93f9" stroke-width="2.5" opacity="0.4" />
        {/* Bat silhouettes */}
        {[{x:18,y:40,s:1,d:4},{x:178,y:30,s:0.8,d:5},{x:10,y:110,s:0.7,d:6}].map((bat, i) => (
          <g transform={`translate(${bat.x},${bat.y}) scale(${bat.s})`} opacity="0.3">
            <path d="M0 0 Q-6 -8 -14 -4 Q-8 -2 -6 0 Q-4 -4 0 -2 Q4 -4 6 0 Q8 -2 14 -4 Q6 -8 0 0" fill="#bd93f9" />
            <animateTransform attributeName="transform" type="translate" values={`${bat.x},${bat.y};${bat.x - 4},${bat.y - 6};${bat.x},${bat.y};${bat.x + 4},${bat.y - 3};${bat.x},${bat.y}`} dur={`${bat.d}s`} repeatCount="indefinite" />
          </g>
        ))}
        {/* Blood red lining flash on cape */}
        <path d="M50 180 Q100 188 150 180" fill="none" stroke="#ff5555" stroke-width="1.5" opacity="0.2" />
      </>}

      {/* === SOLARIZED: Round Spectacles + Pencil === */}
      {p.theme === 'solarized' && <>
        <circle cx="80" cy="78" r="16" fill="none" stroke="#b58900" stroke-width="2.5" opacity="0.45" />
        <circle cx="120" cy="78" r="16" fill="none" stroke="#b58900" stroke-width="2.5" opacity="0.45" />
        <line x1="96" y1="78" x2="104" y2="78" stroke="#b58900" stroke-width="2" opacity="0.4" />
        <line x1="64" y1="78" x2="50" y2="72" stroke="#b58900" stroke-width="1.5" opacity="0.35" />
        <line x1="136" y1="78" x2="150" y2="72" stroke="#b58900" stroke-width="1.5" opacity="0.35" />
        <circle cx="80" cy="78" r="12" fill="#b58900" opacity="0.04" />
        <circle cx="120" cy="78" r="12" fill="#b58900" opacity="0.04" />
        {/* Pencil behind ear */}
        <line x1="152" y1="58" x2="168" y2="30" stroke="#eab308" stroke-width="2.5" opacity="0.5" />
        <line x1="168" y1="30" x2="172" y2="24" stroke="#dc2626" stroke-width="2.5" opacity="0.4" />
        <line x1="152" y1="58" x2="150" y2="62" stroke="#1a1210" stroke-width="1.5" opacity="0.4" />
        {/* Erlenmeyer flask in left paw */}
        <g transform="translate(50,152)">
          <path d="M-4 -10 L-4 -4 L-8 6 Q-8 10 0 10 Q8 10 8 6 L4 -4 L4 -10" fill="#fdf6e3" stroke="#93a1a1" stroke-width="0.8" opacity="0.4" />
          <rect x="-3" y="-12" width="6" height="3" rx="1" fill="#93a1a1" opacity="0.3" />
          <ellipse cx="0" cy="4" rx="5" ry="3" fill="#268bd2" opacity="0.15" />
        </g>
      </>}

      {/* === STARFIELD: Astronomer Cap + Telescope === */}
      {p.theme === 'starfield' && <>
        {/* Flat cap / beret */}
        <path d="M48 54 Q48 30 100 24 Q152 30 152 54" fill="#1a1e42" stroke="#4f5bab" stroke-width="1.2" />
        <path d="M46 56 Q100 64 154 56 Q100 68 46 56" fill="#0d1030" stroke="#4f5bab" stroke-width="0.8" />
        <ellipse cx="100" cy="22" rx="8" ry="4" fill="#4f5bab" opacity="0.4" />
        {/* Telescope */}
        <rect x="152" y="42" width="8" height="20" rx="3" fill="#2d3060" stroke="#4f5bab" stroke-width="1" />
        <rect x="158" y="44" width="22" height="8" rx="3" fill="#1a1e42" stroke="#4f5bab" stroke-width="0.8" />
        <circle cx="182" cy="48" r="6" fill="#2d3060" stroke="#4f5bab" stroke-width="1" />
        <circle cx="182" cy="48" r="3" fill="#c7d2fe" opacity="0.35">
          <animate attributeName="opacity" values="0.35;0.1;0.35" dur="2s" repeatCount="indefinite" />
        </circle>
        {/* Star marks on cheeks */}
        {[{x:60,y:86},{x:56,y:80},{x:140,y:86},{x:144,y:80}].map((s, i) => (
          <circle cx={s.x} cy={s.y} r="1.5" fill="#c7d2fe" opacity={0.3}>
            <animate attributeName="opacity" values="0.3;0.08;0.3" dur={`${2 + i * 0.3}s`} repeatCount="indefinite" />
          </circle>
        ))}
        <line x1="56" y1="80" x2="60" y2="86" stroke="#c7d2fe" stroke-width="0.5" opacity="0.2" />
        <line x1="140" y1="86" x2="144" y2="80" stroke="#c7d2fe" stroke-width="0.5" opacity="0.2" />
        {/* Shooting star */}
        <line x1="8" y1="20" x2="30" y2="35" stroke="#c7d2fe" stroke-width="1.5" opacity="0.3">
          <animate attributeName="opacity" values="0;0.5;0" dur="4s" repeatCount="indefinite" />
        </line>
        <circle cx="8" cy="20" r="2" fill="#fff" opacity="0.3">
          <animate attributeName="opacity" values="0;0.6;0" dur="4s" repeatCount="indefinite" />
        </circle>
        {/* Star map scroll in paw */}
        <g transform="translate(52,158)">
          <rect x="-6" y="-10" width="12" height="16" rx="2" fill="#1a1e42" stroke="#4f5bab" stroke-width="0.8" opacity="0.45" />
          <circle cx="0" cy="-4" r="1.5" fill="#c7d2fe" opacity="0.3" />
          <circle cx="-3" cy="0" r="1" fill="#c7d2fe" opacity="0.25" />
          <circle cx="3" cy="1" r="1" fill="#c7d2fe" opacity="0.25" />
          <line x1="-3" y1="0" x2="0" y2="-4" stroke="#c7d2fe" stroke-width="0.4" opacity="0.2" />
          <line x1="0" y1="-4" x2="3" y2="1" stroke="#c7d2fe" stroke-width="0.4" opacity="0.2" />
        </g>
      </>}

      {/* === LIGHTNING: Electric Mohawk + Sparks === */}
      {p.theme === 'lightning' && <>
        <path d="M60 44 L52 4 L72 32 L64 -8 L84 26 L78 -16 L100 20 L122 -16 L116 26 L136 -8 L128 32 L148 4 L140 44"
          fill="none" stroke="#3b82f6" stroke-width="3" opacity="0.55">
          <animate attributeName="opacity" values="0.55;0.75;0.3;0.55" dur="2s" repeatCount="indefinite" />
        </path>
        <path d="M68 42 L62 8 L80 30 L74 -4 L94 24 L90 -8 L100 18 L110 -8 L106 24 L126 -4 L120 30 L138 8 L132 42"
          fill="none" stroke="#60a5fa" stroke-width="1.5" opacity="0.3">
          <animate attributeName="opacity" values="0.3;0.5;0.15;0.3" dur="1.5s" repeatCount="indefinite" />
        </path>
        {/* Big spark particles */}
        {[{x:44,y:24},{x:156,y:20},{x:38,y:56},{x:162,y:52}].map((s, i) => (
          <circle cx={s.x} cy={s.y} r="2.5" fill="#60a5fa" opacity="0.4">
            <animate attributeName="opacity" values="0.4;0.05;0.4;0.6;0.4" dur={`${1.2 + i * 0.3}s`} repeatCount="indefinite" />
          </circle>
        ))}
        {/* Mini bolts near ears */}
        <path d="M42 38 L46 28 L44 32 L48 22" fill="none" stroke="#93c5fd" stroke-width="1.2" opacity="0.4">
          <animate attributeName="opacity" values="0.4;0;0.4" dur="3s" repeatCount="indefinite" />
        </path>
        <path d="M158 36 L154 26 L156 30 L152 20" fill="none" stroke="#93c5fd" stroke-width="1.2" opacity="0.35">
          <animate attributeName="opacity" values="0;0.35;0;0.35" dur="2.5s" repeatCount="indefinite" />
        </path>
        {/* Lightning bolt emblem on chest */}
        <path d="M96 150 L102 150 L98 158 L104 158 L94 172 L98 162 L92 162 Z" fill="#60a5fa" opacity="0.35">
          <animate attributeName="opacity" values="0.35;0.6;0.35" dur="2s" repeatCount="indefinite" />
        </path>
      </>}

      {/* === PHOENIX: Fire Wings + Flame Crest === */}
      {p.theme === 'phoenix' && <>
        {/* Left wing */}
        <path d="M46 92 Q18 68 4 32 Q14 52 26 42 Q10 68 22 58 Q16 80 32 72 Q22 92 38 84"
          fill="#f59e0b" opacity="0.45" stroke="#ef4444" stroke-width="1" />
        <path d="M46 92 Q22 70 10 38 Q18 54 28 46 Q14 72 26 64 Q20 86 36 78"
          fill="#ef4444" opacity="0.2" />
        {/* Right wing */}
        <path d="M154 92 Q182 68 196 32 Q186 52 174 42 Q190 68 178 58 Q184 80 168 72 Q178 92 162 84"
          fill="#f59e0b" opacity="0.45" stroke="#ef4444" stroke-width="1" />
        <path d="M154 92 Q178 70 190 38 Q182 54 172 46 Q186 72 174 64 Q180 86 164 78"
          fill="#ef4444" opacity="0.2" />
        {/* Fire crest */}
        <path d="M64 46 Q74 6 84 24 Q88 -12 96 16 Q100 -20 104 16 Q108 -12 116 24 Q122 6 136 46"
          fill="#f59e0b" opacity="0.5">
          <animate attributeName="opacity" values="0.5;0.3;0.5" dur="1.5s" repeatCount="indefinite" />
        </path>
        <path d="M72 44 Q80 12 90 28 Q96 0 100 20 Q104 0 110 28 Q120 12 128 44"
          fill="#ef4444" opacity="0.3">
          <animate attributeName="opacity" values="0.3;0.5;0.3" dur="1.2s" repeatCount="indefinite" />
        </path>
        {/* Ember particles */}
        {[{x:16,y:55,d:3},{x:184,y:50,d:4},{x:8,y:75,d:3.5},{x:192,y:70,d:4.5}].map((e, i) => (
          <circle cx={e.x} cy={e.y} r="2" fill="#f59e0b" opacity="0.35">
            <animate attributeName="cy" values={`${e.y};${e.y - 28};${e.y}`} dur={`${e.d}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.35;0;0.35" dur={`${e.d}s`} repeatCount="indefinite" />
          </circle>
        ))}
        {/* Tail feather plume behind body */}
        <path d="M100 186 Q90 192 82 200 Q88 194 80 200" fill="none" stroke="#f59e0b" stroke-width="2" opacity="0.35" />
        <path d="M100 186 Q108 194 118 200 Q112 194 120 200" fill="none" stroke="#ef4444" stroke-width="1.5" opacity="0.3" />
        <path d="M100 186 Q100 196 100 200" fill="none" stroke="#fbbf24" stroke-width="1.5" opacity="0.25" />
      </>}

      {/* === RETRO: Big Pixel Shades + Sweatband + Boombox === */}
      {p.theme === 'retro' && <>
        {/* Sweatband */}
        <path d="M46 58 Q100 48 154 58" fill="none" stroke="#e879f9" stroke-width="6" opacity="0.5" />
        <path d="M46 58 Q100 48 154 58" fill="none" stroke="#22d3ee" stroke-width="2" opacity="0.3" />
        {/* Chunky pixel glasses */}
        <rect x="56" y="70" width="32" height="18" rx="2" fill="#1a0a2e" stroke="#e879f9" stroke-width="1.8" opacity="0.7" />
        <rect x="112" y="70" width="32" height="18" rx="2" fill="#1a0a2e" stroke="#22d3ee" stroke-width="1.8" opacity="0.7" />
        <rect x="88" y="74" width="24" height="6" rx="1" fill="#1a0a2e" stroke="#e879f9" stroke-width="1" opacity="0.45" />
        {/* Lens reflections */}
        <rect x="60" y="74" width="10" height="5" fill="#e879f9" opacity="0.12" />
        <rect x="116" y="74" width="10" height="5" fill="#22d3ee" opacity="0.12" />
        {/* Mini boombox on shoulder */}
        <rect x="148" y="120" width="20" height="14" rx="2" fill="#2d1552" stroke="#e879f9" stroke-width="1" opacity="0.5" />
        <circle cx="154" cy="127" r="3.5" fill="none" stroke="#22d3ee" stroke-width="1" opacity="0.4" />
        <circle cx="162" cy="127" r="3.5" fill="none" stroke="#e879f9" stroke-width="1" opacity="0.4" />
        <rect x="150" y="122" width="16" height="2" rx="0.5" fill="#22d3ee" opacity="0.2" />
        {/* Pixel sparkles */}
        {[{x:10,y:40,c:'#e879f9'},{x:190,y:50,c:'#22d3ee'},{x:6,y:120,c:'#fbbf24'},{x:194,y:130,c:'#a3e635'}].map((px, i) => (
          <rect x={px.x - 2} y={px.y - 2} width="4" height="4" fill={px.c} opacity="0.25">
            <animate attributeName="opacity" values="0.25;0.05;0.25" dur={`${1.2 + i * 0.3}s`} repeatCount="indefinite" />
          </rect>
        ))}
        {/* Floating music notes */}
        {[{x:6,y:80,d:3.5},{x:192,y:100,d:4.5}].map((n, i) => (
          <g opacity="0.3">
            <text x={n.x} y={n.y} font-size="12" fill={i === 0 ? '#e879f9' : '#22d3ee'}>&#9834;</text>
            <animateTransform attributeName="transform" type="translate" values={`0,0;0,-12;0,0`} dur={`${n.d}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.3;0.5;0" dur={`${n.d}s`} repeatCount="indefinite" />
          </g>
        ))}
      </>}

      {/* === LIGHT: Golden Halo + Angel Wings === */}
      {p.theme === 'light' && <>
        {/* Halo */}
        <ellipse cx="100" cy="14" rx="44" ry="10" fill="none" stroke="#eab308" stroke-width="4.5" opacity="0.5" />
        <ellipse cx="100" cy="14" rx="42" ry="9" fill="none" stroke="#fbbf24" stroke-width="2" opacity="0.3" />
        <ellipse cx="100" cy="14" rx="46" ry="11" fill="none" stroke="#fde68a" stroke-width="1" opacity="0.2" />
        {/* Left wing */}
        <path d="M42 100 Q24 86 12 94 Q22 86 18 74 Q26 82 24 72 Q30 80 30 90"
          fill="#fef3c7" opacity="0.35" stroke="#eab308" stroke-width="0.8" />
        <path d="M42 100 Q28 90 16 96 Q24 88 22 78 Q28 84 28 92"
          fill="#fff" opacity="0.12" />
        {/* Right wing */}
        <path d="M158 100 Q176 86 188 94 Q178 86 182 74 Q174 82 176 72 Q170 80 170 90"
          fill="#fef3c7" opacity="0.35" stroke="#eab308" stroke-width="0.8" />
        <path d="M158 100 Q172 90 184 96 Q176 88 178 78 Q172 84 172 92"
          fill="#fff" opacity="0.12" />
        {/* Sun rays behind */}
        {Array.from({ length: 12 }).map((_, i) => {
          const a = i * 30 * Math.PI / 180;
          return <line x1={100 + 58 * Math.cos(a)} y1={80 + 50 * Math.sin(a)} x2={100 + 78 * Math.cos(a)} y2={80 + 68 * Math.sin(a)} stroke="#eab308" stroke-width="0.8" opacity="0.08" />;
        })}
        {/* Sparkle particles */}
        {[{x:30,y:60,d:3},{x:170,y:50,d:4},{x:24,y:140,d:5},{x:176,y:150,d:3.5}].map((sp, i) => (
          <g opacity="0.25">
            <line x1={sp.x - 3} y1={sp.y} x2={sp.x + 3} y2={sp.y} stroke="#eab308" stroke-width="1" />
            <line x1={sp.x} y1={sp.y - 3} x2={sp.x} y2={sp.y + 3} stroke="#eab308" stroke-width="1" />
            <animate attributeName="opacity" values="0.25;0.5;0.25" dur={`${sp.d}s`} repeatCount="indefinite" />
          </g>
        ))}
      </>}

      {/* === CUSTOM: Hard Hat + Tool Belt === */}
      {p.theme === 'custom' && <>
        {/* Hard hat */}
        <path d="M50 48 Q52 16 100 8 Q148 16 150 48" fill="#f97316" opacity="0.6" stroke="#ea580c" stroke-width="1.2" />
        <rect x="46" y="46" width="108" height="8" rx="3" fill="#ea580c" opacity="0.55" />
        {/* Headlamp */}
        <rect x="86" y="10" width="28" height="14" rx="4" fill="#f97316" opacity="0.55" />
        <rect x="92" y="14" width="16" height="8" rx="3" fill="#fbbf24" opacity="0.45">
          <animate attributeName="opacity" values="0.45;0.15;0.45" dur="2s" repeatCount="indefinite" />
        </rect>
        {/* Light beam */}
        <path d="M96 22 L80 -4 L120 -4 L104 22" fill="#fbbf24" opacity="0.06" />
        {/* Wrench in paw */}
        <g transform="translate(140,156) rotate(30)">
          <rect x="-2" y="-14" width="4" height="20" rx="1.5" fill="#9ca3af" opacity="0.5" />
          <path d="M-4 -14 Q-4 -20 0 -22 Q4 -20 4 -14" fill="none" stroke="#9ca3af" stroke-width="2" opacity="0.5" />
        </g>
        {/* Gear emblem on hat */}
        <g transform="translate(100,30)" opacity="0.3">
          {[0,45,90,135].map((deg, i) => (
            <rect x="-1.5" y="-6" width="3" height="12" rx="1" fill="#fbbf24" transform={`rotate(${deg})`} />
          ))}
          <circle r="4" fill="#ea580c" />
          <circle r="2" fill="#f97316" />
        </g>
        {/* Blueprint lines near paw */}
        <g transform="translate(48,156)" opacity="0.25">
          <rect x="-8" y="-8" width="16" height="12" fill="#1e3a5f" stroke="#3b82f6" stroke-width="0.6" rx="1" />
          <line x1="-6" y1="-4" x2="6" y2="-4" stroke="#3b82f6" stroke-width="0.4" />
          <line x1="-6" y1="0" x2="4" y2="0" stroke="#3b82f6" stroke-width="0.4" />
          <rect x="-4" y="-2" width="4" height="3" fill="none" stroke="#60a5fa" stroke-width="0.4" />
        </g>
      </>}
    </svg>
  );
}
