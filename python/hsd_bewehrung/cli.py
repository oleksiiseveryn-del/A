"""Kommandozeile: Biegedaten einlesen und Herstellungsunterlagen erzeugen."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .export import alles_ausgeben
from .model import BiegedatenFehler, Projekt
from .schedule import biegeliste, pruefe, schneidplan, stahlauszug


def _argumente(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="hsd_bewehrung",
        description=(
            "Erzeugt aus den Biegedaten des Stahlbau- und Architektur-Konverters "
            "die Unterlagen für die Herstellung: Biegeliste, Stahlauszug, "
            "Schneidplan, Bestellliste und Etiketten."
        ),
        epilog=(
            "Die Bewehrung ist konstruktive Mindest- bzw. Regelbewehrung. Die "
            "Bemessung nach DIN EN 1992-1-1 weist der Tragwerksplaner nach."
        ),
    )
    parser.add_argument("datei", help="Biegedaten-Datei (JSON) aus der Anwendung")
    parser.add_argument("-o", "--ordner", default="bewehrung_ausgabe",
                        help="Ausgabeordner (Voreinstellung: bewehrung_ausgabe)")
    parser.add_argument("-l", "--lagerlaenge", type=float, default=12.0,
                        help="Lagerlänge des Betonstahls in Metern (Voreinstellung: 12,0)")
    parser.add_argument("-s", "--saegeschnitt", type=float, default=0.0,
                        help="Schnittbreite je Stab in Millimetern (Voreinstellung: 0)")
    parser.add_argument("--nur-pruefen", action="store_true",
                        help="nur die Prüfung ausführen, keine Dateien schreiben")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _argumente(argv)
    try:
        projekt = Projekt.laden(args.datei)
    except BiegedatenFehler as fehler:
        print(f"Fehler: {fehler}", file=sys.stderr)
        return 2

    zeilen = biegeliste(projekt)
    meldungen = pruefe(projekt)

    print(f"Projekt {projekt.name} · {len(projekt.bauteile)} Bauteile · {len(zeilen)} Positionen")
    print(f"Beton {projekt.betonvolumen:.2f} m³ · Betonstahl {projekt.stahlmasse:.1f} kg "
          f"({projekt.stahlmasse / projekt.betonvolumen if projekt.betonvolumen else 0:.0f} kg/m³)")
    for auszug in stahlauszug(zeilen):
        print(f"  ⌀{auszug.ds:>2} mm: {auszug.stueck:>5} Stück · {auszug.laenge:>9.2f} m · {auszug.masse:>9.1f} kg")

    if meldungen:
        print("\nPrüfung:")
        for meldung in meldungen:
            print(f"  ! {meldung}")
    else:
        print("\nPrüfung ohne Beanstandung.")

    if args.nur_pruefen:
        return 1 if meldungen else 0

    try:
        plaene = schneidplan(zeilen, lagerlaenge=args.lagerlaenge, saegeschnitt_mm=args.saegeschnitt)
    except ValueError as fehler:
        print(f"Fehler: {fehler}", file=sys.stderr)
        return 2

    print("\nBestellung aus Lagerlängen:")
    for plan in plaene:
        sonder = f" + {len(plan.sonder)} Sonderlängen" if plan.sonder else ""
        print(f"  ⌀{plan.ds:>2} mm: {plan.anzahl_stangen:>4} Stangen à {plan.lagerlaenge:.2f} m{sonder} "
              f"= {plan.masse:>8.1f} kg · Verschnitt {plan.verschnitt_anteil * 100:.1f} %")

    dateien = alles_ausgeben(projekt, Path(args.ordner),
                             lagerlaenge=args.lagerlaenge, saegeschnitt_mm=args.saegeschnitt)
    print(f"\nUnterlagen in {Path(args.ordner).resolve()}:")
    for name, pfad in dateien.items():
        print(f"  {name:<12} {pfad.name}")
    return 0
