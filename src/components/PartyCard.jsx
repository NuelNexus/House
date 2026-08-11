import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { GH_CD } from "../data/seed";
import { goUser, contactHostHref } from "../lib/nav";
import { useBuyNow } from "../hooks/useBuyNow";
import PartyCover from "./PartyCover";

export default function PartyCard({ party }) {
  const { isSaved, toggleSave } = useStore();
  const { user } = useAuth();
  const { buy, buyingId } = useBuyNow();
  // "Hosted by you" is based on the signed-in user's id, not a flag —
  // so it's correct now that everyone's parties share one list.
  const isMine =
    !!party.userId && !!user ? party.userId === user.id : !!party.isUser;

  // ---- Party = ticket. Every listing carries its own pass: the price,
  // stock and design live on the party itself.
  const design = party.ticketDesign && party.ticketDesign.enabled ? party.ticketDesign : null;
  // The AFFILIATE's sale price (party.price) is the source of truth —
  // the design's "door price" defaults to "0" and must never make a
  // priced listing look free.
  const price = Number(party.price) || Number(design?.price) || 0;
  const capacity = Number(design?.stock ?? 0);
  const ticketsLeft = Math.max(0, capacity - (party.ticketsSold ?? 0));
  // Stock/capacity only apply once a ticket design is enabled (the same
  // rule communityTickets uses). Every listing is pay-to-go — no RSVP.
  const onSale = !!design;
  const soldOut = onSale && capacity > 0 && ticketsLeft === 0;
  const low = onSale && capacity > 0 && ticketsLeft > 0 && ticketsLeft <= 20;
  const buying = buyingId === party.id;

  // Shape the ticket from the party itself, matching the shape the
  // store expects (id, price, design, splits…).
  const ticket = {
    id: party.id,
    name: design?.name || party.title,
    category: party.category,
    date: party.date,
    location: party.location,
    price,
    originalPrice: party.originalPrice || null,
    partyId: party.id,
    hostId: party.hostId || party.userId || null,
    affiliateId: party.affiliateId || null,
    design,
    ticketDesign: design,
    isParty: true,
    hostName: party.host,
  };

  const openDetail = (e) => {
    e.stopPropagation();
    window.location.hash = `party/${party.id}`;
  };

  return (
    <article
      className="card party-card"
      onClick={openDetail}
      role="link"
      tabIndex={0}
      aria-label={`Open ${party.title}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          window.location.hash = `party/${party.id}`;
        }
      }}
    >
      <div className="cover">
        {isMine && <span className="hosted-badge">Hosted by you</span>}
        <PartyCover party={party} />
        <button
          className={`save-btn ${isSaved(party.id) ? "on" : ""}`}
          aria-label={isSaved(party.id) ? "Remove from saved" : "Save event"}
          title={isSaved(party.id) ? "Remove from saved" : "Save event"}
          onClick={(e) => {
            e.stopPropagation();
            toggleSave(party.id);
          }}
        >
          <i
            className={`fa-${isSaved(party.id) ? "solid" : "regular"} fa-heart`}
            aria-hidden="true"
          />
        </button>
      </div>
      <div className="party-meta">
        <span>{party.category}</span>
        <span>{party.date}</span>
      </div>
      <h3>{party.title}</h3>
      {party.userId ? (
        <button
          className="host host-link"
          title="View profile"
          onClick={(e) => {
            e.stopPropagation();
            goUser(party.userId);
          }}
        >
          <i className="fa-solid fa-user" style={{ marginRight: 6, fontSize: 12 }} />
          Hosted by {party.host} · {party.location}
        </button>
      ) : (
        <p className="host">
          <i className="fa-solid fa-user" style={{ marginRight: 6, fontSize: 12 }} />
          Hosted by {party.host} · {party.location}
        </p>
      )}
      <p className="desc">{party.description}</p>

      {capacity > 0 && (
        <div>
          <div className="capacity">
            <div
              className="fill"
              style={{
                width: `${Math.min(100, ((capacity - ticketsLeft) / capacity) * 100)}%`,
              }}
            />
          </div>
          <div className="capacity-row">
            {soldOut ? (
              <span>Sold out</span>
            ) : (
              <span>{ticketsLeft} tickets left</span>
            )}
            <span>{capacity} capacity</span>
          </div>
        </div>
      )}

      <div className="card-foot">
        <span className="price" style={{ fontSize: 24 }}>
          {price === 0 ? "Free" : GH_CD(price)}
        </span>
        <button
          className="btn btn-sm"
          disabled={soldOut || buying}
          onClick={(e) => {
            e.stopPropagation();
            buy(ticket);
          }}
        >
          {buying ? (
            <>
              <i className="fa-solid fa-spinner fa-spin" /> Paying…
            </>
          ) : soldOut ? (
            "Sold out"
          ) : price === 0 ? (
            <>
              Get free ticket <i className="fa-solid fa-ticket icon" />
            </>
          ) : (
            <>
              Get ticket <i className="fa-solid fa-lock icon" />
            </>
          )}
        </button>
        {low && !soldOut && (
          <span className="card-status low">Only {ticketsLeft} left</span>
        )}
      </div>

      <div className="card-contact">
        <a
          className="contact-btn"
          href={contactHostHref({
            hostId: party.userId || party.hostId,
            hostName: party.host,
            eventId: party.id,
            eventName: party.title,
            kind: "contact",
          })}
          onClick={(e) => e.stopPropagation()}
        >
          <i className="fa-regular fa-envelope" /> Contact the host
        </a>
        <a
          className="contact-btn offer"
          href={contactHostHref({
            hostId: party.userId || party.hostId,
            hostName: party.host,
            eventId: party.id,
            eventName: party.title,
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
