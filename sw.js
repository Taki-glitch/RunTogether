// RunTogether V1.0 — fonctionnement hors connexion
const VERSION = 'runtogether-v1.0';
const SHELL = ['./', './index.html', './state.js', './progress.js', './extras.js', './seances.js', './suivi.js', './pwa.js',
  './sync.js', './firebase-config.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Réseau d'abord (pour recevoir les mises à jour), cache si le réseau est absent ou trop lent.
function networkFirst(req, timeoutMs) {
  return new Promise(resolve => {
    let done = false;
    const fromCache = () => caches.match(req, { ignoreSearch: true }).then(r => r || (req.mode === 'navigate' ? caches.match('./index.html') : undefined));
    const timer = setTimeout(() => fromCache().then(r => { if (r && !done) { done = true; resolve(r); } }), timeoutMs);
    fetch(req).then(res => {
      clearTimeout(timer);
      if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      if (!done) { done = true; resolve(res); }
    }).catch(() => {
      clearTimeout(timer);
      fromCache().then(r => { if (!done) { done = true; resolve(r || Response.error()); } });
    });
  });
}
// Modules Firebase : cache d'abord, mise à jour en arrière-plan.
function staleWhileRevalidate(req) {
  return caches.open(VERSION).then(c => c.match(req).then(hit => {
    const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
}
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.origin === location.origin) { e.respondWith(networkFirst(req, 3500)); return; }
  if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) { e.respondWith(staleWhileRevalidate(req)); }
  // tout le reste (API Firestore, authentification…) passe directement par le réseau
});
