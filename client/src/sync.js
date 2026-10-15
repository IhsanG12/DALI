// sync.js — sends waiting records to the server whenever a connection exists.
//
// This is "store and forward": the device holds records until it can send
// them, like a letter waiting in an outbox until the mail truck comes.

import { localDb } from "./localDb.js";

export const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

// Turn a full local record into the small "match card" that leaves the shelter.
// Location in the shelter and notes are deliberately left out.
// If the person asked to be hidden, their own details are left out too:
// only who THEY are looking for goes out.
export function toMatchCard(p) {
  return {
    id: p.id,
    hidden: p.hidden,
    createdAt: p.createdAt,
    person: p.hidden
      ? null
      : { name: p.name, age: p.age, neighborhood: p.neighborhood, withWhom: p.withWhom },
    lookingFor: p.lookingFor,
  };
}

// fetch() can hang for a long time on a bad connection, so give up after a while.
// 45 seconds, because our free server falls asleep and can take ~1 minute to wake up.
async function fetchWithTimeout(url, options = {}, ms = 45000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

let running = false;

// Try to send everything that's waiting. Returns a short status message.
export async function syncNow() {
  if (running) return { ok: false, message: "Already sending…" };
  running = true;
  try {
    // Oldest first, so nobody waits forever behind newer records.
    const pending = await localDb.people.where("syncStatus").equals("pending").sortBy("createdAt");
    if (pending.length === 0) return { ok: true, message: "Nothing waiting to send." };

    // Send in small batches: on a weak connection, small requests are more
    // likely to get through, and each batch that succeeds is saved.
    // Group by shelter, in case this device was moved between shelters.
    const byShelter = {};
    for (const p of pending) (byShelter[p.shelterCode] ||= []).push(p);
    const batches = [];
    for (const [shelterCode, people] of Object.entries(byShelter)) {
      for (let i = 0; i < people.length; i += 20) batches.push({ shelterCode, people: people.slice(i, i + 20) });
    }

    let sent = 0;
    for (const { shelterCode, people: batch } of batches) {
      const res = await fetchWithTimeout(`${API}/api/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shelterCode, cards: batch.map(toMatchCard) }),
      });
      if (!res.ok) throw new Error(`Server said ${res.status}`);
      const { accepted } = await res.json();
      const now = new Date().toISOString();
      await localDb.people.where("id").anyOf(accepted).modify({ syncStatus: "sent", sentAt: now });
      sent += accepted.length;
    }
    try { localStorage.setItem("lastSyncAt", new Date().toISOString()); } catch { /* ignore */ }
    return { ok: true, message: `Sent ${sent} record${sent === 1 ? "" : "s"}.` };
  } catch {
    return { ok: false, message: "No connection right now. Records are safe on this device and will send automatically." };
  } finally {
    running = false;
  }
}

export function getLastSyncAt() {
  try { return localStorage.getItem("lastSyncAt"); } catch { return null; }
}
