'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useReveal } from '../reveal/NextReveal';
import { smooth } from '../reveal/smooth';
import styles from './contact.module.css';

/* The contact scene is a finished, separate app (public/contact-scene/).
   This section only hosts it. Jobs:
   1. load it well BEFORE the visitor arrives (it is ~9 MB + WebGL),
   2. SCROLL path: show its LAKE view behind the page while the Work section lifts away (<NextReveal>), then tell it
      to open the contact page ("open-contact"). A poster of the lake sits under it, so the window is never empty,
      and the live scene fades in over the poster. While the lake is hidden behind Work it runs at ~2 fps.
   3. BUTTON path (a Contact button / link): no lake. The scene is loaded as the plain contact page and plays its own
      opening animation (the circle opening from the middle) when the page has scrolled down to it.
   4. let the page scroll normally until the contact page is fully on screen,
   5. listen to its messages: lake ready, wheel at the edges -> keep scrolling this
      page, links -> scroll to a section.

   One iframe, one WebGL scene: it is fixed BEHIND the page (the Work section is opaque and covers it), so it only
   shows through the window that opens under Work, and later through this (transparent) section. */

const SRC_LAKE = '/contact-scene/scene.html?start=lake';
const SRC_DIRECT = '/contact-scene/scene.html?wait=1';
/* above the page content, below your nav / assistant: raise it if your nav has a z-index of 1 or less */
const FRONT_Z = 1;

export default function Contact() {
  const rootRef = useRef<HTMLElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const { phase, direct, lakeReady, lakeVisible, lakeNear, setLakeReady } = useReveal();
  const open = phase === 'open'; // the reveal is over, the contact page is up
  const [load, setLoad] = useState(false); // start loading the scene
  const [active, setActive] = useState(false); // section fully in view
  const [seen, setSeen] = useState(false); // any part of the section is on screen
  const [entered, setEntered] = useState(false); // (button path) the scene has been told to open
  const mode = direct ? 'direct' : 'lake';
  const [loadedMode, setLoadedMode] = useState<'lake' | 'direct' | null>(null); // which iframe has finished loading
  const loaded = loadedMode === mode; // the CURRENT iframe has loaded (a new one starts when the mode changes)

  const post = useCallback(
    (message: { type: string }) => frameRef.current?.contentWindow?.postMessage(message, window.location.origin),
    [],
  );

  /* load a few screens before arriving (Work is several screens long, so the scene is ready by the time you reach
     the end); engage once (almost) fully visible */
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const near = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setLoad(true);
          near.disconnect();
        }
      },
      { rootMargin: '500% 0px' },
    );
    const full = new IntersectionObserver(
      ([e]) => {
        setActive(e.intersectionRatio >= 0.99);
        setSeen(e.intersectionRatio > 0.05);
      },
      { threshold: [0, 0.05, 0.5, 0.9, 0.99, 1] },
    );
    near.observe(el);
    full.observe(el);
    return () => {
      near.disconnect();
      full.disconnect();
    };
  }, []);

  /* SCROLL path: the reveal is done, tell the scene to leave the lake and open the contact page.
     If it never reports that its lake is ready (e.g. no WebGL), open the form anyway after a few seconds. */
  useEffect(() => {
    if (direct || !open || !loaded) return;
    if (lakeReady) {
      post({ type: 'open-contact' });
      return;
    }
    const t = window.setTimeout(() => post({ type: 'open-contact' }), 6000);
    return () => window.clearTimeout(t);
  }, [post, direct, open, loaded, lakeReady]);

  /* BUTTON path: the page has scrolled down to the contact page, now the scene may play its opening animation */
  useEffect(() => {
    if (!direct || !open || !loaded) return;
    if (active) {
      post({ type: 'enter' });
      setEntered(true);
      return;
    }
    const t = window.setTimeout(() => {
      post({ type: 'enter' });
      setEntered(true);
    }, 8000); // safety net
    return () => window.clearTimeout(t);
  }, [post, direct, open, loaded, active]);

  /* the scene runs at ~2 fps while nobody can see it: the lake hidden behind Work (until the page is about to need it),
     or the contact page once Work has been scrolled back over it */
  useEffect(() => {
    if (!loaded) return;
    if (direct) {
      if (!entered) return; // let the opening animation start first
      post({ type: seen ? 'resume' : 'pause' });
    } else {
      if (!lakeReady) return;
      post({ type: (open ? seen : lakeNear) ? 'resume' : 'pause' });
    }
  }, [post, direct, loaded, entered, lakeReady, open, lakeNear, seen]);

  /* messages from the scene (same origin only) */
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.source !== frameRef.current?.contentWindow) return;
      const d = e.data as { source?: string; type?: string; dy?: number; id?: string } | null;
      if (!d || d.source !== 'contact-scene') return;

      if (d.type === 'lake-ready') {
        setLakeReady(true);
      } else if (d.type === 'wheel' && typeof d.dy === 'number') {
        const lenis = smooth.lenis;
        if (lenis) lenis.scrollTo(lenis.targetScroll + d.dy, { immediate: true }); // no easing delay on the hand-off
        else window.scrollBy({ top: d.dy, behavior: 'instant' as ScrollBehavior });
      } else if (d.type === 'goto' && typeof d.id === 'string') {
        if (d.id === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
        else document.getElementById(d.id)?.scrollIntoView({ behavior: 'smooth' });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [setLakeReady]);

  const show = direct ? open : open || lakeVisible; // the lake fades in when its window opens; the plain page is black until it opens

  return (
    <section ref={rootRef} id="contact" className={styles.contact} aria-label="Contact">
      {/* the lake, as a picture, under the live scene: the window under Work is never empty while the scene loads */}
      {!direct && <div className={styles.poster} aria-hidden />}
      {load && (
        <iframe
          key={direct ? 'direct' : 'lake'}
          ref={frameRef}
          className={styles.frame}
          src={direct ? SRC_DIRECT : SRC_LAKE}
          title="Contact"
          allow="clipboard-write"
          onLoad={() => setLoadedMode(mode)}
          aria-hidden={!open}
          tabIndex={open ? 0 : -1}
          /* the scene gets the wheel / touch / clicks only once the contact page is open AND fills the screen,
             until then the page owns every one of them */
          style={{
            opacity: show ? 1 : 0,
            /* While the contact page fills the screen the iframe is brought IN FRONT of the page, so that clicks, typing
               and the wheel really reach the form (behind the page they would hit the page's own boxes). It goes back
               behind the moment the page starts to scroll away, so Work slides over it. */
            zIndex: open && active ? FRONT_Z : undefined,
            pointerEvents: open && active ? 'auto' : 'none',
          }}
        />
      )}
    </section>
  );
}