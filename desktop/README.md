# HSD Konverter – Windows-Anwendung

Die geprüfte Weboberfläche in einem eigenen Fenster: dieselben Rechenwege,
dieselben Blätter, dazu das, was ein Arbeitsplatzrechner erwartet.

| | |
|---|---|
| **Menü** | deutsch, mit Tastenkürzeln (Strg+O, Strg+S, Strg+P, Strg+Umschalt+P, F11) |
| **Dateien** | Datei-Dialoge von Windows statt Browser-Download; Vorschlag im Ordner *Dokumente* |
| **Drucken** | Druckdialog von Windows; **Als PDF sichern** schreibt A4 quer |
| **Fenster** | Größe, Lage und Vollbild werden gemerkt |
| **Ohne Netz** | die Anwendung liegt vollständig im Programm – keine Internetverbindung nötig |
| **Eine Ausfertigung** | ein zweiter Start bringt das vorhandene Fenster nach vorn |

## Aufbau

| Datei | Aufgabe |
|---|---|
| `main.js` | Hauptprozess: Fenster, Menü, Datei-Dialoge, Drucken, PDF |
| `preload.js` | schmale Brücke `window.hsd` zwischen Oberfläche und Windows |
| `app/` | die Weboberfläche, erzeugt von `tools/desktop-vorbereiten.js` |
| `package.json` | Angaben für electron-builder (Installer, portable Datei, ZIP) |

Die Oberfläche läuft **ohne Node-Zugriff** (`contextIsolation`, `sandbox`,
kein `nodeIntegration`). Sie kann genau vier Dinge am Rechner: Datei sichern,
Datei öffnen, drucken, PDF schreiben – jedes davon über einen Windows-Dialog,
den der Hauptprozess zeigt. Fremde Adressen werden nicht im Fenster geöffnet,
sondern an den Standardbrowser gegeben.

## Bauen

### Auf Windows (empfohlen)

```bat
cd desktop
npm ci
npm run bau:windows
```

Ergebnis in `dist\`:

| Datei | Verwendung |
|---|---|
| `HSD-Konverter-1.0.0-Setup.exe` | Installer mit deutschem Assistenten, Startmenü- und Desktopeintrag |
| `HSD-Konverter-1.0.0-portabel.exe` | eine Datei, startet ohne Installation |
| `HSD-Konverter-1.0.0-x64.zip` | Programmverzeichnis zum Entpacken, z. B. auf einen USB-Stick |

Die portable Einzeldatei entsteht mit `npm run bau:windows-portabel`.

### Auf einem Windows-Läufer bei GitHub

`.github/workflows/windows.yml` baut alle drei Fassungen auf `windows-latest`
und legt sie als Artefakt ab – von Hand über *Run workflow* oder mit einer
Marke `v1.0.0`. Das ist der Weg ohne eigenen Windows-Rechner.

### Auf Linux (eingeschränkt)

```bash
cd desktop
npm ci
npm run bau:linux-behelf      # ZIP-Fassung
```

Es entsteht `dist/HSD-Konverter-1.0.0-x64.zip` mit dem lauffähigen
Programmverzeichnis. **Installer und portable Einzeldatei lassen sich auf
Linux nicht bauen**: NSIS erzeugt einen 32-Bit-Installer, und electron-builder
führt ihn zum Erstellen des Deinstallierers unter wine aus. Ohne den 32-Bit-Teil
von wine (WoW64) bricht das ab. `tools/wine-rcedit64.sh` behebt denselben
Mangel für das Setzen von Symbol und Versionsangaben.

## Code-Signatur

Die Dateien sind **nicht signiert**. Windows SmartScreen meldet daher beim
ersten Start „Der Computer wurde durch Windows geschützt"; über
*Weitere Informationen → Trotzdem ausführen* lässt sich die Anwendung starten.

Mit einem Code-Signing-Zertifikat (OV oder EV) verschwindet die Meldung.
Dazu im GitHub-Ablauf die Geheimnisse `WINDOWS_ZERTIFIKAT` (Zertifikat als
Base64) und `WINDOWS_ZERTIFIKAT_KENNWORT` hinterlegen – electron-builder
signiert dann selbst. Ein EV-Zertifikat baut den SmartScreen-Ruf sofort auf,
ein OV-Zertifikat erst nach einigen Installationen.

## Nicht enthalten

* **Keine Selbstaktualisierung.** Dafür wären ein Ablageort für die
  Aktualisierungsdateien und eine Signatur nötig; beides ist festzulegen,
  bevor es sinnvoll eingebaut werden kann.
* **Keine Verknüpfung mit `.json`.** Angemeldet ist die Endung `.hsdproj`;
  ob Projektdateien so heißen sollen, ist eine Festlegung des Betriebs.
* **Kein MSI-Paket** für die Verteilung per Gruppenrichtlinie. Der
  NSIS-Installer beherrscht `/S` für die unbeaufsichtigte Installation.
