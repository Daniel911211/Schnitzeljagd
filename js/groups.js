/* =====================================================================
 * groups.js  –  Gruppen + Lösungswörter (Tab)
 *   Variante A: gleiche Stationen/Route, nur Buchstabenverteilung mischt
 * ===================================================================== */

const Groups = (() => {
  let aktiveGruppe = null;
  let listeEl, editorEl;

  function init() {
    listeEl = document.getElementById("gruppen-liste");
    editorEl = document.getElementById("gruppen-editor");
    document.getElementById("btn-gruppe-add")
      .addEventListener("click", neueGruppe);
    Store.subscribe(() => { renderListe(); });
  }

  function onShow(tab) {
    if (tab !== "gruppen") return;
    renderListe();
    renderEditor();
  }

  /* ---------- Gruppe anlegen ---------- */
  function neueGruppe() {
    const g = Store.state.gruppen;
    let n = 1;
    while (g["G" + n]) n++;
    const id = "G" + n;
    g[id] = { loesungswort: "", buchstaben: {} };
    Store.commit();
    aktiveGruppe = id;
    renderListe();
    renderEditor();
  }

  /* ---------- Liste ---------- */
  function renderListe() {
    const g = Store.state.gruppen;
    const ids = Object.keys(g);
    if (!ids.length) {
      listeEl.innerHTML = `<div class="leer-hinweis">Keine Gruppen.
        Mit „+ Gruppe" anlegen.</div>`;
      return;
    }
    const anzahl = Store.state.stationen.length;
    listeEl.innerHTML = ids.map(id => {
      const grp = g[id];
      const pruef = Solution.pruefeWortlaenge(grp.loesungswort, anzahl);
      return `
        <div class="station-item ${id === aktiveGruppe ? "active" : ""}" data-id="${id}">
          <div class="nr">${id}</div>
          <div class="info">
            <div class="name">${grp.loesungswort ? esc(grp.loesungswort) : "<em>kein Wort</em>"}</div>
            <div class="typ">${pruef.ok ? "verteilt: " + verteilteAnzahl(grp) + "/" + anzahl : pruef.grund}</div>
          </div>
          <div class="stat"><span class="dot ${pruef.ok ? "ok" : "warn"}"></span></div>
        </div>`;
    }).join("");
    listeEl.querySelectorAll(".station-item").forEach(el =>
      el.addEventListener("click", () => { aktiveGruppe = el.dataset.id; renderListe(); renderEditor(); }));
  }

  function verteilteAnzahl(grp) {
    return Object.values(grp.buchstaben || {}).filter(Boolean).length;
  }

  /* ---------- Editor ---------- */
  function renderEditor() {
    const id = aktiveGruppe;
    const grp = id ? Store.state.gruppen[id] : null;
    if (!grp) {
      editorEl.innerHTML = `<div class="platzhalter"><div>
        <div class="gross">Keine Gruppe gewählt</div>
        <div>Links wählen oder neu anlegen.</div></div></div>`;
      return;
    }

    const stationen = Solution.stationIdsSortiert(Store.state);
    const anzahl = stationen.length;
    const pruef = Solution.pruefeWortlaenge(grp.loesungswort, anzahl);
    const dbWords = wortdbWoerter();

    editorEl.innerHTML = `
      <div class="card">
        <h3>Gruppe ${id}</h3>
        <div class="feld">
          <label>Lösungswort</label>
          <input type="text" id="g-wort" value="${esc(grp.loesungswort)}"
            placeholder="z. B. RETTER" style="text-transform:uppercase">
          <div class="hinweis ${pruef.ok ? "" : "warn-text"}">
            ${pruef.ok
              ? `Länge ${grp.loesungswort.length} = ${anzahl} Stationen ✓`
              : "⚠ " + pruef.grund + " — keine Verteilung möglich."}
          </div>
        </div>
        ${dbWords.length ? `
        <div class="feld">
          <label>… oder aus Wortdatenbank wählen</label>
          <select id="g-db">
            <option value="">— wählen —</option>
            ${dbWords.map(w => `<option value="${esc(w.wort)}">${esc(w.kat)}: ${esc(w.wort)}</option>`).join("")}
          </select>
        </div>` : `<div class="hinweis">Wortdatenbank ist leer — Wort manuell eingeben.</div>`}
        <div class="editor-foot" style="margin-top:.5rem">
          <button class="btn btn-light btn-sm" id="btn-del-gruppe">Gruppe löschen</button>
        </div>
      </div>

      <div class="card">
        <h3>Buchstabenverteilung</h3>
        <div class="editor-foot" style="margin-bottom:1rem;margin-top:0">
          <button class="btn btn-primary btn-sm" id="btn-verteile" ${pruef.ok ? "" : "disabled"}>
            Automatisch mischen</button>
          <button class="btn btn-light btn-sm" id="btn-clear">Verteilung leeren</button>
          <span class="hinweis" style="margin-left:auto">Manuell überschreibbar</span>
        </div>
        ${anzahl ? renderTabelle(grp, stationen) : `<div class="leer-hinweis">Keine Stationen vorhanden.</div>`}
      </div>
    `;

    bind(id, grp, stationen);
  }

  function renderTabelle(grp, stationen) {
    const rows = stationen.map(sid => {
      const st = Store.getStation(sid);
      const letter = (grp.buchstaben && grp.buchstaben[sid]) || "";
      return `<tr>
        <td class="t-nr">${sid}</td>
        <td class="t-name">${st && st.name ? esc(st.name) : "<em>—</em>"}</td>
        <td class="t-letter">
          <input type="text" maxlength="1" data-letter="${sid}" value="${esc(letter)}"
            style="text-transform:uppercase"></td>
      </tr>`;
    }).join("");
    return `<table class="verteil-tab">
      <thead><tr><th>Nr.</th><th>Station</th><th>Buchstabe</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
  }

  /* ---------- Bindings ---------- */
  function bind(id, grp, stationen) {
    const wortEl = document.getElementById("g-wort");
    wortEl.addEventListener("change", () => {
      grp.loesungswort = wortEl.value.trim().toUpperCase();
      Store.commit();
      renderEditor();
    });

    const dbEl = document.getElementById("g-db");
    if (dbEl) dbEl.addEventListener("change", () => {
      if (!dbEl.value) return;
      grp.loesungswort = dbEl.value.trim().toUpperCase();
      Store.commit();
      renderEditor();
    });

    document.getElementById("btn-del-gruppe").addEventListener("click", () => {
      if (confirm(`Gruppe ${id} löschen?`)) {
        delete Store.state.gruppen[id];
        Store.commit();
        aktiveGruppe = null;
        renderEditor();
      }
    });

    const vBtn = document.getElementById("btn-verteile");
    if (vBtn && !vBtn.disabled) vBtn.addEventListener("click", () => {
      const andere = Object.entries(Store.state.gruppen)
        .filter(([gid]) => gid !== id)
        .map(([, g]) => g.buchstaben || {});
      grp.buchstaben = Solution.verteile(grp.loesungswort, stationen, andere);
      Store.commit();
      renderEditor();
    });

    document.getElementById("btn-clear").addEventListener("click", () => {
      grp.buchstaben = {};
      Store.commit();
      renderEditor();
    });

    editorEl.querySelectorAll("[data-letter]").forEach(inp =>
      inp.addEventListener("change", () => {
        if (!grp.buchstaben) grp.buchstaben = {};
        const v = inp.value.trim().toUpperCase();
        if (v) grp.buchstaben[inp.dataset.letter] = v;
        else delete grp.buchstaben[inp.dataset.letter];
        Store.commit();
        renderListe();
      }));
  }

  /* ---------- Wortdatenbank-Wörter flach auflisten ---------- */
  function wortdbWoerter() {
    const db = Store.state.wortdatenbank || {};
    const out = [];
    Object.entries(db).forEach(([kat, woerter]) =>
      (woerter || []).forEach(w => out.push({ kat, wort: w })));
    return out;
  }

  return { init, onShow };
})();

window.Groups = Groups;
