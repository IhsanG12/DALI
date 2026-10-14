// App.jsx — the screen the volunteer sees.
//
// A React "component" is just a function that returns what to draw.
// `useState` holds values that, when changed, make React redraw the screen.

import { useEffect, useState } from "react";

// Where the backend lives. Locally it's localhost; on Netlify we set VITE_API_URL.
const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

export default function App() {
  const [text, setText] = useState("");
  const [notes, setNotes] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Ask the backend for the saved notes.
  async function loadNotes() {
    try {
      const res = await fetch(`${API}/api/test-notes`);
      setNotes(await res.json());
      setError("");
    } catch {
      setError("Can't reach the server. It may be waking up — try again in a minute.");
    }
  }

  // Send a new note to the backend, then reload the list.
  async function saveNote(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    try {
      await fetch(`${API}/api/test-notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      setText("");
      await loadNotes();
    } catch {
      setError("Couldn't save. Check the connection.");
    }
    setSaving(false);
  }

  // Run loadNotes once when the page first opens.
  useEffect(() => { loadNotes(); }, []);

  return (
    <main>
      <h1>Reunite</h1>
      <p className="muted">Step 1 test: frontend → backend → database.</p>

      <form className="row" onSubmit={saveNote}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a test note"
        />
        <button disabled={saving}>{saving ? "Saving…" : "Save"}</button>
      </form>

      {error && <p className="error">{error}</p>}

      <ul>
        {notes.map((n) => (
          <li key={n.id}>{n.text}</li>
        ))}
      </ul>
    </main>
  );
}
