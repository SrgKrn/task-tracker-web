/*
 * Пуш-уведомления в service worker. Подключается к сгенерированному воркеру через
 * workbox.importScripts (vite.config.ts). Здесь же — нажатие на уведомление: открыть
 * приложение на нужной задаче.
 */
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = { title: 'Semternity', body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Semternity', {
      body: data.body || '',
      tag: data.tag || 'semternity',
      renotify: true,
      data: { url: data.url || '/' },
      icon: '/icon-192.png',
      badge: '/favicon-48.png',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windows) {
        if ('focus' in client) {
          await client.focus()
          // приложение уже открыто — переходим внутри него, без перезагрузки
          client.postMessage({ type: 'semternity:navigate', url })
          return
        }
      }
      await self.clients.openWindow(url)
    })(),
  )
})
