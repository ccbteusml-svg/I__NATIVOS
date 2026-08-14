const CACHE_NAME = 'inativos-v10';
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
  
  if (url.hostname.includes('sheetdb.io') || url.hostname.includes('googleapis.com')) {
    e.respondWith(fetch(e.request));
    return;
  }
  
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});