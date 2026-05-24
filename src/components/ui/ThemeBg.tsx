'use client';
import { useEffect, useRef } from 'react';
import type { ThemeName } from '@/types';

function seededRand(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

interface Props { theme: ThemeName; }

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
    case 'phoenix': return <PhoenixBg />;
    case 'retro': return <RetroArcadeBg />;
    case 'starfield': return <StarfieldSimpleBg />;
    case 'light': return <LightBg />;
    case 'custom': return <CustomBg />;
    default: return null;
  }
}

const CANVAS_CLS = 'absolute inset-0 w-full h-full pointer-events-none';
const CANVAS_STYLE: React.CSSProperties = { opacity: 0.75 };

/* ── DarkBear: network nodes + edges + data streams + hexagons ── */
function DarkBearBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const c = canvas;
    const cx = ctx;
    let raf: number;

    interface Node { x: number; y: number; r: number; baseOp: number; phase: number; speed: number; hub: boolean; }
    interface Edge { i: number; j: number; phase: number; speed: number; }
    interface Stream { fromEdge: number; phase: number; speed: number; }
    interface Hex { x: number; y: number; size: number; rot: number; phase: number; speed: number; opacity: number; }

    let nodes: Node[] = [];
    let edges: Edge[] = [];
    let streams: Stream[] = [];
    let hexes: Hex[] = [];

    function build(w: number, h: number) {
      const rand = seededRand(42);
      nodes = Array.from({ length: 28 }, (_, i) => ({
        x: (rand() * 90 + 5) / 100 * w,
        y: (rand() * 90 + 5) / 100 * h,
        r: rand() < 0.15 ? (4 + rand() * 4) : (1.5 + rand() * 2.5),
        baseOp: 0.15 + rand() * 0.45,
        phase: rand() * Math.PI * 2,
        speed: 0.3 + rand() * 0.6,
        hub: i < 6,
      }));
      const rand2 = seededRand(77);
      edges = [];
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = (nodes[i].x - nodes[j].x) / w * 100;
          const dy = (nodes[i].y - nodes[j].y) / h * 100;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 22 && rand2() > 0.35) {
            edges.push({ i, j, phase: rand2() * Math.PI * 2, speed: 0.4 + rand2() * 0.5 });
          }
        }
      }
      streams = edges.slice(0, 8).map((_, k) => ({ fromEdge: k, phase: k * 0.6, speed: 0.3 + (k % 4) * 0.05 }));
      const rand3 = seededRand(150);
      hexes = Array.from({ length: 6 }, () => ({
        x: (rand3() * 90 + 5) / 100 * w,
        y: (rand3() * 90 + 5) / 100 * h,
        size: 12 + rand3() * 24,
        rot: rand3() * Math.PI * 2,
        phase: rand3() * Math.PI * 2,
        speed: 0.05 + rand3() * 0.06,
        opacity: 0.04 + rand3() * 0.06,
      }));
    }

    function resize() {
      c.width = Math.max(1, Math.ceil(c.offsetWidth / 2));
      c.height = Math.max(1, Math.ceil(c.offsetHeight / 2));
      build(c.width, c.height);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(c);

    function drawHex(x: number, y: number, size: number, rot: number, alpha: number) {
      cx.save();
      cx.translate(x, y);
      cx.rotate(rot);
      cx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const px = Math.cos(a) * size / 2;
        const py = Math.sin(a) * size / 2;
        if (i === 0) cx.moveTo(px, py); else cx.lineTo(px, py);
      }
      cx.closePath();
      cx.strokeStyle = `rgba(129,140,248,${0.3 * alpha})`;
      cx.lineWidth = 1;
      cx.stroke();
      cx.restore();
    }

    let lastMs = 0;
    function draw(ms: number) {
      raf = requestAnimationFrame(draw);
      if (ms - lastMs < 50) return;
      lastMs = ms;
      const w = c.width, h = c.height;
      const tt = ms / 1000;
      cx.clearRect(0, 0, w, h);

      // background morph blobs
      const blob = (cxp: number, cyp: number, rad: number, r: number, g: number, b: number, a: number) => {
        const grd = cx.createRadialGradient(cxp, cyp, 0, cxp, cyp, rad);
        grd.addColorStop(0, `rgba(${r},${g},${b},${a})`);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        cx.fillStyle = grd;
        cx.beginPath();
        cx.arc(cxp, cyp, rad, 0, Math.PI * 2);
        cx.fill();
      };
      blob(w * 0.25 + Math.sin(tt * 0.2) * 30, h * 0.25 + Math.cos(tt * 0.18) * 20, w * 0.3, 99, 102, 241, 0.12);
      blob(w * 0.85 + Math.cos(tt * 0.22) * 25, h * 0.85 + Math.sin(tt * 0.24) * 20, w * 0.25, 139, 92, 246, 0.10);
      blob(w * 0.6, h * 0.55, w * 0.2 * (1 + Math.sin(tt * 0.3) * 0.1), 129, 140, 248, 0.08);

      // hexagons
      for (const hex of hexes) {
        const off = Math.sin(tt * hex.speed + hex.phase) * 6;
        drawHex(hex.x, hex.y + off, hex.size, hex.rot, hex.opacity);
      }

      // edges
      cx.lineWidth = 0.5;
      for (const e of edges) {
        const a = nodes[e.i], b = nodes[e.j];
        const breathe = 0.6 + 0.4 * Math.sin(tt * e.speed + e.phase);
        cx.strokeStyle = `rgba(129,140,248,${0.08 * breathe})`;
        cx.beginPath();
        cx.moveTo(a.x, a.y); cx.lineTo(b.x, b.y);
        cx.stroke();
      }

      // streams (traveling dots)
      for (const s of streams) {
        const e = edges[s.fromEdge];
        if (!e) continue;
        const a = nodes[e.i], b = nodes[e.j];
        const t01 = (tt * s.speed + s.phase) % 1;
        const px = a.x + (b.x - a.x) * t01;
        const py = a.y + (b.y - a.y) * t01;
        cx.fillStyle = 'rgba(129,140,248,0.6)';
        cx.beginPath();
        cx.arc(px, py, 1.5, 0, Math.PI * 2);
        cx.fill();
      }

      // pulse rings from hubs
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (!n.hub) continue;
        const cycle = 6 + (i % 3) * 2;
        const ph = ((tt + i * 3) % cycle) / cycle;
        const radius = ph * Math.min(w, h) * 0.15;
        cx.strokeStyle = `rgba(129,140,248,${0.2 * (1 - ph)})`;
        cx.lineWidth = 0.5;
        cx.beginPath();
        cx.arc(n.x, n.y, radius, 0, Math.PI * 2);
        cx.stroke();
      }

      // nodes
      for (const n of nodes) {
        const op = n.baseOp * (0.5 + 0.5 * Math.sin(tt * n.speed + n.phase));
        if (n.hub) {
          const grd = cx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 4);
          grd.addColorStop(0, `rgba(167,139,250,${0.4 * op})`);
          grd.addColorStop(1, 'rgba(0,0,0,0)');
          cx.fillStyle = grd;
          cx.beginPath();
          cx.arc(n.x, n.y, n.r * 4, 0, Math.PI * 2);
          cx.fill();
        }
        cx.fillStyle = n.hub ? `rgba(167,139,250,${op})` : `rgba(129,140,248,${op})`;
        cx.beginPath();
        cx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        cx.fill();
      }

      // scan line
      const sy = (Math.sin(tt * 0.5) * 0.5 + 0.5) * h;
      const sgrd = cx.createLinearGradient(0, 0, w, 0);
      sgrd.addColorStop(0, 'rgba(129,140,248,0)');
      sgrd.addColorStop(0.5, 'rgba(129,140,248,0.1)');
      sgrd.addColorStop(1, 'rgba(129,140,248,0)');
      cx.fillStyle = sgrd;
      cx.fillRect(0, sy, w, 1);

    }
    raf = requestAnimationFrame(draw);

    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} className={CANVAS_CLS} style={CANVAS_STYLE} aria-hidden="true" />;
}

/* ── Midnight: starfield + nebulae + crescent moon ── */
function MidnightBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const c = canvas;
    const cx = ctx;
    let raf: number;

    interface Star { x: number; y: number; size: number; baseOp: number; speed: number; phase: number; blue: boolean; }
    let stars: Star[] = [];
    interface Shooter { x: number; y: number; angle: number; cycle: number; phase: number; }
    let shooters: Shooter[] = [];

    function build(w: number, h: number) {
      const r = seededRand(99);
      stars = Array.from({ length: 120 }, () => ({
        x: r() * w, y: r() * h,
        size: 0.4 + r() * 2,
        baseOp: 0.2 + r() * 0.7,
        speed: 0.5 + r() * 2,
        phase: r() * Math.PI * 2,
        blue: r() > 0.6,
      }));
      const rs = seededRand(503);
      shooters = Array.from({ length: 3 }, (_, i) => ({
        x: (10 + rs() * 70) / 100 * w,
        y: (3 + rs() * 30) / 100 * h,
        angle: (20 + rs() * 30) * Math.PI / 180,
        cycle: 6 + i * 4,
        phase: i * 5,
      }));
    }

    function resize() {
      c.width = Math.max(1, Math.ceil(c.offsetWidth / 2));
      c.height = Math.max(1, Math.ceil(c.offsetHeight / 2));
      build(c.width, c.height);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(c);

    let lastMs = 0;
    function draw(ms: number) {
      raf = requestAnimationFrame(draw);
      if (ms - lastMs < 50) return;
      lastMs = ms;
      const w = c.width, h = c.height;
      const tt = ms / 1000;
      cx.clearRect(0, 0, w, h);

      // milky way diagonal haze
      const bg = cx.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0.15, 'rgba(0,0,0,0)');
      bg.addColorStop(0.35, 'rgba(120,140,230,0.15)');
      bg.addColorStop(0.55, 'rgba(100,120,210,0.2)');
      bg.addColorStop(0.75, 'rgba(120,140,230,0.12)');
      bg.addColorStop(0.95, 'rgba(0,0,0,0)');
      cx.fillStyle = bg;
      cx.fillRect(0, 0, w, h);

      // nebulae
      const drawNeb = (x: number, y: number, rad: number, r: number, g: number, b: number, a: number) => {
        const grd = cx.createRadialGradient(x, y, 0, x, y, rad);
        grd.addColorStop(0, `rgba(${r},${g},${b},${a})`);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        cx.fillStyle = grd;
        cx.beginPath();
        cx.arc(x, y, rad, 0, Math.PI * 2);
        cx.fill();
      };
      const breathe1 = 1 + Math.sin(tt * 0.4) * 0.3;
      const breathe2 = 1 + Math.sin(tt * 0.3 + 1) * 0.3;
      drawNeb(w * 0.2, h * 0.25, w * 0.25 * breathe1, 139, 156, 248, 0.25);
      drawNeb(w * 0.6, h * 0.55, w * 0.22 * breathe2, 160, 100, 220, 0.3);
      drawNeb(w * 0.1, h * 0.7, w * 0.18, 80, 120, 200, 0.22);

      // stars
      for (const s of stars) {
        const op = s.baseOp * (0.4 + 0.6 * Math.sin(tt * s.speed + s.phase));
        cx.globalAlpha = Math.max(0, op);
        cx.fillStyle = s.blue ? '#8b9cf8' : '#e8eaff';
        cx.beginPath();
        cx.arc(s.x, s.y, s.size / 2, 0, Math.PI * 2);
        cx.fill();
        if (s.size > 1.5) {
          const grd = cx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size * 3);
          grd.addColorStop(0, s.blue ? `rgba(139,156,248,${op * 0.5})` : `rgba(220,225,255,${op * 0.5})`);
          grd.addColorStop(1, 'rgba(0,0,0,0)');
          cx.fillStyle = grd;
          cx.beginPath();
          cx.arc(s.x, s.y, s.size * 3, 0, Math.PI * 2);
          cx.fill();
        }
      }
      cx.globalAlpha = 1;

      // crescent moon
      const moonX = w * 0.92, moonY = h * 0.1, moonR = 26;
      cx.fillStyle = 'rgba(210,220,255,0.5)';
      cx.beginPath();
      cx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
      cx.fill();
      cx.fillStyle = 'rgba(8,8,22,0.92)';
      cx.beginPath();
      cx.arc(moonX + 8, moonY - 4, moonR * 0.9, 0, Math.PI * 2);
      cx.fill();

      // shooting stars
      for (const sh of shooters) {
        const t01 = ((tt + sh.phase) % sh.cycle) / sh.cycle;
        if (t01 < 0.08 || t01 > 0.92) continue;
        const progress = (t01 - 0.08) / 0.84;
        const dx = Math.cos(sh.angle) * 150 * progress;
        const dy = Math.sin(sh.angle) * 100 * progress;
        const sx = sh.x + dx, sy = sh.y + dy;
        const tailLen = 40;
        const grd = cx.createLinearGradient(sx - Math.cos(sh.angle) * tailLen, sy - Math.sin(sh.angle) * tailLen, sx, sy);
        grd.addColorStop(0, 'rgba(255,255,255,0)');
        grd.addColorStop(1, 'rgba(255,255,255,0.9)');
        cx.strokeStyle = grd;
        cx.lineWidth = 2.5;
        cx.lineCap = 'round';
        cx.beginPath();
        cx.moveTo(sx - Math.cos(sh.angle) * tailLen, sy - Math.sin(sh.angle) * tailLen);
        cx.lineTo(sx, sy);
        cx.stroke();
      }

    }
    raf = requestAnimationFrame(draw);

    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} className={CANVAS_CLS} style={CANVAS_STYLE} aria-hidden="true" />;
}

/* ── Obsidian: floating polygonal fragments + glints + ambient glow ── */
function ObsidianBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const c = canvas;
    const cx = ctx;
    let raf: number;

    interface Shard { x: number; y: number; size: number; rot: number; rotSpeed: number; pts: { x: number; y: number }[]; phase: number; speed: number; }
    interface Glint { x: number; y: number; size: number; cycle: number; phase: number; }
    interface Mote { x: number; size: number; speed: number; drift: number; phase: number; }
    let shards: Shard[] = [];
    let glints: Glint[] = [];
    let motes: Mote[] = [];

    function build(w: number, h: number) {
      const r = seededRand(44);
      shards = Array.from({ length: 9 }, () => {
        const cxp = r() * w, cyp = r() * h;
        const size = 40 + r() * 80;
        const n = 4 + Math.floor(r() * 3);
        const pts: { x: number; y: number }[] = [];
        for (let j = 0; j < n; j++) {
          const a = (j / n) * Math.PI * 2 - Math.PI / 2;
          const rr = size * (0.7 + r() * 0.3);
          pts.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr });
        }
        return {
          x: cxp, y: cyp, size,
          rot: r() * Math.PI * 2,
          rotSpeed: (r() - 0.5) * 0.2,
          pts, phase: r() * Math.PI * 2,
          speed: 0.3 + r() * 0.4,
        };
      });
      const rg = seededRand(144);
      glints = Array.from({ length: 14 }, () => ({
        x: rg() * w, y: rg() * h,
        size: 1 + rg() * 2.5,
        cycle: 3 + rg() * 6,
        phase: rg() * 14,
      }));
      const rm = seededRand(344);
      motes = Array.from({ length: 18 }, () => ({
        x: rm() * w,
        size: 1 + rm() * 2,
        speed: 8 + rm() * 16,
        drift: (rm() - 0.5) * 40,
        phase: rm() * 16,
      }));
    }

    function resize() {
      c.width = Math.max(1, Math.ceil(c.offsetWidth / 2));
      c.height = Math.max(1, Math.ceil(c.offsetHeight / 2));
      build(c.width, c.height);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(c);

    let lastMs = 0;
    function draw(ms: number) {
      raf = requestAnimationFrame(draw);
      if (ms - lastMs < 50) return;
      lastMs = ms;
      const w = c.width, h = c.height;
      const tt = ms / 1000;
      cx.clearRect(0, 0, w, h);

      // base volcanic gradient
      const grd1 = cx.createRadialGradient(w * 0.35, h * 0.25, 0, w * 0.35, h * 0.25, w * 0.5);
      grd1.addColorStop(0, 'rgba(30,20,60,0.6)');
      grd1.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = grd1;
      cx.beginPath();
      cx.arc(w * 0.35, h * 0.25, w * 0.5, 0, Math.PI * 2);
      cx.fill();
      const grd2 = cx.createRadialGradient(w * 0.7, h * 0.75, 0, w * 0.7, h * 0.75, w * 0.45);
      grd2.addColorStop(0, 'rgba(20,15,50,0.5)');
      grd2.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = grd2;
      cx.beginPath();
      cx.arc(w * 0.7, h * 0.75, w * 0.45, 0, Math.PI * 2);
      cx.fill();

      // core ambient glow
      const coreS = 1 + Math.sin(tt * 0.3) * 0.15;
      const cg = cx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, w * 0.3 * coreS);
      cg.addColorStop(0, 'rgba(120,90,200,0.15)');
      cg.addColorStop(0.4, 'rgba(80,50,160,0.06)');
      cg.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = cg;
      cx.beginPath();
      cx.arc(w * 0.5, h * 0.5, w * 0.3 * coreS, 0, Math.PI * 2);
      cx.fill();

      // shards
      for (const sh of shards) {
        const alpha = 0.5 + 0.4 * Math.sin(tt * sh.speed + sh.phase);
        sh.rot += sh.rotSpeed * 0.005;
        cx.save();
        cx.translate(sh.x, sh.y);
        cx.rotate(sh.rot);
        cx.beginPath();
        sh.pts.forEach((p, i) => i === 0 ? cx.moveTo(p.x, p.y) : cx.lineTo(p.x, p.y));
        cx.closePath();
        const lg = cx.createLinearGradient(-sh.size, -sh.size, sh.size, sh.size);
        lg.addColorStop(0, 'rgba(120,90,200,0)');
        lg.addColorStop(0.5, `rgba(180,160,240,${0.15 * alpha})`);
        lg.addColorStop(1, 'rgba(120,90,200,0)');
        cx.fillStyle = lg;
        cx.fill();
        cx.strokeStyle = `rgba(167,139,250,${0.3 * alpha})`;
        cx.lineWidth = 1;
        cx.stroke();
        cx.restore();
      }

      // prismatic sweep
      const swX = ((tt * 0.05) % 1) * w * 2 - w * 0.5;
      const swg = cx.createLinearGradient(swX, 0, swX + 200, 0);
      swg.addColorStop(0, 'rgba(0,0,0,0)');
      swg.addColorStop(0.5, 'rgba(200,180,255,0.08)');
      swg.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = swg;
      cx.fillRect(0, h * 0.25, w, 100);

      // glints
      for (const g of glints) {
        const t01 = ((tt + g.phase) % g.cycle) / g.cycle;
        if (t01 < 0.05 || t01 > 0.4) continue;
        const a = t01 < 0.2 ? t01 / 0.2 : (0.4 - t01) / 0.2;
        cx.fillStyle = `rgba(220,210,255,${a * 0.9})`;
        cx.beginPath();
        cx.arc(g.x, g.y, g.size, 0, Math.PI * 2);
        cx.fill();
        const gg = cx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.size * 4);
        gg.addColorStop(0, `rgba(167,139,250,${a * 0.6})`);
        gg.addColorStop(1, 'rgba(0,0,0,0)');
        cx.fillStyle = gg;
        cx.beginPath();
        cx.arc(g.x, g.y, g.size * 4, 0, Math.PI * 2);
        cx.fill();
      }

      // rising motes
      for (const m of motes) {
        const t01 = ((tt + m.phase) / m.speed) % 1;
        const y = h - t01 * h * 1.1;
        const x = m.x + t01 * m.drift;
        const a = t01 < 0.1 ? t01 / 0.1 : t01 > 0.85 ? (1 - t01) / 0.15 : 0.6;
        cx.fillStyle = `rgba(167,139,250,${a * 0.6})`;
        cx.beginPath();
        cx.arc(x, y, m.size, 0, Math.PI * 2);
        cx.fill();
      }

    }
    raf = requestAnimationFrame(draw);

    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} className={CANVAS_CLS} style={CANVAS_STYLE} aria-hidden="true" />;
}

/* ── Nord: aurora bands + snowflakes ── */
function NordBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const c = canvas;
    const cx = ctx;
    let raf: number;

    interface Snow { x: number; y: number; size: number; speed: number; drift: number; phase: number; }
    let snowflakes: Snow[] = [];
    interface Frost { x: number; y: number; size: number; color: number; phase: number; speed: number; }
    let frosts: Frost[] = [];

    function build(w: number, h: number) {
      const r = seededRand(122);
      snowflakes = Array.from({ length: 35 }, () => ({
        x: r() * w, y: r() * h,
        size: 2 + r() * 4,
        speed: 30 + r() * 50,
        drift: (r() - 0.5) * 40,
        phase: r() * Math.PI * 2,
      }));
      const r2 = seededRand(22);
      frosts = Array.from({ length: 30 }, () => ({
        x: r2() * w, y: r2() * h * 0.7,
        size: 0.8 + r2() * 2.5,
        color: Math.floor(r2() * 3),
        phase: r2() * Math.PI * 2,
        speed: 0.3 + r2() * 0.5,
      }));
    }

    function resize() {
      c.width = Math.max(1, Math.ceil(c.offsetWidth / 2));
      c.height = Math.max(1, Math.ceil(c.offsetHeight / 2));
      build(c.width, c.height);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(c);

    const auroraColors: [number, number, number][] = [
      [136, 192, 208], [163, 190, 140], [94, 129, 172],
      [180, 142, 173], [235, 203, 139], [129, 161, 193], [191, 97, 106],
    ];
    const frostColors = ['#88c0d0', '#81a1c1', '#8fbcbb'];

    let lastMs = 0;
    function draw(ms: number) {
      raf = requestAnimationFrame(draw);
      if (ms - lastMs < 50) return;
      lastMs = ms;
      const w = c.width, h = c.height;
      const tt = ms / 1000;
      cx.clearRect(0, 0, w, h);

      // aurora bands
      for (let i = 0; i < auroraColors.length; i++) {
        const [r, g, b] = auroraColors[i];
        const wave = Math.sin(tt * 0.3 + i * 0.8) * 0.2 + 1;
        const top = -h * 0.05 + i * 5;
        const bandH = h * (0.3 + (i % 3) * 0.1) * wave;
        const grd = cx.createLinearGradient(0, top, 0, top + bandH);
        grd.addColorStop(0, `rgba(${r},${g},${b},0.4)`);
        grd.addColorStop(0.4, `rgba(${r},${g},${b},0.25)`);
        grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
        cx.fillStyle = grd;
        cx.fillRect(0, top, w, bandH);
      }

      // vertical curtain columns
      for (let i = 0; i < 12; i++) {
        const col = auroraColors[i % auroraColors.length];
        const stretch = 1 + Math.sin(tt * 0.5 + i * 0.5) * 0.5;
        const grd = cx.createLinearGradient(0, 0, 0, h * 0.58 * stretch);
        grd.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},0.3)`);
        grd.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
        cx.fillStyle = grd;
        const x = (2 + i * 8) / 100 * w;
        cx.fillRect(x, 0, w * 0.05, h * 0.58 * stretch);
      }

      // mountain silhouette
      cx.fillStyle = 'rgba(28,32,48,0.9)';
      cx.beginPath();
      cx.moveTo(0, h);
      cx.lineTo(0, h * 0.78);
      for (let i = 0; i < 12; i++) {
        const x = (i / 11) * w;
        const y = h * (0.78 + Math.sin(i * 1.5) * 0.08);
        cx.lineTo(x, y);
      }
      cx.lineTo(w, h);
      cx.closePath();
      cx.fill();

      // frost particles
      for (const f of frosts) {
        const op = 0.4 + 0.5 * Math.sin(tt * f.speed + f.phase);
        const col = frostColors[f.color];
        cx.fillStyle = col;
        cx.globalAlpha = Math.max(0, op);
        cx.beginPath();
        cx.arc(f.x, f.y, f.size, 0, Math.PI * 2);
        cx.fill();
      }
      cx.globalAlpha = 1;

      // snowflakes
      for (const s of snowflakes) {
        s.y += 0.4;
        if (s.y > h) { s.y = -10; s.x = Math.random() * w; }
        const x = s.x + Math.sin(tt * 0.5 + s.phase) * 8;
        cx.fillStyle = 'rgba(236,239,244,0.85)';
        cx.beginPath();
        cx.arc(x, s.y, s.size / 2, 0, Math.PI * 2);
        cx.fill();
      }

    }
    raf = requestAnimationFrame(draw);

    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} className={CANVAS_CLS} style={CANVAS_STYLE} aria-hidden="true" />;
}

/* ── Gruvbox: warm earthy geometric shapes ── */
function GruvboxBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const c = canvas;
    const cx = ctx;
    let raf: number;

    interface Ember { x: number; size: number; speed: number; drift: number; phase: number; color: string; }
    let embers: Ember[] = [];
    interface Shape { x: number; y: number; size: number; rot: number; rotSpeed: number; type: number; color: string; phase: number; }
    let shapes: Shape[] = [];

    function build(w: number, h: number) {
      const r = seededRand(73);
      embers = Array.from({ length: 40 }, (_, i) => ({
        x: r() * w,
        size: i < 10 ? (0.6 + r() * 1.2) : i < 28 ? (1.5 + r() * 2.5) : (3 + r() * 4.5),
        speed: 30 + r() * 60,
        drift: (r() - 0.5) * 80,
        phase: r() * 10,
        color: r() > 0.55 ? '#d79921' : r() > 0.3 ? '#d65d0e' : '#cc241d',
      }));
      const r2 = seededRand(173);
      const palette = ['#d79921', '#b57614', '#d65d0e', '#cc241d', '#a89984'];
      shapes = Array.from({ length: 12 }, () => ({
        x: r2() * w, y: r2() * h,
        size: 20 + r2() * 50,
        rot: r2() * Math.PI * 2,
        rotSpeed: (r2() - 0.5) * 0.3,
        type: Math.floor(r2() * 3),
        color: palette[Math.floor(r2() * palette.length)],
        phase: r2() * Math.PI * 2,
      }));
    }

    function resize() {
      c.width = Math.max(1, Math.ceil(c.offsetWidth / 2));
      c.height = Math.max(1, Math.ceil(c.offsetHeight / 2));
      build(c.width, c.height);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(c);

    let lastMs = 0;
    function draw(ms: number) {
      raf = requestAnimationFrame(draw);
      if (ms - lastMs < 50) return;
      lastMs = ms;
      const w = c.width, h = c.height;
      const tt = ms / 1000;
      cx.clearRect(0, 0, w, h);

      // heat glow base
      const glow = cx.createLinearGradient(0, h, 0, h * 0.4);
      glow.addColorStop(0, 'rgba(215,153,33,0.4)');
      glow.addColorStop(0.5, 'rgba(214,93,14,0.2)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = glow;
      cx.fillRect(0, 0, w, h);

      // coal bed strip
      const cgrd = cx.createLinearGradient(0, 0, w, 0);
      cgrd.addColorStop(0.05, 'rgba(0,0,0,0)');
      cgrd.addColorStop(0.5, 'rgba(255,200,60,0.9)');
      cgrd.addColorStop(0.95, 'rgba(0,0,0,0)');
      cx.fillStyle = cgrd;
      const pulse = 0.7 + Math.sin(tt) * 0.3;
      cx.globalAlpha = pulse;
      cx.fillRect(0, h - 3, w, 3);
      cx.globalAlpha = 1;

      // geometric shapes
      for (const s of shapes) {
        s.rot += s.rotSpeed * 0.005;
        const wob = Math.sin(tt * 0.5 + s.phase) * 10;
        const op = 0.15 + Math.sin(tt * 0.3 + s.phase) * 0.1;
        cx.save();
        cx.translate(s.x, s.y + wob);
        cx.rotate(s.rot);
        cx.globalAlpha = Math.max(0, op);
        cx.fillStyle = s.color;
        cx.strokeStyle = s.color;
        cx.lineWidth = 2;
        if (s.type === 0) {
          // triangle
          cx.beginPath();
          cx.moveTo(0, -s.size / 2);
          cx.lineTo(s.size / 2, s.size / 2);
          cx.lineTo(-s.size / 2, s.size / 2);
          cx.closePath();
          cx.stroke();
        } else if (s.type === 1) {
          // square
          cx.strokeRect(-s.size / 2, -s.size / 2, s.size, s.size);
        } else {
          // hex
          cx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const px = Math.cos(a) * s.size / 2;
            const py = Math.sin(a) * s.size / 2;
            i === 0 ? cx.moveTo(px, py) : cx.lineTo(px, py);
          }
          cx.closePath();
          cx.stroke();
        }
        cx.restore();
      }
      cx.globalAlpha = 1;

      // rising embers
      for (const e of embers) {
        const t01 = ((tt + e.phase) / (e.speed / 8)) % 1;
        const y = h - t01 * h;
        const x = e.x + t01 * e.drift;
        const a = t01 < 0.1 ? t01 / 0.1 : t01 > 0.85 ? (1 - t01) / 0.15 : 0.8;
        cx.fillStyle = e.color;
        cx.globalAlpha = Math.max(0, a);
        cx.beginPath();
        cx.arc(x, y, e.size, 0, Math.PI * 2);
        cx.fill();
        const gg = cx.createRadialGradient(x, y, 0, x, y, e.size * 4);
        gg.addColorStop(0, e.color);
        gg.addColorStop(1, 'rgba(0,0,0,0)');
        cx.globalAlpha = Math.max(0, a * 0.4);
        cx.fillStyle = gg;
        cx.beginPath();
        cx.arc(x, y, e.size * 4, 0, Math.PI * 2);
        cx.fill();
      }
      cx.globalAlpha = 1;

    }
    raf = requestAnimationFrame(draw);

    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} className={CANVAS_CLS} style={CANVAS_STYLE} aria-hidden="true" />;
}

/* ── RosePine: soft floating rose petals/bubbles ── */
function RosePineBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const c = canvas;
    const cx = ctx;
    let raf: number;

    interface Petal { x: number; y: number; size: number; speed: number; drift: number; phase: number; color: string; rot: number; rotSpeed: number; type: number; }
    let petals: Petal[] = [];
    interface Fly { x: number; y: number; size: number; phase: number; speed: number; color: string; }
    let flies: Fly[] = [];

    function build(w: number, h: number) {
      const r = seededRand(55);
      const palette = ['#eb6f92', '#c4a7e7', '#f6c177', '#ebbcba'];
      petals = Array.from({ length: 25 }, () => ({
        x: r() * w, y: r() * h,
        size: 6 + r() * 14,
        speed: 12 + r() * 18,
        drift: (r() - 0.5) * 80,
        phase: r() * 16,
        color: palette[Math.floor(r() * palette.length)],
        rot: r() * Math.PI * 2,
        rotSpeed: (r() - 0.5) * 0.5,
        type: Math.floor(r() * 3),
      }));
      const rf = seededRand(56);
      flies = Array.from({ length: 12 }, () => ({
        x: rf() * w, y: rf() * h,
        size: 1.5 + rf() * 2,
        phase: rf() * Math.PI * 2,
        speed: 0.3 + rf() * 0.6,
        color: rf() > 0.6 ? '#f6c177' : rf() > 0.3 ? '#eb6f92' : '#c4a7e7',
      }));
    }

    function resize() {
      c.width = Math.max(1, Math.ceil(c.offsetWidth / 2));
      c.height = Math.max(1, Math.ceil(c.offsetHeight / 2));
      build(c.width, c.height);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(c);

    let lastMs = 0;
    function draw(ms: number) {
      raf = requestAnimationFrame(draw);
      if (ms - lastMs < 50) return;
      lastMs = ms;
      const w = c.width, h = c.height;
      const tt = ms / 1000;
      cx.clearRect(0, 0, w, h);

      // fog/mist
      const fog = (x: number, y: number, rad: number, r: number, g: number, b: number, a: number) => {
        const grd = cx.createRadialGradient(x, y, 0, x, y, rad);
        grd.addColorStop(0, `rgba(${r},${g},${b},${a})`);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        cx.fillStyle = grd;
        cx.beginPath();
        cx.arc(x, y, rad, 0, Math.PI * 2);
        cx.fill();
      };
      fog(w * 0.85, h * 0.25, w * 0.4, 235, 111, 146, 0.25);
      fog(w * 0.1, h * 0.85, w * 0.35, 196, 167, 231, 0.3);
      fog(w * 0.45, h * 0.55, w * 0.3, 246, 193, 119, 0.2);

      // falling petals
      for (const p of petals) {
        p.y += p.speed / 60;
        p.rot += p.rotSpeed * 0.01;
        if (p.y > h + 20) { p.y = -20; p.x = Math.random() * w; }
        const x = p.x + Math.sin(tt * 0.4 + p.phase) * 30;
        cx.save();
        cx.translate(x, p.y);
        cx.rotate(p.rot);
        cx.fillStyle = p.color;
        cx.globalAlpha = 0.6;
        cx.beginPath();
        if (p.type === 0) {
          cx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        } else if (p.type === 1) {
          cx.ellipse(0, 0, p.size * 0.3, p.size * 0.6, 0, 0, Math.PI * 2);
        } else {
          cx.moveTo(0, -p.size / 2);
          cx.quadraticCurveTo(p.size / 2, 0, 0, p.size / 2);
          cx.quadraticCurveTo(-p.size / 2, 0, 0, -p.size / 2);
        }
        cx.fill();
        cx.restore();
      }
      cx.globalAlpha = 1;

      // fireflies
      for (const f of flies) {
        const op = 0.4 + 0.5 * Math.sin(tt * f.speed + f.phase);
        const x = f.x + Math.sin(tt * f.speed * 0.5 + f.phase) * 30;
        const y = f.y + Math.cos(tt * f.speed * 0.3 + f.phase) * 20;
        cx.globalAlpha = Math.max(0, op);
        cx.fillStyle = f.color;
        cx.beginPath();
        cx.arc(x, y, f.size, 0, Math.PI * 2);
        cx.fill();
        const gg = cx.createRadialGradient(x, y, 0, x, y, f.size * 5);
        gg.addColorStop(0, f.color);
        gg.addColorStop(1, 'rgba(0,0,0,0)');
        cx.fillStyle = gg;
        cx.globalAlpha = Math.max(0, op * 0.4);
        cx.beginPath();
        cx.arc(x, y, f.size * 5, 0, Math.PI * 2);
        cx.fill();
      }
      cx.globalAlpha = 1;

    }
    raf = requestAnimationFrame(draw);

    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} className={CANVAS_CLS} style={CANVAS_STYLE} aria-hidden="true" />;
}

/* ── Abyss: deep ocean with floating bioluminescent particles + bubbles ── */
function AbyssBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const c = canvas;
    const cx = ctx;
    let raf: number;

    interface Orb { x: number; y: number; size: number; color: string; phase: number; cycle: number; }
    interface Bubble { x: number; y: number; size: number; speed: number; phase: number; drift: number; }
    interface Snow { x: number; y: number; size: number; speed: number; phase: number; drift: number; }
    let orbs: Orb[] = [];
    let bubbles: Bubble[] = [];
    let snow: Snow[] = [];

    function build(w: number, h: number) {
      const r = seededRand(88);
      orbs = Array.from({ length: 20 }, () => ({
        x: r() * w, y: r() * h,
        size: 4 + r() * 12,
        color: r() > 0.5 ? '#2dd4bf' : r() > 0.3 ? '#22d3ee' : '#34d399',
        phase: r() * Math.PI * 2,
        cycle: 4 + r() * 9,
      }));
      const rb = seededRand(89);
      bubbles = Array.from({ length: 18 }, () => ({
        x: rb() * w, y: rb() * h,
        size: 3 + rb() * 6,
        speed: 25 + rb() * 40,
        phase: rb() * 14,
        drift: (rb() - 0.5) * 30,
      }));
      const rs = seededRand(189);
      snow = Array.from({ length: 24 }, () => ({
        x: rs() * w, y: rs() * h,
        size: 0.8 + rs() * 2,
        speed: 8 + rs() * 14,
        phase: rs() * 18,
        drift: (rs() - 0.5) * 25,
      }));
    }

    function resize() {
      c.width = Math.max(1, Math.ceil(c.offsetWidth / 2));
      c.height = Math.max(1, Math.ceil(c.offsetHeight / 2));
      build(c.width, c.height);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(c);

    let lastMs = 0;
    function draw(ms: number) {
      raf = requestAnimationFrame(draw);
      if (ms - lastMs < 50) return;
      lastMs = ms;
      const w = c.width, h = c.height;
      const tt = ms / 1000;
      cx.clearRect(0, 0, w, h);

      // depth gradient
      const dg = cx.createLinearGradient(0, 0, 0, h);
      dg.addColorStop(0, 'rgba(45,212,191,0.15)');
      dg.addColorStop(0.35, 'rgba(34,211,238,0.25)');
      dg.addColorStop(0.65, 'rgba(20,150,140,0.35)');
      dg.addColorStop(1, 'rgba(10,80,80,0.45)');
      cx.fillStyle = dg;
      cx.fillRect(0, 0, w, h);

      // caustic light lines
      cx.lineWidth = 1.5;
      for (let i = 0; i < 10; i++) {
        const y = (2 + i * 9) / 100 * h + Math.sin(tt * 0.5 + i) * 8;
        const op = 0.25 + Math.sin(tt * 0.7 + i * 0.3) * 0.15;
        const cg = cx.createLinearGradient(0, 0, w, 0);
        cg.addColorStop(0, 'rgba(0,0,0,0)');
        cg.addColorStop(0.4, `rgba(45,212,191,${op})`);
        cg.addColorStop(0.5, `rgba(34,211,238,${op * 1.3})`);
        cg.addColorStop(0.6, `rgba(45,212,191,${op})`);
        cg.addColorStop(1, 'rgba(0,0,0,0)');
        cx.strokeStyle = cg;
        cx.beginPath();
        cx.moveTo(0, y);
        cx.lineTo(w, y);
        cx.stroke();
      }

      // bioluminescent orbs
      for (const o of orbs) {
        const t01 = ((tt + o.phase) % o.cycle) / o.cycle;
        const op = t01 < 0.2 ? t01 / 0.2 * 0.7 : t01 > 0.8 ? (1 - t01) / 0.2 * 0.7 : 0.7;
        cx.globalAlpha = Math.max(0, op);
        cx.fillStyle = o.color;
        cx.beginPath();
        cx.arc(o.x, o.y, o.size / 2, 0, Math.PI * 2);
        cx.fill();
        const gg = cx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.size * 3);
        gg.addColorStop(0, o.color);
        gg.addColorStop(1, 'rgba(0,0,0,0)');
        cx.fillStyle = gg;
        cx.globalAlpha = Math.max(0, op * 0.5);
        cx.beginPath();
        cx.arc(o.x, o.y, o.size * 3, 0, Math.PI * 2);
        cx.fill();
      }
      cx.globalAlpha = 1;

      // rising bubbles
      for (const b of bubbles) {
        const t01 = ((tt + b.phase) / (b.speed / 8)) % 1;
        const y = h - t01 * h;
        const x = b.x + t01 * b.drift;
        const a = t01 < 0.1 ? t01 / 0.1 : t01 > 0.85 ? (1 - t01) / 0.15 : 0.7;
        cx.strokeStyle = `rgba(45,212,191,${a * 0.6})`;
        cx.lineWidth = 1;
        cx.beginPath();
        cx.arc(x, y, b.size, 0, Math.PI * 2);
        cx.stroke();
      }

      // marine snow falling
      for (const m of snow) {
        const t01 = ((tt + m.phase) / (m.speed / 8)) % 1;
        const y = t01 * h * 1.05;
        const x = m.x + t01 * m.drift;
        const a = t01 < 0.1 ? t01 / 0.1 : t01 > 0.85 ? (1 - t01) / 0.15 : 0.6;
        cx.fillStyle = `rgba(200,240,240,${a})`;
        cx.beginPath();
        cx.arc(x, y, m.size, 0, Math.PI * 2);
        cx.fill();
      }

    }
    raf = requestAnimationFrame(draw);

    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} className={CANVAS_CLS} style={CANVAS_STYLE} aria-hidden="true" />;
}

/* ── Ember: glowing fire particles + rising sparks ── */
function EmberBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const c = canvas;
    const cx = ctx;
    let raf: number;

    interface Spark { x: number; size: number; speed: number; drift: number; phase: number; color: string; tier: number; }
    let sparks: Spark[] = [];

    function build(w: number, h: number) {
      const r = seededRand(661);
      sparks = [];
      // small
      for (let i = 0; i < 28; i++) sparks.push({
        x: r() * w, size: 2 + r() * 3, speed: 8 + r() * 10,
        drift: (r() - 0.5) * 80, phase: r() * 9, color: '#fde68a', tier: 0,
      });
      // medium
      for (let i = 0; i < 20; i++) sparks.push({
        x: r() * w, size: 4 + r() * 4, speed: 12 + r() * 14,
        drift: (r() - 0.5) * 100, phase: r() * 10,
        color: r() > 0.5 ? '#fbbf24' : '#f97316', tier: 1,
      });
      // large
      for (let i = 0; i < 14; i++) sparks.push({
        x: r() * w, size: 6 + r() * 4, speed: 15 + r() * 18,
        drift: (r() - 0.5) * 120, phase: r() * 12, color: '#ef4444', tier: 2,
      });
    }

    function resize() {
      c.width = Math.max(1, Math.ceil(c.offsetWidth / 2));
      c.height = Math.max(1, Math.ceil(c.offsetHeight / 2));
      build(c.width, c.height);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(c);

    let lastMs = 0;
    function draw(ms: number) {
      raf = requestAnimationFrame(draw);
      if (ms - lastMs < 50) return;
      lastMs = ms;
      const w = c.width, h = c.height;
      const tt = ms / 1000;
      cx.clearRect(0, 0, w, h);

      // intense fire base
      const heat = 1 + Math.sin(tt * 0.6) * 0.2;
      const bg = cx.createLinearGradient(0, h, 0, h * 0.3);
      bg.addColorStop(0, `rgba(249,115,22,${0.6 * heat})`);
      bg.addColorStop(0.4, `rgba(239,68,68,${0.35 * heat})`);
      bg.addColorStop(0.7, 'rgba(251,191,36,0.12)');
      bg.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = bg;
      cx.fillRect(0, 0, w, h);

      // magma pools at bottom
      for (let i = 0; i < 3; i++) {
        const x = (20 + i * 30) / 100 * w;
        const y = h * 0.97;
        const rad = w * 0.12 * (1 + Math.sin(tt * 1.5 + i) * 0.15);
        const grd = cx.createRadialGradient(x, y, 0, x, y, rad);
        const c1 = i % 2 === 0 ? '255,220,80' : '251,191,36';
        grd.addColorStop(0, `rgba(${c1},0.8)`);
        grd.addColorStop(0.4, 'rgba(249,115,22,0.5)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        cx.fillStyle = grd;
        cx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }

      // rising sparks
      for (const s of sparks) {
        const t01 = ((tt + s.phase) / s.speed) % 1;
        const y = h - t01 * h * 0.95;
        const x = s.x + t01 * s.drift;
        const a = s.tier === 0
          ? (1 - t01) * 0.9
          : s.tier === 1
            ? (t01 < 0.3 ? 0.8 : 0.6 * (1 - t01))
            : (t01 < 0.4 ? 0.7 : 0.5 * (1 - t01));
        cx.globalAlpha = Math.max(0, a);
        cx.fillStyle = s.color;
        cx.beginPath();
        cx.arc(x, y, s.size, 0, Math.PI * 2);
        cx.fill();
        const gg = cx.createRadialGradient(x, y, 0, x, y, s.size * 5);
        gg.addColorStop(0, s.color);
        gg.addColorStop(1, 'rgba(0,0,0,0)');
        cx.globalAlpha = Math.max(0, a * 0.4);
        cx.fillStyle = gg;
        cx.beginPath();
        cx.arc(x, y, s.size * 5, 0, Math.PI * 2);
        cx.fill();
      }
      cx.globalAlpha = 1;

    }
    raf = requestAnimationFrame(draw);

    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} className={CANVAS_CLS} style={CANVAS_STYLE} aria-hidden="true" />;
}

/* ── Aurora: aurora borealis bands ── */
function AuroraBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const c = canvas;
    const cx = ctx;
    let raf: number;

    interface Star { x: number; y: number; size: number; baseOp: number; phase: number; speed: number; }
    let stars: Star[] = [];
    interface Particle { x: number; y: number; size: number; color: string; phase: number; cycle: number; }
    let particles: Particle[] = [];

    function build(w: number, h: number) {
      const r = seededRand(771);
      stars = Array.from({ length: 60 }, () => ({
        x: r() * w, y: r() * h * 0.7,
        size: 0.8 + r() * 2,
        baseOp: 0.3 + r() * 0.7,
        phase: r() * Math.PI * 2,
        speed: 0.5 + r() * 2,
      }));
      const rp = seededRand(772);
      particles = Array.from({ length: 20 }, () => ({
        x: rp() * w, y: rp() * h * 0.6,
        size: 2 + rp() * 4,
        color: rp() > 0.4 ? '#a78bfa' : rp() > 0.2 ? '#34d399' : '#22d3ee',
        phase: rp() * Math.PI * 2,
        cycle: 3 + rp() * 6,
      }));
    }

    function resize() {
      c.width = Math.max(1, Math.ceil(c.offsetWidth / 2));
      c.height = Math.max(1, Math.ceil(c.offsetHeight / 2));
      build(c.width, c.height);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(c);

    const bands: Array<[string, string, number, number]> = [
      ['#a78bfa', '#34d399', -0.1, 0.7],
      ['#06b6d4', '#a78bfa', -0.05, 0.6],
      ['#818cf8', '#6366f1', -0.08, 0.75],
      ['#e879f9', '#22d3ee', 0, 0.55],
      ['#6366f1', '#34d399', -0.04, 0.65],
    ];

    function hex(s: string): [number, number, number] {
      const n = parseInt(s.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    let lastMs = 0;
    function draw(ms: number) {
      raf = requestAnimationFrame(draw);
      if (ms - lastMs < 50) return;
      lastMs = ms;
      const w = c.width, h = c.height;
      const tt = ms / 1000;
      cx.clearRect(0, 0, w, h);

      // deep space background
      const sg = cx.createRadialGradient(w / 2, 0, 0, w / 2, 0, h * 0.7);
      sg.addColorStop(0, 'rgba(100,60,180,0.25)');
      sg.addColorStop(0.5, 'rgba(50,30,100,0.15)');
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = sg;
      cx.beginPath();
      cx.arc(w / 2, 0, h * 0.7, 0, Math.PI * 2);
      cx.fill();

      // aurora bands
      for (let i = 0; i < bands.length; i++) {
        const [c1, c2, top, ph] = bands[i];
        const wave = 1 + Math.sin(tt * 0.4 + i * 0.7) * 0.3;
        const [r1, g1, b1] = hex(c1);
        const [r2, g2, b2] = hex(c2);
        const startY = top * h;
        const bandH = ph * h * wave;
        const grd = cx.createLinearGradient(0, startY, 0, startY + bandH);
        grd.addColorStop(0, `rgba(${r1},${g1},${b1},0.5)`);
        grd.addColorStop(0.2, `rgba(${r1},${g1},${b1},0.4)`);
        grd.addColorStop(0.5, `rgba(${r2},${g2},${b2},0.3)`);
        grd.addColorStop(1, `rgba(${r2},${g2},${b2},0)`);
        cx.fillStyle = grd;
        cx.fillRect(0, startY, w, bandH);
      }

      // stars
      for (const s of stars) {
        const op = s.baseOp * (0.4 + 0.6 * Math.sin(tt * s.speed + s.phase));
        cx.globalAlpha = Math.max(0, op);
        cx.fillStyle = '#e2e8f0';
        cx.beginPath();
        cx.arc(s.x, s.y, s.size / 2, 0, Math.PI * 2);
        cx.fill();
      }
      cx.globalAlpha = 1;

      // particles
      for (const p of particles) {
        const op = 0.5 + 0.5 * Math.sin(tt * 0.7 / p.cycle * 4 + p.phase);
        const y = p.y + Math.sin(tt * 0.4 + p.phase) * 20;
        cx.globalAlpha = Math.max(0, op * 0.7);
        cx.fillStyle = p.color;
        cx.beginPath();
        cx.arc(p.x, y, p.size, 0, Math.PI * 2);
        cx.fill();
        const gg = cx.createRadialGradient(p.x, y, 0, p.x, y, p.size * 6);
        gg.addColorStop(0, p.color);
        gg.addColorStop(1, 'rgba(0,0,0,0)');
        cx.fillStyle = gg;
        cx.globalAlpha = Math.max(0, op * 0.3);
        cx.beginPath();
        cx.arc(p.x, y, p.size * 6, 0, Math.PI * 2);
        cx.fill();
      }
      cx.globalAlpha = 1;

      // mountain silhouette
      cx.fillStyle = 'rgba(15,15,25,0.9)';
      cx.beginPath();
      cx.moveTo(0, h);
      cx.lineTo(0, h * 0.88);
      const pts = [0.06, 0.11, 0.18, 0.24, 0.32, 0.4, 0.48, 0.55, 0.62, 0.68, 0.76, 0.82, 0.9, 0.95];
      for (let i = 0; i < pts.length; i++) {
        const x = pts[i] * w;
        const y = h * (0.78 + Math.sin(i * 1.7) * 0.06);
        cx.lineTo(x, y);
      }
      cx.lineTo(w, h);
      cx.closePath();
      cx.fill();

    }
    raf = requestAnimationFrame(draw);

    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} className={CANVAS_CLS} style={CANVAS_STYLE} aria-hidden="true" />;
}

/* ── Catppuccin: pastel orbs + sparkles ── */
function CatppuccinBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const c = canvas;
    const cx = ctx;
    let raf: number;

    interface Orb { x: number; y: number; size: number; color: string; phase: number; speed: number; }
    interface Sparkle { x: number; y: number; cycle: number; phase: number; color: string; }
    interface Candy { x: number; y: number; cycle: number; phase: number; color: string; }
    let orbs: Orb[] = [];
    let sparkles: Sparkle[] = [];
    let candies: Candy[] = [];

    function build(w: number, h: number) {
      const palette = ['#cba6f7', '#f5c2e7', '#89b4fa', '#a6e3a1', '#fab387', '#f38ba8', '#94e2d5', '#b4befe'];
      const r = seededRand(331);
      orbs = Array.from({ length: 18 }, (_, i) => ({
        x: r() * w, y: r() * h,
        size: 60 + r() * 220,
        color: palette[i % palette.length],
        phase: r() * Math.PI * 2,
        speed: 0.2 + r() * 0.3,
      }));
      const rs = seededRand(333);
      const sparkColors = ['#cba6f7', '#f5c2e7', '#89b4fa', '#a6e3a1'];
      sparkles = Array.from({ length: 20 }, () => ({
        x: rs() * w, y: rs() * h,
        cycle: 3 + rs() * 5,
        phase: rs() * 9,
        color: sparkColors[Math.floor(rs() * sparkColors.length)],
      }));
      const rc = seededRand(335);
      candies = Array.from({ length: 30 }, (_, i) => ({
        x: rc() * w, y: rc() * h,
        cycle: 2 + rc() * 3,
        phase: (i / 30) * 8 + rc() * 2,
        color: palette[i % palette.length],
      }));
    }

    function resize() {
      c.width = Math.max(1, Math.ceil(c.offsetWidth / 2));
      c.height = Math.max(1, Math.ceil(c.offsetHeight / 2));
      build(c.width, c.height);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(c);

    function hex(s: string): [number, number, number] {
      const n = parseInt(s.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    let lastMs = 0;
    function draw(ms: number) {
      raf = requestAnimationFrame(draw);
      if (ms - lastMs < 50) return;
      lastMs = ms;
      const w = c.width, h = c.height;
      const tt = ms / 1000;
      cx.clearRect(0, 0, w, h);

      // orbs
      for (const o of orbs) {
        const x = o.x + Math.sin(tt * o.speed + o.phase) * 35;
        const y = o.y + Math.cos(tt * o.speed * 0.8 + o.phase) * 30;
        const [r, g, b] = hex(o.color);
        const grd = cx.createRadialGradient(x, y, 0, x, y, o.size);
        grd.addColorStop(0, `rgba(${r},${g},${b},0.3)`);
        grd.addColorStop(0.4, `rgba(${r},${g},${b},0.18)`);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        cx.fillStyle = grd;
        cx.fillRect(x - o.size, y - o.size, o.size * 2, o.size * 2);
      }

      // rainbow wave band
      const bandY = h * 0.45;
      const rg = cx.createLinearGradient(0, 0, w * 2, 0);
      const palette = ['#cba6f7', '#f5c2e7', '#fab387', '#a6e3a1', '#89b4fa', '#b4befe', '#f38ba8', '#94e2d5', '#cba6f7'];
      const offset = (tt * 0.05) % 1;
      palette.forEach((cc, i) => rg.addColorStop(((i / (palette.length - 1)) - offset + 1) % 1, cc));
      cx.fillStyle = rg;
      cx.globalAlpha = 0.4;
      cx.fillRect(0, bandY, w, 6);
      cx.globalAlpha = 1;

      // sparkle crosses
      for (const s of sparkles) {
        const t01 = ((tt + s.phase) % s.cycle) / s.cycle;
        const op = Math.sin(t01 * Math.PI);
        if (op < 0.05) continue;
        cx.globalAlpha = op * 0.9;
        cx.fillStyle = s.color;
        cx.fillRect(s.x - 1.5, s.y - 6, 3, 12);
        cx.fillRect(s.x - 6, s.y - 1.5, 12, 3);
      }
      cx.globalAlpha = 1;

      // candy dots
      for (const cd of candies) {
        const t01 = ((tt + cd.phase) % cd.cycle) / cd.cycle;
        const op = Math.sin(t01 * Math.PI);
        if (op < 0.1) continue;
        const sz = 2 + op * 4;
        cx.fillStyle = cd.color;
        cx.globalAlpha = op * 0.9;
        cx.beginPath();
        cx.arc(cd.x, cd.y, sz, 0, Math.PI * 2);
        cx.fill();
      }
      cx.globalAlpha = 1;

    }
    raf = requestAnimationFrame(draw);

    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} className={CANVAS_CLS} style={CANVAS_STYLE} aria-hidden="true" />;
}

/* ── TokyoNight: neon city grid + rain + windows ── */
function TokyoNightBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const c = canvas;
    const cx = ctx;
    let raf: number;

    interface Building { x: number; w: number; h: number; windows: number; color: string; spire: boolean; }
    interface Rain { x: number; y: number; len: number; speed: number; }
    interface Neon { x: number; y: number; w: number; h: number; color: string; cycle: number; phase: number; }
    let buildings: Building[] = [];
    let rain: Rain[] = [];
    let neons: Neon[] = [];

    const winColors = ['#7aa2f7', '#ff9e64', '#9ece6a', '#bb9af7', '#7dcfff', '#e0af68', '#f7768e'];

    function build(w: number, h: number) {
      const r = seededRand(779);
      buildings = Array.from({ length: 20 }, (_, i) => ({
        x: (i * 5 + r() * 3) / 100 * w,
        w: (2.5 + r() * 5) / 100 * w,
        h: (15 + r() * 50) / 100 * h,
        windows: Math.floor(4 + r() * 10),
        color: winColors[i % winColors.length],
        spire: r() > 0.5,
      }));
      const rr = seededRand(780);
      rain = Array.from({ length: 40 }, () => ({
        x: rr() * w * 1.1,
        y: rr() * h,
        len: 18 + rr() * 35,
        speed: 200 + rr() * 200,
      }));
      const rn = seededRand(784);
      const neonColors = ['#ff9e64', '#bb9af7', '#7dcfff', '#9ece6a', '#f7768e', '#e0af68'];
      neons = Array.from({ length: 6 }, (_, i) => ({
        x: (15 + i * 13) / 100 * w,
        y: (18 + (i % 3) * 8) / 100 * h,
        w: 80 + rn() * 100,
        h: 25 + rn() * 25,
        color: neonColors[i],
        cycle: 2 + rn() * 4,
        phase: rn() * 5,
      }));
    }

    function resize() {
      c.width = Math.max(1, Math.ceil(c.offsetWidth / 2));
      c.height = Math.max(1, Math.ceil(c.offsetHeight / 2));
      build(c.width, c.height);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(c);

    function hex(s: string): [number, number, number] {
      const n = parseInt(s.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    let lastMs = 0;
    function draw(ms: number) {
      raf = requestAnimationFrame(draw);
      if (ms - lastMs < 50) return;
      lastMs = ms;
      const w = c.width, h = c.height;
      const tt = ms / 1000;
      cx.clearRect(0, 0, w, h);

      // cyberpunk sky
      const sg = cx.createLinearGradient(0, 0, 0, h * 0.7);
      sg.addColorStop(0, 'rgba(25,15,45,0.8)');
      sg.addColorStop(0.6, 'rgba(122,162,247,0.25)');
      sg.addColorStop(0.8, 'rgba(187,154,247,0.15)');
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = sg;
      cx.fillRect(0, 0, w, h);

      // neon sign glows
      for (const n of neons) {
        const cyc = ((tt + n.phase) % n.cycle) / n.cycle;
        const flicker = cyc < 0.48 || cyc > 0.52 ? 1 : 0.3;
        const [r, g, b] = hex(n.color);
        const grd = cx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.w);
        grd.addColorStop(0, `rgba(${r},${g},${b},${0.4 * flicker})`);
        grd.addColorStop(0.5, `rgba(${r},${g},${b},${0.2 * flicker})`);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        cx.fillStyle = grd;
        cx.fillRect(n.x - n.w, n.y - n.h, n.w * 2, n.h * 2);
      }

      // street ground
      cx.fillStyle = 'rgba(15,15,25,0.95)';
      cx.fillRect(0, h * 0.85, w, h * 0.15);

      // buildings
      for (let bi = 0; bi < buildings.length; bi++) {
        const b = buildings[bi];
        const top = h * 0.85 - b.h;
        cx.fillStyle = 'rgba(20,20,35,0.95)';
        cx.fillRect(b.x, top, b.w, b.h);
        // top edge highlight
        cx.fillStyle = 'rgba(80,90,140,0.6)';
        cx.fillRect(b.x, top, b.w, 2);
        if (b.spire) {
          cx.fillStyle = 'rgba(122,162,247,0.6)';
          cx.fillRect(b.x + b.w / 2 - 1, top - 14, 2, 14);
        }
        // windows
        for (let wi = 0; wi < b.windows; wi++) {
          const wy = top + 6 + wi * (b.h - 12) / b.windows;
          const cyc = 1.5 + ((wi + bi) % 5) * 0.3;
          const ph = bi * 0.2 + wi * 0.3;
          const blink = 0.2 + 0.8 * Math.sin(tt / cyc + ph) * 0.5 + 0.4;
          const col = winColors[wi % winColors.length];
          cx.fillStyle = col;
          cx.globalAlpha = Math.max(0.1, blink * 0.8);
          cx.fillRect(b.x + b.w * 0.12, wy, b.w * 0.76, 4);
        }
        cx.globalAlpha = 1;
      }

      // rain
      cx.strokeStyle = 'rgba(122,162,247,0.6)';
      cx.lineWidth = 1.2;
      for (const r of rain) {
        r.y += r.speed / 60;
        if (r.y > h) { r.y = -r.len; r.x = Math.random() * w * 1.1; }
        const ang = 15 * Math.PI / 180;
        const dx = Math.sin(ang) * r.len;
        const dy = Math.cos(ang) * r.len;
        cx.beginPath();
        cx.moveTo(r.x, r.y);
        cx.lineTo(r.x + dx, r.y + dy);
        cx.stroke();
      }

    }
    raf = requestAnimationFrame(draw);

    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} className={CANVAS_CLS} style={CANVAS_STYLE} aria-hidden="true" />;
}

/* ── Dracula: bats + dark purple particles + moon ── */
function DraculaBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const c = canvas;
    const cx = ctx;
    let raf: number;

    interface Bat { x: number; y: number; size: number; speed: number; phase: number; waveAmp: number; flap: number; }
    interface Fog { x: number; y: number; w: number; h: number; phase: number; speed: number; }
    interface Candle { x: number; y: number; phase: number; speed: number; }
    let bats: Bat[] = [];
    let fogs: Fog[] = [];
    let candles: Candle[] = [];

    function build(w: number, h: number) {
      const r = seededRand(1112);
      bats = Array.from({ length: 10 }, () => ({
        x: -50, y: r() * h * 0.55,
        size: 18 + r() * 24,
        speed: 30 + r() * 50,
        phase: r() * 30,
        waveAmp: 15 + r() * 30,
        flap: r() * Math.PI * 2,
      }));
      const rf = seededRand(1111);
      fogs = Array.from({ length: 8 }, (_, i) => ({
        x: rf() * w, y: h - rf() * h * 0.4,
        w: 250 + rf() * 350, h: 80 + rf() * 130,
        phase: rf() * Math.PI * 2,
        speed: 0.1 + rf() * 0.2,
      }));
      const rc = seededRand(1113);
      candles = Array.from({ length: 8 }, () => ({
        x: rc() * w,
        y: h * (0.4 + rc() * 0.4),
        phase: rc() * Math.PI * 2,
        speed: 3 + rc() * 3,
      }));
    }

    function resize() {
      c.width = Math.max(1, Math.ceil(c.offsetWidth / 2));
      c.height = Math.max(1, Math.ceil(c.offsetHeight / 2));
      build(c.width, c.height);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(c);

    function drawBat(x: number, y: number, size: number, flap: number) {
      cx.save();
      cx.translate(x, y);
      cx.scale(size / 30, size / 30);
      const wing = Math.sin(flap) * 0.3;
      cx.fillStyle = 'rgba(189,147,249,0.8)';
      cx.beginPath();
      cx.moveTo(15, 6);
      cx.quadraticCurveTo(10, 0 + wing * 4, 5, 3);
      cx.quadraticCurveTo(2, 1, 0, 4);
      cx.quadraticCurveTo(3, 5, 5, 5);
      cx.quadraticCurveTo(8, 8 - wing * 4, 12, 7);
      cx.lineTo(15, 6);
      cx.quadraticCurveTo(17, 8 - wing * 4, 20, 7);
      cx.quadraticCurveTo(22, 8, 25, 5);
      cx.quadraticCurveTo(27, 5, 30, 4);
      cx.quadraticCurveTo(28, 1, 25, 3);
      cx.quadraticCurveTo(20, 0 + wing * 4, 15, 6);
      cx.fill();
      cx.restore();
    }

    let lastMs = 0;
    function draw(ms: number) {
      raf = requestAnimationFrame(draw);
      if (ms - lastMs < 50) return;
      lastMs = ms;
      const w = c.width, h = c.height;
      const tt = ms / 1000;
      cx.clearRect(0, 0, w, h);

      // gothic sky
      const sg = cx.createLinearGradient(0, 0, 0, h * 0.6);
      sg.addColorStop(0, 'rgba(60,25,80,0.7)');
      sg.addColorStop(0.5, 'rgba(189,147,249,0.3)');
      sg.addColorStop(0.8, 'rgba(139,92,246,0.15)');
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = sg;
      cx.fillRect(0, 0, w, h);

      // moon
      const moonX = w * 0.85, moonY = h * 0.14, moonR = 60;
      const moonGlow = cx.createRadialGradient(moonX, moonY, 0, moonX, moonY, moonR * 2.5);
      moonGlow.addColorStop(0, 'rgba(189,147,249,0.4)');
      moonGlow.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = moonGlow;
      cx.fillRect(moonX - moonR * 2.5, moonY - moonR * 2.5, moonR * 5, moonR * 5);
      const moonBody = cx.createRadialGradient(moonX - 15, moonY - 15, 0, moonX, moonY, moonR);
      moonBody.addColorStop(0, 'rgba(240,220,255,0.6)');
      moonBody.addColorStop(0.4, 'rgba(189,147,249,0.4)');
      moonBody.addColorStop(1, 'rgba(139,92,246,0.15)');
      cx.fillStyle = moonBody;
      cx.beginPath();
      cx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
      cx.fill();
      // craters
      cx.fillStyle = 'rgba(160,120,220,0.4)';
      cx.beginPath();
      cx.arc(moonX - 18, moonY - 12, 7, 0, Math.PI * 2);
      cx.fill();
      cx.beginPath();
      cx.arc(moonX + 8, moonY + 5, 5, 0, Math.PI * 2);
      cx.fill();

      // fog
      for (const f of fogs) {
        const fx = f.x + Math.sin(tt * f.speed + f.phase) * 80;
        const grd = cx.createRadialGradient(fx, f.y, 0, fx, f.y, Math.max(f.w, f.h));
        grd.addColorStop(0, 'rgba(100,80,160,0.3)');
        grd.addColorStop(0.5, 'rgba(60,50,120,0.15)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        cx.fillStyle = grd;
        cx.fillRect(fx - f.w, f.y - f.h, f.w * 2, f.h * 2);
      }

      // candles
      for (const cd of candles) {
        const flick = 1 + Math.sin(tt * cd.speed + cd.phase) * 0.3;
        cx.fillStyle = `rgba(255,180,60,${0.7 * flick})`;
        cx.beginPath();
        cx.ellipse(cd.x, cd.y, 4 * flick, 7, 0, 0, Math.PI * 2);
        cx.fill();
        const gg = cx.createRadialGradient(cd.x, cd.y, 0, cd.x, cd.y, 18);
        gg.addColorStop(0, `rgba(255,180,60,${0.5 * flick})`);
        gg.addColorStop(1, 'rgba(0,0,0,0)');
        cx.fillStyle = gg;
        cx.fillRect(cd.x - 18, cd.y - 18, 36, 36);
      }

      // bats
      for (const b of bats) {
        const cycle = b.speed;
        const t01 = ((tt + b.phase) % cycle) / cycle;
        const x = -50 + t01 * (w + 100);
        const y = b.y + Math.sin(tt * 4 + b.phase) * b.waveAmp;
        const a = t01 < 0.08 ? t01 / 0.08 : t01 > 0.92 ? (1 - t01) / 0.08 : 1;
        cx.globalAlpha = Math.max(0, a * 0.7);
        b.flap += 0.5;
        drawBat(x, y, b.size, b.flap);
      }
      cx.globalAlpha = 1;

      // castle silhouette
      cx.fillStyle = 'rgba(15,10,25,0.95)';
      cx.beginPath();
      cx.moveTo(0, h);
      cx.lineTo(0, h * 0.85);
      // castle merlons
      const cw = w / 24;
      for (let i = 0; i < 24; i++) {
        const x = i * cw;
        if (i % 2 === 0) cx.lineTo(x, h * 0.85);
        else { cx.lineTo(x, h * 0.82); cx.lineTo(x + cw, h * 0.82); cx.lineTo(x + cw, h * 0.85); }
      }
      cx.lineTo(w, h * 0.85);
      cx.lineTo(w, h);
      cx.closePath();
      cx.fill();

    }
    raf = requestAnimationFrame(draw);

    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} className={CANVAS_CLS} style={CANVAS_STYLE} aria-hidden="true" />;
}

/* ── Solarized: warm sun + ocean waves + birds ── */
function SolarizedBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const c = canvas;
    const cx = ctx;
    let raf: number;

    interface Wave { y: number; phase: number; speed: number; opacity: number; }
    interface Bird { x: number; y: number; size: number; speed: number; phase: number; }
    interface Cloud { x: number; y: number; w: number; h: number; speed: number; phase: number; }
    let waves: Wave[] = [];
    let birds: Bird[] = [];
    let clouds: Cloud[] = [];

    function build(w: number, h: number) {
      const r = seededRand(551);
      waves = Array.from({ length: 12 }, (_, i) => ({
        y: (52 + i * 3.5 + r() * 2.5) / 100 * h,
        phase: r() * Math.PI * 2,
        speed: 0.3 + r() * 0.6,
        opacity: 0.2 + i * 0.06,
      }));
      const rb = seededRand(554);
      birds = Array.from({ length: 4 }, () => ({
        x: -30, y: (12 + rb() * 28) / 100 * h,
        size: 16 + rb() * 14,
        speed: 30 + rb() * 30,
        phase: rb() * 30,
      }));
      const rc = seededRand(555);
      clouds = Array.from({ length: 6 }, () => ({
        x: rc() * w, y: (6 + rc() * 22) / 100 * h,
        w: 80 + rc() * 120, h: 30 + rc() * 35,
        speed: 8 + rc() * 12,
        phase: rc() * 30,
      }));
    }

    function resize() {
      c.width = Math.max(1, Math.ceil(c.offsetWidth / 2));
      c.height = Math.max(1, Math.ceil(c.offsetHeight / 2));
      build(c.width, c.height);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(c);

    let lastMs = 0;
    function draw(ms: number) {
      raf = requestAnimationFrame(draw);
      if (ms - lastMs < 50) return;
      lastMs = ms;
      const w = c.width, h = c.height;
      const tt = ms / 1000;
      cx.clearRect(0, 0, w, h);

      // golden atmosphere
      const sg = cx.createLinearGradient(0, 0, 0, h * 0.65);
      sg.addColorStop(0, 'rgba(181,137,0,0.4)');
      sg.addColorStop(0.4, 'rgba(203,75,22,0.25)');
      sg.addColorStop(0.75, 'rgba(38,139,210,0.15)');
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = sg;
      cx.fillRect(0, 0, w, h);

      // ocean
      const og = cx.createLinearGradient(0, h * 0.52, 0, h);
      og.addColorStop(0, 'rgba(0,0,0,0)');
      og.addColorStop(0.3, 'rgba(6,182,212,0.15)');
      og.addColorStop(0.6, 'rgba(38,139,210,0.35)');
      og.addColorStop(1, 'rgba(38,139,210,0.6)');
      cx.fillStyle = og;
      cx.fillRect(0, h * 0.52, w, h * 0.48);

      // clouds
      for (const cl of clouds) {
        const x = (cl.x + tt * cl.speed) % (w + 200) - 100;
        const grd = cx.createRadialGradient(x, cl.y, 0, x, cl.y, Math.max(cl.w, cl.h));
        grd.addColorStop(0, 'rgba(255,250,220,0.6)');
        grd.addColorStop(0.5, 'rgba(255,240,200,0.3)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        cx.fillStyle = grd;
        cx.fillRect(x - cl.w, cl.y - cl.h, cl.w * 2, cl.h * 2);
      }

      // sun
      const sunX = w * 0.85, sunY = h * 0.16, sunR = 70;
      const corona = 1 + Math.sin(tt * 0.5) * 0.15;
      const cg = cx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 2 * corona);
      cg.addColorStop(0, 'rgba(181,137,0,0.6)');
      cg.addColorStop(0.3, 'rgba(181,137,0,0.3)');
      cg.addColorStop(0.6, 'rgba(203,75,22,0.12)');
      cg.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = cg;
      cx.fillRect(sunX - sunR * 2 * corona, sunY - sunR * 2 * corona, sunR * 4 * corona, sunR * 4 * corona);
      const sg2 = cx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR);
      sg2.addColorStop(0, 'rgba(255,220,100,0.9)');
      sg2.addColorStop(0.4, 'rgba(181,137,0,0.7)');
      sg2.addColorStop(1, 'rgba(181,137,0,0)');
      cx.fillStyle = sg2;
      cx.beginPath();
      cx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
      cx.fill();

      // sun reflection on ocean
      const refl = cx.createLinearGradient(sunX, h * 0.52, sunX, h);
      refl.addColorStop(0, 'rgba(181,137,0,0.5)');
      refl.addColorStop(0.5, 'rgba(203,75,22,0.3)');
      refl.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = refl;
      cx.fillRect(sunX - 50, h * 0.52, 100, h * 0.48);

      // waves
      for (const wv of waves) {
        cx.strokeStyle = `rgba(38,139,210,${wv.opacity})`;
        cx.lineWidth = 1.5;
        cx.beginPath();
        const off = tt * wv.speed * 20 + wv.phase * 50;
        for (let x = 0; x <= w; x += 8) {
          const y = wv.y + Math.sin((x + off) * 0.02) * 3;
          if (x === 0) cx.moveTo(x, y); else cx.lineTo(x, y);
        }
        cx.stroke();
      }

      // birds
      cx.strokeStyle = 'rgba(88,110,117,0.8)';
      cx.lineWidth = 1.8;
      cx.lineCap = 'round';
      for (const b of birds) {
        const cycle = b.speed;
        const t01 = ((tt + b.phase) % cycle) / cycle;
        const x = -30 + t01 * (w + 60);
        const y = b.y;
        const a = t01 < 0.08 ? t01 / 0.08 : t01 > 0.92 ? (1 - t01) / 0.08 : 0.8;
        cx.globalAlpha = Math.max(0, a);
        cx.beginPath();
        cx.moveTo(x, y);
        cx.quadraticCurveTo(x - b.size * 0.25, y - b.size * 0.2, x - b.size * 0.5, y);
        cx.moveTo(x, y);
        cx.quadraticCurveTo(x + b.size * 0.25, y - b.size * 0.2, x + b.size * 0.5, y);
        cx.stroke();
      }
      cx.globalAlpha = 1;

    }
    raf = requestAnimationFrame(draw);

    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} className={CANVAS_CLS} style={CANVAS_STYLE} aria-hidden="true" />;
}

/* ── Lightning: storm with bolts + rain ── */
function LightningBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const c = canvas;
    const cx = ctx;
    let raf: number;

    interface Rain { x: number; y: number; len: number; speed: number; angle: number; opacity: number; }
    interface Bolt { segs: { x: number; y: number }[]; branches: { x: number; y: number }[][]; cycle: number; phase: number; }
    interface Cloud { x: number; y: number; w: number; h: number; phase: number; speed: number; }
    let rain: Rain[] = [];
    let bolts: Bolt[] = [];
    let clouds: Cloud[] = [];

    function build(w: number, h: number) {
      const r = seededRand(900);
      rain = Array.from({ length: 60 }, () => ({
        x: r() * w * 1.3 - w * 0.15,
        y: r() * h,
        len: 14 + r() * 32,
        speed: 600 + r() * 600,
        angle: 12 * Math.PI / 180,
        opacity: 0.2 + r() * 0.5,
      }));
      const rb = seededRand(903);
      bolts = Array.from({ length: 6 }, () => {
        const startX = (6 + rb() * 88) / 100 * w;
        const segs: { x: number; y: number }[] = [{ x: startX, y: (3 + rb() * 8) / 100 * h }];
        let cxp = startX;
        let cyp = segs[0].y;
        const n = 7 + Math.floor(rb() * 7);
        for (let j = 0; j < n; j++) {
          cxp += (rb() - 0.5) * 30;
          cyp += (4 + rb() * 8) / 100 * h;
          cxp = Math.max(20, Math.min(w - 20, cxp));
          segs.push({ x: cxp, y: cyp });
        }
        const branches: { x: number; y: number }[][] = [];
        const nB = 2 + Math.floor(rb() * 3);
        for (let bi = 0; bi < nB; bi++) {
          const bi0 = 1 + Math.floor(rb() * Math.max(1, segs.length - 2));
          const bs: { x: number; y: number }[] = [{ x: segs[bi0].x, y: segs[bi0].y }];
          let bx = segs[bi0].x, by = segs[bi0].y;
          const side = rb() > 0.5 ? 1 : -1;
          for (let k = 0; k < 3; k++) {
            bx += side * (10 + rb() * 25);
            by += (3 + rb() * 7) / 100 * h;
            bs.push({ x: bx, y: by });
          }
          branches.push(bs);
        }
        return {
          segs, branches,
          cycle: 5 + rb() * 10,
          phase: rb() * 16,
        };
      });
      const rc = seededRand(902);
      clouds = Array.from({ length: 10 }, () => ({
        x: rc() * w, y: rc() * h * 0.25,
        w: 200 + rc() * 350,
        h: 50 + rc() * 100,
        phase: rc() * Math.PI * 2,
        speed: 0.05 + rc() * 0.1,
      }));
    }

    function resize() {
      c.width = Math.max(1, Math.ceil(c.offsetWidth / 2));
      c.height = Math.max(1, Math.ceil(c.offsetHeight / 2));
      build(c.width, c.height);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(c);

    let lastMs = 0;
    function draw(ms: number) {
      raf = requestAnimationFrame(draw);
      if (ms - lastMs < 50) return;
      lastMs = ms;
      const w = c.width, h = c.height;
      const tt = ms / 1000;
      cx.clearRect(0, 0, w, h);

      // dark stormy sky
      const sg = cx.createLinearGradient(0, 0, 0, h);
      sg.addColorStop(0, 'rgba(8,12,28,0.7)');
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = sg;
      cx.fillRect(0, 0, w, h);

      // determine if any bolt is currently flashing
      let flashAlpha = 0;
      for (const b of bolts) {
        const t01 = ((tt + b.phase) % b.cycle) / b.cycle;
        if (t01 > 0.74 && t01 < 0.82) {
          flashAlpha = Math.max(flashAlpha, 1 - Math.abs(t01 - 0.76) * 20);
        }
      }

      // clouds
      for (const cl of clouds) {
        const cxp = cl.x + Math.sin(tt * cl.speed + cl.phase) * 30;
        const grd = cx.createRadialGradient(cxp, cl.y, 0, cxp, cl.y, Math.max(cl.w, cl.h));
        grd.addColorStop(0, `rgba(15,20,40,0.9)`);
        grd.addColorStop(0.4, 'rgba(12,18,38,0.5)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        cx.fillStyle = grd;
        cx.fillRect(cxp - cl.w, cl.y - cl.h, cl.w * 2, cl.h * 2);
      }

      // sky flash
      if (flashAlpha > 0) {
        cx.fillStyle = `rgba(140,185,255,${0.15 * flashAlpha})`;
        cx.fillRect(0, 0, w, h);
      }

      // bolts
      for (const b of bolts) {
        const t01 = ((tt + b.phase) % b.cycle) / b.cycle;
        let alpha = 0;
        if (t01 > 0.74 && t01 < 0.77) alpha = 1;
        else if (t01 > 0.77 && t01 < 0.8) alpha = 0.5;
        if (alpha === 0) continue;

        // wide outer
        cx.strokeStyle = `rgba(100,160,250,${0.5 * alpha})`;
        cx.lineWidth = 8;
        cx.lineCap = 'round';
        cx.lineJoin = 'round';
        cx.beginPath();
        for (let i = 0; i < b.segs.length; i++) {
          const s = b.segs[i];
          if (i === 0) cx.moveTo(s.x, s.y); else cx.lineTo(s.x, s.y);
        }
        cx.stroke();
        // main channel
        cx.strokeStyle = `rgba(190,215,255,${0.95 * alpha})`;
        cx.lineWidth = 3;
        cx.beginPath();
        for (let i = 0; i < b.segs.length; i++) {
          const s = b.segs[i];
          if (i === 0) cx.moveTo(s.x, s.y); else cx.lineTo(s.x, s.y);
        }
        cx.stroke();
        // hot white core
        cx.strokeStyle = `rgba(245,248,255,${alpha})`;
        cx.lineWidth = 1.2;
        cx.beginPath();
        for (let i = 0; i < b.segs.length; i++) {
          const s = b.segs[i];
          if (i === 0) cx.moveTo(s.x, s.y); else cx.lineTo(s.x, s.y);
        }
        cx.stroke();
        // branches
        for (const br of b.branches) {
          cx.strokeStyle = `rgba(180,210,255,${0.75 * alpha})`;
          cx.lineWidth = 2;
          cx.beginPath();
          for (let i = 0; i < br.length; i++) {
            const s = br[i];
            if (i === 0) cx.moveTo(s.x, s.y); else cx.lineTo(s.x, s.y);
          }
          cx.stroke();
        }
      }

      // rain
      cx.lineCap = 'butt';
      for (const r of rain) {
        r.y += r.speed / 60;
        if (r.y > h) { r.y = -r.len; r.x = Math.random() * w * 1.3 - w * 0.15; }
        const dx = Math.sin(r.angle) * r.len;
        const dy = Math.cos(r.angle) * r.len;
        const grd = cx.createLinearGradient(r.x, r.y, r.x + dx, r.y + dy);
        grd.addColorStop(0, 'rgba(180,210,255,0)');
        grd.addColorStop(1, `rgba(180,210,255,${r.opacity})`);
        cx.strokeStyle = grd;
        cx.lineWidth = 1;
        cx.beginPath();
        cx.moveTo(r.x, r.y);
        cx.lineTo(r.x + dx, r.y + dy);
        cx.stroke();
      }

    }
    raf = requestAnimationFrame(draw);

    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} className={CANVAS_CLS} style={CANVAS_STYLE} aria-hidden="true" />;
}

/* ── Phoenix: rising fire particles + central glow ── */
function PhoenixBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const c = canvas;
    const cx = ctx;
    let raf: number;

    interface Particle { x: number; size: number; speed: number; drift: number; phase: number; color: string; tier: number; }
    interface Feather { x: number; y: number; size: number; rot: number; speed: number; drift: number; phase: number; color: string; }
    interface VortexP { angle: number; r: number; size: number; color: string; phase: number; speed: number; }
    let particles: Particle[] = [];
    let feathers: Feather[] = [];
    let vortex: VortexP[] = [];

    function build(w: number, h: number) {
      const r = seededRand(660);
      particles = [];
      for (let i = 0; i < 30; i++) particles.push({
        x: r() * w, size: 1.5 + r() * 2.5,
        speed: 10 + r() * 10, drift: (r() - 0.5) * 70,
        phase: r() * 10, color: '#fde68a', tier: 0,
      });
      for (let i = 0; i < 20; i++) particles.push({
        x: r() * w, size: 3 + r() * 4,
        speed: 14 + r() * 14, drift: (r() - 0.5) * 90,
        phase: r() * 12, color: r() > 0.5 ? '#fbbf24' : '#f97316', tier: 1,
      });
      for (let i = 0; i < 12; i++) particles.push({
        x: r() * w, size: 5 + r() * 5,
        speed: 18 + r() * 20, drift: (r() - 0.5) * 110,
        phase: r() * 14, color: '#ef4444', tier: 2,
      });
      const rf = seededRand(665);
      feathers = Array.from({ length: 8 }, () => ({
        x: (20 + rf() * 60) / 100 * w,
        y: (15 + rf() * 50) / 100 * h,
        size: 8 + rf() * 16,
        rot: rf() * Math.PI * 2,
        speed: 10 + rf() * 14,
        drift: (rf() - 0.5) * 80,
        phase: rf() * 12,
        color: rf() < 0.4 ? '#f59e0b' : rf() < 0.7 ? '#ef4444' : '#fb923c',
      }));
      const rv = seededRand(664);
      vortex = Array.from({ length: 16 }, (_, i) => ({
        angle: (i / 16) * Math.PI * 2,
        r: 35 + rv() * 50,
        size: 2 + rv() * 4,
        color: rv() > 0.5 ? '#fbbf24' : rv() > 0.3 ? '#f97316' : '#ef4444',
        phase: rv() * Math.PI * 2,
        speed: 0.5 + rv() * 0.5,
      }));
    }

    function resize() {
      c.width = Math.max(1, Math.ceil(c.offsetWidth / 2));
      c.height = Math.max(1, Math.ceil(c.offsetHeight / 2));
      build(c.width, c.height);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(c);

    let lastMs = 0;
    function draw(ms: number) {
      raf = requestAnimationFrame(draw);
      if (ms - lastMs < 50) return;
      lastMs = ms;
      const w = c.width, h = c.height;
      const tt = ms / 1000;
      cx.clearRect(0, 0, w, h);

      // intense fire base
      const heat = 1 + Math.sin(tt * 0.6) * 0.2;
      const bg = cx.createLinearGradient(0, h, 0, h * 0.35);
      bg.addColorStop(0, `rgba(180,60,10,${0.5 * heat})`);
      bg.addColorStop(0.35, `rgba(239,68,68,${0.3 * heat})`);
      bg.addColorStop(0.65, 'rgba(245,158,11,0.12)');
      bg.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = bg;
      cx.fillRect(0, 0, w, h);

      // central phoenix glow
      const coreS = 1 + Math.sin(tt * 0.4) * 0.1;
      const cgx = w / 2, cgy = h * 0.42;
      const cg = cx.createRadialGradient(cgx, cgy, 0, cgx, cgy, w * 0.3 * coreS);
      cg.addColorStop(0, 'rgba(245,158,11,0.25)');
      cg.addColorStop(0.4, 'rgba(239,68,68,0.1)');
      cg.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = cg;
      cx.beginPath();
      cx.arc(cgx, cgy, w * 0.3 * coreS, 0, Math.PI * 2);
      cx.fill();

      // phoenix bird silhouette - draw stylized
      cx.save();
      cx.translate(cgx, cgy + Math.sin(tt * 0.9) * 14);
      // body
      const bodyG = cx.createRadialGradient(0, 0, 0, 0, 0, 90);
      bodyG.addColorStop(0, 'rgba(254,243,199,0.4)');
      bodyG.addColorStop(0.5, 'rgba(251,191,36,0.3)');
      bodyG.addColorStop(1, 'rgba(239,68,68,0.05)');
      cx.fillStyle = bodyG;
      cx.beginPath();
      cx.ellipse(0, 0, 35, 85, 0, 0, Math.PI * 2);
      cx.fill();

      // wings
      const wingFlap = Math.sin(tt * 1.7) * 0.25;
      cx.save();
      cx.rotate(-wingFlap);
      const wg = cx.createLinearGradient(0, 0, -200, 0);
      wg.addColorStop(0, 'rgba(239,68,68,0.35)');
      wg.addColorStop(0.5, 'rgba(249,115,22,0.2)');
      wg.addColorStop(1, 'rgba(251,191,36,0)');
      cx.fillStyle = wg;
      cx.beginPath();
      cx.moveTo(-20, -10);
      cx.quadraticCurveTo(-130, -100, -210, -130);
      cx.quadraticCurveTo(-150, -50, -100, -10);
      cx.lineTo(-20, -10);
      cx.fill();
      cx.restore();

      cx.save();
      cx.rotate(wingFlap);
      const wg2 = cx.createLinearGradient(0, 0, 200, 0);
      wg2.addColorStop(0, 'rgba(239,68,68,0.35)');
      wg2.addColorStop(0.5, 'rgba(249,115,22,0.2)');
      wg2.addColorStop(1, 'rgba(251,191,36,0)');
      cx.fillStyle = wg2;
      cx.beginPath();
      cx.moveTo(20, -10);
      cx.quadraticCurveTo(130, -100, 210, -130);
      cx.quadraticCurveTo(150, -50, 100, -10);
      cx.lineTo(20, -10);
      cx.fill();
      cx.restore();

      // head
      cx.fillStyle = 'rgba(251,191,36,0.4)';
      cx.beginPath();
      cx.ellipse(0, -100, 14, 18, 0, 0, Math.PI * 2);
      cx.fill();

      // tail flames
      cx.fillStyle = 'rgba(220,38,38,0.4)';
      const tailW = 1 + Math.sin(tt * 1.2) * 0.15;
      cx.beginPath();
      cx.moveTo(0, 80);
      cx.quadraticCurveTo(-50 * tailW, 180, -20, 240);
      cx.quadraticCurveTo(0, 200, 20, 240);
      cx.quadraticCurveTo(50 * tailW, 180, 0, 80);
      cx.fill();

      cx.restore();

      // fire vortex around phoenix
      for (const v of vortex) {
        const a = v.angle + tt * 0.5 * v.speed;
        const x = cgx + Math.cos(a) * v.r;
        const y = cgy + Math.sin(a) * v.r;
        const op = 0.5 + 0.5 * Math.sin(tt * v.speed + v.phase);
        cx.globalAlpha = Math.max(0, op * 0.85);
        cx.fillStyle = v.color;
        cx.beginPath();
        cx.arc(x, y, v.size, 0, Math.PI * 2);
        cx.fill();
      }
      cx.globalAlpha = 1;

      // floating feathers
      for (const f of feathers) {
        const t01 = ((tt + f.phase) / f.speed) % 1;
        const y = f.y - t01 * h * 0.4;
        const x = f.x + t01 * f.drift;
        const a = t01 < 0.15 ? t01 / 0.15 * 0.4 : t01 > 0.85 ? (1 - t01) / 0.15 * 0.15 : 0.3;
        cx.save();
        cx.translate(x, y);
        cx.rotate(f.rot + t01 * Math.PI);
        cx.globalAlpha = Math.max(0, a);
        const fg = cx.createLinearGradient(0, -f.size / 2, 0, f.size / 2);
        fg.addColorStop(0, f.color);
        fg.addColorStop(1, 'rgba(0,0,0,0)');
        cx.fillStyle = fg;
        cx.beginPath();
        cx.ellipse(0, 0, f.size * 0.2, f.size * 0.5, 0, 0, Math.PI * 2);
        cx.fill();
        cx.restore();
      }
      cx.globalAlpha = 1;

      // rising particles
      for (const p of particles) {
        const t01 = ((tt + p.phase) / p.speed) % 1;
        const y = h - t01 * h * 0.9;
        const x = p.x + t01 * p.drift;
        const a = p.tier === 0
          ? (1 - t01) * 0.9
          : p.tier === 1
            ? (t01 < 0.3 ? 0.75 : 0.55 * (1 - t01))
            : (t01 < 0.4 ? 0.6 : 0.4 * (1 - t01));
        cx.globalAlpha = Math.max(0, a);
        cx.fillStyle = p.color;
        cx.beginPath();
        cx.arc(x, y, p.size, 0, Math.PI * 2);
        cx.fill();
        const gg = cx.createRadialGradient(x, y, 0, x, y, p.size * 5);
        gg.addColorStop(0, p.color);
        gg.addColorStop(1, 'rgba(0,0,0,0)');
        cx.globalAlpha = Math.max(0, a * 0.4);
        cx.fillStyle = gg;
        cx.beginPath();
        cx.arc(x, y, p.size * 5, 0, Math.PI * 2);
        cx.fill();
      }
      cx.globalAlpha = 1;

    }
    raf = requestAnimationFrame(draw);

    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} className={CANVAS_CLS} style={CANVAS_STYLE} aria-hidden="true" />;
}

/* ── RetroArcade: pixel-art arcade game elements ── */
function RetroArcadeBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const c = canvas;
    const cx = ctx;
    let raf: number;

    interface Invader { x: number; y: number; type: number; color: string; cycle: number; phase: number; }
    interface Ghost { x: number; y: number; color: string; speed: number; dir: number; phase: number; }
    interface Tet { x: number; y: number; shape: number[][]; color: string; speed: number; rot: number; phase: number; }
    interface Laser { x: number; y: number; color: string; speed: number; phase: number; cycle: number; }
    interface Pac { x: number; y: number; }
    interface Coin { x: number; y: number; speed: number; phase: number; spin: number; }
    interface Snake { x: number; y: number; }
    let invaders: Invader[] = [];
    let ghosts: Ghost[] = [];
    let tetrominoes: Tet[] = [];
    let lasers: Laser[] = [];
    let coins: Coin[] = [];
    let snake: Snake[] = [];
    let pacX = -20;
    let stars: { x: number; y: number; size: number; color: string; phase: number; speed: number }[] = [];

    // Space Invader patterns (8x7 pixel grids)
    const invaderPixels: [number, number][][] = [
      // crab
      [[2,0],[5,0],[0,1],[2,1],[3,1],[4,1],[5,1],[7,1],[0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],[0,3],[1,3],[3,3],[4,3],[6,3],[7,3],[0,4],[1,4],[2,4],[3,4],[4,4],[5,4],[6,4],[7,4],[1,5],[2,5],[5,5],[6,5],[0,6],[2,6],[5,6],[7,6]],
      // squid
      [[3,0],[0,1],[2,1],[3,1],[4,1],[6,1],[0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[0,3],[1,3],[2,3],[3,3],[4,3],[5,3],[6,3],[1,4],[2,4],[4,4],[5,4],[0,5],[1,5],[5,5],[6,5],[1,6],[5,6]],
      // octo
      [[3,0],[1,1],[3,1],[5,1],[0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[0,3],[2,3],[4,3],[6,3],[0,4],[1,4],[2,4],[3,4],[4,4],[5,4],[6,4],[2,5],[4,5],[0,6],[1,6],[5,6],[6,6]],
    ];

    // Tetris shapes
    const tetrisShapes: number[][][] = [
      [[1,1,1,1]],
      [[1,1],[1,1]],
      [[0,1,0],[1,1,1]],
      [[1,0],[1,0],[1,1]],
      [[0,1],[0,1],[1,1]],
      [[1,1,0],[0,1,1]],
      [[0,1,1],[1,1,0]],
    ];
    const tetrisColors = ['#00ffff', '#ffff00', '#ff00ff', '#00ff00', '#ff6600', '#ff0000', '#0088ff'];
    const ghostColors = ['#ff0000', '#ffb8ff', '#00ffff', '#ffb852'];

    function build(w: number, h: number) {
      const r = seededRand(801);
      invaders = Array.from({ length: 12 }, (_, i) => ({
        x: (3 + (i % 6) * 16) / 100 * w + r() * 8,
        y: (4 + Math.floor(i / 6) * 12) / 100 * h + r() * 5,
        type: i % 3,
        color: i % 3 === 0 ? '#00ff88' : i % 3 === 1 ? '#ff00ff' : '#00ffff',
        cycle: 3.5 + r() * 3,
        phase: r() * 5,
      }));
      const rg = seededRand(802);
      ghosts = Array.from({ length: 4 }, (_, i) => ({
        x: (5 + rg() * 85) / 100 * w,
        y: (45 + rg() * 40) / 100 * h,
        color: ghostColors[i],
        speed: 14 + rg() * 12,
        dir: rg() > 0.5 ? 1 : -1,
        phase: rg() * 10,
      }));
      const rt = seededRand(806);
      tetrominoes = Array.from({ length: 12 }, () => {
        const si = Math.floor(rt() * tetrisShapes.length);
        return {
          x: rt() * w * 0.92,
          y: -50,
          shape: tetrisShapes[si],
          color: tetrisColors[Math.floor(rt() * tetrisColors.length)],
          speed: 10 + rt() * 18,
          rot: Math.floor(rt() * 4) * Math.PI / 2,
          phase: rt() * 22,
        };
      });
      const rl = seededRand(807);
      lasers = Array.from({ length: 10 }, () => ({
        x: (8 + rl() * 84) / 100 * w, y: h,
        color: rl() < 0.5 ? '#00ff88' : '#ff4444',
        speed: 100 + rl() * 100,
        phase: rl() * 14,
        cycle: 0.5 + rl() * 0.7,
      }));
      const rc = seededRand(803);
      coins = Array.from({ length: 15 }, () => ({
        x: rc() * w, y: -20,
        speed: 30 + rc() * 40,
        phase: rc() * 18,
        spin: rc() * Math.PI * 2,
      }));
      // snake segments
      snake = [];
      let sx = w * 0.1, sy = h * 0.4;
      for (let i = 0; i < 12; i++) {
        snake.push({ x: sx, y: sy });
        if (i % 3 === 0) sx += 14;
        else sy += 12;
      }
      const rs = seededRand(800);
      stars = Array.from({ length: 50 }, () => ({
        x: rs() * w, y: rs() * h,
        size: 0.5 + rs() * 1.5,
        color: rs() < 0.3 ? '#ff88ff' : rs() < 0.6 ? '#88ffff' : '#ffffff',
        phase: rs() * Math.PI * 2,
        speed: 0.5 + rs() * 2,
      }));
    }

    function resize() {
      c.width = Math.max(1, Math.ceil(c.offsetWidth / 2));
      c.height = Math.max(1, Math.ceil(c.offsetHeight / 2));
      build(c.width, c.height);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(c);

    function drawInvader(x: number, y: number, type: number, color: string, scale: number) {
      const p = 4 * scale;
      cx.fillStyle = color;
      cx.globalAlpha = 0.7;
      for (const [px, py] of invaderPixels[type]) {
        cx.fillRect(x + px * p, y + py * p, p, p);
      }
      cx.globalAlpha = 1;
    }

    function drawGhost(x: number, y: number, color: string, dir: number) {
      const sc = 1.8;
      cx.fillStyle = color;
      cx.globalAlpha = 0.6;
      // body
      cx.beginPath();
      cx.moveTo(x + 1 * sc, y + 14 * sc);
      cx.lineTo(x + 1 * sc, y + 5 * sc);
      cx.quadraticCurveTo(x + 1 * sc, y + 1 * sc, x + 7 * sc, y + 1 * sc);
      cx.quadraticCurveTo(x + 13 * sc, y + 1 * sc, x + 13 * sc, y + 5 * sc);
      cx.lineTo(x + 13 * sc, y + 14 * sc);
      cx.lineTo(x + 11 * sc, y + 12 * sc);
      cx.lineTo(x + 9 * sc, y + 14 * sc);
      cx.lineTo(x + 7 * sc, y + 12 * sc);
      cx.lineTo(x + 5 * sc, y + 14 * sc);
      cx.lineTo(x + 3 * sc, y + 12 * sc);
      cx.closePath();
      cx.fill();
      cx.globalAlpha = 1;
      // eyes
      cx.fillStyle = '#ffffff';
      cx.fillRect(x + 3 * sc, y + 5 * sc, 3 * sc, 3 * sc);
      cx.fillRect(x + 8 * sc, y + 5 * sc, 3 * sc, 3 * sc);
      // pupils
      cx.fillStyle = '#111111';
      const px = dir > 0 ? 1 : 0;
      cx.fillRect(x + (3 + px) * sc + 0.5, y + 6 * sc + 0.5, 1.5 * sc, 1.5 * sc);
      cx.fillRect(x + (8 + px) * sc + 0.5, y + 6 * sc + 0.5, 1.5 * sc, 1.5 * sc);
    }

    function drawTetromino(x: number, y: number, shape: number[][], color: string, rot: number) {
      const size = 7;
      cx.save();
      cx.translate(x + shape[0].length * size / 2, y + shape.length * size / 2);
      cx.rotate(rot);
      cx.translate(-shape[0].length * size / 2, -shape.length * size / 2);
      cx.fillStyle = color;
      cx.strokeStyle = color;
      cx.globalAlpha = 0.5;
      for (let r = 0; r < shape.length; r++) {
        for (let cc = 0; cc < shape[r].length; cc++) {
          if (shape[r][cc]) {
            cx.fillRect(cc * size + 1, r * size + 1, size - 2, size - 2);
            cx.lineWidth = 1;
            cx.strokeRect(cc * size + 0.5, r * size + 0.5, size - 1, size - 1);
          }
        }
      }
      cx.globalAlpha = 1;
      cx.restore();
    }

    let lastMs = 0;
    function draw(ms: number) {
      raf = requestAnimationFrame(draw);
      if (ms - lastMs < 50) return;
      lastMs = ms;
      const w = c.width, h = c.height;
      const tt = ms / 1000;
      cx.clearRect(0, 0, w, h);

      // deep space background
      const bg = cx.createRadialGradient(w / 2, h * 0.4, 0, w / 2, h * 0.4, w * 0.6);
      bg.addColorStop(0, 'rgba(20,8,50,0.45)');
      bg.addColorStop(0.5, 'rgba(4,4,16,0.2)');
      bg.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = bg;
      cx.beginPath();
      cx.arc(w / 2, h * 0.4, w * 0.6, 0, Math.PI * 2);
      cx.fill();

      // ambient neon glow clouds
      const ng = (x: number, y: number, rad: number, color: string) => {
        const g = cx.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        cx.fillStyle = g;
        cx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      };
      const glow = 1 + Math.sin(tt * 0.5) * 0.15;
      ng(w * 0.18, h * 0.2, w * 0.15 * glow, 'rgba(255,0,255,0.1)');
      ng(w * 0.85, h * 0.4, w * 0.18 * glow, 'rgba(0,255,255,0.08)');
      ng(w * 0.45, h * 0.7, w * 0.13 * glow, 'rgba(0,255,136,0.08)');

      // stars
      for (const s of stars) {
        const op = 0.3 + 0.5 * Math.sin(tt * s.speed + s.phase);
        cx.globalAlpha = Math.max(0, op);
        cx.fillStyle = s.color;
        cx.fillRect(s.x, s.y, s.size, s.size);
      }
      cx.globalAlpha = 1;

      // pixel grid overlay (subtle)
      cx.strokeStyle = 'rgba(0,255,100,0.04)';
      cx.lineWidth = 1;
      for (let x = 0; x < w; x += 24) {
        cx.beginPath();
        cx.moveTo(x, 0);
        cx.lineTo(x, h);
        cx.stroke();
      }
      for (let y = 0; y < h; y += 24) {
        cx.beginPath();
        cx.moveTo(0, y);
        cx.lineTo(w, y);
        cx.stroke();
      }

      // space invaders - march in formation
      for (const inv of invaders) {
        const t01 = ((tt + inv.phase) % inv.cycle) / inv.cycle;
        const xoff = Math.sin(t01 * Math.PI * 2) * 8;
        drawInvader(inv.x + xoff, inv.y, inv.type, inv.color, 1);
      }

      // pac-man chomping across
      pacX = ((tt * 0.08) % 1.1) * w - w * 0.05;
      const pacY = h * 0.68;
      const chomp = Math.abs(Math.sin(tt * 8));
      cx.fillStyle = '#ffff00';
      cx.globalAlpha = 0.85;
      cx.beginPath();
      const mouthAngle = chomp * 0.5;
      cx.arc(pacX, pacY, 12, mouthAngle, Math.PI * 2 - mouthAngle);
      cx.lineTo(pacX, pacY);
      cx.fill();
      cx.globalAlpha = 1;
      // dot trail
      cx.fillStyle = '#ffff00';
      cx.globalAlpha = 0.3;
      for (let i = 0; i < 25; i++) {
        const dx = i * (w / 25);
        if (dx > pacX + 20) cx.fillRect(dx - 1.5, pacY - 1.5, 3, 3);
      }
      cx.globalAlpha = 1;

      // ghosts
      for (const g of ghosts) {
        const t01 = ((tt + g.phase) % g.speed) / g.speed;
        const x = g.x + g.dir * t01 * 200;
        const op = t01 < 0.06 ? t01 / 0.06 : t01 > 0.94 ? (1 - t01) / 0.06 : 0.55;
        cx.globalAlpha = Math.max(0, op);
        drawGhost(x, g.y, g.color, g.dir);
      }
      cx.globalAlpha = 1;

      // tetris pieces falling
      for (const t of tetrominoes) {
        const t01 = ((tt + t.phase) / t.speed) % 1;
        const y = -50 + t01 * (h + 100);
        const op = t01 < 0.05 ? t01 / 0.05 * 0.4 : t01 > 0.95 ? (1 - t01) / 0.05 * 0.4 : 0.4;
        cx.globalAlpha = Math.max(0, op);
        drawTetromino(t.x, y, t.shape, t.color, t.rot);
      }
      cx.globalAlpha = 1;

      // snake
      cx.fillStyle = '#88ff00';
      for (let i = 0; i < snake.length; i++) {
        const seg = snake[i];
        const x = seg.x + Math.sin(tt * 0.4) * 30;
        const y = seg.y + Math.cos(tt * 0.3) * 15;
        cx.globalAlpha = 0.4 - i * 0.02;
        cx.fillRect(x, y, 8, 8);
      }
      cx.globalAlpha = 1;
      // apple
      cx.fillStyle = '#ff0040';
      cx.globalAlpha = 0.5;
      const ax = snake[0].x + 80 + Math.sin(tt * 0.4) * 30;
      const ay = snake[0].y + Math.cos(tt * 0.3) * 15;
      cx.beginPath();
      cx.arc(ax, ay, 4, 0, Math.PI * 2);
      cx.fill();
      cx.globalAlpha = 1;

      // pong paddles + ball
      const pongY = h * 0.45;
      const paddleH = 50;
      const paddleW = 6;
      const ballX = w * 0.5 + Math.sin(tt * 1.5) * w * 0.3;
      const ballY = pongY + paddleH / 2 + Math.sin(tt * 4) * 8;
      // paddles track ball with lag
      const leftPY = ballY - paddleH / 2 + Math.sin(tt * 1.4) * 12;
      const rightPY = ballY - paddleH / 2 + Math.sin(tt * 1.4 + 0.5) * 10;
      cx.fillStyle = '#ffffff';
      cx.globalAlpha = 0.3;
      cx.fillRect(w * 0.02, leftPY, paddleW, paddleH);
      cx.fillRect(w * 0.96, rightPY, paddleW, paddleH);
      // ball
      cx.fillRect(ballX, ballY, 6, 6);
      // center line dotted
      cx.globalAlpha = 0.1;
      for (let yy = 0; yy < h; yy += 18) {
        cx.fillRect(w / 2 - 1, yy, 2, 8);
      }
      cx.globalAlpha = 1;

      // laser shots rising from bottom
      for (const l of lasers) {
        const t01 = ((tt + l.phase) / l.cycle) % 1;
        const y = h - t01 * h;
        const op = t01 < 0.05 ? t01 / 0.05 * 0.6 : t01 > 0.95 ? (1 - t01) / 0.05 * 0.4 : 0.6;
        cx.fillStyle = l.color;
        cx.globalAlpha = Math.max(0, op);
        cx.fillRect(l.x - 1, y, 2, 14);
      }
      cx.globalAlpha = 1;

      // falling coins
      for (const co of coins) {
        const t01 = ((tt + co.phase) / co.speed) % 1;
        const y = -20 + t01 * (h + 40);
        const op = t01 < 0.05 ? t01 / 0.05 * 0.35 : t01 > 0.95 ? (1 - t01) / 0.05 * 0.15 : 0.3;
        const spinW = Math.abs(Math.cos(tt * 6 + co.spin)) * 6 + 1;
        cx.fillStyle = '#ffd700';
        cx.globalAlpha = Math.max(0, op);
        cx.beginPath();
        cx.ellipse(co.x, y, spinW, 5, 0, 0, Math.PI * 2);
        cx.fill();
      }
      cx.globalAlpha = 1;

      // CRT scanlines overlay
      cx.fillStyle = 'rgba(0,0,0,0.15)';
      for (let y = 0; y < h; y += 3) {
        cx.fillRect(0, y, w, 1);
      }

      // neon border glow on edges
      const edgeG = (x: number, y: number, ww: number, hh: number, color: string) => {
        const g = cx.createLinearGradient(x, y, x + ww, y + hh);
        g.addColorStop(0, color + '0)');
        g.addColorStop(0.5, color + '0.15)');
        g.addColorStop(1, color + '0)');
        cx.fillStyle = g;
        cx.fillRect(x, y, ww, hh);
      };
      // left edge
      const lg = cx.createLinearGradient(0, 0, 0, h);
      lg.addColorStop(0, 'rgba(255,0,255,0)');
      lg.addColorStop(0.5, 'rgba(255,0,255,0.15)');
      lg.addColorStop(1, 'rgba(0,255,255,0)');
      cx.fillStyle = lg;
      cx.fillRect(0, 0, 2, h);
      const rg2 = cx.createLinearGradient(0, 0, 0, h);
      rg2.addColorStop(0, 'rgba(0,255,255,0)');
      rg2.addColorStop(0.5, 'rgba(0,255,255,0.15)');
      rg2.addColorStop(1, 'rgba(255,0,255,0)');
      cx.fillStyle = rg2;
      cx.fillRect(w - 2, 0, 2, h);
      const tg = cx.createLinearGradient(0, 0, w, 0);
      tg.addColorStop(0, 'rgba(255,0,255,0)');
      tg.addColorStop(0.5, 'rgba(255,0,255,0.1)');
      tg.addColorStop(1, 'rgba(0,255,255,0)');
      cx.fillStyle = tg;
      cx.fillRect(0, 0, w, 2);
      const bg2 = cx.createLinearGradient(0, 0, w, 0);
      bg2.addColorStop(0, 'rgba(0,255,136,0)');
      bg2.addColorStop(0.5, 'rgba(0,255,136,0.12)');
      bg2.addColorStop(1, 'rgba(255,0,255,0)');
      cx.fillStyle = bg2;
      cx.fillRect(0, h - 2, w, 2);

      // CRT vignette
      const vg = cx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.4)');
      cx.fillStyle = vg;
      cx.beginPath();
      cx.arc(w / 2, h / 2, Math.max(w, h) * 0.7, 0, Math.PI * 2);
      cx.fill();

    }
    raf = requestAnimationFrame(draw);

    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} className={CANVAS_CLS} style={CANVAS_STYLE} aria-hidden="true" />;
}

/* ── Starfield simple version (full Starfield component lives in StarfieldBg.tsx) ── */
function StarfieldSimpleBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const c = canvas;
    const cx = ctx;
    let raf: number;

    interface Star { x: number; y: number; size: number; baseOp: number; phase: number; speed: number; bright: boolean; color: string; }
    let stars: Star[] = [];

    function build(w: number, h: number) {
      const r = seededRand(555);
      stars = Array.from({ length: 200 }, () => ({
        x: r() * w, y: r() * h,
        size: 0.4 + r() * 2.5,
        baseOp: 0.15 + r() * 0.7,
        phase: r() * Math.PI * 2,
        speed: 0.5 + r() * 2.5,
        bright: r() < 0.2,
        color: r() < 0.3 ? '180,200,255' : r() < 0.5 ? '220,200,255' : '199,210,254',
      }));
    }

    function resize() {
      c.width = Math.max(1, Math.ceil(c.offsetWidth / 2));
      c.height = Math.max(1, Math.ceil(c.offsetHeight / 2));
      build(c.width, c.height);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(c);

    let lastMs = 0;
    function draw(ms: number) {
      raf = requestAnimationFrame(draw);
      if (ms - lastMs < 50) return;
      lastMs = ms;
      const w = c.width, h = c.height;
      const tt = ms / 1000;
      cx.clearRect(0, 0, w, h);

      // nebula background
      const n1 = cx.createRadialGradient(w * 0.25, h * 0.35, 0, w * 0.25, h * 0.35, w * 0.4);
      n1.addColorStop(0, 'rgba(99,102,241,0.12)');
      n1.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = n1;
      cx.beginPath();
      cx.arc(w * 0.25, h * 0.35, w * 0.4, 0, Math.PI * 2);
      cx.fill();
      const n2 = cx.createRadialGradient(w * 0.75, h * 0.65, 0, w * 0.75, h * 0.65, w * 0.35);
      n2.addColorStop(0, 'rgba(139,92,246,0.1)');
      n2.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = n2;
      cx.beginPath();
      cx.arc(w * 0.75, h * 0.65, w * 0.35, 0, Math.PI * 2);
      cx.fill();

      // stars
      for (const s of stars) {
        const op = s.baseOp * (0.4 + 0.6 * Math.sin(tt * s.speed + s.phase));
        cx.globalAlpha = Math.max(0, op);
        if (s.bright) {
          const grd = cx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size * 4);
          grd.addColorStop(0, `rgba(${s.color},${op})`);
          grd.addColorStop(1, 'rgba(0,0,0,0)');
          cx.fillStyle = grd;
          cx.beginPath();
          cx.arc(s.x, s.y, s.size * 4, 0, Math.PI * 2);
          cx.fill();
        }
        cx.fillStyle = `rgb(${s.color})`;
        cx.beginPath();
        cx.arc(s.x, s.y, s.size / 2, 0, Math.PI * 2);
        cx.fill();
      }
      cx.globalAlpha = 1;

    }
    raf = requestAnimationFrame(draw);

    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} className={CANVAS_CLS} style={CANVAS_STYLE} aria-hidden="true" />;
}

/* ── Light: soft sunlit floating motes + rays ── */
function LightBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const c = canvas;
    const cx = ctx;
    let raf: number;

    interface Mote { x: number; y: number; size: number; phase: number; speed: number; }
    let motes: Mote[] = [];

    function build(w: number, h: number) {
      const r = seededRand(888);
      motes = Array.from({ length: 30 }, () => ({
        x: r() * w, y: r() * h,
        size: 1 + r() * 3,
        phase: r() * Math.PI * 2,
        speed: 0.3 + r() * 0.5,
      }));
    }

    function resize() {
      c.width = Math.max(1, Math.ceil(c.offsetWidth / 2));
      c.height = Math.max(1, Math.ceil(c.offsetHeight / 2));
      build(c.width, c.height);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(c);

    let lastMs = 0;
    function draw(ms: number) {
      raf = requestAnimationFrame(draw);
      if (ms - lastMs < 50) return;
      lastMs = ms;
      const w = c.width, h = c.height;
      const tt = ms / 1000;
      cx.clearRect(0, 0, w, h);

      // warm sun glow
      const sg = cx.createRadialGradient(w / 2, 0, 0, w / 2, 0, h * 0.7);
      sg.addColorStop(0, 'rgba(250,204,21,0.08)');
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = sg;
      cx.beginPath();
      cx.arc(w / 2, 0, h * 0.7, 0, Math.PI * 2);
      cx.fill();

      // soft sunbeams
      for (let i = 0; i < 7; i++) {
        const x = (20 + i * 10) / 100 * w;
        const angle = (-12 + i * 4) * Math.PI / 180;
        const op = 0.6 + 0.4 * Math.sin(tt * 0.4 + i);
        cx.save();
        cx.translate(x, 0);
        cx.rotate(angle);
        const rg = cx.createLinearGradient(0, 0, 0, h);
        rg.addColorStop(0, `rgba(250,204,21,${0.04 * op})`);
        rg.addColorStop(0.7, 'rgba(0,0,0,0)');
        cx.fillStyle = rg;
        cx.fillRect(-3, 0, 6, h);
        cx.restore();
      }

      // orb in upper-left
      const orbS = 1 + Math.sin(tt * 0.3) * 0.15;
      const og = cx.createRadialGradient(w * 0.3, 0, 0, w * 0.3, 0, w * 0.25 * orbS);
      og.addColorStop(0, 'rgba(251,191,36,0.12)');
      og.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = og;
      cx.beginPath();
      cx.arc(w * 0.3, 0, w * 0.25 * orbS, 0, Math.PI * 2);
      cx.fill();

      // floating motes
      for (const m of motes) {
        const y = m.y + Math.sin(tt * m.speed + m.phase) * 15;
        const op = 0.2 + 0.3 * Math.sin(tt * m.speed * 0.5 + m.phase);
        cx.fillStyle = `rgba(251,191,36,${op * 0.5})`;
        cx.beginPath();
        cx.arc(m.x, y, m.size, 0, Math.PI * 2);
        cx.fill();
      }

    }
    raf = requestAnimationFrame(draw);

    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} className={CANVAS_CLS} style={CANVAS_STYLE} aria-hidden="true" />;
}

/* ── Custom: subtle grid workshop ── */
function CustomBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const c = canvas;
    const cx = ctx;
    let raf: number;

    function resize() {
      c.width = Math.max(1, Math.ceil(c.offsetWidth / 2));
      c.height = Math.max(1, Math.ceil(c.offsetHeight / 2));
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(c);

    let lastMs = 0;
    function draw(ms: number) {
      raf = requestAnimationFrame(draw);
      if (ms - lastMs < 50) return;
      lastMs = ms;
      const w = c.width, h = c.height;
      const tt = ms / 1000;
      cx.clearRect(0, 0, w, h);

      // subtle grid
      cx.strokeStyle = 'rgba(129,140,248,0.04)';
      cx.lineWidth = 1;
      for (let x = 0; x < w; x += 40) {
        cx.beginPath();
        cx.moveTo(x, h * 0.05);
        cx.lineTo(x, h * 0.95);
        cx.stroke();
      }
      for (let y = 0; y < h; y += 40) {
        cx.beginPath();
        cx.moveTo(0, y);
        cx.lineTo(w, y);
        cx.stroke();
      }

      // pulsing glows
      const glow1 = 1 + Math.sin(tt * 0.4) * 0.15;
      const g1 = cx.createRadialGradient(w * 0.25, h * 0.35, 0, w * 0.25, h * 0.35, w * 0.2 * glow1);
      g1.addColorStop(0, 'rgba(74,222,128,0.08)');
      g1.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = g1;
      cx.beginPath();
      cx.arc(w * 0.25, h * 0.35, w * 0.2 * glow1, 0, Math.PI * 2);
      cx.fill();
      const glow2 = 1 + Math.sin(tt * 0.5 + 1) * 0.15;
      const g2 = cx.createRadialGradient(w * 0.8, h * 0.7, 0, w * 0.8, h * 0.7, w * 0.18 * glow2);
      g2.addColorStop(0, 'rgba(129,140,248,0.08)');
      g2.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = g2;
      cx.beginPath();
      cx.arc(w * 0.8, h * 0.7, w * 0.18 * glow2, 0, Math.PI * 2);
      cx.fill();

      // spinning dashed circles
      const circles = [{ x: 0.15, y: 0.25, r: 70 }, { x: 0.82, y: 0.7, r: 90 }, { x: 0.5, y: 0.85, r: 60 }];
      cx.strokeStyle = 'rgba(129,140,248,0.08)';
      cx.lineWidth = 1;
      for (let i = 0; i < circles.length; i++) {
        const cir = circles[i];
        cx.save();
        cx.translate(cir.x * w, cir.y * h);
        cx.rotate(tt * 0.1 * (i + 1));
        cx.setLineDash([4, 6]);
        cx.beginPath();
        cx.arc(0, 0, cir.r, 0, Math.PI * 2);
        cx.stroke();
        cx.restore();
      }
      cx.setLineDash([]);

    }
    raf = requestAnimationFrame(draw);

    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} className={CANVAS_CLS} style={CANVAS_STYLE} aria-hidden="true" />;
}
