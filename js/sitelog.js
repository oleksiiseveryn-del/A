/**
 * Bautagebuch für die Baustelle.
 *
 * Je Kalendertag werden festgehalten: Wetter mit Temperatur morgens und
 * mittags, Arbeitszeit, die anwesenden Firmen mit ihrer Personalstärke, die
 * eingesetzten Geräte, die ausgeführten Leistungen mit Bezug auf Bauabschnitt
 * und LV-Position, Materiallieferungen sowie besondere Vorkommnisse.
 *
 * Das Bautagebuch ist das Beweismittel des Bauablaufs. Vorkommnisse werden
 * deshalb nach ihrer vertraglichen Folge geordnet; zu jeder Art nennt der
 * Eintrag die Vorschrift und die Frist, die daran hängt – etwa die
 * Behinderungsanzeige nach VOB/B § 6 Abs. 1 oder die Ankündigung einer
 * zusätzlichen Leistung nach § 2 Abs. 6 vor Beginn der Ausführung.
 *
 * Das Bautagebuch ersetzt keine der genannten Anzeigen: Es hält fest, dass
 * und wann etwas eingetreten ist. Die Anzeige selbst ist gesondert
 * schriftlich an den Auftraggeber zu richten.
 */

/** Wetterlagen mit Kurzzeichen für den Tagesbericht. */
const WETTER_LAGEN = {
  heiter:   { name: "heiter", zeichen: "☀" },
  bewoelkt: { name: "bewölkt", zeichen: "☁" },
  regen:    { name: "Regen", zeichen: "🌧", nassRegen: true },
  schauer:  { name: "Schauer", zeichen: "🌦", nassRegen: true },
  schnee:   { name: "Schnee", zeichen: "❄", nassRegen: true, frostlage: true },
  frost:    { name: "Frost", zeichen: "❄", frostlage: true },
  nebel:    { name: "Nebel", zeichen: "≡" },
  sturm:    { name: "Sturm", zeichen: "≋", sturmlage: true },
};

/**
 * Arten besonderer Vorkommnisse mit der Vorschrift, die daran hängt.
 *
 * frist = Frist bzw. Zeitpunkt, zu dem gehandelt werden muss.
 * anzeige = true: es ist zusätzlich eine schriftliche Anzeige an den
 * Auftraggeber erforderlich, die das Bautagebuch nicht ersetzt.
 */
const EREIGNIS_ARTEN = {
  behinderung: {
    name: "Behinderung", vorschrift: "VOB/B § 6 Abs. 1",
    frist: "unverzüglich schriftlich anzeigen",
    text: "Behinderung dem Auftraggeber unverzüglich schriftlich anzeigen; sonst nur bei offenkundiger Kenntnis des Auftraggebers wirksam.",
    anzeige: true, bauzeit: true,
  },
  anordnung: {
    name: "Anordnung des Auftraggebers", vorschrift: "VOB/B § 1 Abs. 3 und 4",
    frist: "Vergütung vor der Ausführung vereinbaren",
    text: "Geänderte Leistung: Preis nach § 2 Abs. 5 vor der Ausführung vereinbaren. Zusätzliche Leistung: Anspruch nach § 2 Abs. 6 vor Beginn der Ausführung ankündigen.",
    anzeige: true, nachtrag: true,
  },
  bedenken: {
    name: "Bedenken", vorschrift: "VOB/B § 4 Abs. 3",
    frist: "unverzüglich, möglichst vor Beginn der Arbeiten",
    text: "Bedenken gegen die vorgesehene Art der Ausführung, die Güte der Stoffe oder die Leistung anderer Unternehmer dem Auftraggeber schriftlich mitteilen.",
    anzeige: true,
  },
  stundenlohn: {
    name: "Stundenlohnarbeiten", vorschrift: "VOB/B § 15",
    frist: "Stundenlohnzettel zeitnah einreichen",
    text: "Stundenlohnarbeiten sind vor Beginn anzuzeigen; die Stundenlohnzettel sind dem Auftraggeber zeitnah zur Unterschrift vorzulegen.",
    anzeige: true,
  },
  abnahme: {
    name: "Abnahme / Teilabnahme", vorschrift: "VOB/B § 12",
    frist: "Niederschrift führen",
    text: "Über die Abnahme ist eine Niederschrift mit den Vorbehalten aufzunehmen; mit der Abnahme beginnt die Verjährung der Mängelansprüche.",
  },
  pruefung: {
    name: "Prüfung / Probe", vorschrift: "VOB/B § 4 Abs. 1",
    frist: "Ergebnis dokumentieren",
    text: "Güteprüfungen, Probewürfel und Messungen mit Ergebnis, Prüfstelle und Kennzeichnung festhalten.",
  },
  unfall: {
    name: "Arbeitsunfall", vorschrift: "SGB VII § 193",
    frist: "binnen drei Tagen anzeigen",
    text: "Unfall mit mehr als drei Tagen Arbeitsunfähigkeit dem Unfallversicherungsträger binnen drei Tagen anzeigen; Ersthelfer und Verbandbuch eintragen.",
    anzeige: true,
  },
  sicherheit: {
    name: "Sicherheit / SiGe", vorschrift: "BaustellV § 3",
    frist: "SiGe-Plan fortschreiben",
    text: "Feststellung des Sicherheits- und Gesundheitsschutzkoordinators, Mangel an der Absturzsicherung, Gerüstabnahme oder Unterweisung festhalten.",
  },
  besuch: {
    name: "Besuch / Begehung", vorschrift: "–",
    frist: "–",
    text: "Baubesprechung, Begehung durch Bauherr, Prüfingenieur, Behörde oder Berufsgenossenschaft mit Teilnehmern und Ergebnis.",
  },
  sonstiges: {
    name: "Sonstiges", vorschrift: "–", frist: "–",
    text: "Vorkommnis ohne unmittelbare vertragliche Folge.",
  },
};

/** Lohngruppen der Personalstärke. */
const PERSONAL_GRUPPEN = {
  poliere: "Poliere / Vorarbeiter",
  facharbeiter: "Facharbeiter",
  helfer: "Bauhelfer",
  azubi: "Auszubildende",
};

/** Zahl aus einem Feld; leer ergibt 0. */
function tagebuchZahl(wert) {
  if (typeof wert === "number") return Number.isFinite(wert) ? wert : 0;
  if (wert === undefined || wert === null || String(wert).trim() === "") return 0;
  const zahl = Number(String(wert).trim().replace(",", "."));
  return Number.isFinite(zahl) ? zahl : 0;
}

/** Temperatur; ohne Angabe null, damit „0 °C" und „keine Angabe" sich unterscheiden. */
function tagebuchTemperatur(wert) {
  if (wert === undefined || wert === null || String(wert).trim() === "") return null;
  const zahl = Number(String(wert).trim().replace(",", "."));
  return Number.isFinite(zahl) ? zahl : null;
}

/**
 * Auswertung eines Tages: Personalstärke, Stunden, Wetterfolgen und die
 * Hinweise, die aus den Vorkommnissen und dem Wetter folgen.
 *
 * @param {Object} eintrag - Tageseintrag des Bautagebuchs
 * @returns {Object} { personal, stunden, firmen, wetter, hinweise, anzeigen, arbeitsruhe }
 */
function bautagebuchTag(eintrag) {
  const firmen = (eintrag.firmen || []).map((f) => {
    const kopfzahl = Object.keys(PERSONAL_GRUPPEN)
      .reduce((summe, g) => summe + tagebuchZahl(f[g]), 0);
    const stunden = tagebuchZahl(f.stunden);
    return Object.assign({}, f, { kopfzahl, stunden, mannstunden: kopfzahl * stunden });
  });

  const personal = firmen.reduce((s, f) => s + f.kopfzahl, 0);
  const mannstunden = firmen.reduce((s, f) => s + f.mannstunden, 0);
  const geraete = (eintrag.geraete || []).map((g) => Object.assign({}, g, {
    anzahl: tagebuchZahl(g.anzahl), stunden: tagebuchZahl(g.stunden),
  }));

  const frueh = tagebuchTemperatur(eintrag.tempFrueh);
  const mittag = tagebuchTemperatur(eintrag.tempMittag);
  const lage = WETTER_LAGEN[eintrag.wetter] || WETTER_LAGEN.bewoelkt;
  const tiefste = [frueh, mittag].filter((t) => t !== null);
  const min = tiefste.length ? Math.min(...tiefste) : null;
  const max = tiefste.length ? Math.max(...tiefste) : null;

  const wetter = {
    lage, frueh, mittag, min, max,
    niederschlag: tagebuchZahl(eintrag.niederschlag),
    wind: eintrag.wind || "",
    regentag: !!lage.nassRegen || tagebuchZahl(eintrag.niederschlag) > 0,
    frosttag: (min !== null && min <= 0) || !!lage.frostlage,
  };

  const ereignisse = (eintrag.ereignisse || []).map((e) => {
    const art = EREIGNIS_ARTEN[e.art] || EREIGNIS_ARTEN.sonstiges;
    return Object.assign({}, e, { artName: art.name, vorschrift: art.vorschrift, frist: art.frist, regel: art });
  });

  const hinweise = [];
  const anzeigen = [];

  ereignisse.forEach((e) => {
    if (e.regel.anzeige) {
      anzeigen.push(`${e.artName}: ${e.frist} (${e.vorschrift}). ${e.regel.text}`);
    }
  });

  // Witterung: Maßnahmen für das Betonieren bei niedrigen und hohen Temperaturen
  if (min !== null && min < 5) {
    hinweise.push(`Tiefste Temperatur ${min.toFixed(1).replace(".", ",")} °C: Für Betonarbeiten sind die `
      + "Maßnahmen für niedrige Temperaturen nach DIN EN 13670 mit DIN 1045-3 festzulegen "
      + "(Frischbetontemperatur, Nachbehandlung, Schutz vor Frost).");
  }
  if (max !== null && max > 30) {
    hinweise.push(`Höchste Temperatur ${max.toFixed(1).replace(".", ",")} °C: Nachbehandlung des Betons `
      + "gegen frühes Austrocknen nach DIN EN 13670 mit DIN 1045-3 verstärken.");
  }
  if (wetter.lage.sturmlage) {
    hinweise.push("Sturm: Krane, Gerüste und Schalung nach Betriebsanleitung sichern; "
      + "Arbeiten mit Absturzgefahr einstellen.");
  }
  if (wetter.frosttag && personal > 0) {
    hinweise.push("Frosttag mit Arbeitsleistung – für den Nachweis einer Bauzeitverlängerung "
      + "sind Frost- und Ausfalltage getrennt zu führen.");
  }
  if (personal === 0 && !eintrag.arbeitsruhe) {
    hinweise.push("Kein Personal erfasst – Ausfalltag oder fehlende Eintragung prüfen.");
  }

  return {
    firmen, geraete, ereignisse, personal, mannstunden, wetter, hinweise, anzeigen,
    leistungen: eintrag.leistungen || [],
    lieferungen: eintrag.lieferungen || [],
    arbeitsruhe: !!eintrag.arbeitsruhe,
  };
}

/**
 * Auswertung eines Zeitraums für Bauzeit und Nachträge.
 *
 * @param {Array} eintraege - Tageseinträge
 * @returns {Object} Kennzahlen und die Aufstellung je Firma
 */
function bautagebuchZeitraum(eintraege) {
  const sortiert = eintraege.slice().sort((a, b) => String(a.datum).localeCompare(String(b.datum)));
  const jeFirma = new Map();
  let mannstunden = 0, arbeitstage = 0, regentage = 0, frosttage = 0;
  let ausfalltage = 0, behinderungstage = 0, nachtragstage = 0;

  sortiert.forEach((e) => {
    const t = bautagebuchTag(e);
    mannstunden += t.mannstunden;
    if (t.personal > 0) arbeitstage += 1;
    else if (!t.arbeitsruhe) ausfalltage += 1;
    if (t.wetter.regentag) regentage += 1;
    if (t.wetter.frosttag) frosttage += 1;
    if (t.ereignisse.some((x) => x.regel.bauzeit)) behinderungstage += 1;
    if (t.ereignisse.some((x) => x.regel.nachtrag)) nachtragstage += 1;

    t.firmen.forEach((f) => {
      const name = (f.name || "ohne Angabe").trim() || "ohne Angabe";
      const bisher = jeFirma.get(name) || { name, gewerk: f.gewerk || "", tage: 0, mannstunden: 0, maxKopf: 0 };
      bisher.tage += f.kopfzahl > 0 ? 1 : 0;
      bisher.mannstunden += f.mannstunden;
      bisher.maxKopf = Math.max(bisher.maxKopf, f.kopfzahl);
      if (!bisher.gewerk && f.gewerk) bisher.gewerk = f.gewerk;
      jeFirma.set(name, bisher);
    });
  });

  return {
    von: sortiert.length ? sortiert[0].datum : null,
    bis: sortiert.length ? sortiert[sortiert.length - 1].datum : null,
    tage: sortiert.length,
    arbeitstage, ausfalltage, regentage, frosttage,
    behinderungstage, nachtragstage, mannstunden,
    firmen: Array.from(jeFirma.values()).sort((a, b) => b.mannstunden - a.mannstunden),
  };
}

/* ------------------------------------------------------- Tagesbericht */

/**
 * Tagesbericht des Bautagebuchs als A4-Blatt quer.
 *
 * Drei Spalten: links Wetter, Arbeitszeit und Personal, in der Mitte die
 * ausgeführten Leistungen und Lieferungen, rechts die besonderen
 * Vorkommnisse mit ihrer Vorschrift.
 *
 * @param {Object} daten - { eintrag, auswertung, nummer, projekt }
 */
function bautagebuchSVG(daten) {
  const { eintrag, auswertung, projekt } = daten;
  const nummer = daten.nummer || 1;
  const komma = (wert, stellen) => wert.toFixed(stellen === undefined ? 1 : stellen).replace(".", ",");
  const temp = (t) => (t === null ? "–" : `${komma(t)} °C`);

  const x0 = BLATT.randLinks;
  const breite = BLATT.breite - BLATT.randLinks - BLATT.randRechts;
  const spalteB = (breite - 8) / 3;
  const sp = [x0, x0 + spalteB + 4, x0 + 2 * spalteB + 8];
  let svg = "";

  // ---- Kopf
  let y = BLATT.randOben + 6;
  svg += `<text x="${x0}" y="${y}" class="t-titel">Bautagebuch · Tagesbericht Nr. ${nummer}</text>`;
  svg += `<text x="${x0 + breite}" y="${y}" class="t-kopf-rechts">${eintrag.datum || "ohne Datum"}${eintrag.wochentag ? " · " + eintrag.wochentag : ""}</text>`;
  y += 3;
  svg += `<line x1="${x0}" y1="${y}" x2="${x0 + breite}" y2="${y}" class="mb"/>`;
  y += 6;

  const kopffeld = (x, label, wert) => {
    svg += `<text x="${x}" y="${y}" class="t-label">${label}</text>`;
    svg += `<text x="${x}" y="${y + 4}" class="t-wert">${wert || "–"}</text>`;
  };
  kopffeld(x0, "Bauvorhaben", projekt.name || "Projekt");
  kopffeld(x0 + 110, "Bauabschnitt", eintrag.abschnitt || "–");
  kopffeld(x0 + 175, "Bauleiter", eintrag.bauleiter || projekt.bearbeiter);
  kopffeld(x0 + 225, "Arbeitszeit", eintrag.von && eintrag.bis
    ? `${eintrag.von} – ${eintrag.bis}${eintrag.pause ? ` (Pause ${eintrag.pause})` : ""}` : "–");
  y += 10;

  const yStart = y;
  const block = (x, titel) => {
    svg += `<text x="${x}" y="${y}" class="t-block">${titel}</text>`;
    svg += `<line x1="${x}" y1="${y + 1.4}" x2="${x + spalteB}" y2="${y + 1.4}" class="ml"/>`;
    y += 5;
  };
  const zeile = (x, links, rechts, klasse) => {
    svg += `<text x="${x}" y="${y}" class="${klasse || "t-td"}">${links}</text>`;
    if (rechts !== undefined && rechts !== null) {
      svg += `<text x="${x + spalteB}" y="${y}" class="${klasse || "t-td"} rechts">${rechts}</text>`;
    }
    y += 3.9;
  };
  const absatz = (x, text, klasse, breiteZeichen) => {
    umbrechen(text, breiteZeichen || 44).forEach((t) => {
      svg += `<text x="${x}" y="${y}" class="${klasse || "t-td"}">${t}</text>`;
      y += 3.4;
    });
  };

  // ---- Spalte 1: Wetter, Personal, Geräte
  const w = auswertung.wetter;
  block(sp[0], "Witterung");
  zeile(sp[0], `${w.lage.zeichen} ${w.lage.name}`, "");
  zeile(sp[0], "Temperatur morgens", temp(w.frueh));
  zeile(sp[0], "Temperatur mittags", temp(w.mittag));
  if (w.niederschlag > 0) zeile(sp[0], "Niederschlag", `${komma(w.niederschlag)} mm`);
  if (w.wind) zeile(sp[0], "Wind", w.wind);
  if (w.regentag || w.frosttag) {
    zeile(sp[0], [w.regentag ? "Regentag" : null, w.frosttag ? "Frosttag" : null].filter(Boolean).join(" · "), "", "t-merk");
  }
  y += 2;

  block(sp[0], `Personal · ${auswertung.personal} Beschäftigte · ${komma(auswertung.mannstunden)} Mannstunden`);
  if (!auswertung.firmen.length) {
    zeile(sp[0], auswertung.arbeitsruhe ? "Arbeitsruhe" : "keine Firma erfasst", "", "t-grau");
  }
  auswertung.firmen.forEach((f) => {
    zeile(sp[0], `${(f.name || "–").slice(0, 30)}${f.gewerk ? ` (${f.gewerk})` : ""}`, `${f.kopfzahl} P`, "t-td stark");
    const teile = Object.keys(PERSONAL_GRUPPEN)
      .filter((g) => tagebuchZahl(f[g]) > 0)
      .map((g) => `${tagebuchZahl(f[g])} ${PERSONAL_GRUPPEN[g]}`);
    if (teile.length) zeile(sp[0], "   " + teile.join(", ").slice(0, 44), `${komma(f.stunden)} h`, "t-klein");
  });
  y += 2;

  if (auswertung.geraete.length) {
    block(sp[0], "Geräte");
    auswertung.geraete.forEach((g) => {
      zeile(sp[0], `${g.anzahl > 0 ? g.anzahl + " × " : ""}${(g.name || "–").slice(0, 34)}`,
        g.stunden > 0 ? `${komma(g.stunden)} h` : "");
    });
  }

  // ---- Spalte 2: Leistungen und Lieferungen
  y = yStart;
  block(sp[1], "Ausgeführte Leistungen");
  if (!auswertung.leistungen.length) zeile(sp[1], "keine Eintragung", "", "t-grau");
  auswertung.leistungen.forEach((l) => {
    const kopf = [l.bereich, l.lvPos ? `LV ${l.lvPos}` : null].filter(Boolean).join(" · ");
    if (kopf) zeile(sp[1], kopf, "", "t-td stark");
    absatz(sp[1], l.text || "–", "t-td", 46);
    y += 1;
  });
  y += 2;

  if (auswertung.lieferungen.length) {
    block(sp[1], "Lieferungen und Stoffe");
    auswertung.lieferungen.forEach((l) => {
      zeile(sp[1], (l.text || "–").slice(0, 40), l.lieferschein ? `LS ${l.lieferschein}` : "");
    });
  }

  // ---- Spalte 3: Vorkommnisse
  y = yStart;
  block(sp[2], "Besondere Vorkommnisse");
  if (!auswertung.ereignisse.length) zeile(sp[2], "keine", "", "t-grau");
  auswertung.ereignisse.forEach((e) => {
    zeile(sp[2], e.artName, e.vorschrift, "t-td stark");
    absatz(sp[2], e.text || "–", "t-td", 46);
    if (e.regel.anzeige) {
      absatz(sp[2], `→ ${e.frist}`, "t-merk", 46);
    }
    if (e.folge) absatz(sp[2], `Folge: ${e.folge}`, "t-klein", 48);
    y += 1.4;
  });

  if (eintrag.bemerkung) {
    y += 2;
    block(sp[2], "Bemerkung");
    absatz(sp[2], eintrag.bemerkung, "t-td", 46);
  }

  // ---- Anzeigen, die aus dem Tag folgen: je eine Zeile über der Unterschrift
  const offene = auswertung.ereignisse.filter((e) => e.regel.anzeige).slice(0, 3);
  if (offene.length) {
    let yF = BLATT.hoehe - BLATT.randUnten - 34;
    svg += `<line x1="${x0}" y1="${yF - 3.5}" x2="${x0 + breite - 96}" y2="${yF - 3.5}" class="ml"/>`;
    svg += `<text x="${x0}" y="${yF}" class="t-block">Aus diesem Tag folgende Anzeigen an den Auftraggeber</text>`;
    yF += 4;
    offene.forEach((e) => {
      svg += `<text x="${x0}" y="${yF}" class="t-merk">${e.artName} → ${e.frist} (${e.vorschrift})</text>`;
      yF += 3.4;
    });
  }

  // ---- Unterschrift
  const yU = BLATT.hoehe - BLATT.randUnten - 14;
  svg += `<line x1="${x0}" y1="${yU + 6}" x2="${x0 + 78}" y2="${yU + 6}" class="ml"/>`;
  svg += `<text x="${x0}" y="${yU + 4.5}" class="t-wert">${eintrag.bauleiter || projekt.bearbeiter}</text>`;
  svg += `<text x="${x0}" y="${yU + 10}" class="t-klein">Bauleiter · Ort, Datum, Unterschrift</text>`;

  // ---- Schriftfeld
  const sfB = 92, sfH = 24;
  const sfX = BLATT.breite - BLATT.randRechts - sfB;
  const sfY = BLATT.hoehe - BLATT.randUnten - sfH;
  svg += `<rect x="${sfX}" y="${sfY}" width="${sfB}" height="${sfH}" class="schriftfeld"/>`;
  svg += `<line x1="${sfX}" y1="${sfY + 8}" x2="${sfX + sfB}" y2="${sfY + 8}" class="schriftfeld"/>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 5.5}" class="t-firma">HSD Hamburg GmbH</text>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 13}" class="t-klein">${projekt.name || "Projekt"} · Tagesbericht ${nummer}</text>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 17}" class="t-klein">Bautag: ${eintrag.datum || "–"}</text>`;
  svg += `<text x="${sfX + 3}" y="${sfY + 21}" class="t-klein">Bearbeiter: ${projekt.bearbeiter}</text>`;

  svg += `<text x="${x0}" y="${BLATT.hoehe - 3}" class="t-hinweis">Das Bautagebuch hält den Bauablauf fest. `
    + `Behinderungsanzeige nach VOB/B § 6 Abs. 1, Ankündigung geänderter und zusätzlicher Leistungen nach § 2 Abs. 5 und 6 sowie `
    + `Bedenken nach § 4 Abs. 3 sind gesondert schriftlich an den Auftraggeber zu richten.</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BLATT.breite} ${BLATT.hoehe}" width="100%" style="background:#fff">
<style>
  .ml { stroke: #1b2733; stroke-width: 0.2; }
  .mb { stroke: #1b2733; stroke-width: 0.5; }
  .schriftfeld { fill: none; stroke: #1b2733; stroke-width: 0.35; }
  text { font-family: "IBM Plex Sans", Arial, sans-serif; fill: #1b2733; }
  .rechts { text-anchor: end; }
  .stark { font-weight: 700; }
  .t-grau { font-size: 2.5px; fill: #7a848e; }
  .t-titel { font-size: 5px; font-weight: 700; }
  .t-kopf-rechts { font-size: 3.4px; text-anchor: end; font-weight: 600; }
  .t-label { font-size: 2.2px; fill: #64707c; text-transform: uppercase; letter-spacing: 0.2px; }
  .t-wert { font-size: 3px; font-weight: 600; }
  .t-block { font-size: 2.9px; font-weight: 700; fill: #0f2438; }
  .t-td { font-size: 2.5px; }
  .t-merk { font-size: 2.5px; fill: #a3372d; font-weight: 600; }
  .t-klein { font-size: 2.2px; fill: #64707c; }
  .t-firma { font-size: 4px; font-weight: 700; }
  .t-hinweis { font-size: 2.2px; fill: #64707c; }
</style>
${svg}
</svg>`;
}
