'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type FormEvent } from 'react';
import gsap from 'gsap';
import { useReveal } from '../reveal/NextReveal';
import { smooth, scrollToTarget } from '../reveal/smooth';
import { runRingTransition } from '../stack/ringTransition';
import GlassButton from '../ui/GlassButton';
import { CONTACT } from '../assistant/brain';
import { createContactScene, type ContactScene } from './contactScene';
import styles from './contactNative.module.css';

/* The Contact section, built straight into the page (no iframe).

   WHY NOT AN IFRAME ANY MORE: an iframe swallows the cursor (so the project's cursor smoke could not reach it), cannot use
   the ring transition, and had its own separate scroll (the cause of the mobile scroll trouble). Here the scene is ONE
   fixed canvas behind the page and the panel is normal page content, so it scrolls with the same smooth scroller as
   everything else, the smoke works over it (data-wk-smoke) and the ring transition opens it.

   TWO WAYS IN (both end in the same place):
   · SCROLL  : Work lifts away, the lake window, the ring fills (revealEngine), the window opens, then the camera slides left
               to the tree and chairs while the black panel slides in from the right.
   · BUTTON  : "Let's talk" / dock Contact: the project's RING transition covers the screen, the page jumps to Contact while
               it is covered, the ring opens onto the lake, then the same camera move plays.
   · NOTHING IS EVER BLANK: the lake poster is under everything; the live canvas only fades in once it has drawn a frame. */

const EMAIL = 'bshubhrato@gmail.com';
const LOCATION = 'Nagpur, India';
const SERVICES = ['AI & agentic RAG systems', 'backend APIs & data', 'full-stack web apps', 'secure auth & cybersecurity', 'cloud, Docker & CI/CD'];
const POSTER_URL = '/contact-scene/lake-poster-own.jpg';

/* start loading the scene after the page has been idle this long even if the visitor has not scrolled yet */
const IDLE_PRELOAD_MS = 6000;
/* how long the camera takes from the lake to the garden (seconds) */
const PAN_SECONDS = 3.2;
const MOBILE_QUERY = '(max-width: 900px)';

type IdleWindow = Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const isContactLink = (el: EventTarget | null) => !!(el as Element | null)?.closest?.('a[href="#contact"], a[href="/#contact"]');

const subscribeMobile = (cb: () => void) => {
  const mq = window.matchMedia(MOBILE_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
const getMobile = () => window.matchMedia(MOBILE_QUERY).matches;

const waitFor = (test: () => boolean, ms: number) =>
  new Promise<void>((resolve) => {
    const t0 = performance.now();
    const step = () => (test() || performance.now() - t0 > ms ? resolve() : setTimeout(step, 60));
    step();
  });

const Arrow = ({ down }: { down?: boolean }) => (
  <svg className={styles.ico} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {down ? (
      <>
        <path d="m15 10 5 5-5 5" />
        <path d="M4 4v7a4 4 0 0 0 4 4h12" />
      </>
    ) : (
      <>
        <path d="M7 7h10v10" />
        <path d="M7 17 17 7" />
      </>
    )}
  </svg>
);

export default function ContactNative() {
  const rootRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ContactScene | null>(null);
  const readyRef = useRef(false);
  const failedRef = useRef(false);
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  const playedRef = useRef(false);
  const lastRun = useRef(0);

  const { phase, directRun, direct, lakeNear, lakeVisible, setLakeReady, jumpToNext } = useReveal();
  const open = phase === 'open';
  const opening = phase === 'opening';
  const engaged = open || opening;
  const mobile = useSyncExternalStore(subscribeMobile, getMobile, () => false);

  const [load, setLoad] = useState(false);
  const [ready, setReady] = useState(false); // the scene has drawn its first frame
  const [failed, setFailed] = useState(false); // no WebGL: the poster stays, the panel still works
  const [seenRaw, setSeen] = useState(false);
  const [panelIn, setPanelIn] = useState(false); // the panel has arrived: its rows rise in one after another
  const seen = open && seenRaw;
  const loadNow = load || direct;

  /* ---------- 1. start loading the scene early enough (cheap, but never during the first moments of the page) ---------- */
  useEffect(() => {
    if (load) return;
    const start = () => setLoad(true);
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const w = window as IdleWindow;
    const onScroll = () => {
      if (window.scrollY > window.innerHeight * 0.6) start();
    };
    const onIntent = (e: Event) => {
      if (isContactLink(e.target)) start();
    };
    let idleId = 0;
    let timer = 0;
    if (!conn?.saveData) {
      timer = window.setTimeout(() => {
        if (w.requestIdleCallback) idleId = w.requestIdleCallback(start, { timeout: 4000 });
        else start();
      }, IDLE_PRELOAD_MS);
    }
    const near = new IntersectionObserver(([e]) => e.isIntersecting && start(), { rootMargin: '500% 0px' });
    if (rootRef.current) near.observe(rootRef.current);
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('pointerover', onIntent, { passive: true });
    document.addEventListener('focusin', onIntent);
    document.addEventListener('touchstart', onIntent, { passive: true });
    window.addEventListener('portfolio:open-contact', start);
    return () => {
      window.clearTimeout(timer);
      if (idleId) w.cancelIdleCallback?.(idleId);
      near.disconnect();
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('pointerover', onIntent);
      document.removeEventListener('focusin', onIntent);
      document.removeEventListener('touchstart', onIntent);
      window.removeEventListener('portfolio:open-contact', start);
    };
  }, [load]);

  /* ---------- 2. build the scene (the art is painted in small pieces, so scrolling never freezes) ---------- */
  useEffect(() => {
    if (!loadNow) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const lowPower = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 900;
    const sc = createContactScene(cv, {
      reduceMotion: reduce,
      lowPower,
      onReady: () => {
        readyRef.current = true;
        setReady(true);
        setLakeReady(true);
      },
    });
    if (!sc) {
      failedRef.current = true;
      setFailed(true);
      setLakeReady(true);
      return;
    }
    sceneRef.current = sc;
    sc.setMobile(getMobile());
    const onResize = () => sc.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      sc.destroy();
      sceneRef.current = null;
      readyRef.current = false;
    };
  }, [loadNow, setLakeReady]);

  useEffect(() => {
    sceneRef.current?.setMobile(mobile);
    sceneRef.current?.resize();
  }, [mobile, ready]);

  /* ---------- 3. what the section can see of itself, and run the scene only while somebody can see it ---------- */
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setSeen(e.intersectionRatio > 0.04), { threshold: [0, 0.04, 0.5, 1] });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const sc = sceneRef.current;
    if (!ready || !sc) return;
    const run = open ? seen : opening || lakeNear;
    const sync = () => (run && !document.hidden ? sc.start() : sc.stop());
    if (run) sync();
    /* a transient "not visible" while the layout changes under the hand-off must never freeze the camera move */
    const t = run ? 0 : window.setTimeout(sync, open ? 400 : 0);
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [ready, open, opening, lakeNear, seen]);

  /* ---------- 4. the camera move: lake -> tree and chairs, with the panel arriving on the right ---------- */
  const setPanelProgress = useCallback((pe: number) => {
    rootRef.current?.style.setProperty('--pp', smoothstep(0.34, 0.92, pe).toFixed(4));
  }, []);

  const playPan = useCallback(
    (delay = 0) => {
      tweenRef.current?.kill();
      const o = { p: 0 };
      const apply = () => {
        sceneRef.current?.setPan(o.p);
        const pe = ease(o.p);
        setPanelProgress(pe);
        if (pe > 0.5) setPanelIn(true);
      };
      setPanelIn(false);
      apply();
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        o.p = 1;
        apply();
        return;
      }
      tweenRef.current = gsap.to(o, { p: 1, duration: PAN_SECONDS, delay, ease: 'none', onUpdate: apply });
    },
    [setPanelProgress],
  );

  /* SCROLL path: the moment the ring is full (the window starts to open) the camera starts to move */
  useEffect(() => {
    if (direct || !engaged || playedRef.current || !(ready || failed)) return;
    playedRef.current = true;
    playPan(0.2);
  }, [direct, engaged, ready, failed, playPan]);

  /* BUTTON path: the project's ring transition covers the screen, the page jumps to Contact unseen, the ring opens onto the lake */
  useEffect(() => {
    if (!direct || !open || directRun === lastRun.current) return;
    lastRun.current = directRun;
    playedRef.current = true;
    tweenRef.current?.kill();
    void runRingTransition(async () => {
      await waitFor(() => readyRef.current || failedRef.current, 5000);
      jumpToNext();
      sceneRef.current?.setPan(0);
      sceneRef.current?.renderOnce();
      setPanelIn(false);
      rootRef.current?.style.setProperty('--pp', '0');
    }).finally(() => playPan(0.35));
  }, [direct, open, directRun, jumpToNext, playPan]);

  useEffect(
    () => () => {
      tweenRef.current?.kill();
    },
    [],
  );

  /* the panel's height changes as fonts and rows settle: keep the smooth scroller's idea of the page length right */
  useEffect(() => {
    if (!open || !panelRef.current) return;
    const ro = new ResizeObserver(() => smooth.lenis?.resize());
    ro.observe(panelRef.current);
    return () => ro.disconnect();
  }, [open]);

  const show = ready && (engaged || lakeVisible);

  /* ---------- the form ---------- */
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [errors, setErrors] = useState<{ name?: boolean; email?: boolean; msg?: boolean }>({});
  const [sent, setSent] = useState(false);
  const lastSubmit = useRef(0);

  const toggle = (s: string) => setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));

  const submit = useCallback(() => {
    const now = performance.now();
    if (now - lastSubmit.current < 500) return;
    lastSubmit.current = now;
    const bad = {
      name: !name.trim(),
      email: !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()),
      msg: !msg.trim(),
    };
    setErrors(bad);
    if (bad.name || bad.email || bad.msg) {
      const id = bad.name ? 'c-name' : bad.email ? 'c-email' : 'c-msg';
      document.getElementById(id)?.focus({ preventScroll: false });
      setSent(false);
      return;
    }
    const subject = `Project enquiry from ${name.trim()}`;
    const body = [
      `Hi Shubhrato,`,
      '',
      msg.trim(),
      '',
      picked.length ? `What I need: ${picked.join(', ')}` : '',
      '',
      `— ${name.trim()}`,
      email.trim(),
    ]
      .filter((l, i, a) => !(l === '' && a[i - 1] === ''))
      .join('\n');
    const a = document.createElement('a');
    a.href = `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setSent(true);
  }, [name, email, msg, picked]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  const go = (target: HTMLElement | number | null) => (e: React.MouseEvent) => {
    e.preventDefault();
    if (target === null) return;
    scrollToTarget(target);
  };

  const rv = (i: number): CSSProperties => ({ ['--i' as string]: i });

  return (
    <section
      ref={rootRef}
      id="contact"
      className={`${styles.contact} ${open ? styles.open : ''} ${panelIn ? styles.in : ''}`}
      aria-label="Contact"
      data-wk-smoke
      style={{ ['--poster' as string]: `url('${POSTER_URL}')`, ['--pp' as string]: 0 }}
    >
      {/* the lake as a picture, under the live canvas: nothing is ever empty while the scene starts */}
      <div className={styles.poster} aria-hidden />
      <canvas ref={canvasRef} className={`${styles.stage} ${show ? styles.stageOn : ''}`} aria-hidden />
      <div className={`${styles.shade} ${show ? styles.stageOn : ''}`} aria-hidden />

      {open && (
        <div ref={panelRef} className={styles.panel} inert={!panelIn}>
          <div className={styles.inner}>
            <h2 className={styles.title} aria-label="Let’s build something meaningful">
              <span className={`${styles.l1} ${styles.rv}`} style={rv(0)} aria-hidden>
                <em>Let’s</em> BUILD
              </span>
              <span className={`${styles.l2} ${styles.rv}`} style={rv(1)} aria-hidden>
                <i className={styles.arr}>↳</i>SOMETHING
              </span>
              <span className={`${styles.l3} ${styles.rv}`} style={rv(2)} aria-hidden>
                MEANINGFUL
              </span>
            </h2>
            <p className={`${styles.sub} ${styles.rv}`} style={rv(3)}>
              Tell me about the project.
              <br />I reply within 24 hours.
            </p>

            <form className={styles.form} onSubmit={onSubmit} noValidate>
              <div className={`${styles.row} ${styles.rv}`} style={rv(4)}>
                <div className={styles.label}>
                  <span id="c-services">What I can do</span>
                  <small>Tap one to tell me what you need.</small>
                </div>
                <ul className={styles.services} role="group" aria-labelledby="c-services">
                  {SERVICES.map((s) => {
                    const on = picked.includes(s);
                    return (
                      <li key={s}>
                        <button type="button" role="checkbox" aria-checked={on} className={`${styles.service} ${on ? styles.on : ''}`} onClick={() => toggle(s)}>
                          <span className={styles.radio} aria-hidden />
                          <span>{s}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <label className={`${styles.row} ${styles.field} ${errors.name ? styles.bad : ''} ${styles.rv}`} style={rv(5)} htmlFor="c-name">
                <span className={styles.label}>
                  <span>
                    My name is…<b aria-hidden>*</b>
                  </span>
                </span>
                <span className={styles.control}>
                  <input id="c-name" name="name" type="text" autoComplete="name" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} aria-required="true" aria-invalid={!!errors.name} />
                  {errors.name && <em className={styles.err}>Please tell me your name.</em>}
                </span>
              </label>

              <label className={`${styles.row} ${styles.field} ${errors.email ? styles.bad : ''} ${styles.rv}`} style={rv(6)} htmlFor="c-email">
                <span className={styles.label}>
                  <span>
                    Reach me at…<b aria-hidden>*</b>
                  </span>
                </span>
                <span className={styles.control}>
                  <input id="c-email" name="email" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-required="true" aria-invalid={!!errors.email} />
                  {errors.email && <em className={styles.err}>That email doesn’t look right.</em>}
                </span>
              </label>

              <label className={`${styles.row} ${styles.field} ${errors.msg ? styles.bad : ''} ${styles.rv}`} style={rv(7)} htmlFor="c-msg">
                <span className={styles.label}>
                  <span>
                    What I’m picturing…<b aria-hidden>*</b>
                  </span>
                </span>
                <span className={styles.control}>
                  <textarea id="c-msg" name="message" rows={3} placeholder="Tell me what you’re building, the timeline, and what success looks like." value={msg} onChange={(e) => setMsg(e.target.value)} aria-required="true" aria-invalid={!!errors.msg} />
                  {errors.msg && <em className={styles.err}>Write me a line or two.</em>}
                </span>
              </label>

              <div className={`${styles.row} ${styles.send} ${styles.rv}`} style={rv(8)}>
                <span className={styles.label} aria-hidden />
                <div className={styles.sendBody}>
                  <GlassButton label="Send message" size="md" tone="blue" className="gb--follow" onClick={submit} />
                  <p className={styles.status} role="status" aria-live="polite">
                    {sent ? (
                      <>
                        Your email app should open with the message ready. If it doesn’t, write to <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.
                      </>
                    ) : (
                      'This opens your email app with everything filled in.'
                    )}
                  </p>
                </div>
              </div>
            </form>

            <section className={`${styles.direct} ${styles.rv}`} style={rv(9)} aria-labelledby="c-direct">
              <h3 id="c-direct" className={styles.directTitle}>
                Or reach out directly
              </h3>
              <div className={styles.grid}>
                <div className={styles.group}>
                  <h4>
                    Social <Arrow down />
                  </h4>
                  <ul>
                    <li>
                      <span className={styles.idx}>[01]</span>
                      <a href={CONTACT.linkedin} target="_blank" rel="noopener noreferrer">
                        LinkedIn <Arrow />
                      </a>
                    </li>
                    <li>
                      <span className={styles.idx}>[02]</span>
                      <a href={CONTACT.github} target="_blank" rel="noopener noreferrer">
                        GitHub <Arrow />
                      </a>
                    </li>
                    <li>
                      <span className={styles.idx}>[03]</span>
                      <a href={CONTACT.resume} target="_blank" rel="noopener noreferrer">
                        Résumé <Arrow />
                      </a>
                    </li>
                  </ul>
                </div>
                <div className={styles.group}>
                  <h4>
                    Pages <Arrow down />
                  </h4>
                  <ul>
                    <li>
                      <span className={styles.idx}>[01]</span>
                      <a href="#top" onClick={go(0)}>
                        Home
                      </a>
                    </li>
                    <li>
                      <span className={styles.idx}>[02]</span>
                      <a href="#about" onClick={(e) => go(document.getElementById('about'))(e)}>
                        About
                      </a>
                    </li>
                    <li>
                      <span className={styles.idx}>[03]</span>
                      <a href="#work" onClick={(e) => go(document.getElementById('work'))(e)}>
                        Work
                      </a>
                    </li>
                    <li>
                      <span className={styles.idx}>[04]</span>
                      <span className={styles.current} aria-current="page">
                        Contact
                      </span>
                    </li>
                  </ul>
                </div>
                <div className={styles.group}>
                  <h4>
                    Location <Arrow down />
                  </h4>
                  <p>{LOCATION}</p>
                </div>
                <div className={styles.group}>
                  <h4>
                    E-mail <Arrow down />
                  </h4>
                  <p>
                    <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
                  </p>
                </div>
              </div>
              <footer className={styles.legal}>
                <span>© {new Date().getFullYear()} Shubhrato. All rights reserved</span>
              </footer>
            </section>
          </div>
        </div>
      )}
    </section>
  );
}
