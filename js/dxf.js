/**
 * DXF-Export: das Modell als Zeichnung für jedes CAD-Programm.
 *
 * DXF ist das offengelegte Austauschformat von AutoCAD und wird von
 * Allplan, ArchiCAD, BricsCAD, Revit, QCAD und LibreCAD gelesen.
 * Geschrieben wird die Fassung R12 (AC1009) im Textformat – die
 * Fassung mit der größten Reichweite: sie kennt nur Linie, Kreis,
 * Polylinie, Text und Dreiecks-/Viereckfläche, und genau diese
 * Bestandteile versteht jedes Programm ohne Nacharbeit.
 *
 * Zwei Ausgaben:
 *   Grundriss – die Bauteile in der Draufsicht, flach in der Ebene z = 0,
 *               je Geschoss auf eigenen Ebenen (BETON_STUETZE_EG)
 *   Modell    – die Körper räumlich als Flächen (3DFACE) an ihrer
 *               wirklichen Höhenlage, Ebenen ohne Geschosszusatz
 *
 * Ebenen (Layer) werden nach Bauteilart gebildet und mit einer festen
 * Farbe belegt. Die Namen halten die Regel der Fassung R12 ein:
 * Großbuchstaben, Ziffern und Unterstrich, höchstens 31 Zeichen.
 *
 * Maßeinheit: Die Zeichnung entsteht wahlweise in Metern oder in
 * Millimetern. Im Hochbau wird in Deutschland meist in Millimetern
 * gezeichnet, im Tiefbau und in Lageplänen in Metern; deshalb ist es
 * eine Festlegung des Anwenders und keine stille Annahme.
 *
 * NICHT enthalten: DWG. Das ist das nicht offengelegte Hausformat von
 * AutoCAD und ohne fremde Programmbibliothek nicht zu schreiben; DXF ist
 * der offene Weg dorthin und wird von AutoCAD verlustfrei geöffnet.
 * Ebenfalls nicht enthalten: Bemaßung, Schraffur, Blöcke, Aussparungen
 * und Öffnungen sowie die Verschneidung der Bauteile untereinander –
 * ausgegeben wird die Rohbaugeometrie der Achsen und Regelabmessungen.
 */

/** Ebene und Farbe je Bauteilart. Die Farbnummern sind die des CAD-Vorrats. */
const DXF_EBENEN = {
  streifenfundament: { ebene: "BETON_FUNDAMENT", farbe: 8 },
  einzelfundament: { ebene: "BETON_FUNDAMENT", farbe: 8 },
  koecherfundament: { ebene: "BETON_FUNDAMENT", farbe: 8 },
  bohrpfahl: { ebene: "BETON_PFAHL", farbe: 9 },
  bodenplatte: { ebene: "BETON_BODENPLATTE", farbe: 8 },
  decke: { ebene: "BETON_DECKE", farbe: 5 },
  wand: { ebene: "BETON_WAND", farbe: 3 },
  kellerwand: { ebene: "BETON_WAND_KELLER", farbe: 3 },
  stuetze: { ebene: "BETON_STUETZE", farbe: 1 },
  stuetze_rund: { ebene: "BETON_STUETZE", farbe: 1 },
  unterzug: { ebene: "BETON_UNTERZUG", farbe: 6 },
  treppe: { ebene: "BETON_TREPPE", farbe: 4 },
  stahlstab: { ebene: "STAHLBAU_STAB", farbe: 30 },
  wand_aussen: { ebene: "ARCH_WAND_AUSSEN", farbe: 2 },
  wand_innen: { ebene: "ARCH_WAND_INNEN", farbe: 2 },
  dach: { ebene: "ARCH_DACH", farbe: 30 },
};

/** Ebene für die Beschriftung. */
const DXF_EBENE_TEXT = { ebene: "TEXT_BEZEICHNUNG", farbe: 7 };

/** Maßeinheiten der Zeichnung: Faktor gegen die Modelleinheit Meter. */
const DXF_EINHEITEN = {
  m: { name: "Meter", faktor: 1, kennung: 6, texthoehe: 0.25 },
  mm: { name: "Millimeter", faktor: 1000, kennung: 4, texthoehe: 0.25 },
};

/** Ebenenname nach der Regel der Fassung R12: A–Z, 0–9, _ und $. */
function dxfEbenenName(text) {
  const ersatz = { "Ä": "AE", "Ö": "OE", "Ü": "UE", "ä": "AE", "ö": "OE", "ü": "UE", "ß": "SS" };
  let name = "";
  for (const z of String(text || "")) name += ersatz[z] !== undefined ? ersatz[z] : z;
  name = name.toUpperCase().replace(/[^A-Z0-9_$-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  return (name || "SONSTIGE").slice(0, 31);
}

/** Kurzzeichen eines Geschosses für den Ebenennamen: EG, 1OG, 2UG. */
function dxfGeschossKurz(name) {
  const text = String(name || "");
  if (/^Erdgeschoss/.test(text)) return "EG";
  const og = text.match(/^(\d+)\.\s*Obergeschoss/);
  if (og) return `${og[1]}OG`;
  const ug = text.match(/^(\d+)\.\s*Untergeschoss/);
  if (ug) return `${ug[1]}UG`;
  return dxfEbenenName(text).slice(0, 8);
}

/** Zahl in der Schreibweise der DXF-Datei: Punkt als Dezimalzeichen. */
function dxfZahl(wert) {
  const w = Number.isFinite(wert) ? wert : 0;
  return (Math.abs(w) < 1e-9 ? 0 : w).toFixed(6);
}

/**
 * Schreibt die Gruppen einer DXF-Datei.
 *
 * Eine DXF-Datei besteht aus Paaren: eine Zeile Gruppencode, eine Zeile
 * Wert. Die Klasse sammelt die Zeichenelemente, führt die benutzten Ebenen
 * mit und bestimmt nebenbei die Ausdehnung der Zeichnung.
 */
class DxfDatei {
  constructor(faktor) {
    this.faktor = faktor || 1;
    this.zeilen = [];
    this.ebenen = new Map();
    this.min = { x: Infinity, y: Infinity, z: Infinity };
    this.max = { x: -Infinity, y: -Infinity, z: -Infinity };
    this.anzahl = 0;
  }

  /** Ein Paar aus Gruppencode und Wert anhängen. */
  paar(code, wert) {
    this.zeilen.push(String(code), String(wert));
    return this;
  }

  /** Ebene anmelden; jede Ebene erscheint genau einmal in der Tabelle. */
  ebene(name, farbe) {
    const rein = dxfEbenenName(name);
    if (!this.ebenen.has(rein)) this.ebenen.set(rein, farbe === undefined ? 7 : farbe);
    return rein;
  }

  /** Punkt in Zeicheneinheiten umrechnen und in die Ausdehnung aufnehmen. */
  punkt(p) {
    const q = { x: p.x * this.faktor, y: p.y * this.faktor, z: (p.z || 0) * this.faktor };
    ["x", "y", "z"].forEach((a) => {
      if (q[a] < this.min[a]) this.min[a] = q[a];
      if (q[a] > this.max[a]) this.max[a] = q[a];
    });
    return q;
  }

  /** Punkt mit den Gruppencodes 10/20/30, 11/21/31 … schreiben. */
  koordinaten(versatz, p) {
    const q = this.punkt(p);
    this.paar(10 + versatz, dxfZahl(q.x));
    this.paar(20 + versatz, dxfZahl(q.y));
    this.paar(30 + versatz, dxfZahl(q.z));
  }

  /** Gerade Linie. */
  linie(ebene, farbe, a, b) {
    const e = this.ebene(ebene, farbe);
    this.paar(0, "LINE").paar(8, e);
    this.koordinaten(0, a);
    this.koordinaten(1, b);
    this.anzahl += 1;
  }

  /** Polylinie; geschlossen für Umrisse. */
  polylinie(ebene, farbe, punkte, geschlossen) {
    const e = this.ebene(ebene, farbe);
    this.paar(0, "POLYLINE").paar(8, e).paar(66, 1).paar(70, geschlossen ? 1 : 0);
    // Der Startpunkt der Polylinie selbst wird nach der Festlegung des
    // Formats mit Null belegt; maßgebend sind die Stützpunkte.
    this.paar(10, dxfZahl(0)).paar(20, dxfZahl(0)).paar(30, dxfZahl(0));
    punkte.forEach((p) => {
      this.paar(0, "VERTEX").paar(8, e);
      this.koordinaten(0, p);
    });
    this.paar(0, "SEQEND").paar(8, e);
    this.anzahl += 1;
  }

  /** Kreis in waagerechter Ebene. */
  kreis(ebene, farbe, mitte, halbmesser) {
    const e = this.ebene(ebene, farbe);
    this.paar(0, "CIRCLE").paar(8, e);
    this.koordinaten(0, mitte);
    this.paar(40, dxfZahl(halbmesser * this.faktor));
    this.anzahl += 1;
  }

  /** Beschriftung, mittig auf den Punkt gesetzt. */
  text(ebene, farbe, punkt, hoehe, inhalt, drehung) {
    const e = this.ebene(ebene, farbe);
    this.paar(0, "TEXT").paar(8, e);
    this.koordinaten(0, punkt);
    this.paar(40, dxfZahl(hoehe * this.faktor));
    // Sonderzeichen bleiben erhalten; Steuerzeichen und Zeilenumbrüche nicht
    this.paar(1, String(inhalt).replace(/[\r\n]+/g, " "));
    this.paar(50, dxfZahl(drehung || 0));
    this.paar(72, 1).paar(73, 2);   // waagerecht und lotrecht mittig
    this.koordinaten(1, punkt);
    this.anzahl += 1;
  }

  /** Fläche aus drei oder vier Punkten (3DFACE). */
  flaeche(ebene, farbe, p1, p2, p3, p4) {
    const e = this.ebene(ebene, farbe);
    this.paar(0, "3DFACE").paar(8, e);
    this.koordinaten(0, p1);
    this.koordinaten(1, p2);
    this.koordinaten(2, p3);
    this.koordinaten(3, p4 || p3);   // Dreieck: vierter Punkt wie der dritte
    this.anzahl += 1;
  }

  /** Kopf, Ebenentabelle und Zeichenelemente zusammensetzen. */
  fertig(einheit) {
    const leer = !Number.isFinite(this.min.x);
    const min = leer ? { x: 0, y: 0, z: 0 } : this.min;
    const max = leer ? { x: 0, y: 0, z: 0 } : this.max;
    const kopf = [];
    const paar = (c, w) => kopf.push(String(c), String(w));
    paar(0, "SECTION"); paar(2, "HEADER");
    paar(9, "$ACADVER"); paar(1, "AC1009");
    paar(9, "$INSBASE"); paar(10, dxfZahl(0)); paar(20, dxfZahl(0)); paar(30, dxfZahl(0));
    paar(9, "$EXTMIN"); paar(10, dxfZahl(min.x)); paar(20, dxfZahl(min.y)); paar(30, dxfZahl(min.z));
    paar(9, "$EXTMAX"); paar(10, dxfZahl(max.x)); paar(20, dxfZahl(max.y)); paar(30, dxfZahl(max.z));
    paar(9, "$LIMMIN"); paar(10, dxfZahl(min.x)); paar(20, dxfZahl(min.y));
    paar(9, "$LIMMAX"); paar(10, dxfZahl(max.x)); paar(20, dxfZahl(max.y));
    paar(9, "$LUNITS"); paar(70, 2);        // dezimale Längenangabe
    paar(9, "$LUPREC"); paar(70, 4);
    paar(9, "$INSUNITS"); paar(70, einheit.kennung);
    paar(9, "$LTSCALE"); paar(40, dxfZahl(einheit.faktor));
    paar(0, "ENDSEC");

    // ---- Tabellen: Linienart und Ebenen
    const tab = [];
    const tpaar = (c, w) => tab.push(String(c), String(w));
    tpaar(0, "SECTION"); tpaar(2, "TABLES");
    tpaar(0, "TABLE"); tpaar(2, "LTYPE"); tpaar(70, 1);
    tpaar(0, "LTYPE"); tpaar(2, "CONTINUOUS"); tpaar(70, 0);
    tpaar(3, "Durchgezogen"); tpaar(72, 65); tpaar(73, 0); tpaar(40, dxfZahl(0));
    tpaar(0, "ENDTAB");
    const namen = Array.from(this.ebenen.keys()).sort();
    tpaar(0, "TABLE"); tpaar(2, "LAYER"); tpaar(70, namen.length + 1);
    tpaar(0, "LAYER"); tpaar(2, "0"); tpaar(70, 0); tpaar(62, 7); tpaar(6, "CONTINUOUS");
    namen.forEach((n) => {
      tpaar(0, "LAYER"); tpaar(2, n); tpaar(70, 0);
      tpaar(62, this.ebenen.get(n)); tpaar(6, "CONTINUOUS");
    });
    tpaar(0, "ENDTAB");
    tpaar(0, "ENDSEC");

    return kopf
      .concat(tab)
      .concat(["0", "SECTION", "2", "ENTITIES"])
      .concat(this.zeilen)
      .concat(["0", "ENDSEC", "0", "EOF", ""])
      .join("\r\n");
  }
}

/** Ecken eines Bauteils im Grundriss (Rechteck) bzw. null beim Kreis. */
function dxfGrundrissEcken(bauteil) {
  const k = bauteil.koerper || {};
  const lage = bauteil.lage || { x: 0, y: 0, z: 0, drehung: 0 };
  if (k.art === "kreis") return null;
  return kollisionEcken(lage, k.laenge || 0.1, k.breite || 0.1);
}

/**
 * Eckpunkte des Körpers im Raum: acht Punkte, unten vier und oben vier.
 *
 * Bauteile mit eigener Achse – die Stäbe des Stahlbaus – werden entlang
 * ihrer Achse aufgebaut: die Achse liefert die Längsrichtung, dazu kommen
 * zwei dazu senkrechte Richtungen für die Breite und die Höhe des Profils.
 * Dieselbe Regel gilt in der IFC-Ausgabe, damit beide Dateien denselben
 * Körper beschreiben.
 */
function dxfKoerperPunkte(bauteil) {
  const k = bauteil.koerper || {};
  const lage = bauteil.lage || { x: 0, y: 0, z: 0, drehung: 0 };

  if (k.achse && k.start) {
    const a = k.achse;
    const l = Math.hypot(a.x, a.y, a.z) || 1;
    const ux = a.x / l, uy = a.y / l, uz = a.z / l;
    // Hilfsrichtung, die nicht parallel zur Achse liegt
    const hx = Math.abs(uz) < 0.9 ? 0 : 1, hz = Math.abs(uz) < 0.9 ? 1 : 0;
    const s = hx * ux + hz * uz;
    let rx = hx - s * ux, ry = 0 - s * uy, rz = hz - s * uz;
    const rl = Math.hypot(rx, ry, rz) || 1;
    rx /= rl; ry /= rl; rz /= rl;
    // dritte Richtung als Kreuzprodukt
    const sx = uy * rz - uz * ry, sy = uz * rx - ux * rz, sz = ux * ry - uy * rx;
    const b = ((k.querschnitt && k.querschnitt.b) || k.breite || 0.1) / 2;
    const h = ((k.querschnitt && k.querschnitt.h) || k.hoehe || 0.1) / 2;
    const laenge = k.achslaenge || l;
    const ecke = (t, vb, vh) => ({
      x: k.start.x + ux * t + rx * vb * b + sx * vh * h,
      y: k.start.y + uy * t + ry * vb * b + sy * vh * h,
      z: k.start.z + uz * t + rz * vb * b + sz * vh * h,
    });
    return {
      art: "quader",
      unten: [ecke(0, -1, -1), ecke(0, 1, -1), ecke(0, 1, 1), ecke(0, -1, 1)],
      oben: [ecke(laenge, -1, -1), ecke(laenge, 1, -1), ecke(laenge, 1, 1), ecke(laenge, -1, 1)],
    };
  }

  const uk = lage.z;
  const ok = lage.z + (k.hoehe || 0.01);
  if (k.art === "kreis") {
    const r = (k.durchmesser || 0.1) / 2;
    const n = 16;
    const ring = (z) => {
      const punkte = [];
      for (let i = 0; i < n; i++) {
        const w = (2 * Math.PI * i) / n;
        punkte.push({ x: lage.x + r * Math.cos(w), y: lage.y + r * Math.sin(w), z });
      }
      return punkte;
    };
    return { art: "zylinder", mitte: { x: lage.x, y: lage.y }, unten: ring(uk), oben: ring(ok) };
  }

  const ecken = kollisionEcken(lage, k.laenge || 0.1, k.breite || 0.1);
  return {
    art: "quader",
    unten: ecken.map((p) => ({ x: p.x, y: p.y, z: uk })),
    oben: ecken.map((p) => ({ x: p.x, y: p.y, z: ok })),
  };
}

/**
 * Das Modell als DXF-Zeichnung.
 *
 * @param {Object} daten
 *   projekt   – { name, bearbeiter } für die Beschriftung
 *   bauteile  – dieselbe Liste wie für IFC und Kollisionsprüfung
 *   modus     – "grundriss" (flach, je Geschoss eine Ebene) oder "modell" (räumlich)
 *   einheit   – "m" oder "mm"
 *   text      – Bezeichnungen mit ausgeben (Voreinstellung ja)
 * @returns {string} Inhalt der DXF-Datei
 */
function dxfExport(daten) {
  const bauteile = daten.bauteile || [];
  const modus = daten.modus === "modell" ? "modell" : "grundriss";
  const einheit = DXF_EINHEITEN[daten.einheit] || DXF_EINHEITEN.m;
  const mitText = daten.text === undefined ? true : !!daten.text;
  const d = new DxfDatei(einheit.faktor);

  bauteile.forEach((b) => {
    const zuordnung = DXF_EBENEN[b.kind] || { ebene: "SONSTIGE", farbe: 7 };
    const lage = b.lage || { x: 0, y: 0, z: 0, drehung: 0 };

    if (modus === "grundriss") {
      // Draufsicht, flach in der Ebene z = 0; die Geschosse trennen die Ebenen
      const ebene = `${zuordnung.ebene}_${dxfGeschossKurz(b.geschoss)}`;
      const k = b.koerper || {};
      if (k.art === "kreis") {
        d.kreis(ebene, zuordnung.farbe, { x: lage.x, y: lage.y, z: 0 }, (k.durchmesser || 0.1) / 2);
      } else {
        const ecken = dxfGrundrissEcken(b).map((p) => ({ x: p.x, y: p.y, z: 0 }));
        d.polylinie(ebene, zuordnung.farbe, ecken, true);
      }
      if (mitText) {
        d.text(`${DXF_EBENE_TEXT.ebene}_${dxfGeschossKurz(b.geschoss)}`, DXF_EBENE_TEXT.farbe,
          { x: lage.x, y: lage.y, z: 0 }, einheit.texthoehe, b.bezeichnung,
          // Beschriftung liegt in der Längsrichtung des Bauteils, aber nie
          // auf dem Kopf: Winkel über 90° werden um 180° gedreht
          ((lage.drehung || 0) % 360 + 360) % 360 > 90
            && ((lage.drehung || 0) % 360 + 360) % 360 < 270
            ? (lage.drehung || 0) + 180 : (lage.drehung || 0));
      }
      return;
    }

    // Räumlich: die Begrenzungsflächen des Körpers
    const p = dxfKoerperPunkte(b);
    const ebene = zuordnung.ebene;
    const u = p.unten, o = p.oben;
    for (let i = 0; i < u.length; i++) {
      const j = (i + 1) % u.length;
      d.flaeche(ebene, zuordnung.farbe, u[i], u[j], o[j], o[i]);
    }
    if (p.art === "quader") {
      d.flaeche(ebene, zuordnung.farbe, u[0], u[1], u[2], u[3]);
      d.flaeche(ebene, zuordnung.farbe, o[0], o[1], o[2], o[3]);
    } else {
      // Deckel des Zylinders als Dreiecke um die Mitte
      const mu = { x: p.mitte.x, y: p.mitte.y, z: u[0].z };
      const mo = { x: p.mitte.x, y: p.mitte.y, z: o[0].z };
      for (let i = 0; i < u.length; i++) {
        const j = (i + 1) % u.length;
        d.flaeche(ebene, zuordnung.farbe, mu, u[i], u[j]);
        d.flaeche(ebene, zuordnung.farbe, mo, o[i], o[j]);
      }
    }
    if (mitText) {
      d.text(DXF_EBENE_TEXT.ebene, DXF_EBENE_TEXT.farbe,
        { x: lage.x, y: lage.y, z: lage.z + (b.koerper.hoehe || 0) + einheit.texthoehe },
        einheit.texthoehe, b.bezeichnung, 0);
    }
  });

  return d.fertig(einheit);
}

/** Kurzbericht der Ausgabe für die Statuszeile. */
function dxfBericht(inhalt, bauteile, modus, einheit) {
  const zeilen = inhalt.split("\r\n");
  const zaehle = (name) => {
    let n = 0;
    for (let i = 0; i < zeilen.length - 1; i++) {
      if (zeilen[i] === "0" && zeilen[i + 1] === name) n += 1;
    }
    return n;
  };
  const ebenen = zaehle("LAYER") - 1;   // die Ebene 0 gehört immer dazu
  return {
    elemente: zaehle("POLYLINE") + zaehle("CIRCLE") + zaehle("LINE")
      + zaehle("TEXT") + zaehle("3DFACE"),
    flaechen: zaehle("3DFACE"),
    ebenen,
    bauteile: bauteile.length,
    modus: modus === "modell" ? "Modell (räumlich)" : "Grundriss (flach)",
    einheit: (DXF_EINHEITEN[einheit] || DXF_EINHEITEN.m).name,
    groesse: inhalt.length,
  };
}
