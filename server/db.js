// db.js — the connection to our PostgreSQL database.
//
// Think of `pool` like a handful of open file handles to the database that
// get reused, so we don't reconnect on every request.

import pg from "pg";
import "dotenv/config";

if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  // Neon (our hosted database) requires an encrypted connection.
  ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
});

// Create the tables if they don't exist yet. Runs once when the server starts.
//
// A "match card" is the small summary a shelter sends out. Note what is NOT
// here: where the person is sleeping, notes, anything not needed to match.
//
//   cards     – one row per registered person.
//               For someone marked "keep hidden", name/age/neighborhood are
//               NULL: their identity never leaves the shelter.
//   searches  – who each person is looking for (a person can look for several).
export async function setupDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cards (
      id            UUID PRIMARY KEY,           -- made on the volunteer's device
      shelter_code  TEXT NOT NULL,
      hidden        BOOLEAN NOT NULL DEFAULT false,
      name          TEXT,
      age           INTEGER,
      neighborhood  TEXT,
      with_whom     TEXT,
      created_at    TIMESTAMPTZ NOT NULL,       -- when the volunteer registered them
      received_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS searches (
      id            SERIAL PRIMARY KEY,
      card_id       UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      name          TEXT NOT NULL,
      relationship  TEXT,
      age           INTEGER
    );
  `);
}
