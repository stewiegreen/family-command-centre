/**
 * POST /api/lights/control
 * Body:
 *   { "action": "on" | "off" }
 *   { "action": "dim", "percent": 1-100 }
 * Auth: Firebase ID token (Bearer). Card is parents-only in the UI.
 */
import {
  setLivingRoomBrightness,
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

  let body: { action?: string; percent?: number };
  try {
    body = (await context.request.json()) as { action?: string; percent?: number };
  } catch {
    return json(
      { error: 'Expected JSON body { action: "on"|"off"|"dim", percent?: number }' },
      400,
    );
  }

  const action = (body.action || '').toLowerCase();

  try {
    if (action === 'on' || action === 'off') {
      const result = await setLivingRoomLights(env, action);
      return json({ ok: true, ...result });
    }
    if (action === 'dim') {
      const pct = Number(body.percent);
      if (!Number.isFinite(pct) || pct < 1 || pct > 100) {
        return json({ error: 'percent must be 1–100' }, 400);
      }
      const result = await setLivingRoomBrightness(env, pct);
      return json({ ok: true, action: 'dim', ...result });
    }
    return json({ error: 'action must be "on", "off", or "dim"' }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Lights control failed:', message);
    return json({ error: message }, 502);
  }
};
