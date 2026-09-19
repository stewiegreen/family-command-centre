/**
 * Cloudflare Pages Function — Emby API proxy (browse + playback).
 *
 * Secrets (Cloudflare Pages env):
 *   EMBY_BASE_URL  e.g. https://media.example.com  (no trailing slash)
 *   EMBY_API_KEY   Emby API key — NEVER expose to the client
 *
 * GET: allowlisted library + stream paths.
 * POST: allowlisted session progress endpoints only.
 */

type Env = {
  EMBY_BASE_URL: string;
  EMBY_API_KEY: string;
};

const ALLOWED_QUERY = new Set([
  'MediaTypes',
  'Limit',
  'StartIndex',
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
  'SearchTerm',
  'Filters',
  'UserId',
  'GroupItemsIntoCollections',
  'EnableUserData',
  'ImageTypeLimit',
  'ExcludeItemTypes',
  'Ids',
  // Playback / stream
  'Static',
  'MediaSourceId',
  'DeviceId',
  'PlaySessionId',
  'VideoCodec',
  'AudioCodec',
  'MaxStreamingBitrate',
  'StartTimeTicks',
  'Container',
  'TranscodingProtocol',
  'TranscodingContainer',
  'AudioStreamIndex',
  'AudioBitrate',
  'SegmentContainer',
  'SubtitleStreamIndex',
  'VideoStreamIndex',
  'SubtitleMethod',
  'api_key', // ignored client-side; we always set server key
  'fillWidth',
  'fillHeight',
  'background',
]);

function pathAllowedGet(joined: string): boolean {
  if (joined === 'System/Info/Public') return true;
  if (/^Users\/[^/]+\/Views$/.test(joined)) return true;
  if (/^Users\/[^/]+\/Items\/Resume$/.test(joined)) return true;
  if (/^Users\/[^/]+\/Items\/Latest$/.test(joined)) return true;
  if (/^Users\/[^/]+\/Items$/.test(joined)) return true;
  if (/^Users\/[^/]+\/Items\/[^/]+$/.test(joined)) return true;
  if (joined === 'Shows/NextUp') return true;
  if (/^Items\/[^/]+\/Images\/[^/]+$/.test(joined)) return true;
  if (/^Items\/[^/]+\/PlaybackInfo$/.test(joined)) return true;
  // Video + HLS segments under Videos/{id}/...
  if (/^Videos\/[^/]+(\/.*)?$/.test(joined)) return true;
  if (/^Audio\/[^/]+(\/.*)?$/.test(joined)) return true;
  return false;
}

function pathAllowedPost(joined: string): boolean {
  if (joined === 'Sessions/Playing') return true;
  if (joined === 'Sessions/Playing/Progress') return true;
  if (joined === 'Sessions/Playing/Stopped') return true;
  if (/^Items\/[^/]+\/PlaybackInfo$/.test(joined)) return true;
  return false;
}

function upstreamUrl(env: Env, joined: string, request: Request): URL {
  const base = env.EMBY_BASE_URL.replace(/\/+$/, '');
  const upstreamPath =
    joined.startsWith('System/') ||
    joined.startsWith('Users/') ||
    joined.startsWith('Items/') ||
    joined.startsWith('Shows/') ||
    joined.startsWith('Videos/') ||
    joined.startsWith('Audio/') ||
    joined.startsWith('Sessions/')
      ? `/emby/${joined}`
      : `/${joined}`;
  const url = new URL(`${base}${upstreamPath}`);
  const incoming = new URL(request.url);
  for (const [k, v] of incoming.searchParams) {
    if (k === 'api_key') continue;
    if (ALLOWED_QUERY.has(k)) url.searchParams.set(k, v);
  }
  url.searchParams.set('api_key', env.EMBY_API_KEY);
  return url;
}

function notConfigured(): Response {
  return new Response(
    JSON.stringify({ error: 'Emby proxy not configured (EMBY_BASE_URL / EMBY_API_KEY)' }),
    { status: 503, headers: { 'Content-Type': 'application/json' } },
  );
}

function pathFromContext(context: { params: { path?: string | string[] } }): string {
  const raw = context.params.path;
  const segments = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return segments.map(decodeURIComponent).join('/');
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const env = context.env;
  if (!env.EMBY_BASE_URL || !env.EMBY_API_KEY) return notConfigured();

  const joined = pathFromContext(context);
  if (!pathAllowedGet(joined)) {
    return new Response('Not found', { status: 404 });
  }

  const url = upstreamUrl(env, joined, context.request);
  const headers: Record<string, string> = {
    Accept: context.request.headers.get('Accept') || '*/*',
  };
  const range = context.request.headers.get('Range');
  if (range) headers.Range = range;

  let embyRes: Response;
  try {
    embyRes = await fetch(url.toString(), { method: 'GET', headers });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: 'Upstream Emby request failed',
        detail: err instanceof Error ? err.message : String(err),
      }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const ct = embyRes.headers.get('Content-Type') || '';
  const isPlaylist =
    /mpegurl|m3u8/i.test(ct) ||
    joined.endsWith('.m3u8') ||
    joined.includes('master.m3u8');

  // HLS playlists often contain absolute Emby URLs — rewrite so the browser
  // keeps hitting our proxy (with API key) for every segment.
  if (isPlaylist && embyRes.ok) {
    const text = await embyRes.text();
    const base = env.EMBY_BASE_URL.replace(/\/+$/, '');
    const rewritten = text
      .split('\n')
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return line;
        // Absolute Emby URL → relative proxy path
        if (trimmed.startsWith(base)) {
          const path = trimmed.slice(base.length).replace(/^\//, '');
          return `/api/emby/${path}`;
        }
        if (/^https?:\/\//i.test(trimmed)) {
          try {
            const u = new URL(trimmed);
            const baseHost = new URL(base).host;
            if (u.host === baseHost) {
              return `/api/emby${u.pathname}${u.search}`;
            }
          } catch {
            /* keep */
          }
          return line;
        }
        // Relative segment path (e.g. Videos/id/hls1/seg.ts?...)
        if (!trimmed.startsWith('/api/emby')) {
          const path = trimmed.replace(/^\//, '');
          if (path.startsWith('Videos/') || path.startsWith('Audio/')) {
            return `/api/emby/${path}`;
          }
        }
        return line;
      })
      .join('\n');

    const out = new Headers();
    out.set('Content-Type', ct || 'application/vnd.apple.mpegurl');
    out.set('Access-Control-Allow-Origin', '*');
    out.set('Cache-Control', 'no-store');
    return new Response(rewritten, { status: embyRes.status, headers: out });
  }

  const out = new Headers();
  for (const h of [
    'Content-Type',
    'Content-Length',
    'Content-Range',
    'Accept-Ranges',
    'Cache-Control',
  ]) {
    const v = embyRes.headers.get(h);
    if (v) out.set(h, v);
  }
  if (/\/Images\//.test(joined)) {
    out.set('Cache-Control', 'public, max-age=3600');
  }
  // Allow media element to consume stream
  out.set('Access-Control-Allow-Origin', '*');
  out.set('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');

  return new Response(embyRes.body, { status: embyRes.status, headers: out });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const env = context.env;
  if (!env.EMBY_BASE_URL || !env.EMBY_API_KEY) return notConfigured();

  const joined = pathFromContext(context);
  if (!pathAllowedPost(joined)) {
    return new Response('Not found', { status: 404 });
  }

  const url = upstreamUrl(env, joined, context.request);
  const body = await context.request.arrayBuffer();

  let embyRes: Response;
  try {
    embyRes = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': context.request.headers.get('Content-Type') || 'application/json',
      },
      body,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: 'Upstream Emby request failed',
        detail: err instanceof Error ? err.message : String(err),
      }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const headers = new Headers();
  const ct = embyRes.headers.get('Content-Type');
  if (ct) headers.set('Content-Type', ct);
  return new Response(embyRes.body, { status: embyRes.status, headers });
};

/** CORS preflight for video element / fetch */
export const onRequestOptions: PagesFunction = async () =>
  new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Range, Accept',
      'Access-Control-Max-Age': '86400',
    },
  });
