/**
 * Anschlussblatt: die Verbindung als maßstäbliche Skizze mit dem
 * Nachweisprotokoll auf einem Blatt A4 quer.
 *
 * Gezeichnet wird, was der Werkstattzeichner und der Prüfer brauchen:
 * das Schraubenbild mit Rand- und Lochabständen, die Bleche mit ihren
 * Dicken, die Nähte mit ihrer Dicke und Länge. Darunter stehen die
 * geführten Nachweise mit Beanspruchung, Tragfähigkeit und Ausnutzung.
 *
 * Die Zeichnung ist eine Anschlussskizze, keine Werkstattzeichnung:
 * Toleranzen, Schweißnahtsymbole nach DIN EN ISO 2553, Passungen,
 * Oberflächenschutz und die Stückliste der Bauteile fehlen.
 */

/** Anschlussblatt zeichnen. */
function anschlussblattSVG(daten) {
  const { anschluss, eingabe, bezeichnung, projekt } = daten;
  const a = anschluss.angaben;
  const zahl = (w, s) => Number(w).toFixed(s === undefined ? 2 : s).replace(".", ",");

  const feldX = BLATT.randLinks;
  const feldY = BLATT.randOben + 6;
  const feldB = 150;
  const feldH = 96;

  let svg = `<rect x="0" y="0" width="${BLATT.breite}" height="${BLATT.hoehe}" fill="#ffffff"/>`;
  svg += `<rect x="${BLATT.randLinks - 5}" y="${BLATT.randOben - 6}" `
    + `width="${BLATT.breite - BLATT.randLinks - BLATT.randRechts + 8}" `
    + `height="${BLATT.hoehe - BLATT.randOben - BLATT.randUnten + 8}" class="rahmen"/>`;
  svg += `<text x="${BLATT.randLinks}" y="${BLATT.randOben}" class="t-kopf">`
    + `Anschluss ${bezeichnung} – ${ANSCHLUSSARTEN[a.art].name}</text>`;
  svg += `<text x="${BLATT.breite - BLATT.randRechts}" y="${BLATT.randOben}" class="t-kopf-rechts">`
    + `${projekt.name || "Projekt"}</text>`;

  // ---- Zeichnung
  let nenner = 10;
  if (a.art === "stirnplatte") {
    const hoehe = Math.max(...a.reihen.map((r) => r.abstand)) + 100;
    nenner = Math.max(5, Math.ceil((hoehe * 1) / (feldH - 20) / 5) * 5);
    svg += stirnplatteZeichnung(a, eingabe, feldX, feldY, feldB, feldH, nenner, zahl);
  } else if (a.art === "knotenblech_geschraubt") {
    const laenge = a.lage.e1 + (a.proReihe - 1) * (a.lage.p1 || 0) + 60;
    nenner = Math.max(2, Math.ceil(laenge / (feldB - 40) / 2) * 2);
    svg += knotenblechZeichnung(a, eingabe, feldX, feldY, feldB, feldH, nenner, zahl);
  } else {
    nenner = Math.max(2, Math.ceil((eingabe.laenge + 80) / (feldB - 40) / 2) * 2);
    svg += schweissZeichnung(a, eingabe, feldX, feldY, feldB, feldH, nenner, zahl);
  }

  // ---- Nachweistabelle
  const tx = feldX + feldB + 4;
  let ty = feldY + 4;
  svg += `<text x="${tx}" y="${ty}" class="t-th">Nachweise nach DIN EN 1993-1-8</text>`;
  ty += 4.6;
  svg += `<text x="${tx}" y="${ty}" class="t-mini">Nachweis · E_d / R_d · Ausnutzung</text>`;
  ty += 4;
  anschluss.nachweise.forEach((n) => {
    const farbe = n.ausnutzung > 1 ? "#b3392c" : n.ausnutzung > 0.95 ? "#c07a1e" : "#1b2733";
    svg += `<text x="${tx}" y="${ty}" class="t-mini" fill="${farbe}">${n.name}</text>`;
    ty += 3.3;
    svg += `<text x="${tx + 3}" y="${ty}" class="t-mono" fill="${farbe}">`
      + `${zahl(n.Ed)} / ${zahl(n.Rd)} ${n.einheit} = ${zahl(n.ausnutzung, 3)}</text>`;
    ty += 4.2;
  });

  ty += 1;
  svg += `<text x="${tx}" y="${ty}" class="t-th">Maßgebend: ${anschluss.massgebend.name}</text>`;
  ty += 4;
  const status = anschluss.status === "ok" ? "Nachweis erfüllt"
    : anschluss.status === "grenzwertig" ? "erfüllt, aber über 95 % ausgenutzt" : "NICHT ERFÜLLT";
  svg += `<text x="${tx}" y="${ty}" class="t-th" fill="${anschluss.status === "fehler" ? "#b3392c" : "#2f7d4f"}">`
    + `Ausnutzung ${zahl(anschluss.ausnutzung, 3)} – ${status}</text>`;
  ty += 5;

  anschluss.meldungen.slice(0, 6).forEach((m) => {
    svg += `<text x="${tx}" y="${ty}" class="t-mini" fill="${m.art === "fehler" ? "#b3392c" : "#c07a1e"}">`
      + `${m.art === "fehler" ? "✕" : "!"} ${m.text.slice(0, 62)}</text>`;
    ty += 3.4;
  });

  // ---- Schriftfeld
  const sfB = 104, sfH = 30;
  const sfX = BLATT.breite - BLATT.randRechts - sfB;
  const sfY = BLATT.hoehe - BLATT.randUnten - sfH;
  svg += `<rect x="${sfX}" y="${sfY}" width="${sfB}" height="${sfH}" class="schriftfeld"/>`;
  svg += `<line x1="${sfX}" y1="${sfY + 9}" x2="${sfX + sfB}" y2="${sfY + 9}" class="schriftfeld"/>`;
  svg += `<line x1="${sfX}" y1="${sfY + 19}" x2="${sfX + sfB}" y2="${sfY + 19}" class="schriftfeld"/>`;
  svg += `<line x1="${sfX + 62}" y1="${sfY + 19}" x2="${sfX + 62}" y2="${sfY + sfH}" class="schriftfeld"/>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 6}" class="t-firma">HSD Hamburg GmbH</text>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 15}" class="t-klein">Anschluss ${bezeichnung} · `
    + `${a.guete || ""} · γM0 = 1,00 · γM2 = 1,25</text>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 25}" class="t-klein">Bearbeiter: ${projekt.bearbeiter || ""}</text>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 28.5}" class="t-klein">Datum: ${projekt.datum || ""}</text>`;
  svg += `<text x="${sfX + 65}" y="${sfY + 25}" class="t-massstab">M 1:${nenner}</text>`;
  svg += `<text x="${sfX + 65}" y="${sfY + 28.5}" class="t-klein">Anschlussblatt</text>`;

  svg += `<text x="${BLATT.randLinks}" y="${BLATT.hoehe - 4}" class="t-hinweis">`
    + "Anschlussskizze, keine Werkstattzeichnung. Nicht geführt: gleitfeste Verbindungen, Schraubengruppen "
    + "nach Tab. 6.6, Stützenstegnachweise, Steifen, Ermüdung, Brandfall. Nachgiebigkeit nach Abs. 6.3 nicht "
    + "bestimmt – der Anschluss ist im Tragwerk entsprechend abzubilden.</text>";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BLATT.breite} ${BLATT.hoehe}" width="100%" style="background:#fff">
<style>
  .rahmen { fill: none; stroke: #1b2733; stroke-width: 0.5; }
  .schriftfeld { fill: none; stroke: #1b2733; stroke-width: 0.35; }
  .blech { fill: #e8edf1; stroke: #1b2733; stroke-width: 0.4; }
  .stab { fill: #cfd8de; stroke: #1b2733; stroke-width: 0.5; }
  .platte { fill: #dde5ea; stroke: #1b2733; stroke-width: 0.5; }
  .loch { fill: #ffffff; stroke: #1b2733; stroke-width: 0.3; }
  .naht { fill: #b3392c; stroke: #b3392c; stroke-width: 0.3; }
  .achse { stroke: #b3392c; stroke-width: 0.25; stroke-dasharray: 4 1.2 0.8 1.2; }
  .ml, .mhl, .mb { stroke: #1b2733; }
  .ml { stroke-width: 0.25; }
  .mhl { stroke-width: 0.13; }
  .mb { stroke-width: 0.35; }
  .kraft { stroke: #1f6b8f; stroke-width: 0.5; }
  .kraftspitze { fill: #1f6b8f; }
  text { font-family: "IBM Plex Sans", Arial, sans-serif; fill: #1b2733; }
  .t-kopf { font-size: 3.4px; font-weight: 700; }
  .t-kopf-rechts { font-size: 3.4px; font-weight: 600; text-anchor: end; }
  .t-th { font-size: 2.6px; font-weight: 700; }
  .t-mini { font-size: 2.3px; }
  .t-mono { font-size: 2.3px; font-family: "IBM Plex Mono", monospace; }
  .t-mass { font-size: 2.4px; text-anchor: middle; }
  .t-klein { font-size: 2.4px; }
  .t-firma { font-size: 4.5px; font-weight: 700; }
  .t-massstab { font-size: 4px; font-weight: 600; }
  .t-hinweis { font-size: 2.2px; fill: #64707c; }
  .t-kraft { font-size: 2.6px; font-weight: 700; fill: #1f6b8f; }
</style>
${svg}
</svg>`;
}

/** Schraubenbild am Knotenblech, Draufsicht. */
function knotenblechZeichnung(a, e, x0, y0, breite, hoehe, nenner, zahl) {
  const m = (mm) => mm / nenner;                 // Millimeter Bauteil -> Blatt
  const reihen = a.reihen, proReihe = a.proReihe;
  const p1 = a.lage.p1 || 0, p2 = a.lage.p2 || 0;
  const laengeBlech = a.lage.e1 * 2 + (proReihe - 1) * p1;
  const breiteBlech = (reihen - 1) * p2 + 2 * a.lage.e2;

  const mitteY = y0 + hoehe / 2;
  const linksX = x0 + 30;
  let svg = "";

  // Knotenblech
  svg += `<rect x="${linksX.toFixed(2)}" y="${(mitteY - m(breiteBlech) / 2).toFixed(2)}" `
    + `width="${m(laengeBlech).toFixed(2)}" height="${m(breiteBlech).toFixed(2)}" class="blech"/>`;
  // Stab, von rechts kommend, überlappt das Blech
  const stabB = m(Math.max(breiteBlech * 0.8, 60));
  svg += `<rect x="${(linksX + m(a.lage.e1)).toFixed(2)}" y="${(mitteY - stabB / 2).toFixed(2)}" `
    + `width="${(m(laengeBlech) - m(a.lage.e1) + 30).toFixed(2)}" height="${stabB.toFixed(2)}" class="stab"/>`;

  // Schrauben
  for (let r = 0; r < reihen; r++) {
    for (let i = 0; i < proReihe; i++) {
      const cx = linksX + m(a.lage.e1 + i * p1);
      const cy = mitteY - m(breiteBlech) / 2 + m(a.lage.e2 + r * p2);
      svg += `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${m(a.schraube.d0 / 2).toFixed(2)}" class="loch"/>`;
      svg += `<line x1="${(cx - 1.4).toFixed(2)}" y1="${cy.toFixed(2)}" x2="${(cx + 1.4).toFixed(2)}" y2="${cy.toFixed(2)}" class="achse"/>`;
      svg += `<line x1="${cx.toFixed(2)}" y1="${(cy - 1.4).toFixed(2)}" x2="${cx.toFixed(2)}" y2="${(cy + 1.4).toFixed(2)}" class="achse"/>`;
    }
  }

  // Maßkette in Kraftrichtung
  const punkte = [linksX];
  for (let i = 0; i < proReihe; i++) punkte.push(linksX + m(a.lage.e1 + i * p1));
  punkte.push(linksX + m(laengeBlech));
  const massY = mitteY + m(breiteBlech) / 2 + 10;
  svg += massketteWaagerecht(punkte, massY, mitteY + m(breiteBlech) / 2, "");
  const texte = [`e₁ = ${zahl(a.lage.e1, 0)}`];
  for (let i = 1; i < proReihe; i++) texte.push(`p₁ = ${zahl(p1, 0)}`);
  texte.push(`e₁ = ${zahl(a.lage.e1, 0)}`);
  texte.forEach((t, i) => {
    const mitte = (punkte[i] + punkte[i + 1]) / 2;
    svg += `<text x="${mitte.toFixed(2)}" y="${(massY - 1.2).toFixed(2)}" class="t-mass">${t}</text>`;
  });

  // Kraftpfeil
  const pfeilY = mitteY;
  const pfeilX = linksX + m(laengeBlech) + 26;
  svg += `<line x1="${(pfeilX - 16).toFixed(2)}" y1="${pfeilY}" x2="${pfeilX.toFixed(2)}" y2="${pfeilY}" class="kraft"/>`;
  svg += `<polygon points="${pfeilX},${pfeilY} ${(pfeilX - 3).toFixed(2)},${(pfeilY - 1.4).toFixed(2)} `
    + `${(pfeilX - 3).toFixed(2)},${(pfeilY + 1.4).toFixed(2)}" class="kraftspitze"/>`;
  svg += `<text x="${(pfeilX - 8).toFixed(2)}" y="${(pfeilY - 2.5).toFixed(2)}" class="t-kraft" text-anchor="middle">`
    + `N_Ed = ${zahl(e.N_Ed, 1)} kN</text>`;

  // Beschriftung
  let ty = y0 + 3;
  [`Knotenblech t = ${zahl(e.tBlech, 1)} mm, ${a.guete}`,
   `Anschlussteil t = ${zahl(e.tStab, 1)} mm`,
   `${a.anzahl} × ${Object.keys(SCHRAUBEN).find((k) => SCHRAUBEN[k].d === a.schraube.d)} `
     + `${Object.keys(SCHRAUBENKLASSEN).find((k) => SCHRAUBENKLASSEN[k].fub === a.klasse.fub)}, `
     + `${a.scherfugen}-schnittig, d₀ = ${a.schraube.d0} mm`,
   `Lochabstände e₁ = ${zahl(a.lage.e1, 0)} · e₂ = ${zahl(a.lage.e2, 0)}`
     + (p1 ? ` · p₁ = ${zahl(p1, 0)}` : "") + (p2 ? ` · p₂ = ${zahl(p2, 0)}` : "") + " mm",
   `A = ${zahl(a.Abrutto, 0)} mm² · A_net = ${zahl(a.Anet, 0)} mm²`,
  ].forEach((t) => { svg += `<text x="${x0}" y="${ty}" class="t-mini">${t}</text>`; ty += 3.4; });

  return svg;
}

/** Geschweißter Stabanschluss, Draufsicht mit Nahtdarstellung. */
function schweissZeichnung(a, e, x0, y0, breite, hoehe, nenner, zahl) {
  const m = (mm) => mm / nenner;
  const mitteY = y0 + hoehe / 2;
  const linksX = x0 + 24;
  const stabB = m(Math.max(e.laenge * 0.5, 60));
  let svg = "";

  svg += `<rect x="${linksX.toFixed(2)}" y="${(mitteY - stabB / 2 - m(20)).toFixed(2)}" `
    + `width="${(m(e.laenge) + 20).toFixed(2)}" height="${(stabB + m(40)).toFixed(2)}" class="blech"/>`;
  svg += `<rect x="${linksX.toFixed(2)}" y="${(mitteY - stabB / 2).toFixed(2)}" `
    + `width="${(m(e.laenge) + 30).toFixed(2)}" height="${stabB.toFixed(2)}" class="stab"/>`;

  // Nähte als Dreiecksreihe längs beider Kanten
  const nahtDicke = Math.max(0.8, m(e.a));
  [mitteY - stabB / 2, mitteY + stabB / 2].forEach((y, seite) => {
    const richtung = seite === 0 ? -1 : 1;
    const anzahl = Math.max(4, Math.floor(m(e.laenge) / 2));
    for (let i = 0; i < anzahl; i++) {
      const x = linksX + (i * m(e.laenge)) / anzahl;
      const b = m(e.laenge) / anzahl;
      svg += `<polygon points="${x.toFixed(2)},${y.toFixed(2)} ${(x + b).toFixed(2)},${y.toFixed(2)} `
        + `${x.toFixed(2)},${(y + richtung * nahtDicke).toFixed(2)}" class="naht"/>`;
    }
    svg += `<text x="${(linksX + m(e.laenge) / 2).toFixed(2)}" y="${(y + richtung * (nahtDicke + 3.5)).toFixed(2)}" `
      + `class="t-mass" fill="#b3392c">a ${zahl(e.a, 0)} — ${zahl(e.laenge, 0)}</text>`;
  });

  const massY = mitteY + stabB / 2 + m(20) + 12;
  svg += massketteWaagerecht([linksX, linksX + m(e.laenge)], massY, mitteY + stabB / 2 + m(20), "");
  svg += `<text x="${(linksX + m(e.laenge) / 2).toFixed(2)}" y="${(massY - 1.2).toFixed(2)}" class="t-mass">`
    + `ℓ = ${zahl(e.laenge, 0)}</text>`;

  const pfeilX = linksX + m(e.laenge) + 34;
  svg += `<line x1="${(pfeilX - 16).toFixed(2)}" y1="${mitteY}" x2="${pfeilX.toFixed(2)}" y2="${mitteY}" class="kraft"/>`;
  svg += `<polygon points="${pfeilX},${mitteY} ${(pfeilX - 3).toFixed(2)},${(mitteY - 1.4).toFixed(2)} `
    + `${(pfeilX - 3).toFixed(2)},${(mitteY + 1.4).toFixed(2)}" class="kraftspitze"/>`;
  svg += `<text x="${(pfeilX - 8).toFixed(2)}" y="${(mitteY - 2.5).toFixed(2)}" class="t-kraft" text-anchor="middle">`
    + `N_Ed = ${zahl(e.N_Ed, 1)} kN</text>`;

  let ty = y0 + 3;
  [`Knotenblech t = ${zahl(e.tBlech, 1)} mm, ${a.guete}`,
   `Stab t = ${zahl(e.tStab, 1)} mm`,
   `${a.anzahl} Kehlnähte a = ${zahl(e.a, 1)} mm, ℓ = ${zahl(e.laenge, 0)} mm`,
   `β_w = ${zahl(a.naht.betaW, 2)} · f_vw,d = ${zahl(a.naht.fvwd, 1)} N/mm²`,
  ].forEach((t) => { svg += `<text x="${x0}" y="${ty}" class="t-mini">${t}</text>`; ty += 3.4; });

  return svg;
}

/** Stirnplattenstoß in der Ansicht. */
function stirnplatteZeichnung(a, e, x0, y0, breite, hoehe, nenner, zahl) {
  const m = (mm) => mm / nenner;
  const mitteX = x0 + breite / 2 - 10;
  const hoechste = Math.max(...a.reihen.map((r) => r.abstand));
  const plattenHoehe = hoechste + 120;
  const unten = y0 + hoehe - 12;
  const oben = unten - m(plattenHoehe);
  const plattenBreite = Math.max(160, 2 * (a.reihen[0].m + a.reihen[0].e) + 40);
  let svg = "";

  // Stirnplatte (Ansicht)
  svg += `<rect x="${(mitteX - m(plattenBreite) / 2).toFixed(2)}" y="${oben.toFixed(2)}" `
    + `width="${m(plattenBreite).toFixed(2)}" height="${m(plattenHoehe).toFixed(2)}" class="platte"/>`;
  // Träger dahinter angedeutet
  const stegB = m(12);
  svg += `<rect x="${(mitteX - stegB / 2).toFixed(2)}" y="${(oben + m(30)).toFixed(2)}" `
    + `width="${stegB.toFixed(2)}" height="${(m(plattenHoehe) - m(60)).toFixed(2)}" class="stab"/>`;
  svg += `<rect x="${(mitteX - m(plattenBreite) / 2 + m(20)).toFixed(2)}" y="${(oben + m(20)).toFixed(2)}" `
    + `width="${(m(plattenBreite) - m(40)).toFixed(2)}" height="${m(15).toFixed(2)}" class="stab"/>`;
  svg += `<rect x="${(mitteX - m(plattenBreite) / 2 + m(20)).toFixed(2)}" `
    + `y="${(unten - m(35)).toFixed(2)}" width="${(m(plattenBreite) - m(40)).toFixed(2)}" `
    + `height="${m(15).toFixed(2)}" class="stab"/>`;

  // Schraubenreihen
  const massPunkte = [unten];
  a.reihen.forEach((r) => {
    const y = unten - m(r.abstand);
    massPunkte.push(y);
    [-1, 1].forEach((seite) => {
      const cx = mitteX + seite * m(r.m + a.schraube.d / 2);
      svg += `<circle cx="${cx.toFixed(2)}" cy="${y.toFixed(2)}" r="${m(a.schraube.d0 / 2).toFixed(2)}" class="loch"/>`;
      svg += `<line x1="${(cx - 1.6).toFixed(2)}" y1="${y.toFixed(2)}" x2="${(cx + 1.6).toFixed(2)}" y2="${y.toFixed(2)}" class="achse"/>`;
    });
    svg += `<text x="${(mitteX + m(plattenBreite) / 2 + 3).toFixed(2)}" y="${(y + 0.9).toFixed(2)}" class="t-mini">`
      + `Reihe ${r.nummer}: F_t,Rd = ${zahl(r.Ft, 1)} kN · ${r.massgebend.split(" (")[0]}</text>`;
  });

  // Maßkette der Hebelarme
  svg += massketteLotrecht(massPunkte.slice().sort((p, q) => p - q),
    mitteX - m(plattenBreite) / 2 - 8, mitteX - m(plattenBreite) / 2);
  a.reihen.forEach((r) => {
    // Der Hebelarm wird an seiner eigenen Reihe beschriftet, sonst stehen
    // die Maßzahlen mehrerer Reihen übereinander
    const y = unten - m(r.abstand);
    svg += `<text x="${(mitteX - m(plattenBreite) / 2 - 10).toFixed(2)}" y="${(y + 0.9).toFixed(2)}" `
      + `class="t-mass" text-anchor="end">h${r.nummer} = ${zahl(r.abstand, 0)}</text>`;
  });
  svg += `<text x="${mitteX.toFixed(2)}" y="${(unten + 4).toFixed(2)}" class="t-mass">Druckpunkt</text>`;

  let ty = y0 + 3;
  [`Stirnplatte t = ${zahl(a.tp, 1)} mm, ${a.guete}`,
   `${a.reihen.length} Reihen × 2 × `
     + `${Object.keys(SCHRAUBEN).find((k) => SCHRAUBEN[k].d === a.schraube.d)} `
     + `${Object.keys(SCHRAUBENKLASSEN).find((k) => SCHRAUBENKLASSEN[k].fub === a.klasse.fub)}`,
   `M_Rd = ${zahl(a.MRd, 1)} kNm · V_Rd = ${zahl(a.VRd, 1)} kN`,
   `T-Stummel nach Tab. 6.2, Reihen einzeln gerechnet`,
  ].forEach((t) => { svg += `<text x="${x0}" y="${ty}" class="t-mini">${t}</text>`; ty += 3.4; });

  return svg;
}
