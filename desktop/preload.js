/**
 * Brücke zwischen der Oberfläche und Windows.
 *
 * Die Oberfläche läuft ohne Node-Zugriff. Sie bekommt hier genau die
 * Fähigkeiten, die sie am Arbeitsplatz braucht – Datei speichern, Datei
 * öffnen, Drucken, PDF – und nichts darüber hinaus. Jeder Aufruf landet
 * im Hauptprozess, der ihn prüft und den Windows-Dialog zeigt.
 */

"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hsd", {
  plattform: "windows",
  version: process.env.npm_package_version || "",

  /** Datei über den Windows-Dialog sichern. */
  speichern: (name, inhalt, art) => ipcRenderer.invoke("hsd:speichern", { name, inhalt, art }),

  /** Projektdatei über den Windows-Dialog öffnen. */
  oeffnen: () => ipcRenderer.invoke("hsd:oeffnen"),

  /** Druckdialog von Windows. */
  drucken: () => ipcRenderer.invoke("hsd:drucken"),

  /** Ansicht als PDF sichern (A4 quer). */
  pdf: (vorschlag) => ipcRenderer.invoke("hsd:pdf", vorschlag),

  /** Gesicherte Datei im Explorer zeigen. */
  zeigeOrdner: (pfad) => ipcRenderer.invoke("hsd:zeigeOrdner", pfad),

  /**
   * Auf Menübefehle hören. Erlaubt sind nur die Kanäle der Menüleiste,
   * damit die Oberfläche nicht beliebig mithören kann.
   */
  aufMenue: (kanal, rueckruf) => {
    const erlaubt = [
      "menue:projekt-oeffnen", "menue:projekt-speichern",
      "menue:lv-csv", "menue:aufmass-csv", "menue:tagebuch-csv",
    ];
    if (erlaubt.indexOf(kanal) < 0) return;
    ipcRenderer.on(kanal, () => rueckruf());
  },
});
