/**
 * Windows-Anwendung „HSD Konverter" – Hauptprozess.
 *
 * Die Anwendung ist die geprüfte Weboberfläche in einem eigenen Fenster:
 * dieselben Rechenwege, dieselben Blätter, aber mit den Dingen, die ein
 * Arbeitsplatzrechner erwartet – Menü in deutscher Sprache, Datei-Dialoge
 * von Windows, Drucken und PDF, gemerkte Fenstergröße.
 *
 * Sicherheit: Die Oberfläche läuft ohne Node-Zugriff (contextIsolation,
 * sandbox). Alles, was sie am Rechner tun darf, geht über die schmale
 * Brücke in preload.js und wird hier geprüft. Fremde Adressen werden
 * nicht im Fenster geöffnet, sondern an den Standardbrowser gegeben.
 */

"use strict";

const { app, BrowserWindow, Menu, dialog, shell, ipcMain, nativeTheme } = require("electron");
const path = require("path");
const fs = require("fs");

const ANWENDUNG = path.join(__dirname, "app", "index.html");
const FIRMA = {
  name: "HSD Hamburg GmbH",
  anschrift: "Merckmannstraße 30 · 20539 Hamburg",
  telefon: "040 18124794",
  bearbeiter: "Oleksii Severyn, Betriebsleiter",
};

let fenster = null;

/* ------------------------------------------------- Fensterlage merken */

const lageDatei = () => path.join(app.getPath("userData"), "fensterlage.json");

function leseLage() {
  try {
    const l = JSON.parse(fs.readFileSync(lageDatei(), "utf8"));
    if (Number.isFinite(l.width) && Number.isFinite(l.height)) return l;
  } catch (e) { /* erster Start oder Datei unbrauchbar */ }
  return { width: 1500, height: 950 };
}

function schreibeLage() {
  if (!fenster || fenster.isDestroyed()) return;
  const b = fenster.getNormalBounds();
  try {
    fs.writeFileSync(lageDatei(), JSON.stringify({
      x: b.x, y: b.y, width: b.width, height: b.height, maximiert: fenster.isMaximized(),
    }));
  } catch (e) { /* nicht schreibbar: Lage geht beim nächsten Start verloren */ }
}

/* ----------------------------------------------------------- Fenster */

function erzeugeFenster() {
  const lage = leseLage();
  fenster = new BrowserWindow({
    x: lage.x, y: lage.y,
    width: lage.width, height: lage.height,
    minWidth: 1024, minHeight: 700,
    title: "HSD Konverter",
    backgroundColor: "#0f2438",
    show: false,
    icon: path.join(__dirname, "app", "icons", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  if (lage.maximiert) fenster.maximize();
  fenster.once("ready-to-show", () => fenster.show());
  fenster.on("close", schreibeLage);
  fenster.on("closed", () => { fenster = null; });

  // Fremde Adressen gehören in den Standardbrowser, nicht in dieses Fenster
  fenster.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  fenster.webContents.on("will-navigate", (e, url) => {
    if (url !== fenster.webContents.getURL()) {
      e.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });

  // Herunterladen: Windows-Dialog mit Vorschlag im Ordner „Downloads"
  fenster.webContents.session.on("will-download", (e, gegenstand) => {
    gegenstand.setSaveDialogOptions({
      defaultPath: path.join(app.getPath("downloads"), gegenstand.getFilename()),
    });
  });

  fenster.loadFile(ANWENDUNG);
}

/* -------------------------------------------------------------- Menü */

function baueMenue() {
  const anAnwendung = (kanal) => () => fenster && fenster.webContents.send(kanal);

  const vorlage = [
    {
      label: "&Datei",
      submenu: [
        { label: "Projekt öffnen …", accelerator: "CmdOrCtrl+O", click: anAnwendung("menue:projekt-oeffnen") },
        { label: "Projekt speichern unter …", accelerator: "CmdOrCtrl+S", click: anAnwendung("menue:projekt-speichern") },
        { type: "separator" },
        { label: "Leistungsverzeichnis (CSV) …", click: anAnwendung("menue:lv-csv") },
        { label: "Aufmaß (CSV) …", click: anAnwendung("menue:aufmass-csv") },
        { label: "Bautagebuch (CSV) …", click: anAnwendung("menue:tagebuch-csv") },
        { type: "separator" },
        { label: "Drucken …", accelerator: "CmdOrCtrl+P", click: () => drucke() },
        { label: "Als PDF sichern …", accelerator: "CmdOrCtrl+Shift+P", click: () => alsPdf() },
        { type: "separator" },
        { label: "Beenden", accelerator: "Alt+F4", role: "quit" },
      ],
    },
    {
      label: "&Bearbeiten",
      submenu: [
        { label: "Rückgängig", accelerator: "CmdOrCtrl+Z", role: "undo" },
        { label: "Wiederherstellen", accelerator: "CmdOrCtrl+Y", role: "redo" },
        { type: "separator" },
        { label: "Ausschneiden", accelerator: "CmdOrCtrl+X", role: "cut" },
        { label: "Kopieren", accelerator: "CmdOrCtrl+C", role: "copy" },
        { label: "Einfügen", accelerator: "CmdOrCtrl+V", role: "paste" },
        { label: "Alles auswählen", accelerator: "CmdOrCtrl+A", role: "selectAll" },
      ],
    },
    {
      label: "&Ansicht",
      submenu: [
        { label: "Vergrößern", accelerator: "CmdOrCtrl+Plus", role: "zoomIn" },
        { label: "Verkleinern", accelerator: "CmdOrCtrl+-", role: "zoomOut" },
        { label: "Normalgröße", accelerator: "CmdOrCtrl+0", role: "resetZoom" },
        { type: "separator" },
        { label: "Vollbild", accelerator: "F11", role: "togglefullscreen" },
        { label: "Neu laden", accelerator: "F5", role: "reload" },
        { type: "separator" },
        { label: "Entwicklerwerkzeuge", accelerator: "F12", role: "toggleDevTools" },
      ],
    },
    {
      label: "&Hilfe",
      submenu: [
        { label: "Ordner der Projektdaten öffnen", click: () => shell.openPath(app.getPath("documents")) },
        { type: "separator" },
        { label: "Über HSD Konverter", click: () => ueber() },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(vorlage));
}

function ueber() {
  dialog.showMessageBox(fenster, {
    type: "info",
    title: "Über HSD Konverter",
    message: `HSD Konverter ${app.getVersion()}`,
    detail: [
      "Stahlbau-, Architektur- und Betonbau-Werkzeug für die Skizzenphase.",
      "",
      FIRMA.name,
      FIRMA.anschrift,
      `Tel. ${FIRMA.telefon}`,
      `Bearbeiter: ${FIRMA.bearbeiter}`,
      "",
      "Vorbemessung nach DIN EN 1993-1-1 und DIN EN 1992-1-1.",
      "Die prüffähige Ausführungsstatik und die Freigabe durch den",
      "Tragwerksplaner werden dadurch nicht ersetzt.",
      "",
      `Electron ${process.versions.electron} · Chromium ${process.versions.chrome}`,
    ].join("\n"),
    buttons: ["Schließen"],
    noLink: true,
  });
}

/* ------------------------------------------------- Drucken und PDF */

function drucke() {
  if (!fenster) return;
  fenster.webContents.print({ silent: false, printBackground: true, landscape: true },
    (erfolg, grund) => {
      if (!erfolg && grund && grund !== "cancelled") {
        dialog.showErrorBox("Drucken nicht möglich", String(grund));
      }
    });
}

async function alsPdf(vorschlag) {
  if (!fenster) return;
  const ziel = await dialog.showSaveDialog(fenster, {
    title: "Als PDF sichern",
    defaultPath: path.join(app.getPath("documents"), vorschlag || "HSD_Konverter.pdf"),
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (ziel.canceled || !ziel.filePath) return;
  try {
    // A4 quer wie die Blätter der Anwendung
    const daten = await fenster.webContents.printToPDF({
      pageSize: "A4", landscape: true, printBackground: true,
      margins: { top: 0.24, bottom: 0.24, left: 0.24, right: 0.24 },
    });
    fs.writeFileSync(ziel.filePath, daten);
    shell.showItemInFolder(ziel.filePath);
  } catch (err) {
    dialog.showErrorBox("PDF konnte nicht geschrieben werden", String(err.message || err));
  }
}

/* --------------------------------------------- Brücke zur Oberfläche */

/** Dateiname von Pfadanteilen befreien, die aus der Oberfläche kämen. */
function sichererName(name) {
  return String(name || "Datei").replace(/[\\/:*?"<>|]/g, "_").slice(0, 180) || "Datei";
}

ipcMain.handle("hsd:speichern", async (e, { name, inhalt, art }) => {
  if (!fenster || e.sender !== fenster.webContents) return { abgebrochen: true };
  const endung = (sichererName(name).split(".").pop() || "").toLowerCase();
  const filter = {
    csv: { name: "CSV für Excel", extensions: ["csv"] },
    svg: { name: "Zeichnung SVG", extensions: ["svg"] },
    json: { name: "Datei JSON", extensions: ["json"] },
  }[endung] || { name: "Alle Dateien", extensions: ["*"] };

  const ziel = await dialog.showSaveDialog(fenster, {
    title: art || "Speichern unter",
    defaultPath: path.join(app.getPath("documents"), sichererName(name)),
    filters: [filter, { name: "Alle Dateien", extensions: ["*"] }],
  });
  if (ziel.canceled || !ziel.filePath) return { abgebrochen: true };
  try {
    fs.writeFileSync(ziel.filePath, inhalt, "utf8");
    return { ok: true, pfad: ziel.filePath };
  } catch (err) {
    dialog.showErrorBox("Datei konnte nicht geschrieben werden", String(err.message || err));
    return { fehler: String(err.message || err) };
  }
});

ipcMain.handle("hsd:oeffnen", async (e) => {
  if (!fenster || e.sender !== fenster.webContents) return null;
  const wahl = await dialog.showOpenDialog(fenster, {
    title: "Projekt öffnen",
    defaultPath: app.getPath("documents"),
    properties: ["openFile"],
    filters: [{ name: "Projektdatei", extensions: ["json"] }, { name: "Alle Dateien", extensions: ["*"] }],
  });
  if (wahl.canceled || !wahl.filePaths.length) return null;
  try {
    return { name: path.basename(wahl.filePaths[0]), inhalt: fs.readFileSync(wahl.filePaths[0], "utf8") };
  } catch (err) {
    dialog.showErrorBox("Datei konnte nicht gelesen werden", String(err.message || err));
    return null;
  }
});

ipcMain.handle("hsd:drucken", (e) => { if (e.sender === fenster.webContents) drucke(); });
ipcMain.handle("hsd:pdf", (e, vorschlag) => {
  if (e.sender === fenster.webContents) return alsPdf(sichererName(vorschlag));
  return null;
});
ipcMain.handle("hsd:zeigeOrdner", (e, pfad) => { if (pfad) shell.showItemInFolder(pfad); });

/* ------------------------------------------------------------ Start */

// Nur eine Ausfertigung: ein zweiter Start bringt das vorhandene Fenster nach vorn
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!fenster) return;
    if (fenster.isMinimized()) fenster.restore();
    fenster.focus();
  });

  app.whenReady().then(() => {
    nativeTheme.themeSource = "light";   // die Oberfläche ist hell gestaltet
    baueMenue();
    erzeugeFenster();
    app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) erzeugeFenster(); });
  });

  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
}
