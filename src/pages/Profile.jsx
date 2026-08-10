import { useEffect, useMemo, useState } from "react";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { useSocial } from "../context/SocialContext";
import Avatar from "../components/Avatar";
import CoverArt from "../components/CoverArt";
import ProfileItemModal from "../components/ProfileItemModal";
import { formatCount } from "../lib/fyp";

const FILTERS = ["All", "Saved", "Hypes", "Parties", "Reviews", "Tickets"];

const KIND_ICON = {
  party: "fa-people-group",
  review: "fa-star",
  ticket: "fa-ticket",
  hype: "fa-fire",
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
  const { following, myFollowers, myHypes } = useSocial();
  const [filter, setFilter] = useState("All");
  const [detail, setDetail] = useState(null);
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

  const items = useMemo(() => {
    const partyItems = userParties.map((p) => ({
      kind: "party",
      id: p.id,
      ref: p,
      label: p.title,
      sub: `${p.rsvps} going`,
      coverCat: p.category,
    }));
    const reviewItems = userReviews.map((r) => ({
      kind: "review",
      id: r.id,
      ref: r,
      label: r.title || r.partyName,
      sub: `${r.rating}/5`,
      coverCat: categoryFor(r.partyName, tickets, allParties),
    }));
    const ticketItems = myTickets.map((t) => ({
      kind: "ticket",
      id: t.code,
      ref: t,
      label: t.name,
      sub: `GH₵ ${t.price}`,
      coverCat: categoryFor(t.name, tickets, allParties),
    }));
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
    return [...hypeItems, ...savedItems, ...partyItems, ...reviewItems, ...ticketItems];
  }, [userParties, userReviews, myTickets, tickets, allParties, saved, myHypes]);

  const visible = useMemo(
    () =>
      filter === "All"
        ? items
        : items.filter((i) => i.kind === filter.toLowerCase()),
    [items, filter]
  );

  const removeItem = (item) => {
    if (item.kind === "saved") toggleSave(item.id);
    else if (item.kind === "party") deleteParty(item.id);
    else if (item.kind === "review") deleteReview(item.id);
    else deleteTicket(item.id);
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
                : filter === "Parties"
                ? "Post your first party from the Parties tab."
                : filter === "Reviews"
                ? "Write a review after your next party."
                : filter === "Tickets"
                ? "Buy a ticket and your passes will appear here."
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
                    setDetail(item);
                  }
                }}
              >
                {item.kind === "hype" ? (
                  <video
                    className="gallery-image"
                    src={item.videoUrl}
                    muted
                    loop
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  <CoverArt category={item.coverCat} className="gallery-image" />
                )}
                {item.kind !== "hype" && (
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
    </div>
  );
}
