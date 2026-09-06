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
 */

import { getGoogleAccessToken, parseServiceAccount } from '../../lib/googleSa';
import {
  getFamilyDoc,
  patchFamilyScreen,
  readLiveSessions,
  readMembers,
  readNumberMap,
  readScreenTimeLog,
  type LiveSession,
} from '../../lib/firestoreFamily';

type Env = {
  EMBY_WEBHOOK_SECRET: string;
  GREENHQ_FAMILY_ID: string;
  FIREBASE_SERVICE_ACCOUNT: string;
  EMBY_BASE_URL?: string;
  EMBY_API_KEY?: string;
  EMBY_SCREEN_MIN_SECONDS?: string;
};

type ParsedEvent = {
  kind: 'start' | 'pause' | 'unpause' | 'stop' | 'other';
  rawEvent: string;
  embyUserId?: string;
  embyUserName?: string;
  sessionId?: string;
  itemName?: string;
  itemType?: string;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function normalizeEvent(raw: string): ParsedEvent['kind'] {
  const e = raw.toLowerCase().replace(/\s+/g, '.');
  if (e.includes('playback.start') || e === 'start' || e.endsWith('.start')) return 'start';
  if (e.includes('unpause') || e.includes('resume')) return 'unpause';
  if (e.includes('pause') && !e.includes('unpause')) return 'pause';
  if (e.includes('playback.stop') || e === 'stop' || e.endsWith('.stop')) return 'stop';
  if (e.includes('scrobble')) return 'stop';
  return 'other';
}

function parsePayload(body: unknown): ParsedEvent {
  const o = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const rawEvent = String(
    o.Event || o.event || o.NotificationType || o.notificationType || o.Title || '',
  );
  const user = (o.User || o.user || {}) as Record<string, unknown>;
  const session = (o.Session || o.session || {}) as Record<string, unknown>;
  const item = (o.Item || o.item || {}) as Record<string, unknown>;
  return {
    kind: normalizeEvent(rawEvent),
    rawEvent,
    embyUserId: user.Id ? String(user.Id) : user.id ? String(user.id) : undefined,
    embyUserName: user.Name ? String(user.Name) : user.name ? String(user.name) : undefined,
    sessionId: session.Id ? String(session.Id) : session.id ? String(session.id) : undefined,
    itemName: item.Name ? String(item.Name) : item.name ? String(item.name) : undefined,
    itemType: item.Type ? String(item.Type) : item.type ? String(item.type) : undefined,
  };
}

async function stopEmbySession(env: Env, sessionId: string): Promise<void> {
  if (!env.EMBY_BASE_URL || !env.EMBY_API_KEY || !sessionId) return;
  const base = env.EMBY_BASE_URL.replace(/\/+$/, '');
  // Try common stop endpoints
  const urls = [
    `${base}/emby/Sessions/${encodeURIComponent(sessionId)}/Playing/Stop?api_key=${encodeURIComponent(env.EMBY_API_KEY)}`,
    `${base}/Sessions/${encodeURIComponent(sessionId)}/Playing/Stop?api_key=${encodeURIComponent(env.EMBY_API_KEY)}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { method: 'POST' });
      if (res.ok || res.status === 204) return;
    } catch {
      /* try next */
    }
  }
}

function liveKey(embyUserId: string, sessionId?: string): string {
  return sessionId ? `${embyUserId}:${sessionId}` : embyUserId;
}

function debitMinutes(elapsedMs: number, minSeconds: number): number {
  if (elapsedMs < minSeconds * 1000) return 0;
  // Sanity cap: no single charge should ever be able to claim more than a
  // few hours of "elapsed" playback. This is a backstop against any stale
  // or clock-skewed startedAt (e.g. a session that outlives a missed stop
  // event) computing an enormous one-shot debit and instantly wiping a
  // balance — better to undercharge in a genuinely weird edge case than to
  // ever drain someone's whole bank in a single erroneous event.
  const cappedMs = Math.min(elapsedMs, 4 * 60 * 60 * 1000);
  return Math.max(1, Math.round(cappedMs / 60000));
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const env = context.env;
  const url = new URL(context.request.url);
  const secret =
    url.searchParams.get('secret') ||
    context.request.headers.get('x-greenhq-secret') ||
    '';
  if (!env.EMBY_WEBHOOK_SECRET || secret !== env.EMBY_WEBHOOK_SECRET) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: 'Expected JSON body' }, 400);
  }

  const ev = parsePayload(body);
  if (ev.kind === 'other') {
    return json({ ok: true, ignored: true, event: ev.rawEvent });
  }

  if (!ev.embyUserId) {
    return json({ ok: true, ignored: true, reason: 'no emby user in payload', event: ev.rawEvent });
  }

  if (!env.GREENHQ_FAMILY_ID || !env.FIREBASE_SERVICE_ACCOUNT) {
    return json({
      ok: true,
      dryRun: true,
      message: 'Set GREENHQ_FAMILY_ID + FIREBASE_SERVICE_ACCOUNT to meter screen time',
      parsed: ev,
    });
  }

  const minSeconds = parseInt(env.EMBY_SCREEN_MIN_SECONDS || '30', 10) || 30;

  try {
    const sa = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT);
    const token = await getGoogleAccessToken(sa);
    const doc = await getFamilyDoc(sa.project_id, env.GREENHQ_FAMILY_ID, token);
    const members = readMembers(doc);
    const member = members.find(
      (m) => m.embyUserId && m.embyUserId === ev.embyUserId,
    );
    if (!member) {
      return json({
        ok: true,
        ignored: true,
        reason: 'no GreenHQ member with this embyUserId',
        embyUserId: ev.embyUserId,
        embyUserName: ev.embyUserName,
      });
    }
    // Parents don't use the bank
    if (member.role === 'parent') {
      return json({ ok: true, ignored: true, reason: 'parent member' });
    }

    const screenTime = readNumberMap(doc, 'screenTime');
    const live = readLiveSessions(doc);
    const existingLog = readScreenTimeLog(doc);
    const key = liveKey(ev.embyUserId, ev.sessionId);
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

    const chargeFrom = (sess: LiveSession) => {
      if (sess.paused) return;
      const from = sess.lastChargedAt ?? sess.startedAt;
      const mins = debitMinutes(now - from, minSeconds);
      if (mins <= 0) return;
      const bal = screenTime[member.id] ?? 0;
      const take = Math.min(bal, mins);
      screenTime[member.id] = bal - take;
      charged += take;
      if (take > 0) {
        newLogs.push({
          id: `emby:${key}:${now}`,
          memberId: member.id,
          delta: -take,
          reason: `Emby: ${ev.itemName || 'playback'} (${take}m)`,
          byId: 'emby-webhook',
          at: new Date(now).toISOString(),
        });
      }
      // Always advance lastChargedAt so cron/webhook don't double-count
      sess.lastChargedAt = now;
      if ((screenTime[member.id] ?? 0) <= 0) stopSession = true;
    };

    if (ev.kind === 'start' || ev.kind === 'unpause') {
      const existing = live[key];
      if (existing && existing.paused && ev.kind === 'unpause') {
        live[key] = {
          ...existing,
          startedAt: now,
          lastChargedAt: now,
          paused: false,
          itemName: ev.itemName || existing.itemName,
        };
      } else {
        // Any 'start' — including one that finds an existing "still playing"
        // entry — is treated as authoritative and resets the clock to now.
        // Do NOT "leave as-is" here: a leftover session from an interrupted
        // test/earlier watch (missed stop event, dropped webhook, etc.) would
        // otherwise sit with a stale startedAt, and the next pause/stop would
        // compute an enormous elapsed time from it and instantly drain the
        // whole balance in one charge — exactly the "cuts out immediately
        // despite having time available" bug this fixes.
        if ((screenTime[member.id] ?? 0) <= 0) {
          stopSession = true;
        } else {
          live[key] = {
            memberId: member.id,
            startedAt: now,
            lastChargedAt: now,
            sessionId: ev.sessionId,
            itemName: ev.itemName,
            paused: false,
          };
        }
      }
    } else if (ev.kind === 'pause') {
      const sess = live[key] || live[ev.embyUserId];
      if (sess) {
        chargeFrom(sess);
        live[key] = {
          ...sess,
          paused: true,
          startedAt: now,
          lastChargedAt: now,
        };
      }
    } else if (ev.kind === 'stop') {
      const sess = live[key] || live[ev.embyUserId];
      if (sess) {
        chargeFrom(sess);
      }
      delete live[key];
      if (ev.embyUserId && live[ev.embyUserId]) delete live[ev.embyUserId];
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

    if (stopSession && ev.sessionId) {
      await stopEmbySession(env, ev.sessionId);
    }

    return json({
      ok: true,
      memberId: member.id,
      memberName: member.name,
      event: ev.kind,
      chargedMinutes: charged,
      balance: screenTime[member.id] ?? 0,
      stopped: stopSession,
    });
  } catch (err) {
    console.error('emby webhook error', err);
    return json(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
};

/** Diagnostics */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const env = context.env;
  return json({
    ok: true,
    configured: {
      secret: !!env.EMBY_WEBHOOK_SECRET,
      familyId: !!env.GREENHQ_FAMILY_ID,
      serviceAccount: !!env.FIREBASE_SERVICE_ACCOUNT,
      embyStop: !!(env.EMBY_BASE_URL && env.EMBY_API_KEY),
    },
    hint: 'POST Emby playback webhooks to this URL with ?secret=EMBY_WEBHOOK_SECRET',
  });
};

/**
 * Emby's webhook "Test Notification" (and possibly real delivery, depending
 * on version) sends a preliminary HEAD request to the configured URL before
 * the actual POST — confirmed via real-world logs from another Emby webhook
 * integration project hitting the exact same "Method Not Allowed" symptom.
 * Without this export, Cloudflare rejects that HEAD before Emby ever
 * attempts the POST carrying the real payload. No body needed — just 200.
 */
export const onRequestHead: PagesFunction<Env> = async () => {
  return new Response(null, { status: 200 });
};
