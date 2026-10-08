'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { ShaderCanvas } from './gl';
import { HERO_THEME, parseColor, type HeroTheme } from './theme';
import styles from './assistant.module.css';

export type LauncherHandle = { pulse: () => void };

const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uTime, uHover, uPulse;
uniform vec2 uPtr;
uniform vec3 uC1, uC2, uC3;

void main(){
  vec2 p=(gl_FragCoord.xy*2.-uRes)/min(uRes.x,uRes.y);
  float r=length(p);
  float px=2./min(uRes.x,uRes.y);
  float disc=1.-smoothstep(1.-px*1.6,1.,r);
  float t=uTime;
  vec2 q=p+uPtr*.1;

  vec3 top=mix(vec3(.5,.62,1.),uC2,.35);
  vec3 bot=mix(uC1,uC3,.55);
  vec3 col=mix(bot,top,smoothstep(-.85,.85,q.y));

  float w1=.3*sin(q.x*2.2+t*1.05+.4)+.09*sin(q.x*4.1-t*.8);
  float w2=.24*sin(q.x*1.7-t*.9+2.1)-.1;
  float s1=q.y-w1+.1;
  float s2=q.y-w2-.16;

  vec2 cp=q-vec2(-.1,.14);
  float core=exp(-dot(cp,cp)*(2.5-uHover*.7));
  col+=vec3(1.)*core*(.7+.3*uPulse);

  float below=smoothstep(.05,-.05,s1);
  col=mix(col,mix(col,uC3,.55)*.92,below*.55);
  float below2=smoothstep(.05,-.05,s2);
  col=mix(col,mix(col,uC1,.5)*.9,below2*.4);
  col=mix(col,col*.6+uC1*.2,(1.-smoothstep(0.,.05,abs(s1)))*.5);
  col+=vec3(1.)*(1.-smoothstep(0.,.03,abs(s2)))*.18;

  float rim=smoothstep(.8,1.,r);
  col=mix(col,col*.5,rim*.7);
  float lit=smoothstep(.5,.92,r)*(1.-smoothstep(.92,.995,r))*max(0.,dot(p/max(r,1e-4),vec2(-.7,.7)));
  col+=vec3(1.)*lit*.3;

  gl_FragColor=vec4(col*disc,disc);
}
`;
const NAMES = ['uRes', 'uTime', 'uHover', 'uPulse', 'uPtr', 'uC1', 'uC2', 'uC3'];

type Props = { running: boolean; theme?: HeroTheme };

const LauncherOrb = forwardRef<LauncherHandle, Props>(function LauncherOrb({ running, theme = HERO_THEME }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pulse = useRef(0);
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const loop = useRef<{ start: () => void; stop: () => void }>({ start() {}, stop() {} });

  useImperativeHandle(ref, () => ({
    pulse() {
      pulse.current = 1;
    },
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sc = new ShaderCanvas(canvas, FS, NAMES);
    if (!sc.ok) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const c1 = parseColor(themeRef.current.orbPrimary);
    const c2 = parseColor(themeRef.current.orbAccent);
    const c3 = parseColor(themeRef.current.orbSecondary);
    let t = 1.2, hover = 0, hoverT = 0, px = 0, py = 0, tx = 0, ty = 0;
    let raf = 0;
    let last = performance.now();
    const parent = canvas.parentElement;

    const size = () => {
      sc.resize(canvas.clientWidth, canvas.clientHeight, Math.min(window.devicePixelRatio || 1, 2));
    };
    const paint = () => {
      const th = themeRef.current;
      const n1 = parseColor(th.orbPrimary), n2 = parseColor(th.orbAccent), n3 = parseColor(th.orbSecondary);
      for (let i = 0; i < 3; i++) {
        c1[i] += (n1[i] - c1[i]) * 0.06;
        c2[i] += (n2[i] - c2[i]) * 0.06;
        c3[i] += (n3[i] - c3[i]) * 0.06;
      }
      sc.v2('uRes', sc.width, sc.height);
      sc.f('uTime', t);
      sc.f('uHover', hover);
      sc.f('uPulse', pulse.current);
      sc.v2('uPtr', px, py);
      sc.v3('uC1', c1);
      sc.v3('uC2', c2);
      sc.v3('uC3', c3);
      sc.draw();
    };
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      t += dt;
      hover += (hoverT - hover) * Math.min(1, dt * 8);
      pulse.current *= Math.exp(-dt * 2.2);
      px += (tx - px) * 0.08;
      py += (ty - py) * 0.08;
      paint();
      raf = requestAnimationFrame(frame);
    };
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      tx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / 400));
      ty = Math.max(-1, Math.min(1, -(e.clientY - (r.top + r.height / 2)) / 400));
    };
    const enter = () => (hoverT = 1);
    const leave = () => (hoverT = 0);

    size();
    paint();
    const ro = new ResizeObserver(() => {
      size();
      paint();
    });
    ro.observe(canvas);
    loop.current = {
      start: () => {
        if (reduce || raf) return;
        last = performance.now();
        raf = requestAnimationFrame(frame);
        window.addEventListener('pointermove', onMove);
      },
      stop: () => {
        cancelAnimationFrame(raf);
        raf = 0;
        window.removeEventListener('pointermove', onMove);
      },
    };
    parent?.addEventListener('pointerenter', enter);
    parent?.addEventListener('pointerleave', leave);
    return () => {
      cancelAnimationFrame(raf);
      raf = 0;
      loop.current = { start() {}, stop() {} };
      ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      parent?.removeEventListener('pointerenter', enter);
      parent?.removeEventListener('pointerleave', leave);
      sc.dispose();
    };
  }, []);

  useEffect(() => {
    if (running) loop.current.start();
    else loop.current.stop();
  }, [running]);

  return <canvas ref={canvasRef} className={styles.launcherCanvas} aria-hidden="true" />;
});

export default LauncherOrb;
