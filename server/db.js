// db.js — the connection to our PostgreSQL database, and the table layout.
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
//   shelters  – real shelters, created only by a coordinator. A device can only
//               join with a shelter's join code, so nobody can invent a shelter.
//               The id is a random code (e.g. S-7Q4K) that says nothing about
//               where the shelter is.
//   devices   – each enrolled phone/laptop. We store a hash of its secret token
//               (like storing a password hash) so a leaked database can't be used
//               to pretend to be a device. A lost device can be revoked.
//   cards     – one "match card" per registered person. For someone marked
//               "keep hidden", name/age/neighborhood are NULL: their identity
//               never leaves the shelter.
//   searches  – who each person is looking for.
//   matches   – a possible match between one search and one person's card.
export async function setupDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shelters (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      join_code_hash  TEXT NOT NULL UNIQUE,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS devices (
      id              SERIAL PRIMARY KEY,
      shelter_id      TEXT NOT NULL REFERENCES shelters(id),
      volunteer_name  TEXT,
      token_hash      TEXT NOT NULL UNIQUE,
      revoked         BOOLEAN NOT NULL DEFAULT false,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS cards (
      id            UUID PRIMARY KEY,           -- made on the volunteer's device
      shelter_id    TEXT,
      hidden        BOOLEAN NOT NULL DEFAULT false,
      name          TEXT,
      age           INTEGER,
      neighborhood  TEXT,
      with_whom     TEXT,
      created_at    TIMESTAMPTZ NOT NULL,       -- when the volunteer registered them
      received_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    -- Older versions of this table used a typed-in shelter code instead.
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS shelter_id TEXT;
    ALTER TABLE cards DROP COLUMN IF EXISTS shelter_code;

    -- Name protection: every name also arrives as "fingerprints" (keyed hashes
    -- made on the shelter device). The server can tell two fingerprints are the
    -- same without knowing the name. Protected people send ONLY fingerprints
    -- plus an encrypted copy (enc) that only shelter devices can unlock.
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS protected BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS enc TEXT;
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS name_fp TEXT[];
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS hood_fp TEXT[];

    CREATE TABLE IF NOT EXISTS searches (
      id            SERIAL PRIMARY KEY,
      card_id       UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      name          TEXT NOT NULL,
      relationship  TEXT,
      age           INTEGER
    );

    ALTER TABLE searches ALTER COLUMN name DROP NOT NULL;
    ALTER TABLE searches ADD COLUMN IF NOT EXISTS enc TEXT;
    ALTER TABLE searches ADD COLUMN IF NOT EXISTS name_fp TEXT[];

    -- status: 'asking'   – waiting for the found person's answer
    --         'yes'      – they agreed; both shelters may now see each other's id
    --         'no'       – they declined (the searching side is never told)
    CREATE TABLE IF NOT EXISTS matches (
      id              SERIAL PRIMARY KEY,
      search_id       INTEGER NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
      found_card_id   UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      score           INTEGER NOT NULL,
      reasons         TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'asking',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      answered_at     TIMESTAMPTZ,
      UNIQUE (search_id, found_card_id)
    );
  `);
}
