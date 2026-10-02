// Service Worker — I__NATIVOS (cache simples para funcionar offline)
const CACHE = 'inativos-v1';
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);
    // Planilha (sheetdb) sempre vai à rede, sem cache
    if (url.hostname.includes('sheetdb.io')) return;
    // Estratégia: rede primeiro, cache como reserva (dados locais são pequenos)
    e.respondWith(
        fetch(e.request)
            .then(res => {
                const clone = res.clone();
                caches.open(CACHE).then(c => c.put(e.request, clone));
                return res;
            })
            .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
    );
});
