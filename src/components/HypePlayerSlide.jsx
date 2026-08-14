import { useEffect, useRef, useState } from "react";
import { useSocial } from "../context/SocialContext";
import { useStore } from "../context/StoreContext";
import { extractHashtags, formatCount } from "../lib/fyp";
import HypeComments from "./HypeComments";

// Hypes can be photos (posted from the camera) or clips.
function isImageHype(url) {
  return /\.(jpe?g|png|gif|webp)(\?|$)/i.test(url || "");
}

// The full-bleed hype player — a hype-page-style slide, not a small card.
// Used by the Messages hype inbox and the profile's "Hyped" rewatch tab.
// Same look as the Hype page: edge-to-edge video with autoplay, bottom-left
// author/caption/hashtags, right action rail, view counting (replays count)
// and the comments drawer. Sound starts on; the browser only gates the very
// first audible play behind a tap.
export default function HypePlayerSlide({ hype, author, onClose }) {
  const videoRef = useRef(null);
  const lastViewAt = useRef(0);
  const [paused, setPaused] = useState(true);
  const [soundOn, setSoundOn] = useState(true);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const { bumpHypeViews, commentCounts } = useSocial();
  const { notify } = useStore();
  const image = isImageHype(hype.video_url);
  const authorName = author?.name || "FesGH member";
  const tags =
    hype.hashtags && hype.hashtags.length
      ? hype.hashtags
      : extractHashtags(hype.caption);

  // Autoplay + view counting (every play and every loop replay counts,
  // throttled to one view per ~1.2s).
  useEffect(() => {
    if (image) return undefined;
    const v = videoRef.current;
    if (!v) return undefined;
    v.muted = true;
    v.play().then(() => setPaused(false)).catch(() => {});
    const kick = () => {
      v.muted = false;
      if (v.paused) v.play().catch(() => {});
      setPaused(false);
    };
    window.addEventListener("pointerdown", kick, { once: true });
    window.addEventListener("keydown", kick, { once: true });
    let prev = v.currentTime || 0;
    const maybeView = () => {
      const now = Date.now();
      if (now - lastViewAt.current < 1200) return;
      lastViewAt.current = now;
      bumpHypeViews(hype.id);
    };
    const onPlay = () => maybeView();
    const onTime = () => {
      const t = v.currentTime || 0;
      if (t < prev - 0.5) maybeView(); // looped back = rewatch
      prev = t;
    };
    v.addEventListener("play", onPlay);
    v.addEventListener("timeupdate", onTime);
    return () => {
      window.removeEventListener("pointerdown", kick);
      window.removeEventListener("keydown", kick);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("timeupdate", onTime);
    };
  }, [image, hype.id, bumpHypeViews]);

  const toggleSound = (e) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    const next = !soundOn;
    setSoundOn(next);
    v.muted = !next;
    if (v.paused && next) v.play().catch(() => {});
  };

  const togglePlay = (e) => {
    // Never bubble to the overlay's close handler — tapping the video
    // pauses/plays it, it doesn't dismiss the player.
    if (e) e.stopPropagation();
    if (image) return;
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      // Only drop the play overlay once playback actually starts —
      // play() is async and may need to (re)buffer on mobile, so hiding
      // the button first flashes the raw video element's native
      // placeholder behind it.
      v.play().then(() => setPaused(false)).catch(() => {});
    } else {
      v.pause();
      setPaused(true);
    }
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

  const count = commentCounts[hype.id] || 0;

  return (
    <div
      className={`ms-hype-stage${paused && !image ? " paused" : ""}`}
      onClick={togglePlay}
    >
      {image ? (
        <img
          className="ms-hype-stage-media"
          src={hype.video_url}
          alt={hype.caption || "Hype"}
        />
      ) : (
        <video
          ref={videoRef}
          className="ms-hype-stage-media"
          src={hype.video_url}
          loop
          playsInline
          preload="metadata"
        />
      )}
      {!image && paused && (
        <div className="hype-slide-play">
          <i className="fa-solid fa-play" />
        </div>
      )}

      {hype.recipient_id && <span className="hype-slide-private">Private</span>}

      {/* Bottom-left info — same block as the Hype page */}
      <div className="hype-slide-info">
        <div className="hype-slide-author">
          <span className="hype-slide-name">@{authorName}</span>
          <span className="time">
            {hype.created_at
              ? new Date(hype.created_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })
              : ""}
          </span>
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
              <span className="hype-slide-tags">
                {tags.map((t) => (
                  <span key={t} className="hype-tag-chip">#{t}</span>
                ))}
              </span>
            )}
          </div>
        )}
        <div className="hype-slide-song">
          <i className="fa-solid fa-music" /> {authorName} · original hype
        </div>
      </div>

      {/* Right action rail — comment / share / sound */}
      <div className="hype-rail" onClick={(e) => e.stopPropagation()}>
        <div className="hype-rail-actions">
          <button
            className={`hype-rail-btn${commentsOpen ? " active" : ""}${count > 0 ? " has-count" : ""}`}
            aria-label={commentsOpen ? "Close comments" : "Comments"}
            onClick={() => setCommentsOpen((o) => !o)}
          >
            <i className="fa-solid fa-comment" />
            <span className="hype-rail-label">
              {commentsOpen ? "Close" : count > 0 ? formatCount(count) : "Comment"}
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
        </div>
      </div>

      {commentsOpen && (
        <HypeComments hype={hype} onClose={() => setCommentsOpen(false)} />
      )}

      <button className="ms-hype-close" aria-label="Close" onClick={onClose}>
        <i className="fa-solid fa-xmark" />
      </button>
    </div>
  );
}
