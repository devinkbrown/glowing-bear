import { createContext, Show, useContext, type Accessor, type ComponentProps, type JSX } from 'solid-js';
import { createMediaQuery } from '@/primitives/mediaQuery';
import { settings } from '@/state/settings';

export type ThemeName =
  | 'darkbear' | 'midnight' | 'obsidian' | 'nord' | 'gruvbox' | 'rose-pine'
  | 'abyss' | 'ember' | 'aurora' | 'catppuccin' | 'tokyo-night'
  | 'dracula' | 'solarized' | 'starfield' | 'lightning' | 'phoenix'
  | 'retro' | 'light' | 'custom';

interface Props {
  theme: ThemeName;
}

/* Solid's JSX typings have no `vector-effect` attribute; spread it instead. */
const NON_SCALING_STROKE = { 'vector-effect': 'non-scaling-stroke' };

/* Solid's JSX typings also lack SMIL `href` on <mpath>; spread via a typed helper. */
const smilHref = (target: string) => ({ href: target }) as unknown as JSX.IntrinsicElements['mpath'];

function seededRand(seed: number) {
  let s = seed;
  return () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; };
}

/**
 * Round-robin bucket a flat list into a small fixed number of shimmer layers.
 *
 * The dense decorative fields (star twinkle, city-window blink, aurora sparks) used
 * to hang one CSS opacity animation on EVERY node — hundreds of always-animating
 * compositor layers. Instead we paint every node STATIC and shimmer a whole layer at
 * a time from a single animated wrapper, mirroring the StarfieldBg consolidation
 * (563 -> 41 animating nodes). The compositor then animates a fixed handful of
 * wrappers regardless of node density. Round-robin by index keeps spatially adjacent
 * nodes in different layers, so a grouped field never visibly pulses in bands.
 *
 * Exported for the compositor-budget test.
 */
export function shimmerLayers<T>(items: readonly T[], groups: number): T[][] {
  const g = Math.max(1, Math.min(groups, items.length || 1));
  const out: T[][] = Array.from({ length: g }, () => []);
  items.forEach((item, i) => out[i % g]!.push(item));
  return out;
}

/** Desynced per-layer shimmer timings (opacity only). Negative delays start each
 *  layer mid-cycle so a grouped field never pulses in unison. `mul` scales duration
 *  for tiered fields (near stars shimmer fast, far stars slow). */
const SHIMMER_TIMING = [
  { dur: 3.4, delay: 0 },
  { dur: 4.3, delay: -0.9 },
  { dur: 5.1, delay: -1.7 },
  { dur: 4.7, delay: -2.5 },
  { dur: 6.2, delay: -1.2 },
  { dur: 3.8, delay: -3.1 },
];

/** CSS `animation` shorthand for shimmer layer `g` of a grouped field. */
function shimmerAnim(name: string, g: number, mul = 1): string {
  const t = SHIMMER_TIMING[g % SHIMMER_TIMING.length]!;
  return `${name} ${(t.dur * mul).toFixed(2)}s ease-in-out ${(t.delay * mul).toFixed(2)}s infinite`;
}

// Whether decorative SMIL motion may run. Under prefers-reduced-motion: reduce the
// provider flips this to false and the gated <Anim>/<AnimMotion> wrappers render
// nothing, so the scene SVGs hold no SMIL nodes at all. CSS `animation:none` (the
// .theme-bg-shell reduced-motion rule) cannot reach SMIL (<animate>/<animateMotion>),
// so this JS gate is the only mechanism that stops the data-stream dots, pulse/sonar
// rings, jellyfish tentacles, flying bats, lightning strikes and phoenix-eye pulse
// (WCAG 2.2.2 Pause, Stop, Hide).
const MotionContext = createContext<Accessor<boolean>>(() => true);

/** Motion-gated <animate>. Absent from the DOM when reduced motion is active. */
function Anim(props: ComponentProps<'animate'>) {
  const motionOn = useContext(MotionContext);
  return (
    <Show when={motionOn()}>
      <animate {...props} />
    </Show>
  );
}

/** Motion-gated <animateMotion> (carries its <mpath> child). Absent under reduced motion. */
function AnimMotion(props: ComponentProps<'animateMotion'>) {
  const motionOn = useContext(MotionContext);
  return (
    <Show when={motionOn()}>
      <animateMotion {...props} />
    </Show>
  );
}

export default function ThemeBg(props: Props) {
  const reduced = createMediaQuery('(prefers-reduced-motion: reduce)');
  // Motion runs only when neither the OS pref NOR the in-app control asks to stop it.
  // Both reads are tracked, so a change to either flips the gated SMIL wrappers.
  const motionOn = (): boolean => !reduced() && settings.sceneMotion !== 'reduced';
  // Evaluated inside JSX so theme switches stay reactive in Solid.
  return (
    <MotionContext.Provider value={motionOn}>
      {themeBackground(props.theme)}
    </MotionContext.Provider>
  );
}

function themeBackground(theme: ThemeName): JSX.Element {
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
    case 'phoenix': return <PhoenixBg />;
    case 'retro': return <RetroArcadeBg />;
    case 'starfield': return <StarfieldBg />;
    case 'light': return <LightBg />;
    case 'custom': return <CustomBg />;
    default: return null;
  }
}

const Shell = (props: { children: JSX.Element }) => (
  <div class="theme-bg-shell absolute inset-0 pointer-events-none overflow-hidden opacity-75" aria-hidden="true"
    style={{ contain: 'layout style' }}>
    <style>{`@media (prefers-reduced-motion: reduce) { .theme-bg-shell * { animation: none !important; } }`}</style>
    {props.children}
  </div>
);

/* ── DarkBear: Living digital mesh — network nodes, data streams, pulse rings ── */
function DarkBearBg() {
  const nodes = (() => {
    const rand = seededRand(42);
    return Array.from({ length: 28 }, (_, i) => ({
      x: rand() * 90 + 5, y: rand() * 90 + 5,
      size: rand() < 0.15 ? (4 + rand() * 4) : (1.5 + rand() * 2.5),
      opacity: 0.15 + rand() * 0.45,
      dur: 4 + rand() * 8,
      delay: rand() * 12,
      hub: i < 6,
    }));
  })();

  const edges = (() => {
    const rand = seededRand(77);
    const out: { x1: number; y1: number; x2: number; y2: number; dur: number; delay: number }[] = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i]!.x - nodes[j]!.x;
        const dy = nodes[i]!.y - nodes[j]!.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 22 && rand() > 0.35) {
          out.push({ x1: nodes[i]!.x, y1: nodes[i]!.y, x2: nodes[j]!.x, y2: nodes[j]!.y, dur: 6 + rand() * 10, delay: rand() * 8 });
        }
      }
    }
    return out;
  })();

  const streams = (() => {
    const rand = seededRand(200);
    return Array.from({ length: 5 }, () => {
      const vertical = rand() > 0.5;
      return {
        x: rand() * 100, y: rand() * 100,
        vertical, len: 40 + rand() * 80,
        dur: 3 + rand() * 5, delay: rand() * 15,
        opacity: 0.06 + rand() * 0.12,
      };
    });
  })();

  const hexes = (() => {
    const rand = seededRand(150);
    return Array.from({ length: 6 }, () => ({
      x: rand() * 90 + 5, y: rand() * 90 + 5,
      size: 12 + rand() * 24,
      opacity: 0.04 + rand() * 0.06,
      dur: 15 + rand() * 20,
      delay: rand() * 10,
      rot: rand() * 360,
    }));
  })();

  return (
    <Shell>
      {/* Perspective grid floor */}
      <div class="absolute inset-0" style={{
        background: `
          linear-gradient(rgba(129,140,248,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(129,140,248,0.03) 1px, transparent 1px)`,
        'background-size': '60px 60px',
        'mask-image': 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0.6) 70%, transparent 100%)',
        '-webkit-mask-image': 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0.6) 70%, transparent 100%)',
      }} />

      {/* Morphing gradient blobs */}
      <div class="absolute w-[min(500px,40vw)] h-[min(500px,40vw)] top-[5%] left-[15%] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.12), transparent 55%)', animation: 'db-morph-a 25s ease-in-out infinite', filter: 'blur(40px)' }} />
      <div class="absolute w-[min(400px,35vw)] h-[min(400px,35vw)] bottom-[10%] right-[5%] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.1), transparent 55%)', animation: 'db-morph-b 30s ease-in-out infinite', filter: 'blur(35px)' }} />
      <div class="absolute w-[min(300px,28vw)] h-[min(300px,28vw)] top-[50%] left-[60%] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(129,140,248,0.08), transparent 55%)', animation: 'db-morph-c 22s ease-in-out infinite', filter: 'blur(30px)' }} />

      {/* SVG layer: edges, nodes, data streams */}
      <svg class="absolute inset-0 w-full h-full">
        {/* Network edges */}
        {edges.map((e, i) => (
          <line x1={`${e.x1}%`} y1={`${e.y1}%`} x2={`${e.x2}%`} y2={`${e.y2}%`}
            stroke="rgba(129,140,248,0.08)" stroke-width="0.5"
            style={{ animation: `db-edge-breathe ${e.dur}s ease-in-out ${e.delay}s infinite` }} />
        ))}

        {/* Data streams traveling along edges */}
        {edges.slice(0, 8).map((e, i) => {
          const id = `stream-path-${i}`;
          return (
            <g>
              <path id={id} d={`M${e.x1 * 10} ${e.y1 * 10} L${e.x2 * 10} ${e.y2 * 10}`}
                fill="none" stroke="none" />
              <circle r="1.5" fill="rgba(129,140,248,0.6)" style={{ filter: 'drop-shadow(0 0 3px rgba(129,140,248,0.4))' }}>
                <AnimMotion dur={`${3 + i * 0.7}s`} repeatCount="indefinite" begin={`${i * 1.2}s`}>
                  <mpath {...smilHref(`#${id}`)} />
                </AnimMotion>
              </circle>
            </g>
          );
        })}

        {/* Pulse rings from hub nodes */}
        {nodes.filter(n => n.hub).map((n, i) => (
          <circle cx={`${n.x}%`} cy={`${n.y}%`} r="0"
            fill="none" stroke="rgba(129,140,248,0.15)" stroke-width="0.5">
            <Anim attributeName="r" from="0" to="60" dur={`${6 + i * 2}s`} begin={`${i * 3}s`} repeatCount="indefinite" />
            <Anim attributeName="opacity" from="0.2" to="0" dur={`${6 + i * 2}s`} begin={`${i * 3}s`} repeatCount="indefinite" />
          </circle>
        ))}
      </svg>

      {/* Floating hexagons */}
      {hexes.map((h, i) => (
        <div class="absolute" style={{
          left: `${h.x}%`, top: `${h.y}%`, width: `${h.size}px`, height: `${h.size}px`,
          opacity: h.opacity, transform: `rotate(${h.rot}deg)`,
          animation: `db-hex-drift ${h.dur}s ease-in-out ${h.delay}s infinite`,
        }}>
          <svg viewBox="0 0 100 100" class="w-full h-full">
            <polygon points="50,2 93,25 93,75 50,98 7,75 7,25"
              fill="none" stroke="rgba(129,140,248,0.3)" stroke-width="1" />
          </svg>
        </div>
      ))}

      {/* Data stream lines */}
      {streams.map((s, i) => (
        <div class="absolute" style={{
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
        <div class="absolute rounded-full" style={{
          left: `${n.x}%`, top: `${n.y}%`,
          width: `${n.size}px`, height: `${n.size}px`,
          transform: 'translate(-50%, -50%)',
          background: n.hub ? 'rgba(167,139,250,0.7)' : 'rgba(129,140,248,0.5)',
          'box-shadow': n.hub
            ? `0 0 ${n.size * 3}px rgba(129,140,248,0.3), 0 0 ${n.size * 6}px rgba(129,140,248,0.1)`
            : `0 0 ${n.size * 2}px rgba(129,140,248,0.15)`,
          opacity: n.opacity,
          animation: `db-node ${n.dur}s ease-in-out ${n.delay}s infinite`,
        }} />
      ))}

      {/* Scan line */}
      <div class="absolute left-0 right-0 h-[1px]"
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
  const starsNear = (() => {
    const rand = seededRand(99);
    return Array.from({ length: 35 }, () => ({
      x: rand() * 100, y: rand() * 100,
      size: 1.4 + rand() * 1.8,
      opacity: 0.35 + rand() * 0.55,
      blue: rand() > 0.55,
    }));
  })();
  const starsMid = (() => {
    const rand = seededRand(200);
    return Array.from({ length: 40 }, () => ({
      x: rand() * 100, y: rand() * 100,
      size: 0.8 + rand() * 1.1,
      opacity: 0.25 + rand() * 0.45,
      blue: rand() > 0.65,
    }));
  })();
  const starsFar = (() => {
    const rand = seededRand(301);
    return Array.from({ length: 40 }, () => ({
      x: rand() * 100, y: rand() * 100,
      size: 0.3 + rand() * 0.7,
      opacity: 0.15 + rand() * 0.25,
    }));
  })();
  const milkyWayStars = (() => {
    const rand = seededRand(402);
    return Array.from({ length: 45 }, () => ({
      x: 15 + rand() * 70,
      y: rand() * 85,
      size: 0.3 + rand() * 0.9,
      opacity: 0.2 + rand() * 0.3,
    }));
  })();
  const shooters = (() => {
    const rand = seededRand(503);
    return [
      { x: 10 + rand() * 30, y: 5 + rand() * 20, angle: 25 + rand() * 20, dur: 3 + rand() * 2, delay: rand() * 18 },
      { x: 40 + rand() * 25, y: 3 + rand() * 15, angle: 18 + rand() * 15, dur: 2.5 + rand() * 2, delay: 7 + rand() * 14 },
      { x: 60 + rand() * 20, y: 8 + rand() * 18, angle: 30 + rand() * 25, dur: 2 + rand() * 3, delay: 14 + rand() * 12 },
    ];
  })();
  const nebulae = (() => {
    const rand = seededRand(604);
    return [
      { x: 20, y: 25, w: 380, h: 220, color: '139,156,248', opacity: 0.35, dur: 14, delay: 0 },
      { x: 55, y: 55, w: 300, h: 180, color: '160,100,220', opacity: 0.4, dur: 18, delay: 5 },
      { x: 10, y: 65, w: 260, h: 160, color: '80,120,200', opacity: 0.3, dur: 22, delay: 9 },
    ].map(n => ({ ...n, extraDelay: rand() * 3 }));
  })();
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
      <div class="absolute inset-0" style={{
        background: 'linear-gradient(135deg, transparent 15%, rgba(120,140,230,0.25) 30%, rgba(100,120,210,0.35) 50%, rgba(120,140,230,0.25) 70%, transparent 85%)',
        filter: 'blur(18px)',
      }} />
      {/* Milky Way dense cluster stars */}
      {milkyWayStars.map((s, i) => (
        <div class="absolute rounded-full"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.size}px`, height: `${s.size}px`,
            background: '#c0caff', opacity: s.opacity,
            'box-shadow': '0 0 4px rgba(192,202,255,0.6)' }} />
      ))}
      {/* Far stars — static dots, shimmered a whole layer at a time (slow). */}
      {shimmerLayers(starsFar, 4).map((layer, g) => (
        <div class="absolute inset-0" style={{ animation: shimmerAnim('mn-shimmer', g, 1.7) }}>
          {layer.map((s) => (
            <div class="absolute rounded-full"
              style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.size}px`, height: `${s.size}px`,
                background: '#d0d8ff', opacity: s.opacity }} />
          ))}
        </div>
      ))}
      {/* Mid stars (normal shimmer). */}
      {shimmerLayers(starsMid, 5).map((layer, g) => (
        <div class="absolute inset-0" style={{ animation: shimmerAnim('mn-shimmer', g, 1) }}>
          {layer.map((s) => (
            <div class="absolute rounded-full"
              style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.size}px`, height: `${s.size}px`,
                background: s.blue ? '#9aaeff' : '#e0e4ff', opacity: s.opacity }} />
          ))}
        </div>
      ))}
      {/* Near bright stars (fast shimmer). */}
      {shimmerLayers(starsNear, 5).map((layer, g) => (
        <div class="absolute inset-0" style={{ animation: shimmerAnim('mn-shimmer', g, 0.7) }}>
          {layer.map((s) => (
            <div class="absolute rounded-full"
              style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.size}px`, height: `${s.size}px`,
                background: s.blue ? '#8b9cf8' : '#f0f2ff', opacity: s.opacity,
                'box-shadow': s.size > 2 ? `0 0 ${s.size * 4}px rgba(139,156,248,0.6)` : undefined }} />
          ))}
        </div>
      ))}
      {/* Nebula breathing clouds */}
      {nebulae.map((n, i) => (
        <div class="absolute rounded-full"
          style={{ left: `${n.x}%`, top: `${n.y}%`, width: `${n.w}px`, height: `${n.h}px`,
            background: `radial-gradient(ellipse, rgba(${n.color},${n.opacity}), transparent 60%)`,
            filter: 'blur(28px)',
            animation: `mn-breathe ${n.dur}s ease-in-out ${n.delay + n.extraDelay}s infinite` }} />
      ))}
      {/* Crescent moon upper-right */}
      <div class="absolute" style={{ top: '6%', right: '8%', width: '52px', height: '52px' }}>
        {/* Outer glow halo */}
        <div class="absolute rounded-full" style={{
          top: '-30%', left: '-30%', width: '160%', height: '160%',
          background: 'radial-gradient(circle, rgba(180,200,255,0.3), transparent 55%)',
          filter: 'blur(8px)', animation: 'mn-moon-glow 9s ease-in-out infinite',
        }} />
        <svg viewBox="0 0 52 52" class="w-full h-full">
          {/* Full circle */}
          <circle cx="26" cy="26" r="22" fill="rgba(210,220,255,0.5)" />
          {/* Inner shadow cutout to make crescent */}
          <circle cx="34" cy="22" r="19" fill="rgba(8,8,22,0.92)" />
          {/* Soft inner edge */}
          <circle cx="26" cy="26" r="22" fill="none" stroke="rgba(180,200,255,0.3)" stroke-width="1" />
        </svg>
      </div>
      {/* SVG: constellation lines + shooting stars */}
      <svg class="absolute inset-0 w-full h-full" style={{ overflow: 'visible' }}>
        {constellationLines.map((l, i) => (
          <line x1={`${l.x1}%`} y1={`${l.y1}%`} x2={`${l.x2}%`} y2={`${l.y2}%`}
            stroke="rgba(139,156,248,0.4)" stroke-width="1.2"
            style={{ animation: `mn-line ${l.dur}s ease-in-out ${l.delay}s infinite` }} />
        ))}
        {/* Constellation node dots — static, shimmered a layer at a time. */}
        {shimmerLayers([
          [12,18],[22,10],[30,20],[65,30],[75,30],[70,25],[70,35],
          [8,62],[14,55],[20,63],[26,56],[32,64],[48,15],[56,22],[62,16],[82,42],[90,50],
        ] as [number, number][], 3).map((layer, g) => (
          <g style={{ animation: shimmerAnim('mn-shimmer', g, 1.5) }}>
            {layer.map(([x, y]) => (
              <circle cx={`${x}%`} cy={`${y}%`} r="1.2" fill="rgba(180,196,255,0.6)" />
            ))}
          </g>
        ))}
        {/* Shooting stars */}
        {shooters.map((s, i) => (
          <g style={{ animation: `mn-shoot ${s.dur}s ease-in ${s.delay}s infinite`, opacity: 0 }}>
            <line
              x1={`${s.x}%`} y1={`${s.y}%`}
              x2={`${s.x + 15}%`} y2={`${s.y + 10}%`}
              stroke={`url(#shooter-grad-${i})`} stroke-width="2.5" stroke-linecap="round" />
            <defs>
              <linearGradient id={`shooter-grad-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="rgba(255,255,255,0)" />
                <stop offset="70%" stop-color="rgba(200,215,255,0.9)" />
                <stop offset="100%" stop-color="rgba(255,255,255,1)" />
              </linearGradient>
            </defs>
          </g>
        ))}
      </svg>
      {/* Horizon warm glow */}
      <div class="absolute bottom-0 left-0 right-0 h-[18%]"
        style={{ background: 'linear-gradient(to top, rgba(80,60,120,0.2), transparent)', filter: 'blur(4px)' }} />
      <style>{`
        /* Grouped star/dot shimmer — opacity only, drives a whole static layer. */
        @keyframes mn-shimmer      { 0%,100%{opacity:1} 50%{opacity:0.3} }
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
  const shards = (() => {
    const rand = seededRand(44);
    return Array.from({ length: 9 }, (_, i) => {
      const cx = 8 + rand() * 84;
      const cy = 5 + rand() * 85;
      const w = 60 + rand() * 180;
      const h = 40 + rand() * 120;
      const rot = -30 + rand() * 60;
      const pts: string[] = [];
      const n = 4 + Math.floor(rand() * 3);
      for (let j = 0; j < n; j++) {
        const a = (j / n) * Math.PI * 2 - Math.PI / 2;
        const r = 38 + rand() * 12;
        pts.push(`${50 + Math.cos(a) * r}% ${50 + Math.sin(a) * r}%`);
      }
      return { cx, cy, w, h, rot, clip: `polygon(${pts.join(', ')})`,
        dur: 14 + rand() * 18, delay: rand() * 12, layer: i < 3 ? 0 : i < 6 ? 1 : 2,
        edgeAngle: rand() * 360 };
    });
  })();

  const glints = (() => {
    const rand = seededRand(144);
    return Array.from({ length: 14 }, () => ({
      x: rand() * 100, y: rand() * 100,
      size: 1 + rand() * 2.5,
      dur: 3 + rand() * 6, delay: rand() * 14,
    }));
  })();

  const veins = (() => {
    const rand = seededRand(244);
    return Array.from({ length: 5 }, () => {
      const segs: { x: number; y: number }[] = [];
      let x = rand() * 100, y = rand() * 100;
      const n = 4 + Math.floor(rand() * 4);
      for (let j = 0; j < n; j++) {
        segs.push({ x, y });
        x += (rand() - 0.5) * 30;
        y += 8 + rand() * 15;
        x = Math.max(2, Math.min(98, x));
        y = Math.min(98, y);
      }
      return { segs, dur: 8 + rand() * 10, delay: rand() * 16, opacity: 0.15 + rand() * 0.2 };
    });
  })();

  const motes = (() => {
    const rand = seededRand(344);
    return Array.from({ length: 18 }, () => ({
      x: rand() * 100, dur: 12 + rand() * 20, delay: rand() * 16,
      drift: (rand() - 0.5) * 40, size: 1 + rand() * 2, color: Math.floor(rand() * 3),
    }));
  })();

  const moteColors = ['rgba(167,139,250,0.6)', 'rgba(200,180,255,0.5)', 'rgba(130,100,230,0.55)'];

  return (
    <Shell>
      {/* Deep volcanic glass base gradient */}
      <div class="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at 35% 25%, rgba(30,20,60,0.6) 0%, transparent 50%), radial-gradient(ellipse at 70% 75%, rgba(20,15,50,0.5) 0%, transparent 45%)' }} />

      {/* Glass shard planes — fractured obsidian with iridescent edge catches */}
      {shards.map((s, i) => (
        <div class="absolute"
          style={{
            left: `${s.cx - s.w / 6}%`, top: `${s.cy - s.h / 6}%`,
            width: `${s.w}px`, height: `${s.h}px`,
            transform: `rotate(${s.rot}deg)`,
            'clip-path': s.clip,
            background: s.layer === 0
              ? `linear-gradient(${s.edgeAngle}deg, transparent 30%, rgba(120,90,200,0.08) 48%, rgba(180,160,240,0.12) 52%, transparent 70%)`
              : s.layer === 1
              ? `linear-gradient(${s.edgeAngle}deg, transparent 25%, rgba(100,70,190,0.06) 45%, rgba(160,140,230,0.1) 55%, transparent 75%)`
              : `linear-gradient(${s.edgeAngle}deg, transparent 35%, rgba(90,60,180,0.05) 48%, rgba(140,120,220,0.08) 52%, transparent 65%)`,
            animation: `ob-shard ${s.dur}s ease-in-out ${s.delay}s infinite`,
            opacity: 0.7,
          }} />
      ))}

      {/* Slow prismatic sweep — single elegant light band crossing the surface */}
      <div class="absolute" style={{width:'200%', height:'120px', top:'30%', left:'-50%',
        background: 'linear-gradient(90deg, transparent 20%, rgba(140,110,230,0.06) 40%, rgba(200,180,255,0.14) 48%, rgba(255,255,255,0.08) 50%, rgba(180,160,240,0.12) 52%, rgba(120,90,210,0.06) 60%, transparent 80%)',
        transform: 'rotate(-8deg)',
        animation: 'ob-sweep 20s ease-in-out infinite' }} />
      <div class="absolute" style={{width:'200%', height:'80px', top:'60%', left:'-50%',
        background: 'linear-gradient(90deg, transparent 25%, rgba(130,100,220,0.05) 42%, rgba(180,160,240,0.1) 49%, rgba(220,210,255,0.06) 51%, rgba(150,120,230,0.08) 58%, transparent 75%)',
        transform: 'rotate(5deg)',
        animation: 'ob-sweep 26s ease-in-out 8s infinite' }} />

      {/* Fracture veins — thin lines of trapped light between glass planes */}
      <svg class="absolute inset-0 w-full h-full">
        {veins.map((v, i) => {
          const d = v.segs.map((s, si) => `${si === 0 ? 'M' : 'L'}${s.x},${s.y}`).join(' ');
          return (
            <g>
              <path d={d} fill="none" stroke={`rgba(167,139,250,${v.opacity})`} stroke-width="1.5"
                stroke-linecap="round" stroke-linejoin="round"
                {...NON_SCALING_STROKE}
                style={{ animation: `ob-vein ${v.dur}s ease-in-out ${v.delay}s infinite` }} />
              <path d={d} fill="none" stroke={`rgba(200,180,255,${v.opacity * 0.4})`} stroke-width="4"
                stroke-linecap="round" stroke-linejoin="round"
                {...NON_SCALING_STROKE}
                style={{ animation: `ob-vein ${v.dur}s ease-in-out ${v.delay}s infinite` }} />
            </g>
          );
        })}
      </svg>

      {/* Glint sparks — tiny points where light catches fracture edges */}
      {glints.map((g, i) => (
        <div class="absolute"
          style={{
            left: `${g.x}%`, top: `${g.y}%`,
            width: `${g.size}px`, height: `${g.size}px`,
            'border-radius': '50%',
            background: 'rgba(220,210,255,0.9)',
            'box-shadow': '0 0 6px rgba(167,139,250,0.8), 0 0 12px rgba(167,139,250,0.3)',
            animation: `ob-glint ${g.dur}s ease-in-out ${g.delay}s infinite`,
          }} />
      ))}

      {/* Rising volcanic glass motes — slowly ascending dust */}
      {motes.map((m, i) => (
        <div class="absolute"
          style={{
            left: `${m.x}%`, bottom: '-3%',
            width: `${m.size}px`, height: `${m.size}px`,
            'border-radius': '50%',
            background: moteColors[m.color],
            ['--ob-drift' as string]: `${m.drift}px`,
            animation: `ob-mote ${m.dur}s linear ${m.delay}s infinite`,
          }} />
      ))}

      {/* Deep ambient core glow */}
      <div class="absolute rounded-full"
        style={{width:'min(500px,50vw)', height:'min(500px,50vw)',
          top:'45%', left:'50%',
          background: 'radial-gradient(circle, rgba(120,90,200,0.15), rgba(80,50,160,0.06) 40%, transparent 65%)',
          transform: 'translate(-50%, -50%)',
          animation: 'ob-core 20s ease-in-out infinite' }} />

      <style>{`
        @keyframes ob-shard  { 0%,100%{opacity:0.5;transform:rotate(var(--r,0deg))} 50%{opacity:0.9;transform:rotate(var(--r,0deg))} }
        @keyframes ob-sweep  { 0%,100%{transform:rotate(var(--ob-ang,0deg)) translateX(-35%);opacity:0.6} 50%{transform:rotate(var(--ob-ang,0deg)) translateX(35%);opacity:1} }
        @keyframes ob-vein   { 0%,100%{opacity:0.3} 40%{opacity:1} 60%{opacity:1} }
        @keyframes ob-glint  { 0%,100%{opacity:0;transform:scale(0.5)} 15%{opacity:1;transform:scale(1.2)} 25%{opacity:0.8;transform:scale(1)} 35%{opacity:0;transform:scale(0.5)} }
        @keyframes ob-mote   { 0%{opacity:0;transform:translateY(0) translateX(0)} 8%{opacity:0.7} 85%{opacity:0.3} 100%{opacity:0;transform:translateY(-110vh) translateX(var(--ob-drift))} }
        @keyframes ob-core   { 0%,100%{opacity:0.8;transform:translate(-50%,-50%) scale(1)} 50%{opacity:1;transform:translate(-50%,-50%) scale(1.15)} }
      `}</style>
    </Shell>
  );
}

/* ── Nord: Aurora borealis curtains, frost particles, polar sky ── */
function NordBg() {
  const frost = (() => {
    const rand = seededRand(22);
    return Array.from({ length: 30 }, () => ({
      x: rand() * 100, y: rand() * 70,
      size: 0.8 + rand() * 2.5,
      dur: 4 + rand() * 7,
      delay: rand() * 9,
      color: Math.floor(rand() * 3),
    }));
  })();
  const snowflakes = (() => {
    const rand = seededRand(122);
    return Array.from({ length: 25 }, () => ({
      x: rand() * 100,
      size: 2 + rand() * 4,
      dur: 8 + rand() * 14,
      delay: rand() * 16,
      drift: (rand() - 0.5) * 60,
      opacity: 0.4 + rand() * 0.4,
    }));
  })();
  const hexCrystals = (() => {
    const rand = seededRand(222);
    return Array.from({ length: 6 }, () => ({
      x: 5 + rand() * 90, y: 5 + rand() * 55,
      size: 18 + rand() * 30,
      dur: 10 + rand() * 14, delay: rand() * 9,
      rot: rand() * 60,
    }));
  })();
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
      <svg class="absolute bottom-0 left-0 right-0 w-full" viewBox="0 0 1000 180" preserveAspectRatio="none" style={{ height: '22%' }}>
        <defs>
          <linearGradient id="nd-mountain-edge" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#5e81ac" stop-opacity="0.7" />
            <stop offset="100%" stop-color="#2e3440" stop-opacity="0.3" />
          </linearGradient>
        </defs>
        {/* Back range */}
        <path d="M0,180 L0,120 L80,60 L160,90 L260,30 L360,80 L440,40 L520,85 L620,25 L720,75 L800,45 L880,80 L960,50 L1000,70 L1000,180 Z"
          fill="rgba(36,40,59,0.8)" />
        {/* Blue edge highlight */}
        <path d="M0,120 L80,60 L160,90 L260,30 L360,80 L440,40 L520,85 L620,25 L720,75 L800,45 L880,80 L960,50 L1000,70"
          fill="none" stroke="url(#nd-mountain-edge)" stroke-width="2" />
        {/* Front range */}
        <path d="M0,180 L0,145 L60,100 L130,125 L200,85 L300,110 L390,70 L480,105 L560,80 L650,115 L730,88 L820,120 L900,95 L970,115 L1000,100 L1000,180 Z"
          fill="rgba(28,32,48,0.9)" />
      </svg>
      {/* Aurora bands */}
      {auroraBands.map((band, i) => (
        <div class="absolute left-0 right-0"
          style={{ top: band.top, height: band.h,
            background: `linear-gradient(180deg, ${band.color}80 0%, ${band.color}50 40%, transparent 100%)`,
            animation: `nd-wave ${band.dur} ease-in-out ${band.delay} infinite`,
            filter: 'blur(28px)' }} />
      ))}
      {/* Vertical curtain columns */}
      {Array.from({ length: 12 }, (_, i) => (
        <div class="absolute top-0"
          style={{ left: `${2 + i * 8}%`, width: '5%', height: '58%',
            background: `linear-gradient(180deg, ${auroraColors[i % auroraColors.length]}70, transparent)`,
            animation: `nd-col ${3.5 + i * 1.1}s ease-in-out ${i * 0.7}s infinite`,
            filter: 'blur(10px)' }} />
      ))}
      {/* Frost particles */}
      {frost.map((f, i) => (
        <div class="absolute rounded-full"
          style={{ left: `${f.x}%`, top: `${f.y}%`, width: `${f.size}px`, height: `${f.size}px`,
            background: ['#88c0d0', '#81a1c1', '#8fbcbb'][f.color],
            opacity: 0.4 + (i % 4) * 0.2,
            'box-shadow': `0 0 4px ${['#88c0d0', '#81a1c1', '#8fbcbb'][f.color]}`,
            animation: `nd-frost ${f.dur}s ease-in-out ${f.delay}s infinite` }} />
      ))}
      {/* Falling snowflakes */}
      {snowflakes.map((s, i) => (
        <div class="absolute rounded-full opacity-0"
          style={{ left: `${s.x}%`, top: '-3%', width: `${s.size}px`, height: `${s.size}px`,
            background: 'rgba(236,239,244,0.9)',
            'box-shadow': '0 0 6px rgba(236,239,244,0.8)',
            animation: `nd-snow ${s.dur}s linear ${s.delay}s infinite`,
            ['--snow-drift' as string]: `${s.drift}px` }} />
      ))}
      {/* Ice crystal hexagons */}
      <svg class="absolute inset-0 w-full h-full">
        {hexCrystals.map((h, i) => (
          <g
            style={{ animation: `nd-crystal ${h.dur}s ease-in-out ${h.delay}s infinite`, 'transform-origin': `${h.x}% ${h.y}%` }}>
            <polygon
              points={`${h.x * 10},${h.y * 10 - h.size} ${h.x * 10 + h.size * 0.866},${h.y * 10 - h.size * 0.5} ${h.x * 10 + h.size * 0.866},${h.y * 10 + h.size * 0.5} ${h.x * 10},${h.y * 10 + h.size} ${h.x * 10 - h.size * 0.866},${h.y * 10 + h.size * 0.5} ${h.x * 10 - h.size * 0.866},${h.y * 10 - h.size * 0.5}`}
              fill="none" stroke="rgba(136,192,208,0.5)" stroke-width="1.2"
              transform={`rotate(${h.rot}, ${h.x * 10}, ${h.y * 10})`}
              style={{ filter: 'drop-shadow(0 0 3px rgba(136,192,208,0.7))' }} />
          </g>
        ))}
        {/* Northern star with cross-flare */}
        <g style={{ animation: 'nd-star 5s ease-in-out infinite', 'transform-origin': '82% 5%' }}>
          <circle cx="82%" cy="5%" r="3" fill="rgba(236,239,244,0.9)" />
          <line x1="82%" y1="1%" x2="82%" y2="9%" stroke="rgba(236,239,244,0.7)" stroke-width="1.2" />
          <line x1="78%" y1="5%" x2="86%" y2="5%" stroke="rgba(236,239,244,0.7)" stroke-width="1.2" />
          <line x1="79.2%" y1="2.2%" x2="84.8%" y2="7.8%" stroke="rgba(236,239,244,0.5)" stroke-width="1" />
          <line x1="84.8%" y1="2.2%" x2="79.2%" y2="7.8%" stroke="rgba(236,239,244,0.5)" stroke-width="1" />
        </g>
      </svg>
      {/* Subtle grid lines */}
      <div class="absolute inset-0 opacity-[0.08]"
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
  const embers = (() => {
    const rand = seededRand(73);
    return Array.from({ length: 40 }, (_, i) => ({
      x: rand() * 100,
      size: i < 10 ? (0.6 + rand() * 1.2) : i < 28 ? (1.5 + rand() * 2.5) : (3 + rand() * 4.5),
      dur: i < 10 ? (1.2 + rand() * 1.8) : i < 28 ? (2.5 + rand() * 4) : (4 + rand() * 6),
      delay: rand() * 10,
      drift: (rand() - 0.5) * 80,
      color: rand() > 0.55 ? '#d79921' : rand() > 0.3 ? '#d65d0e' : '#cc241d',
    }));
  })();
  const ash = (() => {
    const rand = seededRand(173);
    return Array.from({ length: 20 }, () => ({
      x: rand() * 100,
      size: 1.5 + rand() * 3,
      dur: 12 + rand() * 18,
      delay: rand() * 12,
      drift: (rand() - 0.5) * 40,
    }));
  })();
  const lavaPoolPositions = [18, 50, 80];
  return (
    <Shell>
      {/* Heat glow zones */}
      <div class="absolute bottom-0 left-0 right-0 h-[62%]"
        style={{ background: 'linear-gradient(to top, rgba(215,153,33,0.5), rgba(214,93,14,0.3) 45%, transparent)', animation: 'gv-glow 4s ease-in-out infinite' }} />
      <div class="absolute bottom-0 left-[5%] right-[5%] h-[45%]"
        style={{ background: 'radial-gradient(ellipse at bottom, rgba(214,93,14,0.6), transparent 60%)', animation: 'gv-glow 5.5s ease-in-out 1.2s infinite' }} />
      <div class="absolute bottom-0 left-[20%] right-[20%] h-[32%]"
        style={{ background: 'radial-gradient(ellipse at bottom, rgba(204,36,29,0.5), transparent 55%)', animation: 'gv-glow 4.5s ease-in-out 2.4s infinite' }} />
      <div class="absolute bottom-0 left-[35%] right-[35%] h-[20%]"
        style={{ background: 'radial-gradient(ellipse at bottom, rgba(255,180,50,0.4), transparent 50%)', animation: 'gv-glow 3.5s ease-in-out 3.6s infinite' }} />
      {/* Coal bed strip */}
      <div class="absolute bottom-0 left-0 right-0 h-[3px]"
        style={{ background: 'linear-gradient(90deg, transparent 5%, rgba(215,153,33,0.8) 20%, rgba(255,200,60,0.9) 50%, rgba(215,153,33,0.8) 80%, transparent 95%)', filter: 'blur(1px)', animation: 'gv-coal 3s ease-in-out infinite' }} />
      {/* Molten lava pools */}
      {lavaPoolPositions.map((pos, i) => (
        <div class="absolute bottom-0"
          style={{ left: `${pos - 12}%`, width: '24%', height: '6%',
            background: `radial-gradient(ellipse at center bottom, rgba(255,${160 - i * 20},30,0.7), rgba(214,93,14,0.4) 50%, transparent 75%)`,
            filter: 'blur(3px)', animation: `gv-pool ${4 + i * 1.5}s ease-in-out ${i * 1.2}s infinite` }} />
      ))}
      {/* Lava crack lines */}
      {[8, 18, 30, 43, 55, 67, 78, 90].map((x, i) => (
        <div class="absolute bottom-0"
          style={{ left: `${x}%`, width: '2px', height: `${12 + i * 5}%`,
            background: `linear-gradient(to top, rgba(${i % 3 === 0 ? '215,153,33' : i % 3 === 1 ? '214,93,14' : '204,36,29'},${0.7 - i * 0.03}), transparent)`,
            filter: 'blur(1.5px)',
            'box-shadow': `0 0 8px rgba(215,153,33,0.6)`,
            animation: `gv-crack ${2.5 + i * 1.1}s ease-in-out ${i * 0.55}s infinite` }} />
      ))}
      {/* Heat distortion shimmer */}
      <div class="absolute bottom-0 left-0 right-0 h-[30%]"
        style={{ animation: 'gv-shimmer 1.8s ease-in-out infinite', filter: 'blur(2px)',
          background: 'linear-gradient(to top, rgba(215,100,14,0.15), transparent)' }} />
      {/* Smoke wisps */}
      {[12, 28, 46, 62, 80].map((x, i) => (
        <div class="absolute"
          style={{ left: `${x}%`, bottom: '8%', width: `${30 + i * 8}px`, height: '20%',
            background: `radial-gradient(ellipse at center bottom, rgba(80,60,40,0.3), transparent 65%)`,
            filter: 'blur(12px)',
            animation: `gv-smoke ${6 + i * 2}s ease-out ${i * 1.4}s infinite` }} />
      ))}
      {/* Embers */}
      {embers.map((e, i) => (
        <div class="absolute rounded-full"
          style={{ left: `${e.x}%`, bottom: '0',
            width: `${e.size}px`, height: `${e.size}px`,
            background: e.color, opacity: 0,
            'box-shadow': `0 0 ${e.size * 4}px ${e.color}`,
            ['--gv-drift' as string]: `${e.drift}px`,
            animation: `gv-rise ${e.dur}s ease-out ${e.delay}s infinite` }} />
      ))}
      {/* Ash particles */}
      {ash.map((a, i) => (
        <div class="absolute rounded-full opacity-0"
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
  const petalsRound = (() => {
    const rand = seededRand(55);
    return Array.from({ length: 10 }, () => ({
      x: rand() * 112 - 6, size: 10 + rand() * 12,
      dur: 8 + rand() * 12, delay: rand() * 16,
      drift: (rand() - 0.5) * 90,
      color: rand() > 0.5 ? '#eb6f92' : rand() > 0.3 ? '#c4a7e7' : '#f6c177',
    }));
  })();
  const petalsElong = (() => {
    const rand = seededRand(155);
    return Array.from({ length: 8 }, () => ({
      x: rand() * 112 - 6, size: 7 + rand() * 10,
      dur: 9 + rand() * 11, delay: rand() * 18,
      drift: (rand() - 0.5) * 120,
      color: rand() > 0.5 ? '#eb6f92' : '#c4a7e7',
    }));
  })();
  const petalsSmall = (() => {
    const rand = seededRand(255);
    return Array.from({ length: 7 }, () => ({
      x: rand() * 112 - 6, size: 4 + rand() * 6,
      dur: 6 + rand() * 10, delay: rand() * 14,
      drift: (rand() - 0.5) * 70,
      color: rand() > 0.6 ? '#f6c177' : '#eb6f92',
    }));
  })();
  const fireflies = (() => {
    const rand = seededRand(56);
    return Array.from({ length: 12 }, () => ({
      x: rand() * 100, y: rand() * 95,
      dur: 5 + rand() * 9,
      delay: rand() * 12,
      glowColor: Math.floor(rand() * 3),
    }));
  })();
  const windParticles = (() => {
    const rand = seededRand(356);
    return Array.from({ length: 8 }, () => ({
      y: 5 + rand() * 85, size: 1.5 + rand() * 2.5,
      dur: 4 + rand() * 6, delay: rand() * 10,
      opacity: 0.3 + rand() * 0.4,
    }));
  })();
  const dewDrops = (() => {
    const rand = seededRand(456);
    return Array.from({ length: 8 }, () => ({
      x: rand() * 100, y: 55 + rand() * 35,
      size: 2 + rand() * 3,
      dur: 3 + rand() * 4, delay: rand() * 8,
    }));
  })();
  const glowColors = ['rgba(246,193,119,', 'rgba(235,111,146,', 'rgba(196,167,231,'];
  return (
    <Shell>
      {/* Fog/mist layers */}
      <div class="absolute w-[min(650px,50vw)] h-[min(400px,30vw)] top-[18%] right-[-12%] rounded-full"
        style={{ background: 'radial-gradient(ellipse, rgba(235,111,146,0.25), transparent 50%)', filter: 'blur(30px)', animation: 'rp-drift-a 22s ease-in-out infinite' }} />
      <div class="absolute w-[min(520px,42vw)] h-[min(350px,28vw)] bottom-[8%] left-[-12%] rounded-full"
        style={{ background: 'radial-gradient(ellipse, rgba(196,167,231,0.3), transparent 50%)', filter: 'blur(28px)', animation: 'rp-drift-b 28s ease-in-out infinite' }} />
      <div class="absolute w-[min(420px,35vw)] h-[min(300px,25vw)] top-[45%] left-[35%] rounded-full"
        style={{ background: 'radial-gradient(ellipse, rgba(246,193,119,0.25), transparent 50%)', filter: 'blur(22px)', animation: 'rp-drift-c 34s ease-in-out 6s infinite' }} />
      <div class="absolute w-[min(380px,30vw)] h-[min(260px,22vw)] top-[5%] left-[20%] rounded-full"
        style={{ background: 'radial-gradient(ellipse, rgba(235,111,146,0.2), transparent 50%)', filter: 'blur(20px)', animation: 'rp-drift-a 40s ease-in-out 10s infinite reverse' }} />
      <div class="absolute w-[min(300px,24vw)] h-[min(200px,16vw)] bottom-[25%] right-[10%] rounded-full"
        style={{ background: 'radial-gradient(ellipse, rgba(196,167,231,0.2), transparent 50%)', filter: 'blur(18px)', animation: 'rp-drift-b 30s ease-in-out 4s infinite reverse' }} />
      {/* Moonbeam diagonal shaft */}
      <div class="absolute" style={{
        top: '-10%', left: '-5%', width: '60%', height: '80%',
        background: 'linear-gradient(135deg, rgba(246,193,119,0.2) 0%, rgba(235,111,146,0.15) 30%, transparent 60%)',
        filter: 'blur(20px)',
        animation: 'rp-moonbeam 18s ease-in-out infinite',
      }} />
      {/* SVG: branch silhouettes + flower blooms + dew drops */}
      <svg class="absolute inset-0 w-full h-full">
        {/* Branch/vine silhouettes */}
        <path d="M0,40 Q15,20 25,35 Q35,50 50,30 Q60,15 70,25 Q80,35 90,20"
          fill="none" stroke="rgba(40,30,45,0.7)" stroke-width="2" />
        <path d="M0,60 Q10,45 20,55 Q30,65 45,48 Q55,32 65,42"
          fill="none" stroke="rgba(40,30,45,0.6)" stroke-width="1.5" />
        <path d="M100,30 Q88,18 80,28 Q72,38 62,22 Q54,10 44,18"
          fill="none" stroke="rgba(40,30,45,0.65)" stroke-width="1.8" />
        <path d="M0,85 Q12,75 22,82 Q32,89 42,78"
          fill="none" stroke="rgba(40,30,45,0.5)" stroke-width="1.3" />
        {/* Flower bloom clusters */}
        {([
          [20, 28], [48, 22], [70, 18], [85, 24], [10, 52], [62, 38],
        ] as [number, number][]).map(([cx, cy], i) => (
          <g style={{ animation: `rp-bloom ${3 + i * 0.8}s ease-in-out ${i * 1.2}s infinite`, 'transform-origin': `${cx}% ${cy}%` }}>
            {[0, 90, 180, 270].map((a) => {
              const rad = a * Math.PI / 180;
              const r = 3;
              return (
                <circle cx={`${cx + Math.cos(rad) * r}%`} cy={`${cy + Math.sin(rad) * r}%`} r="1.5"
                  fill={i % 3 === 0 ? 'rgba(235,111,146,0.7)' : i % 3 === 1 ? 'rgba(196,167,231,0.7)' : 'rgba(246,193,119,0.7)'} />
              );
            })}
            <circle cx={`${cx}%`} cy={`${cy}%`} r="1"
              fill={i % 3 === 0 ? 'rgba(246,193,119,0.8)' : 'rgba(235,111,146,0.8)'} />
          </g>
        ))}
        {/* Dew drops */}
        {dewDrops.map((d, i) => (
          <circle cx={`${d.x}%`} cy={`${d.y}%`} r={d.size}
            fill="rgba(255,255,255,0.3)"
            stroke="rgba(246,193,119,0.5)" stroke-width="0.8"
            style={{ animation: `rp-dew ${d.dur}s ease-in-out ${d.delay}s infinite` }} />
        ))}
      </svg>
      {/* Round petals */}
      {petalsRound.map((p, i) => (
        <div class="absolute opacity-0"
          style={{ left: `${p.x}%`, top: '-4%',
            width: `${p.size}px`, height: `${p.size}px`,
            background: p.color, 'border-radius': '50%',
            opacity: 0, filter: 'blur(0.5px)',
            animation: `rp-fall ${p.dur}s ease-in-out ${p.delay}s infinite`,
            ['--rp-drift' as string]: `${p.drift}px` }} />
      ))}
      {/* Elongated petals */}
      {petalsElong.map((p, i) => (
        <div class="absolute opacity-0"
          style={{ left: `${p.x}%`, top: '-4%',
            width: `${p.size * 0.45}px`, height: `${p.size}px`,
            background: p.color, 'border-radius': '50% 50% 50% 50% / 60% 60% 40% 40%',
            opacity: 0,
            animation: `rp-fall ${p.dur}s ease-in-out ${p.delay}s infinite`,
            ['--rp-drift' as string]: `${p.drift}px` }} />
      ))}
      {/* Small petals */}
      {petalsSmall.map((p, i) => (
        <div class="absolute opacity-0"
          style={{ left: `${p.x}%`, top: '-4%',
            width: `${p.size}px`, height: `${p.size * 0.7}px`,
            background: p.color, 'border-radius': '50% 0 50% 0',
            opacity: 0,
            animation: `rp-fall ${p.dur}s ease-in-out ${p.delay}s infinite`,
            ['--rp-drift' as string]: `${p.drift}px` }} />
      ))}
      {/* Fireflies */}
      {fireflies.map((f, i) => (
        <div class="absolute"
          style={{ left: `${f.x}%`, top: `${f.y}%`, animation: `rp-fly ${f.dur}s ease-in-out ${f.delay}s infinite`, opacity: 0 }}>
          {/* Outer halo */}
          <div class="absolute rounded-full"
            style={{ top: '-6px', left: '-6px', width: '14px', height: '14px',
              background: `radial-gradient(circle, ${glowColors[f.glowColor]}0.4), transparent 70%)`,
              filter: 'blur(4px)' }} />
          {/* Core dot */}
          <div class="absolute rounded-full"
            style={{ width: '3px', height: '3px',
              background: f.glowColor === 0 ? '#f6c177' : f.glowColor === 1 ? '#eb6f92' : '#c4a7e7',
              'box-shadow': `0 0 8px ${f.glowColor === 0 ? '#f6c177' : f.glowColor === 1 ? '#eb6f92' : '#c4a7e7'}` }} />
        </div>
      ))}
      {/* Wind-blown horizontal particles */}
      {windParticles.map((w, i) => (
        <div class="absolute rounded-full"
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
  const orbs = (() => {
    const rand = seededRand(88);
    return Array.from({ length: 20 }, (_, i) => ({
      x: rand() * 100, y: rand() * 100,
      size: i < 7 ? (3 + rand() * 6) : i < 16 ? (6 + rand() * 12) : (14 + rand() * 10),
      dur: 4 + rand() * 9,
      delay: rand() * 12,
      color: rand() > 0.5 ? '#2dd4bf' : rand() > 0.3 ? '#22d3ee' : '#34d399',
    }));
  })();
  const bubbles = (() => {
    const rand = seededRand(89);
    return Array.from({ length: 18 }, () => ({
      x: rand() * 100,
      size: 2 + rand() * 7,
      dur: 5 + rand() * 10,
      delay: rand() * 14,
      drift: (rand() - 0.5) * 30,
    }));
  })();
  const marineSnow = (() => {
    const rand = seededRand(189);
    return Array.from({ length: 24 }, () => ({
      x: rand() * 100,
      size: 0.8 + rand() * 2,
      dur: 14 + rand() * 22,
      delay: rand() * 18,
      drift: (rand() - 0.5) * 25,
    }));
  })();
  const causticLines = (() => {
    const rand = seededRand(289);
    return Array.from({ length: 10 }, (_, i) => ({
      top: 2 + i * 9 + rand() * 4,
      dur: 3.5 + rand() * 4,
      delay: rand() * 5,
      opacity: 0.25 + rand() * 0.3,
    }));
  })();
  // Jellyfish: 3 instances
  const jellies = (() => {
    const rand = seededRand(389);
    return [
      { x: 15 + rand() * 10, y: 30 + rand() * 20, size: 28 + rand() * 16, dur: 7 + rand() * 5, delay: 0 },
      { x: 55 + rand() * 10, y: 20 + rand() * 25, size: 22 + rand() * 14, dur: 8 + rand() * 5, delay: 3 },
      { x: 78 + rand() * 10, y: 40 + rand() * 20, size: 18 + rand() * 12, dur: 6 + rand() * 5, delay: 5 },
    ];
  })();
  // Sonar pings
  const sonars = [
    { x: 30, y: 70, dur: 8, delay: 0 },
    { x: 72, y: 80, dur: 11, delay: 4 },
  ];
  return (
    <Shell>
      {/* Depth gradient */}
      <div class="absolute inset-0"
        style={{ background: 'linear-gradient(180deg, rgba(45,212,191,0.15) 0%, rgba(34,211,238,0.25) 35%, rgba(20,150,140,0.35) 65%, rgba(10,80,80,0.45) 100%)' }} />
      {/* Surface caustic ripples */}
      <div class="absolute top-0 left-0 right-0 h-[12%]"
        style={{ background: 'repeating-linear-gradient(80deg, transparent, transparent 18px, rgba(45,212,191,0.2) 18px, rgba(45,212,191,0.2) 19px), repeating-linear-gradient(-80deg, transparent, transparent 22px, rgba(34,211,238,0.15) 22px, rgba(34,211,238,0.15) 23px)',
          filter: 'blur(1px)', animation: 'ab-surface 4s ease-in-out infinite' }} />
      {/* Caustic light lines */}
      {causticLines.map((c, i) => (
        <div class="absolute left-[-5%] right-[-5%]"
          style={{ top: `${c.top}%`, height: '2px',
            background: `linear-gradient(90deg, transparent 3%, rgba(45,212,191,${c.opacity * 0.6}) 15%, rgba(45,212,191,${c.opacity}) 40%, rgba(34,211,238,${c.opacity * 1.2}) 50%, rgba(45,212,191,${c.opacity}) 60%, rgba(45,212,191,${c.opacity * 0.6}) 85%, transparent 97%)`,
            filter: 'blur(1.5px)',
            animation: `ab-caustic ${c.dur}s ease-in-out ${c.delay}s infinite` }} />
      ))}
      {/* Bioluminescent orbs */}
      {orbs.map((o, i) => (
        <div class="absolute" style={{ left: `${o.x}%`, top: `${o.y}%`, opacity: 0, animation: `ab-glow ${o.dur}s ease-in-out ${o.delay}s infinite` }}>
          {/* Outer diffuse */}
          <div class="absolute rounded-full"
            style={{ top: `-${o.size * 0.8}px`, left: `-${o.size * 0.8}px`,
              width: `${o.size * 3.6}px`, height: `${o.size * 3.6}px`,
              background: `radial-gradient(circle, ${o.color}60, transparent 60%)`,
              filter: 'blur(4px)' }} />
          {/* Inner bright core */}
          <div class="absolute rounded-full"
            style={{ width: `${o.size}px`, height: `${o.size}px`,
              background: o.color,
              'box-shadow': `0 0 ${o.size * 3}px ${o.color}, 0 0 ${o.size * 6}px ${o.color}80` }} />
        </div>
      ))}
      {/* Rising bubbles */}
      {bubbles.map((b, i) => (
        <div class="absolute rounded-full opacity-0"
          style={{ left: `${b.x}%`, bottom: '-4%',
            width: `${b.size}px`, height: `${b.size}px`,
            border: `1px solid rgba(45,212,191,${0.4 + (i % 3) * 0.2})`,
            background: `radial-gradient(circle at 30% 30%, rgba(45,212,191,0.3), transparent 60%)`,
            ['--ab-drift' as string]: `${b.drift}px`,
            animation: `ab-bubble ${b.dur}s ease-out ${b.delay}s infinite` }} />
      ))}
      {/* Marine snow */}
      {marineSnow.map((m, i) => (
        <div class="absolute rounded-full opacity-0"
          style={{ left: `${m.x}%`, top: '-2%',
            width: `${m.size}px`, height: `${m.size}px`,
            background: `rgba(200,240,240,${0.5 + (i % 4) * 0.2})`,
            ['--ab-snow-drift' as string]: `${m.drift}px`,
            animation: `ab-snow ${m.dur}s linear ${m.delay}s infinite` }} />
      ))}
      {/* Jellyfish */}
      {jellies.map((j, i) => (
        <div class="absolute"
          style={{ left: `${j.x}%`, top: `${j.y}%`, width: `${j.size * 2}px`, height: `${j.size * 2.5}px`,
            animation: `ab-jelly ${j.dur}s ease-in-out ${j.delay}s infinite`, opacity: 0.6 }}>
          <svg viewBox="0 0 60 80" class="w-full h-full">
            <defs>
              <radialGradient id={`jf-grad-${i}`} cx="50%" cy="40%">
                <stop offset="0%" stop-color="#2dd4bf" stop-opacity="0.8" />
                <stop offset="60%" stop-color="#22d3ee" stop-opacity="0.5" />
                <stop offset="100%" stop-color="#2dd4bf" stop-opacity="0" />
              </radialGradient>
            </defs>
            {/* Dome */}
            <ellipse cx="30" cy="28" rx="24" ry="20" fill={`url(#jf-grad-${i})`} stroke="rgba(45,212,191,0.8)" stroke-width="1.2" />
            {/* Inner highlight */}
            <ellipse cx="30" cy="26" rx="16" ry="12" fill="rgba(45,212,191,0.3)" />
            {/* Tentacles */}
            <path d="M18,46 Q14,56 17,66 Q19,72 16,78" fill="none" stroke="rgba(45,212,191,0.6)" stroke-width="1.5">
              <Anim attributeName="d" values="M18,46 Q14,56 17,66 Q19,72 16,78;M18,46 Q22,56 19,66 Q17,72 20,78;M18,46 Q14,56 17,66 Q19,72 16,78" dur="3s" repeatCount="indefinite" />
            </path>
            <path d="M24,47 Q22,57 25,67 Q27,73 24,78" fill="none" stroke="rgba(45,212,191,0.5)" stroke-width="1.5">
              <Anim attributeName="d" values="M24,47 Q22,57 25,67 Q27,73 24,78;M24,47 Q26,57 23,67 Q21,73 26,78;M24,47 Q22,57 25,67 Q27,73 24,78" dur="3.5s" repeatCount="indefinite" />
            </path>
            <path d="M36,47 Q38,57 35,67 Q33,73 36,78" fill="none" stroke="rgba(45,212,191,0.5)" stroke-width="1.5">
              <Anim attributeName="d" values="M36,47 Q38,57 35,67 Q33,73 36,78;M36,47 Q34,57 37,67 Q39,73 34,78;M36,47 Q38,57 35,67 Q33,73 36,78" dur="2.8s" repeatCount="indefinite" />
            </path>
            <path d="M42,46 Q46,56 43,66 Q41,72 44,78" fill="none" stroke="rgba(45,212,191,0.6)" stroke-width="1.5">
              <Anim attributeName="d" values="M42,46 Q46,56 43,66 Q41,72 44,78;M42,46 Q38,56 41,66 Q43,72 40,78;M42,46 Q46,56 43,66 Q41,72 44,78" dur="3.2s" repeatCount="indefinite" />
            </path>
          </svg>
        </div>
      ))}
      {/* SVG: kelp/seaweed + sonar pings */}
      <svg class="absolute inset-0 w-full h-full">
        {/* Kelp silhouettes */}
        {[5, 18, 35, 62, 82].map((kx, i) => (
          <g style={{ animation: `ab-sway ${4 + i * 0.8}s ease-in-out ${i * 0.6}s infinite`, 'transform-origin': `${kx}% 100%` }}>
            <path d={`M${kx * 10},1000 Q${kx * 10 - 15},${950 - i * 30} ${kx * 10 + 10},${900 - i * 25} Q${kx * 10 - 8},${850 - i * 20} ${kx * 10 + 5},${800 - i * 35}`}
              fill="none" stroke={`rgba(20,120,100,${0.6 + i * 0.1})`} stroke-width={3 + (i % 2)} />
          </g>
        ))}
        {/* Sonar pings */}
        {sonars.map((s, i) => (
          <g>
            <circle cx={`${s.x}%`} cy={`${s.y}%`} r="0"
              fill="none" stroke="rgba(45,212,191,0.5)" stroke-width="2">
              <Anim attributeName="r" from="0" to="80" dur={`${s.dur}s`} begin={`${s.delay}s`} repeatCount="indefinite" />
              <Anim attributeName="opacity" from="0.8" to="0" dur={`${s.dur}s`} begin={`${s.delay}s`} repeatCount="indefinite" />
            </circle>
            <circle cx={`${s.x}%`} cy={`${s.y}%`} r="0"
              fill="none" stroke="rgba(34,211,238,0.4)" stroke-width="1.5">
              <Anim attributeName="r" from="0" to="80" dur={`${s.dur}s`} begin={`${s.delay + s.dur * 0.33}s`} repeatCount="indefinite" />
              <Anim attributeName="opacity" from="0.6" to="0" dur={`${s.dur}s`} begin={`${s.delay + s.dur * 0.33}s`} repeatCount="indefinite" />
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
  const sparksSmall = (() => {
    const rand = seededRand(661);
    return Array.from({ length: 28 }, () => ({
      x: rand() * 100,
      size: 2 + rand() * 3,
      dur: 1.2 + rand() * 1.8,
      delay: rand() * 9,
      drift: (rand() - 0.5) * 80,
    }));
  })();
  const sparksMed = (() => {
    const rand = seededRand(662);
    return Array.from({ length: 20 }, () => ({
      x: rand() * 100,
      size: 4 + rand() * 4,
      dur: 2 + rand() * 2.5,
      delay: rand() * 10,
      drift: (rand() - 0.5) * 100,
      color: rand() > 0.5 ? '#fbbf24' : '#f97316',
    }));
  })();
  const sparksLarge = (() => {
    const rand = seededRand(663);
    return Array.from({ length: 14 }, () => ({
      x: rand() * 100,
      size: 6 + rand() * 4,
      dur: 3 + rand() * 4,
      delay: rand() * 12,
      drift: (rand() - 0.5) * 120,
    }));
  })();
  const debris = (() => {
    const rand = seededRand(664);
    return Array.from({ length: 15 }, () => ({
      x: rand() * 100,
      size: 4 + rand() * 6,
      dur: 4 + rand() * 5,
      delay: rand() * 14,
      rot: rand() * 360,
    }));
  })();
  const vortex = (() => {
    const rand = seededRand(665);
    return Array.from({ length: 24 }, (_, i) => ({
      angle: (i / 24) * 360,
      r: 40 + rand() * 35,
      size: 3 + rand() * 5,
      dur: 3 + rand() * 3,
      delay: rand() * 4,
      color: rand() > 0.5 ? '#fbbf24' : rand() > 0.3 ? '#f97316' : '#ef4444',
    }));
  })();
  const smoke = (() => {
    const rand = seededRand(666);
    return Array.from({ length: 8 }, () => ({
      x: 10 + rand() * 80,
      dur: 18 + rand() * 12,
      delay: rand() * 10,
      w: 100 + rand() * 120,
    }));
  })();
  return (
    <Shell>
      {/* Intense volcanic glow layers */}
      <div class="absolute bottom-0 left-0 right-0 h-[70%]"
        style={{ background: 'linear-gradient(to top, rgba(249,115,22,0.65), rgba(239,68,68,0.4) 40%, rgba(251,191,36,0.15) 70%, transparent)', animation: 'em-heat 3.5s ease-in-out infinite' }} />
      <div class="absolute bottom-0 left-[5%] right-[5%] h-[60%]"
        style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(251,191,36,0.55), rgba(249,115,22,0.3) 50%, transparent 70%)', animation: 'em-heat 5s ease-in-out 1s infinite' }} />
      <div class="absolute bottom-0 left-[15%] right-[15%] h-[50%]"
        style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(239,68,68,0.45), rgba(220,38,127,0.25) 60%, transparent)', animation: 'em-heat 4s ease-in-out 2s infinite' }} />
      <div class="absolute bottom-0 left-[25%] right-[25%] h-[40%]"
        style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(255,220,80,0.6), transparent 65%)', animation: 'em-heat 4.5s ease-in-out 0.5s infinite' }} />
      <div class="absolute bottom-0 left-[35%] right-[35%] h-[30%]"
        style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(255,255,120,0.7), transparent 70%)', animation: 'em-heat 3s ease-in-out 1.8s infinite' }} />
      {/* Bright lava vein rivers */}
      {[6, 14, 22, 33, 44, 54, 63, 72, 82, 91].map((x, i) => (
        <div class="absolute bottom-0"
          style={{ left: `${x}%`, width: `${4 + (i % 3) * 2}px`, height: `${25 + (i % 5) * 10}%`,
            background: `linear-gradient(to top, rgba(${i % 2 === 0 ? '251,191,36' : '249,115,22'},0.9), rgba(239,68,68,0.6) 60%, rgba(220,38,127,0.3) 80%, transparent)`,
            filter: 'blur(1px)',
            'box-shadow': `0 0 8px rgba(249,115,22,0.6), 0 0 16px rgba(251,191,36,0.3)`,
            animation: `em-vein ${3 + i * 0.9}s ease-in-out ${i * 0.55}s infinite` }} />
      ))}
      {/* Flowing lava streams */}
      {[78, 83, 87, 91, 95].map((y, i) => (
        <div class="absolute left-0 right-0"
          style={{ bottom: `${100 - y}%`, height: `${3 + i * 2}px`,
            background: `linear-gradient(90deg, transparent 5%, rgba(249,115,22,0.5) 20%, rgba(251,191,36,0.8) 50%, rgba(249,115,22,0.5) 80%, transparent 95%)`,
            animation: `em-flow ${5 + i * 1.8}s ease-in-out ${i * 1.5}s infinite` }} />
      ))}
      {/* Glowing magma pools */}
      {[20, 50, 78].map((x, i) => (
        <div class="absolute bottom-0"
          style={{ left: `${x - 12}%`, width: '24%', height: '10%',
            background: `radial-gradient(ellipse, rgba(${i % 2 === 0 ? '255,220,80' : '251,191,36'},0.8), rgba(249,115,22,0.5) 40%, rgba(239,68,68,0.3) 70%, transparent)`,
            'border-radius': '50%', filter: 'blur(2px)',
            'box-shadow': `0 0 30px rgba(251,191,36,0.6), 0 0 60px rgba(249,115,22,0.3)`,
            animation: `em-pool ${2.5 + i * 1.2}s ease-in-out ${i * 0.8}s infinite` }} />
      ))}
      {/* Visible heat shimmer */}
      <div class="absolute bottom-0 left-0 right-0 h-[45%]"
        style={{ background: 'linear-gradient(to top, rgba(255,200,100,0.25), rgba(255,160,50,0.15) 50%, transparent)', filter: 'blur(3px)', animation: 'em-shimmer 1.8s ease-in-out infinite' }} />
      {/* Dense smoke columns */}
      {smoke.map((s, i) => (
        <div class="absolute bottom-[3%]"
          style={{ left: `${s.x}%`, width: `${s.w}px`, height: '75%',
            background: 'linear-gradient(to top, rgba(80,50,50,0.7), rgba(60,40,40,0.5) 30%, rgba(40,30,30,0.3) 60%, rgba(20,15,15,0.15) 80%, transparent)',
            filter: 'blur(12px)', animation: `em-smoke ${s.dur}s ease-in-out ${s.delay}s infinite` }} />
      ))}
      {/* Flying rock debris */}
      {debris.map((d, i) => (
        <div class="absolute"
          style={{ left: `${d.x}%`, bottom: '0', width: `${d.size}px`, height: `${d.size * 0.8}px`,
            background: 'rgba(80,40,15,0.8)', 'border-radius': '3px', opacity: 0,
            transform: `rotate(${d.rot}deg)`,
            'box-shadow': '0 0 4px rgba(80,40,15,0.4)',
            animation: `em-debris ${d.dur}s ease-out ${d.delay}s infinite` }} />
      ))}
      {/* Ember vortex swirl */}
      <div class="absolute" style={{ left: '50%', bottom: '18%', width: '0', height: '0' }}>
        {vortex.map((v, i) => {
          const rad = (v.angle * Math.PI) / 180;
          const px = Math.cos(rad) * v.r;
          const py = Math.sin(rad) * v.r;
          return (
            <div class="absolute rounded-full"
              style={{ left: `${px}px`, top: `${py}px`, width: `${v.size}px`, height: `${v.size}px`,
                background: v.color, opacity: 0,
                'box-shadow': `0 0 ${v.size * 5}px ${v.color}`,
                animation: `em-vortex ${v.dur}s ease-in-out ${v.delay}s infinite` }} />
          );
        })}
      </div>
      {/* Bright rising sparks */}
      {sparksSmall.map((s, i) => (
        <div class="absolute rounded-full"
          style={{ left: `${s.x}%`, bottom: '0', width: `${s.size}px`, height: `${s.size}px`,
            background: '#fde68a', opacity: 0,
            'box-shadow': '0 0 10px #fbbf24, 0 0 20px rgba(251,191,36,0.4)',
            animation: `em-sparkS ${s.dur}s ease-out ${s.delay}s infinite`,
            ['--dr' as string]: `${s.drift}px` }} />
      ))}
      {/* Medium ember particles */}
      {sparksMed.map((s, i) => (
        <div class="absolute rounded-full"
          style={{ left: `${s.x}%`, bottom: '0', width: `${s.size}px`, height: `${s.size}px`,
            background: s.color, opacity: 0,
            'box-shadow': `0 0 ${s.size * 4}px ${s.color}, 0 0 ${s.size * 8}px rgba(249,115,22,0.3)`,
            animation: `em-sparkM ${s.dur}s ease-out ${s.delay}s infinite`,
            ['--dr' as string]: `${s.drift}px` }} />
      ))}
      {/* Large glowing cinders */}
      {sparksLarge.map((s, i) => (
        <div class="absolute rounded-full"
          style={{ left: `${s.x}%`, bottom: '0', width: `${s.size}px`, height: `${s.size}px`,
            background: '#ef4444', opacity: 0,
            'box-shadow': `0 0 ${s.size * 6}px rgba(239,68,68,0.8), 0 0 ${s.size * 12}px rgba(220,38,127,0.4)`,
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
  const stars = (() => {
    const rand = seededRand(771);
    return Array.from({ length: 60 }, () => ({
      x: rand() * 100, y: rand() * 70,
      size: 0.8 + rand() * 2,
      opacity: 0.3 + rand() * 0.7,
    }));
  })();
  const particles = (() => {
    const rand = seededRand(772);
    return Array.from({ length: 20 }, () => ({
      x: rand() * 100, y: rand() * 60,
      size: 2 + rand() * 4,
      color: rand() > 0.4 ? '#a78bfa' : rand() > 0.2 ? '#34d399' : '#22d3ee',
    }));
  })();
  const crackles = (() => {
    const rand = seededRand(773);
    return Array.from({ length: 6 }, () => ({
      x1: 10 + rand() * 80, y1: 5 + rand() * 30,
      x2: 10 + rand() * 80, y2: 10 + rand() * 40,
      dur: 8 + rand() * 8,
      delay: rand() * 12,
    }));
  })();
  const cols = (() => {
    const rand = seededRand(774);
    const palette = ['#a78bfa', '#34d399', '#22d3ee', '#c084fc', '#818cf8', '#6ee7b7', '#e879f9', '#06b6d4', '#8b5cf6', '#10b981', '#7c3aed', '#0ea5e9', '#a855f7', '#14b8a6'];
    return Array.from({ length: 20 }, (_, i) => ({
      left: i * 5,
      color: palette[i % palette.length],
      dur: 4 + rand() * 5,
      delay: rand() * 4,
      h: 50 + rand() * 30,
    }));
  })();
  return (
    <Shell>
      {/* Deep space background */}
      <div class="absolute top-0 left-0 right-0 h-[50%]"
        style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(100,60,180,0.25), rgba(50,30,100,0.15) 50%, transparent 80%)', filter: 'blur(6px)' }} />
      {/* Bright star field — static dots, shimmered a layer at a time. */}
      {shimmerLayers(
        stars.map((s, i) => ({
          ...s,
          fill: i % 4 === 0 ? '#c4b5fd' : i % 3 === 0 ? '#a78bfa' : '#e2e8f0',
          glow: i % 4 === 0 ? '#c4b5fd' : '#e2e8f0',
        })),
        6,
      ).map((layer, g) => (
        <div class="absolute inset-0" style={{ animation: shimmerAnim('au-shimmer', g) }}>
          {layer.map((s) => (
            <div class="absolute rounded-full"
              style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.size}px`, height: `${s.size}px`,
                background: s.fill, opacity: s.opacity, 'box-shadow': `0 0 4px ${s.glow}` }} />
          ))}
        </div>
      ))}
      {/* Aurora curtain bands */}
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
        <div class="absolute left-0 right-0"
          style={{ top: c.top, height: c.h,
            background: `linear-gradient(180deg, ${c.c1}80 0%, ${c.c1}60 20%, ${c.c2}50 40%, ${c.c2}30 60%, transparent 100%)`,
            animation: `au-curtain ${c.dur} ease-in-out ${c.delay} infinite`,
            filter: `blur(${c.blur}px)` }} />
      ))}
      {/* Vertical light pillars */}
      {cols.map((col, i) => (
        <div class="absolute top-0"
          style={{ left: `${col.left}%`, width: '6%', height: `${col.h}%`,
            background: `linear-gradient(180deg, ${col.color}60, ${col.color}40 30%, ${col.color}20 60%, transparent)`,
            animation: `au-col ${col.dur}s ease-in-out ${col.delay}s infinite`,
            filter: 'blur(8px)' }} />
      ))}
      {/* Aurora reflection on ground */}
      <div class="absolute left-0 right-0" style={{ bottom: '0%', height: '25%' }}>
        <div class="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, rgba(167,139,250,0.3), rgba(52,211,153,0.2) 30%, rgba(34,211,238,0.15) 60%, transparent)',
            filter: 'blur(4px)', animation: 'au-reflect 12s ease-in-out infinite' }} />
      </div>
      {/* Floating aurora particles — grouped: one au-spark wrapper drifts+fades a
          whole static layer instead of one animation per mote. */}
      {shimmerLayers(particles, 4).map((layer, g) => (
        <div class="absolute inset-0"
          style={{ animation: `au-spark ${(3.5 + g * 0.9).toFixed(2)}s ease-in-out ${(-g * 0.8).toFixed(2)}s infinite` }}>
          {layer.map((p) => (
            <div class="absolute rounded-full"
              style={{ left: `${p.x}%`, top: `${p.y}%`, width: `${p.size}px`, height: `${p.size}px`,
                background: p.color, opacity: 0.75,
                'box-shadow': `0 0 ${p.size * 8}px ${p.color}` }} />
          ))}
        </div>
      ))}
      {/* Electric aurora crackles */}
      <svg class="absolute inset-0 w-full h-full" style={{ 'pointer-events': 'none' }}>
        {crackles.map((cr, i) => (
          <line x1={`${cr.x1}%`} y1={`${cr.y1}%`} x2={`${cr.x2}%`} y2={`${cr.y2}%`}
            stroke="rgba(220,200,255,0.8)" stroke-width="1.5" stroke-linecap="round"
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
        @keyframes au-shimmer { 0%,100%{opacity:1} 50%{opacity:0.35} }
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
  const orbs = (() => {
    const rand = seededRand(331);
    const palette = ['#cba6f7', '#f5c2e7', '#89b4fa', '#a6e3a1', '#fab387', '#f38ba8', '#94e2d5', '#b4befe'];
    return Array.from({ length: 22 }, (_, i) => ({
      x: rand() * 100, y: rand() * 100,
      size: 80 + rand() * 350,
      dur: 12 + rand() * 22,
      delay: rand() * 14,
      color: palette[i % palette.length],
    }));
  })();
  const blobs = (() => {
    const rand = seededRand(332);
    const palette = ['#cba6f7', '#f5c2e7', '#89b4fa', '#a6e3a1', '#fab387'];
    return Array.from({ length: 7 }, (_, i) => ({
      x: 5 + rand() * 85, y: 5 + rand() * 85,
      w: 150 + rand() * 200, h: 130 + rand() * 180,
      dur: 18 + rand() * 14,
      delay: rand() * 10,
      color: palette[i % palette.length],
    }));
  })();
  const sparkles = (() => {
    const rand = seededRand(333);
    return Array.from({ length: 20 }, () => ({
      x: rand() * 100, y: rand() * 100,
      dur: 3 + rand() * 5,
      delay: rand() * 9,
      colorIdx: Math.floor(rand() * 4),
    }));
  })();
  const confetti = (() => {
    const rand = seededRand(334);
    const palette = ['#cba6f7', '#f5c2e7', '#89b4fa', '#a6e3a1', '#fab387', '#f38ba8'];
    return Array.from({ length: 14 }, () => ({
      x: rand() * 100,
      size: 6 + rand() * 8,
      dur: 10 + rand() * 14,
      delay: rand() * 15,
      color: palette[Math.floor(rand() * palette.length)],
      shape: rand() > 0.6 ? 'circle' : rand() > 0.3 ? 'triangle' : 'diamond',
    }));
  })();
  const candy = (() => {
    const rand = seededRand(335);
    const palette = ['#cba6f7', '#f38ba8', '#89b4fa', '#a6e3a1', '#fab387', '#f5c2e7'];
    return Array.from({ length: 30 }, (_, i) => ({
      x: rand() * 100, y: rand() * 100,
      dur: 2 + rand() * 3,
      delay: (i / 30) * 8 + rand() * 2,
      color: palette[i % palette.length],
    }));
  })();
  const meshGrads = (() => {
    const rand = seededRand(336);
    return Array.from({ length: 5 }, () => ({
      x: 5 + rand() * 80, y: 5 + rand() * 80,
      size: 400 + rand() * 400,
      color: ['#cba6f7', '#89b4fa', '#a6e3a1', '#f5c2e7', '#fab387'][Math.floor(rand() * 5)],
      dur: 20 + rand() * 15,
      delay: rand() * 10,
    }));
  })();
  const sparkColors = ['#cba6f7', '#f5c2e7', '#89b4fa', '#a6e3a1'];
  return (
    <Shell>
      {/* Large gradient mesh background */}
      {meshGrads.map((m, i) => (
        <div class="absolute rounded-full"
          style={{ left: `${m.x}%`, top: `${m.y}%`, width: `${m.size}px`, height: `${m.size}px`,
            background: `radial-gradient(circle, ${m.color}40, ${m.color}20 40%, transparent 70%)`,
            filter: 'blur(50px)', animation: `cp-mesh ${m.dur}s ease-in-out ${m.delay}s infinite` }} />
      ))}
      {/* Colorful gradient orbs */}
      {orbs.map((b, i) => (
        <div class="absolute rounded-full"
          style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.size}px`, height: `${b.size}px`,
            background: `radial-gradient(circle, ${b.color}50, ${b.color}30 40%, transparent 65%)`,
            animation: `cp-float ${b.dur}s ease-in-out ${b.delay}s infinite`,
            filter: 'blur(4px)' }} />
      ))}
      {/* Lava lamp blobs */}
      {blobs.map((bl, i) => (
        <div class="absolute"
          style={{ left: `${bl.x}%`, top: `${bl.y}%`, width: `${bl.w}px`, height: `${bl.h}px`,
            background: `radial-gradient(ellipse, ${bl.color}60, ${bl.color}40 50%, ${bl.color}20 70%, transparent 85%)`,
            animation: `cp-blob${i + 1} ${bl.dur}s ease-in-out ${bl.delay}s infinite`,
            filter: 'blur(15px)' }} />
      ))}
      {/* Bright rainbow wave band */}
      <div class="absolute left-0 right-0 h-[6px]"
        style={{ top: '45%',
          background: 'linear-gradient(90deg, #cba6f7, #f5c2e7, #fab387, #a6e3a1, #89b4fa, #b4befe, #f38ba8, #94e2d5, #cba6f7)',
          'background-size': '200% 100%',
          opacity: 0.4, filter: 'blur(2px)', animation: 'cp-rainbow 25s linear infinite' }} />
      <div class="absolute left-0 right-0 h-[3px]"
        style={{ top: '55%',
          background: 'linear-gradient(90deg, #89b4fa, #a6e3a1, #cba6f7, #f5c2e7, #fab387, #f38ba8, #89b4fa)',
          'background-size': '250% 100%',
          opacity: 0.3, filter: 'blur(1px)', animation: 'cp-rainbow 18s linear infinite reverse' }} />
      {/* Bright sparkle crosses */}
      {sparkles.map((s, i) => (
        <div class="absolute"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: '12px', height: '12px', opacity: 0,
            animation: `cp-sparkle ${s.dur}s ease-in-out ${s.delay}s infinite` }}>
          <div class="absolute left-[4px] top-0 w-[4px] h-[12px] rounded-full"
            style={{ background: sparkColors[s.colorIdx], 'box-shadow': `0 0 6px ${sparkColors[s.colorIdx]}` }} />
          <div class="absolute left-0 top-[4px] w-[12px] h-[4px] rounded-full"
            style={{ background: sparkColors[s.colorIdx], 'box-shadow': `0 0 6px ${sparkColors[s.colorIdx]}` }} />
        </div>
      ))}
      {/* Colorful confetti geometric shapes */}
      {confetti.map((c, i) => (
        <div class="absolute opacity-0"
          style={{ left: `${c.x}%`, top: '-6%', width: `${c.size}px`, height: `${c.size}px`,
            background: c.color,
            'border-radius': c.shape === 'circle' ? '50%' : '0',
            'clip-path': c.shape === 'triangle' ? 'polygon(50% 0%,100% 100%,0% 100%)' : c.shape === 'diamond' ? 'polygon(50% 0%,100% 50%,50% 100%,0% 50%)' : 'none',
            'box-shadow': `0 0 8px ${c.color}`,
            animation: `cp-confetti ${c.dur}s ease-in-out ${c.delay}s infinite` }} />
      ))}
      {/* Bright candy dots */}
      {candy.map((cd, i) => (
        <div class="absolute rounded-full"
          style={{ left: `${cd.x}%`, top: `${cd.y}%`, width: '6px', height: '6px',
            background: cd.color, opacity: 0,
            'box-shadow': `0 0 12px ${cd.color}`,
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
const WINDOW_COLORS = ['#7aa2f7', '#ff9e64', '#9ece6a', '#bb9af7', '#7dcfff', '#e0af68', '#f7768e'];

function TokyoNightBg() {
  const buildings = (() => {
    const rand = seededRand(779);
    return Array.from({ length: 20 }, (_, i) => ({
      x: i * 5 + rand() * 3,
      w: 2.5 + rand() * 5,
      h: 15 + rand() * 50,
      windows: Math.floor(4 + rand() * 10),
      spire: rand() > 0.5,
      spireH: 6 + rand() * 15,
    }));
  })();
  const rain = (() => {
    const rand = seededRand(780);
    return Array.from({ length: 40 }, () => ({
      x: rand() * 110,
      dur: 0.4 + rand() * 0.8,
      delay: rand() * 3,
      h: 18 + rand() * 35,
      angle: 8 + rand() * 15,
    }));
  })();
  const puddles = (() => {
    const rand = seededRand(781);
    return Array.from({ length: 15 }, () => ({
      x: rand() * 85, w: 40 + rand() * 80,
      dur: 2 + rand() * 2, delay: rand() * 4,
      color: ['#7aa2f7', '#bb9af7', '#ff9e64', '#9ece6a'][Math.floor(rand() * 4)],
    }));
  })();
  const cars = (() => {
    const rand = seededRand(782);
    return Array.from({ length: 10 }, (_, i) => ({
      dir: i < 5 ? 'ltr' : 'rtl',
      speed: 4 + rand() * 8,
      delay: rand() * 15,
      color: ['#ff9e64', '#7aa2f7', '#9ece6a', '#e0af68', '#bb9af7', '#7dcfff', '#f7768e', '#73daca', '#2ac3de', '#e0af68'][i],
      y: 0.1 + rand() * 1.2,
    }));
  })();
  const clouds = (() => {
    const rand = seededRand(783);
    return Array.from({ length: 5 }, () => ({
      y: 2 + rand() * 15, w: 100 + rand() * 150, h: 40 + rand() * 50,
      dur: 35 + rand() * 25, delay: rand() * 20,
    }));
  })();
  const neons = (() => {
    const rand = seededRand(784);
    return [
      { x: 15, y: 25, color: '#ff9e64', dur: 3, delay: 0 },
      { x: 35, y: 20, color: '#bb9af7', dur: 4, delay: 1.5 },
      { x: 55, y: 30, color: '#7dcfff', dur: 2.5, delay: 0.8 },
      { x: 75, y: 22, color: '#9ece6a', dur: 5, delay: 2.5 },
      { x: 25, y: 35, color: '#f7768e', dur: 3.5, delay: 3 },
      { x: 65, y: 18, color: '#e0af68', dur: 4.5, delay: 1 },
    ].map(n => ({ ...n, w: 100 + rand() * 120, h: 30 + rand() * 25 }));
  })();
  return (
    <Shell>
      {/* Dark cyberpunk sky */}
      <div class="absolute top-0 left-0 right-0 h-[70%]"
        style={{ background: 'linear-gradient(180deg, rgba(25,15,45,0.8), rgba(122,162,247,0.25) 60%, rgba(187,154,247,0.15) 80%, transparent)' }} />
      {/* City glow horizon */}
      <div class="absolute left-0 right-0" style={{ bottom: '25%', height: '20%' }}>
        <div style={{ position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, transparent, rgba(122,162,247,0.3) 30%, rgba(187,154,247,0.2) 60%, rgba(255,158,100,0.1) 80%, transparent)',
          filter: 'blur(6px)' }} />
      </div>
      {/* Dense moving clouds */}
      {clouds.map((cl, i) => (
        <div class="absolute"
          style={{ top: `${cl.y}%`, left: '-20%', width: `${cl.w}px`, height: `${cl.h}px`,
            background: 'radial-gradient(ellipse, rgba(60,55,90,0.6), rgba(40,35,70,0.3) 60%, transparent)',
            filter: 'blur(12px)', 'border-radius': '50%',
            animation: `tn-cloud ${cl.dur}s linear ${cl.delay}s infinite` }} />
      ))}
      {/* Atmospheric fog layers */}
      <div class="absolute left-0 right-0" style={{ bottom: '30%', height: '20%',
        background: 'linear-gradient(180deg, transparent, rgba(80,70,120,0.4) 40%, rgba(60,50,100,0.3) 70%, transparent)',
        filter: 'blur(10px)' }} />
      <div class="absolute left-0 right-0" style={{ bottom: '20%', height: '15%',
        background: 'linear-gradient(180deg, transparent, rgba(100,90,140,0.3) 50%, transparent)',
        filter: 'blur(8px)' }} />
      {/* Neon sign glows */}
      {neons.map((n, i) => (
        <div class="absolute rounded-full"
          style={{ left: `${n.x}%`, top: `${n.y}%`, width: `${n.w}px`, height: `${n.h}px`,
            background: `radial-gradient(ellipse, ${n.color}60, ${n.color}30 50%, transparent 80%)`,
            filter: 'blur(8px)',
            'box-shadow': `0 0 20px ${n.color}80, 0 0 40px ${n.color}40`,
            animation: `tn-neon${i + 1} ${n.dur}s ease-in-out ${n.delay}s infinite` }} />
      ))}
      {/* Dark street ground */}
      <div class="absolute bottom-0 left-0 right-0 h-[15%]"
        style={{ background: 'linear-gradient(180deg, rgba(25,25,40,0.9), rgba(15,15,25,0.95))' }} />
      {/* Building silhouettes */}
      {buildings.map((b, i) => (
        <div class="absolute bottom-[15%]"
          style={{ left: `${b.x}%`, width: `${b.w}%`, height: `${b.h}%`,
            background: 'rgba(20,20,35,0.95)',
            'border-top': '2px solid rgba(80,90,140,0.6)',
            'box-shadow': 'inset 0 1px 0 rgba(80,90,140,0.3)' }}>
          {b.spire && (
            <div style={{ position: 'absolute', left: '45%', top: `-${b.spireH}px`, width: '3px', height: `${b.spireH}px`,
              background: 'rgba(122,162,247,0.6)',
              'box-shadow': '0 0 6px rgba(122,162,247,0.8)' }} />
          )}
          {/* Windows — static lit panes; each building blinks a few desynced layers
              at a time (one wrapper per layer) instead of one animation per window. */}
          {shimmerLayers(
            Array.from({ length: b.windows }, (_, wi) => ({
              top: 6 + wi * (85 / b.windows),
              color: WINDOW_COLORS[wi % 7]!,
            })),
            Math.min(3, b.windows),
          ).map((layer, g) => (
            <div class="absolute inset-0"
              style={{ animation: `tn-blink ${(1.6 + g * 0.7).toFixed(2)}s ease-in-out ${(i * 0.15 + g * 0.5).toFixed(2)}s infinite` }}>
              {layer.map((w) => (
                <div class="absolute"
                  style={{ left: '12%', right: '12%', height: '5px', top: `${w.top}%`,
                    background: w.color, opacity: 0.85, 'border-radius': '2px',
                    'box-shadow': `0 0 8px ${w.color}` }} />
              ))}
            </div>
          ))}
        </div>
      ))}
      {/* Bright street reflections */}
      <div class="absolute bottom-[15%] left-0 right-0 h-[2px]"
        style={{ background: 'linear-gradient(90deg, rgba(122,162,247,0.4), rgba(187,154,247,0.3), rgba(255,158,100,0.2))', filter: 'blur(1px)' }} />
      {/* Colorful puddle reflections */}
      {puddles.map((p, i) => (
        <div class="absolute bottom-[15%]"
          style={{ left: `${p.x}%`, width: `${p.w}px`, height: '8px',
            background: `linear-gradient(90deg, transparent, ${p.color}50 30%, ${p.color}70 50%, ${p.color}50 70%, transparent)`,
            filter: 'blur(2px)', 'border-radius': '50%',
            animation: `tn-puddle ${p.dur}s ease-in-out ${p.delay}s infinite` }} />
      ))}
      {/* Heavy rain */}
      {rain.map((r, i) => (
        <div class="absolute opacity-0"
          style={{ left: `${r.x}%`, top: '-8%', width: '2px', height: `${r.h}px`,
            background: 'linear-gradient(180deg, transparent, rgba(122,162,247,0.6), rgba(122,162,247,0.4))',
            transform: `rotate(${r.angle}deg)`,
            animation: `tn-rain ${r.dur}s linear ${r.delay}s infinite` }} />
      ))}
      {/* Bright car headlights */}
      {cars.map((car, i) => (
        <div class="absolute rounded-full"
          style={{ bottom: `${15 + car.y * 2}%`, width: '8px', height: '3px',
            background: car.color,
            'box-shadow': `0 0 15px ${car.color}, 0 0 30px ${car.color}80`,
            animation: `tn-car${car.dir === 'ltr' ? 'L' : 'R'} ${car.speed}s linear ${car.delay}s infinite` }} />
      ))}
      {/* Intense lightning flash */}
      <div class="absolute inset-0" style={{ animation: 'tn-lightning 12s ease-in-out infinite' }} />
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
  const fogLayers = (() => {
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
  })();
  const bats = (() => {
    const rand = seededRand(1112);
    return Array.from({ length: 12 }, (_, i) => ({
      size: 18 + rand() * 28,
      top: 8 + rand() * 45,
      dur: 10 + rand() * 12,
      delay: rand() * 20,
      waveAmp: 15 + rand() * 30,
    }));
  })();
  const candles = (() => {
    const rand = seededRand(1113);
    return Array.from({ length: 8 }, () => ({
      x: 10 + rand() * 80, y: 40 + rand() * 40,
      dur: 1.5 + rand() * 1,
      delay: rand() * 3,
    }));
  })();
  const tendrils = (() => {
    const rand = seededRand(1114);
    return Array.from({ length: 6 }, () => ({
      x: 5 + rand() * 85, y: 25 + rand() * 40,
      w: 120 + rand() * 180, h: 30 + rand() * 50,
      dur: 20 + rand() * 15,
      delay: rand() * 15,
    }));
  })();
  const bloodDrops = (() => {
    const rand = seededRand(1115);
    return Array.from({ length: 4 }, () => ({
      x: 15 + rand() * 70,
      dur: 25 + rand() * 15,
      delay: rand() * 12,
    }));
  })();
  return (
    <Shell>
      {/* Deep gothic sky */}
      <div class="absolute top-0 left-0 right-0 h-[60%]"
        style={{ background: 'linear-gradient(180deg, rgba(60,25,80,0.7), rgba(189,147,249,0.3) 50%, rgba(139,92,246,0.15) 80%, transparent)' }} />
      {/* Moon with halo */}
      <div class="absolute" style={{ top: '8%', right: '15%', width: '140px', height: '140px' }}>
        <div class="absolute rounded-full"
          style={{ top: '-30%', left: '-30%', width: '160%', height: '160%',
            border: '2px solid rgba(189,147,249,0.4)', animation: 'dr-moonring 8s ease-in-out infinite' }} />
        <div class="absolute rounded-full"
          style={{ top: '-50%', left: '-50%', width: '200%', height: '200%',
            border: '1px solid rgba(189,147,249,0.2)', animation: 'dr-moonring 12s ease-in-out 2s infinite' }} />
        <div class="absolute inset-0 rounded-full"
          style={{ background: 'radial-gradient(circle at 35% 35%, rgba(240,220,255,0.6), rgba(189,147,249,0.35) 40%, rgba(139,92,246,0.15) 70%, transparent)',
            'box-shadow': '0 0 60px rgba(189,147,249,0.4), 0 0 120px rgba(189,147,249,0.2)',
            animation: 'dr-moon 10s ease-in-out infinite' }} />
        <div class="absolute rounded-full"
          style={{ top: '10%', left: '18%', width: '75%', height: '75%',
            background: 'radial-gradient(circle, rgba(20,10,30,0.8), transparent 65%)' }} />
        <div class="absolute rounded-full"
          style={{ top: '25%', left: '22%', width: '14px', height: '14px',
            background: 'rgba(160,120,220,0.4)', 'box-shadow': 'inset 0 0 6px rgba(0,0,0,0.3)' }} />
        <div class="absolute rounded-full"
          style={{ top: '50%', left: '38%', width: '10px', height: '10px',
            background: 'rgba(150,100,200,0.3)', 'box-shadow': 'inset 0 0 4px rgba(0,0,0,0.25)' }} />
        <div class="absolute rounded-full"
          style={{ top: '35%', left: '55%', width: '8px', height: '8px',
            background: 'rgba(140,90,190,0.25)', 'box-shadow': 'inset 0 0 3px rgba(0,0,0,0.2)' }} />
      </div>
      {/* Blood drip streaks */}
      {bloodDrops.map((bd, i) => (
        <div class="absolute top-0"
          style={{ left: `${bd.x}%`, width: '4px', height: '0%',
            background: 'linear-gradient(to bottom, rgba(220,40,60,0.6), rgba(180,30,40,0.4) 60%, rgba(140,20,30,0.2))',
            animation: `dr-drip ${bd.dur}s ease-in ${bd.delay}s infinite` }} />
      ))}
      {/* Dense fog layers */}
      {fogLayers.map((f, i) => (
        <div class="absolute rounded-full"
          style={{ left: `${f.x}%`, bottom: `${f.bottom}%`,
            width: `${f.w}px`, height: `${f.h}px`,
            background: `radial-gradient(ellipse, rgba(${i % 2 === 0 ? '100,80,160' : '80,65,140'},${0.3 + (f.depth % 4) * 0.05}), rgba(60,50,120,${0.15 + (f.depth % 3) * 0.05}) 50%, transparent 70%)`,
            filter: `blur(${18 + i * 4}px)`,
            animation: `dr-fog ${f.dur}s ease-in-out ${f.delay}s infinite` }} />
      ))}
      {/* Bright lightning flashes */}
      <div class="absolute inset-0" style={{ animation: 'dr-lightning 10s ease-in-out infinite' }} />
      <div class="absolute inset-0" style={{ animation: 'dr-lightning2 10s ease-in-out 0.2s infinite' }} />
      {/* Candle flames */}
      {candles.map((c, i) => (
        <div class="absolute rounded-full"
          style={{ left: `${c.x}%`, top: `${c.y}%`, width: '8px', height: '12px',
            background: 'radial-gradient(ellipse at 50% 75%, rgba(255,200,80,0.9), rgba(255,150,60,0.6) 40%, rgba(255,100,30,0.3) 70%, transparent)',
            'box-shadow': '0 0 15px rgba(255,180,60,0.7), 0 0 30px rgba(255,150,40,0.4)',
            animation: `dr-candle ${c.dur}s ease-in-out ${c.delay}s infinite` }} />
      ))}
      {/* Visible mist tendrils */}
      {tendrils.map((t, i) => (
        <div class="absolute"
          style={{ left: `${t.x}%`, top: `${t.y}%`, width: `${t.w}px`, height: `${t.h}px`,
            background: 'radial-gradient(ellipse, rgba(120,100,180,0.35), rgba(100,80,160,0.2) 50%, transparent 70%)',
            filter: 'blur(8px)', 'border-radius': '50%',
            animation: `dr-tendril ${t.dur}s ease-in-out ${t.delay}s infinite` }} />
      ))}
      {/* Flying bats */}
      {bats.map((bat, i) => (
        <svg class="absolute" viewBox="0 0 30 12"
          style={{ width: `${bat.size}px`, top: `${bat.top}%`, left: '-8%', opacity: 0,
            animation: `dr-bat ${bat.dur}s ease-in-out ${bat.delay}s infinite`,
            ['--wa' as string]: `${bat.waveAmp}px` }}>
          <path d="M15,6 Q10,0 5,3 Q2,1 0,4 Q3,5 5,5 Q8,8 12,7 L15,6 Q17,8 20,7 Q22,8 25,5 Q27,5 30,4 Q28,1 25,3 Q20,0 15,6Z"
            fill="rgba(189,147,249,0.8)" stroke="rgba(139,92,246,0.6)" stroke-width="0.5">
            <Anim attributeName="d"
              values="M15,6 Q10,0 5,3 Q2,1 0,4 Q3,5 5,5 Q8,8 12,7 L15,6 Q17,8 20,7 Q22,8 25,5 Q27,5 30,4 Q28,1 25,3 Q20,0 15,6Z;M15,6 Q10,3 5,5 Q2,4 0,6 Q3,6 5,6 Q8,7 12,6.5 L15,6 Q17,7 20,6.5 Q22,6 25,6 Q27,6 30,6 Q28,4 25,5 Q20,3 15,6Z;M15,6 Q10,0 5,3 Q2,1 0,4 Q3,5 5,5 Q8,8 12,7 L15,6 Q17,8 20,7 Q22,8 25,5 Q27,5 30,4 Q28,1 25,3 Q20,0 15,6Z"
              dur="0.4s" repeatCount="indefinite" />
          </path>
        </svg>
      ))}
      {/* Castle and graveyard silhouettes */}
      <svg class="absolute bottom-0 left-0 w-full" style={{ height: '28%' }} viewBox="0 0 1000 140" preserveAspectRatio="none">
        {Array.from({ length: 25 }, (_, i) => (
          <rect x={i * 40} y={85} width={5} height={55} fill="rgba(25,15,35,0.9)" />
        ))}
        {Array.from({ length: 25 }, (_, i) => (
          <polygon points={`${i * 40},85 ${i * 40 + 2.5},72 ${i * 40 + 5},85`} fill="rgba(25,15,35,0.9)" />
        ))}
        <rect x={100} y={60} width={25} height={35} rx={4} fill="rgba(35,25,50,0.85)" />
        <line x1={112} y1={64} x2={112} y2={78} stroke="rgba(120,100,160,0.6)" stroke-width="2" />
        <line x1={105} y1={71} x2={119} y2={71} stroke="rgba(120,100,160,0.6)" stroke-width="2" />
        <rect x={300} y={55} width={28} height={40} rx={4} fill="rgba(32,22,45,0.85)" />
        <line x1={314} y1={60} x2={314} y2={76} stroke="rgba(120,100,160,0.6)" stroke-width="2" />
        <line x1={306} y1={68} x2={322} y2={68} stroke="rgba(120,100,160,0.6)" stroke-width="2" />
        <rect x={550} y={58} width={22} height={32} rx={3} fill="rgba(30,20,40,0.85)" />
        <line x1={561} y1={62} x2={561} y2={75} stroke="rgba(120,100,160,0.6)" stroke-width="2" />
        <line x1={554} y1={68} x2={568} y2={68} stroke="rgba(120,100,160,0.6)" stroke-width="2" />
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
  const waves = (() => {
    const rand = seededRand(551);
    return Array.from({ length: 12 }, (_, i) => ({
      y: 52 + i * 3.5 + rand() * 2.5,
      dur: 3.5 + rand() * 4,
      delay: rand() * 5,
      opacity: 0.2 + i * 0.06,
    }));
  })();
  const seaSpray = (() => {
    const rand = seededRand(552);
    return Array.from({ length: 20 }, () => ({
      x: 15 + rand() * 70,
      dur: 1.2 + rand() * 1.8,
      delay: rand() * 8,
    }));
  })();
  const windParticles = (() => {
    const rand = seededRand(553);
    return Array.from({ length: 15 }, () => ({
      y: 8 + rand() * 60,
      dur: 6 + rand() * 8,
      delay: rand() * 12,
    }));
  })();
  const birds = (() => {
    const rand = seededRand(554);
    return Array.from({ length: 4 }, () => ({
      y: 12 + rand() * 28,
      scale: 0.8 + rand() * 1,
      dur: 25 + rand() * 18,
      delay: rand() * 20,
    }));
  })();
  const clouds = (() => {
    const rand = seededRand(555);
    return Array.from({ length: 6 }, () => ({
      y: 6 + rand() * 22,
      w: 120 + rand() * 180, h: 35 + rand() * 45,
      dur: 45 + rand() * 35, delay: rand() * 30,
    }));
  })();
  const rayAngles = [0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5, 180, 202.5, 225, 247.5, 270, 292.5, 315, 337.5];
  return (
    <Shell>
      {/* Golden atmosphere */}
      <div class="absolute top-0 left-0 right-0 h-[65%]"
        style={{ background: 'linear-gradient(180deg, rgba(181,137,0,0.4), rgba(203,75,22,0.25) 40%, rgba(38,139,210,0.15) 75%, transparent)' }} />
      {/* Warm horizon glow */}
      <div class="absolute left-0 right-0" style={{ bottom: '45%', height: '12%',
        background: 'linear-gradient(180deg, transparent, rgba(181,137,0,0.5) 30%, rgba(203,75,22,0.3) 70%, transparent)',
        filter: 'blur(4px)' }} />
      {/* Deep ocean */}
      <div class="absolute bottom-0 left-0 right-0 h-[48%]"
        style={{ background: 'linear-gradient(to top, rgba(38,139,210,0.6), rgba(38,139,210,0.35) 50%, rgba(6,182,212,0.15) 80%, transparent)' }} />
      {/* Fluffy cloud puffs */}
      {clouds.map((cl, i) => (
        <div class="absolute"
          style={{ top: `${cl.y}%`, left: '-25%', width: `${cl.w}px`, height: `${cl.h}px`,
            background: 'radial-gradient(ellipse, rgba(255,250,220,0.7), rgba(255,240,200,0.4) 50%, transparent 75%)',
            filter: 'blur(10px)', 'border-radius': '50%',
            animation: `sl-cloud ${cl.dur}s linear ${cl.delay}s infinite` }} />
      ))}
      {/* Sun with corona and rays */}
      <div class="absolute" style={{ top: '8%', right: '10%', width: '180px', height: '180px' }}>
        <div class="absolute inset-0 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(181,137,0,0.7) 0%, rgba(181,137,0,0.4) 30%, rgba(203,75,22,0.15) 60%, transparent)',
            filter: 'blur(3px)', animation: 'sl-corona 4s ease-in-out infinite' }} />
        {[1, 2, 3].map(r => (
          <div class="absolute rounded-full"
            style={{ top: `${-25 * r}%`, left: `${-25 * r}%`, width: `${100 + 50 * r}%`, height: `${100 + 50 * r}%`,
              border: `2px solid rgba(181,137,0,${0.3 - r * 0.08})`,
              animation: `sl-ring ${5 + r * 1.5}s ease-in-out ${r * 0.8}s infinite` }} />
        ))}
        {rayAngles.map((angle, i) => (
          <div class="absolute"
            style={{ top: '50%', left: '50%', width: '120px', height: '3px',
              background: `linear-gradient(90deg, transparent 10%, rgba(181,137,0,${0.4 + (i % 4) * 0.1}) 30%, rgba(181,137,0,${0.3 + (i % 4) * 0.1}) 70%, transparent 90%)`,
              'transform-origin': '0 50%',
              transform: `rotate(${angle}deg) translateX(85px)`,
              animation: `sl-ray ${5 + (i % 4) * 0.6}s ease-in-out ${i * 0.2}s infinite` }} />
        ))}
        <div class="absolute rounded-full"
          style={{ top: '20%', left: '20%', width: '60%', height: '60%',
            background: 'radial-gradient(circle, rgba(255,220,100,0.8), rgba(181,137,0,0.6) 40%, rgba(181,137,0,0.3) 70%, transparent)',
            'box-shadow': '0 0 50px rgba(181,137,0,0.4)' }} />
      </div>
      {/* Bright horizon line */}
      <div class="absolute left-0 right-0" style={{ bottom: '46%', height: '3px',
        background: 'linear-gradient(90deg, transparent 5%, rgba(181,137,0,0.6) 15%, rgba(203,75,22,0.8) 50%, rgba(181,137,0,0.6) 85%, transparent 95%)',
        filter: 'blur(1px)' }} />
      {/* Ocean waves */}
      {waves.map((w, i) => (
        <div class="absolute left-[-15%] right-[-15%]"
          style={{ bottom: `${100 - w.y}%`, height: `${2 + i * 0.6}px`,
            background: `linear-gradient(90deg, transparent 6%, rgba(38,139,210,${w.opacity}) 18%, rgba(6,182,212,${w.opacity * 1.3}) 50%, rgba(38,139,210,${w.opacity}) 82%, transparent 94%)`,
            animation: `sl-wave ${w.dur}s ease-in-out ${w.delay}s infinite` }} />
      ))}
      {/* Bright sun reflection */}
      <div class="absolute" style={{ right: '16%', bottom: '0', width: '80px', height: '46%' }}>
        <div style={{ position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, rgba(181,137,0,0.6) 0%, rgba(203,75,22,0.4) 30%, rgba(181,137,0,0.2) 60%, transparent)',
          animation: 'sl-sunrefl 3s ease-in-out infinite' }} />
      </div>
      {/* Lens flares */}
      <div class="absolute" style={{ top: '22%', right: '28%', width: '70px', height: '14px',
        background: 'linear-gradient(90deg, transparent, rgba(181,137,0,0.6), transparent)',
        'border-radius': '50%', animation: 'sl-flare 5s ease-in-out infinite' }} />
      <div class="absolute rounded-full" style={{ top: '35%', left: '38%', width: '40px', height: '40px',
        background: 'radial-gradient(circle, rgba(38,139,210,0.5), transparent 60%)',
        animation: 'sl-flare 5s ease-in-out 2.5s infinite' }} />
      <div class="absolute" style={{ top: '15%', right: '45%', width: '30px', height: '8px',
        background: 'linear-gradient(90deg, transparent, rgba(203,75,22,0.4), transparent)',
        'border-radius': '50%', animation: 'sl-flare 5s ease-in-out 1.2s infinite' }} />
      {/* Sea spray droplets */}
      {seaSpray.map((sp, i) => (
        <div class="absolute rounded-full"
          style={{ left: `${sp.x}%`, bottom: '48%', width: '5px', height: '5px',
            background: 'rgba(38,139,210,0.8)', opacity: 0,
            'box-shadow': '0 0 8px rgba(38,139,210,0.6)',
            animation: `sl-spray ${sp.dur}s ease-out ${sp.delay}s infinite` }} />
      ))}
      {/* Golden wind particles */}
      {windParticles.map((wp, i) => (
        <div class="absolute rounded-full"
          style={{ left: '-3%', top: `${wp.y}%`, width: '6px', height: '6px',
            background: 'rgba(181,137,0,0.7)', opacity: 0,
            'box-shadow': '0 0 10px rgba(181,137,0,0.5)',
            animation: `sl-wind ${wp.dur}s ease-in-out ${wp.delay}s infinite` }} />
      ))}
      {/* Bird silhouettes */}
      {birds.map((bird, i) => (
        <svg class="absolute" viewBox="0 0 24 12"
          style={{ width: `${22 * bird.scale}px`, top: `${bird.y}%`, left: '-8%',
            opacity: 0, animation: `sl-bird ${bird.dur}s ease-in-out ${bird.delay}s infinite` }}>
          <path d="M12,6 Q9,3 6,4 Q3,3 0,5" stroke="rgba(88,110,117,0.8)" stroke-width="1.8" fill="none" stroke-linecap="round" />
          <path d="M12,6 Q15,3 18,4 Q21,3 24,5" stroke="rgba(88,110,117,0.8)" stroke-width="1.8" fill="none" stroke-linecap="round" />
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

/* -- Lightning: Thunderstorm with realistic bolt strikes, driving rain, storm clouds -- */
function LightningBg() {
  const rain = (() => {
    const rand = seededRand(900);
    return Array.from({ length: 60 }, () => {
      const windLayer = rand();
      const angle = 8 + rand() * 12 + (windLayer > 0.7 ? rand() * 8 : 0);
      return {
        x: rand() * 130 - 15,
        len: 14 + rand() * 32,
        width: rand() > 0.85 ? 1.5 : 1,
        dur: 0.25 + rand() * 0.45,
        delay: rand() * 3,
        opacity: 0.15 + rand() * 0.4,
        angle,
        layer: windLayer < 0.4 ? 0 : windLayer < 0.75 ? 1 : 2,
      };
    });
  })();

  const clouds = (() => {
    const rand = seededRand(902);
    return Array.from({ length: 14 }, (_, i) => ({
      x: -25 + rand() * 130,
      y: -12 + rand() * 28,
      w: 200 + rand() * 500,
      h: 60 + rand() * 140,
      opacity: 0.35 + rand() * 0.5,
      dur: 18 + rand() * 40,
      delay: rand() * 20,
      layer: i < 5 ? 0 : i < 9 ? 1 : 2,
      roilDur: 8 + rand() * 12,
      roilDelay: rand() * 8,
    }));
  })();

  const sheetFlashes = (() => {
    const rand = seededRand(904);
    return Array.from({ length: 5 }, () => ({
      x: rand() * 80 + 5,
      y: rand() * 15 + 3,
      w: 20 + rand() * 25,
      h: 10 + rand() * 12,
      cycle: 6 + rand() * 14,
      delay: rand() * 18,
      flashes: 1 + Math.floor(rand() * 3),
    }));
  })();

  const bolts = (() => {
    const rand = seededRand(903);
    const flashPatterns = [
      { vals: '0;0;1;0;0.6;0;0', times: '0;0.74;0.75;0.76;0.78;0.80;1' },
      { vals: '0;0;1;0;0.8;0;0.5;0;0', times: '0;0.72;0.73;0.74;0.76;0.78;0.80;0.82;1' },
      { vals: '0;0;1;0;0;0.7;0;0.4;0;0', times: '0;0.74;0.75;0.76;0.79;0.80;0.82;0.84;0.86;1' },
      { vals: '0;0;1;0.3;0;0', times: '0;0.74;0.75;0.77;0.80;1' },
    ];
    return Array.from({ length: 7 }, () => {
      const startX = 6 + rand() * 88;
      const segs: { x: number; y: number }[] = [{ x: startX, y: 3 + rand() * 8 }];
      let cx = startX;
      let cy = segs[0]!.y;
      const n = 7 + Math.floor(rand() * 7);
      const drift = (rand() - 0.5) * 0.6;
      for (let j = 0; j < n; j++) {
        const jitter = (rand() - 0.5) * 18;
        const bigKink = rand() > 0.82 ? (rand() - 0.5) * 12 : 0;
        cx += jitter + bigKink + drift * 3;
        cy += 4 + rand() * 8;
        cx = Math.max(2, Math.min(98, cx));
        cy = Math.min(95, cy);
        segs.push({ x: cx, y: cy });
      }
      const branches: { x: number; y: number }[][] = [];
      const nBranches = 2 + Math.floor(rand() * 3);
      for (let b = 0; b < nBranches; b++) {
        const bi = 1 + Math.floor(rand() * Math.max(1, segs.length - 2));
        const bsegs: { x: number; y: number }[] = [{ x: segs[bi]!.x, y: segs[bi]!.y }];
        let bx = segs[bi]!.x;
        let by = segs[bi]!.y;
        const side = rand() > 0.5 ? 1 : -1;
        const bn = 2 + Math.floor(rand() * 4);
        for (let k = 0; k < bn; k++) {
          bx += side * (3 + rand() * 10) + (rand() - 0.5) * 4;
          by += 3 + rand() * 7;
          bsegs.push({ x: Math.max(1, Math.min(99, bx)), y: Math.min(96, by) });
        }
        branches.push(bsegs);
      }
      const pat = flashPatterns[Math.floor(rand() * flashPatterns.length)]!;
      return {
        segs,
        branches,
        cycle: 5 + rand() * 10,
        delay: rand() * 16,
        pattern: pat,
        intensity: 0.7 + rand() * 0.3,
      };
    });
  })();

  const splashes = (() => {
    const rand = seededRand(905);
    return Array.from({ length: 30 }, () => ({
      x: rand() * 100,
      dur: 0.3 + rand() * 0.4,
      delay: rand() * 2,
      size: 2 + rand() * 3,
    }));
  })();

  return (
    <Shell>
      {/* Storm clouds — layered with roiling motion */}
      {clouds.map((c, i) => (
        <div class="absolute rounded-full"
          style={{
            left: `${c.x}%`, top: `${c.y}%`,
            width: `${c.w}px`, height: `${c.h}px`,
            background: c.layer === 0
              ? 'radial-gradient(ellipse, rgba(12,16,35,0.9) 0%, rgba(8,12,28,0.55) 35%, transparent 65%)'
              : c.layer === 1
              ? 'radial-gradient(ellipse, rgba(18,24,48,0.75) 0%, rgba(12,18,38,0.35) 40%, transparent 68%)'
              : 'radial-gradient(ellipse, rgba(22,30,55,0.55) 0%, rgba(16,22,42,0.2) 45%, transparent 70%)',
            filter: `blur(${12 + c.layer * 8}px)`,
            animation: `ln-cloud ${c.dur}s ease-in-out ${c.delay}s infinite, ln-roil ${c.roilDur}s ease-in-out ${c.roilDelay}s infinite`,
            opacity: c.opacity,
          }} />
      ))}

      {/* Cloud underside glow — ambient internal lightning */}
      <div class="absolute left-0 right-0 top-[6%] h-[22%]"
        style={{
          background: 'linear-gradient(to bottom, rgba(80,130,220,0.1), rgba(60,110,200,0.03), transparent)',
          filter: 'blur(28px)',
          animation: 'ln-underglow 5s ease-in-out infinite',
        }} />

      {/* Sheet lightning — cloud-to-cloud flickers with no visible bolt */}
      {sheetFlashes.map((sf, i) => (
        <div class="absolute rounded-full"
          style={{
            left: `${sf.x}%`, top: `${sf.y}%`,
            width: `${sf.w}%`, height: `${sf.h}%`,
            background: 'radial-gradient(ellipse, rgba(140,180,255,0.35), rgba(100,150,240,0.1) 40%, transparent 65%)',
            filter: 'blur(25px)',
            animation: `ln-sheet${sf.flashes} ${sf.cycle}s ease-out ${sf.delay}s infinite`,
          }} />
      ))}

      {/* Lightning bolts via SVG */}
      <svg class="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs />
        {bolts.map((bolt, bi) => {
          const mainD = bolt.segs.map((s, si) => `${si === 0 ? 'M' : 'L'}${s.x},${s.y}`).join(' ');
          const { vals, times } = bolt.pattern;
          const c = bolt.cycle;
          const endPt = bolt.segs[bolt.segs.length - 1]!;
          return (
            <g>
              {/* Ultra-wide atmospheric scatter */}
              <path d={mainD} fill="none" stroke={`rgba(70,120,220,${0.3 * bolt.intensity})`} stroke-width="6"
                stroke-linecap="round" stroke-linejoin="round"                opacity="0" {...NON_SCALING_STROKE}>
                <Anim attributeName="opacity" values={vals} keyTimes={times}
                  dur={`${c}s`} begin={`${bolt.delay}s`} repeatCount="indefinite" />
              </path>
              {/* Wide outer glow */}
              <path d={mainD} fill="none" stroke={`rgba(100,160,250,${0.5 * bolt.intensity})`} stroke-width="3.5"
                stroke-linecap="round" stroke-linejoin="round"                opacity="0" {...NON_SCALING_STROKE}>
                <Anim attributeName="opacity" values={vals} keyTimes={times}
                  dur={`${c}s`} begin={`${bolt.delay}s`} repeatCount="indefinite" />
              </path>
              {/* Main channel */}
              <path d={mainD} fill="none" stroke={`rgba(190,215,255,${0.95 * bolt.intensity})`} stroke-width="1.6"
                stroke-linecap="round" stroke-linejoin="round"                opacity="0" {...NON_SCALING_STROKE}>
                <Anim attributeName="opacity" values={vals} keyTimes={times}
                  dur={`${c}s`} begin={`${bolt.delay}s`} repeatCount="indefinite" />
              </path>
              {/* Hot white core */}
              <path d={mainD} fill="none" stroke="rgba(245,248,255,0.98)" stroke-width="0.6"
                stroke-linecap="round" stroke-linejoin="round"
                opacity="0" {...NON_SCALING_STROKE}>
                <Anim attributeName="opacity" values={vals} keyTimes={times}
                  dur={`${c}s`} begin={`${bolt.delay}s`} repeatCount="indefinite" />
              </path>
              {/* Branches */}
              {bolt.branches.map((br, bri) => {
                const brD = br.map((s, si) => `${si === 0 ? 'M' : 'L'}${s.x},${s.y}`).join(' ');
                const branchDelay = bolt.delay + 0.01 + bri * 0.015;
                return (
                  <g>
                    <path d={brD} fill="none" stroke={`rgba(120,170,250,${0.55 * bolt.intensity})`} stroke-width="2"
                      stroke-linecap="round" stroke-linejoin="round"                      opacity="0" {...NON_SCALING_STROKE}>
                      <Anim attributeName="opacity" values={vals} keyTimes={times}
                        dur={`${c}s`} begin={`${branchDelay}s`} repeatCount="indefinite" />
                    </path>
                    <path d={brD} fill="none" stroke={`rgba(180,210,255,${0.75 * bolt.intensity})`} stroke-width="1"
                      stroke-linecap="round" stroke-linejoin="round"                      opacity="0" {...NON_SCALING_STROKE}>
                      <Anim attributeName="opacity" values={vals} keyTimes={times}
                        dur={`${c}s`} begin={`${branchDelay}s`} repeatCount="indefinite" />
                    </path>
                    <path d={brD} fill="none" stroke="rgba(230,240,255,0.85)" stroke-width="0.4"
                      stroke-linecap="round" stroke-linejoin="round"
                      opacity="0" {...NON_SCALING_STROKE}>
                      <Anim attributeName="opacity" values={vals} keyTimes={times}
                        dur={`${c}s`} begin={`${branchDelay}s`} repeatCount="indefinite" />
                    </path>
                  </g>
                );
              })}
              {/* Ground strike illumination — wide spread */}
              <ellipse cx={endPt.x} cy={endPt.y + 3}
                rx="14" ry="5" fill={`rgba(100,160,250,${0.5 * bolt.intensity})`} opacity="0">
                <Anim attributeName="opacity" values={vals} keyTimes={times}
                  dur={`${c}s`} begin={`${bolt.delay}s`} repeatCount="indefinite" />
              </ellipse>
            </g>
          );
        })}
      </svg>

      {/* Full-screen flash per bolt — whole sky illuminates */}
      {bolts.map((bolt, bi) => {
        const flashIntensity = Math.round(bolt.intensity * 18);
        return (
          <div class="absolute inset-0"
            style={{ animation: `ln-skyflash-${bi % 4} ${bolt.cycle}s ease-out ${bolt.delay}s infinite` }} />
        );
      })}

      {/* Cloud illumination — localized glow near each bolt origin */}
      {bolts.map((bolt, bi) => (
        <div class="absolute rounded-full"
          style={{
            left: `${bolt.segs[0]!.x - 18}%`, top: `${bolt.segs[0]!.y - 6}%`,
            width: '36%', height: '22%',
            background: `radial-gradient(ellipse, rgba(140,185,255,${0.35 * bolt.intensity}), transparent 55%)`,
            filter: 'blur(22px)',
            animation: `ln-skyflash-${bi % 4} ${bolt.cycle}s ease-out ${bolt.delay}s infinite`,
          }} />
      ))}

      {/* Driving rain — three depth layers with varied angle for wind gusts */}
      {rain.map((r, i) => (
        <div class="absolute"
          style={{
            left: `${r.x}%`, top: '-12%',
            width: `${r.width}px`, height: `${r.len}px`,
            background: r.layer === 0
              ? `linear-gradient(to bottom, transparent, rgba(180,210,255,${r.opacity}))`
              : r.layer === 1
              ? `linear-gradient(to bottom, transparent, rgba(150,190,240,${r.opacity * 0.75}))`
              : `linear-gradient(to bottom, transparent, rgba(130,170,230,${r.opacity * 0.5}))`,
            transform: `rotate(${r.angle}deg)`,
            'transform-origin': 'top left',
            animation: `ln-rain ${r.dur}s linear ${r.delay}s infinite`,
          }} />
      ))}

      {/* Rain splash at ground level */}
      {splashes.map((sp, i) => (
        <div class="absolute"
          style={{
            left: `${sp.x}%`, bottom: '2%',
            width: `${sp.size}px`, height: `${sp.size * 0.4}px`,
            'border-radius': '50%',
            background: 'rgba(160,200,255,0.3)',
            filter: 'blur(0.5px)',
            animation: `ln-splash ${sp.dur}s ease-out ${sp.delay}s infinite`,
          }} />
      ))}

      {/* Low fog / mist — wind-driven */}
      <div class="absolute bottom-0 left-[-5%] right-[-5%] h-[28%]"
        style={{
          background: 'linear-gradient(to top, rgba(8,12,25,0.55), rgba(12,18,35,0.2) 45%, transparent)',
          filter: 'blur(12px)',
          animation: 'ln-fog 12s ease-in-out infinite',
        }} />
      <div class="absolute bottom-0 left-[-8%] right-[-8%] h-[20%]"
        style={{
          background: 'radial-gradient(ellipse at 55% 100%, rgba(18,25,48,0.45), transparent 50%)',
          filter: 'blur(20px)',
          animation: 'ln-fog 16s ease-in-out 4s infinite',
        }} />
      <div class="absolute bottom-0 left-[-3%] right-[-3%] h-[15%]"
        style={{
          background: 'radial-gradient(ellipse at 30% 100%, rgba(15,22,42,0.35), transparent 45%)',
          filter: 'blur(16px)',
          animation: 'ln-fog 20s ease-in-out 9s infinite',
        }} />

      <style>{`
        @keyframes ln-rain { 0%{top:-12%;opacity:0} 4%{opacity:1} 92%{opacity:0.7} 100%{top:112%;opacity:0} }
        @keyframes ln-cloud { 0%,100%{transform:translateX(0) scale(1)} 50%{transform:translateX(30px) scale(1.04)} }
        @keyframes ln-roil { 0%,100%{transform:scaleX(1) scaleY(1)} 30%{transform:scaleX(1.06) scaleY(0.95)} 60%{transform:scaleX(0.96) scaleY(1.04)} }
        @keyframes ln-underglow { 0%,100%{opacity:0.4} 40%{opacity:0.9} 60%{opacity:0.5} }
        @keyframes ln-fog { 0%,100%{transform:translateX(0);opacity:1} 50%{transform:translateX(20px);opacity:0.6} }
        @keyframes ln-splash { 0%{transform:scale(0);opacity:0.8} 50%{transform:scale(1.5);opacity:0.4} 100%{transform:scale(2.5);opacity:0} }

        @keyframes ln-sheet1 { 0%,88%{opacity:0} 89%{opacity:0.8} 90%{opacity:0} 100%{opacity:0} }
        @keyframes ln-sheet2 { 0%,85%{opacity:0} 86%{opacity:0.6} 87%{opacity:0} 88.5%{opacity:0.9} 89.5%{opacity:0} 100%{opacity:0} }
        @keyframes ln-sheet3 { 0%,82%{opacity:0} 83%{opacity:0.5} 83.5%{opacity:0} 84.5%{opacity:0.7} 85%{opacity:0.2} 86%{opacity:0.9} 86.5%{opacity:0} 100%{opacity:0} }

        @keyframes ln-skyflash-0 { 0%,73%{background:transparent} 74%{background:rgba(140,185,250,0.12)} 75%{background:rgba(160,200,255,0.18)} 76%{background:transparent} 78%{background:rgba(120,170,250,0.14)} 79%{background:transparent} 100%{background:transparent} }
        @keyframes ln-skyflash-1 { 0%,72%{background:transparent} 73%{background:rgba(150,190,255,0.16)} 74%{background:transparent} 76%{background:rgba(130,175,250,0.22)} 77.5%{background:rgba(110,160,245,0.08)} 78.5%{background:transparent} 100%{background:transparent} }
        @keyframes ln-skyflash-2 { 0%,74%{background:transparent} 75%{background:rgba(160,200,255,0.2)} 75.5%{background:rgba(140,185,250,0.06)} 76.5%{background:transparent} 100%{background:transparent} }
        @keyframes ln-skyflash-3 { 0%,73%{background:transparent} 74%{background:rgba(130,175,250,0.1)} 75%{background:rgba(150,195,255,0.2)} 76%{background:transparent} 78%{background:rgba(140,185,250,0.15)} 79%{background:transparent} 80.5%{background:rgba(120,165,245,0.08)} 81%{background:transparent} 100%{background:transparent} }
      `}</style>
    </Shell>
  );
}

/* ── Phoenix: Majestic flaming phoenix rising from inferno ── */
function PhoenixBg() {
  const embersSmall = (() => {
    const rand = seededRand(660);
    return Array.from({ length: 30 }, () => ({
      x: rand() * 100,
      size: 1.5 + rand() * 2.5,
      dur: 1.5 + rand() * 2,
      delay: rand() * 10,
      drift: (rand() - 0.5) * 70,
    }));
  })();
  const embersMed = (() => {
    const rand = seededRand(661);
    return Array.from({ length: 20 }, () => ({
      x: rand() * 100,
      size: 3 + rand() * 4,
      dur: 2.5 + rand() * 3,
      delay: rand() * 12,
      drift: (rand() - 0.5) * 90,
      color: rand() > 0.5 ? '#fbbf24' : '#f97316',
    }));
  })();
  const embersLarge = (() => {
    const rand = seededRand(662);
    return Array.from({ length: 12 }, () => ({
      x: rand() * 100,
      size: 5 + rand() * 5,
      dur: 3.5 + rand() * 4,
      delay: rand() * 14,
      drift: (rand() - 0.5) * 110,
    }));
  })();
  const smoke = (() => {
    const rand = seededRand(663);
    return Array.from({ length: 10 }, () => ({
      x: 5 + rand() * 90,
      dur: 16 + rand() * 14,
      delay: rand() * 12,
      w: 80 + rand() * 160,
    }));
  })();
  const vortex = (() => {
    const rand = seededRand(664);
    return Array.from({ length: 16 }, (_, i) => ({
      angle: (i / 16) * 360,
      r: 35 + rand() * 40,
      size: 2 + rand() * 4,
      dur: 2.5 + rand() * 3,
      delay: rand() * 5,
      color: rand() > 0.5 ? '#fbbf24' : rand() > 0.3 ? '#f97316' : '#ef4444',
    }));
  })();
  const feathers = (() => {
    const rand = seededRand(665);
    return Array.from({ length: 8 }, () => ({
      x: 20 + rand() * 60,
      y: 15 + rand() * 50,
      size: 8 + rand() * 16,
      dur: 6 + rand() * 10,
      delay: rand() * 12,
      rot: rand() * 360,
      drift: (rand() - 0.5) * 80,
      color: rand() < 0.4 ? '#f59e0b' : rand() < 0.7 ? '#ef4444' : '#fb923c',
    }));
  })();
  const sparks = (() => {
    const rand = seededRand(666);
    return Array.from({ length: 16 }, () => ({
      x: 30 + rand() * 40,
      y: 25 + rand() * 35,
      dur: 1.2 + rand() * 2.5,
      delay: rand() * 14,
      angle: rand() * 360,
      dist: 50 + rand() * 100,
      size: 0.8 + rand() * 1.8,
    }));
  })();

  return (
    <Shell>
      {/* Intense fire base — 5 layers of blazing gradient */}
      <div class="absolute bottom-0 left-0 right-0 h-[65%]"
        style={{ background: 'linear-gradient(to top, rgba(180,60,10,0.5), rgba(239,68,68,0.3) 35%, rgba(245,158,11,0.12) 65%, transparent)', animation: 'ph-heat 3s ease-in-out infinite' }} />
      <div class="absolute bottom-0 left-[5%] right-[5%] h-[55%]"
        style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(251,191,36,0.45), rgba(249,115,22,0.25) 45%, transparent 70%)', animation: 'ph-heat 4.5s ease-in-out 1s infinite' }} />
      <div class="absolute bottom-0 left-[15%] right-[15%] h-[45%]"
        style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(239,68,68,0.35), rgba(180,60,10,0.2) 55%, transparent)', animation: 'ph-heat 3.8s ease-in-out 1.8s infinite' }} />
      <div class="absolute bottom-0 left-[25%] right-[25%] h-[35%]"
        style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(255,200,60,0.5), transparent 65%)', animation: 'ph-heat 4s ease-in-out 0.5s infinite' }} />
      <div class="absolute bottom-0 left-[35%] right-[35%] h-[25%]"
        style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(255,240,100,0.55), transparent 70%)', animation: 'ph-heat 2.8s ease-in-out 2s infinite' }} />

      {/* Fire veins rising from below */}
      {[8, 18, 30, 42, 55, 68, 78, 88].map((x, i) => (
        <div class="absolute bottom-0"
          style={{ left: `${x}%`, width: `${3 + (i % 3) * 2}px`, height: `${20 + (i % 5) * 8}%`,
            background: `linear-gradient(to top, rgba(${i % 2 === 0 ? '251,191,36' : '249,115,22'},0.7), rgba(239,68,68,0.4) 55%, rgba(180,60,10,0.15) 80%, transparent)`,
            filter: 'blur(1px)',
            'box-shadow': `0 0 6px rgba(249,115,22,0.5), 0 0 14px rgba(251,191,36,0.2)`,
            animation: `ph-vein ${2.8 + i * 0.7}s ease-in-out ${i * 0.45}s infinite` }} />
      ))}

      {/* Heat shimmer */}
      <div class="absolute bottom-0 left-0 right-0 h-[40%]"
        style={{ background: 'linear-gradient(to top, rgba(255,180,60,0.18), rgba(255,140,40,0.08) 50%, transparent)', filter: 'blur(3px)', animation: 'ph-shimmer 1.6s ease-in-out infinite' }} />

      {/* Dense smoke columns */}
      {smoke.map((s, i) => (
        <div class="absolute bottom-[2%]"
          style={{ left: `${s.x}%`, width: `${s.w}px`, height: '70%',
            background: 'linear-gradient(to top, rgba(60,30,15,0.6), rgba(50,25,12,0.4) 30%, rgba(35,18,10,0.2) 60%, rgba(20,10,5,0.08) 85%, transparent)',
            filter: 'blur(14px)', animation: `ph-smoke ${s.dur}s ease-in-out ${s.delay}s infinite` }} />
      ))}

      {/* Central phoenix glow — multi-layer radiance */}
      <div class="absolute top-[18%] left-[50%] -translate-x-1/2 w-[min(700px,55vw)] h-[min(600px,50vh)] rounded-full"
        style={{ background: 'radial-gradient(ellipse, rgba(245,158,11,0.18) 0%, rgba(239,68,68,0.08) 40%, transparent 65%)', animation: 'ph-core 5s ease-in-out infinite', filter: 'blur(35px)' }} />
      <div class="absolute top-[22%] left-[50%] -translate-x-1/2 w-[min(450px,38vw)] h-[min(400px,36vh)] rounded-full"
        style={{ background: 'radial-gradient(ellipse, rgba(251,191,36,0.2) 0%, rgba(245,158,11,0.08) 45%, transparent 70%)', animation: 'ph-core 5s ease-in-out 2.5s infinite', filter: 'blur(25px)' }} />
      <div class="absolute top-[28%] left-[50%] -translate-x-1/2 w-[min(250px,22vw)] h-[min(220px,20vh)] rounded-full"
        style={{ background: 'radial-gradient(ellipse, rgba(254,243,199,0.15) 0%, rgba(251,191,36,0.06) 50%, transparent 70%)', animation: 'ph-core 4s ease-in-out 1s infinite', filter: 'blur(18px)' }} />

      {/* Phoenix SVG — detailed majestic bird with layered flames */}
      <svg class="absolute inset-0 w-full h-full" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="ph-fg" x1="0.5" y1="1" x2="0.5" y2="0">
            <stop offset="0%" stop-color="#dc2626" stop-opacity="0.7" />
            <stop offset="30%" stop-color="#f97316" stop-opacity="0.6" />
            <stop offset="60%" stop-color="#f59e0b" stop-opacity="0.45" />
            <stop offset="85%" stop-color="#fbbf24" stop-opacity="0.25" />
            <stop offset="100%" stop-color="#fef3c7" stop-opacity="0.1" />
          </linearGradient>
          <linearGradient id="ph-wg" x1="0" y1="0.5" x2="1" y2="0.5">
            <stop offset="0%" stop-color="#ef4444" stop-opacity="0.35" />
            <stop offset="40%" stop-color="#f97316" stop-opacity="0.25" />
            <stop offset="70%" stop-color="#f59e0b" stop-opacity="0.15" />
            <stop offset="100%" stop-color="#fbbf24" stop-opacity="0.04" />
          </linearGradient>
          <linearGradient id="ph-wgr" x1="1" y1="0.5" x2="0" y2="0.5">
            <stop offset="0%" stop-color="#ef4444" stop-opacity="0.35" />
            <stop offset="40%" stop-color="#f97316" stop-opacity="0.25" />
            <stop offset="70%" stop-color="#f59e0b" stop-opacity="0.15" />
            <stop offset="100%" stop-color="#fbbf24" stop-opacity="0.04" />
          </linearGradient>
          <radialGradient id="ph-body" cx="0.5" cy="0.4" r="0.5">
            <stop offset="0%" stop-color="#fef3c7" stop-opacity="0.3" />
            <stop offset="40%" stop-color="#fbbf24" stop-opacity="0.22" />
            <stop offset="70%" stop-color="#f59e0b" stop-opacity="0.14" />
            <stop offset="100%" stop-color="#ef4444" stop-opacity="0.06" />
          </radialGradient>
        </defs>

        {/* Outer glow aura around the whole bird */}
        <g style={{ animation: 'ph-float 7s ease-in-out infinite' }}>
          <ellipse cx="500" cy="440" rx="160" ry="200" fill="rgba(245,158,11,0.06)" />
        </g>

        {/* Main phoenix group */}
        <g style={{ animation: 'ph-float 7s ease-in-out infinite' }}>

          {/* Tail — long sweeping fire plumes (7 streams) */}
          <path d="M500 620 Q475 720 430 850 Q455 790 465 730 Q485 670 500 620Z" fill="url(#ph-fg)" style={{ animation: 'ph-t1 3s ease-in-out infinite' }} />
          <path d="M500 620 Q525 730 570 860 Q545 790 535 730 Q515 670 500 620Z" fill="url(#ph-fg)" style={{ animation: 'ph-t2 3.4s ease-in-out infinite' }} />
          <path d="M500 620 Q490 740 500 880 Q510 760 505 700 Q502 660 500 620Z" fill="url(#ph-fg)" style={{ animation: 'ph-t3 3.8s ease-in-out infinite' }} />
          <path d="M500 620 Q460 740 400 870 Q440 800 460 740 Q480 680 500 620Z" fill="rgba(239,68,68,0.25)" style={{ animation: 'ph-t1 4.2s ease-in-out 0.5s infinite' }} />
          <path d="M500 620 Q540 740 600 870 Q560 800 540 740 Q520 680 500 620Z" fill="rgba(239,68,68,0.25)" style={{ animation: 'ph-t2 4s ease-in-out 0.8s infinite' }} />
          <path d="M500 620 Q465 760 380 900 Q430 830 455 760 Q480 690 500 620Z" fill="rgba(180,60,10,0.18)" style={{ animation: 'ph-t1 5s ease-in-out 1.2s infinite' }} />
          <path d="M500 620 Q535 760 620 900 Q570 830 545 760 Q520 690 500 620Z" fill="rgba(180,60,10,0.18)" style={{ animation: 'ph-t2 4.8s ease-in-out 1s infinite' }} />

          {/* Body — teardrop with layered glow */}
          <ellipse cx="500" cy="470" rx="40" ry="100" fill="url(#ph-body)" />
          <ellipse cx="500" cy="460" rx="28" ry="75" fill="rgba(251,191,36,0.22)" />
          <ellipse cx="500" cy="445" rx="16" ry="45" fill="rgba(254,243,199,0.2)" />
          <ellipse cx="500" cy="435" rx="8" ry="22" fill="rgba(255,255,220,0.18)" />

          {/* Left wing — primary feathers (sweeping arc with 4 layers) */}
          <path d="M475 445 Q400 370 270 290 Q320 340 355 375 Q390 410 430 438 Q455 448 475 445Z"
            fill="url(#ph-wg)" style={{ animation: 'ph-wl 3.8s ease-in-out infinite', 'transform-origin': '475px 445px' }} />
          <path d="M475 460 Q385 400 230 330 Q300 370 345 400 Q390 430 440 455 Q460 462 475 460Z"
            fill="rgba(249,115,22,0.18)" style={{ animation: 'ph-wl 3.8s ease-in-out 0.2s infinite', 'transform-origin': '475px 460px' }} />
          <path d="M475 475 Q370 430 200 380 Q280 410 335 435 Q395 460 450 473Z"
            fill="rgba(239,68,68,0.12)" style={{ animation: 'ph-wl 3.8s ease-in-out 0.4s infinite', 'transform-origin': '475px 475px' }} />
          <path d="M478 490 Q390 460 250 430 Q320 450 370 465 Q425 482 465 488Z"
            fill="rgba(180,60,10,0.08)" style={{ animation: 'ph-wl 3.8s ease-in-out 0.6s infinite', 'transform-origin': '478px 490px' }} />

          {/* Right wing — primary feathers (mirrored) */}
          <path d="M525 445 Q600 370 730 290 Q680 340 645 375 Q610 410 570 438 Q545 448 525 445Z"
            fill="url(#ph-wgr)" style={{ animation: 'ph-wr 3.8s ease-in-out infinite', 'transform-origin': '525px 445px' }} />
          <path d="M525 460 Q615 400 770 330 Q700 370 655 400 Q610 430 560 455 Q540 462 525 460Z"
            fill="rgba(249,115,22,0.18)" style={{ animation: 'ph-wr 3.8s ease-in-out 0.2s infinite', 'transform-origin': '525px 460px' }} />
          <path d="M525 475 Q630 430 800 380 Q720 410 665 435 Q605 460 550 473Z"
            fill="rgba(239,68,68,0.12)" style={{ animation: 'ph-wr 3.8s ease-in-out 0.4s infinite', 'transform-origin': '525px 475px' }} />
          <path d="M522 490 Q610 460 750 430 Q680 450 630 465 Q575 482 535 488Z"
            fill="rgba(180,60,10,0.08)" style={{ animation: 'ph-wr 3.8s ease-in-out 0.6s infinite', 'transform-origin': '522px 490px' }} />

          {/* Wing tip fire — left */}
          <path d="M270 290 Q250 260 220 220 Q240 255 260 280Z" fill="rgba(251,191,36,0.3)" style={{ animation: 'ph-wtl 2.5s ease-in-out infinite' }} />
          <path d="M270 290 Q240 275 200 250 Q235 270 265 285Z" fill="rgba(245,158,11,0.2)" style={{ animation: 'ph-wtl 3s ease-in-out 0.4s infinite' }} />
          <path d="M230 330 Q205 305 170 270 Q195 300 225 325Z" fill="rgba(239,68,68,0.15)" style={{ animation: 'ph-wtl 2.8s ease-in-out 0.8s infinite' }} />

          {/* Wing tip fire — right */}
          <path d="M730 290 Q750 260 780 220 Q760 255 740 280Z" fill="rgba(251,191,36,0.3)" style={{ animation: 'ph-wtr 2.5s ease-in-out infinite' }} />
          <path d="M730 290 Q760 275 800 250 Q765 270 735 285Z" fill="rgba(245,158,11,0.2)" style={{ animation: 'ph-wtr 3s ease-in-out 0.4s infinite' }} />
          <path d="M770 330 Q795 305 830 270 Q805 300 775 325Z" fill="rgba(239,68,68,0.15)" style={{ animation: 'ph-wtr 2.8s ease-in-out 0.8s infinite' }} />

          {/* Neck */}
          <ellipse cx="500" cy="380" rx="14" ry="35" fill="rgba(245,158,11,0.2)" />
          <ellipse cx="500" cy="375" rx="9" ry="25" fill="rgba(251,191,36,0.22)" />

          {/* Head */}
          <ellipse cx="500" cy="350" rx="18" ry="24" fill="rgba(245,158,11,0.22)" />
          <ellipse cx="500" cy="345" rx="12" ry="17" fill="rgba(251,191,36,0.28)" />
          <ellipse cx="500" cy="340" rx="7" ry="10" fill="rgba(254,243,199,0.2)" />

          {/* Eyes — twin points of white-hot light */}
          <circle cx="492" cy="342" r="2.5" fill="rgba(255,255,230,0.5)">
            <Anim attributeName="opacity" values="0.5;0.9;0.5" dur="3s" repeatCount="indefinite" />
          </circle>
          <circle cx="508" cy="342" r="2.5" fill="rgba(255,255,230,0.5)">
            <Anim attributeName="opacity" values="0.5;0.9;0.5" dur="3s" begin="0.3s" repeatCount="indefinite" />
          </circle>

          {/* Beak */}
          <path d="M500 335 L507 320 L500 326 L493 320Z" fill="rgba(254,243,199,0.35)" />

          {/* Crown flames — 5 tongues */}
          <path d="M500 330 Q497 305 490 280 Q498 300 500 330Z" fill="rgba(245,158,11,0.25)" style={{ animation: 'ph-crown 2.2s ease-in-out infinite' }} />
          <path d="M500 330 Q504 302 512 275 Q503 298 500 330Z" fill="rgba(239,68,68,0.2)" style={{ animation: 'ph-crown 2.6s ease-in-out 0.4s infinite' }} />
          <path d="M500 330 Q494 308 482 288 Q494 305 500 330Z" fill="rgba(251,191,36,0.18)" style={{ animation: 'ph-crown 2.4s ease-in-out 0.8s infinite' }} />
          <path d="M500 330 Q508 310 520 292 Q508 308 500 330Z" fill="rgba(249,115,22,0.15)" style={{ animation: 'ph-crown 3s ease-in-out 1.2s infinite' }} />
          <path d="M500 330 Q500 308 500 270 Q502 300 500 330Z" fill="rgba(254,243,199,0.12)" style={{ animation: 'ph-crown 2.8s ease-in-out 0.6s infinite' }} />
        </g>
      </svg>

      {/* Fire vortex swirl around phoenix center */}
      <div class="absolute" style={{ left: '50%', top: '42%', width: '0', height: '0' }}>
        {vortex.map((v, i) => {
          const rad = (v.angle * Math.PI) / 180;
          const px = Math.cos(rad) * v.r;
          const py = Math.sin(rad) * v.r;
          return (
            <div class="absolute rounded-full"
              style={{ left: `${px}px`, top: `${py}px`, width: `${v.size}px`, height: `${v.size}px`,
                background: v.color, opacity: 0,
                'box-shadow': `0 0 ${v.size * 4}px ${v.color}`,
                animation: `ph-vortex ${v.dur}s ease-in-out ${v.delay}s infinite` }} />
          );
        })}
      </div>

      {/* Floating fire feather shapes */}
      {feathers.map((f, i) => (
        <div class="absolute"
          style={{
            left: `${f.x}%`, top: `${f.y}%`,
            width: `${f.size * 0.35}px`, height: `${f.size}px`,
            'border-radius': '50% 50% 50% 50% / 20% 20% 80% 80%',
            background: `linear-gradient(to bottom, ${f.color}, transparent)`,
            'box-shadow': `0 0 ${f.size}px ${f.color}40`,
            transform: `rotate(${f.rot}deg)`,
            opacity: 0,
            animation: `ph-feather ${f.dur}s ease-in-out ${f.delay}s infinite`,
            ['--ph-fdrift' as string]: `${f.drift}px`,
          }}
        />
      ))}

      {/* Spark bursts radiating from phoenix */}
      {sparks.map((s, i) => (
        <div class="absolute rounded-full"
          style={{
            left: `${s.x}%`, top: `${s.y}%`,
            width: `${s.size}px`, height: `${s.size}px`,
            background: '#fbbf24',
            'box-shadow': '0 0 8px #f59e0b, 0 0 16px rgba(245,158,11,0.3)',
            animation: `ph-spark ${s.dur}s ease-out ${s.delay}s infinite`,
            ['--ph-sx' as string]: `${Math.cos(s.angle * Math.PI / 180) * s.dist}px`,
            ['--ph-sy' as string]: `${Math.sin(s.angle * Math.PI / 180) * s.dist}px`,
            opacity: 0,
          }}
        />
      ))}

      {/* Three tiers of rising embers */}
      {embersSmall.map((e, i) => (
        <div class="absolute rounded-full"
          style={{ left: `${e.x}%`, bottom: '0', width: `${e.size}px`, height: `${e.size}px`,
            background: '#fde68a', opacity: 0,
            'box-shadow': '0 0 8px #fbbf24, 0 0 16px rgba(251,191,36,0.3)',
            animation: `ph-eS ${e.dur}s ease-out ${e.delay}s infinite`,
            ['--dr' as string]: `${e.drift}px` }} />
      ))}
      {embersMed.map((e, i) => (
        <div class="absolute rounded-full"
          style={{ left: `${e.x}%`, bottom: '0', width: `${e.size}px`, height: `${e.size}px`,
            background: e.color, opacity: 0,
            'box-shadow': `0 0 ${e.size * 3}px ${e.color}, 0 0 ${e.size * 6}px rgba(249,115,22,0.25)`,
            animation: `ph-eM ${e.dur}s ease-out ${e.delay}s infinite`,
            ['--dr' as string]: `${e.drift}px` }} />
      ))}
      {embersLarge.map((e, i) => (
        <div class="absolute rounded-full"
          style={{ left: `${e.x}%`, bottom: '0', width: `${e.size}px`, height: `${e.size}px`,
            background: '#ef4444', opacity: 0,
            'box-shadow': `0 0 ${e.size * 5}px rgba(239,68,68,0.7), 0 0 ${e.size * 10}px rgba(180,60,10,0.35)`,
            animation: `ph-eL ${e.dur}s ease-out ${e.delay}s infinite`,
            ['--dr' as string]: `${e.drift}px` }} />
      ))}

      {/* Magma pools at base */}
      {[18, 48, 80].map((x, i) => (
        <div class="absolute bottom-0"
          style={{ left: `${x - 10}%`, width: '20%', height: '8%',
            background: `radial-gradient(ellipse, rgba(${i % 2 === 0 ? '255,200,60' : '251,191,36'},0.6), rgba(249,115,22,0.35) 40%, rgba(239,68,68,0.2) 70%, transparent)`,
            'border-radius': '50%', filter: 'blur(2px)',
            'box-shadow': `0 0 25px rgba(251,191,36,0.4), 0 0 50px rgba(249,115,22,0.2)`,
            animation: `ph-pool ${2.2 + i * 1.1}s ease-in-out ${i * 0.7}s infinite` }} />
      ))}

      {/* Flickering ambient light on the whole scene */}
      <div class="absolute inset-0"
        style={{ animation: 'ph-flicker 0.15s step-end infinite', background: 'rgba(245,158,11,0.02)' }} />

      <style>{`
        @keyframes ph-heat { 0%,100%{opacity:1} 50%{opacity:0.75} }
        @keyframes ph-vein { 0%,100%{opacity:1;transform:scaleY(1)} 50%{opacity:0.65;transform:scaleY(0.88)} }
        @keyframes ph-shimmer { 0%,100%{transform:translateX(0) skewX(0deg)} 33%{transform:translateX(3px) skewX(0.6deg)} 66%{transform:translateX(-3px) skewX(-0.6deg)} }
        @keyframes ph-smoke { 0%,100%{transform:translateY(0) scaleX(1);opacity:1} 50%{transform:translateY(-45px) scaleX(1.5);opacity:0.45} }
        @keyframes ph-core { 0%,100%{opacity:0.7;transform:translateX(-50%) scale(1)} 50%{opacity:1;transform:translateX(-50%) scale(1.1)} }
        @keyframes ph-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-14px)} }
        @keyframes ph-wl { 0%,100%{transform:rotate(0deg) scaleY(1)} 35%{transform:rotate(-10deg) scaleY(1.04)} 65%{transform:rotate(-4deg) scaleY(0.98)} }
        @keyframes ph-wr { 0%,100%{transform:rotate(0deg) scaleY(1)} 35%{transform:rotate(10deg) scaleY(1.04)} 65%{transform:rotate(4deg) scaleY(0.98)} }
        @keyframes ph-t1 { 0%,100%{transform:scaleY(1) skewX(0) translateY(0)} 50%{transform:scaleY(1.18) skewX(-4deg) translateY(5px)} }
        @keyframes ph-t2 { 0%,100%{transform:scaleY(1) skewX(0) translateY(0)} 50%{transform:scaleY(1.22) skewX(4deg) translateY(5px)} }
        @keyframes ph-t3 { 0%,100%{transform:scaleY(1) translateY(0)} 50%{transform:scaleY(1.28) translateY(8px)} }
        @keyframes ph-crown { 0%,100%{transform:scaleY(1);opacity:1} 50%{transform:scaleY(1.4);opacity:0.45} }
        @keyframes ph-wtl { 0%,100%{transform:scale(1);opacity:0.8} 50%{transform:scale(1.3) translate(-4px,-6px);opacity:0.3} }
        @keyframes ph-wtr { 0%,100%{transform:scale(1);opacity:0.8} 50%{transform:scale(1.3) translate(4px,-6px);opacity:0.3} }
        @keyframes ph-vortex { 0%,100%{opacity:0;transform:translate(-50%,-50%) scale(0.2)} 50%{opacity:0.85;transform:translate(-50%,-50%) scale(1.3)} }
        @keyframes ph-feather { 0%{opacity:0;transform:rotate(var(--ph-frot,0deg)) translateY(0) translateX(0)} 15%{opacity:0.4} 85%{opacity:0.15} 100%{opacity:0;transform:rotate(var(--ph-frot,0deg)) translateY(-200px) translateX(var(--ph-fdrift,0px))} }
        @keyframes ph-spark { 0%{transform:translate(0,0) scale(1);opacity:0} 10%{opacity:1} 100%{transform:translate(var(--ph-sx,20px),var(--ph-sy,-20px)) scale(0);opacity:0} }
        @keyframes ph-eS { 0%{opacity:0.9;transform:translateY(0) translateX(0)} 100%{opacity:0;transform:translateY(-300px) translateX(var(--dr))} }
        @keyframes ph-eM { 0%{opacity:0.75;transform:translateY(0) translateX(0)} 30%{opacity:0.55} 100%{opacity:0;transform:translateY(-400px) translateX(var(--dr))} }
        @keyframes ph-eL { 0%{opacity:0.6;transform:translateY(0) translateX(0)} 40%{opacity:0.4} 100%{opacity:0;transform:translateY(-500px) translateX(var(--dr))} }
        @keyframes ph-pool { 0%,100%{transform:scaleX(1) scaleY(1);opacity:1} 50%{transform:scaleX(1.25) scaleY(1.4);opacity:0.65} }
        @keyframes ph-flicker { 0%{opacity:0.6} 20%{opacity:0.9} 40%{opacity:0.5} 60%{opacity:1} 80%{opacity:0.7} 100%{opacity:0.55} }
      `}</style>
    </Shell>
  );
}

/* ── Retro Arcade: CRT scanlines, pixel characters, neon glow, arcade cabinets ── */
function RetroArcadeBg() {
  const starsBack = (() => {
    const rand = seededRand(800);
    return Array.from({ length: 30 }, () => ({
      x: rand() * 100, y: rand() * 100,
      size: 0.5 + rand() * 1,
      dur: 2 + rand() * 4,
      delay: rand() * 6,
    }));
  })();
  const starsFront = (() => {
    const rand = seededRand(799);
    return Array.from({ length: 20 }, () => ({
      x: rand() * 100, y: rand() * 100,
      size: 1 + rand() * 2,
      dur: 1 + rand() * 2.5,
      delay: rand() * 4,
      color: rand() < 0.3 ? '#ff88ff' : rand() < 0.6 ? '#88ffff' : '#ffffff',
    }));
  })();

  const invaders = (() => {
    const rand = seededRand(801);
    const types: ('crab' | 'squid' | 'octo')[] = ['crab', 'squid', 'octo'];
    return Array.from({ length: 12 }, (_, i) => ({
      x: 3 + (i % 6) * 16 + rand() * 3,
      y: 4 + Math.floor(i / 6) * 12 + rand() * 2,
      type: types[i % 3],
      dur: 3.5 + rand() * 3.5,
      delay: rand() * 5,
      color: i % 3 === 0 ? '#00ff88' : i % 3 === 1 ? '#ff00ff' : '#00ffff',
    }));
  })();

  const ghosts = (() => {
    const rand = seededRand(802);
    const colors = ['#ff0000', '#ffb8ff', '#00ffff', '#ffb852'];
    return Array.from({ length: 4 }, (_, i) => ({
      x: 5 + rand() * 85,
      y: 45 + rand() * 40,
      color: colors[i],
      dur: 14 + rand() * 12,
      delay: rand() * 10,
      dir: rand() > 0.5 ? 1 : -1,
    }));
  })();

  const coins = (() => {
    const rand = seededRand(803);
    return Array.from({ length: 15 }, () => ({
      x: rand() * 100,
      dur: 3.5 + rand() * 4.5,
      delay: rand() * 18,
      size: 5 + rand() * 7,
    }));
  })();

  const cabinets = (() => {
    const rand = seededRand(804);
    return Array.from({ length: 6 }, (_, i) => ({
      x: 2 + i * 17 + rand() * 5,
      h: 30 + rand() * 18,
      w: 8 + rand() * 5,
      screenColor: ['#00ff88', '#ff00ff', '#00ffff', '#ffff00', '#ff6600', '#88ff00'][i],
      flicker: 1.5 + rand() * 3,
    }));
  })();

  const tetris = (() => {
    const rand = seededRand(806);
    const colors = ['#00ffff', '#ffff00', '#ff00ff', '#00ff00', '#ff6600', '#ff0000', '#0088ff'];
    const shapes: number[][][] = [
      [[1,1,1,1]], [[1,1],[1,1]], [[0,1,0],[1,1,1]], [[1,0],[1,0],[1,1]], [[0,1],[0,1],[1,1]],
      [[1,1,0],[0,1,1]], [[0,1,1],[1,1,0]],
    ];
    return Array.from({ length: 12 }, () => {
      const si = Math.floor(rand() * shapes.length);
      return {
        x: rand() * 92,
        shape: shapes[si]!,
        color: colors[Math.floor(rand() * colors.length)],
        dur: 8 + rand() * 14,
        delay: rand() * 22,
        rot: Math.floor(rand() * 4) * 90,
      };
    });
  })();

  const lasers = (() => {
    const rand = seededRand(807);
    return Array.from({ length: 10 }, () => ({
      x: 8 + rand() * 84,
      dur: 0.5 + rand() * 0.7,
      delay: rand() * 14,
      color: rand() < 0.5 ? '#00ff88' : '#ff4444',
    }));
  })();

  const powerups = (() => {
    const rand = seededRand(808);
    const types = ['cherry', 'star', 'mushroom', 'heart'];
    const colors = ['#ff0040', '#ffff00', '#ff6600', '#ff4488'];
    return Array.from({ length: 8 }, (_, i) => ({
      x: 10 + rand() * 80,
      y: 20 + rand() * 60,
      type: types[i % 4],
      color: colors[i % 4],
      dur: 5 + rand() * 6,
      delay: rand() * 16,
      size: 10 + rand() * 6,
    }));
  })();

  const explosions = (() => {
    const rand = seededRand(809);
    return Array.from({ length: 6 }, () => ({
      x: 10 + rand() * 80,
      y: 10 + rand() * 60,
      dur: 4 + rand() * 6,
      delay: rand() * 18,
      particles: Array.from({ length: 8 }, () => ({
        angle: rand() * 360,
        dist: 15 + rand() * 30,
        size: 1.5 + rand() * 2,
        color: rand() < 0.33 ? '#ffff00' : rand() < 0.66 ? '#ff6600' : '#ff0000',
      })),
    }));
  })();

  const mazeWalls = (() => {
    const rand = seededRand(810);
    const walls: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (let i = 0; i < 20; i++) {
      const x = 5 + rand() * 90;
      const y = 40 + rand() * 55;
      const horiz = rand() > 0.5;
      const len = 5 + rand() * 15;
      walls.push({
        x1: x, y1: y,
        x2: horiz ? x + len : x,
        y2: horiz ? y : y + len * 0.6,
      });
    }
    return walls;
  })();

  const snake = (() => {
    const rand = seededRand(811);
    const segs: { x: number; y: number }[] = [];
    let sx = 5 + rand() * 30;
    let sy = 35 + rand() * 20;
    for (let i = 0; i < 12; i++) {
      segs.push({ x: sx, y: sy });
      if (rand() > 0.5) sx += 1.5; else sy += 1.2;
    }
    return { segs, dur: 18 + rand() * 10, delay: rand() * 5 };
  })();

  return (
    <Shell>
      {/* Deep space gradient */}
      <div class="absolute inset-0" style={{
        background: 'radial-gradient(ellipse at 50% 40%, rgba(20,8,50,0.35) 0%, rgba(4,4,16,0.15) 50%, transparent 100%)',
      }} />

      {/* Parallax star layers */}
      {starsBack.map((s, i) => (
        <div class="absolute"
          style={{ left: `${s.x}%`, top: `${s.y}%`,
            width: `${s.size}px`, height: `${s.size}px`,
            background: '#888',
            animation: `rc-twinkle ${s.dur}s ease-in-out ${s.delay}s infinite`,
          }} />
      ))}
      {starsFront.map((s, i) => (
        <div class="absolute"
          style={{ left: `${s.x}%`, top: `${s.y}%`,
            width: `${s.size}px`, height: `${s.size}px`,
            background: s.color,
            'box-shadow': `0 0 4px ${s.color}80`,
            animation: `rc-twinkle ${s.dur}s ease-in-out ${s.delay}s infinite`,
          }} />
      ))}

      {/* Pixel grid overlay */}
      <div class="absolute inset-0" style={{
        'background-image': `
          linear-gradient(rgba(0,255,100,0.015) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,255,100,0.015) 1px, transparent 1px)`,
        'background-size': '12px 12px',
      }} />

      {/* Neon floor reflection at bottom */}
      <div class="absolute bottom-0 left-0 right-0 h-[12%]" style={{
        background: 'linear-gradient(to top, rgba(255,0,255,0.06), rgba(0,255,255,0.03) 50%, transparent)',
        filter: 'blur(8px)',
      }} />
      <div class="absolute bottom-0 left-0 right-0 h-[3%]" style={{
        background: 'linear-gradient(90deg, transparent 5%, rgba(255,0,255,0.08) 20%, rgba(0,255,255,0.06) 40%, rgba(0,255,136,0.07) 60%, rgba(255,255,0,0.05) 80%, transparent 95%)',
        filter: 'blur(4px)',
        animation: 'rc-floorpulse 4s ease-in-out infinite',
      }} />

      {/* SVG layer — invaders, pac-man, pong, maze, snake, spaceship */}
      <svg class="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
        <defs />

        {/* Space Invaders — 3 rows of 8 */}
        {invaders.map((inv, i) => {
          const p = 0.7;
          const pixels: [number, number][] = inv.type === 'crab'
            ? [[2,0],[5,0],[0,1],[2,1],[3,1],[4,1],[5,1],[7,1],[0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],[0,3],[1,3],[3,3],[4,3],[6,3],[7,3],[0,4],[1,4],[2,4],[3,4],[4,4],[5,4],[6,4],[7,4],[1,5],[2,5],[5,5],[6,5],[0,6],[2,6],[5,6],[7,6]]
            : inv.type === 'squid'
            ? [[3,0],[0,1],[2,1],[3,1],[4,1],[6,1],[0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[0,3],[1,3],[2,3],[3,3],[4,3],[5,3],[6,3],[1,4],[2,4],[4,4],[5,4],[0,5],[1,5],[5,5],[6,5],[1,6],[5,6]]
            : [[3,0],[1,1],[3,1],[5,1],[0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[0,3],[2,3],[4,3],[6,3],[0,4],[1,4],[2,4],[3,4],[4,4],[5,4],[6,4],[2,5],[4,5],[0,6],[1,6],[5,6],[6,6]];
          return (
            <g              style={{ animation: `rc-invader ${inv.dur}s ease-in-out ${inv.delay}s infinite` }}>
              {pixels.map(([px, py], pi) => (
                <rect x={inv.x + px * p} y={inv.y + py * p}
                  width={p} height={p} fill={inv.color} opacity="0.45" />
              ))}
            </g>
          );
        })}

        {/* Player spaceship at bottom */}
        <g style={{ animation: 'rc-ship 10s ease-in-out infinite' }}>
          {/* Ship body */}
          {([[3,0],[2,1],[3,1],[4,1],[1,2],[2,2],[3,2],[4,2],[5,2],[0,3],[1,3],[2,3],[3,3],[4,3],[5,3],[6,3]] as [number, number][]).map(([px,py], pi) => (
            <rect x={46 + px * 0.6} y={92 + py * 0.6}
              width="0.6" height="0.6" fill="#00ff88" opacity="0.5" />
          ))}
        </g>

        {/* Pac-Man chomping across */}
        <g style={{ animation: 'rc-pacmove 14s linear infinite' }}>
          <circle cx="0" cy="68" r="2.2" fill="#ffff00" opacity="0.5" />
          <path d="M0 68 L2.2 66.5 L2.2 69.5Z" fill="rgba(4,6,16,0.95)"
            style={{ animation: 'rc-chomp 0.25s step-end infinite' }} />
        </g>
        {/* Pac dot trail */}
        {Array.from({ length: 20 }, (_, i) => (
          <rect x={5 + i * 4.8} y="67.6" width="0.8" height="0.8"
            fill="#ffff00" opacity="0.12" />
        ))}
        {/* Power pellets */}
        {[20, 55, 85].map((x, i) => (
          <circle cx={x} cy="68" r="1" fill="#ffff00" opacity="0.2"
            style={{ animation: `rc-twinkle 1.5s ease-in-out ${i * 0.5}s infinite` }} />
        ))}

        {/* Pong game — left side */}
        <rect x="2" y="42" width="0.8" height="6" fill="#ffffff" opacity="0.15"
          style={{ animation: 'rc-paddle-l 4s ease-in-out infinite' }} />
        <rect x="97.2" y="44" width="0.8" height="6" fill="#ffffff" opacity="0.15"
          style={{ animation: 'rc-paddle-r 3.5s ease-in-out infinite' }} />
        <rect x="49.5" y="44" width="1" height="1" fill="#ffffff" opacity="0.2"
          style={{ animation: 'rc-pongball 3s linear infinite' }} />
        {/* Pong center line */}
        {Array.from({ length: 10 }, (_, i) => (
          <rect x="49.8" y={38 + i * 3} width="0.4" height="1.5"
            fill="#ffffff" opacity="0.05" />
        ))}

        {/* Maze walls — pac-man style */}
        {mazeWalls.map((w, i) => (
          <line x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2}
            stroke="#0044ff" stroke-width="0.4" opacity="0.12"
            stroke-linecap="round" />
        ))}

        {/* Snake game */}
        <g style={{ animation: `rc-snakemove ${snake.dur}s ease-in-out ${snake.delay}s infinite` }}>
          {snake.segs.map((seg, i) => (
            <rect x={seg.x} y={seg.y} width="1.2" height="1.2"
              fill={i === 0 ? '#88ff00' : '#44cc00'} opacity={0.3 - i * 0.015}
              rx="0.1" />
          ))}
          {/* Apple */}
          <circle cx={snake.segs[0]!.x + 8} cy={snake.segs[0]!.y} r="0.7"
            fill="#ff0040" opacity="0.35" />
        </g>
      </svg>

      {/* Pac-Man ghosts */}
      {ghosts.map((g, i) => (
        <svg class="absolute" viewBox="0 0 14 16"
          style={{
            left: `${g.x}%`, top: `${g.y}%`,
            width: '24px', height: '28px',
            filter: `drop-shadow(0 0 8px ${g.color}50)`,
            animation: `rc-ghost ${g.dur}s ease-in-out ${g.delay}s infinite`,
            ['--rc-gdir' as string]: `${g.dir * 250}px`,
            opacity: 0,
          }}>
          <path d="M1 14 L1 5 Q1 1 7 1 Q13 1 13 5 L13 14 L11 12 L9 14 L7 12 L5 14 L3 12Z"
            fill={g.color} opacity="0.4" />
          <rect x="3" y="5" width="3" height="3" fill="white" opacity="0.55" rx="0.5" />
          <rect x="8" y="5" width="3" height="3" fill="white" opacity="0.55" rx="0.5" />
          <rect x={g.dir > 0 ? '5' : '3'} y="6" width="1.5" height="1.5" fill="#111" opacity="0.6" />
          <rect x={g.dir > 0 ? '10' : '8'} y="6" width="1.5" height="1.5" fill="#111" opacity="0.6" />
        </svg>
      ))}

      {/* Falling Tetris pieces */}
      {tetris.map((t, i) => (
        <div class="absolute" style={{
          left: `${t.x}%`, top: '-5%',
          transform: `rotate(${t.rot}deg)`,
          animation: `rc-tetfall ${t.dur}s linear ${t.delay}s infinite`,
          opacity: 0,
        }}>
          {t.shape.map((row, ri) =>
            row.map((cell, ci) => cell ? (
              <div class="absolute"
                style={{
                  left: `${ci * 7}px`, top: `${ri * 7}px`,
                  width: '6px', height: '6px',
                  background: t.color,
                  opacity: 0.18,
                  border: `1px solid ${t.color}35`,
                  'box-shadow': `0 0 3px ${t.color}25`,
                }} />
            ) : null)
          )}
        </div>
      ))}

      {/* Power-ups floating */}
      {powerups.map((p, i) => (
        <div class="absolute" style={{
          left: `${p.x}%`, top: `${p.y}%`,
          width: `${p.size}px`, height: `${p.size}px`,
          opacity: 0,
          animation: `rc-powerup ${p.dur}s ease-in-out ${p.delay}s infinite`,
        }}>
          <svg viewBox="0 0 16 16" width="100%" height="100%">
            {p.type === 'cherry' && <>
              <circle cx="6" cy="12" r="3.5" fill="#ff0040" opacity="0.4" />
              <circle cx="11" cy="10" r="3" fill="#ff0040" opacity="0.35" />
              <path d="M6 8 Q8 2 11 7" fill="none" stroke="#00cc00" stroke-width="1" opacity="0.3" />
            </>}
            {p.type === 'star' && <path d="M8 1 L10 6 L15 6 L11 9 L13 14 L8 11 L3 14 L5 9 L1 6 L6 6Z"
              fill="#ffff00" opacity="0.3" />}
            {p.type === 'mushroom' && <>
              <ellipse cx="8" cy="7" rx="6" ry="5" fill="#ff0000" opacity="0.35" />
              <circle cx="5" cy="6" r="1.5" fill="white" opacity="0.25" />
              <circle cx="11" cy="6" r="1.5" fill="white" opacity="0.25" />
              <rect x="6" y="11" width="4" height="4" fill="#ffe0a0" opacity="0.3" rx="1" />
            </>}
            {p.type === 'heart' && <path d="M8 14 Q2 9 2 5 Q2 2 5 2 Q7 2 8 4 Q9 2 11 2 Q14 2 14 5 Q14 9 8 14Z"
              fill="#ff4488" opacity="0.35" />}
          </svg>
        </div>
      ))}

      {/* Pixel explosion bursts */}
      {explosions.map((ex, ei) => (
        <div class="absolute" style={{
          left: `${ex.x}%`, top: `${ex.y}%`, width: 0, height: 0,
        }}>
          {ex.particles.map((p, pi) => (
            <div class="absolute"
              style={{
                width: `${p.size}px`, height: `${p.size}px`,
                background: p.color,
                'box-shadow': `0 0 4px ${p.color}60`,
                opacity: 0,
                animation: `rc-explode ${ex.dur}s ease-out ${ex.delay}s infinite`,
                ['--rc-ex' as string]: `${Math.cos(p.angle * Math.PI / 180) * p.dist}px`,
                ['--rc-ey' as string]: `${Math.sin(p.angle * Math.PI / 180) * p.dist}px`,
              }} />
          ))}
        </div>
      ))}

      {/* Arcade cabinet silhouettes */}
      {cabinets.map((cab, i) => (
        <div class="absolute bottom-0"
          style={{ left: `${cab.x}%`, width: `${cab.w}%`, height: `${cab.h}%` }}>
          <div class="absolute inset-0" style={{
            background: 'linear-gradient(to top, rgba(8,8,22,0.85), rgba(12,12,30,0.65) 65%, rgba(16,16,38,0.4) 82%, transparent)',
            'clip-path': 'polygon(8% 100%, 3% 28%, 12% 0%, 88% 0%, 97% 28%, 92% 100%)',
          }} />
          <div class="absolute" style={{
            left: '18%', right: '18%', top: '6%', height: '32%',
            background: cab.screenColor,
            opacity: 0.07,
            'box-shadow': `0 0 25px ${cab.screenColor}25, 0 0 50px ${cab.screenColor}10`,
            animation: `rc-screen ${cab.flicker}s step-end infinite`,
          }} />
          <div class="absolute" style={{
            left: '18%', right: '18%', top: '6%', height: '32%',
            'background-image': 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.12) 2px, rgba(0,0,0,0.12) 3px)',
            opacity: 0.5,
          }} />
          {/* Marquee glow at top */}
          <div class="absolute" style={{
            left: '15%', right: '15%', top: '1%', height: '4%',
            background: cab.screenColor,
            opacity: 0.04,
            filter: 'blur(3px)',
            animation: `rc-twinkle ${cab.flicker * 1.5}s ease-in-out infinite`,
          }} />
          {/* Joystick dot */}
          <div class="absolute" style={{
            left: '40%', top: '52%', width: '8%', height: '4%',
            'border-radius': '50%',
            background: 'rgba(200,200,200,0.08)',
          }} />
          {/* Buttons */}
          {[55, 63, 71].map((bx, bi) => (
            <div class="absolute" style={{
              left: `${bx}%`, top: '53%', width: '6%', height: '3%',
              'border-radius': '50%',
              background: ['rgba(255,0,0,0.1)', 'rgba(0,100,255,0.08)', 'rgba(255,255,0,0.07)'][bi],
            }} />
          ))}
          <div class="absolute" style={{
            left: '40%', width: '20%', top: '70%', height: '2.5%',
            background: 'rgba(80,80,80,0.12)',
            'border-radius': '2px',
          }} />
        </div>
      ))}

      {/* Laser shots */}
      {lasers.map((l, i) => (
        <div class="absolute"
          style={{
            left: `${l.x}%`, bottom: '0', width: '2px', height: '14px',
            background: `linear-gradient(to top, ${l.color}, ${l.color}88)`,
            'box-shadow': `0 0 6px ${l.color}50, 0 0 14px ${l.color}20`,
            animation: `rc-laser ${l.dur}s linear ${l.delay}s infinite`,
            opacity: 0,
          }} />
      ))}

      {/* Falling coins with spin */}
      {coins.map((c, i) => (
        <div class="absolute"
          style={{
            left: `${c.x}%`, top: '-4%',
            width: `${c.size}px`, height: `${c.size}px`,
            'border-radius': '50%',
            background: 'linear-gradient(135deg, #ffd700, #ffaa00, #ffd700)',
            border: '1px solid rgba(255,200,0,0.25)',
            'box-shadow': '0 0 10px rgba(255,215,0,0.25), inset 0 0 3px rgba(255,255,200,0.25)',
            animation: `rc-coin ${c.dur}s ease-in ${c.delay}s infinite`,
            opacity: 0,
          }} />
      ))}

      {/* HUD elements */}
      <div class="absolute top-[2%] left-[50%] -translate-x-1/2" style={{
        'font-family': '"Courier New", monospace', 'font-size': '9px', 'letter-spacing': '4px',
        color: '#ff0000', opacity: 0.07,
        'text-shadow': '0 0 8px #ff000030',
        animation: 'rc-blink 1.5s step-end infinite',
      }}>HIGH SCORE</div>

      <div class="absolute top-[5%] left-[50%] -translate-x-1/2" style={{
        'font-family': '"Courier New", monospace', 'font-size': '7px', 'letter-spacing': '2px',
        color: '#ffffff', opacity: 0.05,
      }}>99999</div>

      {/* Lives indicator — 3 small ships */}
      <div class="absolute top-[2.5%] left-[5%] flex gap-[4px]">
        {[0,1,2].map(i => (
          <div style={{
            width: '6px', height: '6px',
            'clip-path': 'polygon(50% 0%, 0% 100%, 100% 100%)',
            background: '#00ff88', opacity: 0.08,
          }} />
        ))}
      </div>

      {/* Level indicator */}
      <div class="absolute top-[2.5%] right-[5%]" style={{
        'font-family': '"Courier New", monospace', 'font-size': '6px', 'letter-spacing': '1px',
        color: '#00ffff', opacity: 0.06,
      }}>LVL 42</div>

      {/* Health bar */}
      <div class="absolute top-[8%] left-[5%]" style={{
        width: '40px', height: '4px',
        background: 'rgba(255,0,0,0.06)',
        border: '1px solid rgba(255,255,255,0.04)',
      }}>
        <div style={{
          width: '75%', height: '100%',
          background: 'linear-gradient(90deg, #ff0000, #ffff00)',
          opacity: 0.3,
        }} />
      </div>

      <div class="absolute bottom-[3%] left-[50%] -translate-x-1/2" style={{
        'font-family': '"Courier New", monospace', 'font-size': '8px', 'letter-spacing': '3px',
        color: '#00ff88', opacity: 0.06,
        'text-shadow': '0 0 10px #00ff8830',
        animation: 'rc-blink 1s step-end infinite',
      }}>INSERT COIN</div>

      {/* "GAME OVER" — occasional flash */}
      <div class="absolute top-[45%] left-[50%] -translate-x-1/2" style={{
        'font-family': '"Courier New", monospace', 'font-size': '14px', 'letter-spacing': '6px',
        color: '#ff0000', opacity: 0,
        'text-shadow': '0 0 15px #ff000040, 0 0 30px #ff000020',
        animation: 'rc-gameover 20s step-end infinite',
      }}>GAME OVER</div>

      {/* CRT scanline overlay */}
      <div class="absolute inset-0 pointer-events-none" style={{
        'background-image': 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.05) 2px, rgba(0,0,0,0.05) 4px)',
        animation: 'rc-scanroll 6s linear infinite',
      }} />

      {/* Horizontal CRT interference line */}
      <div class="absolute left-0 right-0 h-[2px]" style={{
        background: 'rgba(255,255,255,0.03)',
        animation: 'rc-hline 4s linear infinite',
      }} />

      {/* CRT vignette */}
      <div class="absolute inset-0" style={{
        background: 'radial-gradient(ellipse at 50% 50%, transparent 45%, rgba(0,0,0,0.3) 100%)',
      }} />

      {/* Neon border glow — all 4 edges */}
      <div class="absolute top-0 left-0 bottom-0 w-[2px]" style={{
        background: 'linear-gradient(to bottom, transparent 8%, rgba(255,0,255,0.12) 25%, rgba(0,255,255,0.1) 50%, rgba(0,255,136,0.08) 75%, transparent 92%)',
        'box-shadow': '2px 0 15px rgba(255,0,255,0.04)',
      }} />
      <div class="absolute top-0 right-0 bottom-0 w-[2px]" style={{
        background: 'linear-gradient(to bottom, transparent 8%, rgba(0,255,255,0.12) 25%, rgba(255,0,255,0.1) 50%, rgba(0,255,136,0.08) 75%, transparent 92%)',
        'box-shadow': '-2px 0 15px rgba(0,255,255,0.04)',
      }} />
      <div class="absolute top-0 left-0 right-0 h-[2px]" style={{
        background: 'linear-gradient(to right, transparent 8%, rgba(255,0,255,0.08) 30%, rgba(0,255,255,0.06) 70%, transparent 92%)',
        'box-shadow': '0 2px 12px rgba(255,0,255,0.03)',
      }} />
      <div class="absolute bottom-0 left-0 right-0 h-[2px]" style={{
        background: 'linear-gradient(to right, transparent 8%, rgba(0,255,136,0.1) 30%, rgba(255,0,255,0.07) 70%, transparent 92%)',
        'box-shadow': '0 -2px 12px rgba(0,255,136,0.04)',
      }} />

      {/* Ambient neon glow clouds */}
      <div class="absolute top-[15%] left-[12%] w-[min(220px,22vw)] h-[min(220px,22vh)] rounded-full"
        style={{ background: 'radial-gradient(ellipse, rgba(255,0,255,0.045), transparent 60%)', filter: 'blur(35px)', animation: 'rc-glow1 7s ease-in-out infinite' }} />
      <div class="absolute top-[35%] right-[8%] w-[min(280px,25vw)] h-[min(280px,25vh)] rounded-full"
        style={{ background: 'radial-gradient(ellipse, rgba(0,255,255,0.04), transparent 60%)', filter: 'blur(40px)', animation: 'rc-glow1 9s ease-in-out 2.5s infinite' }} />
      <div class="absolute bottom-[20%] left-[35%] w-[min(200px,20vw)] h-[min(200px,20vh)] rounded-full"
        style={{ background: 'radial-gradient(ellipse, rgba(0,255,136,0.04), transparent 60%)', filter: 'blur(30px)', animation: 'rc-glow1 6s ease-in-out 4.5s infinite' }} />
      <div class="absolute top-[60%] left-[60%] w-[min(160px,16vw)] h-[min(160px,16vh)] rounded-full"
        style={{ background: 'radial-gradient(ellipse, rgba(255,255,0,0.025), transparent 60%)', filter: 'blur(25px)', animation: 'rc-glow1 8s ease-in-out 6s infinite' }} />

      {/* CRT flicker */}
      <div class="absolute inset-0" style={{
        animation: 'rc-crtflick 5s step-end infinite',
        background: 'rgba(255,255,255,0.012)',
        opacity: 0,
      }} />

      <style>{`
        @keyframes rc-twinkle { 0%,100%{opacity:0.15} 50%{opacity:0.65} }
        @keyframes rc-invader { 0%,100%{transform:translateX(0)} 25%{transform:translateX(6px)} 50%{transform:translateX(0)} 75%{transform:translateX(-6px)} }
        @keyframes rc-ship { 0%,100%{transform:translateX(0)} 25%{transform:translateX(12px)} 75%{transform:translateX(-12px)} }
        @keyframes rc-pacmove { 0%{transform:translateX(-5%)} 100%{transform:translateX(105%)} }
        @keyframes rc-chomp { 0%,49%{opacity:1} 50%,100%{opacity:0} }
        @keyframes rc-ghost { 0%{opacity:0;transform:translateX(0)} 6%{opacity:0.55} 94%{opacity:0.35} 100%{opacity:0;transform:translateX(var(--rc-gdir,120px))} }
        @keyframes rc-tetfall { 0%{opacity:0;transform:translateY(0)} 3%{opacity:0.22} 97%{opacity:0.1} 100%{opacity:0;transform:translateY(115vh)} }
        @keyframes rc-laser { 0%{opacity:0;bottom:0} 5%{opacity:0.6} 95%{opacity:0.4} 100%{opacity:0;bottom:100%} }
        @keyframes rc-coin { 0%{opacity:0;transform:translateY(0) rotateY(0deg)} 6%{opacity:0.3} 92%{opacity:0.15} 100%{opacity:0;transform:translateY(110vh) rotateY(1440deg)} }
        @keyframes rc-screen { 0%{opacity:0.07} 25%{opacity:0.09} 50%{opacity:0.04} 75%{opacity:0.08} 100%{opacity:0.07} }
        @keyframes rc-blink { 0%,49%{opacity:inherit} 50%,100%{opacity:0} }
        @keyframes rc-scanroll { 0%{background-position:0 0} 100%{background-position:0 80px} }
        @keyframes rc-hline { 0%{top:-2%} 100%{top:102%} }
        @keyframes rc-glow1 { 0%,100%{opacity:0.65;transform:scale(1)} 50%{opacity:1;transform:scale(1.12)} }
        @keyframes rc-crtflick { 0%,96%{opacity:0} 96.5%{opacity:1} 97%{opacity:0} 97.5%{opacity:0.6} 98%{opacity:0} }
        @keyframes rc-powerup { 0%{opacity:0;transform:scale(0.5)} 15%{opacity:0.5;transform:scale(1.1)} 50%{opacity:0.4;transform:scale(1) translateY(-8px)} 85%{opacity:0.3;transform:scale(0.9)} 100%{opacity:0;transform:scale(0.4)} }
        @keyframes rc-explode { 0%{opacity:0;transform:translate(0,0) scale(1)} 8%{opacity:0.8} 100%{opacity:0;transform:translate(var(--rc-ex,15px),var(--rc-ey,-15px)) scale(0)} }
        @keyframes rc-paddle-l { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
        @keyframes rc-paddle-r { 0%,100%{transform:translateY(0)} 50%{transform:translateY(3px)} }
        @keyframes rc-pongball { 0%{transform:translate(0,0)} 25%{transform:translate(20px,-3px)} 50%{transform:translate(0,2px)} 75%{transform:translate(-20px,-2px)} 100%{transform:translate(0,0)} }
        @keyframes rc-snakemove { 0%,100%{transform:translate(0,0)} 50%{transform:translate(15px,5px)} }
        @keyframes rc-floorpulse { 0%,100%{opacity:0.7} 50%{opacity:1} }
        @keyframes rc-gameover { 0%,92%{opacity:0} 93%{opacity:0.06} 93.5%{opacity:0} 94%{opacity:0.05} 94.5%{opacity:0} 95%{opacity:0.07} 96%{opacity:0} }
      `}</style>
    </Shell>
  );
}

/* ── Starfield: Deep space with dense twinkling stars, nebulae, shooting stars ── */
function StarfieldBg() {
  const stars = (() => {
    const rand = seededRand(555);
    return Array.from({ length: 60 }, () => ({
      x: rand() * 100, y: rand() * 100,
      size: 0.4 + rand() * 2.8,
      opacity: 0.15 + rand() * 0.65,
      dur: 1.5 + rand() * 4,
      delay: rand() * 8,
      bright: rand() < 0.18,
      color: rand() < 0.3 ? '180,200,255' : rand() < 0.5 ? '220,200,255' : '199,210,254',
    }));
  })();

  const driftStars = (() => {
    const rand = seededRand(666);
    return Array.from({ length: 25 }, () => ({
      x: rand() * 100, y: rand() * 100,
      size: 0.8 + rand() * 1.5,
      opacity: 0.2 + rand() * 0.4,
      driftX: -20 + rand() * 40,
      driftY: -15 + rand() * 30,
      dur: 20 + rand() * 40,
      delay: rand() * 20,
    }));
  })();

  const shootingStars = (() => {
    const rand = seededRand(777);
    return Array.from({ length: 8 }, (_, i) => ({
      x: 5 + rand() * 90, y: 3 + rand() * 50,
      angle: -20 - rand() * 30,
      dur: 8 + rand() * 14,
      delay: i * 5 + rand() * 4,
      len: 80 + rand() * 140,
    }));
  })();

  const constellations = (() => {
    const rand = seededRand(333);
    const lines: { x1: number; y1: number; x2: number; y2: number; opacity: number; dur: number; delay: number }[] = [];
    const pts = Array.from({ length: 18 }, () => ({ x: rand() * 90 + 5, y: rand() * 90 + 5 }));
    for (let i = 0; i < pts.length - 1; i++) {
      const dx = pts[i]!.x - pts[i + 1]!.x;
      const dy = pts[i]!.y - pts[i + 1]!.y;
      if (Math.sqrt(dx * dx + dy * dy) < 28) {
        lines.push({ x1: pts[i]!.x, y1: pts[i]!.y, x2: pts[i + 1]!.x, y2: pts[i + 1]!.y, opacity: 0.06 + rand() * 0.1, dur: 6 + rand() * 10, delay: rand() * 8 });
      }
    }
    return lines;
  })();

  return (
    <Shell>
      <div class="absolute inset-0" style={{
        background: 'radial-gradient(ellipse at 25% 35%, rgba(99,102,241,0.1) 0%, transparent 50%), radial-gradient(ellipse at 75% 65%, rgba(139,92,246,0.08) 0%, transparent 50%), radial-gradient(ellipse at 50% 80%, rgba(59,130,246,0.06) 0%, transparent 40%)',
      }} />

      <div class="absolute w-[min(550px,50vw)] h-[min(450px,45vh)] top-[8%] left-[3%] rounded-full"
        style={{ background: 'radial-gradient(ellipse, rgba(99,102,241,0.12), rgba(139,92,246,0.06) 40%, transparent 65%)', filter: 'blur(50px)', animation: 'sf-nebula1 20s ease-in-out infinite' }} />
      <div class="absolute w-[min(450px,45vw)] h-[min(400px,40vh)] bottom-[12%] right-[8%] rounded-full"
        style={{ background: 'radial-gradient(ellipse, rgba(167,139,250,0.1), rgba(129,140,248,0.05) 45%, transparent 65%)', filter: 'blur(45px)', animation: 'sf-nebula2 18s ease-in-out 3s infinite' }} />
      <div class="absolute w-[min(300px,35vw)] h-[min(250px,30vh)] top-[50%] left-[40%] rounded-full"
        style={{ background: 'radial-gradient(ellipse, rgba(59,130,246,0.08), transparent 60%)', filter: 'blur(40px)', animation: 'sf-nebula3 24s ease-in-out 7s infinite' }} />

      <svg class="absolute inset-0 w-full h-full">
        {constellations.map((l, i) => (
          <line x1={`${l.x1}%`} y1={`${l.y1}%`} x2={`${l.x2}%`} y2={`${l.y2}%`}
            stroke="rgba(199,210,254,0.08)" stroke-width="0.5"
            style={{ animation: `sf-constell ${l.dur}s ease-in-out ${l.delay}s infinite` }} />
        ))}
        {stars.map((s, i) => (
          <circle cx={`${s.x}%`} cy={`${s.y}%`} r={s.size}
            fill={s.bright ? `rgba(${s.color},0.95)` : `rgba(${s.color},0.8)`}
            opacity={s.opacity}
            style={{
              animation: `sf-twinkle ${s.dur}s ease-in-out ${s.delay}s infinite`,
              filter: s.bright ? `drop-shadow(0 0 4px rgba(${s.color},0.6))` : undefined,
            }} />
        ))}
        {driftStars.map((d, i) => (
          <circle cx={`${d.x}%`} cy={`${d.y}%`} r={d.size}
            fill="rgba(199,210,254,0.7)" opacity={d.opacity}
            style={{ animation: `sf-drift${i % 3} ${d.dur}s ease-in-out ${d.delay}s infinite` }} />
        ))}
      </svg>

      {shootingStars.map((ss, i) => (
        <div class="absolute" style={{
          left: `${ss.x}%`, top: `${ss.y}%`,
          width: `${ss.len}px`, height: '1.5px',
          background: 'linear-gradient(90deg, transparent, rgba(199,210,254,0.5) 30%, rgba(255,255,255,0.9) 70%, rgba(199,210,254,0.7) 90%, transparent)',
          transform: `rotate(${ss.angle}deg)`,
          animation: `sf-shoot ${ss.dur}s ease-in ${ss.delay}s infinite`,
          opacity: 0,
          'border-radius': '1px',
          'box-shadow': '0 0 6px rgba(199,210,254,0.4)',
        }} />
      ))}

      <div class="absolute inset-0" style={{
        'background-image': `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.25'/%3E%3C/svg%3E")`,
        opacity: 0.04,
      }} />

      <style>{`
        @keyframes sf-twinkle { 0%,100%{opacity:0.1} 25%{opacity:0.7} 50%{opacity:0.05} 75%{opacity:0.5} }
        @keyframes sf-nebula1 { 0%,100%{transform:scale(1) translate(0,0);opacity:0.6} 33%{transform:scale(1.2) translate(3%,-2%);opacity:1} 66%{transform:scale(0.95) translate(-2%,1%);opacity:0.8} }
        @keyframes sf-nebula2 { 0%,100%{transform:scale(1) translate(0,0);opacity:0.5} 40%{transform:scale(1.15) translate(-3%,3%);opacity:0.9} 80%{transform:scale(1.05) translate(2%,-1%);opacity:0.7} }
        @keyframes sf-nebula3 { 0%,100%{transform:scale(0.9) translate(0,0);opacity:0.4} 50%{transform:scale(1.2) translate(5%,-4%);opacity:0.8} }
        @keyframes sf-constell { 0%,100%{opacity:0.3} 30%{opacity:0.9} 60%{opacity:0.15} }
        @keyframes sf-shoot { 0%{opacity:0;transform:rotate(var(--sf-a,-30deg)) translateX(-100px)} 1.5%{opacity:0.9} 4%{opacity:0.3} 6%{opacity:0} 100%{opacity:0} }
        @keyframes sf-drift0 { 0%,100%{transform:translate(0,0);opacity:0.3} 50%{transform:translate(25px,15px);opacity:0.6} }
        @keyframes sf-drift1 { 0%,100%{transform:translate(0,0);opacity:0.25} 50%{transform:translate(-20px,10px);opacity:0.55} }
        @keyframes sf-drift2 { 0%,100%{transform:translate(0,0);opacity:0.2} 50%{transform:translate(15px,-20px);opacity:0.5} }
      `}</style>
    </Shell>
  );
}

/* ── Light: Warm sunlit atmosphere with soft rays and floating motes ── */
function LightBg() {
  const motes = (() => {
    const rand = seededRand(888);
    return Array.from({ length: 30 }, () => ({
      x: rand() * 100, y: rand() * 100,
      size: 1 + rand() * 3,
      dur: 8 + rand() * 15,
      delay: rand() * 12,
    }));
  })();

  return (
    <Shell>
      <div class="absolute inset-0" style={{
        background: 'radial-gradient(ellipse at 50% 0%, rgba(250,204,21,0.08) 0%, transparent 60%)',
      }} />

      {Array.from({ length: 7 }).map((_, i) => (
        <div class="absolute" style={{
          top: 0, left: `${20 + i * 10}%`,
          width: `${3 + (i % 3)}px`, height: '100%',
          background: `linear-gradient(to bottom, rgba(250,204,21,${0.04 + (i % 3) * 0.015}), transparent 70%)`,
          transform: `rotate(${-12 + i * 4}deg)`,
          'transform-origin': 'top center',
          animation: `lt-ray ${8 + i * 2}s ease-in-out ${i * 1.5}s infinite`,
        }} />
      ))}

      <div class="absolute w-[min(400px,40vw)] h-[min(400px,40vh)] -top-[10%] left-[20%] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.1), transparent 55%)', filter: 'blur(50px)', animation: 'lt-orb1 20s ease-in-out infinite' }} />

      <svg class="absolute inset-0 w-full h-full">
        {motes.map((m, i) => (
          <circle cx={`${m.x}%`} cy={`${m.y}%`} r={m.size}
            fill="rgba(251,191,36,0.3)" opacity="0.3"
            style={{ animation: `lt-mote ${m.dur}s ease-in-out ${m.delay}s infinite`, filter: 'blur(0.5px)' }} />
        ))}
      </svg>

      <style>{`
        @keyframes lt-ray { 0%,100%{opacity:0.6;transform:rotate(var(--lt-r,0deg)) scaleX(1)} 50%{opacity:1;transform:rotate(var(--lt-r,0deg)) scaleX(1.3)} }
        @keyframes lt-orb1 { 0%,100%{transform:scale(1);opacity:0.7} 50%{transform:scale(1.2);opacity:1} }
        @keyframes lt-mote { 0%{opacity:0.1;transform:translateY(0)} 50%{opacity:0.5;transform:translateY(-15px)} 100%{opacity:0.1;transform:translateY(0)} }
      `}</style>
    </Shell>
  );
}

/* ── Custom: Subtle grid workshop with tool-inspired accents ── */
function CustomBg() {
  return (
    <Shell>
      <div class="absolute inset-0" style={{
        background: `
          linear-gradient(rgba(129,140,248,0.025) 1px, transparent 1px),
          linear-gradient(90deg, rgba(129,140,248,0.025) 1px, transparent 1px)`,
        'background-size': '40px 40px',
        'mask-image': 'linear-gradient(to bottom, transparent 5%, rgba(0,0,0,0.5) 30%, rgba(0,0,0,0.5) 70%, transparent 95%)',
        '-webkit-mask-image': 'linear-gradient(to bottom, transparent 5%, rgba(0,0,0,0.5) 30%, rgba(0,0,0,0.5) 70%, transparent 95%)',
      }} />

      <div class="absolute w-[min(350px,35vw)] h-[min(350px,35vh)] top-[20%] left-[10%] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(74,222,128,0.06), transparent 55%)', filter: 'blur(40px)', animation: 'cu-glow 18s ease-in-out infinite' }} />
      <div class="absolute w-[min(300px,30vw)] h-[min(300px,30vh)] bottom-[15%] right-[15%] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(129,140,248,0.06), transparent 55%)', filter: 'blur(35px)', animation: 'cu-glow 14s ease-in-out 4s infinite' }} />

      <svg class="absolute inset-0 w-full h-full">
        {[{x:15,y:25,r:18},{x:82,y:70,r:22},{x:50,y:85,r:15}].map((g, i) => (
          <circle cx={`${g.x}%`} cy={`${g.y}%`} r={g.r}
            fill="none" stroke="rgba(129,140,248,0.06)" stroke-width="1"
            stroke-dasharray="4 6"
            style={{ animation: `cu-spin ${20 + i * 5}s linear infinite` }} />
        ))}
      </svg>

      <style>{`
        @keyframes cu-glow { 0%,100%{transform:scale(1);opacity:0.6} 50%{transform:scale(1.15);opacity:1} }
        @keyframes cu-spin { 0%{stroke-dashoffset:0} 100%{stroke-dashoffset:100} }
      `}</style>
    </Shell>
  );
}
