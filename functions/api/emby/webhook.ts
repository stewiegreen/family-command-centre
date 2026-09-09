/**
 * POST /api/emby/webhook?secret=...
 *
 * Emby Premiere → Notifications → Webhooks → this URL.
 * Events: Playback start / pause / unpause / stop.
 *
 * v1: one Emby user maps to one GreenHQ member via members[].embyUserId
 * (Ellis owns the shared account for now).
 *
 * Env:
 *   EMBY_WEBHOOK_SECRET          required — query or header x-greenhq-secret
 *   GREENHQ_FAMILY_ID            Firestore families/{id}
 *   FIREBASE_SERVICE_ACCOUNT     service account JSON (client_email, private_key, project_id)
 *   EMBY_BASE_URL / EMBY_API_KEY optional — stop session when bank hits 0
 *   EMBY_SCREEN_MIN_SECONDS      default 30 — ignore shorter blips
 *
 * Tuya lighting (Genio):
 *   TUYA_CLIENT_ID / TUYA_CLIENT_SECRET / TUYA_DEVICE_IDS
 *   TUYA_ENDPOINT
 *   TUYA_DIM_FROM_PERCENT     start of gradual dim (default 75)
 *   TUYA_RESTORE_PERCENT      fallback brightness if last level unknown (default 30)
 *   TUYA_DIM_STEP_MS          ms between dim steps (default 900)
 *   EMBY_LIGHTS_DEVICE_MATCH  comma substrings vs DeviceName/DeviceId/Client
 *                             e.g. "Living Room,Shield,AndroidTv"
 *                             if set, lights only run when a match is found
 */

import {
  dimPlaybackLightingToOff,
  restorePlaybackLighting,
  tuyaConfigured,
} from "../../lib/tuya";

import {
  getGoogleAccessToken,
  parseServiceAccount,
} from "../../lib/googleSa";

import {
  getFamilyDoc,
  patchFamilyScreen,
  readLiveSessions,
  readMembers,
  readNumberMap,
  readScreenTimeLog,
  type LiveSession,
} from "../../lib/firestoreFamily";

type Env = {
  EMBY_WEBHOOK_SECRET: string;

  GREENHQ_FAMILY_ID: string;

  FIREBASE_SERVICE_ACCOUNT: string;

  EMBY_BASE_URL?: string;
  EMBY_API_KEY?: string;

  EMBY_SCREEN_MIN_SECONDS?: string;

  TUYA_CLIENT_ID?: string;
  TUYA_CLIENT_SECRET?: string;
  TUYA_DEVICE_IDS?: string;
  TUYA_ON_PLAYBACK?: string;
  TUYA_DIM_PERCENT?: string;
  TUYA_DIM_FROM_PERCENT?: string;
  TUYA_RESTORE_PERCENT?: string;
  TUYA_DIM_STEP_MS?: string;
  TUYA_ENDPOINT?: string;
  /** Comma-separated substrings matched against Emby Session DeviceName / DeviceId / Client */
  EMBY_LIGHTS_DEVICE_MATCH?: string;
};

type ParsedEvent = {
  kind: "start" | "pause" | "unpause" | "stop" | "other";

  rawEvent: string;

  embyUserId?: string;
  embyUserName?: string;

  sessionId?: string;

  // Emby client/device information.
  deviceId?: string;
  deviceName?: string;
  client?: string;

  itemName?: string;
  itemType?: string;
  /** Item.RunTimeTicks — used to skip cinematic intros */
  runTimeTicks?: number;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function normalizeEvent(raw: string): ParsedEvent["kind"] {
  const e = raw.toLowerCase().replace(/\s+/g, ".");

  if (
    e.includes("playback.start") ||
    e === "start" ||
    e.endsWith(".start")
  ) {
    return "start";
  }

  if (e.includes("unpause") || e.includes("resume")) {
    return "unpause";
  }

  if (e.includes("pause") && !e.includes("unpause")) {
    return "pause";
  }

  if (
    e.includes("playback.stop") ||
    e === "stop" ||
    e.endsWith(".stop")
  ) {
    return "stop";
  }

  // Scrobble is a progress bookmark mid-watch, NOT end of playback.
  // Treating it as "stop" restored lights every few minutes (bounce loop).
  if (e.includes("scrobble")) {
    return "other";
  }

  return "other";
}

function parsePayload(body: unknown): ParsedEvent {
  const o =
    body && typeof body === "object"
      ? (body as Record<string, unknown>)
      : {};

  const rawEvent = String(
    o.Event ||
      o.event ||
      o.NotificationType ||
      o.notificationType ||
      o.Title ||
      "",
  );

  const user =
    (o.User || o.user || {}) as Record<string, unknown>;

  const session =
    (o.Session || o.session || {}) as Record<string, unknown>;

  const item =
    (o.Item || o.item || {}) as Record<string, unknown>;

  return {
    kind: normalizeEvent(rawEvent),

    rawEvent,

    embyUserId: user.Id
      ? String(user.Id)
      : user.id
        ? String(user.id)
        : undefined,

    embyUserName: user.Name
      ? String(user.Name)
      : user.name
        ? String(user.name)
        : undefined,

    sessionId: session.Id
      ? String(session.Id)
      : session.id
        ? String(session.id)
        : undefined,

    deviceId: session.DeviceId
      ? String(session.DeviceId)
      : session.deviceId
        ? String(session.deviceId)
        : undefined,

    deviceName: session.DeviceName
      ? String(session.DeviceName)
      : session.deviceName
        ? String(session.deviceName)
        : undefined,

    client: session.Client
      ? String(session.Client)
      : session.client
        ? String(session.client)
        : undefined,

    itemName: item.Name
      ? String(item.Name)
      : item.name
        ? String(item.name)
        : undefined,

    itemType: item.Type
      ? String(item.Type)
      : item.type
        ? String(item.type)
        : undefined,

    runTimeTicks: (() => {
      const v = item.RunTimeTicks ?? item.runTimeTicks;
      if (v == null || v === "") return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    })(),
  };
}

async function stopEmbySession(
  env: Env,
  sessionId: string,
): Promise<void> {
  if (
    !env.EMBY_BASE_URL ||
    !env.EMBY_API_KEY ||
    !sessionId
  ) {
    return;
  }

  const base = env.EMBY_BASE_URL.replace(/\/+$/, "");

  const urls = [
    `${base}/emby/Sessions/${encodeURIComponent(
      sessionId,
    )}/Playing/Stop?api_key=${encodeURIComponent(
      env.EMBY_API_KEY,
    )}`,

    `${base}/Sessions/${encodeURIComponent(
      sessionId,
    )}/Playing/Stop?api_key=${encodeURIComponent(
      env.EMBY_API_KEY,
    )}`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: "POST",
      });

      if (res.ok || res.status === 204) {
        return;
      }
    } catch {
      /* try next */
    }
  }
}

function liveKey(
  embyUserId: string,
  sessionId?: string,
): string {
  return sessionId
    ? `${embyUserId}:${sessionId}`
    : embyUserId;
}

function debitMinutes(
  elapsedMs: number,
  minSeconds: number,
): number {
  if (elapsedMs < minSeconds * 1000) {
    return 0;
  }

  // Sanity cap: no single charge should ever be able to claim more
  // than a few hours of "elapsed" playback.
  const cappedMs = Math.min(
    elapsedMs,
    4 * 60 * 60 * 1000,
  );

  return Math.max(
    1,
    Math.round(cappedMs / 60000),
  );
}


/** True if this playback session is the living-room (or configured) TV. */
function embyDeviceMatchesLights(
  env: Env,
  ev: Pick<ParsedEvent, "deviceId" | "deviceName" | "client">,
): boolean {
  const raw = (env.EMBY_LIGHTS_DEVICE_MATCH || "").trim();
  // No filter configured → affect all devices (legacy behaviour)
  if (!raw) return true;
  const needles = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!needles.length) return true;
  const hay = [ev.deviceName, ev.deviceId, ev.client]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase())
    .join(" | ");
  return needles.some((n) => hay.includes(n));
}

export const onRequestPost: PagesFunction<Env> = async (
  context,
) => {
  const env = context.env;

  const url = new URL(context.request.url);

  const secret =
    url.searchParams.get("secret") ||
    context.request.headers.get("x-greenhq-secret") ||
    "";

  if (
    !env.EMBY_WEBHOOK_SECRET ||
    secret !== env.EMBY_WEBHOOK_SECRET
  ) {
    return json(
      {
        error: "Unauthorized",
      },
      401,
    );
  }

  let body: unknown;

  try {
    body = await context.request.json();
  } catch {
    return json(
      {
        error: "Expected JSON body",
      },
      400,
    );
  }

  const ev = parsePayload(body);

  if (ev.kind === "other") {
    return json({
      ok: true,
      ignored: true,
      event: ev.rawEvent,
    });
  }

  if (!ev.embyUserId) {
    return json({
      ok: true,
      ignored: true,
      reason: "no emby user in payload",
      event: ev.rawEvent,
    });
  }

  // Genio / Tuya cinema lights — only for configured Emby device(s)
  //
  // Important: do NOT react to scrobble (handled as "other" now) or to
  // very short items (cinematic intros ~1–2 min), or lights bounce
  // dim → bright → dim for the whole film.
  let lights: {
    action?: string;
    matched?: boolean;
    deviceName?: string;
    deviceId?: string;
    client?: string;
    detail?: unknown;
    error?: string;
  } | undefined;

  if (tuyaConfigured(env)) {
    const matched = embyDeviceMatchesLights(env, ev);
    lights = {
      matched,
      deviceName: ev.deviceName,
      deviceId: ev.deviceId,
      client: ev.client,
    };

    const rawLower = (ev.rawEvent || "").toLowerCase();
    const isScrobble = rawLower.includes("scrobble");
    // Skip intros / bumpers under ~3 minutes (RunTimeTicks is 100ns units)
    const INTRO_MAX_TICKS = 3 * 60 * 10_000_000; // 3 minutes
    const isLikelyIntro =
      typeof ev.runTimeTicks === "number" &&
      ev.runTimeTicks > 0 &&
      ev.runTimeTicks < INTRO_MAX_TICKS;

    if (!matched) {
      lights.action = "skipped_device";
    } else if (isScrobble) {
      lights.action = "skipped_scrobble";
    } else if (isLikelyIntro) {
      lights.action = "skipped_intro";
      lights.detail = { runTimeTicks: ev.runTimeTicks };
    } else if (ev.kind === "start" || ev.kind === "unpause") {
      try {
        const detail = await dimPlaybackLightingToOff(env);
        lights.action = "off";
        lights.detail = detail;
      } catch (err) {
        console.error("Tuya lights-off failed:", err);
        lights.action = "off";
        lights.error = err instanceof Error ? err.message : String(err);
      }
    } else if (ev.kind === "pause" || ev.kind === "stop") {
      try {
        const detail = await restorePlaybackLighting(env);
        lights.action = "restore";
        lights.detail = detail;
      } catch (err) {
        console.error("Tuya restore failed:", err);
        lights.action = "restore";
        lights.error = err instanceof Error ? err.message : String(err);
      }
    }
  }

  /*
   * ---------------------------------------------------------------
   * GREENHQ SCREEN-TIME ACCOUNTING
   * ---------------------------------------------------------------
   */

  if (
    !env.GREENHQ_FAMILY_ID ||
    !env.FIREBASE_SERVICE_ACCOUNT
  ) {
    return json({
      ok: true,
      dryRun: true,
      message:
        "Set GREENHQ_FAMILY_ID + FIREBASE_SERVICE_ACCOUNT to meter screen time",
      parsed: ev,
      lights,
    });
  }

  const minSeconds =
    parseInt(
      env.EMBY_SCREEN_MIN_SECONDS || "30",
      10,
    ) || 30;

  try {
    const sa = parseServiceAccount(
      env.FIREBASE_SERVICE_ACCOUNT,
    );

    const token =
      await getGoogleAccessToken(sa);

    const doc = await getFamilyDoc(
      sa.project_id,
      env.GREENHQ_FAMILY_ID,
      token,
    );

    const members = readMembers(doc);

    const member = members.find(
      (m) =>
        m.embyUserId &&
        m.embyUserId === ev.embyUserId,
    );

    if (!member) {
      return json({
        ok: true,
        ignored: true,
        reason:
          "no GreenHQ member with this embyUserId",
        embyUserId: ev.embyUserId,
        embyUserName: ev.embyUserName,
      });
    }

    // Parents don't use the bank.
    if (member.role === "parent") {
      return json({
        ok: true,
        ignored: true,
        reason: "parent member",
      });
    }

    const screenTime =
      readNumberMap(doc, "screenTime");

    const live =
      readLiveSessions(doc);

    const existingLog =
      readScreenTimeLog(doc);

    const key = liveKey(
      ev.embyUserId,
      ev.sessionId,
    );

    const now = Date.now();

    const newLogs: {
      id: string;
      memberId: string;
      delta: number;
      reason: string;
      byId: string;
      at: string;
    }[] = [];

    let stopSession = false;
    let charged = 0;

    const chargeFrom = (
      sess: LiveSession,
    ) => {
      if (sess.paused) return;

      const from =
        sess.lastChargedAt ??
        sess.startedAt;

      const mins = debitMinutes(
        now - from,
        minSeconds,
      );

      if (mins <= 0) return;

      const bal =
        screenTime[member.id] ?? 0;

      const take = Math.min(
        bal,
        mins,
      );

      screenTime[member.id] =
        bal - take;

      charged += take;

      if (take > 0) {
        newLogs.push({
          id: `emby:${key}:${now}`,
          memberId: member.id,
          delta: -take,

          reason:
            `Emby: ${
              ev.itemName || "playback"
            } (${take}m)`,

          byId: "emby-webhook",

          at: new Date(
            now,
          ).toISOString(),
        });
      }

      // Always advance lastChargedAt so cron/webhook
      // don't double-count.
      sess.lastChargedAt = now;

      if (
        (screenTime[member.id] ?? 0) <= 0
      ) {
        stopSession = true;
      }
    };

    if (
      ev.kind === "start" ||
      ev.kind === "unpause"
    ) {
      const existing = live[key];

      if (
        existing &&
        existing.paused &&
        ev.kind === "unpause"
      ) {
        live[key] = {
          ...existing,

          startedAt: now,
          lastChargedAt: now,

          paused: false,

          itemName:
            ev.itemName ||
            existing.itemName,
        };
      } else {
        /*
         * Any 'start' — including one that finds
         * an existing "still playing" entry — is
         * treated as authoritative and resets the
         * clock to now.
         *
         * Do NOT leave a stale session here.
         */

        if (
          (screenTime[member.id] ?? 0) <= 0
        ) {
          stopSession = true;
        } else {
          live[key] = {
            memberId: member.id,

            startedAt: now,
            lastChargedAt: now,

            sessionId:
              ev.sessionId,

            itemName:
              ev.itemName,

            paused: false,
          };
        }
      }
    } else if (ev.kind === "pause") {
      const sess =
        live[key] ||
        live[ev.embyUserId];

      if (sess) {
        chargeFrom(sess);

        live[key] = {
          ...sess,

          paused: true,

          startedAt: now,
          lastChargedAt: now,
        };
      }
    } else if (ev.kind === "stop") {
      const sess =
        live[key] ||
        live[ev.embyUserId];

      if (sess) {
        chargeFrom(sess);
      }

      delete live[key];

      if (
        ev.embyUserId &&
        live[ev.embyUserId]
      ) {
        delete live[ev.embyUserId];
      }
    }

    await patchFamilyScreen(
      sa.project_id,
      env.GREENHQ_FAMILY_ID,
      token,
      screenTime,
      live,
      newLogs,
      existingLog,
    );

    if (
      stopSession &&
      ev.sessionId
    ) {
      await stopEmbySession(
        env,
        ev.sessionId,
      );
    }

    return json({
      ok: true,

      memberId: member.id,
      memberName: member.name,

      event: ev.kind,

      chargedMinutes: charged,

      balance:
        screenTime[member.id] ?? 0,

      stopped: stopSession,
      lights,
    });
  } catch (err) {
    console.error(
      "emby webhook error",
      err,
    );

    return json(
      {
        error:
          err instanceof Error
            ? err.message
            : String(err),
      },
      500,
    );
  }
};

/**
 * Diagnostics
 */
export const onRequestGet: PagesFunction<Env> = async (
  context,
) => {
  const env = context.env;

  return json({
    ok: true,

    configured: {
      secret:
        !!env.EMBY_WEBHOOK_SECRET,

      familyId:
        !!env.GREENHQ_FAMILY_ID,

      serviceAccount:
        !!env.FIREBASE_SERVICE_ACCOUNT,

      embyStop:
        !!(
          env.EMBY_BASE_URL &&
          env.EMBY_API_KEY
        ),

      tuya:
        !!(
          env.TUYA_CLIENT_ID &&
          env.TUYA_CLIENT_SECRET &&
          env.TUYA_DEVICE_IDS
        ),
    },

    hint:
      "POST Emby playback webhooks to this URL with ?secret=EMBY_WEBHOOK_SECRET",
  });
};

/**
 * Emby's webhook "Test Notification" (and possibly real delivery,
 * depending on version) sends a preliminary HEAD request to the
 * configured URL before the actual POST.
 *
 * No body needed — just 200.
 */
export const onRequestHead: PagesFunction<Env> =
  async () => {
    return new Response(null, {
      status: 200,
    });
  };