/* =====================================================================
 * schatz-view.js  –  Schatzfreigabe
 *   Alle Gruppen geben ihr jeweiliges Lösungswort ein.
 *   Sind ALLE korrekt (Hash-Vergleich), wird der Schatz freigegeben:
 *   Schatztext + Schatzbild werden angezeigt.
 *   Lösungswörter liegen nur als Hash vor (kein Klartext).
 * ===================================================================== */

(function () {
  const app = document.getElementById("app");

  fetch("daten/data.json")
    .then(r => r.json())
    .then(start)
    .catch(() => fehler("Daten nicht ladbar", "daten/data.json konnte nicht geladen werden."));

  let PROJEKT = {}, GRUPPEN = {};

  function start(data) {
    PROJEKT = data.projekt || {};
    GRUPPEN = data.gruppen || {};
    const ids = Object.keys(GRUPPEN);
    if (!ids.length) return fehler("Keine Gruppen", "In den Daten sind keine Gruppen vorhanden.");

    document.title = "Schatz freigeben";
    app.innerHTML = `
      <div class="kopf"><div class="badge">Schatz</div></div>
      <h1>${esc(PROJEKT.titel || "Schatzfreigabe")}</h1>
      <div class="aufgabe">Jede Gruppe gibt ihr Lösungswort ein. Sind alle korrekt,
        wird der Schatz freigegeben.</div>
      <div class="schatz-felder">
        ${ids.map(id => `
          <div class="schatz-zeile">
            <label class="schatz-label">Gruppe ${id}</label>
            <input class="gross-input schatz-input" data-gruppe="${id}"
              placeholder="Lösungswort" autocomplete="off">
            <div class="schatz-status" data-status="${id}"></div>
          </div>`).join("")}
      </div>
      <button class="gross-btn" id="btn-schatz">Schatz freigeben</button>
      <div class="fehlmeldung" id="fehl"></div>
      <div id="ergebnis"></div>`;

    document.getElementById("btn-schatz").addEventListener("click", pruefeAlle);
  }

  async function pruefeAlle() {
    const fehl = document.getElementById("fehl");
    fehl.textContent = "";
    const eingaben = [...document.querySelectorAll(".schatz-input")];
    let alleOk = true;

    for (const inp of eingaben) {
      const id = inp.dataset.gruppe;
      const statusEl = document.querySelector(`[data-status="${id}"]`);
      const norm = Crypto.normalize(inp.value, true);
      const ziel = (GRUPPEN[id] || {}).loesungswortHash;
      const ok = norm && (await Crypto.sha256hex(norm)) === ziel;
      statusEl.textContent = ok ? "✓" : "✗";
      statusEl.className = "schatz-status " + (ok ? "ok" : "fehler");
      if (!ok) alleOk = false;
    }

    if (alleOk) freigeben();
    else { fehl.textContent = "Noch nicht alle Lösungswörter sind korrekt."; }
  }

  function freigeben() {
    document.querySelector(".schatz-felder").style.display = "none";
    document.getElementById("btn-schatz").style.display = "none";
    document.getElementById("fehl").textContent = "";

    const bild = PROJEKT.schatzbild
      ? `<img src="${esc(PROJEKT.schatzbild)}" alt="Schatz" class="schatz-bild"
           onerror="this.style.display='none'">` : "";
    document.getElementById("ergebnis").innerHTML = `
      <div class="erfolg ziel">
        <div class="erfolg-titel">🎉 Schatz freigegeben!</div>
      </div>
      ${PROJEKT.schatztext ? `<div class="hinweis-box">${nl2br(esc(PROJEKT.schatztext))}</div>` : ""}
      ${bild}`;
    document.getElementById("ergebnis").scrollIntoView({ behavior: "smooth" });
  }

  function fehler(titel, text) {
    app.innerHTML = `<div class="fehlerseite"><h1>${esc(titel)}</h1><p>${esc(text)}</p></div>`;
  }
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function nl2br(s) { return s.replace(/\n/g, "<br>"); }
})();
