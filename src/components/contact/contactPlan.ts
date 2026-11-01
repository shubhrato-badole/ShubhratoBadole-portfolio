/* How the Contact section should run on THIS device. Decided once per page load, on the client only.
   Nothing here touches the GPU or does any heavy work: it only reads a few numbers, so it can never slow the page's opening.

   mode
     'live'   : the real 3D scene (public/contact-scene/scene.html) in an iframe. It picks its own quality tier and watches
                its own frame rate (see the comments in scene.html).
     'static' : NO 3D at all: the high-quality lake picture, a crossfade to the garden picture, and the normal page panel.
                Zero GPU work, zero lag. This is the default on PHONES AND TABLETS (touch screens), and is used on any device that
                should not run a WebGL scene (data-saver, reduced motion, <= 2 GB memory, no import maps, no WebGL, or the scene
                already had to give up on this device within the last 7 days).
   reach: how many screens before the section the scene may start loading (it also waits for the scrolling to stop).

   Phones: change LIVE_ON_TOUCH to true to let touch devices run the 3D scene too. Test it on a real phone first.
   Testing: ?contact=static  or  ?contact=live  forces a mode. */

export type ContactMode = 'live' | 'static';
export type ContactReach = 'early' | 'near' | 'late';
export type ContactPlan = { mode: ContactMode; reach: ContactReach };

export const TIER_KEY = 'contact:tier';
export const LIVE_ON_TOUCH = false;
const SERVER_PLAN: ContactPlan = { mode: 'live', reach: 'near' };

type Nav = Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };

let cached: ContactPlan | null = null;
const listeners = new Set<() => void>();

function remembered(): string | null {
  try {
    const o = JSON.parse(localStorage.getItem(TIER_KEY) || 'null') as { v?: string; t?: number } | null;
    if (o && typeof o.t === 'number' && Date.now() - o.t < 7 * 864e5 && typeof o.v === 'string') return o.v;
  } catch {
    /* storage blocked: no memory, that is fine */
  }
  return null;
}

export function getContactPlan(): ContactPlan {
  if (typeof window === 'undefined') return SERVER_PLAN;
  if (cached) return cached;

  const nav = navigator as Nav;
  const mem = nav.deviceMemory || 0;
  const cores = nav.hardwareConcurrency || 0;
  const save = !!nav.connection?.saveData;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const forced = new URLSearchParams(window.location.search).get('contact');

  /* the scene loads its patched files through an import map; a browser without one gets pictures */
  const importMaps = typeof HTMLScriptElement !== 'undefined' && !!(HTMLScriptElement as unknown as { supports?: (t: string) => boolean }).supports?.('importmap');

  let mode: ContactMode = 'live';
  if (forced === 'static') mode = 'static';
  else if (forced !== 'live' && ((coarse && !LIVE_ON_TOUCH) || reduce || save || !importMaps || (mem > 0 && mem <= 2) || (cores > 0 && cores <= 2) || remembered() === 'poster')) mode = 'static';

  const reach: ContactReach = !coarse && (mem === 0 || mem >= 8) && (cores === 0 || cores >= 8) ? 'early' : 'near';

  cached = { mode, reach };
  return cached;
}

/* the scene reported that it cannot run here (no WebGL): switch to pictures for the rest of this visit */
export function forceStatic() {
  const cur = getContactPlan();
  if (cur.mode === 'static') return;
  cached = { mode: 'static', reach: cur.reach };
  try {
    localStorage.setItem(TIER_KEY, JSON.stringify({ v: 'poster', t: Date.now() }));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

/* useSyncExternalStore pieces: the server (and the first hydration pass) assume 'live'; the client then uses the real plan */
export const subscribePlan = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
export const getServerPlan = () => SERVER_PLAN;
