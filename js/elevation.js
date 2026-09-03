/**
 * Wandansicht als maßstäbliche Zeichnung (SVG im Blattformat A4 quer).
 *
 * Maßeintragung in Anlehnung an DIN 406-11 (Maßlinie mit Maßhilfslinien,
 * Begrenzung durch Schrägstriche, Maßzahl über der Maßlinie), Linienbreiten
 * nach DIN ISO 128, Maßstäbe nach DIN ISO 5455. Alle Blattmaße in Millimetern.
 */

const BLATT = { breite: 297, hoehe: 210, randLinks: 20, randRechts: 10, randOben: 12, randUnten: 10 };
const MASSSTAEBE = [10, 20, 25, 50, 100, 200, 500];

/** Kleinster Maßstab (= größte Darstellung), bei dem die Wand ins Feld passt. */
function waehleMassstab(laengeM, hoeheM, feldBreite, feldHoehe) {
  for (const nenner of MASSSTAEBE) {
    if ((laengeM * 1000) / nenner <= feldBreite && (hoeheM * 1000) / nenner <= feldHoehe) return nenner;
  }
  return MASSSTAEBE[MASSSTAEBE.length - 1];
}

function meterText(wert) {
  return wert.toFixed(2).replace(".", ",");
}

/** Waagerechte Maßlinie mit Maßhilfslinien und Schrägstrich-Begrenzung. */
function massketteWaagerecht(punkte, y, objektY, klasse) {
  let svg = "";
  punkte.forEach((px) => {
    svg += `<line x1="${px.toFixed(2)}" y1="${objektY.toFixed(2)}" x2="${px.toFixed(2)}" y2="${(y + 2).toFixed(2)}" class="mhl"/>`;
  });
  svg += `<line x1="${punkte[0].toFixed(2)}" y1="${y}" x2="${punkte[punkte.length - 1].toFixed(2)}" y2="${y}" class="ml"/>`;
  for (let i = 0; i < punkte.length - 1; i++) {
    const a = punkte[i], b = punkte[i + 1];
    svg += `<line x1="${(a - 1.2).toFixed(2)}" y1="${(y + 1.2).toFixed(2)}" x2="${(a + 1.2).toFixed(2)}" y2="${(y - 1.2).toFixed(2)}" class="mb"/>`;
    if (i === punkte.length - 2) {
      svg += `<line x1="${(b - 1.2).toFixed(2)}" y1="${(y + 1.2).toFixed(2)}" x2="${(b + 1.2).toFixed(2)}" y2="${(y - 1.2).toFixed(2)}" class="mb"/>`;
    }
  }
  return svg;
}

/** Lotrechte Maßlinie. */
function massketteLotrecht(punkte, x, objektX) {
  let svg = "";
  punkte.forEach((py) => {
    svg += `<line x1="${objektX.toFixed(2)}" y1="${py.toFixed(2)}" x2="${(x - 2).toFixed(2)}" y2="${py.toFixed(2)}" class="mhl"/>`;
  });
  svg += `<line x1="${x}" y1="${punkte[0].toFixed(2)}" x2="${x}" y2="${punkte[punkte.length - 1].toFixed(2)}" class="ml"/>`;
  punkte.forEach((py) => {
    svg += `<line x1="${(x - 1.2).toFixed(2)}" y1="${(py + 1.2).toFixed(2)}" x2="${(x + 1.2).toFixed(2)}" y2="${(py - 1.2).toFixed(2)}" class="mb"/>`;
  });
  return svg;
}

/**
 * Zeichnet die Ansicht einer Wand.
 * @param {Object} daten - { element, felder, geo, auswertung, bezeichnung, projekt }
 * @returns {string} vollständiges SVG
 */
function wandAnsichtSVG(daten) {
  const { element, felder, geo, auswertung, bezeichnung, projekt } = daten;

  const feldBreite = BLATT.breite - BLATT.randLinks - BLATT.randRechts - 90; // rechts bleibt Platz für den Aufbau
  const feldHoehe = 92;
  const nenner = waehleMassstab(geo.laenge, geo.hoehe, feldBreite, feldHoehe);
  const m = (wert) => (wert * 1000) / nenner; // Meter -> Blattmillimeter

  const W = m(geo.laenge);
  const H = m(geo.hoehe);
  const x0 = BLATT.randLinks + 18;
  const yUK = BLATT.randOben + 20 + feldHoehe; // Wandunterkante
  const yOK = yUK - H;

  let svg = "";

  // Wandumriss
  svg += `<rect x="${x0.toFixed(2)}" y="${yOK.toFixed(2)}" width="${W.toFixed(2)}" height="${H.toFixed(2)}" class="bauteil"/>`;

  // Öffnungen mit Beschriftung
  const sortiert = felder.slice().sort((a, b) => a.x0 - b.x0);
  sortiert.forEach((f, i) => {
    const fx = x0 + m(f.x0);
    const fy = yUK - m(f.y0 + f.h);
    const fw = m(f.b);
    const fh = m(f.h);
    const art = OEFFNUNGSTYPEN[f.typ] ? OEFFNUNGSTYPEN[f.typ].art : "Fenster";
    svg += `<rect x="${fx.toFixed(2)}" y="${fy.toFixed(2)}" width="${fw.toFixed(2)}" height="${fh.toFixed(2)}" class="${art === "Fenster" ? "fenster" : "tuer"}"/>`;
    // Diagonalkreuz kennzeichnet die Öffnung
    svg += `<line x1="${fx.toFixed(2)}" y1="${fy.toFixed(2)}" x2="${(fx + fw).toFixed(2)}" y2="${(fy + fh).toFixed(2)}" class="oeffnung-kreuz"/>`;
    svg += `<line x1="${(fx + fw).toFixed(2)}" y1="${fy.toFixed(2)}" x2="${fx.toFixed(2)}" y2="${(fy + fh).toFixed(2)}" class="oeffnung-kreuz"/>`;

    const mitteX = fx + fw / 2;
    const mitteY = fy + fh / 2;
    svg += `<text x="${mitteX.toFixed(2)}" y="${(mitteY - 1.5).toFixed(2)}" class="t-oeffnung">${art === "Fenster" ? "F" : "T"}${f.id}.${f.index + 1}</text>`;
    svg += `<text x="${mitteX.toFixed(2)}" y="${(mitteY + 2.2).toFixed(2)}" class="t-mass">${meterText(f.b)}/${meterText(f.h)}</text>`;
    svg += `<text x="${mitteX.toFixed(2)}" y="${(mitteY + 5.6).toFixed(2)}" class="t-mass">BRH ${meterText(f.y0)}</text>`;
  });

  // Untere Maßkette: Pfeiler und Öffnungsbreiten
  const punkteX = [x0];
  sortiert.forEach((f) => {
    punkteX.push(x0 + m(f.x0));
    punkteX.push(x0 + m(f.x0 + f.b));
  });
  punkteX.push(x0 + W);
  const yMass1 = yUK + 12;
  svg += massketteWaagerecht(punkteX, yMass1, yUK, "kette");
  for (let i = 0; i < punkteX.length - 1; i++) {
    const breiteMm = punkteX[i + 1] - punkteX[i];
    if (breiteMm < 3) continue; // zu schmal für eine Maßzahl
    const wertM = (breiteMm * nenner) / 1000;
    svg += `<text x="${((punkteX[i] + punkteX[i + 1]) / 2).toFixed(2)}" y="${(yMass1 - 1.5).toFixed(2)}" class="t-mass">${meterText(wertM)}</text>`;
  }

  // Zweite Maßkette: Gesamtlänge
  const yMass2 = yUK + 24;
  svg += massketteWaagerecht([x0, x0 + W], yMass2, yMass1 + 2, "kette");
  svg += `<text x="${(x0 + W / 2).toFixed(2)}" y="${(yMass2 - 1.5).toFixed(2)}" class="t-mass-gross">${meterText(geo.laenge)}</text>`;

  // Lotrechte Maßkette links: Brüstung, Öffnungshöhe, Rest sowie Gesamthöhe
  const xMass1 = x0 - 8;
  const erste = sortiert[0];
  if (erste) {
    const punkteY = [yUK, yUK - m(erste.y0), yUK - m(erste.y0 + erste.h), yOK];
    svg += massketteLotrecht(punkteY, xMass1, x0);
    const werte = [erste.y0, erste.h, geo.hoehe - erste.y0 - erste.h];
    for (let i = 0; i < werte.length; i++) {
      if (m(werte[i]) < 4) continue;
      const my = (punkteY[i] + punkteY[i + 1]) / 2;
      svg += `<text x="${(xMass1 - 2).toFixed(2)}" y="${my.toFixed(2)}" class="t-mass-v" transform="rotate(-90 ${(xMass1 - 2).toFixed(2)} ${my.toFixed(2)})">${meterText(werte[i])}</text>`;
    }
  }
  const xMass2 = x0 - 16;
  svg += massketteLotrecht([yUK, yOK], xMass2, xMass1 - 2);
  svg += `<text x="${(xMass2 - 2).toFixed(2)}" y="${((yUK + yOK) / 2).toFixed(2)}" class="t-mass-gross" transform="rotate(-90 ${(xMass2 - 2).toFixed(2)} ${((yUK + yOK) / 2).toFixed(2)})">${meterText(geo.hoehe)}</text>`;

  // Geländelinie
  svg += `<line x1="${(x0 - 6).toFixed(2)}" y1="${yUK.toFixed(2)}" x2="${(x0 + W + 6).toFixed(2)}" y2="${yUK.toFixed(2)}" class="gelaende"/>`;

  // Schichtaufbau rechts
  const xInfo = BLATT.breite - BLATT.randRechts - 84;
  let yInfo = BLATT.randOben + 8;
  svg += `<text x="${xInfo}" y="${yInfo}" class="t-kopf">Aufbau (außen → innen)</text>`;
  yInfo += 5;
  auswertung.schichten.forEach((schicht) => {
    svg += `<text x="${xInfo}" y="${yInfo}" class="t-klein">${(schicht.d * 1000).toFixed(0)} mm  ${schicht.name}</text>`;
    yInfo += 4;
  });
  yInfo += 2;
  svg += `<text x="${xInfo}" y="${yInfo}" class="t-klein">Gesamtdicke ${(geo.dicke * 1000).toFixed(0)} mm</text>`;
  yInfo += 4;
  if (auswertung.uWert !== null) {
    svg += `<text x="${xInfo}" y="${yInfo}" class="t-klein">U Bauteil ${auswertung.uWert.toFixed(3)} W/(m²·K)</text>`;
    yInfo += 4;
    svg += `<text x="${xInfo}" y="${yInfo}" class="t-klein">U mittel ${auswertung.uMittel.toFixed(3)} W/(m²·K)</text>`;
    yInfo += 4;
  }
  svg += `<text x="${xInfo}" y="${yInfo}" class="t-klein">Fläche brutto ${auswertung.flaecheBrutto.toFixed(2)} m²</text>`;
  yInfo += 4;
  svg += `<text x="${xInfo}" y="${yInfo}" class="t-klein">Öffnungen ${auswertung.oeffnungsFlaeche.toFixed(2)} m²</text>`;
  yInfo += 4;
  svg += `<text x="${xInfo}" y="${yInfo}" class="t-klein">Fläche netto ${auswertung.flaecheGesamt.toFixed(2)} m²</text>`;

  // Schriftfeld unten rechts
  const sfB = 104, sfH = 30;
  const sfX = BLATT.breite - BLATT.randRechts - sfB;
  const sfY = BLATT.hoehe - BLATT.randUnten - sfH;
  svg += `<rect x="${sfX}" y="${sfY}" width="${sfB}" height="${sfH}" class="schriftfeld"/>`;
  svg += `<line x1="${sfX}" y1="${sfY + 9}" x2="${sfX + sfB}" y2="${sfY + 9}" class="schriftfeld"/>`;
  svg += `<line x1="${sfX}" y1="${sfY + 19}" x2="${sfX + sfB}" y2="${sfY + 19}" class="schriftfeld"/>`;
  svg += `<line x1="${sfX + 62}" y1="${sfY + 19}" x2="${sfX + 62}" y2="${sfY + sfH}" class="schriftfeld"/>`;

  svg += `<text x="${sfX + 3}" y="${sfY + 6}" class="t-firma">HSD Hamburg GmbH</text>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 15}" class="t-klein">${projekt.name || "Projekt"} · ${bezeichnung} · ${auswertung.typName}</text>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 25}" class="t-klein">Bearbeiter: ${projekt.bearbeiter}</text>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 28.5}" class="t-klein">Datum: ${projekt.datum}</text>`;
  svg += `<text x="${sfX + 65}" y="${sfY + 25}" class="t-massstab">M 1:${nenner}</text>`;
  svg += `<text x="${sfX + 65}" y="${sfY + 28.5}" class="t-klein">Ansicht Wand</text>`;

  svg += `<text x="${BLATT.randLinks}" y="${BLATT.hoehe - 4}" class="t-hinweis">Vorbemessung – keine prüffähige Ausführungsplanung. Maße in Metern, Rohbaumaße ohne Toleranzen nach DIN 18202.</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BLATT.breite} ${BLATT.hoehe}" width="100%" style="background:#fff">
<style>
  .bauteil { fill: #f0ece5; stroke: #1b2733; stroke-width: 0.6; }
  .fenster { fill: #dceaf5; stroke: #1b2733; stroke-width: 0.35; }
  .tuer { fill: #e8ddcd; stroke: #1b2733; stroke-width: 0.35; }
  .oeffnung-kreuz { stroke: #8a97a3; stroke-width: 0.18; }
  .ml, .mhl, .mb { stroke: #1b2733; }
  .ml { stroke-width: 0.25; }
  .mhl { stroke-width: 0.13; }
  .mb { stroke-width: 0.35; }
  .gelaende { stroke: #1b2733; stroke-width: 0.7; }
  .schriftfeld { fill: none; stroke: #1b2733; stroke-width: 0.35; }
  text { font-family: "IBM Plex Sans", Arial, sans-serif; fill: #1b2733; }
  .t-mass { font-size: 2.5px; text-anchor: middle; }
  .t-mass-v { font-size: 2.5px; text-anchor: middle; }
  .t-mass-gross { font-size: 3.2px; text-anchor: middle; font-weight: 600; }
  .t-oeffnung { font-size: 3px; text-anchor: middle; font-weight: 600; }
  .t-kopf { font-size: 3.2px; font-weight: 600; }
  .t-klein { font-size: 2.6px; }
  .t-firma { font-size: 4.5px; font-weight: 700; }
  .t-massstab { font-size: 4px; font-weight: 600; }
  .t-hinweis { font-size: 2.2px; fill: #64707c; }
</style>
${svg}
</svg>`;
}
