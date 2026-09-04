/**
 * Cloudflare Pages Function — Emby API proxy.
 *
 * Secrets (set in Cloudflare dashboard → Pages → Settings → Environment variables):
 *   EMBY_BASE_URL  e.g. https://emby.example.com:8096  (no trailing slash)
 *   EMBY_API_KEY   Emby admin/API key — NEVER expose to the client
 *
 * Only an allowlisted set of GET paths is forwarded. Anything else → 404.
 */

type Env = {
  EMBY_BASE_URL: string;
  EMBY_API_KEY: string;
};

const ALLOWED_QUERY = new Set([
  'MediaTypes',
  'Limit',
  'IncludeItemTypes',
  'ParentId',
  'maxWidth',
  'maxHeight',
  'tag',
  'quality',
  'EnableImageTypes',
  'Fields',
  'Recursive',
  'SortBy',
  'SortOrder',
]);

function pathAllowed(joined: string): boolean {
  if (joined === 'System/Info/Public') return true;
  if (/^Users\/[^/]+\/Views$/.test(joined)) return true;
  if (/^Users\/[^/]+\/Items\/Resume$/.test(joined)) return true;
  if (/^Users\/[^/]+\/Items\/Latest$/.test(joined)) return true;
  if (/^Items\/[^/]+\/Images\/[^/]+$/.test(joined)) return true;
  return false;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const env = context.env;
  if (!env.EMBY_BASE_URL || !env.EMBY_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'Emby proxy not configured (EMBY_BASE_URL / EMBY_API_KEY)' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const raw = context.params.path;
  const segments = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const joined = segments.map(decodeURIComponent).join('/');
  if (!pathAllowed(joined)) {
    return new Response('Not found', { status: 404 });
  }

  const base = env.EMBY_BASE_URL.replace(/\/+$/, '');
  // Prefer /emby/ prefix when base is host-only; if base already includes path, join carefully
  const upstreamPath = joined.startsWith('System/') || joined.startsWith('Users/') || joined.startsWith('Items/')
    ? `/emby/${joined}`
    : `/${joined}`;
  const url = new URL(`${base}${upstreamPath}`);

  const incoming = new URL(context.request.url);
  for (const [k, v] of incoming.searchParams) {
    if (ALLOWED_QUERY.has(k)) url.searchParams.set(k, v);
  }
  url.searchParams.set('api_key', env.EMBY_API_KEY);

  let embyRes: Response;
  try {
    embyRes = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: context.request.headers.get('Accept') || 'application/json',
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Upstream Emby request failed', detail: String(err) }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const headers = new Headers();
  const ct = embyRes.headers.get('Content-Type');
  if (ct) headers.set('Content-Type', ct);
  // Cache images briefly; never cache sensitive JSON long
  if (/\/Images\//.test(joined)) {
    headers.set('Cache-Control', 'public, max-age=3600');
  } else {
    headers.set('Cache-Control', 'private, max-age=30');
  }

  return new Response(embyRes.body, { status: embyRes.status, headers });
};
