/* =====================================================================
 * crypto.js  –  Gemeinsame Krypto-Helfer (Editor-Export + station.html)
 *   Lösungen werden NICHT im Klartext exportiert:
 *     - Antwortprüfung über SHA-256-Hash
 *     - Buchstabe per XOR mit Schlüssel aus der (normalisierten) Antwort
 *   Läuft serverlos im Browser (Web Crypto, https / GitHub Pages).
 * ===================================================================== */

const Crypto = (() => {

  // fester Salt für Stationen ohne prüfbare Antwort (nur leichte Verschleierung)
  const BUTTON_SALT = "SCHNITZEL_BUTTON_2026";

  // Antwort normalisieren: Leerzeichen außen weg; optional Groß/Klein ignorieren
  function normalize(value, tolerant = true) {
    let v = String(value ?? "").trim();
    if (tolerant) v = v.toUpperCase();
    return v;
  }

  async function sha256bytes(str) {
    const data = new TextEncoder().encode(str);
    const buf = await crypto.subtle.digest("SHA-256", data);
    return new Uint8Array(buf);
  }

  async function sha256hex(str) {
    const bytes = await sha256bytes(str);
    return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
  }

  // Buchstabe mit Schlüssel aus Antwort verschleiern -> hex
  async function encryptLetter(letter, schluesselText) {
    const key = await sha256bytes(schluesselText);
    const lb = new TextEncoder().encode(String(letter));
    const out = new Uint8Array(lb.length);
    for (let i = 0; i < lb.length; i++) out[i] = lb[i] ^ key[i % key.length];
    return [...out].map(b => b.toString(16).padStart(2, "0")).join("");
  }

  async function decryptLetter(hex, schluesselText) {
    const key = await sha256bytes(schluesselText);
    const bytes = hexToBytes(hex);
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ key[i % key.length];
    return new TextDecoder().decode(out);
  }

  function hexToBytes(hex) {
    const a = new Uint8Array(hex.length / 2);
    for (let i = 0; i < a.length; i++) a[i] = parseInt(hex.substr(i * 2, 2), 16);
    return a;
  }

  return {
    normalize, sha256hex, encryptLetter, decryptLetter,
    BUTTON_SALT
  };
})();

if (typeof window !== "undefined") window.Crypto = Crypto;
