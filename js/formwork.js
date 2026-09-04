/**
 * Schalung: Schalflächenaufstellung, Schalplan je Bauteil und
 * Schalplan-Übersicht (Positionsplan) aller Betonbauteile.
 *
 * Der Schalplan zeigt die Rohbaumaße des Bauteils ohne Bewehrung mit
 * Maßketten, Höhenkoten, Aussparungen und den Angaben zu Beton und
 * Schalung. Die Schalflächen werden nach Seiten-, Decken- und
 * Aussparungsschalung getrennt ausgewiesen, weil sie unterschiedlich
 * kalkuliert und abgerechnet werden.
 *
 * Grundlagen der Darstellung: DIN 1356-1 (Bauzeichnungen), DIN 406-11
 * (Maßeintragung), DIN ISO 5455 (Maßstäbe), Rohbaumaße ohne Toleranzen
 * nach DIN 18202. Ausschalfristen, Schalungsdruck und die Standsicherheit
 * der Schalung und ihrer Unterstützung sind nach DIN EN 13670 mit
 * DIN 1045-3 bzw. DIN EN 12812 gesondert festzulegen.
 */

const SCHALUNGSARTEN = {
  seiten: { name: "Seitenschalung", beschreibung: "Wand-, Stützen- und Fundamentschalung" },
  boden: { name: "Deckenschalung (Untersicht)", beschreibung: "Deckentische, Unterstützung nach DIN EN 12812" },
  aussparung: { name: "Aussparungsschalung", beschreibung: "Köcher, Durchbrüche, Nischen" },
  stufen: { name: "Stufenschalung", beschreibung: "Setzstufenbretter der Treppenläufe" },
};

/** Schalungsart, die das Bauteil überwiegend bestimmt. */
function schalungsSystem(kind) {
  return {
    streifenfundament: "Fundamentschalung, einhäuptig gegen Erdreich möglich",
    einzelfundament: "Fundamentschalung",
    koecherfundament: "Fundamentschalung mit eingesetztem Köcherkasten",
    bohrpfahl: "keine Schalung – verrohrt bzw. mit stützender Flüssigkeit hergestellt",
    bodenplatte: "Randabschalung",
    decke: "Deckenschalung mit Unterstützung, Randabschalung",
    wand: "beidseitige Wandschalung",
    kellerwand: "beidseitige Wandschalung, erdberührt",
    stuetze: "Stützenschalung, vier Seiten",
    stuetze_rund: "Rundstützenschalung",
    unterzug: "Balkenschalung, Untersicht und zwei Seiten",
    treppe: "Treppenschalung: Laufplattenuntersicht mit Unterstützung, Wangen und Stufenbretter",
  }[kind] || "Schalung nach Bauteilart";
}

/**
 * Schalflächen aller Bauteile, getrennt nach Schalungsart.
 * @returns {Object} { zeilen, jeArt, gesamt }
 */
function schalungsAufstellung(elements, arbeitsraum, geometrieVon, bezeichnungVon) {
  const zeilen = [];
  const jeArt = { seiten: 0, boden: 0, aussparung: 0, stufen: 0 };
  let gesamt = 0;

  elements.forEach((element) => {
    const geo = geometrieVon(element, arbeitsraum);
    const teile = geo.schalungTeile || { seiten: geo.schalung, boden: 0, aussparung: 0, stufen: 0 };
    const anzahl = Math.max(1, element.anzahl || 1);
    Object.keys(SCHALUNGSARTEN).forEach((art) => {
      const einzel = teile[art] || 0;
      if (einzel <= 0) return;
      const flaeche = einzel * anzahl;
      jeArt[art] += flaeche;
      gesamt += flaeche;
      zeilen.push({
        bauteil: bezeichnungVon(element), kind: element.kind,
        art, artName: SCHALUNGSARTEN[art].name,
        einzel, anzahl, flaeche, system: schalungsSystem(element.kind),
      });
    });
  });

  return { zeilen, jeArt, gesamt };
}

/**
 * Höhenkoten eines Bauteils bezogen auf ±0,00 des Modells.
 * Gründungsbauteile liegen unter der Arbeitsebene, aufgehende darüber.
 */
function hoehenkoten(element, geo) {
  const typ = BETONTEILTYPEN[element.kind];
  const y = element.p1.y || 0;
  if (element.kind === "bohrpfahl") return { ok: y, uk: y - geo.hoehe };
  // Treppe: UK am Antritt, OK am Austritt (Geschossebene darüber)
  if (element.kind === "treppe") return { ok: y + geo.hoehe, uk: y };
  if (typ.form === "flaeche") {
    return typ.erdreich ? { ok: y, uk: y - geo.dicke } : { ok: y + geo.dicke, uk: y };
  }
  if (typ.erdreich) {
    const hoehe = element.kind === "streifenfundament" ? geo.dicke : geo.hoehe;
    return { ok: y, uk: y - hoehe };
  }
  return { ok: y + geo.hoehe, uk: y };
}

function koteText(wert) {
  const vorzeichen = wert > 0.0005 ? "+" : wert < -0.0005 ? "−" : "±";
  return `${vorzeichen}${Math.abs(wert).toFixed(2).replace(".", ",")}`;
}

/**
 * Ansichten für den Schalplan: Hauptansicht und Schnitt, jeweils nur
 * Umriss und Aussparung – die Bewehrung bleibt dem Bewehrungsplan.
 */
function schalAnsichten(element, geo) {
  const typ = BETONTEILTYPEN[element.kind];
  const kind = element.kind;

  if (kind === "bodenplatte" || kind === "decke" || kind === "einzelfundament" || kind === "koecherfundament") {
    const aussparung = kind === "koecherfundament" && geo.koecher
      ? { x: (geo.laenge - geo.koecher.l) / 2, y: (geo.breite - geo.koecher.b) / 2, b: geo.koecher.l, h: geo.koecher.b }
      : null;
    return {
      haupt: { titel: "Grundriss", breite: geo.laenge, hoehe: geo.breite, aussparung },
      schnitt: {
        titel: "Schnitt A–A", breite: geo.laenge, hoehe: geo.dicke, schraffur: true,
        aussparung: aussparung && geo.koecher
          ? { x: aussparung.x, y: geo.dicke - geo.koecher.t, b: geo.koecher.l, h: geo.koecher.t }
          : null,
      },
    };
  }
  if (kind === "streifenfundament") {
    return {
      haupt: { titel: "Grundriss", breite: geo.laenge, hoehe: geo.breite },
      schnitt: { titel: "Schnitt A–A", breite: geo.breite, hoehe: geo.dicke, schraffur: true },
    };
  }
  if (kind === "wand" || kind === "kellerwand") {
    return {
      haupt: { titel: "Ansicht", breite: geo.laenge, hoehe: geo.hoehe },
      schnitt: { titel: "Waagerechter Schnitt", breite: geo.laenge, hoehe: geo.dicke, schraffur: true },
    };
  }
  if (kind === "unterzug") {
    return {
      haupt: { titel: "Ansicht", breite: geo.laenge, hoehe: geo.hoehe },
      schnitt: { titel: "Querschnitt", breite: geo.breite, hoehe: geo.hoehe, schraffur: true },
    };
  }
  if (kind === "treppe" && geo.treppe) {
    const t = geo.treppe;
    // Grundriss des Laufes mit den Stufenvorderkanten
    const linien = [];
    for (let i = 1; i <= t.auftritteJeLauf; i++) {
      const x = i * t.auftritt;
      linien.push({ x1: x, y1: 0, x2: x, y2: t.laufbreite });
    }
    return {
      haupt: {
        titel: "Grundriss Lauf", breite: t.lauflaenge, hoehe: t.laufbreite, linien,
        text: treppeSteigungsText(t),
      },
      schnitt: {
        titel: "Längsschnitt", breite: t.lauflaenge, hoehe: t.laufhoehe + t.dickeLotrecht,
        polygon: treppeSchnittProfil(t), schraffur: true,
      },
    };
  }
  if (kind === "stuetze_rund" || kind === "bohrpfahl") {
    return {
      haupt: { titel: kind === "bohrpfahl" ? "Ansicht Pfahl" : "Ansicht", breite: geo.laenge, hoehe: geo.hoehe },
      schnitt: { titel: "Querschnitt", breite: geo.laenge, hoehe: geo.laenge, rund: true, schraffur: true },
    };
  }
  if (kind === "stuetze") {
    return {
      haupt: { titel: "Ansicht", breite: geo.laenge, hoehe: geo.hoehe },
      schnitt: { titel: "Querschnitt", breite: geo.laenge, hoehe: geo.breite, schraffur: true },
    };
  }
  return { haupt: { titel: "Ansicht", breite: geo.laenge, hoehe: geo.hoehe }, schnitt: null };
}

/** Zeichnet eine Schalansicht (Umriss, Aussparung, Maßketten) in ein Feld. */
function zeichneSchalAnsicht(ansicht, feld, nenner, koten) {
  if (!ansicht) return "";
  const m = (wert) => (wert * 1000) / nenner;
  const W = m(ansicht.breite), H = m(ansicht.hoehe);
  const x0 = feld.x + (feld.b - W) / 2;
  const yUK = feld.y + (feld.h + H) / 2;
  const px = (x) => x0 + m(x);
  const py = (y) => yUK - m(y);
  let svg = "";

  const fuellung = ansicht.schraffur ? "beton-schnitt" : "beton";
  if (ansicht.rund) {
    svg += `<circle cx="${px(ansicht.breite / 2).toFixed(2)}" cy="${py(ansicht.hoehe / 2).toFixed(2)}" r="${(W / 2).toFixed(2)}" class="${fuellung}"/>`;
  } else if (ansicht.polygon) {
    const pts = ansicht.polygon.map((pt) => `${px(pt.x).toFixed(2)},${py(pt.y).toFixed(2)}`).join(" ");
    svg += `<polygon points="${pts}" class="${fuellung}"/>`;
  } else {
    svg += `<rect x="${x0.toFixed(2)}" y="${(yUK - H).toFixed(2)}" width="${W.toFixed(2)}" height="${H.toFixed(2)}" class="${fuellung}"/>`;
  }

  // Zusatzlinien im Umriss (z. B. Stufenvorderkanten im Treppengrundriss)
  (ansicht.linien || []).forEach((l) => {
    svg += `<line x1="${px(l.x1).toFixed(2)}" y1="${py(l.y1).toFixed(2)}" `
      + `x2="${px(l.x2).toFixed(2)}" y2="${py(l.y2).toFixed(2)}" class="kante-duenn"/>`;
  });
  if (ansicht.text) {
    svg += `<text x="${(x0 + W / 2).toFixed(2)}" y="${(yUK - H / 2).toFixed(2)}" class="t-posklein">${ansicht.text}</text>`;
  }

  if (ansicht.aussparung) {
    const a = ansicht.aussparung;
    svg += `<rect x="${px(a.x).toFixed(2)}" y="${py(a.y + a.h).toFixed(2)}" width="${m(a.b).toFixed(2)}" height="${m(a.h).toFixed(2)}" class="aussparung"/>`;
    svg += `<text x="${px(a.x + a.b / 2).toFixed(2)}" y="${py(a.y + a.h / 2).toFixed(2)}" class="t-mass">${massText(a.b)}/${massText(a.h)}</text>`;
  }

  // Maßketten außen
  const yMass = yUK + 7;
  svg += massketteWaagerecht([x0, x0 + W], yMass, yUK, "kette");
  svg += `<text x="${(x0 + W / 2).toFixed(2)}" y="${(yMass - 1.4).toFixed(2)}" class="t-mass-gross">${massText(ansicht.breite)}</text>`;
  const xMass = x0 - 7;
  svg += massketteLotrecht([yUK, yUK - H], xMass, x0);
  svg += `<text x="${(xMass - 1.6).toFixed(2)}" y="${(yUK - H / 2).toFixed(2)}" class="t-mass-gross" transform="rotate(-90 ${(xMass - 1.6).toFixed(2)} ${(yUK - H / 2).toFixed(2)})">${massText(ansicht.hoehe)}</text>`;

  // Höhenkoten am Bauteil
  if (koten) {
    svg += `<text x="${(x0 + W + 3).toFixed(2)}" y="${(yUK - H - 1).toFixed(2)}" class="t-kote">OK ${koteText(koten.ok)}</text>`;
    svg += `<text x="${(x0 + W + 3).toFixed(2)}" y="${(yUK + 3).toFixed(2)}" class="t-kote">UK ${koteText(koten.uk)}</text>`;
  }

  svg += `<text x="${feld.x.toFixed(2)}" y="${(feld.y + 3).toFixed(2)}" class="t-kopf">${ansicht.titel} · M 1:${nenner}</text>`;
  return svg;
}

/**
 * Schalplan eines Betonbauteils als A4-Blatt quer.
 * @param {Object} daten - { element, geo, deckung, bezeichnung, typName,
 *                           auswertung, projekt }
 */
function schalplanSVG(daten) {
  const { element, geo, deckung, bezeichnung, typName, auswertung, projekt } = daten;
  const ansichten = schalAnsichten(element, geo);
  const koten = hoehenkoten(element, geo);

  const zeichenBreite = 150;
  const feldHaupt = { x: BLATT.randLinks + 6, y: BLATT.randOben + 6, b: zeichenBreite, h: 78 };
  const feldSchnitt = { x: BLATT.randLinks + 6, y: BLATT.randOben + 92, b: zeichenBreite, h: 62 };

  const nennerHaupt = waehleMassstab(ansichten.haupt.breite, ansichten.haupt.hoehe, feldHaupt.b - 26, feldHaupt.h - 18);
  const nennerSchnitt = ansichten.schnitt
    ? waehleMassstab(ansichten.schnitt.breite, ansichten.schnitt.hoehe, feldSchnitt.b - 26, feldSchnitt.h - 18)
    : nennerHaupt;

  let svg = zeichneSchalAnsicht(ansichten.haupt, feldHaupt, nennerHaupt, koten);
  if (ansichten.schnitt) svg += zeichneSchalAnsicht(ansichten.schnitt, feldSchnitt, nennerSchnitt, null);

  // ---- Angaben rechts
  const xL = BLATT.randLinks + zeichenBreite + 16;
  let yL = BLATT.randOben + 6;
  const teile = geo.schalungTeile || { seiten: geo.schalung, boden: 0, aussparung: 0 };
  const anzahl = Math.max(1, element.anzahl || 1);

  svg += `<text x="${xL}" y="${yL}" class="t-kopf">Schalplan ${bezeichnung} · ${typName}</text>`;
  yL += 6;

  const block = (titel, zeilen) => {
    svg += `<text x="${xL}" y="${yL}" class="t-th">${titel}</text>`;
    yL += 4.2;
    zeilen.forEach((t) => {
      umbrechen(t, 58).forEach((zeile, i) => {
        svg += `<text x="${(xL + (i ? 2 : 0)).toFixed(2)}" y="${yL}" class="t-klein">${zeile}</text>`;
        yL += 3.6;
      });
    });
    yL += 2.4;
  };

  block("Bauteil", [
    `Abmessungen ${geo.beschreibung}`,
    `Stückzahl ${anzahl}`,
    `OK ${koteText(koten.ok)} · UK ${koteText(koten.uk)} (bezogen auf ±0,00)`,
  ]);

  block("Beton", [
    `${element.guete} nach DIN EN 206-1 / DIN 1045-2`,
    `Expositionsklasse ${element.expo}`,
    `Betondeckung c_nom = ${deckung.cNom} mm, maßgebend: ${deckung.massgebend}`,
    `Betonvolumen ${(geo.volumen * anzahl).toFixed(2)} m³`,
    element.kind === "bohrpfahl" ? "Herstellung nach DIN EN 1536" : `Rohdichte Stahlbeton 25 kN/m³ nach DIN EN 1991-1-1`,
  ]);

  const schalZeilen = [];
  Object.keys(SCHALUNGSARTEN).forEach((art) => {
    if ((teile[art] || 0) > 0) {
      schalZeilen.push(`${SCHALUNGSARTEN[art].name} ${(teile[art] * anzahl).toFixed(2)} m²`);
    }
  });
  schalZeilen.push(`Schalfläche gesamt ${(geo.schalung * anzahl).toFixed(2)} m²`);
  schalZeilen.push(schalungsSystem(element.kind));
  if (auswertung && auswertung.aushub > 0) schalZeilen.push(`Aushub ${auswertung.aushub.toFixed(2)} m³ mit Arbeitsraum nach DIN 4124`);
  block("Schalung", schalZeilen);

  block("Ausführung", [
    "Ausschalfristen, Schalungsdruck und Standsicherheit der Schalung nach DIN EN 13670 mit DIN 1045-3 bzw. DIN EN 12812 festlegen.",
    "Maße sind Rohbaumaße ohne Toleranzen; Grenzabmaße und Ebenheiten nach DIN 18202.",
    "Aussparungen, Einbauteile und Durchdringungen der Fachplanung vor dem Betonieren einmessen.",
  ]);

  // ---- Schriftfeld
  const sfB = 104, sfH = 30;
  const sfX = BLATT.breite - BLATT.randRechts - sfB;
  const sfY = BLATT.hoehe - BLATT.randUnten - sfH;
  svg += `<rect x="${sfX}" y="${sfY}" width="${sfB}" height="${sfH}" class="schriftfeld"/>`;
  svg += `<line x1="${sfX}" y1="${sfY + 9}" x2="${sfX + sfB}" y2="${sfY + 9}" class="schriftfeld"/>`;
  svg += `<line x1="${sfX}" y1="${sfY + 19}" x2="${sfX + sfB}" y2="${sfY + 19}" class="schriftfeld"/>`;
  svg += `<line x1="${sfX + 62}" y1="${sfY + 19}" x2="${sfX + 62}" y2="${sfY + sfH}" class="schriftfeld"/>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 6}" class="t-firma">HSD Hamburg GmbH</text>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 15}" class="t-klein">${projekt.name || "Projekt"} · Schalplan ${bezeichnung} · ${typName}</text>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 25}" class="t-klein">Bearbeiter: ${projekt.bearbeiter}</text>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 28.5}" class="t-klein">Datum: ${projekt.datum}</text>`;
  svg += `<text x="${sfX + 65}" y="${sfY + 25}" class="t-massstab">M 1:${nennerHaupt}</text>`;
  svg += `<text x="${sfX + 65}" y="${sfY + 28.5}" class="t-klein">Schalung</text>`;

  svg += `<text x="${BLATT.randLinks}" y="${BLATT.hoehe - 4}" class="t-hinweis">Vorbemessung – keine prüffähige Ausführungsplanung. Rohbaumaße in Metern ohne Toleranzen nach DIN 18202; Bewehrung siehe Bewehrungsplan.</text>`;

  return schalBlatt(svg);
}

/** Gemeinsamer Rahmen und Stil der Schalpläne. */
function schalBlatt(inhalt) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BLATT.breite} ${BLATT.hoehe}" width="100%" style="background:#fff">
<style>
  .beton { fill: #f1eee8; stroke: #1b2733; stroke-width: 0.5; }
  .beton-schnitt { fill: #e4ded2; stroke: #1b2733; stroke-width: 0.6; }
  .platte { fill: #f6f4ef; stroke: #1b2733; stroke-width: 0.35; stroke-dasharray: 2.4 1.4; }
  .fundament { fill: #e8e2d6; stroke: #1b2733; stroke-width: 0.35; stroke-dasharray: 1.8 1.2; }
  .wandkoerper { fill: #cdd5db; stroke: #1b2733; stroke-width: 0.4; }
  .treppenkoerper { fill: #dee4e9; stroke: #1b2733; stroke-width: 0.4; }
  .kante-duenn { stroke: #1b2733; stroke-width: 0.22; }
  .stuetzenkoerper { fill: #8d9aa4; stroke: #1b2733; stroke-width: 0.4; }
  .aussparung { fill: #ffffff; stroke: #1b2733; stroke-width: 0.35; stroke-dasharray: 1.6 1.2; }
  .ml, .mhl, .mb { stroke: #1b2733; }
  .ml { stroke-width: 0.25; }
  .mhl { stroke-width: 0.13; }
  .mb { stroke-width: 0.35; }
  .tabelle { stroke: #1b2733; stroke-width: 0.25; }
  .fahne { stroke: #1b2733; stroke-width: 0.18; }
  .schriftfeld { fill: none; stroke: #1b2733; stroke-width: 0.35; }
  text { font-family: "IBM Plex Sans", Arial, sans-serif; fill: #1b2733; }
  .t-mass { font-size: 2.5px; text-anchor: middle; }
  .t-mass-gross { font-size: 3px; text-anchor: middle; font-weight: 600; }
  .t-kote { font-size: 2.6px; font-weight: 600; }
  .t-kopf { font-size: 3.2px; font-weight: 600; }
  .t-th { font-size: 2.7px; font-weight: 700; }
  .t-td { font-size: 2.5px; font-family: "IBM Plex Mono", monospace; }
  .t-klein { font-size: 2.6px; }
  /* Beschriftung mit hellem Rand, damit sie auf den Flächen lesbar bleibt */
  .t-pos { font-size: 2.6px; text-anchor: middle; font-weight: 700; paint-order: stroke; stroke: #ffffff; stroke-width: 0.9; stroke-linejoin: round; }
  .t-posklein { font-size: 2.2px; text-anchor: middle; paint-order: stroke; stroke: #ffffff; stroke-width: 0.8; stroke-linejoin: round; }
  .t-firma { font-size: 4.5px; font-weight: 700; }
  .t-massstab { font-size: 4px; font-weight: 600; }
  .t-hinweis { font-size: 2.2px; fill: #64707c; }
</style>
${inhalt}
</svg>`;
}

/**
 * Grundrissfiguren aller Betonbauteile im X–Z-System für Schal- und
 * Positionspläne: Wände und Streifenfundamente als Polygon entlang der
 * Achse, Platten und Punktbauteile als Rechteck, runde Bauteile als Kreis.
 */
function betonGrundrissFiguren(elemente, geometrieVon, bezeichnungVon, arbeitsraum) {
  return elemente.map((element) => {
    const typ = BETONTEILTYPEN[element.kind];
    const geo = geometrieVon(element, arbeitsraum);
    const p1 = element.p1, p2 = element.p2;
    const koten = hoehenkoten(element, geo);
    const basis = { element, geo, typ, koten, bezeichnung: bezeichnungVon(element) };

    if (element.kind === "treppe" && geo.treppe && p2) {
      // Rechteck des Laufes: Antritt an p1, Richtung nach p2
      const dx = p2.x - p1.x, dz = p2.z - p1.z;
      const len = Math.hypot(dx, dz) || 1;
      const ex = dx / len, ez = dz / len;          // Laufrichtung
      const nx = -ez, nz = ex;                     // quer zum Lauf
      const L = geo.treppe.lauflaenge, b = geo.treppe.laufbreite;
      const pkt = (u, v) => ({ x: p1.x + ex * u + nx * v, z: p1.z + ez * u + nz * v });
      return Object.assign(basis, {
        art: "polygon",
        punkte: [pkt(0, 0), pkt(L, 0), pkt(L, b), pkt(0, b)],
        mitte: pkt(L / 2, b / 2),
        klasse: "treppenkoerper",
      });
    }
    if (typ.form === "linie" && p2) {
      const dx = p2.x - p1.x, dz = p2.z - p1.z;
      const laenge = Math.hypot(dx, dz) || 0.01;
      const breite = element.kind === "streifenfundament" ? geo.breite : geo.dicke;
      const nx = -dz / laenge, nz = dx / laenge;
      const h = breite / 2;
      return Object.assign(basis, {
        art: "polygon",
        punkte: [
          { x: p1.x + nx * h, z: p1.z + nz * h }, { x: p2.x + nx * h, z: p2.z + nz * h },
          { x: p2.x - nx * h, z: p2.z - nz * h }, { x: p1.x - nx * h, z: p1.z - nz * h },
        ],
        mitte: { x: (p1.x + p2.x) / 2, z: (p1.z + p2.z) / 2 },
        klasse: typ.erdreich ? "fundament" : "wandkoerper",
      });
    }
    if (typ.form === "flaeche" && p2) {
      const x0 = Math.min(p1.x, p2.x), z0 = Math.min(p1.z, p2.z);
      return Object.assign(basis, {
        art: "rechteck", x: x0, z: z0, b: geo.laenge, t: geo.breite,
        mitte: { x: x0 + geo.laenge / 2, z: z0 + geo.breite / 2 },
        klasse: "platte",
      });
    }
    if (typ.rund) {
      return Object.assign(basis, {
        art: "kreis", x: p1.x, z: p1.z, r: geo.laenge / 2,
        mitte: { x: p1.x, z: p1.z },
        klasse: typ.erdreich ? "fundament" : "stuetzenkoerper",
      });
    }
    return Object.assign(basis, {
      art: "rechteck", x: p1.x - geo.laenge / 2, z: p1.z - geo.breite / 2,
      b: geo.laenge, t: geo.breite, mitte: { x: p1.x, z: p1.z },
      klasse: typ.erdreich ? "fundament" : "stuetzenkoerper",
      aussparung: element.kind === "koecherfundament" && geo.koecher
        ? { x: p1.x - geo.koecher.l / 2, z: p1.z - geo.koecher.b / 2, b: geo.koecher.l, t: geo.koecher.b }
        : null,
    });
    });
}

/**
 * Schalplan-Übersicht: Grundriss aller Betonbauteile mit Positionsnummern,
 * Höhenkoten und einer Zusammenstellung der Mengen.
 *
 * @param {Object} daten - { elemente, geometrieVon, bezeichnungVon,
 *                           arbeitsraum, projekt }
 */
function schalungsUebersichtSVG(daten) {
  const { elemente, geometrieVon, bezeichnungVon, arbeitsraum, projekt } = daten;

  // Grundrissfiguren aller Bauteile im X–Z-System
  const figuren = betonGrundrissFiguren(elemente, geometrieVon, bezeichnungVon, arbeitsraum);
  // Umgrenzung aller Figuren
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const merke = (x, z) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); };
  figuren.forEach((f) => {
    if (f.art === "polygon") f.punkte.forEach((pt) => merke(pt.x, pt.z));
    else if (f.art === "rechteck") { merke(f.x, f.z); merke(f.x + f.b, f.z + f.t); }
    else { merke(f.x - f.r, f.z - f.r); merke(f.x + f.r, f.z + f.r); }
  });
  if (!Number.isFinite(minX)) { minX = 0; maxX = 1; minZ = 0; maxZ = 1; }

  const breiteM = Math.max(maxX - minX, 0.5);
  const tiefeM = Math.max(maxZ - minZ, 0.5);
  const feld = { x: BLATT.randLinks + 12, y: BLATT.randOben + 10, b: 150, h: 140 };
  const nenner = waehleMassstab(breiteM, tiefeM, feld.b - 18, feld.h - 12);
  const m = (wert) => (wert * 1000) / nenner;
  const W = m(breiteM), H = m(tiefeM);
  const x0 = feld.x + (feld.b - W) / 2;
  const y0 = feld.y + (feld.h - H) / 2;
  const px = (x) => x0 + m(x - minX);
  const pz = (z) => y0 + m(z - minZ);

  let svg = "";
  // Reihenfolge: Platten, Fundamente, Wände, Stützen
  const rang = { platte: 0, fundament: 1, wandkoerper: 2, stuetzenkoerper: 3, treppenkoerper: 4 };
  figuren.slice().sort((a, b) => rang[a.klasse] - rang[b.klasse]).forEach((f) => {
    if (f.art === "polygon") {
      const d = f.punkte.map((pt) => `${px(pt.x).toFixed(2)},${pz(pt.z).toFixed(2)}`).join(" ");
      svg += `<polygon points="${d}" class="${f.klasse}"/>`;
    } else if (f.art === "rechteck") {
      svg += `<rect x="${px(f.x).toFixed(2)}" y="${pz(f.z).toFixed(2)}" width="${m(f.b).toFixed(2)}" height="${m(f.t).toFixed(2)}" class="${f.klasse}"/>`;
      if (f.aussparung) {
        svg += `<rect x="${px(f.aussparung.x).toFixed(2)}" y="${pz(f.aussparung.z).toFixed(2)}" width="${m(f.aussparung.b).toFixed(2)}" height="${m(f.aussparung.t).toFixed(2)}" class="aussparung"/>`;
      }
    } else {
      svg += `<circle cx="${px(f.x).toFixed(2)}" cy="${pz(f.z).toFixed(2)}" r="${m(f.r).toFixed(2)}" class="${f.klasse}"/>`;
    }
  });

  // Beschriftung: Position und Höhenkote
  figuren.forEach((f) => {
    const tx = px(f.mitte.x), ty = pz(f.mitte.z);
    svg += `<text x="${tx.toFixed(2)}" y="${(ty - 0.6).toFixed(2)}" class="t-pos">${f.bezeichnung}</text>`;
    svg += `<text x="${tx.toFixed(2)}" y="${(ty + 2.6).toFixed(2)}" class="t-posklein">OK ${koteText(f.koten.ok)}</text>`;
  });

  // Maßketten der Gesamtausdehnung
  const yMass = y0 + H + 8;
  svg += massketteWaagerecht([x0, x0 + W], yMass, y0 + H, "kette");
  svg += `<text x="${(x0 + W / 2).toFixed(2)}" y="${(yMass - 1.4).toFixed(2)}" class="t-mass-gross">${massText(breiteM)}</text>`;
  const xMass = x0 - 8;
  svg += massketteLotrecht([y0 + H, y0], xMass, x0);
  svg += `<text x="${(xMass - 1.6).toFixed(2)}" y="${(y0 + H / 2).toFixed(2)}" class="t-mass-gross" transform="rotate(-90 ${(xMass - 1.6).toFixed(2)} ${(y0 + H / 2).toFixed(2)})">${massText(tiefeM)}</text>`;

  // ---- Zusammenstellung rechts
  const xL = BLATT.randLinks + 172;
  let yL = BLATT.randOben + 6;
  svg += `<text x="${xL}" y="${yL}" class="t-kopf">Schalplan-Übersicht · M 1:${nenner}</text>`;
  yL += 5.5;
  const spalten = [0, 12, 46, 62, 78];
  ["Pos", "Bauteil", "Beton m³", "Schal. m²", "OK"].forEach((t, i) => {
    svg += `<text x="${(xL + spalten[i]).toFixed(2)}" y="${yL}" class="t-th">${t}</text>`;
  });
  svg += `<line x1="${xL}" y1="${(yL + 1.4).toFixed(2)}" x2="${(xL + 88).toFixed(2)}" y2="${(yL + 1.4).toFixed(2)}" class="tabelle"/>`;
  yL += 4.4;

  let vGes = 0, sGes = 0;
  figuren.forEach((f) => {
    const anzahl = Math.max(1, f.element.anzahl || 1);
    const v = f.geo.volumen * anzahl;
    const sch = f.geo.schalung * anzahl;
    vGes += v; sGes += sch;
    const werte = [f.bezeichnung, f.typ.name.slice(0, 22), v.toFixed(2), sch.toFixed(2), koteText(f.koten.ok)];
    werte.forEach((t, i) => {
      svg += `<text x="${(xL + spalten[i]).toFixed(2)}" y="${yL}" class="${i === 1 ? "t-klein" : "t-td"}">${t}</text>`;
    });
    yL += 3.8;
  });
  svg += `<line x1="${xL}" y1="${(yL - 2.6).toFixed(2)}" x2="${(xL + 88).toFixed(2)}" y2="${(yL - 2.6).toFixed(2)}" class="tabelle"/>`;
  svg += `<text x="${xL}" y="${yL}" class="t-th">Summe</text>`;
  svg += `<text x="${(xL + spalten[2]).toFixed(2)}" y="${yL}" class="t-th">${vGes.toFixed(2)}</text>`;
  svg += `<text x="${(xL + spalten[3]).toFixed(2)}" y="${yL}" class="t-th">${sGes.toFixed(2)}</text>`;
  yL += 7;

  // Legende
  svg += `<text x="${xL}" y="${yL}" class="t-th">Legende</text>`;
  yL += 4.4;
  [["platte", "Platte (Bodenplatte, Decke)"], ["fundament", "Gründungsbauteil unter Gelände"],
   ["wandkoerper", "Wand, Balken"], ["stuetzenkoerper", "Stütze"],
   ["treppenkoerper", "Treppe"]].forEach(([klasse, text]) => {
    svg += `<rect x="${xL}" y="${(yL - 2.6).toFixed(2)}" width="4" height="3" class="${klasse}"/>`;
    svg += `<text x="${(xL + 6).toFixed(2)}" y="${yL}" class="t-klein">${text}</text>`;
    yL += 4.4;
  });
  yL += 2;
  ["Höhenkoten in Metern über ±0,00 der Arbeitsebene.",
   "Maße sind Rohbaumaße ohne Toleranzen nach DIN 18202.",
   "Bewehrung siehe Bewehrungspläne der Einzelbauteile."].forEach((t) => {
    umbrechen(t, 40).forEach((zeile) => {
      svg += `<text x="${xL}" y="${yL}" class="t-klein">${zeile}</text>`;
      yL += 3.6;
    });
  });

  // Schriftfeld
  const sfB = 104, sfH = 30;
  const sfX = BLATT.breite - BLATT.randRechts - sfB;
  const sfY = BLATT.hoehe - BLATT.randUnten - sfH;
  svg += `<rect x="${sfX}" y="${sfY}" width="${sfB}" height="${sfH}" class="schriftfeld"/>`;
  svg += `<line x1="${sfX}" y1="${sfY + 9}" x2="${sfX + sfB}" y2="${sfY + 9}" class="schriftfeld"/>`;
  svg += `<line x1="${sfX}" y1="${sfY + 19}" x2="${sfX + sfB}" y2="${sfY + 19}" class="schriftfeld"/>`;
  svg += `<line x1="${sfX + 62}" y1="${sfY + 19}" x2="${sfX + 62}" y2="${sfY + sfH}" class="schriftfeld"/>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 6}" class="t-firma">HSD Hamburg GmbH</text>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 15}" class="t-klein">${projekt.name || "Projekt"} · Schalplan-Übersicht · ${figuren.length} Bauteile</text>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 25}" class="t-klein">Bearbeiter: ${projekt.bearbeiter}</text>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 28.5}" class="t-klein">Datum: ${projekt.datum}</text>`;
  svg += `<text x="${sfX + 65}" y="${sfY + 25}" class="t-massstab">M 1:${nenner}</text>`;
  svg += `<text x="${sfX + 65}" y="${sfY + 28.5}" class="t-klein">Schalung</text>`;

  svg += `<text x="${BLATT.randLinks}" y="${BLATT.hoehe - 4}" class="t-hinweis">Vorbemessung – keine prüffähige Ausführungsplanung. Ausschalfristen und Standsicherheit der Schalung nach DIN EN 13670 mit DIN 1045-3 und DIN EN 12812.</text>`;

  return schalBlatt(svg);
}
