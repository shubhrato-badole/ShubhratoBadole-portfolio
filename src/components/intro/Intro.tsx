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


/* ------------------------------------------------------------------------------------------
   THE CURSOR SMOKE
   This is the contact scene's own fluid simulation (its loading screen leaves a fading smoke
   trail where the mouse moves): the same shaders, the same settings, the same 60 Hz step order
   and the same way a mouse move becomes a push of smoke. It runs here on plain WebGL, so no
   extra library is needed. Without WebGL 2 the smoke is simply skipped.
   ------------------------------------------------------------------------------------------ */
/* the scene's smoke colour as it sets it up: #352d3d, blend 1.5 (its own override of the defaults).
   The scene turns the colour into linear light (like Three.js does) and encodes it back for the screen. */
const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const SMOKE = {
  BLEND: 1.5,
  INTENSITY: 2,
  FORCE: 1.1,
  CURL: 1.9,
  RADIUS: 0.4,
  SWIRL: 2, // pressure passes
  PRESSURE: 0.8,
  DENSITY_DISSIPATION: 0.96,
  VELOCITY_DISSIPATION: 1,
  COLOR: [srgbToLinear(0x35 / 255), srgbToLinear(0x2d / 255), srgbToLinear(0x3d / 255)] as [number, number, number], // #352d3d
  STEP: 1 / 60,
  MAX_SPLATS: 8,
  IDLE_FRAMES: 120,
};

const SMOKE_VERT = `attribute vec2 aPos;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform vec2 texelSize;
void main() {
  vUv = aPos * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0);
  vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y);
  vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const SMOKE_CLEAR = `precision highp float;
varying vec2 vUv;
uniform sampler2D uTexture;
uniform float uClearValue;
void main() { gl_FragColor = uClearValue * texture2D(uTexture, vUv); }`;

const SMOKE_CURL = `precision highp float;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform sampler2D uVelocity;
void main() {
  float L = texture2D(uVelocity, vL).y;
  float R = texture2D(uVelocity, vR).y;
  float T = texture2D(uVelocity, vT).x;
  float B = texture2D(uVelocity, vB).x;
  float vorticity = R - L - T + B;
  gl_FragColor = vec4(vorticity, 0.0, 0.0, 1.0);
}`;

const SMOKE_DIVERGENCE = `precision highp float;
varying highp vec2 vUv;
varying highp vec2 vL;
varying highp vec2 vR;
varying highp vec2 vT;
varying highp vec2 vB;
uniform sampler2D uVelocity;
void main() {
  float L = texture2D(uVelocity, vL).x;
  float R = texture2D(uVelocity, vR).x;
  float T = texture2D(uVelocity, vT).y;
  float B = texture2D(uVelocity, vB).y;
  vec2 C = texture2D(uVelocity, vUv).xy;
  if (vL.x < 0.0) { L = -C.x; }
  if (vR.x > 1.0) { R = -C.x; }
  if (vT.y > 1.0) { T = -C.y; }
  if (vB.y < 0.0) { B = -C.y; }
  float div = 0.5 * (R - L + T - B);
  gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
}`;

const SMOKE_GRADIENT = `precision highp float;
varying highp vec2 vUv;
varying highp vec2 vL;
varying highp vec2 vR;
varying highp vec2 vT;
varying highp vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
void main() {
  float L = texture2D(uPressure, vL).x;
  float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x;
  float B = texture2D(uPressure, vB).x;
  vec2 velocity = texture2D(uVelocity, vUv).xy;
  velocity.xy -= vec2(R - L, T - B);
  gl_FragColor = vec4(velocity, 0.0, 1.0);
}`;

const SMOKE_PRESSURE = `precision highp float;
varying highp vec2 vUv;
varying highp vec2 vL;
varying highp vec2 vR;
varying highp vec2 vT;
varying highp vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
void main() {
  float L = texture2D(uPressure, vL).x;
  float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x;
  float B = texture2D(uPressure, vB).x;
  float C = texture2D(uPressure, vUv).x;
  float divergence = texture2D(uDivergence, vUv).x;
  float pressure = (L + R + B + T - divergence) * 0.25;
  gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
}`;

const SMOKE_SPLAT = `precision highp float;
varying vec2 vUv;
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 uColor;
uniform vec2 uPointer;
uniform float uRadius;
void main() {
  vec2 p = vUv - uPointer.xy;
  p.x *= aspectRatio;
  vec3 splat = exp(-dot(p, p) / uRadius) * uColor;
  vec3 base = texture2D(uTarget, vUv).xyz;
  gl_FragColor = vec4(base + splat, 1.0);
}`;

const SMOKE_ADVECTION = `precision highp float;
varying vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 texelSize;
uniform float dt;
uniform float uDissipation;
void main() {
  vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
  gl_FragColor = uDissipation * texture2D(uSource, coord);
  gl_FragColor.a = 1.0;
}`;

const SMOKE_VORTICITY = `precision highp float;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float uCurlValue;
uniform float dt;
void main() {
  float L = texture2D(uCurl, vL).x;
  float R = texture2D(uCurl, vR).x;
  float T = texture2D(uCurl, vT).x;
  float B = texture2D(uCurl, vB).x;
  float C = texture2D(uCurl, vUv).x;
  vec2 force = vec2(abs(T) - abs(B), abs(R) - abs(L)) * 0.5;
  force /= length(force) + 1.;
  force *= uCurlValue * C;
  force.y *= -1.;
  vec2 vel = texture2D(uVelocity, vUv).xy;
  gl_FragColor = vec4(vel + force * dt, 0.0, 1.0);
}`;

/* how the scene draws the smoke over a transparent page: its colour, as bright as the smoke is thick */
const SMOKE_DISPLAY = `precision highp float;
varying vec2 vUv;
uniform sampler2D tFluid;
uniform vec3 uColor;
uniform float uBlend;
uniform float uIntensity;
void main() {
  vec3 fluidColor = texture2D(tFluid, vUv).rgb;
  float fluidLen = length(fluidColor);
  float presence = min(fluidLen, 1.0);
  vec3 colorForFluidEffect = uColor * fluidLen;
  vec3 rgb = colorForFluidEffect * (uBlend * 0.01 * presence);
  rgb += colorForFluidEffect * (fluidLen * uIntensity * 0.0001);
  /* linear light -> screen colours (sRGB), as the scene's final pass does */
  vec3 low = rgb * 12.92;
  vec3 high = 1.055 * pow(max(rgb, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
  rgb = mix(low, high, step(vec3(0.0031308), rgb));
  rgb = clamp(rgb, 0.0, 1.0);
  gl_FragColor = vec4(rgb, max(rgb.r, max(rgb.g, rgb.b)));
}`;

type Smoke = { destroy: () => void };
type SmokeTarget = { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number };
type SmokeSplat = { x: number; y: number; vx: number; vy: number };

/** Creates the smoke canvas inside `parent`. Returns null if WebGL 2 is not available. */
function createSmoke(parent: HTMLElement): Smoke | null {
  try {
    const touch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    const DYE = touch ? 128 : 256;
    const SIM = touch ? 64 : 96;
    const canvas = document.createElement('canvas');
    canvas.className = styles.smoke;
    canvas.setAttribute('aria-hidden', 'true');
    const fit = () => {
      canvas.width = Math.max(2, Math.round(window.innerWidth * 0.5)); // the smoke is soft: half resolution is plenty
      canvas.height = Math.max(2, Math.round(window.innerHeight * 0.5));
    };
    fit();
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
    });
    if (!gl) return null;
    gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('EXT_color_buffer_half_float');

    const compile = (type: number, code: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, code);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
      return s;
    };
    const vert = compile(gl.VERTEX_SHADER, SMOKE_VERT);
    const program = (frag: string) => {
      const p = gl.createProgram()!;
      gl.attachShader(p, vert);
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, frag));
      gl.bindAttribLocation(p, 0, 'aPos');
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link');
      const cache: Record<string, WebGLUniformLocation | null> = {};
      return {
        p,
        u: (n: string) => (n in cache ? cache[n] : (cache[n] = gl.getUniformLocation(p, n))),
      };
    };
    type Prog = ReturnType<typeof program>;
    const P = {
      splat: program(SMOKE_SPLAT),
      curl: program(SMOKE_CURL),
      clear: program(SMOKE_CLEAR),
      divergence: program(SMOKE_DIVERGENCE),
      pressure: program(SMOKE_PRESSURE),
      gradient: program(SMOKE_GRADIENT),
      advection: program(SMOKE_ADVECTION),
      vorticity: program(SMOKE_VORTICITY),
      display: program(SMOKE_DISPLAY),
    };

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.BLEND);

    const target = (w: number, h: number, minFilter: number): SmokeTarget => {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      const fbo = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('float targets unsupported');
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return { tex, fbo, w, h };
    };
    const pair = (w: number, h: number, minFilter: number) => {
      let a = target(w, h, minFilter);
      let b = target(w, h, minFilter);
      return {
        get read() {
          return a;
        },
        get write() {
          return b;
        },
        swap() {
          const t = a;
          a = b;
          b = t;
        },
      };
    };
    const dye = pair(DYE, DYE, gl.LINEAR);
    const velocity = pair(SIM, SIM, gl.LINEAR);
    const pressure = pair(SIM, SIM, gl.NEAREST);
    const divergence = target(SIM, SIM, gl.NEAREST);
    const curl = target(SIM, SIM, gl.NEAREST);

    let aspect = window.innerWidth / window.innerHeight;
    const activate = (pr: Prog) => {
      gl.useProgram(pr.p);
      gl.uniform2f(pr.u('texelSize'), 1 / (SIM * aspect), 1 / SIM);
    };
    const bind = (pr: Prog, name: string, unit: number, t: WebGLTexture) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.uniform1i(pr.u(name), unit);
    };
    const draw = (t: SmokeTarget | null) => {
      if (t) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
        gl.viewport(0, 0, t.w, t.h);
      } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    /* a mouse move becomes a push of smoke (same rule as the scene) */
    const splats: SmokeSplat[] = [];
    let lx = 0;
    let ly = 0;
    let seen = false;
    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - lx;
      const dy = e.clientY - ly;
      if (!seen) {
        seen = true;
        lx = e.clientX;
        ly = e.clientY;
        return;
      }
      lx = e.clientX;
      ly = e.clientY;
      if (Math.abs(dx) < 1.5 && Math.abs(dy) < 1.5) return;
      splats.push({
        x: e.clientX / window.innerWidth,
        y: 1 - e.clientY / window.innerHeight,
        vx: dx * SMOKE.FORCE,
        vy: -dy * SMOKE.FORCE,
      });
    };
    const onResize = () => {
      fit();
      aspect = window.innerWidth / window.innerHeight;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('resize', onResize);

    const step = () => {
      if (splats.length > SMOKE.MAX_SPLATS) splats.splice(0, splats.length - SMOKE.MAX_SPLATS);
      if (splats.length > 0) {
        activate(P.splat);
        gl.uniform1f(P.splat.u('aspectRatio'), aspect);
        gl.uniform1f(P.splat.u('uRadius'), SMOKE.RADIUS / 100);
        for (let q = splats.length - 1; q >= 0; q--) {
          const s = splats[q];
          gl.uniform2f(P.splat.u('uPointer'), s.x, s.y);
          gl.uniform3f(P.splat.u('uColor'), s.vx, s.vy, 10);
          bind(P.splat, 'uTarget', 0, velocity.read.tex);
          draw(velocity.write);
          velocity.swap();
          bind(P.splat, 'uTarget', 0, dye.read.tex);
          draw(dye.write);
          dye.swap();
          splats.pop();
        }
      }
      activate(P.curl);
      bind(P.curl, 'uVelocity', 0, velocity.read.tex);
      draw(curl);

      activate(P.vorticity);
      gl.uniform1f(P.vorticity.u('dt'), SMOKE.STEP);
      gl.uniform1f(P.vorticity.u('uCurlValue'), SMOKE.CURL);
      bind(P.vorticity, 'uVelocity', 0, velocity.read.tex);
      bind(P.vorticity, 'uCurl', 1, curl.tex);
      draw(velocity.write);
      velocity.swap();

      activate(P.divergence);
      bind(P.divergence, 'uVelocity', 0, velocity.read.tex);
      draw(divergence);

      activate(P.clear);
      gl.uniform1f(P.clear.u('uClearValue'), SMOKE.PRESSURE);
      bind(P.clear, 'uTexture', 0, pressure.read.tex);
      draw(pressure.write);
      pressure.swap();

      activate(P.pressure);
      bind(P.pressure, 'uDivergence', 1, divergence.tex);
      for (let i = 0; i < SMOKE.SWIRL; i++) {
        bind(P.pressure, 'uPressure', 0, pressure.read.tex);
        draw(pressure.write);
        pressure.swap();
      }

      activate(P.gradient);
      bind(P.gradient, 'uPressure', 0, pressure.read.tex);
      bind(P.gradient, 'uVelocity', 1, velocity.read.tex);
      draw(velocity.write);
      velocity.swap();

      activate(P.advection);
      gl.uniform1f(P.advection.u('dt'), SMOKE.STEP);
      gl.uniform1f(P.advection.u('uDissipation'), Math.pow(SMOKE.VELOCITY_DISSIPATION, 1));
      bind(P.advection, 'uVelocity', 0, velocity.read.tex);
      bind(P.advection, 'uSource', 1, velocity.read.tex);
      draw(velocity.write);
      velocity.swap();
      gl.uniform1f(P.advection.u('uDissipation'), Math.pow(SMOKE.DENSITY_DISSIPATION, 1));
      bind(P.advection, 'uVelocity', 0, velocity.read.tex);
      bind(P.advection, 'uSource', 1, dye.read.tex);
      draw(dye.write);
      dye.swap();

      gl.useProgram(P.display.p);
      bind(P.display, 'tFluid', 0, dye.read.tex);
      gl.uniform3f(P.display.u('uColor'), SMOKE.COLOR[0], SMOKE.COLOR[1], SMOKE.COLOR[2]);
      gl.uniform1f(P.display.u('uBlend'), SMOKE.BLEND);
      gl.uniform1f(P.display.u('uIntensity'), SMOKE.INTENSITY);
      draw(null);
    };

    let raf = 0;
    let dead = false;
    let last = -1;
    let acc = 0;
    let idle = 0;
    let blank = true;
    const frame = (now: number) => {
      if (dead) return;
      raf = requestAnimationFrame(frame);
      if (last >= 0) acc += (now - last) / 1000;
      last = now;
      if (acc < SMOKE.STEP - 0.001) return;
      acc = Math.min(acc - SMOKE.STEP, SMOKE.STEP);
      if (splats.length > 0) {
        idle = 0;
        blank = false;
      } else if (++idle > SMOKE.IDLE_FRAMES) {
        // nothing moved for a while: the smoke has faded, so rest (as the scene does)
        if (!blank) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          blank = true;
        }
        return;
      }
      step();
    };
    parent.appendChild(canvas);
    raf = requestAnimationFrame(frame);

    return {
      destroy: () => {
        dead = true;
        cancelAnimationFrame(raf);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('resize', onResize);
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
    const topBar = $('.' + styles.top)!;
    const bar = $('#intro-bar')!;
    const barFill = $('#intro-barfill')!;
    const pct = $('#intro-pct')!;

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
    function clean(v: string) {
      return v.replace(/\s+/g, ' ').trim().slice(0, 24);
    }
    function titleCase(s: string) {
      return s.toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase());
    }

    /* ---------- the cursor smoke (name page + loading screen) ---------- */
    const smoke = reduce ? null : createSmoke(root);

    let tipShown = false;
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
    const onFirstMove = () => tipHide();
    window.addEventListener('pointermove', onFirstMove, { passive: true, once: true });

    /* ---------- page 1: the name ---------- */
    function resetUI() {
      S.anims.forEach((a) => {
        try {
          a.cancel();
        } catch {}
      });
      S.anims = [];
      s1.hidden = false;
      s2.hidden = true;
      who.classList.remove(styles.has);
      hint.textContent = '';
      input.value = '';
      tipShown = false;
    }

    async function intro() {
      const id = ++S.run;
      S.skip = false;
      resetUI();
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
        hint.textContent = 'we need a name to continue';
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
      startLoading();
    }
    input.addEventListener('input', onInput);
    who.addEventListener('submit', onSubmit);

    /* ---------- page 2: the loading screen (the contact scene's loader, counting 0 to 100 %) ---------- */
    function runCount(id: number) {
      return new Promise<void>((res) => {
        const st = { p: 0 };
        const tw = gsap.to(st, {
          p: 1,
          duration: Math.max(0.6, 3 * pace()),
          ease: 'power1.inOut',
          onUpdate: () => {
            if (id !== S.run) {
              tw.kill();
              res();
              return;
            }
            barFill.style.transform = `scaleX(${st.p})`;
            const n = Math.round(st.p * 100);
            pct.textContent = String(n).padStart(3, '0') + '%';
            bar.setAttribute('aria-valuenow', String(n));
          },
          onComplete: () => res(),
        });
      });
    }

    /* ---------- the opening: the contact scene's ring, on your dark page ----------
       1. the loading screen reaches 100 %,
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
      chk(id);
      smoke?.destroy();
      const ring = createRing(INK, noiseImg);
      if (!ring) {
        handOver(); // no WebGL on this device: go straight to the hero
        return;
      }
      root!.style.visibility = 'hidden';
      handOver();
      await frames(2);
      await wait(300); // the hero's start-up work happens here, behind the plain dark cover
      await ring.open();
      ring.destroy();
    }

    async function startLoading() {
      const id = ++S.run;
      S.skip = false;
      try {
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
              play(topBar, [{ opacity: 1 }, { opacity: 0 }], { duration: 380 }),
            ])
        );
        chk(id);
        s1.hidden = true;
        s2.hidden = false;
        await play(s2, [{ opacity: 0 }, { opacity: 1 }], { duration: 350, easing: 'ease-out' });
        chk(id);
        await runCount(id);
        chk(id);
        await sleep(200, id); // the scene also rests 0.2 s on 100 % before it opens
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
      window.removeEventListener('pointermove', onFirstMove);
      input.removeEventListener('input', onInput);
      who.removeEventListener('submit', onSubmit);
      smoke?.destroy();
      document.body.style.overflow = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={rootRef} className={styles.introRoot}>
      <div className={styles.backdrop} aria-hidden="true" />

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

        {/* Page 2: the loading screen (same markup as the contact scene's loader, without the logo) */}
        <section id="intro-s2" className={styles.loader} hidden aria-label="Loading">
          <div className={styles.lContainer}>
            <div className={styles.lContent}>
              <p className={styles.lText}>
                Production AI systems and backend products, built to be fast, secure and scalable
              </p>
            </div>
            <div className={styles.lProgress}>
              <div
                id="intro-bar"
                className={styles.lBar}
                role="progressbar"
                aria-label="Loading"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={0}
              >
                <div id="intro-barfill" className={styles.lBarFill} />
              </div>
              <div className={styles.lWait} aria-hidden="true">
                <span>Experience</span>
                <span>is loading</span>
                <span>please</span>
                <span>wait</span>
                <span id="intro-pct">000%</span>
                <span>out of</span>
                <span>100%</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      <p id="intro-tip" className={styles.tip} aria-hidden="true" />
    </div>
  );
}
