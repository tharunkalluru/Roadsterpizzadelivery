// Hashed assets and base chunks are immutable; manifests and research overlays can change.
const CACHE = 'hmd-shell-0.2.0-map47-street-context-sign-text';
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('hmd-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) { const copy = response.clone(); await (await caches.open(CACHE)).put(request, copy); }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
}
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // World manifests/overlays and survey/streetscape JSON are mutable. Check the network, retaining the latest
  // successful revision as the offline fallback, including after a previous cached build.
  const worldMetadata = url.pathname.includes('/world/') && /\/(manifest|source-accuracy|listings)\.json$/.test(url.pathname);
  if (e.request.mode === 'navigate' || worldMetadata || (url.pathname.includes('/research/') && url.pathname.endsWith('.json'))) {
    e.respondWith(networkFirst(e.request));
    return;
  }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((cache) => cache.put(e.request, copy)); }
    return r;
  })));
});
