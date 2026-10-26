'use client'
import { useEffect, useRef } from 'react'
import { createFluidSmoke } from './smoke'

/** Cursor smoke (same engine as before). One fixed wrapper blended with `screen`; hidden while a transition runs. */
export default function WorkSmoke() {
  const cv = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const s = createFluidSmoke(cv.current!, { scope: '[data-wk-smoke]' })
    return () => s?.destroy()
  }, [])
  return <div className="wk-smoke" aria-hidden><canvas ref={cv} /></div>
}
