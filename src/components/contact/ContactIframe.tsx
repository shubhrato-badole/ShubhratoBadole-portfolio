'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useReveal } from '../reveal/NextReveal';
import { smooth, scrollToTarget } from '../reveal/smooth';
import styles from './contactIframe.module.css';
import { forceStatic } from './contactPlan';

/* The contact scene is a finished, separate app (public/contact-scene/). This section only hosts it.

   ONE WebGL scene at a time, always. (An earlier version pre-warmed a second copy for the "Let's talk" button; two 9 MB scenes
   alive together is exactly what makes weak phones stutter or reload the tab, so that is gone.)

   Two ways in:
   · SCROLL path : the LAKE scene (?start=lake). Work lifts away -> lake window -> ring fills -> the window opens. The scene is
                   told to fly to the form THE MOMENT THE RING FILLS, so its camera flight overlaps the window opening.
   · BUTTON path : "Let's talk" from ANY section -> the lake scene is dropped and the form scene (?wait=1) boots in its place,
                   covered by a dark fade + the lake picture (never a blank screen); when it reports "form-ready" it plays its
                   own circle opening. Its files are already in the browser cache from the lake, so it boots fast.
   · Nothing is ever black: the lake POSTER is under everything and a live scene only appears when it is ready.

   NOT LAGGING (the rule for this file): the scene is a heavy download + compile that runs on the SAME main thread as the page,
   so it must never start while the visitor is scrolling.
   · LOADING : starts only when the visitor is about 2-3 screens from the section AND has stopped scrolling for a moment (never
               at page load or while the hero / opening play); or at once on hover / touch of a Contact link or a button click.
   · RUNNING : the scene is fully stopped (0 % GPU, 0 % CPU) unless somebody can see it (lake near / section visible).
   · It adapts by itself: scene.html measures its own fps and steps its quality down (or freezes the picture) if the device
               cannot keep up; that decision is remembered, so the next visit starts on the right tier. */

/* WHICH SCENE TO SHOW. Change this one word to switch, nothing else:
     'real' -> scene.html     : the real scene (the one in your recordings), with quality tiers + watchdog
     'own'  -> scene-own.html : the small self-contained scene, kept as a spare */
const SCENE = 'real' as 'real' | 'own';
const SCENE_FILE = SCENE === 'own' ? 'scene-own.html' : 'scene.html';
const POSTER_URL = SCENE === 'own' ? '/contact-scene/lake-poster-own.jpg' : '/contact-scene/lake-poster.jpg';
const SRC_LAKE = `/contact-scene/${SCENE_FILE}?start=lake`;
const SRC_FORM = `/contact-scene/${SCENE_FILE}?wait=1`;
/* above the page content, below your nav / assistant: raise it if your nav has a z-index of 1 or less */
const FRONT_Z = 1;
/* if the scene never says "lake-ready" (no WebGL, blocked...) show / open it anyway after this long */
const SAFETY_MS = 6000;
/* Button / dock "Contact" path only: the lake picture stays on screen until the scene reports ready; this is the
   last-resort cap (the scene is a single small file now, so it is normally ready in well under a second). */
const DIRECT_WAIT_MS = SCENE === 'own' ? 10000 : 60000; // the real scene is ~9 MB, give it much longer
/* the scene may only start loading once the visitor has stopped scrolling for this long (ms) */
const QUIET_MS = 700;
/* how far away (in screens) the section may be before the scene is allowed to start loading. Short on purpose: the scene is
   a heavy download + compile and must not start while the visitor is still on the hero / opening / other sections. */
const REACH_MARGIN = { early: '250% 0px', near: '200% 0px', late: '150% 0px' } as const;

const isContactLink = (el: EventTarget | null) =>
  !!(el as Element | null)?.closest?.('a[href="#contact"], a[href="/#contact"]');

export default function ContactIframe({ reach = 'near' }: { reach?: keyof typeof REACH_MARGIN }) {
  const rootRef = useRef<HTMLElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null); // the lake (scroll path)
  const formRef = useRef<HTMLIFrameElement>(null); // the circle-opening scene (button path)
  const { phase, directRun, direct, lakeReady, lakeVisible, lakeNear, setLakeReady, jumpToNext } = useReveal();
  const open = phase === 'open'; // the reveal is over, the contact page is up
  const opening = phase === 'opening'; // the ring is full, the window is opening
  const engaged = open || opening;

  const [load, setLoad] = useState(false); // start loading the scene
  const [loaded, setLoaded] = useState(false); // the iframe document has loaded
  const [activeRaw, setActive] = useState(false); // section fully in view
  const [seenRaw, setSeen] = useState(false); // any part of the section is on screen
  const [giveUp, setGiveUp] = useState(false); // the scene never reported ready: show it anyway
  const [formLoaded, setFormLoaded] = useState(false); // its iframe document has loaded
  const [formReady, setFormReady] = useState(false); // it is booted and waiting for "enter"
  const [entered, setEntered] = useState(false); // it has been told to play the circle opening
  const [jumped, setJumped] = useState(false); // the page position has been moved to the contact page (while covered)
  const [settled, setSettled] = useState(false); // the contact page is where it should be: from now on the page can scroll over it
  const showForm = direct; // the button path's scene boots only when the button is used (never pre-warmed)
  const posterOn = load || direct || lakeNear || lakeVisible || phase !== 'reveal';
  /* a second "Let's talk" after the circle already played: a fresh scene plays it again (the lake picture covers meanwhile) */
  const lastRun = useRef(directRun);
  useEffect(() => {
    if (directRun === lastRun.current) return;
    lastRun.current = directRun;
    if (directRun > 1) {
      setEntered(false);
      setJumped(false);
      setSettled(false);
      setFormReady(false);
      setFormLoaded(false);
    }
  }, [directRun]);
  const showLake = load && !direct; // the lake is not needed once the button path took over
  /* before the reveal has opened, the section is zero-height: whatever the observer says about it means nothing */
  const active = open && activeRaw;
  const seen = open && seenRaw;
  const sentOpen = useRef(false);

  const post = useCallback(
    (message: { type: string }) => frameRef.current?.contentWindow?.postMessage(message, window.location.origin),
    [],
  );
  const postForm = useCallback(
    (message: { type: string }) => formRef.current?.contentWindow?.postMessage(message, window.location.origin),
    [],
  );

  /* ---------- 1. start loading the scene: near enough AND never while the visitor is scrolling ---------- */
  useEffect(() => {
    if (load) return;
    const start = () => setLoad(true);

    let lastScroll = performance.now();
    let quietTimer = 0;
    let wanted = false;
    /* "wanted" turns into "start" only after QUIET_MS without any scrolling: the download + compile of the scene
       share the main thread with the page, so they must not land in the middle of a scroll */
    const arm = () => {
      window.clearTimeout(quietTimer);
      quietTimer = window.setTimeout(() => (performance.now() - lastScroll < QUIET_MS ? arm() : start()), QUIET_MS);
    };
    const want = () => {
      if (wanted) return;
      wanted = true;
      arm();
    };
    const onScroll = () => {
      lastScroll = performance.now();
    };
    /* a visitor reaching for a Contact link / button is a clear signal: no waiting */
    const onIntent = (e: Event) => {
      if (isContactLink(e.target)) start();
    };

    const near = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) want();
      },
      { rootMargin: REACH_MARGIN[reach] },
    );
    if (rootRef.current) near.observe(rootRef.current);

    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('pointerover', onIntent, { passive: true });
    document.addEventListener('focusin', onIntent);
    document.addEventListener('touchstart', onIntent, { passive: true });
    window.addEventListener('portfolio:open-contact', start);
    return () => {
      window.clearTimeout(quietTimer);
      near.disconnect();
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('pointerover', onIntent);
      document.removeEventListener('focusin', onIntent);
      document.removeEventListener('touchstart', onIntent);
      window.removeEventListener('portfolio:open-contact', start);
    };
  }, [load, reach]);

  /* a button / link opened Contact directly: nothing to wait for, start now */
  useEffect(() => {
    if (direct) setLoad(true);
  }, [direct]);

  /* ---------- 2. what the section can see of itself ---------- */
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const full = new IntersectionObserver(
      ([e]) => {
        setActive(e.intersectionRatio >= 0.99);
        setSeen(e.intersectionRatio > 0.05);
      },
      { threshold: [0, 0.05, 0.5, 0.9, 0.99, 1] },
    );
    full.observe(el);
    return () => full.disconnect();
  }, []);

  /* ---------- 3. tell the scene to leave the lake and fly to the form (once) ---------- */
  useEffect(() => {
    if (sentOpen.current || !loaded || direct) return;
    /* scroll path: the instant the ring is full (overlaps the window opening) */
    if (!engaged) return;
    const send = () => {
      if (sentOpen.current) return;
      sentOpen.current = true;
      post({ type: 'open-contact' });
    };
    if (lakeReady) {
      send();
      return;
    }
    const t = window.setTimeout(() => {
      setGiveUp(true);
      send();
    }, SAFETY_MS);
    return () => window.clearTimeout(t);
  }, [post, loaded, direct, engaged, lakeReady]);

  /* ---------- 4. run the scene at full speed only while somebody can see it ---------- */
  useEffect(() => {
    if (!loaded || !lakeReady || direct) return;
    const run = open ? seen : opening || lakeNear;
    if (run) {
      post({ type: 'resume' });
      return;
    }
    /* a transient "not visible" while the layout changes under the hand-off must never pause the flight:
       wait a moment before pausing once the page is open */
    const t = window.setTimeout(() => post({ type: 'pause' }), open ? 400 : 0);
    return () => window.clearTimeout(t);
  }, [post, loaded, lakeReady, direct, open, opening, lakeNear, seen]);

  /* ---------- 4b. BUTTON path: the circle-opening scene (booted only when the button is used) ---------- */
  /* "Let's talk" clicked from ANY section: the scene covers the screen where you are and plays the circle opening, no scroll
     down first. It starts as soon as the scene is ready (the lake picture covers the page until then, never black);
     after a safety delay it starts anyway. */
  useEffect(() => {
    if (!direct || !open || !formLoaded || entered) return;
    const go = () => {
      postForm({ type: 'resume' });
      postForm({ type: 'enter' });
      setEntered(true);
    };
    if (formReady) {
      go();
      return;
    }
    const t = window.setTimeout(go, DIRECT_WAIT_MS);
    return () => window.clearTimeout(t);
  }, [postForm, direct, open, formLoaded, formReady, entered]);

  /* once the screen is covered (the cover fades in over 0.25 s) move the page to the contact page, unseen */
  useEffect(() => {
    if (!entered || jumped) return;
    const t = window.setTimeout(() => {
      if (typeof jumpToNext === 'function') jumpToNext();
      else {
        // safety net (NextReveal.tsx not updated): do the same jump here
        const el = document.getElementById('contact');
        const y = el ? el.getBoundingClientRect().top + window.scrollY : 0;
        if (smooth.lenis) smooth.lenis.scrollTo(y, { immediate: true, force: true });
        else window.scrollTo(0, y);
      }
      setJumped(true);
    }, 320);
    return () => window.clearTimeout(t);
  }, [entered, jumped, jumpToNext]);
  useEffect(() => {
    if (jumped && active) setSettled(true);
  }, [jumped, active]);

  /* after the opening: full speed only while somebody can see it */
  useEffect(() => {
    if (!entered) return;
    postForm({ type: seen || !jumped ? 'resume' : 'pause' });
  }, [postForm, entered, seen, jumped]);

  /* ---------- 5. messages from the scene (same origin only) ---------- */
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.source !== frameRef.current?.contentWindow && e.source !== formRef.current?.contentWindow) return;
      const d = e.data as { source?: string; type?: string; dy?: number; id?: string; touch?: boolean; action?: string; reason?: string } | null;
      if (!d || d.source !== 'contact-scene') return;

      if (d.type === 'perf') {
        /* a browser with no WebGL at all: pictures instead (every other slow-device case is handled inside the scene itself) */
        if (d.action === 'give-up' && d.reason === 'no-webgl') forceStatic();
      } else if (d.type === 'lake-ready') {
        setLakeReady(true);
      } else if (d.type === 'form-ready') {
        setFormReady(true);
      } else if (d.type === 'wheel' && typeof d.dy === 'number') {
        /* wheel at the top / bottom of the form: keep scrolling the page, with the SAME easing as the rest of the page
           (it used to jump by the raw wheel amount, which felt choppy next to everything else) */
        const lenis = smooth.lenis;
        /* a finger (d.touch) drags the page 1:1 with no extra easing, so it sticks to the finger; the wheel keeps its glide */
        if (lenis) lenis.scrollTo(lenis.targetScroll + d.dy, d.touch ? { immediate: true } : { lerp: 0.12 });
        else window.scrollBy({ top: d.dy, behavior: 'instant' as ScrollBehavior });
      } else if (d.type === 'goto' && typeof d.id === 'string') {
        if (d.id === 'top') scrollToTarget(0);
        else {
          const target = document.getElementById(d.id);
          if (target) scrollToTarget(target);
        }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [setLakeReady]);

  /* the live lake fades in when its window opens, never before it has reported ready (the poster is under it meanwhile) */
  const show = (lakeReady || giveUp) && (engaged || lakeVisible);

  return (
    <section
      ref={rootRef}
      id="contact"
      className={styles.contact}
      aria-label="Contact"
      style={{ ['--poster' as string]: `url('${POSTER_URL}')` }}
    >
      {/* the lake, as a picture, under the live scenes: there is never an empty / black window while a scene loads.
          Not mounted until the section is actually near, so it costs nothing (no full-screen layer, no image decode) while the visitor is on the hero / opening / Work. */}
      {posterOn && <div className={styles.poster} aria-hidden />}
      {/* button path: the page fades straight to dark where you are and the circle opens out of it (no picture first).
          Only if the scene takes longer than ~1.5 s does the lake picture fade in over the dark, so it is never a long blank wait. */}
      {direct && !entered && (
        <>
          <div className={styles.coverFront} aria-hidden />
          <div className={styles.posterFront} aria-hidden />
        </>
      )}
      {showLake && (
        <iframe
          ref={frameRef}
          className={styles.frame}
          src={SRC_LAKE}
          title="Contact"
          allow="clipboard-write"
          onLoad={() => setLoaded(true)}
          aria-hidden={!open}
          tabIndex={open ? 0 : -1}
          style={{
            opacity: show ? 1 : 0,
            /* While the contact page fills the screen the iframe is brought IN FRONT of the page, so that clicks, typing
               and the wheel really reach the form. It goes back behind the moment the page starts to scroll away. */
            zIndex: active ? FRONT_Z : undefined,
            pointerEvents: active ? 'auto' : 'none',
          }}
        />
      )}
      {showForm && (
        <iframe
          key={directRun > 1 ? `run${directRun}` : 'form'}
          ref={formRef}
          className={styles.frame}
          src={SRC_FORM}
          title="Contact form"
          allow="clipboard-write"
          onLoad={() => setFormLoaded(true)}
          aria-hidden={!entered}
          tabIndex={entered ? 0 : -1}
          style={{
            /* black from the first frame of the circle opening (the circle opens out of black, no fade) */
            opacity: direct && entered ? 1 : 0,
            transition: 'opacity 0.25s ease', // the page darkens quickly, then the circle opens out of the black
            /* in front while it covers the screen / fills it; behind once the page scrolls away from it */
            zIndex: direct && entered && (!settled || active) ? FRONT_Z : undefined,
            pointerEvents: direct && entered && (!settled || active) ? 'auto' : 'none',
          }}
        />
      )}
    </section>
  );
}
