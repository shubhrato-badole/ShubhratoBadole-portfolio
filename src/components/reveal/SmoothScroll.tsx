'use client';

import { useEffect } from 'react';
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { smooth } from './smooth';
import './smooth.css';

/* Smooth (inertial) page scrolling, tuned like the reference site: lerp 0.08, driven by the GSAP ticker.
   Set `enabled={false}` (or delete the component from page.tsx) to go back to native scrolling:
   the reveal works either way. */
export default function SmoothScroll({ enabled = true }: { enabled?: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    gsap.registerPlugin(ScrollTrigger); // harmless if another component already did
    const lenis = new Lenis({ autoRaf: false, lerp: 0.08, syncTouch: false });
    smooth.lenis = lenis;

    const unsubscribe = lenis.on('scroll', () => ScrollTrigger.update());
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(tick);
      unsubscribe();
      lenis.destroy();
      if (smooth.lenis === lenis) smooth.lenis = null;
    };
  }, [enabled]);

  return null;
}
