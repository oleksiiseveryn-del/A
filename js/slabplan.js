/**
 * Deckenpläne: Deckenspiegel je Geschossebene mit Spannrichtung,
 * Deckendurchbrüchen und den darunterliegenden tragenden Bauteilen.
 *
 * Der Deckenplan zeigt eine Deckenebene im Grundriss: die Deckenplatten
 * mit Dicke und Höhenkote, ihre Aussparungen, die Spannrichtung mit
 * Stützweite sowie die Bauteile unter der Decke (Wände, Stützen, Unterzüge)
 * gestrichelt als Auflager. Dazu das Achsraster, Maßketten und der
 * Deckenspiegel mit Flächen, Volumen, Schalung und Eigenlast.
 *
 * Die Zuordnung ein- oder zweiachsig gespannt folgt der Faustregel
 * l_max / l_min > 2 → einachsig. Maßgebend ist die Bemessung nach
 * DIN EN 1992-1-1; Durchstanznachweis, Zulagen an Aussparungen und die
 * Auflagerausbildung sind gesondert zu führen.
 */

const SPANNRICHTUNGEN = {
  auto: "automatisch",
  x: "einachsig in x",
  z: "einachsig in z",
  zwei: "zweiachsig",
};

/** Bauteilarten, die eine Deckenebene bilden. */
const DECKENARTEN = ["decke", "bodenplatte"];

/**
 * Stützweiten und Spannrichtung einer Platte.
 * @returns {Object} { lx, lz, verhaeltnis, richtung, richtungName, stuetzweite, empfehlung }
 */
function spannweiten(element, geo) {
  const lx = geo.laenge, lz = geo.breite;
  const gross = Math.max(lx, lz), klein = Math.min(lx, lz);
  const verhaeltnis = klein > 0 ? gross / klein : 1;
  const empfehlung = verhaeltnis > 2 ? (lx < lz ? "x" : "z") : "zwei";
  const gewaehlt = element.spannrichtung && element.spannrichtung !== "auto"
    ? element.spannrichtung : empfehlung;
  return {
    lx, lz, verhaeltnis, richtung: gewaehlt,
    richtungName: SPANNRICHTUNGEN[gewaehlt],
    // maßgebende Stützweite in Spannrichtung; zweiachsig: die kürzere Seite
    stuetzweite: gewaehlt === "x" ? lx : gewaehlt === "z" ? lz : klein,
    empfehlung,
    automatisch: !element.spannrichtung || element.spannrichtung === "auto",
  };
}

/**
 * Deckenebenen aus den Betonbauteilen: je Höhenkote OK die Platten dieser
 * Ebene und die Bauteile darunter.
 *
 * @returns {Array} [{ ok, platten: [], darunter: [] }]
 */
function deckenEbenen(elemente, geometrieVon, arbeitsraum) {
  const ebenen = new Map();
  const alle = elemente.map((element) => {
    const geo = geometrieVon(element, arbeitsraum);
    return { element, geo, koten: hoehenkoten(element, geo) };
  });

  alle.filter((e) => DECKENARTEN.indexOf(e.element.kind) >= 0).forEach((platte) => {
    const schluessel = platte.koten.ok.toFixed(3);
    if (!ebenen.has(schluessel)) ebenen.set(schluessel, { ok: platte.koten.ok, platten: [], darunter: [] });
    ebenen.get(schluessel).platten.push(platte);
  });

  ebenen.forEach((ebene) => {
    ebene.darunter = alle.filter((e) => {
      if (DECKENARTEN.indexOf(e.element.kind) >= 0) return false;
      // Bauteile, deren Oberkante nicht über der Decke liegt
      return e.koten.ok <= ebene.ok + 0.01;
    });
  });

  return Array.from(ebenen.values()).sort((a, b) => b.ok - a.ok);
}

/**
 * Deckenspiegel: Zeilen je Platte mit Flächen, Volumen, Schalung,
 * Eigenlast und Spannrichtung.
 */
function deckenAufstellung(ebene, bezeichnungVon) {
  const zeilen = ebene.platten.map(({ element, geo, koten }) => {
    const anzahl = Math.max(1, element.anzahl || 1);
    const spann = spannweiten(element, geo);
    const teile = geo.schalungTeile || { seiten: 0, boden: 0, aussparung: 0 };
    return {
      bauteil: bezeichnungVon(element), element, geo, koten, spann,
      dicke: geo.dicke,
      bruttoFlaeche: (geo.bruttoFlaeche || geo.grundflaeche) * anzahl,
      oeffnungsFlaeche: (geo.oeffnungsFlaeche || 0) * anzahl,
      nettoFlaeche: geo.grundflaeche * anzahl,
      volumen: geo.volumen * anzahl,
      deckenschalung: teile.boden * anzahl,
      randschalung: (teile.seiten + teile.aussparung) * anzahl,
      // Eigenlast der Rohdecke: g_k = d · 25 kN/m³
      gk: (geo.dicke * STAHLBETON_DICHTE * 9.81) / 1000,
      anzahl,
    };
  });

  const summe = zeilen.reduce((s, z) => ({
    bruttoFlaeche: s.bruttoFlaeche + z.bruttoFlaeche,
    oeffnungsFlaeche: s.oeffnungsFlaeche + z.oeffnungsFlaeche,
    nettoFlaeche: s.nettoFlaeche + z.nettoFlaeche,
    volumen: s.volumen + z.volumen,
    deckenschalung: s.deckenschalung + z.deckenschalung,
    randschalung: s.randschalung + z.randschalung,
  }), { bruttoFlaeche: 0, oeffnungsFlaeche: 0, nettoFlaeche: 0, volumen: 0, deckenschalung: 0, randschalung: 0 });

  return { zeilen, summe };
}

/**
 * Deckenplan einer Ebene als A4-Blatt quer.
 *
 * @param {Object} daten - { ebene, achsen, bezeichnungVon, aufstellung,
 *                           architektur, projekt }
 */
function deckenplanSVG(daten) {
  const { ebene, achsen, bezeichnungVon, aufstellung, architektur, projekt } = daten;

  // ---- Umgrenzung aus Platten, Auflagern und Achsen
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const merke = (x, z) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  };
  const plattenLage = (p) => {
    const x0 = Math.min(p.element.p1.x, p.element.p2.x);
    const z0 = Math.min(p.element.p1.z, p.element.p2.z);
    return { x0, z0, b: p.geo.laenge, t: p.geo.breite };
  };
  ebene.platten.forEach((p) => {
    const l = plattenLage(p);
    merke(l.x0, l.z0); merke(l.x0 + l.b, l.z0 + l.t);
  });
  const auflager = (ebene.darunter || []).map((e) => e.figur).filter(Boolean);
  auflager.concat(architektur || []).forEach((f) => {
    if (f.art === "polygon") f.punkte.forEach((pt) => merke(pt.x, pt.z));
    else if (f.art === "rechteck") { merke(f.x, f.z); merke(f.x + f.b, f.z + f.t); }
    else if (f.art === "kreis") { merke(f.x - f.r, f.z - f.r); merke(f.x + f.r, f.z + f.r); }
  });
  if (achsen) {
    achsen.x.forEach((a) => merke(a.wert, minZ === Infinity ? 0 : minZ));
    achsen.z.forEach((a) => merke(minX === Infinity ? 0 : minX, a.wert));
  }
  if (!Number.isFinite(minX)) { minX = 0; maxX = 1; minZ = 0; maxZ = 1; }
  minX -= 1; maxX += 1; minZ -= 1; maxZ += 1;

  const breiteM = Math.max(maxX - minX, 1);
  const tiefeM = Math.max(maxZ - minZ, 1);
  const feld = { x: BLATT.randLinks + 10, y: BLATT.randOben + 10, b: 148, h: 142 };
  const nenner = waehleMassstab(breiteM, tiefeM, feld.b - 18, feld.h - 12);
  const m = (wert) => (wert * 1000) / nenner;
  const W = m(breiteM), H = m(tiefeM);
  const x0 = feld.x + (feld.b - W) / 2;
  const y0 = feld.y + (feld.h - H) / 2;
  const px = (x) => x0 + m(x - minX);
  const pz = (z) => y0 + m(z - minZ);

  let svg = "";

  // ---- Achsraster
  if (achsen) {
    achsen.x.forEach((achse) => {
      const x = px(achse.wert);
      svg += `<line x1="${x.toFixed(2)}" y1="${(y0 - 4).toFixed(2)}" x2="${x.toFixed(2)}" y2="${(y0 + H + 4).toFixed(2)}" class="achse"/>`;
      [y0 - 7.5, y0 + H + 7.5].forEach((y) => {
        svg += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="3" class="achskreis"/>`;
        svg += `<text x="${x.toFixed(2)}" y="${(y + 1.1).toFixed(2)}" class="t-achse">${achse.name}</text>`;
      });
    });
    achsen.z.forEach((achse) => {
      const y = pz(achse.wert);
      svg += `<line x1="${(x0 - 4).toFixed(2)}" y1="${y.toFixed(2)}" x2="${(x0 + W + 4).toFixed(2)}" y2="${y.toFixed(2)}" class="achse"/>`;
      [x0 - 7.5, x0 + W + 7.5].forEach((x) => {
        svg += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="3" class="achskreis"/>`;
        svg += `<text x="${x.toFixed(2)}" y="${(y + 1.1).toFixed(2)}" class="t-achse">${achse.name}</text>`;
      });
    });
  }

  // Auflager werden nach den Platten gezeichnet, damit sie unter der Decke
  // sichtbar bleiben; die Reihenfolge steht weiter unten.
  const zeichneAuflager = () => {
    let g = "";
  (architektur || []).forEach((f) => {
      if (f.art === "polygon") {
        const d = f.punkte.map((pt) => `${px(pt.x).toFixed(2)},${pz(pt.z).toFixed(2)}`).join(" ");
        g += `<polygon points="${d}" class="unterhalb"/>`;
      } else if (f.art === "rechteck") {
        g += `<rect x="${px(f.x).toFixed(2)}" y="${pz(f.z).toFixed(2)}" width="${m(f.b).toFixed(2)}" height="${m(f.t).toFixed(2)}" class="unterhalb"/>`;
      }
    });
    auflager.forEach((f) => {
      if (f.art === "polygon") {
        const d = f.punkte.map((pt) => `${px(pt.x).toFixed(2)},${pz(pt.z).toFixed(2)}`).join(" ");
        g += `<polygon points="${d}" class="auflager"/>`;
      } else if (f.art === "rechteck") {
        g += `<rect x="${px(f.x).toFixed(2)}" y="${pz(f.z).toFixed(2)}" width="${m(f.b).toFixed(2)}" height="${m(f.t).toFixed(2)}" class="auflager"/>`;
      } else if (f.art === "kreis") {
        g += `<circle cx="${px(f.x).toFixed(2)}" cy="${pz(f.z).toFixed(2)}" r="${m(f.r).toFixed(2)}" class="auflager"/>`;
      }
    });
    return g;
  };

  // ---- Deckenplatten: Umriss, darauf die Bauteile unter der Decke gestrichelt
  ebene.platten.forEach((p) => {
    const l = plattenLage(p);
    svg += `<rect x="${px(l.x0).toFixed(2)}" y="${pz(l.z0).toFixed(2)}" width="${m(l.b).toFixed(2)}" height="${m(l.t).toFixed(2)}" class="deckenplatte"/>`;
  });
  svg += zeichneAuflager();

  // ---- Aussparungen, Spannrichtung und Beschriftung
  ebene.platten.forEach((p) => {
    const l = plattenLage(p);
    const spann = spannweiten(p.element, p.geo);

    (p.geo.oeffnungen || []).forEach((o) => {
      const ox = l.x0 + (o.x || 0), oz = l.z0 + (o.z || 0);
      svg += `<rect x="${px(ox).toFixed(2)}" y="${pz(oz).toFixed(2)}" width="${m(o.b).toFixed(2)}" height="${m(o.t).toFixed(2)}" class="durchbruch"/>`;
      // Diagonalkreuz kennzeichnet den Durchbruch
      svg += `<line x1="${px(ox).toFixed(2)}" y1="${pz(oz).toFixed(2)}" x2="${px(ox + o.b).toFixed(2)}" y2="${pz(oz + o.t).toFixed(2)}" class="durchbruchkreuz"/>`;
      svg += `<line x1="${px(ox + o.b).toFixed(2)}" y1="${pz(oz).toFixed(2)}" x2="${px(ox).toFixed(2)}" y2="${pz(oz + o.t).toFixed(2)}" class="durchbruchkreuz"/>`;
      if (m(o.b) > 8) {
        svg += `<text x="${px(ox + o.b / 2).toFixed(2)}" y="${(pz(oz + o.t / 2) + 0.8).toFixed(2)}" class="t-durchbruch">${meterText(o.b)}/${meterText(o.t)}</text>`;
      }
    });

    // Spannrichtungspfeil mit Stützweite
    const mx = l.x0 + l.b / 2, mz = l.z0 + l.t / 2;
    const pfeil = (vonX, vonZ, bisX, bisZ, text, lotrecht) => {
      const ax = px(vonX), ay = pz(vonZ), bx = px(bisX), by = pz(bisZ);
      let g = `<line x1="${ax.toFixed(2)}" y1="${ay.toFixed(2)}" x2="${bx.toFixed(2)}" y2="${by.toFixed(2)}" class="spann"/>`;
      const spitze = (x, y, richtung) => {
        const dx = lotrecht ? 0 : richtung * 2, dy = lotrecht ? richtung * 2 : 0;
        const qx = lotrecht ? 1.2 : 0, qy = lotrecht ? 0 : 1.2;
        return `<polygon points="${x.toFixed(2)},${y.toFixed(2)} ${(x - dx + qx).toFixed(2)},${(y - dy + qy).toFixed(2)} ${(x - dx - qx).toFixed(2)},${(y - dy - qy).toFixed(2)}" class="spannspitze"/>`;
      };
      g += spitze(ax, ay, -1) + spitze(bx, by, 1);
      const tx = (ax + bx) / 2, ty = (ay + by) / 2;
      g += `<text x="${tx.toFixed(2)}" y="${(ty - 1.2).toFixed(2)}" class="t-spann"${lotrecht ? ` transform="rotate(-90 ${tx.toFixed(2)} ${ty.toFixed(2)})"` : ""}>${text}</text>`;
      return g;
    };
    const rand = 0.15;
    // zweiachsig: Pfeile versetzt, damit sich die Maßangaben nicht überdecken
    const zweiachsig = spann.richtung === "zwei";
    const pfeilZ = zweiachsig ? l.z0 + l.t * 0.32 : mz;
    const pfeilX = zweiachsig ? l.x0 + l.b * 0.68 : mx;
    if (spann.richtung === "x" || zweiachsig) {
      svg += pfeil(l.x0 + rand, pfeilZ, l.x0 + l.b - rand, pfeilZ, `l = ${meterText(l.b)}`, false);
    }
    if (spann.richtung === "z" || zweiachsig) {
      svg += pfeil(pfeilX, l.z0 + rand, pfeilX, l.z0 + l.t - rand, `l = ${meterText(l.t)}`, true);
    }

    // Beschriftung im oberen Drittel der Platte, von oben nach unten gesetzt
    const tx = px(l.x0 + l.b / 2);
    const ty = pz(l.z0) + 6;
    svg += `<text x="${tx.toFixed(2)}" y="${ty.toFixed(2)}" class="t-pos">${bezeichnungVon(p.element)}</text>`;
    svg += `<text x="${tx.toFixed(2)}" y="${(ty + 3.6).toFixed(2)}" class="t-plattentext">d = ${(p.geo.dicke * 100).toFixed(0)} cm · OK ${koteText(p.koten.ok)}</text>`;
    svg += `<text x="${tx.toFixed(2)}" y="${(ty + 7).toFixed(2)}" class="t-plattentext">${spann.richtungName}${spann.automatisch ? " (l/l = " + spann.verhaeltnis.toFixed(2) + ")" : ""}</text>`;
  });

  // ---- Maßketten
  if (achsen && achsen.x.length > 1) {
    const punkte = achsen.x.map((a) => px(a.wert));
    const yMass = y0 + H + 13;
    svg += massketteWaagerecht(punkte, yMass, y0 + H + 4, "kette");
    for (let i = 0; i < punkte.length - 1; i++) {
      if (punkte[i + 1] - punkte[i] < 4) continue;
      const weite = achsen.x[i + 1].wert - achsen.x[i].wert;
      svg += `<text x="${((punkte[i] + punkte[i + 1]) / 2).toFixed(2)}" y="${(yMass - 1.4).toFixed(2)}" class="t-mass">${meterText(weite)}</text>`;
    }
  }
  if (achsen && achsen.z.length > 1) {
    const punkte = achsen.z.map((a) => pz(a.wert));
    const xMass = x0 - 13;
    svg += massketteLotrecht(punkte, xMass, x0 - 4);
    for (let i = 0; i < punkte.length - 1; i++) {
      if (punkte[i + 1] - punkte[i] < 4) continue;
      const weite = achsen.z[i + 1].wert - achsen.z[i].wert;
      const my = (punkte[i] + punkte[i + 1]) / 2;
      svg += `<text x="${(xMass - 1.6).toFixed(2)}" y="${my.toFixed(2)}" class="t-mass" transform="rotate(-90 ${(xMass - 1.6).toFixed(2)} ${my.toFixed(2)})">${meterText(weite)}</text>`;
    }
  }

  // ---- Deckenspiegel rechts
  const xL = BLATT.randLinks + 168;
  let yL = BLATT.randOben + 6;
  svg += `<text x="${xL}" y="${yL}" class="t-kopf">Deckenspiegel OK ${koteText(ebene.ok)} · M 1:${nenner}</text>`;
  yL += 5.5;
  const spalten = [0, 12, 30, 48, 66, 80];
  ["Pos", "d [cm]", "Fläche", "Ausspar.", "Volumen", "Spannw."].forEach((t, i) => {
    svg += `<text x="${(xL + spalten[i]).toFixed(2)}" y="${yL}" class="t-th">${t}</text>`;
  });
  svg += `<line x1="${xL}" y1="${(yL + 1.4).toFixed(2)}" x2="${(xL + 92).toFixed(2)}" y2="${(yL + 1.4).toFixed(2)}" class="tabelle"/>`;
  yL += 4.4;

  aufstellung.zeilen.forEach((z) => {
    const werte = [z.bauteil, (z.dicke * 100).toFixed(0), z.nettoFlaeche.toFixed(2),
      z.oeffnungsFlaeche > 0 ? "−" + z.oeffnungsFlaeche.toFixed(2) : "–",
      z.volumen.toFixed(2), meterText(z.spann.stuetzweite)];
    werte.forEach((t, i) => {
      svg += `<text x="${(xL + spalten[i]).toFixed(2)}" y="${yL}" class="t-td">${t}</text>`;
    });
    yL += 3.8;
  });
  svg += `<line x1="${xL}" y1="${(yL - 2.6).toFixed(2)}" x2="${(xL + 92).toFixed(2)}" y2="${(yL - 2.6).toFixed(2)}" class="tabelle"/>`;
  svg += `<text x="${xL}" y="${yL}" class="t-th">Summe</text>`;
  svg += `<text x="${(xL + spalten[2]).toFixed(2)}" y="${yL}" class="t-th">${aufstellung.summe.nettoFlaeche.toFixed(2)}</text>`;
  svg += `<text x="${(xL + spalten[4]).toFixed(2)}" y="${yL}" class="t-th">${aufstellung.summe.volumen.toFixed(2)}</text>`;
  yL += 6;

  const infos = [
    `Deckenschalung ${aufstellung.summe.deckenschalung.toFixed(2)} m² · Randschalung ${aufstellung.summe.randschalung.toFixed(2)} m²`,
    `Eigenlast Rohdecke g_k = d · 25 kN/m³`,
    `Spannrichtung: Faustregel l_max/l_min > 2 → einachsig; maßgebend ist die Bemessung.`,
    `Zulagen an Aussparungen, Durchstanzbewehrung und Auflagerausbildung nach DIN EN 1992-1-1.`,
  ];
  infos.forEach((t) => {
    umbrechen(t, 44).forEach((zeile, i) => {
      svg += `<text x="${(xL + (i ? 2 : 0)).toFixed(2)}" y="${yL}" class="t-klein">${zeile}</text>`;
      yL += 3.5;
    });
    yL += 0.6;
  });

  // Legende
  yL += 1;
  svg += `<text x="${xL}" y="${yL}" class="t-th">Legende</text>`;
  yL += 4.2;
  [["deckenplatte", "Deckenplatte dieser Ebene"], ["durchbruch", "Aussparung / Durchbruch"],
   ["auflager", "Betonbauteil unter der Decke"], ["unterhalb", "Wand unter der Decke"]].forEach(([klasse, text]) => {
    svg += `<rect x="${xL}" y="${(yL - 2.6).toFixed(2)}" width="4" height="3" class="${klasse}"/>`;
    svg += `<text x="${(xL + 6).toFixed(2)}" y="${yL}" class="t-klein">${text}</text>`;
    yL += 4.2;
  });

  // ---- Schriftfeld
  const sfB = 104, sfH = 30;
  const sfX = BLATT.breite - BLATT.randRechts - sfB;
  const sfY = BLATT.hoehe - BLATT.randUnten - sfH;
  svg += `<rect x="${sfX}" y="${sfY}" width="${sfB}" height="${sfH}" class="schriftfeld"/>`;
  svg += `<line x1="${sfX}" y1="${sfY + 9}" x2="${sfX + sfB}" y2="${sfY + 9}" class="schriftfeld"/>`;
  svg += `<line x1="${sfX}" y1="${sfY + 19}" x2="${sfX + sfB}" y2="${sfY + 19}" class="schriftfeld"/>`;
  svg += `<line x1="${sfX + 62}" y1="${sfY + 19}" x2="${sfX + 62}" y2="${sfY + sfH}" class="schriftfeld"/>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 6}" class="t-firma">HSD Hamburg GmbH</text>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 15}" class="t-klein">${projekt.name || "Projekt"} · Deckenplan OK ${koteText(ebene.ok)} · ${ebene.platten.length} Platten</text>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 25}" class="t-klein">Bearbeiter: ${projekt.bearbeiter}</text>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 28.5}" class="t-klein">Datum: ${projekt.datum}</text>`;
  svg += `<text x="${sfX + 65}" y="${sfY + 25}" class="t-massstab">M 1:${nenner}</text>`;
  svg += `<text x="${sfX + 65}" y="${sfY + 28.5}" class="t-klein">Deckenplan</text>`;

  svg += `<text x="${BLATT.randLinks}" y="${BLATT.hoehe - 4}" class="t-hinweis">Vorbemessung – keine prüffähige Ausführungsplanung. Rohbaumaße ohne Toleranzen nach DIN 18202; Bewehrung, Durchstanznachweis und Zulagen nach DIN EN 1992-1-1 durch den Tragwerksplaner.</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BLATT.breite} ${BLATT.hoehe}" width="100%" style="background:#fff">
<style>
  .achse { stroke: #b3392c; stroke-width: 0.25; stroke-dasharray: 6 1.6 1 1.6; }
  .achskreis { fill: #ffffff; stroke: #b3392c; stroke-width: 0.35; }
  .deckenplatte { fill: #eef2f5; stroke: #1b2733; stroke-width: 0.5; }
  .durchbruch { fill: #ffffff; stroke: #1b2733; stroke-width: 0.35; }
  .durchbruchkreuz { stroke: #64707c; stroke-width: 0.2; }
  .auflager { fill: #b9c4cc; fill-opacity: 0.55; stroke: #4a5763; stroke-width: 0.35; stroke-dasharray: 2 1.2; }
  .unterhalb { fill: #c8d2d8; fill-opacity: 0.45; stroke: #6d7a86; stroke-width: 0.3; stroke-dasharray: 2 1.4; }
  .spann { stroke: #1f6b8f; stroke-width: 0.3; }
  .spannspitze { fill: #1f6b8f; }
  .ml, .mhl, .mb { stroke: #1b2733; }
  .ml { stroke-width: 0.25; }
  .mhl { stroke-width: 0.13; }
  .mb { stroke-width: 0.35; }
  .tabelle { stroke: #1b2733; stroke-width: 0.25; }
  .schriftfeld { fill: none; stroke: #1b2733; stroke-width: 0.35; }
  text { font-family: "IBM Plex Sans", Arial, sans-serif; fill: #1b2733; }
  .t-mass { font-size: 2.5px; text-anchor: middle; }
  .t-achse { font-size: 3px; text-anchor: middle; font-weight: 700; fill: #b3392c; }
  .t-pos { font-size: 3px; text-anchor: middle; font-weight: 700; paint-order: stroke; stroke: #ffffff; stroke-width: 0.9; stroke-linejoin: round; }
  .t-plattentext { font-size: 2.4px; text-anchor: middle; paint-order: stroke; stroke: #ffffff; stroke-width: 0.8; stroke-linejoin: round; }
  .t-spann { font-size: 2.3px; text-anchor: middle; fill: #1f6b8f; paint-order: stroke; stroke: #ffffff; stroke-width: 0.8; stroke-linejoin: round; }
  .t-durchbruch { font-size: 2.2px; text-anchor: middle; }
  .t-kopf { font-size: 3.2px; font-weight: 600; }
  .t-th { font-size: 2.6px; font-weight: 700; }
  .t-td { font-size: 2.5px; font-family: "IBM Plex Mono", monospace; }
  .t-klein { font-size: 2.4px; }
  .t-firma { font-size: 4.5px; font-weight: 700; }
  .t-massstab { font-size: 4px; font-weight: 600; }
  .t-hinweis { font-size: 2.2px; fill: #64707c; }
</style>
${svg}
</svg>`;
}
