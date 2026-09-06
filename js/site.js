/**
 * Baustellenlogistik: Kran, Baustelleneinrichtung und Bauzeitenplan.
 *
 * Drei Fragen, die vor dem ersten Hub beantwortet sein müssen:
 * Trägt der Kran an der Stelle, an der das Teil hin soll? Ist Platz für
 * das, was auf die Baustelle gehört? Und in welcher Reihenfolge und wie
 * lange läuft das Ganze?
 *
 *   Kran        Traglastkurve, Ausladung je Hubpunkt, Ausnutzung,
 *               günstigster Standort über den kleinsten umschließenden
 *               Kreis, Überschneidung zweier Krane
 *   Einrichtung Flächenbedarf für Lager, Container, Sozialräume,
 *               Zufahrt und Bauzaun
 *   Bauzeit     Vorgangsliste mit Anordnungsbeziehungen, Vorwärts- und
 *               Rückwärtsrechnung, kritischer Weg und Puffer
 *
 * Rechengrundlagen
 * ----------------
 * Kran: Die Traglastkurve ist Herstellerangabe und wird als Wertepaare
 * (Ausladung, Traglast) eingegeben; dazwischen wird linear gerechnet.
 * Erforderlich ist die Masse des Bauteils zuzüglich der Anschlagmittel,
 * mal einem Zuschlag. Maßgebend bleibt die Traglasttabelle des
 * Kranherstellers und die Betriebsanleitung; Wind, Schräglauf und
 * Aufstellbedingungen sind dort geregelt.
 *
 * Standort: Der Punkt, der den größten Abstand zu allen Hubpunkten so
 * klein wie möglich macht, ist der Mittelpunkt des kleinsten Kreises, der
 * alle Punkte umschließt. Er wird nach dem Verfahren von Welzl bestimmt –
 * das Ergebnis ist der Kreis, kein Näherungswert.
 *
 * Sozialräume: Richtwerte nach den Technischen Regeln für Arbeitsstätten
 * ASR A4.1 (Sanitärräume) und ASR A4.2 (Pausen- und Bereitschaftsräume).
 * Der Pausenraum ist mit mindestens 6 m² und 1 m² je gleichzeitig
 * anwesendem Beschäftigten anzusetzen. Die Zahl der Toiletten und
 * Waschplätze folgt der Beschäftigtenzahl; die Werte sind hier sichtbare
 * Eingaben, weil Dauer der Baustelle, Geschlechterverhältnis und
 * örtliche Verhältnisse im Einzelfall entscheiden.
 *
 * Bauzeit: Netzplantechnik nach DIN 69900. Vorwärtsrechnung liefert die
 * frühesten, Rückwärtsrechnung die spätesten Lagen; die Differenz ist der
 * Gesamtpuffer. Vorgänge ohne Puffer bilden den kritischen Weg.
 *
 * NICHT geführt: Standsicherheit und Gründung des Krans, Fundamentlasten,
 * Windlasten im Betriebs- und Außerbetriebszustand, Montage und Abbau,
 * Sicherheits- und Gesundheitsschutzplan nach BaustellV (SiGe-Plan),
 * Baustellenverordnung im Übrigen, Verkehrszeichenplan, Ver- und
 * Entsorgung, Brandschutz auf der Baustelle. Der Bauzeitenplan kennt nur
 * die Beziehung Ende-Anfang mit Abstand; Anfang-Anfang und
 * Ende-Ende-Beziehungen sowie Kalender mit Feiertagen fehlen.
 */

/** Vorgaben der Baustelleneinrichtung. */
const BE_VORGABEN = {
  // Kran
  anschlagmittel: 200,        // kg Gehänge und Traversen
  kranZuschlag: 1.05,         // Zuschlag auf die Hublast
  // Sozialräume nach ASR A4.1 / A4.2
  pausenraumGrund: 6.0,       // m² Mindestfläche
  pausenraumJePerson: 1.0,    // m² je gleichzeitig Anwesendem
  personenJeToilette: 10,     // Richtwert
  personenJeWaschplatz: 5,    // Richtwert
  umkleideJePerson: 0.8,      // m²
  // Container
  bueroJePerson: 8.0,         // m² je Bauleitung
  containerFlaeche: 15.0,     // m² je Container (6,0 × 2,45 m)
  // Lager und Verkehr
  lagerFaktor: 2.5,           // Vielfaches der Bauteilgrundfläche als Lagerfläche
  fahrgasse: 4.0,             // m Breite der Baustellenzufahrt
  wendeplatz: 12.0,           // m Durchmesser
};

/** Zahl mit Dezimalkomma. */
function beZahl(wert, stellen) {
  return Number(wert).toFixed(stellen === undefined ? 2 : stellen).replace(".", ",");
}

/* ------------------------------------------------------------------ Kran */

/**
 * Traglast bei einer Ausladung aus der Traglastkurve.
 *
 * Die Kurve wird als Wertepaare (Ausladung in m, Traglast in t) übergeben
 * und aufsteigend nach Ausladung gelesen; dazwischen wird linear
 * gerechnet. Außerhalb der größten Ausladung trägt der Kran nicht mehr.
 */
function kranTraglast(kurve, ausladung) {
  const k = (kurve || []).slice().sort((a, b) => a.ausladung - b.ausladung);
  if (!k.length) return null;
  if (ausladung <= k[0].ausladung) return k[0].last;
  if (ausladung > k[k.length - 1].ausladung) return 0;
  for (let i = 0; i < k.length - 1; i++) {
    if (ausladung >= k[i].ausladung && ausladung <= k[i + 1].ausladung) {
      const t = (ausladung - k[i].ausladung) / (k[i + 1].ausladung - k[i].ausladung || 1);
      return k[i].last + t * (k[i + 1].last - k[i].last);
    }
  }
  return 0;
}

/**
 * Kleinster Kreis, der alle Punkte umschließt (Verfahren von Welzl).
 *
 * Sein Mittelpunkt ist der Standort, der die größte nötige Ausladung so
 * klein wie möglich hält. Das Verfahren arbeitet mit zufälliger
 * Reihenfolge und ist im Mittel linear; hier wird eine feste Reihenfolge
 * verwendet, damit das Ergebnis bei gleicher Eingabe gleich bleibt.
 */
function kleinsterKreis(punkte) {
  const p = punkte.map((q) => ({ x: q.x, y: q.y }));
  if (!p.length) return null;
  // feste, aber gut durchmischte Reihenfolge
  const gemischt = p.slice();
  let saat = 42;
  for (let i = gemischt.length - 1; i > 0; i--) {
    saat = (saat * 1103515245 + 12345) % 2147483648;
    const j = saat % (i + 1);
    const t = gemischt[i]; gemischt[i] = gemischt[j]; gemischt[j] = t;
  }

  const drin = (kreis, q) => kreis && Math.hypot(q.x - kreis.x, q.y - kreis.y) <= kreis.r + 1e-9;
  const ausZwei = (a, b) => ({
    x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, r: Math.hypot(a.x - b.x, a.y - b.y) / 2,
  });
  const ausDrei = (a, b, c) => {
    const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
    if (Math.abs(d) < 1e-12) return null;
    const a2 = a.x * a.x + a.y * a.y, b2 = b.x * b.x + b.y * b.y, c2 = c.x * c.x + c.y * c.y;
    const x = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
    const y = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
    return { x, y, r: Math.hypot(a.x - x, a.y - y) };
  };

  let kreis = { x: gemischt[0].x, y: gemischt[0].y, r: 0 };
  for (let i = 1; i < gemischt.length; i++) {
    if (drin(kreis, gemischt[i])) continue;
    kreis = { x: gemischt[i].x, y: gemischt[i].y, r: 0 };
    for (let j = 0; j < i; j++) {
      if (drin(kreis, gemischt[j])) continue;
      kreis = ausZwei(gemischt[i], gemischt[j]);
      for (let k = 0; k < j; k++) {
        if (drin(kreis, gemischt[k])) continue;
        const neu = ausDrei(gemischt[i], gemischt[j], gemischt[k]);
        if (neu) kreis = neu;
      }
    }
  }
  return kreis;
}

/**
 * Kranprüfung: jeder Hub gegen die Traglastkurve.
 *
 * @param {Object} kran - { x, y, kurve: [{ausladung, last}], hakenhoehe, name }
 * @param {Array} huebe - [{ bezeichnung, x, y, masse (kg), hoehe (m), stueck }]
 * @param {Object} vorgaben
 */
function kranPruefung(kran, huebe, vorgaben) {
  const v = Object.assign({}, BE_VORGABEN, vorgaben || {});
  const kurve = (kran.kurve || []).slice().sort((a, b) => a.ausladung - b.ausladung);
  const maxAusladung = kurve.length ? kurve[kurve.length - 1].ausladung : 0;

  const zeilen = huebe.map((h) => {
    const ausladung = Math.hypot(h.x - kran.x, h.y - kran.y);
    const traglast = kranTraglast(kurve, ausladung);
    const erforderlich = ((h.masse + v.anschlagmittel) / 1000) * v.kranZuschlag;
    const ausnutzung = traglast > 0 ? erforderlich / traglast : Infinity;
    const hakenhoehe = (h.hoehe || 0) + (h.bauteilHoehe || 0) + 2.0;   // 2 m Freigang
    return {
      hub: h, ausladung, traglast, erforderlich, ausnutzung,
      hakenhoehe,
      ausserhalb: ausladung > maxAusladung + 1e-9,
      zuHoch: kran.hakenhoehe ? hakenhoehe > kran.hakenhoehe : false,
      erfuellt: traglast > 0 && ausnutzung <= 1.0
        && (!kran.hakenhoehe || hakenhoehe <= kran.hakenhoehe),
    };
  });

  const meldungen = [];
  zeilen.forEach((z) => {
    if (z.ausserhalb) {
      meldungen.push({ art: "fehler", text: `${z.hub.bezeichnung}: Ausladung `
        + `${beZahl(z.ausladung)} m über der größten Ausladung ${beZahl(maxAusladung)} m – `
        + "Kran versetzen oder größeres Gerät." });
    } else if (z.ausnutzung > 1.0) {
      meldungen.push({ art: "fehler", text: `${z.hub.bezeichnung}: erforderlich `
        + `${beZahl(z.erforderlich)} t, Traglast bei ${beZahl(z.ausladung)} m nur `
        + `${beZahl(z.traglast)} t – Ausnutzung ${beZahl(z.ausnutzung * 100, 0)} %.` });
    } else if (z.ausnutzung > 0.9) {
      meldungen.push({ art: "warnung", text: `${z.hub.bezeichnung}: Ausnutzung `
        + `${beZahl(z.ausnutzung * 100, 0)} % bei ${beZahl(z.ausladung)} m Ausladung.` });
    }
    if (z.zuHoch) {
      meldungen.push({ art: "warnung", text: `${z.hub.bezeichnung}: nötige Hakenhöhe `
        + `${beZahl(z.hakenhoehe)} m über der Hakenhöhe des Krans `
        + `${beZahl(kran.hakenhoehe)} m.` });
    }
  });

  const nichtErfuellt = zeilen.filter((z) => !z.erfuellt).length;
  return {
    kran, zeilen, meldungen, maxAusladung,
    groessteAusladung: zeilen.reduce((s, z) => Math.max(s, z.ausladung), 0),
    schwersterHub: zeilen.reduce((s, z) => Math.max(s, z.erforderlich), 0),
    groessteAusnutzung: zeilen.reduce((s, z) => Math.max(s, Number.isFinite(z.ausnutzung) ? z.ausnutzung : 0), 0),
    nichtErfuellt,
    erfuellt: nichtErfuellt === 0,
  };
}

/**
 * Günstigster Kranstandort für eine Menge von Hubpunkten.
 *
 * Der Mittelpunkt des kleinsten umschließenden Kreises hält die größte
 * nötige Ausladung so klein wie möglich. Ob der Standort auch baubar ist
 * – Gründung, Zufahrt, Leitungen, Nachbargrundstück – entscheidet die
 * Baustelleneinrichtung, nicht die Rechnung.
 */
function kranStandort(huebe) {
  const kreis = kleinsterKreis(huebe.map((h) => ({ x: h.x, y: h.y })));
  if (!kreis) return null;
  return {
    x: kreis.x, y: kreis.y,
    ausladung: kreis.r,
    // die Punkte, die den Kreis bestimmen, liegen genau auf dem Rand
    massgebend: huebe.filter((h) => Math.abs(Math.hypot(h.x - kreis.x, h.y - kreis.y) - kreis.r) < 1e-6),
  };
}

/**
 * Überschneidung zweier Krane.
 *
 * Überschneiden sich die Arbeitsbereiche, ist der Betrieb nach den Regeln
 * für Krane zu ordnen: Höhenstaffelung der Ausleger, Vorrangregelung und
 * eine Absprache zwischen den Unternehmen. Die Rechnung sagt nur, ob und
 * wie weit sich die Kreise überschneiden.
 */
function kranUeberschneidung(kranA, kranB) {
  const abstand = Math.hypot(kranA.x - kranB.x, kranA.y - kranB.y);
  const rA = kranA.ausladung, rB = kranB.ausladung;
  const ueberschneidung = rA + rB - abstand;
  return {
    abstand, ueberschneidung,
    ueberschneidet: ueberschneidung > 0,
    hoehenunterschied: Math.abs((kranA.hakenhoehe || 0) - (kranB.hakenhoehe || 0)),
    hinweis: ueberschneidung > 0
      ? "Arbeitsbereiche überschneiden sich: Höhenstaffelung der Ausleger, Vorrangregelung "
        + "und eine schriftliche Absprache zwischen den beteiligten Unternehmen sind nötig."
      : "Die Arbeitsbereiche überschneiden sich nicht.",
  };
}

/* ------------------------------------------- Baustelleneinrichtung */

/**
 * Flächenbedarf der Baustelleneinrichtung.
 *
 * @param {Object} daten - { beschaeftigte, bauleitung, lagerVolumen,
 *        lagerGrundflaeche, dauerWochen }
 */
function beFlaechen(daten, vorgaben) {
  const v = Object.assign({}, BE_VORGABEN, vorgaben || {});
  const n = Math.max(0, daten.beschaeftigte || 0);
  const bl = Math.max(0, daten.bauleitung || 0);

  const pausenraum = n > 0 ? Math.max(v.pausenraumGrund, n * v.pausenraumJePerson) : 0;
  const umkleide = n * v.umkleideJePerson;
  const buero = bl * v.bueroJePerson;
  const toiletten = n > 0 ? Math.ceil(n / v.personenJeToilette) : 0;
  const waschplaetze = n > 0 ? Math.ceil(n / v.personenJeWaschplatz) : 0;
  const container = Math.ceil((pausenraum + umkleide + buero) / v.containerFlaeche);
  const lager = (daten.lagerGrundflaeche || 0) * v.lagerFaktor;

  const zeilen = [
    { art: "Pausenraum", flaeche: pausenraum,
      grundlage: `ASR A4.2: mindestens ${beZahl(v.pausenraumGrund, 1)} m², `
        + `${beZahl(v.pausenraumJePerson, 1)} m² je gleichzeitig Anwesendem` },
    { art: "Umkleide", flaeche: umkleide,
      grundlage: `${beZahl(v.umkleideJePerson, 1)} m² je Beschäftigtem` },
    { art: "Büro Bauleitung", flaeche: buero,
      grundlage: `${beZahl(v.bueroJePerson, 1)} m² je Arbeitsplatz` },
    { art: "Lagerfläche", flaeche: lager,
      grundlage: `${beZahl(v.lagerFaktor, 1)}-fache Grundfläche der gelagerten Bauteile` },
  ];
  const gesamt = zeilen.reduce((s, z) => s + z.flaeche, 0);

  return {
    zeilen, gesamt,
    toiletten, waschplaetze, container,
    beschaeftigte: n, bauleitung: bl,
    hinweise: [
      "Zahl der Toiletten und Waschplätze nach ASR A4.1; Dauer der Baustelle, "
      + "Geschlechterverhältnis und örtliche Verhältnisse entscheiden im Einzelfall.",
      "Sicherheits- und Gesundheitsschutzplan nach BaustellV, Verkehrszeichenplan, "
      + "Ver- und Entsorgung sowie der Brandschutz sind gesondert zu planen.",
    ],
  };
}

/* ------------------------------------------------------ Bauzeitenplan */

/**
 * Netzplan nach DIN 69900: Vorwärts- und Rückwärtsrechnung.
 *
 * Vorgänge: { id, name, dauer, vorgaenger: [{ id, abstand }] }
 * Beziehung ist Ende-Anfang mit Abstand (in Tagen).
 *
 * Vorwärtsrechnung  FAZ = max(FEZ der Vorgänger + Abstand), FEZ = FAZ + D
 * Rückwärtsrechnung SEZ = min(SAZ der Nachfolger − Abstand), SAZ = SEZ − D
 * Gesamtpuffer      GP = SAZ − FAZ; GP = 0 → kritischer Weg
 */
function bauzeitenplan(vorgaenge) {
  const nach = new Map();
  const karte = new Map();
  vorgaenge.forEach((v) => {
    karte.set(v.id, Object.assign({}, v, {
      dauer: Math.max(0, Number(v.dauer) || 0),
      vorgaenger: (v.vorgaenger || []).filter((p) => p && p.id),
      faz: 0, fez: 0, saz: 0, sez: 0, gp: 0, fp: 0, kritisch: false,
    }));
    nach.set(v.id, []);
  });
  karte.forEach((v) => {
    v.vorgaenger.forEach((p) => {
      if (nach.has(p.id)) nach.get(p.id).push({ id: v.id, abstand: Number(p.abstand) || 0 });
    });
  });

  // Reihenfolge nach Abhängigkeit (topologisch); Kreise werden gemeldet
  const grad = new Map();
  karte.forEach((v) => grad.set(v.id, v.vorgaenger.filter((p) => karte.has(p.id)).length));
  const bereit = [];
  grad.forEach((g, id) => { if (g === 0) bereit.push(id); });
  const reihenfolge = [];
  while (bereit.length) {
    const id = bereit.shift();
    reihenfolge.push(id);
    nach.get(id).forEach((n) => {
      grad.set(n.id, grad.get(n.id) - 1);
      if (grad.get(n.id) === 0) bereit.push(n.id);
    });
  }
  const kreis = reihenfolge.length !== karte.size;

  // Vorwärtsrechnung
  reihenfolge.forEach((id) => {
    const v = karte.get(id);
    v.faz = v.vorgaenger.reduce((s, p) => {
      const vor = karte.get(p.id);
      return vor ? Math.max(s, vor.fez + (Number(p.abstand) || 0)) : s;
    }, 0);
    v.fez = v.faz + v.dauer;
  });
  const dauer = reihenfolge.reduce((s, id) => Math.max(s, karte.get(id).fez), 0);

  // Rückwärtsrechnung
  reihenfolge.slice().reverse().forEach((id) => {
    const v = karte.get(id);
    const nachfolger = nach.get(id);
    v.sez = nachfolger.length
      ? nachfolger.reduce((s, n) => Math.min(s, karte.get(n.id).saz - n.abstand), Infinity)
      : dauer;
    v.saz = v.sez - v.dauer;
    v.gp = v.saz - v.faz;
    // freier Puffer: wie weit ein Vorgang verschoben werden kann, ohne die
    // früheste Lage der Nachfolger zu verändern
    v.fp = nachfolger.length
      ? nachfolger.reduce((s, n) => Math.min(s, karte.get(n.id).faz - n.abstand - v.fez), Infinity)
      : v.gp;
    v.kritisch = Math.abs(v.gp) < 1e-9;
  });

  const liste = reihenfolge.map((id) => karte.get(id));
  return {
    vorgaenge: liste,
    dauer,
    kritischerWeg: liste.filter((v) => v.kritisch).map((v) => v.id),
    kreis,
    meldungen: kreis
      ? [{ art: "fehler", text: "Die Anordnungsbeziehungen enthalten einen Kreis – "
        + "ein Vorgang hängt mittelbar von sich selbst ab." }]
      : [],
  };
}

/** Kalenderdatum aus einem Arbeitstag (Wochenenden übersprungen). */
function bauTag(start, tag) {
  const d = new Date(start.getTime());
  let offen = Math.round(tag);
  while (offen > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) offen -= 1;
  }
  // Beginnt der Plan an einem Wochenende, auf den nächsten Werktag rücken
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}

/** Datum als TT.MM.JJJJ. */
function bauDatum(d) {
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}
