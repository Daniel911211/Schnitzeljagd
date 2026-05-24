/* =====================================================================
 * app.js  –  Bootstrap, Tabs, Allgemein-Tab, JSON-Im/Export
 * ===================================================================== */

const App = (() => {

  function init() {
    bindTabs();
    bindAllgemein();
    bindDateiAktionen();

    // Autosave wiederherstellen, sonst leeres Projekt
    Store.ladeAutosave();
    Store.subscribe(renderAllgemein);
    renderAllgemein(Store.state);

    Stations.init();
    if (window.Karte) Karte.init();
    if (window.Groups) Groups.init();
    if (window.WordDB) WordDB.init();
    if (window.ExportTool) ExportTool.init();
    if (window.PrintTool) PrintTool.init();
    aktiviereTab("allgemein");
  }

  /* ---------- Tabs ---------- */
  function bindTabs() {
    document.querySelectorAll("nav.tabs button").forEach(btn =>
      btn.addEventListener("click", () => aktiviereTab(btn.dataset.tab)));
  }
  function aktiviereTab(name) {
    document.querySelectorAll("nav.tabs button").forEach(b =>
      b.classList.toggle("active", b.dataset.tab === name));
    document.querySelectorAll(".tab-panel").forEach(p =>
      p.classList.toggle("active", p.id === "tab-" + name));
    if (window.Karte) Karte.onShow(name);
    if (window.Groups) Groups.onShow(name);
    if (window.WordDB) WordDB.onShow(name);
    if (window.ExportTool) ExportTool.onShow(name);
  }

  /* ---------- Allgemein-Tab ---------- */
  function bindAllgemein() {
    ["titel", "beschreibung", "standardRadius", "githubBasislink", "schatzbild", "schatztext"].forEach(key => {
      const el = document.getElementById("p-" + key);
      el.addEventListener("change", () => {
        const v = key === "standardRadius" ? (parseInt(el.value, 10) || 0) : el.value.trim();
        Store.state.projekt[key] = v;
        Store.commit();
      });
    });
  }
  function renderAllgemein(state) {
    const p = state.projekt;
    setVal("p-titel", p.titel);
    setVal("p-beschreibung", p.beschreibung);
    setVal("p-standardRadius", p.standardRadius);
    setVal("p-githubBasislink", p.githubBasislink);
    setVal("p-schatzbild", p.schatzbild);
    setVal("p-schatztext", p.schatztext);
    // Titel in der Kopfzeile spiegeln
    document.getElementById("titel-anzeige").textContent =
      p.titel ? "· " + p.titel : "· Neues Projekt";
  }

  /* ---------- Datei: JSON Import / Export / Reset ---------- */
  function bindDateiAktionen() {
    document.getElementById("btn-export-json").addEventListener("click", exportieren);
    document.getElementById("btn-import-json").addEventListener("click", () =>
      document.getElementById("file-import").click());
    document.getElementById("file-import").addEventListener("change", importieren);
    document.getElementById("btn-neu").addEventListener("click", () => {
      if (confirm("Neues, leeres Projekt anlegen? Nicht exportierte Daten gehen verloren."))
        Store.reset();
    });
  }

  function exportieren() {
    const blob = new Blob([Store.exportJSON()], { type: "application/json" });
    const name = (Store.state.projekt.titel || "schnitzeljagd")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "projekt";
    download(blob, name + ".json");
  }

  function importieren(e) {
    const file = e.target.files[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try { Store.importJSON(r.result); alert("Projekt geladen."); }
      catch (err) { alert("Konnte JSON nicht lesen: " + err.message); }
    };
    r.readAsText(file);
    e.target.value = "";
  }

  return { init };
})();

/* ---------- gemeinsame Helfer ---------- */
function setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v ?? ""; }
function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

document.addEventListener("DOMContentLoaded", App.init);
window.App = App;
