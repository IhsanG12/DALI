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
export async function setupDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS test_notes (
      id         SERIAL PRIMARY KEY,
      text       TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}
