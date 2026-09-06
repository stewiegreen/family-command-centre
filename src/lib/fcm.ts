/**
 * Firebase Cloud Messaging — web push registration.
 * Tokens are stored on the family doc under fcmTokens[memberId].
 */

import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getMessaging, getToken, isSupported, type Messaging } from 'firebase/messaging';
import { BUILT_IN_FIREBASE_CONFIG, FIREBASE_VAPID_KEY } from './firebaseConfig';
import type { FamilyData } from '../types';

let messaging: Messaging | null = null;

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

/** Merge token into family.fcmTokens for this member (max 5 devices). */
export function withFcmToken(data: FamilyData, memberId: string, token: string): FamilyData {
  const byMember = { ...(data.fcmTokens || {}) };
  const existing = byMember[memberId] || [];
  if (existing.includes(token)) return data;
  byMember[memberId] = [token, ...existing.filter((t) => t !== token)].slice(0, 5);
  return { ...data, fcmTokens: byMember };
}

export function withoutFcmToken(data: FamilyData, memberId: string, token: string): FamilyData {
  const byMember = { ...(data.fcmTokens || {}) };
  byMember[memberId] = (byMember[memberId] || []).filter((t) => t !== token);
  return { ...data, fcmTokens: byMember };
}
