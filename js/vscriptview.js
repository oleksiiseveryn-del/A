/**
 * Zeichenfläche des visuellen Skriptens.
 *
 * Der Graph wird als SVG gezeichnet: Knoten als Kästen mit Kopfleiste in
 * der Farbe ihrer Gruppe, Anschlüsse als Kreise an den Seiten,
 * Verbindungen als Kurven. Die Werte eines Knotens werden nicht im
 * Kasten bearbeitet, sondern in der Eigenschaftenleiste daneben – auf
 * dem Tablet ist ein Eingabefeld in einem verschiebbaren Kasten nicht zu
 * treffen, ein Feld in einer festen Leiste schon.
 *
 * Die Datei zeichnet und misst; sie ändert nichts. Das Verschieben,
 * Verbinden und Löschen führt die Steuerung.
 */

/** Maße der Darstellung in Zeichenflächen-Einheiten. */
const VS_MASS = {
  breite: 190, kopf: 24, zeile: 18, portR: 5.5,
  vorschau: 17, rand: 8, raster: 20,
};

/** Höhe eines Knotens aus der Zahl seiner Anschlüsse. */
function vsKnotenHoehe(def) {
  const zeilen = Math.max((def.eingaenge || []).length, (def.ausgaenge || []).length);
  return VS_MASS.kopf + zeilen * VS_MASS.zeile + VS_MASS.vorschau + VS_MASS.rand;
}

/**
 * Lage aller Knoten und Anschlüsse berechnen.
 *
 * @returns {Map} knotenId -> { x, y, w, h, def, eingaenge:[{id,x,y}], ausgaenge:[...] }
 */
function vsLayout(graph) {
  const lage = new Map();
  (graph.knoten || []).forEach((k) => {
    const def = VS_KNOTEN[k.typ];
    if (!def) return;
    const h = vsKnotenHoehe(def);
    const eingaenge = (def.eingaenge || []).map((e, i) => ({
      id: e.id, name: e.name, art: e.art, sammel: !!e.sammel,
      x: k.x, y: k.y + VS_MASS.kopf + i * VS_MASS.zeile + VS_MASS.zeile / 2,
    }));
    const ausgaenge = (def.ausgaenge || []).map((a, i) => ({
      id: a.id, name: a.name, art: a.art,
      x: k.x + VS_MASS.breite,
      y: k.y + VS_MASS.kopf + i * VS_MASS.zeile + VS_MASS.zeile / 2,
    }));
    lage.set(k.id, { knoten: k, def, x: k.x, y: k.y, w: VS_MASS.breite, h, eingaenge, ausgaenge });
  });
  return lage;
}

/** Umschließendes Rechteck aller Knoten. */
function vsGrenzen(lage) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  lage.forEach((l) => {
    minX = Math.min(minX, l.x); minY = Math.min(minY, l.y);
    maxX = Math.max(maxX, l.x + l.w); maxY = Math.max(maxY, l.y + l.h);
  });
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 400, maxY: 300 };
  return { minX, minY, maxX, maxY };
}

/** Was liegt an dieser Stelle? Anschlüsse haben Vorrang vor Kästen. */
function vsTreffer(lage, x, y, fangRadius) {
  const r = fangRadius || VS_MASS.portR * 2.2;
  let bester = null;
  lage.forEach((l, id) => {
    l.eingaenge.forEach((e) => {
      const d = Math.hypot(x - e.x, y - e.y);
      if (d <= r && (!bester || d < bester.d)) {
        bester = { art: "eingang", knoten: id, port: e.id, d };
      }
    });
    l.ausgaenge.forEach((a) => {
      const d = Math.hypot(x - a.x, y - a.y);
      if (d <= r && (!bester || d < bester.d)) {
        bester = { art: "ausgang", knoten: id, port: a.id, d };
      }
    });
  });
  if (bester) return bester;
  // Kästen von hinten nach vorn, damit der oberste zuerst kommt
  const ids = Array.from(lage.keys()).reverse();
  for (const id of ids) {
    const l = lage.get(id);
    if (x >= l.x && x <= l.x + l.w && y >= l.y && y <= l.y + l.h) {
      return { art: "knoten", knoten: id, kopf: y <= l.y + VS_MASS.kopf };
    }
  }
  return null;
}

/** Nächstliegende Verbindung zu einem Punkt – zum Löschen mit einem Tipp. */
function vsKanteTreffer(graph, lage, x, y, radius) {
  const r = radius || 8;
  let bester = null;
  (graph.kanten || []).forEach((k, i) => {
    const von = lage.get(k.vonKnoten), nach = lage.get(k.nachKnoten);
    if (!von || !nach) return;
    const a = von.ausgaenge.find((p) => p.id === k.vonAusgang);
    const b = nach.eingaenge.find((p) => p.id === k.nachEingang);
    if (!a || !b) return;
    // Die Kurve wird für die Prüfung in Abschnitte zerlegt
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const p = vsKurvePunkt(a, b, t);
      const d = Math.hypot(x - p.x, y - p.y);
      if (d <= r && (!bester || d < bester.d)) bester = { index: i, kante: k, d };
    }
  });
  return bester;
}

/** Punkt auf der Verbindungskurve (kubische Bézierkurve). */
function vsKurvePunkt(a, b, t) {
  const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5);
  const p0 = a, p1 = { x: a.x + dx, y: a.y }, p2 = { x: b.x - dx, y: b.y }, p3 = b;
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

function vsKurvePfad(a, b) {
  const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5);
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} C ${(a.x + dx).toFixed(1)} ${a.y.toFixed(1)}, `
    + `${(b.x - dx).toFixed(1)} ${b.y.toFixed(1)}, ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

/** Text kürzen, damit er im Kasten bleibt. */
function vsKurz(text, zeichen) {
  const t = String(text === undefined || text === null ? "" : text);
  return t.length > zeichen ? `${t.slice(0, zeichen - 1)}…` : t;
}

function vsEscape(text) {
  return String(text === undefined || text === null ? "" : text)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Kurze Zusammenfassung dessen, was ein Knoten liefert – die Zeile am
 * Fuß des Kastens. Sie macht den Datenfluss lesbar, ohne dass man jeden
 * Knoten anklicken muss.
 */
function vsVorschauText(id, def, ergebnis) {
  if (!ergebnis) return "nicht gerechnet";
  if (ergebnis.fehler.has(id)) return `Fehler: ${vsKurz(ergebnis.fehler.get(id), 26)}`;
  const erg = ergebnis.ergebnisse.get(id);
  if (!erg) return "kein Ergebnis";
  const erster = (def.ausgaenge || [])[0];
  if (!erster) {
    if (def.typKennung === "modell") return "";
    return "Ausgabe";
  }
  const liste = erg[erster.id] || [];
  if (!liste.length) return "leer";
  if (liste.length === 1) return vsKurz(vsWertText(liste[0]), 26);
  return `${liste.length} Werte · ${vsKurz(vsWertText(liste[0]), 14)} …`;
}

/**
 * Den Graphen als SVG zeichnen.
 *
 * @param {Object} graph
 * @param {Object} zustand - { auswahl, ziehVon, ziehZu, sicht: {x,y,zoom} }
 * @param {Object} ergebnis - Rückgabe von vsAuswerten (darf fehlen)
 */
function vsGraphSVG(graph, zustand, ergebnis, breite, hoehe) {
  const z = zustand || {};
  const sicht = z.sicht || { x: 0, y: 0, zoom: 1 };
  const lage = vsLayout(graph);
  let svg = "";

  // Raster als Orientierung
  const r = VS_MASS.raster;
  svg += `<defs><pattern id="vsRaster" width="${r}" height="${r}" patternUnits="userSpaceOnUse">`
    + `<circle cx="0.5" cy="0.5" r="0.5" class="vs-rasterpunkt"/></pattern></defs>`;
  const w = breite / sicht.zoom, h = hoehe / sicht.zoom;
  svg += `<rect x="${sicht.x}" y="${sicht.y}" width="${w}" height="${h}" fill="url(#vsRaster)"/>`;

  // Verbindungen zuerst, damit die Kästen darüber liegen
  (graph.kanten || []).forEach((k, i) => {
    const von = lage.get(k.vonKnoten), nach = lage.get(k.nachKnoten);
    if (!von || !nach) return;
    const a = von.ausgaenge.find((p) => p.id === k.vonAusgang);
    const b = nach.eingaenge.find((p) => p.id === k.nachEingang);
    if (!a || !b) return;
    const hervor = z.kanteHervor === i;
    svg += `<path d="${vsKurvePfad(a, b)}" class="vs-kante${hervor ? " vs-kante-hervor" : ""} `
      + `vs-art-${a.art}" data-kante="${i}"/>`;
  });

  // Verbindung, die gerade gezogen wird
  if (z.ziehVon && z.ziehZu) {
    svg += `<path d="${vsKurvePfad(z.ziehVon, z.ziehZu)}" class="vs-kante vs-kante-zieh"/>`;
  }

  // Knoten
  (graph.knoten || []).forEach((k) => {
    const l = lage.get(k.id);
    if (!l) return;
    const gr = VS_GRUPPEN[l.def.gruppe] || VS_GRUPPEN.rechnen;
    const gewaehlt = z.auswahl === k.id;
    const hatFehler = ergebnis && ergebnis.fehler.has(k.id);
    svg += `<g data-knoten="${vsEscape(k.id)}">`;
    svg += `<rect x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" rx="4" `
      + `class="vs-kasten${gewaehlt ? " vs-gewaehlt" : ""}${hatFehler ? " vs-fehler" : ""}"/>`;
    svg += `<path d="M ${l.x} ${l.y + 4} a 4 4 0 0 1 4 -4 h ${l.w - 8} a 4 4 0 0 1 4 4 `
      + `v ${VS_MASS.kopf - 4} h ${-l.w} z" fill="${gr.farbe}"/>`;
    svg += `<text x="${l.x + 8}" y="${l.y + 16}" class="vs-titel">`
      + `${vsEscape(vsKurz(l.def.name, 24))}</text>`;

    l.eingaenge.forEach((e) => {
      svg += `<circle cx="${e.x}" cy="${e.y}" r="${VS_MASS.portR}" `
        + `class="vs-port vs-art-${e.art}${e.sammel ? " vs-sammel" : ""}" `
        + `data-eingang="${vsEscape(e.id)}"/>`;
      svg += `<text x="${e.x + 10}" y="${e.y + 3.5}" class="vs-portname">`
        + `${vsEscape(vsKurz(e.name, 13))}</text>`;
    });
    l.ausgaenge.forEach((a) => {
      svg += `<circle cx="${a.x}" cy="${a.y}" r="${VS_MASS.portR}" `
        + `class="vs-port vs-art-${a.art}" data-ausgang="${vsEscape(a.id)}"/>`;
      svg += `<text x="${a.x - 10}" y="${a.y + 3.5}" class="vs-portname" `
        + `text-anchor="end">${vsEscape(vsKurz(a.name, 13))}</text>`;
    });

    const text = vsVorschauText(k.id, l.def, ergebnis);
    svg += `<text x="${l.x + 8}" y="${l.y + l.h - 6}" `
      + `class="vs-vorschau${hatFehler ? " vs-vorschau-fehler" : ""}">${vsEscape(text)}</text>`;
    svg += `</g>`;
  });

  const vb = `${sicht.x} ${sicht.y} ${w} ${h}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" `
    + `width="100%" height="100%" preserveAspectRatio="xMidYMid meet" class="vs-flaeche">${svg}</svg>`;
}

/**
 * Vorschau der erzeugten Geometrie.
 *
 * Gezeigt wird, was der Graph gerade liefert – bevor irgendetwas ins
 * Modell übernommen wird. Die Ebene wird nach der Ausdehnung gewählt:
 * Ein Stützenraster liegt im Grundriss (x–z), ein Fachwerkbinder in der
 * Ansicht (x–Höhe). Läge er immer im Grundriss, wäre ein Binder nur ein
 * Strich – die Vorschau soll zeigen, was da ist.
 */
function vsVorschauSVG(ergebnis, breite, hoehe) {
  const punkte = (ergebnis && ergebnis.punkte) || [];
  const linien = (ergebnis && ergebnis.linien) || [];
  if (!punkte.length && !linien.length) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${breite} ${hoehe}" `
      + `width="100%" class="vs-vorschauflaeche"><text x="${breite / 2}" y="${hoehe / 2}" `
      + `class="vs-leer" text-anchor="middle">Noch keine Geometrie</text></svg>`;
  }
  // Ausdehnung in allen drei Richtungen bestimmen
  const g = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity,
    minZ: Infinity, maxZ: -Infinity };
  const nimm = (p) => {
    if (!p) return;
    g.minX = Math.min(g.minX, p.x); g.maxX = Math.max(g.maxX, p.x);
    g.minY = Math.min(g.minY, p.y); g.maxY = Math.max(g.maxY, p.y);
    g.minZ = Math.min(g.minZ, p.z); g.maxZ = Math.max(g.maxZ, p.z);
  };
  punkte.forEach(nimm);
  linien.forEach((l) => { nimm(l.a); nimm(l.b); });
  const dx = g.maxX - g.minX, dy = g.maxY - g.minY, dz = g.maxZ - g.minZ;

  /* Ebene wählen: Grundriss, solange die Höhenausdehnung nicht deutlich
     größer ist als die in z. Sonst Ansicht. */
  const ansicht = dy > Math.max(dz, dx * 0.02) && dy > 1e-6;
  const zweite = (p) => (ansicht ? p.y : p.z);
  const spanA = Math.max(0.001, dx);
  const spanB = Math.max(0.001, ansicht ? dy : dz);
  const minA = g.minX, minB = ansicht ? g.minY : g.minZ;

  const rand = 12, unten = 14;
  const s = Math.min((breite - 2 * rand) / spanA, (hoehe - rand - unten) / spanB);
  const px = (x) => rand + (x - minA) * s + ((breite - 2 * rand) - spanA * s) / 2;
  // beide Ebenen wachsen nach oben; auf dem Blatt also nach oben auftragen
  const py = (w) => hoehe - unten - (w - minB) * s
    - ((hoehe - rand - unten) - spanB * s) / 2;

  let svg = "";
  linien.forEach((l) => {
    if (!l.a || !l.b) return;
    svg += `<line x1="${px(l.a.x).toFixed(1)}" y1="${py(zweite(l.a)).toFixed(1)}" `
      + `x2="${px(l.b.x).toFixed(1)}" y2="${py(zweite(l.b)).toFixed(1)}" `
      + `class="vs-v-linie${l.bauteil ? ` vs-v-${l.bauteil}` : ""}"/>`;
  });
  punkte.forEach((p) => {
    svg += `<circle cx="${px(p.x).toFixed(1)}" cy="${py(zweite(p)).toFixed(1)}" `
      + `r="2" class="vs-v-punkt"/>`;
  });
  svg += `<text x="${rand}" y="${hoehe - 3}" class="vs-v-mass">`
    + `${ansicht ? "Ansicht" : "Grundriss"} · ${vsZahl(spanA, 1)} × ${vsZahl(spanB, 1)} m · `
    + `${punkte.length} Punkte · ${linien.length} Linien</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${breite} ${hoehe}" `
    + `width="100%" class="vs-vorschauflaeche">${svg}</svg>`;
}

/** Knoten so anordnen, dass sie sich nicht überdecken (nach Ebenen). */
function vsAnordnen(graph) {
  const ergebnis = vsAuswerten(graph);
  const ebene = new Map();
  (graph.knoten || []).forEach((k) => ebene.set(k.id, 0));
  // Ebene eines Knotens: eins mehr als die höchste Ebene seiner Quellen
  ergebnis.reihenfolge.forEach((id) => {
    (graph.kanten || []).forEach((k) => {
      if (k.nachKnoten !== id) return;
      ebene.set(id, Math.max(ebene.get(id) || 0, (ebene.get(k.vonKnoten) || 0) + 1));
    });
  });
  const jeEbene = new Map();
  (graph.knoten || []).forEach((k) => {
    const e = ebene.get(k.id) || 0;
    if (!jeEbene.has(e)) jeEbene.set(e, []);
    jeEbene.get(e).push(k);
  });
  const spalte = VS_MASS.breite + 70;
  jeEbene.forEach((liste, e) => {
    let y = 20;
    liste.forEach((k) => {
      k.x = 20 + e * spalte;
      k.y = y;
      y += vsKnotenHoehe(VS_KNOTEN[k.typ] || { eingaenge: [], ausgaenge: [] }) + 24;
    });
  });
  return graph;
}
