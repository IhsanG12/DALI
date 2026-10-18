// shelters.js — the region's official shelters, registered BEFORE the storm.
//
// Assumption (see README): emergency management prepared Tether ahead of
// hurricane season. Every designated shelter was entered here and given a
// join code, printed on a card (with a QR code) kept in the shelter's kit.
// Only these shelters exist, so a device can't join a made-up shelter.
//
// The codes below are published so reviewers can try the app. In a real
// deployment they would be random and kept off GitHub (see /api/admin/shelters).
export const PRELOADED_SHELTERS = [
  { name: "Lincoln High School Gym", code: "LINCOLN-2041" },
  { name: "St. Mary's Parish Hall", code: "STMARY-7713" },
  { name: "Bayview Community Center", code: "BAYVIEW-3390" },
  { name: "County Fairgrounds Expo Hall", code: "FAIRGROUNDS-5126" },
  { name: "Westfield Middle School", code: "WESTFIELD-8854" },
  { name: "Harbor Heights Recreation Center", code: "HARBOR-4407" },
  { name: "Grace Baptist Church", code: "GRACE-6618" },
  { name: "Riverside Elementary School", code: "RIVERSIDE-2275" },
];

// Every shelter device in the region also shares one secret "network phrase".
// It's printed on the same card and inside the QR code, and it NEVER goes to
// the server. Devices use it to scramble protected names, so only other
// shelter devices can read them. (Listed here only so the demo is usable.)
export const DEMO_NETWORK_PHRASE = "harbor lantern cedar sparrow";
