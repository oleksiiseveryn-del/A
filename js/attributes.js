/**
 * Bauteilattribute: das, was ein Bauteil über seine Geometrie hinaus weiß.
 *
 * Geführt werden Feuerwiderstand, Baustoffklasse, Gewerk, Bauabschnitt,
 * tragende Wirkung, Lage innen/außen sowie eine freie Bemerkung. Die
 * Attribute hängen am Bauteil, wandern in die Positionsliste, in die
 * Auswertung und als Eigenschaftssätze in die IFC-Datei.
 *
 * Feuerwiderstand: DIN 4102-2 kennt die Benennungen F 30 bis F 180 für
 * tragende und raumabschließende Bauteile; DIN EN 13501-2 beschreibt
 * dieselbe Eigenschaft mit den Kennbuchstaben R (Tragfähigkeit),
 * E (Raumabschluss) und I (Wärmedämmung) und der Zeit in Minuten. Beide
 * Bezeichnungen stehen nebeneinander, weil Bauteilnachweise und
 * Bauordnungsrecht noch beide verwenden.
 *
 * Baustoffklasse: DIN 4102-1 (A1 bis B3) neben DIN EN 13501-1 (A1 bis F).
 * Die Zuordnung ist eine Entsprechung, keine Umrechnung – maßgebend ist
 * der Verwendbarkeitsnachweis des Baustoffs.
 *
 * NICHT geführt wird der Nachweis selbst: Ob ein Bauteil seine
 * Feuerwiderstandsklasse erreicht, folgt aus DIN EN 1992-1-2 bzw.
 * DIN EN 1993-1-2 oder aus der Tabelle der DIN 4102-4 und ist vom
 * Brandschutznachweis zu führen. Hier wird die Anforderung festgehalten
 * und weitergegeben.
 */

/** Feuerwiderstand nach DIN 4102-2 mit der Entsprechung nach DIN EN 13501-2. */
const FEUERWIDERSTAND = {
  "": { name: "ohne Anforderung", en: "", minuten: 0 },
  F30: { name: "F 30 – feuerhemmend", en: "REI 30", minuten: 30 },
  F60: { name: "F 60 – hochfeuerhemmend", en: "REI 60", minuten: 60 },
  F90: { name: "F 90 – feuerbeständig", en: "REI 90", minuten: 90 },
  F120: { name: "F 120 – hochfeuerbeständig", en: "REI 120", minuten: 120 },
  F180: { name: "F 180", en: "REI 180", minuten: 180 },
  R30: { name: "R 30 – nur Tragfähigkeit", en: "R 30", minuten: 30 },
  R90: { name: "R 90 – nur Tragfähigkeit", en: "R 90", minuten: 90 },
  EI30: { name: "EI 30 – nur Raumabschluss", en: "EI 30", minuten: 30 },
  EI90: { name: "EI 90 – nur Raumabschluss", en: "EI 90", minuten: 90 },
};

/** Baustoffklasse nach DIN 4102-1 mit der Entsprechung nach DIN EN 13501-1. */
const BAUSTOFFKLASSEN = {
  "": { name: "ohne Angabe", en: "" },
  A1: { name: "A1 – nicht brennbar", en: "A1" },
  A2: { name: "A2 – nicht brennbar, geringe Anteile", en: "A2-s1,d0" },
  B1: { name: "B1 – schwer entflammbar", en: "C-s3,d0" },
  B2: { name: "B2 – normal entflammbar", en: "E" },
  B3: { name: "B3 – leicht entflammbar", en: "F" },
};

/** Gewerke nach der Gliederung der VOB/C. */
const GEWERKE = {
  "": "ohne Zuordnung",
  erdarbeiten: "Erdarbeiten (DIN 18300)",
  beton: "Beton- und Stahlbetonarbeiten (DIN 18331)",
  mauer: "Mauerarbeiten (DIN 18330)",
  stahlbau: "Stahlbauarbeiten (DIN 18335)",
  zimmer: "Zimmer- und Holzbauarbeiten (DIN 18334)",
  abdichtung: "Abdichtungsarbeiten (DIN 18336)",
  dach: "Dachdeckungsarbeiten (DIN 18338)",
  putz: "Putz- und Stuckarbeiten (DIN 18350)",
  estrich: "Estricharbeiten (DIN 18353)",
  fenster: "Fenster und Türen (DIN 18355/18360)",
  ausbau: "Ausbau, sonstiges",
};

/** Freie Vorbelegung je Bauteilart – der Anwender kann sie überschreiben. */
const ATTRIBUT_VORGABE = {
  // Betonbauteile
  streifenfundament: { gewerk: "beton", baustoff: "A1", tragend: true, aussen: true },
  einzelfundament: { gewerk: "beton", baustoff: "A1", tragend: true, aussen: true },
  koecherfundament: { gewerk: "beton", baustoff: "A1", tragend: true, aussen: true },
  bohrpfahl: { gewerk: "beton", baustoff: "A1", tragend: true, aussen: true },
  bodenplatte: { gewerk: "beton", baustoff: "A1", tragend: true, aussen: true },
  decke: { gewerk: "beton", baustoff: "A1", tragend: true, feuer: "F90" },
  wand: { gewerk: "beton", baustoff: "A1", tragend: true, feuer: "F90" },
  kellerwand: { gewerk: "beton", baustoff: "A1", tragend: true, aussen: true, feuer: "F90" },
  stuetze: { gewerk: "beton", baustoff: "A1", tragend: true, feuer: "F90" },
  stuetze_rund: { gewerk: "beton", baustoff: "A1", tragend: true, feuer: "F90" },
  unterzug: { gewerk: "beton", baustoff: "A1", tragend: true, feuer: "F90" },
  treppe: { gewerk: "beton", baustoff: "A1", tragend: true, feuer: "F90" },
  // Stahlbau: Feuerwiderstand bleibt offen – er folgt aus der Bekleidung
  // bzw. dem Nachweis nach DIN EN 1993-1-2 und ist eine Projektfestlegung
  stahlstab: { gewerk: "stahlbau", baustoff: "A1", tragend: true },
  // Architektur-Bauteile
  wand_aussen: { gewerk: "mauer", tragend: true, aussen: true, feuer: "F90" },
  wand_innen: { gewerk: "mauer", tragend: false, feuer: "F30" },
  dach: { gewerk: "dach", aussen: true },
};

/** Attribute eines Bauteils mit Vorbelegung nach Bauteilart. */
function bauteilAttribute(element) {
  const vorgabe = ATTRIBUT_VORGABE[element.kind] || {};
  return Object.assign({
    feuer: "", baustoff: "", gewerk: "", abschnitt: "",
    tragend: false, aussen: false, bemerkung: "",
  }, vorgabe, element.attribute || {});
}

/** Kurztext des Feuerwiderstands für Tabellen und Pläne: „F 90 (REI 90)". */
function feuerText(schluessel) {
  const f = FEUERWIDERSTAND[schluessel || ""] || FEUERWIDERSTAND[""];
  if (!f.minuten) return "–";
  const kurz = f.name.split(" – ")[0];
  return f.en && f.en !== kurz ? `${kurz} (${f.en})` : kurz;
}

/** Kurztext der Baustoffklasse: „A1 (A1)" bzw. „B1 (C-s3,d0)". */
function baustoffText(schluessel) {
  const b = BAUSTOFFKLASSEN[schluessel || ""] || BAUSTOFFKLASSEN[""];
  if (!schluessel) return "–";
  return b.en && b.en !== schluessel ? `${schluessel} (${b.en})` : schluessel;
}

/**
 * Auswertung der Attribute über alle Bauteile: Wie viele Bauteile tragen
 * welche Anforderung, und wo fehlt sie noch?
 *
 * @param {Array} bauteile - [{ bezeichnung, typName, kategorie, attribute, menge }]
 * @returns {Object} { jeFeuer, jeGewerk, ohneFeuer, ohneGewerk, gesamt }
 */
function attributAuswertung(bauteile) {
  const jeFeuer = new Map();
  const jeGewerk = new Map();
  let ohneFeuer = 0, ohneGewerk = 0;

  bauteile.forEach((b) => {
    const a = b.attribute;
    const feuer = a.feuer || "";
    const gewerk = a.gewerk || "";
    jeFeuer.set(feuer, (jeFeuer.get(feuer) || 0) + 1);
    jeGewerk.set(gewerk, (jeGewerk.get(gewerk) || 0) + 1);
    if (!feuer) ohneFeuer += 1;
    if (!gewerk) ohneGewerk += 1;
  });

  const liste = (karte, namen) => Array.from(karte.entries())
    .map(([k, n]) => ({ schluessel: k, name: namen(k), anzahl: n }))
    .sort((x, y) => y.anzahl - x.anzahl);

  return {
    gesamt: bauteile.length,
    ohneFeuer, ohneGewerk,
    jeFeuer: liste(jeFeuer, (k) => (FEUERWIDERSTAND[k] || FEUERWIDERSTAND[""]).name),
    jeGewerk: liste(jeGewerk, (k) => GEWERKE[k] || GEWERKE[""]),
  };
}
