'use client';
import * as THREE from 'three';
import gsap from 'gsap';
import { RingScene, rawHex } from './RingScene';
import { fsVert, compFrag } from './shaders';
import { TECHS, CATEGORY_COLOR, DEFAULT_ACCENT, type Category } from '@/components/stack/data';
import { setState, getState } from '../lib/store';

export type Mode = 'off' | 'portal' | 'ring';
const WHEEL_TURNS = 7.5e-5;           // turns per wheel px
const DRAG_MOUSE = 2.2, DRAG_TOUCH = 5, DRAG_BASE = 0.05;

class World {
  canvas!: HTMLCanvasElement; renderer!: THREE.WebGLRenderer; ring!: RingScene;
  private rt!: THREE.WebGLRenderTarget; private compScene = new THREE.Scene(); private compMat!: THREE.ShaderMaterial; private compCam = new THREE.Camera();
  mode: Mode = 'off'; private raf = 0; private last = 0; private clock = 0; mobile = false; private dpr = 1;
  private ringReady: Promise<void> | null = null; private w = 1; private h = 1;
  alpha = { v: 1 }; expanded = false;
  /** while the page lifts away the scene sits small inside the uncovered window (winH = its height as a fraction of the screen, open 0..1 = how far it has grown) */
  private portal = { open: 1, winH: 1 };
  private el: HTMLElement | null = null; private pointer = { x: -1, y: -1, inside: false, lx: -1, ly: -1 };
  private drag: null | { id: number; x0: number; y0: number; lx: number; ly: number; t0: number; axis: 'x' | 'y' | null; moved: number; touch: boolean; v: number; lt: number } = null;
  onOpen?: (techIdx: number, rect: { x: number; y: number; w: number; h: number }) => void;
  uiBlocked = false;

  mount(canvas: HTMLCanvasElement) {
    if (this.canvas === canvas) return; this.canvas = canvas;
    (window as any).__world = this; if (/nolag/.test(location.search)) gsap.ticker.lagSmoothing(0);
    this.mobile = window.matchMedia('(max-width: 768px)').matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, premultipliedAlpha: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0); this.renderer.autoClear = true; this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.rt = new THREE.WebGLRenderTarget(4, 4, { samples: this.mobile ? 2 : 4, depthBuffer: true });
    this.compMat = new THREE.ShaderMaterial({
      vertexShader: fsVert, fragmentShader: compFrag, depthTest: false, depthWrite: false,
      uniforms: { tScene: { value: this.rt.texture }, uRes: { value: new THREE.Vector2(1, 1) }, uWinH: { value: 1 }, uOpen: { value: 1 }, uVig: { value: 0.88 }, uAlpha: { value: 1 } }
    });
    this.compScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compMat));
    window.addEventListener('resize', this.onResize); this.onResize();
    window.addEventListener('pointermove', this.onWindowMove, { passive: true });
    window.addEventListener('keydown', this.onKey);
  }

  ensureRing(): Promise<void> {
    if (this.ringReady) return this.ringReady;
    this.ring = new RingScene(this.renderer, this.mobile);
    this.ring.onActive = (i) => setState({ active: i });
    this.ring.onHover = (vi) => setState({ hovered: vi }); this.ring.onHoverEnd = () => setState({ hovered: -1 });
    let lastHex = ''; const root = document.documentElement;
    this.ring.onAccent = (c) => { const hex = rawHex(c); if (hex !== lastHex) { lastHex = hex; root.style.setProperty('--sr-accent', hex);  
     document.documentElement.style.setProperty('--sr-accent', hex);} };
    this.ringReady = this.ring.init(this.mobile ? 'low' : 'high').then(() => { this.applyFilter(getState().filter, true); this.onResize(); });
    return this.ringReady;
  }

  // ───────── modes ─────────
  setMode(m: Mode) {
    this.mode = m;
    this.canvas.style.visibility = m === 'off' ? 'hidden' : 'visible';
    if (m === 'off') { cancelAnimationFrame(this.raf); this.raf = 0; return; }
    if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(this.frame); }
  }
  setPortal(open: number, winH: number) { this.portal.open = open; this.portal.winH = winH; }
  /** arriving on /stack directly (no portal): approach shot + fade in */
  enterDirect() {
    this.portal.open = 1; this.portal.winH = 1; this.expanded = false; this.ring.approach = 0; this.alpha.v = 0;
    gsap.to(this.alpha, { v: 1, duration: 0.9, ease: 'power1.out' });
    gsap.to(this.ring, { approach: 1, duration: 2.4, ease: 'power3.inOut', onComplete: () => setState({ introPlayed: true }) });
  }
  enterFromPortal() { this.ring.approach = 1; this.alpha.v = 1; this.portal.open = 1; this.portal.winH = 1; this.expanded = true; setState({ introPlayed: true }); }
  fadeOut(d = 0.6, done?: () => void) { gsap.to(this.alpha, { v: 0, duration: d, ease: 'power1.inOut', onComplete: () => { done?.(); } }); }
  fadeIn(d = 0.8) { this.ring.approach = 1; this.portal.open = 1; this.portal.winH = 1; gsap.to(this.alpha, { v: 1, duration: d, ease: 'power1.out' }); }

  // ───────── filter ─────────
  applyFilter(cat: Category | null, silent = false) {
    if (!this.ring) return;
    const list = TECHS.map((t, i) => [t, i] as const).filter(([t]) => !cat || t.category === cat).map(([, i]) => i);
    this.ring.setVisible(list); this.ring.setBaseAccent(cat ? CATEGORY_COLOR[cat] : null);
    setState({ count: list.length, active: 0, hovered: -1 });
  }

  // ───────── input (attached to the full-screen input layer) ─────────
  attachInput(el: HTMLElement | null) {
    if (this.el) { const o = this.el; o.removeEventListener('wheel', this.onWheel); o.removeEventListener('pointerdown', this.onDown); o.removeEventListener('pointermove', this.onMove); o.removeEventListener('pointerup', this.onUp); o.removeEventListener('pointercancel', this.onUp); o.removeEventListener('pointerleave', this.onLeave); }
    this.el = el; if (!el) return;
    el.addEventListener('wheel', this.onWheel, { passive: false }); el.addEventListener('pointerdown', this.onDown); el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp); el.addEventListener('pointercancel', this.onUp); el.addEventListener('pointerleave', this.onLeave);
  }
  private onWheel = (e: WheelEvent) => {
    if (!this.ring || this.mode !== 'ring') return; e.preventDefault();
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    const px = e.deltaMode === 1 ? d * 16 : e.deltaMode === 2 ? d * innerHeight : d;
    this.ring.nudge(px * WHEEL_TURNS * 1.0);
  };
  private onDown = (e: PointerEvent) => {
    if (!this.ring || this.mode !== 'ring' || (e.pointerType === 'mouse' && e.button !== 0)) return;
    this.el!.setPointerCapture(e.pointerId);
    this.drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY, t0: performance.now(), axis: null, moved: 0, touch: e.pointerType !== 'mouse', v: 0, lt: performance.now() };
    this.pointer.x = e.clientX; this.pointer.y = e.clientY; this.pointer.inside = true;
    this.ring.dragging = true;
  };
  private onMove = (e: PointerEvent) => {
    this.pointer.x = e.clientX; this.pointer.y = e.clientY; this.pointer.inside = true;
    const d = this.drag; if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.lx, dy = e.clientY - d.ly; d.moved = Math.max(d.moved, Math.hypot(e.clientX - d.x0, e.clientY - d.y0));
    if (!d.axis && d.moved > 8) d.axis = Math.abs(e.clientX - d.x0) >= Math.abs(e.clientY - d.y0) ? 'x' : 'y';
    if (d.axis) {
      if (d.touch && this.ring.hoveredSlot !== -1) this.ring.setHover(null);
      const delta = d.axis === 'x' ? dx : -dy; const turns = (delta / innerWidth) * DRAG_BASE * (d.touch ? DRAG_TOUCH : DRAG_MOUSE);
      this.ring.nudge(-turns, d.touch);
      const now = performance.now(), dt = Math.max(1, now - d.lt); d.v = d.v * 0.6 + ((-turns / dt) * 1000) * 0.4; d.lt = now;
    }
    d.lx = e.clientX; d.ly = e.clientY;
  };
  private onUp = (e: PointerEvent) => {
    const d = this.drag; if (!d || e.pointerId !== d.id) return; this.drag = null; this.ring.dragging = false;
    if (d.moved < 6 && performance.now() - d.t0 < 600) { this.click(e.clientX, e.clientY); return; }
    if (performance.now() - d.lt < 90) this.ring.nudge(d.v * 0.18, d.touch);   // release momentum
    if (d.touch) this.pointer.inside = false;
  };
  private onLeave = () => { if (!this.drag) this.pointer.inside = false; };
  private onWindowMove = (e: PointerEvent) => {
    if (!this.ring || this.mode === 'off') return;
    this.ring.mouse.set((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1));
    this.pointer.lx = e.clientX; this.pointer.ly = e.clientY;
  };
  private onKey = (e: KeyboardEvent) => {
    if (!this.ring || this.mode !== 'ring' || getState().menuOpen) return;
    const cur = Math.round(this.ring.scroll * this.ring.N);
    if (e.key === 'ArrowRight') this.ring.goTo(cur + 1); else if (e.key === 'ArrowLeft') this.ring.goTo(cur - 1);
  };
  private click(cx: number, cy: number) {
    const hit = this.ring.pick((cx / innerWidth) * 2 - 1, -((cy / innerHeight) * 2 - 1));
    if (!hit) { if (this.pointerIsTouch()) this.ring.setHover(null); return; }
    const vi = this.ring.visIdx[hit.slot]; if (vi < 0) return;
    if (this.pointerIsTouch() && this.ring.hoveredSlot !== hit.slot) { this.ring.setHover(hit); return; }
    const rect = this.ring.rectOfSlot(hit.slot, innerWidth, innerHeight);
    this.onOpen?.(this.ring.visible[vi], rect);
  }
  techAt(vi: number) { return this.ring && vi >= 0 ? TECHS[this.ring.visible[vi]] : null; }
  scrubTo(virtual: number) { this.ring?.goTo(virtual); }
  get frontVirtual() { return this.ring ? this.ring.V : 0; }

  // ───────── loop ─────────
  private onResize = () => {
    if (!this.renderer) return; this.w = innerWidth; this.h = innerHeight;
    this.renderer.setPixelRatio(this.dpr); this.renderer.setSize(this.w, this.h, false);
    this.rt.setSize(Math.round(this.w * this.dpr), Math.round(this.h * this.dpr));
    this.compMat.uniforms.uRes.value.set(this.w, this.h);
    this.ring?.resize(this.w, this.h, this.dpr);
  };
  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now; this.clock += dt;
    if (!this.ring || !this.ringReady) return;
    this.ring.frozen = this.mode !== 'ring';
    this.ring.update(dt, this.clock);
    // hover: follow the pointer, but not while the ring is being moved or a menu is open
    const moving = Math.abs(this.ring.scrollTarget - this.ring.scroll) > 0.0025 || !!this.drag?.axis;
    if (!this.pointerIsTouch()) {
      if (this.mode === 'ring' && this.pointer.inside && !moving && !getState().menuOpen)
        this.ring.setHover(this.ring.pick((this.pointer.x / this.w) * 2 - 1, -((this.pointer.y / this.h) * 2 - 1)));
      else if (this.ring.hoveredSlot !== -1) this.ring.setHover(null);
    } else if (moving && this.ring.hoveredSlot !== -1 && !this.drag) this.ring.setHover(null);
    const cu = this.compMat.uniforms; cu.uWinH.value = this.portal.winH; cu.uOpen.value = this.portal.open; cu.uAlpha.value = this.alpha.v;
    this.renderer.setRenderTarget(this.rt); this.renderer.render(this.ring.scene, this.ring.camera);
    this.renderer.setRenderTarget(null); this.renderer.render(this.compScene, this.compCam);
  };
  private pointerIsTouch() { return matchMedia('(pointer: coarse)').matches; }

  dispose() {
    cancelAnimationFrame(this.raf); this.raf = 0; this.attachInput(null);
    window.removeEventListener('resize', this.onResize); window.removeEventListener('pointermove', this.onWindowMove); window.removeEventListener('keydown', this.onKey);
    gsap.killTweensOf(this.alpha); this.ring?.accent.dispose();
    try { this.rt?.dispose(); this.renderer?.dispose(); this.renderer?.forceContextLoss(); } catch { /* already gone */ }
    inst = null;
  }
}

let inst: World | null = null;
export const getWorld = () => (inst ??= new World());
export { DEFAULT_ACCENT };
