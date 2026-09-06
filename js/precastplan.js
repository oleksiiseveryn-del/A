/**
 * Fertigteilblatt: Ansicht, Querschnitt und die Angaben, die das Werk,
 * die Spedition und die Montage brauchen – auf einem Blatt A4 quer.
 *
 * Links die Zeichnung mit Maßen und Transportankern, rechts die Daten:
 * Volumen, Gewicht, Bewehrung, Last je Anker, Transportmaße und die
 * Meldungen der Prüfung gegen die Grenzmaße der StVO.
 *
 * Die Zeichnung ist eine Elementskizze, keine Werkzeichnung: Bewehrung,
 * Einbauteile, Aussparungen, Oberflächen, Toleranzen nach DIN 18203-1 und
 * die Kennzeichnung nach DIN EN 13369 fehlen.
 */

/** Fertigteilblatt zeichnen. */
function fertigteilblattSVG(daten) {
  const { teil, massen, anschlagen, transport, projekt } = daten;
  const zahl = (w, s) => Number(w).toFixed(s === undefined ? 2 : s).replace(".", ",");

  const feldX = BLATT.randLinks;
  const feldY = BLATT.randOben + 8;
  const feldB = 168;
  const feldH = 74;

  let svg = `<rect x="0" y="0" width="${BLATT.breite}" height="${BLATT.hoehe}" fill="#ffffff"/>`;
  svg += `<rect x="${BLATT.randLinks - 5}" y="${BLATT.randOben - 6}" `
    + `width="${BLATT.breite - BLATT.randLinks - BLATT.randRechts + 8}" `
    + `height="${BLATT.hoehe - BLATT.randOben - BLATT.randUnten + 8}" class="rahmen"/>`;
  svg += `<text x="${BLATT.randLinks}" y="${BLATT.randOben}" class="t-kopf">`
    + `Fertigteil ${teil.bezeichnung} – ${massen.name}`
    + `${massen.stueck > 1 ? ` · ${massen.stueck} Stück` : ""}</text>`;
  svg += `<text x="${BLATT.breite - BLATT.randRechts}" y="${BLATT.randOben}" class="t-kopf-rechts">`
    + `${projekt.name || "Projekt"}</text>`;

  // ---- Maßstab für die Ansicht
  const a = massen.ansicht;
  const nenner = Math.max(
    Math.ceil((a.l * 1000) / (feldB - 30) / 5) * 5,
    Math.ceil((a.h * 1000) / (feldH - 24) / 5) * 5, 5);
  const m = (wert) => (wert * 1000) / nenner;
  const x0 = feldX + 14;
  const y0 = feldY + 10 + m(a.h);

  svg += `<text x="${feldX}" y="${feldY + 3}" class="t-th">Ansicht</text>`;
  svg += fertigteilAnsicht(a, massen, x0, y0, m, zahl);

  // Maßketten
  svg += massketteWaagerecht([x0, x0 + m(a.l)], y0 + 10, y0, "");
  svg += `<text x="${(x0 + m(a.l) / 2).toFixed(2)}" y="${(y0 + 8.8).toFixed(2)}" class="t-mass">${zahl(a.l)}</text>`;
  svg += massketteLotrecht([y0 - m(a.h), y0], x0 - 8, x0);
  svg += `<text x="${(x0 - 10).toFixed(2)}" y="${(y0 - m(a.h) / 2).toFixed(2)}" class="t-mass" `
    + `text-anchor="middle" transform="rotate(-90 ${(x0 - 10).toFixed(2)} ${(y0 - m(a.h) / 2).toFixed(2)})">`
    + `${zahl(a.h)}</text>`;

  // ---- Querschnitt
  const qy = feldY + feldH + 34;
  svg += `<text x="${feldX}" y="${(qy - 22).toFixed(2)}" class="t-th">Querschnitt</text>`;
  svg += fertigteilQuerschnitt(massen, feldX + 20, qy, zahl);

  // ---- Datenspalte
  const tx = feldX + feldB + 6;
  let ty = feldY + 2;
  const zeile = (text, fett) => {
    svg += `<text x="${tx}" y="${ty}" class="${fett ? "t-th" : "t-mini"}">${text}</text>`;
    ty += fett ? 4.6 : 3.4;
  };

  zeile("Massen", true);
  zeile(`Volumen je Stück ${zahl(massen.volumenTransport, 3)} m³`);
  if (massen.ortbeton > 1e-6) {
    zeile(`Ortbetonergänzung ${zahl(massen.ortbeton, 3)} m³`);
    zeile(`Volumen im Endzustand ${zahl(massen.volumenEnde, 3)} m³`);
  }
  zeile(`Gewicht je Stück ${zahl(massen.masseTransport / 1000, 3)} t`);
  if (massen.stueck > 1) {
    zeile(`${massen.stueck} Stück: ${zahl(massen.volumenTransportGesamt, 2)} m³ · `
      + `${zahl(massen.masseTransportGesamt / 1000, 2)} t`);
  }
  zeile(`Bewehrung ${zahl(massen.bewehrung, 1)} kg je Stück`);
  ty += 2;

  zeile("Transportanker", true);
  zeile(`${anschlagen.ankerZahl} Anker, Neigung ${zahl(anschlagen.winkel, 0)}°`);
  zeile(`ψ_dyn = ${zahl(anschlagen.psiDyn, 2)} · ψ_haft = ${zahl(anschlagen.psiHaft, 2)}`);
  zeile(`Last je Anker ${zahl(anschlagen.jeAnker, 1)} kN`);
  if (anschlagen.ankerZahl > 2) {
    zeile(`wenn nur zwei tragen ${zahl(anschlagen.zweiAnker, 1)} kN`);
  }
  zeile("zulässige Last nach Zulassung des Systems");
  ty += 2;

  zeile("Transport", true);
  zeile(`${transport.stehend ? "stehend im Innenlader" : "liegend auf der Ladefläche"}`);
  zeile(`L ${zahl(transport.ladeLaenge)} · B ${zahl(transport.ladeBreite)} · `
    + `H ${zahl(transport.ladeHoehe)} m · ${zahl(transport.tonnen, 2)} t`);
  transport.meldungen.forEach((x) => {
    const teile2 = x.text.match(/.{1,44}(\s|$)/g) || [x.text];
    teile2.forEach((t2, i) => {
      svg += `<text x="${tx}" y="${ty}" class="t-mini" fill="#b3392c">${i === 0 ? "! " : "  "}${t2.trim()}</text>`;
      ty += 3.2;
    });
  });
  if (!transport.meldungen.length) zeile("keine Beanstandung gegen die Grenzmaße");
  ty += 2;

  if (massen.hinweise.length) {
    zeile("Hinweise", true);
    massen.hinweise.forEach((h) => {
      const teile2 = h.match(/.{1,46}(\s|$)/g) || [h];
      teile2.forEach((t2) => { zeile(t2.trim()); });
    });
  }

  // ---- Schriftfeld
  const sfB = 104, sfH = 30;
  const sfX = BLATT.breite - BLATT.randRechts - sfB;
  const sfY = BLATT.hoehe - BLATT.randUnten - sfH;
  svg += `<rect x="${sfX}" y="${sfY}" width="${sfB}" height="${sfH}" class="schriftfeld"/>`;
  svg += `<line x1="${sfX}" y1="${sfY + 9}" x2="${sfX + sfB}" y2="${sfY + 9}" class="schriftfeld"/>`;
  svg += `<line x1="${sfX}" y1="${sfY + 19}" x2="${sfX + sfB}" y2="${sfY + 19}" class="schriftfeld"/>`;
  svg += `<line x1="${sfX + 62}" y1="${sfY + 19}" x2="${sfX + 62}" y2="${sfY + sfH}" class="schriftfeld"/>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 6}" class="t-firma">HSD Hamburg GmbH</text>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 15}" class="t-klein">Fertigteil ${teil.bezeichnung} · `
    + `${massen.stueck} Stück · ${zahl(massen.masseTransport / 1000, 2)} t je Stück</text>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 25}" class="t-klein">Bearbeiter: ${projekt.bearbeiter || ""}</text>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 28.5}" class="t-klein">Datum: ${projekt.datum || ""}</text>`;
  svg += `<text x="${sfX + 65}" y="${sfY + 25}" class="t-massstab">M 1:${nenner}</text>`;
  svg += `<text x="${sfX + 65}" y="${sfY + 28.5}" class="t-klein">Fertigteilblatt</text>`;

  svg += `<text x="${BLATT.randLinks}" y="${BLATT.hoehe - 4}" class="t-hinweis">`
    + "Elementskizze, keine Werkzeichnung. Nicht enthalten: Bemessung (Biegung, Querkraft, Kippen, "
    + "Vorspannung nach DIN EN 1992-1-1), Nachweis der Transportanker und der Bewehrung im Anschlagbereich, "
    + "Fugen und Verbindungen, Zwischenlagerung, Toleranzen nach DIN 18203-1.</text>";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BLATT.breite} ${BLATT.hoehe}" width="100%" style="background:#fff">
<style>
  .rahmen { fill: none; stroke: #1b2733; stroke-width: 0.5; }
  .schriftfeld { fill: none; stroke: #1b2733; stroke-width: 0.35; }
  .beton { fill: #dde3e8; stroke: #1b2733; stroke-width: 0.5; }
  .beton2 { fill: #cad3da; stroke: #1b2733; stroke-width: 0.4; }
  .hohl { fill: #ffffff; stroke: #1b2733; stroke-width: 0.3; }
  .daemm { fill: #f2e6a8; stroke: #1b2733; stroke-width: 0.3; }
  .ortbeton { fill: #eef2f5; stroke: #64707c; stroke-width: 0.3; stroke-dasharray: 2 1.2; }
  .anker { stroke: #b3392c; stroke-width: 0.5; fill: none; }
  .ankerkopf { fill: #b3392c; }
  .ml, .mhl, .mb { stroke: #1b2733; }
  .ml { stroke-width: 0.25; }
  .mhl { stroke-width: 0.13; }
  .mb { stroke-width: 0.35; }
  text { font-family: "IBM Plex Sans", Arial, sans-serif; fill: #1b2733; }
  .t-kopf { font-size: 3.4px; font-weight: 700; }
  .t-kopf-rechts { font-size: 3.4px; font-weight: 600; text-anchor: end; }
  .t-th { font-size: 2.6px; font-weight: 700; }
  .t-mini { font-size: 2.3px; }
  .t-mass { font-size: 2.4px; text-anchor: middle; }
  .t-klein { font-size: 2.4px; }
  .t-firma { font-size: 4.5px; font-weight: 700; }
  .t-massstab { font-size: 4px; font-weight: 600; }
  .t-hinweis { font-size: 2.2px; fill: #64707c; }
  .t-anker { font-size: 2.2px; fill: #b3392c; text-anchor: middle; }
</style>
${svg}
</svg>`;
}

/** Ansicht des Fertigteils mit Transportankern. */
function fertigteilAnsicht(a, massen, x0, y0, m, zahl) {
  let svg = "";
  if (a.form === "sattel") {
    // Satteldachbinder: von den Auflagern zur Mitte ansteigend
    const p = [
      [x0, y0], [x0 + m(a.l), y0],
      [x0 + m(a.l), y0 - m(a.h)], [x0 + m(a.l) / 2, y0 - m(a.hFirst)], [x0, y0 - m(a.h)],
    ];
    svg += `<polygon points="${p.map((q) => `${q[0].toFixed(2)},${q[1].toFixed(2)}`).join(" ")}" class="beton"/>`;
  } else if (a.form === "treppe") {
    const p = [[x0, y0]];
    for (let i = 0; i < a.steigungen; i++) {
      p.push([x0 + m(i * a.auftritt), y0 - m((i + 1) * a.steigung)]);
      p.push([x0 + m((i + 1) * a.auftritt), y0 - m((i + 1) * a.steigung)]);
    }
    p.push([x0 + m(a.l), y0 - m(a.h)]);
    // Unterseite: um die Laufplattendicke lotrecht versetzt
    const versatz = m(a.dicke) * Math.hypot(a.l, a.h) / a.l;
    p.push([x0 + m(a.l), y0 - m(a.h) + versatz], [x0, y0 + versatz]);
    svg += `<polygon points="${p.map((q) => `${q[0].toFixed(2)},${q[1].toFixed(2)}`).join(" ")}" class="beton"/>`;
  } else if (a.form === "koecher") {
    svg += `<rect x="${x0}" y="${(y0 - m(a.h)).toFixed(2)}" width="${m(a.l).toFixed(2)}" `
      + `height="${m(a.h).toFixed(2)}" class="beton"/>`;
    svg += `<rect x="${(x0 + m(a.l) / 2 - m(a.kl) / 2).toFixed(2)}" y="${(y0 - m(a.h)).toFixed(2)}" `
      + `width="${m(a.kl).toFixed(2)}" height="${m(a.kt).toFixed(2)}" class="hohl"/>`;
  } else {
    svg += `<rect x="${x0}" y="${(y0 - m(a.h)).toFixed(2)}" width="${m(a.l).toFixed(2)}" `
      + `height="${m(a.h).toFixed(2)}" class="beton"/>`;
  }

  // Transportanker: bei langen Teilen im Viertelspunkt, sonst an den Enden
  const anzahl = massen.laenge > 6 ? 2 : 2;
  const stellen = anzahl === 2 ? [0.2, 0.8] : [0.5];
  stellen.forEach((s) => {
    const x = x0 + m(a.l) * s;
    const y = y0 - m(a.h);
    svg += `<circle cx="${x.toFixed(2)}" cy="${(y + 1).toFixed(2)}" r="0.9" class="ankerkopf"/>`;
    svg += `<line x1="${x.toFixed(2)}" y1="${(y + 1).toFixed(2)}" x2="${(x0 + m(a.l) / 2).toFixed(2)}" `
      + `y2="${(y - 12).toFixed(2)}" class="anker"/>`;
  });
  svg += `<text x="${(x0 + m(a.l) / 2).toFixed(2)}" y="${(y0 - m(a.h) - 13.5).toFixed(2)}" class="t-anker">`
    + `Transportanker</text>`;
  return svg;
}

/** Querschnitt mit den Hohlräumen und Schichten. */
function fertigteilQuerschnitt(massen, x0, y0, zahl) {
  const a = massen.querschnitt || { form: "rechteck", b: massen.breite, h: massen.hoehe };
  // eigener, größerer Maßstab für den Querschnitt
  const breite = a.b;
  const nenner = Math.max(Math.ceil((breite * 1000) / 70 / 5) * 5, 5);
  const m = (w) => (w * 1000) / nenner;
  let svg = "";

  if (a.form === "hohlplatte") {
    svg += `<rect x="${x0}" y="${(y0 - m(a.h)).toFixed(2)}" width="${m(a.b).toFixed(2)}" `
      + `height="${m(a.h).toFixed(2)}" class="beton"/>`;
    const abstand = a.b / a.kerne;
    for (let i = 0; i < a.kerne; i++) {
      svg += `<circle cx="${(x0 + m(abstand * (i + 0.5))).toFixed(2)}" cy="${(y0 - m(a.h) / 2).toFixed(2)}" `
        + `r="${(m(a.d) / 2).toFixed(2)}" class="hohl"/>`;
    }
    svg += `<text x="${(x0 + m(a.b) / 2).toFixed(2)}" y="${(y0 + 4).toFixed(2)}" class="t-mass">`
      + `${zahl(a.b)} × ${zahl(a.h)} m · ${a.kerne} Kerne Ø ${zahl(a.d * 100, 1)} cm · M 1:${nenner}</text>`;
  } else if (a.form === "tt") {
    const p = [
      [x0, y0 - m(a.h)], [x0 + m(a.b), y0 - m(a.h)],
      [x0 + m(a.b), y0 - m(a.h) + m(a.platte)],
      [x0 + m(a.b) * 0.75 + m(a.rippeOben) / 2, y0 - m(a.h) + m(a.platte)],
      [x0 + m(a.b) * 0.75 + m(a.rippeUnten) / 2, y0],
      [x0 + m(a.b) * 0.75 - m(a.rippeUnten) / 2, y0],
      [x0 + m(a.b) * 0.75 - m(a.rippeOben) / 2, y0 - m(a.h) + m(a.platte)],
      [x0 + m(a.b) * 0.25 + m(a.rippeOben) / 2, y0 - m(a.h) + m(a.platte)],
      [x0 + m(a.b) * 0.25 + m(a.rippeUnten) / 2, y0],
      [x0 + m(a.b) * 0.25 - m(a.rippeUnten) / 2, y0],
      [x0 + m(a.b) * 0.25 - m(a.rippeOben) / 2, y0 - m(a.h) + m(a.platte)],
      [x0, y0 - m(a.h) + m(a.platte)],
    ];
    svg += `<polygon points="${p.map((q) => `${q[0].toFixed(2)},${q[1].toFixed(2)}`).join(" ")}" class="beton"/>`;
    svg += `<text x="${(x0 + m(a.b) / 2).toFixed(2)}" y="${(y0 + 4).toFixed(2)}" class="t-mass">`
      + `Platte ${zahl(a.platte * 100, 0)} cm, Rippen ${zahl(a.rippeOben * 100, 0)}/${zahl(a.rippeUnten * 100, 0)} cm · M 1:${nenner}</text>`;
  } else if (a.form === "doppelwand") {
    const b = m(a.dicke), s = m(a.schale), h = 30;
    svg += `<rect x="${x0}" y="${(y0 - h).toFixed(2)}" width="${b.toFixed(2)}" height="${h}" class="ortbeton"/>`;
    svg += `<rect x="${x0}" y="${(y0 - h).toFixed(2)}" width="${s.toFixed(2)}" height="${h}" class="beton"/>`;
    svg += `<rect x="${(x0 + b - s).toFixed(2)}" y="${(y0 - h).toFixed(2)}" width="${s.toFixed(2)}" height="${h}" class="beton"/>`;
    svg += `<text x="${(x0 + b / 2).toFixed(2)}" y="${(y0 + 4).toFixed(2)}" class="t-mass">`
      + `2 × ${zahl(a.schale * 100, 0)} cm Schale + Ortbetonkern · M 1:${nenner}</text>`;
  } else if (a.form === "sandwich") {
    const t = m(a.tragschale), d = m(a.daemmung), v = m(a.vorsatzschale), h = 30;
    svg += `<rect x="${x0}" y="${(y0 - h).toFixed(2)}" width="${t.toFixed(2)}" height="${h}" class="beton"/>`;
    svg += `<rect x="${(x0 + t).toFixed(2)}" y="${(y0 - h).toFixed(2)}" width="${d.toFixed(2)}" height="${h}" class="daemm"/>`;
    svg += `<rect x="${(x0 + t + d).toFixed(2)}" y="${(y0 - h).toFixed(2)}" width="${v.toFixed(2)}" height="${h}" class="beton2"/>`;
    svg += `<text x="${(x0 + (t + d + v) / 2).toFixed(2)}" y="${(y0 + 4).toFixed(2)}" class="t-mass">`
      + `Trag ${zahl(a.tragschale * 100, 0)} / Dämmung ${zahl(a.daemmung * 100, 0)} / `
      + `Vorsatz ${zahl(a.vorsatzschale * 100, 0)} cm · M 1:${nenner}</text>`;
  } else if (a.form === "schicht") {
    svg += `<rect x="${x0}" y="${(y0 - m(a.h)).toFixed(2)}" width="${m(a.b).toFixed(2)}" `
      + `height="${m(a.h).toFixed(2)}" class="ortbeton"/>`;
    svg += `<rect x="${x0}" y="${(y0 - m(a.fertig)).toFixed(2)}" width="${m(a.b).toFixed(2)}" `
      + `height="${m(a.fertig).toFixed(2)}" class="beton"/>`;
    svg += `<text x="${(x0 + m(a.b) / 2).toFixed(2)}" y="${(y0 + 4).toFixed(2)}" class="t-mass">`
      + `Fertigplatte ${zahl(a.fertig * 100, 0)} cm + Ortbeton auf ${zahl(a.h * 100, 0)} cm · M 1:${nenner}</text>`;
  } else if (a.form === "koecher") {
    svg += `<rect x="${x0}" y="${(y0 - m(a.h)).toFixed(2)}" width="${m(a.b).toFixed(2)}" `
      + `height="${m(a.h).toFixed(2)}" class="beton"/>`;
    svg += `<rect x="${(x0 + m(a.b) / 2 - m(a.kl) / 2).toFixed(2)}" y="${(y0 - m(a.h)).toFixed(2)}" `
      + `width="${m(a.kl).toFixed(2)}" height="${m(a.kt).toFixed(2)}" class="hohl"/>`;
    svg += `<text x="${(x0 + m(a.b) / 2).toFixed(2)}" y="${(y0 + 4).toFixed(2)}" class="t-mass">`
      + `${zahl(a.b)} × ${zahl(a.h)} m, Köcher ${zahl(a.kl)} × ${zahl(a.kt)} m · M 1:${nenner}</text>`;
  } else {
    const b = m(a.b), h = m(Math.min(a.h, 1.5));
    svg += `<rect x="${x0}" y="${(y0 - h).toFixed(2)}" width="${b.toFixed(2)}" height="${h.toFixed(2)}" class="beton"/>`;
    svg += `<text x="${(x0 + b / 2).toFixed(2)}" y="${(y0 + 4).toFixed(2)}" class="t-mass">`
      + `${zahl(a.b)} × ${zahl(Math.min(a.h, 1.5))} m · M 1:${nenner}</text>`;
  }
  return svg;
}
