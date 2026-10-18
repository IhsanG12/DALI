// Lock.jsx — the PIN lock.
//
// Shelter devices get passed around and left on tables. The app locks when
// it's opened and after a few minutes without use, so someone who picks up
// the device can't scroll through who is at the shelter.
//
// The PIN itself is never stored: only a slow, salted hash of it.

import { useState } from "react";

const enc = new TextEncoder();
const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));

async function pinHash(pin, saltB64) {
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const base = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  return b64(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 150_000, hash: "SHA-256" }, base, 256));
}

export async function makePin(pin) {
  const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
  return { salt, hash: await pinHash(pin, salt) };
}

export const LOCK_AFTER_MS = 5 * 60 * 1000;

export default function LockScreen({ device, onUnlock, onForgot }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [tries, setTries] = useState(0);
  const [waitUntil, setWaitUntil] = useState(0);

  async function submit(e) {
    e.preventDefault();
    if (Date.now() < waitUntil) return;
    if ((await pinHash(pin, device.pin.salt)) === device.pin.hash) return onUnlock();
    const n = tries + 1;
    setTries(n);
    setPin("");
    // Slow down guessing: after 3 wrong tries, wait longer each time.
    if (n >= 3) {
      const seconds = 15 * 2 ** (n - 3);
      setWaitUntil(Date.now() + seconds * 1000);
      setError(`Wrong PIN. Try again in ${seconds} seconds.`);
    } else setError("Wrong PIN.");
  }

  return (
    <main className="lock">
      <form className="stack card" onSubmit={submit}>
        <h1 className="brand">Tether</h1>
        <p>
          <strong>{device.shelterName}</strong>
          {device.volunteerName ? <span className="muted"> · {device.volunteerName}</span> : null}
        </p>
        <label>
          Enter your PIN to unlock
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
          />
        </label>
        <button className="primary" disabled={pin.length < 4}>Unlock</button>
        {error && <p className="error">{error}</p>}
        <button type="button" className="link small" onClick={onForgot}>
          Forgot the PIN? Set this device up again with the shelter card.
        </button>
      </form>
    </main>
  );
}
