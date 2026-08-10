import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { GH_CD } from "../data/seed";
import { goUser, contactHostHref } from "../lib/nav";
import CoverArt from "./CoverArt";

export default function PartyCard({ party }) {
  const { going, toggleGoing, displayRsvps, isSaved, toggleSave, addToCart, cart } =
    useStore();
  const { user } = useAuth();
  // "Hosted by you" is based on the signed-in user's id, not a flag —
  // so it's correct now that everyone's parties share one list.
  const isMine =
    !!party.userId && !!user ? party.userId === user.id : !!party.isUser;
  const isGoing = going.includes(party.id);
  const rsvpCount = displayRsvps(party);

  // ---- Party = ticket. Every listing carries its own pass: the price,
  // stock and design live on the party itself. When there's no ticket
  // (e.g. an idea still waiting in the pool), RSVP is the fallback.
  const design = party.ticketDesign && party.ticketDesign.enabled ? party.ticketDesign : null;
  const price = Number(design?.price ?? party.price ?? 0);
  const capacity = Number(design?.stock ?? 0);
  const ticketsLeft = Math.max(0, capacity - (party.ticketsSold ?? 0));
  // A party is a purchasable ticket only when it has an enabled ticket
  // design (the same rule communityTickets uses). Pool ideas without one
  // keep the RSVP action instead.
  const onSale = !!design;
  const soldOut = onSale && capacity > 0 && ticketsLeft === 0;
  const low = onSale && capacity > 0 && ticketsLeft > 0 && ticketsLeft <= 20;
  const inCart = cart.find((i) => i.id === party.id);

  // Shape the add-to-cart ticket from the party itself, matching the
  // snapshot the store expects (id, price, design, splits…).
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
        <CoverArt category={party.category} />
        <button
          className={`save-btn ${isSaved(party.id) ? "on" : ""}`}
          aria-label={isSaved(party.id) ? "Remove from saved" : "Save party"}
          title={isSaved(party.id) ? "Remove from saved" : "Save party"}
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
        {onSale ? (
          <button
            className="btn btn-sm"
            disabled={soldOut}
            onClick={(e) => {
              e.stopPropagation();
              addToCart(ticket);
            }}
          >
            {soldOut ? (
              "Sold out"
            ) : inCart ? (
              <>
                <i className="fa-solid fa-check" /> In cart
              </>
            ) : (
              <>
                Get ticket <i className="fa-solid fa-plus icon" />
              </>
            )}
          </button>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                fontSize: 13,
                letterSpacing: 1,
                textTransform: "uppercase",
                color: "var(--ink-soft)",
              }}
            >
              {rsvpCount} going
            </span>
            <button
              className={`btn btn-sm ${isGoing ? "" : "btn-outline"}`}
              onClick={(e) => {
                e.stopPropagation();
                toggleGoing(party.id);
              }}
            >
              {isGoing ? (
                <>
                  <i className="fa-solid fa-check" /> Going
                </>
              ) : (
                "RSVP"
              )}
            </button>
          </div>
        )}
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
