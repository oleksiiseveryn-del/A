/**
 * Treppen nach DIN 18065 (Gebäudetreppen – Begriffe, Messregeln, Hauptmaße).
 *
 * Aus Geschosshöhe, Steigungszahl und Auftritt folgen Steigung, Lauflänge,
 * Steigungswinkel und die Grundfläche; geprüft werden die Hauptmaße und die
 * Regeln der Bequemlichkeit und Sicherheit:
 *
 *   Schrittmaßregel      2 s + a = 59 … 65 cm  (Zielwert 63 cm)
 *   Sicherheitsregel     s + a  = 46 cm
 *   Bequemlichkeitsregel a − s  = 12 cm
 *   Steigung s ≤ und Auftritt a ≥ nach Nutzungsart, nutzbare Laufbreite ≥
 *   lichte Durchgangshöhe ≥ 2,00 m
 *   alle Steigungen eines Laufes gleich; lange Läufe durch Podeste teilen,
 *   Podestlänge ≥ nutzbare Laufbreite
 *
 * Die Grenzwerte der Nutzungsarten sind als Voreinstellung hinterlegt und im
 * Bauteil überschreibbar; maßgebend sind die geltende Fassung der DIN 18065
 * und die Landesbauordnung. Rettungswege, Handlauf- und Geländerhöhen,
 * Absturzsicherung und Brandschutz sind gesondert nachzuweisen.
 */

/** Nutzungsarten mit den Hauptmaßen nach DIN 18065 (Voreinstellung). */
const TREPPEN_NUTZUNG = {
  wohnung2: {
    name: "notwendige Treppe, Wohngebäude bis 2 Wohnungen",
    sMax: 0.20, aMin: 0.23, breiteMin: 0.80,
  },
  sonstige: {
    name: "notwendige Treppe, sonstige Gebäude",
    sMax: 0.19, aMin: 0.26, breiteMin: 1.00,
  },
  zusaetzlich: {
    name: "nicht notwendige Treppe",
    sMax: 0.21, aMin: 0.21, breiteMin: 0.50,
  },
};

/** Zahl mit Dezimalkomma nach DIN 406-11. */
function zahl(wert, stellen) {
  return wert.toFixed(stellen === undefined ? 2 : stellen).replace(".", ",");
}

/** Regelwerte der Schrittmaß-, Sicherheits- und Bequemlichkeitsregel [m]. */
const SCHRITTMASS = { min: 0.59, ziel: 0.63, max: 0.65 };
const SICHERHEITSREGEL = 0.46;
const BEQUEMLICHKEITSREGEL = 0.12;
const DURCHGANGSHOEHE_MIN = 2.00;
const STEIGUNGEN_JE_LAUF_MAX = 18;

/**
 * Treppengeometrie aus den Eingaben.
 *
 * @param {Object} werte - { geschosshoehe, steigungen, auftritt, laufbreite,
 *                           dicke, nutzung, durchgangshoehe, podestlaenge, laeufe }
 * @returns {Object} Maße, Winkel, Flächen und Volumen
 */
function treppeGeometrie(werte) {
  const geschosshoehe = Math.max(werte.geschosshoehe || 2.75, 0.2);
  const steigungen = Math.max(2, Math.round(werte.steigungen || 16));
  const laeufe = Math.max(1, Math.round(werte.laeufe || 1));
  const laufbreite = Math.max(0.3, werte.laufbreite || 1.0);
  const dicke = Math.max(0.08, werte.dicke || 0.20);

  const steigung = geschosshoehe / steigungen;              // s
  const auftritt = Math.max(0.15, werte.auftritt || (SCHRITTMASS.ziel - 2 * steigung));

  // Auftritte je Lauf: die oberste Stufe endet in der Podest- bzw.
  // Geschossebene und hat keinen Auftritt mehr
  const steigungenJeLauf = Math.ceil(steigungen / laeufe);
  const auftritteJeLauf = Math.max(1, steigungenJeLauf - 1);
  const lauflaenge = auftritteJeLauf * auftritt;             // waagerecht je Lauf
  const laufhoehe = steigungenJeLauf * steigung;
  const geneigt = Math.hypot(lauflaenge, laufhoehe);         // Länge der Laufplatte
  const winkel = (Math.atan2(laufhoehe, lauflaenge) * 180) / Math.PI;

  const podestlaenge = laeufe > 1 ? Math.max(werte.podestlaenge || laufbreite, 0.3) : 0;
  const podestflaeche = laeufe > 1 ? podestlaenge * laufbreite * (laeufe - 1) : 0;

  // Volumen: geneigte Laufplatte zuzüglich der Stufendreiecke, dazu die Podeste
  const volumenLauf = laufbreite * (geneigt * dicke + auftritteJeLauf * auftritt * steigung / 2);
  const volumenPodest = podestflaeche * dicke;
  const volumen = volumenLauf * laeufe + volumenPodest;

  // Schalung: Untersicht und Seiten der Läufe, Stufenschalung, Podestunterseite
  const untersicht = laufbreite * geneigt * laeufe + podestflaeche;
  const seiten = 2 * geneigt * dicke * laeufe;
  const stufen = steigungen * steigung * laufbreite;
  const schalung = untersicht + seiten + stufen;

  // Lotrechte Dicke der geneigten Laufplatte: d / cos α – das Maß, mit dem die
  // Platte im Längsschnitt erscheint
  const dickeLotrecht = geneigt > 0 ? (dicke * geneigt) / lauflaenge : dicke;

  return {
    geschosshoehe, steigungen, steigung, auftritt, laufbreite, dicke, laeufe,
    dickeLotrecht,
    steigungenJeLauf, auftritteJeLauf, lauflaenge, laufhoehe, geneigt, winkel,
    podestlaenge, podestflaeche,
    grundflaeche: laufbreite * lauflaenge * laeufe + podestflaeche,
    volumen, schalung,
    schalungTeile: { seiten, boden: untersicht, aussparung: 0, stufen },
    schrittmass: 2 * steigung + auftritt,
    sicherheit: steigung + auftritt,
    bequemlichkeit: auftritt - steigung,
    beschreibung: `${steigungen} STG ${zahl(steigung * 100, 1)}/${zahl(auftritt * 100, 1)} cm`
      + ` · Lauf ${zahl(lauflaenge, 2)} m · Breite ${zahl(laufbreite, 2)} m`
      + (laeufe > 1 ? ` · ${laeufe} Läufe` : ""),
  };
}

/**
 * Nachweis der Hauptmaße und Regeln nach DIN 18065.
 * @returns {Array} [{ regel, wert, grenze, erfuellt, hinweis }]
 */
function treppeNachweis(geo, werte) {
  const nutzung = TREPPEN_NUTZUNG[werte.nutzung] || TREPPEN_NUTZUNG.wohnung2;
  const sMax = werte.sMax > 0 ? werte.sMax : nutzung.sMax;
  const aMin = werte.aMin > 0 ? werte.aMin : nutzung.aMin;
  const breiteMin = werte.breiteMin > 0 ? werte.breiteMin : nutzung.breiteMin;
  const durchgang = werte.durchgangshoehe || DURCHGANGSHOEHE_MIN;
  // Zahlenangaben mit Dezimalkomma nach DIN 406-11
  const cm = (wert) => zahl(wert * 100, 1);
  const meter = (wert) => zahl(wert, 2);

  const zeilen = [
    {
      regel: "Steigung s", wert: `${cm(geo.steigung)} cm`, grenze: `≤ ${cm(sMax)} cm`,
      erfuellt: geo.steigung <= sMax + 1e-9, hinweis: nutzung.name,
    },
    {
      regel: "Auftritt a", wert: `${cm(geo.auftritt)} cm`, grenze: `≥ ${cm(aMin)} cm`,
      erfuellt: geo.auftritt >= aMin - 1e-9, hinweis: nutzung.name,
    },
    {
      regel: "nutzbare Laufbreite", wert: `${cm(geo.laufbreite)} cm`, grenze: `≥ ${cm(breiteMin)} cm`,
      erfuellt: geo.laufbreite >= breiteMin - 1e-9, hinweis: nutzung.name,
    },
    {
      regel: "Schrittmaßregel 2s + a", wert: `${cm(geo.schrittmass)} cm`,
      grenze: `${cm(SCHRITTMASS.min)} … ${cm(SCHRITTMASS.max)} cm`,
      erfuellt: geo.schrittmass >= SCHRITTMASS.min - 1e-9 && geo.schrittmass <= SCHRITTMASS.max + 1e-9,
      hinweis: `Zielwert ${cm(SCHRITTMASS.ziel)} cm`,
    },
    {
      regel: "Sicherheitsregel s + a", wert: `${cm(geo.sicherheit)} cm`, grenze: `≈ ${cm(SICHERHEITSREGEL)} cm`,
      erfuellt: Math.abs(geo.sicherheit - SICHERHEITSREGEL) <= 0.03,
      hinweis: "Richtwert für sicheres Begehen",
    },
    {
      regel: "Bequemlichkeitsregel a − s", wert: `${cm(geo.bequemlichkeit)} cm`,
      grenze: `≈ ${cm(BEQUEMLICHKEITSREGEL)} cm`,
      erfuellt: Math.abs(geo.bequemlichkeit - BEQUEMLICHKEITSREGEL) <= 0.04,
      hinweis: "Richtwert für bequemes Gehen",
    },
    {
      regel: "lichte Durchgangshöhe", wert: `${meter(durchgang)} m`,
      grenze: `≥ ${meter(DURCHGANGSHOEHE_MIN)} m`,
      erfuellt: durchgang >= DURCHGANGSHOEHE_MIN - 1e-9,
      hinweis: "senkrecht über der Lauflinie zu messen",
    },
    {
      regel: "Steigungen je Lauf", wert: `${geo.steigungenJeLauf}`,
      grenze: `≤ ${STEIGUNGEN_JE_LAUF_MAX}`,
      erfuellt: geo.steigungenJeLauf <= STEIGUNGEN_JE_LAUF_MAX,
      hinweis: "längere Läufe durch ein Podest teilen",
    },
  ];

  if (geo.laeufe > 1) {
    zeilen.push({
      regel: "Podestlänge", wert: `${meter(geo.podestlaenge)} m`,
      grenze: `≥ ${meter(geo.laufbreite)} m`,
      erfuellt: geo.podestlaenge >= geo.laufbreite - 1e-9,
      hinweis: "mindestens die nutzbare Laufbreite",
    });
  }

  return zeilen;
}

/**
 * Schlägt Steigungszahl und Auftritt zur Geschosshöhe vor: die Steigungszahl,
 * deren Auftritt aus der Schrittmaßregel die Hauptmaße der Nutzungsart
 * einhält und dem Zielschrittmaß am nächsten kommt.
 *
 * @returns {Object} { steigungen, auftritt, steigung, treffer }
 */
function treppeVorschlag(geschosshoehe, nutzungName) {
  const nutzung = TREPPEN_NUTZUNG[nutzungName] || TREPPEN_NUTZUNG.wohnung2;
  let bester = null;
  for (let n = 3; n <= 40; n++) {
    const s = geschosshoehe / n;
    if (s > nutzung.sMax + 1e-9) continue;              // zu steil
    if (s < 0.14) continue;                             // unüblich flach
    // Auftritt aus der Schrittmaßregel, auf ganze Zentimeter gerundet
    const aRoh = SCHRITTMASS.ziel - 2 * s;
    const a = Math.max(nutzung.aMin, Math.round(aRoh * 100) / 100);
    const schrittmass = 2 * s + a;
    if (schrittmass < SCHRITTMASS.min - 1e-9 || schrittmass > SCHRITTMASS.max + 1e-9) continue;
    // Bewertung: Abstand vom Zielschrittmaß und von der Bequemlichkeitsregel.
    // Ohne die zweite Bedingung gewönne immer die flachste Treppe mit dem
    // längsten Lauf – die Schrittmaßregel allein ist dafür nicht eindeutig.
    const abweichung = Math.abs(schrittmass - SCHRITTMASS.ziel)
      + 0.5 * Math.abs((a - s) - BEQUEMLICHKEITSREGEL);
    if (!bester || abweichung < bester.abweichung - 1e-9) {
      bester = { steigungen: n, auftritt: a, steigung: s, abweichung, treffer: true };
    }
  }
  if (bester) return bester;
  // Nichts gefunden: kleinste Steigungszahl, die die Höchststeigung einhält
  const n = Math.max(3, Math.ceil(geschosshoehe / nutzung.sMax));
  const s = geschosshoehe / n;
  return { steigungen: n, auftritt: Math.max(nutzung.aMin, SCHRITTMASS.ziel - 2 * s), steigung: s, treffer: false };
}

/**
 * Umriss eines Treppenlaufes im Längsschnitt: Stufenprofil oben, geneigte
 * Laufplattenuntersicht unten. Ursprung ist die Vorderkante der ersten Stufe
 * an der unteren Geschossebene; y wird vom tiefsten Punkt der Untersicht
 * gemessen, damit das Profil im Zeichenfeld auf Null steht.
 *
 * @returns {Array} [{ x, y }] in Metern
 */
function treppeSchnittProfil(geo) {
  const a = geo.auftritt, s = geo.steigung, n = geo.steigungenJeLauf;
  const dv = geo.dickeLotrecht;
  const punkte = [{ x: 0, y: dv }];
  for (let i = 1; i <= n; i++) {
    punkte.push({ x: (i - 1) * a, y: dv + i * s });          // Setzstufe
    if (i < n) punkte.push({ x: i * a, y: dv + i * s });     // Trittstufe
  }
  punkte.push({ x: geo.lauflaenge, y: geo.laufhoehe });      // Stirnseite oben
  punkte.push({ x: 0, y: 0 });                               // Untersicht zurück
  return punkte;
}

/**
 * Steigungsangabe der Bauzeichnung: „16 STG 19,4/27,0" – Steigung und
 * Auftritt in Zentimetern mit Dezimalkomma nach DIN 406-11.
 */
function treppeSteigungsText(geo) {
  return `${geo.steigungen} STG ${zahl(geo.steigung * 100, 1)}/${zahl(geo.auftritt * 100, 1)}`;
}

/**
 * Grundrisssymbol einer geraden Treppe nach DIN 1356-1: Stufenlinien,
 * Lauflinie mit Antrittspfeil und Beschriftung „n STG s/a".
 *
 * @param {Object} lage - { x0, z0, richtung } Antritt und Richtung im Modell
 * @param {Object} geo - Ergebnis aus treppeGeometrie()
 * @param {Function} px, pz - Abbildung Modell -> Blatt
 * @param {string} bezeichnung - Positionsnummer des Bauteils
 */
function treppeGrundrissSVG(lage, geo, px, pz, bezeichnung) {
  const rad = (lage.richtung * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  // Punkt in Treppenkoordinaten (u entlang des Laufs, v quer) -> Modell
  const punkt = (u, v) => ({ x: lage.x0 + u * cos - v * sin, z: lage.z0 + u * sin + v * cos });
  const blatt = (u, v) => {
    const p = punkt(u, v);
    return `${px(p.x).toFixed(2)},${pz(p.z).toFixed(2)}`;
  };

  const b = geo.laufbreite;
  const L = geo.lauflaenge;
  let svg = `<polygon points="${blatt(0, 0)} ${blatt(L, 0)} ${blatt(L, b)} ${blatt(0, b)}" class="treppe"/>`;

  // Stufenvorderkanten
  for (let i = 1; i <= geo.auftritteJeLauf; i++) {
    const u = i * geo.auftritt;
    svg += `<line x1="${blatt(u, 0).split(",")[0]}" y1="${blatt(u, 0).split(",")[1]}" `
      + `x2="${blatt(u, b).split(",")[0]}" y2="${blatt(u, b).split(",")[1]}" class="treppe-stufe"/>`;
  }

  // Lauflinie mit Antrittspfeil, in Laufmitte
  const von = blatt(0.1 * geo.auftritt, b / 2).split(",");
  const bis = blatt(L - 0.1 * geo.auftritt, b / 2).split(",");
  svg += `<line x1="${von[0]}" y1="${von[1]}" x2="${bis[0]}" y2="${bis[1]}" class="lauflinie"/>`;
  svg += `<circle cx="${von[0]}" cy="${von[1]}" r="0.7" class="antritt"/>`;
  // Pfeilspitze am Austritt
  const spitze = punkt(L - 0.1 * geo.auftritt, b / 2);
  const quer = punkt(L - 0.1 * geo.auftritt - 0.35, b / 2 + 0.18);
  const quer2 = punkt(L - 0.1 * geo.auftritt - 0.35, b / 2 - 0.18);
  svg += `<polygon points="${px(spitze.x).toFixed(2)},${pz(spitze.z).toFixed(2)} `
    + `${px(quer.x).toFixed(2)},${pz(quer.z).toFixed(2)} ${px(quer2.x).toFixed(2)},${pz(quer2.z).toFixed(2)}" class="pfeil"/>`;

  // Beschriftung in Laufmitte, wie im Bauplan: "16 STG 19,4/27,0"
  const mitte = punkt(L / 2, b / 2);
  const drehung = lage.richtung > 90 || lage.richtung < -90 ? lage.richtung + 180 : lage.richtung;
  const tx = px(mitte.x), ty = pz(mitte.z);
  svg += `<text x="${tx.toFixed(2)}" y="${(ty - 1.2).toFixed(2)}" class="t-treppe" `
    + `transform="rotate(${drehung.toFixed(2)} ${tx.toFixed(2)} ${ty.toFixed(2)})">${bezeichnung}</text>`;
  svg += `<text x="${tx.toFixed(2)}" y="${(ty + 2.2).toFixed(2)}" class="t-treppe-mass" `
    + `transform="rotate(${drehung.toFixed(2)} ${tx.toFixed(2)} ${ty.toFixed(2)})">`
    + `${treppeSteigungsText(geo)}</text>`;

  return svg;
}
