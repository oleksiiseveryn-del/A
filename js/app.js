/**
 * App-Controller (räumliche Fassung): verbindet die beiden 3D-Ansichten,
 * das Stabwerksmodell, die Profilbemessung, die Werkstattauswertung und
 * die Kostenschätzung.
 *
 * Modell: Knoten in Metern (x rechts, y oben, z vorne), Stäbe als
 * Knotenpaare. Die Stablänge folgt aus der Geometrie.
 */
(function () {
  const NODE_TOLERANCE = 0.02; // m - Knoten innerhalb dieser Toleranz gelten als identisch
  const G_ERDBESCHLEUNIGUNG = 9.81;
  const STORAGE_KEY = "hsd-stahlbau-konverter-projekt";

  // Zustand der Bestandsaufnahme. Bewusst außerhalb des Modells: Ein Scan von
  // Millionen Punkten gehört nicht in die Projektdatei. Er ist Vorlage und
  // Prüfmittel; in das Modell geht über, was daraus abgeleitet wird.
  let punktwolke = null;      // { voll, anzeige, statistik, raster, ms }
  let scanSchnitt = null;     // { punkte, kote, dicke, ueber }
  let scanWaende = null;      // Ergebnis der Wanderkennung
  let scanAuswahl = new Set();

  // Tiefbau: Achse, Gradiente, Gelände und das Ergebnis der Massenberechnung.
  // Die Eingaben gehören zum Projekt und werden mit gespeichert; das Ergebnis
  // wird bei jeder Rechnung neu gebildet.
  const tiefbau = {
    achse: [],        // [{ art, laenge, radius, radiusEnde }]
    gradiente: [],    // [{ station, hoehe, halbmesser }]
    gelaende: [],     // [{ station, hoehe, querneigung }]
  };
  let tiefbauErgebnis = null;

  // Geländemodell: Höhenpunkte gehören zum Projekt, das Netz wird daraus
  // jedes Mal neu gebildet – es ist Ergebnis, nicht Eingabe.
  let dgmPunkte = [];
  let dgm = null;
  let dgmLinien = [];
  let dgmVolumenErgebnis = null;

  // Baustellenlogistik: Hübe, Einrichtungsflächen und Vorgänge gehören zum
  // Projekt; Kranprüfung, Flächenbedarf und Netzplan sind Ergebnis daraus.
  let logistikHuebe = [];      // [{ bezeichnung, x, y, masse (kg), hoehe }]
  let logistikFlaechen = [];   // [{ art, name, x, y, breite, tiefe }]
  let bauVorgaenge = [];       // [{ id, name, dauer, vorgaenger: [{ id, abstand }] }]

  const model = {
    nodes: [],            // [{ x, y, z }]
    members: new Map(),   // id -> { id, a, b, type, loadType, force, moment, beta, family, steelGrade }
    supports: new Map(),  // Knotenindex -> "pinned" | "roller"
    loads: new Map(),     // Knotenindex -> { fx, fy, fz }
    nextId: 1,
    elements: new Map(),  // id -> Architektur-Bauteil { id, kind, p1, p2, layers, hoehe, anzahl }
    nextElementId: 1,
    openings: new Map(),  // id -> Öffnung { id, elementId, typ, breite, hoehe, bruestung, anzahl, u, preis }
    nextOpeningId: 1,
    abzuege: new Map(),   // id -> Abzug/Nische { id, raum, typ, breite, tiefe, hoehe, anzahl, bisFussboden, bemerkung }
    nextAbzugId: 1,
    beton: new Map(),     // id -> Betonbauteil { id, kind, p1, p2, masse, guete, expo, ds, sauberkeit, bewehrungsgrad, anzahl, spannrichtung, aussparungen }
    nextBetonId: 1,
    nextAussparungId: 1,  // fortlaufende Nummer der Deckendurchbrüche
    anschluesse: new Map(),  // id -> Anschluss { id, memberId, art, ... }
    nextAnschlussId: 1,
    fertigteile: new Map(),  // id -> Fertigteil { id, bezeichnung, art, felder, stueck }
    nextFertigteilId: 1,
    aufmass: new Map(),   // id -> Aufmaßblatt { id, pos, kurztext, einheit, gewerk, grenze, ep, datum, aufgenommen, anerkannt, zeilen }
    nextAufmassId: 1,
    bautagebuch: new Map(), // id -> Bautag { id, datum, abschnitt, von, bis, pause, wetter, tempFrueh, …, firmen, geraete, leistungen, lieferungen, ereignisse }
    nextTagId: 1,
  };

  // Baustoffpreise [€/m³], vom Anwender überschreibbar
  const materialPreise = {};

  let pendingElementPoint = null; // erster Eckpunkt beim Aufziehen eines Bauteils
  let pendingBetonPoint = null;   // erster Punkt beim Aufziehen eines Betonbauteils

  let lastSolution = null;
  let selfWeightLoads = [];
  let selfWeightTotal = 0;
  let pendingStart = null; // erster Punkt beim Zeichnen

  const dateField = document.getElementById("projectDate");
  if (dateField && !dateField.value) dateField.value = new Date().toISOString().slice(0, 10);

  /* ---------------------------------------------------------------- Dialoge */

  const modal = {
    overlay: document.getElementById("modalOverlay"),
    title: document.getElementById("modalTitle"),
    text: document.getElementById("modalText"),
    input: document.getElementById("modalInput"),
    ok: document.getElementById("modalOk"),
    cancel: document.getElementById("modalCancel"),
    resolve: null,
  };
  modal.overlay.hidden = true;

  function closeModal(value) {
    modal.overlay.hidden = true;
    const resolve = modal.resolve;
    modal.resolve = null;
    if (resolve) resolve(value);
  }

  function askNumber(title, text, defaultValue) {
    return new Promise((resolve) => {
      modal.resolve = resolve;
      modal.title.textContent = title;
      modal.text.textContent = text;
      modal.input.hidden = false;
      modal.input.value = defaultValue;
      modal.ok.textContent = "Übernehmen";
      modal.overlay.hidden = false;
      modal.input.focus();
      modal.input.select();
    });
  }

  function askConfirm(title, text) {
    return new Promise((resolve) => {
      modal.resolve = (v) => resolve(v !== null);
      modal.title.textContent = title;
      modal.text.textContent = text;
      modal.input.hidden = true;
      modal.ok.textContent = "Ja, löschen";
      modal.overlay.hidden = false;
      modal.ok.focus();
    });
  }

  modal.ok.addEventListener("click", () => {
    const raw = String(modal.input.value).replace(",", ".");
    closeModal(modal.input.hidden ? true : parseFloat(raw));
  });
  modal.cancel.addEventListener("click", () => closeModal(null));
  modal.input.addEventListener("keydown", (e) => { if (e.key === "Enter") modal.ok.click(); });
  modal.overlay.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(null); });

  function setStatus(text, kind) {
    const box = document.getElementById("statusBox");
    box.textContent = text;
    box.className = "status-box " + (kind || "info");
    box.hidden = !text;
  }

  /* --------------------------------------------------------- Modellzugriffe */

  function nodeKey(index) { return "K" + (index + 1); }

  function findOrCreateNode(point) {
    for (let i = 0; i < model.nodes.length; i++) {
      const n = model.nodes[i];
      if (Math.hypot(n.x - point.x, n.y - point.y, n.z - point.z) <= NODE_TOLERANCE) return i;
    }
    model.nodes.push({ x: point.x, y: point.y, z: point.z });
    return model.nodes.length - 1;
  }

  function memberLength(member) {
    const a = model.nodes[member.a];
    const b = model.nodes[member.b];
    if (!a || !b) return 0;
    return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  }

  function typeShortLabel(type) {
    return ({
      "Stütze": "STÜ", "Obergurt": "OG", "Untergurt": "UG", "Druckstrebe": "DS",
      "Zugstrebe": "ZS", "Riegel/Pfette": "RG", "Sonstige": "SO",
    })[type] || "?";
  }

  function memberLabel(member) { return typeShortLabel(member.type) + member.id; }

  function addMember(aIndex, bIndex, type) {
    if (aIndex === bIndex) return null;
    const exists = Array.from(model.members.values()).some(
      (m) => (m.a === aIndex && m.b === bIndex) || (m.a === bIndex && m.b === aIndex)
    );
    if (exists) return null;

    const memberType = type || "Stütze";
    const defaults = MEMBER_TYPE_DEFAULTS[memberType];
    const member = {
      id: model.nextId++,
      a: aIndex,
      b: bIndex,
      type: memberType,
      loadType: defaults.loadType,
      force: 10,
      moment: 5,
      beta: defaults.beta,
      family: "AUTO",
      steelGrade: document.getElementById("steelGradeGlobal").value,
    };
    model.members.set(member.id, member);
    return member;
  }

  function removeMember(id) {
    model.members.delete(id);
    pruneNodes();
    refreshAll();
  }

  /** Knoten ohne angeschlossene Stäbe entfernen und Indizes neu vergeben. */
  function pruneNodes() {
    const used = new Set();
    model.members.forEach((m) => { used.add(m.a); used.add(m.b); });
    model.supports.forEach((_, i) => used.add(i));
    model.loads.forEach((_, i) => used.add(i));

    const remap = new Map();
    const kept = [];
    model.nodes.forEach((node, i) => {
      if (used.has(i)) { remap.set(i, kept.length); kept.push(node); }
    });
    if (kept.length === model.nodes.length) return;

    model.nodes = kept;
    model.members.forEach((m) => { m.a = remap.get(m.a); m.b = remap.get(m.b); });
    const supports = new Map();
    model.supports.forEach((v, i) => { if (remap.has(i)) supports.set(remap.get(i), v); });
    model.supports = supports;
    const loads = new Map();
    model.loads.forEach((v, i) => { if (remap.has(i)) loads.set(remap.get(i), v); });
    model.loads = loads;
  }

  function clearModel() {
    model.nodes = [];
    model.members.clear();
    model.elements.clear();
    model.nextElementId = 1;
    model.openings.clear();
    model.nextOpeningId = 1;
    model.abzuege.clear();
    model.nextAbzugId = 1;
    model.beton.clear();
    model.nextBetonId = 1;
    model.nextAussparungId = 1;
    model.aufmass.clear();
    model.nextAufmassId = 1;
    model.anschluesse.clear();
    model.nextAnschlussId = 1;
    model.fertigteile.clear();
    model.nextFertigteilId = 1;
    ftErgebnis = null;
    model.bautagebuch.clear();
    model.nextTagId = 1;
    pendingBetonPoint = null;
    pendingElementPoint = null;
    model.supports.clear();
    model.loads.clear();
    model.nextId = 1;
    lastSolution = null;
    selfWeightLoads = [];
    selfWeightTotal = 0;
    pendingStart = null;
    tiefbau.achse = [];
    tiefbau.gradiente = [];
    tiefbau.gelaende = [];
    tiefbauErgebnis = null;
    dgmPunkte = [];
    dgm = null;
    dgmLinien = [];
    dgmVolumenErgebnis = null;
    logistikHuebe = [];
    logistikFlaechen = [];
    bauVorgaenge = [];
    kranErgebnis = null;
    beErgebnis = null;
    bauErgebnis = null;
    punktwolke = null;
    scanSchnitt = null;
    scanWaende = null;
    scanAuswahl = new Set();
  }

  /* ------------------------------------------------------- Nachweisparameter */

  function applyDesignParameters() {
    PARTIAL_FACTORS.gammaM1 = document.getElementById("naSelect").value === "EN" ? 1.0 : 1.1;
    PARTIAL_FACTORS.gammaM0 = 1.0;
    PARTIAL_FACTORS.gammaM2 = 1.25;
  }

  function currentNetRatio() {
    const percent = parseFloat(document.getElementById("netRatio").value);
    return Number.isFinite(percent) ? Math.min(Math.max(percent, 50), 100) / 100 : 1;
  }

  function designMember(member) {
    return findSuitableProfile({
      ...member,
      length: memberLength(member),
      netRatio: currentNetRatio(),
    });
  }

  applyDesignParameters();
  document.getElementById("naSelect").addEventListener("change", () => { applyDesignParameters(); refreshAll(); });
  document.getElementById("netRatio").addEventListener("change", () => refreshAll());
  document.getElementById("steelGradeGlobal").addEventListener("change", (e) => {
    model.members.forEach((m) => { m.steelGrade = e.target.value; });
    refreshAll();
  });

  /* ------------------------------------------------------------- 3D-Ansichten */

  let syncing = false;
  const sketch = new Scene3D(document.getElementById("sketchView"), {
    interactive: true,
    onCameraChange: (state) => {
      if (syncing) return;
      syncing = true;
      result.setCameraState(state);
      syncing = false;
    },
    onPlanePick: (point) => handlePick(snapToGrid(point)),
    onNodePick: (snap) => handlePick(snap, snap.index),
    onHover: (event) => updatePreview(event),
  });

  const result = new Scene3D(document.getElementById("modelView"), {
    interactive: false,
    background: 0x101d29,
    onCameraChange: (state) => {
      if (syncing) return;
      syncing = true;
      sketch.setCameraState(state);
      syncing = false;
    },
  });
  result.grid.material.opacity = 0.3;

  const fensterAngepasst = () => { sketch.resize(); result.resize(); };
  window.addEventListener("resize", fensterAngepasst);
  // Beim Drehen des Tablets steht die endgültige Größe erst nach dem Umbruch
  // fest; deshalb ein zweiter Durchgang kurz danach
  window.addEventListener("orientationchange", () => {
    fensterAngepasst();
    window.setTimeout(fensterAngepasst, 350);
  });

  function snapToGrid(point) {
    const step = parseFloat(document.getElementById("gridStep").value) || 0.5;
    const round = (v) => Math.round(v / step) * step;
    const { axis, offset } = sketch.workPlane;
    return {
      x: axis === "ZY" ? offset : round(point.x),
      y: axis === "XZ" ? offset : round(point.y),
      z: axis === "XY" ? offset : round(point.z),
    };
  }

  /* ------------------------------------------------------------ Interaktion */

  let mode = "draw";

  // Auf dem Tablet gibt es keine zweite Maustaste und kein Mausrad; die
  // Hinweise nennen dort die Fingergesten.
  const TABLET = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  const tippen = TABLET ? "antippen" : "anklicken";
  const NAVIGATION = TABLET
    ? "Wischen dreht, Aufziehen mit zwei Fingern zoomt, Schieben mit zwei Fingern verschiebt."
    : "Rechte Maustaste dreht das Modell, Mausrad zoomt, ESC bricht ab.";

  const MODE_HINTS = {
    draw: `Zeichnen: Anfangs- und Endpunkt auf der Arbeitsebene ${tippen}. ${NAVIGATION}`,
    orbit: TABLET
      ? "Navigieren: Wischen dreht das Modell, Aufziehen mit zwei Fingern zoomt, Schieben mit zwei Fingern verschiebt."
      : "Navigieren: Ziehen dreht das Modell, Umschalt+Ziehen verschiebt, Mausrad zoomt.",
    support: `Auflager: Knoten ${tippen} – Festlager → Loslager → kein Lager.`,
    load: `Knotenlast: Knoten ${tippen} und Last in kN eingeben (positiv = nach unten).`,
    bauteil: `Bauteil: zwei Punkte auf der Arbeitsebene ${tippen} (Wand: Achse, Platte: gegenüberliegende Ecken). Einzelfundament: ein Punkt.`,
    beton: "Betonteil: Wand, Streifenfundament, Unterzug und Treppe über die Achse (zwei Punkte), Platte über zwei gegenüberliegende Ecken, Fundament, Köcher, Stütze und Bohrpfahl über einen Punkt.",
  };

  function setMode(next) {
    mode = next;
    pendingStart = null;
    sketch.mode = next === "orbit" ? "orbit" : "draw";
    pendingElementPoint = null;
    pendingBetonPoint = null;
    ["btnDraw", "btnOrbit", "btnSupport", "btnLoad", "btnBauteil", "btnBetonteil"].forEach((id) => {
      document.getElementById(id).classList.remove("active");
    });
    const button = { draw: "btnDraw", orbit: "btnOrbit", support: "btnSupport", load: "btnLoad", bauteil: "btnBauteil", beton: "btnBetonteil" }[next];
    if (button) document.getElementById(button).classList.add("active");
    document.getElementById("hintBox").textContent = MODE_HINTS[next] || MODE_HINTS.draw;
    renderSketch();
  }

  function handlePick(point, existingIndex) {
    if (mode === "support") {
      if (existingIndex === undefined) return;
      const current = model.supports.get(existingIndex);
      const next = current === undefined ? "pinned" : current === "pinned" ? "roller" : undefined;
      if (next) model.supports.set(existingIndex, next);
      else model.supports.delete(existingIndex);
      setStatus(next === "pinned" ? "Festlager gesetzt (alle Richtungen gehalten)."
        : next === "roller" ? "Loslager gesetzt (nur lotrecht gehalten)." : "Auflager entfernt.", "info");
      refreshAll();
      return;
    }

    if (mode === "load") {
      if (existingIndex === undefined) return;
      const current = model.loads.get(existingIndex);
      askNumber("Knotenlast", `Vertikale Knotenlast am Knoten ${nodeKey(existingIndex)} in kN (positiv = nach unten, 0 entfernt die Last):`,
        current ? String(-current.fy) : "20").then((value) => {
        if (value === null || Number.isNaN(value)) return;
        if (value === 0) model.loads.delete(existingIndex);
        else model.loads.set(existingIndex, { fx: 0, fy: -value, fz: 0 });
        setStatus(value ? `Knotenlast ${value} kN gesetzt.` : "Knotenlast entfernt.", "info");
        refreshAll();
      });
      return;
    }

    if (mode === "bauteil") {
      handleBauteilPick(point);
      return;
    }

    if (mode === "beton") {
      handleBetonPick(point);
      return;
    }

    if (mode !== "draw") return;

    const index = existingIndex !== undefined ? existingIndex : findOrCreateNode(point);
    if (pendingStart === null) {
      pendingStart = index;
      renderSketch();
      return;
    }
    const member = addMember(pendingStart, index);
    pendingStart = null;
    if (member) {
      setStatus(`Stab ${memberLabel(member)} angelegt, Länge ${memberLength(member).toFixed(2)} m.`, "info");
    }
    pruneNodes();
    refreshAll();
  }

  function updatePreview(event) {
    if (mode !== "draw" || pendingStart === null) return;
    const snap = sketch.nearestSnapPoint(event, 14);
    const point = snap || snapToGrid(sketch.pointOnWorkPlane(event) || { x: 0, y: 0, z: 0 });
    renderSketch(point);
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && pendingStart !== null) {
      pendingStart = null;
      renderSketch();
    }
  });

  /* ---------------------------------------------------------- 3D-Darstellung */

  function renderSketch(previewPoint) {
    sketch.clearContent();
    sketch.snapPoints = model.nodes.map((n, i) => ({ ...n, index: i }));

    model.members.forEach((member) => {
      const a = model.nodes[member.a];
      const b = model.nodes[member.b];
      if (!a || !b) return;
      const force = lastSolution && lastSolution.ok ? lastSolution.forces[member.id] : undefined;
      const color = force === undefined ? 0x5ec8f8 : force >= 0 ? 0x7fe0a5 : 0xffb020;
      sketch.contentGroup.add(buildSketchMember(a, b, color, 0.035));

      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
      const text = force === undefined
        ? `${memberLabel(member)} ${memberLength(member).toFixed(2)}m`
        : `${memberLabel(member)} ${force >= 0 ? "+" : "−"}${Math.abs(force).toFixed(1)}kN`;
      sketch.overlayGroup.add(buildLabel(text, mid, force === undefined ? "#e8f4fc" : force >= 0 ? "#7fe0a5" : "#ffb020"));
    });

    model.nodes.forEach((node, i) => {
      const active = i === pendingStart;
      sketch.contentGroup.add(buildNodeMarker(node, active ? 0xffb020 : 0x9fd4f0, active ? 0.11 : 0.07));
      const support = model.supports.get(i);
      if (support) sketch.contentGroup.add(buildSupport(node, support));
      const load = model.loads.get(i);
      if (load && load.fy) {
        sketch.contentGroup.add(buildLoadArrow(node, load.fy));
        sketch.overlayGroup.add(buildLabel(`${Math.abs(load.fy)} kN`, { x: node.x, y: node.y + 1.1, z: node.z }, "#ff9f9f"));
      }
      const eg = selfWeightLoads[i];
      if (eg > 0.005) {
        sketch.overlayGroup.add(buildLabel(`EG ${eg.toFixed(2)}`, { x: node.x, y: node.y - 0.55, z: node.z }, "#9fb6c8"));
      }
    });

    // Höhenschnitt der Punktwolke als Vorlage, darauf wird gezeichnet
    if (scanSchnitt && scanSchnitt.punkte.length) {
      sketch.contentGroup.add(buildSchnittPunkte(scanSchnitt.punkte, scanSchnitt.kote, 0xffc46b, 0.05));
    }
    if (scanWaende) {
      scanWaende.waende.forEach((w, i) => {
        const y = scanSchnitt ? scanSchnitt.kote : 0;
        sketch.overlayGroup.add(buildSketchMember(
          { x: w.p1.x, y, z: w.p1.z }, { x: w.p2.x, y, z: w.p2.z },
          scanAuswahl.has(i) ? 0x7fe0a5 : 0x9fb6c8, 0.03));
      });
    }

    // Architektur- und Betonbauteile halbtransparent, damit die Achsen sichtbar bleiben
    renderArchElements(sketch, true);
    renderBetonElements(sketch, true);
    if (pendingElementPoint) {
      sketch.contentGroup.add(buildNodeMarker(pendingElementPoint, 0xffb020, 0.1));
    }
    if (pendingBetonPoint) {
      sketch.contentGroup.add(buildNodeMarker(pendingBetonPoint, 0xffb020, 0.1));
    }

    // Vorschaulinie zwischen gesetztem Anfangspunkt und Mauszeiger
    if (pendingStart !== null && previewPoint) {
      const from = model.nodes[pendingStart];
      sketch.overlayGroup.add(buildSketchMember(from, previewPoint, 0xffffff, 0.02));
      const len = Math.hypot(previewPoint.x - from.x, previewPoint.y - from.y, previewPoint.z - from.z);
      sketch.overlayGroup.add(buildLabel(`${len.toFixed(2)} m`, previewPoint, "#ffffff"));
    }

    sketch.render();
  }

  function utilizationColor(util, status) {
    if (status === "fehler" || util > 1.0) return 0xd1453b;
    if (util > 0.85) return 0xe0a021;
    if (util > 0.6) return 0x3f9e63;
    return 0x6f8ea8;
  }

  function renderModel() {
    result.clearContent();
    model.members.forEach((member) => {
      const a = model.nodes[member.a];
      const b = model.nodes[member.b];
      if (!a || !b) return;
      const design = designMember(member);
      const table = STEEL_DB[design.family];
      const profile = table ? table.find((p) => design.profileName.indexOf(p.name) === 0) : null;
      if (!profile) return;
      const exaggeration = parseFloat(document.getElementById("sectionScale").value) || 1;
      result.contentGroup.add(
        buildProfileSolid(a, b, design.family, profile, utilizationColor(design.utilization, design.status), exaggeration)
      );
    });

    // Geländemodell unter allem
    if (dgm && dgm.dreiecke.length && document.getElementById("dgmNetzZeigen").checked) {
      result.contentGroup.add(buildDgmNetz(dgm, document.getElementById("dgmDraht").checked));
      if (dgmLinien.length) result.contentGroup.add(buildHoehenlinien(dgmLinien));
    }

    // Punktwolke des Bestands unter dem Modell
    if (punktwolke && punktwolke.anzeige.anzahl && document.getElementById("scanZeigen").checked) {
      result.contentGroup.add(buildPunktwolke(punktwolke.anzeige, punktGroesse()));
    }

    renderArchElements(result, false);
    renderBetonElements(result, false);

    model.nodes.forEach((node, i) => {
      const support = model.supports.get(i);
      if (support) result.contentGroup.add(buildSupport(node, support));
      const load = model.loads.get(i);
      if (load && load.fy) result.contentGroup.add(buildLoadArrow(node, load.fy));
    });

    result.render();
  }

  /* ------------------------------------------------------------ Berechnung */

  function buildSolverModel() {
    const bars = Array.from(model.members.values()).map((m) => ({ id: m.id, a: m.a, b: m.b }));
    const supports = model.nodes.map((_, i) => model.supports.get(i));
    const loads = model.nodes.map((_, i) => model.loads.get(i) || null);
    return { nodes: model.nodes, bars, supports, loads };
  }

  function computeSelfWeightLoads() {
    const gammaG = parseFloat(document.getElementById("gammaG").value) || 1.35;
    const nodal = model.nodes.map(() => 0);
    let total = 0;
    model.members.forEach((member) => {
      const design = designMember(member);
      const weightKN = (design.weightPerMeter * memberLength(member) * G_ERDBESCHLEUNIGUNG) / 1000 * gammaG;
      total += weightKN;
      nodal[member.a] += weightKN / 2;
      nodal[member.b] += weightKN / 2;
    });
    return { nodal, total };
  }

  function combineLoads(userLoads, selfWeight) {
    return userLoads.map((load, i) => {
      const fy = (load ? load.fy || 0 : 0) - (selfWeight[i] || 0); // Eigengewicht wirkt nach unten
      const fx = load ? load.fx || 0 : 0;
      const fz = load ? load.fz || 0 : 0;
      return fx || fy || fz ? { fx, fy, fz } : null;
    });
  }

  function applySolution(solution) {
    let maxForce = 0;
    model.members.forEach((member) => {
      const N = solution.forces[member.id] || 0;
      member.loadType = N >= 0 ? "Zug" : "Druck";
      member.force = parseFloat(Math.abs(N).toFixed(1));
      maxForce = Math.max(maxForce, Math.abs(N));
    });
    return maxForce;
  }

  function computeBarForces() {
    if (model.members.size === 0) {
      setStatus("Keine Stäbe vorhanden – bitte zuerst die Skizze zeichnen.", "error");
      return;
    }
    const solverModel = buildSolverModel();
    const withSelfWeight = document.getElementById("chkSelfWeight").checked;

    let current = model.nodes.map(() => 0);
    let total = 0;
    let solution = null;
    let iterations = 0;

    for (let pass = 0; pass < 8; pass++) {
      solution = solveTruss(solverModel.nodes, solverModel.bars, solverModel.supports,
        combineLoads(solverModel.loads, current));
      if (!solution.ok) break;
      applySolution(solution);
      iterations = pass + 1;
      if (!withSelfWeight) break;

      const next = computeSelfWeightLoads();
      const converged = next.nodal.every((v, i) => Math.abs(v - current[i]) < 0.01);
      current = next.nodal;
      total = next.total;
      if (converged) break;
    }

    if (!solution || !solution.ok) {
      lastSolution = null;
      selfWeightLoads = [];
      selfWeightTotal = 0;
      setStatus(solution ? solution.message : "Berechnung nicht möglich.", "error");
      refreshAll();
      return;
    }

    lastSolution = solution;
    selfWeightLoads = withSelfWeight ? current : [];
    selfWeightTotal = withSelfWeight ? total : 0;
    const maxForce = applySolution(solution);

    const reactionText = solution.reactions
      .filter((r) => r.dir === "y")
      .map((r) => `${Math.abs(r.value).toFixed(1)} kN`)
      .join(" / ");
    const egText = withSelfWeight
      ? ` · Eigengewicht ${selfWeightTotal.toFixed(1)} kN (γG = ${document.getElementById("gammaG").value}, ${iterations} ${iterations === 1 ? "Iteration" : "Iterationen"})`
      : "";
    setStatus(`${solution.message.replace(".", "")} · größte Stabkraft ${maxForce.toFixed(1)} kN · lotrechte Auflagerkräfte ${reactionText}${egText}.`, "ok");
    refreshAll();
  }

  document.getElementById("btnSolve").addEventListener("click", computeBarForces);
  document.getElementById("chkSelfWeight").addEventListener("change", () => { if (model.members.size) computeBarForces(); });
  document.getElementById("gammaG").addEventListener("change", () => {
    if (model.members.size && document.getElementById("chkSelfWeight").checked) computeBarForces();
  });


  /* ------------------------------------------------- Architektur-Bauteile */

  /** Öffnungen eines Bauteils. */
  function oeffnungenVon(elementId) {
    return Array.from(model.openings.values()).filter((o) => o.elementId === elementId);
  }

  function auswertung(element) {
    return bauteilAuswertung(element, oeffnungenVon(element.id));
  }

  function bauteilBezeichnung(element) {
    const kuerzel = {
      wand_aussen: "AW", wand_innen: "IW", decke: "DE", dach: "DA",
      bodenplatte: "BP", streifenfundament: "SF", einzelfundament: "EF",
    }[element.kind] || "BT";
    return kuerzel + element.id;
  }

  function handleBauteilPick(point) {
    const kind = document.getElementById("bauteilTyp").value;
    const typ = BAUTEILTYPEN[kind];

    if (typ.form === "punkt") {
      erzeugeBauteil(kind, point, null);
      return;
    }
    if (!pendingElementPoint) {
      pendingElementPoint = point;
      setStatus(`${typ.name}: zweiten Punkt anklicken.`, "info");
      renderSketch();
      return;
    }
    erzeugeBauteil(kind, pendingElementPoint, point);
    pendingElementPoint = null;
  }

  function erzeugeBauteil(kind, p1, p2) {
    const typ = BAUTEILTYPEN[kind];
    const element = {
      id: model.nextElementId++,
      kind,
      p1: { ...p1 },
      p2: p2 ? { ...p2 } : null,
      layers: typ.standard.map((l) => ({ ...l })),
      hoehe: parseFloat(document.getElementById("bauteilHoehe").value) || 2.75,
      breite: typ.breite,
      laenge: typ.laenge,
      anzahl: 1,
      zielU: null,
    };
    model.elements.set(element.id, element);

    const a = auswertung(element);
    setStatus(`${typ.name} ${bauteilBezeichnung(element)} angelegt: ${a.flaecheGesamt.toFixed(2)} m², `
      + `Dicke ${a.geometrie.dicke.toFixed(3)} m, Masse ${(a.masseGesamt / 1000).toFixed(2)} t`
      + (a.uWert ? `, U = ${a.uWert.toFixed(3)} W/(m²·K)` : ""), "ok");
    refreshAll();
  }

  function renderArchElements(scene, transparent) {
    model.elements.forEach((element) => {
      const geo = bauteilGeometrie(element);
      scene.contentGroup.add(buildArchElement(
        element, geo, archElementColor(element), transparent ? 0.45 : 1, oeffnungenVon(element.id)
      ));
    });
  }

  function renderArchTable() {
    const body = document.getElementById("archBody");
    const empty = document.getElementById("archEmpty");
    body.innerHTML = "";
    empty.hidden = model.elements.size > 0;

    model.elements.forEach((element) => {
      const a = auswertung(element);
      const typ = BAUTEILTYPEN[element.kind];
      const geoText = typ.form === "linie"
        ? `L ${a.geometrie.laenge.toFixed(2)} × H ${a.geometrie.hoehe.toFixed(2)} m`
        : `${a.geometrie.laenge.toFixed(2)} × ${a.geometrie.breite.toFixed(2)} m`;

      const schichten = element.layers.map((layer, i) => `
        <span class="layer-row">
          <select data-el="${element.id}" data-layer="${i}" data-field="material">
            ${Object.keys(BAUSTOFFE).map((k) => `<option value="${k}" ${k === layer.material ? "selected" : ""}>${BAUSTOFFE[k].name}</option>`).join("")}
          </select>
          <input type="number" step="0.005" min="0" data-el="${element.id}" data-layer="${i}" data-field="d" value="${layer.d}">
          <button class="layer-remove" data-el="${element.id}" data-layer="${i}" title="Schicht entfernen">✕</button>
        </span>`).join("");

      const uText = a.uWert === null ? "–" : a.uWert.toFixed(3);
      const zielU = element.zielU === null || element.zielU === undefined ? "" : element.zielU;
      const uVergleich = a.uMittel !== null ? a.uMittel : a.uWert;
      const uKlasse = uVergleich !== null && element.zielU ? (uVergleich <= element.zielU ? "u-ok" : "u-fail") : "";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${bauteilBezeichnung(element)}</td>
        <td>${a.typName}</td>
        <td>${geoText}</td>
        <td><input type="number" step="1" min="1" data-el="${element.id}" data-field="anzahl" value="${element.anzahl}"></td>
        <td>${a.flaecheBrutto.toFixed(2)}</td>
        <td>${a.oeffnungsFlaeche > 0 ? "−" + a.oeffnungsFlaeche.toFixed(2) : "–"}</td>
        <td>${a.flaecheGesamt.toFixed(2)}</td>
        <td>${a.geometrie.dicke.toFixed(3)}</td>
        <td>${a.masseGesamt.toFixed(0)}</td>
        <td>${uText}</td>
        <td class="${uKlasse}">${a.uMittel === null ? "–" : a.uMittel.toFixed(3)}</td>
        <td><input type="number" step="0.01" min="0" placeholder="–" data-el="${element.id}" data-field="zielU" value="${zielU}" title="Zielwert des U-Werts nach GEG bzw. Bauherrenvorgabe"></td>
        <td class="layer-cell">${schichten}<button class="layer-add" data-el="${element.id}">+ Schicht</button>
          ${a.uHinweis ? `<div class="cut-warning">${a.uHinweis}</div>` : ""}
          <div class="layer-note">flächenbezogene Masse ${a.flaechenmasse.toFixed(0)} kg/m²</div></td>
        <td>${typ.form === "linie" && !typ.unterGelaende
          ? `<button class="tool-btn plain" data-sheet="${element.id}" title="Maßstäbliche Ansicht dieser Wand">📐 Ansicht</button>`
          : "–"}</td>
        <td><button class="row-remove" data-remove-el="${element.id}" title="Bauteil löschen">✕</button></td>`;
      body.appendChild(tr);
    });

    renderOpeningTable();
    renderRaumTable();
    renderMaterialTable();
  }

  function renderMaterialTable() {
    const body = document.getElementById("archMaterialBody");
    body.innerHTML = "";
    const aufstellung = materialAufstellung(Array.from(model.elements.values()), materialPreise, oeffnungenVon);

    aufstellung.forEach((eintrag) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${eintrag.gruppe}</td>
        <td>${eintrag.name}</td>
        <td>${eintrag.rho}</td>
        <td>${eintrag.volumen.toFixed(2)}</td>
        <td>${(eintrag.masse / 1000).toFixed(2)}</td>
        <td><input type="number" step="5" min="0" data-preis="${eintrag.key}" value="${eintrag.preis}"></td>
        <td><strong>${eintrag.kosten.toFixed(2)}</strong></td>`;
      body.appendChild(tr);
    });
  }

  function architekturKosten() {
    return materialAufstellung(Array.from(model.elements.values()), materialPreise, oeffnungenVon)
      .reduce((sum, e) => sum + e.kosten, 0);
  }

  function oeffnungsKosten() {
    let summe = 0;
    model.openings.forEach((o) => {
      const katalog = OEFFNUNGSTYPEN[o.typ];
      const preis = o.preis !== undefined && o.preis !== null ? o.preis : (katalog ? katalog.preis : 0);
      const element = model.elements.get(o.elementId);
      const faktor = element ? (element.anzahl || 1) : 1;
      summe += preis * (o.anzahl || 1) * faktor;
    });
    return summe;
  }

  document.getElementById("archBody").addEventListener("change", (e) => {
    const id = parseInt(e.target.getAttribute("data-el"), 10);
    if (!id) return;
    const element = model.elements.get(id);
    if (!element) return;
    const field = e.target.getAttribute("data-field");
    const layerIndex = e.target.getAttribute("data-layer");

    if (layerIndex !== null && layerIndex !== undefined) {
      const layer = element.layers[parseInt(layerIndex, 10)];
      if (!layer) return;
      if (field === "material") layer.material = e.target.value;
      if (field === "d") layer.d = Math.max(0, parseFloat(e.target.value) || 0);
    } else if (field === "anzahl") {
      element.anzahl = Math.max(1, parseInt(e.target.value, 10) || 1);
    } else if (field === "zielU") {
      const v = parseFloat(e.target.value);
      element.zielU = Number.isFinite(v) && v > 0 ? v : null;
    }
    refreshAll();
  });

  document.getElementById("archBody").addEventListener("click", (e) => {
    const removeEl = e.target.getAttribute("data-remove-el");
    if (removeEl) { model.elements.delete(parseInt(removeEl, 10)); refreshAll(); return; }

    const addTo = e.target.getAttribute("data-el");
    if (addTo && e.target.classList.contains("layer-add")) {
      const element = model.elements.get(parseInt(addTo, 10));
      if (element) { element.layers.push({ material: "mineralwolle", d: 0.06 }); refreshAll(); }
      return;
    }
    if (addTo && e.target.classList.contains("layer-remove")) {
      const element = model.elements.get(parseInt(addTo, 10));
      const index = parseInt(e.target.getAttribute("data-layer"), 10);
      if (element && element.layers.length > 1) { element.layers.splice(index, 1); refreshAll(); }
    }
  });

  document.getElementById("archMaterialBody").addEventListener("input", (e) => {
    const key = e.target.getAttribute("data-preis");
    if (!key) return;
    materialPreise[key] = Math.max(0, parseFloat(e.target.value) || 0);
    renderMaterialTable();
    let steel = 0;
    model.members.forEach((m) => { steel += designMember(m).totalWeight; });
    updateCost(steel);
  });

  document.getElementById("btnBauteil").addEventListener("click", () => setMode("bauteil"));
  document.getElementById("bauteilTyp").addEventListener("change", () => {
    if (mode === "bauteil") setMode("bauteil");
  });


  /* ------------------------------------------------------ Fenster und Türen */

  function oeffnungWert(o, feld) {
    const katalog = OEFFNUNGSTYPEN[o.typ] || {};
    if (feld === "u") return o.u !== undefined && o.u !== null ? o.u : (katalog.uw || 1.3);
    if (feld === "preis") return o.preis !== undefined && o.preis !== null ? o.preis : (katalog.preis || 0);
    return 0;
  }

  /** Positionswarnungen je Öffnung, gesammelt über alle Bauteile. */
  function oeffnungsWarnungen() {
    const alle = new Map();
    model.elements.forEach((element) => {
      const typ = BAUTEILTYPEN[element.kind];
      if (typ.form !== "linie") return;
      const geo = bauteilGeometrie(element);
      const pos = oeffnungsPositionen(oeffnungenVon(element.id), geo.laenge, geo.hoehe);
      pos.warnungen.forEach((texte, id) => alle.set(id, texte));
    });
    return alle;
  }

  function renderOpeningTable() {
    const body = document.getElementById("openingBody");
    const empty = document.getElementById("openingEmpty");
    body.innerHTML = "";
    empty.hidden = model.openings.size > 0;

    const waende = Array.from(model.elements.values());
    const warnungen = oeffnungsWarnungen();
    let pos = 1;

    model.openings.forEach((o) => {
      const element = model.elements.get(o.elementId);
      const faktor = element ? (element.anzahl || 1) : 1;
      const flaeche = (o.breite || 0) * (o.hoehe || 0) * (o.anzahl || 1) * faktor;
      const kosten = oeffnungWert(o, "preis") * (o.anzahl || 1) * faktor;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>F${o.id}</td>
        <td>
          <select data-op="${o.id}" data-field="elementId">
            ${waende.map((el) => `<option value="${el.id}" ${el.id === o.elementId ? "selected" : ""}>${bauteilBezeichnung(el)} · ${BAUTEILTYPEN[el.kind].name}</option>`).join("")}
          </select>
        </td>
        <td>
          <select data-op="${o.id}" data-field="typ">
            ${Object.keys(OEFFNUNGSTYPEN).map((k) => `<option value="${k}" ${k === o.typ ? "selected" : ""}>${OEFFNUNGSTYPEN[k].name}</option>`).join("")}
          </select>
        </td>
        <td><input type="number" step="0.01" min="0.1" data-op="${o.id}" data-field="breite" value="${o.breite}"></td>
        <td><input type="number" step="0.01" min="0.1" data-op="${o.id}" data-field="hoehe" value="${o.hoehe}"></td>
        <td><input type="number" step="0.05" min="0" data-op="${o.id}" data-field="bruestung" value="${o.bruestung}"></td>
        <td><input type="number" step="0.05" min="0" placeholder="auto" data-op="${o.id}" data-field="abstand" value="${o.abstand === null || o.abstand === undefined ? "" : o.abstand}" title="Abstand von der Wandanfangskante bis zur linken Laibung; leer = gleichmäßig verteilt"></td>
        <td><input type="number" step="0.05" min="0" placeholder="auto" data-op="${o.id}" data-field="raster" value="${o.raster === null || o.raster === undefined ? "" : o.raster}" title="Achsabstand der Wiederholungen dieser Position"></td>
        <td><input type="number" step="1" min="1" data-op="${o.id}" data-field="anzahl" value="${o.anzahl}"></td>
        <td>${flaeche.toFixed(2)}</td>
        <td><input type="number" step="0.05" min="0.1" data-op="${o.id}" data-field="u" value="${oeffnungWert(o, "u")}"></td>
        <td><input type="number" step="10" min="0" data-op="${o.id}" data-field="preis" value="${oeffnungWert(o, "preis")}"></td>
        <td><strong>${kosten.toFixed(2)}</strong>${
          warnungen.has(o.id) ? `<span class="warn-flag" title="${warnungen.get(o.id).join(" · ").replace(/"/g, "&quot;")}">!</span>` : ""
        }</td>
        <td><button class="row-remove" data-remove-op="${o.id}" title="Öffnung löschen">✕</button></td>`;
      body.appendChild(tr);
      pos++;
    });
  }

  document.getElementById("btnAddOpening").addEventListener("click", () => {
    const waende = Array.from(model.elements.values()).filter((el) => BAUTEILTYPEN[el.kind].form === "linie" && !BAUTEILTYPEN[el.kind].unterGelaende);
    const ziel = waende[0] || Array.from(model.elements.values())[0];
    if (!ziel) {
      setStatus("Zuerst eine Wand anlegen, dann die Öffnung zuordnen.", "error");
      return;
    }
    const katalog = OEFFNUNGSTYPEN.fenster_3fach;
    model.openings.set(model.nextOpeningId, {
      id: model.nextOpeningId,
      elementId: ziel.id,
      typ: "fenster_3fach",
      breite: katalog.b,
      hoehe: katalog.h,
      bruestung: 0.9,
      abstand: null,
      raster: null,
      anzahl: 1,
      u: null,
      preis: null,
    });
    model.nextOpeningId++;
    refreshAll();
  });

  document.getElementById("openingBody").addEventListener("change", (e) => {
    const id = parseInt(e.target.getAttribute("data-op"), 10);
    if (!id) return;
    const o = model.openings.get(id);
    if (!o) return;
    const field = e.target.getAttribute("data-field");

    if (field === "typ") {
      o.typ = e.target.value;
      const katalog = OEFFNUNGSTYPEN[o.typ];
      // Maße, U-Wert und Preis auf die Katalogwerte des neuen Typs zurücksetzen
      o.breite = katalog.b;
      o.hoehe = katalog.h;
      o.u = null;
      o.preis = null; // Position und Achsabstand bleiben erhalten
    } else if (field === "elementId") {
      o.elementId = parseInt(e.target.value, 10);
    } else if (field === "anzahl") {
      o.anzahl = Math.max(1, parseInt(e.target.value, 10) || 1);
    } else if (field === "u" || field === "preis" || field === "abstand" || field === "raster") {
      const v = parseFloat(e.target.value);
      o[field] = Number.isFinite(v) ? v : null;
    } else {
      o[field] = Math.max(0, parseFloat(e.target.value) || 0);
    }
    refreshAll();
  });

  document.getElementById("openingBody").addEventListener("click", (e) => {
    const id = e.target.getAttribute("data-remove-op");
    if (id) { model.openings.delete(parseInt(id, 10)); refreshAll(); }
  });


  /* -------------------------------------------------- Ansichtszeichnungen */

  let sheetIndex = 0;

  /** Alle Bauteile, für die eine Wandansicht sinnvoll ist. */
  function ansichtsWaende() {
    return Array.from(model.elements.values()).filter((el) => {
      const typ = BAUTEILTYPEN[el.kind];
      return typ.form === "linie" && !typ.unterGelaende;
    });
  }

  function zeichneAnsicht(index) {
    const waende = ansichtsWaende();
    if (!waende.length) return;
    sheetIndex = (index + waende.length) % waende.length;
    const element = waende[sheetIndex];
    const geo = bauteilGeometrie(element);
    const openings = oeffnungenVon(element.id);
    const positionen = oeffnungsPositionen(openings, geo.laenge, geo.hoehe);

    const svg = wandAnsichtSVG({
      element,
      felder: positionen.felder,
      geo,
      auswertung: auswertung(element),
      bezeichnung: bauteilBezeichnung(element),
      projekt: {
        name: document.getElementById("projectName").value,
        datum: document.getElementById("projectDate").value,
        bearbeiter: "Oleksii Severyn",
      },
    });

    sheetArt = "ansicht";
    document.getElementById("sheetBody").innerHTML = svg;
    document.getElementById("sheetTitle").textContent =
      `Ansicht ${bauteilBezeichnung(element)} · ${BAUTEILTYPEN[element.kind].name}`;
    document.getElementById("sheetCounter").textContent = `${sheetIndex + 1} / ${waende.length}`;
    document.getElementById("sheetOverlay").hidden = false;
  }

  document.getElementById("archBody").addEventListener("click", (e) => {
    const id = e.target.getAttribute("data-sheet");
    if (!id) return;
    const waende = ansichtsWaende();
    const pos = waende.findIndex((el) => el.id === parseInt(id, 10));
    zeichneAnsicht(pos >= 0 ? pos : 0);
  });

  /** Aktuell im Blattfenster gezeigte Zeichnung: "ansicht" oder "grundriss". */
  let sheetArt = "ansicht";

  function zeichneGrundriss() {
    const waende = ansichtsWaende();
    if (!waende.length) {
      setStatus("Für den Grundriss zuerst Wände anlegen.", "error");
      return;
    }
    // Bilanzen in derselben Reihenfolge wie die Raumliste (nach Fläche sortiert)
    const bilanzen = raumListe().map((e) => e.bilanz);
    const svg = grundrissSVG({
      waende,
      oeffnungenVon,
      geometrieVon: bauteilGeometrie,
      bezeichnungVon: bauteilBezeichnung,
      bilanzVon: (i) => bilanzen[i] || null,
      treppen: treppenFuerGrundriss(),
      regelText: abzugRegelText(),
      projekt: {
        name: document.getElementById("projectName").value,
        datum: document.getElementById("projectDate").value,
        bearbeiter: "Oleksii Severyn",
      },
    });
    sheetArt = "grundriss";
    document.getElementById("sheetBody").innerHTML = svg;
    document.getElementById("sheetTitle").textContent = "Grundriss";
    const raeume = findeRaeume(waende);
    document.getElementById("sheetCounter").textContent =
      `${waende.length} Wände · ${raeume.length} ${raeume.length === 1 ? "Raum" : "Räume"}`;
    document.getElementById("sheetOverlay").hidden = false;
  }

  document.getElementById("btnGrundriss").addEventListener("click", zeichneGrundriss);

  /** Nächster bzw. vorheriger Bewehrungsplan in der Reihenfolge der Bauteile. */
  function blaettereBewehrung(schritt) {
    const ids = Array.from(model.beton.keys());
    if (!ids.length) return;
    const i = ids.indexOf(bewehrungsplanId);
    zeichneBewehrungsplan(ids[((i < 0 ? 0 : i + schritt) + ids.length) % ids.length]);
  }

  /** Blättern im Blattfenster je nach gezeigter Zeichnungsart. */
  function blaettereBlatt(schritt) {
    if (sheetArt === "bewehrung") blaettereBewehrung(schritt);
    else if (sheetArt === "schalung") blaettereSchalplan(schritt);
    else if (sheetArt === "deckenplan") blaettereDeckenplan(schritt);
    else if (sheetArt === "ansicht") zeichneAnsicht(sheetIndex + schritt);
    else if (sheetArt === "aufmass") blaettereListe(aufmassBlaetter(), aufmassBlattId, schritt,
      "aufmassBlatt", "btnAufmassblatt");
    else if (sheetArt === "querprofile") zeigeQuerprofile(querprofilBlatt + schritt);
    else if (sheetArt === "tagesbericht") blaettereListe(bautage(), tagesberichtId, schritt,
      "tagAuswahl", "btnTagesbericht");
  }

  /** Im Blattfenster durch eine Liste blättern: Auswahlfeld setzen, neu zeichnen. */
  function blaettereListe(liste, aktuelleId, schritt, auswahlId, knopfId) {
    if (!liste.length) return;
    const index = liste.findIndex((e) => e.id === aktuelleId);
    const naechste = liste[(index + schritt + liste.length) % liste.length];
    document.getElementById(auswahlId).value = String(naechste.id);
    document.getElementById(knopfId).click();
  }

  document.getElementById("sheetPrev").addEventListener("click", () => blaettereBlatt(-1));
  document.getElementById("sheetNext").addEventListener("click", () => blaettereBlatt(1));
  document.getElementById("sheetClose").addEventListener("click", () => {
    document.getElementById("sheetOverlay").hidden = true;
  });
  document.getElementById("sheetPrint").addEventListener("click", () => {
    // nur das Blatt drucken: alles andere wird über die Druckvorlage ausgeblendet
    document.body.classList.add("printing-sheet");
    if (window.hsd && typeof window.hsd.drucken === "function") {
      // Der Druckdialog von Windows kommt erst im nächsten Bilddurchgang,
      // damit die Druckvorlage bereits greift
      window.requestAnimationFrame(() => window.hsd.drucken()
        .then(() => document.body.classList.remove("printing-sheet")));
      return;
    }
    window.print();
    window.setTimeout(() => document.body.classList.remove("printing-sheet"), 500);
  });
  /** Dateiname und Inhalt der gerade gezeigten Zeichnung. */
  function aktuellesBlatt() {
    const name = (document.getElementById("projectName").value || "Projekt").replace(/\s+/g, "_");
    const content = document.getElementById("sheetBody").innerHTML;
    const blatt = (filename) => ({ filename, content, mime: "image/svg+xml" });

    if (sheetArt === "grundriss") return blatt(`Grundriss_${name}.svg`);
    if (sheetArt === "bewehrung") {
      const beton = model.beton.get(bewehrungsplanId);
      return blatt(`Bewehrungsplan_${name}_${beton ? betonBezeichnung(beton) : "Bauteil"}.svg`);
    }
    if (sheetArt === "schalung") {
      const beton = model.beton.get(schalplanId);
      return blatt(`Schalplan_${name}_${beton ? betonBezeichnung(beton) : "Bauteil"}.svg`);
    }
    if (sheetArt === "schaluebersicht") return blatt(`Schalplan_Uebersicht_${name}.svg`);
    if (sheetArt === "positionsplan") return blatt(`Positionsplan_${name}.svg`);
    if (sheetArt === "deckenplan") {
      return blatt(`Deckenplan_${name}_OK${(deckenplanEbene || 0).toFixed(2).replace(".", "_")}.svg`);
    }
    if (sheetArt === "aufmass") {
      const am = model.aufmass.get(aufmassBlattId);
      return blatt(`Aufmassblatt_${name}_${(am && am.pos ? am.pos : "Position").replace(/[^\w.-]+/g, "_")}.svg`);
    }
    if (sheetArt === "anschluss") {
      const an = model.anschluesse.get(anschlussBlattId);
      return blatt(`Anschluss_${name}_${(an && an.bezeichnung ? an.bezeichnung : "Anschluss").replace(/[^\w.-]+/g, "_")}.svg`);
    }
    if (sheetArt === "fertigteil") {
      const ft = model.fertigteile.get(ftBlattId);
      return blatt(`Fertigteil_${name}_${(ft && ft.bezeichnung ? ft.bezeichnung : "Element").replace(/[^\w.-]+/g, "_")}.svg`);
    }
    if (sheetArt === "beplan") return blatt(`Baustelleneinrichtungsplan_${name}.svg`);
    if (sheetArt === "balkenplan") return blatt(`Bauzeitenplan_${name}.svg`);
    if (sheetArt === "gelaendeplan") return blatt(`Gelaendeplan_${name}.svg`);
    if (sheetArt === "lageplan") return blatt(`Lageplan_${name}.svg`);
    if (sheetArt === "hoehenplan") return blatt(`Hoehenplan_${name}.svg`);
    if (sheetArt === "querprofile") return blatt(`Querprofile_${name}_Blatt${querprofilBlatt + 1}.svg`);
    if (sheetArt === "tagesbericht") {
      const tag = model.bautagebuch.get(tagesberichtId);
      return blatt(`Tagesbericht_${name}_${(tag && tag.datum) || "Bautag"}.svg`);
    }
    const element = ansichtsWaende()[sheetIndex];
    return element ? blatt(`Ansicht_${name}_${bauteilBezeichnung(element)}.svg`) : null;
  }

  document.getElementById("sheetSvg").addEventListener("click", () => {
    const blatt = aktuellesBlatt();
    if (blatt) saveFile(blatt.filename, blatt.content, blatt.mime);
  });
  document.getElementById("sheetTeilen").addEventListener("click", () => teileDatei(aktuellesBlatt()));
  window.addEventListener("keydown", (e) => {
    if (document.getElementById("sheetOverlay").hidden) return;
    if (e.key === "Escape") document.getElementById("sheetOverlay").hidden = true;
    if (e.key === "ArrowLeft") blaettereBlatt(-1);
    if (e.key === "ArrowRight") blaettereBlatt(1);
  });


  /* ------------------------------------------------------------- Räume */

  /** Gewähltes Regelwerk der Flächenermittlung: "din277" oder "woflv". */
  function abzugRegel() {
    const feld = document.getElementById("abzugRegel");
    return feld ? feld.value : "woflv";
  }

  function abzugRegelText() {
    return abzugRegel() === "woflv"
      ? "WoFlV § 3 Abs. 3 (mit Schwellenwerten)"
      : "DIN 277-1 (jede Konstruktionsfläche)";
  }

  /** Schwellenwerte aus den Eingabefeldern; Voreinstellung nach WoFlV § 3 Abs. 3. */
  function abzugGrenzen() {
    const zahl = (id, fallback) => {
      const feld = document.getElementById(id);
      const v = feld ? parseFloat(feld.value) : NaN;
      return Number.isFinite(v) && v >= 0 ? v : fallback;
    };
    return {
      mindestFlaeche: zahl("grenzFlaeche", ABZUG_GRENZEN.mindestFlaeche),
      mindestHoehe: zahl("grenzHoehe", ABZUG_GRENZEN.mindestHoehe),
      mindestNischentiefe: zahl("grenzTiefe", ABZUG_GRENZEN.mindestNischentiefe),
    };
  }

  /** Alle Positionen, die dem Raum mit der Nummer (1-basiert) zugeordnet sind. */
  function abzuegeVon(raumNummer) {
    return Array.from(model.abzuege.values()).filter((a) => a.raum === raumNummer);
  }

  function raumListe() {
    const waende = ansichtsWaende();
    if (waende.length < 3) return [];
    const dickeVon = (wand) => (wand ? bauteilGeometrie(wand).dicke : 0);
    const regel = abzugRegel();
    const grenzen = abzugGrenzen();
    return findeRaeume(waende).map((raum, i) => {
      const licht = lichteRaumflaeche(raum, dickeVon);
      const bilanz = raumBilanz(licht.ok ? licht.flaeche : 0, abzuegeVon(i + 1), regel, grenzen);
      return { raum, licht, bilanz };
    });
  }

  function renderRaumTable() {
    const body = document.getElementById("raumBody");
    const empty = document.getElementById("raumEmpty");
    body.innerHTML = "";
    const liste = raumListe();
    empty.hidden = liste.length > 0;

    liste.forEach(({ raum, licht, bilanz }, i) => {
      // begrenzende Wände ohne Wiederholung auflisten
      const namen = [];
      raum.waende.forEach((w) => {
        const name = w ? bauteilBezeichnung(w) : null;
        if (name && namen.indexOf(name) === -1) namen.push(name);
      });
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>R${i + 1}</td>
        <td><strong>${licht.ok ? bilanz.netto.toFixed(2) : "–"}</strong>${
          bilanz.ueberzogen ? `<span class="warn-flag" title="Die Abzüge übersteigen die lichte Fläche – Maße prüfen.">!</span>` : ""
        }</td>
        <td>${licht.ok ? licht.flaeche.toFixed(2) : "–"}</td>
        <td>${bilanz.abzug > 0 ? "−" + bilanz.abzug.toFixed(2) : "–"}</td>
        <td>${bilanz.zuschlag > 0 ? "+" + bilanz.zuschlag.toFixed(2) : "–"}</td>
        <td>${raum.flaeche.toFixed(2)}</td>
        <td>${licht.ok ? (raum.flaeche - licht.flaeche).toFixed(2) : "–"}</td>
        <td>${licht.ok ? licht.umfang.toFixed(2) : "–"}</td>
        <td class="cut-labels">${namen.join(", ")}</td>`;
      body.appendChild(tr);
    });

    renderAbzugTable(liste.length);
  }

  /** Abzüge und Nischen je Raum. */
  function renderAbzugTable(raumAnzahl) {
    const body = document.getElementById("abzugBody");
    const empty = document.getElementById("abzugEmpty");
    body.innerHTML = "";
    empty.hidden = model.abzuege.size > 0;

    const anzahlRaeume = raumAnzahl === undefined ? raumListe().length : raumAnzahl;
    const regel = abzugRegel();
    const grenzen = abzugGrenzen();
    const nummern = [];
    for (let i = 1; i <= Math.max(anzahlRaeume, 1); i++) nummern.push(i);

    model.abzuege.forEach((a) => {
      const w = abzugsWirkung(a, regel, grenzen);
      const verwaist = a.raum > anzahlRaeume;
      const wirkung = w.art === "abzug"
        ? `<span class="wirk-abzug">− ${w.flaeche.toFixed(2)} m²</span>`
        : w.art === "zuschlag"
          ? `<span class="wirk-zuschlag">+ ${w.flaeche.toFixed(2)} m²</span>`
          : `<span class="wirk-keine">ohne Wirkung</span>`;
      const istNische = ABZUGSTYPEN[a.typ] && ABZUGSTYPEN[a.typ].wirkung === "zuschlag";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>A${a.id}</td>
        <td>
          <select data-abz="${a.id}" data-field="raum">
            ${nummern.map((n) => `<option value="${n}" ${n === a.raum ? "selected" : ""}>R${n}</option>`).join("")}
          </select>${verwaist ? `<span class="warn-flag" title="Diesem Raum ist keine erkannte Raumfläche zugeordnet.">!</span>` : ""}
        </td>
        <td>
          <select data-abz="${a.id}" data-field="typ">
            ${Object.keys(ABZUGSTYPEN).map((k) => `<option value="${k}" ${k === a.typ ? "selected" : ""}>${ABZUGSTYPEN[k].name}</option>`).join("")}
          </select>
        </td>
        <td><input type="number" step="0.01" min="0" data-abz="${a.id}" data-field="breite" value="${a.breite}"></td>
        <td><input type="number" step="0.01" min="0" data-abz="${a.id}" data-field="tiefe" value="${a.tiefe}" title="Tiefe der Grundfläche, bei Nischen die Nischentiefe"></td>
        <td><input type="number" step="0.05" min="0" data-abz="${a.id}" data-field="hoehe" value="${a.hoehe}" title="Höhe des Bauteils über dem Fußboden"></td>
        <td><input type="number" step="1" min="1" data-abz="${a.id}" data-field="anzahl" value="${a.anzahl}"></td>
        <td>${istNische
          ? `<input type="checkbox" data-abz="${a.id}" data-field="bisFussboden" ${a.bisFussboden ? "checked" : ""} title="Nur Nischen bis zur Fußbodenoberkante liegen innerhalb der lichten Maße">`
          : "–"}</td>
        <td>${(w.einzelflaeche * Math.max(1, a.anzahl || 1)).toFixed(3)}</td>
        <td>${wirkung}</td>
        <td class="cut-labels">${w.hinweis}${a.bemerkung ? " · " + a.bemerkung : ""}</td>
        <td><button class="row-remove" data-remove-abz="${a.id}" title="Position löschen">✕</button></td>`;
      body.appendChild(tr);
    });
  }

  document.getElementById("btnAddAbzug").addEventListener("click", () => {
    model.abzuege.set(model.nextAbzugId, {
      id: model.nextAbzugId,
      raum: 1,
      typ: "stuetze",
      breite: 0.24,
      tiefe: 0.24,
      hoehe: 2.75,
      anzahl: 1,
      bisFussboden: true,
      bemerkung: "",
    });
    model.nextAbzugId++;
    refreshAll();
  });

  document.getElementById("abzugBody").addEventListener("change", (e) => {
    const id = parseInt(e.target.getAttribute("data-abz"), 10);
    if (!id) return;
    const a = model.abzuege.get(id);
    if (!a) return;
    const field = e.target.getAttribute("data-field");

    if (field === "typ") {
      a.typ = e.target.value;
      // Nischen werden über die Tiefe beurteilt, Stützen über Grundfläche und Höhe
      if (ABZUGSTYPEN[a.typ] && ABZUGSTYPEN[a.typ].wirkung === "zuschlag" && a.bisFussboden === undefined) {
        a.bisFussboden = true;
      }
    } else if (field === "raum" || field === "anzahl") {
      a[field] = Math.max(1, parseInt(e.target.value, 10) || 1);
    } else if (field === "bisFussboden") {
      a.bisFussboden = e.target.checked;
    } else {
      a[field] = Math.max(0, parseFloat(e.target.value) || 0);
    }
    refreshAll();
  });

  document.getElementById("abzugBody").addEventListener("click", (e) => {
    const id = e.target.getAttribute("data-remove-abz");
    if (id) { model.abzuege.delete(parseInt(id, 10)); refreshAll(); }
  });

  ["abzugRegel", "grenzFlaeche", "grenzHoehe", "grenzTiefe"].forEach((id) => {
    document.getElementById(id).addEventListener("change", refreshAll);
  });

  /* --------------------------------------------------------- Betonbauteile */

  /** Arbeitsraum je Seite für den Aushub; Mindestmaß 0,50 m nach DIN 4124. */
  function arbeitsraumWert() {
    const v = parseFloat(document.getElementById("arbeitsraum").value);
    return Number.isFinite(v) && v >= 0 ? v : ARBEITSRAUM_DIN4124;
  }

  function betonPreise() {
    const v = (id) => parseFloat(document.getElementById(id).value) || 0;
    return { beton: v("preisBeton"), schalung: v("preisSchalung"), bewehrung: v("preisBewehrung"), aushub: v("preisAushub") };
  }

  function betonBezeichnung(element) {
    const typ = BETONTEILTYPEN[element.kind];
    return (typ ? typ.kuerzel : "BT") + element.id;
  }

  function betonWertung(element) {
    return betonAuswertung(element, arbeitsraumWert());
  }

  function handleBetonPick(point) {
    const kind = document.getElementById("betonTyp").value;
    const typ = BETONTEILTYPEN[kind];

    if (typ.form === "punkt") {
      erzeugeBetonteil(kind, point, null);
      return;
    }
    if (!pendingBetonPoint) {
      pendingBetonPoint = point;
      setStatus(`${typ.name}: zweiten Punkt anklicken.`, "info");
      renderSketch();
      return;
    }
    erzeugeBetonteil(kind, pendingBetonPoint, point);
    pendingBetonPoint = null;
  }

  function erzeugeBetonteil(kind, p1, p2) {
    const typ = BETONTEILTYPEN[kind];
    const element = {
      id: model.nextBetonId++,
      kind,
      p1: { ...p1 },
      p2: p2 ? { ...p2 } : null,
      masse: { ...typ.standard },
      guete: document.getElementById("betonGuete").value || "C25/30",
      expo: typ.expo,
      ds: 12,
      sauberkeit: true,
      bewehrungsgrad: typ.bewehrung,
      anzahl: 1,
    };
    if (typ.treppe) {
      // Voreinstellung nach DIN 18065; im Reiter Beton überschreibbar
      element.nutzung = document.getElementById("treppeNutzung").value || "wohnung2";
      element.durchgangshoehe = DURCHGANGSHOEHE_MIN;
      element.podestlaenge = element.masse.laufbreite;
    }
    model.beton.set(element.id, element);

    const a = betonWertung(element);
    setStatus(`${typ.name} ${betonBezeichnung(element)} gesetzt: ${a.geo.beschreibung} · `
      + `${a.volumen.toFixed(2)} m³ Beton, ${a.schalung.toFixed(2)} m² Schalung, `
      + `${a.bewehrung.toFixed(0)} kg Betonstahl, c_nom = ${a.deckung.cNom} mm`, "ok");
    refreshAll();
  }

  function renderBetonElements(scene, transparent) {
    const raum = arbeitsraumWert();
    model.beton.forEach((element) => {
      const geo = betonGeometrie(element, raum);
      scene.contentGroup.add(buildConcreteElement(element, geo, transparent ? 0.5 : 1));
    });
  }

  function renderBetonTable() {
    const body = document.getElementById("betonBody");
    const empty = document.getElementById("betonEmpty");
    body.innerHTML = "";
    empty.hidden = model.beton.size > 0;

    model.beton.forEach((element) => {
      const a = betonWertung(element);
      const typ = a.typ;

      const feldName = (f) => (typ.feldNamen && typ.feldNamen[f]) || BETON_FELD_NAMEN[f];
      const felder = typ.felder.map((f) => {
        const schritt = BETON_FELD_SCHRITT[f] || { step: 0.05, min: 0.01 };
        return `
        <span class="layer-row">
          <label class="masse-label" title="${feldName(f)}">${feldName(f).replace(/ \[m\]$/, "")}</label>
          <input type="number" step="${schritt.step}" min="${schritt.min}" data-bt="${element.id}" data-mass="${f}" value="${element.masse[f]}">
        </span>`;
      }).join("");
      const achse = element.kind === "treppe" && a.geo.treppe
        ? `<div class="layer-note">Lauflänge ${zahl(a.geo.treppe.lauflaenge, 2)} m · `
          + `s = ${zahl(a.geo.treppe.steigung * 100, 1)} cm · ${zahl(a.geo.treppe.winkel, 1)}° · `
          + `2s+a = ${zahl(a.geo.treppe.schrittmass * 100, 1)} cm</div>`
        : typ.form === "linie"
          ? `<div class="layer-note">Achslänge ${a.geo.laenge.toFixed(2)} m</div>`
          : typ.form === "flaeche"
            ? `<div class="layer-note">Grundriss ${a.geo.laenge.toFixed(2)} × ${a.geo.breite.toFixed(2)} m</div>`
            : "";

      const hinweise = a.warnungen.slice();
      if (element.kind === "bohrpfahl") {
        hinweise.push("Betondeckung und Herstellung nach DIN EN 1536, Tragfähigkeit nach DIN EN 1997-1 mit DIN 1054 prüfen.");
      }
      if (a.flaechenlast) {
        hinweise.push(`Eigenlast g_k = ${a.flaechenlast.toFixed(2)} kN/m².`);
      }

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${betonBezeichnung(element)}</td>
        <td>${typ.name}<div class="layer-note">f_cd = ${a.kennwerte.fcd.toFixed(1)} N/mm² · E_cm = ${(a.kennwerte.Ecm / 1000).toFixed(0)} GPa</div></td>
        <td class="layer-cell">${felder}${achse}</td>
        <td><input type="number" step="1" min="1" data-bt="${element.id}" data-field="anzahl" value="${element.anzahl}"></td>
        <td>
          <select data-bt="${element.id}" data-field="guete">
            ${Object.keys(BETONGUETEN).map((k) => `<option value="${k}" ${k === element.guete ? "selected" : ""}>${k}</option>`).join("")}
          </select>
        </td>
        <td>
          <select data-bt="${element.id}" data-field="expo" title="Expositionsklasse nach DIN EN 206-1 / DIN 1045-2">
            ${Object.keys(EXPOSITIONSKLASSEN).map((k) => `<option value="${k}" ${k === element.expo ? "selected" : ""}>${EXPOSITIONSKLASSEN[k].name}</option>`).join("")}
          </select>
          ${typ.erdreich ? `<label class="tool-check small"><input type="checkbox" data-bt="${element.id}" data-field="sauberkeit" ${element.sauberkeit !== false ? "checked" : ""}> Sauberkeitsschicht</label>` : ""}
        </td>
        <td><input type="number" step="2" min="6" max="40" data-bt="${element.id}" data-field="ds" value="${element.ds}" title="Größter Stabdurchmesser; c_min,b nach DIN EN 1992-1-1 Abs. 4.4.1.2"></td>
        <td><strong>${a.deckung.cNom}</strong><div class="layer-note">${a.deckung.massgebend}</div></td>
        <td>${a.volumen.toFixed(2)}</td>
        <td>${a.schalung.toFixed(2)}</td>
        <td><input type="number" step="5" min="0" data-bt="${element.id}" data-field="bewehrungsgrad" value="${a.bewehrungsgrad}" title="Erfahrungswert für die Kostenschätzung"></td>
        <td>${a.bewehrung.toFixed(0)}</td>
        <td>${a.aushub > 0 ? a.aushub.toFixed(2) : "–"}</td>
        <td>${(a.masse / 1000).toFixed(2)}</td>
        <td class="cut-labels">${hinweise.map((h) => (a.warnungen.indexOf(h) >= 0 ? `<span class="cut-warning">${h}</span>` : h)).join(" ")}</td>
        <td><button class="tool-btn plain" data-schal="${element.id}" title="Schalplan mit Maßketten, Höhenkoten und Schalflächen">🧱 Plan</button></td>
        <td><button class="row-remove" data-remove-bt="${element.id}" title="Betonbauteil löschen">✕</button></td>`;
      body.appendChild(tr);
    });

    renderTreppenTabelle();
    renderDeckenTable();
    renderSchalungsliste();
    renderBewehrungTable();
    renderAutoReport();
    renderStahlliste();
    renderBetonKosten();
  }

  /* ------------------------------------------------------------ Bewehrung */

  /** Allgemeine Bewehrungsvorgaben aus den Eingabefeldern. */
  function bewehrungVorgabe() {
    const zahl = (id, fallback) => {
      const v = parseFloat(document.getElementById(id).value);
      return Number.isFinite(v) && v > 0 ? v : fallback;
    };
    return {
      lieferlaenge: zahl("lieferlaenge", BEWEHRUNG_VORGABE.lieferlaenge),
      stossFaktor: zahl("stossFaktor", BEWEHRUNG_VORGABE.stossFaktor),
      haken: document.getElementById("hakenAktiv").value !== "nein",
    };
  }

  /** Bewehrung eines Bauteils: Positionen, Ansichten und Hinweise. */
  function bewehrungVon(element) {
    const geo = betonGeometrie(element, arbeitsraumWert());
    const deckung = betondeckung(element);
    const b = bewehrungPositionen(element, geo, deckung, bewehrungVorgabe());
    return { geo, deckung, positionen: b.positionen, hinweise: b.hinweise, parameter: b.parameter };
  }

  /** Stahlliste über alle Betonbauteile. */
  function gesamteStahlliste() {
    const eintraege = [];
    model.beton.forEach((element) => {
      const b = bewehrungVon(element);
      eintraege.push({ bauteil: betonBezeichnung(element), anzahlBauteile: element.anzahl || 1, positionen: b.positionen });
    });
    return stahlliste(eintraege);
  }

  function renderBewehrungTable() {
    const body = document.getElementById("bewehrungBody");
    const empty = document.getElementById("bewehrungEmpty");
    body.innerHTML = "";
    empty.hidden = model.beton.size > 0;

    model.beton.forEach((element) => {
      const typ = BETONTEILTYPEN[element.kind];
      const b = bewehrungVon(element);
      const liste = stahlliste([{ bauteil: betonBezeichnung(element), anzahlBauteile: element.anzahl || 1, positionen: b.positionen }]);
      const volumen = b.geo.volumen * Math.max(1, element.anzahl || 1);
      const istGrad = volumen > 0 ? liste.gesamtMasse / volumen : 0;
      const ansatz = Number.isFinite(element.bewehrungsgrad) ? element.bewehrungsgrad : typ.bewehrung;

      const felder = Object.keys(BEWEHRUNG_STANDARD[element.kind] || {}).map((f) => {
        const wert = b.parameter[f];
        if (f === "obenAktiv") {
          return `<span class="layer-row"><label class="masse-label">${bewehrungFeldName(element.kind, f)}</label>
            <input type="checkbox" data-bw="${element.id}" data-feld="${f}" ${wert ? "checked" : ""}></span>`;
        }
        return `<span class="layer-row"><label class="masse-label">${bewehrungFeldName(element.kind, f)}</label>
          <input type="number" step="${f.indexOf("ds") === 0 ? 2 : f.indexOf("n") === 0 ? 1 : 10}" min="1" data-bw="${element.id}" data-feld="${f}" value="${wert}"></span>`;
      }).join("")
        // Stützen: Normalkraft für die Mindestbewehrung nach Abs. 9.5.2
        + (element.kind === "stuetze" || element.kind === "stuetze_rund"
          ? `<span class="layer-row"><label class="masse-label" title="Bemessungswert der Normalkraft für A_s,min = 0,10·N_Ed/f_yd">N_Ed [kN]</label>
             <input type="number" step="10" min="0" data-bw="${element.id}" data-feld="nEd" value="${element.nEd || 0}"></span>`
          : "");

      const positionen = b.positionen.map((pos) => `${pos.nr}. ${pos.anzahl}⌀${pos.ds}`).join(" · ");
      const abweichung = ansatz > 0 ? istGrad / ansatz : 1;
      const klasse = abweichung > 1.15 ? "u-fail" : abweichung < 0.6 ? "u-warn" : "u-ok";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${betonBezeichnung(element)}</td>
        <td>${typ.name}</td>
        <td class="layer-cell">${felder}</td>
        <td class="cut-labels">${positionen}</td>
        <td><strong>${liste.gesamtMasse.toFixed(0)}</strong></td>
        <td class="${klasse}">${istGrad.toFixed(0)}</td>
        <td>${ansatz}</td>
        <td><button class="tool-btn plain" data-plan="${element.id}" title="Bewehrungsplan mit Stahlliste">📐 Plan</button></td>`;
      body.appendChild(tr);
    });
  }

  /** Ergebnis des letzten Laufs der automatischen Bewehrung. */
  let autoBewehrungReport = [];

  /**
   * Wählt für alle Betonbauteile die konstruktive Mindestbewehrung nach
   * DIN EN 1992-1-1 Abschnitt 9 und schreibt sie in die Bauteile.
   */
  function erzeugeAutomatischeBewehrung() {
    if (!model.beton.size) {
      setStatus("Für die automatische Bewehrung zuerst Betonbauteile anlegen.", "error");
      return;
    }
    const raum = arbeitsraumWert();
    const bericht = [];
    let geaendert = 0, offen = 0;

    model.beton.forEach((element) => {
      const geo = betonGeometrie(element, raum);
      const deckung = betondeckung(element);
      const ergebnis = automatischeBewehrung(element, geo, deckung, { nEd: element.nEd || 0 });
      if (!ergebnis.moeglich) {
        offen++;
        bericht.push({
          bauteil: betonBezeichnung(element), typName: BETONTEILTYPEN[element.kind].name,
          nachweis: null, hinweise: ergebnis.hinweise,
        });
        return;
      }
      element.bewehrung = Object.assign({}, element.bewehrung || {}, ergebnis.parameter);
      geaendert++;
      bericht.push({
        bauteil: betonBezeichnung(element), typName: BETONTEILTYPEN[element.kind].name,
        nachweis: ergebnis.nachweis, hinweise: ergebnis.hinweise,
      });
    });

    autoBewehrungReport = bericht;
    const liste = gesamteStahlliste();
    setStatus(`Mindestbewehrung nach DIN EN 1992-1-1 Abschnitt 9 für ${geaendert} Bauteil${geaendert === 1 ? "" : "e"} gewählt`
      + (offen ? `, ${offen} Bauteil${offen === 1 ? "" : "e"} bleiben manuell` : "")
      + ` · Betonstahl gesamt ${liste.gesamtMasse.toFixed(0)} kg. Die Bemessung kann mehr erfordern.`, "ok");
    refreshAll();
  }

  function renderAutoReport() {
    const titel = document.getElementById("autoReportTitel");
    const tabelle = document.getElementById("autoReportTable");
    const body = document.getElementById("autoReportBody");
    body.innerHTML = "";
    const zeigen = autoBewehrungReport.length > 0;
    titel.hidden = !zeigen;
    tabelle.hidden = !zeigen;
    if (!zeigen) return;

    autoBewehrungReport.forEach((z) => {
      const n = z.nachweis;
      const tr = document.createElement("tr");
      if (!n) {
        tr.innerHTML = `<td>${z.bauteil}</td><td>${z.typName}</td>
          <td colspan="5" class="cut-labels">manuell festzulegen</td>
          <td class="cut-labels">${z.hinweise.join(" ")}</td>`;
      } else {
        const klasse = n.unzureichend ? "u-fail" : "u-ok";
        tr.innerHTML = `
          <td>${z.bauteil}</td>
          <td>${n.art}</td>
          <td><strong>${n.gewaehlt}</strong></td>
          <td>${n.asMin.toFixed(2)}</td>
          <td class="${klasse}">${n.asVorh.toFixed(2)}</td>
          <td>${(n.auslastung * 100).toFixed(0)} %</td>
          <td>${n.sMax.toFixed(0)}</td>
          <td class="cut-labels">${z.hinweise.join(" · ")}</td>`;
      }
      body.appendChild(tr);
    });
  }

  /**
   * Bewehrungs- und Biegedaten als JSON für die Weiterverarbeitung im
   * Python-Werkzeug (Biegeliste, Stahlauszug, Schneidoptimierung).
   */
  function biegedatenJson() {
    const raum = arbeitsraumWert();
    const vorgabe = bewehrungVorgabe();
    const bauteile = [];
    model.beton.forEach((element) => {
      const b = bewehrungVon(element);
      bauteile.push({
        pos: betonBezeichnung(element),
        art: element.kind,
        artName: BETONTEILTYPEN[element.kind].name,
        anzahl: Math.max(1, element.anzahl || 1),
        beton: { guete: element.guete, expositionsklasse: element.expo },
        betondeckung_mm: b.deckung.cNom,
        geometrie: {
          laenge_m: b.geo.laenge, breite_m: b.geo.breite, hoehe_m: b.geo.hoehe,
          dicke_m: b.geo.dicke, volumen_m3: b.geo.volumen, beschreibung: b.geo.beschreibung,
        },
        bewehrung: bewehrungParameter(element),
        positionen: b.positionen.map((pos) => ({
          nr: pos.nr, bezeichnung: pos.name, biegeform: pos.form, biegeformName: pos.formName,
          ds_mm: pos.ds, anzahl: pos.anzahl, einzellaenge_m: pos.einzelLaenge,
          gesamtlaenge_m: pos.gesamtLaenge, masse_kg: pos.masse,
          biegerolle_mm: pos.biegerolle, biegemasse_m: pos.masseAngaben, bemerkung: pos.bemerkung,
        })),
      });
    });

    return {
      erzeuger: "HSD Hamburg GmbH · Stahlbau- und Architektur-Konverter",
      erstellt: new Date().toISOString(),
      projekt: {
        name: document.getElementById("projectName").value || "Projekt",
        datum: document.getElementById("projectDate").value,
        bearbeiter: "Oleksii Severyn",
      },
      betonstahl: { sorte: "B500B", norm: "DIN 488-1", fyk_n_mm2: BETONSTAHL_FYK, dichte_kg_m3: 7850 },
      vorgaben: {
        lieferlaenge_m: vorgabe.lieferlaenge,
        stossfaktor_x_ds: vorgabe.stossFaktor,
        endhaken: vorgabe.haken,
        hinweis: "Einzellängen ohne Abzug der Biegerollendurchmesser; Biegerollen nach DIN EN 1992-1-1 Tab. 8.1N.",
      },
      bauteile,
    };
  }

  document.getElementById("btnAutoBewehrung").addEventListener("click", erzeugeAutomatischeBewehrung);
  document.getElementById("btnBiegelisteJson").addEventListener("click", () => {
    if (!model.beton.size) {
      setStatus("Keine Betonbauteile vorhanden.", "error");
      return;
    }
    const name = (document.getElementById("projectName").value || "Projekt").replace(/\s+/g, "_");
    saveFile(`Biegedaten_${name}.json`, JSON.stringify(biegedatenJson(), null, 2), "application/json");
    setStatus("Biegedaten gespeichert – Weiterverarbeitung mit „python -m hsd_bewehrung“ im Ordner python/.", "ok");
  });

  function renderStahlliste() {
    const body = document.getElementById("stahllisteBody");
    const empty = document.getElementById("stahllisteEmpty");
    body.innerHTML = "";
    const liste = gesamteStahlliste();
    empty.hidden = liste.zeilen.length > 0;

    liste.zeilen.forEach((z) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${z.bauteil}</td>
        <td>${z.pos}</td>
        <td>${z.name}</td>
        <td>${z.formName}</td>
        <td>${z.ds}</td>
        <td>${z.anzahl}</td>
        <td>${z.einzelLaenge.toFixed(2)}</td>
        <td>${z.gesamtLaenge.toFixed(2)}</td>
        <td>${z.masseJeMeter.toFixed(3)}</td>
        <td><strong>${z.masse.toFixed(1)}</strong></td>
        <td>${z.biegerolle}</td>
        <td class="cut-labels">${z.bemerkung || "–"}</td>`;
      body.appendChild(tr);
    });

    if (liste.zeilen.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="9"><strong>Summe Betonstahl B500B</strong></td>
        <td><strong>${liste.gesamtMasse.toFixed(1)}</strong></td><td></td><td></td>`;
      body.appendChild(tr);
    }

    const auszug = document.getElementById("stahlauszugBody");
    auszug.innerHTML = "";
    liste.jeDurchmesser.forEach((e) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>⌀ ${e.ds}</td>
        <td>${stabFlaeche(e.ds).toFixed(2)}</td>
        <td>${e.stueck}</td>
        <td>${e.laenge.toFixed(2)}</td>
        <td>${stabMasse(e.ds).toFixed(3)}</td>
        <td><strong>${e.masse.toFixed(1)}</strong></td>`;
      auszug.appendChild(tr);
    });
    if (liste.jeDurchmesser.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="5"><strong>Summe</strong></td><td><strong>${liste.gesamtMasse.toFixed(1)} kg = ${(liste.gesamtMasse / 1000).toFixed(3)} t</strong></td>`;
      auszug.appendChild(tr);
    }
  }

  /** Masse des Betonstahls für den Kostenansatz, je nach gewählter Grundlage. */
  function stahlKostenMasse() {
    if (document.getElementById("stahllisteKosten").value !== "liste") return null;
    return gesamteStahlliste().gesamtMasse;
  }

  function zeichneBewehrungsplan(elementId) {
    const element = model.beton.get(elementId);
    if (!element) return;
    const typ = BETONTEILTYPEN[element.kind];
    const b = bewehrungVon(element);
    const ansichten = bewehrungAnsichten(element, b.geo, b.deckung, b.positionen);

    const svg = bewehrungsplanSVG({
      element, geo: b.geo, deckung: b.deckung,
      bezeichnung: betonBezeichnung(element), typName: typ.name,
      positionen: b.positionen, ansichten, hinweise: b.hinweise,
      guete: element.guete, expo: element.expo,
      volumen: b.geo.volumen * Math.max(1, element.anzahl || 1),
      projekt: {
        name: document.getElementById("projectName").value,
        datum: document.getElementById("projectDate").value,
        bearbeiter: "Oleksii Severyn",
      },
    });

    sheetArt = "bewehrung";
    bewehrungsplanId = elementId;
    document.getElementById("sheetBody").innerHTML = svg;
    document.getElementById("sheetTitle").textContent = `Bewehrungsplan ${betonBezeichnung(element)} · ${typ.name}`;
    const ids = Array.from(model.beton.keys());
    document.getElementById("sheetCounter").textContent = `${ids.indexOf(elementId) + 1} / ${ids.length}`;
    document.getElementById("sheetOverlay").hidden = false;
  }

  let bewehrungsplanId = null;

  document.getElementById("bewehrungBody").addEventListener("click", (e) => {
    const id = e.target.getAttribute("data-plan");
    if (id) zeichneBewehrungsplan(parseInt(id, 10));
  });

  document.getElementById("bewehrungBody").addEventListener("change", (e) => {
    const id = parseInt(e.target.getAttribute("data-bw"), 10);
    if (!id) return;
    const element = model.beton.get(id);
    if (!element) return;
    const feld = e.target.getAttribute("data-feld");
    if (!element.bewehrung) element.bewehrung = {};
    if (feld === "obenAktiv") element.bewehrung.obenAktiv = e.target.checked;
    else if (feld === "nEd") element.nEd = Math.max(0, parseFloat(e.target.value) || 0);
    else element.bewehrung[feld] = Math.max(1, parseFloat(e.target.value) || 1);
    refreshAll();
  });

  ["lieferlaenge", "stossFaktor", "hakenAktiv", "stahllisteKosten"].forEach((id) => {
    document.getElementById(id).addEventListener("change", refreshAll);
  });

  function renderBetonKosten() {
    const body = document.getElementById("betonKostenBody");
    body.innerHTML = "";
    const positionen = betonAufstellung(Array.from(model.beton.values()), betonPreise(), arbeitsraumWert(), stahlKostenMasse());
    positionen.forEach((pos) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${pos.name}</td>
        <td>${pos.menge.toFixed(2)}</td>
        <td>${pos.einheit}</td>
        <td>${pos.preis.toFixed(2)}</td>
        <td><strong>${pos.kosten.toFixed(2)}</strong></td>`;
      body.appendChild(tr);
    });
    const summe = positionen.reduce((s, p) => s + p.kosten, 0);
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><strong>Summe Betonbau</strong></td><td></td><td></td><td></td><td><strong>${summe.toFixed(2)}</strong></td>`;
    body.appendChild(tr);
  }

  function betonKosten() {
    return betonAufstellung(Array.from(model.beton.values()), betonPreise(), arbeitsraumWert(), stahlKostenMasse())
      .reduce((s, p) => s + p.kosten, 0);
  }

  document.getElementById("btnBetonteil").addEventListener("click", () => setMode("beton"));
  document.getElementById("betonTyp").addEventListener("change", () => { if (mode === "beton") setMode("beton"); });

  document.getElementById("betonBody").addEventListener("change", (e) => {
    const id = parseInt(e.target.getAttribute("data-bt"), 10);
    if (!id) return;
    const element = model.beton.get(id);
    if (!element) return;
    const massFeld = e.target.getAttribute("data-mass");
    const field = e.target.getAttribute("data-field");

    if (massFeld) {
      element.masse[massFeld] = Math.max(0.01, parseFloat(e.target.value) || 0.01);
    } else if (field === "anzahl") {
      element.anzahl = Math.max(1, parseInt(e.target.value, 10) || 1);
    } else if (field === "ds" || field === "bewehrungsgrad") {
      element[field] = Math.max(0, parseFloat(e.target.value) || 0);
    } else if (field === "sauberkeit") {
      element.sauberkeit = e.target.checked;
    } else if (field) {
      element[field] = e.target.value;
    }
    refreshAll();
  });

  document.getElementById("betonBody").addEventListener("click", (e) => {
    const plan = e.target.getAttribute("data-schal");
    if (plan) { zeichneSchalplan(parseInt(plan, 10)); return; }
    const id = e.target.getAttribute("data-remove-bt");
    if (id) { model.beton.delete(parseInt(id, 10)); refreshAll(); }
  });

  /* -------------------------------------------------------------- Decken */

  /** Alle Deckenebenen mit ihren Platten und den Bauteilen darunter. */
  function deckenEbenenAktuell() {
    const raum = arbeitsraumWert();
    const ebenen = deckenEbenen(Array.from(model.beton.values()), betonGeometrie, raum);
    // Grundrissfiguren für die Darstellung der Auflager anhängen
    const figuren = new Map();
    betonGrundrissFiguren(Array.from(model.beton.values()), betonGeometrie, betonBezeichnung, raum)
      .forEach((f) => figuren.set(f.element.id, f));
    ebenen.forEach((ebene) => {
      ebene.darunter.forEach((e) => { e.figur = figuren.get(e.element.id) || null; });
    });
    return ebenen;
  }

  /** Gewählte Deckenebene aus dem Auswahlfeld. */
  /* -------------------------------------------- Treppen nach DIN 18065 */

  /** Alle Treppenbauteile in Reihenfolge der Position. */
  function treppenBauteile() {
    return Array.from(model.beton.values()).filter((e) => e.kind === "treppe");
  }

  /** Aktuell im Abschnitt „Treppen" gewählte Treppe. */
  function gewaehlteTreppe() {
    const treppen = treppenBauteile();
    if (!treppen.length) return null;
    const id = parseInt(document.getElementById("treppeElement").value, 10);
    return treppen.find((t) => t.id === id) || treppen[0];
  }

  /** Nutzungsarten in die Auswahlliste eintragen (einmalig beim Start). */
  function fuelleTreppenNutzung() {
    const feld = document.getElementById("treppeNutzung");
    feld.innerHTML = Object.keys(TREPPEN_NUTZUNG).map((k) => {
      const n = TREPPEN_NUTZUNG[k];
      return `<option value="${k}">${n.name} · s ≤ ${(n.sMax * 100).toFixed(0)} cm, `
        + `a ≥ ${(n.aMin * 100).toFixed(0)} cm, b ≥ ${(n.breiteMin * 100).toFixed(0)} cm</option>`;
    }).join("");
  }

  /** Nachweistabelle und Kennwerte der gewählten Treppe. */
  function renderTreppenTabelle() {
    const treppen = treppenBauteile();
    const auswahl = document.getElementById("treppeElement");
    const body = document.getElementById("treppeBody");
    const empty = document.getElementById("treppeEmpty");
    const kennwerte = document.getElementById("treppeKennwerte");

    empty.hidden = treppen.length > 0;
    const vorher = auswahl.value;
    auswahl.innerHTML = treppen.map((t) =>
      `<option value="${t.id}">${betonBezeichnung(t)}</option>`).join("");
    if (treppen.some((t) => String(t.id) === vorher)) auswahl.value = vorher;

    body.innerHTML = "";
    kennwerte.textContent = "";
    const element = gewaehlteTreppe();
    if (!element) return;

    // Eingabefelder auf die gewählte Treppe stellen
    document.getElementById("treppeNutzung").value = element.nutzung || "wohnung2";
    document.getElementById("treppeDurchgang").value =
      (element.durchgangshoehe || DURCHGANGSHOEHE_MIN).toFixed(2);
    document.getElementById("treppePodest").value =
      (element.podestlaenge || element.masse.laufbreite || 1).toFixed(2);

    const geo = betonGeometrie(element, arbeitsraumWert());
    const t = geo.treppe;
    const zeilen = treppeNachweis(t, {
      nutzung: element.nutzung,
      durchgangshoehe: element.durchgangshoehe,
    });

    zeilen.forEach((z) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${z.regel}</td>
        <td>${z.wert}</td>
        <td>${z.grenze}</td>
        <td>${z.erfuellt ? '<span class="ok-badge">erfüllt</span>' : '<span class="cut-warning">nicht erfüllt</span>'}</td>
        <td>${z.hinweis}</td>`;
      body.appendChild(tr);
    });

    const auswertung = betonWertung(element);
    kennwerte.textContent =
      `${betonBezeichnung(element)} · ${t.beschreibung} · Steigungswinkel ${zahl(t.winkel, 1)}° · `
      + `geneigte Lauflänge ${zahl(t.geneigt, 2)} m · Grundfläche ${zahl(t.grundflaeche, 2)} m² · `
      + `Beton ${zahl(auswertung.volumen, 2)} m³ · Schalung ${zahl(auswertung.schalung, 2)} m² · `
      + `Betonstahl ${auswertung.bewehrung.toFixed(0)} kg · `
      + `Eigenlast g_k = ${auswertung.flaechenlast ? zahl(auswertung.flaechenlast, 2) : "–"} kN/m² `
      + "auf die Grundrissfläche des Laufes.";
  }

  /** Steigungszahl und Auftritt aus der Geschosshöhe vorschlagen. */
  function treppeVorschlagen() {
    const element = gewaehlteTreppe();
    if (!element) {
      setStatus("Keine Treppe vorhanden – zuerst ein Betonbauteil der Art „Massivtreppe“ setzen.", "error");
      return;
    }
    const h = element.masse.geschosshoehe || 2.75;
    const v = treppeVorschlag(h, element.nutzung || "wohnung2");
    element.masse.steigungen = v.steigungen;
    element.masse.auftritt = Math.round(v.auftritt * 100) / 100;
    const geo = betonGeometrie(element, arbeitsraumWert());
    setStatus(
      `${betonBezeichnung(element)}: ${geo.treppe.beschreibung}`
      + ` · 2s+a = ${zahl(geo.treppe.schrittmass * 100, 1)} cm`
      + (v.treffer ? "" : " – Schrittmaßregel nicht einhaltbar, Geschosshöhe oder Nutzungsart prüfen"),
      v.treffer ? "ok" : "error");
    refreshAll();
  }

  document.getElementById("btnTreppeVorschlag").addEventListener("click", treppeVorschlagen);
  document.getElementById("treppeElement").addEventListener("change", renderTreppenTabelle);
  ["treppeNutzung", "treppeDurchgang", "treppePodest"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => {
      const element = gewaehlteTreppe();
      if (!element) return;
      if (id === "treppeNutzung") element.nutzung = document.getElementById(id).value;
      if (id === "treppeDurchgang") {
        const v = parseFloat(document.getElementById(id).value);
        element.durchgangshoehe = Number.isFinite(v) && v > 0 ? v : DURCHGANGSHOEHE_MIN;
      }
      if (id === "treppePodest") {
        const v = parseFloat(document.getElementById(id).value);
        element.podestlaenge = Number.isFinite(v) && v > 0 ? v : element.masse.laufbreite;
      }
      refreshAll();
    });
  });
  fuelleTreppenNutzung();

  /** Treppen als Grundrisssymbole: Antritt, Laufrichtung und Geometrie. */
  function treppenFuerGrundriss() {
    return treppenBauteile().map((element) => {
      const geo = betonGeometrie(element, arbeitsraumWert());
      const p1 = element.p1, p2 = element.p2 || { x: p1.x + 1, z: p1.z };
      return {
        lage: {
          x0: p1.x, z0: p1.z,
          richtung: (Math.atan2(p2.z - p1.z, p2.x - p1.x) * 180) / Math.PI,
        },
        geo: geo.treppe,
        bezeichnung: betonBezeichnung(element),
      };
    }).filter((t) => t.geo);
  }

  function gewaehlteEbene(ebenen) {
    const feld = document.getElementById("deckenEbene");
    const wert = feld.value;
    return ebenen.find((e) => e.ok.toFixed(3) === wert) || ebenen[0] || null;
  }

  function renderDeckenTable() {
    const body = document.getElementById("deckenBody");
    const empty = document.getElementById("deckenEmpty");
    body.innerHTML = "";
    const ebenen = deckenEbenenAktuell();
    const platten = [];
    ebenen.forEach((e) => e.platten.forEach((p) => platten.push({ ebene: e, platte: p })));
    empty.hidden = platten.length > 0;

    // Auswahlfeld der Ebenen auffrischen, gewählte Ebene beibehalten
    const feld = document.getElementById("deckenEbene");
    const vorher = feld.value;
    feld.innerHTML = ebenen.map((e) =>
      `<option value="${e.ok.toFixed(3)}">OK ${koteText(e.ok)} · ${e.platten.length} ${e.platten.length === 1 ? "Platte" : "Platten"}</option>`).join("");
    if (ebenen.some((e) => e.ok.toFixed(3) === vorher)) feld.value = vorher;

    platten.forEach(({ ebene, platte }) => {
      const element = platte.element;
      const geo = platte.geo;
      const spann = spannweiten(element, geo);
      const anzahl = Math.max(1, element.anzahl || 1);
      const teile = geo.schalungTeile || { boden: 0 };
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${betonBezeichnung(element)}</td>
        <td>${koteText(platte.koten.ok)}</td>
        <td>${(geo.dicke * 100).toFixed(0)}</td>
        <td>
          <select data-decke="${element.id}" data-field="spannrichtung" title="automatisch: Faustregel l_max/l_min > 2 → einachsig">
            ${Object.keys(SPANNRICHTUNGEN).map((k) => `<option value="${k}" ${k === (element.spannrichtung || "auto") ? "selected" : ""}>${SPANNRICHTUNGEN[k]}</option>`).join("")}
          </select>
        </td>
        <td>${geo.laenge.toFixed(2)} / ${geo.breite.toFixed(2)}</td>
        <td class="${spann.verhaeltnis > 2 ? "u-warn" : ""}">${spann.verhaeltnis.toFixed(2)}</td>
        <td><strong>${spann.stuetzweite.toFixed(2)}</strong><div class="layer-note">${spann.richtungName}</div></td>
        <td>${((geo.bruttoFlaeche || geo.grundflaeche) * anzahl).toFixed(2)}</td>
        <td>${geo.oeffnungsFlaeche > 0 ? "−" + (geo.oeffnungsFlaeche * anzahl).toFixed(2) : "–"}</td>
        <td><strong>${(geo.grundflaeche * anzahl).toFixed(2)}</strong></td>
        <td>${(geo.volumen * anzahl).toFixed(2)}</td>
        <td>${(teile.boden * anzahl).toFixed(2)}</td>
        <td>${((geo.dicke * STAHLBETON_DICHTE * 9.81) / 1000).toFixed(2)}</td>`;
      body.appendChild(tr);
    });

    renderAussparungTable(platten.map((p) => p.platte.element));
  }

  function renderAussparungTable(decken) {
    const body = document.getElementById("aussparungBody");
    const empty = document.getElementById("aussparungEmpty");
    body.innerHTML = "";
    let anzahl = 0;

    decken.forEach((element) => {
      (element.aussparungen || []).forEach((o) => {
        anzahl++;
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>D${o.id}</td>
          <td>${betonBezeichnung(element)}</td>
          <td><input type="number" step="0.05" min="0" data-aus="${o.id}" data-decke="${element.id}" data-field="x" value="${o.x}"></td>
          <td><input type="number" step="0.05" min="0" data-aus="${o.id}" data-decke="${element.id}" data-field="z" value="${o.z}"></td>
          <td><input type="number" step="0.05" min="0.05" data-aus="${o.id}" data-decke="${element.id}" data-field="b" value="${o.b}"></td>
          <td><input type="number" step="0.05" min="0.05" data-aus="${o.id}" data-decke="${element.id}" data-field="t" value="${o.t}"></td>
          <td>${(o.b * o.t).toFixed(3)}</td>
          <td><input type="text" data-aus="${o.id}" data-decke="${element.id}" data-field="bemerkung" value="${o.bemerkung || ""}" placeholder="z. B. Schacht, Treppenauge"></td>
          <td><button class="row-remove" data-remove-aus="${o.id}" data-decke="${element.id}" title="Aussparung löschen">✕</button></td>`;
        body.appendChild(tr);
      });
    });
    empty.hidden = anzahl > 0;
  }

  document.getElementById("deckenBody").addEventListener("change", (e) => {
    const id = parseInt(e.target.getAttribute("data-decke"), 10);
    if (!id) return;
    const element = model.beton.get(id);
    if (!element) return;
    if (e.target.getAttribute("data-field") === "spannrichtung") element.spannrichtung = e.target.value;
    refreshAll();
  });

  document.getElementById("aussparungBody").addEventListener("change", (e) => {
    const deckeId = parseInt(e.target.getAttribute("data-decke"), 10);
    const ausId = parseInt(e.target.getAttribute("data-aus"), 10);
    const element = model.beton.get(deckeId);
    if (!element || !ausId) return;
    const o = (element.aussparungen || []).find((a) => a.id === ausId);
    if (!o) return;
    const field = e.target.getAttribute("data-field");
    if (field === "bemerkung") o.bemerkung = e.target.value;
    else o[field] = Math.max(0, parseFloat(e.target.value) || 0);
    refreshAll();
  });

  document.getElementById("aussparungBody").addEventListener("click", (e) => {
    const deckeId = parseInt(e.target.getAttribute("data-decke"), 10);
    const ausId = parseInt(e.target.getAttribute("data-remove-aus"), 10);
    const element = model.beton.get(deckeId);
    if (!element || !ausId) return;
    element.aussparungen = (element.aussparungen || []).filter((a) => a.id !== ausId);
    refreshAll();
  });

  document.getElementById("btnAddAussparung").addEventListener("click", () => {
    const ebenen = deckenEbenenAktuell();
    const ebene = gewaehlteEbene(ebenen);
    const platte = ebene && ebene.platten[0];
    if (!platte) {
      setStatus("Zuerst eine Decke oder Bodenplatte anlegen.", "error");
      return;
    }
    const element = platte.element;
    if (!element.aussparungen) element.aussparungen = [];
    element.aussparungen.push({
      id: model.nextAussparungId++, x: 0.5, z: 0.5, b: 1.0, t: 1.0, bemerkung: "",
    });
    setStatus(`Aussparung in ${betonBezeichnung(element)} angelegt – Lage und Maße in der Tabelle eingeben.`, "ok");
    refreshAll();
  });

  document.getElementById("deckenEbene").addEventListener("change", () => renderDeckenTable());

  function zeichneDeckenplan() {
    const ebenen = deckenEbenenAktuell();
    const ebene = gewaehlteEbene(ebenen);
    if (!ebene) {
      setStatus("Für den Deckenplan zuerst eine Decke oder Bodenplatte anlegen.", "error");
      return;
    }
    // Architektur-Wände unter der Decke als zusätzliche Auflager
    const architektur = architekturGrundrissFiguren(
      Array.from(model.elements.values()), bauteilGeometrie, bauteilBezeichnung
    ).filter((f) => f.klasse === "arch");

    const svg = deckenplanSVG({
      ebene, achsen: aktuelleAchsen(), bezeichnungVon: betonBezeichnung,
      aufstellung: deckenAufstellung(ebene, betonBezeichnung), architektur,
      projekt: {
        name: document.getElementById("projectName").value,
        datum: document.getElementById("projectDate").value,
        bearbeiter: "Oleksii Severyn",
      },
    });

    sheetArt = "deckenplan";
    deckenplanEbene = ebene.ok;
    document.getElementById("sheetBody").innerHTML = svg;
    document.getElementById("sheetTitle").textContent = `Deckenplan OK ${koteText(ebene.ok)}`;
    document.getElementById("sheetCounter").textContent =
      `${ebene.platten.length} ${ebene.platten.length === 1 ? "Platte" : "Platten"} · ${ebene.darunter.length} Bauteile darunter`;
    document.getElementById("sheetOverlay").hidden = false;
  }

  let deckenplanEbene = null;

  /** Blättern zwischen den Deckenebenen. */
  function blaettereDeckenplan(schritt) {
    const ebenen = deckenEbenenAktuell();
    if (!ebenen.length) return;
    const i = ebenen.findIndex((e) => e.ok === deckenplanEbene);
    const naechste = ebenen[(((i < 0 ? 0 : i + schritt) % ebenen.length) + ebenen.length) % ebenen.length];
    document.getElementById("deckenEbene").value = naechste.ok.toFixed(3);
    zeichneDeckenplan();
  }

  document.getElementById("btnDeckenplan").addEventListener("click", zeichneDeckenplan);

  /* ------------------------------------------------------------ Schalung */

  function renderSchalungsliste() {
    const body = document.getElementById("schalungBody");
    const empty = document.getElementById("schalungEmpty");
    body.innerHTML = "";
    const auf = schalungsAufstellung(Array.from(model.beton.values()), arbeitsraumWert(), betonGeometrie, betonBezeichnung);
    empty.hidden = auf.zeilen.length > 0;

    auf.zeilen.forEach((z) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${z.bauteil}</td>
        <td>${z.artName}</td>
        <td>${z.einzel.toFixed(2)}</td>
        <td>${z.anzahl}</td>
        <td><strong>${z.flaeche.toFixed(2)}</strong></td>
        <td class="cut-labels">${z.system}</td>`;
      body.appendChild(tr);
    });

    if (auf.zeilen.length) {
      Object.keys(SCHALUNGSARTEN).forEach((art) => {
        if (auf.jeArt[art] <= 0) return;
        const tr = document.createElement("tr");
        tr.innerHTML = `<td></td><td><strong>Summe ${SCHALUNGSARTEN[art].name}</strong></td><td></td><td></td>
          <td><strong>${auf.jeArt[art].toFixed(2)}</strong></td><td class="cut-labels">${SCHALUNGSARTEN[art].beschreibung}</td>`;
        body.appendChild(tr);
      });
      const tr = document.createElement("tr");
      tr.innerHTML = `<td></td><td><strong>Schalfläche gesamt</strong></td><td></td><td></td>
        <td><strong>${auf.gesamt.toFixed(2)}</strong></td><td></td>`;
      body.appendChild(tr);
    }
  }

  /** Schalplan eines einzelnen Bauteils. */
  function zeichneSchalplan(elementId) {
    const element = model.beton.get(elementId);
    if (!element) return;
    const typ = BETONTEILTYPEN[element.kind];
    const geo = betonGeometrie(element, arbeitsraumWert());

    const svg = schalplanSVG({
      element, geo, deckung: betondeckung(element),
      bezeichnung: betonBezeichnung(element), typName: typ.name,
      auswertung: betonWertung(element),
      projekt: {
        name: document.getElementById("projectName").value,
        datum: document.getElementById("projectDate").value,
        bearbeiter: "Oleksii Severyn",
      },
    });

    sheetArt = "schalung";
    schalplanId = elementId;
    document.getElementById("sheetBody").innerHTML = svg;
    document.getElementById("sheetTitle").textContent = `Schalplan ${betonBezeichnung(element)} · ${typ.name}`;
    const ids = Array.from(model.beton.keys());
    document.getElementById("sheetCounter").textContent = `${ids.indexOf(elementId) + 1} / ${ids.length}`;
    document.getElementById("sheetOverlay").hidden = false;
  }

  let schalplanId = null;

  /** Blättern zwischen den Schalplänen. */
  function blaettereSchalplan(schritt) {
    const ids = Array.from(model.beton.keys());
    if (!ids.length) return;
    const i = ids.indexOf(schalplanId);
    zeichneSchalplan(ids[((i < 0 ? 0 : i + schritt) + ids.length) % ids.length]);
  }

  /** Übersichtsplan aller Betonbauteile im Grundriss. */
  function zeichneSchalUebersicht() {
    if (!model.beton.size) {
      setStatus("Für den Schalplan zuerst Betonbauteile setzen.", "error");
      return;
    }
    const svg = schalungsUebersichtSVG({
      elemente: Array.from(model.beton.values()),
      geometrieVon: betonGeometrie,
      bezeichnungVon: betonBezeichnung,
      arbeitsraum: arbeitsraumWert(),
      projekt: {
        name: document.getElementById("projectName").value,
        datum: document.getElementById("projectDate").value,
        bearbeiter: "Oleksii Severyn",
      },
    });
    sheetArt = "schaluebersicht";
    document.getElementById("sheetBody").innerHTML = svg;
    document.getElementById("sheetTitle").textContent = "Schalplan-Übersicht";
    document.getElementById("sheetCounter").textContent =
      `${model.beton.size} ${model.beton.size === 1 ? "Bauteil" : "Bauteile"}`;
    document.getElementById("sheetOverlay").hidden = false;
  }

  document.getElementById("btnSchalUebersicht").addEventListener("click", zeichneSchalUebersicht);

  ["arbeitsraum", "preisBeton", "preisSchalung", "preisBewehrung", "preisAushub"].forEach((id) => {
    document.getElementById(id).addEventListener("change", refreshAll);
  });

  /* -------------------------------------------------- Achsraster und Positionen */

  /** Achsraster aus den Eingabefeldern. */
  function rasterVorgabe() {
    const zahl = (id, fallback) => {
      const v = parseFloat(document.getElementById(id).value);
      return Number.isFinite(v) ? v : fallback;
    };
    return {
      x0: zahl("rasterX0", 0), z0: zahl("rasterZ0", 0),
      felderX: document.getElementById("rasterFelderX").value,
      felderZ: document.getElementById("rasterFelderZ").value,
      beschriftungX: document.getElementById("rasterBeschriftungX").value,
      beschriftungZ: document.getElementById("rasterBeschriftungZ").value,
      toleranz: Math.max(0, zahl("rasterToleranz", ACHSRASTER_STANDARD.toleranz)),
    };
  }

  function aktuelleAchsen() {
    return achsenAusRaster(rasterVorgabe());
  }

  /** Stäbe des Stahlbaus als Angaben für den Positionsplan. */
  function stabAngaben() {
    const staebe = [];
    model.members.forEach((member) => {
      const a = model.nodes[member.a], b = model.nodes[member.b];
      if (!a || !b) return;
      const design = designMember(member);
      staebe.push({
        bezeichnung: memberLabel(member), typ: member.type,
        profil: design.profileName || "–", laenge: memberLength(member),
        von: { x: a.x, z: a.z, y: a.y }, bis: { x: b.x, z: b.z, y: b.y },
      });
    });
    return staebe;
  }

  /** Alle Bauteile als Grundrissfiguren mit Achsbezug. */
  function positionsFiguren() {
    const achsen = aktuelleAchsen();
    const beton = betonPositionsFiguren(
      betonGrundrissFiguren(Array.from(model.beton.values()), betonGeometrie, betonBezeichnung, arbeitsraumWert())
    );
    const arch = architekturGrundrissFiguren(Array.from(model.elements.values()), bauteilGeometrie, bauteilBezeichnung);
    const stahl = stabPositionsFiguren(stabAngaben());
    return { figuren: positionsListe(stahl.concat(beton, arch), achsen), achsen };
  }

  /* ======================================= Modell für IFC und Koordination */

  /**
   * Alle Bauteile in einer gemeinsamen Form: Körper als aufrechtes Prisma
   * mit Lage und Drehung, dazu Bezeichnung, Werkstoff, Geschoss und
   * Attribute. Aus dieser einen Liste entstehen der IFC-Export, die
   * Kollisionsprüfung und die Attributauswertung – so beschreiben alle drei
   * dasselbe Modell.
   *
   * Die Lage bezieht sich auf die Mitte des Körpers im Grundriss und auf
   * seine Unterkante in der Höhe; die Drehung ist der Winkel der Längsachse
   * gegen die x-Achse in Grad.
   */
  function modellBauteile() {
    const raum = arbeitsraumWert();
    const liste = [];

    // ---- Betonbauteile
    model.beton.forEach((element) => {
      const geo = betonGeometrie(element, raum);
      const typ = BETONTEILTYPEN[element.kind];
      const p1 = element.p1, p2 = element.p2;
      const koten = hoehenkoten(element, geo);
      let koerper, lage;

      if (typ.form === "linie" && p2) {
        const dx = p2.x - p1.x, dz = p2.z - p1.z;
        const laenge = Math.hypot(dx, dz) || 0.01;
        const drehung = (Math.atan2(dz, dx) * 180) / Math.PI;
        if (element.kind === "treppe" && geo.treppe) {
          // Treppe: Laufkörper vom Antritt aus in Laufrichtung
          const t = geo.treppe;
          const rad = (drehung * Math.PI) / 180;
          koerper = { art: "rechteck", laenge: t.lauflaenge, breite: t.laufbreite, hoehe: t.geschosshoehe };
          lage = {
            x: p1.x + Math.cos(rad) * t.lauflaenge / 2 - Math.sin(rad) * t.laufbreite / 2,
            y: p1.z + Math.sin(rad) * t.lauflaenge / 2 + Math.cos(rad) * t.laufbreite / 2,
            z: koten.uk, drehung,
          };
        } else {
          const dicke = element.kind === "streifenfundament" ? geo.breite : geo.dicke;
          const hoehe = element.kind === "streifenfundament" ? geo.dicke : geo.hoehe;
          koerper = { art: "rechteck", laenge, breite: dicke, hoehe };
          lage = { x: (p1.x + p2.x) / 2, y: (p1.z + p2.z) / 2, z: koten.uk, drehung };
        }
      } else if (typ.form === "flaeche" && p2) {
        koerper = { art: "rechteck", laenge: geo.laenge, breite: geo.breite, hoehe: geo.dicke };
        lage = { x: (p1.x + p2.x) / 2, y: (p1.z + p2.z) / 2, z: koten.uk, drehung: 0 };
      } else if (typ.rund) {
        koerper = { art: "kreis", durchmesser: geo.laenge, hoehe: geo.hoehe };
        lage = { x: p1.x, y: p1.z, z: koten.uk, drehung: 0 };
      } else {
        koerper = { art: "rechteck", laenge: geo.laenge, breite: geo.breite, hoehe: geo.hoehe };
        lage = { x: p1.x, y: p1.z, z: koten.uk, drehung: 0 };
      }

      liste.push({
        id: `B${element.id}`, bezeichnung: betonBezeichnung(element), kind: element.kind,
        kategorie: "Beton", typName: typ.name, koerper, lage,
        werkstoff: `Beton ${element.guete}`, geschoss: null,
        attribute: bauteilAttribute(element), element,
        menge: `${(geo.volumen * Math.max(1, element.anzahl || 1)).toFixed(2)} m³`,
      });
    });

    // ---- Architektur-Bauteile
    model.elements.forEach((element) => {
      const typ = BAUTEILTYPEN[element.kind];
      const geo = bauteilGeometrie(element);
      const p1 = element.p1, p2 = element.p2;
      let koerper, lage;

      if (typ.form === "linie" && p2) {
        const dx = p2.x - p1.x, dz = p2.z - p1.z;
        const laenge = Math.hypot(dx, dz) || 0.01;
        koerper = { art: "rechteck", laenge, breite: geo.dicke, hoehe: geo.hoehe };
        lage = {
          x: (p1.x + p2.x) / 2, y: (p1.z + p2.z) / 2,
          z: typ.unterGelaende ? p1.y - geo.hoehe : p1.y,
          drehung: (Math.atan2(dz, dx) * 180) / Math.PI,
        };
      } else if (typ.form === "flaeche" && p2) {
        koerper = { art: "rechteck", laenge: geo.laenge, breite: geo.breite, hoehe: geo.dicke };
        lage = { x: (p1.x + p2.x) / 2, y: (p1.z + p2.z) / 2, z: p1.y, drehung: 0 };
      } else {
        koerper = { art: "rechteck", laenge: geo.laenge, breite: geo.breite, hoehe: geo.dicke };
        lage = { x: p1.x, y: p1.z, z: p1.y - geo.dicke, drehung: 0 };
      }

      const stoff = (element.layers || [])[0];
      liste.push({
        id: `A${element.id}`, bezeichnung: bauteilBezeichnung(element), kind: element.kind,
        kategorie: "Architektur", typName: typ.name, koerper, lage,
        werkstoff: stoff && BAUSTOFFE[stoff.material] ? BAUSTOFFE[stoff.material].name : typ.name,
        geschoss: null, attribute: bauteilAttribute(element), element,
        menge: `${geo.flaeche.toFixed(2)} m²`,
      });
    });

    // ---- Stahlbau: Stäbe als Träger mit dem Umriss ihres Profils
    model.members.forEach((member) => {
      const a = model.nodes[member.a], b = model.nodes[member.b];
      if (!a || !b) return;
      const design = designMember(member);
      // Querschnittsmaße aus der Profiltabelle: sie bestimmen den Körper,
      // mit dem der Stab in IFC und in der Kollisionsprüfung erscheint
      const tabelle = STEEL_DB[design.family];
      const profil = tabelle && tabelle.find((x) => design.profileName.indexOf(x.name) === 0);
      const laenge = memberLength(member);
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      // Äußere Profilmaße: bei Hohlprofilen, Rohren und Winkeln stehen sie
      // im Profilnamen und nicht als Spalte in der Tabelle
      const mass = profil ? sectionOuter(design.family, profil) : { h: 100, b: 100 };
      const hProfil = mass.h / 1000;
      const bProfil = mass.b / 1000;
      // Der Stab kann schräg oder lotrecht stehen. Für die Kollisionsprüfung
      // zählt seine wirkliche Ausdehnung: im Grundriss die waagerechte
      // Projektion, in der Höhe der Bereich zwischen beiden Knoten – jeweils
      // mindestens so groß wie der Querschnitt.
      const grundriss = Math.hypot(dx, dz);
      liste.push({
        id: `S${member.id}`, bezeichnung: memberLabel(member), kind: "stahlstab",
        kategorie: "Stahlbau", typName: member.type,
        koerper: {
          art: "rechteck",
          laenge: Math.max(grundriss, bProfil),
          breite: bProfil,
          hoehe: Math.max(Math.abs(dy), hProfil),
          // Für IFC und DXF wird das Profil entlang der Stabachse ausgetragen;
          // die Richtung steht im Koordinatensystem der Ausgabe (x, z, y)
          achse: { x: dx / laenge, y: dz / laenge, z: dy / laenge },
          achslaenge: laenge,
          // Anfangsknoten des Stabes: von hier aus wird ausgetragen. Ohne
          // ihn säße der Stab um seine halbe Länge versetzt, weil die Lage
          // die Mitte des Prismas für die Kollisionsprüfung beschreibt.
          start: { x: a.x, y: a.z, z: a.y },
          // Querschnitt des Profils. Die Höhe des Prismas oben ist die
          // lotrechte Ausdehnung des Stabes und nicht seine Profilhöhe.
          querschnitt: { b: bProfil, h: hProfil },
        },
        lage: {
          x: (a.x + b.x) / 2, y: (a.z + b.z) / 2,
          z: Math.min(a.y, b.y) - (Math.abs(dy) < hProfil ? hProfil / 2 : 0),
          drehung: (Math.atan2(dz, dx) * 180) / Math.PI,
        },
        werkstoff: `Stahl ${document.getElementById("steelGradeGlobal").value}`,
        // Die Knoten des Stabes: zwei Stäbe mit gemeinsamem Knoten sind für
        // die Kollisionsprüfung ein Anschluss
        knoten: [member.a, member.b],
        geschoss: null, attribute: bauteilAttribute(member), element: member,
        menge: `${design.totalWeight.toFixed(1)} kg`,
      });
    });

    // ---- Geschosse aus den Höhenkoten ableiten
    const koten = Array.from(new Set(liste.map((b) => Math.round(b.lage.z * 100) / 100)))
      .sort((x, y) => x - y);
    const geschosse = koten.length
      ? koten.map((k, i) => ({ name: geschossName(k, i, koten.length), kote: k }))
      : [{ name: "Erdgeschoss", kote: 0 }];
    liste.forEach((b) => {
      const k = Math.round(b.lage.z * 100) / 100;
      const g = geschosse.find((x) => Math.abs(x.kote - k) < 0.005) || geschosse[0];
      b.geschoss = g.name;
    });

    return { bauteile: liste, geschosse };
  }

  /** Geschossbezeichnung aus der Höhenkote. */
  function geschossName(kote, index, anzahl) {
    if (Math.abs(kote) < 0.005) return "Erdgeschoss";
    if (kote < 0) return `${Math.round(Math.abs(kote) / 3) || 1}. Untergeschoss (${koteText(kote)})`;
    void index; void anzahl;
    return `${Math.max(1, Math.round(kote / 3))}. Obergeschoss (${koteText(kote)})`;
  }

  function renderPositionsTable() {
    const body = document.getElementById("positionsBody");
    const empty = document.getElementById("positionsEmpty");
    body.innerHTML = "";
    const { figuren, achsen } = positionsFiguren();
    empty.hidden = figuren.length > 0;

    document.getElementById("rasterInfo").textContent =
      `Achsen x: ${achsen.x.map((a) => `${a.name} = ${a.wert.toFixed(2)} m`).join(" · ") || "–"}`
      + `  |  Achsen z: ${achsen.z.map((a) => `${a.name} = ${a.wert.toFixed(2)} m`).join(" · ") || "–"}`;

    figuren.forEach((f) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${f.bezeichnung}</td>
        <td>${f.kategorie}</td>
        <td>${f.typName || "–"}</td>
        <td>${f.beschreibung || "–"}</td>
        <td>${f.menge || "–"}</td>
        <td class="${f.bezug && f.bezug.inAchse ? "u-ok" : ""}">${f.bezug ? f.bezug.text : "–"}</td>
        <td>${f.mitte.x.toFixed(2)} / ${f.mitte.z.toFixed(2)}</td>`;
      body.appendChild(tr);
    });
  }

  function zeichnePositionsplan() {
    const { figuren, achsen } = positionsFiguren();
    if (!figuren.length) {
      setStatus("Für den Positionsplan zuerst Bauteile anlegen.", "error");
      return;
    }
    const svg = positionsplanSVG({
      figuren, achsen,
      projekt: {
        name: document.getElementById("projectName").value,
        datum: document.getElementById("projectDate").value,
        bearbeiter: "Oleksii Severyn",
      },
    });
    sheetArt = "positionsplan";
    document.getElementById("sheetBody").innerHTML = svg;
    document.getElementById("sheetTitle").textContent = "Positionsplan mit Achsraster";
    document.getElementById("sheetCounter").textContent =
      `${figuren.length} Positionen · ${achsen.x.length} × ${achsen.z.length} Achsen`;
    document.getElementById("sheetOverlay").hidden = false;
  }

  document.getElementById("btnPositionsplan").addEventListener("click", zeichnePositionsplan);
  ["rasterX0", "rasterZ0", "rasterFelderX", "rasterFelderZ", "rasterBeschriftungX", "rasterBeschriftungZ", "rasterToleranz"]
    .forEach((id) => document.getElementById(id).addEventListener("change", () => {
      if (!TABS.positionen.view.hidden) renderPositionsTable();
    }));

  /* ------------------------------------------------------------- Tabellen */

  const tbody = document.getElementById("membersBody");
  const emptyState = document.getElementById("emptyState");

  function renderTable() {
    tbody.innerHTML = "";
    emptyState.style.display = model.members.size === 0 ? "block" : "none";
    let totalWeight = 0;

    model.members.forEach((member) => {
      const design = designMember(member);
      totalWeight += design.totalWeight;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${memberLabel(member)}</td>
        <td>
          <select data-field="type" data-id="${member.id}">
            ${Object.keys(MEMBER_TYPE_DEFAULTS).map((t) => `<option value="${t}" ${t === member.type ? "selected" : ""}>${t}</option>`).join("")}
          </select>
        </td>
        <td>${memberLength(member).toFixed(2)}</td>
        <td>
          <select data-field="loadType" data-id="${member.id}">
            <option value="Druck" ${member.loadType === "Druck" ? "selected" : ""}>Druck</option>
            <option value="Zug" ${member.loadType === "Zug" ? "selected" : ""}>Zug</option>
            <option value="Biegung" ${member.loadType === "Biegung" ? "selected" : ""}>Biegung</option>
          </select>
        </td>
        <td>
          ${member.loadType === "Biegung"
            ? `<input type="number" step="0.1" data-field="moment" data-id="${member.id}" value="${member.moment}" title="Moment M_Ed in kNm">`
            : `<input type="number" step="0.1" data-field="force" data-id="${member.id}" value="${member.force}" title="Normalkraft N_Ed in kN">`}
        </td>
        <td><input type="number" step="0.05" min="0.5" max="2.5" data-field="beta" data-id="${member.id}" value="${member.beta}" title="Knicklängenbeiwert β"></td>
        <td>
          <select data-field="family" data-id="${member.id}">
            ${Object.keys(FAMILY_LABELS).map((f) => `<option value="${f}" ${f === member.family ? "selected" : ""}>${FAMILY_LABELS[f]}</option>`).join("")}
          </select>
        </td>
        <td><strong>${design.profileName}</strong></td>
        <td>${(design.utilization * 100).toFixed(0)}%</td>
        <td>${design.totalWeight.toFixed(1)} kg</td>
        <td><span class="status-pill ${design.status}">${design.status === "ok" ? "OK" : design.status === "knapp" ? "Knapp" : "Fehler"}</span>${
          design.warnings && design.warnings.length
            ? `<span class="warn-flag" title="${design.warnings.join(" · ").replace(/"/g, "&quot;")}">!</span>` : ""
        }</td>
        <td><button class="row-remove" data-remove="${member.id}" title="Bauteil löschen">✕</button></td>
      `;
      tbody.appendChild(tr);
    });

    document.getElementById("statTotalWeight").textContent = totalWeight.toFixed(1) + " kg";
    document.getElementById("statMemberCount").textContent = model.members.size;
    updateCost(totalWeight);
  }

  tbody.addEventListener("change", (e) => {
    const id = parseInt(e.target.getAttribute("data-id"), 10);
    const field = e.target.getAttribute("data-field");
    if (!id || !field) return;
    const member = model.members.get(id);
    if (!member) return;

    if (field === "type") {
      member.type = e.target.value;
      const def = MEMBER_TYPE_DEFAULTS[member.type];
      member.loadType = def.loadType;
      member.beta = def.beta;
    } else if (field === "force") member.force = parseFloat(e.target.value) || 0;
    else if (field === "moment") member.moment = parseFloat(e.target.value) || 0;
    else if (field === "beta") member.beta = parseFloat(e.target.value) || 1.0;
    else if (field === "loadType") member.loadType = e.target.value;
    else if (field === "family") member.family = e.target.value;
    refreshAll();
  });

  tbody.addEventListener("click", (e) => {
    const removeId = e.target.getAttribute("data-remove");
    if (removeId) removeMember(parseInt(removeId, 10));
  });

  function updateCost(totalWeight) {
    const value = (id) => parseFloat(document.getElementById(id).value) || 0;
    const material = totalWeight * value("pricePerKg");
    const processing = totalWeight * value("processingPerKg");
    const transport = value("transportFlat");
    const storage = totalWeight * value("storagePerKg");
    const arch = architekturKosten();
    const fenster = oeffnungsKosten();
    const beton = betonKosten();
    document.getElementById("costConcrete").textContent = beton.toFixed(2) + " €";
    document.getElementById("costArch").textContent = arch.toFixed(2) + " €";
    document.getElementById("costOpenings").textContent = fenster.toFixed(2) + " €";
    document.getElementById("costMaterial").textContent = material.toFixed(2) + " €";
    document.getElementById("costProcessing").textContent = processing.toFixed(2) + " €";
    document.getElementById("costTransport").textContent = transport.toFixed(2) + " €";
    document.getElementById("costStorage").textContent = storage.toFixed(2) + " €";
    document.getElementById("costTotal").textContent = (material + processing + transport + storage + arch + fenster + beton).toFixed(2) + " €";
  }

  ["pricePerKg", "processingPerKg", "transportFlat", "storagePerKg"].forEach((id) => {
    document.getElementById(id).addEventListener("input", () => {
      let total = 0;
      model.members.forEach((m) => { total += designMember(m).totalWeight; });
      updateCost(total);
    });
  });

  /* --------------------------------------------- Knoten- und Anschlusskräfte */

  function renderNodeTable() {
    const body = document.getElementById("nodesBody");
    const empty = document.getElementById("nodesEmpty");
    body.innerHTML = "";

    if (!lastSolution || !lastSolution.ok || model.nodes.length === 0) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    model.nodes.forEach((node, index) => {
      const attached = Array.from(model.members.values()).filter((m) => m.a === index || m.b === index);
      const entries = attached.map((m) => ({ label: memberLabel(m), N: lastSolution.forces[m.id] || 0 }));
      const maxN = entries.reduce((max, e) => Math.max(max, Math.abs(e.N)), 0);

      const support = model.supports.get(index);
      const reactions = lastSolution.reactions.filter((r) => r.node === index);
      const supportText = support
        ? `${support === "pinned" ? "Festlager" : "Loslager"} (${reactions.map((r) => `${r.dir === "y" ? "V" : "H"} ${Math.abs(r.value).toFixed(1)} kN`).join(", ")})`
        : "–";

      const load = model.loads.get(index);
      const eg = selfWeightLoads[index] || 0;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${nodeKey(index)}${load && load.fy ? ` <span class="node-load">↓${Math.abs(load.fy)} kN</span>` : ""}${
          eg > 0.005 ? ` <span class="node-eg">EG ${eg.toFixed(2)}</span>` : ""}</td>
        <td>${node.x.toFixed(2)}</td>
        <td>${node.y.toFixed(2)}</td>
        <td>${node.z.toFixed(2)}</td>
        <td>${entries.length}</td>
        <td>${entries.map((e) => `<span class="force-chip ${e.N >= 0 ? "zug" : "druck"}">${e.label} ${e.N >= 0 ? "+" : "−"}${Math.abs(e.N).toFixed(1)}</span>`).join(" ")}</td>
        <td>${supportText}</td>
        <td><strong>${maxN.toFixed(1)}</strong></td>
      `;
      body.appendChild(tr);
    });
  }

  /* -------------------------------------------- Stückliste und Zuschnittplan */

  function buildCutList() {
    const allowance = parseFloat(document.getElementById("cutAllowance").value) || 0;
    const grade = document.getElementById("steelGradeGlobal").value;
    const groups = new Map();

    model.members.forEach((member) => {
      const design = designMember(member);
      const cutLength = Math.round(memberLength(member) * 1000 + allowance);
      if (cutLength <= 0) return;
      const key = `${design.profileName}|${cutLength}`;
      if (!groups.has(key)) {
        groups.set(key, { profile: design.profileName, weightPerMeter: design.weightPerMeter, cutLength, count: 0, labels: [], grade });
      }
      const group = groups.get(key);
      group.count += 1;
      group.labels.push(memberLabel(member));
    });

    return Array.from(groups.values()).sort((a, b) =>
      a.profile === b.profile ? b.cutLength - a.cutLength : a.profile.localeCompare(b.profile));
  }

  function buildCutPlan(cutList) {
    const stockMm = (parseFloat(document.getElementById("stockLength").value) || 6) * 1000;
    const kerf = parseFloat(document.getElementById("sawKerf").value) || 0;
    const byProfile = new Map();

    cutList.forEach((group) => {
      if (!byProfile.has(group.profile)) byProfile.set(group.profile, { profile: group.profile, pieces: [] });
      const entry = byProfile.get(group.profile);
      for (let i = 0; i < group.count; i++) entry.pieces.push(group.cutLength);
    });

    return Array.from(byProfile.values()).map((entry) => {
      const pieces = entry.pieces.slice().sort((a, b) => b - a);
      const bars = [];
      const tooLong = [];

      pieces.forEach((piece) => {
        if (piece > stockMm) { tooLong.push(piece); return; }
        let bar = bars.find((b) => b.rest >= piece + (b.stuecke.length ? kerf : 0));
        if (!bar) { bar = { rest: stockMm, stuecke: [] }; bars.push(bar); }
        bar.rest -= piece + (bar.stuecke.length ? kerf : 0);
        bar.stuecke.push(piece);
      });

      const usedMm = pieces.filter((p) => p <= stockMm).reduce((s, p) => s + p, 0);
      const stockUsedMm = bars.length * stockMm;
      return {
        profile: entry.profile, stockMm, barCount: bars.length, bars,
        wasteMm: stockUsedMm - usedMm,
        wastePercent: stockUsedMm ? ((stockUsedMm - usedMm) / stockUsedMm) * 100 : 0,
        tooLong,
      };
    }).sort((a, b) => a.profile.localeCompare(b.profile));
  }

  function renderCutList() {
    const listBody = document.getElementById("cutListBody");
    const planBody = document.getElementById("cutPlanBody");
    const empty = document.getElementById("cutListEmpty");
    listBody.innerHTML = "";
    planBody.innerHTML = "";

    if (model.members.size === 0) { empty.hidden = false; return; }
    empty.hidden = true;

    const cutList = buildCutList();
    cutList.forEach((group, index) => {
      const weightPerPiece = (group.weightPerMeter * group.cutLength) / 1000;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${index + 1}</td>
        <td><strong>${group.profile}</strong></td>
        <td>${group.grade}</td>
        <td>${group.cutLength}</td>
        <td>${group.count}</td>
        <td>${weightPerPiece.toFixed(1)}</td>
        <td>${(weightPerPiece * group.count).toFixed(1)}</td>
        <td class="cut-labels">${group.labels.join(", ")}</td>`;
      listBody.appendChild(tr);
    });

    buildCutPlan(cutList).forEach((plan) => {
      const belegung = plan.bars
        .map((bar, i) => `<span class="bar-chip">St ${i + 1}: ${bar.stuecke.join(" + ")} <em>Rest ${Math.round(bar.rest)}</em></span>`)
        .join(" ");
      const hinweis = plan.tooLong.length
        ? `<div class="cut-warning">${plan.tooLong.length} Stab/Stäbe länger als die Lagerlänge (${plan.tooLong.join(", ")} mm) – Stoß oder Sonderlänge erforderlich.</div>` : "";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>${plan.profile}</strong></td>
        <td>${plan.barCount} × ${(plan.stockMm / 1000).toFixed(2)} m</td>
        <td>${(plan.wasteMm / 1000).toFixed(2)} m (${plan.wastePercent.toFixed(1)} %)</td>
        <td>${belegung}${hinweis}</td>`;
      planBody.appendChild(tr);
    });
  }

  document.getElementById("sectionScale").addEventListener("change", () => renderModel());

  ["cutAllowance", "stockLength", "sawKerf"].forEach((id) => {
    document.getElementById(id).addEventListener("input", () => {
      if (!document.getElementById("viewCutList").hidden) renderCutList();
    });
  });

  /* ------------------------------------------------------------- Register */

  const TABS = {
    model: { button: document.getElementById("tabModel"), view: document.getElementById("viewModel") },
    members: { button: document.getElementById("tabMembers"), view: document.getElementById("viewMembers") },
    nodes: { button: document.getElementById("tabNodes"), view: document.getElementById("viewNodes") },
    arch: { button: document.getElementById("tabArch"), view: document.getElementById("viewArch") },
    beton: { button: document.getElementById("tabBeton"), view: document.getElementById("viewBeton") },
    positionen: { button: document.getElementById("tabPositionen"), view: document.getElementById("viewPositionen") },
    baustelle: { button: document.getElementById("tabBaustelle"), view: document.getElementById("viewBaustelle") },
    anschluss: { button: document.getElementById("tabAnschluss"), view: document.getElementById("viewAnschluss") },
    fertigteile: { button: document.getElementById("tabFertigteile"), view: document.getElementById("viewFertigteile") },
    logistik: { button: document.getElementById("tabLogistik"), view: document.getElementById("viewLogistik") },
    bestand: { button: document.getElementById("tabBestand"), view: document.getElementById("viewBestand") },
    gelaende: { button: document.getElementById("tabGelaende"), view: document.getElementById("viewGelaende") },
    tiefbau: { button: document.getElementById("tabTiefbau"), view: document.getElementById("viewTiefbau") },
    koordination: { button: document.getElementById("tabKoordination"), view: document.getElementById("viewKoordination") },
    cutlist: { button: document.getElementById("tabCutList"), view: document.getElementById("viewCutList") },
  };

  function showView(which) {
    Object.keys(TABS).forEach((key) => {
      TABS[key].view.hidden = key !== which;
      TABS[key].button.classList.toggle("active", key === which);
    });
    if (which === "nodes") renderNodeTable();
    if (which === "arch") renderArchTable();
    if (which === "beton") renderBetonTable();
    if (which === "positionen") renderPositionsTable();
    if (which === "baustelle") renderBaustelle();
    if (which === "anschluss") renderAnschluesse();
    if (which === "fertigteile") renderFertigteile();
    if (which === "logistik") renderLogistik();
    if (which === "bestand") renderBestand();
    if (which === "gelaende") renderGelaende();
    if (which === "tiefbau") renderTiefbau();
    if (which === "koordination") renderKoordination();
    if (which === "cutlist") renderCutList();
    if (which === "model") { result.resize(); renderModel(); }
  }
  Object.keys(TABS).forEach((key) => TABS[key].button.addEventListener("click", () => showView(key)));

  /* ------------------------------------------------------------ Menüband */

  /**
   * Das Menüband ist die Befehlsebene: Register je Arbeitsschritt, darin
   * Gruppen von Werkzeugen. Knöpfe mit `data-befehl` führen den Befehl nicht
   * selbst aus, sondern reichen ihn an die Schaltfläche der zugehörigen
   * Ansicht weiter – so bleibt jede Funktion an einer Stelle umgesetzt.
   * Mit `data-reiter` wird vorher auf die passende Ansicht gewechselt, damit
   * das Ergebnis auch zu sehen ist.
   */
  function zeigeBand(name) {
    const ribbon = document.getElementById("ribbon");
    ribbon.querySelectorAll(".ribbon-tab").forEach((t) => {
      t.classList.toggle("active", t.dataset.band === name);
      t.setAttribute("aria-selected", t.dataset.band === name ? "true" : "false");
    });
    ribbon.querySelectorAll(".ribbon-band").forEach((b) => { b.hidden = b.dataset.band !== name; });
    try { window.localStorage.setItem("hsd-menueband", name); } catch (e) { /* ohne Speicher: gleichgültig */ }
    // Das Band ändert die Höhe der Werkzeugleiste; die Zeichenfenster
    // müssen sich darauf einstellen
    window.requestAnimationFrame(fensterAngepasst);
  }

  document.getElementById("ribbon").addEventListener("click", (e) => {
    const reiter = e.target.closest(".ribbon-tab");
    if (reiter) { zeigeBand(reiter.dataset.band); return; }

    const knopf = e.target.closest("[data-befehl]");
    if (!knopf) return;
    const ziel = document.getElementById(knopf.dataset.befehl);
    if (!ziel) return;
    if (knopf.dataset.reiter && TABS[knopf.dataset.reiter]) showView(knopf.dataset.reiter);
    // Der Wechsel der Ansicht baut Tabellen neu auf; der Befehl folgt danach
    window.requestAnimationFrame(() => ziel.click());
  });

  // Zuletzt benutztes Register wiederherstellen
  (function stelleBandHer() {
    let gemerkt = null;
    try { gemerkt = window.localStorage.getItem("hsd-menueband"); } catch (e) { gemerkt = null; }
    const vorhanden = gemerkt
      && document.querySelector(`.ribbon-band[data-band="${gemerkt}"]`);
    zeigeBand(vorhanden ? gemerkt : "start");
  }());

  /** Alle abhängigen Ansichten nach einer Modelländerung auffrischen. */
  function refreshAll() {
    renderTable();
    renderSketch();
    if (!TABS.model.view.hidden) renderModel();
    if (!TABS.nodes.view.hidden) renderNodeTable();
    if (!TABS.arch.view.hidden) renderArchTable();
    if (!TABS.beton.view.hidden) renderBetonTable();
    if (!TABS.positionen.view.hidden) renderPositionsTable();
    if (!TABS.baustelle.view.hidden) renderBaustelle();
    if (!TABS.anschluss.view.hidden) renderAnschluesse();
    if (!TABS.fertigteile.view.hidden) renderFertigteile();
    if (!TABS.logistik.view.hidden) renderLogistik();
    if (!TABS.bestand.view.hidden) renderBestand();
    if (!TABS.gelaende.view.hidden) renderGelaende();
    if (!TABS.tiefbau.view.hidden) renderTiefbau();
    if (!TABS.koordination.view.hidden) renderKoordination();
    if (!TABS.cutlist.view.hidden) renderCutList();
  }

  /** Zeilen als CSV für Excel: Semikolon als Trennzeichen, Anführungszeichen verdoppelt. */
  function zuCsv(rows) {
    return rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  }

  /** Kopfangaben, die in jedem Blatt stehen. */
  function projektKopf() {
    return {
      name: document.getElementById("projectName").value,
      datum: document.getElementById("projectDate").value,
      bearbeiter: "Oleksii Severyn",
    };
  }

  /* ============================================== Aufmaß nach VOB/B § 14 */

  let aufmassBlattId = null;   // Aufmaßblatt im Blattfenster
  let tagesberichtId = null;   // Bautag im Blattfenster

  /** Alle Aufmaßblätter in der Reihenfolge ihrer Anlage. */
  function aufmassBlaetter() {
    return Array.from(model.aufmass.values());
  }

  /** Aktuell gewähltes Aufmaßblatt. */
  function gewaehltesAufmass() {
    const blaetter = aufmassBlaetter();
    if (!blaetter.length) return null;
    const id = parseInt(document.getElementById("aufmassBlatt").value, 10);
    return blaetter.find((b) => b.id === id) || blaetter[0];
  }

  /** Leeres Aufmaßblatt anlegen. */
  function neuesAufmass(vorgabe) {
    const blatt = Object.assign({
      id: model.nextAufmassId++,
      pos: "", kurztext: "", einheit: "m²", gewerk: "din18299",
      grenze: "", ep: "", datum: document.getElementById("projectDate").value || "",
      aufgenommen: "Oleksii Severyn", anerkannt: "",
      zeilen: [],
    }, vorgabe || {});
    model.aufmass.set(blatt.id, blatt);
    return blatt;
  }

  /** Aufmaßzeile anfügen. */
  function neueAufmassZeile(blatt, vorgabe) {
    blatt.zeilen.push(Object.assign({
      art: "zugang", bezug: "", anzahl: "1", laenge: "", breite: "", hoehe: "", bemerkung: "",
    }, vorgabe || {}));
  }

  /**
   * Aufmaßblätter aus den erfassten Bauteilen vorbereiten.
   *
   * Aus jedem Betonbauteil wird eine Zeile für Beton [m³] und eine für
   * Schalung [m²], aus jeder Architektur-Wand eine Zeile für die Wandfläche;
   * Fenster und Türen werden als Abzug eingetragen und damit von der
   * Übermessungsregel der ATV erfasst. Die Zeilen sind ein Vorschlag aus dem
   * Modell und ersetzen das Aufmaß am Bauwerk nicht.
   */
  function aufmassAusBauteilen() {
    const raum = arbeitsraumWert();
    let neu = 0;

    const blattFuer = (schluessel, vorgabe) => {
      const vorhanden = aufmassBlaetter().find((b) => b.herkunft === schluessel);
      if (vorhanden) return vorhanden;
      neu += 1;
      return neuesAufmass(Object.assign({ herkunft: schluessel }, vorgabe));
    };

    if (model.beton.size) {
      const beton = blattFuer("beton-volumen", {
        pos: "Beton", kurztext: "Beton liefern und einbauen", einheit: "m³", gewerk: "din18331",
      });
      const schalung = blattFuer("beton-schalung", {
        pos: "Schalung", kurztext: "Schalung stellen und ausschalen", einheit: "m²", gewerk: "din18331",
      });
      beton.zeilen = [];
      schalung.zeilen = [];
      model.beton.forEach((element) => {
        const a = betonWertung(element);
        const name = `${betonBezeichnung(element)} ${a.typName}`;
        // Mengen aus dem Modell: Anzahl × Einzelmenge, Maße stehen im Bezug
        beton.zeilen.push({
          art: "zugang", bezug: name, anzahl: String(a.anzahl),
          laenge: (a.geo.volumen).toFixed(3).replace(".", ","), breite: "1", hoehe: "1",
          bemerkung: a.geo.beschreibung,
        });
        if (a.geo.schalung > 0) {
          schalung.zeilen.push({
            art: "zugang", bezug: name, anzahl: String(a.anzahl),
            laenge: (a.geo.schalung).toFixed(3).replace(".", ","), breite: "1",
            bemerkung: `Schalflächen aus der Bauteilgeometrie`,
          });
        }
      });
      void raum;
    }

    const waende = Array.from(model.elements.values()).filter((e) => BAUTEILTYPEN[e.kind].form === "linie");
    if (waende.length) {
      const wand = blattFuer("arch-wand", {
        pos: "Wandfläche", kurztext: "Wandfläche nach Ansichtsfläche", einheit: "m²", gewerk: "din18330",
      });
      wand.zeilen = [];
      waende.forEach((element) => {
        const geo = bauteilGeometrie(element);
        wand.zeilen.push({
          art: "zugang", bezug: `${bauteilBezeichnung(element)} ${BAUTEILTYPEN[element.kind].name}`,
          anzahl: String(element.anzahl || 1),
          laenge: geo.laenge.toFixed(3).replace(".", ","),
          breite: geo.hoehe.toFixed(3).replace(".", ","),
          bemerkung: "Ansichtsfläche aus Achslänge × Höhe",
        });
        oeffnungenVon(element.id).forEach((o) => {
          const typ = OEFFNUNGSTYPEN[o.typ];
          wand.zeilen.push({
            art: "abzug", bezug: `${bauteilBezeichnung(element)} · ${typ ? typ.name : o.typ}`,
            anzahl: String(o.anzahl || 1),
            laenge: Number(o.breite).toFixed(3).replace(".", ","),
            breite: Number(o.hoehe).toFixed(3).replace(".", ","),
            bemerkung: "Öffnung – Übermessung nach ATV prüfen",
          });
        });
      });
    }

    if (!model.beton.size && !waende.length) {
      setStatus("Keine Bauteile vorhanden, aus denen ein Aufmaß übernommen werden könnte.", "error");
      return;
    }
    setStatus(`Aufmaßblätter aus dem Modell übernommen${neu ? ` · ${neu} Blatt neu angelegt` : ""}. `
      + "Die Zeilen sind ein Vorschlag aus dem Modell und ersetzen das Aufmaß am Bauwerk nicht.", "ok");
    refreshAll();
  }

  function renderAufmass() {
    const blaetter = aufmassBlaetter();
    const auswahl = document.getElementById("aufmassBlatt");
    const vorher = auswahl.value;
    auswahl.innerHTML = blaetter.map((b) =>
      `<option value="${b.id}">${b.pos || "ohne Position"}${b.kurztext ? " · " + b.kurztext : ""}</option>`).join("");
    if (blaetter.some((b) => String(b.id) === vorher)) auswahl.value = vorher;

    document.getElementById("aufmassEmpty").hidden = blaetter.length > 0;
    const kopf = document.getElementById("aufmassKopfBody");
    const body = document.getElementById("aufmassBody");
    kopf.innerHTML = "";
    body.innerHTML = "";
    document.getElementById("aufmassSumme").textContent = "";

    const blatt = gewaehltesAufmass();
    if (blatt) {
      const a = aufmassPosition(blatt);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input type="text" data-am="${blatt.id}" data-feld="pos" value="${blatt.pos || ""}" placeholder="01.02.030"></td>
        <td><input type="text" data-am="${blatt.id}" data-feld="kurztext" value="${blatt.kurztext || ""}" placeholder="Kurztext der LV-Position"></td>
        <td>
          <select data-am="${blatt.id}" data-feld="einheit">
            ${Object.keys(AUFMASS_EINHEITEN).map((k) => `<option value="${k}" ${k === blatt.einheit ? "selected" : ""}>${AUFMASS_EINHEITEN[k].name}</option>`).join("")}
          </select>
        </td>
        <td>
          <select data-am="${blatt.id}" data-feld="gewerk" title="Bestimmt die Abrechnungsregel und die Übermessungsgrenze">
            ${Object.keys(AUFMASS_GEWERKE).map((k) => `<option value="${k}" ${k === blatt.gewerk ? "selected" : ""}>${AUFMASS_GEWERKE[k].atv} – ${AUFMASS_GEWERKE[k].name}</option>`).join("")}
          </select>
        </td>
        <td><input type="number" step="0.1" min="0" data-am="${blatt.id}" data-feld="grenze" value="${blatt.grenze || ""}" placeholder="${a.grenze}" title="Leer = Voreinstellung der ATV">
          <div class="layer-note">${a.quelle}</div></td>
        <td><input type="number" step="0.01" min="0" data-am="${blatt.id}" data-feld="ep" value="${blatt.ep || ""}" placeholder="0,00"></td>
        <td><input type="date" data-am="${blatt.id}" data-feld="datum" value="${blatt.datum || ""}"></td>
        <td><input type="text" data-am="${blatt.id}" data-feld="aufgenommen" value="${blatt.aufgenommen || ""}"></td>
        <td><input type="text" data-am="${blatt.id}" data-feld="anerkannt" value="${blatt.anerkannt || ""}" placeholder="Bauleitung AG"></td>`;
      kopf.appendChild(tr);

      const eh = AUFMASS_EINHEITEN[a.einheit] || AUFMASS_EINHEITEN["m²"];
      const feld = (i, name) => {
        if (eh.masse.indexOf(name) < 0) return "<td class=\"leer\">–</td>";
        return `<td><input type="text" inputmode="decimal" data-amz="${blatt.id}" data-zeile="${i}" data-feld="${name}" value="${blatt.zeilen[i][name] || ""}"></td>`;
      };

      a.zeilen.forEach((z, i) => {
        const zr = document.createElement("tr");
        zr.className = z.uebermisst ? "uebermessen" : "";
        zr.innerHTML = `
          <td>${i + 1}</td>
          <td>
            <select data-amz="${blatt.id}" data-zeile="${i}" data-feld="art" title="Zugang oder Abzug">
              <option value="zugang" ${z.art !== "abzug" ? "selected" : ""}>+</option>
              <option value="abzug" ${z.art === "abzug" ? "selected" : ""}>−</option>
            </select>
          </td>
          <td><input type="text" data-amz="${blatt.id}" data-zeile="${i}" data-feld="bezug" value="${blatt.zeilen[i].bezug || ""}" placeholder="Achse A, EG"></td>
          ${feld(i, "anzahl")}${feld(i, "laenge")}${feld(i, "breite")}${feld(i, "hoehe")}
          <td class="formel">${aufmassFormel(blatt.zeilen[i], a.einheit)}</td>
          <td>${z.einzel > 0 ? z.einzel.toFixed(3).replace(".", ",") : "–"}</td>
          <td>${z.menge.toFixed(3).replace(".", ",")}</td>
          <td>${z.uebermisst
            ? `<span class="uebermessen-marke" title="Einzelgröße bis ${a.grenze.toFixed(2).replace(".", ",")} m² – ${a.atv}">übermessen</span>`
            : `<strong>${(z.wirksam < 0 ? "−" : "")}${Math.abs(z.wirksam).toFixed(3).replace(".", ",")}</strong>`}</td>
          <td><input type="text" data-amz="${blatt.id}" data-zeile="${i}" data-feld="bemerkung" value="${blatt.zeilen[i].bemerkung || ""}"></td>
          <td><button class="row-remove" data-amz-remove="${blatt.id}" data-zeile="${i}" title="Zeile löschen">✕</button></td>`;
        body.appendChild(zr);
      });

      const zahl = (w, n) => w.toFixed(n === undefined ? 3 : n).replace(".", ",");
      document.getElementById("aufmassSumme").innerHTML =
        `Zugang ${zahl(a.zugang)} ${a.einheit} − Abzug ${zahl(a.abzug)} ${a.einheit}`
        + (a.uebermessen > 0 ? ` (übermessen ${zahl(a.uebermessen)} ${a.einheit})` : "")
        + ` = <strong>Aufmaßsumme ${zahl(a.summe)} ${a.einheit}</strong>`
        + (a.ep > 0 ? ` · ${zahl(a.ep, 2)} €/${a.einheit} = <strong>${zahl(a.betrag, 2)} €</strong>` : "")
        + a.hinweise.map((h) => `<div class="cut-warning">${h}</div>`).join("");
    }

    const summeBody = document.getElementById("aufmassSummeBody");
    summeBody.innerHTML = "";
    const aufstellung = aufmassAufstellung(blaetter);
    aufstellung.zeilen.forEach((z) => {
      const zahl = (w, n) => w.toFixed(n === undefined ? 3 : n).replace(".", ",");
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${z.pos || "–"}</td><td>${z.kurztext || "–"}</td><td>${z.atv}</td>
        <td>${z.anzahlZeilen}</td>
        <td>${zahl(z.zugang)}</td><td>${zahl(z.abzug)}</td>
        <td>${z.uebermessen > 0 ? zahl(z.uebermessen) : "–"}</td>
        <td><strong>${zahl(z.summe)} ${z.einheit}</strong></td>
        <td>${z.ep > 0 ? zahl(z.ep, 2) : "–"}</td>
        <td>${z.wert > 0 ? zahl(z.wert, 2) : "–"}</td>`;
      summeBody.appendChild(tr);
    });
    if (aufstellung.betrag > 0) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="9"><strong>Summe Aufmaß</strong></td>`
        + `<td><strong>${aufstellung.betrag.toFixed(2).replace(".", ",")}</strong></td>`;
      summeBody.appendChild(tr);
    }
  }

  /* ==================================================== Bautagebuch */

  /** Bautage nach Datum sortiert, neueste zuerst. */
  function bautage() {
    return Array.from(model.bautagebuch.values())
      .sort((a, b) => String(b.datum || "").localeCompare(String(a.datum || "")));
  }

  function gewaehlterTag() {
    const tage = bautage();
    if (!tage.length) return null;
    const id = parseInt(document.getElementById("tagAuswahl").value, 10);
    return tage.find((t) => t.id === id) || tage[0];
  }

  const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

  /** Wochentag zu einem Datum im Format JJJJ-MM-TT. */
  function wochentagVon(datum) {
    if (!datum) return "";
    const d = new Date(datum + "T12:00:00");
    return Number.isNaN(d.getTime()) ? "" : WOCHENTAGE[d.getDay()];
  }

  function neuerBautag() {
    const heute = new Date();
    const vorhanden = new Set(Array.from(model.bautagebuch.values()).map((t) => t.datum));
    // Nächster freier Tag ab heute rückwärts, damit kein Datum doppelt entsteht
    let datum = heute.toISOString().slice(0, 10);
    let versatz = 0;
    while (vorhanden.has(datum) && versatz < 400) {
      versatz += 1;
      datum = new Date(heute.getTime() - versatz * 86400000).toISOString().slice(0, 10);
    }
    const tag = {
      id: model.nextTagId++, datum,
      abschnitt: "", von: "07:00", bis: "16:30", pause: "45 min",
      wetter: "bewoelkt", tempFrueh: "", tempMittag: "", niederschlag: "", wind: "",
      bauleiter: "Oleksii Severyn", bemerkung: "",
      firmen: [], geraete: [], leistungen: [], lieferungen: [], ereignisse: [],
    };
    model.bautagebuch.set(tag.id, tag);
    document.getElementById("tagAuswahl").value = String(tag.id);
    setStatus(`Bautag ${datum} angelegt.`, "ok");
    refreshAll();
    document.getElementById("tagAuswahl").value = String(tag.id);
    renderBautagebuch();
  }

  /** Eine Zeile einer Unterliste des Bautages anfügen. */
  function tagListeAnfuegen(liste, vorgabe) {
    const tag = gewaehlterTag();
    if (!tag) { setStatus("Zuerst einen Bautag anlegen.", "error"); return; }
    tag[liste].push(Object.assign({}, vorgabe));
    renderBautagebuch();
  }

  function renderBautagebuch() {
    const tage = bautage();
    const auswahl = document.getElementById("tagAuswahl");
    const vorher = auswahl.value;
    auswahl.innerHTML = tage.map((t) =>
      `<option value="${t.id}">${t.datum || "ohne Datum"}${wochentagVon(t.datum) ? " · " + wochentagVon(t.datum) : ""}</option>`).join("");
    if (tage.some((t) => String(t.id) === vorher)) auswahl.value = vorher;

    document.getElementById("tagEmpty").hidden = tage.length > 0;
    document.getElementById("tagDetail").hidden = !tage.length;
    const kopf = document.getElementById("tagKopfBody");
    kopf.innerHTML = "";

    const tag = gewaehlterTag();
    if (tag) {
      const a = bautagebuchTag(tag);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input type="date" data-tag="${tag.id}" data-feld="datum" value="${tag.datum || ""}">
          <div class="layer-note">${wochentagVon(tag.datum)}</div></td>
        <td><input type="text" data-tag="${tag.id}" data-feld="abschnitt" value="${tag.abschnitt || ""}" placeholder="BA 1, Achse A–D"></td>
        <td><input type="time" data-tag="${tag.id}" data-feld="von" value="${tag.von || ""}"></td>
        <td><input type="time" data-tag="${tag.id}" data-feld="bis" value="${tag.bis || ""}"></td>
        <td><input type="text" data-tag="${tag.id}" data-feld="pause" value="${tag.pause || ""}" placeholder="45 min"></td>
        <td>
          <select data-tag="${tag.id}" data-feld="wetter">
            ${Object.keys(WETTER_LAGEN).map((k) => `<option value="${k}" ${k === tag.wetter ? "selected" : ""}>${WETTER_LAGEN[k].zeichen} ${WETTER_LAGEN[k].name}</option>`).join("")}
          </select>
        </td>
        <td><input type="text" inputmode="decimal" data-tag="${tag.id}" data-feld="tempFrueh" value="${tag.tempFrueh || ""}" placeholder="3,5"></td>
        <td><input type="text" inputmode="decimal" data-tag="${tag.id}" data-feld="tempMittag" value="${tag.tempMittag || ""}" placeholder="8,0"></td>
        <td><input type="text" inputmode="decimal" data-tag="${tag.id}" data-feld="niederschlag" value="${tag.niederschlag || ""}" placeholder="0"></td>
        <td><input type="text" data-tag="${tag.id}" data-feld="wind" value="${tag.wind || ""}" placeholder="Bft 4"></td>
        <td><input type="text" data-tag="${tag.id}" data-feld="bauleiter" value="${tag.bauleiter || ""}"></td>`;
      kopf.appendChild(tr);

      // ---- Firmen
      const firmen = document.getElementById("tagFirmenBody");
      firmen.innerHTML = "";
      a.firmen.forEach((f, i) => {
        const zahlFeld = (feld) => `<td><input type="number" step="1" min="0" data-tagl="firmen" data-i="${i}" data-feld="${feld}" value="${tag.firmen[i][feld] || ""}"></td>`;
        const tr2 = document.createElement("tr");
        tr2.innerHTML = `
          <td><input type="text" data-tagl="firmen" data-i="${i}" data-feld="name" value="${tag.firmen[i].name || ""}" placeholder="Firma"></td>
          <td><input type="text" data-tagl="firmen" data-i="${i}" data-feld="gewerk" value="${tag.firmen[i].gewerk || ""}" placeholder="Rohbau"></td>
          ${zahlFeld("poliere")}${zahlFeld("facharbeiter")}${zahlFeld("helfer")}${zahlFeld("azubi")}
          <td><strong>${f.kopfzahl}</strong></td>
          <td><input type="text" inputmode="decimal" data-tagl="firmen" data-i="${i}" data-feld="stunden" value="${tag.firmen[i].stunden || ""}" placeholder="8,5"></td>
          <td>${f.mannstunden.toFixed(1).replace(".", ",")}</td>
          <td><button class="row-remove" data-tagl-remove="firmen" data-i="${i}">✕</button></td>`;
        firmen.appendChild(tr2);
      });

      // ---- Geräte
      const geraete = document.getElementById("tagGeraeteBody");
      geraete.innerHTML = "";
      a.geraete.forEach((g, i) => {
        const tr2 = document.createElement("tr");
        tr2.innerHTML = `
          <td><input type="text" data-tagl="geraete" data-i="${i}" data-feld="name" value="${tag.geraete[i].name || ""}" placeholder="Turmdrehkran 40 mt"></td>
          <td><input type="number" step="1" min="0" data-tagl="geraete" data-i="${i}" data-feld="anzahl" value="${tag.geraete[i].anzahl || ""}"></td>
          <td><input type="text" inputmode="decimal" data-tagl="geraete" data-i="${i}" data-feld="stunden" value="${tag.geraete[i].stunden || ""}"></td>
          <td><button class="row-remove" data-tagl-remove="geraete" data-i="${i}">✕</button></td>`;
        geraete.appendChild(tr2);
      });

      // ---- Leistungen
      const leistungen = document.getElementById("tagLeistungBody");
      leistungen.innerHTML = "";
      tag.leistungen.forEach((l, i) => {
        const tr2 = document.createElement("tr");
        tr2.innerHTML = `
          <td><input type="text" data-tagl="leistungen" data-i="${i}" data-feld="bereich" value="${l.bereich || ""}" placeholder="Achse A–C"></td>
          <td><input type="text" data-tagl="leistungen" data-i="${i}" data-feld="lvPos" value="${l.lvPos || ""}" placeholder="01.02.030"></td>
          <td><input type="text" data-tagl="leistungen" data-i="${i}" data-feld="text" value="${l.text || ""}" placeholder="Ausgeführte Leistung mit Menge"></td>
          <td><button class="row-remove" data-tagl-remove="leistungen" data-i="${i}">✕</button></td>`;
        leistungen.appendChild(tr2);
      });

      // ---- Lieferungen
      const lieferungen = document.getElementById("tagLieferungBody");
      lieferungen.innerHTML = "";
      tag.lieferungen.forEach((l, i) => {
        const tr2 = document.createElement("tr");
        tr2.innerHTML = `
          <td><input type="text" data-tagl="lieferungen" data-i="${i}" data-feld="text" value="${l.text || ""}" placeholder="Transportbeton C25/30, 18 m³"></td>
          <td><input type="text" data-tagl="lieferungen" data-i="${i}" data-feld="lieferschein" value="${l.lieferschein || ""}" placeholder="Nr."></td>
          <td><button class="row-remove" data-tagl-remove="lieferungen" data-i="${i}">✕</button></td>`;
        lieferungen.appendChild(tr2);
      });

      // ---- Vorkommnisse
      const ereignisse = document.getElementById("tagEreignisBody");
      ereignisse.innerHTML = "";
      a.ereignisse.forEach((e, i) => {
        const tr2 = document.createElement("tr");
        tr2.className = e.regel.anzeige ? "vorkommnis-anzeige" : "";
        tr2.innerHTML = `
          <td>
            <select data-tagl="ereignisse" data-i="${i}" data-feld="art">
              ${Object.keys(EREIGNIS_ARTEN).map((k) => `<option value="${k}" ${k === tag.ereignisse[i].art ? "selected" : ""}>${EREIGNIS_ARTEN[k].name}</option>`).join("")}
            </select>
          </td>
          <td><input type="text" data-tagl="ereignisse" data-i="${i}" data-feld="text" value="${tag.ereignisse[i].text || ""}" placeholder="Vorgang"></td>
          <td><input type="text" data-tagl="ereignisse" data-i="${i}" data-feld="folge" value="${tag.ereignisse[i].folge || ""}" placeholder="Stillstand 3,5 h"></td>
          <td class="cut-labels">${e.vorschrift !== "–" ? `<strong>${e.vorschrift}</strong><br>` : ""}
            ${e.regel.anzeige ? `<span class="cut-warning">${e.frist}</span>` : e.frist !== "–" ? e.frist : ""}
            <div class="layer-note">${e.regel.text}</div></td>
          <td><button class="row-remove" data-tagl-remove="ereignisse" data-i="${i}">✕</button></td>`;
        ereignisse.appendChild(tr2);
      });

      document.getElementById("tagBemerkung").value = tag.bemerkung || "";
      document.getElementById("tagHinweise").innerHTML =
        `<strong>${a.personal} Beschäftigte · ${a.mannstunden.toFixed(1).replace(".", ",")} Mannstunden</strong>`
        + (a.wetter.regentag ? " · Regentag" : "") + (a.wetter.frosttag ? " · Frosttag" : "")
        + a.hinweise.map((h) => `<div class="cut-warning">${h}</div>`).join("");
    }

    // ---- Auswertung des Zeitraums
    const z = bautagebuchZeitraum(Array.from(model.bautagebuch.values()));
    const kennzahl = (label, wert) =>
      `<div class="stat"><span class="label">${label}</span><span class="value">${wert}</span></div>`;
    document.getElementById("tagebuchKennzahlen").innerHTML = z.tage
      ? kennzahl("Zeitraum", `${z.von} – ${z.bis}`)
        + kennzahl("erfasste Tage", z.tage)
        + kennzahl("Arbeitstage", z.arbeitstage)
        + kennzahl("Ausfalltage", z.ausfalltage)
        + kennzahl("Regentage", z.regentage)
        + kennzahl("Frosttage", z.frosttage)
        + kennzahl("Behinderung", z.behinderungstage)
        + kennzahl("Anordnung AG", z.nachtragstage)
        + kennzahl("Mannstunden", z.mannstunden.toFixed(1).replace(".", ","))
      : "";

    const firmenBody = document.getElementById("tagebuchFirmenBody");
    firmenBody.innerHTML = "";
    z.firmen.forEach((f) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${f.name}</td><td>${f.gewerk || "–"}</td><td>${f.tage}</td>`
        + `<td>${f.maxKopf}</td><td>${f.mannstunden.toFixed(1).replace(".", ",")}</td>`;
      firmenBody.appendChild(tr);
    });
  }

  function renderBaustelle() {
    renderAufmass();
    renderBautagebuch();
  }

  /* ================================== Koordination: Attribute, Kollision, IFC */

  let letzteKollision = null;   // Ergebnis der letzten Prüfung

  /** Attribut eines Bauteils setzen; die Bauteile liegen in drei Sammlungen. */
  function setzeAttribut(id, feld, wert) {
    const art = id[0];
    const nummer = parseInt(id.slice(1), 10);
    const element = art === "B" ? model.beton.get(nummer)
      : art === "A" ? model.elements.get(nummer)
        : model.members.get(nummer);
    if (!element) return;
    element.attribute = Object.assign({}, bauteilAttribute(element), { [feld]: wert });
    renderKoordination();
  }

  /** Fehlende Attribute nach Bauteilart vorbelegen. */
  function attributeVorbelegen() {
    const { bauteile } = modellBauteile();
    if (!bauteile.length) { setStatus("Keine Bauteile vorhanden.", "error"); return; }
    let gesetzt = 0;
    bauteile.forEach((b) => {
      const vorher = b.element.attribute || {};
      const voll = bauteilAttribute(b.element);
      // bauteilAttribute() legt die Vorgabe der Bauteilart über die leeren
      // Felder; sie wird hier festgeschrieben, damit sie in der Datei steht
      const neu = {};
      Object.keys(voll).forEach((k) => {
        if (vorher[k] === undefined && voll[k] !== "" && voll[k] !== false) { neu[k] = voll[k]; gesetzt += 1; }
      });
      if (Object.keys(neu).length) b.element.attribute = Object.assign({}, voll, vorher, neu);
    });
    // Was nach dem Vorbelegen noch offen ist, muss der Anwender festlegen
    const nachher = attributAuswertung(modellBauteile().bauteile);
    const offen = [];
    if (nachher.ohneFeuer) offen.push(`${nachher.ohneFeuer} ohne Feuerwiderstand`);
    if (nachher.ohneGewerk) offen.push(`${nachher.ohneGewerk} ohne Gewerk`);
    setStatus(`${gesetzt} Attribute nach Bauteilart festgeschrieben.`
      + (offen.length ? ` Noch offen: ${offen.join(", ")} – diese Festlegungen trifft die Planung.` : "")
      + " Feuerwiderstand und Baustoffklasse sind Vorgaben und im Brandschutznachweis zu bestätigen.",
    offen.length ? "info" : "ok");
    renderKoordination();
  }

  function renderKoordination() {
    const { bauteile } = modellBauteile();
    document.getElementById("attributEmpty").hidden = bauteile.length > 0;

    // ---- Attributtabelle
    const body = document.getElementById("attributBody");
    body.innerHTML = "";
    bauteile.forEach((b) => {
      const a = b.attribute;
      const wahl = (feld, karte, wert, namen) => `
        <select data-attr="${b.id}" data-feld="${feld}">
          ${Object.keys(karte).map((k) =>
            `<option value="${k}" ${k === (wert || "") ? "selected" : ""}>${namen(k)}</option>`).join("")}
        </select>`;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${b.bezeichnung}</td>
        <td>${b.kategorie}</td>
        <td>${b.typName}</td>
        <td>${b.menge}</td>
        <td>${wahl("feuer", FEUERWIDERSTAND, a.feuer, (k) => FEUERWIDERSTAND[k].name)}
          <div class="layer-note">${feuerText(a.feuer)}</div></td>
        <td>${wahl("baustoff", BAUSTOFFKLASSEN, a.baustoff, (k) => BAUSTOFFKLASSEN[k].name)}
          <div class="layer-note">${baustoffText(a.baustoff)}</div></td>
        <td>${wahl("gewerk", GEWERKE, a.gewerk, (k) => GEWERKE[k])}</td>
        <td><input type="text" data-attr="${b.id}" data-feld="abschnitt" value="${a.abschnitt || ""}" placeholder="BA 1"></td>
        <td><input type="checkbox" data-attr="${b.id}" data-feld="tragend" ${a.tragend ? "checked" : ""}></td>
        <td><input type="checkbox" data-attr="${b.id}" data-feld="aussen" ${a.aussen ? "checked" : ""}></td>
        <td><input type="text" data-attr="${b.id}" data-feld="bemerkung" value="${a.bemerkung || ""}"></td>`;
      body.appendChild(tr);
    });

    const aus = attributAuswertung(bauteile);
    const kennzahl = (label, wert, warnung) =>
      `<div class="stat"><span class="label">${label}</span>`
      + `<span class="value${warnung ? " warnwert" : ""}">${wert}</span></div>`;
    document.getElementById("attributKennzahlen").innerHTML = bauteile.length
      ? kennzahl("Bauteile", aus.gesamt)
        + kennzahl("ohne Feuerwiderstand", aus.ohneFeuer, aus.ohneFeuer > 0)
        + kennzahl("ohne Gewerk", aus.ohneGewerk, aus.ohneGewerk > 0)
        + aus.jeFeuer.filter((f) => f.schluessel).map((f) => kennzahl(f.name.split(" – ")[0], f.anzahl)).join("")
      : "";

    // ---- Kollisionsbefunde
    const kBody = document.getElementById("kollisionBody");
    kBody.innerHTML = "";
    document.getElementById("kollisionEmpty").hidden = !!letzteKollision;
    if (letzteKollision) {
      const m = (w) => w.toFixed(3).replace(".", ",");
      letzteKollision.befunde.forEach((f) => {
        const marke = f.art === "durchdringung" ? '<span class="cut-warning">Durchdringung</span>'
          : f.art === "anschluss" ? '<span class="anschluss-marke">Anschluss</span>'
            : '<span class="beruehrung-marke">Berührung</span>';
        const tr = document.createElement("tr");
        tr.className = f.art === "durchdringung" ? "durchdringung" : "";
        tr.innerHTML = `
          <td>${marke}</td>
          <td>${f.a.bezeichnung}<div class="layer-note">${f.a.typName}</div></td>
          <td>${f.b.bezeichnung}<div class="layer-note">${f.b.typName}</div></td>
          <td>${kollisionText(f)}</td>
          <td>${m(f.tiefeEben)}</td>
          <td>${m(f.tiefeLotrecht)}</td>
          <td>${m(f.mitte.x)} / ${m(f.mitte.y)} / ${m(f.mitte.z)}</td>`;
        kBody.appendChild(tr);
      });
      document.getElementById("kollisionKennzahlen").innerHTML =
        kennzahl("geprüfte Paare", letzteKollision.geprueft)
        + kennzahl("Durchdringungen", letzteKollision.durchdringungen, letzteKollision.durchdringungen > 0)
        + kennzahl("konstruktive Anschlüsse", letzteKollision.anschluesse)
        + kennzahl("Berührungen", letzteKollision.beruehrungen)
        + kennzahl("Toleranz", `${letzteKollision.toleranz.toFixed(3).replace(".", ",")} m`);
    } else {
      document.getElementById("kollisionKennzahlen").innerHTML = "";
    }
  }

  document.getElementById("viewKoordination").addEventListener("change", (e) => {
    const ziel = e.target;
    if (!ziel.dataset.attr) return;
    const wert = ziel.type === "checkbox" ? ziel.checked : ziel.value;
    setzeAttribut(ziel.dataset.attr, ziel.dataset.feld, wert);
  });

  document.getElementById("btnAttributeAlle").addEventListener("click", attributeVorbelegen);

  document.getElementById("btnKollision").addEventListener("click", () => {
    const { bauteile } = modellBauteile();
    if (bauteile.length < 2) { setStatus("Für eine Prüfung sind mindestens zwei Bauteile nötig.", "error"); return; }
    const t = parseFloat(document.getElementById("kollisionToleranz").value);
    letzteKollision = kollisionsPruefung(bauteile, { toleranz: Number.isFinite(t) && t >= 0 ? t : 0.01 });
    renderKoordination();
    setStatus(`${letzteKollision.geprueft} Bauteilpaare geprüft · `
      + `${letzteKollision.durchdringungen} Durchdringung${letzteKollision.durchdringungen === 1 ? "" : "en"}, `
      + `${letzteKollision.anschluesse} konstruktive Anschlüsse, ${letzteKollision.beruehrungen} Berührungen. `
      + "Aussparungen mindern den Körper nicht.",
    letzteKollision.durchdringungen ? "error" : "ok");
  });

  document.getElementById("btnKollisionCsv").addEventListener("click", () => {
    if (!letzteKollision) { setStatus("Zuerst die Kollisionsprüfung ausführen.", "error"); return; }
    const rows = [["Kollisionsprüfung – " + (document.getElementById("projectName").value || "Projekt")]];
    rows.push([`${letzteKollision.geprueft} Paare geprüft`,
      `${letzteKollision.durchdringungen} Durchdringungen`,
      `${letzteKollision.anschluesse} Anschlüsse`,
      `${letzteKollision.beruehrungen} Berührungen`,
      `Toleranz ${letzteKollision.toleranz.toFixed(3)} m`]);
    rows.push([]);
    rows.push(["Art", "Bauteil A", "Typ A", "Bauteil B", "Typ B", "Befund",
      "Überdeckung Grundriss [m]", "Höhenschnitt [m]", "x [m]", "y [m]", "z [m]"]);
    letzteKollision.befunde.forEach((f) => {
      rows.push([f.art, f.a.bezeichnung, f.a.typName, f.b.bezeichnung, f.b.typName,
        kollisionText(f), f.tiefeEben.toFixed(3), f.tiefeLotrecht.toFixed(3),
        f.mitte.x.toFixed(3), f.mitte.y.toFixed(3), f.mitte.z.toFixed(3)]);
    });
    const name = (document.getElementById("projectName").value || "Projekt").replace(/\s+/g, "_");
    saveFile(`Kollisionen_${name}.csv`, "\ufeff" + zuCsv(rows), "text/csv;charset=utf-8;");
  });

  document.getElementById("btnIfcExport").addEventListener("click", () => {
    const { bauteile, geschosse } = modellBauteile();
    if (!bauteile.length) { setStatus("Keine Bauteile vorhanden.", "error"); return; }
    const inhalt = ifcExport({ projekt: projektKopf(), bauteile, geschosse });
    const name = (document.getElementById("projectName").value || "Projekt").replace(/\s+/g, "_");
    saveFile(`${name}.ifc`, inhalt, "application/x-step");
    const eintraege = (inhalt.match(/^#\d+= /gm) || []).length;
    document.getElementById("ifcStand").textContent =
      `Zuletzt ausgegeben: ${bauteile.length} Bauteile in ${geschosse.length} Geschoss`
      + `${geschosse.length === 1 ? "" : "en"} · ${eintraege} IFC-Einträge · `
      + `${(inhalt.length / 1024).toFixed(0)} kB · Schema IFC4 (ISO 16739).`;
    setStatus(`IFC4 ausgegeben: ${bauteile.length} Bauteile, ${eintraege} Einträge. `
      + "Bewehrung, Räume und Achsraster sind nicht enthalten.", "ok");
  });

  document.getElementById("btnDxfExport").addEventListener("click", () => {
    const { bauteile } = modellBauteile();
    if (!bauteile.length) { setStatus("Keine Bauteile vorhanden.", "error"); return; }
    const modus = document.getElementById("dxfModus").value;
    const einheit = document.getElementById("dxfEinheit").value;
    const mitText = document.getElementById("dxfText").value === "ja";
    const inhalt = dxfExport({ projekt: projektKopf(), bauteile, modus, einheit, text: mitText });
    const bericht = dxfBericht(inhalt, bauteile, modus, einheit);
    const name = (document.getElementById("projectName").value || "Projekt").replace(/\s+/g, "_");
    saveFile(`${name}_${modus === "modell" ? "Modell" : "Grundriss"}.dxf`, inhalt, "application/dxf");
    document.getElementById("dxfStand").textContent =
      `Zuletzt ausgegeben: ${bericht.modus} · ${bericht.bauteile} Bauteile · `
      + `${bericht.elemente} Zeichenelemente auf ${bericht.ebenen} Ebenen · `
      + `Einheit ${bericht.einheit} · ${(bericht.groesse / 1024).toFixed(0)} kB · Fassung R12 (AC1009).`;
    setStatus(`DXF ausgegeben: ${bericht.modus}, ${bericht.elemente} Zeichenelemente auf `
      + `${bericht.ebenen} Ebenen, Einheit ${bericht.einheit}. `
      + "Bemaßung, Schraffur und Öffnungen sind nicht enthalten.", "ok");
  });

  /* ============================== Bestand: Punktwolke aus dem Laserscan */

  /** Punktgröße der Darstellung: bei dichten Wolken kleiner. */
  function punktGroesse() {
    const r = parseFloat(document.getElementById("scanRaster").value);
    return Number.isFinite(r) && r > 0 ? Math.max(0.01, r * 0.8) : 0.02;
  }

  /** Baustoffliste für die Übernahme füllen. */
  (function fuelleScanBaustoff() {
    const wahl = document.getElementById("scanBaustoff");
    wahl.innerHTML = Object.keys(BAUSTOFFE)
      .map((k) => `<option value="${k}"${k === "ks_mauerwerk" ? " selected" : ""}>${BAUSTOFFE[k].name}</option>`)
      .join("");
  }());

  function scanZahl(wert, stellen) {
    return Number(wert).toFixed(stellen === undefined ? 2 : stellen).replace(".", ",");
  }

  function scanLaden() {
    const eingabe = document.getElementById("scanDatei");
    const datei = eingabe.files && eingabe.files[0];
    if (!datei) { setStatus("Zuerst eine Scandatei wählen.", "error"); return; }
    if (!punktwolkeFormat(datei.name)) {
      setStatus(`„${datei.name}“ hat kein gelesenes Format. Gelesen werden LAS, PLY, PTS und XYZ; `
        + "LAZ und E57 bitte in der Scannersoftware umsetzen.", "error");
      return;
    }
    setStatus(`„${datei.name}“ wird gelesen …`, "info");
    const leser = new FileReader();
    leser.onload = () => {
      try {
        const beginn = Date.now();
        const voll = punktwolkeLesen(datei.name, leser.result);
        if (!voll.anzahl) throw new Error("Die Datei enthält keine Punkte.");
        const raster = parseFloat(document.getElementById("scanRaster").value);
        const anzeige = Number.isFinite(raster) && raster > 0
          ? punktwolkeRasterfilter(voll, raster) : voll;
        punktwolke = { voll, anzeige, raster, statistik: punktwolkeStatistik(voll), ms: Date.now() - beginn };
        scanSchnitt = null; scanWaende = null; scanAuswahl = new Set();

        // Wandhöhe aus der Wolke vorbelegen: Boden bis Decke
        const h = punktwolke.statistik.hoehe;
        if (h > 1.5 && h < 12) document.getElementById("scanHoehe").value = h.toFixed(2);

        renderBestand();
        refreshAll();
        if (!TABS.model.view.hidden) renderModel();
        // Kamera auf die Wolke stellen: die acht Ecken ihres Hüllquaders
        const g = voll.grenzen;
        const ecken = [];
        [g.min.x, g.max.x].forEach((x) => [g.min.y, g.max.y].forEach((y) =>
          [g.min.z, g.max.z].forEach((z) => ecken.push({ x, y, z }))));
        sketch.frameContent(ecken);
        result.frameContent(ecken);
        setStatus(`Scan „${datei.name}“ geladen: ${voll.anzahl.toLocaleString("de-DE")} Punkte, `
          + `dargestellt ${anzeige.anzahl.toLocaleString("de-DE")}. Bezugspunkt `
          + `${punktwolke.voll.bezug.x} / ${punktwolke.voll.bezug.y} / ${punktwolke.voll.bezug.z} `
          + "– er gehört in jede Weitergabe.", "ok");
      } catch (fehler) {
        setStatus("Scan nicht lesbar: " + fehler.message, "error");
      }
      eingabe.value = "";
    };
    leser.onerror = () => setStatus("Die Datei konnte nicht gelesen werden.", "error");
    leser.readAsArrayBuffer(datei);
  }

  function scanLoeschen() {
    if (!punktwolke) { setStatus("Es ist kein Scan geladen.", "info"); return; }
    punktwolke = null; scanSchnitt = null; scanWaende = null; scanAuswahl = new Set();
    renderBestand();
    refreshAll();
    if (!TABS.model.view.hidden) renderModel();
    setStatus("Punktwolke entfernt. Die daraus übernommenen Bauteile bleiben im Modell.", "ok");
  }

  function scanSchnittLegen() {
    if (!punktwolke) { setStatus("Zuerst einen Scan laden.", "error"); return; }
    const ueber = parseFloat(document.getElementById("scanKoteAnsicht").value);
    const dicke = parseFloat(document.getElementById("scanBandAnsicht").value);
    const boden = punktwolke.voll.grenzen.min.y;
    const kote = boden + (Number.isFinite(ueber) ? ueber : 1.2);
    const punkte = punktwolkeSchnitt(punktwolke.voll, kote, Number.isFinite(dicke) && dicke > 0 ? dicke : 0.06);
    scanSchnitt = { punkte, kote, dicke, ueber };
    scanWaende = null; scanAuswahl = new Set();
    renderBestand();
    renderSketch();
    if (!punkte.length) {
      setStatus(`Im Band bei ${scanZahl(kote)} m liegt kein Punkt. `
        + "Die stärksten Höhenlagen in den Kennwerten zeigen, wo Boden und Decke sind.", "error");
      return;
    }
    setStatus(`Höhenschnitt bei ${scanZahl(kote)} m (${scanZahl(ueber)} m über dem tiefsten Punkt): `
      + `${punkte.length.toLocaleString("de-DE")} Punkte. Der Schnitt liegt im Grundrissfenster als Vorlage.`, "ok");
  }

  function scanWaendeErkennen() {
    if (!scanSchnitt || !scanSchnitt.punkte.length) { setStatus("Zuerst einen Höhenschnitt legen.", "error"); return; }
    const zahl = (id, ersatz) => {
      const w = parseFloat(document.getElementById(id).value);
      return Number.isFinite(w) ? w : ersatz;
    };
    const beginn = Date.now();
    scanWaende = wandErkennung(scanSchnitt.punkte, {
      minLaenge: zahl("scanMinLaenge", 1.0),
      luecke: zahl("scanLuecke", 0.6),
      dickeMin: zahl("scanDickeMin", 0.05),
      dickeMax: zahl("scanDickeMax", 0.60),
    });
    // Vorschlag: alles übernehmen, was gefunden wurde
    scanAuswahl = new Set(scanWaende.waende.map((_, i) => i));
    renderBestand();
    renderSketch();
    setStatus(`${scanWaende.waende.length} Wände erkannt, ${scanWaende.offen.length} Flächen einseitig `
      + `(ohne Gegenfläche, Dicke unbekannt), ${Date.now() - beginn} ms. `
      + "Das Ergebnis ist ein Vorschlag und ersetzt das Aufmaß vor Ort nicht.",
    scanWaende.waende.length ? "ok" : "error");
  }

  /** Wandart nach der Dicke: dicke Wände außen, dünne innen. */
  function scanWandArt(dicke) {
    const wahl = document.getElementById("scanBauteilart").value;
    if (wahl !== "auto") return wahl;
    return dicke >= 0.20 ? "wand_aussen" : "wand_innen";
  }

  function scanUebernehmen() {
    if (!scanWaende || !scanWaende.waende.length) { setStatus("Zuerst Wände erkennen.", "error"); return; }
    if (!scanAuswahl.size) { setStatus("Keine Wand ausgewählt.", "error"); return; }
    const stoff = document.getElementById("scanBaustoff").value;
    const hoehe = parseFloat(document.getElementById("scanHoehe").value) || 2.75;
    const kote = scanSchnitt ? punktwolke.voll.grenzen.min.y : 0;
    let angelegt = 0;

    scanWaende.waende.forEach((w, i) => {
      if (!scanAuswahl.has(i)) return;
      const kind = scanWandArt(w.dicke);
      const element = {
        id: model.nextElementId++,
        kind,
        // Der Grundriss der Anwendung liegt in x und z, die Höhe in y
        p1: { x: w.p1.x, y: kote, z: w.p1.z },
        p2: { x: w.p2.x, y: kote, z: w.p2.z },
        // Eine Schicht in der gemessenen Dicke: der wirkliche Aufbau des
        // Bestands ist aus dem Scan nicht ablesbar und im Aufmaß zu klären
        layers: [{ material: stoff, d: Math.round(w.dicke * 1000) / 1000 }],
        hoehe,
        anzahl: 1,
        zielU: null,
        bemerkung: `aus Punktwolke ${punktwolke.voll.quelle}`,
      };
      model.elements.set(element.id, element);
      angelegt += 1;
    });

    scanAuswahl = new Set();
    renderBestand();
    refreshAll();
    setStatus(`${angelegt} Wände aus dem Scan übernommen (Baustoff ${BAUSTOFFE[stoff].name}, `
      + `Höhe ${scanZahl(hoehe)} m). Die Dicke ist gemessen, der Schichtaufbau ist eine Annahme – `
      + "er ist im Bestand zu klären, ebenso Öffnungen und die Wandhöhe je Raum.", "ok");
  }

  function scanCsv() {
    if (!scanWaende || !scanWaende.waende.length) { setStatus("Zuerst Wände erkennen.", "error"); return; }
    const b = punktwolke.voll.bezug;
    const rows = [["Bestandsaufnahme aus Punktwolke – " + (document.getElementById("projectName").value || "Projekt")]];
    rows.push(["Quelle", punktwolke.voll.quelle, punktwolke.voll.format]);
    rows.push(["Bezugspunkt (Scankoordinaten)", b.x, b.y, b.z]);
    rows.push(["Höhenschnitt [m]", scanSchnitt.kote.toFixed(3), "Banddicke [m]", scanSchnitt.dicke.toFixed(3)]);
    rows.push([]);
    rows.push(["Nr", "x1 [m]", "z1 [m]", "x2 [m]", "z2 [m]", "Länge [m]", "Dicke [m]",
      "Richtung [Grad]", "Punkte", "Streuung [mm]", "Vorschlag",
      "x1 Scan", "y1 Scan", "x2 Scan", "y2 Scan"]);
    scanWaende.waende.forEach((w, i) => {
      rows.push([i + 1, w.p1.x.toFixed(3), w.p1.z.toFixed(3), w.p2.x.toFixed(3), w.p2.z.toFixed(3),
        w.laenge.toFixed(3), w.dicke.toFixed(3), w.richtung.toFixed(1), w.punkte,
        (w.streuung * 1000).toFixed(1), BAUTEILTYPEN[scanWandArt(w.dicke)].name,
        (w.p1.x + b.x).toFixed(3), (w.p1.z + b.y).toFixed(3),
        (w.p2.x + b.x).toFixed(3), (w.p2.z + b.y).toFixed(3)]);
    });
    if (scanWaende.offen.length) {
      rows.push([]);
      rows.push(["Einseitig erfasste Flächen – Dicke unbekannt, vor Ort zu messen"]);
      rows.push(["Nr", "x1 [m]", "z1 [m]", "x2 [m]", "z2 [m]", "Länge [m]", "Richtung [Grad]", "Punkte"]);
      scanWaende.offen.forEach((o, i) => {
        rows.push([i + 1, o.p1.x.toFixed(3), o.p1.z.toFixed(3), o.p2.x.toFixed(3), o.p2.z.toFixed(3),
          o.laenge.toFixed(3), ((o.winkel * 180) / Math.PI).toFixed(1), o.punkte]);
      });
    }
    const name = (document.getElementById("projectName").value || "Projekt").replace(/\s+/g, "_");
    saveFile(`Bestand_${name}.csv`, "\ufeff" + zuCsv(rows), "text/csv;charset=utf-8;");
    setStatus("Bestandsaufmaß als CSV ausgegeben – mit Modell- und Scankoordinaten.", "ok");
  }

  function renderBestand() {
    const kennzahl = (label, wert, warnung) =>
      `<div class="stat"><span class="label">${label}</span>`
      + `<span class="value${warnung ? " warnwert" : ""}">${wert}</span></div>`;

    document.getElementById("scanEmpty").hidden = !!punktwolke;
    const kennzahlen = document.getElementById("scanKennzahlen");
    const stand = document.getElementById("scanStand");

    if (!punktwolke) {
      kennzahlen.innerHTML = "";
      stand.textContent = "";
    } else {
      const st = punktwolke.statistik;
      const g = punktwolke.voll.grenzen;
      kennzahlen.innerHTML =
        kennzahl("Punkte", st.anzahl.toLocaleString("de-DE"))
        + kennzahl("dargestellt", punktwolke.anzeige.anzahl.toLocaleString("de-DE"))
        + kennzahl("Breite × Tiefe", `${scanZahl(st.breite)} × ${scanZahl(st.tiefe)} m`)
        + kennzahl("Höhe", `${scanZahl(st.hoehe)} m`)
        + kennzahl("Dichte", `${st.dichte.toFixed(0)} Pkt/m²`);
      const spitzen = st.spitzen
        .map((sp) => `${scanZahl(sp.von)}…${scanZahl(sp.bis)} m (${sp.anzahl.toLocaleString("de-DE")} Pkt)`)
        .join(" · ");
      stand.innerHTML = `Datei: <strong>${punktwolke.voll.quelle}</strong> · ${punktwolke.voll.format} · `
        + `gelesen in ${punktwolke.ms} ms.<br>`
        + `Bezugspunkt (Projektnullpunkt) in Scankoordinaten: `
        + `<strong>${punktwolke.voll.bezug.x} / ${punktwolke.voll.bezug.y} / ${punktwolke.voll.bezug.z}</strong> `
        + "– ohne ihn ist der Lagebezug nach DIN 18710-1 verloren.<br>"
        + `Stärkste Höhenlagen (Boden, Decke, Einbauten): ${spitzen}.`
        + (punktwolke.voll.hinweise.length ? `<br>${punktwolke.voll.hinweise.join(" ")}` : "");
    }

    // ---- Tabelle der erkannten Wände
    const body = document.getElementById("scanWandBody");
    body.innerHTML = "";
    document.getElementById("scanWandEmpty").hidden = !!(scanWaende && scanWaende.waende.length);
    const wandKennzahlen = document.getElementById("scanWandKennzahlen");

    if (!scanWaende) {
      wandKennzahlen.innerHTML = scanSchnitt
        ? kennzahl("Schnittkote", `${scanZahl(scanSchnitt.kote)} m`)
          + kennzahl("Punkte im Schnitt", scanSchnitt.punkte.length.toLocaleString("de-DE"))
        : "";
      return;
    }

    scanWaende.waende.forEach((w, i) => {
      const art = BAUTEILTYPEN[scanWandArt(w.dicke)].name;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input type="checkbox" data-scanwand="${i}" ${scanAuswahl.has(i) ? "checked" : ""}></td>
        <td>${i + 1}</td>
        <td>${scanZahl(w.p1.x)} / ${scanZahl(w.p1.z)}</td>
        <td>${scanZahl(w.p2.x)} / ${scanZahl(w.p2.z)}</td>
        <td>${scanZahl(w.laenge)}</td>
        <td><strong>${scanZahl(w.dicke, 3)}</strong></td>
        <td>${scanZahl(w.richtung, 1)}</td>
        <td>${w.punkte}</td>
        <td>${scanZahl(w.streuung * 1000, 1)}</td>
        <td>${art}</td>`;
      body.appendChild(tr);
    });

    const gesamt = scanWaende.waende.reduce((s, w) => s + w.laenge, 0);
    wandKennzahlen.innerHTML =
      kennzahl("Schnittkote", `${scanZahl(scanSchnitt.kote)} m`)
      + kennzahl("Punkte im Schnitt", scanWaende.punkte.toLocaleString("de-DE"))
      + kennzahl("Wände", scanWaende.waende.length)
      + kennzahl("Wandlänge", `${scanZahl(gesamt)} m`)
      + kennzahl("einseitig erfasst", scanWaende.offen.length, scanWaende.offen.length > 0)
      + kennzahl("ausgewählt", scanAuswahl.size);
  }

  document.getElementById("viewBestand").addEventListener("change", (e) => {
    const ziel = e.target;
    if (ziel.dataset.scanwand === undefined) return;
    const i = parseInt(ziel.dataset.scanwand, 10);
    if (ziel.checked) scanAuswahl.add(i); else scanAuswahl.delete(i);
    renderBestand();
    renderSketch();
  });

  document.getElementById("btnScanLaden").addEventListener("click", scanLaden);
  document.getElementById("btnScanLoeschen").addEventListener("click", scanLoeschen);
  document.getElementById("btnScanSchnitt").addEventListener("click", scanSchnittLegen);
  document.getElementById("btnScanWaende").addEventListener("click", scanWaendeErkennen);
  document.getElementById("btnScanUebernehmen").addEventListener("click", scanUebernehmen);
  document.getElementById("btnScanCsv").addEventListener("click", scanCsv);
  document.getElementById("scanZeigen").addEventListener("change", () => {
    if (!TABS.model.view.hidden) renderModel();
  });
  // Die Felder im Menüband und in der Ansicht zeigen dasselbe an
  [["scanKote", "scanKoteAnsicht"], ["scanBand", "scanBandAnsicht"]].forEach(([band, ansicht]) => {
    const a = document.getElementById(band), b = document.getElementById(ansicht);
    a.addEventListener("change", () => { b.value = a.value; });
    b.addEventListener("change", () => { a.value = b.value; });
  });

  /* ============================== Anschlüsse nach DIN EN 1993-1-8 */

  let anschlussBlattId = null;

  /** Vorbelegung eines Anschlusses nach Art und Stabkraft. */
  function anschlussVorgabe(art, member) {
    const design = member ? designMember(member) : null;
    const tabelle = design ? STEEL_DB[design.family] : null;
    const profil = tabelle && tabelle.find((x) => design.profileName.indexOf(x.name) === 0);
    const mass = profil ? sectionOuter(design.family, profil) : { h: 200, b: 100 };
    const A = profil ? profil.A * 100 : 2000;              // cm² -> mm²
    const N = member ? anschlussStabkraft(member) : 100;
    const guete = document.getElementById("steelGradeGlobal").value;
    return {
      art,
      memberId: member ? member.id : null,
      bezeichnung: member ? memberLabel(member) : `A${model.nextAnschlussId}`,
      guete,
      N_Ed: Math.abs(N),
      M_Ed: 0, V_Ed: Math.abs(N) * 0.2,
      schraube: "M16", klasse: "8.8", anzahl: 2, scherfugen: 1, imGewinde: true,
      tBlech: 10, tStab: Math.max(6, Math.round(mass.h / 20)),
      e1: 40, e2: 40, p1: 60, p2: 0, reihen: 1,
      A, loecherImSchnitt: 1,
      a: 4, laenge: 150, anzahlNaehte: 2,
      tp: 20, hProfil: mass.h,
      // Hebelarm der obersten Schraubenreihe zum Druckpunkt; bei kleinen
      // Profilen ist ein Momentenanschluss ohnehin nicht sinnvoll
      reihenAbstand: Math.max(120, Math.round(mass.h * 0.8)),
    };
  }

  /** Stabkraft eines Stabes: aus der Berechnung, sonst aus der Eingabe. */
  function anschlussStabkraft(member) {
    if (lastSolution && lastSolution.ok && lastSolution.forces[member.id] !== undefined) {
      return lastSolution.forces[member.id];
    }
    return member.loadType === "Biegung" ? 0 : (member.force || 0);
  }

  /** Anschluss rechnen. */
  function anschlussRechnen(an) {
    if (an.art === "knotenblech_geschweisst") {
      return anschlussKnotenblechSchweiss(an);
    }
    if (an.art === "stirnplatte") {
      // Zwei Schraubenreihen: oberhalb und unterhalb des Zugflansches
      const m = Math.max(1.2 * SCHRAUBEN[an.schraube].d0, 45);
      return anschlussStirnplatte(Object.assign({}, an, {
        reihen: [
          { abstand: an.reihenAbstand, m, e: m },
          { abstand: Math.max(40, an.reihenAbstand - 100), m, e: m },
        ],
      }));
    }
    return anschlussKnotenblech(an);
  }

  /**
   * Kleinste Schraubenzahl, mit der alle Nachweise erfüllt sind.
   * Es werden mindestens zwei Schrauben gesetzt: Eine einzelne Schraube
   * ist im Stahlbau unüblich, weil der Anschluss sich um sie drehen kann
   * und die Ausmitte nicht erfasst wird.
   */
  function anschlussSchraubenErmitteln(an) {
    if (an.art !== "knotenblech_geschraubt") return null;
    for (let n = 2; n <= 12; n++) {
      const probe = Object.assign({}, an, { anzahl: n });
      const erg = anschlussRechnen(probe);
      if (erg.status !== "fehler" && erg.ausnutzung <= 1.0) return n;
    }
    return null;
  }

  function anschlussStabListe() {
    return Array.from(model.members.values());
  }

  function fuelleStabAuswahl() {
    const stäbe = anschlussStabListe();
    ["anschlussStab", "anschlussStabAnsicht"].forEach((id) => {
      const wahl = document.getElementById(id);
      if (!wahl) return;
      const vorher = wahl.value;
      wahl.innerHTML = stäbe.map((m) => {
        const N = anschlussStabkraft(m);
        return `<option value="${m.id}">${memberLabel(m)} · ${m.type} · `
          + `${N >= 0 ? "+" : "−"}${Math.abs(N).toFixed(1)} kN</option>`;
      }).join("") || '<option value="">kein Stab im Modell</option>';
      if (stäbe.some((m) => String(m.id) === vorher)) wahl.value = vorher;
    });
  }

  function renderAnschluesse() {
    fuelleStabAuswahl();
    const liste = Array.from(model.anschluesse.values());
    document.getElementById("anschlussEmpty").hidden = liste.length > 0;
    const body = document.getElementById("anschlussBody");
    body.innerHTML = "";
    const meldungen = [];

    liste.forEach((an) => {
      const erg = anschlussRechnen(an);
      an.ergebnis = erg;
      const farbe = erg.status === "fehler" ? "cut-warning"
        : erg.status === "grenzwertig" ? "beruehrung-marke" : "anschluss-marke";
      const tr = document.createElement("tr");
      const geschraubt = an.art === "knotenblech_geschraubt";
      const stirn = an.art === "stirnplatte";
      tr.innerHTML = `
        <td><input type="text" data-an="${an.id}" data-feld="bezeichnung" value="${an.bezeichnung}"></td>
        <td>${an.memberId ? memberLabel(model.members.get(an.memberId) || { id: an.memberId }) : "–"}</td>
        <td><select data-an="${an.id}" data-feld="art">
          ${Object.keys(ANSCHLUSSARTEN).map((k) => `<option value="${k}"${k === an.art ? " selected" : ""}>${ANSCHLUSSARTEN[k].name}</option>`).join("")}
        </select></td>
        <td>${stirn
          ? `M <input type="number" step="5" data-an="${an.id}" data-feld="M_Ed" value="${an.M_Ed}"> kNm<br>`
            + `V <input type="number" step="5" data-an="${an.id}" data-feld="V_Ed" value="${an.V_Ed.toFixed(1)}"> kN`
          : `N <input type="number" step="5" data-an="${an.id}" data-feld="N_Ed" value="${an.N_Ed.toFixed(1)}"> kN`}</td>
        <td>${an.art === "knotenblech_geschweisst" ? "–" : `<select data-an="${an.id}" data-feld="schraube">
          ${Object.keys(SCHRAUBEN).map((k) => `<option value="${k}"${k === an.schraube ? " selected" : ""}>${k}</option>`).join("")}
        </select>`}</td>
        <td>${an.art === "knotenblech_geschweisst" ? "–" : `<select data-an="${an.id}" data-feld="klasse">
          ${Object.keys(SCHRAUBENKLASSEN).map((k) => `<option value="${k}"${k === an.klasse ? " selected" : ""}>${k}</option>`).join("")}
        </select>`}</td>
        <td>${geschraubt ? `<input type="number" step="1" min="1" data-an="${an.id}" data-feld="anzahl" value="${an.anzahl}">` : "–"}</td>
        <td>${geschraubt ? `<select data-an="${an.id}" data-feld="scherfugen">
          <option value="1"${an.scherfugen === 1 ? " selected" : ""}>1</option>
          <option value="2"${an.scherfugen === 2 ? " selected" : ""}>2</option></select>` : "–"}</td>
        <td>${stirn
          ? `t_p <input type="number" step="1" data-an="${an.id}" data-feld="tp" value="${an.tp}">`
          : `<input type="number" step="1" data-an="${an.id}" data-feld="tBlech" value="${an.tBlech}"> / `
            + `<input type="number" step="1" data-an="${an.id}" data-feld="tStab" value="${an.tStab}">`}</td>
        <td>${geschraubt
          ? `<input type="number" step="5" data-an="${an.id}" data-feld="e1" value="${an.e1}">`
            + `<input type="number" step="5" data-an="${an.id}" data-feld="e2" value="${an.e2}">`
            + `<input type="number" step="5" data-an="${an.id}" data-feld="p1" value="${an.p1}">`
            + `<input type="number" step="5" data-an="${an.id}" data-feld="p2" value="${an.p2}">`
          : stirn ? `h = <input type="number" step="10" data-an="${an.id}" data-feld="reihenAbstand" value="${an.reihenAbstand}">` : "–"}</td>
        <td>${an.art === "knotenblech_geschweisst"
          ? `<input type="number" step="0.5" data-an="${an.id}" data-feld="a" value="${an.a}"> × `
            + `<input type="number" step="10" data-an="${an.id}" data-feld="laenge" value="${an.laenge}">`
          : "–"}</td>
        <td>${erg.massgebend ? erg.massgebend.name : "–"}</td>
        <td><span class="${farbe}">${erg.ausnutzung.toFixed(3).replace(".", ",")}</span></td>
        <td><button class="tool-btn" data-an-blatt="${an.id}" title="Anschlussblatt">📄</button></td>
        <td><button class="row-remove" data-an-weg="${an.id}" title="Anschluss löschen">✕</button></td>`;
      body.appendChild(tr);
      erg.meldungen.forEach((m) => meldungen.push({ an: an.bezeichnung, m }));
    });

    const kennzahl = (label, wert, warnung) =>
      `<div class="stat"><span class="label">${label}</span>`
      + `<span class="value${warnung ? " warnwert" : ""}">${wert}</span></div>`;
    const fehler = liste.filter((a) => a.ergebnis.status === "fehler").length;
    const grenz = liste.filter((a) => a.ergebnis.status === "grenzwertig").length;
    document.getElementById("anschlussKennzahlen").innerHTML = liste.length
      ? kennzahl("Anschlüsse", liste.length)
        + kennzahl("nicht erfüllt", fehler, fehler > 0)
        + kennzahl("über 95 %", grenz, grenz > 0)
        + kennzahl("größte Ausnutzung",
          Math.max(...liste.map((a) => a.ergebnis.ausnutzung)).toFixed(3).replace(".", ","),
          Math.max(...liste.map((a) => a.ergebnis.ausnutzung)) > 1)
      : "";

    document.getElementById("anschlussMeldungen").innerHTML = meldungen.length
      ? meldungen.slice(0, 12).map((x) => `<div class="${x.m.art === "fehler" ? "warnwert" : ""}">`
        + `${x.m.art === "fehler" ? "✕" : "!"} ${x.an}: ${x.m.text}</div>`).join("")
      : (liste.length ? "Alle Rand- und Lochabstände sowie Nahtmaße halten die Norm ein." : "");
  }

  /* ---- Bedienung Anschlüsse */

  document.getElementById("viewAnschluss").addEventListener("change", (e) => {
    const ziel = e.target;
    if (!ziel.dataset.an) return;
    const an = model.anschluesse.get(parseInt(ziel.dataset.an, 10));
    if (!an) return;
    const feld = ziel.dataset.feld;
    const textfelder = ["bezeichnung", "art", "schraube", "klasse"];
    an[feld] = textfelder.indexOf(feld) >= 0 ? ziel.value : (parseFloat(ziel.value) || 0);
    if (feld === "art" && an.art === "stirnplatte" && !an.M_Ed) {
      // Beim Wechsel auf den Momentenanschluss eine sinnvolle Vorbelegung setzen
      an.M_Ed = Math.round(an.N_Ed * 0.3);
    }
    renderAnschluesse();
  });

  document.getElementById("viewAnschluss").addEventListener("click", (e) => {
    const weg = e.target.closest("[data-an-weg]");
    if (weg) {
      model.anschluesse.delete(parseInt(weg.dataset.anWeg, 10));
      renderAnschluesse();
      return;
    }
    const blatt = e.target.closest("[data-an-blatt]");
    if (blatt) zeigeAnschlussblatt(parseInt(blatt.dataset.anBlatt, 10));
  });

  function neuerAnschluss(art, member) {
    const an = anschlussVorgabe(art, member);
    an.id = model.nextAnschlussId++;
    if (!member) an.bezeichnung = `A${an.id}`;
    model.anschluesse.set(an.id, an);
    return an;
  }

  document.getElementById("btnAnschlussNeu").addEventListener("click", () => {
    const wahl = document.getElementById("anschlussStabAnsicht").value
      || document.getElementById("anschlussStab").value;
    const member = model.members.get(parseInt(wahl, 10));
    const art = document.getElementById("anschlussArtAnsicht").value;
    const an = neuerAnschluss(art, member);
    // Schraubenzahl gleich sinnvoll wählen
    const n = anschlussSchraubenErmitteln(an);
    if (n) an.anzahl = n;
    renderAnschluesse();
    const erg = anschlussRechnen(an);
    setStatus(`Anschluss ${an.bezeichnung} angelegt: ${ANSCHLUSSARTEN[art].name}`
      + (member ? `, N_Ed = ${an.N_Ed.toFixed(1)} kN aus der Berechnung` : "")
      + `. Ausnutzung ${erg.ausnutzung.toFixed(3).replace(".", ",")} (${erg.massgebend.name}).`,
    erg.status === "fehler" ? "error" : "ok");
  });

  document.getElementById("btnAnschlussAlle").addEventListener("click", () => {
    const stäbe = anschlussStabListe();
    if (!stäbe.length) { setStatus("Keine Stäbe im Modell.", "error"); return; }
    let angelegt = 0, offen = 0;
    stäbe.forEach((member) => {
      if (Array.from(model.anschluesse.values()).some((a) => a.memberId === member.id)) return;
      const N = anschlussStabkraft(member);
      // Druckstäbe werden über Kontakt oder Knotenblech angeschlossen; hier
      // wird für jeden Stab der geschraubte Knotenblechanschluss vorgeschlagen
      const an = neuerAnschluss("knotenblech_geschraubt", member);
      an.N_Ed = Math.abs(N);
      const n = anschlussSchraubenErmitteln(an);
      if (n) an.anzahl = n; else offen += 1;
      angelegt += 1;
    });
    renderAnschluesse();
    setStatus(`${angelegt} Anschlüsse vorgeschlagen, Schraubenzahl je Stab ermittelt.`
      + (offen ? ` ${offen} Anschlüsse sind mit bis zu 12 Schrauben nicht nachweisbar – `
        + "Schraubengröße, Blechdicke oder Anschlussart ändern." : "")
      + " Vorschlag für die Skizzenphase; Ausführung und Prüfung bleiben beim Tragwerksplaner.",
    offen ? "info" : "ok");
  });

  document.getElementById("btnAnschlussOptimieren").addEventListener("click", () => {
    const liste = Array.from(model.anschluesse.values());
    if (!liste.length) { setStatus("Kein Anschluss vorhanden.", "error"); return; }
    let geaendert = 0, offen = 0;
    liste.forEach((an) => {
      if (an.art !== "knotenblech_geschraubt") return;
      const n = anschlussSchraubenErmitteln(an);
      if (!n) { offen += 1; return; }
      if (n !== an.anzahl) { an.anzahl = n; geaendert += 1; }
    });
    renderAnschluesse();
    setStatus(`${geaendert} Anschlüsse angepasst.`
      + (offen ? ` ${offen} nicht nachweisbar – größere Schrauben oder dickeres Blech nötig.` : "")
      + " Maßgebend ist der ungünstigste Nachweis, meist Lochleibung oder Abscheren.",
    offen ? "info" : "ok");
  });

  function zeigeAnschlussblatt(id) {
    const an = model.anschluesse.get(id);
    if (!an) { setStatus("Zuerst einen Anschluss anlegen.", "error"); return; }
    anschlussBlattId = id;
    sheetArt = "anschluss";
    document.getElementById("sheetBody").innerHTML = anschlussblattSVG({
      anschluss: anschlussRechnen(an), eingabe: an,
      bezeichnung: an.bezeichnung, projekt: projektKopf(),
    });
    document.getElementById("sheetTitle").textContent = `Anschluss ${an.bezeichnung}`;
    const liste = Array.from(model.anschluesse.values());
    document.getElementById("sheetCounter").textContent =
      `${liste.indexOf(an) + 1} von ${liste.length} · ${ANSCHLUSSARTEN[an.art].name}`;
    document.getElementById("sheetOverlay").hidden = false;
  }

  document.getElementById("btnAnschlussBlatt").addEventListener("click", () => {
    const liste = Array.from(model.anschluesse.values());
    if (!liste.length) { setStatus("Zuerst einen Anschluss anlegen.", "error"); return; }
    zeigeAnschlussblatt(anschlussBlattId && model.anschluesse.has(anschlussBlattId)
      ? anschlussBlattId : liste[0].id);
  });

  document.getElementById("btnAnschlussCsv").addEventListener("click", () => {
    const liste = Array.from(model.anschluesse.values());
    if (!liste.length) { setStatus("Zuerst einen Anschluss anlegen.", "error"); return; }
    const rows = [["Anschlussnachweise nach DIN EN 1993-1-8 – "
      + (document.getElementById("projectName").value || "Projekt")]];
    rows.push(["Teilsicherheitsbeiwerte", "gammaM0 = 1,00", "gammaM2 = 1,25"]);
    rows.push([]);
    liste.forEach((an) => {
      const erg = anschlussRechnen(an);
      rows.push([`Anschluss ${an.bezeichnung}`, ANSCHLUSSARTEN[an.art].name,
        an.memberId ? memberLabel(model.members.get(an.memberId) || { id: an.memberId }) : "", an.guete]);
      if (an.art === "stirnplatte") {
        rows.push(["M_Ed [kNm]", an.M_Ed, "V_Ed [kN]", an.V_Ed, "Stirnplatte [mm]", an.tp,
          "Schraube", `${an.schraube} ${an.klasse}`]);
      } else if (an.art === "knotenblech_geschweisst") {
        rows.push(["N_Ed [kN]", an.N_Ed.toFixed(1), "Naht a [mm]", an.a, "Laenge [mm]", an.laenge,
          "Naehte", an.anzahlNaehte]);
      } else {
        rows.push(["N_Ed [kN]", an.N_Ed.toFixed(1), "Schraube", `${an.schraube} ${an.klasse}`,
          "Anzahl", an.anzahl, "Scherfugen", an.scherfugen,
          "t Blech/Stab [mm]", `${an.tBlech}/${an.tStab}`,
          "e1/e2/p1/p2 [mm]", `${an.e1}/${an.e2}/${an.p1}/${an.p2}`]);
      }
      rows.push(["Nachweis", "E_d", "R_d", "Einheit", "Ausnutzung", "Formel", "Hinweis"]);
      erg.nachweise.forEach((n) => {
        rows.push([n.name, n.Ed.toFixed(2), n.Rd.toFixed(2), n.einheit, n.ausnutzung.toFixed(3),
          n.formel, n.hinweis || ""]);
      });
      rows.push(["massgebend", erg.massgebend.name, "", "", erg.ausnutzung.toFixed(3),
        erg.status === "ok" ? "Nachweis erfuellt" : erg.status === "grenzwertig"
          ? "erfuellt, ueber 95 Prozent" : "NICHT ERFUELLT"]);
      erg.meldungen.forEach((m) => rows.push(["Meldung", m.art, m.text]));
      rows.push([]);
    });
    const name = (document.getElementById("projectName").value || "Projekt").replace(/\s+/g, "_");
    saveFile(`Anschluesse_${name}.csv`, "\ufeff" + zuCsv(rows), "text/csv;charset=utf-8;");
    setStatus(`${liste.length} Anschlüsse mit allen Einzelnachweisen als CSV ausgegeben.`, "ok");
  });

  /* ============================== Betonfertigteile */

  let ftBlattId = null;
  let ftErgebnis = null;

  /** Vorgaben aus den Eingabefeldern. */
  function ftVorgaben() {
    const w = (id, ersatz) => {
      const el = document.getElementById(id);
      const z = el ? parseFloat(el.value) : NaN;
      return Number.isFinite(z) ? z : ersatz;
    };
    return {
      nutzlast: w("ftNutzlast", 24), ladelaenge: w("ftLadelaenge", 13.6),
      stapelHoehe: w("ftStapelHoehe", 2.6), innenladerBreite: w("ftInnenlader", 2.45),
      psiDyn: w("ftPsiDyn", 1.3), psiHaft: w("ftPsiHaft", 1.2),
      ankerZahl: Math.max(1, Math.round(w("ftAnkerZahl", 4))), ankerWinkel: w("ftAnkerWinkel", 30),
      herstellung: w("ftHerstellung", 480), bewehrungPreis: w("ftBewehrungPreis", 1.35),
      transportFahrt: w("ftTransportFahrt", 420), kranStunde: w("ftKranStunde", 180),
      montageStunde: w("ftMontageStunde", 65), schichtStunden: w("ftSchicht", 8),
    };
  }

  function ftListe() {
    return Array.from(model.fertigteile.values());
  }

  /** Auswahllisten der Fertigteilarten füllen. */
  (function fuelleFtArten() {
    ["ftArt", "ftArtAnsicht"].forEach((id) => {
      const wahl = document.getElementById(id);
      if (!wahl) return;
      wahl.innerHTML = Object.keys(FERTIGTEILARTEN)
        .map((k) => `<option value="${k}">${FERTIGTEILARTEN[k].name}</option>`).join("");
      wahl.value = "stuetze";
    });
    const a = document.getElementById("ftArt"), b = document.getElementById("ftArtAnsicht");
    a.addEventListener("change", () => { b.value = a.value; });
    b.addEventListener("change", () => { a.value = b.value; });
    const sa = document.getElementById("ftStueck"), sb = document.getElementById("ftStueckAnsicht");
    sa.addEventListener("change", () => { sb.value = sa.value; });
    sb.addEventListener("change", () => { sa.value = sb.value; });
  }());

  function ftRechnen(still) {
    const teile = ftListe();
    if (!teile.length) {
      ftErgebnis = null;
      renderFertigteile();
      if (!still) setStatus("Keine Fertigteile in der Liste.", "error");
      return null;
    }
    const v = ftVorgaben();
    const fahrten = ftFahrten(teile, v);
    const montage = ftMontage(teile, v);
    const kosten = ftKosten(teile, fahrten, montage, v);
    const massen = teile.map((t) => ftGeometrie(t));
    ftErgebnis = {
      fahrten, montage, kosten, vorgaben: v,
      stueck: massen.reduce((sum, m) => sum + m.stueck, 0),
      volumen: massen.reduce((sum, m) => sum + m.volumenTransportGesamt, 0),
      volumenEnde: massen.reduce((sum, m) => sum + m.volumenEndeGesamt, 0),
      masse: massen.reduce((sum, m) => sum + m.masseTransportGesamt, 0),
      bewehrung: massen.reduce((sum, m) => sum + m.bewehrungGesamt, 0),
      ortbeton: massen.reduce((sum, m) => sum + m.ortbetonGesamt, 0),
      schwerstes: massen.reduce((sum, m) => Math.max(sum, m.masseTransport), 0),
    };
    renderFertigteile();
    if (!still) {
      setStatus(`${ftErgebnis.stueck} Fertigteile: ${tbText(ftErgebnis.volumen, 1)} m³, `
        + `${tbText(ftErgebnis.masse / 1000, 1)} t · ${fahrten.anzahl} Fahrten `
        + `(${tbText(fahrten.auslastung * 100, 0)} % Auslastung`
        + `${fahrten.sonderfahrten ? `, ${fahrten.sonderfahrten} Sonderfahrten` : ""}) · `
        + `${tbText(montage.stunden, 1)} h Kranzeit = ${tbText(montage.tage, 1)} Tage · `
        + `Kostenschätzung ${tbText(kosten.summe, 2)} €.`, "ok");
    }
    return ftErgebnis;
  }

  function renderFertigteile() {
    const teile = ftListe();
    document.getElementById("ftEmpty").hidden = teile.length > 0;
    const body = document.getElementById("ftBody");
    body.innerHTML = "";
    const meldungen = [];
    const v = ftVorgaben();

    teile.forEach((t) => {
      const art = FERTIGTEILARTEN[t.art];
      const m = ftGeometrie(t);
      const an = ftAnschlagen(m, v);
      const tr2 = ftTransportPruefung(m, v);
      const felder = Object.keys(art.felder).map((k) =>
        `<label class="ft-mass">${k}<input type="number" step="0.05" data-ft="${t.id}" `
        + `data-feld="${k}" value="${(t.felder && t.felder[k] !== undefined ? t.felder[k] : art.felder[k])}"></label>`).join("");
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input type="text" data-ft="${t.id}" data-feld="bezeichnung" value="${t.bezeichnung}"></td>
        <td><select data-ft="${t.id}" data-feld="art">
          ${Object.keys(FERTIGTEILARTEN).map((k) => `<option value="${k}"${k === t.art ? " selected" : ""}>${FERTIGTEILARTEN[k].name}</option>`).join("")}
        </select></td>
        <td class="ft-masse-zelle"><div>${felder}</div></td>
        <td><input type="number" step="1" min="1" data-ft="${t.id}" data-feld="stueck" value="${t.stueck}"></td>
        <td><input type="text" data-ft="${t.id}" data-feld="abschnitt" value="${t.abschnitt || ""}"></td>
        <td>${tbText(m.volumenTransport, 3)}${m.ortbeton > 1e-6 ? `<div class="layer-note">+ ${tbText(m.ortbeton, 3)} Ortbeton</div>` : ""}</td>
        <td><strong>${tbText(m.masseTransport / 1000, 2)}</strong>
          <div class="layer-note">${tbText(m.masseTransportGesamt / 1000, 1)} t gesamt</div></td>
        <td>${tbText(m.bewehrung, 1)}</td>
        <td>${tbText(an.jeAnker, 1)}</td>
        <td>${tr2.meldungen.length
          ? `<span class="cut-warning">${tr2.meldungen.length} Hinweis${tr2.meldungen.length === 1 ? "" : "e"}</span>`
          : `<span class="anschluss-marke">${tr2.stehend ? "stehend" : "liegend"}</span>`}</td>
        <td><button class="tool-btn" data-ft-blatt="${t.id}" title="Fertigteilblatt">📄</button></td>
        <td><button class="row-remove" data-ft-weg="${t.id}" title="Fertigteil löschen">✕</button></td>`;
      body.appendChild(tr);
      tr2.meldungen.forEach((x) => meldungen.push({ pos: t.bezeichnung, m: x }));
      m.hinweise.forEach((h) => meldungen.push({ pos: t.bezeichnung, m: { art: "hinweis", text: h } }));
    });

    document.getElementById("ftMeldungen").innerHTML = meldungen.length
      ? meldungen.slice(0, 12).map((x) => `<div class="${x.m.art === "warnung" ? "warnwert" : ""}">`
        + `${x.m.art === "warnung" ? "!" : "ℹ"} ${x.pos}: ${x.m.text}</div>`).join("")
      : (teile.length ? "Alle Teile halten die Grenzmaße ohne Erlaubnis ein." : "");

    const kennzahl = (label, wert, warnung) =>
      `<div class="stat"><span class="label">${label}</span>`
      + `<span class="value${warnung ? " warnwert" : ""}">${wert}</span></div>`;

    const fBody = document.getElementById("ftFahrtenBody");
    const mBody = document.getElementById("ftMontageBody");
    const kBody = document.getElementById("ftKostenBody");
    fBody.innerHTML = ""; mBody.innerHTML = ""; kBody.innerHTML = "";
    document.getElementById("ftFahrtenEmpty").hidden = !!ftErgebnis;

    if (!ftErgebnis) {
      document.getElementById("ftKennzahlen").innerHTML = teile.length
        ? kennzahl("Positionen", teile.length)
          + kennzahl("Stück", teile.reduce((s2, t) => s2 + (t.stueck || 1), 0))
          + kennzahl("Fahrten", "noch nicht gerechnet", true)
        : "";
      return;
    }

    const e = ftErgebnis;
    document.getElementById("ftKennzahlen").innerHTML =
      kennzahl("Positionen", teile.length)
      + kennzahl("Stück", e.stueck)
      + kennzahl("Fertigteilbeton", `${tbText(e.volumen, 1)} m³`)
      + (e.ortbeton > 0.01 ? kennzahl("Ortbeton", `${tbText(e.ortbeton, 1)} m³`) : "")
      + kennzahl("Gewicht", `${tbText(e.masse / 1000, 1)} t`)
      + kennzahl("schwerstes Teil", `${tbText(e.schwerstes / 1000, 2)} t`)
      + kennzahl("Bewehrung", `${tbText(e.bewehrung, 0)} kg`)
      + kennzahl("Fahrten", e.fahrten.anzahl, e.fahrten.sonderfahrten > 0)
      + kennzahl("Auslastung", `${tbText(e.fahrten.auslastung * 100, 0)} %`)
      + kennzahl("Kranzeit", `${tbText(e.montage.stunden, 1)} h`)
      + kennzahl("Montagedauer", `${tbText(e.montage.tage, 1)} Tage`)
      + kennzahl("Kosten", `${tbText(e.kosten.summe, 2)} €`);

    e.fahrten.fahrten.forEach((f) => {
      const nach = {};
      f.stuecke.forEach((s2) => { nach[s2.bezeichnung] = (nach[s2.bezeichnung] || 0) + 1; });
      const tr = document.createElement("tr");
      tr.className = f.sonder ? "durchdringung" : "";
      tr.innerHTML = `
        <td>${f.nummer}</td>
        <td>${f.stehend ? "stehend (Innenlader)" : "liegend (Stapel)"}</td>
        <td>${Object.entries(nach).map(([k, n]) => `${n} × ${k}`).join(", ")}</td>
        <td>${tbText(f.masse / 1000, 2)}</td>
        <td>${tbText(f.platz, 2)} / ${tbText(f.grenzePlatz, 2)}</td>
        <td>${tbText(f.laenge, 2)}</td>
        <td>${f.sonder ? '<span class="cut-warning">Großraum- oder Schwertransport</span>' : ""}</td>`;
      fBody.appendChild(tr);
    });

    e.montage.zeilen.forEach((z) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${z.reihenfolge}</td>
        <td>${z.teil.bezeichnung}</td>
        <td>${z.massen.name}</td>
        <td>${z.abschnitt}</td>
        <td>${z.massen.stueck}</td>
        <td>${tbText(z.hub, 2)}</td>
        <td>${tbText(z.stunden, 2)}</td>`;
      mBody.appendChild(tr);
    });

    e.kosten.zeilen.forEach((zl) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${zl.nr}</td><td>${zl.kurz}</td><td>${tbText(zl.menge, 2)}</td><td>${zl.einheit}</td>
        <td>${tbText(zl.ep, 2)}</td><td><strong>${tbText(zl.gp, 2)}</strong></td>
        <td class="layer-note">${zl.hinweis || ""}</td>`;
      kBody.appendChild(tr);
    });
    const summe = document.createElement("tr");
    summe.innerHTML = `<td></td><td><strong>Summe Fertigteile</strong></td><td></td><td></td><td></td>`
      + `<td><strong>${tbText(e.kosten.summe, 2)}</strong></td>`
      + `<td class="layer-note">${tbText(e.kosten.jeStueck, 2)} €/Stück · `
      + `${tbText(e.kosten.jeKubik, 2)} €/m³ · ohne Umsatzsteuer</td>`;
    kBody.appendChild(summe);
  }

  /* ---- Bedienung Fertigteile */

  document.getElementById("viewFertigteile").addEventListener("change", (e) => {
    const ziel = e.target;
    if (!ziel.dataset.ft) return;
    const t = model.fertigteile.get(parseInt(ziel.dataset.ft, 10));
    if (!t) return;
    const feld = ziel.dataset.feld;
    if (feld === "bezeichnung" || feld === "abschnitt") t[feld] = ziel.value;
    else if (feld === "art") {
      t.art = ziel.value;
      // Beim Wechsel der Art gelten die Maße der neuen Art
      t.felder = Object.assign({}, FERTIGTEILARTEN[ziel.value].felder);
    } else if (feld === "stueck") t.stueck = Math.max(1, parseInt(ziel.value, 10) || 1);
    else {
      t.felder = Object.assign({}, FERTIGTEILARTEN[t.art].felder, t.felder, { [feld]: parseFloat(ziel.value) || 0 });
    }
    if (ftErgebnis) ftRechnen(true); else renderFertigteile();
  });

  document.getElementById("viewFertigteile").addEventListener("click", (e) => {
    const weg = e.target.closest("[data-ft-weg]");
    if (weg) {
      model.fertigteile.delete(parseInt(weg.dataset.ftWeg, 10));
      if (ftErgebnis) ftRechnen(true); else renderFertigteile();
      return;
    }
    const blatt = e.target.closest("[data-ft-blatt]");
    if (blatt) zeigeFertigteilblatt(parseInt(blatt.dataset.ftBlatt, 10));
  });

  function neuesFertigteil(art, stueck, abschnitt) {
    const vorlage = FERTIGTEILARTEN[art];
    const id = model.nextFertigteilId++;
    const teil = {
      id, art, bezeichnung: `${vorlage.kuerzel}${id}`,
      felder: Object.assign({}, vorlage.felder),
      stueck: Math.max(1, stueck || 1), abschnitt: abschnitt || "",
    };
    model.fertigteile.set(id, teil);
    return teil;
  }

  document.getElementById("btnFtNeu").addEventListener("click", () => {
    const art = document.getElementById("ftArtAnsicht").value;
    const stueck = parseInt(document.getElementById("ftStueckAnsicht").value, 10) || 1;
    const abschnitt = document.getElementById("ftAbschnitt").value;
    const teil = neuesFertigteil(art, stueck, abschnitt);
    const m = ftGeometrie(teil);
    if (ftErgebnis) ftRechnen(true); else renderFertigteile();
    setStatus(`${FERTIGTEILARTEN[art].name} ${teil.bezeichnung} angelegt: ${teil.stueck} Stück à `
      + `${tbText(m.volumenTransport, 3)} m³ und ${tbText(m.masseTransport / 1000, 2)} t. `
      + "Maße in der Zeile anpassen.", "ok");
  });

  document.getElementById("btnFtBeispiel").addEventListener("click", () => {
    // Hallenbau in Fertigteilen: Köcher, Stützen, Binder, Dachplatten, Wände
    model.fertigteile.clear();
    model.nextFertigteilId = 1;
    [
      ["koecher", 12, "BA 1", { laenge: 1.8, breite: 1.8, hoehe: 1.0, koecherLaenge: 0.6, koecherBreite: 0.6, koecherTiefe: 0.8 }],
      ["stuetze", 12, "BA 1", { laenge: 8.0, breite: 0.4, hoehe: 0.4 }],
      ["satteldachbinder", 6, "BA 1", { laenge: 24.0, breite: 0.3, hoehe: 1.0, neigung: 6 }],
      ["ttplatte", 20, "BA 2", { laenge: 15.0, breite: 2.4, hoehe: 0.6, platte: 0.06, rippeOben: 0.24, rippeUnten: 0.14 }],
      ["sandwichwand", 24, "BA 2", { laenge: 6.0, hoehe: 3.6, tragschale: 0.18, daemmung: 0.12, vorsatzschale: 0.07 }],
      ["treppenlauf", 4, "BA 3", { geschosshoehe: 2.8, steigungen: 16, auftritt: 0.28, laufbreite: 1.2, dicke: 0.18 }],
    ].forEach(([art, stueck, ba, felder]) => {
      const t = neuesFertigteil(art, stueck, ba);
      t.felder = Object.assign({}, FERTIGTEILARTEN[art].felder, felder);
    });
    ftRechnen();
    setStatus("Beispielhalle in Fertigteilen eingesetzt: Köcherfundamente, Stützen, Satteldachbinder "
      + "24 m, TT-Platten, Sandwichwände und Treppenläufe. Zum Prüfen und Überschreiben gedacht.", "ok");
  });

  document.getElementById("btnFtRechnen").addEventListener("click", () => ftRechnen());
  ["ftNutzlast", "ftLadelaenge", "ftStapelHoehe", "ftInnenlader", "ftPsiDyn", "ftPsiHaft",
    "ftAnkerZahl", "ftAnkerWinkel", "ftHerstellung", "ftBewehrungPreis", "ftTransportFahrt",
    "ftKranStunde", "ftMontageStunde", "ftSchicht"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => { if (ftErgebnis) ftRechnen(true); });
  });

  function zeigeFertigteilblatt(id) {
    const teil = model.fertigteile.get(id);
    if (!teil) { setStatus("Zuerst ein Fertigteil anlegen.", "error"); return; }
    ftBlattId = id;
    const v = ftVorgaben();
    const massen = ftGeometrie(teil);
    sheetArt = "fertigteil";
    document.getElementById("sheetBody").innerHTML = fertigteilblattSVG({
      teil, massen, anschlagen: ftAnschlagen(massen, v),
      transport: ftTransportPruefung(massen, v), projekt: projektKopf(),
    });
    document.getElementById("sheetTitle").textContent = `Fertigteil ${teil.bezeichnung}`;
    const liste = ftListe();
    document.getElementById("sheetCounter").textContent =
      `${liste.indexOf(teil) + 1} von ${liste.length} · ${massen.name} · `
      + `${tbText(massen.masseTransport / 1000, 2)} t je Stück`;
    document.getElementById("sheetOverlay").hidden = false;
  }

  document.getElementById("btnFtBlatt").addEventListener("click", () => {
    const liste = ftListe();
    if (!liste.length) { setStatus("Zuerst ein Fertigteil anlegen.", "error"); return; }
    zeigeFertigteilblatt(ftBlattId && model.fertigteile.has(ftBlattId) ? ftBlattId : liste[0].id);
  });

  document.getElementById("btnFtCsv").addEventListener("click", () => {
    const e = ftErgebnis || ftRechnen();
    if (!e) return;
    const teile = ftListe();
    const v = e.vorgaben;
    const rows = [["Fertigteile – " + (document.getElementById("projectName").value || "Projekt")]];
    rows.push(["Wichte Stahlbeton [kN/m3]", 25, "nach DIN EN 1991-1-1 Tab. A.1"]);
    rows.push([]);
    rows.push(["Elementliste"]);
    rows.push(["Pos", "Art", "Bauabschnitt", "Stueck", "Masse [m]", "V je Stueck [m3]",
      "V gesamt [m3]", "Ortbeton [m3]", "Gewicht je Stueck [t]", "Gewicht gesamt [t]",
      "Bewehrung [kg]", "Last je Anker [kN]", "Ladeweise", "Hinweise"]);
    teile.forEach((t) => {
      const m = ftGeometrie(t);
      const an = ftAnschlagen(m, v);
      const tr = ftTransportPruefung(m, v);
      const masse = Object.entries(Object.assign({}, FERTIGTEILARTEN[t.art].felder, t.felder))
        .map(([k, w]) => `${k} ${w}`).join(" / ");
      rows.push([t.bezeichnung, m.name, t.abschnitt || "", m.stueck, masse,
        m.volumenTransport.toFixed(3), m.volumenTransportGesamt.toFixed(2), m.ortbetonGesamt.toFixed(2),
        (m.masseTransport / 1000).toFixed(3), (m.masseTransportGesamt / 1000).toFixed(2),
        m.bewehrungGesamt.toFixed(1), an.jeAnker.toFixed(1),
        tr.stehend ? "stehend" : "liegend",
        tr.meldungen.map((x) => x.text).join(" | ")]);
    });
    rows.push(["Summe", "", "", e.stueck, "", "", e.volumen.toFixed(2), e.ortbeton.toFixed(2),
      "", (e.masse / 1000).toFixed(2), e.bewehrung.toFixed(1)]);
    rows.push([]);
    rows.push(["Transport", `Nutzlast ${v.nutzlast} t`, `Ladelaenge ${v.ladelaenge} m`,
      `Stapelhoehe ${v.stapelHoehe} m`, `Innenlader ${v.innenladerBreite} m`]);
    rows.push(["Fahrt", "Ladeweise", "Stuecke", "Gewicht [t]", "Stapel [m]", "laengstes Stueck [m]", "Art"]);
    e.fahrten.fahrten.forEach((f) => {
      const nach = {};
      f.stuecke.forEach((s2) => { nach[s2.bezeichnung] = (nach[s2.bezeichnung] || 0) + 1; });
      rows.push([f.nummer, f.stehend ? "stehend" : "liegend",
        Object.entries(nach).map(([k, n]) => `${n} x ${k}`).join(", "),
        (f.masse / 1000).toFixed(2), f.platz.toFixed(2), f.laenge.toFixed(2),
        f.sonder ? "Grossraum- oder Schwertransport" : "Regelfahrt"]);
    });
    rows.push([]);
    rows.push(["Montagereihenfolge"]);
    rows.push(["Nr", "Pos", "Art", "Bauabschnitt", "Stueck", "Hub [t]", "Kranzeit [h]"]);
    e.montage.zeilen.forEach((z) => {
      rows.push([z.reihenfolge, z.teil.bezeichnung, z.massen.name, z.abschnitt,
        z.massen.stueck, z.hub.toFixed(2), z.stunden.toFixed(2)]);
    });
    rows.push(["Summe", "", "", "", "", `schwerster Hub ${e.montage.schwersterHub.toFixed(2)} t`,
      e.montage.stunden.toFixed(2)]);
    rows.push([]);
    rows.push(["Kostenschaetzung"]);
    rows.push(["Pos", "Kurztext", "Menge", "Einheit", "EP [EUR]", "GP [EUR]", "Hinweis"]);
    e.kosten.zeilen.forEach((zl) => {
      rows.push([zl.nr, zl.kurz, zl.menge.toFixed(2), zl.einheit, zl.ep.toFixed(2), zl.gp.toFixed(2), zl.hinweis || ""]);
    });
    rows.push(["", "Summe (ohne Umsatzsteuer)", "", "", "", e.kosten.summe.toFixed(2)]);
    const name = (document.getElementById("projectName").value || "Projekt").replace(/\s+/g, "_");
    saveFile(`Fertigteile_${name}.csv`, "\ufeff" + zuCsv(rows), "text/csv;charset=utf-8;");
    setStatus(`Elementliste, Fahrten, Montagereihenfolge und Kosten als CSV ausgegeben.`, "ok");
  });

  /* ============================== Baustellenlogistik */

  let kranErgebnis = null;
  let beErgebnis = null;
  let bauErgebnis = null;

  /** Vorgaben aus den Eingabefeldern des Registers. */
  function beVorgaben() {
    const w = (id, ersatz) => {
      const el = document.getElementById(id);
      const z = el ? parseFloat(el.value) : NaN;
      return Number.isFinite(z) ? z : ersatz;
    };
    return Object.assign({}, BE_VORGABEN, {
      anschlagmittel: w("kranAnschlagmittel", 200),
      kranZuschlag: w("kranZuschlag", 1.05),
      personenJeToilette: Math.max(1, w("bePersonenToilette", 10)),
      personenJeWaschplatz: Math.max(1, w("bePersonenWaschplatz", 5)),
    });
  }

  /**
   * Traglastkurve aus der Eingabezeile lesen.
   *
   * Geschrieben wird sie so, wie sie in der Traglasttabelle steht:
   * Ausladung:Traglast, durch Leerzeichen oder Komma getrennt.
   */
  function kranKurveLesen(text) {
    return String(text || "").split(/[\s,;]+/).map((teil) => {
      const stueck = teil.split(":");
      if (stueck.length !== 2) return null;
      const a = parseFloat(stueck[0].replace(",", "."));
      const l = parseFloat(stueck[1].replace(",", "."));
      return Number.isFinite(a) && Number.isFinite(l) ? { ausladung: a, last: l } : null;
    }).filter(Boolean).sort((a, b) => a.ausladung - b.ausladung);
  }

  function kranKurveText(kurve) {
    return kurve.map((k) => `${k.ausladung}:${k.last}`).join(" ");
  }

  /** Der Kran, so wie er gerade eingestellt ist. */
  function kranDaten() {
    const w = (id, ersatz) => {
      const z = parseFloat(document.getElementById(id).value);
      return Number.isFinite(z) ? z : ersatz;
    };
    return {
      name: "Kran 1",
      x: w("kranX", 0), y: w("kranY", 0),
      hakenhoehe: w("kranHakenhoehe", 0),
      kurve: kranKurveLesen(document.getElementById("kranKurve").value),
    };
  }

  function kranRechnen(still) {
    if (!logistikHuebe.length) {
      kranErgebnis = null;
      renderLogistik();
      if (!still) setStatus("Keine Hübe eingetragen – aus den Fertigteilen übernehmen oder von Hand anlegen.", "error");
      return null;
    }
    const kran = kranDaten();
    if (!kran.kurve.length) {
      kranErgebnis = null;
      renderLogistik();
      if (!still) setStatus("Die Traglastkurve ist leer. Wertepaare als Ausladung:Traglast eintragen, z. B. 20:8 30:5.2.", "error");
      return null;
    }
    kranErgebnis = kranPruefung(kran, logistikHuebe, beVorgaben());
    renderLogistik();
    if (!still) {
      const e = kranErgebnis;
      setStatus(`${e.zeilen.length} Hübe geprüft: größte Ausladung ${tbText(e.groessteAusladung, 2)} m, `
        + `schwerster Hub ${tbText(e.schwersterHub, 2)} t, größte Ausnutzung `
        + `${Number.isFinite(e.groessteAusnutzung) ? tbText(e.groessteAusnutzung * 100, 0) : "∞"} %. `
        + (e.erfuellt ? "Alle Hübe sind mit diesem Kran möglich."
          : `${e.nichtErfuellt} Hübe sind so nicht möglich.`),
      e.erfuellt ? "ok" : "error");
    }
    return kranErgebnis;
  }

  function beRechnen(still) {
    const w = (id, ersatz) => {
      const z = parseFloat(document.getElementById(id).value);
      return Number.isFinite(z) ? z : ersatz;
    };
    beErgebnis = beFlaechen({
      beschaeftigte: Math.max(0, Math.round(w("beBeschaeftigte", 0))),
      bauleitung: Math.max(0, Math.round(w("beBauleitung", 0))),
      lagerGrundflaeche: Math.max(0, w("beLagerflaeche", 0)),
    }, beVorgaben());
    renderLogistik();
    if (!still) {
      const e = beErgebnis;
      setStatus(`Flächenbedarf: ${tbText(e.gesamt, 1)} m² insgesamt für ${e.beschaeftigte} Beschäftigte `
        + `und ${e.bauleitung} Arbeitsplätze der Bauleitung – ${e.container} Container, `
        + `${e.toiletten} Toiletten, ${e.waschplaetze} Waschplätze. `
        + `Angelegte Flächen: ${tbText(logistikFlaechen.reduce((s, f) => s + f.breite * f.tiefe, 0), 1)} m².`, "ok");
    }
    return beErgebnis;
  }

  /** Vorgängerangabe „C+2, A“ in Beziehungen zerlegen. */
  function vorgaengerLesen(text) {
    return String(text || "").split(/[,;]+/).map((teil) => {
      const t = teil.trim();
      if (!t) return null;
      const treffer = t.match(/^([^+\-\s]+)\s*([+-]\s*\d+(?:[.,]\d+)?)?$/);
      if (!treffer) return null;
      return {
        id: treffer[1].toUpperCase(),
        abstand: treffer[2] ? parseFloat(treffer[2].replace(/\s+/g, "").replace(",", ".")) : 0,
      };
    }).filter(Boolean);
  }

  function vorgaengerText(liste) {
    return (liste || []).map((p) => `${p.id}${p.abstand ? (p.abstand > 0 ? "+" : "") + p.abstand : ""}`).join(", ");
  }

  function bauStartDatum() {
    const wert = document.getElementById("bauStart").value;
    const d = wert ? new Date(`${wert}T00:00:00`) : new Date();
    return Number.isFinite(d.getTime()) ? d : new Date();
  }

  function bauzeitRechnen(still) {
    if (!bauVorgaenge.length) {
      bauErgebnis = null;
      renderLogistik();
      if (!still) setStatus("Keine Vorgänge eingetragen.", "error");
      return null;
    }
    bauErgebnis = bauzeitenplan(bauVorgaenge);
    renderLogistik();
    if (!still) {
      const e = bauErgebnis;
      if (e.kreis) {
        setStatus("Die Anordnungsbeziehungen enthalten einen Kreis – ein Vorgang hängt mittelbar "
          + "von sich selbst ab. Die Rechnung ist damit nicht belastbar.", "error");
      } else {
        const start = bauStartDatum();
        setStatus(`Bauzeit: ${e.dauer} Arbeitstage, ${bauDatum(bauTag(start, 0))} bis `
          + `${bauDatum(bauTag(start, e.dauer))}. Kritischer Weg: ${e.kritischerWeg.join(" → ")}.`, "ok");
      }
    }
    return bauErgebnis;
  }

  function renderLogistik() {
    const kennzahl = (label, wert, warnung) =>
      `<div class="stat"><span class="label">${label}</span>`
      + `<span class="value${warnung ? " warnwert" : ""}">${wert}</span></div>`;

    /* ---- Kran */
    document.getElementById("kranEmpty").hidden = logistikHuebe.length > 0;
    const kBody = document.getElementById("kranBody");
    kBody.innerHTML = "";
    const zeilen = kranErgebnis ? kranErgebnis.zeilen : null;
    logistikHuebe.forEach((h, i) => {
      const z = zeilen ? zeilen[i] : null;
      const tr = document.createElement("tr");
      if (z && !z.erfuellt) tr.className = "durchdringung";
      tr.innerHTML = `
        <td><input type="text" data-hub="${i}" data-feld="bezeichnung" value="${h.bezeichnung}"></td>
        <td><input type="number" step="0.5" data-hub="${i}" data-feld="x" value="${h.x}"></td>
        <td><input type="number" step="0.5" data-hub="${i}" data-feld="y" value="${h.y}"></td>
        <td><input type="number" step="10" data-hub="${i}" data-feld="masse" value="${Math.round(h.masse)}"></td>
        <td><input type="number" step="0.5" data-hub="${i}" data-feld="hoehe" value="${h.hoehe}"></td>
        <td>${z ? tbText(z.ausladung, 2) : ""}</td>
        <td>${z ? (z.ausserhalb ? '<span class="cut-warning">außerhalb</span>' : tbText(z.traglast, 2)) : ""}</td>
        <td>${z ? tbText(z.erforderlich, 2) : ""}</td>
        <td>${z ? (Number.isFinite(z.ausnutzung)
          ? `<strong class="${z.ausnutzung > 1 ? "warnwert" : ""}">${tbText(z.ausnutzung * 100, 0)} %</strong>`
          : '<span class="cut-warning">–</span>') : ""}</td>
        <td>${z ? `<span class="${z.zuHoch ? "warnwert" : ""}">${tbText(z.hakenhoehe, 2)}</span>` : ""}</td>
        <td><button class="row-remove" data-hub-weg="${i}" title="Hub löschen">✕</button></td>`;
      kBody.appendChild(tr);
    });

    document.getElementById("kranKennzahlen").innerHTML = kranErgebnis
      ? kennzahl("Hübe", kranErgebnis.zeilen.length)
        + kennzahl("Standort", `${tbText(kranErgebnis.kran.x, 2)} / ${tbText(kranErgebnis.kran.y, 2)} m`)
        + kennzahl("größte Ausladung", `${tbText(kranErgebnis.groessteAusladung, 2)} m`,
          kranErgebnis.groessteAusladung > kranErgebnis.maxAusladung)
        + kennzahl("schwerster Hub", `${tbText(kranErgebnis.schwersterHub, 2)} t`)
        + kennzahl("größte Ausnutzung", Number.isFinite(kranErgebnis.groessteAusnutzung)
          ? `${tbText(kranErgebnis.groessteAusnutzung * 100, 0)} %` : "über der Kurve",
        kranErgebnis.groessteAusnutzung > 1)
        + kennzahl("nicht möglich", kranErgebnis.nichtErfuellt, kranErgebnis.nichtErfuellt > 0)
      : (logistikHuebe.length
        ? kennzahl("Hübe", logistikHuebe.length) + kennzahl("Prüfung", "noch nicht gerechnet", true)
        : "");

    document.getElementById("kranMeldungen").innerHTML = kranErgebnis
      ? (kranErgebnis.meldungen.length
        ? kranErgebnis.meldungen.slice(0, 12).map((m) =>
          `<div class="${m.art === "fehler" ? "warnwert" : ""}">${m.art === "fehler" ? "!" : "ℹ"} ${m.text}</div>`).join("")
          + (kranErgebnis.meldungen.length > 12 ? `<div>… und ${kranErgebnis.meldungen.length - 12} weitere.</div>` : "")
        : "Alle Hübe liegen innerhalb der Traglastkurve. Maßgebend bleiben Traglasttabelle "
          + "und Betriebsanleitung des Herstellers.")
      : "";

    /* ---- Baustelleneinrichtung */
    document.getElementById("beEmpty").hidden = logistikFlaechen.length > 0;
    const fBody = document.getElementById("beBody");
    fBody.innerHTML = "";
    logistikFlaechen.forEach((f, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input type="text" data-bef="${i}" data-feld="name" value="${f.name}"></td>
        <td><select data-bef="${i}" data-feld="art">
          ${Object.keys(BE_ARTEN).map((k) => `<option value="${k}"${k === f.art ? " selected" : ""}>${BE_ARTEN[k].name}</option>`).join("")}
        </select></td>
        <td><input type="number" step="0.5" data-bef="${i}" data-feld="x" value="${f.x}"></td>
        <td><input type="number" step="0.5" data-bef="${i}" data-feld="y" value="${f.y}"></td>
        <td><input type="number" step="0.5" min="0.1" data-bef="${i}" data-feld="breite" value="${f.breite}"></td>
        <td><input type="number" step="0.5" min="0.1" data-bef="${i}" data-feld="tiefe" value="${f.tiefe}"></td>
        <td><strong>${tbText(f.breite * f.tiefe, 1)}</strong></td>
        <td><button class="row-remove" data-be-weg="${i}" title="Fläche löschen">✕</button></td>`;
      fBody.appendChild(tr);
    });

    const angelegt = logistikFlaechen.reduce((s, f) => s + f.breite * f.tiefe, 0);
    document.getElementById("beKennzahlen").innerHTML = beErgebnis
      ? kennzahl("Beschäftigte", beErgebnis.beschaeftigte)
        + kennzahl("Pausenraum", `${tbText(beErgebnis.zeilen[0].flaeche, 1)} m²`)
        + kennzahl("Umkleide", `${tbText(beErgebnis.zeilen[1].flaeche, 1)} m²`)
        + kennzahl("Büro", `${tbText(beErgebnis.zeilen[2].flaeche, 1)} m²`)
        + kennzahl("Lagerfläche", `${tbText(beErgebnis.zeilen[3].flaeche, 1)} m²`)
        + kennzahl("Bedarf gesamt", `${tbText(beErgebnis.gesamt, 1)} m²`)
        + kennzahl("Container", beErgebnis.container)
        + kennzahl("Toiletten", beErgebnis.toiletten)
        + kennzahl("Waschplätze", beErgebnis.waschplaetze)
        + kennzahl("angelegte Flächen", `${tbText(angelegt, 1)} m²`, angelegt < beErgebnis.gesamt)
      : (logistikFlaechen.length
        ? kennzahl("Flächen", logistikFlaechen.length) + kennzahl("angelegt", `${tbText(angelegt, 1)} m²`)
          + kennzahl("Bedarf", "noch nicht gerechnet", true)
        : "");

    /* ---- Bauzeitenplan */
    document.getElementById("bauEmpty").hidden = bauVorgaenge.length > 0;
    const bBody = document.getElementById("bauBody");
    bBody.innerHTML = "";
    const start = bauStartDatum();
    const gerechnet = new Map();
    if (bauErgebnis) bauErgebnis.vorgaenge.forEach((v) => gerechnet.set(v.id, v));
    bauVorgaenge.forEach((v, i) => {
      const g = gerechnet.get(v.id);
      const tr = document.createElement("tr");
      if (g && g.kritisch) tr.className = "durchdringung";
      tr.innerHTML = `
        <td><input type="text" data-bv="${i}" data-feld="id" value="${v.id}" size="3"></td>
        <td><input type="text" data-bv="${i}" data-feld="name" value="${v.name}"></td>
        <td><input type="number" step="1" min="0" data-bv="${i}" data-feld="dauer" value="${v.dauer}"></td>
        <td><input type="text" data-bv="${i}" data-feld="vorgaenger" value="${vorgaengerText(v.vorgaenger)}"
             title="Kennbuchstaben der Vorgänger, Abstand in Tagen nach einem Pluszeichen (C+2)"></td>
        <td>${g ? g.faz : ""}</td>
        <td>${g ? g.fez : ""}</td>
        <td>${g ? g.saz : ""}</td>
        <td>${g ? g.sez : ""}</td>
        <td>${g ? `<strong>${g.gp}</strong>` : ""}</td>
        <td>${g ? (Number.isFinite(g.fp) ? g.fp : "–") : ""}</td>
        <td>${g ? bauDatum(bauTag(start, g.faz)) : ""}</td>
        <td>${g ? bauDatum(bauTag(start, g.fez)) : ""}</td>
        <td>${g ? (g.kritisch ? '<span class="cut-warning">kritisch</span>' : "") : ""}</td>
        <td><button class="row-remove" data-bv-weg="${i}" title="Vorgang löschen">✕</button></td>`;
      bBody.appendChild(tr);
    });

    document.getElementById("bauKennzahlen").innerHTML = bauErgebnis
      ? kennzahl("Vorgänge", bauErgebnis.vorgaenge.length)
        + kennzahl("Bauzeit", `${bauErgebnis.dauer} Arbeitstage`)
        + kennzahl("Beginn", bauDatum(bauTag(start, 0)))
        + kennzahl("Ende", bauDatum(bauTag(start, bauErgebnis.dauer)))
        + kennzahl("kritischer Weg", bauErgebnis.kritischerWeg.join(" → ") || "–")
        + kennzahl("Vorgänge mit Puffer",
          bauErgebnis.vorgaenge.filter((v) => v.gp > 0).length)
      : (bauVorgaenge.length
        ? kennzahl("Vorgänge", bauVorgaenge.length) + kennzahl("Bauzeit", "noch nicht gerechnet", true)
        : "");

    const fehlende = [];
    const bekannt = new Set(bauVorgaenge.map((v) => v.id));
    bauVorgaenge.forEach((v) => (v.vorgaenger || []).forEach((p) => {
      if (!bekannt.has(p.id) && fehlende.indexOf(p.id) < 0) fehlende.push(p.id);
    }));
    const bauMeldungen = [];
    if (bauErgebnis) bauErgebnis.meldungen.forEach((m) => bauMeldungen.push(m));
    if (fehlende.length) {
      bauMeldungen.push({ art: "warnung", text: `Unbekannte Vorgänger: ${fehlende.join(", ")} – `
        + "diese Beziehungen bleiben in der Rechnung unbeachtet." });
    }
    document.getElementById("bauMeldungen").innerHTML = bauMeldungen.length
      ? bauMeldungen.map((m) => `<div class="${m.art === "fehler" ? "warnwert" : ""}">`
        + `${m.art === "fehler" ? "!" : "ℹ"} ${m.text}</div>`).join("")
      : (bauErgebnis ? "Vorwärts- und Rückwärtsrechnung nach DIN 69900 durchgerechnet; "
        + "Wochenenden sind übersprungen, Feiertage und Betriebsferien nicht berücksichtigt." : "");
  }

  /* ---- Bedienung Baustellenlogistik */

  document.getElementById("viewLogistik").addEventListener("change", (e) => {
    const ziel = e.target;
    const feld = ziel.dataset.feld;
    if (ziel.dataset.hub !== undefined) {
      const h = logistikHuebe[parseInt(ziel.dataset.hub, 10)];
      if (!h) return;
      if (feld === "bezeichnung") h.bezeichnung = ziel.value;
      else h[feld] = parseFloat(ziel.value) || 0;
      if (kranErgebnis) kranRechnen(true); else renderLogistik();
      return;
    }
    if (ziel.dataset.bef !== undefined) {
      const f = logistikFlaechen[parseInt(ziel.dataset.bef, 10)];
      if (!f) return;
      if (feld === "name" || feld === "art") f[feld] = ziel.value;
      else f[feld] = parseFloat(ziel.value) || 0;
      renderLogistik();
      return;
    }
    if (ziel.dataset.bv !== undefined) {
      const v = bauVorgaenge[parseInt(ziel.dataset.bv, 10)];
      if (!v) return;
      if (feld === "id") v.id = (ziel.value || v.id).trim().toUpperCase();
      else if (feld === "name") v.name = ziel.value;
      else if (feld === "dauer") v.dauer = Math.max(0, parseInt(ziel.value, 10) || 0);
      else if (feld === "vorgaenger") v.vorgaenger = vorgaengerLesen(ziel.value);
      if (bauErgebnis) bauzeitRechnen(true); else renderLogistik();
    }
  });

  document.getElementById("viewLogistik").addEventListener("click", (e) => {
    const hubWeg = e.target.closest("[data-hub-weg]");
    if (hubWeg) {
      logistikHuebe.splice(parseInt(hubWeg.dataset.hubWeg, 10), 1);
      if (kranErgebnis) kranRechnen(true); else renderLogistik();
      return;
    }
    const beWeg = e.target.closest("[data-be-weg]");
    if (beWeg) {
      logistikFlaechen.splice(parseInt(beWeg.dataset.beWeg, 10), 1);
      renderLogistik();
      return;
    }
    const bvWeg = e.target.closest("[data-bv-weg]");
    if (bvWeg) {
      bauVorgaenge.splice(parseInt(bvWeg.dataset.bvWeg, 10), 1);
      if (bauErgebnis) bauzeitRechnen(true); else renderLogistik();
    }
  });

  document.getElementById("btnKranPruefen").addEventListener("click", () => kranRechnen());

  document.getElementById("btnKranStandort").addEventListener("click", () => {
    if (!logistikHuebe.length) { setStatus("Zuerst Hübe eintragen.", "error"); return; }
    const s = kranStandort(logistikHuebe);
    document.getElementById("kranX").value = s.x.toFixed(2);
    document.getElementById("kranY").value = s.y.toFixed(2);
    kranRechnen(true);
    setStatus(`Günstigster Standort ${tbText(s.x, 2)} / ${tbText(s.y, 2)} m: Damit ist die größte `
      + `nötige Ausladung ${tbText(s.ausladung, 2)} m – kleiner geht es an keiner anderen Stelle. `
      + `Maßgebend sind ${s.massgebend.map((h) => h.bezeichnung).join(", ")}. `
      + "Ob der Standort baubar ist – Gründung, Zufahrt, Leitungen, Nachbargrundstück – "
      + "entscheidet die Baustelleneinrichtung, nicht die Rechnung.", "ok");
  });

  /**
   * Hübe aus der Fertigteilliste übernehmen.
   *
   * Jede Position wird ein Hub mit ihrer Transportmasse; die Lage wird
   * reihenweise über der Baustelle verteilt, weil die Fertigteilliste
   * keine Einbaukoordinaten führt. Die Lage ist danach in der Tabelle
   * zu berichtigen – die Massen stimmen, die Punkte sind ein Vorschlag.
   */
  document.getElementById("btnHuebeAusFertigteilen").addEventListener("click", () => {
    const teile = ftListe();
    if (!teile.length) { setStatus("Die Fertigteilliste ist leer.", "error"); return; }
    logistikHuebe = [];
    let i = 0;
    teile.forEach((t) => {
      const m = ftGeometrie(t);
      logistikHuebe.push({
        bezeichnung: t.bezeichnung,
        x: 6 + (i % 6) * 8, y: 4 + Math.floor(i / 6) * 8,
        masse: Math.round(m.masseTransport),
        // Erste Annahme fuer die Einbauhoehe: die Oberkante eines am
        // Boden stehenden Teils liegt in seiner eigenen Hoehe
        hoehe: Math.round((m.hoehe || 0) * 10) / 10,
      });
      i += 1;
    });
    kranRechnen(true);
    setStatus(`${logistikHuebe.length} Hübe aus der Fertigteilliste übernommen; schwerstes Teil `
      + `${tbText(Math.max(...logistikHuebe.map((h) => h.masse)) / 1000, 2)} t. `
      + "Die Lage ist ein Vorschlag im Raster und in der Tabelle zu berichtigen – "
      + "die Fertigteilliste führt keine Einbaukoordinaten.", "ok");
  });

  document.getElementById("btnBeFlaeche").addEventListener("click", () => {
    const art = document.getElementById("beFlaecheArt").value;
    const nr = logistikFlaechen.filter((f) => f.art === art).length + 1;
    logistikFlaechen.push({
      art, name: `${BE_ARTEN[art] ? BE_ARTEN[art].name : "Fläche"} ${nr}`,
      x: 0, y: 0, breite: 10, tiefe: 6,
    });
    renderLogistik();
    setStatus(`${BE_ARTEN[art] ? BE_ARTEN[art].name : "Fläche"} angelegt: 10,00 × 6,00 m bei 0 / 0. `
      + "Lage und Maße in der Zeile eintragen.", "ok");
  });

  document.getElementById("btnBeBeispiel").addEventListener("click", () => {
    // Beispiel: Hallenbaustelle 40 × 24 m mit Kran, Lager, Containern und Zufahrt
    logistikFlaechen = [
      { art: "bauwerk", name: "Halle", x: 10, y: 6, breite: 40, tiefe: 24 },
      { art: "lager", name: "Lager Fertigteile", x: 10, y: 32, breite: 24, tiefe: 8 },
      { art: "lager", name: "Lager Bewehrung", x: 36, y: 32, breite: 14, tiefe: 8 },
      { art: "container", name: "Container Sozialräume", x: 54, y: 22, breite: 12, tiefe: 6 },
      { art: "container", name: "Container Bauleitung", x: 54, y: 30, breite: 6, tiefe: 3 },
      { art: "zufahrt", name: "Zufahrt und Wendeplatz", x: 54, y: 4, breite: 12, tiefe: 16 },
      { art: "mischanlage", name: "Bewehrungs- und Mischplatz", x: 10, y: 42, breite: 16, tiefe: 6 },
      { art: "entsorgung", name: "Entsorgung", x: 30, y: 42, breite: 8, tiefe: 6 },
    ];
    beRechnen(true);
    renderLogistik();
    setStatus("Beispiel-Baustelleneinrichtung eingesetzt: Halle 40 × 24 m, Lagerflächen, Container, "
      + "Zufahrt mit Wendeplatz, Bewehrungs- und Mischplatz sowie Entsorgung. "
      + "Zum Prüfen und Überschreiben gedacht.", "ok");
  });

  document.getElementById("btnBePlan").addEventListener("click", () => {
    if (!logistikFlaechen.length) { setStatus("Zuerst Einrichtungsflächen anlegen.", "error"); return; }
    const e = beErgebnis || beRechnen(true);
    const kran = kranDaten();
    const kurve = kran.kurve;
    const krane = kurve.length
      ? [{ name: kran.name, x: kran.x, y: kran.y, hakenhoehe: kran.hakenhoehe,
        ausladung: kurve[kurve.length - 1].ausladung }]
      : [];
    sheetArt = "beplan";
    document.getElementById("sheetBody").innerHTML = bePlanSVG({
      flaechen: logistikFlaechen, krane, projekt: projektKopf(),
      kranPruefung: kranErgebnis, flaechenbedarf: e,
    });
    document.getElementById("sheetTitle").textContent = "Baustelleneinrichtungsplan";
    document.getElementById("sheetCounter").textContent =
      `${logistikFlaechen.length} Fläche${logistikFlaechen.length === 1 ? "" : "n"} · `
      + `${tbText(logistikFlaechen.reduce((s, f) => s + f.breite * f.tiefe, 0), 0)} m²`
      + (krane.length ? ` · Kran mit ${tbText(krane[0].ausladung, 1)} m Ausladung` : " · ohne Kran");
    document.getElementById("sheetOverlay").hidden = false;
  });

  /** Kennung des nächsten Vorgangs: A, B, … Z, AA, AB, … */
  function naechsteVorgangsKennung() {
    const belegt = new Set(bauVorgaenge.map((v) => v.id));
    for (let i = 0; i < 700; i++) {
      const kennung = i < 26
        ? String.fromCharCode(65 + i)
        : String.fromCharCode(65 + Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26));
      if (!belegt.has(kennung)) return kennung;
    }
    return `V${bauVorgaenge.length + 1}`;
  }

  document.getElementById("btnBauVorgang").addEventListener("click", () => {
    const name = document.getElementById("bauVorgangName").value || "Vorgang";
    const dauer = Math.max(0, parseInt(document.getElementById("bauVorgangDauer").value, 10) || 0);
    const vorher = bauVorgaenge.length ? [{ id: bauVorgaenge[bauVorgaenge.length - 1].id, abstand: 0 }] : [];
    const v = { id: naechsteVorgangsKennung(), name, dauer, vorgaenger: vorher };
    bauVorgaenge.push(v);
    if (bauErgebnis) bauzeitRechnen(true); else renderLogistik();
    setStatus(`Vorgang ${v.id} „${v.name}“ mit ${v.dauer} Arbeitstagen angelegt`
      + (vorher.length ? ` im Anschluss an ${vorher[0].id}.` : ".")
      + " Vorgänger und Abstände in der Zeile eintragen.", "ok");
  });

  document.getElementById("btnBauBeispiel").addEventListener("click", () => {
    // Beispiel: Hallenbau in Fertigteilen von der Einrichtung bis zur Abnahme
    bauVorgaenge = [
      { id: "A", name: "Baustelle einrichten", dauer: 5, vorgaenger: [] },
      { id: "B", name: "Baugrube und Aushub", dauer: 8, vorgaenger: [{ id: "A", abstand: 0 }] },
      { id: "C", name: "Köcherfundamente", dauer: 10, vorgaenger: [{ id: "B", abstand: 0 }] },
      { id: "D", name: "Ver- und Entsorgungsleitungen", dauer: 6, vorgaenger: [{ id: "B", abstand: 0 }] },
      { id: "E", name: "Fertigteile Stützen und Binder", dauer: 12, vorgaenger: [{ id: "C", abstand: 3 }] },
      { id: "F", name: "Dachplatten und Dachabdichtung", dauer: 10, vorgaenger: [{ id: "E", abstand: 0 }] },
      { id: "G", name: "Sandwichwände montieren", dauer: 8, vorgaenger: [{ id: "E", abstand: 0 }] },
      { id: "H", name: "Bodenplatte", dauer: 7, vorgaenger: [{ id: "D", abstand: 0 }, { id: "G", abstand: 0 }] },
      { id: "J", name: "Tore, Fenster, Ausbau", dauer: 12, vorgaenger: [{ id: "F", abstand: 0 }, { id: "H", abstand: 0 }] },
      { id: "K", name: "Außenanlagen", dauer: 8, vorgaenger: [{ id: "H", abstand: 0 }] },
      { id: "L", name: "Abnahme und Räumung", dauer: 3, vorgaenger: [{ id: "J", abstand: 0 }, { id: "K", abstand: 0 }] },
    ];
    bauzeitRechnen();
  });

  document.getElementById("btnBauzeit").addEventListener("click", () => bauzeitRechnen());

  document.getElementById("btnBalkenplan").addEventListener("click", () => {
    const e = bauErgebnis || bauzeitRechnen();
    if (!e) return;
    sheetArt = "balkenplan";
    document.getElementById("sheetBody").innerHTML = balkenplanSVG({
      plan: e, start: bauStartDatum(), projekt: projektKopf(),
    });
    document.getElementById("sheetTitle").textContent = "Bauzeitenplan";
    document.getElementById("sheetCounter").textContent =
      `${e.vorgaenge.length} Vorgänge · ${e.dauer} Arbeitstage · kritischer Weg ${e.kritischerWeg.join(" → ")}`;
    document.getElementById("sheetOverlay").hidden = false;
  });

  ["kranX", "kranY", "kranHakenhoehe", "kranAnschlagmittel", "kranZuschlag", "kranKurve"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => { if (kranErgebnis) kranRechnen(true); });
  });
  ["beBeschaeftigte", "beBauleitung", "beLagerflaeche", "bePersonenToilette", "bePersonenWaschplatz"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => { if (beErgebnis) beRechnen(true); });
  });
  document.getElementById("bauStart").addEventListener("change", () => renderLogistik());

  document.getElementById("btnLogistikCsv").addEventListener("click", () => {
    if (!logistikHuebe.length && !logistikFlaechen.length && !bauVorgaenge.length) {
      setStatus("Es ist nichts zu schreiben – Hübe, Flächen oder Vorgänge anlegen.", "error");
      return;
    }
    const rows = [["Baustellenlogistik – " + (document.getElementById("projectName").value || "Projekt")]];
    const v = beVorgaben();

    if (logistikHuebe.length) {
      const e = kranErgebnis || kranRechnen(true);
      const kran = kranDaten();
      rows.push([]);
      rows.push(["Kran", `Standort ${kran.x} / ${kran.y} m`, `Hakenhoehe ${kran.hakenhoehe} m`,
        `Anschlagmittel ${v.anschlagmittel} kg`, `Zuschlag ${v.kranZuschlag}`]);
      rows.push(["Traglastkurve (Ausladung m : Traglast t)", kranKurveText(kran.kurve),
        "Herstellerangabe, dazwischen linear"]);
      rows.push(["Hub", "x [m]", "y [m]", "Masse [kg]", "Hoehe [m]", "Ausladung [m]",
        "Traglast [t]", "erforderlich [t]", "Ausnutzung [%]", "Hakenhoehe noetig [m]", "Beurteilung"]);
      if (e) {
        e.zeilen.forEach((z) => {
          rows.push([z.hub.bezeichnung, z.hub.x, z.hub.y, Math.round(z.hub.masse), z.hub.hoehe,
            z.ausladung.toFixed(2), z.ausserhalb ? "ausserhalb" : z.traglast.toFixed(2),
            z.erforderlich.toFixed(2),
            Number.isFinite(z.ausnutzung) ? (z.ausnutzung * 100).toFixed(0) : "",
            z.hakenhoehe.toFixed(2), z.erfuellt ? "moeglich" : "nicht moeglich"]);
        });
        rows.push(["Groesste Ausladung", e.groessteAusladung.toFixed(2), "Schwerster Hub",
          e.schwersterHub.toFixed(2), "Nicht moeglich", e.nichtErfuellt]);
        e.meldungen.forEach((m) => rows.push(["Hinweis", m.text]));
      } else {
        logistikHuebe.forEach((h) => rows.push([h.bezeichnung, h.x, h.y, Math.round(h.masse), h.hoehe]));
      }
      const s = kranStandort(logistikHuebe);
      rows.push(["Guenstigster Standort (kleinster umschliessender Kreis)",
        s.x.toFixed(2), s.y.toFixed(2), `groesste noetige Ausladung ${s.ausladung.toFixed(2)} m`,
        `massgebend ${s.massgebend.map((h) => h.bezeichnung).join(", ")}`]);
    }

    const be = beErgebnis || beRechnen(true);
    rows.push([]);
    rows.push(["Baustelleneinrichtung", `${be.beschaeftigte} Beschaeftigte`,
      `${be.bauleitung} Arbeitsplaetze Bauleitung`]);
    rows.push(["Bedarf", "Flaeche [m2]", "Grundlage"]);
    be.zeilen.forEach((z) => rows.push([z.art, z.flaeche.toFixed(1), z.grundlage]));
    rows.push(["Summe", be.gesamt.toFixed(1)]);
    rows.push(["Container", be.container, "Toiletten", be.toiletten, "Waschplaetze", be.waschplaetze]);
    be.hinweise.forEach((h) => rows.push(["Hinweis", h]));
    if (logistikFlaechen.length) {
      rows.push([]);
      rows.push(["Einrichtungsflaechen"]);
      rows.push(["Flaeche", "Art", "x [m]", "y [m]", "Breite [m]", "Tiefe [m]", "Flaeche [m2]"]);
      logistikFlaechen.forEach((f) => rows.push([f.name, (BE_ARTEN[f.art] || {}).name || f.art,
        f.x, f.y, f.breite, f.tiefe, (f.breite * f.tiefe).toFixed(1)]));
      rows.push(["Summe", "", "", "", "", "",
        logistikFlaechen.reduce((s2, f) => s2 + f.breite * f.tiefe, 0).toFixed(1)]);
    }

    if (bauVorgaenge.length) {
      const p = bauErgebnis || bauzeitRechnen(true);
      const start = bauStartDatum();
      rows.push([]);
      rows.push(["Bauzeitenplan nach DIN 69900", `Beginn ${bauDatum(bauTag(start, 0))}`,
        p ? `Gesamtdauer ${p.dauer} Arbeitstage` : ""]);
      rows.push(["Kennung", "Vorgang", "Dauer [AT]", "Vorgaenger", "FAZ", "FEZ", "SAZ", "SEZ",
        "GP", "FP", "Beginn", "Ende", "kritisch"]);
      (p ? p.vorgaenge : bauVorgaenge).forEach((x) => {
        rows.push([x.id, x.name, x.dauer, vorgaengerText(x.vorgaenger),
          p ? x.faz : "", p ? x.fez : "", p ? x.saz : "", p ? x.sez : "",
          p ? x.gp : "", p && Number.isFinite(x.fp) ? x.fp : "",
          p ? bauDatum(bauTag(start, x.faz)) : "", p ? bauDatum(bauTag(start, x.fez)) : "",
          p && x.kritisch ? "ja" : ""]);
      });
      if (p) {
        rows.push(["Kritischer Weg", p.kritischerWeg.join(" > ")]);
        p.meldungen.forEach((m) => rows.push(["Hinweis", m.text]));
      }
    }
    rows.push([]);
    rows.push(["Nicht gefuehrt: Standsicherheit und Gruendung des Krans, Fundamentlasten, Windlasten, "
      + "Montage und Abbau, SiGe-Plan nach BaustellV, Verkehrszeichenplan, Ver- und Entsorgung, Brandschutz."]);

    const name = (document.getElementById("projectName").value || "Projekt").replace(/\s+/g, "_");
    saveFile(`Baustellenlogistik_${name}.csv`, "﻿" + zuCsv(rows), "text/csv;charset=utf-8;");
    setStatus("Kranprüfung, Flächenbedarf, Einrichtungsflächen und Bauzeitenplan als CSV ausgegeben.", "ok");
  });

  /* ============================== Geländemodell (DGM) */

  function dgmZahlFeld(id, ersatz) {
    const w = parseFloat(document.getElementById(id).value);
    return Number.isFinite(w) ? w : ersatz;
  }

  /** Netz und Höhenlinien aus den Höhenpunkten bilden. */
  function dgmBilden(still) {
    if (dgmPunkte.length < 3) {
      if (!still) setStatus("Für ein Geländemodell sind mindestens drei Höhenpunkte nötig.", "error");
      dgm = null; dgmLinien = []; dgmVolumenErgebnis = null;
      renderGelaende();
      return null;
    }
    const beginn = Date.now();
    dgm = dgmVermaschen(dgmPunkte);
    const e = dgmZahlFeld("dgmAequidistanzAnsicht", 0.5);
    dgmLinien = dgmHoehenlinien(dgm, e);
    dgmVolumenErgebnis = null;
    dgm.ms = Date.now() - beginn;
    renderGelaende();
    refreshAll();
    if (!TABS.model.view.hidden) renderModel();
    if (!still) {
      const kw = dgmKennwerte(dgm);
      setStatus(`Geländemodell gebildet: ${kw.punkte} Punkte, ${kw.dreiecke} Dreiecke, `
        + `${dgmLinien.length} Höhenlinien mit ${tbText(e, 2)} m Äquidistanz (${dgm.ms} ms). `
        + `Höhen ${tbText(kw.hoeheMin)} bis ${tbText(kw.hoeheMax)} m, Neigung im Mittel `
        + `${tbText(kw.neigungMittel, 1)} %.`
        + (dgm.doppelte ? ` ${dgm.doppelte} lagegleiche Punkte übergangen.` : ""), "ok");
    }
    return dgm;
  }

  /** Kamera auf das Geländemodell stellen. */
  function dgmKameraSetzen() {
    if (!dgm) return;
    const g = dgm.grenzen;
    const ecken = [];
    [g.minX, g.maxX].forEach((x) => [g.minZ, g.maxZ].forEach((h) =>
      [g.minY, g.maxY].forEach((y) => ecken.push({ x, y: h, z: y }))));
    sketch.frameContent(ecken);
    result.frameContent(ecken);
  }

  function renderGelaende() {
    const kennzahl = (label, wert, warnung) =>
      `<div class="stat"><span class="label">${label}</span>`
      + `<span class="value${warnung ? " warnwert" : ""}">${wert}</span></div>`;

    document.getElementById("dgmEmpty").hidden = dgmPunkte.length > 0;
    const kennzahlen = document.getElementById("dgmKennzahlen");
    const stand = document.getElementById("dgmStand");

    if (!dgm) {
      kennzahlen.innerHTML = dgmPunkte.length
        ? kennzahl("Höhenpunkte", dgmPunkte.length) + kennzahl("Netz", "noch nicht gebildet", true)
        : "";
      stand.textContent = dgmPunkte.length
        ? "Höhenpunkte geladen – „Netz und Höhenlinien“ bildet das Modell."
        : "";
    } else {
      const kw = dgmKennwerte(dgm);
      kennzahlen.innerHTML =
        kennzahl("Höhenpunkte", kw.punkte)
        + kennzahl("Dreiecke", kw.dreiecke)
        + kennzahl("Höhenlinien", dgmLinien.length)
        + kennzahl("Höhen", `${tbText(kw.hoeheMin)} … ${tbText(kw.hoeheMax)} m`)
        + kennzahl("Ausdehnung", `${tbText(kw.breite, 0)} × ${tbText(kw.tiefe, 0)} m`)
        + kennzahl("Fläche Grundriss", `${tbText(kw.flaecheGrundriss, 0)} m²`)
        + kennzahl("Geländefläche", `${tbText(kw.flaecheGelaende, 0)} m²`)
        + kennzahl("Neigung mittel", `${tbText(kw.neigungMittel, 1)} %`)
        + kennzahl("Neigung größte", `${tbText(kw.neigungMax, 1)} %`);
      stand.innerHTML = `Vermascht in ${dgm.ms} ms · Äquidistanz `
        + `${tbText(dgmZahlFeld("dgmAequidistanzAnsicht", 0.5), 2)} m, jede fünfte Linie verstärkt.`
        + (dgm.doppelte ? ` ${dgm.doppelte} lagegleiche Punkte wurden übergangen.` : "")
        + (kw.schlankeDreiecke ? ` ${kw.schlankeDreiecke} schlanke Dreiecke am Rand – beim Größtwert `
          + "der Neigung außen vor gelassen, weil ihre Neigung ohne Aussage ist." : "")
        + " Die mittlere Neigung ist mit der Fläche gewichtet.";
    }

    // ---- Aushub
    const v = document.getElementById("dgmVolumen");
    if (!dgmVolumenErgebnis) {
      v.innerHTML = "";
    } else {
      const r = dgmVolumenErgebnis;
      v.innerHTML =
        kennzahl("Planum", `${tbText(r.planum)} m`)
        + kennzahl("Abtrag", `${tbText(r.abtrag, 1)} m³`)
        + kennzahl("Auftrag", `${tbText(r.auftrag, 1)} m³`)
        + kennzahl("netto", `${tbText(r.netto, 1)} m³`, r.netto < 0)
        + kennzahl("Fläche Abtrag", `${tbText(r.flaecheAbtrag, 0)} m²`)
        + kennzahl("Fläche Auftrag", `${tbText(r.flaecheAuftrag, 0)} m²`)
        + kennzahl("Oberboden", `${tbText(r.oberboden, 1)} m³`);
    }

    // ---- Punktliste (nur die ersten Punkte, sonst wird die Seite unbedienbar)
    const body = document.getElementById("dgmBody");
    body.innerHTML = "";
    const grenze = 200;
    dgmPunkte.slice(0, grenze).forEach((p, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${p.nummer || i + 1}</td>
        <td>${tbText(p.x, 3)}</td>
        <td>${tbText(p.y, 3)}</td>
        <td><strong>${tbText(p.z, 3)}</strong></td>
        <td>${p.art || ""}</td>
        <td><button class="row-remove" data-dgm-weg="${i}" title="Punkt entfernen">✕</button></td>`;
      body.appendChild(tr);
    });
    document.getElementById("dgmPunktHinweis").textContent = dgmPunkte.length > grenze
      ? `Es werden die ersten ${grenze} von ${dgmPunkte.length} Punkten gezeigt; gerechnet wird mit allen.`
      : "";
  }

  /* ---- Bedienung Gelände */

  document.getElementById("viewGelaende").addEventListener("click", (e) => {
    const weg = e.target.closest("[data-dgm-weg]");
    if (!weg) return;
    dgmPunkte.splice(parseInt(weg.dataset.dgmWeg, 10), 1);
    if (dgm) dgmBilden(true); else renderGelaende();
  });

  document.getElementById("btnDgmDatei").addEventListener("click", () => {
    const eingabe = document.getElementById("dgmDatei");
    const datei = eingabe.files && eingabe.files[0];
    if (!datei) { setStatus("Zuerst eine Punktliste wählen.", "error"); return; }
    const leser = new FileReader();
    leser.onload = () => {
      const erg = dgmPunkteAusText(String(leser.result));
      if (!erg.punkte.length) {
        setStatus(`In „${datei.name}“ wurde kein Punkt gefunden. Erwartet wird je Zeile `
          + "Punktnummer, Rechtswert, Hochwert und Höhe – oder drei Zahlen ohne Nummer.", "error");
        return;
      }
      dgmPunkte = erg.punkte;
      dgmBilden();
      dgmKameraSetzen();
      setStatus(`${erg.punkte.length} Höhenpunkte aus „${datei.name}“ gelesen`
        + (erg.uebergangen ? `, ${erg.uebergangen} Zeilen übergangen` : "")
        + `. ${dgm ? `${dgm.dreiecke.length} Dreiecke gebildet.` : ""}`, "ok");
      eingabe.value = "";
    };
    leser.readAsText(datei);
  });

  document.getElementById("btnDgmAusWolke").addEventListener("click", () => {
    if (!punktwolke) { setStatus("Zuerst im Register Bestand einen Scan laden.", "error"); return; }
    const weite = dgmZahlFeld("dgmRasterWolke", 2);
    const punkte = dgmBodenpunkte(punktwolke.voll, weite);
    if (punkte.length < 3) { setStatus("Zu wenige Bodenpunkte – Rasterweite verkleinern.", "error"); return; }
    dgmPunkte = punkte;
    dgmBilden();
    dgmKameraSetzen();
    setStatus(`${punkte.length} Bodenpunkte aus der Punktwolke gewonnen (je Zelle von `
      + `${tbText(weite, 1)} m der tiefste Punkt). Der Filter versagt unter Bewuchs und an Bauwerken; `
      + "für eine Abrechnung ist eine geprüfte Bodenpunktwolke zu verwenden.", "info");
  });

  document.getElementById("btnDgmBeispiel").addEventListener("click", () => {
    // Zwei Kuppen und eine Mulde, aufgenommen im Raster mit Streuung
    const hoehe = (x, y) => 12 + 0.010 * x + 0.004 * y
      + 4.0 * Math.exp(-(((x - 80) ** 2 + (y - 60) ** 2) / 2500))
      + 2.5 * Math.exp(-(((x - 210) ** 2 + (y - 140) ** 2) / 3000))
      - 3.0 * Math.exp(-(((x - 150) ** 2 + (y - 40) ** 2) / 2000));
    let saat = 777;
    const zufall = () => (saat = (saat * 1103515245 + 12345) % 2147483648) / 2147483648;
    const punkte = [];
    let nummer = 1000;
    for (let x = 0; x <= 300; x += 10) {
      for (let y = 0; y <= 200; y += 10) {
        const px = Math.min(300, Math.max(0, x + (zufall() - 0.5) * 4));
        const py = Math.min(200, Math.max(0, y + (zufall() - 0.5) * 4));
        punkte.push({ nummer: String(nummer++), x: px, y: py, z: hoehe(px, py), art: "GEL" });
      }
    }
    dgmPunkte = punkte;
    dgmBilden();
    dgmKameraSetzen();
    setStatus(`Beispielgelände eingesetzt: ${punkte.length} Höhenpunkte im 10-m-Raster über 300 × 200 m `
      + "mit zwei Kuppen und einer Mulde. Zum Ausprobieren und Überschreiben gedacht.", "ok");
  });

  document.getElementById("btnDgmLeeren").addEventListener("click", () => {
    dgmPunkte = []; dgm = null; dgmLinien = []; dgmVolumenErgebnis = null;
    renderGelaende();
    refreshAll();
    if (!TABS.model.view.hidden) renderModel();
    setStatus("Geländemodell verworfen.", "ok");
  });

  document.getElementById("btnDgmVermaschen").addEventListener("click", () => dgmBilden());
  ["dgmNetzZeigen", "dgmDraht"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => {
      if (!TABS.model.view.hidden) renderModel();
    });
  });

  document.getElementById("btnDgmVolumen").addEventListener("click", () => {
    if (!dgm) { if (!dgmBilden()) return; }
    const planum = dgmZahlFeld("dgmPlanumAnsicht", 0);
    const dOberboden = dgmZahlFeld("dgmOberboden", 0.25);
    const r = dgmVolumenGegenEbene(dgm, planum);
    dgmVolumenErgebnis = Object.assign({ planum }, r, {
      // Der Oberboden wird über der Fläche abgetragen, auf der überhaupt
      // gearbeitet wird – hier über der Abtragsfläche
      oberboden: r.flaecheAbtrag * dOberboden,
    });
    renderGelaende();
    setStatus(`Aushub gegen die Ebene ${tbText(planum)} m: Abtrag ${tbText(r.abtrag, 1)} m³ auf `
      + `${tbText(r.flaecheAbtrag, 0)} m², Auftrag ${tbText(r.auftrag, 1)} m³ auf `
      + `${tbText(r.flaecheAuftrag, 0)} m². Netto ${tbText(r.netto, 1)} m³ `
      + `${r.netto >= 0 ? "Überschuss" : "Bedarf"}. Für eine Ebene ist das Ergebnis genau, `
      + "keine Rasternäherung.", "ok");
  });

  document.getElementById("btnGelaendeplan").addEventListener("click", () => {
    if (!dgm) { if (!dgmBilden()) return; }
    const stand = tiefbau.achse.length ? tiefbauStand() : null;
    sheetArt = "gelaendeplan";
    document.getElementById("sheetBody").innerHTML = gelaendeplanSVG({
      dgm, linien: dgmLinien, projekt: projektKopf(),
      aequidistanz: dgmZahlFeld("dgmAequidistanzAnsicht", 0.5),
      netz: document.getElementById("dgmDraht").checked,
      punkteZeigen: document.getElementById("dgmPunkteImPlan").checked,
      trasse: stand ? stand.trasse : null,
      stationen: stand ? stand.stationen : [],
    });
    const kw = dgmKennwerte(dgm);
    document.getElementById("sheetTitle").textContent = "Geländeplan";
    document.getElementById("sheetCounter").textContent =
      `${kw.punkte} Punkte · ${dgmLinien.length} Höhenlinien · `
      + `${tbText(kw.hoeheMin)} bis ${tbText(kw.hoeheMax)} m`;
    document.getElementById("sheetOverlay").hidden = false;
  });

  document.getElementById("btnDgmCsv").addEventListener("click", () => {
    if (!dgmPunkte.length) { setStatus("Keine Höhenpunkte vorhanden.", "error"); return; }
    const rows = [["Geländemodell – " + (document.getElementById("projectName").value || "Projekt")]];
    if (dgm) {
      const kw = dgmKennwerte(dgm);
      rows.push(["Punkte", kw.punkte, "Dreiecke", kw.dreiecke,
        "Hoehe min [m]", kw.hoeheMin.toFixed(3), "Hoehe max [m]", kw.hoeheMax.toFixed(3)]);
      rows.push(["Flaeche Grundriss [m2]", kw.flaecheGrundriss.toFixed(2),
        "Gelaendeflaeche [m2]", kw.flaecheGelaende.toFixed(2),
        "Neigung Mittel [%]", kw.neigungMittel.toFixed(2),
        "Neigung groesste [%]", kw.neigungMax.toFixed(2)]);
    }
    if (dgmVolumenErgebnis) {
      const r = dgmVolumenErgebnis;
      rows.push([]);
      rows.push(["Aushub gegen die Ebene [m]", r.planum.toFixed(3)]);
      rows.push(["Abtrag [m3]", r.abtrag.toFixed(2), "Flaeche [m2]", r.flaecheAbtrag.toFixed(2)]);
      rows.push(["Auftrag [m3]", r.auftrag.toFixed(2), "Flaeche [m2]", r.flaecheAuftrag.toFixed(2)]);
      rows.push(["netto [m3]", r.netto.toFixed(2), "Oberboden [m3]", r.oberboden.toFixed(2)]);
    }
    rows.push([]);
    rows.push(["Nr", "Rechts [m]", "Hoch [m]", "Hoehe [m]", "Code"]);
    dgmPunkte.forEach((p, i) => {
      rows.push([p.nummer || i + 1, p.x.toFixed(3), p.y.toFixed(3), p.z.toFixed(3), p.art || ""]);
    });
    const name = (document.getElementById("projectName").value || "Projekt").replace(/\s+/g, "_");
    saveFile(`Gelaendemodell_${name}.csv`, "\ufeff" + zuCsv(rows), "text/csv;charset=utf-8;");
    setStatus(`${dgmPunkte.length} Höhenpunkte mit Kennwerten als CSV ausgegeben.`, "ok");
  });

  // Äquidistanz in Band und Ansicht gleich halten
  [["dgmAequidistanz", "dgmAequidistanzAnsicht"], ["dgmPlanum", "dgmPlanumAnsicht"]].forEach(([band, ansicht]) => {
    const a = document.getElementById(band), b = document.getElementById(ansicht);
    a.addEventListener("change", () => { b.value = a.value; });
    b.addEventListener("change", () => { a.value = b.value; });
  });

  /* ================================================== Tiefbau: Trassierung */

  let querprofilBlatt = 0;

  /** Zahl aus einem Feld, mit Ersatzwert. */
  function tbZahl(id, ersatz) {
    const w = parseFloat(document.getElementById(id).value);
    return Number.isFinite(w) ? w : ersatz;
  }

  function tbText(wert, stellen) {
    return Number(wert).toFixed(stellen === undefined ? 2 : stellen).replace(".", ",");
  }

  /** Regelquerschnitt aus den Eingabefeldern. */
  function tiefbauQuerschnitt() {
    return {
      fahrbahn: tbZahl("qsFahrbahn", 6.5),
      querneigung: tbZahl("qsQuerneigung", 2.5),
      dachprofil: document.getElementById("qsDach").value === "dach",
      bankett: tbZahl("qsBankett", 1.5),
      bankettNeigung: tbZahl("qsBankettNeigung", 12),
      oberbau: tbZahl("qsOberbau", 0.55),
      oberboden: tbZahl("qsOberboden", 0.25),
      boeschungAuftrag: tbZahl("qsBoeschungAuftrag", 1.5),
      boeschungAbtrag: tbZahl("qsBoeschungAbtrag", 1.5),
    };
  }

  /** Ausgewerteter Zustand: Achse, Gradiente, Stationen. */
  function tiefbauStand() {
    const trasse = trasseAuswerten(tiefbau.achse, {
      x: tbZahl("achseStartX", 0), y: tbZahl("achseStartY", 0),
      richtung: tbZahl("achseStartRichtung", 0), station: tbZahl("achseStartStation", 0),
    });
    const gradiente = gradienteAuswerten(tiefbau.gradiente);
    const stationen = tiefbau.achse.length ? trasseStationen(trasse, tbZahl("profilAbstand", 20)) : [];
    return { trasse, gradiente, stationen };
  }

  /**
   * Querprofil an einer Station.
   *
   * Liegt ein Geländemodell vor und ist es eingeschaltet, wird das Gelände
   * je Profil quer zur Achse aus dem Netz abgegriffen – mit allen
   * Knickpunkten. Sonst gilt die Beschreibung über Höhe und Querneigung
   * je Station.
   */
  function tiefbauProfilBei(gradiente, qs, trasse) {
    const ausDgm = dgm && dgm.dreiecke.length
      && document.getElementById("tiefbauAusDgm").checked && trasse;
    const halbeBreite = dgmZahlFeld("tiefbauProfilbreite", 40);
    const schritt = dgmZahlFeld("tiefbauProfilschritt", 1);
    return (station) => {
      const achshoehe = gradienteHoehe(gradiente, station).hoehe;
      if (ausDgm) {
        const p = trassePunkt(trasse, station);
        // Querrichtung: senkrecht zur Achsrichtung, positiv nach rechts
        const quer = { x: Math.sin(p.richtung), y: -Math.cos(p.richtung) };
        const linie = dgmSchnitt(dgm, { x: p.x, y: p.y }, quer, -halbeBreite, halbeBreite, schritt);
        if (linie.length > 1) return querprofil(qs, achshoehe, { linie });
      }
      return querprofil(qs, achshoehe, gelaendeBei(tiefbau.gelaende, station));
    };
  }

  function tiefbauRechnen() {
    if (tiefbau.achse.length < 1) { setStatus("Zuerst die Achse anlegen.", "error"); return null; }
    if (tiefbau.gradiente.length < 2) { setStatus("Die Gradiente braucht mindestens zwei Punkte.", "error"); return null; }
    if (!tiefbau.gelaende.length) { setStatus("Zuerst Geländehöhen eintragen.", "error"); return null; }

    const { trasse, gradiente, stationen } = tiefbauStand();
    const qs = tiefbauQuerschnitt();
    const profilBei = tiefbauProfilBei(gradiente, qs, trasse);
    const massen = massenBerechnung(stationen, profilBei);

    const boden = {
      name: document.getElementById("bodenArt").selectedOptions[0].textContent,
      auflockerung: tbZahl("bodenAuflockerung", 1.25),
      verdichtung: tbZahl("bodenVerdichtung", 0.92),
      wiederverwendung: tbZahl("bodenWieder", 60),
      loesen: HOMOGENBEREICHE[document.getElementById("bodenArt").value].loesen,
      einbau: HOMOGENBEREICHE[document.getElementById("bodenArt").value].einbau,
      deponie: HOMOGENBEREICHE[document.getElementById("bodenArt").value].deponie,
      lieferung: HOMOGENBEREICHE[document.getElementById("bodenArt").value].lieferung,
    };
    const ausgleich = massenAusgleich(massen.summe, boden);
    const kosten = erdKosten(ausgleich, {
      transportKm: tbZahl("transportKm", 12),
      transportProKmM3: tbZahl("transportPreis", 0.35),
      oberbauMenge: massen.summe.oberbau,
    });

    tiefbauErgebnis = { trasse, gradiente, stationen, qs, massen, ausgleich, kosten, profilBei };
    renderTiefbau();
    const offen = massen.profile.filter((p) => p.profil.hinweise.length).length;
    const ausDgm = dgm && dgm.dreiecke.length && document.getElementById("tiefbauAusDgm").checked;
    setStatus(`${stationen.length} Querprofile gerechnet `
      + `(Gelände ${ausDgm ? "aus dem Geländemodell, quer zur Achse abgegriffen"
        : "aus Höhe und Querneigung je Station"}): Abtrag ${tbText(massen.summe.abtrag, 1)} m³, `
      + `Auftrag ${tbText(massen.summe.auftrag, 1)} m³, Oberboden ${tbText(massen.summe.oberboden, 1)} m³ `
      + `(Mittelwertverfahren). Kostenschätzung ${tbText(kosten.summe, 2)} €.`
      + (offen ? ` ${offen} Profile: die Böschung erreicht das Gelände nicht – Grenzweite oder Gelände prüfen.` : ""),
    offen ? "info" : "ok");
    return tiefbauErgebnis;
  }

  function renderTiefbau() {
    const { trasse, gradiente, stationen } = tiefbauStand();

    // ---- Achse
    const aBody = document.getElementById("achseBody");
    aBody.innerHTML = "";
    document.getElementById("achseEmpty").hidden = tiefbau.achse.length > 0;
    trasse.elemente.forEach((el, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${el.nummer}</td>
        <td><select data-tb="achse" data-i="${i}" data-feld="art">
          ${Object.keys(TRASSE_ARTEN).map((k) => `<option value="${k}"${k === el.art ? " selected" : ""}>${TRASSE_ARTEN[k].name}</option>`).join("")}
        </select></td>
        <td><input type="number" step="1" min="0.1" data-tb="achse" data-i="${i}" data-feld="laenge" value="${el.laenge}"></td>
        <td>${el.art === "gerade" ? "–" : `<input type="number" step="10" data-tb="achse" data-i="${i}" data-feld="radius" value="${el.radius}">`}</td>
        <td>${el.art === "klothoide" ? `<input type="number" step="10" data-tb="achse" data-i="${i}" data-feld="radiusEnde" value="${el.radiusEnde}">` : "–"}</td>
        <td>${stationText(el.station)}</td>
        <td>${stationText(el.stationEnde)}</td>
        <td>${el.A ? tbText(el.A, 1) : "–"}</td>
        <td>${tbText(el.xEnde, 3)} / ${tbText(el.yEnde, 3)}</td>
        <td>${tbText((el.richtungEnde * 180) / Math.PI, 4)}</td>
        <td><button class="row-remove" data-tb-weg="achse" data-i="${i}" title="Element entfernen">✕</button></td>`;
      aBody.appendChild(tr);
    });

    // ---- Gradiente
    const gBody = document.getElementById("gradBody");
    gBody.innerHTML = "";
    document.getElementById("gradEmpty").hidden = tiefbau.gradiente.length > 0;
    gradiente.punkte.forEach((p, i) => {
      const ab = gradiente.abschnitte[i];
      const a = gradiente.ausrundungen.find((x) => Math.abs(x.station - p.station) < 1e-9);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input type="number" step="10" data-tb="gradiente" data-i="${i}" data-feld="station" value="${p.station}"></td>
        <td><input type="number" step="0.01" data-tb="gradiente" data-i="${i}" data-feld="hoehe" value="${p.hoehe}"></td>
        <td><input type="number" step="100" min="0" data-tb="gradiente" data-i="${i}" data-feld="halbmesser" value="${p.halbmesser || 0}"></td>
        <td>${ab ? tbText(ab.neigung * 100, 2) : "–"}</td>
        <td>${a ? a.art : "–"}</td>
        <td>${a ? tbText(a.laenge, 1) : "–"}</td>
        <td>${a ? tbText(a.T, 1) : "–"}</td>
        <td>${a ? tbText(a.stich, 3) : "–"}</td>
        <td><button class="row-remove" data-tb-weg="gradiente" data-i="${i}">✕</button></td>`;
      gBody.appendChild(tr);
    });

    // ---- Gelände
    const glBody = document.getElementById("gelBody");
    glBody.innerHTML = "";
    document.getElementById("gelEmpty").hidden = tiefbau.gelaende.length > 0;
    tiefbau.gelaende.slice().sort((a, b) => a.station - b.station).forEach((p, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input type="number" step="10" data-tb="gelaende" data-i="${i}" data-feld="station" value="${p.station}"></td>
        <td><input type="number" step="0.01" data-tb="gelaende" data-i="${i}" data-feld="hoehe" value="${p.hoehe}"></td>
        <td><input type="number" step="0.5" data-tb="gelaende" data-i="${i}" data-feld="querneigung" value="${p.querneigung || 0}"></td>
        <td><button class="row-remove" data-tb-weg="gelaende" data-i="${i}">✕</button></td>`;
      glBody.appendChild(tr);
    });

    // ---- Meldungen der Entwurfsprüfung
    const meldungen = trassePruefung(trasse).concat(gradiente.meldungen);
    document.getElementById("tiefbauMeldungen").innerHTML = meldungen.length
      ? meldungen.map((m) => `<div class="${m.art === "warnung" ? "warnwert" : ""}">`
        + `${m.art === "warnung" ? "⚠" : "ℹ"} ${m.text}</div>`).join("")
      : (tiefbau.achse.length ? "Achse und Gradiente halten die hinterlegten Richtwerte ein." : "");

    // ---- Massen
    const kennzahl = (label, wert, warnung) =>
      `<div class="stat"><span class="label">${label}</span>`
      + `<span class="value${warnung ? " warnwert" : ""}">${wert}</span></div>`;
    const mBody = document.getElementById("massenBody");
    mBody.innerHTML = "";
    const kBody = document.getElementById("erdKostenBody");
    kBody.innerHTML = "";
    document.getElementById("massenEmpty").hidden = !!tiefbauErgebnis;

    if (!tiefbauErgebnis) {
      document.getElementById("tiefbauKennzahlen").innerHTML = tiefbau.achse.length
        ? kennzahl("Achslänge", `${tbText(trasse.laenge)} m`)
          + kennzahl("Elemente", trasse.elemente.length)
          + kennzahl("Querprofile", stationen.length)
        : "";
      return;
    }

    const e = tiefbauErgebnis;
    e.massen.felder.forEach((f) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${stationText(f.von)}</td>
        <td>${stationText(f.bis)}</td>
        <td>${tbText(f.abstand)}</td>
        <td>${tbText(f.A1abtrag)} → ${tbText(f.A2abtrag)}</td>
        <td>${tbText(f.A1auftrag)} → ${tbText(f.A2auftrag)}</td>
        <td><strong>${tbText(f.abtrag, 1)}</strong></td>
        <td><strong>${tbText(f.auftrag, 1)}</strong></td>
        <td>${tbText(f.abtragPrisma, 1)}</td>
        <td>${tbText(f.auftragPrisma, 1)}</td>
        <td>${tbText(f.oberboden, 1)}</td>
        <td>${tbText(f.oberbau, 1)}</td>`;
      mBody.appendChild(tr);
    });

    const s = e.massen.summe, a = e.ausgleich;
    document.getElementById("tiefbauKennzahlen").innerHTML =
      kennzahl("Achslänge", `${tbText(trasse.laenge)} m`)
      + kennzahl("Querprofile", e.stationen.length)
      + kennzahl("Abtrag (fest)", `${tbText(s.abtrag, 1)} m³`)
      + kennzahl("Auftrag (verdichtet)", `${tbText(s.auftrag, 1)} m³`)
      + kennzahl("Oberboden", `${tbText(s.oberboden, 1)} m³`)
      + kennzahl("Oberbau", `${tbText(s.oberbau, 1)} m³`)
      + kennzahl("Abfuhr (lose)", `${tbText(a.abfuhrLose, 1)} m³`, a.abfuhrLose > 0)
      + kennzahl("Fehlmenge", `${tbText(a.fehlmengeVerdichtet, 1)} m³`, a.fehlmengeVerdichtet > 0)
      + kennzahl("Kosten Erdbau", `${tbText(e.kosten.summe, 2)} €`);

    e.kosten.zeilen.forEach((zl) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${zl.nr}</td>
        <td>${zl.kurz}</td>
        <td>${tbText(zl.menge, 2)}</td>
        <td>${zl.einheit}</td>
        <td>${tbText(zl.ep, 2)}</td>
        <td><strong>${tbText(zl.gp, 2)}</strong></td>
        <td class="layer-note">${zl.hinweis || ""}</td>`;
      kBody.appendChild(tr);
    });
    const summe = document.createElement("tr");
    summe.innerHTML = `<td></td><td><strong>Summe Erdarbeiten</strong></td><td></td><td></td><td></td>`
      + `<td><strong>${tbText(e.kosten.summe, 2)}</strong></td><td class="layer-note">ohne Umsatzsteuer</td>`;
    kBody.appendChild(summe);
  }

  /* ---- Bedienung Tiefbau */

  (function fuelleBodenarten() {
    const wahl = document.getElementById("bodenArt");
    wahl.innerHTML = Object.keys(HOMOGENBEREICHE)
      .map((k) => `<option value="${k}"${k === "lehm" ? " selected" : ""}>${HOMOGENBEREICHE[k].name}</option>`).join("");
    const setzeFaktoren = () => {
      const b = HOMOGENBEREICHE[wahl.value];
      document.getElementById("bodenAuflockerung").value = b.auflockerung;
      document.getElementById("bodenVerdichtung").value = b.verdichtung;
      document.getElementById("bodenWieder").value = b.wiederverwendung;
    };
    wahl.addEventListener("change", () => { setzeFaktoren(); if (tiefbauErgebnis) tiefbauRechnen(); });
    setzeFaktoren();
  }());

  document.getElementById("viewTiefbau").addEventListener("change", (e) => {
    const ziel = e.target;
    if (!ziel.dataset.tb) return;
    const liste = tiefbau[ziel.dataset.tb];
    const eintrag = liste[parseInt(ziel.dataset.i, 10)];
    if (!eintrag) return;
    const feld = ziel.dataset.feld;
    eintrag[feld] = feld === "art" ? ziel.value : parseFloat(ziel.value) || 0;
    if (feld === "art" && ziel.value === "gerade") { eintrag.radius = 0; eintrag.radiusEnde = 0; }
    if (ziel.dataset.tb !== "achse") liste.sort((a, b) => a.station - b.station);
    if (tiefbauErgebnis) tiefbauRechnen(); else renderTiefbau();
  });

  document.getElementById("viewTiefbau").addEventListener("click", (e) => {
    const knopf = e.target.closest("[data-tb-weg]");
    if (!knopf) return;
    tiefbau[knopf.dataset.tbWeg].splice(parseInt(knopf.dataset.i, 10), 1);
    if (tiefbauErgebnis) tiefbauRechnen(); else renderTiefbau();
  });

  document.getElementById("btnAchseElement").addEventListener("click", () => {
    const art = document.getElementById("achseArt").value;
    const radius = tbZahl("achseRadius", 250);
    tiefbau.achse.push({
      art, laenge: Math.max(1, tbZahl("achseLaenge", 100)),
      radius: art === "gerade" ? 0 : radius,
      // Die Klothoide führt vom vorherigen Radius auf den eingestellten
      radiusEnde: art === "klothoide" ? radius : 0,
    });
    if (art === "klothoide") {
      // Übergang aus der Geraden: Anfangsradius unendlich, Endradius wie gewählt
      const el = tiefbau.achse[tiefbau.achse.length - 1];
      const vorher = tiefbau.achse[tiefbau.achse.length - 2];
      el.radius = vorher && vorher.art === "bogen" ? vorher.radius : 0;
      el.radiusEnde = vorher && vorher.art === "bogen" ? 0 : radius;
    }
    renderTiefbau();
    setStatus(`${TRASSE_ARTEN[art].name} angehängt. Achslänge ${tbText(tiefbauStand().trasse.laenge)} m.`, "ok");
  });

  document.getElementById("btnAchseBeispiel").addEventListener("click", () => {
    tiefbau.achse = [
      { art: "gerade", laenge: 80, radius: 0, radiusEnde: 0 },
      { art: "klothoide", laenge: 60, radius: 0, radiusEnde: 250 },
      { art: "bogen", laenge: 120, radius: 250, radiusEnde: 250 },
      { art: "klothoide", laenge: 60, radius: 250, radiusEnde: 0 },
      { art: "gerade", laenge: 100, radius: 0, radiusEnde: 0 },
    ];
    tiefbau.gradiente = [
      { station: 0, hoehe: 12.50, halbmesser: 0 },
      { station: 160, hoehe: 16.00, halbmesser: 2500 },
      { station: 300, hoehe: 14.60, halbmesser: 3000 },
      { station: 420, hoehe: 15.80, halbmesser: 0 },
    ];
    tiefbau.gelaende = [
      { station: 0, hoehe: 12.00, querneigung: 3 },
      { station: 100, hoehe: 13.50, querneigung: 5 },
      { station: 200, hoehe: 16.80, querneigung: 4 },
      { station: 300, hoehe: 15.20, querneigung: 2 },
      { station: 420, hoehe: 14.60, querneigung: 0 },
    ];
    tiefbauErgebnis = null;
    renderTiefbau();
    setStatus("Beispielachse eingesetzt: Gerade, Klothoide, Bogen R = 250 m, Klothoide, Gerade – "
      + "420 m mit Gradiente und Gelände. Zum Prüfen und Überschreiben gedacht.", "ok");
  });

  document.getElementById("btnGradientePunkt").addEventListener("click", () => {
    tiefbau.gradiente.push({
      station: tbZahl("gradStation", 0), hoehe: tbZahl("gradHoehe", 0),
      halbmesser: Math.abs(tbZahl("gradHalbmesser", 0)),
    });
    tiefbau.gradiente.sort((a, b) => a.station - b.station);
    if (tiefbauErgebnis) tiefbauRechnen(); else renderTiefbau();
  });

  document.getElementById("btnGelaendePunkt").addEventListener("click", () => {
    tiefbau.gelaende.push({
      station: tbZahl("gelStation", 0), hoehe: tbZahl("gelHoehe", 0),
      querneigung: tbZahl("gelNeigung", 0),
    });
    tiefbau.gelaende.sort((a, b) => a.station - b.station);
    if (tiefbauErgebnis) tiefbauRechnen(); else renderTiefbau();
  });

  document.getElementById("btnMassen").addEventListener("click", tiefbauRechnen);

  document.getElementById("btnLageplan").addEventListener("click", () => {
    if (!tiefbau.achse.length) { setStatus("Zuerst die Achse anlegen.", "error"); return; }
    const { trasse, stationen } = tiefbauStand();
    sheetArt = "lageplan";
    document.getElementById("sheetBody").innerHTML = lageplanSVG({ trasse, stationen, projekt: projektKopf() });
    document.getElementById("sheetTitle").textContent = "Lageplan der Achse";
    document.getElementById("sheetCounter").textContent =
      `${trasse.elemente.length} Elemente · ${tbText(trasse.laenge)} m`;
    document.getElementById("sheetOverlay").hidden = false;
  });

  document.getElementById("btnHoehenplan").addEventListener("click", () => {
    const e = tiefbauErgebnis || tiefbauRechnen();
    if (!e) return;
    sheetArt = "hoehenplan";
    // Die Geländelinie des Höhenplans folgt derselben Quelle wie die
    // Querprofile: Geländemodell, wenn es eingeschaltet ist
    const ausDgm = dgm && dgm.dreiecke.length && document.getElementById("tiefbauAusDgm").checked;
    const gelaendeHoehe = ausDgm
      ? (station) => {
        const p = trassePunkt(e.trasse, station);
        const h = dgmHoehe(dgm, p.x, p.y);
        return h === null ? gelaendeBei(tiefbau.gelaende, station).hoehe : h;
      }
      : null;
    document.getElementById("sheetBody").innerHTML = laengsschnittSVG({
      trasse: e.trasse, gradiente: e.gradiente, gelaende: tiefbau.gelaende,
      stationen: e.stationen, projekt: projektKopf(), massen: e.massen,
      gelaendeHoehe,
    });
    document.getElementById("sheetTitle").textContent = "Höhenplan mit Massenlinie";
    document.getElementById("sheetCounter").textContent =
      `${e.stationen.length} Stationen · Überschuss ${tbText(e.massen.summe.abtrag - e.massen.summe.auftrag, 1)} m³`;
    document.getElementById("sheetOverlay").hidden = false;
  });

  /** Querprofilblatt Nummer i (sechs Profile je Blatt). */
  function zeigeQuerprofile(nummer) {
    const e = tiefbauErgebnis;
    if (!e) return;
    const proBlatt = 6;
    const blaetter = Math.max(1, Math.ceil(e.stationen.length / proBlatt));
    querprofilBlatt = ((nummer % blaetter) + blaetter) % blaetter;
    const teil = e.stationen.slice(querprofilBlatt * proBlatt, (querprofilBlatt + 1) * proBlatt)
      .map((st) => ({ station: st, profil: e.profilBei(st) }));
    sheetArt = "querprofile";
    document.getElementById("sheetBody").innerHTML = querprofilSVG({
      profile: teil, projekt: projektKopf(), blattNr: querprofilBlatt + 1, blaetter,
    });
    document.getElementById("sheetTitle").textContent = "Querprofile";
    document.getElementById("sheetCounter").textContent =
      `Blatt ${querprofilBlatt + 1} von ${blaetter} · ${teil.length} Profile`;
    document.getElementById("sheetOverlay").hidden = false;
  }

  document.getElementById("btnQuerprofile").addEventListener("click", () => {
    const e = tiefbauErgebnis || tiefbauRechnen();
    if (!e) return;
    zeigeQuerprofile(0);
  });

  document.getElementById("btnErdCsv").addEventListener("click", () => {
    const e = tiefbauErgebnis || tiefbauRechnen();
    if (!e) return;
    const rows = [["Massenberechnung und Kostenschätzung Erdarbeiten – "
      + (document.getElementById("projectName").value || "Projekt")]];
    rows.push(["Achslänge [m]", e.trasse.laenge.toFixed(3), "Querprofile", e.stationen.length,
      "Profilabstand [m]", tbZahl("profilAbstand", 20)]);
    rows.push(["Regelquerschnitt", `Fahrbahn ${e.qs.fahrbahn} m`, `Querneigung ${e.qs.querneigung} %`,
      `Bankett ${e.qs.bankett} m`, `Oberbau ${e.qs.oberbau} m`, `Oberboden ${e.qs.oberboden} m`,
      `Böschung Auftrag 1:${e.qs.boeschungAuftrag}`, `Böschung Abtrag 1:${e.qs.boeschungAbtrag}`]);
    rows.push([]);
    rows.push(["Achse"]);
    rows.push(["Nr", "Art", "Station von", "Station bis", "Länge [m]", "Radius [m]", "Radius Ende [m]",
      "A", "Rechts Anfang", "Hoch Anfang", "Richtung Anfang [Grad]"]);
    e.trasse.elemente.forEach((el) => {
      rows.push([el.nummer, TRASSE_ARTEN[el.art].name, el.station.toFixed(3), el.stationEnde.toFixed(3),
        el.laenge.toFixed(3), el.radius || "", el.art === "klothoide" ? el.radiusEnde : "",
        el.A ? el.A.toFixed(2) : "", el.x.toFixed(3), el.y.toFixed(3),
        ((el.richtung * 180) / Math.PI).toFixed(4)]);
    });
    rows.push([]);
    rows.push(["Querprofile"]);
    rows.push(["Station", "Gradiente [m]", "Gelände [m]", "A Abtrag [m2]", "A Auftrag [m2]",
      "A Oberboden [m2]", "A Oberbau [m2]", "Breite [m]"]);
    e.massen.profile.forEach((p) => {
      rows.push([stationText(p.station), p.profil.achshoehe.toFixed(3), p.profil.gelaende.hoehe.toFixed(3),
        p.profil.flaechen.abtrag.toFixed(3), p.profil.flaechen.auftrag.toFixed(3),
        p.profil.flaechen.oberboden.toFixed(3), p.profil.flaechen.oberbau.toFixed(3),
        p.profil.breite.toFixed(3)]);
    });
    rows.push([]);
    rows.push(["Massen je Feld (Mittelwertverfahren und Prismenformel)"]);
    rows.push(["von", "bis", "e [m]", "V Abtrag [m3]", "V Auftrag [m3]", "V Abtrag Prisma [m3]",
      "V Auftrag Prisma [m3]", "V Oberboden [m3]", "V Oberbau [m3]"]);
    e.massen.felder.forEach((f) => {
      rows.push([stationText(f.von), stationText(f.bis), f.abstand.toFixed(2), f.abtrag.toFixed(2),
        f.auftrag.toFixed(2), f.abtragPrisma.toFixed(2), f.auftragPrisma.toFixed(2),
        f.oberboden.toFixed(2), f.oberbau.toFixed(2)]);
    });
    const s = e.massen.summe;
    rows.push(["Summe", "", "", s.abtrag.toFixed(2), s.auftrag.toFixed(2), s.abtragPrisma.toFixed(2),
      s.auftragPrisma.toFixed(2), s.oberboden.toFixed(2), s.oberbau.toFixed(2)]);
    rows.push([]);
    const a = e.ausgleich;
    rows.push(["Massenausgleich", a.boden.name]);
    rows.push(["Auflockerungsfaktor", a.boden.auflockerung, "Verdichtungsfaktor", a.boden.verdichtung,
      "wiederverwendbar [%]", a.boden.wiederverwendung]);
    rows.push(["Abtrag fest [m3]", a.abtragFest.toFixed(2)]);
    rows.push(["davon brauchbar [m3]", a.brauchbarFest.toFixed(2)]);
    rows.push(["Auftrag verdichtet [m3]", a.auftragVerdichtet.toFixed(2)]);
    rows.push(["aus dem Abtrag eingebaut [m3]", a.einbauAusAbtragVerdichtet.toFixed(2)]);
    rows.push(["Fehlmenge verdichtet [m3]", a.fehlmengeVerdichtet.toFixed(2)]);
    rows.push(["zu liefern fest [m3]", a.lieferungFest.toFixed(2)]);
    rows.push(["Abfuhr fest [m3]", a.abfuhrFest.toFixed(2), "Abfuhr lose [m3]", a.abfuhrLose.toFixed(2)]);
    rows.push([]);
    rows.push(["Kostenschätzung Erdarbeiten"]);
    rows.push(["Pos", "Kurztext", "Menge", "Einheit", "EP [EUR]", "GP [EUR]", "Hinweis"]);
    e.kosten.zeilen.forEach((zl) => {
      rows.push([zl.nr, zl.kurz, zl.menge.toFixed(2), zl.einheit, zl.ep.toFixed(2), zl.gp.toFixed(2), zl.hinweis || ""]);
    });
    rows.push(["", "Summe (ohne Umsatzsteuer)", "", "", "", e.kosten.summe.toFixed(2)]);
    const name = (document.getElementById("projectName").value || "Projekt").replace(/\s+/g, "_");
    saveFile(`Erdmassen_${name}.csv`, "\ufeff" + zuCsv(rows), "text/csv;charset=utf-8;");
    setStatus("Massen und Kostenschätzung als CSV ausgegeben – mit Achse, Querprofilen und Massenausgleich.", "ok");
  });

  /* ------------------------------------------- Bedienung der Baustelle */

  document.getElementById("btnAufmassNeu").addEventListener("click", () => {
    const blatt = neuesAufmass();
    neueAufmassZeile(blatt);
    renderAufmass();
    document.getElementById("aufmassBlatt").value = String(blatt.id);
    renderAufmass();
    setStatus("Aufmaßblatt angelegt – LV-Position, Einheit und Gewerk eintragen.", "ok");
  });
  document.getElementById("btnAufmassAusBauteilen").addEventListener("click", aufmassAusBauteilen);
  document.getElementById("btnAufmassZeile").addEventListener("click", () => {
    const blatt = gewaehltesAufmass();
    if (!blatt) { setStatus("Zuerst ein Aufmaßblatt anlegen.", "error"); return; }
    neueAufmassZeile(blatt);
    renderAufmass();
  });
  document.getElementById("btnAufmassLoeschen").addEventListener("click", () => {
    const blatt = gewaehltesAufmass();
    if (!blatt) return;
    model.aufmass.delete(blatt.id);
    renderAufmass();
    setStatus(`Aufmaßblatt ${blatt.pos || blatt.id} gelöscht.`, "ok");
  });
  document.getElementById("aufmassBlatt").addEventListener("change", renderAufmass);

  // Kopfdaten und Zeilen des Aufmaßblattes
  document.getElementById("viewBaustelle").addEventListener("change", (e) => {
    const ziel = e.target;
    if (ziel.dataset.am) {
      const blatt = model.aufmass.get(parseInt(ziel.dataset.am, 10));
      if (blatt) { blatt[ziel.dataset.feld] = ziel.value; renderAufmass(); }
      return;
    }
    if (ziel.dataset.amz) {
      const blatt = model.aufmass.get(parseInt(ziel.dataset.amz, 10));
      const zeile = blatt && blatt.zeilen[parseInt(ziel.dataset.zeile, 10)];
      if (zeile) { zeile[ziel.dataset.feld] = ziel.value; renderAufmass(); }
      return;
    }
    if (ziel.dataset.tag) {
      const tag = model.bautagebuch.get(parseInt(ziel.dataset.tag, 10));
      if (tag) { tag[ziel.dataset.feld] = ziel.value; renderBautagebuch(); }
      return;
    }
    if (ziel.dataset.tagl) {
      const tag = gewaehlterTag();
      const eintrag = tag && tag[ziel.dataset.tagl][parseInt(ziel.dataset.i, 10)];
      if (eintrag) { eintrag[ziel.dataset.feld] = ziel.value; renderBautagebuch(); }
    }
  });

  document.getElementById("viewBaustelle").addEventListener("click", (e) => {
    const zeileWeg = e.target.dataset.amzRemove;
    if (zeileWeg) {
      const blatt = model.aufmass.get(parseInt(zeileWeg, 10));
      if (blatt) { blatt.zeilen.splice(parseInt(e.target.dataset.zeile, 10), 1); renderAufmass(); }
      return;
    }
    const listeWeg = e.target.dataset.taglRemove;
    if (listeWeg) {
      const tag = gewaehlterTag();
      if (tag) { tag[listeWeg].splice(parseInt(e.target.dataset.i, 10), 1); renderBautagebuch(); }
    }
  });

  document.getElementById("btnTagNeu").addEventListener("click", neuerBautag);
  document.getElementById("tagAuswahl").addEventListener("change", renderBautagebuch);
  document.getElementById("btnTagLoeschen").addEventListener("click", () => {
    const tag = gewaehlterTag();
    if (!tag) return;
    model.bautagebuch.delete(tag.id);
    renderBautagebuch();
    setStatus(`Bautag ${tag.datum} gelöscht.`, "ok");
  });
  document.getElementById("btnTagFirma").addEventListener("click", () =>
    tagListeAnfuegen("firmen", { name: "HSD Hamburg GmbH", gewerk: "", stunden: "8" }));
  document.getElementById("btnTagGeraet").addEventListener("click", () =>
    tagListeAnfuegen("geraete", { name: "", anzahl: "1", stunden: "" }));
  document.getElementById("btnTagLeistung").addEventListener("click", () =>
    tagListeAnfuegen("leistungen", { bereich: "", lvPos: "", text: "" }));
  document.getElementById("btnTagLieferung").addEventListener("click", () =>
    tagListeAnfuegen("lieferungen", { text: "", lieferschein: "" }));
  document.getElementById("btnTagEreignis").addEventListener("click", () =>
    tagListeAnfuegen("ereignisse", { art: "behinderung", text: "", folge: "" }));
  document.getElementById("tagBemerkung").addEventListener("change", (e) => {
    const tag = gewaehlterTag();
    if (tag) tag.bemerkung = e.target.value;
  });

  /* ---- Blätter zeichnen */

  document.getElementById("btnAufmassblatt").addEventListener("click", () => {
    const blatt = gewaehltesAufmass();
    if (!blatt) { setStatus("Zuerst ein Aufmaßblatt anlegen.", "error"); return; }
    aufmassBlattId = blatt.id;
    const svg = aufmassblattSVG({
      position: blatt, auswertung: aufmassPosition(blatt),
      blattNr: aufmassBlaetter().indexOf(blatt) + 1,
      projekt: projektKopf(),
    });
    sheetArt = "aufmass";
    document.getElementById("sheetBody").innerHTML = svg;
    document.getElementById("sheetTitle").textContent = `Aufmaßblatt ${blatt.pos || ""} · ${blatt.kurztext || ""}`.trim();
    document.getElementById("sheetCounter").textContent =
      `${blatt.zeilen.length} Zeilen · Blatt ${aufmassBlaetter().indexOf(blatt) + 1} von ${model.aufmass.size}`;
    document.getElementById("sheetOverlay").hidden = false;
  });

  document.getElementById("btnTagesbericht").addEventListener("click", () => {
    const tag = gewaehlterTag();
    if (!tag) { setStatus("Zuerst einen Bautag anlegen.", "error"); return; }
    tagesberichtId = tag.id;
    const alle = bautage();
    const svg = bautagebuchSVG({
      eintrag: Object.assign({}, tag, { wochentag: wochentagVon(tag.datum) }),
      auswertung: bautagebuchTag(tag),
      nummer: alle.length - alle.indexOf(tag),
      projekt: projektKopf(),
    });
    sheetArt = "tagesbericht";
    document.getElementById("sheetBody").innerHTML = svg;
    document.getElementById("sheetTitle").textContent = `Tagesbericht ${tag.datum}`;
    document.getElementById("sheetCounter").textContent =
      `Bautag ${alle.indexOf(tag) + 1} von ${alle.length}`;
    document.getElementById("sheetOverlay").hidden = false;
  });

  /* ---- Ausgabe als CSV */

  document.getElementById("btnAufmassCsv").addEventListener("click", () => {
    if (!model.aufmass.size) { setStatus("Kein Aufmaß vorhanden.", "error"); return; }
    const rows = [["Aufmaß nach VOB/B § 14 – " + (document.getElementById("projectName").value || "Projekt")]];
    aufmassBlaetter().forEach((blatt) => {
      const a = aufmassPosition(blatt);
      rows.push([]);
      rows.push([`Position ${blatt.pos || "–"}`, blatt.kurztext || "", `Einheit ${a.einheit}`,
        a.atv, `Übermessung bis ${a.grenze.toFixed(2)} m² (${a.quelle})`]);
      rows.push(["Nr", "±", "Bezug", "Anzahl", "Länge", "Breite", "Höhe", "Formel",
        "Einzelgröße", "Menge", "wirksam", "Bemerkung"]);
      a.zeilen.forEach((z, i) => {
        rows.push([i + 1, z.istAbzug ? "−" : "+", z.bezug || "", z.anzahl || "", z.laenge || "",
          z.breite || "", z.hoehe || "", aufmassFormel(z, a.einheit),
          z.einzel > 0 ? z.einzel.toFixed(3) : "", z.menge.toFixed(3),
          z.uebermisst ? "übermessen" : z.wirksam.toFixed(3), z.bemerkung || ""]);
      });
      rows.push(["", "", "Zugang", "", "", "", "", "", "", a.zugang.toFixed(3), "", ""]);
      rows.push(["", "", "Abzug", "", "", "", "", "", "", a.abzug.toFixed(3), "", ""]);
      if (a.uebermessen > 0) rows.push(["", "", "übermessen", "", "", "", "", "", "", a.uebermessen.toFixed(3), "", ""]);
      rows.push(["", "", "Aufmaßsumme", "", "", "", "", "", "", a.summe.toFixed(3), a.einheit, ""]);
      if (a.ep > 0) rows.push(["", "", "Einheitspreis", a.ep.toFixed(2), "", "", "", "", "", a.betrag.toFixed(2), "€", ""]);
    });
    const gesamt = aufmassAufstellung(aufmassBlaetter());
    rows.push([]);
    rows.push(["Summe aller Aufmaßblätter", "", "", "", "", "", "", "", "", gesamt.betrag.toFixed(2), "€"]);
    const name = (document.getElementById("projectName").value || "Projekt").replace(/\s+/g, "_");
    saveFile(`Aufmass_${name}.csv`, "\ufeff" + zuCsv(rows), "text/csv;charset=utf-8;");
  });

  document.getElementById("btnTagebuchCsv").addEventListener("click", () => {
    if (!model.bautagebuch.size) { setStatus("Kein Bautag erfasst.", "error"); return; }
    const rows = [["Bautagebuch – " + (document.getElementById("projectName").value || "Projekt")]];
    rows.push([]);
    rows.push(["Datum", "Wochentag", "Bauabschnitt", "von", "bis", "Pause", "Wetter",
      "T morgens", "T mittags", "Niederschlag [mm]", "Wind", "Personen", "Mannstunden",
      "Regentag", "Frosttag", "Bauleiter"]);
    const alle = Array.from(model.bautagebuch.values())
      .sort((a, b) => String(a.datum || "").localeCompare(String(b.datum || "")));
    alle.forEach((tag) => {
      const a = bautagebuchTag(tag);
      rows.push([tag.datum || "", wochentagVon(tag.datum), tag.abschnitt || "", tag.von || "",
        tag.bis || "", tag.pause || "", a.wetter.lage.name,
        tag.tempFrueh || "", tag.tempMittag || "", tag.niederschlag || "", tag.wind || "",
        a.personal, a.mannstunden.toFixed(1), a.wetter.regentag ? "ja" : "nein",
        a.wetter.frosttag ? "ja" : "nein", tag.bauleiter || ""]);
      a.firmen.forEach((f) => rows.push(["", "Firma", f.name || "", f.gewerk || "",
        `${f.kopfzahl} Personen`, `${f.stunden} h/Person`, `${f.mannstunden.toFixed(1)} Mannstunden`]));
      a.geraete.forEach((g) => rows.push(["", "Gerät", g.name || "", g.anzahl, `${g.stunden} h`]));
      a.leistungen.forEach((l) => rows.push(["", "Leistung", l.bereich || "", l.lvPos || "", l.text || ""]));
      a.lieferungen.forEach((l) => rows.push(["", "Lieferung", l.text || "", l.lieferschein || ""]));
      a.ereignisse.forEach((e) => rows.push(["", "Vorkommnis", e.artName, e.text || "", e.folge || "",
        e.vorschrift, e.frist]));
      if (tag.bemerkung) rows.push(["", "Bemerkung", tag.bemerkung]);
    });
    const z = bautagebuchZeitraum(alle);
    rows.push([]);
    rows.push(["Auswertung", `${z.von} bis ${z.bis}`]);
    rows.push(["erfasste Tage", z.tage, "Arbeitstage", z.arbeitstage, "Ausfalltage", z.ausfalltage]);
    rows.push(["Regentage", z.regentage, "Frosttage", z.frosttage,
      "Tage mit Behinderung", z.behinderungstage, "Tage mit Anordnung des AG", z.nachtragstage]);
    rows.push(["Mannstunden gesamt", z.mannstunden.toFixed(1)]);
    rows.push([]);
    rows.push(["Firma", "Gewerk", "Einsatztage", "größte Personalstärke", "Mannstunden"]);
    z.firmen.forEach((f) => rows.push([f.name, f.gewerk || "", f.tage, f.maxKopf, f.mannstunden.toFixed(1)]));
    const name = (document.getElementById("projectName").value || "Projekt").replace(/\s+/g, "_");
    saveFile(`Bautagebuch_${name}.csv`, "\ufeff" + zuCsv(rows), "text/csv;charset=utf-8;");
  });

  /* --------------------------------------------------------- Werkzeugleiste */

  document.getElementById("btnDraw").addEventListener("click", () => setMode("draw"));
  document.getElementById("btnOrbit").addEventListener("click", () => setMode("orbit"));
  document.getElementById("btnSupport").addEventListener("click", () => setMode("support"));
  document.getElementById("btnLoad").addEventListener("click", () => setMode("load"));

  document.getElementById("planeAxis").addEventListener("change", (e) => {
    sketch.setWorkPlane(e.target.value, parseFloat(document.getElementById("planeOffset").value) || 0);
    updatePlaneInfo();
  });
  document.getElementById("planeOffset").addEventListener("change", (e) => {
    sketch.setWorkPlane(document.getElementById("planeAxis").value, parseFloat(e.target.value) || 0);
    updatePlaneInfo();
  });
  document.getElementById("gridStep").addEventListener("change", updatePlaneInfo);

  function updatePlaneInfo() {
    const axis = document.getElementById("planeAxis").value;
    const offset = parseFloat(document.getElementById("planeOffset").value) || 0;
    const step = parseFloat(document.getElementById("gridStep").value) || 0.5;
    const name = { XY: "Ansicht X–Y", XZ: "Grundriss X–Z", ZY: "Seite Z–Y" }[axis];
    document.getElementById("scaleInfo").textContent =
      `Arbeitsebene ${name} bei ${offset.toFixed(2)} m · Raster ${step.toFixed(2)} m`;
  }

  document.getElementById("btnFit").addEventListener("click", () => {
    if (model.nodes.length) sketch.frameContent(model.nodes);
  });

  document.getElementById("btnClearAll").addEventListener("click", () => {
    if (model.members.size === 0) return;
    askConfirm("Alles löschen", "Das gesamte Modell mit Stäben, Auflagern und Lasten wirklich löschen?")
      .then((confirmed) => {
        if (!confirmed) return;
        clearModel();
        refreshAll();
        setStatus("Modell gelöscht.", "info");
      });
  });

  /* -------------------------------------------------------------- Beispiele */

  /** Ebener Parallelbinder (Pratt), 10,00 m Stützweite, 1,50 m Systemhöhe. */
  function loadExamplePlanar() {
    clearModel();
    const xs = [0, 2.5, 5, 7.5, 10];
    const yU = 0, yO = 1.5;
    const bottom = xs.map((x) => findOrCreateNode({ x, y: yU, z: 0 }));
    const top = xs.map((x) => findOrCreateNode({ x, y: yO, z: 0 }));

    for (let i = 0; i < 4; i++) {
      addMember(bottom[i], bottom[i + 1], "Untergurt");
      addMember(top[i], top[i + 1], "Obergurt");
    }
    xs.forEach((_, i) => addMember(bottom[i], top[i], "Druckstrebe"));
    addMember(top[0], bottom[1], "Zugstrebe");
    addMember(top[1], bottom[2], "Zugstrebe");
    addMember(top[3], bottom[2], "Zugstrebe");
    addMember(top[4], bottom[3], "Zugstrebe");

    model.supports.set(bottom[0], "pinned");
    model.supports.set(bottom[4], "roller");
    [10, 20, 20, 20, 10].forEach((kN, i) => model.loads.set(top[i], { fx: 0, fy: -kN, fz: 0 }));

    sketch.setWorkPlane("XY", 0);
    document.getElementById("planeAxis").value = "XY";
    updatePlaneInfo();
    sketch.frameContent(model.nodes);
    computeBarForces();
  }

  /** Räumliches Dreibein: 3 Fußpunkte, ein Kopfpunkt - statisch bestimmt (m + r = 3n). */
  function loadExampleSpatial() {
    clearModel();
    const r = 2.5;
    const feet = [0, 1, 2].map((k) => {
      const a = (k / 3) * Math.PI * 2;
      return findOrCreateNode({ x: +(r * Math.cos(a)).toFixed(2), y: 0, z: +(r * Math.sin(a)).toFixed(2) });
    });
    const apex = findOrCreateNode({ x: 0, y: 4, z: 0 });
    feet.forEach((f) => addMember(f, apex, "Stütze"));
    feet.forEach((f) => model.supports.set(f, "pinned"));
    model.loads.set(apex, { fx: 0, fy: -120, fz: 0 });

    sketch.frameContent(model.nodes);
    computeBarForces();
  }

  document.getElementById("btnExample").addEventListener("click", () => {
    const spatial = model.members.size > 0 && lastSolution && lastSolution.dimension === 2;
    if (spatial) loadExampleSpatial();
    else loadExamplePlanar();
  });

  /* ------------------------------------------------ Speichern und Exportieren */

  let platformDownloads = null;
  if (window.claude && typeof window.claude.use === "function") {
    window.claude.use("downloads").then((api) => { platformDownloads = api; }).catch(() => {});
  }

  /** Zuletzt erzeugte Datei – Grundlage für „Weitergeben". */
  let letzteDatei = null;

  /**
   * Datei sichern. Auf iPadOS und Android muss der Anker im Dokument liegen
   * und die Objekt-URL darf erst nach dem Klick freigegeben werden; sonst
   * bricht der Browser den Download ab, ohne es zu melden.
   */
  function saveFile(filename, content, mime) {
    const typ = mime || "text/csv;charset=utf-8;";
    letzteDatei = { filename, content, mime: typ };
    aktualisiereTeilenKnopf();

    // Windows-Anwendung: Datei-Dialog von Windows statt Browser-Download
    if (window.hsd && typeof window.hsd.speichern === "function") {
      window.hsd.speichern(filename, content).then((ergebnis) => {
        if (!ergebnis || ergebnis.abgebrochen) return;
        if (ergebnis.ok) setStatus(`Gesichert: ${ergebnis.pfad}`, "ok");
      });
      return;
    }
    if (platformDownloads) {
      platformDownloads.save({ filename, data: content }).catch((err) => {
        if (err && err.code === "declined") return;
        window.console.warn("Download nicht möglich:", err);
      });
      return;
    }
    const blob = new Blob([content], { type: typ });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    window.setTimeout(() => {
      if (a.parentNode) a.parentNode.removeChild(a);
      URL.revokeObjectURL(url);
    }, 4000);
  }

  /** Kann der Browser Dateien über das Systemmenü weitergeben (iPadOS, Android)? */
  function kannTeilen(datei) {
    if (!datei || !navigator.canShare || !navigator.share) return false;
    try {
      return navigator.canShare({ files: [new File([datei.content], datei.filename, { type: datei.mime })] });
    } catch (e) {
      return false;
    }
  }

  /**
   * Datei über das Systemmenü weitergeben: AirDrop an ein anderes Tablet,
   * „In Dateien sichern", Mail, Teams. Muss unmittelbar aus dem Klick heraus
   * aufgerufen werden, sonst verweigert der Browser die Freigabe.
   */
  function teileDatei(datei) {
    if (!datei) return;
    const file = new File([datei.content], datei.filename, { type: datei.mime });
    navigator.share({ files: [file], title: datei.filename })
      .catch((err) => {
        if (err && (err.name === "AbortError" || err.name === "NotAllowedError")) return;
        setStatus("Weitergeben nicht möglich – die Datei liegt im Ordner „Downloads“.", "error");
      });
  }

  /** Beherrscht das Gerät die Dateiweitergabe überhaupt (iPadOS, Android)? */
  const geraetKannTeilen = kannTeilen({
    filename: "probe.txt", content: "probe", mime: "text/plain",
  });

  /** Der Knopf „Weitergeben" erscheint nur, wenn das Gerät es beherrscht. */
  function aktualisiereTeilenKnopf() {
    const knopf = document.getElementById("btnTeilen");
    if (!knopf) return;
    const moeglich = kannTeilen(letzteDatei);
    knopf.hidden = !moeglich;
    if (moeglich) knopf.title = `„${letzteDatei.filename}“ an ein anderes Gerät geben`;
  }
  document.getElementById("sheetTeilen").hidden = !geraetKannTeilen;

  function collectProject() {
    const field = (id) => document.getElementById(id).value;
    return {
      version: 2,
      erzeugt: new Date().toISOString(),
      projekt: {
        name: field("projectName"), datum: field("projectDate"), stahlguete: field("steelGradeGlobal"),
        nationalerAnhang: field("naSelect"), nettoquerschnitt: field("netRatio"),
      },
      kosten: {
        material: field("pricePerKg"), bearbeitung: field("processingPerKg"),
        transport: field("transportFlat"), lagerung: field("storagePerKg"),
      },
      werkstatt: { zugabe: field("cutAllowance"), lagerlaenge: field("stockLength"), saegeschnitt: field("sawKerf") },
      eigengewicht: { aktiv: document.getElementById("chkSelfWeight").checked, gammaG: field("gammaG") },
      knoten: model.nodes,
      staebe: Array.from(model.members.values()),
      auflager: Array.from(model.supports.entries()),
      lasten: Array.from(model.loads.entries()),
      naechsteId: model.nextId,
      bauteile: Array.from(model.elements.values()),
      naechsteBauteilId: model.nextElementId,
      oeffnungen: Array.from(model.openings.values()),
      naechsteOeffnungId: model.nextOpeningId,
      abzuege: Array.from(model.abzuege.values()),
      naechsteAbzugId: model.nextAbzugId,
      betonteile: Array.from(model.beton.values()),
      anschluesse: Array.from(model.anschluesse.values()),
      naechsteAnschlussId: model.nextAnschlussId,
      fertigteile: Array.from(model.fertigteile.values()),
      naechsteFertigteilId: model.nextFertigteilId,
      aufmass: Array.from(model.aufmass.values()),
      naechsteAufmassId: model.nextAufmassId,
      bautagebuch: Array.from(model.bautagebuch.values()),
      naechsteTagId: model.nextTagId,
      naechsteBetonId: model.nextBetonId,
      naechsteAussparungId: model.nextAussparungId,
      achsraster: rasterVorgabe(),
      // Höhenpunkte des Geländemodells; das Netz wird beim Öffnen neu gebildet
      hoehenpunkte: dgmPunkte,
      // Baustellenlogistik: Eingaben gehören zum Projekt, gerechnet wird neu
      logistik: {
        huebe: logistikHuebe, flaechen: logistikFlaechen, vorgaenge: bauVorgaenge,
        kran: {
          x: field("kranX"), y: field("kranY"), hakenhoehe: field("kranHakenhoehe"),
          anschlagmittel: field("kranAnschlagmittel"), zuschlag: field("kranZuschlag"),
          kurve: field("kranKurve"),
        },
        einrichtung: {
          beschaeftigte: field("beBeschaeftigte"), bauleitung: field("beBauleitung"),
          lagerflaeche: field("beLagerflaeche"), personenJeToilette: field("bePersonenToilette"),
          personenJeWaschplatz: field("bePersonenWaschplatz"),
        },
        beginn: field("bauStart"),
      },
      // Tiefbau: Achse, Gradiente und Gelände gehören zum Projekt.
      // Die Punktwolke des Bestands nicht – sie wäre zu groß.
      tiefbau: {
        achse: tiefbau.achse, gradiente: tiefbau.gradiente, gelaende: tiefbau.gelaende,
        start: {
          x: field("achseStartX"), y: field("achseStartY"),
          richtung: field("achseStartRichtung"), station: field("achseStartStation"),
        },
        querschnitt: {
          fahrbahn: field("qsFahrbahn"), querneigung: field("qsQuerneigung"),
          dach: field("qsDach"), bankett: field("qsBankett"),
          bankettNeigung: field("qsBankettNeigung"), oberbau: field("qsOberbau"),
          oberboden: field("qsOberboden"), boeschungAuftrag: field("qsBoeschungAuftrag"),
          boeschungAbtrag: field("qsBoeschungAbtrag"), profilAbstand: field("profilAbstand"),
        },
        boden: {
          art: field("bodenArt"), auflockerung: field("bodenAuflockerung"),
          verdichtung: field("bodenVerdichtung"), wieder: field("bodenWieder"),
          transportKm: field("transportKm"), transportPreis: field("transportPreis"),
        },
      },
      betonbau: {
        arbeitsraum: field("arbeitsraum"), preisBeton: field("preisBeton"),
        preisSchalung: field("preisSchalung"), preisBewehrung: field("preisBewehrung"),
        preisAushub: field("preisAushub"), lieferlaenge: field("lieferlaenge"),
        stossFaktor: field("stossFaktor"), haken: field("hakenAktiv"), stahlKosten: field("stahllisteKosten"),
      },
      flaechenregel: {
        regel: field("abzugRegel"), mindestFlaeche: field("grenzFlaeche"),
        mindestHoehe: field("grenzHoehe"), mindestNischentiefe: field("grenzTiefe"),
      },
      baustoffpreise: materialPreise,
    };
  }

  function applyProject(data) {
    if (!data || !Array.isArray(data.knoten) || !Array.isArray(data.staebe)) {
      throw new Error("Ungültige oder ältere Projektdatei (2D-Format)");
    }
    clearModel();
    model.nodes = data.knoten.map((n) => ({ x: n.x, y: n.y, z: n.z }));
    data.staebe.forEach((m) => model.members.set(m.id, { ...m }));
    (data.auflager || []).forEach(([i, type]) => model.supports.set(Number(i), type));
    (data.lasten || []).forEach(([i, load]) => model.loads.set(Number(i), load));
    model.nextId = data.naechsteId || (Math.max(0, ...data.staebe.map((m) => m.id)) + 1);
    (data.bauteile || []).forEach((el) => model.elements.set(el.id, el));
    model.nextElementId = data.naechsteBauteilId || (model.elements.size + 1);
    (data.oeffnungen || []).forEach((o) => model.openings.set(o.id, o));
    model.nextOpeningId = data.naechsteOeffnungId || (model.openings.size + 1);
    (data.abzuege || []).forEach((a) => model.abzuege.set(a.id, a));
    model.nextAbzugId = data.naechsteAbzugId || (model.abzuege.size + 1);
    (data.betonteile || []).forEach((b) => model.beton.set(b.id, b));
    model.nextBetonId = data.naechsteBetonId || (model.beton.size + 1);
    (data.anschluesse || []).forEach((a) => model.anschluesse.set(a.id, a));
    (data.fertigteile || []).forEach((t) => model.fertigteile.set(t.id, t));
    model.nextFertigteilId = data.naechsteFertigteilId
      || (Math.max(0, ...(data.fertigteile || []).map((t) => t.id)) + 1);
    model.nextAnschlussId = data.naechsteAnschlussId
      || (Math.max(0, ...(data.anschluesse || []).map((a) => a.id)) + 1);
    (data.aufmass || []).forEach((a) => model.aufmass.set(a.id, a));
    model.nextAufmassId = data.naechsteAufmassId
      || (Math.max(0, ...(data.aufmass || []).map((a) => a.id)) + 1);
    (data.bautagebuch || []).forEach((t) => model.bautagebuch.set(t.id, t));
    model.nextTagId = data.naechsteTagId
      || (Math.max(0, ...(data.bautagebuch || []).map((t) => t.id)) + 1);
    model.nextAussparungId = data.naechsteAussparungId || 1;
    // Tiefbau
    tiefbau.achse = (data.tiefbau && data.tiefbau.achse) || [];
    tiefbau.gradiente = (data.tiefbau && data.tiefbau.gradiente) || [];
    tiefbau.gelaende = (data.tiefbau && data.tiefbau.gelaende) || [];
    tiefbauErgebnis = null;
    dgmPunkte = (data.hoehenpunkte || []).slice();
    dgm = null; dgmLinien = []; dgmVolumenErgebnis = null;
    // Baustellenlogistik
    const lg = data.logistik || {};
    logistikHuebe = (lg.huebe || []).map((h) => Object.assign({}, h));
    logistikFlaechen = (lg.flaechen || []).map((f) => Object.assign({}, f));
    bauVorgaenge = (lg.vorgaenge || []).map((v) => Object.assign({}, v,
      { vorgaenger: (v.vorgaenger || []).map((x) => Object.assign({}, x)) }));
    kranErgebnis = null; beErgebnis = null; bauErgebnis = null;
    Object.keys(materialPreise).forEach((k) => delete materialPreise[k]);
    Object.assign(materialPreise, data.baustoffpreise || {});

    const set = (id, value, fallback) => { if (value !== undefined) document.getElementById(id).value = value !== null ? value : fallback; };
    if (data.projekt) {
      set("projectName", data.projekt.name, "");
      set("projectDate", data.projekt.datum, "");
      set("steelGradeGlobal", data.projekt.stahlguete, "S235");
      set("naSelect", data.projekt.nationalerAnhang, "DE");
      set("netRatio", data.projekt.nettoquerschnitt, "100");
    }
    if (data.kosten) {
      set("pricePerKg", data.kosten.material);
      set("processingPerKg", data.kosten.bearbeitung);
      set("transportFlat", data.kosten.transport);
      set("storagePerKg", data.kosten.lagerung);
    }
    if (data.werkstatt) {
      set("cutAllowance", data.werkstatt.zugabe);
      set("stockLength", data.werkstatt.lagerlaenge);
      set("sawKerf", data.werkstatt.saegeschnitt);
    }
    if (data.achsraster) {
      set("rasterX0", data.achsraster.x0, "0");
      set("rasterZ0", data.achsraster.z0, "0");
      set("rasterFelderX", data.achsraster.felderX, "6,00 6,00 6,00");
      set("rasterFelderZ", data.achsraster.felderZ, "6,00 6,00");
      set("rasterBeschriftungX", data.achsraster.beschriftungX, "zahlen");
      set("rasterBeschriftungZ", data.achsraster.beschriftungZ, "buchstaben");
      set("rasterToleranz", data.achsraster.toleranz, "0.05");
    }
    if (data.tiefbau) {
      const t = data.tiefbau;
      if (t.start) {
        set("achseStartX", t.start.x, "0"); set("achseStartY", t.start.y, "0");
        set("achseStartRichtung", t.start.richtung, "0"); set("achseStartStation", t.start.station, "0");
      }
      if (t.querschnitt) {
        const q = t.querschnitt;
        set("qsFahrbahn", q.fahrbahn, "6.50"); set("qsQuerneigung", q.querneigung, "2.5");
        set("qsDach", q.dach, "dach"); set("qsBankett", q.bankett, "1.50");
        set("qsBankettNeigung", q.bankettNeigung, "12"); set("qsOberbau", q.oberbau, "0.55");
        set("qsOberboden", q.oberboden, "0.25");
        set("qsBoeschungAuftrag", q.boeschungAuftrag, "1.5");
        set("qsBoeschungAbtrag", q.boeschungAbtrag, "1.5");
        set("profilAbstand", q.profilAbstand, "20");
      }
      if (t.boden) {
        set("bodenArt", t.boden.art, "lehm");
        set("bodenAuflockerung", t.boden.auflockerung, "1.25");
        set("bodenVerdichtung", t.boden.verdichtung, "0.92");
        set("bodenWieder", t.boden.wieder, "60");
        set("transportKm", t.boden.transportKm, "12");
        set("transportPreis", t.boden.transportPreis, "0.35");
      }
    }
    if (data.logistik) {
      const lgd = data.logistik;
      if (lgd.kran) {
        set("kranX", lgd.kran.x, "30"); set("kranY", lgd.kran.y, "19");
        set("kranHakenhoehe", lgd.kran.hakenhoehe, "32");
        set("kranAnschlagmittel", lgd.kran.anschlagmittel, "200");
        set("kranZuschlag", lgd.kran.zuschlag, "1.05");
        set("kranKurve", lgd.kran.kurve, "2.5:8 20:8 30:5.2 40:3.7 50:2.8");
      }
      if (lgd.einrichtung) {
        set("beBeschaeftigte", lgd.einrichtung.beschaeftigte, "24");
        set("beBauleitung", lgd.einrichtung.bauleitung, "2");
        set("beLagerflaeche", lgd.einrichtung.lagerflaeche, "120");
        set("bePersonenToilette", lgd.einrichtung.personenJeToilette, "10");
        set("bePersonenWaschplatz", lgd.einrichtung.personenJeWaschplatz, "5");
      }
      set("bauStart", lgd.beginn, "");
    }
    if (data.betonbau) {
      set("arbeitsraum", data.betonbau.arbeitsraum, "0.50");
      set("preisBeton", data.betonbau.preisBeton, "130");
      set("preisSchalung", data.betonbau.preisSchalung, "45");
      set("preisBewehrung", data.betonbau.preisBewehrung, "1300");
      set("preisAushub", data.betonbau.preisAushub, "25");
      set("lieferlaenge", data.betonbau.lieferlaenge, "12");
      set("stossFaktor", data.betonbau.stossFaktor, "50");
      set("hakenAktiv", data.betonbau.haken, "ja");
      set("stahllisteKosten", data.betonbau.stahlKosten, "grad");
    }
    if (data.flaechenregel) {
      set("abzugRegel", data.flaechenregel.regel, "woflv");
      set("grenzFlaeche", data.flaechenregel.mindestFlaeche, "0.10");
      set("grenzHoehe", data.flaechenregel.mindestHoehe, "1.50");
      set("grenzTiefe", data.flaechenregel.mindestNischentiefe, "0.13");
    }
    if (data.eigengewicht) {
      document.getElementById("chkSelfWeight").checked = !!data.eigengewicht.aktiv;
      set("gammaG", data.eigengewicht.gammaG, "1.35");
    }
    applyDesignParameters();
    if (model.nodes.length) sketch.frameContent(model.nodes);
    refreshAll();
  }

  document.getElementById("btnSaveProject").addEventListener("click", () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(collectProject()));
      setStatus(`Projekt im Browser gesichert (${model.members.size} Bauteile, ${new Date().toLocaleString("de-DE")}).`, "ok");
    } catch (err) {
      setStatus("Speichern im Browser nicht möglich (Speicher gesperrt oder voll). Nutzen Sie „Projektdatei“.", "error");
    }
  });

  document.getElementById("btnLoadProject").addEventListener("click", () => {
    let raw = null;
    try { raw = window.localStorage.getItem(STORAGE_KEY); }
    catch (err) { setStatus("Zugriff auf den Browser-Speicher nicht möglich.", "error"); return; }
    if (!raw) { setStatus("Kein gespeichertes Projekt gefunden.", "error"); return; }
    try {
      applyProject(JSON.parse(raw));
      setStatus("Gespeichertes Projekt geladen. Stabkräfte bei Bedarf neu berechnen.", "ok");
    } catch (err) {
      setStatus("Gespeichertes Projekt konnte nicht gelesen werden: " + err.message, "error");
    }
  });

  document.getElementById("btnExportProject").addEventListener("click", () => {
    const name = document.getElementById("projectName").value || "Projekt";
    saveFile(`Stahlbau_${name.replace(/\s+/g, "_")}.json`, JSON.stringify(collectProject(), null, 2), "application/json");
  });

  document.getElementById("btnTeilen").addEventListener("click", () => teileDatei(letzteDatei));

  const fileInput = document.getElementById("projectFileInput");
  /** Geladene Projektdatei übernehmen und melden. */
  function uebernehmeProjektdatei(name, inhalt) {
    try {
      applyProject(JSON.parse(String(inhalt)));
      setStatus(`Projektdatei „${name}“ geladen.`, "ok");
    } catch (err) {
      setStatus("Datei konnte nicht gelesen werden: " + err.message, "error");
    }
  }

  document.getElementById("btnImportProject").addEventListener("click", () => {
    if (window.hsd && typeof window.hsd.oeffnen === "function") {
      window.hsd.oeffnen().then((datei) => {
        if (datei) uebernehmeProjektdatei(datei.name, datei.inhalt);
      });
      return;
    }
    fileInput.click();
  });
  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      uebernehmeProjektdatei(file.name, reader.result);
      fileInput.value = "";
    };
    reader.readAsText(file);
  });

  document.getElementById("btnExportCsv").addEventListener("click", () => {
    const rows = [["Pos", "Bauteil", "Typ", "Länge [m]", "Beanspruchung", "Kraft/Moment", "Profil", "Auslastung [%]", "Gewicht gesamt [kg]", "Status"]];
    let i = 1;
    model.members.forEach((member) => {
      const design = designMember(member);
      rows.push([i++, memberLabel(member), member.type, memberLength(member).toFixed(2), member.loadType,
        member.loadType === "Biegung" ? member.moment + " kNm" : member.force + " kN",
        design.profileName, (design.utilization * 100).toFixed(0), design.totalWeight.toFixed(1), design.status]);
    });

    const cutList = buildCutList();
    if (cutList.length) {
      rows.push([]);
      rows.push([`Stückliste (Zuschnittlängen aus Systemlängen, Zugabe ${document.getElementById("cutAllowance").value} mm)`]);
      rows.push(["Pos", "Profil", "Güte", "Zuschnittlänge [mm]", "Stück", "Gewicht/Stück [kg]", "Gewicht gesamt [kg]", "Bauteile"]);
      cutList.forEach((group, k) => {
        const w = (group.weightPerMeter * group.cutLength) / 1000;
        rows.push([k + 1, group.profile, group.grade, group.cutLength, group.count, w.toFixed(1), (w * group.count).toFixed(1), group.labels.join(" ")]);
      });
      rows.push([]);
      rows.push([`Zuschnittplan (Lagerlänge ${document.getElementById("stockLength").value} m, Sägeschnitt ${document.getElementById("sawKerf").value} mm)`]);
      rows.push(["Profil", "Stangen", "Verschnitt [m]", "Verschnitt [%]", "Belegung [mm]"]);
      buildCutPlan(cutList).forEach((plan) => {
        rows.push([plan.profile, `${plan.barCount} x ${(plan.stockMm / 1000).toFixed(2)} m`,
          (plan.wasteMm / 1000).toFixed(2), plan.wastePercent.toFixed(1),
          plan.bars.map((bar, k) => `St${k + 1}: ${bar.stuecke.join("+")} (Rest ${Math.round(bar.rest)})`).join(" | ")]);
      });
    }

    if (lastSolution && lastSolution.ok) {
      rows.push([]);
      rows.push(["Anschlusskräfte je Knoten (+ Zug / − Druck)"]);
      rows.push(["Knoten", "x [m]", "y [m]", "z [m]", "Auflager", "Knotenlast [kN]", "Eigengewicht [kN]", "Anschlüsse", "max |N| [kN]"]);
      model.nodes.forEach((node, index) => {
        const attached = Array.from(model.members.values()).filter((m) => m.a === index || m.b === index);
        const entries = attached.map((m) => {
          const N = lastSolution.forces[m.id] || 0;
          return `${memberLabel(m)} ${N >= 0 ? "+" : "-"}${Math.abs(N).toFixed(1)}`;
        });
        const maxN = attached.reduce((max, m) => Math.max(max, Math.abs(lastSolution.forces[m.id] || 0)), 0);
        const support = model.supports.get(index);
        const reactions = lastSolution.reactions.filter((r) => r.node === index)
          .map((r) => `${r.dir === "y" ? "V" : "H"} ${Math.abs(r.value).toFixed(1)} kN`).join(" / ");
        const load = model.loads.get(index);
        rows.push(["K" + (index + 1), node.x.toFixed(2), node.y.toFixed(2), node.z.toFixed(2),
          support ? `${support === "pinned" ? "Festlager" : "Loslager"} ${reactions}` : "-",
          load ? Math.abs(load.fy) : 0, (selfWeightLoads[index] || 0).toFixed(2), entries.join(" | "), maxN.toFixed(1)]);
      });
    }

    const positionen = positionsFiguren();
    if (positionen.figuren.length) {
      const a = positionen.achsen;
      rows.push([]);
      rows.push([`Positionsliste mit Achsbezug (Achsen x: ${a.x.map((x) => `${x.name}=${x.wert.toFixed(2)}`).join(" ")} | Achsen z: ${a.z.map((z) => `${z.name}=${z.wert.toFixed(2)}`).join(" ")} | Toleranz ${(a.toleranz * 100).toFixed(0)} cm)`]);
      rows.push(["Pos", "Gewerk", "Bauteil", "Abmessung / Profil", "Menge", "Achsbezug", "x [m]", "z [m]"]);
      positionen.figuren.forEach((f) => {
        rows.push([f.bezeichnung, f.kategorie, f.typName || "-", f.beschreibung || "-", f.menge || "-",
          f.bezug ? f.bezug.text : "-", f.mitte.x.toFixed(2), f.mitte.z.toFixed(2)]);
      });
    }

    if (model.elements.size) {
      rows.push([]);
      rows.push(["Architektur-Bauteile (Mengen nach Geometrie, U-Wert nach DIN EN ISO 6946)"]);
      rows.push(["Bauteil", "Typ", "Stück", "Fläche brutto [m²]", "Öffnungen [m²]", "Fläche netto [m²]", "Dicke [m]", "Volumen [m³]", "Masse [kg]", "U Bauteil [W/m²K]", "U mittel [W/m²K]", "Zielwert", "flächenbez. Masse [kg/m²]", "Aufbau"]);
      model.elements.forEach((element) => {
        const a = auswertung(element);
        rows.push([bauteilBezeichnung(element), a.typName, element.anzahl, a.flaecheBrutto.toFixed(2),
          a.oeffnungsFlaeche.toFixed(2), a.flaecheGesamt.toFixed(2),
          a.geometrie.dicke.toFixed(3), a.volumenGesamt.toFixed(2), a.masseGesamt.toFixed(0),
          a.uWert === null ? "-" : a.uWert.toFixed(3), a.uMittel === null ? "-" : a.uMittel.toFixed(3),
          element.zielU || "-", a.flaechenmasse.toFixed(0),
          a.schichten.map((l) => `${l.name} ${(l.d * 1000).toFixed(0)} mm`).join(" | ")]);
      });

      if (model.openings.size) {
        rows.push([]);
        rows.push(["Fenster und Türen (U-Werte nach Leistungserklärung DIN EN 14351-1)"]);
        rows.push(["Pos", "Bauteil", "Typ", "Breite [m]", "Höhe [m]", "Brüstung [m]", "Abstand [m]", "Achsabstand [m]", "Stück", "Fläche [m²]", "U [W/m²K]", "Preis je Stück [€]", "Kosten [€]"]);
        model.openings.forEach((o) => {
          const element = model.elements.get(o.elementId);
          const faktor = element ? (element.anzahl || 1) : 1;
          const stueck = (o.anzahl || 1) * faktor;
          rows.push(["F" + o.id, element ? bauteilBezeichnung(element) : "-",
            OEFFNUNGSTYPEN[o.typ] ? OEFFNUNGSTYPEN[o.typ].name : o.typ,
            o.breite.toFixed(2), o.hoehe.toFixed(2), o.bruestung.toFixed(2),
            o.abstand === null || o.abstand === undefined ? "gleichmäßig verteilt" : o.abstand.toFixed(2),
            o.raster === null || o.raster === undefined ? "-" : o.raster.toFixed(2), stueck,
            (o.breite * o.hoehe * stueck).toFixed(2), oeffnungWert(o, "u"),
            oeffnungWert(o, "preis"), (oeffnungWert(o, "preis") * stueck).toFixed(2)]);
        });
      }

      const raeume = raumListe();
      if (raeume.length) {
        rows.push([]);
        rows.push([`Räume (lichte Maße nach DIN 277-1, Netto-Raumfläche nach ${abzugRegelText()})`]);
        rows.push(["Raum", "NRF [m²]", "Lichte Fläche [m²]", "Abzug [m²]", "Zuschlag [m²]", "Achsfläche [m²]",
          "Wandanteil [m²]", "Umfang licht [m]", "Begrenzende Wände"]);
        let summeNetto = 0, summeLicht = 0, summeAchs = 0, summeAbzug = 0, summeZuschlag = 0;
        raeume.forEach(({ raum, licht, bilanz }, i) => {
          summeNetto += licht.ok ? bilanz.netto : 0;
          summeLicht += licht.ok ? licht.flaeche : 0;
          summeAchs += raum.flaeche;
          summeAbzug += bilanz.abzug;
          summeZuschlag += bilanz.zuschlag;
          const namen = [];
          raum.waende.forEach((w) => {
            const name = w ? bauteilBezeichnung(w) : null;
            if (name && namen.indexOf(name) === -1) namen.push(name);
          });
          rows.push(["R" + (i + 1), licht.ok ? bilanz.netto.toFixed(2) : "-",
            licht.ok ? licht.flaeche.toFixed(2) : "-",
            bilanz.abzug.toFixed(2), bilanz.zuschlag.toFixed(2), raum.flaeche.toFixed(2),
            licht.ok ? (raum.flaeche - licht.flaeche).toFixed(2) : "-",
            licht.ok ? licht.umfang.toFixed(2) : "-", namen.join(" ")]);
        });
        rows.push(["Summe", summeNetto.toFixed(2), summeLicht.toFixed(2), summeAbzug.toFixed(2),
          summeZuschlag.toFixed(2), summeAchs.toFixed(2), "", "", ""]);

        if (model.abzuege.size) {
          const regel = abzugRegel();
          const grenzen = abzugGrenzen();
          rows.push([]);
          rows.push([`Abzüge und Nischen (Schwellenwerte: Grundfläche > ${grenzen.mindestFlaeche.toFixed(2)} m², Höhe > ${grenzen.mindestHoehe.toFixed(2)} m, Nischentiefe > ${grenzen.mindestNischentiefe.toFixed(2)} m)`]);
          rows.push(["Pos", "Raum", "Art", "Breite [m]", "Tiefe [m]", "Höhe [m]", "Stück", "bis Fußboden",
            "Fläche [m²]", "Wirkung", "Begründung", "Bemerkung"]);
          model.abzuege.forEach((a) => {
            const w = abzugsWirkung(a, regel, grenzen);
            const istNische = ABZUGSTYPEN[a.typ] && ABZUGSTYPEN[a.typ].wirkung === "zuschlag";
            rows.push(["A" + a.id, "R" + a.raum, ABZUGSTYPEN[a.typ] ? ABZUGSTYPEN[a.typ].name : a.typ,
              (a.breite || 0).toFixed(2), (a.tiefe || 0).toFixed(2), (a.hoehe || 0).toFixed(2), a.anzahl,
              istNische ? (a.bisFussboden ? "ja" : "nein") : "-",
              (w.einzelflaeche * Math.max(1, a.anzahl || 1)).toFixed(3),
              w.art === "abzug" ? "-" + w.flaeche.toFixed(2) : w.art === "zuschlag" ? "+" + w.flaeche.toFixed(2) : "ohne Wirkung",
              w.hinweis, a.bemerkung || ""]);
          });
        }
      }

      rows.push([]);
      rows.push(["Materialaufstellung Architektur"]);
      rows.push(["Gruppe", "Baustoff", "Rohdichte [kg/m³]", "Volumen [m³]", "Masse [t]", "Preis [€/m³]", "Kosten [€]"]);
      materialAufstellung(Array.from(model.elements.values()), materialPreise, oeffnungenVon).forEach((e) => {
        rows.push([e.gruppe, e.name, e.rho, e.volumen.toFixed(2), (e.masse / 1000).toFixed(2), e.preis, e.kosten.toFixed(2)]);
      });
    }

    if (model.beton.size) {
      const raum = arbeitsraumWert();
      rows.push([]);
      rows.push([`Betonbauteile (Mengen nach Geometrie, Betondeckung nach DIN EN 1992-1-1 Abs. 4.4.1, Aushub mit ${raum.toFixed(2)} m Arbeitsraum nach DIN 4124)`]);
      rows.push(["Pos", "Typ", "Abmessungen", "Stück", "Betongüte", "f_cd [N/mm²]", "Expositionsklasse", "Sauberkeitsschicht",
        "Stabdurchmesser [mm]", "c_min [mm]", "Δc_dev [mm]", "c_nom [mm]", "maßgebend", "Beton [m³]", "Schalung [m²]",
        "Bewehrungsgrad [kg/m³]", "Betonstahl [kg]", "Aushub [m³]", "Masse [t]", "Hinweise"]);
      model.beton.forEach((element) => {
        const a = betonWertung(element);
        rows.push([betonBezeichnung(element), a.typName, a.geo.beschreibung, a.anzahl, element.guete,
          a.kennwerte.fcd.toFixed(2), element.expo, a.typ.erdreich ? (element.sauberkeit === false ? "nein" : "ja") : "-",
          element.ds, a.deckung.cMin, a.deckung.deltaC, a.deckung.cNom, a.deckung.massgebend,
          a.volumen.toFixed(2), a.schalung.toFixed(2), a.bewehrungsgrad, a.bewehrung.toFixed(0),
          a.aushub.toFixed(2), (a.masse / 1000).toFixed(2), a.warnungen.join(" ")]);
      });

      const ebenen = deckenEbenenAktuell();
      if (ebenen.length) {
        rows.push([]);
        rows.push(["Deckenspiegel je Ebene (Spannrichtung nach Faustregel l_max/l_min > 2 einachsig; maßgebend ist die Bemessung)"]);
        rows.push(["Ebene OK [m]", "Pos", "d [cm]", "Spannrichtung", "lx [m]", "lz [m]", "l_max/l_min", "Stützweite [m]",
          "Fläche brutto [m²]", "Aussparungen [m²]", "Fläche netto [m²]", "Volumen [m³]", "Deckenschalung [m²]",
          "Randschalung [m²]", "g_k [kN/m²]"]);
        ebenen.forEach((ebene) => {
          const auf = deckenAufstellung(ebene, betonBezeichnung);
          auf.zeilen.forEach((z) => {
            rows.push([z.koten.ok.toFixed(2), z.bauteil, (z.dicke * 100).toFixed(0), z.spann.richtungName,
              z.spann.lx.toFixed(2), z.spann.lz.toFixed(2), z.spann.verhaeltnis.toFixed(2), z.spann.stuetzweite.toFixed(2),
              z.bruttoFlaeche.toFixed(2), z.oeffnungsFlaeche.toFixed(2), z.nettoFlaeche.toFixed(2),
              z.volumen.toFixed(2), z.deckenschalung.toFixed(2), z.randschalung.toFixed(2), z.gk.toFixed(2)]);
          });
          rows.push([`Summe OK ${ebene.ok.toFixed(2)}`, "", "", "", "", "", "", "",
            auf.summe.bruttoFlaeche.toFixed(2), auf.summe.oeffnungsFlaeche.toFixed(2), auf.summe.nettoFlaeche.toFixed(2),
            auf.summe.volumen.toFixed(2), auf.summe.deckenschalung.toFixed(2), auf.summe.randschalung.toFixed(2), ""]);
        });

        const durchbrueche = [];
        model.beton.forEach((element) => {
          (element.aussparungen || []).forEach((o) => durchbrueche.push({ element, o }));
        });
        if (durchbrueche.length) {
          rows.push([]);
          rows.push(["Deckendurchbrüche"]);
          rows.push(["Pos", "Decke", "x ab Plattenrand [m]", "z ab Plattenrand [m]", "Breite [m]", "Tiefe [m]", "Fläche [m²]", "Bemerkung"]);
          durchbrueche.forEach(({ element, o }) => {
            rows.push(["D" + o.id, betonBezeichnung(element), (o.x || 0).toFixed(2), (o.z || 0).toFixed(2),
              (o.b || 0).toFixed(2), (o.t || 0).toFixed(2), ((o.b || 0) * (o.t || 0)).toFixed(3), o.bemerkung || ""]);
          });
        }
      }

      const schal = schalungsAufstellung(Array.from(model.beton.values()), raum, betonGeometrie, betonBezeichnung);
      if (schal.zeilen.length) {
        rows.push([]);
        rows.push(["Schalungsliste (Schalflächen nach Art getrennt)"]);
        rows.push(["Bauteil", "Schalungsart", "Fläche je Stück [m²]", "Stück", "Fläche gesamt [m²]", "Schalungssystem"]);
        schal.zeilen.forEach((z) => {
          rows.push([z.bauteil, z.artName, z.einzel.toFixed(2), z.anzahl, z.flaeche.toFixed(2), z.system]);
        });
        Object.keys(SCHALUNGSARTEN).forEach((art) => {
          if (schal.jeArt[art] > 0) rows.push(["", "Summe " + SCHALUNGSARTEN[art].name, "", "", schal.jeArt[art].toFixed(2), ""]);
        });
        rows.push(["", "Schalfläche gesamt", "", "", schal.gesamt.toFixed(2), ""]);
      }

      const liste = gesamteStahlliste();
      if (liste.zeilen.length) {
        const vorgabe = bewehrungVorgabe();
        rows.push([]);
        rows.push([`Stahlliste Betonstahl B500B nach DIN 488 (Regelbewehrung, Lieferlänge ${vorgabe.lieferlaenge.toFixed(2)} m, Stoß l0 = ${vorgabe.stossFaktor}·ds, ${vorgabe.haken ? "mit" : "ohne"} Endhaken; Längen ohne Abzug der Biegerollen)`]);
        rows.push(["Bauteil", "Pos", "Bezeichnung", "Biegeform", "⌀ [mm]", "Anzahl", "Einzellänge [m]",
          "Gesamtlänge [m]", "kg/m", "Masse [kg]", "Biegerolle D [mm]", "Bemerkung"]);
        liste.zeilen.forEach((z) => {
          rows.push([z.bauteil, z.pos, z.name, z.formName, z.ds, z.anzahl, z.einzelLaenge.toFixed(2),
            z.gesamtLaenge.toFixed(2), z.masseJeMeter.toFixed(3), z.masse.toFixed(1), z.biegerolle, z.bemerkung || ""]);
        });
        rows.push(["Summe", "", "", "", "", "", "", "", "", liste.gesamtMasse.toFixed(1), "", ""]);

        rows.push([]);
        rows.push(["Stahlauszug nach Durchmessern"]);
        rows.push(["⌀ [mm]", "Querschnitt [cm²]", "Stück", "Gesamtlänge [m]", "kg/m", "Masse [kg]"]);
        liste.jeDurchmesser.forEach((e) => {
          rows.push([e.ds, stabFlaeche(e.ds).toFixed(2), e.stueck, e.laenge.toFixed(2), stabMasse(e.ds).toFixed(3), e.masse.toFixed(1)]);
        });
        rows.push(["Summe", "", "", "", "", liste.gesamtMasse.toFixed(1)]);
      }

      rows.push([]);
      rows.push(["Mengen und Kosten Betonbau"]);
      rows.push(["Position", "Menge", "Einheit", "Einheitspreis [€]", "Kosten [€]"]);
      const positionen = betonAufstellung(Array.from(model.beton.values()), betonPreise(), raum, stahlKostenMasse());
      positionen.forEach((pos) => {
        rows.push([pos.name, pos.menge.toFixed(2), pos.einheit, pos.preis.toFixed(2), pos.kosten.toFixed(2)]);
      });
      rows.push(["Summe Betonbau", "", "", "", positionen.reduce((sum, pos) => sum + pos.kosten, 0).toFixed(2)]);
    }

    const csv = zuCsv(rows);
    const projectName = document.getElementById("projectName").value || "Projekt";
    saveFile(`LV_Stahlbau_${projectName.replace(/\s+/g, "_")}.csv`, "﻿" + csv);
  });

  document.getElementById("btnPrint").addEventListener("click", () => {
    if (window.hsd && typeof window.hsd.drucken === "function") { window.hsd.drucken(); return; }
    window.print();
  });

  /* ------------------------------------------------------------------ Start */

  setMode("draw");
  updatePlaneInfo();
  loadExamplePlanar();
  showView("model");
})();
