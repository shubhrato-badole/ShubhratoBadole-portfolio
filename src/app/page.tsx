'use client';

import { useState } from 'react';
import Hero from '../components/hero/Hero';
import Intro from '../components/intro/Intro';
import About from '../components/about/About';
import Work from '../components/work/Work'

export default function Home() {
  const [introDone, setIntroDone] = useState(false);

  return (
    <>
      {/* The hero is always mounted (so its content is in the page HTML),
          but it stays idle until the intro finishes and hands off. */}
      <Hero ready={introDone} />
      {!introDone && <Intro onComplete={() => setIntroDone(true)} />}
      <About />
      <Work />
    </>
  );
}