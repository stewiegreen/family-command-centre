/* Family Command Centre — service worker (local notifs + FCM background) */
/* eslint-disable no-undef */

importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBFKQ356Fs-eVjG-T24tcP6RbUHtfNcICc',
  authDomain: 'command-c62ad.firebaseapp.com',
  projectId: 'command-c62ad',
  storageBucket: 'command-c62ad.firebasestorage.app',
  messagingSenderId: '461364513601',
  appId: '1:461364513601:web:cda69c4c08e31947392fc0',
});

try {
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const title =
      (payload.data && payload.data.title) ||
      (payload.notification && payload.notification.title) ||
      'GreenHQ';
    const body =
      (payload.data && payload.data.body) ||
      (payload.notification && payload.notification.body) ||
      '';
    const view = (payload.data && payload.data.view) || 'dashboard';
    const tag = (payload.data && payload.data.tag) || 'greenhq-push';
    // One notification per tag — OS replaces rather than stacks.
    return self.registration.showNotification(title, {
      body,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag,
      renotify: false,
      data: { view, tag },
    });
  });
} catch (e) {
  // Messaging unsupported in this SW context
  console.warn('FCM SW init', e);
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const view = event.notification.data && event.notification.data.view;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if (view) client.postMessage({ type: 'fcc:navigate', view });
          return;
        }
      }
      if (self.clients.openWindow) {
        const url = view ? `/?view=${encodeURIComponent(view)}` : '/';
        return self.clients.openWindow(url);
      }
    }),
  );
});
