/* =====================================================================
 * stations.js  –  Stationsliste + dynamischer Editor
 * ===================================================================== */

const Stations = (() => {
  let aktiveId = null;
  let listeEl, editorEl, saveStatusEl;

  function init() {
    listeEl = document.getElementById("station-liste");
    editorEl = document.getElementById("station-editor");
    document.getElementById("btn-station-add")
      .addEventListener("click", () => {
        const s = Store.addStation();
        waehle(s.id);
      });
    Store.subscribe(() => { renderListe(); });
    renderListe();
    renderEditor();
  }

  /* ---------- Statusbewertung für die Ampel-Punkte ---------- */
  function status(s) {
    return {
      marker: s.position ? "ok" : "off",
      link:   s.githubLink ? "ok" : "off",
      inhalt: s.name && s.aufgabe ? "ok" : (s.name ? "warn" : "off")
    };
  }

  /* ---------- Liste ---------- */
  function renderListe() {
    const st = Store.state.stationen;
    if (!st.length) {
      listeEl.innerHTML = `<div class="leer-hinweis">Noch keine Stationen.
        Mit „+ Station" anlegen.</div>`;
      return;
    }
    listeEl.innerHTML = st.map(s => {
      const stat = status(s);
      const typLabel = (STATION_TYPES[s.typ] || {}).label || s.typ;
      return `
        <div class="station-item ${s.id === aktiveId ? "active" : ""}" data-id="${s.id}">
          <div class="nr">${s.id}</div>
          <div class="info">
            <div class="name">${s.name ? esc(s.name) : "<em>Ohne Namen</em>"}</div>
            <div class="typ">${typLabel}</div>
          </div>
          <div class="stat" title="Marker · Link · Inhalt">
            <span class="dot ${stat.marker}"></span>
            <span class="dot ${stat.link}"></span>
            <span class="dot ${stat.inhalt}"></span>
          </div>
        </div>`;
    }).join("");
    listeEl.querySelectorAll(".station-item").forEach(el =>
      el.addEventListener("click", () => waehle(el.dataset.id)));
  }

  function waehle(id) {
    aktiveId = id;
    renderListe();
    renderEditor();
  }

  /* ---------- Editor ---------- */
  function renderEditor() {
    const s = aktiveId ? Store.getStation(aktiveId) : null;
    if (!s) {
      editorEl.innerHTML = `<div class="platzhalter">
        <div><div class="gross">Keine Station gewählt</div>
        <div>Links eine Station wählen oder neu anlegen.</div></div></div>`;
      return;
    }

    const typDef = STATION_TYPES[s.typ] || STATION_TYPES.standard;

    editorEl.innerHTML = `
      <div class="card">
        <h3>Grunddaten · Station ${s.id}</h3>
        <div class="feld">
          <label>Stationsname</label>
          <input type="text" id="f-name" value="${esc(s.name)}">
        </div>
        <div class="feld">
          <label>Stationstyp</label>
          <select id="f-typ">
            ${Object.entries(STATION_TYPES).map(([k, v]) =>
              `<option value="${k}" ${k === s.typ ? "selected" : ""}>${v.label}</option>`).join("")}
          </select>
        </div>
        <div class="feld">
          <label>Stationseinleitung (optional)</label>
          <textarea id="f-aufgabe" placeholder="Einleitungstext zur Station&#10;Ortsbeschreibung („Ihr steht vor dem roten Gebäude…")&#10;Allgemeine Hinweise">${esc(s.aufgabe)}</textarea>
        </div>
        <div class="row">
          <div class="feld">
            <label>Radius (m)</label>
            <input type="number" id="f-radius" min="1" value="${s.radius}">
            <div class="hinweis">Wird vom Markerpunkt berechnet.</div>
          </div>
          <div class="feld">
            <label>Position</label>
            <input type="text" id="f-pos" readonly
              value="${s.position ? s.position.lat.toFixed(5) + ", " + s.position.lng.toFixed(5) : "— über Karte setzen —"}">
          </div>
        </div>
        <div class="feld">
          <label>Hinweis zur nächsten Station</label>
          <textarea id="f-hinweis">${esc(s.hinweisNaechste)}</textarea>
        </div>
        <div class="feld">
          <label>Nächster Ort / Kurzinfo für Spielleitung (optional)</label>
          <input type="text" id="f-hinweis-kurz" value="${esc(s.hinweisKurz)}"
            placeholder="z. B. Post, Rathaus, Sportplatz, Feuerwehrhaus">
          <div class="hinweis">Nur für Spielleitungsübersicht – wird Teilnehmern nicht angezeigt.</div>
        </div>
      </div>

      <div class="card" id="typ-felder">
        <h3>${typDef.label} · Typ-Felder</h3>
        ${renderTypFelder(s, typDef)}
      </div>

      <div class="card">
        <h3>Bilder (optional)</h3>
        <div class="feld" id="bilder-feld">
          <label>Bild aus diesem Projekt</label>
          ${renderListInputs(s.bilder, "bild", "bilder/station-01/bild-1.jpg")}
        </div>
        <div class="feld">
          <label>Externes Bild (URL)</label>
          <input type="url" id="f-extbild" value="${esc(s.externerBildlink)}">
        </div>
      </div>

      <div class="card">
        <h3>Link</h3>
        <div class="feld">
          <label>GitHub-Link automatisch</label>
          <input type="text" id="f-ghlink" value="${esc(s.githubLink)}" readonly>
          <div class="hinweis">Gruppe wird beim Export/QR ergänzt (&gruppe=G1).</div>
        </div>
      </div>

      <div class="editor-foot">
        <button class="btn btn-primary" id="btn-save">Speichern</button>
        <button class="btn btn-danger btn-sm" id="btn-del">Station löschen</button>
        <span class="save-status" id="save-status">Gespeichert ✓</span>
      </div>
    `;

    saveStatusEl = document.getElementById("save-status");
    bindEditor(s, typDef);
  }

  /* ---------- Typ-Felder rendern ---------- */
  function renderTypFelder(s, typDef) {
    if (s.typ === "kombi") return renderKombi(s);
    return typDef.felder.map(f => feldHTML(f, s.typFelder[f.key], `tf-${f.key}`)).join("");
  }

  function feldHTML(f, val, id) {
    const v = (val !== undefined && val !== null) ? val
            : (f.default !== undefined ? f.default : "");
    const hideAttr = f.showIf ? `data-showif-field="${f.showIf.field}" data-showif-value="${f.showIf.value}"` : "";

    if (f.type === "textarea")
      return `<div class="feld" ${hideAttr}><label>${f.label}</label>
        <textarea id="${id}">${esc(v)}</textarea></div>`;

    if (f.type === "select")
      return `<div class="feld" ${hideAttr}><label>${f.label}</label>
        <select id="${id}">${f.options.map(o =>
          `<option value="${o.value}" ${o.value === v ? "selected" : ""}>${o.label}</option>`).join("")}
        </select></div>`;

    if (f.type === "checkbox")
      return `<div class="feld checkbox" ${hideAttr}>
        <input type="checkbox" id="${id}" ${v ? "checked" : ""}>
        <label for="${id}">${f.label}</label></div>`;

    if (f.type === "list")
      return `<div class="feld list-feld" ${hideAttr} data-listfeld="${id}">
        <label>${f.label}</label>${renderListInputs(Array.isArray(v) ? v : [], id, "Option")}</div>`;

    // default: text
    return `<div class="feld" ${hideAttr}><label>${f.label}</label>
      <input type="text" id="${id}" value="${esc(v)}"></div>`;
  }

  function renderListInputs(arr, prefix, ph) {
    const items = (arr && arr.length ? arr : [""]).map((val, i) =>
      `<div class="eintrag">
        <input type="text" data-${prefix}-idx="${i}" value="${esc(val)}" placeholder="${ph}">
        <button class="btn btn-light btn-sm" data-${prefix}-del="${i}">✕</button>
      </div>`).join("");
    return `<div data-listgroup="${prefix}">${items}
      <button class="btn btn-light btn-sm" data-${prefix}-add="1">+ hinzufügen</button></div>`;
  }

  /* ---------- Kombi ---------- */
  function renderKombi(s) {
    const aktive = (s.typFelder.bausteine && s.typFelder.bausteine.aktiv) || [];
    const chips = KOMBI_BAUSTEINE.map(b =>
      `<div class="baustein-chip ${aktive.includes(b) ? "aktiv" : ""}" data-baustein="${b}">
        ${aktive.includes(b) ? "✓" : "+"} ${labelBaustein(b)}</div>`).join("");

    let felder = "";
    aktive.forEach(b => {
      const defs = bausteinFelder(b);
      const werte = (s.typFelder[b]) || {};
      felder += `<div class="card" style="margin-top:1rem;background:#fafafa">
        <h3 style="border-color:#e0e0e0">${labelBaustein(b)}</h3>
        ${defs.map(f => feldHTML(f, werte[f.key], `kb-${b}-${f.key}`)).join("")}</div>`;
    });

    return `<div class="bausteine">${chips}</div>${felder}`;
  }

  function labelBaustein(b) {
    const m = {
      aufgabe: "Aufgabe", raetsel: "Rätsel", feuerwehrwissen: "Feuerwehrwissen",
      fotoauftrag: "Fotoauftrag", geschicklichkeit: "Geschicklichkeit",
      codewort: "Codewort", hinweis: "Hinweis"
    };
    return m[b] || b;
  }

  // Felder, die ein Kombi-Baustein mitbringt (Teilmengen der Typen)
  function bausteinFelder(b) {
    switch (b) {
      case "aufgabe": return [
        { key: "aufgabe", type: "textarea", label: "Aufgabe" },
        { key: "loesung", type: "text", label: "Lösung" }];
      case "raetsel": return [
        { key: "raetseltext", type: "textarea", label: "Rätseltext" },
        { key: "loesung", type: "text", label: "Lösung" }];
      case "feuerwehrwissen": return [
        { key: "frage", type: "textarea", label: "Frage" },
        { key: "antwortText", type: "text", label: "Erwartete Antwort" }];
      case "fotoauftrag": return [
        { key: "auftragstext", type: "textarea", label: "Auftragstext" },
        { key: "bestaetigungswort", type: "text", label: "Bestätigungswort (optional)" }];
      case "geschicklichkeit": return [
        { key: "beschreibung", type: "textarea", label: "Beschreibung" },
        { key: "bestaetigungswort", type: "text", label: "Bestätigungswort (optional)" }];
      case "codewort": return [
        { key: "codewort", type: "text", label: "Codewort" }];
      case "hinweis": return [
        { key: "text", type: "textarea", label: "Hinweistext" }];
      default: return [];
    }
  }

  /* ---------- Editor-Bindings ---------- */
  function bindEditor(s, typDef) {
    // Typwechsel
    document.getElementById("f-typ").addEventListener("change", e => {
      Store.updateStation(s.id, { typ: e.target.value, typFelder: {} });
      renderEditor();
    });

    // showIf-Live-Auswertung
    editorEl.querySelectorAll("[data-showif-field]").forEach(applyShowIf);
    editorEl.querySelectorAll("select, input[type=checkbox]").forEach(el =>
      el.addEventListener("change", () =>
        editorEl.querySelectorAll("[data-showif-field]").forEach(applyShowIf)));

    // Kombi-Chips
    editorEl.querySelectorAll(".baustein-chip").forEach(chip =>
      chip.addEventListener("click", () => toggleBaustein(s, chip.dataset.baustein)));

    // Listenfelder (Bilder + Antwortoptionen) – Buttons
    bindListGroups();

    // Speichern
    document.getElementById("btn-save").addEventListener("click", () => speichere(s, typDef));
    // Löschen
    document.getElementById("btn-del").addEventListener("click", () => {
      if (confirm(`Station ${s.id} wirklich löschen?`)) {
        aktiveId = null;
        Store.removeStation(s.id);
        renderEditor();
      }
    });
  }

  function applyShowIf(el) {
    const f = el.dataset.showifField, want = el.dataset.showifValue;
    const ctrl = editorEl.querySelector(`#tf-${f}`) || editorEl.querySelector(`[id$="-${f}"]`);
    if (!ctrl) return;
    const cur = ctrl.type === "checkbox" ? String(ctrl.checked) : ctrl.value;
    el.style.display = (cur === want) ? "" : "none";
  }

  function toggleBaustein(s, b) {
    const tf = s.typFelder;
    if (!tf.bausteine) tf.bausteine = { aktiv: [] };
    const arr = tf.bausteine.aktiv;
    const i = arr.indexOf(b);
    if (i >= 0) arr.splice(i, 1); else arr.push(b);
    Store.updateStation(s.id, { typFelder: tf });
    renderEditor();
  }

  function bindListGroups() {
    editorEl.querySelectorAll("[data-listgroup]").forEach(group => {
      const p = group.dataset.listgroup;
      const add = group.querySelector(`[data-${p}-add]`);
      if (add) add.addEventListener("click", () => {
        const div = document.createElement("div");
        div.className = "eintrag";
        const idx = group.querySelectorAll(".eintrag").length;
        div.innerHTML = `<input type="text" data-${p}-idx="${idx}" placeholder="…">
          <button class="btn btn-light btn-sm" data-${p}-del="${idx}">✕</button>`;
        group.insertBefore(div, add);
        div.querySelector(`[data-${p}-del]`).addEventListener("click", () => div.remove());
      });
      group.querySelectorAll(`[data-${p}-del]`).forEach(btn =>
        btn.addEventListener("click", e => e.target.closest(".eintrag").remove()));
    });
  }

  function sammleListGroup(p) {
    const group = editorEl.querySelector(`[data-listgroup="${p}"]`);
    if (!group) return [];
    return [...group.querySelectorAll(`[data-${p}-idx]`)]
      .map(i => i.value.trim()).filter(Boolean);
  }

  /* ---------- Speichern ---------- */
  function speichere(s, typDef) {
    const patch = {
      name: val("f-name"),
      aufgabe: val("f-aufgabe"),
      radius: parseInt(val("f-radius"), 10) || s.radius,
      hinweisNaechste: val("f-hinweis"),
      hinweisKurz: val("f-hinweis-kurz"),
      externerBildlink: val("f-extbild"),
      bilder: sammleListGroup("bild")
    };

    // Typ-Felder einsammeln
    if (s.typ === "kombi") {
      patch.typFelder = sammleKombi(s);
    } else {
      const tf = {};
      typDef.felder.forEach(f => {
        if (f.type === "checkbox") tf[f.key] = !!document.getElementById(`tf-${f.key}`)?.checked;
        else if (f.type === "list") tf[f.key] = sammleListGroup(`tf-${f.key}`);
        else tf[f.key] = val(`tf-${f.key}`);
      });
      patch.typFelder = tf;
    }

    Store.updateStation(s.id, patch);
    blinkGespeichert();
  }

  function sammleKombi(s) {
    const aktive = (s.typFelder.bausteine && s.typFelder.bausteine.aktiv) || [];
    const tf = { bausteine: { aktiv: aktive.slice() } };
    aktive.forEach(b => {
      const obj = {};
      bausteinFelder(b).forEach(f => {
        obj[f.key] = val(`kb-${b}-${f.key}`);
      });
      tf[b] = obj;
    });
    return tf;
  }

  function blinkGespeichert() {
    if (!saveStatusEl) return;
    saveStatusEl.classList.add("show");
    setTimeout(() => saveStatusEl.classList.remove("show"), 1500);
  }

  /* ---------- Helpers ---------- */
  function val(id) { const el = document.getElementById(id); return el ? el.value.trim() : ""; }

  return { init };
})();

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
window.Stations = Stations;
window.esc = esc;
