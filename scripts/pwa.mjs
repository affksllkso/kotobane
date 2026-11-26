import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';

const assets = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png',
  ...(await readdir('dist/assets')).map((file) => '/assets/' + file)];
const hash = createHash('sha256');
for (const asset of assets.slice(1)) hash.update(await readFile('dist' + asset));
await writeFile('dist/sw.js', `const CACHE = "kotobane-${hash.digest('hex').slice(0, 16)}";
const ASSETS = ${JSON.stringify(assets)};
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith("kotobane-") && key !== CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  if (event.request.mode === "navigate") {
    event.respondWith(caches.open(CACHE).then(cache => cache.match("/index.html")).then(page => page || fetch(event.request)));
  } else if (ASSETS.includes(url.pathname) || url.pathname.startsWith("/pdf/")) {
    event.respondWith(caches.open(CACHE).then(async cache => {
      const stored = await cache.match(url.pathname);
      if (stored) return stored;
      const response = await fetch(event.request);
      if (response.ok) await cache.put(url.pathname, response.clone());
      return response;
    }));
  }
});`);
