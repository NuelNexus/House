import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { useSocial } from "../context/SocialContext";
import Avatar from "../components/Avatar";
import CoverArt from "../components/CoverArt";
import ProfileItemModal from "../components/ProfileItemModal";

const FILTERS = ["All", "Parties", "Reviews"];

const KIND_ICON = {
  party: "fa-people-group",
  review: "fa-star",
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
  const { isFollowing, toggleFollow, followCounts, loadFollowCounts } = useSocial();
  const [state, setState] = useState({
    loading: true,
    profile: null,
    parties: [],
    reviews: [],
  });
  const [filter, setFilter] = useState("All");
  const [detail, setDetail] = useState(null);
  const [followBusy, setFollowBusy] = useState(false);

  const isSelf = user?.id === userId;
  const counts = followCounts[userId] || { followers: 0, following: 0 };

  useEffect(() => {
    loadFollowCounts(userId);
  }, [userId, loadFollowCounts]);

  const handleFollow = async () => {
    if (!user) {
      openAuth();
      return;
    }
    setFollowBusy(true);
    await toggleFollow(userId);
    setFollowBusy(false);
  };

  useEffect(() => {
    let active = true;
    setState((s) => ({ ...s, loading: true }));
    (async () => {
      const [profRes, partiesRes, reviewsRes] = await Promise.all([
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
      { label: "Parties", count: state.parties.length },
      { label: "Reviews", count: state.reviews.length },
      { label: "Followers", count: counts.followers },
      { label: "Following", count: counts.following },
    ],
    [state.parties, state.reviews, counts]
  );

  const items = useMemo(() => {
    const partyItems = state.parties.map((p) => ({
      kind: "party",
      id: p.id,
      ref: p,
      label: p.title,
      sub: `${p.rsvps ?? 0} going`,
      coverCat: p.category,
    }));
    const reviewItems = state.reviews.map((r) => ({
      kind: "review",
      id: r.id,
      ref: r,
      label: r.title || r.partyName,
      sub: `${r.rating}/5`,
      coverCat: categoryFor(r.partyName, tickets, allParties),
    }));
    return [...partyItems, ...reviewItems];
  }, [state.parties, state.reviews, tickets, allParties]);

  const visible = useMemo(
    () =>
      filter === "All"
        ? items
        : items.filter((i) => i.kind === filter.toLowerCase()),
    [items, filter]
  );

  // Email intentionally stays out of the public query — just show the name.
  const name = state.profile?.name || "Festivity Member";

  if (state.loading) {
    return (
      <div className="page profile-page">
        <div className="profile-loader" aria-label="Loading profile" />
      </div>
    );
  }

  const empty =
    !state.profile && state.parties.length === 0 && state.reviews.length === 0;

  return (
    <div className="page profile-page">
      <div className="profile-kicker">Public profile</div>

      <div className="profile-wrap">
        {empty ? (
          <div className="empty-state">
            <i className="fa-solid fa-user-slash" />
            <h3>Profile not found</h3>
            <p>This person hasn't set up a Festivity profile yet.</p>
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
                  Festivity member
                </span>
                {!isSelf && (
                  <div className="profile-actions">
                    <button
                      className={`btn btn-sm follow-btn ${
                        isFollowing(userId) ? "following" : ""
                      }`}
                      disabled={followBusy}
                      onClick={handleFollow}
                    >
                      {isFollowing(userId) ? (
                        <>
                          <i className="fa-solid fa-user-check" /> Following
                        </>
                      ) : (
                        <>
                          <i className="fa-solid fa-user-plus" /> Follow
                        </>
                      )}
                    </button>
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
                  {state.profile?.bio ||
                    "On the Festivity GH scene — posting parties and keeping the vibes honest."}
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
                <p>Nothing to show in this section.</p>
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
                    <CoverArt category={item.coverCat} className="gallery-image" />
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
