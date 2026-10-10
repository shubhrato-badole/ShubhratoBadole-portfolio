/* ------------------------------------------------------------------ *
 *  HERO THEME: the one place to change the look of the assistant.
 *  Everything (takeover colours, chips, input, orb palette, glow)
 *  is derived from this file; nothing else hard-codes a colour.
 * ------------------------------------------------------------------ */

export type HeroTheme = {
  /* surfaces + text */
  background: string;
  backgroundAlt: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  accent: string; // buttons, caret, focus ring
  accentSoft: string; // hover borders, highlights
  inputBg: string;
  inputText: string;
  danger: string; // stop button, close hover
  /* orb palette: these feed the shader as uniforms */
  orbPrimary: string; // main body colour
  orbSecondary: string; // warm/complement colour in the body + aura
  orbAccent: string; // cool rim light + highlights
  orbDeep: string; // shadow colour inside the body and aura
  orbHot: string; // specular + core highlight
  orbComet: string; // the loading comet
  orbVoice: string; // colour the orb leans toward while speaking
  orbAlert: string; // brief flash when you press Stop
  /* soft light used behind the orb and under the input */
  glow: string;
};

export const HERO_THEME: HeroTheme = {
  background: '#050511',
  backgroundAlt: '#080819',
  surface: '#0C0C1D',
  text: '#F0F0F8',
  muted: '#9294AE',
  border: 'rgba(255,255,255,0.10)',
  accent: '#4C6FFF',
  accentSoft: '#93A8FF',
  inputBg: '#F5F6FF',
  inputText: '#0B0D22',
  danger: '#FF5A46',

  orbPrimary: '#4C6FFF',
  orbSecondary: '#9A5CFF',
  orbAccent: '#4CC9FF',
  orbDeep: '#1E1E9E',
  orbHot: '#EEF0FF',
  orbComet: '#9DB2FF',
  orbVoice: '#FF6FD0',
  orbAlert: '#FF6A5C',

  glow: 'rgba(76,111,255,0.35)',
};

/* ------------------------------------------------------------------ *
 *  ORB TUNING: numbers you can change without touching any shader.
 * ------------------------------------------------------------------ */
export const ORB_TUNING = {
  /** Visible orb diameter (CSS length). The canvas is drawn ~1.6x larger so the aura has room. */
  size: { desktop: 'min(34vw, 62vh)', mobile: 'min(60vw, 28vh)' },
  /** Multiplies every state's glow. 1 = as designed, 0.6 = calmer, 1.3 = brighter. */
  glow: 1,
  /** How fast the liquid pattern inside the orb evolves. */
  flowSpeed: 1,
  /** Global speed of everything (rotation, drift, flow). */
  animationSpeed: 1,
  /** How strongly speech drives the orb (energy, glow, ripples, surface). 0 = ignores speech. */
  speakingIntensity: 1,
  /** How much the mouse tilts/stirs the orb. 0 = off. */
  pointerStrength: 1,
  /** Rendering detail. More steps / octaves = richer but heavier. */
  detail: {
    /** raymarch steps through the orb (24 to 64). */
    steps: 48,
    /** fraction of full pixel resolution the orb renders at (0.5 to 1). */
    renderScale: 0.85,
    /** layers of folded structure inside the orb (2 to 4). */
    octaves: 3,
    maxPixelRatio: 1.5,
  },
  bloom: { intensity: 0.6, threshold: 0.55, smoothing: 0.25, glowAlpha: 0.5, downscale: 4 },
  /** seconds: state changes and palette changes are always eased, never switched. */
  transitions: { state: 0.7, palette: 0.9 },
  /** Lower the resolution automatically if frames take too long. */
  adaptiveQuality: true,
  /** Use the real microphone level (when allowed) to drive the orb while listening. */
  useMicLevel: true,
};

/* ------------------------------------------------------------------ *
 *  colour helpers + the per-state palettes (derived from the theme,
 *  so changing orbPrimary etc. recolours every state automatically)
 * ------------------------------------------------------------------ */
export type Rgb = [number, number, number];

export function parseColor(hex: string): Rgb {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const lighten = (c: Rgb, t: number) => mixRgb(c, [1, 1, 1], t);
const darken = (c: Rgb, t: number) => mixRgb(c, [0, 0, 0], t);
const desaturate = (c: Rgb, t: number): Rgb => {
  const l = c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
  return mixRgb(c, [l, l, l], t);
};
/** The shader works in linear light (its own tone-map converts back), so palette colours are linearised. */
const toLinear = (c: Rgb): Rgb =>
  c.map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))) as Rgb;

export type OrbPhase =
  | 'idle'
  | 'entering'
  | 'listening'
  | 'thinking'
  | 'synthesizing'
  | 'speaking'
  | 'sleeping'
  | 'exiting'
  | 'interrupt';

export type OrbState = {
  flow: number;
  speed: number;
  spin: number;
  blobEnergy: number;
  glow: number;
  loading: number;
  waves: number;
  /** pal[0] warm accent, pal[1] body, pal[2] rim light, pal[3] deep. Linear light. */
  palette: [Rgb, Rgb, Rgb, Rgb];
  hot: Rgb;
  comet: Rgb;
};

export function buildOrbStates(t: HeroTheme): Record<OrbPhase, OrbState> {
  const primary = parseColor(t.orbPrimary);
  const secondary = parseColor(t.orbSecondary);
  const accent = parseColor(t.orbAccent);
  const deep = parseColor(t.orbDeep);
  const hot = parseColor(t.orbHot);
  const comet = parseColor(t.orbComet);
  const voice = parseColor(t.orbVoice);
  const alert = parseColor(t.orbAlert);

  const calm: [Rgb, Rgb, Rgb, Rgb] = [secondary, primary, accent, deep];
  const thinkingPal: [Rgb, Rgb, Rgb, Rgb] = [
    lighten(secondary, 0.3),
    lighten(primary, 0.3),
    lighten(accent, 0.25),
    lighten(mixRgb(secondary, primary, 0.5), 0.35),
  ];
  const synthPal: [Rgb, Rgb, Rgb, Rgb] = [
    mixRgb(voice, secondary, 0.35),
    lighten(primary, 0.15),
    lighten(accent, 0.2),
    lighten(secondary, 0.25),
  ];
  const speakPal: [Rgb, Rgb, Rgb, Rgb] = [
    voice,
    mixRgb(primary, secondary, 0.45),
    accent,
    lighten(voice, 0.3),
  ];
  const sleepPal: [Rgb, Rgb, Rgb, Rgb] = [
    desaturate(darken(secondary, 0.1), 0.6),
    desaturate(darken(primary, 0.15), 0.6),
    desaturate(darken(accent, 0.2), 0.55),
    desaturate(lighten(deep, 0.1), 0.5),
  ];
  const alertPal: [Rgb, Rgb, Rgb, Rgb] = [
    alert,
    mixRgb(alert, secondary, 0.3),
    mixRgb(alert, primary, 0.3),
    secondary,
  ];

  const mk = (
    p: Omit<OrbState, 'palette' | 'hot' | 'comet'>,
    palette: [Rgb, Rgb, Rgb, Rgb],
    h: Rgb = hot,
    c: Rgb = comet
  ): OrbState => ({
    ...p,
    palette: palette.map(toLinear) as [Rgb, Rgb, Rgb, Rgb],
    hot: toLinear(h),
    comet: toLinear(c),
  });

  /* flow / speed / spin / blobEnergy / glow / loading / waves: the same
     state table the reference orb uses, so the states keep their feel */
  return {
    idle: mk({ flow: 0.5, speed: 0.32, spin: 0.1, blobEnergy: 0.2, glow: 0.95, loading: 0, waves: 0 }, calm),
    entering: mk({ flow: 0.7, speed: 0.6, spin: 0.14, blobEnergy: 0.45, glow: 1, loading: 0, waves: 0 }, calm),
    listening: mk({ flow: 0.5, speed: 0.32, spin: 0.1, blobEnergy: 0.5, glow: 1, loading: 0, waves: 0 }, calm),
    thinking: mk(
      { flow: 1.4, speed: 1.5, spin: 0.3, blobEnergy: 0.7, glow: 1.1, loading: 1, waves: 0 },
      thinkingPal,
      lighten(hot, 0.5)
    ),
    synthesizing: mk(
      { flow: 1.1, speed: 1.2, spin: 0.22, blobEnergy: 0.8, glow: 1.05, loading: 0.6, waves: 0.5 },
      synthPal,
      lighten(hot, 0.4)
    ),
    speaking: mk(
      { flow: 1.2, speed: 0.8, spin: 0.18, blobEnergy: 1, glow: 1.15, loading: 0, waves: 1 },
      speakPal,
      lighten(voice, 0.75)
    ),
    sleeping: mk(
      { flow: 0.12, speed: 0.1, spin: 0.04, blobEnergy: 0.1, glow: 0.4, loading: 0, waves: 0 },
      sleepPal,
      desaturate(hot, 0.5)
    ),
    exiting: mk({ flow: 0.6, speed: 0.5, spin: 0.12, blobEnergy: 0.3, glow: 0.8, loading: 0, waves: 0 }, calm),
    interrupt: mk(
      { flow: 1.8, speed: 1.8, spin: 0.28, blobEnergy: 0.9, glow: 1.2, loading: 0, waves: 0 },
      alertPal,
      lighten(alert, 0.7)
    ),
  };
}

/** CSS custom properties for the takeover + launcher, generated from the theme. */
export function themeToCssVars(t: HeroTheme): Record<string, string> {
  return {
    '--h-bg': t.background,
    '--h-bg2': t.backgroundAlt,
    '--h-surface': t.surface,
    '--h-text': t.text,
    '--h-muted': t.muted,
    '--h-border': t.border,
    '--h-accent': t.accent,
    '--h-accent-soft': t.accentSoft,
    '--h-input-bg': t.inputBg,
    '--h-input-text': t.inputText,
    '--h-danger': t.danger,
    '--h-glow': t.glow,
    '--h-orb-secondary': t.orbSecondary,
    '--orb-d-desktop': ORB_TUNING.size.desktop,
    '--orb-d-mobile': ORB_TUNING.size.mobile,
  };
}
