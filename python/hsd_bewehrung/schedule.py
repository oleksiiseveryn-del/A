"""Biegeliste, Stahlauszug, Schneidplan und Prüfung der Biegedaten.

Aus den Bewehrungspositionen entstehen die Unterlagen, die die Biegerei und
die Baustelle brauchen:

* **Biegeliste** je Bauteil und Position mit Biegeform, Biegemaßen,
  Einzellänge, Stückzahl und Masse (Grundlage der Bestellung),
* **Stahlauszug** nach Durchmessern für Bestellung und Abrechnung,
* **Schneidplan** je Durchmesser aus Lagerlängen mit Verschnitt,
* **Etiketten** je Position für die Bündelkennzeichnung,
* **Prüfung**, ob Massen und Längen der Datei in sich stimmen.

Der Schneidplan verwendet First-Fit-Decreasing: die längsten Stäbe zuerst,
jeder in die erste Stange, in die er noch passt. Das Verfahren ist einfach,
nachvollziehbar und in der Praxis nah am Optimum; es ersetzt keine
Bestellabstimmung mit dem Biegebetrieb.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .model import Bauteil, Position, Projekt
from .norms import biegerollen_durchmesser, stab_flaeche, stab_masse


@dataclass
class Biegezeile:
    """Eine Zeile der Biegeliste."""

    bauteil: str
    bauteil_art: str
    pos: int
    bezeichnung: str
    biegeform: str
    biegeform_name: str
    ds: int
    anzahl: int                # Stück einschließlich Bauteil-Stückzahl
    einzellaenge: float        # m
    gesamtlaenge: float        # m
    masse: float               # kg
    biegerolle: float          # mm
    biegemasse: dict[str, float]
    bemerkung: str

    @property
    def kennung(self) -> str:
        """Eindeutige Kennung für Etikett und Bündel."""
        return f"{self.bauteil}-{self.pos}"

    @property
    def biegemass_text(self) -> str:
        """Biegemaße in Zentimetern als Text, z. B. ``b 25 × h 25``."""
        namen = {"laenge": "l", "b": "b", "h": "h", "d": "⌀", "steigung": "s", "schenkel": "a"}
        teile = [
            f"{namen.get(k, k)} {v * 100:.0f}"
            for k, v in self.biegemasse.items()
            if isinstance(v, (int, float)) and v > 0
        ]
        return " × ".join(teile) if teile else "–"


def biegeliste(projekt: Projekt) -> list[Biegezeile]:
    """Biegeliste über alle Bauteile, Stückzahl der Bauteile eingerechnet."""
    zeilen: list[Biegezeile] = []
    for bauteil, position in projekt.positionen():
        faktor = max(1, bauteil.anzahl)
        anzahl = position.anzahl * faktor
        gesamtlaenge = anzahl * position.einzellaenge
        zeilen.append(
            Biegezeile(
                bauteil=bauteil.pos,
                bauteil_art=bauteil.art_name,
                pos=position.nr,
                bezeichnung=position.bezeichnung,
                biegeform=position.biegeform,
                biegeform_name=position.biegeform_name,
                ds=position.ds,
                anzahl=anzahl,
                einzellaenge=position.einzellaenge,
                gesamtlaenge=gesamtlaenge,
                masse=gesamtlaenge * stab_masse(position.ds),
                biegerolle=position.biegerolle or biegerollen_durchmesser(position.ds),
                biegemasse=position.biegemasse,
                bemerkung=position.bemerkung,
            )
        )
    return zeilen


@dataclass
class Auszugszeile:
    """Eine Zeile des Stahlauszugs."""

    ds: int
    stueck: int
    laenge: float              # m
    masse: float               # kg

    @property
    def querschnitt(self) -> float:
        """Nennquerschnitt eines Stabes [cm²]."""
        return stab_flaeche(self.ds)

    @property
    def masse_je_meter(self) -> float:
        return stab_masse(self.ds)


def stahlauszug(zeilen: list[Biegezeile]) -> list[Auszugszeile]:
    """Zusammenstellung nach Durchmessern, aufsteigend sortiert."""
    je_ds: dict[int, Auszugszeile] = {}
    for zeile in zeilen:
        eintrag = je_ds.setdefault(zeile.ds, Auszugszeile(ds=zeile.ds, stueck=0, laenge=0.0, masse=0.0))
        eintrag.stueck += zeile.anzahl
        eintrag.laenge += zeile.gesamtlaenge
        eintrag.masse += zeile.masse
    return [je_ds[ds] for ds in sorted(je_ds)]


@dataclass
class Stange:
    """Eine Lagerlänge mit den daraus geschnittenen Stäben."""

    laenge: float
    schnitte: list[tuple[str, float]] = field(default_factory=list)

    @property
    def belegt(self) -> float:
        return sum(l for _, l in self.schnitte)

    @property
    def rest(self) -> float:
        return self.laenge - self.belegt

    @property
    def auslastung(self) -> float:
        return self.belegt / self.laenge if self.laenge > 0 else 0.0


@dataclass
class Schneidplan:
    """Schneidplan eines Durchmessers.

    ``sonder`` enthält Stäbe, die nicht aus Lagerlängen geschnitten werden:
    Wendeln als Ringmaterial und Einzelstäbe über der Lagerlänge.
    """

    ds: int
    lagerlaenge: float
    stangen: list[Stange]
    sonder: list[tuple[str, float]] = field(default_factory=list)

    @property
    def anzahl_stangen(self) -> int:
        return len(self.stangen)

    @property
    def eingesetzt(self) -> float:
        """Tatsächlich eingesetzte Stangenlänge [m]."""
        return sum(s.laenge for s in self.stangen)

    @property
    def sonderlaenge(self) -> float:
        return sum(l for _, l in self.sonder)

    @property
    def verwendet(self) -> float:
        return sum(s.belegt for s in self.stangen)

    @property
    def verschnitt(self) -> float:
        return self.eingesetzt - self.verwendet

    @property
    def verschnitt_anteil(self) -> float:
        return self.verschnitt / self.eingesetzt if self.eingesetzt > 0 else 0.0

    @property
    def masse(self) -> float:
        """Zu bestellende Masse aus Stangen und Sonderlängen [kg]."""
        return (self.eingesetzt + self.sonderlaenge) * stab_masse(self.ds)


def schneidplan(zeilen: list[Biegezeile], lagerlaenge: float = 12.0,
                saegeschnitt_mm: float = 0.0) -> list[Schneidplan]:
    """Schneidpläne je Durchmesser nach First-Fit-Decreasing.

    :param lagerlaenge: verfügbare Stangenlänge [m]
    :param saegeschnitt_mm: Schnittbreite je Schnitt [mm], wird jedem Stab
        zugeschlagen
    """
    if lagerlaenge <= 0:
        raise ValueError("Die Lagerlänge muss größer als null sein.")
    zugabe = max(0.0, saegeschnitt_mm) / 1000.0

    je_ds: dict[int, list[tuple[str, float]]] = {}
    sonder: dict[int, list[tuple[str, float]]] = {}
    for zeile in zeilen:
        laenge = zeile.einzellaenge + zugabe
        stuecke = [(zeile.kennung, laenge)] * zeile.anzahl
        # Wendeln kommen als Ringmaterial, überlange Staebe passen in keine
        # Lagerlaenge; beide werden gesondert bestellt statt geschnitten.
        if zeile.biegeform == "wendel" or laenge > lagerlaenge + 1e-9:
            sonder.setdefault(zeile.ds, []).extend(stuecke)
        else:
            je_ds.setdefault(zeile.ds, []).extend(stuecke)

    plaene: list[Schneidplan] = []
    for ds in sorted(set(je_ds) | set(sonder)):
        stuecke = sorted(je_ds.get(ds, []), key=lambda s: s[1], reverse=True)
        stangen: list[Stange] = []
        for kennung, laenge in stuecke:
            for stange in stangen:
                if stange.rest + 1e-9 >= laenge:
                    stange.schnitte.append((kennung, laenge))
                    break
            else:
                neue = Stange(laenge=lagerlaenge)
                neue.schnitte.append((kennung, laenge))
                stangen.append(neue)
        plaene.append(Schneidplan(ds=ds, lagerlaenge=lagerlaenge, stangen=stangen,
                                  sonder=sorted(sonder.get(ds, []), key=lambda s: s[1], reverse=True)))
    return plaene


@dataclass
class Etikett:
    """Bündeletikett für die Biegerei."""

    projekt: str
    kennung: str
    bauteil: str
    bezeichnung: str
    ds: int
    anzahl: int
    laenge: float
    biegeform: str
    biegerolle: float
    stahlsorte: str

    def als_text(self) -> str:
        return (
            f"{self.projekt} | {self.kennung} | {self.bauteil} · {self.bezeichnung}\n"
            f"{self.anzahl} Stk ⌀{self.ds} {self.stahlsorte} · l = {self.laenge:.2f} m\n"
            f"{self.biegeform} · Biegerolle D = {self.biegerolle:.0f} mm"
        )


def etiketten(projekt: Projekt, zeilen: list[Biegezeile]) -> list[Etikett]:
    """Ein Etikett je Biegezeile."""
    sorte = str(projekt.betonstahl.get("sorte", "B500B"))
    return [
        Etikett(
            projekt=projekt.name, kennung=z.kennung, bauteil=z.bauteil,
            bezeichnung=z.bezeichnung, ds=z.ds, anzahl=z.anzahl, laenge=z.einzellaenge,
            biegeform=z.biegeform_name, biegerolle=z.biegerolle, stahlsorte=sorte,
        )
        for z in zeilen
    ]


def pruefe(projekt: Projekt, toleranz: float = 0.01) -> list[str]:
    """Prüft die Datei auf innere Widersprüche.

    Gemeldet werden Abweichungen zwischen Gesamtlänge und Anzahl × Einzellänge,
    zwischen Masse und Länge × Masse je Meter, unplausible Durchmesser sowie
    Stäbe, die länger als die angegebene Lieferlänge sind.
    """
    meldungen: list[str] = []
    lieferlaenge = float(projekt.vorgaben.get("lieferlaenge_m", 0) or 0)

    for bauteil, position in projekt.positionen():
        kennung = f"{bauteil.pos}-{position.nr}"
        soll_laenge = position.anzahl * position.einzellaenge
        if abs(soll_laenge - position.gesamtlaenge) > max(toleranz, toleranz * soll_laenge):
            meldungen.append(
                f"{kennung}: Gesamtlänge {position.gesamtlaenge:.3f} m weicht von "
                f"{position.anzahl} × {position.einzellaenge:.3f} m = {soll_laenge:.3f} m ab."
            )
        soll_masse = position.gesamtlaenge * stab_masse(position.ds)
        if abs(soll_masse - position.masse) > max(toleranz, toleranz * soll_masse):
            meldungen.append(
                f"{kennung}: Masse {position.masse:.2f} kg weicht von {soll_masse:.2f} kg "
                f"(Länge × {stab_masse(position.ds):.3f} kg/m) ab."
            )
        if position.ds <= 0:
            meldungen.append(f"{kennung}: unzulässiger Stabdurchmesser {position.ds}.")
        if lieferlaenge > 0 and position.biegeform != "wendel" and position.einzellaenge > lieferlaenge + toleranz:
            meldungen.append(
                f"{kennung}: Einzellänge {position.einzellaenge:.2f} m über der Lieferlänge "
                f"{lieferlaenge:.2f} m – Stoß vorsehen."
            )
    return meldungen
