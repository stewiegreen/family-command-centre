/**
 * Local browser notifications for Family Command Centre.
 * Works while the app is open (or in a background tab). True push when the
 * browser is fully closed needs Firebase Cloud Messaging — not wired yet.
 */

const SEEN_KEY = 'fcc_notif_seen_v1';
const ENABLED_KEY = 'fcc_notifications_enabled';

/** Per-device preference (not synced in family settings). */
export function isNotificationsEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === '1';
  } catch {
    return false;
  }
}

export function setNotificationsEnabled(on: boolean) {
  try {
    localStorage.setItem(ENABLED_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

type SeenStore = {
  messages: string[];
  todos: string[];
  events: string[];
  announcement: string;
};

function loadSeen(): SeenStore {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (raw) return JSON.parse(raw) as SeenStore;
  } catch {
    /* ignore */
  }
  return { messages: [], todos: [], events: [], announcement: '' };
}

function saveSeen(s: SeenStore) {
  const trim = (arr: string[]) => arr.slice(-80);
  localStorage.setItem(
    SEEN_KEY,
    JSON.stringify({
      messages: trim(s.messages),
      todos: trim(s.todos),
      events: trim(s.events),
      announcement: s.announcement,
    }),
  );
}

export type NotifPermission = NotificationPermission | 'unsupported';

export function notificationSupport(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): NotifPermission {
  if (!notificationSupport()) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotifPermission> {
  if (!notificationSupport()) return 'unsupported';
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return Notification.permission;
  }
}

export async function registerNotificationSw(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    return reg;
  } catch (e) {
    console.warn('SW register failed', e);
    return null;
  }
}

export async function showLocalNotification(
  title: string,
  options: { body?: string; tag?: string; data?: { view?: string } },
): Promise<void> {
  if (!notificationSupport() || Notification.permission !== 'granted') return;

  const payload: NotificationOptions = {
    body: options.body,
    tag: options.tag,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    data: options.data || {},
  };

  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg?.showNotification) {
      await reg.showNotification(title, payload);
      return;
    }
  } catch {
    /* fall through */
  }

  // Foreground fallback
  const n = new Notification(title, payload);
  n.onclick = () => {
    window.focus();
    const view = options.data?.view;
    if (view) window.dispatchEvent(new CustomEvent('fcc:navigate', { detail: { view } }));
    n.close();
  };
}

/** Seed seen-sets so existing data does not spam on first enable. */
export function seedNotificationBaseline(input: {
  messageIds: string[];
  todoKeys: string[];
  eventKeys: string[];
  announcement: string;
}) {
  const seen = loadSeen();
  seen.messages = Array.from(new Set([...seen.messages, ...input.messageIds]));
  seen.todos = Array.from(new Set([...seen.todos, ...input.todoKeys]));
  seen.events = Array.from(new Set([...seen.events, ...input.eventKeys]));
  seen.announcement = input.announcement || seen.announcement;
  saveSeen(seen);
}

export function markMessageNotified(id: string) {
  const seen = loadSeen();
  if (!seen.messages.includes(id)) {
    seen.messages.push(id);
    saveSeen(seen);
  }
}

export function wasMessageNotified(id: string) {
  return loadSeen().messages.includes(id);
}

export function markTodoNotified(key: string) {
  const seen = loadSeen();
  if (!seen.todos.includes(key)) {
    seen.todos.push(key);
    saveSeen(seen);
  }
}

export function wasTodoNotified(key: string) {
  return loadSeen().todos.includes(key);
}

export function markEventNotified(key: string) {
  const seen = loadSeen();
  if (!seen.events.includes(key)) {
    seen.events.push(key);
    saveSeen(seen);
  }
}

export function wasEventNotified(key: string) {
  return loadSeen().events.includes(key);
}

export function getLastAnnouncementNotified() {
  return loadSeen().announcement;
}

export function markAnnouncementNotified(text: string) {
  const seen = loadSeen();
  seen.announcement = text;
  saveSeen(seen);
}
