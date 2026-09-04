/**
 * Automatische Bewehrung: konstruktive Mindestbewehrung nach
 * DIN EN 1992-1-1, Abschnitt 9, mit Wahl von Durchmesser und Stababstand.
 *
 * Für jedes Betonbauteil wird der erforderliche Mindestbewehrungsquerschnitt
 * bestimmt und daraus die günstigste Kombination aus Stabdurchmesser und
 * Stababstand gewählt, die zugleich die Höchstabstände einhält. Das Ergebnis
 * wird in die Bewehrungsparameter des Bauteils geschrieben, sodass
 * Stahlliste, Bewehrungsplan und Kosten unmittelbar folgen.
 *
 * Angesetzte Regeln (jeweils Abschnitt der DIN EN 1992-1-1):
 *   Platten und Fundamente  9.3.1.1 mit 9.2.1.1:
 *       a_s,min = max(0,26 · f_ctm/f_yk · b · d ; 0,0013 · b · d)
 *       s_max Hauptrichtung   min(3 h ; 400 mm)
 *       s_max Querrichtung    min(3,5 h ; 450 mm)
 *       Querbewehrung ≥ 20 % der Hauptbewehrung
 *   Balken 9.2.1.1 und 9.2.2:
 *       A_s,min wie Platten; ρ_w,min = 0,08 · √f_ck / f_yk
 *       s_l,max = 0,75 d für lotrechte Bügel
 *   Stützen 9.5.2 und 9.5.3:
 *       A_s,min = max(0,10 · N_Ed/f_yd ; 0,002 · A_c), A_s,max = 0,04 · A_c
 *       mindestens 4 Stäbe (rechteckig) bzw. 6 Stäbe (rund), d_s ≥ 8 mm
 *       Bügel d_s ≥ max(6 mm ; 0,25 d_s,längs), s_cl,max = min(20 d_s,längs ; b ; 400 mm)
 *   Wände 9.6.2 und 9.6.3:
 *       A_s,v,min = 0,002 · A_c auf beide Seiten, s_v,max = min(3 h ; 400 mm)
 *       A_s,h,min = max(0,25 · A_s,v ; 0,001 · A_c), s_h,max = 400 mm
 *
 * Das Ergebnis ist konstruktive Mindestbewehrung. Die Bemessung für
 * Biegung, Querkraft, Durchstanzen, Rissbreiten und Verankerung kann mehr
 * erfordern und ist vom Tragwerksplaner zu führen. Für Bohrpfähle gilt
 * DIN EN 1536 mit EA-Pfähle; sie werden nicht automatisch bewehrt.
 */

/** Wählbare Stabdurchmesser und Stababstände der automatischen Wahl. */
const AUTO_DURCHMESSER = [8, 10, 12, 14, 16, 20];
const AUTO_ABSTAENDE = [100, 125, 150, 175, 200, 250];

/** Bewehrungsquerschnitt je Meter [cm²/m] aus Durchmesser und Abstand. */
function asJeMeter(ds, abstandMm) {
  return (stabFlaeche(ds) * 1000) / abstandMm;
}

/**
 * Mindestbewehrung einer Platte je Meter Breite.
 * a_s,min = max(0,26 · f_ctm/f_yk · d ; 0,0013 · d) mit b = 1 m
 * @returns {Object} { asMin, d, sMaxHaupt, sMaxQuer }
 */
function plattenMindestbewehrung(hoehe, deckungMm, dsAnnahme, kennwerte) {
  const h = hoehe;
  const nutzhoehe = Math.max(h - deckungMm / 1000 - (dsAnnahme / 1000) / 2, 0.02);
  const fctm = kennwerte.fctm;
  const asMin1 = 0.26 * (fctm / BETONSTAHL_FYK) * 100 * (nutzhoehe * 100); // cm²/m
  const asMin2 = 0.0013 * 100 * (nutzhoehe * 100);
  return {
    asMin: Math.max(asMin1, asMin2),
    d: nutzhoehe,
    sMaxHaupt: Math.min(3 * h * 1000, 400),
    sMaxQuer: Math.min(3.5 * h * 1000, 450),
  };
}

/**
 * Günstigste Kombination aus Durchmesser und Abstand für einen
 * geforderten Querschnitt je Meter.
 *
 * @param {number} asErf - erforderlich [cm²/m]
 * @param {number} sMax - Höchstabstand [mm]
 * @returns {Object} { ds, s, as, masse }
 */
function waehleMatte(asErf, sMax) {
  let beste = null;
  AUTO_DURCHMESSER.forEach((ds) => {
    AUTO_ABSTAENDE.forEach((s) => {
      if (s > sMax) return;
      const as = asJeMeter(ds, s);
      if (as < asErf) return;
      // Stahlmasse je m² als Gütemaß; bei Gleichstand der größere Abstand
      const masse = (stabMasse(ds) * 1000) / s;
      if (!beste || masse < beste.masse - 1e-9 || (Math.abs(masse - beste.masse) < 1e-9 && s > beste.s)) {
        beste = { ds, s, as, masse };
      }
    });
  });
  // Nichts gefunden: größter Durchmesser im kleinsten zulässigen Abstand
  if (!beste) {
    const ds = AUTO_DURCHMESSER[AUTO_DURCHMESSER.length - 1];
    const s = Math.min(AUTO_ABSTAENDE[0], sMax > 0 ? sMax : AUTO_ABSTAENDE[0]);
    beste = { ds, s, as: asJeMeter(ds, s), masse: (stabMasse(ds) * 1000) / s, unzureichend: true };
  }
  return beste;
}

/** Nächstgrößerer Durchmesser aus der Auswahl. */
function naechsterDurchmesser(mindest) {
  return AUTO_DURCHMESSER.find((ds) => ds >= mindest) || AUTO_DURCHMESSER[AUTO_DURCHMESSER.length - 1];
}

/**
 * Automatische Bewehrung eines Betonbauteils.
 *
 * @param {Object} element - Betonbauteil
 * @param {Object} geo - Geometrie aus betonGeometrie()
 * @param {Object} deckung - Betondeckung aus betondeckung()
 * @param {Object} optionen - { nEd } Normalkraft der Stütze [kN], optional
 * @returns {Object} { parameter, nachweis, hinweise, moeglich }
 */
function automatischeBewehrung(element, geo, deckung, optionen) {
  const kennwerte = betonKennwerte(element.guete);
  const opt = optionen || {};
  const hinweise = [];
  const kind = element.kind;
  const c = deckung.cNom;

  // ---- Platten, Fundamente und Bodenplatten
  if (["decke", "bodenplatte", "einzelfundament", "koecherfundament", "streifenfundament", "treppe"].indexOf(kind) >= 0) {
    // Die Treppenlaufplatte ist eine einachsig gespannte Platte; maßgebend
    // ist die Plattendicke, nicht die Geschosshöhe
    const h = kind === "streifenfundament" ? geo.dicke : (geo.dicke || geo.hoehe);
    const mind = plattenMindestbewehrung(h, c, 12, kennwerte);
    const haupt = waehleMatte(mind.asMin, mind.sMaxHaupt);
    // Querbewehrung mindestens 20 % der Hauptbewehrung (Abs. 9.3.1.1(2))
    const quer = waehleMatte(Math.max(0.2 * haupt.as, mind.asMin * 0.2), mind.sMaxQuer);

    hinweise.push(`a_s,min = ${mind.asMin.toFixed(2)} cm²/m bei d = ${(mind.d * 100).toFixed(1)} cm (Abs. 9.2.1.1)`);
    hinweise.push(`s_max = ${mind.sMaxHaupt.toFixed(0)} mm längs, ${mind.sMaxQuer.toFixed(0)} mm quer (Abs. 9.3.1.1)`);
    hinweise.push("Untere Lage in beiden Richtungen mit a_s,min; die Querbewehrung erfüllt damit auch die 20-%-Regel nach Abs. 9.3.1.1(2).");
    hinweise.push("Obere Lage konstruktiv; die Stützbewehrung folgt aus der Schnittgrößenermittlung.");

    const parameter = { dsUnten: haupt.ds, sUnten: haupt.s };
    // Obere Lage konstruktiv mit mindestens 20 % der unteren Lage; die
    // Stützbewehrung durchlaufender Platten folgt aus der Bemessung
    if (kind === "decke" || kind === "bodenplatte" || kind === "koecherfundament" || kind === "treppe") {
      parameter.obenAktiv = true;
      parameter.dsOben = quer.ds;
      parameter.sOben = quer.s;
    }
    if (kind === "treppe") {
      // Querbewehrung der Laufplatte: mindestens 20 % der Haupttragbewehrung
      parameter.dsBuegel = quer.ds;
      parameter.sBuegel = quer.s;
      hinweise.push("Treppenlauf als einachsig gespannte Platte behandelt; die "
        + "Haupttragbewehrung liegt in Laufrichtung, die Querbewehrung quer dazu.");
      hinweise.push("Obere Lage an Antritt und Austritt ist konstruktiv angesetzt; "
        + "die Zugkraft am einspringenden Knick folgt aus der Bemessung.");
    }
    if (kind === "streifenfundament") {
      parameter.dsLaengs = quer.ds;
      parameter.nLaengs = Math.max(4, Math.floor((geo.breite - 2 * c / 1000) / (quer.s / 1000)) + 1);
    }
    return {
      moeglich: true, parameter, hinweise,
      nachweis: {
        art: "Platte", asMin: mind.asMin, asVorh: haupt.as, nutzhoehe: mind.d,
        sMax: mind.sMaxHaupt, gewaehlt: `⌀${haupt.ds}/${haupt.s} mm`,
        auslastung: mind.asMin > 0 ? mind.asMin / haupt.as : 0,
        unzureichend: !!haupt.unzureichend,
      },
    };
  }

  // ---- Wände
  if (kind === "wand" || kind === "kellerwand") {
    const dicke = geo.dicke;
    const ac = dicke * 100 * 100;                   // cm² je Meter Wandlänge
    const asVMin = 0.002 * ac;                      // cm²/m, beide Seiten zusammen
    const asVProSeite = asVMin / 2;
    const sVMax = Math.min(3 * dicke * 1000, 400);
    const lotrecht = waehleMatte(asVProSeite, sVMax);
    const asHMin = Math.max(0.25 * asVMin, 0.001 * ac) / 2;   // je Seite
    const waagerecht = waehleMatte(asHMin, 400);

    hinweise.push(`A_s,v,min = 0,002 · A_c = ${asVMin.toFixed(2)} cm²/m, je Seite ${asVProSeite.toFixed(2)} cm²/m (Abs. 9.6.2)`);
    hinweise.push(`s_v,max = ${sVMax.toFixed(0)} mm, s_h,max = 400 mm (Abs. 9.6.2/9.6.3)`);

    return {
      moeglich: true,
      parameter: { dsUnten: lotrecht.ds, sUnten: lotrecht.s, dsOben: waagerecht.ds, sOben: waagerecht.s, obenAktiv: true },
      hinweise,
      nachweis: {
        art: "Wand", asMin: asVProSeite, asVorh: lotrecht.as, sMax: sVMax,
        gewaehlt: `⌀${lotrecht.ds}/${lotrecht.s} mm lotrecht je Seite`,
        auslastung: asVProSeite / lotrecht.as, unzureichend: !!lotrecht.unzureichend,
      },
    };
  }

  // ---- Stützen
  if (kind === "stuetze" || kind === "stuetze_rund") {
    const rund = kind === "stuetze_rund";
    const ac = rund
      ? (Math.PI / 4) * Math.pow(geo.laenge * 100, 2)
      : geo.laenge * 100 * geo.breite * 100;        // cm²
    const fyd = BETONSTAHL_FYK / BETONSTAHL_GAMMA_S; // N/mm²
    const nEd = Math.max(0, opt.nEd || 0);           // kN
    const asAusN = (0.10 * nEd * 1000) / fyd / 100;  // cm²
    const asMin = Math.max(asAusN, 0.002 * ac);
    const asMax = 0.04 * ac;
    const mindestZahl = rund ? 6 : 4;

    let gewaehlt = null;
    AUTO_DURCHMESSER.filter((ds) => ds >= 12).forEach((ds) => {
      for (let n = mindestZahl; n <= 16; n += rund ? 1 : 2) {
        const as = n * stabFlaeche(ds);
        if (as < asMin) continue;
        const masse = n * stabMasse(ds);
        if (!gewaehlt || masse < gewaehlt.masse - 1e-9) gewaehlt = { ds, n, as, masse };
        break;
      }
    });
    if (!gewaehlt) gewaehlt = { ds: 20, n: mindestZahl, as: mindestZahl * stabFlaeche(20), masse: 0 };

    // Bügel: d_s ≥ max(6 mm; 0,25 d_s,längs), s_cl,max = min(20 d_s,längs; b; 400 mm)
    const dsBuegel = naechsterDurchmesser(Math.max(6, 0.25 * gewaehlt.ds));
    const kleinsteSeite = rund ? geo.laenge : Math.min(geo.laenge, geo.breite);
    const sBuegelMax = Math.min(20 * gewaehlt.ds, kleinsteSeite * 1000, 400);
    const sBuegel = AUTO_ABSTAENDE.slice().reverse().find((s) => s <= sBuegelMax) || 100;

    hinweise.push(`A_c = ${ac.toFixed(0)} cm², A_s,min = max(0,10·N_Ed/f_yd ; 0,002·A_c) = ${asMin.toFixed(2)} cm² (Abs. 9.5.2)`);
    if (nEd > 0) hinweise.push(`N_Ed = ${nEd.toFixed(0)} kN ergibt ${asAusN.toFixed(2)} cm²`);
    hinweise.push(`Bügel s_cl,max = min(20·d_s ; b ; 400 mm) = ${sBuegelMax.toFixed(0)} mm (Abs. 9.5.3)`);
    if (gewaehlt.as > asMax) hinweise.push(`A_s,vorh überschreitet A_s,max = 0,04·A_c = ${asMax.toFixed(2)} cm² – Querschnitt vergrößern.`);

    return {
      moeglich: true,
      parameter: { dsLaengs: gewaehlt.ds, nLaengs: gewaehlt.n, dsBuegel, sBuegel },
      hinweise,
      nachweis: {
        art: "Stütze", asMin, asVorh: gewaehlt.as, sMax: sBuegelMax,
        gewaehlt: `${gewaehlt.n} ⌀${gewaehlt.ds} + Bügel ⌀${dsBuegel}/${sBuegel} mm`,
        auslastung: asMin / gewaehlt.as, unzureichend: gewaehlt.as < asMin,
      },
    };
  }

  // ---- Balken
  if (kind === "unterzug") {
    const b = geo.breite, h = geo.hoehe;
    const nutzhoehe = Math.max(h - c / 1000 - 0.01 - 0.008, 0.05);
    const asMin = Math.max(
      0.26 * (kennwerte.fctm / BETONSTAHL_FYK) * (b * 100) * (nutzhoehe * 100),
      0.0013 * (b * 100) * (nutzhoehe * 100)
    ); // cm²

    let laengs = null;
    AUTO_DURCHMESSER.filter((ds) => ds >= 12).forEach((ds) => {
      for (let n = 2; n <= 8; n++) {
        const as = n * stabFlaeche(ds);
        if (as < asMin) continue;
        const masse = n * stabMasse(ds);
        if (!laengs || masse < laengs.masse - 1e-9) laengs = { ds, n, as, masse };
        break;
      }
    });
    if (!laengs) laengs = { ds: 20, n: 3, as: 3 * stabFlaeche(20), masse: 0 };

    // Mindestquerkraftbewehrung: ρ_w,min = 0,08·√f_ck/f_yk (Abs. 9.2.2(5))
    const rhoWMin = (0.08 * Math.sqrt(kennwerte.fck)) / BETONSTAHL_FYK;
    const sMax = Math.min(0.75 * nutzhoehe * 1000, 400);
    let buegel = null;
    AUTO_DURCHMESSER.filter((ds) => ds <= 12).forEach((ds) => {
      AUTO_ABSTAENDE.forEach((s) => {
        if (s > sMax) return;
        // zweischnittiger Bügel: A_sw = 2 · a_s
        const rho = (2 * stabFlaeche(ds)) / ((s / 10) * (b * 100));
        if (rho < rhoWMin) return;
        const masse = (2 * stabMasse(ds) * 1000) / s;
        if (!buegel || masse < buegel.masse - 1e-9) buegel = { ds, s, rho, masse };
      });
    });
    if (!buegel) buegel = { ds: 10, s: Math.min(150, sMax), rho: 0, masse: 0 };

    hinweise.push(`A_s,min = ${asMin.toFixed(2)} cm² bei d = ${(nutzhoehe * 100).toFixed(1)} cm (Abs. 9.2.1.1)`);
    hinweise.push(`ρ_w,min = 0,08·√f_ck/f_yk = ${(rhoWMin * 1000).toFixed(2)} ‰, s_l,max = 0,75·d = ${sMax.toFixed(0)} mm (Abs. 9.2.2)`);

    return {
      moeglich: true,
      parameter: { dsLaengs: laengs.ds, nLaengs: laengs.n, dsOben: naechsterDurchmesser(Math.max(12, laengs.ds * 0.6)), nOben: 2, dsBuegel: buegel.ds, sBuegel: buegel.s },
      hinweise,
      nachweis: {
        art: "Balken", asMin, asVorh: laengs.as, sMax,
        gewaehlt: `${laengs.n} ⌀${laengs.ds} unten + Bügel ⌀${buegel.ds}/${buegel.s} mm`,
        auslastung: asMin / laengs.as, unzureichend: laengs.as < asMin,
      },
    };
  }

  // ---- Bohrpfähle: nicht automatisch
  return {
    moeglich: false, parameter: null,
    hinweise: ["Bohrpfähle werden nicht automatisch bewehrt: Korblänge, Mindestbewehrung und Stababstände nach DIN EN 1536 mit EA-Pfähle und der Pfahlbemessung festlegen."],
    nachweis: null,
  };
}
