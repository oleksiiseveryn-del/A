/**
 * Stahlprofil-Datenbank (Vorbemessungswerte, gerundet nach gängigen
 * Herstellerkatalogen / Schneider Bautabellen). Für die endgültige
 * Ausführungsstatik sind die exakten Werte des jeweiligen Walzwerks
 * bzw. der aktuellen Normtabelle (DIN EN 10365 / DIN EN 10210) zu verwenden.
 *
 * Einheiten: A [cm²], Iy/Iz [cm^4], Wy [cm^3], iy/iz [cm], G [kg/m]
 */
const STEEL_DB = {
  IPE: [
    { name: "IPE 80", A: 7.64, Iy: 80.1, Wy: 20.0, iy: 3.24, Iz: 8.49, iz: 1.05, G: 6.0 },
    { name: "IPE 100", A: 10.3, Iy: 171, Wy: 34.2, iy: 4.07, Iz: 15.9, iz: 1.24, G: 8.1 },
    { name: "IPE 120", A: 13.2, Iy: 318, Wy: 53.0, iy: 4.90, Iz: 27.7, iz: 1.45, G: 10.4 },
    { name: "IPE 140", A: 16.4, Iy: 541, Wy: 77.3, iy: 5.74, Iz: 44.9, iz: 1.65, G: 12.9 },
    { name: "IPE 160", A: 20.1, Iy: 869, Wy: 109, iy: 6.58, Iz: 68.3, iz: 1.84, G: 15.8 },
    { name: "IPE 180", A: 23.9, Iy: 1317, Wy: 146, iy: 7.42, Iz: 100.9, iz: 2.05, G: 18.8 },
    { name: "IPE 200", A: 28.5, Iy: 1943, Wy: 194, iy: 8.26, Iz: 142, iz: 2.24, G: 22.4 },
    { name: "IPE 220", A: 33.4, Iy: 2772, Wy: 252, iy: 9.11, Iz: 204.9, iz: 2.48, G: 26.2 },
    { name: "IPE 240", A: 39.1, Iy: 3892, Wy: 324, iy: 9.97, Iz: 283.6, iz: 2.69, G: 30.7 },
    { name: "IPE 270", A: 45.9, Iy: 5790, Wy: 429, iy: 11.23, Iz: 419.9, iz: 3.02, G: 36.1 },
    { name: "IPE 300", A: 53.8, Iy: 8356, Wy: 557, iy: 12.46, Iz: 603.8, iz: 3.35, G: 42.2 },
    { name: "IPE 330", A: 62.6, Iy: 11770, Wy: 713, iy: 13.71, Iz: 788.1, iz: 3.55, G: 49.1 },
    { name: "IPE 360", A: 72.7, Iy: 16270, Wy: 904, iy: 14.95, Iz: 1043, iz: 3.79, G: 57.1 },
    { name: "IPE 400", A: 84.5, Iy: 23130, Wy: 1156, iy: 16.55, Iz: 1318, iz: 3.95, G: 66.3 },
    { name: "IPE 450", A: 98.8, Iy: 33740, Wy: 1500, iy: 18.48, Iz: 1676, iz: 4.12, G: 77.6 },
    { name: "IPE 500", A: 115.5, Iy: 48200, Wy: 1928, iy: 20.43, Iz: 2142, iz: 4.31, G: 90.7 },
  ],
  HEA: [
    { name: "HEA 100", A: 21.2, Iy: 349, Wy: 72.8, iy: 4.06, Iz: 134, iz: 2.51, G: 16.7 },
    { name: "HEA 120", A: 25.3, Iy: 606, Wy: 106, iy: 4.89, Iz: 231, iz: 3.02, G: 19.9 },
    { name: "HEA 140", A: 31.4, Iy: 1033, Wy: 155, iy: 5.73, Iz: 389, iz: 3.52, G: 24.7 },
    { name: "HEA 160", A: 38.8, Iy: 1673, Wy: 220, iy: 6.57, Iz: 616, iz: 3.98, G: 30.4 },
    { name: "HEA 180", A: 45.3, Iy: 2510, Wy: 294, iy: 7.45, Iz: 925, iz: 4.52, G: 35.5 },
    { name: "HEA 200", A: 53.8, Iy: 3692, Wy: 389, iy: 8.28, Iz: 1336, iz: 4.98, G: 42.3 },
    { name: "HEA 220", A: 64.3, Iy: 5410, Wy: 515, iy: 9.17, Iz: 1955, iz: 5.51, G: 50.5 },
    { name: "HEA 240", A: 76.8, Iy: 7763, Wy: 675, iy: 10.05, Iz: 2769, iz: 6.00, G: 60.3 },
    { name: "HEA 260", A: 86.8, Iy: 10450, Wy: 836, iy: 10.97, Iz: 3668, iz: 6.50, G: 68.2 },
    { name: "HEA 280", A: 97.3, Iy: 13670, Wy: 1013, iy: 11.86, Iz: 4763, iz: 7.00, G: 76.4 },
    { name: "HEA 300", A: 112.5, Iy: 18260, Wy: 1260, iy: 12.74, Iz: 6310, iz: 7.49, G: 88.3 },
    { name: "HEA 320", A: 124.4, Iy: 22930, Wy: 1479, iy: 13.58, Iz: 6985, iz: 7.49, G: 97.6 },
    { name: "HEA 340", A: 133.5, Iy: 27690, Wy: 1678, iy: 14.40, Iz: 7436, iz: 7.46, G: 104.8 },
    { name: "HEA 360", A: 142.8, Iy: 33090, Wy: 1891, iy: 15.22, Iz: 7887, iz: 7.43, G: 112.1 },
    { name: "HEA 400", A: 159.0, Iy: 45070, Wy: 2311, iy: 16.84, Iz: 8564, iz: 7.34, G: 124.8 },
  ],
  HEB: [
    { name: "HEB 100", A: 26.0, Iy: 450, Wy: 89.9, iy: 4.16, Iz: 167, iz: 2.53, G: 20.4 },
    { name: "HEB 120", A: 34.0, Iy: 864, Wy: 144, iy: 5.04, Iz: 318, iz: 3.06, G: 26.7 },
    { name: "HEB 140", A: 43.0, Iy: 1509, Wy: 216, iy: 5.93, Iz: 550, iz: 3.58, G: 33.7 },
    { name: "HEB 160", A: 54.3, Iy: 2492, Wy: 311, iy: 6.78, Iz: 889, iz: 4.05, G: 42.6 },
    { name: "HEB 180", A: 65.3, Iy: 3831, Wy: 426, iy: 7.66, Iz: 1363, iz: 4.57, G: 51.2 },
    { name: "HEB 200", A: 78.1, Iy: 5696, Wy: 570, iy: 8.54, Iz: 2003, iz: 5.07, G: 61.3 },
    { name: "HEB 220", A: 91.0, Iy: 8091, Wy: 736, iy: 9.43, Iz: 2843, iz: 5.59, G: 71.5 },
    { name: "HEB 240", A: 106.0, Iy: 11260, Wy: 938, iy: 10.31, Iz: 3923, iz: 6.08, G: 83.2 },
    { name: "HEB 260", A: 118.4, Iy: 14920, Wy: 1148, iy: 11.22, Iz: 5135, iz: 6.58, G: 93.0 },
    { name: "HEB 280", A: 131.4, Iy: 19270, Wy: 1376, iy: 12.11, Iz: 6595, iz: 7.09, G: 103.1 },
    { name: "HEB 300", A: 149.1, Iy: 25170, Wy: 1678, iy: 12.99, Iz: 8563, iz: 7.58, G: 117.0 },
    { name: "HEB 320", A: 161.3, Iy: 30820, Wy: 1926, iy: 13.82, Iz: 9239, iz: 7.57, G: 126.6 },
    { name: "HEB 340", A: 170.9, Iy: 36660, Wy: 2156, iy: 14.65, Iz: 9690, iz: 7.53, G: 134.2 },
    { name: "HEB 360", A: 180.6, Iy: 43190, Wy: 2400, iy: 15.46, Iz: 10140, iz: 7.49, G: 141.8 },
    { name: "HEB 400", A: 197.8, Iy: 57680, Wy: 2884, iy: 17.08, Iz: 10820, iz: 7.40, G: 155.3 },
  ],
  // Quadratische Rechteckhohlprofile, warmgefertigt (EN 10210) - iy = iz = i
  RHS: [
    { name: "RHS 40x40x4", A: 5.24, Iy: 11.2, Wy: 5.6, iy: 1.46, Iz: 11.2, iz: 1.46, G: 4.12 },
    { name: "RHS 50x50x4", A: 6.95, Iy: 23.2, Wy: 9.3, iy: 1.83, Iz: 23.2, iz: 1.83, G: 5.45 },
    { name: "RHS 60x60x5", A: 10.6, Iy: 50.9, Wy: 17.0, iy: 2.19, Iz: 50.9, iz: 2.19, G: 8.31 },
    { name: "RHS 70x70x5", A: 12.6, Iy: 84.0, Wy: 24.0, iy: 2.58, Iz: 84.0, iz: 2.58, G: 9.91 },
    { name: "RHS 80x80x5", A: 14.6, Iy: 131, Wy: 32.8, iy: 3.00, Iz: 131, iz: 3.00, G: 11.5 },
    { name: "RHS 90x90x5", A: 16.6, Iy: 194, Wy: 43.1, iy: 3.42, Iz: 194, iz: 3.42, G: 13.0 },
    { name: "RHS 100x100x6", A: 22.1, Iy: 323, Wy: 64.6, iy: 3.82, Iz: 323, iz: 3.82, G: 17.3 },
    { name: "RHS 120x120x6", A: 27.0, Iy: 580, Wy: 96.7, iy: 4.64, Iz: 580, iz: 4.64, G: 21.2 },
    { name: "RHS 140x140x6", A: 31.8, Iy: 946, Wy: 135, iy: 5.45, Iz: 946, iz: 5.45, G: 25.0 },
    { name: "RHS 150x150x6", A: 34.2, Iy: 1170, Wy: 156, iy: 5.85, Iz: 1170, iz: 5.85, G: 26.9 },
    { name: "RHS 160x160x8", A: 47.1, Iy: 1810, Wy: 226, iy: 6.20, Iz: 1810, iz: 6.20, G: 37.0 },
    { name: "RHS 180x180x8", A: 53.5, Iy: 2650, Wy: 294, iy: 7.03, Iz: 2650, iz: 7.03, G: 42.0 },
    { name: "RHS 200x200x8", A: 59.9, Iy: 3730, Wy: 373, iy: 7.89, Iz: 3730, iz: 7.89, G: 47.0 },
  ],
  // Gleichschenklige Winkel, warmgefertigt - iy = iz = i(min, v-v) für Knicknachweis
  L: [
    { name: "L 50x50x5", A: 4.80, Iy: 11.0, Wy: 3.0, iy: 0.98, Iz: 11.0, iz: 0.98, G: 3.77 },
    { name: "L 60x60x6", A: 6.91, Iy: 19.2, Wy: 4.5, iy: 1.18, Iz: 19.2, iz: 1.18, G: 5.42 },
    { name: "L 70x70x7", A: 9.40, Iy: 30.8, Wy: 6.3, iy: 1.37, Iz: 30.8, iz: 1.37, G: 7.38 },
    { name: "L 80x80x8", A: 12.3, Iy: 46.3, Wy: 8.3, iy: 1.55, Iz: 46.3, iz: 1.55, G: 9.63 },
    { name: "L 90x90x9", A: 15.5, Iy: 66.9, Wy: 10.7, iy: 1.74, Iz: 66.9, iz: 1.74, G: 12.2 },
    { name: "L 100x100x10", A: 19.2, Iy: 92.9, Wy: 13.2, iy: 1.93, Iz: 92.9, iz: 1.93, G: 15.1 },
    { name: "L 120x120x12", A: 27.3, Iy: 158, Wy: 19.0, iy: 2.31, Iz: 158, iz: 2.31, G: 21.4 },
  ],
};

// Bauteiltyp -> sinnvolle Voreinstellungen (Beanspruchung, Knicklängenbeiwert, bevorzugte Profilfamilien)
const MEMBER_TYPE_DEFAULTS = {
  "Stütze": { loadType: "Druck", beta: 1.0, families: ["HEB", "HEA", "RHS"] },
  "Obergurt": { loadType: "Druck", beta: 1.0, families: ["RHS", "L", "HEA"] },
  "Untergurt": { loadType: "Zug", beta: 1.0, families: ["RHS", "L", "HEA"] },
  "Druckstrebe": { loadType: "Druck", beta: 1.0, families: ["RHS", "L"] },
  "Zugstrebe": { loadType: "Zug", beta: 1.0, families: ["L", "RHS"] },
  "Riegel/Pfette": { loadType: "Biegung", beta: 1.0, families: ["IPE"] },
  "Sonstige": { loadType: "Druck", beta: 1.0, families: ["HEA", "HEB", "IPE", "RHS", "L"] },
};

const FAMILY_BUCKLING_CURVE = {
  // alpha nach DIN EN 1993-1-1, Tabelle 6.1 / 6.2 (vereinfachte Zuordnung für Vorbemessung)
  HEA: 0.49, // Knicken um schwache Achse (Kurve c)
  HEB: 0.49,
  IPE: 0.49,
  RHS: 0.21, // warmgefertigte Hohlprofile (Kurve a)
  L: 0.34,   // Winkelprofile (Kurve b)
};
