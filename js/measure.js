/**
 * Aufmaß nach VOB/B § 14 und VOB/C.
 *
 * Geführt werden Aufmaßblätter je Leistungsverzeichnis-Position: Aufmaßzeilen
 * mit Anzahl, Länge, Breite und Höhe, getrennt nach Zugang (+) und Abzug (−),
 * die Übermessungsregeln der jeweiligen ATV sowie die Summe je Position und
 * ihre Verrechnung mit dem Einheitspreis.
 *
 * Rechenweg einer Zeile:  Menge = Anzahl · Länge · Breite · Höhe
 * Nicht besetzte Maße bleiben unberücksichtigt; welche Maße die Position
 * braucht, folgt aus ihrer Einheit (m, m², m³, Stück …).
 *
 * Übermessung: Nach den Abrechnungsregeln der ATV (Abschnitt 5) werden
 * Öffnungen und Aussparungen bis zu einer Einzelgröße nicht abgezogen,
 * sondern übermessen. Die hinterlegten Grenzwerte sind Voreinstellung;
 * maßgebend ist die geltende Fassung der VOB/C. Sie sind daher je Gewerk
 * überschreibbar und stehen mit ihrer ATV im Aufmaßblatt.
 *
 * NICHT geführt werden: die Prüfung der Abrechnungseinheit gegen den
 * LV-Text, die Zuordnung zu Abschlagsrechnungen nach § 16 VOB/B, Stundenlohn-
 * arbeiten nach § 15 VOB/B sowie der Datenaustausch nach REB-VB 23.003 bzw.
 * GAEB – dieser kann ergänzt werden, sobald eine Beispieldatei der
 * Abrechnungsstelle vorliegt.
 */

/** Einheiten des Aufmaßes mit den Maßen, die sie benötigen. */
const AUFMASS_EINHEITEN = {
  m:    { name: "m – Länge",        masse: ["anzahl", "laenge"] },
  "m²": { name: "m² – Fläche",      masse: ["anzahl", "laenge", "breite"] },
  "m³": { name: "m³ – Rauminhalt",  masse: ["anzahl", "laenge", "breite", "hoehe"] },
  Stk:  { name: "Stk – Stückzahl",  masse: ["anzahl"] },
  kg:   { name: "kg – Masse",       masse: ["anzahl", "laenge"] },
  t:    { name: "t – Masse",        masse: ["anzahl", "laenge"] },
  h:    { name: "h – Stunden",      masse: ["anzahl"] },
  psch: { name: "psch – pauschal",  masse: ["anzahl"] },
};

const AUFMASS_MASS_NAMEN = {
  anzahl: "Anzahl", laenge: "Länge [m]", breite: "Breite [m]", hoehe: "Höhe [m]",
};

/**
 * Gewerke mit ihrer ATV und der voreingestellten Übermessungsgrenze.
 *
 * grenze = größte Einzelgröße einer Öffnung oder Aussparung, die nach der
 * Abrechnungsregel der ATV nicht abgezogen, sondern übermessen wird [m²].
 * grenze 0 bedeutet: jeder Abzug wird abgezogen.
 *
 * Die Werte sind Voreinstellung nach den Abrechnungsregeln (Abschnitt 5) der
 * jeweiligen ATV und im Aufmaßblatt überschreibbar. Maßgebend ist die
 * geltende Fassung der VOB/C.
 */
const AUFMASS_GEWERKE = {
  din18299: { atv: "DIN 18299", name: "Allgemeine Regelungen", grenze: 0 },
  din18330: { atv: "DIN 18330", name: "Mauerarbeiten", grenze: 2.5 },
  din18331: { atv: "DIN 18331", name: "Beton- und Stahlbetonarbeiten", grenze: 0.5 },
  din18335: { atv: "DIN 18335", name: "Stahlbauarbeiten", grenze: 0 },
  din18345: { atv: "DIN 18345", name: "Wärmedämm-Verbundsysteme", grenze: 2.5 },
  din18350: { atv: "DIN 18350", name: "Putz- und Stuckarbeiten", grenze: 2.5 },
  din18352: { atv: "DIN 18352", name: "Fliesen- und Plattenarbeiten", grenze: 0.1 },
  din18353: { atv: "DIN 18353", name: "Estricharbeiten", grenze: 0.1 },
  din18363: { atv: "DIN 18363", name: "Maler- und Lackierarbeiten", grenze: 2.5 },
  din18365: { atv: "DIN 18365", name: "Bodenbelagarbeiten", grenze: 0.1 },
  din18451: { atv: "DIN 18451", name: "Gerüstarbeiten", grenze: 0 },
};

/** Zahl aus einem Eingabefeld: Komma und Punkt gelten gleichermaßen. */
function aufmassZahl(wert) {
  if (typeof wert === "number") return Number.isFinite(wert) ? wert : null;
  if (wert === undefined || wert === null) return null;
  const text = String(wert).trim().replace(",", ".");
  if (text === "") return null;
  const zahl = Number(text);
  return Number.isFinite(zahl) ? zahl : null;
}

/**
 * Menge einer Aufmaßzeile.
 *
 * @param {Object} zeile - { anzahl, laenge, breite, hoehe, art, bezug, bemerkung }
 * @param {string} einheit - Einheit der Position
 * @returns {Object} { menge, einzel, faktoren, vollstaendig }
 */
function aufmassZeile(zeile, einheit) {
  const eh = AUFMASS_EINHEITEN[einheit] || AUFMASS_EINHEITEN["m²"];
  const anzahl = aufmassZahl(zeile.anzahl);
  const faktoren = [];
  let einzel = 1;          // Einzelgröße ohne die Stückzahl
  let vollstaendig = true;

  eh.masse.forEach((feld) => {
    if (feld === "anzahl") return;
    const wert = aufmassZahl(zeile[feld]);
    if (wert === null) { vollstaendig = false; return; }
    faktoren.push({ feld, wert });
    einzel *= wert;
  });

  const stueck = anzahl === null ? 1 : anzahl;
  // Stückzahl ohne weitere Maße (Stk, h, psch): die Einzelgröße ist 1
  const menge = stueck * einzel;
  return {
    menge, einzel: faktoren.length ? einzel : 0, stueck, faktoren,
    vollstaendig: vollstaendig && (faktoren.length > 0 || anzahl !== null),
  };
}

/** Stückzahl ganzzahlig, Maße in Metern mit zwei bis drei Nachkommastellen. */
function aufmassMassText(wert) {
  const drei = wert.toFixed(3);
  const text = drei.endsWith("0") ? wert.toFixed(2) : drei;
  return text.replace(".", ",");
}

/** Formeltext einer Zeile, wie er im Aufmaßblatt steht: „4 · 1,26 · 1,51". */
function aufmassFormel(zeile, einheit) {
  const w = aufmassZeile(zeile, einheit);
  const teile = [];
  if (aufmassZahl(zeile.anzahl) !== null) {
    teile.push(Number.isInteger(w.stueck) ? String(w.stueck) : aufmassMassText(w.stueck));
  }
  w.faktoren.forEach((f) => teile.push(aufmassMassText(f.wert)));
  return teile.length ? teile.join(" · ") : "–";
}

/**
 * Übermessungsgrenze einer Position: eigener Wert vor Gewerkevoreinstellung.
 * @returns {Object} { grenze, atv, quelle }
 */
function aufmassGrenze(position) {
  const gewerk = AUFMASS_GEWERKE[position.gewerk] || AUFMASS_GEWERKE.din18299;
  const eigen = aufmassZahl(position.grenze);
  if (eigen !== null && eigen >= 0) {
    return { grenze: eigen, atv: gewerk.atv, quelle: "im Aufmaßblatt vorgegeben" };
  }
  return { grenze: gewerk.grenze, atv: gewerk.atv, quelle: `Voreinstellung ${gewerk.atv}` };
}

/**
 * Aufmaß einer Position: alle Zeilen mit Menge, Übermessung und Summe.
 *
 * @param {Object} position - { pos, kurztext, einheit, gewerk, grenze, ep, zeilen }
 * @returns {Object} { zeilen, zugang, abzug, uebermessen, summe, betrag, hinweise, grenze }
 */
function aufmassPosition(position) {
  const einheit = position.einheit || "m²";
  const { grenze, atv, quelle } = aufmassGrenze(position);
  const flaechig = einheit === "m²" || einheit === "m³";

  let zugang = 0, abzug = 0, uebermessen = 0, stueckUebermessen = 0;
  const zeilen = (position.zeilen || []).map((z) => {
    const w = aufmassZeile(z, einheit);
    const istAbzug = z.art === "abzug";
    // Übermessen wird nur, was als Abzug erfasst ist und dessen Einzelgröße
    // die Grenze der ATV nicht überschreitet
    const uebermisst = istAbzug && flaechig && grenze > 0
      && w.einzel > 0 && w.einzel <= grenze + 1e-9;

    if (!w.vollstaendig) {
      return Object.assign({}, z, w, { istAbzug, uebermisst: false, wirksam: 0, unvollstaendig: true });
    }
    if (uebermisst) {
      uebermessen += w.menge;
      stueckUebermessen += w.stueck;
      return Object.assign({}, z, w, { istAbzug, uebermisst, wirksam: 0 });
    }
    if (istAbzug) {
      abzug += w.menge;
      return Object.assign({}, z, w, { istAbzug, uebermisst, wirksam: -w.menge });
    }
    zugang += w.menge;
    return Object.assign({}, z, w, { istAbzug, uebermisst, wirksam: w.menge });
  });

  const summe = zugang - abzug;
  const ep = aufmassZahl(position.ep) || 0;
  const hinweise = [];

  if (stueckUebermessen > 0) {
    hinweise.push(`${stueckUebermessen} Öffnung${stueckUebermessen === 1 ? "" : "en"} bis `
      + `${grenze.toFixed(2).replace(".", ",")} m² Einzelgröße übermessen `
      + `(${uebermessen.toFixed(3).replace(".", ",")} ${einheit}) – ${atv}, Abschnitt 5.`);
  }
  if (grenze > 0 && !flaechig) {
    hinweise.push("Die Übermessungsregel gilt für flächen- und raumbezogene Positionen; "
      + "bei dieser Einheit wird jeder Abzug abgezogen.");
  }
  if (zeilen.some((z) => z.unvollstaendig)) {
    hinweise.push("Zeilen ohne vollständige Maße sind mit 0 angesetzt.");
  }
  if (summe < 0) {
    hinweise.push("Die Abzüge übersteigen die Zugänge – Aufmaß prüfen.");
  }

  return {
    zeilen, zugang, abzug, uebermessen, summe, ep, betrag: summe * ep,
    einheit, grenze, atv, quelle, hinweise,
  };
}

/**
 * Zusammenstellung aller Aufmaßpositionen für die Abrechnung.
 * @returns {Object} { zeilen, betrag, positionen }
 */
function aufmassAufstellung(positionen) {
  let betrag = 0;
  const zeilen = positionen.map((p) => {
    const a = aufmassPosition(p);
    betrag += a.betrag;
    return {
      pos: p.pos || "", kurztext: p.kurztext || "", einheit: a.einheit,
      zugang: a.zugang, abzug: a.abzug, uebermessen: a.uebermessen,
      summe: a.summe, ep: a.ep, wert: a.betrag, atv: a.atv,
      anzahlZeilen: a.zeilen.length,
    };
  });
  return { zeilen, betrag, positionen: positionen.length };
}

/* -------------------------------------------------------- Aufmaßblatt */

/**
 * Aufmaßblatt einer Position als A4-Blatt quer.
 *
 * Aufbau nach der Übung im Bauwesen: Kopf mit Bauvorhaben und Position,
 * Aufmaßzeilen mit Bezug, Formel und Menge, Zusammenstellung sowie die
 * Unterschriftenfelder für das gemeinsame Aufmaß nach § 14 Abs. 2 VOB/B.
 *
 * @param {Object} daten - { position, auswertung, blattNr, projekt }
 */
function aufmassblattSVG(daten) {
  const { position, auswertung, projekt } = daten;
  const blattNr = daten.blattNr || 1;
  const zahl = (wert, stellen) => wert.toFixed(stellen === undefined ? 3 : stellen).replace(".", ",");

  const x0 = BLATT.randLinks;
  const breite = BLATT.breite - BLATT.randLinks - BLATT.randRechts;
  let svg = "";

  // ---- Kopf
  let y = BLATT.randOben + 6;
  svg += `<text x="${x0}" y="${y}" class="t-titel">Aufmaßblatt Nr. ${blattNr}</text>`;
  svg += `<text x="${x0 + breite}" y="${y}" class="t-kopf-rechts">VOB/B § 14 · Abrechnungsregeln ${auswertung.atv}</text>`;
  y += 3;
  svg += `<line x1="${x0}" y1="${y}" x2="${x0 + breite}" y2="${y}" class="mb"/>`;
  y += 6;

  const feld = (spalte, label, wert) => {
    svg += `<text x="${spalte}" y="${y}" class="t-label">${label}</text>`;
    svg += `<text x="${spalte}" y="${y + 4}" class="t-wert">${wert || "–"}</text>`;
  };
  feld(x0, "Bauvorhaben", projekt.name || "Projekt");
  feld(x0 + 90, "LV-Position", position.pos || "–");
  feld(x0 + 140, "Einheit", auswertung.einheit);
  feld(x0 + 170, "Gewerk", auswertung.atv);
  feld(x0 + 215, "Aufmaßdatum", position.datum || projekt.datum || "–");
  y += 10;
  svg += `<text x="${x0}" y="${y}" class="t-label">Kurztext</text>`;
  svg += `<text x="${x0 + 22}" y="${y}" class="t-wert">${position.kurztext || "–"}</text>`;
  y += 5;

  // ---- Tabellenkopf
  const spalten = [
    { x: x0, b: 12, name: "Zeile", rechts: false },
    { x: x0 + 12, b: 62, name: "Bezug (Bauteil, Achse, Geschoss)", rechts: false },
    { x: x0 + 74, b: 10, name: "±", rechts: false },
    { x: x0 + 84, b: 52, name: "Formel  Anzahl · L · B · H", rechts: false },
    { x: x0 + 136, b: 22, name: "Einzelgröße", rechts: true },
    { x: x0 + 158, b: 24, name: `Menge [${auswertung.einheit}]`, rechts: true },
    { x: x0 + 182, b: 24, name: "wirksam", rechts: true },
    { x: x0 + 206, b: breite - 206, name: "Bemerkung", rechts: false },
  ];
  svg += `<line x1="${x0}" y1="${y}" x2="${x0 + breite}" y2="${y}" class="ml"/>`;
  y += 4;
  spalten.forEach((s) => {
    const tx = s.rechts ? s.x + s.b - 1 : s.x + 1;
    svg += `<text x="${tx}" y="${y}" class="t-th ${s.rechts ? "rechts" : ""}">${s.name}</text>`;
  });
  y += 1.5;
  svg += `<line x1="${x0}" y1="${y}" x2="${x0 + breite}" y2="${y}" class="ml"/>`;

  // ---- Aufmaßzeilen
  const zeilenHoehe = 4.6;
  const platz = Math.floor((BLATT.hoehe - BLATT.randUnten - 46 - y) / zeilenHoehe);
  const gezeigt = auswertung.zeilen.slice(0, platz);

  gezeigt.forEach((z, i) => {
    y += zeilenHoehe;
    const klasse = z.uebermisst ? "t-td grau" : "t-td";
    const vorzeichen = z.istAbzug ? "−" : "+";
    svg += `<text x="${x0 + 1}" y="${y}" class="${klasse}">${i + 1}</text>`;
    svg += `<text x="${x0 + 13}" y="${y}" class="${klasse}">${(z.bezug || "").slice(0, 42)}</text>`;
    svg += `<text x="${x0 + 75}" y="${y}" class="${klasse}">${vorzeichen}</text>`;
    svg += `<text x="${x0 + 85}" y="${y}" class="${klasse}">${aufmassFormel(z, auswertung.einheit)}</text>`;
    svg += `<text x="${x0 + 157}" y="${y}" class="${klasse} rechts">${z.einzel > 0 ? zahl(z.einzel) : "–"}</text>`;
    svg += `<text x="${x0 + 181}" y="${y}" class="${klasse} rechts">${zahl(z.menge)}</text>`;
    svg += `<text x="${x0 + 205}" y="${y}" class="${klasse} rechts">`
      + `${z.uebermisst ? "übermessen" : (z.wirksam >= 0 ? "" : "−") + zahl(Math.abs(z.wirksam))}</text>`;
    svg += `<text x="${x0 + 207}" y="${y}" class="${klasse}">${(z.bemerkung || "").slice(0, 34)}</text>`;
  });

  if (auswertung.zeilen.length > platz) {
    y += zeilenHoehe;
    svg += `<text x="${x0 + 13}" y="${y}" class="t-td grau">… ${auswertung.zeilen.length - platz} weitere Zeilen auf Folgeblatt</text>`;
  }

  // ---- Zusammenstellung
  y += 3;
  svg += `<line x1="${x0}" y1="${y}" x2="${x0 + breite}" y2="${y}" class="ml"/>`;
  y += 5;
  const summenZeile = (name, wert, stark) => {
    svg += `<text x="${x0 + 84}" y="${y}" class="${stark ? "t-summe" : "t-td"}">${name}</text>`;
    svg += `<text x="${x0 + 181}" y="${y}" class="${stark ? "t-summe" : "t-td"} rechts">${wert}</text>`;
    y += 4.4;
  };
  summenZeile("Zugang", `${zahl(auswertung.zugang)} ${auswertung.einheit}`);
  summenZeile("Abzug", `− ${zahl(auswertung.abzug)} ${auswertung.einheit}`);
  if (auswertung.uebermessen > 0) {
    summenZeile(`übermessen (Einzelgröße bis ${zahl(auswertung.grenze, 2)} m²)`,
      `(${zahl(auswertung.uebermessen)} ${auswertung.einheit})`);
  }
  svg += `<line x1="${x0 + 84}" y1="${y - 3.2}" x2="${x0 + 181}" y2="${y - 3.2}" class="ml"/>`;
  summenZeile("Aufmaßsumme", `${zahl(auswertung.summe)} ${auswertung.einheit}`, true);
  if (auswertung.ep > 0) {
    summenZeile(`Einheitspreis ${zahl(auswertung.ep, 2)} €/${auswertung.einheit}`,
      `${zahl(auswertung.betrag, 2)} €`, true);
  }

  // ---- Hinweise
  let yH = y + 2;
  auswertung.hinweise.forEach((h) => {
    umbrechen(h, 108).forEach((zeile) => {
      svg += `<text x="${x0}" y="${yH}" class="t-hinweis-blatt">${zeile}</text>`;
      yH += 3.2;
    });
  });

  // ---- Unterschriften: gemeinsames Aufmaß nach § 14 Abs. 2 VOB/B
  const yU = BLATT.hoehe - BLATT.randUnten - 22;
  svg += `<text x="${x0}" y="${yU - 2}" class="t-label">Gemeinsames Aufmaß nach VOB/B § 14 Abs. 2</text>`;
  [["Aufgenommen (Auftragnehmer)", position.aufgenommen, x0],
   ["Anerkannt (Auftraggeber / Bauleitung)", position.anerkannt, x0 + 95]].forEach(([text, wert, sx]) => {
    svg += `<line x1="${sx}" y1="${yU + 8}" x2="${sx + 85}" y2="${yU + 8}" class="ml"/>`;
    svg += `<text x="${sx}" y="${yU + 6.5}" class="t-wert">${wert || ""}</text>`;
    svg += `<text x="${sx}" y="${yU + 12}" class="t-klein">${text}</text>`;
    svg += `<text x="${sx}" y="${yU + 15.5}" class="t-klein">Ort, Datum, Unterschrift</text>`;
  });

  // ---- Schriftfeld
  const sfB = 92, sfH = 24;
  const sfX = BLATT.breite - BLATT.randRechts - sfB;
  const sfY = BLATT.hoehe - BLATT.randUnten - sfH;
  svg += `<rect x="${sfX}" y="${sfY}" width="${sfB}" height="${sfH}" class="schriftfeld"/>`;
  svg += `<line x1="${sfX}" y1="${sfY + 8}" x2="${sfX + sfB}" y2="${sfY + 8}" class="schriftfeld"/>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 5.5}" class="t-firma">HSD Hamburg GmbH</text>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 13}" class="t-klein">${projekt.name || "Projekt"} · Aufmaßblatt ${blattNr}</text>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 17}" class="t-klein">Bearbeiter: ${projekt.bearbeiter}</text>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 21}" class="t-klein">Datum: ${projekt.datum || "–"}</text>`;

  svg += `<text x="${x0}" y="${BLATT.hoehe - 3}" class="t-hinweis">Aufmaß nach VOB/B § 14 mit den Abrechnungsregeln der ${auswertung.atv}, Abschnitt 5. `
    + `Übermessungsgrenze ${zahl(auswertung.grenze, 2)} m² (${auswertung.quelle}) – maßgebend ist die geltende Fassung der VOB/C.</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BLATT.breite} ${BLATT.hoehe}" width="100%" style="background:#fff">
<style>
  .ml { stroke: #1b2733; stroke-width: 0.2; }
  .mb { stroke: #1b2733; stroke-width: 0.5; }
  .schriftfeld { fill: none; stroke: #1b2733; stroke-width: 0.35; }
  text { font-family: "IBM Plex Sans", Arial, sans-serif; fill: #1b2733; }
  .rechts { text-anchor: end; }
  .grau { fill: #7a848e; }
  .t-titel { font-size: 5px; font-weight: 700; }
  .t-kopf-rechts { font-size: 2.6px; text-anchor: end; fill: #64707c; }
  .t-label { font-size: 2.2px; fill: #64707c; text-transform: uppercase; letter-spacing: 0.2px; }
  .t-wert { font-size: 3px; font-weight: 600; }
  .t-th { font-size: 2.4px; font-weight: 700; }
  .t-td { font-size: 2.6px; font-family: "IBM Plex Mono", monospace; }
  .t-summe { font-size: 2.9px; font-family: "IBM Plex Mono", monospace; font-weight: 700; }
  .t-klein { font-size: 2.3px; fill: #64707c; }
  .t-firma { font-size: 4px; font-weight: 700; }
  .t-hinweis-blatt { font-size: 2.3px; fill: #46525e; }
  .t-hinweis { font-size: 2.2px; fill: #64707c; }
</style>
${svg}
</svg>`;
}
