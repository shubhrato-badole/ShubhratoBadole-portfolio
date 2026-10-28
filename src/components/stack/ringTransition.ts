'use client';
import gsap from 'gsap';
import { ExpoScaleEase } from 'gsap/EasePack';

gsap.registerPlugin(ExpoScaleEase);

/* ------------------------------------------------------------------------------------------
   THE RING TRANSITION — the same ring as your opening intro (Intro.tsx / createRing):
   identical shader, settings and expoScale ease. It is used both ways:
     close  → the dark cover shrinks in from the edges to the centre with the white ring glow
     open   → it opens again from the centre onto whatever is underneath
   `runRingTransition(onCovered)` closes, calls onCovered() while the screen is fully covered
   (swap the page / mount the Stack there), then opens. One full-screen WebGL pass: smooth.
   ------------------------------------------------------------------------------------------ */
const RING = {
  RING_WIDTH: 2, RING_SHARPNESS: 10, RING_GLOW: 1.8, CA_RING_STRENGTH: 0.15, CA_RADIAL_STRENGTH: 0.03,
  EDGE_SOFTNESS: 0.05, NOISE_STRENGTH: 0.2, EASE: 'expoScale(8,2,power1.inOut)', NOISE_URL: '/contact-scene/noise.jpg',
};
const INK: [number, number, number] = [4 / 255, 1 / 255, 15 / 255];

const VERT = `attribute vec2 aPos; varying vec2 vUv; void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;
const FRAG = `precision highp float;
uniform sampler2D uNoise; uniform float uNoiseStrength; uniform float uTransition; uniform vec2 uResolution; uniform vec2 uCenter; uniform vec3 uCover;
uniform float uRingWidth; uniform float uRingSharpness; uniform float uRingGlow; uniform float uCARingStrength; uniform float uCARadialStrength; uniform float uEdgeSoftness;
varying vec2 vUv;
float ringAt(float circle, float t) {
  float ringEnvelope = pow(1.0 - t, 0.6);
  float primaryRing = pow(clamp(1.0 - abs(circle * uRingWidth), 0.0, 1.0), uRingSharpness);
  float secondaryRing = pow(clamp(1.0 - abs((circle - 0.06) * uRingWidth * 0.5), 0.0, 1.0), uRingSharpness * 0.5) * 0.3;
  return ringEnvelope * (primaryRing + secondaryRing);
}
float glowOf(float ringFactor) { float g = ringFactor * uRingGlow; return clamp(g * 0.5 + g * g * 0.4, 0.0, 1.0); }
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
  float k = 0.05;
  float cR = circle - totalCA * k; float cG = circle - totalCA * k * 0.25; float cB = circle + totalCA * k;
  vec3 glow = vec3(
    glowOf(ringAt(cR, t)) * smoothstep(-uEdgeSoftness, uEdgeSoftness, cR),
    glowOf(ringAt(cG, t)) * smoothstep(-uEdgeSoftness, uEdgeSoftness, cG),
    glowOf(ringAt(cB, t)) * smoothstep(-uEdgeSoftness, uEdgeSoftness, cB)) * edgeFade;
  float maxGlow = max(glow.r, max(glow.g, glow.b));
  float reveal = smoothstep(-uEdgeSoftness, uEdgeSoftness, circle) * edgeFade;
  float cover = 1.0 - reveal;
  gl_FragColor = vec4(uCover * cover * (1.0 - maxGlow) + glow, clamp(cover * (1.0 - maxGlow) + maxGlow, 0.0, 1.0));
}`;

let noiseImg: HTMLImageElement | null = null;
const loadNoise = () => {
  if (noiseImg) return noiseImg;
  noiseImg = new Image(); noiseImg.decoding = 'async'; noiseImg.src = RING.NOISE_URL; return noiseImg;
};

type Ring = { draw: (v: number) => void; destroy: () => void };
function createRing(): Ring | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:2000;pointer-events:none';
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr);
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
    if (!gl) return null;
    const compile = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader'); return s; };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog); if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link'); gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos'); gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const n = loadNoise(); let ok = false;
    if (n.complete && n.naturalWidth > 0) { try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, n); ok = true; } catch { ok = false; } }
    if (!ok) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 255]));
    const U = (k: string) => gl.getUniformLocation(prog, k);
    gl.uniform1i(U('uNoise'), 0); gl.uniform1f(U('uNoiseStrength'), RING.NOISE_STRENGTH); gl.uniform2f(U('uResolution'), canvas.width, canvas.height); gl.uniform2f(U('uCenter'), 0.5, 0.5);
    gl.uniform3f(U('uCover'), INK[0], INK[1], INK[2]); gl.uniform1f(U('uRingWidth'), RING.RING_WIDTH); gl.uniform1f(U('uRingSharpness'), RING.RING_SHARPNESS); gl.uniform1f(U('uRingGlow'), RING.RING_GLOW);
    gl.uniform1f(U('uCARingStrength'), RING.CA_RING_STRENGTH); gl.uniform1f(U('uCARadialStrength'), RING.CA_RADIAL_STRENGTH); gl.uniform1f(U('uEdgeSoftness'), RING.EDGE_SOFTNESS);
    const uT = U('uTransition'); gl.viewport(0, 0, canvas.width, canvas.height); gl.disable(gl.BLEND);
    document.body.appendChild(canvas);
    const draw = (v: number) => { gl.uniform1f(uT, v); gl.drawArrays(gl.TRIANGLES, 0, 3); };
    draw(0); // clear
    return { draw, destroy: () => { canvas.remove(); gl.getExtension('WEBGL_lose_context')?.loseContext(); } };
  } catch { return null; }
}

const tween = (from: number, to: number, duration: number, draw: (v: number) => void, ease: string) =>
  new Promise<void>((res) => { const s = { v: from }; gsap.to(s, { v: to, duration, ease, onUpdate: () => draw(s.v), onComplete: () => res() }); });

/** close the ring over the page, run onCovered() while covered, then open it again. Never rejects. */
export async function runRingTransition(onCovered: () => void | Promise<void>, opts: { close?: number; open?: number } = {}) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ring = reduce ? null : createRing();
  if (!ring) { try { await onCovered(); } catch { /* keep going */ } return; }
  try {
    await tween(0, 1, opts.close ?? 1.15, ring.draw, RING.EASE);
    try { await onCovered(); } catch { /* the cover opens anyway */ }
    await new Promise((r) => setTimeout(r, 120));
    await tween(1, 0, opts.open ?? 1.9, ring.draw, RING.EASE);
  } finally { ring.destroy(); }
}
