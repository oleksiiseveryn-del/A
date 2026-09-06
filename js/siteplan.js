/**
 * Baustelleneinrichtungsplan und Balkenplan als Blatt A4 quer.
 *
 * Der Einrichtungsplan zeigt, was auf der Baustelle steht und wo: das
 * Bauwerk, den Kran mit seinem Arbeitsbereich, Lagerflächen, Container,
 * Zufahrt und Bauzaun. Der Balkenplan zeigt, wann was läuft: Vorgänge als
 * Balken über der Zeitachse, der kritische Weg hervorgehoben, Puffer als
 * dünne Linie dahinter.
 *
 * Der Einrichtungsplan ist keine Genehmigungsunterlage: Der Sicherheits-
 * und Gesundheitsschutzplan nach BaustellV, der Verkehrszeichenplan, die
 * Ver- und Entsorgung sowie der Brandschutz sind gesondert zu erstellen.
 */

/** Arten der Einrichtungsflächen mit ihrer Darstellung. */
const BE_ARTEN = {
  bauwerk: { name: "Bauwerk", klasse: "be-bauwerk" },
  lager: { name: "Lagerfläche", klasse: "be-lager" },
  container: { name: "Container", klasse: "be-container" },
  zufahrt: { name: "Zufahrt", klasse: "be-zufahrt" },
  mischanlage: { name: "Misch- und Bewehrungsplatz", klasse: "be-misch" },
  entsorgung: { name: "Entsorgung", klasse: "be-entsorgung" },
};

/**
 * Baustelleneinrichtungsplan.
 *
 * @param {Object} daten - { flaechen: [{art, name, x, y, breite, tiefe}],
 *        krane: [{name, x, y, ausladung, hakenhoehe}], zaun: [{x,y}],
 *        projekt, kranPruefung }
 */
function bePlanSVG(daten) {
  const { flaechen, krane, projekt } = daten;
  const feldX = BLATT.randLinks;
  const feldY = BLATT.randOben + 4;
  const feldB = BLATT.breite - BLATT.randLinks - BLATT.randRechts - 62;
  const feldH = BLATT.hoehe - feldY - BLATT.randUnten - 6;

  // Ausdehnung aus allen Flächen, Kranen und dem Zaun
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const nimm = (x, y) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  };
  flaechen.forEach((f) => { nimm(f.x, f.y); nimm(f.x + f.breite, f.y + f.tiefe); });
  krane.forEach((k) => { nimm(k.x - k.ausladung, k.y - k.ausladung); nimm(k.x + k.ausladung, k.y + k.ausladung); });
  (daten.zaun || []).forEach((p) => nimm(p.x, p.y));
  if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = 50; maxY = 40; }

  const nenner = Math.max(
    Math.ceil(((maxX - minX) * 1000) / (feldB - 8) / 50) * 50,
    Math.ceil(((maxY - minY) * 1000) / (feldH - 8) / 50) * 50, 50);
  const mittelX = (minX + maxX) / 2, mittelY = (minY + maxY) / 2;
  const px = (x) => feldX + feldB / 2 + ((x - mittelX) * 1000) / nenner;
  const py = (y) => feldY + feldH / 2 - ((y - mittelY) * 1000) / nenner;
  const mm = (l) => (l * 1000) / nenner;

  let svg = tiefBlattKopf("Baustelleneinrichtungsplan", projekt);
  svg += `<clipPath id="befeld"><rect x="${feldX}" y="${feldY}" `
    + `width="${feldB.toFixed(2)}" height="${feldH.toFixed(2)}"/></clipPath>`;
  svg += `<g clip-path="url(#befeld)">`;

  // Bauzaun
  if ((daten.zaun || []).length > 1) {
    svg += `<polygon points="${daten.zaun.map((p) => `${px(p.x).toFixed(2)},${py(p.y).toFixed(2)}`).join(" ")}" `
      + `class="be-zaun"/>`;
  }

  // Arbeitsbereich und Ausleger der Krane zuerst, damit die Flächen darauf
  // liegen: Der Ausleger reicht über die halbe Baustelle und würde sonst
  // quer durch jede Fläche laufen, die er überstreicht.
  krane.forEach((k) => {
    svg += `<circle cx="${px(k.x).toFixed(2)}" cy="${py(k.y).toFixed(2)}" r="${mm(k.ausladung).toFixed(2)}" `
      + `class="be-kranbereich"/>`;
    svg += `<line x1="${px(k.x).toFixed(2)}" y1="${py(k.y).toFixed(2)}" `
      + `x2="${(px(k.x) + mm(k.ausladung)).toFixed(2)}" y2="${py(k.y).toFixed(2)}" class="be-ausleger"/>`;
  });

  // Flächen
  flaechen.forEach((f) => {
    const art = BE_ARTEN[f.art] || BE_ARTEN.lager;
    svg += `<rect x="${px(f.x).toFixed(2)}" y="${py(f.y + f.tiefe).toFixed(2)}" `
      + `width="${mm(f.breite).toFixed(2)}" height="${mm(f.tiefe).toFixed(2)}" class="${art.klasse}"/>`;
    // Die Beschriftung steht am oberen Rand der Fläche: In der Mitte
    // großer Flächen steht oft schon der Kran.
    const beschriftungY = Math.min(py(f.y + f.tiefe) + 4, py(f.y + f.tiefe / 2));
    svg += `<text x="${px(f.x + f.breite / 2).toFixed(2)}" y="${beschriftungY.toFixed(2)}" `
      + `class="t-flaeche">${f.name || art.name}</text>`;
    svg += `<text x="${px(f.x + f.breite / 2).toFixed(2)}" y="${(beschriftungY + 3).toFixed(2)}" `
      + `class="t-flaeche-klein">${tiefZahl(f.breite, 1)} × ${tiefZahl(f.tiefe, 1)} m = `
      + `${tiefZahl(f.breite * f.tiefe, 0)} m²</text>`;
  });

  // Kranmast und Beschriftung zuletzt, damit sie über den Flächen stehen
  krane.forEach((k) => {
    const x = px(k.x), y = py(k.y);
    svg += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2" class="be-kran"/>`;
    svg += `<text x="${(x + 3).toFixed(2)}" y="${(y - 6).toFixed(2)}" class="t-kran">${k.name || "Kran"}</text>`;
    svg += `<text x="${(x + 3).toFixed(2)}" y="${(y - 3).toFixed(2)}" class="t-kran-klein">`
      + `Ausladung ${tiefZahl(k.ausladung, 1)} m${k.hakenhoehe ? ` · Haken ${tiefZahl(k.hakenhoehe, 1)} m` : ""}</text>`;
  });

  svg += `</g>`;

  // Nordpfeil und Maßstabsleiste
  const nx = BLATT.breite - BLATT.randRechts - 54, ny = feldY + 10;
  svg += `<line x1="${nx}" y1="${ny + 8}" x2="${nx}" y2="${ny - 6}" class="nord"/>`;
  svg += `<polygon points="${nx},${ny - 8} ${nx - 2},${ny - 3} ${nx + 2},${ny - 3}" class="nordspitze"/>`;
  svg += `<text x="${nx}" y="${ny + 12}" class="t-mass">N</text>`;
  const stufen = [1, 2, 5, 10, 20, 25, 50, 100];
  const leisteM = stufen.filter((w) => (2 * w * 1000) / nenner <= 40).pop() || 1;
  const leisteMM = (leisteM * 1000) / nenner;
  const lx = nx - 6, ly = ny + 20;
  for (let i = 0; i < 4; i++) {
    svg += `<rect x="${(lx + (i * leisteMM) / 2).toFixed(2)}" y="${ly}" width="${(leisteMM / 2).toFixed(2)}" `
      + `height="1.6" fill="${i % 2 ? "#ffffff" : "#1b2733"}" stroke="#1b2733" stroke-width="0.15"/>`;
  }
  svg += `<text x="${lx}" y="${(ly + 5).toFixed(2)}" class="t-mini">0</text>`;
  svg += `<text x="${(lx + 2 * leisteMM).toFixed(2)}" y="${(ly + 5).toFixed(2)}" class="t-mini">${2 * leisteM} m</text>`;

  // Legende und Kennwerte
  let ty = ly + 12;
  const tx = nx - 6;
  svg += `<text x="${tx}" y="${ty}" class="t-bandkopf">Legende</text>`;
  ty += 4.2;
  Object.keys(BE_ARTEN).forEach((k) => {
    if (!flaechen.some((f) => f.art === k)) return;
    svg += `<rect x="${tx}" y="${(ty - 2.6).toFixed(2)}" width="4" height="3" class="${BE_ARTEN[k].klasse}"/>`;
    svg += `<text x="${(tx + 6).toFixed(2)}" y="${ty}" class="t-mini">${BE_ARTEN[k].name}</text>`;
    ty += 4;
  });
  ty += 2;

  if (daten.kranPruefung) {
    const k = daten.kranPruefung;
    svg += `<text x="${tx}" y="${ty}" class="t-bandkopf">Kran</text>`;
    ty += 4.2;
    [
      `größte Ausladung ${tiefZahl(k.groessteAusladung, 1)} m`,
      `schwerster Hub ${tiefZahl(k.schwersterHub, 2)} t`,
      `größte Ausnutzung ${tiefZahl(k.groessteAusnutzung * 100, 0)} %`,
      k.erfuellt ? "alle Hübe möglich" : `${k.nichtErfuellt} Hübe nicht möglich`,
    ].forEach((t) => {
      svg += `<text x="${tx}" y="${ty}" class="t-mini"${!k.erfuellt && t.indexOf("nicht") >= 0 ? ' fill="#b3392c"' : ""}>`
        + `${t}</text>`;
      ty += 3.4;
    });
    ty += 2;
  }

  if (daten.flaechenbedarf) {
    const f = daten.flaechenbedarf;
    svg += `<text x="${tx}" y="${ty}" class="t-bandkopf">Einrichtung</text>`;
    ty += 4.2;
    [
      `${f.beschaeftigte} Beschäftigte, ${f.bauleitung} Bauleitung`,
      `${f.toiletten} Toiletten, ${f.waschplaetze} Waschplätze`,
      `${f.container} Container`,
      `Flächenbedarf ${tiefZahl(f.gesamt, 0)} m²`,
    ].forEach((t) => { svg += `<text x="${tx}" y="${ty}" class="t-mini">${t}</text>`; ty += 3.4; });
  }

  svg += tiefSchriftfeld(projekt,
    `Baustelleneinrichtung · ${flaechen.length} Fläche${flaechen.length === 1 ? "" : "n"} · `
    + `${krane.length} Kran${krane.length === 1 ? "" : "e"}`, "BE-Plan", `M 1:${nenner}`);
  svg += `<text x="${BLATT.randLinks}" y="${BLATT.hoehe - 4}" class="t-hinweis">`
    + "Keine Genehmigungsunterlage. Sicherheits- und Gesundheitsschutzplan nach BaustellV, "
    + "Verkehrszeichenplan, Ver- und Entsorgung sowie Brandschutz sind gesondert zu erstellen. "
    + "Standsicherheit und Gründung des Krans nach Angabe des Herstellers.</text>";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BLATT.breite} ${BLATT.hoehe}" width="100%" style="background:#fff">
<style>${TIEF_STIL}
  .be-bauwerk { fill: #cfd8de; stroke: #1b2733; stroke-width: 0.5; }
  .be-lager { fill: #e6ddc4; stroke: #8a7a4f; stroke-width: 0.35; }
  .be-container { fill: #cfe0ea; stroke: #1f6b8f; stroke-width: 0.35; }
  .be-zufahrt { fill: #ece9e4; stroke: #64707c; stroke-width: 0.3; stroke-dasharray: 3 1.5; }
  .be-misch { fill: #dfe6d8; stroke: #4f7d4f; stroke-width: 0.35; }
  .be-entsorgung { fill: #eddada; stroke: #b3392c; stroke-width: 0.35; }
  .be-zaun { fill: none; stroke: #b3392c; stroke-width: 0.4; stroke-dasharray: 4 1.5 1 1.5; }
  .be-kranbereich { fill: #1f6b8f; fill-opacity: 0.07; stroke: #1f6b8f; stroke-width: 0.3; stroke-dasharray: 3 2; }
  .be-kran { fill: #1f6b8f; }
  .be-ausleger { stroke: #1f6b8f; stroke-width: 0.5; }
  .nord { stroke: #1b2733; stroke-width: 0.5; }
  .nordspitze { fill: #1b2733; }
  .t-flaeche { font-size: 2.5px; text-anchor: middle; font-weight: 600;
               paint-order: stroke; stroke: #ffffff; stroke-width: 0.9; stroke-linejoin: round; }
  .t-flaeche-klein { font-size: 2.1px; text-anchor: middle;
               paint-order: stroke; stroke: #ffffff; stroke-width: 0.9; stroke-linejoin: round; }
  .t-kran { font-size: 2.6px; font-weight: 700; fill: #1f6b8f;
            paint-order: stroke; stroke: #ffffff; stroke-width: 1; stroke-linejoin: round; }
  .t-kran-klein { font-size: 2.1px; fill: #1f6b8f;
            paint-order: stroke; stroke: #ffffff; stroke-width: 1; stroke-linejoin: round; }
</style>
${svg}
</svg>`;
}

/**
 * Balkenplan (Gantt) mit kritischem Weg und Puffern.
 *
 * @param {Object} daten - { plan, start (Date), projekt }
 */
function balkenplanSVG(daten) {
  const { plan, projekt } = daten;
  const start = daten.start || new Date();
  const feldX = BLATT.randLinks + 58;
  const feldB = BLATT.breite - BLATT.randRechts - feldX - 2;
  const kopfY = BLATT.randOben + 10;
  // Die Zeilen füllen das Blatt, bleiben aber lesbar
  const zeilenHoehe = Math.min(12, Math.max(3.4,
    (BLATT.hoehe - kopfY - BLATT.randUnten - 40) / Math.max(1, plan.vorgaenge.length)));

  const tage = Math.max(1, plan.dauer);
  const mx = (t) => feldX + (t / tage) * feldB;

  let svg = tiefBlattKopf("Bauzeitenplan (Balkenplan)", projekt);

  // Zeitachse: Wochen
  const wochen = Math.ceil(tage / 5);
  for (let w = 0; w <= wochen; w++) {
    const x = mx(w * 5);
    if (x > feldX + feldB + 0.5) break;
    svg += `<line x1="${x.toFixed(2)}" y1="${(kopfY - 4).toFixed(2)}" x2="${x.toFixed(2)}" `
      + `y2="${(kopfY + plan.vorgaenge.length * zeilenHoehe + 2).toFixed(2)}" class="raster"/>`;
    if (w % (wochen > 20 ? 4 : wochen > 10 ? 2 : 1) === 0) {
      const d = bauTag(start, w * 5);
      svg += `<text x="${x.toFixed(2)}" y="${(kopfY - 5.5).toFixed(2)}" class="t-station">KW ${kalenderwoche(d)}</text>`;
      svg += `<text x="${x.toFixed(2)}" y="${(kopfY - 2).toFixed(2)}" class="t-mini" text-anchor="middle">`
        + `${bauDatum(d).slice(0, 6)}</text>`;
    }
  }

  // Vorgänge
  plan.vorgaenge.forEach((v, i) => {
    const y = kopfY + i * zeilenHoehe;
    const hoehe = Math.min(5, zeilenHoehe - 1.2);
    svg += `<text x="${BLATT.randLinks}" y="${(y + hoehe - 0.6).toFixed(2)}" class="t-vorgang">`
      + `${v.id} ${(v.name || "").slice(0, 34)}</text>`;
    // Gesamtpuffer als dünne Linie
    if (v.gp > 0) {
      svg += `<rect x="${mx(v.faz).toFixed(2)}" y="${(y + hoehe / 2 - 0.3).toFixed(2)}" `
        + `width="${(mx(v.saz + v.dauer) - mx(v.faz)).toFixed(2)}" height="0.6" class="puffer"/>`;
    }
    svg += `<rect x="${mx(v.faz).toFixed(2)}" y="${y.toFixed(2)}" `
      + `width="${Math.max(0.6, mx(v.fez) - mx(v.faz)).toFixed(2)}" height="${hoehe.toFixed(2)}" `
      + `class="${v.kritisch ? "balken-kritisch" : "balken"}"/>`;
    svg += `<text x="${(mx(v.fez) + 1.5).toFixed(2)}" y="${(y + hoehe - 0.6).toFixed(2)}" class="t-balken">`
      + `${v.dauer} T${v.gp > 0 ? ` · Puffer ${v.gp} T` : ""}</text>`;
  });

  // Tabelle unter dem Plan
  const tabY = kopfY + plan.vorgaenge.length * zeilenHoehe + 8;
  if (tabY < BLATT.hoehe - BLATT.randUnten - 34) {
    svg += `<text x="${BLATT.randLinks}" y="${tabY.toFixed(2)}" class="t-bandkopf">`
      + `Gesamtdauer ${plan.dauer} Arbeitstage · Beginn ${bauDatum(bauTag(start, 0))} · `
      + `Ende ${bauDatum(bauTag(start, plan.dauer))} · kritischer Weg: ${plan.kritischerWeg.join(" → ")}</text>`;
  }

  svg += tiefSchriftfeld(projekt,
    `Bauzeitenplan · ${plan.vorgaenge.length} Vorgänge · ${plan.dauer} Arbeitstage`,
    "Balkenplan", "Netzplan DIN 69900");
  svg += `<text x="${BLATT.randLinks}" y="${BLATT.hoehe - 4}" class="t-hinweis">`
    + "Vorwärts- und Rückwärtsrechnung nach DIN 69900; rot = kritischer Weg (Gesamtpuffer null), "
    + "dünne Linie = Gesamtpuffer. Nur Ende-Anfang-Beziehungen mit Abstand; Wochenenden sind "
    + "übersprungen, Feiertage und Betriebsferien nicht berücksichtigt.</text>";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BLATT.breite} ${BLATT.hoehe}" width="100%" style="background:#fff">
<style>${TIEF_STIL}
  .balken { fill: #4a7fa5; stroke: #1b2733; stroke-width: 0.2; }
  .balken-kritisch { fill: #b3392c; stroke: #1b2733; stroke-width: 0.2; }
  .puffer { fill: #8f9aa4; }
  .t-vorgang { font-size: 2.4px; }
  .t-balken { font-size: 2.1px; fill: #64707c; }
</style>
${svg}
</svg>`;
}

/** Kalenderwoche nach ISO 8601. */
function kalenderwoche(datum) {
  const d = new Date(Date.UTC(datum.getFullYear(), datum.getMonth(), datum.getDate()));
  const tag = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - tag);
  const jahresbeginn = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - jahresbeginn) / 86400000 + 1) / 7);
}
