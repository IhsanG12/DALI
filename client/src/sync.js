// sync.js — talks to the server: setting up the device, sending records,
// and fetching matches.
//
// Sending is "store and forward": the device holds records until it can send
// them, like a letter waiting in an outbox until the mail truck comes.

import { localDb, getDevice } from "./localDb.js";

export const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

// Turn a full local record into the small "match card" that leaves the shelter.
// Location in the shelter is deliberately left out.
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
async function request(path, { method = "GET", body, ms = 45000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const device = getDevice();
  try {
    const res = await fetch(`${API}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(device?.token ? { Authorization: `Bearer ${device.token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || `Server said ${res.status}`), { status: res.status });
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// Set up this device for a shelter. Needs internet this one time.
export async function enroll(joinCode, volunteerName) {
  const { token, shelter } = await request("/api/enroll", { method: "POST", body: { joinCode, volunteerName } });
  return { token, shelterId: shelter.id, shelterName: shelter.name, volunteerName };
}

let running = false;

// Try to send everything that's waiting, then check for matches.
// Returns a short status message.
export async function syncNow() {
  if (running) return { ok: false, message: "Already sending…" };
  const device = getDevice();
  if (!device) return { ok: false, message: "This device isn't set up." };
  running = true;
  try {
    // Oldest first, so nobody waits forever behind newer records.
    const pending = (await localDb.people.where("shelterId").equals(device.shelterId).toArray())
      .filter((p) => p.syncStatus === "pending")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    // Small batches: on a weak connection, small requests are more likely to
    // get through, and each batch that succeeds is saved.
    let sent = 0;
    for (let i = 0; i < pending.length; i += 20) {
      const batch = pending.slice(i, i + 20);
      const { accepted } = await request("/api/cards", { method: "POST", body: { cards: batch.map(toMatchCard) } });
      const now = new Date().toISOString();
      await localDb.people.where("id").anyOf(accepted).modify({ syncStatus: "sent", sentAt: now });
      sent += accepted.length;
    }
    try { localStorage.setItem("lastSyncAt", new Date().toISOString()); } catch { /* ignore */ }

    // Matches are kept on the device too, so volunteers can still see who to
    // talk to when the connection drops again.
    const matches = await request("/api/matches");
    try { localStorage.setItem("matches", JSON.stringify(matches)); } catch { /* ignore */ }

    return { ok: true, message: sent ? `Sent ${sent} record${sent === 1 ? "" : "s"}.` : "Up to date.", matches };
  } catch (err) {
    if (err.status === 401) {
      return { ok: false, message: "This device is no longer recognized. Ask your coordinator for a new join code." };
    }
    return { ok: false, message: "No connection right now. Records are safe on this device and will send automatically." };
  } finally {
    running = false;
  }
}

export function getCachedMatches() {
  try { return JSON.parse(localStorage.getItem("matches")) || { incoming: [], outgoing: [] }; }
  catch { return { incoming: [], outgoing: [] }; }
}

export async function answerMatch(id, answer) {
  return request(`/api/matches/${id}/answer`, { method: "POST", body: { answer } });
}

export function getLastSyncAt() {
  try { return localStorage.getItem("lastSyncAt"); } catch { return null; }
}
