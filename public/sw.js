// The notification worker: shows pushes from the server, and opens the app
// when you tap one. It caches nothing, so app updates land immediately.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { body: event.data && event.data.text() };
  }
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(d.title || 'AccountAbility', {
        body: d.body || '',
        tag: d.tag,
        renotify: Boolean(d.tag),
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        data: { url: d.url || '/' },
      });
      // If the app is open, have it pull in whatever just happened.
      for (const c of await self.clients.matchAll({ type: 'window' })) c.postMessage('refresh');
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (open.length) return open[0].focus();
      return self.clients.openWindow((event.notification.data && event.notification.data.url) || '/');
    })()
  );
});
