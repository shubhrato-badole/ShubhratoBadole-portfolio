/**
 * THE CURSOR SMOKE (Work, project pages, and anywhere else that wants it).
 *
 * This is the contact scene's own fluid simulation, the same code that runs on the Intro's name page and loading
 * screen: its shaders, its settings (colour #352d3d, blend 1.5), its 60 Hz step order and the way a mouse move becomes a
 * push of smoke. It runs on plain WebGL 2, so no extra library is needed. Without WebGL 2 it quietly does nothing.
 *
 * It draws on a canvas you give it (a full-screen, pointer-events:none canvas, blended with CSS `screen`).
 * `scope` is a CSS selector: smoke is only pushed while the mouse is over an element matching it, and only drawn
 * inside those elements' visible areas (null = everywhere).
 */

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
/* how the scene draws the smoke over a transparent page: its colour, as bright as the smoke is thick.
   Masked to the scoped sections' visible areas (reg = pairs of top / bottom edges in 0-1, nreg = how many). */
const SMOKE_DISPLAY = `precision highp float;
varying vec2 vUv;
uniform sampler2D tFluid;
uniform vec3 uColor;
uniform float uBlend;
uniform float uIntensity;
uniform vec2 reg[4];
uniform int nreg;
void main() {
  float m = 0.0;
  for (int i = 0; i < 4; i++) {
    if (i >= nreg) break;
    m = max(m, smoothstep(reg[i].y - 0.02, reg[i].y + 0.02, vUv.y) * (1.0 - smoothstep(reg[i].x - 0.02, reg[i].x + 0.02, vUv.y)));
  }
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
  rgb = clamp(rgb, 0.0, 1.0) * m;
  gl_FragColor = vec4(rgb, max(rgb.r, max(rgb.g, rgb.b)));
}`;

export type FluidSmoke = { destroy: () => void }
type SmokeTarget = { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number }
type SmokeSplat = { x: number; y: number; vx: number; vy: number }

/** Starts the smoke on `canvas`. Returns null if WebGL 2 is not available. */
export function createFluidSmoke(canvas: HTMLCanvasElement, opts: { scope?: string | null } = {}): FluidSmoke | null {
  const scope = opts.scope ?? null
  try {
    const touch = window.matchMedia('(hover: none) and (pointer: coarse)').matches
    const DYE = touch ? 128 : 256
    const SIM = touch ? 64 : 96
    const fit = () => {
      canvas.width = Math.max(2, Math.round(window.innerWidth * 0.5)) // the smoke is soft: half resolution is plenty
      canvas.height = Math.max(2, Math.round(window.innerHeight * 0.5))
    }
    fit()
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false })
    if (!gl) return null
    if (gl.isContextLost()) return null
    gl.getExtension('EXT_color_buffer_float')
    gl.getExtension('EXT_color_buffer_half_float')

    /* the canvas belongs to the page (and React may mount / unmount / mount again, as it does in development), so we
       never end its WebGL context: we only free what we created and clear it, and a fresh start can use it again */
    const mine = { shaders: [] as WebGLShader[], progs: [] as WebGLProgram[], texs: [] as WebGLTexture[], fbos: [] as WebGLFramebuffer[] }

    const compile = (type: number, code: string) => {
      const s = gl.createShader(type)!
      mine.shaders.push(s)
      gl.shaderSource(s, code)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader')
      return s
    }
    const vert = compile(gl.VERTEX_SHADER, SMOKE_VERT)
    const program = (frag: string) => {
      const p = gl.createProgram()!
      mine.progs.push(p)
      gl.attachShader(p, vert)
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, frag))
      gl.bindAttribLocation(p, 0, 'aPos')
      gl.linkProgram(p)
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link')
      const cache: Record<string, WebGLUniformLocation | null> = {}
      return { p, u: (n: string) => (n in cache ? cache[n] : (cache[n] = gl.getUniformLocation(p, n))) }
    }
    type Prog = ReturnType<typeof program>
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
    }

    const buf = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const vao = gl.createVertexArray()!
    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.disable(gl.BLEND)

    const target = (w: number, h: number, minFilter: number): SmokeTarget => {
      const tex = gl.createTexture()!
      mine.texs.push(tex)
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null)
      const fbo = gl.createFramebuffer()!
      mine.fbos.push(fbo)
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('float targets unsupported')
      gl.viewport(0, 0, w, h)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      return { tex, fbo, w, h }
    }
    const pair = (w: number, h: number, minFilter: number) => {
      let a = target(w, h, minFilter)
      let b = target(w, h, minFilter)
      return {
        get read() { return a },
        get write() { return b },
        swap() { const t = a; a = b; b = t },
      }
    }
    const dye = pair(DYE, DYE, gl.LINEAR)
    const velocity = pair(SIM, SIM, gl.LINEAR)
    const pressure = pair(SIM, SIM, gl.NEAREST)
    const divergence = target(SIM, SIM, gl.NEAREST)
    const curl = target(SIM, SIM, gl.NEAREST)

    let aspect = window.innerWidth / window.innerHeight
    const activate = (pr: Prog) => {
      gl.useProgram(pr.p)
      gl.uniform2f(pr.u('texelSize'), 1 / (SIM * aspect), 1 / SIM)
    }
    const bind = (pr: Prog, name: string, unit: number, t: WebGLTexture) => {
      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(gl.TEXTURE_2D, t)
      gl.uniform1i(pr.u(name), unit)
    }
    const draw = (t: SmokeTarget | null) => {
      if (t) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo)
        gl.viewport(0, 0, t.w, t.h)
      } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        gl.viewport(0, 0, canvas.width, canvas.height)
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    /* a mouse move becomes a push of smoke (same rule as the scene), only while the mouse is over the scoped sections */
    const splats: SmokeSplat[] = []
    let lx = 0
    let ly = 0
    let seen = false
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      const dx = e.clientX - lx
      const dy = e.clientY - ly
      lx = e.clientX
      ly = e.clientY
      if (!seen) {
        seen = true
        return
      }
      if (scope && !(e.target as Element | null)?.closest?.(scope)) return
      if (Math.abs(dx) < 1.5 && Math.abs(dy) < 1.5) return
      splats.push({ x: e.clientX / window.innerWidth, y: 1 - e.clientY / window.innerHeight, vx: dx * SMOKE.FORCE, vy: -dy * SMOKE.FORCE })
    }
    const onResize = () => {
      fit()
      aspect = window.innerWidth / window.innerHeight
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('resize', onResize)

    /* the visible top / bottom edges (0-1, from the bottom) of every scoped section on screen */
    const regions = () => {
      if (!scope) return [1.05, -0.05]
      const vh = window.innerHeight
      const out: number[] = []
      document.querySelectorAll(scope).forEach((el) => {
        const b = el.getBoundingClientRect()
        if (b.bottom > 0 && b.top < vh && out.length < 8) out.push(1 - b.top / vh, 1 - b.bottom / vh)
      })
      return out
    }

    const step = (rg: number[]) => {
      if (splats.length > SMOKE.MAX_SPLATS) splats.splice(0, splats.length - SMOKE.MAX_SPLATS)
      if (splats.length > 0) {
        activate(P.splat)
        gl.uniform1f(P.splat.u('aspectRatio'), aspect)
        gl.uniform1f(P.splat.u('uRadius'), SMOKE.RADIUS / 100)
        for (let q = splats.length - 1; q >= 0; q--) {
          const s = splats[q]
          gl.uniform2f(P.splat.u('uPointer'), s.x, s.y)
          gl.uniform3f(P.splat.u('uColor'), s.vx, s.vy, 10)
          bind(P.splat, 'uTarget', 0, velocity.read.tex)
          draw(velocity.write)
          velocity.swap()
          bind(P.splat, 'uTarget', 0, dye.read.tex)
          draw(dye.write)
          dye.swap()
          splats.pop()
        }
      }
      activate(P.curl)
      bind(P.curl, 'uVelocity', 0, velocity.read.tex)
      draw(curl)

      activate(P.vorticity)
      gl.uniform1f(P.vorticity.u('dt'), SMOKE.STEP)
      gl.uniform1f(P.vorticity.u('uCurlValue'), SMOKE.CURL)
      bind(P.vorticity, 'uVelocity', 0, velocity.read.tex)
      bind(P.vorticity, 'uCurl', 1, curl.tex)
      draw(velocity.write)
      velocity.swap()

      activate(P.divergence)
      bind(P.divergence, 'uVelocity', 0, velocity.read.tex)
      draw(divergence)

      activate(P.clear)
      gl.uniform1f(P.clear.u('uClearValue'), SMOKE.PRESSURE)
      bind(P.clear, 'uTexture', 0, pressure.read.tex)
      draw(pressure.write)
      pressure.swap()

      activate(P.pressure)
      bind(P.pressure, 'uDivergence', 1, divergence.tex)
      for (let i = 0; i < SMOKE.SWIRL; i++) {
        bind(P.pressure, 'uPressure', 0, pressure.read.tex)
        draw(pressure.write)
        pressure.swap()
      }

      activate(P.gradient)
      bind(P.gradient, 'uPressure', 0, pressure.read.tex)
      bind(P.gradient, 'uVelocity', 1, velocity.read.tex)
      draw(velocity.write)
      velocity.swap()

      activate(P.advection)
      gl.uniform1f(P.advection.u('dt'), SMOKE.STEP)
      gl.uniform1f(P.advection.u('uDissipation'), Math.pow(SMOKE.VELOCITY_DISSIPATION, 1))
      bind(P.advection, 'uVelocity', 0, velocity.read.tex)
      bind(P.advection, 'uSource', 1, velocity.read.tex)
      draw(velocity.write)
      velocity.swap()
      gl.uniform1f(P.advection.u('uDissipation'), Math.pow(SMOKE.DENSITY_DISSIPATION, 1))
      bind(P.advection, 'uVelocity', 0, velocity.read.tex)
      bind(P.advection, 'uSource', 1, dye.read.tex)
      draw(dye.write)
      dye.swap()

      gl.useProgram(P.display.p)
      bind(P.display, 'tFluid', 0, dye.read.tex)
      gl.uniform3f(P.display.u('uColor'), SMOKE.COLOR[0], SMOKE.COLOR[1], SMOKE.COLOR[2])
      gl.uniform1f(P.display.u('uBlend'), SMOKE.BLEND)
      gl.uniform1f(P.display.u('uIntensity'), SMOKE.INTENSITY)
      const padded = rg.slice(0, 8)
      while (padded.length < 8) padded.push(0)
      gl.uniform2fv(P.display.u('reg'), new Float32Array(padded))
      gl.uniform1i(P.display.u('nreg'), rg.length / 2)
      draw(null)
    }

    let raf = 0
    let dead = false
    let last = -1
    let acc = 0
    let idle = 0
    let blank = true
    let shown = true
    const frame = (now: number) => {
      if (dead) return
      raf = requestAnimationFrame(frame)
      if (last >= 0) acc += (now - last) / 1000
      last = now
      if (acc < SMOKE.STEP - 0.001) return
      acc = Math.min(acc - SMOKE.STEP, SMOKE.STEP)
      const rg = regions()
      const visible = rg.length > 0
      if (visible !== shown) {
        shown = visible
        canvas.style.display = visible ? '' : 'none' // not over a smoke section at all: nothing to draw
      }
      if (!visible) return
      gl.bindVertexArray(vao)
      if (splats.length > 0) {
        idle = 0
        blank = false
      } else if (++idle > SMOKE.IDLE_FRAMES) {
        // nothing moved for a while: the smoke has faded, so rest (as the scene does)
        if (!blank) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, null)
          gl.clearColor(0, 0, 0, 0)
          gl.clear(gl.COLOR_BUFFER_BIT)
          blank = true
        }
        return
      }
      step(rg)
    }
    raf = requestAnimationFrame(frame)

    return {
      destroy: () => {
        dead = true
        cancelAnimationFrame(raf)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('resize', onResize)
        canvas.style.display = ''
        if (!gl.isContextLost()) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, null)
          gl.clearColor(0, 0, 0, 0)
          gl.clear(gl.COLOR_BUFFER_BIT) // no frozen smoke frame left on the canvas
          gl.bindVertexArray(null)
          mine.fbos.forEach((f) => gl.deleteFramebuffer(f))
          mine.texs.forEach((x) => gl.deleteTexture(x))
          mine.progs.forEach((x) => gl.deleteProgram(x))
          mine.shaders.forEach((x) => gl.deleteShader(x))
          gl.deleteVertexArray(vao)
          gl.deleteBuffer(buf)
        }
      },
    }
  } catch (e) {
    console.warn('[smoke] unavailable', e)
    return null
  }
}
