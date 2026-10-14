// index.js — the backend server.
//
// It listens for HTTP requests from the frontend, a bit like a C program
// sitting in a loop waiting for input. Each `app.get` / `app.post` line says:
// "when a request arrives at this address, run this function."

import express from "express";
import cors from "cors";
import { pool, setupDatabase } from "./db.js";

const app = express();
app.use(cors());                          // allow our frontend (a different website) to call us
app.use(express.json({ limit: "1mb" }));  // turn incoming JSON text into JavaScript objects

// Health check: lets the app (and us) see that the server is reachable.
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// ---------- small helpers to clean up input ----------
const text = (v, max = 120) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const age = (v) => {
  if (v === null || v === undefined || v === "") return null; // unknown, not 0
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 120 ? n : null;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------- receive match cards from a shelter ----------
//
// Body: { shelterCode, cards: [ { id, hidden, createdAt, person, lookingFor } ] }
//
// Connections at shelters drop all the time, so the same card may arrive
// twice (the device retries if it never heard back). Each card has an id made
// on the device, and we use "ON CONFLICT DO NOTHING": sending twice is harmless.
app.post("/api/cards", async (req, res) => {
  const shelterCode = text(req.body.shelterCode, 40);
  const cards = Array.isArray(req.body.cards) ? req.body.cards.slice(0, 200) : [];
  if (!shelterCode) return res.status(400).json({ error: "shelterCode is required" });

  const accepted = [];
  const client = await pool.connect();
  try {
    for (const card of cards) {
      if (!UUID.test(card.id || "")) continue;
      const hidden = card.hidden === true;
      // A hidden person's identity is never stored, even if the device sent it.
      const person = hidden ? {} : card.person || {};

      await client.query("BEGIN");
      const inserted = await client.query(
        `INSERT INTO cards (id, shelter_code, hidden, name, age, neighborhood, with_whom, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO NOTHING`,
        [
          card.id, shelterCode, hidden,
          text(person.name), age(person.age), text(person.neighborhood), text(person.withWhom, 300),
          new Date(card.createdAt || Date.now()),
        ]
      );
      // Only add searches the first time we see this card.
      if (inserted.rowCount === 1) {
        for (const s of (card.lookingFor || []).slice(0, 10)) {
          if (!text(s.name)) continue;
          await client.query(
            "INSERT INTO searches (card_id, name, relationship, age) VALUES ($1, $2, $3, $4)",
            [card.id, text(s.name), text(s.relationship, 40), age(s.age)]
          );
        }
      }
      await client.query("COMMIT");
      accepted.push(card.id);
    }
    res.json({ accepted });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    res.status(500).json({ error: "Could not save cards", accepted });
  } finally {
    client.release();
  }
});

const PORT = process.env.PORT || 3001;

await setupDatabase();
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
