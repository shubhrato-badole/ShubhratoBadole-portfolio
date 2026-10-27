'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import GlassButton from '../ui/GlassButton';
import { scrollToTarget } from '../reveal/smooth';
import styles from './dock.module.css';

/* PHONE NAVIGATION (760px and below only; above that this component is display:none and the top bar is used).

   A floating glass bar at the bottom: menu button on the left, the name in the middle, and the assistant's orb on the
   right (the orb is the assistant's own launcher button, which assistant.module.css moves into the right end of this bar
   on phones, so the takeover still opens from it). Tapping the menu opens the bar upward into a panel.

   The links are plain <a href="#..."> exactly like the top bar's, so every existing hand-off keeps working
   (StackGate: ring transitions for Stack / Work / About; NextReveal: Contact). */

type Props = {
  /** flips to true when the intro hands off, same as the assistant's launcher */
  ready?: boolean;
  /** the top bar's own click handler (smooth scroll / reveal hand-off) */
  onAnchor: (e: React.MouseEvent<HTMLAnchorElement>, href: string) => void;
};

type Key = 'home' | 'about' | 'stack' | 'work' | 'contact';

const ITEMS: { key: Key; label: string; href: string }[] = [
  { key: 'home', label: 'Home', href: '#top' },
  { key: 'about', label: 'About', href: '#about' },
  { key: 'stack', label: 'Stack', href: '#stack' },
  { key: 'work', label: 'Work', href: '#work' },
  { key: 'contact', label: 'Contact', href: '#contact' },
];

const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* which page the visitor is on, worked out only when the menu opens (no scroll listener) */
function currentPage(): Key {
  if (document.documentElement.hasAttribute('data-sr-open')) return 'stack';
  const H = window.innerHeight;
  const rect = (id: string) => document.getElementById(id)?.getBoundingClientRect();
  const c = rect('contact');
  if (c && c.height > 0 && c.top < H * 0.5) return 'contact';
  const w = rect('work');
  if (w && w.top <= H * 0.5 && w.bottom > H * 0.5) return 'work';
  const a = rect('about');
  if (a && a.top <= H * 0.5 && a.bottom > H * 0.5) return 'about';
  return 'home';
}

export default function MobileDock({ ready = true, onAnchor }: Props) {
  const [open, setOpen] = useState(false); // the target state (drives the animation)
  const [mounted, setMounted] = useState(false); // the panel's content exists (so its button's canvas only runs while the menu is up)
  const [current, setCurrent] = useState<Key>('home');
  const timer = useRef(0);
  const raf = useRef(0);

  const close = useCallback(() => {
    cancelAnimationFrame(raf.current);
    setOpen(false);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMounted(false), reduce() ? 0 : 560);
  }, []);

  const openMenu = useCallback(() => {
    window.clearTimeout(timer.current);
    setCurrent(currentPage());
    setMounted(true);
    // two frames: the content has to exist at height 0 before it can grow
    raf.current = requestAnimationFrame(() => {
      raf.current = requestAnimationFrame(() => setOpen(true));
    });
  }, []);

  const toggle = () => (open ? close() : openMenu());

  /* "Home" is a button, not a #top link: with the Stack open the existing #top handling would send you to About.
     StackGate answers this event (ring + back to the top) when it needs to; otherwise the page just scrolls. */
  const goHome = () => {
    const detail = { handled: false };
    window.dispatchEvent(new CustomEvent('portfolio:home', { detail }));
    if (!detail.handled) scrollToTarget(0, { immediate: reduce() });
  };

  /* close the menu when any link / button inside the panel is used. This listener is registered on the document in the
     CAPTURE phase before StackGate's and NextReveal's, so it still runs when they take the click over. */
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (t?.closest?.('[data-dock-panel] a, [data-dock-panel] button')) close();
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [close]);

  /* Escape closes it; opening the assistant closes it too (the assistant dispatches this event) */
  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    window.addEventListener('portfolio:assistant-open', close);
    window.addEventListener('orientationchange', close);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('portfolio:assistant-open', close);
      window.removeEventListener('orientationchange', close);
    };
  }, [mounted, close]);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      cancelAnimationFrame(raf.current);
    },
    []
  );

  return (
    <>
      {mounted && <div className={`${styles.scrim} ${open ? styles.scrimOn : ''}`} onPointerDown={close} aria-hidden="true" />}

      <nav
        className={`${styles.dock} ${ready ? styles.dockOn : ''} ${open ? styles.dockOpen : ''}`}
        aria-label="Main"
      >
        {/* the glass: a translucent gradient (no backdrop blur: that would re-blur the animated page behind it every frame),
            plus a more solid sheen that fades in while the menu is open */}
        <span className={styles.glass} aria-hidden="true" />
        <span className={styles.sheen} aria-hidden="true" />

        <div className={styles.panel} data-dock-panel aria-hidden={!open}>
          <div className={styles.panelClip}>
            {mounted && (
              <div className={styles.panelBody}>
                <p className={styles.label}>Menu</p>
                <ul className={styles.list}>
                  {ITEMS.map((it, i) => {
                    const isCurrent = current === it.key;
                    const inner = (
                      <>
                        <span className={styles.num}>{String(i + 1).padStart(2, '0')}</span>
                        <span className={styles.name}>
                          {isCurrent && <span className={styles.here} aria-hidden="true">↳</span>}
                          {it.label}
                        </span>
                      </>
                    );
                    return (
                      <li key={it.key} className={styles.item} style={{ ['--i' as string]: i } as React.CSSProperties}>
                        {it.key === 'home' ? (
                          <button type="button" className={styles.row} onClick={goHome} aria-current={isCurrent ? 'page' : undefined}>
                            {inner}
                          </button>
                        ) : (
                          <a
                            className={styles.row}
                            href={it.href}
                            onClick={(e) => onAnchor(e, it.href)}
                            aria-current={isCurrent ? 'page' : undefined}
                          >
                            {inner}
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <div className={styles.cta} style={{ ['--i' as string]: ITEMS.length } as React.CSSProperties}>
                  <GlassButton
                    href="#contact"
                    label="Let's talk"
                    size="sm"
                    tone="blue"
                    onClick={(e) => onAnchor(e as React.MouseEvent<HTMLAnchorElement>, '#contact')}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className={styles.bar}>
          <button
            type="button"
            className={styles.burger}
            onClick={toggle}
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            <span />
            <span />
          </button>
          <button type="button" className={styles.mark} onClick={goHome} aria-label="Shubhrato, back to the top">
            Shubhra<i>to</i>
          </button>
          {/* the assistant's orb sits here (see assistant.module.css) */}
          <span className={styles.orbSlot} aria-hidden="true" />
        </div>
      </nav>
    </>
  );
}
