'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import AssistantOrb, { type OrbHandle } from './AssistantOrb';
import LauncherOrb, { type LauncherHandle } from './LauncherOrb';
import { HERO_THEME, type HeroTheme, type OrbPhase, themeToCssVars } from './theme';
import { VoiceOut, type Prepared } from './tts';
import {
  BUBBLE_FIRST,
  BUBBLE_HOVER,
  BUBBLE_IDLE,
  BUBBLE_SECTION,
  GREETING,
  INTRO_CHIPS,
  cannedTransport,
  speechText,
  type Msg,
  type Reply,
  type Target,
  type Transport,
} from './brain';
import styles from './assistant.module.css';

type Props = {
  /** Flip to true when the intro hands off; the launcher shows up then. */
  ready?: boolean;
  /** Swap in a real (Gemini) transport; defaults to preset answers. */
  transport?: Transport;
  /** Colours: defaults to HERO_THEME in ./theme.ts */
  theme?: HeroTheme;
};

/* ---------- small helpers ---------- */

const reduceMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = () =>
  typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;


/* minimal typing for the browser speech API (not in every TS lib) */
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onresult:
    | ((e: {
        resultIndex: number;
        results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
      }) => void)
    | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
const getRecognition = (): (new () => Recognition) | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => Recognition) | null;
};

const lockScroll = (on: boolean) => {
  document.documentElement.style.overflow = on ? 'hidden' : '';
  document.body.style.overflow = on ? 'hidden' : '';
};

function TypedLine({ text }: { text: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (reduceMotion()) {
      setN(text.length);
      return;
    }
    setN(0);
    const id = window.setInterval(() => {
      setN((v) => {
        if (v >= text.length) {
          window.clearInterval(id);
          return v;
        }
        return v + 1;
      });
    }, 26);
    return () => window.clearInterval(id);
  }, [text]);
  return (
    <span className={styles.typedWrap}>
      <span className={styles.ghost}>{text}</span>
      <span className={styles.typed}>{text.slice(0, n)}</span>
    </span>
  );
}

const Icon = {
  mic: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
  arrow: (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4.5 11.5l7-7M11.5 4.5H6M11.5 4.5V10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  close: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  soundOn: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
  soundOff: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
};

/* ---------- component ---------- */

export default function Assistant({
  ready = true,
  transport = cannedTransport,
  theme = HERO_THEME,
}: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false); // overlay + orb exist (pre-warmed shortly after the page is ready)
  const [phase, setPhase] = useState<OrbPhase>('idle');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [chips, setChips] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [bubble, setBubble] = useState<string | null>(null);
  const [voiceOn, setVoiceOn] = useState(false);
  const [listening, setListening] = useState(false);
  const [micOk, setMicOk] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [hovering, setHovering] = useState(false);

  const launcherBtnRef = useRef<HTMLButtonElement>(null);
  const launcherOrbRef = useRef<LauncherHandle>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const orbWrapRef = useRef<HTMLDivElement>(null);
  const orbRef = useRef<OrbHandle>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  const idRef = useRef(0);
  const openRef = useRef(false);
  const closingRef = useRef(false);
  const greetedRef = useRef(false);
  const streamRef = useRef<{ cancel: (showAll?: boolean) => void } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recRef = useRef<Recognition | null>(null);
  const voiceRef = useRef(false);
  const messagesRef = useRef<Msg[]>([]);
  const sendRef = useRef<(t: string) => void>(() => {});
  const bubbleTimer = useRef(0);
  const synthTimer = useRef(0);
  const interruptTimer = useRef(0);
  const lastBubbleAt = useRef(0);
  const bubblesShown = useRef(0);
  const idleShown = useRef(0);
  const voiceOut = useRef<VoiceOut | null>(null);
  const preparedRef = useRef<Prepared | null>(null);

  voiceRef.current = voiceOn;
  messagesRef.current = messages;

  const vars = useMemo(() => themeToCssVars(theme) as React.CSSProperties, [theme]);
  const busy = phase === 'thinking' || phase === 'synthesizing' || phase === 'speaking';

  useEffect(() => {
    setMicOk(!!getRecognition());
  }, []);

  /* build the overlay (and compile the orb shaders) while the page is idle, so the first open doesn't hitch */
  useEffect(() => {
    if (!ready || mounted) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    const id = window.setTimeout(() => {
      if (w.requestIdleCallback) w.requestIdleCallback(() => setMounted(true), { timeout: 2500 });
      else setMounted(true);
    }, 1800);
    return () => window.clearTimeout(id);
  }, [ready, mounted]);

  /* the orb follows the assistant's state; speaking/listening also feed it voice */
  useEffect(() => {
    const o = orbRef.current;
    if (!o) return;
    o.setPhase(phase);
    o.setSpeaking(phase === 'speaking' || phase === 'synthesizing');
    o.setMic(phase === 'listening');
  }, [phase, mounted]);

  /* keep the newest line in view while text streams in */
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, chips]);

  /* ---------- speech out (Gemini female voice, else a female browser voice; off by default) ---------- */
  const getVoice = () => (voiceOut.current ??= new VoiceOut());
  const cancelSpeech = useCallback(() => {
    preparedRef.current?.cancel();
    preparedRef.current = null;
    voiceOut.current?.stop();
    orbRef.current?.setLevels(null); // back to the built-in speech rhythm
  }, []);

  /* ---------- the reply "types itself" while the orb speaks ---------- */
  const streamReply = useCallback(
    async (reply: Reply, signal?: AbortSignal) => {
      const text = reply.text;

      /* with the voice on, fetch the audio first so text and speech start together */
      let prepared: Prepared | null = null;
      if (voiceRef.current) {
        setPhase('thinking');
        prepared = await getVoice().prepare(speechText(text), signal);
        if (signal?.aborted) {
          prepared?.cancel();
          return;
        }
      }

      await new Promise<void>((resolve) => {
        const id = ++idRef.current;
        setMessages((m) => [...m, { id, role: 'assistant', text: '', done: false }]);
        /* synthesizing -> speaking: the orb eases through both instead of jumping */
        setPhase('synthesizing');
        window.clearTimeout(synthTimer.current);
        synthTimer.current = window.setTimeout(() => setPhase((p) => (p === 'synthesizing' ? 'speaking' : p)), 450);

        /* typing pace: matched to the audio length when we know it, so the words land with the voice */
        const weights = Array.from(text, (ch) => (/[.!?]/.test(ch) ? 7 : /[,;:]/.test(ch) ? 3.5 : 1));
        const totalW = weights.reduce((a, b) => a + b, 0);
        const msPerW = prepared?.duration
          ? Math.min(110, Math.max(14, (prepared.duration * 1000) / totalW))
          : voiceRef.current
            ? 62
            : 16;

        if (prepared) {
          preparedRef.current = prepared;
          prepared.play({
            onLevel: (l) => orbRef.current?.setLevels(l),
            onWord: () => orbRef.current?.pulse(0.8),
            onEnd: () => {
              if (preparedRef.current === prepared) preparedRef.current = null;
              orbRef.current?.setLevels(null);
            },
          });
        }

        let i = 0;
        let timer = 0;
        const finish = (complete: boolean, showAll = complete) => {
          window.clearTimeout(timer);
          window.clearTimeout(synthTimer.current);
          streamRef.current = null;
          setMessages((m) =>
            m.map((x) =>
              x.id === id
                ? {
                    ...x,
                    text: showAll ? text : x.text,
                    done: true,
                    links: complete ? reply.links : undefined,
                    action: complete ? reply.action : undefined,
                  }
                : x
            )
          );
          setChips(complete ? reply.chips ?? [] : INTRO_CHIPS.slice(0, 3));
          setPhase((p) => (p === 'synthesizing' || p === 'speaking' ? 'idle' : p));
          resolve();
        };
        streamRef.current = {
          cancel: (showAll = false) => {
            cancelSpeech();
            finish(false, showAll);
          },
        };

        const tick = () => {
          i = Math.min(text.length, i + 1);
          const shown = text.slice(0, i);
          setMessages((m) => m.map((x) => (x.id === id ? { ...x, text: shown } : x)));
          if (!prepared && text[i - 1] === ' ') {
            /* no real audio: each new word is an impulse; longer words hit a little harder */
            const next = text.slice(i, i + 9).split(' ')[0].length;
            orbRef.current?.pulse(0.45 + Math.min(next, 8) * 0.06 + Math.random() * 0.15);
          }
          if (i >= text.length) {
            finish(true);
            return;
          }
          timer = window.setTimeout(tick, weights[i - 1] * msPerW);
        };
        if (reduceMotion()) i = text.length - 1; // reduced motion: whole reply at once
        tick();
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cancelSpeech]
  );

  /* ---------- send a question ---------- */
  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      streamRef.current?.cancel(true);
      cancelSpeech();
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      const history = messagesRef.current;
      setInput('');
      setNotice(null);
      setChips([]);
      setMessages((m) => [...m, { id: ++idRef.current, role: 'user', text, done: true }]);
      setPhase('thinking');
      try {
        const reply = await transport.reply(text, history, ac.signal);
        if (ac.signal.aborted) return;
        await streamReply(reply, ac.signal);
      } catch {
        if (ac.signal.aborted) return;
        setPhase('idle');
        setMessages((m) => [
          ...m,
          {
            id: ++idRef.current,
            role: 'assistant',
            text: 'Something broke on my side, which is awkward for an assistant. Try that again.',
            done: true,
          },
        ]);
        setChips(INTRO_CHIPS.slice(0, 3));
      }
    },
    [transport, streamReply, cancelSpeech]
  );
  sendRef.current = send;

  const stopAll = useCallback(() => {
    window.clearTimeout(synthTimer.current);
    abortRef.current?.abort();
    streamRef.current?.cancel();
    cancelSpeech();
    try {
      recRef.current?.abort();
    } catch {
      /* ignore */
    }
    setListening(false);
    setPhase((p) => (p === 'sleeping' || p === 'exiting' ? p : 'idle'));
  }, [cancelSpeech]);

  /* the Stop button: same as stopAll, plus a brief jolt of energy in the orb */
  const onStop = useCallback(() => {
    orbRef.current?.kick(1);
    stopAll();
    setPhase('interrupt');
    window.clearTimeout(interruptTimer.current);
    interruptTimer.current = window.setTimeout(() => setPhase((p) => (p === 'interrupt' ? 'idle' : p)), 650);
  }, [stopAll]);

  /* ---------- mic (browser speech recognition; the orb also meters the real mic level) ---------- */
  const startMic = useCallback(() => {
    const Ctor = getRecognition();
    if (!Ctor) {
      setNotice("This browser can't do voice input. Typing works.");
      return;
    }
    stopAll();
    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = '';
    rec.onstart = () => {
      setListening(true);
      setPhase('listening');
      setNotice(null);
    };
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      setInput((finalText + interim).trim());
      orbRef.current?.pulse(0.45 + Math.random() * 0.3);
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed')
        setNotice('Mic is blocked. Allow it in the address bar, or just type.');
      else if (e.error === 'no-speech') setNotice("Didn't catch anything. Try again?");
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
      if (finalText.trim()) sendRef.current(finalText);
      else setPhase((p) => (p === 'listening' ? 'idle' : p));
    };
    recRef.current = rec;
    try {
      rec.start();
    } catch {
      /* already started */
    }
  }, [stopAll]);

  const stopMic = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
  }, []);

  /* ---------- open / close choreography ---------- */
  const setUrl = (on: boolean) => {
    try {
      const u = new URL(window.location.href);
      if (on) u.searchParams.set('assistant', 'open');
      else u.searchParams.delete('assistant');
      window.history.replaceState(window.history.state, '', u.toString());
    } catch {
      /* ignore */
    }
  };

  const openAssistant = useCallback(() => {
    if (openRef.current) return;
    openRef.current = true;
    window.clearTimeout(bubbleTimer.current);
    setBubble(null);
    setHovering(false);
    setMounted(true);
    setPhase('entering');
    setOpen(true);
    setUrl(true);
  }, []);

  const afterOpen = useCallback(() => {
    if (finePointer()) inputRef.current?.focus({ preventScroll: true });
    setPhase((p) => (p === 'entering' ? 'idle' : p));
    if (!greetedRef.current) {
      greetedRef.current = true;
      const ac = new AbortController();
      abortRef.current = ac;
      void streamReply({ text: GREETING, chips: INTRO_CHIPS }, ac.signal);
    } else if (chips.length === 0 && !busy) {
      setChips(INTRO_CHIPS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamReply]);

  useLayoutEffect(() => {
    if (!open) return;
    const overlay = overlayRef.current;
    const orbWrap = orbWrapRef.current;
    const btn = launcherBtnRef.current;
    if (!overlay || !orbWrap || !btn) return;
    lockScroll(true);
    const items = Array.from(overlay.querySelectorAll<HTMLElement>('[data-reveal]'));
    const clear = () => {
      gsap.set([overlay, orbWrap, ...items], { clearProps: 'clipPath,transform,opacity' });
    };
    if (reduceMotion()) {
      afterOpen();
      return clear;
    }
    const L = btn.getBoundingClientRect();
    const cx = L.left + L.width / 2;
    const cy = L.top + L.height / 2;
    const rad = Math.hypot(Math.max(cx, window.innerWidth - cx), Math.max(cy, window.innerHeight - cy)) + 40;
    const O = orbWrap.getBoundingClientRect(); // the wrapper IS the visible orb's diameter
    const s = L.width / O.width;

    gsap.set(overlay, { clipPath: `circle(${L.width / 2}px at ${cx}px ${cy}px)` });
    gsap.set(orbWrap, { x: cx - (O.left + O.width / 2), y: cy - (O.top + O.height / 2), scale: s, opacity: 0 });
    gsap.set(items, { opacity: 0, y: 26 });

    const tl = gsap.timeline({
      onComplete: () => {
        clear();
        afterOpen();
      },
    });
    tl.to(overlay, { clipPath: `circle(${rad}px at ${cx}px ${cy}px)`, duration: 0.95, ease: 'power3.inOut' }, 0)
      .to(orbWrap, { opacity: 1, duration: 0.25, ease: 'none' }, 0.05)
      .to(orbWrap, { x: 0, y: 0, scale: 1, duration: 1.25, ease: 'expo.out' }, 0.1)
      .to(items, { opacity: 1, y: 0, duration: 0.85, stagger: 0.07, ease: 'power3.out' }, 0.5);
    return () => {
      tl.kill();
      clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const closeAssistant = useCallback(() => {
    if (!openRef.current || closingRef.current) return;
    closingRef.current = true;
    stopAll();
    setPhase('exiting');
    const overlay = overlayRef.current;
    const orbWrap = orbWrapRef.current;
    const btn = launcherBtnRef.current;
    const finish = () => {
      if (overlay && orbWrap)
        gsap.set([overlay, orbWrap, ...Array.from(overlay.querySelectorAll('[data-reveal]'))], {
          clearProps: 'clipPath,transform,opacity',
        });
      openRef.current = false;
      closingRef.current = false;
      setOpen(false);
      setPhase('idle');
      lockScroll(false);
      setUrl(false);
      btn?.focus({ preventScroll: true });
    };
    if (!overlay || !orbWrap || !btn || reduceMotion()) {
      finish();
      return;
    }
    const items = Array.from(overlay.querySelectorAll<HTMLElement>('[data-reveal]'));
    const L = btn.getBoundingClientRect();
    const cx = L.left + L.width / 2;
    const cy = L.top + L.height / 2;
    const rad = Math.hypot(Math.max(cx, window.innerWidth - cx), Math.max(cy, window.innerHeight - cy)) + 40;
    const O = orbWrap.getBoundingClientRect();
    const s = L.width / O.width;
    gsap.set(overlay, { clipPath: `circle(${rad}px at ${cx}px ${cy}px)` });
    gsap
      .timeline({ onComplete: finish })
      .to(items, { opacity: 0, y: 14, duration: 0.3, stagger: { each: 0.03, from: 'end' }, ease: 'power2.in' }, 0)
      .to(orbWrap, { x: cx - (O.left + O.width / 2), y: cy - (O.top + O.height / 2), scale: s, duration: 0.8, ease: 'power3.inOut' }, 0.1)
      .to(overlay, { clipPath: `circle(${L.width / 2}px at ${cx}px ${cy}px)`, duration: 0.85, ease: 'power3.inOut' }, 0.2)
      .to(orbWrap, { opacity: 0, duration: 0.2, ease: 'none' }, 0.78);
  }, [stopAll]);

  /* ---------- sleep after a quiet while, wake on any movement ---------- */
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => setPhase((p) => (p === 'idle' ? 'sleeping' : p)), 45000);
    return () => window.clearTimeout(id);
  }, [open, phase, messages.length, input]);

  const wake = () => {
    if (phase === 'sleeping') setPhase('idle');
  };

  /* ---------- keyboard: Esc closes, Tab stays inside ---------- */
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeAssistant();
      return;
    }
    if (e.key !== 'Tab') return;
    const f = overlayRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input, a[href]');
    if (!f || f.length === 0) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const go = (target: Target) => {
    closeAssistant();
    window.setTimeout(
      () => {
        const el = target === 'top' ? document.getElementById('top') : document.getElementById(target);
        el?.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth' });
      },
      reduceMotion() ? 0 : 1000
    );
  };

  /* ---------- speech bubble next to the corner orb ---------- */
  const showBubble = useCallback((text: string) => {
    if (openRef.current) return;
    const now = Date.now();
    if (now - lastBubbleAt.current < 9000 || bubblesShown.current >= 7) return;
    lastBubbleAt.current = now;
    bubblesShown.current += 1;
    setBubble(text);
    launcherOrbRef.current?.pulse();
    window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => setBubble(null), 3800 + text.length * 32);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timers: number[] = [];
    if (new URLSearchParams(window.location.search).get('assistant') === 'open') {
      timers.push(window.setTimeout(openAssistant, 500));
    } else {
      timers.push(window.setTimeout(() => showBubble(BUBBLE_FIRST), 3200));
    }
    /* comment on the sections as the visitor reaches them */
    const seen = new Set<string>();
    let io: IntersectionObserver | null = null;
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((en) => {
            const id = en.target.id;
            if (en.isIntersecting && !seen.has(id)) {
              seen.add(id);
              timers.push(window.setTimeout(() => showBubble(BUBBLE_SECTION[id]), 900));
            }
          });
        },
        { threshold: 0.55 }
      );
      Object.keys(BUBBLE_SECTION).forEach((id) => {
        const el = document.getElementById(id);
        if (el) io?.observe(el);
      });
    }
    const idle = window.setInterval(() => {
      if (!openRef.current && idleShown.current < BUBBLE_IDLE.length) {
        showBubble(BUBBLE_IDLE[idleShown.current]);
        idleShown.current += 1;
      }
    }, 55000);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      window.clearInterval(idle);
      io?.disconnect();
    };
  }, [ready, openAssistant, showBubble]);

  /* tidy up */
  useEffect(
    () => () => {
      window.clearTimeout(bubbleTimer.current);
      window.clearTimeout(synthTimer.current);
      window.clearTimeout(interruptTimer.current);
      try {
        window.speechSynthesis?.cancel();
        recRef.current?.abort();
      } catch {
        /* ignore */
      }
      lockScroll(false);
    },
    []
  );

  const last = messages[messages.length - 1];

  return (
    <>
      <div
        className={`${styles.launcher} ${ready ? styles.launcherOn : ''}`}
        style={vars}
        aria-hidden={open}
        onPointerEnter={(e) => {
          setMounted(true);
          if (e.pointerType !== 'touch') setHovering(true);
        }}
        onPointerLeave={() => setHovering(false)}
      >
        {(hovering || bubble) && !open && (
          <button type="button" className={styles.bubble} onClick={openAssistant} tabIndex={-1}>
            <TypedLine text={hovering ? BUBBLE_HOVER : (bubble as string)} />
          </button>
        )}
        <button
          ref={launcherBtnRef}
          type="button"
          className={styles.orbBtn}
          onClick={openAssistant}
          onFocus={() => {
            setMounted(true);
            setHovering(true);
          }}
          onBlur={() => setHovering(false)}
          aria-label="Open Shubhrato's assistant"
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <LauncherOrb ref={launcherOrbRef} running={ready && !open} theme={theme} />
        </button>
      </div>

      {mounted && (
        <div
          ref={overlayRef}
          className={styles.overlay}
          style={vars}
          data-open={open}
          data-phase={phase}
          role="dialog"
          aria-modal="true"
          aria-label="Shubhrato's assistant"
          aria-hidden={!open}
          onKeyDown={onKeyDown}
          onPointerMove={wake}
        >
          <div className={styles.topBtns} data-reveal>
            <button
              type="button"
              className={styles.iconBtn}
              aria-pressed={voiceOn}
              aria-label={voiceOn ? 'Turn spoken replies off' : 'Turn spoken replies on'}
              onClick={() => {
                if (!voiceRef.current) getVoice().unlock(); // must happen inside the click (autoplay rules)
                else cancelSpeech();
                setVoiceOn((v) => !v);
              }}
            >
              {voiceOn ? Icon.soundOn : Icon.soundOff}
            </button>
            <button type="button" className={`${styles.iconBtn} ${styles.closeBtn}`} aria-label="Close the assistant" onClick={closeAssistant}>
              {Icon.close}
            </button>
          </div>

          <div className={styles.stage}>
            <section className={styles.chat}>
              <div ref={threadRef} className={styles.thread} aria-live="polite" data-reveal>
                <div className={styles.threadInner}>
                  {messages.map((m) =>
                    m.role === 'user' ? (
                      <p key={m.id} className={styles.msgUser}>
                        {m.text}
                      </p>
                    ) : (
                      <div key={m.id} className={styles.msgBot}>
                        <p>
                          {m.text}
                          {!m.done && <span className={styles.caret} aria-hidden="true" />}
                        </p>
                        {m.done && (m.links?.length || m.action) && (
                          <div className={styles.extras}>
                            {m.action && (
                              <button type="button" className={styles.actionBtn} onClick={() => go(m.action!.target)}>
                                {m.action.label}
                              </button>
                            )}
                            {m.links?.map((l) => (
                              <a key={l.label} className={styles.linkPill} href={l.href} target={l.href.startsWith('mailto:') ? undefined : '_blank'} rel="noreferrer">
                                {l.label}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  )}
                  {phase === 'thinking' && (
                    <p className={styles.thinking} aria-label="Thinking">
                      <em>Hmm</em>
                      <i />
                      <i />
                      <i />
                    </p>
                  )}
                </div>
              </div>

              {chips.length > 0 && !busy && (
                <div className={styles.chips} data-reveal>
                  {chips.map((c) => (
                    <button key={c} type="button" className={styles.chip} onClick={() => send(c)}>
                      {c}
                    </button>
                  ))}
                </div>
              )}

              <form
                className={styles.inputWrap}
                data-reveal
                onSubmit={(e) => {
                  e.preventDefault();
                  send(input);
                }}
              >
                <div className={`${styles.pill} ${listening ? styles.pillLive : ''}`}>
                  {micOk && (
                    <button
                      type="button"
                      className={`${styles.mic} ${listening ? styles.micOn : ''}`}
                      onClick={listening ? stopMic : startMic}
                      aria-label={listening ? 'Stop listening' : 'Speak your question'}
                      aria-pressed={listening}
                    >
                      {Icon.mic}
                    </button>
                  )}
                  <input
                    ref={inputRef}
                    className={styles.field}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={listening ? 'Listening…' : 'Ask me anything…'}
                    aria-label="Ask the assistant"
                    autoComplete="off"
                    maxLength={400}
                    enterKeyHint="send"
                  />
                  {busy || listening ? (
                    <button type="button" className={styles.stop} onClick={onStop} aria-label="Stop">
                      <span />
                    </button>
                  ) : (
                    <button type="submit" className={styles.send} disabled={!input.trim()} aria-label="Send">
                      {Icon.arrow}
                    </button>
                  )}
                </div>
                {notice && (
                  <p className={styles.note} role="status">
                    {notice}
                  </p>
                )}
              </form>
            </section>

            <div className={styles.orbCell}>
              <div ref={orbWrapRef} className={styles.orbWrap}>
                <AssistantOrb ref={orbRef} active={open} theme={theme} />
              </div>
            </div>
          </div>
          <span className={styles.srOnly}>{last?.role === 'assistant' && last.done ? last.text : ''}</span>
        </div>
      )}
    </>
  );
}
