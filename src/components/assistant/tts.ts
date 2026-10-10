/* Spoken replies.
 *
 *  1. Preferred: the server route /api/speak asks Gemini text-to-speech for a
 *     natural female voice and returns raw 24 kHz PCM. We play it with Web Audio
 *     and read its real loudness (AnalyserNode) so the orb reacts to the actual voice.
 *  2. Fallback (no API key, offline, error): the browser's own voice, but the
 *     best FEMALE English voice available, spoken sentence by sentence.
 *
 *  prepare() does the slow part (fetching/decoding) up front, so the caller can
 *  start the typing animation and the audio at the same moment.
 */

export type PlayHooks = {
  /** 0..1 loudness of what is being played (only for the Gemini voice) */
  onLevel?: (level: number) => void;
  /** a new word/sentence started (browser voice) */
  onWord?: () => void;
  onEnd?: () => void;
};

export type Prepared = {
  /** seconds, when known (Gemini voice); null for the browser voice */
  duration: number | null;
  kind: 'gemini' | 'browser';
  play: (hooks: PlayHooks) => void;
  cancel: () => void;
};

const SAMPLE_RATE = 24000;
const FETCH_TIMEOUT_MS = 6000;

/* ---------- browser voice: pick a good female English voice ---------- */

const FEMALE_PREFS = [
  /microsoft (aria|jenny|sonia|libby|natasha|michelle|ava|emma|clara)/i, // Edge "Online (Natural)" voices
  /(natural|neural).*(aria|jenny|sonia|libby|ava|emma)/i,
  /google uk english female/i,
  /samantha|ava \(|allison|susan|serena|karen|moira|tessa|fiona|zoe|nicky|victoria|kate|joelle/i, // macOS / iOS
  /google us english/i, // Chrome's default US voice is female
  /zira|hazel|catherine|heera|female|woman/i,
];
const MALE_NAMES = /\b(daniel|alex|fred|tom|david|mark|george|james|guy|ryan|oliver|arthur|aaron|gordon|rishi|lee|evan|male)\b/i;

function pickFemaleVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const en = voices.filter((v) => /^en/i.test(v.lang) && !(MALE_NAMES.test(v.name) && !/female/i.test(v.name)));
  for (const re of FEMALE_PREFS) {
    const hit = en.find((v) => re.test(v.name));
    if (hit) return hit;
  }
  return en[0] ?? null;
}

function splitSentences(text: string): string[] {
  const parts = text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g);
  return (parts ?? [text]).map((s) => s.trim()).filter(Boolean);
}

/* ---------- main class ---------- */

export class VoiceOut {
  private ctx: AudioContext | null = null;
  private current: { cancel: () => void } | null = null;
  private serverOff = false;
  private cache = new Map<string, AudioBuffer>();
  private voice: SpeechSynthesisVoice | null = null;
  private voiceReady = false;

  constructor(private endpoint = '/api/speak') {}

  /** Call from a click handler (autoplay rules): creates/resumes the audio engine. */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AC({ sampleRate: SAMPLE_RATE });
      }
      void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
    this.loadBrowserVoice();
  }

  private loadBrowserVoice() {
    if (this.voiceReady || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const synth = window.speechSynthesis;
    const pick = () => {
      const list = synth.getVoices();
      if (list.length) {
        this.voice = pickFemaleVoice(list);
        this.voiceReady = true;
      }
    };
    pick();
    if (!this.voiceReady) synth.addEventListener('voiceschanged', pick, { once: true });
  }

  stop() {
    this.current?.cancel();
    this.current = null;
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
  }

  /** Fetch + decode the audio (or choose the browser voice). Never throws. */
  async prepare(text: string, signal?: AbortSignal): Promise<Prepared | null> {
    if (!text) return null;
    if (!this.serverOff && this.ctx) {
      const buf = await this.fetchGemini(text, signal);
      if (signal?.aborted) return null;
      if (buf) return this.geminiPrepared(buf);
    }
    return this.browserPrepared(text);
  }

  /* ----- Gemini voice ----- */

  private async fetchGemini(text: string, signal?: AbortSignal): Promise<AudioBuffer | null> {
    const ctx = this.ctx;
    if (!ctx) return null;
    const cached = this.cache.get(text);
    if (cached) return cached;

    const ac = new AbortController();
    const timer = window.setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    const onAbort = () => ac.abort();
    signal?.addEventListener('abort', onAbort);
    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: ac.signal,
      });
      if (!res.ok) {
        /* no key configured / route missing: don't try again this session */
        if (res.status === 501 || res.status === 404 || res.status === 403) this.serverOff = true;
        return null;
      }
      const bytes = await res.arrayBuffer();
      const n = Math.floor(bytes.byteLength / 2);
      if (n < SAMPLE_RATE * 0.2) return null;
      const pcm = new Int16Array(bytes, 0, n);
      const buffer = ctx.createBuffer(1, n, SAMPLE_RATE);
      const ch = buffer.getChannelData(0);
      for (let i = 0; i < n; i++) ch[i] = pcm[i] / 32768;
      if (this.cache.size > 40) this.cache.delete(this.cache.keys().next().value as string);
      this.cache.set(text, buffer);
      return buffer;
    } catch {
      if (!signal?.aborted && !ac.signal.aborted) this.serverOff = true; // network error
      return null;
    } finally {
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  private geminiPrepared(buffer: AudioBuffer): Prepared {
    const ctx = this.ctx as AudioContext;
    let src: AudioBufferSourceNode | null = null;
    let gain: GainNode | null = null;
    let raf = 0;
    let done = false;
    const cleanup = () => {
      cancelAnimationFrame(raf);
      try {
        src?.disconnect();
        gain?.disconnect();
      } catch {
        /* ignore */
      }
      src = null;
      gain = null;
    };
    const handle = {
      duration: buffer.duration,
      kind: 'gemini' as const,
      play: (hooks: PlayHooks) => {
        void ctx.resume();
        src = ctx.createBufferSource();
        src.buffer = buffer;
        gain = ctx.createGain();
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        an.smoothingTimeConstant = 0.55;
        src.connect(an);
        an.connect(gain);
        gain.connect(ctx.destination);
        const t = ctx.currentTime;
        gain.gain.setValueAtTime(0.0001, t); // short fade-in: no click at the start
        gain.gain.exponentialRampToValueAtTime(1, t + 0.04);
        const data = new Uint8Array(an.fftSize);
        const loop = () => {
          an.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          hooks.onLevel?.(Math.min(1, Math.sqrt(sum / data.length) * 3.6));
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        src.onended = () => {
          if (done) return;
          done = true;
          cleanup();
          hooks.onLevel?.(0);
          hooks.onEnd?.();
        };
        src.start();
      },
      cancel: () => {
        if (done) return;
        done = true;
        try {
          if (gain) {
            const t = ctx.currentTime;
            gain.gain.cancelScheduledValues(t);
            gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), t);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05); // fade out, no pop
          }
          const s = src;
          window.setTimeout(() => {
            try {
              s?.stop();
            } catch {
              /* ignore */
            }
          }, 60);
        } catch {
          /* ignore */
        }
        window.setTimeout(cleanup, 80);
      },
    };
    this.current = handle;
    return handle;
  }

  /* ----- browser voice (female, sentence by sentence) ----- */

  private browserPrepared(text: string): Prepared | null {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    this.loadBrowserVoice();
    const synth = window.speechSynthesis;
    let cancelled = false;
    const handle = {
      duration: null,
      kind: 'browser' as const,
      play: (hooks: PlayHooks) => {
        const sentences = splitSentences(text);
        synth.cancel();
        sentences.forEach((s, i) => {
          const u = new SpeechSynthesisUtterance(s);
          if (this.voice) {
            u.voice = this.voice;
            u.lang = this.voice.lang;
          } else u.lang = 'en-US';
          u.rate = 0.97;
          u.pitch = 1.08; // a little higher: softer, more natural for a female voice
          u.volume = 1;
          u.onstart = () => hooks.onWord?.();
          u.onboundary = () => hooks.onWord?.();
          if (i === sentences.length - 1) u.onend = () => !cancelled && hooks.onEnd?.();
          synth.speak(u);
        });
      },
      cancel: () => {
        cancelled = true;
        try {
          synth.cancel();
        } catch {
          /* ignore */
        }
      },
    };
    this.current = handle;
    return handle;
  }
}
