// App.jsx — the frame around every screen: status bar, tabs, automatic sending.
//
// A React "component" is just a function that returns what to draw.
// `useState` holds values that, when changed, make React redraw the screen.

import { useCallback, useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { localDb, getShelterCode, setShelterCode, clearShelterCode } from "./localDb.js";
import { syncNow, getLastSyncAt } from "./sync.js";
import AddPerson from "./AddPerson.jsx";
import PeopleList from "./PeopleList.jsx";
import Outbox from "./Outbox.jsx";

const AUTO_SYNC_EVERY_MS = 30_000;

export default function App() {
  const [shelter, setShelter] = useState(getShelterCode());
  const [tab, setTab] = useState("add");
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [lastSyncAt, setLastSyncAt] = useState(getLastSyncAt());

  const pendingCount = useLiveQuery(() => localDb.people.where("syncStatus").equals("pending").count(), []) ?? 0;

  const send = useCallback(async () => {
    setSyncing(true);
    const result = await syncNow();
    setLastResult(result);
    setLastSyncAt(getLastSyncAt());
    setSyncing(false);
  }, []);

  // Automatic sending: try every 30 seconds, and right away when the
  // browser says the connection came back.
  useEffect(() => {
    if (!shelter) return;
    send();
    const timer = setInterval(send, AUTO_SYNC_EVERY_MS);
    window.addEventListener("online", send);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", send);
    };
  }, [shelter, send]);

  if (!shelter) return <Setup onDone={setShelter} />;

  return (
    <>
      <header className="bar">
        <button className="where" onClick={() => setTab("outbox")} title="Device and shelter settings">
          <strong>Reunite</strong>
          <span className="muted">Shelter {shelter}</span>
        </button>
        {/* The label only depends on how many records are waiting, so it doesn't
            flicker every time the app quietly tries to send in the background. */}
        <button className={`status ${pendingCount ? "waiting" : "clear"}`} onClick={() => setTab("outbox")}>
          <span className={`dot ${syncing ? "busy" : ""}`} aria-hidden="true" />
          {pendingCount ? `${pendingCount} to send` : "All sent"}
        </button>
      </header>

      <nav className="tabs">
        <button className={tab === "add" ? "on" : ""} onClick={() => setTab("add")}>Add person</button>
        <button className={tab === "people" ? "on" : ""} onClick={() => setTab("people")}>People here</button>
        <button className={tab === "outbox" ? "on" : ""} onClick={() => setTab("outbox")}>Outbox</button>
      </nav>

      <main>
        {tab === "add" && <AddPerson onSaved={send} />}
        {tab === "people" && <PeopleList />}
        {tab === "outbox" && (
          <Outbox
            shelter={shelter}
            syncing={syncing}
            lastResult={lastResult}
            lastSyncAt={lastSyncAt}
            onSend={send}
            onSwitchShelter={() => {
              clearShelterCode();
              setShelter("");
              setTab("add");
            }}
          />
        )}
      </main>
    </>
  );
}

// First-time setup: which shelter is this device at?
// (Temporary — Day 4 replaces this with the real enrollment + PIN login.)
function Setup({ onDone }) {
  const [code, setCode] = useState("");
  function submit(e) {
    e.preventDefault();
    const clean = code.trim().toUpperCase();
    if (!clean) return;
    setShelterCode(clean);
    onDone(clean);
  }
  return (
    <main>
      <form className="stack" onSubmit={submit}>
        <h1>Reunite</h1>
        <p className="muted">Helping separated families find each other. Set up this device for your shelter.</p>
        <label>
          Shelter code
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. LINCOLN-HS" autoFocus />
        </label>
        <button className="primary">Start</button>
      </form>
    </main>
  );
}
