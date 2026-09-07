/**
 * GET /api/messages-img/messages/{familyId}/{uuid}.ext
 * Serves uploaded message photos from R2. No auth (plain <img src>).
 */

type Env = {
  MESSAGE_IMAGES: R2Bucket;
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const env = context.env;
  if (!env.MESSAGE_IMAGES) {
    return new Response('R2 not configured', { status: 503 });
  }

  const raw = context.params.path;
  const segments = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const key = segments.map((s) => decodeURIComponent(s)).join('/');
  if (!key || key.includes('..') || !key.startsWith('messages/')) {
    return new Response('Not found', { status: 404 });
  }

  const obj = await env.MESSAGE_IMAGES.get(key);
  if (!obj) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  headers.set('Content-Type', obj.httpMetadata?.contentType || 'application/octet-stream');
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(obj.body, { status: 200, headers });
};
