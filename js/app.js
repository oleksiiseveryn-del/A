/**
 * App-Controller: verbindet Skizzen-Editor, Bauteiltabelle,
 * Stahlprofil-Berechnung, Kostenschätzung und Export.
 */
(function () {
  const members = new Map(); // id -> member state

  const canvas = document.getElementById("sketchCanvas");
  const tbody = document.getElementById("membersBody");
  const emptyState = document.getElementById("emptyState");
  const scaleInfo = document.getElementById("scaleInfo");
  const hint = document.getElementById("hintBox");

  const dateField = document.getElementById("projectDate");
  if (dateField && !dateField.value) {
    dateField.value = new Date().toISOString().slice(0, 10);
  }

  // Eigene Dialogfenster statt window.prompt/confirm (in eingebetteten
  // Umgebungen sind native Browser-Popups häufig blockiert).
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
  modal.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") modal.ok.click();
  });
  modal.overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal(null);
  });

  const editor = new SketchEditor(canvas, {
    onLineAdded: (line, lengthM) => addMember(line, lengthM),
    onNodePick: (mode, node) => handleNodePick(mode, node),
    onCalibration: (pixelDist, callback) => {
      askNumber(
        "Maßstab kalibrieren",
        "Reale Länge der gezeichneten Referenzlinie in Metern eingeben:",
        "1.00"
      ).then((num) => {
        callback(num);
        updateScaleInfo();
        setActiveMode("draw"); // nach der Kalibrierung zurück in den Zeichenmodus
        resyncLengthsFromSketch(); // bestehende Bauteillängen auf neuen Maßstab umrechnen
      });
    },
  });

  function updateScaleInfo() {
    scaleInfo.textContent = `Maßstab: ${editor.pixelsPerMeter.toFixed(1)} px = 1 m`;
  }
  updateScaleInfo();

  function typeShortLabel(type) {
    const map = {
      "Stütze": "STÜ",
      "Obergurt": "OG",
      "Untergurt": "UG",
      "Druckstrebe": "DS",
      "Zugstrebe": "ZS",
      "Riegel/Pfette": "RG",
      "Sonstige": "SO",
    };
    return map[type] || "?";
  }

  function addMember(line, lengthM) {
    const defaults = MEMBER_TYPE_DEFAULTS["Stütze"];
    const member = {
      id: line.id,
      type: "Stütze",
      length: parseFloat(lengthM.toFixed(2)),
      loadType: defaults.loadType,
      force: 10,
      moment: 5,
      beta: defaults.beta,
      family: "AUTO",
      steelGrade: document.getElementById("steelGradeGlobal").value,
    };
    members.set(member.id, member);
    editor.setLineLabel(member.id, typeShortLabel(member.type) + member.id);
    renderTable();
  }

  // Nach einer Maßstabsänderung alle Längen neu aus der Skizzengeometrie ableiten
  function resyncLengthsFromSketch() {
    editor.lines.forEach((line) => {
      const member = members.get(line.id);
      if (member) member.length = parseFloat(editor.lengthOf(line).toFixed(2));
    });
    renderTable();
  }

  function removeMember(id) {
    members.delete(id);
    editor.removeLine(id);
    renderTable();
  }

  function recalcMember(member) {
    return findSuitableProfile(member);
  }

  function renderTable() {
    tbody.innerHTML = "";
    emptyState.style.display = members.size === 0 ? "block" : "none";

    let totalWeight = 0;
    const familyCount = {};

    members.forEach((member) => {
      const result = recalcMember(member);
      totalWeight += result.totalWeight;
      familyCount[result.family] = (familyCount[result.family] || 0) + 1;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${typeShortLabel(member.type)}${member.id}</td>
        <td>
          <select data-field="type" data-id="${member.id}">
            ${Object.keys(MEMBER_TYPE_DEFAULTS).map(t => `<option value="${t}" ${t === member.type ? "selected" : ""}>${t}</option>`).join("")}
          </select>
        </td>
        <td><input type="number" step="0.01" min="0.1" data-field="length" data-id="${member.id}" value="${member.length}"></td>
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
            : `<input type="number" step="0.1" data-field="force" data-id="${member.id}" value="${member.force}" title="Normalkraft N_Ed in kN">`
          }
        </td>
        <td><input type="number" step="0.05" min="0.5" max="2.5" data-field="beta" data-id="${member.id}" value="${member.beta}" title="Knicklängenbeiwert β"></td>
        <td>
          <select data-field="family" data-id="${member.id}">
            ${Object.keys(FAMILY_LABELS).map((f) =>
              `<option value="${f}" ${f === member.family ? "selected" : ""}>${FAMILY_LABELS[f]}</option>`
            ).join("")}
          </select>
        </td>
        <td><strong>${result.profileName}</strong></td>
        <td>${(result.utilization * 100).toFixed(0)}%</td>
        <td>${result.totalWeight.toFixed(1)} kg</td>
        <td><span class="status-pill ${result.status}">${result.status === "ok" ? "OK" : result.status === "knapp" ? "Knapp" : "Fehler"}</span></td>
        <td><button class="row-remove" data-remove="${member.id}" title="Bauteil löschen">✕</button></td>
      `;
      tbody.appendChild(tr);
    });

    document.getElementById("statTotalWeight").textContent = totalWeight.toFixed(1) + " kg";
    document.getElementById("statMemberCount").textContent = members.size;
    updateCost(totalWeight);

    // Editor-Beschriftung aktualisieren
    members.forEach((member) => {
      editor.setLineLabel(member.id, typeShortLabel(member.type) + member.id);
    });
  }

  function updateCost(totalWeight) {
    const pricePerKg = parseFloat(document.getElementById("pricePerKg").value) || 0;
    const processingPerKg = parseFloat(document.getElementById("processingPerKg").value) || 0;
    const transportFlat = parseFloat(document.getElementById("transportFlat").value) || 0;
    const storagePerKg = parseFloat(document.getElementById("storagePerKg").value) || 0;

    const material = totalWeight * pricePerKg;
    const processing = totalWeight * processingPerKg;
    const storage = totalWeight * storagePerKg;
    const total = material + processing + transportFlat + storage;

    document.getElementById("costMaterial").textContent = material.toFixed(2) + " €";
    document.getElementById("costProcessing").textContent = processing.toFixed(2) + " €";
    document.getElementById("costTransport").textContent = transportFlat.toFixed(2) + " €";
    document.getElementById("costStorage").textContent = storage.toFixed(2) + " €";
    document.getElementById("costTotal").textContent = total.toFixed(2) + " €";
  }

  tbody.addEventListener("change", (e) => {
    const id = parseInt(e.target.getAttribute("data-id"), 10);
    const field = e.target.getAttribute("data-field");
    if (!id || !field) return;
    const member = members.get(id);
    if (!member) return;

    if (field === "type") {
      member.type = e.target.value;
      const def = MEMBER_TYPE_DEFAULTS[member.type];
      member.loadType = def.loadType;
      member.beta = def.beta;
    } else if (field === "length") {
      member.length = Math.max(0.1, parseFloat(e.target.value) || member.length);
    } else if (field === "force") {
      member.force = parseFloat(e.target.value) || 0;
    } else if (field === "moment") {
      member.moment = parseFloat(e.target.value) || 0;
    } else if (field === "beta") {
      member.beta = parseFloat(e.target.value) || 1.0;
    } else if (field === "loadType") {
      member.loadType = e.target.value;
    } else if (field === "family") {
      member.family = e.target.value;
    }
    renderTable();
  });

  tbody.addEventListener("click", (e) => {
    const removeId = e.target.getAttribute("data-remove");
    if (removeId) {
      removeMember(parseInt(removeId, 10));
    }
  });

  ["pricePerKg", "processingPerKg", "transportFlat", "storagePerKg"].forEach((id) => {
    document.getElementById(id).addEventListener("input", () => {
      let totalWeight = 0;
      members.forEach((member) => {
        totalWeight += recalcMember(member).totalWeight;
      });
      updateCost(totalWeight);
    });
  });

  document.getElementById("steelGradeGlobal").addEventListener("change", (e) => {
    members.forEach((member) => { member.steelGrade = e.target.value; });
    renderTable();
  });

  // Toolbar
  const btnDraw = document.getElementById("btnDraw");
  const btnCalibrate = document.getElementById("btnCalibrate");
  const btnGrid = document.getElementById("btnGrid");
  const btnAngleSnap = document.getElementById("btnAngleSnap");
  const btnClearAll = document.getElementById("btnClearAll");

  const btnSupport = document.getElementById("btnSupport");
  const btnLoad = document.getElementById("btnLoad");

  const MODE_HINTS = {
    draw: "Klicken Sie Start- und Endpunkt einer Bauteilachse (Winkelfang 15°, ESC zum Abbrechen).",
    calibrate: "Kalibrierung: Ziehen Sie eine Referenzlinie bekannter Länge (z. B. 1 m).",
    support: "Auflager: Knoten anklicken – Festlager → Loslager → kein Lager.",
    load: "Knotenlast: Knoten anklicken und Last in kN eingeben (positiv = nach unten).",
  };

  function setActiveMode(mode) {
    btnDraw.classList.toggle("active", mode === "draw");
    btnCalibrate.classList.toggle("active", mode === "calibrate");
    btnSupport.classList.toggle("active", mode === "support");
    btnLoad.classList.toggle("active", mode === "load");
    editor.setMode(mode);
    hint.textContent = MODE_HINTS[mode] || MODE_HINTS.draw;
  }

  btnDraw.addEventListener("click", () => setActiveMode("draw"));
  btnCalibrate.addEventListener("click", () => setActiveMode("calibrate"));
  btnSupport.addEventListener("click", () => setActiveMode("support"));
  btnLoad.addEventListener("click", () => setActiveMode("load"));
  btnGrid.addEventListener("click", () => {
    const on = !btnGrid.classList.contains("active");
    btnGrid.classList.toggle("active", on);
    editor.toggleGrid(on);
  });
  btnAngleSnap.addEventListener("click", () => {
    const on = !btnAngleSnap.classList.contains("active");
    btnAngleSnap.classList.toggle("active", on);
    editor.toggleAngleSnap(on);
  });
  btnClearAll.addEventListener("click", () => {
    if (members.size === 0) {
      editor.clearAll();
      return;
    }
    askConfirm("Alles löschen", "Alle Bauteile und die gesamte Skizze wirklich löschen?").then((confirmed) => {
      if (!confirmed) return;
      members.clear();
      editor.clearAll();
      renderTable();
    });
  });

  btnGrid.classList.add("active");
  btnAngleSnap.classList.add("active");
  setActiveMode("draw");

  /**
   * Knotenklick in den Modi "Auflager" und "Knotenlast".
   * Auflager schalten durch: kein Lager → Festlager → Loslager → kein Lager.
   */
  function handleNodePick(mode, node) {
    if (mode === "support") {
      const current = editor.getSupport(node.x, node.y);
      const next = current === undefined ? "pinned" : current === "pinned" ? "roller" : undefined;
      editor.setSupport(node.x, node.y, next);
      setStatus(
        next === "pinned" ? "Festlager gesetzt (horizontal und vertikal gehalten)."
          : next === "roller" ? "Loslager gesetzt (nur vertikal gehalten)."
          : "Auflager entfernt.",
        "info"
      );
      return;
    }

    const current = editor.getLoad(node.x, node.y);
    askNumber(
      "Knotenlast",
      "Vertikale Knotenlast in kN eingeben (positiv = nach unten, 0 = Last entfernen):",
      current ? String(current.fz) : "20"
    ).then((value) => {
      if (value === null || Number.isNaN(value)) return;
      editor.setLoad(node.x, node.y, { fx: 0, fz: value });
      setStatus(value ? `Knotenlast ${value} kN gesetzt.` : "Knotenlast entfernt.", "info");
    });
  }

  /**
   * Knotentabelle mit den Anschlusskräften für die Werkstattzeichnung.
   * Koordinatenursprung ist der linke untere Systemknoten, z zeigt nach oben.
   */
  function renderNodeTable(solution) {
    const body = document.getElementById("nodesBody");
    const empty = document.getElementById("nodesEmpty");
    body.innerHTML = "";

    const model = editor.buildModel();
    if (!solution || !solution.ok || model.nodes.length === 0) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    const originX = Math.min(...model.nodes.map((n) => n.x));
    const originY = Math.max(...model.nodes.map((n) => n.y)); // y zeigt im Canvas nach unten
    const ppm = editor.pixelsPerMeter;

    model.nodes.forEach((node, index) => {
      const attached = model.bars.filter((bar) => bar.a === index || bar.b === index);
      const entries = attached.map((bar) => {
        const member = members.get(bar.id);
        const N = solution.forces[bar.id] || 0;
        const label = member ? typeShortLabel(member.type) + bar.id : "#" + bar.id;
        return { label, N };
      });
      const maxN = entries.reduce((max, e) => Math.max(max, Math.abs(e.N)), 0);

      const support = model.supports[index];
      const nodeReactions = solution.reactions.filter((r) => r.node === index);
      const supportText = support
        ? `${support === "pinned" ? "Festlager" : "Loslager"} (${nodeReactions
            .map((r) => `${r.dir === "x" ? "H" : "V"} ${Math.abs(r.value).toFixed(1)} kN`)
            .join(", ")})`
        : "–";

      const load = model.loads[index];
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>K${index + 1}${load && load.fz ? ` <span class="node-load">↓${load.fz} kN</span>` : ""}</td>
        <td>${((node.x - originX) / ppm).toFixed(2)}</td>
        <td>${((originY - node.y) / ppm).toFixed(2)}</td>
        <td>${entries.length}</td>
        <td>${entries.map((e) =>
            `<span class="force-chip ${e.N >= 0 ? "zug" : "druck"}">${e.label} ${e.N >= 0 ? "+" : "−"}${Math.abs(e.N).toFixed(1)}</span>`
          ).join(" ")}</td>
        <td>${supportText}</td>
        <td><strong>${maxN.toFixed(1)}</strong></td>
      `;
      body.appendChild(tr);
    });
  }

  // Zuletzt berechnete Lösung, für Knotentabelle und Export vorgehalten
  let lastSolution = null;

  const tabMembers = document.getElementById("tabMembers");
  const tabNodes = document.getElementById("tabNodes");
  function showView(which) {
    const isNodes = which === "nodes";
    document.getElementById("viewMembers").hidden = isNodes;
    document.getElementById("viewNodes").hidden = !isNodes;
    tabMembers.classList.toggle("active", !isNodes);
    tabNodes.classList.toggle("active", isNodes);
    if (isNodes) renderNodeTable(lastSolution);
  }
  tabMembers.addEventListener("click", () => showView("members"));
  tabNodes.addEventListener("click", () => showView("nodes"));

  function setStatus(text, kind) {
    const box = document.getElementById("statusBox");
    box.textContent = text;
    box.className = "status-box " + (kind || "info");
    box.hidden = !text;
  }

  /**
   * Stabkräfte aus der gezeichneten Geometrie ermitteln und in die
   * Bauteiltabelle übernehmen (Druck/Zug wird automatisch gesetzt).
   */
  function computeBarForces() {
    const model = editor.buildModel();
    const result = solveTruss(model.nodes, model.bars, model.supports, model.loads);

    if (!result.ok) {
      lastSolution = null;
      editor.setBarForces(null);
      renderNodeTable(null);
      setStatus(result.message, "error");
      return;
    }
    lastSolution = result;

    let maxUtilNote = 0;
    model.bars.forEach((bar) => {
      const member = members.get(bar.id);
      if (!member) return;
      const N = result.forces[bar.id];
      // Sehr kleine Werte sind Nullstäbe (numerisches Rauschen abschneiden)
      const value = Math.abs(N) < 0.05 ? 0 : N;
      member.loadType = value >= 0 ? "Zug" : "Druck";
      member.force = parseFloat(Math.abs(value).toFixed(1));
      maxUtilNote = Math.max(maxUtilNote, Math.abs(value));
    });

    editor.setBarForces(result.forces);
    renderTable();
    renderNodeTable(result);

    const vertical = result.reactions.filter((r) => r.dir === "y");
    const reactionText = vertical
      .map((r) => `${Math.abs(r.value).toFixed(1)} kN`)
      .join(" / ");
    setStatus(
      `Stabkräfte berechnet · größte Stabkraft ${maxUtilNote.toFixed(1)} kN · vertikale Auflagerkräfte ${reactionText}. ` +
      "Nullstäbe erscheinen mit 0 kN.",
      "ok"
    );
  }

  document.getElementById("btnSolve").addEventListener("click", computeBarForces);

  /**
   * Startbeispiel: einfaches Fachwerkbinder-Feld mit realistischen Schnittgrößen,
   * damit die Zuordnung Skizze → Stahlprofil sofort sichtbar ist.
   * Werte sind Beispielwerte und ersetzen keine Systemberechnung.
   */
  function loadExample() {
    // Parallelbinder (Pratt-Fachwerk): 10,00 m Stützweite, 1,50 m Systemhöhe,
    // vier Felder à 2,50 m. 10 Knoten, 17 Stäbe, 3 Auflagerbindungen:
    // m + r = 17 + 3 = 20 = 2n -> statisch bestimmt und unverschieblich.
    const yU = 400; // Untergurt
    const yO = 325; // Obergurt (75 px = 1,50 m bei 50 px/m)
    const xs = [80, 205, 330, 455, 580];
    const example = [];
    for (let i = 0; i < 4; i++) {
      example.push({ x1: xs[i], y1: yU, x2: xs[i + 1], y2: yU, type: "Untergurt", beta: 1.0 });
      example.push({ x1: xs[i], y1: yO, x2: xs[i + 1], y2: yO, type: "Obergurt", beta: 1.0 });
    }
    xs.forEach((x) => example.push({ x1: x, y1: yU, x2: x, y2: yO, type: "Druckstrebe", beta: 1.0 }));
    // Pratt-Anordnung: Diagonalen vom Obergurt außen zum Untergurt innen
    // geneigt -> Diagonalen auf Zug, Pfosten auf Druck (wirtschaftlich,
    // da die langen Zugstäbe nicht knickgefährdet sind)
    example.push({ x1: xs[0], y1: yO, x2: xs[1], y2: yU, type: "Zugstrebe", beta: 1.0 });
    example.push({ x1: xs[1], y1: yO, x2: xs[2], y2: yU, type: "Zugstrebe", beta: 1.0 });
    example.push({ x1: xs[3], y1: yO, x2: xs[2], y2: yU, type: "Zugstrebe", beta: 1.0 });
    example.push({ x1: xs[4], y1: yO, x2: xs[3], y2: yU, type: "Zugstrebe", beta: 1.0 });
    example.forEach((spec) => {
      const line = editor.addLine(spec.x1, spec.y1, spec.x2, spec.y2);
      const defaults = MEMBER_TYPE_DEFAULTS[spec.type];
      members.set(line.id, {
        id: line.id,
        type: spec.type,
        length: parseFloat(editor.lengthOf(line).toFixed(2)),
        loadType: defaults.loadType,
        force: 0,
        moment: 5,
        beta: spec.beta,
        family: "AUTO",
        steelGrade: document.getElementById("steelGradeGlobal").value,
      });
    });

    // Auflager: links Festlager, rechts Loslager
    editor.setSupport(xs[0], yU, "pinned");
    editor.setSupport(xs[4], yU, "roller");
    // Knotenlasten am Obergurt (Dachlast über die Pfetten eingeleitet),
    // Randknoten mit halber Einzugsfläche
    editor.setLoad(xs[0], yO, { fx: 0, fz: 10 });
    editor.setLoad(xs[1], yO, { fx: 0, fz: 20 });
    editor.setLoad(xs[2], yO, { fx: 0, fz: 20 });
    editor.setLoad(xs[3], yO, { fx: 0, fz: 20 });
    editor.setLoad(xs[4], yO, { fx: 0, fz: 10 });

    renderTable();
    computeBarForces();
  }

  document.getElementById("btnExample").addEventListener("click", () => {
    members.clear();
    editor.clearAll();
    loadExample();
  });

  /**
   * Datei-Download. In der eingebetteten Online-Version läuft der Download
   * über die Plattform-Schnittstelle, lokal klassisch über einen Blob-Link.
   */
  let platformDownloads = null;
  if (window.claude && typeof window.claude.use === "function") {
    window.claude.use("downloads").then((api) => { platformDownloads = api; }).catch(() => {});
  }

  function saveFile(filename, content) {
    if (platformDownloads) {
      platformDownloads.save({ filename, data: content }).catch((err) => {
        if (err && err.code === "declined") return; // Nutzer hat abgebrochen
        window.console.warn("Download nicht möglich:", err);
      });
      return;
    }
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* --- Projektverwaltung: speichern, laden, als Datei sichern/öffnen --- */

  const STORAGE_KEY = "hsd-stahlbau-konverter-projekt";

  function collectProject() {
    return {
      version: 1,
      erzeugt: new Date().toISOString(),
      projekt: {
        name: document.getElementById("projectName").value,
        datum: document.getElementById("projectDate").value,
        stahlguete: document.getElementById("steelGradeGlobal").value,
      },
      kosten: {
        material: document.getElementById("pricePerKg").value,
        bearbeitung: document.getElementById("processingPerKg").value,
        transport: document.getElementById("transportFlat").value,
        lagerung: document.getElementById("storagePerKg").value,
      },
      massstab: editor.pixelsPerMeter,
      linien: editor.lines.map((l) => ({ id: l.id, x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2 })),
      auflager: Array.from(editor.supports.entries()),
      lasten: Array.from(editor.loads.entries()),
      bauteile: Array.from(members.values()),
    };
  }

  function applyProject(data) {
    if (!data || !Array.isArray(data.linien)) throw new Error("Ungültige Projektdatei");

    members.clear();
    editor.clearAll();

    editor.pixelsPerMeter = data.massstab || 50;
    data.linien.forEach((l) => {
      const line = editor.addLine(l.x1, l.y1, l.x2, l.y2);
      line.id = l.id; // ursprüngliche Nummerierung beibehalten
    });
    editor.nextId = Math.max(0, ...data.linien.map((l) => l.id)) + 1;
    (data.auflager || []).forEach(([key, type]) => editor.supports.set(key, type));
    (data.lasten || []).forEach(([key, load]) => editor.loads.set(key, load));
    (data.bauteile || []).forEach((m) => members.set(m.id, m));

    if (data.projekt) {
      document.getElementById("projectName").value = data.projekt.name || "";
      document.getElementById("projectDate").value = data.projekt.datum || "";
      document.getElementById("steelGradeGlobal").value = data.projekt.stahlguete || "S235";
    }
    if (data.kosten) {
      document.getElementById("pricePerKg").value = data.kosten.material;
      document.getElementById("processingPerKg").value = data.kosten.bearbeitung;
      document.getElementById("transportFlat").value = data.kosten.transport;
      document.getElementById("storagePerKg").value = data.kosten.lagerung;
    }

    lastSolution = null;
    editor.setBarForces(null);
    updateScaleInfo();
    renderTable();
    renderNodeTable(null);
  }

  document.getElementById("btnSaveProject").addEventListener("click", () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(collectProject()));
      setStatus(`Projekt im Browser gesichert (${members.size} Bauteile, ${new Date().toLocaleString("de-DE")}).`, "ok");
    } catch (err) {
      setStatus("Speichern im Browser nicht möglich (Speicher gesperrt oder voll). Nutzen Sie „Projektdatei“.", "error");
    }
  });

  document.getElementById("btnLoadProject").addEventListener("click", () => {
    let raw = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (err) {
      setStatus("Zugriff auf den Browser-Speicher nicht möglich. Nutzen Sie „Datei öffnen“.", "error");
      return;
    }
    if (!raw) {
      setStatus("Kein gespeichertes Projekt gefunden.", "error");
      return;
    }
    try {
      applyProject(JSON.parse(raw));
      setStatus("Gespeichertes Projekt geladen. Stabkräfte bei Bedarf neu berechnen.", "ok");
    } catch (err) {
      setStatus("Gespeichertes Projekt konnte nicht gelesen werden.", "error");
    }
  });

  document.getElementById("btnExportProject").addEventListener("click", () => {
    const name = document.getElementById("projectName").value || "Projekt";
    saveFile(`Stahlbau_${name.replace(/\s+/g, "_")}.json`, JSON.stringify(collectProject(), null, 2));
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
        setStatus("Datei konnte nicht gelesen werden – bitte eine mit dieser App erzeugte Projektdatei wählen.", "error");
      }
      fileInput.value = "";
    };
    reader.readAsText(file);
  });

  // Export CSV (LV-Format)
  document.getElementById("btnExportCsv").addEventListener("click", () => {
    const rows = [["Pos", "Bauteil", "Typ", "Länge [m]", "Beanspruchung", "Kraft/Moment", "Profil", "Auslastung [%]", "Gewicht gesamt [kg]", "Status"]];
    let i = 1;
    members.forEach((member) => {
      const result = recalcMember(member);
      rows.push([
        i++,
        typeShortLabel(member.type) + member.id,
        member.type,
        member.length.toFixed(2),
        member.loadType,
        member.loadType === "Biegung" ? member.moment + " kNm" : member.force + " kN",
        result.profileName,
        (result.utilization * 100).toFixed(0),
        result.totalWeight.toFixed(1),
        result.status,
      ]);
    });
    // Anschlusskräfte je Knoten anhängen, sobald eine Lösung vorliegt
    if (lastSolution && lastSolution.ok) {
      const model = editor.buildModel();
      const originX = Math.min(...model.nodes.map((n) => n.x));
      const originY = Math.max(...model.nodes.map((n) => n.y));
      const ppm = editor.pixelsPerMeter;

      rows.push([]);
      rows.push(["Anschlusskräfte je Knoten (+ Zug / − Druck)"]);
      rows.push(["Knoten", "x [m]", "z [m]", "Auflager", "Knotenlast [kN]", "Anschlüsse", "max |N| [kN]"]);

      model.nodes.forEach((node, index) => {
        const attached = model.bars.filter((bar) => bar.a === index || bar.b === index);
        const entries = attached.map((bar) => {
          const member = members.get(bar.id);
          const N = lastSolution.forces[bar.id] || 0;
          const label = member ? typeShortLabel(member.type) + bar.id : "#" + bar.id;
          return `${label} ${N >= 0 ? "+" : "-"}${Math.abs(N).toFixed(1)}`;
        });
        const maxN = attached.reduce((max, bar) => Math.max(max, Math.abs(lastSolution.forces[bar.id] || 0)), 0);
        const support = model.supports[index];
        const reactions = lastSolution.reactions
          .filter((r) => r.node === index)
          .map((r) => `${r.dir === "x" ? "H" : "V"} ${Math.abs(r.value).toFixed(1)} kN`)
          .join(" / ");
        rows.push([
          "K" + (index + 1),
          ((node.x - originX) / ppm).toFixed(2),
          ((originY - node.y) / ppm).toFixed(2),
          support ? `${support === "pinned" ? "Festlager" : "Loslager"} ${reactions}` : "-",
          model.loads[index] ? model.loads[index].fz : 0,
          entries.join(" | "),
          maxN.toFixed(1),
        ]);
      });
    }

    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const projectName = document.getElementById("projectName").value || "Projekt";
    saveFile(`LV_Stahlbau_${projectName.replace(/\s+/g, "_")}.csv`, "﻿" + csv);
  });

  document.getElementById("btnPrint").addEventListener("click", () => window.print());

  loadExample();
})();
