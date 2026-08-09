import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useSocial } from "../context/SocialContext";
import { useStore } from "../context/StoreContext";
import Avatar from "../components/Avatar";
import VideoRecorder from "../components/VideoRecorder";
import HypeSidebar from "../components/HypeSidebar";

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

// One TikTok-style slide: letterboxed video, bottom-left info,
// right action rail (avatar + follow, like, share, spinning disc).
// Photos and videos both live in the hype feed — a snap posted from the
// camera is an image, everything else is a clip. Storage URLs end in the
// file extension, so that's all we need to tell them apart.
function isImageHype(hype) {
  return /\.(jpe?g|png|gif|webp)(\?|$)/i.test(hype.video_url || "");
}

function HypeSlide({ hype, isActive, openProfile }) {
  const videoRef = useRef(null);
  const [paused, setPaused] = useState(true);
  const image = isImageHype(hype);
  const [liked, setLiked] = useState(() => {
    try {
      return localStorage.getItem(`hl:${hype.id}`) === "1";
    } catch {
      return false;
    }
  });
  const { user, openAuth } = useAuth();
  const { isFollowing, toggleFollow, followCounts, loadFollowCounts } = useSocial();
  const { notify } = useStore();
  const authorId = hype.user_id;

  useEffect(() => {
    if (authorId) loadFollowCounts(authorId);
  }, [authorId, loadFollowCounts]);

  // Only the active slide plays (photos just sit there).
  useEffect(() => {
    if (image) return;
    const v = videoRef.current;
    if (!v) return;
    if (isActive) {
      v.play().then(() => setPaused(false)).catch(() => {});
    } else {
      v.pause();
      setPaused(true);
    }
  }, [isActive, image]);

  const togglePlay = () => {
    if (image) return;
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
      setPaused(false);
    } else {
      v.pause();
      setPaused(true);
    }
  };

  const doFollow = async (e) => {
    // Never let this bubble up to the avatar's profile navigation.
    if (e) e.stopPropagation();
    if (!user) { openAuth(); return; }
    if (authorId === user.id) { notify("That's you!"); return; }
    await toggleFollow(authorId);
  };

  const doLike = () => {
    const next = !liked;
    setLiked(next);
    try {
      localStorage.setItem(`hl:${hype.id}`, next ? "1" : "0");
    } catch {
      /* storage unavailable — like still works for this session */
    }
    notify(next ? "Hype liked 🔥" : "Like removed");
  };

  const doShare = async () => {
    const url = `${window.location.origin}${window.location.pathname}#hype`;
    try {
      await navigator.clipboard.writeText(url);
      notify("Hype link copied — share it!");
    } catch {
      notify("Couldn't copy the link");
    }
  };

  const isMe = authorId === user?.id;
  const follows = isFollowing(authorId);
  const followCount = followCounts[authorId]?.followers ?? 0;
  const authorName = hype.author?.name || "Festivity member";

  return (
    <div className={`hype-feed-slide${paused && !image ? " paused" : ""}`} onClick={togglePlay}>
      {image ? (
        <img className="hype-slide-img" src={hype.video_url} alt={hype.caption || "Hype"} />
      ) : (
        <video
          ref={videoRef}
          src={hype.video_url}
          muted
          loop
          playsInline
          preload="metadata"
        />
      )}
      {!image && (
        <div className="hype-slide-play">
          <i className="fa-solid fa-play" />
        </div>
      )}

      {hype.recipient_id && <span className="hype-slide-private">Private</span>}

      {/* Bottom-left creator info */}
      <div className="hype-slide-info">
        <div className="hype-slide-author">
          <button
            className="hype-slide-name"
            onClick={(e) => {
              e.stopPropagation();
              openProfile(authorId);
            }}
          >
            @{authorName}
          </button>
          <span className="time">{timeAgo(hype.created_at)}</span>
        </div>
        {hype.caption && <div className="hype-slide-caption">{hype.caption}</div>}
        <div className="hype-slide-song">
          <i className="fa-solid fa-music" /> {authorName} · original hype
        </div>
      </div>

      {/* Right action rail */}
      <div className="hype-rail" onClick={(e) => e.stopPropagation()}>
        <div className="hype-rail-creator">
          <button
            className="hype-rail-avatar"
            aria-label={`View ${authorName}'s profile`}
            onClick={() => openProfile(authorId)}
          >
            <Avatar
              name={authorName}
              seed={hype.author?.avatar ?? 0}
              src={hype.author?.avatar_url || null}
              size={46}
            />
            {!isMe && (
              <span
                className={`hype-rail-follow${follows ? " following" : ""}`}
                role="button"
                aria-label={follows ? "Unfollow" : "Follow"}
                onClick={doFollow}
              >
                <i className={`fa-solid ${follows ? "fa-check" : "fa-plus"}`} />
              </span>
            )}
          </button>
          {!isMe && (
            <>
              <span className="hype-rail-label">
                {follows ? "Following" : "Follow"}
              </span>
              {followCount > 0 && (
                <span className="hype-rail-count">{followCount}</span>
              )}
            </>
          )}
        </div>

        <div className="hype-rail-actions">
          <button
            className={`hype-rail-btn${liked ? " liked" : ""}`}
            aria-label="Like"
            onClick={doLike}
          >
            <i className="fa-solid fa-heart" />
            <span className="hype-rail-label">Like</span>
          </button>
          <button className="hype-rail-btn" aria-label="Share" onClick={doShare}>
            <i className="fa-solid fa-share" />
            <span className="hype-rail-label">Share</span>
          </button>
        </div>

        <div className="hype-rail-disc" aria-hidden="true">
          <i className="fa-solid fa-compact-disc" />
        </div>
      </div>
    </div>
  );
}

export default function Hype({ send, q, setTab }) {
  const { user, ensureAuth } = useAuth();
  const {
    hypeFeed,
    hypeLoading,
    postHype,
    people,
    loadPeople,
    following,
  } = useSocial();
  const [mode, setMode] = useState(null); // "post" | "send"
  const [friend, setFriend] = useState(null);
  const [query, setQuery] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [feedTab, setFeedTab] = useState("foryou"); // "foryou" | "following"
  const wheelLock = useRef(0);
  const touchStartY = useRef(null);

  // Following tab filters the feed to creators you follow.
  const visibleFeed = useMemo(
    () =>
      feedTab === "following"
        ? hypeFeed.filter((h) => following.includes(h.user_id))
        : hypeFeed,
    [hypeFeed, following, feedTab]
  );

  // Reset to the top whenever the visible feed changes.
  useEffect(() => {
    setCurrentIndex(0);
  }, [visibleFeed]);

  const next = () => {
    if (!visibleFeed.length) return;
    setCurrentIndex((i) => Math.min(i + 1, visibleFeed.length - 1));
  };
  const prev = () => {
    if (!visibleFeed.length) return;
    setCurrentIndex((i) => Math.max(i - 1, 0));
  };

  // Deep link #hype/send?to=<id> opens the send flow with a friend picked.
  useEffect(() => {
    if (send) {
      const target = q.to
        ? people.find((p) => p.id === q.to) || { id: q.to, name: q.host || "a friend" }
        : null;
      setMode("send");
      setFriend(target);
    }
  }, [send, q, people]);

  // Keyboard navigation (ignored while the recorder overlay is open).
  useEffect(() => {
    if (mode) return undefined;
    const onKey = (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowRight") next();
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, visibleFeed.length]);

  // Mouse-wheel navigation — one slide per tick, throttled.
  useEffect(() => {
    if (mode) return undefined;
    const onWheel = (e) => {
      if (Math.abs(e.deltaY) < 12) return;
      const now = Date.now();
      if (now - wheelLock.current < 600) return;
      wheelLock.current = now;
      if (e.deltaY > 0) next();
      else prev();
    };
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => window.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, visibleFeed.length]);

  // Touch swipe navigation for phones (ignored while the overlay is open).
  const onTouchStart = (e) => {
    if (mode) return;
    touchStartY.current = e.touches[0].clientY;
  };
  const onTouchEnd = (e) => {
    if (mode) return;
    if (touchStartY.current == null) return;
    const dy = touchStartY.current - e.changedTouches[0].clientY;
    touchStartY.current = null;
    if (Math.abs(dy) < 40) return;
    if (dy > 0) next();
    else prev();
  };

  const startPost = () => {
    if (!ensureAuth()) return;
    setMode("post");
  };

  const startSend = () => {
    if (!ensureAuth()) return;
    if (!people.length) loadPeople();
    setMode("send");
    setFriend(null);
  };

  const handleDone = async ({ blob, name, caption, kind }) => {
    await postHype({
      blob,
      name,
      caption,
      recipientId: mode === "send" && friend ? friend.id : null,
      kind,
    });
    setMode(null);
    setFriend(null);
  };

  const matches = people.filter(
    (p) => p.id !== user?.id && p.name.toLowerCase().includes(query.toLowerCase())
  );

  const isEmpty = visibleFeed.length === 0;

  return (
    <div className="hype-layout">
      <HypeSidebar tab="hype" setTab={setTab} onPost={startPost} onSend={startSend} />

      <div
        className="hype-feed-area"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* For You / Following pills */}
        <div className="hype-foryou">
          <button
            className={feedTab === "following" ? "active" : ""}
            onClick={() => setFeedTab("following")}
          >
            Following
          </button>
          <button
            className={feedTab === "foryou" ? "active" : ""}
            onClick={() => setFeedTab("foryou")}
          >
            For You
          </button>
        </div>

        {/* recorder / send overlay */}
        {mode && (
          <div className="hype-feed-overlay">
            {mode === "send" && !friend && (
              <button
                className="hype-overlay-back"
                onClick={() => { setMode(null); setFriend(null); }}
              >
                <i className="fa-solid fa-arrow-left" /> Back
              </button>
            )}

            {mode === "send" && !friend && (
              <div className="field">
                <label>Who&apos;s getting this hype?</label>
                <div className="user-search">
                  <div className="search">
                    <i className="fa-solid fa-magnifying-glass" />
                    <input
                      placeholder="Search friends…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      aria-label="Search friends"
                    />
                  </div>
                </div>
                <div className="pick-list">
                  {matches.length === 0 ? (
                    <p className="pick-empty">
                      No one found — ask a friend to join Festivity first.
                    </p>
                  ) : (
                    matches.map((p) => (
                      <button
                        key={p.id}
                        className="user-row"
                        onClick={() => setFriend(p)}
                      >
                        <Avatar
                          name={p.name}
                          seed={p.avatar ?? 0}
                          src={p.avatar_url || null}
                          size={34}
                        />
                        <b>{p.name}</b>
                        <i className="fa-solid fa-chevron-right" />
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {(mode === "post" || (mode === "send" && friend)) && (
              <VideoRecorder
                sendToName={mode === "send" && friend ? friend.name : null}
                onDone={handleDone}
                onCancel={() => {
                  setMode(null);
                  setFriend(null);
                }}
              />
            )}
          </div>
        )}

        {/* feed */}
        {hypeLoading && isEmpty ? (
          <div className="profile-loader" aria-label="Loading" />
        ) : isEmpty ? (
          <div className="hype-feed-empty">
            <i className="fa-solid fa-fire" />
            <h3>
              {feedTab === "following" ? "Nothing here yet" : "No hypes yet"}
            </h3>
            <p>
              {feedTab === "following"
                ? "Follow creators to fill this feed with their hypes."
                : "Be the first to post a clip."}
            </p>
            {feedTab === "following" ? (
              <button className="btn btn-sm" onClick={() => setFeedTab("foryou")}>
                <i className="fa-solid fa-arrow-left" /> Browse For You
              </button>
            ) : (
              <button className="btn btn-sm" onClick={startPost}>
                Post the first hype
              </button>
            )}
          </div>
        ) : (
          <div className="hype-feed-viewport">
            <div
              className="hype-feed-track"
              style={{ transform: `translateY(-${currentIndex * 100}%)` }}
            >
              {visibleFeed.map((h, i) => (
                <HypeSlide
                  key={h.id}
                  hype={h}
                  isActive={i === currentIndex}
                  openProfile={(id) => setTab(`user/${id}`)}
                />
              ))}
            </div>

            <div className="hype-feed-arrows">
              <button
                className="hype-arrow-btn"
                aria-label="Previous"
                disabled={currentIndex === 0}
                onClick={prev}
              >
                <i className="fa-solid fa-chevron-up" />
              </button>
              <button
                className="hype-arrow-btn"
                aria-label="Next"
                disabled={currentIndex === visibleFeed.length - 1}
                onClick={next}
              >
                <i className="fa-solid fa-chevron-down" />
              </button>
            </div>
          </div>
        )}

        {/* Floating camera — the one obvious way to post on phones,
            where the sidebar's 'Post a hype' button is hidden. */}
        <button className="hype-cam-fab" onClick={startPost} aria-label="Post a hype">
          <i className="fa-solid fa-camera" aria-hidden="true" />
          <span>Post</span>
        </button>
      </div>
    </div>
  );
}
