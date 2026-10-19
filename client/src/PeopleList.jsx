// PeopleList.jsx — everyone registered at THIS shelter, A to Z.
// There is deliberately no way to see people at other shelters.

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { localDb, currentShelterId } from "./localDb.js";
import { removePerson } from "./sync.js";

export default function PeopleList({ onChanged }) {
  const [filter, setFilter] = useState("");
  const [confirming, setConfirming] = useState(null); // id of the person being removed
  const [message, setMessage] = useState("");
  const all = useLiveQuery(() => localDb.people.where("shelterId").equals(currentShelterId()).sortBy("name"), []) || [];
  const people = all.filter((p) => !p.removed);
  const shown = people.filter((p) => p.name.toLowerCase().includes(filter.trim().toLowerCase()));

  async function remove(p) {
    await removePerson(p);
    setConfirming(null);
    setMessage(`Removed ${p.name}.`);
    onChanged?.(); // send the removal right away if there's a connection
  }

  return (
    <div className="stack">
      <h2>People here ({people.length})</h2>
      <input placeholder="Filter by name" value={filter} onChange={(e) => setFilter(e.target.value)} />
      {message && <p className="toast" role="status">{message}</p>}
      {shown.length === 0 && <p className="muted">No one registered yet.</p>}
      <ul className="cards">
        {shown.map((p) => (
          <li key={p.id}>
            <div className="line">
              <span><strong>{p.name}</strong>{p.age != null && <span className="muted">, {p.age}</span>}</span>
              <span className={`pill ${p.syncStatus}`}>{p.syncStatus === "sent" ? "Sent" : "Waiting to send"}</span>
            </div>
            {p.location && <div className="muted">{p.location}</div>}
            {p.hidden ? (
              <div><span className="badge flat">Hidden: can search, can't be found</span></div>
            ) : p.protected ? (
              <div><span className="badge flat">Name protected: our server can't read it</span></div>
            ) : null}
            {p.lookingFor.length > 0 && (
              <div className="muted">Looking for: {p.lookingFor.map((s) => s.name + (s.relationship ? ` (${s.relationship})` : "")).join(", ")}</div>
            )}

            {confirming === p.id ? (
              <div className="remove-confirm">
                <p>
                  Remove <strong>{p.name}</strong>? Their searches stop and any matches about them are deleted.
                  Use this for duplicates, people who left, or anyone who asks to be removed.
                </p>
                <div className="row">
                  <button className="danger" onClick={() => remove(p)}>Remove</button>
                  <button onClick={() => setConfirming(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <button className="link small remove-link" onClick={() => { setConfirming(p.id); setMessage(""); }}>
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
