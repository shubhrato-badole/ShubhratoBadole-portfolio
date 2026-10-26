'use client'
import { useEffect, useState } from 'react'

const UP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', LOW = 'abcdefghijklmnopqrstuvwxyz'
// scramble with a letter of the same case so widths barely change; digits and punctuation stay put
const glyph = (c: string) => (/[A-Z]/.test(c) ? UP[Math.floor(Math.random() * 26)] : /[a-z]/.test(c) ? LOW[Math.floor(Math.random() * 26)] : c)

/** Scramble-to-text reveal (unresolved letters in the accent colour). Waits for the takeoff to land.
 *  The real text stays in the layout (invisible) and the scramble is painted over it, so nothing reflows or flickers. */
export default function Decode({ text, ms = 700, className }: { text: string; ms?: number; className?: string }) {
  const [out, setOut] = useState<string | null>(null) // null = not started
  const [n, setN] = useState(0)

  useEffect(() => {
    let raf = 0, t0 = 0, last = 0, dead = false
    const run = () => {
      const step = (t: number) => {
        if (dead) return
        t0 ||= t
        const k = Math.min(1, (t - t0) / ms)
        if (k >= 1) { setN(text.length); setOut(text); return }
        if (t - last > 50) { last = t; setN(Math.floor(k * text.length)); setOut([...text].map(glyph).join('')) } // ~20 fps, not every frame
        raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    }
    if (document.documentElement.dataset.wkLanding) window.addEventListener('wk:landed', run, { once: true }); else run()
    return () => { dead = true; cancelAnimationFrame(raf); window.removeEventListener('wk:landed', run) }
  }, [text, ms])

  const chars = [...text], scr = out ? [...out] : []
  return (
    <span className={className} style={{ position: 'relative', display: 'inline-block' }} aria-label={text}>
      <span aria-hidden style={{ visibility: out === null || out === text ? 'visible' : 'hidden', opacity: out === null ? 0 : 1 }}>{text}</span>
      {out !== null && out !== text && (
        <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, width: '100%' }}>
          {chars.map((c, i) => (i < n || c === ' ' ? c : <i key={i} className="wk-dx">{scr[i] ?? c}</i>))}
        </span>
      )}
    </span>
  )
}
