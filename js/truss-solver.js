/**
 * Fachwerk-Solver für ebene und räumliche Systeme (Knotengleichgewicht).
 *
 * Aufgestellt wird A · x = b mit x = [N_1 … N_m, R_1 … R_r]; je Knoten
 * gelten zwei (eben) bzw. drei (räumlich) Gleichgewichtsbedingungen.
 * Gelöst wird mit Gaußelimination und Spaltenpivotisierung.
 *
 * Liegen alle Knoten in einer Ebene, wird in dieser Ebene gerechnet -
 * andernfalls wäre ein ebenes Fachwerk im Raum stets verschieblich.
 *
 * Vorzeichen: N > 0 = Zug, N < 0 = Druck.
 * Voraussetzung: gelenkige Knoten, ausschließlich Knotenlasten,
 * statisch bestimmtes und unverschiebliches System.
 */

function solveLinearSystem(A, b) {
  const n = b.length;
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

  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let sum = M[r][n];
    for (let c = r + 1; c < n; c++) sum -= M[r][c] * x[c];
    x[r] = sum / M[r][r];
  }
  return x;
}

/** Prüft, ob alle Knoten in einer Ebene liegen, und liefert deren Achsen. */
function detectPlane(nodes) {
  if (nodes.length < 3) return null;
  const p0 = nodes[0];
  let bestNormal = null;
  let bestLen = 0;

  for (let i = 1; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const u = [nodes[i].x - p0.x, nodes[i].y - p0.y, nodes[i].z - p0.z];
      const v = [nodes[j].x - p0.x, nodes[j].y - p0.y, nodes[j].z - p0.z];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const len = Math.hypot(n[0], n[1], n[2]);
      if (len > bestLen) { bestLen = len; bestNormal = [n[0] / len, n[1] / len, n[2] / len]; }
    }
  }
  if (!bestNormal || bestLen < 1e-9) return null;

  // Abstand aller Knoten von dieser Ebene prüfen
  const planar = nodes.every((p) => {
    const d = (p.x - p0.x) * bestNormal[0] + (p.y - p0.y) * bestNormal[1] + (p.z - p0.z) * bestNormal[2];
    return Math.abs(d) < 1e-6;
  });
  if (!planar) return null;

  // Lokale Achsen: e2 möglichst lotrecht, e1 rechtwinklig dazu in der Ebene
  const up = [0, 1, 0];
  const dot = up[0] * bestNormal[0] + up[1] * bestNormal[1] + up[2] * bestNormal[2];
  let e2 = [up[0] - dot * bestNormal[0], up[1] - dot * bestNormal[1], up[2] - dot * bestNormal[2]];
  let len2 = Math.hypot(e2[0], e2[1], e2[2]);
  if (len2 < 1e-6) { e2 = [1, 0, 0]; len2 = 1; } // waagerechte Ebene
  e2 = [e2[0] / len2, e2[1] / len2, e2[2] / len2];
  const e1 = [
    e2[1] * bestNormal[2] - e2[2] * bestNormal[1],
    e2[2] * bestNormal[0] - e2[0] * bestNormal[2],
    e2[0] * bestNormal[1] - e2[1] * bestNormal[0],
  ];
  return { normal: bestNormal, e1, e2 };
}

/**
 * @param {Array} nodes    - [{ x, y, z }] in Metern, y nach oben
 * @param {Array} bars     - [{ id, a, b }]
 * @param {Array} supports - je Knoten "pinned" | "roller" | undefined
 * @param {Array} loads    - je Knoten { fx, fy, fz } in kN (fy negativ = nach unten)
 */
function solveTruss(nodes, bars, supports, loads) {
  const n = nodes.length;
  const m = bars.length;
  if (n === 0 || m === 0) {
    return { ok: false, message: "Keine Stäbe vorhanden – bitte zuerst die Skizze zeichnen." };
  }

  const plane = detectPlane(nodes);
  const dim = plane ? 2 : 3;
  // Basisvektoren der Gleichgewichtsrichtungen
  const basis = plane ? [plane.e1, plane.e2] : [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

  // Auflagerunbekannte: Festlager hält alle Richtungen, Loslager nur die lotrechte
  const reactionDofs = [];
  supports.forEach((type, nodeIndex) => {
    if (type === "pinned") {
      for (let d = 0; d < dim; d++) reactionDofs.push({ node: nodeIndex, dir: d });
    } else if (type === "roller") {
      // lotrechte Richtung: die Basisachse mit dem größten y-Anteil
      let best = 0;
      basis.forEach((axis, d) => { if (Math.abs(axis[1]) > Math.abs(basis[best][1])) best = d; });
      reactionDofs.push({ node: nodeIndex, dir: best });
    }
  });
  const r = reactionDofs.length;
  const required = dim === 2 ? 3 : 6;

  if (r < required) {
    return {
      ok: false,
      message: `Zu wenige Auflagerbindungen: ${dim === 2 ? "ebenes" : "räumliches"} System benötigt mindestens ${required}, vorhanden sind ${r}.`,
      dimension: dim,
    };
  }

  const degree = m + r - dim * n;
  if (degree < 0) {
    return {
      ok: false,
      message: `System ${-degree}-fach verschieblich (kinematisch): ${m} Stäbe + ${r} Auflagerbindungen < ${dim * n} Gleichgewichtsbedingungen. Fehlende Diagonale oder Auflagerbindung ergänzen.`,
      dimension: dim,
    };
  }
  if (degree > 0) {
    return {
      ok: false,
      message: `System ${degree}-fach statisch unbestimmt. Dieses Verfahren löst nur statisch bestimmte Fachwerke – überzählige Stäbe oder Auflagerbindungen entfernen.`,
      dimension: dim,
    };
  }

  const size = dim * n;
  const A = Array.from({ length: size }, () => new Array(size).fill(0));
  const b = new Array(size).fill(0);

  bars.forEach((bar, j) => {
    const na = nodes[bar.a];
    const nb = nodes[bar.b];
    const d = [nb.x - na.x, nb.y - na.y, nb.z - na.z];
    const len = Math.hypot(d[0], d[1], d[2]);
    if (len < 1e-9) return;
    const unit = [d[0] / len, d[1] / len, d[2] / len];

    basis.forEach((axis, k) => {
      const c = unit[0] * axis[0] + unit[1] * axis[1] + unit[2] * axis[2];
      A[dim * bar.a + k][j] += c;
      A[dim * bar.b + k][j] -= c;
    });
  });

  reactionDofs.forEach((dof, k) => {
    A[dim * dof.node + dof.dir][m + k] = 1;
  });

  loads.forEach((load, nodeIndex) => {
    if (!load) return;
    const f = [load.fx || 0, load.fy || 0, load.fz || 0];
    basis.forEach((axis, k) => {
      b[dim * nodeIndex + k] = -(f[0] * axis[0] + f[1] * axis[1] + f[2] * axis[2]);
    });
  });

  const x = solveLinearSystem(A, b);
  if (!x) {
    return {
      ok: false,
      message: "System nicht lösbar (verschieblich oder Auflager ungünstig angeordnet), z. B. drei parallele oder in einem Punkt schneidende Auflagerkräfte.",
      dimension: dim,
    };
  }

  const forces = {};
  bars.forEach((bar, j) => {
    forces[bar.id] = Math.abs(x[j]) < 0.05 ? 0 : x[j]; // numerisches Rauschen abschneiden
  });

  const reactions = reactionDofs.map((dof, k) => ({
    node: dof.node,
    dir: basis[dof.dir][1] > 0.7 ? "y" : "h", // lotrecht oder waagerecht
    axis: basis[dof.dir],
    value: x[m + k],
  }));

  return {
    ok: true,
    forces,
    reactions,
    dimension: dim,
    message: dim === 2 ? "Stabkräfte berechnet (ebenes System)." : "Stabkräfte berechnet (räumliches System).",
  };
}
