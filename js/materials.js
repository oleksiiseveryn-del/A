/**
 * Baustoffkatalog für die Architektur-Bauteile.
 *
 * rho  Rohdichte [kg/m³] - Wichten nach DIN EN 1991-1-1, Anhang A
 * lam  Bemessungswert der Wärmeleitfähigkeit [W/(m·K)] nach DIN 4108-4
 * preis  Richtwert [€/m³] eingebaut - vom Anwender an die eigenen
 *        Einkaufs- und Lohnkosten anzupassen
 */
const BAUSTOFFE = {
  stahlbeton:      { name: "Stahlbeton C25/30", rho: 2500, lam: 2.30, preis: 260, gruppe: "Beton" },
  beton_unbewehrt: { name: "Beton unbewehrt C16/20", rho: 2400, lam: 2.10, preis: 180, gruppe: "Beton" },
  sauberkeit:      { name: "Sauberkeitsschicht C8/10", rho: 2300, lam: 2.00, preis: 140, gruppe: "Beton" },
  leichtbeton:     { name: "Leichtbeton LC16/18", rho: 1600, lam: 0.80, preis: 300, gruppe: "Beton" },

  ks_mauerwerk:    { name: "Kalksandstein RDK 1,8", rho: 1800, lam: 0.99, preis: 320, gruppe: "Mauerwerk" },
  hlz_mauerwerk:   { name: "Hochlochziegel RDK 0,8", rho: 800, lam: 0.21, preis: 340, gruppe: "Mauerwerk" },
  porenbeton:      { name: "Porenbeton PP2-0,40", rho: 400, lam: 0.11, preis: 300, gruppe: "Mauerwerk" },
  vollziegel:      { name: "Vollziegel RDK 1,8", rho: 1800, lam: 0.81, preis: 380, gruppe: "Mauerwerk" },

  nadelholz:       { name: "Nadelholz C24", rho: 420, lam: 0.13, preis: 750, gruppe: "Holz" },
  bsh:             { name: "Brettschichtholz GL24h", rho: 450, lam: 0.13, preis: 1100, gruppe: "Holz" },
  osb:             { name: "OSB-Platte", rho: 650, lam: 0.13, preis: 900, gruppe: "Holz" },

  mineralwolle:    { name: "Mineralwolle WLG 035", rho: 60, lam: 0.035, preis: 160, gruppe: "Dämmung" },
  eps:             { name: "EPS WLG 035", rho: 20, lam: 0.035, preis: 130, gruppe: "Dämmung" },
  pir:             { name: "PIR WLG 024", rho: 35, lam: 0.024, preis: 260, gruppe: "Dämmung" },
  xps:             { name: "XPS Perimeter WLG 035", rho: 35, lam: 0.035, preis: 220, gruppe: "Dämmung" },

  zementestrich:   { name: "Zementestrich", rho: 2000, lam: 1.40, preis: 210, gruppe: "Ausbau" },
  gipskarton:      { name: "Gipskartonplatte", rho: 900, lam: 0.25, preis: 700, gruppe: "Ausbau" },
  kalkzementputz:  { name: "Kalkzementputz", rho: 1800, lam: 1.00, preis: 600, gruppe: "Ausbau" },
  gipsputz:        { name: "Gipsputz", rho: 1200, lam: 0.51, preis: 650, gruppe: "Ausbau" },
  fliesen:         { name: "Keramische Fliesen", rho: 2000, lam: 1.00, preis: 1200, gruppe: "Ausbau" },

  abdichtung:      { name: "Bitumenabdichtung", rho: 1100, lam: 0.17, preis: 900, gruppe: "Abdichtung" },
  folie:           { name: "Kunststoffdichtungsbahn", rho: 1200, lam: 0.20, preis: 1100, gruppe: "Abdichtung" },
  dampfsperre:     { name: "Dampfsperre", rho: 1000, lam: 0.20, preis: 800, gruppe: "Abdichtung" },

  trapezblech:     { name: "Trapezblech Stahl", rho: 7850, lam: 50.0, preis: 3200, gruppe: "Metall" },
  kies:            { name: "Kiesschüttung 16/32", rho: 1800, lam: 0.70, preis: 45, gruppe: "Schüttung" },
  sand:            { name: "Sand-Kies-Tragschicht", rho: 1900, lam: 0.90, preis: 40, gruppe: "Schüttung" },
};

/**
 * Bauteiltypen mit Standardaufbau (Schichtdicken in Metern, von außen nach innen)
 * sowie den Wärmeübergangswiderständen nach DIN EN ISO 6946, Tabelle 7.
 * Rsi/Rse in m²·K/W; flow gibt die Richtung des Wärmestroms an.
 */
const BAUTEILTYPEN = {
  wand_aussen: {
    name: "Außenwand", form: "linie", rsi: 0.13, rse: 0.04, uWert: true,
    standard: [
      { material: "kalkzementputz", d: 0.015 },
      { material: "ks_mauerwerk", d: 0.175 },
      { material: "mineralwolle", d: 0.160 },
      { material: "kalkzementputz", d: 0.010 },
    ],
  },
  wand_innen: {
    name: "Innenwand", form: "linie", rsi: 0.13, rse: 0.13, uWert: true,
    standard: [
      { material: "gipsputz", d: 0.010 },
      { material: "ks_mauerwerk", d: 0.115 },
      { material: "gipsputz", d: 0.010 },
    ],
  },
  decke: {
    name: "Geschossdecke", form: "flaeche", rsi: 0.17, rse: 0.17, uWert: true,
    standard: [
      { material: "zementestrich", d: 0.060 },
      { material: "mineralwolle", d: 0.030 },
      { material: "stahlbeton", d: 0.200 },
      { material: "gipsputz", d: 0.010 },
    ],
  },
  dach: {
    name: "Dach (Warmdach)", form: "flaeche", rsi: 0.10, rse: 0.04, uWert: true,
    standard: [
      { material: "kies", d: 0.050 },
      { material: "folie", d: 0.002 },
      { material: "pir", d: 0.180 },
      { material: "dampfsperre", d: 0.002 },
      { material: "stahlbeton", d: 0.200 },
    ],
  },
  bodenplatte: {
    name: "Bodenplatte", form: "flaeche", rsi: 0.17, rse: 0.00, uWert: true, erdreich: true,
    standard: [
      { material: "zementestrich", d: 0.060 },
      { material: "eps", d: 0.100 },
      { material: "abdichtung", d: 0.004 },
      { material: "stahlbeton", d: 0.250 },
      { material: "sauberkeit", d: 0.050 },
      { material: "sand", d: 0.150 },
    ],
  },
  streifenfundament: {
    name: "Streifenfundament", form: "linie", uWert: false, unterGelaende: true,
    standard: [{ material: "stahlbeton", d: 0.800 }],
    breite: 0.60,
  },
  einzelfundament: {
    name: "Einzelfundament", form: "punkt", uWert: false, unterGelaende: true,
    standard: [{ material: "stahlbeton", d: 0.800 }],
    laenge: 1.50, breite: 1.50,
  },
};

/** Darstellungsfarbe nach Baustoffgruppe. */
const GRUPPEN_FARBE = {
  "Beton": 0x9aa5ad,
  "Mauerwerk": 0xc08a5e,
  "Holz": 0xb08a4f,
  "Dämmung": 0xe3d26a,
  "Ausbau": 0xd9dde0,
  "Abdichtung": 0x4c5560,
  "Metall": 0x8fa3b5,
  "Schüttung": 0x8d8577,
};
