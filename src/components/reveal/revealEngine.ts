import gsap from 'gsap';
import { smooth } from './smooth';

/* The numbers below are the reference site's own (its build's `lp` config + the wheel hook), not guesses. */
export const REVEAL = {
  threshold: 700, // px of extra wheel at the very bottom that fill the ring (mouse / trackpad)
  thresholdTouch: 200, // the same, for touch screens
  preview: 0.15, // how far the window opens while the ring fills (fraction of the screen)
  overshoot: -0.05, // where the window's top edge ends up when fully open (just above the screen)
  expandDuration: 1, // seconds the window takes to open to full screen once the ring is full
  startDelay: 0.1, // seconds between "fully open" and the next page starting
  bottomEps: 0.001, // "at the bottom" = within 0.1% of the scroll range
  settleVelocity: 0.5, // scrolling must have settled (px / frame) before the ring arms
  idleMs: 90, // ring starts to drain this long after the last wheel tick
  decayDuration: 0.9, // seconds the ring takes to drain from full
  fireDuration: 0.18, // seconds from "threshold reached" to the hand-off
} as const;

const RING_RADIUS = 48; // the ring's SVG circle (viewBox 100)
const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export type RevealEngineOptions = {
  root: HTMLElement; // gets --reveal-d (the band's height)
  panel: HTMLElement; // the page section that lifts away (Work); clipped from the bottom while the window opens
  overlay: HTMLElement; // "(Just continue to reveal) / ring / [ next page ] / title", fixed to the bottom of the screen
  bar: SVGCircleElement | null; // the ring's progress arc
  onFire: () => void; // the ring is full, the window starts opening
  onOpen: () => void; // the window is fully open, the next page takes over
  onLakeVisible: (visible: boolean) => void; // part of the lake is on screen (its iframe should be shown)
  onLakeNear: (near: boolean) => void; // the lake is about to be needed (it should be running at full speed)
};

export type RevealEngine = {
  measure: () => void;
  setLakeReady: (ready: boolean) => void;
  fire: () => void; // same as filling the ring
  openNow: () => void; // skip the animation (direct links to the contact page)
  destroy: () => void;
};

export function createRevealEngine(o: RevealEngineOptions): RevealEngine {
  const { root, panel, overlay, bar } = o;
  const circumference = 2 * Math.PI * RING_RADIUS;
  const threshold = window.matchMedia('(pointer: coarse)').matches ? REVEAL.thresholdTouch : REVEAL.threshold;

  const st = {
    s: 0, // raw wheel input, 0..threshold
    n: 0, // smoothed value that drives the ring
    latched: false,
    fired: false,
    opened: false,
    destroyed: false,
    armed: false,
    lastInput: 0,
    progress: 0,
    exp: { v: 0 }, // 0..1, how far the window has opened (animated by GSAP after the ring is full)
    height: 0, // overlay height = the extra scroll room under the panel
    lakeReady: false,
    lakeVisible: false,
    lakeNear: false,
    prevScroll: window.scrollY,
  };

  const measure = () => {
    st.height = overlay.offsetHeight;
    root.style.setProperty('--reveal-d', `${st.height}px`);
  };

  /* Lenis when it is running, plain window scrolling otherwise */
  const scrollState = () => {
    const l = smooth.lenis;
    if (l) return { scroll: l.scroll, limit: l.limit, velocity: l.velocity };
    const scroll = window.scrollY;
    const limit = document.documentElement.scrollHeight - window.innerHeight;
    const velocity = scroll - st.prevScroll;
    st.prevScroll = scroll;
    return { scroll, limit, velocity };
  };

  const fire = () => {
    if (st.fired || st.opened || st.destroyed) return;
    st.fired = st.latched = true;
    st.n = st.s = threshold;
    st.exp.v = clamp(st.progress) * REVEAL.preview;
    smooth.lenis?.stop();
    o.onFire();
    gsap.to(st.exp, {
      v: 1,
      duration: REVEAL.expandDuration,
      ease: 'power2.inOut',
      onComplete: () =>
        void gsap.delayedCall(REVEAL.startDelay, () => {
          if (st.destroyed) return;
          st.opened = true;
          o.onOpen();
        }),
    });
  };

  const openNow = () => {
    if (st.opened || st.destroyed) return;
    st.fired = st.latched = st.opened = true;
    st.n = st.s = threshold;
    o.onOpen();
  };

  const tick = (_time: number, deltaMs: number) => {
    if (st.destroyed || st.opened) return;
    const dt = Math.min(0.1, (deltaMs || 16.667) / 1000);
    const H = window.innerHeight;
    const pr = panel.getBoundingClientRect();
    const { scroll, limit, velocity } = scrollState();

    /* 1. the overlay is wiped in from the bottom while the last stretch of the page scrolls up */
    const g = st.height > 0 ? clamp((H - pr.bottom) / st.height) : 0;
    overlay.style.clipPath = g >= 1 ? 'none' : `inset(${st.height * (1 - g)}px 0px 0px 0px)`;
    overlay.style.visibility = g > 0 ? 'visible' : 'hidden';
    overlay.style.pointerEvents = g > 0.95 ? 'auto' : 'none';

    /* 2. extra wheel at the very bottom fills the ring (same maths as the reference's wheel hook) */
    const atEnd = limit > 0 && scroll >= limit * (1 - REVEAL.bottomEps);
    st.armed = !st.fired && g >= 0.999 && atEnd && Math.abs(velocity) <= REVEAL.settleVelocity;
    const now = performance.now();
    if (!st.latched && st.s >= threshold) {
      st.latched = true;
      st.s = threshold;
    }
    if (st.latched) {
      st.n = Math.min(threshold, st.n + (threshold / REVEAL.fireDuration) * dt);
    } else {
      if (!st.armed || now - st.lastInput > REVEAL.idleMs) st.s = Math.max(0, st.s - (threshold / REVEAL.decayDuration) * dt);
      st.n += (st.s - st.n) * (1 - Math.exp(-14 * dt));
    }
    st.progress = clamp(st.n / threshold);
    if (bar) bar.style.strokeDashoffset = String(circumference * (1 - st.progress));
    if (!st.fired && st.n >= threshold) fire();

    /* 3. the window under the panel: its top edge rises from the panel's bottom edge to just above the screen */
    const e = st.fired ? st.exp.v : st.progress * REVEAL.preview;
    const windowTop = lerp(pr.bottom, REVEAL.overshoot * H, e);
    const clip = clamp(pr.bottom - windowTop, 0, pr.height);
    panel.style.clipPath = clip > 0.5 ? `inset(0px 0px ${clip}px 0px)` : '';
    panel.style.willChange = clip > 0.5 ? 'clip-path' : '';

    const visible = st.lakeReady && pr.bottom < H;
    if (visible !== st.lakeVisible) {
      st.lakeVisible = visible;
      o.onLakeVisible(visible);
    }
    const near = pr.bottom < H * 1.8; // a little before the window starts to open
    if (near !== st.lakeNear) {
      st.lakeNear = near;
      o.onLakeNear(near);
    }
  };

  const add = (delta: number) => {
    if (!st.armed || st.fired || delta <= 0) return;
    st.s = Math.min(threshold, st.s + delta);
    st.lastInput = performance.now();
  };
  const onWheel = (e: WheelEvent) => add(e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1));
  let touchY = 0;
  const onTouchStart = (e: TouchEvent) => {
    touchY = e.touches[0]?.clientY ?? 0;
  };
  const onTouchMove = (e: TouchEvent) => {
    const y = e.touches[0]?.clientY ?? touchY;
    const delta = touchY - y;
    touchY = y;
    add(delta);
  };

  measure();
  const ro = new ResizeObserver(measure);
  ro.observe(overlay);
  window.addEventListener('resize', measure);
  window.addEventListener('wheel', onWheel, { passive: true });
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: true });
  gsap.ticker.add(tick);

  return {
    measure,
    setLakeReady: (ready) => {
      st.lakeReady = ready;
    },
    fire,
    openNow,
    destroy: () => {
      st.destroyed = true;
      gsap.ticker.remove(tick);
      gsap.killTweensOf(st.exp);
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      panel.style.clipPath = '';
      panel.style.willChange = '';
      if (smooth.lenis?.isStopped) smooth.lenis.start();
    },
  };
}
