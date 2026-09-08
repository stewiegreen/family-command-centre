/**
 * Firebase Cloud Messaging — web push registration.
 * Tokens are stored on the family doc under fcmTokens[memberId].
 */

import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getMessaging, getToken, isSupported, type Messaging } from 'firebase/messaging';
import { BUILT_IN_FIREBASE_CONFIG, FIREBASE_VAPID_KEY } from './firebaseConfig';
import type { FamilyData } from '../types';

let messaging: Messaging | null = null;

/**
 * Tracks (per-device, via localStorage) whether this browser has a live,
 * successfully-registered FCM token. NotificationWatcher.tsx uses this to
 * skip its own local "catch-up" notification for alert types that already
 * have a real server-pushed notification (screen-timer alerts) — without
 * this, a device with working push would show BOTH the real push (via
 * sw.js's background handler) AND the local one, stacking as duplicates,
 * since they're two independent systems reacting to the same underlying
 * event with no coordination between them.
 *
 * This ALSO stores the actual last-registered token value (not just a
 * boolean) so a re-registration on this same device can find and remove
 * its own previous token before adding the new one. FCM tokens rotate over
 * time even on an unchanged device (service worker updates, storage
 * changes, etc.) — withFcmToken() only de-dupes by exact string match, so
 * without this, every rotation on every app reopen just appended another
 * entry to fcmTokens[memberId] (capped at 5) rather than replacing the
 * stale one, and the server sends a separate push to every entry — which
 * is exactly how one real alert turns into several stacked notifications
 * on the same phone.
 */
const FCM_ACTIVE_KEY = 'greenhq:fcmActive'; // legacy boolean, still read for back-compat
const FCM_TOKEN_KEY = 'greenhq:fcmToken';

export function hasActiveFcmToken(): boolean {
  try {
    return !!localStorage.getItem(FCM_TOKEN_KEY) || localStorage.getItem(FCM_ACTIVE_KEY) === '1';
  } catch {
    return false;
  }
}

function getStoredFcmToken(): string | null {
  try {
    return localStorage.getItem(FCM_TOKEN_KEY);
  } catch {
    return null;
  }
}

function setStoredFcmToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem(FCM_TOKEN_KEY, token);
      localStorage.setItem(FCM_ACTIVE_KEY, '1');
    } else {
      localStorage.removeItem(FCM_TOKEN_KEY);
      localStorage.removeItem(FCM_ACTIVE_KEY);
    }
  } catch {
    // localStorage unavailable (private browsing, etc.) — fine, just means
    // the local-notification fallback stays on for this device, which is
    // the safe default (better an occasional duplicate than a missed alert).
  }
}

/**
 * Reconcile fcmTokens[memberId] for THIS device: remove whatever token this
 * device previously registered (if different), add the new one. Always use
 * this instead of calling withFcmToken() directly, or stale rotated tokens
 * will silently pile up instead of being replaced.
 */
export function syncFcmToken(data: FamilyData, memberId: string, newToken: string): FamilyData {
  const prevToken = getStoredFcmToken();
  let next = data;
  // Drop this device's previous token from *every* member (profile switches
  // used to leave copies under the sibling / other parent).
  if (prevToken && prevToken !== newToken) {
    next = withoutFcmToken(next, '*', prevToken);
  }
  next = withFcmToken(next, memberId, newToken);
  setStoredFcmToken(newToken);
  return next;
}

function appInstance(): FirebaseApp | null {
  const apps = getApps();
  if (apps.length) return apps[0]!;
  try {
    return initializeApp(BUILT_IN_FIREBASE_CONFIG);
  } catch {
    return null;
  }
}

export async function fcmSupported(): Promise<boolean> {
  try {
    return await isSupported();
  } catch {
    return false;
  }
}

async function getMessagingSafe(): Promise<Messaging | null> {
  if (!(await fcmSupported())) return null;
  if (messaging) return messaging;
  const app = appInstance();
  if (!app) return null;
  try {
    messaging = getMessaging(app);
    return messaging;
  } catch (e) {
    console.warn('FCM getMessaging failed', e);
    return null;
  }
}

/**
 * Request/refresh an FCM token for this browser and return it, or null.
 * Requires notification permission already granted and a VAPID key configured.
 */
export async function registerFcmToken(): Promise<string | null> {
  if (!FIREBASE_VAPID_KEY) {
    console.warn('FCM: VITE_FIREBASE_VAPID_KEY not set — push registration skipped');
    return null;
  }
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    return null;
  }
  const msg = await getMessagingSafe();
  if (!msg) return null;

  try {
    // Prefer the existing app SW so we don't fight scopes
    const reg = await navigator.serviceWorker.ready;
    const token = await getToken(msg, {
      vapidKey: FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: reg,
    });
    return token || null;
  } catch (e) {
    console.warn('FCM getToken failed', e);
    return null;
  }
}

/** Merge token into family.fcmTokens for this member (max 5 devices).
 *  Also strips this exact token from every other member so one phone never
 *  receives N pushes because it was registered under multiple profiles. */
export function withFcmToken(data: FamilyData, memberId: string, token: string): FamilyData {
  const byMember: Record<string, string[]> = {};
  for (const [mid, list] of Object.entries(data.fcmTokens || {})) {
    const filtered = (list || []).filter((t) => t !== token);
    if (mid === memberId) continue;
    if (filtered.length) byMember[mid] = filtered;
  }
  const existing = (data.fcmTokens || {})[memberId] || [];
  byMember[memberId] = [token, ...existing.filter((t) => t !== token)].slice(0, 5);
  return { ...data, fcmTokens: byMember };
}

/** Remove token from one member, or from every member when memberId is '*'. */
export function withoutFcmToken(data: FamilyData, memberId: string, token: string): FamilyData {
  const byMember = { ...(data.fcmTokens || {}) };
  if (memberId === '*') {
    for (const mid of Object.keys(byMember)) {
      byMember[mid] = (byMember[mid] || []).filter((t) => t !== token);
      if (!byMember[mid].length) delete byMember[mid];
    }
    return { ...data, fcmTokens: byMember };
  }
  byMember[memberId] = (byMember[memberId] || []).filter((t) => t !== token);
  if (!byMember[memberId]?.length) delete byMember[memberId];
  return { ...data, fcmTokens: byMember };
}

/** Call when the person explicitly disables notifications on this device. */
export function forgetLocalFcmToken() {
  setStoredFcmToken(null);
}

/** Explicit "disable notifications" flow: remove this device's token from
 *  both Firestore and local tracking, so re-enabling later starts clean. */
export function disableFcmForMember(data: FamilyData, memberId: string): FamilyData {
  const token = getStoredFcmToken();
  const next = token ? withoutFcmToken(data, memberId, token) : data;
  setStoredFcmToken(null);
  return next;
}
