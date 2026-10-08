'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ExpoScaleEase } from 'gsap/EasePack';
import styles from './intro.module.css';

gsap.registerPlugin(ExpoScaleEase);

/* ------------------------------------------------------------------------------------------
   THE OPENING RING
   This is the contact scene's own transition (public/contact-scene), not an imitation:
   same shader maths (noise-wobbled circle, white ring glow, red / blue colour split),
   same settings, same 3 second "expoScale(8,2,power1.inOut)" ease.
   Two differences, both on purpose:
   - the scene's page colour around the ring was white; here it is your dark ink,
   - the scene bends the pixels of a 3D picture; your hero is a normal web page, so the ring
     is drawn over the live hero instead.
   It is one full-screen graphics-card pass on a canvas, so it stays smooth.
   ------------------------------------------------------------------------------------------ */
const RING = {
  RING_WIDTH: 2,
  RING_SHARPNESS: 10,
  RING_GLOW: 1.8,
  CA_RING_STRENGTH: 0.15,
  CA_RADIAL_STRENGTH: 0.03,
  EDGE_SOFTNESS: 0.05,
  NOISE_STRENGTH: 0.2,
  DURATION: 3,
  EASE: 'expoScale(8,2,power1.inOut)',
  NOISE_URL: '/contact-scene/noise.jpg',
};

const RING_VERT = `attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const RING_FRAG = `precision highp float;
uniform sampler2D uNoise;
uniform float uNoiseStrength;
uniform float uTransition;
uniform vec2 uResolution;
uniform vec2 uCenter;
uniform vec3 uCover;
uniform float uRingWidth;
uniform float uRingSharpness;
uniform float uRingGlow;
uniform float uCARingStrength;
uniform float uCARadialStrength;
uniform float uEdgeSoftness;
varying vec2 vUv;

float ringAt(float circle, float t) {
  float ringEnvelope = pow(1.0 - t, 0.6);
  float primaryRing = pow(clamp(1.0 - abs(circle * uRingWidth), 0.0, 1.0), uRingSharpness);
  float secondaryRing = pow(clamp(1.0 - abs((circle - 0.06) * uRingWidth * 0.5), 0.0, 1.0), uRingSharpness * 0.5) * 0.3;
  return ringEnvelope * (primaryRing + secondaryRing);
}

float glowOf(float ringFactor) {
  /* the scene mixes the picture towards white by glow*0.5, then brightens it by 1 + glow*0.8 */
  float g = ringFactor * uRingGlow;
  return clamp(g * 0.5 + g * g * 0.4, 0.0, 1.0);
}

void main() {
  float t = 1.0 - uTransition;
  if (t < 0.001) { gl_FragColor = vec4(uCover, 1.0); return; }
  if (t > 0.999) { gl_FragColor = vec4(0.0); return; }

  float aspect = uResolution.x / uResolution.y;
  vec2 coord = (vUv - uCenter) * vec2(aspect, 1.0);
  float distToCenter = length(coord);

  vec2 noiseUv = (vUv - 0.5) * 0.8 + 0.5;
  float noiseVal = texture2D(uNoise, noiseUv).r - 0.5;
  float noiseMask = smoothstep(0.0, 0.4, t) * smoothstep(1.0, 0.6, t);
  float distortion = noiseVal * uNoiseStrength * noiseMask;

  vec2 farCorner = max(uCenter, 1.0 - uCenter) * vec2(aspect, 1.0);
  float maxRadius = length(farCorner) * 1.3;
  float radius = maxRadius * t;
  float circle = radius - distToCenter + distortion;

  float ringFactor = ringAt(circle, t);
  float totalCA = ringFactor * uCARingStrength + (1.0 - t) * distToCenter * uCARadialStrength;
  float edgeFade = smoothstep(0.0, 0.08, t);

  /* the ring glow is white (as in the scene); the red / blue colour split shows only as a faint
     tint on its two edges: each colour sees the circle a tiny bit shifted */
  float k = 0.05;
  float cR = circle - totalCA * k;
  float cG = circle - totalCA * k * 0.25;
  float cB = circle + totalCA * k;
  vec3 glow = vec3(
    glowOf(ringAt(cR, t)) * smoothstep(-uEdgeSoftness, uEdgeSoftness, cR),
    glowOf(ringAt(cG, t)) * smoothstep(-uEdgeSoftness, uEdgeSoftness, cG),
    glowOf(ringAt(cB, t)) * smoothstep(-uEdgeSoftness, uEdgeSoftness, cB)
  ) * edgeFade;
  float maxGlow = max(glow.r, max(glow.g, glow.b));

  float reveal = smoothstep(-uEdgeSoftness, uEdgeSoftness, circle) * edgeFade;
  float cover = 1.0 - reveal;

  /* premultiplied: dark cover where the ring has not reached yet, white glow on the ring, clear inside */
  gl_FragColor = vec4(uCover * cover * (1.0 - maxGlow) + glow, clamp(cover * (1.0 - maxGlow) + maxGlow, 0.0, 1.0));
}`;

type Ring = {
  draw: (transition: number) => void;
  open: () => Promise<void>;
  destroy: () => void;
};

/** Creates the ring canvas on <body>. Returns null if WebGL is not available. */
function createRing(cover: [number, number, number], noise: HTMLImageElement | null): Ring | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.className = styles.ring;
    canvas.setAttribute('aria-hidden', 'true');
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    if (!gl) return null;

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, RING_VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, RING_FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    let noiseOk = false;
    if (noise && noise.complete && noise.naturalWidth > 0) {
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, noise);
        noiseOk = true;
      } catch {
        noiseOk = false;
      }
    }
    if (!noiseOk) {
      // noise image missing or unusable: flat grey = a clean circle edge (the ring still works)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 255]));
    }

    const U = (n: string) => gl.getUniformLocation(prog, n);
    gl.uniform1i(U('uNoise'), 0);
    gl.uniform1f(U('uNoiseStrength'), RING.NOISE_STRENGTH);
    gl.uniform2f(U('uResolution'), canvas.width, canvas.height);
    gl.uniform2f(U('uCenter'), 0.5, 0.5);
    gl.uniform3f(U('uCover'), cover[0], cover[1], cover[2]);
    gl.uniform1f(U('uRingWidth'), RING.RING_WIDTH);
    gl.uniform1f(U('uRingSharpness'), RING.RING_SHARPNESS);
    gl.uniform1f(U('uRingGlow'), RING.RING_GLOW);
    gl.uniform1f(U('uCARingStrength'), RING.CA_RING_STRENGTH);
    gl.uniform1f(U('uCARadialStrength'), RING.CA_RADIAL_STRENGTH);
    gl.uniform1f(U('uEdgeSoftness'), RING.EDGE_SOFTNESS);
    const uTransition = U('uTransition');

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.BLEND);
    const draw = (transition: number) => {
      gl.uniform1f(uTransition, transition);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    document.body.appendChild(canvas);
    draw(1); // fully closed: plain dark cover

    let tween: gsap.core.Tween | null = null;
    return {
      draw,
      open: () =>
        new Promise<void>((res) => {
          const state = { v: 1 };
          tween = gsap.to(state, {
            v: 0,
            duration: RING.DURATION,
            ease: RING.EASE,
            onUpdate: () => draw(state.v),
            onComplete: () => res(),
          });
        }),
      destroy: () => {
        tween?.kill();
        canvas.remove();
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      },
    };
  } catch {
    return null;
  }
}

type IntroProps = {
  /** Called once, right as the opening ring starts revealing the hero underneath. */
  onComplete: (name: string) => void;
};

type RunState = {
  run: number;
  skip: boolean;
  name: string;
  anims: Animation[];
};

const STALE = Symbol('stale');

/** your page colour (--ink #04010f) as 0-1 values: the cover around the ring */
const INK: [number, number, number] = [4 / 255, 1 / 255, 15 / 255];

const LINES: [string, string, string][] = [
  ['checking linkedin... last updated 3 years ago. ', 'bold strategy.', ''],
  ["googled \"center a div\" this week... ", "we don't judge.", ''],
  ['coffee intake: 4 cups before 9am. ', 'this is fine.', ' this is fine.'],
  ['side projects found: 14. shipped: 0. ', 'respectable.', ''],
];
const CHECK = 'M5.5 12.8 C7 14 8.6 15.8 9.8 17.2 C12 12.5 15.2 8.2 19 5.8';

export default function Intro({ onComplete }: IntroProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel);
    const $$ = <T extends HTMLElement = HTMLElement>(sel: string) => Array.from(root.querySelectorAll<T>(sel));

    // the ring's noise picture is loaded now, so it is ready when the ring opens
    const noiseImg = new Image();
    noiseImg.decoding = 'async';
    noiseImg.src = RING.NOISE_URL;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    const S: RunState = { run: 0, skip: false, name: '', anims: [] };

    const s1 = $('#intro-s1')!;
    const s2 = $('#intro-s2')!;
    const input = $<HTMLInputElement>('#intro-name')!;
    const who = $('#intro-who')!;
    const hint = $('#intro-hint')!;
    const tip = $('#intro-tip')!;
    const sheet = $('#intro-sheet')!;
    const sig = $('#intro-sig')!;
    const pen = $('#intro-pen')!;
    const rowsEl = $('#intro-rows')!;
    const vtext = $('#intro-vtext')!;
    const stamp = $('#intro-stamp')!;
    const rf = root.querySelector<SVGCircleElement>('#intro-rf')!;
    const pctNum = $('#intro-pctnum')!;
    const dateEl = $('#intro-date')!;
    const glow = $('#intro-glow')!;

    /* ---------- pacing helpers ---------- */
    function pace() {
      return S.skip ? 0.02 : reduce ? 0.35 : 1;
    }
    function sleep(ms: number, id: number) {
      return new Promise<void>((res, rej) => {
        setTimeout(() => (id === S.run ? res() : rej(STALE)), ms * pace());
      });
    }
    function chk(id: number) {
      if (id !== S.run) throw STALE;
    }
    function play(el: Element, frames: Keyframe[], opts: KeyframeAnimationOptions = {}) {
      const o: KeyframeAnimationOptions = {
        fill: 'both',
        easing: opts.easing || 'cubic-bezier(.2,.7,.2,1)',
        duration: Math.max(1, (Number(opts.duration) || 300) * pace()),
        delay: (Number(opts.delay) || 0) * pace(),
      };
      const a = el.animate(frames, o);
      S.anims.push(a);
      return a.finished.catch(() => {});
    }
    const eOut = (p: number) => 1 - Math.pow(1 - p, 3);
    function tween(a: number, b: number, ms: number, fn: (v: number) => void, ease: (p: number) => number = eOut) {
      const id = S.run;
      ms = ms * pace();
      return new Promise<void>((res) => {
        if (ms <= 30) {
          fn(b);
          return res();
        }
        const t0 = performance.now();
        (function f(now: number) {
          if (id !== S.run) return res();
          if (S.skip) {
            fn(b);
            return res();
          }
          const p = Math.min(1, (now - t0) / ms);
          fn(a + (b - a) * ease(p));
          if (p < 1) requestAnimationFrame(f);
          else res();
        })(t0);
      });
    }
    function clean(v: string) {
      return v.replace(/\s+/g, ' ').trim().slice(0, 24);
    }
    function titleCase(s: string) {
      return s.toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase());
    }

    /* ---------- cursor glow (page 1): a single compositor-friendly circle,
       not a per-frame canvas redraw, so it stays smooth. ---------- */
    let glowOn = false,
      glowRaf = 0,
      gx = 0,
      gy = 0,
      tgx = 0,
      tgy = 0,
      glowFrameT = 0,
      tipShown = false;

    function glowMove(e: PointerEvent) {
      tgx = e.clientX;
      tgy = e.clientY;
      if (glowOn) tipHide();
    }
    function glowDown(e: PointerEvent) {
      if (!glowOn) return;
      const r = document.createElement('i');
      r.className = styles.ripple;
      r.style.left = e.clientX + 'px';
      r.style.top = e.clientY + 'px';
      document.body.appendChild(r);
      const an = r.animate(
        [
          { transform: 'scale(1)', opacity: 0.85 },
          { transform: 'scale(13)', opacity: 0 },
        ],
        { duration: reduce ? 1 : 850, easing: 'cubic-bezier(.16,1,.3,1)' }
      );
      an.finished.then(() => r.remove()).catch(() => r.remove());
      tipHide();
    }
    window.addEventListener('pointermove', glowMove, { passive: true });
    window.addEventListener('pointerdown', glowDown, { passive: true });

    function glowLoop(now: number) {
      if (!glowOn) return;
      const dt = glowFrameT ? Math.min(48, now - glowFrameT) : 16;
      glowFrameT = now;
      const k = 1 - Math.pow(0.001, dt / 1000);
      gx += (tgx - gx) * k;
      gy += (tgy - gy) * k;
      glow.style.transform = `translate3d(${gx}px,${gy}px,0)`;
      glowRaf = requestAnimationFrame(glowLoop);
    }
    function inkStart() {
      if (reduce) return;
      tgx = gx = window.innerWidth / 2;
      tgy = gy = window.innerHeight * 0.4;
      glowFrameT = 0;
      glow.style.transform = `translate3d(${gx}px,${gy}px,0)`;
      glow.style.opacity = '1';
      glowOn = true;
      cancelAnimationFrame(glowRaf);
      glowRaf = requestAnimationFrame(glowLoop);
    }
    function inkStop() {
      glowOn = false;
      glow.style.opacity = '0';
      setTimeout(() => {
        if (!glowOn) cancelAnimationFrame(glowRaf);
      }, 800);
    }
    function tipShow() {
      tip.textContent = fine ? 'move your cursor to leave a mark' : 'drag a finger to leave a mark';
      tipShown = true;
      play(tip, [{ opacity: 0 }, { opacity: 1 }], { duration: 600 });
    }
    function tipHide() {
      if (tipShown) {
        tipShown = false;
        play(tip, [{ opacity: 1 }, { opacity: 0 }], { duration: 400 });
      }
    }

    /* ---------- page 1 ---------- */
    function resetUI() {
      S.anims.forEach((a) => {
        try {
          a.cancel();
        } catch {}
      });
      S.anims = [];
      document.querySelectorAll(`.${styles.dot}`).forEach((d) => d.remove());
      s1.hidden = false;
      s2.hidden = true;
      who.classList.remove(styles.has);
      hint.textContent = '';
      input.value = '';
      rowsEl.innerHTML = '';
      sig.textContent = '';
      sig.style.clipPath = '';
      pen.style.opacity = '0';
      vtext.textContent = '';
      setRing(0, true);
      tipShown = false;
    }

    async function intro() {
      const id = ++S.run;
      S.skip = false;
      resetUI();
      inkStart();
      let stored = '';
      try {
        stored = window.localStorage.getItem('visitorName') || '';
      } catch {}
      try {
        await sleep(250, id);
        await Promise.all(
          $$('.' + styles.mk + ' > span').map((el, i) =>
            play(el, [{ transform: 'translateY(112%)' }, { transform: 'translateY(0)' }], {
              duration: 1000,
              delay: i * 140,
              easing: 'cubic-bezier(.16,1,.3,1)',
            })
          )
        );
        chk(id);
        await Promise.all([
          play(who, [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'translateY(0)' }], {
            duration: 700,
          }),
          play($('.' + styles.uline + ' path')!, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
            duration: 1100,
            easing: 'ease-out',
          }),
        ]);
        chk(id);
        if (stored) {
          input.value = stored;
          who.classList.add(styles.has);
          hint.textContent = 'welcome back. press enter to continue';
        }
        input.focus({ preventScroll: true });
        if (stored) input.select();
        await sleep(700, id);
        if (!S.skip && !reduce) tipShow();
      } catch (e) {
        if (e !== STALE) throw e;
      }
    }

    function onInput() {
      const v = clean(input.value);
      who.classList.toggle(styles.has, !!v);
      hint.textContent = v ? 'press enter' : '';
    }
    function onSubmit(e: Event) {
      e.preventDefault();
      const v = clean(input.value);
      if (!v) {
        hint.textContent = 'we need a name for the form';
        if (!reduce)
          play(
            input,
            [
              { transform: 'translateX(0)' },
              { transform: 'translateX(-10px)' },
              { transform: 'translateX(10px)' },
              { transform: 'translateX(-6px)' },
              { transform: 'translateX(0)' },
            ],
            { duration: 320, easing: 'ease-out' }
          );
        return;
      }
      S.name = v;
      try {
        window.localStorage.setItem('visitorName', v);
      } catch {}
      startForm();
    }
    input.addEventListener('input', onInput);
    who.addEventListener('submit', onSubmit);

    /* ---------- page 2: the clearance form ---------- */
    function buildRows() {
      rowsEl.innerHTML = '';
      const NS = 'http://www.w3.org/2000/svg';
      LINES.forEach((parts) => {
        const li = document.createElement('li');
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('class', styles.cb);
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        const r = document.createElementNS(NS, 'rect');
        [
          ['x', '3'],
          ['y', '3'],
          ['width', '18'],
          ['height', '18'],
          ['rx', '3'],
          ['pathLength', '1'],
        ].forEach(([k, v]) => r.setAttribute(k, v));
        const pth = document.createElementNS(NS, 'path');
        pth.setAttribute('d', CHECK);
        pth.setAttribute('pathLength', '1');
        svg.appendChild(r);
        svg.appendChild(pth);
        const tx = document.createElement('span');
        tx.className = styles.rt;
        tx.appendChild(document.createTextNode(parts[0]));
        const mk = document.createElement('span');
        mk.className = styles.mark;
        mk.textContent = parts[1];
        tx.appendChild(mk);
        if (parts[2]) tx.appendChild(document.createTextNode(parts[2]));
        li.appendChild(svg);
        li.appendChild(tx);
        rowsEl.appendChild(li);
      });
    }
    function fitSig() {
      sig.style.fontSize = '100px';
      sig.textContent = S.name;
      const avail = sig.parentElement?.clientWidth || 300;
      const w = sig.offsetWidth || 1;
      sig.style.fontSize = Math.max(30, Math.min(84, (100 * avail) / w * 0.96)) + 'px';
    }
    function setRing(p: number, instant?: boolean) {
      if (instant) rf.style.transition = 'none';
      rf.style.strokeDashoffset = String(100 - p);
      if (instant) {
        void rf.getBoundingClientRect();
        rf.style.transition = '';
      }
      const from = parseInt(pctNum.textContent || '0', 10) || 0;
      tween(from, p, instant ? 0 : 620, (v) => {
        pctNum.textContent = String(Math.round(v));
      });
    }
    function writeSig(id: number) {
      return new Promise<void>((res) => {
        const D = 1450 * pace();
        const t0 = performance.now();
        const w = sig.offsetWidth;
        pen.style.opacity = '1';
        (function f(now: number) {
          if (id !== S.run) return res();
          const p = D <= 30 || S.skip ? 1 : Math.min(1, (now - t0) / D);
          const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          sig.style.clipPath = `inset(0 ${(1 - e) * 100}% 0 0)`;
          pen.style.left = e * w + 'px';
          pen.style.top = 52 + Math.sin(e * 20) * 10 + '%';
          if (p < 1) requestAnimationFrame(f);
          else {
            pen.style.opacity = '0';
            res();
          }
        })(t0);
      });
    }
    async function doRow(li: HTMLElement, id: number) {
      const box = li.querySelector<HTMLElement>('rect')!;
      const ck = li.querySelector<HTMLElement>('path')!;
      const rt = li.querySelector<HTMLElement>('.' + styles.rt)!;
      await play(box, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 160, easing: 'ease-out' });
      chk(id);
      await sleep(140, id);
      await play(rt, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }], {
        duration: 560,
        easing: 'cubic-bezier(.2,.8,.2,1)',
      });
      chk(id);
      await sleep(180, id);
      await play(ck, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
        duration: 220,
        easing: 'cubic-bezier(.5,0,.3,1)',
      });
      chk(id);
    }
    function splat(cx: number, cy: number) {
      for (let i = 0; i < 14; i++) {
        const d = document.createElement('i');
        const s = 4 + Math.random() * 7;
        const a = Math.random() * 6.2832;
        const dist = 50 + Math.random() * 130;
        d.className = styles.dot;
        d.style.width = d.style.height = s + 'px';
        d.style.left = cx - s / 2 + 'px';
        d.style.top = cy - s / 2 + 'px';
        document.body.appendChild(d);
        const an = d.animate(
          [
            { transform: 'translate(0,0) scale(1)', opacity: 1 },
            { transform: `translate(${Math.cos(a) * dist}px,${Math.sin(a) * dist}px) scale(.2)`, opacity: 0 },
          ],
          { duration: 520 + Math.random() * 380, easing: 'cubic-bezier(.1,.7,.3,1)', fill: 'forwards' }
        );
        an.finished.then(() => d.remove()).catch(() => d.remove());
      }
    }
    async function slam(id: number) {
      const r = stamp.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (!reduce && !S.skip) {
        setTimeout(() => {
          if (id !== S.run) return;
          s2.animate(
            [
              { transform: 'translate(0,0)' },
              { transform: 'translate(-7px,5px)' },
              { transform: 'translate(6px,-5px)' },
              { transform: 'translate(-4px,3px)' },
              { transform: 'translate(2px,-1px)' },
              { transform: 'translate(0,0)' },
            ],
            { duration: 340, easing: 'ease-out' }
          );
          splat(cx, cy);
        }, 300);
      }
      await play(
        stamp,
        [
          { opacity: 0, transform: 'rotate(-20deg) scale(2.8)' },
          { opacity: 1, transform: 'rotate(-10deg) scale(.93)', offset: 0.62 },
          { opacity: 1, transform: 'rotate(-9deg) scale(1)' },
        ],
        { duration: 480, easing: 'cubic-bezier(.6,0,.3,1)' }
      );
      chk(id);
    }
    /* ---------- the opening: the contact scene's ring, on your dark page ----------
       1. the finished form fades out on the dark page (no white, no name),
       2. a dark cover canvas (same colour as the page, so nothing visibly changes) takes over,
       3. the hero is started NOW, while the screen is plain dark, and gets a moment to settle,
       4. the ring opens from the centre onto the live hero.
       The canvas lives on <body>, so it keeps going after this component is removed. */
    const wait = (ms: number) => new Promise<void>((res) => setTimeout(res, ms)); // not tied to this component
    const frames = (n: number) =>
      new Promise<void>((res) => {
        const f = () => (n-- > 0 ? requestAnimationFrame(f) : res());
        f();
      });
    async function ringOut(id: number) {
      const finishedName = titleCase(S.name);
      const handOver = () => {
        document.body.style.overflow = '';
        onCompleteRef.current(finishedName);
      };
      if (reduce) {
        handOver();
        return;
      }
      await Promise.all([
        play(s2, [{ opacity: 1 }, { opacity: 0 }], { duration: 500, easing: 'ease-out' }),
        play($('.' + styles.top)!, [{ opacity: 1 }, { opacity: 0 }], { duration: 500, easing: 'ease-out' }),
      ]);
      chk(id);
      const ring = createRing(INK, noiseImg);
      if (!ring) {
        handOver(); // no WebGL on this device: go straight to the hero
        return;
      }
      root!.style.visibility = 'hidden';
      handOver();
      await frames(2);
      await wait(450); // the hero's start-up work happens here, behind the plain dark cover
      await ring.open();
      ring.destroy();
    }
    async function startForm() {
      const id = ++S.run;
      S.skip = false;
      try {
        inkStop();
        tipHide();
        await Promise.all(
          $$('.' + styles.mk + ' > span')
            .map((el, i) =>
              play(el, [{ transform: 'translateY(0)' }, { transform: 'translateY(-112%)' }], {
                duration: 520,
                delay: i * 60,
                easing: 'cubic-bezier(.7,0,.84,0)',
              })
            )
            .concat([
              play(who, [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-14px)' }], {
                duration: 380,
              }),
            ])
        );
        chk(id);
        s1.hidden = true;
        s2.hidden = false;
        buildRows();
        fitSig();
        dateEl.textContent = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        await play(
          sheet,
          [
            { opacity: 0, transform: 'translateY(90px) rotate(3.5deg)' },
            { opacity: 1, transform: 'translateY(0) rotate(-1deg)' },
          ],
          { duration: 1050, easing: 'cubic-bezier(.16,1,.3,1)' }
        );
        chk(id);
        setRing(8);
        await writeSig(id);
        chk(id);
        setRing(20);
        await sleep(280, id);
        const liRows = Array.from(rowsEl.querySelectorAll<HTMLElement>('li'));
        for (let i = 0; i < liRows.length; i++) {
          await doRow(liRows[i], id);
          chk(id);
          setRing(20 + (i + 1) * 17);
          if (i < liRows.length - 1) await sleep(360, id);
        }
        vtext.textContent = 'vibe certified, ' + S.name.split(' ')[0].toLowerCase() + '. welcome to the good side.';
        setRing(100);
        await play(vtext, [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }], {
          duration: 650,
          easing: 'cubic-bezier(.3,.7,.3,1)',
        });
        chk(id);
        await slam(id);
        await sleep(950, id);
        await ringOut(id);
      } catch (e) {
        if (e !== STALE) throw e;
      }
    }

    /* ---------- start ---------- */
    document.body.style.overflow = 'hidden';
    let started = false;
    let disposed = false;
    let startTimer: ReturnType<typeof setTimeout> | undefined;
    function go() {
      if (!started && !disposed) {
        started = true;
        intro();
      }
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(go);
      startTimer = setTimeout(go, 1500);
    } else {
      go();
    }

    return () => {
      disposed = true;
      S.run += 1000; // any in-flight sequence now throws STALE and stops
      clearTimeout(startTimer);
      S.anims.forEach((a) => {
        try {
          a.cancel();
        } catch {}
      });
      window.removeEventListener('pointermove', glowMove);
      window.removeEventListener('pointerdown', glowDown);
      input.removeEventListener('input', onInput);
      who.removeEventListener('submit', onSubmit);
      cancelAnimationFrame(glowRaf);
      document.body.style.overflow = '';
      document.querySelectorAll(`.${styles.dot}, .${styles.ripple}`).forEach((d) => d.remove());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={rootRef} className={styles.introRoot}>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
        <defs>
          <filter id="rough" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves={2} seed={3} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale={3.5} />
          </filter>
          <filter id="specks" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={1} seed={4} />
            <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  9 0 0 0 -5.7" />
          </filter>
        </defs>
      </svg>

      <div className={styles.backdrop} aria-hidden="true" />
      <div id="intro-glow" className={styles.glow} aria-hidden="true" />

      <header className={styles.top}>
        <span className={styles.brand}>Shubhrato Corp.</span>
      </header>

      <main>
        {/* Page 1 */}
        <section id="intro-s1" className={`${styles.stage} ${styles.s1}`} aria-label="Introduction">
          <div className={styles.inner}>
            <h1 className={styles.q} aria-label="Who's there?">
              <span className={styles.mk} aria-hidden="true">
                <span>Who&rsquo;s</span>
              </span>{' '}
              <span className={styles.mk} aria-hidden="true">
                <span>
                  <em>there?</em>
                </span>
              </span>
            </h1>
            <form id="intro-who" className={styles.who} autoComplete="off" noValidate>
              <label className={styles.vh} htmlFor="intro-name">
                Your name
              </label>
              <div className={styles.inrow}>
                <input
                  id="intro-name"
                  className={styles.name}
                  type="text"
                  maxLength={24}
                  placeholder="your name"
                  autoCapitalize="words"
                  spellCheck={false}
                  enterKeyHint="go"
                />
                <button type="submit" className={styles.go} aria-label="Continue">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 12h15M13 6l6 6-6 6" />
                  </svg>
                </button>
              </div>
              <svg className={styles.uline} viewBox="0 0 900 14" preserveAspectRatio="none" aria-hidden="true">
                <path pathLength={1} d="M2 8 C90 3 170 12 280 7 S470 3 580 8 S780 11 898 6" />
              </svg>
              <p id="intro-hint" className={styles.hint} aria-live="polite" />
            </form>
          </div>
        </section>

        {/* Page 2 */}
        <section id="intro-s2" className={`${styles.stage} ${styles.s2}`} hidden aria-label="Visitor clearance form">
          <div className={styles.inner}>
            <article id="intro-sheet" className={styles.sheet}>
              <div className={styles.holes} aria-hidden="true">
                <i />
                <i />
              </div>
              <header className={styles.shHead}>
                <div>
                  <p className={styles.corp}>Shubhrato Corp.</p>
                  <h2>
                    Visitor <em>Clearance</em>
                  </h2>
                </div>
                <div className={styles.ring} aria-hidden="true">
                  <svg viewBox="0 0 44 44">
                    <circle className={styles.rb} cx={22} cy={22} r={18} />
                    <circle id="intro-rf" className={styles.rf} cx={22} cy={22} r={18} pathLength={100} />
                  </svg>
                  <span id="intro-pctnum">0</span>
                </div>
              </header>
              <div className={styles.meta}>
                <span>Form 27-B</span>
                <span id="intro-date" />
              </div>
              <div className={styles.field}>
                <p className={styles.lab}>Applicant</p>
                <div className={styles.sigWrap}>
                  <div id="intro-sig" className={styles.sig} />
                  <i id="intro-pen" className={styles.pen} />
                </div>
                <div className={styles.sigRule} />
              </div>
              <div className={styles.field}>
                <p className={styles.lab}>Background check</p>
                <ul id="intro-rows" className={styles.rows} aria-live="polite" />
              </div>
              <footer className={styles.verdict}>
                <p className={styles.lab}>Verdict</p>
                <p id="intro-vtext" className={styles.vtext} />
                <div id="intro-stamp" className={styles.stamp} aria-hidden="true">
                  <svg viewBox="0 0 320 136">
                    <defs>
                      <mask id="worn" maskUnits="userSpaceOnUse" x={0} y={0} width={320} height={136}>
                        <rect width={320} height={136} fill="#fff" />
                        <rect width={320} height={136} fill="#000" filter="url(#specks)" />
                      </mask>
                    </defs>
                    <g filter="url(#rough)" mask="url(#worn)" fill="none" stroke="#FF5A46">
                      <rect x={5} y={5} width={310} height={126} rx={10} strokeWidth={7} />
                      <rect x={16} y={16} width={288} height={104} rx={5} strokeWidth={2.5} />
                      <text x={160} y={40} textAnchor="middle" fill="#FF5A46" stroke="none" fontFamily="JetBrains Mono, monospace" fontSize={11} letterSpacing={3.5}>
                        SHUBHRATO CORP.
                      </text>
                      <text x={160} y={92} textAnchor="middle" fill="#FF5A46" stroke="none" fontFamily="Anton, Impact, sans-serif" fontSize={64} letterSpacing={6}>
                        HIRED
                      </text>
                      <text x={160} y={112} textAnchor="middle" fill="#FF5A46" stroke="none" fontFamily="JetBrains Mono, monospace" fontSize={10} letterSpacing={3}>
                        PEOPLE DEPT. APPROVED
                      </text>
                    </g>
                  </svg>
                </div>
              </footer>
            </article>
          </div>
        </section>
      </main>

      <p id="intro-tip" className={styles.tip} aria-hidden="true" />
    </div>
  );
}