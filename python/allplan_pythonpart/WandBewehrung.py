"""Allplan-PythonPart: Wand bewehren.

Erzeugt in Allplan die lotrechte und waagerechte Bewehrung einer Wand aus
den Eingaben der Palette. Gerechnet wird im geprüften Kern
(``wandbewehrung_kern.py``), gezeichnet wird hier.

Ablauf wie bei jedem PythonPart:
    check_allplan_version(build_ele, version) -> bool
    create_element(build_ele, doc)            -> (Elemente, Handles)

WICHTIG – vor dem ersten Einsatz zu prüfen:
Die Aufrufe der Allplan-Python-API sind versionsabhängig. Diese Fassung ist
gegen die Struktur der Allplan-PythonParts-Dokumentation geschrieben, aber
nicht in Ihrer Installation getestet. Prüfen Sie in Ihrer Allplan-Version:

  * die Modulnamen (``NemAll_Python_Reinforcement``,
    ``StdReinfShapeBuilder``) und deren Funktionsnamen,
  * ``AllplanReinf.BendingShape`` bzw. den ShapeBuilder Ihrer Version,
  * die Signatur von ``AllplanReinf.BarPlacement``.

Der Rechenkern und die Stablagen sind davon unabhängig und geprüft; wenn
die API abweicht, ist nur die Zeichenschicht in ``_erzeuge_bewehrung``
anzupassen. Ohne Allplan lässt sich das Modul importieren und der Kern
über ``ergebnis_text()`` prüfen.
"""

from __future__ import annotations

import os
import sys

# Der Kern liegt neben diesem Skript
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from wandbewehrung_kern import wand_bewehren, stabpositionen  # noqa: E402

# --- Allplan-Module. Außerhalb von Allplan bleibt ALLPLAN_VERFUEGBAR False,
#     damit sich das Skript trotzdem importieren und prüfen lässt.
try:  # pragma: no cover - in Allplan vorhanden
    import NemAll_Python_Geometry as AllplanGeo
    import NemAll_Python_BaseElements as AllplanBaseElements
    import NemAll_Python_BasisElements as AllplanBasisElements
    import NemAll_Python_Reinforcement as AllplanReinf
    ALLPLAN_VERFUEGBAR = True
except ImportError:  # außerhalb von Allplan
    AllplanGeo = AllplanBaseElements = AllplanBasisElements = AllplanReinf = None
    ALLPLAN_VERFUEGBAR = False

#: Kleinste Allplan-Version, gegen die dieser PythonPart geschrieben ist
MINDESTVERSION = 2023.0

#: Stahlsorte und Biegerollen nach DIN 488-1 bzw. DIN EN 1992-1-1 Tab. 8.1N
STAHLSORTE = "B500B"
STAHLGUETE_ID = 4        # Allplan-Kennung für BSt 500 – in der Konfiguration prüfen


def check_allplan_version(build_ele, version):
    """Prüft die Allplan-Version. Rückgabe True heißt: PythonPart wird geladen."""
    try:
        return float(version) >= MINDESTVERSION
    except (TypeError, ValueError):
        return True


def _parameter(build_ele) -> dict:
    """Liest die Palettenwerte; fehlende Werte erhalten sinnvolle Vorgaben.

    Längen kommen aus Allplan in Millimetern, der Kern rechnet in Metern.
    """
    def wert(name, vorgabe):
        eintrag = getattr(build_ele, name, None)
        return eintrag.value if eintrag is not None and hasattr(eintrag, "value") else vorgabe

    return {
        "laenge": float(wert("Laenge", 5000.0)) / 1000.0,
        "hoehe": float(wert("Hoehe", 2750.0)) / 1000.0,
        "dicke": float(wert("Dicke", 240.0)) / 1000.0,
        "deckung_mm": float(wert("Betondeckung", 25.0)),
        "guete": str(wert("Betonguete", "C25/30")),
        "ds_lotrecht": int(wert("DsLotrecht", 0)),
        "s_lotrecht": float(wert("AbstandLotrecht", 0.0)),
        "ds_waagerecht": int(wert("DsWaagerecht", 0)),
        "s_waagerecht": float(wert("AbstandWaagerecht", 0.0)),
        "stossfaktor": float(wert("Stossfaktor", 50.0)),
        "verankerung_unten": float(wert("VerankerungUnten", 0.0)) / 1000.0,
    }


def berechne(build_ele):
    """Rechenkern mit den Palettenwerten aufrufen."""
    return wand_bewehren(**_parameter(build_ele))


def ergebnis_text(build_ele) -> str:
    """Ergebnis als Text – für die Palette, das Protokoll und die Prüfung."""
    return berechne(build_ele).als_text()


def create_element(build_ele, doc):
    """Erzeugt die Bewehrung. Rückgabe: (Elementliste, Handleliste)."""
    bewehrung = berechne(build_ele)

    if not ALLPLAN_VERFUEGBAR:            # außerhalb von Allplan nur rechnen
        return [], []

    elemente = []
    elemente += _erzeuge_wandkoerper(bewehrung)
    elemente += _erzeuge_bewehrung(bewehrung, doc)
    return elemente, []


def _erzeuge_wandkoerper(bewehrung):
    """Wandkörper als Volumen, damit die Bewehrung im Zusammenhang steht."""
    quader = AllplanGeo.Polyhedron3D.CreateCuboid(
        AllplanGeo.Point3D(0, 0, 0),
        AllplanGeo.Point3D(bewehrung.laenge * 1000, bewehrung.dicke * 1000, bewehrung.hoehe * 1000),
    )
    eigenschaften = AllplanBaseElements.CommonProperties()
    eigenschaften.GetGlobalProperties()
    return [AllplanBasisElements.ModelElement3D(eigenschaften, quader)]


def _erzeuge_bewehrung(bewehrung, doc):
    """Wandelt die Stablagen des Kerns in Allplan-Bewehrung um.

    Diese Schicht ist die einzige versionsabhängige Stelle: Sie erzeugt je
    Stabreihe eine Biegeform (gerader Stab) und verlegt sie linear.
    """
    elemente = []
    positionsnummer = 1

    for reihe in bewehrung.reihen:
        lagen = [p for p in stabpositionen(bewehrung) if p["reihe"] == reihe.name]
        if not lagen:
            continue
        erste, letzte = lagen[0], lagen[-1]

        # Gerader Stab als Biegeform; Längen in Millimetern
        laenge_mm = reihe.laenge * 1000.0
        if reihe.richtung == "lotrecht":
            von = AllplanGeo.Point3D(erste["x"] * 1000, erste["y"] * 1000, erste["z"] * 1000)
            bis = AllplanGeo.Point3D(erste["x"] * 1000, erste["y"] * 1000, erste["z"] * 1000 + laenge_mm)
            versatz = AllplanGeo.Point3D(letzte["x"] * 1000 - erste["x"] * 1000, 0, 0)
        else:
            von = AllplanGeo.Point3D(erste["x"] * 1000, erste["y"] * 1000, erste["z"] * 1000)
            bis = AllplanGeo.Point3D(erste["x"] * 1000 + laenge_mm, erste["y"] * 1000, erste["z"] * 1000)
            versatz = AllplanGeo.Point3D(0, 0, letzte["z"] * 1000 - erste["z"] * 1000)

        form = AllplanReinf.BendingShape(
            AllplanGeo.Polyline3D([von, bis]),
            AllplanReinf.BendingRollerList([]),
            reihe.ds,                      # Stabdurchmesser [mm]
            STAHLGUETE_ID,
            int(bewehrung.deckung),        # Betondeckung [mm]
            AllplanReinf.BendingShapeType.LongitudinalBar,
        )

        elemente.append(
            AllplanReinf.BarPlacement(
                positionsnummer,
                reihe.anzahl,
                AllplanGeo.Point3D(0, 0, 0),
                versatz,
                von,
                bis if reihe.richtung == "waagerecht" else von,
                form,
            )
        )
        positionsnummer += 1

    return elemente


def move_handle(build_ele, handle_prop, input_pnt, doc):  # pragma: no cover - Allplan-Rückruf
    """Handles werden nicht verwendet; die Maße kommen aus der Palette."""
    return create_element(build_ele, doc)


if __name__ == "__main__":  # Prüfung außerhalb von Allplan
    class _Feld:
        def __init__(self, value):
            self.value = value

    class _Palette:
        Laenge = _Feld(5000.0)
        Hoehe = _Feld(2750.0)
        Dicke = _Feld(240.0)
        Betondeckung = _Feld(25.0)
        Betonguete = _Feld("C25/30")
        DsLotrecht = _Feld(0)
        AbstandLotrecht = _Feld(0.0)
        DsWaagerecht = _Feld(0)
        AbstandWaagerecht = _Feld(0.0)
        Stossfaktor = _Feld(50.0)
        VerankerungUnten = _Feld(0.0)

    print(ergebnis_text(_Palette()))
    print(f"\nAllplan verfügbar: {ALLPLAN_VERFUEGBAR}")
