// TetherMark.jsx
// Two points joined by a line: the app's mark.
export default function TetherMark() {
  return (
    <svg className="tether-mark" viewBox="0 0 44 16" aria-hidden="true">
      <line x1="7" y1="8" x2="37" y2="8" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="7" cy="8" r="5.5" fill="currentColor" />
      <circle cx="37" cy="8" r="5.5" fill="currentColor" />
    </svg>
  );
}
