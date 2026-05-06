'use client';

import { useMemo } from 'react';
import type { ThemeName } from '@/types';

interface Props {
  theme: ThemeName;
}

function seededRand(seed: number) {
  let s = seed;
  return () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; };
}

export default function ThemeBg({ theme }: Props) {
  switch (theme) {
    case 'darkbear': return <DarkBearBg />;
    case 'midnight': return <MidnightBg />;
    case 'obsidian': return <ObsidianBg />;
    case 'nord': return <NordBg />;
    case 'gruvbox': return <GruvboxBg />;
    case 'rose-pine': return <RosePineBg />;
    case 'abyss': return <AbyssBg />;
    case 'ember': return <EmberBg />;
    case 'aurora': return <AuroraBg />;
    case 'catppuccin': return <CatppuccinBg />;
    case 'tokyo-night': return <TokyoNightBg />;
    case 'dracula': return <DraculaBg />;
    case 'solarized': return <SolarizedBg />;
    default: return null;
  }
}

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
    {children}
  </div>
);

/* ── DarkBear: Cosmic indigo particles, nebula clouds, glowing orbs ── */
function DarkBearBg() {
  const particles = useMemo(() => {
    const rand = seededRand(42);
    return Array.from({ length: 100 }, () => ({
      x: rand() * 100, y: rand() * 100,
      size: 0.8 + rand() * 3,
      opacity: 0.12 + rand() * 0.35,
      dur: 3 + rand() * 6,
      delay: rand() * 10,
      glow: rand() > 0.7,
    }));
  }, []);
  return (
    <Shell>
      {particles.map((p, i) => (
        <div key={i} className="absolute rounded-full"
          style={{ left: `${p.x}%`, top: `${p.y}%`, width: `${p.size}px`, height: `${p.size}px`,
            background: i % 4 === 0 ? '#a78bfa' : i % 4 === 1 ? '#818cf8' : i % 4 === 2 ? '#6366f1' : '#c4b5fd',
            opacity: p.opacity,
            boxShadow: p.glow ? `0 0 ${p.size * 4}px rgba(129,140,248,0.4)` : undefined,
            animation: `db-pulse ${p.dur}s ease-in-out ${p.delay}s infinite` }} />
      ))}
      <div className="absolute w-[700px] h-[700px] top-[10%] left-[20%] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(129,140,248,0.15), transparent 50%)', animation: 'db-drift 28s ease-in-out infinite', filter: 'blur(20px)' }} />
      <div className="absolute w-[600px] h-[600px] bottom-[0%] right-[0%] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.12), transparent 50%)', animation: 'db-drift 38s ease-in-out infinite reverse', filter: 'blur(20px)' }} />
      <div className="absolute w-[400px] h-[400px] top-[55%] left-[5%] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(167,139,250,0.1), transparent 50%)', animation: 'db-drift 32s ease-in-out 5s infinite', filter: 'blur(15px)' }} />
      <div className="absolute w-[350px] h-[350px] top-[5%] right-[10%] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(196,181,253,0.08), transparent 50%)', animation: 'db-drift 45s ease-in-out 10s infinite', filter: 'blur(15px)' }} />
      {/* Pulsing orbs */}
      {[{ x: 75, y: 20, s: 8 }, { x: 25, y: 70, s: 6 }, { x: 60, y: 85, s: 5 }].map((o, i) => (
        <div key={`orb${i}`} className="absolute rounded-full"
          style={{ left: `${o.x}%`, top: `${o.y}%`, width: `${o.s}px`, height: `${o.s}px`,
            background: 'rgba(129,140,248,0.6)',
            boxShadow: `0 0 ${o.s * 5}px rgba(129,140,248,0.3), 0 0 ${o.s * 10}px rgba(129,140,248,0.1)`,
            animation: `db-orb ${4 + i * 2}s ease-in-out ${i * 1.5}s infinite` }} />
      ))}

      {/* Galaxy 1 — indigo spiral */}
      <div className="absolute" style={{ top: '12%', right: '8%', width: '110px', height: '110px', animation: 'db-spin 90s linear infinite' }}>
        <div className="absolute inset-0 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(129,140,248,0.22) 0%, rgba(129,140,248,0.06) 30%, transparent 55%)' }} />
        <svg className="absolute inset-0" viewBox="0 0 110 110" style={{ opacity: 0.14 }}>
          <path d="M55 55 Q70 40 75 26 Q79 14 71 11 Q63 10 58 24 Q53 38 55 55" fill="rgba(196,181,253,0.6)" />
          <path d="M55 55 Q40 70 35 84 Q31 96 39 99 Q47 100 52 86 Q57 72 55 55" fill="rgba(196,181,253,0.6)" />
          <path d="M55 55 Q70 65 82 70 Q94 73 96 64 Q96 55 82 53 Q68 51 55 55" fill="rgba(129,140,248,0.5)" />
          <path d="M55 55 Q40 45 28 40 Q16 37 14 46 Q14 55 28 57 Q42 59 55 55" fill="rgba(129,140,248,0.5)" />
        </svg>
        <div className="absolute rounded-full" style={{ top: '38%', left: '38%', width: '24%', height: '24%', background: 'radial-gradient(circle, rgba(255,255,255,0.3), rgba(129,140,248,0.08) 60%, transparent)', boxShadow: '0 0 12px rgba(129,140,248,0.15)' }} />
      </div>

      {/* Galaxy 2 — smaller purple */}
      <div className="absolute" style={{ bottom: '18%', left: '5%', width: '70px', height: '70px', animation: 'db-spin 70s linear infinite reverse' }}>
        <div className="absolute inset-0 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(167,139,250,0.18) 0%, rgba(167,139,250,0.05) 30%, transparent 55%)' }} />
        <svg className="absolute inset-0" viewBox="0 0 70 70" style={{ opacity: 0.1 }}>
          <path d="M35 35 Q46 26 48 16 Q50 8 44 7 Q38 7 37 16 Q35 26 35 35" fill="rgba(196,181,253,0.5)" />
          <path d="M35 35 Q24 44 22 54 Q20 62 26 63 Q32 63 33 54 Q35 44 35 35" fill="rgba(196,181,253,0.5)" />
        </svg>
        <div className="absolute rounded-full" style={{ top: '40%', left: '40%', width: '20%', height: '20%', background: 'radial-gradient(circle, rgba(255,255,255,0.2), transparent 70%)' }} />
      </div>

      {/* Galaxy 3 — tiny deep field */}
      <div className="absolute" style={{ top: '65%', right: '28%', width: '30px', height: '30px', animation: 'db-spin 120s linear infinite', opacity: 0.45 }}>
        <div className="absolute inset-0 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.25) 0%, transparent 55%)' }} />
        <div className="absolute rounded-full" style={{ top: '40%', left: '40%', width: '20%', height: '20%', background: 'rgba(255,255,255,0.12)' }} />
      </div>

      {/* Shooting stars */}
      <div className="db-shooter" style={{ top: '8%', left: '15%', animationDelay: '1s' }} />
      <div className="db-shooter db-shooter-long" style={{ top: '30%', left: '55%', animationDelay: '4.5s' }} />
      <div className="db-shooter" style={{ top: '50%', left: '80%', animationDelay: '8s' }} />
      <div className="db-shooter db-shooter-long" style={{ top: '72%', left: '20%', animationDelay: '12s' }} />
      <div className="db-shooter" style={{ top: '20%', left: '70%', animationDelay: '16s' }} />
      <div className="db-shooter" style={{ top: '85%', left: '40%', animationDelay: '20s' }} />
      <div className="db-shooter db-shooter-long" style={{ top: '42%', left: '10%', animationDelay: '24s' }} />
      <div className="db-shooter" style={{ top: '60%', left: '65%', animationDelay: '28s' }} />

      <style>{`
        @keyframes db-pulse { 0%,100%{opacity:inherit;transform:scale(1)} 50%{opacity:0.03;transform:scale(0.4)} }
        @keyframes db-drift { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(-35px,25px) scale(1.1)} 66%{transform:translate(20px,-15px) scale(0.95)} }
        @keyframes db-orb { 0%,100%{opacity:0.6;transform:scale(1)} 50%{opacity:0.15;transform:scale(2)} }
        @keyframes db-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .db-shooter {
          position: absolute;
          width: 80px;
          height: 2px;
          background: linear-gradient(90deg, rgba(196,181,253,0.8), rgba(129,140,248,0.3), transparent);
          transform: rotate(-35deg);
          animation: db-shoot 9s ease-in infinite;
          opacity: 0;
          border-radius: 1px;
        }
        .db-shooter-long {
          width: 140px;
          height: 2.5px;
          background: linear-gradient(90deg, rgba(255,255,255,0.85), rgba(129,140,248,0.4), transparent);
        }
        @keyframes db-shoot {
          0% { opacity: 0; transform: rotate(-35deg) translateX(0); }
          1.5% { opacity: 0.9; }
          6% { opacity: 0; transform: rotate(-35deg) translateX(380px); }
          100% { opacity: 0; }
        }
      `}</style>
    </Shell>
  );
}

/* ── Midnight: Dense starfield, constellation lines, breathing void ── */
function MidnightBg() {
  const stars = useMemo(() => {
    const rand = seededRand(99);
    return Array.from({ length: 160 }, () => ({
      x: rand() * 100, y: rand() * 100,
      size: 0.3 + rand() * 1.8,
      opacity: 0.15 + rand() * 0.6,
      dur: 2 + rand() * 5,
      delay: rand() * 8,
      blue: rand() > 0.7,
    }));
  }, []);
  const lines = useMemo(() => {
    const rand = seededRand(101);
    return Array.from({ length: 8 }, () => ({
      x1: rand() * 80 + 10, y1: rand() * 80 + 10,
      x2: rand() * 80 + 10, y2: rand() * 80 + 10,
      dur: 10 + rand() * 15,
      delay: rand() * 12,
    }));
  }, []);
  return (
    <Shell>
      {stars.map((s, i) => (
        <div key={i} className="absolute rounded-full"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.size}px`, height: `${s.size}px`,
            background: s.blue ? '#8b9cf8' : '#e8e8e8', opacity: s.opacity,
            boxShadow: s.size > 1.5 ? `0 0 ${s.size * 3}px rgba(139,156,248,0.3)` : undefined,
            animation: `mn-twinkle ${s.dur}s ease-in-out ${s.delay}s infinite` }} />
      ))}
      {/* Constellation lines */}
      <svg className="absolute inset-0 w-full h-full">
        {lines.map((l, i) => (
          <line key={i} x1={`${l.x1}%`} y1={`${l.y1}%`} x2={`${l.x2}%`} y2={`${l.y2}%`}
            stroke="rgba(139,156,248,0.06)" strokeWidth="0.5"
            style={{ animation: `mn-line ${l.dur}s ease-in-out ${l.delay}s infinite` }} />
        ))}
      </svg>
      <div className="absolute w-[600px] h-[600px] top-[30%] left-[45%] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(139,156,248,0.1), transparent 50%)', animation: 'mn-breathe 12s ease-in-out infinite', filter: 'blur(20px)' }} />
      <div className="absolute w-[400px] h-[400px] bottom-[10%] left-[10%] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(100,100,180,0.06), transparent 50%)', animation: 'mn-breathe 18s ease-in-out 6s infinite', filter: 'blur(15px)' }} />
      <style>{`
        @keyframes mn-twinkle { 0%,100%{opacity:inherit} 40%{opacity:0.02} 60%{opacity:0.02} }
        @keyframes mn-breathe { 0%,100%{transform:translate(-50%,-50%) scale(1)} 50%{transform:translate(-50%,-50%) scale(1.5)} }
        @keyframes mn-line { 0%,100%{opacity:1} 50%{opacity:0} }
      `}</style>
    </Shell>
  );
}

/* ── Obsidian: Crystal facets, light sweeps, geometric reflections ── */
function ObsidianBg() {
  const facets = useMemo(() => {
    const rand = seededRand(44);
    return Array.from({ length: 12 }, () => ({
      x: rand() * 100, y: rand() * 100,
      size: 40 + rand() * 80,
      rot: rand() * 360,
      dur: 5 + rand() * 8,
      delay: rand() * 6,
    }));
  }, []);
  return (
    <Shell>
      {/* Diagonal light sweeps */}
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="absolute"
          style={{ width: '250%', height: '100px', top: `${15 + i * 22}%`, left: '-75%',
            background: `linear-gradient(90deg, transparent 20%, rgba(167,139,250,${0.06 + i * 0.02}) 44%, rgba(255,255,255,${0.1 + i * 0.03}) 50%, rgba(167,139,250,${0.06 + i * 0.02}) 56%, transparent 80%)`,
            transform: `rotate(${-18 + i * 10}deg)`,
            animation: `ob-sweep ${6 + i * 2.5}s ease-in-out ${i * 1.5}s infinite` }} />
      ))}
      {/* Crystal facets */}
      {facets.map((f, i) => (
        <div key={`f${i}`} className="absolute"
          style={{ left: `${f.x}%`, top: `${f.y}%`, width: `${f.size}px`, height: `${f.size}px`,
            background: `linear-gradient(${135 + f.rot * 0.5}deg, transparent 30%, rgba(167,139,250,${0.06 + (i % 3) * 0.02}) 50%, transparent 70%)`,
            transform: `rotate(${f.rot}deg)`,
            clipPath: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)',
            animation: `ob-facet ${f.dur}s ease-in-out ${f.delay}s infinite` }} />
      ))}
      {/* Ambient glow */}
      <div className="absolute w-[500px] h-[500px] top-[40%] left-[50%] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(167,139,250,0.06), transparent 55%)', animation: 'ob-breathe 20s ease-in-out infinite', filter: 'blur(25px)' }} />
      <style>{`
        @keyframes ob-sweep { 0%,100%{transform:rotate(var(--tw-rotate,0deg)) translateX(-30%)} 50%{transform:rotate(var(--tw-rotate,0deg)) translateX(30%)} }
        @keyframes ob-facet { 0%,100%{opacity:0.3} 50%{opacity:1} }
        @keyframes ob-breathe { 0%,100%{opacity:1;transform:translate(-50%,-50%) scale(1)} 50%{opacity:0.5;transform:translate(-50%,-50%) scale(1.3)} }
      `}</style>
    </Shell>
  );
}

/* ── Nord: Aurora borealis curtains, frost particles, polar sky ── */
function NordBg() {
  const frost = useMemo(() => {
    const rand = seededRand(22);
    return Array.from({ length: 30 }, () => ({
      x: rand() * 100, y: rand() * 60,
      size: 1 + rand() * 2,
      dur: 4 + rand() * 6,
      delay: rand() * 8,
    }));
  }, []);
  return (
    <Shell>
      {/* Aurora bands */}
      {[
        { color: '#88c0d0', top: '-5%', h: '55%', delay: '0s', dur: '10s' },
        { color: '#81a1c1', top: '0%', h: '45%', delay: '2.5s', dur: '13s' },
        { color: '#5e81ac', top: '-5%', h: '60%', delay: '5s', dur: '16s' },
        { color: '#a3be8c', top: '0%', h: '40%', delay: '7.5s', dur: '12s' },
        { color: '#b48ead', top: '2%', h: '35%', delay: '4s', dur: '14s' },
      ].map((band, i) => (
        <div key={i} className="absolute left-0 right-0"
          style={{ top: band.top, height: band.h,
            background: `linear-gradient(180deg, ${band.color}28 0%, ${band.color}12 35%, transparent 100%)`,
            animation: `nd-wave ${band.dur} ease-in-out ${band.delay} infinite`,
            filter: 'blur(30px)' }} />
      ))}
      {/* Vertical aurora columns */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
        <div key={`col${i}`} className="absolute top-0"
          style={{ left: `${5 + i * 12}%`, width: '5%', height: '55%',
            background: `linear-gradient(180deg, ${['#88c0d0', '#81a1c1', '#5e81ac', '#a3be8c', '#b48ead', '#88c0d0', '#81a1c1', '#5e81ac'][i]}18, transparent)`,
            animation: `nd-col ${4 + i * 1.2}s ease-in-out ${i * 0.8}s infinite`,
            filter: 'blur(12px)' }} />
      ))}
      {/* Frost particles */}
      {frost.map((f, i) => (
        <div key={`fr${i}`} className="absolute rounded-full"
          style={{ left: `${f.x}%`, top: `${f.y}%`, width: `${f.size}px`, height: `${f.size}px`,
            background: i % 2 === 0 ? '#88c0d0' : '#81a1c1', opacity: 0.15 + (i % 3) * 0.08,
            animation: `nd-frost ${f.dur}s ease-in-out ${f.delay}s infinite` }} />
      ))}
      {/* Grid lines */}
      <div className="absolute inset-0 opacity-[0.04]"
        style={{ background: 'repeating-linear-gradient(90deg, transparent, transparent 80px, rgba(136,192,208,0.18) 80px, rgba(136,192,208,0.18) 81px)' }} />
      <style>{`
        @keyframes nd-wave { 0%,100%{transform:scaleY(1) translateY(0)} 30%{transform:scaleY(1.7) translateY(-10%)} 70%{transform:scaleY(0.6) translateY(6%)} }
        @keyframes nd-col { 0%,100%{transform:scaleY(1);opacity:1} 50%{transform:scaleY(2.2);opacity:0.3} }
        @keyframes nd-frost { 0%,100%{opacity:inherit;transform:translateY(0)} 50%{opacity:0.05;transform:translateY(-8px)} }
      `}</style>
    </Shell>
  );
}

/* ── Gruvbox: Heat waves, rising embers, lava cracks ── */
function GruvboxBg() {
  const embers = useMemo(() => {
    const rand = seededRand(73);
    return Array.from({ length: 55 }, () => ({
      x: rand() * 100, startY: 75 + rand() * 25,
      size: 1 + rand() * 3,
      dur: 2.5 + rand() * 5,
      delay: rand() * 8,
      color: rand() > 0.5 ? '#d79921' : rand() > 0.3 ? '#cc241d' : '#d65d0e',
    }));
  }, []);
  return (
    <Shell>
      {/* Multi-layer heat glow */}
      <div className="absolute bottom-0 left-0 right-0 h-[55%]"
        style={{ background: 'linear-gradient(to top, rgba(215,153,33,0.18), transparent)', animation: 'gv-glow 4s ease-in-out infinite' }} />
      <div className="absolute bottom-0 left-[10%] right-[10%] h-[40%]"
        style={{ background: 'radial-gradient(ellipse at bottom, rgba(214,93,14,0.14), transparent 65%)', animation: 'gv-glow 6s ease-in-out 1.5s infinite' }} />
      <div className="absolute bottom-0 left-[25%] right-[25%] h-[30%]"
        style={{ background: 'radial-gradient(ellipse at bottom, rgba(204,36,29,0.1), transparent 60%)', animation: 'gv-glow 5s ease-in-out 3s infinite' }} />
      {/* Lava cracks */}
      {[10, 25, 40, 55, 70, 85].map((x, i) => (
        <div key={`c${i}`} className="absolute bottom-0"
          style={{ left: `${x + (i % 2) * 3}%`, width: '2px', height: `${15 + i * 4}%`,
            background: `linear-gradient(to top, rgba(${i % 2 === 0 ? '215,153,33' : '214,93,14'},${0.2 - i * 0.01}), transparent)`,
            filter: 'blur(1px)', animation: `gv-crack ${3 + i * 1.2}s ease-in-out ${i * 0.6}s infinite` }} />
      ))}
      {/* Heat shimmer */}
      <div className="absolute bottom-0 left-0 right-0 h-[25%]"
        style={{ background: 'transparent', animation: 'gv-shimmer 2s ease-in-out infinite', filter: 'blur(1px)' }} />
      {/* Embers */}
      {embers.map((e, i) => (
        <div key={i} className="absolute rounded-full"
          style={{ left: `${e.x}%`, bottom: `${100 - e.startY}%`,
            width: `${e.size}px`, height: `${e.size}px`,
            background: e.color, opacity: 0,
            boxShadow: `0 0 ${e.size * 3}px ${e.color}`,
            animation: `gv-rise ${e.dur}s ease-out ${e.delay}s infinite` }} />
      ))}
      <style>{`
        @keyframes gv-glow { 0%,100%{opacity:1} 50%{opacity:1.4} }
        @keyframes gv-rise { 0%{opacity:0.6;transform:translateY(0)} 50%{opacity:0.3} 100%{opacity:0;transform:translateY(-300px) translateX(${30}px)} }
        @keyframes gv-crack { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes gv-shimmer { 0%,100%{transform:translateX(0)} 50%{transform:translateX(3px)} }
      `}</style>
    </Shell>
  );
}

/* ── Rose Pine: Falling petals, fireflies, dreamy fog ── */
function RosePineBg() {
  const petals = useMemo(() => {
    const rand = seededRand(55);
    return Array.from({ length: 30 }, () => ({
      x: rand() * 110 - 5,
      size: 8 + rand() * 16,
      dur: 7 + rand() * 12,
      delay: rand() * 15,
      rot: rand() * 360,
      drift: (rand() - 0.5) * 100,
      color: rand() > 0.5 ? '#eb6f92' : rand() > 0.3 ? '#c4a7e7' : '#f6c177',
    }));
  }, []);
  const fireflies = useMemo(() => {
    const rand = seededRand(56);
    return Array.from({ length: 15 }, () => ({
      x: rand() * 100, y: rand() * 100,
      dur: 5 + rand() * 8,
      delay: rand() * 10,
    }));
  }, []);
  return (
    <Shell>
      {/* Dreamy fog layers */}
      <div className="absolute w-[600px] h-[600px] top-[20%] right-[-10%] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(235,111,146,0.12), transparent 50%)', animation: 'rp-drift 22s ease-in-out infinite', filter: 'blur(25px)' }} />
      <div className="absolute w-[500px] h-[500px] bottom-[10%] left-[-10%] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(196,167,231,0.1), transparent 50%)', animation: 'rp-drift 30s ease-in-out infinite reverse', filter: 'blur(25px)' }} />
      <div className="absolute w-[400px] h-[400px] top-[50%] left-[40%] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(246,193,119,0.07), transparent 50%)', animation: 'rp-drift 35s ease-in-out 8s infinite', filter: 'blur(20px)' }} />
      {/* Falling petals */}
      {petals.map((p, i) => (
        <div key={i} className="absolute opacity-0"
          style={{ left: `${p.x}%`, top: '-5%',
            width: `${p.size}px`, height: `${p.size * 0.6}px`,
            background: p.color,
            borderRadius: '50% 0 50% 0',
            animation: `rp-fall ${p.dur}s ease-in-out ${p.delay}s infinite`,
            ['--drift' as string]: `${p.drift}px` }} />
      ))}
      {/* Fireflies */}
      {fireflies.map((f, i) => (
        <div key={`ff${i}`} className="absolute rounded-full"
          style={{ left: `${f.x}%`, top: `${f.y}%`, width: '3px', height: '3px',
            background: i % 3 === 0 ? '#f6c177' : i % 3 === 1 ? '#eb6f92' : '#c4a7e7',
            boxShadow: `0 0 8px ${i % 3 === 0 ? '#f6c177' : i % 3 === 1 ? '#eb6f92' : '#c4a7e7'}`,
            animation: `rp-fly ${f.dur}s ease-in-out ${f.delay}s infinite` }} />
      ))}
      <style>{`
        @keyframes rp-fall { 0%{opacity:0;transform:translateY(0) translateX(0) rotate(0deg)} 8%{opacity:0.3} 88%{opacity:0.15} 100%{opacity:0;transform:translateY(110vh) translateX(var(--drift)) rotate(720deg)} }
        @keyframes rp-drift { 0%,100%{transform:translate(0,0)} 33%{transform:translate(-30px,20px)} 66%{transform:translate(15px,-10px)} }
        @keyframes rp-fly { 0%,100%{opacity:0;transform:translate(0,0)} 20%{opacity:0.5} 50%{opacity:0.25;transform:translate(20px,-15px)} 80%{opacity:0.5} }
      `}</style>
    </Shell>
  );
}

/* ── Abyss: Deep ocean, bioluminescence, caustic light, bubbles ── */
function AbyssBg() {
  const orbs = useMemo(() => {
    const rand = seededRand(88);
    return Array.from({ length: 25 }, () => ({
      x: rand() * 100, y: rand() * 100,
      size: 4 + rand() * 14,
      dur: 4 + rand() * 8,
      delay: rand() * 10,
      color: rand() > 0.5 ? '#2dd4bf' : rand() > 0.3 ? '#22d3ee' : '#34d399',
    }));
  }, []);
  const bubbles = useMemo(() => {
    const rand = seededRand(89);
    return Array.from({ length: 20 }, () => ({
      x: rand() * 100,
      size: 2 + rand() * 5,
      dur: 6 + rand() * 8,
      delay: rand() * 12,
    }));
  }, []);
  return (
    <Shell>
      {/* Depth gradient */}
      <div className="absolute inset-0"
        style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(45,212,191,0.04) 50%, rgba(45,212,191,0.12) 100%)' }} />
      {/* Caustic light network */}
      {[0, 1, 2, 3, 4, 5, 6].map(i => (
        <div key={i} className="absolute left-0 right-0"
          style={{ top: `${8 + i * 13}%`, height: '3px',
            background: `linear-gradient(90deg, transparent 5%, rgba(45,212,191,${0.08 + i * 0.015}) 20%, rgba(45,212,191,${0.14 + i * 0.02}) 50%, rgba(45,212,191,${0.08 + i * 0.015}) 80%, transparent 95%)`,
            animation: `ab-wave ${4 + i * 1.2}s ease-in-out ${i * 0.6}s infinite`,
            filter: 'blur(2px)' }} />
      ))}
      {/* Bioluminescent orbs */}
      {orbs.map((o, i) => (
        <div key={`o${i}`} className="absolute rounded-full"
          style={{ left: `${o.x}%`, top: `${o.y}%`,
            width: `${o.size}px`, height: `${o.size}px`,
            background: o.color, opacity: 0,
            boxShadow: `0 0 ${o.size * 3}px ${o.color}, 0 0 ${o.size * 6}px ${o.color}44`,
            animation: `ab-glow ${o.dur}s ease-in-out ${o.delay}s infinite` }} />
      ))}
      {/* Rising bubbles */}
      {bubbles.map((b, i) => (
        <div key={`b${i}`} className="absolute rounded-full"
          style={{ left: `${b.x}%`, bottom: '-5%',
            width: `${b.size}px`, height: `${b.size}px`,
            border: '0.5px solid rgba(45,212,191,0.15)', opacity: 0,
            animation: `ab-bubble ${b.dur}s ease-out ${b.delay}s infinite` }} />
      ))}
      <style>{`
        @keyframes ab-wave { 0%,100%{transform:scaleX(1) translateX(0)} 50%{transform:scaleX(1.2) translateX(5%)} }
        @keyframes ab-glow { 0%,100%{opacity:0} 25%{opacity:0.25} 75%{opacity:0.25} }
        @keyframes ab-bubble { 0%{opacity:0;transform:translateY(0)} 10%{opacity:0.3} 90%{opacity:0.1} 100%{opacity:0;transform:translateY(-110vh) translateX(15px)} }
      `}</style>
    </Shell>
  );
}

/* ── Ember: Volcanic fire, lava rivers, intense heat ── */
function EmberBg() {
  const sparks = useMemo(() => {
    const rand = seededRand(66);
    return Array.from({ length: 65 }, () => ({
      x: rand() * 100,
      size: 0.8 + rand() * 3.5,
      dur: 1.5 + rand() * 3,
      delay: rand() * 8,
      color: rand() > 0.5 ? '#fbbf24' : rand() > 0.25 ? '#f97316' : '#ef4444',
    }));
  }, []);
  return (
    <Shell>
      {/* Multi-layer volcanic glow */}
      <div className="absolute bottom-0 left-0 right-0 h-[60%]"
        style={{ background: 'linear-gradient(to top, rgba(249,115,22,0.22), rgba(239,68,68,0.1) 45%, transparent)', animation: 'em-heat 3.5s ease-in-out infinite' }} />
      <div className="absolute bottom-0 left-0 right-0 h-[40%]"
        style={{ background: 'radial-gradient(ellipse at 25% 100%, rgba(251,191,36,0.18), transparent 55%)', animation: 'em-heat 5s ease-in-out 1.5s infinite' }} />
      <div className="absolute bottom-0 left-0 right-0 h-[40%]"
        style={{ background: 'radial-gradient(ellipse at 75% 100%, rgba(239,68,68,0.15), transparent 55%)', animation: 'em-heat 4.5s ease-in-out 0.8s infinite' }} />
      {/* Lava rivers */}
      {[12, 28, 42, 58, 72, 88].map((x, i) => (
        <div key={`v${i}`} className="absolute bottom-0"
          style={{ left: `${x}%`, width: '3px', height: `${20 + i * 5}%`,
            background: `linear-gradient(to top, rgba(${i % 2 === 0 ? '249,115,22' : '251,191,36'},${0.18 - i * 0.01}), transparent)`,
            filter: 'blur(2px)', animation: `em-vein ${3.5 + i * 1.2}s ease-in-out ${i * 0.7}s infinite` }} />
      ))}
      {/* Horizontal lava flows */}
      {[75, 85, 92].map((y, i) => (
        <div key={`h${i}`} className="absolute left-0 right-0"
          style={{ bottom: `${100 - y}%`, height: '2px',
            background: `linear-gradient(90deg, transparent 10%, rgba(249,115,22,${0.08 + i * 0.03}) 30%, rgba(251,191,36,${0.12 + i * 0.03}) 50%, rgba(249,115,22,${0.08 + i * 0.03}) 70%, transparent 90%)`,
            animation: `em-flow ${6 + i * 2}s ease-in-out ${i * 2}s infinite` }} />
      ))}
      {/* Rising sparks */}
      {sparks.map((s, i) => (
        <div key={i} className="absolute rounded-full"
          style={{ left: `${s.x}%`, bottom: '0',
            width: `${s.size}px`, height: `${s.size}px`,
            background: s.color, opacity: 0,
            boxShadow: `0 0 ${s.size * 3}px ${s.color}`,
            animation: `em-spark ${s.dur}s ease-out ${s.delay}s infinite` }} />
      ))}
      <style>{`
        @keyframes em-heat { 0%,100%{opacity:1} 50%{opacity:1.4} }
        @keyframes em-vein { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes em-flow { 0%,100%{transform:translateX(-5%)} 50%{transform:translateX(5%)} }
        @keyframes em-spark { 0%{opacity:0.7;transform:translateY(0)} 100%{opacity:0;transform:translateY(-380px) translateX(35px)} }
      `}</style>
    </Shell>
  );
}

/* ── Aurora: Vibrant curtains, electric columns, cosmic glow ── */
function AuroraBg() {
  const particles = useMemo(() => {
    const rand = seededRand(77);
    return Array.from({ length: 20 }, () => ({
      x: rand() * 100, y: rand() * 50,
      size: 1.5 + rand() * 2.5,
      dur: 3 + rand() * 5,
      delay: rand() * 8,
      color: rand() > 0.5 ? '#a78bfa' : rand() > 0.3 ? '#c084fc' : '#e879f9',
    }));
  }, []);
  return (
    <Shell>
      {/* Aurora curtain bands */}
      {[
        { colors: ['#a78bfa', '#818cf8'], top: '-5%', h: '55%', dur: '9s', delay: '0s' },
        { colors: ['#c084fc', '#a78bfa'], top: '0%', h: '45%', dur: '12s', delay: '2s' },
        { colors: ['#818cf8', '#6366f1'], top: '-5%', h: '60%', dur: '16s', delay: '5s' },
        { colors: ['#e879f9', '#c084fc'], top: '3%', h: '40%', dur: '11s', delay: '4s' },
        { colors: ['#6366f1', '#4f46e5'], top: '0%', h: '50%', dur: '14s', delay: '7s' },
      ].map((c, i) => (
        <div key={i} className="absolute left-0 right-0"
          style={{ top: c.top, height: c.h,
            background: `linear-gradient(180deg, ${c.colors[0]}22 0%, ${c.colors[1]}0e 45%, transparent 100%)`,
            animation: `au-curtain ${c.dur} ease-in-out ${c.delay} infinite`,
            filter: 'blur(35px)' }} />
      ))}
      {/* Vertical electric columns */}
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => (
        <div key={`col${i}`} className="absolute top-0"
          style={{ left: `${5 + i * 11}%`, width: '4%', height: '55%',
            background: `linear-gradient(180deg, ${['#a78bfa', '#c084fc', '#818cf8', '#e879f9', '#6366f1', '#a78bfa', '#c084fc', '#818cf8', '#e879f9'][i]}1a, transparent)`,
            animation: `au-col ${4 + i * 1.1}s ease-in-out ${i * 0.9}s infinite`,
            filter: 'blur(12px)' }} />
      ))}
      {/* Floating particles */}
      {particles.map((p, i) => (
        <div key={`p${i}`} className="absolute rounded-full"
          style={{ left: `${p.x}%`, top: `${p.y}%`, width: `${p.size}px`, height: `${p.size}px`,
            background: p.color, opacity: 0,
            boxShadow: `0 0 ${p.size * 4}px ${p.color}`,
            animation: `au-spark ${p.dur}s ease-in-out ${p.delay}s infinite` }} />
      ))}
      <style>{`
        @keyframes au-curtain { 0%,100%{transform:scaleY(1);opacity:1} 30%{transform:scaleY(1.8);opacity:0.4} 70%{transform:scaleY(0.5);opacity:1.3} }
        @keyframes au-col { 0%,100%{transform:scaleY(1);opacity:1} 50%{transform:scaleY(2.5);opacity:0.3} }
        @keyframes au-spark { 0%,100%{opacity:0} 30%{opacity:0.4;transform:translateY(-10px)} 70%{opacity:0.4;transform:translateY(10px)} }
      `}</style>
    </Shell>
  );
}

/* ── Catppuccin: Floating orbs, soft gradients, playful glow ── */
function CatppuccinBg() {
  const bubbles = useMemo(() => {
    const rand = seededRand(33);
    return Array.from({ length: 22 }, () => ({
      x: rand() * 100, y: rand() * 100,
      size: 80 + rand() * 300,
      dur: 10 + rand() * 20,
      delay: rand() * 12,
      color: rand() > 0.5 ? '#cba6f7' : rand() > 0.3 ? '#f5c2e7' : rand() > 0.15 ? '#89b4fa' : '#a6e3a1',
    }));
  }, []);
  const sparkles = useMemo(() => {
    const rand = seededRand(34);
    return Array.from({ length: 18 }, () => ({
      x: rand() * 100, y: rand() * 100,
      dur: 3 + rand() * 5,
      delay: rand() * 8,
    }));
  }, []);
  return (
    <Shell>
      {bubbles.map((b, i) => (
        <div key={i} className="absolute rounded-full"
          style={{ left: `${b.x}%`, top: `${b.y}%`,
            width: `${b.size}px`, height: `${b.size}px`,
            background: `radial-gradient(circle, ${b.color}18, transparent 50%)`,
            animation: `cp-float ${b.dur}s ease-in-out ${b.delay}s infinite`,
            filter: 'blur(5px)' }} />
      ))}
      {/* Playful sparkles */}
      {sparkles.map((s, i) => (
        <div key={`sp${i}`} className="absolute"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: '6px', height: '6px', opacity: 0,
            animation: `cp-sparkle ${s.dur}s ease-in-out ${s.delay}s infinite` }}>
          <div className="absolute left-[2px] top-0 w-[2px] h-[6px] rounded-full"
            style={{ background: i % 3 === 0 ? '#cba6f7' : i % 3 === 1 ? '#f5c2e7' : '#89b4fa' }} />
          <div className="absolute left-0 top-[2px] w-[6px] h-[2px] rounded-full"
            style={{ background: i % 3 === 0 ? '#cba6f7' : i % 3 === 1 ? '#f5c2e7' : '#89b4fa' }} />
        </div>
      ))}
      <style>{`
        @keyframes cp-float { 0%,100%{transform:translate(0,0) scale(1)} 25%{transform:translate(25px,-18px) scale(1.12)} 50%{transform:translate(-10px,22px) scale(0.92)} 75%{transform:translate(-18px,-10px) scale(1.08)} }
        @keyframes cp-sparkle { 0%,100%{opacity:0;transform:scale(0.5) rotate(0deg)} 40%{opacity:0.4;transform:scale(1.2) rotate(45deg)} 60%{opacity:0.4;transform:scale(1.2) rotate(45deg)} }
      `}</style>
    </Shell>
  );
}

/* ── Tokyo Night: Neon cityscape, rain, car headlights ── */
function TokyoNightBg() {
  const buildings = useMemo(() => {
    const rand = seededRand(77);
    return Array.from({ length: 26 }, (_, i) => ({
      x: i * 3.8 + rand() * 1.5,
      w: 2.5 + rand() * 4,
      h: 8 + rand() * 35,
      windows: Math.floor(2 + rand() * 6),
    }));
  }, []);
  const rain = useMemo(() => {
    const rand = seededRand(78);
    return Array.from({ length: 40 }, () => ({
      x: rand() * 100,
      dur: 0.8 + rand() * 1.2,
      delay: rand() * 3,
      h: 15 + rand() * 25,
    }));
  }, []);
  return (
    <Shell>
      {/* Sky gradient with neon glow */}
      <div className="absolute top-0 left-0 right-0 h-[60%]"
        style={{ background: 'linear-gradient(180deg, rgba(122,162,247,0.07), rgba(187,154,247,0.03) 50%, transparent)' }} />
      {/* Neon signs glow */}
      <div className="absolute top-[30%] left-[20%] w-[200px] h-[50px] rounded-full"
        style={{ background: 'radial-gradient(ellipse, rgba(255,158,100,0.08), transparent 70%)', animation: 'tn-neon 3s ease-in-out infinite', filter: 'blur(10px)' }} />
      <div className="absolute top-[25%] right-[15%] w-[150px] h-[40px] rounded-full"
        style={{ background: 'radial-gradient(ellipse, rgba(187,154,247,0.08), transparent 70%)', animation: 'tn-neon 4s ease-in-out 1.5s infinite', filter: 'blur(10px)' }} />
      {/* Ground */}
      <div className="absolute bottom-0 left-0 right-0 h-[10%]" style={{ background: 'rgba(26,27,39,0.9)' }} />
      {/* Buildings with windows */}
      {buildings.map((b, i) => (
        <div key={i} className="absolute bottom-[10%]"
          style={{ left: `${b.x}%`, width: `${b.w}%`, height: `${b.h}%`,
            background: 'rgba(26,27,39,0.85)', borderTop: '1px solid rgba(36,40,59,0.6)' }}>
          {Array.from({ length: b.windows }).map((_, wi) => (
            <div key={wi} className="absolute"
              style={{ left: '20%', right: '20%', height: '3px',
                top: `${10 + wi * (78 / b.windows)}%`,
                background: ['#7aa2f7', '#ff9e64', '#9ece6a', '#bb9af7', '#7dcfff', '#e0af68'][wi % 6],
                opacity: 0, animation: `tn-blink ${2 + wi * 0.4}s ease-in-out ${i * 0.2 + wi * 0.4}s infinite` }} />
          ))}
        </div>
      ))}
      {/* Street line */}
      <div className="absolute bottom-[10%] left-0 right-0 h-px" style={{ background: 'rgba(122,162,247,0.18)' }} />
      {/* Rain */}
      {rain.map((r, i) => (
        <div key={`r${i}`} className="absolute opacity-0"
          style={{ left: `${r.x}%`, top: '-5%', width: '1px', height: `${r.h}px`,
            background: 'linear-gradient(180deg, transparent, rgba(122,162,247,0.15))',
            animation: `tn-rain ${r.dur}s linear ${r.delay}s infinite` }} />
      ))}
      {/* Car headlights */}
      {[0, 1, 2, 3].map(i => (
        <div key={`car${i}`} className="absolute bottom-[10.5%] rounded-full"
          style={{ width: '5px', height: '2px',
            background: ['#ff9e64', '#7aa2f7', '#9ece6a', '#e0af68'][i],
            boxShadow: `0 0 8px ${['#ff9e64', '#7aa2f7', '#9ece6a', '#e0af68'][i]}`,
            animation: `tn-car ${8 + i * 3}s linear ${i * 3}s infinite` }} />
      ))}
      <style>{`
        @keyframes tn-blink { 0%,100%{opacity:0.15} 35%{opacity:0.7} 65%{opacity:0.7} }
        @keyframes tn-car { 0%{left:-2%;opacity:0.7} 100%{left:102%;opacity:0.7} }
        @keyframes tn-rain { 0%{opacity:0;transform:translateY(0)} 10%{opacity:0.4} 90%{opacity:0.2} 100%{opacity:0;transform:translateY(110vh)} }
        @keyframes tn-neon { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </Shell>
  );
}

/* ── Dracula: Gothic fog, bats, lightning, purple atmosphere ── */
function DraculaBg() {
  const fogLayers = useMemo(() => {
    const rand = seededRand(111);
    return Array.from({ length: 5 }, () => ({
      x: -20 + rand() * 40,
      bottom: rand() * 25,
      w: 500 + rand() * 400,
      h: 150 + rand() * 150,
      dur: 15 + rand() * 15,
      delay: rand() * 10,
    }));
  }, []);
  return (
    <Shell>
      {/* Purple sky gradient */}
      <div className="absolute top-0 left-0 right-0 h-[45%]"
        style={{ background: 'linear-gradient(180deg, rgba(189,147,249,0.1), rgba(139,233,253,0.03) 50%, transparent)' }} />
      {/* Fog layers */}
      {fogLayers.map((f, i) => (
        <div key={i} className="absolute rounded-full"
          style={{ left: `${f.x}%`, bottom: `${f.bottom}%`,
            width: `${f.w}px`, height: `${f.h}px`,
            background: `radial-gradient(ellipse, rgba(98,114,164,${0.1 + i * 0.02}), transparent 55%)`,
            filter: 'blur(30px)',
            animation: `dr-fog ${f.dur}s ease-in-out ${f.delay}s infinite` }} />
      ))}
      {/* Lightning flash */}
      <div className="absolute inset-0"
        style={{ animation: 'dr-lightning 12s ease-in-out infinite' }} />
      {/* Flying bats */}
      {[0, 1, 2, 3, 4].map(i => (
        <svg key={`bat${i}`} className="absolute" viewBox="0 0 30 12" style={{
          width: `${18 + i * 4}px`,
          top: `${8 + i * 16}%`, left: '-5%', opacity: 0,
          animation: `dr-bat ${12 + i * 5}s ease-in-out ${i * 4}s infinite`,
        }}>
          <path d="M15,6 Q10,0 5,3 Q2,1 0,4 Q3,5 5,5 Q8,8 12,7 L15,6 Q17,8 20,7 Q22,8 25,5 Q27,5 30,4 Q28,1 25,3 Q20,0 15,6Z"
            fill="#bd93f9" opacity="0.4">
            <animate attributeName="d"
              values="M15,6 Q10,0 5,3 Q2,1 0,4 Q3,5 5,5 Q8,8 12,7 L15,6 Q17,8 20,7 Q22,8 25,5 Q27,5 30,4 Q28,1 25,3 Q20,0 15,6Z;M15,6 Q10,3 5,5 Q2,4 0,6 Q3,6 5,6 Q8,7 12,6.5 L15,6 Q17,7 20,6.5 Q22,6 25,6 Q27,6 30,6 Q28,4 25,5 Q20,3 15,6Z;M15,6 Q10,0 5,3 Q2,1 0,4 Q3,5 5,5 Q8,8 12,7 L15,6 Q17,8 20,7 Q22,8 25,5 Q27,5 30,4 Q28,1 25,3 Q20,0 15,6Z"
              dur="0.4s" repeatCount="indefinite" />
          </path>
        </svg>
      ))}
      {/* Moon glow */}
      <div className="absolute top-[8%] right-[15%] w-[80px] h-[80px] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(189,147,249,0.12), transparent 60%)', boxShadow: '0 0 60px rgba(189,147,249,0.06)', animation: 'dr-moon 8s ease-in-out infinite' }} />
      <style>{`
        @keyframes dr-fog { 0%,100%{transform:translateX(0) translateY(0)} 50%{transform:translateX(60px) translateY(-25px)} }
        @keyframes dr-bat { 0%{left:-5%;opacity:0;transform:translateY(0)} 5%{opacity:0.35} 25%{transform:translateY(-20px)} 50%{transform:translateY(10px)} 75%{transform:translateY(-15px)} 95%{opacity:0.35} 100%{left:105%;opacity:0} }
        @keyframes dr-lightning { 0%,100%{background:transparent} 48%{background:transparent} 48.5%{background:rgba(189,147,249,0.04)} 49%{background:transparent} 49.5%{background:rgba(189,147,249,0.06)} 50%{background:transparent} }
        @keyframes dr-moon { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.6;transform:scale(1.1)} }
      `}</style>
    </Shell>
  );
}

/* ── Solarized: Sun, ocean waves, atmospheric light, lens flare ── */
function SolarizedBg() {
  const waves = useMemo(() => {
    const rand = seededRand(55);
    return Array.from({ length: 5 }, (_, i) => ({
      y: 58 + i * 5 + rand() * 3,
      dur: 4 + rand() * 4,
      delay: rand() * 3,
    }));
  }, []);
  return (
    <Shell>
      {/* Sun with glow rings */}
      <div className="absolute" style={{ top: '6%', right: '10%', width: '120px', height: '120px' }}>
        <div className="absolute inset-0 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(181,137,0,0.2) 0%, rgba(181,137,0,0.06) 35%, transparent 60%)', animation: 'sl-sun 6s ease-in-out infinite' }} />
        <div className="absolute rounded-full"
          style={{ top: '-20%', left: '-20%', width: '140%', height: '140%',
            border: '1px solid rgba(181,137,0,0.06)', animation: 'sl-ring 6s ease-in-out infinite' }} />
        <div className="absolute rounded-full"
          style={{ top: '-40%', left: '-40%', width: '180%', height: '180%',
            border: '1px solid rgba(181,137,0,0.03)', animation: 'sl-ring 6s ease-in-out 1s infinite' }} />
        {/* Sun rays */}
        {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((angle, i) => (
          <div key={i} className="absolute"
            style={{ top: '50%', left: '50%', width: '70px', height: '2px',
              background: `linear-gradient(90deg, transparent, rgba(181,137,0,${0.08 + (i % 3) * 0.03}), transparent)`,
              transformOrigin: '0 50%',
              transform: `rotate(${angle}deg) translateX(55px)`,
              animation: `sl-ray 6s ease-in-out ${i * 0.5}s infinite` }} />
        ))}
        {/* Sun core */}
        <div className="absolute rounded-full"
          style={{ top: '30%', left: '30%', width: '40%', height: '40%',
            background: 'radial-gradient(circle, rgba(181,137,0,0.25), rgba(181,137,0,0.08) 60%, transparent)',
            boxShadow: '0 0 20px rgba(181,137,0,0.1)' }} />
      </div>
      {/* Atmospheric gradient */}
      <div className="absolute top-0 left-0 right-0 h-[50%]"
        style={{ background: 'linear-gradient(180deg, rgba(181,137,0,0.03), rgba(38,139,210,0.02) 60%, transparent)' }} />
      {/* Ocean gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-[45%]"
        style={{ background: 'linear-gradient(to top, rgba(38,139,210,0.1), rgba(38,139,210,0.03) 60%, transparent)' }} />
      {/* Horizon line */}
      <div className="absolute left-0 right-0" style={{ bottom: '42%', height: '2px',
        background: 'linear-gradient(90deg, transparent 5%, rgba(181,137,0,0.08) 20%, rgba(181,137,0,0.12) 50%, rgba(181,137,0,0.08) 80%, transparent 95%)' }} />
      {/* Ocean waves */}
      {waves.map((w, i) => (
        <div key={`w${i}`} className="absolute left-[-10%] right-[-10%]"
          style={{ bottom: `${100 - w.y}%`, height: '2px',
            background: `linear-gradient(90deg, transparent 5%, rgba(38,139,210,${0.06 + i * 0.015}) 25%, rgba(38,139,210,${0.1 + i * 0.02}) 50%, rgba(38,139,210,${0.06 + i * 0.015}) 75%, transparent 95%)`,
            animation: `sl-wave ${w.dur}s ease-in-out ${w.delay}s infinite` }} />
      ))}
      {/* Lens flare */}
      <div className="absolute top-[20%] right-[25%] w-[40px] h-[8px] rounded-full"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(181,137,0,0.06), transparent)', animation: 'sl-flare 6s ease-in-out infinite' }} />
      <div className="absolute top-[35%] left-[45%] w-[25px] h-[25px] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(38,139,210,0.05), transparent 60%)', animation: 'sl-flare 6s ease-in-out 3s infinite' }} />
      <style>{`
        @keyframes sl-sun { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.7;transform:scale(1.12)} }
        @keyframes sl-ring { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.3;transform:scale(1.15)} }
        @keyframes sl-ray { 0%,100%{opacity:0.5} 50%{opacity:1} }
        @keyframes sl-wave { 0%,100%{transform:scaleX(1) translateX(0)} 50%{transform:scaleX(1.05) translateX(3%)} }
        @keyframes sl-flare { 0%,100%{opacity:0} 45%{opacity:1} 55%{opacity:1} }
      `}</style>
    </Shell>
  );
}
