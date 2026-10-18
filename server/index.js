// index.js — the backend server.
//
// It listens for HTTP requests from the frontend, a bit like a C program
// sitting in a loop waiting for input. Each `app.get` / `app.post` line says:
// "when a request arrives at this address, run this function."

import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import { pool, setupDatabase } from "./db.js";
import { scoreMatch, MATCH_THRESHOLD } from "./matching.js";
import { PRELOADED_SHELTERS } from "./shelters.js";

const app = express();
app.use(cors());                          // allow our frontend (a different website) to call us
app.use(express.json({ limit: "1mb" }));  // turn incoming JSON text into JavaScript objects

// ---------- small helpers ----------
const text = (v, max = 120) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const age = (v) => {
  if (v === null || v === undefined || v === "") return null; // unknown, not 0
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 120 ? n : null;
};
// Fingerprints are short keyed hashes made on the device (base64url text).
const fingerprints = (v) =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string" && /^[a-z3]\.[A-Za-z0-9_-]{8,64}$/.test(x)).slice(0, 12) : null;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// We never store secrets (join codes, device tokens) directly, only a hash,
// the same way websites store passwords.
const hash = (s) => crypto.createHash("sha256").update(s).digest("hex");
const normalizeCode = (s) => String(s || "").trim().toUpperCase().replace(/\s+/g, "");

// Random ids/codes without look-alike characters (no 0/O, 1/I).
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const randomCode = (len) => Array.from(crypto.randomBytes(len), (b) => ALPHABET[b % ALPHABET.length]).join("");
const newShelterId = () => `S-${randomCode(4)}`;

app.get("/api/health", (req, res) => res.json({ ok: true }));

// ---------- creating shelters (coordinators only) ----------
//
// Shelters can only be created by a coordinator who knows ADMIN_KEY (a secret
// set on the server). Each shelter gets a join code, shown once. Volunteers
// need that code to set up a device, so nobody can invent a fake shelter.
async function createShelter(name, joinCode = `${randomCode(4)}-${randomCode(4)}`) {
  const id = newShelterId();
  await pool.query("INSERT INTO shelters (id, name, join_code_hash) VALUES ($1, $2, $3)", [
    id, name, hash(normalizeCode(joinCode)),
  ]);
  return { id, name, joinCode };
}

app.post("/api/admin/shelters", async (req, res) => {
  const key = req.get("x-admin-key");
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) return res.status(403).json({ error: "Not allowed" });
  const name = text(req.body.name, 80);
  if (!name) return res.status(400).json({ error: "name is required" });
  res.status(201).json(await createShelter(name));
});

// ---------- setting up a device (needs internet once) ----------
//
// Body: { joinCode, volunteerName }
// Returns a secret device token. The device sends it with every request,
// and the server knows which shelter the device belongs to from it.
app.post("/api/enroll", async (req, res) => {
  const code = normalizeCode(req.body.joinCode);
  const { rows } = await pool.query("SELECT id, name FROM shelters WHERE join_code_hash = $1", [hash(code)]);
  if (!code || rows.length === 0) {
    return res.status(401).json({ error: "That join code isn't valid. Ask your shelter coordinator for the code." });
  }
  const token = crypto.randomBytes(32).toString("base64url");
  await pool.query("INSERT INTO devices (shelter_id, volunteer_name, token_hash) VALUES ($1, $2, $3)", [
    rows[0].id, text(req.body.volunteerName, 60), hash(token),
  ]);
  res.status(201).json({ token, shelter: rows[0] });
});

// Every request below must come from an enrolled, non-revoked device.
async function requireDevice(req, res, next) {
  const token = (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Device not set up" });
  const { rows } = await pool.query(
    `SELECT d.id, d.shelter_id, s.name AS shelter_name FROM devices d
       JOIN shelters s ON s.id = d.shelter_id
      WHERE d.token_hash = $1 AND NOT d.revoked`,
    [hash(token)]
  );
  if (rows.length === 0) return res.status(401).json({ error: "Device not recognized" });
  req.device = rows[0];
  next();
}

// ---------- receive match cards from a shelter ----------
//
// Body: { cards: [ { id, hidden, createdAt, person, lookingFor } ] }
//
// The shelter comes from the device's token, never from the request body, so
// a device can't send cards on behalf of another shelter.
//
// Connections drop all the time, so the same card may arrive twice. Each card
// has an id made on the device, and "ON CONFLICT DO NOTHING" makes resending harmless.
app.post("/api/cards", requireDevice, async (req, res) => {
  const cards = Array.isArray(req.body.cards) ? req.body.cards.slice(0, 200) : [];
  const accepted = [];
  const fresh = [];
  const client = await pool.connect();
  try {
    for (const card of cards) {
      if (!UUID.test(card.id || "")) continue;
      const hidden = card.hidden === true;
      const isProtected = !hidden && card.protected === true;
      // A hidden person's identity is never stored, even if the device sent it.
      // A protected person's readable details are never stored either: only
      // fingerprints and the encrypted copy the server can't open.
      const person = hidden ? {} : card.person || {};
      const readable = isProtected ? {} : person;

      await client.query("BEGIN");
      const inserted = await client.query(
        `INSERT INTO cards (id, shelter_id, hidden, protected, name, age, neighborhood, with_whom,
                            enc, name_fp, hood_fp, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO NOTHING`,
        [
          card.id, req.device.shelter_id, hidden, isProtected,
          text(readable.name), hidden ? null : age(person.age), text(readable.neighborhood), text(readable.withWhom, 300),
          isProtected ? text(person.enc, 4000) : null,
          hidden ? null : fingerprints(person.nameFp),
          hidden ? null : fingerprints(person.hoodFp),
          new Date(card.createdAt || Date.now()),
        ]
      );
      if (inserted.rowCount === 1) {
        for (const s of (card.lookingFor || []).slice(0, 10)) {
          const name = card.protected === true ? null : text(s.name);
          const fp = fingerprints(s.nameFp);
          if (!name && !fp) continue;
          await client.query(
            "INSERT INTO searches (card_id, name, relationship, age, enc, name_fp) VALUES ($1, $2, $3, $4, $5, $6)",
            [card.id, name, text(s.relationship, 40), age(s.age), card.protected === true ? text(s.enc, 1000) : null, fp]
          );
        }
        fresh.push(card.id);
      }
      await client.query("COMMIT");
      accepted.push(card.id);
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    return res.status(500).json({ error: "Could not save cards", accepted });
  } finally {
    client.release();
  }

  try {
    if (fresh.length) await findMatches(fresh);
  } catch (err) {
    console.error("Matching failed (cards are saved, will retry on next card):", err);
  }
  res.json({ accepted });
});

// ---------- matching ----------
//
// Compare new cards against everything already received, in both directions:
//   - who the new people are looking for  vs  everyone registered
//   - the new people themselves           vs  everyone's searches
// Hidden people are never in the "everyone registered" list, so nobody can
// ever be matched TO them; they can only match others.
async function findMatches(newCardIds) {
  const cards = (await pool.query("SELECT * FROM cards WHERE shelter_id IS NOT NULL")).rows;
  const searches = (await pool.query("SELECT * FROM searches")).rows;
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const searchesByCard = new Map();
  for (const s of searches) {
    if (!searchesByCard.has(s.card_id)) searchesByCard.set(s.card_id, []);
    searchesByCard.get(s.card_id).push(s);
  }
  const isNew = new Set(newCardIds);
  const findable = cards.filter((c) => !c.hidden && (c.name || c.name_fp?.length));

  for (const search of searches) {
    const searcher = cardById.get(search.card_id);
    if (!searcher) continue;
    for (const found of findable) {
      if (found.id === searcher.id) continue;
      if (!isNew.has(searcher.id) && !isNew.has(found.id)) continue; // already compared before
      const m = scoreMatch(search, found, searcher, searchesByCard.get(found.id) || []);
      if (!m || m.score < MATCH_THRESHOLD) continue;
      await pool.query(
        `INSERT INTO matches (search_id, found_card_id, score, reasons)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [search.id, found.id, m.score, m.reasons.join(", ")]
      );
    }
  }
}

// What this shelter is allowed to know about its matches.
//
//   incoming – someone is looking for a person registered HERE. The volunteer
//              must find that person and ask whether they want to connect.
//              We say who is asking (their claim), never where they are.
//   outgoing – someone registered HERE is looking for someone. While waiting,
//              the volunteer only sees "waiting". A "no" also shows as
//              "waiting", so a searcher can't learn the person exists.
//
// Only after the found person says yes does each shelter see the other's id,
// so staff can arrange a supervised reunion. Locations are never shared.
app.get("/api/matches", requireDevice, async (req, res) => {
  const me = req.device.shelter_id;
  const incoming = await pool.query(
    // reverse_status: if the two people are looking for each other, the status
    // of the other direction. The pair only counts as connected once BOTH
    // directions are yes, so neither shelter learns anything early.
    `SELECT m.id, m.status, m.reasons, m.found_card_id,
            s.name AS searched_name, s.enc AS searched_enc, s.relationship,
            sc.hidden AS searcher_hidden, sc.name AS searcher_name, sc.enc AS searcher_enc,
            sc.shelter_id AS searcher_shelter,
            (SELECT r.status FROM matches r JOIN searches rs ON rs.id = r.search_id
              WHERE rs.card_id = m.found_card_id AND r.found_card_id = s.card_id LIMIT 1) AS reverse_status
       FROM matches m
       JOIN cards fc ON fc.id = m.found_card_id
       JOIN searches s ON s.id = m.search_id
       JOIN cards sc ON sc.id = s.card_id
      WHERE fc.shelter_id = $1
      ORDER BY m.created_at DESC`,
    [me]
  );
  const outgoing = await pool.query(
    // When two people are looking for each other, the same pair shows up twice
    // (A looking for B, and B looking for A). Each shelter only needs the item
    // it has to act on, so a search is left out here if the reverse request is
    // already in this shelter's "needs an answer" list.
    `SELECT m.id, m.status, s.card_id AS searcher_card_id, s.name AS searched_name, s.enc AS searched_enc, s.relationship,
            fc.shelter_id AS found_shelter
       FROM matches m
       JOIN searches s ON s.id = m.search_id
       JOIN cards sc ON sc.id = s.card_id
       JOIN cards fc ON fc.id = m.found_card_id
      WHERE sc.shelter_id = $1
        -- Both people at this same shelter: it's already in "needs an answer".
        AND fc.shelter_id <> $1
        AND NOT EXISTS (
          SELECT 1 FROM matches r JOIN searches rs ON rs.id = r.search_id
           WHERE rs.card_id = m.found_card_id AND r.found_card_id = s.card_id
             AND r.status IN ('asking', 'yes'))
      ORDER BY m.created_at DESC`,
    [me]
  );

  res.json({
    incoming: incoming.rows.map((r) => {
      const connected = r.status === "yes" && (!r.reverse_status || r.reverse_status === "yes");
      return {
        id: r.id,
        // "answered": this side said yes, the other side hasn't decided yet.
        status: r.status === "yes" && !connected ? "answered" : r.status,
        foundCardId: r.found_card_id,
        searchedName: r.searched_name,
        searchedEnc: r.searched_enc,
        relationship: r.relationship,
        searcherName: r.searcher_hidden ? null : r.searcher_name,
        searcherEnc: r.searcher_hidden ? null : r.searcher_enc,
        searcherHidden: r.searcher_hidden,
        reasons: r.reasons,
        otherShelterId: connected ? r.searcher_shelter : null,
      };
    }),
    outgoing: outgoing.rows.map((r) => ({
      id: r.id,
      status: r.status === "yes" ? "yes" : "waiting",
      searcherCardId: r.searcher_card_id,
      searchedName: r.searched_name,
      searchedEnc: r.searched_enc,
      relationship: r.relationship,
      otherShelterId: r.status === "yes" ? r.found_shelter : null,
    })),
  });
});

// The found person's answer, recorded by a volunteer at THEIR shelter only.
app.post("/api/matches/:id/answer", requireDevice, async (req, res) => {
  const answer = req.body.answer === "yes" ? "yes" : req.body.answer === "no" ? "no" : null;
  if (!answer) return res.status(400).json({ error: "answer must be yes or no" });
  const result = await pool.query(
    `UPDATE matches m SET status = $1, answered_at = now()
       FROM cards fc
      WHERE m.id = $2 AND fc.id = m.found_card_id AND fc.shelter_id = $3 AND m.status = 'asking'
      RETURNING m.id`,
    [answer, Number(req.params.id), req.device.shelter_id]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: "No open request with that id for this shelter" });

  // If the other person was ALSO searching for the one who just said yes,
  // their own search already counts as their wish to connect, so they don't
  // need to be asked again. Except children: a staff member still decides.
  if (answer === "yes") {
    await pool.query(
      `UPDATE matches r SET status = 'yes', answered_at = now()
         FROM matches m, searches s, searches rs, cards other
        WHERE m.id = $1 AND s.id = m.search_id AND rs.id = r.search_id
          AND rs.card_id = m.found_card_id AND r.found_card_id = s.card_id
          AND other.id = r.found_card_id AND (other.age IS NULL OR other.age >= 18)
          AND r.status = 'asking'`,
      [Number(req.params.id)]
    );
  }
  res.json({ ok: true });
});

// ---------- preloaded shelters ----------
//
// The region's official shelters are created on startup if they don't exist
// yet (see shelters.js). Set PRELOAD_SHELTERS=off to skip.
async function ensurePreloadedShelters() {
  if (process.env.PRELOAD_SHELTERS === "off") return;
  for (const { name, code } of PRELOADED_SHELTERS) {
    const exists = await pool.query("SELECT 1 FROM shelters WHERE join_code_hash = $1", [hash(normalizeCode(code))]);
    if (exists.rowCount === 0) await createShelter(name, code);
  }
  // The old two demo shelters are retired; their codes stop working.
  for (const code of ["DEMO-NORTH", "DEMO-SOUTH"]) {
    await pool.query("UPDATE shelters SET join_code_hash = 'retired:' || id WHERE join_code_hash = $1", [hash(code)]);
  }
}

const PORT = process.env.PORT || 3001;

await setupDatabase();
await ensurePreloadedShelters();
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
