'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import './stack.css';
import ProgressRing from '../reveal/ProgressRing';
import { smooth } from '../reveal/smooth';
import GlassButton from '../ui/GlassButton';
import { getWorld } from './gl/World';
import { setState } from './lib/store';
import { runRingTransition } from './ringTransition';
import Title from './Title';
import Pagination from './Pagination';
import Filter from './Filter';

/* The numbers below are the reference site's own (the same table revealEngine.ts uses for the Contact reveal). */
const REVEAL = {
  threshold: 700, // px of extra wheel at the very end of About that fill the ring (mouse / trackpad)
  thresholdTouch: 200, // the same, for touch screens
  preview: 0.15, // how far the window opens while the ring fills (fraction of the screen)
  overshoot: -0.05, // where the window's top edge ends up when fully open (just above the screen)
  expandDuration: 1, // seconds the window takes to open to full screen once the ring is full
  startDelay: 0.1, // seconds between "fully open" and the Stack taking over
  settleVelocity: 0.5, // scrolling must have settled (px / frame) before the ring arms
  idleMs: 90, // the ring starts to drain this long after the last wheel tick
  decayDuration: 0.9, // seconds the ring takes to drain from full
  fireDuration: 0.18, // seconds from "threshold reached" to the hand-off
} as const;

const CIRC = 2 * Math.PI * 48;
const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const Arrow = ({ up }: { up?: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={up ? { transform: 'rotate(180deg)' } : undefined}>
    <path d="M12 5v14" /><path d="m19 12-7 7-7-7" />
  </svg>
);

const curScroll = () => (smooth.lenis ? smooth.lenis.scroll : window.scrollY);
const clampTo = (y: number) => {
  const l = smooth.lenis;
  if (l) l.scrollTo(y, { immediate: true, force: true }); else window.scrollTo(0, y);
};
const jump = (el: HTMLElement | null) => {
  if (!el) return;
  const l = smooth.lenis;
  if (l) { l.start(); l.scrollTo(el, { immediate: true, force: true }); } else el.scrollIntoView();
};

/**
 * The technology ring as the NEXT PAGE after About, opened exactly like the reference opens its next page:
 *   · About ends, and the page lifts away to uncover the Stack scene behind it ("Just continue to reveal", a ring that fills while you keep scrolling)
 *   · the window then opens to full screen and the Stack takes over (full-screen layer, the wheel turns the ring)
 * Other ways in: the "Stack" nav link (the intro's ring closes over the page and opens onto the Stack).
 * Ways out: the About / Work buttons, the navbar, or "Let's talk" (all with the same ring).
 * Work is its own page: once you are inside it, scrolling up does nothing (you leave with the navbar / buttons).
 * Contact and its own reveal are not touched.
 */
export default function StackGate({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [uiIn, setUiIn] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const ringLinkRef = useRef<HTMLAnchorElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const input = useRef<HTMLDivElement>(null);
  const bar = useRef<SVGCircleElement>(null);
  const direct = useRef(false);
  const api = useRef({ exit: (_t: 'about' | 'top' | 'work' | 'contact') => {} });

  useEffect(() => {
    setMounted(true);
  }, []);

  // everything else waits for the portal (canvas + overlay) to exist
  useEffect(() => {
    if (!mounted) return;
    const root = rootRef.current, panel = panelRef.current, overlay = overlayRef.current;
    if (!root || !panel || !overlay) return;
    gsap.registerPlugin(ScrollTrigger);
    const threshold = window.matchMedia('(pointer: coarse)').matches ? REVEAL.thresholdTouch : REVEAL.threshold;

    const st = {
      // ring / reveal (same state as revealEngine.ts)
      s: 0, n: 0, latched: false, fired: false, opened: false, armed: false, lastInput: 0, progress: 0, exp: { v: 0 },
      // measured once (not every frame), so the pinned About scene never pays for layout reads
      rootBottom: Infinity, bandH: 0, panelH: 0, workTop: Infinity,
      // modes
      open: false, busy: false, destroyed: false, inWork: false, unlockUntil: 0, userUntil: 0, touchY: 0, prevScroll: 0,
      // scene
      bootP: null as Promise<boolean> | null, sceneReady: false, bootFailed: false, sceneOn: false, shown: false,
      ovG: -1, clipV: -1, bootQueued: false, lastMeasure: 0,
    };

    /* ───────── measuring (cached) ───────── */
    const measure = () => {
      st.lastMeasure = performance.now();
      const bandH = overlay.offsetHeight;
      st.bandH = bandH; root.style.setProperty('--sg-d', `${bandH}px`);
      const rb = root.getBoundingClientRect();
      st.rootBottom = rb.bottom + window.scrollY;
      st.panelH = Math.max(0, rb.height - bandH);
      const w = document.getElementById('work');
      st.workTop = w ? w.getBoundingClientRect().top + window.scrollY : Infinity;
    };

    /* ───────── the scene (WebGL), booted just before it is first needed ───────── */
    const boot = () => {
      if (st.bootP) return st.bootP;
      st.bootP = (async () => {
        try {
          const w = getWorld();
          w.mount(cv.current!);
          setState({ filter: null, hovered: -1 });
          await w.ensureRing();
          w.ring.showInfo = !matchMedia('(pointer: coarse)').matches;
          w.applyFilter(null);
          st.sceneReady = true; setReady(true);
          return true;
        } catch { st.bootFailed = true; return false; }
      })();
      return st.bootP;
    };
    // building the scene is the one heavy step: do it when the browser is idle, a little before the end of About, never mid-scroll-frame
    const bootSoon = () => {
      if (st.bootQueued || st.bootP) return; st.bootQueued = true;
      const run = () => { if (!st.destroyed) void boot(); };
      const w = window as any;
      if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(run, { timeout: 1200 }); else w.setTimeout(run, 250);
    };
    const unlockFor = (ms = 1600) => { st.unlockUntil = performance.now() + ms; };
    const leaveWork = () => { st.inWork = false; };

    /* ───────── overlay + page window ───────── */
    const setOverlay = (g: number) => {
      if (Math.abs(g - st.ovG) < 0.0005) return; st.ovG = g;
      document.documentElement.toggleAttribute('data-pull-stack', g > 0); // the phone dock hides while this ring is on screen
      overlay.style.clipPath = g >= 1 ? 'none' : `inset(${st.bandH * (1 - g)}px 0px 0px 0px)`;
      overlay.style.visibility = g > 0 ? 'visible' : 'hidden';
      overlay.style.pointerEvents = g > 0.95 ? 'auto' : 'none';
    };
    const setClip = (px: number) => {
      if (Math.abs(px - st.clipV) < 0.25) return; st.clipV = px;
      panel.style.clipPath = px > 0.5 ? `inset(0px 0px ${px}px 0px)` : '';
      panel.style.willChange = px > 0.5 ? 'clip-path' : '';
    };
    const hideScene = () => {
      if (st.sceneOn && st.sceneReady) { getWorld().setMode('off'); }
      st.sceneOn = false;
    };
    const hideAll = () => { setOverlay(0); setClip(0); hideScene(); st.shown = false; };

    /* ───────── open / close ───────── */
    const closeNow = () => {
      gsap.killTweensOf(st.exp); st.exp.v = 0;
      st.open = false; st.fired = false; st.opened = false; st.latched = false; st.s = st.n = 0; st.progress = 0; st.armed = false;
      document.documentElement.removeAttribute('data-sr-open');
      panel.style.visibility = ''; st.ovG = -1; st.clipV = -1; hideAll();
      setOpen(false); setUiIn(false);
      if (st.sceneReady) { const w = getWorld(); w.attachInput(null); w.setPortal(1, 1); w.setMode('off'); }
      smooth.lenis?.start();
    };
    const commitOpen = (isDirect: boolean) => {
      if (st.open) return;
      st.open = true; st.opened = true; direct.current = isDirect; st.inWork = false;
      document.documentElement.setAttribute('data-sr-open', ''); // read by the phone dock (which page is current)
      // the page is now fully lifted away: keep it that way (hidden, so it costs nothing), and put the Stack's own layer on top
      panel.style.clipPath = 'inset(0px 0px 100% 0px)'; panel.style.visibility = 'hidden'; panel.style.willChange = '';
      st.ovG = -1; setOverlay(0);
      smooth.lenis?.stop();
      setOpen(true);
      void boot().then((ok) => {
        if (!st.open) return;
        if (!ok) { closeNow(); return; } // WebGL unavailable: never trap the visitor
        const w = getWorld(); w.setPortal(1, 1); w.setMode('ring'); st.sceneOn = true;
        if (isDirect) w.enterDirect(); else w.enterFromPortal();
      });
    };
    const fire = () => {
      if (st.fired || st.opened || st.destroyed || !st.sceneReady) return;
      st.fired = st.latched = true; st.n = st.s = threshold;
      st.exp.v = clamp(st.progress) * REVEAL.preview;
      smooth.lenis?.stop();
      gsap.to(st.exp, {
        v: 1, duration: REVEAL.expandDuration, ease: 'power2.inOut',
        onComplete: () => void gsap.delayedCall(REVEAL.startDelay, () => { if (!st.destroyed && st.fired) commitOpen(false); }),
      });
    };

    /* ───────── the frame loop ───────── */
    const tick = (_t: number, deltaMs: number) => {
      if (st.destroyed) return;
      const lenis = smooth.lenis, H = innerHeight, now = performance.now();
      const scroll = lenis ? lenis.scroll : window.scrollY;
      const free = now < st.unlockUntil;

      // layout numbers are cached; refresh them now and then, and ALWAYS right before acting on them (a stale number is what made the page jump)
      // (only while the page is at rest: a forced layout read in the middle of the pinned About scene is a visible hitch)
      if (now - st.lastMeasure > 1200 && Math.abs(lenis ? lenis.velocity : 0) < 0.3) measure();
      // Work is its own page: once inside it you cannot scroll above its top (inertia, scrollbar and keys included)
      if (!st.open && !free && st.workTop !== Infinity) {
        if (!st.inWork && scroll >= st.workTop - 1) { measure(); if (scroll >= st.workTop - 1) st.inWork = true; }
        else if (st.inWork && scroll < st.workTop - 0.5) { measure(); if (scroll < st.workTop - 0.5) clampTo(st.workTop); }
      }
      if (st.open) return;

      const limitY = st.rootBottom - H;            // scroll position where the end of About's window is at the bottom of the screen
      const dist = limitY - scroll;
      if (st.inWork || st.bootFailed || (dist > H * 1.6 && st.progress === 0 && !st.fired)) { if (st.shown) hideAll(); return; }
      st.shown = true;
      if (dist < H * 2.2) bootSoon();              // build the scene a little before it is needed

      // keep a fast flick from carrying you past the end of About (the Stack must open first)
      if (!free && !st.fired && now < st.userUntil && scroll > limitY + 0.5) { measure(); if (scroll > st.rootBottom - H + 0.5) clampTo(st.rootBottom - H); }

      const dt = Math.min(0.1, (deltaMs || 16.667) / 1000);
      const pBottom = st.rootBottom - st.bandH - scroll;            // bottom edge of About, in screen px
      const g = st.bandH > 0 ? clamp((H - pBottom) / st.bandH) : 0;  // how much of the band has scrolled in
      setOverlay(g);

      const velocity = lenis ? lenis.velocity : scroll - st.prevScroll; st.prevScroll = scroll;
      const atEnd = scroll >= limitY - 1.5;
      st.armed = !st.fired && g >= 0.999 && atEnd && Math.abs(velocity) <= REVEAL.settleVelocity;
      if (!st.latched && st.s >= threshold) { st.latched = true; st.s = threshold; }
      if (st.latched) st.n = Math.min(threshold, st.n + (threshold / REVEAL.fireDuration) * dt);
      else {
        if (!st.armed || now - st.lastInput > REVEAL.idleMs) st.s = Math.max(0, st.s - (threshold / REVEAL.decayDuration) * dt);
        st.n += (st.s - st.n) * (1 - Math.exp(-14 * dt));
      }
      st.progress = clamp(st.n / threshold);
      if (bar.current) bar.current.style.strokeDashoffset = String(CIRC * (1 - st.progress));
      if (!st.fired && st.n >= threshold) fire();

      // the window under the page: its top edge rises from About's bottom edge to just above the screen
      const e = st.fired ? st.exp.v : st.progress * REVEAL.preview;
      const windowTop = lerp(pBottom, REVEAL.overshoot * H, e);
      setClip(clamp(pBottom - windowTop, 0, st.panelH));

      // the scene behind it: small inside the window, growing as the window opens
      if (st.sceneReady) {
        const w = getWorld();
        if (g > 0 || st.fired) {
          if (!st.sceneOn) { w.setMode('portal'); w.enterFromPortal(); st.sceneOn = true; }
          w.setPortal(1 - (1 - e) * (1 - e), clamp((H - windowTop) / H, 0, 1.05));
        } else if (st.sceneOn) hideScene();
      }
    };
    gsap.ticker.add(tick);

    /* ───────── input: hold the end of About, count the pull ───────── */
    const add = (d: number) => {
      if (!st.armed || st.fired || d <= 0) return;
      st.s = Math.min(threshold, st.s + d); st.lastInput = performance.now();
    };
    const block = (e: Event) => { if (e.cancelable) e.preventDefault(); e.stopImmediatePropagation(); };
    const atEndZone = (scroll: number) => { const L = st.rootBottom - innerHeight; return scroll >= L - 3 && scroll <= L + 160; };
    const handle = (dy: number, e: Event) => {
      const now = performance.now(), scroll = curScroll();
      st.userUntil = now + 350;
      if (st.open) return;                                   // the Stack's own layer owns the input
      if (st.fired) { block(e); return; }                   // the window is opening
      if (now < st.unlockUntil) return;                     // a navigation is travelling: let it
      if (st.inWork) { if (dy < 0 && scroll <= st.workTop + 1) block(e); return; }
      if (st.bootFailed) return;
      if (atEndZone(scroll) && dy > 0) {
        block(e);
        const L = st.rootBottom - innerHeight; if (scroll > L + 1) clampTo(L);
        add(dy);
      }
    };
    const onWheel = (e: WheelEvent) => handle(e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1), e);
    const onTouchStart = (e: TouchEvent) => { st.touchY = e.touches[0]?.clientY ?? 0; st.userUntil = performance.now() + 350; };
    const onTouchMove = (e: TouchEvent) => { const y = e.touches[0]?.clientY ?? st.touchY, dy = st.touchY - y; st.touchY = y; handle(dy, e); };
    const onKey = (e: KeyboardEvent) => {
      if (st.open || e.altKey || e.ctrlKey || e.metaKey) return;
      const k = e.key, up = k === 'ArrowUp' || k === 'PageUp' || k === 'Home' || (k === ' ' && e.shiftKey);
      const down = k === 'ArrowDown' || k === 'PageDown' || k === 'End' || (k === ' ' && !e.shiftKey);
      if (!up && !down) return;
      const now = performance.now(), scroll = curScroll(); st.userUntil = now + 350;
      if (now < st.unlockUntil) return;
      if (st.inWork) { if (up && scroll <= st.workTop + 1) block(e); return; }
      if (down && !st.bootFailed && atEndZone(scroll)) { block(e); if (k !== 'End') add(80); }
    };

    /* ───────── navigation ───────── */
    const openNav = () => {
      if (st.busy || st.open) return;
      st.busy = true; unlockFor(2400);
      void runRingTransition(async () => {
        if (!(await boot())) return;
        measure(); leaveWork();
        commitOpen(true);
      }).finally(() => { st.busy = false; });
    };
    const exit = (t: 'about' | 'top' | 'work' | 'contact') => {
      if (st.busy) return;
      st.busy = true; unlockFor(2400);
      void runRingTransition(async () => {
        closeNow();
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        if (t === 'contact') window.dispatchEvent(new CustomEvent('portfolio:open-contact'));
        else { leaveWork(); jump(document.getElementById(t)); }
      }).finally(() => { st.busy = false; });
    };
    api.current.exit = exit;
    const goTo = (id: string) => {                           // from inside Work to another page, with the ring
      if (st.busy) return;
      st.busy = true; unlockFor(2400);
      void runRingTransition(() => { leaveWork(); jump(document.getElementById(id)); }).finally(() => { st.busy = false; });
    };
    const gotoWork = () => {
      if (st.open) return exit('work');
      if (st.busy) return;
      st.busy = true; unlockFor(2400);
      void runRingTransition(() => { jump(document.getElementById('work')); }).finally(() => { st.busy = false; });
    };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]');
      if (!a) return;
      if (a === ringLinkRef.current) { e.preventDefault(); e.stopImmediatePropagation(); fire(); return; }
      const h = a.getAttribute('href') || '';
      const hit = (x: string) => h === x || h === `/${x}`;
      const scroll = curScroll(), inWorkNow = st.inWork || (st.workTop !== Infinity && scroll >= st.workTop - 1);
      if (hit('#stack')) { e.preventDefault(); e.stopImmediatePropagation(); openNav(); }
      else if (hit('#work')) { e.preventDefault(); e.stopImmediatePropagation(); gotoWork(); }
      else if (st.open && (hit('#about') || hit('#top'))) { e.preventDefault(); e.stopImmediatePropagation(); exit('about'); }
      else if (st.open && hit('#contact')) { e.preventDefault(); e.stopImmediatePropagation(); exit('contact'); }
      else if (!st.open && inWorkNow && (hit('#about') || hit('#top'))) { e.preventDefault(); e.stopImmediatePropagation(); goTo(hit('#top') ? 'top' : 'about'); }
    };

    // the phone dock's "Home": from inside the Stack or Work it goes back to the top with the ring; otherwise the dock scrolls by itself
    const onHome = (e: Event) => {
      const detail = (e as CustomEvent<{ handled: boolean }>).detail;
      const scroll = curScroll(), inWorkNow = st.inWork || (st.workTop !== Infinity && scroll >= st.workTop - 1);
      if (st.open) { exit('top'); if (detail) detail.handled = true; }
      else if (inWorkNow) { goTo('top'); if (detail) detail.handled = true; }
    };

    /* ───────── wiring ───────── */
    window.addEventListener('wheel', onWheel, { capture: true, passive: false });
    window.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    window.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('click', onClick, true);
    window.addEventListener('portfolio:open-stack', openNav);
    window.addEventListener('portfolio:home', onHome);
    const ro = new ResizeObserver(measure); ro.observe(root);
    window.addEventListener('resize', measure);
    window.addEventListener('load', measure);
    ScrollTrigger.addEventListener('refresh', measure);
    document.fonts?.ready.then(measure);
    measure();
    const again = window.setTimeout(measure, 900);          // images / pins settle after first paint

    return () => {
      st.destroyed = true;
      gsap.ticker.remove(tick); gsap.killTweensOf(st.exp); window.clearTimeout(again);
      window.removeEventListener('wheel', onWheel, true);
      window.removeEventListener('touchstart', onTouchStart, true);
      window.removeEventListener('touchmove', onTouchMove, true);
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('portfolio:open-stack', openNav);
      window.removeEventListener('portfolio:home', onHome);
      document.documentElement.removeAttribute('data-sr-open');
      document.documentElement.removeAttribute('data-pull-stack');
      window.removeEventListener('resize', measure); window.removeEventListener('load', measure);
      ScrollTrigger.removeEventListener('refresh', measure); ro.disconnect();
      panel.style.clipPath = ''; panel.style.visibility = ''; panel.style.willChange = '';
      smooth.lenis?.start();
      if (st.bootP) { st.bootP = null; st.sceneReady = false; getWorld().dispose(); }
    };
  }, [mounted]);

  // the ring owns wheel / drag only while the Stack is open
  useEffect(() => {
    if (!open || !ready) return;
    const w = getWorld();
    w.attachInput(input.current);
    return () => w.attachInput(null);
  }, [open, ready]);

  useEffect(() => {
    if (!open) { setUiIn(false); return; }
    const t = window.setTimeout(() => setUiIn(true), direct.current ? 1500 : 300);
    return () => window.clearTimeout(t);
  }, [open]);

  return (
    <>
      <div ref={rootRef} className="sg-root">
        <div ref={panelRef} className="sg-panel">{children}</div>
        <div className="sg-band" aria-hidden />
      </div>
      {mounted &&
        createPortal(
          <>
            {/* the scene lives BEHIND the page (z-index -1), like the Contact iframe: the page lifting away uncovers it */}
            <canvas ref={cv} className={`sr-bg${open ? ' sr-bg--front' : ''}`} aria-hidden />
            {open && <div className="sr-backdrop" aria-hidden />}
            <div ref={overlayRef} className="sr-root sr-pull" style={{ visibility: 'hidden' }}>
              <div className={`sr-pull__in${open ? ' sr-fading' : ''}`}>
                <p className="sr-pull__top sr-mono"><span>(Just</span><span>Continue</span><span>to</span><span>reveal)</span></p>
                <a ref={ringLinkRef} href="#stack" className="sr-pull__ring" tabIndex={-1}>
                  <ProgressRing barRef={bar} />
                  <span className="sr-pull__next sr-mono">[ next page ]</span>
                </a>
                <p className="sr-pull__title">Stack</p>
              </div>
            </div>
            {open && (
              <div className="sr-root sr-layer" data-wk-smoke aria-label="Technology stack">
                <div ref={input} className="sr-input" aria-hidden="true" />
                <div className={`sr-ui${uiIn ? ' sr-in' : ''}`}><Title /></div>
                <div className={`sr-ui sr-ui--filter${uiIn ? ' sr-in' : ''}`}><Filter /></div>
                <div className={`sr-ui sr-ui--pagination${uiIn ? ' sr-in' : ''}`}><Pagination /></div>
                <div className={`sr-exit sr-ui${uiIn ? ' sr-in' : ''}`}>
                  <GlassButton label="About" size="md" tone="blue" className="gb--follow" icon={<Arrow up />} dataDir="up" onClick={() => api.current.exit('about')} />
                  <GlassButton label="Work" size="md" tone="blue" className="gb--follow" icon={<Arrow />} dataDir="down" onClick={() => api.current.exit('work')} />
                </div>
              </div>
            )}
          </>,
          document.body,
        )}
    </>
  );
}
