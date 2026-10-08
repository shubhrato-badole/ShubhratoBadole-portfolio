'use client';

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { OrbRenderer } from './orb/OrbRenderer';
import { OrbController } from './orb/OrbController';
import { HERO_THEME, ORB_TUNING, buildOrbStates, type HeroTheme, type OrbPhase } from './theme';
import styles from './assistant.module.css';

export type OrbHandle = {
  setPhase: (p: OrbPhase) => void;
  /** speech-shaped loudness on/off (use while text is being "spoken") */
  setSpeaking: (on: boolean) => void;
  /** one impulse, e.g. per word. 0..1 */
  pulse: (amount?: number) => void;
  /** real audio levels, if you ever have them (e.g. a TTS AnalyserNode). null = built-in envelope */
  setLevels: (agent: number | null, mic?: number | null) => void;
  /** open/close the microphone level meter */
  setMic: (on: boolean) => void;
  /** a quick shake of energy (Stop button, errors) */
  kick: (amount?: number) => void;
};

type Props = { active: boolean; theme?: HeroTheme };

/* quality ladder: [render-scale multiplier, raymarch-step multiplier] */
const TIERS: [number, number][] = [
  [1, 1],
  [0.82, 0.75],
  [0.66, 0.6],
  [0.52, 0.45],
];

function startTier() {
  if (typeof window === 'undefined') return 0;
  let t = 0;
  const small = window.innerWidth < 760;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  if (small || coarse) t = 1;
  const nav = navigator as Navigator & { deviceMemory?: number };
  if ((nav.deviceMemory && nav.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4)) t += 1;
  return Math.min(TIERS.length - 1, t);
}

const AssistantOrb = forwardRef<OrbHandle, Props>(function AssistantOrb({ active, theme = HERO_THEME }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<OrbController | null>(null);
  const phaseRef = useRef<OrbPhase>('idle');
  const loopRef = useRef<{ start: () => void; stop: () => void; once: () => void }>({
    start() {},
    stop() {},
    once() {},
  });
  const [unsupported, setUnsupported] = useState(false);
  const states = useMemo(() => buildOrbStates(theme), [theme]);
  const statesRef = useRef(states);

  useImperativeHandle(ref, () => ({
    setPhase(p) {
      phaseRef.current = p;
      controllerRef.current?.setPhase(p);
      loopRef.current.once();
    },
    setSpeaking: (on) => controllerRef.current?.setSpeaking(on),
    pulse: (a = 0.7) => controllerRef.current?.pulse(a),
    setLevels: (agent, mic = null) => controllerRef.current?.setLevels(agent, mic),
    setMic: (on) => controllerRef.current?.setMic(on),
    kick: (a = 1) => controllerRef.current?.kick(a),
  }));

  /* theme changed (e.g. live-editing HERO_THEME): ease to the new palette */
  useEffect(() => {
    statesRef.current = states;
    controllerRef.current?.setStates(states, phaseRef.current);
  }, [states]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const D = ORB_TUNING.detail;
    const renderer = new OrbRenderer(canvas, D.octaves, ORB_TUNING.bloom);
    if (!renderer.ok) {
      setUnsupported(true);
      return;
    }
    const controller = new OrbController(statesRef.current, phaseRef.current);
    controllerRef.current = controller;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let tier = startTier();
    const apply = () => {
      const [sc, st] = TIERS[tier];
      renderer.setSteps(D.steps * st);
      const pr = Math.min(window.devicePixelRatio || 1, D.maxPixelRatio);
      renderer.resize(canvas.clientWidth, canvas.clientHeight, pr, D.renderScale * sc);
    };
    const draw = (dt: number) => {
      renderer.render(reduce ? controller.stillPose() : controller.update(dt));
    };
    apply();
    draw(0);

    /* pointer: window-relative -1..1, handed to the controller which low-pass filters it */
    const onPointer = (e: PointerEvent) =>
      controller.setPointerTarget((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    window.addEventListener('pointermove', onPointer, { passive: true });

    const ro = new ResizeObserver(() => {
      apply();
      draw(0);
    });
    ro.observe(canvas);

    /* render loop with automatic quality step-down */
    let raf = 0;
    let last = 0;
    let wanted = false;
    let warm = 0;
    let acc = 0;
    let n = 0;
    const frame = (now: number) => {
      const raw = last ? (now - last) / 1000 : 1 / 60;
      last = now;
      const dt = Math.min(0.1, raw);
      draw(dt);
      if (ORB_TUNING.adaptiveQuality && !reduce) {
        if (warm < 40) warm++; // ignore the open animation's hitches
        else {
          acc += raw;
          n++;
          if (n >= 45) {
            if (acc / n > 0.024 && tier < TIERS.length - 1) {
              tier++;
              apply();
            }
            acc = 0;
            n = 0;
          }
        }
      }
      raf = requestAnimationFrame(frame);
    };
    const begin = () => {
      if (raf || reduce) return;
      last = 0;
      warm = 0;
      acc = 0;
      n = 0;
      raf = requestAnimationFrame(frame);
    };
    const halt = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    loopRef.current = {
      start: () => {
        wanted = true;
        if (!document.hidden) begin();
      },
      stop: () => {
        wanted = false;
        halt();
      },
      once: () => {
        if (reduce && wanted) draw(0);
      },
    };
    const onVis = () => (document.hidden ? halt() : wanted && begin());
    document.addEventListener('visibilitychange', onVis);

    const onLost = (e: Event) => {
      e.preventDefault();
      halt();
    };
    canvas.addEventListener('webglcontextlost', onLost);

    return () => {
      halt();
      loopRef.current = { start() {}, stop() {}, once() {} };
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pointermove', onPointer);
      canvas.removeEventListener('webglcontextlost', onLost);
      ro.disconnect();
      controller.dispose();
      controllerRef.current = null;
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    if (active) loopRef.current.start();
    else loopRef.current.stop();
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      className={`${styles.orbCanvas} ${unsupported ? styles.orbFallback : ''}`}
      aria-hidden="true"
    />
  );
});

export default AssistantOrb;
