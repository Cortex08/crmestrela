// Guarda o app no aparelho para abrir e funcionar sem internet.
const CACHE = 'ponto-v1';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const guardado = await cache.match(req, { ignoreSearch: true });
    const rede = fetch(req).then((r) => { if (r && r.ok) cache.put(req, r.clone()); return r; }).catch(() => null);
    if (guardado) { e.waitUntil(rede); return guardado; }
    const r = await rede;
    if (r) return r;
    if (req.mode === 'navigate') { const i = await cache.match('./index.html') || await cache.match('./'); if (i) return i; }
    return new Response('Sem conexão', { status: 503 });
  })());
});
