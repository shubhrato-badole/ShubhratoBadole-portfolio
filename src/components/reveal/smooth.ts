import type Lenis from 'lenis';

/* One shared handle to the page's Lenis instance (created by <SmoothScroll />).
   It is `null` until the intro is over, or when the visitor prefers reduced motion;
   everything that reads it falls back to plain window scrolling. */
export const smooth: { lenis: Lenis | null } = { lenis: null };

/* ease-in-out: starts gently, glides, lands gently (the default Lenis ease is a hard ease-OUT, which feels like a
   whoosh followed by a long crawl on long distances) */
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Scroll to an element (or a y position) the same way everywhere on the site: nav links, buttons, the scene's links.
 *  The duration follows the distance (short hop ~0.9 s, long trip up to 1.9 s), so nothing feels rushed or sluggish. */
export function scrollToTarget(target: HTMLElement | number, opts: { duration?: number; immediate?: boolean } = {}) {
  const y = typeof target === 'number' ? target : target.getBoundingClientRect().top + window.scrollY;
  const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const immediate = opts.immediate || reduce;
  const lenis = smooth.lenis;
  if (lenis) {
    const distance = Math.abs(y - window.scrollY);
    const duration = opts.duration ?? Math.min(1.9, Math.max(0.9, 0.7 + distance / 3600));
    lenis.scrollTo(y, { duration, easing: easeInOutCubic, immediate });
    return;
  }
  window.scrollTo({ top: y, behavior: immediate ? ('instant' as ScrollBehavior) : 'smooth' });
}
