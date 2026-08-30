/* Family Command Centre — minimal service worker for local notifications */
self.addEventListener('install', (event) => {
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
