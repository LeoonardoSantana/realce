'use strict';
const CACHE = 'realce-v8';
const CORE = [
  './',
  'index.html',
  'manifest.json',
  'css/styles.css',
  'js/main.js',
  'js/state.js',
  'js/utils.js',
  'js/gl-enhancer.js',
  'js/ai.js',
  'js/video.js',
  'js/compare.js',
  'js/segmented.js',
  'js/export.js',
  'js/ui.js',
  'js/video-export.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png'
];
const put = req => res => {
  if (res && res.ok) {
    const cl = res.clone();
    caches.open(CACHE).then(c => c.put(req, cl));
  }
  return res;
};
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const nav = e.request.mode === 'navigate';
  const url = new URL(e.request.url);
  const sameOrigin = url.origin === location.origin;
  const immutable = !sameOrigin || url.pathname.includes('/models/') || url.pathname.includes('/vendor/');
  if (immutable) {
    // CDN y modelo ONNX: cache-first con guardado en runtime
    e.respondWith(
      caches.match(e.request).then(hit =>
        hit || fetch(e.request).then(put(e.request)))
    );
  } else {
    // Resto del mismo origen: network-first con caída a caché
    e.respondWith(
      fetch(e.request).then(put(e.request)).catch(() =>
        caches.match(e.request).then(hit =>
          hit || (nav ? caches.match('index.html') : Response.error())))
    );
  }
});
