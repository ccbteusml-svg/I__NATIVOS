const CACHE_NAME = 'inativos-v2-sons';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.png',
  './erro_digital.mp3',
  './click_tec.mp3',
  './sucesso.mp3',
  './trash.mp3'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Busca: Lógica inteligente
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // SE for uma requisição para a API do Excel (SheetDB), vai direto para a rede
  if (url.hostname.includes('sheetdb.io')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Para o restante (arquivos do app), usa o Cache primeiro
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});
