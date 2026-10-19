'use client';
/* The original's `v-stroke-border` directive: every glass element's 1px outline is a linear-gradient whose ANGLE follows the pointer
   (measured from the middle of the screen), eased with 1 - exp(-0.95 * dt). Elements register here and share one rAF loop. */
const els = new Set<HTMLElement>();
let target = 90, current = 90, moving = false, raf = 0, last = 0, listening = false;
const ptr = { x: 0, y: 0, moved: false };
let lx = -1, ly = -1;

const aim = (deg: number) => { target += ((((deg - target) % 360) + 540) % 360) - 180; moving = true; };
const write = () => { const v = `${current.toFixed(2)}deg`; els.forEach((el) => el.style.setProperty('--btn-stroke-angle', v)); };
const onMove = (e: PointerEvent) => { ptr.x = e.clientX; ptr.y = e.clientY; ptr.moved = true; };

function tick(now: number) {
  raf = requestAnimationFrame(tick);
  const dt = last ? Math.min(100, now - last) : 16.7; last = now;
  if (ptr.moved && (ptr.x !== lx || ptr.y !== ly)) {
    lx = ptr.x; ly = ptr.y;
    aim((Math.atan2(ptr.y - innerHeight / 2, ptr.x - innerWidth / 2) * 180) / Math.PI + 90);
  }
  if (!moving) return;
  current += (target - current) * (1 - Math.exp((-0.95 * dt) / 1000));
  if (Math.abs(target - current) < 0.01) { current = target; moving = false; }
  write();
  if (!moving) current = target = ((target % 360) + 360) % 360;
}

/** Registers an element; returns the cleanup. Safe to call on the server (does nothing). */
export function registerStroke(el: HTMLElement | null): () => void {
  if (!el || typeof window === 'undefined') return () => {};
  els.add(el); el.style.setProperty('--btn-stroke-angle', `${current.toFixed(2)}deg`);
  if (!listening && window.matchMedia('(pointer: fine)').matches) { listening = true; window.addEventListener('pointermove', onMove, { passive: true }); }
  if (!raf) { last = 0; raf = requestAnimationFrame(tick); }
  return () => {
    els.delete(el);
    if (!els.size) { cancelAnimationFrame(raf); raf = 0; if (listening) { window.removeEventListener('pointermove', onMove); listening = false; } }
  };
}
