'use client'
import { useEffect, useRef } from 'react'
import { useWork } from './GlProvider'
import type { Project } from './data'

type Props = { project: Project; group: 'card' | 'hero'; hover?: boolean }

/** Transparent placeholder; the real pixels are drawn by the shared WebGL layer at this element's rect. */
export default function GlPlane({ project, group, hover = false }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const { world, heroMounted } = useWork()

  useEffect(() => {
    const el = ref.current
    if (!world || !el) return
    const host = (el.closest('[data-wk-hover]') ?? el) as HTMLElement
    const plane = world.addPlane(el, { key: project.slug, src: project.media, video: project.video, focus: project.focus, group, hoverDark: project.hoverDark, edge: group === 'card' },
      { hold: group === 'hero' && !!document.documentElement.dataset.wkLanding })
    const radius = () => { plane.radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0 }
    const on = (e: PointerEvent) => { if (e.pointerType === 'mouse') world.hover(plane, true) }
    const off = () => world.hover(plane, false)
    radius(); addEventListener('resize', radius)
    const mv = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      const b = el.getBoundingClientRect(); plane.tmx = (e.clientX - b.left) / b.width - .5; plane.tmy = -((e.clientY - b.top) / b.height - .5)
    }
    if (hover) { host.addEventListener('pointerenter', on); host.addEventListener('pointerleave', off); host.addEventListener('pointermove', mv) }
    if (group === 'hero') heroMounted()
    return () => {
      removeEventListener('resize', radius); host.removeEventListener('pointerenter', on); host.removeEventListener('pointerleave', off); host.removeEventListener('pointermove', mv)
      world.removePlane(plane)
    }
  }, [world, project, group, hover, heroMounted])

  return (
    <>
      <canvas ref={ref} className="wk-plane" hidden={world === null} role="img" aria-label={`${project.title} — ${project.mediaSub}`} />
      {world === null && /* eslint-disable-next-line @next/next/no-img-element */ <img src={project.media} alt="" className="wk-fallback" />}
    </>
  )
}
