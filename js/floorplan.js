/**
 * Grundriss als maßstäbliches Blatt (A4 quer, SVG).
 *
 * Darstellung in Anlehnung an DIN 1356-1: geschnittene Bauteile mit
 * kräftiger Umrandung, Fenster als Blendrahmen mit Verglasung, Türen mit
 * Blatt und Aufschlagbogen. Maßeintragung nach DIN 406-11, Maßstäbe nach
 * DIN ISO 5455.
 *
 * Raumflächen werden aus den Wandachsen ermittelt (Achsflächen). Daraus
 * folgen die lichten Flächen durch Versatz um die halbe Wanddicke und – nach
 * Abzug der Konstruktionsflächen und Zurechnung der Nischen – die
 * Netto-Raumfläche nach DIN 277-1. Die Wohnflächenberechnung nach WoFlV
 * (Anrechnungsfaktoren, lichte Raumhöhen) bleibt gesondert zu führen.
 */

/** Wandachsen als Kantenmodell aufbereiten: Knoten verschmelzen, Kanten bilden. */
function grundrissGraph(waende, toleranz) {
  const tol = toleranz || 0.05;
  const knoten = [];
  const kanten = [];

  const knotenIndex = (x, z) => {
    for (let i = 0; i < knoten.length; i++) {
      if (Math.hypot(knoten[i].x - x, knoten[i].z - z) <= tol) return i;
    }
    knoten.push({ x, z });
    return knoten.length - 1;
  };

  waende.forEach((wand) => {
    const a = knotenIndex(wand.p1.x, wand.p1.z);
    const b = knotenIndex(wand.p2.x, wand.p2.z);
    if (a !== b) kanten.push({ a, b, wand });
  });

  return { knoten, kanten };
}

/**
 * Wandachsen an allen Kreuzungs- und Anschlusspunkten teilen.
 *
 * Ohne diesen Schritt ist der Grundriss kein ebener Graph: Eine Wand, die
 * mittig auf eine andere stößt (T-Anschluss) oder sie kreuzt, erzeugt dort
 * keinen gemeinsamen Knoten – die Räume ließen sich nicht abgrenzen.
 */
function zerlegeWandachsen(waende, toleranz) {
  const tol = toleranz || 1e-6;
  const segmente = waende.map((wand) => ({
    p1: { x: wand.p1.x, z: wand.p1.z },
    p2: { x: wand.p2.x, z: wand.p2.z },
    wand,
    teiler: [0, 1],
  }));

  const kreuz = (ax, az, bx, bz) => ax * bz - az * bx;

  for (let i = 0; i < segmente.length; i++) {
    for (let j = i + 1; j < segmente.length; j++) {
      const a = segmente[i], b = segmente[j];
      const rx = a.p2.x - a.p1.x, rz = a.p2.z - a.p1.z;
      const sx = b.p2.x - b.p1.x, sz = b.p2.z - b.p1.z;
      const nenner = kreuz(rx, rz, sx, sz);
      const qx = b.p1.x - a.p1.x, qz = b.p1.z - a.p1.z;

      if (Math.abs(nenner) > 1e-9) {
        const t = kreuz(qx, qz, sx, sz) / nenner;
        const u = kreuz(qx, qz, rx, rz) / nenner;
        if (t > -1e-6 && t < 1 + 1e-6 && u > -1e-6 && u < 1 + 1e-6) {
          a.teiler.push(t);
          b.teiler.push(u);
        }
      } else {
        // parallel: gemeinsame Achse, Endpunkte aufeinander projizieren
        const laengeA = rx * rx + rz * rz;
        const laengeB = sx * sx + sz * sz;
        if (Math.abs(kreuz(qx, qz, rx, rz)) > 1e-6) continue; // versetzt, kein Kontakt
        if (laengeA > 1e-12) {
          [b.p1, b.p2].forEach((p) => {
            const t = ((p.x - a.p1.x) * rx + (p.z - a.p1.z) * rz) / laengeA;
            if (t > 1e-6 && t < 1 - 1e-6) a.teiler.push(t);
          });
        }
        if (laengeB > 1e-12) {
          [a.p1, a.p2].forEach((p) => {
            const u = ((p.x - b.p1.x) * sx + (p.z - b.p1.z) * sz) / laengeB;
            if (u > 1e-6 && u < 1 - 1e-6) b.teiler.push(u);
          });
        }
      }
    }
  }

  const teile = [];
  segmente.forEach((seg) => {
    const werte = seg.teiler.slice().sort((x, y) => x - y);
    for (let k = 0; k < werte.length - 1; k++) {
      const t1 = werte[k], t2 = werte[k + 1];
      if (t2 - t1 < 1e-6) continue;
      const punkt = (t) => ({
        x: seg.p1.x + (seg.p2.x - seg.p1.x) * t,
        y: 0,
        z: seg.p1.z + (seg.p2.z - seg.p1.z) * t,
      });
      const p1 = punkt(t1), p2 = punkt(t2);
      if (Math.hypot(p2.x - p1.x, p2.z - p1.z) > 0.01) {
        teile.push({ id: seg.wand.id, p1, p2, wand: seg.wand });
      }
    }
  });
  return teile;
}

/**
 * Räume als Flächen des ebenen Graphen bestimmen (Umlauf über Halbkanten).
 * @returns {Array} [{ punkte, flaeche, umfang }]
 */
function findeRaeume(waende) {
  // Erst an Kreuzungen teilen, sonst bleiben T-Anschlüsse unverbunden
  const { knoten, kanten } = grundrissGraph(zerlegeWandachsen(waende));
  if (kanten.length < 3) return [];

  // Halbkanten je Richtung
  const halbkanten = [];
  kanten.forEach((k) => {
    halbkanten.push({ von: k.a, nach: k.b });
    halbkanten.push({ von: k.b, nach: k.a });
  });

  const winkel = (h) => Math.atan2(knoten[h.nach].z - knoten[h.von].z, knoten[h.nach].x - knoten[h.von].x);

  // ausgehende Halbkanten je Knoten, nach Richtung sortiert
  const ausgehend = knoten.map(() => []);
  halbkanten.forEach((h, i) => ausgehend[h.von].push(i));
  ausgehend.forEach((liste) => liste.sort((i, j) => winkel(halbkanten[i]) - winkel(halbkanten[j])));

  const gegenkante = (i) => (i % 2 === 0 ? i + 1 : i - 1);

  /** Nächste Halbkante im Umlauf: am Zielknoten die Vorgängerrichtung der Gegenkante. */
  const naechste = (i) => {
    const gegen = gegenkante(i);
    const liste = ausgehend[halbkanten[gegen].von];
    const pos = liste.indexOf(gegen);
    return liste[(pos - 1 + liste.length) % liste.length];
  };

  const besucht = new Set();
  const flaechen = [];

  halbkanten.forEach((_, start) => {
    if (besucht.has(start)) return;
    const zyklus = [];
    let i = start;
    let schutz = 0;
    do {
      besucht.add(i);
      zyklus.push(i);
      i = naechste(i);
      schutz++;
    } while (i !== start && schutz < 5000);
    if (i !== start || zyklus.length < 3) return;

    const punkte = zyklus.map((h) => knoten[halbkanten[h].von]);
    // Zu jeder Kante die ursprüngliche Wand merken (die Kanten sind geteilte
    // Achsstücke und tragen die Ausgangswand in .wand), damit deren Dicke bekannt ist
    const zugehoerigeWaende = zyklus.map((h) => {
      const teil = kanten[Math.floor(h / 2)].wand;
      return teil && teil.wand ? teil.wand : teil;
    });
    let flaeche = 0;
    for (let k = 0; k < punkte.length; k++) {
      const p = punkte[k], q = punkte[(k + 1) % punkte.length];
      flaeche += p.x * q.z - q.x * p.z;
    }
    flaeche /= 2;
    flaechen.push({ punkte, flaeche, waende: zugehoerigeWaende });
  });

  // Der Umlauf liefert Innenflächen mit positivem, die Außenkontur mit
  // negativem Vorzeichen. Über den Betrag ließe sich beides bei nur einem
  // Raum nicht unterscheiden, da Innen- und Außenfläche dann gleich groß sind.
  return flaechen
    .filter((f) => f.flaeche > 0.5)
    .map((f) => ({ punkte: f.punkte, flaeche: f.flaeche, waende: f.waende }))
    .sort((a, b) => b.flaeche - a.flaeche);
}


/**
 * Lichte Raumfläche: Das Achspolygon wird je Kante um die halbe Dicke der
 * begrenzenden Wand nach innen versetzt. Die lichten Maße sind die Grundlage
 * der Flächenermittlung nach DIN 277 bzw. der Wohnflächenverordnung.
 *
 * @param {Object} raum - { punkte, waende } aus findeRaeume
 * @param {Function} dickeVon - liefert die Bauteildicke einer Wand in Metern
 * @returns {Object} { punkte, flaeche, umfang, ok }
 */
function lichteRaumflaeche(raum, dickeVon) {
  const n = raum.punkte.length;
  if (n < 3) return { punkte: [], flaeche: 0, umfang: 0, ok: false };

  // Jede Kante parallel nach innen verschieben
  const linien = [];
  for (let i = 0; i < n; i++) {
    const p = raum.punkte[i];
    const q = raum.punkte[(i + 1) % n];
    const dx = q.x - p.x, dz = q.z - p.z;
    const laenge = Math.hypot(dx, dz);
    if (laenge < 1e-9) return { punkte: [], flaeche: 0, umfang: 0, ok: false };
    // Innennormale: bei positiver Umlauffläche zeigt (-dz, dx) ins Rauminnere
    const nx = -dz / laenge, nz = dx / laenge;
    const versatz = (dickeVon(raum.waende[i]) || 0) / 2;
    linien.push({
      px: p.x + nx * versatz, pz: p.z + nz * versatz,
      dx: dx / laenge, dz: dz / laenge,
    });
  }

  // Schnittpunkte benachbarter Linien ergeben die lichten Ecken
  const punkte = [];
  for (let i = 0; i < n; i++) {
    const a = linien[i];
    const b = linien[(i + 1) % n];
    const nenner = a.dx * b.dz - a.dz * b.dx;
    if (Math.abs(nenner) < 1e-9) {
      punkte.push({ x: a.px + a.dx * 0, z: a.pz + a.dz * 0 }); // parallel: Endpunkt übernehmen
      continue;
    }
    const t = ((b.px - a.px) * b.dz - (b.pz - a.pz) * b.dx) / nenner;
    punkte.push({ x: a.px + a.dx * t, z: a.pz + a.dz * t });
  }

  let flaeche = 0;
  let umfang = 0;
  for (let i = 0; i < punkte.length; i++) {
    const p = punkte[i], q = punkte[(i + 1) % punkte.length];
    flaeche += p.x * q.z - q.x * p.z;
    umfang += Math.hypot(q.x - p.x, q.z - p.z);
  }
  flaeche /= 2;

  // Bei zu dicken Wänden oder sehr schmalen Räumen kippt das Polygon um
  const ok = flaeche > 0 && flaeche < raum.flaeche + 1e-6;
  return { punkte, flaeche: ok ? flaeche : 0, umfang: ok ? umfang : 0, ok };
}

/* ------------------------------------------------ Abzüge nach DIN 277 */

/**
 * Bauteile und Nischen, die die Netto-Raumfläche verändern.
 *
 * DIN 277-1 ermittelt die Grundflächen aus den lichten Maßen in Höhe der
 * Fußbodenoberkante. Die Grundflächen der aufgehenden Bauteile – Stützen,
 * Pfeiler, Vormauerungen, Schächte und Schornsteine – zählen zur
 * Konstruktions-Grundfläche (KGF) und gehören damit nicht zur
 * Netto-Raumfläche (NRF). Nischen, die bis zum Fußboden herunterreichen,
 * liegen dagegen innerhalb der lichten Maße und werden zugerechnet.
 *
 * Die Wohnflächenverordnung (WoFlV § 3 Abs. 3) rechnet enger: Sie zieht nur
 * Pfeiler und Säulen ab, die höher als 1,50 m sind und deren Grundfläche
 * mehr als 0,10 m² beträgt; Nischen bis zum Fußboden zählen erst ab einer
 * Tiefe von mehr als 0,13 m, Türnischen bleiben stets unberücksichtigt.
 * Beide Regelwerke sind deshalb umschaltbar, die Schwellenwerte sind
 * Eingabewerte und keine fest verdrahteten Konstanten.
 */
const ABZUGSTYPEN = {
  stuetze:    { name: "Stütze / Pfeiler (freistehend)", wirkung: "abzug" },
  vorlage:    { name: "Wandvorlage / Vormauerung", wirkung: "abzug" },
  schacht:    { name: "Schacht (Installation, Aufzug)", wirkung: "abzug" },
  kamin:      { name: "Schornstein / Kamin", wirkung: "abzug" },
  treppe:     { name: "Treppe (über drei Steigungen)", wirkung: "abzug" },
  nische:     { name: "Wandnische", wirkung: "zuschlag" },
  tuernische: { name: "Türnische", wirkung: "keine" },
  frei:       { name: "Sonstiger Abzug (freie Fläche)", wirkung: "abzug" },
};

/** Voreinstellung der Schwellenwerte nach WoFlV § 3 Abs. 3; vom Anwender änderbar. */
const ABZUG_GRENZEN = {
  mindestFlaeche: 0.1,       // m²  Grundfläche eines Pfeilers/einer Säule
  mindestHoehe: 1.5,         // m   Höhe eines Pfeilers/einer Säule
  mindestNischentiefe: 0.13, // m   Tiefe einer Nische bis zum Fußboden
};

/**
 * Wirkung einer einzelnen Position auf die Raumfläche.
 *
 * @param {Object} p - { typ, breite, tiefe, hoehe, anzahl, bisFussboden }
 * @param {string} regel - "din277" (jede Konstruktionsfläche) oder "woflv" (Schwellenwerte)
 * @param {Object} grenzen - Schwellenwerte, siehe ABZUG_GRENZEN
 * @returns {Object} { art: "abzug"|"zuschlag"|"keine", flaeche, einzelflaeche, hinweis }
 */
function abzugsWirkung(p, regel, grenzen) {
  const g = grenzen || ABZUG_GRENZEN;
  const typ = ABZUGSTYPEN[p.typ];
  const breite = Math.max(0, p.breite || 0);
  const tiefe = Math.max(0, p.tiefe || 0);
  const hoehe = Math.max(0, p.hoehe || 0);
  const anzahl = Math.max(0, Math.round(p.anzahl || 0));
  const einzel = breite * tiefe;
  const gesamt = einzel * anzahl;
  const leer = (hinweis) => ({ art: "keine", flaeche: 0, einzelflaeche: einzel, hinweis });

  if (!typ) return leer("unbekannte Position");
  if (typ.wirkung === "keine") {
    return leer("Türnischen bleiben unberücksichtigt (WoFlV § 3 Abs. 3 Nr. 4)");
  }

  if (typ.wirkung === "abzug") {
    if (regel === "woflv" && p.typ !== "treppe" && p.typ !== "frei") {
      if (einzel <= g.mindestFlaeche) {
        return leer(`Grundfläche ${einzel.toFixed(3)} m² ≤ ${g.mindestFlaeche.toFixed(2)} m² – nach WoFlV kein Abzug`);
      }
      if (hoehe <= g.mindestHoehe) {
        return leer(`Höhe ${hoehe.toFixed(2)} m ≤ ${g.mindestHoehe.toFixed(2)} m – nach WoFlV kein Abzug`);
      }
    }
    return {
      art: "abzug", flaeche: gesamt, einzelflaeche: einzel,
      hinweis: regel === "woflv" ? "Abzug nach WoFlV § 3 Abs. 3" : "Konstruktions-Grundfläche nach DIN 277-1",
    };
  }

  // Nische: nur anrechenbar, wenn sie bis zum Fußboden herunterreicht
  if (!p.bisFussboden) {
    return leer("Nische reicht nicht bis zum Fußboden – liegt außerhalb der lichten Maße");
  }
  if (regel === "woflv" && tiefe <= g.mindestNischentiefe) {
    return leer(`Nischentiefe ${tiefe.toFixed(3)} m ≤ ${g.mindestNischentiefe.toFixed(2)} m – nach WoFlV kein Zuschlag`);
  }
  return {
    art: "zuschlag", flaeche: gesamt, einzelflaeche: einzel,
    hinweis: regel === "woflv" ? "Zuschlag nach WoFlV § 3 Abs. 3 Nr. 4" : "innerhalb der lichten Maße nach DIN 277-1",
  };
}

/**
 * Flächenbilanz eines Raumes: lichte Fläche abzüglich der Konstruktions-
 * flächen zuzüglich der anrechenbaren Nischen.
 *
 * @returns {Object} { abzug, zuschlag, netto, zeilen }
 */
function raumBilanz(lichteFlaeche, positionen, regel, grenzen) {
  let abzug = 0;
  let zuschlag = 0;
  const zeilen = (positionen || []).map((p) => {
    const w = abzugsWirkung(p, regel, grenzen);
    if (w.art === "abzug") abzug += w.flaeche;
    if (w.art === "zuschlag") zuschlag += w.flaeche;
    return { position: p, art: w.art, flaeche: w.flaeche, einzelflaeche: w.einzelflaeche, hinweis: w.hinweis };
  });
  const roh = lichteFlaeche || 0;
  const netto = Math.max(0, roh - abzug + zuschlag);
  return { abzug, zuschlag, netto, zeilen, ueberzogen: abzug > roh + zuschlag + 1e-9 };
}

/** Schwerpunkt eines Polygons. */
function polygonSchwerpunkt(punkte) {
  let x = 0, z = 0, a = 0;
  for (let i = 0; i < punkte.length; i++) {
    const p = punkte[i], q = punkte[(i + 1) % punkte.length];
    const f = p.x * q.z - q.x * p.z;
    a += f;
    x += (p.x + q.x) * f;
    z += (p.z + q.z) * f;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-9) return punkte[0];
  return { x: x / (6 * a), z: z / (6 * a) };
}

/**
 * Erzeugt das Grundrissblatt.
 * @param {Object} daten - { waende, oeffnungenVon, geometrieVon, projekt }
 */
function grundrissSVG(daten) {
  const { waende, oeffnungenVon, geometrieVon, projekt } = daten;
  // Abzüge/Zuschläge je Raum (Index wie in der Raumliste); ohne Angabe ohne Wirkung
  const bilanzVon = daten.bilanzVon || (() => null);
  if (!waende.length) return "";

  // Ausdehnung über alle Wände einschließlich Dicke
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  waende.forEach((wand) => {
    const d = geometrieVon(wand).dicke;
    [wand.p1, wand.p2].forEach((p) => {
      minX = Math.min(minX, p.x - d); maxX = Math.max(maxX, p.x + d);
      minZ = Math.min(minZ, p.z - d); maxZ = Math.max(maxZ, p.z + d);
    });
  });
  const breiteM = Math.max(maxX - minX, 0.5);
  const tiefeM = Math.max(maxZ - minZ, 0.5);

  const feldBreite = BLATT.breite - BLATT.randLinks - BLATT.randRechts - 74;
  const feldHoehe = 128;
  const nenner = waehleMassstab(breiteM, tiefeM, feldBreite, feldHoehe);
  const m = (wert) => (wert * 1000) / nenner;

  // Zeichnung im verfügbaren Feld zentrieren
  const x0 = BLATT.randLinks + 22 + Math.max((feldBreite - m(breiteM)) / 2, 0);
  const y0 = BLATT.randOben + 16 + Math.max((feldHoehe - m(tiefeM)) / 2, 0);
  // Modell -> Blatt: z nach unten, damit der Grundriss von oben gesehen stimmt
  const px = (x) => x0 + m(x - minX);
  const pz = (z) => y0 + m(z - minZ);

  let svg = "";

  // Räume zuerst, damit die Wände darüber liegen
  const dickeVon = (wand) => (wand ? geometrieVon(wand).dicke : 0);
  const raeume = findeRaeume(waende).map((raum) => ({ raum, licht: lichteRaumflaeche(raum, dickeVon) }));

  raeume.forEach(({ raum, licht }, i) => {
    const d = raum.punkte.map((p) => `${px(p.x).toFixed(2)},${pz(p.z).toFixed(2)}`).join(" ");
    svg += `<polygon points="${d}" class="raum"/>`;
    if (licht.ok) {
      // lichte Begrenzung gestrichelt einzeichnen
      const dl = licht.punkte.map((p) => `${px(p.x).toFixed(2)},${pz(p.z).toFixed(2)}`).join(" ");
      svg += `<polygon points="${dl}" class="raum-licht"/>`;
    }
    const s = polygonSchwerpunkt(raum.punkte);
    const bil = bilanzVon(i);
    const hatBilanz = bil && (bil.abzug > 0 || bil.zuschlag > 0);
    svg += `<text x="${px(s.x).toFixed(2)}" y="${(pz(s.z) - 3.6).toFixed(2)}" class="t-raum">R${i + 1}</text>`;
    if (hatBilanz && licht.ok) {
      svg += `<text x="${px(s.x).toFixed(2)}" y="${(pz(s.z)).toFixed(2)}" class="t-mass">${bil.netto.toFixed(2)} m² NRF</text>`;
      svg += `<text x="${px(s.x).toFixed(2)}" y="${(pz(s.z) + 3.2).toFixed(2)}" class="t-mass-grau">${licht.flaeche.toFixed(2)} m² licht${bil.abzug > 0 ? ` − ${bil.abzug.toFixed(2)}` : ""}${bil.zuschlag > 0 ? ` + ${bil.zuschlag.toFixed(2)}` : ""}</text>`;
      svg += `<text x="${px(s.x).toFixed(2)}" y="${(pz(s.z) + 6.2).toFixed(2)}" class="t-mass-grau">${raum.flaeche.toFixed(2)} m² Achsmaß</text>`;
    } else {
      svg += `<text x="${px(s.x).toFixed(2)}" y="${(pz(s.z)).toFixed(2)}" class="t-mass">${licht.ok ? licht.flaeche.toFixed(2) : raum.flaeche.toFixed(2)} m² licht</text>`;
      svg += `<text x="${px(s.x).toFixed(2)}" y="${(pz(s.z) + 3.2).toFixed(2)}" class="t-mass-grau">${raum.flaeche.toFixed(2)} m² Achsmaß</text>`;
    }
  });

  let wandketten = false;   // wurde mindestens eine Wandmaßkette gezeichnet?

  // Schwerpunkt aller Wandenden: bestimmt, welche Seite einer Wand außen liegt
  const schwerpunkt = waende.reduce((sum, w) => ({
    x: sum.x + (w.p1.x + w.p2.x) / (2 * waende.length),
    z: sum.z + (w.p1.z + w.p2.z) / (2 * waende.length),
  }), { x: 0, z: 0 });

  // Wände im Schnitt, zwischen den Öffnungen aufgeteilt
  waende.forEach((wand) => {
    const geo = geometrieVon(wand);
    const dicke = m(geo.dicke);
    const laengeM = Math.hypot(wand.p2.x - wand.p1.x, wand.p2.z - wand.p1.z);
    if (laengeM < 1e-6) return;

    const ax = px(wand.p1.x), az = pz(wand.p1.z);
    const bx = px(wand.p2.x), bz = pz(wand.p2.z);
    const drehung = (Math.atan2(bz - az, bx - ax) * 180) / Math.PI;
    const laenge = Math.hypot(bx - ax, bz - az);

    const felder = oeffnungsPositionen(oeffnungenVon(wand.id), laengeM, geo.hoehe).felder
      .filter((f) => f.x0 >= 0 && f.x0 + f.b <= laengeM)
      .sort((a, b) => a.x0 - b.x0);

    svg += `<g transform="translate(${ax.toFixed(2)} ${az.toFixed(2)}) rotate(${drehung.toFixed(3)})">`;

    // massive Wandstücke zwischen den Öffnungen
    let cursor = 0;
    const stuecke = [];
    felder.forEach((f) => {
      if (f.x0 > cursor) stuecke.push([cursor, f.x0]);
      cursor = Math.max(cursor, f.x0 + f.b);
    });
    if (cursor < laengeM) stuecke.push([cursor, laengeM]);

    stuecke.forEach(([von, bis]) => {
      svg += `<rect x="${m(von).toFixed(2)}" y="${(-dicke / 2).toFixed(2)}" width="${m(bis - von).toFixed(2)}" height="${dicke.toFixed(2)}" class="wand"/>`;
    });

    // Öffnungssymbole
    felder.forEach((f) => {
      const fx = m(f.x0), fb = m(f.b);
      const art = OEFFNUNGSTYPEN[f.typ] ? OEFFNUNGSTYPEN[f.typ].art : "Fenster";
      // Laibungskanten
      svg += `<line x1="${fx.toFixed(2)}" y1="${(-dicke / 2).toFixed(2)}" x2="${fx.toFixed(2)}" y2="${(dicke / 2).toFixed(2)}" class="laibung"/>`;
      svg += `<line x1="${(fx + fb).toFixed(2)}" y1="${(-dicke / 2).toFixed(2)}" x2="${(fx + fb).toFixed(2)}" y2="${(dicke / 2).toFixed(2)}" class="laibung"/>`;

      if (art === "Fenster") {
        // Blendrahmen und Verglasung
        svg += `<rect x="${fx.toFixed(2)}" y="${(-dicke / 6).toFixed(2)}" width="${fb.toFixed(2)}" height="${(dicke / 3).toFixed(2)}" class="fenster-plan"/>`;
        svg += `<line x1="${fx.toFixed(2)}" y1="0" x2="${(fx + fb).toFixed(2)}" y2="0" class="glas"/>`;
      } else {
        // Türblatt an der linken Laibung mit Aufschlagbogen
        svg += `<line x1="${fx.toFixed(2)}" y1="${(-dicke / 2).toFixed(2)}" x2="${fx.toFixed(2)}" y2="${(-dicke / 2 - fb).toFixed(2)}" class="tuerblatt"/>`;
        svg += `<path d="M ${(fx + fb).toFixed(2)} ${(-dicke / 2).toFixed(2)} A ${fb.toFixed(2)} ${fb.toFixed(2)} 0 0 0 ${fx.toFixed(2)} ${(-dicke / 2 - fb).toFixed(2)}" class="tuerbogen"/>`;
      }
    });

    const kopfueber = drehung > 90 || drehung < -90;

    // Außenseite der Wand bestimmen: die Normale, die vom Gebäudeschwerpunkt
    // weg zeigt. Auf dieser Seite liegen die Maßketten, die Öffnungs-
    // beschriftung liegt gegenüber, damit sich beides nicht überdeckt.
    const mx = (wand.p1.x + wand.p2.x) / 2, mz = (wand.p1.z + wand.p2.z) / 2;
    const dxW = wand.p2.x - wand.p1.x, dzW = wand.p2.z - wand.p1.z;
    const normW = Math.hypot(dxW, dzW) || 1;
    const nxW = -dzW / normW, nzW = dxW / normW;
    const seite = (mx - schwerpunkt.x) * nxW + (mz - schwerpunkt.z) * nzW >= 0 ? 1 : -1;
    const istAussen = wand.kind === "wand_aussen";
    const beschriftungsSeite = istAussen ? -seite : -1;

    // Öffnungsbeschriftung wie in der Bauzeichnung: Breite/Höhe und BRH
    felder.forEach((f) => {
      const mitte = m(f.x0 + f.b / 2);
      const art = OEFFNUNGSTYPEN[f.typ] ? OEFFNUNGSTYPEN[f.typ].art : "Fenster";
      const yText = beschriftungsSeite * (dicke / 2 + 1.6);
      const dreh = kopfueber ? `transform="rotate(180 ${mitte.toFixed(2)} ${yText.toFixed(2)})"` : "";
      const zeilen = [`${massText(f.b)}/${massText(f.h)}`];
      if (art === "Fenster") zeilen.push(`BRH ${massText(f.y0)}`);
      // Zeilen laufen von der Wand weg
      zeilen.forEach((text, i) => {
        const stufe = beschriftungsSeite > 0 ? 3.0 * i : -3.0 * i;
        const y = yText + (kopfueber ? -stufe : stufe);
        svg += `<text x="${mitte.toFixed(2)}" y="${y.toFixed(2)}" class="t-oeffnung-plan" ${dreh}>${text}</text>`;
      });
    });

    // Maßkette an Außenwänden: Einzelmaße der Pfeiler und Öffnungen sowie
    // das Gesamtmaß, auf der dem Gebäude abgewandten Seite
    if (istAussen && laenge > 12) {
      const yKette = seite * (dicke / 2 + 9);

      const punkte = [0];
      felder.forEach((f) => { punkte.push(m(f.x0)); punkte.push(m(f.x0 + f.b)); });
      punkte.push(laenge);
      const werte = [];
      for (let i = 0; i < punkte.length - 1; i++) werte.push((punkte[i + 1] - punkte[i]) * nenner / 1000);

      svg += massketteWaagerecht(punkte, yKette, seite * dicke / 2, "kette");
      for (let i = 0; i < werte.length; i++) {
        if (punkte[i + 1] - punkte[i] < 3.2) continue;   // zu schmal für eine Maßzahl
        const mp = (punkte[i] + punkte[i + 1]) / 2;
        const y = seite > 0 ? yKette - 1.4 : yKette + 3.2;
        const dreh = kopfueber ? `transform="rotate(180 ${mp.toFixed(2)} ${y.toFixed(2)})"` : "";
        svg += `<text x="${mp.toFixed(2)}" y="${y.toFixed(2)}" class="t-mass" ${dreh}>${massText(werte[i])}</text>`;
      }
      const yGesamt = seite * (dicke / 2 + 17);
      svg += massketteWaagerecht([0, laenge], yGesamt, yKette + seite * 2, "kette");
      const yg = seite > 0 ? yGesamt - 1.4 : yGesamt + 3.2;
      const drehG = kopfueber ? `transform="rotate(180 ${(laenge / 2).toFixed(2)} ${yg.toFixed(2)})"` : "";
      svg += `<text x="${(laenge / 2).toFixed(2)}" y="${yg.toFixed(2)}" class="t-mass-gross" ${drehG}>${massText(laengeM)}</text>`;
      wandketten = true;
    }

    // Wandbeschriftung entlang der Achse, hinter den Öffnungsangaben
    const yBez = beschriftungsSeite * (dicke / 2 + 8.5);
    const drehBez = kopfueber ? `transform="rotate(180 ${(laenge / 2).toFixed(2)} ${yBez.toFixed(2)})"` : "";
    svg += `<text x="${(laenge / 2).toFixed(2)}" y="${yBez.toFixed(2)}" class="t-wand" ${drehBez}>${daten.bezeichnungVon(wand)} · ${massText(laengeM)} · ${(geo.dicke * 1000).toFixed(0)} mm</text>`;
    svg += `</g>`;
  });

  // Gesamtmaße unten und links nur, wenn die Außenwände keine eigenen
  // Maßketten tragen – sonst stünden die Maße doppelt im Blatt
  if (!wandketten) {
  const yUnten = y0 + m(tiefeM) + 14;
  svg += massketteWaagerecht([px(minX), px(maxX)], yUnten, y0 + m(tiefeM) + 2, "kette");
  svg += `<text x="${((px(minX) + px(maxX)) / 2).toFixed(2)}" y="${(yUnten - 1.5).toFixed(2)}" class="t-mass-gross">${massText(breiteM)}</text>`;

  const xLinks = x0 - 12;
  svg += massketteLotrecht([pz(minZ), pz(maxZ)], xLinks, x0 - 2);
  svg += `<text x="${(xLinks - 2).toFixed(2)}" y="${((pz(minZ) + pz(maxZ)) / 2).toFixed(2)}" class="t-mass-gross" transform="rotate(-90 ${(xLinks - 2).toFixed(2)} ${((pz(minZ) + pz(maxZ)) / 2).toFixed(2)})">${massText(tiefeM)}</text>`;
  }

  // Raumaufstellung und Achsenzeiger rechts
  const xInfo = BLATT.breite - BLATT.randRechts - 68;
  let yInfo = BLATT.randOben + 8;
  svg += `<text x="${xInfo}" y="${yInfo}" class="t-kopf">Räume</text>`;
  yInfo += 4.4;
  svg += `<text x="${xInfo}" y="${yInfo}" class="t-klein">Raum · NRF · licht · Abzug · Zuschlag [m²]</text>`;
  yInfo += 4.4;
  let summe = 0;
  let summeLicht = 0;
  let summeNetto = 0;
  let summeAbzug = 0;
  let summeZuschlag = 0;
  raeume.forEach(({ raum, licht }, i) => {
    const bil = bilanzVon(i);
    const netto = bil && licht.ok ? bil.netto : (licht.ok ? licht.flaeche : 0);
    summe += raum.flaeche;
    summeLicht += licht.ok ? licht.flaeche : 0;
    summeNetto += netto;
    summeAbzug += bil ? bil.abzug : 0;
    summeZuschlag += bil ? bil.zuschlag : 0;
    // Mehrfache Leerzeichen werden im SVG zusammengezogen, daher Trennpunkte
    const abzug = bil && bil.abzug > 0 ? "−" + bil.abzug.toFixed(2) : "–";
    const zuschlag = bil && bil.zuschlag > 0 ? "+" + bil.zuschlag.toFixed(2) : "–";
    svg += `<text x="${xInfo}" y="${yInfo}" class="t-klein">R${i + 1} · ${licht.ok ? netto.toFixed(2) : "–"} · ${licht.ok ? licht.flaeche.toFixed(2) : "–"} · ${abzug} · ${zuschlag}</text>`;
    yInfo += 4;
  });
  if (!raeume.length) {
    svg += `<text x="${xInfo}" y="${yInfo}" class="t-klein">kein geschlossener Raum erkannt</text>`;
    yInfo += 4;
  } else {
    svg += `<text x="${xInfo}" y="${(yInfo + 1).toFixed(2)}" class="t-kopf">Summe NRF ${summeNetto.toFixed(2)} m²</text>`;
    yInfo += 5;
    svg += `<text x="${xInfo}" y="${yInfo}" class="t-klein">Summe licht ${summeLicht.toFixed(2)} m²  ·  Achsmaß ${summe.toFixed(2)} m²</text>`;
    yInfo += 4;
    if (summeAbzug > 0 || summeZuschlag > 0) {
      svg += `<text x="${xInfo}" y="${yInfo}" class="t-klein">Abzüge ${summeAbzug.toFixed(2)} m²  ·  Zuschläge ${summeZuschlag.toFixed(2)} m²</text>`;
      yInfo += 4;
    }
    yInfo += 1;
  }
  yInfo += 3;
  svg += `<text x="${xInfo}" y="${yInfo}" class="t-klein">Lichte Fläche zwischen den Wandflächen in Höhe</text>`;
  yInfo += 3.6;
  svg += `<text x="${xInfo}" y="${yInfo}" class="t-klein">der Fußbodenoberkante nach DIN 277-1.</text>`;
  yInfo += 3.6;
  svg += `<text x="${xInfo}" y="${yInfo}" class="t-klein">NRF = licht − Konstruktionsflächen (Stützen,</text>`;
  yInfo += 3.6;
  svg += `<text x="${xInfo}" y="${yInfo}" class="t-klein">Schächte, Vorlagen) + anrechenbare Nischen.</text>`;
  yInfo += 3.6;
  svg += `<text x="${xInfo}" y="${yInfo}" class="t-klein">Regel: ${daten.regelText || "DIN 277-1"}. Lichte Raumhöhen</text>`;
  yInfo += 3.6;
  svg += `<text x="${xInfo}" y="${yInfo}" class="t-klein">und Anrechnungsfaktoren nach WoFlV § 4 gesondert.</text>`;
  yInfo += 8;

  // Achsenzeiger: x nach rechts, z nach unten (Modellkoordinaten)
  svg += `<text x="${xInfo}" y="${yInfo}" class="t-kopf">Lage</text>`;
  const ax0 = xInfo + 6, az0 = yInfo + 12;
  svg += `<line x1="${ax0}" y1="${az0}" x2="${ax0 + 12}" y2="${az0}" class="achse"/>`;
  svg += `<line x1="${ax0}" y1="${az0}" x2="${ax0}" y2="${az0 + 12}" class="achse"/>`;
  svg += `<text x="${ax0 + 14}" y="${az0 + 1}" class="t-klein">x</text>`;
  svg += `<text x="${ax0 - 1}" y="${az0 + 16}" class="t-klein">z</text>`;
  svg += `<text x="${xInfo}" y="${az0 + 22}" class="t-klein">Nordrichtung projektbezogen eintragen.</text>`;

  // Schriftfeld
  const sfB = 104, sfH = 30;
  const sfX = BLATT.breite - BLATT.randRechts - sfB;
  const sfY = BLATT.hoehe - BLATT.randUnten - sfH;
  svg += `<rect x="${sfX}" y="${sfY}" width="${sfB}" height="${sfH}" class="schriftfeld"/>`;
  svg += `<line x1="${sfX}" y1="${sfY + 9}" x2="${sfX + sfB}" y2="${sfY + 9}" class="schriftfeld"/>`;
  svg += `<line x1="${sfX}" y1="${sfY + 19}" x2="${sfX + sfB}" y2="${sfY + 19}" class="schriftfeld"/>`;
  svg += `<line x1="${sfX + 62}" y1="${sfY + 19}" x2="${sfX + 62}" y2="${sfY + sfH}" class="schriftfeld"/>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 6}" class="t-firma">HSD Hamburg GmbH</text>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 15}" class="t-klein">${projekt.name || "Projekt"} · Grundriss · ${waende.length} Wände</text>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 25}" class="t-klein">Bearbeiter: ${projekt.bearbeiter}</text>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 28.5}" class="t-klein">Datum: ${projekt.datum}</text>`;
  svg += `<text x="${sfX + 65}" y="${sfY + 25}" class="t-massstab">M 1:${nenner}</text>`;
  svg += `<text x="${sfX + 65}" y="${sfY + 28.5}" class="t-klein">Grundriss</text>`;

  svg += `<text x="${BLATT.randLinks}" y="${BLATT.hoehe - 4}" class="t-hinweis">Vorbemessung – keine prüffähige Ausführungsplanung. Maße in Metern als Achsmaße, Rohbaumaße ohne Toleranzen nach DIN 18202.</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BLATT.breite} ${BLATT.hoehe}" width="100%" style="background:#fff">
<style>
  .wand { fill: #b9c0c7; stroke: #1b2733; stroke-width: 0.5; }
  .raum { fill: #f6f3ec; stroke: none; }
  .raum-licht { fill: none; stroke: #8a97a3; stroke-width: 0.18; stroke-dasharray: 1.6 1.2; }
  .laibung { stroke: #1b2733; stroke-width: 0.35; }
  .fenster-plan { fill: #dceaf5; stroke: #1b2733; stroke-width: 0.2; }
  .glas { stroke: #1b2733; stroke-width: 0.2; }
  .tuerblatt { stroke: #1b2733; stroke-width: 0.4; }
  .tuerbogen { fill: none; stroke: #8a97a3; stroke-width: 0.2; stroke-dasharray: 1 0.8; }
  .achse { stroke: #1b2733; stroke-width: 0.3; }
  .ml { stroke: #1b2733; stroke-width: 0.25; }
  .mhl { stroke: #1b2733; stroke-width: 0.13; }
  .mb { stroke: #1b2733; stroke-width: 0.35; }
  .schriftfeld { fill: none; stroke: #1b2733; stroke-width: 0.35; }
  text { font-family: "IBM Plex Sans", Arial, sans-serif; fill: #1b2733; }
  .t-mass { font-size: 2.5px; text-anchor: middle; }
  .t-mass-grau { font-size: 2.2px; text-anchor: middle; fill: #64707c; }
  .t-mass-gross { font-size: 3.2px; text-anchor: middle; font-weight: 600; }
  .t-raum { font-size: 3.4px; text-anchor: middle; font-weight: 600; }
  .t-oeffnung-plan { font-size: 2.2px; text-anchor: middle; paint-order: stroke; stroke: #ffffff; stroke-width: 0.7; stroke-linejoin: round; }
  .t-wand { font-size: 2.3px; text-anchor: middle; fill: #46525e; }
  .t-kopf { font-size: 3.2px; font-weight: 600; }
  .t-klein { font-size: 2.6px; }
  .t-firma { font-size: 4.5px; font-weight: 700; }
  .t-massstab { font-size: 4px; font-weight: 600; }
  .t-hinweis { font-size: 2.2px; fill: #64707c; }
</style>
${svg}
</svg>`;
}
