/**
 * Bemessung nach DIN EN 1993-1-1 (Eurocode 3) mit deutschem Nationalen Anhang
 * - vereinfachtes Vorbemessungsverfahren für Stützen, Fachwerkstäbe und Riegel.
 *
 * GEFÜHRTE NACHWEISE
 *   - Biegeknicken um die schwache Achse   Abs. 6.3.1, Gl. (6.46)/(6.49)
 *   - Zug: Fließen des Bruttoquerschnitts  Abs. 6.2.3, Gl. (6.6)
 *   - Zug: Bruch des Nettoquerschnitts     Abs. 6.2.3, Gl. (6.7), sofern Lochabzug angegeben
 *   - Biegung, elastisch                   Abs. 6.2.5, Gl. (6.13)
 *
 * NICHT GEFÜHRT (siehe Rechengrundlagen in der Anwendung)
 *   Querschnittsklassifizierung, Biegedrillknicken, Interaktion N+M+V,
 *   Anschlüsse (EN 1993-1-8), Gebrauchstauglichkeit, Brandfall, Ermüdung.
 *
 * Dieses Modul dient der überschlägigen Profilfindung in der Skizzenphase und
 * ersetzt keine prüffähige Statik.
 */
const STEEL_GRADES = {
  // f_y und f_u nach DIN EN 1993-1-1, Tab. 3.1 (Erzeugnisdicke t ≤ 40 mm)
  S235: { fy: 235, fu: 360 },
  S275: { fy: 275, fu: 430 },
  S355: { fy: 355, fu: 490 },
};

const E_MODUL = 210000; // N/mm²

/**
 * Teilsicherheitsbeiwerte. Vorbelegt nach DIN EN 1993-1-1/NA (Deutschland):
 * γM0 = 1,0 für Querschnittsnachweise, γM1 = 1,1 für Stabilitätsnachweise,
 * γM2 = 1,25 für Bruchversagen auf Zug.
 * Die EN-Empfehlung lautet abweichend γM1 = 1,0.
 */
const PARTIAL_FACTORS = { gammaM0: 1.0, gammaM1: 1.1, gammaM2: 1.25 };

// Schlankheitsempfehlung der deutschen Stahlbaupraxis (keine Normvorgabe des EC3)
const SLENDERNESS_LIMIT_COMPRESSION = 200;

function bucklingReductionFactor(lambdaBar, alpha) {
  const phi = 0.5 * (1 + alpha * (lambdaBar - 0.2) + lambdaBar * lambdaBar);
  const chi = 1 / (phi + Math.sqrt(Math.max(phi * phi - lambdaBar * lambdaBar, 0)));
  return Math.min(chi, 1.0);
}

/**
 * Druckstab: Biegeknicken um die maßgebende (schwache) Achse.
 * N_b,Rd = χ · A · f_y / γM1   (Gl. 6.47)
 */
function checkCompression(profile, alpha, N_Ed_kN, Lcr_m, fy) {
  const A_mm2 = profile.A * 100; // cm² -> mm²
  const i_mm = Math.min(profile.iy, profile.iz) * 10; // cm -> mm
  const Lcr_mm = Lcr_m * 1000;

  const lambda = Lcr_mm / i_mm;
  const lambda1 = Math.PI * Math.sqrt(E_MODUL / fy); // Gl. (6.50)
  const lambdaBar = lambda / lambda1;
  const chi = bucklingReductionFactor(lambdaBar, alpha);

  const N_b_Rd_kN = (chi * A_mm2 * fy) / PARTIAL_FACTORS.gammaM1 / 1000;

  return {
    resistance_kN: N_b_Rd_kN,
    utilization: N_Ed_kN / N_b_Rd_kN,
    lambda,
    lambdaBar,
    chi,
    alpha,
    warnings: lambda > SLENDERNESS_LIMIT_COMPRESSION
      ? [`Schlankheit λ = ${lambda.toFixed(0)} über dem Praxisrichtwert ${SLENDERNESS_LIMIT_COMPRESSION}`]
      : [],
  };
}

/**
 * Zugstab: maßgebend ist der kleinere Wert aus Fließen des Bruttoquerschnitts
 * (Gl. 6.6) und Bruch des Nettoquerschnitts im Anschlussbereich (Gl. 6.7).
 * @param {number} netRatio - A_net / A (1,0 = ohne Lochabzug)
 */
function checkTension(profile, N_Ed_kN, fy, fu, netRatio) {
  const A_mm2 = profile.A * 100;
  const N_pl_Rd_kN = (A_mm2 * fy) / PARTIAL_FACTORS.gammaM0 / 1000;

  const ratio = typeof netRatio === "number" && netRatio > 0 && netRatio < 1 ? netRatio : 1;
  const N_u_Rd_kN = ratio < 1
    ? (0.9 * ratio * A_mm2 * fu) / PARTIAL_FACTORS.gammaM2 / 1000
    : Infinity;

  const N_t_Rd_kN = Math.min(N_pl_Rd_kN, N_u_Rd_kN);
  return {
    resistance_kN: N_t_Rd_kN,
    utilization: N_Ed_kN / N_t_Rd_kN,
    plasticResistance_kN: N_pl_Rd_kN,
    ultimateResistance_kN: N_u_Rd_kN,
    governing: N_u_Rd_kN < N_pl_Rd_kN ? "Nettoquerschnitt" : "Bruttoquerschnitt",
    warnings: [],
  };
}

/**
 * Biegung, elastischer Nachweis: M_el,Rd = W_el,y · f_y / γM0 (Gl. 6.13).
 * Ohne Nachweis des Biegedrillknickens - dieser ist gesondert zu führen.
 */
function checkBending(profile, M_Ed_kNm, fy) {
  const Wy_mm3 = profile.Wy * 1000; // cm³ -> mm³
  const M_Rd_kNm = (Wy_mm3 * fy) / PARTIAL_FACTORS.gammaM0 / 1e6;
  return {
    resistance_kNm: M_Rd_kNm,
    utilization: M_Ed_kNm / M_Rd_kNm,
    warnings: ["Biegedrillknicken (Abs. 6.3.2) nicht geführt - seitliche Halterung nachweisen"],
  };
}

/**
 * Findet das leichteste Profil, das den maßgebenden Nachweis erfüllt.
 * @param {Object} member - { type, loadType, length, force, moment, beta, family, steelGrade, netRatio }
 */
function findSuitableProfile(member) {
  const grade = STEEL_GRADES[member.steelGrade] || STEEL_GRADES.S235;
  const families = member.family === "AUTO"
    ? (MEMBER_TYPE_DEFAULTS[member.type] || MEMBER_TYPE_DEFAULTS["Sonstige"]).families
    : [member.family];

  const candidates = [];
  families.forEach((fam) => {
    const table = STEEL_DB[fam];
    if (!table) return;
    table.forEach((profile) => candidates.push({ profile, family: fam }));
  });
  // Leichtestes Profil zuerst prüfen -> erstes, das den Nachweis erfüllt, gewinnt
  candidates.sort((a, b) => a.profile.G - b.profile.G);

  function verify(profile, family) {
    if (member.loadType === "Druck") {
      return checkCompression(profile, bucklingAlpha(family, profile), member.force, member.beta * member.length, grade.fy);
    }
    if (member.loadType === "Zug") {
      return checkTension(profile, member.force, grade.fy, grade.fu, member.netRatio);
    }
    return checkBending(profile, member.moment, grade.fy);
  }

  let best = null;
  let lastChecked = null;

  for (const cand of candidates) {
    const result = verify(cand.profile, cand.family);
    lastChecked = { ...cand, result };
    if (result.utilization <= 1.0) {
      best = lastChecked;
      break;
    }
  }

  const chosen = best || lastChecked;
  if (!chosen) {
    return { profileName: "-", family: "-", utilization: 99, weightPerMeter: 0, totalWeight: 0, status: "fehler", detail: null, warnings: [] };
  }

  const util = chosen.result.utilization;
  let status = "ok";
  if (!best) status = "fehler";
  else if (util > 0.95) status = "knapp";

  return {
    profileName: best ? chosen.profile.name : chosen.profile.name + " (nicht ausreichend!)",
    family: chosen.family,
    utilization: util,
    weightPerMeter: chosen.profile.G,
    totalWeight: chosen.profile.G * member.length,
    status,
    detail: chosen.result,
    warnings: chosen.result.warnings || [],
  };
}
