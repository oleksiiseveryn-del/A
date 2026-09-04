/**
 * Bewehrung: Regelbewehrung, Stahlliste und Bewehrungsplan.
 *
 * Aus den Bauteilabmessungen, der Betondeckung und den eingegebenen
 * Bewehrungsparametern (Durchmesser, Stababstand, Anzahl) werden die
 * Bewehrungspositionen, ihre Biegeformen und Einzellängen erzeugt. Daraus
 * folgen die Stahlliste je Bauteil und der Stahlauszug nach Durchmessern.
 *
 * Grundlagen:
 *   - Betonstahl B500B nach DIN 488-1, Nenndurchmesser nach DIN 488-2,
 *     Masse je Meter m = π/4 · ds² · 7850 kg/m³
 *   - Mindestbiegerollendurchmesser nach DIN EN 1992-1-1, Tab. 8.1N
 *   - Darstellung nach DIN 1356-1 und DIN EN ISO 3766, Positionsangabe
 *     in der Form „n ⌀ ds e = Abstand"
 *
 * WICHTIG: Die Bewehrung ist eine parametrisierte Regelbewehrung für die
 * Massen- und Kostenermittlung sowie die Werkstattvorbereitung. Sie ist
 * KEINE Bemessung: erforderliche Bewehrungsquerschnitte aus Biegung,
 * Querkraft, Durchstanzen und Rissbreitenbeschränkung, Mindest- und
 * Höchstbewehrung, Verankerungs- und Übergreifungslängen nach
 * DIN EN 1992-1-1 Abs. 8 und 9 sind vom Tragwerksplaner nachzuweisen.
 */

/** Nenndurchmesser des Betonstahls nach DIN 488-2 [mm]. */
const BETONSTAHL_DS = [6, 8, 10, 12, 14, 16, 20, 25, 28, 32];

/** Streckgrenze B500B nach DIN 488-1: fyk = 500 N/mm², fyd = fyk/1,15. */
const BETONSTAHL_FYK = 500;
const BETONSTAHL_GAMMA_S = 1.15;

/** Masse je Meter [kg/m] aus dem Nennquerschnitt, ρ = 7850 kg/m³. */
function stabMasse(ds) {
  return (Math.PI / 4) * (ds / 1000) * (ds / 1000) * 7850;
}

/** Nennquerschnitt eines Stabes [cm²]. */
function stabFlaeche(ds) {
  return (Math.PI / 4) * ds * ds / 100;
}

/**
 * Mindestbiegerollendurchmesser für Haken, Winkelhaken und Schlaufen
 * nach DIN EN 1992-1-1, Tab. 8.1N: ds ≤ 16 mm → 4 ds, sonst 7 ds.
 */
function biegerollenDurchmesser(ds) {
  return ds <= 16 ? 4 * ds : 7 * ds;
}

/** Hakenlänge je Ende: übliche Ausführung 10 ds (mindestens 70 mm). */
function hakenLaenge(ds) {
  return Math.max(10 * ds, 70) / 1000; // m
}

const BIEGEFORMEN = {
  gerade: "gerader Stab",
  haken: "gerader Stab mit 2 Endhaken",
  buegel: "geschlossener Bügel",
  kreisbuegel: "Kreisbügel",
  wendel: "Wendel",
  ubuegel: "U-Bügel",
};

/** Voreinstellung der Bewehrungsparameter je Betonbauteil-Art. */
const BEWEHRUNG_STANDARD = {
  streifenfundament: { dsUnten: 12, sUnten: 150, dsLaengs: 12, nLaengs: 4, dsBuegel: 8, sBuegel: 250, obenAktiv: false },
  einzelfundament:   { dsUnten: 12, sUnten: 150, dsOben: 10, sOben: 200, obenAktiv: false },
  koecherfundament:  { dsUnten: 14, sUnten: 150, dsOben: 12, sOben: 150, obenAktiv: true, dsBuegel: 10, sBuegel: 100 },
  bohrpfahl:         { dsLaengs: 16, nLaengs: 8, dsBuegel: 10, sBuegel: 200 },
  bodenplatte:       { dsUnten: 10, sUnten: 150, dsOben: 10, sOben: 150, obenAktiv: true },
  decke:             { dsUnten: 10, sUnten: 150, dsOben: 8, sOben: 150, obenAktiv: true },
  wand:              { dsUnten: 10, sUnten: 150, dsOben: 8, sOben: 200, obenAktiv: true },
  kellerwand:        { dsUnten: 12, sUnten: 150, dsOben: 10, sOben: 200, obenAktiv: true },
  stuetze:           { dsLaengs: 16, nLaengs: 4, dsBuegel: 8, sBuegel: 200 },
  stuetze_rund:      { dsLaengs: 16, nLaengs: 6, dsBuegel: 8, sBuegel: 200 },
  unterzug:          { dsLaengs: 16, nLaengs: 3, dsOben: 12, nOben: 2, dsBuegel: 8, sBuegel: 200 },
};

/** Beschriftung der Bewehrungsparameter; je Bauteilart abweichend. */
const BEWEHRUNG_FELD_NAMEN = {
  dsUnten: "⌀ unten [mm]", sUnten: "e unten [mm]", dsOben: "⌀ oben [mm]", sOben: "e oben [mm]",
  obenAktiv: "obere Lage", dsLaengs: "⌀ längs [mm]", nLaengs: "n längs", nOben: "n oben",
  dsBuegel: "⌀ Bügel [mm]", sBuegel: "e Bügel [mm]",
};

const BEWEHRUNG_FELD_NAMEN_TYP = {
  wand: { dsUnten: "⌀ lotrecht [mm]", sUnten: "e lotrecht [mm]", dsOben: "⌀ waagerecht [mm]", sOben: "e waagerecht [mm]" },
  kellerwand: { dsUnten: "⌀ lotrecht [mm]", sUnten: "e lotrecht [mm]", dsOben: "⌀ waagerecht [mm]", sOben: "e waagerecht [mm]" },
  streifenfundament: { dsUnten: "⌀ quer [mm]", sUnten: "e quer [mm]" },
  unterzug: { dsLaengs: "⌀ unten [mm]", nLaengs: "n unten", dsOben: "⌀ oben [mm]" },
  bohrpfahl: { dsBuegel: "⌀ Wendel [mm]", sBuegel: "Steigung [mm]" },
  koecherfundament: { dsBuegel: "⌀ Köcherbügel [mm]", sBuegel: "e Köcherbügel [mm]" },
};

function bewehrungFeldName(kind, feld) {
  const typ = BEWEHRUNG_FELD_NAMEN_TYP[kind];
  return (typ && typ[feld]) || BEWEHRUNG_FELD_NAMEN[feld] || feld;
}

/** Allgemeine Vorgaben, vom Anwender überschreibbar. */
const BEWEHRUNG_VORGABE = {
  lieferlaenge: 12,   // m, übliche Lieferlänge Stabstahl
  stossFaktor: 50,    // l0 = Faktor · ds (Richtwert; maßgebend ist DIN EN 1992-1-1 Abs. 8.7.3)
  haken: true,        // Endhaken an geraden Stäben in Platten und Fundamenten
};

/** Vollständiger Parametersatz eines Bauteils mit Voreinstellungen. */
function bewehrungParameter(element) {
  return Object.assign({}, BEWEHRUNG_STANDARD[element.kind] || {}, element.bewehrung || {});
}

/** Anzahl Stäbe über eine Verteilbreite: n = floor(b / e) + 1, mindestens 2. */
function stabAnzahl(verteilbreite, abstand) {
  if (!(abstand > 0)) return 2;
  return Math.max(2, Math.floor(verteilbreite / abstand + 1e-9) + 1);
}

/**
 * Zerlegt einen Stab in lieferbare Längen mit Übergreifungsstößen.
 * @returns {Object} { teile, laenge, gestossen, stossLaenge }
 */
function stabTeilung(laenge, ds, vorgabe) {
  const v = vorgabe || BEWEHRUNG_VORGABE;
  const lieferlaenge = v.lieferlaenge > 0 ? v.lieferlaenge : 12;
  if (laenge <= lieferlaenge) return { teile: 1, laenge, gestossen: false, stossLaenge: 0 };
  const l0 = (v.stossFaktor || 50) * ds / 1000;
  const nutzbar = lieferlaenge - l0;
  if (nutzbar <= 0) return { teile: 1, laenge: lieferlaenge, gestossen: true, stossLaenge: l0 };
  const teile = Math.ceil((laenge - l0) / nutzbar);
  return { teile, laenge: (laenge + (teile - 1) * l0) / teile, gestossen: true, stossLaenge: l0 };
}

/** Einzellänge einer Biegeform [m]; ohne Abzug der Biegerollendurchmesser. */
function biegeLaenge(form, masse, ds) {
  const haken = 2 * hakenLaenge(ds);
  if (form === "gerade") return masse.laenge;
  if (form === "haken") return masse.laenge + haken;
  if (form === "buegel") return 2 * (masse.b + masse.h) + haken;
  if (form === "ubuegel") return masse.laenge + 2 * masse.schenkel + haken;
  if (form === "kreisbuegel") return Math.PI * masse.d + haken;
  if (form === "wendel") {
    const windungen = Math.max(1, masse.laenge / masse.steigung);
    return windungen * Math.hypot(Math.PI * masse.d, masse.steigung);
  }
  return masse.laenge;
}

/**
 * Erzeugt eine Bewehrungsposition.
 * @returns {Object} Position mit Einzellänge, Gesamtlänge und Masse
 */
function machePosition(nr, name, form, ds, anzahl, masse, vorgabe, bemerkung) {
  const einzelRoh = biegeLaenge(form, masse, ds);
  const teilung = form === "wendel"
    ? { teile: 1, laenge: einzelRoh, gestossen: false, stossLaenge: 0 }
    : stabTeilung(einzelRoh, ds, vorgabe);
  const stueck = anzahl * teilung.teile;
  const einzel = teilung.laenge;
  const gesamt = stueck * einzel;
  const hinweise = [];
  if (bemerkung) hinweise.push(bemerkung);
  if (teilung.gestossen) {
    hinweise.push(`in ${teilung.teile} Teile gestoßen, l0 ≈ ${(teilung.stossLaenge * 100).toFixed(0)} cm (${vorgabe.stossFaktor}·ds)`);
  }
  return {
    nr, name, form, formName: BIEGEFORMEN[form] || form, ds,
    anzahl: stueck, einzelLaenge: einzel, gesamtLaenge: gesamt,
    masseJeMeter: stabMasse(ds), masse: gesamt * stabMasse(ds),
    biegerolle: biegerollenDurchmesser(ds), masseAngaben: masse,
    bemerkung: hinweise.join("; "),
  };
}

/**
 * Regelbewehrung eines Betonbauteils.
 *
 * @param {Object} element - Betonbauteil
 * @param {Object} geo - Geometrie aus betonGeometrie()
 * @param {Object} deckung - Betondeckung aus betondeckung()
 * @param {Object} vorgabe - { lieferlaenge, stossFaktor, haken }
 * @returns {Object} { positionen, ansichten, hinweise }
 */
function bewehrungPositionen(element, geo, deckung, vorgabe) {
  const v = Object.assign({}, BEWEHRUNG_VORGABE, vorgabe || {});
  const p = bewehrungParameter(element);
  const c = deckung.cNom / 1000;            // Betondeckung [m]
  const positionen = [];
  const hinweise = [];
  const s = (wert, fallback) => ((wert > 0 ? wert : fallback) / 1000); // Abstand mm -> m
  let nr = 1;
  const gerade = v.haken ? "haken" : "gerade";

  // --- Platten und Fundamente mit unterer (und oberer) Bewehrungslage
  const plattenBewehrung = (lx, lz, obenErlaubt) => {
    const su = s(p.sUnten, 150), so = s(p.sOben, 150);
    const lxNetto = Math.max(lx - 2 * c, 0.1);
    const lzNetto = Math.max(lz - 2 * c, 0.1);
    positionen.push(machePosition(nr++, "untere Lage längs", gerade, p.dsUnten || 12,
      stabAnzahl(lzNetto, su), { laenge: lxNetto }, v, `e = ${(su * 1000).toFixed(0)} mm`));
    positionen.push(machePosition(nr++, "untere Lage quer", gerade, p.dsUnten || 12,
      stabAnzahl(lxNetto, su), { laenge: lzNetto }, v, `e = ${(su * 1000).toFixed(0)} mm`));
    if (obenErlaubt && p.obenAktiv) {
      positionen.push(machePosition(nr++, "obere Lage längs", gerade, p.dsOben || 10,
        stabAnzahl(lzNetto, so), { laenge: lxNetto }, v, `e = ${(so * 1000).toFixed(0)} mm`));
      positionen.push(machePosition(nr++, "obere Lage quer", gerade, p.dsOben || 10,
        stabAnzahl(lxNetto, so), { laenge: lzNetto }, v, `e = ${(so * 1000).toFixed(0)} mm`));
    }
  };

  if (element.kind === "bodenplatte" || element.kind === "decke") {
    plattenBewehrung(geo.laenge, geo.breite, true);
    hinweise.push("Zulagen über Stützen und an Rändern, Durchstanzbewehrung und Randeinfassung nach Bemessung ergänzen.");
  } else if (element.kind === "einzelfundament" || element.kind === "koecherfundament") {
    plattenBewehrung(geo.laenge, geo.breite, true);
    if (element.kind === "koecherfundament" && geo.koecher) {
      const kt = geo.koecher.t;
      const buegelB = geo.koecher.l + 2 * c;
      const buegelH = geo.koecher.b + 2 * c;
      positionen.push(machePosition(nr++, "Köcherbügel", "buegel", p.dsBuegel || 10,
        stabAnzahl(Math.max(kt - 2 * c, 0.1), s(p.sBuegel, 100)),
        { b: buegelB, h: buegelH }, v, `umlaufend, e = ${(p.sBuegel || 100)} mm`));
      hinweise.push("Köcherwände und Verbund der eingestellten Stütze nach DIN EN 1992-1-1 Abs. 10 nachweisen.");
    }
    hinweise.push("Anschlussbewehrung (Steckeisen) der aufgehenden Stütze ist gesondert zu erfassen.");
  } else if (element.kind === "streifenfundament") {
    const laengs = Math.max(geo.laenge - 2 * c, 0.1);
    const quer = Math.max(geo.breite - 2 * c, 0.1);
    positionen.push(machePosition(nr++, "Längsbewehrung unten", gerade, p.dsLaengs || 12,
      Math.max(2, p.nLaengs || 4), { laenge: laengs }, v, "gleichmäßig über die Breite"));
    positionen.push(machePosition(nr++, "Querbewehrung / Steckbügel", gerade, p.dsUnten || 12,
      stabAnzahl(laengs, s(p.sUnten, 150)), { laenge: quer }, v, `e = ${(p.sUnten || 150)} mm`));
  } else if (element.kind === "wand" || element.kind === "kellerwand") {
    const l = Math.max(geo.laenge - 2 * c, 0.1);
    const h = Math.max(geo.hoehe - 2 * c, 0.1);
    const sv = s(p.sUnten, 150), sh = s(p.sOben, 200);
    positionen.push(machePosition(nr++, "lotrechte Bewehrung, beide Seiten", gerade, p.dsUnten || 10,
      2 * stabAnzahl(l, sv), { laenge: h }, v, `je Seite e = ${(p.sUnten || 150)} mm`));
    positionen.push(machePosition(nr++, "waagerechte Bewehrung, beide Seiten", gerade, p.dsOben || 8,
      2 * stabAnzahl(h, sh), { laenge: l }, v, `je Seite e = ${(p.sOben || 200)} mm`));
    hinweise.push("Anschlussbewehrung an Decke und Fundament sowie Randeinfassung der Öffnungen ergänzen.");
  } else if (element.kind === "stuetze") {
    const h = geo.hoehe;
    const bBuegel = Math.max(geo.laenge - 2 * c, 0.05);
    const hBuegel = Math.max(geo.breite - 2 * c, 0.05);
    positionen.push(machePosition(nr++, "Längsbewehrung", "gerade", p.dsLaengs || 16,
      Math.max(4, p.nLaengs || 4), { laenge: h + (v.stossFaktor || 50) * (p.dsLaengs || 16) / 1000 }, v,
      "einschließlich Übergreifungsstoß am Fußpunkt"));
    positionen.push(machePosition(nr++, "Bügel", "buegel", p.dsBuegel || 8,
      stabAnzahl(Math.max(h - 2 * c, 0.1), s(p.sBuegel, 200)), { b: bBuegel, h: hBuegel }, v,
      `e = ${(p.sBuegel || 200)} mm`));
    hinweise.push("Bügelabstand im Stoßbereich und an den Enden nach DIN EN 1992-1-1 Abs. 9.5.3 verdichten.");
  } else if (element.kind === "stuetze_rund") {
    const h = geo.hoehe;
    const dBuegel = Math.max(geo.laenge - 2 * c, 0.05);
    positionen.push(machePosition(nr++, "Längsbewehrung", "gerade", p.dsLaengs || 16,
      Math.max(6, p.nLaengs || 6), { laenge: h + (v.stossFaktor || 50) * (p.dsLaengs || 16) / 1000 }, v,
      "einschließlich Übergreifungsstoß am Fußpunkt"));
    positionen.push(machePosition(nr++, "Kreisbügel", "kreisbuegel", p.dsBuegel || 8,
      stabAnzahl(Math.max(h - 2 * c, 0.1), s(p.sBuegel, 200)), { d: dBuegel }, v,
      `e = ${(p.sBuegel || 200)} mm`));
  } else if (element.kind === "unterzug") {
    const l = Math.max(geo.laenge - 2 * c, 0.1);
    const bBuegel = Math.max(geo.breite - 2 * c, 0.05);
    const hBuegel = Math.max(geo.hoehe - 2 * c, 0.05);
    positionen.push(machePosition(nr++, "Feldbewehrung unten", "haken", p.dsLaengs || 16,
      Math.max(2, p.nLaengs || 3), { laenge: l }, v, "mit Endhaken verankert"));
    positionen.push(machePosition(nr++, "Montage-/Stützbewehrung oben", "gerade", p.dsOben || 12,
      Math.max(2, p.nOben || 2), { laenge: l }, v, "konstruktiv"));
    positionen.push(machePosition(nr++, "Bügel", "buegel", p.dsBuegel || 8,
      stabAnzahl(l, s(p.sBuegel, 200)), { b: bBuegel, h: hBuegel }, v, `e = ${(p.sBuegel || 200)} mm`));
    hinweise.push("Bügelabstände aus der Querkraftbemessung, Zulagen über den Auflagern ergänzen.");
  } else if (element.kind === "bohrpfahl") {
    const l = geo.hoehe;                       // Pfahllänge
    const dKorb = Math.max(geo.laenge - 2 * c, 0.1);
    const steigung = s(p.sBuegel, 200);
    positionen.push(machePosition(nr++, "Längsstäbe Bewehrungskorb", "gerade", p.dsLaengs || 16,
      Math.max(6, p.nLaengs || 8), { laenge: l }, v, "gleichmäßig auf dem Korbumfang"));
    positionen.push(machePosition(nr++, "Wendel", "wendel", p.dsBuegel || 10, 1,
      { d: dKorb, laenge: l, steigung }, v, `Steigung ${(steigung * 1000).toFixed(0)} mm`));
    hinweise.push("Bewehrungskorb, Abstandhalter und Betondeckung nach DIN EN 1536; Korblänge aus der Bemessung.");
  }

  return { positionen, hinweise, parameter: p, vorgabe: v };
}

/**
 * Stahlliste eines Bauteils: Positionen mit Stückzahl des Bauteils multipliziert.
 * @returns {Object} { zeilen, gesamtMasse, jeDurchmesser }
 */
function stahlliste(eintraege) {
  const zeilen = [];
  const jeDs = new Map();
  let gesamt = 0;

  eintraege.forEach(({ bauteil, anzahlBauteile, positionen }) => {
    positionen.forEach((pos) => {
      const stueck = pos.anzahl * Math.max(1, anzahlBauteile || 1);
      const gesamtLaenge = stueck * pos.einzelLaenge;
      const masse = gesamtLaenge * pos.masseJeMeter;
      gesamt += masse;
      zeilen.push({
        bauteil, pos: pos.nr, name: pos.name, form: pos.form, formName: pos.formName,
        ds: pos.ds, anzahl: stueck, einzelLaenge: pos.einzelLaenge,
        gesamtLaenge, masseJeMeter: pos.masseJeMeter, masse,
        biegerolle: pos.biegerolle, bemerkung: pos.bemerkung, masseAngaben: pos.masseAngaben,
      });
      const eintrag = jeDs.get(pos.ds) || { ds: pos.ds, laenge: 0, masse: 0, stueck: 0 };
      eintrag.laenge += gesamtLaenge;
      eintrag.masse += masse;
      eintrag.stueck += stueck;
      jeDs.set(pos.ds, eintrag);
    });
  });

  const jeDurchmesser = Array.from(jeDs.values()).sort((a, b) => a.ds - b.ds);
  return { zeilen, gesamtMasse: gesamt, jeDurchmesser };
}

/* ------------------------------------------------------- Zeichnungsdaten */

/**
 * Ansichtsdaten für den Bewehrungsplan: Hauptansicht und Querschnitt mit
 * den Bewehrungsstäben als Linien bzw. Punkten. Alle Maße in Metern,
 * Ursprung links unten der jeweiligen Ansicht.
 */
function bewehrungAnsichten(element, geo, deckung, positionen) {
  const c = deckung.cNom / 1000;
  const p = bewehrungParameter(element);
  const kind = element.kind;
  const linien = [];
  const punkte = [];
  const marken = [];   // Positionsfahnen { pos, x, y, text, ansicht }

  const verteile = (von, bis, anzahl) => {
    const werte = [];
    if (anzahl <= 1) return [(von + bis) / 2];
    const schritt = (bis - von) / (anzahl - 1);
    for (let i = 0; i < anzahl; i++) werte.push(von + i * schritt);
    return werte;
  };
  const posText = (pos) => `${pos.anzahl} ⌀${pos.ds}${pos.bemerkung && /e = /.test(pos.bemerkung) ? " " + pos.bemerkung.match(/e = \d+ mm/)[0].replace(" mm", "") : ""}`;
  const zeichenAnzahl = (n) => Math.min(n, 24); // Darstellung begrenzen, Angabe bleibt vollständig

  // ---- Platten, Fundamente: Hauptansicht = Grundriss, Schnitt = Längsschnitt
  if (kind === "bodenplatte" || kind === "decke" || kind === "einzelfundament" || kind === "koecherfundament") {
    const lx = geo.laenge, lz = geo.breite, d = geo.dicke;
    const pos1 = positionen[0], pos2 = positionen[1];
    const n1 = zeichenAnzahl(pos1 ? pos1.anzahl : 5);
    const n2 = zeichenAnzahl(pos2 ? pos2.anzahl : 5);
    verteile(c, lz - c, n1).forEach((z) => linien.push({ x1: c, y1: z, x2: lx - c, y2: z, pos: 1 }));
    verteile(c, lx - c, n2).forEach((x) => linien.push({ x1: x, y1: c, x2: x, y2: lz - c, pos: 2 }));
    if (pos1) marken.push({ pos: 1, x: lx / 2, y: lz - c, text: posText(pos1), ansicht: "haupt" });
    if (pos2) marken.push({ pos: 2, x: lx - c, y: lz / 2, text: posText(pos2), ansicht: "haupt" });

    const aussparung = kind === "koecherfundament" && geo.koecher
      ? { x: (lx - geo.koecher.l) / 2, y: (lz - geo.koecher.b) / 2, b: geo.koecher.l, h: geo.koecher.b }
      : null;
    // Köcher: die obere Lage endet an der Aussparung
    const ausVon = aussparung ? aussparung.x : null;
    const ausBis = aussparung ? aussparung.x + aussparung.b : null;

    const untereLage = verteile(c, lx - c, zeichenAnzahl(n2));
    untereLage.forEach((x) => punkte.push({ x, y: c, ds: pos2 ? pos2.ds : 12, pos: 2 }));
    const schnittLinien = [{ x1: c, y1: c, x2: lx - c, y2: c, pos: 1 }];
    if (p.obenAktiv && positionen[2]) {
      untereLage
        .filter((x) => !aussparung || x < ausVon - c || x > ausBis + c)
        .forEach((x) => punkte.push({ x, y: d - c, ds: positionen[3] ? positionen[3].ds : 10, pos: 4 }));
      if (aussparung) {
        schnittLinien.push({ x1: c, y1: d - c, x2: ausVon, y2: d - c, pos: 3 });
        schnittLinien.push({ x1: ausBis, y1: d - c, x2: lx - c, y2: d - c, pos: 3 });
      } else {
        schnittLinien.push({ x1: c, y1: d - c, x2: lx - c, y2: d - c, pos: 3 });
      }
      marken.push({ pos: 3, x: aussparung ? c + (ausVon - c) / 2 : lx / 2, y: d - c, text: posText(positionen[2]), ansicht: "schnitt" });
    }
    marken.push({ pos: 1, x: lx / 2, y: c, text: pos1 ? posText(pos1) : "", ansicht: "schnitt" });

    return {
      haupt: { titel: kind === "decke" ? "Draufsicht" : "Grundriss", breite: lx, hoehe: lz, linien, aussparung,
        beschriftungX: "a", beschriftungY: "b" },
      schnitt: { titel: "Schnitt A–A", breite: lx, hoehe: d, punkte, linien: schnittLinien,
        aussparung: aussparung ? { x: aussparung.x, y: d - geo.koecher.t, b: geo.koecher.l, h: geo.koecher.t } : null },
      marken,
    };
  }

  // ---- Streifenfundament: Grundriss und Querschnitt
  if (kind === "streifenfundament") {
    const l = geo.laenge, b = geo.breite, d = geo.dicke;
    const pos1 = positionen[0], pos2 = positionen[1];
    verteile(c, b - c, zeichenAnzahl(pos1 ? pos1.anzahl : 4)).forEach((y) =>
      linien.push({ x1: c, y1: y, x2: l - c, y2: y, pos: 1 }));
    verteile(c, l - c, zeichenAnzahl(pos2 ? pos2.anzahl : 8)).forEach((x) =>
      linien.push({ x1: x, y1: c, x2: x, y2: b - c, pos: 2 }));
    verteile(c, b - c, zeichenAnzahl(pos1 ? pos1.anzahl : 4)).forEach((y) =>
      punkte.push({ x: y, y: c, ds: pos1 ? pos1.ds : 12, pos: 1 }));
    if (pos1) marken.push({ pos: 1, x: l / 2, y: b - c, text: posText(pos1), ansicht: "haupt" });
    if (pos2) marken.push({ pos: 2, x: l - c, y: b / 2, text: posText(pos2), ansicht: "haupt" });
    return {
      haupt: { titel: "Grundriss", breite: l, hoehe: b, linien, beschriftungX: "L", beschriftungY: "b" },
      schnitt: { titel: "Schnitt A–A", breite: b, hoehe: d, punkte,
        linien: [{ x1: c, y1: c, x2: b - c, y2: c, pos: 2 }] },
      marken,
    };
  }

  // ---- Wände: Ansicht und waagerechter Schnitt
  if (kind === "wand" || kind === "kellerwand") {
    const l = geo.laenge, h = geo.hoehe, d = geo.dicke;
    const pos1 = positionen[0], pos2 = positionen[1];
    const nV = zeichenAnzahl(pos1 ? pos1.anzahl / 2 : 8);
    const nH = zeichenAnzahl(pos2 ? pos2.anzahl / 2 : 8);
    verteile(c, l - c, nV).forEach((x) => linien.push({ x1: x, y1: c, x2: x, y2: h - c, pos: 1 }));
    verteile(c, h - c, nH).forEach((y) => linien.push({ x1: c, y1: y, x2: l - c, y2: y, pos: 2 }));
    if (pos1) marken.push({ pos: 1, x: l / 2, y: h - c, text: posText(pos1), ansicht: "haupt" });
    if (pos2) marken.push({ pos: 2, x: l - c, y: h / 2, text: posText(pos2), ansicht: "haupt" });
    verteile(c, l - c, nV).forEach((x) => {
      punkte.push({ x, y: c, ds: pos1 ? pos1.ds : 10, pos: 1 });
      punkte.push({ x, y: d - c, ds: pos1 ? pos1.ds : 10, pos: 1 });
    });
    return {
      haupt: { titel: "Ansicht", breite: l, hoehe: h, linien, beschriftungX: "L", beschriftungY: "h" },
      schnitt: { titel: "Waagerechter Schnitt", breite: l, hoehe: d, punkte, linien: [] },
      marken,
    };
  }

  // ---- Stützen und Unterzüge: Ansicht mit Bügeln, Querschnitt
  if (kind === "stuetze" || kind === "stuetze_rund" || kind === "unterzug") {
    const laengs = positionen[0];
    const buegel = positionen[positionen.length - 1];
    const rund = kind === "stuetze_rund";
    const quer = kind === "unterzug" ? geo.breite : (rund ? geo.laenge : geo.breite);
    const ansichtBreite = kind === "unterzug" ? geo.laenge : geo.laenge;
    const ansichtHoehe = kind === "unterzug" ? geo.hoehe : geo.hoehe;

    if (kind === "unterzug") {
      // Längsstäbe waagerecht, Bügel lotrecht
      verteile(c, c + 0.001 + (geo.hoehe - 2 * c) * 0.0, Math.max(1, 1)).forEach(() => {});
      linien.push({ x1: c, y1: c, x2: ansichtBreite - c, y2: c, pos: 1 });
      linien.push({ x1: c, y1: ansichtHoehe - c, x2: ansichtBreite - c, y2: ansichtHoehe - c, pos: 2 });
      verteile(c, ansichtBreite - c, zeichenAnzahl(buegel ? buegel.anzahl : 10)).forEach((x) =>
        linien.push({ x1: x, y1: c, x2: x, y2: ansichtHoehe - c, pos: positionen.length }));
      if (laengs) marken.push({ pos: 1, x: ansichtBreite / 2, y: c, text: posText(laengs), ansicht: "haupt" });
      if (buegel) marken.push({ pos: positionen.length, x: ansichtBreite * 0.25, y: ansichtHoehe / 2, text: posText(buegel), ansicht: "haupt" });
    } else {
      // Stütze: Längsstäbe lotrecht, Bügel waagerecht
      verteile(c, ansichtBreite - c, Math.max(2, Math.min(laengs ? laengs.anzahl : 4, 6))).forEach((x) =>
        linien.push({ x1: x, y1: c, x2: x, y2: ansichtHoehe - c, pos: 1 }));
      verteile(c, ansichtHoehe - c, zeichenAnzahl(buegel ? buegel.anzahl : 10)).forEach((y) =>
        linien.push({ x1: c, y1: y, x2: ansichtBreite - c, y2: y, pos: 2 }));
      if (laengs) marken.push({ pos: 1, x: ansichtBreite / 2, y: ansichtHoehe * 0.75, text: posText(laengs), ansicht: "haupt" });
      if (buegel) marken.push({ pos: 2, x: ansichtBreite - c, y: ansichtHoehe / 2, text: posText(buegel), ansicht: "haupt" });
    }

    // Querschnitt mit Bügel und Eckstäben
    const qb = rund ? geo.laenge : (kind === "unterzug" ? geo.breite : geo.laenge);
    const qh = kind === "unterzug" ? geo.hoehe : quer;
    const anzahlLaengs = laengs ? laengs.anzahl : 4;
    if (rund) {
      const r = qb / 2 - c;
      for (let i = 0; i < anzahlLaengs; i++) {
        const w = (2 * Math.PI * i) / anzahlLaengs;
        punkte.push({ x: qb / 2 + r * Math.cos(w), y: qb / 2 + r * Math.sin(w), ds: laengs ? laengs.ds : 16, pos: 1 });
      }
    } else if (kind === "unterzug") {
      const unten = positionen[0], oben = positionen[1];
      verteile(c, qb - c, Math.max(2, unten ? unten.anzahl : 3)).forEach((x) =>
        punkte.push({ x, y: c, ds: unten ? unten.ds : 16, pos: 1 }));
      verteile(c, qb - c, Math.max(2, oben ? oben.anzahl : 2)).forEach((x) =>
        punkte.push({ x, y: qh - c, ds: oben ? oben.ds : 12, pos: 2 }));
    } else {
      const proSeite = Math.max(2, Math.round(Math.sqrt(anzahlLaengs)));
      verteile(c, qb - c, proSeite).forEach((x) => {
        punkte.push({ x, y: c, ds: laengs ? laengs.ds : 16, pos: 1 });
        punkte.push({ x, y: qh - c, ds: laengs ? laengs.ds : 16, pos: 1 });
      });
    }

    return {
      haupt: { titel: "Ansicht", breite: ansichtBreite, hoehe: ansichtHoehe, linien,
        beschriftungX: kind === "unterzug" ? "L" : "b", beschriftungY: "h" },
      schnitt: { titel: "Querschnitt", breite: qb, hoehe: qh, punkte, linien: [],
        rund, buegelRahmen: !rund ? { x: c, y: c, b: qb - 2 * c, h: qh - 2 * c } : null,
        buegelKreis: rund ? { x: qb / 2, y: qb / 2, r: qb / 2 - c } : null },
      marken,
    };
  }

  // ---- Bohrpfahl: Ansicht des Korbes und Querschnitt
  if (kind === "bohrpfahl") {
    const d = geo.laenge, l = geo.hoehe;
    const laengs = positionen[0], wendel = positionen[1];
    const nDarstellung = Math.min(laengs ? laengs.anzahl : 6, 6);
    verteile(c, d - c, nDarstellung).forEach((x) => linien.push({ x1: x, y1: 0, x2: x, y2: l, pos: 1 }));
    const steigung = (bewehrungParameter(element).sBuegel || 200) / 1000;
    const windungen = Math.min(Math.floor(l / steigung), 40);
    for (let i = 0; i < windungen; i++) {
      const y0 = i * (l / Math.max(windungen, 1));
      const y1 = (i + 1) * (l / Math.max(windungen, 1));
      linien.push({ x1: c, y1: y0, x2: d - c, y2: y1, pos: 2 });
    }
    if (laengs) marken.push({ pos: 1, x: d / 2, y: l * 0.15, text: posText(laengs), ansicht: "haupt" });
    if (wendel) marken.push({ pos: 2, x: d - c, y: l * 0.6, text: `⌀${wendel.ds} Wendel`, ansicht: "haupt" });

    const r = d / 2 - c;
    const nKorb = laengs ? laengs.anzahl : 8;
    for (let i = 0; i < nKorb; i++) {
      const w = (2 * Math.PI * i) / nKorb;
      punkte.push({ x: d / 2 + r * Math.cos(w), y: d / 2 + r * Math.sin(w), ds: laengs ? laengs.ds : 16, pos: 1 });
    }
    return {
      haupt: { titel: "Bewehrungskorb", breite: d, hoehe: l, linien, beschriftungX: "⌀", beschriftungY: "L" },
      schnitt: { titel: "Querschnitt", breite: d, hoehe: d, punkte, linien: [], rund: true,
        buegelKreis: { x: d / 2, y: d / 2, r } },
      marken,
    };
  }

  return { haupt: { titel: "Ansicht", breite: geo.laenge, hoehe: geo.hoehe, linien }, schnitt: null, marken };
}

/* ----------------------------------------------------- Bewehrungsplan */

/** Bricht einen Text an Wortgrenzen auf die angegebene Zeichenzahl um. */
function umbrechen(text, maxZeichen) {
  const worte = String(text).split(" ");
  const zeilen = [];
  let aktuell = "";
  worte.forEach((wort) => {
    if (!aktuell) { aktuell = wort; return; }
    if ((aktuell + " " + wort).length <= maxZeichen) aktuell += " " + wort;
    else { zeilen.push(aktuell); aktuell = wort; }
  });
  if (aktuell) zeilen.push(aktuell);
  return zeilen;
}

/** Zeichnet eine Ansicht (Umriss, Betondeckung, Stäbe) in ein Feld des Blattes. */
function zeichneBewehrungsAnsicht(ansicht, feld, nenner, deckung, marken) {
  if (!ansicht) return "";
  const m = (wert) => (wert * 1000) / nenner;      // Meter -> Blattmillimeter
  const W = m(ansicht.breite), H = m(ansicht.hoehe);
  const x0 = feld.x + (feld.b - W) / 2;
  const yUK = feld.y + (feld.h + H) / 2;           // Unterkante der Darstellung
  const px = (x) => x0 + m(x);
  const py = (y) => yUK - m(y);
  const c = deckung.cNom / 1000;
  let svg = "";

  // Bauteilumriss
  if (ansicht.rund) {
    svg += `<circle cx="${px(ansicht.breite / 2).toFixed(2)}" cy="${py(ansicht.hoehe / 2).toFixed(2)}" r="${(W / 2).toFixed(2)}" class="beton"/>`;
  } else {
    svg += `<rect x="${x0.toFixed(2)}" y="${(yUK - H).toFixed(2)}" width="${W.toFixed(2)}" height="${H.toFixed(2)}" class="beton"/>`;
  }

  // Aussparung (Köcher)
  if (ansicht.aussparung) {
    const a = ansicht.aussparung;
    svg += `<rect x="${px(a.x).toFixed(2)}" y="${py(a.y + a.h).toFixed(2)}" width="${m(a.b).toFixed(2)}" height="${m(a.h).toFixed(2)}" class="aussparung"/>`;
  }

  // Betondeckung als gestrichelte Hilfslinie
  if (!ansicht.rund && m(c) > 0.4) {
    svg += `<rect x="${px(c).toFixed(2)}" y="${py(ansicht.hoehe - c).toFixed(2)}" width="${(W - 2 * m(c)).toFixed(2)}" height="${(H - 2 * m(c)).toFixed(2)}" class="deckung"/>`;
  }

  // Bügelrahmen bzw. Kreisbügel im Querschnitt
  if (ansicht.buegelRahmen) {
    const r = ansicht.buegelRahmen;
    svg += `<rect x="${px(r.x).toFixed(2)}" y="${py(r.y + r.h).toFixed(2)}" width="${m(r.b).toFixed(2)}" height="${m(r.h).toFixed(2)}" class="stab" fill="none"/>`;
  }
  if (ansicht.buegelKreis) {
    const k = ansicht.buegelKreis;
    svg += `<circle cx="${px(k.x).toFixed(2)}" cy="${py(k.y).toFixed(2)}" r="${m(k.r).toFixed(2)}" class="stab" fill="none"/>`;
  }

  // Bewehrungsstäbe
  (ansicht.linien || []).forEach((l) => {
    svg += `<line x1="${px(l.x1).toFixed(2)}" y1="${py(l.y1).toFixed(2)}" x2="${px(l.x2).toFixed(2)}" y2="${py(l.y2).toFixed(2)}" class="stab"/>`;
  });
  (ansicht.punkte || []).forEach((pt) => {
    const r = Math.max(m(pt.ds / 1000) / 2, 0.45);
    svg += `<circle cx="${px(pt.x).toFixed(2)}" cy="${py(pt.y).toFixed(2)}" r="${r.toFixed(2)}" class="stabpunkt"/>`;
  });

  // Positionsfahnen: Kreis mit Nummer und Angabe n ⌀ds e
  (marken || []).forEach((mk, i) => {
    const zx = px(mk.x), zy = py(mk.y);
    const fx = zx + (i % 2 === 0 ? 10 : -10);
    const fy = zy - 8 - (i % 3) * 4;
    svg += `<line x1="${zx.toFixed(2)}" y1="${zy.toFixed(2)}" x2="${fx.toFixed(2)}" y2="${fy.toFixed(2)}" class="fahne"/>`;
    svg += `<circle cx="${fx.toFixed(2)}" cy="${fy.toFixed(2)}" r="2.6" class="poskreis"/>`;
    svg += `<text x="${fx.toFixed(2)}" y="${(fy + 1).toFixed(2)}" class="t-pos">${mk.pos}</text>`;
    svg += `<text x="${(fx + 3.4).toFixed(2)}" y="${(fy + 1).toFixed(2)}" class="t-posangabe">${mk.text}</text>`;
  });

  // Maßketten für die Außenmaße
  const yMass = yUK + 7;
  svg += massketteWaagerecht([x0, x0 + W], yMass, yUK, "kette");
  svg += `<text x="${(x0 + W / 2).toFixed(2)}" y="${(yMass - 1.4).toFixed(2)}" class="t-mass">${meterText(ansicht.breite)}</text>`;
  const xMass = x0 - 7;
  svg += massketteLotrecht([yUK, yUK - H], xMass, x0);
  svg += `<text x="${(xMass - 1.6).toFixed(2)}" y="${(yUK - H / 2).toFixed(2)}" class="t-mass" transform="rotate(-90 ${(xMass - 1.6).toFixed(2)} ${(yUK - H / 2).toFixed(2)})">${meterText(ansicht.hoehe)}</text>`;

  svg += `<text x="${feld.x.toFixed(2)}" y="${(feld.y + 3).toFixed(2)}" class="t-kopf">${ansicht.titel} · M 1:${nenner}</text>`;
  return svg;
}

/**
 * Bewehrungsplan eines Betonbauteils als A4-Blatt (quer) mit Stahlliste.
 * @param {Object} daten - { element, geo, deckung, bezeichnung, typName,
 *                           positionen, ansichten, hinweise, projekt, guete }
 * @returns {string} vollständiges SVG
 */
function bewehrungsplanSVG(daten) {
  const { geo, deckung, bezeichnung, typName, positionen, ansichten, hinweise, projekt } = daten;

  const zeichenBreite = 150;
  const feldHaupt = { x: BLATT.randLinks + 6, y: BLATT.randOben + 6, b: zeichenBreite, h: 78 };
  const feldSchnitt = { x: BLATT.randLinks + 6, y: BLATT.randOben + 92, b: zeichenBreite, h: 62 };

  const nennerHaupt = waehleMassstab(ansichten.haupt.breite, ansichten.haupt.hoehe, feldHaupt.b - 24, feldHaupt.h - 18);
  const nennerSchnitt = ansichten.schnitt
    ? waehleMassstab(ansichten.schnitt.breite, ansichten.schnitt.hoehe, feldSchnitt.b - 24, feldSchnitt.h - 18)
    : nennerHaupt;

  const markenHaupt = ansichten.marken.filter((mk) => mk.ansicht === "haupt");
  const markenSchnitt = ansichten.marken.filter((mk) => mk.ansicht === "schnitt");

  let svg = "";
  svg += zeichneBewehrungsAnsicht(ansichten.haupt, feldHaupt, nennerHaupt, deckung, markenHaupt);
  if (ansichten.schnitt) {
    svg += zeichneBewehrungsAnsicht(ansichten.schnitt, feldSchnitt, nennerSchnitt, deckung, markenSchnitt);
  }

  // ---- Stahlliste rechts
  const xL = BLATT.randLinks + zeichenBreite + 16;
  const spalten = [0, 7, 16, 25, 42, 58, 72];   // Pos, ⌀, n, Einzellänge, Gesamtlänge, kg
  let yL = BLATT.randOben + 6;
  svg += `<text x="${xL}" y="${yL}" class="t-kopf">Stahlliste ${bezeichnung} · Betonstahl B500B nach DIN 488</text>`;
  yL += 5;
  const kopf = ["Pos", "⌀ [mm]", "Anzahl", "Länge [m]", "Gesamt [m]", "Masse [kg]"];
  kopf.forEach((t, i) => {
    svg += `<text x="${(xL + spalten[i]).toFixed(2)}" y="${yL}" class="t-th">${t}</text>`;
  });
  svg += `<line x1="${xL}" y1="${(yL + 1.4).toFixed(2)}" x2="${(xL + 78).toFixed(2)}" y2="${(yL + 1.4).toFixed(2)}" class="tabelle"/>`;
  yL += 4.6;

  let summeMasse = 0, summeLaenge = 0;
  positionen.forEach((pos) => {
    summeMasse += pos.masse;
    summeLaenge += pos.gesamtLaenge;
    const werte = [String(pos.nr), String(pos.ds), String(pos.anzahl),
      pos.einzelLaenge.toFixed(2), pos.gesamtLaenge.toFixed(2), pos.masse.toFixed(1)];
    werte.forEach((t, i) => {
      svg += `<text x="${(xL + spalten[i]).toFixed(2)}" y="${yL}" class="t-td">${t}</text>`;
    });
    yL += 3.6;
    svg += `<text x="${(xL + 7).toFixed(2)}" y="${yL}" class="t-tdklein">${pos.name} · ${pos.formName}</text>`;
    yL += 4.2;
  });
  svg += `<line x1="${xL}" y1="${(yL - 2.6).toFixed(2)}" x2="${(xL + 78).toFixed(2)}" y2="${(yL - 2.6).toFixed(2)}" class="tabelle"/>`;
  svg += `<text x="${xL}" y="${yL}" class="t-th">Summe</text>`;
  svg += `<text x="${(xL + spalten[4]).toFixed(2)}" y="${yL}" class="t-th">${summeLaenge.toFixed(2)}</text>`;
  svg += `<text x="${(xL + spalten[5]).toFixed(2)}" y="${yL}" class="t-th">${summeMasse.toFixed(1)}</text>`;
  yL += 6;

  // ---- Angaben zum Bauteil
  const zeilen = [
    `Bauteil ${bezeichnung} · ${typName}`,
    `Abmessungen ${geo.beschreibung}`,
    `Beton ${daten.guete} · Expositionsklasse ${daten.expo}`,
    `Betondeckung c_nom = ${deckung.cNom} mm (c_min ${deckung.cMin} + Δc_dev ${deckung.deltaC}), maßgebend: ${deckung.massgebend}`,
    `Betonvolumen ${daten.volumen.toFixed(2)} m³ · Betonstahl ${summeMasse.toFixed(0)} kg · ${(summeMasse / Math.max(daten.volumen, 0.001)).toFixed(0)} kg/m³`,
    `Biegerollendurchmesser nach DIN EN 1992-1-1 Tab. 8.1N; Längen ohne Abzug der Biegerollen`,
  ];
  zeilen.forEach((t) => {
    umbrechen(t, 58).forEach((zeile, i) => {
      svg += `<text x="${(xL + (i ? 2 : 0)).toFixed(2)}" y="${yL}" class="t-klein">${zeile}</text>`;
      yL += 3.6;
    });
    yL += 0.6;
  });
  (hinweise || []).forEach((t) => {
    umbrechen(t, 62).forEach((zeile, i) => {
      svg += `<text x="${(xL + (i ? 2.4 : 0)).toFixed(2)}" y="${yL}" class="t-hinweisliste">${i ? "" : "• "}${zeile}</text>`;
      yL += 3.4;
    });
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
  svg += `<text x="${sfX + 3}" y="${sfY + 15}" class="t-klein">${projekt.name || "Projekt"} · Bewehrungsplan ${bezeichnung} · ${typName}</text>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 25}" class="t-klein">Bearbeiter: ${projekt.bearbeiter}</text>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 28.5}" class="t-klein">Datum: ${projekt.datum}</text>`;
  svg += `<text x="${sfX + 65}" y="${sfY + 25}" class="t-massstab">M 1:${nennerHaupt}</text>`;
  svg += `<text x="${sfX + 65}" y="${sfY + 28.5}" class="t-klein">Bewehrung</text>`;

  svg += `<text x="${BLATT.randLinks}" y="${BLATT.hoehe - 4}" class="t-hinweis">Regelbewehrung für Massenermittlung und Werkstattvorbereitung – keine Bemessung. Erforderliche Bewehrung, Verankerungs- und Übergreifungslängen nach DIN EN 1992-1-1 durch den Tragwerksplaner.</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BLATT.breite} ${BLATT.hoehe}" width="100%" style="background:#fff">
<style>
  .beton { fill: #f1eee8; stroke: #1b2733; stroke-width: 0.5; }
  .aussparung { fill: #ffffff; stroke: #1b2733; stroke-width: 0.35; stroke-dasharray: 1.6 1.2; }
  .deckung { fill: none; stroke: #8a97a3; stroke-width: 0.18; stroke-dasharray: 1.2 1.0; }
  .stab { stroke: #b3392c; stroke-width: 0.45; fill: none; }
  .stabpunkt { fill: #b3392c; stroke: none; }
  .fahne { stroke: #1b2733; stroke-width: 0.18; }
  .poskreis { fill: #ffffff; stroke: #1b2733; stroke-width: 0.35; }
  .ml, .mhl, .mb { stroke: #1b2733; }
  .ml { stroke-width: 0.25; }
  .mhl { stroke-width: 0.13; }
  .mb { stroke-width: 0.35; }
  .tabelle { stroke: #1b2733; stroke-width: 0.25; }
  .schriftfeld { fill: none; stroke: #1b2733; stroke-width: 0.35; }
  text { font-family: "IBM Plex Sans", Arial, sans-serif; fill: #1b2733; }
  .t-mass { font-size: 2.5px; text-anchor: middle; }
  .t-kopf { font-size: 3.2px; font-weight: 600; }
  .t-pos { font-size: 2.6px; text-anchor: middle; font-weight: 700; }
  .t-posangabe { font-size: 2.5px; }
  .t-th { font-size: 2.5px; font-weight: 700; }
  .t-td { font-size: 2.5px; font-family: "IBM Plex Mono", monospace; }
  .t-tdklein { font-size: 2.2px; fill: #64707c; }
  .t-klein { font-size: 2.6px; }
  .t-hinweisliste { font-size: 2.4px; fill: #64707c; }
  .t-firma { font-size: 4.5px; font-weight: 700; }
  .t-massstab { font-size: 4px; font-weight: 600; }
  .t-hinweis { font-size: 2.2px; fill: #64707c; }
</style>
${svg}
</svg>`;
}
