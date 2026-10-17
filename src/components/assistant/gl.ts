/* Tiny WebGL1 helper shared by the launcher orb and the big orb.
   One full-screen triangle, one fragment shader, premultiplied-alpha canvas. */

export type Vec3 = [number, number, number];

const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

export function hexToRgb(hex: string): Vec3 {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

export class ShaderCanvas {
  private gl: WebGLRenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  width = 2;
  height = 2;

  constructor(
    private canvas: HTMLCanvasElement,
    fragment: string,
    uniforms: string[]
  ) {
    try {
      this.gl = canvas.getContext('webgl', {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'low-power',
      });
    } catch {
      this.gl = null;
    }
    const gl = this.gl;
    if (!gl) return;
    const vs = this.compile(gl.VERTEX_SHADER, VS);
    const fs = this.compile(gl.FRAGMENT_SHADER, fragment);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    uniforms.forEach((n) => {
      this.loc[n] = gl.getUniformLocation(prog, n);
    });
    gl.clearColor(0, 0, 0, 0);
    this.prog = prog;
  }

  get ok() {
    return !!this.prog;
  }

  private compile(type: number, src: string) {
    const gl = this.gl;
    if (!gl) return null;
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn(gl.getShaderInfoLog(sh));
      return null;
    }
    return sh;
  }

  resize(cssW: number, cssH: number, dpr: number) {
    const w = Math.max(2, Math.round(cssW * dpr));
    const h = Math.max(2, Math.round(cssH * dpr));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.gl?.viewport(0, 0, w, h);
  }

  f(name: string, v: number) {
    this.gl?.uniform1f(this.loc[name] ?? null, v);
  }
  v2(name: string, x: number, y: number) {
    this.gl?.uniform2f(this.loc[name] ?? null, x, y);
  }
  v3(name: string, c: ArrayLike<number>) {
    this.gl?.uniform3f(this.loc[name] ?? null, c[0], c[1], c[2]);
  }

  draw() {
    const gl = this.gl;
    if (!gl || !this.prog) return;
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose() {
    /* No loseContext(): a canvas keeps its context for life, so React
       StrictMode's mount/unmount/mount would otherwise get a dead one. */
    if (this.gl && this.prog) this.gl.deleteProgram(this.prog);
    this.gl = null;
    this.prog = null;
  }
}
