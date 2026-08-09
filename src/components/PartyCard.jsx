import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { GH_CD } from "../data/seed";
import { goUser, contactHostHref } from "../lib/nav";
import CoverArt from "./CoverArt";

export default function PartyCard({ party }) {
  const { going, toggleGoing, displayRsvps, isSaved, toggleSave } = useStore();
  const { user } = useAuth();
  // "Hosted by you" is based on the signed-in user's id, not a flag —
  // so it's correct now that everyone's parties share one list.
  const isMine =
    !!party.userId && !!user ? party.userId === user.id : !!party.isUser;
  const isGoing = going.includes(party.id);
  const rsvpCount = displayRsvps(party);

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
      <div className="card-foot">
        <span className="price" style={{ fontSize: 24 }}>
          {party.price === 0 ? "Free" : GH_CD(party.price)}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, letterSpacing: 1, textTransform: "uppercase", color: "var(--ink-soft)" }}>
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
