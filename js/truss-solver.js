/**
 * Ebener Fachwerk-Solver (Knotengleichgewichtsverfahren).
 *
 * Aufgestellt wird das Gleichungssystem A · x = b mit
 *   x = [N_1 … N_m, R_1 … R_r]   (Stabnormalkräfte und Auflagerreaktionen)
 * und je Knoten zwei Gleichgewichtsbedingungen (ΣH = 0, ΣV = 0).
 * Gelöst wird mit Gaußelimination und Spaltenpivotisierung.
 *
 * Vorzeichen: N > 0 = Zug, N < 0 = Druck (Stahlbau-Konvention).
 * Voraussetzung: statisch bestimmtes, unverschiebliches Fachwerk mit
 * gelenkigen Knoten und ausschließlich Knotenlasten.
 */

/** Löst A · x = b mit Gaußelimination und Spaltenpivotisierung. */
function solveLinearSystem(A, b) {
  const n = b.length;
  // Arbeitskopie der erweiterten Koeffizientenmatrix
  const M = A.map((row, i) => row.concat([b[i]]));

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivotRow][col])) pivotRow = r;
    }
    if (Math.abs(M[pivotRow][col]) < 1e-9) return null; // singulär -> verschieblich
    if (pivotRow !== col) {
      const tmp = M[pivotRow];
      M[pivotRow] = M[col];
      M[col] = tmp;
    }
    const pivot = M[col][col];
    for (let r = col + 1; r < n; r++) {
      const factor = M[r][col] / pivot;
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }

  // Rückwärtseinsetzen
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let sum = M[r][n];
    for (let c = r + 1; c < n; c++) sum -= M[r][c] * x[c];
    x[r] = sum / M[r][r];
  }
  return x;
}

/**
 * @param {Array} nodes - [{ x, y }] in Zeichenkoordinaten (y nach unten)
 * @param {Array} bars  - [{ id, a, b }] Knotenindizes je Stab
 * @param {Array} supports - je Knotenindex "pinned" | "roller" | undefined
 * @param {Array} loads - je Knotenindex { fx, fz } in kN (fz positiv = nach unten)
 * @returns {Object} { ok, forces, reactions, message }
 */
function solveTruss(nodes, bars, supports, loads) {
  const n = nodes.length;
  const m = bars.length;

  if (n === 0 || m === 0) {
    return { ok: false, message: "Keine Stäbe vorhanden – bitte zuerst die Skizze zeichnen." };
  }

  // Auflagerunbekannte einsammeln: Festlager = 2 (H und V), Loslager = 1 (V)
  const reactionDofs = [];
  supports.forEach((type, nodeIndex) => {
    if (type === "pinned") {
      reactionDofs.push({ node: nodeIndex, dir: "x" });
      reactionDofs.push({ node: nodeIndex, dir: "y" });
    } else if (type === "roller") {
      reactionDofs.push({ node: nodeIndex, dir: "y" });
    }
  });
  const r = reactionDofs.length;

  if (r < 3) {
    return {
      ok: false,
      message: "Zu wenige Auflagerbindungen: mindestens ein Festlager und ein Loslager setzen (3 Bindungen).",
    };
  }

  const degree = m + r - 2 * n;
  if (degree < 0) {
    return {
      ok: false,
      message: `System ${-degree}-fach verschieblich (kinematisch): ${m} Stäbe + ${r} Auflagerbindungen < ${2 * n} Gleichgewichtsbedingungen. Fehlende Diagonale oder Auflagerbindung ergänzen.`,
    };
  }
  if (degree > 0) {
    return {
      ok: false,
      message: `System ${degree}-fach statisch unbestimmt. Dieses Verfahren löst nur statisch bestimmte Fachwerke – überzählige Stäbe oder Auflagerbindungen entfernen.`,
    };
  }

  // Gleichungssystem aufbauen: Zeile 2i = ΣH am Knoten i, Zeile 2i+1 = ΣV
  const size = 2 * n;
  const A = Array.from({ length: size }, () => new Array(size).fill(0));
  const b = new Array(size).fill(0);

  bars.forEach((bar, j) => {
    const na = nodes[bar.a];
    const nb = nodes[bar.b];
    const dx = nb.x - na.x;
    const dy = nb.y - na.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-9) return;
    const cx = dx / len;
    const cy = dy / len;
    // Zugkraft zieht den Knoten jeweils zum gegenüberliegenden Knoten hin
    A[2 * bar.a][j] += cx;
    A[2 * bar.a + 1][j] += cy;
    A[2 * bar.b][j] -= cx;
    A[2 * bar.b + 1][j] -= cy;
  });

  reactionDofs.forEach((dof, k) => {
    const row = dof.dir === "x" ? 2 * dof.node : 2 * dof.node + 1;
    A[row][m + k] = 1;
  });

  // Äußere Lasten auf die rechte Seite: Σ innere Kräfte = −Σ äußere Kräfte
  loads.forEach((load, nodeIndex) => {
    if (!load) return;
    b[2 * nodeIndex] = -(load.fx || 0);
    b[2 * nodeIndex + 1] = -(load.fz || 0); // fz positiv = nach unten = +y
  });

  const x = solveLinearSystem(A, b);
  if (!x) {
    return {
      ok: false,
      message: "System nicht lösbar (verschieblich oder Auflager ungünstig angeordnet), z. B. drei parallele oder in einem Punkt schneidende Auflagerkräfte.",
    };
  }

  const forces = {};
  bars.forEach((bar, j) => {
    // Numerisches Rauschen abschneiden, damit Nullstäbe als glatte 0 erscheinen
    forces[bar.id] = Math.abs(x[j]) < 0.05 ? 0 : x[j];
  });

  const reactions = reactionDofs.map((dof, k) => ({
    node: dof.node,
    dir: dof.dir,
    value: x[m + k],
  }));

  return { ok: true, forces, reactions, message: "Stabkräfte berechnet." };
}
