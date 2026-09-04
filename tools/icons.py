#!/usr/bin/env python3
"""Erzeugt die App-Symbole (PNG) für den Home-Bildschirm und den Web-App-Manifest.

Reine Standardbibliothek – kein Bildpaket nötig. Gezeichnet wird ein
Doppel-T-Profil in Weiß auf dem Blau der HSD Hamburg GmbH mit dem gelben
Band der Kopfzeile.

Aufruf:  python3 tools/icons.py
"""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

BLAU = (15, 36, 56)        # --hsd-blue  #0f2438
BLAU_HELL = (23, 57, 90)   # --hsd-blue-light  #17395a
GELB = (255, 176, 32)      # --accent  #ffb020
WEISS = (255, 255, 255)

WURZEL = Path(__file__).resolve().parents[1]


def png_schreiben(pfad: Path, breite: int, hoehe: int,
                  pixel: list[list[tuple[int, int, int]]], alpha: bool = False) -> None:
    """Schreibt ein PNG (8 bit, Filtertyp 0) ohne Fremdpakete.

    :param alpha: True schreibt RGBA (Farbtyp 6) mit voller Deckkraft –
        das Format, das Windows in ICO-Dateien erwartet.
    """
    roh = bytearray()
    for zeile in pixel:
        roh.append(0)                      # Filtertyp „None“ je Zeile
        for r, g, b in zeile:
            roh += bytes((r, g, b, 255)) if alpha else bytes((r, g, b))

    def block(kennung: bytes, daten: bytes) -> bytes:
        return (struct.pack(">I", len(daten)) + kennung + daten
                + struct.pack(">I", zlib.crc32(kennung + daten) & 0xFFFFFFFF))

    kopf = struct.pack(">IIBBBBB", breite, hoehe, 8, 6 if alpha else 2, 0, 0, 0)
    pfad.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + block(b"IHDR", kopf)
        + block(b"IDAT", zlib.compress(bytes(roh), 9))
        + block(b"IEND", b"")
    )


def symbol(groesse: int, sicherheitsrand: float = 0.0) -> list[list[tuple[int, int, int]]]:
    """Doppel-T-Profil auf blauem Grund.

    :param sicherheitsrand: Anteil des Randes, der bei maskierbaren Symbolen
        vom Betriebssystem beschnitten werden darf (0,1 = 10 % je Seite)
    """
    n = groesse
    bild = [[BLAU for _ in range(n)] for _ in range(n)]

    # Verlauf nach unten hin etwas heller, damit das Symbol Tiefe bekommt
    for y in range(n):
        anteil = y / max(n - 1, 1)
        farbe = tuple(round(BLAU[i] + (BLAU_HELL[i] - BLAU[i]) * anteil) for i in range(3))
        for x in range(n):
            bild[y][x] = farbe

    # Zeichenfeld innerhalb des Sicherheitsrandes
    rand = sicherheitsrand * n
    feld = n - 2 * rand

    def rechteck(x0: float, y0: float, x1: float, y1: float, farbe: tuple[int, int, int]) -> None:
        for y in range(max(int(y0), 0), min(int(round(y1)), n)):
            for x in range(max(int(x0), 0), min(int(round(x1)), n)):
                bild[y][x] = farbe

    # Doppel-T-Profil: zwei Flansche und ein Steg, Maße wie ein IPE
    mitte = n / 2
    profil_b = feld * 0.46          # Flanschbreite
    profil_h = feld * 0.50          # Profilhöhe
    flansch = profil_h * 0.17
    steg = profil_b * 0.20
    abstand = feld * 0.11           # Luft zwischen Profil und Band
    band_h = feld * 0.075
    # Profil und Band als eine Gruppe mittig stellen
    oben = mitte - (profil_h + abstand + band_h) / 2

    rechteck(mitte - profil_b / 2, oben, mitte + profil_b / 2, oben + flansch, WEISS)
    rechteck(mitte - steg / 2, oben + flansch, mitte + steg / 2, oben + profil_h - flansch, WEISS)
    rechteck(mitte - profil_b / 2, oben + profil_h - flansch, mitte + profil_b / 2, oben + profil_h, WEISS)

    # Gelbes Band unter dem Profil – die Kopfzeile der Anwendung
    band_y = oben + profil_h + abstand
    rechteck(mitte - profil_b / 2, band_y, mitte + profil_b / 2, band_y + band_h, GELB)

    return bild


def ico_schreiben(pfad: Path, groessen: list[int]) -> None:
    """Schreibt ein Windows-Symbol (.ico) mit eingebetteten PNG-Bildern.

    Windows Vista und neuer liest PNG-Daten in ICO-Verzeichniseintraegen;
    damit bleiben auch 256 x 256 Pixel klein. Groesse 256 wird im
    Verzeichnis als 0 eingetragen, so schreibt es das Format vor.
    """
    bilder = []
    for g in groessen:
        daten = bytearray()
        png = Path(str(pfad) + f".{g}.tmp")
        png_schreiben(png, g, g, symbol(g), alpha=True)
        daten += png.read_bytes()
        png.unlink()
        bilder.append((g, bytes(daten)))

    kopf = struct.pack("<HHH", 0, 1, len(bilder))
    versatz = len(kopf) + 16 * len(bilder)
    verzeichnis = b""
    inhalt = b""
    for g, daten in bilder:
        verzeichnis += struct.pack(
            "<BBBBHHII",
            0 if g >= 256 else g,      # Breite (0 = 256)
            0 if g >= 256 else g,      # Hoehe
            0,                          # Farben in der Palette
            0,                          # reserviert
            1,                          # Farbebenen
            32,                         # Bit je Bildpunkt
            len(daten), versatz,
        )
        inhalt += daten
        versatz += len(daten)
    pfad.write_bytes(kopf + verzeichnis + inhalt)


def main() -> None:
    ordner = WURZEL / "icons"
    ordner.mkdir(exist_ok=True)
    for name, groesse, rand in [
        ("icon-192.png", 192, 0.0),
        ("icon-512.png", 512, 0.0),
        # maskierbar: Inhalt bleibt im mittleren Bereich, den kein Gerät beschneidet
        ("icon-maskable-512.png", 512, 0.10),
        # iOS legt eigene abgerundete Ecken an und verträgt keine Transparenz
        ("apple-touch-icon.png", 180, 0.0),
    ]:
        png_schreiben(ordner / name, groesse, groesse, symbol(groesse, rand))
        print(f"{name}: {(ordner / name).stat().st_size} Byte")

    # Windows-Symbol fuer die Anwendung und den Installer
    ico = ordner / "icon.ico"
    ico_schreiben(ico, [16, 24, 32, 48, 64, 128, 256])
    print(f"icon.ico: {ico.stat().st_size} Byte")


if __name__ == "__main__":
    main()
