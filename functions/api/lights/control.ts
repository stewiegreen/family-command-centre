/**
 * POST /api/lights/control
 * Body:
 *   { "familyId": string, "action": "on" | "off" }
 *   { "familyId": string, "action": "dim", "percent": 1-100 }
 * Auth: Firebase ID token (Bearer) + parent/admin of familyId.
 */
import {
  setLivingRoomBrightness,
  setLivingRoomLights,
  tuyaConfigured,
  type TuyaEnv,
} from '../../lib/tuya';
import { verifyParent, toErrorResponse, AuthError } from '../../_lib/auth';

type Env = TuyaEnv & {
  FIREBASE_PROJECT_ID: string;
};

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

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
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

    let body: { familyId?: string; action?: string; percent?: number };
    try {
      body = (await context.request.json()) as {
        familyId?: string;
        action?: string;
        percent?: number;
      };
    } catch {
      return json(
        {
          error:
            'Expected JSON body { familyId, action: "on"|"off"|"dim", percent?: number }',
        },
        400,
      );
    }

    const familyId = (body.familyId || '').trim();
    if (!familyId) return json({ error: 'Missing familyId' }, 400);

    // Verifies the token locally AND that the caller is a parent/admin.
    await verifyParent(context.request, env, familyId);

    const action = (body.action || '').toLowerCase();
    console.log('[lights/control]', action, 'familyId=', familyId.slice(0, 8));

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
    const status = err instanceof AuthError ? err.status : 502;
    console.error('[lights/control] failed', status, message);
    if (err instanceof AuthError) {
      return json({ error: message }, status);
    }
    return json({ error: message }, 502);
  }
};
