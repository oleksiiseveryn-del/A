"""Ausgabe der Herstellungsunterlagen als CSV, JSON und Text.

Die CSV-Dateien sind für Excel eingerichtet: Semikolon als Trennzeichen,
Komma als Dezimalzeichen und UTF-8 mit BOM. Damit lassen sie sich ohne
Zwischenschritte in Angebot, Bestellung und Abrechnung übernehmen.
"""

from __future__ import annotations

import csv
import json
from dataclasses import asdict
from datetime import datetime
from pathlib import Path

from .model import Projekt
from .schedule import Biegezeile, Etikett, Schneidplan, biegeliste, etiketten, schneidplan, stahlauszug
from .norms import stab_masse

CSV_TRENNER = ";"


def _zahl(wert: float, stellen: int = 2) -> str:
    """Zahl mit deutschem Dezimalkomma."""
    return f"{wert:.{stellen}f}".replace(".", ",")


def _schreibe_csv(pfad: Path, kopf: list[str], zeilen: list[list[str]]) -> Path:
    pfad.parent.mkdir(parents=True, exist_ok=True)
    with pfad.open("w", encoding="utf-8-sig", newline="") as datei:
        schreiber = csv.writer(datei, delimiter=CSV_TRENNER, quoting=csv.QUOTE_MINIMAL)
        schreiber.writerow(kopf)
        schreiber.writerows(zeilen)
    return pfad


def biegeliste_csv(projekt: Projekt, zeilen: list[Biegezeile], pfad: Path) -> Path:
    """Biegeliste als CSV für Bestellung und Biegerei."""
    kopf = [
        "Bauteil", "Bauteilart", "Pos", "Bezeichnung", "Biegeform", "Biegemaße [cm]",
        "Durchmesser [mm]", "Anzahl", "Einzellänge [m]", "Gesamtlänge [m]",
        "kg/m", "Masse [kg]", "Biegerolle D [mm]", "Bemerkung",
    ]
    daten = [
        [
            z.bauteil, z.bauteil_art, str(z.pos), z.bezeichnung, z.biegeform_name, z.biegemass_text,
            str(z.ds), str(z.anzahl), _zahl(z.einzellaenge), _zahl(z.gesamtlaenge),
            _zahl(stab_masse(z.ds), 3), _zahl(z.masse), _zahl(z.biegerolle, 0), z.bemerkung,
        ]
        for z in zeilen
    ]
    gesamt = sum(z.masse for z in zeilen)
    daten.append(["Summe", "", "", "", "", "", "", "", "", "", "", _zahl(gesamt), "", f"Projekt {projekt.name}"])
    return _schreibe_csv(pfad, kopf, daten)


def stahlauszug_csv(zeilen: list[Biegezeile], pfad: Path) -> Path:
    """Stahlauszug nach Durchmessern."""
    kopf = ["Durchmesser [mm]", "Querschnitt [cm²]", "Stück", "Gesamtlänge [m]", "kg/m", "Masse [kg]", "Masse [t]"]
    daten = [
        [
            str(a.ds), _zahl(a.querschnitt), str(a.stueck), _zahl(a.laenge),
            _zahl(a.masse_je_meter, 3), _zahl(a.masse), _zahl(a.masse / 1000, 3),
        ]
        for a in stahlauszug(zeilen)
    ]
    gesamt = sum(z.masse for z in zeilen)
    daten.append(["Summe", "", "", "", "", _zahl(gesamt), _zahl(gesamt / 1000, 3)])
    return _schreibe_csv(pfad, kopf, daten)


def schneidplan_csv(plaene: list[Schneidplan], pfad: Path) -> Path:
    """Schneidplan je Durchmesser mit Belegung und Verschnitt."""
    kopf = ["Durchmesser [mm]", "Stange", "Lagerlänge [m]", "Zuschnitte", "belegt [m]", "Rest [m]", "Auslastung [%]"]
    daten: list[list[str]] = []
    for plan in plaene:
        for nummer, stange in enumerate(plan.stangen, start=1):
            schnitte = " + ".join(f"{kennung} {laenge:.2f}".replace(".", ",") for kennung, laenge in stange.schnitte)
            daten.append([
                str(plan.ds), str(nummer), _zahl(stange.laenge), schnitte,
                _zahl(stange.belegt), _zahl(stange.rest), _zahl(stange.auslastung * 100, 1),
            ])
        for kennung, laenge in plan.sonder:
            daten.append([
                str(plan.ds), "Sonderlänge", _zahl(laenge), kennung, _zahl(laenge), "0,00", "100,0",
            ])
        daten.append([
            str(plan.ds), "Summe", "", f"{plan.anzahl_stangen} Stangen"
            + (f" + {len(plan.sonder)} Sonderlängen" if plan.sonder else ""),
            _zahl(plan.verwendet), _zahl(plan.verschnitt),
            _zahl((1 - plan.verschnitt_anteil) * 100, 1),
        ])
    return _schreibe_csv(pfad, kopf, daten)


def bestellung_csv(plaene: list[Schneidplan], pfad: Path) -> Path:
    """Bestellliste: ganze Stangen je Durchmesser mit Masse."""
    kopf = ["Durchmesser [mm]", "Lagerlänge [m]", "Stangen", "Sonderlängen [m]",
            "Länge gesamt [m]", "Masse [kg]", "Verschnitt [%]"]
    daten = [
        [
            str(p.ds), _zahl(p.lagerlaenge), str(p.anzahl_stangen), _zahl(p.sonderlaenge),
            _zahl(p.eingesetzt + p.sonderlaenge), _zahl(p.masse), _zahl(p.verschnitt_anteil * 100, 1),
        ]
        for p in plaene
    ]
    daten.append(["Summe", "", str(sum(p.anzahl_stangen for p in plaene)), "", "",
                  _zahl(sum(p.masse for p in plaene)), ""])
    return _schreibe_csv(pfad, kopf, daten)


def etiketten_txt(marken: list[Etikett], pfad: Path) -> Path:
    """Bündeletiketten als Textdatei zum Ausdrucken."""
    pfad.parent.mkdir(parents=True, exist_ok=True)
    trenner = "-" * 46
    inhalt = f"\n{trenner}\n".join(marke.als_text() for marke in marken)
    pfad.write_text(f"{trenner}\n{inhalt}\n{trenner}\n", encoding="utf-8")
    return pfad


def uebersicht_txt(projekt: Projekt, zeilen: list[Biegezeile], plaene: list[Schneidplan],
                   meldungen: list[str], pfad: Path) -> Path:
    """Deckblatt mit Kennzahlen, Prüfergebnis und Hinweisen."""
    gesamt = sum(z.masse for z in zeilen)
    zeilen_text = [
        "HSD Hamburg GmbH · Merckmannstraße 30 · 20539 Hamburg · Tel. 040 18124794",
        "",
        f"Projekt:        {projekt.name}",
        f"Datum:          {projekt.datum}",
        f"Bearbeiter:     {projekt.bearbeiter}",
        f"Biegedaten:     {projekt.erstellt}",
        f"Ausgewertet:    {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        "",
        "Mengen",
        f"  Bauteile:            {len(projekt.bauteile)}",
        f"  Bewehrungspositionen:{len(zeilen):>6}",
        f"  Betonvolumen:        {projekt.betonvolumen:.2f} m³",
        f"  Betonstahl:          {gesamt:.1f} kg = {gesamt / 1000:.3f} t",
        f"  Bewehrungsgrad:      {(gesamt / projekt.betonvolumen if projekt.betonvolumen else 0):.0f} kg/m³",
        "",
        "Bestellung aus Lagerlängen",
    ]
    for plan in plaene:
        sonder = f" + {len(plan.sonder)} Sonderlängen ({plan.sonderlaenge:.2f} m)" if plan.sonder else ""
        zeilen_text.append(
            f"  ⌀{plan.ds:>2} mm: {plan.anzahl_stangen:>4} Stangen à {plan.lagerlaenge:.2f} m{sonder}"
            f" = {plan.masse:>8.1f} kg · Verschnitt {plan.verschnitt_anteil * 100:.1f} %"
        )
    zeilen_text += [
        "",
        "Prüfung der Biegedaten",
    ]
    if meldungen:
        zeilen_text += [f"  ! {m}" for m in meldungen]
    else:
        zeilen_text.append("  ohne Beanstandung: Längen und Massen sind in sich stimmig.")
    zeilen_text += [
        "",
        "Hinweise",
        "  Einzellängen ohne Abzug der Biegerollendurchmesser; Biegerollen nach",
        "  DIN EN 1992-1-1 Tab. 8.1N. Betonstahl B500B nach DIN 488-1.",
        "  Die Bewehrung ist konstruktive Mindestbewehrung nach Abschnitt 9 bzw. die",
        "  in der Anwendung eingegebene Regelbewehrung. Die Bemessung für Biegung,",
        "  Querkraft, Durchstanzen und Rissbreiten sowie Verankerungs- und",
        "  Übergreifungslängen weist der Tragwerksplaner nach.",
        "  Vor der Fertigung sind Biegeliste und Biegeformen mit dem Biegebetrieb",
        "  abzustimmen.",
    ]
    pfad.parent.mkdir(parents=True, exist_ok=True)
    pfad.write_text("\n".join(zeilen_text) + "\n", encoding="utf-8")
    return pfad


def biegeliste_json(projekt: Projekt, zeilen: list[Biegezeile], plaene: list[Schneidplan],
                    meldungen: list[str], pfad: Path) -> Path:
    """Maschinenlesbare Ausgabe für die Weiterverarbeitung."""
    daten = {
        "projekt": {"name": projekt.name, "datum": projekt.datum, "bearbeiter": projekt.bearbeiter},
        "betonstahl": projekt.betonstahl,
        "vorgaben": projekt.vorgaben,
        "biegeliste": [asdict(z) for z in zeilen],
        "stahlauszug": [
            {"ds_mm": a.ds, "stueck": a.stueck, "laenge_m": a.laenge, "masse_kg": a.masse}
            for a in stahlauszug(zeilen)
        ],
        "bestellung": [
            {
                "ds_mm": p.ds, "lagerlaenge_m": p.lagerlaenge, "stangen": p.anzahl_stangen,
                "masse_kg": p.masse, "verschnitt_anteil": p.verschnitt_anteil,
            }
            for p in plaene
        ],
        "pruefung": meldungen,
    }
    pfad.parent.mkdir(parents=True, exist_ok=True)
    pfad.write_text(json.dumps(daten, ensure_ascii=False, indent=2), encoding="utf-8")
    return pfad


def alles_ausgeben(projekt: Projekt, ordner: Path, lagerlaenge: float = 12.0,
                   saegeschnitt_mm: float = 0.0) -> dict[str, Path]:
    """Erzeugt alle Unterlagen in ``ordner`` und gibt die Pfade zurück."""
    from .schedule import pruefe  # lokal, um den Modulkopf schlank zu halten

    zeilen = biegeliste(projekt)
    plaene = schneidplan(zeilen, lagerlaenge=lagerlaenge, saegeschnitt_mm=saegeschnitt_mm)
    meldungen = pruefe(projekt)
    marken = etiketten(projekt, zeilen)
    ordner = Path(ordner)

    return {
        "uebersicht": uebersicht_txt(projekt, zeilen, plaene, meldungen, ordner / "00_Uebersicht.txt"),
        "biegeliste": biegeliste_csv(projekt, zeilen, ordner / "01_Biegeliste.csv"),
        "stahlauszug": stahlauszug_csv(zeilen, ordner / "02_Stahlauszug.csv"),
        "schneidplan": schneidplan_csv(plaene, ordner / "03_Schneidplan.csv"),
        "bestellung": bestellung_csv(plaene, ordner / "04_Bestellung.csv"),
        "etiketten": etiketten_txt(marken, ordner / "05_Etiketten.txt"),
        "json": biegeliste_json(projekt, zeilen, plaene, meldungen, ordner / "06_Biegeliste.json"),
    }
