/* The contact scene: a night lake that the camera leaves, and a lilac tree with two chairs it arrives at.
   Everything is drawn by code: no images, models or textures are downloaded.

   · LAKE   : one full-screen fragment shader (sky, clouds, stars, a real-looking moon, mountains, pines and perspective
              water with ripples, a fresnel reflection of all of that and the moon's glitter path).
   · GARDEN : painted once with the 2D canvas (tree, chairs, rocks, hills), uploaded as a texture, then moved as sprites.
   · LIFE   : fireflies, falling petals, grass in front; all cheap sprites.
   · SPEED  : one WebGL context, adaptive resolution, stops when nobody can see it, one still frame for reduced motion.

   Coordinates: "H units" = canvas height, y goes down (0 top, 1 bottom). The camera pans in H units (cam = 0 at the lake). */

export type ContactScene = {
  /** 0 = the lake, 1 = the garden (tree and chairs) */
  setPan: (p: number) => void;
  /** phone layout: the scene only uses the top part of the screen, the panel covers the rest */
  setMobile: (mobile: boolean) => void;
  start: () => void;
  stop: () => void;
  resize: () => void;
  renderOnce: () => void;
  destroy: () => void;
};

type Opts = {
  onReady?: () => void;
  reduceMotion?: boolean;
  lowPower?: boolean; // phones / small devices: lower resolution, fewer sprites, 30 fps
};

/* ------------------------------------------------------------------------------------------------ shaders */

const VERT_FULL = `
attribute vec2 aPos;
void main(){ gl_Position = vec4(aPos * 2.0 - 1.0, 0.0, 1.0); }`;

const FRAG_LAKE = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uTime;
uniform float uCam;     // camera x, H units (0 = lake view, negative = panned left)
uniform float uHz;      // horizon, 0..1 from the top
uniform float uMoonX;   // moon, sky space (x relative to screen centre, H units)
uniform float uMoonY;
uniform float uLow;     // 1.0 = cheaper reflection (phones)

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm5(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * noise(p); p = p * 2.03 + vec2(11.7, 3.1); a *= 0.5; } return v; }
float fbm3(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 3; i++){ v += a * noise(p); p = p * 2.03 + vec2(11.7, 3.1); a *= 0.5; } return v; }

float ridgeN(float x){ return 1.0 - abs(2.0 * noise(vec2(x, 4.1)) - 1.0); }
float mtFar(float x){
  float b = 0.60 * fbm5(vec2(x * 2.1, 1.3)) + 0.40 * ridgeN(x * 5.2) * fbm3(vec2(x * 1.3, 9.0));
  return uHz - 0.115 - 0.215 * b;
}
float mtNear(float x){ return uHz - 0.050 - 0.078 * (0.7 * fbm3(vec2(x * 3.1, 7.9)) + 0.3 * ridgeN(x * 9.0)); }
float pines(float x){
  float s = x * 46.0, id = floor(s), f = fract(s);
  float present = step(0.12, hash(vec2(id, 5.0)));
  float h = (0.022 + 0.058 * hash(vec2(id, 3.0))) * present;
  float tri = pow(1.0 - abs(f * 2.0 - 1.0), 1.15);
  float tiers = 0.80 + 0.20 * abs(sin(f * 14.0 + id * 1.7));
  return uHz - 0.004 - h * tri * tiers;
}

/* colour of everything ABOVE the horizon at screen-centred point s (also what the water reflects) */
vec3 scene(vec2 s, float lowq){
  /* sky layer: slow parallax */
  vec2 w = vec2(s.x + uCam * 0.10, s.y);
  float t = clamp(w.y / uHz, 0.0, 1.0);
  vec3 c = mix(vec3(0.026, 0.013, 0.095), vec3(0.135, 0.068, 0.290), smoothstep(0.0, 0.55, t));
  c = mix(c, vec3(0.47, 0.29, 0.67), smoothstep(0.42, 1.0, t) * 0.94);

  vec2 mp = vec2(uMoonX, uMoonY);
  float md = length(w - mp);
  float R = 0.058;

  /* clouds: soft, lit from the moon side */
  vec2 cp = vec2(w.x * 0.95 + uTime * 0.0035, w.y * 2.3);
  float cl = lowq > 0.5 ? fbm3(cp * 1.7) : fbm5(cp * 1.7);
  cl = smoothstep(0.47, 0.84, cl);
  float prox = exp(-md * 2.4);
  c += vec3(0.21, 0.14, 0.36) * cl * (0.32 + 0.95 * prox) * (1.0 - 0.45 * t);
  c += vec3(0.45, 0.34, 0.75) * cl * exp(-md * 7.0) * 0.55;

  /* stars */
  vec2 sp = w * 78.0; vec2 cell = floor(sp);
  float h1 = hash(cell), h2 = hash(cell + 7.3), h3 = hash(cell + 13.1);
  vec2 off = (vec2(h2, h3) - 0.5) * 0.7;
  float sd = length(fract(sp) - 0.5 - off);
  float star = smoothstep(0.075 + 0.05 * step(0.992, h1), 0.0, sd) * step(0.962, h1);
  float tw = 0.55 + 0.45 * sin(uTime * (0.8 + h2 * 3.0) + h3 * 40.0);
  c += vec3(0.92, 0.88, 1.0) * star * tw * (1.0 - t * 0.85) * (1.0 - cl * 0.85);

  /* moon glow: tight halo, wide bloom, a faint ring (22 degree halo) */
  float q = md / R;
  c += vec3(0.82, 0.70, 1.00) * (0.62 * exp(-q * 1.05) + 0.18 / (1.0 + q * q * 0.07));
  c += vec3(0.60, 0.50, 0.95) * 0.055 * exp(-pow((q - 6.8) * 0.55, 2.0));

  /* the moon itself: bright highlands, big soft maria, craters of two sizes with bright rims, limb darkening */
  if (q < 1.04) {
    vec2 qq = (w - mp) / R;
    float r = length(qq);
    float mare = smoothstep(0.47, 0.66, fbm5(qq * 0.95 + vec2(3.7, 1.9)));
    float mare2 = smoothstep(0.50, 0.70, fbm3(qq * 2.1 + vec2(8.2, 4.4)));
    float dark = 0.0, bright = 0.0;
    for (int sc = 0; sc < 2; sc++) {
      float scl = sc == 0 ? 2.7 : 6.8;
      float prob = sc == 0 ? 0.42 : 0.55;
      float rad = sc == 0 ? 0.30 : 0.24;
      vec2 g = qq * scl; vec2 gi = floor(g), gf = fract(g);
      for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
          vec2 o = vec2(float(i), float(j));
          float hh = hash(gi + o + float(sc) * 31.0);
          if (hh < prob) {
            vec2 pt = vec2(hash(gi + o + 17.0 + float(sc)), hash(gi + o + 29.0 + float(sc)));
            float rr = rad * (0.45 + 0.75 * hash(gi + o + 5.0));
            float dd = length(o + 0.15 + pt * 0.7 - gf);
            dark += smoothstep(rr, rr * 0.55, dd) * 0.10;
            bright += exp(-pow((dd - rr) / (rr * 0.13), 2.0)) * 0.10;
          }
        }
      }
    }
    float limb = sqrt(max(0.0, 1.0 - r * r));
    float fine = noise(qq * 26.0) * 0.045;
    vec3 hi = vec3(1.00, 0.985, 1.00);
    vec3 mr = vec3(0.60, 0.60, 0.70);
    vec3 mc = mix(hi, mr, clamp(mare * 0.62 + mare2 * 0.10, 0.0, 0.7));
    mc *= 1.0 - dark - fine;
    mc += bright * 0.7;
    mc *= mix(0.80, 1.0, pow(limb, 0.6)) * 1.12;
    c = mix(c, mc, smoothstep(1.02, 0.980, r));
  }

  /* far mountains, near mountains, pines (each with its own parallax) */
  float xf = s.x + uCam * 0.22, xn = s.x + uCam * 0.36, xp = s.x + uCam * 0.58;
  float yf = mtFar(xf), yn = mtNear(xn), yp = pines(xp);
  vec3 mist = vec3(0.30, 0.18, 0.46);
  if (s.y > yf) {
    float k = clamp((s.y - yf) / 0.22, 0.0, 1.0);
    vec3 m = mix(vec3(0.20, 0.115, 0.40), vec3(0.115, 0.065, 0.250), k);
    m += vec3(0.30, 0.20, 0.50) * exp(-(s.y - yf) * 70.0) * 0.22 * (0.6 + 0.4 * prox);  // moonlit ridge
    c = m;
  }
  if (s.y > yn) {
    float k = clamp((s.y - yn) / 0.12, 0.0, 1.0);
    c = mix(vec3(0.085, 0.047, 0.185), vec3(0.050, 0.027, 0.115), k);
    c += vec3(0.22, 0.14, 0.40) * exp(-(s.y - yn) * 90.0) * 0.12;
  }
  if (s.y > yp) c = vec3(0.024, 0.012, 0.058) + vec3(0.08, 0.05, 0.14) * exp(-(s.y - yp) * 160.0) * 0.4;
  c += mist * exp(-(uHz - s.y) * 22.0) * 0.38 * smoothstep(yn - 0.02, uHz, s.y + 0.06);
  return c;
}

float hgt(vec2 p){
  float t = uTime;
  return 0.50 * sin(dot(p, vec2(1.7, 2.9)) + t * 1.10)
       + 0.32 * sin(dot(p, vec2(-2.4, 1.5)) + t * 1.60)
       + 0.20 * sin(dot(p, vec2(4.3, -1.9)) + t * 2.20)
       + 0.20 * noise(p * 2.6 + vec2(t * 0.25, -t * 0.18));
}

void main(){
  float H = uRes.y, a = uRes.x / H;
  vec2 p = vec2(gl_FragCoord.x / H, 1.0 - gl_FragCoord.y / H);
  vec2 sw = vec2(p.x - 0.5 * a, p.y);
  vec3 col;

  if (p.y < uHz) {
    col = scene(sw, 0.0);
  } else {
    float d = (p.y - uHz) / (1.0 - uHz);              // 0 at the horizon, 1 at the bottom of the screen
    float z = 1.0 / (d * 1.25 + 0.07);                // perspective: ripples get tighter toward the horizon
    vec2 wp = vec2((sw.x + uCam * 0.85) * z * 0.9, z * 1.6);
    float h0 = hgt(wp);
    float hx = hgt(wp + vec2(0.03, 0.0)) - h0;
    float hz = hgt(wp + vec2(0.0, 0.03)) - h0;
    vec2 sl = vec2(hx, hz) / 0.03;
    float calm = smoothstep(0.0, 0.14, d);            // no shimmering right at the horizon
    float amp = (0.004 + 0.030 * d) * calm;

    vec2 rs = vec2(sw.x + sl.x * amp * 1.1, uHz - (p.y - uHz) * 0.95 + sl.y * amp * 0.65);
    rs.y = clamp(rs.y, 0.0, uHz - 0.002);
    vec3 rc = scene(rs, uLow);

    vec3 deep = mix(vec3(0.062, 0.034, 0.145), vec3(0.012, 0.006, 0.040), pow(d, 0.7));
    float F = mix(0.88, 0.30, pow(d, 0.55));          // fresnel: mirror-like near the horizon, darker close up
    col = mix(deep, rc * vec3(0.93, 0.90, 1.0), F);

    /* the moon's glitter path: a column that widens toward you, broken into dashes by the ripples */
    float mx = uMoonX - uCam * 0.10;
    float cx = sw.x - mx - sl.x * amp * 0.6;
    float sig = 0.020 + 0.17 * d;
    float colW = exp(-(cx * cx) / (sig * sig));
    float dn = noise(vec2(sw.x * (95.0 / (0.6 + z * 0.22)) + sl.x * 2.5, z * 6.5 - uTime * 0.9));
    float dash = smoothstep(0.42, 0.92, dn * 0.65 + 0.55 * clamp(abs(sl.x) * 0.9, 0.0, 1.0));
    float gl = colW * (0.10 + 1.05 * dash) * calm;
    col += vec3(0.95, 0.86, 1.0) * gl * (1.0 - 0.40 * d);
    col += vec3(0.50, 0.36, 0.85) * colW * 0.20 * (1.0 - 0.6 * d);

    /* tiny glints everywhere else */
    float gn = noise(vec2(sw.x * 160.0 / (0.8 + z * 0.2), z * 14.0 - uTime * 1.2));
    col += vec3(0.55, 0.45, 0.95) * smoothstep(0.90, 1.0, gn) * 0.12 * calm * (1.0 - d);

    col += vec3(0.32, 0.19, 0.48) * exp(-d * 26.0) * 0.45;       // haze on the horizon line
    col *= mix(1.0, 0.50, d * d);
  }

  /* gentle vignette, dither (kills banding in the dark gradients) */
  float v = smoothstep(1.35, 0.35, length(vec2(p.x - 0.5 * a, p.y - 0.5) * vec2(0.8, 1.0)));
  col *= mix(0.72, 1.0, v);
  col = col / (1.0 + col * 0.18);
  col += (hash(gl_FragCoord.xy + uTime) - 0.5) / 160.0;
  gl_FragColor = vec4(col, 1.0);
}`;

const VERT_SPRITE = `
attribute vec2 aPos;
uniform vec4 uRect;   // x, y, w, h in canvas pixels (y down)
uniform vec2 uRes;
uniform float uRot;
varying vec2 vUv;
void main(){
  vec2 c = (aPos - 0.5) * uRect.zw;
  float s = sin(uRot), co = cos(uRot);
  c = vec2(c.x * co - c.y * s, c.x * s + c.y * co);
  vec2 px = uRect.xy + uRect.zw * 0.5 + c;
  gl_Position = vec4(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0, 0.0, 1.0);
  vUv = aPos;
}`;

const FRAG_SPRITE = `
precision mediump float;
uniform sampler2D uTex;
uniform vec4 uUv;     // scale xy, offset zw
uniform vec4 uTint;   // rgb multiplier, a = alpha
varying vec2 vUv;
void main(){
  vec4 t = texture2D(uTex, vUv * uUv.xy + uUv.zw);
  gl_FragColor = vec4(t.rgb * uTint.rgb, t.a) * uTint.a;
}`;

/* ------------------------------------------------------------------------------------------------ art (2D canvas) */

function rng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const mkCanvas = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
};
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/* garden texture: 2.2 H wide, 1.45 H tall (H = the texture's own "unit"); the tree stands at x = 1.1, ground at y = .66 */
export const GARDEN_W = 2.2;
export const GARDEN_H = 1.45;
const TREE_X = 1.1;
const GROUND_Y = 0.645;

async function paintGarden(U: number): Promise<HTMLCanvasElement> {
  const cv = mkCanvas(GARDEN_W * U, GARDEN_H * U);
  const g = cv.getContext('2d')!;
  const r = rng(11);
  const X = (v: number) => v * U;

  /* --- far hills with a moonlit rim --- */
  const hill = (base: number, amp: number, seed: number, c0: string, c1: string, rim: string) => {
    const rr = rng(seed);
    const ph = [rr() * 6, rr() * 6, rr() * 6];
    g.beginPath();
    g.moveTo(0, X(GARDEN_H));
    const pts: number[] = [];
    for (let x = 0; x <= GARDEN_W + 0.001; x += 0.02) {
      const bank = Math.max(0, (x - 1.55) / 0.5);
      const y = base + amp * (0.5 * Math.sin(x * 3.1 + ph[0]) + 0.3 * Math.sin(x * 7.3 + ph[1]) + 0.2 * Math.sin(x * 13 + ph[2])) + bank * bank * 0.55;
      pts.push(x, y);
      g.lineTo(X(x), X(y));
    }
    g.lineTo(X(GARDEN_W), X(GARDEN_H));
    g.closePath();
    const gr = g.createLinearGradient(0, X(base - amp), 0, X(base + 0.5));
    gr.addColorStop(0, c0);
    gr.addColorStop(1, c1);
    g.fillStyle = gr;
    g.fill();
    g.beginPath();
    for (let i = 0; i < pts.length; i += 2) (i === 0 ? g.moveTo : g.lineTo).call(g, X(pts[i]), X(pts[i + 1]));
    g.strokeStyle = rim;
    g.lineWidth = Math.max(1, U * 0.0035);
    g.stroke();
  };
  hill(0.505, 0.040, 5, '#33196b', '#1b0e3d', 'rgba(160,125,240,0.45)');
  hill(0.565, 0.030, 6, '#27145a', '#170c36', 'rgba(140,105,225,0.35)');

  /* --- dark standing stones: rounded monoliths with a lit edge --- */
  const stone = (cx: number, base: number, w: number, h: number, seed: number) => {
    const rr = rng(seed);
    const n = 9;
    const pts: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const ang = Math.PI * t;
      const jx = 1 + (rr() - 0.5) * 0.30, jy = 1 + (rr() - 0.5) * 0.26;
      pts.push([cx - Math.cos(ang) * w * 0.5 * jx, base - Math.sin(ang) * h * jy * (0.78 + 0.22 * Math.sin(ang * 2 + seed))]);
    }
    g.beginPath();
    g.moveTo(X(cx - w * 0.52), X(base + 0.02));
    pts.forEach(([x, y]) => g.lineTo(X(x), X(y)));
    g.lineTo(X(cx + w * 0.52), X(base + 0.02));
    g.closePath();
    const sg = g.createLinearGradient(X(cx - w / 2), 0, X(cx + w / 2), 0);
    sg.addColorStop(0, '#07031a');
    sg.addColorStop(0.7, '#0c0624');
    sg.addColorStop(1, '#1a0f3d');
    g.fillStyle = sg;
    g.fill();
    g.strokeStyle = 'rgba(120,90,200,0.35)';
    g.lineWidth = U * 0.004;
    g.stroke();
  };
  [[0.26, 0.15, 0.17], [0.40, 0.09, 0.11], [0.62, 0.11, 0.13], [0.82, 0.16, 0.20], [1.55, 0.12, 0.15], [1.40, 0.07, 0.09], [1.72, 0.10, 0.12], [0.08, 0.14, 0.15]].forEach(([cx, w, h], i) =>
    stone(cx, 0.60 + (i % 3) * 0.004, w, h, 20 + i));
  await tick();

  /* --- the meadow the tree stands on, falling away to the lake on the right --- */
  hill(GROUND_Y, 0.014, 8, '#46298a', '#150a33', 'rgba(190,150,255,0.55)');
  /* grass texture on the meadow: lots of short blades, brighter where the moon hits */
  for (let i = 0; i < 9000; i++) {
    const x = r() * GARDEN_W;
    const bank = Math.max(0, (x - 1.55) / 0.5);
    const yTop = GROUND_Y + 0.014 * (0.5 * Math.sin(x * 3.1 + 2) + 0.3 * Math.sin(x * 7.3 + 1)) + bank * bank * 0.55;
    const y = yTop + r() * r() * 0.5;
    const len = (0.012 + r() * 0.03) * (0.6 + 0.8 * (1 - (y - yTop) * 1.4));
    const lean = (r() - 0.5) * 0.02;
    const hot = r() < 0.07 ? 1 : 0;
    const depth = Math.min(1, (y - yTop) / 0.35);
    g.strokeStyle = hot ? 'rgba(170,135,255,0.65)' : `rgba(${60 - depth * 36 + r() * 25},${34 - depth * 20 + r() * 14},${130 - depth * 60 + r() * 40},0.75)`;
    g.lineWidth = U * (0.0022 + r() * 0.0025);
    g.beginPath();
    g.moveTo(X(x), X(y));
    g.quadraticCurveTo(X(x + lean * 0.4), X(y - len * 0.6), X(x + lean), X(y - len));
    g.stroke();
  }
  await tick();

  /* --- shadow pool under the tree --- */
  const sh = g.createRadialGradient(X(TREE_X), X(GROUND_Y + 0.12), 0, X(TREE_X), X(GROUND_Y + 0.12), X(0.62));
  sh.addColorStop(0, 'rgba(6,2,18,0.55)');
  sh.addColorStop(1, 'rgba(6,2,18,0)');
  g.save();
  g.translate(0, X(GROUND_Y + 0.12));
  g.scale(1, 0.32);
  g.translate(0, -X(GROUND_Y + 0.12));
  g.fillStyle = sh;
  g.fillRect(X(TREE_X - 0.7), X(GROUND_Y - 0.4), X(1.4), X(1.0));
  g.restore();

  /* --- trunk and branches --- */
  const limb = (pts: [number, number][], w0: number, w1: number) => {
    // pts: bezier control polyline (p0, c1, c2, p1), drawn as a tapering stroke
    const steps = 24;
    const bez = (t: number) => {
      const m = 1 - t;
      return [
        m * m * m * pts[0][0] + 3 * m * m * t * pts[1][0] + 3 * m * t * t * pts[2][0] + t * t * t * pts[3][0],
        m * m * m * pts[0][1] + 3 * m * m * t * pts[1][1] + 3 * m * t * t * pts[2][1] + t * t * t * pts[3][1],
      ];
    };
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps, t1 = (i + 1) / steps;
        const [x0, y0] = bez(t0), [x1, y1] = bez(t1);
        const w = (w0 + (w1 - w0) * t0) * (pass === 0 ? 1 : 0.28);
        g.strokeStyle = pass === 0 ? '#150a2e' : '#4c3190';
        g.lineCap = 'round';
        g.lineWidth = X(w);
        g.beginPath();
        g.moveTo(X(x0) - (pass ? X(w0 * 0.22) : 0), X(y0));
        g.lineTo(X(x1) - (pass ? X(w0 * 0.22) : 0), X(y1));
        g.stroke();
      }
    }
  };
  {
    // the trunk: a flared, tapering, filled shape with a lit left edge and bark
    const tx = TREE_X, by = GROUND_Y + 0.06;
    const lx = (y: number) => tx - (0.050 + 0.040 * Math.pow(Math.max(0, (y - 0.34) / (by - 0.34)), 2.2) + 0.015 * Math.max(0, (y - (by - 0.07)) / 0.07));
    const rx = (y: number) => tx + (0.046 + 0.038 * Math.pow(Math.max(0, (y - 0.34) / (by - 0.34)), 2.2) + 0.015 * Math.max(0, (y - (by - 0.07)) / 0.07));
    g.beginPath();
    g.moveTo(X(lx(0.30) - 0.01), X(0.30));
    for (let y = 0.30; y <= by; y += 0.01) g.lineTo(X(lx(y) + Math.sin(y * 40) * 0.003), X(y));
    for (let y = by; y >= 0.30; y -= 0.01) g.lineTo(X(rx(y) + Math.sin(y * 33) * 0.003), X(y));
    g.closePath();
    const tg = g.createLinearGradient(X(tx - 0.09), 0, X(tx + 0.09), 0);
    tg.addColorStop(0, '#3a2275');
    tg.addColorStop(0.28, '#1c0e3c');
    tg.addColorStop(1, '#0e0620');
    g.fillStyle = tg;
    g.fill();
    for (let i = 0; i < 70; i++) {
      const y0 = 0.32 + r() * (by - 0.36), xx = tx - 0.06 + r() * 0.12, len = 0.03 + r() * 0.08;
      g.strokeStyle = r() < 0.4 ? 'rgba(130,95,215,0.40)' : 'rgba(6,2,16,0.55)';
      g.lineWidth = U * (0.0015 + r() * 0.0025);
      g.beginPath();
      g.moveTo(X(xx), X(y0));
      g.quadraticCurveTo(X(xx + (r() - 0.5) * 0.012), X(y0 + len * 0.5), X(xx + (r() - 0.5) * 0.02), X(y0 + len));
      g.stroke();
    }
  }
  limb([[TREE_X - 0.02, 0.40], [TREE_X - 0.10, 0.30], [TREE_X - 0.24, 0.24], [TREE_X - 0.40, 0.10]], 0.055, 0.016);
  limb([[TREE_X - 0.02, 0.36], [TREE_X + 0.08, 0.26], [TREE_X + 0.26, 0.20], [TREE_X + 0.44, 0.04]], 0.05, 0.014);
  limb([[TREE_X - 0.02, 0.34], [TREE_X - 0.04, 0.22], [TREE_X + 0.02, 0.10], [TREE_X - 0.05, -0.10]], 0.05, 0.016);
  limb([[TREE_X - 0.10, 0.30], [TREE_X - 0.28, 0.30], [TREE_X - 0.42, 0.34], [TREE_X - 0.58, 0.28]], 0.026, 0.008);
  limb([[TREE_X + 0.08, 0.28], [TREE_X + 0.26, 0.31], [TREE_X + 0.40, 0.30], [TREE_X + 0.55, 0.22]], 0.026, 0.008);
  await tick();

  /* --- tall grass over the foot of the trunk and the legs of the chairs' area, so nothing ends on a straight line --- */
  for (let i = 0; i < 1100; i++) {
    const x = TREE_X + (r() - 0.5) * 0.34;
    const y = GROUND_Y + 0.015 + r() * 0.085;
    const len = 0.025 + r() * 0.07;
    const lean = (r() - 0.5) * 0.03;
    const d = (y - GROUND_Y) / 0.1;
    g.strokeStyle = r() < 0.12 ? 'rgba(175,140,255,0.75)' : `rgba(${44 - d * 22 + r() * 22},${24 - d * 12 + r() * 12},${105 - d * 40 + r() * 40},0.92)`;
    g.lineWidth = U * (0.0025 + r() * 0.003);
    g.beginPath();
    g.moveTo(X(x), X(y));
    g.quadraticCurveTo(X(x + lean * 0.4), X(y - len * 0.6), X(x + lean), X(y - len));
    g.stroke();
  }
  await tick();

  /* --- canopy: a halo of light, then thousands of leaves lit from the upper left --- */
  g.globalCompositeOperation = 'lighter';
  [[0.0, 0.18, 0.62], [-0.28, 0.24, 0.34], [0.30, 0.2, 0.36]].forEach(([dx, y, rad]) => {
    const gg = g.createRadialGradient(X(TREE_X + dx), X(y), 0, X(TREE_X + dx), X(y), X(rad));
    gg.addColorStop(0, 'rgba(150,100,255,0.34)');
    gg.addColorStop(1, 'rgba(150,100,255,0)');
    g.fillStyle = gg;
    g.fillRect(0, 0, X(GARDEN_W), X(GROUND_Y));
  });
  g.globalCompositeOperation = 'source-over';

  const ramp = ['#241256', '#3f2294', '#6a40c9', '#9a74f6', '#c9a9ff', '#ecd5ff', '#fff0fb'];
  const pickColor = (t: number) => {
    const f = Math.max(0, Math.min(0.9999, t)) * (ramp.length - 1);
    return ramp[Math.floor(f + (r() < f % 1 ? 1 : 0))];
  };
  const leaf = (x: number, y: number, size: number, ang: number, col: string) => {
    g.save();
    g.translate(X(x), X(y));
    g.rotate(ang);
    const h = X(size), w = X(size * 0.46);
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, -h);
    g.quadraticCurveTo(w, -h * 0.25, 0, h);
    g.quadraticCurveTo(-w, -h * 0.25, 0, -h);
    g.fill();
    g.restore();
  };
  // blobs of the canopy: [dx from the trunk, y, radius x, radius y, leaves]
  const blobs: [number, number, number, number, number][] = [
    [-0.44, 0.30, 0.26, 0.17, 1700], [0.44, 0.26, 0.27, 0.18, 1700], [-0.18, 0.19, 0.34, 0.20, 2300], [0.20, 0.17, 0.34, 0.21, 2300],
    [0.0, 0.07, 0.40, 0.19, 2400], [0.0, 0.26, 0.38, 0.17, 1800], [-0.58, 0.18, 0.17, 0.13, 800], [0.60, 0.14, 0.17, 0.13, 800], [0.0, -0.06, 0.34, 0.14, 1200],
  ];
  const light = { x: -0.52, y: -0.85 };
  for (let b = 0; b < blobs.length; b++) {
    const [dx, cy, rx, ry, n] = blobs[b];
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const rad = Math.sqrt(r());
      const nx = Math.cos(a) * rad, ny = Math.sin(a) * rad;
      const x = TREE_X + dx + nx * rx, y = cy + ny * ry;
      const lit = (nx * light.x + ny * light.y) * 0.5 + 0.5;
      const edgeFade = 1 - rad * rad * 0.55;
      if (rad > 0.86 && r() < 0.5) continue; // ragged edges
      const t = lit * 0.78 * edgeFade + (r() - 0.35) * 0.42 + (y < 0.18 ? 0.10 : 0) + (b % 2) * 0.03;
      leaf(x, y, 0.016 + r() * 0.020, r() * 6.28, pickColor(t));
    }
    if (b % 3 === 2) await tick();
  }
  // a soft screen of moonlight on the upper-left of the canopy
  g.globalCompositeOperation = 'screen';
  const ml = g.createRadialGradient(X(TREE_X - 0.35), X(0.04), 0, X(TREE_X - 0.35), X(0.04), X(0.5));
  ml.addColorStop(0, 'rgba(255,225,255,0.20)');
  ml.addColorStop(1, 'rgba(255,225,255,0)');
  g.fillStyle = ml;
  g.fillRect(0, 0, X(GARDEN_W), X(0.6));
  g.globalCompositeOperation = 'source-over';
  await tick();

  /* --- two lounge chairs (mid-century style, cushions with thickness, far-side frame behind) --- */
  const chair = (cx: number, base: number, s: number, flip: boolean, hue: number) => {
    g.save();
    g.translate(X(cx), X(base));
    g.scale(flip ? -s : s, s);
    const u = X(0.1);
    const poly = (pts: number[][], fill: string | CanvasGradient) => {
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x * u, y * u) : g.moveTo(x * u, y * u)));
      g.closePath();
      g.fillStyle = fill;
      g.fill();
    };
    const bar = (x0: number, y0: number, x1: number, y1: number, w: number, col: string) => {
      g.strokeStyle = col;
      g.lineWidth = w * u;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x0 * u, y0 * u);
      g.lineTo(x1 * u, y1 * u);
      g.stroke();
    };
    const lin = (y0: number, y1: number, stops: [number, string][]) => {
      const gr = g.createLinearGradient(0, y0 * u, 0, y1 * u);
      stops.forEach(([o, c]) => gr.addColorStop(o, c));
      return gr;
    };
    const wood = '#4a2640', woodDark = '#1f0e26', woodHi = '#c98f9c';

    g.fillStyle = 'rgba(4,1,14,0.66)';
    g.beginPath();
    g.ellipse(0.15 * u, 0.07 * u, 1.65 * u, 0.30 * u, 0, 0, 6.28);
    g.fill();

    // far side of the frame (in shadow)
    bar(-0.55, -0.72, -0.64, 0.02, 0.10, woodDark);
    bar(0.92, -0.64, 1.00, 0.02, 0.10, woodDark);
    bar(-0.85, -1.18, 0.92, -1.08, 0.075, woodDark);

    // back cushion: dark side first (thickness), then the lit face
    g.save();
    g.translate(-0.95 * u, -0.78 * u);
    g.rotate(-0.34);
    g.fillStyle = `hsl(${hue},55%,30%)`;
    g.beginPath();
    g.roundRect(-0.02 * u, -1.15 * u, 0.62 * u, 1.18 * u, 0.22 * u);
    g.fill();
    g.fillStyle = lin(-1.15, 0, [[0, `hsl(${hue},100%,90%)`], [0.5, `hsl(${hue},82%,68%)`], [1, `hsl(${hue},62%,46%)`]]);
    g.beginPath();
    g.roundRect(-0.10 * u, -1.15 * u, 0.62 * u, 1.18 * u, 0.22 * u);
    g.fill();
    g.strokeStyle = `hsla(${hue},100%,96%,0.8)`;
    g.lineWidth = u * 0.035;
    g.beginPath();
    g.moveTo(-0.02 * u, -1.06 * u);
    g.lineTo(0.36 * u, -1.06 * u);
    g.stroke();
    g.strokeStyle = 'rgba(30,10,70,0.35)';          // button tufting
    g.lineWidth = u * 0.02;
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      g.moveTo(0.02 * u, (-0.30 - k * 0.30) * u);
      g.lineTo(0.40 * u, (-0.30 - k * 0.30) * u);
      g.stroke();
    }
    g.restore();

    // seat cushion: front face, then the lit top
    poly([[-0.80, -0.70], [1.06, -0.66], [1.06, -0.46], [-0.80, -0.50]], lin(-0.7, -0.46, [[0, `hsl(${hue},66%,52%)`], [1, `hsl(${hue},58%,30%)`]]));
    poly([[-0.95, -0.88], [0.86, -0.84], [1.08, -0.67], [-0.80, -0.71]], lin(-0.88, -0.67, [[0, `hsl(${hue},100%,88%)`], [1, `hsl(${hue},84%,66%)`]]));
    g.strokeStyle = `hsla(${hue},100%,96%,0.85)`;
    g.lineWidth = u * 0.03;
    g.beginPath();
    g.moveTo(-0.80 * u, -0.705 * u);
    g.lineTo(1.07 * u, -0.665 * u);
    g.stroke();

    // near side of the frame (lit)
    bar(-0.72, -0.50, -0.82, 0.03, 0.12, wood);
    bar(0.98, -0.46, 1.04, 0.03, 0.12, wood);
    bar(-0.72, -0.50, -0.80, -0.10, 0.03, woodHi);
    bar(-0.80, -1.12, 1.04, -1.00, 0.095, wood);
    bar(-0.80, -1.16, 1.02, -1.04, 0.025, woodHi);
    bar(0.98, -1.00, 0.98, -0.52, 0.10, wood);
    bar(0.94, -1.00, 0.94, -0.52, 0.022, woodHi);
    g.restore();
  };
  chair(TREE_X - 0.18, GROUND_Y + 0.215, 1.04, false, 262);
  chair(TREE_X + 0.18, GROUND_Y + 0.262, 1.16, true, 268);
  await tick();

  /* --- fade the right edge into the lake (so the sprite never has a hard edge) --- */
  g.globalCompositeOperation = 'destination-out';
  const fr = g.createLinearGradient(X(GARDEN_W * 0.80), 0, X(GARDEN_W), 0);
  fr.addColorStop(0, 'rgba(0,0,0,0)');
  fr.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = fr;
  g.fillRect(0, 0, X(GARDEN_W), X(GARDEN_H));
  const fl = g.createLinearGradient(0, 0, X(0.25), 0);
  fl.addColorStop(0, 'rgba(0,0,0,1)');
  fl.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = fl;
  g.fillRect(0, 0, X(0.25), X(GARDEN_H));
  g.globalCompositeOperation = 'source-over';
  return cv;
}

/* tileable strip of tall grass for the very front (2048 x 256) */
function paintGrass(): HTMLCanvasElement {
  const W = 2048, Hh = 256;
  const cv = mkCanvas(W, Hh);
  const g = cv.getContext('2d')!;
  const r = rng(77);
  const layers = [
    { n: 520, h: [60, 150], w: [3, 6], cols: ['#0b0620', '#120a2c', '#1a0f3d'], tip: 0.02 },
    { n: 420, h: [90, 210], w: [3, 7], cols: ['#150c33', '#221350', '#2f1d6b'], tip: 0.06 },
    { n: 260, h: [120, 240], w: [4, 8], cols: ['#1f1248', '#3a2486', '#5236b0'], tip: 0.16 },
  ];
  for (const L of layers) {
    for (let i = 0; i < L.n; i++) {
      const x = r() * W;
      const h = L.h[0] + r() * (L.h[1] - L.h[0]);
      const w = L.w[0] + r() * (L.w[1] - L.w[0]);
      const lean = (r() - 0.5) * 60;
      const col = L.cols[Math.floor(r() * L.cols.length)];
      for (const ox of [0, -W, W]) {
        if (ox !== 0 && Math.abs(x + ox - W / 2) > W / 2 + 80) continue;
        const gr = g.createLinearGradient(0, Hh, 0, Hh - h);
        gr.addColorStop(0, col);
        gr.addColorStop(1, r() < L.tip ? '#b89cff' : col);
        g.fillStyle = gr;
        g.beginPath();
        g.moveTo(x + ox - w, Hh + 4);
        g.quadraticCurveTo(x + ox + lean * 0.3, Hh - h * 0.55, x + ox + lean, Hh - h);
        g.quadraticCurveTo(x + ox + lean * 0.5 + w * 0.5, Hh - h * 0.5, x + ox + w, Hh + 4);
        g.fill();
      }
    }
  }
  const sh = g.createLinearGradient(0, Hh * 0.55, 0, Hh);
  sh.addColorStop(0, 'rgba(6,2,16,0)');
  sh.addColorStop(1, 'rgba(6,2,16,0.85)');
  g.fillStyle = sh;
  g.fillRect(0, 0, W, Hh);
  return cv;
}

function paintGlow(): HTMLCanvasElement {
  const cv = mkCanvas(64, 64);
  const g = cv.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,240,200,1)');
  gr.addColorStop(0.16, 'rgba(255,218,150,0.62)');
  gr.addColorStop(0.5, 'rgba(255,190,120,0.14)');
  gr.addColorStop(1, 'rgba(255,190,120,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return cv;
}

function paintPetal(): HTMLCanvasElement {
  const cv = mkCanvas(32, 32);
  const g = cv.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 32, 32);
  gr.addColorStop(0, '#ffe9ff');
  gr.addColorStop(1, '#a98bff');
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(16, 2);
  g.quadraticCurveTo(30, 12, 16, 30);
  g.quadraticCurveTo(2, 12, 16, 2);
  g.fill();
  return cv;
}

/* ------------------------------------------------------------------------------------------------ the scene */

export function createContactScene(canvas: HTMLCanvasElement, opts: Opts = {}): ContactScene | null {
  const gl = (canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false }) ||
    canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
  if (!gl) return null;

  const lowPower = !!opts.lowPower;
  const MAX_DPR = lowPower ? 1.25 : 1.6;
  let quality = lowPower ? 0.8 : 1;
  let W = 2, Hh = 2, a = 1;
  let mobile = false;
  let pan = 0;
  let destroyed = false;
  let ready = false;
  let raf = 0;
  let running = false;
  let lastT = 0;
  let slow = 0;
  const t0 = performance.now();

  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('contact scene shader:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  };
  const program = (vs: string, fs: string) => {
    const v = compile(gl.VERTEX_SHADER, vs), f = compile(gl.FRAGMENT_SHADER, fs);
    if (!v || !f) return null;
    const p = gl.createProgram()!;
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
    return p;
  };
  const lakeP = program(VERT_FULL, FRAG_LAKE);
  const spriteP = program(VERT_SPRITE, FRAG_SPRITE);
  if (!lakeP || !spriteP) return null;

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const loc = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);
  const L = {
    res: loc(lakeP, 'uRes'), time: loc(lakeP, 'uTime'), cam: loc(lakeP, 'uCam'), hz: loc(lakeP, 'uHz'),
    mx: loc(lakeP, 'uMoonX'), my: loc(lakeP, 'uMoonY'), low: loc(lakeP, 'uLow'),
  };
  const S = {
    rect: loc(spriteP, 'uRect'), res: loc(spriteP, 'uRes'), rot: loc(spriteP, 'uRot'),
    tex: loc(spriteP, 'uTex'), uv: loc(spriteP, 'uUv'), tint: loc(spriteP, 'uTint'),
  };

  const makeTex = (src: HTMLCanvasElement, repeat: boolean) => {
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  let texGarden: WebGLTexture | null = null;
  let texGrass: WebGLTexture | null = null;
  let texGlow: WebGLTexture | null = null;
  let texPetal: WebGLTexture | null = null;

  /* ---- fireflies and petals (positions in world H units) ---- */
  type Fly = { x: number; y: number; f: number; ph: number; sp: number; s: number; a: number };
  const flies: Fly[] = [];
  type Petal = { x: number; y: number; v: number; ph: number; s: number; r: number };
  const petals: Petal[] = [];
  const buildLife = () => {
    flies.length = 0;
    petals.length = 0;
    const rr = rng(3);
    const n = lowPower ? 12 : 22;
    for (let i = 0; i < n; i++) {
      const garden = i % 3 !== 0;
      flies.push({
        x: garden ? geo.treeWX + (rr() - 0.5) * 2.2 : (rr() - 0.5) * 3.2 * Math.max(1, a * 0.8) + 0.2,
        y: 0.28 + rr() * 0.66,
        f: 0.85 + rr() * 0.5,
        ph: rr() * 6.28,
        sp: 0.04 + rr() * 0.09,
        s: 0.016 + rr() * 0.030,
        a: rr() * 6.28,
      });
    }
    for (let i = 0; i < (lowPower ? 7 : 13); i++) {
      petals.push({ x: geo.treeWX + (rr() - 0.5) * 1.1, y: rr() * 0.9, v: 0.016 + rr() * 0.03, ph: rr() * 6.28, s: 0.011 + rr() * 0.012, r: rr() * 6.28 });
    }
  };

  /* ---- geometry that depends on the layout ---- */
  const geo = { treeSX: 0.26, D: 1.6, treeWX: -1.9, gTop: 0, gScale: 1, grassH: 0.2, grassBottom: 1, hz: 0.56 };
  const computeGeo = () => {
    geo.hz = 0.56;
    if (mobile) {
      geo.gScale = 0.50;
      geo.gTop = -0.035;
      geo.treeSX = 0.5 * a;
      geo.grassH = 0.13;
      geo.grassBottom = 0.50;
    } else {
      geo.gScale = 1;
      geo.gTop = 0;
      geo.treeSX = 0.26 * a;
      geo.grassH = 0.17;
      geo.grassBottom = 1.0;
    }
    geo.D = geo.treeSX + (mobile ? 1.1 : 1.3) * geo.gScale + 0.2;
    geo.treeWX = geo.treeSX - 0.5 * a - geo.D;
  };

  const resize = () => {
    const cssW = canvas.clientWidth || window.innerWidth;
    const cssH = canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR) * quality;
    W = Math.max(2, Math.round(cssW * dpr));
    Hh = Math.max(2, Math.round(cssH * dpr));
    if (canvas.width !== W || canvas.height !== Hh) {
      canvas.width = W;
      canvas.height = Hh;
    }
    a = W / Hh;
    computeGeo();
  };

  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  const sprite = (tex: WebGLTexture, x: number, y: number, w: number, h: number, uv: [number, number, number, number], tint: [number, number, number, number], rot = 0) => {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform4f(S.rect, x, y, w, h);
    gl.uniform4f(S.uv, uv[0], uv[1], uv[2], uv[3]);
    gl.uniform4f(S.tint, tint[0], tint[1], tint[2], tint[3]);
    gl.uniform1f(S.rot, rot);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  const draw = (now: number) => {
    const t = (now - t0) / 1000;
    const cam = -geo.D * pan;
    gl.viewport(0, 0, W, Hh);

    /* the lake (skipped on the half of the screen that the panel fully covers once we have arrived) */
    gl.disable(gl.BLEND);
    gl.useProgram(lakeP);
    gl.uniform2f(L.res, W, Hh);
    gl.uniform1f(L.time, reduceStill ? 3.0 : t);
    gl.uniform1f(L.cam, cam);
    gl.uniform1f(L.hz, geo.hz);
    gl.uniform1f(L.mx, 0.23 * a);
    gl.uniform1f(L.my, 0.215);
    gl.uniform1f(L.low, lowPower || quality < 0.85 ? 1 : 0);
    const half = !mobile && pan > 0.995 && coverRight;
    if (half) {
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(0, 0, Math.ceil(W * 0.52), Hh);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (half) gl.disable(gl.SCISSOR_TEST);

    if (!texGarden || !texGrass || !texGlow || !texPetal) return;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(spriteP);
    gl.uniform2f(S.res, W, Hh);
    gl.uniform1i(S.tex, 0);
    gl.activeTexture(gl.TEXTURE0);

    /* the garden: tree, chairs, rocks, meadow */
    const U = Hh;
    const gw = GARDEN_W * geo.gScale * U, gh = GARDEN_H * geo.gScale * U;
    const gcx = (geo.treeWX - cam + 0.5 * a) * U;
    const gx = gcx - TREE_X * geo.gScale * U;
    const gy = geo.gTop * U;
    if (gx < W && gx + gw > 0) sprite(texGarden, gx, gy, gw, gh, [1, 1, 0, 0], [1, 1, 1, 1]);

    /* life: fireflies (additive) */
    gl.blendFunc(gl.ONE, gl.ONE);
    for (let i = 0; i < flies.length; i++) {
      const f = flies[i];
      if (!reduceStill) {
        f.a += Math.sin(t * 0.5 + f.ph) * 0.02;
        f.x += Math.cos(f.a) * f.sp * 0.016;
        f.y += Math.sin(f.a * 1.3) * f.sp * 0.010;
      }
      const yy = mobile ? Math.min(f.y, 0.46) : f.y;
      const sx = (f.x - cam * f.f + 0.5 * a) * U;
      if (sx < -60 || sx > W + 60) continue;
      const pulse = 0.35 + 0.65 * Math.abs(Math.sin(t * (0.7 + f.sp * 6) + f.ph));
      const sz = f.s * U * (0.8 + pulse * 0.5) * (mobile ? 0.8 : 1);
      sprite(texGlow, sx - sz, yy * U - sz, sz * 2, sz * 2, [1, 1, 0, 0], [1, 1, 1, 0.95 * pulse]);
    }
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    /* falling petals near the tree */
    for (let i = 0; i < petals.length; i++) {
      const p = petals[i];
      if (!reduceStill) {
        p.y += p.v * 0.016;
        if (p.y > (mobile ? 0.5 : 1.0)) {
          p.y = -0.02;
          p.x = geo.treeWX + (Math.random() - 0.5) * 1.1;
        }
      }
      const sx = (p.x + Math.sin(t * 0.6 + p.ph) * 0.05 - cam + 0.5 * a) * U;
      if (sx < -40 || sx > W + 40) continue;
      const sz = p.s * U * geo.gScale;
      sprite(texPetal, sx - sz / 2, p.y * U * (mobile ? 1 : 1) - sz / 2, sz, sz * 1.2, [1, 1, 0, 0], [0.9, 0.85, 1, 0.8], p.r + t * 0.4 + Math.sin(t + p.ph));
    }

    /* grass in front, moving a little faster than the garden (parallax) */
    const gH = geo.grassH * U;
    const tileW = gH * 8;
    const gyy = geo.grassBottom * U - gH;
    sprite(texGrass, 0, gyy, W, gH, [W / tileW, 1, (cam * 1.3 * U) / tileW, 0], [1, 1, 1, 1]);
  };

  const reduceStill = !!opts.reduceMotion;
  let coverRight = false;

  /* ---- the loop ---- */
  const minDt = lowPower ? 30 : 15;
  const loop = (now: number) => {
    if (!running || destroyed) return;
    raf = requestAnimationFrame(loop);
    const dt = now - lastT;
    if (dt < minDt) return;
    lastT = now;
    draw(now);
    /* if the device cannot keep up, lower the resolution (never raise it again: no flapping) */
    if (dt > (lowPower ? 55 : 28) && quality > 0.55) {
      if (++slow > 24) {
        slow = 0;
        quality = Math.max(0.55, quality - 0.12);
        resize();
        buildLifeSoon();
      }
    } else slow = Math.max(0, slow - 1);
  };
  const buildLifeSoon = () => buildLife();

  const start = () => {
    if (running || destroyed || reduceStill) {
      if (reduceStill && ready) draw(performance.now());
      return;
    }
    running = true;
    lastT = 0;
    raf = requestAnimationFrame(loop);
  };
  const stop = () => {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  /* ---- build the art in small pieces so the page never freezes ---- */
  (async () => {
    resize();
    const texH = Math.min(1100, Math.max(700, Math.round(Math.min(window.innerHeight * Math.min(window.devicePixelRatio || 1, 1.5), 1100)))) * (lowPower ? 0.8 : 1);
    const garden = await paintGarden(texH);
    if (destroyed) return;
    texGarden = makeTex(garden, false);
    await tick();
    texGrass = makeTex(paintGrass(), true);
    texGlow = makeTex(paintGlow(), false);
    texPetal = makeTex(paintPetal(), false);
    buildLife();
    ready = true;
    draw(performance.now());
    opts.onReady?.();
    if (running || reduceStill) draw(performance.now());
  })();

  const onLost = (e: Event) => {
    e.preventDefault();
    stop();
  };
  canvas.addEventListener('webglcontextlost', onLost);

  return {
    setPan(p: number) {
      pan = ease(Math.max(0, Math.min(1, p)));
      coverRight = p >= 0.999;
      if (ready && (reduceStill || !running)) draw(performance.now());
    },
    setMobile(m: boolean) {
      if (mobile === m) return;
      mobile = m;
      computeGeo();
      if (ready) buildLife();
    },
    start,
    stop,
    resize() {
      resize();
      if (ready) draw(performance.now());
    },
    renderOnce() {
      if (ready) draw(performance.now());
    },
    destroy() {
      destroyed = true;
      stop();
      canvas.removeEventListener('webglcontextlost', onLost);
      try {
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      } catch {
        /* ignore */
      }
    },
  };
}
