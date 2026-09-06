/**
 * Digitales Geländemodell (DGM) als Dreiecksvermaschung.
 *
 * Aus Höhenpunkten entsteht ein Netz aus Dreiecken – ein TIN
 * (triangulated irregular network). Auf ihm lassen sich Höhen
 * zwischenrechnen, Höhenlinien ziehen, Neigungen bestimmen und Massen
 * gegen eine geplante Fläche ermitteln.
 *
 * Vermaschung nach Delaunay (Verfahren von Bowyer und Watson): Ein neuer
 * Punkt löscht alle Dreiecke, in deren Umkreis er liegt, und wird mit dem
 * Rand des entstandenen Lochs neu vermascht. Das Ergebnis erfüllt die
 * Umkreisbedingung – kein Punkt liegt im Umkreis eines fremden Dreiecks –
 * und liefert damit die gleichmäßigsten Dreiecke, die aus den gegebenen
 * Punkten zu bilden sind. Genau das will man im Gelände: keine langen
 * Splitter, die zwischen zwei weit entfernten Punkten interpolieren.
 *
 * Höhe zwischen den Punkten: baryzentrische Interpolation im Dreieck.
 * Über einer ebenen Fläche gibt das die Ebene exakt wieder.
 *
 * Höhenlinien: In jedem Dreieck ist die Höhe linear; eine Höhenlinie
 * schneidet es daher in einer Strecke. Die Strecken werden an ihren
 * Endpunkten zu Linienzügen verkettet (Verfahren der marschierenden
 * Dreiecke).
 *
 * Massen gegen eine geplante Ebene: Über jedem Dreieck steht ein Prisma
 * mit dreieckiger Grundfläche; sein Rauminhalt ist Grundfläche mal
 * mittlere Höhendifferenz. Wechselt die Differenz innerhalb des Dreiecks
 * das Vorzeichen, wird das Dreieck an der Nulllinie geteilt, damit Abtrag
 * und Auftrag getrennt bleiben. Für eine Ebene ist das Ergebnis genau.
 *
 * NICHT enthalten: Bruchkanten (constrained edges) – Böschungsoberkanten,
 * Mauern und Gräben werden nicht als Zwangslinien geführt, sondern nur
 * über die Dichte der Punkte abgebildet; Aussparungen und Löcher im Netz;
 * Ausdünnung nach Genauigkeitsvorgabe; Geländeausrundung. Die Genauigkeit
 * des Modells ist die Genauigkeit der Aufnahme (DIN 18710-1); ein DGM aus
 * wenigen Punkten ersetzt kein Aufmaß.
 */

/** Kleinste Fläche, ab der ein Dreieck als gültig gilt [m²]. */
const DGM_MINDESTFLAECHE = 1e-9;

/** Zahl mit Dezimalkomma. */
function dgmZahl(wert, stellen) {
  return Number(wert).toFixed(stellen === undefined ? 2 : stellen).replace(".", ",");
}

/**
 * Delaunay-Vermaschung nach Bowyer und Watson.
 *
 * @param {Array} punkte - [{ x, y, z }] in der Lage (x = Rechts, y = Hoch)
 * @param {Object} optionen - { toleranz } Mindestabstand zweier Punkte in der Lage
 * @returns {Object} { punkte, dreiecke: [[i,j,k]], grenzen, doppelte }
 */
function dgmVermaschen(punkte, optionen) {
  const toleranz = (optionen && optionen.toleranz) || 0.001;
  // Doppelte Punkte in der Lage entfernen: sie machen den Umkreis unbestimmt
  const gitter = new Map();
  const p = [];
  let doppelte = 0;
  punkte.forEach((q) => {
    const schluessel = `${Math.round(q.x / toleranz)}|${Math.round(q.y / toleranz)}`;
    if (gitter.has(schluessel)) { doppelte += 1; return; }
    gitter.set(schluessel, true);
    p.push({ x: q.x, y: q.y, z: q.z, nummer: q.nummer, art: q.art });
  });
  if (p.length < 3) return { punkte: p, dreiecke: [], grenzen: null, doppelte };

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  p.forEach((q) => {
    minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x);
    minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y);
    minZ = Math.min(minZ, q.z); maxZ = Math.max(maxZ, q.z);
  });

  // Hilfsdreieck, das alle Punkte umschließt; seine Ecken werden am Ende entfernt
  const dx = maxX - minX || 1, dy = maxY - minY || 1;
  const mitteX = (minX + maxX) / 2, mitteY = (minY + maxY) / 2;
  /**
   * Das Hilfsdreieck muss weit außen liegen: Reicht es nur wenig über die
   * Punkte hinaus, so enthalten die Umkreise seiner Dreiecke noch Punkte
   * am Rand des Gebietes. Beim Einfügen eines solchen Punktes wird dann
   * eine Randkante mit weggenommen, und nach dem Entfernen des
   * Hilfsdreiecks fehlt dort ein flaches Dreieck – das Netz hat ein Loch
   * entlang der Hülle. Mit dem Tausendfachen der Ausdehnung tritt das
   * nicht mehr auf; noch weiter draußen verliert die Umkreisrechnung an
   * Genauigkeit und Punkte auf einem gemeinsamen Kreis (Raster!) werden
   * falsch vermascht.
   */
  const gross = 1000 * Math.max(dx, dy);
  const arbeit = p.slice();
  const h0 = arbeit.length;
  arbeit.push({ x: mitteX - gross, y: mitteY - gross, z: 0, hilfs: true });
  arbeit.push({ x: mitteX + gross, y: mitteY - gross, z: 0, hilfs: true });
  arbeit.push({ x: mitteX, y: mitteY + gross, z: 0, hilfs: true });

  /** Umkreis eines Dreiecks; null bei entarteten Dreiecken. */
  const umkreis = (a, b, c) => {
    const ax = a.x, ay = a.y, bx = b.x, by = b.y, cx = c.x, cy = c.y;
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(d) < 1e-14) return null;
    const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
    const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
    const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
    const r2 = (ux - ax) * (ux - ax) + (uy - ay) * (uy - ay);
    return { x: ux, y: uy, r2 };
  };

  let dreiecke = [{ i: h0, j: h0 + 1, k: h0 + 2, u: umkreis(arbeit[h0], arbeit[h0 + 1], arbeit[h0 + 2]) }];

  /** Liegt der Punkt im Dreieck? (einschließlich Rand) */
  const imDreieck = (t, q) => {
    const a = arbeit[t.i], b = arbeit[t.j], c = arbeit[t.k];
    const d1 = (b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x);
    const d2 = (c.x - b.x) * (q.y - b.y) - (c.y - b.y) * (q.x - b.x);
    const d3 = (a.x - c.x) * (q.y - c.y) - (a.y - c.y) * (q.x - c.x);
    const negativ = d1 < -1e-12 || d2 < -1e-12 || d3 < -1e-12;
    const positiv = d1 > 1e-12 || d2 > 1e-12 || d3 > 1e-12;
    return !(negativ && positiv);
  };

  for (let n = 0; n < h0; n++) {
    const q = arbeit[n];
    const verdaechtig = [];
    const behalten = [];
    dreiecke.forEach((t) => {
      const abstand2 = t.u
        ? (q.x - t.u.x) * (q.x - t.u.x) + (q.y - t.u.y) * (q.y - t.u.y) - t.u.r2
        : Infinity;
      if (abstand2 <= 1e-9 * (t.u ? t.u.r2 : 1)) { t.tiefe = abstand2; verdaechtig.push(t); }
      else behalten.push(t);
    });
    if (!verdaechtig.length) continue;

    /**
     * Der Hohlraum muss zusammenhängen und den Punkt umschließen.
     *
     * Der Umkreistest allein kann durch Rundung ein weit entferntes
     * Dreieck mit erfassen, das den Hohlraum nicht berührt. Aus dem
     * Rand entstünde dann ein zweiter, getrennter Ring – und beim
     * Neuvermaschen ein Loch im Netz. Deshalb wächst der Hohlraum vom
     * Dreieck aus, in dem der Punkt liegt, über gemeinsame Kanten.
     */
    let start = verdaechtig.find((t) => imDreieck(t, q));
    if (!start) start = verdaechtig.reduce((a, b) => (b.tiefe < a.tiefe ? b : a), verdaechtig[0]);

    const kantenKarte = new Map();
    verdaechtig.forEach((t, index) => {
      [[t.i, t.j], [t.j, t.k], [t.k, t.i]].forEach(([a, b]) => {
        const k = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (!kantenKarte.has(k)) kantenKarte.set(k, []);
        kantenKarte.get(k).push(index);
      });
    });
    const imHohlraum = new Set([verdaechtig.indexOf(start)]);
    const stapel = [verdaechtig.indexOf(start)];
    while (stapel.length) {
      const index = stapel.pop();
      const t = verdaechtig[index];
      [[t.i, t.j], [t.j, t.k], [t.k, t.i]].forEach(([a, b]) => {
        const k = a < b ? `${a}|${b}` : `${b}|${a}`;
        (kantenKarte.get(k) || []).forEach((nachbar) => {
          if (!imHohlraum.has(nachbar)) { imHohlraum.add(nachbar); stapel.push(nachbar); }
        });
      });
    }
    const schlecht = [];
    verdaechtig.forEach((t, index) => {
      if (imHohlraum.has(index)) schlecht.push(t); else behalten.push(t);
    });

    // Rand des Lochs: alle Kanten, die nur einmal vorkommen
    const kanten = new Map();
    schlecht.forEach((t) => {
      [[t.i, t.j], [t.j, t.k], [t.k, t.i]].forEach(([a, b]) => {
        const schluessel = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (kanten.has(schluessel)) kanten.delete(schluessel);
        else kanten.set(schluessel, [a, b]);
      });
    });

    dreiecke = behalten;
    kanten.forEach(([a, b]) => {
      const u = umkreis(arbeit[a], arbeit[b], q);
      if (u) dreiecke.push({ i: a, j: b, k: n, u });
    });
  }

  // Hilfsdreieck entfernen und Dreiecke gegen den Uhrzeigersinn ordnen
  const raus = [];
  dreiecke.forEach((t) => {
    if (t.i >= h0 || t.j >= h0 || t.k >= h0) return;
    const a = p[t.i], b = p[t.j], c = p[t.k];
    const flaeche2 = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
    if (Math.abs(flaeche2) < DGM_MINDESTFLAECHE) return;
    raus.push(flaeche2 > 0 ? [t.i, t.j, t.k] : [t.i, t.k, t.j]);
  });

  return {
    punkte: p,
    dreiecke: raus,
    doppelte,
    grenzen: { minX, maxX, minY, maxY, minZ, maxZ },
  };
}

/** Fläche eines Dreiecks im Grundriss. */
function dgmDreieckFlaeche(a, b, c) {
  return Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
}

/**
 * Kennwerte des Modells: Flächen, Höhen, Neigungen.
 *
 * Die Neigung eines Dreiecks folgt aus seiner Flächennormalen; ausgegeben
 * werden Gefälle in Prozent und die Fallrichtung (Exposition) in Grad,
 * von Nord im Uhrzeigersinn.
 */
function dgmKennwerte(dgm) {
  if (!dgm.dreiecke.length) return null;
  let flaecheGrundriss = 0, flaecheGelaende = 0;
  let neigungMax = 0, summeGewichtet = 0, schlanke = 0;
  dgm.dreiecke.forEach((t) => {
    const a = dgm.punkte[t[0]], b = dgm.punkte[t[1]], c = dgm.punkte[t[2]];
    const A = dgmDreieckFlaeche(a, b, c);
    flaecheGrundriss += A;
    // Normale des Dreiecks
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const laenge = Math.hypot(nx, ny, nz);
    flaecheGelaende += laenge / 2;
    const gefaelle = nz !== 0 ? Math.hypot(nx, ny) / Math.abs(nz) : 0;
    // Die mittlere Neigung wird mit der Fläche gewichtet: Ein Splitter am
    // Rand darf den Mittelwert nicht bestimmen.
    summeGewichtet += gefaelle * A;
    // Schlanke Dreiecke (Splitter) entstehen an der Hülle zwischen fast
    // auf einer Geraden liegenden Punkten. Ihre Neigung ist rechnerisch
    // groß, aber ohne Aussage; sie bleiben beim Größtwert außen vor.
    const laengsteKante2 = Math.max(
      (b.x - a.x) ** 2 + (b.y - a.y) ** 2,
      (c.x - b.x) ** 2 + (c.y - b.y) ** 2,
      (a.x - c.x) ** 2 + (a.y - c.y) ** 2);
    if (A < 0.02 * laengsteKante2) { schlanke += 1; return; }
    if (gefaelle > neigungMax) neigungMax = gefaelle;
  });
  const mittel = flaecheGrundriss > 0 ? summeGewichtet / flaecheGrundriss : 0;
  return {
    punkte: dgm.punkte.length,
    dreiecke: dgm.dreiecke.length,
    flaecheGrundriss, flaecheGelaende,
    neigungMittel: mittel * 100,
    neigungMax: neigungMax * 100,
    schlankeDreiecke: schlanke,
    hoeheMin: dgm.grenzen.minZ, hoeheMax: dgm.grenzen.maxZ,
    breite: dgm.grenzen.maxX - dgm.grenzen.minX,
    tiefe: dgm.grenzen.maxY - dgm.grenzen.minY,
  };
}

/** Baryzentrische Koordinaten eines Punktes im Dreieck. */
function dgmBary(a, b, c, x, y) {
  const d = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
  if (Math.abs(d) < 1e-14) return null;
  const l1 = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / d;
  const l2 = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / d;
  return { l1, l2, l3: 1 - l1 - l2 };
}

/**
 * Höhe des Geländes an einer Stelle.
 * @returns {number|null} Höhe, oder null außerhalb des Modells
 */
function dgmHoehe(dgm, x, y) {
  const rand = -1e-9;
  for (let t = 0; t < dgm.dreiecke.length; t++) {
    const d = dgm.dreiecke[t];
    const a = dgm.punkte[d[0]], b = dgm.punkte[d[1]], c = dgm.punkte[d[2]];
    if (x < Math.min(a.x, b.x, c.x) || x > Math.max(a.x, b.x, c.x)) continue;
    if (y < Math.min(a.y, b.y, c.y) || y > Math.max(a.y, b.y, c.y)) continue;
    const l = dgmBary(a, b, c, x, y);
    if (!l || l.l1 < rand || l.l2 < rand || l.l3 < rand) continue;
    return l.l1 * a.z + l.l2 * b.z + l.l3 * c.z;
  }
  return null;
}

/**
 * Höhenlinien (Isolinien) nach dem Verfahren der marschierenden Dreiecke.
 *
 * @param {Object} dgm
 * @param {number} aequidistanz - Höhenabstand der Linien [m]
 * @param {Object} optionen - { bezug } Höhe, auf die das Raster bezogen wird
 * @returns {Array} [{ hoehe, zuege: [[{x,y}, …], …] }]
 */
function dgmHoehenlinien(dgm, aequidistanz, optionen) {
  const e = aequidistanz > 0 ? aequidistanz : 1;
  const bezug = (optionen && optionen.bezug) || 0;
  const von = Math.ceil((dgm.grenzen.minZ - bezug) / e) * e + bezug;
  const bis = dgm.grenzen.maxZ;
  const linien = [];

  for (let h = von; h <= bis + 1e-9; h += e) {
    const strecken = [];
    dgm.dreiecke.forEach((t) => {
      const ecken = [dgm.punkte[t[0]], dgm.punkte[t[1]], dgm.punkte[t[2]]];
      const schnitt = [];
      for (let i = 0; i < 3; i++) {
        const a = ecken[i], b = ecken[(i + 1) % 3];
        const da = a.z - h, db = b.z - h;
        if ((da > 0 && db > 0) || (da < 0 && db < 0)) continue;
        if (Math.abs(da) < 1e-12 && Math.abs(db) < 1e-12) continue;   // Kante liegt in der Höhe
        if (Math.abs(da - db) < 1e-12) continue;
        const s = da / (da - db);
        if (s < -1e-9 || s > 1 + 1e-9) continue;
        schnitt.push({ x: a.x + s * (b.x - a.x), y: a.y + s * (b.y - a.y) });
      }
      if (schnitt.length >= 2) {
        const l = Math.hypot(schnitt[1].x - schnitt[0].x, schnitt[1].y - schnitt[0].y);
        if (l > 1e-9) strecken.push([schnitt[0], schnitt[1]]);
      }
    });
    if (!strecken.length) continue;
    linien.push({ hoehe: h, zuege: dgmStreckenVerketten(strecken) });
  }
  return linien;
}

/** Einzelne Strecken an ihren Endpunkten zu Linienzügen verketten. */
function dgmStreckenVerketten(strecken, toleranz) {
  const t = toleranz || 1e-6;
  const schluessel = (p) => `${Math.round(p.x / t)}|${Math.round(p.y / t)}`;
  const offen = new Map();
  strecken.forEach((s, i) => {
    [[schluessel(s[0]), i], [schluessel(s[1]), i]].forEach(([k, nummer]) => {
      if (!offen.has(k)) offen.set(k, []);
      offen.get(k).push(nummer);
    });
  });

  const benutzt = new Array(strecken.length).fill(false);
  const zuege = [];
  for (let i = 0; i < strecken.length; i++) {
    if (benutzt[i]) continue;
    benutzt[i] = true;
    const zug = [strecken[i][0], strecken[i][1]];

    // an beiden Enden weitersuchen
    [1, 0].forEach((richtung) => {
      let weiter = true;
      while (weiter) {
        weiter = false;
        const ende = richtung ? zug[zug.length - 1] : zug[0];
        const kandidaten = offen.get(schluessel(ende)) || [];
        for (const k of kandidaten) {
          if (benutzt[k]) continue;
          const s = strecken[k];
          const anA = schluessel(s[0]) === schluessel(ende);
          const naechster = anA ? s[1] : s[0];
          if (!anA && schluessel(s[1]) !== schluessel(ende)) continue;
          benutzt[k] = true;
          if (richtung) zug.push(naechster); else zug.unshift(naechster);
          weiter = true;
          break;
        }
      }
    });
    zuege.push(zug);
  }
  return zuege;
}

/**
 * Rauminhalt zwischen Gelände und einer waagerechten Ebene.
 *
 * Über jedem Dreieck steht ein Prisma; sein Rauminhalt ist die
 * Grundfläche mal der mittleren Höhendifferenz seiner drei Ecken.
 * Wechselt die Differenz das Vorzeichen, wird das Dreieck an der
 * Nulllinie geteilt. Für eine Ebene ist das Ergebnis genau.
 *
 * @returns {Object} { abtrag, auftrag, netto, flaecheAbtrag, flaecheAuftrag }
 */
function dgmVolumenGegenEbene(dgm, hoehe) {
  let abtrag = 0, auftrag = 0, flaecheAbtrag = 0, flaecheAuftrag = 0;

  const teil = (ecken) => {
    // ecken: [{x, y, d}] mit d = Gelände − Ebene
    const A = dgmDreieckFlaeche(ecken[0], ecken[1], ecken[2]);
    const mittel = (ecken[0].d + ecken[1].d + ecken[2].d) / 3;
    if (mittel >= 0) { abtrag += A * mittel; flaecheAbtrag += A; }
    else { auftrag += A * -mittel; flaecheAuftrag += A; }
  };

  dgm.dreiecke.forEach((t) => {
    const e = [dgm.punkte[t[0]], dgm.punkte[t[1]], dgm.punkte[t[2]]]
      .map((p) => ({ x: p.x, y: p.y, d: p.z - hoehe }));
    const positiv = e.filter((p) => p.d > 0).length;
    const negativ = e.filter((p) => p.d < 0).length;

    if (positiv === 0 || negativ === 0) { teil(e); return; }

    // Das Dreieck wird von der Nulllinie geschnitten: eine Ecke liegt
    // allein auf ihrer Seite, die Nulllinie schneidet die beiden Kanten
    // zu den anderen Ecken.
    const allein = e.findIndex((p, i) => {
      const andere = e.filter((_, j) => j !== i);
      return (p.d > 0 && andere.every((q) => q.d <= 0)) || (p.d < 0 && andere.every((q) => q.d >= 0));
    });
    if (allein < 0) { teil(e); return; }
    const A0 = e[allein], A1 = e[(allein + 1) % 3], A2 = e[(allein + 2) % 3];
    const schnitt = (p, q) => {
      const s = p.d / (p.d - q.d);
      return { x: p.x + s * (q.x - p.x), y: p.y + s * (q.y - p.y), d: 0 };
    };
    const S1 = schnitt(A0, A1), S2 = schnitt(A0, A2);
    teil([A0, S1, S2]);          // Dreieck an der einzelnen Ecke
    teil([S1, A1, A2]);          // Viereck als zwei Dreiecke
    teil([S1, A2, S2]);
  });

  return {
    abtrag, auftrag, netto: abtrag - auftrag,
    flaecheAbtrag, flaecheAuftrag,
  };
}

/**
 * Rauminhalt zwischen zwei Geländemodellen über ein Raster.
 *
 * Zwei Dreiecksnetze haben verschiedene Kanten; ihre Differenz ist über
 * einem Dreieck nicht mehr linear. Deshalb wird hier über ein Raster
 * gerechnet: In jeder Zelle wird die Differenz in der Zellmitte gebildet
 * und mit der Zellfläche multipliziert. Das Ergebnis nähert sich mit
 * kleinerer Zellweite dem wahren Wert; die Zellweite gehört deshalb in
 * jede Angabe des Ergebnisses.
 */
function dgmVolumenRaster(dgmOben, dgmUnten, weite) {
  const w = weite > 0 ? weite : 1;
  const g = dgmOben.grenzen;
  const zelle = w * w;
  let abtrag = 0, auftrag = 0, zellen = 0, ohne = 0;
  for (let x = g.minX + w / 2; x < g.maxX; x += w) {
    for (let y = g.minY + w / 2; y < g.maxY; y += w) {
      const zo = dgmHoehe(dgmOben, x, y);
      const zu = dgmHoehe(dgmUnten, x, y);
      if (zo === null || zu === null) { ohne += 1; continue; }
      zellen += 1;
      const d = zo - zu;
      if (d >= 0) abtrag += d * zelle; else auftrag += -d * zelle;
    }
  }
  return { abtrag, auftrag, netto: abtrag - auftrag, zellen, ohne, weite: w };
}

/**
 * Geländeschnitt entlang einer Geraden – die Grundlage der Querprofile.
 *
 * @param {Object} dgm
 * @param {Object} von - { x, y } Anfangspunkt
 * @param {Object} richtung - { x, y } Einheitsvektor
 * @param {number} vonOffset - Anfang der Aufnahme, bezogen auf „von"
 * @param {number} bisOffset - Ende
 * @param {number} schritt - Abstand der Stützstellen
 * @returns {Array} [{ x: Abstand vom Anfangspunkt, z: Höhe }]
 */
function dgmSchnitt(dgm, von, richtung, vonOffset, bisOffset, schritt) {
  const s = schritt > 0 ? schritt : 0.5;
  const punkte = [];
  for (let t = vonOffset; t <= bisOffset + 1e-9; t += s) {
    const h = dgmHoehe(dgm, von.x + richtung.x * t, von.y + richtung.y * t);
    if (h !== null) punkte.push({ x: t, z: h });
  }
  return punkte;
}

/**
 * Bodenpunkte aus einer Punktwolke: je Rasterzelle der tiefste Punkt.
 *
 * Das ist der einfachste Bodenfilter und für offenes Gelände brauchbar.
 * Er versagt unter Bewuchs und an Bauwerken, wo der tiefste Punkt einer
 * Zelle nicht der Boden ist, und er hält Ausreißer nach unten (Mehrwege,
 * Wasserflächen) nicht zurück. Verfahren wie die fortschreitende
 * Verdichtung der Dreiecke (progressive TIN densification) sind NICHT
 * enthalten – für eine Abrechnung ist eine geprüfte Bodenpunktwolke aus
 * der Auswertesoftware zu verwenden.
 *
 * @param {Object} wolke - Punktwolke aus js/pointcloud.js (Modellachsen)
 * @param {number} weite - Rasterweite [m]
 * @returns {Array} [{ x, y, z }] in Lagekoordinaten (x = Rechts, y = Hoch)
 */
function dgmBodenpunkte(wolke, weite) {
  const w = weite > 0 ? weite : 2;
  const zellen = new Map();
  for (let i = 0; i < wolke.anzahl; i++) {
    // Modell: x, Höhe y, Nord z  ->  Lage: x = Rechts, y = Hoch, z = Höhe
    const x = wolke.xyz[i * 3];
    const hoehe = wolke.xyz[i * 3 + 1];
    const y = wolke.xyz[i * 3 + 2];
    const schluessel = `${Math.floor(x / w)}|${Math.floor(y / w)}`;
    const vorhanden = zellen.get(schluessel);
    if (!vorhanden || hoehe < vorhanden.z) zellen.set(schluessel, { x, y, z: hoehe });
  }
  return Array.from(zellen.values());
}

/**
 * Höhenpunkte aus einer Textdatei lesen.
 *
 * Erwartet wird das Format der Vermessung: je Zeile ein Punkt mit
 * Punktnummer, Rechtswert, Hochwert, Höhe und wahlweise einem Code.
 * Fehlt die Punktnummer, werden drei Spalten als Rechts, Hoch, Höhe
 * gelesen. Trennzeichen sind Leerzeichen, Tabulator, Komma oder
 * Strichpunkt; das Dezimalzeichen ist der Punkt.
 */
function dgmPunkteAusText(text) {
  const zeilen = String(text).split(/\r?\n/);
  const punkte = [];
  let uebergangen = 0;
  zeilen.forEach((zeile) => {
    const z = zeile.trim();
    if (!z || z.startsWith("#") || z.startsWith("//")) return;
    const teile = z.split(/[;,\t ]+/).filter((x) => x !== "");
    if (teile.length < 3) { uebergangen += 1; return; }
    let nummer = null, werte;
    if (teile.length >= 4 && Number.isNaN(parseFloat(teile[3])) === false) {
      // vier Zahlen: Nummer, Rechts, Hoch, Höhe
      nummer = teile[0];
      werte = [parseFloat(teile[1]), parseFloat(teile[2]), parseFloat(teile[3])];
    } else {
      werte = [parseFloat(teile[0]), parseFloat(teile[1]), parseFloat(teile[2])];
    }
    if (werte.some((w) => !Number.isFinite(w))) { uebergangen += 1; return; }
    punkte.push({
      nummer, x: werte[0], y: werte[1], z: werte[2],
      art: teile.length > 4 ? teile[4] : null,
    });
  });
  return { punkte, uebergangen };
}
