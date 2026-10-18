// Matches.jsx — possible matches for this shelter.
//
// Two lists:
//   "Someone is looking for a person here" – the volunteer finds that person
//      and asks if they want to connect. Their answer is recorded here.
//   "Searches from this shelter" – people here who are looking for someone.
//
// Tether never shows where anyone is. After the found person says yes, each
// shelter only learns the other shelter's id, so staff can arrange a
// supervised reunion through their coordinator.

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { localDb, currentShelterId } from "./localDb.js";
import { answerMatch } from "./sync.js";

export default function Matches({ matches, onChanged }) {
  const people = useLiveQuery(() => localDb.people.where("shelterId").equals(currentShelterId()).toArray(), []) || [];
  const byId = new Map(people.map((p) => [p.id, p]));
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");

  const toAnswer = matches.incoming.filter((m) => m.status === "asking");
  const connected = [
    ...matches.incoming.filter((m) => m.status === "yes"),
    ...matches.outgoing.filter((m) => m.status === "yes"),
  ];
  const waiting = [
    ...matches.incoming.filter((m) => m.status === "answered"),
    ...matches.outgoing.filter((m) => m.status === "waiting"),
  ];

  async function answer(id, value) {
    setBusy(id);
    setError("");
    try {
      await answerMatch(id, value);
      await onChanged();
    } catch {
      setError("Couldn't send the answer. It needs a connection. Try again when you have signal.");
    }
    setBusy(null);
  }

  return (
    <div className="stack">
      <h2>Matches</h2>
      <p className="muted">
        Tether never shares where anyone is. A match only means a volunteer should ask the person
        first.
      </p>
      {error && <p className="error">{error}</p>}

      <section className="stack">
        <h3>Needs an answer ({toAnswer.length})</h3>
        {toAnswer.length === 0 && <p className="muted">Nobody here has been asked about yet.</p>}
        <ul className="cards">
          {toAnswer.map((m) => {
            const p = byId.get(m.foundCardId);
            const isChild = p?.age != null && p.age < 18;
            return (
              <li key={m.id} className="match">
                <div>
                  <strong>{p ? p.name : m.searchedName}</strong>
                  {p?.location && <span className="muted"> · {p.location}</span>}
                </div>
                <div>
                  {m.searcherName ? <strong>{m.searcherName}</strong> : "Someone who asked to stay hidden"}
                  {m.searcherProtected && <span className="badge">name protected</span>}{" "}
                  is looking for <strong>{m.searchedName}</strong>
                  {m.relationship ? `, who they say is their ${m.relationship}.` : "."}
                </div>
                <div className="muted small">Why it matched: {m.reasons}</div>
                {isChild && (
                  <div className="notice">
                    <strong>{p.name} is a child.</strong> A staff member should make this decision,
                    not the child alone.
                  </div>
                )}
                <div className="script">
                  Find them and ask privately:{" "}
                  <em>
                    "Someone is looking for you
                    {m.relationship ? ` and says you are their ${m.relationship}` : ""}. Do you want to connect?"
                  </em>{" "}
                  Don't guess where the other person is. We don't know either.
                </div>
                <div className="row">
                  <button className="primary" disabled={busy === m.id} onClick={() => answer(m.id, "yes")}>
                    Yes, connect
                  </button>
                  <button disabled={busy === m.id} onClick={() => answer(m.id, "no")}>No</button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {connected.length > 0 && (
        <section className="stack">
          <h3>Connected ({connected.length})</h3>
          <ul className="cards">
            {connected.map((m) => {
              const here = byId.get(m.foundCardId || m.searcherCardId);
              return (
                <li key={`c${m.id}`} className="match yes">
                  <div>
                    <strong>{here?.name || "Someone here"}</strong> and{" "}
                    {m.foundCardId
                      ? m.searcherName || "the person who asked to stay hidden"
                      : m.searchedName}{" "}
                    agreed to connect.
                  </div>
                  <div>
                    Other shelter: <strong className="code">{m.otherShelterId}</strong>
                  </div>
                  <div className="muted small">
                    Contact your coordinator with this shelter id to arrange a supervised reunion at a
                    neutral place. Don't share it with the family.
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="stack">
        <h3>Waiting ({waiting.length})</h3>
        {waiting.length === 0 && <p className="muted">Nothing waiting on another shelter.</p>}
        <ul className="cards">
          {waiting.map((m) =>
            m.status === "answered" ? (
              <li key={`a${m.id}`}>
                <div>
                  <strong>{byId.get(m.foundCardId)?.name || "Someone here"}</strong> said yes to connecting with{" "}
                  {m.searcherName || "the person who asked to stay hidden"}.
                </div>
                <div className="muted">Waiting for the other shelter to decide.</div>
              </li>
            ) : (
              <li key={`o${m.id}`}>
                <div>
                  <strong>{byId.get(m.searcherCardId)?.name || "Someone here"}</strong> is looking for{" "}
                  {m.searchedName}
                  {m.relationship ? ` (${m.relationship})` : ""}.
                </div>
                <div className="muted">Possible match found. Waiting for the other person's answer.</div>
              </li>
            )
          )}
        </ul>
      </section>
    </div>
  );
}
