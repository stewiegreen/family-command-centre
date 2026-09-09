/** Minimal Tuya Cloud REST helper for GreenHQ lighting control. */

export interface TuyaEnv {
  TUYA_CLIENT_ID?: string;
  TUYA_CLIENT_SECRET?: string;
  TUYA_DEVICE_IDS?: string;
  TUYA_ENDPOINT?: string;
  /** Playback dim start percent (default 75). */
  TUYA_DIM_FROM_PERCENT?: string;
  /** Brightness when restoring on pause/stop (default 75). */
  TUYA_RESTORE_PERCENT?: string;
  /** ms between gradual dim steps (default 900). */
  TUYA_DIM_STEP_MS?: string;
  /** @deprecated kept for compatibility */
  TUYA_ON_PLAYBACK?: string;
  TUYA_DIM_PERCENT?: string;
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

const EMPTY_SHA256 =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

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

/** Map 1–100% → Tuya bright_value_v2 (10–1000). */
function percentToV2(percent: number): number {
  return Math.max(10, Math.min(1000, Math.round(percent * 10)));
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

async function setBrightnessAll(
  env: TuyaEnv,
  token: string,
  percent: number,
): Promise<void> {
  const v2 = percentToV2(percent);
  const deviceIds = getDeviceIds(env);
  await Promise.all(
    deviceIds.map((deviceId) =>
      sendCommands(env, token, deviceId, [
        { code: 'switch_led', value: true },
        { code: 'work_mode', value: 'white' },
        { code: 'bright_value_v2', value: v2 },
      ]),
    ),
  );
}

async function turnOffAll(env: TuyaEnv, token: string): Promise<void> {
  const deviceIds = getDeviceIds(env);
  await Promise.all(
    deviceIds.map((deviceId) =>
      sendCommands(env, token, deviceId, [
        { code: 'switch_led', value: false },
      ]),
    ),
  );
}

/**
 * Instant off when playback starts (Tuya cloud latency makes stepped
 * "dim" feel choppy — hard off is cleaner).
 */
export async function dimPlaybackLightingToOff(env: TuyaEnv): Promise<{
  mode: 'off';
}> {
  const deviceIds = getDeviceIds(env);
  if (!deviceIds.length) {
    throw new Error('TUYA_DEVICE_IDS is empty');
  }
  const token = await getToken(env);
  await turnOffAll(env, token);
  return { mode: 'off' };
}

/** Restore room lights after pause/stop (default 75%). */
export async function restorePlaybackLighting(env: TuyaEnv): Promise<{
  percent: number;
}> {
  const deviceIds = getDeviceIds(env);
  if (!deviceIds.length) {
    throw new Error('TUYA_DEVICE_IDS is empty');
  }
  const percent = clampPercent(
    Number(env.TUYA_RESTORE_PERCENT ?? '75'),
    75,
  );
  const token = await getToken(env);
  await setBrightnessAll(env, token, percent);
  return { percent };
}

/** @deprecated use dimPlaybackLightingToOff */
export async function setPlaybackLighting(env: TuyaEnv): Promise<void> {
  await dimPlaybackLightingToOff(env);
}

/** @deprecated use restorePlaybackLighting — name was inverted historically */
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
