/**
 * Fassadenblätter: Ansicht, Horizontal- und Vertikalschnitt sowie das
 * Nachweisprotokoll – jeweils als SVG im Blattformat A4 quer.
 *
 * Die Ansicht zeigt das Raster mit Pfosten, Riegeln und Feldern; jedes
 * Feld trägt seine Kennung und ist nach Füllung eingefärbt. Nicht
 * nachgewiesene Felder sind gekennzeichnet – der Plan zeigt damit
 * dasselbe wie die Tabelle und nicht etwas anderes.
 *
 * Die Schnitte sind Regeldetails im Maßstab 1:2: der Horizontalschnitt
 * durch den Pfosten mit Glasfalz, Dichtung und Andruckleiste, der
 * Vertikalschnitt durch den Riegel mit Verglasungsklotz und
 * Entwässerungsebene. Sie zeigen den Aufbau, nicht das Profil eines
 * bestimmten Herstellers – maßgebend bleibt die Systemunterlage.
 *
 * Maßeintragung in Anlehnung an DIN 406-11, Linienbreiten nach
 * DIN ISO 128. Alle Blattmaße in Millimetern.
 */

/** Farben und Linien der Fassadenblätter. */
const FAS_STIL = `
  .f-glas { fill: #cfe3ec; stroke: #1f6b8f; stroke-width: 0.25; }
  .f-glas-fehler { fill: #f0d4d0; stroke: #b3392c; stroke-width: 0.4; }
  .f-paneel { fill: #ddd8cc; stroke: #7d7565; stroke-width: 0.25; }
  .f-oeffnung { fill: none; stroke: #1f6b8f; stroke-width: 0.3; stroke-dasharray: 2 1; }
  .f-pfosten { fill: #9aa7b1; stroke: #1b2733; stroke-width: 0.3; }
  .f-riegel { fill: #b4bec6; stroke: #1b2733; stroke-width: 0.3; }
  .f-decke { fill: #cfd8de; stroke: #1b2733; stroke-width: 0.4; }
  .f-alu { fill: #b4bec6; stroke: #1b2733; stroke-width: 0.35; }
  .f-alu-hell { fill: #d5dce1; stroke: #1b2733; stroke-width: 0.3; }
  .f-daemm { fill: #e8e3d2; stroke: #8a7a4f; stroke-width: 0.25; }
  .f-dichtung { fill: #4a4a4a; stroke: none; }
  .f-scheibe { fill: #cfe3ec; stroke: #1f6b8f; stroke-width: 0.3; }
  .f-szr { fill: #f2f7fa; stroke: #9ab4c2; stroke-width: 0.2; }
  .f-klotz { fill: #6f7b85; stroke: #1b2733; stroke-width: 0.2; }
  .f-mass { stroke: #1b2733; stroke-width: 0.18; fill: none; }
  .f-hilfs { stroke: #8a949c; stroke-width: 0.15; stroke-dasharray: 2 1.5; fill: none; }
  .f-schnitt { stroke: #b3392c; stroke-width: 0.45; fill: none; stroke-dasharray: 6 2 1.5 2; }
  .t-feld { font-size: 2.1px; text-anchor: middle; fill: #1b2733;
            paint-order: stroke; stroke: #ffffff; stroke-width: 0.7; stroke-linejoin: round; }
  .t-feld-klein { font-size: 1.7px; text-anchor: middle; fill: #4a5560;
            paint-order: stroke; stroke: #ffffff; stroke-width: 0.7; stroke-linejoin: round; }
  .t-achse { font-size: 2.2px; text-anchor: middle; font-weight: 700; fill: #b3392c; }
  .t-geschoss { font-size: 2.0px; text-anchor: end; fill: #1b2733; }
  .t-detail { font-size: 1.9px; fill: #1b2733; }
  .t-detail-fett { font-size: 2.2px; font-weight: 700; fill: #1b2733; }
  .t-nachweis { font-size: 2.0px; fill: #1b2733; }
  .t-nachweis-kopf { font-size: 2.0px; font-weight: 700; fill: #1b2733; }
  .t-rot { fill: #b3392c; }
`;

/** Geläufige Maßstäbe für Fassadenansichten (DIN ISO 5455 und Zwischenwerte). */
const FAS_MASSSTAEBE = [20, 25, 50, 75, 100, 125, 150, 200, 250, 500, 1000];

/** Zahl mit Dezimalkomma. */
function fasPlanZahl(wert, stellen) {
  if (!Number.isFinite(wert)) return "–";
  return Number(wert).toFixed(stellen === undefined ? 2 : stellen).replace(".", ",");
}

/** Waagerechte Maßkette mit Begrenzungsschrägen nach DIN 406-11. */
function fasMassKette(x0, y, teile, skala, unten) {
  let svg = "", x = x0;
  const h = 1.2;
  svg += `<line x1="${x0.toFixed(2)}" y1="${y.toFixed(2)}" `
    + `x2="${(x0 + teile.reduce((s, t) => s + t, 0) * skala).toFixed(2)}" y2="${y.toFixed(2)}" class="f-mass"/>`;
  teile.forEach((t) => {
    const b = t * skala;
    [x, x + b].forEach((xx) => {
      svg += `<line x1="${(xx - h / 2).toFixed(2)}" y1="${(y + h / 2).toFixed(2)}" `
        + `x2="${(xx + h / 2).toFixed(2)}" y2="${(y - h / 2).toFixed(2)}" class="f-mass"/>`;
    });
    if (b > 5) {
      svg += `<text x="${(x + b / 2).toFixed(2)}" y="${(y + (unten ? 3 : -1.2)).toFixed(2)}" `
        + `class="t-feld-klein">${fasPlanZahl(t)}</text>`;
    }
    x += b;
  });
  return svg;
}

/**
 * Fassadenansicht mit Raster, Feldern und Bemaßung.
 *
 * @param {Object} e - Ergebnis von fassadeAuswerten
 */
function fassadeAnsichtSVG(e, feldX, feldY, feldB, feldH) {
  const r = e.raster;
  const rand = 12;                                     // Platz für Maßketten
  /* Gezeichnet wird in einem geläufigen Maßstab, nicht in einem
     krummen Wert, der das Feld gerade ausfüllt – der Maßstab steht im
     Schriftfeld und muss am Plan abgreifbar sein. */
  const passt = Math.min((feldB - 2 * rand) / r.breite, (feldH - 2 * rand) / r.hoehe);
  const nenner = FAS_MASSSTAEBE.find((n) => 1000 / n <= passt)
    || FAS_MASSSTAEBE[FAS_MASSSTAEBE.length - 1];
  const skala = 1000 / nenner;
  const x0 = feldX + rand + ((feldB - 2 * rand) - r.breite * skala) / 2;
  const y0 = feldY + rand;
  const px = (x) => x0 + x * skala;
  const py = (y) => y0 + (r.hoehe - y) * skala;         // y von unten nach oben

  let svg = "";

  // Geschossdecken als Hintergrund
  let hy = 0;
  r.geschosse.forEach((h) => {
    svg += `<line x1="${(px(0) - 6).toFixed(2)}" y1="${py(hy).toFixed(2)}" `
      + `x2="${(px(r.breite) + 3).toFixed(2)}" y2="${py(hy).toFixed(2)}" class="f-hilfs"/>`;
    hy += h;
  });

  // Felder
  e.felder.forEach((f) => {
    const klasse = f.fuellung === "glas"
      ? (f.erfuellt ? "f-glas" : "f-glas-fehler") : "f-paneel";
    svg += `<rect x="${px(f.x).toFixed(2)}" y="${py(f.y + f.hoehe).toFixed(2)}" `
      + `width="${(f.breite * skala).toFixed(2)}" height="${(f.hoehe * skala).toFixed(2)}" `
      + `class="${klasse}"/>`;
    if (f.breite * skala > 9 && f.hoehe * skala > 7) {
      const mx = px(f.x + f.breite / 2), my = py(f.y + f.hoehe / 2);
      svg += `<text x="${mx.toFixed(2)}" y="${(my - 0.4).toFixed(2)}" class="t-feld">${f.name}</text>`;
      svg += `<text x="${mx.toFixed(2)}" y="${(my + 2.4).toFixed(2)}" class="t-feld-klein">`
        + `${fasPlanZahl(f.breite)} × ${fasPlanZahl(f.hoehe)}</text>`;
      if (!f.erfuellt && f.nachweis) {
        svg += `<text x="${mx.toFixed(2)}" y="${(my + 4.6).toFixed(2)}" `
          + `class="t-feld-klein t-rot">η = ${fasPlanZahl(f.nachweis.eta * 100, 0)} %</text>`;
      }
    }
  });

  // Pfosten und Riegel als schmale Balken über den Feldern
  const bP = (e.raster.pfosten[0] ? 50 : 50) / 1000 * skala;
  let ax = 0;
  for (let i = 0; i <= r.felder.length; i++) {
    svg += `<rect x="${(px(ax) - bP / 2).toFixed(2)}" y="${py(r.hoehe).toFixed(2)}" `
      + `width="${bP.toFixed(2)}" height="${(r.hoehe * skala).toFixed(2)}" class="f-pfosten"/>`;
    svg += `<text x="${px(ax).toFixed(2)}" y="${(y0 - 7).toFixed(2)}" class="t-achse">`
      + `${String.fromCharCode(65 + i)}</text>`;
    if (i < r.felder.length) ax += r.felder[i];
  }
  r.riegel.forEach((rg) => {
    svg += `<rect x="${px(rg.x).toFixed(2)}" y="${(py(rg.y) - bP / 2).toFixed(2)}" `
      + `width="${(rg.laenge * skala).toFixed(2)}" height="${bP.toFixed(2)}" class="f-riegel"/>`;
  });

  /* Schnittlinien für die Details: A waagerecht durch ein Sichtfeld –
     der Schnitt zeigt den Pfosten; B senkrecht durch die Feldmitte –
     dort wird der Riegel geschnitten, nicht der Pfosten. */
  const sy = py(r.hoehe * 0.62);
  svg += `<line x1="${(px(0) - 4).toFixed(2)}" y1="${sy.toFixed(2)}" `
    + `x2="${(px(r.breite) + 4).toFixed(2)}" y2="${sy.toFixed(2)}" class="f-schnitt"/>`;
  svg += `<text x="${(px(r.breite) + 5.5).toFixed(2)}" y="${(sy + 0.8).toFixed(2)}" `
    + `class="t-detail-fett">A</text>`;
  // in die Mitte des mittleren Feldes, damit die Linie nicht auf die
  // Achsbeschriftung des Randpfostens fällt
  const mitteFeld = Math.floor(r.felder.length / 2);
  const sx = px(r.felder.slice(0, mitteFeld).reduce((s2, w) => s2 + w, 0)
    + (r.felder[mitteFeld] || 1) / 2);
  svg += `<line x1="${sx.toFixed(2)}" y1="${(py(r.hoehe) - 5).toFixed(2)}" `
    + `x2="${sx.toFixed(2)}" y2="${(py(0) + 2).toFixed(2)}" class="f-schnitt"/>`;
  svg += `<text x="${sx.toFixed(2)}" y="${(py(r.hoehe) - 8.5).toFixed(2)}" class="t-detail-fett" `
    + `text-anchor="middle">B</text>`;

  // Maßketten: Felder unten, Geschosse links
  svg += fasMassKette(px(0), py(0) + 4.5, r.felder, skala, true);
  let gy = 0;
  r.geschosse.forEach((h, i) => {
    svg += `<text x="${(px(0) - 8).toFixed(2)}" y="${(py(gy + h / 2) + 0.8).toFixed(2)}" `
      + `class="t-geschoss">${i + 1}. OG</text>`;
    gy += h;
  });
  svg += `<text x="${(px(0) - 8).toFixed(2)}" y="${(py(0) + 3).toFixed(2)}" class="t-geschoss">±0,00</text>`;
  svg += `<text x="${(px(0) - 8).toFixed(2)}" y="${(py(r.hoehe) - 1).toFixed(2)}" class="t-geschoss">`
    + `+${fasPlanZahl(r.hoehe)}</text>`;

  return { svg, nenner, skala };
}

/**
 * Horizontalschnitt A durch den Pfosten (Regeldetail).
 *
 * Blickrichtung von oben: außen liegt unten, innen oben. Gezeigt wird der
 * Aufbau – Pfostenprofil mit thermischer Trennung, links und rechts der
 * Glasfalz mit dem gewählten Isolierglas, innere und äußere Dichtung,
 * Andruckleiste und aufgeklipste Deckschale.
 *
 * @param {number} mx - Mitte des Pfostens auf dem Blatt [mm]
 * @param {number} y0 - Oberkante (innen) des Details [mm]
 * @param {number} sk - Zeichnungsmaßstab: Blattmaß je Bauteilmillimeter
 */
function fassadeHorizontalschnitt(e, mx, y0, sk) {
  const p = FASSADENPROFILE[e.raster.pfosten[0].profil] || FASSADENPROFILE["PR 50/125"];
  const auf = e.aufbau;
  const m = (v) => v * sk;
  const glasDicke = auf.scheiben.reduce((s, sc) => s + sc.lagen.reduce((t, d) => t + d, 0), 0)
    + (auf.szr || []).reduce((s, z) => s + z, 0);
  const bp = p.ansicht, tp = p.bautiefe;
  const glasB = 62;                                    // gezeigte Glasbreite [mm]
  let svg = "";

  // Grundprofil
  svg += `<rect x="${(mx - m(bp / 2)).toFixed(2)}" y="${y0.toFixed(2)}" `
    + `width="${m(bp).toFixed(2)}" height="${m(tp).toFixed(2)}" class="f-alu"/>`;
  // thermische Trennung
  svg += `<rect x="${(mx - m(bp / 2)).toFixed(2)}" y="${(y0 + m(tp - 30)).toFixed(2)}" `
    + `width="${m(bp).toFixed(2)}" height="${m(10).toFixed(2)}" class="f-daemm"/>`;
  // Andruckleiste und Deckschale außen
  svg += `<rect x="${(mx - m(bp / 2)).toFixed(2)}" y="${(y0 + m(tp)).toFixed(2)}" `
    + `width="${m(bp).toFixed(2)}" height="${m(10).toFixed(2)}" class="f-alu-hell"/>`;
  svg += `<rect x="${(mx - m(bp / 2 + 3)).toFixed(2)}" y="${(y0 + m(tp + 10)).toFixed(2)}" `
    + `width="${m(bp + 6).toFixed(2)}" height="${m(14).toFixed(2)}" class="f-alu"/>`;

  // Verglasung beidseits, Falzgrund an der Profilaußenkante
  const gy = y0 + m(tp - glasDicke);
  [-1, 1].forEach((seite) => {
    const kante = mx + seite * m(bp / 2);
    const x = seite < 0 ? kante - m(glasB) : kante;
    let d = 0;
    auf.scheiben.forEach((sc, i) => {
      const t = sc.lagen.reduce((s, q) => s + q, 0);
      svg += `<rect x="${x.toFixed(2)}" y="${(gy + m(d)).toFixed(2)}" `
        + `width="${m(glasB).toFixed(2)}" height="${m(t).toFixed(2)}" class="f-scheibe"/>`;
      d += t;
      if (i < (auf.szr || []).length) {
        svg += `<rect x="${x.toFixed(2)}" y="${(gy + m(d)).toFixed(2)}" `
          + `width="${m(glasB).toFixed(2)}" height="${m(auf.szr[i]).toFixed(2)}" class="f-szr"/>`;
        d += auf.szr[i];
      }
    });
    // Dichtungen innen und außen am Falz
    const dx = seite < 0 ? kante - m(16) : kante;
    svg += `<rect x="${dx.toFixed(2)}" y="${(gy - m(4)).toFixed(2)}" `
      + `width="${m(16).toFixed(2)}" height="${m(4).toFixed(2)}" class="f-dichtung"/>`;
    svg += `<rect x="${dx.toFixed(2)}" y="${(gy + m(glasDicke)).toFixed(2)}" `
      + `width="${m(16).toFixed(2)}" height="${m(4).toFixed(2)}" class="f-dichtung"/>`;
  });

  const links = mx - m(bp / 2 + glasB);
  const unten = y0 + m(tp + 24);
  // eine Orientierungsangabe genügt: innen ist die Gegenseite
  svg += `<text x="${(mx + m(bp / 2 + 4)).toFixed(2)}" y="${(unten + 2.6).toFixed(2)}" `
    + `class="t-detail">außen</text>`;
  return { svg, links, rechts: mx + m(bp / 2 + glasB), oben: y0, unten: unten + 2.6,
    glasDicke, profil: p };
}

/**
 * Vertikalschnitt B durch den Riegel (Regeldetail).
 *
 * Blick von der Seite: außen liegt rechts, innen links. Der
 * Verglasungsklotz nimmt das Gewicht der oberen Scheibe auf; die
 * Falzentwässerung führt nach außen in die Andruckleiste.
 */
function fassadeVertikalschnitt(e, x0, my, sk) {
  const r = FASSADENPROFILE[e.raster.riegel.length
    ? e.raster.riegel[0].profil : "RI 50/85"] || FASSADENPROFILE["RI 50/85"];
  const auf = e.aufbau;
  const m = (v) => v * sk;
  const glasDicke = auf.scheiben.reduce((s, sc) => s + sc.lagen.reduce((t, d) => t + d, 0), 0)
    + (auf.szr || []).reduce((s, z) => s + z, 0);
  const br = r.ansicht, tr = r.bautiefe;
  const glasH = 58;
  let svg = "";

  svg += `<rect x="${x0.toFixed(2)}" y="${(my - m(br / 2)).toFixed(2)}" `
    + `width="${m(tr).toFixed(2)}" height="${m(br).toFixed(2)}" class="f-alu"/>`;
  svg += `<rect x="${(x0 + m(tr - 30)).toFixed(2)}" y="${(my - m(br / 2)).toFixed(2)}" `
    + `width="${m(10).toFixed(2)}" height="${m(br).toFixed(2)}" class="f-daemm"/>`;
  svg += `<rect x="${(x0 + m(tr)).toFixed(2)}" y="${(my - m(br / 2)).toFixed(2)}" `
    + `width="${m(10).toFixed(2)}" height="${m(br).toFixed(2)}" class="f-alu-hell"/>`;
  svg += `<rect x="${(x0 + m(tr + 10)).toFixed(2)}" y="${(my - m(br / 2 + 3)).toFixed(2)}" `
    + `width="${m(14).toFixed(2)}" height="${m(br + 6).toFixed(2)}" class="f-alu"/>`;

  const gx = x0 + m(tr - glasDicke);
  [-1, 1].forEach((seite) => {
    const kante = my + seite * m(br / 2);
    const y = seite < 0 ? kante - m(glasH) : kante;
    let d = 0;
    auf.scheiben.forEach((sc, i) => {
      const t = sc.lagen.reduce((s, q) => s + q, 0);
      svg += `<rect x="${(gx + m(d)).toFixed(2)}" y="${y.toFixed(2)}" `
        + `width="${m(t).toFixed(2)}" height="${m(glasH).toFixed(2)}" class="f-scheibe"/>`;
      d += t;
      if (i < (auf.szr || []).length) {
        svg += `<rect x="${(gx + m(d)).toFixed(2)}" y="${y.toFixed(2)}" `
          + `width="${m(auf.szr[i]).toFixed(2)}" height="${m(glasH).toFixed(2)}" class="f-szr"/>`;
        d += auf.szr[i];
      }
    });
    const dy = seite < 0 ? kante - m(16) : kante;
    svg += `<rect x="${(gx - m(4)).toFixed(2)}" y="${dy.toFixed(2)}" `
      + `width="${m(4).toFixed(2)}" height="${m(16).toFixed(2)}" class="f-dichtung"/>`;
  });
  // Verglasungsklotz unter der oberen Scheibe
  svg += `<rect x="${gx.toFixed(2)}" y="${(my - m(br / 2 + 6)).toFixed(2)}" `
    + `width="${m(glasDicke).toFixed(2)}" height="${m(6).toFixed(2)}" class="f-klotz"/>`;

  const oben = my - m(br / 2 + glasH);
  svg += `<text x="${(x0 + m(tr + 26)).toFixed(2)}" y="${(my + 0.7).toFixed(2)}" `
    + `class="t-detail">außen</text>`;
  return { svg, links: x0, rechts: x0 + m(tr + 24), oben,
    unten: my + m(br / 2 + glasH), glasDicke, profil: r };
}

/**
 * Fassadenblatt: Ansicht mit Raster, die beiden Regeldetails und die
 * Zusammenstellung der Nachweise.
 */
function fassadenblattSVG(daten) {
  const e = daten.auswertung;
  const projekt = daten.projekt || {};
  let svg = tiefBlattKopf(`Fassade – ${e.art.name}`, projekt);

  /* Blattaufteilung: links die Ansicht, rechts eine Spalte mit den
     beiden Details übereinander und darunter die Nachweise. */
  const feldX = BLATT.randLinks, feldY = BLATT.randOben + 8;
  const feldB = 128, feldH = BLATT.hoehe - feldY - BLATT.randUnten - 8;
  const ans = fassadeAnsichtSVG(e, feldX, feldY, feldB, feldH);
  svg += ans.svg;
  svg += `<text x="${BLATT.randLinks}" y="${(feldY - 2).toFixed(2)}" class="t-bandkopf">`
    + `Ansicht M 1:${Math.round(ans.nenner)} · ${fasPlanZahl(e.mengen.breite)} × `
    + `${fasPlanZahl(e.mengen.hoehe)} m = ${fasPlanZahl(e.mengen.flaeche, 1)} m²</text>`;

  const spalteX = feldX + feldB + 16;                  // linke Kante der rechten Spalte
  const sk = 0.20;                                     // Details M 1:5
  let y = feldY + 4;

  // --- Schnitt A
  svg += `<text x="${spalteX}" y="${y.toFixed(2)}" class="t-detail-fett">`
    + "Schnitt A – Horizontalschnitt Pfosten, M 1:5</text>";
  y += 5;
  const dA = fassadeHorizontalschnitt(e, spalteX + 16, y, sk);
  svg += dA.svg;
  let ty = y + 2;
  [
    ["Pfosten", `${dA.profil.name} · ${e.vorgaben.legierung}`],
    ["Glasfalz", `${fasPlanZahl(dA.glasDicke, 0)} mm · ${e.aufbau.name}`],
    ["Dichtung", "innen und außen, Andruckleiste geschraubt"],
    ["Deckschale", "aufgeklipst, Fuge hinterlüftet und entwässert"],
  ].forEach(([k, t]) => {
    svg += `<text x="${(dA.rechts + 4).toFixed(2)}" y="${ty.toFixed(2)}" class="t-detail-fett">${k}</text>`;
    svg += `<text x="${(dA.rechts + 4).toFixed(2)}" y="${(ty + 2.7).toFixed(2)}" class="t-detail">${t}</text>`;
    ty += 6.2;
  });
  y = Math.max(dA.unten, ty) + 5;

  // --- Schnitt B
  svg += `<text x="${spalteX}" y="${y.toFixed(2)}" class="t-detail-fett">`
    + "Schnitt B – Vertikalschnitt Riegel, M 1:5</text>";
  const dB = fassadeVertikalschnitt(e, spalteX + 4, y + 5 + (58 + 25) * sk, sk);
  svg += dB.svg;
  ty = y + 6;
  [
    ["Riegel", `${dB.profil.name} · ${e.vorgaben.legierung}`],
    ["Verglasungsklotz", "nimmt das Gewicht der oberen Scheibe auf"],
    ["Entwässerung", "Falz nach außen in die Andruckleiste geführt"],
  ].forEach(([k, t]) => {
    svg += `<text x="${(dB.rechts + 8).toFixed(2)}" y="${ty.toFixed(2)}" class="t-detail-fett">${k}</text>`;
    svg += `<text x="${(dB.rechts + 8).toFixed(2)}" y="${(ty + 2.7).toFixed(2)}" class="t-detail">${t}</text>`;
    ty += 6.2;
  });
  y = Math.max(dB.unten, ty) + 6;

  // --- Nachweise
  const grMax = (liste, feld) => Math.max(0, ...liste.map((o) =>
    (o.nachweis ? o.nachweis[feld] : 0)));
  svg += `<text x="${spalteX}" y="${y.toFixed(2)}" class="t-nachweis-kopf">Nachweise</text>`;
  y += 4;
  [
    ["Wind", e.wind.qp !== null
      ? `q_p ${fasPlanZahl(e.wind.qp)} · c_pe ${fasPlanZahl(e.wind.cpe)} · `
        + `w_k ${fasPlanZahl(e.wind.wk)} kN/m²`
      : "nicht bestimmt"],
    ["Verglasung", `${e.aufbau.name} · η ${fasPlanZahl(grMax(e.felder, "eta") * 100, 0)} %`],
    ["Pfosten", `${e.raster.pfosten[0].profil} · σ ${fasPlanZahl(grMax(e.pfosten, "eta") * 100, 0)} % · `
      + `f ${fasPlanZahl(grMax(e.pfosten, "f"), 1)} mm`],
    ["Riegel", `${e.raster.riegel.length ? e.raster.riegel[0].profil : "–"} · `
      + `σ ${fasPlanZahl(grMax(e.riegel, "eta") * 100, 0)} %`],
    ["Wärmeschutz", e.uWert
      ? `U_cw ${fasPlanZahl(e.uWert.ucw, 2)} W/(m²K) · DIN EN ISO 12631` : "–"],
    ["Verankerung", `H ${fasPlanZahl(e.ankerHorizontal)} kN · V `
      + `${fasPlanZahl(e.ankerVertikal)} kN je Auflager`],
    ["Gewicht", `${fasPlanZahl(e.mengen.masseJeQm, 1)} kg/m² · `
      + `${fasPlanZahl(e.mengen.gesamtMasse / 1000, 2)} t gesamt`],
  ].forEach(([k, t]) => {
    svg += `<text x="${spalteX}" y="${y.toFixed(2)}" class="t-nachweis-kopf">${k}</text>`;
    svg += `<text x="${(spalteX + 24).toFixed(2)}" y="${y.toFixed(2)}" class="t-nachweis">${t}</text>`;
    y += 3.6;
  });
  svg += `<text x="${spalteX}" y="${(y + 1.4).toFixed(2)}" `
    + `class="t-nachweis${e.erfuellt ? "" : " t-rot"}">`
    + `${e.erfuellt ? "Alle geführten Nachweise sind erfüllt."
      : `${e.nichtErfuellt} Nachweise nicht erfüllt – siehe Tabelle.`}</text>`;

  svg += tiefSchriftfeld(projekt,
    `${e.art.name} · ${e.mengen.felder} Felder · ${e.mengen.achsen} Achsen`,
    "Fassade", `M 1:${Math.round(ans.nenner)}`);
  svg += `<text x="${BLATT.randLinks}" y="${BLATT.hoehe - 4}" class="t-hinweis">`
    + "Keine Ausführungsplanung. Profilkennwerte sind Richtwerte – maßgebend ist die Systemunterlage. "
    + "Absturzsicherung nach DIN 18008-4, Verankerung, Brandschutz und die Prüfungen nach "
    + "DIN EN 13830 sind gesondert nachzuweisen.</text>";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BLATT.breite} ${BLATT.hoehe}" width="100%" style="background:#fff">
<style>${TIEF_STIL}${FAS_STIL}</style>
${svg}
</svg>`;
}
