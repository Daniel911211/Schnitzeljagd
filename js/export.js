/* =====================================================================
 * export.js  –  Validierung + Export für GitHub Pages (ZIP)
 *   - data.json wird OHNE Klartextlösungen erzeugt (Hash + XOR)
 *   - QR-PNG je Station × Gruppe
 *   - Teilnehmer-Site (station.html + Assets) gebündelt
 *   Die wortdatenbank und Klartextlösungen bleiben aus dem Export.
 * ===================================================================== */

const ExportTool = (() => {
  let berichtEl, btnEl;

  // statische Dateien, die in die Teilnehmer-Site gehören (per fetch geholt)
  // Text-Assets der Teilnehmer-Site UND des Planungstools (index.html)
  const ASSETS = [
    // Teilnehmer-Site
    "station.html",
    "schatz.html",
    "css/station.css",
    "js/crypto.js",
    "js/station-view.js",
    "js/schatz-view.js",
    // Planungstool (online bearbeitbar)
    "index.html",
    "css/app.css",
    "js/state.js",
    "js/solution.js",
    "js/stations.js",
    "js/map.js",
    "js/groups.js",
    "js/worddb.js",
    "js/export.js",
    "js/app.js",
    "lib/leaflet/leaflet.css",
    "lib/leaflet/leaflet.js",
    "lib/jszip.min.js",
    "lib/qrcode.js"
  ];

  // Binär-Assets (Leaflet-Marker-Bilder) für das Planungstool
  const BIN_ASSETS = [
    "lib/leaflet/images/layers.png",
    "lib/leaflet/images/layers-2x.png",
    "lib/leaflet/images/marker-icon.png",
    "lib/leaflet/images/marker-icon-2x.png",
    "lib/leaflet/images/marker-shadow.png"
  ];

  function init() {
    berichtEl = document.getElementById("export-bericht");
    btnEl = document.getElementById("btn-export-zip");
    btnEl.addEventListener("click", starteExport);
    document.getElementById("btn-export-pruefen")
      .addEventListener("click", () => zeigeBericht(validiere()));
  }

  function onShow(tab) {
    if (tab !== "export") return;
    zeigeBericht(validiere());
  }

  /* =================== Validierung =================== */
  function validiere() {
    const s = Store.state;
    const fehler = [], warn = [];
    const anzahl = s.stationen.length;

    if (!anzahl) fehler.push("Keine Stationen vorhanden.");
    if (!Object.keys(s.gruppen).length) fehler.push("Keine Gruppen vorhanden.");
    if (!s.projekt.githubBasislink.trim())
      fehler.push("GitHub-Basislink fehlt (für Links und QR-Codes nötig).");

    // Stationen
    s.stationen.forEach(st => {
      if (!st.position) fehler.push(`Station ${st.id}: kein Marker gesetzt.`);
      if (!st.name) warn.push(`Station ${st.id}: kein Name.`);
      if (!st.hinweisNaechste) warn.push(`Station ${st.id}: kein Hinweis zur nächsten Station.`);
      if ((!st.bilder || !st.bilder.length) && !st.externerBildlink)
        warn.push(`Station ${st.id}: kein Bild.`);
    });

    // Gruppen / Lösungswörter / Verteilung
    Object.entries(s.gruppen).forEach(([gid, g]) => {
      const pruef = Solution.pruefeWortlaenge(g.loesungswort, anzahl);
      if (!pruef.ok) { fehler.push(`Gruppe ${gid}: ${pruef.grund}`); return; }
      const verteilt = Object.values(g.buchstaben || {}).filter(Boolean).length;
      if (verteilt !== anzahl)
        fehler.push(`Gruppe ${gid}: Buchstaben nicht vollständig verteilt (${verteilt}/${anzahl}).`);
    });

    // Bilder können nicht auf Existenz geprüft werden (separat verwaltet)
    const bildPfade = [];
    s.stationen.forEach(st => (st.bilder || []).forEach(b => bildPfade.push(b)));
    if (bildPfade.length)
      warn.push(`${bildPfade.length} Bildpfad(e) referenziert – Bilddateien müssen manuell in /bilder/ abgelegt werden.`);

    if (!s.projekt.schatzbild)
      warn.push("Kein Schatzbild gesetzt – schatz.html zeigt nach Erfolg nur den Text.");

    return { fehler, warn };
  }

  function zeigeBericht({ fehler, warn }) {
    let html = "";
    if (!fehler.length) {
      html += `<div class="bericht-ok">✓ Keine blockierenden Fehler – Export möglich.</div>`;
      btnEl.disabled = false;
    } else {
      html += `<div class="bericht-fehler"><strong>${fehler.length} Fehler – Export blockiert:</strong>
        <ul>${fehler.map(f => `<li>${esc(f)}</li>`).join("")}</ul></div>`;
      btnEl.disabled = true;
    }
    if (warn.length) {
      html += `<div class="bericht-warn"><strong>${warn.length} Hinweis(e):</strong>
        <ul>${warn.map(w => `<li>${esc(w)}</li>`).join("")}</ul></div>`;
    }
    berichtEl.innerHTML = html;
  }

  /* =================== Export starten =================== */
  async function starteExport() {
    const v = validiere();
    zeigeBericht(v);
    if (v.fehler.length) return;

    btnEl.disabled = true;
    const altText = btnEl.textContent;
    btnEl.textContent = "Erzeuge ZIP…";

    try {
      const zip = new JSZip();
      const basis = normBasis(Store.state.projekt.githubBasislink);

      // 1) gehashte data.json
      const data = await baueDatenJSON();
      zip.file("daten/data.json", JSON.stringify(data, null, 2));

      // 2) statische Assets – absolute URL + Inhaltsvalidierung.
      //    Verhindert stille Korruption: wenn deployed Dateien bereits falsch sind,
      //    liefert fetch() falschen Inhalt → sofortiger Abbruch mit Fehlermeldung.
      const paginaBasis = window.location.href.replace(/[^/]*(\?.*)?$/, "");
      const erwartungen = {
        ".html": ["<!DOCTYPE", "<html"],
        ".css": ["/*", "@import"],
        ".js": ["/*", "//", "!", "var ", "const ", "(function"]
      };

      for (const pfad of [...ASSETS, ...BIN_ASSETS]) {
        const absoluteUrl = paginaBasis + pfad;
        const resp = await fetch(absoluteUrl, { cache: "no-store", credentials: "same-origin" });
        if (!resp.ok) throw new Error(`Asset nicht ladbar: ${pfad} (${resp.status})\nURL: ${absoluteUrl}`);

        if (BIN_ASSETS.includes(pfad)) {
          zip.file(pfad, await resp.blob());
        } else {
          const text = await resp.text();
          const ext = pfad.match(/\.[^.]+$/)?.[0];
          const checks = erwartungen[ext];
          if (checks) {
            const trimmed = text.trimStart();
            const ok = Array.isArray(checks)
              ? checks.some(c => trimmed.startsWith(c))
              : trimmed.startsWith(checks);
            if (!ok)
              throw new Error(
                `Inhaltsfehler in "${pfad}":\n` +
                `Erwartet beginnt mit: ${JSON.stringify(checks)}\n` +
                `Erhalten: ${JSON.stringify(text.slice(0, 80))}\n\n` +
                `Hinweis: Die deployten Dateien sind beschädigt (Inhalte vertauscht).\n` +
                `Bitte zuerst das korrekte ZIP deployen, dann erneut exportieren.`
              );
          }
          zip.file(pfad, text);
        }
      }

      // 3) QR-Codes je Station × Gruppe
      const gruppen = Object.keys(Store.state.gruppen);
      for (const st of Store.state.stationen) {
        for (const gid of gruppen) {
          const url = `${basis}station.html?station=${st.id}&gruppe=${gid}`;
          const blob = qrPng(url, 6);
          zip.file(`qr/station-${st.id}_${gid}.png`, blob);
        }
      }

      // 4) Bilder-Hinweis + Anleitung
      zip.file("bilder/README.txt", bilderReadme());
      zip.file("ANLEITUNG.txt", anleitung(basis));

      const out = await zip.generateAsync({ type: "blob" });
      const name = (Store.state.projekt.titel || "schnitzeljagd")
        .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "schnitzeljagd";
      download(out, name + "_export.zip");
    } catch (e) {
      alert("Export fehlgeschlagen: " + e.message);
      console.error(e);
    } finally {
      btnEl.textContent = altText;
      btnEl.disabled = false;
    }
  }

  /* =================== data.json (ohne Klartext) =================== */
  async function baueDatenJSON() {
    const s = Store.state;
    const out = {
      version: SchnitzelState.SCHEMA_VERSION,
      projekt: {
        titel: s.projekt.titel,
        beschreibung: s.projekt.beschreibung,
        githubBasislink: normBasis(s.projekt.githubBasislink),
        schatzbild: s.projekt.schatzbild || "",
        schatztext: s.projekt.schatztext || ""
      },
      stationen: [],
      gruppen: {}
    };

    for (const st of s.stationen) {
      out.stationen.push(await stationView(st));
    }

    for (const [gid, g] of Object.entries(s.gruppen)) {
      const grp = { loesungswortHash: await Crypto.sha256hex(Crypto.normalize(g.loesungswort, true)), buchstaben: {} };
      for (const st of s.stationen) {
        const letter = (g.buchstaben || {})[st.id] || "";
        const sec = secretFuer(st);                 // {key, modus, ...}
        const keyText = sec.key !== null ? sec.key : Crypto.BUTTON_SALT;
        grp.buchstaben[st.id] = await Crypto.encryptLetter(letter, keyText);
      }
      out.gruppen[gid] = grp;
    }
    return out;
  }

  // Teilnehmer-sichtbare Stationsdaten + Prüf-Hash (kein Klartext)
  async function stationView(st) {
    const sec = secretFuer(st);
    const v = {
      id: st.id,
      name: st.name,
      typ: st.typ,
      modus: sec.modus,                  // antwort | mc | button
      tolerant: sec.tolerant,
      anzeigeText: sec.anzeigeText,
      position: st.position || null,
      radius: st.radius || 0,
      bilder: st.bilder || [],
      externerBildlink: st.externerBildlink || "",
      hinweisNaechste: st.hinweisNaechste || "",
      externerLink: st.externerLink || ""
    };
    if (sec.optionen) v.optionen = sec.optionen;
    if (sec.zusatz) v.zusatz = sec.zusatz;
    if (sec.key !== null && sec.modus !== "button")
      v.loesungHash = await Crypto.sha256hex(sec.key);
    return v;
  }

  /* Ermittelt Anzeigetext, Prüfmodus und (normalisierte) Geheimantwort */
  function secretFuer(st) {
    const tf = st.typFelder || {};
    const tol = (key) => tf[key] !== false; // Default: tolerant
    const norm = (val, t = true) => Crypto.normalize(val, t);
    const res = (o) => Object.assign({ key: null, modus: "button", tolerant: true,
      anzeigeText: "", optionen: null, zusatz: null }, o);

    switch (st.typ) {
      case "standard":
        return res({ anzeigeText: tf.aufgabe || st.aufgabe, modus: "antwort",
          tolerant: tol("toleranzGrossKlein"),
          key: tf.loesung ? norm(tf.loesung, tol("toleranzGrossKlein")) : null });
      case "raetsel":
        return res({ anzeigeText: tf.raetseltext || st.aufgabe, modus: "antwort",
          tolerant: tol("toleranzGrossKlein"),
          key: tf.loesung ? norm(tf.loesung, tol("toleranzGrossKlein")) : null });
      case "codewort":
        return res({ anzeigeText: st.aufgabe, modus: "antwort",
          tolerant: tol("toleranzGrossKlein"),
          key: tf.codewort ? norm(tf.codewort, tol("toleranzGrossKlein")) : null });
      case "feuerwehrwissen":
        if (tf.antwortTyp === "multipleChoice") {
          return res({ anzeigeText: tf.frage, modus: "mc", tolerant: true,
            optionen: (tf.antwortoptionen || []).filter(Boolean),
            key: tf.richtigeAntwort ? norm(tf.richtigeAntwort, true) : null,
            zusatz: tf.bonusfrage ? { bonusfrage: tf.bonusfrage } : null });
        }
        return res({ anzeigeText: tf.frage, modus: "antwort", tolerant: true,
          key: tf.antwortText ? norm(tf.antwortText, true) : null,
          zusatz: tf.bonusfrage ? { bonusfrage: tf.bonusfrage } : null });
      case "fotoauftrag":
        return res({ anzeigeText: tf.auftragstext,
          zusatz: tf.bildHinweis ? { bildHinweis: tf.bildHinweis } : null,
          ...(tf.abschlussModus === "bestaetigungswort" && tf.bestaetigungswort
            ? { modus: "antwort", tolerant: true, key: norm(tf.bestaetigungswort, true) }
            : { modus: "button" }) });
      case "geschicklichkeit":
        return res({ anzeigeText: tf.beschreibung,
          zusatz: tf.optionaleZeitangabe ? { zeit: tf.optionaleZeitangabe } : null,
          ...(tf.abschlussModus === "bestaetigungswort" && tf.bestaetigungswort
            ? { modus: "antwort", tolerant: true, key: norm(tf.bestaetigungswort, true) }
            : { modus: "button" }) });
      case "orientierung":
        return res({
          anzeigeText: tf.orientierungshinweis,
          zusatz: {
            peilung: tf.peilungshinweis || "",
            zielkoordinaten: tf.zielkoordinaten || ""
          },
          ...(tf.loesung
            ? { modus: "antwort", tolerant: true, key: norm(tf.loesung, true) }
            : { modus: "button" }) });
      case "zielstation":
        return res({ anzeigeText: tf.abschlusstext, modus: "button", tolerant: true });
      case "kombi":
        return kombiSecret(st, tf, res, norm);
      default:
        return res({ anzeigeText: st.aufgabe, modus: "button" });
    }
  }

  function kombiSecret(st, tf, res, norm) {
    const aktiv = (tf.bausteine && tf.bausteine.aktiv) || [];
    const teile = [];
    let key = null, modus = "button";
    aktiv.forEach(b => {
      const d = tf[b] || {};
      if (b === "aufgabe" && d.aufgabe) teile.push(d.aufgabe);
      if (b === "raetsel" && d.raetseltext) teile.push(d.raetseltext);
      if (b === "feuerwehrwissen" && d.frage) teile.push(d.frage);
      if (b === "fotoauftrag" && d.auftragstext) teile.push(d.auftragstext);
      if (b === "geschicklichkeit" && d.beschreibung) teile.push(d.beschreibung);
      if (b === "codewort" && d.codewort) teile.push("Codewort eingeben.");
      if (b === "hinweis" && d.text) teile.push(d.text);
      // erstes prüfbares Geheimnis bestimmt die Prüfung
      if (key === null) {
        const sec = d.loesung || (b === "codewort" && d.codewort)
          || (b === "feuerwehrwissen" && d.antwortText)
          || d.bestaetigungswort;
        if (sec) { key = norm(sec, true); modus = "antwort"; }
      }
    });
    return res({ anzeigeText: teile.join("\n\n"), modus, tolerant: true, key });
  }

  /* =================== QR -> PNG =================== */
  function qrPng(text, cell) {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    const margin = 4;
    const size = (n + margin * 2) * cell;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#000000";
    for (let r = 0; r < n; r++)
      for (let col = 0; col < n; col++)
        if (qr.isDark(r, col))
          ctx.fillRect((col + margin) * cell, (r + margin) * cell, cell, cell);
    // DataURL -> Blob
    const dataUrl = c.toDataURL("image/png");
    const bin = atob(dataUrl.split(",")[1]);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: "image/png" });
  }

  /* =================== Text-Beilagen =================== */
  function normBasis(b) {
    b = (b || "").trim();
    if (b && !b.endsWith("/")) b += "/";
    return b;
  }

  function bilderReadme() {
    const lines = [];
    lines.push("Bilder müssen manuell in dieser Ordnerstruktur abgelegt werden.");
    lines.push("Erwartete Pfade (aus den Stationen):");
    lines.push("");
    Store.state.stationen.forEach(st =>
      (st.bilder || []).forEach(b => lines.push("  " + b)));
    const sb = Store.state.projekt.schatzbild;
    if (sb && !/^https?:/i.test(sb)) lines.push("  " + sb + "   (Schatzbild)");
    if (lines.length <= 3) lines.push("  (keine Bildpfade referenziert)");
    return lines.join("\n");
  }

  function anleitung(basis) {
    return [
      "SCHNITZELJAGD – EXPORT",
      "================================",
      "",
      "Dieser Ordner enthält BEIDES:",
      "  A) die Teilnehmer-Site (station.html, schatz.html, qr/, daten/)",
      "  B) das Planungstool (index.html) zum Online-Bearbeiten",
      "",
      "TEILNEHMER",
      "----------",
      "1. Diesen Ordnerinhalt ins GitHub-Pages-Repository legen.",
      "2. Bilder gemäß bilder/README.txt in /bilder/ ablegen.",
      "3. Veröffentlichen. Aufruf einer Station z. B.:",
      "   " + basis + "station.html?station=01&gruppe=G1",
      "   Schatzseite: " + basis + "schatz.html",
      "   QR-Codes liegen unter /qr/ (je Station und Gruppe).",
      "",
      "PLANUNG (online)",
      "----------------",
      "Planungstool öffnen: " + basis,
      "Projekt laden/speichern über die Schaltflächen oben (JSON-Datei vom Gerät).",
      "",
      "WICHTIG ZUR SICHERHEIT",
      "----------------------",
      "- daten/data.json (Teilnehmer) enthält KEINE Klartextlösungen (nur Hashes).",
      "- Das bearbeitbare Projekt-JSON (mit Klartextlösungen) NICHT öffentlich ins",
      "  Repository legen – sonst sind die Lösungen sichtbar. Lokal aufbewahren und",
      "  bei Bedarf über 'JSON laden' einlesen."
    ].join("\n");
  }

  return { init, onShow };
})();

window.ExportTool = ExportTool;
