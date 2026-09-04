/**
 * Service Worker: die Anwendung liegt nach dem ersten Aufruf vollständig auf
 * dem Gerät und läuft ohne Netz weiter – auf der Baustelle der Regelfall.
 *
 * Vorgehen: beim Einrichten werden alle Dateien der Anwendung in den Zwischen-
 * speicher gelegt. Danach wird jede Anfrage zuerst aus dem Netz beantwortet und
 * die Antwort abgelegt (stale-while-revalidate); fällt das Netz aus, kommt die
 * abgelegte Fassung. So ist die Anwendung offline vollständig da und bekommt
 * dennoch Aktualisierungen, sobald wieder Netz besteht.
 *
 * Der Service Worker wird nur über http(s) wirksam. Wird die Einzeldatei
 * stahlbau-konverter.html direkt aus dem Dateisystem geöffnet, ist ohnehin
 * alles in der Datei enthalten.
 */

const VERSION = "hsd-konverter-v4";

const DATEIEN = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/styles.css",
  "./js/vendor/three.min.js",
  "./js/steel-database.js",
  "./js/materials.js",
  "./js/architecture.js",
  "./js/stairs.js",
  "./js/elevation.js",
  "./js/floorplan.js",
  "./js/concrete.js",
  "./js/rebar.js",
  "./js/autorebar.js",
  "./js/formwork.js",
  "./js/gridplan.js",
  "./js/slabplan.js",
  "./js/measure.js",
  "./js/sitelog.js",
  "./js/profile-geometry.js",
  "./js/calculator.js",
  "./js/truss-solver.js",
  "./js/scene3d.js",
  "./js/app.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSION)
      // Einzelne Dateien dürfen fehlen, ohne dass die Einrichtung scheitert
      .then((c) => Promise.allSettled(DATEIEN.map((d) => c.add(d))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(namen.filter((n) => n !== VERSION).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const anfrage = e.request;
  if (anfrage.method !== "GET") return;
  // Nur eigene Dateien; Schriftarten von außen bleiben dem Browser überlassen
  if (new URL(anfrage.url).origin !== self.location.origin) return;

  e.respondWith(
    caches.open(VERSION).then((c) =>
      c.match(anfrage).then((abgelegt) => {
        const ausDemNetz = fetch(anfrage)
          .then((antwort) => {
            if (antwort && antwort.ok) c.put(anfrage, antwort.clone());
            return antwort;
          })
          .catch(() => abgelegt);
        // Ohne Netz sofort die abgelegte Fassung, sonst die frische
        return abgelegt || ausDemNetz;
      })
    )
  );
});
