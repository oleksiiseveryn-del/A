"""Normwerte und Regeln für Betonstahl und Mindestbewehrung.

Grundlagen
----------
* Betonstahl B500B nach DIN 488-1, Nenndurchmesser nach DIN 488-2,
  Masse je Meter  m = pi/4 * ds^2 * 7850 kg/m^3
* Betonfestigkeitsklassen nach DIN EN 1992-1-1, Tab. 3.1
* Mindestbiegerollendurchmesser nach DIN EN 1992-1-1, Tab. 8.1N
* Konstruktive Mindestbewehrung nach DIN EN 1992-1-1, Abschnitt 9

Die Werte entsprechen denen der Weboberfläche (js/rebar.js und
js/autorebar.js); beide Umsetzungen werden gegen dieselben Handrechnungen
geprüft, siehe tests/.

WICHTIG: Mindestbewehrung ist keine Bemessung. Die erforderliche Bewehrung
aus Biegung, Querkraft, Durchstanzen und Rissbreitenbeschränkung sowie die
Verankerungs- und Übergreifungslängen weist der Tragwerksplaner nach.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

#: Nenndurchmesser des Betonstahls nach DIN 488-2 [mm]
BETONSTAHL_DS = (6, 8, 10, 12, 14, 16, 20, 25, 28, 32)

#: Streckgrenze und Teilsicherheitsbeiwert B500B nach DIN 488-1
BETONSTAHL_FYK = 500.0          # N/mm²
BETONSTAHL_GAMMA_S = 1.15
STAHL_DICHTE = 7850.0           # kg/m³

#: Teilsicherheitsbeiwert und Dauerstandsbeiwert Beton nach DIN EN 1992-1-1/NA
BETON_GAMMA_C = 1.5
BETON_ALPHA_CC = 0.85

#: Durchmesser und Stababstände der automatischen Wahl
AUTO_DURCHMESSER = (8, 10, 12, 14, 16, 20)
AUTO_ABSTAENDE = (100, 125, 150, 175, 200, 250)

#: Betonfestigkeitsklassen: fck [N/mm²] am Zylinder
BETONGUETEN = {
    "C12/15": 12, "C16/20": 16, "C20/25": 20, "C25/30": 25, "C30/37": 30,
    "C35/45": 35, "C40/50": 40, "C45/55": 45, "C50/60": 50,
}


def stab_flaeche(ds: float) -> float:
    """Nennquerschnitt eines Stabes [cm²]."""
    return math.pi / 4 * ds * ds / 100.0


def stab_masse(ds: float) -> float:
    """Masse je Meter [kg/m]."""
    return math.pi / 4 * (ds / 1000.0) ** 2 * STAHL_DICHTE


def as_je_meter(ds: float, abstand_mm: float) -> float:
    """Bewehrungsquerschnitt je Meter Breite [cm²/m]."""
    return stab_flaeche(ds) * 1000.0 / abstand_mm


def biegerollen_durchmesser(ds: float) -> float:
    """Mindestbiegerollendurchmesser nach DIN EN 1992-1-1 Tab. 8.1N [mm].

    ds <= 16 mm -> 4 ds, sonst 7 ds.
    """
    return 4 * ds if ds <= 16 else 7 * ds


def haken_laenge(ds: float) -> float:
    """Hakenlänge je Ende [m]: übliche Ausführung 10 ds, mindestens 70 mm."""
    return max(10 * ds, 70) / 1000.0


@dataclass(frozen=True)
class BetonKennwerte:
    """Kennwerte einer Betonfestigkeitsklasse nach DIN EN 1992-1-1 Tab. 3.1."""

    guete: str
    fck: float
    fcd: float
    fctm: float
    ecm: float

    @classmethod
    def aus_guete(cls, guete: str) -> "BetonKennwerte":
        fck = BETONGUETEN.get(guete, 25)
        return cls(
            guete=guete,
            fck=fck,
            fcd=BETON_ALPHA_CC * fck / BETON_GAMMA_C,
            fctm=0.30 * fck ** (2 / 3),
            ecm=22000.0 * ((fck + 8) / 10) ** 0.3,
        )


@dataclass(frozen=True)
class Mattenwahl:
    """Gewählte Kombination aus Durchmesser und Stababstand."""

    ds: int
    s: int
    as_vorh: float          # cm²/m
    masse_je_qm: float      # kg/m²
    ausreichend: bool = True

    def __str__(self) -> str:  # pragma: no cover - reine Darstellung
        return f"⌀{self.ds}/{self.s} mm"


def waehle_matte(as_erf: float, s_max: float) -> Mattenwahl:
    """Leichteste Bewehrung, die ``as_erf`` [cm²/m] und ``s_max`` [mm] einhält.

    Gütemaß ist die Stahlmasse je m²; bei gleicher Masse gewinnt der größere
    Stababstand, weil er weniger Verlegeaufwand bedeutet.
    """
    beste: Mattenwahl | None = None
    for ds in AUTO_DURCHMESSER:
        for s in AUTO_ABSTAENDE:
            if s > s_max:
                continue
            as_vorh = as_je_meter(ds, s)
            if as_vorh < as_erf:
                continue
            masse = stab_masse(ds) * 1000.0 / s
            if (
                beste is None
                or masse < beste.masse_je_qm - 1e-9
                or (abs(masse - beste.masse_je_qm) < 1e-9 and s > beste.s)
            ):
                beste = Mattenwahl(ds=ds, s=s, as_vorh=as_vorh, masse_je_qm=masse)
    if beste is None:
        ds = AUTO_DURCHMESSER[-1]
        s = int(min(AUTO_ABSTAENDE[0], s_max if s_max > 0 else AUTO_ABSTAENDE[0]))
        beste = Mattenwahl(
            ds=ds, s=s, as_vorh=as_je_meter(ds, s),
            masse_je_qm=stab_masse(ds) * 1000.0 / s, ausreichend=False,
        )
    return beste


def platten_mindestbewehrung(hoehe_m: float, deckung_mm: float, ds_annahme: float,
                             kennwerte: BetonKennwerte) -> dict:
    """Mindestbewehrung einer Platte je Meter Breite.

    DIN EN 1992-1-1, Abs. 9.2.1.1 mit 9.3.1.1:
        a_s,min = max(0,26 * f_ctm/f_yk * b * d ; 0,0013 * b * d)  mit b = 1 m
        s_max = min(3 h ; 400 mm) längs bzw. min(3,5 h ; 450 mm) quer
    """
    nutzhoehe = max(hoehe_m - deckung_mm / 1000.0 - (ds_annahme / 1000.0) / 2, 0.02)
    as_min1 = 0.26 * (kennwerte.fctm / BETONSTAHL_FYK) * 100 * (nutzhoehe * 100)
    as_min2 = 0.0013 * 100 * (nutzhoehe * 100)
    return {
        "as_min": max(as_min1, as_min2),
        "d": nutzhoehe,
        "s_max_haupt": min(3 * hoehe_m * 1000, 400),
        "s_max_quer": min(3.5 * hoehe_m * 1000, 450),
    }


def stuetzen_mindestbewehrung(ac_cm2: float, n_ed_kn: float = 0.0) -> dict:
    """Mindest- und Höchstbewehrung einer Stütze nach Abs. 9.5.2.

    A_s,min = max(0,10 * N_Ed / f_yd ; 0,002 * A_c),  A_s,max = 0,04 * A_c
    """
    fyd = BETONSTAHL_FYK / BETONSTAHL_GAMMA_S
    as_aus_n = 0.10 * max(n_ed_kn, 0.0) * 1000.0 / fyd / 100.0   # cm²
    return {
        "as_min": max(as_aus_n, 0.002 * ac_cm2),
        "as_aus_n": as_aus_n,
        "as_max": 0.04 * ac_cm2,
    }


def wand_mindestbewehrung(dicke_m: float) -> dict:
    """Mindestbewehrung einer Wand je Meter Länge nach Abs. 9.6.2 und 9.6.3."""
    ac = dicke_m * 100 * 100                      # cm²/m
    as_v_min = 0.002 * ac
    as_h_min = max(0.25 * as_v_min, 0.001 * ac)
    return {
        "ac": ac,
        "as_v_min": as_v_min,
        "as_v_min_je_seite": as_v_min / 2,
        "as_h_min": as_h_min,
        "as_h_min_je_seite": as_h_min / 2,
        "s_v_max": min(3 * dicke_m * 1000, 400),
        "s_h_max": 400.0,
    }


def buegel_mindestbewehrung(fck: float) -> float:
    """Mindestquerkraftbewehrungsgrad nach Abs. 9.2.2(5): 0,08*sqrt(fck)/fyk."""
    return 0.08 * math.sqrt(fck) / BETONSTAHL_FYK
