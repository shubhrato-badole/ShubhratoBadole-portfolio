'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import SignalField from './SignalField';
import Assistant from '../assistant/Assistant';
import styles from './hero.module.css';

const NAME = 'Shubhrato';
const GLYPHS = '$?-/~*#&%^<>[]{}01';

function ArrowIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 12L12 4M12 4H6M12 4V10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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
  const STAGGER = 26; // ms between each character's start — controls sweep speed
  const STEP = 26; // ms per glyph flicker
  const TICKS = 8; // flickers before a character locks in
  const timeouts: number[] = [];
  const intervals: number[] = [];

  text.split('').forEach((ch, i) => {
    const span = document.createElement('span');
    span.className = styles.tchar;
    span.textContent = ch === ' ' ? '\u00A0' : ch;
    el.appendChild(span);

    const delay = delayStart + i * STAGGER;
    if (ch === ' ') {
      timeouts.push(
        window.setTimeout(() => {
          span.style.opacity = '1';
          span.classList.add(styles.resolved);
        }, delay)
      );
      return;
    }
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
      }, delay)
    );
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
  const btnRefs = useRef<(HTMLAnchorElement | null)[]>([]);
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

    gsap.from(`.${styles.nav}`, { y: -30, opacity: 0, duration: 0.8, delay: 0.5, ease: 'power3.out' });

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
    target.scrollIntoView({ behavior: prefersReduce() ? 'auto' : 'smooth' });
  }

  return (
    <div className={styles.heroRoot}>

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
        <div className={styles.navRight}>
          <a
            className={`${styles.btn} ${styles.navBtn}`}
            href="#contact"
            onClick={(e) => handleAnchor(e, '#contact')}
          >
            <span className={styles.roll}>
              <span className={styles.l1}>Contact</span>
              <span className={styles.l2}>Contact</span>
            </span>
          </a>
        </div>
      </header>

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
              <a
                ref={(el) => {
                  btnRefs.current[0] = el;
                }}
                className={`${styles.btn} ${styles.primary}`}
                href="#work"
                onClick={(e) => handleAnchor(e, '#work')}
              >
                <span className={styles.roll}>
                  <span className={styles.l1}>See the work</span>
                  <span className={styles.l2}>See the work</span>
                </span>
                <span className={`${styles.roll} ${styles.arrow}`}>
                  <span className={styles.l1}><ArrowIcon /></span>
                  <span className={styles.l2}><ArrowIcon /></span>
                </span>
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* floating orb + full-screen assistant (replaces the old "Ask about Shubhrato" button and panel) */}
      <Assistant ready={ready} />
    </div>
  );
}
