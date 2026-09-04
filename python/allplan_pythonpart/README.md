# Allplan-PythonPart „Wand bewehren"

Erzeugt in Allplan die Bewehrung einer Wand: lotrechte und waagerechte Lage auf
beiden Seiten, Durchmesser und Abstände wahlweise vorgegeben oder automatisch nach
**DIN EN 1992-1-1 Abschnitt 9.6**.

## Aufbau

| Datei | Aufgabe |
|---|---|
| `WandBewehrung.pyp` | Palette: Wandmaße, Beton, Bewehrung, Stoß und Anschluss |
| `WandBewehrung.py` | PythonPart: liest die Palette, ruft den Kern, zeichnet die Bewehrung |
| `wandbewehrung_kern.py` | **Rechenkern ohne Allplan** – Mindestbewehrung, Stabzahlen, Längen, Massen, Stablagen |

Die Trennung ist Absicht: Der Kern enthält die Ingenieurleistung und wird ohne
Allplan geprüft (`python/tests/test_wandbewehrung.py`, von Hand nachgerechnet).
In Allplan bleibt nur die Zeichenschicht, die dort ohnehin versionsabhängig ist.

## Einbau in Allplan

1. Ordner `HSD` anlegen unter
   `…\Allplan\<Version>\Usr\Local\PythonPartsScripts\` und
   `WandBewehrung.py` sowie `wandbewehrung_kern.py` hineinlegen.
2. `WandBewehrung.pyp` unter
   `…\Allplan\<Version>\Usr\Local\Library\PythonParts\HSD\` ablegen.
3. Den Ordner `python\hsd_bewehrung` daneben verfügbar machen (der Kern greift auf
   `hsd_bewehrung.norms` zu) oder das Paket in den Python-Pfad von Allplan aufnehmen.
4. In Allplan über *Bibliothek → PythonParts → HSD → Wand bewehren* starten.

Die genauen Verzeichnisse hängen von Version und Installation ab (Std/Usr/Prj);
prüfen Sie sie im Allplan-Verzeichnisdialog.

## Prüfen ohne Allplan

```bash
cd python/allplan_pythonpart
python WandBewehrung.py
```

gibt das Ergebnis der Palettenvorgaben aus:

```
Wand 5.00 × 2.75 × 0.240 m · C25/30 · c_nom 25 mm
a_s,v erf 2.40 → vorh 2.51 cm²/m je Seite
a_s,h erf 1.20 → vorh 2.01 cm²/m je Seite
  lotrecht, Seite 1: 25 ⌀8 e = 200 mm, l = 3.10 m = 30.6 kg
  …
Betonstahl gesamt 104.1 kg = 32 kg/m³
```

## Was zu prüfen bleibt

Die **Zeichenschicht** (`_erzeuge_bewehrung`) ist gegen die Struktur der
Allplan-PythonParts-Dokumentation geschrieben, aber **nicht in Ihrer Installation
getestet**. Vor dem ersten Einsatz zu prüfen:

* Modul- und Funktionsnamen (`NemAll_Python_Reinforcement`, `StdReinfShapeBuilder`)
  Ihrer Allplan-Version,
* `AllplanReinf.BendingShape` bzw. der ShapeBuilder Ihrer Version,
* die Signatur von `AllplanReinf.BarPlacement`,
* die Kennung der Stahlsorte (`STAHLGUETE_ID`) in Ihrer Konfiguration.

Weicht die API ab, ist **nur** `_erzeuge_bewehrung` anzupassen – Rechenkern,
Stablagen und Massen bleiben unberührt und geprüft.

## Grenzen

Das Ergebnis ist **konstruktive Mindestbewehrung** nach Abschnitt 9.6, keine
Bemessung. Nicht enthalten sind: Bewehrung aus Schnittgrößen, Randeinfassung und
Öffnungszulagen, Anschlussbewehrung an Decke und Fundament, Rissbreitenbeschränkung
sowie die Verankerungs- und Übergreifungslängen nach Abschnitt 8.7 – die
Übergreifung wird hier nur mit dem Richtwert l₀ = 50 · d_s geführt.
