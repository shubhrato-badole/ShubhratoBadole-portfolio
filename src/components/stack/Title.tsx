'use client';
import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { getState, subscribe } from '@/components/stack/lib/store';
import { getWorld } from '@/components/stack/gl/World';
import { decodeText, decodeOut } from '@/components/stack/lib/decode';

// The big serif title + one-liner shown bottom-left while a card is hovered (timings from the reference).
export default function Title() {
  const root = useRef<HTMLDivElement>(null), line = useRef<HTMLSpanElement>(null), arrow = useRef<HTMLSpanElement>(null), text = useRef<HTMLSpanElement>(null), desc = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const L = line.current!, A = arrow.current!, T = text.current!, D = desc.current!;
    let shown: string | null = null, lastChange = 0, hideTimer: any, swapTimer: any, stopDecode: (() => void) | null = null;
    gsap.set(L, { yPercent: 165 });
    const arrowW = () => A.getBoundingClientRect().width + parseFloat(getComputedStyle(A).marginRight || '0');
    const animIn = (slug: string, title: string, line1: string) => {
      shown = slug; lastChange = performance.now(); T.textContent = title; stopDecode?.();
      gsap.killTweensOf([L, A, T]); gsap.set(A, { scale: 0 }); gsap.set(T, { x: -arrowW() });
      gsap.fromTo(L, { yPercent: 165 }, { yPercent: 0, duration: 0.7, ease: 'power4.out' });
      gsap.to(A, { scale: 1, duration: 0.45, delay: 0.35, ease: 'back.out(1.7)' });
      gsap.to(T, { x: 0, duration: 0.45, delay: 0.35, ease: 'power4.out' });
      stopDecode = decodeText(D, line1, 700);
    };
    const animOut = (done?: () => void) => {
      stopDecode?.(); stopDecode = decodeOut(D, 300);
      gsap.killTweensOf(L); gsap.to(L, { yPercent: -165, duration: 0.7, ease: 'power4.out', onComplete: done });
    };
    const handle = () => {
      const h = getState().hovered; const tech = getWorld().techAt(h);
      if (tech) {
        clearTimeout(hideTimer);
        if (shown === tech.slug) return;
        if (!shown) { animIn(tech.slug, tech.title, tech.line); return; }
        clearTimeout(swapTimer);
        const wait = Math.max(0, 400 - (performance.now() - lastChange));
        swapTimer = setTimeout(() => {
          const cur = getWorld().techAt(getState().hovered); if (!cur || cur.slug === shown) return;
          animOut(() => animIn(cur.slug, cur.title, cur.line));
        }, wait);
      } else {
        clearTimeout(swapTimer); clearTimeout(hideTimer);
        hideTimer = setTimeout(() => { if (shown) { shown = null; animOut(); } }, 150);
      }
    };
    const unsub = subscribe(handle);
    return () => { unsub(); clearTimeout(hideTimer); clearTimeout(swapTimer); stopDecode?.(); gsap.killTweensOf([L, A, T]); };
  }, []);
  return (
    <div className="sr-p-headline" ref={root} aria-hidden="true">
      <h2 className="sr-p-headline__title"><span className="sr-p-headline__mask"><span className="sr-p-headline__line" ref={line}><span className="sr-p-headline__arrow" ref={arrow}>↪</span><span className="sr-p-headline__text" ref={text} /></span></span></h2>
      <p className="sr-p-headline__desc sr-mono" ref={desc} />
    </div>
  );
}
