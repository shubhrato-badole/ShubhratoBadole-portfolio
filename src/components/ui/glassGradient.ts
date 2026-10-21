'use client';
/* The animated smoky gradient behind the original's buttons: six sine "waves" filled with a fading colour, drawn on a small
   canvas that the CSS blurs (6px). Same wave table and maths as the original; it only runs while the button is on screen. */
type Wave = { amplitude: number; frequency: number; speed: number; phase: number; color: [number, number, number]; opacity: number; yOffset: number; direction: 1 | -1 };
const WAVES: Wave[] = [
  { amplitude: 0.25, frequency: 1.2, speed: 0.95, phase: 0, color: [155, 100, 255], opacity: 0.4, yOffset: 0.35, direction: 1 },
  { amplitude: 0.3, frequency: 0.9, speed: 0.7, phase: 1.8, color: [120, 150, 255], opacity: 0.35, yOffset: 0.5, direction: -1 },
  { amplitude: 0.2, frequency: 1.5, speed: 0.9, phase: 3.2, color: [80, 70, 180], opacity: 0.3, yOffset: 0.55, direction: 1 },
  { amplitude: 0.28, frequency: 1, speed: 0.65, phase: 4.8, color: [210, 185, 255], opacity: 0.35, yOffset: 0.4, direction: -1 },
  { amplitude: 0.22, frequency: 1.4, speed: 0.7, phase: 2.5, color: [175, 130, 255], opacity: 0.3, yOffset: 0.6, direction: 1 },
  { amplitude: 0.18, frequency: 1.7, speed: 0.9, phase: 5.5, color: [200, 160, 255], opacity: 0.25, yOffset: 0.45, direction: -1 },
];

const BLUE: [number, number, number][] = [[76, 111, 255], [60, 90, 235], [32, 48, 170], [140, 165, 255], [90, 120, 255], [170, 190, 255]];   // the hero's cobalt family
const waveY = (x: number, w: Wave, t: number, h: number) => {
  const a = Math.sin(t * w.speed * 1.008 + w.phase) * 3, b = Math.cos(t * w.speed * 0.72 + w.phase + 1.5) * 2.5, c = Math.sin(t * w.speed * 1.296 + w.phase + 3) * 2;
  const A = w.amplitude * (1 + Math.sin(t * w.speed * 0.576 + w.phase + 0.7) * 0.3), drift = Math.sin(t * w.speed * 0.432 + w.phase + 2) * h * 0.08;
  return w.yOffset * h + drift + Math.sin(x * Math.PI * 2 * w.frequency + a + w.phase) * h * A + Math.sin(x * Math.PI * 2 * w.frequency * 2.1 + b + w.phase + 2) * h * A * 0.35 + Math.cos(x * Math.PI * 2 * w.frequency * 3.3 + c + w.phase + 5) * h * A * 0.15;
};

function drawWave(ctx: CanvasRenderingContext2D, w: Wave, t: number, W: number, H: number) {
  const [r, g, b] = w.color, S = 64;
  ctx.beginPath(); ctx.moveTo(0, waveY(0, w, t, H));
  for (let i = 1; i <= S; i++) ctx.lineTo((i / S) * W, waveY(i / S, w, t, H));
  if (w.direction === 1) { ctx.lineTo(W, H + 20); ctx.lineTo(0, H + 20); } else { ctx.lineTo(W, -20); ctx.lineTo(0, -20); }
  ctx.closePath();
  let edge = w.direction === 1 ? Infinity : -Infinity;
  for (let i = 0; i < 8; i++) { const y = waveY(i / 7, w, t, H); edge = w.direction === 1 ? Math.min(edge, y) : Math.max(edge, y); }
  const far = w.direction === 1 ? edge + H * 0.6 : edge - H * 0.6;
  const grad = ctx.createLinearGradient(0, edge, 0, far);
  grad.addColorStop(0, `rgba(${r},${g},${b},${w.opacity})`); grad.addColorStop(0.4, `rgba(${r},${g},${b},${w.opacity * 0.6})`); grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad; ctx.fill();
}

export function startGradient(canvas: HTMLCanvasElement | null, tone: 'purple' | 'blue' = 'purple'): () => void {
  if (!canvas || typeof window === 'undefined') return () => {};
  const ctx = canvas.getContext('2d'); const parent = canvas.parentElement; if (!ctx || !parent) return () => {};
  const waves = tone === 'blue' ? WAVES.map((w, i) => ({ ...w, color: BLUE[i] })) : WAVES;
  let W = 0, H = 0, raf = 0, on = false, lastDraw = 0; const t0 = performance.now();
  const size = () => { const dpr = 1; /* blurred by 6px anyway: 1x looks identical */ W = parent.clientWidth; H = parent.clientHeight; canvas.width = Math.max(1, Math.round(W * dpr)); canvas.height = Math.max(1, Math.round(H * dpr)); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  const frame = (now: number) => { raf = requestAnimationFrame(frame); if (!W || !H || document.hidden || now - lastDraw < 33) return; lastDraw = now; const t = (now - t0) / 1000; ctx.clearRect(0, 0, W, H); for (const w of waves) drawWave(ctx, w, t, W, H); };   // 30 fps is plenty for a slow haze
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ro = new ResizeObserver(() => { size(); if (reduce) frame(performance.now()); }); ro.observe(parent); size();
  const io = new IntersectionObserver(([e]) => { const vis = !!e?.isIntersecting; if (vis && !on && !reduce) { on = true; raf = requestAnimationFrame(frame); } else if (!vis && on) { on = false; cancelAnimationFrame(raf); } });
  io.observe(canvas);
  return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); };
}
