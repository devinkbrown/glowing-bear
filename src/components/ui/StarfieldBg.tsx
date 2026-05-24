'use client';

import { useEffect, useRef } from 'react';

interface Star {
  x: number; y: number; size: number;
  r: number; g: number; b: number;
  baseOpacity: number; opacity: number;
  twinkleSpeed: number; twinkleOffset: number;
  glow: boolean;
}

function seededRand(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const COLORS = ['#e8eeff', '#a0b4ff', '#ffd6aa', '#c8a0ff', '#ffe0e0'];

export default function StarfieldBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Capture non-null references for closures
    const c = canvas;
    const cx2d = ctx;

    let raf: number;
    let stars: Star[] = [];

    const rand = seededRand(7);

    function buildStars(w: number, h: number) {
      stars = Array.from({ length: 320 }, () => {
        const r = rand();
        const tier = r < 0.55 ? 0 : r < 0.82 ? 1 : r < 0.94 ? 2 : 3;
        const size = tier === 0 ? 0.4 + rand() * 0.8
          : tier === 1 ? 1.2 + rand()
          : tier === 2 ? 2.2 + rand()
          : 3.2 + rand() * 0.8;
        const hueRoll = rand();
        const hex = hueRoll < 0.45 ? COLORS[0] : hueRoll < 0.65 ? COLORS[1]
          : hueRoll < 0.8 ? COLORS[2] : hueRoll < 0.92 ? COLORS[3] : COLORS[4];
        const [r2, g, b] = hexToRgb(hex);
        return {
          x: rand() * w, y: rand() * h, size,
          r: r2, g, b,
          baseOpacity: tier === 3 ? 0.6 + rand() * 0.35 : tier === 2 ? 0.4 + rand() * 0.4 : 0.1 + rand() * 0.5,
          opacity: 0,
          twinkleSpeed: tier === 3 ? 1.5 + rand() * 2.5 : 2 + rand() * 5,
          twinkleOffset: rand() * Math.PI * 2,
          glow: tier >= 2,
        };
      });
    }

    function resize() {
      if (!canvas) return;
      c.width = canvas.offsetWidth;
      c.height = canvas.offsetHeight;
      buildStars(c.width, c.height);
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(c);

    function draw(t: number) {
      const w = c.width;
      const h = c.height;
      cx2d.clearRect(0, 0, w, h);

      // Nebula gradients
      const drawNebula = (cx: number, cy: number, rx: number, ry: number, color: string, alpha: number) => {
        const grd = cx2d.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
        grd.addColorStop(0, color.replace(')', `, ${alpha})`).replace('rgb', 'rgba'));
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        cx2d.save();
        cx2d.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry));
        cx2d.fillStyle = grd;
        cx2d.beginPath();
        cx2d.arc(cx / (rx / Math.max(rx, ry)), cy / (ry / Math.max(rx, ry)), Math.max(rx, ry), 0, Math.PI * 2);
        cx2d.fill();
        cx2d.restore();
      };

      // Milky way band
      const band = cx2d.createLinearGradient(0, 0, w, h);
      band.addColorStop(0.15, 'rgba(0,0,0,0)');
      band.addColorStop(0.35, 'rgba(160,180,255,0.04)');
      band.addColorStop(0.5, 'rgba(200,180,255,0.06)');
      band.addColorStop(0.65, 'rgba(160,180,255,0.03)');
      band.addColorStop(0.85, 'rgba(0,0,0,0)');
      cx2d.fillStyle = band;
      cx2d.fillRect(0, 0, w, h);

      // Drifting nebulae
      const driftA = Math.sin(t / 40000) * 50;
      const driftB = Math.sin(t / 48000) * 40;

      drawNebula(w * 0.85 + driftA, h * -0.1 + driftA * 0.5, w * 0.4, h * 0.45, 'rgb(129,140,248)', 0.12);
      drawNebula(w * -0.1 + driftB, h * 1.1 + driftB * 0.5, w * 0.35, h * 0.4, 'rgb(192,132,252)', 0.10);
      drawNebula(w * 0.55, h * 0.35, w * 0.18, h * 0.25, 'rgb(45,212,191)', 0.06);
      drawNebula(w * 0.08, h * 0.12, w * 0.25, h * 0.15, 'rgb(255,180,120)', 0.05);

      // Stars
      for (const s of stars) {
        s.opacity = s.baseOpacity * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t / (s.twinkleSpeed * 1000) + s.twinkleOffset)));
        if (s.glow) {
          const grd = cx2d.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size * 4);
          grd.addColorStop(0, `rgba(${s.r},${s.g},${s.b},${s.opacity})`);
          grd.addColorStop(1, 'rgba(0,0,0,0)');
          cx2d.fillStyle = grd;
          cx2d.beginPath();
          cx2d.arc(s.x, s.y, s.size * 4, 0, Math.PI * 2);
          cx2d.fill();
        }
        cx2d.globalAlpha = s.opacity;
        cx2d.fillStyle = `rgb(${s.r},${s.g},${s.b})`;
        cx2d.beginPath();
        cx2d.arc(s.x, s.y, s.size / 2, 0, Math.PI * 2);
        cx2d.fill();
      }
      cx2d.globalAlpha = 1;

      raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden="true"
    />
  );
}
