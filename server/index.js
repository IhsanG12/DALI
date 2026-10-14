// index.js — the backend server.
//
// It listens for HTTP requests from the frontend, a bit like a C program
// sitting in a loop waiting for input. Each `app.get` / `app.post` line says:
// "when a request arrives at this address, run this function."

import express from "express";
import cors from "cors";
import { pool, setupDatabase } from "./db.js";

const app = express();
app.use(cors());          // allow our frontend (a different website) to call us
app.use(express.json());  // turn incoming JSON text into JavaScript objects

// Health check: lets us (and Render) see that the server is alive.
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// Step 1 "hello world": save a note, then read all notes back.
app.post("/api/test-notes", async (req, res) => {
  const text = (req.body.text || "").trim();
  if (!text) return res.status(400).json({ error: "Text is required" });

  // $1 is a placeholder. pg fills it in safely, which prevents SQL injection.
  const result = await pool.query(
    "INSERT INTO test_notes (text) VALUES ($1) RETURNING *",
    [text]
  );
  res.status(201).json(result.rows[0]);
});

app.get("/api/test-notes", async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM test_notes ORDER BY created_at DESC LIMIT 20"
  );
  res.json(result.rows);
});

const PORT = process.env.PORT || 3001;

await setupDatabase();
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
