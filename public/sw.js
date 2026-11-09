const ROOT = new URL("./", self.location.href);
const PREFIX = `feuerwehr-offline:${ROOT.pathname}:`;
const CACHE = `${PREFIX}__FF_RELEASE__`;
const OFFLINE = new URL("offline.html", ROOT).href;
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([OFFLINE, ...["icons/favicon-32.png", "icons/icon-192.png", "icons/icon-512.png"].map((path) => new URL(path, ROOT).href)].map((url) => new Request(url, { cache: "reload" })))));
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "ACTIVATE_UPDATE") event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.mode !== "navigate" || url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname)) return;
  event.respondWith(fetch(event.request, { cache: "no-cache" }).catch(() => caches.match(OFFLINE).then((response) => response || Response.error())));
});

const NOTICE_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const PUSH_DATABASE = `feuerwehr-push:${ROOT.pathname}`;
let pushSequence = Promise.resolve();
function pushState(id, write = false) {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open(PUSH_DATABASE, 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore("shown", { keyPath: "id" });
    opening.onerror = () => reject(new Error("push_storage_unavailable"));
    opening.onsuccess = () => {
      const db = opening.result, transaction = db.transaction("shown", write ? "readwrite" : "readonly");
      const store = transaction.objectStore("shown");
      let seen = false;
      const request = store.get(id);
      request.onsuccess = () => {
        seen = Boolean(request.result && request.result.at > Date.now() - 30 * 86400_000);
        if (write) {
          store.put({ id, at: Date.now() });
          const all = store.getAll();
          all.onsuccess = () => {
            const rows = all.result.sort((a, b) => b.at - a.at);
            rows.forEach((row, index) => {
              if (index >= 500 || row.at < Date.now() - 30 * 86400_000) store.delete(row.id);
            });
          };
        }
      };
      transaction.oncomplete = () => { db.close(); resolve(seen); };
      transaction.onerror = transaction.onabort = () => { db.close(); reject(new Error("push_storage_failed")); };
    };
  });
}
self.addEventListener("push", (event) => {
  let value;
  try { value = event.data?.json(); } catch { return; }
  if (!value || value.format !== 1 || !NOTICE_ID.test(value.notification_id) || !NOTICE_ID.test(value.delivery_id)
    || Object.keys(value).some(key => !["format", "notification_id", "delivery_id"].includes(key))) return;
  pushSequence = pushSequence.catch(() => { console.error("push_display_failed"); }).then(async () => {
    let seen = false;
    try { seen = await pushState(value.delivery_id); } catch { console.error("push_storage_unavailable"); }
    if (seen) return;
    await self.registration.showNotification("Feuerwehr Odenthal", {
      body: "Neue organisatorische Nachricht. Details nach Anmeldung in der App. Keine Alarmierung.",
      icon: new URL("icons/icon-192.png", ROOT).href,
      badge: new URL("icons/favicon-32.png", ROOT).href,
      tag: `ff-notice:${value.delivery_id}`, renotify: false,
      data: { format: 1, notification_id: value.notification_id, delivery_id: value.delivery_id },
    });
    try { await pushState(value.delivery_id, true); } catch { console.error("push_storage_unavailable"); }
  });
  event.waitUntil(pushSequence);
});
self.addEventListener("notificationclick", (event) => {
  const value = event.notification.data;
  event.notification.close();
  if (value?.format !== 1 || !NOTICE_ID.test(value.notification_id) || !NOTICE_ID.test(value.delivery_id)) return;
  event.waitUntil((async () => {
    const windows = (await self.clients.matchAll({ type: "window", includeUncontrolled: true })).filter(client => {
      const url = new URL(client.url);
      return url.origin === ROOT.origin && url.pathname.startsWith(ROOT.pathname);
    });
    const existing = windows.find(client => client.focused) || windows[0];
    if (existing) {
      await existing.focus();
      existing.postMessage({ type: "FF_NOTIFICATION_OPEN", notification_id: value.notification_id });
    } else {
      const url = new URL("profil/", ROOT);
      url.searchParams.set("notification", value.notification_id);
      await self.clients.openWindow(url.href);
    }
  })());
});
