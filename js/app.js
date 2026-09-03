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

  const model = {
    nodes: [],            // [{ x, y, z }]
    members: new Map(),   // id -> { id, a, b, type, loadType, force, moment, beta, family, steelGrade }
    supports: new Map(),  // Knotenindex -> "pinned" | "roller"
    loads: new Map(),     // Knotenindex -> { fx, fy, fz }
    nextId: 1,
  };

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
    model.supports.clear();
    model.loads.clear();
    model.nextId = 1;
    lastSolution = null;
    selfWeightLoads = [];
    selfWeightTotal = 0;
    pendingStart = null;
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

  window.addEventListener("resize", () => { sketch.resize(); result.resize(); });

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

  const MODE_HINTS = {
    draw: "Zeichnen: Anfangs- und Endpunkt auf der Arbeitsebene anklicken. Rechte Maustaste dreht das Modell, Mausrad zoomt, ESC bricht ab.",
    orbit: "Navigieren: Ziehen dreht das Modell, Umschalt+Ziehen verschiebt, Mausrad zoomt.",
    support: "Auflager: Knoten anklicken – Festlager → Loslager → kein Lager.",
    load: "Knotenlast: Knoten anklicken und Last in kN eingeben (positiv = nach unten).",
  };

  function setMode(next) {
    mode = next;
    pendingStart = null;
    sketch.mode = next === "orbit" ? "orbit" : "draw";
    ["btnDraw", "btnOrbit", "btnSupport", "btnLoad"].forEach((id) => {
      document.getElementById(id).classList.remove("active");
    });
    const button = { draw: "btnDraw", orbit: "btnOrbit", support: "btnSupport", load: "btnLoad" }[next];
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
    document.getElementById("costMaterial").textContent = material.toFixed(2) + " €";
    document.getElementById("costProcessing").textContent = processing.toFixed(2) + " €";
    document.getElementById("costTransport").textContent = transport.toFixed(2) + " €";
    document.getElementById("costStorage").textContent = storage.toFixed(2) + " €";
    document.getElementById("costTotal").textContent = (material + processing + transport + storage).toFixed(2) + " €";
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
    cutlist: { button: document.getElementById("tabCutList"), view: document.getElementById("viewCutList") },
  };

  function showView(which) {
    Object.keys(TABS).forEach((key) => {
      TABS[key].view.hidden = key !== which;
      TABS[key].button.classList.toggle("active", key === which);
    });
    if (which === "nodes") renderNodeTable();
    if (which === "cutlist") renderCutList();
    if (which === "model") { result.resize(); renderModel(); }
  }
  Object.keys(TABS).forEach((key) => TABS[key].button.addEventListener("click", () => showView(key)));

  /** Alle abhängigen Ansichten nach einer Modelländerung auffrischen. */
  function refreshAll() {
    renderTable();
    renderSketch();
    if (!TABS.model.view.hidden) renderModel();
    if (!TABS.nodes.view.hidden) renderNodeTable();
    if (!TABS.cutlist.view.hidden) renderCutList();
  }

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

  function saveFile(filename, content, mime) {
    if (platformDownloads) {
      platformDownloads.save({ filename, data: content }).catch((err) => {
        if (err && err.code === "declined") return;
        window.console.warn("Download nicht möglich:", err);
      });
      return;
    }
    const blob = new Blob([content], { type: mime || "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

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

  const fileInput = document.getElementById("projectFileInput");
  document.getElementById("btnImportProject").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        applyProject(JSON.parse(String(reader.result)));
        setStatus(`Projektdatei „${file.name}“ geladen.`, "ok");
      } catch (err) {
        setStatus("Datei konnte nicht gelesen werden: " + err.message, "error");
      }
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

    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const projectName = document.getElementById("projectName").value || "Projekt";
    saveFile(`LV_Stahlbau_${projectName.replace(/\s+/g, "_")}.csv`, "﻿" + csv);
  });

  document.getElementById("btnPrint").addEventListener("click", () => window.print());

  /* ------------------------------------------------------------------ Start */

  setMode("draw");
  updatePlaneInfo();
  loadExamplePlanar();
  showView("model");
})();
