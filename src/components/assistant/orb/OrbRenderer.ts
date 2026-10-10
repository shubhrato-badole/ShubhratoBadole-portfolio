import { BLUR_FS, BRIGHT_FS, COMPOSITE_FS, FULLSCREEN_VS, HIST_N, orbFragmentSource } from './shaders';

/** Everything the orb shader needs for one frame. Filled by OrbController. */
export type OrbFrame = {
  time: number;
  flow: number;
  energy: number;
  glow: number;
  loading: number;
  wave: number;
  raw: number;
  ink: number;
  surface: number;
  rotPhase: number;
  domainPhase: number;
  tiltPhase: number;
  histDt: number;
  pal: Float32Array; // 4 x vec3
  hot: Float32Array; // vec3
  comet: Float32Array; // vec3
  hist: Float32Array; // HIST_N
  pointer: [number, number];
};

export type BloomSettings = {
  intensity: number;
  threshold: number;
  smoothing: number;
  glowAlpha: number;
  downscale: number;
};

type Prog = { prog: WebGLProgram; u: Record<string, WebGLUniformLocation | null> };
type Target = { fbo: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number };

const ORB_UNIFORMS = [
  'uTime', 'uFlow', 'uEnergy', 'uGlow', 'uLoading', 'uWave', 'uRaw', 'uInk', 'uSurface', 'uSteps',
  'uRotPhase', 'uDomainPhase', 'uTiltPhase', 'uHistDt', 'uPal', 'uHot', 'uComet', 'uVoiceHist', 'uPointer',
];

export class OrbRenderer {
  ok = false;
  private gl: WebGL2RenderingContext | null = null;
  private orb!: Prog;
  private bright!: Prog;
  private blur!: Prog;
  private comp!: Prog;
  private scene: Target | null = null;
  private bloomA: Target | null = null;
  private bloomB: Target | null = null;
  private vao: WebGLVertexArrayObject | null = null;

  /** canvas size in device pixels (already scaled by renderScale) */
  width = 2;
  height = 2;
  private steps = 48;
  private bloom: BloomSettings;

  constructor(
    private canvas: HTMLCanvasElement,
    private octaves: number,
    bloom: BloomSettings
  ) {
    this.bloom = bloom;
    this.init();
  }

  private init() {
    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = this.canvas.getContext('webgl2', {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'default',
      }) as WebGL2RenderingContext | null;
    } catch {
      gl = null;
    }
    if (!gl) return;
    this.gl = gl;
    const orb = this.program(FULLSCREEN_VS, orbFragmentSource(this.octaves), ORB_UNIFORMS);
    const bright = this.program(FULLSCREEN_VS, BRIGHT_FS, ['uTexture', 'uThreshold', 'uSmoothing']);
    const blur = this.program(FULLSCREEN_VS, BLUR_FS, ['uTexture', 'uDirection', 'uResolution']);
    const comp = this.program(FULLSCREEN_VS, COMPOSITE_FS, ['uScene', 'uBloom', 'uIntensity', 'uGlowAlpha']);
    if (!orb || !bright || !blur || !comp) return;
    this.orb = orb;
    this.bright = bright;
    this.blur = blur;
    this.comp = comp;
    this.vao = gl.createVertexArray();
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    this.ok = true;
    this.allocate();
  }

  private program(vs: string, fs: string, names: string[]): Prog | null {
    const gl = this.gl;
    if (!gl) return null;
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.warn('[orb] shader error:', gl.getShaderInfoLog(sh));
        return null;
      }
      return sh;
    };
    const v = compile(gl.VERTEX_SHADER, vs);
    const f = compile(gl.FRAGMENT_SHADER, fs);
    if (!v || !f) return null;
    const prog = gl.createProgram();
    if (!prog) return null;
    gl.attachShader(prog, v);
    gl.attachShader(prog, f);
    gl.linkProgram(prog);
    gl.deleteShader(v);
    gl.deleteShader(f);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('[orb] link error:', gl.getProgramInfoLog(prog));
      return null;
    }
    const u: Record<string, WebGLUniformLocation | null> = {};
    names.forEach((n) => (u[n] = gl.getUniformLocation(prog, n)));
    return { prog, u };
  }

  private makeTarget(w: number, h: number): Target | null {
    const gl = this.gl;
    if (!gl) return null;
    const tex = gl.createTexture();
    const fbo = gl.createFramebuffer();
    if (!tex || !fbo) return null;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fbo, tex, w, h };
  }

  private freeTarget(t: Target | null) {
    if (!t || !this.gl) return;
    this.gl.deleteTexture(t.tex);
    this.gl.deleteFramebuffer(t.fbo);
  }

  private allocate() {
    this.freeTarget(this.scene);
    this.freeTarget(this.bloomA);
    this.freeTarget(this.bloomB);
    const bw = Math.max(1, Math.floor(this.width / this.bloom.downscale));
    const bh = Math.max(1, Math.floor(this.height / this.bloom.downscale));
    this.scene = this.makeTarget(this.width, this.height);
    this.bloomA = this.makeTarget(bw, bh);
    this.bloomB = this.makeTarget(bw, bh);
  }

  /** css size x devicePixelRatio x renderScale. Re-allocates only when the size really changes. */
  resize(cssW: number, cssH: number, pixelRatio: number, renderScale: number) {
    if (!this.ok) return;
    const w = Math.max(2, Math.round(cssW * pixelRatio * renderScale));
    const h = Math.max(2, Math.round(cssH * pixelRatio * renderScale));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.allocate();
  }

  setSteps(n: number) {
    this.steps = Math.max(12, Math.min(96, Math.round(n)));
  }

  setBloom(b: Partial<BloomSettings>) {
    this.bloom = { ...this.bloom, ...b };
  }

  get lost() {
    return !this.gl || this.gl.isContextLost();
  }

  render(f: OrbFrame) {
    const gl = this.gl;
    if (!gl || !this.ok || gl.isContextLost() || !this.scene || !this.bloomA || !this.bloomB) return;
    gl.bindVertexArray(this.vao);

    /* 1. orb -> scene */
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene.fbo);
    gl.viewport(0, 0, this.scene.w, this.scene.h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const o = this.orb;
    gl.useProgram(o.prog);
    gl.uniform1f(o.u.uTime, f.time);
    gl.uniform1f(o.u.uFlow, f.flow);
    gl.uniform1f(o.u.uEnergy, f.energy);
    gl.uniform1f(o.u.uGlow, f.glow);
    gl.uniform1f(o.u.uLoading, f.loading);
    gl.uniform1f(o.u.uWave, f.wave);
    gl.uniform1f(o.u.uRaw, f.raw);
    gl.uniform1f(o.u.uInk, f.ink);
    gl.uniform1f(o.u.uSurface, f.surface);
    gl.uniform1i(o.u.uSteps, this.steps);
    gl.uniform1f(o.u.uRotPhase, f.rotPhase);
    gl.uniform1f(o.u.uDomainPhase, f.domainPhase);
    gl.uniform1f(o.u.uTiltPhase, f.tiltPhase);
    gl.uniform1f(o.u.uHistDt, f.histDt);
    gl.uniform3fv(o.u.uPal, f.pal);
    gl.uniform3fv(o.u.uHot, f.hot);
    gl.uniform3fv(o.u.uComet, f.comet);
    gl.uniform1fv(o.u.uVoiceHist, f.hist.length === HIST_N ? f.hist : new Float32Array(HIST_N));
    gl.uniform2f(o.u.uPointer, f.pointer[0], f.pointer[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    /* 2. bright pass -> bloomA */
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomA.fbo);
    gl.viewport(0, 0, this.bloomA.w, this.bloomA.h);
    gl.useProgram(this.bright.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.scene.tex);
    gl.uniform1i(this.bright.u.uTexture, 0);
    gl.uniform1f(this.bright.u.uThreshold, this.bloom.threshold);
    gl.uniform1f(this.bright.u.uSmoothing, this.bloom.smoothing);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    /* 3. blur H (A -> B) then V (B -> A) */
    gl.useProgram(this.blur.prog);
    gl.uniform1i(this.blur.u.uTexture, 0);
    gl.uniform2f(this.blur.u.uResolution, this.bloomA.w, this.bloomA.h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomB.fbo);
    gl.bindTexture(gl.TEXTURE_2D, this.bloomA.tex);
    gl.uniform2f(this.blur.u.uDirection, 1, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomA.fbo);
    gl.bindTexture(gl.TEXTURE_2D, this.bloomB.tex);
    gl.uniform2f(this.blur.u.uDirection, 0, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    /* 4. composite -> canvas */
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.comp.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.scene.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.bloomA.tex);
    gl.uniform1i(this.comp.u.uScene, 0);
    gl.uniform1i(this.comp.u.uBloom, 1);
    gl.uniform1f(this.comp.u.uIntensity, this.bloom.intensity);
    gl.uniform1f(this.comp.u.uGlowAlpha, this.bloom.glowAlpha);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
  }

  /** Free GPU objects. The context itself is kept (a canvas can't get a fresh one back). */
  dispose() {
    const gl = this.gl;
    if (!gl) return;
    this.freeTarget(this.scene);
    this.freeTarget(this.bloomA);
    this.freeTarget(this.bloomB);
    [this.orb, this.bright, this.blur, this.comp].forEach((p) => p && gl.deleteProgram(p.prog));
    if (this.vao) gl.deleteVertexArray(this.vao);
    this.scene = this.bloomA = this.bloomB = null;
    this.vao = null;
    this.ok = false;
    this.gl = null;
  }
}
