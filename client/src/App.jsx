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

const AUTO_SYNC_EVERY_MS = 30_000;

export default function App() {
  const [device, setDeviceState] = useState(getDevice());
  const [tab, setTab] = useState("add");
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [lastSyncAt, setLastSyncAt] = useState(getLastSyncAt());
  const [matches, setMatches] = useState(getCachedMatches());

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
      <header className="bar">
        <div className="bar-inner">
          <button className="where" onClick={() => setTab("outbox")} title="Device and shelter settings">
            <strong>Tether</strong>
            <span className="muted">{device.shelterName}</span>
          </button>
          {/* The label only depends on how many records are waiting, so it doesn't
              flicker every time the app quietly tries to send in the background. */}
          <button className={`status ${pendingCount ? "waiting" : "clear"}`} onClick={() => setTab("outbox")}>
            <span className={`dot ${syncing ? "busy" : ""}`} aria-hidden="true" />
            {pendingCount ? `${pendingCount} to send` : "All sent"}
          </button>
        </div>
      </header>

      <nav className="tabs">
        <button className={tab === "add" ? "on" : ""} onClick={() => setTab("add")}>Add person</button>
        <button className={tab === "people" ? "on" : ""} onClick={() => setTab("people")}>People here</button>
        <button className={tab === "matches" ? "on" : ""} onClick={() => setTab("matches")}>
          Matches{needsAnswer > 0 && <span className="count">{needsAnswer}</span>}
        </button>
        <button className={tab === "outbox" ? "on" : ""} onClick={() => setTab("outbox")}>Outbox</button>
      </nav>

      <main>
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

// First-time setup: join a real shelter with the code from its coordinator.
// This needs internet once. After that, the device works offline.
function Setup({ onDone }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError("");
    try {
      onDone(await enroll(code.trim(), name.trim()));
    } catch (err) {
      setError(
        err.status === 401
          ? err.message
          : "Couldn't reach the server. Setting up a device needs a connection once. Try again in a minute."
      );
    }
    setBusy(false);
  }

  return (
    <main>
      <form className="stack" onSubmit={submit}>
        <h1>Tether</h1>
        <p className="muted">Helping separated families find each other. Set up this device for your shelter.</p>
        <label>
          Shelter join code
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="From your shelter coordinator" autoFocus />
        </label>
        <label>
          Your name <span className="req">(optional)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button className="primary" disabled={busy}>{busy ? "Checking…" : "Set up this device"}</button>
        {error && <p className="error">{error}</p>}
        <p className="muted small">
          Trying the demo? Use <strong>DEMO-NORTH</strong> in one window and <strong>DEMO-SOUTH</strong> in a
          private window to act as two shelters.
        </p>
      </form>
    </main>
  );
}
