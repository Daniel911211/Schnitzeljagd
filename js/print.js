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

  function druckDatum() {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const jj = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `Gedruckt am: ${dd}.${mm}.${jj}, ${hh}:${mi} Uhr`;
  }

  function kuerze(text, max) {
    if (!text) return "—";
    return text.length > max ? text.slice(0, max).trimEnd() + "…" : text;
  }

  function validiere({ brauchtGruppen = true, brauchtBasislink = false } = {}) {
    const s = Store.state;
    const fehler = [];
    if (!s.stationen.length) fehler.push("Keine Stationen vorhanden.");
    if (brauchtGruppen && !Object.keys(s.gruppen).length) fehler.push("Keine Gruppen vorhanden.");
    if (brauchtBasislink && !s.projekt.githubBasislink.trim()) fehler.push("GitHub-Basislink fehlt – Links und QR-Codes werden nicht korrekt erzeugt.");
    return fehler;
  }

  function oeffneFenster(html) {
    const win = window.open("", "_blank");
    if (!win) { alert("Popup wurde blockiert. Bitte Popups für diese Seite erlauben."); return; }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
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
        p  { margin: 3pt 0; }
        table { width: 100%; border-collapse: collapse; margin: 6pt 0; font-size: 10pt; }
        th { background: #1c2024; color: #fff; font-family: 'Oswald', sans-serif;
             font-weight: 500; padding: 5pt 7pt; text-align: left; }
        td { padding: 5pt 7pt; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
        tr:nth-child(even) td { background: #f9fafb; }
        .kopf { border-bottom: 3px solid #c8102e; padding-bottom: 8pt; margin-bottom: 12pt;
                display: flex; justify-content: space-between; align-items: flex-end; }
        .kopf-links {}
        .kopf-datum { font-size: 8.5pt; color: #6b7280; text-align: right; white-space: nowrap; }
        .badge { display: inline-block; background: #c8102e; color: #fff;
                 font-family: 'Oswald', sans-serif; font-weight: 700;
                 padding: 3pt 10pt; border-radius: 6pt; margin-bottom: 4pt; }
        .meta { font-size: 10pt; color: #6b7280; }
        @media print {
          .kein-druck { display: none !important; }
          a { text-decoration: none; color: inherit; }
        }
        .btn-druck {
          display: inline-block; margin: 8pt 6pt 8pt 0;
          background: #c8102e; color: #fff; border: none; border-radius: 6pt;
          font-family: 'Oswald', sans-serif; font-weight: 700; font-size: 11pt;
          padding: 6pt 14pt; cursor: pointer; text-transform: uppercase;
        }
      </style>`;
  }

  function kopfHTML(badge, titel, meta) {
    return `<div class="kopf">
      <div class="kopf-links">
        <div class="badge">${badge}</div>
        <h1>${titel}</h1>
        ${meta ? `<div class="meta">${meta}</div>` : ""}
      </div>
      <div class="kopf-datum">${druckDatum()}</div>
    </div>`;
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
    const fehler = validiere({ brauchtGruppen: true, brauchtBasislink: true });
    if (fehler.length) { alert("Export nicht möglich:\n\n" + fehler.join("\n")); return; }

    const s = Store.state;
    const basis = normBasis(s.projekt.githubBasislink);
    const titel = esc(s.projekt.titel || "Schnitzeljagd");
    const gruppen = Object.entries(s.gruppen);
    // numerisch sortieren wie Solution.stationIdsSortiert()
    const stationen = [...s.stationen].sort((a, b) => parseInt(a.id, 10) - parseInt(b.id, 10));

    // G1 → "Gruppe 1", sonst "Gruppe <id>"
    function gruppeLabel(gid) {
      return /^G(\d+)$/.test(gid) ? "Gruppe " + gid.slice(1) : "Gruppe " + esc(gid);
    }

    // QR-Bilder einmal erzeugen und in allen Layouts wiederverwenden
    const qrMap = {};
    for (const [gid] of gruppen) {
      for (const st of stationen) {
        const url = basis + "station.html?station=" + st.id + "&gruppe=" + gid;
        qrMap[gid + "_" + st.id] = qrDataUrl(url, 10);
      }
    }

    // --- Einzelkarten zum Ausschneiden, je Gruppe ein Block ---
    // Wird nur EINMAL ins HTML geschrieben; kompakt/groß schalten per CSS-Klasse um,
    // damit die QR-Bilddaten nicht doppelt im Dokument landen.
    let karten = "";
    for (const [gid] of gruppen) {
      karten += `<div class="gruppen-block">
        ${kopfHTML("QR-Codes zum Ausschneiden", titel, "")}
        <h2>${gruppeLabel(gid)}</h2>
        <div class="karten-grid">`;
      for (const st of stationen) {
        const stNr = parseInt(st.id, 10) || st.id;
        karten += `
          <div class="qr-karte">
            <span class="schere">✂</span>
            <img src="${qrMap[gid + "_" + st.id]}" alt="QR" class="qr-img">
            <div class="qr-nr">Station ${stNr}</div>
            <div class="qr-name">${esc(st.name || "—")}</div>
            <div class="qr-gruppe">${gruppeLabel(gid)}</div>
          </div>`;
      }
      karten += `</div></div>`;
    }

    // --- Stationsschild: ein Blatt je Station mit allen Gruppen ---
    let schilder = "";
    for (const st of stationen) {
      const stNr = parseInt(st.id, 10) || st.id;
      schilder += `<div class="schild">
        ${kopfHTML("Station " + stNr, esc(st.name || "—"), "")}
        <div class="schild-grid">
          ${gruppen.map(([gid]) => `
            <div class="schild-karte">
              <img src="${qrMap[gid + "_" + st.id]}" alt="QR" class="schild-img">
              <div class="schild-gruppe">${gruppeLabel(gid)}</div>
            </div>`).join("")}
        </div>
        <div class="schild-fuss">Jede Gruppe scannt ihren eigenen QR-Code.</div>
      </div>`;
    }

    const html = `<!DOCTYPE html><html lang="de"><head>
      <meta charset="UTF-8">
      <title>QR-Codes – ${titel}</title>
      ${druckCSS()}
      <style>
        @page { size: A4 portrait; margin: 10mm; }

        /* nur das aktive Layout ist sichtbar – auch im Ausdruck */
        .layout { display: none; }
        .layout.aktiv { display: block; }

        /* ---------- Einzelkarten zum Ausschneiden ---------- */
        .karten-grid { display: flex; flex-wrap: wrap; margin-top: 6pt; }
        .qr-karte {
          width: 50%;
          border: 1pt dashed #9ca3af;
          padding: 5mm 4mm;
          text-align: center;
          page-break-inside: avoid;   /* Karten nie am Seitenumbruch zerreißen */
          break-inside: avoid;
          position: relative;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
        }
        .schere { position: absolute; top: 2mm; left: 2.5mm;
                  font-size: 8pt; color: #d1d5db; line-height: 1; }
        .qr-img { display: block; margin: 0 auto 3mm; }
        .qr-nr { font-family: 'Oswald', sans-serif; font-weight: 700;
                 color: #c8102e; line-height: 1.1; }
        .qr-name { font-weight: 600; margin-top: 1mm; line-height: 1.25; }
        .qr-gruppe { color: #6b7280; margin-top: 1.5mm; }

        /* kompakt: 2 x 3 = 6 pro Seite (3 x 88mm = 264mm passen in 277mm) */
        #layout-karten.modus-kompakt .qr-karte { height: 88mm; }
        #layout-karten.modus-kompakt .qr-img   { width: 55mm; height: 55mm; }
        #layout-karten.modus-kompakt .qr-nr    { font-size: 14pt; }
        #layout-karten.modus-kompakt .qr-name  { font-size: 9.5pt; }
        #layout-karten.modus-kompakt .qr-gruppe{ font-size: 9pt; }

        /* groß: 2 x 2 = 4 pro Seite (2 x 133mm = 266mm passen in 277mm) */
        #layout-karten.modus-gross .qr-karte { height: 133mm; }
        #layout-karten.modus-gross .qr-img   { width: 70mm; height: 70mm; }
        #layout-karten.modus-gross .qr-nr    { font-size: 17pt; }
        #layout-karten.modus-gross .qr-name  { font-size: 11pt; }
        #layout-karten.modus-gross .qr-gruppe{ font-size: 10.5pt; }

        .gruppen-block { page-break-before: always; }
        .gruppen-block:first-child { page-break-before: auto; }

        /* ---------- Stationsschild ---------- */
        .schild { page-break-after: always; }
        .schild:last-child { page-break-after: auto; }
        .schild-grid { display: flex; flex-wrap: wrap; justify-content: center;
                       gap: 6mm; margin-top: 8mm; }
        .schild-karte { text-align: center;
                        page-break-inside: avoid; break-inside: avoid; }
        .schild-img { width: 48mm; height: 48mm; display: block; }
        .schild-gruppe { font-family: 'Oswald', sans-serif; font-weight: 700;
                         font-size: 13pt; color: #c8102e; margin-top: 2mm; }
        .schild-fuss { margin-top: 10mm; text-align: center;
                       font-size: 10pt; color: #6b7280; }

        /* ---------- Umschaltleiste (nur am Bildschirm) ---------- */
        .leiste { display: flex; flex-wrap: wrap; gap: 6pt; align-items: center;
                  margin-bottom: 10pt; padding-bottom: 8pt;
                  border-bottom: 1px solid #e5e7eb; }
        .btn-um {
          background: #fff; color: #1c2024; border: 1.5pt solid #d1d5db;
          border-radius: 6pt; font-family: 'Oswald', sans-serif; font-weight: 500;
          font-size: 10pt; padding: 5pt 12pt; cursor: pointer;
        }
        .btn-um:hover { border-color: #9ca3af; background: #f9fafb; }
        .btn-um.aktiv { background: #1c2024; color: #fff; border-color: #1c2024; }
        .leiste-info { font-size: 9pt; color: #6b7280; margin-left: auto; }
      </style>
    </head><body>

      <div class="leiste kein-druck">
        <button class="btn-druck" onclick="window.print()">🖨 Drucken</button>
        <button class="btn-um aktiv" id="btn-kompakt">Karten kompakt · 6 pro Seite</button>
        <button class="btn-um" id="btn-gross">Karten groß · 4 pro Seite</button>
        <button class="btn-um" id="btn-schild">Stationsschild · 1 pro Station</button>
        <span class="leiste-info" id="leiste-info"></span>
      </div>

      <div class="layout aktiv modus-kompakt" id="layout-karten">${karten}</div>
      <div class="layout" id="layout-schild">${schilder}</div>

      <script>
        (function () {
          var anzStationen = ${stationen.length}, anzGruppen = ${gruppen.length};
          var karten = anzStationen * anzGruppen;
          // jede Gruppe beginnt auf einer neuen Seite -> je Gruppe aufrunden
          function seiten(proSeite) { return Math.ceil(anzStationen / proSeite) * anzGruppen; }
          var infos = {
            kompakt: karten + " Karten · " + seiten(6) + " Seiten · zum Ausschneiden",
            gross:   karten + " Karten · " + seiten(4) + " Seiten · zum Ausschneiden",
            schild:  anzStationen + " Blätter · kein Ausschneiden nötig"
          };
          var kartenEl = document.getElementById("layout-karten");
          var schildEl = document.getElementById("layout-schild");
          function zeige(name) {
            var istSchild = (name === "schild");
            kartenEl.classList.toggle("aktiv", !istSchild);
            kartenEl.classList.toggle("modus-kompakt", name === "kompakt");
            kartenEl.classList.toggle("modus-gross",   name === "gross");
            schildEl.classList.toggle("aktiv", istSchild);
            ["kompakt", "gross", "schild"].forEach(function (n) {
              document.getElementById("btn-" + n).classList.toggle("aktiv", n === name);
            });
            document.getElementById("leiste-info").textContent = infos[name];
          }
          ["kompakt", "gross", "schild"].forEach(function (n) {
            document.getElementById("btn-" + n)
              .addEventListener("click", function () { zeige(n); });
          });
          zeige("kompakt");
        })();
      <\/script>
    </body></html>`;

    oeffneFenster(html);
  }

  /* =================== 2. Spielleitungsübersicht =================== */

  function loesungFuerStation(st) {
    const tf = st.typFelder || {};
    switch (st.typ) {
      case "standard":     return tf.loesung || "—";
      case "raetsel":      return tf.loesung || "—";
      case "feuerwehrwissen":
        if (tf.antwortTyp === "multipleChoice") return tf.richtigeAntwort || "—";
        return tf.antwortText || "—";
      case "fotoauftrag":
        return tf.abschlussModus === "bestaetigungswort" ? (tf.bestaetigungswort || "(Bestätigungswort)") : "(Abschluss-Button)";
      case "kombi": {
        const aktiv = (tf.bausteine && tf.bausteine.aktiv) || [];
        for (const b of aktiv) {
          const bf = tf[b] || {};
          if (bf.loesung) return bf.loesung;
          if (bf.antwortText) return bf.antwortText;
          if (bf.richtigeAntwort) return bf.richtigeAntwort;
        }
        return "(Kombi – prüfen)";
      }
      default: return "—";
    }
  }

  function druckeSpielleitung() {
    const fehler = validiere({ brauchtGruppen: false, brauchtBasislink: false });
    if (fehler.length) { alert("Nicht möglich:\n\n" + fehler.join("\n")); return; }

    const s = Store.state;
    const titel = esc(s.projekt.titel || "Schnitzeljagd");
    const stationen = [...s.stationen].sort((a, b) => a.id.localeCompare(b.id));
    const gruppen = Object.entries(s.gruppen);

    let stRows = stationen.map(st => {
      const typ = (STATION_TYPES[st.typ] || {}).label || st.typ;
      const loesung = loesungFuerStation(st);
      const kurzinfo = st.hinweisKurz
        ? esc(st.hinweisKurz)
        : esc(kuerze(st.hinweisNaechste, 70));
      return `<tr>
        <td class="col-nr">${esc(st.id)}</td>
        <td class="col-name">${esc(st.name || "–")}</td>
        <td class="col-typ">${esc(typ)}</td>
        <td class="col-loesung">${esc(loesung)}</td>
        <td class="col-ort">${kurzinfo}</td>
        <td class="col-check">☐</td>
        <td class="col-check">☐</td>
        <td class="col-bem"></td>
      </tr>`;
    }).join("");

    let grRows = gruppen.map(([gid, grp]) => {
      const buchstaben = Object.entries(grp.buchstaben || {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([sid, b]) => `${sid}=${b}`).join(", ");
      return `<div class="gruppen-grid-row">
        <div>${esc(gid)}</div>
        <div><div class="kinder-linie"></div></div>
        <div>${esc(grp.loesungswort || "—")}</div>
        <div style="font-size:8.5pt">${esc(buchstaben || "—")}</div>
      </div>`;
    }).join("");

    const html = `<!DOCTYPE html><html lang="de"><head>
      <meta charset="UTF-8">
      <title>Spielleitungsübersicht – ${titel}</title>
      ${druckCSS()}
      <style>
        @page { size: A4 landscape; margin: 15mm; }
        .felder { display: flex; gap: 20pt; margin: 8pt 0 14pt; flex-wrap: wrap; }
        .feld-zeile { flex: 1; min-width: 100pt; border-bottom: 1.5pt solid #1c2024;
                      font-size: 10pt; color: #6b7280; padding-bottom: 2pt; }
        .col-nr    { width: 32pt; }
        .col-name  { width: 80pt; }
        .col-typ   { width: 70pt; }
        .col-loesung { width: 90pt; }
        .col-ort   { width: 100pt; }
        .col-check { width: 24pt; text-align: center; }
        .col-bem   { }
        .gruppen-grid { width: 100%; margin-top: 6pt; }
        .gruppen-grid-header,
        .gruppen-grid-row {
          display: grid;
          grid-template-columns: 45pt 1fr 85pt 150pt;
          column-gap: 12pt;
          align-items: end;
          padding: 4pt 0;
          border-bottom: 1px solid #e5e7eb;
        }
        .gruppen-grid-header {
          background: #1c2024; color: #fff;
          font-family: 'Oswald', sans-serif; font-weight: 500;
          font-size: 10pt; padding: 5pt 6pt;
          border-bottom: none;
        }
        .gruppen-grid-row:nth-child(even) { background: #f9fafb; }
        .gruppen-grid-row { padding: 20pt 6pt 8pt; }
        .kinder-linie {
          border-bottom: 1.3pt solid #1c2024;
          height: 16pt; width: 100%;
        }
      </style>
    </head><body>
      ${kopfHTML("INTERN – Spielleitungsübersicht", titel, "")}
      <div class="felder">
        <div class="feld-zeile">Datum: ____________</div>
        <div class="feld-zeile">Startzeit: ____________</div>
        <div class="feld-zeile">Spielleitung: ____________________________</div>
      </div>
      <button class="btn-druck kein-druck" onclick="window.print()">🖨 Drucken</button>

      <h2>Stationsübersicht</h2>
      <table>
        <thead><tr>
          <th class="col-nr">Station</th>
          <th class="col-name">Name</th>
          <th class="col-typ">Typ</th>
          <th class="col-loesung">Lösung / Antwort</th>
          <th class="col-ort">Nächster Ort</th>
          <th class="col-check">QR</th>
          <th class="col-check">GPS</th>
          <th class="col-bem">Bemerkung</th>
        </tr></thead>
        <tbody>${stRows}</tbody>
      </table>

      <h2>Gruppen / Lösungswörter</h2>
      <div class="gruppen-grid">
        <div class="gruppen-grid-header">
          <div>Gruppe</div>
          <div>Namen der Kinder</div>
          <div>Lösungswort</div>
          <div>Buchstaben je Station</div>
        </div>
        ${grRows}
      </div>
    </body></html>`;

    oeffneFenster(html);
  }

  /* =================== 3. Laufzettel =================== */

  function druckeLaufzettel() {
    const fehler = validiere({ brauchtGruppen: true, brauchtBasislink: false });
    if (fehler.length) { alert("Nicht möglich:\n\n" + fehler.join("\n")); return; }

    const s = Store.state;
    const titel = esc(s.projekt.titel || "Schnitzeljagd");
    const stationen = [...s.stationen].sort((a, b) => a.id.localeCompare(b.id));
    const gruppen = Object.entries(s.gruppen);

    let zettel = "";
    for (const [gid] of gruppen) {
      const rows = stationen.map(st => `<tr>
        <td class="col-station">Station ${esc(st.id)} – ${esc(st.name || "–")}</td>
        <td class="col-buch"><div class="buch-linie"></div></td>
        <td class="col-notiz"><div class="notiz-linie"></div></td>
      </tr>`).join("");

      zettel += `
        <div class="zettel">
          ${kopfHTML(titel, "Laufzettel – Gruppe " + esc(gid), "")}
          <p style="font-size:9.5pt;color:#6b7280;margin-bottom:10pt">
            Tragt nach jeder Station euren Buchstaben ein. Am Ende setzt ihr daraus euer Lösungswort zusammen.
          </p>
          <table>
            <thead><tr>
              <th class="col-station">Station</th>
              <th class="col-buch">Buchstabe</th>
              <th class="col-notiz">Notiz / Hinweis</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="loesungswort-block">
            <div class="loesungswort-label">Lösungswort:</div>
            <div class="loesungswort-linie"></div>
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
        .col-station { width: 50%; }
        .col-buch { width: 55pt; text-align: center; }
        .col-notiz { width: 45%; }
        th.col-buch { text-align: center; }
        .buch-linie {
          border-bottom: 1.5pt dashed #9ca3af;
          width: 36pt; margin: 4pt auto 0;
          height: 16pt;
        }
        .notiz-linie {
          border-bottom: 1pt solid #d1d5db;
          width: 100%; height: 16pt;
        }
        .loesungswort-block { margin-top: 20pt; }
        .loesungswort-label { font-weight: 700; font-size: 11pt; margin-bottom: 8pt; }
        .loesungswort-linie {
          border-bottom: 1.5pt solid #1c2024;
          width: 100%; height: 20pt;
        }
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
