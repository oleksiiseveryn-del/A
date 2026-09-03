/**
 * Stahlprofil-Datenbank (Vorbemessungswerte, gerundet nach gängigen
 * Herstellerkatalogen / Schneider Bautabellen). Für die endgültige
 * Ausführungsstatik sind die exakten Werte des jeweiligen Walzwerks
 * bzw. der aktuellen Normtabelle (DIN EN 10365 / DIN EN 10210) zu verwenden.
 *
 * Einheiten: A [cm²], Iy/Iz [cm^4], Wy [cm^3], iy/iz [cm], G [kg/m]
 * h, b, tw, tf [mm] dienen der Knicklinienzuordnung und der räumlichen
 * Darstellung, nicht der Tragfähigkeitsberechnung.
 */
const STEEL_DB = {
  IPE: [
    { h: 80, b: 46, name: "IPE 80", tw: 3.8, tf: 5.2, A: 7.64, Iy: 80.1, Wy: 20.0, iy: 3.24, Iz: 8.49, iz: 1.05, G: 6.0 },
    { h: 100, b: 55, name: "IPE 100", tw: 4.1, tf: 5.7, A: 10.3, Iy: 171, Wy: 34.2, iy: 4.07, Iz: 15.9, iz: 1.24, G: 8.1 },
    { h: 120, b: 64, name: "IPE 120", tw: 4.4, tf: 6.3, A: 13.2, Iy: 318, Wy: 53.0, iy: 4.90, Iz: 27.7, iz: 1.45, G: 10.4 },
    { h: 140, b: 73, name: "IPE 140", tw: 4.7, tf: 6.9, A: 16.4, Iy: 541, Wy: 77.3, iy: 5.74, Iz: 44.9, iz: 1.65, G: 12.9 },
    { h: 160, b: 82, name: "IPE 160", tw: 5.0, tf: 7.4, A: 20.1, Iy: 869, Wy: 109, iy: 6.58, Iz: 68.3, iz: 1.84, G: 15.8 },
    { h: 180, b: 91, name: "IPE 180", tw: 5.3, tf: 8.0, A: 23.9, Iy: 1317, Wy: 146, iy: 7.42, Iz: 100.9, iz: 2.05, G: 18.8 },
    { h: 200, b: 100, name: "IPE 200", tw: 5.6, tf: 8.5, A: 28.5, Iy: 1943, Wy: 194, iy: 8.26, Iz: 142, iz: 2.24, G: 22.4 },
    { h: 220, b: 110, name: "IPE 220", tw: 5.9, tf: 9.2, A: 33.4, Iy: 2772, Wy: 252, iy: 9.11, Iz: 204.9, iz: 2.48, G: 26.2 },
    { h: 240, b: 120, name: "IPE 240", tw: 6.2, tf: 9.8, A: 39.1, Iy: 3892, Wy: 324, iy: 9.97, Iz: 283.6, iz: 2.69, G: 30.7 },
    { h: 270, b: 135, name: "IPE 270", tw: 6.6, tf: 10.2, A: 45.9, Iy: 5790, Wy: 429, iy: 11.23, Iz: 419.9, iz: 3.02, G: 36.1 },
    { h: 300, b: 150, name: "IPE 300", tw: 7.1, tf: 10.7, A: 53.8, Iy: 8356, Wy: 557, iy: 12.46, Iz: 603.8, iz: 3.35, G: 42.2 },
    { h: 330, b: 160, name: "IPE 330", tw: 7.5, tf: 11.5, A: 62.6, Iy: 11770, Wy: 713, iy: 13.71, Iz: 788.1, iz: 3.55, G: 49.1 },
    { h: 360, b: 170, name: "IPE 360", tw: 8.0, tf: 12.7, A: 72.7, Iy: 16270, Wy: 904, iy: 14.95, Iz: 1043, iz: 3.79, G: 57.1 },
    { h: 400, b: 180, name: "IPE 400", tw: 8.6, tf: 13.5, A: 84.5, Iy: 23130, Wy: 1156, iy: 16.55, Iz: 1318, iz: 3.95, G: 66.3 },
    { h: 450, b: 190, name: "IPE 450", tw: 9.4, tf: 14.6, A: 98.8, Iy: 33740, Wy: 1500, iy: 18.48, Iz: 1676, iz: 4.12, G: 77.6 },
    { h: 500, b: 200, name: "IPE 500", tw: 10.2, tf: 16.0, A: 115.5, Iy: 48200, Wy: 1928, iy: 20.43, Iz: 2142, iz: 4.31, G: 90.7 },
  ],
  HEA: [
    { h: 96, b: 100, name: "HEA 100", tw: 5.0, tf: 8.0, A: 21.2, Iy: 349, Wy: 72.8, iy: 4.06, Iz: 134, iz: 2.51, G: 16.7 },
    { h: 114, b: 120, name: "HEA 120", tw: 5.0, tf: 8.0, A: 25.3, Iy: 606, Wy: 106, iy: 4.89, Iz: 231, iz: 3.02, G: 19.9 },
    { h: 133, b: 140, name: "HEA 140", tw: 5.5, tf: 8.5, A: 31.4, Iy: 1033, Wy: 155, iy: 5.73, Iz: 389, iz: 3.52, G: 24.7 },
    { h: 152, b: 160, name: "HEA 160", tw: 6.0, tf: 9.0, A: 38.8, Iy: 1673, Wy: 220, iy: 6.57, Iz: 616, iz: 3.98, G: 30.4 },
    { h: 171, b: 180, name: "HEA 180", tw: 6.0, tf: 9.5, A: 45.3, Iy: 2510, Wy: 294, iy: 7.45, Iz: 925, iz: 4.52, G: 35.5 },
    { h: 190, b: 200, name: "HEA 200", tw: 6.5, tf: 10.0, A: 53.8, Iy: 3692, Wy: 389, iy: 8.28, Iz: 1336, iz: 4.98, G: 42.3 },
    { h: 210, b: 220, name: "HEA 220", tw: 7.0, tf: 11.0, A: 64.3, Iy: 5410, Wy: 515, iy: 9.17, Iz: 1955, iz: 5.51, G: 50.5 },
    { h: 230, b: 240, name: "HEA 240", tw: 7.5, tf: 12.0, A: 76.8, Iy: 7763, Wy: 675, iy: 10.05, Iz: 2769, iz: 6.00, G: 60.3 },
    { h: 250, b: 260, name: "HEA 260", tw: 7.5, tf: 12.5, A: 86.8, Iy: 10450, Wy: 836, iy: 10.97, Iz: 3668, iz: 6.50, G: 68.2 },
    { h: 270, b: 280, name: "HEA 280", tw: 8.0, tf: 13.0, A: 97.3, Iy: 13670, Wy: 1013, iy: 11.86, Iz: 4763, iz: 7.00, G: 76.4 },
    { h: 290, b: 300, name: "HEA 300", tw: 8.5, tf: 14.0, A: 112.5, Iy: 18260, Wy: 1260, iy: 12.74, Iz: 6310, iz: 7.49, G: 88.3 },
    { h: 310, b: 300, name: "HEA 320", tw: 9.0, tf: 15.5, A: 124.4, Iy: 22930, Wy: 1479, iy: 13.58, Iz: 6985, iz: 7.49, G: 97.6 },
    { h: 330, b: 300, name: "HEA 340", tw: 9.5, tf: 16.5, A: 133.5, Iy: 27690, Wy: 1678, iy: 14.40, Iz: 7436, iz: 7.46, G: 104.8 },
    { h: 350, b: 300, name: "HEA 360", tw: 10.0, tf: 17.5, A: 142.8, Iy: 33090, Wy: 1891, iy: 15.22, Iz: 7887, iz: 7.43, G: 112.1 },
    { h: 390, b: 300, name: "HEA 400", tw: 11.0, tf: 19.0, A: 159.0, Iy: 45070, Wy: 2311, iy: 16.84, Iz: 8564, iz: 7.34, G: 124.8 },
  ],
  HEB: [
    { h: 100, b: 100, name: "HEB 100", tw: 6.0, tf: 10.0, A: 26.0, Iy: 450, Wy: 89.9, iy: 4.16, Iz: 167, iz: 2.53, G: 20.4 },
    { h: 120, b: 120, name: "HEB 120", tw: 6.5, tf: 11.0, A: 34.0, Iy: 864, Wy: 144, iy: 5.04, Iz: 318, iz: 3.06, G: 26.7 },
    { h: 140, b: 140, name: "HEB 140", tw: 7.0, tf: 12.0, A: 43.0, Iy: 1509, Wy: 216, iy: 5.93, Iz: 550, iz: 3.58, G: 33.7 },
    { h: 160, b: 160, name: "HEB 160", tw: 8.0, tf: 13.0, A: 54.3, Iy: 2492, Wy: 311, iy: 6.78, Iz: 889, iz: 4.05, G: 42.6 },
    { h: 180, b: 180, name: "HEB 180", tw: 8.5, tf: 14.0, A: 65.3, Iy: 3831, Wy: 426, iy: 7.66, Iz: 1363, iz: 4.57, G: 51.2 },
    { h: 200, b: 200, name: "HEB 200", tw: 9.0, tf: 15.0, A: 78.1, Iy: 5696, Wy: 570, iy: 8.54, Iz: 2003, iz: 5.07, G: 61.3 },
    { h: 220, b: 220, name: "HEB 220", tw: 9.5, tf: 16.0, A: 91.0, Iy: 8091, Wy: 736, iy: 9.43, Iz: 2843, iz: 5.59, G: 71.5 },
    { h: 240, b: 240, name: "HEB 240", tw: 10.0, tf: 17.0, A: 106.0, Iy: 11260, Wy: 938, iy: 10.31, Iz: 3923, iz: 6.08, G: 83.2 },
    { h: 260, b: 260, name: "HEB 260", tw: 10.0, tf: 17.5, A: 118.4, Iy: 14920, Wy: 1148, iy: 11.22, Iz: 5135, iz: 6.58, G: 93.0 },
    { h: 280, b: 280, name: "HEB 280", tw: 10.5, tf: 18.0, A: 131.4, Iy: 19270, Wy: 1376, iy: 12.11, Iz: 6595, iz: 7.09, G: 103.1 },
    { h: 300, b: 300, name: "HEB 300", tw: 11.0, tf: 19.0, A: 149.1, Iy: 25170, Wy: 1678, iy: 12.99, Iz: 8563, iz: 7.58, G: 117.0 },
    { h: 320, b: 300, name: "HEB 320", tw: 11.5, tf: 20.5, A: 161.3, Iy: 30820, Wy: 1926, iy: 13.82, Iz: 9239, iz: 7.57, G: 126.6 },
    { h: 340, b: 300, name: "HEB 340", tw: 12.0, tf: 21.5, A: 170.9, Iy: 36660, Wy: 2156, iy: 14.65, Iz: 9690, iz: 7.53, G: 134.2 },
    { h: 360, b: 300, name: "HEB 360", tw: 12.5, tf: 22.5, A: 180.6, Iy: 43190, Wy: 2400, iy: 15.46, Iz: 10140, iz: 7.49, G: 141.8 },
    { h: 400, b: 300, name: "HEB 400", tw: 13.5, tf: 24.0, A: 197.8, Iy: 57680, Wy: 2884, iy: 17.08, Iz: 10820, iz: 7.40, G: 155.3 },
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
  // U-Profile mit parallelen Flanschen (UPE)
  UPE: [
    { h: 80, b: 50, tw: 4.0, tf: 7.0, name: "UPE 80", A: 10.1, Iy: 107, Wy: 26.8, iy: 3.26, Iz: 25.5, iz: 1.59, G: 7.9 },
    { h: 100, b: 55, tw: 4.5, tf: 7.5, name: "UPE 100", A: 12.5, Iy: 207, Wy: 41.4, iy: 4.07, Iz: 38.3, iz: 1.75, G: 9.8 },
    { h: 120, b: 60, tw: 5.0, tf: 8.0, name: "UPE 120", A: 15.4, Iy: 364, Wy: 60.7, iy: 4.87, Iz: 55.5, iz: 1.90, G: 12.1 },
    { h: 140, b: 65, tw: 5.0, tf: 9.0, name: "UPE 140", A: 18.4, Iy: 600, Wy: 85.6, iy: 5.71, Iz: 78.8, iz: 2.07, G: 14.5 },
    { h: 160, b: 70, tw: 5.5, tf: 9.5, name: "UPE 160", A: 21.7, Iy: 911, Wy: 114, iy: 6.48, Iz: 107, iz: 2.22, G: 17.0 },
    { h: 180, b: 75, tw: 5.5, tf: 10.5, name: "UPE 180", A: 25.1, Iy: 1350, Wy: 150, iy: 7.34, Iz: 144, iz: 2.40, G: 19.7 },
    { h: 200, b: 80, tw: 6.0, tf: 11.0, name: "UPE 200", A: 29.0, Iy: 1910, Wy: 191, iy: 8.11, Iz: 187, iz: 2.54, G: 22.8 },
    { h: 220, b: 85, tw: 6.5, tf: 12.0, name: "UPE 220", A: 33.9, Iy: 2680, Wy: 244, iy: 8.90, Iz: 250, iz: 2.72, G: 26.6 },
    { h: 240, b: 90, tw: 7.0, tf: 12.5, name: "UPE 240", A: 38.5, Iy: 3600, Wy: 300, iy: 9.67, Iz: 311, iz: 2.84, G: 30.2 },
    { h: 270, b: 95, tw: 7.5, tf: 13.5, name: "UPE 270", A: 44.8, Iy: 5250, Wy: 389, iy: 10.80, Iz: 401, iz: 2.99, G: 35.2 },
    { h: 300, b: 100, tw: 9.5, tf: 15.0, name: "UPE 300", A: 56.6, Iy: 8030, Wy: 535, iy: 11.90, Iz: 538, iz: 3.08, G: 44.4 },
  ],
  // Nahtlose Stahlrohre, warmgefertigt (EN 10210) - iy = iz = i
  ROHR: [
    { name: "Rohr 48.3x3.2", A: 4.53, Iy: 11.6, Wy: 4.80, iy: 1.60, Iz: 11.6, iz: 1.60, G: 3.56 },
    { name: "Rohr 60.3x4", A: 7.07, Iy: 28.2, Wy: 9.34, iy: 2.00, Iz: 28.2, iz: 2.00, G: 5.55 },
    { name: "Rohr 76.1x4", A: 9.06, Iy: 59.1, Wy: 15.5, iy: 2.55, Iz: 59.1, iz: 2.55, G: 7.11 },
    { name: "Rohr 88.9x5", A: 13.2, Iy: 116, Wy: 26.2, iy: 2.97, Iz: 116, iz: 2.97, G: 10.3 },
    { name: "Rohr 101.6x5", A: 15.2, Iy: 177, Wy: 34.9, iy: 3.42, Iz: 177, iz: 3.42, G: 11.9 },
    { name: "Rohr 114.3x5", A: 17.2, Iy: 257, Wy: 45.0, iy: 3.87, Iz: 257, iz: 3.87, G: 13.5 },
    { name: "Rohr 139.7x6", A: 25.2, Iy: 564, Wy: 80.7, iy: 4.73, Iz: 564, iz: 4.73, G: 19.8 },
    { name: "Rohr 168.3x6.3", A: 32.1, Iy: 1053, Wy: 125, iy: 5.73, Iz: 1053, iz: 5.73, G: 25.2 },
    { name: "Rohr 193.7x8", A: 46.7, Iy: 2016, Wy: 208, iy: 6.57, Iz: 2016, iz: 6.57, G: 36.6 },
    { name: "Rohr 219.1x8", A: 53.1, Iy: 2960, Wy: 270, iy: 7.47, Iz: 2960, iz: 7.47, G: 41.6 },
  ],
  /**
   * Doppelwinkel Rücken an Rücken mit Futterblechen (typischer Fachwerkstab).
   * Fläche und Gewicht doppelt; als maßgebender Trägheitsradius ist i_y des
   * Einzelwinkels (Achse parallel zum Knotenblech) angesetzt - bei
   * ausreichender Anzahl Bindebleche die maßgebende Knickachse.
   */
  "2L": [
    { name: "2L 50x50x5", A: 9.60, Iy: 22.0, Wy: 6.0, iy: 1.51, Iz: 22.0, iz: 1.51, G: 7.54 },
    { name: "2L 60x60x6", A: 13.8, Iy: 45.8, Wy: 9.0, iy: 1.82, Iz: 45.8, iz: 1.82, G: 10.8 },
    { name: "2L 70x70x7", A: 18.8, Iy: 84.5, Wy: 12.6, iy: 2.12, Iz: 84.5, iz: 2.12, G: 14.8 },
    { name: "2L 80x80x8", A: 24.6, Iy: 144, Wy: 16.6, iy: 2.42, Iz: 144, iz: 2.42, G: 19.3 },
    { name: "2L 90x90x9", A: 31.0, Iy: 229, Wy: 21.4, iy: 2.72, Iz: 229, iz: 2.72, G: 24.4 },
    { name: "2L 100x100x10", A: 38.4, Iy: 350, Wy: 26.4, iy: 3.02, Iz: 350, iz: 3.02, G: 30.2 },
    { name: "2L 120x120x12", A: 54.6, Iy: 720, Wy: 38.0, iy: 3.63, Iz: 720, iz: 3.63, G: 42.8 },
  ],
  // Gleichschenklige Winkel, warmgefertigt - iy = iz = i(min, v-v) für Knicknachweis
  L: [
    { name: "L 50x50x5", A: 4.80, Iy: 4.6, Wy: 3.0, iy: 0.98, Iz: 4.6, iz: 0.98, G: 3.77 },
    { name: "L 60x60x6", A: 6.91, Iy: 9.6, Wy: 4.5, iy: 1.18, Iz: 9.6, iz: 1.18, G: 5.42 },
    { name: "L 70x70x7", A: 9.40, Iy: 17.6, Wy: 6.3, iy: 1.37, Iz: 17.6, iz: 1.37, G: 7.38 },
    { name: "L 80x80x8", A: 12.3, Iy: 29.6, Wy: 8.3, iy: 1.55, Iz: 29.6, iz: 1.55, G: 9.63 },
    { name: "L 90x90x9", A: 15.5, Iy: 46.9, Wy: 10.7, iy: 1.74, Iz: 46.9, iz: 1.74, G: 12.2 },
    { name: "L 100x100x10", A: 19.2, Iy: 71.5, Wy: 13.2, iy: 1.93, Iz: 71.5, iz: 1.93, G: 15.1 },
    { name: "L 120x120x12", A: 27.3, Iy: 145.7, Wy: 19.0, iy: 2.31, Iz: 145.7, iz: 2.31, G: 21.4 },
  ],
};

// Bauteiltyp -> sinnvolle Voreinstellungen (Beanspruchung, Knicklängenbeiwert, bevorzugte Profilfamilien)
const MEMBER_TYPE_DEFAULTS = {
  "Stütze": { loadType: "Druck", beta: 1.0, families: ["HEB", "HEA", "RHS", "ROHR"] },
  "Obergurt": { loadType: "Druck", beta: 1.0, families: ["RHS", "ROHR", "2L", "UPE", "HEA"] },
  "Untergurt": { loadType: "Zug", beta: 1.0, families: ["RHS", "2L", "L", "UPE", "HEA"] },
  "Druckstrebe": { loadType: "Druck", beta: 1.0, families: ["RHS", "ROHR", "2L", "L"] },
  "Zugstrebe": { loadType: "Zug", beta: 1.0, families: ["L", "2L", "RHS"] },
  "Riegel/Pfette": { loadType: "Biegung", beta: 1.0, families: ["IPE", "UPE"] },
  "Sonstige": { loadType: "Druck", beta: 1.0, families: ["HEA", "HEB", "IPE", "UPE", "RHS", "ROHR", "2L", "L"] },
};

// Auswahlliste der Profilfamilien in der Bauteiltabelle
const FAMILY_LABELS = {
  AUTO: "Automatisch",
  HEA: "HEA",
  HEB: "HEB",
  IPE: "IPE",
  UPE: "UPE",
  RHS: "RHS (Vierkant)",
  ROHR: "Rohr",
  "2L": "2L (Doppelwinkel)",
  L: "L (Winkel)",
};

// Imperfektionsbeiwerte der Knicklinien nach DIN EN 1993-1-1, Tabelle 6.1
const BUCKLING_CURVE_ALPHA = { a0: 0.13, a: 0.21, b: 0.34, c: 0.49, d: 0.76 };

/**
 * Knicklinie nach DIN EN 1993-1-1, Tabelle 6.2, für das Ausweichen um die
 * schwache Achse (z-z), die bei den hier betrachteten Stäben maßgebend ist.
 *
 * Gewalzte I-Profile mit t_f ≤ 40 mm: h/b > 1,2 → Kurve b, sonst Kurve c.
 * Warmgefertigte Hohlprofile → Kurve a. Winkel und U-Profile → Kurve b bzw. c.
 */
function bucklingAlpha(family, profile) {
  switch (family) {
    case "IPE":
    case "HEA":
    case "HEB": {
      const ratio = profile.h && profile.b ? profile.h / profile.b : 1;
      return ratio > 1.2 ? BUCKLING_CURVE_ALPHA.b : BUCKLING_CURVE_ALPHA.c;
    }
    case "RHS":
    case "ROHR":
      return BUCKLING_CURVE_ALPHA.a; // warmgefertigt (kaltgefertigt wäre Kurve c)
    case "L":
    case "2L":
      return BUCKLING_CURVE_ALPHA.b;
    case "UPE":
    default:
      return BUCKLING_CURVE_ALPHA.c;
  }
}
