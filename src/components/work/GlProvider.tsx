'use client'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { World, rectOf, type Plane } from './world'
import { createFluidSmoke } from './smoke'

type Ctx = { world: World | null | undefined; open: (slug: string, mediaEl: HTMLElement) => void; close: (slug: string) => void; heroMounted: () => void }
const WorkCtx = createContext<Ctx>({ world: undefined, open: () => {}, close: () => {}, heroMounted: () => {} })
export const useWork = () => useContext(WorkCtx)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const frames = (n: number) => new Promise<void>((r) => { const f = (i: number): void => (i <= 0 ? r() : void requestAnimationFrame(() => f(i - 1))); f(n) })

/** Mount once in app/layout.tsx. Owns the single WebGL canvas and the card -> project takeoff transition. */
export default function WorkGlProvider({ children, smoke = true }: { children: ReactNode; smoke?: boolean }) {
  const smokeCv = useRef<HTMLCanvasElement>(null)
  const [world, setWorld] = useState<World | null | undefined>(undefined)
  const router = useRouter()
  const busy = useRef(false)
  const heroWait = useRef<(() => void) | null>(null)

  // Cards: an offscreen WebGL context renders every plane, then copies it into that plane's own <canvas>.
  useEffect(() => {
    let w: World | null = null
    try { w = new World(document.createElement('canvas')) } catch (e) { console.warn('[work] WebGL unavailable, using plain images', e) }
    setWorld(w)
    return () => w?.dispose()
  }, [])

  // Cursor smoke: its own canvas, only inside [data-wk-smoke] sections (Work, project pages, and About if it has the attribute). Never in the hero.
  // It is the contact scene's own fluid smoke (./smoke.ts), the same code as the Intro's.
  useEffect(() => {
    if (!smoke || !matchMedia('(hover: hover) and (pointer: fine)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const s = createFluidSmoke(smokeCv.current!, { scope: '[data-wk-smoke]' })
    return () => s?.destroy()
  }, [smoke])

  const heroMounted = useCallback(() => heroWait.current?.(), [])

  /**
   * Takeoff, timed from the reference recording:
   * other cards fade out (far -> near) ~0.6s, route changes, then the clicked media flies to the hero slot
   * (1s power2.inOut, 0.1s delay) with a glitch + bulge that peaks mid-flight and resolves on landing.
   */
  const open = useCallback(async (slug: string, mediaEl: HTMLElement) => {
    const w = world
    const from = w && [...w.planes].find((p) => p.el === mediaEl)
    if (!w || !from || busy.current) return
    busy.current = true
    const root = document.documentElement
    const r0 = rectOf(from)!, cx = r0.x + r0.w / 2, cy = r0.y + r0.h / 2
    ;[...w.planes].filter((p) => p.o.group === 'card' && p !== from)
      .map((p) => { const r = rectOf(p)!; return { p, d: Math.hypot(r.x + r.w / 2 - cx, r.y + r.h / 2 - cy) } })
      .sort((a, b) => b.d - a.d)
      .forEach(({ p }, i) => w.fadeOut(p, i * 0.12, 0.45))
    const fl = document.createElement('canvas')
    Object.assign(fl.style, { position: 'fixed', left: `${r0.x}px`, top: `${r0.y}px`, width: `${r0.w}px`, height: `${r0.h}px`, zIndex: '90', pointerEvents: 'none', borderRadius: `${from.radius}px` })
    document.body.appendChild(fl)
    const fly = w.addPlane(fl, { ...from.o, group: 'fly', edge: false }, { op: 1, dark: from.dark, radius: from.radius })
    fly.rect = r0
    await frames(2) // let the flyer paint its first frame, then lift the original card out from under it
    from.hidden = true; mediaEl.style.visibility = 'hidden'
    root.dataset.wkLanding = '1'
    await sleep(650)
    const mounted = new Promise<void>((res) => { heroWait.current = res })
    router.push(`/projects/${slug}`)
    await Promise.race([mounted, sleep(4000)])
    await frames(3)
    const hero = [...w.planes].reverse().find((p) => p.o.group === 'hero')
    if (hero) await w.fly(fly, r0, () => rectOf(hero)!, 1000, 100)
    if (hero) { hero.hold = false; hero.op = 1 }
    w.removePlane(fly); fl.remove()
    delete root.dataset.wkLanding
    window.dispatchEvent(new Event('wk:landed'))
    busy.current = false
  }, [world, router])

  /**
   * Back from a project, the mirror of the takeoff: the page text fades out, the hero image flies back into its card
   * (1s power2.inOut), and the Work section is already scrolled to that card, so nothing jumps.
   */
  const close = useCallback(async (slug: string) => {
    const w = world
    const hero = w && [...w.planes].reverse().find((p) => p.o.group === 'hero')
    const heroEl = hero?.el
    if (!w || !hero || !heroEl || busy.current) { router.push('/#work'); return }
    busy.current = true
    const root = document.documentElement
    root.dataset.wkLeaving = '1' // page text fades out (css)
    await sleep(380)
    window.scrollTo(0, 0); await frames(2)
    const r0 = rectOf(hero)!
    const fl = document.createElement('canvas')
    Object.assign(fl.style, { position: 'fixed', left: `${r0.x}px`, top: `${r0.y}px`, width: `${r0.w}px`, height: `${r0.h}px`, zIndex: '90', pointerEvents: 'none', borderRadius: `${hero.radius}px` })
    document.body.appendChild(fl)
    const fly = w.addPlane(fl, { ...hero.o, group: 'fly', edge: false }, { op: 1, radius: hero.radius })
    fly.rect = r0
    await frames(2)
    hero.hidden = true; heroEl.style.visibility = 'hidden'
    router.push('/')
    let card: Plane | undefined
    for (let i = 0; i < 300 && !card; i++) {
      await frames(1)
      card = [...w.planes].reverse().find((p) => p.o.group === 'card' && p.o.key === slug && !!p.el?.isConnected)
    }
    delete root.dataset.wkLeaving
    const cardEl = card?.el
    if (card && cardEl) {
      cardEl.scrollIntoView({ block: 'center', behavior: 'auto' }) // land on the Work section, centred on this card
      await frames(2)
      card.hidden = true; cardEl.style.visibility = 'hidden'
      await w.fly(fly, r0, () => rectOf(card!)!, 1000, 0)
      card.hidden = false; card.op = 1; cardEl.style.visibility = ''
    }
    w.removePlane(fly); fl.remove()
    busy.current = false
  }, [world, router])

  return (
    <WorkCtx.Provider value={{ world, open, close, heroMounted }}>
      {children}
      <canvas ref={smokeCv} className="wk-smoke" aria-hidden />
    </WorkCtx.Provider>
  )
}
