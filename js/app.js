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

  const editor = new SketchEditor(canvas, {
    onLineAdded: (line, lengthM) => addMember(line, lengthM),
    onCalibration: (pixelDist, callback) => {
      const val = window.prompt("Reale Länge der gezeichneten Referenzlinie in Metern eingeben:", "1.00");
      const num = parseFloat((val || "").replace(",", "."));
      callback(num);
      updateScaleInfo();
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
            <option value="AUTO" ${member.family === "AUTO" ? "selected" : ""}>Automatisch</option>
            <option value="HEA" ${member.family === "HEA" ? "selected" : ""}>HEA</option>
            <option value="HEB" ${member.family === "HEB" ? "selected" : ""}>HEB</option>
            <option value="IPE" ${member.family === "IPE" ? "selected" : ""}>IPE</option>
            <option value="RHS" ${member.family === "RHS" ? "selected" : ""}>RHS (Vierkant)</option>
            <option value="L" ${member.family === "L" ? "selected" : ""}>L (Winkel)</option>
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

  function setActiveMode(mode) {
    btnDraw.classList.toggle("active", mode === "draw");
    btnCalibrate.classList.toggle("active", mode === "calibrate");
    editor.setMode(mode);
    hint.textContent = mode === "calibrate"
      ? "Kalibrierung: Ziehen Sie eine Referenzlinie bekannter Länge (z. B. 1 m)."
      : "Klicken Sie Start- und Endpunkt einer Bauteilachse (Winkelfang 15°, ESC zum Abbrechen).";
  }

  btnDraw.addEventListener("click", () => setActiveMode("draw"));
  btnCalibrate.addEventListener("click", () => setActiveMode("calibrate"));
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
    if (members.size && !window.confirm("Alle Bauteile und die Skizze löschen?")) return;
    members.clear();
    editor.clearAll();
    renderTable();
  });

  btnGrid.classList.add("active");
  btnAngleSnap.classList.add("active");
  setActiveMode("draw");

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
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const projectName = document.getElementById("projectName").value || "Projekt";
    a.href = url;
    a.download = `LV_Stahlbau_${projectName.replace(/\s+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("btnPrint").addEventListener("click", () => window.print());

  renderTable();
})();
