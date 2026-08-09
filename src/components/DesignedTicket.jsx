import { GH_CD } from "../data/seed";
import TicketQR from "./TicketQR";

// Renders a host-designed ticket. `design` is the shape from
// ticketPresets.js; `passenger`, `code` and `hash` are filled in at
// purchase time so every buyer gets their own personalised pass.
// The styling lives in global.css under .designed-ticket.preset-*.
export default function DesignedTicket({
  design,
  passenger = "Guest",
  code = "",
  hash = "",
  price,
}) {
  const d = design || {};
  const priceNum = Number(price !== undefined ? price : d.price) || 0;
  const priceText = priceNum > 0 ? GH_CD(priceNum) : "Free";

  return (
    <div className={`designed-ticket preset-${d.preset || "classic"}`}>
      {d.bg && <img className="dt-bg" src={d.bg} alt="" aria-hidden="true" />}
      <div className="dt-main">
        <div className="dt-header">
          <b>{d.name || "Your Party"}</b>
          <span>{d.tagline || "Admission"}</span>
        </div>
        <div className="dt-cell dt-passenger">
          <span>Passenger</span>
          <b>{passenger}</b>
        </div>
        <div className="dt-cell dt-gate">
          <span>Entry</span>
          <b>{d.gate || "VIP"}</b>
        </div>
        <div className="dt-cell dt-depart">
          <span>From</span>
          <b>{d.depart || "—"}</b>
        </div>
        <div className="dt-cell dt-arrive">
          <span>To</span>
          <b>{d.arrive || "—"}</b>
        </div>
        <div className="dt-cell dt-date">
          <span>Date</span>
          <b>{d.date || "—"}</b>
        </div>
        <div className="dt-cell dt-time">
          <span>Time</span>
          <b>{d.time || "—"}</b>
        </div>
        <div className="dt-cell dt-section">
          <span>Section</span>
          <b>{d.section || "GA"}</b>
        </div>
        <div className="dt-cell dt-price">
          <span>Admission</span>
          <b>{priceText}</b>
        </div>
        <div className="dt-note">{d.footnote}</div>
        <div className="dt-meta">
          <span className="dt-code">{code || "PENDING"}</span>
          <span className="dt-hash">{hash}</span>
        </div>
        <div className="dt-bottom">
          <div className="dt-barcode" aria-hidden="true" />
          <TicketQR
            value={hash || code}
            label={hash ? "scan hash" : ""}
            size={64}
          />
        </div>
      </div>
      <div className="dt-side">
        <div className="dt-side-logo">{d.name || "TICKET"}</div>
        <div className="dt-side-cell">
          <span>To</span>
          <b>{d.arrive || "—"}</b>
        </div>
        <div className="dt-side-cell">
          <span>From</span>
          <b>{d.depart || "—"}</b>
        </div>
        <div className="dt-side-cell">
          <span>Date</span>
          <b>{d.date || "—"}</b>
        </div>
        <div className="dt-side-cell">
          <span>Time</span>
          <b>{d.time || "—"}</b>
        </div>
        <div className="dt-side-barcode" aria-hidden="true" />
      </div>
    </div>
  );
}
