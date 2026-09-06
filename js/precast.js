/**
 * Betonfertigteile: Elementliste, Gewichte, Transport und Montage.
 *
 * Ein Fertigteil ist drei Dinge zugleich: ein Bauteil im Modell, ein Stück
 * Ladung auf der Straße und ein Hub am Kran. Dieses Modul führt alle drei
 * Seiten an derselben Geometrie.
 *
 * Geführt werden:
 *
 *   Geometrie   Regelquerschnitte der gängigen Fertigteile mit ihren
 *               Hohlräumen: Hohlplatte, Doppel-T-Platte, Doppelwand,
 *               Elementdecke, Sandwichwand, Stütze, Binder, Treppenlauf
 *   Massen      Betonvolumen und Eigenlast; getrennt geführt werden
 *               Transportgewicht (was das Werk verlässt) und Endgewicht
 *               (nach Ortbetonergänzung)
 *   Anschlagen  Last je Transportanker mit Beiwerten für Stoß und
 *               Haftung an der Schalung sowie für die Schrägstellung der
 *               Anschlagmittel
 *   Transport   Prüfung gegen die Maße und Gewichte der StVO und
 *               Zusammenstellung der Fahrten (Ladelänge und Nutzlast)
 *   Montage     Reihenfolge nach Bauabschnitt und Bauteilart, Kranzeit
 *               je Stück, Dauer und Kosten
 *
 * Rechengrundlagen
 * ----------------
 * Wichte des Stahlbetons 25 kN/m³ nach DIN EN 1991-1-1, Tabelle A.1;
 * daraus 2500 kg/m³. Für Leichtbeton und Dämmstoffe sind eigene Werte
 * einzugeben.
 *
 * Anschlagen: F = m · g · ψ_dyn · ψ_haft / (n · cos α). ψ_dyn erfasst den
 * Stoß beim Anheben und Absetzen, ψ_haft das Lösen von der Schalung; α ist
 * der Neigungswinkel der Anschlagmittel gegen die Lotrechte. Die
 * zulässigen Lasten der Transportankersysteme sind Herstellerangaben aus
 * der allgemeinen bauaufsichtlichen Zulassung und hier einzutragen; die
 * Beiwerte sind sichtbare Vorgaben und vom Verwender zu bestätigen.
 *
 * Transport: Die Grenzmaße ohne Erlaubnis sind Breite 2,55 m, Höhe 4,00 m,
 * Länge 16,50 m beim Sattelzug und 18,75 m beim Lastzug, zulässiges
 * Gesamtgewicht 40 t (§ 32, § 34 StVZO). Darüber liegt ein Großraum- oder
 * Schwertransport, der nach § 29 Abs. 3 StVO erlaubnispflichtig und nach
 * § 46 StVO genehmigungspflichtig ist. Die Werte sind Eingaben, weil
 * Fahrzeug und Bundesland den Ausschlag geben.
 *
 * NICHT geführt: Bemessung der Fertigteile (Biegung, Querkraft, Kippen,
 * Vorspannung nach DIN EN 1992-1-1), Nachweis der Transportanker und der
 * Bewehrung im Anschlagbereich, Fugen- und Verbindungsnachweise,
 * Zwischenlagerung und Stapelung, Toleranzen nach DIN 18203-1,
 * Brandschutz und Bauzustände. Die Bewehrungsmenge ist ein Kennwert je
 * Kubikmeter und ersetzt keine Bewehrungsplanung.
 */

/** Wichte und Dichte der Baustoffe des Fertigteilbaus. */
const FT_STOFFE = {
  stahlbeton: { name: "Stahlbeton", rho: 2500 },
  leichtbeton: { name: "Leichtbeton LC 1,6", rho: 1600 },
  daemmung: { name: "Dämmung (PIR/EPS)", rho: 35 },
};

/**
 * Fertigteilarten mit ihren Feldern.
 *
 * felder  Maße, die der Anwender eingibt (in Metern, Stückzahlen ohne Einheit)
 * kuerzel Positionskürzel für die Elementliste
 */
const FERTIGTEILARTEN = {
  stuetze: {
    name: "Fertigteilstütze", kuerzel: "FS",
    felder: { laenge: 6.00, breite: 0.40, hoehe: 0.40 },
    bewehrung: 140, montageMinuten: 35, gruppe: 1,
  },
  binder: {
    name: "Binder / Unterzug", kuerzel: "FB",
    felder: { laenge: 18.00, breite: 0.40, hoehe: 1.20, neigung: 0 },
    bewehrung: 120, montageMinuten: 45, gruppe: 2,
  },
  satteldachbinder: {
    name: "Satteldachbinder", kuerzel: "SB",
    felder: { laenge: 24.00, breite: 0.30, hoehe: 1.00, neigung: 6 },
    bewehrung: 130, montageMinuten: 60, gruppe: 2,
  },
  hohlplatte: {
    name: "Spannbeton-Hohlplatte", kuerzel: "HP",
    felder: { laenge: 8.00, breite: 1.20, hoehe: 0.20, kerne: 6, kernDurchmesser: 0.135 },
    bewehrung: 45, montageMinuten: 12, gruppe: 3,
  },
  ttplatte: {
    name: "Doppel-T-Platte (TT)", kuerzel: "TT",
    felder: { laenge: 15.00, breite: 2.40, hoehe: 0.60, platte: 0.06, rippeOben: 0.24, rippeUnten: 0.14 },
    bewehrung: 90, montageMinuten: 20, gruppe: 3,
  },
  elementdecke: {
    name: "Elementdecke (Filigran)", kuerzel: "ED",
    felder: { laenge: 6.00, breite: 2.40, hoehe: 0.20, fertigteil: 0.06 },
    bewehrung: 70, montageMinuten: 15, gruppe: 3,
  },
  doppelwand: {
    name: "Doppelwand", kuerzel: "DW",
    felder: { laenge: 6.00, hoehe: 3.00, dicke: 0.24, schale: 0.06 },
    bewehrung: 60, montageMinuten: 25, gruppe: 4,
  },
  vollwand: {
    name: "Wandtafel (Vollwand)", kuerzel: "WT",
    felder: { laenge: 6.00, hoehe: 3.00, dicke: 0.20 },
    bewehrung: 55, montageMinuten: 25, gruppe: 4,
  },
  sandwichwand: {
    name: "Sandwichwand", kuerzel: "SW",
    felder: { laenge: 6.00, hoehe: 3.00, tragschale: 0.18, daemmung: 0.12, vorsatzschale: 0.07 },
    bewehrung: 65, montageMinuten: 30, gruppe: 4,
  },
  treppenlauf: {
    name: "Treppenlauf", kuerzel: "TL",
    felder: { geschosshoehe: 2.80, steigungen: 16, auftritt: 0.28, laufbreite: 1.20, dicke: 0.18 },
    bewehrung: 110, montageMinuten: 30, gruppe: 5,
  },
  koecher: {
    name: "Köcherfundament (Fertigteil)", kuerzel: "KF",
    felder: { laenge: 1.80, breite: 1.80, hoehe: 1.00, koecherLaenge: 0.60, koecherBreite: 0.60, koecherTiefe: 0.80 },
    bewehrung: 90, montageMinuten: 40, gruppe: 0,
  },
};

/** Vorgaben des Transports und des Anschlagens. */
const FT_VORGABEN = {
  // Grenzen ohne Erlaubnis nach StVZO/StVO
  maxBreite: 2.55, maxHoehe: 4.00, maxLaenge: 16.50, maxGesamtgewicht: 40.0,
  // Fahrzeug
  nutzlast: 24.0, ladelaenge: 13.60, leergewicht: 16.0,
  // Fertigteile werden gestapelt geladen: Stapelhöhe auf der Ladefläche,
  // Innenladerbreite für stehende Wandtafeln, Kanthölzer zwischen den Lagen
  stapelHoehe: 2.60, innenladerBreite: 2.45, zwischenlage: 0.05, aufbauhoehe: 1.20,
  // Anschlagen
  psiDyn: 1.30, psiHaft: 1.20, ankerZahl: 4, ankerWinkel: 30,
  // Kran und Kosten
  kranStunde: 180, montageStunde: 65, herstellung: 480, transportFahrt: 420,
  bewehrungPreis: 1.35,
};

/** Zahl mit Dezimalkomma. */
function ftZahl(wert, stellen) {
  return Number(wert).toFixed(stellen === undefined ? 2 : stellen).replace(".", ",");
}

/**
 * Geometrie und Massen eines Fertigteils.
 *
 * Zurückgegeben werden Volumen und Gewicht getrennt nach dem, was das Werk
 * verlässt (Transport) und dem, was am Ende im Bauwerk steht (Endzustand).
 * Bei Doppelwand und Elementdecke ist das nicht dasselbe: Der Ortbeton
 * kommt auf der Baustelle dazu.
 */
function ftGeometrie(teil) {
  const art = FERTIGTEILARTEN[teil.art];
  const f = Object.assign({}, art.felder, teil.felder || {});
  const rho = (FT_STOFFE[teil.stoff] || FT_STOFFE.stahlbeton).rho;
  const rhoDaemmung = FT_STOFFE.daemmung.rho;

  let volumenTransport = 0, volumenEnde = 0;
  let laenge = 0, breite = 0, hoehe = 0;      // Außenmaße für den Transport
  let ansicht = null;                         // Längsansicht für die Zeichnung
  let querschnitt = null;                     // Querschnitt mit Hohlräumen und Schichten
  const hinweise = [];

  switch (teil.art) {
    case "stuetze":
      volumenTransport = f.laenge * f.breite * f.hoehe;
      volumenEnde = volumenTransport;
      laenge = f.laenge; breite = f.breite; hoehe = f.hoehe;
      ansicht = { form: "rechteck", l: f.laenge, h: f.hoehe };
      querschnitt = { form: "rechteck", b: f.breite, h: f.hoehe };
      break;

    case "binder":
    case "satteldachbinder": {
      // Beim Satteldachbinder wächst die Höhe zur Mitte hin
      const zusatz = teil.art === "satteldachbinder"
        ? (f.laenge / 2) * (f.neigung / 100) : 0;
      const mittelHoehe = f.hoehe + zusatz / 2;
      volumenTransport = f.laenge * f.breite * mittelHoehe;
      volumenEnde = volumenTransport;
      laenge = f.laenge; breite = f.breite; hoehe = f.hoehe + zusatz;
      ansicht = { form: teil.art === "satteldachbinder" ? "sattel" : "rechteck",
        l: f.laenge, h: f.hoehe, hFirst: f.hoehe + zusatz };
      querschnitt = { form: "rechteck", b: f.breite, h: f.hoehe + zusatz };
      break;
    }

    case "hohlplatte": {
      const brutto = f.laenge * f.breite * f.hoehe;
      const kern = Math.PI * (f.kernDurchmesser / 2) ** 2 * f.laenge * f.kerne;
      volumenTransport = brutto - kern;
      volumenEnde = volumenTransport;
      laenge = f.laenge; breite = f.breite; hoehe = f.hoehe;
      ansicht = { form: "rechteck", l: f.laenge, h: f.hoehe };
      querschnitt = { form: "hohlplatte", b: f.breite, h: f.hoehe, kerne: f.kerne, d: f.kernDurchmesser };
      if (f.kernDurchmesser > f.hoehe - 0.06) {
        hinweise.push("Die Hohlräume lassen weniger als 3 cm Beton über und unter dem Kern – "
          + "Querschnitt und Kernbild sind Herstellerangaben.");
      }
      break;
    }

    case "ttplatte": {
      // Platte oben, dazu zwei Rippen mit trapezförmigem Querschnitt
      const plattenVolumen = f.laenge * f.breite * f.platte;
      const rippenHoehe = f.hoehe - f.platte;
      const rippenFlaeche = ((f.rippeOben + f.rippeUnten) / 2) * rippenHoehe;
      volumenTransport = plattenVolumen + 2 * rippenFlaeche * f.laenge;
      volumenEnde = volumenTransport;
      laenge = f.laenge; breite = f.breite; hoehe = f.hoehe;
      ansicht = { form: "rechteck", l: f.laenge, h: f.hoehe };
      querschnitt = { form: "tt", b: f.breite, h: f.hoehe, platte: f.platte,
        rippeOben: f.rippeOben, rippeUnten: f.rippeUnten };
      break;
    }

    case "elementdecke":
      // Nur die Fertigplatte fährt; der Ortbeton kommt auf der Baustelle
      volumenTransport = f.laenge * f.breite * f.fertigteil;
      volumenEnde = f.laenge * f.breite * f.hoehe;
      laenge = f.laenge; breite = f.breite; hoehe = f.fertigteil;
      ansicht = { form: "rechteck", l: f.laenge, h: f.breite };
      querschnitt = { form: "schicht", b: f.breite, h: f.hoehe, fertig: f.fertigteil };
      break;

    case "doppelwand":
      // Zwei Schalen fahren, der Kern wird auf der Baustelle vergossen
      volumenTransport = f.laenge * f.hoehe * 2 * f.schale;
      volumenEnde = f.laenge * f.hoehe * f.dicke;
      laenge = f.laenge; breite = f.dicke; hoehe = f.hoehe;
      ansicht = { form: "rechteck", l: f.laenge, h: f.hoehe };
      querschnitt = { form: "doppelwand", b: f.dicke, h: f.hoehe, dicke: f.dicke, schale: f.schale };
      if (2 * f.schale >= f.dicke) {
        hinweise.push("Die beiden Schalen füllen die Wanddicke aus – für den Ortbetonkern "
          + "bleibt nichts übrig. Schalendicke oder Wanddicke prüfen.");
      }
      break;

    case "vollwand":
      volumenTransport = f.laenge * f.hoehe * f.dicke;
      volumenEnde = volumenTransport;
      laenge = f.laenge; breite = f.dicke; hoehe = f.hoehe;
      ansicht = { form: "rechteck", l: f.laenge, h: f.hoehe };
      querschnitt = { form: "rechteck", b: f.dicke, h: f.hoehe };
      break;

    case "sandwichwand": {
      const beton = f.laenge * f.hoehe * (f.tragschale + f.vorsatzschale);
      const daemmung = f.laenge * f.hoehe * f.daemmung;
      volumenTransport = beton;
      volumenEnde = beton;
      laenge = f.laenge; breite = f.tragschale + f.daemmung + f.vorsatzschale; hoehe = f.hoehe;
      ansicht = { form: "rechteck", l: f.laenge, h: f.hoehe };
      querschnitt = { form: "sandwich", b: f.tragschale + f.daemmung + f.vorsatzschale, h: f.hoehe,
        tragschale: f.tragschale, daemmung: f.daemmung, vorsatzschale: f.vorsatzschale };
      // Die Dämmung wiegt mit, wenn auch wenig
      return ftMassen(teil, art, f, volumenTransport, volumenEnde, rho, laenge, breite, hoehe,
        ansicht, querschnitt, hinweise, daemmung * rhoDaemmung);
    }

    case "treppenlauf": {
      const lauflaenge = f.steigungen * f.auftritt;
      const steigung = f.geschosshoehe / f.steigungen;
      const geneigt = Math.hypot(lauflaenge, f.geschosshoehe);
      // Laufplatte lotrecht gemessen plus die Stufendreiecke
      const platte = geneigt * f.dicke * f.laufbreite;
      const stufen = 0.5 * steigung * f.auftritt * f.steigungen * f.laufbreite;
      volumenTransport = platte + stufen;
      volumenEnde = volumenTransport;
      laenge = geneigt; breite = f.laufbreite; hoehe = f.geschosshoehe;
      ansicht = { form: "treppe", l: lauflaenge, h: f.geschosshoehe,
        steigungen: f.steigungen, auftritt: f.auftritt, steigung, dicke: f.dicke };
      querschnitt = { form: "rechteck", b: f.laufbreite, h: f.dicke };
      break;
    }

    case "koecher": {
      const brutto = f.laenge * f.breite * f.hoehe;
      const koecher = f.koecherLaenge * f.koecherBreite * f.koecherTiefe;
      volumenTransport = brutto - koecher;
      volumenEnde = volumenTransport;
      laenge = f.laenge; breite = f.breite; hoehe = f.hoehe;
      ansicht = { form: "koecher", l: f.laenge, h: f.hoehe,
        kl: f.koecherLaenge, kt: f.koecherTiefe };
      querschnitt = { form: "koecher", b: f.breite, h: f.hoehe,
        kl: f.koecherBreite, kt: f.koecherTiefe };
      break;
    }

    default:
      volumenTransport = 1; volumenEnde = 1;
      laenge = 1; breite = 1; hoehe = 1;
      ansicht = { form: "rechteck", l: 1, h: 1 };
      querschnitt = { form: "rechteck", b: 1, h: 1 };
  }

  return ftMassen(teil, art, f, volumenTransport, volumenEnde, rho,
    laenge, breite, hoehe, ansicht, querschnitt, hinweise, 0);
}

/** Massen aus dem Volumen bilden; getrennt für Transport und Endzustand. */
function ftMassen(teil, art, f, volumenTransport, volumenEnde, rho,
  laenge, breite, hoehe, ansicht, querschnitt, hinweise, zusatzMasse) {
  const stueck = Math.max(1, teil.stueck || 1);
  const masseTransport = volumenTransport * rho + (zusatzMasse || 0);
  const masseEnde = volumenEnde * rho + (zusatzMasse || 0);
  return {
    art: teil.art, name: art.name, kuerzel: art.kuerzel, felder: f, stueck,
    volumenTransport, volumenEnde,
    volumenTransportGesamt: volumenTransport * stueck,
    volumenEndeGesamt: volumenEnde * stueck,
    masseTransport, masseEnde,
    masseTransportGesamt: masseTransport * stueck,
    laenge, breite, hoehe,
    // Bewehrung als Kennwert je Kubikmeter Fertigteilbeton
    bewehrung: volumenTransport * (teil.bewehrung || art.bewehrung),
    bewehrungGesamt: volumenTransport * (teil.bewehrung || art.bewehrung) * stueck,
    ansicht, querschnitt, hinweise,
    ortbeton: Math.max(0, volumenEnde - volumenTransport),
    ortbetonGesamt: Math.max(0, volumenEnde - volumenTransport) * stueck,
  };
}

/**
 * Last je Transportanker.
 *
 * F = m · g · ψ_dyn · ψ_haft / (n · cos α)
 *
 * ψ_dyn erfasst den Stoß beim Anheben und Absetzen, ψ_haft das Lösen von
 * der Schalung. Der Winkel α ist die Neigung der Anschlagmittel gegen die
 * Lotrechte; bei vier Ankern und ungleicher Lastverteilung ist zusätzlich
 * zu prüfen, ob nur zwei Anker tragen – deshalb wird beides ausgegeben.
 */
function ftAnschlagen(massen, vorgaben) {
  const v = Object.assign({}, FT_VORGABEN, vorgaben || {});
  const g = 9.81;
  const alpha = (v.ankerWinkel * Math.PI) / 180;
  const gewichtskraft = (massen.masseTransport * g) / 1000;             // kN
  const dyn = gewichtskraft * v.psiDyn * v.psiHaft;
  const jeAnker = dyn / (v.ankerZahl * Math.cos(alpha));
  // Bei mehr als zwei Ankern in einer Reihe ist die Last statisch
  // unbestimmt verteilt; auf der sicheren Seite tragen zwei
  const zweiAnker = v.ankerZahl > 2 ? dyn / (2 * Math.cos(alpha)) : jeAnker;
  return {
    gewichtskraft, dyn, jeAnker, zweiAnker,
    ankerZahl: v.ankerZahl, winkel: v.ankerWinkel,
    psiDyn: v.psiDyn, psiHaft: v.psiHaft,
    formel: `F = ${ftZahl(massen.masseTransport, 0)} kg · 9,81 · ${ftZahl(v.psiDyn, 2)} · `
      + `${ftZahl(v.psiHaft, 2)} / (${v.ankerZahl} · cos ${v.ankerWinkel}°)`,
  };
}

/**
 * Transportprüfung gegen die Grenzmaße.
 *
 * Geprüft werden Länge, Breite, Höhe und Gewicht des einzelnen Teils.
 * Die Höhe auf dem Fahrzeug ist das kleinste Maß, wenn liegend gefahren
 * wird; Wandtafeln fahren stehend im Innenlader und sind deshalb mit
 * ihrer Höhe als Ladehöhe zu prüfen.
 */
function ftTransportPruefung(massen, vorgaben) {
  const v = Object.assign({}, FT_VORGABEN, vorgaben || {});
  const stehend = ["doppelwand", "vollwand", "sandwichwand"].indexOf(massen.art) >= 0;
  const ladeLaenge = massen.laenge;
  const ladeBreite = stehend ? massen.breite : massen.breite;
  const ladeHoehe = stehend ? massen.hoehe : massen.hoehe;
  const meldungen = [];

  if (ladeLaenge > v.maxLaenge) {
    meldungen.push({ art: "warnung", text: `Länge ${ftZahl(ladeLaenge)} m über ${ftZahl(v.maxLaenge)} m – `
      + "Großraumtransport, Erlaubnis nach § 29 Abs. 3 StVO nötig." });
  }
  if (ladeBreite > v.maxBreite) {
    meldungen.push({ art: "warnung", text: `Breite ${ftZahl(ladeBreite)} m über ${ftZahl(v.maxBreite)} m – `
      + "Großraumtransport, Erlaubnis nach § 29 Abs. 3 StVO nötig." });
  }
  // Ladehöhe: Aufbauhöhe des Fahrzeugs kommt dazu
  const gesamthoehe = ladeHoehe + (v.aufbauhoehe || 1.20);
  if (gesamthoehe > v.maxHoehe) {
    meldungen.push({ art: "warnung", text: `Ladehöhe ${ftZahl(ladeHoehe)} m + Aufbau `
      + `${ftZahl(v.aufbauhoehe || 1.2)} m = ${ftZahl(gesamthoehe)} m über ${ftZahl(v.maxHoehe)} m – `
      + "Höhe des Fahrzeugs prüfen." });
  }
  const tonnen = massen.masseTransport / 1000;
  if (tonnen > v.nutzlast) {
    meldungen.push({ art: "warnung", text: `Einzelgewicht ${ftZahl(tonnen)} t über der Nutzlast `
      + `${ftZahl(v.nutzlast)} t – Schwertransport oder anderes Fahrzeug.` });
  }
  return { stehend, ladeLaenge, ladeBreite, ladeHoehe, gesamthoehe, tonnen, meldungen };
}

/**
 * Fahrten zusammenstellen.
 *
 * Fertigteile werden nicht hintereinander, sondern **gestapelt** geladen:
 * Platten und Binder liegen in Stapeln auf der Ladefläche, Wandtafeln
 * stehen nebeneinander im Innenlader. Maßgebend sind deshalb
 *
 *   Nutzlast          Summe der Gewichte einer Fahrt
 *   Stapelhöhe        Zahl der Lagen mal Bauteilhöhe (liegend)
 *   Innenladerbreite  Zahl der Tafeln mal Bauteildicke (stehend)
 *   Ladelänge         das längste Stück, nicht die Summe
 *
 * Teile derselben Art werden zusammen gestapelt; was übrig bleibt, wird
 * mit Teilen gleicher Ladeweise aufgefüllt, solange Gewicht und Höhe es
 * hergeben. Stücke über der Ladelänge oder über der Nutzlast fahren
 * allein als Großraum- oder Schwertransport.
 *
 * NICHT geführt: Ladungssicherung nach VDI 2700, zulässige Stapelhöhen
 * und Kanthölzer je Bauteilart, Achslasten und Lastverteilung auf dem
 * Fahrzeug, die Reihenfolge des Abladens nach dem Montagefortschritt.
 */
function ftFahrten(teile, vorgaben) {
  const v = Object.assign({}, FT_VORGABEN, vorgaben || {});
  const stapelHoehe = v.stapelHoehe || 2.60;
  const innenladerBreite = v.innenladerBreite || 2.45;
  const zwischenlage = v.zwischenlage || 0.05;   // Kanthölzer zwischen den Lagen

  const gruppen = teile.map((t) => {
    const m = ftGeometrie(t);
    const stehend = ["doppelwand", "vollwand", "sandwichwand"].indexOf(t.art) >= 0;
    const platzJeStueck = (stehend ? m.breite : m.hoehe) + zwischenlage;
    const nachGewicht = Math.floor((v.nutzlast * 1000) / Math.max(1, m.masseTransport));
    const nachPlatz = Math.floor((stehend ? innenladerBreite : stapelHoehe) / Math.max(0.01, platzJeStueck));
    const sonder = m.laenge > v.ladelaenge || m.masseTransport / 1000 > v.nutzlast;
    return {
      teil: t, massen: m, stehend, platzJeStueck, sonder,
      // Mindestens ein Stück je Fahrt, sonst käme keine Fahrt zustande
      jeFahrt: sonder ? 1 : Math.max(1, Math.min(nachGewicht, nachPlatz)),
      offen: m.stueck,
    };
  });

  const fahrten = [];
  const neueFahrt = (stehend, sonder) => {
    const f = {
      nummer: fahrten.length + 1, stuecke: [], masse: 0, platz: 0,
      laenge: 0, stehend, sonder,
      grenzePlatz: stehend ? innenladerBreite : stapelHoehe,
    };
    fahrten.push(f);
    return f;
  };

  gruppen.forEach((g) => {
    while (g.offen > 0) {
      // passende, noch nicht volle Fahrt suchen: gleiche Ladeweise,
      // Gewicht und Platz müssen reichen
      let ziel = g.sonder ? null : fahrten.find((f) => !f.sonder && f.stehend === g.stehend
        && (f.masse + g.massen.masseTransport) / 1000 <= v.nutzlast
        && f.platz + g.platzJeStueck <= f.grenzePlatz
        && Math.max(f.laenge, g.massen.laenge) <= v.ladelaenge);
      if (!ziel) ziel = neueFahrt(g.stehend, g.sonder);
      // so viele Stücke wie möglich auf diese Fahrt
      const nachGewicht = Math.floor((v.nutzlast * 1000 - ziel.masse) / Math.max(1, g.massen.masseTransport));
      const nachPlatz = Math.floor((ziel.grenzePlatz - ziel.platz) / g.platzJeStueck);
      const anzahl = g.sonder ? 1 : Math.max(1, Math.min(g.offen, nachGewicht, nachPlatz));
      for (let i = 0; i < anzahl; i++) {
        ziel.stuecke.push({
          teil: g.teil, massen: g.massen, masse: g.massen.masseTransport,
          laenge: g.massen.laenge, bezeichnung: g.teil.bezeichnung,
        });
      }
      ziel.masse += anzahl * g.massen.masseTransport;
      ziel.platz += anzahl * g.platzJeStueck;
      ziel.laenge = Math.max(ziel.laenge, g.massen.laenge);
      g.offen -= anzahl;
    }
  });

  const stuecke = fahrten.reduce((s, f) => s + f.stuecke.length, 0);
  const masseGesamt = fahrten.reduce((s, f) => s + f.masse, 0);
  return {
    fahrten,
    anzahl: fahrten.length,
    stuecke,
    masseGesamt,
    auslastung: fahrten.length ? masseGesamt / 1000 / (fahrten.length * v.nutzlast) : 0,
    sonderfahrten: fahrten.filter((f) => f.sonder).length,
    nutzlast: v.nutzlast, ladelaenge: v.ladelaenge,
    stapelHoehe, innenladerBreite,
  };
}

/**
 * Montageplanung: Reihenfolge, Kranzeit, Dauer.
 *
 * Die Reihenfolge folgt der Logik des Fertigteilbaus: erst die Gründung,
 * dann die Stützen, dann die Binder, dann die Decken, dann die Wände und
 * zuletzt die Treppen. Innerhalb einer Gruppe wird nach Bauabschnitt und
 * Positionsnummer sortiert.
 */
function ftMontage(teile, vorgaben) {
  const v = Object.assign({}, FT_VORGABEN, vorgaben || {});
  const zeilen = [];
  teile.forEach((t) => {
    const art = FERTIGTEILARTEN[t.art];
    const m = ftGeometrie(t);
    const minuten = (t.montageMinuten || art.montageMinuten) * m.stueck;
    zeilen.push({
      teil: t, massen: m, gruppe: art.gruppe,
      abschnitt: t.abschnitt || "",
      minuten, stunden: minuten / 60,
      hub: m.masseTransport / 1000,
    });
  });
  zeilen.sort((a, b) => (a.gruppe - b.gruppe)
    || String(a.abschnitt).localeCompare(String(b.abschnitt))
    || String(a.teil.bezeichnung).localeCompare(String(b.teil.bezeichnung)));
  zeilen.forEach((z, i) => { z.reihenfolge = i + 1; });

  const stunden = zeilen.reduce((s, z) => s + z.stunden, 0);
  const schicht = v.schichtStunden || 8;
  return {
    zeilen, stunden,
    tage: stunden / schicht,
    schwersterHub: zeilen.reduce((s, z) => Math.max(s, z.hub), 0),
    schichtStunden: schicht,
  };
}

/**
 * Kostenschätzung der Fertigteile.
 *
 * Herstellung wird je Kubikmeter Fertigteilbeton gerechnet, Bewehrung je
 * Kilogramm, Transport je Fahrt, Montage je Kranstunde. Die Werte sind
 * Anhaltswerte für die Schätzung und durch die eigene Kalkulation und die
 * Angebote der Werke zu ersetzen.
 */
function ftKosten(teile, fahrten, montage, vorgaben) {
  const v = Object.assign({}, FT_VORGABEN, vorgaben || {});
  const massen = teile.map((t) => ftGeometrie(t));
  const volumen = massen.reduce((s, m) => s + m.volumenTransportGesamt, 0);
  const bewehrung = massen.reduce((s, m) => s + m.bewehrungGesamt, 0);
  const ortbeton = massen.reduce((s, m) => s + m.ortbetonGesamt, 0);
  const stueck = massen.reduce((s, m) => s + m.stueck, 0);

  const zeilen = [];
  const pos = (kurz, menge, einheit, ep, hinweis) => {
    if (menge <= 1e-9) return;
    zeilen.push({ nr: zeilen.length + 1, kurz, menge, einheit, ep, gp: menge * ep, hinweis });
  };
  pos("Fertigteile herstellen und liefern (Beton)", volumen, "m³", v.herstellung,
    "je m³ Fertigteilbeton, Schalung und Bewehrungseinbau enthalten");
  pos("Bewehrung der Fertigteile", bewehrung, "kg", v.bewehrungPreis,
    "Kennwert je m³; ersetzt keine Bewehrungsplanung");
  pos("Transport zur Baustelle", fahrten.anzahl, "Fahrt", v.transportFahrt,
    `Nutzlast ${ftZahl(v.nutzlast)} t, Ladelänge ${ftZahl(v.ladelaenge)} m`);
  pos("Montage mit Kran", montage.stunden, "h", v.kranStunde + v.montageStunde,
    `Kran ${ftZahl(v.kranStunde, 0)} €/h + Kolonne ${ftZahl(v.montageStunde, 0)} €/h`);
  pos("Ortbetonergänzung (Doppelwand, Elementdecke)", ortbeton, "m³", v.ortbeton || 190,
    "Beton, Pumpe und Einbau auf der Baustelle");

  const summe = zeilen.reduce((s, z) => s + z.gp, 0);
  return {
    zeilen, summe, volumen, bewehrung, ortbeton, stueck,
    jeStueck: stueck ? summe / stueck : 0,
    jeKubik: volumen ? summe / volumen : 0,
  };
}
