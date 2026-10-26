'use client'
import { useEffect, useRef, type ReactNode } from 'react'

/** Adds `.is-in` once the element scrolls into view (css does the fade/rise: opacity + transform only, so scrolling never repaints). */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // while a card <-> project transition is running, everything is simply already there
    if (document.documentElement.dataset.wkBusy || typeof IntersectionObserver === 'undefined') { el.classList.add('is-in', 'wk-instant'); return }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { el.classList.add('is-in'); io.disconnect() } }, { rootMargin: '0px 0px -6% 0px', threshold: 0.04 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return ref
}

export function Sec({ className = '', children }: { className?: string; children: ReactNode }) {
  const ref = useReveal<HTMLElement>()
  return <section ref={ref} className={`wk-reveal ${className}`}>{children}</section>
}
