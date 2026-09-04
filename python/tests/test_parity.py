"""Gleichlaufprüfung: Python und Weboberfläche müssen dasselbe rechnen.

Die automatische Bewehrung ist zweimal umgesetzt – in ``js/autorebar.js`` für
die Oberfläche und in ``hsd_bewehrung.generator`` für die Herstellung. Dieser
Test führt beide Fassungen mit denselben Eingaben aus und vergleicht die
gewählten Durchmesser, Stababstände und Mindestquerschnitte.

Ohne Node.js im System wird der Test übersprungen; die Sollwerte in
``test_bewehrung.py`` prüfen die Python-Seite dann allein.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from hsd_bewehrung import automatische_bewehrung

WURZEL = Path(__file__).resolve().parents[2]
JS_DATEIEN = [
    "js/materials.js", "js/architecture.js", "js/stairs.js", "js/concrete.js",
    "js/rebar.js", "js/autorebar.js",
]

FAELLE = [
    ("decke", {"laenge_m": 6.0, "breite_m": 4.0, "hoehe_m": 0.20, "dicke_m": 0.20}, 25, "C25/30", 0.0),
    ("decke", {"laenge_m": 8.0, "breite_m": 6.0, "hoehe_m": 0.30, "dicke_m": 0.30}, 25, "C30/37", 0.0),
    ("bodenplatte", {"laenge_m": 10.0, "breite_m": 8.0, "hoehe_m": 0.25, "dicke_m": 0.25}, 55, "C25/30", 0.0),
    ("einzelfundament", {"laenge_m": 1.5, "breite_m": 1.5, "hoehe_m": 0.6, "dicke_m": 0.6}, 55, "C25/30", 0.0),
    ("streifenfundament", {"laenge_m": 5.0, "breite_m": 0.6, "hoehe_m": 0.5, "dicke_m": 0.5}, 55, "C25/30", 0.0),
    ("wand", {"laenge_m": 5.0, "breite_m": 0.24, "hoehe_m": 2.75, "dicke_m": 0.24}, 25, "C25/30", 0.0),
    ("kellerwand", {"laenge_m": 5.0, "breite_m": 0.30, "hoehe_m": 2.50, "dicke_m": 0.30}, 55, "C25/30", 0.0),
    ("stuetze", {"laenge_m": 0.3, "breite_m": 0.3, "hoehe_m": 3.0, "dicke_m": 0.3}, 25, "C25/30", 0.0),
    ("stuetze", {"laenge_m": 0.3, "breite_m": 0.3, "hoehe_m": 3.0, "dicke_m": 0.3}, 25, "C25/30", 2500.0),
    ("stuetze_rund", {"laenge_m": 0.4, "breite_m": 0.4, "hoehe_m": 3.0, "dicke_m": 0.4}, 25, "C25/30", 0.0),
    ("unterzug", {"laenge_m": 6.0, "breite_m": 0.3, "hoehe_m": 0.5, "dicke_m": 0.3}, 25, "C25/30", 0.0),
    # Treppenlaufplatte: laenge_m ist die Lauflänge, dicke_m die Laufplattendicke
    ("treppe", {"laenge_m": 4.35, "breite_m": 1.0, "hoehe_m": 2.75, "dicke_m": 0.20}, 25, "C25/30", 0.0),
    ("treppe", {"laenge_m": 4.05, "breite_m": 1.25, "hoehe_m": 3.104, "dicke_m": 0.24}, 25, "C30/37", 0.0),
]

JS_TREIBER = r"""
const fs = require("fs");
const laden = (f) => { (0, eval)(fs.readFileSync(f, "utf8").replace(/^const /gm, "var ")); };
DATEIEN.forEach(laden);

const ergebnis = FAELLE.map(([art, geo, deckung, guete, nEd]) => {
  // Geometrie und Deckung werden direkt vorgegeben, damit beide Fassungen
  // mit identischen Eingaben rechnen.
  const element = { kind: art, guete, expo: "XC1", ds: 12, anzahl: 1, masse: {} };
  const g = {
    laenge: geo.laenge_m, breite: geo.breite_m, hoehe: geo.hoehe_m, dicke: geo.dicke_m,
    volumen: 1, schalung: 1, grundflaeche: 1,
  };
  const d = { cNom: deckung, cMin: deckung, deltaC: 0, massgebend: "Vorgabe" };
  const a = automatischeBewehrung(element, g, d, { nEd });
  return {
    art, moeglich: a.moeglich, parameter: a.parameter,
    asMin: a.nachweis ? a.nachweis.asMin : null,
    asVorh: a.nachweis ? a.nachweis.asVorh : null,
    sMax: a.nachweis ? a.nachweis.sMax : null,
    gewaehlt: a.nachweis ? a.nachweis.gewaehlt : null,
  };
});
process.stdout.write(JSON.stringify(ergebnis));
"""


def _node_vorhanden() -> bool:
    return shutil.which("node") is not None and (WURZEL / "js" / "autorebar.js").exists()


@unittest.skipUnless(_node_vorhanden(), "Node.js oder js/autorebar.js nicht verfügbar")
class TestGleichlauf(unittest.TestCase):
    """Beide Umsetzungen müssen dieselbe Bewehrung wählen."""

    @classmethod
    def setUpClass(cls):
        dateien = json.dumps([str(WURZEL / d) for d in JS_DATEIEN])
        faelle = json.dumps([[a, g, c, q, n] for a, g, c, q, n in FAELLE])
        skript = f"const DATEIEN = {dateien};\nconst FAELLE = {faelle};\n{JS_TREIBER}"
        with tempfile.TemporaryDirectory() as ordner:
            pfad = Path(ordner) / "treiber.js"
            pfad.write_text(skript, encoding="utf-8")
            lauf = subprocess.run(["node", str(pfad)], capture_output=True, text=True, timeout=60)
        if lauf.returncode != 0:
            raise unittest.SkipTest(f"Node-Lauf fehlgeschlagen: {lauf.stderr[:400]}")
        cls.js = json.loads(lauf.stdout)

    def test_gleiche_wahl(self):
        for (art, geo, deckung, guete, n_ed), js in zip(FAELLE, self.js):
            with self.subTest(art=art, n_ed=n_ed):
                py = automatische_bewehrung(art, geo, deckung, guete, n_ed_kn=n_ed)
                self.assertEqual(py.moeglich, js["moeglich"])
                if not py.moeglich:
                    continue
                self.assertAlmostEqual(py.as_min, js["asMin"], places=6,
                                       msg=f"a_s,min weicht ab bei {art}")
                self.assertAlmostEqual(py.as_vorh, js["asVorh"], places=6,
                                       msg=f"a_s,vorh weicht ab bei {art}")
                self.assertAlmostEqual(py.s_max, js["sMax"], places=6,
                                       msg=f"s_max weicht ab bei {art}")
                self.assertEqual(py.gewaehlt, js["gewaehlt"],
                                 msg=f"Wahl weicht ab bei {art}")
                for schluessel, wert in js["parameter"].items():
                    self.assertIn(schluessel, py.parameter, f"{schluessel} fehlt bei {art}")
                    if isinstance(wert, bool):
                        self.assertEqual(bool(py.parameter[schluessel]), wert)
                    else:
                        self.assertAlmostEqual(float(py.parameter[schluessel]), float(wert), places=6,
                                               msg=f"{schluessel} weicht ab bei {art}")


if __name__ == "__main__":  # pragma: no cover
    unittest.main(verbosity=2)
