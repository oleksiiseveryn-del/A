/**
 * Fassade als parametrisches Bauteil.
 *
 * Aus wenigen Maßen – Feldbreiten, Geschosshöhen, Brüstungshöhe – entsteht
 * das vollständige Raster mit Pfosten, Riegeln und Feldern. Jedes Feld
 * bekommt eine Füllung (Glas oder Paneel); daraus folgen Nachweise, Mengen
 * und Kosten. Wird ein Maß geändert, wird alles neu gebildet – das ist
 * gemeint mit „parametrisch".
 *
 *   Raster       Pfosten, Riegel, Felder aus Feldbreiten und Geschosshöhen
 *   Wind         Geschwindigkeitsdruck und Außendruckbeiwerte nach
 *                DIN EN 1991-1-4 mit deutschem NA
 *   Glas         Plattenbeanspruchung nach der Kirchhoff'schen Plattentheorie,
 *                Nachweis nach DIN 18008
 *   Isolierglas  Lastaufteilung über den Isolierglasfaktor, Klimalasten
 *   Pfosten      Biegung und Durchbiegung, Auflagerkräfte an der Decke
 *   Riegel       Biegung aus Wind und aus dem Eigengewicht der Füllung
 *   Wärmeschutz  U-Wert der Vorhangfassade nach DIN EN ISO 12631
 *   Mengen       Profile, Glas, Paneele, Dichtungen, Anker, Kosten
 *
 * Rechenwege
 * ----------
 * WIND (DIN EN 1991-1-4 + NA)
 *   w_e = q_p(z) · c_pe.  q_p ist der vereinfachte Geschwindigkeitsdruck
 *   nach Windzone, Geländeart und Gebäudehöhe. Für Bauteile der
 *   Außenhaut gilt c_pe,1 bei Lasteinzugsflächen bis 1 m², c_pe,10 ab
 *   10 m², dazwischen logarithmisch:
 *       c_pe = c_pe,1 + (c_pe,10 − c_pe,1) · log₁₀(A)
 *   Maßgebend für die Fassade ist in aller Regel der Sog im Eckbereich
 *   (Bereich A), nicht der Druck in der Feldmitte.
 *
 * GLAS (Kirchhoff, Navier-Reihe)
 *   Allseitig linienförmig gelagerte Rechteckplatte unter Gleichlast:
 *       w(x,y) = Σ Σ  w_mn · sin(mπx/a) · sin(nπy/b)     (m, n ungerade)
 *       w_mn   = 16q / (π⁶ · D · m · n · ((m/a)² + (n/b)²)²)
 *       D      = E·t³ / (12·(1−ν²))
 *   Daraus in Plattenmitte
 *       M_x = (16q/π⁴) · Σ Σ [(m/a)² + ν(n/b)²] · s_m·s_n
 *                          / (m·n·((m/a)²+(n/b)²)²)
 *   mit s_m = (−1)^((m−1)/2). Die Randspannung folgt aus σ = 6·M/t².
 *   Gerechnet wird linear (kleine Durchbiegungen). Das liegt bei dünnen,
 *   stark durchgebogenen Scheiben auf der sicheren Seite: die
 *   Membranwirkung, die DIN 18008 in einer nichtlinearen Rechnung
 *   zulässt, verringert die Spannung, wird hier aber nicht angesetzt.
 *
 * WIDERSTAND (DIN 18008-1)
 *   nicht vorgespanntes Glas   R_d = k_mod · k_c · f_k / γ_M   (γ_M = 1,8)
 *   vorgespanntes Glas         R_d =         k_c · f_k / γ_M   (γ_M = 1,5)
 *   k_mod nach Lasteinwirkungsdauer: 0,25 ständig, 0,4 mittel (Klima),
 *   0,7 kurz (Wind). Bei vorgespanntem Glas entfällt k_mod.
 *
 *   Wirken Einwirkungen unterschiedlicher Dauer zusammen, bekommt jede den
 *   k_mod ihrer eigenen Dauer, und die Ausnutzungen werden aufsummiert
 *   (Verfahren nach DIN EN 16612):
 *       η = γ_Q · Σ_j  ψ_j · q_j · σ̂ / (k_mod,j · k_c · f_k / γ_M)   ≤ 1
 *   mit σ̂ als Spannung je Einheitslast. Sonst würde eine kurzzeitige
 *   Windlast mit dem k_mod einer mittelfristigen Klimalast bewertet – das
 *   liegt nicht auf der sicheren Seite, sondern ist schlicht falsch
 *   zugeordnet. Bei vorgespanntem Glas ist k_mod = 1, die Summe geht dann
 *   in die gewöhnliche Kombination über.
 *
 * VERBUNDGLAS
 *   Der Schubverbund der Zwischenschicht wird nicht angesetzt (sichere
 *   Seite, nach DIN 18008 zulässig). Ersatzdicken:
 *       Durchbiegung  t_ef,w = ∛(Σ t_i³)
 *       Spannung      t_ef,σ,i = √(t_ef,w³ / t_i)
 *
 * ISOLIERGLAS
 *   Das Gaspolster im Scheibenzwischenraum koppelt die Scheiben. Wie stark,
 *   folgt aus dem Verhältnis der Gassteifigkeit zur Plattensteifigkeit und
 *   wird hier aus derselben Reihe hergeleitet, mit der auch die Spannungen
 *   gerechnet werden – es ist kein angepasster Zahlenwert nötig:
 *
 *     mittlere Durchbiegung je Einheitsdruck
 *         w̄ = 64/(π⁸·D) · S,   S = ΣΣ 1/(m²n²((m/a)²+(n/b)²)²)
 *     Steifigkeitsverhältnis (isotherme Zustandsänderung des Gases)
 *         R = p_atm · (w̄₁ + w̄₂) / a_SZR
 *     Entkopplungsfaktor
 *         φ = 1 / (1 + R)
 *
 *   Anschaulich: Biegen sich die Scheiben leicht durch (großes Feld,
 *   R groß), gibt das Gaspolster nach – die Klimalast baut sich ab und die
 *   Scheiben teilen sich die äußere Last nach ihrer Steifigkeit. Bei einem
 *   kleinen, steifen Feld (R klein, φ → 1) kann das Volumen nicht
 *   ausweichen: die Klimalast wirkt voll, und die belastete Scheibe trägt
 *   den Wind allein.
 *
 *     äußere Last auf Scheibe 1   q₁ = q · [φ + (1 − φ) · t₁³/(t₁³+t₂³)]
 *     Klimalast je Scheibe        q_klima = φ · p₀
 *     p₀ = c₁·ΔT + c₂·Δp_met + c₃·ΔH   (isochorer Druck)
 *
 *   Bei drei und mehr Scheiben reicht diese geschlossene Form nicht: jeder
 *   Zwischenraum hat seinen eigenen Druck, und die mittlere Scheibe steht
 *   zwischen beiden. Gerechnet wird deshalb das Gleichungssystem der
 *   Zwischenraumdrücke p_j (isotherme Zustandsänderung, positiv = Überdruck):
 *
 *     w̄_i = c_i · (q_i + p_{i−1} − p_i)              c_i = 64·S/(π⁸·D_i)
 *     p_j = p₀_j − (p_atm/s_j) · (w̄_{j+1} − w̄_j)
 *
 *   Eingesetzt ergibt sich ein tridiagonales System in p_j, das gelöst wird;
 *   daraus folgt die Last auf jede einzelne Scheibe. Für zwei Scheiben geht
 *   es genau in die obige geschlossene Form über – das ist nachgerechnet.
 *
 *   Die geschlossene Form in DIN 18008-1, Anhang A hat denselben Aufbau –
 *   φ = 1/(1 + (a/a*)⁴) mit a* ∝ ⁴√(a_SZR·t₁³t₂³/(t₁³+t₂³)); die Rechnung
 *   gibt die gleichwertige Kennlänge a* mit aus, damit sie gegen die
 *   Systemunterlage und die Norm geprüft werden kann. Der Luftdruck p_atm
 *   und die Klimalastfälle sind Eingaben, keine festen Konstanten.
 *
 * PFOSTEN UND RIEGEL
 *   Einfeldträger: M = q·L²/8, f = 5·q·L⁴/(384·E·I).
 *   Der Pfosten spannt über die Geschosshöhe und trägt den Wind aus der
 *   halben Breite der beiden angrenzenden Felder. Der Riegel spannt über
 *   die Feldbreite, trägt den Wind aus der halben Höhe der beiden
 *   angrenzenden Felder und zusätzlich das Eigengewicht der auf ihm
 *   stehenden Füllung als Gleichlast.
 *   Spannungsnachweis  σ_Ed = M_Ed/W ≤ f_o/γ_M1.
 *   Durchbiegung: Richtwert der Fassadentechnik – L/200, höchstens 15 mm
 *   (bei L > 3 m L/300 + 5 mm), begrenzt durch den Randverbund des
 *   Isolierglases. Die Werte sind Eingaben, keine festen Konstanten.
 *
 * WÄRMESCHUTZ (DIN EN ISO 12631)
 *   U_cw = [Σ A_g·U_g + Σ A_p·U_p + Σ A_f·U_f + Σ l_g·Ψ_g + Σ l_p·Ψ_p]
 *          / [Σ A_g + Σ A_p + Σ A_f]
 *   Ψ ist der längenbezogene Wärmedurchgangskoeffizient des Randverbunds
 *   bzw. des Paneelrands; er hängt vom Abstandhalter und vom Profil ab
 *   und ist der Systemunterlage zu entnehmen.
 *
 * NICHT GEFÜHRT: absturzsichernde Verglasung nach DIN 18008-4 (der
 * Nachweis führt über den Pendelschlagversuch und ist rechnerisch hier
 * nicht zu ersetzen), begehbare und betretbare Verglasung (DIN 18008-6),
 * Überkopfverglasung mit Resttragfähigkeit (DIN 18008-2, Abs. 5.2),
 * Erdbeben, Anprall, Explosion, Einbruchhemmung (DIN EN 1627),
 * Schallschutz, Brandschutz und Brandsperren, Blitzschutz, Bauphysik der
 * Fuge (Tauwasser, DIN 4108-3), Verankerung im Rohbau (Betonanker nach
 * DIN EN 1992-4), Beschläge, Öffnungsflügel und ihre Lastabtragung,
 * Montagezustände, Toleranzen nach DIN 18202 und die Prüfungen nach
 * DIN EN 13830 (Luftdurchlässigkeit, Schlagregendichtheit, Windwiderstand).
 * Die Profilkennwerte sind Richtwerte einer Regelserie; maßgebend ist die
 * Systemunterlage des gewählten Herstellers.
 */

/* ------------------------------------------------------------ Grundwerte */

/** Fassadenarten. */
const FASSADEN_ARTEN = {
  pfostenriegel: {
    name: "Pfosten-Riegel-Fassade",
    kurz: "PR",
    beschreibung: "Auf der Baustelle aus Pfosten, Riegeln und Füllungen gefügt; "
      + "Dichtebene außen über Dichtung und Andruckleiste.",
    doppelpfosten: false,
  },
  element: {
    name: "Elementfassade",
    kurz: "EL",
    beschreibung: "Im Werk fertig verglaste Elemente, geschosshoch, an der Decke "
      + "eingehängt; die Stöße sind als Doppelpfosten und Doppelriegel ausgebildet.",
    doppelpfosten: true,
  },
  vhf: {
    name: "Vorgehängte hinterlüftete Fassade",
    kurz: "VHF",
    beschreibung: "Bekleidung auf einer Unterkonstruktion mit Hinterlüftungsebene "
      + "und Dämmung vor dem tragenden Untergrund.",
    doppelpfosten: false,
  },
};

/**
 * Glaserzeugnisse: charakteristische Biegefestigkeit und
 * Teilsicherheitsbeiwert nach DIN 18008-1.
 *
 * `vorgespannt` entscheidet, ob k_mod angesetzt wird: bei vorgespanntem
 * Glas nicht, weil die Vorspannung nicht von der Lastdauer abhängt.
 */
const GLASARTEN = {
  float: { name: "Floatglas (Spiegelglas)", kurz: "FLOAT", fk: 45, gammaM: 1.8, vorgespannt: false },
  tvg: { name: "Teilvorgespanntes Glas (TVG)", kurz: "TVG", fk: 70, gammaM: 1.5, vorgespannt: true },
  esg: { name: "Einscheibensicherheitsglas (ESG)", kurz: "ESG", fk: 120, gammaM: 1.5, vorgespannt: true },
  esgEmail: { name: "ESG emailliert", kurz: "ESG-E", fk: 75, gammaM: 1.5, vorgespannt: true },
  tvgEmail: { name: "TVG emailliert", kurz: "TVG-E", fk: 45, gammaM: 1.5, vorgespannt: true },
};

/** Modifikationsbeiwert k_mod nach Einwirkungsdauer (DIN 18008-1). */
const K_MOD = { staendig: 0.25, mittel: 0.40, kurz: 0.70 };

/**
 * Regelaufbauten. `scheiben` sind die Einzelscheiben von außen nach innen;
 * eine Scheibe kann selbst aus mehreren Lagen bestehen (Verbundglas).
 * Ug und g sind Herstellerangaben und hier als Richtwerte eingetragen.
 */
const GLASAUFBAUTEN = {
  iso2: {
    name: "2-fach Isolierglas 6/16/6",
    scheiben: [{ lagen: [6], art: "esg" }, { lagen: [6], art: "float" }],
    szr: [16], ug: 1.1, g: 0.60,
  },
  iso2vsg: {
    name: "2-fach Isolierglas 8/16/VSG 2×6",
    scheiben: [{ lagen: [8], art: "esg" }, { lagen: [6, 6], art: "tvg" }],
    szr: [16], ug: 1.1, g: 0.58,
  },
  iso3: {
    name: "3-fach Isolierglas 6/14/4/14/6",
    scheiben: [{ lagen: [6], art: "esg" }, { lagen: [4], art: "float" }, { lagen: [6], art: "float" }],
    szr: [14, 14], ug: 0.6, g: 0.50,
  },
  iso3vsg: {
    name: "3-fach Isolierglas 8/14/4/14/VSG 2×6",
    scheiben: [{ lagen: [8], art: "esg" }, { lagen: [4], art: "float" }, { lagen: [6, 6], art: "tvg" }],
    szr: [14, 14], ug: 0.6, g: 0.48,
  },
  iso2schwer: {
    name: "2-fach Isolierglas 10/16/VSG 2×8",
    scheiben: [{ lagen: [10], art: "esg" }, { lagen: [8, 8], art: "tvg" }],
    szr: [16], ug: 1.1, g: 0.55,
  },
  iso3schwer: {
    name: "3-fach Isolierglas 12/16/6/16/VSG 2×8",
    scheiben: [{ lagen: [12], art: "esg" }, { lagen: [6], art: "float" },
      { lagen: [8, 8], art: "tvg" }],
    szr: [16, 16], ug: 0.5, g: 0.45,
  },
  vsg: {
    name: "Einfachverglasung VSG 2×8",
    scheiben: [{ lagen: [8, 8], art: "tvg" }],
    szr: [], ug: 5.4, g: 0.75,
  },
  esg10: {
    name: "Einfachverglasung ESG 10",
    scheiben: [{ lagen: [10], art: "esg" }],
    szr: [], ug: 5.6, g: 0.82,
  },
};

/**
 * Paneele und Bekleidungen. `rohdichte` in kg/m³, `lambda` in W/(m·K).
 * Der U-Wert des Paneels wird aus Dicke und Lambda mit den
 * Wärmeübergangswiderständen 0,13 innen und 0,04 außen gerechnet;
 * Sandwichpaneele bringen ihren U-Wert als Herstellerangabe mit.
 */
const PANEELE = {
  sandwich: { name: "Sandwichpaneel mit Mineralwolle", dicke: 0.100, rohdichte: 130, u: 0.38 },
  faserzement: { name: "Faserzementplatte", dicke: 0.008, rohdichte: 1800, lambda: 0.35 },
  aluverbund: { name: "Aluminium-Verbundplatte", dicke: 0.004, rohdichte: 1900, lambda: 0.50 },
  hpl: { name: "HPL-Schichtstoffplatte", dicke: 0.008, rohdichte: 1400, lambda: 0.30 },
  naturstein: { name: "Naturwerkstein", dicke: 0.030, rohdichte: 2700, lambda: 2.80 },
  glaspaneel: { name: "Emailliertes Glaspaneel mit Dämmung", dicke: 0.080, rohdichte: 400, u: 0.45 },
};

/**
 * Profilserie für Pfosten und Riegel (Aluminium, thermisch getrennt).
 *
 * RICHTWERTE einer Regelserie, damit gerechnet werden kann, bevor das
 * System feststeht. Widerstandsmoment W_y, Trägheitsmoment I_y, Fläche A,
 * Masse je Meter und der Profil-U-Wert U_f sind der Systemunterlage des
 * Herstellers zu entnehmen und in der Tabelle zu überschreiben.
 *
 * y ist die starke Achse (Biegung aus Wind, quer zur Fassade), z die
 * schwache (Biegung in der Fassadenebene aus dem Gewicht der Füllung).
 * W_z und I_z sind aus der Umrissgeometrie eines dünnwandigen
 * Rechteckrohrs b × h abgeleitet – I_z/I_y = b²(3h+b) / (h²(3b+h)) –
 * und damit in sich stimmig; ein Riegel ist in der Fassadenebene
 * deutlich weicher als quer dazu, und das entscheidet oft über die
 * Bautiefe. Für den Nachweis zählen die Werte des gewählten Systems.
 */
const FASSADENPROFILE = {
  // Pfosten (senkrecht, Ansichtsbreite × Bautiefe)
  "PR 50/85": { name: "Pfosten 50/85", ansicht: 50, bautiefe: 85, Wy: 26.4, Iy: 112, Wz: 20.2, Iz: 50.3, A: 12.6, masse: 3.40, uf: 1.9 },
  "PR 50/125": { name: "Pfosten 50/125", ansicht: 50, bautiefe: 125, Wy: 47.8, Iy: 299, Wz: 29.5, Iz: 73.9, A: 15.9, masse: 4.30, uf: 1.7 },
  "PR 50/165": { name: "Pfosten 50/165", ansicht: 50, bautiefe: 165, Wy: 73.5, Iy: 606, Wz: 38.5, Iz: 96.3, A: 19.4, masse: 5.25, uf: 1.6 },
  "PR 50/205": { name: "Pfosten 50/205", ansicht: 50, bautiefe: 205, Wy: 103, Iy: 1056, Wz: 47.1, Iz: 117.7, A: 23.0, masse: 6.20, uf: 1.5 },
  "PR 50/250": { name: "Pfosten 50/250", ansicht: 50, bautiefe: 250, Wy: 139, Iy: 1738, Wz: 55.6, Iz: 139.0, A: 27.2, masse: 7.35, uf: 1.5 },
  "PR 60/165": { name: "Pfosten 60/165", ansicht: 60, bautiefe: 165, Wy: 84.9, Iy: 700, Wz: 49.7, Iz: 148.9, A: 22.1, masse: 5.95, uf: 1.6 },
  "PR 60/205": { name: "Pfosten 60/205", ansicht: 60, bautiefe: 205, Wy: 119, Iy: 1230, Wz: 61.1, Iz: 184.7, A: 25.8, masse: 6.95, uf: 1.5 },
  "PR 80/205": { name: "Pfosten 80/205", ansicht: 80, bautiefe: 205, Wy: 152, Iy: 1560, Wz: 92.6, Iz: 371.0, A: 31.4, masse: 8.50, uf: 1.7 },
  // Riegel (waagerecht)
  "RI 50/60": { name: "Riegel 50/60", ansicht: 50, bautiefe: 60, Wy: 14.1, Iy: 42.3, Wz: 12.9, Iz: 32.2, A: 9.8, masse: 2.65, uf: 2.1 },
  "RI 50/85": { name: "Riegel 50/85", ansicht: 50, bautiefe: 85, Wy: 24.6, Iy: 105, Wz: 18.8, Iz: 47.2, A: 11.9, masse: 3.20, uf: 2.0 },
  "RI 50/125": { name: "Riegel 50/125", ansicht: 50, bautiefe: 125, Wy: 44.2, Iy: 276, Wz: 27.3, Iz: 68.2, A: 14.8, masse: 4.00, uf: 1.8 },
  "RI 60/125": { name: "Riegel 60/125", ansicht: 60, bautiefe: 125, Wy: 53.8, Iy: 336, Wz: 36.8, Iz: 110.4, A: 16.9, masse: 4.55, uf: 1.8 },
  "RI 60/165": { name: "Riegel 60/165", ansicht: 60, bautiefe: 165, Wy: 88.0, Iy: 726, Wz: 51.5, Iz: 154.4, A: 20.6, masse: 5.55, uf: 1.7 },
  "RI 80/165": { name: "Riegel 80/165", ansicht: 80, bautiefe: 165, Wy: 112, Iy: 924, Wz: 77.1, Iz: 308.4, A: 25.1, masse: 6.80, uf: 1.8 },
};


/** Aluminiumlegierungen nach DIN EN 1999-1-1, Tab. 3.2b (Richtwerte). */
const ALU_LEGIERUNGEN = {
  "6060 T66": { name: "EN AW-6060 T66", fo: 150, fu: 195 },
  "6063 T66": { name: "EN AW-6063 T66", fo: 160, fu: 195 },
  "6060 T6": { name: "EN AW-6060 T6", fo: 140, fu: 170 },
  "6082 T6": { name: "EN AW-6082 T6", fo: 250, fu: 290 },
};

/**
 * Vereinfachte Geschwindigkeitsdrücke q_p in kN/m² nach
 * DIN EN 1991-1-4/NA für Bauwerke bis 25 m Höhe.
 *
 * Reihenfolge je Zone: bis 10 m, über 10 bis 18 m, über 18 bis 25 m.
 * Für höhere Bauwerke ist q_p(z) nach dem Regelverfahren zu bestimmen –
 * die Anwendung meldet das und rechnet nicht weiter.
 */
const WINDZONEN = {
  1: { name: "Windzone 1 (Binnenland)", vb: 22.5, binnenland: [0.50, 0.65, 0.75], kueste: null },
  2: { name: "Windzone 2", vb: 25.0, binnenland: [0.65, 0.80, 0.90], kueste: [0.85, 1.00, 1.10] },
  3: { name: "Windzone 3", vb: 27.5, binnenland: [0.80, 0.95, 1.10], kueste: [1.05, 1.20, 1.30] },
  4: { name: "Windzone 4", vb: 30.0, binnenland: [0.95, 1.15, 1.30], kueste: [1.25, 1.40, 1.55] },
};

/**
 * Außendruckbeiwerte für vertikale Wände nach DIN EN 1991-1-4, Tab. 7.1.
 * Bereich A ist der Eckbereich, D die angeströmte, E die abgewandte Wand.
 * Die Werte für Druck (D) und Sog auf der Rückseite (E) hängen von h/d ab.
 */
const CPE_WAND = {
  A: { cpe1: -1.4, cpe10: -1.2, name: "Eckbereich A (Sog)" },
  B: { cpe1: -1.1, cpe10: -0.8, name: "Bereich B (Sog)" },
  C: { cpe1: -0.5, cpe10: -0.5, name: "Bereich C (Sog)" },
  D: { cpe1: 1.0, cpe10: 0.8, name: "Bereich D (Druck, angeströmt)" },
  E: { cpe1: -0.5, cpe10: -0.5, name: "Bereich E (Sog, abgewandt)" },
};

/** Vorgaben, alle in der Oberfläche überschreibbar. */
const FASSADEN_VORGABEN = {
  // Wind
  windzone: 2, gelaende: "binnenland", gebaeudehoehe: 18, druckbereich: "A",
  cpiPlus: 0.2, cpiMinus: -0.3,       // Innendruckbeiwerte (EN 1991-1-4, 7.2.9)
  gammaQ: 1.5,                        // Teilsicherheitsbeiwert veränderliche Einwirkung
  gammaG: 1.35,                       // Teilsicherheitsbeiwert ständige Einwirkung
  // Glas
  kc: 1.0,                            // Konstruktionsbeiwert DIN 18008-1
  nu: 0.23, eGlas: 70000, rhoGlas: 2500,
  klimaSommer: { dT: 20, dPmet: -2.0, dH: 600 },
  klimaWinter: { dT: -25, dPmet: 4.0, dH: -300 },
  klimaC1: 0.34, klimaC2: -1.0, klimaC3: 0.012,
  pAtm: 0.1,                          // Luftdruck [N/mm²] für die Kopplung im SZR
  psi0Wind: 0.6,                      // Kombinationsbeiwert Wind
  psi0Klima: 0.6,                     // Kombinationsbeiwert Klimalast
  glasDurchbiegung: 100,              // zulässig L/… (Richtwert der Praxis)
  // Profile
  legierung: "6060 T66", gammaM1: 1.10, eAlu: 70000,
  pfostenDurchbiegung: 200, pfostenGrenze: 15,   // L/… und mm, quer zur Fassade
  riegelDurchbiegung: 200, riegelGrenze: 15,
  // Riegel in der Fassadenebene unter dem Gewicht der Füllung: hier
  // entscheidet der Randverbund des Isolierglases, nicht die Spannung
  riegelGlasDurchbiegung: 500, riegelGlasGrenze: 3,
  // Wärmeschutz
  psiGlasrand: 0.08, psiPaneelrand: 0.08, rsi: 0.13, rse: 0.04,
  // Mengen und Kosten
  aluPreis: 14.5,       // €/kg Profil, beschichtet
  glasPreis: 145,       // €/m²
  paneelPreis: 120,     // €/m²
  dichtungPreis: 6.5,   // €/m
  ankerPreis: 48,       // €/Stück einschließlich Befestigung
  montagePreis: 95,     // €/m² Fassadenfläche
  transportPreis: 18,   // €/m²
  lagerPreis: 4.5,      // €/m²
  bearbeitungPreis: 22, // €/m² Zuschnitt, Ausklinken, Bohren
};

/** Zahl mit Dezimalkomma. */
function fasZahl(wert, stellen) {
  if (!Number.isFinite(wert)) return "–";
  return Number(wert).toFixed(stellen === undefined ? 2 : stellen).replace(".", ",");
}

/* ------------------------------------------------------------------ Wind */

/**
 * Geschwindigkeitsdruck q_p nach dem vereinfachten Verfahren.
 *
 * Über 25 m Gebäudehöhe gilt das Verfahren nicht mehr; dann ist q_p(z)
 * nach dem Regelverfahren zu bestimmen. Das wird gemeldet, nicht
 * stillschweigend fortgerechnet.
 */
function windGeschwindigkeitsdruck(zone, gelaende, hoehe) {
  const z = WINDZONEN[zone];
  if (!z) return { qp: null, meldung: `Windzone ${zone} ist nicht bekannt.` };
  const reihe = gelaende === "kueste" ? z.kueste : z.binnenland;
  if (!reihe) {
    return { qp: null, meldung: `Für ${z.name} ist keine Küstenzeile angegeben – `
      + "Windzone 1 liegt im Binnenland." };
  }
  if (hoehe > 25) {
    return { qp: null, hoehe,
      meldung: `Gebäudehöhe ${fasZahl(hoehe, 1)} m über 25 m: Das vereinfachte Verfahren `
        + "nach DIN EN 1991-1-4/NA gilt nicht mehr. Der Geschwindigkeitsdruck q_p(z) ist "
        + "nach dem Regelverfahren zu bestimmen und als Wert einzutragen." };
  }
  const stufe = hoehe <= 10 ? 0 : (hoehe <= 18 ? 1 : 2);
  const grenze = ["bis 10 m", "über 10 bis 18 m", "über 18 bis 25 m"][stufe];
  return {
    qp: reihe[stufe], zone: z, stufe, grenze, gelaende, hoehe,
    meldung: null,
    herkunft: `${z.name}, ${gelaende === "kueste" ? "Küste und Inseln der Ostsee" : "Binnenland"}, `
      + `Höhe ${grenze}: q_p = ${fasZahl(reihe[stufe])} kN/m²`,
  };
}

/**
 * Außendruckbeiwert für eine Lasteinzugsfläche.
 *
 * EN 1991-1-4, 7.2.1(1): bis 1 m² gilt c_pe,1, ab 10 m² c_pe,10,
 * dazwischen wird über den Logarithmus der Fläche interpoliert.
 */
function cpeFlaeche(bereich, flaeche) {
  const b = CPE_WAND[bereich] || CPE_WAND.A;
  const a = Math.max(0.01, flaeche);
  if (a <= 1) return b.cpe1;
  if (a >= 10) return b.cpe10;
  return b.cpe1 + (b.cpe10 - b.cpe1) * Math.log10(a);
}

/**
 * Windlast auf ein Fassadenfeld.
 *
 * Bemessungswert ist der größere Betrag aus Sog außen mit Druck innen und
 * Druck außen mit Sog innen. Für die Fassade ist der Sog im Eckbereich in
 * aller Regel maßgebend.
 */
function windlastFeld(flaeche, vorgaben) {
  const v = Object.assign({}, FASSADEN_VORGABEN, vorgaben || {});
  const q = windGeschwindigkeitsdruck(v.windzone, v.gelaende, v.gebaeudehoehe);
  if (q.qp === null) return { qp: null, meldung: q.meldung };
  const cpe = cpeFlaeche(v.druckbereich, flaeche);
  // Innendruck wirkt der Außenwirkung entgegen und vergrößert sie damit
  const cpi = cpe < 0 ? v.cpiPlus : v.cpiMinus;
  const we = q.qp * cpe;
  const wi = q.qp * cpi;
  const wk = we - wi;                            // charakteristisch, kN/m²
  return {
    qp: q.qp, herkunft: q.herkunft, cpe, cpi, we, wi,
    wk, betrag: Math.abs(wk), sog: wk < 0,
    wd: Math.abs(wk) * v.gammaQ,
    bereich: (CPE_WAND[v.druckbereich] || CPE_WAND.A).name,
    flaeche,
  };
}

/* ------------------------------------------------------------------- Glas */

/**
 * Biegemoment und Durchbiegung einer allseitig gelenkig gelagerten
 * Rechteckplatte unter Gleichlast (Navier-Reihe, Kirchhoff).
 *
 * @param {number} a - Seite in x [mm]
 * @param {number} b - Seite in y [mm]
 * @param {number} q - Flächenlast [N/mm²]
 * @param {number} nu - Querdehnzahl
 * @param {number} D - Plattensteifigkeit [N·mm]; für die Momente ohne Belang
 * @returns {{mx, my, w}} Momente [N·mm/mm] und Durchbiegung [mm] in Plattenmitte
 */
function plattenReihe(a, b, q, nu, D, glieder) {
  const N = glieder || 61;                       // ungerade Glieder je Richtung
  let mx = 0, my = 0, w = 0;
  for (let m = 1; m <= N; m += 2) {
    const sm = ((m - 1) / 2) % 2 === 0 ? 1 : -1;
    for (let n = 1; n <= N; n += 2) {
      const sn = ((n - 1) / 2) % 2 === 0 ? 1 : -1;
      const ka = m / a, kb = n / b;
      const nenner = m * n * Math.pow(ka * ka + kb * kb, 2);
      const vz = sm * sn;
      mx += (ka * ka + nu * kb * kb) * vz / nenner;
      my += (kb * kb + nu * ka * ka) * vz / nenner;
      w += vz / nenner;
    }
  }
  const f = 16 * q / Math.pow(Math.PI, 4);
  return {
    mx: f * mx,
    my: f * my,
    w: D > 0 ? (16 * q / (Math.pow(Math.PI, 6) * D)) * w : 0,
  };
}

/**
 * Ersatzdicken einer Verbundglasscheibe ohne Ansatz des Schubverbunds.
 *
 * t_ef,w = ∛(Σ t_i³) für die Durchbiegung,
 * t_ef,σ,i = √(t_ef,w³ / t_i) für die Spannung in der Lage i.
 * Bei einer einzelnen Lage ergibt sich in beiden Fällen die Dicke selbst.
 */
function glasErsatzdicke(lagen) {
  const summe = lagen.reduce((s, t) => s + t * t * t, 0);
  const tw = Math.cbrt(summe);
  return {
    tw,
    tSigma: lagen.map((t) => Math.sqrt((tw * tw * tw) / t)),
    dickeGesamt: lagen.reduce((s, t) => s + t, 0),
  };
}

/**
 * Volumenbeiwert der Platte: S = ΣΣ 1/(m²n²((m/a)²+(n/b)²)²).
 *
 * Damit ist die mittlere Durchbiegung je Einheitsdruck w̄ = 64·S/(π⁸·D) –
 * also das Volumen, das eine Scheibe unter Druck freigibt. Die Reihe ist
 * dieselbe wie beim Spannungsnachweis, nur über die Fläche gemittelt.
 */
function plattenVolumenbeiwert(a, b, glieder) {
  const N = glieder || 61;
  let s = 0;
  for (let m = 1; m <= N; m += 2) {
    for (let n = 1; n <= N; n += 2) {
      const ka = m / a, kb = n / b;
      s += 1 / (m * m * n * n * Math.pow(ka * ka + kb * kb, 2));
    }
  }
  return s;
}

/**
 * Kopplung zweier Scheiben über das Gaspolster.
 *
 * φ = 1/(1+R) mit R = p_atm · (w̄₁ + w̄₂) / a_SZR. φ ist der Anteil der
 * Klimalast, der tatsächlich ankommt, und zugleich der Anteil der äußeren
 * Last, den die belastete Scheibe zusätzlich zur Steifigkeitsaufteilung
 * allein trägt. Ausgegeben wird auch die gleichwertige Kennlänge
 * a* = a/⁴√R, die mit der geschlossenen Form der DIN 18008-1, Anhang A
 * verglichen werden kann.
 *
 * @param {number} a - Feldseite in x [mm]
 * @param {number} b - Feldseite in y [mm]
 * @param {number} szr - Scheibenzwischenraum [mm]
 * @param {number} t1 - Ersatzdicke der äußeren Scheibe [mm]
 * @param {number} t2 - Ersatzdicke der inneren Scheibe [mm]
 */
function isolierglasKopplung(a, b, szr, t1, t2, vorgaben) {
  const v = Object.assign({}, FASSADEN_VORGABEN, vorgaben || {});
  if (!szr || szr <= 0 || !t2) {
    return { phi: 1, R: 0, aStern: null, gekoppelt: false };
  }
  const S = plattenVolumenbeiwert(a, b);
  const steif = (t) => (v.eGlas * Math.pow(t, 3)) / (12 * (1 - v.nu * v.nu));
  // mittlere Durchbiegung je Einheitsdruck, beide Scheiben zusammen
  const wQuer = ((64 * S) / Math.pow(Math.PI, 8)) * (1 / steif(t1) + 1 / steif(t2));
  const R = (v.pAtm * wQuer) / szr;
  return {
    phi: 1 / (1 + R), R, S, wQuer,
    aStern: R > 0 ? Math.min(a, b) / Math.pow(R, 0.25) : null,
    gekoppelt: true,
  };
}

/**
 * Lastaufteilung im Mehrscheiben-Isolierglas.
 *
 * Gelöst wird das Gleichungssystem der Zwischenraumdrücke. Zurück kommt
 * die Last, die auf jeder einzelnen Scheibe ankommt – positiv in Richtung
 * der äußeren Last.
 *
 * @param {Array<number>} c - Nachgiebigkeit je Scheibe: mittlere
 *        Durchbiegung je Einheitsdruck [mm/(N/mm²)]
 * @param {Array<number>} szr - Zwischenraumbreiten [mm], Länge n−1
 * @param {number} q - äußere Flächenlast auf die erste Scheibe
 * @param {Array<number>} p0 - isochore Klimadrücke je Zwischenraum
 * @param {number} pAtm - Luftdruck in denselben Einheiten wie q und p0
 * @returns {{lasten: Array<number>, druecke: Array<number>}}
 */
function isolierglasLasten(c, szr, q, p0, pAtm) {
  const n = c.length;
  if (n === 1) return { lasten: [q], druecke: [] };
  const m = n - 1;
  // A · p = r, A tridiagonal
  const A = [], r = [];
  for (let j = 0; j < m; j++) {
    A.push(new Array(m).fill(0));
    const gamma = pAtm / szr[j];
    A[j][j] = 1 + gamma * (c[j + 1] + c[j]);
    if (j > 0) A[j][j - 1] = -gamma * c[j];
    if (j < m - 1) A[j][j + 1] = -gamma * c[j + 1];
    // äußere Last steht nur auf der ersten Scheibe
    const qj = j === 0 ? q : 0;
    r.push((p0[j] || 0) + gamma * qj * c[j]);
  }
  // Gauß mit Spaltenpivotierung; m ist klein (1 bis 3)
  for (let k = 0; k < m; k++) {
    let max = k;
    for (let i = k + 1; i < m; i++) if (Math.abs(A[i][k]) > Math.abs(A[max][k])) max = i;
    if (max !== k) { const t = A[k]; A[k] = A[max]; A[max] = t; const u = r[k]; r[k] = r[max]; r[max] = u; }
    if (Math.abs(A[k][k]) < 1e-14) continue;
    for (let i = k + 1; i < m; i++) {
      const f = A[i][k] / A[k][k];
      for (let j2 = k; j2 < m; j2++) A[i][j2] -= f * A[k][j2];
      r[i] -= f * r[k];
    }
  }
  const p = new Array(m).fill(0);
  for (let i = m - 1; i >= 0; i--) {
    let sum = r[i];
    for (let j2 = i + 1; j2 < m; j2++) sum -= A[i][j2] * p[j2];
    p[i] = Math.abs(A[i][i]) > 1e-14 ? sum / A[i][i] : 0;
  }
  const lasten = [];
  for (let i = 0; i < n; i++) {
    const vor = i > 0 ? p[i - 1] : 0;
    const nach = i < m ? p[i] : 0;
    lasten.push((i === 0 ? q : 0) + vor - nach);
  }
  return { lasten, druecke: p };
}

/** Isochorer Klimadruck p₀ nach DIN 18008-1, Anhang A. */
function klimadruck(fall, vorgaben) {
  const v = Object.assign({}, FASSADEN_VORGABEN, vorgaben || {});
  return v.klimaC1 * fall.dT + v.klimaC2 * fall.dPmet + v.klimaC3 * fall.dH;
}

/**
 * Nachweis einer Verglasung im Feld.
 *
 * Geführt wird die äußere und die innere Scheibe getrennt: Die äußere
 * trägt den Wind zuerst und gibt über das Gaspolster einen Teil weiter;
 * die Klimalast wirkt auf beide.
 *
 * @param {Object} feld - { breite, hoehe } in m
 * @param {Object} aufbau - Eintrag aus GLASAUFBAUTEN
 * @param {Object} wind - Ergebnis von windlastFeld
 */
function glasNachweis(feld, aufbau, wind, vorgaben) {
  const v = Object.assign({}, FASSADEN_VORGABEN, vorgaben || {});
  const a = Math.min(feld.breite, feld.hoehe) * 1000;   // kürzere Seite [mm]
  const b = Math.max(feld.breite, feld.hoehe) * 1000;
  const scheiben = aufbau.scheiben.map((sc) => {
    const e = glasErsatzdicke(sc.lagen);
    return { lagen: sc.lagen, art: sc.art, glas: GLASARTEN[sc.art] || GLASARTEN.float, ersatz: e };
  });
  const n = scheiben.length;
  const szr = (aufbau.szr || []).slice(0, Math.max(0, n - 1));
  while (szr.length < n - 1) szr.push(16);

  // Nachgiebigkeit jeder Scheibe: mittlere Durchbiegung je Einheitsdruck
  const S = plattenVolumenbeiwert(a, b);
  const steif = (t) => (v.eGlas * Math.pow(t, 3)) / (12 * (1 - v.nu * v.nu));
  const c = scheiben.map((sc) => ((64 * S) / Math.pow(Math.PI, 8)) / steif(sc.ersatz.tw));

  // Kennwerte der Kopplung (für zwei Scheiben die geschlossene Form)
  const kopplung = n < 2
    ? { phi: 1, R: 0, aStern: null, gekoppelt: false }
    : isolierglasKopplung(a, b, szr[0], scheiben[0].ersatz.tw,
      n === 2 ? scheiben[1].ersatz.tw
        : Math.cbrt(scheiben.slice(1).reduce((s2, sc) => s2 + Math.pow(sc.ersatz.tw, 3), 0)), v);

  // Einheitslastfälle: Wind allein, Klima Sommer allein, Klima Winter allein.
  // Das System ist linear, deshalb dürfen sie überlagert werden.
  const pAtm = v.pAtm;
  const p0Sommer = klimadruck(v.klimaSommer, v);
  const p0Winter = klimadruck(v.klimaWinter, v);
  const nullen = new Array(Math.max(0, n - 1)).fill(0);
  const eWind = isolierglasLasten(c, szr, 1, nullen, pAtm);
  const eSommer = isolierglasLasten(c, szr, 0,
    nullen.map(() => p0Sommer / 1000), pAtm);       // kN/m² → N/mm²
  const eWinter = isolierglasLasten(c, szr, 0,
    nullen.map(() => p0Winter / 1000), pAtm);
  // zurück in kN/m² für die Lastfälle
  const lastSommer = eSommer.lasten.map((x) => x * 1000);
  const lastWinter = eWinter.lasten.map((x) => x * 1000);

  const wk = wind && wind.qp !== null ? Math.abs(wind.wk) : 0;

  /* Bemessungssituationen nach DIN EN 1990: einmal Wind als
     Leiteinwirkung mit der Klimalast als Begleiteinwirkung, einmal
     umgekehrt. Jede Einwirkung wird mit dem k_mod ihrer eigenen Dauer
     bewertet, die Ausnutzungen werden aufsummiert. */
  const faelle = [
    { name: "Wind Leit + Klima Sommer",
      teile: (i) => [{ q: wk * eWind.lasten[i], dauer: "kurz", was: "Wind" },
        { q: v.psi0Klima * lastSommer[i], dauer: "mittel", was: "Klima Sommer" }] },
    { name: "Wind Leit + Klima Winter",
      teile: (i) => [{ q: wk * eWind.lasten[i], dauer: "kurz", was: "Wind" },
        { q: v.psi0Klima * lastWinter[i], dauer: "mittel", was: "Klima Winter" }] },
    { name: "Klima Sommer Leit + Wind",
      teile: (i) => [{ q: lastSommer[i], dauer: "mittel", was: "Klima Sommer" },
        { q: v.psi0Wind * wk * eWind.lasten[i], dauer: "kurz", was: "Wind" }] },
    { name: "Klima Winter Leit + Wind",
      teile: (i) => [{ q: lastWinter[i], dauer: "mittel", was: "Klima Winter" },
        { q: v.psi0Wind * wk * eWind.lasten[i], dauer: "kurz", was: "Wind" }] },
  ];

  const zeilen = [];
  scheiben.forEach((sc, i) => {
    const lage = i === 0 ? "außen" : (i === n - 1 && n > 1 ? "innen" : "mittig");
    const glas = sc.glas;
    const D = (v.eGlas * Math.pow(sc.ersatz.tw, 3)) / (12 * (1 - v.nu * v.nu));
    const tSig = Math.min(...sc.ersatz.tSigma);
    // Spannung und Durchbiegung je Einheitslast: die Platte ist linear,
    // deshalb reicht ein Durchlauf der Reihe je Scheibe
    const eins = plattenReihe(a, b, 1 / 1000, v.nu, D);          // je kN/m²
    const sigmaEinheit = (6 * Math.max(Math.abs(eins.mx), Math.abs(eins.my)))
      / (tSig * tSig);
    const wEinheit = eins.w;
    const rdVon = (dauer) => ((glas.vorgespannt ? 1 : K_MOD[dauer]) * v.kc * glas.fk)
      / glas.gammaM;
    let best = null;
    faelle.forEach((f) => {
      const teile = f.teile(i).filter((t) => Math.abs(t.q) > 1e-9);
      if (!teile.length) return;
      // gleichgerichtet überlagern: die Beträge summieren sich auf der
      // sicheren Seite, weil Wind und Klimalast beide in beide Richtungen
      // wirken können
      const eta = v.gammaQ * teile.reduce((s2, t) =>
        s2 + (Math.abs(t.q) * sigmaEinheit) / rdVon(t.dauer), 0);
      const qk = teile.reduce((s2, t) => s2 + Math.abs(t.q), 0);
      const sigma = v.gammaQ * qk * sigmaEinheit;
      const wZul = a / v.glasDurchbiegung;
      const durchbiegung = qk * wEinheit;
      const kandidat = { fall: f.name, qk, qd: qk * v.gammaQ, sigma, eta,
        anteile: teile.map((t) => ({ was: t.was, q: Math.abs(t.q), dauer: t.dauer,
          kmod: glas.vorgespannt ? 1 : K_MOD[t.dauer], rd: rdVon(t.dauer),
          eta: (v.gammaQ * Math.abs(t.q) * sigmaEinheit) / rdVon(t.dauer) })),
        rd: rdVon(teile[0].dauer), kmod: glas.vorgespannt ? 1 : K_MOD[teile[0].dauer],
        durchbiegung, wZul, etaW: durchbiegung / wZul, tSigma: tSig };
      if (!best || kandidat.eta > best.eta) best = kandidat;
    });
    zeilen.push({
      nr: i + 1, lage, art: glas.name, kurz: glas.kurz,
      lagen: sc.lagen, ersatz: sc.ersatz,
      anteilWind: eWind.lasten[i],
      klimaSommer: lastSommer[i], klimaWinter: lastWinter[i],
      ergebnis: best,
      erfuellt: best ? best.eta <= 1.0 && best.etaW <= 1.0 : true,
    });
  });

  const massgebend = zeilen.reduce((s2, z) =>
    (z.ergebnis && (!s2 || z.ergebnis.eta > s2.ergebnis.eta)) ? z : s2, null);
  const massgebendW = zeilen.reduce((s2, z) =>
    (z.ergebnis && (!s2 || z.ergebnis.etaW > s2.ergebnis.etaW)) ? z : s2, null);

  return {
    a, b, seitenverhaeltnis: b / a,
    scheiben: zeilen, kopplung, phi: kopplung.phi, szr,
    p0Sommer, p0Winter,
    anteilAussen: eWind.lasten[0],
    anteilInnen: n > 1 ? eWind.lasten[n - 1] : 0,
    druecke: eWind.druecke,
    massgebend, massgebendW,
    eta: massgebend && massgebend.ergebnis ? massgebend.ergebnis.eta : 0,
    etaW: massgebendW && massgebendW.ergebnis ? massgebendW.ergebnis.etaW : 0,
    erfuellt: zeilen.every((z) => z.erfuellt),
    gewicht: aufbau.scheiben.reduce((s2, sc) =>
      s2 + sc.lagen.reduce((t, d) => t + d, 0), 0) * v.rhoGlas / 1000,   // kg/m²
  };
}

/* --------------------------------------------------------- Profilnachweis */

/**
 * Einfeldträger unter Gleichlast: Moment, Durchbiegung, Auflagerkraft.
 *
 * @param {number} q - Gleichlast [kN/m]
 * @param {number} L - Stützweite [m]
 * @param {number} EI - Biegesteifigkeit [kN·m²]
 */
function einfeldtraeger(q, L, EI) {
  return {
    M: (q * L * L) / 8,
    A: (q * L) / 2,
    f: EI > 0 ? (5 * q * Math.pow(L, 4)) / (384 * EI) * 1000 : 0,   // mm
  };
}

/** Zulässige Durchbiegung nach dem Richtwert der Fassadentechnik. */
function durchbiegungGrenze(L, teiler, grenzeMm) {
  // Über 3 m Stützweite wird in der Praxis L/300 + 5 mm angesetzt
  const ausTeiler = L > 3.0 ? (L * 1000) / 300 + 5 : (L * 1000) / teiler;
  return Math.min(ausTeiler, grenzeMm);
}

/**
 * Pfostennachweis: Biegung aus Wind, Durchbiegung, Auflagerkräfte.
 *
 * @param {Object} pfosten - { profil, laenge (m), einflussbreite (m), eigenlast (kN) }
 */
function pfostenNachweis(pfosten, wind, vorgaben) {
  const v = Object.assign({}, FASSADEN_VORGABEN, vorgaben || {});
  const p = FASSADENPROFILE[pfosten.profil] || FASSADENPROFILE["PR 50/125"];
  const leg = ALU_LEGIERUNGEN[v.legierung] || ALU_LEGIERUNGEN["6060 T66"];
  const wk = wind && wind.qp !== null ? Math.abs(wind.wk) : 0;
  const qk = wk * pfosten.einflussbreite;                 // kN/m
  const qd = qk * v.gammaQ;
  const EI = (v.eAlu * 1000 * p.Iy * 1e4) / 1e12;         // N/mm² · cm⁴ → kN·m²
  const gebrauch = einfeldtraeger(qk, pfosten.laenge, EI);
  const trag = einfeldtraeger(qd, pfosten.laenge, EI);
  const sigma = (trag.M * 1e6) / (p.Wy * 1e3);            // kN·m → N·mm ; cm³ → mm³
  const fRd = leg.fo / v.gammaM1;
  const fZul = durchbiegungGrenze(pfosten.laenge, v.pfostenDurchbiegung, v.pfostenGrenze);
  return {
    profil: pfosten.profil, profilDaten: p, legierung: leg,
    laenge: pfosten.laenge, einflussbreite: pfosten.einflussbreite,
    wk, qk, qd, M: trag.M, Mk: gebrauch.M,
    sigma, fRd, eta: sigma / fRd,
    f: gebrauch.f, fZul, etaF: gebrauch.f / fZul,
    horizontal: trag.A,                                    // kN je Auflager, Bemessungswert
    horizontalK: gebrauch.A,
    vertikal: (pfosten.eigenlast || 0) * v.gammaG,
    vertikalK: pfosten.eigenlast || 0,
    erfuellt: sigma / fRd <= 1.0 && gebrauch.f / fZul <= 1.0,
  };
}

/**
 * Riegelnachweis: Wind quer zur Fassade und Eigengewicht der Füllung in
 * der Fassadenebene. Beide Richtungen werden getrennt geführt und über
 * die Interaktion zweiachsiger Biegung zusammengefasst.
 */
function riegelNachweis(riegel, wind, vorgaben) {
  const v = Object.assign({}, FASSADEN_VORGABEN, vorgaben || {});
  const p = FASSADENPROFILE[riegel.profil] || FASSADENPROFILE["RI 50/85"];
  const leg = ALU_LEGIERUNGEN[v.legierung] || ALU_LEGIERUNGEN["6060 T66"];
  const wk = wind && wind.qp !== null ? Math.abs(wind.wk) : 0;

  // Wind: senkrecht zur Fassade, Einzugshöhe aus den beiden Nachbarfeldern
  const qwK = wk * riegel.einflusshoehe;
  const EIy = (v.eAlu * 1000 * p.Iy * 1e4) / 1e12;
  const windLast = einfeldtraeger(qwK, riegel.laenge, EIy);
  const windTrag = einfeldtraeger(qwK * v.gammaQ, riegel.laenge, EIy);

  // Eigengewicht der aufstehenden Füllung: in der Fassadenebene, also um
  // die schwache Achse des Riegels
  const Iz = riegel.Iz || p.Iz || p.Iy / 3;
  const Wz = riegel.Wz || p.Wz || p.Wy / 2;
  const gK = riegel.eigenlast || 0;                        // kN/m
  const EIz = (v.eAlu * 1000 * Iz * 1e4) / 1e12;
  const eigen = einfeldtraeger(gK, riegel.laenge, EIz);
  const eigenTrag = einfeldtraeger(gK * v.gammaG, riegel.laenge, EIz);

  const sigmaY = (windTrag.M * 1e6) / (p.Wy * 1e3);
  const sigmaZ = (eigenTrag.M * 1e6) / (Wz * 1e3);
  const fRd = leg.fo / v.gammaM1;
  const eta = (sigmaY + sigmaZ) / fRd;

  const fZulW = durchbiegungGrenze(riegel.laenge, v.riegelDurchbiegung, v.riegelGrenze);
  /* In der Fassadenebene ist nicht die Spannung maßgebend, sondern der
     Randverbund der aufstehenden Scheibe: gibt der Riegel zu weit nach,
     wird die Scheibe an der Kante gedrückt und der Randverbund
     beansprucht. Richtwert der Fassadentechnik, hier als Eingabe. */
  const fZulG = Math.min((riegel.laenge * 1000) / v.riegelGlasDurchbiegung, v.riegelGlasGrenze);

  return {
    profil: riegel.profil, profilDaten: p, legierung: leg,
    laenge: riegel.laenge, einflusshoehe: riegel.einflusshoehe,
    wk, qwK, gK,
    Mw: windTrag.M, Mg: eigenTrag.M,
    sigmaY, sigmaZ, sigma: sigmaY + sigmaZ, fRd, eta,
    fw: windLast.f, fZulW, etaFw: windLast.f / fZulW,
    fg: eigen.f, fZulG, etaFg: eigen.f / fZulG,
    auflager: windTrag.A, auflagerG: eigenTrag.A,
    erfuellt: eta <= 1.0 && windLast.f / fZulW <= 1.0 && eigen.f / fZulG <= 1.0,
    // welches Kriterium führt: das sagt, woran eine Bemessung scheitert
    massgebend: (() => {
      const k = [{ was: "Spannung", eta }, { was: "Durchbiegung aus Wind", eta: windLast.f / fZulW },
        { was: "Durchbiegung aus dem Gewicht der Füllung", eta: eigen.f / fZulG }];
      return k.reduce((a2, b2) => (b2.eta > a2.eta ? b2 : a2));
    })(),
  };
}

/* ------------------------------------------------------------ Wärmeschutz */

/** U-Wert eines Paneels aus Dicke und Wärmeleitfähigkeit. */
function paneelUWert(paneel, vorgaben) {
  const v = Object.assign({}, FASSADEN_VORGABEN, vorgaben || {});
  if (paneel.u) return paneel.u;
  if (!paneel.lambda || !paneel.dicke) return null;
  return 1 / (v.rsi + paneel.dicke / paneel.lambda + v.rse);
}

/**
 * U-Wert der Vorhangfassade nach DIN EN ISO 12631.
 *
 * U_cw = [ΣA_g·U_g + ΣA_p·U_p + ΣA_f·U_f + Σl_g·Ψ_g + Σl_p·Ψ_p] / ΣA
 */
function fassadeUWert(teile, vorgaben) {
  const v = Object.assign({}, FASSADEN_VORGABEN, vorgaben || {});
  let ag = 0, ap = 0, af = 0, lg = 0, lp = 0;
  let sumG = 0, sumP = 0, sumF = 0;
  teile.forEach((t) => {
    if (t.art === "glas") { ag += t.flaeche; sumG += t.flaeche * t.u; lg += t.umfang; }
    else if (t.art === "paneel") { ap += t.flaeche; sumP += t.flaeche * t.u; lp += t.umfang; }
    else { af += t.flaeche; sumF += t.flaeche * t.u; }
  });
  const flaeche = ag + ap + af;
  if (flaeche <= 0) return null;
  const zaehler = sumG + sumP + sumF + lg * v.psiGlasrand + lp * v.psiPaneelrand;
  return {
    ucw: zaehler / flaeche,
    flaeche, glasFlaeche: ag, paneelFlaeche: ap, rahmenFlaeche: af,
    glasrand: lg, paneelrand: lp,
    rahmenanteil: af / flaeche,
    anteilGlas: sumG / flaeche, anteilPaneel: sumP / flaeche,
    anteilRahmen: sumF / flaeche,
    anteilRand: (lg * v.psiGlasrand + lp * v.psiPaneelrand) / flaeche,
    psiGlasrand: v.psiGlasrand, psiPaneelrand: v.psiPaneelrand,
  };
}

/* ----------------------------------------------------------- Fassadenraster */

/**
 * Raster der Fassade aus den Parametern bilden.
 *
 * Aus Feldbreiten, Geschosshöhen und der Brüstungshöhe entstehen Pfosten,
 * Riegel und Felder. Jedes Feld ist durch Achse (Buchstabe) und Geschoss
 * (Zahl) benannt; Brüstungsfelder tragen den Zusatz B.
 *
 * @param {Object} p - { art, felder: [m], geschosse: [m], bruestung: m,
 *                       sturz: m, pfostenProfil, riegelProfil,
 *                       glas, paneel, bruestungAlsPaneel }
 */
function fassadeRaster(p) {
  const felder = (p.felder || []).filter((b) => b > 0);
  const geschosse = (p.geschosse || []).filter((h) => h > 0);
  const bruestung = Math.max(0, p.bruestung || 0);
  const sturz = Math.max(0, p.sturz || 0);
  const kennung = (i) => {
    let s = "", n = i;
    do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
    return s;
  };

  const breite = felder.reduce((s, b) => s + b, 0);
  const hoehe = geschosse.reduce((s, h) => s + h, 0);

  // Pfosten: einer je Feldgrenze, über jedes Geschoss ein Stab
  const pfosten = [];
  let x = 0;
  for (let i = 0; i <= felder.length; i++) {
    const links = i > 0 ? felder[i - 1] : 0;
    const rechts = i < felder.length ? felder[i] : 0;
    const einfluss = (links + rechts) / 2;
    let y = 0;
    geschosse.forEach((h, g) => {
      pfosten.push({
        achse: kennung(i), geschoss: g + 1, x, y, laenge: h,
        einflussbreite: einfluss, rand: i === 0 || i === felder.length,
        profil: p.pfostenProfil,
      });
      y += h;
    });
    x += rechts;
  }

  // Felder und Riegel je Geschoss
  const feldliste = [];
  const riegel = [];
  let y = 0;
  geschosse.forEach((h, g) => {
    // Höhenteilung innerhalb des Geschosses
    const schnitte = [0];
    if (bruestung > 0 && bruestung < h) schnitte.push(bruestung);
    if (sturz > 0 && h - sturz > (schnitte[schnitte.length - 1] || 0)) schnitte.push(h - sturz);
    schnitte.push(h);
    const teile = [];
    for (let k = 0; k < schnitte.length - 1; k++) {
      teile.push({ von: schnitte[k], bis: schnitte[k + 1] });
    }
    let xx = 0;
    felder.forEach((b, i) => {
      teile.forEach((t, k) => {
        const istBruestung = bruestung > 0 && t.bis <= bruestung + 1e-9;
        const istSturz = sturz > 0 && t.von >= h - sturz - 1e-9;
        const paneel = (istBruestung && p.bruestungAlsPaneel !== false) || istSturz;
        feldliste.push({
          name: `${kennung(i)}${g + 1}${teile.length > 1 ? `.${k + 1}` : ""}`,
          achse: kennung(i), geschoss: g + 1, teil: k + 1,
          x: xx, y: y + t.von, breite: b, hoehe: t.bis - t.von,
          flaeche: b * (t.bis - t.von),
          fuellung: paneel ? "paneel" : "glas",
          lage: istBruestung ? "Brüstung" : (istSturz ? "Sturz" : "Sichtfeld"),
        });
      });
      // Riegel an jeder inneren Höhenteilung sowie am Geschossende
      schnitte.slice(1).forEach((s, k) => {
        const oben = k < teile.length - 1 ? teile[k + 1] : null;
        riegel.push({
          name: `R${kennung(i)}${g + 1}.${k + 1}`,
          achse: kennung(i), geschoss: g + 1,
          x: xx, y: y + s, laenge: b,
          einflusshoehe: ((teile[k].bis - teile[k].von) + (oben ? oben.bis - oben.von : 0)) / 2,
          traegtFeld: oben ? null : null,
          profil: p.riegelProfil,
          geschossriegel: k === schnitte.length - 2,
        });
      });
      xx += b;
    });
    y += h;
  });

  return {
    art: p.art || "pfostenriegel",
    felder, geschosse, bruestung, sturz,
    breite, hoehe, flaeche: breite * hoehe,
    pfosten, riegel, feldliste,
    achsen: felder.length + 1,
  };
}

/* ------------------------------------------------------ Gesamtauswertung */

/**
 * Fassade vollständig auswerten: Raster, Lasten, Nachweise, U-Wert,
 * Mengen und Kosten.
 *
 * @param {Object} p - Parameter der Fassade (siehe fassadeRaster)
 * @param {Object} vorgaben - überschreibbare Vorgaben
 */
function fassadeAuswerten(p, vorgaben) {
  const v = Object.assign({}, FASSADEN_VORGABEN, vorgaben || {});
  const raster = fassadeRaster(p);
  const art = FASSADEN_ARTEN[raster.art] || FASSADEN_ARTEN.pfostenriegel;
  const aufbau = GLASAUFBAUTEN[p.glas] || GLASAUFBAUTEN.iso2;
  const paneel = PANEELE[p.paneel] || PANEELE.sandwich;
  const meldungen = [];

  // --- Wind: für die Fassadenfläche insgesamt und je Feld
  const windGesamt = windlastFeld(10, v);
  if (windGesamt.qp === null) {
    meldungen.push({ art: "fehler", text: windGesamt.meldung });
  }

  // --- Gewichte
  const glasGewicht = aufbau.scheiben.reduce((s, sc) =>
    s + sc.lagen.reduce((t, d) => t + d, 0), 0) * v.rhoGlas / 1000;      // kg/m²
  const paneelGewicht = paneel.dicke * paneel.rohdichte;                 // kg/m²
  const paneelU = paneelUWert(paneel, v);

  // --- Felder: Nachweis der Füllung
  const felder = raster.feldliste.map((f) => {
    const wind = windlastFeld(f.flaeche, v);
    if (f.fuellung === "glas") {
      const n = wind.qp === null ? null : glasNachweis(f, aufbau, wind, v);
      return Object.assign({}, f, {
        wind, nachweis: n,
        gewicht: glasGewicht, last: glasGewicht * 9.81 / 1000 * f.flaeche,   // kN
        u: aufbau.ug, g: aufbau.g, aufbau: aufbau.name,
        erfuellt: n ? n.erfuellt : true,
      });
    }
    return Object.assign({}, f, {
      wind, nachweis: null,
      gewicht: paneelGewicht, last: paneelGewicht * 9.81 / 1000 * f.flaeche,
      u: paneelU, g: 0, aufbau: paneel.name,
      erfuellt: true,
    });
  });

  // --- Pfosten: das ungünstigste Feld je Achse bestimmt den Nachweis
  const pfostenGewicht = (FASSADENPROFILE[p.pfostenProfil] || FASSADENPROFILE["PR 50/125"]).masse;
  const riegelGewicht = (FASSADENPROFILE[p.riegelProfil] || FASSADENPROFILE["RI 50/85"]).masse;
  const pfosten = raster.pfosten.map((pf) => {
    // Eigenlast: die Füllungen links und rechts über die Geschosshöhe,
    // je zur Hälfte, dazu das Profil selbst
    const eigen = felder
      .filter((f) => Math.abs(f.y + f.hoehe / 2 - (pf.y + pf.laenge / 2)) < pf.laenge / 2)
      .filter((f) => f.x <= pf.x + 1e-6 && f.x + f.breite >= pf.x - 1e-6)
      .reduce((s, f) => s + f.last / 2, 0)
      + (pfostenGewicht * pf.laenge * 9.81) / 1000;
    const wind = windlastFeld(pf.einflussbreite * pf.laenge, v);
    const n = wind.qp === null ? null
      : pfostenNachweis({ profil: pf.profil, laenge: pf.laenge,
        einflussbreite: pf.einflussbreite, eigenlast: eigen }, wind, v);
    return Object.assign({}, pf, { eigenlast: eigen, wind, nachweis: n,
      erfuellt: n ? n.erfuellt : true });
  });

  // --- Riegel
  const riegel = raster.riegel.map((r) => {
    // Der Riegel trägt die Füllung, die auf ihm steht; den Wind nimmt er
    // aus der halben Höhe der Felder darunter und darüber auf. Über die
    // Geschossgrenze hinweg gehört das erste Feld des nächsten Geschosses
    // dazu – deshalb wird hier an den fertigen Feldern gesucht und nicht
    // innerhalb des Geschosses gerechnet.
    const gleicheAchse = (f) => Math.abs(f.x - r.x) < 1e-6;
    const drueber = felder.find((f) => gleicheAchse(f) && Math.abs(f.y - r.y) < 1e-6);
    const drunter = felder.find((f) => gleicheAchse(f) && Math.abs(f.y + f.hoehe - r.y) < 1e-6);
    r.einflusshoehe = ((drueber ? drueber.hoehe : 0) + (drunter ? drunter.hoehe : 0)) / 2;
    const eigen = (drueber ? (drueber.gewicht * drueber.breite * 9.81) / 1000 : 0)
      + (riegelGewicht * 9.81) / 1000;                                   // kN/m
    const wind = windlastFeld(r.laenge * Math.max(r.einflusshoehe, 0.01), v);
    const n = wind.qp === null ? null
      : riegelNachweis({ profil: r.profil, laenge: r.laenge,
        einflusshoehe: r.einflusshoehe, eigenlast: eigen }, wind, v);
    return Object.assign({}, r, { eigenlast: eigen, wind, nachweis: n,
      erfuellt: n ? n.erfuellt : true });
  });

  // --- Wärmeschutz nach DIN EN ISO 12631
  const pAnsicht = (FASSADENPROFILE[p.pfostenProfil] || FASSADENPROFILE["PR 50/125"]);
  const rAnsicht = (FASSADENPROFILE[p.riegelProfil] || FASSADENPROFILE["RI 50/85"]);
  const teile = [];
  felder.forEach((f) => {
    // Rahmen: halbe Ansichtsbreite ringsum gehört zum Feld
    const bR = (pAnsicht.ansicht / 1000) / 2, hR = (rAnsicht.ansicht / 1000) / 2;
    const bl = Math.max(0.01, f.breite - 2 * bR), hl = Math.max(0.01, f.hoehe - 2 * hR);
    teile.push({ art: f.fuellung, flaeche: bl * hl, u: f.u || 1.4, umfang: 2 * (bl + hl) });
    teile.push({ art: "rahmen", flaeche: f.flaeche - bl * hl,
      u: (pAnsicht.uf + rAnsicht.uf) / 2, umfang: 0 });
  });
  const uWert = fassadeUWert(teile, v);

  // --- Mengen
  const pfostenLaenge = pfosten.reduce((s, x) => s + x.laenge, 0)
    * (art.doppelpfosten ? 2 : 1);
  const riegelLaenge = riegel.reduce((s, x) => s + x.laenge, 0)
    * (art.doppelpfosten ? 2 : 1);
  const glasFlaeche = felder.filter((f) => f.fuellung === "glas")
    .reduce((s, f) => s + f.flaeche, 0);
  const paneelFlaeche = felder.filter((f) => f.fuellung === "paneel")
    .reduce((s, f) => s + f.flaeche, 0);
  const dichtung = felder.reduce((s, f) => s + 2 * (f.breite + f.hoehe), 0) * 2;  // innen und außen
  const anker = pfosten.length * 2;                       // je Pfosten oben und unten
  const aluMasse = pfostenLaenge * pfostenGewicht + riegelLaenge * riegelGewicht;
  const glasMasse = glasFlaeche * glasGewicht;
  const paneelMasse = paneelFlaeche * paneelGewicht;
  const gesamtMasse = aluMasse + glasMasse + paneelMasse;

  const mengen = {
    flaeche: raster.flaeche, breite: raster.breite, hoehe: raster.hoehe,
    felder: felder.length, achsen: raster.achsen, geschosse: raster.geschosse.length,
    pfostenStueck: pfosten.length * (art.doppelpfosten ? 2 : 1),
    pfostenLaenge, riegelStueck: riegel.length * (art.doppelpfosten ? 2 : 1), riegelLaenge,
    glasFlaeche, paneelFlaeche, dichtung, anker,
    aluMasse, glasMasse, paneelMasse, gesamtMasse,
    masseJeQm: raster.flaeche > 0 ? gesamtMasse / raster.flaeche : 0,
    glasanteil: raster.flaeche > 0 ? glasFlaeche / raster.flaeche : 0,
  };

  // --- Auflagerkräfte an der Decke
  const anker1 = pfosten.reduce((s, x) => Math.max(s,
    x.nachweis ? x.nachweis.horizontal : 0), 0);
  const ankerV = pfosten.reduce((s, x) => Math.max(s,
    x.nachweis ? x.nachweis.vertikal : 0), 0);

  // --- Meldungen
  const glasFehler = felder.filter((f) => !f.erfuellt);
  const pfostenFehler = pfosten.filter((x) => !x.erfuellt);
  const riegelFehler = riegel.filter((x) => !x.erfuellt);
  glasFehler.slice(0, 6).forEach((f) => {
    const n = f.nachweis;
    meldungen.push({ art: "fehler", text: `Feld ${f.name} (${fasZahl(f.breite)} × `
      + `${fasZahl(f.hoehe)} m): Verglasung nicht nachgewiesen – `
      + `Ausnutzung Spannung ${fasZahl(n.eta * 100, 0)} %, `
      + `Durchbiegung ${fasZahl(n.etaW * 100, 0)} %.` });
  });
  pfostenFehler.slice(0, 4).forEach((x) => {
    const n = x.nachweis;
    meldungen.push({ art: "fehler", text: `Pfosten ${x.achse}${x.geschoss}: `
      + `Spannung ${fasZahl(n.eta * 100, 0)} %, Durchbiegung `
      + `${fasZahl(n.f, 1)} mm von zulässig ${fasZahl(n.fZul, 1)} mm – `
      + "tieferes Profil wählen." });
  });
  riegelFehler.slice(0, 4).forEach((x) => {
    const n = x.nachweis;
    meldungen.push({ art: "fehler", text: `Riegel ${x.name} (${fasZahl(n.laenge)} m): `
      + `maßgebend ist ${n.massgebend.was} mit ${fasZahl(n.massgebend.eta * 100, 0)} % – `
      + `Spannung ${fasZahl(n.sigma, 0)} von ${fasZahl(n.fRd, 0)} N/mm², Durchbiegung aus Wind `
      + `${fasZahl(n.fw, 1)} von ${fasZahl(n.fZulW, 1)} mm, aus dem Gewicht der Füllung `
      + `${fasZahl(n.fg, 1)} von ${fasZahl(n.fZulG, 1)} mm.` });
  });
  if (windGesamt.qp !== null && windGesamt.sog) {
    meldungen.push({ art: "hinweis", text: `Maßgebend ist Sog: ${windGesamt.bereich} mit `
      + `c_pe = ${fasZahl(windGesamt.cpe)} und Innendruck c_pi = ${fasZahl(windGesamt.cpi)}. `
      + "Für die Feldmitte (Bereich D, Druck) ist getrennt zu prüfen." });
  }
  const grosse = felder.filter((f) => f.flaeche > 6);
  if (grosse.length) {
    meldungen.push({ art: "hinweis", text: `${grosse.length} Felder über 6 m²: `
      + "Gewicht der Einzelscheibe, Transport und Montagegerät prüfen "
      + `(schwerste Scheibe ${fasZahl(Math.max(...grosse.map((f) => f.flaeche * f.gewicht)), 0)} kg).` });
  }

  return {
    raster, art, aufbau, paneel, vorgaben: v,
    wind: windGesamt, felder, pfosten, riegel, uWert, mengen,
    ankerHorizontal: anker1, ankerVertikal: ankerV,
    glasGewicht, paneelGewicht, paneelU,
    meldungen,
    erfuellt: glasFehler.length === 0 && pfostenFehler.length === 0
      && riegelFehler.length === 0 && windGesamt.qp !== null,
    nichtErfuellt: glasFehler.length + pfostenFehler.length + riegelFehler.length,
    groessteAusnutzung: Math.max(
      ...felder.map((f) => (f.nachweis ? f.nachweis.eta : 0)),
      ...pfosten.map((x) => (x.nachweis ? x.nachweis.eta : 0)),
      ...riegel.map((x) => (x.nachweis ? x.nachweis.eta : 0)), 0),
  };
}

/**
 * Kostenschätzung der Fassade als Leistungsverzeichnis.
 *
 * Geführt werden Material, Bearbeitung, Transport, Lagerung und Montage
 * getrennt, damit die Anteile sichtbar bleiben.
 */
function fassadeKosten(auswertung, vorgaben) {
  const v = Object.assign({}, FASSADEN_VORGABEN, vorgaben || {});
  const m = auswertung.mengen;
  const zeilen = [];
  const nimm = (nr, kurz, menge, einheit, ep, hinweis) => {
    if (menge <= 0) return;
    zeilen.push({ nr, kurz, menge, einheit, ep, gp: menge * ep, hinweis: hinweis || "" });
  };

  nimm("01.10", `Pfostenprofile ${auswertung.raster.pfosten[0]
    ? auswertung.raster.pfosten[0].profil : ""}, Aluminium beschichtet`,
  m.pfostenLaenge * (FASSADENPROFILE[auswertung.raster.pfosten[0]
    ? auswertung.raster.pfosten[0].profil : "PR 50/125"] || { masse: 4.3 }).masse,
  "kg", v.aluPreis, `${fasZahl(m.pfostenLaenge, 1)} m Profil`);
  nimm("01.20", "Riegelprofile, Aluminium beschichtet",
    m.aluMasse - m.pfostenLaenge * (FASSADENPROFILE[auswertung.raster.pfosten[0]
      ? auswertung.raster.pfosten[0].profil : "PR 50/125"] || { masse: 4.3 }).masse,
    "kg", v.aluPreis, `${fasZahl(m.riegelLaenge, 1)} m Profil`);
  nimm("01.30", `Verglasung ${auswertung.aufbau.name}`,
    m.glasFlaeche, "m²", v.glasPreis,
    `Ug = ${fasZahl(auswertung.aufbau.ug, 2)} W/(m²K), g = ${fasZahl(auswertung.aufbau.g, 2)}`);
  nimm("01.40", `Paneele ${auswertung.paneel.name}`,
    m.paneelFlaeche, "m²", v.paneelPreis,
    auswertung.paneelU ? `U = ${fasZahl(auswertung.paneelU, 2)} W/(m²K)` : "");
  nimm("01.50", "Dichtungen und Andruckleisten", m.dichtung, "m", v.dichtungPreis, "innen und außen");
  nimm("01.60", "Verankerung an der Rohbaudecke", m.anker, "St", v.ankerPreis,
    `größte Ankerkraft waagerecht ${fasZahl(auswertung.ankerHorizontal, 2)} kN, `
    + `senkrecht ${fasZahl(auswertung.ankerVertikal, 2)} kN`);
  nimm("02.10", "Zuschnitt, Ausklinken, Bohren", m.flaeche, "m²", v.bearbeitungPreis, "Werkstattarbeit");
  nimm("02.20", "Transport zur Baustelle", m.flaeche, "m²", v.transportPreis, "");
  nimm("02.30", "Zwischenlagerung", m.flaeche, "m²", v.lagerPreis, "");
  nimm("02.40", "Montage einschließlich Gerät und Gerüst", m.flaeche, "m²", v.montagePreis, "");

  const summe = zeilen.reduce((s, z) => s + z.gp, 0);
  return {
    zeilen, summe,
    jeQm: m.flaeche > 0 ? summe / m.flaeche : 0,
    material: zeilen.filter((z) => z.nr.startsWith("01")).reduce((s, z) => s + z.gp, 0),
    leistung: zeilen.filter((z) => z.nr.startsWith("02")).reduce((s, z) => s + z.gp, 0),
  };
}
