/** Minimal Tuya Cloud REST helper for GreenHQ lighting control. */

export interface TuyaEnv {
  TUYA_CLIENT_ID?: string;
  TUYA_CLIENT_SECRET?: string;
  TUYA_DEVICE_IDS?: string;
  TUYA_ENDPOINT?: string;
  /** Fallback restore % when last brightness unknown (default 30). */
  TUYA_RESTORE_PERCENT?: string;
  /** @deprecated */
  TUYA_DIM_FROM_PERCENT?: string;
  TUYA_DIM_PERCENT?: string;
  TUYA_DIM_STEP_MS?: string;
  TUYA_ON_PLAYBACK?: string;
}

interface TuyaTokenResponse {
  success?: boolean;
  result?: {
    access_token?: string;
    expire_time?: number;
  };
  msg?: string;
  code?: number;
}

interface TuyaCommandResponse {
  success?: boolean;
  result?: boolean;
  msg?: string;
  code?: number;
}

interface TuyaStatusItem {
  code: string;
  value: unknown;
}

interface TuyaStatusResponse {
  success?: boolean;
  result?: TuyaStatusItem[];
  msg?: string;
  code?: number;
}

const EMPTY_SHA256 =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

/** Last known brightness % per Tuya device id (warm-isolate cache). */
const lastBrightnessPct: Record<string, number> = {};

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  return hex(await crypto.subtle.digest('SHA-256', data));
}

async function hmacSha256(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)),
  ).toUpperCase();
}

function getDeviceIds(env: TuyaEnv): string[] {
  return (env.TUYA_DEVICE_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

function endpoint(env: TuyaEnv): string {
  return (env.TUYA_ENDPOINT?.trim() || 'https://openapi.tuyaeu.com').replace(
    /\/+$/,
    '',
  );
}

function clampPercent(n: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(100, Math.round(n)));
}

function percentToV2(percent: number): number {
  return Math.max(10, Math.min(1000, Math.round(percent * 10)));
}

function fallbackRestorePercent(env: TuyaEnv): number {
  return clampPercent(Number(env.TUYA_RESTORE_PERCENT ?? '30'), 30);
}

/** Parse brightness % from Tuya status codes. */
function brightnessFromStatus(items: TuyaStatusItem[]): number | undefined {
  const map = new Map(items.map((i) => [i.code, i.value]));
  const v2 = map.get('bright_value_v2');
  if (typeof v2 === 'number' && v2 > 0) {
    return clampPercent(v2 / 10, 50);
  }
  const v1 = map.get('bright_value');
  if (typeof v1 === 'number' && v1 > 0) {
    // typical 25–255 scale
    return clampPercent((v1 / 255) * 100, 50);
  }
  return undefined;
}

async function getToken(env: TuyaEnv): Promise<string> {
  const clientId = env.TUYA_CLIENT_ID?.trim();
  const secret = env.TUYA_CLIENT_SECRET?.trim();
  if (!clientId || !secret) {
    throw new Error('Tuya credentials are not configured');
  }

  const path = '/v1.0/token?grant_type=1';
  const timestamp = Date.now().toString();
  const stringToSign = `GET\n${EMPTY_SHA256}\n\n${path}`;
  const sign = await hmacSha256(secret, clientId + timestamp + stringToSign);

  const response = await fetch(`${endpoint(env)}${path}`, {
    method: 'GET',
    headers: {
      client_id: clientId,
      sign,
      sign_method: 'HMAC-SHA256',
      t: timestamp,
    },
  });

  const data = (await response.json()) as TuyaTokenResponse;
  if (!response.ok || !data.success || !data.result?.access_token) {
    throw new Error(
      `Tuya token failed: ${data.msg ?? data.code ?? response.statusText}`,
    );
  }
  return data.result.access_token;
}

async function signedGet(
  env: TuyaEnv,
  accessToken: string,
  path: string,
): Promise<unknown> {
  const clientId = env.TUYA_CLIENT_ID?.trim();
  const secret = env.TUYA_CLIENT_SECRET?.trim();
  if (!clientId || !secret) throw new Error('Tuya credentials are not configured');

  const timestamp = Date.now().toString();
  const stringToSign = `GET\n${EMPTY_SHA256}\n\n${path}`;
  const sign = await hmacSha256(
    secret,
    clientId + accessToken + timestamp + stringToSign,
  );

  const response = await fetch(`${endpoint(env)}${path}`, {
    method: 'GET',
    headers: {
      client_id: clientId,
      access_token: accessToken,
      sign,
      sign_method: 'HMAC-SHA256',
      t: timestamp,
    },
  });
  return response.json();
}

async function sendCommands(
  env: TuyaEnv,
  accessToken: string,
  deviceId: string,
  commands: Array<{ code: string; value: unknown }>,
): Promise<void> {
  const clientId = env.TUYA_CLIENT_ID?.trim();
  const secret = env.TUYA_CLIENT_SECRET?.trim();
  if (!clientId || !secret) {
    throw new Error('Tuya credentials are not configured');
  }

  const path = `/v1.0/devices/${encodeURIComponent(deviceId)}/commands`;
  const body = JSON.stringify({ commands });
  const bodyHash = await sha256(body);
  const timestamp = Date.now().toString();
  const stringToSign = `POST\n${bodyHash}\n\n${path}`;
  const sign = await hmacSha256(
    secret,
    clientId + accessToken + timestamp + stringToSign,
  );

  const response = await fetch(`${endpoint(env)}${path}`, {
    method: 'POST',
    headers: {
      client_id: clientId,
      access_token: accessToken,
      sign,
      sign_method: 'HMAC-SHA256',
      t: timestamp,
      'Content-Type': 'application/json',
    },
    body,
  });

  const data = (await response.json()) as TuyaCommandResponse;
  if (!response.ok || !data.success) {
    throw new Error(
      `Tuya command failed for ${deviceId}: ${data.msg ?? response.statusText}`,
    );
  }
}

async function readDeviceBrightness(
  env: TuyaEnv,
  token: string,
  deviceId: string,
): Promise<number | undefined> {
  const path = `/v1.0/devices/${encodeURIComponent(deviceId)}/status`;
  const data = (await signedGet(env, token, path)) as TuyaStatusResponse;
  if (!data.success || !Array.isArray(data.result)) {
    return undefined;
  }
  return brightnessFromStatus(data.result);
}

async function setBrightnessOne(
  env: TuyaEnv,
  token: string,
  deviceId: string,
  percent: number,
): Promise<void> {
  const v2 = percentToV2(percent);
  await sendCommands(env, token, deviceId, [
    { code: 'switch_led', value: true },
    { code: 'work_mode', value: 'white' },
    { code: 'bright_value_v2', value: v2 },
  ]);
}

async function turnOffOne(
  env: TuyaEnv,
  token: string,
  deviceId: string,
): Promise<void> {
  await sendCommands(env, token, deviceId, [
    { code: 'switch_led', value: false },
  ]);
}

/**
 * Snapshot current brightness, then turn lights off.
 * Uses TUYA_RESTORE_PERCENT only later if snapshot failed.
 */
export async function dimPlaybackLightingToOff(env: TuyaEnv): Promise<{
  mode: 'off';
  saved: Record<string, number | null>;
}> {
  const deviceIds = getDeviceIds(env);
  if (!deviceIds.length) {
    throw new Error('TUYA_DEVICE_IDS is empty');
  }
  const token = await getToken(env);
  const saved: Record<string, number | null> = {};

  await Promise.all(
    deviceIds.map(async (deviceId) => {
      try {
        const pct = await readDeviceBrightness(env, token, deviceId);
        if (pct != null) {
          lastBrightnessPct[deviceId] = pct;
          saved[deviceId] = pct;
        } else {
          saved[deviceId] = lastBrightnessPct[deviceId] ?? null;
        }
      } catch {
        saved[deviceId] = lastBrightnessPct[deviceId] ?? null;
      }
      await turnOffOne(env, token, deviceId);
    }),
  );

  return { mode: 'off', saved };
}

/**
 * Restore each light to its last known brightness.
 * Fallback: TUYA_RESTORE_PERCENT (default 30).
 */
export async function restorePlaybackLighting(env: TuyaEnv): Promise<{
  percent: Record<string, number>;
  source: Record<string, 'snapshot' | 'status' | 'fallback'>;
}> {
  const deviceIds = getDeviceIds(env);
  if (!deviceIds.length) {
    throw new Error('TUYA_DEVICE_IDS is empty');
  }
  const fallback = fallbackRestorePercent(env);
  const token = await getToken(env);
  const percent: Record<string, number> = {};
  const source: Record<string, 'snapshot' | 'status' | 'fallback'> = {};

  await Promise.all(
    deviceIds.map(async (deviceId) => {
      let pct = lastBrightnessPct[deviceId];
      let src: 'snapshot' | 'status' | 'fallback' =
        pct != null ? 'snapshot' : 'fallback';

      if (pct == null) {
        try {
          const fromStatus = await readDeviceBrightness(env, token, deviceId);
          if (fromStatus != null) {
            pct = fromStatus;
            src = 'status';
            lastBrightnessPct[deviceId] = fromStatus;
          }
        } catch {
          /* use fallback */
        }
      }

      if (pct == null) {
        pct = fallback;
        src = 'fallback';
      }

      percent[deviceId] = pct;
      source[deviceId] = src;
      await setBrightnessOne(env, token, deviceId, pct);
    }),
  );

  return { percent, source };
}

/** @deprecated */
export async function setPlaybackLighting(env: TuyaEnv): Promise<void> {
  await dimPlaybackLightingToOff(env);
}

/** @deprecated */
export async function turnPlaybackLightingOff(env: TuyaEnv): Promise<void> {
  await restorePlaybackLighting(env);
}

export function tuyaConfigured(env: TuyaEnv): boolean {
  return !!(
    env.TUYA_CLIENT_ID?.trim() &&
    env.TUYA_CLIENT_SECRET?.trim() &&
    getDeviceIds(env).length
  );
}
