/**
 * Cloudflare Pages Function — Komga API proxy.
 *
 * Secrets (Cloudflare Pages → Environment variables):
 *   KOMGA_BASE_URL  e.g. https://comics.greenhq.io  (no trailing slash)
 *   KOMGA_API_KEY   Komga user API key — NEVER expose to the client
 *
 * Progress is for the Komga user that owns this API key (one key = one reader view).
 * Allowlisted GET paths only.
 */

type Env = {
  KOMGA_BASE_URL: string;
  KOMGA_API_KEY: string;
};

const ALLOWED_QUERY = new Set([
  'page',
  'size',
  'sort',
  'read_status',
  'library_id',
  'search',
  'unpaged',
]);

function pathAllowed(joined: string): boolean {
  // joined is relative to /api/komga/ — we expect v1/...
  if (joined === 'v1/libraries') return true;
  if (joined === 'v1/books/ondeck') return true;
  if (joined === 'v1/books/latest') return true;
  if (joined === 'v1/series/latest') return true;
  if (joined === 'v1/books') return true; // ?read_status=IN_PROGRESS
  if (/^v1\/books\/[^/]+\/thumbnail$/.test(joined)) return true;
  if (/^v1\/series\/[^/]+\/thumbnail$/.test(joined)) return true;
  if (/^v1\/books\/[^/]+$/.test(joined)) return true;
  return false;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const env = context.env;
  if (!env.KOMGA_BASE_URL || !env.KOMGA_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'Komga proxy not configured (KOMGA_BASE_URL / KOMGA_API_KEY)' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const raw = context.params.path;
  const segments = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const joined = segments.map(decodeURIComponent).join('/');
  if (!pathAllowed(joined)) {
    return new Response('Not found', { status: 404 });
  }

  const base = env.KOMGA_BASE_URL.replace(/\/+$/, '');
  const url = new URL(`${base}/api/${joined}`);

  const incoming = new URL(context.request.url);
  for (const [k, v] of incoming.searchParams) {
    if (ALLOWED_QUERY.has(k)) url.searchParams.set(k, v);
  }

  let komgaRes: Response;
  try {
    komgaRes = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: context.request.headers.get('Accept') || 'application/json',
        'X-API-Key': env.KOMGA_API_KEY,
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Upstream Komga request failed', detail: String(err) }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const headers = new Headers();
  const ct = komgaRes.headers.get('Content-Type');
  if (ct) headers.set('Content-Type', ct);
  if (/\/thumbnail$/.test(joined)) {
    headers.set('Cache-Control', 'public, max-age=3600');
  } else {
    headers.set('Cache-Control', 'private, max-age=30');
  }

  return new Response(komgaRes.body, { status: komgaRes.status, headers });
};
