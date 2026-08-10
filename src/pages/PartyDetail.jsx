import { useMemo } from "react";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { GH_CD } from "../data/seed";
import { contactHostHref } from "../lib/nav";
import { useBuyNow } from "../hooks/useBuyNow";
import CoverArt from "../components/CoverArt";
import ReviewCard from "../components/ReviewCard";
import Reveal from "../components/Reveal";

export function shareParty(id, title) {
  const url = `${window.location.origin}${window.location.pathname}#party/${id}`;
  try {
    navigator.clipboard?.writeText(url);
  } catch {
    /* clipboard unavailable */
  }
  return url;
}

const STAR_LABELS = ["", "Terrible", "Meh", "Decent", "Great", "Unforgettable"];

export default function PartyDetail({ partyId, setTab }) {
  const {
    allParties,
    allTickets,
    allReviews,
    isSaved,
    toggleSave,
    notify,
  } = useStore();
  const { ensureAuth } = useAuth();
  const { buy, buyingId } = useBuyNow();

  const party = useMemo(() => {
    const base = allParties.find((p) => p.id === partyId);
    const ticket = allTickets.find((t) => t.id === partyId);
    // Parties that are selling tickets show the ticket view so the
    // "Get tickets" action (and stock) are available here.
    if (ticket && ticket.isParty) return ticket;
    return base || ticket || null;
  }, [allParties, allTickets, partyId]);

  // Reviews are matched by the event's name — user reviews flow through
  // the same list, so this is always the real, current data.
  const reviews = useMemo(
    () => allReviews.filter((r) => r.partyName === (party?.title || party?.name)),
    [allReviews, party]
  );

  const average = reviews.length
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : "0.0";

  const distribution = useMemo(() => {
    const counts = [0, 0, 0, 0, 0];
    reviews.forEach((r) => {
      if (r.rating >= 1 && r.rating <= 5) counts[r.rating - 1] += 1;
    });
    return counts.map((c, i) => ({ stars: i + 1, count: c })).reverse();
  }, [reviews]);

  const openReview = () => {
    const title = party?.title || party?.name;
    if (!title) return;
    // Pass the full deep link as the auth "next" destination so a
    // sign-in detour still lands on this party's review form.
    const dest = `reviews/new?party=${encodeURIComponent(title)}&back=${partyId}`;
    if (!ensureAuth(dest)) return;
    setTab(dest);
  };

  if (!party) {
    return (
      <div className="page">
        <button className="back-link" onClick={() => setTab("parties")}>
          <i className="fa-solid fa-arrow-left" /> Back to parties
        </button>
        <div className="empty-state">
          <i className="fa-solid fa-champagne-glasses" />
          <h3>Party not found</h3>
          <p>This event may have been removed.</p>
        </div>
      </div>
    );
  }

  const title = party.title || party.name;
  // The AFFILIATE's sale price is the source of truth — the ticket
  // design's "door price" defaults to "0" and must never make a priced
  // listing look free.
  const price =
    Number(party.price) || Number(party.ticketDesign?.price) || 0;

  const hostName = party.hostName || party.host;
  // For a repost the party organizer is the ORIGINAL host (hostId);
  // otherwise the poster (userId) is the host.
  const hostId = party.hostId || party.userId;

  return (
    <div className="page">
      <button className="back-link" onClick={() => setTab("parties")}>
        <i className="fa-solid fa-arrow-left" /> Back to parties
      </button>

      <header className="page-head reveal in">
        <div className="kicker">{party.category}</div>
        <h1>
          {title}
          <span className="outline">.</span>
        </h1>
        <p className="lede">
          {party.date || party.location} · {party.location}
        </p>
      </header>

      <Reveal>
        <div className="party-detail">
          <div className="pd-hero">
            <CoverArt category={party.category} className="pd-cover" />
          </div>

          <div className="pd-body">
            <div className="pd-meta">
              <span>
                <i className="fa-regular fa-calendar" /> {party.date}
              </span>
              <span>
                <i className="fa-solid fa-location-dot" /> {party.location}
              </span>
              <span>
                <i className="fa-solid fa-user" /> Hosted by {hostName}
              </span>
              <span className="pd-price">
                {price === 0 ? "Free" : GH_CD(price)}
              </span>
            </div>

            {party.lineup && (
              <p className="lineup">
                <b>Lineup:</b> {party.lineup.join(" · ")}
              </p>
            )}

            <p className="pd-desc">{party.vibe || party.description}</p>

            <div className="pd-actions">
              <button
                className={`btn btn-outline pd-save ${isSaved(party.id) ? "on" : ""}`}
                aria-label={isSaved(party.id) ? "Remove from saved" : "Save party"}
                title={isSaved(party.id) ? "Remove from saved" : "Save party"}
                onClick={() => toggleSave(party.id)}
              >
                <i className="fa-solid fa-heart icon" />{" "}
                {isSaved(party.id) ? "Saved" : "Save"}
              </button>
              <button
                className="btn"
                disabled={buyingId === party.id}
                onClick={() => buy(party)}
              >
                {buyingId === party.id ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin icon" /> Paying…
                  </>
                ) : price === 0 ? (
                  <>
                    <i className="fa-solid fa-ticket icon" /> Get free ticket
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-lock icon" /> Get ticket · {GH_CD(price)}
                  </>
                )}
              </button>
              <a
                className="btn btn-outline"
                href={contactHostHref({
                  hostId,
                  hostName,
                  eventId: party.id,
                  eventName: title,
                  kind: "contact",
                })}
              >
                <i className="fa-regular fa-envelope icon" /> Contact the host
              </a>
              <a
                className="btn btn-outline"
                href={contactHostHref({
                  hostId,
                  hostName,
                  eventId: party.id,
                  eventName: title,
                  kind: "offer",
                })}
              >
                <i className="fa-solid fa-briefcase icon" /> Offer service
              </a>
              <button
                className="btn btn-outline"
                aria-label="Copy link to this party"
                title="Copy link"
                onClick={() => {
                  shareParty(party.id, title);
                  notify("Link copied — share it with your crew");
                }}
              >
                <i className="fa-solid fa-share-nodes icon" /> Share
              </button>
            </div>
          </div>
        </div>
      </Reveal>

      {/* Reviews — merged into the party */}
      <Reveal>
        <div className="pd-reviews-head">
          <h2>
            Reviews <span className="outline">({reviews.length})</span>
          </h2>
          <button className="btn btn-sm" onClick={openReview}>
            <i className="fa-solid fa-pen icon" /> Write a review
          </button>
        </div>
      </Reveal>

      <Reveal>
        <div className="summary-panel pd-summary">
          <div className="score-side">
            <div className="big-score">
              {average}
              <small> / 5</small>
            </div>
            <div className="stars" aria-label={`Average rating ${average} out of 5`}>
              {[1, 2, 3, 4, 5].map((n) => (
                <i
                  key={n}
                  className={`${n <= Math.round(average) ? "fa-solid" : "far"} fa-star`}
                  aria-hidden="true"
                />
              ))}
            </div>
            <div className="count">
              {reviews.length} review{reviews.length === 1 ? "" : "s"} ·{" "}
              {reviews.length ? STAR_LABELS[Math.round(average)] : "Be the first"}
            </div>
          </div>
          <div className="bars">
            {distribution.map(({ stars, count }) => (
              <div className="bar-row" key={stars}>
                <span>
                  {stars} <i className="fa-solid fa-star" style={{ fontSize: 11 }} />
                </span>
                <div className="bar">
                  <div
                    className="fill"
                    style={{
                      width: `${reviews.length ? (count / reviews.length) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span>{count}</span>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      {reviews.length === 0 ? (
        <Reveal>
          <div className="empty-state">
            <i className="fa-solid fa-comment-dots" />
            <h3>No reviews yet</h3>
            <p>Nobody has reviewed this party yet — be the first to share the vibes.</p>
          </div>
        </Reveal>
      ) : (
        <div className="grid">
          {reviews.map((r, i) => (
            <Reveal key={r.id} delay={Math.min(i, 8) * 60}>
              <ReviewCard review={r} index={i} />
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}
