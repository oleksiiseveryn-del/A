/**
 * Bemessung nach DIN EN 1993-1-1 (Eurocode 3) - vereinfachtes
 * Vorbemessungsverfahren für Stützen, Fachwerkstäbe und Riegel.
 *
 * Hinweis: Dieses Modul dient der überschlägigen Profilfindung in der
 * Skizzenphase. Die endgültige Bemessung (inkl. Anschlüsse, Stabilität
 * des Gesamtsystems, Brandschutz, Ausführungsklasse etc.) ist von einem
 * Tragwerksplaner mit zugelassener Statiksoftware zu führen.
 */
const STEEL_GRADES = {
  S235: { fy: 235 },
  S275: { fy: 275 },
  S355: { fy: 355 },
};

const E_MODUL = 210000; // N/mm²
const GAMMA_M0 = 1.0;
const GAMMA_M1 = 1.0;

function bucklingReductionFactor(lambdaBar, alpha) {
  const phi = 0.5 * (1 + alpha * (lambdaBar - 0.2) + lambdaBar * lambdaBar);
  const chi = 1 / (phi + Math.sqrt(Math.max(phi * phi - lambdaBar * lambdaBar, 0)));
  return Math.min(chi, 1.0);
}

// Druckstab-Nachweis: Biegeknicken um die maßgebende (schwache) Achse
function checkCompression(profile, alpha, N_Ed_kN, Lcr_m, fy) {
  const A_mm2 = profile.A * 100; // cm² -> mm²
  const i_mm = Math.min(profile.iy, profile.iz) * 10; // cm -> mm
  const Lcr_mm = Lcr_m * 1000;

  const lambda = Lcr_mm / i_mm;
  const lambda1 = Math.PI * Math.sqrt(E_MODUL / fy);
  const lambdaBar = lambda / lambda1;
  const chi = bucklingReductionFactor(lambdaBar, alpha);

  const N_pl_Rd_kN = (A_mm2 * fy) / GAMMA_M0 / 1000;
  const N_b_Rd_kN = (chi * A_mm2 * fy) / GAMMA_M1 / 1000;

  return {
    resistance_kN: N_b_Rd_kN,
    utilization: N_Ed_kN / N_b_Rd_kN,
    lambdaBar,
    chi,
    plasticResistance_kN: N_pl_Rd_kN,
  };
}

// Zugstab-Nachweis: Fließen des Bruttoquerschnitts (vereinfacht, ohne Nettoquerschnittsabzug)
function checkTension(profile, N_Ed_kN, fy) {
  const A_mm2 = profile.A * 100;
  const N_t_Rd_kN = (A_mm2 * fy) / GAMMA_M0 / 1000;
  return {
    resistance_kN: N_t_Rd_kN,
    utilization: N_Ed_kN / N_t_Rd_kN,
  };
}

// Biegenachweis: elastischer Nachweis (auf der sicheren Seite ggü. plastisch)
function checkBending(profile, M_Ed_kNm, fy) {
  const Wy_mm3 = profile.Wy * 1000; // cm³ -> mm³
  const M_Rd_kNm = (Wy_mm3 * fy) / GAMMA_M0 / 1e6;
  return {
    resistance_kNm: M_Rd_kNm,
    utilization: M_Ed_kNm / M_Rd_kNm,
  };
}

/**
 * Findet das leichteste passende Profil für ein Bauteil.
 * @param {Object} member - { loadType, length, force, moment, beta, family, steelGrade }
 * @returns {Object} Ergebnis mit gewähltem Profil, Familie, Auslastung, Gewicht, Status
 */
function findSuitableProfile(member) {
  const fy = STEEL_GRADES[member.steelGrade].fy;
  const families = member.family === "AUTO"
    ? (MEMBER_TYPE_DEFAULTS[member.type] || MEMBER_TYPE_DEFAULTS["Sonstige"]).families
    : [member.family];

  let candidates = [];
  families.forEach((fam) => {
    const table = STEEL_DB[fam];
    if (!table) return;
    table.forEach((profile) => candidates.push({ profile, family: fam }));
  });
  // Leichtestes Profil zuerst prüfen -> erstes, das den Nachweis erfüllt, gewinnt
  candidates.sort((a, b) => a.profile.G - b.profile.G);

  let best = null;
  let firstOverflow = null;

  for (const cand of candidates) {
    const { profile, family } = cand;
    let result;
    if (member.loadType === "Druck") {
      const alpha = FAMILY_BUCKLING_CURVE[family] || 0.49;
      result = checkCompression(profile, alpha, member.force, member.beta * member.length, fy);
    } else if (member.loadType === "Zug") {
      result = checkTension(profile, member.force, fy);
    } else {
      result = checkBending(profile, member.moment, fy);
    }

    if (result.utilization <= 1.0) {
      best = { profile, family, result };
      break;
    }
    firstOverflow = { profile, family, result };
  }

  if (best) {
    const weightPerMeter = best.profile.G;
    const totalWeight = weightPerMeter * member.length;
    const util = best.result.utilization;
    let status = "ok";
    if (util > 0.95) status = "knapp";
    return {
      profileName: best.profile.name,
      family: best.family,
      utilization: util,
      weightPerMeter,
      totalWeight,
      status,
      detail: best.result,
    };
  }

  // Keine Tabellenposition ausreichend -> größtes geprüftes Profil melden
  const fallback = firstOverflow || (candidates.length ? { ...candidates[candidates.length - 1], result: null } : null);
  return {
    profileName: fallback ? fallback.profile.name + " (nicht ausreichend!)" : "-",
    family: fallback ? fallback.family : "-",
    utilization: fallback && fallback.result ? fallback.result.utilization : 99,
    weightPerMeter: fallback ? fallback.profile.G : 0,
    totalWeight: fallback ? fallback.profile.G * member.length : 0,
    status: "fehler",
    detail: fallback ? fallback.result : null,
  };
}
