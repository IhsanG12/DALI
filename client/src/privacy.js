// privacy.js — how a shelter device keeps names away from Tether's own server.
//
// Every shelter in the region shares a secret "network phrase", printed on the
// shelter's card and inside its QR code. It never leaves shelter devices.
// From it, each device derives two keys:
//
//   lock key        scrambles (encrypts) protected details so only another
//                   shelter device can unscramble them. The server just stores
//                   unreadable text.
//   fingerprint key turns a name into short "fingerprints". The same name always
//                   gives the same fingerprint, so the server can tell two
//                   records match without ever learning the name.
//
// Uses the browser's built-in Web Crypto (PBKDF2, HMAC-SHA-256, AES-GCM).

const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export const normalizePhrase = (p) => String(p || "").toLowerCase().replace(/[^a-z]+/g, " ").trim();

// Phrase -> keys. Deliberately slow (200,000 rounds) so guessing phrases is expensive.
export async function deriveNetworkKeys(phrase) {
  const base = await crypto.subtle.importKey("raw", enc.encode(normalizePhrase(phrase)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode("tether-network-v1"), iterations: 200_000, hash: "SHA-256" },
    base,
    512
  );
  const raw = new Uint8Array(bits);
  return { lock: b64(raw.slice(0, 32)), fingerprint: b64(raw.slice(32)) };
}

// A short check value for a phrase, so a mistyped phrase is caught at setup.
export async function phraseCheck(keys) {
  return (await hmac(keys.fingerprint, "check")).slice(0, 10);
}
// Check value of the demo region's phrase (see README).
export const DEMO_PHRASE_CHECK = "YX0-RFK18T";

async function hmac(keyB64, message) {
  const key = await crypto.subtle.importKey("raw", unb64(keyB64), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

// "José García-López" -> "jose garcia lopez"
export function normalizeName(s = "") {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
}

// Soundex: a classic way to code how a name sounds, so "Mohammed" and
// "Muhammad" get the same code (M530).
function soundex(word) {
  const codes = { b: 1, f: 1, p: 1, v: 1, c: 2, g: 2, j: 2, k: 2, q: 2, s: 2, x: 2, z: 2, d: 3, t: 3, l: 4, m: 5, n: 5, r: 6 };
  let out = word[0].toUpperCase();
  let prev = codes[word[0]];
  for (const ch of word.slice(1)) {
    const c = codes[ch];
    if (c && c !== prev) out += c;
    if (ch !== "h" && ch !== "w") prev = c;
    if (out.length === 4) break;
  }
  return out.padEnd(4, "0");
}

// Name -> fingerprints, each tagged with what it describes:
//   f. exact first name   p. how it sounds   3. first three letters
//   l. exact last name    q. how it sounds
export async function nameFingerprints(keys, name) {
  const words = normalizeName(name).split(" ").filter(Boolean);
  if (!words.length) return [];
  const first = words[0];
  const last = words.length > 1 ? words[words.length - 1] : null;
  const parts = [["f", first], ["p", soundex(first)]];
  if (first.length >= 3) parts.push(["3", first.slice(0, 3)]);
  if (last) parts.push(["l", last], ["q", soundex(last)]);
  return Promise.all(parts.map(async ([kind, value]) => `${kind}.${(await hmac(keys.fingerprint, `${kind}:${value}`)).slice(0, 22)}`));
}

export async function placeFingerprints(keys, place) {
  const p = normalizeName(place);
  return p ? [`n.${(await hmac(keys.fingerprint, `n:${p}`)).slice(0, 22)}`] : [];
}

// Scramble a small object so only devices with the network phrase can read it.
export async function lock(keys, obj) {
  const key = await crypto.subtle.importKey("raw", unb64(keys.lock), "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(obj)));
  return `${b64(iv)}.${b64(ct)}`;
}

export async function unlock(keys, text) {
  try {
    const [iv, ct] = text.split(".");
    const key = await crypto.subtle.importKey("raw", unb64(keys.lock), "AES-GCM", false, ["decrypt"]);
    return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, key, unb64(ct))));
  } catch {
    return null;
  }
}
