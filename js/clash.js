/**
 * Kollisionsprüfung im Koordinationsmodell.
 *
 * Prüft alle Bauteile paarweise auf Durchdringung. Der Zweck ist der, den
 * ein Koordinationsmodell im BIM hat: Planungsfehler zu finden, bevor sie
 * auf der Baustelle als Behinderung ankommen.
 *
 * Rechenweg: Jedes Bauteil ist ein aufrechtes Prisma – im Grundriss ein
 * gedrehtes Rechteck oder ein Kreis, dazu ein Höhenbereich. Im Grundriss
 * wird die Überdeckung mit dem Trennachsenverfahren bestimmt (bei zwei
 * Rechtecken sind die vier Kantenrichtungen zu prüfen), lotrecht über den
 * Schnitt der Höhenbereiche. Das Ergebnis ist für aufrechte Bauteile mit
 * gerader Kante genau und nicht bloß eine Hüllkörperabschätzung.
 *
 * Zwei Stäbe, die sich einen Knoten teilen, treffen dort planmäßig
 * aufeinander; das führt der Bericht als Anschluss und nicht als Fehler.
 *
 * Bewertet wird nach Eindringtiefe:
 *   Durchdringung – die Körper überschneiden sich deutlich, das ist ein Fehler
 *   Berührung     – die Körper stoßen aneinander; bei Bauteilen, die
 *                   konstruktiv aufeinandertreffen (Wand auf Fundament,
 *                   Decke auf Wand), ist das gewollt und wird nur gemeldet
 *
 * NICHT geführt: Bauteile mit gekrümmtem oder geneigtem Verlauf werden über
 * ihr aufrechtes Prisma angenähert – eine Treppe wird als Laufkörper geprüft,
 * nicht Stufe für Stufe. Aussparungen und Öffnungen mindern den Körper nicht;
 * eine Leitung durch eine vorgesehene Wandöffnung erscheint deshalb als
 * Durchdringung. Gewerkeübergreifende Regelwerke wie ein Prüfregelsatz nach
 * Solibri oder BCF-Ausgabe der Befunde sind nicht enthalten.
 */

/**
 * Bauteilpaare, deren Berührung konstruktiv gewollt ist.
 * Der Schlüssel ist alphabetisch sortiert, damit die Reihenfolge egal ist.
 */
const KOLLISION_ERLAUBT = new Set([
  "bodenplatte|kellerwand", "bodenplatte|wand", "bodenplatte|stuetze",
  "einzelfundament|stuetze", "einzelfundament|stuetze_rund",
  "koecherfundament|stuetze", "koecherfundament|stuetze_rund",
  "streifenfundament|wand", "kellerwand|streifenfundament",
  "decke|wand", "decke|kellerwand", "decke|stuetze", "decke|stuetze_rund",
  "decke|unterzug", "decke|treppe", "stuetze|unterzug", "stuetze_rund|unterzug",
  "bohrpfahl|bodenplatte", "bohrpfahl|einzelfundament", "bohrpfahl|streifenfundament",
  "treppe|wand", "treppe|bodenplatte",
  "wand|wand_aussen", "wand_aussen|wand_innen",
]);

/** Ist die Berührung dieser beiden Bauteilarten konstruktiv gewollt? */
function kollisionErlaubt(artA, artB) {
  const schluessel = [artA, artB].sort().join("|");
  return KOLLISION_ERLAUBT.has(schluessel);
}

/**
 * Ecken eines gedrehten Rechtecks im Grundriss.
 * Der Bezugspunkt liegt in der Mitte, die Drehung in Grad um die Hochachse.
 */
function kollisionEcken(lage, laenge, breite) {
  const rad = ((lage.drehung || 0) * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const a = laenge / 2, b = breite / 2;
  return [[-a, -b], [a, -b], [a, b], [-a, b]].map(([u, v]) => ({
    x: lage.x + u * cos - v * sin,
    y: lage.y + u * sin + v * cos,
  }));
}

/** Ausdehnung eines Vielecks auf einer Richtung. */
function kollisionSpanne(ecken, achse) {
  let min = Infinity, max = -Infinity;
  ecken.forEach((p) => {
    const w = p.x * achse.x + p.y * achse.y;
    if (w < min) min = w;
    if (w > max) max = w;
  });
  return { min, max };
}

/**
 * Überdeckung zweier Vielecke im Grundriss nach dem Trennachsenverfahren.
 * @returns {number} kleinste Eindringtiefe in Metern, 0 = keine Überdeckung
 */
function kollisionVieleck(eckenA, eckenB) {
  let kleinste = Infinity;
  const kanten = (ecken) => ecken.map((p, i) => {
    const q = ecken[(i + 1) % ecken.length];
    const dx = q.x - p.x, dy = q.y - p.y;
    const l = Math.hypot(dx, dy) || 1;
    return { x: -dy / l, y: dx / l };   // Normale der Kante
  });

  for (const achse of kanten(eckenA).concat(kanten(eckenB))) {
    const a = kollisionSpanne(eckenA, achse);
    const b = kollisionSpanne(eckenB, achse);
    const ueber = Math.min(a.max, b.max) - Math.max(a.min, b.min);
    if (ueber <= 0) return 0;           // eine Trennachse genügt
    if (ueber < kleinste) kleinste = ueber;
  }
  return kleinste === Infinity ? 0 : kleinste;
}

/** Überdeckung Kreis gegen gedrehtes Rechteck bzw. Kreis gegen Kreis. */
function kollisionKreis(mitteA, rA, koerperB) {
  if (koerperB.art === "kreis") {
    const abstand = Math.hypot(mitteA.x - koerperB.mitte.x, mitteA.y - koerperB.mitte.y);
    return Math.max(0, rA + koerperB.r - abstand);
  }
  // Kreismitte in das gedrehte System des Rechtecks bringen
  const rad = ((koerperB.lage.drehung || 0) * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const dx = mitteA.x - koerperB.lage.x, dy = mitteA.y - koerperB.lage.y;
  const u = dx * cos + dy * sin;
  const v = -dx * sin + dy * cos;
  const a = koerperB.laenge / 2, b = koerperB.breite / 2;
  // nächster Punkt des Rechtecks zur Kreismitte
  const nu = Math.max(-a, Math.min(a, u));
  const nv = Math.max(-b, Math.min(b, v));
  const abstand = Math.hypot(u - nu, v - nv);
  if (abstand > rA) return 0;
  if (abstand > 1e-9) return rA - abstand;
  // Mitte liegt im Rechteck: Eindringtiefe bis zur nächsten Kante
  return Math.min(a - Math.abs(u), b - Math.abs(v)) + rA;
}

/** Grundrissfigur und Höhenbereich eines Bauteils aufbereiten. */
function kollisionKoerper(bauteil) {
  const k = bauteil.koerper || {};
  const lage = bauteil.lage || { x: 0, y: 0, z: 0, drehung: 0 };
  const hoehe = k.hoehe || 0.01;
  const unten = lage.z;
  const oben = lage.z + hoehe;
  if (k.art === "kreis") {
    return {
      art: "kreis", mitte: { x: lage.x, y: lage.y }, r: (k.durchmesser || 0.1) / 2,
      unten, oben, lage,
    };
  }
  return {
    art: "rechteck", lage, laenge: k.laenge || 0.1, breite: k.breite || 0.1,
    ecken: kollisionEcken(lage, k.laenge || 0.1, k.breite || 0.1),
    unten, oben,
  };
}

/**
 * Alle Bauteile paarweise prüfen.
 *
 * @param {Array} bauteile - wie für den IFC-Export: { bezeichnung, kind,
 *        kategorie, koerper, lage, geschoss }
 * @param {Object} optionen - { toleranz } Eindringtiefe in Metern, ab der
 *        eine Überschneidung als Durchdringung gilt (Voreinstellung 0,01 m)
 * @returns {Object} { befunde, geprueft, durchdringungen, beruehrungen }
 */
function kollisionsPruefung(bauteile, optionen) {
  const toleranz = (optionen && Number.isFinite(optionen.toleranz)) ? optionen.toleranz : 0.01;
  const koerper = bauteile.map((b) => Object.assign({ bauteil: b }, kollisionKoerper(b)));
  const befunde = [];
  let geprueft = 0;

  for (let i = 0; i < koerper.length; i++) {
    for (let j = i + 1; j < koerper.length; j++) {
      const a = koerper[i], b = koerper[j];
      geprueft += 1;

      // lotrechte Überdeckung zuerst: sie schließt die meisten Paare aus
      const lotrecht = Math.min(a.oben, b.oben) - Math.max(a.unten, b.unten);
      if (lotrecht <= 0) continue;

      let eben;
      if (a.art === "kreis" && b.art === "kreis") eben = kollisionKreis(a.mitte, a.r, b);
      else if (a.art === "kreis") eben = kollisionKreis(a.mitte, a.r, b);
      else if (b.art === "kreis") eben = kollisionKreis(b.mitte, b.r, a);
      else eben = kollisionVieleck(a.ecken, b.ecken);
      if (eben <= 0) continue;

      const tiefe = Math.min(eben, lotrecht);
      // Zwei Stäbe, die sich einen Knoten teilen, treffen dort planmäßig
      // aufeinander: das ist der Anschluss, nicht eine Kollision
      const gemeinsamerKnoten = !!(a.bauteil.knoten && b.bauteil.knoten
        && a.bauteil.knoten.some((k) => b.bauteil.knoten.indexOf(k) >= 0));
      const erlaubt = gemeinsamerKnoten || kollisionErlaubt(a.bauteil.kind, b.bauteil.kind);
      const art = tiefe <= toleranz ? "beruehrung" : (erlaubt ? "anschluss" : "durchdringung");

      befunde.push({
        a: a.bauteil, b: b.bauteil, art, erlaubt,
        tiefeEben: eben, tiefeLotrecht: lotrecht, tiefe,
        // Überdeckung als Anhaltswert, nicht als genaues Schnittvolumen
        ueberdeckung: eben * lotrecht,
        mitte: {
          x: ((a.art === "kreis" ? a.mitte.x : a.lage.x) + (b.art === "kreis" ? b.mitte.x : b.lage.x)) / 2,
          y: ((a.art === "kreis" ? a.mitte.y : a.lage.y) + (b.art === "kreis" ? b.mitte.y : b.lage.y)) / 2,
          z: (Math.max(a.unten, b.unten) + Math.min(a.oben, b.oben)) / 2,
        },
      });
    }
  }

  // Schwerste Befunde zuerst
  const rang = { durchdringung: 0, anschluss: 1, beruehrung: 2 };
  befunde.sort((x, y) => (rang[x.art] - rang[y.art]) || (y.tiefe - x.tiefe));

  return {
    befunde, geprueft, toleranz,
    durchdringungen: befunde.filter((f) => f.art === "durchdringung").length,
    anschluesse: befunde.filter((f) => f.art === "anschluss").length,
    beruehrungen: befunde.filter((f) => f.art === "beruehrung").length,
  };
}

/** Klartext eines Befundes für Tabelle und Bericht. */
function kollisionText(befund) {
  const m = (w) => w.toFixed(3).replace(".", ",");
  if (befund.art === "durchdringung") {
    return `Durchdringung ${m(befund.tiefeEben)} m im Grundriss über ${m(befund.tiefeLotrecht)} m Höhe`;
  }
  if (befund.art === "anschluss") {
    return `konstruktiver Anschluss, Überdeckung ${m(befund.tiefe)} m`;
  }
  return `Berührung, Überdeckung ${m(befund.tiefe)} m`;
}
