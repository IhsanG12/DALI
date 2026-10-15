// matching.js — decides whether a search ("looking for Leo, son, 7") probably
// refers to a registered person ("Leo G., about 6").
//
// Names will be misspelled, shortened or transliterated, and ages are guesses,
// so this gives each possible pair a score instead of demanding an exact match.
// A volunteer and the person themselves always confirm before anything happens,
// so it's better to suggest a few too many than to miss a real family.

// "José  García-López" -> "jose garcia lopez"
export function normalize(s = "") {
  return s
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // drop accents
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Edit distance: how many single-letter changes turn a into b.
function levenshtein(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

// 1 = identical, 0 = nothing alike. "Leo" vs "Leonardo" counts as a strong
// match because people often register with a short form of a name.
function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a))) return 0.9;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

// Compare a searched-for name with a registered name.
// Returns null if the first names are too different to be the same person.
export function nameScore(searchedName, cardName) {
  const s = normalize(searchedName).split(" ").filter(Boolean);
  const c = normalize(cardName).split(" ").filter(Boolean);
  if (!s.length || !c.length) return null;

  const first = similarity(s[0], c[0]);
  if (first < 0.75) return null;

  // Last names only add confidence; children can have a different surname
  // from the parent searching for them, so a mismatch doesn't rule it out.
  let last = 0;
  if (s.length > 1 && c.length > 1) last = similarity(s[s.length - 1], c[c.length - 1]);
  return { first, last };
}

function agesCompatible(a, b) {
  if (a == null || b == null) return { ok: true, close: false };
  const diff = Math.abs(a - b);
  const allowed = Math.max(3, Math.round(Math.max(a, b) * 0.25)); // guesses get rougher with age
  return { ok: diff <= allowed, close: diff <= 2 };
}

// Score one search against one registered (non-hidden) person.
//   search:     { name, age }
//   card:       { name, age, neighborhood }
//   searcher:   the card of the person doing the search (may be hidden)
//   foundsSearches: who the registered person is looking for
// Returns { score, reasons } or null.
export function scoreMatch(search, card, searcher, foundsSearches = []) {
  const n = nameScore(search.name, card.name);
  if (!n) return null;
  const age = agesCompatible(search.age, card.age);
  if (!age.ok) return null;

  let score = Math.round(50 * n.first);
  const reasons = [`first name ${n.first === 1 ? "matches" : "is similar"}`];

  if (n.last >= 0.8) { score += 20; reasons.push("last name matches"); }
  if (age.close) { score += 15; reasons.push("age matches"); }

  // Strongest signal: they're looking for each other.
  if (searcher.name && foundsSearches.some((fs) => nameScore(fs.name, searcher.name))) {
    score += 30;
    reasons.push("they are looking for each other");
  }

  if (searcher.neighborhood && card.neighborhood &&
      normalize(searcher.neighborhood) === normalize(card.neighborhood)) {
    score += 10;
    reasons.push("same home neighborhood");
  }

  return { score, reasons };
}

export const MATCH_THRESHOLD = 55;
