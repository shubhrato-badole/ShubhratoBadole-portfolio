import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { smooth } from './smooth';

/* The numbers below are the reference site's own (its build's `lp` config + the wheel hook), not guesses.
   They are IDENTICAL to the numbers of the About -> Stack ring (stack/StackGate.tsx), so both scroll hand-offs feel the same. */
export const REVEAL = {
  threshold: 700, // px of extra wheel at the very bottom that fill the ring (mouse / trackpad)
  thresholdTouch: 200, // the same, for touch screens
  preview: 0.15, // how far the window opens while the ring fills (fraction of the screen)
  overshoot: -0.05, // where the window's top edge ends up when fully open (just above the screen)
  expandDuration: 1, // seconds the window takes to open to full screen once the ring is full
  startDelay: 0.1, // seconds between "fully open" and the next page starting
  bottomEps: 0.001, // "at the bottom" = within 0.1% of the scroll range
  slackPx: 1.5, // desktop: "at the bottom" / "fully wiped in" may be off by this many px (fractional layout on 125% / 150% screens made 0.3 px of error enough to never arm)
  settleVelocity: 0.5, // scrolling must have settled (px / frame) before the ring arms
  idleMs: 90, // ring starts to drain this long after the last wheel tick
  decayDuration: 0.9, // seconds the ring takes to drain from full
  fireDuration: 0.18, // seconds from "threshold reached" to the hand-off
  /* --- touch screens only (desktop numbers above are untouched) --- */
  touchSlackPx: 6, // phones: "at the bottom" may be off by this many px (address bar / sub-pixel scroll positions)
  settleVelocityTouch: 3, // phones: how still the page must be (px / frame) before the ring arms
  idleMsTouch: 260, // phones: ring starts to drain this long after the finger last moved (a finger pauses between events)
  touchGain: 1.5, // phones: one swipe fills the ring faster than the same distance of mouse wheel
  flickSpeed: 0.5, // phones: a quick flick (px / ms) at the bottom fills the ring completely
  flickMinFill: 0.2, // ...as long as the ring has already started filling (fraction)
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
  onProgress?: (p: number) => void; // the ring's fill 0..1 while the visitor pulls (and while it drains): the next page can move WITH the pull
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
  gsap.registerPlugin(ScrollTrigger); // harmless if it is already registered
  const circumference = 2 * Math.PI * RING_RADIUS;
  const coarse = window.matchMedia('(pointer: coarse)').matches; // a phone / tablet: finger, no wheel
  const threshold = coarse ? REVEAL.thresholdTouch : REVEAL.threshold;

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
    lastP: -1,
    exp: { v: 0 }, // 0..1, how far the window has opened (animated by GSAP after the ring is full)
    height: 0, // overlay height = the extra scroll room under the panel
    lakeReady: false,
    lakeVisible: false,
    lakeNear: false,
    prevScroll: window.scrollY,
    touching: false, // a finger is on the screen
    dbgAt: 0,
  };

  /* ?debug=contact shows a small status box (scroll numbers) so a problem can be read off the screen */
  const dbg = /[?&]debug=contact\b/.test(location.search) ? document.createElement('pre') : null;
  if (dbg) {
    dbg.style.cssText = 'position:fixed;left:6px;top:6px;z-index:99999;margin:0;padding:6px 8px;background:rgba(0,0,0,.78);color:#7CFC00;font:11px/1.35 monospace;max-width:92vw;pointer-events:none;white-space:pre-wrap;border-radius:6px';
    document.body.appendChild(dbg);
  }

  /* Layout numbers are measured ONCE and cached (the Stack does the same). Reading getBoundingClientRect() on the huge Work panel
     every frame forced a layout each frame while you scrolled, which is what made this hand-off feel less smooth than the Stack's. */
  const cache = { bottom: 0, height: 0, at: 0 }; // the panel's bottom edge in PAGE coordinates, and its height
  const measure = () => {
    cache.at = performance.now();
    st.height = overlay.offsetHeight;
    root.style.setProperty('--reveal-d', `${st.height}px`);
    const r = panel.getBoundingClientRect();
    cache.bottom = r.bottom + window.scrollY;
    cache.height = r.height;
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

  /* only touch the DOM when a value really changed (the tick runs every frame; identical writes still cost a style check) */
  const last = new WeakMap<HTMLElement, Record<string, string>>();
  const put = (el: HTMLElement, prop: 'clipPath' | 'visibility' | 'pointerEvents' | 'willChange', value: string) => {
    let m = last.get(el);
    if (!m) last.set(el, (m = {}));
    if (m[prop] === value) return;
    m[prop] = value;
    el.style[prop] = value;
  };

  /* Once Contact is open nothing here has any more work to do: stop the per-frame tick and every window listener */
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    gsap.ticker.remove(tick);
    ro.disconnect();
    window.removeEventListener('resize', measure);
    window.removeEventListener('load', measure);
    ScrollTrigger.removeEventListener('refresh', measure);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('touchstart', onTouchStart);
    window.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('touchend', onTouchEnd);
    window.removeEventListener('touchcancel', onTouchEnd);
    window.removeEventListener('wheel', block);
    window.removeEventListener('touchmove', block);
    document.documentElement.removeAttribute('data-pull-work');
    dbg?.remove();
  };

  const fire = () => {
    if (st.fired || st.opened || st.destroyed) return;
    st.fired = st.latched = true;
    st.n = st.s = threshold;
    st.exp.v = clamp(st.progress) * REVEAL.preview;
    measure(); // right before acting: a stale number is what makes a hand-off jump
    smooth.lenis?.stop();
    window.addEventListener('wheel', block, { passive: false });
    window.addEventListener('touchmove', block, { passive: false });
    o.onFire();
    gsap.to(st.exp, {
      v: 1,
      duration: REVEAL.expandDuration,
      ease: 'power2.inOut',
      onComplete: () =>
        void gsap.delayedCall(REVEAL.startDelay, () => {
          if (st.destroyed) return;
          st.opened = true;
          release();
          o.onOpen();
        }),
    });
  };

  const openNow = () => {
    if (st.opened || st.destroyed) return;
    st.fired = st.latched = st.opened = true;
    st.n = st.s = threshold;
    release();
    o.onOpen();
  };

  const tick = (_time: number, deltaMs: number) => {
    if (st.destroyed || st.opened) return;
    const dt = Math.min(0.1, (deltaMs || 16.667) / 1000);
    const H = window.innerHeight;
    const { scroll, limit, velocity } = scrollState();
    // refresh the cached layout now and then, only while the page is at rest (a layout read in the middle of a scroll is a visible hitch)
    const age = performance.now() - cache.at;
    if ((age > 1200 && Math.abs(velocity) < 0.3) || (age > 350 && cache.bottom - scroll < H * 2)) measure(); // idle: now and then; near the end of Work: a few times a second (never every frame)
    const pr = { bottom: cache.bottom - scroll, height: cache.height }; // the panel, in screen px, without touching the layout

    /* 1. the overlay is wiped in from the bottom while the last stretch of the page scrolls up */
    const g = st.height > 0 ? clamp((H - pr.bottom) / st.height) : 0;
    put(overlay, 'clipPath', g >= 1 ? 'none' : `inset(${st.height * (1 - g)}px 0px 0px 0px)`);
    put(overlay, 'visibility', g > 0 ? 'visible' : 'hidden');
    put(overlay, 'pointerEvents', g > 0.95 ? 'auto' : 'none');
    document.documentElement.toggleAttribute('data-pull-work', g > 0); // flag only: the phone dock hides while this ring is on screen

    /* 2. extra wheel at the very bottom fills the ring (same maths as the reference's wheel hook).
       "At the bottom" and "fully wiped in" are judged with a few pixels of slack: browsers snap the scroll range to whole pixels while
       the layout is fractional (125% / 150% screens, phones), so being 0.3 px off was enough to never arm = a ring that does not fill. */
    const slack = Math.max(coarse ? REVEAL.touchSlackPx : REVEAL.slackPx, st.height * 0.01);
    const wiped = st.height > 0 && H - pr.bottom >= st.height - slack;
    let atEnd = limit > 0 && scroll >= limit - Math.max(slack, limit * REVEAL.bottomEps);
    if (!atEnd && wiped) {
      /* the smooth scroller's own idea of the page length can be a little off (a page that just changed length): trust the page itself */
      const nativeLimit = document.documentElement.scrollHeight - window.innerHeight;
      atEnd = nativeLimit > 0 && scroll >= nativeLimit - slack;
    }
    /* phones: the address bar sliding in / out moves the scroll position under your finger; once the ring has started filling during
       a touch, do not drop it because of that jolt */
    const settle = coarse ? REVEAL.settleVelocityTouch : REVEAL.settleVelocity;
    const steady = Math.abs(velocity) <= settle || (coarse && st.touching && st.s > 0);
    st.armed = !st.fired && wiped && atEnd && steady;
    const now = performance.now();
    if (!st.latched && st.s >= threshold) {
      st.latched = true;
      st.s = threshold;
    }
    if (st.latched) {
      st.n = Math.min(threshold, st.n + (threshold / REVEAL.fireDuration) * dt);
    } else {
      if (!st.armed || now - st.lastInput > (coarse ? REVEAL.idleMsTouch : REVEAL.idleMs)) st.s = Math.max(0, st.s - (threshold / REVEAL.decayDuration) * dt);
      st.n += (st.s - st.n) * (1 - Math.exp(-14 * dt));
    }
    st.progress = clamp(st.n / threshold);
    if (bar) bar.style.strokeDashoffset = String(circumference * (1 - st.progress));
    if (Math.abs(st.progress - st.lastP) > 0.002) {
      st.lastP = st.progress;
      o.onProgress?.(st.progress);
    }
    if (!st.fired && st.n >= threshold) fire();
    if (dbg && now - st.dbgAt > 250) {
      st.dbgAt = now;
      dbg.textContent = `contact  scroll ${scroll | 0}  limit ${limit | 0}  band ${(g * 100) | 0}%\nwiped ${wiped ? 1 : 0}  atEnd ${atEnd ? 1 : 0}  armed ${st.armed ? 1 : 0}  ring ${(st.progress * 100) | 0}%  fired ${st.fired ? 1 : 0}\nvel ${velocity.toFixed(2)}  touch ${coarse ? 1 : 0}`;
    }

    /* 3. the window under the panel: its top edge rises from the panel's bottom edge to just above the screen */
    const e = st.fired ? st.exp.v : st.progress * REVEAL.preview;
    const windowTop = lerp(pr.bottom, REVEAL.overshoot * H, e);
    const clip = clamp(pr.bottom - windowTop, 0, pr.height);
    put(panel, 'clipPath', clip > 0.5 ? `inset(0px 0px ${clip}px 0px)` : '');
    put(panel, 'willChange', clip > 0.5 ? 'clip-path' : '');

    const visible = st.lakeReady && pr.bottom < H;
    if (visible !== st.lakeVisible) {
      st.lakeVisible = visible;
      o.onLakeVisible(visible);
    }
    const near = pr.bottom < H * 3; // well before the window starts to open: the two pictures get painted while you are still in Work, not at the hand-off
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
  const block = (e: Event) => {
    if (e.cancelable) e.preventDefault(); // the window is opening: the page must not move
  };
  const onWheel = (e: WheelEvent) => {
    add(e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1));
  };
  /* PageDown / Space / arrow at the very bottom fill the ring too (same as the Stack's) */
  const onKey = (e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key;
    if ((k === 'ArrowDown' || k === 'PageDown' || (k === ' ' && !e.shiftKey)) && st.armed) add(80);
  };
  let touchY = 0;
  let touchT = 0; // when the finger last moved
  let touchV = 0; // finger speed, px / ms (positive = swiping up = scrolling down)
  const onTouchStart = (e: TouchEvent) => {
    st.touching = true;
    touchY = e.touches[0]?.clientY ?? 0;
    touchT = performance.now();
    touchV = 0;
  };
  const onTouchMove = (e: TouchEvent) => {
    const y = e.touches[0]?.clientY ?? touchY;
    const delta = touchY - y;
    touchY = y;
    const now = performance.now();
    touchV = delta / Math.max(1, now - touchT);
    touchT = now;
    /* at the very bottom there is nothing left to scroll: stop the browser bouncing the page / sliding the address bar while the ring fills
       (that jolt is what used to stop the ring on phones; the Stack does the same at the end of About) */
    if (st.armed && !st.fired && delta > 0 && e.cancelable) e.preventDefault();
    add(delta * REVEAL.touchGain);
  };
  /* a quick flick up at the bottom opens Contact in one go, like a hard scroll with a mouse wheel */
  const onTouchEnd = () => {
    st.touching = false;
    if (!st.armed || st.fired) return;
    if (touchV >= REVEAL.flickSpeed && performance.now() - touchT < 90 && st.s >= threshold * REVEAL.flickMinFill) {
      st.s = threshold;
      st.lastInput = performance.now();
    }
  };

  measure();
  const ro = new ResizeObserver(measure);
  ro.observe(overlay);
  ro.observe(panel); // Work grows / shrinks (images, fonts): re-measure
  window.addEventListener('resize', measure);
  window.addEventListener('load', measure);
  ScrollTrigger.addEventListener('refresh', measure); // the pinned About scene re-lays the page out after load: the cached position must follow
  window.addEventListener('keydown', onKey);
  window.addEventListener('wheel', onWheel, { passive: true });
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('touchend', onTouchEnd, { passive: true });
  window.addEventListener('touchcancel', onTouchEnd, { passive: true });
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
      release();
      gsap.killTweensOf(st.exp);
      panel.style.clipPath = '';
      panel.style.willChange = '';
      if (smooth.lenis?.isStopped) smooth.lenis.start();
    },
  };
}
