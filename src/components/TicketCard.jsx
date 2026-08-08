import { useStore } from "../context/StoreContext";
import { GH_CD } from "../data/seed";
import { contactHostHref } from "../lib/nav";

export default function TicketCard({ ticket }) {
  const { addToCart, cart } = useStore();
  const soldOut = ticket.ticketsLeft === 0;
  const low = ticket.ticketsLeft > 0 && ticket.ticketsLeft <= 20;
  const inCart = cart.find((i) => i.id === ticket.id);

  const openDetail = () => {
    window.location.hash = `party/${ticket.id}`;
  };

  return (
    <article
      className="card ticket-card"
      onClick={openDetail}
      role="link"
      tabIndex={0}
      aria-label={`Open ${ticket.name}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openDetail();
        }
      }}
    >
      <div className="card-top">
        <span
          className="card-tag"
          style={{ borderColor: ticket.accent, color: ticket.accent }}
        >
          {ticket.category}
        </span>
        {soldOut ? (
          <span className="card-status">Sold out</span>
        ) : low ? (
          <span className="card-status low">Only {ticket.ticketsLeft} left</span>
        ) : null}
      </div>

      <h3>{ticket.name}</h3>

      <div className="meta">
        <span>
          <i className="fa-regular fa-calendar" /> {ticket.date}
        </span>
        <span>
          <i className="fa-solid fa-location-dot" /> {ticket.location}
        </span>
      </div>

      <p className="lineup">
        <b>Lineup:</b> {ticket.lineup.join(" · ")}
      </p>

      <div>
        <div className="capacity">
          <div
            className="fill"
            style={{
              width: `${Math.min(100, ((ticket.capacity - ticket.ticketsLeft) / ticket.capacity) * 100)}%`,
            }}
          />
        </div>
        <div className="capacity-row">
          <span>{ticket.ticketsLeft} tickets left</span>
          <span>{ticket.capacity} capacity</span>
        </div>
      </div>

      <div className="card-foot">
        <span className="price">
          {GH_CD(ticket.price)}
        </span>
        <button
          className="btn btn-sm"
          disabled={soldOut}
          onClick={(e) => {
            e.stopPropagation();
            addToCart(ticket);
          }}
        >
          {inCart ? (
            <>
              <i className="fa-solid fa-check" /> In cart
            </>
          ) : (
            <>
              Add to cart <i className="fa-solid fa-plus icon" />
            </>
          )}
        </button>
      </div>

      <div className="card-contact">
        <a
          className="contact-btn"
          href={contactHostHref({
            hostId: ticket.hostId,
            hostName: ticket.hostName,
            eventId: ticket.id,
            eventName: ticket.name,
            kind: "contact",
          })}
          onClick={(e) => e.stopPropagation()}
        >
          <i className="fa-regular fa-envelope" /> Contact the host
        </a>
        <a
          className="contact-btn offer"
          href={contactHostHref({
            hostId: ticket.hostId,
            hostName: ticket.hostName,
            eventId: ticket.id,
            eventName: ticket.name,
            kind: "offer",
          })}
          onClick={(e) => e.stopPropagation()}
        >
          <i className="fa-solid fa-briefcase" /> Offer service
        </a>
      </div>
    </article>
  );
}
