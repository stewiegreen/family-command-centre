/**
 * GET /api/messages/image/messages/{familyId}/{uuid}.ext
 * Serves an uploaded message photo from R2. No auth (works as <img src>).
 * Keys are unguessable UUIDs — no listing/enumeration.
 */

type Env = {
  MESSAGE_IMAGES: R2Bucket;
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const env = context.env;
  if (!env.MESSAGE_IMAGES) {
    return new Response('R2 not configured', { status: 503 });
  }

  const raw = context.params.key;
  const segments = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const key = segments.map((s) => decodeURIComponent(s)).join('/');
  if (!key || key.includes('..') || key.startsWith('/')) {
    return new Response('Not found', { status: 404 });
  }
  // Only serve under messages/ prefix
  if (!key.startsWith('messages/')) {
    return new Response('Not found', { status: 404 });
  }

  const obj = await env.MESSAGE_IMAGES.get(key);
  if (!obj) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  headers.set(
    'Content-Type',
    obj.httpMetadata?.contentType || 'application/octet-stream',
  );
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('X-Content-Type-Options', 'nosniff');

  return new Response(obj.body, { status: 200, headers });
};
