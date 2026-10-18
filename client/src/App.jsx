// App.jsx — the frame around every screen: header, tabs, automatic sending.
//
// A React "component" is just a function that returns what to draw.
// `useState` holds values that, when changed, make React redraw the screen.

import { useCallback, useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { localDb, getDevice, setDevice, clearDevice } from "./localDb.js";
import { syncNow, getLastSyncAt, getCachedMatches, enroll } from "./sync.js";
import AddPerson from "./AddPerson.jsx";
import PeopleList from "./PeopleList.jsx";
import Matches from "./Matches.jsx";
import Outbox from "./Outbox.jsx";
import { ScanQr } from "./Qr.jsx";
import Guide from "./Guide.jsx";
import TetherMark from "./TetherMark.jsx";
import LockScreen, { makePin, LOCK_AFTER_MS } from "./Lock.jsx";
import { DEMO_SHELTERS, DEMO_PHRASE } from "./demo.js";

const AUTO_SYNC_EVERY_MS = 30_000;

export default function App() {
  const [device, setDeviceState] = useState(getDevice());
  const [tab, setTab] = useState("add");
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [lastSyncAt, setLastSyncAt] = useState(getLastSyncAt());
  const [matches, setMatches] = useState(getCachedMatches());
  const [locked, setLocked] = useState(Boolean(getDevice()));

  const shelterId = device?.shelterId;
  const pendingCount =
    useLiveQuery(
      async () =>
        shelterId
          ? (await localDb.people.where("shelterId").equals(shelterId).toArray()).filter((p) => p.syncStatus === "pending").length
          : 0,
      [shelterId]
    ) ?? 0;
  const needsAnswer = matches.incoming.filter((m) => m.status === "asking").length;

  const send = useCallback(async () => {
    setSyncing(true);
    const result = await syncNow();
    setLastResult(result);
    setLastSyncAt(getLastSyncAt());
    if (result.matches) setMatches(result.matches);
    setSyncing(false);
  }, []);

  // Automatic sending: try every 30 seconds, and right away when the
  // browser says the connection came back.
  useEffect(() => {
    if (!shelterId) return;
    send();
    const timer = setInterval(send, AUTO_SYNC_EVERY_MS);
    window.addEventListener("online", send);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", send);
    };
  }, [shelterId, send]);

  // Two tabs of the same browser share one device's storage. If another tab
  // sets up or leaves a shelter, follow it right away, so this tab never keeps
  // showing the old shelter while actually saving to the new one.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== "device" && e.key !== null) return;
      const d = getDevice();
      setDeviceState(d);
      setMatches(getCachedMatches());
      setTab("add");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Lock after a few minutes without taps or typing.
  useEffect(() => {
    if (!device || locked) return;
    let timer = setTimeout(() => setLocked(true), LOCK_AFTER_MS);
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setLocked(true), LOCK_AFTER_MS);
    };
    const events = ["pointerdown", "keydown", "scroll"];
    events.forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
    return () => {
      clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, reset));
    };
  }, [device, locked]);

  if (device && locked) {
    return (
      <LockScreen
        device={device}
        onUnlock={() => setLocked(false)}
        onForgot={() => {
          clearDevice();
          setDeviceState(null);
        }}
      />
    );
  }

  if (!device) {
    return (
      <Setup
        onDone={(d) => {
          setDevice(d);
          setMatches({ incoming: [], outgoing: [] });
          setDeviceState(d);
          setTab("add");
        }}
      />
    );
  }

  return (
    <>
      {/* Plain div with unique class names: some browser extensions squash
          anything that looks like a page header (<header>, .bar, .status). */}
      <div className="tt-top">
        <div className="tt-top-inner">
          <button className="tt-where" onClick={() => setTab("outbox")} title="This device and shelter">
            <strong><TetherMark /> Tether</strong>
            <span>{device.shelterName}</span>
          </button>
          <button className="tt-icon" onClick={() => setTab("guide")} aria-label="Volunteer guide" title="Volunteer guide">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14" /><circle cx="12" cy="17.5" r=".6" fill="currentColor" />
            </svg>
          </button>
          <button className="tt-icon" onClick={() => setLocked(true)} aria-label="Lock Tether" title="Lock">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
          </button>
          {/* The label only depends on how many records are waiting, so it doesn't
              flicker every time the app quietly tries to send in the background. */}
          <button className={`tt-sync ${pendingCount ? "waiting" : "clear"}`} onClick={() => setTab("outbox")}>
            <span className={`tt-dot ${syncing ? "busy" : ""}`} aria-hidden="true" />
            {pendingCount ? `${pendingCount} to send` : "All sent"}
          </button>
        </div>
      </div>

      <nav className="tabs">
        <button className={tab === "add" ? "on" : ""} onClick={() => setTab("add")}>Add person</button>
        <button className={tab === "people" ? "on" : ""} onClick={() => setTab("people")}>People here</button>
        <button className={tab === "matches" ? "on" : ""} onClick={() => setTab("matches")}>
          Matches{needsAnswer > 0 && <span className="count">{needsAnswer}</span>}
        </button>
        <button className={tab === "outbox" ? "on" : ""} onClick={() => setTab("outbox")}>Outbox</button>
      </nav>

      <main>
        {tab === "guide" && <Guide onClose={() => setTab("add")} />}
        {tab === "add" && <AddPerson onSaved={send} />}
        {tab === "people" && <PeopleList />}
        {tab === "matches" && <Matches matches={matches} onChanged={send} />}
        {tab === "outbox" && (
          <Outbox
            device={device}
            syncing={syncing}
            lastResult={lastResult}
            lastSyncAt={lastSyncAt}
            onSend={send}
            onLeave={() => {
              clearDevice();
              setDeviceState(null);
            }}
          />
        )}
      </main>
    </>
  );
}

// First-time setup: join a real, preloaded shelter.
// Scan the QR on the shelter's card, or type the join code and network phrase.
// Needs internet once; after that the device works offline.
function Setup({ onDone }) {
  const [code, setCode] = useState("");
  const [phrase, setPhrase] = useState("");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);

  async function join(joinCode, networkPhrase) {
    setBusy(true);
    setError("");
    try {
      const device = await enroll(joinCode.trim(), name.trim(), networkPhrase);
      onDone({ ...device, joinCode: joinCode.trim().toUpperCase(), phrase: networkPhrase, pin: await makePin(pin) });
    } catch (err) {
      setError(
        err.status === 401 || err.status === 400
          ? err.message
          : "Couldn't reach the server. Setting up a device needs a connection once. Try again in a minute."
      );
    }
    setBusy(false);
  }

  const onScan = useCallback((r) => {
    setScanning(false);
    setCode(r.joinCode);
    setPhrase(r.phrase);
  }, []);

  return (
    <main>
      <div className="stack">
        <div>
          <h1 className="brand"><TetherMark /> Tether</h1>
          <p className="muted">Helping families separated by the evacuation find each other.</p>
        </div>

        {scanning ? (
          <ScanQr onResult={onScan} onCancel={() => setScanning(false)} />
        ) : (
          <button type="button" className="primary" onClick={() => setScanning(true)}>
            Scan the shelter's QR code
          </button>
        )}

        <form
          className="stack card"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim() && phrase.trim() && pin.length >= 4) join(code, phrase);
          }}
        >
          <h2>Set up this device</h2>
          <label>
            Shelter join code
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="From the shelter's card" autoCapitalize="characters" />
          </label>
          <label>
            Network phrase
            <input value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder="Four words, also on the card" autoCapitalize="none" />
            <small>Stays on this device. It's never sent to our server.</small>
          </label>
          <label>
            <span>Your name <span className="req">(optional)</span></span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Choose a PIN (4–8 digits)
            <input type="password" inputMode="numeric" autoComplete="new-password" value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} />
            <small>Tether locks after 5 minutes without use, so a device left on a table doesn't show who is here.</small>
          </label>
          <button className="primary" disabled={busy || !code.trim() || !phrase.trim() || pin.length < 4}>
            {busy ? "Checking…" : "Set up this device"}
          </button>
          {error && <p className="error">{error}</p>}
        </form>

        <details className="card demo">
          <summary>Reviewing Tether? Use a demo shelter</summary>
          <p className="muted small">
            These shelters were registered "before the storm". Open Tether in a normal window as one
            shelter and in a private window as another to try a match.
          </p>
          <ul className="plain-list">
            {DEMO_SHELTERS.map((s) => (
              <li key={s.code}>
                <button type="button" className="link" onClick={() => { setCode(s.code); setPhrase(DEMO_PHRASE); }}>
                  {s.name}
                </button>{" "}
                <span className="code">{s.code}</span>
              </li>
            ))}
          </ul>
          <p className="small">Network phrase: <span className="code">{DEMO_PHRASE}</span></p>
        </details>
      </div>
    </main>
  );
}

