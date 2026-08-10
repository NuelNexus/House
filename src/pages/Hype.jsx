import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useSocial } from "../context/SocialContext";
import { useStore } from "../context/StoreContext";
import Avatar from "../components/Avatar";
import VideoRecorder from "../components/VideoRecorder";
import HypeSidebar from "../components/HypeSidebar";
import HypeComments from "../components/HypeComments";
import { extractHashtags, formatCount, rankHypeFeed } from "../lib/fyp";

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
// right action rail (avatar + follow, like, comment, share, spinning disc).
// Photos and videos both live in the hype feed — a snap posted from the
// camera is an image, everything else is a clip. Storage URLs end in the
// file extension, so that's all we need to tell them apart.
function isImageHype(hype) {
  return /\.(jpe?g|png|gif|webp)(\?|$)/i.test(hype.video_url || "");
}

function HypeSlide({
  hype,
  isActive,
  openProfile,
  soundOn,
  onToggleSound,
  onView,
  commentsOpen,
  onToggleComments,
  onTagClick,
  commentCount,
}) {
  const videoRef = useRef(null);
  const lastViewAt = useRef(0);
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
  const tags = hype.hashtags && hype.hashtags.length ? hype.hashtags : extractHashtags(hype.caption);

  useEffect(() => {
    if (authorId) loadFollowCounts(authorId);
  }, [authorId, loadFollowCounts]);

  // Play/pause + the sound preference. React's `muted` prop doesn't
  // reliably push changes to the video element, so we set it directly.
  // Sound is on by default; the browser may hold the very first
  // autoplay until the user taps once. Only (re)plays when the clip is
  // actually paused, so toggling sound mid-watch never restarts it.
  useEffect(() => {
    if (image) return;
    const v = videoRef.current;
    if (!v) return;
    v.muted = !soundOn;
    if (isActive) {
      if (v.paused) {
        v.play().then(() => setPaused(false)).catch(() => {});
      }
    } else {
      v.pause();
      setPaused(true);
    }
  }, [isActive, image, soundOn]);

  // Views: every play counts, and every replay counts too. We bump on
  // the `play` event and on loop wrap-around (currentTime snapping back
  // to ~0 mid-watch), throttled to one view per ~1.2s so a rapid
  // play/pause or very short clip can't farm hundreds of views.
  useEffect(() => {
    if (image || !isActive) return undefined;
    const v = videoRef.current;
    if (!v) return undefined;
    let prev = v.currentTime || 0;
    const maybeView = () => {
      const now = Date.now();
      if (now - lastViewAt.current < 1200) return;
      lastViewAt.current = now;
      onView(hype.id);
    };
    const onPlay = () => maybeView();
    const onTime = () => {
      const t = v.currentTime || 0;
      if (t < prev - 0.5) maybeView(); // looped back to the start = rewatch
      prev = t;
    };
    v.addEventListener("play", onPlay);
    v.addEventListener("timeupdate", onTime);
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("timeupdate", onTime);
    };
  }, [image, isActive, hype.id, onView]);

  const togglePlay = () => {
    if (image) return;
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.muted = !soundOn;
      v.play().catch(() => {});
      setPaused(false);
    } else {
      v.pause();
      setPaused(true);
    }
  };

  // Unmuting happens inside a tap, so the browser allows audio here.
  const toggleSound = (e) => {
    e.stopPropagation();
    onToggleSound();
  };

  // Browsers block audible autoplay until the user's first interaction.
  // Sound is on by default, so the first tap anywhere on the page starts
  // the active clip with audio (taps on the slide itself are left to
  // togglePlay so one tap never double-toggles).
  useEffect(() => {
    if (image || !isActive) return undefined;
    const v = videoRef.current;
    const kick = (e) => {
      if (e.target && e.target.closest && e.target.closest(".hype-feed-slide")) return;
      if (v && v.paused) {
        v.play().then(() => setPaused(false)).catch(() => {});
      }
    };
    window.addEventListener("pointerdown", kick, { once: true });
    window.addEventListener("keydown", kick, { once: true });
    return () => {
      window.removeEventListener("pointerdown", kick);
      window.removeEventListener("keydown", kick);
    };
  }, [isActive, image]);

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
    // Silent by design — no toast on like.
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
  const authorName = hype.author?.name || "Fest GH member";

  return (
    <div className={`hype-feed-slide${paused && !image ? " paused" : ""}`} onClick={togglePlay}>
      {image ? (
        <img className="hype-slide-img" src={hype.video_url} alt={hype.caption || "Hype"} />
      ) : (
        <video
          ref={videoRef}
          src={hype.video_url}
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
          {!hype.recipient_id && (hype.views ?? 0) > 0 && (
            <span className="hype-slide-views" title={`${hype.views} views`}>
              <i className="fa-solid fa-eye" aria-hidden="true" /> {formatCount(hype.views)}
            </span>
          )}
        </div>
        {hype.caption && (
          <div className="hype-slide-caption">
            {hype.caption}
            {tags.length > 0 && (
              <span className="hype-slide-tags" onClick={(e) => e.stopPropagation()}>
                {tags.map((t) => (
                  <button
                    key={t}
                    className="hype-tag-chip"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTagClick(t);
                    }}
                  >
                    #{t}
                  </button>
                ))}
              </span>
            )}
          </div>
        )}
        <div className="hype-slide-song">
          <i className="fa-solid fa-music" /> {authorName} · original hype
        </div>

        {/* Creator profile — sits under the music line: avatar + follow pill */}
        <div className="hype-slide-profile">
          <button
            className="hype-slide-profile-avatar"
            aria-label={`View ${authorName}'s profile`}
            onClick={(e) => {
              e.stopPropagation();
              openProfile(authorId);
            }}
          >
            <Avatar
              name={authorName}
              seed={hype.author?.avatar ?? 0}
              src={hype.author?.avatar_url || null}
              size={40}
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
              <button
                className={`hype-rail-follow-pill${follows ? " following" : ""}`}
                aria-label={follows ? "Unfollow" : "Follow"}
                onClick={doFollow}
              >
                {follows ? "Following" : "Follow"}
              </button>
              {followCount > 0 && (
                <span className="hype-rail-count">{followCount}</span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Right action rail — like / comment / share / sound / disc only */}
      <div className="hype-rail" onClick={(e) => e.stopPropagation()}>
        <div className="hype-rail-actions">
          <button
            className={`hype-rail-btn${liked ? " liked" : ""}`}
            aria-label="Hype"
            onClick={doLike}
          >
            <i className="fa-solid fa-fire" />
            <span className="hype-rail-label">Hype</span>
          </button>
          <button
            className={`hype-rail-btn${commentsOpen ? " active" : ""}`}
            aria-label={commentsOpen ? "Close comments" : "Comments"}
            onClick={onToggleComments}
          >
            <i className="fa-solid fa-comment" />
            <span className="hype-rail-label">
              {commentsOpen ? "Close" : commentCount > 0 ? `${formatCount(commentCount)}` : "Comment"}
            </span>
          </button>
          <button className="hype-rail-btn" aria-label="Share" onClick={doShare}>
            <i className="fa-solid fa-share" />
            <span className="hype-rail-label">Share</span>
          </button>
          {!image && (
            <button
              className={`hype-rail-btn${soundOn ? " sound-on" : ""}`}
              aria-label={soundOn ? "Mute video" : "Unmute video"}
              onClick={toggleSound}
            >
              <i className={`fa-solid ${soundOn ? "fa-volume-high" : "fa-volume-xmark"}`} />
              <span className="hype-rail-label">{soundOn ? "Sound" : "Muted"}</span>
            </button>
          )}
          <div className="hype-rail-disc" aria-hidden="true">
            <i className="fa-solid fa-compact-disc" />
          </div>
        </div>
      </div>

      {/* Comments drawer overlays the slide */}
      {commentsOpen && (
        <HypeComments hype={hype} onClose={onToggleComments} />
      )}
    </div>
  );
}

export default function Hype({ setTab }) {
  const { ensureAuth, user } = useAuth();
  const {
    hypeFeed,
    commentCounts,
    hypeLoading,
    postHype,
    following,
    bumpHypeViews,
    seenHypeIds,
    markHypeSeen,
  } = useSocial();
  const [mode, setMode] = useState(null); // "post" | null
  const [currentIndex, setCurrentIndex] = useState(0);
  const [feedTab, setFeedTab] = useState("foryou"); // "foryou" | "following"
  // Sound is ON by default (browsers only pause the first autoplay until
  // the first tap — the kick effect above handles that). Users can mute.
  const [soundOn, setSoundOn] = useState(true); // shared across slides
  const [activeTag, setActiveTag] = useState(null);
  const [commentsFor, setCommentsFor] = useState(null); // hype id with open drawer
  const wheelLock = useRef(0);
  const touchStartX = useRef(null);
  const watchIdRef = useRef(null); // the clip currently on screen

  // Jump back to the top of the feed and remember the new first clip.
  const snapToTop = () => {
    setCurrentIndex(0);
    if (visibleFeed[0]) watchIdRef.current = visibleFeed[0].id;
  };

  const onView = useMemo(
    () => (id) => bumpHypeViews(id),
    [bumpHypeViews]
  );

  // For You is ranked by the SEO-style score (hashtags + views + recency);
  // Following stays chronological. An active #tag filters the whole feed.
  // Clips the signed-in user has already watched are hidden from the feed
  // (they live on in the profile's "Hyped" tab) so the feed always feels
  // fresh — unless the user asks for them via a tag filter.
  const visibleFeed = useMemo(() => {
    let base = hypeFeed.filter((h) => !seenHypeIds.has(h.id));
    if (activeTag) {
      base = hypeFeed.filter(
        (h) =>
          (h.hashtags && h.hashtags.length
            ? h.hashtags
            : extractHashtags(h.caption)
          ).includes(activeTag)
      );
    }
    if (feedTab === "following") {
      return base.filter((h) => following.includes(h.user_id));
    }
    return rankHypeFeed(base);
  }, [hypeFeed, following, feedTab, activeTag, seenHypeIds]);

  // Reset to the top when the tab/tag or the first clip itself changes
  // (a brand-new hype landing at #1) — NOT on every background refresh.
  useEffect(() => {
    snapToTop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedTab, activeTag, visibleFeed[0]?.id]);

  // Background re-ranks (view bumps, 12s refresh) re-sort the feed but
  // must never shuffle a different clip under the viewer or yank them
  // back to slide 1 — follow the watched clip to its new index instead.
  // If the clip truly vanished (deleted, or marked seen after the viewer
  // swiped past it), clamp to the nearest remaining clip rather than
  // jumping to the top of the feed.
  useEffect(() => {
    const idx = visibleFeed.findIndex((h) => h.id === watchIdRef.current);
    if (idx === -1) {
      // Clamp to a valid index (0 when the feed empties entirely).
      const i = Math.max(0, Math.min(currentIndex, visibleFeed.length - 1));
      setCurrentIndex(i);
      if (visibleFeed[i]) watchIdRef.current = visibleFeed[i].id;
    } else if (idx !== currentIndex) {
      setCurrentIndex(idx);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleFeed]);

  // Moving off a clip counts as having watched it — it leaves the feed
  // (the profile's Hyped tab keeps it for rewatching). Marking it here,
  // on navigation, means the clip you're mid-way through never vanishes
  // from under you; only the one you've left does.
  const next = () => {
    if (!visibleFeed.length) return;
    const cur = visibleFeed[currentIndex];
    if (cur) markHypeSeen(cur.id);
    const i = Math.min(currentIndex + 1, visibleFeed.length - 1);
    setCurrentIndex(i);
    if (visibleFeed[i]) watchIdRef.current = visibleFeed[i].id;
  };
  const prev = () => {
    if (!visibleFeed.length) return;
    const cur = visibleFeed[currentIndex];
    if (cur) markHypeSeen(cur.id);
    const i = Math.max(currentIndex - 1, 0);
    setCurrentIndex(i);
    if (visibleFeed[i]) watchIdRef.current = visibleFeed[i].id;
  };

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

  // Mouse-wheel / trackpad navigation — swiping left-right (or scrolling
  // vertically with a mouse wheel) steps one slide per tick, throttled.
  useEffect(() => {
    if (mode) return undefined;
    const onWheel = (e) => {
      const delta = Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(delta) < 12) return;
      const now = Date.now();
      if (now - wheelLock.current < 600) return;
      wheelLock.current = now;
      if (delta > 0) next();
      else prev();
    };
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => window.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, visibleFeed.length]);

  // Touch swipe navigation for phones — swipe LEFT for the next hype,
  // RIGHT for the previous (ignored while the overlay is open).
  const onTouchStart = (e) => {
    if (mode) return;
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e) => {
    if (mode) return;
    if (touchStartX.current == null) return;
    const dx = touchStartX.current - e.changedTouches[0].clientX;
    touchStartX.current = null;
    if (Math.abs(dx) < 40) return;
    if (dx > 0) next();
    else prev();
  };

  const startPost = () => {
    if (!ensureAuth()) return;
    setMode("post");
  };

  const handleDone = async ({ blob, name, caption, kind }) => {
    await postHype({ blob, name, caption, recipientId: null, kind });
    setMode(null);
  };

  const isEmpty = visibleFeed.length === 0;

  return (
    <div className="hype-layout">
      <HypeSidebar tab="hype" setTab={setTab} onPost={startPost} />

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
          {activeTag && (
            <button className="hype-tag-filter" onClick={() => setActiveTag(null)}>
              <i className="fa-solid fa-hashtag" /> {activeTag} <i className="fa-solid fa-xmark" />
            </button>
          )}
        </div>

        {/* recorder overlay */}
        {mode && (
          <div className="hype-feed-overlay">
            <VideoRecorder
              onDone={handleDone}
              onCancel={() => setMode(null)}
            />
          </div>
        )}

        {/* feed */}
        {hypeLoading && isEmpty ? (
          <div className="profile-loader" aria-label="Loading" />
        ) : isEmpty ? (
          <div className="hype-feed-empty">
            <i className="fa-solid fa-fire" />
            <h3>
              {activeTag
                ? `No hypes tagged #${activeTag}`
                : feedTab === "following"
                ? "Nothing here yet"
                : hypeFeed.length && !user
                ? "Sign in to keep watching"
                : hypeFeed.length
                ? "You're all caught up"
                : "No hypes yet"}
            </h3>
            <p>
              {activeTag
                ? "Try another tag, or clear the filter."
                : feedTab === "following"
                ? "Follow creators to fill this feed with their hypes."
                : hypeFeed.length
                ? "Watched hypes move to your profile's Hyped tab — rewatch them there anytime."
                : "Be the first to post a clip."}
            </p>
            {activeTag ? (
              <button className="btn btn-sm" onClick={() => setActiveTag(null)}>
                <i className="fa-solid fa-xmark" /> Clear tag
              </button>
            ) : feedTab === "following" ? (
              <button className="btn btn-sm" onClick={() => setFeedTab("foryou")}>
                <i className="fa-solid fa-arrow-left" /> Browse For You
              </button>
            ) : hypeFeed.length ? (
              <button className="btn btn-sm" onClick={() => setTab("profile")}>
                <i className="fa-solid fa-clock-rotate-left" /> Rewatch on your profile
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
              style={{ transform: `translateX(-${currentIndex * 100}%)` }}
            >
              {visibleFeed.map((h, i) => (
                <HypeSlide
                  key={h.id}
                  hype={h}
                  isActive={i === currentIndex}
                  openProfile={(id) => setTab(`user/${id}`)}
                  soundOn={soundOn}
                  onToggleSound={() => setSoundOn((s) => !s)}
                  onView={onView}
                  commentsOpen={commentsFor === h.id}
                  onToggleComments={() =>
                    setCommentsFor((c) => (c === h.id ? null : h.id))
                  }
                  onTagClick={(t) => setActiveTag(t)}
                  commentCount={commentCounts[h.id] || 0}
                />
              ))}
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
