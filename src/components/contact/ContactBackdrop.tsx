'use client';

import { useEffect, useRef, type CSSProperties, type MutableRefObject } from 'react';
import styles from './contactNative.module.css';

/* THE PICTURE SCENE. Two pictures that move like a camera (the lake, then the garden with the tree and chairs), plus the living parts.

   WHAT MOVES, AND WHAT IT COSTS
   · The camera flight (lake zooms away, garden arrives from the right and settles with a small roll) and the idle drift afterwards are
     CSS transforms driven by a few custom properties (--cam / --rush / --land). The compositor does it: no JavaScript per frame.
   · The sway: the garden picture is stacked three times. One copy is still, one (masked to the canopy) rocks gently, one (masked to the
     grass) leans left and right. Each copy only moves by transform, so the cost is three small textures and nothing else.
   · The living dots (fireflies, petals, sparkles) are ~25 soft shapes in a small 2-D canvas at ~30 fps, only while the section is visible.
   · The garden belongs to the PAGE: once Contact is open it is sticky inside the section, so it scrolls with it (Work can never cover it).
   · prefers-reduced-motion: no camera tween, no sway, one still frame of dots. Nothing to load, boot or fail: no WebGL, workers, sound. */

type Props = {
  /** camera progress 0 (the lake) .. 1 (the garden); written by ContactNative while the camera "moves" */
  ppRef: MutableRefObject<number>;
  /** true while somebody can see the section */
  active: boolean;
  mobile: boolean;
  lake: string;
  garden: string;
  /** false = both pictures are hidden (nothing of Contact may show through any other page's window, e.g. the Stack's) */
  visible: boolean;
};

const sm = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function rng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default function ContactBackdrop({ ppRef, active, mobile, lake, garden, visible }: Props) {
  const lakeCvRef = useRef<HTMLCanvasElement>(null);
  const gardenCvRef = useRef<HTMLCanvasElement>(null);
  const lakeParRef = useRef<HTMLDivElement>(null);
  const gardenParRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const lcv = lakeCvRef.current;
    const gcv = gardenCvRef.current;
    const lctx = lcv?.getContext('2d');
    const gctx = gcv?.getContext('2d');
    if (!lcv || !gcv || !lctx || !gctx) return;
    const clearAll = () => {
      lctx.clearRect(0, 0, lcv.width, lcv.height);
      gctx.clearRect(0, 0, gcv.width, gcv.height);
    };
    if (!active) {
      clearAll();
      return;
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fine = window.matchMedia('(pointer: fine)').matches && !mobile;

    let dpr = 1, LW = 0, LH = 0, GW = 0, GH = 0;
    const size = () => {
      dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.5);
      LW = window.innerWidth;
      LH = window.innerHeight;
      lcv.width = Math.round(LW * dpr);
      lcv.height = Math.round(LH * dpr);
      GW = gcv.clientWidth || LW;
      GH = gcv.clientHeight || LH;
      gcv.width = Math.round(GW * dpr);
      gcv.height = Math.round(GH * dpr);
    };
    size();

    /* one soft warm glow, drawn once, stamped many times */
    const spr = document.createElement('canvas');
    spr.width = spr.height = 64;
    const sg = spr.getContext('2d');
    if (sg) {
      const gr = sg.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,236,190,0.9)');
      gr.addColorStop(0.25, 'rgba(255,214,150,0.38)');
      gr.addColorStop(1, 'rgba(255,200,120,0)');
      sg.fillStyle = gr;
      sg.fillRect(0, 0, 64, 64);
    }

    /* few and faint: the picture already has its own lights */
    const R = rng(2026);
    const NFL = mobile ? 4 : 7; // lake
    const NFG = mobile ? 5 : 9; // garden
    const NP = mobile ? 8 : 15; // petals
    const NS = mobile ? 8 : 14; // sparkles
    const mkFly = () => ({ u: R(), v: 0.3 + R() * 0.6, ph: R() * 6.28, sp: 0.1 + R() * 0.25, fl: 0.7 + R() * 1.3, r: 4 + R() * 6 });
    const fliesL = Array.from({ length: NFL }, mkFly);
    const fliesG = Array.from({ length: NFG }, mkFly);
    /* petals share the canopy's colours (lilac / pink / near white), not blue */
    const PETAL = ['rgb(208,170,255)', 'rgb(232,190,255)', 'rgb(190,160,250)', 'rgb(246,222,255)'];
    const petals = Array.from({ length: NP }, () => ({ u: R(), v: R(), sp: 0.03 + R() * 0.045, ph: R() * 6.28, sw: 0.02 + R() * 0.04, len: 3 + R() * 3, c: PETAL[Math.floor(R() * PETAL.length)] }));
    const sparks = Array.from({ length: NS }, () => ({ u: 0.05 + R() * 0.9, v: 0.04 + R() * 0.45, ph: R() * 6.28, sp: 1.2 + R() * 2.2, r: 2 + R() * 3.2 }));

    /* the pictures lean a little toward the pointer (desktop only) */
    let tx = 0, ty = 0, px = 0, py = 0;
    const onMove = (e: PointerEvent) => {
      tx = (e.clientX / Math.max(1, LW)) * 2 - 1;
      ty = (e.clientY / Math.max(1, LH)) * 2 - 1;
    };
    if (fine && !reduce) window.addEventListener('pointermove', onMove, { passive: true });

    const flies = (ctx: CanvasRenderingContext2D, list: typeof fliesL, w: number, h: number, t: number, alpha: number) => {
      if (alpha < 0.01) return;
      const sc = Math.max(0.7, Math.min(1.4, window.innerHeight / 900));
      ctx.globalCompositeOperation = 'lighter';
      for (const f of list) {
        const x = (f.u + Math.sin(t * f.sp + f.ph) * 0.035) * w;
        const y = (f.v + Math.cos(t * f.sp * 0.8 + f.ph * 1.3) * 0.03) * h;
        const a = 0.15 + 0.85 * (0.5 + 0.5 * Math.sin(t * f.fl + f.ph * 3));
        const s = f.r * sc * 2;
        ctx.globalAlpha = a * 0.55 * alpha;
        ctx.drawImage(spr, x - s / 2, y - s / 2, s, s);
      }
    };

    let raf = 0, last = 0;
    const t0 = performance.now();
    const draw = (now: number) => {
      const t = reduce ? 3 : (now - t0) / 1000;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0.033;
      last = now;
      const e = ppRef.current;
      const sc = Math.max(0.7, Math.min(1.4, window.innerHeight / 900));

      /* the lake (fixed, behind Work): a few fireflies that fade as the camera leaves */
      lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lctx.clearRect(0, 0, LW, LH);
      flies(lctx, fliesL, LW, LH, t, 1 - sm(0.05, 0.5, e));
      lctx.globalAlpha = 1;
      lctx.globalCompositeOperation = 'source-over';

      /* the garden (belongs to the page): fireflies, sparkles on the canopy, petals */
      gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      gctx.clearRect(0, 0, GW, GH);
      const g = sm(0.3, 0.85, e);
      if (g > 0.01) {
        flies(gctx, fliesG, GW, GH, t, g);
        gctx.globalCompositeOperation = 'lighter';
        gctx.fillStyle = 'rgb(255,238,255)';
        for (const k of sparks) {
          const tw = Math.pow(0.5 + 0.5 * Math.sin(t * k.sp + k.ph), 4);
          if (tw < 0.05) continue;
          const x = k.u * GW, y = k.v * GH, r = k.r * sc * (0.6 + tw);
          gctx.globalAlpha = tw * g * 0.8;
          gctx.fillRect(x - r, y - 0.6, r * 2, 1.2);
          gctx.fillRect(x - 0.6, y - r, 1.2, r * 2);
        }
        gctx.globalCompositeOperation = 'source-over';
        for (const p of petals) {
          if (!reduce) {
            p.v += p.sp * dt;
            if (p.v > 1.04) {
              p.v = -0.04;
              p.u = R();
            }
          }
          const x = (p.u + Math.sin(t * 0.7 + p.ph) * p.sw) * GW;
          const y = p.v * GH;
          gctx.globalAlpha = g * 0.8;
          gctx.fillStyle = p.c;
          gctx.save();
          gctx.translate(x, y);
          gctx.rotate(t * 1.1 + p.ph);
          gctx.beginPath();
          gctx.ellipse(0, 0, p.len * sc * 0.42, p.len * sc, 0, 0, 6.2832);
          gctx.fill();
          gctx.restore();
        }
      }
      gctx.globalAlpha = 1;
      gctx.globalCompositeOperation = 'source-over';

      if (fine && !reduce) {
        px += (tx - px) * 0.06;
        py += (ty - py) * 0.06;
        if (lakeParRef.current) lakeParRef.current.style.transform = `translate3d(${(px * -12).toFixed(1)}px, ${(py * -7).toFixed(1)}px, 0)`;
        if (gardenParRef.current) gardenParRef.current.style.transform = `translate3d(${(px * -11).toFixed(1)}px, ${(py * -7).toFixed(1)}px, 0)`;
      }
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < 31) return; // ~30 fps is plenty for a few soft shapes
      draw(now);
    };
    const run = () => {
      if (raf || reduce || document.hidden) return;
      raf = requestAnimationFrame(frame);
    };
    const halt = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    const onVis = () => (document.hidden ? halt() : run());
    const onResize = () => size();

    draw(performance.now());
    run();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('resize', onResize);
    return () => {
      halt();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onMove);
      clearAll();
    };
  }, [active, mobile, ppRef]);

  const pic = (u: string) => ({ ['--pic' as string]: `url('${u}')` }) as CSSProperties;
  return (
    <>
      {/* the lake: fixed behind Work (the window that opens under it); it zooms away while the camera moves on */}
      <div className={`${styles.lakeLayer} ${visible ? '' : styles.layerOff}`} style={pic(lake)} data-cxv aria-hidden>
        <div ref={lakeParRef} className={styles.par}>
          <div className={styles.lakeImg} />
          <div className={styles.glint} />
        </div>
        <canvas ref={lakeCvRef} className={styles.life} />
      </div>
      {/* the garden: fixed while the camera arrives, then sticky inside the section so it scrolls WITH the page.
          Desktop: the left half. Phone: the top part (the form sheet rises over the rest). */}
      <div className={`${styles.scene} ${visible ? '' : styles.layerOff}`} style={pic(garden)} data-cxv aria-hidden>
        <div ref={gardenParRef} className={styles.par}>
          <div className={styles.breathe}>
            <div className={styles.cam}>
              <div className={styles.gardenImg} />
              <div className={`${styles.gardenImg} ${styles.swayCanopy}`} />
              <div className={`${styles.gardenImg} ${styles.swayGrass}`} />
              <div className={styles.canopyGlow} />
            </div>
          </div>
        </div>
        <canvas ref={gardenCvRef} className={styles.life} />
      </div>
    </>
  );
}
