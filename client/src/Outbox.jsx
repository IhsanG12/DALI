// Outbox.jsx — what is waiting to be sent, and a button to send and check for matches right away.

import { useLiveQuery } from "dexie-react-hooks";
import { localDb, currentShelterId } from "./localDb.js";
import { ShowQr, joinQrText } from "./Qr.jsx";

export default function Outbox({ device, syncing, lastResult, lastSyncAt, onSend, onLeave }) {
  const pending =
    useLiveQuery(async () => (await localDb.people.where("shelterId").equals(currentShelterId()).sortBy("createdAt")).filter((p) => p.syncStatus === "pending" || p.removed), []) || [];

  return (
    <div className="stack">
      <h2>Outbox</h2>
      <p>
        <strong>{pending.length}</strong> waiting to send · last sent{" "}
        {lastSyncAt ? new Date(lastSyncAt).toLocaleString() : "never"}
      </p>
      <p className="muted">
        Records send automatically every 30 seconds while there's a connection. If you just got a
        signal for a moment, use the button to send right away and check for new matches.
      </p>
      <button className="primary" onClick={onSend} disabled={syncing}>
        {syncing ? "Sending…" : "Send and check for matches now"}
      </button>
      {lastResult && <p className={lastResult.ok ? "ok" : "error"}>{lastResult.message}</p>}

      {pending.some((p) => p.removed) && (
        <p className="muted">
          {pending.filter((p) => p.removed).length} removal(s) waiting to send.
        </p>
      )}

      {pending.some((p) => !p.removed) && (
        <>
          <h3>What will be sent</h3>
          <p className="muted">
            Only what's needed to find a match. Where someone is in the shelter never leaves this device.
          </p>
          <ul className="cards">
            {pending.filter((p) => !p.removed).map((p) => (
              <li key={p.id}>
                {p.hidden ? (
                  <strong>Hidden person <span className="muted">(nothing about them is sent)</span></strong>
                ) : p.protected ? (
                  <strong>Protected name <span className="muted">(sent scrambled; the server can't read it)</span></strong>
                ) : (
                  <strong>{p.name}</strong>
                )}
                {p.lookingFor.length > 0 && (
                  <div className="muted">
                    Looking for:{" "}
                    {p.protected ? `${p.lookingFor.length} name(s), scrambled` : p.lookingFor.map((s) => s.name).join(", ")}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <section className="stack device">
        <h3>This device</h3>
        <p>
          Set up for <strong>{device.shelterName}</strong> <span className="code">{device.shelterId}</span>
          {device.volunteerName ? <> by {device.volunteerName}</> : null}.
        </p>
        {pending.length > 0 && (
          <p className="notice">
            {pending.length} record{pending.length === 1 ? " hasn't" : "s haven't"} been sent yet. If you
            leave this shelter now, they stay on this device and will only send if it's set up for this
            shelter again.
          </p>
        )}
        <details>
          <summary>Add another volunteer's device</summary>
          <p className="muted small">
            On the other device, open Tether and tap "Scan the shelter's QR code", then scan this.
            It contains this shelter's join code and the network phrase.
          </p>
          {device.joinCode && device.phrase && <ShowQr text={joinQrText(device.joinCode, device.phrase)} label="Shelter join QR code" />}
        </details>
        <button className="secondary" onClick={onLeave}>Leave this shelter</button>
      </section>
    </div>
  );
}
