"""Prüfungen des Rechenkerns der Wandbewehrung (Allplan-PythonPart).

Der Kern läuft ohne Allplan; damit ist die gesamte Ingenieurleistung des
PythonParts prüfbar. Die Sollwerte sind von Hand nachgerechnet.
"""

from __future__ import annotations

import sys
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

WURZEL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WURZEL / "allplan_pythonpart"))

from wandbewehrung_kern import anzahl_staebe, stabpositionen, wand_bewehren  # noqa: E402
from hsd_bewehrung.norms import stab_masse  # noqa: E402


class TestWandbewehrung(unittest.TestCase):
    """Wand 5,00 × 2,75 × 0,24 m, C25/30, c_nom 25 mm."""

    def setUp(self):
        self.b = wand_bewehren(laenge=5.0, hoehe=2.75, dicke=0.24, deckung_mm=25.0)

    def test_mindestbewehrung(self):
        # A_s,v,min = 0,002 · 24 · 100 cm² = 4,80 cm²/m, je Seite 2,40
        self.assertAlmostEqual(self.b.as_v_erf, 2.40, places=2)
        self.assertGreaterEqual(self.b.as_v_vorh, self.b.as_v_erf)
        # A_s,h,min = max(0,25 · 4,80 ; 0,001 · 2400) = 2,40 cm²/m, je Seite 1,20
        self.assertAlmostEqual(self.b.as_h_erf, 1.20, places=2)
        self.assertGreaterEqual(self.b.as_h_vorh, self.b.as_h_erf)

    def test_gewaehlte_lagen(self):
        lotrecht = [r for r in self.b.reihen if r.richtung == "lotrecht"]
        waagerecht = [r for r in self.b.reihen if r.richtung == "waagerecht"]
        self.assertEqual(len(lotrecht), 2)     # beide Seiten
        self.assertEqual(len(waagerecht), 2)
        self.assertEqual((lotrecht[0].ds, lotrecht[0].abstand), (8, 200.0))
        # n = floor((5,00 - 2 · 0,025) / 0,20) + 1 = 25
        self.assertEqual(lotrecht[0].anzahl, 25)
        # l = 2,75 - 0,05 + l0 mit l0 = 50 · 8 mm = 0,40 m
        self.assertAlmostEqual(lotrecht[0].laenge, 3.10, places=3)
        # n = floor((2,75 - 0,05) / 0,25) + 1 = 11, l = 5,00 - 0,05
        self.assertEqual(waagerecht[0].anzahl, 11)
        self.assertAlmostEqual(waagerecht[0].laenge, 4.95, places=3)

    def test_masse(self):
        erwartet = 2 * 25 * 3.10 * stab_masse(8) + 2 * 11 * 4.95 * stab_masse(8)
        self.assertAlmostEqual(self.b.masse, erwartet, places=6)
        self.assertAlmostEqual(self.b.masse, 104.1, places=1)
        self.assertAlmostEqual(self.b.volumen, 3.30, places=2)
        self.assertAlmostEqual(self.b.bewehrungsgrad, 104.1 / 3.30, places=1)

    def test_vorgabe_wird_uebernommen_und_geprueft(self):
        b = wand_bewehren(5.0, 2.75, 0.24, 25.0, ds_lotrecht=10, s_lotrecht=300,
                          ds_waagerecht=8, s_waagerecht=250)
        lotrecht = [r for r in b.reihen if r.richtung == "lotrecht"][0]
        self.assertEqual((lotrecht.ds, lotrecht.abstand), (10, 300.0))
        # 300 mm liegt unter s_v,max = min(3 · 240 ; 400) = 400 mm -> keine Meldung
        self.assertFalse(any("s_v,max" in h for h in b.hinweise))

    def test_zu_grosser_abstand_wird_gemeldet(self):
        b = wand_bewehren(5.0, 2.75, 0.20, 25.0, ds_lotrecht=8, s_lotrecht=450)
        # s_v,max = min(3 · 200 ; 400) = 400 mm
        self.assertTrue(any("s_v,max" in h for h in b.hinweise))

    def test_zu_geringe_vorgabe_wird_gemeldet(self):
        b = wand_bewehren(5.0, 2.75, 0.30, 25.0, ds_lotrecht=8, s_lotrecht=400)
        # a_s,min je Seite = 0,002 · 3000 / 2 = 3,00 cm²/m, vorh ⌀8/400 = 1,26
        self.assertTrue(any("a_s,min" in h for h in b.hinweise))

    def test_ungueltige_masse(self):
        with self.assertRaises(ValueError):
            wand_bewehren(0.0, 2.75, 0.24)

    def test_anzahl_staebe(self):
        self.assertEqual(anzahl_staebe(4.95, 200), 25)
        self.assertEqual(anzahl_staebe(2.70, 250), 11)
        self.assertEqual(anzahl_staebe(0.10, 200), 2)     # Mindestzahl

    def test_stablagen_liegen_im_bauteil(self):
        lagen = stabpositionen(self.b)
        self.assertEqual(len(lagen), 2 * 25 + 2 * 11)
        c = self.b.deckung / 1000
        for p in lagen:
            self.assertGreaterEqual(p["x"], c - 1e-9)
            self.assertLessEqual(p["x"], self.b.laenge - c + 1e-9)
            self.assertGreaterEqual(p["z"], c - 1e-9)
            self.assertLessEqual(p["z"], self.b.hoehe - c + 1e-9)
            self.assertGreater(p["y"], 0)
            self.assertLess(p["y"], self.b.dicke)

    def test_lagen_liegen_auf_beiden_seiten(self):
        lagen = stabpositionen(self.b)
        y = sorted({p["y"] for p in lagen})
        self.assertEqual(len(y), 2)
        # Achsabstand von der Oberfläche: c + ds/2 = 25 + 4 = 29 mm
        self.assertAlmostEqual(y[0], 0.029, places=4)
        self.assertAlmostEqual(y[1], self.b.dicke - 0.029, places=4)


class TestPythonPartDatei(unittest.TestCase):
    """Die Palette muss gültiges XML sein und zum Skript passen."""

    def setUp(self):
        self.pyp = WURZEL / "allplan_pythonpart" / "WandBewehrung.pyp"
        self.baum = ET.parse(self.pyp)

    def test_skriptname(self):
        name = self.baum.find("./Script/Name")
        self.assertIsNotNone(name)
        self.assertTrue(name.text.endswith("WandBewehrung.py"))

    def test_alle_parameter_werden_gelesen(self):
        namen = {p.text for p in self.baum.iterfind(".//Parameter/Name")}
        skript = (WURZEL / "allplan_pythonpart" / "WandBewehrung.py").read_text(encoding="utf-8")
        for pflicht in ["Laenge", "Hoehe", "Dicke", "Betondeckung", "Betonguete",
                        "DsLotrecht", "AbstandLotrecht", "DsWaagerecht",
                        "AbstandWaagerecht", "Stossfaktor", "VerankerungUnten"]:
            self.assertIn(pflicht, namen, f"{pflicht} fehlt in der Palette")
            self.assertIn(f'"{pflicht}"', skript, f"{pflicht} wird im Skript nicht gelesen")

    def test_skript_laeuft_ohne_allplan(self):
        import WandBewehrung

        class Feld:
            def __init__(self, value):
                self.value = value

        class Palette:
            Laenge = Feld(5000.0)
            Hoehe = Feld(2750.0)
            Dicke = Feld(240.0)
            Betondeckung = Feld(25.0)
            Betonguete = Feld("C25/30")
            DsLotrecht = Feld(0)
            AbstandLotrecht = Feld(0.0)
            DsWaagerecht = Feld(0)
            AbstandWaagerecht = Feld(0.0)
            Stossfaktor = Feld(50.0)
            VerankerungUnten = Feld(0.0)

        self.assertFalse(WandBewehrung.ALLPLAN_VERFUEGBAR)
        self.assertTrue(WandBewehrung.check_allplan_version(Palette(), "2024.0"))
        self.assertFalse(WandBewehrung.check_allplan_version(Palette(), "2019.0"))
        text = WandBewehrung.ergebnis_text(Palette())
        self.assertIn("25 ⌀8 e = 200 mm", text)
        elemente, handles = WandBewehrung.create_element(Palette(), None)
        self.assertEqual((elemente, handles), ([], []))   # ohne Allplan keine Zeichenelemente


if __name__ == "__main__":  # pragma: no cover
    unittest.main(verbosity=2)
