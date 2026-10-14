// localDb.js — the database that lives INSIDE the browser on the volunteer's device.
//
// Everything is saved here first, so nothing is lost when there's no internet.
// (IndexedDB is built into every browser; Dexie just makes it easier to use.)

import Dexie from "dexie";

export const localDb = new Dexie("reunite");

// "people" table. The string lists the fields we can search/sort by;
// other fields can still be stored, they just aren't indexed.
//   syncStatus: "pending" (waiting to send) or "sent"
localDb.version(1).stores({
  people: "id, name, syncStatus, createdAt",
});

// The shelter this device belongs to (until the real login is built).
export function getShelterCode() {
  try { return localStorage.getItem("shelterCode") || ""; } catch { return ""; }
}
export function setShelterCode(code) {
  try { localStorage.setItem("shelterCode", code); } catch { /* ignore */ }
}
