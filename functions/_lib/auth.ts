// functions/_lib/auth.ts
// Shared auth/authorization gate for Cloudflare Pages Functions.
// verifyMember() / verifyUser() -> any signed-in family member;
// verifyParent() -> parents/admin only.

interface Env {
  FIREBASE_PROJECT_ID: string;
}

export interface AuthedUser {
  uid: string;
  email?: string;
  /** Raw ID token, reusable for Firestore REST reads */
  token: string;
}

export class AuthError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

// --- Google public key cache (RS256 / x509) ---
// Cached per-isolate until Cache-Control max-age expires.

let keyCache: { keys: Record<string, CryptoKey>; expires: number } | null = null;

async function getGoogleKeys(): Promise<Record<string, CryptoKey>> {
  if (keyCache && Date.now() < keyCache.expires) return keyCache.keys;

  const res = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com',
  );
  if (!res.ok) throw new AuthError(503, 'Unable to fetch signing keys');

  const certs: Record<string, string> = await res.json();
  const keys: Record<string, CryptoKey> = {};
  for (const [kid, pem] of Object.entries(certs)) {
    keys[kid] = await importX509(pem);
  }

  const cc = res.headers.get('cache-control') ?? '';
  const maxAge = Number(/max-age=(\d+)/.exec(cc)?.[1] ?? 3600);
  keyCache = { keys, expires: Date.now() + maxAge * 1000 };
  return keys;
}

async function importX509(pem: string): Promise<CryptoKey> {
  const b64 = pem
    .replace(/-----BEGIN CERTIFICATE-----/, '')
    .replace(/-----END CERTIFICATE-----/, '')
    .replace(/\s+/g, '');
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  // Web Crypto can't import an x509 cert directly; extract the SPKI public key.
  const spki = extractSpkiFromX509(der);
  return crypto.subtle.importKey(
    'spki',
    spki,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
}

/**
 * Minimal DER walk: find SubjectPublicKeyInfo inside the TBSCertificate.
 * Search for the rsaEncryption OID (1.2.840.113549.1.1.1) and back up to its
 * enclosing SPKI SEQUENCE.
 */
function extractSpkiFromX509(der: Uint8Array): ArrayBuffer {
  const oid = [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01];
  for (let i = 0; i < der.length - oid.length; i++) {
    if (oid.every((b, j) => der[i + j] === b)) {
      let algSeq = i - 2;
      while (algSeq >= 0 && der[algSeq] !== 0x30) algSeq--;
      let spkiSeq = algSeq - 1;
      while (spkiSeq >= 0 && der[spkiSeq] !== 0x30) spkiSeq--;
      const { end } = readTlv(der, spkiSeq);
      return der.slice(spkiSeq, end).buffer;
    }
  }
  throw new AuthError(503, 'Malformed signing certificate');
}

function readTlv(buf: Uint8Array, pos: number): { end: number } {
  let len = buf[pos + 1]!;
  let header = 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    len = 0;
    for (let k = 0; k < n; k++) len = (len << 8) | buf[pos + 2 + k]!;
    header = 2 + n;
  }
  return { end: pos + header + len };
}

// --- JWT verification ---

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 ? 4 - (s.length % 4) : 0;
  const b64 = (s + '='.repeat(pad)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function verifyIdToken(token: string, projectId: string): Promise<AuthedUser> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new AuthError(401, 'Malformed token');
  const [h, p, s] = parts as [string, string, string];

  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h))) as {
    kid?: string;
  };
  const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p))) as {
    aud?: string;
    iss?: string;
    exp?: number;
    iat?: number;
    sub?: string;
    email?: string;
  };

  const keys = await getGoogleKeys();
  const key = header.kid ? keys[header.kid] : undefined;
  if (!key) throw new AuthError(401, 'Unknown key id');

  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlToBytes(s) as BufferSource,
    new TextEncoder().encode(`${h}.${p}`),
  );
  if (!ok) throw new AuthError(401, 'Invalid signature');

  const now = Math.floor(Date.now() / 1000);
  const iss = `https://securetoken.google.com/${projectId}`;
  if (payload.aud !== projectId) throw new AuthError(401, 'Wrong audience');
  if (payload.iss !== iss) throw new AuthError(401, 'Wrong issuer');
  if (!payload.exp || payload.exp <= now) throw new AuthError(401, 'Token expired');
  if (payload.iat != null && payload.iat > now + 60) {
    throw new AuthError(401, 'Token issued in the future');
  }
  if (!payload.sub) throw new AuthError(401, 'Missing subject');

  return { uid: payload.sub, email: payload.email, token };
}

function bearer(request: Request): string {
  const h = request.headers.get('Authorization') ?? '';
  if (!h.startsWith('Bearer ')) throw new AuthError(401, 'Missing bearer token');
  return h.slice(7).trim();
}

// --- Public API ---

/** Any authenticated Firebase user (valid ID token). */
export async function verifyUser(request: Request, env: Env): Promise<AuthedUser> {
  if (!env.FIREBASE_PROJECT_ID) {
    throw new AuthError(500, 'FIREBASE_PROJECT_ID not configured');
  }
  return verifyIdToken(bearer(request), env.FIREBASE_PROJECT_ID);
}

/**
 * Authenticated AND a parent/admin of the given family.
 * Reads the family doc via Firestore REST using the caller's own token so
 * security rules remain the single enforcement point.
 */
export async function verifyParent(
  request: Request,
  env: Env,
  familyId: string,
): Promise<AuthedUser> {
  const user = await verifyUser(request, env);
  const url =
    `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}` +
    `/databases/(default)/documents/families/${encodeURIComponent(familyId)}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${user.token}` },
  });
  if (res.status === 403 || res.status === 404) {
    throw new AuthError(403, 'Not a member of this family');
  }
  if (!res.ok) throw new AuthError(502, 'Failed to load family');

  const doc = (await res.json()) as {
    fields?: {
      adminUid?: { stringValue?: string };
      parentUids?: { arrayValue?: { values?: { stringValue?: string }[] } };
    };
  };
  const f = doc.fields ?? {};
  const adminUid: string | undefined = f.adminUid?.stringValue;
  const parentUids: string[] = (f.parentUids?.arrayValue?.values ?? [])
    .map((v) => v.stringValue)
    .filter((x): x is string => !!x);

  if (user.uid !== adminUid && !parentUids.includes(user.uid)) {
    throw new AuthError(403, 'Parents only');
  }
  return user;
}

/** Turn an AuthError (or anything) into a JSON Response. */
export function toErrorResponse(err: unknown): Response {
  if (err instanceof AuthError) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: err.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  console.error('Unhandled error:', err);
  return new Response(JSON.stringify({ error: 'Internal error' }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  });
}
