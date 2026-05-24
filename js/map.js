/* =====================================================================
 * map.js  –  OpenStreetMap / Leaflet
 *   Marker setzen & verschieben, Radiuskreis, Route, Distanzen
 * ===================================================================== */

const Karte = (() => {
  let map = null;
  let markers = {};      // id -> L.marker
  let circles = {};      // id -> L.circle
  let routeLine = null;
  let distLabels = [];   // L.marker (Distanz-Beschriftungen)
  let selectedId = null;
  let listeEl, infoEl;

  // Standardansicht (Deutschland), bis Marker existieren
  const START = [51.1657, 10.4515];
  const START_ZOOM = 6;

  function init() {
    listeEl = document.getElementById("karte-liste");
    infoEl = document.getElementById("karte-info");
    document.getElementById("btn-karte-fit")
      .addEventListener("click", fitAlle);
    Store.subscribe(() => { if (map) { refreshLayers(); renderListe(); } });
  }

  // Wird beim Öffnen des Tabs gerufen (Leaflet braucht sichtbaren Container)
  function onShow(tab) {
    if (tab !== "karte") return;
    if (!map) erstelleKarte();
    setTimeout(() => { map.invalidateSize(); fitAlle(); }, 50);
    renderListe();
  }

  function erstelleKarte() {
    map = L.map("karte-map", { zoomControl: true }).setView(START, START_ZOOM);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap-Mitwirkende"
    }).addTo(map);

    map.on("click", e => {
      if (!selectedId) { hinweis("Erst links eine Station wählen."); return; }
      setzePosition(selectedId, e.latlng);
    });

    refreshLayers();
  }

  /* ---------- Stationsliste (links) ---------- */
  function renderListe() {
    const st = Store.state.stationen;
    if (!st.length) {
      listeEl.innerHTML = `<div class="leer-hinweis">Keine Stationen.
        Erst unter „Stationen" anlegen.</div>`;
      return;
    }
    listeEl.innerHTML = st.map(s => `
      <div class="station-item ${s.id === selectedId ? "active" : ""}" data-id="${s.id}">
        <div class="nr">${s.id}</div>
        <div class="info">
          <div class="name">${s.name ? esc(s.name) : "<em>Ohne Namen</em>"}</div>
          <div class="typ">${s.position
            ? s.position.lat.toFixed(4) + ", " + s.position.lng.toFixed(4)
            : "kein Marker"}</div>
        </div>
        <div class="stat"><span class="dot ${s.position ? "ok" : "off"}"></span></div>
      </div>`).join("");
    listeEl.querySelectorAll(".station-item").forEach(el =>
      el.addEventListener("click", () => waehle(el.dataset.id)));
  }

  function waehle(id) {
    selectedId = id;
    renderListe();
    const s = Store.getStation(id);
    if (s && s.position) map.panTo([s.position.lat, s.position.lng]);
    if (markers[id]) markers[id].openTooltip();
  }

  /* ---------- Position setzen / verschieben ---------- */
  function setzePosition(id, latlng) {
    Store.updateStation(id, { position: { lat: latlng.lat, lng: latlng.lng } });
    // refreshLayers() läuft über Store-Subscription
  }

  /* ---------- Kartenebenen neu aufbauen ---------- */
  function refreshLayers() {
    // alte Ebenen entfernen
    Object.values(markers).forEach(m => map.removeLayer(m));
    Object.values(circles).forEach(c => map.removeLayer(c));
    distLabels.forEach(l => map.removeLayer(l));
    if (routeLine) map.removeLayer(routeLine);
    markers = {}; circles = {}; distLabels = []; routeLine = null;

    const mitPos = Store.state.stationen.filter(s => s.position);

    mitPos.forEach(s => {
      const pos = [s.position.lat, s.position.lng];

      // Radiuskreis (immer vom Markerpunkt)
      circles[s.id] = L.circle(pos, {
        radius: s.radius || 0,
        color: "#c8102e", weight: 1.5, fillColor: "#c8102e", fillOpacity: 0.10
      }).addTo(map);

      // nummerierter, verschiebbarer Marker
      const icon = L.divIcon({
        className: "stn-marker",
        html: `<div class="stn-pin"><span>${s.id}</span></div>`,
        iconSize: [34, 34], iconAnchor: [17, 17]
      });
      const m = L.marker(pos, { icon, draggable: true }).addTo(map);
      m.bindTooltip(`${s.id} · ${s.name || "Station"}`, { direction: "top", offset: [0, -14] });
      m.on("dragend", e => setzePosition(s.id, e.target.getLatLng()));
      m.on("click", () => waehle(s.id));
      markers[s.id] = m;
    });

    zeichneRoute(mitPos);
    renderInfo(mitPos);
  }

  /* ---------- Route + Distanzen (nach Stationsreihenfolge) ---------- */
  function zeichneRoute(mitPos) {
    if (mitPos.length < 2) return;
    const punkte = mitPos.map(s => [s.position.lat, s.position.lng]);

    routeLine = L.polyline(punkte, {
      color: "#1c2024", weight: 3, opacity: 0.7, dashArray: "6 6"
    }).addTo(map);

    // Distanz-Label je Teilstück am Mittelpunkt
    for (let i = 0; i < mitPos.length - 1; i++) {
      const a = L.latLng(punkte[i]), b = L.latLng(punkte[i + 1]);
      const meter = a.distanceTo(b);
      const mid = [(punkte[i][0] + punkte[i + 1][0]) / 2,
                   (punkte[i][1] + punkte[i + 1][1]) / 2];
      const label = L.marker(mid, {
        interactive: false,
        icon: L.divIcon({ className: "dist-label", html: formatDist(meter) })
      }).addTo(map);
      distLabels.push(label);
    }
  }

  /* ---------- Info-Box (Gesamtlänge) ---------- */
  function renderInfo(mitPos) {
    if (mitPos.length < 2) {
      infoEl.innerHTML = mitPos.length === 1
        ? "1 Station gesetzt." : "Noch keine Route (min. 2 Marker).";
      return;
    }
    let gesamt = 0;
    for (let i = 0; i < mitPos.length - 1; i++) {
      gesamt += L.latLng(mitPos[i].position.lat, mitPos[i].position.lng)
        .distanceTo(L.latLng(mitPos[i + 1].position.lat, mitPos[i + 1].position.lng));
    }
    infoEl.innerHTML =
      `<strong>${mitPos.length}</strong> Stationen · Gesamtlänge
       <strong>${formatDist(gesamt)}</strong>`;
  }

  /* ---------- Ansicht an alle Marker anpassen ---------- */
  function fitAlle() {
    const mitPos = Store.state.stationen.filter(s => s.position);
    if (!mitPos.length) { map.setView(START, START_ZOOM); return; }
    const bounds = L.latLngBounds(mitPos.map(s => [s.position.lat, s.position.lng]));
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 });
  }

  /* ---------- Helfer ---------- */
  function formatDist(m) {
    return m >= 1000 ? (m / 1000).toFixed(2) + " km" : Math.round(m) + " m";
  }
  function hinweis(text) {
    infoEl.innerHTML = `<span style="color:#b45309">${text}</span>`;
  }

  return { init, onShow };
})();

window.Karte = Karte;
