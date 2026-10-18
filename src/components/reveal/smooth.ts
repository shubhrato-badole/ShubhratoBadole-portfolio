import type Lenis from 'lenis';

/* One shared handle to the page's Lenis instance (created by <SmoothScroll />).
   It is `null` until the intro is over, or when the visitor prefers reduced motion;
   everything that reads it falls back to plain window scrolling. */
export const smooth: { lenis: Lenis | null } = { lenis: null };
