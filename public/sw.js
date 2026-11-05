// Minimal service worker: lets the app show reminder notifications and focus the app when one is tapped.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const id = event.notification.data && event.notification.data.taskId;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (windows.length) {
        await windows[0].focus();
        windows[0].postMessage({ type: 'open-task', id });
      } else {
        await self.clients.openWindow('./#/today');
      }
    })(),
  );
});
