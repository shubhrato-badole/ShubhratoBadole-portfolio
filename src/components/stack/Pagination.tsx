'use client';
import { useRef, useState } from 'react';
import { useStore, setState, getState } from '@/components/stack/lib/store';
import { getWorld } from '@/components/stack/gl/World';

const pad = (n: number) => String(n).padStart(2, '0');

// 01 ▯▯▯▯ 19 — one tick per visible card; click, drag or use arrow keys to scrub the ring.
export default function Pagination() {
  const count = useStore((s) => s.count), active = useStore((s) => s.active), hovered = useStore((s) => s.hovered);
  const items = useRef<HTMLDivElement>(null), frame = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const st = useRef<{ x0: number; v0: number; id: number; t: any; on: boolean } | null>(null);
  const shortest = (i: number) => { const M = count; let d = (i - active) % M; if (d > M / 2) d -= M; if (d < -M / 2) d += M; return d; };
  const go = (i: number) => getWorld().scrubTo(getWorld().frontVirtual + shortest(i));
  const begin = () => { if (!st.current) return; st.current.on = true; setDragging(true); document.documentElement.classList.add('is-paginating'); setState({ scrubbing: true }); };
  const end = () => { setDragging(false); document.documentElement.classList.remove('is-paginating'); setState({ scrubbing: false }); };
  const place = (px: number) => { const r = items.current!.getBoundingClientRect(); const w = 50; if (frame.current) frame.current.style.width = w + 'px', frame.current.style.left = Math.max(0, Math.min(r.width - w, px - r.left - w / 2)) + 'px'; };
  const down = (e: React.PointerEvent) => {
    items.current!.setPointerCapture(e.pointerId); st.current = { x0: e.clientX, v0: getWorld().frontVirtual, id: e.pointerId, on: false, t: setTimeout(begin, 150) }; place(e.clientX);
  };
  const move = (e: React.PointerEvent) => {
    const s = st.current; if (!s || e.pointerId !== s.id) return;
    if (!s.on && Math.abs(e.clientX - s.x0) >= 3) { clearTimeout(s.t); begin(); }
    if (s.on) { const w = items.current!.getBoundingClientRect().width; place(e.clientX); getWorld().scrubTo(s.v0 + ((e.clientX - s.x0) / w) * count); }
  };
  const up = (e: React.PointerEvent) => { const s = st.current; if (!s) return; clearTimeout(s.t); if (s.on) end(); st.current = null; };
  const key = (e: React.KeyboardEvent) => { if (e.key === 'ArrowRight') go(active + 1); else if (e.key === 'ArrowLeft') go(active - 1); else if (e.key === 'Home') go(0); else if (e.key === 'End') go(count - 1); };
  return (
    <div className="sr-pagination">
      <span className="sr-pagination__counter">{pad(active + 1)}</span>
      <div ref={items} className={`sr-pagination__items${dragging ? ' sr-is-dragging' : ''}`} role="group" aria-label="Technologies" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}>
        <div ref={frame} className="sr-pagination__frame" />
        {Array.from({ length: count }, (_, i) => (
          <button key={i} className={`sr-pagination__tick${i === active ? ' sr-pagination__tick--active' : ''}${i === active && hovered === active ? ' sr-pagination__tick--accent' : ''}`}
            style={{ ['--tick-accent' as any]: 'var(--sr-accent, var(--accent))' }} aria-label={`Go to ${i + 1}`} aria-current={i === active} onClick={() => { if (!st.current?.on) go(i); }}><span className="sr-pagination__tickBar" /></button>
        ))}
      </div>
      <span className="sr-pagination__counter">{pad(count)}</span>
    </div>
  );
}
