/* =====================================================================
 * station-view.js  –  Teilnehmerseite (mobil)
 *   URL: station.html?station=01&gruppe=G1
 *   Ablauf:
 *     1. Standort abfragen (GPS)
 *     2. Entfernung zum Stationspunkt prüfen (Radius)
 *     3. Aufgabe NUR anzeigen, wenn Entfernung <= Radius
 *     4. Lösung prüfen (Hash) -> Buchstabe (entschlüsselt) + Hinweis
 *   Buchstabe/Lösung kommen aus daten/data.json, nicht aus der URL.
 * ===================================================================== */

(function () {
  const app = document.getElementById("app");
  const params = new URLSearchParams(location.search);
  const stationId = params.get("station");
  const gruppeId = params.get("gruppe");

  if (!stationId || !gruppeId) {
    fehler("Ungültiger Link", "station und gruppe fehlen in der Adresse.");
    return;
  }

  let STATION = null, GRUPPE = null, DATA_PROJEKT = {};

  fetch("daten/data.json")
    .then(r => r.json())
    .then(data => start(data))
    .catch(() => fehler("Daten nicht ladbar", "daten/data.json konnte nicht geladen werden."));

  function start(data) {
    DATA_PROJEKT = data.projekt || {};
    STATION = (data.stationen || []).find(s => s.id === stationId);
    GRUPPE = (data.gruppen || {})[gruppeId];
    if (!STATION) return fehler("Station unbekannt", "Station " + stationId + " nicht gefunden.");
    if (!GRUPPE) return fehler("Gruppe unbekannt", "Gruppe " + gruppeId + " nicht gefunden.");

    document.title = `Station ${STATION.id} · ${gruppeId}`;
    app.innerHTML = `
      <div class="kopf">
        <div class="badge">Station ${STATION.id}</div>
        <div class="gruppe">Gruppe ${gruppeId}</div>
      </div>
      <h1>${esc(STATION.name || "Station " + STATION.id)}</h1>
      <div id="gate"></div>`;
    standortGate();
  }

  /* ================= GPS-/Radiusgate ================= */
  function standortGate() {
    if (!STATION.position || DATA_PROJEKT.gpsAktiv === false) return zeigeAufgabe();

    document.getElementById("gate").innerHTML =
      `<div class="gps-box gps-pruefen">
        <div class="gps-spinner"></div>
        <div class="gps-titel">Standort wird ermittelt…</div>
        <div class="gps-zeile">Bitte warte einen Moment.</div>
      </div>`;

    if (!navigator.geolocation)
      return gpsFehler("Dein Gerät unterstützt keine Standortbestimmung. Bitte ein anderes Gerät verwenden.");

    navigator.geolocation.getCurrentPosition(
      pos => {
        const dist = distanzMeter(
          { lat: pos.coords.latitude, lng: pos.coords.longitude }, STATION.position);
        const radius = STATION.radius || 0;
        if (dist <= radius) zeigeAufgabe(dist);
        else gateAusserhalb(dist, radius);
      },
      err => gpsFehler(err.code === 1
        ? "Standortzugriff wurde abgelehnt.\nBitte erlaube den Standortzugriff im Browser und versuche es erneut."
        : "Standort konnte nicht ermittelt werden.\nGehe nach draußen oder warte kurz und versuche es erneut."),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  function gateAusserhalb(dist, radius) {
    document.getElementById("gate").innerHTML = `
      <div class="gps-box gps-ausserhalb">
        <div class="gps-titel">Du bist noch nicht nah genug.</div>
        <div class="gps-zeile">Entfernung zum Stationspunkt: <strong>${fmt(dist)}</strong></div>
        <div class="gps-zeile">Erlaubter Bereich: <strong>${radius} m</strong></div>
        <div class="gps-tipp">Gehe näher an die Station heran und prüfe deinen Standort erneut.</div>
      </div>
      <button class="gross-btn" id="btn-retry">Standort erneut prüfen</button>`;
    document.getElementById("btn-retry").addEventListener("click", standortGate);
  }

  function gpsFehler(text) {
    document.getElementById("gate").innerHTML = `
      <div class="gps-box gps-fehler">
        <div class="gps-titel">Standort nicht verfügbar</div>
        ${text.split("\n").map(z => `<div class="gps-zeile">${esc(z)}</div>`).join("")}
      </div>
      <button class="gross-btn" id="btn-retry">Erneut versuchen</button>`;
    document.getElementById("btn-retry").addEventListener("click", standortGate);
  }

  /* ================= Aufgabe anzeigen ================= */
  function zeigeAufgabe(dist) {
    const st = STATION;
    document.getElementById("gate").innerHTML = `
      ${st.position ? `<div class="gps-box erreicht">&#10003; Station erreicht${
        dist != null ? " (" + fmt(dist) + ")" : ""}</div>` : ""}
      ${bilderHtml(st)}
      <div class="aufgabe">${nl2br(esc(st.anzeigeText || ""))}</div>
      ${zusatzHtml(st)}
      <div id="interaktion"></div>
      <div id="ergebnis"></div>`;
    renderInteraktion(st, GRUPPE);
  }

  function renderInteraktion(st, grp) {
    const box = document.getElementById("interaktion");

    if (st.modus === "button") {
      box.innerHTML = `<button class="gross-btn" id="btn-fertig">Aufgabe erledigt</button>`;
      document.getElementById("btn-fertig").addEventListener("click", () =>
        freigabe(st, grp, Crypto.BUTTON_SALT));
      return;
    }

    if (st.modus === "mc") {
      box.innerHTML = `<div class="optionen">` +
        (st.optionen || []).map(o => `<button class="opt-btn" data-opt="${esc(o)}">${esc(o)}</button>`).join("") +
        `</div><div class="fehlmeldung" id="fehl"></div>`;
      box.querySelectorAll(".opt-btn").forEach(b =>
        b.addEventListener("click", () => pruefe(st, grp, b.dataset.opt)));
      return;
    }

    box.innerHTML = `
      <input class="gross-input" id="loesung-eingabe" placeholder="Antwort eingeben" autocomplete="off">
      <button class="gross-btn" id="btn-pruef">Prüfen</button>
      <div class="fehlmeldung" id="fehl"></div>`;
    const inp = document.getElementById("loesung-eingabe");
    const go = () => pruefe(st, grp, inp.value);
    document.getElementById("btn-pruef").addEventListener("click", go);
    inp.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
  }

  /* ================= Prüfung + Freigabe ================= */
  async function pruefe(st, grp, eingabe) {
    const fehl = document.getElementById("fehl");
    const tolerant = st.tolerant !== false;
    const norm = Crypto.normalize(eingabe, tolerant);
    if (!norm) { if (fehl) fehl.textContent = "Bitte etwas eingeben."; return; }

    const hash = await Crypto.sha256hex(norm);
    if (hash === st.loesungHash) freigabe(st, grp, norm);
    else if (fehl) {
      fehl.textContent = "Leider falsch – versuch es nochmal.";
      fehl.classList.remove("blink"); void fehl.offsetWidth; fehl.classList.add("blink");
    }
  }

  async function freigabe(st, grp, keyText) {
    const enc = (grp.buchstaben || {})[st.id] || "";
    let buchstabe = "";
    try { buchstabe = await Crypto.decryptLetter(enc, keyText); } catch (e) {}

    document.getElementById("interaktion").innerHTML = "";
    const erg = document.getElementById("ergebnis");
    erg.innerHTML = `
      <div class="erfolg">
        <div class="erfolg-titel">&#10003; Richtig!</div>
        <div class="buchstabe-label">Euer Buchstabe:</div>
        <div class="buchstabe">${esc(buchstabe || "—")}</div>
      </div>
      ${st.hinweisNaechste ? `<div class="hinweis-box">
        <strong>Weiter zur nächsten Station:</strong><br>${nl2br(esc(st.hinweisNaechste))}</div>` : ""}`;
    erg.scrollIntoView({ behavior: "smooth" });
  }

  /* ================= Helfer ================= */
  function distanzMeter(a, b) {
    const R = 6371000, toR = x => x * Math.PI / 180;
    const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 +
      Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  function fmt(m) { return m >= 1000 ? (m / 1000).toFixed(2) + " km" : Math.round(m) + " m"; }

  function bilderHtml(st) {
    const quellen = [];
    if (st.externerBildlink) quellen.push(st.externerBildlink);
    (st.bilder || []).forEach(b => quellen.push(b));
    if (!quellen.length) return "";
    return `<div class="bilder">` + quellen.map(src =>
      `<img src="${esc(src)}" alt="" loading="lazy" onerror="this.style.display='none'">`).join("") + `</div>`;
  }
  function zusatzHtml(st) {
    const z = st.zusatz || {}, teile = [];
    if (z.bildHinweis) teile.push("📷 " + esc(z.bildHinweis));
    if (z.zeit) teile.push("⏱ " + esc(z.zeit));
    if (z.peilung) teile.push("🧭 " + esc(z.peilung));
    if (z.zielkoordinaten) teile.push("📍 " + esc(z.zielkoordinaten));
    if (z.bonusfrage) teile.push("★ Bonus: " + esc(z.bonusfrage));
    if (!teile.length) return "";
    return `<div class="zusatz">${teile.map(t => `<div>${t}</div>`).join("")}</div>`;
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
