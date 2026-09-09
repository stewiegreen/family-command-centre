/** Minimal Tuya Cloud REST helper for GreenHQ lighting control. */

export interface TuyaEnv {
  TUYA_CLIENT_ID?: string;
  TUYA_CLIENT_SECRET?: string;
  TUYA_DEVICE_IDS?: string;
  TUYA_ENDPOINT?: string;
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
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);

  return hex(await crypto.subtle.digest("SHA-256", data));
}

async function hmacSha256(
  secret: string,
  value: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  return hex(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(value),
    ),
  ).toUpperCase();
}

function getDeviceIds(env: TuyaEnv): string[] {
  return (env.TUYA_DEVICE_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function endpoint(env: TuyaEnv): string {
  return (
    env.TUYA_ENDPOINT?.trim() ||
    "https://openapi.tuyaeu.com"
  ).replace(/\/+$/, "");
}

async function getToken(env: TuyaEnv): Promise<string> {
  const clientId = env.TUYA_CLIENT_ID?.trim();
  const secret = env.TUYA_CLIENT_SECRET?.trim();

  if (!clientId || !secret) {
    throw new Error("Tuya credentials are not configured");
  }

  const path = "/v1.0/token?grant_type=1";
  const timestamp = Date.now().toString();

  const bodyHash = EMPTY_SHA256;

  // No custom signed headers.
  const stringToSign =
    `GET\n${bodyHash}\n\n${path}`;

  const signPayload =
    clientId +
    timestamp +
    stringToSign;

  const sign = await hmacSha256(secret, signPayload);

  const response = await fetch(`${endpoint(env)}${path}`, {
    method: "GET",
    headers: {
      client_id: clientId,
      sign,
      sign_method: "HMAC-SHA256",
      t: timestamp,
    },
  });

  const data =
    (await response.json()) as TuyaTokenResponse;

  if (!response.ok || !data.success || !data.result?.access_token) {
    throw new Error(
      `Tuya token request failed: ${data.msg ?? response.statusText}`,
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
  const clientId = env.TUYA_CLIENT_ID!.trim();
  const secret = env.TUYA_CLIENT_SECRET!.trim();

  const path =
    `/v1.0/iot-03/devices/${encodeURIComponent(deviceId)}/commands`;

  const body = JSON.stringify({ commands });
  const bodyHash = await sha256(body);
  const timestamp = Date.now().toString();

  const stringToSign =
    `POST\n${bodyHash}\n\n${path}`;

  const signPayload =
    clientId +
    accessToken +
    timestamp +
    stringToSign;

  const sign = await hmacSha256(secret, signPayload);

  const response = await fetch(`${endpoint(env)}${path}`, {
    method: "POST",
    headers: {
      client_id: clientId,
      access_token: accessToken,
      sign,
      sign_method: "HMAC-SHA256",
      t: timestamp,
      "Content-Type": "application/json",
    },
    body,
  });

  const data =
    (await response.json()) as TuyaCommandResponse;

  if (!response.ok || !data.success) {
    throw new Error(
      `Tuya command failed for ${deviceId}: ${
        data.msg ?? response.statusText
      }`,
    );
  }
}

export async function setPlaybackLighting(
  env: TuyaEnv,
): Promise<void> {
  const deviceIds = getDeviceIds(env);

  if (!deviceIds.length) {
    throw new Error("TUYA_DEVICE_IDS is empty");
  }

  const mode =
    (env.TUYA_ON_PLAYBACK ?? "dim").trim().toLowerCase();

  if (mode !== "dim") {
    return;
  }

  const percent = Math.max(
    1,
    Math.min(
      100,
      Number(env.TUYA_DIM_PERCENT ?? "15"),
    ),
  );

  // Device range is 10..1000, so 15% = 150.
  const brightness = Math.round(percent * 10);

  const token = await getToken(env);

  await Promise.all(
    deviceIds.map((deviceId) =>
      sendCommands(env, token, deviceId, [
        {
          code: "switch_led",
          value: true,
        },
        {
          code: "work_mode",
          value: "white",
        },
        {
          code: "bright_value_v2",
          value: brightness,
        },
      ]),
    ),
  );
}

export async function turnPlaybackLightingOff(
  env: TuyaEnv,
): Promise<void> {
  const deviceIds = getDeviceIds(env);

  if (!deviceIds.length) {
    return;
  }

  const token = await getToken(env);

  await Promise.all(
    deviceIds.map((deviceId) =>
      sendCommands(env, token, deviceId, [
        {
          code: "switch_led",
          value: false,
        },
      ]),
    ),
  );
}