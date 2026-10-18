// AddPerson.jsx — the intake form a volunteer fills in with each person.
//
// Only the name is required, so someone in a long line can be registered in
// seconds and the rest filled in later.

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { localDb, currentShelterId } from "./localDb.js";

const emptySearch = () => ({ name: "", relationship: "", age: "" });

const emptyForm = () => ({
  name: "",
  age: "",
  neighborhood: "",
  location: "",
  withWhom: "",
  lookingFor: [emptySearch()],
  hidden: false,
  protected: false,
});

export default function AddPerson({ onSaved }) {
  const [form, setForm] = useState(emptyForm());
  const [message, setMessage] = useState("");

  // Change one field of the form.
  const set = (field) => (e) =>
    setForm({ ...form, [field]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  // Change one field of one "looking for" row.
  const setSearch = (i, field) => (e) => {
    const lookingFor = form.lookingFor.map((s, j) => (j === i ? { ...s, [field]: e.target.value } : s));
    setForm({ ...form, lookingFor });
  };

  // "Did you mean…?" Show people already registered here with a similar name,
  // so the same person isn't registered twice.
  const typed = form.name.trim().toLowerCase();
  const similar = useLiveQuery(async () => {
    if (typed.length < 3) return [];
    const all = await localDb.people.where("shelterId").equals(currentShelterId()).toArray();
    const words = typed.split(/\s+/).filter((w) => w.length >= 3);
    return all.filter((p) => words.some((w) => p.name.toLowerCase().includes(w))).slice(0, 3);
  }, [typed]);

  async function save(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      setMessage("Please enter a name (or a description, like “woman in red jacket”).");
      return;
    }
    const toAge = (v) => (v === "" ? null : Number(v));
    await localDb.people.add({
      id: crypto.randomUUID(),
      name: form.name.trim(),
      age: toAge(form.age),
      neighborhood: form.neighborhood.trim(),
      location: form.location.trim(),
      withWhom: form.withWhom.trim(),
      lookingFor: form.lookingFor
        .filter((s) => s.name.trim())
        .map((s) => ({ name: s.name.trim(), relationship: s.relationship.trim(), age: toAge(s.age) })),
      hidden: form.hidden,
      protected: form.protected || form.hidden,
      shelterId: currentShelterId(),
      createdAt: new Date().toISOString(),
      syncStatus: "pending",
    });
    setMessage(`Saved ${form.name.trim()} on this device.`);
    setForm(emptyForm());
    onSaved?.();
  }

  return (
    <form onSubmit={save} className="stack">
      <h2>Add a person</h2>

      <label>
        <span>Name <span className="req">(required)</span></span>
        <input value={form.name} onChange={set("name")} autoComplete="off" />
        <small>If they won't give a name, a nickname or short description is fine.</small>
      </label>

      {similar?.length > 0 && (
        <div className="notice">
          <strong>Already registered here?</strong>
          <ul className="plain">
            {similar.map((p) => (
              <li key={p.id}>
                {p.name}{p.age != null ? `, ${p.age}` : ""}{p.location ? ` · ${p.location}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="two">
        <label>
          Age (rough guess is fine)
          <input type="number" inputMode="numeric" min="0" max="120" value={form.age} onChange={set("age")} />
        </label>
        <label>
          Home neighborhood
          <input value={form.neighborhood} onChange={set("neighborhood")} />
        </label>
      </div>

      <fieldset>
        <legend>Who are they looking for?</legend>
        {form.lookingFor.map((s, i) => (
          <div className="search-row" key={i}>
            <input placeholder="Name" value={s.name} onChange={setSearch(i, "name")} />
            <input placeholder="Relationship (son, mother…)" value={s.relationship} onChange={setSearch(i, "relationship")} />
            <input placeholder="Age" type="number" inputMode="numeric" min="0" max="120" value={s.age} onChange={setSearch(i, "age")} />
          </div>
        ))}
        <button
          type="button"
          className="secondary"
          onClick={() => setForm({ ...form, lookingFor: [...form.lookingFor, emptySearch()] })}
        >
          + Add another person
        </button>
      </fieldset>

      <label>
        Who were they with when they got separated?
        <input value={form.withWhom} onChange={set("withWhom")} placeholder="e.g. with neighbors on the school bus" />
      </label>

      <label>
        <span>Where are they in this shelter? <span className="badge">stays here</span></span>
        <input value={form.location} onChange={set("location")} placeholder="e.g. Gym, Row C, Cot 12" />
        <small>Never sent out. Only used so a volunteer can find them later.</small>
      </label>

      <fieldset className="privacy">
        <legend>Privacy (ask them)</legend>
        <label className="check">
          <input type="checkbox" checked={form.protected || form.hidden} disabled={form.hidden} onChange={set("protected")} />
          <span>
            <strong>Protect name.</strong> Family can still find them, but their name is scrambled on this
            device before it's sent. Tether's own server can't read it; only shelter devices can.
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={form.hidden} onChange={set("hidden")} />
          <span>
            <strong>Keep hidden.</strong> Nobody can search for this person. Their details never leave
            this shelter, but they can still search for others.
          </span>
        </label>
      </fieldset>

      <button type="submit" className="primary">Save</button>
      {message && <p className="ok" role="status">{message}</p>}
    </form>
  );
}
