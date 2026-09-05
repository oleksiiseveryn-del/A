/**
 * Stahlbau-Verbindungen nach DIN EN 1993-1-8 mit deutschem Nationalen Anhang.
 *
 * Geführt werden die Nachweise, die einen Anschluss im Stahlbau tragen:
 *
 *   Schrauben   Abscheren, Lochleibung, Zug, Durchstanzen, Interaktion
 *               Zug/Abscheren, Rand- und Lochabstände
 *   Bauteil     Nettoquerschnitt auf Zug, Blockversagen (Herausreißen)
 *   Schweißen   Kehlnaht nach dem vereinfachten und dem richtungsbezogenen
 *               Verfahren, Mindest- und Höchstmaße der Nahtdicke
 *   Anschluss   Fachwerkstab am Knotenblech (geschraubt oder geschweißt),
 *               geschraubter Stirnplattenstoß mit T-Stummel-Modell
 *
 * Teilsicherheitsbeiwerte nach dem deutschen NA: γM0 = 1,00 für
 * Querschnitte, γM2 = 1,25 für Bruchversagen (Schrauben, Schweißnähte,
 * Nettoquerschnitt, Blockversagen).
 *
 * Rechenwege
 * ----------
 * Abscheren (Tab. 3.4):   F_v,Rd = α_v · f_ub · A / γM2
 *   α_v = 0,6 für 4.6, 5.6 und 8.8, α_v = 0,5 für 10.9, wenn die Scherfuge
 *   im Gewinde liegt; liegt sie im Schaft, ist α_v = 0,6 und A der
 *   Schaftquerschnitt.
 * Lochleibung:            F_b,Rd = k₁ · α_b · f_u · d · t / γM2
 *   α_b = min(α_d ; f_ub/f_u ; 1,0);  α_d = e₁/(3d₀) am Rand,
 *   α_d = p₁/(3d₀) − 1/4 innen;  k₁ = min(2,8·e₂/d₀ − 1,7 ; 2,5) am Rand,
 *   k₁ = min(1,4·p₂/d₀ − 1,7 ; 2,5) innen.
 * Zug:                    F_t,Rd = 0,9 · f_ub · A_s / γM2
 * Durchstanzen:           B_p,Rd = 0,6 · π · d_m · t_p · f_u / γM2
 * Interaktion (Tab. 3.4): F_v,Ed/F_v,Rd + F_t,Ed/(1,4·F_t,Rd) ≤ 1,0
 * Nettoquerschnitt:       N_u,Rd = 0,9 · A_net · f_u / γM2
 * Blockversagen (3.10.2): V_eff,1,Rd = f_u·A_nt/γM2 + f_y·A_nv/(√3·γM0)
 * Kehlnaht (4.5.3.3):     f_vw,d = (f_u/√3)/(β_w · γM2), F_w,Rd = f_vw,d · a
 *   β_w = 0,80 (S235), 0,85 (S275), 0,90 (S355)
 * T-Stummel (Tab. 6.2):   Modus 1  F = 4·M_pl,1,Rd/m
 *                         Modus 2  F = (2·M_pl,2,Rd + n·ΣF_t,Rd)/(m+n)
 *                         Modus 3  F = ΣF_t,Rd
 *   mit M_pl,Rd = 0,25 · Σℓ_eff · t² · f_y / γM0 und n = min(e ; 1,25·m)
 *
 * NICHT geführt: gleitfeste Verbindungen (GV/GVP) und ihre Vorspannung,
 * Langlöcher, Passschrauben, die Wirksamkeit von Schraubengruppen nach
 * Tab. 6.6 (jede Schraubenreihe wird für sich gerechnet), die Bauteile des
 * Stützenstegs (Schub, Beulen, Quetschen), Steifen und Rippen, Ermüdung,
 * Brandfall sowie die Bemessung der Fußplatte im Beton. Die Anschlüsse sind
 * als gelenkig oder biegesteif zu unterstellen und in der Tragwerksberechnung
 * entsprechend abzubilden; die Nachgiebigkeit nach Abs. 6.3 wird nicht
 * bestimmt.
 */

/** Teilsicherheitsbeiwerte nach DIN EN 1993-1-8/NA. */
const ANSCHLUSS_BEIWERTE = { gammaM0: 1.00, gammaM2: 1.25 };

/**
 * Schraubenkatalog. A ist der Schaftquerschnitt, A_s der Spannungsquerschnitt
 * nach DIN 13, d₀ der Lochdurchmesser für Schrauben mit normalem Lochspiel
 * (bis M14 +1 mm, M16 bis M24 +2 mm, ab M27 +3 mm), d_m der Mittelwert aus
 * Schlüsselweite und Eckenmaß der Mutter (für den Durchstanznachweis).
 */
const SCHRAUBEN = {
  M12: { d: 12, d0: 13, A: 113.1, As: 84.3, dm: 19.0 },
  M16: { d: 16, d0: 18, A: 201.1, As: 157.0, dm: 25.4 },
  M20: { d: 20, d0: 22, A: 314.2, As: 245.0, dm: 31.5 },
  M24: { d: 24, d0: 26, A: 452.4, As: 353.0, dm: 37.8 },
  M27: { d: 27, d0: 30, A: 572.6, As: 459.0, dm: 43.1 },
  M30: { d: 30, d0: 33, A: 706.9, As: 561.0, dm: 48.4 },
};

/** Festigkeitsklassen nach DIN EN ISO 898-1 / EN 1993-1-8 Tab. 3.1. */
const SCHRAUBENKLASSEN = {
  "4.6": { fyb: 240, fub: 400, alphaV: 0.6 },
  "5.6": { fyb: 300, fub: 500, alphaV: 0.6 },
  "8.8": { fyb: 640, fub: 800, alphaV: 0.6 },
  "10.9": { fyb: 900, fub: 1000, alphaV: 0.5 },
};

/** Korrelationsbeiwert β_w der Kehlnaht nach Tab. 4.1. */
const BETA_W = { S235: 0.80, S275: 0.85, S355: 0.90 };

/** Anschlussarten. */
const ANSCHLUSSARTEN = {
  knotenblech_geschraubt: {
    name: "Fachwerkstab am Knotenblech, geschraubt",
    beanspruchung: "N",
  },
  knotenblech_geschweisst: {
    name: "Fachwerkstab am Knotenblech, geschweißt",
    beanspruchung: "N",
  },
  stirnplatte: {
    name: "Stirnplattenstoß, geschraubt (biegesteif)",
    beanspruchung: "M+V",
  },
};

/** Zahl mit Dezimalkomma. */
function anschlussZahl(wert, stellen) {
  return Number(wert).toFixed(stellen === undefined ? 2 : stellen).replace(".", ",");
}

/* ---------------------------------------------------- Einzelnachweise */

/**
 * Abschertragfähigkeit einer Schraube je Scherfuge.
 * @param {Object} s - Schraube aus SCHRAUBEN
 * @param {Object} k - Klasse aus SCHRAUBENKLASSEN
 * @param {boolean} imGewinde - Scherfuge im Gewinde (sonst im Schaft)
 */
function schraubeAbscheren(s, k, imGewinde) {
  const alphaV = imGewinde ? k.alphaV : 0.6;
  const A = imGewinde ? s.As : s.A;
  return {
    wert: (alphaV * k.fub * A) / ANSCHLUSS_BEIWERTE.gammaM2 / 1000,   // kN
    alphaV, A,
    formel: `F_v,Rd = ${anschlussZahl(alphaV, 1)} · ${k.fub} · ${anschlussZahl(A, 1)} / 1,25`,
  };
}

/**
 * Lochleibungstragfähigkeit.
 * @param {Object} lage - { e1, e2, p1, p2 } in mm; p1/p2 nur bei Innenschrauben
 * @param {number} t - Blechdicke in mm
 * @param {number} fu - Zugfestigkeit des Bleches
 */
function schraubeLochleibung(s, k, lage, t, fu) {
  const rand = !(lage.p1 > 0);
  const alphaD = rand ? lage.e1 / (3 * s.d0) : lage.p1 / (3 * s.d0) - 0.25;
  const alphaB = Math.min(alphaD, k.fub / fu, 1.0);
  const k1 = lage.p2 > 0
    ? Math.min(1.4 * (lage.p2 / s.d0) - 1.7, 2.5)
    : Math.min(2.8 * (lage.e2 / s.d0) - 1.7, 2.5);
  return {
    wert: (Math.max(0, k1) * Math.max(0, alphaB) * fu * s.d * t) / ANSCHLUSS_BEIWERTE.gammaM2 / 1000,
    alphaD, alphaB, k1, rand,
    formel: `F_b,Rd = ${anschlussZahl(k1)} · ${anschlussZahl(alphaB, 3)} · ${fu} · ${s.d} · ${anschlussZahl(t, 1)} / 1,25`,
  };
}

/** Zugtragfähigkeit einer Schraube. */
function schraubeZug(s, k) {
  return {
    wert: (0.9 * k.fub * s.As) / ANSCHLUSS_BEIWERTE.gammaM2 / 1000,
    formel: `F_t,Rd = 0,9 · ${k.fub} · ${anschlussZahl(s.As, 1)} / 1,25`,
  };
}

/** Durchstanzen des Bleches unter Schraubenkopf oder Mutter. */
function schraubeDurchstanzen(s, tp, fu) {
  return {
    wert: (0.6 * Math.PI * s.dm * tp * fu) / ANSCHLUSS_BEIWERTE.gammaM2 / 1000,
    formel: `B_p,Rd = 0,6 · π · ${anschlussZahl(s.dm, 1)} · ${anschlussZahl(tp, 1)} · ${fu} / 1,25`,
  };
}

/**
 * Rand- und Lochabstände nach Tab. 3.3.
 * Mindestwerte: e₁ ≥ 1,2 d₀, e₂ ≥ 1,2 d₀, p₁ ≥ 2,2 d₀, p₂ ≥ 2,4 d₀
 * Höchstwerte (nicht rostgeschützt bzw. Regelfall): e ≤ 4t + 40 mm,
 * p ≤ min(14 t ; 200 mm)
 */
function abstandsPruefung(s, lage, t) {
  const meldungen = [];
  const pruefe = (name, wert, min, max) => {
    if (!(wert > 0)) return;
    if (wert < min - 1e-9) {
      meldungen.push({ art: "fehler", text: `${name} = ${anschlussZahl(wert, 1)} mm < `
        + `${anschlussZahl(min, 1)} mm (Mindestabstand nach Tab. 3.3)` });
    } else if (max && wert > max + 1e-9) {
      meldungen.push({ art: "warnung", text: `${name} = ${anschlussZahl(wert, 1)} mm > `
        + `${anschlussZahl(max, 1)} mm (Höchstabstand nach Tab. 3.3)` });
    }
  };
  const maxE = 4 * t + 40;
  const maxP = Math.min(14 * t, 200);
  pruefe("e₁", lage.e1, 1.2 * s.d0, maxE);
  pruefe("e₂", lage.e2, 1.2 * s.d0, maxE);
  pruefe("p₁", lage.p1, 2.2 * s.d0, maxP);
  pruefe("p₂", lage.p2, 2.4 * s.d0, maxP);
  return meldungen;
}

/**
 * Kehlnaht: Tragfähigkeit je Millimeter Nahtlänge.
 * Vereinfachtes Verfahren nach 4.5.3.3.
 */
function kehlnaht(a, guete, fu) {
  const betaW = BETA_W[guete] || 0.9;
  const fvwd = (fu / Math.sqrt(3)) / (betaW * ANSCHLUSS_BEIWERTE.gammaM2);
  return {
    betaW, fvwd,
    proMillimeter: (fvwd * a) / 1000,      // kN je mm Nahtlänge
    formel: `f_vw,d = (${fu}/√3) / (${anschlussZahl(betaW, 2)} · 1,25) = ${anschlussZahl(fvwd, 1)} N/mm²`,
  };
}

/**
 * Richtungsbezogenes Verfahren nach 4.5.3.2 für eine Kehlnaht, die in ihrer
 * wirksamen Ebene beansprucht wird.
 * @param {Object} kraefte - { senkrecht, laengs, quer } in N je mm²
 */
function kehlnahtRichtung(kraefte, guete, fu) {
  const betaW = BETA_W[guete] || 0.9;
  const s = kraefte.senkrecht || 0, tq = kraefte.quer || 0, tl = kraefte.laengs || 0;
  const vergleich = Math.sqrt(s * s + 3 * (tq * tq + tl * tl));
  const grenze1 = fu / (betaW * ANSCHLUSS_BEIWERTE.gammaM2);
  const grenze2 = (0.9 * fu) / ANSCHLUSS_BEIWERTE.gammaM2;
  return {
    vergleich, grenze1, grenze2,
    ausnutzung: Math.max(vergleich / grenze1, Math.abs(s) / grenze2),
    erfuellt: vergleich <= grenze1 + 1e-9 && Math.abs(s) <= grenze2 + 1e-9,
  };
}

/**
 * Mindest- und Höchstmaß der Kehlnahtdicke.
 * a ≥ 3 mm (Abs. 4.5.2), a ≤ 0,7 · t_min (Regel der Praxis, damit die Naht
 * das dünnere Blech nicht überfordert); wirksame Länge ℓ ≥ max(30 mm; 6a).
 */
function nahtPruefung(a, tMin, laenge) {
  const meldungen = [];
  if (a < 3) meldungen.push({ art: "fehler", text: `Nahtdicke a = ${anschlussZahl(a, 1)} mm < 3 mm (Abs. 4.5.2)` });
  if (a > 0.7 * tMin + 1e-9) {
    meldungen.push({ art: "warnung", text: `Nahtdicke a = ${anschlussZahl(a, 1)} mm > 0,7 · t_min = `
      + `${anschlussZahl(0.7 * tMin, 1)} mm – übliche Grenze der Praxis` });
  }
  const lMin = Math.max(30, 6 * a);
  if (laenge < lMin) {
    meldungen.push({ art: "fehler", text: `wirksame Nahtlänge ${anschlussZahl(laenge, 0)} mm < `
      + `${anschlussZahl(lMin, 0)} mm (Abs. 4.5.1: ℓ ≥ max(30 mm; 6a))` });
  }
  return meldungen;
}

/* ------------------------------------------------ Bauteilnachweise */

/** Zugtragfähigkeit des Bruttoquerschnitts. */
function bruttoZug(A, fy) {
  return (A * fy) / ANSCHLUSS_BEIWERTE.gammaM0 / 1000;
}

/** Zugtragfähigkeit des Nettoquerschnitts, Gl. (6.7). */
function nettoZug(Anet, fu) {
  return (0.9 * Anet * fu) / ANSCHLUSS_BEIWERTE.gammaM2 / 1000;
}

/**
 * Blockversagen nach Abs. 3.10.2.
 * @param {number} Ant - auf Zug beanspruchte Nettofläche [mm²]
 * @param {number} Anv - auf Schub beanspruchte Nettofläche [mm²]
 * @param {boolean} mittig - mittiger Kraftangriff (sonst außermittig)
 */
function blockversagen(Ant, Anv, fy, fu, mittig) {
  const zugteil = (mittig ? 1.0 : 0.5) * fu * Ant / ANSCHLUSS_BEIWERTE.gammaM2;
  const schubteil = (fy * Anv) / (Math.sqrt(3) * ANSCHLUSS_BEIWERTE.gammaM0);
  return {
    wert: (zugteil + schubteil) / 1000,
    zugteil: zugteil / 1000, schubteil: schubteil / 1000, mittig,
  };
}

/* --------------------------------------------------- Anschlussarten */

/**
 * Fachwerkstab am Knotenblech, geschraubt.
 *
 * Der Stab wird über ein Knotenblech angeschlossen; die Schrauben stehen in
 * einer oder zwei Reihen in Kraftrichtung. Geführt werden Abscheren,
 * Lochleibung in Blech und Anschlussteil, Nettoquerschnitt und Blockversagen.
 *
 * @param {Object} d - Eingaben
 *   N_Ed [kN], schraube, klasse, anzahl, scherfugen, imGewinde,
 *   tBlech, tStab, guete, e1, e2, p1, p2, reihen, A (Stabfläche),
 *   loecherImSchnitt
 */
function anschlussKnotenblech(d) {
  const s = SCHRAUBEN[d.schraube];
  const k = SCHRAUBENKLASSEN[d.klasse];
  const stahl = STEEL_GRADES[d.guete] || STEEL_GRADES.S235;
  const n = Math.max(1, d.anzahl || 1);
  const scherfugen = Math.max(1, d.scherfugen || 1);
  const N = Math.abs(d.N_Ed || 0);

  const abscheren = schraubeAbscheren(s, k, d.imGewinde !== false);
  const abscherenGesamt = abscheren.wert * scherfugen * n;

  // Lochleibung: die dünnere der beiden Platten ist maßgebend; Rand- und
  // Innenschrauben werden getrennt gerechnet und addiert
  const tMin = Math.min(d.tBlech, d.tStab * (scherfugen > 1 ? 2 : 1));
  const randSchrauben = Math.min(n, d.reihen || 1);
  const innenSchrauben = n - randSchrauben;
  const lochRand = schraubeLochleibung(s, k, { e1: d.e1, e2: d.e2, p1: 0, p2: d.p2 }, tMin, stahl.fu);
  const lochInnen = innenSchrauben > 0
    ? schraubeLochleibung(s, k, { e1: d.e1, e2: d.e2, p1: d.p1, p2: d.p2 }, tMin, stahl.fu)
    : null;
  const lochGesamt = lochRand.wert * randSchrauben + (lochInnen ? lochInnen.wert * innenSchrauben : 0);

  // Querschnitte des Stabes
  const Abrutto = d.A || 0;
  const Anet = Math.max(0, Abrutto - (d.loecherImSchnitt || 1) * s.d0 * d.tStab);
  const brutto = bruttoZug(Abrutto, stahl.fy);
  const netto = nettoZug(Anet, stahl.fu);

  // Blockversagen im Knotenblech: Zugfläche quer, Schubfläche längs
  const reihen = Math.max(1, d.reihen || 1);
  const proReihe = Math.ceil(n / reihen);
  const lv = d.e1 + (proReihe - 1) * (d.p1 || 0);          // Länge in Kraftrichtung
  const Ant = Math.max(0, ((reihen - 1) * (d.p2 || 0) - (reihen - 1) * s.d0) * d.tBlech);
  const Anv = Math.max(0, 2 * (lv - (proReihe - 0.5) * s.d0) * d.tBlech);
  const block = blockversagen(Ant, Anv, stahl.fy, stahl.fu, true);

  const nachweise = [
    { name: "Abscheren der Schrauben", formel: `${n} × ${scherfugen} × ${abscheren.formel}`,
      Rd: abscherenGesamt, hinweis: `α_v = ${anschlussZahl(abscheren.alphaV, 1)}, `
        + `${d.imGewinde !== false ? "Scherfuge im Gewinde" : "Scherfuge im Schaft"}` },
    { name: "Lochleibung", formel: lochRand.formel, Rd: lochGesamt,
      hinweis: `maßgebende Dicke ${anschlussZahl(tMin, 1)} mm · `
        + `${randSchrauben} Randschraube${randSchrauben === 1 ? "" : "n"}`
        + `${innenSchrauben ? `, ${innenSchrauben} innen` : ""}` },
    { name: "Zug im Bruttoquerschnitt", formel: `N_pl,Rd = ${anschlussZahl(Abrutto, 0)} · ${stahl.fy} / 1,00`,
      Rd: brutto, hinweis: "Fließen, Gl. (6.6)" },
    { name: "Zug im Nettoquerschnitt", formel: `N_u,Rd = 0,9 · ${anschlussZahl(Anet, 0)} · ${stahl.fu} / 1,25`,
      Rd: netto, hinweis: `${d.loecherImSchnitt || 1} Loch/Löcher abgezogen, Gl. (6.7)` },
    { name: "Blockversagen im Knotenblech",
      formel: `V_eff,1,Rd = f_u·A_nt/1,25 + f_y·A_nv/(√3·1,00) = `
        + `${anschlussZahl(block.zugteil)} + ${anschlussZahl(block.schubteil)}`,
      Rd: block.wert, hinweis: "Abs. 3.10.2, mittiger Kraftangriff" },
  ];

  return anschlussErgebnis(N, nachweise,
    abstandsPruefung(s, { e1: d.e1, e2: d.e2, p1: d.p1, p2: d.p2 }, tMin), {
      art: "knotenblech_geschraubt", schraube: s, klasse: k, anzahl: n, scherfugen,
      Anet, Abrutto, tMin, lage: { e1: d.e1, e2: d.e2, p1: d.p1, p2: d.p2 },
      reihen, proReihe, guete: d.guete,
    });
}

/**
 * Fachwerkstab am Knotenblech, geschweißt (Flankenkehlnähte).
 *
 * @param {Object} d - N_Ed, a, laenge (je Naht), anzahlNaehte, tStab, tBlech, guete
 */
function anschlussKnotenblechSchweiss(d) {
  const stahl = STEEL_GRADES[d.guete] || STEEL_GRADES.S235;
  const N = Math.abs(d.N_Ed || 0);
  const naht = kehlnaht(d.a, d.guete, stahl.fu);
  const anzahl = Math.max(1, d.anzahlNaehte || 2);
  // wirksame Länge: je Naht die Länge, Endkrater bleiben unberücksichtigt,
  // weil die Naht nach Abs. 4.5.1 umlaufend geführt wird
  const Rd = naht.proMillimeter * d.laenge * anzahl;

  const Abrutto = d.A || 0;
  const brutto = bruttoZug(Abrutto, stahl.fy);

  const nachweise = [
    { name: "Kehlnähte", formel: `${anzahl} × a = ${anschlussZahl(d.a, 1)} mm × ℓ = `
      + `${anschlussZahl(d.laenge, 0)} mm · ${naht.formel}`, Rd,
      hinweis: `vereinfachtes Verfahren nach 4.5.3.3, β_w = ${anschlussZahl(naht.betaW, 2)}` },
    { name: "Zug im Bruttoquerschnitt", formel: `N_pl,Rd = ${anschlussZahl(Abrutto, 0)} · ${stahl.fy} / 1,00`,
      Rd: brutto, hinweis: "geschweißter Anschluss: kein Lochabzug" },
  ];

  return anschlussErgebnis(N, nachweise,
    nahtPruefung(d.a, Math.min(d.tStab, d.tBlech), d.laenge),
    { art: "knotenblech_geschweisst", naht, anzahl, guete: d.guete });
}

/**
 * Geschraubter Stirnplattenstoß (biegesteif).
 *
 * Die Zugkraft je Schraubenreihe folgt dem T-Stummel-Modell nach Tab. 6.2;
 * das Moment ergibt sich aus den Zugkräften mal ihrem Hebelarm zum
 * Druckpunkt in der Mitte des gedrückten Flansches.
 *
 * @param {Object} d - M_Ed [kNm], V_Ed [kN], schraube, klasse, tp (Stirnplatte),
 *        guete, h (Trägerhöhe), tf (Flanschdicke), reihen: [{ abstand, m, e }]
 *        abstand = Abstand vom Druckpunkt [mm]
 */
function anschlussStirnplatte(d) {
  const s = SCHRAUBEN[d.schraube];
  const k = SCHRAUBENKLASSEN[d.klasse];
  const stahl = STEEL_GRADES[d.guete] || STEEL_GRADES.S235;
  const ftrd = schraubeZug(s, k).wert;      // je Schraube
  const proReihe = 2;                        // zwei Schrauben je Reihe

  const reihen = (d.reihen || []).map((r, i) => {
    const m = r.m, e = r.e;
    const n = Math.min(e, 1.25 * m);
    // wirksame Längen: kreisförmiges und nicht kreisförmiges Muster
    const leffCp = 2 * Math.PI * m;
    const leffNc = 4 * m + 1.25 * e;
    const leff1 = Math.min(leffCp, leffNc);
    const leff2 = leffNc;
    const Mpl1 = (0.25 * leff1 * d.tp * d.tp * stahl.fy) / ANSCHLUSS_BEIWERTE.gammaM0 / 1e6;  // kNm
    const Mpl2 = (0.25 * leff2 * d.tp * d.tp * stahl.fy) / ANSCHLUSS_BEIWERTE.gammaM0 / 1e6;
    const modus1 = (4 * Mpl1 * 1000) / m;
    const modus2 = (2 * Mpl2 * 1000 + n * proReihe * ftrd) / (m + n);
    const modus3 = proReihe * ftrd;
    const Ft = Math.min(modus1, modus2, modus3);
    return {
      nummer: i + 1, abstand: r.abstand, m, e, n,
      leff1, leff2, Mpl1, Mpl2, modus1, modus2, modus3, Ft,
      massgebend: Ft === modus1 ? "Modus 1 (Platte fließt)"
        : Ft === modus2 ? "Modus 2 (Platte und Schrauben)" : "Modus 3 (Schrauben)",
      anteil: 0,
    };
  });

  const MRd = reihen.reduce((sum, r) => sum + (r.Ft * r.abstand) / 1000, 0);   // kNm
  // Querkraft: alle Schrauben, Abscheren und Lochleibung
  const abscheren = schraubeAbscheren(s, k, true);
  const nSchrauben = reihen.length * proReihe;
  const VRd = abscheren.wert * nSchrauben;

  const M = Math.abs(d.M_Ed || 0);
  const V = Math.abs(d.V_Ed || 0);
  reihen.forEach((r) => { r.anteil = MRd > 0 ? (M * (r.Ft * r.abstand / 1000)) / MRd : 0; });

  const nachweise = [
    { name: "Momententragfähigkeit", formel: `M_Rd = Σ F_t,i · h_i = `
      + reihen.map((r) => `${anschlussZahl(r.Ft, 1)}·${anschlussZahl(r.abstand / 1000, 3)}`).join(" + "),
      Rd: MRd, Ed: M, einheit: "kNm", hinweis: "T-Stummel-Modell nach Tab. 6.2" },
    { name: "Querkraft der Schrauben", formel: `${nSchrauben} × ${abscheren.formel}`,
      Rd: VRd, Ed: V, einheit: "kN", hinweis: "Abscheren; Interaktion mit Zug siehe unten" },
  ];

  // Interaktion Zug und Abscheren in der obersten Reihe
  if (reihen.length) {
    const oben = reihen[0];
    const FtEd = MRd > 0 ? (M / MRd) * oben.Ft / proReihe : 0;
    const FvEd = V / nSchrauben;
    const ftrdEinzel = ftrd;
    const ausnutzung = FvEd / abscheren.wert + FtEd / (1.4 * ftrdEinzel);
    nachweise.push({
      name: "Interaktion Zug und Abscheren (oberste Reihe)",
      formel: `F_v,Ed/F_v,Rd + F_t,Ed/(1,4·F_t,Rd) = ${anschlussZahl(FvEd / abscheren.wert, 3)} + `
        + `${anschlussZahl(FtEd / (1.4 * ftrdEinzel), 3)}`,
      Rd: 1, Ed: ausnutzung, einheit: "–", hinweis: "Tab. 3.4",
    });
  }

  const meldungen = [];
  if (d.tp < 10) meldungen.push({ art: "warnung", text: "Stirnplatte unter 10 mm – im Stahlbau unüblich." });
  reihen.forEach((r) => {
    if (r.m < 1.2 * s.d0) {
      meldungen.push({ art: "fehler", text: `Reihe ${r.nummer}: m = ${anschlussZahl(r.m, 0)} mm ist kleiner `
        + `als 1,2·d₀ = ${anschlussZahl(1.2 * s.d0, 0)} mm – die Schraube ist nicht zu setzen.` });
    }
  });

  const ergebnis = anschlussErgebnis(M, nachweise, meldungen, {
    art: "stirnplatte", schraube: s, klasse: k, reihen, MRd, VRd, tp: d.tp, guete: d.guete,
  });
  ergebnis.reihen = reihen;
  return ergebnis;
}

/** Gemeinsame Auswertung: Ausnutzung, maßgebender Nachweis, Meldungen. */
function anschlussErgebnis(Ed, nachweise, meldungen, angaben) {
  const gefuehrt = nachweise.map((n) => {
    const beanspruchung = n.Ed !== undefined ? n.Ed : Ed;
    const ausnutzung = n.Rd > 0 ? beanspruchung / n.Rd : Infinity;
    return Object.assign({}, n, { Ed: beanspruchung, ausnutzung, einheit: n.einheit || "kN" });
  });
  const max = gefuehrt.reduce((a, b) => (b.ausnutzung > a.ausnutzung ? b : a), gefuehrt[0]);
  const fehler = meldungen.filter((m) => m.art === "fehler").length;
  return {
    nachweise: gefuehrt,
    massgebend: max,
    ausnutzung: max ? max.ausnutzung : 0,
    status: fehler ? "fehler" : (max && max.ausnutzung > 1.0 ? "fehler" : (max && max.ausnutzung > 0.95 ? "grenzwertig" : "ok")),
    meldungen,
    angaben,
  };
}
