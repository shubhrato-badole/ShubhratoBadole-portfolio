import * as THREE from 'three';
import gsap from 'gsap';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { TECHS, CATEGORY_COLOR, TECH_COLOR, DEFAULT_ACCENT, hexToRgb } from '@/components/stack/data';
import { buildAtlas, buildCodeTexture, buildInfoTexture } from './Textures';
import { slabVert, slabFrag, glassVert, glassFrag, floorVert, floorFrag, railVert, railFrag, ceilVert, ceilFrag, partVert, partFrag } from './shaders';

const TAU = Math.PI * 2;
const mod = (a: number, n: number) => ((a % n) + n) % n;
const WINDOW_HALF = 14;
// the scene writes straight to the screen (no sRGB encode), so accents are stored as raw channel values
export const rawColor = (c: THREE.Color, hex: string) => { const h = hex.replace('#', ''); return c.setRGB(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255, THREE.LinearSRGBColorSpace); };
export const rawHex = (c: THREE.Color) => '#' + [c.r, c.g, c.b].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');
const DEFAULT = rawColor(new THREE.Color(), DEFAULT_ACCENT);

/* The glass slab, with the reference's own numbers (its ring config). BORDER_STRENGTH / ACTIVE_BOOST are tuned (reference: 1.1 / 1.4) so the frame
   matches the colours measured on your reference screenshot (neighbour rims ~(130,90,230), active card ~(172,126,241)); raise them for a hotter frame. Colours are linear light: the glass shader encodes to sRGB on output. */
const GLASS = {
  BODY_ALPHA: 0.07, EDGE_ALPHA: 0.72, EDGE_BRIGHT: 0.75, EDGE_TINT: [0.362, 0.142, 0.95], BORDER_COLOR: [0.366, 0.144, 0.96], BORDER_WIDTH: 0.045, BORDER_STRENGTH: 0.95,
  IRIDESCENCE: 0.4, HUE_ROLL: 0.1, SWEEP_SPEED: 0.35, SWEEP_WIDTH: 0.12, SWEEP_STRENGTH: 0.3, FLUTE_COUNT: 22, FLUTE_SHINE: 0.1, FLUTE_DEPTH: 0.9, ACTIVE_BOOST: 0.35, CORNER: 0.07,
  CODE_STRENGTH: 0.025, CODE_SPEED: 0.03, CODE_TINT: [0.85, 0.82, 1], CODE_UV: [1.15, 0.62], CODE_WIDTH: 0.6, ACTIVE_CODE_FADE: 0.6
};

/* ── The reference's accent system (its `Dse` class), ported 1:1 ──
   Every glowing thing (border glow, edge tint, floor rail, ceiling lights, particles) registers its colour. On hover each one tints towards the
   card's colour but KEEPS ITS OWN BRIGHTNESS (the target is scaled so its luminance equals that slot's resting luminance), then eases back with
   'sine.out' (0.35 s in, 0.5 s out). That brightness-preserving tint is what makes the colour change feel rich instead of flashing. */
/** The Stack's resting colour: your site's cobalt (the hero accent). Change this one value to recolour the whole scene. */
export const BASE_HEX = '#4c6fff';
const luma = (c: { r: number; g: number; b: number }) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
type Rep = { lin: THREE.Color; raw: THREE.Color };
export const accentRep = (hex: string): Rep => ({ lin: new THREE.Color().set(hex), raw: rawColor(new THREE.Color(), hex) });
class Accent {
  private slots: { u: THREE.Color; def: THREE.Color; from: THREE.Color; target: THREE.Color; space: 'lin' | 'raw' }[] = [];
  t = 0; private tween: gsap.core.Tween | null = null; private base: Rep | null = null;
  readonly ui = DEFAULT.clone(); private uiFrom = DEFAULT.clone(); private uiTo = DEFAULT.clone();
  onUi?: (c: THREE.Color) => void;
  register(u: THREE.Color, space: 'lin' | 'raw') { this.slots.push({ u, def: u.clone(), from: u.clone(), target: u.clone(), space }); }
  setAccent(rep: Rep | null) { this.go(rep ?? this.base, rep ? 0.35 : 0.5); }
  setBase(rep: Rep | null) { this.base = rep; }
  /** straight to the resting colours (the base), without animation */
  snap() { this.tween?.kill(); this.applyRep(this.base, 1); }
  private applyRep(rep: Rep | null, t: number) {
    for (const s of this.slots) { this.aim(s, rep); s.u.lerpColors(s.from, s.target, t); }
    this.ui.copy(rep ? rep.raw : DEFAULT); this.onUi?.(this.ui);
  }
  private aim(s: { u: THREE.Color; def: THREE.Color; from: THREE.Color; target: THREE.Color; space: 'lin' | 'raw' }, rep: Rep | null) {
    s.from.copy(s.u);
    if (rep) { const c = rep[s.space]; const k = luma(s.def) / Math.max(luma(c), 1e-4); s.target.setRGB(c.r * k, c.g * k, c.b * k, THREE.LinearSRGBColorSpace); } else s.target.copy(s.def);
  }
  private go(rep: Rep | null, dur: number) {
    for (const s of this.slots) this.aim(s, rep);
    this.uiFrom.copy(this.ui); this.uiTo.copy(rep ? rep.raw : DEFAULT);
    this.t = 0; this.tween?.kill();
    this.tween = gsap.to(this, { t: 1, duration: dur, ease: 'sine.out', onUpdate: () => this.apply() });
  }
  private apply() { for (const s of this.slots) s.u.lerpColors(s.from, s.target, this.t); this.ui.lerpColors(this.uiFrom, this.uiTo, this.t); this.onUi?.(this.ui); }
  dispose() { this.tween?.kill(); }
}

export class RingScene {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
  readonly N: number; readonly pitch: number; readonly R: number;
  readonly W = 0.81; readonly H = 1.08; readonly T = 0.055; readonly BAND = 1.15; readonly Y0 = -0.575 - 0.03;
  ring = new THREE.Group();
  slabs!: THREE.InstancedMesh; slabMat!: THREE.ShaderMaterial; aCell!: THREE.InstancedBufferAttribute;
  glassBack!: THREE.InstancedMesh; glassFront!: THREE.InstancedMesh;
  floor!: Reflector; railMat!: THREE.ShaderMaterial; ceilMat!: THREE.ShaderMaterial; partMat!: THREE.ShaderMaterial;
  private inst: THREE.Matrix4[] = [];
  visible: number[] = TECHS.map((_, i) => i);   // project indices currently in the ring
  visIdx: number[] = [];                         // per physical slot → index inside `visible` (or -1)
  scroll = 0; scrollTarget = 0; V = 0; dragging = false; frozen = false; drift = true;
  approach = 1; accent = new Accent();
  mouse = new THREE.Vector2(); private tilt = new THREE.Vector2(); mobile: boolean;
  onActive?: (visibleIdx: number) => void; onAccent?: (c: THREE.Color) => void;
  private lastActive = -1; private time = 0;
  // hover banks (cross-fading so moving card→card never pops)
  private bank = { slot: [-1, -1], hover: [0, 0], info: [0, 0], rip: [0, 0], ptr: [new THREE.Vector2(.5, .5), new THREE.Vector2(.5, .5)] };
  private cur = 0; hoveredSlot = -1;
  private infoCache = new Map<string, THREE.CanvasTexture>();
  private blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  private ready = false; showInfo = true;

  constructor(private renderer: THREE.WebGLRenderer, mobile: boolean) {
    this.mobile = mobile; this.N = mobile ? 32 : 48; this.pitch = TAU / this.N;
    this.accent.onUi = (c) => this.onAccent?.(c);
    this.R = (this.W + 2 * 0.055) / (2 * Math.sin(Math.PI / this.N));
    this.blank.needsUpdate = true;
    this.scene.background = new THREE.Color(0x050507);
    this.scene.add(this.ring);
  }

  async init(quality: 'high' | 'low') {
    const cw = quality === 'high' ? 432 : 288, ch = quality === 'high' ? 576 : 384;
    const [atlas] = await Promise.all([buildAtlas(cw, ch), document.fonts.load('500 24px "IBM Plex Mono"')]);
    const code = buildCodeTexture();
    this.buildSlabs(atlas, code);
    this.buildCeiling(); this.buildRail(); this.buildParticles();
    await this.buildFloor(quality);
    const gm = this.glassFront.material as THREE.ShaderMaterial;
    this.accent.register(gm.uniforms.uBorderGlowColor.value, 'lin'); this.accent.register(gm.uniforms.uEdgeTint.value, 'lin');
    this.accent.register(this.railMat.uniforms.uColor.value, 'raw'); this.accent.register(this.ceilMat.uniforms.uLightColor.value, 'raw');
    this.accent.register(this.partMat.uniforms.uColor.value, 'raw'); this.accent.register(this.partMat.uniforms.uCore.value, 'raw');
    this.accent.setBase(accentRep(BASE_HEX)); this.accent.snap();           // start (and rest) in the site's cobalt
    this.setVisible(this.visible);
    this.ready = true;
  }

  // ───────────────────────── geometry ─────────────────────────
  private buildSlabs(atlas: { texture: THREE.Texture; cols: number; rows: number }, code: THREE.Texture) {
    const { W, H, T, N } = this, bev = 0.012, corner = 0.07;
    const hw = W / 2 - bev, hh = H / 2 - bev, r = corner - bev;
    const s = new THREE.Shape();
    s.moveTo(-hw + r, -hh); s.lineTo(hw - r, -hh); s.absarc(hw - r, -hh + r, r, -Math.PI / 2, 0, false);
    s.lineTo(hw, hh - r); s.absarc(hw - r, hh - r, r, 0, Math.PI / 2, false);
    s.lineTo(-hw + r, hh); s.absarc(-hw + r, hh - r, r, Math.PI / 2, Math.PI, false);
    s.lineTo(-hw, -hh + r); s.absarc(-hw + r, -hh + r, r, Math.PI, Math.PI * 1.5, false);
    const geo = new THREE.ExtrudeGeometry(s, { depth: T - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 3, curveSegments: 14 });
    geo.translate(0, 0, -(T - 2 * bev) / 2);       // centre on z=0; front face at +T/2
    const slot = new Float32Array(N), cell = new Float32Array(N).fill(-1);
    this.aCell = new THREE.InstancedBufferAttribute(cell, 1); this.aCell.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < N; i++) slot[i] = i;
    geo.setAttribute('aSlot', new THREE.InstancedBufferAttribute(slot, 1)); geo.setAttribute('aCell', this.aCell);
    const u = (v: any) => ({ value: v });
    const white = new THREE.Vector2(0.5, 0.5);
    // uniforms shared by the card face and both glass passes (the same objects, so one write updates all three)
    const shared = {
      uTime: u(0), uReflPass: u(0),
      uHoverSlotA: u(-1), uHoverA: u(0), uHoverSlotB: u(-1), uHoverB: u(0),
      uSideFadeStart: u(-0.3), uSideFadeEnd: u(0.05)
    };
    this.slabMat = new THREE.ShaderMaterial({
      vertexShader: slabVert, fragmentShader: slabFrag, side: THREE.FrontSide,
      uniforms: {
        ...shared,
        uAtlas: u(atlas.texture), uGrid: u(new THREE.Vector2(atlas.cols, atlas.rows)), uInset: u(0.004),
        uCode: u(code), uCodeTint: u(new THREE.Color(...(GLASS.CODE_TINT as [number, number, number]))), uCodeUvScale: u(new THREE.Vector2(...(GLASS.CODE_UV as [number, number]))),
        uCodeWidth: u(GLASS.CODE_WIDTH), uCodeStrength: u(GLASS.CODE_STRENGTH), uCodeSpeed: u(GLASS.CODE_SPEED), uActiveCodeFade: u(GLASS.ACTIVE_CODE_FADE),
        uSlab: u(new THREE.Vector2(W, H)), uCorner: u(corner),
        uAccent: u(this.accent.ui),
        uPtrA: u(white.clone()), uRipA: u(0), uPtrB: u(white.clone()), uRipB: u(0),
        uInfoA: u(this.blank), uInfoProgA: u(0), uInfoB: u(this.blank), uInfoProgB: u(0), uInfoOnA: u(0), uInfoOnB: u(0),
        uSideFxStart: u(0.15), uSideFxEnd: u(0.6),
        uSideGrid: u(14), uSideGridStrength: u(0.18), uSideCa: u(0.12), uSideCaStart: u(0.35), uSideSmear: u(0.22), uSideLiquid: u(0.015), uSideLiquidSpeed: u(2),
        uInactiveDim: u(0.72), uActiveBright: u(0.22), uBackDarken: u(0.35),
        uFlute: u(GLASS.FLUTE_COUNT), uFluteShade: u(0.16), uFluteStrength: u(0.016)
      }
    });
    this.slabs = new THREE.InstancedMesh(geo, this.slabMat, N);
    this.slabs.frustumCulled = false;
    // the glass: a back pass (inside faces) then a front pass, drawn over the card face with the reference's slab shader
    const border = new THREE.Color(...(GLASS.BORDER_COLOR as [number, number, number])), edgeTint = new THREE.Color(...(GLASS.EDGE_TINT as [number, number, number]));
    const glassUniforms = () => ({
      ...shared,
      uHalf: u(new THREE.Vector3(W / 2, H / 2, T / 2)),
      uBodyAlpha: u(GLASS.BODY_ALPHA), uEdgeAlpha: u(GLASS.EDGE_ALPHA), uEdgeBright: u(GLASS.EDGE_BRIGHT), uEdgeTint: u(edgeTint),
      uCornerRadius: u(GLASS.CORNER), uBorderGlowColor: u(border), uBorderGlowWidth: u(GLASS.BORDER_WIDTH), uBorderGlow: u(GLASS.BORDER_STRENGTH),
      uIridescence: u(GLASS.IRIDESCENCE), uHueRoll: u(GLASS.HUE_ROLL), uSweepSpeed: u(GLASS.SWEEP_SPEED), uSweepWidth: u(GLASS.SWEEP_WIDTH), uSweepStrength: u(GLASS.SWEEP_STRENGTH),
      uFluteCount: u(GLASS.FLUTE_COUNT), uFluteShine: u(GLASS.FLUTE_SHINE), uFluteDepth: u(GLASS.FLUTE_DEPTH),
      uActiveHalf: u(Math.PI / N), uActiveBoost: u(GLASS.ACTIVE_BOOST)
    });
    const mkGlass = (back: boolean) => new THREE.ShaderMaterial({
      vertexShader: glassVert, fragmentShader: glassFrag, uniforms: glassUniforms(), defines: back ? { BACK_PASS: '' } : {},
      side: back ? THREE.BackSide : THREE.FrontSide, transparent: true, depthWrite: false
    });
    const frontMat = mkGlass(false), backMat = mkGlass(true);
    backMat.uniforms.uBorderGlowColor = frontMat.uniforms.uBorderGlowColor; backMat.uniforms.uEdgeTint = frontMat.uniforms.uEdgeTint;   // one colour object each, so the accent tints both passes
    this.glassBack = new THREE.InstancedMesh(geo, backMat, N); this.glassFront = new THREE.InstancedMesh(geo, frontMat, N);
    this.glassBack.frustumCulled = this.glassFront.frustumCulled = false;
    this.glassBack.renderOrder = 1; this.glassFront.renderOrder = 2;
    const m = new THREE.Matrix4();
    for (let i = 0; i < N; i++) {
      m.makeRotationY(i * this.pitch).multiply(new THREE.Matrix4().makeTranslation(0, 0, this.R - T / 2));
      this.slabs.setMatrixAt(i, m); this.glassBack.setMatrixAt(i, m); this.glassFront.setMatrixAt(i, m); this.inst.push(m.clone());
    }
    this.slabs.instanceMatrix.needsUpdate = this.glassBack.instanceMatrix.needsUpdate = this.glassFront.instanceMatrix.needsUpdate = true;
    this.ring.add(this.slabs, this.glassBack, this.glassFront);
  }

  private buildCeiling() {
    const size = this.R * 4;
    this.ceilMat = new THREE.ShaderMaterial({
      vertexShader: ceilVert, fragmentShader: ceilFrag, side: THREE.DoubleSide,
      uniforms: {
        uCellSize: { value: 1.4 }, uBeamWidth: { value: 0.05 }, uRibCount: { value: 6 }, uLightEvery: { value: 3 }, uLightWidth: { value: 0.015 }, uBevel: { value: 0.5 },
        uPanelColor: { value: new THREE.Color(0.011, 0.011, 0.013) }, uBeamColor: { value: new THREE.Color(0.032, 0.032, 0.037) },
        uLightColor: { value: DEFAULT.clone() }, uLightIntensity: { value: 0.42 }, uDim: { value: 0.3 }, uFadeStart: { value: 7 }, uFadeEnd: { value: 22 }
      }
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), this.ceilMat);
    m.rotation.x = Math.PI / 2; m.position.y = 2.4; this.scene.add(m);
  }

  private buildRail() {
    this.railMat = new THREE.ShaderMaterial({
      vertexShader: railVert, fragmentShader: railFrag, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uRadius: { value: this.R }, uRail: { value: this.R * 0.008 }, uRailStrength: { value: 1.6 }, uHalo: { value: this.R * 0.11 }, uHaloStrength: { value: 0.35 }, uColor: { value: DEFAULT.clone().multiplyScalar(0.3) } }
    });
    const m = new THREE.Mesh(new THREE.CircleGeometry(this.R * 1.5, 128), this.railMat);
    m.rotation.x = -Math.PI / 2; m.position.y = this.Y0 + 0.002; this.scene.add(m);
  }

  private buildParticles() {
    const count = this.mobile ? 60 : 130; const pos = new Float32Array(count * 3), size = new Float32Array(count), ph = new Float32Array(count), sp = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * this.R * 0.9; pos[i * 3 + 1] = this.Y0 + Math.random() * 4; pos[i * 3 + 2] = 3 + (Math.random() * 2 - 1) * 8;
      size[i] = 0.5 + Math.random() * 1.7; ph[i] = Math.random(); sp[i] = 0.5 + Math.random() * 0.9;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1)); g.setAttribute('aSpeed', new THREE.BufferAttribute(sp, 1));
    this.partMat = new THREE.ShaderMaterial({ vertexShader: partVert, fragmentShader: partFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 }, uColor: { value: DEFAULT.clone().multiplyScalar(0.7) }, uCore: { value: DEFAULT.clone() } } });
    const p = new THREE.Points(g, this.partMat); p.frustumCulled = false; this.scene.add(p);
  }

  private async buildFloor(quality: 'high' | 'low') {
    const rad = this.R * 3;
    this.floor = new Reflector(new THREE.CircleGeometry(rad, 96), {
      textureWidth: 1024, textureHeight: 640, clipBias: 0.003, multisample: 0,
      shader: {
        name: 'Floor',
        uniforms: {
          color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null },
          uAlbedo: { value: this.blank }, uNormalMap: { value: this.blank }, uRoughMap: { value: this.blank }, uHasMaps: { value: 0 },
          uUvScale: { value: 0.32 }, uAlbedoScale: { value: 0.008 }, uNormalStrength: { value: 1.1 },
          uReflectBase: { value: 0.03 }, uReflectGraze: { value: 0.28 }, uReflectMax: { value: 0.35 }, uReflectTint: { value: new THREE.Vector3(0.9, 0.9, 0.96) },
          uDistort: { value: 0.022 }, uBlur: { value: 0.006 }, uFadeStart: { value: this.R * 1.1 + 3 }, uFadeEnd: { value: this.R * 1.1 + 12 }
        },
        vertexShader: floorVert, fragmentShader: floorFrag
      }
    });
    this.floor.rotation.x = -Math.PI / 2; this.floor.position.y = this.Y0; this.scene.add(this.floor);
    // let the ring know when it is being drawn into the mirror (skips the screen-space side fx there)
    const orig = this.floor.onBeforeRender.bind(this.floor);
    this.floor.onBeforeRender = (r, s, c, g, m, grp) => { this.slabMat.uniforms.uReflPass.value = 1; orig(r, s, c, g, m, grp); this.slabMat.uniforms.uReflPass.value = 0; };
    // concrete (KTX2/Basis) – loaded in the background, the floor works without it
    try {
      const k = new KTX2Loader().setTranscoderPath('/contact-scene/basis/').detectSupport(this.renderer);
      const [a, n, ro] = await Promise.all(['diff', 'nor_gl', 'rough'].map((x) => k.loadAsync(`/contact-scene/models/projects/floor/ktx/painted_concrete_02_${x}_1k.ktx2`)));
      [a, n, ro].forEach((t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; });
      const u = (this.floor.material as THREE.ShaderMaterial).uniforms;
      u.uAlbedo.value = a; u.uNormalMap.value = n; u.uRoughMap.value = ro; u.uHasMaps.value = 1; k.dispose();
    } catch (e) { console.warn('floor textures unavailable', e); }
  }

  // ───────────────────────── data → slots ─────────────────────────
  setVisible(list: number[]) {
    this.visible = list; this.scroll = 0; this.scrollTarget = 0; this.V = 0;
    this.clearHover(true); this.mapCells(true);
  }
  private mapCells(force = false) {
    const M = this.visible.length, N = this.N; if (!M) return;
    const V = Math.round(this.scroll * N);
    if (!force && V === this.V) return; this.V = V;
    const arr = this.aCell.array as Float32Array;
    for (let i = 0; i < N; i++) {
      const u = mod(i - V + N / 2, N) - N / 2;
      if (Math.abs(u) > WINDOW_HALF) { arr[i] = -1; this.visIdx[i] = -1; }
      else { const vi = mod(V + u, M); this.visIdx[i] = vi; arr[i] = this.visible[vi]; }
    }
    this.aCell.needsUpdate = true;
  }
  get activeIndex() { return this.visible.length ? mod(this.V, this.visible.length) : 0; }
  frontSlot() { return mod(this.V, this.N); }

  // ───────────────────────── motion ─────────────────────────
  nudge(deltaTurns: number, touch = false) {
    const lag = touch ? 0.075 : 0.05;
    this.scrollTarget = THREE.MathUtils.clamp(this.scrollTarget + deltaTurns, this.scroll - lag, this.scroll + lag);
  }
  goTo(virtual: number) { this.scrollTarget = virtual / this.N; }          // absolute (used by the scrubber)
  jump(virtual: number) { this.scrollTarget = virtual / this.N; this.scroll = this.scrollTarget; }

  // ───────────────────────── hover ─────────────────────────
  pick(ndcX: number, ndcY: number): { slot: number; u: number; v: number } | null {
    const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const inv = this.ring.matrixWorld.clone().invert();
    const o = rc.ray.origin.clone().applyMatrix4(inv), d = rc.ray.direction.clone().transformDirection(inv);
    const a = d.x * d.x + d.z * d.z, b = 2 * (o.x * d.x + o.z * d.z), c = o.x * o.x + o.z * o.z - this.R * this.R;
    const disc = b * b - 4 * a * c; if (disc < 0 || a < 1e-9) return null;
    const t = (-b - Math.sqrt(disc)) / (2 * a); if (t < 0) return null;
    const hx = o.x + t * d.x, hy = o.y + t * d.y, hz = o.z + t * d.z;
    if (Math.abs(hy) > this.H / 2) return null;
    const f = Math.atan2(hx, hz) / this.pitch, i = Math.round(f), dphi = (f - i) * this.pitch;
    const u = (this.R * Math.sin(dphi)) / this.W + 0.5, v = hy / this.H + 0.5;
    if (u < 0 || u > 1) return null;
    const slot = mod(i, this.N); if ((this.aCell.array as Float32Array)[slot] < 0) return null;
    return { slot, u, v };
  }
  setHover(hit: { slot: number; u: number; v: number } | null) {
    const B = this.bank, uni = this.slabMat.uniforms;
    if (!hit) { if (this.hoveredSlot !== -1) this.releaseHover(); return; }
    if (hit.slot === this.hoveredSlot) { B.ptr[this.cur].set(hit.u, hit.v); return; }
    // new card: the old bank fades out, the other bank takes over
    if (this.hoveredSlot !== -1) gsap.to(B.hover, { [this.cur]: 0, duration: 0.3, ease: 'none' });   // card -> card: the old one fades in 0.3 s (reference)
    this.cur = 1 - this.cur; const c = this.cur;
    this.hoveredSlot = hit.slot; B.slot[c] = hit.slot; B.ptr[c].set(hit.u, hit.v);
    const vi = this.visIdx[hit.slot], tech = TECHS[this.visible[vi]];
    if (this.showInfo) this.setInfo(c, this.visible[vi], vi);
    gsap.killTweensOf(B.hover, String(c)); gsap.killTweensOf(B.info, String(c)); gsap.killTweensOf(B.rip, String(c));
    B.hover[c] = 0; B.info[c] = 0; B.rip[c] = 0;
    gsap.to(B.hover, { [c]: 1, duration: 0.9, ease: 'none' });            // hover in: 0.9 s linear (reference)
    gsap.to(B.info, { [c]: 1, duration: 0.8, ease: 'power1.inOut' });
    gsap.to(B.rip, { [c]: 1.6, duration: 1.4, ease: 'power1.out' });
    this.accent.setAccent(accentRep(TECH_COLOR[tech.slug] ?? CATEGORY_COLOR[tech.category]));
    this.onHover?.(vi);
  }
  onHover?: (visibleIdx: number) => void; onHoverEnd?: () => void;
  private releaseHover() {
    const B = this.bank, c = this.cur; this.hoveredSlot = -1;
    gsap.to(B.hover, { [c]: 0, duration: 0.6, ease: 'none' });            // hover out: 0.6 s (reference)
    gsap.to(B.info, { [c]: 0, duration: 0.3 });
    this.accent.setAccent(null); this.onHoverEnd?.();
  }
  clearHover(instant = false) {
    this.hoveredSlot = -1; const B = this.bank;
    gsap.killTweensOf(B.hover); gsap.killTweensOf(B.info); gsap.killTweensOf(B.rip);
    B.hover[0] = B.hover[1] = 0; B.info[0] = B.info[1] = 0; B.slot[0] = B.slot[1] = -1;
    if (instant) this.accent.snap(); else this.accent.setAccent(null);
  }
  setBaseAccent(_hex: string | null) { /* the Stack keeps the purple resting accent whatever the filter */ }

  private setInfo(bank: number, techIdx: number, visIdx: number) {
    const key = `${techIdx}:${visIdx}`; let t = this.infoCache.get(key);
    if (!t) { t = buildInfoTexture(TECHS[techIdx], visIdx, this.mobile ? 1.5 : 2); this.infoCache.set(key, t);
      if (this.infoCache.size > 8) { const k0 = this.infoCache.keys().next().value!; this.infoCache.get(k0)!.dispose(); this.infoCache.delete(k0); } }
    const u = this.slabMat.uniforms; if (bank === 0) { u.uInfoA.value = t; u.uInfoOnA.value = 1; } else { u.uInfoB.value = t; u.uInfoOnB.value = 1; }
  }

  // screen rectangle (css px) of a physical slot's front face – used by the click-through flight
  rectOfSlot(slot: number, vw: number, vh: number) {
    const hw = this.W / 2, hh = this.H / 2, pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    this.scene.updateMatrixWorld(true);
    for (const [x, y] of pts) {
      const p = new THREE.Vector3(x, y, this.T / 2).applyMatrix4(this.inst[slot]).applyMatrix4(this.ring.matrixWorld).project(this.camera);
      const sx = (p.x * 0.5 + 0.5) * vw, sy = (-p.y * 0.5 + 0.5) * vh; x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  // ───────────────────────── per-frame ─────────────────────────
  resize(w: number, h: number, dpr: number) {
    this.camera.aspect = w / h; this.partMat && (this.partMat.uniforms.uPixelRatio.value = dpr);
    if (this.floor) { const rw = Math.min(1024, Math.round(w * dpr * 0.6)), rh = Math.round(rw / (w / h)); this.floor.getRenderTarget().setSize(rw, rh); }
    this.layoutCamera();
  }
  private layoutCamera() {
    const target = new THREE.Vector3(0, -0.2, this.R - 0.04), home = new THREE.Vector3(0, 0.35, this.R + 3.3);
    const fov = THREE.MathUtils.clamp((2 * Math.atan((Math.tan((60 * Math.PI) / 360) * 1.6) / this.camera.aspect) * 180) / Math.PI, 30, 80);
    this.camera.fov = fov;
    const dir = home.clone().sub(target), s = dir.length(); dir.normalize();
    const dist = 10 + (s - 10) * this.approach;
    this.camera.position.copy(target).addScaledVector(dir, dist); this.camera.lookAt(target); this.camera.updateProjectionMatrix();
  }

  update(dt: number, t: number) {
    if (!this.ready) return; this.time = t;
    // scroll: smoothing + the slow idle drift (paused while grabbed)
    if (!this.dragging && !this.frozen && this.drift) this.scrollTarget += 0.005 * dt;
    this.scroll += (this.scrollTarget - this.scroll) * (1 - Math.pow(1 - 0.08, dt * 60));
    this.ring.rotation.y = -this.scroll * TAU; this.mapCells();
    const act = this.activeIndex; if (act !== this.lastActive) { this.lastActive = act; this.onActive?.(act); }
    // the whole scene leans slightly with the cursor (reference: 0.025 rad, lerp 0.08)
    const k = 1 - Math.pow(1 - 0.08, dt * 60);
    this.tilt.x += (this.mouse.x - this.tilt.x) * k; this.tilt.y += (this.mouse.y - this.tilt.y) * k;
    this.scene.rotation.y = this.tilt.x * 0.025 + Math.sin(t * 0.33) * 0.0035;
    this.scene.rotation.x = -this.tilt.y * 0.025 * 0.1;
    this.scene.rotation.z = Math.sin(t * 0.27) * 0.0012;
    this.layoutCamera(); this.scene.updateMatrixWorld(true);
    // uniforms
    const u = this.slabMat.uniforms, B = this.bank;
    u.uTime.value = t; this.railMat.uniforms.uTime.value = t; this.partMat.uniforms.uTime.value = t;
    u.uHoverSlotA.value = B.slot[0]; u.uHoverA.value = B.hover[0]; u.uPtrA.value.copy(B.ptr[0]); u.uRipA.value = B.rip[0]; u.uInfoProgA.value = B.info[0];
    u.uHoverSlotB.value = B.slot[1]; u.uHoverB.value = B.hover[1]; u.uPtrB.value.copy(B.ptr[1]); u.uRipB.value = B.rip[1]; u.uInfoProgB.value = B.info[1];
    if (B.hover[0] < 0.01) u.uInfoOnA.value = 0; if (B.hover[1] < 0.01) u.uInfoOnB.value = 0;
  }
}
