/**
 * Achsraster und Positionsplan.
 *
 * Das Achsraster wird über den Nullpunkt und die Feldweiten in beiden
 * Richtungen beschrieben. Die Achsen in Richtung x werden mit Ziffern,
 * die Achsen in Richtung z mit Großbuchstaben bezeichnet – die übliche
 * Ordnung im Hochbau; die Bezeichnung ist umschaltbar.
 *
 * Der Positionsplan zeigt alle tragenden Bauteile im Grundriss mit ihrer
 * Positionsnummer und dem Achsbezug: Betonbauteile, Architektur-Bauteile
 * und die Stäbe des Stahlbaus in ihrer Grundrissprojektion.
 *
 * Darstellung nach DIN 1356-1, Maßeintragung nach DIN 406-11, Maßstäbe
 * nach DIN ISO 5455. Achsmaße sind Rohbaumaße; die Positionsnummern
 * entsprechen der Bauteilkennzeichnung dieser Anwendung und sind mit der
 * Positionsnummerierung der Statik abzugleichen.
 */

/** Voreinstellung des Achsrasters: 3 × 6,00 m in x, 2 × 6,00 m in z. */
const ACHSRASTER_STANDARD = {
  x0: 0, z0: 0,
  felderX: "6,00 6,00 6,00",
  felderZ: "6,00 6,00",
  beschriftungX: "zahlen",
  beschriftungZ: "buchstaben",
  toleranz: 0.05, // m – bis hierher gilt ein Bauteil als „in der Achse"
};

/**
 * Liest eine Folge von Feldweiten: „6,00 6,00 6,00", „6;6;6" oder „3x6,00".
 * @returns {number[]} Feldweiten in Metern
 */
function achsFolge(text) {
  const felder = [];
  String(text || "").split(/[\s;,]+(?![0-9]{2}\b)/).forEach((teil) => {
    const roh = teil.trim().replace(",", ".");
    if (!roh) return;
    const wiederholung = roh.match(/^(\d+)\s*[x*]\s*([\d.]+)$/i);
    if (wiederholung) {
      const anzahl = parseInt(wiederholung[1], 10);
      const weite = parseFloat(wiederholung[2]);
      if (anzahl > 0 && weite > 0) for (let i = 0; i < anzahl; i++) felder.push(weite);
      return;
    }
    const wert = parseFloat(roh);
    if (Number.isFinite(wert) && wert > 0) felder.push(wert);
  });
  return felder;
}

/** Achsbezeichnung: 1, 2, 3 … bzw. A, B, C … Z, AA, AB … */
function achsName(index, art) {
  if (art !== "buchstaben") return String(index + 1);
  let name = "";
  let i = index;
  do {
    name = String.fromCharCode(65 + (i % 26)) + name;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return name;
}

/**
 * Achsen aus dem Raster.
 * @returns {Object} { x: [{ wert, name }], z: [{ wert, name }] }
 */
function achsenAusRaster(raster) {
  const r = Object.assign({}, ACHSRASTER_STANDARD, raster || {});
  const bilde = (start, felder, art) => {
    const achsen = [{ wert: start, name: achsName(0, art) }];
    let lauf = start;
    felder.forEach((weite, i) => {
      lauf += weite;
      achsen.push({ wert: lauf, name: achsName(i + 1, art) });
    });
    return achsen;
  };
  return {
    x: bilde(r.x0 || 0, achsFolge(r.felderX), r.beschriftungX),
    z: bilde(r.z0 || 0, achsFolge(r.felderZ), r.beschriftungZ),
    toleranz: r.toleranz > 0 ? r.toleranz : ACHSRASTER_STANDARD.toleranz,
  };
}

/** Nächstgelegene Achse zu einem Wert. */
function naechsteAchse(wert, achsen) {
  let beste = null;
  achsen.forEach((achse) => {
    const abstand = wert - achse.wert;
    if (!beste || Math.abs(abstand) < Math.abs(beste.abstand)) beste = { achse, abstand };
  });
  return beste;
}

/**
 * Achsbezug eines Punktes: „2/B" bei Lage in den Achsen, sonst mit
 * Versatz in Zentimetern, z. B. „2 +15 / B −20".
 */
function achsBezug(punkt, achsen) {
  if (!achsen.x.length || !achsen.z.length) return { text: "–", x: null, z: null };
  const bx = naechsteAchse(punkt.x, achsen.x);
  const bz = naechsteAchse(punkt.z, achsen.z);
  const tol = achsen.toleranz;
  const teil = (bezug) => {
    if (Math.abs(bezug.abstand) <= tol) return bezug.achse.name;
    const vorzeichen = bezug.abstand > 0 ? "+" : "−";
    const betrag = Math.abs(bezug.abstand);
    // kleine Versätze in Zentimetern, größere in Metern
    return betrag < 1
      ? `${bezug.achse.name} ${vorzeichen}${Math.round(betrag * 100)}`
      : `${bezug.achse.name} ${vorzeichen}${betrag.toFixed(2).replace(".", ",")} m`;
  };
  return {
    text: `${teil(bx)} / ${teil(bz)}`,
    inAchse: Math.abs(bx.abstand) <= tol && Math.abs(bz.abstand) <= tol,
    x: bx, z: bz,
  };
}

/**
 * Sammelt alle Bauteile des Modells als Grundrissfiguren mit Positionsnummer.
 *
 * @param {Object} quellen - { beton, architektur, staebe } jeweils fertige
 *        Figurenlisten (siehe positionsFiguren-Aufrufer)
 */
function positionsListe(figuren, achsen) {
  return figuren.map((f) => {
    const bezug = achsBezug(f.mitte, achsen);
    return Object.assign({}, f, { bezug });
  });
}

/**
 * Architektur-Bauteile als Grundrissfiguren (nur linien- und flächenförmige).
 */
function architekturGrundrissFiguren(elemente, geometrieVon, bezeichnungVon) {
  const figuren = [];
  elemente.forEach((element) => {
    const typ = BAUTEILTYPEN[element.kind];
    const geo = geometrieVon(element);
    if (typ.form === "linie" && element.p2) {
      const p1 = element.p1, p2 = element.p2;
      const dx = p2.x - p1.x, dz = p2.z - p1.z;
      const laenge = Math.hypot(dx, dz) || 0.01;
      const h = geo.dicke / 2;
      const nx = -dz / laenge, nz = dx / laenge;
      figuren.push({
        kategorie: "Architektur", art: "polygon", klasse: "arch",
        bezeichnung: bezeichnungVon(element), typName: typ.name,
        beschreibung: `L ${laenge.toFixed(2)} × d ${geo.dicke.toFixed(3)} m`,
        menge: `${geo.flaeche.toFixed(2)} m²`,
        punkte: [
          { x: p1.x + nx * h, z: p1.z + nz * h }, { x: p2.x + nx * h, z: p2.z + nz * h },
          { x: p2.x - nx * h, z: p2.z - nz * h }, { x: p1.x - nx * h, z: p1.z - nz * h },
        ],
        mitte: { x: (p1.x + p2.x) / 2, z: (p1.z + p2.z) / 2 },
      });
    } else if (typ.form === "flaeche" && element.p2) {
      const x0 = Math.min(element.p1.x, element.p2.x), z0 = Math.min(element.p1.z, element.p2.z);
      figuren.push({
        kategorie: "Architektur", art: "rechteck", klasse: "archplatte",
        bezeichnung: bezeichnungVon(element), typName: typ.name,
        beschreibung: `${geo.laenge.toFixed(2)} × ${geo.breite.toFixed(2)} m`,
        menge: `${geo.flaeche.toFixed(2)} m²`,
        x: x0, z: z0, b: geo.laenge, t: geo.breite,
        mitte: { x: x0 + geo.laenge / 2, z: z0 + geo.breite / 2 },
      });
    }
  });
  return figuren;
}

/** Betonbauteile als Positionsfiguren. */
function betonPositionsFiguren(figuren) {
  return figuren.map((f) => Object.assign({}, f, {
    kategorie: "Beton",
    typName: f.typ.name,
    beschreibung: f.geo.beschreibung,
    menge: `${(f.geo.volumen * Math.max(1, f.element.anzahl || 1)).toFixed(2)} m³`,
    kote: f.koten,
  }));
}

/** Stäbe des Stahlbaus als Linien in der Grundrissprojektion. */
function stabPositionsFiguren(staebe) {
  return staebe.map((stab) => ({
    kategorie: "Stahlbau", art: "linie", klasse: "stahl",
    bezeichnung: stab.bezeichnung, typName: stab.typ,
    beschreibung: stab.profil,
    menge: `${stab.laenge.toFixed(2)} m`,
    von: stab.von, bis: stab.bis,
    mitte: { x: (stab.von.x + stab.bis.x) / 2, z: (stab.von.z + stab.bis.z) / 2 },
    lotrecht: Math.hypot(stab.bis.x - stab.von.x, stab.bis.z - stab.von.z) < 0.05,
  }));
}

/**
 * Positionsplan als A4-Blatt quer: Achsraster, Bauteile im Grundriss mit
 * Positionsnummern und Achsbezug, Maßketten der Achsabstände sowie die
 * Positionsliste.
 *
 * @param {Object} daten - { figuren, achsen, projekt, titel }
 */
function positionsplanSVG(daten) {
  const { figuren, achsen, projekt } = daten;

  // ---- Umgrenzung aus Bauteilen und Achsen
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const merke = (x, z) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  };
  figuren.forEach((f) => {
    if (f.art === "polygon") f.punkte.forEach((pt) => merke(pt.x, pt.z));
    else if (f.art === "rechteck") { merke(f.x, f.z); merke(f.x + f.b, f.z + f.t); }
    else if (f.art === "kreis") { merke(f.x - f.r, f.z - f.r); merke(f.x + f.r, f.z + f.r); }
    else if (f.art === "linie") { merke(f.von.x, f.von.z); merke(f.bis.x, f.bis.z); }
  });
  achsen.x.forEach((a) => merke(a.wert, minZ === Infinity ? 0 : minZ));
  achsen.z.forEach((a) => merke(minX === Infinity ? 0 : minX, a.wert));
  if (!Number.isFinite(minX)) { minX = 0; maxX = 1; minZ = 0; maxZ = 1; }

  const ueberstand = 1.2; // m, Überstand der Achslinien über die Bauteile
  minX -= ueberstand; maxX += ueberstand; minZ -= ueberstand; maxZ += ueberstand;
  const breiteM = Math.max(maxX - minX, 1);
  const tiefeM = Math.max(maxZ - minZ, 1);

  const feld = { x: BLATT.randLinks + 10, y: BLATT.randOben + 10, b: 148, h: 142 };
  const nenner = waehleMassstab(breiteM, tiefeM, feld.b - 16, feld.h - 12);
  const m = (wert) => (wert * 1000) / nenner;
  const W = m(breiteM), H = m(tiefeM);
  const x0 = feld.x + (feld.b - W) / 2;
  const y0 = feld.y + (feld.h - H) / 2;
  const px = (x) => x0 + m(x - minX);
  const pz = (z) => y0 + m(z - minZ);

  let svg = "";

  // ---- Achsraster mit Achssymbolen
  achsen.x.forEach((achse) => {
    const x = px(achse.wert);
    svg += `<line x1="${x.toFixed(2)}" y1="${(y0 - 4).toFixed(2)}" x2="${x.toFixed(2)}" y2="${(y0 + H + 4).toFixed(2)}" class="achse"/>`;
    [y0 - 7.5, y0 + H + 7.5].forEach((y) => {
      svg += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="3" class="achskreis"/>`;
      svg += `<text x="${x.toFixed(2)}" y="${(y + 1.1).toFixed(2)}" class="t-achse">${achse.name}</text>`;
    });
  });
  achsen.z.forEach((achse) => {
    const y = pz(achse.wert);
    svg += `<line x1="${(x0 - 4).toFixed(2)}" y1="${y.toFixed(2)}" x2="${(x0 + W + 4).toFixed(2)}" y2="${y.toFixed(2)}" class="achse"/>`;
    [x0 - 7.5, x0 + W + 7.5].forEach((x) => {
      svg += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="3" class="achskreis"/>`;
      svg += `<text x="${x.toFixed(2)}" y="${(y + 1.1).toFixed(2)}" class="t-achse">${achse.name}</text>`;
    });
  });

  // ---- Bauteile: Platten zuerst, dann Gründung, Wände, Stützen, Stahl
  const rang = { archplatte: 0, platte: 1, fundament: 2, arch: 3, wandkoerper: 4, stuetzenkoerper: 5, stahl: 6 };
  figuren.slice().sort((a, b) => (rang[a.klasse] || 0) - (rang[b.klasse] || 0)).forEach((f) => {
    if (f.art === "polygon") {
      const d = f.punkte.map((pt) => `${px(pt.x).toFixed(2)},${pz(pt.z).toFixed(2)}`).join(" ");
      svg += `<polygon points="${d}" class="${f.klasse}"/>`;
    } else if (f.art === "rechteck") {
      svg += `<rect x="${px(f.x).toFixed(2)}" y="${pz(f.z).toFixed(2)}" width="${m(f.b).toFixed(2)}" height="${m(f.t).toFixed(2)}" class="${f.klasse}"/>`;
      if (f.aussparung) {
        svg += `<rect x="${px(f.aussparung.x).toFixed(2)}" y="${pz(f.aussparung.z).toFixed(2)}" width="${m(f.aussparung.b).toFixed(2)}" height="${m(f.aussparung.t).toFixed(2)}" class="aussparung"/>`;
      }
    } else if (f.art === "kreis") {
      svg += `<circle cx="${px(f.x).toFixed(2)}" cy="${pz(f.z).toFixed(2)}" r="${m(f.r).toFixed(2)}" class="${f.klasse}"/>`;
    } else if (f.art === "linie") {
      if (f.lotrecht) {
        // Lotrechter Stab erscheint im Grundriss als Punkt
        svg += `<circle cx="${px(f.von.x).toFixed(2)}" cy="${pz(f.von.z).toFixed(2)}" r="1.1" class="stahlpunkt"/>`;
      } else {
        svg += `<line x1="${px(f.von.x).toFixed(2)}" y1="${pz(f.von.z).toFixed(2)}" x2="${px(f.bis.x).toFixed(2)}" y2="${pz(f.bis.z).toFixed(2)}" class="stahl"/>`;
      }
    }
  });

  // ---- Positionsnummern mit einfacher Kollisionsvermeidung:
  // überdeckte Beschriftungen werden versetzt, sonst mit Fahne herausgezogen
  const belegt = [];
  const passt = (x, y, breite) => !belegt.some((b) =>
    Math.abs(b.x - x) < (b.breite + breite) / 2 && Math.abs(b.y - y) < 3.2);
  figuren.forEach((f) => {
    const zx = px(f.mitte.x), zy = pz(f.mitte.z);
    const breite = f.bezeichnung.length * 1.45 + 1;
    let tx = zx, ty = zy, gefunden = passt(tx, ty, breite);
    // abwechselnd nach oben und unten ausweichen
    for (let i = 1; i <= 6 && !gefunden; i++) {
      const versatz = Math.ceil(i / 2) * 3.4 * (i % 2 === 0 ? 1 : -1);
      ty = zy + versatz;
      gefunden = passt(tx, ty, breite);
    }
    if (!gefunden) {
      // seitlich ausweichen
      for (let i = 1; i <= 6 && !gefunden; i++) {
        tx = zx + Math.ceil(i / 2) * (breite + 2) * (i % 2 === 0 ? 1 : -1);
        ty = zy;
        gefunden = passt(tx, ty, breite);
      }
    }
    if (!gefunden) return; // Position steht in der Liste, im Plan wäre sie unleserlich
    belegt.push({ x: tx, y: ty, breite });
    if (Math.abs(tx - zx) > 0.5 || Math.abs(ty - zy) > 0.5) {
      svg += `<line x1="${zx.toFixed(2)}" y1="${zy.toFixed(2)}" x2="${tx.toFixed(2)}" y2="${(ty - 0.8).toFixed(2)}" class="fahne"/>`;
    }
    svg += `<text x="${tx.toFixed(2)}" y="${ty.toFixed(2)}" class="t-pos">${f.bezeichnung}</text>`;
  });

  // ---- Maßketten der Achsabstände
  if (achsen.x.length > 1) {
    const punkte = achsen.x.map((a) => px(a.wert));
    const yMass = y0 + H + 13;
    svg += massketteWaagerecht(punkte, yMass, y0 + H + 4, "kette");
    for (let i = 0; i < punkte.length - 1; i++) {
      const weite = achsen.x[i + 1].wert - achsen.x[i].wert;
      if (punkte[i + 1] - punkte[i] < 4) continue;
      svg += `<text x="${((punkte[i] + punkte[i + 1]) / 2).toFixed(2)}" y="${(yMass - 1.4).toFixed(2)}" class="t-mass">${meterText(weite)}</text>`;
    }
    const gesamt = achsen.x[achsen.x.length - 1].wert - achsen.x[0].wert;
    svg += massketteWaagerecht([punkte[0], punkte[punkte.length - 1]], yMass + 8, yMass + 2, "kette");
    svg += `<text x="${((punkte[0] + punkte[punkte.length - 1]) / 2).toFixed(2)}" y="${(yMass + 6.6).toFixed(2)}" class="t-mass-gross">${meterText(gesamt)}</text>`;
  }
  if (achsen.z.length > 1) {
    const punkte = achsen.z.map((a) => pz(a.wert));
    const xMass = x0 - 13;
    svg += massketteLotrecht(punkte, xMass, x0 - 4);
    for (let i = 0; i < punkte.length - 1; i++) {
      const weite = achsen.z[i + 1].wert - achsen.z[i].wert;
      if (punkte[i + 1] - punkte[i] < 4) continue;
      const my = (punkte[i] + punkte[i + 1]) / 2;
      svg += `<text x="${(xMass - 1.6).toFixed(2)}" y="${my.toFixed(2)}" class="t-mass" transform="rotate(-90 ${(xMass - 1.6).toFixed(2)} ${my.toFixed(2)})">${meterText(weite)}</text>`;
    }
  }

  // ---- Positionsliste rechts
  const xL = BLATT.randLinks + 168;
  let yL = BLATT.randOben + 6;
  svg += `<text x="${xL}" y="${yL}" class="t-kopf">Positionsliste · M 1:${nenner}</text>`;
  yL += 5.5;
  const spalten = [0, 12, 46, 74];
  ["Pos", "Bauteil", "Abmessung", "Achse"].forEach((t, i) => {
    svg += `<text x="${(xL + spalten[i]).toFixed(2)}" y="${yL}" class="t-th">${t}</text>`;
  });
  svg += `<line x1="${xL}" y1="${(yL + 1.4).toFixed(2)}" x2="${(xL + 92).toFixed(2)}" y2="${(yL + 1.4).toFixed(2)}" class="tabelle"/>`;
  yL += 4.4;

  const platz = BLATT.hoehe - BLATT.randUnten - 34 - yL;
  const maxZeilen = Math.max(4, Math.floor(platz / 3.8));
  figuren.slice(0, maxZeilen).forEach((f) => {
    const werte = [f.bezeichnung, (f.typName || "").slice(0, 20), (f.beschreibung || "").slice(0, 22), f.bezug ? f.bezug.text : "–"];
    werte.forEach((t, i) => {
      svg += `<text x="${(xL + spalten[i]).toFixed(2)}" y="${yL}" class="${i === 1 || i === 2 ? "t-klein" : "t-td"}">${t}</text>`;
    });
    yL += 3.8;
  });
  if (figuren.length > maxZeilen) {
    svg += `<text x="${xL}" y="${yL}" class="t-klein">… ${figuren.length - maxZeilen} weitere Positionen siehe Positionsliste im Programm</text>`;
    yL += 4;
  }
  yL += 2;
  svg += `<text x="${xL}" y="${yL}" class="t-th">${figuren.length} Positionen</text>`;
  yL += 5;
  ["Achsmaße als Rohbaumaße, Achsbezug mit Versatz in cm.",
   "Positionsnummern mit der Statik abgleichen."].forEach((t) => {
    umbrechen(t, 42).forEach((zeile) => {
      svg += `<text x="${xL}" y="${yL}" class="t-klein">${zeile}</text>`;
      yL += 3.6;
    });
  });

  // ---- Schriftfeld
  const sfB = 104, sfH = 30;
  const sfX = BLATT.breite - BLATT.randRechts - sfB;
  const sfY = BLATT.hoehe - BLATT.randUnten - sfH;
  svg += `<rect x="${sfX}" y="${sfY}" width="${sfB}" height="${sfH}" class="schriftfeld"/>`;
  svg += `<line x1="${sfX}" y1="${sfY + 9}" x2="${sfX + sfB}" y2="${sfY + 9}" class="schriftfeld"/>`;
  svg += `<line x1="${sfX}" y1="${sfY + 19}" x2="${sfX + sfB}" y2="${sfY + 19}" class="schriftfeld"/>`;
  svg += `<line x1="${sfX + 62}" y1="${sfY + 19}" x2="${sfX + 62}" y2="${sfY + sfH}" class="schriftfeld"/>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 6}" class="t-firma">HSD Hamburg GmbH</text>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 15}" class="t-klein">${projekt.name || "Projekt"} · Positionsplan mit Achsraster</text>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 25}" class="t-klein">Bearbeiter: ${projekt.bearbeiter}</text>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 28.5}" class="t-klein">Datum: ${projekt.datum}</text>`;
  svg += `<text x="${sfX + 65}" y="${sfY + 25}" class="t-massstab">M 1:${nenner}</text>`;
  svg += `<text x="${sfX + 65}" y="${sfY + 28.5}" class="t-klein">Positionsplan</text>`;

  svg += `<text x="${BLATT.randLinks}" y="${BLATT.hoehe - 4}" class="t-hinweis">Vorbemessung – keine prüffähige Ausführungsplanung. Achsmaße in Metern; Positionsnummern dieser Anwendung mit der Positionsnummerierung der Statik abgleichen.</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BLATT.breite} ${BLATT.hoehe}" width="100%" style="background:#fff">
<style>
  .achse { stroke: #b3392c; stroke-width: 0.25; stroke-dasharray: 6 1.6 1 1.6; }
  .achskreis { fill: #ffffff; stroke: #b3392c; stroke-width: 0.35; }
  .platte { fill: #f6f4ef; stroke: #1b2733; stroke-width: 0.3; stroke-dasharray: 2.4 1.4; }
  .archplatte { fill: #f7f5f0; stroke: #8a97a3; stroke-width: 0.25; stroke-dasharray: 2 1.4; }
  .fundament { fill: #e8e2d6; stroke: #1b2733; stroke-width: 0.3; stroke-dasharray: 1.8 1.2; }
  .arch { fill: #dfe6ea; stroke: #64707c; stroke-width: 0.3; }
  .wandkoerper { fill: #cdd5db; stroke: #1b2733; stroke-width: 0.35; }
  .stuetzenkoerper { fill: #8d9aa4; stroke: #1b2733; stroke-width: 0.35; }
  .stahl { stroke: #1f6b8f; stroke-width: 0.7; fill: none; }
  .stahlpunkt { fill: #1f6b8f; }
  .aussparung { fill: #ffffff; stroke: #1b2733; stroke-width: 0.3; stroke-dasharray: 1.6 1.2; }
  .ml, .mhl, .mb { stroke: #1b2733; }
  .ml { stroke-width: 0.25; }
  .mhl { stroke-width: 0.13; }
  .mb { stroke-width: 0.35; }
  .tabelle { stroke: #1b2733; stroke-width: 0.25; }
  .fahne { stroke: #64707c; stroke-width: 0.15; }
  .schriftfeld { fill: none; stroke: #1b2733; stroke-width: 0.35; }
  text { font-family: "IBM Plex Sans", Arial, sans-serif; fill: #1b2733; }
  .t-mass { font-size: 2.5px; text-anchor: middle; }
  .t-mass-gross { font-size: 3px; text-anchor: middle; font-weight: 600; }
  .t-achse { font-size: 3px; text-anchor: middle; font-weight: 700; fill: #b3392c; }
  .t-pos { font-size: 2.6px; text-anchor: middle; font-weight: 700; paint-order: stroke; stroke: #ffffff; stroke-width: 0.9; stroke-linejoin: round; }
  .t-kopf { font-size: 3.2px; font-weight: 600; }
  .t-th { font-size: 2.6px; font-weight: 700; }
  .t-td { font-size: 2.5px; font-family: "IBM Plex Mono", monospace; }
  .t-klein { font-size: 2.4px; }
  .t-firma { font-size: 4.5px; font-weight: 700; }
  .t-massstab { font-size: 4px; font-weight: 600; }
  .t-hinweis { font-size: 2.2px; fill: #64707c; }
</style>
${svg}
</svg>`;
}
