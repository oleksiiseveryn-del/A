/**
 * Punktwolken aus dem 3D-Laserscan: Bauen im Bestand.
 *
 * Eingelesen werden die Formate, die jede Scannersoftware ausgibt:
 *
 *   LAS      1.0 bis 1.4, Punktformate 0 bis 8 (ASPRS-Festlegung)
 *   PLY      ascii und binary_little_endian
 *   PTS      erste Zeile Punktzahl, danach x y z [i] [r g b]
 *   XYZ/ASC/TXT/CSV  x y z [i] [r g b], Trennzeichen Leerzeichen,
 *            Tabulator, Komma oder Strichpunkt
 *
 * Achsen: Der Scan liegt in der Lagebezeichnung des Vermessers vor –
 * x nach Osten, y nach Norden, z nach oben. Die Anwendung rechnet mit
 * x und z im Grundriss und y in der Höhe. Beim Einlesen wird deshalb
 * getauscht: Modell-x = Scan-x, Modell-z = Scan-y, Modell-y = Scan-z.
 *
 * Bezugspunkt: Ein Scan in ETRS89/UTM trägt Koordinaten in der Größe von
 * 32 500 000 / 5 930 000 m. Mit solchen Zahlen rechnet keine Darstellung
 * sauber (die Gleitkommazahl der Grafikkarte hat 7 Stellen). Beim Einlesen
 * wird deshalb ein Bezugspunkt abgezogen und mitgeführt. Er ist der
 * Projektnullpunkt und gehört in jede Weitergabe – ohne ihn ist der
 * Lagebezug nach DIN 18710-1 verloren.
 *
 * NICHT gelesen: LAZ (gepackt), E57 und die Hausformate der Scanner
 * (Faro .fls, Leica .ptx-Projekte, Trimble .rwp). Diese Programme
 * schreiben auf Wunsch LAS, PTS oder PLY; das ist der offene Weg.
 * NICHT enthalten: Registrierung mehrerer Standpunkte zueinander, das
 * Entfernen beweglicher Gegenstände und die Vermaschung zu Flächen.
 */

/** Formate mit ihren Dateiendungen. */
const PUNKTWOLKE_FORMATE = {
  las: { endungen: ["las"], name: "LAS (ASPRS)", binaer: true },
  ply: { endungen: ["ply"], name: "PLY", binaer: true },
  pts: { endungen: ["pts"], name: "PTS", binaer: false },
  xyz: { endungen: ["xyz", "asc", "txt", "csv"], name: "XYZ/ASCII", binaer: false },
};

/** Format aus dem Dateinamen bestimmen. */
function punktwolkeFormat(name) {
  const endung = String(name || "").split(".").pop().toLowerCase();
  for (const schluessel of Object.keys(PUNKTWOLKE_FORMATE)) {
    if (PUNKTWOLKE_FORMATE[schluessel].endungen.indexOf(endung) >= 0) return schluessel;
  }
  return null;
}

/**
 * Leere Wolke anlegen.
 * Die Punkte liegen als Float32Array (x, y, z je Punkt) relativ zum
 * Bezugspunkt; die Farben als Uint8Array (r, g, b) oder null.
 */
function punktwolkeLeer() {
  return {
    anzahl: 0,
    xyz: new Float32Array(0),
    farbe: null,
    intensitaet: null,
    bezug: { x: 0, y: 0, z: 0 },
    grenzen: null,
    format: "",
    quelle: "",
    hinweise: [],
  };
}

/**
 * Wolke aus gelesenen Rohpunkten aufbauen.
 *
 * @param {Object} roh - { x: Float64Array, y, z, r, g, b, i, anzahl }
 *        in der Lagebezeichnung des Scans (z = Höhe)
 * @param {Object} optionen - { bezug } fester Bezugspunkt in Scankoordinaten
 */
function punktwolkeAufbauen(roh, optionen) {
  const n = roh.anzahl;
  const wolke = punktwolkeLeer();
  if (!n) return wolke;

  // Grenzen in Scankoordinaten
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    if (roh.x[i] < minX) minX = roh.x[i];
    if (roh.x[i] > maxX) maxX = roh.x[i];
    if (roh.y[i] < minY) minY = roh.y[i];
    if (roh.y[i] > maxY) maxY = roh.y[i];
    if (roh.z[i] < minZ) minZ = roh.z[i];
    if (roh.z[i] > maxZ) maxZ = roh.z[i];
  }

  // Bezugspunkt: die untere Ecke des Scans, auf ganze Meter abgerundet.
  // So bleiben die Zahlen klein und der Punkt ist eine merkbare Größe.
  const bezug = (optionen && optionen.bezug) || {
    x: Math.floor(minX), y: Math.floor(minY), z: Math.floor(minZ),
  };

  const xyz = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    // Achsentausch: Modell-x = Scan-x, Modell-y = Scan-z (Höhe), Modell-z = Scan-y
    xyz[i * 3] = roh.x[i] - bezug.x;
    xyz[i * 3 + 1] = roh.z[i] - bezug.z;
    xyz[i * 3 + 2] = roh.y[i] - bezug.y;
  }

  wolke.anzahl = n;
  wolke.xyz = xyz;
  wolke.farbe = roh.r ? roh.r : null;
  wolke.intensitaet = roh.i || null;
  wolke.bezug = bezug;
  wolke.grenzen = {
    min: { x: minX - bezug.x, y: minZ - bezug.z, z: minY - bezug.y },
    max: { x: maxX - bezug.x, y: maxZ - bezug.z, z: maxY - bezug.y },
    scanMin: { x: minX, y: minY, z: minZ },
    scanMax: { x: maxX, y: maxY, z: maxZ },
  };
  return wolke;
}

/* ------------------------------------------------------------------ LAS */

/**
 * LAS-Datei nach der Festlegung der ASPRS lesen.
 *
 * Der Kopf steht am Anfang: Versionsnummer, Abstand bis zu den Punkten,
 * Punktformat, Satzlänge, Maßstab und Verschiebung je Achse. Die
 * Koordinaten liegen als ganze Zahlen vor und werden mit Maßstab und
 * Verschiebung in Meter zurückgerechnet – so schreibt LAS die Punkte,
 * damit die Datei klein bleibt und die Genauigkeit festliegt.
 */
function punktwolkeAusLas(puffer, optionen) {
  const sicht = new DataView(puffer);
  const kennung = String.fromCharCode(sicht.getUint8(0), sicht.getUint8(1), sicht.getUint8(2), sicht.getUint8(3));
  if (kennung !== "LASF") throw new Error("Keine LAS-Datei: die Kennung „LASF“ fehlt.");

  const version = `${sicht.getUint8(24)}.${sicht.getUint8(25)}`;
  const kopfLaenge = sicht.getUint16(94, true);
  const punktBeginn = sicht.getUint32(96, true);
  let format = sicht.getUint8(104);
  const satzLaenge = sicht.getUint16(105, true);
  let anzahl = sicht.getUint32(107, true);

  if (format & 0x80) {
    throw new Error("Die Datei ist als LAZ gepackt. Bitte aus der Scannersoftware "
      + "als LAS, PTS oder PLY ausgeben – gepackte Dateien werden nicht gelesen.");
  }
  format = format & 0x3f;

  // LAS 1.4 führt die Punktzahl als 64-Bit-Zahl weiter hinten im Kopf
  if (kopfLaenge >= 375 && anzahl === 0) {
    const gross = sicht.getBigUint64(247, true);
    anzahl = Number(gross);
  }

  const mx = sicht.getFloat64(131, true), my = sicht.getFloat64(139, true), mz = sicht.getFloat64(147, true);
  const vx = sicht.getFloat64(155, true), vy = sicht.getFloat64(163, true), vz = sicht.getFloat64(171, true);

  // Lage der Farbe im Satz je Punktformat
  const farbVersatz = { 2: 20, 3: 28, 5: 28, 7: 30, 8: 30 }[format];
  const vorhanden = Math.floor((puffer.byteLength - punktBeginn) / satzLaenge);
  if (vorhanden < anzahl) anzahl = Math.max(0, vorhanden);

  const roh = {
    anzahl,
    x: new Float64Array(anzahl), y: new Float64Array(anzahl), z: new Float64Array(anzahl),
    i: new Uint16Array(anzahl),
    r: farbVersatz ? new Uint8Array(anzahl * 3) : null,
  };

  // Farben stehen als 16-Bit-Werte; manche Programme legen dort 8-Bit-Werte
  // ab. Der größte Wert entscheidet, wie umgerechnet wird.
  let farbeMax = 0;
  const rohFarbe = farbVersatz ? new Uint16Array(anzahl * 3) : null;

  for (let k = 0; k < anzahl; k++) {
    const p = punktBeginn + k * satzLaenge;
    roh.x[k] = sicht.getInt32(p, true) * mx + vx;
    roh.y[k] = sicht.getInt32(p + 4, true) * my + vy;
    roh.z[k] = sicht.getInt32(p + 8, true) * mz + vz;
    roh.i[k] = sicht.getUint16(p + 12, true);
    if (farbVersatz) {
      const rr = sicht.getUint16(p + farbVersatz, true);
      const gg = sicht.getUint16(p + farbVersatz + 2, true);
      const bb = sicht.getUint16(p + farbVersatz + 4, true);
      rohFarbe[k * 3] = rr; rohFarbe[k * 3 + 1] = gg; rohFarbe[k * 3 + 2] = bb;
      if (rr > farbeMax) farbeMax = rr;
      if (gg > farbeMax) farbeMax = gg;
      if (bb > farbeMax) farbeMax = bb;
    }
  }
  if (farbVersatz) {
    const teiler = farbeMax > 255 ? 257 : 1;
    for (let k = 0; k < anzahl * 3; k++) roh.r[k] = Math.min(255, Math.round(rohFarbe[k] / teiler));
  }

  const wolke = punktwolkeAufbauen(roh, optionen);
  wolke.format = `LAS ${version}, Punktformat ${format}`;
  wolke.hinweise.push(`Maßstab der Datei: ${mx} / ${my} / ${mz} m je Zähleinheit.`);
  if (!farbVersatz) wolke.hinweise.push("Punktformat ohne Farbe – dargestellt wird die Intensität.");
  return wolke;
}

/* ------------------------------------------------------------------ PLY */

/** PLY lesen: ascii und binary_little_endian. */
function punktwolkeAusPly(puffer, optionen) {
  const bytes = new Uint8Array(puffer);
  // Kopf ist Text und endet mit „end_header"
  let kopfEnde = -1;
  const suche = "end_header";
  for (let i = 0; i < Math.min(bytes.length, 100000); i++) {
    let treffer = true;
    for (let j = 0; j < suche.length; j++) {
      if (bytes[i + j] !== suche.charCodeAt(j)) { treffer = false; break; }
    }
    if (treffer) {
      kopfEnde = i + suche.length;
      while (kopfEnde < bytes.length && (bytes[kopfEnde] === 13 || bytes[kopfEnde] === 10)) kopfEnde += 1;
      break;
    }
  }
  if (kopfEnde < 0) throw new Error("Keine PLY-Datei: „end_header“ fehlt.");

  let kopf = "";
  for (let i = 0; i < kopfEnde; i++) kopf += String.fromCharCode(bytes[i]);
  const zeilen = kopf.split(/\r?\n/);
  let ablage = "ascii";
  let anzahl = 0;
  let inVertex = false;
  const felder = [];
  const groesse = {
    char: 1, uchar: 1, int8: 1, uint8: 1,
    short: 2, ushort: 2, int16: 2, uint16: 2,
    int: 4, uint: 4, int32: 4, uint32: 4, float: 4, float32: 4,
    double: 8, float64: 8,
  };

  zeilen.forEach((zeile) => {
    const teile = zeile.trim().split(/\s+/);
    if (teile[0] === "format") ablage = teile[1];
    else if (teile[0] === "element") {
      inVertex = teile[1] === "vertex";
      if (inVertex) anzahl = parseInt(teile[2], 10);
    } else if (teile[0] === "property" && inVertex && teile[1] !== "list") {
      felder.push({ typ: teile[1], name: teile[2], bytes: groesse[teile[1]] || 4 });
    }
  });
  if (ablage === "binary_big_endian") throw new Error("PLY in big endian wird nicht gelesen.");

  const spalte = (name) => felder.findIndex((f) => f.name === name);
  const ix = spalte("x"), iy = spalte("y"), iz = spalte("z");
  if (ix < 0 || iy < 0 || iz < 0) throw new Error("PLY ohne x, y, z.");
  const ir = spalte("red"), ig = spalte("green"), ib = spalte("blue");
  const hatFarbe = ir >= 0 && ig >= 0 && ib >= 0;

  const roh = {
    anzahl,
    x: new Float64Array(anzahl), y: new Float64Array(anzahl), z: new Float64Array(anzahl),
    r: hatFarbe ? new Uint8Array(anzahl * 3) : null,
  };

  if (ablage === "ascii") {
    let text = "";
    for (let i = kopfEnde; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
    const werte = text.trim().split(/\r?\n/);
    for (let k = 0; k < anzahl && k < werte.length; k++) {
      const t = werte[k].trim().split(/\s+/).map(Number);
      roh.x[k] = t[ix]; roh.y[k] = t[iy]; roh.z[k] = t[iz];
      if (hatFarbe) { roh.r[k * 3] = t[ir]; roh.r[k * 3 + 1] = t[ig]; roh.r[k * 3 + 2] = t[ib]; }
    }
  } else {
    const sicht = new DataView(puffer);
    const satz = felder.reduce((s, f) => s + f.bytes, 0);
    const versatz = [];
    let s = 0;
    felder.forEach((f) => { versatz.push(s); s += f.bytes; });
    const lies = (p, feld) => {
      const t = feld.typ;
      if (t === "float" || t === "float32") return sicht.getFloat32(p, true);
      if (t === "double" || t === "float64") return sicht.getFloat64(p, true);
      if (t === "uchar" || t === "uint8") return sicht.getUint8(p);
      if (t === "char" || t === "int8") return sicht.getInt8(p);
      if (t === "ushort" || t === "uint16") return sicht.getUint16(p, true);
      if (t === "short" || t === "int16") return sicht.getInt16(p, true);
      if (t === "uint" || t === "uint32") return sicht.getUint32(p, true);
      return sicht.getInt32(p, true);
    };
    for (let k = 0; k < anzahl; k++) {
      const p = kopfEnde + k * satz;
      if (p + satz > puffer.byteLength) { roh.anzahl = k; break; }
      roh.x[k] = lies(p + versatz[ix], felder[ix]);
      roh.y[k] = lies(p + versatz[iy], felder[iy]);
      roh.z[k] = lies(p + versatz[iz], felder[iz]);
      if (hatFarbe) {
        roh.r[k * 3] = lies(p + versatz[ir], felder[ir]);
        roh.r[k * 3 + 1] = lies(p + versatz[ig], felder[ig]);
        roh.r[k * 3 + 2] = lies(p + versatz[ib], felder[ib]);
      }
    }
  }

  const wolke = punktwolkeAufbauen(roh, optionen);
  wolke.format = `PLY (${ablage})`;
  return wolke;
}

/* ----------------------------------------------------------- PTS und XYZ */

/**
 * Textformate lesen: PTS mit Punktzahl in der ersten Zeile, sonst XYZ.
 * Die Spalten werden aus der ersten Datenzeile erkannt:
 *   3 Spalten  x y z
 *   4 Spalten  x y z Intensität
 *   6 Spalten  x y z r g b
 *   7 Spalten  x y z Intensität r g b   (die übliche PTS-Belegung)
 */
function punktwolkeAusText(text, optionen) {
  const zeilen = String(text).split(/\r?\n/);
  let start = 0;
  let erwartet = 0;
  const erste = (zeilen[0] || "").trim();
  if (/^\d+$/.test(erste)) { erwartet = parseInt(erste, 10); start = 1; }

  // Trennzeichen an der ersten Datenzeile erkennen
  let probe = "";
  for (let i = start; i < zeilen.length; i++) {
    const z = zeilen[i].trim();
    if (z && !z.startsWith("#") && !z.startsWith("//")) { probe = z; break; }
  }
  if (!probe) throw new Error("Die Datei enthält keine Punkte.");
  const trenner = probe.indexOf(";") >= 0 ? /\s*;\s*/
    : probe.indexOf(",") >= 0 ? /\s*,\s*/ : /\s+/;
  const spalten = probe.split(trenner).length;
  if (spalten < 3) throw new Error("Weniger als drei Spalten – x, y und z fehlen.");

  const max = erwartet || (zeilen.length - start);
  const roh = {
    anzahl: 0,
    x: new Float64Array(max), y: new Float64Array(max), z: new Float64Array(max),
    i: spalten === 4 || spalten >= 7 ? new Uint16Array(max) : null,
    r: spalten === 6 || spalten >= 7 ? new Uint8Array(max * 3) : null,
  };
  const farbSpalte = spalten === 6 ? 3 : spalten >= 7 ? 4 : -1;

  let k = 0;
  for (let i = start; i < zeilen.length && k < max; i++) {
    const z = zeilen[i].trim();
    if (!z || z.startsWith("#") || z.startsWith("//")) continue;
    const t = z.split(trenner);
    const x = parseFloat(t[0]), y = parseFloat(t[1]), zz = parseFloat(t[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(zz)) continue;
    roh.x[k] = x; roh.y[k] = y; roh.z[k] = zz;
    if (roh.i) roh.i[k] = Math.max(0, Math.min(65535, parseFloat(t[3]) || 0));
    if (roh.r && farbSpalte > 0) {
      roh.r[k * 3] = parseInt(t[farbSpalte], 10) || 0;
      roh.r[k * 3 + 1] = parseInt(t[farbSpalte + 1], 10) || 0;
      roh.r[k * 3 + 2] = parseInt(t[farbSpalte + 2], 10) || 0;
    }
    k += 1;
  }
  roh.anzahl = k;

  const wolke = punktwolkeAufbauen(roh, optionen);
  wolke.format = erwartet ? `PTS (${spalten} Spalten)` : `XYZ/ASCII (${spalten} Spalten)`;
  if (erwartet && erwartet !== k) {
    wolke.hinweise.push(`Kopfzeile nennt ${erwartet} Punkte, gelesen wurden ${k}.`);
  }
  return wolke;
}

/** Datei einlesen; der Inhalt ist ein ArrayBuffer oder eine Zeichenkette. */
function punktwolkeLesen(name, inhalt, optionen) {
  const format = punktwolkeFormat(name);
  let wolke;
  if (format === "las") wolke = punktwolkeAusLas(inhalt, optionen);
  else if (format === "ply") wolke = punktwolkeAusPly(inhalt, optionen);
  else if (format === "pts" || format === "xyz") {
    const text = typeof inhalt === "string" ? inhalt
      : new TextDecoder("utf-8").decode(new Uint8Array(inhalt));
    wolke = punktwolkeAusText(text, optionen);
  } else {
    throw new Error(`Format nicht lesbar: „${name}“. Gelesen werden LAS, PLY, PTS und XYZ. `
      + "E57 und LAZ bitte in der Scannersoftware in eines dieser Formate ausgeben.");
  }
  wolke.quelle = name;
  return wolke;
}

/* --------------------------------------------------------- Aufbereitung */

/**
 * Rasterfilter: je Würfel der Kantenlänge bleibt ein Punkt.
 *
 * Das ist das übliche Verfahren, um eine Wolke von vielen Millionen
 * Punkten auf eine darstellbare Größe zu bringen, ohne dass die Form
 * verloren geht: Es dünnt dort aus, wo die Punkte dicht liegen, und
 * lässt dünn besetzte Bereiche unberührt.
 */
function punktwolkeRasterfilter(wolke, kantenlaenge) {
  const k = kantenlaenge > 0 ? kantenlaenge : 0.02;
  const gesehen = new Set();
  const behalten = [];
  for (let i = 0; i < wolke.anzahl; i++) {
    const x = Math.floor(wolke.xyz[i * 3] / k);
    const y = Math.floor(wolke.xyz[i * 3 + 1] / k);
    const z = Math.floor(wolke.xyz[i * 3 + 2] / k);
    const schluessel = `${x}|${y}|${z}`;
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    behalten.push(i);
  }
  return punktwolkeAuswahl(wolke, behalten);
}

/** Neue Wolke aus einer Auswahl von Punktnummern. */
function punktwolkeAuswahl(wolke, nummern) {
  const n = nummern.length;
  const neu = punktwolkeLeer();
  neu.xyz = new Float32Array(n * 3);
  neu.farbe = wolke.farbe ? new Uint8Array(n * 3) : null;
  neu.intensitaet = wolke.intensitaet ? new Uint16Array(n) : null;
  nummern.forEach((q, k) => {
    neu.xyz[k * 3] = wolke.xyz[q * 3];
    neu.xyz[k * 3 + 1] = wolke.xyz[q * 3 + 1];
    neu.xyz[k * 3 + 2] = wolke.xyz[q * 3 + 2];
    if (neu.farbe) {
      neu.farbe[k * 3] = wolke.farbe[q * 3];
      neu.farbe[k * 3 + 1] = wolke.farbe[q * 3 + 1];
      neu.farbe[k * 3 + 2] = wolke.farbe[q * 3 + 2];
    }
    if (neu.intensitaet) neu.intensitaet[k] = wolke.intensitaet[q];
  });
  neu.anzahl = n;
  neu.bezug = wolke.bezug;
  neu.grenzen = wolke.grenzen;
  neu.format = wolke.format;
  neu.quelle = wolke.quelle;
  return neu;
}

/**
 * Kennwerte der Wolke: Ausdehnung, Dichte und Höhenverteilung.
 *
 * Die Höhenverteilung ist das Arbeitsmittel für den Schnitt: Boden und
 * Decke zeichnen sich als zwei starke Spitzen ab, dazwischen liegt der
 * Bereich, in dem ein Grundrissschnitt sinnvoll liegt.
 */
function punktwolkeStatistik(wolke, stufen) {
  if (!wolke.anzahl) return null;
  const g = wolke.grenzen;
  const breite = g.max.x - g.min.x;
  const tiefe = g.max.z - g.min.z;
  const hoehe = g.max.y - g.min.y;
  const n = stufen || 40;
  const kasten = new Array(n).fill(0);
  const schritt = hoehe > 0 ? hoehe / n : 1;
  for (let i = 0; i < wolke.anzahl; i++) {
    const k = Math.min(n - 1, Math.max(0, Math.floor((wolke.xyz[i * 3 + 1] - g.min.y) / schritt)));
    kasten[k] += 1;
  }
  const spitzen = kasten
    .map((anzahl, k) => ({ anzahl, von: g.min.y + k * schritt, bis: g.min.y + (k + 1) * schritt }))
    .sort((a, b) => b.anzahl - a.anzahl)
    .slice(0, 3);
  return {
    anzahl: wolke.anzahl,
    breite, tiefe, hoehe,
    dichte: breite * tiefe > 0 ? wolke.anzahl / (breite * tiefe) : 0,
    hoehenkasten: kasten, hoehenschritt: schritt, hoehenBeginn: g.min.y,
    spitzen,
  };
}

/**
 * Waagerechter Schnitt: alle Punkte in einem Höhenband.
 * @returns {Array} [{ x, z }] im Grundriss
 */
function punktwolkeSchnitt(wolke, kote, dicke) {
  const halb = (dicke > 0 ? dicke : 0.1) / 2;
  const punkte = [];
  for (let i = 0; i < wolke.anzahl; i++) {
    const y = wolke.xyz[i * 3 + 1];
    if (y < kote - halb || y > kote + halb) continue;
    punkte.push({ x: wolke.xyz[i * 3], z: wolke.xyz[i * 3 + 2] });
  }
  return punkte;
}

/* ------------------------------------------------- Wände aus dem Schnitt */

/**
 * Wanderkennung im waagerechten Schnitt.
 *
 * Rechenweg in drei Schritten:
 *
 * 1. Geraden finden – Häufungsverfahren nach Hough: Jeder Punkt stimmt für
 *    alle Geraden ab, die durch ihn gehen. Eine Gerade wird über ihren
 *    Lotabstand vom Nullpunkt beschrieben:  ρ = x·cosθ + z·sinθ.  Die
 *    Zelle mit den meisten Stimmen ist die Gerade, auf der die meisten
 *    Punkte liegen. Sie wird anschließend über die Trägheitsachse ihrer
 *    Punkte nachgeführt, damit sie nicht in der Rasterweite hängen bleibt.
 *    Danach werden ihre Punkte entfernt und der nächste Durchgang beginnt.
 *
 * 2. Abschnitte bilden – die Punkte einer Geraden werden auf sie projiziert
 *    und dort in zusammenhängende Abschnitte zerlegt. Eine Lücke größer als
 *    das zulässige Maß (Tür, Fenster, Verdeckung) trennt zwei Abschnitte.
 *
 * 3. Wände paaren – eine Wand zeigt im Schnitt zwei parallele Linien: ihre
 *    beiden Oberflächen. Zwei Abschnitte mit gleicher Richtung, einem
 *    Abstand im Bereich üblicher Wanddicken und ausreichender Überdeckung
 *    ergeben eine Wand. Ihre Achse liegt in der Mitte, ihre Dicke ist der
 *    Abstand der beiden Flächen.
 *
 * Was übrig bleibt, ist eine einseitig erfasste Fläche: Vom Standpunkt des
 * Scanners war nur eine Seite sichtbar. Sie wird als Vorschlag mit
 * unbekannter Dicke geführt und nicht stillschweigend zur Wand gemacht.
 *
 * NICHT erkannt: Rundungen, schräge Wände im Aufriss, Stützen (sie
 * erscheinen als kurze Abschnitte unter dem Mindestmaß) sowie Wände, die
 * im Schnitt hinter Einbauten liegen. Das Ergebnis ist ein Vorschlag für
 * die Bestandsaufnahme und ersetzt das Aufmaß vor Ort nicht.
 */
function wandErkennung(schnitt, optionen) {
  const o = Object.assign({
    winkelschritt: 1,        // Grad
    rasterRho: 0.02,         // m
    toleranz: 0.02,          // m Abstand zur Geraden
    minPunkte: 60,           // Stimmen, ab denen eine Gerade weiterverfolgt wird
    minLaenge: 1.00,         // m kürzester Abschnitt
    luecke: 0.60,            // m größte Lücke innerhalb eines Abschnitts
    dickeMin: 0.05,          // m
    dickeMax: 0.60,          // m
    minUeberdeckung: 0.50,   // m gemeinsame Länge zweier Flächen
    maxLinien: 60,
  }, optionen || {});

  const n = schnitt.length;
  if (n < o.minPunkte) return { linien: [], waende: [], offen: [], punkte: n };

  const offenIdx = new Uint8Array(n);      // 1 = schon einer Geraden zugeteilt
  const winkelZahl = Math.round(180 / o.winkelschritt);
  const cos = new Float64Array(winkelZahl), sin = new Float64Array(winkelZahl);
  for (let a = 0; a < winkelZahl; a++) {
    const w = (a * o.winkelschritt * Math.PI) / 180;
    cos[a] = Math.cos(w); sin[a] = Math.sin(w);
  }

  let rhoMin = Infinity, rhoMax = -Infinity;
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < winkelZahl; a++) {
      const r = schnitt[i].x * cos[a] + schnitt[i].z * sin[a];
      if (r < rhoMin) rhoMin = r;
      if (r > rhoMax) rhoMax = r;
    }
  }
  const rhoZahl = Math.max(1, Math.ceil((rhoMax - rhoMin) / o.rasterRho) + 1);
  const abschnitte = [];

  for (let durchgang = 0; durchgang < o.maxLinien; durchgang++) {
    // ---- Schritt 1: abstimmen
    const stimmen = new Int32Array(winkelZahl * rhoZahl);
    for (let i = 0; i < n; i++) {
      if (offenIdx[i]) continue;
      const x = schnitt[i].x, z = schnitt[i].z;
      for (let a = 0; a < winkelZahl; a++) {
        const r = x * cos[a] + z * sin[a];
        const k = Math.floor((r - rhoMin) / o.rasterRho);
        stimmen[a * rhoZahl + k] += 1;
      }
    }
    let beste = 0, besteZelle = -1;
    for (let k = 0; k < stimmen.length; k++) {
      if (stimmen[k] > beste) { beste = stimmen[k]; besteZelle = k; }
    }
    if (beste < o.minPunkte || besteZelle < 0) break;

    let winkel = ((besteZelle / rhoZahl) | 0) * o.winkelschritt * Math.PI / 180;
    let rho = rhoMin + (besteZelle % rhoZahl) * o.rasterRho + o.rasterRho / 2;

    // ---- Gerade nachführen: Trägheitsachse der zugehörigen Punkte
    let mitglieder = [];
    for (let versuch = 0; versuch < 3; versuch++) {
      const nx = Math.cos(winkel), nz = Math.sin(winkel);
      mitglieder = [];
      for (let i = 0; i < n; i++) {
        if (offenIdx[i]) continue;
        if (Math.abs(schnitt[i].x * nx + schnitt[i].z * nz - rho) <= o.toleranz) mitglieder.push(i);
      }
      if (mitglieder.length < o.minPunkte) break;
      let sx = 0, sz = 0;
      mitglieder.forEach((i) => { sx += schnitt[i].x; sz += schnitt[i].z; });
      const mx = sx / mitglieder.length, mz = sz / mitglieder.length;
      let sxx = 0, szz = 0, sxz = 0;
      mitglieder.forEach((i) => {
        const dx = schnitt[i].x - mx, dz = schnitt[i].z - mz;
        sxx += dx * dx; szz += dz * dz; sxz += dx * dz;
      });
      // größter Eigenwert der Streumatrix -> Richtung der Geraden
      const spur = sxx + szz;
      const wurzel = Math.sqrt(Math.max(0, (sxx - szz) * (sxx - szz) + 4 * sxz * sxz));
      const gross = (spur + wurzel) / 2;
      let rx = sxz, rz = gross - sxx;
      if (Math.abs(rx) < 1e-12 && Math.abs(rz) < 1e-12) { rx = 1; rz = 0; }
      const rl = Math.hypot(rx, rz);
      rx /= rl; rz /= rl;
      // Normale steht senkrecht auf der Richtung
      let neuWinkel = Math.atan2(rx, -rz);
      if (neuWinkel < 0) neuWinkel += Math.PI;
      if (neuWinkel >= Math.PI) neuWinkel -= Math.PI;
      const neuRho = mx * Math.cos(neuWinkel) + mz * Math.sin(neuWinkel);
      if (Math.abs(neuWinkel - winkel) < 1e-9 && Math.abs(neuRho - rho) < 1e-9) break;
      winkel = neuWinkel; rho = neuRho;
    }
    if (mitglieder.length < o.minPunkte) {
      // Zelle entwerten, damit der nächste Durchgang nicht dieselbe findet
      for (let i = 0; i < n; i++) {
        if (offenIdx[i]) continue;
        const r = schnitt[i].x * Math.cos(winkel) + schnitt[i].z * Math.sin(winkel);
        if (Math.abs(r - rho) <= o.toleranz) offenIdx[i] = 1;
      }
      continue;
    }

    // ---- Schritt 2: Abschnitte längs der Geraden
    const nx = Math.cos(winkel), nz = Math.sin(winkel);
    const dx = -nz, dz = nx;                       // Richtung der Geraden
    const laengs = mitglieder.map((i) => ({
      i, t: schnitt[i].x * dx + schnitt[i].z * dz,
      abstand: schnitt[i].x * nx + schnitt[i].z * nz - rho,
    })).sort((a, b) => a.t - b.t);

    let block = [laengs[0]];
    const bloecke = [];
    for (let k = 1; k < laengs.length; k++) {
      if (laengs[k].t - laengs[k - 1].t > o.luecke) { bloecke.push(block); block = []; }
      block.push(laengs[k]);
    }
    bloecke.push(block);

    bloecke.forEach((b) => {
      const laenge = b[b.length - 1].t - b[0].t;
      if (laenge < o.minLaenge || b.length < o.minPunkte / 2) return;
      const mittel = b.reduce((s, p) => s + Math.abs(p.abstand), 0) / b.length;
      abschnitte.push({
        winkel, rho, von: b[0].t, bis: b[b.length - 1].t, laenge,
        punkte: b.length, streuung: mittel,
        p1: { x: nx * rho + dx * b[0].t, z: nz * rho + dz * b[0].t },
        p2: { x: nx * rho + dx * b[b.length - 1].t, z: nz * rho + dz * b[b.length - 1].t },
      });
    });
    mitglieder.forEach((i) => { offenIdx[i] = 1; });
  }

  // ---- Schritt 3: gegenüberliegende Flächen zu Wänden paaren
  const vergeben = new Set();
  const waende = [];
  const winkelToleranz = (2 * Math.PI) / 180;

  for (let a = 0; a < abschnitte.length; a++) {
    if (vergeben.has(a)) continue;
    let bester = -1, besteGuete = 0, besteDaten = null;
    for (let b = a + 1; b < abschnitte.length; b++) {
      if (vergeben.has(b)) continue;
      const A = abschnitte[a], B = abschnitte[b];
      let dw = Math.abs(A.winkel - B.winkel);
      if (dw > Math.PI / 2) dw = Math.PI - dw;      // 0 und 180 Grad sind dieselbe Richtung
      if (dw > winkelToleranz) continue;
      // Vorzeichen der Normalen angleichen, bevor die Dicke gebildet wird
      const gleich = Math.cos(A.winkel - B.winkel) >= 0;
      const rhoB = gleich ? B.rho : -B.rho;
      const dicke = Math.abs(A.rho - rhoB);
      if (dicke < o.dickeMin || dicke > o.dickeMax) continue;
      // Überdeckung längs der gemeinsamen Richtung
      const nx = Math.cos(A.winkel), nz = Math.sin(A.winkel);
      const dx = -nz, dz = nx;
      const tB1 = B.p1.x * dx + B.p1.z * dz, tB2 = B.p2.x * dx + B.p2.z * dz;
      const von = Math.max(A.von, Math.min(tB1, tB2));
      const bis = Math.min(A.bis, Math.max(tB1, tB2));
      const ueber = bis - von;
      if (ueber < o.minUeberdeckung) continue;
      const guete = ueber * (A.punkte + B.punkte);
      if (guete > besteGuete) {
        besteGuete = guete; bester = b;
        besteDaten = { dicke, von, bis, ueber, rhoMitte: (A.rho + rhoB) / 2, winkel: A.winkel, andere: B };
      }
    }
    if (bester < 0) continue;
    vergeben.add(a); vergeben.add(bester);
    const d = besteDaten;
    const nx = Math.cos(d.winkel), nz = Math.sin(d.winkel);
    const dx = -nz, dz = nx;
    waende.push({
      p1: { x: nx * d.rhoMitte + dx * d.von, z: nz * d.rhoMitte + dz * d.von },
      p2: { x: nx * d.rhoMitte + dx * d.bis, z: nz * d.rhoMitte + dz * d.bis },
      dicke: d.dicke,
      laenge: d.ueber,
      richtung: (d.winkel * 180) / Math.PI,
      punkte: abschnitte[a].punkte + d.andere.punkte,
      streuung: (abschnitte[a].streuung + d.andere.streuung) / 2,
    });
  }

  const offen = abschnitte.filter((_, k) => !vergeben.has(k));
  waende.sort((a, b) => b.laenge - a.laenge);
  return { linien: abschnitte, waende, offen, punkte: n };
}

/** Klartext einer erkannten Wand für Tabelle und Bericht. */
function wandText(wand) {
  const m = (w, s) => w.toFixed(s === undefined ? 2 : s).replace(".", ",");
  return `Länge ${m(wand.laenge)} m · Dicke ${m(wand.dicke, 3)} m · `
    + `Richtung ${m(wand.richtung, 1)}° · ${wand.punkte} Punkte · `
    + `Streuung ${m(wand.streuung * 1000, 1)} mm`;
}
