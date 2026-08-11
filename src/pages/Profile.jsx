import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { useSocial } from "../context/SocialContext";
import Avatar from "../components/Avatar";
import CoverArt from "../components/CoverArt";
import ProfileItemModal from "../components/ProfileItemModal";
import HypePlayerSlide from "../components/HypePlayerSlide";
import TicketWall from "../components/TicketWall";
import { formatCount } from "../lib/fyp";

const FILTERS = ["All", "Saved", "Hypes", "Hyped", "Parties", "Reviews", "Tickets"];

const KIND_ICON = {
  party: "fa-people-group",
  review: "fa-star",
  ticket: "fa-ticket",
  hype: "fa-fire",
  hyped: "fa-fire",
};

function categoryFor(name, tickets, allParties) {
  const t = tickets.find((x) => x.name === name);
  if (t) return t.category;
  const p = allParties.find((x) => x.title === name);
  if (p) return p.category;
  return "Rave";
}

export default function Profile({ setTab }) {
  const { user, name, profile, authLoading, openAuth } = useAuth();
  const {
    userParties,
    userReviews,
    myTickets,
    tickets,
    allParties,
    saved,
    toggleSave,
    deleteParty,
    deleteReview,
    deleteTicket,
  } = useStore();
  const { following, myFollowers, myHypes, hypedHypes, deleteHype } = useSocial();
  const [filter, setFilter] = useState("All");
  const [detail, setDetail] = useState(null);
  const [rewatch, setRewatch] = useState(null); // hype to replay full-screen
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!authLoading) {
      const t = setTimeout(() => setReady(true), 350);
      return () => clearTimeout(t);
    }
    setReady(false);
    return undefined;
  }, [authLoading]);

  const stats = useMemo(
    () => [
      { label: "Parties", count: userParties.length },
      { label: "Reviews", count: userReviews.length },
      { label: "Tickets", count: myTickets.length },
      { label: "Followers", count: myFollowers },
      { label: "Following", count: following.length },
    ],
    [userParties, userReviews, myTickets, myFollowers, following]
  );

  // A ticket's gallery-tile shape — reused by the wall's open action
  // so the pass modal gets the exact same item.
  const ticketItem = useCallback(
    (t) => ({
      kind: "ticket",
      id: t.code,
      ref: t,
      label: t.name,
      sub: `GH₵ ${t.price}`,
      coverCat: categoryFor(t.name, tickets, allParties),
    }),
    [tickets, allParties]
  );

  const items = useMemo(() => {
    const partyItems = userParties.map((p) => ({
      kind: "party",
      id: p.id,
      ref: p,
      label: p.title,
      // Proposed ideas haven't gone public yet — they're waiting for an
      // approved host to pick them up and set a price.
      sub:
        (p.status ?? "live") === "proposed"
          ? "Proposed · waiting for a host"
          : `${p.rsvps} going`,
      coverCat: p.category,
      cover: p.coverUrl || p.cover_url || null,
    }));
    const reviewItems = userReviews.map((r) => ({
      kind: "review",
      id: r.id,
      ref: r,
      label: r.title || r.partyName,
      sub: `${r.rating}/5`,
      coverCat: categoryFor(r.partyName, tickets, allParties),
    }));
    const ticketItems = myTickets.map(ticketItem);
    // Saved parties (wishlist) from anywhere on the scene.
    const savedItems = saved
      .map((id) => allParties.find((p) => p.id === id))
      .filter(Boolean)
      .map((p) => ({
        kind: "saved",
        id: p.id,
        ref: p,
        label: p.title,
        sub: `${p.rsvps} going`,
        coverCat: p.category,
        cover: p.coverUrl || p.cover_url || null,
      }));
    // My own posted clips — with the view count they've earned.
    const hypeItems = myHypes.map((h) => ({
      kind: "hype",
      id: h.id,
      ref: h,
      label: h.caption || "Hype",
      sub: `${formatCount(h.views || 0)} views`,
      coverCat: null,
      videoUrl: h.video_url,
    }));
    // Clips I've watched — they leave the feed and land here to rewatch.
    const hypedItems = hypedHypes.map((h) => ({
      kind: "hyped",
      id: h.id,
      ref: h,
      label: h.caption || `@${h.author?.name || "Hype"}`,
      sub: `${formatCount(h.views || 0)} views`, // total views across everyone
      coverCat: null,
      videoUrl: h.video_url,
    }));
    return [...hypeItems, ...hypedItems, ...savedItems, ...partyItems, ...reviewItems, ...ticketItems];
  }, [userParties, userReviews, myTickets, tickets, allParties, saved, myHypes, hypedHypes, ticketItem]);

  // The default "All" view shows only YOUR content. Other people's
  // videos you've watched (the rewatch history) stay on the dedicated
  // "Hyped" tab so the profile never looks like it's showing videos
  // you didn't post.
  const visible = useMemo(
    () =>
      filter === "All"
        ? items.filter((i) => i.kind !== "hyped")
        : items.filter((i) => i.kind === filter.toLowerCase()),
    [items, filter]
  );

  const removeItem = (item) => {
    if (item.kind === "saved") toggleSave(item.id);
    else if (item.kind === "party") deleteParty(item.id);
    else if (item.kind === "review") deleteReview(item.id);
    else if (item.kind === "hype") {
      deleteHype(item.id, item.ref?.video_url).catch(() => {});
    } else if (item.kind === "ticket") deleteTicket(item.id);
    // "hyped" rows are other people's clips — nothing to delete.
    if (detail?.id === item.id) setDetail(null);
  };

  const openItem = (item) => {
    if (item.kind === "saved") {
      window.location.hash = `party/${item.id}`;
      return;
    }
    if (item.kind === "hype") {
      window.location.hash = "hype";
      return;
    }
    if (item.kind === "hyped") {
      setRewatch(item.ref);
      return;
    }
    setDetail(item);
  };

  // ----- Signed-out gate -------------------------------------
  if (!authLoading && !user) {
    return (
      <div className="page profile-page">
        <div className="profile-gate card">
          <Avatar name="Guest" seed={2} size={84} />
          <h2>Your profile lives here</h2>
          <p>
            Sign in to see your posted parties, written reviews and every pass
            you've bought.
          </p>
          <button className="btn" onClick={() => openAuth()}>
            <i className="fa-solid fa-right-to-bracket icon" /> Sign in
          </button>
        </div>
      </div>
    );
  }

  // ----- Loading ----------------------------------------------
  if (!ready) {
    return (
      <div className="page profile-page">
        <div className="profile-loader" aria-label="Loading profile" />
      </div>
    );
  }

  return (
    <div className="page profile-page">
      <div className="profile-kicker">Your corner of the scene</div>

      <div className="profile-wrap">
        {/* Profile header */}
        <header className="profile-head">
          <div className="profile-avatar">
            <Avatar
              name={profile?.name || name}
              seed={profile?.avatar}
              src={profile?.avatarUrl || null}
              size={168}
            />
          </div>

          <div className="profile-user-settings">
            <h1 className="profile-user-name">{profile?.name || name}</h1>
            <button className="btn profile-edit-btn" onClick={() => setTab("profile/edit")}>
              Edit Profile
            </button>
            <button
              className="btn profile-edit-btn"
              title="Customize your theme"
              onClick={() => setTab("appearance")}
            >
              <i className="fa-solid fa-palette" aria-hidden="true" /> Theme
            </button>
            <button
              className="btn profile-settings-btn"
              aria-label="Profile settings"
              onClick={() => setTab("profile/edit")}
            >
              <i className="fa-solid fa-gear" aria-hidden="true" />
            </button>
          </div>

          <div className="profile-stats">
            <ul>
              {stats.map((s) => (
                <li key={s.label}>
                  <span className="profile-stat-count">{s.count}</span> {s.label}
                </li>
              ))}
            </ul>
          </div>

          <div className="profile-bio">
            <p>
              <span className="profile-real-name">{profile?.name || name}</span>
              {profile?.bio}
            </p>
            <p className="profile-handle">
              <i className="fa-solid fa-at" aria-hidden="true" /> {user?.email}
            </p>
          </div>
        </header>

        {/* Your Tickets — the pass wall. Full grid on desktop, one big
            swipeable pass at a time on mobile. The gallery's Tickets
            chip below still shows the compact tiles. */}
        {filter !== "Tickets" && (
          <TicketWall tickets={myTickets} onOpen={(t) => setDetail(ticketItem(t))} />
        )}

        {/* Gallery */}
        <div className="gallery-filter" role="tablist" aria-label="Filter your moments">
          {FILTERS.map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={filter === f}
              className={`chip ${filter === f ? "active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <div className="empty-state">
            <i className="fa-solid fa-images" />
            <h3>Nothing here yet</h3>
            <p>
              {filter === "Saved"
                ? "Tap the heart on any party to keep it here."
                : filter === "Hypes"
                ? "Post a hype from the Hype tab and your clips will appear here with their view counts."
                : filter === "Hyped"
                ? "Videos you watch on the Hype tab move here so you can rewatch them anytime."
                : filter === "Parties"
                ? "Post your first party from the Parties tab."
                : filter === "Reviews"
                ? "Write a review after your next party."
                : filter === "Tickets"
                ? "Buy a ticket and your pass will appear in the ticket wall above — and here in the gallery."
                : "Your posts, reviews and tickets will show up here."}
            </p>
          </div>
        ) : (
          <div className="gallery">
            {visible.map((item, i) => (
              <div
                key={item.id}
                className="gallery-item"
                tabIndex={0}
                role="button"
                aria-label={`Open ${item.label}`}
                style={{ animationDelay: `${Math.min(i, 10) * 50}ms` }}
                onClick={() => openItem(item)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openItem(item);
                  }
                }}
              >
                {item.kind === "hype" || item.kind === "hyped" ? (
                  <video
                    className="gallery-image"
                    src={item.videoUrl}
                    muted
                    loop
                    playsInline
                    preload="metadata"
                  />
                ) : item.cover ? (
                  <img
                    className="gallery-image cover-img"
                    src={item.cover}
                    alt=""
                    loading="lazy"
                  />
                ) : (
                  <CoverArt category={item.coverCat} className="gallery-image" />
                )}
                {item.kind !== "hyped" && (
                  <button
                    className="gallery-item-del"
                    aria-label={`Delete ${item.label}`}
                    title="Delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeItem(item);
                    }}
                  >
                    <i className="fa-solid fa-trash-can" aria-hidden="true" />
                  </button>
                )}
                <span className="gallery-item-kind" aria-hidden="true">
                  <i className={`fa-solid ${KIND_ICON[item.kind]}`} />
                </span>
                <div className="gallery-item-info">
                  <ul>
                    <li className="gallery-item-likes">
                      <span className="visually-hidden">Details:</span>
                      <i className={`fa-solid ${KIND_ICON[item.kind]}`} aria-hidden="true" />
                      {item.sub}
                    </li>
                    <li className="gallery-item-comments">
                      <span className="visually-hidden">Type:</span>
                      <i className="fa-solid fa-magnifying-glass-plus" aria-hidden="true" />
                    </li>
                  </ul>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="gallery-hint">
          Tap any tile to open it · your parties, reviews, hypes and passes sync
          across devices when you're signed in.
        </p>
      </div>

      {detail && (
        <ProfileItemModal
          item={detail}
          deletable
          onClose={() => setDetail(null)}
        />
      )}

      {/* Full-screen rewatch player for the Hyped tab */}
      {rewatch && (
        <div className="ms-hype-player" onClick={() => setRewatch(null)}>
          <HypePlayerSlide
            hype={rewatch}
            author={rewatch.author}
            onClose={() => setRewatch(null)}
          />
        </div>
      )}
    </div>
  );
}
