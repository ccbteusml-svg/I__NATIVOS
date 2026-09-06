// ==========================================
// I__NATIVOS v4.0 Service Worker
// Offline-first + IndexedDB sync + Background Sync
// ==========================================

const CACHE_NAME = 'inativos-v20';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.png',
  './script.js',
  './erro_digital.mp3',
  './click_tec.mp3',
  './sucesso.mp3',
  './trash.mp3'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  
  // Nunca cacheia SheetDB ou Google Fonts
  if (url.hostname.includes('sheetdb.io') || url.hostname.includes('googleapis.com') || url.hostname.includes('gstatic.com')) {
    e.respondWith(fetch(e.request));
    return;
  }
  
  // Estratégia: Cache First para assets, Network First para HTML
  if (e.request.mode === 'navigate' || e.request.destination === 'document') {
    e.respondWith(
      fetch(e.request).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request).then((res) => res || caches.match('./index.html')))
    );
    return;
  }
  
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request).then((res) => {
        if (res.ok && (e.request.url.startsWith('http'))) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return res;
      });
    })
  );
});

// Background Sync
self.addEventListener('sync', (e) => {
  if (e.tag === 'sync-ctos') {
    e.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => client.postMessage('sync-now'));
      })
    );
  }
});

// Push (placeholder para futuras notificações)
self.addEventListener('push', (e) => {
  const data = e.data?.json() || { title: 'I__NATIVOS', body: 'Sincronização completa' };
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: './icon.png',
      badge: './icon.png',
      tag: 'inativos-sync'
    })
  );
});