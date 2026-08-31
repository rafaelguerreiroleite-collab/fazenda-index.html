const CACHE = 'fazendajs-v34';
const ASSETS = ['./', './index.html', './style.css', './app.js', './manifest.json', './logo.png', './icon-192.png', './icon-512.png'];
// O leitor de PDF é do próprio aplicativo e fica guardado desde a instalação:
// nota fiscal em PDF precisa abrir no curral, onde não há sinal.
const LEITOR_PDF = ['./vendor/pdf.min.js', './vendor/pdf.worker.min.js'];
// O SDK do Firebase precisa estar guardado desde a instalação: sem ele o app
// abriria no curral sem conseguir gravar nada.
const EXTERNOS = [
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js'
];
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(ASSETS);
    // Melhor esforço para não derrubar a instalação inteira se um deles falhar.
    for (const u of LEITOR_PDF) { try { await c.add(u); } catch (e) { /* segue */ } }
    // De outro domínio: melhor esforço, sem derrubar a instalação se falhar.
    await Promise.all(EXTERNOS.map(u =>
      fetch(new Request(u, { mode: 'no-cors' })).then(r => c.put(u, r)).catch(() => {})
    ));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = e.request.url;
  if (e.request.method !== 'GET') return;
  // Nunca interceptar tráfego do Firestore/Auth (tempo real)
  if (url.includes('firestore.googleapis.com') || url.includes('identitytoolkit') || url.includes('securetoken')) return;

  // Arquivos do próprio app: rede primeiro, para que uma nova versão publicada
  // chegue ao aparelho. O cache fica como reserva para uso sem sinal.
  if (url.startsWith(self.location.origin)) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(cached => {
        // ignoreSearch: o pré-cache guarda "app.js" sem versão, mas a página
        // pede "app.js?v=N" — sem isso, offline devolveria HTML no lugar do JS.
        if (cached) return cached;
        if (e.request.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      }))
    );
    return;
  }

  // Fontes e SDK do Firebase têm URL fixa por versão — cache primeiro.
  const cacheable = url.includes('gstatic.com/firebasejs') || url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com');
  if (!cacheable) return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      if (res && (res.ok || res.type === 'opaque')) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }))
  );
});
