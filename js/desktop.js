/**
 * Anpassungen für die Windows-Anwendung.
 *
 * Wird nur in der Windows-Fassung geladen (siehe tools/desktop-vorbereiten.js).
 * Die Rechenwege bleiben unberührt – hier steht ausschließlich, was das
 * Fenster anders macht als der Browser: Menübefehle auf die vorhandenen
 * Knöpfe legen, den Knopf „Als PDF sichern" ergänzen und den Knopf
 * „Weitergeben" ausblenden, den es unter Windows nicht gibt.
 */

(function () {
  "use strict";

  if (!window.hsd || window.hsd.plattform !== "windows") return;

  document.documentElement.classList.add("windows-app");

  /** Knopf betätigen, wenn es ihn gibt. */
  function druecke(id) {
    const knopf = document.getElementById(id);
    if (knopf) knopf.click();
  }

  window.addEventListener("DOMContentLoaded", () => {
    // ---- Menü der Anwendung auf die vorhandenen Knöpfe legen
    window.hsd.aufMenue("menue:projekt-oeffnen", () => druecke("btnImportProject"));
    window.hsd.aufMenue("menue:projekt-speichern", () => druecke("btnExportProject"));
    window.hsd.aufMenue("menue:lv-csv", () => druecke("btnExportCsv"));
    window.hsd.aufMenue("menue:aufmass-csv", () => druecke("btnAufmassCsv"));
    window.hsd.aufMenue("menue:tagebuch-csv", () => druecke("btnTagebuchCsv"));

    // ---- „Als PDF sichern" neben „Drucken" im Menüband
    const drucken = document.getElementById("btnPrint");
    if (drucken && !document.getElementById("btnPdf")) {
      const pdf = document.createElement("button");
      pdf.id = "btnPdf";
      pdf.className = drucken.className;
      // Aufbau wie die übrigen Knöpfe des Menübands: Sinnbild über Beschriftung
      pdf.innerHTML = '<span class="ribbon-icon">🖫</span><span class="ribbon-label">Als PDF</span>';
      pdf.title = "Die Ansicht als PDF im Blatt A4 quer sichern";
      pdf.addEventListener("click", () => {
        const name = (document.getElementById("projectName").value || "Projekt")
          .replace(/\s+/g, "_");
        window.hsd.pdf(`HSD_${name}.pdf`);
      });
      drucken.parentNode.insertBefore(pdf, drucken.nextSibling);
    }

    // ---- Im Blattfenster ebenfalls PDF anbieten
    const blattDruck = document.getElementById("sheetPrint");
    if (blattDruck && !document.getElementById("sheetPdf")) {
      const pdf = document.createElement("button");
      pdf.id = "sheetPdf";
      pdf.className = blattDruck.className;
      pdf.textContent = "🖫 PDF";
      pdf.title = "Das gezeigte Blatt als PDF sichern";
      pdf.addEventListener("click", () => {
        const titel = (document.getElementById("sheetTitle").textContent || "Blatt")
          .replace(/[^\wÄÖÜäöüß.\- ]+/g, "").trim().replace(/\s+/g, "_");
        document.body.classList.add("printing-sheet");
        window.requestAnimationFrame(() => window.hsd.pdf(`${titel}.pdf`)
          .then(() => document.body.classList.remove("printing-sheet")));
      });
      blattDruck.parentNode.insertBefore(pdf, blattDruck.nextSibling);
    }

    // ---- „Weitergeben" gibt es unter Windows nicht; gespeichert wird über
    // den Datei-Dialog, weitergegeben über den Explorer
    ["btnTeilen", "sheetTeilen"].forEach((id) => {
      const knopf = document.getElementById(id);
      if (knopf) knopf.remove();
    });
  });
})();
