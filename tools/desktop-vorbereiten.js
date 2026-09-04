/**
 * Legt die Weboberfläche für die Windows-Anwendung unter desktop/app ab.
 *
 * Kopiert werden dieselben Dateien, die auch im Browser laufen – die
 * Windows-Anwendung rechnet damit nachweislich gleich. Der Service Worker
 * entfällt: Im Fenster liegt ohnehin alles auf dem Rechner.
 *
 * Aufruf:  node tools/desktop-vorbereiten.js
 */

"use strict";

const fs = require("fs");
const path = require("path");

const wurzel = path.resolve(__dirname, "..");
const ziel = path.join(wurzel, "desktop", "app");

const ORDNER = ["css", "js", "icons"];
const DATEIEN = ["index.html"];

function kopiereOrdner(von, nach) {
  fs.mkdirSync(nach, { recursive: true });
  fs.readdirSync(von, { withFileTypes: true }).forEach((eintrag) => {
    const q = path.join(von, eintrag.name);
    const z = path.join(nach, eintrag.name);
    if (eintrag.isDirectory()) kopiereOrdner(q, z);
    else fs.copyFileSync(q, z);
  });
}

fs.rmSync(ziel, { recursive: true, force: true });
fs.mkdirSync(ziel, { recursive: true });

ORDNER.forEach((o) => kopiereOrdner(path.join(wurzel, o), path.join(ziel, o)));
DATEIEN.forEach((d) => fs.copyFileSync(path.join(wurzel, d), path.join(ziel, d)));

// Service Worker und Manifest gehören zum Browserbetrieb, nicht ins Fenster
let html = fs.readFileSync(path.join(ziel, "index.html"), "utf8");
html = html
  .replace(/<!-- SW-ANFANG[\s\S]*?<!-- SW-ENDE -->\n?/, "")
  .replace(/\s*<link rel="manifest"[^>]*>\n?/, "\n")
  // Die Brücke zu Windows wird vor der Steuerung geladen
  .replace('<script src="js/app.js"></script>', '<script src="js/desktop.js"></script>\n<script src="js/app.js"></script>');
fs.writeFileSync(path.join(ziel, "index.html"), html);

if (/serviceWorker|rel="manifest"/.test(html)) {
  throw new Error("Service Worker oder Manifest sind noch eingebunden.");
}

const zaehle = (o) => fs.readdirSync(o, { withFileTypes: true })
  .reduce((n, e) => n + (e.isDirectory() ? zaehle(path.join(o, e.name)) : 1), 0);
console.log(`desktop/app vorbereitet · ${zaehle(ziel)} Dateien`);
