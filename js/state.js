/* =====================================================================
 * state.js  –  Zentrales Datenmodell, Persistenz, Typ-Definitionen
 * ===================================================================== */

const SCHEMA_VERSION = "1.0";
const STORAGE_KEY = "schnitzeljagd_autosave_v1";

/* ---------------------------------------------------------------------
 * Stationsarten + dynamische Typ-Felder
 * ------------------------------------------------------------------- */

// Bausteine, die der Typ "kombi" aktivieren kann
const KOMBI_BAUSTEINE = [
  "aufgabe", "raetsel", "feuerwehrwissen",
  "fotoauftrag", "geschicklichkeit", "codewort", "hinweis"
];

// Definition der Typ-spezifischen Felder.
// Grundfelder (name, typ, bilder, position, radius, githubLink, externerLink,
// externerBildlink, hinweisNaechste) liegen direkt auf der Station.
// Alles hier Definierte landet in station.typFelder.
const STATION_TYPES = {
  standard: {
    label: "Standard",
    felder: [
      { key: "aufgabe", type: "textarea", label: "Aufgabe" },
      { key: "loesung", type: "text", label: "Lösung" },
      { key: "toleranzGrossKlein", type: "checkbox", label: "Groß/Klein ignorieren", default: true }
    ]
  },
  raetsel: {
    label: "Rätsel",
    felder: [
      { key: "raetseltext", type: "textarea", label: "Rätseltext" },
      { key: "loesung", type: "text", label: "Lösung" },
      { key: "toleranzGrossKlein", type: "checkbox", label: "Groß/Klein ignorieren", default: true }
    ]
  },
  feuerwehrwissen: {
    label: "Feuerwehrwissen",
    felder: [
      { key: "frage", type: "textarea", label: "Frage" },
      { key: "antwortTyp", type: "select", label: "Antworttyp",
        options: [
          { value: "text", label: "Freitext" },
          { value: "multipleChoice", label: "Multiple Choice" }
        ], default: "text" },
      { key: "antwortText", type: "text", label: "Erwartete Antwort (Freitext)",
        showIf: { field: "antwortTyp", value: "text" } },
      { key: "antwortoptionen", type: "list", label: "Antwortoptionen",
        showIf: { field: "antwortTyp", value: "multipleChoice" } },
      { key: "richtigeAntwort", type: "text", label: "Richtige Option",
        showIf: { field: "antwortTyp", value: "multipleChoice" } },
      { key: "bonusfrage", type: "textarea", label: "Bonusfrage (optional)" }
    ]
  },
  fotoauftrag: {
    label: "Fotoauftrag",
    felder: [
      { key: "auftragstext", type: "textarea", label: "Auftragstext" },
      { key: "bildHinweis", type: "text", label: "Bildhinweis (optional)" },
      { key: "abschlussModus", type: "select", label: "Abschluss",
        options: [
          { value: "button", label: "Abschluss-Button" },
          { value: "bestaetigungswort", label: "Bestätigungswort" }
        ], default: "button" },
      { key: "bestaetigungswort", type: "text", label: "Bestätigungswort",
        showIf: { field: "abschlussModus", value: "bestaetigungswort" } }
    ]
  },
  geschicklichkeit: {
    label: "Geschicklichkeit",
    felder: [
      { key: "beschreibung", type: "textarea", label: "Beschreibung" },
      { key: "abschlussModus", type: "select", label: "Abschluss",
        options: [
          { value: "button", label: "Abschluss-Button" },
          { value: "bestaetigungswort", label: "Bestätigungswort" }
        ], default: "button" },
      { key: "bestaetigungswort", type: "text", label: "Bestätigungswort",
        showIf: { field: "abschlussModus", value: "bestaetigungswort" } },
      { key: "optionaleZeitangabe", type: "text", label: "Zeitangabe (optional)" }
    ]
  },
  orientierung: {
    label: "Orientierung",
    felder: [
      { key: "orientierungshinweis", type: "textarea", label: "Orientierungshinweis" },
      { key: "peilungshinweis", type: "text", label: "Peilungshinweis (optional)" },
      { key: "zielkoordinaten", type: "text", label: "Zielkoordinaten (optional)" },
      { key: "loesung", type: "text", label: "Lösung (optional)" }
    ]
  },
  codewort: {
    label: "Codewort",
    felder: [
      { key: "codewort", type: "text", label: "Codewort" },
      { key: "toleranzGrossKlein", type: "checkbox", label: "Groß/Klein ignorieren", default: true }
    ]
  },
  zielstation: {
    label: "Zielstation",
    felder: [
      { key: "abschlusstext", type: "textarea", label: "Abschlusstext" }
      // Lösungswort-Prüfung + Buchstabenanzeige übernimmt station.html fest.
    ]
  },
  kombi: {
    label: "Kombi",
    felder: [
      { key: "bausteine", type: "multibausteine", label: "Aktive Bausteine",
        bausteine: KOMBI_BAUSTEINE }
      // Je aktivem Baustein werden dessen Felder unter typFelder.<baustein> abgelegt.
    ]
  }
};

/* ---------------------------------------------------------------------
 * Default-Projekt
 * ------------------------------------------------------------------- */

function leeresProjekt() {
  return {
    version: SCHEMA_VERSION,
    projekt: {
      titel: "",
      beschreibung: "",
      standardRadius: 30,
      githubBasislink: "",
      schatzbild: "",
      schatztext: ""
    },
    stationen: [],
    gruppen: {},
    wortdatenbank: {}
  };
}

function neueStation(state) {
  const id = naechsteStationId(state);
  return {
    id,
    name: "",
    typ: "standard",
    aufgabe: "",
    bilder: [],
    externerBildlink: "",
    position: null,            // { lat, lng } – wird über Karte gesetzt
    radius: state.projekt.standardRadius || 30,
    hinweisNaechste: "",
    githubLink: `station.html?station=${id}`,
    externerLink: "",
    typFelder: {}
  };
}

function naechsteStationId(state) {
  const ids = state.stationen.map(s => parseInt(s.id, 10)).filter(n => !isNaN(n));
  const next = (ids.length ? Math.max(...ids) : 0) + 1;
  return String(next).padStart(2, "0");
}

/* ---------------------------------------------------------------------
 * Store  –  einfacher Zustand mit Änderungs-Listenern
 * ------------------------------------------------------------------- */

const Store = {
  state: leeresProjekt(),
  _listeners: [],

  subscribe(fn) { this._listeners.push(fn); },
  _emit() { this._listeners.forEach(fn => fn(this.state)); },

  // Nach jeder Änderung aufrufen: speichert + benachrichtigt UI
  commit() {
    this.autosave();
    this._emit();
  },

  set(newState) {
    this.state = newState;
    this.commit();
  },

  /* --- Stationen --- */
  getStation(id) { return this.state.stationen.find(s => s.id === id); },

  addStation() {
    const s = neueStation(this.state);
    this.state.stationen.push(s);
    this.commit();
    return s;
  },

  updateStation(id, patch) {
    const s = this.getStation(id);
    if (!s) return;
    Object.assign(s, patch);
    this.commit();
  },

  removeStation(id) {
    this.state.stationen = this.state.stationen.filter(s => s.id !== id);
    // zugehörige Buchstaben aus allen Gruppen entfernen
    Object.values(this.state.gruppen).forEach(g => {
      if (g.buchstaben) delete g.buchstaben[id];
    });
    this.commit();
  },

  /* --- Persistenz --- */
  autosave() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn("Autosave fehlgeschlagen:", e);
    }
  },

  ladeAutosave() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      this.state = migriere(data);
      this._emit();
      return true;
    } catch (e) {
      console.warn("Autosave-Laden fehlgeschlagen:", e);
      return false;
    }
  },

  // JSON-Datei einlesen (Hauptspeicherung)
  importJSON(text) {
    const data = JSON.parse(text);
    this.state = migriere(data);
    this.commit();
  },

  // JSON-String zum Download erzeugen
  exportJSON() {
    return JSON.stringify(this.state, null, 2);
  },

  reset() {
    this.state = leeresProjekt();
    this.commit();
  }
};

/* ---------------------------------------------------------------------
 * Migration / Validierung des Schemas beim Laden
 * ------------------------------------------------------------------- */

function migriere(data) {
  const base = leeresProjekt();
  if (!data || typeof data !== "object") return base;

  base.version = data.version || SCHEMA_VERSION;
  base.projekt = Object.assign(base.projekt, data.projekt || {});
  base.stationen = Array.isArray(data.stationen) ? data.stationen : [];
  base.gruppen = data.gruppen || {};
  base.wortdatenbank = data.wortdatenbank || {};

  // fehlende Felder pro Station auffüllen
  base.stationen = base.stationen.map(s => Object.assign({
    id: s.id,
    name: "",
    typ: "standard",
    aufgabe: "",
    bilder: [],
    externerBildlink: "",
    position: null,
    radius: base.projekt.standardRadius || 30,
    hinweisNaechste: "",
    githubLink: `station.html?station=${s.id}`,
    externerLink: "",
    typFelder: {}
  }, s));

  return base;
}

/* Exporte für andere Module (klassische globale Einbindung) */
window.Store = Store;
window.STATION_TYPES = STATION_TYPES;
window.KOMBI_BAUSTEINE = KOMBI_BAUSTEINE;
window.SchnitzelState = { leeresProjekt, neueStation, naechsteStationId, migriere, SCHEMA_VERSION };
