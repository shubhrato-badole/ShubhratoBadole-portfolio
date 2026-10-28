import * as THREE from 'three';
import { TECHS, type Tech } from '@/components/stack/data';

export interface AtlasInfo { texture: THREE.CanvasTexture; cols: number; rows: number; }

const loadImg = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

// One texture holds every card; the ring shader picks a cell per slot (one draw call for the whole ring).
export async function buildAtlas(cellW: number, cellH: number): Promise<AtlasInfo> {
  const cols = 6, rows = Math.ceil(TECHS.length / cols);
  const c = document.createElement('canvas'); c.width = cols * cellW; c.height = rows * cellH;
  const ctx = c.getContext('2d')!; ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, c.width, c.height);
  const imgs = await Promise.all(TECHS.map((t) => loadImg(t.asset)));
  imgs.forEach((im, i) => { ctx.drawImage(im, (i % cols) * cellW, Math.floor(i / cols) * cellH, cellW, cellH); });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true; tex.anisotropy = 8; tex.needsUpdate = true;
  return { texture: tex, cols, rows };
}

// Tiny scrolling "code" layer used as a faint overlay on the cards.
/* The scrolling code that shows faintly on the cards. Drawn the way the reference draws it (512x1024 canvas, 15px IBM Plex Mono,
   21px lines, white text whose alpha varies per line); only the ALPHA channel is read by the shader. The text is original: a small
   retrieval agent, in the spirit of the work on this site. */
const CODE_LINES = `type Chunk = { id: string; text: string; score: number };

class ResearchAgent {
  private cache = new Redis({ ttl: 3600 });

  async answer(question: string): Promise<Answer> {
    const key = hash(question);
    const hit = await this.cache.get(key);
    if (hit) return hit;               // 5ms, not 4s

    const queries = await this.expand(question);
    const chunks = await this.retrieve(queries);
    const ranked = this.rerank(question, chunks);
    const context = ranked.slice(0, 6);

    const draft = await model.complete({
      system: GROUNDED_ONLY,
      context,
      question,
    });
    const checked = await this.verify(draft, context);
    if (!checked.ok) throw new UngroundedAnswer(checked);

    await this.cache.set(key, checked.answer);
    return checked.answer;
  }

  private async retrieve(queries: string[]) {
    const lists = await Promise.all(
      queries.map((q) => vectors.search(q, { k: 12 }))
    );
    return reciprocalRankFusion(lists);
  }

  private rerank(q: string, chunks: Chunk[]) {
    return chunks
      .map((c) => ({ ...c, score: cross(q, c.text) }))
      .sort((a, b) => b.score - a.score);
  }
}

export const agent = new ResearchAgent();
agent.on("error", (e) => alarm.notify(e));`;

export function buildCodeTexture(): THREE.CanvasTexture {
  const W = 512, H = 1024, LH = 21, FONT = '500 15px "IBM Plex Mono", monospace';
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { alpha: true })!;
  const lines = CODE_LINES.split('\n'), count = Math.ceil(H / LH);
  const draw = () => {
    x.clearRect(0, 0, W, H); x.font = FONT; x.textBaseline = 'top';
    for (let o = 0; o < count; o++) {
      const a = 0.4 + 0.5 * Math.abs(((Math.sin(o * 12.9898) * 43758.5453) % 1));
      x.fillStyle = `rgba(255, 255, 255, ${a.toFixed(2)})`; x.fillText(lines[o % lines.length] ?? '', 14, o * LH);
    }
  };
  draw();
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4;
  document.fonts?.load('500 15px "IBM Plex Mono"').then(() => { draw(); t.needsUpdate = true; }).catch(() => {});
  return t;
}

// The hover details, laid out exactly like the reference's 12-column grid (560×862 design size).
export function buildInfoTexture(tech: Tech, index: number, scale = 2): THREE.CanvasTexture {
  const W = 560, H = 862;
  const c = document.createElement('canvas'); c.width = W * scale; c.height = H * scale;
  const x = c.getContext('2d')!; x.scale(scale, scale);
  x.font = '500 24px "IBM Plex Mono", monospace'; x.fillStyle = '#fff'; x.textBaseline = 'top';
  const padX = 60, padY = 44, gap = 4, inner = W - padX * 2, colW = (inner - 11 * gap) / 12, lh = 24 * 1.15;
  const colX = (n: number) => padX + (n - 1) * (colW + gap);
  const spanW = (n: number) => n * colW + (n - 1) * gap;
  const U = (s: string) => s.toUpperCase();
  const num = '/0' + (index + 1);
  const rows: { h: number; draw: (y: number) => void }[] = [
    { h: lh, draw: (y) => { x.textAlign = 'left'; x.fillText('TECH', colX(1), y); x.fillText(num, colX(11), y); } },
    { h: lh, draw: (y) => { x.textAlign = 'left'; x.fillText('CATEGORY:', colX(2), y); x.fillText(U(tech.category), colX(8), y); } },
    { h: lh, draw: (y) => { x.textAlign = 'left'; x.fillText('NAME:', colX(3), y); x.fillText(U(tech.title), colX(6), y); } },
    { h: lh, draw: (y) => { x.textAlign = 'left'; x.fillText('TYPE:', colX(5), y); x.textAlign = 'right'; x.fillText(U(tech.type), colX(9) + spanW(4), y); } },
    { h: lh * tech.usedIn.length, draw: (y) => { x.textAlign = 'left'; x.fillText('USED IN:', colX(4), y);
        const w = Math.max(...tech.usedIn.map((s) => x.measureText(U(s)).width)); const right = colX(7) + spanW(4);
        tech.usedIn.forEach((s, i) => { x.textAlign = 'left'; x.fillText(U(s), right - w, y + i * lh); }); } },
    { h: lh * tech.proof.length, draw: (y) => { x.textAlign = 'left'; x.fillText('PROOF:', colX(1), y); x.textAlign = 'right';
        tech.proof.forEach((s, i) => x.fillText(U(s), colX(9) + spanW(4), y + i * lh)); } }
  ];
  const total = rows.reduce((a, r) => a + r.h, 0) + 6 * (rows.length - 1);
  let y = (H - total) / 2; rows.forEach((r) => { r.draw(y); y += r.h + 6; });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; return t;
}
