'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import Hero from '../components/hero/Hero';
import Intro from '../components/intro/Intro';
import About from '../components/about/About';
import Work from '../components/work/Work';
import Contact from '../components/contact/Contact';

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

      <About />
      <Work />
      <Contact />
    </>
  );
}
