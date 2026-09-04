/**
 * Betonbauteile: Mengen, Betondeckung und Kosten.
 *
 * Geführt werden die Mengenermittlung (Betonvolumen, Schalungsfläche,
 * Bewehrungsmasse aus dem Bewehrungsgrad, Aushub mit Arbeitsraum), die
 * Betondeckung nach DIN EN 1992-1-1 mit Nationalem Anhang sowie die
 * Kennwerte der Betonfestigkeitsklasse nach DIN EN 1992-1-1, Tab. 3.1.
 *
 * NICHT geführt werden die Nachweise nach DIN EN 1992-1-1: Biegung mit
 * Längskraft, Querkraft, Durchstanzen, Torsion, Knicknachweis schlanker
 * Stützen, Rissbreiten und Verformungen, Verankerungs- und Stoßlängen.
 * Für Bohrpfähle sind Herstellung nach DIN EN 1536 und der Nachweis der
 * Tragfähigkeit nach DIN EN 1997-1 mit DIN 1054 und EA-Pfähle zu führen.
 * Der Bewehrungsgrad ist ein Erfahrungswert für die Kostenschätzung und
 * ersetzt keine Bewehrungsermittlung.
 */

/** Rohdichte von Stahlbeton nach DIN EN 1991-1-1 Anhang A: 25 kN/m³. */
const STAHLBETON_DICHTE = 2500; // kg/m³

/** Mindestbreite des Arbeitsraums nach DIN 4124 Abs. 4.2: 0,50 m. */
const ARBEITSRAUM_DIN4124 = 0.5;

/**
 * Betonfestigkeitsklassen nach DIN EN 1992-1-1, Tab. 3.1 (Normalbeton).
 * fck [N/mm²] am Zylinder, fck,cube am Würfel.
 */
const BETONGUETEN = {
  "C12/15": { fck: 12, cube: 15 },
  "C16/20": { fck: 16, cube: 20 },
  "C20/25": { fck: 20, cube: 25 },
  "C25/30": { fck: 25, cube: 30 },
  "C30/37": { fck: 30, cube: 37 },
  "C35/45": { fck: 35, cube: 45 },
  "C40/50": { fck: 40, cube: 50 },
  "C45/55": { fck: 45, cube: 55 },
  "C50/60": { fck: 50, cube: 60 },
};

const BETON_GAMMA_C = 1.5;   // DIN EN 1992-1-1/NA, Tab. 2.1DE (ständige und vorübergehende Bemessungssituation)
const BETON_ALPHA_CC = 0.85; // DIN EN 1992-1-1/NA zu 3.1.6

/**
 * Kennwerte einer Betonfestigkeitsklasse.
 * fcd = αcc · fck / γC, fctm = 0,30 · fck^(2/3), Ecm = 22000 · ((fck+8)/10)^0,3
 */
function betonKennwerte(guete) {
  const g = BETONGUETEN[guete] || BETONGUETEN["C25/30"];
  const fck = g.fck;
  return {
    fck,
    cube: g.cube,
    fcd: (BETON_ALPHA_CC * fck) / BETON_GAMMA_C,
    fctm: 0.3 * Math.pow(fck, 2 / 3),
    Ecm: 22000 * Math.pow((fck + 8) / 10, 0.3),
  };
}

/**
 * Expositionsklassen nach DIN EN 206-1 / DIN 1045-2.
 *
 * cMinDur = Mindestbetondeckung aus Dauerhaftigkeit für Betonstahl,
 * dev = Vorhaltemaß Δc_dev, minGuete = Mindestdruckfestigkeitsklasse.
 * Die Werte sind Richtwerte nach DIN EN 1992-1-1/NA Tab. 4.4DE.1 bzw.
 * DIN 1045-2 Tab. F.3.1 und im Einzelfall gegen die geltende Fassung zu
 * prüfen; die Betondeckung ist im Bauteil überschreibbar.
 */
const EXPOSITIONSKLASSEN = {
  X0:  { name: "X0 – kein Angriffsrisiko", cMinDur: 10, dev: 10, minGuete: "C12/15" },
  XC1: { name: "XC1 – trocken oder ständig nass", cMinDur: 10, dev: 10, minGuete: "C16/20" },
  XC2: { name: "XC2 – nass, selten trocken", cMinDur: 20, dev: 15, minGuete: "C16/20" },
  XC3: { name: "XC3 – mäßige Feuchte", cMinDur: 20, dev: 15, minGuete: "C20/25" },
  XC4: { name: "XC4 – wechselnd nass und trocken", cMinDur: 25, dev: 15, minGuete: "C25/30" },
  XD1: { name: "XD1 – Chloride, mäßige Feuchte", cMinDur: 40, dev: 15, minGuete: "C30/37" },
  XD2: { name: "XD2 – Chloride, nass", cMinDur: 40, dev: 15, minGuete: "C35/45" },
  XD3: { name: "XD3 – Chloride, wechselnd nass/trocken", cMinDur: 40, dev: 15, minGuete: "C35/45" },
  XS1: { name: "XS1 – Meerwasser, salzhaltige Luft", cMinDur: 40, dev: 15, minGuete: "C30/37" },
  XS2: { name: "XS2 – Meerwasser, ständig unter Wasser", cMinDur: 40, dev: 15, minGuete: "C35/45" },
  XS3: { name: "XS3 – Meerwasser, Tidebereich", cMinDur: 40, dev: 15, minGuete: "C35/45" },
  XF1: { name: "XF1 – Frost ohne Taumittel, mäßig", cMinDur: 25, dev: 15, minGuete: "C25/30" },
  XF3: { name: "XF3 – Frost ohne Taumittel, hoch", cMinDur: 25, dev: 15, minGuete: "C25/30" },
  XA1: { name: "XA1 – chemisch schwach angreifend", cMinDur: 25, dev: 15, minGuete: "C25/30" },
  XA2: { name: "XA2 – chemisch mäßig angreifend", cMinDur: 40, dev: 15, minGuete: "C35/45" },
  XA3: { name: "XA3 – chemisch stark angreifend", cMinDur: 40, dev: 15, minGuete: "C35/45" },
};

/** Reihenfolge der Güten für den Vergleich mit der Mindestfestigkeitsklasse. */
const GUETE_REIHE = Object.keys(BETONGUETEN);

/**
 * Betonbauteile mit ihrer Geometrieform und den maßgebenden Eingabefeldern.
 *
 * form: "linie" (zwei Punkte = Achse), "flaeche" (zwei gegenüberliegende
 * Ecken) oder "punkt" (ein Punkt). bewehrung = Erfahrungswert des
 * Bewehrungsgrades in kg/m³ für die Kostenschätzung.
 */
const BETONTEILTYPEN = {
  streifenfundament: {
    name: "Streifenfundament", kuerzel: "SF", form: "linie", erdreich: true, bewehrung: 50,
    felder: ["breite", "dicke"], standard: { breite: 0.6, dicke: 0.5 }, expo: "XC2",
  },
  einzelfundament: {
    name: "Einzelfundament", kuerzel: "EF", form: "punkt", erdreich: true, bewehrung: 60,
    felder: ["laenge", "breite", "dicke"], standard: { laenge: 1.5, breite: 1.5, dicke: 0.6 }, expo: "XC2",
  },
  koecherfundament: {
    name: "Köcherfundament", kuerzel: "KF", form: "punkt", erdreich: true, bewehrung: 90,
    felder: ["laenge", "breite", "dicke", "koecherL", "koecherB", "koecherT"],
    standard: { laenge: 1.8, breite: 1.8, dicke: 1.0, koecherL: 0.55, koecherB: 0.55, koecherT: 0.8 }, expo: "XC2",
  },
  bohrpfahl: {
    name: "Bohrpfahl", kuerzel: "BP", form: "punkt", erdreich: true, rund: true, bewehrung: 80,
    felder: ["durchmesser", "laenge"], standard: { durchmesser: 0.6, laenge: 8.0 }, expo: "XC2",
    feldNamen: { laenge: "Pfahllänge [m]" },
  },
  bodenplatte: {
    name: "Bodenplatte", kuerzel: "BO", form: "flaeche", erdreich: true, bewehrung: 90,
    felder: ["dicke"], standard: { dicke: 0.25 }, expo: "XC2",
  },
  decke: {
    name: "Stahlbetondecke", kuerzel: "DE", form: "flaeche", bewehrung: 100,
    felder: ["dicke"], standard: { dicke: 0.2 }, expo: "XC1", deckenschalung: true,
  },
  wand: {
    name: "Stahlbetonwand", kuerzel: "WA", form: "linie", bewehrung: 80,
    felder: ["dicke", "hoehe"], standard: { dicke: 0.24, hoehe: 2.75 }, expo: "XC1",
  },
  kellerwand: {
    name: "Kellerwand (erdberührt)", kuerzel: "KW", form: "linie", erdreich: true, bewehrung: 80,
    felder: ["dicke", "hoehe"], standard: { dicke: 0.3, hoehe: 2.5 }, expo: "XC2",
  },
  stuetze: {
    name: "Stahlbetonstütze (rechteckig)", kuerzel: "ST", form: "punkt", bewehrung: 150,
    felder: ["laenge", "breite", "hoehe"], standard: { laenge: 0.3, breite: 0.3, hoehe: 3.0 }, expo: "XC1",
  },
  stuetze_rund: {
    name: "Stahlbetonstütze (rund)", kuerzel: "SR", form: "punkt", rund: true, bewehrung: 150,
    felder: ["durchmesser", "hoehe"], standard: { durchmesser: 0.4, hoehe: 3.0 }, expo: "XC1",
  },
  unterzug: {
    name: "Unterzug / Balken", kuerzel: "UZ", form: "linie", bewehrung: 140,
    felder: ["breite", "hoehe"], standard: { breite: 0.3, hoehe: 0.5 }, expo: "XC1",
  },
};

const BETON_FELD_NAMEN = {
  laenge: "Länge a [m]", breite: "Breite b [m]", dicke: "Dicke d [m]", hoehe: "Höhe h [m]",
  durchmesser: "Durchmesser ⌀ [m]", koecherL: "Köcher a [m]", koecherB: "Köcher b [m]", koecherT: "Köcher t [m]",
};

/**
 * Betondeckung nach DIN EN 1992-1-1, Abs. 4.4.1:
 *   c_min = max(c_min,b ; c_min,dur ; 10 mm)
 *   c_nom = c_min + Δc_dev
 * Für Ortbeton gegen Boden gilt zusätzlich Abs. 4.4.1.3(4): c_min ≥ 40 mm
 * auf einer Sauberkeitsschicht, sonst c_min ≥ 75 mm.
 *
 * @returns {Object} { cMinDur, cMinB, cBoden, cMin, deltaC, cNom, massgebend }
 */
function betondeckung(element) {
  const typ = BETONTEILTYPEN[element.kind];
  const expo = EXPOSITIONSKLASSEN[element.expo] || EXPOSITIONSKLASSEN.XC1;
  const cMinB = element.ds || 12;                       // Stabdurchmesser [mm]
  const cBoden = typ && typ.erdreich ? (element.sauberkeit === false ? 75 : 40) : 0;
  const cMin = Math.max(cMinB, expo.cMinDur, cBoden, 10);
  const deltaC = expo.dev;
  // Auf volle 5 mm aufrunden, wie es in der Ausführung angegeben wird
  const cNom = Math.ceil((cMin + deltaC) / 5) * 5;
  const massgebend = cBoden >= cMin ? "Ortbeton gegen Boden"
    : expo.cMinDur >= cMinB ? "Dauerhaftigkeit " + element.expo : "Stabdurchmesser";
  return { cMinDur: expo.cMinDur, cMinB, cBoden, cMin, deltaC, cNom, massgebend };
}

/**
 * Geometrie und Mengen eines Betonbauteils je Stück.
 * @returns {Object} { volumen, schalung, aushub, grundflaeche, beschreibung, hoehe }
 */
function betonGeometrie(element, arbeitsraum) {
  const typ = BETONTEILTYPEN[element.kind];
  const m = element.masse || {};
  const wert = (feld, fallback) => {
    const v = m[feld];
    return Number.isFinite(v) && v > 0 ? v : (typ.standard[feld] !== undefined ? typ.standard[feld] : fallback);
  };
  const a = arbeitsraum === undefined ? ARBEITSRAUM_DIN4124 : arbeitsraum;
  const achsLaenge = element.p2
    ? Math.hypot(element.p2.x - element.p1.x, element.p2.y - element.p1.y, element.p2.z - element.p1.z)
    : 0;

  if (typ.form === "linie") {
    const laenge = achsLaenge || 1;
    if (element.kind === "streifenfundament") {
      const b = wert("breite", 0.6), d = wert("dicke", 0.5);
      return {
        volumen: b * d * laenge, schalung: 2 * d * laenge,
        schalungTeile: { seiten: 2 * d * laenge, boden: 0, aussparung: 0 },
        aushub: typ.erdreich ? (b + 2 * a) * (d + 0.05) * laenge : 0,
        grundflaeche: b * laenge, hoehe: d, laenge, breite: b, dicke: d,
        beschreibung: `L ${laenge.toFixed(2)} × b ${b.toFixed(2)} × d ${d.toFixed(2)} m`,
      };
    }
    // Wand, Kellerwand, Unterzug: Querschnitt d/b × h entlang der Achse
    const d = wert("dicke", wert("breite", 0.24));
    const h = wert("hoehe", 2.75);
    const seiten = 2 * h * laenge;
    const boden = element.kind === "unterzug" ? d * laenge : 0;  // Untersicht des Balkens
    const schalung = seiten + boden;
    return {
      volumen: d * h * laenge, schalung,
      schalungTeile: { seiten, boden, aussparung: 0 },
      aushub: typ.erdreich ? (d + 2 * a) * h * laenge : 0,
      grundflaeche: d * laenge, hoehe: h, laenge, breite: d, dicke: d,
      beschreibung: `L ${laenge.toFixed(2)} × h ${h.toFixed(2)} × d ${d.toFixed(2)} m`,
    };
  }

  if (typ.form === "flaeche") {
    const lx = Math.abs(element.p2.x - element.p1.x) || 0.01;
    const lz = Math.abs(element.p2.z - element.p1.z) || 0.01;
    const d = wert("dicke", 0.2);
    const rand = 2 * (lx + lz) * d;
    // Deckendurchbrüche mindern Fläche und Volumen und erzeugen Randschalung
    const oeffnungen = (element.aussparungen || []).filter((o) => (o.b || 0) > 0 && (o.t || 0) > 0);
    const oeffnungsFlaeche = oeffnungen.reduce((sum, o) => sum + o.b * o.t, 0);
    const oeffnungsUmfang = oeffnungen.reduce((sum, o) => sum + 2 * (o.b + o.t), 0);
    const brutto = lx * lz;
    const netto = Math.max(brutto - oeffnungsFlaeche, 0.01);
    const kantenschalung = oeffnungsUmfang * d;
    return {
      volumen: netto * d,
      schalung: (typ.deckenschalung ? netto : 0) + rand + kantenschalung,
      schalungTeile: {
        seiten: rand, boden: typ.deckenschalung ? netto : 0, aussparung: kantenschalung,
      },
      aushub: typ.erdreich ? (lx + 2 * a) * (lz + 2 * a) * (d + 0.05) : 0,
      grundflaeche: netto, bruttoFlaeche: brutto, oeffnungsFlaeche, oeffnungen,
      hoehe: d, laenge: lx, breite: lz, dicke: d,
      beschreibung: `${lx.toFixed(2)} × ${lz.toFixed(2)} × d ${d.toFixed(2)} m`
        + (oeffnungsFlaeche > 0 ? `, ${oeffnungen.length} Aussparung${oeffnungen.length === 1 ? "" : "en"} −${oeffnungsFlaeche.toFixed(2)} m²` : ""),
    };
  }

  // Punktbauteile
  if (element.kind === "bohrpfahl") {
    const d = wert("durchmesser", 0.6), l = wert("laenge", 8);
    const flaeche = (Math.PI * d * d) / 4;
    return {
      volumen: flaeche * l, schalung: 0, // verrohrt bzw. stützende Flüssigkeit, keine Schalung
      schalungTeile: { seiten: 0, boden: 0, aussparung: 0 },
      aushub: flaeche * l, // Bohrgut = verdrängtes Volumen
      grundflaeche: flaeche, hoehe: l, laenge: d, breite: d, dicke: d,
      beschreibung: `⌀ ${d.toFixed(2)} × L ${l.toFixed(2)} m`,
    };
  }
  if (element.kind === "stuetze_rund") {
    const d = wert("durchmesser", 0.4), h = wert("hoehe", 3);
    const flaeche = (Math.PI * d * d) / 4;
    return {
      volumen: flaeche * h, schalung: Math.PI * d * h, aushub: 0,
      schalungTeile: { seiten: Math.PI * d * h, boden: 0, aussparung: 0 },
      grundflaeche: flaeche, hoehe: h, laenge: d, breite: d, dicke: d,
      beschreibung: `⌀ ${d.toFixed(2)} × h ${h.toFixed(2)} m`,
    };
  }
  if (element.kind === "stuetze") {
    const la = wert("laenge", 0.3), b = wert("breite", 0.3), h = wert("hoehe", 3);
    return {
      volumen: la * b * h, schalung: 2 * (la + b) * h, aushub: 0,
      schalungTeile: { seiten: 2 * (la + b) * h, boden: 0, aussparung: 0 },
      grundflaeche: la * b, hoehe: h, laenge: la, breite: b, dicke: Math.min(la, b),
      beschreibung: `${la.toFixed(2)} × ${b.toFixed(2)} × h ${h.toFixed(2)} m`,
    };
  }
  if (element.kind === "koecherfundament") {
    const la = wert("laenge", 1.8), b = wert("breite", 1.8), d = wert("dicke", 1.0);
    const kl = Math.min(wert("koecherL", 0.55), la - 0.1);
    const kb = Math.min(wert("koecherB", 0.55), b - 0.1);
    const kt = Math.min(wert("koecherT", 0.8), d);
    const koecher = kl * kb * kt;
    return {
      volumen: Math.max(la * b * d - koecher, 0),
      schalung: 2 * (la + b) * d + 2 * (kl + kb) * kt,
      schalungTeile: { seiten: 2 * (la + b) * d, boden: 0, aussparung: 2 * (kl + kb) * kt },
      aushub: (la + 2 * a) * (b + 2 * a) * (d + 0.05),
      grundflaeche: la * b, hoehe: d, laenge: la, breite: b, dicke: d,
      koecher: { l: kl, b: kb, t: kt, volumen: koecher },
      beschreibung: `${la.toFixed(2)} × ${b.toFixed(2)} × d ${d.toFixed(2)} m, Köcher ${kl.toFixed(2)} × ${kb.toFixed(2)} × ${kt.toFixed(2)} m`,
    };
  }
  // Einzelfundament
  const la = wert("laenge", 1.5), b = wert("breite", 1.5), d = wert("dicke", 0.6);
  return {
    volumen: la * b * d, schalung: 2 * (la + b) * d,
    schalungTeile: { seiten: 2 * (la + b) * d, boden: 0, aussparung: 0 },
    aushub: (la + 2 * a) * (b + 2 * a) * (d + 0.05),
    grundflaeche: la * b, hoehe: d, laenge: la, breite: b, dicke: d,
    beschreibung: `${la.toFixed(2)} × ${b.toFixed(2)} × d ${d.toFixed(2)} m`,
  };
}

/**
 * Vollständige Auswertung eines Betonbauteils einschließlich Stückzahl.
 * @returns {Object} Mengen, Kennwerte, Betondeckung und Hinweise
 */
function betonAuswertung(element, arbeitsraum) {
  const typ = BETONTEILTYPEN[element.kind];
  const geo = betonGeometrie(element, arbeitsraum);
  const anzahl = Math.max(1, element.anzahl || 1);
  const grad = Number.isFinite(element.bewehrungsgrad) ? element.bewehrungsgrad : typ.bewehrung;

  const volumen = geo.volumen * anzahl;
  const kennwerte = betonKennwerte(element.guete);
  const deckung = betondeckung(element);
  const warnungen = [];

  const expo = EXPOSITIONSKLASSEN[element.expo] || EXPOSITIONSKLASSEN.XC1;
  if (GUETE_REIHE.indexOf(element.guete) < GUETE_REIHE.indexOf(expo.minGuete)) {
    warnungen.push(`Für ${element.expo} ist mindestens ${expo.minGuete} erforderlich (DIN 1045-2 Tab. F.3.1).`);
  }
  if (typ.form === "flaeche" && geo.dicke < 0.07) {
    warnungen.push("Plattendicke unter 70 mm – Mindestdicken nach DIN EN 1992-1-1 Abs. 9 prüfen.");
  }
  if (element.kind === "koecherfundament" && geo.koecher && geo.koecher.t < 0.6) {
    warnungen.push("Köchertiefe unter 0,60 m – Einbindetiefe und Verbund der Fertigteilstütze nachweisen.");
  }

  return {
    typ, typName: typ.name, geo, anzahl,
    volumen,
    schalung: geo.schalung * anzahl,
    bewehrung: volumen * grad,          // kg
    bewehrungsgrad: grad,
    aushub: geo.aushub * anzahl,
    masse: volumen * STAHLBETON_DICHTE, // kg, Stahlbeton nach DIN EN 1991-1-1
    // Eigenlast flächiger Bauteile als Kennwert für die Lastannahmen
    flaechenlast: typ.form === "flaeche" || typ.form === "linie"
      ? (geo.dicke * STAHLBETON_DICHTE * 9.81) / 1000 : null,
    kennwerte, deckung, warnungen,
  };
}

/**
 * Kostenaufstellung aller Betonbauteile.
 * @param {Array} elements - Betonbauteile
 * @param {Object} preise - { beton, schalung, bewehrung, aushub } in €/m³, €/m², €/t, €/m³
 * @param {number} [bewehrungMasse] - Betonstahlmasse [kg] aus der Stahlliste; ersetzt den Bewehrungsgrad
 * @returns {Array} Positionen mit Menge, Einheit, Preis und Kosten
 */
function betonAufstellung(elements, preise, arbeitsraum, bewehrungMasse) {
  let volumen = 0, schalung = 0, bewehrung = 0, aushub = 0;
  elements.forEach((element) => {
    const a = betonAuswertung(element, arbeitsraum);
    volumen += a.volumen;
    schalung += a.schalung;
    bewehrung += a.bewehrung;
    aushub += a.aushub;
  });
  // Kostenansatz wahlweise aus der Stahlliste statt aus dem Bewehrungsgrad
  if (Number.isFinite(bewehrungMasse)) bewehrung = bewehrungMasse;
  const p = preise || {};
  return [
    { key: "beton", name: "Beton (Lieferung und Einbau)", menge: volumen, einheit: "m³", preis: p.beton || 0, kosten: volumen * (p.beton || 0) },
    { key: "schalung", name: "Schalung (Stellen und Ausschalen)", menge: schalung, einheit: "m²", preis: p.schalung || 0, kosten: schalung * (p.schalung || 0) },
    { key: "bewehrung", name: "Betonstahl B500B (Liefern, Biegen, Verlegen)", menge: bewehrung / 1000, einheit: "t", preis: p.bewehrung || 0, kosten: (bewehrung / 1000) * (p.bewehrung || 0) },
    { key: "aushub", name: "Aushub und Bohrgut (Lösen, Laden, Abfahren)", menge: aushub, einheit: "m³", preis: p.aushub || 0, kosten: aushub * (p.aushub || 0) },
  ];
}
