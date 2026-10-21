'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import Hero from '../components/hero/Hero';
import Intro from '../components/intro/Intro';
import About from '../components/about/About';
import Work from '../work/Work';
import Contact from '../components/contact/Contact';
import NextReveal from '../components/reveal/NextReveal';
import SmoothScroll from '../components/reveal/SmoothScroll';
import StackGate from '../components/stack/StackGate';

// useLayoutEffect warns during server rendering; fall back to useEffect there
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
const SEEN = 'shubhrato:introDone';

export default function Home() {
  const [introDone, setIntroDone] = useState(false);

  // Coming back from a project page (the Back link): skip the intro before the first paint.
  useIsoLayoutEffect(() => {
    try {
      if (sessionStorage.getItem(SEEN) === '1') setIntroDone(true);
    } catch {}
  }, []);

  // ...and land on the Work section. Retry a few times because About's pinned scroll settles its height after mount.
  useEffect(() => {
    if (window.location.hash !== '#work') return;
    let seen = false;
    try { seen = sessionStorage.getItem(SEEN) === '1'; } catch {}
    if (!seen) return;
    const jump = () => document.getElementById('work')?.scrollIntoView({ behavior: 'auto' });
    const ids = [60, 450, 1100].map((ms) => window.setTimeout(jump, ms));
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, []);

  return (
    <>
      {/* The hero is always mounted (so its content is in the page HTML),
          but it stays idle until the intro finishes and hands off. */}
      <Hero ready={introDone} />

      {!introDone && (
        <Intro
          onComplete={() => {
            setIntroDone(true);
            try { sessionStorage.setItem(SEEN, '1'); } catch {}
          }}
        />
      )}

      {/* inertial scrolling (the reference site's feel); starts once the intro is over */}
      <SmoothScroll enabled={introDone} />

      <StackGate>
        <About />
      </StackGate>

      {/* Work lifts away at the end of the page, the lake is uncovered behind it, a ring fills while you keep
          scrolling, then the Contact page opens (see components/reveal) */}
      <NextReveal title="Contact" next={<Contact />}>
        <Work />
      </NextReveal>
    </>
  );
}
