/**
 * Pläne des Tiefbaus: Lageplan der Achse, Höhenplan (Längsschnitt) und
 * Querprofilblatt – jeweils als SVG im Blattformat A4 quer.
 *
 * Der Höhenplan folgt dem Aufbau, den ein Straßenentwurf hat: oben die
 * Zeichnung mit Geländelinie und Gradiente über einer Bezugshöhe, unten
 * das Schriftband mit Station, Geländehöhe, Gradientenhöhe, Differenz
 * und Längsneigung. Die Höhen sind überhöht dargestellt – im Straßenbau
 * üblich, weil die Höhenunterschiede sonst nicht ablesbar sind; die
 * Überhöhung steht im Schriftfeld.
 *
 * Maßeintragung in Anlehnung an DIN 406-11, Maßstäbe nach DIN ISO 5455,
 * Linienbreiten nach DIN ISO 128. Alle Blattmaße in Millimetern.
 */

/** Zahl mit Dezimalkomma. */
function tiefZahl(wert, stellen) {
  return Number(wert).toFixed(stellen === undefined ? 2 : stellen).replace(".", ",");
}

/** Gemeinsamer Kopf der Tiefbaublätter. */
function tiefBlattKopf(titel, projekt) {
  let svg = `<rect x="0" y="0" width="${BLATT.breite}" height="${BLATT.hoehe}" fill="#ffffff"/>`;
  svg += `<rect x="${BLATT.randLinks - 5}" y="${BLATT.randOben - 6}" `
    + `width="${BLATT.breite - BLATT.randLinks - BLATT.randRechts + 8}" `
    + `height="${BLATT.hoehe - BLATT.randOben - BLATT.randUnten + 8}" class="rahmen"/>`;
  svg += `<text x="${BLATT.randLinks}" y="${BLATT.randOben}" class="t-kopf">${titel}</text>`;
  svg += `<text x="${BLATT.breite - BLATT.randRechts}" y="${BLATT.randOben}" class="t-kopf-rechts">`
    + `${projekt.name || "Projekt"}</text>`;
  return svg;
}

/** Gemeinsames Schriftfeld. */
function tiefSchriftfeld(projekt, zeile1, zeile2, massstab) {
  const sfB = 104, sfH = 30;
  const sfX = BLATT.breite - BLATT.randRechts - sfB;
  const sfY = BLATT.hoehe - BLATT.randUnten - sfH;
  let svg = `<rect x="${sfX}" y="${sfY}" width="${sfB}" height="${sfH}" class="schriftfeld"/>`;
  svg += `<line x1="${sfX}" y1="${sfY + 9}" x2="${sfX + sfB}" y2="${sfY + 9}" class="schriftfeld"/>`;
  svg += `<line x1="${sfX}" y1="${sfY + 19}" x2="${sfX + sfB}" y2="${sfY + 19}" class="schriftfeld"/>`;
  svg += `<line x1="${sfX + 62}" y1="${sfY + 19}" x2="${sfX + 62}" y2="${sfY + sfH}" class="schriftfeld"/>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 6}" class="t-firma">HSD Hamburg GmbH</text>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 15}" class="t-klein">${zeile1}</text>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 25}" class="t-klein">Bearbeiter: ${projekt.bearbeiter || ""}</text>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 28.5}" class="t-klein">Datum: ${projekt.datum || ""}</text>`;
  svg += `<text x="${sfX + 65}" y="${sfY + 25}" class="t-massstab">${massstab}</text>`;
  svg += `<text x="${sfX + 65}" y="${sfY + 28.5}" class="t-klein">${zeile2}</text>`;
  return svg;
}

/** Gemeinsame Formatvorlage der Tiefbaublätter. */
const TIEF_STIL = `
  .rahmen { fill: none; stroke: #1b2733; stroke-width: 0.5; }
  .schriftfeld { fill: none; stroke: #1b2733; stroke-width: 0.35; }
  .achse { stroke: #b3392c; stroke-width: 0.5; fill: none; }
  .achse-klothoide { stroke: #1f6b8f; stroke-width: 0.5; fill: none; }
  .achse-bogen { stroke: #2f7d4f; stroke-width: 0.5; fill: none; }
  .gelaende { stroke: #6b4a2f; stroke-width: 0.45; fill: none; }
  .gelaende-strip { stroke: #6b4a2f; stroke-width: 0.2; stroke-dasharray: 2 1; fill: none; }
  .gradiente { stroke: #b3392c; stroke-width: 0.6; fill: none; }
  .planum { stroke: #1b2733; stroke-width: 0.45; fill: none; }
  .oberflaeche { stroke: #1b2733; stroke-width: 0.6; fill: none; }
  .abtrag { fill: #f3d9d5; stroke: none; }
  .auftrag { fill: #d8e6d9; stroke: none; }
  .raster { stroke: #c9d2d8; stroke-width: 0.12; }
  .band { stroke: #1b2733; stroke-width: 0.25; fill: none; }
  .tick { stroke: #1b2733; stroke-width: 0.2; }
  .hilfs { stroke: #64707c; stroke-width: 0.15; stroke-dasharray: 1.5 1; }
  text { font-family: "IBM Plex Sans", Arial, sans-serif; fill: #1b2733; }
  .t-kopf { font-size: 3.4px; font-weight: 700; }
  .t-kopf-rechts { font-size: 3.4px; font-weight: 600; text-anchor: end; }
  .t-band { font-size: 2.1px; font-family: "IBM Plex Mono", monospace; text-anchor: middle; }
  .t-bandkopf { font-size: 2.1px; font-weight: 700; }
  .t-station { font-size: 2.1px; text-anchor: middle; }
  .t-klein { font-size: 2.4px; }
  .t-mini { font-size: 2px; }
  .t-firma { font-size: 4.5px; font-weight: 700; }
  .t-massstab { font-size: 4px; font-weight: 600; }
  .t-hinweis { font-size: 2.2px; fill: #64707c; }
  .t-profil { font-size: 2.4px; font-weight: 700; }
  .t-flaeche { font-size: 2.1px; }
`;

/**
 * Höhenplan (Längsschnitt).
 *
 * @param {Object} daten - { trasse, gradiente, gelaende, stationen, projekt,
 *        ueberhoehung }
 */
function laengsschnittSVG(daten) {
  const { gradiente, gelaende, stationen, projekt } = daten;
  const ueber = daten.ueberhoehung || 10;

  // ---- Zeichenfeld
  const feldX = BLATT.randLinks + 22;
  const feldBreite = BLATT.breite - BLATT.randRechts - feldX - 4;
  const feldOben = BLATT.randOben + 12;

  const von = stationen[0], bis = stationen[stationen.length - 1];
  const laenge = Math.max(1, bis - von);

  // Höhen sammeln. Liegt ein Geländemodell vor, wird seine Höhe in der
  // Achse übergeben; sonst gilt die Beschreibung je Station.
  const hoeheVon = daten.gelaendeHoehe || ((s) => gelaendeBei(gelaende, s).hoehe);
  const werte = stationen.map((s) => ({
    station: s,
    gelaende: hoeheVon(s),
    gradiente: gradienteHoehe(gradiente, s),
  }));
  const alleHoehen = werte.map((w) => w.gelaende).concat(werte.map((w) => w.gradiente.hoehe));
  const hMin = Math.min(...alleHoehen), hMax = Math.max(...alleHoehen);
  const bezug = Math.floor((hMin - 1) * 2) / 2;      // Bezugshöhe auf halbe Meter

  // Maßstab: waagerecht aus der Länge, lotrecht überhöht
  const mmProMeterX = feldBreite / laenge;
  const nennerX = Math.max(1, Math.round(1000 / mmProMeterX / 10) * 10);
  const mx = (s) => feldX + ((s - von) * 1000) / nennerX;
  const nennerY = Math.max(1, Math.round(nennerX / ueber));
  const my = (h) => feldUnten - ((h - bezug) * 1000) / nennerY;

  // Die Höhen werden überhöht dargestellt. Reicht die Zeichnung damit über
  // das Feld hinaus, wird die Überhöhung so weit verkleinert, bis sie passt.
  const feldHoeheMax = 96;
  let nY = nennerY;
  while (((hMax - bezug) * 1000) / nY > feldHoeheMax && nY < 20000) {
    nY += Math.max(1, Math.round(nY * 0.15));
  }
  // Das Feld ist so hoch wie die Zeichnung – das Schriftband schließt an
  const genutzt = Math.max(24, ((hMax - bezug) * 1000) / nY);
  const feldUnten = feldOben + genutzt + 6;
  const myEnd = (h) => feldUnten - ((h - bezug) * 1000) / nY;
  void my;

  let svg = tiefBlattKopf("Höhenplan (Längsschnitt)", projekt);

  // ---- Raster und Höhenbeschriftung
  const stufe = nY > 400 ? 5 : nY > 150 ? 2 : 1;
  for (let h = bezug; h <= hMax + stufe; h += stufe) {
    const y = myEnd(h);
    if (y < feldOben - 1 || y > feldUnten + 0.1) continue;
    svg += `<line x1="${feldX}" y1="${y.toFixed(2)}" x2="${(feldX + feldBreite).toFixed(2)}" y2="${y.toFixed(2)}" class="raster"/>`;
    if (Math.abs(h - bezug) > 1e-9) {
      svg += `<text x="${(feldX - 2).toFixed(2)}" y="${(y + 0.8).toFixed(2)}" class="t-band" text-anchor="end">${tiefZahl(h, 2)}</text>`;
    }
  }
  // Bezugslinie
  svg += `<line x1="${feldX}" y1="${feldUnten}" x2="${(feldX + feldBreite).toFixed(2)}" y2="${feldUnten}" class="band"/>`;
  svg += `<text x="${(feldX - 2).toFixed(2)}" y="${(feldUnten + 4).toFixed(2)}" class="t-bandkopf" text-anchor="end">`
    + `Bezug ${tiefZahl(bezug, 2)} m</text>`;

  // ---- Geländelinie und Gradiente
  const linie = (punkte, klasse) => `<polyline points="${punkte.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ")}" class="${klasse}"/>`;
  svg += linie(werte.map((w) => [mx(w.station), myEnd(w.gelaende)]), "gelaende");

  // Gradiente fein abtasten, damit die Ausrundungen rund erscheinen
  const fein = [];
  const schritt = laenge / 300;
  for (let s = von; s <= bis + 1e-9; s += schritt) fein.push([mx(s), myEnd(gradienteHoehe(gradiente, s).hoehe)]);
  svg += linie(fein, "gradiente");

  // Ausrundungen kennzeichnen
  (gradiente.ausrundungen || []).forEach((a) => {
    if (a.station < von || a.station > bis) return;
    const x = mx(a.station);
    svg += `<line x1="${x.toFixed(2)}" y1="${feldOben}" x2="${x.toFixed(2)}" y2="${feldUnten}" class="hilfs"/>`;
    svg += `<text x="${x.toFixed(2)}" y="${(feldOben + 3).toFixed(2)}" class="t-station">`
      + `${a.art} H = ${tiefZahl(Math.abs(a.H), 0)} m</text>`;
    svg += `<text x="${x.toFixed(2)}" y="${(feldOben + 6).toFixed(2)}" class="t-station">`
      + `L = ${tiefZahl(a.laenge, 1)} m</text>`;
  });

  // ---- Schriftband
  const zeilen = [
    // In der Zeile steht die Station in Metern; die volle Schreibweise
    // (0+120,000) steht im Schriftfeld und im Lageplan
    { kopf: "Station [m]", wert: (w) => tiefZahl(w.station, 0) },
    { kopf: "Gelände [m]", wert: (w) => tiefZahl(w.gelaende, 2) },
    { kopf: "Gradiente [m]", wert: (w) => tiefZahl(w.gradiente.hoehe, 2) },
    { kopf: "Differenz [m]", wert: (w) => tiefZahl(w.gradiente.hoehe - w.gelaende, 2) },
    { kopf: "Neigung [%]", wert: (w) => tiefZahl(w.gradiente.neigung * 100, 2) },
  ];
  const bandOben = feldUnten + 6;
  const zeilenHoehe = 4.2;
  svg += `<rect x="${feldX}" y="${bandOben}" width="${feldBreite.toFixed(2)}" `
    + `height="${(zeilen.length * zeilenHoehe).toFixed(2)}" class="band"/>`;
  zeilen.forEach((z, i) => {
    const y = bandOben + i * zeilenHoehe;
    if (i) svg += `<line x1="${feldX}" y1="${y.toFixed(2)}" x2="${(feldX + feldBreite).toFixed(2)}" y2="${y.toFixed(2)}" class="band"/>`;
    svg += `<text x="${(feldX - 3).toFixed(2)}" y="${(y + 2.9).toFixed(2)}" class="t-bandkopf" text-anchor="end">${z.kopf}</text>`;
  });
  // Nur so viele Stationen beschriften, wie lesbar sind
  const platz = 11;
  const jede = Math.max(1, Math.ceil((werte.length * platz) / feldBreite));
  // Die Trennlinien des Bandes liegen zwischen den Stationen, die Zahlen
  // stehen in der Mitte ihrer Spalte – so steht kein Strich in der Schrift.
  const bandUnten = bandOben + zeilen.length * zeilenHoehe;
  werte.forEach((w, k) => {
    const x = mx(w.station);
    svg += `<line x1="${x.toFixed(2)}" y1="${(feldUnten - 1.5).toFixed(2)}" x2="${x.toFixed(2)}" y2="${(feldUnten + 1.5).toFixed(2)}" class="tick"/>`;
    if (k === werte.length - 1) return;
    const xt = (x + mx(werte[k + 1].station)) / 2;
    svg += `<line x1="${xt.toFixed(2)}" y1="${bandOben}" x2="${xt.toFixed(2)}" y2="${bandUnten.toFixed(2)}" class="tick"/>`;
  });
  werte.forEach((w, k) => {
    if (k % jede) return;
    // Am Rand des Feldes würde die mittige Beschriftung überstehen
    const versatz = k === 0 ? 1 : k === werte.length - 1 ? -1 : 0;
    const anker = k === 0 ? ' text-anchor="start"'
      : k === werte.length - 1 ? ' text-anchor="end"' : "";
    const x = mx(w.station) + versatz;
    zeilen.forEach((z, i) => {
      svg += `<text x="${x.toFixed(2)}" y="${(bandOben + i * zeilenHoehe + 2.9).toFixed(2)}" class="t-band"${anker}>${z.wert(w)}</text>`;
    });
  });

  // ---- Massenlinie: aufsummierter Überschuss aus Abtrag minus Auftrag
  if (daten.massen && daten.massen.felder.length) {
    const mlOben = bandUnten + 10;
    const mlHoehe = 44;
    const mlUnten = mlOben + mlHoehe;
    let summe = 0;
    const linieMassen = [{ station: daten.massen.felder[0].von, wert: 0 }];
    daten.massen.felder.forEach((f) => {
      summe += f.abtrag - f.auftrag;
      linieMassen.push({ station: f.bis, wert: summe });
    });
    const wMax = Math.max(...linieMassen.map((p) => p.wert), 0);
    const wMin = Math.min(...linieMassen.map((p) => p.wert), 0);
    const spanne = Math.max(1, wMax - wMin);
    const myM = (w) => mlUnten - ((w - wMin) / spanne) * mlHoehe;
    const null0 = myM(0);
    svg += `<rect x="${feldX}" y="${mlOben.toFixed(2)}" width="${feldBreite.toFixed(2)}" `
      + `height="${mlHoehe.toFixed(2)}" class="band"/>`;
    svg += `<line x1="${feldX}" y1="${null0.toFixed(2)}" x2="${(feldX + feldBreite).toFixed(2)}" `
      + `y2="${null0.toFixed(2)}" class="tick"/>`;
    svg += `<polyline points="${linieMassen.map((p) => `${mx(p.station).toFixed(2)},${myM(p.wert).toFixed(2)}`).join(" ")}" class="gradiente"/>`;
    svg += `<text x="${(feldX - 3).toFixed(2)}" y="${(mlOben + 3).toFixed(2)}" class="t-bandkopf" text-anchor="end">Massenlinie</text>`;
    svg += `<text x="${(feldX - 3).toFixed(2)}" y="${(null0 + 0.8).toFixed(2)}" class="t-band" text-anchor="end">0</text>`;
    svg += `<text x="${(feldX - 3).toFixed(2)}" y="${(myM(wMax) + 0.8).toFixed(2)}" class="t-band" text-anchor="end">${tiefZahl(wMax, 0)}</text>`;
    if (wMin < -0.5) {
      svg += `<text x="${(feldX - 3).toFixed(2)}" y="${(myM(wMin) + 0.8).toFixed(2)}" class="t-band" text-anchor="end">${tiefZahl(wMin, 0)}</text>`;
    }
    svg += `<text x="${(feldX + 2).toFixed(2)}" y="${(mlOben + 3.4).toFixed(2)}" class="t-klein">`
      + `Aufsummierter Überschuss (Abtrag − Auftrag) in m³ Festmaß · `
      + `steigend = Überschuss, fallend = Bedarf · Endwert ${tiefZahl(summe, 0)} m³</text>`;
  }

  svg += tiefSchriftfeld(projekt,
    `Höhenplan · Station ${stationText(von)} bis ${stationText(bis)} · ${tiefZahl(laenge, 1)} m`,
    "Höhenplan", `L 1:${nennerX} · H 1:${nY}`);
  svg += `<text x="${BLATT.randLinks}" y="${BLATT.hoehe - 4}" class="t-hinweis">`
    + `Höhen ${(nennerX / nY).toFixed(0)}-fach überhöht dargestellt. Geländehöhen sind Eingabewerte je Station, `
    + "linear dazwischen; ein aufgemessenes Geländemodell ersetzt sie. Vorbemessung – keine Ausführungsplanung.</text>";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BLATT.breite} ${BLATT.hoehe}" width="100%" style="background:#fff">
<style>${TIEF_STIL}</style>
${svg}
</svg>`;
}

/**
 * Querprofilblatt: bis zu sechs Profile auf einem Blatt.
 *
 * @param {Object} daten - { profile: [{ station, profil }], projekt, blattNr, blaetter }
 */
function querprofilSVG(daten) {
  const { profile, projekt } = daten;
  const spalten = 3, reihen = 2;
  const feldX = BLATT.randLinks, feldY = BLATT.randOben + 4;
  const feldB = (BLATT.breite - BLATT.randLinks - BLATT.randRechts) / spalten;
  const feldH = 78;

  // gemeinsamer Maßstab für alle Profile des Blattes
  let maxBreite = 1, maxHoehe = 1;
  profile.forEach(({ profil }) => {
    const xs = profil.entwurf.map((p) => p.x).concat(profil.gelaendeZug.map((p) => p.x));
    const zs = profil.entwurf.map((p) => p.z).concat(profil.gelaendeZug.map((p) => p.z));
    maxBreite = Math.max(maxBreite, Math.max(...xs) - Math.min(...xs));
    maxHoehe = Math.max(maxHoehe, Math.max(...zs) - Math.min(...zs));
  });
  const nutzB = feldB - 8, nutzH = feldH - 22;
  const nenner = Math.max(
    Math.ceil((maxBreite * 1000) / nutzB / 10) * 10,
    Math.ceil((maxHoehe * 1000) / nutzH / 10) * 10, 10);

  let svg = tiefBlattKopf("Querprofile", projekt);

  profile.slice(0, spalten * reihen).forEach(({ station, profil }, i) => {
    const sx = feldX + (i % spalten) * feldB;
    const sy = feldY + Math.floor(i / spalten) * feldH;
    const mitteX = sx + feldB / 2;

    const zs = profil.entwurf.map((p) => p.z).concat(profil.gelaendeZug.map((p) => p.z));
    const zMitte = (Math.max(...zs) + Math.min(...zs)) / 2;
    const basis = sy + 12 + nutzH / 2;
    const px = (x) => mitteX + (x * 1000) / nenner;
    const py = (z) => basis - ((z - zMitte) * 1000) / nenner;
    const zug = (punkte) => punkte.map((p) => `${px(p.x).toFixed(2)},${py(p.z).toFixed(2)}`).join(" ");

    // Flächen füllen: Fläche zwischen Gelände (abgeschoben) und Entwurf
    const links = profil.entwurf[0].x, rechts = profil.entwurf[profil.entwurf.length - 1].x;
    const oben = [];
    const unten = [];
    for (let x = links; x <= rechts + 1e-9; x += (rechts - links) / 120) {
      oben.push({ x, z: linieHoehe(profil.stripZug, x) });
      unten.push({ x, z: linieHoehe(profil.entwurf, x) });
    }
    // Abtrag: Gelände über Entwurf – Auftrag: Entwurf über Gelände
    const bereich = (auswahl, klasse) => {
      let stueck = [];
      let svgTeil = "";
      const schliesse = () => {
        if (stueck.length > 1) {
          const rueck = stueck.slice().reverse();
          svgTeil += `<polygon points="${zug(stueck.map((p) => ({ x: p.x, z: p.a })))} `
            + `${zug(rueck.map((p) => ({ x: p.x, z: p.b })))}" class="${klasse}"/>`;
        }
        stueck = [];
      };
      oben.forEach((p, k) => {
        const a = p.z, b = unten[k].z;
        if (auswahl(a, b)) stueck.push({ x: p.x, a, b });
        else schliesse();
      });
      schliesse();
      return svgTeil;
    };
    svg += bereich((a, b) => a > b + 1e-6, "abtrag");
    svg += bereich((a, b) => b > a + 1e-6, "auftrag");

    svg += `<polyline points="${zug(profil.gelaendeZug)}" class="gelaende"/>`;
    svg += `<polyline points="${zug(profil.stripZug)}" class="gelaende-strip"/>`;
    svg += `<polyline points="${zug(profil.entwurf)}" class="planum"/>`;
    svg += `<polyline points="${zug(profil.oberflaeche)}" class="oberflaeche"/>`;
    // Achse
    svg += `<line x1="${px(0).toFixed(2)}" y1="${(py(profil.achshoehe) - 4).toFixed(2)}" `
      + `x2="${px(0).toFixed(2)}" y2="${(py(profil.achshoehe) + 6).toFixed(2)}" class="achse"/>`;

    svg += `<text x="${mitteX.toFixed(2)}" y="${(sy + 6).toFixed(2)}" class="t-profil" text-anchor="middle">`
      + `Station ${stationText(station)}</text>`;
    // Die Beschriftung schließt an die Zeichnung an, nicht am Feldrand
    const zSpanne = ((Math.max(...zs) - Math.min(...zs)) * 1000) / nenner;
    const textY = Math.min(sy + feldH - 11, basis + zSpanne / 2 + 6);
    const f = profil.flaechen;
    svg += `<text x="${(sx + 2).toFixed(2)}" y="${textY.toFixed(2)}" class="t-flaeche">`
      + `Abtrag ${tiefZahl(f.abtrag, 2)} m² · Auftrag ${tiefZahl(f.auftrag, 2)} m²</text>`;
    svg += `<text x="${(sx + 2).toFixed(2)}" y="${(textY + 3.5).toFixed(2)}" class="t-flaeche">`
      + `Oberboden ${tiefZahl(f.oberboden, 2)} m² · Oberbau ${tiefZahl(f.oberbau, 2)} m²</text>`;
    svg += `<text x="${(sx + 2).toFixed(2)}" y="${(textY + 7).toFixed(2)}" class="t-flaeche">`
      + `Gradiente ${tiefZahl(profil.achshoehe, 2)} · Gelände ${tiefZahl(profil.gelaende.hoehe, 2)} m</text>`;
  });

  // Legende
  const lx = BLATT.randLinks, ly = BLATT.hoehe - BLATT.randUnten - 26;
  [["abtrag", "Abtrag (Gelände über Planum)"], ["auftrag", "Auftrag (Planum über Gelände)"]].forEach(([k, t], i) => {
    svg += `<rect x="${lx}" y="${(ly + i * 4.4).toFixed(2)}" width="4" height="3" class="${k}"/>`;
    svg += `<text x="${(lx + 6).toFixed(2)}" y="${(ly + i * 4.4 + 2.6).toFixed(2)}" class="t-klein">${t}</text>`;
  });
  svg += `<text x="${lx}" y="${(ly + 12).toFixed(2)}" class="t-klein">`
    + `Gestrichelt: Gelände nach Abtrag des Oberbodens – darauf wird gerechnet.</text>`;

  svg += tiefSchriftfeld(projekt,
    `Querprofile ${stationText(profile[0].station)} bis ${stationText(profile[profile.length - 1].station)}`
    + (daten.blaetter > 1 ? ` · Blatt ${daten.blattNr} von ${daten.blaetter}` : ""),
    "Querprofile", `M 1:${nenner}`);
  svg += `<text x="${BLATT.randLinks}" y="${BLATT.hoehe - 4}" class="t-hinweis">`
    + "Flächen zwischen Gelände und Planum; Oberboden gesondert. Regelquerschnitt ohne Mulden, Gräben, "
    + "Kurvenaufweitung und Verwindung. Vorbemessung – keine Ausführungsplanung.</text>";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BLATT.breite} ${BLATT.hoehe}" width="100%" style="background:#fff">
<style>${TIEF_STIL}</style>
${svg}
</svg>`;
}

/**
 * Lageplan der Achse: die Elemente farbig nach Art, mit Stationierung
 * und den Hauptpunkten.
 */
function lageplanSVG(daten) {
  const { trasse, stationen, projekt } = daten;
  const feldX = BLATT.randLinks, feldY = BLATT.randOben + 4;
  const feldB = BLATT.breite - BLATT.randLinks - BLATT.randRechts - 60;
  const feldH = BLATT.hoehe - feldY - BLATT.randUnten - 8;

  // Achse abtasten
  const punkte = [];
  const schritt = Math.max(0.5, trasse.laenge / 600);
  for (let s = trasse.start.station; s <= trasse.stationEnde + 1e-9; s += schritt) {
    const p = trassePunkt(trasse, s);
    punkte.push({ s, x: p.x, y: p.y, art: p.element.art });
  }
  const xs = punkte.map((p) => p.x), ys = punkte.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const nenner = Math.max(
    Math.ceil(((maxX - minX) * 1000) / (feldB - 10) / 50) * 50,
    Math.ceil(((maxY - minY) * 1000) / (feldH - 10) / 50) * 50, 50);
  const mittelX = (minX + maxX) / 2, mittelY = (minY + maxY) / 2;
  const px = (x) => feldX + feldB / 2 + ((x - mittelX) * 1000) / nenner;
  const py = (y) => feldY + feldH / 2 - ((y - mittelY) * 1000) / nenner;

  let svg = tiefBlattKopf("Lageplan der Achse", projekt);

  // Achse elementweise
  const klasse = { gerade: "achse", bogen: "achse-bogen", klothoide: "achse-klothoide" };
  trasse.elemente.forEach((el) => {
    const teil = punkte.filter((p) => p.s >= el.station - 1e-9 && p.s <= el.stationEnde + 1e-9);
    if (teil.length < 2) return;
    svg += `<polyline points="${teil.map((p) => `${px(p.x).toFixed(2)},${py(p.y).toFixed(2)}`).join(" ")}" `
      + `class="${klasse[el.art]}"/>`;
  });

  // Stationen als Querstriche mit Beschriftung
  const jede = Math.max(1, Math.ceil(stationen.length / 14));
  stationen.forEach((s, i) => {
    const p = trassePunkt(trasse, s);
    const nx = -Math.sin(p.richtung), ny = Math.cos(p.richtung);
    const l = 1.6;
    svg += `<line x1="${(px(p.x) - nx * l).toFixed(2)}" y1="${(py(p.y) + ny * l).toFixed(2)}" `
      + `x2="${(px(p.x) + nx * l).toFixed(2)}" y2="${(py(p.y) - ny * l).toFixed(2)}" class="tick"/>`;
    if (i % jede) return;
    svg += `<text x="${(px(p.x) + nx * 4).toFixed(2)}" y="${(py(p.y) - ny * 4 + 0.8).toFixed(2)}" class="t-station">`
      + `${stationText(s)}</text>`;
  });

  // Hauptpunkte
  let ty = feldY + 4;
  const tx = BLATT.breite - BLATT.randRechts - 56;
  svg += `<text x="${tx}" y="${ty}" class="t-bandkopf">Hauptpunkte der Achse</text>`;
  ty += 4;
  svg += `<text x="${tx}" y="${ty}" class="t-mini">Element · Station · Rechts / Hoch · R bzw. A</text>`;
  ty += 3.6;
  trasse.elemente.forEach((el) => {
    const r = el.art === "gerade" ? "gerade"
      : el.art === "klothoide" ? `A = ${tiefZahl(el.A || 0, 1)}`
        : `R = ${tiefZahl(Math.abs(el.radius), 1)}`;
    svg += `<text x="${tx}" y="${ty}" class="t-mini">${TRASSE_ARTEN[el.art].name} ${el.nummer} · `
      + `${stationText(el.station)}</text>`;
    ty += 3.2;
    svg += `<text x="${tx + 3}" y="${ty}" class="t-mini">${tiefZahl(el.x, 3)} / ${tiefZahl(el.y, 3)} · `
      + `L = ${tiefZahl(el.laenge, 2)} · ${r}</text>`;
    ty += 3.8;
  });

  svg += tiefSchriftfeld(projekt,
    `Achse ${stationText(trasse.start.station)} bis ${stationText(trasse.stationEnde)} · `
    + `${tiefZahl(trasse.laenge, 2)} m`, "Lageplan", `M 1:${nenner}`);
  svg += `<text x="${BLATT.randLinks}" y="${BLATT.hoehe - 4}" class="t-hinweis">`
    + "Rot: Gerade · Grün: Kreisbogen · Blau: Klothoide. Koordinaten im Achssystem des Projekts; "
    + "der Lagebezug (ETRS89/UTM) ist über den Anfangspunkt und die Anfangsrichtung herzustellen.</text>";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BLATT.breite} ${BLATT.hoehe}" width="100%" style="background:#fff">
<style>${TIEF_STIL}</style>
${svg}
</svg>`;
}

/**
 * Geländeplan: Höhenlinien mit Beschriftung über dem Dreiecksnetz.
 *
 * Jede fünfte Höhenlinie wird als Zähllinie stärker gezogen und mit ihrer
 * Höhe beschriftet – so, wie es die Kartenpraxis vorsieht. Dazu kommen
 * wahlweise das Dreiecksnetz, die Höhenpunkte und die Achse des Tiefbaus.
 *
 * @param {Object} daten - { dgm, linien, projekt, aequidistanz, netz,
 *        punkteZeigen, trasse, stationen }
 */
function gelaendeplanSVG(daten) {
  const { dgm, linien, projekt } = daten;
  const e = daten.aequidistanz || 1;

  const feldX = BLATT.randLinks;
  const feldY = BLATT.randOben + 4;
  const feldB = BLATT.breite - BLATT.randLinks - BLATT.randRechts - 58;
  const feldH = BLATT.hoehe - feldY - BLATT.randUnten - 6;

  const g = dgm.grenzen;
  const nenner = Math.max(
    Math.ceil(((g.maxX - g.minX) * 1000) / (feldB - 8) / 50) * 50,
    Math.ceil(((g.maxY - g.minY) * 1000) / (feldH - 8) / 50) * 50, 50);
  const mittelX = (g.minX + g.maxX) / 2, mittelY = (g.minY + g.maxY) / 2;
  const px = (x) => feldX + feldB / 2 + ((x - mittelX) * 1000) / nenner;
  const py = (y) => feldY + feldH / 2 - ((y - mittelY) * 1000) / nenner;

  let svg = tiefBlattKopf("Geländeplan", projekt);
  // Alles, was über das Kartenfeld hinausragt, wird abgeschnitten – sonst
  // laufen Achse und Beschriftung über den Blattrand
  svg += `<clipPath id="kartenfeld"><rect x="${feldX}" y="${feldY}" `
    + `width="${feldB.toFixed(2)}" height="${feldH.toFixed(2)}"/></clipPath>`;
  svg += `<g clip-path="url(#kartenfeld)">`;

  // ---- Dreiecksnetz
  if (daten.netz) {
    dgm.dreiecke.forEach((t) => {
      const p = t.map((i) => dgm.punkte[i]);
      svg += `<polygon points="${p.map((q) => `${px(q.x).toFixed(2)},${py(q.y).toFixed(2)}`).join(" ")}" class="netz"/>`;
    });
  }

  // ---- Höhenlinien
  linien.forEach((l) => {
    const zaehl = Math.abs(l.hoehe / (5 * e) - Math.round(l.hoehe / (5 * e))) < 1e-6;
    l.zuege.forEach((zug) => {
      if (zug.length < 2) return;
      svg += `<polyline points="${zug.map((q) => `${px(q.x).toFixed(2)},${py(q.y).toFixed(2)}`).join(" ")}" `
        + `class="${zaehl ? "hoehenlinie-zaehl" : "hoehenlinie"}"/>`;
      // Zähllinien beschriften: in der Mitte des längsten Zuges, in
      // Linienrichtung gedreht, mit weißem Grund unter der Schrift
      if (!zaehl || zug.length < 6) return;
      const k = Math.floor(zug.length / 2);
      const a = zug[k - 1], b = zug[k + 1] || zug[k];
      let winkel = (Math.atan2(-(py(b.y) - py(a.y)), px(b.x) - px(a.x)) * 180) / Math.PI;
      if (winkel > 90) winkel -= 180;
      if (winkel < -90) winkel += 180;
      svg += `<text x="${px(zug[k].x).toFixed(2)}" y="${py(zug[k].y).toFixed(2)}" class="t-hoehe" `
        + `transform="rotate(${(-winkel).toFixed(1)} ${px(zug[k].x).toFixed(2)} ${py(zug[k].y).toFixed(2)})">`
        + `${tiefZahl(l.hoehe, l.hoehe % 1 === 0 ? 0 : 2)}</text>`;
    });
  });

  // ---- Höhenpunkte
  if (daten.punkteZeigen) {
    const abstand = 6;   // mm auf dem Blatt, damit sich die Schrift nicht deckt
    const belegt = [];
    dgm.punkte.forEach((p) => {
      const x = px(p.x), y = py(p.y);
      if (belegt.some((q) => Math.abs(q.x - x) < abstand && Math.abs(q.y - y) < abstand)) return;
      belegt.push({ x, y });
      svg += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="0.4" class="hoehenpunkt"/>`;
      svg += `<text x="${(x + 1).toFixed(2)}" y="${(y - 0.8).toFixed(2)}" class="t-punkt">${tiefZahl(p.z, 2)}</text>`;
    });
  }

  // ---- Achse des Tiefbaus
  if (daten.trasse && daten.trasse.elemente.length) {
    const punkte = [];
    const schritt = Math.max(0.5, daten.trasse.laenge / 400);
    for (let s = daten.trasse.start.station; s <= daten.trasse.stationEnde + 1e-9; s += schritt) {
      const p = trassePunkt(daten.trasse, s);
      punkte.push(`${px(p.x).toFixed(2)},${py(p.y).toFixed(2)}`);
    }
    svg += `<polyline points="${punkte.join(" ")}" class="achse"/>`;
    (daten.stationen || []).forEach((s, i) => {
      if (i % 5) return;
      const p = trassePunkt(daten.trasse, s);
      svg += `<circle cx="${px(p.x).toFixed(2)}" cy="${py(p.y).toFixed(2)}" r="0.6" class="achskreis"/>`;
      svg += `<text x="${(px(p.x) + 2).toFixed(2)}" y="${(py(p.y) - 1.5).toFixed(2)}" class="t-station">${stationText(s)}</text>`;
    });
  }

  svg += `</g>`;

  // ---- Nordpfeil und Maßstabsleiste
  const nx = BLATT.breite - BLATT.randRechts - 50, ny = feldY + 12;
  svg += `<line x1="${nx}" y1="${ny + 8}" x2="${nx}" y2="${ny - 6}" class="nord"/>`;
  svg += `<polygon points="${nx},${ny - 8} ${nx - 2},${ny - 3} ${nx + 2},${ny - 3}" class="nordspitze"/>`;
  svg += `<text x="${nx}" y="${ny + 12}" class="t-mass">N</text>`;
  // Länge der Leiste so wählen, dass sie in die Spalte passt (höchstens 40 mm)
  const stufen = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500];
  const leisteM = stufen.filter((w) => (2 * w * 1000) / nenner <= 40).pop() || 1;
  const leisteMM = (leisteM * 1000) / nenner;
  const lx = nx - 6, ly = ny + 24;
  for (let i = 0; i < 4; i++) {
    svg += `<rect x="${(lx + (i * leisteMM) / 2).toFixed(2)}" y="${ly}" width="${(leisteMM / 2).toFixed(2)}" `
      + `height="1.6" fill="${i % 2 ? "#ffffff" : "#1b2733"}" stroke="#1b2733" stroke-width="0.15"/>`;
  }
  svg += `<text x="${lx}" y="${(ly + 5).toFixed(2)}" class="t-mini">0</text>`;
  svg += `<text x="${(lx + 2 * leisteMM).toFixed(2)}" y="${(ly + 5).toFixed(2)}" class="t-mini">${2 * leisteM} m</text>`;

  // ---- Legende
  const kw = dgmKennwerte(dgm);
  let ty = ny + 36;
  const tx = nx - 6;
  svg += `<text x="${tx}" y="${ty}" class="t-bandkopf">Geländemodell</text>`;
  ty += 4;
  [
    `${kw.punkte} Höhenpunkte, ${kw.dreiecke} Dreiecke`,
    `Höhen ${tiefZahl(kw.hoeheMin)} bis ${tiefZahl(kw.hoeheMax)} m`,
    `Äquidistanz ${tiefZahl(e, e % 1 === 0 ? 0 : 2)} m, jede 5. Linie verstärkt`,
    `Fläche im Grundriss ${tiefZahl(kw.flaecheGrundriss, 0)} m²`,
    `Geländefläche ${tiefZahl(kw.flaecheGelaende, 0)} m²`,
    `Neigung im Mittel ${tiefZahl(kw.neigungMittel, 1)} %, größte ${tiefZahl(kw.neigungMax, 1)} %`,
    kw.schlankeDreiecke ? `${kw.schlankeDreiecke} schlanke Dreiecke am Rand (beim Größtwert außen vor)` : "",
  ].forEach((t) => { if (!t) return; svg += `<text x="${tx}" y="${ty}" class="t-mini">${t}</text>`; ty += 3.4; });

  svg += tiefSchriftfeld(projekt,
    `Geländeplan · ${kw.punkte} Punkte · Äquidistanz ${tiefZahl(e, e % 1 === 0 ? 0 : 2)} m`,
    "Geländeplan", `M 1:${nenner}`);
  svg += `<text x="${BLATT.randLinks}" y="${BLATT.hoehe - 4}" class="t-hinweis">`
    + "Dreiecksvermaschung nach Delaunay ohne Bruchkanten: Böschungsoberkanten, Mauern und Gräben sind nur "
    + "über die Dichte der Punkte abgebildet. Die Genauigkeit des Modells ist die der Aufnahme (DIN 18710-1).</text>";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BLATT.breite} ${BLATT.hoehe}" width="100%" style="background:#fff">
<style>${TIEF_STIL}
  .netz { fill: none; stroke: #c9d2d8; stroke-width: 0.1; }
  .hoehenlinie { fill: none; stroke: #8a6a45; stroke-width: 0.18; }
  .hoehenlinie-zaehl { fill: none; stroke: #6b4a2f; stroke-width: 0.42; }
  .hoehenpunkt { fill: #1b2733; }
  .nord { stroke: #1b2733; stroke-width: 0.5; }
  .nordspitze { fill: #1b2733; }
  .t-hoehe { font-size: 2.3px; text-anchor: middle; fill: #6b4a2f; font-weight: 600;
             paint-order: stroke; stroke: #ffffff; stroke-width: 1.1; stroke-linejoin: round; }
  .t-punkt { font-size: 1.9px; fill: #1b2733; }
</style>
${svg}
</svg>`;
}
