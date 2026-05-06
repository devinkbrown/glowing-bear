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
    case 'lightning': return <LightningBg />;
    default: return null;
  }
}

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-50" aria-hidden="true">
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
      opacity: 0.25 + rand() * 0.45,
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
      opacity: 0.15 + rand() * 0.25,
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
      opacity: 0.2 + rand() * 0.3,
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
      { x: 20, y: 25, w: 380, h: 220, color: '139,156,248', opacity: 0.35, dur: 14, delay: 0 },
      { x: 55, y: 55, w: 300, h: 180, color: '160,100,220', opacity: 0.4, dur: 18, delay: 5 },
      { x: 10, y: 65, w: 260, h: 160, color: '80,120,200', opacity: 0.3, dur: 22, delay: 9 },
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
      {/* Milky Way diagonal haze - DRAMATICALLY MORE VISIBLE */}
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(135deg, transparent 15%, rgba(120,140,230,0.25) 30%, rgba(100,120,210,0.35) 50%, rgba(120,140,230,0.25) 70%, transparent 85%)',
        filter: 'blur(18px)',
      }} />
      {/* Milky Way dense cluster stars */}
      {milkyWayStars.map((s, i) => (
        <div key={`mw${i}`} className="absolute rounded-full"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.size}px`, height: `${s.size}px`,
            background: '#c0caff', opacity: s.opacity,
            boxShadow: '0 0 4px rgba(192,202,255,0.6)' }} />
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
            boxShadow: s.size > 2 ? `0 0 ${s.size * 4}px rgba(139,156,248,0.6)` : undefined,
            animation: `mn-twinkle-fast ${s.dur}s ease-in-out ${s.delay}s infinite` }} />
      ))}
      {/* Nebula breathing clouds - MASSIVELY MORE VISIBLE */}
      {nebulae.map((n, i) => (
        <div key={`nb${i}`} className="absolute rounded-full"
          style={{ left: `${n.x}%`, top: `${n.y}%`, width: `${n.w}px`, height: `${n.h}px`,
            background: `radial-gradient(ellipse, rgba(${n.color},${n.opacity}), transparent 60%)`,
            filter: 'blur(28px)',
            animation: `mn-breathe ${n.dur}s ease-in-out ${n.delay + n.extraDelay}s infinite` }} />
      ))}
      {/* Crescent moon upper-right */}
      <div className="absolute" style={{ top: '6%', right: '8%', width: '52px', height: '52px' }}>
        {/* Outer glow halo - BRIGHTER */}
        <div className="absolute rounded-full" style={{
          top: '-30%', left: '-30%', width: '160%', height: '160%',
          background: 'radial-gradient(circle, rgba(180,200,255,0.3), transparent 55%)',
          filter: 'blur(8px)', animation: 'mn-moon-glow 9s ease-in-out infinite',
        }} />
        <svg viewBox="0 0 52 52" className="w-full h-full">
          {/* Full circle - BRIGHTER */}
          <circle cx="26" cy="26" r="22" fill="rgba(210,220,255,0.5)" />
          {/* Inner shadow cutout to make crescent */}
          <circle cx="34" cy="22" r="19" fill="rgba(8,8,22,0.92)" />
          {/* Soft inner edge - BRIGHTER */}
          <circle cx="26" cy="26" r="22" fill="none" stroke="rgba(180,200,255,0.3)" strokeWidth="1" />
        </svg>
      </div>
      {/* SVG: constellation lines + shooting stars */}
      <svg className="absolute inset-0 w-full h-full" style={{ overflow: 'visible' }}>
        {constellationLines.map((l, i) => (
          <line key={`cl${i}`} x1={`${l.x1}%`} y1={`${l.y1}%`} x2={`${l.x2}%`} y2={`${l.y2}%`}
            stroke="rgba(139,156,248,0.4)" strokeWidth="1.2"
            style={{ animation: `mn-line ${l.dur}s ease-in-out ${l.delay}s infinite` }} />
        ))}
        {/* Constellation node dots - BRIGHTER */}
        {[
          [12,18],[22,10],[30,20],[65,30],[75,30],[70,25],[70,35],
          [8,62],[14,55],[20,63],[26,56],[32,64],[48,15],[56,22],[62,16],[82,42],[90,50],
        ].map(([x,y], i) => (
          <circle key={`cn${i}`} cx={`${x}%`} cy={`${y}%`} r="1.2"
            fill="rgba(180,196,255,0.6)"
            style={{ animation: `mn-twinkle ${8 + i * 1.1}s ease-in-out ${i * 0.7}s infinite` }} />
        ))}
        {/* Shooting stars - MORE VISIBLE TRAILS */}
        {shooters.map((s, i) => (
          <g key={`sh${i}`} style={{ animation: `mn-shoot ${s.dur}s ease-in ${s.delay}s infinite`, opacity: 0 }}>
            <line
              x1={`${s.x}%`} y1={`${s.y}%`}
              x2={`${s.x + 15}%`} y2={`${s.y + 10}%`}
              stroke={`url(#shooter-grad-${i})`} strokeWidth="2.5" strokeLinecap="round" />
            <defs>
              <linearGradient id={`shooter-grad-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(255,255,255,0)" />
                <stop offset="70%" stopColor="rgba(200,215,255,0.9)" />
                <stop offset="100%" stopColor="rgba(255,255,255,1)" />
              </linearGradient>
            </defs>
          </g>
        ))}
      </svg>
      {/* Faint horizon warm glow - SLIGHTLY MORE VISIBLE */}
      <div className="absolute bottom-0 left-0 right-0 h-[18%]"
        style={{ background: 'linear-gradient(to top, rgba(80,60,120,0.2), transparent)', filter: 'blur(4px)' }} />
      <style>{`
        @keyframes mn-twinkle-fast { 0%,100%{opacity:inherit} 35%{opacity:0.1} 65%{opacity:0.1} }
        @keyframes mn-twinkle      { 0%,100%{opacity:inherit} 40%{opacity:0.15} 60%{opacity:0.15} }
        @keyframes mn-twinkle-slow { 0%,100%{opacity:inherit} 45%{opacity:0.08} 55%{opacity:0.08} }
        @keyframes mn-breathe      { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.35);opacity:0.7} }
        @keyframes mn-line         { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes mn-moon-glow    { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.7;transform:scale(1.2)} }
        @keyframes mn-shoot        { 0%{opacity:0;transform:translateX(0) translateY(0)} 8%{opacity:1} 80%{opacity:0.8} 100%{opacity:0;transform:translateX(120px) translateY(70px)} }
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
      {/* 6 diagonal prismatic light sweeps - DRAMATICALLY MORE VISIBLE */}
      {sweepAngles.map((angle, i) => (
        <div key={`sw${i}`} className="absolute"
          style={{ width: '260%', height: '80px', top: `${10 + i * 16}%`, left: '-80%',
            background: `linear-gradient(90deg, transparent 15%, rgba(${sweepColors[i][0]},0.25) 38%, rgba(${sweepColors[i][1]},${0.4 + i * 0.05}) 50%, rgba(${sweepColors[i][2]},0.25) 62%, transparent 85%)`,
            transform: `rotate(${angle}deg)`,
            animation: `ob-sweep ${5.5 + i * 2.2}s ease-in-out ${i * 1.3}s infinite` }} />
      ))}
      {/* Crystal facets with pentagon clip-path and inner shine - MUCH BRIGHTER */}
      {facets.map((f, i) => {
        const faceColors = ['rgba(167,139,250,', 'rgba(200,180,255,', 'rgba(130,100,230,'];
        const baseOpacity = 0.2 + (i % 4) * 0.15;
        return (
          <div key={`f${i}`} className="absolute"
            style={{ left: `${f.x}%`, top: `${f.y}%`, width: `${f.size}px`, height: `${f.size}px`,
              transform: `rotate(${f.rot}deg)`,
              clipPath: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)',
              animation: `ob-facet ${f.dur}s ease-in-out ${f.delay}s infinite`,
              background: `linear-gradient(${120 + f.rot * 0.3}deg, transparent 20%, ${faceColors[f.colorIdx]}${baseOpacity}) 48%, rgba(255,255,255,${baseOpacity * 0.8}) 54%, ${faceColors[f.colorIdx]}${baseOpacity * 0.6}) 62%, transparent 78%)` }} />
        );
      })}
      {/* Spinning wireframe diamonds - GLOWING OUTLINES */}
      <svg className="absolute inset-0 w-full h-full">
        {diamonds.map((d, i) => (
          <g key={`dia${i}`} style={{ animation: `ob-spin ${d.dur}s linear ${d.delay}s infinite`, transformOrigin: `${d.x}% ${d.y}%` }}>
            <rect
              x={`calc(${d.x}% - ${d.size / 2}px)`}
              y={`calc(${d.y}% - ${d.size / 2}px)`}
              width={d.size} height={d.size}
              fill="none" stroke="rgba(167,139,250,0.4)" strokeWidth="1.5"
              transform={`rotate(45, ${d.x * 10}, ${d.y * 10})`}
              style={{ filter: 'drop-shadow(0 0 4px rgba(167,139,250,0.6))' }} />
          </g>
        ))}
        {/* Crack lines with glow - BRIGHT VEINS OF LIGHT */}
        {cracks.map((c, i) => (
          <g key={`cr${i}`}>
            <line x1={`${c.x1}%`} y1={`${c.y1}%`} x2={`${c.x2}%`} y2={`${c.y2}%`}
              stroke="rgba(130,100,220,0.6)" strokeWidth="3"
              style={{ filter: 'drop-shadow(0 0 6px rgba(167,139,250,0.8))', animation: `ob-crack ${c.dur}s ease-in-out ${c.delay}s infinite` }} />
            <line x1={`${c.x1}%`} y1={`${c.y1}%`} x2={`${c.x2}%`} y2={`${c.y2}%`}
              stroke="rgba(200,180,255,0.3)" strokeWidth="1.5" />
          </g>
        ))}
        {/* Prismatic refraction beams from focal point - CLEARLY VISIBLE */}
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
              ][i]},0.35)`}
              strokeWidth="1.5"
              style={{ animation: `ob-refract ${6 + i * 0.8}s ease-in-out ${i * 0.5}s infinite` }} />
          );
        })}
      </svg>
      {/* Shatter particles - CLEARLY VISIBLE */}
      {shatterParticles.map((p, i) => (
        <div key={`sp${i}`} className="absolute rounded-sm"
          style={{ left: `${p.x}%`, top: `${p.y}%`, width: `${p.size}px`, height: `${p.size * 0.6}px`,
            background: i % 3 === 0 ? 'rgba(200,180,255,0.8)' : i % 3 === 1 ? 'rgba(255,255,255,0.7)' : 'rgba(167,139,250,0.8)',
            transform: `rotate(${i * 37}deg)`,
            boxShadow: '0 0 4px rgba(167,139,250,0.6)',
            animation: `ob-shatter ${p.dur}s ease-in-out ${p.delay}s infinite` }} />
      ))}
      {/* Breathing center glow - VISIBLY PULSING */}
      <div className="absolute w-[550px] h-[550px] top-[42%] left-[50%] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(167,139,250,0.3), transparent 50%)', filter: 'blur(30px)', animation: 'ob-center-glow 16s ease-in-out infinite' }} />
      <div className="absolute w-[300px] h-[300px] top-[42%] left-[50%] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(220,215,240,0.25), transparent 50%)', filter: 'blur(15px)', animation: 'ob-center-silver 16s ease-in-out 8s infinite' }} />
      <style>{`
        @keyframes ob-sweep       { 0%,100%{transform:rotate(var(--ob-ang,0deg)) translateX(-28%);opacity:0.8} 50%{transform:rotate(var(--ob-ang,0deg)) translateX(28%);opacity:1} }
        @keyframes ob-facet       { 0%,100%{opacity:0.6} 50%{opacity:1} }
        @keyframes ob-crack       { 0%,100%{opacity:0.7} 50%{opacity:1.0} }
        @keyframes ob-spin        { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
        @keyframes ob-refract     { 0%,100%{opacity:0.5} 50%{opacity:1} }
        @keyframes ob-shatter     { 0%,100%{opacity:0;transform:rotate(var(--rot,0deg)) scale(0.5)} 40%{opacity:0.8;transform:rotate(var(--rot,0deg)) scale(1.2)} 60%{opacity:0.8} }
        @keyframes ob-center-glow { 0%,100%{opacity:1;transform:translate(-50%,-50%) scale(1)} 50%{opacity:0.6;transform:translate(-50%,-50%) scale(1.4)} }
        @keyframes ob-center-silver{ 0%,100%{opacity:0.3} 50%{opacity:1} }
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
      opacity: 0.4 + rand() * 0.4,
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
      {/* Mountain silhouette - CLEARLY VISIBLE DARK SHAPES */}
      <svg className="absolute bottom-0 left-0 right-0 w-full" viewBox="0 0 1000 180" preserveAspectRatio="none" style={{ height: '22%' }}>
        <defs>
          <linearGradient id="nd-mountain-edge" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5e81ac" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#2e3440" stopOpacity="0.3" />
          </linearGradient>
        </defs>
        {/* Back range - MORE VISIBLE */}
        <path d="M0,180 L0,120 L80,60 L160,90 L260,30 L360,80 L440,40 L520,85 L620,25 L720,75 L800,45 L880,80 L960,50 L1000,70 L1000,180 Z"
          fill="rgba(36,40,59,0.8)" />
        {/* Blue edge highlight - BRIGHT AGAINST AURORA */}
        <path d="M0,120 L80,60 L160,90 L260,30 L360,80 L440,40 L520,85 L620,25 L720,75 L800,45 L880,80 L960,50 L1000,70"
          fill="none" stroke="url(#nd-mountain-edge)" strokeWidth="2" />
        {/* Front range - CLEARLY DARK SILHOUETTE */}
        <path d="M0,180 L0,145 L60,100 L130,125 L200,85 L300,110 L390,70 L480,105 L560,80 L650,115 L730,88 L820,120 L900,95 L970,115 L1000,100 L1000,180 Z"
          fill="rgba(28,32,48,0.9)" />
      </svg>
      {/* Aurora bands - DOMINANT VISUAL WITH HIGH OPACITY */}
      {auroraBands.map((band, i) => (
        <div key={i} className="absolute left-0 right-0"
          style={{ top: band.top, height: band.h,
            background: `linear-gradient(180deg, ${band.color}80 0%, ${band.color}50 40%, transparent 100%)`,
            animation: `nd-wave ${band.dur} ease-in-out ${band.delay} infinite`,
            filter: 'blur(28px)' }} />
      ))}
      {/* 12 vertical curtain columns - BRIGHT ENOUGH TO CLEARLY SEE */}
      {Array.from({ length: 12 }, (_, i) => (
        <div key={`col${i}`} className="absolute top-0"
          style={{ left: `${2 + i * 8}%`, width: '5%', height: '58%',
            background: `linear-gradient(180deg, ${auroraColors[i % auroraColors.length]}70, transparent)`,
            animation: `nd-col ${3.5 + i * 1.1}s ease-in-out ${i * 0.7}s infinite`,
            filter: 'blur(10px)' }} />
      ))}
      {/* Frost particles - CLEARLY VISIBLE SPARKLES */}
      {frost.map((f, i) => (
        <div key={`fr${i}`} className="absolute rounded-full"
          style={{ left: `${f.x}%`, top: `${f.y}%`, width: `${f.size}px`, height: `${f.size}px`,
            background: ['#88c0d0', '#81a1c1', '#8fbcbb'][f.color],
            opacity: 0.4 + (i % 4) * 0.2,
            boxShadow: `0 0 4px ${['#88c0d0', '#81a1c1', '#8fbcbb'][f.color]}`,
            animation: `nd-frost ${f.dur}s ease-in-out ${f.delay}s infinite` }} />
      ))}
      {/* Falling snowflakes - OBVIOUS WHITE DOTS */}
      {snowflakes.map((s, i) => (
        <div key={`snow${i}`} className="absolute rounded-full opacity-0"
          style={{ left: `${s.x}%`, top: '-3%', width: `${s.size}px`, height: `${s.size}px`,
            background: 'rgba(236,239,244,0.9)',
            boxShadow: '0 0 6px rgba(236,239,244,0.8)',
            animation: `nd-snow ${s.dur}s linear ${s.delay}s infinite`,
            ['--snow-drift' as string]: `${s.drift}px` }} />
      ))}
      {/* Ice crystal hexagons - VISIBLE FROST PATTERNS */}
      <svg className="absolute inset-0 w-full h-full">
        {hexCrystals.map((h, i) => (
          <g key={`hx${i}`}
            style={{ animation: `nd-crystal ${h.dur}s ease-in-out ${h.delay}s infinite`, transformOrigin: `${h.x}% ${h.y}%` }}>
            <polygon
              points={`${h.x * 10},${h.y * 10 - h.size} ${h.x * 10 + h.size * 0.866},${h.y * 10 - h.size * 0.5} ${h.x * 10 + h.size * 0.866},${h.y * 10 + h.size * 0.5} ${h.x * 10},${h.y * 10 + h.size} ${h.x * 10 - h.size * 0.866},${h.y * 10 + h.size * 0.5} ${h.x * 10 - h.size * 0.866},${h.y * 10 - h.size * 0.5}`}
              fill="none" stroke="rgba(136,192,208,0.5)" strokeWidth="1.2"
              transform={`rotate(${h.rot}, ${h.x * 10}, ${h.y * 10})`}
              style={{ filter: 'drop-shadow(0 0 3px rgba(136,192,208,0.7))' }} />
          </g>
        ))}
        {/* Northern star with cross-flare - BRIGHT GUIDE STAR */}
        <g style={{ animation: 'nd-star 5s ease-in-out infinite', transformOrigin: '82% 5%' }}>
          <circle cx="82%" cy="5%" r="3" fill="rgba(236,239,244,0.9)" />
          <line x1="82%" y1="1%" x2="82%" y2="9%" stroke="rgba(236,239,244,0.7)" strokeWidth="1.2" />
          <line x1="78%" y1="5%" x2="86%" y2="5%" stroke="rgba(236,239,244,0.7)" strokeWidth="1.2" />
          <line x1="79.2%" y1="2.2%" x2="84.8%" y2="7.8%" stroke="rgba(236,239,244,0.5)" strokeWidth="1" />
          <line x1="84.8%" y1="2.2%" x2="79.2%" y2="7.8%" stroke="rgba(236,239,244,0.5)" strokeWidth="1" />
        </g>
      </svg>
      {/* Subtle grid lines - SLIGHTLY MORE VISIBLE */}
      <div className="absolute inset-0 opacity-[0.08]"
        style={{ background: 'repeating-linear-gradient(90deg, transparent, transparent 80px, rgba(136,192,208,0.3) 80px, rgba(136,192,208,0.3) 81px)' }} />
      <style>{`
        @keyframes nd-wave    { 0%,100%{transform:scaleY(1) translateY(0);opacity:1} 30%{transform:scaleY(1.8) translateY(-8%);opacity:0.7} 70%{transform:scaleY(0.55) translateY(5%);opacity:1.3} }
        @keyframes nd-col     { 0%,100%{transform:scaleY(1);opacity:1} 50%{transform:scaleY(2.5);opacity:0.4} }
        @keyframes nd-frost   { 0%,100%{opacity:inherit;transform:translateY(0)} 50%{opacity:0.15;transform:translateY(-9px)} }
        @keyframes nd-snow    { 0%{opacity:0;transform:translateY(0) translateX(0)} 8%{opacity:inherit} 90%{opacity:0.4} 100%{opacity:0;transform:translateY(110vh) translateX(var(--snow-drift))} }
        @keyframes nd-crystal { 0%,100%{opacity:0.8;transform:rotate(0deg)} 50%{opacity:1;transform:rotate(30deg)} }
        @keyframes nd-star    { 0%,100%{opacity:0.9;transform:scale(1)} 50%{opacity:1;transform:scale(1.3)} }
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
      {/* 4 layered heat glow zones - BRIGHT ORANGE GLOW */}
      <div className="absolute bottom-0 left-0 right-0 h-[62%]"
        style={{ background: 'linear-gradient(to top, rgba(215,153,33,0.5), rgba(214,93,14,0.3) 45%, transparent)', animation: 'gv-glow 4s ease-in-out infinite' }} />
      <div className="absolute bottom-0 left-[5%] right-[5%] h-[45%]"
        style={{ background: 'radial-gradient(ellipse at bottom, rgba(214,93,14,0.6), transparent 60%)', animation: 'gv-glow 5.5s ease-in-out 1.2s infinite' }} />
      <div className="absolute bottom-0 left-[20%] right-[20%] h-[32%]"
        style={{ background: 'radial-gradient(ellipse at bottom, rgba(204,36,29,0.5), transparent 55%)', animation: 'gv-glow 4.5s ease-in-out 2.4s infinite' }} />
      <div className="absolute bottom-0 left-[35%] right-[35%] h-[20%]"
        style={{ background: 'radial-gradient(ellipse at bottom, rgba(255,180,50,0.4), transparent 50%)', animation: 'gv-glow 3.5s ease-in-out 3.6s infinite' }} />
      {/* Glowing coal bed strip - VISIBLY PULSING */}
      <div className="absolute bottom-0 left-0 right-0 h-[3px]"
        style={{ background: 'linear-gradient(90deg, transparent 5%, rgba(215,153,33,0.8) 20%, rgba(255,200,60,0.9) 50%, rgba(215,153,33,0.8) 80%, transparent 95%)', filter: 'blur(1px)', animation: 'gv-coal 3s ease-in-out infinite' }} />
      {/* Molten lava pools - BRIGHT GLOWING POOLS */}
      {lavaPoolPositions.map((pos, i) => (
        <div key={`pool${i}`} className="absolute bottom-0"
          style={{ left: `${pos - 12}%`, width: '24%', height: '6%',
            background: `radial-gradient(ellipse at center bottom, rgba(255,${160 - i * 20},30,0.7), rgba(214,93,14,0.4) 50%, transparent 75%)`,
            filter: 'blur(3px)', animation: `gv-pool ${4 + i * 1.5}s ease-in-out ${i * 1.2}s infinite` }} />
      ))}
      {/* 8 lava crack lines - CLEARLY GLOWING VEINS */}
      {[8, 18, 30, 43, 55, 67, 78, 90].map((x, i) => (
        <div key={`c${i}`} className="absolute bottom-0"
          style={{ left: `${x}%`, width: '2px', height: `${12 + i * 5}%`,
            background: `linear-gradient(to top, rgba(${i % 3 === 0 ? '215,153,33' : i % 3 === 1 ? '214,93,14' : '204,36,29'},${0.7 - i * 0.03}), transparent)`,
            filter: 'blur(1.5px)',
            boxShadow: `0 0 8px rgba(215,153,33,0.6)`,
            animation: `gv-crack ${2.5 + i * 1.1}s ease-in-out ${i * 0.55}s infinite` }} />
      ))}
      {/* Heat distortion shimmer - MORE VISIBLE */}
      <div className="absolute bottom-0 left-0 right-0 h-[30%]"
        style={{ animation: 'gv-shimmer 1.8s ease-in-out infinite', filter: 'blur(2px)',
          background: 'linear-gradient(to top, rgba(215,100,14,0.15), transparent)' }} />
      {/* 5 smoke wisps - VISIBLE SMOKE COLUMNS */}
      {[12, 28, 46, 62, 80].map((x, i) => (
        <div key={`sm${i}`} className="absolute"
          style={{ left: `${x}%`, bottom: '8%', width: `${30 + i * 8}px`, height: '20%',
            background: `radial-gradient(ellipse at center bottom, rgba(80,60,40,0.3), transparent 65%)`,
            filter: 'blur(12px)',
            animation: `gv-smoke ${6 + i * 2}s ease-out ${i * 1.4}s infinite` }} />
      ))}
      {/* Embers: tiny fast, medium, large cinders - VISIBLE SPARKS */}
      {embers.map((e, i) => (
        <div key={`em${i}`} className="absolute rounded-full"
          style={{ left: `${e.x}%`, bottom: '0',
            width: `${e.size}px`, height: `${e.size}px`,
            background: e.color, opacity: 0,
            boxShadow: `0 0 ${e.size * 4}px ${e.color}`,
            ['--gv-drift' as string]: `${e.drift}px`,
            animation: `gv-rise ${e.dur}s ease-out ${e.delay}s infinite` }} />
      ))}
      {/* Ash particles drifting down - VISIBLE ASH */}
      {ash.map((a, i) => (
        <div key={`ash${i}`} className="absolute rounded-full opacity-0"
          style={{ left: `${a.x}%`, top: '-2%', width: `${a.size}px`, height: `${a.size}px`,
            background: `rgba(${120 + i * 3},${100 + i * 2},${80 + i},0.6)`,
            ['--ash-drift' as string]: `${a.drift}px`,
            animation: `gv-ash ${a.dur}s linear ${a.delay}s infinite` }} />
      ))}
      <style>{`
        @keyframes gv-glow   { 0%,100%{opacity:1} 50%{opacity:1.3} }
        @keyframes gv-coal   { 0%,100%{opacity:0.8} 50%{opacity:1} }
        @keyframes gv-rise   { 0%{opacity:0.8;transform:translateY(0) translateX(0)} 50%{opacity:0.5} 100%{opacity:0;transform:translateY(-320px) translateX(var(--gv-drift))} }
        @keyframes gv-crack  { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes gv-shimmer{ 0%,100%{transform:translateX(0) skewX(0deg)} 33%{transform:translateX(2px) skewX(0.3deg)} 66%{transform:translateX(-2px) skewX(-0.3deg)} }
        @keyframes gv-pool   { 0%,100%{opacity:0.9;transform:scaleX(1)} 50%{opacity:1;transform:scaleX(1.08)} }
        @keyframes gv-smoke  { 0%{opacity:0;transform:translateY(0) scaleX(1)} 15%{opacity:0.8} 75%{opacity:0.3} 100%{opacity:0;transform:translateY(-180px) scaleX(2.5)} }
        @keyframes gv-ash    { 0%{opacity:0;transform:translateY(0) translateX(0)} 10%{opacity:0.6} 90%{opacity:0.3} 100%{opacity:0;transform:translateY(110vh) translateX(var(--ash-drift))} }
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
      opacity: 0.3 + rand() * 0.4,
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
      {/* 5 fog/mist layers - SOFT BUT VISIBLE */}
      <div className="absolute w-[650px] h-[400px] top-[18%] right-[-12%] rounded-full"
        style={{ background: 'radial-gradient(ellipse, rgba(235,111,146,0.25), transparent 50%)', filter: 'blur(30px)', animation: 'rp-drift-a 22s ease-in-out infinite' }} />
      <div className="absolute w-[520px] h-[350px] bottom-[8%] left-[-12%] rounded-full"
        style={{ background: 'radial-gradient(ellipse, rgba(196,167,231,0.3), transparent 50%)', filter: 'blur(28px)', animation: 'rp-drift-b 28s ease-in-out infinite' }} />
      <div className="absolute w-[420px] h-[300px] top-[45%] left-[35%] rounded-full"
        style={{ background: 'radial-gradient(ellipse, rgba(246,193,119,0.25), transparent 50%)', filter: 'blur(22px)', animation: 'rp-drift-c 34s ease-in-out 6s infinite' }} />
      <div className="absolute w-[380px] h-[260px] top-[5%] left-[20%] rounded-full"
        style={{ background: 'radial-gradient(ellipse, rgba(235,111,146,0.2), transparent 50%)', filter: 'blur(20px)', animation: 'rp-drift-a 40s ease-in-out 10s infinite reverse' }} />
      <div className="absolute w-[300px] h-[200px] bottom-[25%] right-[10%] rounded-full"
        style={{ background: 'radial-gradient(ellipse, rgba(196,167,231,0.2), transparent 50%)', filter: 'blur(18px)', animation: 'rp-drift-b 30s ease-in-out 4s infinite reverse' }} />
      {/* Moonbeam diagonal shaft - VISIBLE LIGHT CAST */}
      <div className="absolute" style={{
        top: '-10%', left: '-5%', width: '60%', height: '80%',
        background: 'linear-gradient(135deg, rgba(246,193,119,0.2) 0%, rgba(235,111,146,0.15) 30%, transparent 60%)',
        filter: 'blur(20px)',
        animation: 'rp-moonbeam 18s ease-in-out infinite',
      }} />
      {/* SVG: branch silhouettes + flower blooms + dew drops */}
      <svg className="absolute inset-0 w-full h-full">
        {/* Branch/vine silhouettes framing edges - CLEARLY DARK AGAINST BACKGROUND */}
        <path d="M0,40 Q15,20 25,35 Q35,50 50,30 Q60,15 70,25 Q80,35 90,20"
          fill="none" stroke="rgba(40,30,45,0.7)" strokeWidth="2" />
        <path d="M0,60 Q10,45 20,55 Q30,65 45,48 Q55,32 65,42"
          fill="none" stroke="rgba(40,30,45,0.6)" strokeWidth="1.5" />
        <path d="M100,30 Q88,18 80,28 Q72,38 62,22 Q54,10 44,18"
          fill="none" stroke="rgba(40,30,45,0.65)" strokeWidth="1.8" />
        <path d="M0,85 Q12,75 22,82 Q32,89 42,78"
          fill="none" stroke="rgba(40,30,45,0.5)" strokeWidth="1.3" />
        {/* Flower bloom clusters - SOFT BUT VISIBLE PINK/PURPLE GLOWS */}
        {[
          [20, 28], [48, 22], [70, 18], [85, 24], [10, 52], [62, 38],
        ].map(([cx, cy], i) => (
          <g key={`bloom${i}`} style={{ animation: `rp-bloom ${3 + i * 0.8}s ease-in-out ${i * 1.2}s infinite`, transformOrigin: `${cx}% ${cy}%` }}>
            {[0, 90, 180, 270].map((a) => {
              const rad = a * Math.PI / 180;
              const r = 3;
              return (
                <circle key={a} cx={`${cx + Math.cos(rad) * r}%`} cy={`${cy + Math.sin(rad) * r}%`} r="1.5"
                  fill={i % 3 === 0 ? 'rgba(235,111,146,0.7)' : i % 3 === 1 ? 'rgba(196,167,231,0.7)' : 'rgba(246,193,119,0.7)'} />
              );
            })}
            <circle cx={`${cx}%`} cy={`${cy}%`} r="1"
              fill={i % 3 === 0 ? 'rgba(246,193,119,0.8)' : 'rgba(235,111,146,0.8)'} />
          </g>
        ))}
        {/* Dew drops on branches - MORE VISIBLE */}
        {dewDrops.map((d, i) => (
          <circle key={`dew${i}`} cx={`${d.x}%`} cy={`${d.y}%`} r={d.size}
            fill="rgba(255,255,255,0.3)"
            stroke="rgba(246,193,119,0.5)" strokeWidth="0.8"
            style={{ animation: `rp-dew ${d.dur}s ease-in-out ${d.delay}s infinite` }} />
        ))}
      </svg>
      {/* Round petals - CLEARLY VISIBLE FALLING */}
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
      {/* Fireflies with glow halos - MORE VISIBLE GLOWING INSECTS */}
      {fireflies.map((f, i) => (
        <div key={`ff${i}`} className="absolute"
          style={{ left: `${f.x}%`, top: `${f.y}%`, animation: `rp-fly ${f.dur}s ease-in-out ${f.delay}s infinite`, opacity: 0 }}>
          {/* Outer diffuse halo - BRIGHTER */}
          <div className="absolute rounded-full"
            style={{ top: '-6px', left: '-6px', width: '14px', height: '14px',
              background: `radial-gradient(circle, ${glowColors[f.glowColor]}0.4), transparent 70%)`,
              filter: 'blur(4px)' }} />
          {/* Core dot - BRIGHTER */}
          <div className="absolute rounded-full"
            style={{ width: '3px', height: '3px',
              background: f.glowColor === 0 ? '#f6c177' : f.glowColor === 1 ? '#eb6f92' : '#c4a7e7',
              boxShadow: `0 0 8px ${f.glowColor === 0 ? '#f6c177' : f.glowColor === 1 ? '#eb6f92' : '#c4a7e7'}` }} />
        </div>
      ))}
      {/* Wind-blown horizontal particles */}
      {windParticles.map((w, i) => (
        <div key={`wp${i}`} className="absolute rounded-full"
          style={{ left: '-2%', top: `${w.y}%`, width: `${w.size}px`, height: `${w.size}px`,
            background: i % 3 === 0 ? 'rgba(246,193,119,0.7)' : i % 3 === 1 ? 'rgba(235,111,146,0.7)' : 'rgba(196,167,231,0.7)',
            opacity: 0, animation: `rp-wind ${w.dur}s linear ${w.delay}s infinite` }} />
      ))}
      <style>{`
        @keyframes rp-fall      { 0%{opacity:0;transform:translateY(0) translateX(0) rotate(0deg)} 8%{opacity:0.6} 88%{opacity:0.4} 100%{opacity:0;transform:translateY(110vh) translateX(var(--rp-drift)) rotate(720deg)} }
        @keyframes rp-drift-a   { 0%,100%{transform:translate(0,0)} 33%{transform:translate(-28px,18px)} 66%{transform:translate(14px,-12px)} }
        @keyframes rp-drift-b   { 0%,100%{transform:translate(0,0)} 33%{transform:translate(22px,-16px)} 66%{transform:translate(-18px,12px)} }
        @keyframes rp-drift-c   { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-16px,20px)} }
        @keyframes rp-fly       { 0%,100%{opacity:0;transform:translate(0,0)} 15%{opacity:0.8} 50%{opacity:0.6;transform:translate(18px,-14px)} 80%{opacity:0.8} }
        @keyframes rp-wind      { 0%{opacity:0;left:-2%} 10%{opacity:inherit} 90%{opacity:inherit} 100%{opacity:0;left:102%} }
        @keyframes rp-bloom     { 0%,100%{opacity:0.7;transform:scale(0.9)} 50%{opacity:1;transform:scale(1.15)} }
        @keyframes rp-dew       { 0%,100%{opacity:0.7;r:inherit} 50%{opacity:1;r:inherit} }
        @keyframes rp-moonbeam  { 0%,100%{opacity:0.8} 50%{opacity:1} }
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
      opacity: 0.25 + rand() * 0.3,
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
      {/* 3-layer depth gradient - MORE VISIBLE DEPTH */}
      <div className="absolute inset-0"
        style={{ background: 'linear-gradient(180deg, rgba(45,212,191,0.15) 0%, rgba(34,211,238,0.25) 35%, rgba(20,150,140,0.35) 65%, rgba(10,80,80,0.45) 100%)' }} />
      {/* Water surface caustic ripple pattern at top - MORE VISIBLE */}
      <div className="absolute top-0 left-0 right-0 h-[12%]"
        style={{ background: 'repeating-linear-gradient(80deg, transparent, transparent 18px, rgba(45,212,191,0.2) 18px, rgba(45,212,191,0.2) 19px), repeating-linear-gradient(-80deg, transparent, transparent 22px, rgba(34,211,238,0.15) 22px, rgba(34,211,238,0.15) 23px)',
          filter: 'blur(1px)', animation: 'ab-surface 4s ease-in-out infinite' }} />
      {/* Caustic light lines - VISIBLY SHIMMERING */}
      {causticLines.map((c, i) => (
        <div key={`cl${i}`} className="absolute left-[-5%] right-[-5%]"
          style={{ top: `${c.top}%`, height: '2px',
            background: `linear-gradient(90deg, transparent 3%, rgba(45,212,191,${c.opacity * 0.6}) 15%, rgba(45,212,191,${c.opacity}) 40%, rgba(34,211,238,${c.opacity * 1.2}) 50%, rgba(45,212,191,${c.opacity}) 60%, rgba(45,212,191,${c.opacity * 0.6}) 85%, transparent 97%)`,
            filter: 'blur(1.5px)',
            animation: `ab-caustic ${c.dur}s ease-in-out ${c.delay}s infinite` }} />
      ))}
      {/* Bioluminescent orbs - CLEARLY VISIBLE GLOWING CREATURES */}
      {orbs.map((o, i) => (
        <div key={`o${i}`} className="absolute" style={{ left: `${o.x}%`, top: `${o.y}%`, opacity: 0, animation: `ab-glow ${o.dur}s ease-in-out ${o.delay}s infinite` }}>
          {/* Outer diffuse - BRIGHTER */}
          <div className="absolute rounded-full"
            style={{ top: `-${o.size * 0.8}px`, left: `-${o.size * 0.8}px`,
              width: `${o.size * 3.6}px`, height: `${o.size * 3.6}px`,
              background: `radial-gradient(circle, ${o.color}60, transparent 60%)`,
              filter: 'blur(4px)' }} />
          {/* Inner bright core */}
          <div className="absolute rounded-full"
            style={{ width: `${o.size}px`, height: `${o.size}px`,
              background: o.color,
              boxShadow: `0 0 ${o.size * 3}px ${o.color}, 0 0 ${o.size * 6}px ${o.color}80` }} />
        </div>
      ))}
      {/* Rising bubbles - OBVIOUS FLOATING BUBBLES */}
      {bubbles.map((b, i) => (
        <div key={`b${i}`} className="absolute rounded-full opacity-0"
          style={{ left: `${b.x}%`, bottom: '-4%',
            width: `${b.size}px`, height: `${b.size}px`,
            border: `1px solid rgba(45,212,191,${0.4 + (i % 3) * 0.2})`,
            background: `radial-gradient(circle at 30% 30%, rgba(45,212,191,0.3), transparent 60%)`,
            ['--ab-drift' as string]: `${b.drift}px`,
            animation: `ab-bubble ${b.dur}s ease-out ${b.delay}s infinite` }} />
      ))}
      {/* Marine snow - OBVIOUS WHITE PARTICLES */}
      {marineSnow.map((m, i) => (
        <div key={`ms${i}`} className="absolute rounded-full opacity-0"
          style={{ left: `${m.x}%`, top: '-2%',
            width: `${m.size}px`, height: `${m.size}px`,
            background: `rgba(200,240,240,${0.5 + (i % 4) * 0.2})`,
            ['--ab-snow-drift' as string]: `${m.drift}px`,
            animation: `ab-snow ${m.dur}s linear ${m.delay}s infinite` }} />
      ))}
      {/* Jellyfish - CLEARLY VISIBLE BIOLUMINESCENT SHAPES */}
      {jellies.map((j, i) => (
        <div key={`jf${i}`} className="absolute"
          style={{ left: `${j.x}%`, top: `${j.y}%`, width: `${j.size * 2}px`, height: `${j.size * 2.5}px`,
            animation: `ab-jelly ${j.dur}s ease-in-out ${j.delay}s infinite`, opacity: 0.6 }}>
          <svg viewBox="0 0 60 80" className="w-full h-full">
            <defs>
              <radialGradient id={`jf-grad-${i}`} cx="50%" cy="40%">
                <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.8" />
                <stop offset="60%" stopColor="#22d3ee" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0" />
              </radialGradient>
            </defs>
            {/* Dome - GLOWING */}
            <ellipse cx="30" cy="28" rx="24" ry="20" fill={`url(#jf-grad-${i})`} stroke="rgba(45,212,191,0.8)" strokeWidth="1.2" />
            {/* Inner highlight - BRIGHTER */}
            <ellipse cx="30" cy="26" rx="16" ry="12" fill="rgba(45,212,191,0.3)" />
            {/* Tentacles - MORE VISIBLE */}
            <path d="M18,46 Q14,56 17,66 Q19,72 16,78" fill="none" stroke="rgba(45,212,191,0.6)" strokeWidth="1.5">
              <animate attributeName="d" values="M18,46 Q14,56 17,66 Q19,72 16,78;M18,46 Q22,56 19,66 Q17,72 20,78;M18,46 Q14,56 17,66 Q19,72 16,78" dur="3s" repeatCount="indefinite" />
            </path>
            <path d="M24,47 Q22,57 25,67 Q27,73 24,78" fill="none" stroke="rgba(45,212,191,0.5)" strokeWidth="1.5">
              <animate attributeName="d" values="M24,47 Q22,57 25,67 Q27,73 24,78;M24,47 Q26,57 23,67 Q21,73 26,78;M24,47 Q22,57 25,67 Q27,73 24,78" dur="3.5s" repeatCount="indefinite" />
            </path>
            <path d="M36,47 Q38,57 35,67 Q33,73 36,78" fill="none" stroke="rgba(45,212,191,0.5)" strokeWidth="1.5">
              <animate attributeName="d" values="M36,47 Q38,57 35,67 Q33,73 36,78;M36,47 Q34,57 37,67 Q39,73 34,78;M36,47 Q38,57 35,67 Q33,73 36,78" dur="2.8s" repeatCount="indefinite" />
            </path>
            <path d="M42,46 Q46,56 43,66 Q41,72 44,78" fill="none" stroke="rgba(45,212,191,0.6)" strokeWidth="1.5">
              <animate attributeName="d" values="M42,46 Q46,56 43,66 Q41,72 44,78;M42,46 Q38,56 41,66 Q43,72 40,78;M42,46 Q46,56 43,66 Q41,72 44,78" dur="3.2s" repeatCount="indefinite" />
            </path>
          </svg>
        </div>
      ))}
      {/* SVG: kelp/seaweed + sonar pings */}
      <svg className="absolute inset-0 w-full h-full">
        {/* 5 kelp silhouettes - CLEARLY DARK SHAPES */}
        {[5, 18, 35, 62, 82].map((kx, i) => (
          <g key={`kelp${i}`} style={{ animation: `ab-sway ${4 + i * 0.8}s ease-in-out ${i * 0.6}s infinite`, transformOrigin: `${kx}% 100%` }}>
            <path d={`M${kx * 10},1000 Q${kx * 10 - 15},${950 - i * 30} ${kx * 10 + 10},${900 - i * 25} Q${kx * 10 - 8},${850 - i * 20} ${kx * 10 + 5},${800 - i * 35}`}
              fill="none" stroke={`rgba(20,120,100,${0.6 + i * 0.1})`} strokeWidth={3 + (i % 2)} />
          </g>
        ))}
        {/* Sonar pings - VISIBLY PULSING RINGS */}
        {sonars.map((s, i) => (
          <g key={`sonar${i}`}>
            <circle cx={`${s.x}%`} cy={`${s.y}%`} r="0"
              fill="none" stroke="rgba(45,212,191,0.5)" strokeWidth="2">
              <animate attributeName="r" from="0" to="80" dur={`${s.dur}s`} begin={`${s.delay}s`} repeatCount="indefinite" />
              <animate attributeName="opacity" from="0.8" to="0" dur={`${s.dur}s`} begin={`${s.delay}s`} repeatCount="indefinite" />
            </circle>
            <circle cx={`${s.x}%`} cy={`${s.y}%`} r="0"
              fill="none" stroke="rgba(34,211,238,0.4)" strokeWidth="1.5">
              <animate attributeName="r" from="0" to="80" dur={`${s.dur}s`} begin={`${s.delay + s.dur * 0.33}s`} repeatCount="indefinite" />
              <animate attributeName="opacity" from="0.6" to="0" dur={`${s.dur}s`} begin={`${s.delay + s.dur * 0.33}s`} repeatCount="indefinite" />
            </circle>
          </g>
        ))}
      </svg>
      <style>{`
        @keyframes ab-surface  { 0%,100%{transform:translateX(0)} 50%{transform:translateX(6px)} }
        @keyframes ab-caustic  { 0%,100%{transform:translateX(0) scaleX(1);opacity:0.9} 50%{transform:translateX(4%) scaleX(1.08);opacity:1} }
        @keyframes ab-glow     { 0%,100%{opacity:0} 20%{opacity:0.7} 80%{opacity:0.7} }
        @keyframes ab-bubble   { 0%{opacity:0;transform:translateY(0)} 8%{opacity:0.7} 90%{opacity:0.3} 100%{opacity:0;transform:translateY(-110vh) translateX(var(--ab-drift))} }
        @keyframes ab-snow     { 0%{opacity:0;transform:translateY(0) translateX(0)} 10%{opacity:0.8} 90%{opacity:0.4} 100%{opacity:0;transform:translateY(110vh) translateX(var(--ab-snow-drift))} }
        @keyframes ab-jelly    { 0%,100%{transform:translateY(0);opacity:0.6} 50%{transform:translateY(-18px);opacity:0.8} }
        @keyframes ab-sway     { 0%,100%{transform:skewX(0deg)} 50%{transform:skewX(4deg)} }
      `}</style>
    </Shell>
  );
}

/* -- Ember: Volcanic fire, lava rivers, magma pools, cinder vortex -- */
function EmberBg() {
  const sparksSmall = useMemo(() => {
    const rand = seededRand(661);
    return Array.from({ length: 50 }, () => ({
      x: rand() * 100,
      size: 2 + rand() * 3,
      dur: 1.2 + rand() * 1.8,
      delay: rand() * 9,
      drift: (rand() - 0.5) * 80,
    }));
  }, []);
  const sparksMed = useMemo(() => {
    const rand = seededRand(662);
    return Array.from({ length: 35 }, () => ({
      x: rand() * 100,
      size: 4 + rand() * 4,
      dur: 2 + rand() * 2.5,
      delay: rand() * 10,
      drift: (rand() - 0.5) * 100,
      color: rand() > 0.5 ? '#fbbf24' : '#f97316',
    }));
  }, []);
  const sparksLarge = useMemo(() => {
    const rand = seededRand(663);
    return Array.from({ length: 25 }, () => ({
      x: rand() * 100,
      size: 6 + rand() * 4,
      dur: 3 + rand() * 4,
      delay: rand() * 12,
      drift: (rand() - 0.5) * 120,
    }));
  }, []);
  const debris = useMemo(() => {
    const rand = seededRand(664);
    return Array.from({ length: 15 }, () => ({
      x: rand() * 100,
      size: 4 + rand() * 6,
      dur: 4 + rand() * 5,
      delay: rand() * 14,
      rot: rand() * 360,
    }));
  }, []);
  const vortex = useMemo(() => {
    const rand = seededRand(665);
    return Array.from({ length: 24 }, (_, i) => ({
      angle: (i / 24) * 360,
      r: 40 + rand() * 35,
      size: 3 + rand() * 5,
      dur: 3 + rand() * 3,
      delay: rand() * 4,
      color: rand() > 0.5 ? '#fbbf24' : rand() > 0.3 ? '#f97316' : '#ef4444',
    }));
  }, []);
  const smoke = useMemo(() => {
    const rand = seededRand(666);
    return Array.from({ length: 8 }, () => ({
      x: 10 + rand() * 80,
      dur: 18 + rand() * 12,
      delay: rand() * 10,
      w: 100 + rand() * 120,
    }));
  }, []);
  return (
    <Shell>
      {/* Intense volcanic glow layers */}
      <div className="absolute bottom-0 left-0 right-0 h-[70%]"
        style={{ background: 'linear-gradient(to top, rgba(249,115,22,0.65), rgba(239,68,68,0.4) 40%, rgba(251,191,36,0.15) 70%, transparent)', animation: 'em-heat 3.5s ease-in-out infinite' }} />
      <div className="absolute bottom-0 left-[5%] right-[5%] h-[60%]"
        style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(251,191,36,0.55), rgba(249,115,22,0.3) 50%, transparent 70%)', animation: 'em-heat 5s ease-in-out 1s infinite' }} />
      <div className="absolute bottom-0 left-[15%] right-[15%] h-[50%]"
        style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(239,68,68,0.45), rgba(220,38,127,0.25) 60%, transparent)', animation: 'em-heat 4s ease-in-out 2s infinite' }} />
      <div className="absolute bottom-0 left-[25%] right-[25%] h-[40%]"
        style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(255,220,80,0.6), transparent 65%)', animation: 'em-heat 4.5s ease-in-out 0.5s infinite' }} />
      <div className="absolute bottom-0 left-[35%] right-[35%] h-[30%]"
        style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(255,255,120,0.7), transparent 70%)', animation: 'em-heat 3s ease-in-out 1.8s infinite' }} />
      {/* Bright lava vein rivers */}
      {[6, 14, 22, 33, 44, 54, 63, 72, 82, 91].map((x, i) => (
        <div key={`v${i}`} className="absolute bottom-0"
          style={{ left: `${x}%`, width: `${4 + (i % 3) * 2}px`, height: `${25 + (i % 5) * 10}%`,
            background: `linear-gradient(to top, rgba(${i % 2 === 0 ? '251,191,36' : '249,115,22'},0.9), rgba(239,68,68,0.6) 60%, rgba(220,38,127,0.3) 80%, transparent)`,
            filter: 'blur(1px)',
            boxShadow: `0 0 8px rgba(249,115,22,0.6), 0 0 16px rgba(251,191,36,0.3)`,
            animation: `em-vein ${3 + i * 0.9}s ease-in-out ${i * 0.55}s infinite` }} />
      ))}
      {/* Flowing lava streams */}
      {[78, 83, 87, 91, 95].map((y, i) => (
        <div key={`h${i}`} className="absolute left-0 right-0"
          style={{ bottom: `${100 - y}%`, height: `${3 + i * 2}px`,
            background: `linear-gradient(90deg, transparent 5%, rgba(249,115,22,0.5) 20%, rgba(251,191,36,0.8) 50%, rgba(249,115,22,0.5) 80%, transparent 95%)`,
            animation: `em-flow ${5 + i * 1.8}s ease-in-out ${i * 1.5}s infinite` }} />
      ))}
      {/* Glowing magma pools */}
      {[20, 50, 78].map((x, i) => (
        <div key={`pool${i}`} className="absolute bottom-0"
          style={{ left: `${x - 12}%`, width: '24%', height: '10%',
            background: `radial-gradient(ellipse, rgba(${i % 2 === 0 ? '255,220,80' : '251,191,36'},0.8), rgba(249,115,22,0.5) 40%, rgba(239,68,68,0.3) 70%, transparent)`,
            borderRadius: '50%', filter: 'blur(2px)',
            boxShadow: `0 0 30px rgba(251,191,36,0.6), 0 0 60px rgba(249,115,22,0.3)`,
            animation: `em-pool ${2.5 + i * 1.2}s ease-in-out ${i * 0.8}s infinite` }} />
      ))}
      {/* Visible heat shimmer */}
      <div className="absolute bottom-0 left-0 right-0 h-[45%]"
        style={{ background: 'linear-gradient(to top, rgba(255,200,100,0.25), rgba(255,160,50,0.15) 50%, transparent)', filter: 'blur(3px)', animation: 'em-shimmer 1.8s ease-in-out infinite' }} />
      {/* Dense smoke columns */}
      {smoke.map((s, i) => (
        <div key={`sm${i}`} className="absolute bottom-[3%]"
          style={{ left: `${s.x}%`, width: `${s.w}px`, height: '75%',
            background: 'linear-gradient(to top, rgba(80,50,50,0.7), rgba(60,40,40,0.5) 30%, rgba(40,30,30,0.3) 60%, rgba(20,15,15,0.15) 80%, transparent)',
            filter: 'blur(12px)', animation: `em-smoke ${s.dur}s ease-in-out ${s.delay}s infinite` }} />
      ))}
      {/* Flying rock debris */}
      {debris.map((d, i) => (
        <div key={`db${i}`} className="absolute"
          style={{ left: `${d.x}%`, bottom: '0', width: `${d.size}px`, height: `${d.size * 0.8}px`,
            background: 'rgba(80,40,15,0.8)', borderRadius: '3px', opacity: 0,
            transform: `rotate(${d.rot}deg)`,
            boxShadow: '0 0 4px rgba(80,40,15,0.4)',
            animation: `em-debris ${d.dur}s ease-out ${d.delay}s infinite` }} />
      ))}
      {/* Ember vortex swirl */}
      <div className="absolute" style={{ left: '50%', bottom: '18%', width: '0', height: '0' }}>
        {vortex.map((v, i) => {
          const rad = (v.angle * Math.PI) / 180;
          const px = Math.cos(rad) * v.r;
          const py = Math.sin(rad) * v.r;
          return (
            <div key={`vo${i}`} className="absolute rounded-full"
              style={{ left: `${px}px`, top: `${py}px`, width: `${v.size}px`, height: `${v.size}px`,
                background: v.color, opacity: 0,
                boxShadow: `0 0 ${v.size * 5}px ${v.color}`,
                animation: `em-vortex ${v.dur}s ease-in-out ${v.delay}s infinite` }} />
          );
        })}
      </div>
      {/* Bright rising sparks */}
      {sparksSmall.map((s, i) => (
        <div key={`ss${i}`} className="absolute rounded-full"
          style={{ left: `${s.x}%`, bottom: '0', width: `${s.size}px`, height: `${s.size}px`,
            background: '#fde68a', opacity: 0,
            boxShadow: '0 0 10px #fbbf24, 0 0 20px rgba(251,191,36,0.4)',
            animation: `em-sparkS ${s.dur}s ease-out ${s.delay}s infinite`,
            ['--dr' as string]: `${s.drift}px` }} />
      ))}
      {/* Medium ember particles */}
      {sparksMed.map((s, i) => (
        <div key={`smk${i}`} className="absolute rounded-full"
          style={{ left: `${s.x}%`, bottom: '0', width: `${s.size}px`, height: `${s.size}px`,
            background: s.color, opacity: 0,
            boxShadow: `0 0 ${s.size * 4}px ${s.color}, 0 0 ${s.size * 8}px rgba(249,115,22,0.3)`,
            animation: `em-sparkM ${s.dur}s ease-out ${s.delay}s infinite`,
            ['--dr' as string]: `${s.drift}px` }} />
      ))}
      {/* Large glowing cinders */}
      {sparksLarge.map((s, i) => (
        <div key={`sl${i}`} className="absolute rounded-full"
          style={{ left: `${s.x}%`, bottom: '0', width: `${s.size}px`, height: `${s.size}px`,
            background: '#ef4444', opacity: 0,
            boxShadow: `0 0 ${s.size * 6}px rgba(239,68,68,0.8), 0 0 ${s.size * 12}px rgba(220,38,127,0.4)`,
            animation: `em-sparkL ${s.dur}s ease-out ${s.delay}s infinite`,
            ['--dr' as string]: `${s.drift}px` }} />
      ))}
      <style>{`
        @keyframes em-heat { 0%,100%{opacity:1} 50%{opacity:1.4} }
        @keyframes em-vein { 0%,100%{opacity:1;transform:scaleY(1)} 50%{opacity:0.7;transform:scaleY(0.9)} }
        @keyframes em-flow { 0%,100%{transform:translateX(-8%) scaleX(1)} 50%{transform:translateX(8%) scaleX(1.15)} }
        @keyframes em-pool { 0%,100%{transform:scaleX(1) scaleY(1);opacity:1} 50%{transform:scaleX(1.3) scaleY(1.5);opacity:0.7} }
        @keyframes em-shimmer { 0%,100%{transform:translateX(0) skewX(0deg)} 33%{transform:translateX(4px) skewX(0.8deg)} 66%{transform:translateX(-4px) skewX(-0.8deg)} }
        @keyframes em-smoke { 0%,100%{transform:translateY(0) scaleX(1);opacity:1} 50%{transform:translateY(-50px) scaleX(1.6);opacity:0.5} }
        @keyframes em-debris { 0%{opacity:0.8;transform:translateY(0) rotate(0deg)} 15%{opacity:0.7} 100%{opacity:0;transform:translateY(-400px) translateX(60px) rotate(900deg)} }
        @keyframes em-vortex { 0%,100%{opacity:0;transform:translate(-50%,-50%) scale(0.2)} 50%{opacity:0.9;transform:translate(-50%,-50%) scale(1.3)} }
        @keyframes em-sparkS { 0%{opacity:0.9;transform:translateY(0) translateX(0)} 100%{opacity:0;transform:translateY(-280px) translateX(var(--dr))} }
        @keyframes em-sparkM { 0%{opacity:0.8;transform:translateY(0) translateX(0)} 30%{opacity:0.6} 100%{opacity:0;transform:translateY(-380px) translateX(var(--dr))} }
        @keyframes em-sparkL { 0%{opacity:0.7;transform:translateY(0) translateX(0)} 40%{opacity:0.5} 100%{opacity:0;transform:translateY(-480px) translateX(var(--dr))} }
      `}</style>
    </Shell>
  );
}

/* -- Aurora: Mountain silhouette, star field, rich curtains, electric crackle -- */
function AuroraBg() {
  const stars = useMemo(() => {
    const rand = seededRand(771);
    return Array.from({ length: 120 }, () => ({
      x: rand() * 100, y: rand() * 70,
      size: 0.8 + rand() * 2,
      opacity: 0.3 + rand() * 0.7,
      dur: 2 + rand() * 5,
      delay: rand() * 10,
    }));
  }, []);
  const particles = useMemo(() => {
    const rand = seededRand(772);
    return Array.from({ length: 40 }, () => ({
      x: rand() * 100, y: rand() * 60,
      size: 2 + rand() * 4,
      dur: 3 + rand() * 6,
      delay: rand() * 10,
      color: rand() > 0.4 ? '#a78bfa' : rand() > 0.2 ? '#34d399' : '#22d3ee',
    }));
  }, []);
  const crackles = useMemo(() => {
    const rand = seededRand(773);
    return Array.from({ length: 6 }, () => ({
      x1: 10 + rand() * 80, y1: 5 + rand() * 30,
      x2: 10 + rand() * 80, y2: 10 + rand() * 40,
      dur: 8 + rand() * 8,
      delay: rand() * 12,
    }));
  }, []);
  const cols = useMemo(() => {
    const rand = seededRand(774);
    const palette = ['#a78bfa', '#34d399', '#22d3ee', '#c084fc', '#818cf8', '#6ee7b7', '#e879f9', '#06b6d4', '#8b5cf6', '#10b981', '#7c3aed', '#0ea5e9', '#a855f7', '#14b8a6'];
    return Array.from({ length: 20 }, (_, i) => ({
      left: i * 5,
      color: palette[i % palette.length],
      dur: 4 + rand() * 5,
      delay: rand() * 4,
      h: 50 + rand() * 30,
    }));
  }, []);
  return (
    <Shell>
      {/* Deep space background */}
      <div className="absolute top-0 left-0 right-0 h-[50%]"
        style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(100,60,180,0.25), rgba(50,30,100,0.15) 50%, transparent 80%)', filter: 'blur(6px)' }} />
      {/* Bright star field */}
      {stars.map((s, i) => (
        <div key={`st${i}`} className="absolute rounded-full"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.size}px`, height: `${s.size}px`,
            background: i % 4 === 0 ? '#c4b5fd' : i % 3 === 0 ? '#a78bfa' : '#e2e8f0',
            opacity: s.opacity,
            boxShadow: `0 0 4px ${i % 4 === 0 ? '#c4b5fd' : '#e2e8f0'}`,
            animation: `au-twinkle ${s.dur}s ease-in-out ${s.delay}s infinite` }} />
      ))}
      {/* VIVID aurora curtain bands - THE MAIN EVENT */}
      {[
        { c1: '#a78bfa', c2: '#34d399', top: '-10%', h: '70%', dur: '9s', delay: '0s', blur: 25 },
        { c1: '#06b6d4', c2: '#a78bfa', top: '-5%',  h: '60%', dur: '13s', delay: '2s', blur: 30 },
        { c1: '#818cf8', c2: '#6366f1', top: '-8%',  h: '75%', dur: '17s', delay: '5s', blur: 20 },
        { c1: '#e879f9', c2: '#22d3ee', top: '0%',   h: '55%', dur: '11s', delay: '4s', blur: 35 },
        { c1: '#6366f1', c2: '#34d399', top: '-4%',  h: '65%', dur: '15s', delay: '7s', blur: 28 },
        { c1: '#34d399', c2: '#c084fc', top: '2%',   h: '50%', dur: '10s', delay: '3s', blur: 32 },
        { c1: '#7c3aed', c2: '#06b6d4', top: '-6%',  h: '68%', dur: '14s', delay: '6s', blur: 25 },
        { c1: '#22d3ee', c2: '#e879f9', top: '1%',   h: '58%', dur: '12s', delay: '8s', blur: 30 },
      ].map((c, i) => (
        <div key={i} className="absolute left-0 right-0"
          style={{ top: c.top, height: c.h,
            background: `linear-gradient(180deg, ${c.c1}80 0%, ${c.c1}60 20%, ${c.c2}50 40%, ${c.c2}30 60%, transparent 100%)`,
            animation: `au-curtain ${c.dur} ease-in-out ${c.delay} infinite`,
            filter: `blur(${c.blur}px)` }} />
      ))}
      {/* Vertical light pillars */}
      {cols.map((col, i) => (
        <div key={`col${i}`} className="absolute top-0"
          style={{ left: `${col.left}%`, width: '6%', height: `${col.h}%`,
            background: `linear-gradient(180deg, ${col.color}60, ${col.color}40 30%, ${col.color}20 60%, transparent)`,
            animation: `au-col ${col.dur}s ease-in-out ${col.delay}s infinite`,
            filter: 'blur(8px)' }} />
      ))}
      {/* Aurora reflection on ground */}
      <div className="absolute left-0 right-0" style={{ bottom: '0%', height: '25%' }}>
        <div className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, rgba(167,139,250,0.3), rgba(52,211,153,0.2) 30%, rgba(34,211,238,0.15) 60%, transparent)',
            filter: 'blur(4px)', animation: 'au-reflect 12s ease-in-out infinite' }} />
      </div>
      {/* Floating aurora particles */}
      {particles.map((p, i) => (
        <div key={`p${i}`} className="absolute rounded-full"
          style={{ left: `${p.x}%`, top: `${p.y}%`, width: `${p.size}px`, height: `${p.size}px`,
            background: p.color, opacity: 0,
            boxShadow: `0 0 ${p.size * 8}px ${p.color}`,
            animation: `au-spark ${p.dur}s ease-in-out ${p.delay}s infinite` }} />
      ))}
      {/* Electric aurora crackles */}
      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
        {crackles.map((cr, i) => (
          <line key={`cr${i}`} x1={`${cr.x1}%`} y1={`${cr.y1}%`} x2={`${cr.x2}%`} y2={`${cr.y2}%`}
            stroke="rgba(220,200,255,0.8)" strokeWidth="1.5" strokeLinecap="round"
            style={{ filter: 'drop-shadow(0 0 3px rgba(220,200,255,0.6))', animation: `au-crackle ${cr.dur}s ease-in-out ${cr.delay}s infinite` }} />
        ))}
        {/* Mountain range silhouettes */}
        <path d="M0,100 L0,88 L6,80 L11,85 L18,68 L24,75 L32,55 L40,70 L48,48 L55,62 L62,40 L68,58 L76,44 L82,60 L90,50 L95,65 L100,58 L100,100 Z"
          fill="rgba(15,15,25,0.8)" />
        <path d="M0,100 L0,92 L8,86 L14,90 L22,80 L30,88 L38,76 L46,82 L54,72 L60,78 L68,68 L74,75 L82,64 L88,70 L94,62 L100,68 L100,100 Z"
          fill="rgba(8,8,18,0.9)" />
        <path d="M0,100 L0,95 L12,90 L18,93 L26,85 L34,91 L42,82 L50,88 L58,78 L66,84 L74,74 L80,80 L88,70 L94,76 L100,72 L100,100 Z"
          fill="rgba(5,5,12,0.95)" />
      </svg>
      <style>{`
        @keyframes au-twinkle { 0%,100%{opacity:inherit} 50%{opacity:0.2} }
        @keyframes au-curtain { 0%,100%{transform:scaleY(1) translateY(0);opacity:1} 30%{transform:scaleY(1.4) translateY(-8%);opacity:0.7} 70%{transform:scaleY(0.8) translateY(6%);opacity:1} }
        @keyframes au-col { 0%,100%{transform:scaleY(1) skewX(0deg);opacity:1} 50%{transform:scaleY(2.2) skewX(4deg);opacity:0.6} }
        @keyframes au-spark { 0%,100%{opacity:0} 25%{opacity:0.8;transform:translateY(-15px)} 75%{opacity:0.7;transform:translateY(10px)} }
        @keyframes au-crackle { 0%,100%{opacity:0} 48%{opacity:0} 49%{opacity:0.9} 50%{opacity:0} 50.5%{opacity:0.7} 51%{opacity:0} }
        @keyframes au-reflect { 0%,100%{opacity:1;transform:scaleX(1)} 50%{opacity:0.6;transform:scaleX(1.1)} }
      `}</style>
    </Shell>
  );
}

/* -- Catppuccin: Lava lamp blobs, orbs, sparkles, confetti, candy dots -- */
function CatppuccinBg() {
  const orbs = useMemo(() => {
    const rand = seededRand(331);
    const palette = ['#cba6f7', '#f5c2e7', '#89b4fa', '#a6e3a1', '#fab387', '#f38ba8', '#94e2d5', '#b4befe'];
    return Array.from({ length: 40 }, (_, i) => ({
      x: rand() * 100, y: rand() * 100,
      size: 80 + rand() * 350,
      dur: 12 + rand() * 22,
      delay: rand() * 14,
      color: palette[i % palette.length],
    }));
  }, []);
  const blobs = useMemo(() => {
    const rand = seededRand(332);
    const palette = ['#cba6f7', '#f5c2e7', '#89b4fa', '#a6e3a1', '#fab387'];
    return Array.from({ length: 7 }, (_, i) => ({
      x: 5 + rand() * 85, y: 5 + rand() * 85,
      w: 150 + rand() * 200, h: 130 + rand() * 180,
      dur: 18 + rand() * 14,
      delay: rand() * 10,
      color: palette[i % palette.length],
    }));
  }, []);
  const sparkles = useMemo(() => {
    const rand = seededRand(333);
    return Array.from({ length: 35 }, () => ({
      x: rand() * 100, y: rand() * 100,
      dur: 3 + rand() * 5,
      delay: rand() * 9,
      colorIdx: Math.floor(rand() * 4),
    }));
  }, []);
  const confetti = useMemo(() => {
    const rand = seededRand(334);
    const palette = ['#cba6f7', '#f5c2e7', '#89b4fa', '#a6e3a1', '#fab387', '#f38ba8'];
    return Array.from({ length: 25 }, () => ({
      x: rand() * 100,
      size: 6 + rand() * 8,
      dur: 10 + rand() * 14,
      delay: rand() * 15,
      color: palette[Math.floor(rand() * palette.length)],
      shape: rand() > 0.6 ? 'circle' : rand() > 0.3 ? 'triangle' : 'diamond',
    }));
  }, []);
  const candy = useMemo(() => {
    const rand = seededRand(335);
    const palette = ['#cba6f7', '#f38ba8', '#89b4fa', '#a6e3a1', '#fab387', '#f5c2e7'];
    return Array.from({ length: 30 }, (_, i) => ({
      x: rand() * 100, y: rand() * 100,
      dur: 2 + rand() * 3,
      delay: (i / 30) * 8 + rand() * 2,
      color: palette[i % palette.length],
    }));
  }, []);
  const meshGrads = useMemo(() => {
    const rand = seededRand(336);
    return Array.from({ length: 5 }, () => ({
      x: 5 + rand() * 80, y: 5 + rand() * 80,
      size: 400 + rand() * 400,
      color: ['#cba6f7', '#89b4fa', '#a6e3a1', '#f5c2e7', '#fab387'][Math.floor(rand() * 5)],
      dur: 20 + rand() * 15,
      delay: rand() * 10,
    }));
  }, []);
  const sparkColors = ['#cba6f7', '#f5c2e7', '#89b4fa', '#a6e3a1'];
  return (
    <Shell>
      {/* Large gradient mesh background */}
      {meshGrads.map((m, i) => (
        <div key={`mg${i}`} className="absolute rounded-full"
          style={{ left: `${m.x}%`, top: `${m.y}%`, width: `${m.size}px`, height: `${m.size}px`,
            background: `radial-gradient(circle, ${m.color}40, ${m.color}20 40%, transparent 70%)`,
            filter: 'blur(50px)', animation: `cp-mesh ${m.dur}s ease-in-out ${m.delay}s infinite` }} />
      ))}
      {/* Colorful gradient orbs */}
      {orbs.map((b, i) => (
        <div key={`orb${i}`} className="absolute rounded-full"
          style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.size}px`, height: `${b.size}px`,
            background: `radial-gradient(circle, ${b.color}50, ${b.color}30 40%, transparent 65%)`,
            animation: `cp-float ${b.dur}s ease-in-out ${b.delay}s infinite`,
            filter: 'blur(4px)' }} />
      ))}
      {/* LARGE visible lava lamp blobs */}
      {blobs.map((bl, i) => (
        <div key={`blob${i}`} className="absolute"
          style={{ left: `${bl.x}%`, top: `${bl.y}%`, width: `${bl.w}px`, height: `${bl.h}px`,
            background: `radial-gradient(ellipse, ${bl.color}60, ${bl.color}40 50%, ${bl.color}20 70%, transparent 85%)`,
            animation: `cp-blob${i + 1} ${bl.dur}s ease-in-out ${bl.delay}s infinite`,
            filter: 'blur(15px)' }} />
      ))}
      {/* Bright rainbow wave band */}
      <div className="absolute left-0 right-0 h-[6px]"
        style={{ top: '45%',
          background: 'linear-gradient(90deg, #cba6f7, #f5c2e7, #fab387, #a6e3a1, #89b4fa, #b4befe, #f38ba8, #94e2d5, #cba6f7)',
          backgroundSize: '200% 100%',
          opacity: 0.4, filter: 'blur(2px)', animation: 'cp-rainbow 25s linear infinite' }} />
      <div className="absolute left-0 right-0 h-[3px]"
        style={{ top: '55%',
          background: 'linear-gradient(90deg, #89b4fa, #a6e3a1, #cba6f7, #f5c2e7, #fab387, #f38ba8, #89b4fa)',
          backgroundSize: '250% 100%',
          opacity: 0.3, filter: 'blur(1px)', animation: 'cp-rainbow 18s linear infinite reverse' }} />
      {/* Bright sparkle crosses */}
      {sparkles.map((s, i) => (
        <div key={`sp${i}`} className="absolute"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: '12px', height: '12px', opacity: 0,
            animation: `cp-sparkle ${s.dur}s ease-in-out ${s.delay}s infinite` }}>
          <div className="absolute left-[4px] top-0 w-[4px] h-[12px] rounded-full"
            style={{ background: sparkColors[s.colorIdx], boxShadow: `0 0 6px ${sparkColors[s.colorIdx]}` }} />
          <div className="absolute left-0 top-[4px] w-[12px] h-[4px] rounded-full"
            style={{ background: sparkColors[s.colorIdx], boxShadow: `0 0 6px ${sparkColors[s.colorIdx]}` }} />
        </div>
      ))}
      {/* Colorful confetti geometric shapes */}
      {confetti.map((c, i) => (
        <div key={`cf${i}`} className="absolute opacity-0"
          style={{ left: `${c.x}%`, top: '-6%', width: `${c.size}px`, height: `${c.size}px`,
            background: c.color,
            borderRadius: c.shape === 'circle' ? '50%' : '0',
            clipPath: c.shape === 'triangle' ? 'polygon(50% 0%,100% 100%,0% 100%)' : c.shape === 'diamond' ? 'polygon(50% 0%,100% 50%,50% 100%,0% 50%)' : 'none',
            boxShadow: `0 0 8px ${c.color}`,
            animation: `cp-confetti ${c.dur}s ease-in-out ${c.delay}s infinite` }} />
      ))}
      {/* Bright candy dots */}
      {candy.map((cd, i) => (
        <div key={`cd${i}`} className="absolute rounded-full"
          style={{ left: `${cd.x}%`, top: `${cd.y}%`, width: '6px', height: '6px',
            background: cd.color, opacity: 0,
            boxShadow: `0 0 12px ${cd.color}`,
            animation: `cp-candy ${cd.dur}s ease-in-out ${cd.delay}s infinite` }} />
      ))}
      <style>{`
        @keyframes cp-mesh { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(-50px,35px) scale(1.2)} 66%{transform:translate(40px,-30px) scale(0.85)} }
        @keyframes cp-float { 0%,100%{transform:translate(0,0) scale(1)} 25%{transform:translate(35px,-28px) scale(1.15)} 50%{transform:translate(-15px,32px) scale(0.9)} 75%{transform:translate(-28px,-15px) scale(1.1)} }
        @keyframes cp-blob1 { 0%,100%{transform:translate(0,0) scale(1);border-radius:60% 40% 55% 45%/50% 60% 40% 50%} 50%{transform:translate(-35px,-25px) scale(1.3);border-radius:40% 60% 45% 55%/60% 40% 60% 40%} }
        @keyframes cp-blob2 { 0%,100%{transform:translate(0,0) scale(1);border-radius:50% 50% 60% 40%/45% 55% 45% 55%} 50%{transform:translate(40px,20px) scale(0.85);border-radius:65% 35% 40% 60%/55% 45% 55% 45%} }
        @keyframes cp-blob3 { 0%,100%{transform:translate(0,0) scale(1);border-radius:55% 45% 50% 50%/60% 40% 60% 40%} 50%{transform:translate(-20px,35px) scale(1.25);border-radius:40% 60% 55% 45%/45% 55% 45% 55%} }
        @keyframes cp-blob4 { 0%,100%{transform:translate(0,0) scale(1);border-radius:45% 55% 40% 60%/50% 50% 60% 40%} 50%{transform:translate(25px,-25px) scale(1.15);border-radius:60% 40% 55% 45%/40% 60% 40% 60%} }
        @keyframes cp-blob5 { 0%,100%{transform:translate(0,0) scale(1);border-radius:50% 50% 55% 45%/45% 55% 50% 50%} 50%{transform:translate(-25px,-20px) scale(0.9);border-radius:45% 55% 40% 60%/55% 45% 60% 40%} }
        @keyframes cp-blob6 { 0%,100%{transform:translate(0,0) scale(1);border-radius:65% 35% 45% 55%/55% 45% 65% 35%} 50%{transform:translate(30px,25px) scale(1.2);border-radius:35% 65% 55% 45%/45% 55% 35% 65%} }
        @keyframes cp-blob7 { 0%,100%{transform:translate(0,0) scale(1);border-radius:40% 60% 50% 50%/50% 50% 40% 60%} 50%{transform:translate(-30px,15px) scale(1.1);border-radius:60% 40% 50% 50%/50% 50% 60% 40%} }
        @keyframes cp-rainbow { 0%{background-position:0% 50%} 100%{background-position:200% 50%} }
        @keyframes cp-sparkle { 0%,100%{opacity:0;transform:scale(0.3) rotate(0deg)} 50%{opacity:0.9;transform:scale(1.5) rotate(180deg)} }
        @keyframes cp-confetti { 0%{opacity:0;transform:translateY(0) rotate(0deg)} 10%{opacity:0.7} 90%{opacity:0.4} 100%{opacity:0;transform:translateY(110vh) rotate(1080deg)} }
        @keyframes cp-candy { 0%,100%{opacity:0;transform:scale(0.4)} 50%{opacity:0.9;transform:scale(1.8)} }
      `}</style>
    </Shell>
  );
}

/* -- Tokyo Night: Dense cityscape, rain, puddles, fog, clouds, neon, lightning -- */
function TokyoNightBg() {
  const buildings = useMemo(() => {
    const rand = seededRand(779);
    return Array.from({ length: 40 }, (_, i) => ({
      x: i * 2.5 + rand() * 1.5,
      w: 2.5 + rand() * 5,
      h: 15 + rand() * 50,
      windows: Math.floor(4 + rand() * 10),
      spire: rand() > 0.5,
      spireH: 6 + rand() * 15,
    }));
  }, []);
  const rain = useMemo(() => {
    const rand = seededRand(780);
    return Array.from({ length: 80 }, () => ({
      x: rand() * 110,
      dur: 0.4 + rand() * 0.8,
      delay: rand() * 3,
      h: 18 + rand() * 35,
      angle: 8 + rand() * 15,
    }));
  }, []);
  const puddles = useMemo(() => {
    const rand = seededRand(781);
    return Array.from({ length: 15 }, () => ({
      x: rand() * 85, w: 40 + rand() * 80,
      dur: 2 + rand() * 2, delay: rand() * 4,
      color: ['#7aa2f7', '#bb9af7', '#ff9e64', '#9ece6a'][Math.floor(rand() * 4)],
    }));
  }, []);
  const cars = useMemo(() => {
    const rand = seededRand(782);
    return Array.from({ length: 10 }, (_, i) => ({
      dir: i < 5 ? 'ltr' : 'rtl',
      speed: 4 + rand() * 8,
      delay: rand() * 15,
      color: ['#ff9e64', '#7aa2f7', '#9ece6a', '#e0af68', '#bb9af7', '#7dcfff', '#f7768e', '#73daca', '#2ac3de', '#e0af68'][i],
      y: 0.1 + rand() * 1.2,
    }));
  }, []);
  const clouds = useMemo(() => {
    const rand = seededRand(783);
    return Array.from({ length: 5 }, () => ({
      y: 2 + rand() * 15, w: 100 + rand() * 150, h: 40 + rand() * 50,
      dur: 35 + rand() * 25, delay: rand() * 20,
    }));
  }, []);
  const neons = useMemo(() => {
    const rand = seededRand(784);
    return [
      { x: 15, y: 25, color: '#ff9e64', dur: 3, delay: 0 },
      { x: 35, y: 20, color: '#bb9af7', dur: 4, delay: 1.5 },
      { x: 55, y: 30, color: '#7dcfff', dur: 2.5, delay: 0.8 },
      { x: 75, y: 22, color: '#9ece6a', dur: 5, delay: 2.5 },
      { x: 25, y: 35, color: '#f7768e', dur: 3.5, delay: 3 },
      { x: 65, y: 18, color: '#e0af68', dur: 4.5, delay: 1 },
    ].map(n => ({ ...n, w: 100 + rand() * 120, h: 30 + rand() * 25 }));
  }, []);
  return (
    <Shell>
      {/* Dark cyberpunk sky */}
      <div className="absolute top-0 left-0 right-0 h-[70%]"
        style={{ background: 'linear-gradient(180deg, rgba(25,15,45,0.8), rgba(122,162,247,0.25) 60%, rgba(187,154,247,0.15) 80%, transparent)' }} />
      {/* City glow horizon */}
      <div className="absolute left-0 right-0" style={{ bottom: '25%', height: '20%' }}>
        <div style={{ position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, transparent, rgba(122,162,247,0.3) 30%, rgba(187,154,247,0.2) 60%, rgba(255,158,100,0.1) 80%, transparent)',
          filter: 'blur(6px)' }} />
      </div>
      {/* Dense moving clouds */}
      {clouds.map((cl, i) => (
        <div key={`cl${i}`} className="absolute"
          style={{ top: `${cl.y}%`, left: '-20%', width: `${cl.w}px`, height: `${cl.h}px`,
            background: 'radial-gradient(ellipse, rgba(60,55,90,0.6), rgba(40,35,70,0.3) 60%, transparent)',
            filter: 'blur(12px)', borderRadius: '50%',
            animation: `tn-cloud ${cl.dur}s linear ${cl.delay}s infinite` }} />
      ))}
      {/* Atmospheric fog layers */}
      <div className="absolute left-0 right-0" style={{ bottom: '30%', height: '20%',
        background: 'linear-gradient(180deg, transparent, rgba(80,70,120,0.4) 40%, rgba(60,50,100,0.3) 70%, transparent)',
        filter: 'blur(10px)' }} />
      <div className="absolute left-0 right-0" style={{ bottom: '20%', height: '15%',
        background: 'linear-gradient(180deg, transparent, rgba(100,90,140,0.3) 50%, transparent)',
        filter: 'blur(8px)' }} />
      {/* BRIGHT neon sign glows */}
      {neons.map((n, i) => (
        <div key={`nn${i}`} className="absolute rounded-full"
          style={{ left: `${n.x}%`, top: `${n.y}%`, width: `${n.w}px`, height: `${n.h}px`,
            background: `radial-gradient(ellipse, ${n.color}60, ${n.color}30 50%, transparent 80%)`,
            filter: 'blur(8px)',
            boxShadow: `0 0 20px ${n.color}80, 0 0 40px ${n.color}40`,
            animation: `tn-neon${i + 1} ${n.dur}s ease-in-out ${n.delay}s infinite` }} />
      ))}
      {/* Dark street ground */}
      <div className="absolute bottom-0 left-0 right-0 h-[15%]"
        style={{ background: 'linear-gradient(180deg, rgba(25,25,40,0.9), rgba(15,15,25,0.95))' }} />
      {/* VISIBLE building silhouettes with bright windows */}
      {buildings.map((b, i) => (
        <div key={`bld${i}`} className="absolute bottom-[15%]"
          style={{ left: `${b.x}%`, width: `${b.w}%`, height: `${b.h}%`,
            background: 'rgba(20,20,35,0.95)',
            borderTop: '2px solid rgba(80,90,140,0.6)',
            boxShadow: 'inset 0 1px 0 rgba(80,90,140,0.3)' }}>
          {b.spire && (
            <div style={{ position: 'absolute', left: '45%', top: `-${b.spireH}px`, width: '3px', height: `${b.spireH}px`,
              background: 'rgba(122,162,247,0.6)',
              boxShadow: '0 0 6px rgba(122,162,247,0.8)' }} />
          )}
          {Array.from({ length: b.windows }).map((_, wi) => (
            <div key={`w${wi}`} className="absolute"
              style={{ left: '12%', right: '12%', height: '5px',
                top: `${6 + wi * (85 / b.windows)}%`,
                background: ['#7aa2f7', '#ff9e64', '#9ece6a', '#bb9af7', '#7dcfff', '#e0af68', '#f7768e'][wi % 7],
                opacity: 0, borderRadius: '2px',
                boxShadow: `0 0 8px ${['#7aa2f7', '#ff9e64', '#9ece6a', '#bb9af7', '#7dcfff', '#e0af68', '#f7768e'][wi % 7]}`,
                animation: `tn-blink ${1.5 + (wi + i) * 0.3}s ease-in-out ${i * 0.15 + wi * 0.25}s infinite` }} />
          ))}
        </div>
      ))}
      {/* Bright street reflections */}
      <div className="absolute bottom-[15%] left-0 right-0 h-[2px]"
        style={{ background: 'linear-gradient(90deg, rgba(122,162,247,0.4), rgba(187,154,247,0.3), rgba(255,158,100,0.2))', filter: 'blur(1px)' }} />
      {/* Colorful puddle reflections */}
      {puddles.map((p, i) => (
        <div key={`pd${i}`} className="absolute bottom-[15%]"
          style={{ left: `${p.x}%`, width: `${p.w}px`, height: '8px',
            background: `linear-gradient(90deg, transparent, ${p.color}50 30%, ${p.color}70 50%, ${p.color}50 70%, transparent)`,
            filter: 'blur(2px)', borderRadius: '50%',
            animation: `tn-puddle ${p.dur}s ease-in-out ${p.delay}s infinite` }} />
      ))}
      {/* Heavy rain */}
      {rain.map((r, i) => (
        <div key={`r${i}`} className="absolute opacity-0"
          style={{ left: `${r.x}%`, top: '-8%', width: '2px', height: `${r.h}px`,
            background: 'linear-gradient(180deg, transparent, rgba(122,162,247,0.6), rgba(122,162,247,0.4))',
            transform: `rotate(${r.angle}deg)`,
            animation: `tn-rain ${r.dur}s linear ${r.delay}s infinite` }} />
      ))}
      {/* Bright car headlights */}
      {cars.map((car, i) => (
        <div key={`car${i}`} className="absolute rounded-full"
          style={{ bottom: `${15 + car.y * 2}%`, width: '8px', height: '3px',
            background: car.color,
            boxShadow: `0 0 15px ${car.color}, 0 0 30px ${car.color}80`,
            animation: `tn-car${car.dir === 'ltr' ? 'L' : 'R'} ${car.speed}s linear ${car.delay}s infinite` }} />
      ))}
      {/* Intense lightning flash */}
      <div className="absolute inset-0" style={{ animation: 'tn-lightning 12s ease-in-out infinite' }} />
      <style>{`
        @keyframes tn-blink { 0%,100%{opacity:0.2} 40%{opacity:0.9} 60%{opacity:0.9} }
        @keyframes tn-carL { 0%{left:-3%;opacity:0} 8%{opacity:0.9} 92%{opacity:0.9} 100%{left:105%;opacity:0} }
        @keyframes tn-carR { 0%{right:-3%;opacity:0} 8%{opacity:0.9} 92%{opacity:0.9} 100%{right:105%;opacity:0} }
        @keyframes tn-rain { 0%{opacity:0;transform:translateY(0)} 10%{opacity:0.7} 90%{opacity:0.4} 100%{opacity:0;transform:translateY(115vh)} }
        @keyframes tn-neon1 { 0%,100%{opacity:1} 48%{opacity:0.3} 52%{opacity:1} }
        @keyframes tn-neon2 { 0%,100%{opacity:0.9} 50%{opacity:0.2} }
        @keyframes tn-neon3 { 0%,100%{opacity:1} 33%{opacity:0.5} 36%{opacity:1} 66%{opacity:0.4} 69%{opacity:1} }
        @keyframes tn-neon4 { 0%,100%{opacity:0.9} 50%{opacity:0.6} }
        @keyframes tn-neon5 { 0%,100%{opacity:1} 25%{opacity:0.3} 27%{opacity:1} 75%{opacity:0.4} 77%{opacity:1} }
        @keyframes tn-neon6 { 0%,100%{opacity:0.8} 50%{opacity:0.3} }
        @keyframes tn-cloud { 0%{transform:translateX(0)} 100%{transform:translateX(125vw)} }
        @keyframes tn-puddle { 0%,100%{opacity:0.8;transform:scaleX(1)} 50%{opacity:0.4;transform:scaleX(1.4)} }
        @keyframes tn-lightning { 0%,100%{background:transparent} 52%{background:transparent} 52.2%{background:rgba(122,162,247,0.15)} 52.4%{background:transparent} 52.8%{background:rgba(122,162,247,0.25)} 53%{background:transparent} }
      `}</style>
    </Shell>
  );
}

/* -- Dracula: Castle, graveyard, large moon, fog, bats, candles, mist, blood drips -- */
function DraculaBg() {
  const fogLayers = useMemo(() => {
    const rand = seededRand(1111);
    return Array.from({ length: 10 }, (_, i) => ({
      x: -40 + rand() * 80,
      bottom: rand() * 40,
      w: 500 + rand() * 700,
      h: 150 + rand() * 250,
      dur: 14 + rand() * 18,
      delay: rand() * 12,
      depth: i,
    }));
  }, []);
  const bats = useMemo(() => {
    const rand = seededRand(1112);
    return Array.from({ length: 12 }, (_, i) => ({
      size: 18 + rand() * 28,
      top: 8 + rand() * 45,
      dur: 10 + rand() * 12,
      delay: rand() * 20,
      waveAmp: 15 + rand() * 30,
    }));
  }, []);
  const candles = useMemo(() => {
    const rand = seededRand(1113);
    return Array.from({ length: 8 }, () => ({
      x: 10 + rand() * 80, y: 40 + rand() * 40,
      dur: 1.5 + rand() * 1,
      delay: rand() * 3,
    }));
  }, []);
  const tendrils = useMemo(() => {
    const rand = seededRand(1114);
    return Array.from({ length: 6 }, () => ({
      x: 5 + rand() * 85, y: 25 + rand() * 40,
      w: 120 + rand() * 180, h: 30 + rand() * 50,
      dur: 20 + rand() * 15,
      delay: rand() * 15,
    }));
  }, []);
  const bloodDrops = useMemo(() => {
    const rand = seededRand(1115);
    return Array.from({ length: 4 }, () => ({
      x: 15 + rand() * 70,
      dur: 25 + rand() * 15,
      delay: rand() * 12,
    }));
  }, []);
  return (
    <Shell>
      {/* Deep gothic sky */}
      <div className="absolute top-0 left-0 right-0 h-[60%]"
        style={{ background: 'linear-gradient(180deg, rgba(60,25,80,0.7), rgba(189,147,249,0.3) 50%, rgba(139,92,246,0.15) 80%, transparent)' }} />
      {/* BRIGHT moon with visible halo */}
      <div className="absolute" style={{ top: '8%', right: '15%', width: '140px', height: '140px' }}>
        <div className="absolute rounded-full"
          style={{ top: '-30%', left: '-30%', width: '160%', height: '160%',
            border: '2px solid rgba(189,147,249,0.4)', animation: 'dr-moonring 8s ease-in-out infinite' }} />
        <div className="absolute rounded-full"
          style={{ top: '-50%', left: '-50%', width: '200%', height: '200%',
            border: '1px solid rgba(189,147,249,0.2)', animation: 'dr-moonring 12s ease-in-out 2s infinite' }} />
        <div className="absolute inset-0 rounded-full"
          style={{ background: 'radial-gradient(circle at 35% 35%, rgba(240,220,255,0.6), rgba(189,147,249,0.35) 40%, rgba(139,92,246,0.15) 70%, transparent)',
            boxShadow: '0 0 60px rgba(189,147,249,0.4), 0 0 120px rgba(189,147,249,0.2)',
            animation: 'dr-moon 10s ease-in-out infinite' }} />
        <div className="absolute rounded-full"
          style={{ top: '10%', left: '18%', width: '75%', height: '75%',
            background: 'radial-gradient(circle, rgba(20,10,30,0.8), transparent 65%)' }} />
        <div className="absolute rounded-full"
          style={{ top: '25%', left: '22%', width: '14px', height: '14px',
            background: 'rgba(160,120,220,0.4)', boxShadow: 'inset 0 0 6px rgba(0,0,0,0.3)' }} />
        <div className="absolute rounded-full"
          style={{ top: '50%', left: '38%', width: '10px', height: '10px',
            background: 'rgba(150,100,200,0.3)', boxShadow: 'inset 0 0 4px rgba(0,0,0,0.25)' }} />
        <div className="absolute rounded-full"
          style={{ top: '35%', left: '55%', width: '8px', height: '8px',
            background: 'rgba(140,90,190,0.25)', boxShadow: 'inset 0 0 3px rgba(0,0,0,0.2)' }} />
      </div>
      {/* VISIBLE blood drip streaks */}
      {bloodDrops.map((bd, i) => (
        <div key={`bd${i}`} className="absolute top-0"
          style={{ left: `${bd.x}%`, width: '4px', height: '0%',
            background: 'linear-gradient(to bottom, rgba(220,40,60,0.6), rgba(180,30,40,0.4) 60%, rgba(140,20,30,0.2))',
            animation: `dr-drip ${bd.dur}s ease-in ${bd.delay}s infinite` }} />
      ))}
      {/* Dense fog layers */}
      {fogLayers.map((f, i) => (
        <div key={`fog${i}`} className="absolute rounded-full"
          style={{ left: `${f.x}%`, bottom: `${f.bottom}%`,
            width: `${f.w}px`, height: `${f.h}px`,
            background: `radial-gradient(ellipse, rgba(${i % 2 === 0 ? '100,80,160' : '80,65,140'},${0.3 + (f.depth % 4) * 0.05}), rgba(60,50,120,${0.15 + (f.depth % 3) * 0.05}) 50%, transparent 70%)`,
            filter: `blur(${18 + i * 4}px)`,
            animation: `dr-fog ${f.dur}s ease-in-out ${f.delay}s infinite` }} />
      ))}
      {/* Bright lightning flashes */}
      <div className="absolute inset-0" style={{ animation: 'dr-lightning 10s ease-in-out infinite' }} />
      <div className="absolute inset-0" style={{ animation: 'dr-lightning2 10s ease-in-out 0.2s infinite' }} />
      {/* BRIGHT candle flames */}
      {candles.map((c, i) => (
        <div key={`ca${i}`} className="absolute rounded-full"
          style={{ left: `${c.x}%`, top: `${c.y}%`, width: '8px', height: '12px',
            background: 'radial-gradient(ellipse at 50% 75%, rgba(255,200,80,0.9), rgba(255,150,60,0.6) 40%, rgba(255,100,30,0.3) 70%, transparent)',
            boxShadow: '0 0 15px rgba(255,180,60,0.7), 0 0 30px rgba(255,150,40,0.4)',
            animation: `dr-candle ${c.dur}s ease-in-out ${c.delay}s infinite` }} />
      ))}
      {/* Visible mist tendrils */}
      {tendrils.map((t, i) => (
        <div key={`td${i}`} className="absolute"
          style={{ left: `${t.x}%`, top: `${t.y}%`, width: `${t.w}px`, height: `${t.h}px`,
            background: 'radial-gradient(ellipse, rgba(120,100,180,0.35), rgba(100,80,160,0.2) 50%, transparent 70%)',
            filter: 'blur(8px)', borderRadius: '50%',
            animation: `dr-tendril ${t.dur}s ease-in-out ${t.delay}s infinite` }} />
      ))}
      {/* VISIBLE flying bats */}
      {bats.map((bat, i) => (
        <svg key={`bat${i}`} className="absolute" viewBox="0 0 30 12"
          style={{ width: `${bat.size}px`, top: `${bat.top}%`, left: '-8%', opacity: 0,
            animation: `dr-bat ${bat.dur}s ease-in-out ${bat.delay}s infinite`,
            ['--wa' as string]: `${bat.waveAmp}px` }}>
          <path d="M15,6 Q10,0 5,3 Q2,1 0,4 Q3,5 5,5 Q8,8 12,7 L15,6 Q17,8 20,7 Q22,8 25,5 Q27,5 30,4 Q28,1 25,3 Q20,0 15,6Z"
            fill="rgba(189,147,249,0.8)" stroke="rgba(139,92,246,0.6)" strokeWidth="0.5">
            <animate attributeName="d"
              values="M15,6 Q10,0 5,3 Q2,1 0,4 Q3,5 5,5 Q8,8 12,7 L15,6 Q17,8 20,7 Q22,8 25,5 Q27,5 30,4 Q28,1 25,3 Q20,0 15,6Z;M15,6 Q10,3 5,5 Q2,4 0,6 Q3,6 5,6 Q8,7 12,6.5 L15,6 Q17,7 20,6.5 Q22,6 25,6 Q27,6 30,6 Q28,4 25,5 Q20,3 15,6Z;M15,6 Q10,0 5,3 Q2,1 0,4 Q3,5 5,5 Q8,8 12,7 L15,6 Q17,8 20,7 Q22,8 25,5 Q27,5 30,4 Q28,1 25,3 Q20,0 15,6Z"
              dur="0.4s" repeatCount="indefinite" />
          </path>
        </svg>
      ))}
      {/* CLEARLY VISIBLE castle and graveyard silhouettes */}
      <svg className="absolute bottom-0 left-0 w-full" style={{ height: '28%' }} viewBox="0 0 1000 140" preserveAspectRatio="none">
        {Array.from({ length: 45 }, (_, i) => (
          <rect key={`f${i}`} x={i * 22} y={85} width={5} height={55} fill="rgba(25,15,35,0.9)" />
        ))}
        {Array.from({ length: 45 }, (_, i) => (
          <polygon key={`fp${i}`} points={`${i * 22},85 ${i * 22 + 2.5},72 ${i * 22 + 5},85`} fill="rgba(25,15,35,0.9)" />
        ))}
        <rect x={100} y={60} width={25} height={35} rx={4} fill="rgba(35,25,50,0.85)" />
        <line x1={112} y1={64} x2={112} y2={78} stroke="rgba(120,100,160,0.6)" strokeWidth="2" />
        <line x1={105} y1={71} x2={119} y2={71} stroke="rgba(120,100,160,0.6)" strokeWidth="2" />
        <rect x={300} y={55} width={28} height={40} rx={4} fill="rgba(32,22,45,0.85)" />
        <line x1={314} y1={60} x2={314} y2={76} stroke="rgba(120,100,160,0.6)" strokeWidth="2" />
        <line x1={306} y1={68} x2={322} y2={68} stroke="rgba(120,100,160,0.6)" strokeWidth="2" />
        <rect x={550} y={58} width={22} height={32} rx={3} fill="rgba(30,20,40,0.85)" />
        <line x1={561} y1={62} x2={561} y2={75} stroke="rgba(120,100,160,0.6)" strokeWidth="2" />
        <line x1={554} y1={68} x2={568} y2={68} stroke="rgba(120,100,160,0.6)" strokeWidth="2" />
        <path d="M700,140 L700,25 L715,25 L715,12 L730,12 L730,25 L745,25 L745,12 L760,12 L760,25 L775,25 L775,140 Z" fill="rgba(18,12,30,0.95)" />
        <path d="M800,140 L800,45 L815,45 L815,30 L830,30 L830,45 L845,45 L845,30 L860,30 L860,45 L875,45 L875,140 Z" fill="rgba(18,12,30,0.95)" />
        <path d="M880,140 L880,15 L898,15 L898,5 L916,5 L916,15 L934,15 L934,5 L952,5 L952,15 L970,15 L970,140 Z" fill="rgba(15,10,25,0.98)" />
      </svg>
      <style>{`
        @keyframes dr-fog { 0%,100%{transform:translateX(0) translateY(0) scaleX(1)} 50%{transform:translateX(80px) translateY(-30px) scaleX(1.25)} }
        @keyframes dr-bat { 0%{left:-8%;opacity:0;transform:translateY(0)} 8%{opacity:0.7} 25%{transform:translateY(calc(-1 * var(--wa)))} 50%{transform:translateY(calc(var(--wa) * 0.6))} 75%{transform:translateY(calc(-1 * var(--wa) * 0.8))} 92%{opacity:0.7} 100%{left:110%;opacity:0} }
        @keyframes dr-lightning { 0%,100%{background:transparent} 44%{background:transparent} 44.3%{background:rgba(189,147,249,0.2)} 44.6%{background:transparent} 45%{background:rgba(189,147,249,0.15)} 45.3%{background:transparent} }
        @keyframes dr-lightning2 { 0%,100%{background:transparent} 44%{background:transparent} 44.3%{background:rgba(139,92,246,0.25)} 44.6%{background:transparent} 45%{background:rgba(139,92,246,0.18)} 45.3%{background:transparent} }
        @keyframes dr-moon { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.8;transform:scale(1.08)} }
        @keyframes dr-moonring { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(1.15)} }
        @keyframes dr-candle { 0%,100%{transform:scale(1) translateX(0);opacity:1} 25%{transform:scale(1.3,0.7) translateX(2px);opacity:0.8} 50%{transform:scale(0.8,1.2) translateX(-2px);opacity:1} 75%{transform:scale(1.2,0.8) translateX(1px);opacity:0.9} }
        @keyframes dr-tendril { 0%,100%{transform:translateX(0) scaleX(1);opacity:1} 50%{transform:translateX(60px) scaleX(1.5);opacity:0.4} }
        @keyframes dr-drip { 0%{height:0%;opacity:0} 15%{opacity:0.8} 85%{opacity:0.6} 100%{height:60%;opacity:0} }
      `}</style>
    </Shell>
  );
}

/* -- Solarized: Big sun, golden atmosphere, deep ocean, birds, sea spray -- */
function SolarizedBg() {
  const waves = useMemo(() => {
    const rand = seededRand(551);
    return Array.from({ length: 12 }, (_, i) => ({
      y: 52 + i * 3.5 + rand() * 2.5,
      dur: 3.5 + rand() * 4,
      delay: rand() * 5,
      opacity: 0.2 + i * 0.06,
    }));
  }, []);
  const seaSpray = useMemo(() => {
    const rand = seededRand(552);
    return Array.from({ length: 20 }, () => ({
      x: 15 + rand() * 70,
      dur: 1.2 + rand() * 1.8,
      delay: rand() * 8,
    }));
  }, []);
  const windParticles = useMemo(() => {
    const rand = seededRand(553);
    return Array.from({ length: 15 }, () => ({
      y: 8 + rand() * 60,
      dur: 6 + rand() * 8,
      delay: rand() * 12,
    }));
  }, []);
  const birds = useMemo(() => {
    const rand = seededRand(554);
    return Array.from({ length: 4 }, () => ({
      y: 12 + rand() * 28,
      scale: 0.8 + rand() * 1,
      dur: 25 + rand() * 18,
      delay: rand() * 20,
    }));
  }, []);
  const clouds = useMemo(() => {
    const rand = seededRand(555);
    return Array.from({ length: 6 }, () => ({
      y: 6 + rand() * 22,
      w: 120 + rand() * 180, h: 35 + rand() * 45,
      dur: 45 + rand() * 35, delay: rand() * 30,
    }));
  }, []);
  const rayAngles = [0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5, 180, 202.5, 225, 247.5, 270, 292.5, 315, 337.5];
  return (
    <Shell>
      {/* BRIGHT golden atmosphere */}
      <div className="absolute top-0 left-0 right-0 h-[65%]"
        style={{ background: 'linear-gradient(180deg, rgba(181,137,0,0.4), rgba(203,75,22,0.25) 40%, rgba(38,139,210,0.15) 75%, transparent)' }} />
      {/* Warm horizon glow */}
      <div className="absolute left-0 right-0" style={{ bottom: '45%', height: '12%',
        background: 'linear-gradient(180deg, transparent, rgba(181,137,0,0.5) 30%, rgba(203,75,22,0.3) 70%, transparent)',
        filter: 'blur(4px)' }} />
      {/* Deep ocean */}
      <div className="absolute bottom-0 left-0 right-0 h-[48%]"
        style={{ background: 'linear-gradient(to top, rgba(38,139,210,0.6), rgba(38,139,210,0.35) 50%, rgba(6,182,212,0.15) 80%, transparent)' }} />
      {/* Fluffy cloud puffs */}
      {clouds.map((cl, i) => (
        <div key={`cl${i}`} className="absolute"
          style={{ top: `${cl.y}%`, left: '-25%', width: `${cl.w}px`, height: `${cl.h}px`,
            background: 'radial-gradient(ellipse, rgba(255,250,220,0.7), rgba(255,240,200,0.4) 50%, transparent 75%)',
            filter: 'blur(10px)', borderRadius: '50%',
            animation: `sl-cloud ${cl.dur}s linear ${cl.delay}s infinite` }} />
      ))}
      {/* BRILLIANT sun with corona and rays */}
      <div className="absolute" style={{ top: '8%', right: '10%', width: '180px', height: '180px' }}>
        <div className="absolute inset-0 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(181,137,0,0.7) 0%, rgba(181,137,0,0.4) 30%, rgba(203,75,22,0.15) 60%, transparent)',
            filter: 'blur(3px)', animation: 'sl-corona 4s ease-in-out infinite' }} />
        {[1, 2, 3].map(r => (
          <div key={`ring${r}`} className="absolute rounded-full"
            style={{ top: `${-25 * r}%`, left: `${-25 * r}%`, width: `${100 + 50 * r}%`, height: `${100 + 50 * r}%`,
              border: `2px solid rgba(181,137,0,${0.3 - r * 0.08})`,
              animation: `sl-ring ${5 + r * 1.5}s ease-in-out ${r * 0.8}s infinite` }} />
        ))}
        {rayAngles.map((angle, i) => (
          <div key={`ray${i}`} className="absolute"
            style={{ top: '50%', left: '50%', width: '120px', height: '3px',
              background: `linear-gradient(90deg, transparent 10%, rgba(181,137,0,${0.4 + (i % 4) * 0.1}) 30%, rgba(181,137,0,${0.3 + (i % 4) * 0.1}) 70%, transparent 90%)`,
              transformOrigin: '0 50%',
              transform: `rotate(${angle}deg) translateX(85px)`,
              animation: `sl-ray ${5 + (i % 4) * 0.6}s ease-in-out ${i * 0.2}s infinite` }} />
        ))}
        <div className="absolute rounded-full"
          style={{ top: '20%', left: '20%', width: '60%', height: '60%',
            background: 'radial-gradient(circle, rgba(255,220,100,0.8), rgba(181,137,0,0.6) 40%, rgba(181,137,0,0.3) 70%, transparent)',
            boxShadow: '0 0 50px rgba(181,137,0,0.4)' }} />
      </div>
      {/* Bright horizon line */}
      <div className="absolute left-0 right-0" style={{ bottom: '46%', height: '3px',
        background: 'linear-gradient(90deg, transparent 5%, rgba(181,137,0,0.6) 15%, rgba(203,75,22,0.8) 50%, rgba(181,137,0,0.6) 85%, transparent 95%)',
        filter: 'blur(1px)' }} />
      {/* VISIBLE ocean waves */}
      {waves.map((w, i) => (
        <div key={`w${i}`} className="absolute left-[-15%] right-[-15%]"
          style={{ bottom: `${100 - w.y}%`, height: `${2 + i * 0.6}px`,
            background: `linear-gradient(90deg, transparent 6%, rgba(38,139,210,${w.opacity}) 18%, rgba(6,182,212,${w.opacity * 1.3}) 50%, rgba(38,139,210,${w.opacity}) 82%, transparent 94%)`,
            animation: `sl-wave ${w.dur}s ease-in-out ${w.delay}s infinite` }} />
      ))}
      {/* Bright sun reflection */}
      <div className="absolute" style={{ right: '16%', bottom: '0', width: '80px', height: '46%' }}>
        <div style={{ position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, rgba(181,137,0,0.6) 0%, rgba(203,75,22,0.4) 30%, rgba(181,137,0,0.2) 60%, transparent)',
          animation: 'sl-sunrefl 3s ease-in-out infinite' }} />
      </div>
      {/* BRIGHT lens flares */}
      <div className="absolute" style={{ top: '22%', right: '28%', width: '70px', height: '14px',
        background: 'linear-gradient(90deg, transparent, rgba(181,137,0,0.6), transparent)',
        borderRadius: '50%', animation: 'sl-flare 5s ease-in-out infinite' }} />
      <div className="absolute rounded-full" style={{ top: '35%', left: '38%', width: '40px', height: '40px',
        background: 'radial-gradient(circle, rgba(38,139,210,0.5), transparent 60%)',
        animation: 'sl-flare 5s ease-in-out 2.5s infinite' }} />
      <div className="absolute" style={{ top: '15%', right: '45%', width: '30px', height: '8px',
        background: 'linear-gradient(90deg, transparent, rgba(203,75,22,0.4), transparent)',
        borderRadius: '50%', animation: 'sl-flare 5s ease-in-out 1.2s infinite' }} />
      {/* Sea spray droplets */}
      {seaSpray.map((sp, i) => (
        <div key={`sp${i}`} className="absolute rounded-full"
          style={{ left: `${sp.x}%`, bottom: '48%', width: '5px', height: '5px',
            background: 'rgba(38,139,210,0.8)', opacity: 0,
            boxShadow: '0 0 8px rgba(38,139,210,0.6)',
            animation: `sl-spray ${sp.dur}s ease-out ${sp.delay}s infinite` }} />
      ))}
      {/* Golden wind particles */}
      {windParticles.map((wp, i) => (
        <div key={`wp${i}`} className="absolute rounded-full"
          style={{ left: '-3%', top: `${wp.y}%`, width: '6px', height: '6px',
            background: 'rgba(181,137,0,0.7)', opacity: 0,
            boxShadow: '0 0 10px rgba(181,137,0,0.5)',
            animation: `sl-wind ${wp.dur}s ease-in-out ${wp.delay}s infinite` }} />
      ))}
      {/* VISIBLE bird silhouettes */}
      {birds.map((bird, i) => (
        <svg key={`bird${i}`} className="absolute" viewBox="0 0 24 12"
          style={{ width: `${22 * bird.scale}px`, top: `${bird.y}%`, left: '-8%',
            opacity: 0, animation: `sl-bird ${bird.dur}s ease-in-out ${bird.delay}s infinite` }}>
          <path d="M12,6 Q9,3 6,4 Q3,3 0,5" stroke="rgba(88,110,117,0.8)" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <path d="M12,6 Q15,3 18,4 Q21,3 24,5" stroke="rgba(88,110,117,0.8)" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        </svg>
      ))}
      <style>{`
        @keyframes sl-corona { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.7;transform:scale(1.25)} }
        @keyframes sl-ring { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(1.18)} }
        @keyframes sl-ray { 0%,100%{opacity:0.7} 50%{opacity:1} }
        @keyframes sl-wave { 0%,100%{transform:scaleX(1) translateX(0)} 50%{transform:scaleX(1.1) translateX(6%)} }
        @keyframes sl-flare { 0%,100%{opacity:0} 40%{opacity:0.9} 60%{opacity:0.9} }
        @keyframes sl-sunrefl { 0%,100%{opacity:1;transform:scaleX(1)} 50%{opacity:0.6;transform:scaleX(1.4)} }
        @keyframes sl-spray { 0%{opacity:0;transform:translateY(0)} 25%{opacity:0.8} 100%{opacity:0;transform:translateY(-30px) translateX(12px)} }
        @keyframes sl-wind { 0%{opacity:0;left:-3%} 12%{opacity:0.7} 88%{opacity:0.5} 100%{opacity:0;left:108%} }
        @keyframes sl-bird { 0%{left:-8%;opacity:0} 8%{opacity:0.8} 92%{opacity:0.8} 100%{left:112%;opacity:0} }
        @keyframes sl-cloud { 0%{transform:translateX(0)} 100%{transform:translateX(125vw)} }
      `}</style>
    </Shell>
  );
}

/* -- Lightning: Thunderstorm with bolt strikes, rain, rolling clouds, wind -- */
function LightningBg() {
  const rain = useMemo(() => {
    const rand = seededRand(900);
    return Array.from({ length: 80 }, () => ({
      x: rand() * 100,
      len: 14 + rand() * 22,
      dur: 0.4 + rand() * 0.5,
      delay: rand() * 3,
      opacity: 0.15 + rand() * 0.25,
      wind: 8 + rand() * 6,
    }));
  }, []);

  const rainHeavy = useMemo(() => {
    const rand = seededRand(901);
    return Array.from({ length: 50 }, () => ({
      x: rand() * 100,
      len: 20 + rand() * 30,
      dur: 0.3 + rand() * 0.35,
      delay: rand() * 2,
      opacity: 0.08 + rand() * 0.12,
      wind: 10 + rand() * 8,
    }));
  }, []);

  const clouds = useMemo(() => {
    const rand = seededRand(902);
    return Array.from({ length: 7 }, (_, i) => ({
      x: -15 + rand() * 110,
      y: -5 + rand() * 25,
      w: 200 + rand() * 300,
      h: 60 + rand() * 80,
      opacity: 0.35 + rand() * 0.35,
      dur: 30 + rand() * 40,
      delay: rand() * 20,
      dark: i < 3,
    }));
  }, []);

  const bolts = useMemo(() => {
    const rand = seededRand(903);
    return Array.from({ length: 5 }, () => {
      const startX = 10 + rand() * 80;
      const segments: { x: number; y: number }[] = [{ x: startX, y: 0 }];
      let cx = startX;
      let cy = 0;
      const numSeg = 4 + Math.floor(rand() * 4);
      for (let j = 0; j < numSeg; j++) {
        cx += (rand() - 0.5) * 18;
        cy += 8 + rand() * 14;
        segments.push({ x: Math.max(2, Math.min(98, cx)), y: Math.min(90, cy) });
      }
      const branchAt = 1 + Math.floor(rand() * (segments.length - 2));
      const branchSeg: { x: number; y: number }[] = [];
      const bx = segments[branchAt].x;
      const by = segments[branchAt].y;
      let bbx = bx;
      let bby = by;
      for (let k = 0; k < 2 + Math.floor(rand() * 2); k++) {
        bbx += (rand() - 0.3) * 12;
        bby += 5 + rand() * 10;
        branchSeg.push({ x: Math.max(2, Math.min(98, bbx)), y: Math.min(90, bby) });
      }
      return {
        segments,
        branch: [{ x: bx, y: by }, ...branchSeg],
        dur: 6 + rand() * 12,
        delay: rand() * 18,
        flashDur: 0.15 + rand() * 0.15,
        intensity: 0.5 + rand() * 0.4,
      };
    });
  }, []);

  const windStreaks = useMemo(() => {
    const rand = seededRand(904);
    return Array.from({ length: 12 }, () => ({
      y: rand() * 80,
      len: 60 + rand() * 120,
      dur: 1.5 + rand() * 2,
      delay: rand() * 8,
      opacity: 0.04 + rand() * 0.06,
    }));
  }, []);

  const rumbleParticles = useMemo(() => {
    const rand = seededRand(905);
    return Array.from({ length: 20 }, () => ({
      x: rand() * 100,
      y: 60 + rand() * 35,
      size: 1 + rand() * 2,
      dur: 2 + rand() * 4,
      delay: rand() * 10,
    }));
  }, []);

  return (
    <Shell>
      {/* Dark storm sky gradient */}
      <div className="absolute inset-0"
        style={{ background: 'linear-gradient(to bottom, rgba(8,12,24,0.3) 0%, rgba(14,20,38,0.15) 30%, rgba(20,28,50,0.1) 60%, rgba(10,14,28,0.2) 100%)' }} />

      {/* Rolling storm clouds */}
      {clouds.map((c, i) => (
        <div key={`cl${i}`} className="absolute rounded-full"
          style={{
            left: `${c.x}%`, top: `${c.y}%`,
            width: `${c.w}px`, height: `${c.h}px`,
            background: c.dark
              ? 'radial-gradient(ellipse, rgba(20,30,55,0.7) 0%, rgba(15,22,42,0.4) 40%, transparent 70%)'
              : 'radial-gradient(ellipse, rgba(30,42,70,0.5) 0%, rgba(20,30,55,0.25) 45%, transparent 70%)',
            filter: 'blur(20px)',
            animation: `ln-cloud ${c.dur}s ease-in-out ${c.delay}s infinite`,
            opacity: c.opacity,
          }} />
      ))}

      {/* Cloud base glow — illuminated from below by lightning */}
      <div className="absolute left-0 right-0 top-[5%] h-[25%]"
        style={{
          background: 'linear-gradient(to bottom, rgba(96,165,250,0.06), transparent)',
          filter: 'blur(30px)',
          animation: 'ln-cloudglow 8s ease-in-out infinite',
        }} />

      {/* Lightning bolt SVGs */}
      <svg className="absolute inset-0 w-full h-full">
        {bolts.map((bolt, bi) => {
          const mainPath = bolt.segments.map((s, si) => `${si === 0 ? 'M' : 'L'}${s.x} ${s.y}`).join(' ');
          const branchPath = bolt.branch.map((s, si) => `${si === 0 ? 'M' : 'L'}${s.x} ${s.y}`).join(' ');
          const totalDur = bolt.dur;
          const flashStart = 0.98;
          const flashEnd = flashStart + (bolt.flashDur / totalDur);
          const vals = `0;0;0;0;0;0;0;0;0;${bolt.intensity};0;${bolt.intensity * 0.5};0;0;0;0;0;0;0;0`;
          return (
            <g key={`b${bi}`}>
              {/* Main bolt */}
              <path d={mainPath} fill="none" stroke="rgba(147,197,253,0.9)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ filter: 'drop-shadow(0 0 8px rgba(96,165,250,0.8)) drop-shadow(0 0 20px rgba(96,165,250,0.4))' }}
                opacity="0">
                <animate attributeName="opacity" values={vals} dur={`${totalDur}s`} begin={`${bolt.delay}s`} repeatCount="indefinite" />
              </path>
              {/* Core bright center */}
              <path d={mainPath} fill="none" stroke="rgba(219,234,254,0.95)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"
                opacity="0">
                <animate attributeName="opacity" values={vals} dur={`${totalDur}s`} begin={`${bolt.delay}s`} repeatCount="indefinite" />
              </path>
              {/* Branch */}
              <path d={branchPath} fill="none" stroke="rgba(147,197,253,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ filter: 'drop-shadow(0 0 6px rgba(96,165,250,0.5))' }}
                opacity="0">
                <animate attributeName="opacity" values={vals} dur={`${totalDur}s`} begin={`${bolt.delay + 0.05}s`} repeatCount="indefinite" />
              </path>
              {/* Ground illumination on strike */}
              <ellipse cx={`${bolt.segments[bolt.segments.length - 1].x}`} cy="95"
                rx="20" ry="6" fill="rgba(96,165,250,0.3)" opacity="0">
                <animate attributeName="opacity" values={vals} dur={`${totalDur}s`} begin={`${bolt.delay}s`} repeatCount="indefinite" />
              </ellipse>
            </g>
          );
        })}
      </svg>

      {/* Full-screen flash on lightning strike */}
      {bolts.map((bolt, bi) => (
        <div key={`flash${bi}`} className="absolute inset-0" style={{
          opacity: 0,
          animation: `ln-flash${bi} ${bolt.dur}s ease-out ${bolt.delay}s infinite`,
        }} />
      ))}

      {/* Rain — angled by wind */}
      {rain.map((r, i) => (
        <div key={`r${i}`} className="absolute"
          style={{
            left: `${r.x}%`, top: '-5%',
            width: '1px', height: `${r.len}px`,
            background: `linear-gradient(to bottom, transparent, rgba(147,197,253,${r.opacity}))`,
            transform: `rotate(${r.wind}deg)`,
            animation: `ln-rain ${r.dur}s linear ${r.delay}s infinite`,
          }} />
      ))}
      {rain.map((r, i) => (
        <div key={`r2${i}`} className="absolute"
          style={{
            left: `${(r.x + 50) % 100}%`, top: '-5%',
            width: '1px', height: `${r.len * 0.8}px`,
            background: `linear-gradient(to bottom, transparent, rgba(147,197,253,${r.opacity * 0.7}))`,
            transform: `rotate(${r.wind + 2}deg)`,
            animation: `ln-rain ${r.dur * 1.1}s linear ${r.delay + 0.2}s infinite`,
          }} />
      ))}

      {/* Heavy rain layer — larger drops */}
      {rainHeavy.map((r, i) => (
        <div key={`rh${i}`} className="absolute"
          style={{
            left: `${r.x}%`, top: '-8%',
            width: '1.5px', height: `${r.len}px`,
            background: `linear-gradient(to bottom, transparent, rgba(148,200,255,${r.opacity}))`,
            transform: `rotate(${r.wind}deg)`,
            animation: `ln-rain ${r.dur}s linear ${r.delay}s infinite`,
          }} />
      ))}

      {/* Horizontal wind streaks */}
      {windStreaks.map((w, i) => (
        <div key={`ws${i}`} className="absolute"
          style={{
            left: '-10%', top: `${w.y}%`,
            width: `${w.len}px`, height: '1px',
            background: `linear-gradient(to right, transparent, rgba(147,197,253,${w.opacity}), transparent)`,
            animation: `ln-wind ${w.dur}s linear ${w.delay}s infinite`,
          }} />
      ))}

      {/* Mist/fog rolling at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-[30%]"
        style={{
          background: 'linear-gradient(to top, rgba(14,20,38,0.4) 0%, rgba(20,28,50,0.15) 50%, transparent 100%)',
          filter: 'blur(8px)',
          animation: 'ln-fog 12s ease-in-out infinite',
        }} />
      <div className="absolute bottom-0 left-[-10%] right-[-10%] h-[20%]"
        style={{
          background: 'radial-gradient(ellipse at 30% 100%, rgba(30,42,68,0.35), transparent 60%)',
          filter: 'blur(16px)',
          animation: 'ln-fog 16s ease-in-out 4s infinite',
        }} />

      {/* Mist particles / spray */}
      {rumbleParticles.map((p, i) => (
        <div key={`mp${i}`} className="absolute rounded-full"
          style={{
            left: `${p.x}%`, top: `${p.y}%`,
            width: `${p.size}px`, height: `${p.size}px`,
            background: 'rgba(147,197,253,0.25)',
            animation: `ln-mist ${p.dur}s ease-in-out ${p.delay}s infinite`,
          }} />
      ))}

      {/* Distant horizon glow */}
      <div className="absolute bottom-[15%] left-0 right-0 h-[2px]"
        style={{
          background: 'linear-gradient(to right, transparent 10%, rgba(96,165,250,0.08) 30%, rgba(96,165,250,0.12) 50%, rgba(96,165,250,0.08) 70%, transparent 90%)',
          animation: 'ln-horizon 6s ease-in-out infinite',
        }} />

      <style>{`
        @keyframes ln-rain { 0%{transform:rotate(var(--wind,10deg)) translateY(-5vh);opacity:0} 10%{opacity:1} 90%{opacity:1} 100%{transform:rotate(var(--wind,10deg)) translateY(115vh);opacity:0} }
        @keyframes ln-cloud { 0%,100%{transform:translateX(0) scale(1)} 50%{transform:translateX(30px) scale(1.05)} }
        @keyframes ln-cloudglow { 0%,100%{opacity:0.4} 50%{opacity:0.8} }
        @keyframes ln-wind { 0%{left:-10%;opacity:0} 10%{opacity:1} 90%{opacity:1} 100%{left:110%;opacity:0} }
        @keyframes ln-fog { 0%,100%{transform:translateX(0);opacity:1} 50%{transform:translateX(20px);opacity:0.6} }
        @keyframes ln-mist { 0%,100%{opacity:0;transform:translateY(0)} 50%{opacity:0.4;transform:translateY(-6px)} }
        @keyframes ln-horizon { 0%,100%{opacity:0.5} 50%{opacity:1} }
        ${bolts.map((bolt, bi) => {
          const t = bolt.dur;
          return `@keyframes ln-flash${bi} { 0%,44%{background:transparent} 45%{background:rgba(96,165,250,0.08)} 45.5%{background:transparent} 46%{background:rgba(147,197,253,0.12)} 46.5%{background:transparent} 100%{background:transparent} }`;
        }).join(String.fromCharCode(10))}
      `}</style>
    </Shell>
  );
}
