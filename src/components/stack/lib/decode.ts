// Character "decode" used for titles/descriptions: scrambled glyphs in the accent colour resolve left→right.
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/<>[]{}=+*#';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
export function decodeText(el: HTMLElement, text: string, ms = 700, onDone?: () => void) {
  const t0 = performance.now(); let raf = 0; const n = text.length;
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / ms); const reveal = Math.floor(p * n * 1.15 - 2);
    let html = '';
    for (let i = 0; i < n; i++) {
      const ch = text[i];
      if (ch === ' ' || i < reveal) html += esc(ch);
      else if (i < reveal + 6 && p < 1) html += `<span style="color:var(--accent)">${esc(GLYPHS[(Math.random() * GLYPHS.length) | 0])}</span>`;
      else html += '<span style="opacity:0">' + esc(ch) + '</span>';
    }
    el.innerHTML = html;
    if (p < 1) raf = requestAnimationFrame(step); else { el.textContent = text; onDone?.(); }
  };
  raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf);
}
export function decodeOut(el: HTMLElement, ms = 300, onDone?: () => void) {
  const text = el.textContent || ''; const t0 = performance.now(); let raf = 0; const n = text.length;
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / ms); const keep = Math.floor((1 - p) * n); let html = '';
    for (let i = 0; i < n; i++) html += text[i] === ' ' || i < keep ? esc(text[i]) : (i < keep + 4 ? `<span style="color:var(--accent)">${esc(GLYPHS[(Math.random() * GLYPHS.length) | 0])}</span>` : '<span style="opacity:0">' + esc(text[i]) + '</span>');
    el.innerHTML = html; if (p < 1) raf = requestAnimationFrame(step); else { el.textContent = ''; onDone?.(); }
  };
  raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf);
}
