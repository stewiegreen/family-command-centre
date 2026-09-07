/**
 * POST /api/push/screentimer
 * Body: { familyId, title?, body, view? }
 *
 * Loads family fcmTokens for parent members and sends FCM web push.
 * Auth: Firebase ID token in Authorization: Bearer <idToken>
 *        verified via Identity Toolkit lookup (no Blaze / Cloud Functions).
 *
 * Env: FIREBASE_SERVICE_ACCOUNT (same as Emby webhook),
 *      optional FIREBASE_API_KEY for token lookup (falls back to built-in web key).
 */

import { getGoogleAccessToken, parseServiceAccount } from '../../lib/googleSa';

type Env = {
  FIREBASE_SERVICE_ACCOUNT: string;
  FIREBASE_API_KEY?: string;
  GREENHQ_FAMILY_ID?: string;
};

const DEFAULT_API_KEY = 'AIzaSyBFKQ356Fs-eVjG-T24tcP6RbUHtfNcICc';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
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

type FsValue =
  | { stringValue: string }
  | { arrayValue: { values?: FsValue[] } }
  | { mapValue: { fields?: Record<string, FsValue> } };

function readStringArrayMap(fields: Record<string, FsValue> | undefined, key: string): Record<string, string[]> {
  const f = fields?.[key];
  if (!f || !('mapValue' in f)) return {};
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(f.mapValue.fields || {})) {
    if (!('arrayValue' in v)) continue;
    out[k] = (v.arrayValue.values || [])
      .map((x) => ('stringValue' in x ? x.stringValue : ''))
      .filter(Boolean);
  }
  return out;
}

function readParentMemberIds(fields: Record<string, FsValue> | undefined): string[] {
  const f = fields?.members;
  if (!f || !('arrayValue' in f)) return [];
  const ids: string[] = [];
  for (const v of f.arrayValue.values || []) {
    if (!('mapValue' in v)) continue;
    const mf = v.mapValue.fields || {};
    const role = 'stringValue' in (mf.role || {}) ? (mf.role as { stringValue: string }).stringValue : '';
    const id = 'stringValue' in (mf.id || {}) ? (mf.id as { stringValue: string }).stringValue : '';
    if (id && role === 'parent') ids.push(id);
  }
  return ids;
}

async function sendFcm(
  projectId: string,
  accessToken: string,
  deviceToken: string,
  title: string,
  body: string,
  view: string,
  tag: string,
): Promise<{ ok: boolean; status: number; detail?: string }> {
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: deviceToken,
          notification: { title, body },
          data: { title, body, view, tag },
          webpush: {
            headers: { Urgency: 'high' },
            notification: {
              title,
              body,
              icon: '/favicon.svg',
              badge: '/favicon.svg',
            },
            fcmOptions: { link: `https://greenhq.io/?view=${encodeURIComponent(view)}` },
          },
        },
      }),
    },
  );
  if (res.ok) return { ok: true, status: res.status };
  return { ok: false, status: res.status, detail: await res.text() };
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const env = context.env;
  if (!env.FIREBASE_SERVICE_ACCOUNT) {
    return json({ error: 'FIREBASE_SERVICE_ACCOUNT not configured' }, 503);
  }

  const authHeader = context.request.headers.get('Authorization') || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!idToken) return json({ error: 'Missing Authorization Bearer token' }, 401);

  const apiKey = env.FIREBASE_API_KEY || DEFAULT_API_KEY;
  const verified = await verifyIdToken(idToken, apiKey);
  if (!verified) return json({ error: 'Invalid id token' }, 401);

  let body: { familyId?: string; alertId?: string; title?: string; body?: string; view?: string };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: 'Expected JSON' }, 400);
  }

  const familyId = body.familyId || env.GREENHQ_FAMILY_ID;
  if (!familyId) return json({ error: 'familyId required' }, 400);
  const title = (body.title || "Time's up!").slice(0, 80);
  const text = (body.body || 'Screen time ended').slice(0, 160);
  const view = body.view || 'dashboard';
  // Fall back to a title-derived tag if no alertId was sent (older client),
  // so this never throws — just loses the cross-path de-dup benefit.
  const tag = body.alertId ? `screentimer-${body.alertId}` : 'screentimer';

  try {
    const sa = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT);
    const fsToken = await getGoogleAccessToken(sa, 'https://www.googleapis.com/auth/datastore');
    const docRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents/families/${encodeURIComponent(familyId)}`,
      { headers: { Authorization: `Bearer ${fsToken}` } },
    );
    if (!docRes.ok) {
      return json({ error: `Firestore ${docRes.status}`, detail: await docRes.text() }, 500);
    }
    const doc = (await docRes.json()) as { fields?: Record<string, FsValue> };
    const parentIds = readParentMemberIds(doc.fields);
    const tokenMap = readStringArrayMap(doc.fields, 'fcmTokens');
    const tokens = new Set<string>();
    for (const pid of parentIds) {
      for (const t of tokenMap[pid] || []) tokens.add(t);
    }
    // Also notify any token listed under any member if no parents matched (fallback)
    if (tokens.size === 0) {
      for (const list of Object.values(tokenMap)) for (const t of list) tokens.add(t);
    }

    if (tokens.size === 0) {
      return json({ ok: true, sent: 0, reason: 'no fcm tokens on family' });
    }

    const fcmToken = await getGoogleAccessToken(
      sa,
      'https://www.googleapis.com/auth/firebase.messaging',
    );

    let sent = 0;
    const errors: string[] = [];
    for (const deviceToken of tokens) {
      const r = await sendFcm(sa.project_id, fcmToken, deviceToken, title, text, view, tag);
      if (r.ok) sent++;
      else errors.push(`${r.status}: ${r.detail?.slice(0, 120)}`);
    }

    return json({ ok: true, sent, total: tokens.size, errors: errors.slice(0, 5) });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
};

export const onRequestGet: PagesFunction = async () =>
  json({
    ok: true,
    hint: 'POST with Authorization: Bearer <Firebase idToken> and { familyId, title, body }',
  });
