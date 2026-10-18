// localDb.js — the database that lives INSIDE the browser on the volunteer's device.
//
// Everything is saved here first, so nothing is lost when there's no internet.
// (IndexedDB is built into every browser; Dexie just makes it easier to use.)

import Dexie from "dexie";

// (The database keeps its original name so records saved before the rename are kept.)
export const localDb = new Dexie("reunite");

// "people" table. The string lists the fields we can search/sort by;
// other fields can still be stored, they just aren't indexed.
//   syncStatus: "pending" (waiting to send) or "sent"
localDb.version(1).stores({ people: "id, name, syncStatus, createdAt" });
localDb.version(2).stores({ people: "id, name, syncStatus, createdAt, shelterCode" });
// Version 3: records belong to an enrolled shelter (shelterId), not a typed-in code.
localDb.version(3).stores({ people: "id, name, syncStatus, createdAt, shelterId" });

// ---------- this device's enrollment ----------
// { token, shelterId, shelterName, volunteerName, keys }
// keys come from the shelter network phrase and never leave this device.
// The token is the device's secret pass. The server only knows its hash.
export function getDevice() {
  try {
    const d = JSON.parse(localStorage.getItem("device"));
    return d?.keys ? d : null; // devices set up before name protection must set up again
  } catch { return null; }
}
export function setDevice(device) {
  try { localStorage.setItem("device", JSON.stringify(device)); } catch { /* ignore */ }
}
export function clearDevice() {
  try {
    localStorage.removeItem("device");
    localStorage.removeItem("matches");
    localStorage.removeItem("shelterCode"); // left over from the old typed-in codes
  } catch { /* ignore */ }
}
export const currentShelterId = () => getDevice()?.shelterId || "";
