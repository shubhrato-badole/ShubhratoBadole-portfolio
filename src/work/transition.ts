import gsap from 'gsap'

/**
 * Card <-> project transition. A plain module (no React provider needed), so nothing has to be mounted in layout.tsx.
 *
 * One fixed "flyer" (a single <img>) is moved by GSAP between the clicked card and the project hero.
 * Nothing is polled and there are no fixed sleeps: the route change is awaited, the hero reports when it is mounted,
 * and the flight only starts once the main thread is calm (`settle`), so heavy page boots can't stutter it.
 */
type Router = { push: (href: string) => void }

let busy = false
let heroEl: HTMLElement | null = null
let heroWait: ((el: HTMLElement | null) => void) | null = null
let cardsWait: (() => void) | null = null

const frames = (n: number) => new Promise<void>((r) => { const f = (i: number): void => (i <= 0 ? r() : void requestAnimationFrame(() => f(i - 1))); f(n) })
const tween = (target: gsap.TweenTarget, vars: gsap.TweenVars) => new Promise<void>((res) => { gsap.to(target, { ...vars, onComplete: () => res() }) })
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const place = (r: DOMRect) => ({ left: r.left, top: r.top, width: r.width, height: r.height })
const root = () => document.documentElement

/** resolves once ~5 consecutive frames are fast (or after maxMs): start animating only when the page is calm */
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const settle = (maxMs = 1500) => new Promise<void>((res) => {
  const t0 = performance.now(); let last = t0, calm = 0
  const f = (now: number) => {
    calm = now - last < 24 ? calm + 1 : 0; last = now
    if (calm >= 5 || now - t0 > maxMs) res(); else requestAnimationFrame(f)
  }
  requestAnimationFrame(f)
})

/** instant scroll even if the site sets `scroll-behavior: smooth` */
const jump = (fn: () => void) => { const r = root(), prev = r.style.scrollBehavior; r.style.scrollBehavior = 'auto'; fn(); r.style.scrollBehavior = prev }

/** put the card in the middle of the screen and make sure it STAYS there (the home page is still booting: layout can shift) */
async function centerCard(card: HTMLElement) {
  for (let i = 0; i < 12; i++) {
    const r = card.getBoundingClientRect()
    const dy = r.top + r.height / 2 - innerHeight / 2
    if (Math.abs(dy) < 3 && i > 0) { await frames(2); const r2 = card.getBoundingClientRect(); if (Math.abs(r2.top + r2.height / 2 - innerHeight / 2) < 3) return }
    const y = scrollY + dy
    jump(() => window.scrollTo(0, y)) // native jump: the page's smooth-scroll picks it up
    await frames(2)
  }
}

/** current frame of a playing card video as an image (so the flight starts exactly from what the user clicked) */
function snapshot(v: HTMLVideoElement | null): string | null {
  try {
    if (!v || v.readyState < 2 || !v.videoWidth) return null
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight
    c.getContext('2d')!.drawImage(v, 0, 0)
    return c.toDataURL('image/jpeg', 0.9)
  } catch { return null }
}

function makeFlyer(src: string, r: DOMRect, radius: string, snap?: string | null) {
  const el = document.createElement('div')
  el.className = 'wk-fly'
  Object.assign(el.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, borderRadius: radius })
  const im = new Image()
  im.src = src; im.alt = ''; im.decoding = 'sync'; im.draggable = false
  el.appendChild(im)
  if (snap) { const s = new Image(); s.src = snap; s.alt = ''; s.className = 'wk-fly__snap'; s.decoding = 'sync'; el.appendChild(s) }
  document.body.appendChild(el)
  return el
}

/** While a transition runs, keep the heavy 3D contact-scene iframe from booting (it would steal frames); let it load afterwards. */
function holdScenes() {
  const held = new Map<HTMLIFrameElement, string>()
  const hold = (f: HTMLIFrameElement) => { const s = f.getAttribute('src'); if (s && !held.has(f)) { held.set(f, s); f.removeAttribute('src') } }
  document.querySelectorAll<HTMLIFrameElement>('iframe').forEach(hold)
  const mo = new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach((n) => {
    if (n instanceof HTMLIFrameElement) hold(n)
    else if (n instanceof HTMLElement) n.querySelectorAll('iframe').forEach(hold)
  })))
  mo.observe(document.body, { childList: true, subtree: true })
  return () => { mo.disconnect(); held.forEach((s, f) => { if (f.isConnected) f.setAttribute('src', s) }) }
}

const makeVeil = () => { const v = document.createElement('div'); v.className = 'wk-veil'; document.body.appendChild(v); return v }

export const registerHero = (el: HTMLElement | null) => { heroEl = el; if (el) heroWait?.(el) }
export const cardsMounted = () => cardsWait?.()
export const isBusy = () => busy

/** Safety net: if a page is shown while no transition is running, make sure no flag / overlay from an aborted one is left behind. */
export function resetStale() {
  if (busy) return
  const r = root(); delete r.dataset.wkBusy; delete r.dataset.wkLanding
  document.querySelectorAll('.wk-fly, .wk-veil').forEach((e) => e.remove())
}

/** card -> project */
export async function openProject(router: Router, slug: string, mediaEl: HTMLElement) {
  if (busy) return
  if (reduced()) { router.push(`/projects/${slug}`); return }
  busy = true
  const r = root(); r.dataset.wkBusy = '1'; r.dataset.wkLanding = '1'
  let fl: HTMLElement | null = null, veil: HTMLElement | null = null
  const watchdog = setTimeout(() => { fl?.remove(); veil?.remove(); delete r.dataset.wkBusy; delete r.dataset.wkLanding; busy = false }, 15000)
  try {
    const r0 = mediaEl.getBoundingClientRect()
    const img = mediaEl.querySelector('img')
    fl = makeFlyer(img?.currentSrc || img?.src || '', r0, getComputedStyle(mediaEl).borderTopLeftRadius, snapshot(mediaEl.querySelector('video')))
    mediaEl.style.visibility = 'hidden' // same frame the flyer appears: nothing flashes
    // a dark veil fades in over the page (one composited layer; nothing underneath is re-rendered) while the route is requested
    veil = makeVeil()
    const veilDone = tween(veil, { opacity: 1, duration: 0.3, ease: 'power1.inOut' })
    const hero = new Promise<HTMLElement | null>((res) => { heroWait = res; setTimeout(() => res(null), 8000) })
    await sleep(200)
    router.push(`/projects/${slug}`)
    await veilDone
    const target = await hero
    heroWait = null
    if (!target) { mediaEl.style.visibility = ''; return }

    await frames(2)
    jump(() => window.scrollTo(0, 0))
    await Promise.race([settle(700), sleep(900)])
    const r1 = target.getBoundingClientRect()
    gsap.to(veil, { opacity: 0, duration: 0.3, ease: 'power1.out' }) // the project page has the same background: nothing visibly changes
    gsap.delayedCall(0.8 * 0.8, () => window.dispatchEvent(new Event('wk:landed'))) // text starts just before the image lands
    const snap = fl.querySelector('.wk-fly__snap'); if (snap) gsap.to(snap, { opacity: 0, duration: 0.5, ease: 'power1.inOut' }) // video frame -> the still the project page shows
    await tween(fl, { ...place(r1), duration: 0.85, ease: 'power4.inOut' })
    target.style.visibility = 'visible'
    delete r.dataset.wkLanding
    await frames(1) // hero painted under the flyer, then lift the flyer off
    target.style.visibility = ''
  } finally {
    clearTimeout(watchdog); heroWait = null
    fl?.remove(); veil?.remove()
    delete r.dataset.wkBusy; delete r.dataset.wkLanding; busy = false
  }
}

/** project -> card (mirror): the veil covers the page swap, the hero image flies back into its card */
export async function closeProject(router: Router, slug: string) {
  const hero = heroEl
  if (busy) return
  if (!hero || reduced()) { router.push('/#work'); return }
  busy = true
  const r = root(); r.dataset.wkBusy = '1'
  const release = holdScenes()
  let fl: HTMLElement | null = null
  const veil = makeVeil()
  const watchdog = setTimeout(() => { fl?.remove(); veil.remove(); delete r.dataset.wkBusy; busy = false; release() }, 20000)
  try {
    const r0 = hero.getBoundingClientRect()
    if (r0.bottom > 80 && r0.top < innerHeight - 80) {
      const img = hero.querySelector('img')
      fl = makeFlyer(img?.currentSrc || img?.src || '', r0, getComputedStyle(hero).borderTopLeftRadius)
      hero.style.visibility = 'hidden'
    }
    await tween(veil, { opacity: 1, duration: 0.3, ease: 'power1.inOut' })

    const cards = new Promise<void>((res) => { cardsWait = res; setTimeout(res, 8000) })
    router.push('/')
    await cards
    cardsWait = null
    await frames(2)

    const card = document.querySelector<HTMLElement>(`[data-wk-media="${slug}"]`)
    const stage = card?.closest<HTMLElement>('.wk-container')
    if (card && stage) {
      gsap.set(stage, { opacity: 0 }); card.style.visibility = 'hidden'
      await centerCard(card)
      await settle(1800) // let the home page finish booting before anything moves
      await centerCard(card)
      const r1 = card.getBoundingClientRect()
      gsap.to(veil, { opacity: 0, duration: 0.45, delay: 0.2, ease: 'power1.out' })
      gsap.to(stage, { opacity: 1, duration: 0.6, delay: 0.3, ease: 'power1.out' })
      if (fl) await tween(fl, { ...place(r1), duration: 0.8, ease: 'power4.inOut' })
      else await tween(veil, { opacity: 0, duration: 0.4 })
      card.style.visibility = ''
      await frames(1)
    }
  } finally {
    clearTimeout(watchdog); cardsWait = null
    fl?.remove(); veil.remove()
    delete r.dataset.wkBusy; busy = false
    window.dispatchEvent(new Event('wk:idle'))
    setTimeout(release, 2500) // the heavy scene boots only after the animation has fully settled
  }
}
