/**
 * Tiefbau: Trassierung, Gradiente, Querprofile und Erdmassen.
 *
 * Der Weg ist der des Straßen- und Wegebaus:
 *
 *   Achse       Lageplan aus Geraden, Kreisbögen und Klothoiden
 *   Gradiente   Höhenplan aus Neigungsabschnitten mit Ausrundungen
 *   Querprofil  Regelquerschnitt gegen das Gelände, je Station
 *   Massen      Abtrag und Auftrag aus den Querschnittsflächen
 *   Ausgleich   Wiederverwendung, Überschuss, Fehlmenge, Kosten
 *
 * Rechengrundlagen
 * ----------------
 * Achse: Jedes Element ist über seine Krümmung beschrieben – Gerade
 * κ = 0, Kreisbogen κ = 1/R, Klothoide κ linear veränderlich. Gerade und
 * Bogen werden geschlossen gerechnet, die Klothoide über die Integration
 * von cos θ und sin θ nach Simpson; θ(s) = θ₀ + κ₁·s + (κ₂−κ₁)·s²/(2L).
 * Das ist dieselbe Beschreibung, die die Klothoide als Übergangsbogen
 * ausmacht: die Krümmung wächst mit der Weglänge, der Ruck bleibt
 * begrenzt (A² = R·L).
 *
 * Gradiente: Neigungswechsel werden mit einer quadratischen Parabel
 * ausgerundet (Kuppe und Wanne). Bei Halbmesser H und Neigungssprung
 * Δs ist die Ausrundungslänge L = H·Δs und die Tangentenlänge T = L/2;
 * innerhalb der Ausrundung gilt h = h_TS + s₁·u + u²/(2·H).
 *
 * Querprofil: Das Planum liegt lotrecht um die Oberbaudicke unter der
 * Fahrbahn- und Bankettoberfläche. An der Planumskante beginnt die
 * Böschung mit 1:n und läuft bis zum Schnitt mit dem Gelände. Gerechnet
 * wird gegen das Gelände **nach Abtrag des Oberbodens**; der Oberboden
 * ist eine eigene Leistung (Abtragen und Lagern nach DIN 18915).
 * Die Flächen zwischen Gelände und Planum werden abschnittsweise über
 * Trapeze bestimmt – bei zwei Streckenzügen ist das Ergebnis genau.
 *
 * Massen: Aus den Querschnittsflächen zweier Nachbarprofile im Abstand e
 *   Mittelwertverfahren (Trapez):  V = (A₁ + A₂)/2 · e
 *   Prismenformel (Simpson):       V = e/6 · (A₁ + 4·A_m + A₂)
 * Beide werden geführt, weil sie sich bei stark veränderlichen Profilen
 * unterscheiden; welches Verfahren und welche Profilabstände gelten,
 * ist vertraglich zu vereinbaren (REB-Verfahrensbeschreibungen zur
 * Massenberechnung aus Querprofilen, VOB/C DIN 18300).
 *
 * NICHT enthalten: Kurvenaufweitung, Verwindung und Anrampung der
 * Querneigung, Mulden und Gräben, Bankettverbreiterung in der Kurve,
 * Sichtweitenprüfung, Entwässerung, Deckenbuch und Lageplan-
 * koordinatenverzeichnis. Die Grenzwerte für Radien, Neigungen und
 * Klothoidenparameter richten sich nach RAL bzw. RASt; sie sind hier
 * als sichtbare Richtwerte hinterlegt und vom Entwurfsverfasser gegen
 * die Entwurfsklasse zu prüfen.
 */

/** Elemente der Achse. */
const TRASSE_ARTEN = {
  gerade: { name: "Gerade", radius: false },
  bogen: { name: "Kreisbogen", radius: true },
  klothoide: { name: "Klothoide", radius: true, radiusEnde: true },
};

/**
 * Richtwerte des Entwurfs. Sie sind bewusst sichtbar und änderbar:
 * Maßgebend ist die Entwurfsklasse nach RAL bzw. die Kategorie nach
 * RASt, nicht ein fest eingebauter Wert.
 */
const TRASSE_RICHTWERTE = {
  klothoideMin: 1 / 3,   // A ≥ R/3
  klothoideMax: 1,       // A ≤ R
  radiusMin: 30,         // m, Richtwert für innerörtliche Straßen
  laengsneigungMax: 6,   // %
  querneigungMin: 2.5,   // %
  querneigungMax: 6,     // %
};

/** Winkel auf 0…2π bringen. */
function winkelNormal(w) {
  const zwei = 2 * Math.PI;
  return ((w % zwei) + zwei) % zwei;
}

/**
 * Achse auswerten: je Element Anfangspunkt, Anfangsrichtung, Krümmung
 * am Anfang und am Ende sowie die Station.
 *
 * @param {Array} elemente - [{ art, laenge, radius, radiusEnde }]
 *        radius: positiv = Linkskurve, negativ = Rechtskurve, 0 = gerade
 * @param {Object} start - { x, y, richtung (gon oder Grad?), station }
 *        richtung in Grad, von der x-Achse aus gegen den Uhrzeigersinn
 */
function trasseAuswerten(elemente, start) {
  const s = Object.assign({ x: 0, y: 0, richtung: 0, station: 0 }, start || {});
  let x = s.x, y = s.y;
  let theta = (s.richtung * Math.PI) / 180;
  let station = s.station;
  const raus = [];

  elemente.forEach((el, i) => {
    const laenge = Math.max(0.001, Number(el.laenge) || 0);
    const r1 = Number(el.radius) || 0;
    const r2 = el.art === "klothoide" ? (Number(el.radiusEnde) || 0) : r1;
    const k1 = el.art === "gerade" ? 0 : (r1 ? 1 / r1 : 0);
    const k2 = el.art === "gerade" ? 0 : (el.art === "klothoide" ? (r2 ? 1 / r2 : 0) : k1);

    const eintrag = {
      nummer: i + 1, art: el.art, laenge,
      radius: r1, radiusEnde: r2, k1, k2,
      station, stationEnde: station + laenge,
      x, y, richtung: theta,
    };
    const ende = trasseElementPunkt(eintrag, laenge);
    eintrag.xEnde = ende.x; eintrag.yEnde = ende.y; eintrag.richtungEnde = ende.richtung;
    // Klothoidenparameter A² = R · L (mit dem endlichen Radius)
    if (el.art === "klothoide") {
      const rEnd = r2 || r1;
      eintrag.A = rEnd ? Math.sqrt(Math.abs(rEnd) * laenge) : null;
    }
    raus.push(eintrag);
    x = ende.x; y = ende.y; theta = ende.richtung; station = eintrag.stationEnde;
  });

  return { elemente: raus, laenge: station - s.station, start: s, stationEnde: station };
}

/**
 * Punkt in einem Element bei der örtlichen Länge s.
 *
 * Gerade und Kreisbogen geschlossen, die Klothoide über Simpson.
 * Die Zahl der Stützstellen wächst mit der Länge; bei 0,25 m Schrittweite
 * liegt der Fehler der Simpsonformel weit unter einem Zehntelmillimeter.
 */
function trasseElementPunkt(el, s) {
  const theta0 = el.richtung;
  if (Math.abs(el.k1) < 1e-12 && Math.abs(el.k2) < 1e-12) {
    return { x: el.x + s * Math.cos(theta0), y: el.y + s * Math.sin(theta0), richtung: theta0, kruemmung: 0 };
  }
  if (Math.abs(el.k2 - el.k1) < 1e-12) {
    // Kreisbogen: geschlossene Lösung
    const k = el.k1;
    const theta = theta0 + k * s;
    return {
      x: el.x + (Math.sin(theta) - Math.sin(theta0)) / k,
      y: el.y - (Math.cos(theta) - Math.cos(theta0)) / k,
      richtung: theta, kruemmung: k,
    };
  }
  // Klothoide: θ(u) = θ0 + k1·u + (k2−k1)·u²/(2L)
  const L = el.laenge;
  const dk = (el.k2 - el.k1) / L;
  const theta = (u) => theta0 + el.k1 * u + (dk * u * u) / 2;
  let n = Math.max(20, Math.ceil(s / 0.25));
  if (n % 2) n += 1;
  const h = s / n;
  let sx = 0, sy = 0;
  for (let i = 0; i <= n; i++) {
    const u = i * h;
    const g = i === 0 || i === n ? 1 : (i % 2 ? 4 : 2);
    sx += g * Math.cos(theta(u));
    sy += g * Math.sin(theta(u));
  }
  return {
    x: el.x + (h / 3) * sx,
    y: el.y + (h / 3) * sy,
    richtung: theta(s),
    kruemmung: el.k1 + dk * s,
  };
}

/** Punkt der Achse bei einer Station. */
function trassePunkt(trasse, station) {
  const el = trasse.elemente.find((e) => station >= e.station - 1e-9 && station <= e.stationEnde + 1e-9)
    || (station < trasse.start.station ? trasse.elemente[0] : trasse.elemente[trasse.elemente.length - 1]);
  if (!el) return null;
  const s = Math.max(0, Math.min(el.laenge, station - el.station));
  const p = trasseElementPunkt(el, s);
  return Object.assign(p, {
    station, element: el,
    radius: p.kruemmung ? 1 / p.kruemmung : Infinity,
    richtungGrad: (winkelNormal(p.richtung) * 180) / Math.PI,
  });
}

/**
 * Stationen für die Querprofile: gleicher Abstand, dazu die
 * Elementgrenzen (Hauptpunkte) und der Endpunkt.
 */
function trasseStationen(trasse, abstand) {
  const e = abstand > 0 ? abstand : 20;
  const menge = new Set();
  const runde = (w) => Math.round(w * 1000) / 1000;
  for (let s = trasse.start.station; s < trasse.stationEnde; s += e) menge.add(runde(s));
  trasse.elemente.forEach((el) => { menge.add(runde(el.station)); menge.add(runde(el.stationEnde)); });
  menge.add(runde(trasse.stationEnde));
  return Array.from(menge).sort((a, b) => a - b);
}

/** Station als Text in der Schreibweise des Straßenbaus: 0+120,000. */
function stationText(station) {
  const km = Math.floor(Math.abs(station) / 1000);
  const rest = Math.abs(station) - km * 1000;
  return `${station < 0 ? "−" : ""}${km}+${rest.toFixed(3).padStart(7, "0").replace(".", ",")}`;
}

/**
 * Prüfung der Achse gegen die Richtwerte des Entwurfs.
 * Geführt werden Mindestradius, Klothoidenparameter und
 * Krümmungssprünge zwischen benachbarten Elementen.
 */
function trassePruefung(trasse, richtwerte) {
  const r = Object.assign({}, TRASSE_RICHTWERTE, richtwerte || {});
  const meldungen = [];
  trasse.elemente.forEach((el) => {
    const name = `${TRASSE_ARTEN[el.art].name} ${el.nummer} (${stationText(el.station)})`;
    if (el.art === "bogen" && Math.abs(el.radius) < r.radiusMin) {
      meldungen.push({ art: "warnung", text: `${name}: Radius ${Math.abs(el.radius).toFixed(1)} m `
        + `unter dem Richtwert ${r.radiusMin} m – Mindestradius nach der Entwurfsklasse (RAL/RASt) prüfen.` });
    }
    if (el.art === "klothoide" && el.A) {
      const R = Math.abs(el.radiusEnde || el.radius);
      if (R) {
        if (el.A < R * r.klothoideMin) {
          meldungen.push({ art: "warnung", text: `${name}: A = ${el.A.toFixed(1)} m ist kleiner als R/3 `
            + `= ${(R / 3).toFixed(1)} m – Richtwert R/3 ≤ A ≤ R nicht eingehalten.` });
        } else if (el.A > R * r.klothoideMax) {
          meldungen.push({ art: "hinweis", text: `${name}: A = ${el.A.toFixed(1)} m ist größer als R `
            + `= ${R.toFixed(1)} m – der Übergang wird sehr lang, Richtwert R/3 ≤ A ≤ R.` });
        }
      }
    }
    // Krümmungssprung zum nächsten Element
    const naechstes = trasse.elemente[el.nummer];
    if (naechstes) {
      const sprung = Math.abs(naechstes.k1 - el.k2);
      if (sprung > 1e-6) {
        const r1 = el.k2 ? (1 / el.k2).toFixed(0) : "∞";
        const r2 = naechstes.k1 ? (1 / naechstes.k1).toFixed(0) : "∞";
        meldungen.push({ art: "warnung", text: `Übergang bei ${stationText(el.stationEnde)}: `
          + `Krümmungssprung von R = ${r1} m auf R = ${r2} m ohne Übergangsbogen – `
          + "eine Klothoide dazwischen setzen." });
      }
    }
  });
  return meldungen;
}

/* ------------------------------------------------------------ Gradiente */

/**
 * Gradiente aus Neigungswechselpunkten.
 *
 * @param {Array} punkte - [{ station, hoehe, halbmesser }]
 *        halbmesser: Ausrundungshalbmesser in m (0 = Knick ohne Ausrundung)
 * @returns {Object} { punkte, abschnitte, meldungen }
 */
function gradienteAuswerten(punkte) {
  const p = (punkte || []).slice().sort((a, b) => a.station - b.station);
  const abschnitte = [];
  for (let i = 0; i < p.length - 1; i++) {
    const d = p[i + 1].station - p[i].station;
    abschnitte.push({
      von: p[i].station, bis: p[i + 1].station,
      hoeheVon: p[i].hoehe, hoeheBis: p[i + 1].hoehe,
      neigung: d > 0 ? (p[i + 1].hoehe - p[i].hoehe) / d : 0,
    });
  }
  const meldungen = [];
  // Ausrundungen an den inneren Punkten
  const ausrundungen = [];
  for (let i = 1; i < p.length - 1; i++) {
    const s1 = abschnitte[i - 1].neigung, s2 = abschnitte[i].neigung;
    const H = Math.abs(Number(p[i].halbmesser) || 0);
    if (!H || Math.abs(s2 - s1) < 1e-9) continue;
    const Hv = Math.sign(s2 - s1) * H;      // Wanne positiv, Kuppe negativ
    const laenge = Math.abs(H * (s2 - s1));
    const T = laenge / 2;
    ausrundungen.push({
      station: p[i].station, hoehe: p[i].hoehe, H: Hv, laenge, T,
      s1, s2, von: p[i].station - T, bis: p[i].station + T,
      art: s2 - s1 < 0 ? "Kuppe" : "Wanne",
      // Stichmaß in der Mitte der Ausrundung
      stich: (Math.abs(s2 - s1) * laenge) / 8,
    });
    const vorher = abschnitte[i - 1].bis - abschnitte[i - 1].von;
    const nachher = abschnitte[i].bis - abschnitte[i].von;
    if (T > vorher / 2 + 1e-9 || T > nachher / 2 + 1e-9) {
      meldungen.push({ art: "warnung", text: `Ausrundung bei ${stationText(p[i].station)}: `
        + `Tangentenlänge ${T.toFixed(1)} m ist für die Nachbarabschnitte zu lang – `
        + "Halbmesser verkleinern oder Neigungswechsel verschieben." });
    }
  }
  p.forEach((punkt, i) => {
    if (i === 0) return;
    const n = abschnitte[i - 1].neigung * 100;
    if (Math.abs(n) > TRASSE_RICHTWERTE.laengsneigungMax) {
      meldungen.push({ art: "hinweis", text: `Längsneigung ${n.toFixed(2)} % zwischen `
        + `${stationText(abschnitte[i - 1].von)} und ${stationText(abschnitte[i - 1].bis)} `
        + `über dem Richtwert ${TRASSE_RICHTWERTE.laengsneigungMax} % – Entwurfsklasse prüfen.` });
    }
  });
  return { punkte: p, abschnitte, ausrundungen, meldungen };
}

/** Höhe und Neigung der Gradiente bei einer Station. */
function gradienteHoehe(gradiente, station) {
  const { punkte, abschnitte, ausrundungen } = gradiente;
  if (!punkte.length) return { hoehe: 0, neigung: 0, art: "keine" };
  if (punkte.length === 1) return { hoehe: punkte[0].hoehe, neigung: 0, art: "fest" };

  // liegt die Station in einer Ausrundung?
  const a = ausrundungen.find((r) => station >= r.von - 1e-9 && station <= r.bis + 1e-9);
  if (a) {
    const u = station - a.von;
    const hTS = a.hoehe - a.s1 * a.T;      // Höhe am Anfang der Ausrundung
    return {
      hoehe: hTS + a.s1 * u + (u * u) / (2 * a.H),
      neigung: a.s1 + u / a.H,
      art: a.art,
    };
  }
  const ab = abschnitte.find((x) => station >= x.von - 1e-9 && station <= x.bis + 1e-9)
    || (station < abschnitte[0].von ? abschnitte[0] : abschnitte[abschnitte.length - 1]);
  return {
    hoehe: ab.hoeheVon + ab.neigung * (station - ab.von),
    neigung: ab.neigung,
    art: "Neigung",
  };
}

/* ----------------------------------------------------------- Querprofil */

/**
 * Regelquerschnitt.
 *
 * fahrbahn        befestigte Breite [m]
 * querneigung     Querneigung der Fahrbahn [%], Gefälle nach rechts
 * dachprofil      true = Dachprofil (beidseitiges Gefälle von der Achse)
 * bankett         Breite des Banketts je Seite [m]
 * bankettNeigung  Querneigung des Banketts [%]
 * oberbau         Dicke des Oberbaus [m] – die Bauklasse folgt aus der
 *                 Belastung nach RStO; die Dicke ist eine Eingabe
 * oberboden       Dicke des abzutragenden Oberbodens [m] (DIN 18915)
 * boeschungAuftrag / boeschungAbtrag   Neigung 1:n
 */
const QUERSCHNITT_VORGABE = {
  fahrbahn: 6.50,
  querneigung: 2.5,
  dachprofil: true,
  bankett: 1.50,
  bankettNeigung: 12,
  oberbau: 0.55,
  oberboden: 0.25,
  boeschungAuftrag: 1.5,
  boeschungAbtrag: 1.5,
  maxBreite: 60,
};

/** Höhe und Querneigung des Geländes bei einer Station (linear dazwischen). */
function gelaendeBei(gelaende, station) {
  const g = (gelaende || []).slice().sort((a, b) => a.station - b.station);
  if (!g.length) return { hoehe: 0, querneigung: 0 };
  if (station <= g[0].station) return { hoehe: g[0].hoehe, querneigung: g[0].querneigung || 0 };
  const letzte = g[g.length - 1];
  if (station >= letzte.station) return { hoehe: letzte.hoehe, querneigung: letzte.querneigung || 0 };
  for (let i = 0; i < g.length - 1; i++) {
    if (station >= g[i].station && station <= g[i + 1].station) {
      const t = (station - g[i].station) / (g[i + 1].station - g[i].station || 1);
      return {
        hoehe: g[i].hoehe + t * (g[i + 1].hoehe - g[i].hoehe),
        querneigung: (g[i].querneigung || 0) + t * ((g[i + 1].querneigung || 0) - (g[i].querneigung || 0)),
      };
    }
  }
  return { hoehe: letzte.hoehe, querneigung: letzte.querneigung || 0 };
}

/** Höhe eines Streckenzuges bei der Abszisse x (außerhalb: Randwert). */
function linieHoehe(linie, x) {
  if (!linie.length) return 0;
  if (x <= linie[0].x) return linie[0].z;
  if (x >= linie[linie.length - 1].x) return linie[linie.length - 1].z;
  for (let i = 0; i < linie.length - 1; i++) {
    const a = linie[i], b = linie[i + 1];
    if (x >= a.x && x <= b.x) {
      const d = b.x - a.x;
      return d < 1e-12 ? b.z : a.z + ((x - a.x) / d) * (b.z - a.z);
    }
  }
  return linie[linie.length - 1].z;
}

/**
 * Flächen zwischen zwei Streckenzügen im Bereich [xl, xr].
 *
 * Getrennt wird an allen Knickpunkten beider Züge und an den
 * Schnittpunkten; in jedem Abschnitt ist die Differenz linear, das
 * Trapez also genau.
 *
 * @returns {Object} { ueber, unter } – Fläche, in der a über b liegt,
 *          und Fläche, in der a unter b liegt
 */
function flaechenZwischen(a, b, xl, xr) {
  const stellen = new Set([xl, xr]);
  a.concat(b).forEach((p) => { if (p.x > xl && p.x < xr) stellen.add(p.x); });
  let liste = Array.from(stellen).sort((p, q) => p - q);

  // Schnittpunkte der Differenzfunktion einfügen
  const mitSchnitt = [];
  for (let i = 0; i < liste.length - 1; i++) {
    const x1 = liste[i], x2 = liste[i + 1];
    const d1 = linieHoehe(a, x1) - linieHoehe(b, x1);
    const d2 = linieHoehe(a, x2) - linieHoehe(b, x2);
    mitSchnitt.push(x1);
    if (d1 * d2 < 0) {
      const t = d1 / (d1 - d2);
      mitSchnitt.push(x1 + t * (x2 - x1));
    }
  }
  mitSchnitt.push(liste[liste.length - 1]);
  liste = mitSchnitt;

  let ueber = 0, unter = 0;
  for (let i = 0; i < liste.length - 1; i++) {
    const x1 = liste[i], x2 = liste[i + 1];
    const breite = x2 - x1;
    if (breite <= 1e-12) continue;
    const d1 = linieHoehe(a, x1) - linieHoehe(b, x1);
    const d2 = linieHoehe(a, x2) - linieHoehe(b, x2);
    const flaeche = ((d1 + d2) / 2) * breite;
    if (flaeche >= 0) ueber += flaeche; else unter += -flaeche;
  }
  return { ueber, unter };
}

/**
 * Querprofil an einer Station.
 *
 * @param {Object} qs - Regelquerschnitt
 * @param {number} achshoehe - Höhe der Gradiente in der Achse (Fahrbahnoberkante)
 * @param {Object} gelaende - { hoehe, querneigung } an dieser Station
 * @returns {Object} Streckenzüge und Flächen
 */
function querprofil(qs, achshoehe, gelaende) {
  const q = Object.assign({}, QUERSCHNITT_VORGABE, qs || {});
  const halb = q.fahrbahn / 2;
  const qf = q.querneigung / 100;
  const qb = q.bankettNeigung / 100;

  // ---- Fahrbahnoberfläche
  const zLinksKante = q.dachprofil ? achshoehe - halb * qf : achshoehe + halb * qf;
  const zRechtsKante = achshoehe - halb * qf;
  const fahrbahn = [
    { x: -halb, z: zLinksKante },
    { x: 0, z: achshoehe },
    { x: halb, z: zRechtsKante },
  ];
  // ---- Bankett
  const bankettLinks = { x: -halb - q.bankett, z: zLinksKante - q.bankett * qb };
  const bankettRechts = { x: halb + q.bankett, z: zRechtsKante - q.bankett * qb };
  const oberflaeche = [bankettLinks].concat(fahrbahn, [bankettRechts]);

  // ---- Planum: lotrecht um die Oberbaudicke tiefer
  const planum = oberflaeche.map((p) => ({ x: p.x, z: p.z - q.oberbau }));

  // ---- Gelände als Gerade, danach der Oberboden abgezogen
  const gq = (gelaende.querneigung || 0) / 100;
  const gelaendeLinie = (x) => gelaende.hoehe - x * gq;
  const stripLinie = (x) => gelaendeLinie(x) - q.oberboden;

  /**
   * Böschung von der Planumskante bis zum Gelände.
   * Die Richtung entscheidet sich am Vorzeichen: Liegt das (abgeschobene)
   * Gelände über der Kante, wird abgetragen und die Böschung steigt nach
   * außen; liegt es darunter, wird aufgetragen und sie fällt.
   */
  const boeschung = (kante, richtung) => {
    const abtrag = stripLinie(kante.x) > kante.z;
    const n = abtrag ? q.boeschungAbtrag : q.boeschungAuftrag;
    const steigung = (abtrag ? 1 : -1) / n;       // je Meter nach außen
    // Höhenunterschied zwischen Böschung und Gelände an der Stelle t
    const abstandBei = (t) => (kante.z + steigung * t) - stripLinie(kante.x + richtung * t);
    const schritt = 0.02;
    let letzte = 0;
    let erreicht = false;
    let dAlt = abstandBei(0);
    if (Math.abs(dAlt) < 1e-9) {
      // Die Planumskante liegt bereits im Gelände: keine Böschung
      erreicht = true;
    } else {
      let t = 0;
      while (t < q.maxBreite) {
        const tNeu = t + schritt;
        const dNeu = abstandBei(tNeu);
        if (dAlt * dNeu <= 0) {
          // Schnitt zwischen t und tNeu: Bisektion
          let lo = t, hi = tNeu;
          for (let k = 0; k < 40; k++) {
            const mid = (lo + hi) / 2;
            if (abstandBei(mid) * dAlt <= 0) hi = mid; else lo = mid;
          }
          letzte = (lo + hi) / 2;
          erreicht = true;
          break;
        }
        t = tNeu;
        dAlt = dNeu;
        letzte = tNeu;
      }
    }
    const x = kante.x + richtung * letzte;
    return {
      punkt: { x, z: kante.z + steigung * letzte },
      laenge: Math.hypot(letzte, steigung * letzte),
      abtrag, n, erreicht, weite: letzte,
    };
  };

  const links = boeschung(planum[0], -1);
  const rechts = boeschung(planum[planum.length - 1], +1);

  // ---- Erdbaukörper: Böschung, Planum, Böschung
  const entwurf = [links.punkt].concat(planum, [rechts.punkt])
    .slice().sort((a, b) => a.x - b.x);
  const xl = entwurf[0].x, xr = entwurf[entwurf.length - 1].x;
  const strip = [{ x: xl, z: stripLinie(xl) }, { x: xr, z: stripLinie(xr) }];
  const gelaendeZug = [{ x: xl, z: gelaendeLinie(xl) }, { x: xr, z: gelaendeLinie(xr) }];

  const f = flaechenZwischen(strip, entwurf, xl, xr);
  const breite = xr - xl;

  return {
    querschnitt: q,
    achshoehe,
    gelaende,
    oberflaeche, planum, entwurf,
    gelaendeZug, stripZug: strip,
    links, rechts,
    breite,
    flaechen: {
      // Gelände über Planum = Abtrag, Planum über Gelände = Auftrag
      abtrag: f.ueber,
      auftrag: f.unter,
      // Oberboden über die gesamte Bauwerksbreite
      oberboden: breite * q.oberboden,
      // Oberbau nur unter der befestigten Fahrbahn
      oberbau: q.fahrbahn * q.oberbau,
    },
    hinweise: []
      .concat(links.erreicht ? [] : ["linke Böschung erreicht das Gelände nicht innerhalb der Grenzweite"])
      .concat(rechts.erreicht ? [] : ["rechte Böschung erreicht das Gelände nicht innerhalb der Grenzweite"]),
  };
}

/* --------------------------------------------------------------- Massen */

/**
 * Massen aus den Querschnittsflächen.
 *
 * Für jedes Feld zwischen zwei Profilen werden beide Verfahren gerechnet:
 *   Mittelwert (Trapez):  V = (A₁ + A₂)/2 · e
 *   Prismenformel:        V = e/6 · (A₁ + 4·A_m + A₂)
 * Das Mittelprofil A_m wird an der halben Station gerechnet, nicht
 * gemittelt – sonst wären beide Formeln dasselbe.
 *
 * @param {Array} stationen - aufsteigende Stationen
 * @param {Function} profilBei - (station) => Querprofil
 */
function massenBerechnung(stationen, profilBei) {
  const felder = [];
  const summe = {
    abtrag: 0, auftrag: 0, oberboden: 0, oberbau: 0,
    abtragPrisma: 0, auftragPrisma: 0,
  };
  const profile = stationen.map((s) => ({ station: s, profil: profilBei(s) }));

  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[i], b = profile[i + 1];
    const e = b.station - a.station;
    if (e <= 0) continue;
    const m = profilBei((a.station + b.station) / 2);
    const feld = { von: a.station, bis: b.station, abstand: e };
    ["abtrag", "auftrag", "oberboden", "oberbau"].forEach((art) => {
      const A1 = a.profil.flaechen[art], A2 = b.profil.flaechen[art], Am = m.flaechen[art];
      feld[art] = ((A1 + A2) / 2) * e;
      feld[art + "Prisma"] = (e / 6) * (A1 + 4 * Am + A2);
      feld["A1" + art] = A1; feld["A2" + art] = A2;
    });
    summe.abtrag += feld.abtrag;
    summe.auftrag += feld.auftrag;
    summe.oberboden += feld.oberboden;
    summe.oberbau += feld.oberbau;
    summe.abtragPrisma += feld.abtragPrisma;
    summe.auftragPrisma += feld.auftragPrisma;
    felder.push(feld);
  }
  return { felder, summe, profile };
}

/**
 * Homogenbereiche nach DIN 18300 (Ausgabe 2019).
 *
 * Die Bodenklassen der alten Fassung sind entfallen; ausgeschrieben wird
 * in Homogenbereichen, die über die Eigenschaften des Bodens beschrieben
 * werden (Korngrößenverteilung, Konsistenz, Lagerungsdichte, Wassergehalt,
 * organische Anteile, Steine und Blöcke). Die hier hinterlegten Faktoren
 * und Preise sind Anhaltswerte für die Kostenschätzung; maßgebend sind
 * das Baugrundgutachten und die eigenen Einkaufspreise.
 *
 * auflockerung   fest → lose (Transportmaß)
 * verdichtung    fest → eingebaut und verdichtet
 * wiederverwendung  Anteil des Abtrags, der eingebaut werden darf [%]
 */
const HOMOGENBEREICHE = {
  sand: {
    name: "Sand, mitteldicht (GE/SE)",
    beschreibung: "nichtbindig, gut verdichtbar, ganzjährig einbaufähig",
    auflockerung: 1.15, verdichtung: 0.95, wiederverwendung: 95,
    loesen: 4.50, einbau: 6.00, deponie: 12.00, lieferung: 22.00,
  },
  kies: {
    name: "Kies-Sand-Gemisch (GW/GI)",
    beschreibung: "nichtbindig, tragfähig, gut wiederverwendbar",
    auflockerung: 1.18, verdichtung: 0.96, wiederverwendung: 100,
    loesen: 4.80, einbau: 6.50, deponie: 12.00, lieferung: 26.00,
  },
  lehm: {
    name: "Lehm, steif (TL/TM)",
    beschreibung: "bindig, witterungsempfindlich, nur bedingt einbaufähig",
    auflockerung: 1.28, verdichtung: 0.92, wiederverwendung: 60,
    loesen: 6.50, einbau: 9.00, deponie: 24.00, lieferung: 24.00,
  },
  ton: {
    name: "Ton, weich bis steif (TA)",
    beschreibung: "bindig, wenig tragfähig, meist auszutauschen",
    auflockerung: 1.32, verdichtung: 0.90, wiederverwendung: 20,
    loesen: 8.50, einbau: 12.00, deponie: 32.00, lieferung: 24.00,
  },
  fels: {
    name: "Fels, veränderlich fest",
    beschreibung: "zu lösen mit Reißraupe oder Hydraulikhammer",
    auflockerung: 1.45, verdichtung: 1.05, wiederverwendung: 80,
    loesen: 26.00, einbau: 10.00, deponie: 18.00, lieferung: 30.00,
  },
  auffuellung: {
    name: "Auffüllung, unbekannter Zusammensetzung",
    beschreibung: "Untersuchung nach LAGA/AVV nötig – Entsorgungsklasse offen",
    auflockerung: 1.25, verdichtung: 0.90, wiederverwendung: 0,
    loesen: 7.00, einbau: 9.00, deponie: 48.00, lieferung: 24.00,
  },
};

/**
 * Massenausgleich: Was vom Abtrag eingebaut werden kann, was übrig
 * bleibt und was fehlt.
 *
 * Maßarten:
 *   Festmaß (F)      im Verband, so wird der Abtrag gemessen
 *   Lockermaß (L)    aufgelockert, so wird transportiert:  L = F · f_auf
 *   Verdichtet (V)   eingebaut, so wird der Auftrag gemessen: V = F · f_verd
 *
 * @param {Object} massen - { abtrag, auftrag, oberboden } in m³
 * @param {Object} boden - Homogenbereich
 */
function massenAusgleich(massen, boden) {
  const fAuf = boden.auflockerung, fVerd = boden.verdichtung;
  const anteil = (boden.wiederverwendung || 0) / 100;

  const abtragFest = massen.abtrag;
  const auftragVerdichtet = massen.auftrag;

  const brauchbarFest = abtragFest * anteil;
  const unbrauchbarFest = abtragFest - brauchbarFest;
  // Was das brauchbare Material eingebaut ergibt
  const ausBrauchbar = brauchbarFest * fVerd;

  let einbauAusAbtragFest, ueberschussFest, fehlmengeVerdichtet, lieferungFest;
  if (ausBrauchbar >= auftragVerdichtet) {
    einbauAusAbtragFest = auftragVerdichtet / fVerd;
    ueberschussFest = brauchbarFest - einbauAusAbtragFest;
    fehlmengeVerdichtet = 0;
    lieferungFest = 0;
  } else {
    einbauAusAbtragFest = brauchbarFest;
    ueberschussFest = 0;
    fehlmengeVerdichtet = auftragVerdichtet - ausBrauchbar;
    lieferungFest = fehlmengeVerdichtet / fVerd;
  }
  const abfuhrFest = ueberschussFest + unbrauchbarFest;

  return {
    boden,
    abtragFest, auftragVerdichtet,
    brauchbarFest, unbrauchbarFest,
    einbauAusAbtragFest,
    einbauAusAbtragVerdichtet: einbauAusAbtragFest * fVerd,
    ueberschussFest, fehlmengeVerdichtet, lieferungFest,
    abfuhrFest, abfuhrLose: abfuhrFest * fAuf,
    lieferungLose: lieferungFest * fAuf,
    oberbodenFest: massen.oberboden || 0,
    oberbodenLose: (massen.oberboden || 0) * fAuf,
    ausgeglichen: Math.abs(abfuhrFest) < 0.5 && Math.abs(lieferungFest) < 0.5,
  };
}

/**
 * Kostenschätzung der Erdarbeiten als Leistungsverzeichnis.
 *
 * Die Positionen folgen der Gliederung, die für Erdarbeiten üblich ist
 * (VOB/C DIN 18300): Oberboden, Lösen und Laden, Fördern, Einbauen und
 * Verdichten, Entsorgen, Liefern. Die Einheitspreise sind Anhaltswerte
 * und durch die eigene Kalkulation zu ersetzen.
 *
 * @param {Object} ausgleich - Ergebnis von massenAusgleich
 * @param {Object} preise - { transportKm, transportProKmM3, oberbodenPreis,
 *        oberbauPreis, oberbauMenge }
 */
function erdKosten(ausgleich, preise) {
  const p = Object.assign({
    transportKm: 12, transportProKmM3: 0.35,
    oberbodenPreis: 3.80, oberbauPreis: 42.00, oberbauMenge: 0,
    baustelleTransport: 1.20,
  }, preise || {});
  const b = ausgleich.boden;
  const transport = (loseM3) => loseM3 * p.transportKm * p.transportProKmM3;
  const zeilen = [];
  const pos = (kurz, menge, einheit, ep, hinweis) => {
    if (menge <= 0.0005) return;
    zeilen.push({ nr: zeilen.length + 1, kurz, menge, einheit, ep, gp: menge * ep, hinweis });
  };

  pos("Oberboden abtragen und in Mieten lagern, Dicke nach Angabe",
    ausgleich.oberbodenFest, "m³", p.oberbodenPreis, "DIN 18915, seitliche Lagerung auf der Baustelle");
  pos(`Boden lösen und laden – ${b.name}`,
    ausgleich.abtragFest, "m³", b.loesen, "Festmaß im Verband, DIN 18300");
  pos("Boden auf der Baustelle fördern und umsetzen",
    ausgleich.einbauAusAbtragFest * b.auflockerung, "m³", p.baustelleTransport, "Lockermaß");
  pos("Boden einbauen und verdichten (aus dem Abtrag)",
    ausgleich.einbauAusAbtragVerdichtet, "m³", b.einbau, "verdichtetes Maß im Profil");
  pos("Boden liefern, einbauen und verdichten (Fehlmenge)",
    ausgleich.fehlmengeVerdichtet, "m³", b.lieferung + b.einbau, "verdichtetes Maß, Lieferung frei Baustelle");
  pos(`Überschuss und ungeeigneten Boden abfahren – ${p.transportKm} km`,
    ausgleich.abfuhrLose, "m³", p.transportKm * p.transportProKmM3, "Lockermaß auf dem Fahrzeug");
  pos("Boden entsorgen (Deponie oder Verwertung)",
    ausgleich.abfuhrLose, "m³", b.deponie, "Entsorgungsklasse nach LAGA/AVV im Gutachten");
  pos("Oberbau herstellen (Frostschutz, Trag- und Deckschichten)",
    p.oberbauMenge, "m³", p.oberbauPreis, "Dicke und Bauklasse nach RStO");

  const summe = zeilen.reduce((s, z) => s + z.gp, 0);
  return { zeilen, summe, preise: p, transport };
}
