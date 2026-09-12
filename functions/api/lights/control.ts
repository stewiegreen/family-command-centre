/**
 * POST /api/lights/control
 * Body: { "action": "on" | "off" }
 * Auth: Firebase ID token (Bearer). Card is parents-only in the UI.
 *
 * Env (same as Emby webhook lighting):
 *   TUYA_CLIENT_ID, TUYA_CLIENT_SECRET, TUYA_DEVICE_IDS
 *   optional TUYA_ENDPOINT, TUYA_RESTORE_PERCENT, FIREBASE_API_KEY
 */
import {
  setLivingRoomLights,
  tuyaConfigured,
  type TuyaEnv,
} from '../../lib/tuya';

type Env = TuyaEnv & {
  FIREBASE_API_KEY?: string;
};

const DEFAULT_API_KEY = 'AIzaSyBFKQ356Fs-eVjG-T24tcP6RbUHtfNcICc';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
  });
}

export const onRequestOptions: PagesFunction = async () => json({ ok: true });

async function verifyIdToken(
  idToken: string,
  apiKey: string,
): Promise<{ uid: string } | null> {
  try {
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
  } catch {
    return null;
  }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const env = context.env;

  if (!tuyaConfigured(env)) {
    return json(
      {
        error:
          'Lights not configured (set TUYA_CLIENT_ID, TUYA_CLIENT_SECRET, TUYA_DEVICE_IDS)',
      },
      503,
    );
  }

  const authHeader = context.request.headers.get('Authorization') || '';
  const idToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (!idToken) {
    return json({ error: 'Missing Authorization Bearer token' }, 401);
  }

  const apiKey = env.FIREBASE_API_KEY || DEFAULT_API_KEY;
  const verified = await verifyIdToken(idToken, apiKey);
  if (!verified) {
    return json({ error: 'Invalid id token' }, 401);
  }

  let body: { action?: string };
  try {
    body = (await context.request.json()) as { action?: string };
  } catch {
    return json({ error: 'Expected JSON body { action: "on"|"off" }' }, 400);
  }

  const action = (body.action || '').toLowerCase();
  if (action !== 'on' && action !== 'off') {
    return json({ error: 'action must be "on" or "off"' }, 400);
  }

  try {
    const result = await setLivingRoomLights(env, action as 'on' | 'off');
    return json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Lights control failed:', message);
    return json({ error: message }, 502);
  }
};
