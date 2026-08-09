import { useEffect } from "react";

export default function Modal({ title, onClose, children, className = "" }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="overlay show" onClick={onClose}>
      <div
        className={`modal ${className}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="close-x" aria-label="Close" onClick={onClose}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
