// Offline shell cache. API calls (Matrix, Telegram, Claude) always go to the network.
const CACHE = "os-v9";
const SHELL = ["./", "index.html", "app.css", "app.js", "manifest.json",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  // Cache each file on its own: one failing file (e.g. a redirected icon) must not stop the rest.
  event.waitUntil(caches.open(CACHE).then((cache) =>
    Promise.all(SHELL.map((url) => cache.add(url).catch(() => undefined)))));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin) return;
  // Network first so updates arrive immediately; cache as offline fallback.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
