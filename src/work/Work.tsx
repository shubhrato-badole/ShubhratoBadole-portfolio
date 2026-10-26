'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, type CSSProperties, type MouseEvent } from 'react'
import gsap from 'gsap'
import { projects, type Project } from './data'
import { useWork } from './GlProvider'
import { useReveal } from './reveal'
import WorkSmoke from './WorkSmoke'
import { resetStale } from './transition'
import './work.css'

const Corner = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m10 15 5 5 5-5" /><path d="M4 4h7a4 4 0 0 1 4 4v12" />
  </svg>
)

/** Looping muted card video. Plays only while the card is on screen; fades in over the still (which is its first frame). */
function CardVideo({ src }: { src: string }) {
  const v = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const el = v.current
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    // play while on screen. `check` is also re-run when a card transition ends (the page was scrolled by code, and the observer can miss that)
    const check = () => { const r = el.getBoundingClientRect(); if (r.bottom > 0 && r.top < innerHeight) el.play().catch(() => {}); else el.pause() }
    const io = new IntersectionObserver(check, { threshold: 0.25 })
    const on = () => el.classList.add('is-playing')
    el.addEventListener('playing', on)
    window.addEventListener('wk:idle', check)
    io.observe(el)
    return () => { io.disconnect(); el.removeEventListener('playing', on); window.removeEventListener('wk:idle', check) }
  }, [])
  return <video ref={v} className="wk-card__video" src={src} muted loop playsInline preload="metadata" aria-hidden />
}

function Card({ p, i }: { p: Project; i: number }) {
  const { open } = useWork()
  const item = useReveal<HTMLLIElement>()
  const media = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)

  // Hover: soft zoom + a little cursor parallax, driven by GSAP quickTo (transform only, no layout, no per-move allocation).
  useEffect(() => {
    const m = media.current, im = inner.current
    if (!m || !im || !matchMedia('(hover: hover) and (pointer: fine)').matches) return
    const x = gsap.quickTo(im, 'x', { duration: 0.8, ease: 'power3' })
    const y = gsap.quickTo(im, 'y', { duration: 0.8, ease: 'power3' })
    const s = (v: number) => gsap.to(im, { scale: v, duration: v > 1 ? 0.9 : 0.7, ease: 'power2.out', overwrite: 'auto' }) // (quickTo can't drive `scale`)
    let b: DOMRect | null = null
    const enter = (e: PointerEvent) => { if (e.pointerType !== 'mouse') return; b = m.getBoundingClientRect(); s(1.06) }
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || !b) return
      x(-((e.clientX - b.left) / b.width - 0.5) * 18); y(-((e.clientY - b.top) / b.height - 0.5) * 18)
    }
    const leave = () => { b = null; x(0); y(0); s(1) }
    m.addEventListener('pointerenter', enter); m.addEventListener('pointermove', move, { passive: true }); m.addEventListener('pointerleave', leave)
    return () => { m.removeEventListener('pointerenter', enter); m.removeEventListener('pointermove', move); m.removeEventListener('pointerleave', leave); gsap.killTweensOf(im) }
  }, [])

  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button || !media.current) return
    e.preventDefault()
    open(p.slug, media.current)
  }
  const rows: [string, string | string[]][] = [
    ['PRJCT', `/0${i + 1}`], p.year ? ['Created at:', p.year] : ['Status:', p.status],
    ['Name:', p.title], ['Type:', p.type], ['Scope:', p.scope], ['Stack:', p.stack],
  ]
  return (
    <li ref={item} className={`wk-item wk-card wk-card--${p.size} wk-reveal`} style={{ '--i': i } as CSSProperties}>
      <Link href={`/projects/${p.slug}`} prefetch onClick={onClick} className="wk-card__link">
        <div className="wk-card__media" ref={media} data-wk-media={p.slug} style={{ '--wk-dark': p.hoverDark } as CSSProperties}>
          <div className="wk-card__inner" ref={inner}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="wk-img" src={p.card} alt={`${p.title} — ${p.mediaSub}`} width={1200} height={1500} decoding="async" draggable={false} onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} />
            {p.cardVideo && <CardVideo src={p.cardVideo} />}
          </div>
          <div className="wk-card__scrim" aria-hidden />
          <div className="wk-card__overlay" aria-hidden>
            <div className="wk-data">
              {rows.map(([k, v]) => (
                <div className="wk-data__row" key={k}>
                  <span className="wk-data__k">{k}</span>
                  <span className="wk-data__v">{Array.isArray(v) ? v.map((s) => <span key={s}>{s}</span>) : v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="wk-card__info">
          <ul className="wk-card__scope">{p.scope.map((s) => <li key={s}>{s}</li>)}</ul>
          <div className="wk-card__title-wrap">
            <Corner className="wk-card__icon" />
            <h3 className="wk-card__title">{p.title}</h3>
          </div>
        </div>
      </Link>
    </li>
  )
}

export default function Work() {
  const { cardsMounted } = useWork()
  const router = useRouter()
  useEffect(() => { resetStale(); cardsMounted() }, [cardsMounted])
  // warm every project route so the click never waits on the network (production builds; dev compiles on demand)
  useEffect(() => { for (const p of projects) router.prefetch(`/projects/${p.slug}`) }, [router])

  return (
    <>
    <WorkSmoke />
    <section className="wk-section" id="work" data-wk-smoke>
      <div className="wk-container">
        <h2 className="wk-title wk-grid" aria-label="Some of my projects">
          <span className="wk-t1">Some</span>
          <span className="wk-t2">Of MY</span>
          <span className="wk-t3" aria-hidden><span className="wk-arrow"><span>⟶</span><span className="wk-arrow__ghost">⟶</span></span></span>
          <span className="wk-t4">projects</span>
        </h2>
        <div className="wk-grid wk-desc"><p>A selection of projects where design, technology, and strategy come together</p></div>
        <ul className="wk-grid wk-works">{projects.map((p, i) => <Card key={p.slug} p={p} i={i} />)}</ul>
      </div>
    </section>
    </>
  )
}
