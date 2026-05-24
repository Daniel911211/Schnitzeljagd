/* =====================================================================
 * solution.js  –  Lösungswort-Verteilung (Variante A)
 *   Stationen bleiben in Reihenfolge 01,02,03…
 *   Nur die Buchstaben des Wortes werden gemischt verteilt.
 * ===================================================================== */

const Solution = (() => {

  // Stations-IDs in fester numerischer Reihenfolge (01,02,…)
  function stationIdsSortiert(state) {
    return state.stationen
      .map(s => s.id)
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  }

  // Validierung: Wortlänge muss exakt der Stationsanzahl entsprechen
  function pruefeWortlaenge(wort, anzahlStationen) {
    const w = (wort || "").trim();
    if (!w) return { ok: false, grund: "Kein Lösungswort." };
    if (w.length !== anzahlStationen)
      return {
        ok: false,
        grund: `Wortlänge ${w.length} ≠ Stationsanzahl ${anzahlStationen}.`
      };
    return { ok: true };
  }

  // Fisher–Yates
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /**
   * Verteilt die Buchstaben eines Wortes auf die Stationen.
   * - Mischung vermeidet die Originalreihenfolge des Wortes
   * - vermeidet (best effort) identische Verteilung zu anderen Gruppen
   * @returns { "01":"T", "02":"R", … }
   */
  function verteile(wort, stationIds, andereVerteilungen = []) {
    const buchst = wort.trim().toUpperCase().split("");
    const original = buchst.join("");
    // Signaturen bereits vergebener Verteilungen (zum Vergleich)
    const belegt = andereVerteilungen.map(v => signatur(v, stationIds));

    let result = null;
    for (let versuch = 0; versuch < 200; versuch++) {
      const gemischt = shuffle(buchst);
      const reihe = gemischt.join("");
      // Originalreihenfolge vermeiden (sofern überhaupt vermeidbar)
      if (reihe === original && eindeutigeAnordnungenMoeglich(buchst)) continue;
      const map = {};
      stationIds.forEach((id, i) => map[id] = gemischt[i]);
      // möglichst von anderen Gruppen abweichen
      if (belegt.includes(signatur(map, stationIds)) &&
          mehrAlsEineAnordnung(buchst, belegt.length + 1)) continue;
      result = map;
      break;
    }
    // Fallback: zumindest irgendeine Mischung
    if (!result) {
      const gemischt = shuffle(buchst);
      result = {};
      stationIds.forEach((id, i) => result[id] = gemischt[i]);
    }
    return result;
  }

  function signatur(map, stationIds) {
    return stationIds.map(id => map[id] || "").join("");
  }

  // Gibt es überhaupt mehr als eine unterscheidbare Anordnung?
  function eindeutigeAnordnungenMoeglich(buchst) {
    return new Set(buchst).size > 1;
  }
  function mehrAlsEineAnordnung(buchst, benoetigt) {
    // grobe Abschätzung: bei >1 verschiedenen Buchstaben gibt es genug Varianten
    return new Set(buchst).size > 1;
  }

  return { stationIdsSortiert, pruefeWortlaenge, verteile };
})();

window.Solution = Solution;
