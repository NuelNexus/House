import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { useSocial } from "../context/SocialContext";
import Avatar from "../components/Avatar";
import CoverArt from "../components/CoverArt";
import ProfileItemModal from "../components/ProfileItemModal";
import { formatCount } from "../lib/fyp";

// Add friend is the connection model now (replaces Follow). The button
// walks through: Add friend → Request sent → Accept request → Friends.
function FriendButton({ status, busy, onAction }) {
  if (status === "friends") {
    return (
      <button className="btn btn-sm friend-btn friends" onClick={onAction} disabled={busy}>
        <i className="fa-solid fa-user-check" /> Friends
      </button>
    );
  }
  if (status === "outgoing") {
    return (
      <button className="btn btn-sm friend-btn requested" disabled>
        <i className="fa-solid fa-hourglass-half" /> Request sent
      </button>
    );
  }
  if (status === "incoming") {
    return (
      <button className="btn btn-sm friend-btn accept" onClick={onAction} disabled={busy}>
        <i className="fa-solid fa-user-check" /> Accept request
      </button>
    );
  }
  return (
    <button className="btn btn-sm friend-btn" onClick={onAction} disabled={busy}>
      <i className="fa-solid fa-user-plus" /> Add friend
    </button>
  );
}

const FILTERS = ["All", "Hypes", "Parties", "Reviews"];

const KIND_ICON = {
  party: "fa-people-group",
  review: "fa-star",
  hype: "fa-fire",
};

function categoryFor(name, tickets, allParties) {
  const t = tickets.find((x) => x.name === name);
  if (t) return t.category;
  const p = allParties.find((x) => x.title === name);
  if (p) return p.category;
  return "Rave";
}

export default function PublicProfile({ userId }) {
  const { tickets, allParties } = useStore();
  const { user, openAuth } = useAuth();
  const {
    followCounts,
    loadFollowCounts,
    friendStatus,
    friendRequests,
    sendFriendRequest,
    acceptFriendRequest,
    unfriend,
  } = useSocial();
  const [state, setState] = useState({
    loading: true,
    profile: null,
    parties: [],
    reviews: [],
    hypes: [],
  });
  const [filter, setFilter] = useState("All");
  const [detail, setDetail] = useState(null);
  const [friendBusy, setFriendBusy] = useState(false);

  const isSelf = user?.id === userId;
  const counts = followCounts[userId] || { followers: 0, following: 0 };
  const status = isSelf ? "none" : friendStatus(userId);

  useEffect(() => {
    loadFollowCounts(userId);
  }, [userId, loadFollowCounts]);

  const handleFriendAction = async () => {
    if (!user) {
      openAuth();
      return;
    }
    setFriendBusy(true);
    if (status === "friends") {
      await unfriend(userId);
    } else if (status === "incoming") {
      const req = friendRequests.find((r) => r.sender_id === userId);
      if (req) await acceptFriendRequest(req.id);
      else await sendFriendRequest(userId);
    } else {
      await sendFriendRequest(userId);
    }
    setFriendBusy(false);
  };

  useEffect(() => {
    let active = true;
    setState((s) => ({ ...s, loading: true }));
    (async () => {
      const [profRes, partiesRes, reviewsRes, hypesRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("name, bio, avatar, avatar_url")
          .eq("id", userId)
          .maybeSingle(),
        supabase
          .from("parties")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
        supabase
          .from("reviews")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
        (async () => {
          // Public clips only — group-only videos (published=false) stay
          // in the group and never surface on a profile.
          let r = await supabase
            .from("hypes")
            .select("*")
            .eq("user_id", userId)
            .is("recipient_id", null)
            .eq("published", true)
            .order("created_at", { ascending: false })
            .limit(50);
          if (r.error && /published/i.test(r.error.message || "")) {
            r = await supabase
              .from("hypes")
              .select("*")
              .eq("user_id", userId)
              .is("recipient_id", null)
              .order("created_at", { ascending: false })
              .limit(50);
          }
          return r;
        })(),
      ]);
      if (!active) return;
      const parties = (partiesRes.data ?? []).map((p) => ({
        ...p,
        isUser: false,
        userId: p.user_id,
      }));
      const reviews = (reviewsRes.data ?? []).map((r) => ({
        ...r,
        partyName: r.party_name ?? r.partyName,
        userId: r.user_id,
      }));
      setState({
        loading: false,
        profile: profRes.data || null,
        parties,
        reviews,
        hypes: hypesRes.data ?? [],
      });
    })().catch(() => {
      if (active) setState((s) => ({ ...s, loading: false }));
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const stats = useMemo(
    () => [
      { label: "Hypes", count: state.hypes.length },
      { label: "Parties", count: state.parties.length },
      { label: "Reviews", count: state.reviews.length },
      { label: "Followers", count: counts.followers },
      { label: "Following", count: counts.following },
    ],
    [state.parties, state.reviews, state.hypes, counts]
  );

  const items = useMemo(() => {
    const partyItems = state.parties.map((p) => ({
      kind: "party",
      id: p.id,
      ref: p,
      label: p.title,
      sub: `${p.rsvps ?? 0} going`,
      coverCat: p.category,
      cover: p.coverUrl || p.cover_url || null,
    }));
    const reviewItems = state.reviews.map((r) => ({
      kind: "review",
      id: r.id,
      ref: r,
      label: r.title || r.partyName,
      sub: `${r.rating}/5`,
      coverCat: categoryFor(r.partyName, tickets, allParties),
    }));
    const hypeItems = state.hypes.map((h) => ({
      kind: "hype",
      id: h.id,
      ref: h,
      label: h.caption || "Hype",
      sub: `${formatCount(h.views || 0)} views`,
      coverCat: null,
      videoUrl: h.video_url,
    }));
    return [...hypeItems, ...partyItems, ...reviewItems];
  }, [state.parties, state.reviews, state.hypes, tickets, allParties]);

  const visible = useMemo(
    () =>
      filter === "All"
        ? items
        : items.filter((i) => i.kind === filter.toLowerCase()),
    [items, filter]
  );

  // Email intentionally stays out of the public query — just show the name.
  const name = state.profile?.name || "FesGH Member";

  if (state.loading) {
    return (
      <div className="page profile-page">
        <div className="profile-loader" aria-label="Loading profile" />
      </div>
    );
  }

  const empty =
    !state.profile &&
    state.parties.length === 0 &&
    state.reviews.length === 0 &&
    state.hypes.length === 0;

  return (
    <div className="page profile-page">            <div className="profile-kicker">Public profile</div>

      <div className="profile-wrap">
        {empty ? (
          <div className="empty-state">
            <i className="fa-solid fa-user-slash" />
            <h3>Profile not found</h3>
            <p>This person hasn't set up a FesGH profile yet.</p>
          </div>
        ) : (
          <>
            <header className="profile-head">
              <div className="profile-avatar">
                <Avatar
                  name={name}
                  seed={state.profile?.avatar ?? 0}
                  src={state.profile?.avatar_url || null}
                  size={168}
                />
              </div>

              <div className="profile-user-settings">
                <h1 className="profile-user-name">{name}</h1>
                <span className="member-badge">
                  <i className="fa-solid fa-circle-check" aria-hidden="true" />
                  FesGH member
                </span>
                {!isSelf && (
                  <div className="profile-actions">
                    <FriendButton
                      status={status}
                      busy={friendBusy}
                      onAction={handleFriendAction}
                    />
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => {
                        if (!user) {
                          openAuth();
                          return;
                        }
                        window.location.hash = `messages/new?to=${userId}`;
                      }}
                    >
                      <i className="fa-solid fa-comment-dots" /> Message
                    </button>
                  </div>
                )}
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
                  <span className="profile-real-name">{name}</span>
                  {state.profile?.bio}
                </p>
              </div>
            </header>

            <div className="gallery-filter" role="tablist" aria-label="Filter content">
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
                  {filter === "Hypes"
                    ? "This creator hasn't posted any hype clips yet."
                    : "Nothing to show in this section."}
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
                    onClick={() => setDetail(item)}
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
          </>
        )}
      </div>

      {detail && <ProfileItemModal item={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
