/* =====================================================================
 * worddb.js  –  Wortdatenbank (Tab)
 *   Kategorien, Wörter bearbeiten, Textimport (Variante A), Hilfe-Overlay
 * ===================================================================== */

const WordDB = (() => {
  let aktiveKat = null;
  let katListeEl, detailEl, importEl, summaryEl;

  const BEISPIEL =
`[Feuerwehr]
RETTER
FLAMME

[Geräte]
SCHLAUCH
HYDRANT`;

  function init() {
    katListeEl = document.getElementById("wdb-katliste");
    detailEl   = document.getElementById("wdb-detail");
    document.getElementById("btn-wdb-add-kat")
      .addEventListener("click", neueKategorie);
    document.getElementById("btn-wdb-hilfe")
      .addEventListener("click", zeigeHilfe);
    Store.subscribe(() => { renderKatListe(); });
  }

  function onShow(tab) {
    if (tab !== "wortdb") return;
    renderKatListe();
    renderDetail();
  }

  /* ---------- Kategorien-Liste ---------- */
  function renderKatListe() {
    const db = Store.state.wortdatenbank || {};
    const kats = Object.keys(db);
    if (!kats.length) {
      katListeEl.innerHTML = `<div class="leer-hinweis">Keine Kategorien.
        Anlegen oder importieren.</div>`;
      return;
    }
    katListeEl.innerHTML = kats.map(k => `
      <div class="station-item ${k === aktiveKat ? "active" : ""}" data-kat="${esc(k)}">
        <div class="info">
          <div class="name">${esc(k)}</div>
          <div class="typ">${(db[k] || []).length} Wörter</div>
        </div>
      </div>`).join("");
    katListeEl.querySelectorAll(".station-item").forEach(el =>
      el.addEventListener("click", () => { aktiveKat = el.dataset.kat; renderKatListe(); renderDetail(); }));
  }

  function neueKategorie() {
    const name = (prompt("Name der neuen Kategorie:") || "").trim();
    if (!name) return;
    if (Store.state.wortdatenbank[name]) { alert("Kategorie existiert bereits."); return; }
    Store.state.wortdatenbank[name] = [];
    Store.commit();
    aktiveKat = name;
    renderKatListe();
    renderDetail();
  }

  /* ---------- Detail (rechts) ---------- */
  function renderDetail() {
    const db = Store.state.wortdatenbank || {};

    // Import-Karte (immer sichtbar)
    let html = `
      <div class="card">
        <h3>Import aus Textdatei</h3>
        <div class="feld">
          <textarea id="wdb-import" placeholder="${esc(BEISPIEL)}" style="min-height:120px;font-family:monospace"></textarea>
        </div>
        <div class="editor-foot" style="margin-top:0">
          <button class="btn btn-primary btn-sm" id="btn-wdb-import">Importieren</button>
          <button class="btn btn-light btn-sm" id="btn-wdb-importfile">Datei wählen</button>
          <input type="file" id="wdb-file" accept=".txt" hidden>
        </div>
        <div id="wdb-summary" class="import-summary"></div>
      </div>`;

    if (aktiveKat && db[aktiveKat]) {
      const woerter = db[aktiveKat];
      html += `
        <div class="card">
          <h3>Kategorie: ${esc(aktiveKat)}</h3>
          <div class="feld" data-listgroup="wort">
            <label>Wörter</label>
            ${(woerter.length ? woerter : [""]).map((w, i) => `
              <div class="eintrag">
                <input type="text" data-wort-idx="${i}" value="${esc(w)}" style="text-transform:uppercase">
                <button class="btn btn-light btn-sm" data-wort-del="${i}">✕</button>
              </div>`).join("")}
            <button class="btn btn-light btn-sm" data-wort-add="1">+ Wort</button>
          </div>
          <div class="editor-foot">
            <button class="btn btn-primary btn-sm" id="btn-wdb-save">Speichern</button>
            <button class="btn btn-danger btn-sm" id="btn-wdb-delkat">Kategorie löschen</button>
            <span class="save-status" id="wdb-status">Gespeichert ✓</span>
          </div>
        </div>`;
    } else {
      html += `<div class="leer-hinweis">Links eine Kategorie wählen, um Wörter zu bearbeiten.</div>`;
    }

    detailEl.innerHTML = html;
    bindDetail();
  }

  /* ---------- Bindings ---------- */
  function bindDetail() {
    summaryEl = document.getElementById("wdb-summary");

    document.getElementById("btn-wdb-import")
      .addEventListener("click", () => importiere(document.getElementById("wdb-import").value));

    document.getElementById("btn-wdb-importfile")
      .addEventListener("click", () => document.getElementById("wdb-file").click());
    document.getElementById("wdb-file").addEventListener("change", e => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => { document.getElementById("wdb-import").value = r.result; importiere(r.result); };
      r.readAsText(f); e.target.value = "";
    });

    // Wort-Liste bearbeiten
    const group = detailEl.querySelector('[data-listgroup="wort"]');
    if (group) {
      group.querySelector("[data-wort-add]").addEventListener("click", () => {
        const div = document.createElement("div");
        div.className = "eintrag";
        const idx = group.querySelectorAll(".eintrag").length;
        div.innerHTML = `<input type="text" data-wort-idx="${idx}" style="text-transform:uppercase">
          <button class="btn btn-light btn-sm" data-wort-del="${idx}">✕</button>`;
        group.insertBefore(div, group.querySelector("[data-wort-add]"));
        div.querySelector("[data-wort-del]").addEventListener("click", () => div.remove());
      });
      group.querySelectorAll("[data-wort-del]").forEach(b =>
        b.addEventListener("click", e => e.target.closest(".eintrag").remove()));

      document.getElementById("btn-wdb-save").addEventListener("click", () => {
        const woerter = [...group.querySelectorAll("[data-wort-idx]")]
          .map(i => i.value.trim().toUpperCase()).filter(Boolean);
        // dedupliziert speichern
        Store.state.wortdatenbank[aktiveKat] = [...new Set(woerter)];
        Store.commit();
        blink("wdb-status");
        renderKatListe();
      });

      document.getElementById("btn-wdb-delkat").addEventListener("click", () => {
        if (confirm(`Kategorie „${aktiveKat}" löschen?`)) {
          delete Store.state.wortdatenbank[aktiveKat];
          Store.commit();
          aktiveKat = null;
          renderKatListe();
          renderDetail();
        }
      });
    }
  }

  /* ---------- Import (Variante A: merge + dedup + Zusammenfassung) ---------- */
  function importiere(text) {
    const parsed = parse(text);
    if (!parsed.kategorien.length) {
      zeigeSummary(["Kein gültiger Inhalt gefunden. Format prüfen (Hilfe)."], true);
      return;
    }
    let hinzu = 0, dup = 0, neueKat = 0;
    const db = Store.state.wortdatenbank;

    parsed.kategorien.forEach(({ name, woerter }) => {
      if (!db[name]) { db[name] = []; neueKat++; }
      const vorhanden = new Set(db[name].map(w => w.toUpperCase()));
      woerter.forEach(w => {
        const wu = w.toUpperCase();
        if (vorhanden.has(wu)) { dup++; }
        else { db[name].push(wu); vorhanden.add(wu); hinzu++; }
      });
    });

    Store.commit();
    renderKatListe();
    renderDetail(); // bindet Summary neu — daher danach anzeigen
    summaryEl = document.getElementById("wdb-summary");
    zeigeSummary([
      `${hinzu} ${hinzu === 1 ? "Wort" : "Wörter"} hinzugefügt`,
      `${dup} ${dup === 1 ? "Duplikat" : "Duplikate"} übersprungen`,
      `${neueKat} ${neueKat === 1 ? "neue Kategorie" : "neue Kategorien"} erstellt`
    ]);
  }

  // Parser: [Kategorie] gefolgt von Wörtern (eine Zeile = ein Wort)
  function parse(text) {
    const out = { kategorien: [] };
    let aktuell = null;
    (text || "").split(/\r?\n/).forEach(zeile => {
      const z = zeile.trim();
      if (!z) return;
      const m = z.match(/^\[(.+)\]$/);
      if (m) {
        aktuell = { name: m[1].trim(), woerter: [] };
        out.kategorien.push(aktuell);
      } else if (aktuell) {
        aktuell.woerter.push(z);
      }
      // Wörter ohne vorangehende Kategorie werden ignoriert
    });
    // leere Kategorien ohne Wörter trotzdem erlauben (erzeugt Kategorie)
    return out;
  }

  function zeigeSummary(zeilen, fehler) {
    if (!summaryEl) return;
    summaryEl.className = "import-summary " + (fehler ? "fehler" : "ok");
    summaryEl.innerHTML = `<strong>${fehler ? "Import nicht möglich:" : "Import abgeschlossen:"}</strong>
      <ul>${zeilen.map(z => `<li>${esc(z)}</li>`).join("")}</ul>`;
  }

  /* ---------- Hilfe-Overlay ---------- */
  function zeigeHilfe() {
    const ov = document.createElement("div");
    ov.className = "overlay";
    ov.innerHTML = `
      <div class="modal">
        <div class="modal-kopf">
          <h3>Importformat</h3>
          <button class="btn btn-light btn-sm" id="ov-close">✕</button>
        </div>
        <div class="modal-body">
          <p><strong>Aufbau:</strong> Eine Kategorie in eckigen Klammern, darunter je Zeile ein Wort.</p>
          <p><strong>Regeln:</strong></p>
          <ul>
            <li>Kategorie: <code>[Name]</code></li>
            <li>Ein Wort pro Zeile</li>
            <li>Leerzeilen werden ignoriert</li>
            <li>Bestehende Kategorien werden ergänzt</li>
            <li>Doppelte Wörter werden übersprungen</li>
          </ul>
          <p><strong>Beispiel:</strong></p>
          <pre id="ov-beispiel">${esc(BEISPIEL)}</pre>
          <button class="btn btn-primary btn-sm" id="ov-copy">Beispiel kopieren</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.addEventListener("click", e => { if (e.target === ov) ov.remove(); });
    ov.querySelector("#ov-close").addEventListener("click", () => ov.remove());
    ov.querySelector("#ov-copy").addEventListener("click", () => {
      navigator.clipboard?.writeText(BEISPIEL);
      ov.querySelector("#ov-copy").textContent = "Kopiert ✓";
    });
  }

  function blink(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 1500);
  }

  return { init, onShow };
})();

window.WordDB = WordDB;
