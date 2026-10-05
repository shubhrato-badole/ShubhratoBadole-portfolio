/* POST /api/speak  { text: string }  ->  raw 16-bit mono PCM @ 24 kHz (audio/l16)
 *
 * Asks Gemini text-to-speech for a female voice. The API key stays on the server.
 *
 * Environment (.env.local):
 *   GEMINI_API_KEY      required (without it this route returns 501 and the site falls back to the browser voice)
 *   GEMINI_TTS_MODEL    optional, default "gemini-3.8-flash-lite-tts"  (the cheaper, faster one; "gemini-3.8-flash-tts" is the richer one)
 *   ASSISTANT_VOICE     optional, default "Despina" (smooth). Other female voices: Sulafat (warm), Aoede (breezy), Vindemiatrix (gentle),
 *                       Achernar (soft), Leda (youthful), Zephyr (bright), Kore (firm)
 *   ASSISTANT_STYLE     optional delivery hint, default "warm, natural and friendly, relaxed conversational pace"
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const API_BASE = process.env.GEMINI_API_BASE ?? 'https://generativelanguage.googleapis.com';
const MAX_CHARS = 700;
const TIMEOUT_MS = 15000;

/* tiny in-memory cache (identical sentences, e.g. the canned replies, cost nothing the second time) */
const cache = new Map<string, Uint8Array>();
const CACHE_MAX = 80;

/* per-visitor limit so nobody can run up the bill: 25 requests per 10 minutes */
const hits = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 25;

function limited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 2000) hits.clear();
  return false;
}

/* find the base64 audio in the response, wherever the API nests it */
function findAudio(node: unknown): string | null {
  let found: string | null = null;
  const walk = (n: unknown) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    const o = n as Record<string, unknown>;
    if (o.type === 'audio' && typeof o.data === 'string') found = o.data;
    const inline = o.inlineData as { data?: unknown } | undefined; // older generateContent shape
    if (inline && typeof inline.data === 'string') found = inline.data;
    Object.values(o).forEach(walk);
  };
  walk(node);
  return found;
}

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export async function POST(req: Request): Promise<Response> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return json(501, { error: 'GEMINI_API_KEY is not set' });

  /* same-origin only */
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) return json(403, { error: 'forbidden' });
    } catch {
      return json(403, { error: 'forbidden' });
    }
  }

  const ip = (req.headers.get('x-forwarded-for') ?? 'local').split(',')[0].trim();
  if (limited(ip)) return json(429, { error: 'too many requests' });

  let text = '';
  try {
    const body = (await req.json()) as { text?: unknown };
    text = typeof body.text === 'string' ? body.text.trim() : '';
  } catch {
    return json(400, { error: 'bad request' });
  }
  if (!text) return json(400, { error: 'text required' });
  if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS);

  const model = process.env.GEMINI_TTS_MODEL ?? 'gemini-3.8-flash-lite-tts';
  const voice = process.env.ASSISTANT_VOICE ?? 'Despina';
  const style = process.env.ASSISTANT_STYLE ?? 'warm, natural and friendly, relaxed conversational pace';
  const cacheKey = `${model}|${voice}|${style}|${text}`;

  const hit = cache.get(cacheKey);
  const reply = (pcm: Uint8Array) =>
    new Response(pcm as unknown as BodyInit, {
      headers: {
        'Content-Type': 'audio/l16;rate=24000',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  if (hit) return reply(hit);

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}/v1beta/interactions`, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        input: [
          {
            type: 'user_input',
            content: [
              {
                type: 'text',
                text,
                annotations: [{ type: 'speech_metadata', style }],
              },
            ],
          },
        ],
        response_format: { type: 'audio', mime_type: 'audio/l16', sample_rate: 24000 },
        generation_config: { speech_config: [{ voice }] },
      }),
      signal: ac.signal,
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      console.error('[speak] Gemini error', res.status, detail);
      return json(502, { error: 'tts failed', status: res.status });
    }
    const data = findAudio(await res.json());
    if (!data) {
      console.error('[speak] no audio in Gemini response');
      return json(502, { error: 'no audio returned' });
    }
    const pcm = new Uint8Array(Buffer.from(data, 'base64'));
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
    cache.set(cacheKey, pcm);
    return reply(pcm);
  } catch (e) {
    console.error('[speak] request failed', e instanceof Error ? e.message : e);
    return json(502, { error: 'tts unavailable' });
  } finally {
    clearTimeout(timer);
  }
}
