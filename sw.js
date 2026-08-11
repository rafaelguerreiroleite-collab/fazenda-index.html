const CACHE = 'fazendajs-v2';
const ASSETS = ['./', './index.html', './style.css', './app.js', './manifest.json', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = e.request.url;
  if (e.request.method !== 'GET') return;
  // Nunca interceptar tráfego do Firestore/Auth (tempo real)
  if (url.includes('firestore.googleapis.com') || url.includes('identitytoolkit') || url.includes('securetoken')) return;
  const cacheable = url.startsWith(self.location.origin) || url.includes('gstatic.com/firebasejs') || url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com');
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      if (cacheable && res && (res.ok || res.type === 'opaque')) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
