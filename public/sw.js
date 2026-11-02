const ROOT = new URL("./", self.location.href);
const PREFIX = `feuerwehr-offline:${ROOT.pathname}:`;
const CACHE = `${PREFIX}v2`;
const OFFLINE = new URL("offline.html", ROOT).href;
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([OFFLINE, ...["icon.svg", "icons/icon-192.png", "icons/icon-512.png"].map((path) => new URL(path, ROOT).href)])).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.mode !== "navigate" || url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname)) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE).then((response) => response || Response.error())));
});
