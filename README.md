# Stahlbau- und Architektur-Konverter

Werkzeug der **HSD Hamburg GmbH** (Merckmannstraße 30, 20539 Hamburg, Tel. 040 18124794)
für die Skizzenphase: Bauteilachsen zeichnen, Profile nach DIN EN 1993-1-1 vorbemessen,
Architektur- und Betonbauteile erfassen, Bewehrung erzeugen sowie Zeichnungen,
Mengen und Kosten für das Leistungsverzeichnis ausgeben.

Reines HTML, CSS und JavaScript – kein Übersetzungslauf, keine Installation,
kein Internetzugang im Betrieb. three.js r128 liegt unter `js/vendor/` bei.

## Betrieb

| Weg | Vorgehen |
|---|---|
| **Am Rechner** | `index.html` im Browser öffnen |
| **Im Firmennetz** | Ordner auf einen Webserver legen; die Anwendung meldet einen Service Worker an und läuft danach **ohne Netz** weiter |
| **Auf dem iPad** | Adresse in Safari öffnen → **Teilen ↗ → Zum Home-Bildschirm**; die Anwendung startet als eigenes Symbol ohne Browserleiste |
| **Als eine Datei** | `node tools/einzeldatei.js` erzeugt `stahlbau-konverter.html` mit allem darin – zum Weitergeben per AirDrop, Mail oder USB-Stick |
| **Auf Windows** | eigenes Programm mit deutschem Menü, Windows-Datei-Dialogen, Drucken und PDF – siehe `desktop/README.md` |

## Bedienung auf dem Tablet

| Geste | Wirkung |
|---|---|
| Antippen | Punkt setzen (zeichnen, Auflager, Last, Bauteil, Betonteil) |
| Wischen | Modell drehen |
| Aufziehen mit zwei Fingern | vergrößern und verkleinern |
| Schieben mit zwei Fingern | Ausschnitt verschieben |

Der Apple Pencil arbeitet wie der Finger. Breite Tabellen lassen sich waagerecht
schieben; Bedienelemente sind mindestens 44 pt hoch und Eingabefelder mindestens
16 px groß, damit iOS beim Antippen nicht hineinzoomt.

## Was ausgegeben wird

| Ausgabe | Format |
|---|---|
| Leistungsverzeichnis | CSV (Semikolon, Dezimalkomma, UTF-8 mit BOM) für Excel und Numbers |
| Wandansicht, Grundriss, Schalplan, Schalplan-Übersicht, Bewehrungsplan, Deckenplan, Positionsplan | SVG im Blatt A4 quer mit Schriftfeld |
| Biegedaten für die Biegerei | JSON für `python/hsd_bewehrung` |
| Projektdatei | JSON mit dem vollständigen Modell |
| Aufmaß und Bautagebuch | CSV sowie Aufmaßblatt und Tagesbericht als SVG im Blatt A4 quer |
| Koordinationsmodell | IFC4 nach ISO 16739 (OpenBIM) mit Eigenschaftssätzen; Kollisionsbefunde als CSV |
| Papier und PDF | über *Drucken*; aus dem Blattfenster kommt das Blatt allein auf das Papier |

**↗ Weitergeben** übergibt die zuletzt erzeugte Datei an das Systemmenü des Geräts
(AirDrop an ein anderes iPad, Mail, *In Dateien sichern*). Der Knopf erscheint nur
auf Geräten, die das beherrschen. Für die Weiterarbeit auf einem zweiten Tablet
ist die **Projektdatei** der Weg; *Projekt speichern* legt den Stand nur im Browser
des jeweiligen Geräts ab.

## Aufbau

```
index.html                Oberfläche
css/styles.css            Gestaltung einschließlich Tabletbetrieb
manifest.webmanifest      Angaben für den Home-Bildschirm
sw.js                     Service Worker für den Betrieb ohne Netz
icons/                    App-Symbole (erzeugt mit tools/icons.py)
js/
  steel-database.js       Profiltabellen
  materials.js            Baustoffe, Rohdichten, Wärmeleitfähigkeiten
  architecture.js         Architektur-Bauteile, Öffnungen
  stairs.js               Treppen nach DIN 18065
  concrete.js             Betonbauteile, Betondeckung, Mengen
  rebar.js                Regelbewehrung, Stahlliste, Bewehrungsplan
  autorebar.js            Mindestbewehrung nach DIN EN 1992-1-1 Abschnitt 9
  formwork.js             Schalflächen, Schalplan
  gridplan.js             Achsraster, Positionsplan
  slabplan.js             Deckenebenen, Deckenplan
  floorplan.js            Grundriss, Räume nach DIN 277
  elevation.js            Blattaufbau, Maßketten, Maßstäbe
  profile-geometry.js     Querschnittsgeometrie für das 3D-Modell
  calculator.js           Nachweise nach DIN EN 1993-1-1
  truss-solver.js         Stabkräfte, eben und räumlich
  scene3d.js              3D-Fenster, Maus- und Fingerbedienung
  app.js                  Steuerung der Oberfläche
  measure.js              Aufmaß nach VOB/B § 14 mit den Regeln der VOB/C
  sitelog.js              Bautagebuch mit Tagesbericht
  attributes.js           Bauteilattribute: Feuerwiderstand, Baustoff, Gewerk
  clash.js                Kollisionsprüfung im Koordinationsmodell
  ifc.js                  IFC-Export nach ISO 16739 (IFC4)
python/                   Bewehrung und Herstellungsunterlagen (46 Prüfungen)
desktop/                  Windows-Anwendung (Electron) – siehe desktop/README.md
tools/
  einzeldatei.js          baut stahlbau-konverter.html
  desktop-vorbereiten.js  legt die Oberfläche für das Windows-Fenster ab
  icons.py                erzeugt die App-Symbole und icon.ico
  wine-rcedit64.sh        Behelf für den Windows-Bau auf Linux
```

## Geltungsbereich

Die Anwendung dient der **überschlägigen Vorbemessung**. Der Abschnitt
„Rechengrundlagen und Geltungsbereich" am Ende der Oberfläche führt die geführten
und die nicht geführten Nachweise einzeln auf. Die prüffähige Ausführungsstatik,
die Bemessung nach DIN EN 1992-1-1 und DIN EN 1993-1-1 sowie die Freigabe durch
den Tragwerksplaner werden dadurch nicht ersetzt.
