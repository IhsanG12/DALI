// Outbox.jsx — what is waiting to be sent, and a manual "Send now" button.

import { useLiveQuery } from "dexie-react-hooks";
import { localDb } from "./localDb.js";
import { toMatchCard } from "./sync.js";

export default function Outbox({ shelter, syncing, lastResult, lastSyncAt, onSend, onSwitchShelter }) {
  const pending =
    useLiveQuery(() => localDb.people.where("syncStatus").equals("pending").sortBy("createdAt"), []) || [];

  return (
    <div className="stack">
      <h2>Outbox</h2>
      <p>
        <strong>{pending.length}</strong> waiting to send · last sent{" "}
        {lastSyncAt ? new Date(lastSyncAt).toLocaleString() : "never"}
      </p>
      <p className="muted">
        Records send automatically whenever there's a connection. You don't need to do anything.
      </p>
      <button className="primary" onClick={onSend} disabled={syncing}>
        {syncing ? "Sending…" : "Send now"}
      </button>
      {lastResult && <p className={lastResult.ok ? "ok" : "error"}>{lastResult.message}</p>}

      {pending.length > 0 && (
        <>
          <h3>What will be sent</h3>
          <p className="muted">
            Only what's needed to find a match. Where someone is in the shelter never leaves this device.
          </p>
          <ul className="cards">
            {pending.map((p) => {
              const card = toMatchCard(p);
              return (
                <li key={p.id}>
                  {card.person ? (
                    <strong>{card.person.name}</strong>
                  ) : (
                    <strong>Hidden person <span className="muted">(name not sent)</span></strong>
                  )}
                  {card.lookingFor.length > 0 && (
                    <div className="muted">Looking for: {card.lookingFor.map((s) => s.name).join(", ")}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <section className="stack device">
        <h3>This device</h3>
        <p>
          Registered to shelter <strong>{shelter}</strong>.
        </p>
        <p className="muted">
          Moving this device to another shelter? Records already saved here stay on the device and
          still send under {shelter}.
        </p>
        <button className="secondary" onClick={onSwitchShelter}>Switch shelter</button>
      </section>
    </div>
  );
}
