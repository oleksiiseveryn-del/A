"""Rechenkern der Wandbewehrung – ohne Allplan lauffähig und prüfbar.

Hier steht die gesamte Ingenieurleistung: Mindestbewehrung, Wahl von
Durchmesser und Stababstand, Stabzahlen, Stablängen mit Übergreifungsstoß
und Verankerung, Massen. Der Allplan-PythonPart (``WandBewehrung.py``)
benutzt nur noch die Ergebnisse und zeichnet daraus die Bewehrung.

Diese Trennung hat einen einfachen Grund: Der Kern lässt sich ohne Allplan
prüfen – und wird geprüft (siehe ``python/tests``). In Allplan bleibt nur
die Darstellung, die dort ohnehin versionsabhängig ist.

Grundlagen: DIN EN 1992-1-1 Abschnitt 9.6 (Wände) mit Abs. 8.7 für die
Übergreifung, DIN 488-1/-2 für den Betonstahl. Das Ergebnis ist
konstruktive Mindestbewehrung und keine Bemessung.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass, field
from pathlib import Path

# Der Kern nutzt dieselben Normwerte wie die übrige Anwendung.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from hsd_bewehrung.norms import (  # noqa: E402  (Pfad muss vorher stehen)
    BETONSTAHL_FYK,
    BetonKennwerte,
    stab_flaeche,
    stab_masse,
    waehle_matte,
    wand_mindestbewehrung,
)


@dataclass
class Stabreihe:
    """Eine Bewehrungslage der Wand."""

    name: str            # z. B. "lotrecht, Seite 1"
    richtung: str        # "lotrecht" oder "waagerecht"
    seite: int           # 1 = vordere, 2 = hintere Bewehrungslage
    ds: int              # Stabdurchmesser [mm]
    abstand: float       # Stababstand [mm]
    anzahl: int          # Stabzahl
    laenge: float        # Einzellänge [m]

    @property
    def gesamtlaenge(self) -> float:
        return self.anzahl * self.laenge

    @property
    def masse(self) -> float:
        return self.gesamtlaenge * stab_masse(self.ds)

    @property
    def kurztext(self) -> str:
        return f"{self.anzahl} ⌀{self.ds} e = {self.abstand:.0f} mm, l = {self.laenge:.2f} m"


@dataclass
class Wandbewehrung:
    """Ergebnis für eine Wand."""

    laenge: float
    hoehe: float
    dicke: float
    deckung: float                       # c_nom [mm]
    guete: str
    reihen: list[Stabreihe] = field(default_factory=list)
    hinweise: list[str] = field(default_factory=list)
    as_v_erf: float = 0.0                # cm²/m je Seite
    as_v_vorh: float = 0.0
    as_h_erf: float = 0.0
    as_h_vorh: float = 0.0

    @property
    def masse(self) -> float:
        return sum(r.masse for r in self.reihen)

    @property
    def volumen(self) -> float:
        return self.laenge * self.hoehe * self.dicke

    @property
    def bewehrungsgrad(self) -> float:
        return self.masse / self.volumen if self.volumen > 0 else 0.0

    def als_text(self) -> str:
        zeilen = [
            f"Wand {self.laenge:.2f} × {self.hoehe:.2f} × {self.dicke:.3f} m · {self.guete} · c_nom {self.deckung:.0f} mm",
            f"a_s,v erf {self.as_v_erf:.2f} → vorh {self.as_v_vorh:.2f} cm²/m je Seite",
            f"a_s,h erf {self.as_h_erf:.2f} → vorh {self.as_h_vorh:.2f} cm²/m je Seite",
        ]
        zeilen += [f"  {r.name}: {r.kurztext} = {r.masse:.1f} kg" for r in self.reihen]
        zeilen.append(f"Betonstahl gesamt {self.masse:.1f} kg = {self.bewehrungsgrad:.0f} kg/m³")
        zeilen += [f"  Hinweis: {h}" for h in self.hinweise]
        return "\n".join(zeilen)


def anzahl_staebe(verteilbreite: float, abstand_mm: float) -> int:
    """Stabzahl über eine Verteilbreite [m]: n = floor(b / e) + 1, mindestens 2."""
    if abstand_mm <= 0:
        return 2
    return max(2, int(verteilbreite / (abstand_mm / 1000.0) + 1e-9) + 1)


def wand_bewehren(laenge: float, hoehe: float, dicke: float, deckung_mm: float = 25.0,
                  guete: str = "C25/30", ds_lotrecht: int = 0, s_lotrecht: float = 0.0,
                  ds_waagerecht: int = 0, s_waagerecht: float = 0.0,
                  stossfaktor: float = 50.0, verankerung_unten: float = 0.0) -> Wandbewehrung:
    """Bewehrt eine Wand mit der Mindestbewehrung nach Abs. 9.6.

    Durchmesser und Abstände werden automatisch gewählt, wenn sie mit 0
    übergeben werden; sonst gelten die Vorgaben und werden nur nachgewiesen.

    :param laenge: Wandlänge [m]
    :param hoehe: Wandhöhe [m]
    :param dicke: Wanddicke [m]
    :param deckung_mm: Betondeckung c_nom [mm]
    :param stossfaktor: Übergreifungslänge l0 = Faktor · d_s (Richtwert)
    :param verankerung_unten: zusätzliche Länge der lotrechten Stäbe für die
        Anschlussbewehrung [m]
    """
    if min(laenge, hoehe, dicke) <= 0:
        raise ValueError("Länge, Höhe und Dicke der Wand müssen größer als null sein.")

    kennwerte = BetonKennwerte.aus_guete(guete)
    mind = wand_mindestbewehrung(dicke)
    c = deckung_mm / 1000.0
    hinweise = []

    # --- lotrechte Bewehrung je Seite
    if ds_lotrecht > 0 and s_lotrecht > 0:
        as_v_vorh = stab_flaeche(ds_lotrecht) * 1000.0 / s_lotrecht
        ds_v, s_v = int(ds_lotrecht), float(s_lotrecht)
        if s_v > mind["s_v_max"]:
            hinweise.append(
                f"Vorgegebener Abstand {s_v:.0f} mm über s_v,max = {mind['s_v_max']:.0f} mm (Abs. 9.6.2)."
            )
        if as_v_vorh < mind["as_v_min_je_seite"]:
            hinweise.append(
                f"Vorgegebene lotrechte Bewehrung {as_v_vorh:.2f} cm²/m unter a_s,min = "
                f"{mind['as_v_min_je_seite']:.2f} cm²/m je Seite (Abs. 9.6.2)."
            )
    else:
        wahl = waehle_matte(mind["as_v_min_je_seite"], mind["s_v_max"])
        ds_v, s_v, as_v_vorh = wahl.ds, float(wahl.s), wahl.as_vorh

    # --- waagerechte Bewehrung je Seite
    if ds_waagerecht > 0 and s_waagerecht > 0:
        as_h_vorh = stab_flaeche(ds_waagerecht) * 1000.0 / s_waagerecht
        ds_h, s_h = int(ds_waagerecht), float(s_waagerecht)
        if s_h > mind["s_h_max"]:
            hinweise.append(
                f"Vorgegebener Abstand {s_h:.0f} mm über s_h,max = {mind['s_h_max']:.0f} mm (Abs. 9.6.3)."
            )
    else:
        wahl = waehle_matte(mind["as_h_min_je_seite"], mind["s_h_max"])
        ds_h, s_h, as_h_vorh = wahl.ds, float(wahl.s), wahl.as_vorh

    # --- Stablängen
    l0_v = stossfaktor * ds_v / 1000.0
    laenge_lotrecht = max(hoehe - 2 * c, 0.05) + verankerung_unten + l0_v
    laenge_waagerecht = max(laenge - 2 * c, 0.05)

    n_lotrecht = anzahl_staebe(max(laenge - 2 * c, 0.05), s_v)
    n_waagerecht = anzahl_staebe(max(hoehe - 2 * c, 0.05), s_h)

    reihen = [
        Stabreihe("lotrecht, Seite 1", "lotrecht", 1, ds_v, s_v, n_lotrecht, laenge_lotrecht),
        Stabreihe("lotrecht, Seite 2", "lotrecht", 2, ds_v, s_v, n_lotrecht, laenge_lotrecht),
        Stabreihe("waagerecht, Seite 1", "waagerecht", 1, ds_h, s_h, n_waagerecht, laenge_waagerecht),
        Stabreihe("waagerecht, Seite 2", "waagerecht", 2, ds_h, s_h, n_waagerecht, laenge_waagerecht),
    ]

    hinweise.append(
        f"Mindestbewehrung nach DIN EN 1992-1-1 Abs. 9.6.2/9.6.3; "
        f"Übergreifung l0 = {stossfaktor:.0f}·d_s = {l0_v * 100:.0f} cm als Richtwert (Abs. 8.7.3 maßgebend)."
    )
    hinweise.append("Keine Bemessung: Bewehrung aus Schnittgrößen, Rissbreiten und Randeinfassung gesondert nachweisen.")
    if kennwerte.fck < 20:
        hinweise.append(f"Festigkeitsklasse {guete} für tragende Wände prüfen.")

    return Wandbewehrung(
        laenge=laenge, hoehe=hoehe, dicke=dicke, deckung=deckung_mm, guete=guete,
        reihen=reihen, hinweise=hinweise,
        as_v_erf=mind["as_v_min_je_seite"], as_v_vorh=as_v_vorh,
        as_h_erf=mind["as_h_min_je_seite"], as_h_vorh=as_h_vorh,
    )


def stabpositionen(bewehrung: Wandbewehrung) -> list[dict]:
    """Einbaulage jedes Stabes in Wandkoordinaten [m].

    Ursprung ist die linke untere Ecke der Wand: x entlang der Wandachse,
    y über die Wanddicke, z in der Höhe. Der PythonPart setzt daraus die
    Allplan-Geometrie zusammen; Prüfungen können die Lage nachrechnen.
    """
    c = bewehrung.deckung / 1000.0
    positionen: list[dict] = []

    for reihe in bewehrung.reihen:
        # Achsabstand der Lage von der Wandoberfläche
        y = c + reihe.ds / 2000.0 if reihe.seite == 1 else bewehrung.dicke - c - reihe.ds / 2000.0
        schritt = reihe.abstand / 1000.0
        if reihe.richtung == "lotrecht":
            start = c
            for i in range(reihe.anzahl):
                positionen.append({
                    "reihe": reihe.name, "ds": reihe.ds, "laenge": reihe.laenge,
                    "x": round(min(start + i * schritt, bewehrung.laenge - c), 4),
                    "y": round(y, 4), "z": round(c, 4), "richtung": "lotrecht",
                })
        else:
            start = c
            for i in range(reihe.anzahl):
                positionen.append({
                    "reihe": reihe.name, "ds": reihe.ds, "laenge": reihe.laenge,
                    "x": round(c, 4), "y": round(y, 4),
                    "z": round(min(start + i * schritt, bewehrung.hoehe - c), 4),
                    "richtung": "waagerecht",
                })
    return positionen
