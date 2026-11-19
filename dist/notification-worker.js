self.addEventListener('push', event => {
  let payload;
  try {
    payload = event.data?.json();
  } catch {
    payload = {};
  }
  event.waitUntil(self.registration.showNotification('Saldo · 到期提醒', {
    body: typeof payload?.body === 'string' ? payload.body : '你有一项订阅即将到期，打开 Saldo 查看。',
    icon: './icon-192.png?v=20261120',
    badge: './notification-badge.png?v=20261120',
    tag: typeof payload?.tag === 'string' ? payload.tag : 'saldo-expiry',
    data: { url: self.registration.scope },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = self.registration.scope;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const current = windows.find(window => window.url.startsWith(url));
    if (current) {
      await current.navigate(url);
      await current.focus();
    } else {
      await self.clients.openWindow(url);
    }
  })());
});
