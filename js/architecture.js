/**
 * Architektur-Bauteile: Geometrie, Massen und Wärmeschutz.
 *
 * Geführt werden Mengenermittlung (Fläche, Volumen je Schicht, Masse) und
 * der Wärmedurchgangskoeffizient nach DIN EN ISO 6946:
 *   R_ges = R_si + Σ (d / λ) + R_se        U = 1 / R_ges
 * sowie die flächenbezogene Masse als Kennwert für den Schallschutz.
 *
 * NICHT geführt: Tragfähigkeitsnachweise (Beton nach DIN EN 1992, Mauerwerk
 * nach DIN EN 1996, Holz nach DIN EN 1995), Feuchteschutz nach DIN 4108-3,
 * Schallschutznachweis nach DIN 4109, Brandschutz und die Gebäudebilanz
 * nach GEG. Die Höchstwerte der U-Werte sind dem GEG zu entnehmen.
 */

/** Gesamtdicke eines Schichtaufbaus in Metern. */
function aufbauDicke(layers) {
  return layers.reduce((sum, l) => sum + (l.d || 0), 0);
}

/**
 * Wärmedurchgangskoeffizient nach DIN EN ISO 6946.
 * @returns {Object} { U, R, hinweis }
 */
function berechneUWert(layers, typ) {
  if (!typ.uWert) return { U: null, R: null };
  let R = (typ.rsi || 0) + (typ.rse || 0);
  let unbekannt = false;

  layers.forEach((layer) => {
    const stoff = BAUSTOFFE[layer.material];
    if (!stoff || !stoff.lam) { unbekannt = true; return; }
    R += (layer.d || 0) / stoff.lam;
  });

  if (unbekannt || R <= 0) return { U: null, R: null };
  return {
    U: 1 / R,
    R,
    hinweis: typ.erdreich
      ? "Bauteil gegen Erdreich – maßgebend ist der Wärmedurchgang nach DIN EN ISO 13370; der hier gezeigte U-Wert liegt auf der sicheren Seite."
      : null,
  };
}

/** Flächenbezogene Masse [kg/m²] – Kennwert für den Schallschutz. */
function flaechenbezogeneMasse(layers) {
  return layers.reduce((sum, l) => {
    const stoff = BAUSTOFFE[l.material];
    return sum + (stoff ? stoff.rho * (l.d || 0) : 0);
  }, 0);
}

/**
 * Geometrie eines Bauteils aus seinen Punkten und dem Aufbau.
 * @returns {Object} { flaeche, dicke, volumen, laenge, breite, hoehe }
 */
function bauteilGeometrie(element) {
  const typ = BAUTEILTYPEN[element.kind];
  const dicke = aufbauDicke(element.layers);

  if (typ.form === "linie") {
    const p1 = element.p1, p2 = element.p2;
    const laenge = Math.hypot(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z);
    // Wand: Ansichtsfläche = Länge × Höhe; Streifenfundament: Sohlfläche = Länge × Breite
    const hoehe = typ.unterGelaende ? (element.breite || typ.breite || 0.6) : (element.hoehe || 2.75);
    return { laenge, breite: hoehe, hoehe, flaeche: laenge * hoehe, dicke, volumen: laenge * hoehe * dicke };
  }

  if (typ.form === "flaeche") {
    const laenge = Math.abs(element.p2.x - element.p1.x) || 0.01;
    const breite = Math.abs(element.p2.z - element.p1.z) || 0.01;
    return { laenge, breite, hoehe: dicke, flaeche: laenge * breite, dicke, volumen: laenge * breite * dicke };
  }

  // Punktbauteil (Einzelfundament)
  const laenge = element.laenge || typ.laenge || 1.5;
  const breite = element.breite || typ.breite || 1.5;
  return { laenge, breite, hoehe: dicke, flaeche: laenge * breite, dicke, volumen: laenge * breite * dicke };
}

/** Summe der Öffnungsflächen eines Bauteils [m²] je Einzelbauteil. */
function oeffnungsFlaeche(openings) {
  return (openings || []).reduce((s, o) => s + (o.breite || 0) * (o.hoehe || 0) * (o.anzahl || 1), 0);
}

/**
 * Mittlerer Wärmedurchgangskoeffizient einer Fläche mit Öffnungen:
 * U_m = (A_netto · U_Bauteil + Σ A_Öffnung · U_Öffnung) / A_brutto
 */
function mittlererUWert(uBauteil, flaecheBrutto, openings) {
  if (uBauteil === null || flaecheBrutto <= 0) return null;
  const aOeffnung = oeffnungsFlaeche(openings);
  if (aOeffnung <= 0) return uBauteil;
  const aNetto = Math.max(flaecheBrutto - aOeffnung, 0);
  const summe = (openings || []).reduce((s, o) => {
    const u = o.u !== undefined && o.u !== null ? o.u : (OEFFNUNGSTYPEN[o.typ] ? OEFFNUNGSTYPEN[o.typ].uw : 1.3);
    return s + (o.breite || 0) * (o.hoehe || 0) * (o.anzahl || 1) * u;
  }, 0);
  return (aNetto * uBauteil + summe) / flaecheBrutto;
}

/**
 * Vollständige Auswertung eines Bauteils inklusive Anzahl und Öffnungen.
 * Massen und Volumen beziehen sich auf die Nettofläche.
 * @returns {Object} Geometrie, Massen, U-Werte und Schichtmengen
 */
function bauteilAuswertung(element, openings) {
  const typ = BAUTEILTYPEN[element.kind];
  const geo = bauteilGeometrie(element);
  const anzahl = element.anzahl || 1;

  const aOeffnungEinzel = oeffnungsFlaeche(openings);
  const flaecheNettoEinzel = Math.max(geo.flaeche - aOeffnungEinzel, 0);

  const schichten = element.layers.map((layer) => {
    const stoff = BAUSTOFFE[layer.material];
    const volumen = flaecheNettoEinzel * (layer.d || 0) * anzahl;
    return {
      material: layer.material,
      name: stoff ? stoff.name : layer.material,
      d: layer.d || 0,
      volumen,
      masse: stoff ? volumen * stoff.rho : 0,
      kosten: stoff ? volumen * stoff.preis : 0,
    };
  });

  const u = berechneUWert(element.layers, typ);
  const uMittel = mittlererUWert(u.U, geo.flaeche, openings);
  return {
    typName: typ.name,
    geometrie: geo,
    anzahl,
    flaecheBrutto: geo.flaeche * anzahl,
    oeffnungsFlaeche: aOeffnungEinzel * anzahl,
    flaecheGesamt: flaecheNettoEinzel * anzahl,
    volumenGesamt: flaecheNettoEinzel * geo.dicke * anzahl,
    uMittel,
    masseGesamt: schichten.reduce((s, l) => s + l.masse, 0),
    kostenGesamt: schichten.reduce((s, l) => s + l.kosten, 0),
    schichten,
    uWert: u.U,
    rGesamt: u.R,
    uHinweis: u.hinweis,
    flaechenmasse: flaechenbezogeneMasse(element.layers),
  };
}

/** Materialaufstellung über alle Bauteile, gruppiert nach Baustoff. */
function materialAufstellung(elements, preise, oeffnungenJeBauteil) {
  const summe = new Map();
  elements.forEach((element) => {
    const openings = oeffnungenJeBauteil ? oeffnungenJeBauteil(element.id) : [];
    bauteilAuswertung(element, openings).schichten.forEach((schicht) => {
      if (!summe.has(schicht.material)) {
        const stoff = BAUSTOFFE[schicht.material];
        summe.set(schicht.material, {
          key: schicht.material,
          name: schicht.name,
          gruppe: stoff ? stoff.gruppe : "-",
          rho: stoff ? stoff.rho : 0,
          volumen: 0,
          masse: 0,
        });
      }
      const eintrag = summe.get(schicht.material);
      eintrag.volumen += schicht.volumen;
      eintrag.masse += schicht.masse;
    });
  });

  return Array.from(summe.values()).map((eintrag) => {
    const preis = preise && preise[eintrag.key] !== undefined
      ? preise[eintrag.key]
      : (BAUSTOFFE[eintrag.key] ? BAUSTOFFE[eintrag.key].preis : 0);
    return { ...eintrag, preis, kosten: eintrag.volumen * preis };
  }).sort((a, b) => (a.gruppe === b.gruppe ? b.kosten - a.kosten : a.gruppe.localeCompare(b.gruppe)));
}

/**
 * Lage der einzelnen Öffnungen in Wandkoordinaten.
 *
 * x0  Abstand vom Wandanfang bis zur linken Laibungskante [m]
 * y0  Brüstungshöhe über der Wandunterkante [m]
 *
 * Ist kein Abstand gesetzt, werden die Stücke einer Position gleichmäßig
 * über die Wandlänge verteilt. Andernfalls beginnt die erste Öffnung beim
 * angegebenen Abstand, die weiteren folgen im Achsabstand.
 *
 * @returns {Object} { felder, warnungen }
 */
function oeffnungsPositionen(openings, wandLaenge, wandHoehe) {
  const felder = [];
  const warnungen = new Map();

  const warne = (id, text) => {
    if (!warnungen.has(id)) warnungen.set(id, []);
    if (warnungen.get(id).indexOf(text) === -1) warnungen.get(id).push(text);
  };

  (openings || []).forEach((o) => {
    const anzahl = Math.max(1, o.anzahl || 1);
    const b = o.breite || 0;
    const h = o.hoehe || 0;
    const y0 = o.bruestung || 0;
    const automatisch = o.abstand === null || o.abstand === undefined || o.abstand === "";
    // Achsabstand: gesetzt, sonst Breite plus 1,00 m Pfeiler
    const raster = o.raster && o.raster > 0 ? o.raster : b + 1.0;

    for (let k = 0; k < anzahl; k++) {
      const x0 = automatisch
        ? (wandLaenge * (k + 0.5)) / anzahl - b / 2
        : o.abstand + k * raster;
      felder.push({ id: o.id, typ: o.typ, x0, y0, b, h, index: k, automatisch });

      if (x0 < 0 || x0 + b > wandLaenge + 1e-6) {
        warne(o.id, `Öffnung ${k + 1} liegt außerhalb der Wandlänge (${wandLaenge.toFixed(2)} m)`);
      }
      if (y0 < 0 || y0 + h > wandHoehe + 1e-6) {
        warne(o.id, `Öffnung überschreitet die Wandhöhe (${wandHoehe.toFixed(2)} m)`);
      }
    }
  });

  // Überschneidungen paarweise prüfen
  for (let i = 0; i < felder.length; i++) {
    for (let j = i + 1; j < felder.length; j++) {
      const a = felder[i], c = felder[j];
      const xUeberlappt = a.x0 < c.x0 + c.b - 1e-6 && c.x0 < a.x0 + a.b - 1e-6;
      const yUeberlappt = a.y0 < c.y0 + c.h - 1e-6 && c.y0 < a.y0 + a.h - 1e-6;
      if (xUeberlappt && yUeberlappt) {
        warne(a.id, "Öffnungen überschneiden sich");
        warne(c.id, "Öffnungen überschneiden sich");
      }
    }
  }

  return { felder, warnungen };
}
