'use client';
import { useEffect, useRef, useState } from 'react';
import { CATEGORIES, CATEGORY_COLOR, type Category } from '@/components/stack/data';
import { useStore, setState, getState } from '@/components/stack/lib/store';
import { getWorld } from '@/components/stack/gl/World';
import { registerStroke } from '@/components/ui/glassStroke';

/** a glass surface whose 1px outline follows the pointer like the original's */
function Glass({ className }: { className: string }) {
  const r = useRef<HTMLDivElement>(null);
  useEffect(() => registerStroke(r.current), []);
  return <div ref={r} className={className} />;
}

const Ico = ({ d, children }: { d?: string; children?: React.ReactNode }) => (<svg className="sr-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d ? <path d={d} /> : children}</svg>);
const Layers = () => <Ico><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" /><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" /><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" /></Ico>;
const Asterisk = () => <Ico><path d="M12 6v12" /><path d="M17.196 9 6.804 15" /><path d="m6.804 9 10.392 6" /></Ico>;
const X = () => <Ico d="M18 6 6 18M6 6l12 12" />;
const Chevron = () => <Ico d="m9 18 6-6-6-6" />;
const ListFilter = () => <Ico><path d="M3 6h18" /><path d="M7 12h10" /><path d="M10 18h4" /></Ico>;

export default function Filter() {
  const filter = useStore((s) => s.filter), locked = !useStore((s) => s.introPlayed);
  const [open, setOpen] = useState(false), [mounted, setMounted] = useState(false), [sub, setSub] = useState(false), [hadFilter, setHad] = useState(false);
  const trig = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null), subEl = useRef<HTMLDivElement>(null);
  const closeT = useRef<any>(null), subT = useRef<any>(null), exitT = useRef<any>(null);
  useEffect(() => registerStroke(trig.current), []);
  const hoverCapable = () => matchMedia('(hover: hover)').matches;

  const show = () => { if (open) return; clearTimeout(exitT.current); setHad(getState().filter != null); setMounted(true); setOpen(true); setState({ menuOpen: true }); };
  const hide = () => { clearTimeout(closeT.current); clearTimeout(subT.current); setSub(false); setOpen(false); setState({ menuOpen: false }); exitT.current = setTimeout(() => setMounted(false), 330); };
  const pick = (c: Category | null) => { setState({ filter: c }); getWorld().applyFilter(c); hide(); };

  // hover intent: stay open while the pointer is over the pill, the menu or the submenu (8px forgiveness)
  useEffect(() => {
    if (!open) return;
    const near = (el: Element | null, x: number, y: number) => { if (!el) return false; const r = el.getBoundingClientRect(); return x >= r.left - 8 && x <= r.right + 8 && y >= r.top - 8 && y <= r.bottom + 8; };
    const mv = (e: PointerEvent) => {
      const inside = near(trig.current, e.clientX, e.clientY) || near(menu.current, e.clientX, e.clientY) || near(subEl.current, e.clientX, e.clientY);
      if (inside) clearTimeout(closeT.current); else if (hoverCapable() && e.pointerType === 'mouse') { clearTimeout(closeT.current); closeT.current = setTimeout(hide, 150); }
    };
    const dn = (e: PointerEvent) => { const t = e.target as Node; if (!menu.current?.contains(t) && !trig.current?.contains(t) && !subEl.current?.contains(t)) hide(); };
    const kd = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerdown', dn); window.addEventListener('keydown', kd);
    return () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerdown', dn); window.removeEventListener('keydown', kd); };
  }, [open]);

  const openSub = (delay = 90) => { clearTimeout(subT.current); subT.current = setTimeout(() => setSub(true), delay); };
  const color = filter ? CATEGORY_COLOR[filter] : null;
  return (
    <div className={`sr-filter${open ? ' sr-filter--open' : ''}${locked ? ' sr-filter--locked' : ''}`}>
      <button ref={trig} className={`sr-filter__trigger sr-glass${filter ? ' sr-filter__trigger--active' : ''}`} aria-haspopup="menu" aria-expanded={open}
        onPointerEnter={(e) => { if (e.pointerType === 'mouse' && hoverCapable()) show(); }} onClick={() => (open ? hide() : show())}>
        {color && <span className="sr-filter__dot" style={{ background: color }} />}
        <span>{filter ?? 'Filter'}</span><ListFilter />
      </button>
      {mounted && (
        <div ref={menu} className="sr-fmenu" data-state={open ? 'open' : 'closed'} role="menu" aria-label="Filter">
          <Glass className="sr-fmenu__surface sr-glass" />
          <div className="sr-fmenu__items">
            <div className="sr-fmenu__label sr-mono">Filter</div>
            <button className={`sr-fmenu__item${sub ? ' sr-is-hot' : ''}`} role="menuitem" aria-haspopup="menu" aria-expanded={sub}
              onPointerEnter={() => openSub()} onClick={() => setSub((s) => !s)} onKeyDown={(e) => { if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); setSub(true); } }}>
              <Layers /><span>Category</span><Chevron />
            </button>
            {hadFilter && (<><div className="sr-fmenu__sep" /><button className="sr-fmenu__item" role="menuitem" onClick={() => pick(null)}><X /><span>Reset</span></button></>)}
          </div>
          {sub && (
            <div ref={subEl} className="sr-fmenu sr-fmenu--sub" data-state="open" role="menu" aria-label="Category">
              <Glass className="sr-fmenu__surface sr-glass" />
              <div className="sr-fmenu__items">
                <button className={`sr-fmenu__item${filter === null ? ' sr-is-selected' : ''}`} role="menuitemradio" aria-checked={filter === null} onClick={() => pick(null)}><Asterisk /><span>All</span></button>
                {CATEGORIES.map((c) => (
                  <button key={c} className={`sr-fmenu__item${filter === c ? ' sr-is-selected' : ''}`} role="menuitemradio" aria-checked={filter === c} onClick={() => pick(c)}>
                    <span className="sr-fmenu__dot" style={{ background: CATEGORY_COLOR[c] }} /><span>{c}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
