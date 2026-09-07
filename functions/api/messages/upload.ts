/**
 * POST /api/messages/upload
 * multipart/form-data field "photo" — authenticated family member uploads an image to R2.
 * Returns { url } on GreenHQ's domain for use as message text (existing ChatImage renders it).
 *
 * Env / bindings:
 *   MESSAGE_IMAGES — R2 bucket binding
 *   FIREBASE_API_KEY — optional (falls back to web API key for token verify)
 *   GREENHQ_PUBLIC_ORIGIN — optional, default https://greenhq.io
 */

type Env = {
  MESSAGE_IMAGES: R2Bucket;
  FIREBASE_API_KEY?: string;
  GREENHQ_PUBLIC_ORIGIN?: string;
};

const DEFAULT_API_KEY = 'AIzaSyBFKQ356Fs-eVjG-T24tcP6RbUHtfNcICc';
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });

/** Same pattern as functions/api/push/screentimer.ts */
async function verifyIdToken(
  idToken: string,
  apiKey: string,
): Promise<{ uid: string } | null> {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { users?: { localId?: string }[] };
  const uid = data.users?.[0]?.localId;
  return uid ? { uid } : null;
}

type Detected = { ext: string; contentType: string };

function detectImage(bytes: Uint8Array): Detected | null {
  if (bytes.length < 12) return null;
  // JPEG
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { ext: 'jpg', contentType: 'image/jpeg' };
  }
  // PNG
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return { ext: 'png', contentType: 'image/png' };
  }
  // GIF
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return { ext: 'gif', contentType: 'image/gif' };
  }
  // WebP: RIFF....WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { ext: 'webp', contentType: 'image/webp' };
  }
  return null;
}

function safeFamilyId(raw: string | null): string {
  if (!raw) return 'unknown';
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  return cleaned || 'unknown';
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const env = context.env;
  if (!env.MESSAGE_IMAGES) {
    return json({ error: 'MESSAGE_IMAGES R2 binding not configured' }, 503);
  }

  const authHeader = context.request.headers.get('Authorization') || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!idToken) return json({ error: 'Missing Authorization Bearer token' }, 401);

  const apiKey = env.FIREBASE_API_KEY || DEFAULT_API_KEY;
  const verified = await verifyIdToken(idToken, apiKey);
  if (!verified) return json({ error: 'Invalid id token' }, 401);

  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    return json({ error: 'Expected multipart/form-data' }, 400);
  }

  const file = form.get('photo');
  if (!file || typeof file === 'string') {
    return json({ error: 'Missing photo file field' }, 400);
  }
  const blob = file as File;
  if (blob.size <= 0) return json({ error: 'Empty file' }, 400);
  if (blob.size > MAX_BYTES) {
    return json({ error: `File too large (max ${MAX_BYTES / (1024 * 1024)}MB)` }, 400);
  }

  const buf = new Uint8Array(await blob.arrayBuffer());
  const detected = detectImage(buf);
  if (!detected) {
    return json({ error: 'Not a supported image (JPEG, PNG, GIF, or WebP)' }, 400);
  }

  const familyId = safeFamilyId(
    typeof form.get('familyId') === 'string' ? (form.get('familyId') as string) : null,
  );
  const id = crypto.randomUUID();
  const key = `messages/${familyId}/${id}.${detected.ext}`;

  await env.MESSAGE_IMAGES.put(key, buf, {
    httpMetadata: { contentType: detected.contentType },
    customMetadata: { uploadedBy: verified.uid, familyId },
  });

  const origin = (env.GREENHQ_PUBLIC_ORIGIN || 'https://greenhq.io').replace(/\/+$/, '');
  // Path must end with a real image extension so existing MessageBody / IMAGE_URL_RE match.
  const url = `${origin}/api/messages/image/${key}`;

  return json({ ok: true, url, key, contentType: detected.contentType });
};
