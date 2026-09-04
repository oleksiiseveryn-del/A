/**
 * Baut aus index.html, css/styles.css, den js-Dateien, den Symbolen und dem
 * Manifest eine einzige HTML-Datei.
 *
 * Ergebnis: eine Datei ohne jede Nebendatei – zum Weitergeben per AirDrop,
 * Mail oder USB-Stick und zum Öffnen ohne Netz. Symbole und Manifest werden
 * als data:-URL eingebettet, damit die Datei auch dann als App auf den
 * Home-Bildschirm gelegt werden kann, wenn sie auf einem Server liegt.
 *
 * Aufruf:  node tools/einzeldatei.js [Zieldatei]
 */

const fs = require("fs");
const path = require("path");

const wurzel = path.resolve(__dirname, "..");
const ziel = process.argv[2] || path.join(wurzel, "stahlbau-konverter.html");

const lies = (p) => fs.readFileSync(path.join(wurzel, p), "utf8");
const datenUrl = (p, typ) =>
  `data:${typ};base64,${fs.readFileSync(path.join(wurzel, p)).toString("base64")}`;

let html = lies("index.html");

// Stylesheet einbetten
html = html.replace('<link rel="stylesheet" href="css/styles.css">',
  `<style>\n${lies("css/styles.css")}\n</style>`);

// Symbole als data:-URL
html = html
  .replace('href="icons/apple-touch-icon.png"', `href="${datenUrl("icons/apple-touch-icon.png", "image/png")}"`)
  .replace('href="icons/icon-192.png"', `href="${datenUrl("icons/icon-192.png", "image/png")}"`);

// Manifest mit eingebetteten Symbolen als data:-URL
const manifest = JSON.parse(lies("manifest.webmanifest"));
manifest.start_url = ".";
manifest.icons = manifest.icons.map((i) => Object.assign({}, i, { src: datenUrl(i.src, i.type) }));
html = html.replace('href="manifest.webmanifest"',
  `href="data:application/manifest+json;base64,${Buffer.from(JSON.stringify(manifest)).toString("base64")}"`);

// Service Worker entfällt: in der Einzeldatei ist bereits alles enthalten
html = html.replace(/<!-- SW-ANFANG[\s\S]*?<!-- SW-ENDE -->\n?/, "");

// Skripte einbetten
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => `<script>\n${lies(src)}\n</script>`);

if (/<script src=|href="css\/|href="icons\/|href="manifest\./.test(html)) {
  throw new Error("Es sind noch Nebendateien verlinkt.");
}

fs.writeFileSync(ziel, html);
console.log(`Einzeldatei: ${ziel} · ${(html.length / 1024 / 1024).toFixed(2)} MB`);
