'use client';

/* eslint-disable @next/next/no-img-element */
import { useEffect, useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Ruthie } from 'next/font/google';
import styles from './about.module.css';

// Script font for the big word, accent words and step titles.
const script = Ruthie({ subsets: ['latin'], weight: '400', variable: '--font-script', display: 'swap' });

// useLayoutEffect warns during server rendering; fall back to useEffect there
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export default function About() {
  const rootRef = useRef<HTMLElement>(null);

  useIsoLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    gsap.registerPlugin(ScrollTrigger);
    const all = (sel: string, scope: ParentNode = root) => gsap.utils.toArray<HTMLElement>(sel, scope);
    const one = (sel: string) => root.querySelector<HTMLElement>(sel);

    // Animations only run when motion is OK; otherwise the section renders statically.
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const undo: (() => void)[] = [];
      // split text into word spans; cleanup puts the original text back
      all('[data-split]').forEach((el) => {
        const text = el.textContent || '';
        el.textContent = '';
        text.trim().split(/\s+/).forEach((w) => {
          const s = document.createElement('span');
          s.setAttribute('data-w', '');
          s.textContent = w;
          el.appendChild(s);
          el.appendChild(document.createTextNode(' '));
        });
        undo.push(() => {
          el.textContent = text;
        });
      });

      /* 1 — statement: words land in random order, and go back out on scroll up */
      const statement = one('[data-statement]');
      if (statement) {
        const words = all('[data-statement] [data-w]');
        gsap.set(words, { opacity: 0, y: 50, filter: 'blur(2px)' });
        gsap.to(words, {
          opacity: 1, y: 0, filter: 'blur(0px)', duration: 2.4, ease: 'power4.out',
          stagger: { each: 0.04, from: 'random' },
          scrollTrigger: { trigger: statement, start: 'top 85%', toggleActions: 'play none none reverse' },
        });
      }

      /* 2 — word + sentence appear, word glides to centre while lines draw,
             then the falling-man card rises from below and grows (all scrubbed, so it reverses) */
      const fall = one('[data-fall]');
      const card = one('[data-fall-card]');
      const tear = one('[data-fall-tear]');
      const word = one('[data-word]');
      const copy = one('[data-scene-copy]');
      const lineEls = all('[data-lines] path') as unknown as SVGPathElement[];
      const textLines = all('[data-fall-line]');
      if (fall && card && tear && word && copy) {
        const copyWords = all('[data-w]', copy);
        gsap.set(word, { opacity: 0, filter: 'blur(8px)' });
        gsap.set(copyWords, { opacity: 0, y: 30 });
        // measure each stroke once (user units, so it stays valid at any viewport size) and hide it by offsetting its dash
        lineEls.forEach((p) => {
          const len = p.getTotalLength();
          gsap.set(p, { strokeDasharray: len, strokeDashoffset: len });
        });
        gsap.set(card, { yPercent: 100, scale: 0.3 });
        gsap.set(tear, { scale: 1.9 });
        gsap.set(textLines, { yPercent: 120 });

        gsap
          .timeline({ scrollTrigger: { trigger: fall, start: 'top 65%', toggleActions: 'play none none reverse' } })
          .to(word, { opacity: 1, filter: 'blur(0px)', duration: 1.2, ease: 'power3.out' })
          .to(copyWords, { opacity: 1, y: 0, stagger: 0.03, duration: 0.7, ease: 'power3.out' }, 0.2);

        // Pen order: the middle axis first, then the diagonals fanning out from it, the box last. Each stroke takes 3.2 units
        // and starts 0.75 after the previous one, so a few strokes are always growing at once (continuous, never a pause).
        // Linear easing ties the pen directly to scroll, and the whole figure is only complete at the end of the drawing
        // stretch. One timeline unit is roughly 22vh of scroll.
        const ORDER = [0, 13, 1, 10, 11, 12, 2, 3, 6, 7, 4, 5, 8, 9, 14];
        const tl = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: { trigger: fall, start: 'top top', end: '+=600%', scrub: 1, pin: true, anticipatePin: 1, invalidateOnRefresh: true },
        });
        ORDER.forEach((li, k) => {
          tl.to(lineEls[li], { strokeDashoffset: 0, duration: 3.2 }, k * 0.75);
        });
        tl.fromTo(word, { scale: 0.8 }, { scale: 1, duration: 13.7 }, 0)
          .to(copy, { opacity: 0, y: -40, duration: 3 }, 4)
          .to(card, { yPercent: 0, duration: 4 }, 15.2) // short pause first, so the finished figure is seen
          .to(card, { scale: 1, duration: 4.4 })
          .to(tear, { scale: 1, duration: 3 }, '<0.9')
          .to(textLines, { yPercent: 0, duration: 2.4, stagger: 0.22, ease: 'power3.out' }, '>-0.4')
          .to({}, { duration: 2 });
      }

      /* 3 — process (unchanged) */
      const proc = one('[data-process]');
      const bg = one('[data-process-bg]');
      if (proc && bg) {
        gsap.fromTo(bg, { yPercent: -8 }, { yPercent: 0, ease: 'none', scrollTrigger: { trigger: proc, start: 'top bottom', end: 'bottom bottom', scrub: true } });
      }
      const reveal = (sel: string, from: gsap.TweenVars, to: gsap.TweenVars, stagger: number, start: string) => {
        const el = one(sel);
        if (!el) return;
        const w = all('[data-w]', el);
        gsap.set(w, from);
        gsap.to(w, { ...to, stagger, scrollTrigger: { trigger: el, start, toggleActions: 'play none none reverse' } });
      };
      reveal('[data-process-head]', { opacity: 0, y: 80 }, { opacity: 1, y: 0, duration: 0.8, ease: 'power4.out' }, 0.05, 'top 75%');
      reveal('[data-process-intro]', { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' }, 0.015, 'top 80%');
      all('[data-step]').forEach((step) => {
        const tw = all('[data-step-title] [data-w]', step);
        const bw = all('[data-step-body] [data-w]', step);
        gsap.set(step, { opacity: 0, y: 120 });
        gsap.set(tw, { opacity: 0, y: 60 });
        gsap.set(bw, { opacity: 0, y: 30 });
        gsap
          .timeline({ scrollTrigger: { trigger: step, start: 'top 80%', toggleActions: 'play none none reverse' } })
          .to(step, { y: 0, opacity: 1, duration: 0.8, ease: 'power4.out' })
          .to(tw, { opacity: 1, y: 0, stagger: 0.05, duration: 0.5, ease: 'power4.out' }, '-=0.4')
          .to(bw, { opacity: 1, y: 0, stagger: 0.015, duration: 0.4, ease: 'power3.out' }, '-=0.35');
      });

      return () => undo.forEach((fn) => fn());
    });

    // heights depend on fonts, so re-measure once they load
    const refresh = () => ScrollTrigger.refresh();
    document.fonts?.ready.then(refresh);
    window.addEventListener('load', refresh);
    return () => {
      window.removeEventListener('load', refresh);
      mm.revert();
    };
  }, []);

  return (
    <section ref={rootRef} id="about" className={`${styles.about} ${script.variable}`}>
  <div className={styles.statement}>
    <p className={styles.statementText}><span className={styles.indent} aria-hidden="true"></span><span data-statement data-split>I don&apos;t just wire up models. I build AI systems that retrieve the right thing, fail loudly, and are worth trusting. From the first prototype to the last deploy, I care about the details that make software feel dependable and worth coming back to.</span></p>
  </div>

  <div className={styles.fall} data-fall>
    <svg className={styles.lines} data-lines viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <path d="M-57 540.3L1986 540.3" />
      <path d="M959.8 540.2L264.8 -153.8" />
      <path d="M564.8 540.2L-152.5 -128.8" />
      <path d="M565.2 541.2L-152.2 1210.2" />
      <path d="M370.6 540L1088 -129" />
      <path d="M371.2 540.8L1090.2 1206.8" />
      <path d="M1544.8 540.2L827.5 -128.8" />
      <path d="M1545.2 541.2L827.8 1210.2" />
      <path d="M1356.7 540L2074 -129" />
      <path d="M1356.6 541L2074 1210" />
      <path d="M959.8 539.8L1654.2 -154.2" />
      <path d="M959.6 539.6L1653.3 1233.3" />
      <path d="M959.5 540L406.6 1092.1" />
      <path d="M959.3 1207.1L959.3 -126" />
      <path d="M1356.75 933.75H565.25V145.75L1356.75 143.25V933.75Z" />
    </svg>
    <div className={styles.bigWord} data-word><span className={styles.script}>Systems</span></div>
    <p className={styles.sceneCopy} data-scene-copy data-split>Models get the attention. Engineering makes them dependable. I combine both to build AI that holds up in production.</p>
    <div className={styles.card} data-fall-card>
      <img className={`${styles.media} ${styles.tint}`} src="/about/falling.gif" alt="" />
      <div className={styles.tear} data-fall-tear><img src="/about/paper-tear.png" alt="" /></div>
      <div className={styles.fallCopy}>
        <h2 className={styles.fallHeading}>
          <span className={styles.mask}><span className={styles.maskIn} data-fall-line>Breaking things</span></span>
          <span className={styles.mask}><span className={styles.maskIn} data-fall-line>was always</span></span>
          <span className={styles.mask}><span className={styles.maskIn} data-fall-line><span className={styles.script}>part</span> of the build.</span></span>
        </h2>
        <p className={styles.fallSide}><span className={styles.mask}><span className={styles.maskIn} data-fall-line>And from every break, I rebuilt it sharper.</span></span></p>
      </div>
    </div>
  </div>

  <div className={styles.process} data-process>
    <div className={styles.bg} data-process-bg><img src="/about/standing-blue.webp" alt="" /></div>
    <h2 className={styles.processHead} data-process-head>
      <span data-split>From the First Prototype to the Final Deploy, Every Step Is Built to Create a Dependable</span>
      <span className={`${styles.script} ${styles.processScript}`} data-split>AI System.</span>
    </h2>
    <p className={styles.processIntro} data-process-intro data-split>Every project starts with a question, not an assumption. Through research, architecture and engineering, each stage is built to be measurable, secure and ready to ship.</p>
    <ol className={styles.steps}>
      <li className={`${styles.step} ${styles.left}`} data-step><h3 className={styles.stepTitle} data-step-title data-split>Discovery</h3><p className={styles.stepBody} data-step-body data-split>Every system starts with the problem. I dig into the data, the users and the constraints to find what actually needs to be built.</p></li>
      <li className={`${styles.step} ${styles.right}`} data-step><h3 className={styles.stepTitle} data-step-title data-split>Architecture</h3><p className={styles.stepBody} data-step-body data-split>Retrieval strategy, models, storage, auth. I design the shape of the system first, so the code has somewhere sensible to live.</p></li>
      <li className={`${styles.step} ${styles.left}`} data-step><h3 className={styles.stepTitle} data-step-title data-split>Engineering</h3><p className={styles.stepBody} data-step-body data-split>Agents, APIs and pipelines get built with tests, caching and security in mind. Every layer is made to be fast, observable and safe with data.</p></li>
      <li className={`${styles.step} ${styles.right}`} data-step><h3 className={styles.stepTitle} data-step-title data-split>Deploy &amp; Evolve</h3><p className={styles.stepBody} data-step-body data-split>Shipping is only the beginning. CI/CD, monitoring and alarms keep it healthy, and real usage tells me what to improve next.</p></li>
    </ol>
  </div>
</section>
  );
}