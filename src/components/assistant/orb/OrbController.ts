import gsap from 'gsap';
import { HIST_N } from './shaders';
import { LevelSpring, MicMeter, SpeechEnvelope } from './voice';
import type { OrbFrame } from './OrbRenderer';
import { ORB_TUNING, type OrbPhase, type OrbState, type Rgb } from '../theme';

const HIST_DT = 0.025; // seconds between voice-history samples (64 samples = 1.6 s of memory)

/** frame-rate independent version of "x += (target - x) * k" (k measured at 60fps) */
const damp = (k60: number, dt: number) => 1 - Math.pow(1 - k60, dt * 60);

/**
 * Owns every animated number of the orb. The shader never sees a raw state:
 * it only sees values that have been eased (GSAP tweens), spring-smoothed
 * (voice) or low-pass filtered (pointer), so nothing ever snaps.
 */
export class OrbController {
  /* tweened by GSAP on a phase change */
  flow = 0.5;
  speed = 0.32;
  spin = 0.1;
  blobEnergy = 0.2;
  glow = 0.95;
  loading = 0;
  waveGain = 0;
  pal: Rgb[] = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
  hot: Rgb = [1, 1, 1];
  comet: Rgb = [1, 1, 1];

  /* integrated phases (advance with time, scaled by speed) */
  private uTime = 0;
  private rotPhase = 0;
  private domainPhase = 0;
  private tiltPhase = 0;

  /* voice */
  private envelope = new SpeechEnvelope();
  private agentSpring = new LevelSpring();
  private micSpring = new LevelSpring();
  private mic = new MicMeter();
  private micOn = false;
  private externalAgent: number | null = null;
  private externalMic: number | null = null;
  private voiceSmooth = 0;
  private rawSmooth = 0;
  private rawTarget = 0;
  private jolt = 0;
  private hist = new Float32Array(HIST_N);
  private histAccum = 0;

  /* pointer */
  private pointer: [number, number] = [0, 0];
  private pointerTarget: [number, number] = [0, 0];
  private lastPointer: [number, number] | null = null;
  private pointerSpeed = 0; // normalised units / second, smoothed
  private pointerEnergy = 0;

  private baseTween: gsap.core.Tween | null = null;
  private palTween: gsap.core.Tween | null = null;
  private frame: OrbFrame;
  /** 0 for dark backgrounds (this hero), 1 for light ones */
  ink = 0;

  constructor(private states: Record<OrbPhase, OrbState>, initial: OrbPhase = 'idle') {
    const s = states[initial];
    this.applyInstant(s);
    this.frame = {
      time: 0, flow: 0, energy: 0, glow: 0, loading: 0, wave: 0, raw: 0, ink: 0, surface: 0,
      rotPhase: 0, domainPhase: 0, tiltPhase: 0, histDt: HIST_DT,
      pal: new Float32Array(12), hot: new Float32Array(3), comet: new Float32Array(3),
      hist: this.hist, pointer: [0, 0],
    };
  }

  private applyInstant(s: OrbState) {
    this.flow = s.flow;
    this.speed = s.speed;
    this.spin = s.spin;
    this.blobEnergy = s.blobEnergy;
    this.glow = s.glow;
    this.loading = s.loading;
    this.waveGain = s.waves;
    this.pal = s.palette.map((c) => [...c] as Rgb);
    this.hot = [...s.hot] as Rgb;
    this.comet = [...s.comet] as Rgb;
  }

  /** Replace the palette source (e.g. the theme changed) and ease to the current phase. */
  setStates(states: Record<OrbPhase, OrbState>, phase: OrbPhase) {
    this.states = states;
    this.setPhase(phase);
  }

  /** Ease every parameter to the target phase: 0.7 s power2.inOut, palette 0.9 s (never a switch). */
  setPhase(phase: OrbPhase) {
    const s = this.states[phase];
    if (phase === 'interrupt') this.jolt = 1.2;
    this.baseTween?.kill();
    this.baseTween = gsap.to(this, {
      flow: s.flow,
      speed: s.speed,
      spin: s.spin,
      blobEnergy: s.blobEnergy,
      glow: s.glow,
      loading: s.loading,
      waveGain: s.waves * ORB_TUNING.speakingIntensity, // eased too, so ripples fade in/out instead of popping
      duration: ORB_TUNING.transitions.state,
      ease: 'power2.inOut',
    });

    const from = [...this.pal.map((c) => [...c] as Rgb), [...this.hot] as Rgb, [...this.comet] as Rgb];
    const to = [...s.palette, s.hot, s.comet];
    const k = { t: 0 };
    this.palTween?.kill();
    this.palTween = gsap.to(k, {
      t: 1,
      duration: ORB_TUNING.transitions.palette,
      ease: 'power2.inOut',
      onUpdate: () => {
        const mixed = from.map((c, i) => [0, 1, 2].map((j) => c[j] + (to[i][j] - c[j]) * k.t) as Rgb);
        this.pal = mixed.slice(0, 4);
        this.hot = mixed[4];
        this.comet = mixed[5];
      },
    });
  }

  /* ---------- inputs ---------- */
  setSpeaking(on: boolean) {
    this.envelope.active = on;
    if (!on) this.envelope.pulse(0);
  }
  pulse(amount: number) {
    this.envelope.pulse(amount);
  }
  /** Real audio levels (0..1), e.g. from an AnalyserNode on a TTS stream. Pass null to go back to the built-in envelope. */
  setLevels(agent: number | null, mic: number | null = null) {
    this.externalAgent = agent;
    this.externalMic = mic;
  }
  setMic(on: boolean) {
    if (on === this.micOn) return;
    this.micOn = on;
    if (on && ORB_TUNING.useMicLevel) void this.mic.start();
    else this.mic.stop();
  }
  setPointerTarget(x: number, y: number) {
    this.pointerTarget = [x, y];
  }
  kick(amount = 1) {
    this.jolt = Math.max(this.jolt, amount);
  }

  /* ---------- per frame ---------- */
  update(dt: number) {
    const T = ORB_TUNING;

    /* voice: raw -> spring -> low-pass. Speech spikes never reach the shader directly. */
    const agentRaw =
      (this.externalAgent ?? this.envelope.update(dt)) * T.speakingIntensity;
    const micRaw = this.micOn ? this.externalMic ?? this.mic.read() : 0;
    const agent = this.agentSpring.update(agentRaw, dt);
    const mic = this.micSpring.update(micRaw, dt);
    this.rawTarget = Math.max(agentRaw, micRaw * 0.7);
    this.voiceSmooth += (Math.max(agent, mic) - this.voiceSmooth) * damp(0.12, dt);
    this.rawSmooth += (this.rawTarget - this.rawSmooth) * damp(0.18, dt);

    this.jolt *= Math.exp(-dt * 6);

    /* pointer: target -> low-pass. Fast movement adds a little energy; stillness lets it settle. */
    const k = damp(0.06, dt);
    this.pointer[0] += (this.pointerTarget[0] - this.pointer[0]) * k;
    this.pointer[1] += (this.pointerTarget[1] - this.pointer[1]) * k;
    const moved = Math.hypot(this.pointerTarget[0] - (this.lastPointer?.[0] ?? this.pointerTarget[0]),
      this.pointerTarget[1] - (this.lastPointer?.[1] ?? this.pointerTarget[1]));
    this.lastPointer = [this.pointerTarget[0], this.pointerTarget[1]];
    const inst = dt > 0 ? moved / dt : 0;
    this.pointerSpeed += (Math.min(6, inst) - this.pointerSpeed) * damp(0.2, dt);
    const targetE = Math.min(0.35, this.pointerSpeed * 0.1) * T.pointerStrength;
    this.pointerEnergy += (targetE - this.pointerEnergy) * (targetE > this.pointerEnergy ? damp(0.15, dt) : damp(0.04, dt));

    /* integrated time + phases */
    const v = this.voiceSmooth;
    const s = dt * (0.5 + this.speed * 0.6 + v * 0.08) * T.animationSpeed;
    this.uTime += s;
    const flow = this.flow * (1 + v * 0.12) * T.flowSpeed;
    this.rotPhase += s * (0.12 + this.speed * 0.45);
    this.domainPhase += s * (0.04 + flow * 0.04);
    this.tiltPhase += s * this.spin * 0.25;

    /* voice history ring (feeds the ripple) */
    this.histAccum += dt;
    while (this.histAccum >= HIST_DT) {
      this.histAccum -= HIST_DT;
      this.hist.copyWithin(1, 0, HIST_N - 1);
      this.hist[0] = this.rawTarget * this.waveGain;
    }

    /* fill the frame */
    const f = this.frame;
    f.time = this.uTime;
    f.flow = flow;
    f.energy = this.blobEnergy + this.jolt * 0.4 + v * 0.22 + this.pointerEnergy;
    f.glow = (this.glow + v * 0.1) * T.glow;
    f.loading = this.loading;
    f.wave = this.waveGain;
    f.raw = this.rawSmooth;
    f.ink = this.ink;
    f.surface = v * 1.2 + this.jolt * 0.5;
    f.rotPhase = this.rotPhase;
    f.domainPhase = this.domainPhase;
    f.tiltPhase = this.tiltPhase;
    f.pointer[0] = this.pointer[0] * T.pointerStrength;
    f.pointer[1] = this.pointer[1] * T.pointerStrength;
    for (let i = 0; i < 4; i++) f.pal.set(this.pal[i], i * 3);
    f.hot.set(this.hot);
    f.comet.set(this.comet);
    return f;
  }

  /** A calm, fixed pose for reduced-motion users. */
  stillPose() {
    this.uTime = 4;
    this.rotPhase = 1.1;
    this.domainPhase = 0.9;
    return this.update(0);
  }

  dispose() {
    this.baseTween?.kill();
    this.palTween?.kill();
    this.mic.stop();
  }
}
