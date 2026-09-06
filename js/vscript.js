/**
 * Visuelles Skripten: ein Knotengraph, aus dem Geometrie und Bauteile
 * entstehen.
 *
 * Der Gedanke ist der eines Datenflusses. Jeder Knoten hat Eingänge und
 * Ausgänge; eine Kante führt Werte vom Ausgang des einen in den Eingang
 * des nächsten. Es wird nichts von Hand aufgerufen – die Reihenfolge
 * ergibt sich aus den Abhängigkeiten. Ändert man eine Zahl am Anfang,
 * läuft alles dahinter neu.
 *
 *   Eingabe     Zahl, Zahlenliste, Reihe, Bereich, Punkt, Text
 *   Rechnen     Grundrechenarten, Formel, Summenwerte, laufende Summe
 *   Geometrie   Punktraster, Verschieben, Drehen, Linie, Polarreihe
 *   Bauteile    Stahlstab, Betonstütze, Betonbalken, Wand
 *   Ausgabe     ins Modell übernehmen, Werte anzeigen
 *
 * WERTE SIND IMMER LISTEN
 * -----------------------
 * Eine einzelne Zahl ist eine Liste mit einem Element. Das erspart die
 * Unterscheidung zwischen „ein Wert" und „viele Werte" an jedem Knoten.
 *
 * LISTENABGLEICH
 * --------------
 * Bekommt ein Knoten an einem Eingang drei und am anderen einen Wert,
 * wird dreimal gerechnet und der einzelne Wert dabei wiederholt. Die
 * Zahl der Durchläufe ist die Länge der längsten Liste; kürzere Listen
 * werden mit ihrem letzten Wert aufgefüllt. Das ist die Regel „längste
 * Liste", wie sie im visuellen Skripten üblich ist – sie ist
 * vorhersagbar und verliert keine Werte.
 *
 * Knoten, die eine ganze Liste brauchen (Summe, laufende Summe,
 * Punktraster), haben Eingänge mit `sammel: true`. Diese Eingänge werden
 * nicht durchlaufen, sondern bekommen die Liste am Stück.
 *
 * REIHENFOLGE UND KREISE
 * ----------------------
 * Die Knoten werden topologisch sortiert. Hängt ein Knoten mittelbar von
 * sich selbst ab, entsteht kein Ergebnis – das wird gemeldet und nicht
 * stillschweigend abgebrochen.
 *
 * FORMELN OHNE eval
 * -----------------
 * Der Formelknoten hat einen eigenen Parser (rekursiver Abstieg) für
 * + − · / ^, Klammern, die Funktionen sin, cos, tan, asin, acos, atan,
 * sqrt, abs, min, max, round, floor, ceil, log, exp sowie die Konstanten
 * pi und e. Der Text des Anwenders wird niemals als Programm ausgeführt.
 * Winkel stehen in Grad – im Bauwesen ist das die geläufige Einheit.
 *
 * NICHT ENTHALTEN: Datenbäume mit Verzweigungen (hier gibt es flache
 * Listen), Rückkopplungen und Schleifen über den Graphen, benutzereigene
 * Knoten, Flächen- und Volumenkörperverschneidung, Skripte in einer
 * Programmiersprache. Was der Graph erzeugt, sind Bauteile der
 * Anwendung; deren Nachweise und Mengen führen die jeweiligen Register.
 */

/** Farben der Knotengruppen. */
const VS_GRUPPEN = {
  eingabe: { name: "Eingabe", farbe: "#1f6b8f", hell: "#e3eef4" },
  rechnen: { name: "Rechnen", farbe: "#4f7d4f", hell: "#e6efe4" },
  geometrie: { name: "Geometrie", farbe: "#8a6d3b", hell: "#f2ebdd" },
  bauteil: { name: "Bauteile", farbe: "#b3392c", hell: "#f5e3e0" },
  ausgabe: { name: "Ausgabe", farbe: "#4a4a6a", hell: "#e6e6ee" },
};

/** Zahl mit Dezimalkomma. */
function vsZahl(wert, stellen) {
  if (!Number.isFinite(wert)) return "–";
  return Number(wert).toFixed(stellen === undefined ? 2 : stellen).replace(".", ",");
}

/** Wert lesbar machen – für die Vorschau am Knoten. */
function vsWertText(w) {
  if (w === null || w === undefined) return "–";
  if (typeof w === "number") return vsZahl(w, Math.abs(w) >= 100 ? 1 : 3);
  if (typeof w === "string") return w;
  if (w && w.art) return w.bezeichnung || w.art;
  if (w && typeof w.x === "number") {
    return `${vsZahl(w.x)} / ${vsZahl(w.y)} / ${vsZahl(w.z)}`;
  }
  return String(w);
}

/* ------------------------------------------------------- Formelrechner */

/**
 * Formeln ohne eval: Zerlegen in Zeichen, dann rekursiver Abstieg.
 *
 * Grammatik
 *   Ausdruck  := Term { (+|−) Term }
 *   Term      := Vorzeichen { (·|/) Vorzeichen }
 *   Vorzeichen:= (+|−) Vorzeichen | Potenz
 *   Potenz    := Faktor [ ^ Vorzeichen ]        (rechtsassoziativ)
 *   Faktor    := Zahl | Name | Name( Liste ) | ( Ausdruck )
 *
 * Das Vorzeichen steht über der Potenz, nicht darunter: −2^2 ist −4 und
 * nicht 4, wie es in der Mathematik üblich ist. 2^−3 geht trotzdem,
 * weil nach dem Hochzeichen wieder ein Vorzeichen stehen darf.
 *
 * TRENNZEICHEN
 * Das Komma ist Dezimaltrennzeichen, wie überall in diesem Programm:
 * 1,5 ist eineinhalb. Argumente einer Funktion werden mit Semikolon
 * getrennt – so wie in der deutschen Tabellenkalkulation: max(3; 7).
 * Ein Komma, hinter dem keine Ziffer steht, wird ebenfalls als Trenner
 * gelesen, damit „max(3, 7)" nicht scheitert.
 */
const VS_FUNKTIONEN = {
  sin: (x) => Math.sin((x * Math.PI) / 180),
  cos: (x) => Math.cos((x * Math.PI) / 180),
  tan: (x) => Math.tan((x * Math.PI) / 180),
  asin: (x) => (Math.asin(x) * 180) / Math.PI,
  acos: (x) => (Math.acos(x) * 180) / Math.PI,
  atan: (x) => (Math.atan(x) * 180) / Math.PI,
  sqrt: Math.sqrt, abs: Math.abs, round: Math.round,
  floor: Math.floor, ceil: Math.ceil, log: Math.log, exp: Math.exp,
  min: Math.min, max: Math.max,
};
const VS_KONSTANTEN = { pi: Math.PI, e: Math.E };

function vsZerlege(text) {
  const zeichen = [];
  // Nur die Schreibvarianten der Rechenzeichen vereinheitlichen – das
  // Komma bleibt stehen, weil es Dezimaltrennzeichen sein kann
  const s = String(text || "").replace(/·/g, "*").replace(/×/g, "*")
    .replace(/−/g, "-").replace(/÷/g, "/").replace(/:/g, "/");
  const istZiffer = (c) => c >= "0" && c <= "9";
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i += 1; continue; }
    if (istZiffer(c) || (c === "." && istZiffer(s[i + 1]))) {
      let j = i, zahl = "";
      while (j < s.length) {
        if (istZiffer(s[j])) { zahl += s[j]; j += 1; continue; }
        // Trennzeichen nur dann als Komma lesen, wenn eine Ziffer folgt
        if ((s[j] === "." || s[j] === ",") && istZiffer(s[j + 1])
          && zahl.indexOf(".") < 0) { zahl += "."; j += 1; continue; }
        break;
      }
      const wert = parseFloat(zahl);
      if (!Number.isFinite(wert)) throw new Error(`„${zahl}" ist keine Zahl`);
      zeichen.push({ art: "zahl", wert });
      i = j; continue;
    }
    if (/[A-Za-zÄÖÜäöüß_]/.test(c)) {
      let j = i;
      while (j < s.length && /[A-Za-zÄÖÜäöüß_0-9]/.test(s[j])) j += 1;
      zeichen.push({ art: "name", wert: s.slice(i, j).toLowerCase() });
      i = j; continue;
    }
    if (c === ";" || c === ",") { zeichen.push({ art: "," }); i += 1; continue; }
    if ("+-*/^()".indexOf(c) >= 0) { zeichen.push({ art: c }); i += 1; continue; }
    throw new Error(`Zeichen „${c}" gehört nicht in eine Formel`);
  }
  return zeichen;
}

function vsFormel(text, variablen) {
  const zeichen = vsZerlege(text);
  let p = 0;
  const schau = () => zeichen[p];
  const nimm = (art) => {
    if (!zeichen[p] || zeichen[p].art !== art) {
      throw new Error(`„${art}" fehlt in der Formel`);
    }
    return zeichen[p++];
  };

  function ausdruck() {
    let wert = term();
    while (schau() && (schau().art === "+" || schau().art === "-")) {
      const op = zeichen[p++].art;
      const rechts = term();
      wert = op === "+" ? wert + rechts : wert - rechts;
    }
    return wert;
  }
  function term() {
    let wert = vorzeichen();
    while (schau() && (schau().art === "*" || schau().art === "/")) {
      const op = zeichen[p++].art;
      const rechts = vorzeichen();
      if (op === "/" && rechts === 0) throw new Error("Teilung durch null");
      wert = op === "*" ? wert * rechts : wert / rechts;
    }
    return wert;
  }
  // Das Vorzeichen bindet schwächer als das Hochzeichen: −2^2 = −4
  function vorzeichen() {
    if (schau() && schau().art === "-") { p += 1; return -vorzeichen(); }
    if (schau() && schau().art === "+") { p += 1; return vorzeichen(); }
    return potenz();
  }
  function potenz() {
    const wert = faktor();
    if (schau() && schau().art === "^") { p += 1; return Math.pow(wert, vorzeichen()); }
    return wert;
  }
  function faktor() {
    if (!schau()) throw new Error("Die Formel endet zu früh");
    if (schau().art === "zahl") return zeichen[p++].wert;
    if (schau().art === "(") { p += 1; const w = ausdruck(); nimm(")"); return w; }
    if (schau().art === "name") {
      const name = zeichen[p++].wert;
      if (schau() && schau().art === "(") {
        p += 1;
        const werte = [ausdruck()];
        while (schau() && schau().art === ",") { p += 1; werte.push(ausdruck()); }
        nimm(")");
        const f = VS_FUNKTIONEN[name];
        if (!f) throw new Error(`Die Funktion „${name}" gibt es nicht`);
        return f.apply(null, werte);
      }
      if (Object.prototype.hasOwnProperty.call(variablen, name)) return variablen[name];
      if (Object.prototype.hasOwnProperty.call(VS_KONSTANTEN, name)) return VS_KONSTANTEN[name];
      throw new Error(`„${name}" ist keine bekannte Größe`);
    }
    throw new Error("Die Formel ist an dieser Stelle nicht zu lesen");
  }

  const ergebnis = ausdruck();
  if (p < zeichen.length) throw new Error("Nach der Formel steht noch etwas");
  if (!Number.isFinite(ergebnis)) throw new Error("Die Formel ergibt keine Zahl");
  return ergebnis;
}

/* --------------------------------------------------------- Hilfsmittel */

/** Zahlenliste aus Text: „1,35 1,35" oder kurz „6× 1,35". */
function vsListeAusText(text) {
  const werte = [];
  const muster = /(\d+(?:[.,]\d+)?)\s*[×xX*]\s*(-?\d+(?:[.,]\d+)?)|(-?\d+(?:[.,]\d+)?)/g;
  let t;
  while ((t = muster.exec(String(text || ""))) !== null) {
    if (t[1] !== undefined) {
      const n = Math.min(500, Math.round(parseFloat(t[1].replace(",", "."))));
      const w = parseFloat(t[2].replace(",", "."));
      if (Number.isFinite(w)) for (let i = 0; i < n; i++) werte.push(w);
    } else {
      const w = parseFloat(t[3].replace(",", "."));
      if (Number.isFinite(w)) werte.push(w);
    }
  }
  return werte;
}

const vsPunkt = (x, y, z) => ({ x: x || 0, y: y || 0, z: z || 0 });
const vsIstPunkt = (w) => w && typeof w === "object" && typeof w.x === "number";

/* ----------------------------------------------------- Knotenkatalog */

/**
 * Katalog der Knoten.
 *
 * `eingaenge`  Anschlüsse, über die Werte hereinkommen. `sammel: true`
 *              bedeutet: der Knoten will die ganze Liste, nicht einen
 *              Wert nach dem anderen. Ein Eingang ohne Verbindung lässt
 *              sich am Knoten selbst beschreiben (in den Werten unter
 *              `in_<Eingang>`); erst wenn eine Kante ankommt, gilt sie.
 * `felder`     Werte, die am Knoten selbst eingetragen werden.
 * `ausgaenge`  Anschlüsse, über die Werte hinausgehen.
 * `rechne`     bekommt ein Objekt der Eingangswerte und der Felder und
 *              gibt ein Objekt der Ausgangswerte zurück. Bei
 *              Sammelknoten (`sammelnd: true`) wird es einmal mit den
 *              vollen Listen gerufen, sonst je Durchlauf.
 *
 * Der Grundriss der Anwendung liegt in x und z, die Höhe in y – der
 * Punktknoten ist entsprechend beschriftet.
 */
const VS_KNOTEN = {
  /* ------------------------------------------------------- Eingabe */
  zahl: {
    name: "Zahl", gruppe: "eingabe",
    beschreibung: "Eine Zahl mit Schieberegler. Der Regler ist der Griff, "
      + "an dem sich der ganze Entwurf ändern lässt.",
    eingaenge: [],
    felder: [
      { id: "wert", name: "Wert", art: "zahl", standard: 5, regler: true },
      { id: "min", name: "kleinster", art: "zahl", standard: 0 },
      { id: "max", name: "größter", art: "zahl", standard: 20 },
    ],
    ausgaenge: [{ id: "wert", name: "Zahl", art: "zahl" }],
    rechne: (e, f) => ({ wert: f.wert }),
  },
  zahlenliste: {
    name: "Zahlenliste", gruppe: "eingabe",
    beschreibung: "Zahlen als Text, durch Leerzeichen getrennt. „6× 1,35“ "
      + "wiederholt einen Wert sechsmal.",
    eingaenge: [],
    felder: [{ id: "text", name: "Werte", art: "text", standard: "6× 1,35" }],
    ausgaenge: [{ id: "liste", name: "Liste", art: "zahl" }],
    sammelnd: true,
    rechne: (e, f) => ({ liste: vsListeAusText(f.text) }),
  },
  reihe: {
    name: "Reihe", gruppe: "eingabe",
    beschreibung: "Zahlenreihe aus Anfangswert, Schrittweite und Anzahl.",
    eingaenge: [
      { id: "start", name: "Start", art: "zahl", standard: 0 },
      { id: "schritt", name: "Schritt", art: "zahl", standard: 1 },
      { id: "anzahl", name: "Anzahl", art: "zahl", standard: 5 },
    ],
    felder: [],
    ausgaenge: [{ id: "liste", name: "Liste", art: "zahl" }],
    sammelnd: true,
    rechne: (e) => {
      const start = vsErst(e.start, 0), schritt = vsErst(e.schritt, 1);
      const n = Math.max(0, Math.min(2000, Math.round(vsErst(e.anzahl, 0))));
      const liste = [];
      for (let i = 0; i < n; i++) liste.push(start + i * schritt);
      return { liste };
    },
  },
  bereich: {
    name: "Bereich", gruppe: "eingabe",
    beschreibung: "Gleichmäßige Teilung zwischen zwei Werten. Bei n "
      + "Teilungen entstehen n+1 Werte – so viele wie Achsen bei n Feldern.",
    eingaenge: [
      { id: "von", name: "von", art: "zahl", standard: 0 },
      { id: "bis", name: "bis", art: "zahl", standard: 10 },
      { id: "teile", name: "Teilungen", art: "zahl", standard: 5 },
    ],
    felder: [],
    ausgaenge: [{ id: "liste", name: "Liste", art: "zahl" }],
    sammelnd: true,
    rechne: (e) => {
      const von = vsErst(e.von, 0), bis = vsErst(e.bis, 0);
      const n = Math.max(1, Math.min(2000, Math.round(vsErst(e.teile, 1))));
      const liste = [];
      for (let i = 0; i <= n; i++) liste.push(von + ((bis - von) * i) / n);
      return { liste };
    },
  },
  punkt: {
    name: "Punkt", gruppe: "eingabe",
    beschreibung: "Punkt aus Grundrisskoordinaten und Höhe.",
    eingaenge: [
      { id: "x", name: "x", art: "zahl", standard: 0 },
      { id: "z", name: "z", art: "zahl", standard: 0 },
      { id: "h", name: "Höhe", art: "zahl", standard: 0 },
    ],
    felder: [],
    ausgaenge: [{ id: "punkt", name: "Punkt", art: "punkt" }],
    rechne: (e) => ({ punkt: vsPunkt(e.x, e.h, e.z) }),
  },

  /* ------------------------------------------------------- Rechnen */
  rechnen: {
    name: "Rechnen", gruppe: "rechnen",
    beschreibung: "Grundrechenart auf zwei Eingängen.",
    eingaenge: [
      { id: "a", name: "a", art: "zahl", standard: 0 },
      { id: "b", name: "b", art: "zahl", standard: 0 },
    ],
    felder: [{ id: "op", name: "Rechenart", art: "wahl", standard: "+",
      werte: [["+", "a + b"], ["-", "a − b"], ["*", "a · b"], ["/", "a / b"],
        ["min", "kleinerer"], ["max", "größerer"]] }],
    ausgaenge: [{ id: "wert", name: "Ergebnis", art: "zahl" }],
    rechne: (e, f) => {
      const a = e.a || 0, b = e.b || 0;
      const w = { "+": a + b, "-": a - b, "*": a * b,
        "/": b === 0 ? NaN : a / b, min: Math.min(a, b), max: Math.max(a, b) }[f.op];
      return { wert: w };
    },
  },
  formel: {
    name: "Formel", gruppe: "rechnen",
    beschreibung: "Formel mit den Größen a, b und c. Erlaubt sind + − · / ^, "
      + "Klammern, sin, cos, tan, sqrt, abs, min, max, round, floor, ceil, "
      + "log, exp sowie pi und e. Winkel in Grad, Komma als Dezimaltrennzeichen, "
      + "Argumente mit Semikolon: max(a; b).",
    eingaenge: [
      { id: "a", name: "a", art: "zahl", standard: 0 },
      { id: "b", name: "b", art: "zahl", standard: 0 },
      { id: "c", name: "c", art: "zahl", standard: 0 },
    ],
    felder: [{ id: "text", name: "Formel", art: "text", standard: "a * b" }],
    ausgaenge: [{ id: "wert", name: "Ergebnis", art: "zahl" }],
    rechne: (e, f) => ({ wert: vsFormel(f.text, { a: e.a || 0, b: e.b || 0, c: e.c || 0 }) }),
  },
  kennwert: {
    name: "Kennwert", gruppe: "rechnen",
    beschreibung: "Ein Wert aus einer ganzen Liste: Summe, Mittel, größter, "
      + "kleinster oder die Anzahl.",
    eingaenge: [{ id: "liste", name: "Liste", art: "zahl", standard: 0, sammel: true }],
    felder: [{ id: "art", name: "Kennwert", art: "wahl", standard: "summe",
      werte: [["summe", "Summe"], ["mittel", "Mittelwert"], ["max", "größter"],
        ["min", "kleinster"], ["anzahl", "Anzahl"]] }],
    ausgaenge: [{ id: "wert", name: "Wert", art: "zahl" }],
    sammelnd: true,
    rechne: (e, f) => {
      const l = (e.liste || []).filter((x) => Number.isFinite(x));
      if (!l.length) return { wert: f.art === "anzahl" ? 0 : NaN };
      const w = {
        summe: l.reduce((s, x) => s + x, 0),
        mittel: l.reduce((s, x) => s + x, 0) / l.length,
        max: Math.max.apply(null, l), min: Math.min.apply(null, l),
        anzahl: l.length,
      }[f.art];
      return { wert: w };
    },
  },
  laufend: {
    name: "Laufende Summe", gruppe: "rechnen",
    beschreibung: "Aus Feldbreiten werden Achsabstände: jeder Wert ist die "
      + "Summe aller vorherigen. Mit Anfangswert beginnt die Reihe dort.",
    eingaenge: [
      { id: "liste", name: "Liste", art: "zahl", standard: 0, sammel: true },
      { id: "start", name: "Start", art: "zahl", standard: 0 },
    ],
    felder: [{ id: "voran", name: "Startwert", art: "wahl", standard: "ja",
      werte: [["ja", "mit Startwert (n+1 Werte)"], ["nein", "ohne (n Werte)"]] }],
    ausgaenge: [{ id: "liste", name: "Liste", art: "zahl" }],
    sammelnd: true,
    rechne: (e, f) => {
      const start = vsErst(e.start, 0);
      const liste = f.voran === "ja" ? [start] : [];
      let s = start;
      (e.liste || []).forEach((w) => { s += Number(w) || 0; liste.push(s); });
      return { liste };
    },
  },

  teilliste: {
    name: "Teilliste", gruppe: "rechnen",
    beschreibung: "Ein Stück aus einer Liste. Damit lassen sich zwei Listen "
      + "gegeneinander versetzen – so entstehen etwa die Diagonalen eines "
      + "Fachwerks aus den Gurtpunkten.",
    eingaenge: [
      { id: "liste", name: "Liste", art: "beliebig", standard: null, sammel: true },
      { id: "ab", name: "ab Stelle", art: "zahl", standard: 0 },
      { id: "anzahl", name: "Anzahl", art: "zahl", standard: 0 },
    ],
    felder: [],
    ausgaenge: [{ id: "liste", name: "Liste", art: "beliebig" }],
    sammelnd: true,
    rechne: (e) => {
      const l = e.liste || [];
      const ab = Math.max(0, Math.round(vsErst(e.ab, 0)));
      const n = Math.round(vsErst(e.anzahl, 0));
      // Anzahl 0 oder kleiner heißt: bis zum Ende
      return { liste: n > 0 ? l.slice(ab, ab + n) : l.slice(ab) };
    },
  },
  punktZerlegen: {
    name: "Punkt zerlegen", gruppe: "geometrie",
    beschreibung: "Die Koordinaten eines Punktes einzeln – um damit "
      + "weiterzurechnen.",
    eingaenge: [{ id: "punkt", name: "Punkt", art: "punkt", standard: null }],
    felder: [],
    ausgaenge: [
      { id: "x", name: "x", art: "zahl" },
      { id: "z", name: "z", art: "zahl" },
      { id: "h", name: "Höhe", art: "zahl" },
    ],
    rechne: (e) => {
      const p = vsIstPunkt(e.punkt) ? e.punkt : vsPunkt(0, 0, 0);
      return { x: p.x, z: p.z, h: p.y };
    },
  },

  /* ----------------------------------------------------- Geometrie */
  punktRaster: {
    name: "Punktraster", gruppe: "geometrie",
    beschreibung: "Aus einer x-Liste und einer z-Liste entsteht das volle "
      + "Raster: jeder x-Wert mit jedem z-Wert. Das ist der übliche Weg "
      + "vom Achsraster zu den Stützenpunkten.",
    eingaenge: [
      { id: "x", name: "x-Werte", art: "zahl", standard: 0, sammel: true },
      { id: "z", name: "z-Werte", art: "zahl", standard: 0, sammel: true },
      { id: "h", name: "Höhe", art: "zahl", standard: 0 },
    ],
    felder: [],
    ausgaenge: [{ id: "punkte", name: "Punkte", art: "punkt" }],
    sammelnd: true,
    rechne: (e) => {
      const xs = (e.x || []).map(Number), zs = (e.z || []).map(Number);
      const h = vsErst(e.h, 0);
      const punkte = [];
      xs.forEach((x) => zs.forEach((z) => punkte.push(vsPunkt(x, h, z))));
      return { punkte };
    },
  },
  verschieben: {
    name: "Verschieben", gruppe: "geometrie",
    beschreibung: "Punkte um einen Vektor verschieben.",
    eingaenge: [
      { id: "punkt", name: "Punkt", art: "punkt", standard: null },
      { id: "dx", name: "dx", art: "zahl", standard: 0 },
      { id: "dz", name: "dz", art: "zahl", standard: 0 },
      { id: "dh", name: "dHöhe", art: "zahl", standard: 0 },
    ],
    felder: [],
    ausgaenge: [{ id: "punkt", name: "Punkt", art: "punkt" }],
    rechne: (e) => {
      const p = vsIstPunkt(e.punkt) ? e.punkt : vsPunkt(0, 0, 0);
      return { punkt: vsPunkt(p.x + (e.dx || 0), p.y + (e.dh || 0), p.z + (e.dz || 0)) };
    },
  },
  drehen: {
    name: "Drehen", gruppe: "geometrie",
    beschreibung: "Punkte im Grundriss um einen Mittelpunkt drehen. "
      + "Der Winkel wird in Grad angegeben, gezählt im Gegenuhrzeigersinn.",
    eingaenge: [
      { id: "punkt", name: "Punkt", art: "punkt", standard: null },
      { id: "winkel", name: "Winkel [°]", art: "zahl", standard: 0 },
      { id: "mx", name: "Mitte x", art: "zahl", standard: 0 },
      { id: "mz", name: "Mitte z", art: "zahl", standard: 0 },
    ],
    felder: [],
    ausgaenge: [{ id: "punkt", name: "Punkt", art: "punkt" }],
    rechne: (e) => {
      const p = vsIstPunkt(e.punkt) ? e.punkt : vsPunkt(0, 0, 0);
      const w = ((e.winkel || 0) * Math.PI) / 180;
      const dx = p.x - (e.mx || 0), dz = p.z - (e.mz || 0);
      return { punkt: vsPunkt(
        (e.mx || 0) + dx * Math.cos(w) - dz * Math.sin(w),
        p.y,
        (e.mz || 0) + dx * Math.sin(w) + dz * Math.cos(w)) };
    },
  },
  polarreihe: {
    name: "Polarreihe", gruppe: "geometrie",
    beschreibung: "Einen Punkt gleichmäßig um eine Mitte vervielfachen – "
      + "für runde Grundrisse und Kreisstützenstellungen.",
    eingaenge: [
      { id: "punkt", name: "Punkt", art: "punkt", standard: null },
      { id: "anzahl", name: "Anzahl", art: "zahl", standard: 8 },
      { id: "winkel", name: "Gesamtwinkel [°]", art: "zahl", standard: 360 },
      { id: "mx", name: "Mitte x", art: "zahl", standard: 0 },
      { id: "mz", name: "Mitte z", art: "zahl", standard: 0 },
    ],
    felder: [],
    ausgaenge: [{ id: "punkte", name: "Punkte", art: "punkt" }],
    sammelnd: true,
    rechne: (e) => {
      const p = vsIstPunkt(vsErst(e.punkt)) ? vsErst(e.punkt) : vsPunkt(5, 0, 0);
      const n = Math.max(1, Math.min(500, Math.round(vsErst(e.anzahl, 8))));
      const gesamt = vsErst(e.winkel, 360);
      const mx = vsErst(e.mx, 0), mz = vsErst(e.mz, 0);
      // Bei einem vollen Kreis fällt der letzte Punkt auf den ersten
      const voll = Math.abs(Math.abs(gesamt) - 360) < 1e-9;
      const teiler = voll ? n : Math.max(1, n - 1);
      const punkte = [];
      for (let i = 0; i < n; i++) {
        const w = ((gesamt * i) / teiler * Math.PI) / 180;
        const dx = p.x - mx, dz = p.z - mz;
        punkte.push(vsPunkt(mx + dx * Math.cos(w) - dz * Math.sin(w), p.y,
          mz + dx * Math.sin(w) + dz * Math.cos(w)));
      }
      return { punkte };
    },
  },
  linie: {
    name: "Linie", gruppe: "geometrie",
    beschreibung: "Verbindung zweier Punkte. Länge und Richtung kommen mit "
      + "heraus – die Richtung ist der Winkel im Grundriss.",
    eingaenge: [
      { id: "a", name: "von", art: "punkt", standard: null },
      { id: "b", name: "nach", art: "punkt", standard: null },
    ],
    felder: [],
    ausgaenge: [
      { id: "linie", name: "Linie", art: "linie" },
      { id: "laenge", name: "Länge", art: "zahl" },
      { id: "richtung", name: "Richtung [°]", art: "zahl" },
    ],
    rechne: (e) => {
      const a = vsIstPunkt(e.a) ? e.a : vsPunkt(0, 0, 0);
      const b = vsIstPunkt(e.b) ? e.b : vsPunkt(0, 0, 0);
      const laenge = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      const richtung = (Math.atan2(b.z - a.z, b.x - a.x) * 180) / Math.PI;
      return { linie: { art: "linie", a, b, laenge }, laenge, richtung };
    },
  },
  kette: {
    name: "Kette", gruppe: "geometrie",
    beschreibung: "Verbindet eine Punktfolge zu einem Zug: aus n Punkten "
      + "werden n−1 Linien. Geschlossen ergibt sich ein Umgang.",
    eingaenge: [{ id: "punkte", name: "Punkte", art: "punkt", standard: null, sammel: true }],
    felder: [{ id: "schliessen", name: "Form", art: "wahl", standard: "offen",
      werte: [["offen", "offener Zug"], ["zu", "geschlossener Umgang"]] }],
    ausgaenge: [
      { id: "linien", name: "Linien", art: "linie" },
      { id: "a", name: "Anfangspunkte", art: "punkt" },
      { id: "b", name: "Endpunkte", art: "punkt" },
    ],
    sammelnd: true,
    rechne: (e, f) => {
      const p = (e.punkte || []).filter(vsIstPunkt);
      const linien = [], a = [], b = [];
      const n = p.length;
      const bis = f.schliessen === "zu" ? n : n - 1;
      for (let i = 0; i < bis; i++) {
        const q = p[i], r = p[(i + 1) % n];
        linien.push({ art: "linie", a: q, b: r,
          laenge: Math.hypot(r.x - q.x, r.y - q.y, r.z - q.z) });
        a.push(q); b.push(r);
      }
      return { linien, a, b };
    },
  },

  /* ------------------------------------------------------ Bauteile */
  stab: {
    name: "Stahlstab", gruppe: "bauteil",
    beschreibung: "Stab des Fachwerks oder Rahmens zwischen zwei Punkten. "
      + "Profil und Güte gelten für alle erzeugten Stäbe.",
    eingaenge: [
      { id: "a", name: "von", art: "punkt", standard: null },
      { id: "b", name: "nach", art: "punkt", standard: null },
    ],
    felder: [
      { id: "familie", name: "Reihe", art: "profilfamilie", standard: "IPE" },
      { id: "profil", name: "Profil", art: "profil", standard: "IPE 200" },
      { id: "guete", name: "Güte", art: "wahl", standard: "S235",
        werte: [["S235", "S235"], ["S275", "S275"], ["S355", "S355"]] },
      { id: "typ", name: "Beanspruchung", art: "wahl", standard: "beam",
        werte: [["beam", "Biegestab"], ["tie", "Zugstab"], ["strut", "Druckstab"]] },
    ],
    ausgaenge: [{ id: "bauteil", name: "Bauteil", art: "bauteil" }],
    rechne: (e, f) => {
      const a = vsIstPunkt(e.a) ? e.a : vsPunkt(0, 0, 0);
      const b = vsIstPunkt(e.b) ? e.b : vsPunkt(0, 0, 0);
      return { bauteil: { art: "stab", a, b, familie: f.familie, profil: f.profil,
        guete: f.guete, typ: f.typ,
        laenge: Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) } };
    },
  },
  stuetze: {
    name: "Betonstütze", gruppe: "bauteil",
    beschreibung: "Stahlbetonstütze am Punkt, rechteckig.",
    eingaenge: [
      { id: "punkt", name: "Punkt", art: "punkt", standard: null },
      { id: "hoehe", name: "Höhe [m]", art: "zahl", standard: 3.0 },
    ],
    felder: [
      { id: "laenge", name: "Länge [m]", art: "zahl", standard: 0.30 },
      { id: "breite", name: "Breite [m]", art: "zahl", standard: 0.30 },
      { id: "guete", name: "Güte", art: "wahl", standard: "C25/30",
        werte: [["C20/25", "C20/25"], ["C25/30", "C25/30"], ["C30/37", "C30/37"],
          ["C35/45", "C35/45"], ["C45/55", "C45/55"]] },
    ],
    ausgaenge: [{ id: "bauteil", name: "Bauteil", art: "bauteil" }],
    rechne: (e, f) => ({ bauteil: { art: "stuetze",
      p1: vsIstPunkt(e.punkt) ? e.punkt : vsPunkt(0, 0, 0),
      masse: { laenge: f.laenge, breite: f.breite, hoehe: e.hoehe || 3 },
      guete: f.guete } }),
  },
  balken: {
    name: "Betonbalken", gruppe: "bauteil",
    beschreibung: "Unterzug zwischen zwei Punkten.",
    eingaenge: [
      { id: "a", name: "von", art: "punkt", standard: null },
      { id: "b", name: "nach", art: "punkt", standard: null },
    ],
    felder: [
      { id: "breite", name: "Breite [m]", art: "zahl", standard: 0.30 },
      { id: "hoehe", name: "Höhe [m]", art: "zahl", standard: 0.50 },
      { id: "guete", name: "Güte", art: "wahl", standard: "C25/30",
        werte: [["C20/25", "C20/25"], ["C25/30", "C25/30"], ["C30/37", "C30/37"],
          ["C35/45", "C35/45"]] },
    ],
    ausgaenge: [{ id: "bauteil", name: "Bauteil", art: "bauteil" }],
    rechne: (e, f) => ({ bauteil: { art: "balken",
      p1: vsIstPunkt(e.a) ? e.a : vsPunkt(0, 0, 0),
      p2: vsIstPunkt(e.b) ? e.b : vsPunkt(0, 0, 0),
      masse: { breite: f.breite, hoehe: f.hoehe }, guete: f.guete } }),
  },
  wand: {
    name: "Wand", gruppe: "bauteil",
    beschreibung: "Wand zwischen zwei Punkten mit dem Regelaufbau ihrer Art. "
      + "Der Schichtaufbau lässt sich danach im Register Ausbau ändern.",
    eingaenge: [
      { id: "a", name: "von", art: "punkt", standard: null },
      { id: "b", name: "nach", art: "punkt", standard: null },
      { id: "hoehe", name: "Höhe [m]", art: "zahl", standard: 2.75 },
    ],
    felder: [{ id: "kind", name: "Art", art: "wahl", standard: "wand_aussen",
      werte: [["wand_aussen", "Außenwand"], ["wand_innen", "Innenwand"]] }],
    ausgaenge: [{ id: "bauteil", name: "Bauteil", art: "bauteil" }],
    rechne: (e, f) => ({ bauteil: { art: "wand", kind: f.kind,
      p1: vsIstPunkt(e.a) ? e.a : vsPunkt(0, 0, 0),
      p2: vsIstPunkt(e.b) ? e.b : vsPunkt(0, 0, 0),
      hoehe: e.hoehe || 2.75 } }),
  },

  /* ------------------------------------------------------- Ausgabe */
  modell: {
    name: "Ins Modell", gruppe: "ausgabe",
    beschreibung: "Sammelt die Bauteile. Erst der Knopf „Ins Modell "
      + "übernehmen“ legt sie wirklich an – bis dahin ist der Graph "
      + "eine Vorschau und ändert nichts.",
    eingaenge: [{ id: "bauteile", name: "Bauteile", art: "bauteil",
      standard: null, sammel: true }],
    felder: [],
    ausgaenge: [],
    sammelnd: true, ausgabe: true,
    rechne: (e) => ({ _bauteile: (e.bauteile || []).filter((b) => b && b.art) }),
  },
  anzeigen: {
    name: "Werte anzeigen", gruppe: "ausgabe",
    beschreibung: "Zeigt die Werte, die ankommen – zum Nachsehen, was der "
      + "Graph an dieser Stelle wirklich rechnet.",
    eingaenge: [{ id: "wert", name: "Wert", art: "beliebig",
      standard: null, sammel: true }],
    felder: [{ id: "titel", name: "Titel", art: "text", standard: "Werte" }],
    ausgaenge: [],
    sammelnd: true, ausgabe: true,
    rechne: (e) => ({ _anzeige: e.wert || [] }),
  },
};

/** Erster Wert einer Liste, sonst der Wert selbst. */
function vsErst(w, ersatz) {
  const v = Array.isArray(w) ? w[0] : w;
  return v === undefined || v === null ? ersatz : v;
}

/* --------------------------------------------------------- Auswertung */

/** Als Liste lesen: ein einzelner Wert wird zur Liste mit einem Element. */
function vsAlsListe(w) {
  if (w === undefined || w === null) return [];
  return Array.isArray(w) ? w : [w];
}

/**
 * Den Graphen auswerten.
 *
 * Ablauf
 *   1. Kanten nach Zielknoten ordnen
 *   2. topologisch sortieren; bleiben Knoten übrig, gibt es einen Kreis
 *   3. je Knoten die Eingangslisten sammeln
 *   4. Listenabgleich: die längste Liste bestimmt die Zahl der Durchläufe,
 *      kürzere werden mit ihrem letzten Wert aufgefüllt
 *   5. rechnen; Fehler bleiben am Knoten stehen und brechen nicht ab
 *
 * @param {Object} graph - { knoten: [{id, typ, werte}], kanten: [...] }
 * @returns {Object} Ergebnisse je Knoten, Bauteile, Meldungen
 */
function vsAuswerten(graph) {
  const knoten = new Map();
  (graph.knoten || []).forEach((k) => knoten.set(k.id, k));
  const kanten = (graph.kanten || []).filter((k) =>
    knoten.has(k.vonKnoten) && knoten.has(k.nachKnoten));

  // Eingangskanten je Knoten und Eingang
  const zufluss = new Map();
  kanten.forEach((k) => {
    if (!zufluss.has(k.nachKnoten)) zufluss.set(k.nachKnoten, new Map());
    const je = zufluss.get(k.nachKnoten);
    if (!je.has(k.nachEingang)) je.set(k.nachEingang, []);
    je.get(k.nachEingang).push(k);
  });

  // Topologische Sortierung
  const grad = new Map(), nach = new Map();
  knoten.forEach((k, id) => { grad.set(id, 0); nach.set(id, []); });
  kanten.forEach((k) => {
    grad.set(k.nachKnoten, grad.get(k.nachKnoten) + 1);
    nach.get(k.vonKnoten).push(k.nachKnoten);
  });
  const bereit = [];
  grad.forEach((g, id) => { if (g === 0) bereit.push(id); });
  const reihenfolge = [];
  while (bereit.length) {
    const id = bereit.shift();
    reihenfolge.push(id);
    nach.get(id).forEach((z) => {
      grad.set(z, grad.get(z) - 1);
      if (grad.get(z) === 0) bereit.push(z);
    });
  }
  const kreis = reihenfolge.length !== knoten.size;
  const meldungen = [];
  if (kreis) {
    const drin = new Set(reihenfolge);
    const betroffen = Array.from(knoten.keys()).filter((id) => !drin.has(id));
    meldungen.push({ art: "fehler", knoten: betroffen[0] || null,
      text: "Die Verbindungen enthalten einen Kreis: ein Knoten hängt mittelbar "
        + "von sich selbst ab. Rückkopplungen sind im Datenfluss nicht vorgesehen – "
        + `betroffen sind ${betroffen.length} Knoten.` });
  }

  const ergebnisse = new Map();       // knotenId -> { ausgangId: Liste }
  const fehler = new Map();           // knotenId -> Text
  const bauteile = [];
  const anzeigen = [];

  reihenfolge.forEach((id) => {
    const k = knoten.get(id);
    const def = VS_KNOTEN[k.typ];
    if (!def) {
      fehler.set(id, `Unbekannter Knoten „${k.typ}“`);
      return;
    }
    const werte = Object.assign({}, k.werte || {});
    def.felder.forEach((f) => {
      if (werte[f.id] === undefined) werte[f.id] = f.standard;
      if (f.art === "zahl") {
        const z = parseFloat(String(werte[f.id]).replace(",", "."));
        werte[f.id] = Number.isFinite(z) ? z : f.standard;
      }
    });

    // Eingangslisten sammeln: mehrere Kanten auf einen Eingang werden
    // aneinandergehängt – so lassen sich Bauteile aus mehreren Quellen
    // in einer Ausgabe zusammenführen
    const je = zufluss.get(id) || new Map();
    const eingangsListen = {};
    let unvollstaendig = null;
    def.eingaenge.forEach((ein) => {
      const quellen = je.get(ein.id) || [];
      if (!quellen.length) {
        // Freier Eingang: der am Knoten eingetragene Wert, sonst der Standard
        const eigen = werte[`in_${ein.id}`];
        let wert = eigen === undefined || eigen === "" ? ein.standard : eigen;
        if (ein.art === "zahl" && typeof wert === "string") {
          const z = parseFloat(wert.replace(",", "."));
          wert = Number.isFinite(z) ? z : ein.standard;
        }
        eingangsListen[ein.id] = wert === null || wert === undefined ? [] : [wert];
        return;
      }
      let liste = [];
      quellen.forEach((q) => {
        const erg = ergebnisse.get(q.vonKnoten);
        if (!erg || erg[q.vonAusgang] === undefined) { unvollstaendig = q.vonKnoten; return; }
        liste = liste.concat(vsAlsListe(erg[q.vonAusgang]));
      });
      eingangsListen[ein.id] = liste;
    });
    if (unvollstaendig !== null) {
      fehler.set(id, "Ein vorgeschalteter Knoten hat kein Ergebnis geliefert.");
      return;
    }

    try {
      if (def.sammelnd) {
        // Sammelknoten bekommen die vollen Listen; Eingänge ohne
        // `sammel` werden auf ihren ersten Wert gelesen
        const e = {};
        def.eingaenge.forEach((ein) => {
          e[ein.id] = ein.sammel ? eingangsListen[ein.id]
            : vsErst(eingangsListen[ein.id], ein.standard);
        });
        const aus = def.rechne(e, werte) || {};
        if (aus._bauteile) aus._bauteile.forEach((b) => bauteile.push(b));
        if (aus._anzeige) {
          anzeigen.push({ knoten: id, titel: werte.titel || "Werte", werte: aus._anzeige });
        }
        const fertig = {};
        def.ausgaenge.forEach((a) => { fertig[a.id] = vsAlsListe(aus[a.id]); });
        ergebnisse.set(id, fertig);
      } else {
        // Listenabgleich nach der Regel „längste Liste"
        const durchlaeufe = def.eingaenge.reduce((n, ein) =>
          Math.max(n, (eingangsListen[ein.id] || []).length), 0) || 1;
        if (durchlaeufe > 20000) {
          throw new Error(`${durchlaeufe} Durchläufe sind zu viel – `
            + "die Listen sind zu lang für eine Vorschau.");
        }
        const fertig = {};
        def.ausgaenge.forEach((a) => { fertig[a.id] = []; });
        for (let i = 0; i < durchlaeufe; i++) {
          const e = {};
          def.eingaenge.forEach((ein) => {
            const l = eingangsListen[ein.id] || [];
            // kürzere Listen werden mit ihrem letzten Wert aufgefüllt
            e[ein.id] = l.length ? (i < l.length ? l[i] : l[l.length - 1]) : ein.standard;
          });
          const aus = def.rechne(e, werte) || {};
          if (aus._bauteile) aus._bauteile.forEach((b) => bauteile.push(b));
          def.ausgaenge.forEach((a) => {
            if (aus[a.id] !== undefined && aus[a.id] !== null) fertig[a.id].push(aus[a.id]);
          });
        }
        ergebnisse.set(id, fertig);
      }
    } catch (e) {
      fehler.set(id, e.message || String(e));
    }
  });

  fehler.forEach((text, id) => {
    const k = knoten.get(id);
    meldungen.push({ art: "fehler", knoten: id,
      text: `${(VS_KNOTEN[k.typ] || {}).name || k.typ}: ${text}` });
  });

  // Vorschaugeometrie: alles, was sich zeichnen lässt
  const punkte = [], linien = [];
  ergebnisse.forEach((erg) => {
    Object.keys(erg).forEach((a) => {
      vsAlsListe(erg[a]).forEach((w) => {
        if (vsIstPunkt(w)) punkte.push(w);
        else if (w && w.art === "linie") linien.push(w);
      });
    });
  });
  bauteile.forEach((b) => {
    if (b.art === "stab" || b.art === "balken" || b.art === "wand") {
      linien.push({ art: "linie", a: b.a || b.p1, b: b.b || b.p2, bauteil: b.art });
    } else if (b.art === "stuetze") punkte.push(b.p1);
  });

  return {
    ergebnisse, fehler, meldungen, bauteile, anzeigen, kreis,
    reihenfolge, punkte, linien,
    anzahl: {
      knoten: knoten.size, kanten: kanten.length, bauteile: bauteile.length,
      stab: bauteile.filter((b) => b.art === "stab").length,
      stuetze: bauteile.filter((b) => b.art === "stuetze").length,
      balken: bauteile.filter((b) => b.art === "balken").length,
      wand: bauteile.filter((b) => b.art === "wand").length,
    },
  };
}

/**
 * Darf eine Verbindung gezogen werden?
 *
 * Geprüft werden Art der Werte und – wichtiger – ob die Verbindung einen
 * Kreis schließen würde. Ein Kreis wird gar nicht erst zugelassen,
 * anstatt ihn hinterher zu melden.
 */
function vsVerbindungPruefen(graph, vonKnoten, vonAusgang, nachKnoten, nachEingang) {
  if (vonKnoten === nachKnoten) {
    return { erlaubt: false, grund: "Ein Knoten kann nicht an sich selbst hängen." };
  }
  const vonK = (graph.knoten || []).find((k) => k.id === vonKnoten);
  const nachK = (graph.knoten || []).find((k) => k.id === nachKnoten);
  if (!vonK || !nachK) return { erlaubt: false, grund: "Knoten nicht gefunden." };
  const aus = (VS_KNOTEN[vonK.typ] || { ausgaenge: [] }).ausgaenge
    .find((a) => a.id === vonAusgang);
  const ein = (VS_KNOTEN[nachK.typ] || { eingaenge: [] }).eingaenge
    .find((a) => a.id === nachEingang);
  if (!aus || !ein) return { erlaubt: false, grund: "Anschluss nicht gefunden." };
  if (ein.art !== "beliebig" && aus.art !== ein.art) {
    return { erlaubt: false,
      grund: `„${aus.name}“ führt ${aus.art}, „${ein.name}“ erwartet ${ein.art}.` };
  }
  // Kreisprüfung: ist vonKnoten von nachKnoten aus erreichbar?
  const nach = new Map();
  (graph.knoten || []).forEach((k) => nach.set(k.id, []));
  (graph.kanten || []).forEach((k) => {
    if (nach.has(k.vonKnoten)) nach.get(k.vonKnoten).push(k.nachKnoten);
  });
  const gesehen = new Set([nachKnoten]);
  const offen = [nachKnoten];
  while (offen.length) {
    const id = offen.pop();
    if (id === vonKnoten) {
      return { erlaubt: false,
        grund: "Diese Verbindung würde einen Kreis schließen – der Datenfluss "
          + "läuft nur in eine Richtung." };
    }
    (nach.get(id) || []).forEach((z) => {
      if (!gesehen.has(z)) { gesehen.add(z); offen.push(z); }
    });
  }
  return { erlaubt: true };
}

/**
 * Eingänge eines Knotens, an denen keine Kante hängt.
 *
 * Sie können am Knoten selbst beschrieben werden – dafür zeigt die
 * Eigenschaftenleiste ein Eingabefeld.
 */
function vsFreieEingaenge(graph, knotenId) {
  const k = (graph.knoten || []).find((n) => n.id === knotenId);
  if (!k) return [];
  const def = VS_KNOTEN[k.typ];
  if (!def) return [];
  const belegt = new Set((graph.kanten || [])
    .filter((e) => e.nachKnoten === knotenId).map((e) => e.nachEingang));
  return (def.eingaenge || []).filter((e) => !belegt.has(e.id));
}

/** Neuen Knoten anlegen. */
function vsNeuerKnoten(typ, id, x, y) {
  const def = VS_KNOTEN[typ];
  const werte = {};
  (def.felder || []).forEach((f) => { werte[f.id] = f.standard; });
  return { id, typ, x: x || 0, y: y || 0, werte };
}

/* ------------------------------------------------------------ Vorlagen */

/**
 * Fertige Graphen als Ausgangspunkt.
 *
 * Sie sind zum Überschreiben gedacht: die Schieberegler ändern, die
 * Profile wählen, Knoten hinzufügen. Jede Vorlage rechnet sofort und
 * zeigt damit, wie der Datenfluss gemeint ist.
 */
const VS_VORLAGEN = {
  stuetzenraster: {
    name: "Stützenraster",
    beschreibung: "Aus zwei Feldbreitenlisten wird das Achsraster, daraus das "
      + "Punktraster und daraus die Stützen. Die laufende Summe macht aus "
      + "Feldbreiten die Achsabstände.",
    bauen: () => {
      const k = [
        Object.assign(vsNeuerKnoten("zahlenliste", "felderX", 20, 20),
          { werte: { text: "5× 6,00" } }),
        Object.assign(vsNeuerKnoten("zahlenliste", "felderZ", 20, 130),
          { werte: { text: "3× 7,20" } }),
        Object.assign(vsNeuerKnoten("laufend", "achsenX", 280, 20), { werte: { voran: "ja" } }),
        Object.assign(vsNeuerKnoten("laufend", "achsenZ", 280, 150), { werte: { voran: "ja" } }),
        vsNeuerKnoten("punktRaster", "raster", 540, 70),
        Object.assign(vsNeuerKnoten("stuetze", "stuetze", 800, 60),
          { werte: { laenge: 0.4, breite: 0.4, guete: "C30/37" } }),
        vsNeuerKnoten("modell", "modell", 1060, 90),
      ];
      const kanten = [
        { vonKnoten: "felderX", vonAusgang: "liste", nachKnoten: "achsenX", nachEingang: "liste" },
        { vonKnoten: "felderZ", vonAusgang: "liste", nachKnoten: "achsenZ", nachEingang: "liste" },
        { vonKnoten: "achsenX", vonAusgang: "liste", nachKnoten: "raster", nachEingang: "x" },
        { vonKnoten: "achsenZ", vonAusgang: "liste", nachKnoten: "raster", nachEingang: "z" },
        { vonKnoten: "raster", vonAusgang: "punkte", nachKnoten: "stuetze", nachEingang: "punkt" },
        { vonKnoten: "stuetze", vonAusgang: "bauteil", nachKnoten: "modell", nachEingang: "bauteile" },
      ];
      return { knoten: k, kanten, naechsteId: 1 };
    },
  },

  fachwerk: {
    name: "Fachwerkbinder",
    beschreibung: "Parallelgurtbinder aus Stützweite, Höhe und Feldzahl. "
      + "Ober- und Untergurt entstehen als Kette; die Diagonalen aus zwei "
      + "gegeneinander versetzten Teillisten der Gurtpunkte.",
    bauen: () => {
      const k = [
        Object.assign(vsNeuerKnoten("zahl", "spannweite", 20, 20),
          { werte: { wert: 24, min: 6, max: 60 } }),
        Object.assign(vsNeuerKnoten("zahl", "hoehe", 20, 120),
          { werte: { wert: 2.4, min: 0.5, max: 6 } }),
        Object.assign(vsNeuerKnoten("zahl", "felder", 20, 220),
          { werte: { wert: 8, min: 2, max: 24 } }),
        // x-Werte der Knotenpunkte
        Object.assign(vsNeuerKnoten("bereich", "xWerte", 280, 40), { werte: {} }),
        // Untergurtpunkte auf Höhe 0, Obergurtpunkte auf der Binderhöhe
        vsNeuerKnoten("punkt", "unten", 540, 20),
        vsNeuerKnoten("punkt", "oben", 540, 140),
        // Gurte als Kette
        Object.assign(vsNeuerKnoten("kette", "untergurt", 800, 20),
          { werte: { schliessen: "offen" } }),
        Object.assign(vsNeuerKnoten("kette", "obergurt", 800, 150),
          { werte: { schliessen: "offen" } }),
        // Pfosten: Untergurtpunkt zu Obergurtpunkt
        Object.assign(vsNeuerKnoten("stab", "pfosten", 1060, 300),
          { werte: { familie: "RHS", profil: "RHS 100x100x6", guete: "S235", typ: "strut" } }),
        // Diagonalen: um ein Feld versetzte Teillisten
        Object.assign(vsNeuerKnoten("teilliste", "dUnten", 800, 300), { werte: {} }),
        Object.assign(vsNeuerKnoten("teilliste", "dOben", 800, 430), { werte: {} }),
        Object.assign(vsNeuerKnoten("stab", "diagonale", 1060, 450),
          { werte: { familie: "RHS", profil: "RHS 80x80x5", guete: "S235", typ: "tie" } }),
        Object.assign(vsNeuerKnoten("stab", "gurtstab", 1060, 20),
          { werte: { familie: "IPE", profil: "IPE 200", guete: "S235", typ: "beam" } }),
        vsNeuerKnoten("modell", "modell", 1320, 200),
      ];
      /* Die Diagonalen entstehen aus zwei gegeneinander versetzten
         Teillisten: unten ab Punkt 0, oben ab Punkt 1. Die Anzahl kommt
         aus der Feldzahl, damit beide Listen gleich lang bleiben und
         keine Diagonale doppelt entsteht. */
      k.find((n) => n.id === "dUnten").werte = { in_ab: 0 };
      k.find((n) => n.id === "dOben").werte = { in_ab: 1 };
      const kanten = [
        { vonKnoten: "spannweite", vonAusgang: "wert", nachKnoten: "xWerte", nachEingang: "bis" },
        { vonKnoten: "felder", vonAusgang: "wert", nachKnoten: "xWerte", nachEingang: "teile" },
        { vonKnoten: "xWerte", vonAusgang: "liste", nachKnoten: "unten", nachEingang: "x" },
        { vonKnoten: "xWerte", vonAusgang: "liste", nachKnoten: "oben", nachEingang: "x" },
        { vonKnoten: "hoehe", vonAusgang: "wert", nachKnoten: "oben", nachEingang: "h" },
        { vonKnoten: "unten", vonAusgang: "punkt", nachKnoten: "untergurt", nachEingang: "punkte" },
        { vonKnoten: "oben", vonAusgang: "punkt", nachKnoten: "obergurt", nachEingang: "punkte" },
        // Gurtstäbe aus den Kettenabschnitten
        { vonKnoten: "untergurt", vonAusgang: "a", nachKnoten: "gurtstab", nachEingang: "a" },
        { vonKnoten: "untergurt", vonAusgang: "b", nachKnoten: "gurtstab", nachEingang: "b" },
        { vonKnoten: "obergurt", vonAusgang: "a", nachKnoten: "gurtstab", nachEingang: "a" },
        { vonKnoten: "obergurt", vonAusgang: "b", nachKnoten: "gurtstab", nachEingang: "b" },
        // Pfosten
        { vonKnoten: "unten", vonAusgang: "punkt", nachKnoten: "pfosten", nachEingang: "a" },
        { vonKnoten: "oben", vonAusgang: "punkt", nachKnoten: "pfosten", nachEingang: "b" },
        // Diagonalen aus versetzten Teillisten
        { vonKnoten: "unten", vonAusgang: "punkt", nachKnoten: "dUnten", nachEingang: "liste" },
        { vonKnoten: "oben", vonAusgang: "punkt", nachKnoten: "dOben", nachEingang: "liste" },
        { vonKnoten: "felder", vonAusgang: "wert", nachKnoten: "dUnten", nachEingang: "anzahl" },
        { vonKnoten: "felder", vonAusgang: "wert", nachKnoten: "dOben", nachEingang: "anzahl" },
        { vonKnoten: "dUnten", vonAusgang: "liste", nachKnoten: "diagonale", nachEingang: "a" },
        { vonKnoten: "dOben", vonAusgang: "liste", nachKnoten: "diagonale", nachEingang: "b" },
        { vonKnoten: "gurtstab", vonAusgang: "bauteil", nachKnoten: "modell", nachEingang: "bauteile" },
        { vonKnoten: "pfosten", vonAusgang: "bauteil", nachKnoten: "modell", nachEingang: "bauteile" },
        { vonKnoten: "diagonale", vonAusgang: "bauteil", nachKnoten: "modell", nachEingang: "bauteile" },
      ];
      return { knoten: k, kanten, naechsteId: 1 };
    },
  },

  umgang: {
    name: "Wandzug",
    beschreibung: "Ein geschlossener Wandzug aus Eckpunkten. Die Kette "
      + "verbindet die Punkte, aus jedem Abschnitt wird eine Wand.",
    bauen: () => {
      const k = [
        Object.assign(vsNeuerKnoten("zahlenliste", "xWerte", 20, 20),
          { werte: { text: "0 12 12 0" } }),
        Object.assign(vsNeuerKnoten("zahlenliste", "zWerte", 20, 130),
          { werte: { text: "0 0 8 8" } }),
        vsNeuerKnoten("punkt", "ecken", 280, 60),
        Object.assign(vsNeuerKnoten("kette", "zug", 540, 60), { werte: { schliessen: "zu" } }),
        Object.assign(vsNeuerKnoten("wand", "wand", 800, 60),
          { werte: { kind: "wand_aussen" } }),
        Object.assign(vsNeuerKnoten("zahl", "wandhoehe", 540, 220),
          { werte: { wert: 2.75, min: 2, max: 6 } }),
        vsNeuerKnoten("modell", "modell", 1060, 90),
      ];
      const kanten = [
        { vonKnoten: "xWerte", vonAusgang: "liste", nachKnoten: "ecken", nachEingang: "x" },
        { vonKnoten: "zWerte", vonAusgang: "liste", nachKnoten: "ecken", nachEingang: "z" },
        { vonKnoten: "ecken", vonAusgang: "punkt", nachKnoten: "zug", nachEingang: "punkte" },
        { vonKnoten: "zug", vonAusgang: "a", nachKnoten: "wand", nachEingang: "a" },
        { vonKnoten: "zug", vonAusgang: "b", nachKnoten: "wand", nachEingang: "b" },
        { vonKnoten: "wandhoehe", vonAusgang: "wert", nachKnoten: "wand", nachEingang: "hoehe" },
        { vonKnoten: "wand", vonAusgang: "bauteil", nachKnoten: "modell", nachEingang: "bauteile" },
      ];
      return { knoten: k, kanten, naechsteId: 1 };
    },
  },

  rundstuetzen: {
    name: "Runde Stützenstellung",
    beschreibung: "Stützen gleichmäßig auf einem Kreis – die Polarreihe "
      + "vervielfacht einen Punkt um eine Mitte.",
    bauen: () => {
      const k = [
        Object.assign(vsNeuerKnoten("zahl", "radius", 20, 20),
          { werte: { wert: 9, min: 2, max: 40 } }),
        Object.assign(vsNeuerKnoten("zahl", "anzahl", 20, 120),
          { werte: { wert: 12, min: 3, max: 48 } }),
        vsNeuerKnoten("punkt", "start", 280, 20),
        vsNeuerKnoten("polarreihe", "kreis", 540, 40),
        Object.assign(vsNeuerKnoten("stuetze", "stuetze", 800, 40),
          { werte: { laenge: 0.35, breite: 0.35, guete: "C30/37" } }),
        vsNeuerKnoten("modell", "modell", 1060, 60),
      ];
      const kanten = [
        { vonKnoten: "radius", vonAusgang: "wert", nachKnoten: "start", nachEingang: "x" },
        { vonKnoten: "start", vonAusgang: "punkt", nachKnoten: "kreis", nachEingang: "punkt" },
        { vonKnoten: "anzahl", vonAusgang: "wert", nachKnoten: "kreis", nachEingang: "anzahl" },
        { vonKnoten: "kreis", vonAusgang: "punkte", nachKnoten: "stuetze", nachEingang: "punkt" },
        { vonKnoten: "stuetze", vonAusgang: "bauteil", nachKnoten: "modell", nachEingang: "bauteile" },
      ];
      return { knoten: k, kanten, naechsteId: 1 };
    },
  },
};

/** Vorlage laden und die fortlaufende Nummer für neue Knoten setzen. */
function vsVorlage(name) {
  const v = VS_VORLAGEN[name];
  if (!v) return null;
  const graph = v.bauen();
  graph.naechsteId = graph.knoten.length + 1;
  graph.name = v.name;
  return graph;
}
