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

/* ── DarkBear: Living digital mesh — network nodes, data streams, pulse rings ── */
function DarkBearBg() {
  const nodes = useMemo(() => {
    const rand = seededRand(42);
    return Array.from({ length: 45 }, (_, i) => ({
      x: rand() * 90 + 5, y: rand() * 90 + 5,
      size: rand() < 0.15 ? (4 + rand() * 4) : (1.5 + rand() * 2.5),
      opacity: 0.15 + rand() * 0.45,
      dur: 4 + rand() * 8,
      delay: rand() * 12,
      hub: i < 6,
    }));
  }, []);

  const edges = useMemo(() => {
    const rand = seededRand(77);
    const out: { x1: number; y1: number; x2: number; y2: number; dur: number; delay: number }[] = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 22 && rand() > 0.35) {
          out.push({ x1: nodes[i].x, y1: nodes[i].y, x2: nodes[j].x, y2: nodes[j].y, dur: 6 + rand() * 10, delay: rand() * 8 });
        }
      }
    }
    return out;
  }, [nodes]);

  const streams = useMemo(() => {
    const rand = seededRand(200);
    return Array.from({ length: 10 }, () => {
      const vertical = rand() > 0.5;
      return {
        x: rand() * 100, y: rand() * 100,
        vertical, len: 40 + rand() * 80,
        dur: 3 + rand() * 5, delay: rand() * 15,
        opacity: 0.06 + rand() * 0.12,
      };
    });
  }, []);

  const hexes = useMemo(() => {
    const rand = seededRand(150);
    return Array.from({ length: 8 }, () => ({
      x: rand() * 90 + 5, y: rand() * 90 + 5,
      size: 12 + rand() * 24,
      opacity: 0.04 + rand() * 0.06,
      dur: 15 + rand() * 20,
      delay: rand() * 10,
      rot: rand() * 360,
    }));
  }, []);

  return (
    <Shell>
      {/* Perspective grid floor */}
      <div className="absolute inset-0" style={{
        background: `
          linear-gradient(rgba(129,140,248,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(129,140,248,0.03) 1px, transparent 1px)`,
        backgroundSize: '60px 60px',
        maskImage: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0.6) 70%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0.6) 70%, transparent 100%)',
      }} />

      {/* Morphing gradient blobs */}
      <div className="absolute w-[500px] h-[500px] top-[5%] left-[15%] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.12), transparent 55%)', animation: 'db-morph-a 25s ease-in-out infinite', filter: 'blur(40px)' }} />
      <div className="absolute w-[400px] h-[400px] bottom-[10%] right-[5%] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.1), transparent 55%)', animation: 'db-morph-b 30s ease-in-out infinite', filter: 'blur(35px)' }} />
      <div className="absolute w-[300px] h-[300px] top-[50%] left-[60%] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(129,140,248,0.08), transparent 55%)', animation: 'db-morph-c 22s ease-in-out infinite', filter: 'blur(30px)' }} />

      {/* SVG layer: edges, nodes, data streams */}
      <svg className="absolute inset-0 w-full h-full">
        {/* Network edges */}
        {edges.map((e, i) => (
          <line key={`e${i}`} x1={`${e.x1}%`} y1={`${e.y1}%`} x2={`${e.x2}%`} y2={`${e.y2}%`}
            stroke="rgba(129,140,248,0.08)" strokeWidth="0.5"
            style={{ animation: `db-edge-breathe ${e.dur}s ease-in-out ${e.delay}s infinite` }} />
        ))}

        {/* Data streams traveling along edges */}
        {edges.slice(0, 8).map((e, i) => {
          const id = `stream-path-${i}`;
          return (
            <g key={`ds${i}`}>
              <path id={id} d={`M${e.x1 * 10} ${e.y1 * 10} L${e.x2 * 10} ${e.y2 * 10}`}
                fill="none" stroke="none" />
              <circle r="1.5" fill="rgba(129,140,248,0.6)" style={{ filter: 'drop-shadow(0 0 3px rgba(129,140,248,0.4))' }}>
                <animateMotion dur={`${3 + i * 0.7}s`} repeatCount="indefinite" begin={`${i * 1.2}s`}>
                  <mpath href={`#${id}`} />
                </animateMotion>
              </circle>
            </g>
          );
        })}

        {/* Pulse rings from hub nodes */}
        {nodes.filter(n => n.hub).map((n, i) => (
          <circle key={`pulse${i}`} cx={`${n.x}%`} cy={`${n.y}%`} r="0"
            fill="none" stroke="rgba(129,140,248,0.15)" strokeWidth="0.5">
            <animate attributeName="r" from="0" to="60" dur={`${6 + i * 2}s`} begin={`${i * 3}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" from="0.2" to="0" dur={`${6 + i * 2}s`} begin={`${i * 3}s`} repeatCount="indefinite" />
          </circle>
        ))}
      </svg>

      {/* Floating hexagons */}
      {hexes.map((h, i) => (
        <div key={`hex${i}`} className="absolute" style={{
          left: `${h.x}%`, top: `${h.y}%`, width: `${h.size}px`, height: `${h.size}px`,
          opacity: h.opacity, transform: `rotate(${h.rot}deg)`,
          animation: `db-hex-drift ${h.dur}s ease-in-out ${h.delay}s infinite`,
        }}>
          <svg viewBox="0 0 100 100" className="w-full h-full">
            <polygon points="50,2 93,25 93,75 50,98 7,75 7,25"
              fill="none" stroke="rgba(129,140,248,0.3)" strokeWidth="1" />
          </svg>
        </div>
      ))}

      {/* Data stream lines */}
      {streams.map((s, i) => (
        <div key={`st${i}`} className="absolute" style={{
          left: `${s.x}%`, top: `${s.y}%`,
          width: s.vertical ? '1px' : `${s.len}px`,
          height: s.vertical ? `${s.len}px` : '1px',
          background: s.vertical
            ? `linear-gradient(to bottom, transparent, rgba(129,140,248,${s.opacity}), transparent)`
            : `linear-gradient(to right, transparent, rgba(129,140,248,${s.opacity}), transparent)`,
          animation: `db-stream ${s.dur}s ease-in-out ${s.delay}s infinite`,
        }} />
      ))}

      {/* Network nodes */}
      {nodes.map((n, i) => (
        <div key={`n${i}`} className="absolute rounded-full" style={{
          left: `${n.x}%`, top: `${n.y}%`,
          width: `${n.size}px`, height: `${n.size}px`,
          transform: 'translate(-50%, -50%)',
          background: n.hub ? 'rgba(167,139,250,0.7)' : 'rgba(129,140,248,0.5)',
          boxShadow: n.hub
            ? `0 0 ${n.size * 3}px rgba(129,140,248,0.3), 0 0 ${n.size * 6}px rgba(129,140,248,0.1)`
            : `0 0 ${n.size * 2}px rgba(129,140,248,0.15)`,
          opacity: n.opacity,
          animation: `db-node ${n.dur}s ease-in-out ${n.delay}s infinite`,
        }} />
      ))}

      {/* Scan line */}
      <div className="absolute left-0 right-0 h-[1px]"
        style={{
          background: 'linear-gradient(90deg, transparent 10%, rgba(129,140,248,0.06) 30%, rgba(129,140,248,0.1) 50%, rgba(129,140,248,0.06) 70%, transparent 90%)',
          animation: 'db-scan 12s ease-in-out infinite',
        }} />

      <style>{`
        @keyframes db-morph-a { 0%,100%{transform:translate(0,0) scale(1) rotate(0deg)} 33%{transform:translate(-30px,20px) scale(1.15) rotate(3deg)} 66%{transform:translate(25px,-15px) scale(0.9) rotate(-2deg)} }
        @keyframes db-morph-b { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(20px,-25px) scale(1.1)} 66%{transform:translate(-15px,20px) scale(0.92)} }
        @keyframes db-morph-c { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(20px,10px) scale(1.2)} }
        @keyframes db-node { 0%,100%{opacity:inherit;transform:translate(-50%,-50%) scale(1)} 50%{opacity:0.08;transform:translate(-50%,-50%) scale(0.5)} }
        @keyframes db-edge-breathe { 0%,100%{opacity:1} 50%{opacity:0.2} }
        @keyframes db-hex-drift { 0%,100%{transform:rotate(var(--r,0deg)) translateY(0)} 50%{transform:rotate(var(--r,0deg)) translateY(-8px) scale(1.05)} }
        @keyframes db-stream { 0%,100%{opacity:0.5} 50%{opacity:0} }
        @keyframes db-scan { 0%{top:0%} 50%{top:100%} 100%{top:0%} }
      `}</style>
    </Shell>
  );
}

/* ── Midnight: Dense starfield, constellation lines, breathing void ── */
function MidnightBg() {
  const starsNear = useMemo(() => {
    const rand = seededRand(99);
    return Array.from({ length: 70 }, () => ({
      x: rand() * 100, y: rand() * 100,
      size: 1.4 + rand() * 1.8,
      opacity: 0.35 + rand() * 0.55,
      dur: 2 + rand() * 3,
      delay: rand() * 6,
      blue: rand() > 0.55,
    }));
  }, []);
  const starsMid = useMemo(() => {
    const rand = seededRand(200);
    return Array.from({ length: 80 }, () => ({
      x: rand() * 100, y: rand() * 100,
      size: 0.8 + rand() * 1.1,
      opacity: 0.15 + rand() * 0.35,
      dur: 4 + rand() * 5,
      delay: rand() * 9,
      blue: rand() > 0.65,
    }));
  }, []);
  const starsFar = useMemo(() => {
    const rand = seededRand(301);
    return Array.from({ length: 80 }, () => ({
      x: rand() * 100, y: rand() * 100,
      size: 0.3 + rand() * 0.7,
      opacity: 0.05 + rand() * 0.14,
      dur: 7 + rand() * 8,
      delay: rand() * 12,
    }));
  }, []);
  const milkyWayStars = useMemo(() => {
    const rand = seededRand(402);
    return Array.from({ length: 85 }, () => ({
      x: 15 + rand() * 70,
      y: rand() * 85,
      size: 0.3 + rand() * 0.9,
      opacity: 0.04 + rand() * 0.12,
    }));
  }, []);
  const shooters = useMemo(() => {
    const rand = seededRand(503);
    return [
      { x: 10 + rand() * 30, y: 5 + rand() * 20, angle: 25 + rand() * 20, dur: 3 + rand() * 2, delay: rand() * 18 },
      { x: 40 + rand() * 25, y: 3 + rand() * 15, angle: 18 + rand() * 15, dur: 2.5 + rand() * 2, delay: 7 + rand() * 14 },
      { x: 60 + rand() * 20, y: 8 + rand() * 18, angle: 30 + rand() * 25, dur: 2 + rand() * 3, delay: 14 + rand() * 12 },
    ];
  }, []);
  const nebulae = useMemo(() => {
    const rand = seededRand(604);
    return [
      { x: 20, y: 25, w: 380, h: 220, color: '139,156,248', opacity: 0.07, dur: 14, delay: 0 },
      { x: 55, y: 55, w: 300, h: 180, color: '160,100,220', opacity: 0.055, dur: 18, delay: 5 },
      { x: 10, y: 65, w: 260, h: 160, color: '80,120,200', opacity: 0.05, dur: 22, delay: 9 },
    ].map(n => ({ ...n, extraDelay: rand() * 3 }));
  }, []);
  // Constellation: triangle (top-left), cross (center-right), zigzag (bottom-left)
  const constellationLines = [
    // triangle
    { x1: 12, y1: 18, x2: 22, y2: 10, dur: 18, delay: 0 },
    { x1: 22, y1: 10, x2: 30, y2: 20, dur: 18, delay: 1 },
    { x1: 30, y1: 20, x2: 12, y2: 18, dur: 18, delay: 2 },
    // cross
    { x1: 65, y1: 30, x2: 75, y2: 30, dur: 20, delay: 3 },
    { x1: 70, y1: 25, x2: 70, y2: 35, dur: 20, delay: 4 },
    // zigzag
    { x1: 8, y1: 62, x2: 14, y2: 55, dur: 16, delay: 2 },
    { x1: 14, y1: 55, x2: 20, y2: 63, dur: 16, delay: 3 },
    { x1: 20, y1: 63, x2: 26, y2: 56, dur: 16, delay: 4 },
    { x1: 26, y1: 56, x2: 32, y2: 64, dur: 16, delay: 5 },
    // extra scatter lines
    { x1: 48, y1: 15, x2: 56, y2: 22, dur: 22, delay: 6 },
    { x1: 56, y1: 22, x2: 62, y2: 16, dur: 22, delay: 7 },
    { x1: 82, y1: 42, x2: 90, y2: 50, dur: 19, delay: 8 },
  ];
  return (
    <Shell>
      {/* Milky Way diagonal haze */}
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(135deg, transparent 15%, rgba(120,140,230,0.04) 30%, rgba(100,120,210,0.07) 50%, rgba(120,140,230,0.04) 70%, transparent 85%)',
        filter: 'blur(18px)',
      }} />
      {/* Milky Way dense cluster stars */}
      {milkyWayStars.map((s, i) => (
        <div key={`mw${i}`} className="absolute rounded-full"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.size}px`, height: `${s.size}px`,
            background: '#c0caff', opacity: s.opacity }} />
      ))}
      {/* Far stars */}
      {starsFar.map((s, i) => (
        <div key={`sf${i}`} className="absolute rounded-full"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.size}px`, height: `${s.size}px`,
            background: '#d0d8ff', opacity: s.opacity,
            animation: `mn-twinkle-slow ${s.dur}s ease-in-out ${s.delay}s infinite` }} />
      ))}
      {/* Mid stars */}
      {starsMid.map((s, i) => (
        <div key={`sm${i}`} className="absolute rounded-full"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.size}px`, height: `${s.size}px`,
            background: s.blue ? '#9aaeff' : '#e0e4ff', opacity: s.opacity,
            animation: `mn-twinkle ${s.dur}s ease-in-out ${s.delay}s infinite` }} />
      ))}
      {/* Near bright stars */}
      {starsNear.map((s, i) => (
        <div key={`sn${i}`} className="absolute rounded-full"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.size}px`, height: `${s.size}px`,
            background: s.blue ? '#8b9cf8' : '#f0f2ff', opacity: s.opacity,
            boxShadow: s.size > 2 ? `0 0 ${s.size * 4}px rgba(139,156,248,0.35)` : undefined,
            animation: `mn-twinkle-fast ${s.dur}s ease-in-out ${s.delay}s infinite` }} />
      ))}
      {/* Nebula breathing clouds */}
      {nebulae.map((n, i) => (
        <div key={`nb${i}`} className="absolute rounded-full"
          style={{ left: `${n.x}%`, top: `${n.y}%`, width: `${n.w}px`, height: `${n.h}px`,
            background: `radial-gradient(ellipse, rgba(${n.color},${n.opacity}), transparent 60%)`,
            filter: 'blur(28px)',
            animation: `mn-breathe ${n.dur}s ease-in-out ${n.delay + n.extraDelay}s infinite` }} />
      ))}
      {/* Crescent moon upper-right */}
      <div className="absolute" style={{ top: '6%', right: '8%', width: '52px', height: '52px' }}>
        {/* Outer glow halo */}
        <div className="absolute rounded-full" style={{
          top: '-30%', left: '-30%', width: '160%', height: '160%',
          background: 'radial-gradient(circle, rgba(180,200,255,0.07), transparent 55%)',
          filter: 'blur(8px)', animation: 'mn-moon-glow 9s ease-in-out infinite',
        }} />
        <svg viewBox="0 0 52 52" className="w-full h-full">
          {/* Full circle */}
          <circle cx="26" cy="26" r="22" fill="rgba(210,220,255,0.16)" />
          {/* Inner shadow cutout to make crescent */}
          <circle cx="34" cy="22" r="19" fill="rgba(8,8,22,0.92)" />
          {/* Soft inner edge */}
          <circle cx="26" cy="26" r="22" fill="none" stroke="rgba(180,200,255,0.08)" strokeWidth="1" />
        </svg>
      </div>
      {/* SVG: constellation lines + shooting stars */}
      <svg className="absolute inset-0 w-full h-full" style={{ overflow: 'visible' }}>
        {constellationLines.map((l, i) => (
          <line key={`cl${i}`} x1={`${l.x1}%`} y1={`${l.y1}%`} x2={`${l.x2}%`} y2={`${l.y2}%`}
            stroke="rgba(139,156,248,0.07)" strokeWidth="0.6"
            style={{ animation: `mn-line ${l.dur}s ease-in-out ${l.delay}s infinite` }} />
        ))}
        {/* Constellation node dots */}
        {[
          [12,18],[22,10],[30,20],[65,30],[75,30],[70,25],[70,35],
          [8,62],[14,55],[20,63],[26,56],[32,64],[48,15],[56,22],[62,16],[82,42],[90,50],
        ].map(([x,y], i) => (
          <circle key={`cn${i}`} cx={`${x}%`} cy={`${y}%`} r="1.2"
            fill="rgba(180,196,255,0.25)"
            style={{ animation: `mn-twinkle ${8 + i * 1.1}s ease-in-out ${i * 0.7}s infinite` }} />
        ))}
        {/* Shooting stars */}
        {shooters.map((s, i) => (
          <g key={`sh${i}`} style={{ animation: `mn-shoot ${s.dur}s ease-in ${s.delay}s infinite`, opacity: 0 }}>
            <line
              x1={`${s.x}%`} y1={`${s.y}%`}
              x2={`${s.x + 12}%`} y2={`${s.y + 7}%`}
              stroke={`url(#shooter-grad-${i})`} strokeWidth="1.2" strokeLinecap="round" />
            <defs>
              <linearGradient id={`shooter-grad-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(255,255,255,0)" />
                <stop offset="100%" stopColor="rgba(200,215,255,0.7)" />
              </linearGradient>
            </defs>
          </g>
        ))}
      </svg>
      {/* Faint horizon warm glow */}
      <div className="absolute bottom-0 left-0 right-0 h-[18%]"
        style={{ background: 'linear-gradient(to top, rgba(80,60,120,0.06), transparent)', filter: 'blur(4px)' }} />
      <style>{`
        @keyframes mn-twinkle-fast { 0%,100%{opacity:inherit} 35%{opacity:0.04} 65%{opacity:0.04} }
        @keyframes mn-twinkle      { 0%,100%{opacity:inherit} 40%{opacity:0.06} 60%{opacity:0.06} }
        @keyframes mn-twinkle-slow { 0%,100%{opacity:inherit} 45%{opacity:0.02} 55%{opacity:0.02} }
        @keyframes mn-breathe      { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.35);opacity:0.5} }
        @keyframes mn-line         { 0%,100%{opacity:1} 50%{opacity:0.1} }
        @keyframes mn-moon-glow    { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(1.2)} }
        @keyframes mn-shoot        { 0%{opacity:0;transform:translateX(0) translateY(0)} 8%{opacity:1} 80%{opacity:0.6} 100%{opacity:0;transform:translateX(120px) translateY(70px)} }
      `}</style>
    </Shell>
  );
}

/* ── Obsidian: Crystal facets, light sweeps, geometric reflections ── */
function ObsidianBg() {
  const facets = useMemo(() => {
    const rand = seededRand(44);
    return Array.from({ length: 22 }, () => ({
      x: rand() * 95, y: rand() * 95,
      size: 35 + rand() * 90,
      rot: rand() * 360,
      dur: 5 + rand() * 9,
      delay: rand() * 7,
      colorIdx: Math.floor(rand() * 3),
    }));
  }, []);
  const cracks = useMemo(() => {
    const rand = seededRand(144);
    return Array.from({ length: 8 }, () => ({
      x1: 10 + rand() * 80, y1: 10 + rand() * 80,
      x2: 15 + rand() * 75, y2: 15 + rand() * 75,
      dur: 4 + rand() * 6, delay: rand() * 8,
    }));
  }, []);
  const shatterParticles = useMemo(() => {
    const rand = seededRand(244);
    return Array.from({ length: 28 }, () => ({
      x: rand() * 100, y: rand() * 100,
      size: 1 + rand() * 3,
      dur: 2 + rand() * 4, delay: rand() * 10,
    }));
  }, []);
  const diamonds = useMemo(() => {
    const rand = seededRand(344);
    return Array.from({ length: 5 }, () => ({
      x: 10 + rand() * 80, y: 10 + rand() * 80,
      size: 30 + rand() * 55,
      dur: 12 + rand() * 18, delay: rand() * 8,
    }));
  }, []);
  const sweepAngles = [-22, -12, -4, 6, 16, 26];
  const sweepColors = [
    ['167,139,250', '255,255,255', '167,139,250'],
    ['180,160,255', '240,230,255', '180,160,255'],
    ['120,100,220', '200,190,255', '120,100,220'],
    ['167,139,250', '210,200,255', '167,139,250'],
    ['200,180,255', '255,255,255', '200,180,255'],
    ['130,110,230', '190,180,255', '130,110,230'],
  ];
  return (
    <Shell>
      {/* 6 diagonal prismatic light sweeps */}
      {sweepAngles.map((angle, i) => (
        <div key={`sw${i}`} className="absolute"
          style={{ width: '260%', height: '80px', top: `${10 + i * 16}%`, left: '-80%',
            background: `linear-gradient(90deg, transparent 15%, rgba(${sweepColors[i][0]},0.04) 38%, rgba(${sweepColors[i][1]},${0.08 + i * 0.018}) 50%, rgba(${sweepColors[i][2]},0.04) 62%, transparent 85%)`,
            transform: `rotate(${angle}deg)`,
            animation: `ob-sweep ${5.5 + i * 2.2}s ease-in-out ${i * 1.3}s infinite` }} />
      ))}
      {/* Crystal facets with pentagon clip-path and inner shine */}
      {facets.map((f, i) => {
        const faceColors = ['rgba(167,139,250,', 'rgba(200,180,255,', 'rgba(130,100,230,'];
        const baseOpacity = 0.05 + (i % 4) * 0.025;
        return (
          <div key={`f${i}`} className="absolute"
            style={{ left: `${f.x}%`, top: `${f.y}%`, width: `${f.size}px`, height: `${f.size}px`,
              transform: `rotate(${f.rot}deg)`,
              clipPath: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)',
              animation: `ob-facet ${f.dur}s ease-in-out ${f.delay}s infinite`,
              background: `linear-gradient(${120 + f.rot * 0.3}deg, transparent 20%, ${faceColors[f.colorIdx]}${baseOpacity}) 48%, rgba(255,255,255,${baseOpacity * 0.6}) 54%, ${faceColors[f.colorIdx]}${baseOpacity * 0.4}) 62%, transparent 78%)` }} />
        );
      })}
      {/* Spinning wireframe diamonds */}
      <svg className="absolute inset-0 w-full h-full">
        {diamonds.map((d, i) => (
          <g key={`dia${i}`} style={{ animation: `ob-spin ${d.dur}s linear ${d.delay}s infinite`, transformOrigin: `${d.x}% ${d.y}%` }}>
            <rect
              x={`calc(${d.x}% - ${d.size / 2}px)`}
              y={`calc(${d.y}% - ${d.size / 2}px)`}
              width={d.size} height={d.size}
              fill="none" stroke="rgba(167,139,250,0.07)" strokeWidth="0.8"
              transform={`rotate(45, ${d.x * 10}, ${d.y * 10})`} />
          </g>
        ))}
        {/* Crack lines with glow */}
        {cracks.map((c, i) => (
          <g key={`cr${i}`}>
            <line x1={`${c.x1}%`} y1={`${c.y1}%`} x2={`${c.x2}%`} y2={`${c.y2}%`}
              stroke="rgba(130,100,220,0.09)" strokeWidth="2"
              style={{ filter: 'drop-shadow(0 0 3px rgba(167,139,250,0.12))', animation: `ob-crack ${c.dur}s ease-in-out ${c.delay}s infinite` }} />
            <line x1={`${c.x1}%`} y1={`${c.y1}%`} x2={`${c.x2}%`} y2={`${c.y2}%`}
              stroke="rgba(200,180,255,0.04)" strokeWidth="1" />
          </g>
        ))}
        {/* Prismatic refraction beams from focal point (70%, 30%) */}
        {[0, 35, 65, 110, 155, 200, 245, 300].map((a, i) => {
          const rad = a * Math.PI / 180;
          const len = 25 + i * 3;
          return (
            <line key={`rb${i}`}
              x1="70%" y1="28%"
              x2={`calc(70% + ${Math.cos(rad) * len}px)`}
              y2={`calc(28% + ${Math.sin(rad) * len}px)`}
              stroke={`rgba(${[
                '167,139,250','180,160,255','140,120,240','200,180,255',
                '160,140,245','190,170,255','150,130,235','210,190,255',
              ][i]},0.06)`}
              strokeWidth="0.8"
              style={{ animation: `ob-refract ${6 + i * 0.8}s ease-in-out ${i * 0.5}s infinite` }} />
          );
        })}
      </svg>
      {/* Shatter particles */}
      {shatterParticles.map((p, i) => (
        <div key={`sp${i}`} className="absolute rounded-sm"
          style={{ left: `${p.x}%`, top: `${p.y}%`, width: `${p.size}px`, height: `${p.size * 0.6}px`,
            background: i % 3 === 0 ? 'rgba(200,180,255,0.5)' : i % 3 === 1 ? 'rgba(255,255,255,0.35)' : 'rgba(167,139,250,0.45)',
            transform: `rotate(${i * 37}deg)`,
            animation: `ob-shatter ${p.dur}s ease-in-out ${p.delay}s infinite` }} />
      ))}
      {/* Breathing center glow: purple <-> silver */}
      <div className="absolute w-[550px] h-[550px] top-[42%] left-[50%] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(167,139,250,0.07), transparent 50%)', filter: 'blur(30px)', animation: 'ob-center-glow 16s ease-in-out infinite' }} />
      <div className="absolute w-[300px] h-[300px] top-[42%] left-[50%] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(220,215,240,0.05), transparent 50%)', filter: 'blur(15px)', animation: 'ob-center-silver 16s ease-in-out 8s infinite' }} />
      <style>{`
        @keyframes ob-sweep       { 0%,100%{transform:rotate(var(--ob-ang,0deg)) translateX(-28%);opacity:0.6} 50%{transform:rotate(var(--ob-ang,0deg)) translateX(28%);opacity:1} }
        @keyframes ob-facet       { 0%,100%{opacity:0.25} 50%{opacity:0.9} }
        @keyframes ob-crack       { 0%,100%{opacity:0.4} 50%{opacity:1.0} }
        @keyframes ob-spin        { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
        @keyframes ob-refract     { 0%,100%{opacity:0.3} 50%{opacity:1} }
        @keyframes ob-shatter     { 0%,100%{opacity:0;transform:rotate(var(--rot,0deg)) scale(0.5)} 40%{opacity:0.6;transform:rotate(var(--rot,0deg)) scale(1.2)} 60%{opacity:0.6} }
        @keyframes ob-center-glow { 0%,100%{opacity:1;transform:translate(-50%,-50%) scale(1)} 50%{opacity:0.4;transform:translate(-50%,-50%) scale(1.4)} }
        @keyframes ob-center-silver{ 0%,100%{opacity:0} 50%{opacity:1} }
      `}</style>
    </Shell>
  );
}

/* ── Nord: Aurora borealis curtains, frost particles, polar sky ── */
function NordBg() {
  const frost = useMemo(() => {
    const rand = seededRand(22);
    return Array.from({ length: 52 }, () => ({
      x: rand() * 100, y: rand() * 70,
      size: 0.8 + rand() * 2.5,
      dur: 4 + rand() * 7,
      delay: rand() * 9,
      color: Math.floor(rand() * 3),
    }));
  }, []);
  const snowflakes = useMemo(() => {
    const rand = seededRand(122);
    return Array.from({ length: 44 }, () => ({
      x: rand() * 100,
      size: 2 + rand() * 4,
      dur: 8 + rand() * 14,
      delay: rand() * 16,
      drift: (rand() - 0.5) * 60,
      opacity: 0.1 + rand() * 0.22,
    }));
  }, []);
  const hexCrystals = useMemo(() => {
    const rand = seededRand(222);
    return Array.from({ length: 6 }, () => ({
      x: 5 + rand() * 90, y: 5 + rand() * 55,
      size: 18 + rand() * 30,
      dur: 10 + rand() * 14, delay: rand() * 9,
      rot: rand() * 60,
    }));
  }, []);
  const auroraColors = ['#88c0d0','#81a1c1','#5e81ac','#a3be8c','#b48ead','#8fbcbb','#8ec07c'];
  const auroraBands = [
    { color: '#88c0d0', top: '-6%', h: '52%', delay: '0s', dur: '10s' },
    { color: '#a3be8c', top: '2%',  h: '42%', delay: '2s', dur: '13s' },
    { color: '#5e81ac', top: '-4%', h: '58%', delay: '4.5s', dur: '16s' },
    { color: '#b48ead', top: '3%',  h: '38%', delay: '7s', dur: '12s' },
    { color: '#ebcb8b', top: '1%',  h: '30%', delay: '9s', dur: '14s' },
    { color: '#81a1c1', top: '-2%', h: '45%', delay: '3s', dur: '11s' },
    { color: '#bf616a', top: '5%',  h: '28%', delay: '11s', dur: '15s' },
  ];
  return (
    <Shell>
      {/* Mountain silhouette */}
      <svg className="absolute bottom-0 left-0 right-0 w-full" viewBox="0 0 1000 180" preserveAspectRatio="none" style={{ height: '22%' }}>
        <defs>
          <linearGradient id="nd-mountain-edge" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5e81ac" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#2e3440" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Back range */}
        <path d="M0,180 L0,120 L80,60 L160,90 L260,30 L360,80 L440,40 L520,85 L620,25 L720,75 L800,45 L880,80 L960,50 L1000,70 L1000,180 Z"
          fill="rgba(36,40,59,0.55)" />
        {/* Blue edge highlight */}
        <path d="M0,120 L80,60 L160,90 L260,30 L360,80 L440,40 L520,85 L620,25 L720,75 L800,45 L880,80 L960,50 L1000,70"
          fill="none" stroke="url(#nd-mountain-edge)" strokeWidth="1.5" />
        {/* Front range */}
        <path d="M0,180 L0,145 L60,100 L130,125 L200,85 L300,110 L390,70 L480,105 L560,80 L650,115 L730,88 L820,120 L900,95 L970,115 L1000,100 L1000,180 Z"
          fill="rgba(28,32,48,0.72)" />
      </svg>
      {/* Aurora bands */}
      {auroraBands.map((band, i) => (
        <div key={i} className="absolute left-0 right-0"
          style={{ top: band.top, height: band.h,
            background: `linear-gradient(180deg, ${band.color}30 0%, ${band.color}16 40%, transparent 100%)`,
            animation: `nd-wave ${band.dur} ease-in-out ${band.delay} infinite`,
            filter: 'blur(28px)' }} />
      ))}
      {/* 12 vertical curtain columns */}
      {Array.from({ length: 12 }, (_, i) => (
        <div key={`col${i}`} className="absolute top-0"
          style={{ left: `${2 + i * 8}%`, width: '5%', height: '58%',
            background: `linear-gradient(180deg, ${auroraColors[i % auroraColors.length]}1e, transparent)`,
            animation: `nd-col ${3.5 + i * 1.1}s ease-in-out ${i * 0.7}s infinite`,
            filter: 'blur(10px)' }} />
      ))}
      {/* Frost particles */}
      {frost.map((f, i) => (
        <div key={`fr${i}`} className="absolute rounded-full"
          style={{ left: `${f.x}%`, top: `${f.y}%`, width: `${f.size}px`, height: `${f.size}px`,
            background: ['#88c0d0', '#81a1c1', '#8fbcbb'][f.color],
            opacity: 0.12 + (i % 4) * 0.06,
            animation: `nd-frost ${f.dur}s ease-in-out ${f.delay}s infinite` }} />
      ))}
      {/* Falling snowflakes */}
      {snowflakes.map((s, i) => (
        <div key={`snow${i}`} className="absolute rounded-full opacity-0"
          style={{ left: `${s.x}%`, top: '-3%', width: `${s.size}px`, height: `${s.size}px`,
            background: 'rgba(236,239,244,0.7)',
            boxShadow: '0 0 3px rgba(236,239,244,0.4)',
            animation: `nd-snow ${s.dur}s linear ${s.delay}s infinite`,
            ['--snow-drift' as string]: `${s.drift}px` }} />
      ))}
      {/* Ice crystal hexagons */}
      <svg className="absolute inset-0 w-full h-full">
        {hexCrystals.map((h, i) => (
          <g key={`hx${i}`}
            style={{ animation: `nd-crystal ${h.dur}s ease-in-out ${h.delay}s infinite`, transformOrigin: `${h.x}% ${h.y}%` }}>
            <polygon
              points={`${h.x * 10},${h.y * 10 - h.size} ${h.x * 10 + h.size * 0.866},${h.y * 10 - h.size * 0.5} ${h.x * 10 + h.size * 0.866},${h.y * 10 + h.size * 0.5} ${h.x * 10},${h.y * 10 + h.size} ${h.x * 10 - h.size * 0.866},${h.y * 10 + h.size * 0.5} ${h.x * 10 - h.size * 0.866},${h.y * 10 - h.size * 0.5}`}
              fill="none" stroke="rgba(136,192,208,0.1)" strokeWidth="0.8"
              transform={`rotate(${h.rot}, ${h.x * 10}, ${h.y * 10})`} />
          </g>
        ))}
        {/* Northern star with cross-flare */}
        <g style={{ animation: 'nd-star 5s ease-in-out infinite', transformOrigin: '82% 5%' }}>
          <circle cx="82%" cy="5%" r="3" fill="rgba(236,239,244,0.55)" />
          <line x1="82%" y1="1%" x2="82%" y2="9%" stroke="rgba(236,239,244,0.3)" strokeWidth="0.8" />
          <line x1="78%" y1="5%" x2="86%" y2="5%" stroke="rgba(236,239,244,0.3)" strokeWidth="0.8" />
          <line x1="79.2%" y1="2.2%" x2="84.8%" y2="7.8%" stroke="rgba(236,239,244,0.15)" strokeWidth="0.6" />
          <line x1="84.8%" y1="2.2%" x2="79.2%" y2="7.8%" stroke="rgba(236,239,244,0.15)" strokeWidth="0.6" />
        </g>
      </svg>
      {/* Subtle grid lines */}
      <div className="absolute inset-0 opacity-[0.03]"
        style={{ background: 'repeating-linear-gradient(90deg, transparent, transparent 80px, rgba(136,192,208,0.2) 80px, rgba(136,192,208,0.2) 81px)' }} />
      <style>{`
        @keyframes nd-wave    { 0%,100%{transform:scaleY(1) translateY(0);opacity:1} 30%{transform:scaleY(1.8) translateY(-8%);opacity:0.5} 70%{transform:scaleY(0.55) translateY(5%);opacity:1.2} }
        @keyframes nd-col     { 0%,100%{transform:scaleY(1);opacity:1} 50%{transform:scaleY(2.5);opacity:0.2} }
        @keyframes nd-frost   { 0%,100%{opacity:inherit;transform:translateY(0)} 50%{opacity:0.04;transform:translateY(-9px)} }
        @keyframes nd-snow    { 0%{opacity:0;transform:translateY(0) translateX(0)} 8%{opacity:inherit} 90%{opacity:0.15} 100%{opacity:0;transform:translateY(110vh) translateX(var(--snow-drift))} }
        @keyframes nd-crystal { 0%,100%{opacity:0.6;transform:rotate(0deg)} 50%{opacity:1;transform:rotate(30deg)} }
        @keyframes nd-star    { 0%,100%{opacity:0.55;transform:scale(1)} 50%{opacity:1;transform:scale(1.3)} }
      `}</style>
    </Shell>
  );
}

/* ── Gruvbox: Heat waves, rising embers, lava cracks ── */
function GruvboxBg() {
  const embers = useMemo(() => {
    const rand = seededRand(73);
    return Array.from({ length: 78 }, (_, i) => ({
      x: rand() * 100,
      size: i < 20 ? (0.6 + rand() * 1.2) : i < 55 ? (1.5 + rand() * 2.5) : (3 + rand() * 4.5),
      dur: i < 20 ? (1.2 + rand() * 1.8) : i < 55 ? (2.5 + rand() * 4) : (4 + rand() * 6),
      delay: rand() * 10,
      drift: (rand() - 0.5) * 80,
      color: rand() > 0.55 ? '#d79921' : rand() > 0.3 ? '#d65d0e' : '#cc241d',
    }));
  }, []);
  const ash = useMemo(() => {
    const rand = seededRand(173);
    return Array.from({ length: 20 }, () => ({
      x: rand() * 100,
      size: 1.5 + rand() * 3,
      dur: 12 + rand() * 18,
      delay: rand() * 12,
      drift: (rand() - 0.5) * 40,
    }));
  }, []);
  const lavaPoolPositions = [18, 50, 80];
  return (
    <Shell>
      {/* 4 layered heat glow zones */}
      <div className="absolute bottom-0 left-0 right-0 h-[62%]"
        style={{ background: 'linear-gradient(to top, rgba(215,153,33,0.18), rgba(214,93,14,0.06) 45%, transparent)', animation: 'gv-glow 4s ease-in-out infinite' }} />
      <div className="absolute bottom-0 left-[5%] right-[5%] h-[45%]"
        style={{ background: 'radial-gradient(ellipse at bottom, rgba(214,93,14,0.15), transparent 60%)', animation: 'gv-glow 5.5s ease-in-out 1.2s infinite' }} />
      <div className="absolute bottom-0 left-[20%] right-[20%] h-[32%]"
        style={{ background: 'radial-gradient(ellipse at bottom, rgba(204,36,29,0.12), transparent 55%)', animation: 'gv-glow 4.5s ease-in-out 2.4s infinite' }} />
      <div className="absolute bottom-0 left-[35%] right-[35%] h-[20%]"
        style={{ background: 'radial-gradient(ellipse at bottom, rgba(255,180,50,0.09), transparent 50%)', animation: 'gv-glow 3.5s ease-in-out 3.6s infinite' }} />
      {/* Glowing coal bed strip */}
      <div className="absolute bottom-0 left-0 right-0 h-[3px]"
        style={{ background: 'linear-gradient(90deg, transparent 5%, rgba(215,153,33,0.35) 20%, rgba(255,200,60,0.5) 50%, rgba(215,153,33,0.35) 80%, transparent 95%)', filter: 'blur(1px)', animation: 'gv-coal 3s ease-in-out infinite' }} />
      {/* Molten lava pools */}
      {lavaPoolPositions.map((pos, i) => (
        <div key={`pool${i}`} className="absolute bottom-0"
          style={{ left: `${pos - 12}%`, width: '24%', height: '6%',
            background: `radial-gradient(ellipse at center bottom, rgba(255,${160 - i * 20},30,0.22), rgba(214,93,14,0.1) 50%, transparent 75%)`,
            filter: 'blur(3px)', animation: `gv-pool ${4 + i * 1.5}s ease-in-out ${i * 1.2}s infinite` }} />
      ))}
      {/* 8 lava crack lines */}
      {[8, 18, 30, 43, 55, 67, 78, 90].map((x, i) => (
        <div key={`c${i}`} className="absolute bottom-0"
          style={{ left: `${x}%`, width: '2px', height: `${12 + i * 5}%`,
            background: `linear-gradient(to top, rgba(${i % 3 === 0 ? '215,153,33' : i % 3 === 1 ? '214,93,14' : '204,36,29'},${0.28 - i * 0.012}), transparent)`,
            filter: 'blur(1.5px)',
            boxShadow: `0 0 6px rgba(215,153,33,0.12)`,
            animation: `gv-crack ${2.5 + i * 1.1}s ease-in-out ${i * 0.55}s infinite` }} />
      ))}
      {/* Heat distortion shimmer */}
      <div className="absolute bottom-0 left-0 right-0 h-[30%]"
        style={{ animation: 'gv-shimmer 1.8s ease-in-out infinite', filter: 'blur(2px)',
          background: 'linear-gradient(to top, rgba(215,100,14,0.03), transparent)' }} />
      {/* 5 smoke wisps */}
      {[12, 28, 46, 62, 80].map((x, i) => (
        <div key={`sm${i}`} className="absolute"
          style={{ left: `${x}%`, bottom: '8%', width: `${30 + i * 8}px`, height: '20%',
            background: `radial-gradient(ellipse at center bottom, rgba(80,60,40,0.06), transparent 65%)`,
            filter: 'blur(12px)',
            animation: `gv-smoke ${6 + i * 2}s ease-out ${i * 1.4}s infinite` }} />
      ))}
      {/* Embers: tiny fast, medium, large cinders */}
      {embers.map((e, i) => (
        <div key={`em${i}`} className="absolute rounded-full"
          style={{ left: `${e.x}%`, bottom: '0',
            width: `${e.size}px`, height: `${e.size}px`,
            background: e.color, opacity: 0,
            boxShadow: `0 0 ${e.size * 3}px ${e.color}`,
            ['--gv-drift' as string]: `${e.drift}px`,
            animation: `gv-rise ${e.dur}s ease-out ${e.delay}s infinite` }} />
      ))}
      {/* Ash particles drifting down */}
      {ash.map((a, i) => (
        <div key={`ash${i}`} className="absolute rounded-full opacity-0"
          style={{ left: `${a.x}%`, top: '-2%', width: `${a.size}px`, height: `${a.size}px`,
            background: `rgba(${120 + i * 3},${100 + i * 2},${80 + i},0.35)`,
            ['--ash-drift' as string]: `${a.drift}px`,
            animation: `gv-ash ${a.dur}s linear ${a.delay}s infinite` }} />
      ))}
      <style>{`
        @keyframes gv-glow   { 0%,100%{opacity:1} 50%{opacity:1.5} }
        @keyframes gv-coal   { 0%,100%{opacity:0.6} 50%{opacity:1} }
        @keyframes gv-rise   { 0%{opacity:0.65;transform:translateY(0) translateX(0)} 50%{opacity:0.28} 100%{opacity:0;transform:translateY(-320px) translateX(var(--gv-drift))} }
        @keyframes gv-crack  { 0%,100%{opacity:1} 50%{opacity:0.25} }
        @keyframes gv-shimmer{ 0%,100%{transform:translateX(0) skewX(0deg)} 33%{transform:translateX(2px) skewX(0.3deg)} 66%{transform:translateX(-2px) skewX(-0.3deg)} }
        @keyframes gv-pool   { 0%,100%{opacity:0.7;transform:scaleX(1)} 50%{opacity:1;transform:scaleX(1.08)} }
        @keyframes gv-smoke  { 0%{opacity:0;transform:translateY(0) scaleX(1)} 15%{opacity:0.5} 75%{opacity:0.1} 100%{opacity:0;transform:translateY(-180px) scaleX(2.5)} }
        @keyframes gv-ash    { 0%{opacity:0;transform:translateY(0) translateX(0)} 10%{opacity:0.3} 90%{opacity:0.1} 100%{opacity:0;transform:translateY(110vh) translateX(var(--ash-drift))} }
      `}</style>
    </Shell>
  );
}

/* ── Rose Pine: Falling petals, fireflies, dreamy fog ── */
function RosePineBg() {
  const petalsRound = useMemo(() => {
    const rand = seededRand(55);
    return Array.from({ length: 18 }, () => ({
      x: rand() * 112 - 6, size: 10 + rand() * 12,
      dur: 8 + rand() * 12, delay: rand() * 16,
      drift: (rand() - 0.5) * 90,
      color: rand() > 0.5 ? '#eb6f92' : rand() > 0.3 ? '#c4a7e7' : '#f6c177',
    }));
  }, []);
  const petalsElong = useMemo(() => {
    const rand = seededRand(155);
    return Array.from({ length: 14 }, () => ({
      x: rand() * 112 - 6, size: 7 + rand() * 10,
      dur: 9 + rand() * 11, delay: rand() * 18,
      drift: (rand() - 0.5) * 120,
      color: rand() > 0.5 ? '#eb6f92' : '#c4a7e7',
    }));
  }, []);
  const petalsSmall = useMemo(() => {
    const rand = seededRand(255);
    return Array.from({ length: 12 }, () => ({
      x: rand() * 112 - 6, size: 4 + rand() * 6,
      dur: 6 + rand() * 10, delay: rand() * 14,
      drift: (rand() - 0.5) * 70,
      color: rand() > 0.6 ? '#f6c177' : '#eb6f92',
    }));
  }, []);
  const fireflies = useMemo(() => {
    const rand = seededRand(56);
    return Array.from({ length: 20 }, () => ({
      x: rand() * 100, y: rand() * 95,
      dur: 5 + rand() * 9,
      delay: rand() * 12,
      glowColor: Math.floor(rand() * 3),
    }));
  }, []);
  const windParticles = useMemo(() => {
    const rand = seededRand(356);
    return Array.from({ length: 15 }, () => ({
      y: 5 + rand() * 85, size: 1.5 + rand() * 2.5,
      dur: 4 + rand() * 6, delay: rand() * 10,
      opacity: 0.08 + rand() * 0.14,
    }));
  }, []);
  const dewDrops = useMemo(() => {
    const rand = seededRand(456);
    return Array.from({ length: 8 }, () => ({
      x: rand() * 100, y: 55 + rand() * 35,
      size: 2 + rand() * 3,
      dur: 3 + rand() * 4, delay: rand() * 8,
    }));
  }, []);
  const glowColors = ['rgba(246,193,119,', 'rgba(235,111,146,', 'rgba(196,167,231,'];
  return (
    <Shell>
      {/* 5 fog/mist layers */}
      <div className="absolute w-[650px] h-[400px] top-[18%] right-[-12%] rounded-full"
        style={{ background: 'radial-gradient(ellipse, rgba(235,111,146,0.1), transparent 50%)', filter: 'blur(30px)', animation: 'rp-drift-a 22s ease-in-out infinite' }} />
      <div className="absolute w-[520px] h-[350px] bottom-[8%] left-[-12%] rounded-full"
        style={{ background: 'radial-gradient(ellipse, rgba(196,167,231,0.09), transparent 50%)', filter: 'blur(28px)', animation: 'rp-drift-b 28s ease-in-out infinite' }} />
      <div className="absolute w-[420px] h-[300px] top-[45%] left-[35%] rounded-full"
        style={{ background: 'radial-gradient(ellipse, rgba(246,193,119,0.07), transparent 50%)', filter: 'blur(22px)', animation: 'rp-drift-c 34s ease-in-out 6s infinite' }} />
      <div className="absolute w-[380px] h-[260px] top-[5%] left-[20%] rounded-full"
        style={{ background: 'radial-gradient(ellipse, rgba(235,111,146,0.06), transparent 50%)', filter: 'blur(20px)', animation: 'rp-drift-a 40s ease-in-out 10s infinite reverse' }} />
      <div className="absolute w-[300px] h-[200px] bottom-[25%] right-[10%] rounded-full"
        style={{ background: 'radial-gradient(ellipse, rgba(196,167,231,0.06), transparent 50%)', filter: 'blur(18px)', animation: 'rp-drift-b 30s ease-in-out 4s infinite reverse' }} />
      {/* Moonbeam diagonal shaft from upper-left */}
      <div className="absolute" style={{
        top: '-10%', left: '-5%', width: '60%', height: '80%',
        background: 'linear-gradient(135deg, rgba(246,193,119,0.04) 0%, rgba(235,111,146,0.02) 30%, transparent 60%)',
        filter: 'blur(20px)',
        animation: 'rp-moonbeam 18s ease-in-out infinite',
      }} />
      {/* SVG: branch silhouettes + flower blooms + dew drops */}
      <svg className="absolute inset-0 w-full h-full">
        {/* Branch/vine silhouettes framing edges */}
        <path d="M0,40 Q15,20 25,35 Q35,50 50,30 Q60,15 70,25 Q80,35 90,20"
          fill="none" stroke="rgba(40,30,45,0.4)" strokeWidth="1.5" />
        <path d="M0,60 Q10,45 20,55 Q30,65 45,48 Q55,32 65,42"
          fill="none" stroke="rgba(40,30,45,0.3)" strokeWidth="1" />
        <path d="M100,30 Q88,18 80,28 Q72,38 62,22 Q54,10 44,18"
          fill="none" stroke="rgba(40,30,45,0.35)" strokeWidth="1.3" />
        <path d="M0,85 Q12,75 22,82 Q32,89 42,78"
          fill="none" stroke="rgba(40,30,45,0.25)" strokeWidth="1" />
        {/* Flower bloom clusters: 6 positions */}
        {[
          [20, 28], [48, 22], [70, 18], [85, 24], [10, 52], [62, 38],
        ].map(([cx, cy], i) => (
          <g key={`bloom${i}`} style={{ animation: `rp-bloom ${3 + i * 0.8}s ease-in-out ${i * 1.2}s infinite`, transformOrigin: `${cx}% ${cy}%` }}>
            {[0, 90, 180, 270].map((a) => {
              const rad = a * Math.PI / 180;
              const r = 3;
              return (
                <circle key={a} cx={`${cx + Math.cos(rad) * r}%`} cy={`${cy + Math.sin(rad) * r}%`} r="1.5"
                  fill={i % 3 === 0 ? 'rgba(235,111,146,0.35)' : i % 3 === 1 ? 'rgba(196,167,231,0.35)' : 'rgba(246,193,119,0.35)'} />
              );
            })}
            <circle cx={`${cx}%`} cy={`${cy}%`} r="1"
              fill={i % 3 === 0 ? 'rgba(246,193,119,0.5)' : 'rgba(235,111,146,0.5)'} />
          </g>
        ))}
        {/* Dew drops on branches */}
        {dewDrops.map((d, i) => (
          <circle key={`dew${i}`} cx={`${d.x}%`} cy={`${d.y}%`} r={d.size}
            fill="rgba(255,255,255,0.08)"
            stroke="rgba(246,193,119,0.2)" strokeWidth="0.5"
            style={{ animation: `rp-dew ${d.dur}s ease-in-out ${d.delay}s infinite` }} />
        ))}
      </svg>
      {/* Round petals */}
      {petalsRound.map((p, i) => (
        <div key={`pr${i}`} className="absolute opacity-0"
          style={{ left: `${p.x}%`, top: '-4%',
            width: `${p.size}px`, height: `${p.size}px`,
            background: p.color, borderRadius: '50%',
            opacity: 0, filter: 'blur(0.5px)',
            animation: `rp-fall ${p.dur}s ease-in-out ${p.delay}s infinite`,
            ['--rp-drift' as string]: `${p.drift}px` }} />
      ))}
      {/* Elongated petals */}
      {petalsElong.map((p, i) => (
        <div key={`pe${i}`} className="absolute opacity-0"
          style={{ left: `${p.x}%`, top: '-4%',
            width: `${p.size * 0.45}px`, height: `${p.size}px`,
            background: p.color, borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%',
            opacity: 0,
            animation: `rp-fall ${p.dur}s ease-in-out ${p.delay}s infinite`,
            ['--rp-drift' as string]: `${p.drift}px` }} />
      ))}
      {/* Small petals */}
      {petalsSmall.map((p, i) => (
        <div key={`ps${i}`} className="absolute opacity-0"
          style={{ left: `${p.x}%`, top: '-4%',
            width: `${p.size}px`, height: `${p.size * 0.7}px`,
            background: p.color, borderRadius: '50% 0 50% 0',
            opacity: 0,
            animation: `rp-fall ${p.dur}s ease-in-out ${p.delay}s infinite`,
            ['--rp-drift' as string]: `${p.drift}px` }} />
      ))}
      {/* Fireflies with glow halos */}
      {fireflies.map((f, i) => (
        <div key={`ff${i}`} className="absolute"
          style={{ left: `${f.x}%`, top: `${f.y}%`, animation: `rp-fly ${f.dur}s ease-in-out ${f.delay}s infinite`, opacity: 0 }}>
          {/* Outer diffuse halo */}
          <div className="absolute rounded-full"
            style={{ top: '-6px', left: '-6px', width: '14px', height: '14px',
              background: `radial-gradient(circle, ${glowColors[f.glowColor]}0.12), transparent 70%)`,
              filter: 'blur(4px)' }} />
          {/* Core dot */}
          <div className="absolute rounded-full"
            style={{ width: '3px', height: '3px',
              background: f.glowColor === 0 ? '#f6c177' : f.glowColor === 1 ? '#eb6f92' : '#c4a7e7',
              boxShadow: `0 0 6px ${f.glowColor === 0 ? '#f6c177' : f.glowColor === 1 ? '#eb6f92' : '#c4a7e7'}` }} />
        </div>
      ))}
      {/* Wind-blown horizontal particles */}
      {windParticles.map((w, i) => (
        <div key={`wp${i}`} className="absolute rounded-full"
          style={{ left: '-2%', top: `${w.y}%`, width: `${w.size}px`, height: `${w.size}px`,
            background: i % 3 === 0 ? 'rgba(246,193,119,0.5)' : i % 3 === 1 ? 'rgba(235,111,146,0.5)' : 'rgba(196,167,231,0.5)',
            opacity: 0, animation: `rp-wind ${w.dur}s linear ${w.delay}s infinite` }} />
      ))}
      <style>{`
        @keyframes rp-fall      { 0%{opacity:0;transform:translateY(0) translateX(0) rotate(0deg)} 8%{opacity:0.28} 88%{opacity:0.14} 100%{opacity:0;transform:translateY(110vh) translateX(var(--rp-drift)) rotate(720deg)} }
        @keyframes rp-drift-a   { 0%,100%{transform:translate(0,0)} 33%{transform:translate(-28px,18px)} 66%{transform:translate(14px,-12px)} }
        @keyframes rp-drift-b   { 0%,100%{transform:translate(0,0)} 33%{transform:translate(22px,-16px)} 66%{transform:translate(-18px,12px)} }
        @keyframes rp-drift-c   { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-16px,20px)} }
        @keyframes rp-fly       { 0%,100%{opacity:0;transform:translate(0,0)} 15%{opacity:0.55} 50%{opacity:0.3;transform:translate(18px,-14px)} 80%{opacity:0.55} }
        @keyframes rp-wind      { 0%{opacity:0;left:-2%} 10%{opacity:inherit} 90%{opacity:inherit} 100%{opacity:0;left:102%} }
        @keyframes rp-bloom     { 0%,100%{opacity:0.4;transform:scale(0.9)} 50%{opacity:0.9;transform:scale(1.15)} }
        @keyframes rp-dew       { 0%,100%{opacity:0.5;r:inherit} 50%{opacity:1;r:inherit} }
        @keyframes rp-moonbeam  { 0%,100%{opacity:0.6} 50%{opacity:1} }
      `}</style>
    </Shell>
  );
}

/* ── Abyss: Deep ocean, bioluminescence, caustic light, bubbles ── */
function AbyssBg() {
  const orbs = useMemo(() => {
    const rand = seededRand(88);
    return Array.from({ length: 36 }, (_, i) => ({
      x: rand() * 100, y: rand() * 100,
      size: i < 12 ? (3 + rand() * 6) : i < 28 ? (6 + rand() * 12) : (14 + rand() * 10),
      dur: 4 + rand() * 9,
      delay: rand() * 12,
      color: rand() > 0.5 ? '#2dd4bf' : rand() > 0.3 ? '#22d3ee' : '#34d399',
    }));
  }, []);
  const bubbles = useMemo(() => {
    const rand = seededRand(89);
    return Array.from({ length: 30 }, () => ({
      x: rand() * 100,
      size: 2 + rand() * 7,
      dur: 5 + rand() * 10,
      delay: rand() * 14,
      drift: (rand() - 0.5) * 30,
    }));
  }, []);
  const marineSnow = useMemo(() => {
    const rand = seededRand(189);
    return Array.from({ length: 42 }, () => ({
      x: rand() * 100,
      size: 0.8 + rand() * 2,
      dur: 14 + rand() * 22,
      delay: rand() * 18,
      drift: (rand() - 0.5) * 25,
    }));
  }, []);
  const causticLines = useMemo(() => {
    const rand = seededRand(289);
    return Array.from({ length: 10 }, (_, i) => ({
      top: 2 + i * 9 + rand() * 4,
      dur: 3.5 + rand() * 4,
      delay: rand() * 5,
      opacity: 0.06 + rand() * 0.08,
    }));
  }, []);
  // Jellyfish: 3 instances
  const jellies = useMemo(() => {
    const rand = seededRand(389);
    return [
      { x: 15 + rand() * 10, y: 30 + rand() * 20, size: 28 + rand() * 16, dur: 7 + rand() * 5, delay: 0 },
      { x: 55 + rand() * 10, y: 20 + rand() * 25, size: 22 + rand() * 14, dur: 8 + rand() * 5, delay: 3 },
      { x: 78 + rand() * 10, y: 40 + rand() * 20, size: 18 + rand() * 12, dur: 6 + rand() * 5, delay: 5 },
    ];
  }, []);
  // Sonar pings
  const sonars = [
    { x: 30, y: 70, dur: 8, delay: 0 },
    { x: 72, y: 80, dur: 11, delay: 4 },
  ];
  return (
    <Shell>
      {/* 3-layer depth gradient */}
      <div className="absolute inset-0"
        style={{ background: 'linear-gradient(180deg, rgba(45,212,191,0.03) 0%, rgba(34,211,238,0.05) 35%, rgba(20,150,140,0.09) 65%, rgba(10,80,80,0.13) 100%)' }} />
      {/* Water surface caustic ripple pattern at top */}
      <div className="absolute top-0 left-0 right-0 h-[12%]"
        style={{ background: 'repeating-linear-gradient(80deg, transparent, transparent 18px, rgba(45,212,191,0.03) 18px, rgba(45,212,191,0.03) 19px), repeating-linear-gradient(-80deg, transparent, transparent 22px, rgba(34,211,238,0.025) 22px, rgba(34,211,238,0.025) 23px)',
          filter: 'blur(1px)', animation: 'ab-surface 4s ease-in-out infinite' }} />
      {/* Caustic light lines with organic wave */}
      {causticLines.map((c, i) => (
        <div key={`cl${i}`} className="absolute left-[-5%] right-[-5%]"
          style={{ top: `${c.top}%`, height: '2px',
            background: `linear-gradient(90deg, transparent 3%, rgba(45,212,191,${c.opacity * 0.6}) 15%, rgba(45,212,191,${c.opacity}) 40%, rgba(34,211,238,${c.opacity * 1.2}) 50%, rgba(45,212,191,${c.opacity}) 60%, rgba(45,212,191,${c.opacity * 0.6}) 85%, transparent 97%)`,
            filter: 'blur(1.5px)',
            animation: `ab-caustic ${c.dur}s ease-in-out ${c.delay}s infinite` }} />
      ))}
      {/* Bioluminescent orbs: inner bright + outer diffuse */}
      {orbs.map((o, i) => (
        <div key={`o${i}`} className="absolute" style={{ left: `${o.x}%`, top: `${o.y}%`, opacity: 0, animation: `ab-glow ${o.dur}s ease-in-out ${o.delay}s infinite` }}>
          {/* Outer diffuse */}
          <div className="absolute rounded-full"
            style={{ top: `-${o.size * 0.8}px`, left: `-${o.size * 0.8}px`,
              width: `${o.size * 3.6}px`, height: `${o.size * 3.6}px`,
              background: `radial-gradient(circle, ${o.color}28, transparent 60%)`,
              filter: 'blur(4px)' }} />
          {/* Inner bright core */}
          <div className="absolute rounded-full"
            style={{ width: `${o.size}px`, height: `${o.size}px`,
              background: o.color,
              boxShadow: `0 0 ${o.size * 2}px ${o.color}, 0 0 ${o.size * 5}px ${o.color}55` }} />
        </div>
      ))}
      {/* Rising bubbles */}
      {bubbles.map((b, i) => (
        <div key={`b${i}`} className="absolute rounded-full opacity-0"
          style={{ left: `${b.x}%`, bottom: '-4%',
            width: `${b.size}px`, height: `${b.size}px`,
            border: `0.5px solid rgba(45,212,191,${0.1 + (i % 3) * 0.06})`,
            background: `radial-gradient(circle at 30% 30%, rgba(45,212,191,0.08), transparent 60%)`,
            ['--ab-drift' as string]: `${b.drift}px`,
            animation: `ab-bubble ${b.dur}s ease-out ${b.delay}s infinite` }} />
      ))}
      {/* Marine snow */}
      {marineSnow.map((m, i) => (
        <div key={`ms${i}`} className="absolute rounded-full opacity-0"
          style={{ left: `${m.x}%`, top: '-2%',
            width: `${m.size}px`, height: `${m.size}px`,
            background: `rgba(200,240,240,${0.15 + (i % 4) * 0.06})`,
            ['--ab-snow-drift' as string]: `${m.drift}px`,
            animation: `ab-snow ${m.dur}s linear ${m.delay}s infinite` }} />
      ))}
      {/* Jellyfish SVG */}
      {jellies.map((j, i) => (
        <div key={`jf${i}`} className="absolute"
          style={{ left: `${j.x}%`, top: `${j.y}%`, width: `${j.size * 2}px`, height: `${j.size * 2.5}px`,
            animation: `ab-jelly ${j.dur}s ease-in-out ${j.delay}s infinite`, opacity: 0.18 }}>
          <svg viewBox="0 0 60 80" className="w-full h-full">
            <defs>
              <radialGradient id={`jf-grad-${i}`} cx="50%" cy="40%">
                <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.5" />
                <stop offset="60%" stopColor="#22d3ee" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0" />
              </radialGradient>
            </defs>
            {/* Dome */}
            <ellipse cx="30" cy="28" rx="24" ry="20" fill={`url(#jf-grad-${i})`} stroke="rgba(45,212,191,0.25)" strokeWidth="0.8" />
            {/* Inner highlight */}
            <ellipse cx="30" cy="26" rx="16" ry="12" fill="rgba(45,212,191,0.06)" />
            {/* Tentacles */}
            <path d="M18,46 Q14,56 17,66 Q19,72 16,78" fill="none" stroke="rgba(45,212,191,0.2)" strokeWidth="1">
              <animate attributeName="d" values="M18,46 Q14,56 17,66 Q19,72 16,78;M18,46 Q22,56 19,66 Q17,72 20,78;M18,46 Q14,56 17,66 Q19,72 16,78" dur="3s" repeatCount="indefinite" />
            </path>
            <path d="M24,47 Q22,57 25,67 Q27,73 24,78" fill="none" stroke="rgba(45,212,191,0.18)" strokeWidth="1">
              <animate attributeName="d" values="M24,47 Q22,57 25,67 Q27,73 24,78;M24,47 Q26,57 23,67 Q21,73 26,78;M24,47 Q22,57 25,67 Q27,73 24,78" dur="3.5s" repeatCount="indefinite" />
            </path>
            <path d="M36,47 Q38,57 35,67 Q33,73 36,78" fill="none" stroke="rgba(45,212,191,0.18)" strokeWidth="1">
              <animate attributeName="d" values="M36,47 Q38,57 35,67 Q33,73 36,78;M36,47 Q34,57 37,67 Q39,73 34,78;M36,47 Q38,57 35,67 Q33,73 36,78" dur="2.8s" repeatCount="indefinite" />
            </path>
            <path d="M42,46 Q46,56 43,66 Q41,72 44,78" fill="none" stroke="rgba(45,212,191,0.2)" strokeWidth="1">
              <animate attributeName="d" values="M42,46 Q46,56 43,66 Q41,72 44,78;M42,46 Q38,56 41,66 Q43,72 40,78;M42,46 Q46,56 43,66 Q41,72 44,78" dur="3.2s" repeatCount="indefinite" />
            </path>
          </svg>
        </div>
      ))}
      {/* SVG: kelp/seaweed + sonar pings */}
      <svg className="absolute inset-0 w-full h-full">
        {/* 5 kelp silhouettes at bottom */}
        {[5, 18, 35, 62, 82].map((kx, i) => (
          <g key={`kelp${i}`} style={{ animation: `ab-sway ${4 + i * 0.8}s ease-in-out ${i * 0.6}s infinite`, transformOrigin: `${kx}% 100%` }}>
            <path d={`M${kx * 10},1000 Q${kx * 10 - 15},${950 - i * 30} ${kx * 10 + 10},${900 - i * 25} Q${kx * 10 - 8},${850 - i * 20} ${kx * 10 + 5},${800 - i * 35}`}
              fill="none" stroke={`rgba(20,120,100,${0.18 + i * 0.04})`} strokeWidth={2 + (i % 2)} />
          </g>
        ))}
        {/* Sonar pings */}
        {sonars.map((s, i) => (
          <g key={`sonar${i}`}>
            <circle cx={`${s.x}%`} cy={`${s.y}%`} r="0"
              fill="none" stroke="rgba(45,212,191,0.12)" strokeWidth="1">
              <animate attributeName="r" from="0" to="80" dur={`${s.dur}s`} begin={`${s.delay}s`} repeatCount="indefinite" />
              <animate attributeName="opacity" from="0.4" to="0" dur={`${s.dur}s`} begin={`${s.delay}s`} repeatCount="indefinite" />
            </circle>
            <circle cx={`${s.x}%`} cy={`${s.y}%`} r="0"
              fill="none" stroke="rgba(34,211,238,0.08)" strokeWidth="0.8">
              <animate attributeName="r" from="0" to="80" dur={`${s.dur}s`} begin={`${s.delay + s.dur * 0.33}s`} repeatCount="indefinite" />
              <animate attributeName="opacity" from="0.3" to="0" dur={`${s.dur}s`} begin={`${s.delay + s.dur * 0.33}s`} repeatCount="indefinite" />
            </circle>
          </g>
        ))}
      </svg>
      <style>{`
        @keyframes ab-surface  { 0%,100%{transform:translateX(0)} 50%{transform:translateX(6px)} }
        @keyframes ab-caustic  { 0%,100%{transform:translateX(0) scaleX(1);opacity:0.7} 50%{transform:translateX(4%) scaleX(1.08);opacity:1} }
        @keyframes ab-glow     { 0%,100%{opacity:0} 20%{opacity:0.28} 80%{opacity:0.28} }
        @keyframes ab-bubble   { 0%{opacity:0;transform:translateY(0)} 8%{opacity:0.35} 90%{opacity:0.12} 100%{opacity:0;transform:translateY(-110vh) translateX(var(--ab-drift))} }
        @keyframes ab-snow     { 0%{opacity:0;transform:translateY(0) translateX(0)} 10%{opacity:0.4} 90%{opacity:0.15} 100%{opacity:0;transform:translateY(110vh) translateX(var(--ab-snow-drift))} }
        @keyframes ab-jelly    { 0%,100%{transform:translateY(0);opacity:0.18} 50%{transform:translateY(-18px);opacity:0.28} }
        @keyframes ab-sway     { 0%,100%{transform:skewX(0deg)} 50%{transform:skewX(4deg)} }
      `}</style>
    </Shell>
  );
}

/* -- Ember: Volcanic fire, lava rivers, magma pools, cinder vortex -- */
function EmberBg() {
  const sparksSmall = useMemo(() => {
    const rand = seededRand(661);
    return Array.from({ length: 40 }, () => ({
      x: rand() * 100,
      size: 1 + rand() * 1,
      dur: 1.2 + rand() * 1.8,
      delay: rand() * 9,
      drift: (rand() - 0.5) * 60,
    }));
  }, []);
  const sparksMed = useMemo(() => {
    const rand = seededRand(662);
    return Array.from({ length: 28 }, () => ({
      x: rand() * 100,
      size: 2 + rand() * 2,
      dur: 2 + rand() * 2.5,
      delay: rand() * 10,
      drift: (rand() - 0.5) * 90,
      color: rand() > 0.5 ? '#fbbf24' : '#f97316',
    }));
  }, []);
  const sparksLarge = useMemo(() => {
    const rand = seededRand(663);
    return Array.from({ length: 18 }, () => ({
      x: rand() * 100,
      size: 4 + rand() * 2,
      dur: 3 + rand() * 4,
      delay: rand() * 12,
      drift: (rand() - 0.5) * 120,
    }));
  }, []);
  const debris = useMemo(() => {
    const rand = seededRand(664);
    return Array.from({ length: 8 }, () => ({
      x: rand() * 100,
      size: 3 + rand() * 5,
      dur: 4 + rand() * 5,
      delay: rand() * 14,
      rot: rand() * 360,
    }));
  }, []);
  const vortex = useMemo(() => {
    const rand = seededRand(665);
    return Array.from({ length: 16 }, (_, i) => ({
      angle: (i / 16) * 360,
      r: 30 + rand() * 25,
      size: 2 + rand() * 3,
      dur: 3 + rand() * 3,
      delay: rand() * 4,
      color: rand() > 0.5 ? '#fbbf24' : rand() > 0.3 ? '#f97316' : '#ef4444',
    }));
  }, []);
  const smoke = useMemo(() => {
    const rand = seededRand(666);
    return Array.from({ length: 4 }, () => ({
      x: 10 + rand() * 80,
      dur: 18 + rand() * 12,
      delay: rand() * 10,
      w: 60 + rand() * 80,
    }));
  }, []);
  return (
    <Shell>
      {/* Layered volcanic glow */}
      <div className="absolute bottom-0 left-0 right-0 h-[70%]"
        style={{ background: 'linear-gradient(to top, rgba(249,115,22,0.28), rgba(239,68,68,0.12) 40%, transparent)', animation: 'em-heat 3.5s ease-in-out infinite' }} />
      <div className="absolute bottom-0 left-[10%] right-[10%] h-[55%]"
        style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(251,191,36,0.2), transparent 55%)', animation: 'em-heat 5s ease-in-out 1s infinite' }} />
      <div className="absolute bottom-0 left-[20%] right-[20%] h-[45%]"
        style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(239,68,68,0.15), transparent 60%)', animation: 'em-heat 4s ease-in-out 2s infinite' }} />
      <div className="absolute bottom-0 left-[30%] right-[30%] h-[35%]"
        style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(251,191,36,0.22), transparent 65%)', animation: 'em-heat 4.5s ease-in-out 0.5s infinite' }} />
      <div className="absolute bottom-0 left-[38%] right-[38%] h-[28%]"
        style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(255,220,80,0.25), transparent 70%)', animation: 'em-heat 3s ease-in-out 1.8s infinite' }} />
      {/* 10 lava vein rivers */}
      {[6, 14, 22, 33, 44, 54, 63, 72, 82, 91].map((x, i) => (
        <div key={`v${i}`} className="absolute bottom-0"
          style={{ left: `${x}%`, width: `${2 + (i % 3)}px`, height: `${18 + (i % 5) * 6}%`,
            background: `linear-gradient(to top, rgba(${i % 2 === 0 ? '251,191,36' : '249,115,22'},${0.22 - i * 0.01}), transparent)`,
            filter: 'blur(2px)', animation: `em-vein ${3 + i * 0.9}s ease-in-out ${i * 0.55}s infinite` }} />
      ))}
      {/* 5 horizontal lava flows */}
      {[78, 83, 87, 91, 95].map((y, i) => (
        <div key={`h${i}`} className="absolute left-0 right-0"
          style={{ bottom: `${100 - y}%`, height: `${1 + i * 0.5}px`,
            background: `linear-gradient(90deg, transparent 5%, rgba(249,115,22,${0.07 + i * 0.025}) 25%, rgba(251,191,36,${0.12 + i * 0.03}) 50%, rgba(249,115,22,${0.07 + i * 0.025}) 75%, transparent 95%)`,
            animation: `em-flow ${5 + i * 1.8}s ease-in-out ${i * 1.5}s infinite` }} />
      ))}
      {/* 3 magma pool ellipses */}
      {[20, 50, 78].map((x, i) => (
        <div key={`pool${i}`} className="absolute bottom-0"
          style={{ left: `${x - 8}%`, width: '16%', height: '6%',
            background: `radial-gradient(ellipse, rgba(${i % 2 === 0 ? '251,191,36' : '249,115,22'},0.18), transparent 65%)`,
            borderRadius: '50%', filter: 'blur(4px)',
            animation: `em-pool ${2.5 + i * 1.2}s ease-in-out ${i * 0.8}s infinite` }} />
      ))}
      {/* Heat shimmer */}
      <div className="absolute bottom-0 left-0 right-0 h-[40%]"
        style={{ background: 'linear-gradient(to top, rgba(255,160,50,0.04), transparent)', filter: 'blur(1px)', animation: 'em-shimmer 1.8s ease-in-out infinite' }} />
      {/* Smoke columns */}
      {smoke.map((s, i) => (
        <div key={`sm${i}`} className="absolute bottom-[2%]"
          style={{ left: `${s.x}%`, width: `${s.w}px`, height: '60%',
            background: 'linear-gradient(to top, rgba(30,20,20,0.12), rgba(20,15,15,0.05) 40%, transparent)',
            filter: 'blur(18px)', animation: `em-smoke ${s.dur}s ease-in-out ${s.delay}s infinite` }} />
      ))}
      {/* Rock debris */}
      {debris.map((d, i) => (
        <div key={`db${i}`} className="absolute"
          style={{ left: `${d.x}%`, bottom: '0', width: `${d.size}px`, height: `${d.size * 0.7}px`,
            background: 'rgba(30,15,5,0.55)', borderRadius: '2px', opacity: 0,
            transform: `rotate(${d.rot}deg)`,
            animation: `em-debris ${d.dur}s ease-out ${d.delay}s infinite` }} />
      ))}
      {/* Ember vortex focal point */}
      <div className="absolute" style={{ left: '50%', bottom: '12%', width: '0', height: '0' }}>
        {vortex.map((v, i) => {
          const rad = (v.angle * Math.PI) / 180;
          const px = Math.cos(rad) * v.r;
          const py = Math.sin(rad) * v.r;
          return (
            <div key={`vo${i}`} className="absolute rounded-full"
              style={{ left: `${px}px`, top: `${py}px`, width: `${v.size}px`, height: `${v.size}px`,
                background: v.color, opacity: 0,
                boxShadow: `0 0 ${v.size * 3}px ${v.color}`,
                animation: `em-vortex ${v.dur}s ease-in-out ${v.delay}s infinite` }} />
          );
        })}
      </div>
      {/* Small fast sparks */}
      {sparksSmall.map((s, i) => (
        <div key={`ss${i}`} className="absolute rounded-full"
          style={{ left: `${s.x}%`, bottom: '0', width: `${s.size}px`, height: `${s.size}px`,
            background: '#fde68a', opacity: 0,
            boxShadow: '0 0 4px #fbbf24',
            animation: `em-sparkS ${s.dur}s ease-out ${s.delay}s infinite`,
            ['--dr' as string]: `${s.drift}px` }} />
      ))}
      {/* Medium swirling sparks */}
      {sparksMed.map((s, i) => (
        <div key={`smk${i}`} className="absolute rounded-full"
          style={{ left: `${s.x}%`, bottom: '0', width: `${s.size}px`, height: `${s.size}px`,
            background: s.color, opacity: 0,
            boxShadow: `0 0 ${s.size * 3}px ${s.color}`,
            animation: `em-sparkM ${s.dur}s ease-out ${s.delay}s infinite`,
            ['--dr' as string]: `${s.drift}px` }} />
      ))}
      {/* Large floating cinders */}
      {sparksLarge.map((s, i) => (
        <div key={`sl${i}`} className="absolute rounded-full"
          style={{ left: `${s.x}%`, bottom: '0', width: `${s.size}px`, height: `${s.size}px`,
            background: '#ef4444', opacity: 0,
            boxShadow: `0 0 ${s.size * 4}px rgba(239,68,68,0.6)`,
            animation: `em-sparkL ${s.dur}s ease-out ${s.delay}s infinite`,
            ['--dr' as string]: `${s.drift}px` }} />
      ))}
      <style>{`
        @keyframes em-heat { 0%,100%{opacity:1} 50%{opacity:1.35} }
        @keyframes em-vein { 0%,100%{opacity:0.9;transform:scaleY(1)} 50%{opacity:0.35;transform:scaleY(0.8)} }
        @keyframes em-flow { 0%,100%{transform:translateX(-6%) scaleX(1)} 50%{transform:translateX(6%) scaleX(1.08)} }
        @keyframes em-pool { 0%,100%{transform:scaleX(1) scaleY(1);opacity:0.9} 50%{transform:scaleX(1.12) scaleY(1.3);opacity:0.5} }
        @keyframes em-shimmer { 0%,100%{transform:translateX(0) skewX(0deg)} 33%{transform:translateX(2px) skewX(0.3deg)} 66%{transform:translateX(-2px) skewX(-0.3deg)} }
        @keyframes em-smoke { 0%,100%{transform:translateY(0) scaleX(1);opacity:0.7} 50%{transform:translateY(-30px) scaleX(1.4);opacity:0.3} }
        @keyframes em-debris { 0%{opacity:0.5;transform:translateY(0) rotate(0deg)} 20%{opacity:0.4} 100%{opacity:0;transform:translateY(-280px) translateX(40px) rotate(540deg)} }
        @keyframes em-vortex { 0%,100%{opacity:0;transform:translate(-50%,-50%) scale(0.5)} 40%{opacity:0.35;transform:translate(-50%,-50%) scale(1)} 60%{opacity:0.35} }
        @keyframes em-sparkS { 0%{opacity:0.8;transform:translateY(0) translateX(0)} 100%{opacity:0;transform:translateY(-220px) translateX(var(--dr))} }
        @keyframes em-sparkM { 0%{opacity:0.7;transform:translateY(0) translateX(0)} 30%{opacity:0.5} 100%{opacity:0;transform:translateY(-320px) translateX(var(--dr))} }
        @keyframes em-sparkL { 0%{opacity:0.6;transform:translateY(0) translateX(0)} 50%{opacity:0.25} 100%{opacity:0;transform:translateY(-400px) translateX(var(--dr))} }
      `}</style>
    </Shell>
  );
}

/* -- Aurora: Mountain silhouette, star field, rich curtains, electric crackle -- */
function AuroraBg() {
  const stars = useMemo(() => {
    const rand = seededRand(771);
    return Array.from({ length: 85 }, () => ({
      x: rand() * 100, y: rand() * 55,
      size: 0.5 + rand() * 1.5,
      opacity: 0.1 + rand() * 0.5,
      dur: 2 + rand() * 5,
      delay: rand() * 10,
    }));
  }, []);
  const particles = useMemo(() => {
    const rand = seededRand(772);
    return Array.from({ length: 30 }, () => ({
      x: rand() * 100, y: rand() * 55,
      size: 1.5 + rand() * 2.5,
      dur: 3 + rand() * 6,
      delay: rand() * 10,
      color: rand() > 0.4 ? '#a78bfa' : rand() > 0.2 ? '#34d399' : '#22d3ee',
    }));
  }, []);
  const crackles = useMemo(() => {
    const rand = seededRand(773);
    return Array.from({ length: 3 }, () => ({
      x1: 10 + rand() * 80, y1: 5 + rand() * 30,
      x2: 10 + rand() * 80, y2: 10 + rand() * 40,
      dur: 8 + rand() * 8,
      delay: rand() * 12,
    }));
  }, []);
  const cols = useMemo(() => {
    const rand = seededRand(774);
    const palette = ['#a78bfa', '#34d399', '#22d3ee', '#c084fc', '#818cf8', '#6ee7b7', '#e879f9', '#06b6d4', '#8b5cf6', '#10b981', '#7c3aed', '#0ea5e9', '#a855f7', '#14b8a6'];
    return Array.from({ length: 14 }, (_, i) => ({
      left: 1 + i * 7,
      color: palette[i % palette.length],
      dur: 4 + rand() * 5,
      delay: rand() * 4,
      h: 45 + rand() * 20,
    }));
  }, []);
  return (
    <Shell>
      {/* Cosmic dust haze top */}
      <div className="absolute top-0 left-0 right-0 h-[30%]"
        style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(100,60,180,0.06), transparent 70%)', filter: 'blur(8px)' }} />
      {/* Star field */}
      {stars.map((s, i) => (
        <div key={`st${i}`} className="absolute rounded-full"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.size}px`, height: `${s.size}px`,
            background: i % 5 === 0 ? '#c4b5fd' : '#e2e8f0', opacity: s.opacity,
            animation: `au-twinkle ${s.dur}s ease-in-out ${s.delay}s infinite` }} />
      ))}
      {/* 7 aurora curtain bands */}
      {[
        { c1: '#a78bfa', c2: '#34d399', top: '-8%', h: '55%', dur: '9s', delay: '0s' },
        { c1: '#06b6d4', c2: '#a78bfa', top: '0%',  h: '45%', dur: '13s', delay: '2s' },
        { c1: '#818cf8', c2: '#6366f1', top: '-6%',  h: '62%', dur: '17s', delay: '5s' },
        { c1: '#e879f9', c2: '#22d3ee', top: '2%',  h: '42%', dur: '11s', delay: '4s' },
        { c1: '#6366f1', c2: '#34d399', top: '-3%', h: '50%', dur: '15s', delay: '7s' },
        { c1: '#34d399', c2: '#c084fc', top: '4%',  h: '38%', dur: '10s', delay: '3s' },
        { c1: '#7c3aed', c2: '#06b6d4', top: '-2%', h: '48%', dur: '14s', delay: '6s' },
      ].map((c, i) => (
        <div key={i} className="absolute left-0 right-0"
          style={{ top: c.top, height: c.h,
            background: `linear-gradient(180deg, ${c.c1}20 0%, ${c.c2}10 40%, transparent 100%)`,
            animation: `au-curtain ${c.dur} ease-in-out ${c.delay} infinite`,
            filter: 'blur(38px)' }} />
      ))}
      {/* 14 vertical sway columns */}
      {cols.map((col, i) => (
        <div key={`col${i}`} className="absolute top-0"
          style={{ left: `${col.left}%`, width: '5%', height: `${col.h}%`,
            background: `linear-gradient(180deg, ${col.color}1c, transparent)`,
            animation: `au-col ${col.dur}s ease-in-out ${col.delay}s infinite`,
            filter: 'blur(14px)' }} />
      ))}
      {/* Aurora reflection below mountain line */}
      <div className="absolute left-0 right-0" style={{ bottom: '0%', height: '18%' }}>
        <div className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, rgba(100,60,200,0.06), rgba(50,200,150,0.04) 50%, transparent)',
            filter: 'blur(6px)', animation: 'au-reflect 12s ease-in-out infinite' }} />
      </div>
      {/* Floating glow particles */}
      {particles.map((p, i) => (
        <div key={`p${i}`} className="absolute rounded-full"
          style={{ left: `${p.x}%`, top: `${p.y}%`, width: `${p.size}px`, height: `${p.size}px`,
            background: p.color, opacity: 0,
            boxShadow: `0 0 ${p.size * 5}px ${p.color}88`,
            animation: `au-spark ${p.dur}s ease-in-out ${p.delay}s infinite` }} />
      ))}
      {/* Electric crackle lines */}
      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
        {crackles.map((cr, i) => (
          <line key={`cr${i}`} x1={`${cr.x1}%`} y1={`${cr.y1}%`} x2={`${cr.x2}%`} y2={`${cr.y2}%`}
            stroke="rgba(220,200,255,0.55)" strokeWidth="0.7" strokeLinecap="round"
            style={{ animation: `au-crackle ${cr.dur}s ease-in-out ${cr.delay}s infinite` }} />
        ))}
        {/* Mountain range silhouettes */}
        <path d="M0,100 L0,88 L6,80 L11,85 L18,68 L24,75 L32,55 L40,70 L48,48 L55,62 L62,40 L68,58 L76,44 L82,60 L90,50 L95,65 L100,58 L100,100 Z"
          fill="rgba(8,8,18,0.55)" />
        <path d="M0,100 L0,92 L8,86 L14,90 L22,80 L30,88 L38,76 L46,82 L54,72 L60,78 L68,68 L74,75 L82,64 L88,70 L94,62 L100,68 L100,100 Z"
          fill="rgba(5,5,15,0.7)" />
      </svg>
      <style>{`
        @keyframes au-twinkle { 0%,100%{opacity:inherit} 45%{opacity:0.02} }
        @keyframes au-curtain { 0%,100%{transform:scaleY(1) translateY(0);opacity:1} 30%{transform:scaleY(1.9) translateY(-5%);opacity:0.5} 70%{transform:scaleY(0.6) translateY(4%);opacity:0.8} }
        @keyframes au-col { 0%,100%{transform:scaleY(1) skewX(0deg);opacity:0.9} 50%{transform:scaleY(2.8) skewX(3deg);opacity:0.25} }
        @keyframes au-spark { 0%,100%{opacity:0} 25%{opacity:0.35;transform:translateY(-12px)} 75%{opacity:0.3;transform:translateY(8px)} }
        @keyframes au-crackle { 0%,100%{opacity:0} 48%{opacity:0} 49%{opacity:0.7} 50%{opacity:0} 51%{opacity:0.5} 52%{opacity:0} }
        @keyframes au-reflect { 0%,100%{opacity:0.8;transform:scaleX(1)} 50%{opacity:0.4;transform:scaleX(1.06)} }
      `}</style>
    </Shell>
  );
}

/* -- Catppuccin: Lava lamp blobs, orbs, sparkles, confetti, candy dots -- */
function CatppuccinBg() {
  const orbs = useMemo(() => {
    const rand = seededRand(331);
    const palette = ['#cba6f7', '#f5c2e7', '#89b4fa', '#a6e3a1', '#fab387', '#f38ba8', '#94e2d5', '#b4befe'];
    return Array.from({ length: 32 }, (_, i) => ({
      x: rand() * 100, y: rand() * 100,
      size: 60 + rand() * 280,
      dur: 12 + rand() * 22,
      delay: rand() * 14,
      color: palette[i % palette.length],
    }));
  }, []);
  const blobs = useMemo(() => {
    const rand = seededRand(332);
    const palette = ['#cba6f7', '#f5c2e7', '#89b4fa', '#a6e3a1', '#fab387'];
    return Array.from({ length: 5 }, (_, i) => ({
      x: 10 + rand() * 75, y: 10 + rand() * 75,
      w: 100 + rand() * 140, h: 90 + rand() * 120,
      dur: 18 + rand() * 14,
      delay: rand() * 10,
      color: palette[i],
    }));
  }, []);
  const sparkles = useMemo(() => {
    const rand = seededRand(333);
    return Array.from({ length: 25 }, () => ({
      x: rand() * 100, y: rand() * 100,
      dur: 3 + rand() * 5,
      delay: rand() * 9,
      colorIdx: Math.floor(rand() * 3),
    }));
  }, []);
  const confetti = useMemo(() => {
    const rand = seededRand(334);
    const palette = ['#cba6f7', '#f5c2e7', '#89b4fa', '#a6e3a1', '#fab387', '#f38ba8'];
    return Array.from({ length: 15 }, () => ({
      x: rand() * 100,
      size: 4 + rand() * 6,
      dur: 10 + rand() * 14,
      delay: rand() * 15,
      color: palette[Math.floor(rand() * palette.length)],
      shape: rand() > 0.6 ? 'circle' : rand() > 0.3 ? 'triangle' : 'diamond',
    }));
  }, []);
  const candy = useMemo(() => {
    const rand = seededRand(335);
    const palette = ['#cba6f7', '#f38ba8', '#89b4fa', '#a6e3a1', '#fab387', '#f5c2e7'];
    return Array.from({ length: 20 }, (_, i) => ({
      x: rand() * 100, y: rand() * 100,
      dur: 2 + rand() * 3,
      delay: (i / 20) * 6 + rand() * 2,
      color: palette[i % palette.length],
    }));
  }, []);
  const meshGrads = useMemo(() => {
    const rand = seededRand(336);
    return Array.from({ length: 3 }, () => ({
      x: 10 + rand() * 70, y: 10 + rand() * 70,
      size: 300 + rand() * 300,
      color: ['#cba6f7', '#89b4fa', '#a6e3a1'][Math.floor(rand() * 3)],
      dur: 20 + rand() * 15,
      delay: rand() * 10,
    }));
  }, []);
  const sparkColors = ['#cba6f7', '#f5c2e7', '#89b4fa'];
  return (
    <Shell>
      {/* Gradient mesh background */}
      {meshGrads.map((m, i) => (
        <div key={`mg${i}`} className="absolute rounded-full"
          style={{ left: `${m.x}%`, top: `${m.y}%`, width: `${m.size}px`, height: `${m.size}px`,
            background: `radial-gradient(circle, ${m.color}12, transparent 55%)`,
            filter: 'blur(60px)', animation: `cp-mesh ${m.dur}s ease-in-out ${m.delay}s infinite` }} />
      ))}
      {/* Gradient orbs */}
      {orbs.map((b, i) => (
        <div key={`orb${i}`} className="absolute rounded-full"
          style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.size}px`, height: `${b.size}px`,
            background: `radial-gradient(circle, ${b.color}18, transparent 55%)`,
            animation: `cp-float ${b.dur}s ease-in-out ${b.delay}s infinite`,
            filter: 'blur(6px)' }} />
      ))}
      {/* Lava lamp blobs */}
      {blobs.map((bl, i) => (
        <div key={`blob${i}`} className="absolute"
          style={{ left: `${bl.x}%`, top: `${bl.y}%`, width: `${bl.w}px`, height: `${bl.h}px`,
            background: `radial-gradient(ellipse, ${bl.color}20, transparent 60%)`,
            animation: `cp-blob${i + 1} ${bl.dur}s ease-in-out ${bl.delay}s infinite`,
            filter: 'blur(20px)' }} />
      ))}
      {/* Rainbow wave band */}
      <div className="absolute left-0 right-0 h-[3px]"
        style={{ top: '50%', background: 'linear-gradient(90deg, #cba6f7, #f5c2e7, #fab387, #a6e3a1, #89b4fa, #b4befe, #cba6f7)',
          opacity: 0.06, filter: 'blur(2px)', animation: 'cp-rainbow 20s linear infinite' }} />
      {/* Sparkle crosses */}
      {sparkles.map((s, i) => (
        <div key={`sp${i}`} className="absolute"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: '8px', height: '8px', opacity: 0,
            animation: `cp-sparkle ${s.dur}s ease-in-out ${s.delay}s infinite` }}>
          <div className="absolute left-[3px] top-0 w-[2px] h-[8px] rounded-full"
            style={{ background: sparkColors[s.colorIdx] }} />
          <div className="absolute left-0 top-[3px] w-[8px] h-[2px] rounded-full"
            style={{ background: sparkColors[s.colorIdx] }} />
        </div>
      ))}
      {/* Confetti geometric shapes */}
      {confetti.map((c, i) => (
        <div key={`cf${i}`} className="absolute opacity-0"
          style={{ left: `${c.x}%`, top: '-4%', width: `${c.size}px`, height: `${c.size}px`,
            background: c.color,
            borderRadius: c.shape === 'circle' ? '50%' : '0',
            clipPath: c.shape === 'triangle' ? 'polygon(50% 0%,100% 100%,0% 100%)' : c.shape === 'diamond' ? 'polygon(50% 0%,100% 50%,50% 100%,0% 50%)' : 'none',
            animation: `cp-confetti ${c.dur}s ease-in-out ${c.delay}s infinite` }} />
      ))}
      {/* Candy dots pulsing in sequence */}
      {candy.map((cd, i) => (
        <div key={`cd${i}`} className="absolute rounded-full"
          style={{ left: `${cd.x}%`, top: `${cd.y}%`, width: '4px', height: '4px',
            background: cd.color, opacity: 0,
            boxShadow: `0 0 6px ${cd.color}`,
            animation: `cp-candy ${cd.dur}s ease-in-out ${cd.delay}s infinite` }} />
      ))}
      <style>{`
        @keyframes cp-mesh { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(-40px,25px) scale(1.15)} 66%{transform:translate(30px,-20px) scale(0.88)} }
        @keyframes cp-float { 0%,100%{transform:translate(0,0) scale(1)} 25%{transform:translate(28px,-22px) scale(1.1)} 50%{transform:translate(-12px,26px) scale(0.93)} 75%{transform:translate(-22px,-12px) scale(1.07)} }
        @keyframes cp-blob1 { 0%,100%{transform:translate(0,0) scale(1);border-radius:60% 40% 55% 45%/50% 60% 40% 50%} 50%{transform:translate(-25px,-20px) scale(1.2);border-radius:40% 60% 45% 55%/60% 40% 60% 40%} }
        @keyframes cp-blob2 { 0%,100%{transform:translate(0,0) scale(1);border-radius:50% 50% 60% 40%/45% 55% 45% 55%} 50%{transform:translate(30px,15px) scale(0.9);border-radius:65% 35% 40% 60%/55% 45% 55% 45%} }
        @keyframes cp-blob3 { 0%,100%{transform:translate(0,0) scale(1);border-radius:55% 45% 50% 50%/60% 40% 60% 40%} 50%{transform:translate(-15px,25px) scale(1.15);border-radius:40% 60% 55% 45%/45% 55% 45% 55%} }
        @keyframes cp-blob4 { 0%,100%{transform:translate(0,0) scale(1);border-radius:45% 55% 40% 60%/50% 50% 60% 40%} 50%{transform:translate(20px,-18px) scale(1.1);border-radius:60% 40% 55% 45%/40% 60% 40% 60%} }
        @keyframes cp-blob5 { 0%,100%{transform:translate(0,0) scale(1);border-radius:50% 50% 55% 45%/45% 55% 50% 50%} 50%{transform:translate(-20px,-15px) scale(0.92);border-radius:45% 55% 40% 60%/55% 45% 60% 40%} }
        @keyframes cp-rainbow { 0%{background-position:0% 50%} 100%{background-position:200% 50%} }
        @keyframes cp-sparkle { 0%,100%{opacity:0;transform:scale(0.4) rotate(0deg)} 40%{opacity:0.45;transform:scale(1.3) rotate(45deg)} 60%{opacity:0.45;transform:scale(1.3) rotate(45deg)} }
        @keyframes cp-confetti { 0%{opacity:0;transform:translateY(0) rotate(0deg)} 8%{opacity:0.35} 88%{opacity:0.2} 100%{opacity:0;transform:translateY(110vh) rotate(800deg)} }
        @keyframes cp-candy { 0%,100%{opacity:0;transform:scale(0.5)} 40%{opacity:0.55;transform:scale(1.4)} 60%{opacity:0.55;transform:scale(1.4)} }
      `}</style>
    </Shell>
  );
}

/* -- Tokyo Night: Dense cityscape, rain, puddles, fog, clouds, neon, lightning -- */
function TokyoNightBg() {
  const buildings = useMemo(() => {
    const rand = seededRand(779);
    return Array.from({ length: 32 }, (_, i) => ({
      x: i * 3.1 + rand() * 1.2,
      w: 2.2 + rand() * 4.5,
      h: 10 + rand() * 40,
      windows: Math.floor(3 + rand() * 7),
      spire: rand() > 0.6,
      spireH: 4 + rand() * 10,
    }));
  }, []);
  const rain = useMemo(() => {
    const rand = seededRand(780);
    return Array.from({ length: 55 }, () => ({
      x: rand() * 105,
      dur: 0.6 + rand() * 1,
      delay: rand() * 4,
      h: 14 + rand() * 28,
      angle: 5 + rand() * 12,
    }));
  }, []);
  const puddles = useMemo(() => {
    const rand = seededRand(781);
    return Array.from({ length: 8 }, () => ({
      x: rand() * 90, w: 30 + rand() * 60,
      dur: 2 + rand() * 2, delay: rand() * 4,
      color: ['#7aa2f7', '#bb9af7', '#ff9e64', '#9ece6a'][Math.floor(rand() * 4)],
    }));
  }, []);
  const cars = useMemo(() => {
    const rand = seededRand(782);
    return Array.from({ length: 6 }, (_, i) => ({
      dir: i < 3 ? 'ltr' : 'rtl',
      speed: 6 + rand() * 10,
      delay: rand() * 12,
      color: ['#ff9e64', '#7aa2f7', '#9ece6a', '#e0af68', '#bb9af7', '#7dcfff'][i],
      y: 0.2 + rand() * 0.8,
    }));
  }, []);
  const clouds = useMemo(() => {
    const rand = seededRand(783);
    return Array.from({ length: 3 }, () => ({
      y: 2 + rand() * 12, w: 80 + rand() * 120, h: 30 + rand() * 40,
      dur: 40 + rand() * 30, delay: rand() * 20,
    }));
  }, []);
  const neons = useMemo(() => {
    const rand = seededRand(784);
    return [
      { x: 18, y: 30, color: '#ff9e64', dur: 3, delay: 0 },
      { x: 68, y: 25, color: '#bb9af7', dur: 4, delay: 1.5 },
      { x: 42, y: 35, color: '#7dcfff', dur: 2.5, delay: 0.8 },
      { x: 82, y: 28, color: '#9ece6a', dur: 5, delay: 2.5 },
    ].map(n => ({ ...n, w: 80 + rand() * 100, h: 25 + rand() * 20 }));
  }, []);
  return (
    <Shell>
      {/* Sky */}
      <div className="absolute top-0 left-0 right-0 h-[65%]"
        style={{ background: 'linear-gradient(180deg, rgba(15,10,35,0.5), rgba(122,162,247,0.06) 50%, transparent)' }} />
      {/* Distant city glow horizon */}
      <div className="absolute left-0 right-0" style={{ bottom: '20%', height: '12%' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent, rgba(122,162,247,0.06) 50%, rgba(187,154,247,0.04))', filter: 'blur(8px)' }} />
      </div>
      {/* Moving clouds */}
      {clouds.map((cl, i) => (
        <div key={`cl${i}`} className="absolute"
          style={{ top: `${cl.y}%`, left: '-15%', width: `${cl.w}px`, height: `${cl.h}px`,
            background: 'radial-gradient(ellipse, rgba(40,35,70,0.35), transparent 65%)',
            filter: 'blur(16px)', borderRadius: '50%',
            animation: `tn-cloud ${cl.dur}s linear ${cl.delay}s infinite` }} />
      ))}
      {/* Fog / haze band between buildings */}
      <div className="absolute left-0 right-0" style={{ bottom: '22%', height: '15%',
        background: 'linear-gradient(180deg, transparent, rgba(60,50,100,0.08) 50%, transparent)',
        filter: 'blur(12px)' }} />
      {/* Neon sign glows */}
      {neons.map((n, i) => (
        <div key={`nn${i}`} className="absolute rounded-full"
          style={{ left: `${n.x}%`, top: `${n.y}%`, width: `${n.w}px`, height: `${n.h}px`,
            background: `radial-gradient(ellipse, ${n.color}14, transparent 70%)`,
            filter: 'blur(12px)', animation: `tn-neon${i + 1} ${n.dur}s ease-in-out ${n.delay}s infinite` }} />
      ))}
      {/* Ground */}
      <div className="absolute bottom-0 left-0 right-0 h-[12%]"
        style={{ background: 'rgba(18,18,30,0.92)' }} />
      {/* Buildings with antennas and windows */}
      {buildings.map((b, i) => (
        <div key={`bld${i}`} className="absolute bottom-[12%]"
          style={{ left: `${b.x}%`, width: `${b.w}%`, height: `${b.h}%`,
            background: 'rgba(20,20,35,0.88)', borderTop: '1px solid rgba(40,44,70,0.7)' }}>
          {b.spire && (
            <div style={{ position: 'absolute', left: '45%', top: `-${b.spireH}px`, width: '2px', height: `${b.spireH}px`,
              background: 'rgba(122,162,247,0.3)' }} />
          )}
          {Array.from({ length: b.windows }).map((_, wi) => (
            <div key={`w${wi}`} className="absolute"
              style={{ left: '15%', right: '15%', height: '4px',
                top: `${8 + wi * (80 / b.windows)}%`,
                background: ['#7aa2f7', '#ff9e64', '#9ece6a', '#bb9af7', '#7dcfff', '#e0af68', '#f7768e'][wi % 7],
                opacity: 0, borderRadius: '1px',
                animation: `tn-blink ${1.8 + (wi + i) * 0.35}s ease-in-out ${i * 0.18 + wi * 0.3}s infinite` }} />
          ))}
        </div>
      ))}
      {/* Street line */}
      <div className="absolute bottom-[12%] left-0 right-0 h-px"
        style={{ background: 'rgba(122,162,247,0.2)' }} />
      {/* Puddle reflections */}
      {puddles.map((p, i) => (
        <div key={`pd${i}`} className="absolute bottom-[12%]"
          style={{ left: `${p.x}%`, width: `${p.w}px`, height: '6px',
            background: `linear-gradient(90deg, transparent, ${p.color}18, transparent)`,
            filter: 'blur(2px)', borderRadius: '50%',
            animation: `tn-puddle ${p.dur}s ease-in-out ${p.delay}s infinite` }} />
      ))}
      {/* Rain with wind angle */}
      {rain.map((r, i) => (
        <div key={`r${i}`} className="absolute opacity-0"
          style={{ left: `${r.x}%`, top: '-5%', width: '1px', height: `${r.h}px`,
            background: 'linear-gradient(180deg, transparent, rgba(122,162,247,0.18))',
            transform: `rotate(${r.angle}deg)`,
            animation: `tn-rain ${r.dur}s linear ${r.delay}s infinite` }} />
      ))}
      {/* Car headlights 3 LTR, 3 RTL */}
      {cars.map((car, i) => (
        <div key={`car${i}`} className="absolute rounded-full"
          style={{ bottom: `${12 + car.y * 1.5}%`, width: '6px', height: '2px',
            background: car.color, boxShadow: `0 0 10px ${car.color}, 0 0 20px ${car.color}66`,
            animation: `tn-car${car.dir === 'ltr' ? 'L' : 'R'} ${car.speed}s linear ${car.delay}s infinite` }} />
      ))}
      {/* Lightning flash */}
      <div className="absolute inset-0" style={{ animation: 'tn-lightning 15s ease-in-out infinite' }} />
      <style>{`
        @keyframes tn-blink { 0%,100%{opacity:0.12} 30%{opacity:0.65} 70%{opacity:0.65} }
        @keyframes tn-carL { 0%{left:-2%;opacity:0} 5%{opacity:0.8} 95%{opacity:0.8} 100%{left:103%;opacity:0} }
        @keyframes tn-carR { 0%{right:-2%;opacity:0} 5%{opacity:0.8} 95%{opacity:0.8} 100%{right:103%;opacity:0} }
        @keyframes tn-rain { 0%{opacity:0;transform:translateY(0)} 8%{opacity:0.35} 92%{opacity:0.18} 100%{opacity:0;transform:translateY(110vh)} }
        @keyframes tn-neon1 { 0%,100%{opacity:1} 48%{opacity:0.25} 52%{opacity:1} }
        @keyframes tn-neon2 { 0%,100%{opacity:0.8} 50%{opacity:0.15} }
        @keyframes tn-neon3 { 0%,100%{opacity:1} 33%{opacity:0.4} 36%{opacity:1} 66%{opacity:0.3} 69%{opacity:1} }
        @keyframes tn-neon4 { 0%,100%{opacity:0.9} 50%{opacity:0.5} }
        @keyframes tn-cloud { 0%{transform:translateX(0)} 100%{transform:translateX(130vw)} }
        @keyframes tn-puddle { 0%,100%{opacity:0.6;transform:scaleX(1)} 50%{opacity:0.2;transform:scaleX(1.3)} }
        @keyframes tn-lightning { 0%,100%{background:transparent} 53%{background:transparent} 53.3%{background:rgba(122,162,247,0.04)} 53.6%{background:transparent} 54%{background:rgba(122,162,247,0.07)} 54.3%{background:transparent} }
      `}</style>
    </Shell>
  );
}

/* -- Dracula: Castle, graveyard, large moon, fog, bats, candles, mist, blood drips -- */
function DraculaBg() {
  const fogLayers = useMemo(() => {
    const rand = seededRand(1111);
    return Array.from({ length: 7 }, (_, i) => ({
      x: -30 + rand() * 60,
      bottom: rand() * 30,
      w: 400 + rand() * 600,
      h: 120 + rand() * 180,
      dur: 14 + rand() * 18,
      delay: rand() * 12,
      depth: i,
    }));
  }, []);
  const bats = useMemo(() => {
    const rand = seededRand(1112);
    return Array.from({ length: 7 }, (_, i) => ({
      size: 14 + rand() * 22,
      top: 6 + rand() * 40,
      dur: 10 + rand() * 12,
      delay: rand() * 16,
      waveAmp: 10 + rand() * 25,
    }));
  }, []);
  const candles = useMemo(() => {
    const rand = seededRand(1113);
    return Array.from({ length: 4 }, () => ({
      x: 10 + rand() * 80, y: 50 + rand() * 30,
      dur: 1.5 + rand() * 1,
      delay: rand() * 2,
    }));
  }, []);
  const tendrils = useMemo(() => {
    const rand = seededRand(1114);
    return Array.from({ length: 3 }, () => ({
      x: 10 + rand() * 80, y: 30 + rand() * 30,
      w: 80 + rand() * 120, h: 20 + rand() * 30,
      dur: 20 + rand() * 15,
      delay: rand() * 15,
    }));
  }, []);
  const bloodDrops = useMemo(() => {
    const rand = seededRand(1115);
    return Array.from({ length: 2 }, () => ({
      x: 20 + rand() * 60,
      dur: 25 + rand() * 15,
      delay: rand() * 10,
    }));
  }, []);
  return (
    <Shell>
      {/* Purple-dark sky gradient */}
      <div className="absolute top-0 left-0 right-0 h-[55%]"
        style={{ background: 'linear-gradient(180deg, rgba(40,15,60,0.35), rgba(189,147,249,0.06) 40%, transparent)' }} />
      {/* Moon with crescent, halo rings, craters */}
      <div className="absolute" style={{ top: '5%', right: '12%', width: '110px', height: '110px' }}>
        <div className="absolute rounded-full"
          style={{ top: '-25%', left: '-25%', width: '150%', height: '150%',
            border: '1px solid rgba(189,147,249,0.06)', animation: 'dr-moonring 8s ease-in-out infinite' }} />
        <div className="absolute rounded-full"
          style={{ top: '-45%', left: '-45%', width: '190%', height: '190%',
            border: '1px solid rgba(189,147,249,0.03)', animation: 'dr-moonring 12s ease-in-out 2s infinite' }} />
        <div className="absolute inset-0 rounded-full"
          style={{ background: 'radial-gradient(circle at 40% 40%, rgba(230,210,255,0.2), rgba(189,147,249,0.08) 50%, transparent 70%)',
            boxShadow: '0 0 40px rgba(189,147,249,0.1), 0 0 80px rgba(189,147,249,0.05)',
            animation: 'dr-moon 10s ease-in-out infinite' }} />
        <div className="absolute rounded-full"
          style={{ top: '8%', left: '15%', width: '80%', height: '80%',
            background: 'radial-gradient(circle, rgba(10,5,20,0.55), transparent 70%)' }} />
        <div className="absolute rounded-full"
          style={{ top: '30%', left: '20%', width: '10px', height: '10px',
            background: 'rgba(150,100,200,0.08)', boxShadow: 'inset 0 0 4px rgba(0,0,0,0.2)' }} />
        <div className="absolute rounded-full"
          style={{ top: '55%', left: '35%', width: '7px', height: '7px',
            background: 'rgba(150,100,200,0.06)', boxShadow: 'inset 0 0 3px rgba(0,0,0,0.15)' }} />
      </div>
      {/* Blood drip streaks */}
      {bloodDrops.map((bd, i) => (
        <div key={`bd${i}`} className="absolute top-0"
          style={{ left: `${bd.x}%`, width: '2px', height: '0%',
            background: 'linear-gradient(to bottom, rgba(200,30,50,0.08), rgba(180,20,30,0.04))',
            animation: `dr-drip ${bd.dur}s ease-in ${bd.delay}s infinite` }} />
      ))}
      {/* 7 fog layers */}
      {fogLayers.map((f, i) => (
        <div key={`fog${i}`} className="absolute rounded-full"
          style={{ left: `${f.x}%`, bottom: `${f.bottom}%`,
            width: `${f.w}px`, height: `${f.h}px`,
            background: `radial-gradient(ellipse, rgba(${i % 2 === 0 ? '80,60,140' : '60,50,120'},${0.08 + (f.depth % 3) * 0.02}), transparent 58%)`,
            filter: `blur(${20 + i * 5}px)`,
            animation: `dr-fog ${f.dur}s ease-in-out ${f.delay}s infinite` }} />
      ))}
      {/* Lightning double flash */}
      <div className="absolute inset-0" style={{ animation: 'dr-lightning 12s ease-in-out infinite' }} />
      <div className="absolute inset-0" style={{ animation: 'dr-lightning2 12s ease-in-out 0.15s infinite' }} />
      {/* 4 candle flames */}
      {candles.map((c, i) => (
        <div key={`ca${i}`} className="absolute rounded-full"
          style={{ left: `${c.x}%`, top: `${c.y}%`, width: '5px', height: '8px',
            background: 'radial-gradient(ellipse at 50% 70%, rgba(255,180,60,0.7), rgba(255,100,30,0.3) 50%, transparent)',
            boxShadow: '0 0 8px rgba(255,150,40,0.3), 0 0 16px rgba(255,100,20,0.12)',
            animation: `dr-candle ${c.dur}s ease-in-out ${c.delay}s infinite` }} />
      ))}
      {/* Mist tendrils */}
      {tendrils.map((t, i) => (
        <div key={`td${i}`} className="absolute"
          style={{ left: `${t.x}%`, top: `${t.y}%`, width: `${t.w}px`, height: `${t.h}px`,
            background: 'radial-gradient(ellipse, rgba(98,80,160,0.06), transparent 60%)',
            filter: 'blur(10px)', borderRadius: '50%',
            animation: `dr-tendril ${t.dur}s ease-in-out ${t.delay}s infinite` }} />
      ))}
      {/* 7 bats with wing flap */}
      {bats.map((bat, i) => (
        <svg key={`bat${i}`} className="absolute" viewBox="0 0 30 12"
          style={{ width: `${bat.size}px`, top: `${bat.top}%`, left: '-5%', opacity: 0,
            animation: `dr-bat ${bat.dur}s ease-in-out ${bat.delay}s infinite`,
            ['--wa' as string]: `${bat.waveAmp}px` }}>
          <path d="M15,6 Q10,0 5,3 Q2,1 0,4 Q3,5 5,5 Q8,8 12,7 L15,6 Q17,8 20,7 Q22,8 25,5 Q27,5 30,4 Q28,1 25,3 Q20,0 15,6Z"
            fill="#bd93f9" opacity="0.38">
            <animate attributeName="d"
              values="M15,6 Q10,0 5,3 Q2,1 0,4 Q3,5 5,5 Q8,8 12,7 L15,6 Q17,8 20,7 Q22,8 25,5 Q27,5 30,4 Q28,1 25,3 Q20,0 15,6Z;M15,6 Q10,3 5,5 Q2,4 0,6 Q3,6 5,6 Q8,7 12,6.5 L15,6 Q17,7 20,6.5 Q22,6 25,6 Q27,6 30,6 Q28,4 25,5 Q20,3 15,6Z;M15,6 Q10,0 5,3 Q2,1 0,4 Q3,5 5,5 Q8,8 12,7 L15,6 Q17,8 20,7 Q22,8 25,5 Q27,5 30,4 Q28,1 25,3 Q20,0 15,6Z"
              dur="0.35s" repeatCount="indefinite" />
          </path>
        </svg>
      ))}
      {/* SVG: castle turrets, graveyard fence, gravestones */}
      <svg className="absolute bottom-0 left-0 w-full" style={{ height: '22%' }} viewBox="0 0 1000 120" preserveAspectRatio="none">
        {Array.from({ length: 50 }, (_, i) => (
          <rect key={`f${i}`} x={i * 20} y={70} width={4} height={50} fill="rgba(15,10,25,0.8)" />
        ))}
        {Array.from({ length: 50 }, (_, i) => (
          <polygon key={`fp${i}`} points={`${i * 20},70 ${i * 20 + 2},60 ${i * 20 + 4},70`} fill="rgba(15,10,25,0.8)" />
        ))}
        <rect x={80} y={55} width={20} height={30} rx={3} fill="rgba(25,18,40,0.7)" />
        <line x1={90} y1={58} x2={90} y2={68} stroke="rgba(100,80,140,0.3)" strokeWidth="1.5" />
        <line x1={85} y1={62} x2={95} y2={62} stroke="rgba(100,80,140,0.3)" strokeWidth="1.5" />
        <rect x={260} y={52} width={22} height={33} rx={3} fill="rgba(22,16,38,0.7)" />
        <line x1={271} y1={55} x2={271} y2={66} stroke="rgba(100,80,140,0.3)" strokeWidth="1.5" />
        <line x1={265} y1={60} x2={277} y2={60} stroke="rgba(100,80,140,0.3)" strokeWidth="1.5" />
        <rect x={500} y={50} width={18} height={28} rx={2} fill="rgba(20,14,35,0.7)" />
        <line x1={509} y1={53} x2={509} y2={62} stroke="rgba(100,80,140,0.3)" strokeWidth="1.5" />
        <line x1={504} y1={57} x2={514} y2={57} stroke="rgba(100,80,140,0.3)" strokeWidth="1.5" />
        <path d="M700,120 L700,30 L710,30 L710,20 L720,20 L720,30 L730,30 L730,20 L740,20 L740,30 L750,30 L750,120 Z" fill="rgba(12,8,22,0.88)" />
        <path d="M780,120 L780,50 L790,50 L790,40 L800,40 L800,50 L810,50 L810,40 L820,40 L820,50 L830,50 L830,120 Z" fill="rgba(12,8,22,0.88)" />
        <path d="M840,120 L840,20 L852,20 L852,10 L864,10 L864,20 L876,20 L876,10 L888,10 L888,20 L900,20 L900,120 Z" fill="rgba(10,6,20,0.92)" />
      </svg>
      <style>{`
        @keyframes dr-fog { 0%,100%{transform:translateX(0) translateY(0) scaleX(1)} 50%{transform:translateX(70px) translateY(-22px) scaleX(1.15)} }
        @keyframes dr-bat { 0%{left:-5%;opacity:0;transform:translateY(0)} 5%{opacity:0.32} 25%{transform:translateY(calc(-1 * var(--wa)))} 50%{transform:translateY(calc(var(--wa) * 0.5))} 75%{transform:translateY(calc(-1 * var(--wa) * 0.7))} 95%{opacity:0.32} 100%{left:108%;opacity:0} }
        @keyframes dr-lightning { 0%,100%{background:transparent} 46%{background:transparent} 46.4%{background:rgba(189,147,249,0.05)} 46.8%{background:transparent} }
        @keyframes dr-lightning2 { 0%,100%{background:transparent} 46%{background:transparent} 46.4%{background:rgba(189,147,249,0.08)} 46.8%{background:transparent} }
        @keyframes dr-moon { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.7;transform:scale(1.05)} }
        @keyframes dr-moonring { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.3;transform:scale(1.1)} }
        @keyframes dr-candle { 0%,100%{transform:scale(1) translateX(0);opacity:0.9} 25%{transform:scale(1.2,0.8) translateX(1px);opacity:0.7} 50%{transform:scale(0.9,1.1) translateX(-1px);opacity:1} 75%{transform:scale(1.1,0.9) translateX(0.5px);opacity:0.8} }
        @keyframes dr-tendril { 0%,100%{transform:translateX(0) scaleX(1);opacity:0.7} 50%{transform:translateX(50px) scaleX(1.4);opacity:0.3} }
        @keyframes dr-drip { 0%{height:0%;opacity:0} 20%{opacity:1} 80%{opacity:0.5} 100%{height:45%;opacity:0} }
      `}</style>
    </Shell>
  );
}

/* -- Solarized: Big sun, golden atmosphere, deep ocean, birds, sea spray -- */
function SolarizedBg() {
  const waves = useMemo(() => {
    const rand = seededRand(551);
    return Array.from({ length: 8 }, (_, i) => ({
      y: 56 + i * 4 + rand() * 2,
      dur: 4 + rand() * 5,
      delay: rand() * 4,
      opacity: 0.05 + i * 0.018,
    }));
  }, []);
  const seaSpray = useMemo(() => {
    const rand = seededRand(552);
    return Array.from({ length: 10 }, () => ({
      x: 20 + rand() * 60,
      dur: 1.5 + rand() * 2,
      delay: rand() * 6,
    }));
  }, []);
  const windParticles = useMemo(() => {
    const rand = seededRand(553);
    return Array.from({ length: 8 }, () => ({
      y: 10 + rand() * 50,
      dur: 8 + rand() * 10,
      delay: rand() * 12,
    }));
  }, []);
  const birds = useMemo(() => {
    const rand = seededRand(554);
    return Array.from({ length: 2 }, () => ({
      y: 10 + rand() * 22,
      scale: 0.6 + rand() * 0.8,
      dur: 28 + rand() * 20,
      delay: rand() * 18,
    }));
  }, []);
  const clouds = useMemo(() => {
    const rand = seededRand(555);
    return Array.from({ length: 3 }, () => ({
      y: 8 + rand() * 18,
      w: 90 + rand() * 130, h: 28 + rand() * 30,
      dur: 50 + rand() * 40, delay: rand() * 25,
    }));
  }, []);
  const rayAngles = [0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5, 180, 202.5, 225, 247.5, 270, 292.5, 315, 337.5];
  return (
    <Shell>
      {/* Golden hour atmospheric gradient */}
      <div className="absolute top-0 left-0 right-0 h-[60%]"
        style={{ background: 'linear-gradient(180deg, rgba(181,137,0,0.06), rgba(203,75,22,0.03) 35%, rgba(38,139,210,0.02) 70%, transparent)' }} />
      {/* Warm glow horizon band */}
      <div className="absolute left-0 right-0" style={{ bottom: '40%', height: '8%',
        background: 'linear-gradient(180deg, transparent, rgba(181,137,0,0.08) 50%, transparent)',
        filter: 'blur(6px)' }} />
      {/* Ocean gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-[44%]"
        style={{ background: 'linear-gradient(to top, rgba(38,139,210,0.14), rgba(38,139,210,0.04) 60%, transparent)' }} />
      {/* Cloud puffs */}
      {clouds.map((cl, i) => (
        <div key={`cl${i}`} className="absolute"
          style={{ top: `${cl.y}%`, left: '-18%', width: `${cl.w}px`, height: `${cl.h}px`,
            background: 'radial-gradient(ellipse, rgba(255,240,200,0.12), transparent 65%)',
            filter: 'blur(14px)', borderRadius: '50%',
            animation: `sl-cloud ${cl.dur}s linear ${cl.delay}s infinite` }} />
      ))}
      {/* Sun with 16 rays, pulsing corona, 3 ring ripples */}
      <div className="absolute" style={{ top: '5%', right: '8%', width: '150px', height: '150px' }}>
        <div className="absolute inset-0 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(181,137,0,0.22) 0%, rgba(181,137,0,0.07) 30%, transparent 60%)',
            filter: 'blur(4px)', animation: 'sl-corona 4s ease-in-out infinite' }} />
        {[1, 2, 3].map(r => (
          <div key={`ring${r}`} className="absolute rounded-full"
            style={{ top: `${-20 * r}%`, left: `${-20 * r}%`, width: `${100 + 40 * r}%`, height: `${100 + 40 * r}%`,
              border: `1px solid rgba(181,137,0,${0.07 - r * 0.015})`,
              animation: `sl-ring ${5 + r * 1.5}s ease-in-out ${r * 0.8}s infinite` }} />
        ))}
        {rayAngles.map((angle, i) => (
          <div key={`ray${i}`} className="absolute"
            style={{ top: '50%', left: '50%', width: '90px', height: '2px',
              background: `linear-gradient(90deg, transparent 5%, rgba(181,137,0,${0.07 + (i % 4) * 0.025}), transparent)`,
              transformOrigin: '0 50%',
              transform: `rotate(${angle}deg) translateX(68px)`,
              animation: `sl-ray ${5 + (i % 4) * 0.6}s ease-in-out ${i * 0.3}s infinite` }} />
        ))}
        <div className="absolute rounded-full"
          style={{ top: '25%', left: '25%', width: '50%', height: '50%',
            background: 'radial-gradient(circle, rgba(181,137,0,0.3), rgba(181,137,0,0.1) 55%, transparent)',
            boxShadow: '0 0 30px rgba(181,137,0,0.12)' }} />
      </div>
      {/* Horizon line */}
      <div className="absolute left-0 right-0" style={{ bottom: '42%', height: '2px',
        background: 'linear-gradient(90deg, transparent 3%, rgba(181,137,0,0.1) 20%, rgba(181,137,0,0.16) 50%, rgba(181,137,0,0.1) 80%, transparent 97%)' }} />
      {/* 8 ocean waves */}
      {waves.map((w, i) => (
        <div key={`w${i}`} className="absolute left-[-12%] right-[-12%]"
          style={{ bottom: `${100 - w.y}%`, height: `${1 + i * 0.4}px`,
            background: `linear-gradient(90deg, transparent 4%, rgba(38,139,210,${w.opacity}) 22%, rgba(38,139,210,${w.opacity * 1.5}) 50%, rgba(38,139,210,${w.opacity}) 78%, transparent 96%)`,
            animation: `sl-wave ${w.dur}s ease-in-out ${w.delay}s infinite` }} />
      ))}
      {/* Sun reflection on water */}
      <div className="absolute" style={{ right: '14%', bottom: '0', width: '60px', height: '42%' }}>
        <div style={{ position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, rgba(181,137,0,0.1) 0%, rgba(181,137,0,0.04) 40%, transparent)',
          animation: 'sl-sunrefl 3s ease-in-out infinite' }} />
      </div>
      {/* 3 lens flares */}
      <div className="absolute" style={{ top: '18%', right: '24%', width: '50px', height: '10px',
        background: 'linear-gradient(90deg, transparent, rgba(181,137,0,0.08), transparent)',
        borderRadius: '50%', animation: 'sl-flare 5s ease-in-out infinite' }} />
      <div className="absolute rounded-full" style={{ top: '30%', left: '42%', width: '28px', height: '28px',
        background: 'radial-gradient(circle, rgba(38,139,210,0.07), transparent 60%)',
        animation: 'sl-flare 5s ease-in-out 2.5s infinite' }} />
      <div className="absolute" style={{ top: '12%', right: '40%', width: '20px', height: '6px',
        background: 'linear-gradient(90deg, transparent, rgba(203,75,22,0.06), transparent)',
        borderRadius: '50%', animation: 'sl-flare 5s ease-in-out 1.2s infinite' }} />
      {/* Sea spray */}
      {seaSpray.map((sp, i) => (
        <div key={`sp${i}`} className="absolute rounded-full"
          style={{ left: `${sp.x}%`, bottom: '44%', width: '3px', height: '3px',
            background: 'rgba(38,139,210,0.35)', opacity: 0,
            animation: `sl-spray ${sp.dur}s ease-out ${sp.delay}s infinite` }} />
      ))}
      {/* Warm wind particles */}
      {windParticles.map((wp, i) => (
        <div key={`wp${i}`} className="absolute rounded-full"
          style={{ left: '-2%', top: `${wp.y}%`, width: '4px', height: '4px',
            background: 'rgba(181,137,0,0.22)', opacity: 0,
            animation: `sl-wind ${wp.dur}s ease-in-out ${wp.delay}s infinite` }} />
      ))}
      {/* Bird silhouettes */}
      {birds.map((bird, i) => (
        <svg key={`bird${i}`} className="absolute" viewBox="0 0 24 12"
          style={{ width: `${18 * bird.scale}px`, top: `${bird.y}%`, left: '-5%',
            opacity: 0, animation: `sl-bird ${bird.dur}s ease-in-out ${bird.delay}s infinite` }}>
          <path d="M12,6 Q9,3 6,4 Q3,3 0,5" stroke="rgba(88,110,117,0.45)" strokeWidth="1.2" fill="none" strokeLinecap="round" />
          <path d="M12,6 Q15,3 18,4 Q21,3 24,5" stroke="rgba(88,110,117,0.45)" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        </svg>
      ))}
      <style>{`
        @keyframes sl-corona { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.6;transform:scale(1.18)} }
        @keyframes sl-ring { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.2;transform:scale(1.12)} }
        @keyframes sl-ray { 0%,100%{opacity:0.45} 50%{opacity:1} }
        @keyframes sl-wave { 0%,100%{transform:scaleX(1) translateX(0)} 50%{transform:scaleX(1.06) translateX(4%)} }
        @keyframes sl-flare { 0%,100%{opacity:0} 44%{opacity:0.8} 56%{opacity:0.8} }
        @keyframes sl-sunrefl { 0%,100%{opacity:0.8;transform:scaleX(1)} 50%{opacity:0.4;transform:scaleX(1.25)} }
        @keyframes sl-spray { 0%{opacity:0;transform:translateY(0)} 20%{opacity:0.6} 100%{opacity:0;transform:translateY(-22px) translateX(8px)} }
        @keyframes sl-wind { 0%{opacity:0;left:-2%} 10%{opacity:0.45} 90%{opacity:0.3} 100%{opacity:0;left:105%} }
        @keyframes sl-bird { 0%{left:-5%;opacity:0} 5%{opacity:0.5} 95%{opacity:0.5} 100%{left:108%;opacity:0} }
        @keyframes sl-cloud { 0%{transform:translateX(0)} 100%{transform:translateX(130vw)} }
      `}</style>
    </Shell>
  );
}
