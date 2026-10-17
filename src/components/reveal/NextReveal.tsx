'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import ProgressRing from './ProgressRing';
import { createRevealEngine, type RevealEngine } from './revealEngine';
import { smooth } from './smooth';
import styles from './reveal.module.css';

// useLayoutEffect warns during server rendering; fall back to useEffect there
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export type RevealPhase = 'reveal' | 'opening' | 'open';

type RevealState = {
  phase: RevealPhase; // reveal: scrolling / filling the ring · opening: the window is opening · open: the next page is up
  direct: boolean; // opened with a Contact button / link (not by scrolling): the scene plays its own opening animation
  lakeReady: boolean; // the lake iframe finished booting
  lakeVisible: boolean; // part of the lake is on screen right now
  lakeNear: boolean; // the lake is about to be needed: run it at full speed
  setLakeReady: (ready: boolean) => void;
};

const RevealContext = createContext<RevealState>({
  phase: 'reveal',
  direct: false,
  lakeReady: false,
  lakeVisible: false,
  lakeNear: false,
  setLakeReady: () => {},
});
export const useReveal = () => useContext(RevealContext);

type Props = {
  children: ReactNode; // the section that lifts away (Work)
  next: ReactNode; // the page that opens afterwards (Contact)
  title?: string; // label in the overlay
};

/**
 * "Just continue to reveal": when the visitor reaches the end of `children`, the section lifts away to uncover the
 * lake behind it, a ring fills while they keep scrolling, then the window opens to full screen and `next` takes over.
 * All the timing lives in revealEngine.ts; this file is the React / layout side.
 */
export default function NextReveal({ children, next, title = 'Contact' }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const bandRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const ringLinkRef = useRef<HTMLAnchorElement>(null);
  const barRef = useRef<SVGCircleElement>(null);
  const engineRef = useRef<RevealEngine | null>(null);

  const [phase, setPhase] = useState<RevealPhase>('reveal');
  const [lakeReady, setLakeReady] = useState(false);
  const [lakeVisible, setLakeVisible] = useState(false);
  const [lakeNear, setLakeNear] = useState(false);
  const [direct, setDirect] = useState(false);
  const directRef = useRef(false);
  const phaseRef = useRef<RevealPhase>('reveal');
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    engineRef.current?.setLakeReady(lakeReady);
  }, [lakeReady]);

  // The lake iframe sits BEHIND the page (z-index -1). A background painted on <body> would cover it, so while this
  // component is mounted the page colour is carried by <html> (whose background paints under everything) instead.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const bodyBg = getComputedStyle(body).backgroundColor;
    if (bodyBg === 'transparent' || /^rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)$/.test(bodyBg)) return; // nothing to move
    const prevHtml = html.style.backgroundColor;
    const prevBody = body.style.backgroundColor;
    html.style.backgroundColor = bodyBg;
    body.style.backgroundColor = 'transparent';
    return () => {
      html.style.backgroundColor = prevHtml;
      body.style.backgroundColor = prevBody;
    };
  }, []);

  // the engine: scroll / wheel / touch → ring, window and overlay
  useEffect(() => {
    const root = rootRef.current;
    const panel = panelRef.current;
    const overlay = overlayRef.current;
    if (!root || !panel || !overlay) return;
    const engine = createRevealEngine({
      root,
      panel,
      overlay,
      bar: barRef.current,
      onFire: () => setPhase('opening'),
      onOpen: () => setPhase('open'),
      onLakeVisible: setLakeVisible,
      onLakeNear: setLakeNear,
    });
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  // Two ways into the Contact page:
  //  · SCROLL: the reveal (lake window, ring, expansion), see revealEngine.ts
  //  · A CONTACT BUTTON / LINK (#contact, scrollIntoView on #contact, or the 'portfolio:open-contact' event): no reveal;
  //    the page scrolls down to Contact and the scene plays its own opening animation (the circle opening from the middle).
  useEffect(() => {
    const scrollToNext = () => {
      const el = nextRef.current;
      if (!el) return;
      const y = el.getBoundingClientRect().top + window.scrollY;
      if (smooth.lenis) smooth.lenis.scrollTo(y, { duration: 1.4 });
      else window.scrollTo({ top: y, behavior: 'smooth' });
    };
    const goDirect = () => {
      const ph = phaseRef.current;
      if (ph === 'opening') return;
      if (ph === 'open') {
        scrollToNext();
        return;
      }
      directRef.current = true;
      setDirect(true);
      engineRef.current?.openNow(); // → phase 'open'; the layout effect below does the scrolling
    };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]');
      if (!a) return;
      const href = a.getAttribute('href');
      if (href !== '#contact' && href !== '/#contact') return;
      e.preventDefault();
      if (a === ringLinkRef.current) engineRef.current?.fire(); // the ring itself: same as filling it
      else goDirect();
    };
    const onHash = () => {
      if (window.location.hash === '#contact') goDirect();
    };
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element, ...args: Parameters<Element['scrollIntoView']>) {
      if (this.id === 'contact' && phaseRef.current !== 'open') {
        goDirect();
        return;
      }
      return originalScrollIntoView.apply(this, args);
    };
    document.addEventListener('click', onClick, true);
    window.addEventListener('hashchange', onHash);
    window.addEventListener('portfolio:open-contact', goDirect);
    return () => {
      Element.prototype.scrollIntoView = originalScrollIntoView;
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('portfolio:open-contact', goDirect);
    };
  }, []);

  // the hand-off: the contact page joins the scroll and the page jumps to it. The window is fully open at this
  // moment (the lake fills the screen), and so is the fixed iframe behind it, so nothing visibly changes.
  useIsoLayoutEffect(() => {
    if (phase !== 'open') return;
    const nextEl = nextRef.current;
    const panel = panelRef.current;
    if (panel) {
      panel.style.clipPath = '';
      panel.style.willChange = '';
    }
    if (!nextEl) return;
    const lenis = smooth.lenis;
    lenis?.start();
    lenis?.resize();
    const y = nextEl.getBoundingClientRect().top + window.scrollY;
    if (directRef.current) {
      // a Contact button: scroll down to it
      if (lenis) lenis.scrollTo(y, { duration: 1.4 });
      else window.scrollTo({ top: y, behavior: 'smooth' });
    } else if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
    else window.scrollTo(0, y);
  }, [phase]);

  const reportLakeReady = useCallback((ready: boolean) => setLakeReady(ready), []);
  const value = useMemo<RevealState>(
    () => ({ phase, direct, lakeReady, lakeVisible, lakeNear, setLakeReady: reportLakeReady }),
    [phase, direct, lakeReady, lakeVisible, lakeNear, reportLakeReady],
  );

  return (
    <RevealContext.Provider value={value}>
      <div ref={rootRef} className={styles.root} data-phase={phase}>
        <div ref={panelRef} className={styles.panel}>
          {children}
        </div>
        <div ref={bandRef} className={styles.band} aria-hidden />

        <div ref={overlayRef} className={styles.overlay}>
          <div className={`${styles.container} ${phase === 'reveal' ? '' : styles.fading}`}>
            <p className={styles.top}>
              <span>(Just</span>
              <span>Continue</span>
              <span>to</span>
              <span>reveal)</span>
            </p>
            <a ref={ringLinkRef} href="#contact" className={styles.ringLink}>
              <ProgressRing barRef={barRef} />
              <span className={styles.nextText}>[ next page ]</span>
            </a>
            <p className={styles.title}>{title}</p>
          </div>
        </div>

        <div ref={nextRef} className={styles.next}>
          {next}
        </div>
      </div>
    </RevealContext.Provider>
  );
}
