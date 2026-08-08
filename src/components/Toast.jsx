export default function Toast({ message }) {
  return (
    <div className={`toast ${message ? "show" : ""}`} role="status" aria-live="polite">
      <i className="fa-solid fa-circle-check" />
      {message}
    </div>
  );
}
