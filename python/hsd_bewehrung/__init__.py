"""hsd_bewehrung – Bewehrung, Biegeliste und Herstellungsunterlagen.

Werkzeug der HSD Hamburg GmbH zur Weiterverarbeitung der Biegedaten aus dem
Stahlbau- und Architektur-Konverter: Biegeliste, Stahlauszug, Schneidplan,
Bestellliste, Bündeletiketten und die Prüfung der Daten.

Aufruf:
    python -m hsd_bewehrung Biegedaten_Projekt.json --ordner ausgabe
"""

from .model import Bauteil, BiegedatenFehler, Position, Projekt
from .generator import Vorschlag, automatische_bewehrung
from .schedule import (
    Biegezeile,
    Schneidplan,
    biegeliste,
    etiketten,
    pruefe,
    schneidplan,
    stahlauszug,
)
from .export import alles_ausgeben

__all__ = [
    "Bauteil", "BiegedatenFehler", "Position", "Projekt",
    "Vorschlag", "automatische_bewehrung",
    "Biegezeile", "Schneidplan", "biegeliste", "etiketten", "pruefe",
    "schneidplan", "stahlauszug", "alles_ausgeben",
]

__version__ = "1.0.0"
