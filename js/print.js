/* =====================================================================
 * print.js  –  Druckfunktionen für Planungstool
 *   1. druckeQrCodes()         – QR-Codes je Station × Gruppe
 *   2. druckeSpielleitung()    – Interne Übersicht mit Lösungen
 *   3. druckeLaufzettel()      – Laufzettel je Gruppe (ohne Lösungen)
 * ===================================================================== */

const PrintTool = (function () {

  /* =================== Helfer =================== */

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function normBasis(b) {
    b = (b || "").trim();
    if (b && !b.endsWith("/")) b += "/";
    return b;
  }

  function validiere(brauchtGruppen = true) {
    const s = Store.state;
    const fehler = [];
    if (!s.stationen.length) fehler.push("Keine Stationen vorhanden.");
    if (brauchtGruppen && !Object.keys(s.gruppen).length) fehler.push("Keine Gruppen vorhanden.");
    if (!s.projekt.githubBasislink.trim()) fehler.push("GitHub-Basislink fehlt – Links und QR-Codes werden nicht korrekt erzeugt.");
    return fehler;
  }

  function oeffneFenster(html) {
    const win = window.open("", "_blank");
    if (!win) { alert("Popup wurde blockiert. Bitte Popups für diese Seite erlauben."); return; }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    // Kurz warten, damit Bilder/Fonts laden können, dann Druckdialog
    win.onload = () => setTimeout(() => win.print(), 400);
  }

  function druckCSS() {
    return `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&family=Inter:wght@400;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', system-ui, sans-serif; font-size: 11pt; color: #1c2024; background: #fff; }
        h1 { font-family: 'Oswald', sans-serif; font-size: 18pt; margin-bottom: 4pt; }
        h2 { font-family: 'Oswald', sans-serif; font-size: 14pt; margin: 12pt 0 6pt; color: #c8102e; }
        h3 { font-family: 'Oswald', sans-serif; font-size: 12pt; margin: 8pt 0 4pt; }
        p  { margin: 3pt 0; }
        table { width: 100%; border-collapse: collapse; margin: 6pt 0; font-size: 10pt; }
        th { background: #1c2024; color: #fff; font-family: 'Oswald', sans-serif;
             font-weight: 500; padding: 5pt 7pt; text-align: left; }
        td { padding: 5pt 7pt; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
        tr:nth-child(even) td { background: #f9fafb; }
        .kopf { border-bottom: 3px solid #c8102e; padding-bottom: 8pt; margin-bottom: 12pt; }
        .badge { display: inline-block; background: #c8102e; color: #fff;
                 font-family: 'Oswald', sans-serif; font-weight: 700;
                 padding: 3pt 10pt; border-radius: 6pt; margin-bottom: 4pt; }
        .meta { font-size: 10pt; color: #6b7280; }
        .leer { color: #d1d5db; }
        @media print {
          .kein-druck { display: none !important; }
          a { text-decoration: none; color: inherit; }
        }
        .btn-druck {
          display: inline-block; margin: 8pt 6pt 0 0;
          background: #c8102e; color: #fff; border: none; border-radius: 6pt;
          font-family: 'Oswald', sans-serif; font-weight: 700; font-size: 11pt;
          padding: 6pt 14pt; cursor: pointer; text-transform: uppercase;
        }
      </style>`;
  }

  /* =================== QR-Codes erzeugen =================== */

  function qrDataUrl(text, cell) {
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
    return c.toDataURL("image/png");
  }

  /* =================== 1. QR-Codes drucken =================== */

  function druckeQrCodes() {
    const fehler = validiere(true);
    if (fehler.length) { alert("Export nicht möglich:\n\n" + fehler.join("\n")); return; }

    const s = Store.state;
    const basis = normBasis(s.projekt.githubBasislink);
    const titel = esc(s.projekt.titel || "Schnitzeljagd");
    const gruppen = Object.entries(s.gruppen);
    const stationen = [...s.stationen].sort((a, b) => a.id.localeCompare(b.id));

    // QR-Codes vorberechnen (canvas läuft im Hauptfenster)
    const qrMap = {};
    for (const [gid] of gruppen) {
      for (const st of stationen) {
        const url = basis + "station.html?station=" + st.id + "&gruppe=" + gid;
        qrMap[gid + "_" + st.id] = qrDataUrl(url, 7);
      }
    }

    let karten = "";
    for (const [gid, grp] of gruppen) {
      karten += `<div class="gruppen-block">
        <h2>Gruppe ${esc(gid)}${grp.name ? " – " + esc(grp.name) : ""}</h2>
        <div class="qr-grid">`;
      for (const st of stationen) {
        const dataUrl = qrMap[gid + "_" + st.id];
        karten += `
          <div class="qr-karte">
            <img src="${dataUrl}" alt="QR" class="qr-img">
            <div class="qr-gruppe">Gruppe ${esc(gid)}</div>
            <div class="qr-station">Station ${esc(st.id)} – ${esc(st.name || "–")}</div>
          </div>`;
      }
      karten += `</div></div>`;
    }

    const html = `<!DOCTYPE html><html lang="de"><head>
      <meta charset="UTF-8">
      <title>QR-Codes – ${titel}</title>
      ${druckCSS()}
      <style>
        .qr-grid { display: flex; flex-wrap: wrap; gap: 12pt; margin: 8pt 0 16pt; }
        .qr-karte { border: 1.5pt solid #e5e7eb; border-radius: 8pt;
                    padding: 8pt; text-align: center; width: 140pt; }
        .qr-img { width: 120pt; height: 120pt; display: block; margin: 0 auto 6pt; }
        .qr-gruppe { font-family: 'Oswald', sans-serif; font-weight: 700;
                     font-size: 11pt; color: #c8102e; }
        .qr-station { font-size: 9pt; color: #374151; margin-top: 2pt; }
        .gruppen-block { page-break-inside: avoid; }
        @media print { .gruppen-block { page-break-after: always; } }
      </style>
    </head><body>
      <div class="kopf">
        <div class="badge">QR-Codes</div>
        <h1>${titel}</h1>
        <div class="meta">${stationen.length} Stationen · ${gruppen.length} Gruppen</div>
      </div>
      <button class="btn-druck kein-druck" onclick="window.print()">🖨 Drucken</button>
      ${karten}
    </body></html>`;

    oeffneFenster(html);
  }

  /* =================== 2. Spielleitungsübersicht =================== */

  function loesungFuerStation(st) {
    const tf = st.typFelder || {};
    switch (st.typ) {
      case "standard":    return tf.loesung || "—";
      case "raetsel":     return tf.loesung || "—";
      case "orientierung": return tf.loesung || "(Orientierung)";
      case "codewort":    return tf.codewort || "—";
      case "zielstation": return "(Zielstation – kein Lösungstext)";
      case "feuerwehrwissen":
        if (tf.antwortTyp === "multipleChoice") return tf.richtigeAntwort || "—";
        return tf.antwortText || "—";
      case "fotoauftrag":
        return tf.abschlussModus === "bestaetigungswort" ? (tf.bestaetigungswort || "(Bestätigungswort)") : "(Abschluss-Button)";
      case "geschicklichkeit":
        return tf.abschlussModus === "bestaetigungswort" ? (tf.bestaetigungswort || "(Bestätigungswort)") : "(Abschluss-Button)";
      case "kombi": {
        const aktiv = (tf.bausteine && tf.bausteine.aktiv) || [];
        for (const b of aktiv) {
          const bf = tf[b] || {};
          if (bf.loesung) return bf.loesung;
          if (bf.codewort) return bf.codewort;
          if (bf.antwortText) return bf.antwortText;
          if (bf.richtigeAntwort) return bf.richtigeAntwort;
        }
        return "(Kombi – bitte prüfen)";
      }
      default: return "—";
    }
  }

  function druckeSpielleitung() {
    const fehler = validiere(false);
    if (fehler.length) { alert("Nicht möglich:\n\n" + fehler.join("\n")); return; }

    const s = Store.state;
    const titel = esc(s.projekt.titel || "Schnitzeljagd");
    const stationen = [...s.stationen].sort((a, b) => a.id.localeCompare(b.id));
    const gruppen = Object.entries(s.gruppen);

    // Stationsübersicht
    let stRows = stationen.map(st => {
      const typ = (STATION_TYPES[st.typ] || {}).label || st.typ;
      const loesung = loesungFuerStation(st);
      return `<tr>
        <td>${esc(st.id)}</td>
        <td>${esc(st.name || "–")}</td>
        <td>${esc(typ)}</td>
        <td>${esc(loesung)}</td>
        <td>${esc(st.hinweisNaechste || "–")}</td>
        <td>☐</td><td>☐</td><td></td>
      </tr>`;
    }).join("");

    // Gruppenübersicht
    let grRows = gruppen.map(([gid, grp]) => {
      const buchstaben = Object.entries(grp.buchstaben || {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([sid, b]) => `${sid}=${b}`).join(", ");
      return `<tr>
        <td>${esc(gid)}</td>
        <td style="min-width:120pt">________________________</td>
        <td>${esc(grp.loesungswort || "—")}</td>
        <td style="font-size:9pt">${esc(buchstaben || "—")}</td>
      </tr>`;
    }).join("");

    const html = `<!DOCTYPE html><html lang="de"><head>
      <meta charset="UTF-8">
      <title>Spielleitungsübersicht – ${titel}</title>
      ${druckCSS()}
      <style>
        .felder { display: flex; gap: 20pt; margin: 8pt 0 16pt; flex-wrap: wrap; }
        .feld { flex: 1; min-width: 120pt; border-bottom: 1.5pt solid #1c2024; font-size: 10pt;
                color: #6b7280; padding-bottom: 2pt; }
      </style>
    </head><body>
      <div class="kopf">
        <div class="badge">INTERN – Spielleitungsübersicht</div>
        <h1>${titel}</h1>
      </div>
      <div class="felder">
        <div class="feld">Datum: ____________</div>
        <div class="feld">Startzeit: ____________</div>
        <div class="feld">Spielleitung: ________________________</div>
      </div>
      <button class="btn-druck kein-druck" onclick="window.print()">🖨 Drucken</button>

      <h2>Stationsübersicht</h2>
      <table>
        <thead><tr>
          <th>Station</th><th>Name</th><th>Typ</th><th>Lösung / Antwort</th>
          <th>Hinweis nächste</th><th>QR ✓</th><th>GPS ✓</th><th>Bemerkung</th>
        </tr></thead>
        <tbody>${stRows}</tbody>
      </table>

      <h2>Gruppen / Lösungswörter</h2>
      <table>
        <thead><tr>
          <th>Gruppe</th><th>Namen der Kinder</th><th>Lösungswort</th><th>Buchstaben je Station</th>
        </tr></thead>
        <tbody>${grRows}</tbody>
      </table>
    </body></html>`;

    oeffneFenster(html);
  }

  /* =================== 3. Laufzettel =================== */

  function druckeLaufzettel() {
    const fehler = validiere(true);
    if (fehler.length) { alert("Nicht möglich:\n\n" + fehler.join("\n")); return; }

    const s = Store.state;
    const titel = esc(s.projekt.titel || "Schnitzeljagd");
    const stationen = [...s.stationen].sort((a, b) => a.id.localeCompare(b.id));
    const gruppen = Object.entries(s.gruppen);
    const anzahl = stationen.length;

    const buchstabenZeile = Array.from({ length: anzahl }, () => "_").join("   ");

    let zettel = "";
    for (const [gid] of gruppen) {
      const rows = stationen.map(st => `<tr>
        <td>Station ${esc(st.id)} – ${esc(st.name || "–")}</td>
        <td style="text-align:center;letter-spacing:4pt;font-size:14pt">______</td>
        <td>______________________________</td>
      </tr>`).join("");

      zettel += `
        <div class="zettel">
          <div class="kopf">
            <div class="badge">${titel}</div>
            <h1>Laufzettel – Gruppe ${esc(gid)}</h1>
            <p style="font-size:9.5pt;color:#6b7280;margin-top:4pt">
              Tragt nach jeder Station euren Buchstaben ein. Am Ende setzt ihr daraus euer Lösungswort zusammen.
            </p>
          </div>
          <table>
            <thead><tr>
              <th>Station</th><th>Buchstabe</th><th>Notiz / Hinweis</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <div style="margin-top:14pt">
            <p style="font-weight:700;margin-bottom:4pt">Gesammelte Buchstaben:</p>
            <p style="font-size:18pt;letter-spacing:10pt;font-family:'Oswald',sans-serif">${buchstabenZeile}</p>
          </div>
          <div style="margin-top:12pt;border-bottom:2pt solid #1c2024;padding-bottom:2pt">
            <p style="font-weight:700;margin-bottom:2pt">Unser Lösungswort:</p>
            <p style="font-size:10pt;color:#6b7280">____________________________________</p>
          </div>
        </div>`;
    }

    const html = `<!DOCTYPE html><html lang="de"><head>
      <meta charset="UTF-8">
      <title>Laufzettel – ${titel}</title>
      ${druckCSS()}
      <style>
        .zettel { page-break-after: always; padding-bottom: 10pt; }
        .zettel:last-child { page-break-after: auto; }
        td:nth-child(2) { width: 60pt; }
        td:nth-child(3) { width: 180pt; }
      </style>
    </head><body>
      <button class="btn-druck kein-druck" onclick="window.print()">🖨 Drucken</button>
      ${zettel}
    </body></html>`;

    oeffneFenster(html);
  }

  /* =================== Init =================== */

  function init() {
    document.getElementById("btn-druck-qr").addEventListener("click", druckeQrCodes);
    document.getElementById("btn-druck-leitung").addEventListener("click", druckeSpielleitung);
    document.getElementById("btn-druck-laufzettel").addEventListener("click", druckeLaufzettel);
  }

  return { init };
})();

window.PrintTool = PrintTool;
