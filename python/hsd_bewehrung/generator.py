"""Automatische Wahl der konstruktiven Mindestbewehrung.

Dieselben Regeln wie in der Weboberfläche (js/autorebar.js), hier für die
Nachrechnung und für Bauteillisten, die nicht aus der Oberfläche kommen.
Der Vergleich beider Umsetzungen ist Teil der Tests.

Alle Angaben nach DIN EN 1992-1-1, Abschnitt 9; das Ergebnis ist
konstruktive Mindestbewehrung und keine Bemessung.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from .norms import (
    AUTO_ABSTAENDE,
    AUTO_DURCHMESSER,
    BETONSTAHL_FYK,
    BetonKennwerte,
    buegel_mindestbewehrung,
    platten_mindestbewehrung,
    stab_flaeche,
    stab_masse,
    stuetzen_mindestbewehrung,
    waehle_matte,
    wand_mindestbewehrung,
)

PLATTENARTEN = ("decke", "bodenplatte", "einzelfundament", "koecherfundament", "streifenfundament")
OBERE_LAGE = ("decke", "bodenplatte", "koecherfundament")


@dataclass
class Vorschlag:
    """Vorschlag der automatischen Bewehrung für ein Bauteil."""

    art: str
    parameter: dict[str, float]
    as_min: float
    as_vorh: float
    s_max: float
    gewaehlt: str
    hinweise: list[str] = field(default_factory=list)
    moeglich: bool = True

    @property
    def auslastung(self) -> float:
        return self.as_min / self.as_vorh if self.as_vorh > 0 else 0.0

    @property
    def ausreichend(self) -> bool:
        return self.as_vorh + 1e-9 >= self.as_min


def _naechster_durchmesser(mindest: float) -> int:
    for ds in AUTO_DURCHMESSER:
        if ds >= mindest:
            return ds
    return AUTO_DURCHMESSER[-1]


def automatische_bewehrung(art: str, geometrie: dict, deckung_mm: float,
                           guete: str = "C25/30", n_ed_kn: float = 0.0) -> Vorschlag:
    """Mindestbewehrung eines Bauteils nach Abschnitt 9.

    :param art: Bauteilart (``decke``, ``wand``, ``stuetze`` …)
    :param geometrie: Maße in Metern mit den Schlüsseln ``laenge_m``,
        ``breite_m``, ``hoehe_m`` und ``dicke_m``
    :param deckung_mm: Betondeckung c_nom [mm]
    :param n_ed_kn: Bemessungsnormalkraft der Stütze [kN]
    """
    kennwerte = BetonKennwerte.aus_guete(guete)
    laenge = float(geometrie.get("laenge_m", 0.0))
    breite = float(geometrie.get("breite_m", 0.0))
    hoehe = float(geometrie.get("hoehe_m", 0.0))
    dicke = float(geometrie.get("dicke_m", 0.0))

    if art in PLATTENARTEN:
        h = dicke if art == "streifenfundament" else (dicke or hoehe)
        mind = platten_mindestbewehrung(h, deckung_mm, 12, kennwerte)
        haupt = waehle_matte(mind["as_min"], mind["s_max_haupt"])
        quer = waehle_matte(max(0.2 * haupt.as_vorh, 0.2 * mind["as_min"]), mind["s_max_quer"])

        parameter: dict[str, float] = {"dsUnten": haupt.ds, "sUnten": haupt.s}
        if art in OBERE_LAGE:
            parameter.update({"obenAktiv": True, "dsOben": quer.ds, "sOben": quer.s})
        if art == "streifenfundament":
            parameter["dsLaengs"] = quer.ds
            parameter["nLaengs"] = max(4, int((breite - 2 * deckung_mm / 1000) / (quer.s / 1000)) + 1)

        return Vorschlag(
            art="Platte", parameter=parameter, as_min=mind["as_min"], as_vorh=haupt.as_vorh,
            s_max=mind["s_max_haupt"], gewaehlt=f"⌀{haupt.ds}/{haupt.s} mm",
            hinweise=[
                f"a_s,min = {mind['as_min']:.2f} cm²/m bei d = {mind['d'] * 100:.1f} cm (Abs. 9.2.1.1)",
                f"s_max = {mind['s_max_haupt']:.0f} mm längs, {mind['s_max_quer']:.0f} mm quer (Abs. 9.3.1.1)",
                "Obere Lage konstruktiv; die Stützbewehrung folgt aus der Schnittgrößenermittlung.",
            ],
        )

    if art in ("wand", "kellerwand"):
        mind = wand_mindestbewehrung(dicke)
        lotrecht = waehle_matte(mind["as_v_min_je_seite"], mind["s_v_max"])
        waagerecht = waehle_matte(mind["as_h_min_je_seite"], mind["s_h_max"])
        return Vorschlag(
            art="Wand",
            parameter={
                "dsUnten": lotrecht.ds, "sUnten": lotrecht.s,
                "dsOben": waagerecht.ds, "sOben": waagerecht.s, "obenAktiv": True,
            },
            as_min=mind["as_v_min_je_seite"], as_vorh=lotrecht.as_vorh, s_max=mind["s_v_max"],
            gewaehlt=f"⌀{lotrecht.ds}/{lotrecht.s} mm lotrecht je Seite",
            hinweise=[
                f"A_s,v,min = 0,002 · A_c = {mind['as_v_min']:.2f} cm²/m, je Seite "
                f"{mind['as_v_min_je_seite']:.2f} cm²/m (Abs. 9.6.2)",
                f"s_v,max = {mind['s_v_max']:.0f} mm, s_h,max = {mind['s_h_max']:.0f} mm (Abs. 9.6.2/9.6.3)",
            ],
        )

    if art in ("stuetze", "stuetze_rund"):
        rund = art == "stuetze_rund"
        ac = math.pi / 4 * (laenge * 100) ** 2 if rund else laenge * 100 * breite * 100
        mind = stuetzen_mindestbewehrung(ac, n_ed_kn)
        mindest_zahl = 6 if rund else 4

        gewaehlt = None
        for ds in [d for d in AUTO_DURCHMESSER if d >= 12]:
            schritt = 1 if rund else 2
            for n in range(mindest_zahl, 17, schritt):
                as_vorh = n * stab_flaeche(ds)
                if as_vorh < mind["as_min"]:
                    continue
                masse = n * stab_masse(ds)
                if gewaehlt is None or masse < gewaehlt[3] - 1e-9:
                    gewaehlt = (ds, n, as_vorh, masse)
                break
        if gewaehlt is None:
            gewaehlt = (20, mindest_zahl, mindest_zahl * stab_flaeche(20), 0.0)
        ds_laengs, n_laengs, as_vorh, _ = gewaehlt

        ds_buegel = _naechster_durchmesser(max(6, 0.25 * ds_laengs))
        kleinste_seite = laenge if rund else min(laenge, breite)
        s_buegel_max = min(20 * ds_laengs, kleinste_seite * 1000, 400)
        s_buegel = next((s for s in reversed(AUTO_ABSTAENDE) if s <= s_buegel_max), 100)

        hinweise = [
            f"A_c = {ac:.0f} cm², A_s,min = max(0,10·N_Ed/f_yd ; 0,002·A_c) = {mind['as_min']:.2f} cm² (Abs. 9.5.2)",
            f"Bügel s_cl,max = min(20·d_s ; b ; 400 mm) = {s_buegel_max:.0f} mm (Abs. 9.5.3)",
        ]
        if n_ed_kn > 0:
            hinweise.insert(1, f"N_Ed = {n_ed_kn:.0f} kN ergibt {mind['as_aus_n']:.2f} cm²")
        if as_vorh > mind["as_max"]:
            hinweise.append(
                f"A_s,vorh über A_s,max = 0,04·A_c = {mind['as_max']:.2f} cm² – Querschnitt vergrößern."
            )

        return Vorschlag(
            art="Stütze",
            parameter={"dsLaengs": ds_laengs, "nLaengs": n_laengs, "dsBuegel": ds_buegel, "sBuegel": s_buegel},
            as_min=mind["as_min"], as_vorh=as_vorh, s_max=s_buegel_max,
            gewaehlt=f"{n_laengs} ⌀{ds_laengs} + Bügel ⌀{ds_buegel}/{s_buegel} mm",
            hinweise=hinweise,
        )

    if art == "unterzug":
        nutzhoehe = max(hoehe - deckung_mm / 1000 - 0.01 - 0.008, 0.05)
        as_min = max(
            0.26 * (kennwerte.fctm / BETONSTAHL_FYK) * (breite * 100) * (nutzhoehe * 100),
            0.0013 * (breite * 100) * (nutzhoehe * 100),
        )
        laengs = None
        for ds in [d for d in AUTO_DURCHMESSER if d >= 12]:
            for n in range(2, 9):
                as_vorh = n * stab_flaeche(ds)
                if as_vorh < as_min:
                    continue
                masse = n * stab_masse(ds)
                if laengs is None or masse < laengs[3] - 1e-9:
                    laengs = (ds, n, as_vorh, masse)
                break
        if laengs is None:
            laengs = (20, 3, 3 * stab_flaeche(20), 0.0)

        rho_w_min = buegel_mindestbewehrung(kennwerte.fck)
        s_max = min(0.75 * nutzhoehe * 1000, 400)
        buegel = None
        for ds in [d for d in AUTO_DURCHMESSER if d <= 12]:
            for s in AUTO_ABSTAENDE:
                if s > s_max:
                    continue
                rho = 2 * stab_flaeche(ds) / ((s / 10) * (breite * 100))
                if rho < rho_w_min:
                    continue
                masse = 2 * stab_masse(ds) * 1000 / s
                if buegel is None or masse < buegel[2] - 1e-9:
                    buegel = (ds, s, masse)
        if buegel is None:
            buegel = (10, int(min(150, s_max)), 0.0)

        return Vorschlag(
            art="Balken",
            parameter={
                "dsLaengs": laengs[0], "nLaengs": laengs[1],
                "dsOben": _naechster_durchmesser(max(12, laengs[0] * 0.6)), "nOben": 2,
                "dsBuegel": buegel[0], "sBuegel": buegel[1],
            },
            as_min=as_min, as_vorh=laengs[2], s_max=s_max,
            gewaehlt=f"{laengs[1]} ⌀{laengs[0]} unten + Bügel ⌀{buegel[0]}/{buegel[1]} mm",
            hinweise=[
                f"A_s,min = {as_min:.2f} cm² bei d = {nutzhoehe * 100:.1f} cm (Abs. 9.2.1.1)",
                f"ρ_w,min = 0,08·√f_ck/f_yk = {rho_w_min * 1000:.2f} ‰, s_l,max = 0,75·d = {s_max:.0f} mm (Abs. 9.2.2)",
            ],
        )

    return Vorschlag(
        art=art, parameter={}, as_min=0.0, as_vorh=0.0, s_max=0.0, gewaehlt="–",
        moeglich=False,
        hinweise=[
            "Für diese Bauteilart wird keine automatische Bewehrung erzeugt. "
            "Bohrpfähle nach DIN EN 1536 mit EA-Pfähle und der Pfahlbemessung bewehren."
        ],
    )
