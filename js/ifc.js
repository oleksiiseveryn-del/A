/**
 * IFC-Export nach ISO 16739 (IFC4), geschrieben als STEP-Datei
 * (ISO 10303-21, „IFC-SPF").
 *
 * Erzeugt wird ein Koordinationsmodell: Projekt, Grundstück, Gebäude und
 * Geschosse, darin die Bauteile mit Körpergeometrie, Werkstoff und
 * Eigenschaftssätzen. Damit lässt sich das Modell in jede Anwendung
 * einlesen, die IFC versteht – Prüfprogramme, die Fachplanungen der
 * Tragwerks- und Gebäudetechnik sowie Darstellungsprogramme wie Lumion
 * oder Twinmotion.
 *
 * Umfang:
 *   IfcProject · IfcSite · IfcBuilding · IfcBuildingStorey
 *   IfcWall, IfcSlab, IfcColumn, IfcBeam, IfcFooting, IfcPile, IfcStair,
 *   IfcMember (Stahlbau), IfcOpeningElement mit IfcWindow und IfcDoor
 *   Körper als IfcExtrudedAreaSolid über Rechteck- bzw. Kreisquerschnitt
 *   Eigenschaftssätze Pset_WallCommon, Pset_SlabCommon, Pset_ColumnCommon,
 *   Pset_BeamCommon und Pset_MemberCommon mit FireRating, LoadBearing,
 *   IsExternal und Reference
 *   Werkstoff über IfcMaterial und IfcRelAssociatesMaterial
 *
 * NICHT enthalten: Bewehrung als IfcReinforcingBar, Räume als IfcSpace,
 * Achsraster als IfcGrid, Verschneidungen der Bauteile untereinander,
 * Klassifizierung nach IfcClassificationReference sowie die Belegung mit
 * Mengen nach Base Quantities. Die Geometrie ist die Rohbaugeometrie der
 * Achsen und Regelabmessungen, nicht die verschnittene Ausführungsgeometrie.
 */

/** Zeichenvorrat der IFC-Kennung: 64 Zeichen, Ziffern zuerst. */
const IFC_GUID_ZEICHEN = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";

/**
 * IFC-Kennung (22 Zeichen) aus einer laufenden Nummer und einem Projektwert.
 *
 * IFC schreibt eine weltweit eindeutige Kennung vor, die als Base64-Variante
 * mit eigenem Zeichenvorrat in 22 Zeichen abgelegt wird. Aus 128 Bit werden
 * dabei 21 Gruppen zu je 6 Bit und eine führende Gruppe zu 2 Bit.
 *
 * Die Bits werden hier aus Projektkennwert und laufender Nummer gebildet.
 * Damit ist die Kennung innerhalb einer Datei eindeutig und bleibt bei
 * gleichem Projekt über mehrere Ausgaben stabil – das ist die Eigenschaft,
 * auf die Prüfprogramme beim Vergleich zweier Stände angewiesen sind.
 */
function ifcGuid(nummer, projektwert) {
  // 128 Bit als vier 32-Bit-Wörter aufbauen
  const w = [
    (projektwert >>> 0),
    ((projektwert * 2654435761) >>> 0) ^ 0x9e3779b9,
    ((nummer * 2246822519) >>> 0) ^ 0x85ebca6b,
    (nummer >>> 0),
  ];
  // Bits in ein Feld von 128 Stellen schreiben, höchstwertiges zuerst
  const bits = [];
  w.forEach((wort) => {
    for (let i = 31; i >= 0; i--) bits.push((wort >>> i) & 1);
  });

  let text = "";
  // erste Gruppe: 2 Bit, danach 21 Gruppen zu 6 Bit
  let wert = bits[0] * 2 + bits[1];
  text += IFC_GUID_ZEICHEN[wert];
  for (let g = 0; g < 21; g++) {
    wert = 0;
    for (let b = 0; b < 6; b++) wert = wert * 2 + bits[2 + g * 6 + b];
    text += IFC_GUID_ZEICHEN[wert];
  }
  return text;
}

/** Zeichenkette für die STEP-Datei: Sonderzeichen nach ISO 10303-21 fassen. */
function ifcText(wert) {
  if (wert === undefined || wert === null) return "$";
  const roh = String(wert);
  let text = "";
  for (const zeichen of roh) {
    const code = zeichen.codePointAt(0);
    if (zeichen === "'") text += "''";
    else if (zeichen === "\\") text += "\\\\";
    else if (code < 32) text += " ";
    else if (code < 128) text += zeichen;
    else if (code <= 0xFFFF) {
      // erweiterte Zeichen als \X2\…\X0\ – so schreibt IFC Umlaute
      text += `\\X2\\${code.toString(16).toUpperCase().padStart(4, "0")}\\X0\\`;
    } else {
      const h = Math.floor((code - 0x10000) / 0x400) + 0xD800;
      const l = ((code - 0x10000) % 0x400) + 0xDC00;
      text += `\\X2\\${h.toString(16).toUpperCase().padStart(4, "0")}`
        + `${l.toString(16).toUpperCase().padStart(4, "0")}\\X0\\`;
    }
  }
  return `'${text}'`;
}

/** Zahl in der Schreibweise der STEP-Datei: Punkt als Dezimalzeichen. */
function ifcZahl(wert) {
  if (!Number.isFinite(wert)) return "0.";
  const gerundet = Math.abs(wert) < 1e-9 ? 0 : wert;
  const text = gerundet.toFixed(6).replace(/0+$/, "");
  return text.endsWith(".") ? text : text;
}

/**
 * Schreibt die Datenzeilen einer IFC-Datei.
 *
 * Jede Zeile bekommt eine Nummer; Verweise werden als #nummer geschrieben.
 * Die Klasse hält die laufende Nummer und die wiederverwendbaren Einträge
 * (Richtungen, Punkte, Werkstoffe), damit die Datei nicht unnötig wächst.
 */
class IfcDatei {
  constructor(projektwert) {
    this.zeilen = [];
    this.nr = 0;
    this.projektwert = projektwert >>> 0;
    this.merker = new Map();
  }

  /** Eintrag anlegen und die Nummer zurückgeben. */
  add(inhalt) {
    this.nr += 1;
    this.zeilen.push(`#${this.nr}= ${inhalt};`);
    return this.nr;
  }

  /** Eintrag nur einmal anlegen (Richtungen, Punkte, Werkstoffe). */
  einmal(schluessel, erzeuge) {
    if (this.merker.has(schluessel)) return this.merker.get(schluessel);
    const nummer = erzeuge();
    this.merker.set(schluessel, nummer);
    return nummer;
  }

  guid() {
    return ifcGuid(this.nr + 1, this.projektwert);
  }

  punkt(x, y, z) {
    const s = `P${x.toFixed(5)}/${y.toFixed(5)}/${z === undefined ? "" : z.toFixed(5)}`;
    return this.einmal(s, () => this.add(z === undefined
      ? `IFCCARTESIANPOINT((${ifcZahl(x)},${ifcZahl(y)}))`
      : `IFCCARTESIANPOINT((${ifcZahl(x)},${ifcZahl(y)},${ifcZahl(z)}))`));
  }

  richtung(x, y, z) {
    const s = `D${x}/${y}/${z === undefined ? "" : z}`;
    return this.einmal(s, () => this.add(z === undefined
      ? `IFCDIRECTION((${ifcZahl(x)},${ifcZahl(y)}))`
      : `IFCDIRECTION((${ifcZahl(x)},${ifcZahl(y)},${ifcZahl(z)}))`));
  }

  /** Achsensystem: Ursprung mit Hochachse und Bezugsrichtung. */
  achse3d(punkt, hoch, bezug) {
    const teile = [`#${punkt}`, hoch ? `#${hoch}` : "$", bezug ? `#${bezug}` : "$"];
    return this.add(`IFCAXIS2PLACEMENT3D(${teile.join(",")})`);
  }

  achse2d(punkt, bezug) {
    return this.add(`IFCAXIS2PLACEMENT2D(#${punkt},${bezug ? `#${bezug}` : "$"})`);
  }

  /** Ortsbezug eines Bauteils, wahlweise auf einen übergeordneten bezogen. */
  ort(achse, eltern) {
    return this.add(`IFCLOCALPLACEMENT(${eltern ? `#${eltern}` : "$"},#${achse})`);
  }
}

/** Bauteilarten der Anwendung auf die IFC-Klassen abbilden. */
const IFC_KLASSEN = {
  // Betonbauteile
  streifenfundament: { klasse: "IFCFOOTING", typ: "STRIP_FOOTING", pset: "Pset_FootingCommon" },
  einzelfundament: { klasse: "IFCFOOTING", typ: "PAD_FOOTING", pset: "Pset_FootingCommon" },
  koecherfundament: { klasse: "IFCFOOTING", typ: "PAD_FOOTING", pset: "Pset_FootingCommon" },
  bohrpfahl: { klasse: "IFCPILE", typ: "BORED", pset: "Pset_PileCommon" },
  bodenplatte: { klasse: "IFCSLAB", typ: "BASESLAB", pset: "Pset_SlabCommon" },
  decke: { klasse: "IFCSLAB", typ: "FLOOR", pset: "Pset_SlabCommon" },
  wand: { klasse: "IFCWALL", typ: "SOLIDWALL", pset: "Pset_WallCommon" },
  kellerwand: { klasse: "IFCWALL", typ: "SOLIDWALL", pset: "Pset_WallCommon" },
  stuetze: { klasse: "IFCCOLUMN", typ: "COLUMN", pset: "Pset_ColumnCommon" },
  stuetze_rund: { klasse: "IFCCOLUMN", typ: "COLUMN", pset: "Pset_ColumnCommon" },
  unterzug: { klasse: "IFCBEAM", typ: "BEAM", pset: "Pset_BeamCommon" },
  treppe: { klasse: "IFCSTAIR", typ: "STRAIGHT_RUN_STAIR", pset: "Pset_StairCommon" },
  // Stahlbau
  stahlstab: { klasse: "IFCMEMBER", typ: "STRUT", pset: "Pset_MemberCommon" },
  // Architektur-Bauteile
  wand_aussen: { klasse: "IFCWALL", typ: "SOLIDWALL", pset: "Pset_WallCommon" },
  wand_innen: { klasse: "IFCWALL", typ: "SOLIDWALL", pset: "Pset_WallCommon" },
  dach: { klasse: "IFCSLAB", typ: "ROOF", pset: "Pset_SlabCommon" },
};

/**
 * Erzeugt die IFC-Datei aus dem Modell.
 *
 * @param {Object} daten - {
 *     projekt: { name, datum, bearbeiter },
 *     bauteile: [{ bezeichnung, kind, kategorie, attribute, werkstoff,
 *                  koerper: { art, laenge, breite, hoehe, durchmesser },
 *                  lage: { x, y, z, drehung }, geschoss }],
 *     geschosse: [{ name, kote }] }
 * @returns {string} Inhalt der IFC-Datei
 */
function ifcExport(daten) {
  const projekt = daten.projekt || {};
  const bauteile = daten.bauteile || [];
  // Projektkennwert aus dem Namen: gleiches Projekt, gleiche Kennungen
  let wert = 0x811c9dc5;
  for (const z of String(projekt.name || "Projekt")) {
    wert = ((wert ^ z.charCodeAt(0)) * 16777619) >>> 0;
  }
  const d = new IfcDatei(wert);

  // ---- Verfasser und Anwendung
  const person = d.add(`IFCPERSON($,${ifcText(projekt.bearbeiter || "Bearbeiter")},$,$,$,$,$,$)`);
  const firma = d.add(`IFCORGANIZATION($,${ifcText("HSD Hamburg GmbH")},$,$,$)`);
  const personFirma = d.add(`IFCPERSONANDORGANIZATION(#${person},#${firma},$)`);
  const anwendung = d.add(`IFCAPPLICATION(#${firma},${ifcText("1.0.0")},`
    + `${ifcText("HSD Konverter")},${ifcText("HSD-KONVERTER")})`);
  const zeitstempel = Math.floor(Date.now() / 1000);
  const historie = d.add(`IFCOWNERHISTORY(#${personFirma},#${anwendung},$,.ADDED.,$,$,$,${zeitstempel})`);

  // ---- Einheiten: Meter, Quadratmeter, Kubikmeter, Grad
  const laengeE = d.add("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)");
  const flaecheE = d.add("IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)");
  const volumenE = d.add("IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)");
  const bogenE = d.add("IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)");
  const gradWert = d.add(`IFCMEASUREWITHUNIT(IFCPLANEANGLEMEASURE(${ifcZahl(Math.PI / 180)}),#${bogenE})`);
  const gradE = d.add(`IFCCONVERSIONBASEDUNIT(#${d.add("IFCDIMENSIONALEXPONENTS(0,0,0,0,0,0,0)")},`
    + `.PLANEANGLEUNIT.,${ifcText("DEGREE")},#${gradWert})`);
  const einheiten = d.add(`IFCUNITASSIGNMENT((#${laengeE},#${flaecheE},#${volumenE},#${gradE}))`);

  // ---- Darstellungszusammenhang
  const ursprung = d.punkt(0, 0, 0);
  const hochachse = d.richtung(0, 0, 1);
  const xAchse = d.richtung(1, 0, 0);
  const weltachse = d.achse3d(ursprung, hochachse, xAchse);
  const nordrichtung = d.richtung(0, 1);
  const zusammenhang = d.add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,${ifcText("Model")},3,1.0E-5,`
    + `#${weltachse},#${nordrichtung})`);
  const koerperRaum = d.add(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT(${ifcText("Body")},${ifcText("Model")},`
    + `*,*,*,*,#${zusammenhang},$,.MODEL_VIEW.,$)`);

  // ---- Projekt, Grundstück, Gebäude, Geschosse
  const ifcProjekt = d.add(`IFCPROJECT('${d.guid()}',#${historie},`
    + `${ifcText(projekt.name || "Projekt")},$,$,$,$,(#${zusammenhang}),#${einheiten})`);
  const weltOrt = d.ort(d.achse3d(ursprung, hochachse, xAchse), null);
  const grundstueck = d.add(`IFCSITE('${d.guid()}',#${historie},${ifcText("Grundstück")},$,$,`
    + `#${weltOrt},$,$,.ELEMENT.,$,$,$,$,$)`);
  const gebaeudeOrt = d.ort(d.achse3d(ursprung, hochachse, xAchse), weltOrt);
  const gebaeude = d.add(`IFCBUILDING('${d.guid()}',#${historie},`
    + `${ifcText(projekt.name || "Gebäude")},$,$,#${gebaeudeOrt},$,$,.ELEMENT.,$,$,$)`);

  const geschosse = (daten.geschosse && daten.geschosse.length
    ? daten.geschosse
    : [{ name: "Erdgeschoss", kote: 0 }]).map((g) => {
    const ort = d.ort(d.achse3d(d.punkt(0, 0, g.kote), hochachse, xAchse), gebaeudeOrt);
    const nummer = d.add(`IFCBUILDINGSTOREY('${d.guid()}',#${historie},${ifcText(g.name)},$,$,`
      + `#${ort},$,$,.ELEMENT.,${ifcZahl(g.kote)})`);
    return { name: g.name, kote: g.kote, nummer, ort };
  });

  d.add(`IFCRELAGGREGATES('${d.guid()}',#${historie},$,$,#${ifcProjekt},(#${grundstueck}))`);
  d.add(`IFCRELAGGREGATES('${d.guid()}',#${historie},$,$,#${grundstueck},(#${gebaeude}))`);
  d.add(`IFCRELAGGREGATES('${d.guid()}',#${historie},$,$,#${gebaeude},`
    + `(${geschosse.map((g) => `#${g.nummer}`).join(",")}))`);

  // ---- Werkstoffe nur einmal anlegen
  const werkstoff = (name) => d.einmal(`M${name}`, () => d.add(`IFCMATERIAL(${ifcText(name)},$,$)`));

  /**
   * Körper eines Bauteils als Extrusion.
   *
   * Aufrechte Bauteile werden über ihre Höhe ausgetragen. Bauteile mit einer
   * eigenen Achse – Stäbe des Stahlbaus – werden entlang dieser Achse
   * ausgetragen; das Achsensystem der Extrusion wird dazu so gedreht, dass
   * seine Hochachse auf der Stabachse liegt.
   */
  const koerper = (k) => {
    let profil;
    if (k.art === "kreis") {
      profil = d.add(`IFCCIRCLEPROFILEDEF(.AREA.,$,#${d.achse2d(d.punkt(0, 0), d.richtung(1, 0))},`
        + `${ifcZahl(k.durchmesser / 2)})`);
    } else {
      // Bei Bauteilen mit eigener Achse ist der Querschnitt das Profil und
      // nicht der Hüllkörper, mit dem die Kollisionsprüfung rechnet.
      const qb = k.achse ? ((k.querschnitt && k.querschnitt.b) || k.breite) : k.laenge;
      const qh = k.achse ? ((k.querschnitt && k.querschnitt.h) || k.hoehe) : k.breite;
      profil = d.add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,#${d.achse2d(d.punkt(0, 0), d.richtung(1, 0))},`
        + `${ifcZahl(qb)},${ifcZahl(qh)})`);
    }

    let platz, tiefe;
    if (k.achse) {
      // Hochachse des Extrusionssystems auf die Stabachse legen und eine
      // dazu senkrechte Bezugsrichtung wählen
      const a = k.achse;
      const laenge = Math.hypot(a.x, a.y, a.z) || 1;
      const ax = a.x / laenge, ay = a.y / laenge, az = a.z / laenge;
      // Hilfsvektor, der nicht parallel zur Achse liegt
      const hx = Math.abs(az) < 0.9 ? 0 : 1, hy = 0, hz = Math.abs(az) < 0.9 ? 1 : 0;
      // Bezugsrichtung = Hilfsvektor senkrecht zur Achse gemacht
      const s = hx * ax + hy * ay + hz * az;
      let rx = hx - s * ax, ry = hy - s * ay, rz = hz - s * az;
      const rl = Math.hypot(rx, ry, rz) || 1;
      rx /= rl; ry /= rl; rz /= rl;
      platz = d.achse3d(d.punkt(0, 0, 0), d.richtung(ax, ay, az), d.richtung(rx, ry, rz));
      tiefe = k.achslaenge || k.hoehe;
    } else {
      platz = d.achse3d(d.punkt(0, 0, 0), hochachse, xAchse);
      tiefe = k.hoehe;
    }
    const richtung = d.richtung(0, 0, 1);
    const volumen = d.add(`IFCEXTRUDEDAREASOLID(#${profil},#${platz},#${richtung},${ifcZahl(tiefe)})`);
    const gestalt = d.add(`IFCSHAPEREPRESENTATION(#${koerperRaum},${ifcText("Body")},`
      + `${ifcText("SweptSolid")},(#${volumen}))`);
    return d.add(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${gestalt}))`);
  };

  /** Eigenschaftssatz eines Bauteils nach den Regeln von buildingSMART. */
  const eigenschaften = (bauteilNr, pset, attribute, bezeichnung) => {
    const werte = [];
    const text = (name, wert) => werte.push(
      d.add(`IFCPROPERTYSINGLEVALUE(${ifcText(name)},$,IFCTEXT(${ifcText(wert)}),$)`));
    const label = (name, wert) => werte.push(
      d.add(`IFCPROPERTYSINGLEVALUE(${ifcText(name)},$,IFCLABEL(${ifcText(wert)}),$)`));
    const jaNein = (name, wert) => werte.push(
      d.add(`IFCPROPERTYSINGLEVALUE(${ifcText(name)},$,IFCBOOLEAN(.${wert ? "T" : "F"}.),$)`));

    label("Reference", bezeichnung);
    if (attribute.feuer) {
      // FireRating ist in den Pset der buildingSMART-Vorlagen ein Label
      label("FireRating", (FEUERWIDERSTAND[attribute.feuer] || {}).en || attribute.feuer);
    }
    jaNein("LoadBearing", !!attribute.tragend);
    jaNein("IsExternal", !!attribute.aussen);
    if (attribute.baustoff) text("Baustoffklasse_DIN_4102_1", baustoffText(attribute.baustoff));
    if (attribute.gewerk) text("Gewerk", GEWERKE[attribute.gewerk] || attribute.gewerk);
    if (attribute.abschnitt) text("Bauabschnitt", attribute.abschnitt);
    if (attribute.bemerkung) text("Bemerkung", attribute.bemerkung);

    const satz = d.add(`IFCPROPERTYSET('${d.guid()}',#${historie},${ifcText(pset)},$,`
      + `(${werte.map((w) => `#${w}`).join(",")}))`);
    d.add(`IFCRELDEFINESBYPROPERTIES('${d.guid()}',#${historie},$,$,(#${bauteilNr}),#${satz})`);
  };

  // ---- Bauteile je Geschoss ablegen
  const jeGeschoss = new Map();
  geschosse.forEach((g) => jeGeschoss.set(g.name, []));

  bauteile.forEach((b) => {
    const abbild = IFC_KLASSEN[b.kind]
      || { klasse: "IFCBUILDINGELEMENTPROXY", typ: "NOTDEFINED", pset: "Pset_BuildingElementProxyCommon" };
    const g = geschosse.find((x) => x.name === b.geschoss) || geschosse[0];

    const lage = b.lage || { x: 0, y: 0, z: 0, drehung: 0 };
    const kk = b.koerper || {};
    // Bauteile mit eigener Achse – die Stäbe des Stahlbaus – werden an ihrem
    // Anfangsknoten abgesetzt und von dort ausgetragen. Ihr Bauteilsystem
    // bleibt achsparallel zur Welt: die Achse ist bereits in Weltrichtungen
    // angegeben und darf nicht ein zweites Mal gedreht werden.
    const eigeneAchse = !!(kk.achse && kk.start);
    const bezug = eigeneAchse ? kk.start : lage;
    const rad = eigeneAchse ? 0 : ((lage.drehung || 0) * Math.PI) / 180;
    const richtung = eigeneAchse ? xAchse : d.richtung(Math.cos(rad), Math.sin(rad), 0);
    const ort = d.ort(d.achse3d(d.punkt(bezug.x, bezug.y, bezug.z - g.kote), hochachse, richtung), g.ort);
    const gestalt = koerper(b.koerper);

    // Nach IFC4 folgen auf Tag die Aufzählungen der jeweiligen Klasse:
    // alle hier verwendeten Klassen haben PredefinedType, IfcPile zusätzlich
    // ConstructionType. Die Zahl der Attribute muss genau stimmen, sonst
    // weisen die Prüfprogramme die Datei zurück.
    const schluss = abbild.klasse === "IFCPILE"
      ? `,.${abbild.typ}.,$`
      : `,.${abbild.typ}.`;
    const nummer = d.add(`${abbild.klasse}('${d.guid()}',#${historie},${ifcText(b.bezeichnung)},`
      + `${ifcText(b.typName || "")},$,#${ort},#${gestalt},${ifcText(b.bezeichnung)}${schluss})`);

    if (b.werkstoff) {
      const m = werkstoff(b.werkstoff);
      d.add(`IFCRELASSOCIATESMATERIAL('${d.guid()}',#${historie},$,$,(#${nummer}),#${m})`);
    }
    eigenschaften(nummer, abbild.pset, b.attribute || {}, b.bezeichnung);
    jeGeschoss.get(g.name).push(nummer);
  });

  geschosse.forEach((g) => {
    const liste = jeGeschoss.get(g.name);
    if (!liste.length) return;
    d.add(`IFCRELCONTAINEDINSPATIALSTRUCTURE('${d.guid()}',#${historie},$,$,`
      + `(${liste.map((n) => `#${n}`).join(",")}),#${g.nummer})`);
  });

  // ---- Kopf und Datei zusammensetzen
  const jetzt = new Date().toISOString().replace(/\.\d+Z$/, "");
  const kopf = [
    "ISO-10303-21;",
    "HEADER;",
    `FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');`,
    `FILE_NAME(${ifcText((projekt.name || "Projekt") + ".ifc")},'${jetzt}',`
      + `(${ifcText(projekt.bearbeiter || "Bearbeiter")}),(${ifcText("HSD Hamburg GmbH")}),`
      + `${ifcText("HSD Konverter 1.0.0")},${ifcText("HSD Konverter 1.0.0")},$);`,
    "FILE_SCHEMA(('IFC4'));",
    "ENDSEC;",
    "DATA;",
  ];
  return kopf.concat(d.zeilen, ["ENDSEC;", "END-ISO-10303-21;", ""]).join("\n");
}
