/**
 * Cloudflare Pages Function — Komga API proxy.
 *
 * Secrets (Cloudflare Pages → Environment variables):
 *   KOMGA_BASE_URL              e.g. https://comics.greenhq.io  (no trailing slash)
 *   KOMGA_API_KEY               default / shared Komga user API key
 *   KOMGA_API_KEY_<memberId>    optional per-member key (same id as GreenHQ member.id)
 *
 * Progress is tracked against whichever Komga user owns the resolved API key.
 * Prefer per-member keys so kids don't overwrite each other's progress.
 *
 * Allowlisted paths only. PATCH/DELETE limited to read-progress.
 */

type Env = {
  KOMGA_BASE_URL: string;
  KOMGA_API_KEY: string;
  [key: string]: string | undefined;
};

const ALLOWED_ORIGINS = new Set(['https://greenhq.io', 'https://www.greenhq.io']);

const ALLOWED_QUERY = new Set([
  'page',
  'size',
  'sort',
  'read_status',
  'library_id',
  'search',
  'unpaged',
  // client-only; stripped before upstream
  'memberId',
]);

function pathAllowed(joined: string, method: string): boolean {
  const m = method.toUpperCase();
  if (joined === 'v1/libraries') return m === 'GET';
  if (joined === 'v1/books/ondeck') return m === 'GET';
  if (joined === 'v1/books/latest') return m === 'GET';
  if (joined === 'v1/series/latest') return m === 'GET';
  if (joined === 'v1/books') return m === 'GET';
  if (/^v1\/books\/[^/]+\/thumbnail$/.test(joined)) return m === 'GET';
  if (/^v1\/series\/[^/]+\/thumbnail$/.test(joined)) return m === 'GET';
  if (/^v1\/books\/[^/]+$/.test(joined)) return m === 'GET';
  // Reader
  if (/^v1\/books\/[^/]+\/pages$/.test(joined)) return m === 'GET';
  if (/^v1\/books\/[^/]+\/pages\/[^/]+$/.test(joined)) return m === 'GET';
  if (/^v1\/books\/[^/]+\/next$/.test(joined)) return m === 'GET';
  if (/^v1\/books\/[^/]+\/previous$/.test(joined)) return m === 'GET';
  if (/^v1\/books\/[^/]+\/read-progress$/.test(joined)) {
    return m === 'GET' || m === 'PATCH' || m === 'DELETE';
  }
  return false;
}

/** Only safe-looking member ids — used solely as env-var suffix lookup. */
function sanitizeMemberId(raw: string | null): string | null {
  if (!raw) return null;
  const id = raw.trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  return id;
}

function resolveApiKey(env: Env, memberId: string | null): string | null {
  if (memberId) {
    const personal = env[`KOMGA_API_KEY_${memberId}`];
    if (personal && personal.trim()) return personal.trim();
  }
  return env.KOMGA_API_KEY?.trim() || null;
}

function isPageImagePath(joined: string): boolean {
  return /^v1\/books\/[^/]+\/pages\/[^/]+$/.test(joined);
}

/**
 * Origin check for write methods.
 * Only rejects mismatched Origin headers; bare curl with no Origin still works.
 * Same honesty as recipe/parse — speed bump, not a lock.
 */
function originForbidden(request: Request): boolean {
  const origin = request.headers.get('Origin');
  return !!(origin && !ALLOWED_ORIGINS.has(origin));
}

async function handleKomga(context: EventContext<Env, any, Record<string, unknown>>): Promise<Response> {
  const env = context.env;
  const method = context.request.method.toUpperCase();

  if ((method === 'PATCH' || method === 'DELETE') && originForbidden(context.request)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!env.KOMGA_BASE_URL) {
    return new Response(
      JSON.stringify({ error: 'Komga proxy not configured (KOMGA_BASE_URL / KOMGA_API_KEY)' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const incoming = new URL(context.request.url);
  const memberId = sanitizeMemberId(incoming.searchParams.get('memberId'));
  const apiKey = resolveApiKey(env, memberId);
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'Komga proxy not configured (KOMGA_BASE_URL / KOMGA_API_KEY)' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const raw = context.params.path;
  const segments = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const joined = segments.map(decodeURIComponent).join('/');
  if (!pathAllowed(joined, method)) {
    return new Response('Not found', { status: 404 });
  }

  const base = env.KOMGA_BASE_URL.replace(/\/+$/, '');
  const url = new URL(`${base}/api/${joined}`);

  for (const [k, v] of incoming.searchParams) {
    if (k === 'memberId') continue;
    if (ALLOWED_QUERY.has(k)) url.searchParams.set(k, v);
  }

  const upstreamHeaders: Record<string, string> = {
    'X-API-Key': apiKey,
  };

  if (isPageImagePath(joined)) {
    // Komga returns 406 for Accept: image/* — must send a concrete type.
    upstreamHeaders.Accept = 'image/jpeg';
  } else if (method === 'GET') {
    upstreamHeaders.Accept = context.request.headers.get('Accept') || 'application/json';
  } else {
    upstreamHeaders.Accept = 'application/json';
    upstreamHeaders['Content-Type'] = 'application/json';
  }

  let body: ArrayBuffer | string | undefined;
  if (method === 'PATCH' || method === 'DELETE') {
    if (method === 'PATCH') {
      try {
        body = await context.request.text();
      } catch {
        body = '{}';
      }
    }
  }

  let komgaRes: Response;
  try {
    komgaRes = await fetch(url.toString(), {
      method,
      headers: upstreamHeaders,
      body: method === 'PATCH' ? body : undefined,
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
  const cacheControl = komgaRes.headers.get('Cache-Control');
  if (cacheControl) headers.set('Cache-Control', cacheControl);
  // Page images: allow short browser cache
  if (isPageImagePath(joined) && komgaRes.ok) {
    headers.set('Cache-Control', 'private, max-age=3600');
  }

  return new Response(komgaRes.body, { status: komgaRes.status, headers });
}

export const onRequestGet: PagesFunction<Env> = (ctx) => handleKomga(ctx);
export const onRequestPatch: PagesFunction<Env> = (ctx) => handleKomga(ctx);
export const onRequestDelete: PagesFunction<Env> = (ctx) => handleKomga(ctx);
