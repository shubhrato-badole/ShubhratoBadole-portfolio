'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import SignalField from './SignalField';
import Assistant from '../assistant/Assistant';
import GlassButton from '../ui/GlassButton';
import MobileDock from '../dock/MobileDock';
import { scrollToTarget } from '../reveal/smooth';
import styles from './hero.module.css';

const NAME = 'Shubhrato';
const GLYPHS = '$?-/~*#&%^<>[]{}01';

// useLayoutEffect warns during server rendering; fall back to useEffect there
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

function prefersReduce() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Splits `el`'s current text into per-character spans, then reveals them
 *  left to right: each character fades in as gibberish (accent color, faint
 *  red/blue split) and resolves to the real letter a beat later. Characters
 *  stay invisible until the wave reaches them, so the sentence builds up
 *  rather than sitting there in gibberish from frame one.
 *  Returns a cleanup function that cancels every pending timer, so a
 *  re-run (e.g. React re-invoking the effect) can never collide with it. */
function scramblePitch(el: HTMLElement, delayStart: number): () => void {
  const text = el.textContent ?? '';
  el.textContent = '';
  const STAGGER = 26;
  const STEP = 26;
  const TICKS = 8;
  const timeouts: number[] = [];
  const intervals: number[] = [];

  let i = 0; // running character index, keeps the sweep timing the same
  const words = text.split(' ');
  words.forEach((word, wi) => {
    // each word is one unbreakable box: lines can only wrap BETWEEN words
    const w = document.createElement('span');
    w.className = styles.tword;
    el.appendChild(w);

    word.split('').forEach((ch) => {
      const span = document.createElement('span');
      span.className = styles.tchar;
      span.textContent = ch;
      w.appendChild(span);

      timeouts.push(
        window.setTimeout(() => {
          span.style.opacity = '1';
          let tick = 0;
          const t = window.setInterval(() => {
            if (tick < TICKS) {
              span.textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
              tick++;
            } else {
              span.textContent = ch;
              span.classList.add(styles.resolved);
              window.clearInterval(t);
            }
          }, STEP);
          intervals.push(t);
        }, delayStart + i * STAGGER)
      );
      i++;
    });

    if (wi < words.length - 1) {
      el.appendChild(document.createTextNode(' ')); // a real space: the only legal break point
      i++;
    }
  });

  // lock each character's width so flickering glyphs ($, %, {}) can't re-wrap lines mid-animation
  const spans = Array.from(el.querySelectorAll<HTMLElement>(`.${styles.tchar}`));
  const widths = spans.map((s) => s.getBoundingClientRect().width);
  spans.forEach((s, k) => {
    s.style.width = `${widths[k]}px`;
  });

  return () => {
    timeouts.forEach((id) => window.clearTimeout(id));
    intervals.forEach((id) => window.clearInterval(id));
  };
}

type HeroProps = {
  /** Flip to true when the intro hands off; the entrance animation plays then. */
  ready?: boolean;
};

export default function Hero({ ready = true }: HeroProps) {
  const heroRef = useRef<HTMLElement>(null);
  const pitchRef = useRef<HTMLParagraphElement>(null);
  const charRefs = useRef<(HTMLSpanElement | null)[]>([]);

  const [noGl, setNoGl] = useState(false);
  const handleFallback = useCallback(() => setNoGl(true), []);

  /* ---------- entrance: nav fade + name rise + tagline scramble + cta rise ---------- */
  useIsoLayoutEffect(() => {
    if (!ready || prefersReduce()) return;
    const chars = charRefs.current.filter(Boolean);
    const hero = heroRef.current;
    if (!hero) return;
    const cta = hero.querySelectorAll<HTMLElement>(`.${styles.cta}`);

    const tl = gsap.timeline({ delay: 0.15 });
    if (chars.length) tl.from(chars, { yPercent: 115, duration: 1, ease: 'power4.out', stagger: 0.045 }, 0);
    if (cta.length) tl.from(cta, { opacity: 0, y: 18, duration: 0.7, ease: 'power3.out' }, 0.9);

    const cancelScramble = pitchRef.current ? scramblePitch(pitchRef.current, 900) : null;

    // the name + links (blended) and the "Let's talk" button (not blended) come in together
    gsap.from([`.${styles.nav}`, `.${styles.navCta}`], { y: -30, opacity: 0, duration: 0.8, delay: 0.5, ease: 'power3.out' });

    return () => {
      tl.kill();
      cancelScramble?.();
    };
  }, [ready]);

  function handleAnchor(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
    if (!href.startsWith('#') || href.length < 2) return;
    const target = document.getElementById(href.slice(1));
    if (!target) return; // section doesn't exist on the page yet
    e.preventDefault();
    if (href === '#contact') {
      // the reveal (NextReveal) owns this one: it intercepts scrollIntoView on #contact and glides there
      target.scrollIntoView({ behavior: prefersReduce() ? 'auto' : 'smooth' });
      return;
    }
    // same easing and duration logic as every other scroll on the page (the browser's own smooth-scroll fought Lenis)
    scrollToTarget(href === '#top' ? 0 : target, { immediate: prefersReduce() });
  }

  return (
    <div className={styles.heroRoot}>

      {/* name + links: blended with the page (mix-blend-mode: difference), as before */}
      <header className={styles.nav}>
        <a className={styles.navName} href="#top" onClick={(e) => handleAnchor(e, '#top')}>
          Shubhrato
        </a>
        <nav className={styles.navLinks} aria-label="Main">
          <a href="#about" onClick={(e) => handleAnchor(e, '#about')}>
            About
          </a>
          <a href="#stack" onClick={(e) => handleAnchor(e, '#stack')}>
            Stack
          </a>
          <a href="#work" onClick={(e) => handleAnchor(e, '#work')}>
            Work
          </a>
        </nav>
        <div className={styles.navRight} aria-hidden="true" />
      </header>

      {/* "Let's talk" (was "Contact"): the original's glass button. It sits outside the blended header so its purple is not inverted. */}
      <div className={styles.navCta}>
        <GlassButton
          href="#contact"
          label="Let's talk"
          size="sm"
          tone="blue"
          className="gb--follow"
          onClick={(e) => handleAnchor(e as React.MouseEvent<HTMLAnchorElement>, '#contact')}
        />
      </div>

      <main id="top">
        <section ref={heroRef} id="hero" className={`${styles.hero} ${noGl ? styles.noGl : ''}`}>
          <SignalField containerRef={heroRef} accent="#4C6FFF" onFallback={handleFallback} active={ready} />

          <h1 className={`${styles.name} ${styles.nameSlim}`} aria-label={NAME}>
            <span className={styles.line} aria-hidden="true">
              {NAME.split('').map((c, i) => (
                <span
                  key={i}
                  ref={(el) => {
                    charRefs.current[i] = el;
                  }}
                  className={styles.ch}
                >
                  {c}
                </span>
              ))}
            </span>
          </h1>

          <div className={styles.heroFoot}>
            <p ref={pitchRef} className={styles.pitch}>
              AI engineer. I build full-stack systems and think about how they break.
            </p>
            <div className={styles.cta}>
              <GlassButton
                href="#work"
                label="See the work"
                size="md"
                tone="blue"
                onClick={(e) => handleAnchor(e as React.MouseEvent<HTMLAnchorElement>, '#work')}
              />
            </div>
          </div>
        </section>
      </main>

      {/* phones (760px and below): the top bar above is hidden and this bottom dock takes over; the assistant's orb sits in its right end */}
      <MobileDock ready={ready} onAnchor={handleAnchor} />

      {/* floating orb + full-screen assistant (replaces the old "Ask about Shubhrato" button and panel) */}
      <Assistant ready={ready} />
    </div>
  );
}
