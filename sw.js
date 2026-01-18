const CACHE_NAME = 'inativos-v2-sons'; // Mudei a versão para forçar atualização
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.png',
  './sons/erro_digital.mp3',
  './sons/click_tec.mp3',
  './sons/sucesso.mp3',
  './sons/trash.mp3'
];

// Instalação: Cache de todos os arquivos (App + Sons)
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting(); // Força o SW a ativar imediatamente
});

// Ativação: Limpa caches antigos para não ocupar espaço
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

// Busca: Tenta Cache primeiro, depois Rede (Rápido e Offline)
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});
