/* Voice helpers: how loudness gets from "something is speaking" to the orb. */

/** Underdamped spring on a level (stiffness 26, damping 11, the reference orb's values).
 *  Gives speech a slightly elastic, organic feel and swallows sudden spikes. */
export class LevelSpring {
  x = 0;
  v = 0;
  constructor(private stiffness = 26, private damping = 11) {}
  update(target: number, dt: number) {
    this.v += (target - this.x) * this.stiffness * dt;
    this.v *= Math.max(0, 1 - this.damping * dt);
    this.x = Math.max(0, this.x + this.v * dt);
    return this.x;
  }
  reset() {
    this.x = 0;
    this.v = 0;
  }
}

/** Speech-shaped loudness for when there is no audio to measure
 *  (text replies, or the browser's built-in voice, which exposes no audio node).
 *  A slow phrase "breath" x fast syllable flutter, plus an impulse per word. */
export class SpeechEnvelope {
  active = false;
  private t = 0;
  private impulse = 0;

  pulse(amount: number) {
    this.impulse = Math.max(this.impulse, Math.min(1, amount));
  }

  update(dt: number) {
    this.impulse *= Math.exp(-dt * 7);
    if (!this.active) return this.impulse * 0.6;
    this.t += dt;
    const t = this.t;
    const phrase = Math.max(0, Math.min(1, 0.5 * (Math.sin(t * 1.6) + Math.sin(t * 0.73 + 2)) + 0.45));
    const syllable = 0.5 + 0.5 * Math.sin(t * 13) * Math.cos(t * 8.3 + 0.5);
    const flutter = 0.85 + 0.15 * Math.sin(t * 25);
    const base = phrase * (0.35 + 0.65 * syllable) * flutter;
    return Math.max(0, Math.min(1, Math.max(base * 0.78, this.impulse)));
  }
}

/** Best-effort microphone loudness while listening. Fails silently
 *  (permission denied, no device) and the orb falls back to dictation bumps. */
export class MicMeter {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private buf: Uint8Array<ArrayBuffer> | null = null;
  private token = 0;

  async start() {
    if (this.stream || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
    const mine = ++this.token;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (mine !== this.token) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.5;
      ctx.createMediaStreamSource(stream).connect(analyser);
      this.stream = stream;
      this.ctx = ctx;
      this.analyser = analyser;
      this.buf = new Uint8Array(analyser.fftSize);
    } catch {
      /* no mic level; that's fine */
    }
  }

  read(): number {
    if (!this.analyser || !this.buf) return 0;
    this.analyser.getByteTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) {
      const v = (this.buf[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / this.buf.length) * 1.8);
  }

  stop() {
    this.token++;
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close().catch(() => {});
    this.stream = null;
    this.ctx = null;
    this.analyser = null;
    this.buf = null;
  }
}
