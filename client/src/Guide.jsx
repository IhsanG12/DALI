// Guide.jsx — how to use Tether, written for a tired volunteer at 2 a.m.

export default function Guide({ onClose }) {
  return (
    <div className="stack guide">
      <div className="guide-head">
        <h2>Volunteer guide</h2>
        <button onClick={onClose}>Back</button>
      </div>

      <section className="card stack">
        <h3>1. Registering someone</h3>
        <ol>
          <li>Open <strong>Add person</strong>. Only a name is required. A nickname or a description is fine if they won't give one.</li>
          <li>Ask who they're looking for, and who they were with when they got separated. Rough ages are fine.</li>
          <li>Write where they are in the shelter (cot, row, room). That never leaves this device.</li>
          <li>Ask the privacy question below, then tap <strong>Save</strong>. It saves instantly, even without internet.</li>
        </ol>
      </section>

      <section className="card stack">
        <h3>2. The privacy question</h3>
        <p>Ask: <em>"Is there anyone you're worried could find you, or would you rather your name not be shared?"</em></p>
        <table className="privacy-table">
          <thead>
            <tr><th></th><th>Family can find them</th><th>Our server can read their name</th></tr>
          </thead>
          <tbody>
            <tr><th>Normal</th><td>Yes</td><td>Yes</td></tr>
            <tr><th>Protect name</th><td>Yes</td><td>No, it's scrambled</td></tr>
            <tr><th>Keep hidden</th><td>No, but they can search</td><td>No, nothing is sent</td></tr>
          </tbody>
        </table>
        <p className="muted small">
          Protect name is a good default for anyone without papers or worried about authorities.
          Keep hidden is for anyone fleeing someone. Nobody needs to explain why.
        </p>
      </section>

      <section className="card stack">
        <h3>3. When a match comes in</h3>
        <ol>
          <li>Open <strong>Matches</strong>. It tells you who to find and where they are in the shelter.</li>
          <li>Talk to them <strong>privately</strong> and read the script on the card. Let them decide.</li>
          <li>If the person is a <strong>child</strong>, a staff member makes the decision, not the child alone.</li>
          <li>On <strong>Yes</strong>, you'll get the other shelter's id. Give it to your shelter coordinator, who arranges a supervised reunion at a neutral place.</li>
        </ol>
        <p className="notice">
          Never tell anyone where the other person is, and never give the shelter id to the family.
        </p>
      </section>

      <section className="card stack">
        <h3>4. No internet?</h3>
        <p>
          Keep working. Everything is saved on this device and sends by itself whenever there's a
          connection. The top-right badge shows what's waiting; <strong>All sent</strong> means
          everything got through. New matches arrive the next time the device connects.
        </p>
      </section>

      <section className="card stack">
        <h3>5. Keeping people safe</h3>
        <ul>
          <li>If someone asks "Is my wife here?", <strong>never confirm or deny</strong>. Say: "I can't say who's here, but I can register your search."</li>
          <li>Don't read names out loud across the room.</li>
          <li>Tap <strong>Lock</strong> when you step away. Tether also locks itself after 5 minutes.</li>
          <li>Anyone claiming to be family is only a claim until staff check in person.</li>
        </ul>
      </section>

      <section className="card stack">
        <h3>6. Adding another volunteer's device</h3>
        <p>
          Go to <strong>Outbox → This device → Add another volunteer's device</strong> and let them scan the
          QR code. Or use the shelter's printed card.
        </p>
      </section>
    </div>
  );
}
