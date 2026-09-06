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
| Zeichnung für CAD | DXF R12 (AC1009) als Grundriss oder räumliches Modell, in Metern oder Millimetern, Ebenen nach Bauteilart |
| Bestandsaufnahme | Wände aus der Punktwolke als CSV mit Modell- und Scankoordinaten |
| Tiefbau | Lageplan, Höhenplan mit Massenlinie und Querprofilblätter als SVG; Massen und Kostenschätzung als CSV |
| Anschlüsse | Anschlussblatt mit Skizze und Nachweisprotokoll als SVG; Einzelnachweise als CSV |
| Geländemodell | Geländeplan mit Höhenlinien als SVG; Höhenpunkte, Kennwerte und Aushub als CSV |
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
  dxf.js                  DXF-Export R12 für AutoCAD, Allplan und andere CAD
  pointcloud.js           Punktwolken lesen (LAS, PLY, PTS, XYZ), Schnitt, Wanderkennung
  civil.js                Tiefbau: Trassierung, Gradiente, Querprofile, Erdmassen
  civilplan.js            Lageplan, Hoehenplan mit Massenlinie, Querprofilblaetter
  connections.js          Anschluesse nach DIN EN 1993-1-8 (Schrauben, Naehte, T-Stummel)
  connectionplan.js       Anschlussblatt mit Skizze und Nachweisprotokoll
  terrain.js              Geländemodell: Vermaschung, Hoehenlinien, Volumen
python/                   Bewehrung und Herstellungsunterlagen (46 Prüfungen)
desktop/                  Windows-Anwendung (Electron) – siehe desktop/README.md
tools/
  einzeldatei.js          baut stahlbau-konverter.html
  desktop-vorbereiten.js  legt die Oberfläche für das Windows-Fenster ab
  icons.py                erzeugt die App-Symbole und icon.ico
  wine-rcedit64.sh        Behelf für den Windows-Bau auf Linux
```

## Anschlüsse

Das Register **Anschlüsse** rechnet die Verbindung nach **DIN EN 1993-1-8**
mit deutschem NA (γM0 = 1,00 · γM2 = 1,25):

| Nachweis | Abschnitt |
|---|---|
| Abscheren F_v,Rd = α_v · f_ub · A / γM2 | Tab. 3.4 |
| Lochleibung F_b,Rd = k₁ · α_b · f_u · d · t / γM2 | Tab. 3.4 |
| Zug F_t,Rd = 0,9 · f_ub · A_s / γM2 und Durchstanzen B_p,Rd | Tab. 3.4 |
| Rand- und Lochabstände e₁, e₂, p₁, p₂ | Tab. 3.3 |
| Nettoquerschnitt N_u,Rd = 0,9 · A_net · f_u / γM2 | Gl. (6.7) |
| Blockversagen V_eff,1,Rd | Abs. 3.10.2 |
| Kehlnaht f_vw,d = (f_u/√3)/(β_w · γM2) | 4.5.3.3 |
| Stirnplatte: T-Stummel, Modi 1 bis 3 | Tab. 6.2 |

Drei Anschlussarten: Fachwerkstab am Knotenblech **geschraubt** und
**geschweißt** sowie **Stirnplattenstoß**. Die Stabkraft kommt aus der
Berechnung des Tragwerks; „Schrauben ermitteln" sucht die kleinste
Schraubenzahl, mit der alle Nachweise erfüllt sind (mindestens zwei).
Jeder Anschluss lässt sich als **Anschlussblatt** mit Skizze,
Schraubenbild, Maßen und Nachweisprotokoll ausgeben.

**Nicht geführt**: gleitfeste Verbindungen (GV/GVP) und ihre Vorspannung,
Langlöcher, Passschrauben, Schraubengruppen nach Tab. 6.6 (jede Reihe wird
für sich gerechnet), die Nachweise des Stützenstegs, Steifen und Rippen,
Ermüdung und Brandfall. Die Nachgiebigkeit nach Abs. 6.3 wird nicht
bestimmt – der Anschluss ist im Tragwerk als gelenkig oder biegesteif
abzubilden.

## Bauen im Bestand

Das Register **Bestand** liest die Punktwolke des 3D-Laserscans und macht daraus
eine Bestandsaufnahme:

| Schritt | Was geschieht |
|---|---|
| Scan laden | **LAS** 1.0–1.4 (Punktformate 0–8), **PLY** (ascii, binary little endian), **PTS**, **XYZ/ASC/TXT/CSV**. Beim Einlesen wird ein **Bezugspunkt** abgezogen und mitgeführt – er ist der Projektnullpunkt und gehört nach DIN 18710-1 in jede Weitergabe |
| Rasterfilter | je Würfel bleibt ein Punkt; große Wolken werden damit darstellbar, ohne dass die Form verloren geht |
| Höhenschnitt | alle Punkte in einem Höhenband – der Grundriss des Bestands, im Skizzenfenster als Vorlage zum Darüberzeichnen |
| Wände erkennen | Geraden über das Häufungsverfahren nach Hough, Nachführung über die Trägheitsachse, Zerlegung in Abschnitte, Paarung gegenüberliegender Flächen zu Wänden mit Achse und Dicke |
| Wände übernehmen | die erkannten Wände werden Bauteile im Modell und laufen in Mengen, Pläne, IFC und DXF weiter |

**Nicht gelesen**: LAZ (gepackt), E57 und die Hausformate der Scanner (Faro `.fls`,
Leica `.ptx`-Projekte, Trimble `.rwp`) – diese Programme geben auf Wunsch LAS, PTS
oder PLY aus. **Nicht erkannt**: Rundungen, im Aufriss schräge Wände, Stützen und
Wände hinter Einbauten. Die Punktwolke wird **nicht** in der Projektdatei
gespeichert; sie ist nach dem Öffnen neu zu laden. Das Ergebnis der Erkennung ist
ein Vorschlag für die Bestandsaufnahme und **ersetzt das Aufmaß vor Ort nicht**.

## Geländemodell

Das Register **Gelände** bildet aus Höhenpunkten ein digitales Geländemodell:

| Schritt | Rechenweg |
|---|---|
| Punkte | aus einer Punktliste (Nr, Rechts, Hoch, Höhe), als **Bodenpunkte aus der Punktwolke** (je Rasterzelle der tiefste Punkt) oder als Beispiel |
| Netz | **Delaunay** nach Bowyer und Watson: kein Punkt liegt im Umkreis eines fremden Dreiecks |
| Höhen | baryzentrisch im Dreieck – über einer Ebene exakt |
| Höhenlinien | marschierende Dreiecke, jede fünfte Linie als Zähllinie beschriftet |
| Kennwerte | Grundriss- und Geländefläche, mittlere (flächengewichtete) und größte Neigung |
| Aushub | Prisma je Dreieck, an der Nulllinie geteilt – gegen eine Ebene **genau**, keine Rasternäherung |
| Tiefbau | liefert die **Geländelinie je Querprofil**: quer zur Achse aus dem Netz abgegriffen, mit allen Knickpunkten |

**Nicht enthalten**: Bruchkanten (Böschungsoberkanten, Mauern, Gräben werden
nur über die Dichte der Punkte abgebildet), Löcher im Netz, Ausdünnung nach
Genauigkeitsvorgabe. Der Bodenfilter der Punktwolke ist der einfachste
(tiefster Punkt je Zelle) und versagt unter Bewuchs und an Bauwerken – für
eine Abrechnung ist eine geprüfte Bodenpunktwolke zu verwenden. Die
Genauigkeit des Modells ist die der Aufnahme (DIN 18710-1).

## Tiefbau

Das Register **Tiefbau** führt eine Trasse von der Achse bis zur Kostenschätzung:

| Schritt | Rechenweg |
|---|---|
| Achse | Geraden, Kreisbögen und **Klothoiden** (A² = R · L). Gerade und Bogen geschlossen, die Klothoide über die Integration von cos θ und sin θ nach Simpson. Geprüft: Mindestradius, Richtwert R/3 ≤ A ≤ R, Krümmungssprünge |
| Gradiente | Neigungsabschnitte mit parabolischer Ausrundung: L = H · Δs, T = L/2, Stich = Δs · L/8, Kuppe und Wanne aus dem Vorzeichen |
| Querprofil | Regelquerschnitt mit Fahrbahn, Querneigung, Bankett, Oberbau und Böschung 1:n bis zum Schnitt mit dem Gelände. Das **Planum** liegt um die Oberbaudicke tiefer; gerechnet wird gegen das Gelände **nach Abtrag des Oberbodens** |
| Massen | Mittelwertverfahren V = (A₁+A₂)/2 · e und Prismenformel V = e/6 · (A₁+4·A_m+A₂) mit dem an der halben Station gerechneten Mittelprofil |
| Ausgleich | Festmaß, Lockermaß (× Auflockerung) und verdichtetes Maß (× Verdichtung) je **Homogenbereich nach DIN 18300**; daraus Wiederverwendung, Überschuss, Fehlmenge |
| Kosten | Leistungsverzeichnis der Erdarbeiten: Oberboden, Lösen und Laden, Fördern, Einbauen und Verdichten, Abfahren, Entsorgen, Liefern, Oberbau |

**Nicht enthalten**: Kurvenaufweitung, Verwindung und Anrampung der Querneigung,
Mulden und Gräben, Sichtweiten, Entwässerung sowie ein aufgemessenes
Geländemodell – das Gelände wird je Station über Höhe und Querneigung
beschrieben. Verfahren und Profilabstand der Massenberechnung sind vertraglich
zu vereinbaren (REB-Verfahrensbeschreibungen, VOB/C DIN 18300); die Grenzwerte
für Radien und Neigungen richten sich nach RAL bzw. RASt.

## Geltungsbereich

Die Anwendung dient der **überschlägigen Vorbemessung**. Der Abschnitt
„Rechengrundlagen und Geltungsbereich" am Ende der Oberfläche führt die geführten
und die nicht geführten Nachweise einzeln auf. Die prüffähige Ausführungsstatik,
die Bemessung nach DIN EN 1992-1-1 und DIN EN 1993-1-1 sowie die Freigabe durch
den Tragwerksplaner werden dadurch nicht ersetzt.
