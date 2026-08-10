import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useSocial } from "../context/SocialContext";
import { useStore } from "../context/StoreContext";
import Avatar from "../components/Avatar";
import VideoRecorder from "../components/VideoRecorder";
import HypeSidebar from "../components/HypeSidebar";
import HypeComments from "../components/HypeComments";
import { LiveStrip, LiveHostOverlay, LiveViewerOverlay } from "../components/LiveOverlays";
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
  preload,
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
  const authorName = hype.author?.name || "FesGH member";

  return (
    <div className={`hype-feed-slide${paused && !image ? " paused" : ""}`} onClick={togglePlay}>
      {image ? (
        <img
          className="hype-slide-img"
          src={hype.video_url}
          alt={hype.caption || "Hype"}
          loading={preload === "auto" ? "eager" : "lazy"}
        />
      ) : (
        <video
          ref={videoRef}
          src={hype.video_url}
          loop
          playsInline
          preload={preload || "metadata"}
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
            className={`hype-rail-btn${commentsOpen ? " active" : ""}${commentCount > 0 ? " has-count" : ""}`}
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
  const [chooser, setChooser] = useState(false); // post chooser (video | live)
  const [goLive, setGoLive] = useState(false); // host overlay open
  const [watchingLive, setWatchingLive] = useState(null); // session being watched
  const [currentIndex, setCurrentIndex] = useState(0);
  const [feedTab, setFeedTab] = useState("foryou"); // "foryou" | "following"
  // Sound is ON by default (browsers only pause the first autoplay until
  // the first tap — the kick effect above handles that). Users can mute.
  const [soundOn, setSoundOn] = useState(true); // shared across slides
  const [activeTag, setActiveTag] = useState(null);
  const [commentsFor, setCommentsFor] = useState(null); // hype id with open drawer
  const [showEnd, setShowEnd] = useState(false); // end-of-feed card
  const wheelLock = useRef(0);
  const touchStartX = useRef(null);
  const watchIdRef = useRef(null); // the clip currently on screen

  const onView = useMemo(
    () => (id) => bumpHypeViews(id),
    [bumpHypeViews]
  );

  // Ranked + filtered candidates straight from the live feed (tab, tag and
  // seen-clips are applied here). This recomputes on every refresh and view
  // bump, so it is NOT what we render — see the locked visibleFeed below.
  const ranked = useMemo(() => {
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

  // The LOCKED playlist — the order you actually swipe through. Once the
  // feed loads (or you switch tab/tag), the order is frozen: background
  // refreshes, view bumps and new hypes can never reshuffle clips mid-watch
  // or yank you back to slide 1. Clips that appear while you're watching
  // are appended to the END, so the current clip and the next few are
  // always already determined. Fresh data (views) is merged in place.
  const [visibleFeed, setVisibleFeed] = useState([]);
  const playlistKeyRef = useRef(null);

  useEffect(() => {
    const key = `${feedTab}|${activeTag || ""}`;
    if (key !== playlistKeyRef.current) {
      // Tab/tag switched (or first load): re-lock from the ranked feed
      // (seen clips are filtered out here) and start from the top.
      playlistKeyRef.current = key;
      setVisibleFeed(ranked);
      setCurrentIndex(0);
      setShowEnd(false);
      if (ranked[0]) watchIdRef.current = ranked[0].id;
      return;
    }
    // Background refresh: keep every existing clip in its locked position
    // (swapping in the freshest data) — INCLUDING ones you've already
    // watched this session, so you can swipe back to rewatch them. Only
    // truly deleted clips drop out; brand-new clips append at the end.
    // Returns the SAME array when nothing changed, so view-bump re-renders
    // don't reshuffle or re-render every slide.
    setVisibleFeed((prev) => {
      const byId = new Map(hypeFeed.map((r) => [r.id, r]));
      const keep = prev
        .filter((h) => byId.has(h.id))
        .map((h) => byId.get(h.id));
      const fresh = ranked.filter((r) => !prev.some((h) => h.id === r.id));
      const next = fresh.length ? [...keep, ...fresh] : keep;
      if (next.length === prev.length && next.every((h, i) => h.id === prev[i].id)) {
        return prev;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ranked, hypeFeed, feedTab, activeTag]);

  // Safety net: whenever the playlist shifts, keep the current clip
  // pinned. If it truly vanished (watched + dropped, or deleted), clamp to
  // the nearest remaining clip — never switch to a different video under
  // the viewer.
  useEffect(() => {
    const idx = visibleFeed.findIndex((h) => h.id === watchIdRef.current);
    if (idx === -1) {
      const i = Math.max(0, Math.min(currentIndex, visibleFeed.length - 1));
      setCurrentIndex(i);
      if (visibleFeed[i]) watchIdRef.current = visibleFeed[i].id;
    } else if (idx !== currentIndex) {
      setCurrentIndex(idx);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleFeed]);

  // Moving off a clip counts as having watched it — it leaves the feed on
  // your NEXT visit (the profile's Hyped tab keeps it for rewatching). The
  // clip stays in this session's locked playlist, so you can always swipe
  // BACK and rewatch it. Marking it here, on navigation, means the clip
  // you're mid-way through never vanishes from under you.
  const moveTo = (dir) => {
    if (!visibleFeed.length) return;
    const cur = visibleFeed[currentIndex];
    if (!cur) return;
    if (dir === 1) {
      const targetIdx = currentIndex + 1;
      if (targetIdx < visibleFeed.length) {
        // Forward: the clip we're leaving is now watched.
        markHypeSeen(cur.id);
        watchIdRef.current = visibleFeed[targetIdx].id;
        setCurrentIndex(targetIdx);
      } else {
        // End of the feed — mark the last one watched and surface the
        // caught-up card instead of yanking the viewer anywhere.
        markHypeSeen(cur.id);
        setShowEnd(true);
      }
      return;
    }
    // Backward: rewatching is always allowed — a seen clip just doesn't
    // come back into a fresh feed. Never un-marks anything.
    const targetIdx = Math.max(currentIndex - 1, 0);
    watchIdRef.current = visibleFeed[targetIdx].id;
    setCurrentIndex(targetIdx);
    setShowEnd(false);
  };
  const next = () => moveTo(1);
  const prev = () => moveTo(-1);

  // Keyboard navigation (ignored while the recorder overlay is open).
  useEffect(() => {
    if (mode || chooser || goLive || watchingLive) return undefined;
    const onKey = (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowRight") next();
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, visibleFeed.length, currentIndex]);

  // Mouse-wheel / trackpad navigation — swiping left-right (or scrolling
  // vertically with a mouse wheel) steps one slide per tick, throttled.
  useEffect(() => {
    if (mode || chooser || goLive || watchingLive) return undefined;
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
  }, [mode, visibleFeed.length, currentIndex]);

  // Touch swipe navigation for phones — swipe LEFT for the next hype,
  // RIGHT for the previous (ignored while the overlay is open).
  const onTouchStart = (e) => {
    if (mode || chooser || goLive || watchingLive) return;
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e) => {
    if (mode || chooser || goLive || watchingLive) return;
    if (touchStartX.current == null) return;
    const dx = touchStartX.current - e.changedTouches[0].clientX;
    touchStartX.current = null;
    if (Math.abs(dx) < 40) return;
    if (dx > 0) next();
    else prev();
  };

  // Post opens a chooser: go live, or snap a video.
  const startPost = () => {
    if (!ensureAuth()) return;
    setChooser(true);
  };

  const handleDone = async ({ blob, name, caption, kind, published }) => {
    await postHype({ blob, name, caption, recipientId: null, kind, published });
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

        {/* Live now — streams currently on air */}
        <LiveStrip onWatch={(s) => setWatchingLive(s)} />

        {/* Post chooser — go live or snap a video */}
        {chooser && (
          <div className="hype-feed-overlay">
            <div className="hype-chooser">
              <button
                className="hype-chooser-opt live"
                onClick={() => {
                  setChooser(false);
                  setGoLive(true);
                }}
              >
                <i className="fa-solid fa-tower-broadcast" />
                <b>Go Live</b>
                <small>Stream to the scene in real time</small>
              </button>
              <button
                className="hype-chooser-opt"
                onClick={() => {
                  setChooser(false);
                  setMode("post");
                }}
              >
                <i className="fa-solid fa-fire" />
                <b>Post a video</b>
                <small>Snap, edit and share a hype</small>
              </button>
              <button className="hype-chooser-cancel" onClick={() => setChooser(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

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
                  // Preload the current clip and the next two so the
                  // upcoming videos are already buffered and the order is
                  // fixed before you swipe.
                  preload={i >= currentIndex && i - currentIndex <= 2 ? "auto" : "metadata"}
                />
              ))}
            </div>
            {showEnd && (
              <div className="hype-feed-endcard">
                <i className="fa-solid fa-fire" />
                <h3>You're all caught up</h3>
                <p>
                  You've watched every clip in this feed. Swipe <b>right</b>{" "}
                  to rewatch anything you've seen, or find them again on your
                  profile's Hyped tab.
                </p>
                <div className="hype-endcard-actions">
                  <button
                    className="btn btn-sm"
                    onClick={() => setShowEnd(false)}
                  >
                    <i className="fa-solid fa-arrow-left" /> Back to the feed
                  </button>
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={() => setTab("profile")}
                  >
                    <i className="fa-solid fa-clock-rotate-left" /> Hyped tab
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Floating camera — the one obvious way to post on phones,
            where the sidebar's 'Post a hype' button is hidden. */}
        <button className="hype-cam-fab" onClick={startPost} aria-label="Post a hype">
          <i className="fa-solid fa-camera" aria-hidden="true" />
          <span>Post</span>
        </button>
      </div>

      {/* Go Live host flow */}
      {goLive && <LiveHostOverlay onClose={() => setGoLive(false)} />}

      {/* Watch a live stream */}
      {watchingLive && (
        <LiveViewerOverlay
          session={watchingLive}
          onClose={() => setWatchingLive(null)}
        />
      )}
    </div>
  );
}
