'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './contact.module.css';

/* The contact scene is a finished, separate app (public/contact-scene/).
   This section only hosts it. Three jobs:
   1. load it shortly BEFORE the visitor arrives (it is ~9 MB + WebGL),
   2. let the page scroll normally until the section is fully on screen,
   3. listen to its messages: wheel at the edges -> keep scrolling this
      page, links -> scroll to a section. */

const SRC = '/contact-scene/scene.html';

export default function Contact() {
  const rootRef = useRef<HTMLElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [load, setLoad] = useState(false); // start loading the scene
  const [active, setActive] = useState(false); // section fully in view

  /* load one viewport before arriving; engage once (almost) fully visible */
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
      { rootMargin: '100% 0px' },
    );
    const full = new IntersectionObserver(([e]) => setActive(e.intersectionRatio >= 0.9), {
      threshold: [0, 0.5, 0.9, 1],
    });
    near.observe(el);
    full.observe(el);
    return () => {
      near.disconnect();
      full.disconnect();
    };
  }, []);

  /* messages from the scene (same origin only) */
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.source !== frameRef.current?.contentWindow) return;
      const d = e.data as { source?: string; type?: string; dy?: number; id?: string } | null;
      if (!d || d.source !== 'contact-scene') return;

      if (d.type === 'wheel' && typeof d.dy === 'number') {
        window.scrollBy({ top: d.dy, behavior: 'instant' as ScrollBehavior });
      } else if (d.type === 'goto' && typeof d.id === 'string') {
        if (d.id === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
        else document.getElementById(d.id)?.scrollIntoView({ behavior: 'smooth' });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return (
    <section ref={rootRef} id="contact" className={styles.contact} aria-label="Contact">
      {load && (
        <iframe
          ref={frameRef}
          className={styles.frame}
          src={SRC}
          title="Contact"
          allow="clipboard-write"
          /* until the section is fully in view the page owns every wheel / touch */
          style={{ pointerEvents: active ? 'auto' : 'none' }}
        />
      )}
    </section>
  );
}
