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
      // A hidden person's identity is never stored, even if the device sent it.
      const person = hidden ? {} : card.person || {};

      await client.query("BEGIN");
      const inserted = await client.query(
        `INSERT INTO cards (id, shelter_id, hidden, name, age, neighborhood, with_whom, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO NOTHING`,
        [
          card.id, req.device.shelter_id, hidden,
          text(person.name), age(person.age), text(person.neighborhood), text(person.withWhom, 300),
          new Date(card.createdAt || Date.now()),
        ]
      );
      if (inserted.rowCount === 1) {
        for (const s of (card.lookingFor || []).slice(0, 10)) {
          if (!text(s.name)) continue;
          await client.query(
            "INSERT INTO searches (card_id, name, relationship, age) VALUES ($1, $2, $3, $4)",
            [card.id, text(s.name), text(s.relationship, 40), age(s.age)]
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
  const findable = cards.filter((c) => !c.hidden && c.name);

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
    `SELECT m.id, m.status, m.reasons, m.found_card_id,
            s.name AS searched_name, s.relationship,
            sc.hidden AS searcher_hidden, sc.name AS searcher_name, sc.shelter_id AS searcher_shelter
       FROM matches m
       JOIN cards fc ON fc.id = m.found_card_id
       JOIN searches s ON s.id = m.search_id
       JOIN cards sc ON sc.id = s.card_id
      WHERE fc.shelter_id = $1
      ORDER BY m.created_at DESC`,
    [me]
  );
  const outgoing = await pool.query(
    `SELECT m.id, m.status, s.card_id AS searcher_card_id, s.name AS searched_name, s.relationship,
            fc.shelter_id AS found_shelter
       FROM matches m
       JOIN searches s ON s.id = m.search_id
       JOIN cards sc ON sc.id = s.card_id
       JOIN cards fc ON fc.id = m.found_card_id
      WHERE sc.shelter_id = $1
      ORDER BY m.created_at DESC`,
    [me]
  );

  res.json({
    incoming: incoming.rows.map((r) => ({
      id: r.id,
      status: r.status,
      foundCardId: r.found_card_id,
      searchedName: r.searched_name,
      relationship: r.relationship,
      searcherName: r.searcher_hidden ? null : r.searcher_name,
      reasons: r.reasons,
      otherShelterId: r.status === "yes" ? r.searcher_shelter : null,
    })),
    outgoing: outgoing.rows.map((r) => ({
      id: r.id,
      status: r.status === "yes" ? "yes" : "waiting",
      searcherCardId: r.searcher_card_id,
      searchedName: r.searched_name,
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
  res.json({ ok: true });
});

// ---------- demo shelters ----------
//
// So reviewers can try a match without contacting anyone, the server creates
// two demo shelters with published join codes (see README). Real shelters get
// random codes from the admin endpoint. Set DEMO_SHELTERS=off to disable.
async function ensureDemoShelters() {
  if (process.env.DEMO_SHELTERS === "off") return;
  for (const [name, code] of [["Demo Shelter North", "DEMO-NORTH"], ["Demo Shelter South", "DEMO-SOUTH"]]) {
    const exists = await pool.query("SELECT 1 FROM shelters WHERE join_code_hash = $1", [hash(code)]);
    if (exists.rowCount === 0) await createShelter(name, code);
  }
}

const PORT = process.env.PORT || 3001;

await setupDatabase();
await ensureDemoShelters();
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
