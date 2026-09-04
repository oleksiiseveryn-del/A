"""Prüfungen des Bewehrungswerkzeugs.

Die Sollwerte stammen aus Handrechnungen und aus den Tabellenwerten für
Betonstahl. Dieselben Werte prüfen die Umsetzung in der Weboberfläche
(js/autorebar.js, js/rebar.js), sodass beide Wege dasselbe Ergebnis liefern.

Aufruf:  python -m unittest discover -s tests   (oder pytest)
"""

from __future__ import annotations

import json
import math
import tempfile
import unittest
from pathlib import Path

from hsd_bewehrung import (
    Projekt,
    automatische_bewehrung,
    biegeliste,
    pruefe,
    schneidplan,
    stahlauszug,
)
from hsd_bewehrung.export import alles_ausgeben
from hsd_bewehrung.model import BiegedatenFehler
from hsd_bewehrung.norms import (
    BetonKennwerte,
    as_je_meter,
    biegerollen_durchmesser,
    platten_mindestbewehrung,
    stab_flaeche,
    stab_masse,
    stuetzen_mindestbewehrung,
    waehle_matte,
    wand_mindestbewehrung,
)


def beispiel_projekt() -> dict:
    """Kleines Projekt mit zwei Bauteilen und bekannten Mengen."""
    return {
        "erzeuger": "Test",
        "erstellt": "2026-09-04T08:00:00.000Z",
        "projekt": {"name": "Prüfprojekt", "datum": "2026-09-04", "bearbeiter": "Oleksii Severyn"},
        "betonstahl": {"sorte": "B500B", "norm": "DIN 488-1", "fyk_n_mm2": 500, "dichte_kg_m3": 7850},
        "vorgaben": {"lieferlaenge_m": 12, "stossfaktor_x_ds": 50, "endhaken": True},
        "bauteile": [
            {
                "pos": "EF1", "art": "einzelfundament", "artName": "Einzelfundament", "anzahl": 2,
                "beton": {"guete": "C25/30", "expositionsklasse": "XC2"},
                "betondeckung_mm": 55,
                "geometrie": {"laenge_m": 1.5, "breite_m": 1.5, "hoehe_m": 0.6,
                              "dicke_m": 0.6, "volumen_m3": 1.35, "beschreibung": "1.50 × 1.50 × d 0.60 m"},
                "bewehrung": {"dsUnten": 12, "sUnten": 150},
                "positionen": [
                    {
                        "nr": 1, "bezeichnung": "untere Lage längs", "biegeform": "haken",
                        "biegeformName": "gerader Stab mit 2 Endhaken", "ds_mm": 12, "anzahl": 10,
                        "einzellaenge_m": 1.63, "gesamtlaenge_m": 16.3,
                        "masse_kg": 16.3 * stab_masse(12), "biegerolle_mm": 48,
                        "biegemasse_m": {"laenge": 1.39}, "bemerkung": "e = 150 mm",
                    },
                    {
                        "nr": 2, "bezeichnung": "untere Lage quer", "biegeform": "haken",
                        "biegeformName": "gerader Stab mit 2 Endhaken", "ds_mm": 12, "anzahl": 10,
                        "einzellaenge_m": 1.63, "gesamtlaenge_m": 16.3,
                        "masse_kg": 16.3 * stab_masse(12), "biegerolle_mm": 48,
                        "biegemasse_m": {"laenge": 1.39}, "bemerkung": "e = 150 mm",
                    },
                ],
            },
            {
                "pos": "ST2", "art": "stuetze", "artName": "Stahlbetonstütze (rechteckig)", "anzahl": 1,
                "beton": {"guete": "C25/30", "expositionsklasse": "XC1"},
                "betondeckung_mm": 25,
                "geometrie": {"laenge_m": 0.3, "breite_m": 0.3, "hoehe_m": 3.0,
                              "dicke_m": 0.3, "volumen_m3": 0.27, "beschreibung": "0.30 × 0.30 × h 3.00 m"},
                "bewehrung": {"dsLaengs": 16, "nLaengs": 4, "dsBuegel": 8, "sBuegel": 200},
                "positionen": [
                    {
                        "nr": 1, "bezeichnung": "Längsbewehrung", "biegeform": "gerade",
                        "biegeformName": "gerader Stab", "ds_mm": 16, "anzahl": 4,
                        "einzellaenge_m": 3.8, "gesamtlaenge_m": 15.2,
                        "masse_kg": 15.2 * stab_masse(16), "biegerolle_mm": 64,
                        "biegemasse_m": {"laenge": 3.8}, "bemerkung": "",
                    },
                    {
                        "nr": 2, "bezeichnung": "Bügel", "biegeform": "buegel",
                        "biegeformName": "geschlossener Bügel", "ds_mm": 8, "anzahl": 15,
                        "einzellaenge_m": 1.16, "gesamtlaenge_m": 17.4,
                        "masse_kg": 17.4 * stab_masse(8), "biegerolle_mm": 32,
                        "biegemasse_m": {"b": 0.25, "h": 0.25}, "bemerkung": "e = 200 mm",
                    },
                ],
            },
        ],
    }


class TestNormwerte(unittest.TestCase):
    """Tabellenwerte für Betonstahl nach DIN 488-2."""

    def test_querschnitt(self):
        self.assertAlmostEqual(stab_flaeche(8), 0.503, places=3)
        self.assertAlmostEqual(stab_flaeche(12), 1.131, places=3)
        self.assertAlmostEqual(stab_flaeche(16), 2.011, places=3)

    def test_masse_je_meter(self):
        self.assertAlmostEqual(stab_masse(10), 0.617, places=3)
        self.assertAlmostEqual(stab_masse(12), 0.888, places=3)
        self.assertAlmostEqual(stab_masse(16), 1.578, places=3)
        self.assertAlmostEqual(stab_masse(20), 2.466, places=3)

    def test_querschnitt_je_meter(self):
        # Tabellenwerte a_s [cm²/m]
        self.assertAlmostEqual(as_je_meter(10, 150), 5.24, places=2)
        self.assertAlmostEqual(as_je_meter(12, 150), 7.54, places=2)
        self.assertAlmostEqual(as_je_meter(8, 250), 2.01, places=2)

    def test_biegerolle(self):
        # DIN EN 1992-1-1 Tab. 8.1N: ds <= 16 -> 4 ds, sonst 7 ds
        self.assertEqual(biegerollen_durchmesser(12), 48)
        self.assertEqual(biegerollen_durchmesser(16), 64)
        self.assertEqual(biegerollen_durchmesser(20), 140)

    def test_betonkennwerte(self):
        k = BetonKennwerte.aus_guete("C25/30")
        self.assertAlmostEqual(k.fcd, 14.17, places=2)      # 0,85 · 25 / 1,5
        self.assertAlmostEqual(k.fctm, 2.565, places=3)     # 0,30 · 25^(2/3)
        self.assertAlmostEqual(k.ecm / 1000, 31.5, places=1)


class TestMindestbewehrung(unittest.TestCase):
    """Konstruktive Mindestbewehrung nach DIN EN 1992-1-1 Abschnitt 9."""

    def test_platte(self):
        k = BetonKennwerte.aus_guete("C25/30")
        mind = platten_mindestbewehrung(0.20, 25, 12, k)
        self.assertAlmostEqual(mind["d"], 0.169, places=3)
        # 0,26 · 2,565/500 · 100 · 16,9 = 2,254 cm²/m
        self.assertAlmostEqual(mind["as_min"], 2.254, places=2)
        self.assertEqual(mind["s_max_haupt"], 400)
        self.assertEqual(mind["s_max_quer"], 450)

    def test_platte_duenn_begrenzt_abstand(self):
        k = BetonKennwerte.aus_guete("C25/30")
        mind = platten_mindestbewehrung(0.10, 20, 10, k)
        self.assertAlmostEqual(mind["s_max_haupt"], 300)    # 3 h = 300 mm < 400 mm
        self.assertAlmostEqual(mind["s_max_quer"], 350)

    def test_wand(self):
        mind = wand_mindestbewehrung(0.24)
        self.assertAlmostEqual(mind["as_v_min"], 4.80, places=2)      # 0,002 · 2400 cm²
        self.assertAlmostEqual(mind["as_v_min_je_seite"], 2.40, places=2)
        self.assertAlmostEqual(mind["s_v_max"], 400)

    def test_stuetze(self):
        mind = stuetzen_mindestbewehrung(900.0, 0.0)
        self.assertAlmostEqual(mind["as_min"], 1.80, places=2)        # 0,002 · 900 cm²
        self.assertAlmostEqual(mind["as_max"], 36.0, places=2)        # 0,04 · 900 cm²
        mit_last = stuetzen_mindestbewehrung(900.0, 2500.0)
        # 0,10 · 2500 kN / 435 N/mm² = 574,7 mm² = 5,75 cm²
        self.assertAlmostEqual(mit_last["as_min"], 5.747, places=2)

    def test_wahl_ist_leichteste(self):
        wahl = waehle_matte(2.254, 400)
        self.assertEqual((wahl.ds, wahl.s), (8, 200))
        self.assertGreaterEqual(wahl.as_vorh, 2.254)
        # keine leichtere zulässige Kombination
        self.assertAlmostEqual(wahl.masse_je_qm, stab_masse(8) * 1000 / 200, places=6)

    def test_wahl_haelt_hoechstabstand(self):
        wahl = waehle_matte(1.0, 125)
        self.assertLessEqual(wahl.s, 125)


class TestAutomatischeBewehrung(unittest.TestCase):
    """Ergebnisse müssen mit der Weboberfläche übereinstimmen."""

    def test_decke(self):
        v = automatische_bewehrung(
            "decke", {"laenge_m": 6, "breite_m": 4, "hoehe_m": 0.2, "dicke_m": 0.2}, 25, "C25/30"
        )
        self.assertEqual(v.gewaehlt, "⌀8/200 mm")
        self.assertTrue(v.ausreichend)
        self.assertEqual(v.parameter["dsUnten"], 8)
        self.assertEqual(v.parameter["sUnten"], 200)
        self.assertTrue(v.parameter["obenAktiv"])

    def test_wand(self):
        v = automatische_bewehrung(
            "wand", {"laenge_m": 5, "breite_m": 0.24, "hoehe_m": 2.75, "dicke_m": 0.24}, 25
        )
        self.assertEqual(v.parameter["dsUnten"], 8)
        self.assertEqual(v.parameter["sUnten"], 200)
        self.assertAlmostEqual(v.as_min, 2.40, places=2)

    def test_stuetze_ohne_und_mit_last(self):
        geo = {"laenge_m": 0.3, "breite_m": 0.3, "hoehe_m": 3.0, "dicke_m": 0.3}
        ohne = automatische_bewehrung("stuetze", geo, 25, "C25/30", n_ed_kn=0)
        self.assertEqual(ohne.parameter["nLaengs"], 4)
        self.assertEqual(ohne.parameter["dsLaengs"], 12)
        self.assertEqual(ohne.parameter["sBuegel"], 200)      # s_cl,max = 20·12 = 240 mm
        mit = automatische_bewehrung("stuetze", geo, 25, "C25/30", n_ed_kn=2500)
        self.assertEqual(mit.parameter["dsLaengs"], 14)       # 4 ⌀14 = 6,16 cm² >= 5,75 cm²
        self.assertGreaterEqual(mit.as_vorh, mit.as_min)

    def test_stuetze_rund_hat_sechs_staebe(self):
        v = automatische_bewehrung(
            "stuetze_rund", {"laenge_m": 0.4, "breite_m": 0.4, "hoehe_m": 3.0, "dicke_m": 0.4}, 25
        )
        self.assertGreaterEqual(v.parameter["nLaengs"], 6)

    def test_balken(self):
        v = automatische_bewehrung(
            "unterzug", {"laenge_m": 6, "breite_m": 0.3, "hoehe_m": 0.5, "dicke_m": 0.3}, 25
        )
        self.assertGreaterEqual(v.as_vorh, v.as_min)
        self.assertLessEqual(v.parameter["sBuegel"], v.s_max)

    def test_bohrpfahl_bleibt_manuell(self):
        v = automatische_bewehrung(
            "bohrpfahl", {"laenge_m": 0.6, "breite_m": 0.6, "hoehe_m": 8.0, "dicke_m": 0.6}, 55
        )
        self.assertFalse(v.moeglich)
        self.assertIn("DIN EN 1536", " ".join(v.hinweise))


class TestBiegeliste(unittest.TestCase):
    """Biegeliste, Stahlauszug und Schneidplan."""

    def setUp(self):
        self.projekt = Projekt.aus_json(beispiel_projekt())
        self.zeilen = biegeliste(self.projekt)

    def test_stueckzahl_mit_bauteilanzahl(self):
        # Einzelfundament kommt zweimal vor: 10 Stäbe je Position -> 20
        ef = [z for z in self.zeilen if z.bauteil == "EF1"]
        self.assertEqual([z.anzahl for z in ef], [20, 20])
        self.assertAlmostEqual(ef[0].gesamtlaenge, 32.6, places=3)

    def test_masse_stimmt_mit_laenge(self):
        for zeile in self.zeilen:
            self.assertAlmostEqual(zeile.masse, zeile.gesamtlaenge * stab_masse(zeile.ds), places=6)

    def test_stahlauszug_nach_durchmesser(self):
        auszug = {a.ds: a for a in stahlauszug(self.zeilen)}
        self.assertEqual(sorted(auszug), [8, 12, 16])
        self.assertEqual(auszug[12].stueck, 40)
        self.assertAlmostEqual(auszug[12].laenge, 65.2, places=2)

    def test_schneidplan_deckt_alle_staebe(self):
        plaene = {p.ds: p for p in schneidplan(self.zeilen, lagerlaenge=12.0)}
        # 40 Stäbe à 1,63 m = 65,2 m; je Stange 7 Stück (11,41 m) -> 6 Stangen
        self.assertEqual(plaene[12].anzahl_stangen, 6)
        geschnitten = sum(len(s.schnitte) for s in plaene[12].stangen)
        self.assertEqual(geschnitten, 40)
        self.assertGreater(plaene[12].verschnitt_anteil, 0)
        self.assertLess(plaene[12].verschnitt_anteil, 0.2)

    def test_schneidplan_lagerlaenge_muss_positiv_sein(self):
        with self.assertRaises(ValueError):
            schneidplan(self.zeilen, lagerlaenge=0)

    def test_wendel_wird_als_sonderlaenge_gefuehrt(self):
        daten = beispiel_projekt()
        daten["bauteile"][1]["positionen"].append({
            "nr": 3, "bezeichnung": "Wendel", "biegeform": "wendel", "biegeformName": "Wendel",
            "ds_mm": 10, "anzahl": 1, "einzellaenge_m": 62.09, "gesamtlaenge_m": 62.09,
            "masse_kg": 62.09 * stab_masse(10), "biegerolle_mm": 40,
            "biegemasse_m": {"d": 0.49, "steigung": 0.2}, "bemerkung": "",
        })
        zeilen = biegeliste(Projekt.aus_json(daten))
        plan = {p.ds: p for p in schneidplan(zeilen)}[10]
        self.assertEqual(plan.anzahl_stangen, 0)
        self.assertAlmostEqual(plan.sonderlaenge, 62.09, places=2)
        self.assertAlmostEqual(plan.verschnitt_anteil, 0.0, places=6)


class TestPruefung(unittest.TestCase):
    """Die Prüfung muss Widersprüche finden und sonst schweigen."""

    def test_saubere_datei(self):
        self.assertEqual(pruefe(Projekt.aus_json(beispiel_projekt())), [])

    def test_falsche_gesamtlaenge(self):
        daten = beispiel_projekt()
        daten["bauteile"][0]["positionen"][0]["gesamtlaenge_m"] = 99.0
        meldungen = pruefe(Projekt.aus_json(daten))
        self.assertTrue(any("Gesamtlänge" in m for m in meldungen))

    def test_falsche_masse(self):
        daten = beispiel_projekt()
        daten["bauteile"][0]["positionen"][0]["masse_kg"] = 1.0
        meldungen = pruefe(Projekt.aus_json(daten))
        self.assertTrue(any("Masse" in m for m in meldungen))

    def test_stab_ueber_lieferlaenge(self):
        daten = beispiel_projekt()
        pos = daten["bauteile"][0]["positionen"][0]
        pos["einzellaenge_m"] = 14.0
        pos["gesamtlaenge_m"] = 140.0
        pos["masse_kg"] = 140.0 * stab_masse(12)
        meldungen = pruefe(Projekt.aus_json(daten))
        self.assertTrue(any("Lieferlänge" in m for m in meldungen))


class TestDateien(unittest.TestCase):
    """Einlesen, Fehlermeldungen und Ausgabe."""

    def test_fehlende_bauteile(self):
        with self.assertRaises(BiegedatenFehler):
            Projekt.aus_json({"projekt": {"name": "leer"}})

    def test_kein_json(self):
        with tempfile.TemporaryDirectory() as ordner:
            pfad = Path(ordner) / "kaputt.json"
            pfad.write_text("kein json", encoding="utf-8")
            with self.assertRaises(BiegedatenFehler):
                Projekt.laden(pfad)

    def test_alle_dateien_entstehen(self):
        projekt = Projekt.aus_json(beispiel_projekt())
        with tempfile.TemporaryDirectory() as ordner:
            dateien = alles_ausgeben(projekt, Path(ordner))
            for pfad in dateien.values():
                self.assertTrue(pfad.exists(), f"{pfad.name} fehlt")
                self.assertGreater(pfad.stat().st_size, 0)
            inhalt = (Path(ordner) / "01_Biegeliste.csv").read_text(encoding="utf-8-sig")
            self.assertIn("EF1", inhalt)
            self.assertIn(";", inhalt)
            daten = json.loads((Path(ordner) / "06_Biegeliste.json").read_text(encoding="utf-8"))
            self.assertEqual(len(daten["biegeliste"]), 4)
            self.assertEqual(daten["pruefung"], [])

    def test_kennzahlen_des_beispiels(self):
        projekt = Projekt.aus_json(beispiel_projekt())
        # 2 × 1,35 m³ + 0,27 m³
        self.assertAlmostEqual(projekt.betonvolumen, 2.97, places=2)
        zeilen = biegeliste(projekt)
        masse = sum(z.masse for z in zeilen)
        # 2 × 28,95 kg (Fundament) + 24,0 + 6,9 kg (Stütze)
        self.assertAlmostEqual(masse, 2 * 2 * 16.3 * stab_masse(12) + 15.2 * stab_masse(16) + 17.4 * stab_masse(8), places=6)
        self.assertAlmostEqual(masse, 88.79, places=1)


if __name__ == "__main__":  # pragma: no cover
    unittest.main(verbosity=2)
