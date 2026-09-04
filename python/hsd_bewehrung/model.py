"""Einlesen der Biegedaten aus dem Stahlbau- und Architektur-Konverter.

Die Weboberfläche schreibt mit dem Knopf „Biegedaten (JSON) für Python" eine
Datei mit Projektkopf, Vorgaben und allen Betonbauteilen samt ihren
Bewehrungspositionen. Dieses Modul bildet sie auf Datenklassen ab und prüft
die Pflichtangaben, damit Fehler früh und mit klarer Meldung auffallen.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable


class BiegedatenFehler(ValueError):
    """Die Datei ist keine gültige Biegedaten-Datei."""


@dataclass
class Position:
    """Eine Bewehrungsposition eines Bauteils."""

    nr: int
    bezeichnung: str
    biegeform: str
    biegeform_name: str
    ds: int
    anzahl: int
    einzellaenge: float          # m
    gesamtlaenge: float          # m
    masse: float                 # kg
    biegerolle: float            # mm
    biegemasse: dict[str, float] = field(default_factory=dict)
    bemerkung: str = ""

    @classmethod
    def aus_json(cls, d: dict[str, Any], bauteil: str) -> "Position":
        try:
            return cls(
                nr=int(d["nr"]),
                bezeichnung=str(d.get("bezeichnung", "")),
                biegeform=str(d.get("biegeform", "gerade")),
                biegeform_name=str(d.get("biegeformName", d.get("biegeform", "gerade"))),
                ds=int(d["ds_mm"]),
                anzahl=int(d["anzahl"]),
                einzellaenge=float(d["einzellaenge_m"]),
                gesamtlaenge=float(d["gesamtlaenge_m"]),
                masse=float(d["masse_kg"]),
                biegerolle=float(d.get("biegerolle_mm", 0.0)),
                biegemasse={k: float(v) for k, v in (d.get("biegemasse_m") or {}).items()},
                bemerkung=str(d.get("bemerkung", "")),
            )
        except (KeyError, TypeError, ValueError) as fehler:
            raise BiegedatenFehler(
                f"Position in Bauteil {bauteil} unvollständig: {fehler}"
            ) from fehler


@dataclass
class Bauteil:
    """Ein Betonbauteil mit seinen Bewehrungspositionen."""

    pos: str
    art: str
    art_name: str
    anzahl: int
    guete: str
    expositionsklasse: str
    betondeckung_mm: float
    geometrie: dict[str, Any]
    bewehrung: dict[str, Any]
    positionen: list[Position]

    @property
    def volumen(self) -> float:
        """Betonvolumen aller Stücke [m³]."""
        return float(self.geometrie.get("volumen_m3", 0.0)) * max(1, self.anzahl)

    @property
    def stahlmasse(self) -> float:
        """Betonstahlmasse aller Stücke [kg]."""
        return sum(p.masse for p in self.positionen) * max(1, self.anzahl)

    @property
    def bewehrungsgrad(self) -> float:
        """Ist-Bewehrungsgrad [kg/m³]."""
        return self.stahlmasse / self.volumen if self.volumen > 0 else 0.0

    @classmethod
    def aus_json(cls, d: dict[str, Any]) -> "Bauteil":
        pos = str(d.get("pos", "?"))
        beton = d.get("beton") or {}
        return cls(
            pos=pos,
            art=str(d.get("art", "")),
            art_name=str(d.get("artName", d.get("art", ""))),
            anzahl=int(d.get("anzahl", 1) or 1),
            guete=str(beton.get("guete", "C25/30")),
            expositionsklasse=str(beton.get("expositionsklasse", "XC1")),
            betondeckung_mm=float(d.get("betondeckung_mm", 0.0)),
            geometrie=d.get("geometrie") or {},
            bewehrung=d.get("bewehrung") or {},
            positionen=[Position.aus_json(p, pos) for p in (d.get("positionen") or [])],
        )


@dataclass
class Projekt:
    """Vollständige Biegedaten eines Projekts."""

    name: str
    datum: str
    bearbeiter: str
    erstellt: str
    betonstahl: dict[str, Any]
    vorgaben: dict[str, Any]
    bauteile: list[Bauteil]

    @property
    def stahlmasse(self) -> float:
        return sum(b.stahlmasse for b in self.bauteile)

    @property
    def betonvolumen(self) -> float:
        return sum(b.volumen for b in self.bauteile)

    def positionen(self) -> Iterable[tuple[Bauteil, Position]]:
        for bauteil in self.bauteile:
            for position in bauteil.positionen:
                yield bauteil, position

    @classmethod
    def aus_json(cls, d: dict[str, Any]) -> "Projekt":
        if not isinstance(d, dict) or "bauteile" not in d:
            raise BiegedatenFehler(
                "Keine Biegedaten: Es fehlt der Abschnitt 'bauteile'. "
                "Die Datei wird in der Anwendung mit „Biegedaten (JSON) für Python“ erzeugt."
            )
        projekt = d.get("projekt") or {}
        return cls(
            name=str(projekt.get("name", "Projekt")),
            datum=str(projekt.get("datum", "")),
            bearbeiter=str(projekt.get("bearbeiter", "")),
            erstellt=str(d.get("erstellt", "")),
            betonstahl=d.get("betonstahl") or {},
            vorgaben=d.get("vorgaben") or {},
            bauteile=[Bauteil.aus_json(b) for b in d["bauteile"]],
        )

    @classmethod
    def laden(cls, pfad: str | Path) -> "Projekt":
        """Liest eine Biegedaten-Datei ein."""
        pfad = Path(pfad)
        try:
            inhalt = pfad.read_text(encoding="utf-8")
        except OSError as fehler:
            raise BiegedatenFehler(f"Datei {pfad} nicht lesbar: {fehler}") from fehler
        try:
            daten = json.loads(inhalt)
        except json.JSONDecodeError as fehler:
            raise BiegedatenFehler(f"Datei {pfad} ist kein gültiges JSON: {fehler}") from fehler
        return cls.aus_json(daten)
