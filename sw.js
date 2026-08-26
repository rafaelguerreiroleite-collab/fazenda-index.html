const CACHE = 'gastos-v2';
const SHELL = ['./', 'index.html', 'config.js', 'manifest.json', 'icone-192.png', 'icone-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const guardar = (req, res) => {
  if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
    const copia = res.clone();
    caches.open(CACHE).then(c => c.put(req, copia));
  }
  return res;
};

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // Firestore: sempre rede (o SDK tem cache proprio em IndexedDB)
  if (req.url.includes('firestore.googleapis.com') || req.url.includes('googleapis.com/google.firestore')) return;

  const url = new URL(req.url);
  const proprio = url.origin === self.location.origin;
  const miolo = req.mode === 'navigate'
    || (proprio && (url.pathname.endsWith('/') || /\/(index\.html|config\.js)$/.test(url.pathname)));

  // index.html e config.js: rede primeiro, para a versao nova valer na hora
  if (miolo) {
    e.respondWith(
      fetch(req).then(res => guardar(req, res))
        .catch(() => caches.match(req).then(hit => hit || caches.match('index.html')))
    );
    return;
  }

  // SDK do Firebase, icones e demais estaticos: cache primeiro, atualiza em segundo plano
  e.respondWith(
    caches.match(req).then(hit => {
      const rede = fetch(req).then(res => guardar(req, res));
      if (hit) { rede.catch(() => {}); return hit; }
      return rede.catch(() => Response.error());
    })
  );
});
