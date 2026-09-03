/**
 * Querschnittsumrisse der Profile für die räumliche Darstellung.
 *
 * Geliefert wird der Umriss in mm, bezogen auf den Schwerpunkt, mit
 * y in Richtung der starken Achse (Steghöhe) und x in Richtung der
 * schwachen Achse. Ausrundungen der Walzprofile bleiben unberücksichtigt -
 * die Darstellung ist maßstäblich, aber nicht werkstattgenau.
 */

/** Maße aus dem Profilnamen lesen, z. B. "RHS 100x100x6" oder "Rohr 48.3x3.2". */
function parseSectionName(name) {
  const numbers = (name.match(/[\d.]+/g) || []).map(Number);
  return numbers;
}

/**
 * @returns {Object} { outline: [[x,y], …], holes: [[[x,y], …]], round: bool, d, t }
 */
function sectionProfile(family, profile) {
  const nums = parseSectionName(profile.name);

  switch (family) {
    case "IPE":
    case "HEA":
    case "HEB": {
      const h = profile.h, b = profile.b, tw = profile.tw, tf = profile.tf;
      const hw = h / 2, bw = b / 2, sw = tw / 2;
      // I-Querschnitt, im Uhrzeigersinn ab der rechten oberen Ecke
      return {
        outline: [
          [bw, hw], [-bw, hw], [-bw, hw - tf], [-sw, hw - tf],
          [-sw, -hw + tf], [-bw, -hw + tf], [-bw, -hw], [bw, -hw],
          [bw, -hw + tf], [sw, -hw + tf], [sw, hw - tf], [bw, hw - tf],
        ],
        holes: [],
      };
    }

    case "UPE": {
      const h = profile.h, b = profile.b, tw = profile.tw, tf = profile.tf;
      const hw = h / 2;
      // U-Querschnitt, Steg links, Flansche nach rechts
      return {
        outline: [
          [0, hw], [b, hw], [b, hw - tf], [tw, hw - tf],
          [tw, -hw + tf], [b, -hw + tf], [b, -hw], [0, -hw],
        ].map(([x, y]) => [x - b / 3, y]), // grob auf den Schwerpunkt bezogen
        holes: [],
      };
    }

    case "RHS": {
      const [b, h, t] = [nums[0], nums[1], nums[2]];
      const bw = b / 2, hw = h / 2, bi = b / 2 - t, hi = h / 2 - t;
      return {
        outline: [[bw, hw], [-bw, hw], [-bw, -hw], [bw, -hw]],
        holes: [[[bi, hi], [-bi, hi], [-bi, -hi], [bi, -hi]]],
      };
    }

    case "ROHR": {
      const [d, t] = [nums[0], nums[1]];
      return { outline: [], holes: [], round: true, d, t };
    }

    case "L": {
      const [a, , t] = nums; // Schenkellänge, Schenkellänge, Dicke
      // Schwerpunktabstand des gleichschenkligen Winkels
      const e = (a * a + t * (a - t) / 2) / (2 * a - t) / 2 + t / 2;
      const s = a - e;
      return {
        outline: [
          [-e, -e], [s, -e], [s, -e + t], [-e + t, -e + t], [-e + t, s], [-e, s],
        ],
        holes: [],
      };
    }

    case "2L": {
      const [a, , t] = nums;
      const gap = 10; // Futterblechdicke
      const e = (a * a + t * (a - t) / 2) / (2 * a - t) / 2 + t / 2;
      const s = a - e;
      const leg = [[-e, -e], [s, -e], [s, -e + t], [-e + t, -e + t], [-e + t, s], [-e, s]];
      // Zwei Winkel Rücken an Rücken: der zweite gespiegelt und versetzt
      return {
        outline: leg.map(([x, y]) => [x + gap / 2 + e, y]),
        extra: [leg.map(([x, y]) => [-(x + gap / 2 + e), y])],
        holes: [],
      };
    }

    default:
      return { outline: [[-50, -50], [50, -50], [50, 50], [-50, 50]], holes: [] };
  }
}

/** Größte Querschnittsabmessung in mm - für Kameraabstand und Fangtoleranzen. */
function sectionSize(family, profile) {
  const s = sectionProfile(family, profile);
  if (s.round) return s.d;
  const points = s.outline.concat(...(s.extra || []));
  if (!points.length) return 100;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}
