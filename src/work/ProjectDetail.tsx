'use client'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import Lenis from 'lenis'
import { projects, type Clip } from './data'
import WorkSmoke from './WorkSmoke'
import { isBusy, resetStale } from './transition'
import { useWork } from './GlProvider'
import { Sec } from './reveal'
import Decode from './Decode'
import './work.css'

/** Demo video in a centred frame: plays muted while on screen, click (or Enter) to pause, thin progress line along the bottom. */
function ClipFigure({ clip, i, title }: { clip: Clip; i: number; title: string }) {
  const v = useRef<HTMLVideoElement>(null)
  const bar = useRef<HTMLSpanElement>(null)
  const held = useRef(false)
  const [hold, setHold] = useState(false)
  useEffect(() => {
    const el = v.current
    if (!el) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.controls = true; return }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { if (!held.current) el.play().catch(() => {}) } else el.pause() }, { threshold: 0.4 })
    io.observe(el)
    const tick = () => { if (bar.current && el.duration) bar.current.style.transform = `scaleX(${el.currentTime / el.duration})` }
    el.addEventListener('timeupdate', tick)
    return () => { io.disconnect(); el.removeEventListener('timeupdate', tick) }
  }, [])
  const toggle = () => {
    const el = v.current; if (!el) return
    held.current = !held.current; setHold(held.current)
    if (held.current) el.pause(); else void el.play()
  }
  return (
    <figure className="wk-clip">
      <div className="wk-clip__frame" style={{ aspectRatio: `${clip.w} / ${clip.h}` }} onClick={toggle} role="button" tabIndex={0}
        aria-label={`${hold ? 'Play' : 'Pause'} ${title} demo`} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } }}>
        <video ref={v} className="wk-clip__video" src={clip.src} poster={clip.poster} muted loop playsInline preload="none" />
        <span className="wk-clip__live"><i />Demo</span>
        <span className={`wk-clip__state${hold ? ' is-on' : ''}`} aria-hidden>▶</span>
        <span className="wk-clip__track" aria-hidden><span ref={bar} className="wk-clip__bar" /></span>
      </div>
      <figcaption className="wk-clip__cap">
        <span className="wk-mono">(0{i + 1})</span><span className="wk-clip__label">{clip.label}</span>
        <span className="wk-mono wk-clip__hint">Click to {hold ? 'play' : 'pause'}</span>
      </figcaption>
    </figure>
  )
}

export default function ProjectDetail({ slug }: { slug: string }) {
  const idx = projects.findIndex((x) => x.slug === slug), p = projects[idx]
  const next = projects[(idx + 1) % projects.length]
  const { close, registerHero } = useWork()
  const page = useRef<HTMLElement>(null)
  const hero = useRef<HTMLDivElement>(null)
  const pad = (n: number) => String(n).padStart(3, '0')

  // Smooth scroll (Lenis driven by GSAP's ticker). Only runs on project pages; cleans up completely so the home page's own scroller starts fresh.
  useEffect(() => {
    if (!isBusy()) resetStale()
    const html = document.documentElement
    const l = new Lenis({ lerp: 0.09, wheelMultiplier: 0.95 })
    const tick = (t: number) => l.raf(t * 1000)
    gsap.ticker.add(tick); gsap.ticker.lagSmoothing(0)
    return () => {
      gsap.ticker.remove(tick); l.destroy()
      html.classList.remove('lenis', 'lenis-smooth', 'lenis-scrolling', 'lenis-stopped'); html.style.removeProperty('overflow')
    }
  }, [])

  // The hero tells the provider it is mounted, so the flying image knows where to land.
  useEffect(() => { registerHero(hero.current); return () => registerHero(null) }, [registerHero, slug])

  // Entrance of the text. Arriving by the card transition: starts when the image is ~half way (wk:landed). Direct visit: right away.
  useEffect(() => {
    const root = document.documentElement, scope = page.current!
    const els = scope.querySelectorAll('[data-wk-rise]')
    const go = () => gsap.fromTo(els, { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out', stagger: 0.07, clearProps: 'transform' })
    if (root.dataset.wkLanding) { window.addEventListener('wk:landed', go, { once: true }); return () => { window.removeEventListener('wk:landed', go); gsap.killTweensOf(els) } }
    gsap.fromTo(hero.current, { opacity: 0, scale: 0.97 }, { opacity: 1, scale: 1, duration: 1, ease: 'power3.out', clearProps: 'transform' })
    go()
    return () => { gsap.killTweensOf(els); gsap.killTweensOf(hero.current) }
  }, [slug])

  const links = (
    <>
      {p.links.live && <a className="wk-btn" href={p.links.live} target="_blank" rel="noopener noreferrer">Live preview ↗</a>}
      {p.links.github && <a className="wk-btn" href={p.links.github} target="_blank" rel="noopener noreferrer">GitHub ↗</a>}
    </>
  )
  const clips = p.clips ?? []
  const hasVisuals = clips.length > 0 || p.shots.length > 0
  // shots sit two per row; the first (when there is no clip) and an odd leftover one go full width
  const lead = clips.length > 0
  const rest = lead ? p.shots.length : p.shots.length - 1
  const wide = (i: number) => (!lead && i === 0) || (rest % 2 === 1 && i === p.shots.length - 1)

  return (
    <main className="wk-detail" data-wk-smoke ref={page}>
      <WorkSmoke />
      <div className="wk-container wk-detail__bar" data-wk-rise>
        <Link href="/#work" className="wk-detail__back" onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return
          e.preventDefault(); close(slug)
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M19 12H5M12 19l-7-7 7-7" /></svg> Work
        </Link>
        <span className="wk-mono">PRJCT /0{idx + 1}</span>
      </div>

      {/* Split hero: info on the left, the same 4:5 image as the card on the right, so open / close is an exact morph. */}
      <header className="wk-container wk-hero">
        <div className="wk-hero__info">
          <div className="wk-hero__meta">
            <div className="wk-hero__col">
              <div data-wk-rise><span className="wk-lbl">Type <i>↴</i></span><p className="wk-val"><Decode text={p.type} /></p></div>
              <div data-wk-rise><span className="wk-lbl">Scope <i>↴</i></span>
                <ul className="wk-pills">{p.scope.map((s) => <li key={s}>{s}</li>)}</ul></div>
              {(p.links.live || p.links.github) && <div className="wk-links" data-wk-rise>{links}</div>}
            </div>
            <div className="wk-hero__col">
              <div data-wk-rise><span className="wk-lbl">{p.year ? 'Year' : 'Status'} <i>↴</i></span><p className="wk-val"><Decode text={p.year ?? p.status} /></p></div>
              <div data-wk-rise><span className="wk-lbl">About <i>↴</i></span><p className="wk-mono wk-hero__about">{p.summary}</p></div>
            </div>
          </div>
          <div className="wk-hero__head">
            <h1 className="wk-detail__title"><Decode text={p.title} ms={750} /></h1>
            <p className="wk-mono wk-detail__tag" data-wk-rise><Decode text={p.tagline} ms={700} /></p>
          </div>
        </div>
        <div className="wk-hero__media" ref={hero}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="wk-img" src={p.card} alt={`${p.title} — ${p.mediaSub}`} width={1200} height={1500} decoding="async" fetchPriority="high" draggable={false} />
        </div>
      </header>
      {p.placeholder && <p className="wk-container wk-mono wk-note" data-wk-rise>Placeholder visual — project screenshots coming soon</p>}

      <div className="wk-detail__body">
        <Sec className="wk-container wk-grid wk-sec">
          <h2 className="wk-sec__h">Overview</h2>
          <div className="wk-sec__b">{p.description.map((d) => <p className="wk-lead" key={d}>{d}</p>)}</div>
        </Sec>

        {hasVisuals && (
          <Sec className="wk-container wk-preview">
            <div className="wk-preview__head">
              <span className="wk-mono">(Preview)</span>
              <h2 className="wk-preview__h">{clips.length ? 'See it in motion' : 'Screens'}</h2>
            </div>
            <div className="wk-gallery">
              {clips.map((c, i) => <ClipFigure key={c.src} clip={c} i={i} title={p.title} />)}
              {p.shots.map((s, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={s.src} className="wk-shot" src={s.src} alt={s.alt} width={s.w} height={s.h} loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.display = 'none' }}
                  style={{ aspectRatio: `${s.w} / ${s.h}` }} data-wide={wide(i) ? '' : undefined} />
              ))}
            </div>
          </Sec>
        )}

        <Sec className="wk-container wk-grid wk-sec">
          <h2 className="wk-sec__h">Features</h2>
          <ul className="wk-sec__b wk-feat">
            {p.features.map((f, i) => (
              <li key={f.name}><small className="wk-mono">({pad(i + 1)})</small><div><strong>{f.name}</strong>{f.text && <span>{f.text}</span>}</div></li>
            ))}
          </ul>
        </Sec>

        <Sec className="wk-container wk-grid wk-sec">
          <h2 className="wk-sec__h">Tech stack</h2>
          <div className="wk-sec__b">
            <ul className="wk-chips">{p.stack.map((s) => <li key={s}>{s}</li>)}</ul>
            <ul className="wk-spec">{p.stackGroups.map((s) => <li key={s.label}><span className="wk-spec__l">{s.label}</span><span className="wk-mono">{s.items}</span></li>)}</ul>
          </div>
        </Sec>

        <Sec className="wk-container wk-grid wk-sec">
          <h2 className="wk-sec__h">Architecture</h2>
          <ol className="wk-sec__b wk-flow">{p.architecture.map((a) => <li key={a}>{a}</li>)}</ol>
        </Sec>

        {p.facts.map((f) => (
          <Sec className="wk-container wk-grid wk-sec" key={f.title}>
            <h2 className="wk-sec__h">{f.title}</h2>
            <ul className="wk-sec__b wk-spec">{f.items.map((it) => <li key={it.label}><span className="wk-spec__l">{it.label}</span><span className="wk-mono">{it.value}</span></li>)}</ul>
          </Sec>
        ))}

        {p.links.api && (
          <Sec className="wk-container wk-grid wk-sec">
            <h2 className="wk-sec__h">Links</h2>
            <div className="wk-sec__b wk-links">
              {links}
              <a className="wk-btn" href={p.links.api} target="_blank" rel="noopener noreferrer">Backend API ↗</a>
            </div>
          </Sec>
        )}

        <Link className="wk-container wk-detail__next" href={`/projects/${next.slug}`} prefetch>
          <span className="wk-mono">Next project</span>
          <span className="wk-detail__next-t">{next.title} <i>→</i></span>
        </Link>
      </div>
    </main>
  )
}
