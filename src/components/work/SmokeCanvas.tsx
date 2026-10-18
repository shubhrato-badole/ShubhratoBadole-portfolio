'use client'
import { useEffect, useRef, type CSSProperties } from 'react'
import { createFluidSmoke } from './smoke'

/** The same cursor smoke as the Work section and the Intro, covering its parent. Drop it inside any position:relative/fixed container. */
export default function SmokeCanvas({ className, style }: { className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const s = createFluidSmoke(ref.current!, { scope: null })
    return () => s?.destroy()
  }, [])
  return (
    <canvas ref={ref} className={className} aria-hidden
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', mixBlendMode: 'screen', zIndex: 0, ...style }} />
  )
}
