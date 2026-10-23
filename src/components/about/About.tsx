'use client';

/* eslint-disable @next/next/no-img-element */
import { useEffect, useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Ruthie } from 'next/font/google';
import styles from './about.module.css';

// Script font for the big words, accent words and step titles.
const script = Ruthie({ subsets: ['latin'], weight: '400', variable: '--font-script', display: 'swap' });

// useLayoutEffect warns during server rendering; fall back to useEffect there
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/* [start, duration] for each <path> in the lines SVG below, in the same order, in timeline units
   (one unit is roughly 22vh of scroll). The lines start together from the middle AND the right side,
   the left follows a beat later, and the box closes last. */
const LINE_TIMING: [number, number][] = [
  [0, 6.6], [0, 6.6], // horizontal axis, out from the middle both ways
  [0.9, 6.6], [0.9, 6.6], // vertical axis, out from the middle both ways
  [1.8, 6], [1.8, 6], [2.4, 6], [2.4, 6], // diagonals from the middle
  [1.5, 6.6], [1.5, 6.6], [2.7, 6.6], [2.7, 6.6], // diagonals from the right side
  [3, 6.6], [3, 6.6], [3.9, 6.6], [3.9, 6.6], // diagonals from the left side
  [5.4, 9], [5.4, 9], // the box, out from the middle of its right edge, closing on the left
];

/* phones held upright: the lines are drawn from a portrait copy (see the second <svg> below); landscape phones, tablets and desktop keep the original */
const PORTRAIT_QUERY = '(max-width: 760px) and (orientation: portrait)';

/* the 18 strokes of the line drawing (1920 x 1080 space); the portrait copy draws the very same strokes turned a quarter-way over */
const LINE_PATHS = [
  'M960 540.3L-57 540.3',
  'M960 540.3L1986 540.3',
  'M959.3 540L959.3 -126',
  'M959.3 540L959.3 1207.1',
  'M959.8 540.2L264.8 -153.8',
  'M959.8 539.8L1654.2 -154.2',
  'M959.6 539.6L1653.3 1233.3',
  'M959.5 540L406.6 1092.1',
  'M1544.8 540.2L827.5 -128.8',
  'M1545.2 541.2L827.8 1210.2',
  'M1356.7 540L2074 -129',
  'M1356.6 541L2074 1210',
  'M564.8 540.2L-152.5 -128.8',
  'M565.2 541.2L-152.2 1210.2',
  'M370.6 540L1088 -129',
  'M371.2 540.8L1090.2 1206.8',
  'M1356.75 538.75V143.25L565.25 145.75V538.75',
  'M1356.75 538.75V933.75H565.25V538.75',
];

/* the lines start once Build has grown to full size (timeline units), keeping exactly the same drawing speed */
const LINE_START = 2.4;

/* How closely the scene follows the scrollbar. Lenis already smooths the scroll itself, so a big value here stacks a second delay on top
   (that is the "lag"): 1 trailed by about a second, 0.4 is still soft but keeps up. Raise it if you want it floatier. */
const SCRUB = true;

/* true = public/about/falling-blue.webp (the falling man already recoloured, animated WebP: no live colour filter, lighter to draw).
   false = the original GIF + the CSS hue-rotate. */
const BAKED_TINT = true;

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
    mm.add({ motion: '(prefers-reduced-motion: no-preference)', portrait: PORTRAIT_QUERY }, (ctx) => {
      const { motion, portrait } = (ctx.conditions || {}) as { motion?: boolean; portrait?: boolean };
      if (!motion) return;
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

      /* 1 — statement: words land in random order, and go back out on scroll up.
             (No blur on the words any more: animating a blur filter on ~45 separate words is very expensive. Opacity + movement look the same.) */
      const statement = one('[data-statement]');
      if (statement) {
        const words = all('[data-statement] [data-w]');
        gsap.set(words, { opacity: 0, y: 50 });
        gsap.to(words, {
          opacity: 1, y: 0, duration: 2.4, ease: 'power4.out',
          stagger: { each: 0.04, from: 'random' },
          scrollTrigger: { trigger: statement, start: 'top 85%', toggleActions: 'play none none reverse' },
        });
      }

      /* 2 — one pinned scene. Build is on screen from the start, a little smaller; as you scroll it comes up and grows to full
             size, then the lines draw themselves from the middle and the right side while the three words (Build, Break,
             Trust) take turns in the centre. Each word has a few lines of text on the right. Then the falling-man card
             rises and grows. Everything is one scrubbed timeline of explicit from/to values, so it plays the same
             forwards and backwards. Nothing is clipped, and the outgoing word is almost gone before the next one arrives. */
      const fall = one('[data-fall]');
      const card = one('[data-fall-card]');
      const tear = one('[data-fall-tear]');
      const words = all('[data-word-in]');
      const sideLists = all('[data-details]');
      // phones held upright draw the portrait copy of the lines (same 18 strokes, same timing); everything else the landscape one
      const lineEls = all(portrait ? '[data-lines-p] path' : '[data-lines] path') as unknown as SVGPathElement[];
      const textLines = all('[data-fall-line]');
      if (fall && card && tear && words.length === 3 && sideLists.length === 3 && lineEls.length === LINE_TIMING.length) {
        const sideLines = sideLists.map((ul) => all('li', ul));

        // starting states: Build is visible (a little smaller and lower), the other words and all side text wait
        gsap.set(words[0], { opacity: 1, scale: 0.74, yPercent: 10 });
        gsap.set([words[1], words[2]], { opacity: 0, scale: 0.86, yPercent: 12 });
        sideLines.forEach((lis) => gsap.set(lis, { opacity: 0, yPercent: 40 }));
        // The soft glow along the lines used to be a CSS `filter: drop-shadow` on the whole full-screen SVG, re-computed on every scroll frame
        // while 18 strokes redraw. Now each line gets a wider, fainter copy of itself underneath (same path, same animation): the same soft
        // look with no filter at all.
        const glows = lineEls.map((p) => {
          const g = p.cloneNode(true) as SVGPathElement;
          g.setAttribute('data-glow', '');
          p.parentNode?.insertBefore(g, p);
          return g;
        });
        undo.push(() => glows.forEach((g) => g.remove()));
        // measure each stroke once (user units, so it stays valid at any viewport size) and hide it by offsetting its dash
        const lens = lineEls.map((p, k) => {
          const len = p.getTotalLength();
          gsap.set([p, glows[k]], { strokeDasharray: len, strokeDashoffset: len });
          return len;
        });
        gsap.set(card, { yPercent: 100, scale: 0.3 });
        gsap.set(tear, { scale: 1.9 });
        gsap.set(textLines, { yPercent: 120 });

        // 1 unit of this timeline is roughly 22vh of scroll
        const tl = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: { trigger: fall, start: 'top top', end: '+=735%', scrub: SCRUB, pin: true, anticipatePin: 1, invalidateOnRefresh: true },
        });

        // a word comes up and grows into place; later it lifts a little and fades out (fast, so the next word never sits on top of it)
        const enter = (t: gsap.TweenTarget, at: number) =>
          tl.fromTo(t, { opacity: 0, yPercent: 12, scale: 0.86 }, { opacity: 1, yPercent: 0, scale: 1, duration: 2.6, ease: 'power3.out', immediateRender: false }, at);
        const exit = (t: gsap.TweenTarget, at: number) =>
          tl.fromTo(t, { opacity: 1, yPercent: 0, scale: 1 }, { opacity: 0, yPercent: -10, scale: 1.05, duration: 1.6, ease: 'power2.out', immediateRender: false }, at);
        // the lines of text on the right come up one after another, and leave together with their word
        const showSide = (t: gsap.TweenTarget, at: number) =>
          tl.fromTo(t, { opacity: 0, yPercent: 40 }, { opacity: 1, yPercent: 0, duration: 1.2, stagger: 0.35, ease: 'power2.out', immediateRender: false }, at);
        const hideSide = (t: gsap.TweenTarget, at: number) =>
          tl.fromTo(t, { opacity: 1, yPercent: 0 }, { opacity: 0, yPercent: -30, duration: 0.9, stagger: 0.08, ease: 'power2.in', immediateRender: false }, at);

        // lines: same speed as before, they just begin once Build has grown
        lineEls.forEach((p, k) => {
          tl.fromTo(
            [p, glows[k]],
            { strokeDashoffset: lens[k] },
            { strokeDashoffset: 0, duration: LINE_TIMING[k][1], ease: 'power2.inOut', immediateRender: false },
            LINE_START + LINE_TIMING[k][0]
          );
        });

        // Build comes up and grows. Its sentence on the right starts coming up just before the lines start drawing.
        tl.fromTo(words[0], { scale: 0.74, yPercent: 10 }, { scale: 1, yPercent: 0, duration: 2.6, ease: 'power3.out', immediateRender: false }, 0);
        showSide(sideLines[0], LINE_START - 0.5);

        // Build hands over to Break
        exit(words[0], 6);
        hideSide(sideLines[0], 6);
        enter(words[1], 7);
        showSide(sideLines[1], 8.4);

        // Break hands over to Trust, which is fully in about when the lines finish drawing
        exit(words[1], 13);
        hideSide(sideLines[1], 13);
        enter(words[2], 14);
        showSide(sideLines[2], 15.4);

        // Trust leaves soon after its text, and the card (unchanged) rises and grows
        exit(words[2], 19.6);
        hideSide(sideLines[2], 19.6);

        tl.fromTo(card, { yPercent: 100 }, { yPercent: 0, duration: 4, immediateRender: false }, 20.8)
          .fromTo(card, { scale: 0.3 }, { scale: 1, duration: 4.4, immediateRender: false })
          .fromTo(tear, { scale: 1.9 }, { scale: 1, duration: 3, immediateRender: false }, '<0.9')
          .fromTo(textLines, { yPercent: 120 }, { yPercent: 0, duration: 2.4, stagger: 0.22, ease: 'power3.out', immediateRender: false }, '>-0.4')
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
    <section ref={rootRef} id="about" className={`${styles.about} ${script.variable}`} data-wk-smoke>
  <div className={styles.statement}>
    <p className={styles.statementText}><span className={styles.indent} aria-hidden="true"></span><span data-statement data-split>I don&apos;t just wire up models. I build AI systems that retrieve the right thing, fail loudly, and are worth trusting. From the first prototype to the last deploy, I care about the details that make software feel dependable and worth coming back to.</span></p>
  </div>

  <div className={styles.fall} data-fall>
    <svg className={styles.lines} data-lines viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {LINE_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
    {/* portrait phones: the same strokes with x and y swapped, in a tall 1080 x 1920 frame, so the cross, the diagonals and the box all stay in view */}
    <svg className={`${styles.lines} ${styles.linesP}`} data-lines-p viewBox="0 0 1080 1920" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <g transform="matrix(0 1 1 0 0 0)">
        {LINE_PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    </svg>

    <div className={styles.beat}>
      <div className={styles.bigWord}><span className={styles.script} data-word-in>Build</span></div>
      <ul className={styles.details} data-details>
        <li>Models get the attention.</li>
        <li>Engineering makes them dependable.</li>
        <li>I combine both to build AI that holds up in production.</li>
      </ul>
    </div>
    <div className={styles.beat}>
      <div className={styles.bigWord}><span className={styles.script} data-word-in>Break</span></div>
      <ul className={styles.details} data-details>
        <li>Fail loudly, never silently</li>
        <li>Security-minded by training</li>
        <li>Tested before it ships</li>
        <li>Edge cases hunted early</li>
      </ul>
    </div>
    <div className={styles.beat}>
      <div className={styles.bigWord}><span className={styles.script} data-word-in>Trust</span></div>
      <ul className={styles.details} data-details>
        <li>Redis cache: 4s to 5ms</li>
        <li>CI/CD on AWS EC2</li>
        <li>CloudWatch alarms</li>
        <li>AES-256 encrypted storage</li>
      </ul>
    </div>

    <div className={styles.card} data-fall-card>
      <img className={BAKED_TINT ? styles.media : `${styles.media} ${styles.tint}`} src={BAKED_TINT ? '/about/falling-blue.webp' : '/about/falling.gif'} alt="" />
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
