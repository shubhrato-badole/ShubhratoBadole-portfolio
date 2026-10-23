// 'use client';

// import { useCallback, useEffect, useRef, useState } from 'react';
// import { useReveal } from '../reveal/NextReveal';
// import { smooth, scrollToTarget } from '../reveal/smooth';
// import styles from './contact.module.css';

// /* The contact scene is a finished, separate app (public/contact-scene/). This section only hosts it.

//    ONE iframe, ONE URL, NEVER remounted. (The old version switched the iframe's `src` for the "Let's talk" button path,
//    which threw away a 9 MB WebGL scene that might already be loaded and rebooted it from zero: that was the blank screen.)

//    Two ways in, two scenes (as before), but neither one can show a blank screen any more:
//    · SCROLL path   : the LAKE scene (?start=lake). Work lifts away -> lake window -> ring fills -> the window opens. The
//                      scene is told to fly to the form THE MOMENT THE RING FILLS, so its route change + camera flight overlap
//                      the 1 s window opening instead of starting after it (that gap was the pause in the recording).
//    · BUTTON path   : "Let's talk" from ANY section -> the scene covers the screen where you are and plays its OWN opening
//                      animation (the circle opening from the middle); no scrolling down first. That scene (?wait=1) is PRE-WARMED in the background once the lake is
//                      ready, so the circle starts the moment you arrive. If it is not ready yet, the lake picture stays on
//                      screen (never black) and the circle starts as soon as the scene reports "form-ready".
//    · Nothing is ever black: the lake POSTER is under everything and a live scene only appears when it is ready.
//    · LOADING       : starts early enough to be ready: on the first real scroll, on hover/focus/touch of any Contact link,
//                      when the section is ~5 screens away, or after the page has been idle for a while. */

// const SRC_LAKE = '/contact-scene/scene.html?start=lake';
// const SRC_FORM = '/contact-scene/scene.html?wait=1';
// /* above the page content, below your nav / assistant: raise it if your nav has a z-index of 1 or less */
// const FRONT_Z = 1;
// /* if the scene never says "lake-ready" (no WebGL, blocked...) show / open it anyway after this long */
// const SAFETY_MS = 6000;
// /* Button / dock "Contact" path only. It used to give up after SAFETY_MS (6 s) and open the scene even if it had not finished
//    loading, which removed the lake picture and left an EMPTY dark screen on a slow connection or an older phone (the scene is
//    ~9 MB). Now the lake picture stays on screen until the scene reports ready; this is only the last-resort cap. */
// const DIRECT_WAIT_MS = 60000;
// /* start loading the scene after the page has been idle this long (ms) even if the visitor has not scrolled yet */
// const IDLE_PRELOAD_MS = 7000;
// /* pre-warm the button path's scene this long after the lake is ready (so the two boots never overlap) */
// const WARM_FORM_MS = 800;

// /* The scene's heavy files (about 7 MB), fetched quietly in the background a few seconds after the page has loaded so that
//    when somebody taps Contact straight away (a phone, the top of the page) they are already in the browser cache and the
//    scene boots in a fraction of the time. Low priority, one file at a time, skipped on Data Saver / 2G, and it stops the
//    moment the scene itself starts loading. Set WARM_ASSETS_DELAY_MS to 0 to turn it off. */
// const WARM_ASSETS_DELAY_MS = 4000;
// const WARM_ASSETS = [
//   '/contact-scene/_nuxt/T7ii45zO.js',
//   '/contact-scene/_nuxt/DL4QAMwX.v5.js',
//   '/contact-scene/_nuxt/draco_wasm_wrapper.DxJM36Ib.js',
//   '/contact-scene/_nuxt/draco_decoder.C32yEggz.wasm',
//   '/contact-scene/_nuxt/basis_transcoder.o4Hde_L7.js',
//   '/contact-scene/_nuxt/basis_transcoder.VXdx5NbI.wasm',
//   '/contact-scene/models/office.glb',
//   '/contact-scene/models/mountain.glb',
//   '/contact-scene/models/chair.glb',
//   '/contact-scene/models/e.glb',
//   '/contact-scene/models/duck.glb',
//   '/contact-scene/grass_text/grassbushcc005.ktx2',
//   '/contact-scene/grass_text/grassbushcc006.ktx2',
//   '/contact-scene/grass_text/grassbushcc008.ktx2',
//   '/contact-scene/water/Water_1_M_Normal.jpg',
//   '/contact-scene/water/Water_2_M_Normal.jpg',
//   '/contact-scene/water_map.png',
//   '/contact-scene/noise.jpg',
// ];

// const isContactLink = (el: EventTarget | null) =>
//   !!(el as Element | null)?.closest?.('a[href="#contact"], a[href="/#contact"]');

// type IdleWindow = Window & {
//   requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
//   cancelIdleCallback?: (id: number) => void;
// };

// export default function Contact() {
//   const rootRef = useRef<HTMLElement>(null);
//   const frameRef = useRef<HTMLIFrameElement>(null); // the lake (scroll path)
//   const formRef = useRef<HTMLIFrameElement>(null); // the circle-opening scene (button path)
//   const { phase, directRun, direct, lakeReady, lakeVisible, lakeNear, setLakeReady, jumpToNext } = useReveal();
//   const open = phase === 'open'; // the reveal is over, the contact page is up
//   const opening = phase === 'opening'; // the ring is full, the window is opening
//   const engaged = open || opening;

//   const [load, setLoad] = useState(false); // start loading the scene
//   const [loaded, setLoaded] = useState(false); // the iframe document has loaded
//   const [activeRaw, setActive] = useState(false); // section fully in view
//   const [seenRaw, setSeen] = useState(false); // any part of the section is on screen
//   const [giveUp, setGiveUp] = useState(false); // the scene never reported ready: show it anyway
//   const [formWarm, setFormWarm] = useState(false); // boot the button path's scene in the background
//   const [formLoaded, setFormLoaded] = useState(false); // its iframe document has loaded
//   const [formReady, setFormReady] = useState(false); // it is booted and waiting for "enter"
//   const [entered, setEntered] = useState(false); // it has been told to play the circle opening
//   const [jumped, setJumped] = useState(false); // the page position has been moved to the contact page (while covered)
//   const [settled, setSettled] = useState(false); // the contact page is where it should be: from now on the page can scroll over it
//   const showForm = direct || formWarm;
//   /* a second "Let's talk" after the circle already played: a fresh scene plays it again (the lake picture covers meanwhile) */
//   const lastRun = useRef(directRun);
//   useEffect(() => {
//     if (directRun === lastRun.current) return;
//     lastRun.current = directRun;
//     if (directRun > 1) {
//       setEntered(false);
//       setJumped(false);
//       setSettled(false);
//       setFormReady(false);
//       setFormLoaded(false);
//     }
//   }, [directRun]);
//   const showLake = load && !direct; // the lake is not needed once the button path took over
//   /* before the reveal has opened, the section is zero-height: whatever the observer says about it means nothing */
//   const active = open && activeRaw;
//   const seen = open && seenRaw;
//   const sentOpen = useRef(false);

//   const post = useCallback(
//     (message: { type: string }) => frameRef.current?.contentWindow?.postMessage(message, window.location.origin),
//     [],
//   );
//   const postForm = useCallback(
//     (message: { type: string }) => formRef.current?.contentWindow?.postMessage(message, window.location.origin),
//     [],
//   );

//   /* ---------- 1. start loading the scene early enough ---------- */
//   useEffect(() => {
//     if (load) return;
//     const start = () => setLoad(true);
//     const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
//     const saveData = !!conn?.saveData;
//     const w = window as IdleWindow;

//     const onScroll = () => {
//       if (window.scrollY > window.innerHeight * 0.6) start();
//     };
//     const onIntent = (e: Event) => {
//       if (isContactLink(e.target)) start();
//     };
//     let idleId = 0;
//     let timer = 0;
//     if (!saveData) {
//       timer = window.setTimeout(() => {
//         if (w.requestIdleCallback) idleId = w.requestIdleCallback(start, { timeout: 4000 });
//         else start();
//       }, IDLE_PRELOAD_MS);
//     }

//     const near = new IntersectionObserver(
//       ([e]) => {
//         if (e.isIntersecting) start();
//       },
//       { rootMargin: '500% 0px' },
//     );
//     if (rootRef.current) near.observe(rootRef.current);

//     window.addEventListener('scroll', onScroll, { passive: true });
//     document.addEventListener('pointerover', onIntent, { passive: true });
//     document.addEventListener('focusin', onIntent);
//     document.addEventListener('touchstart', onIntent, { passive: true });
//     window.addEventListener('portfolio:open-contact', start);
//     return () => {
//       window.clearTimeout(timer);
//       if (idleId) w.cancelIdleCallback?.(idleId);
//       near.disconnect();
//       window.removeEventListener('scroll', onScroll);
//       document.removeEventListener('pointerover', onIntent);
//       document.removeEventListener('focusin', onIntent);
//       document.removeEventListener('touchstart', onIntent);
//       window.removeEventListener('portfolio:open-contact', start);
//     };
//   }, [load]);

//   /* ---------- 1b. warm the browser cache with the scene's heavy files (see WARM_ASSETS) ---------- */
//   useEffect(() => {
//     if (load || !WARM_ASSETS_DELAY_MS) return;
//     const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
//     if (conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType ?? '')) return;
//     const w = window as IdleWindow;
//     let cancelled = false;
//     let idleId = 0;
//     const run = async () => {
//       for (const url of WARM_ASSETS) {
//         if (cancelled) return;
//         try {
//           const res = await fetch(url, { credentials: 'same-origin', priority: 'low' } as RequestInit);
//           await res.arrayBuffer(); // read it to the end so it is stored in the cache
//         } catch {
//           /* offline / blocked: the scene simply loads these itself later */
//         }
//       }
//     };
//     const timer = window.setTimeout(() => {
//       if (w.requestIdleCallback) idleId = w.requestIdleCallback(() => void run(), { timeout: 3000 });
//       else void run();
//     }, WARM_ASSETS_DELAY_MS);
//     return () => {
//       cancelled = true;
//       window.clearTimeout(timer);
//       if (idleId) w.cancelIdleCallback?.(idleId);
//     };
//   }, [load]);

//   /* a button / link opened Contact directly: nothing to wait for, start now */
//   useEffect(() => {
//     if (direct) setLoad(true);
//   }, [direct]);

//   /* ---------- 2. what the section can see of itself ---------- */
//   useEffect(() => {
//     const el = rootRef.current;
//     if (!el) return;
//     const full = new IntersectionObserver(
//       ([e]) => {
//         setActive(e.intersectionRatio >= 0.99);
//         setSeen(e.intersectionRatio > 0.05);
//       },
//       { threshold: [0, 0.05, 0.5, 0.9, 0.99, 1] },
//     );
//     full.observe(el);
//     return () => full.disconnect();
//   }, []);

//   /* ---------- 3. tell the scene to leave the lake and fly to the form (once) ---------- */
//   useEffect(() => {
//     if (sentOpen.current || !loaded || direct) return;
//     /* scroll path: the instant the ring is full (overlaps the window opening) */
//     if (!engaged) return;
//     const send = () => {
//       if (sentOpen.current) return;
//       sentOpen.current = true;
//       post({ type: 'open-contact' });
//     };
//     if (lakeReady) {
//       send();
//       return;
//     }
//     const t = window.setTimeout(() => {
//       setGiveUp(true);
//       send();
//     }, SAFETY_MS);
//     return () => window.clearTimeout(t);
//   }, [post, loaded, direct, engaged, lakeReady]);

//   /* ---------- 4. run the scene at full speed only while somebody can see it ---------- */
//   useEffect(() => {
//     if (!loaded || !lakeReady || direct) return;
//     const run = open ? seen : opening || lakeNear;
//     if (run) {
//       post({ type: 'resume' });
//       return;
//     }
//     /* a transient "not visible" while the layout changes under the hand-off must never pause the flight:
//        wait a moment before pausing once the page is open */
//     const t = window.setTimeout(() => post({ type: 'pause' }), open ? 400 : 0);
//     return () => window.clearTimeout(t);
//   }, [post, loaded, lakeReady, direct, open, opening, lakeNear, seen]);

//   /* ---------- 4b. BUTTON path: the circle-opening scene ---------- */
//   /* pre-warm it once the lake is ready (skipped on low-memory / data-saver devices: there it boots on click, behind the picture) */
//   useEffect(() => {
//     if (formWarm || direct || engaged || !lakeReady) return;
//     const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
//     if (nav.connection?.saveData || (nav.deviceMemory && nav.deviceMemory < 4)) return;
//     const t = window.setTimeout(() => setFormWarm(true), WARM_FORM_MS);
//     return () => window.clearTimeout(t);
//   }, [formWarm, direct, engaged, lakeReady]);

//   /* while it only waits in the background it runs at ~2 fps */
//   useEffect(() => {
//     if (formReady && !direct) postForm({ type: 'pause' });
//   }, [postForm, formReady, direct]);

//   /* "Let's talk" clicked from ANY section: the scene covers the screen where you are and plays the circle opening, no scroll
//      down first. It starts as soon as the scene is ready (the lake picture covers the page until then, never black);
//      after a safety delay it starts anyway. */
//   useEffect(() => {
//     if (!direct || !open || !formLoaded || entered) return;
//     const go = () => {
//       postForm({ type: 'resume' });
//       postForm({ type: 'enter' });
//       setEntered(true);
//     };
//     if (formReady) {
//       go();
//       return;
//     }
//     const t = window.setTimeout(go, DIRECT_WAIT_MS);
//     return () => window.clearTimeout(t);
//   }, [postForm, direct, open, formLoaded, formReady, entered]);

//   /* once the screen is covered (the cover fades in over 0.25 s) move the page to the contact page, unseen */
//   useEffect(() => {
//     if (!entered || jumped) return;
//     const t = window.setTimeout(() => {
//       if (typeof jumpToNext === 'function') jumpToNext();
//       else {
//         // safety net (NextReveal.tsx not updated): do the same jump here
//         const el = document.getElementById('contact');
//         const y = el ? el.getBoundingClientRect().top + window.scrollY : 0;
//         if (smooth.lenis) smooth.lenis.scrollTo(y, { immediate: true, force: true });
//         else window.scrollTo(0, y);
//       }
//       setJumped(true);
//     }, 320);
//     return () => window.clearTimeout(t);
//   }, [entered, jumped, jumpToNext]);
//   useEffect(() => {
//     if (jumped && active) setSettled(true);
//   }, [jumped, active]);

//   /* after the opening: full speed only while somebody can see it */
//   useEffect(() => {
//     if (!entered) return;
//     postForm({ type: seen || !jumped ? 'resume' : 'pause' });
//   }, [postForm, entered, seen, jumped]);

//   /* ---------- 5. messages from the scene (same origin only) ---------- */
//   useEffect(() => {
//     const onMessage = (e: MessageEvent) => {
//       if (e.origin !== window.location.origin) return;
//       if (e.source !== frameRef.current?.contentWindow && e.source !== formRef.current?.contentWindow) return;
//       const d = e.data as { source?: string; type?: string; dy?: number; id?: string; touch?: boolean } | null;
//       if (!d || d.source !== 'contact-scene') return;

//       if (d.type === 'lake-ready') {
//         setLakeReady(true);
//       } else if (d.type === 'form-ready') {
//         setFormReady(true);
//       } else if (d.type === 'wheel' && typeof d.dy === 'number') {
//         /* wheel at the top / bottom of the form: keep scrolling the page, with the SAME easing as the rest of the page
//            (it used to jump by the raw wheel amount, which felt choppy next to everything else) */
//         const lenis = smooth.lenis;
//         /* a finger (d.touch) drags the page 1:1 with no extra easing, so it sticks to the finger; the wheel keeps its glide */
//         if (lenis) lenis.scrollTo(lenis.targetScroll + d.dy, d.touch ? { immediate: true } : { lerp: 0.12 });
//         else window.scrollBy({ top: d.dy, behavior: 'instant' as ScrollBehavior });
//       } else if (d.type === 'goto' && typeof d.id === 'string') {
//         if (d.id === 'top') scrollToTarget(0);
//         else {
//           const target = document.getElementById(d.id);
//           if (target) scrollToTarget(target);
//         }
//       }
//     };
//     window.addEventListener('message', onMessage);
//     return () => window.removeEventListener('message', onMessage);
//   }, [setLakeReady]);

//   /* the live lake fades in when its window opens, never before it has reported ready (the poster is under it meanwhile) */
//   const show = (lakeReady || giveUp) && (engaged || lakeVisible);

//   return (
//     <section ref={rootRef} id="contact" className={styles.contact} aria-label="Contact">
//       {/* the lake, as a picture, under the live scenes: there is never an empty / black window while a scene loads */}
//       <div className={styles.poster} aria-hidden />
//       {/* button path: the page fades straight to dark where you are and the circle opens out of it (no picture first).
//           Only if the scene takes longer than ~1.5 s does the lake picture fade in over the dark, so it is never a long blank wait. */}
//       {direct && !entered && (
//         <>
//           <div className={styles.coverFront} aria-hidden />
//           <div className={styles.posterFront} aria-hidden />
//         </>
//       )}
//       {showLake && (
//         <iframe
//           ref={frameRef}
//           className={styles.frame}
//           src={SRC_LAKE}
//           title="Contact"
//           allow="clipboard-write"
//           onLoad={() => setLoaded(true)}
//           aria-hidden={!open}
//           tabIndex={open ? 0 : -1}
//           style={{
//             opacity: show ? 1 : 0,
//             /* While the contact page fills the screen the iframe is brought IN FRONT of the page, so that clicks, typing
//                and the wheel really reach the form. It goes back behind the moment the page starts to scroll away. */
//             zIndex: active ? FRONT_Z : undefined,
//             pointerEvents: active ? 'auto' : 'none',
//           }}
//         />
//       )}
//       {showForm && (
//         <iframe
//           key={directRun > 1 ? `run${directRun}` : 'form'}
//           ref={formRef}
//           className={styles.frame}
//           src={SRC_FORM}
//           title="Contact form"
//           allow="clipboard-write"
//           onLoad={() => setFormLoaded(true)}
//           aria-hidden={!entered}
//           tabIndex={entered ? 0 : -1}
//           style={{
//             /* black from the first frame of the circle opening (the circle opens out of black, no fade) */
//             opacity: direct && entered ? 1 : 0,
//             transition: 'opacity 0.25s ease', // the page darkens quickly, then the circle opens out of the black
//             /* in front while it covers the screen / fills it; behind once the page scrolls away from it */
//             zIndex: direct && entered && (!settled || active) ? FRONT_Z : undefined,
//             pointerEvents: direct && entered && (!settled || active) ? 'auto' : 'none',
//           }}
//         />
//       )}
//     </section>
//   );
// }


'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useReveal } from '../reveal/NextReveal';
import { smooth, scrollToTarget } from '../reveal/smooth';
import styles from './contact.module.css';

/* The contact scene is a finished, separate app (public/contact-scene/). This section only hosts it.

   ONE iframe, ONE URL, NEVER remounted. (The old version switched the iframe's `src` for the "Let's talk" button path,
   which threw away a 9 MB WebGL scene that might already be loaded and rebooted it from zero: that was the blank screen.)

   Two ways in, two scenes (as before), but neither one can show a blank screen any more:
   · SCROLL path   : the LAKE scene (?start=lake). Work lifts away -> lake window -> ring fills -> the window opens. The
                     scene is told to fly to the form THE MOMENT THE RING FILLS, so its route change + camera flight overlap
                     the 1 s window opening instead of starting after it (that gap was the pause in the recording).
   · BUTTON path   : "Let's talk" from ANY section -> the scene covers the screen where you are and plays its OWN opening
                     animation (the circle opening from the middle); no scrolling down first. That scene (?wait=1) is PRE-WARMED in the background once the lake is
                     ready, so the circle starts the moment you arrive. If it is not ready yet, the lake picture stays on
                     screen (never black) and the circle starts as soon as the scene reports "form-ready".
   · Nothing is ever black: the lake POSTER is under everything and a live scene only appears when it is ready.
   · LOADING       : starts early enough to be ready: on the first real scroll, on hover/focus/touch of any Contact link,
                     when the section is ~5 screens away, or after the page has been idle for a while. */

/* WHICH SCENE TO SHOW. Change this one word to switch, nothing else:
     'own' -> scene-own.html : the new self-contained scene (one small file, no external assets)
     'old' -> scene.html     : the original scene, still in the folder, untouched */
const SCENE: 'own' | 'old' = 'own';
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
const DIRECT_WAIT_MS = SCENE === 'own' ? 10000 : 60000; // the old scene is ~9 MB, give it much longer
/* start loading the scene after the page has been idle this long (ms) even if the visitor has not scrolled yet */
const IDLE_PRELOAD_MS = 7000;
/* pre-warm the button path's scene this long after the lake is ready (so the two boots never overlap) */
const WARM_FORM_MS = 800;

const isContactLink = (el: EventTarget | null) =>
  !!(el as Element | null)?.closest?.('a[href="#contact"], a[href="/#contact"]');

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

export default function Contact() {
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
  const [formWarm, setFormWarm] = useState(false); // boot the button path's scene in the background
  const [formLoaded, setFormLoaded] = useState(false); // its iframe document has loaded
  const [formReady, setFormReady] = useState(false); // it is booted and waiting for "enter"
  const [entered, setEntered] = useState(false); // it has been told to play the circle opening
  const [jumped, setJumped] = useState(false); // the page position has been moved to the contact page (while covered)
  const [settled, setSettled] = useState(false); // the contact page is where it should be: from now on the page can scroll over it
  const showForm = direct || formWarm;
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

  /* ---------- 1. start loading the scene early enough ---------- */
  useEffect(() => {
    if (load) return;
    const start = () => setLoad(true);
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const saveData = !!conn?.saveData;
    const w = window as IdleWindow;

    const onScroll = () => {
      if (window.scrollY > window.innerHeight * 0.6) start();
    };
    const onIntent = (e: Event) => {
      if (isContactLink(e.target)) start();
    };
    let idleId = 0;
    let timer = 0;
    if (!saveData) {
      timer = window.setTimeout(() => {
        if (w.requestIdleCallback) idleId = w.requestIdleCallback(start, { timeout: 4000 });
        else start();
      }, IDLE_PRELOAD_MS);
    }

    const near = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) start();
      },
      { rootMargin: '500% 0px' },
    );
    if (rootRef.current) near.observe(rootRef.current);

    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('pointerover', onIntent, { passive: true });
    document.addEventListener('focusin', onIntent);
    document.addEventListener('touchstart', onIntent, { passive: true });
    window.addEventListener('portfolio:open-contact', start);
    return () => {
      window.clearTimeout(timer);
      if (idleId) w.cancelIdleCallback?.(idleId);
      near.disconnect();
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('pointerover', onIntent);
      document.removeEventListener('focusin', onIntent);
      document.removeEventListener('touchstart', onIntent);
      window.removeEventListener('portfolio:open-contact', start);
    };
  }, [load]);

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

  /* ---------- 4b. BUTTON path: the circle-opening scene ---------- */
  /* pre-warm it once the lake is ready (skipped on low-memory / data-saver devices: there it boots on click, behind the picture) */
  useEffect(() => {
    if (formWarm || direct || engaged || !lakeReady) return;
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    if (nav.connection?.saveData || (nav.deviceMemory && nav.deviceMemory < 4)) return;
    const t = window.setTimeout(() => setFormWarm(true), WARM_FORM_MS);
    return () => window.clearTimeout(t);
  }, [formWarm, direct, engaged, lakeReady]);

  /* while it only waits in the background it runs at ~2 fps */
  useEffect(() => {
    if (formReady && !direct) postForm({ type: 'pause' });
  }, [postForm, formReady, direct]);

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
      const d = e.data as { source?: string; type?: string; dy?: number; id?: string; touch?: boolean } | null;
      if (!d || d.source !== 'contact-scene') return;

      if (d.type === 'lake-ready') {
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
      {/* the lake, as a picture, under the live scenes: there is never an empty / black window while a scene loads */}
      <div className={styles.poster} aria-hidden />
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
