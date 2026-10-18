// sync.js — talks to the server: setting up the device, sending records,
// and fetching matches.
//
// Sending is "store and forward": the device holds records until it can send
// them, like a letter waiting in an outbox until the mail truck comes.

import { localDb, getDevice } from "./localDb.js";
import { deriveNetworkKeys, phraseCheck, DEMO_PHRASE_CHECK, nameFingerprints, placeFingerprints, lock, unlock } from "./privacy.js";

export const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

// Turn a full local record into the small "match card" that leaves the shelter.
//
// What leaves, by choice:
//   normal          name, age, neighborhood, who they're with, who they're looking for
//   protect name    only fingerprints + a scrambled copy the server can't read
//   keep hidden     nothing about the person; only who THEY are looking for
// Where someone is in the shelter never leaves, for anyone.
export async function toMatchCard(p, keys = getDevice()?.keys) {
  const protect = p.protected && !p.hidden;
  const lookingFor = await Promise.all(
    p.lookingFor.map(async (s) => ({
      name: p.protected ? undefined : s.name,
      relationship: s.relationship,
      age: s.age,
      nameFp: await nameFingerprints(keys, s.name),
      enc: p.protected ? await lock(keys, { name: s.name }) : undefined,
    }))
  );
  let person = null;
  if (!p.hidden) {
    person = {
      age: p.age,
      nameFp: await nameFingerprints(keys, p.name),
      hoodFp: await placeFingerprints(keys, p.neighborhood || ""),
      ...(protect
        ? { enc: await lock(keys, { name: p.name, neighborhood: p.neighborhood, withWhom: p.withWhom }) }
        : { name: p.name, neighborhood: p.neighborhood, withWhom: p.withWhom }),
    };
  }
  return { id: p.id, hidden: p.hidden, protected: Boolean(p.protected), createdAt: p.createdAt, person, lookingFor };
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
// Only the join code goes to the server. The network phrase stays here: the
// device turns it into keys locally, so the server never sees it.
export async function enroll(joinCode, volunteerName, phrase) {
  const keys = await deriveNetworkKeys(phrase);
  if ((await phraseCheck(keys)) !== DEMO_PHRASE_CHECK) {
    throw Object.assign(new Error("That network phrase doesn't look right. Check the shelter card."), { status: 400 });
  }
  const { token, shelter } = await request("/api/enroll", { method: "POST", body: { joinCode, volunteerName } });
  return { token, shelterId: shelter.id, shelterName: shelter.name, volunteerName, keys };
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
      const { accepted } = await request("/api/cards", { method: "POST", body: { cards: await Promise.all(batch.map((p) => toMatchCard(p))) } });
      const now = new Date().toISOString();
      await localDb.people.where("id").anyOf(accepted).modify({ syncStatus: "sent", sentAt: now });
      sent += accepted.length;
    }
    try { localStorage.setItem("lastSyncAt", new Date().toISOString()); } catch { /* ignore */ }

    // Matches are kept on the device too, so volunteers can still see who to
    // talk to when the connection drops again.
    const matches = await makeReadable(await request("/api/matches"), device.keys);
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

// Protected names arrive scrambled. Only this shelter device (which knows the
// network phrase) can unscramble them for the volunteer.
async function makeReadable(matches, keys) {
  for (const m of [...matches.incoming, ...matches.outgoing]) {
    if (!m.searchedName && m.searchedEnc) m.searchedName = (await unlock(keys, m.searchedEnc))?.name || "(protected name)";
    if (!m.searcherName && m.searcherEnc) {
      m.searcherName = (await unlock(keys, m.searcherEnc))?.name || "(protected name)";
      m.searcherProtected = true;
    }
  }
  return matches;
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
