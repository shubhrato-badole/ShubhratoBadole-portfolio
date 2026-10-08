'use client';

import { useEffect, useRef } from 'react';
import styles from './hero.module.css';

type SignalFieldProps = {
  /** The element the canvas should fill and listen for pointer movement on
   *  (in the original file, the canvas's own parent element). */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Hex color, e.g. "#4C6FFF". */
  accent?: string;
  /** Called once if WebGL / the shader can't run here, so the parent can
   *  show a plain gradient instead. */
  onFallback?: () => void;
  /** When false the shader stays idle (e.g. while the intro covers the hero). */
  active?: boolean;
};

export default function SignalField({ containerRef, accent = '#4C6FFF', onFallback, active = true }: SignalFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // keep the latest callback without making the effect below restart when it changes
  const onFallbackRef = useRef(onFallback);
  useEffect(() => {
    onFallbackRef.current = onFallback;
  });

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let gl: WebGLRenderingContext | null = null;
    let glProg: WebGLProgram | null = null;
    let glTried = false;
    const U: Record<string, WebGLUniformLocation | null> = {};
    let running = false;
    let raf = 0;
    const t0 = performance.now();
    let mx = 0.7,
      my = 0.35,
      tx = 0.7,
      ty = 0.35,
      energy = 0,
      lastX = 0,
      lastY = 0,
      lastMove = 0;

    const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
    const FS = [
      '#ifdef GL_FRAGMENT_PRECISION_HIGH',
      'precision highp float;',
      '#else',
      'precision mediump float;',
      '#endif',
      'uniform vec2 u_res;uniform float u_time;uniform vec2 u_mouse;uniform vec3 u_accent;uniform float u_energy;',
      'float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}',
      'float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);',
      ' return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}',
      'float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}',
      'void main(){',
      ' vec2 p=(gl_FragCoord.xy-.5*u_res)/u_res.y;',
      ' vec2 m=(u_mouse-.5*u_res)/u_res.y;',
      ' float t=u_time*.06;',
      ' vec2 d=p-m;float r=length(d);',
      ' float ripple=sin(r*26.-u_time*2.6)*exp(-r*3.2)*.05*(.25+u_energy);',
      ' vec2 q=vec2(fbm(p*1.6+t),fbm(p*1.6+vec2(5.2,1.3)-t));',
      ' float f=fbm(p*1.4+q*1.9+d/(r+.25)*ripple*4.+vec2(0.,t));',
      ' f+=ripple;',
      ' float band=abs(fract(f*11.)-.5);',
      ' float line=smoothstep(.455,.5,band);',
      ' float glow=exp(-r*r*7.);',
      ' vec3 col=mix(vec3(.016,.004,.06),vec3(.07,.035,.17),smoothstep(.25,.85,f));',
      ' col+=vec3(.93,.92,.96)*line*(.05+.05*f);',
      ' col+=u_accent*line*glow*(.9+u_energy);',
      ' col+=u_accent*glow*.12;',
      ' vec2 uv=gl_FragCoord.xy/u_res;',
      ' col*=1.-.55*dot(uv-.5,uv-.5)*1.6;',
      ' gl_FragColor=vec4(col,1.);',
      '}',
    ].join('\n');

    function compile(type: number, src: string): WebGLShader | null {
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

    function hexRgb(h: string): [number, number, number] {
      h = h.replace('#', '');
      return [
        parseInt(h.substr(0, 2), 16) / 255,
        parseInt(h.substr(2, 2), 16) / 255,
        parseInt(h.substr(4, 2), 16) / 255,
      ];
    }

    function initGL() {
      if (!canvas) return;
      try {
        gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
      } catch {
        gl = null;
      }
      const v = gl && compile(gl.VERTEX_SHADER, VS);
      const f = gl && compile(gl.FRAGMENT_SHADER, FS);
      if (!gl || !v || !f) {
        gl = null;
        onFallbackRef.current?.();
        return;
      }
      glProg = gl.createProgram();
      if (!glProg) {
        gl = null;
        onFallbackRef.current?.();
        return;
      }
      gl.attachShader(glProg, v);
      gl.attachShader(glProg, f);
      gl.linkProgram(glProg);
      if (!gl.getProgramParameter(glProg, gl.LINK_STATUS)) {
        gl = null;
        onFallbackRef.current?.();
        return;
      }
      gl.useProgram(glProg);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(glProg, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      ['u_res', 'u_time', 'u_mouse', 'u_accent', 'u_energy'].forEach((n) => {
        U[n] = gl!.getUniformLocation(glProg!, n);
      });
    }

    function size() {
      if (!canvas || !container) return;
      const r = container.getBoundingClientRect();
      const k = (r.width < 700 ? 0.55 : 0.75) * Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(2, Math.round(r.width * k));
      canvas.height = Math.max(2, Math.round(r.height * k));
      if (gl) gl.viewport(0, 0, canvas.width, canvas.height);
    }

    function frame(now: number) {
      if (!gl || !canvas) return;
      const tt = (now - t0) / 1000;
      if (now - lastMove > 2500) {
        tx = 0.5 + 0.28 * Math.sin(tt * 0.35);
        ty = 0.45 + 0.2 * Math.cos(tt * 0.27);
      }
      mx += (tx - mx) * 0.07;
      my += (ty - my) * 0.07;
      energy *= 0.94;
      gl.uniform2f(U.u_res, canvas.width, canvas.height);
      gl.uniform1f(U.u_time, reduce ? 2 : tt);
      gl.uniform2f(U.u_mouse, mx * canvas.width, (1 - my) * canvas.height);
      const a = hexRgb(accent);
      gl.uniform3f(U.u_accent, a[0], a[1], a[2]);
      gl.uniform1f(U.u_energy, Math.min(1, energy));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (running) raf = requestAnimationFrame(frame);
    }

    function startField() {
      if (!glTried) {
        glTried = true;
        initGL();
      }
      if (!gl) return;
      size();
      if (reduce) {
        running = false;
        frame(performance.now());
        return;
      }
      if (!running) {
        running = true;
        raf = requestAnimationFrame(frame);
      }
    }
    function stopField() {
      running = false;
      cancelAnimationFrame(raf);
    }

    function onPointerMove(e: PointerEvent) {
      if (!canvas) return;
      const r = canvas.getBoundingClientRect();
      tx = (e.clientX - r.left) / r.width;
      ty = (e.clientY - r.top) / r.height;
      energy = Math.min(1.5, energy + Math.hypot(e.clientX - lastX, e.clientY - lastY) / 60);
      lastX = e.clientX;
      lastY = e.clientY;
      lastMove = performance.now();
    }

    container.addEventListener('pointermove', onPointerMove);
    window.addEventListener('resize', size);

    let observer: IntersectionObserver | null = null;
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver((entries) => {
        if (reduce) return;
        if (entries[0].isIntersecting) startField();
        else stopField();
      });
      observer.observe(container);
    } else {
      startField();
    }

    return () => {
      stopField();
      container.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('resize', size);
      observer?.disconnect();
    };
  }, [containerRef, accent, active]);

  return <canvas ref={canvasRef} className={styles.field} aria-hidden="true" />;
}