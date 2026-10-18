'use client'
import Link from 'next/link'
import { useEffect } from 'react'
import gsap from 'gsap'
import Lenis from 'lenis'
import { projects } from './data'
import GlPlane from './GlPlane'
import { useWork } from './GlProvider'
import Decode from './Decode'
import './work.css'

export default function ProjectDetail({ slug }: { slug: string }) {
  const idx = projects.findIndex((x) => x.slug === slug), p = projects[idx]
  const next = projects[(idx + 1) % projects.length]
  const { world, close } = useWork()
  const pad = (n: number) => String(n).padStart(3, '0')

  // Smooth scroll (Lenis driven by GSAP's ticker, as on the reference). Only runs on project pages.
  useEffect(() => {
    const l = new Lenis({ lerp: 0.1 })
    const tick = (t: number) => l.raf(t * 1000)
    gsap.ticker.add(tick); gsap.ticker.lagSmoothing(0)
    return () => { gsap.ticker.remove(tick); l.destroy() }
  }, [])

  return (
    <main className="wk-detail" data-wk-smoke>
      <div className="wk-container wk-detail__bar">
        <Link href="/#work" className="wk-detail__back" onClick={(e) => {
          if (!world || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return
          e.preventDefault(); close(slug)
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M19 12H5M12 19l-7-7 7-7" /></svg> Work
        </Link>
        <span className="wk-mono">PRJCT /0{idx + 1}</span>
      </div>

      <header className="wk-container wk-detail__head">
        <h1 className="wk-detail__title"><Decode text={p.title} ms={750} /></h1>
        <div className="wk-grid wk-detail__meta">
          <div className="wk-detail__sum">
            <p className="wk-mono wk-detail__tag"><Decode text={p.tagline} ms={700} /></p>
            <p className="wk-lead">{p.summary}</p>
            <div className="wk-links">
              {p.links.live && <a className="wk-btn" href={p.links.live} target="_blank" rel="noopener noreferrer">Live preview ↗</a>}
              {p.links.github && <a className="wk-btn" href={p.links.github} target="_blank" rel="noopener noreferrer">GitHub ↗</a>}
            </div>
          </div>
          <dl className="wk-detail__facts">
            <div><dt>Type</dt><dd><Decode text={p.type} /></dd></div>
            <div><dt>Status</dt><dd><Decode text={p.status} /></dd></div>
            {p.year && <div><dt>Year</dt><dd><Decode text={p.year} /></dd></div>}
            <div><dt>Scope</dt><dd><Decode text={p.scope.join(' / ')} /></dd></div>
          </dl>
        </div>
      </header>

      <div className="wk-container">
        <div className="wk-detail__media"><GlPlane project={p} group="hero" /></div>
        {p.placeholder && <p className="wk-mono wk-note">Placeholder visual — project screenshots coming soon</p>}
      </div>

      <div className="wk-detail__fade">
        <section className="wk-container wk-grid wk-sec">
          <h2 className="wk-sec__h">Overview</h2>
          <div className="wk-sec__b">{p.description.map((d) => <p className="wk-lead" key={d}>{d}</p>)}</div>
        </section>

        <section className="wk-container wk-grid wk-sec">
          <h2 className="wk-sec__h">Tech stack</h2>
          <div className="wk-sec__b">
            <ul className="wk-chips">{p.stack.map((s) => <li key={s}>{s}</li>)}</ul>
            <ul className="wk-spec">{p.stackGroups.map((s) => <li key={s.label}><span className="wk-spec__l">{s.label}</span><span className="wk-mono">{s.items}</span></li>)}</ul>
          </div>
        </section>

        <section className="wk-container wk-grid wk-sec">
          <h2 className="wk-sec__h">Features</h2>
          <ul className="wk-sec__b wk-feat">
            {p.features.map((f, i) => (
              <li key={f.name}><small className="wk-mono">({pad(i + 1)})</small><div><strong>{f.name}</strong>{f.text && <span>{f.text}</span>}</div></li>
            ))}
          </ul>
        </section>

        {(p.shots.length > 0 || p.demo) && (
          <section className="wk-container wk-grid wk-sec">
            <h2 className="wk-sec__h">Preview</h2>
            <div className="wk-sec__b wk-media">
              {p.shots.map((s) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={s} className="wk-shot" src={s} alt={`${p.title} screenshot`} loading="lazy" />
              ))}
              {p.demo && <video className="wk-shot" src={p.demo} poster={p.shots[0]} controls muted loop playsInline preload="metadata" />}
            </div>
          </section>
        )}

        <section className="wk-container wk-grid wk-sec">
          <h2 className="wk-sec__h">Architecture</h2>
          <ol className="wk-sec__b wk-flow">{p.architecture.map((a) => <li key={a}>{a}</li>)}</ol>
        </section>

        {p.facts.map((f) => (
          <section className="wk-container wk-grid wk-sec" key={f.title}>
            <h2 className="wk-sec__h">{f.title}</h2>
            <ul className="wk-sec__b wk-spec">{f.items.map((it) => <li key={it.label}><span className="wk-spec__l">{it.label}</span><span className="wk-mono">{it.value}</span></li>)}</ul>
          </section>
        ))}

        {p.links.api && (
          <section className="wk-container wk-grid wk-sec">
            <h2 className="wk-sec__h">Links</h2>
            <div className="wk-sec__b wk-links">
              {p.links.live && <a className="wk-btn" href={p.links.live} target="_blank" rel="noopener noreferrer">Live preview ↗</a>}
              {p.links.github && <a className="wk-btn" href={p.links.github} target="_blank" rel="noopener noreferrer">GitHub ↗</a>}
              <a className="wk-btn" href={p.links.api} target="_blank" rel="noopener noreferrer">Backend API ↗</a>
            </div>
          </section>
        )}

        <Link className="wk-container wk-detail__next" href={`/projects/${next.slug}`}>
          <span className="wk-mono">Next project</span>
          <span className="wk-detail__next-t">{next.title} <i>→</i></span>
        </Link>
      </div>
    </main>
  )
}
