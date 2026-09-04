# hsd_bewehrung – Bewehrung und Herstellungsunterlagen

Werkzeug der **HSD Hamburg GmbH** (Merckmannstraße 30, 20539 Hamburg, Tel. 040 18124794)
zur Weiterverarbeitung der Bewehrungsdaten aus dem Stahlbau- und Architektur-Konverter.

Die Weboberfläche erzeugt die Bewehrung und schreibt sie mit dem Knopf
**„Biegedaten (JSON) für Python"** in eine Datei. Dieses Werkzeug macht daraus die
Unterlagen für Bestellung, Biegerei und Baustelle.

## Was es erzeugt

| Datei | Inhalt |
|---|---|
| `00_Uebersicht.txt` | Deckblatt mit Mengen, Bestellung, Prüfergebnis und Hinweisen |
| `01_Biegeliste.csv` | Biegeliste je Bauteil und Position mit Biegeform, Biegemaßen, Längen und Massen |
| `02_Stahlauszug.csv` | Zusammenstellung nach Durchmessern für Bestellung und Abrechnung |
| `03_Schneidplan.csv` | Belegung jeder Stange mit Zuschnitten, Rest und Auslastung |
| `04_Bestellung.csv` | Stangen je Durchmesser mit Masse und Verschnittanteil |
| `05_Etiketten.txt` | Bündeletiketten je Position für die Biegerei |
| `06_Biegeliste.json` | dieselben Daten maschinenlesbar für die Weiterverarbeitung |

Alle CSV-Dateien sind für Excel eingerichtet: Semikolon als Trennzeichen, Komma als
Dezimalzeichen, UTF-8 mit BOM.

## Aufruf

```bash
cd python
python -m hsd_bewehrung Biegedaten_Projekt.json --ordner ausgabe
```

Optionen:

```
-o, --ordner       Ausgabeordner (Voreinstellung: bewehrung_ausgabe)
-l, --lagerlaenge  Lagerlänge des Betonstahls in Metern (Voreinstellung: 12,0)
-s, --saegeschnitt Schnittbreite je Stab in Millimetern (Voreinstellung: 0)
    --nur-pruefen  nur prüfen, keine Dateien schreiben
```

Beispielausgabe:

```
Projekt Halle Nord · 4 Bauteile · 10 Positionen
Beton 23.91 m³ · Betonstahl 890.1 kg (37 kg/m³)
  ⌀ 8 mm:   432 Stück ·   1857.51 m ·     732.9 kg
  ⌀16 mm:     8 Stück ·     64.00 m ·     101.0 kg

Prüfung ohne Beanstandung.

Bestellung aus Lagerlängen:
  ⌀ 8 mm:  179 Stangen à 12.00 m =    847.6 kg · Verschnitt 13.5 %
```

Es werden nur Bausteine der Standardbibliothek verwendet – keine Installation, kein
Internetzugang, Python 3.10 oder neuer.

## Als Bibliothek

```python
from hsd_bewehrung import Projekt, biegeliste, schneidplan, automatische_bewehrung

projekt = Projekt.laden("Biegedaten_Projekt.json")
zeilen = biegeliste(projekt)
plaene = schneidplan(zeilen, lagerlaenge=14.0)

vorschlag = automatische_bewehrung(
    "decke", {"laenge_m": 6, "breite_m": 4, "hoehe_m": 0.20, "dicke_m": 0.20},
    deckung_mm=25, guete="C25/30",
)
print(vorschlag.gewaehlt, vorschlag.as_min, vorschlag.as_vorh)   # ⌀8/200 mm 2.25 2.51
```

## Allplan-PythonPart „Wand bewehren"

Im Ordner `allplan_pythonpart/` liegt zusätzlich ein PythonPart für Allplan, der
eine Wand nach DIN EN 1992-1-1 Abs. 9.6 bewehrt (Palette `.pyp`, Skript `.py`,
geprüfter Rechenkern ohne Allplan). Einbau und Grenzen stehen in
`allplan_pythonpart/README.md`.

## Aufbau

```
hsd_bewehrung/
    norms.py       Normwerte: DIN 488, DIN EN 1992-1-1 Tab. 3.1 und 8.1N, Abschnitt 9
    model.py       Einlesen und Prüfen der Biegedaten-Datei
    generator.py   automatische Wahl der konstruktiven Mindestbewehrung
    schedule.py    Biegeliste, Stahlauszug, Schneidplan, Etiketten, Prüfung
    export.py      Ausgabe als CSV, JSON und Text
    cli.py         Kommandozeile
allplan_pythonpart/
    WandBewehrung.pyp      Palette des PythonParts
    WandBewehrung.py       PythonPart: Palette lesen, Bewehrung zeichnen
    wandbewehrung_kern.py  Rechenkern ohne Allplan (Mindestbewehrung, Stablagen)
tests/
    test_bewehrung.py      Normwerte, Mindestbewehrung, Listen, Prüfung, Dateien
    test_parity.py         Gleichlauf mit der Weboberfläche (js/autorebar.js)
    test_wandbewehrung.py  Rechenkern und Palette des PythonParts
```

## Prüfungen

```bash
cd python
python -m unittest discover -s tests -v
```

45 Prüfungen decken die Tabellenwerte des Betonstahls, die Mindestbewehrung, die
Biegeliste, den Schneidplan und die Dateiausgabe ab. Ein weiterer Test führt die
Bewehrungswahl in Python **und** in der Weboberfläche aus und vergleicht beide
Ergebnisse Stück für Stück – so bleibt es bei einer Rechenweise in zwei Umsetzungen.

## Grundlagen

* Betonstahl **B500B** nach DIN 488-1, Nenndurchmesser nach DIN 488-2,
  Masse je Meter `m = π/4 · d_s² · 7850 kg/m³`
* Betonkennwerte nach DIN EN 1992-1-1, Tab. 3.1
* Mindestbiegerollendurchmesser nach DIN EN 1992-1-1, Tab. 8.1N
  (`d_s ≤ 16 mm → 4 d_s`, sonst `7 d_s`)
* Konstruktive Mindestbewehrung nach DIN EN 1992-1-1, Abschnitt 9:
  Platten 9.2.1.1 und 9.3.1.1, Balken 9.2.2, Stützen 9.5.2 und 9.5.3,
  Wände 9.6.2 und 9.6.3
* Schneidplan nach First-Fit-Decreasing; Wendeln und überlange Stäbe werden als
  Sonderlängen geführt, nicht aus Lagerlängen geschnitten

## Grenzen

Die erzeugte Bewehrung ist **konstruktive Mindestbewehrung** bzw. die in der
Anwendung eingegebene Regelbewehrung. Sie ist **keine Bemessung**. Vom
Tragwerksplaner sind zu führen: Bewehrung aus Biegung mit Längskraft, Querkraft,
Durchstanzen und Torsion, Rissbreitenbeschränkung, Verankerungs- und
Übergreifungslängen nach Abschnitt 8, Zulagen an Aussparungen und Auflagern sowie
die Bewehrungsführung an Rahmenecken und Anschlüssen.

Die Einzellängen enthalten **keinen Abzug der Biegerollendurchmesser**. Vor der
Fertigung sind Biegeliste und Biegeformen mit dem Biegebetrieb abzustimmen. Eine
Ausgabe im Maschinenformat BVBS ist nicht enthalten; sie kann ergänzt werden, sobald
das Datenblatt des Biegebetriebs oder eine Beispieldatei der Maschine vorliegt.
