'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type FormEvent } from 'react';
import gsap from 'gsap';
import { useReveal } from '../reveal/NextReveal';
import { smooth, scrollToTarget } from '../reveal/smooth';
import { runRingTransition, isRingRunning } from '../stack/ringTransition';
import GlassButton from '../ui/GlassButton';
import { CONTACT } from '../assistant/brain';
import ContactBackdrop from './ContactBackdrop';
import styles from './contactNative.module.css';

/* The Contact section, built straight into the page.

   NO 3D ENGINE, NO IFRAME, NO SOUND, NO DOWNLOADED SCENE. The lake and the garden are two pictures (public/contact-scene/*.jpg);
   ContactBackdrop moves them like a camera and adds the living parts (fireflies, falling petals, sparkles, water glints) in one
   tiny canvas. That is why it looks like the real scene and costs almost nothing: no GPU scene, no workers, nothing to boot,
   nothing that can fail, the same on every phone and laptop.

   TWO WAYS IN:
   · SCROLL  : Work lifts away, the lake window, the ring fills (revealEngine), the window opens, then the camera moves on to the
               tree and chairs while the black panel slides in from the right.
   · BUTTON  : "Let's talk" / dock Contact: NO scene animation. The intro's RING closes over the screen (fast), the page jumps to the
               finished Contact page while it is covered, and the ring opens straight onto it. (If another ring is already covering the
               screen, e.g. the Stack overlay's, Contact does not start a second one.) */

const EMAIL = 'bshubhrato@gmail.com';
const LOCATION = 'Nagpur, India';
const SERVICES = ['AI & agentic RAG systems', 'backend APIs & data', 'full-stack web apps', 'secure auth & cybersecurity', 'cloud, Docker & CI/CD'];
const LAKE_URL = '/contact-scene/lake-poster.jpg';
const GARDEN_URL = '/contact-scene/garden-poster.jpg';

/* how long the camera takes from the lake to the garden when you SCROLL in (seconds). A Contact button does not use it: that path lands on the finished page */
const PAN_SECONDS = 1.7;
const DIRECT_RING = { close: 0.55, open: 0.95 }; // seconds, the Contact button's ring (the Stack / Work rings keep their own, longer, defaults)

// useLayoutEffect warns during server rendering; fall back to useEffect there
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
const MOBILE_QUERY = '(max-width: 900px)';

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2); // gentle start, no long wait before it moves
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const subscribeMobile = (cb: () => void) => {
  const mq = window.matchMedia(MOBILE_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
const getMobile = () => window.matchMedia(MOBILE_QUERY).matches;

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
  const panelRef = useRef<HTMLDivElement>(null);
  const ppRef = useRef(0); // the camera progress 0..1, read by the backdrop's canvas
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  const playedRef = useRef(false);
  const lastRun = useRef(0);

  const { phase, directRun, direct, lakeNear, lakeVisible, setLakeReady, subscribeProgress, jumpToNext } = useReveal();
  const open = phase === 'open';
  const opening = phase === 'opening';
  const engaged = open || opening;
  const mobile = useSyncExternalStore(subscribeMobile, getMobile, () => false);

  const [landed, setLanded] = useState(false); // the pictures may be shown (a Contact button waits until the ring has covered the screen)
  const [seenRaw, setSeen] = useState(false);
  const [panelIn, setPanelIn] = useState(false); // the panel has arrived: its rows rise in one after another
  const seen = open && seenRaw;

  /* pictures need no loading step: tell the reveal the lake is ready right away */
  useEffect(() => {
    setLakeReady(true);
  }, [setLakeReady]);

  /* what the section can see of itself (the backdrop's little canvas only runs while somebody can see it) */
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setSeen(e.intersectionRatio > 0.04), { threshold: [0, 0.04, 0.5, 1] });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /* The camera numbers are written ONLY on the elements that read them: the two picture layers (--cam / --rush / --land / --pull) and
     the panel (--pp). Written on the section itself they were inherited by the whole form, so every frame of the move re-styled every row. */
  const layersRef = useRef<HTMLElement[]>([]); // [lake, garden]
  const vals = useRef({ pp: '0', cam: '0', rush: '0', land: '0', pull: '0' });
  const writeVars = useCallback(() => {
    const v = vals.current;
    const [lake, garden] = layersRef.current;
    if (lake) {
      lake.style.setProperty('--cam', v.cam);
      lake.style.setProperty('--rush', v.rush);
      lake.style.setProperty('--pull', v.pull);
    }
    if (garden) {
      garden.style.setProperty('--cam', v.cam);
      garden.style.setProperty('--land', v.land);
    }
    panelRef.current?.style.setProperty('--pp', v.pp);
  }, []);
  useIsoLayoutEffect(() => {
    layersRef.current = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[data-cxv]') ?? []);
    writeVars();
  }, [writeVars]);
  /* the panel is created when the page opens, possibly in the middle of the move: give it the current value before it is painted */
  useIsoLayoutEffect(() => {
    panelRef.current?.style.setProperty('--pp', vals.current.pp);
  }, [open]);

  /* THE PULL: while the visitor pulls (the ring filling) the camera already creeps forward over the lake, in step with the ring; if
     they let go the ring drains and the camera drifts back. When the ring is full the flight below continues from exactly there. */
  useEffect(
    () =>
      subscribeProgress((p) => {
        if (playedRef.current) return;
        vals.current.pull = (1 - Math.pow(1 - p, 2)).toFixed(4);
        layersRef.current[0]?.style.setProperty('--pull', vals.current.pull);
      }),
    [subscribeProgress],
  );

  /* ---------- the camera move: lake -> tree and chairs, with the panel arriving on the right ---------- */
  const setProgress = useCallback((p: number) => {
    const pe = ease(p);
    const pp = smoothstep(0.22, 0.8, pe);
    ppRef.current = pe;
    const v = vals.current;
    v.pp = pp.toFixed(4); // the panel
    v.cam = pe.toFixed(4); // the pictures: overall progress
    v.rush = Math.pow(pe, 1.8).toFixed(4); // the lake: the camera speeds up over the water
    v.land = (1 - Math.pow(1 - pe, 2.4)).toFixed(4); // the garden: arrives fast, settles slowly
    writeVars();
    if (pe > 0.5) setPanelIn(true);
  }, [writeVars]);

  const playPan = useCallback(
    (delay = 0) => {
      tweenRef.current?.kill();
      const o = { p: 0 };
      const apply = () => setProgress(o.p);
      setPanelIn(false);
      apply();
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        o.p = 1;
        apply();
        return;
      }
      tweenRef.current = gsap.to(o, { p: 1, duration: PAN_SECONDS, delay, ease: 'none', onUpdate: apply });
    },
    [setProgress],
  );

  /* SCROLL path: the moment the ring is full (the window starts to open) the camera starts to move */
  useEffect(() => {
    if (direct || !engaged || playedRef.current) return;
    playedRef.current = true;
    vals.current.pull = '1';
    layersRef.current[0]?.style.setProperty('--pull', '1');
    setLanded(true);
    playPan(0); // the flight carries on from the pull without a pause
  }, [direct, engaged, playPan]);

  /* BUTTON path: no scene animation at all. ONE ring (the intro's, run fast): it covers the screen, the page jumps to the FINISHED
     Contact page while covered, and the ring opens straight onto it (the rows rise in as it opens).
     If a ring is already on screen (the Stack overlay plays one before it sends us here) we ride on that one. */
  useEffect(() => {
    if (!direct || !open || directRun === lastRun.current) return;
    lastRun.current = directRun;
    playedRef.current = true;
    tweenRef.current?.kill();
    const land = () => {
      tweenRef.current?.kill();
      jumpToNext();
      setProgress(1); // camera at the garden, panel in place
      setPanelIn(true);
      setLanded(true);
    };
    if (isRingRunning()) {
      void Promise.resolve().then(land);
      return;
    }
    void runRingTransition(land, { close: DIRECT_RING.close, open: DIRECT_RING.open });
  }, [direct, open, directRun, jumpToNext, setProgress]);

  useEffect(
    () => () => {
      tweenRef.current?.kill();
    },
    [],
  );

  /* the reveal was re-armed (you left Contact): get ready to play the whole opening again next time */
  useEffect(() => {
    if (engaged) return;
    playedRef.current = false;
    tweenRef.current?.kill();
    ppRef.current = 0;
    vals.current = { pp: '0', cam: '0', rush: '0', land: '0', pull: '0' };
    writeVars();
    setPanelIn(false);
    setLanded(false);
  }, [engaged, writeVars]);

  /* the panel's height changes as fonts and rows settle: keep the smooth scroller's idea of the page length right */
  useEffect(() => {
    if (!open || !panelRef.current) return;
    const ro = new ResizeObserver(() => smooth.lenis?.resize());
    ro.observe(panelRef.current);
    return () => ro.disconnect();
  }, [open]);

  /* the pictures exist on screen only when Contact is about to be needed (end of Work, opening, open); a Contact button waits for the ring */
  const layersOn = lakeNear || (engaged && (!direct || landed));
  const show = layersOn && (engaged || lakeVisible);
  const backdropOn = (open ? seen : opening || lakeNear) && show;

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
    >
      <ContactBackdrop ppRef={ppRef} active={backdropOn} mobile={mobile} lake={LAKE_URL} garden={GARDEN_URL} visible={layersOn} />
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
