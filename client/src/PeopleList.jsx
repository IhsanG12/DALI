// PeopleList.jsx — everyone registered at THIS shelter, A to Z.
// There is deliberately no way to see people at other shelters.

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { localDb, currentShelterId } from "./localDb.js";

export default function PeopleList() {
  const [filter, setFilter] = useState("");
  const people = useLiveQuery(() => localDb.people.where("shelterId").equals(currentShelterId()).sortBy("name"), []) || [];
  const shown = people.filter((p) => p.name.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <div className="stack">
      <h2>People here ({people.length})</h2>
      <input placeholder="Filter by name" value={filter} onChange={(e) => setFilter(e.target.value)} />
      {shown.length === 0 && <p className="muted">No one registered yet.</p>}
      <ul className="cards">
        {shown.map((p) => (
          <li key={p.id}>
            <div className="line">
              <span><strong>{p.name}</strong>{p.age != null && <span className="muted">, {p.age}</span>}</span>
              <span className={`pill ${p.syncStatus}`}>{p.syncStatus === "sent" ? "Sent" : "Waiting to send"}</span>
            </div>
            {p.location && <div className="muted">{p.location}</div>}
            {p.hidden && <div className="badge">Hidden: can search, can't be found</div>}
            {p.lookingFor.length > 0 && (
              <div className="muted">Looking for: {p.lookingFor.map((s) => s.name + (s.relationship ? ` (${s.relationship})` : "")).join(", ")}</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
