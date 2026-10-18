'use client'
import Link from 'next/link'
import type { MouseEvent } from 'react'
import { projects, type Project } from './data'
import GlPlane from './GlPlane'
import { useWork } from './GlProvider'
import './work.css'

const Corner = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m10 15 5 5 5-5" /><path d="M4 4h7a4 4 0 0 1 4 4v12" />
  </svg>
)

function Card({ p, i }: { p: Project; i: number }) {
  const { world, open } = useWork()
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!world || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return
    e.preventDefault()
    open(p.slug, e.currentTarget.querySelector<HTMLElement>('.wk-plane')!)
  }
  const rows: [string, string | string[]][] = [
    ['PRJCT', `/0${i + 1}`], p.year ? ['Created at:', p.year] : ['Status:', p.status],
    ['Name:', p.title], ['Type:', p.type], ['Scope:', p.scope], ['Stack:', p.stack],
  ]
  return (
    <li className={`wk-item wk-card wk-card--${p.size}`}>
      <Link href={`/projects/${p.slug}`} onClick={onClick} className="wk-card__link" data-wk-hover>
        <div className="wk-card__media">
          <GlPlane project={p} group="card" hover />
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
  return (
    <section className="wk-section" id="work" data-wk-smoke>
      <div className="wk-container">
        <h2 className="wk-title wk-grid" aria-label="Some of our projects">
          <span className="wk-t1">Some</span>
          <span className="wk-t2">Of MY</span>
          <span className="wk-t3" aria-hidden><span className="wk-arrow"><span>⟶</span><span className="wk-arrow__ghost">⟶</span></span></span>
          <span className="wk-t4">projects</span>
        </h2>
        <div className="wk-grid wk-desc"><p>A selection of projects where design, technology, and strategy come together</p></div>
        <ul className="wk-grid wk-works">{projects.map((p, i) => <Card key={p.slug} p={p} i={i} />)}</ul>
      </div>
    </section>
  )
}
