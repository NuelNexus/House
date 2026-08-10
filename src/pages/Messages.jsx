import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useSocial } from "../context/SocialContext";
import { useStore } from "../context/StoreContext";
import { useTheme } from "../context/ThemeContext";
import { goUser } from "../lib/nav";
import { extractHashtags, formatCount } from "../lib/fyp";
import Avatar from "../components/Avatar";
import VideoRecorder from "../components/VideoRecorder";
import HypeComments from "../components/HypeComments";

// Chat accent palette (Instagram-style "change color" swatches).
const CHAT_COLORS = [
  { id: "rose", name: "Rose", value: "var(--rose-deep)" },
  { id: "blue", name: "Blue", value: "#0086ff" },
  { id: "violet", name: "Violet", value: "#9f7aea" },
  { id: "emerald", name: "Emerald", value: "#38b2ac" },
  { id: "orange", name: "Orange", value: "#ed8936" },
];

const ACCENT_KEY = "festivity.chatColor";

function formatDay(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const mins = Math.floor((now - d) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

// Hypes can be photos (posted from the camera) or clips.
function isImageHype(url) {
  return /\.(jpe?g|png|gif|webp)(\?|$)/i.test(url || "");
}

// The received-hype player — a full hype-feed-style slide, not a small
// card. Same look as the Hype page: edge-to-edge video with autoplay,
// bottom-left author/caption/hashtags, right action rail, view counting
// (replays count) and the comments drawer. Sound starts on; the browser
// only gates the very first audible play behind a tap.
function HypePlayerSlide({ hype, author, onClose }) {
  const videoRef = useRef(null);
  const lastViewAt = useRef(0);
  const [paused, setPaused] = useState(true);
  const [soundOn, setSoundOn] = useState(true);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const { bumpHypeViews, commentCounts } = useSocial();
  const { notify } = useStore();
  const image = isImageHype(hype.video_url);
  const authorName = author?.name || "Fest GH member";
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
      v.play().catch(() => {});
      setPaused(false);
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
        <video ref={videoRef} className="ms-hype-stage-media" src={hype.video_url} loop playsInline preload="metadata" />
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
          <span className="time">{formatDay(hype.created_at)}</span>
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
            className={`hype-rail-btn${commentsOpen ? " active" : ""}`}
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

export default function Messages({ compose, sendHype, q, setTab }) {
  const { user, name, profile, authLoading, openAuth } = useAuth();
  const {
    conversations,
    threads,
    unread,
    openThread,
    sendMessage,
    people,
    loadPeople,
    followers,
    incomingHypes,
    postHype,
  } = useSocial();
  const { theme, setMode } = useTheme();

  const [recipient, setRecipient] = useState(null);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [chatSearch, setChatSearch] = useState("");
  const [sending, setSending] = useState(false);
  const [accent, setAccent] = useState(() => {
    try {
      return localStorage.getItem(ACCENT_KEY) || "rose";
    } catch {
      return "rose";
    }
  });
  // Hype inbox + send-hype flow.
  const [hypeView, setHypeView] = useState(null); // { user, hype } to play
  const [sendMode, setSendMode] = useState(false);
  const [friend, setFriend] = useState(null);
  const [sendQuery, setSendQuery] = useState("");
  const bubblesRef = useRef(null);
  // Only auto-open the send-hype flow once from a deep link — a late
  // people-load must not re-open it after the user closed it.
  const sendAutoOpened = useRef(false);

  const messages = recipient ? threads[recipient] || [] : [];

  const accentValue =
    CHAT_COLORS.find((c) => c.id === accent)?.value || "var(--rose-deep)";

  const pickAccent = (id) => {
    setAccent(id);
    try {
      localStorage.setItem(ACCENT_KEY, id);
    } catch {
      /* ignore */
    }
  };

  // Deep link support: #messages/new?to=<id>&event=<name>&offer=1&host=<name>
  // (contacting a host) opens that thread directly — no member search needed.
  useEffect(() => {
    if (compose && q.to) {
      setRecipient(q.to);
      const host = q.host || "the host";
      const event = q.event || "your event";
      setDraft(
        q.offer === "1"
          ? `Hi ${host}! I run a catering/service business and I'd love to offer my services for ${event}. Can we talk?`
          : `Hi ${host}! I'm interested in ${event} — quick question before I grab my ticket.`
      );
    }
  }, [compose, q.to, q.event, q.offer, q.host]);

  // Deep link #hype/send?to=<id> now lands here — open the send-hype flow.
  useEffect(() => {
    if (sendHype && !sendAutoOpened.current) {
      sendAutoOpened.current = true;
      if (!people.length) loadPeople();
      setSendMode(true);
      if (q.to) {
        const target =
          people.find((p) => p.id === q.to) || {
            id: q.to,
            name: q.host || "a friend",
          };
        setFriend(target);
      }
    }
  }, [sendHype, q, people, loadPeople]);

  useEffect(() => {
    if (recipient) openThread(recipient);
  }, [recipient, openThread]);

  useEffect(() => {
    if (recipient && messages.length) {
      bubblesRef.current?.scrollTo({ top: bubblesRef.current.scrollHeight });
    }
  }, [recipient, messages.length]);

  const recipientProfile = recipient
    ? people.find((p) => p.id === recipient)
    : null;
  const recipientName =
    recipientProfile?.name ||
    (q.to === recipient ? q.host : null) ||
    "Chat";

  // Chats = the people who follow me — the only people I can text.
  const chatList = useMemo(() => {
    const convByOther = new Map(conversations.map((c) => [c.other, c]));
    return followers
      .map((f) => {
        const conv = convByOther.get(f.id);
        return {
          id: f.id,
          name: f.name || "Fest GH member",
          avatar: f,
          lastBody: conv?.lastBody,
          lastAt: conv?.lastAt,
          lastMine: conv?.lastMine,
          unread: unread[f.id] || 0,
        };
      })
      .sort((a, b) => {
        const ta = a.lastAt ? new Date(a.lastAt).getTime() : 0;
        const tb = b.lastAt ? new Date(b.lastAt).getTime() : 0;
        return tb - ta;
      });
  }, [followers, conversations, unread]);

  const filteredChats = useMemo(() => {
    const qs = search.trim().toLowerCase();
    if (!qs) return chatList;
    return chatList.filter((c) => (c.name || "").toLowerCase().includes(qs));
  }, [chatList, search]);

  const filteredMessages = useMemo(() => {
    const qs = chatSearch.trim().toLowerCase();
    if (!qs) return messages;
    return messages.filter((m) => m.body.toLowerCase().includes(qs));
  }, [messages, chatSearch]);

  // People who sent ME a hype (deduped) — the hype inbox rail.
  const hypeSenders = useMemo(() => {
    const map = new Map();
    incomingHypes.forEach((h) => {
      if (h.user_id && !map.has(h.user_id)) {
        map.set(h.user_id, { user: h.author || null, hype: h });
      }
    });
    return [...map.values()];
  }, [incomingHypes]);

  const sendMatches = useMemo(
    () =>
      people.filter(
        (p) =>
          p.id !== user?.id &&
          p.name.toLowerCase().includes(sendQuery.toLowerCase())
      ),
    [people, sendQuery, user]
  );

  const handleSend = async () => {
    if (!recipient || !draft.trim() || sending) return;
    setSending(true);
    const body = draft.trim();
    setDraft("");
    // A lingering in-chat search must never hide the message you just
    // sent — clear it so the fresh bubble is always visible.
    setChatSearch("");
    await sendMessage(recipient, body);
    // Leave the composer deep link behind so back/forward stays clean.
    if (window.location.hash.startsWith("#messages/new")) {
      window.location.hash = "messages";
    }
    setSending(false);
  };

  const backToList = () => {
    setRecipient(null);
    window.location.hash = "messages";
  };

  const openSendHype = () => {
    if (!user) {
      openAuth();
      return;
    }
    if (!people.length) loadPeople();
    setFriend(null);
    setSendQuery("");
    setSendMode(true);
  };

  const closeSend = () => {
    setSendMode(false);
    setFriend(null);
    setSendQuery("");
  };

  const handleHypeSend = async ({ blob, name: fname, caption, kind }) => {
    if (!friend) return;
    await postHype({ blob, name: fname, caption, recipientId: friend.id, kind });
    closeSend();
  };

  const toggleMode = () =>
    setMode(theme.mode === "dark" ? "light" : "dark");

  const home = (
    <button className="ms-home" onClick={() => setTab("home")}>
      <i className="fa-solid fa-arrow-left" />
      <span>Home</span>
    </button>
  );

  if (!authLoading && !user) {
    return (
      <div className="ms-app">
        <header className="ms-header">{home}</header>
        <div className="ms-gate">
          <div className="gate-icon">
            <i className="fa-solid fa-comment-dots" />
          </div>
          <h2>Your inbox lives here</h2>
          <p>
            Chat with hosts, coordinate with friends and keep the hype going
            between parties.
          </p>
          <button className="btn" onClick={() => openAuth()}>
            <i className="fa-solid fa-right-to-bracket icon" /> Sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ms-app" style={{ "--chat-accent": accentValue }}>
      <header className="ms-header">
        {home}
        <div className="ms-search">
          <i className="fa-solid fa-magnifying-glass" />
          <input
            placeholder="Search conversations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search conversations"
          />
        </div>
        <div className="ms-header-right">
          <button
            className="ms-icon-btn"
            aria-label="Toggle dark mode"
            title="Toggle dark mode"
            onClick={toggleMode}
          >
            {theme.mode === "dark" ? (
              <i className="fa-solid fa-sun" />
            ) : (
              <i className="fa-solid fa-moon" />
            )}
          </button>
          <button
            className="ms-avatar-btn"
            title="Your profile"
            onClick={() => setTab("profile")}
          >
            <Avatar
              name={name}
              seed={profile?.avatar ?? 0}
              src={profile?.avatarUrl || null}
              size={40}
            />
          </button>
        </div>
      </header>

      <div className="ms-wrap">
        {/* Hype inbox — replaces the chats column with the profile pics of
            everyone who sent you a hype. Tap one to play their hype. */}
        <aside className="ms-convs">
          <div className="ms-convs-head">
            <h3>Hype</h3>
            <button
              className="ms-new"
              aria-label="Send hype"
              title="Send hype"
              onClick={openSendHype}
            >
              <i className="fa-solid fa-fire" />
            </button>
          </div>
          <div className="ms-hype-senders">
            {hypeSenders.length === 0 ? (
              <div className="ms-empty">
                <i className="fa-solid fa-fire" />
                <p>Hypes sent to you land here.</p>
              </div>
            ) : (
              hypeSenders.map((s) => (
                <button
                  key={s.user?.id || s.hype.id}
                  className="ms-hype-avatar"
                  title={s.user?.name || "Hype"}
                  aria-label={`Play hype from ${s.user?.name || "a friend"}`}
                  onClick={() => setHypeView(s)}
                >
                  <Avatar
                    name={s.user?.name || "?"}
                    seed={s.user?.avatar ?? 0}
                    src={s.user?.avatar_url || null}
                    size={48}
                  />
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Chat area — follower list (styled like the old compose panel),
            or the open thread when one is selected. */}
        <section className="ms-chat">
          {recipient ? (
            <>
              <div className="ms-chat-head">
                <button
                  className="ms-back"
                  aria-label="Back to chats"
                  onClick={backToList}
                >
                  <i className="fa-solid fa-arrow-left" />
                </button>
                <Avatar
                  name={recipientName}
                  seed={recipientProfile?.avatar ?? 0}
                  src={recipientProfile?.avatar_url || null}
                  size={40}
                />
                <div className="ms-chat-title">
                  <b>{recipientName}</b>
                  <span>Fest GH member</span>
                </div>
                <button
                  className="ms-head-icon"
                  title="View profile"
                  onClick={() => goUser(recipient)}
                >
                  <i className="fa-solid fa-id-card" />
                </button>
              </div>

              <div className="ms-bubbles" ref={bubblesRef}>
                {filteredMessages.length === 0 && (
                  <p className="ms-none">
                    {chatSearch ? "No matches in this chat" : "Say hello 👋"}
                  </p>
                )}
                {filteredMessages.map((m) => {
                  const mine = m.sender_id === user?.id;
                  return (
                    <div
                      key={m.$id || m.id}
                      className={`chat-msg ${mine ? "owner" : ""}`}
                    >
                      <div className="chat-msg-profile">
                        <Avatar
                          name={mine ? name : recipientName}
                          seed={
                            mine
                              ? profile?.avatar ?? 0
                              : recipientProfile?.avatar ?? 0
                          }
                          src={
                            mine
                              ? profile?.avatarUrl || null
                              : recipientProfile?.avatar_url || null
                          }
                          size={38}
                        />
                        <div className="chat-msg-date">{formatDay(m.created_at)}</div>
                      </div>
                      <div className="chat-msg-content">
                        <div className="chat-msg-text">{m.body}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="ms-chat-foot">
                <input
                  placeholder="Type something here…"
                  value={draft}
                  aria-label="Message"
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                />
                <button
                  className="ms-send"
                  disabled={!draft.trim() || sending}
                  aria-label="Send message"
                  onClick={handleSend}
                >
                  {sending ? (
                    <i className="fa-solid fa-spinner fa-spin" />
                  ) : (
                    <i className="fa-solid fa-paper-plane" />
                  )}
                </button>
              </div>
            </>
          ) : (
            <div className="ms-compose">
              {/* Hype inbox strip — shown on phones, where the side rail hides */}
              <div className="ms-hype-strip">
                <button
                  className="ms-hype-send-btn"
                  aria-label="Send hype"
                  onClick={openSendHype}
                >
                  <i className="fa-solid fa-fire" />
                  <span>Send</span>
                </button>
                {hypeSenders.map((s) => (
                  <button
                    key={s.user?.id || s.hype.id}
                    className="ms-hype-avatar"
                    title={s.user?.name || "Hype"}
                    onClick={() => setHypeView(s)}
                  >
                    <Avatar
                      name={s.user?.name || "?"}
                      seed={s.user?.avatar ?? 0}
                      src={s.user?.avatar_url || null}
                      size={48}
                    />
                  </button>
                ))}
              </div>

              <h3 className="ms-compose-title">
                <i className="fa-solid fa-comment-dots" /> Chats
              </h3>
              <div className="user-search">
                <div className="search">
                  <i className="fa-solid fa-magnifying-glass" />
                  <input
                    placeholder="Search followers…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label="Search followers"
                  />
                </div>
              </div>
              {filteredChats.length === 0 ? (
                <p className="pick-empty">
                  {followers.length === 0
                    ? "No one follows you yet — people who follow you show up here so you can chat."
                    : "No chats with followers found."}
                </p>
              ) : (
                filteredChats.map((c) => (
                  <button
                    key={c.id}
                    className="user-row ms-follower-row"
                    onClick={() => {
                      setRecipient(c.id);
                      setDraft("");
                      setChatSearch("");
                    }}
                  >
                    <Avatar
                      name={c.name}
                      seed={c.avatar?.avatar ?? 0}
                      src={c.avatar?.avatar_url || null}
                      size={40}
                    />
                    <span className="ms-follower-mid">
                      <b>{c.name}</b>
                      <span className="ms-follower-last">
                        {c.lastMine ? "You: " : ""}
                        {c.lastBody || "No messages yet"}
                      </span>
                    </span>
                    <span className="ms-follower-side">
                      {c.lastAt && (
                        <span className="ms-time">{formatDay(c.lastAt)}</span>
                      )}
                      {c.unread > 0 && (
                        <span className="ms-unread">{c.unread}</span>
                      )}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </section>

        {/* Detail area */}
        <aside className="ms-detail">
          {recipient ? (
            <>
              <div className="ms-detail-head">
                <Avatar
                  name={recipientName}
                  seed={recipientProfile?.avatar ?? 0}
                  src={recipientProfile?.avatar_url || null}
                  size={64}
                />
                <div className="ms-detail-title">{recipientName}</div>
                <div className="ms-detail-sub">Fest GH member</div>
                <div className="ms-detail-btns">
                  <button
                    className="ms-detail-btn"
                    onClick={() => goUser(recipient)}
                  >
                    <i className="fa-solid fa-id-card" /> Profile
                  </button>
                  <button
                    className="ms-detail-btn"
                    onClick={() => {
                      setFriend(
                        recipientProfile || {
                          id: recipient,
                          name: recipientName,
                        }
                      );
                      setSendMode(true);
                    }}
                  >
                    <i className="fa-solid fa-fire" /> Hype
                  </button>
                </div>
              </div>

              <div className="ms-detail-changes">
                <input
                  placeholder="Search in conversation"
                  value={chatSearch}
                  onChange={(e) => setChatSearch(e.target.value)}
                  aria-label="Search in conversation"
                />
                <div className="ms-detail-change">
                  <span>Change color</span>
                  <div className="ms-colors">
                    {CHAT_COLORS.map((c) => (
                      <button
                        key={c.id}
                        className={`ms-color ${accent === c.id ? "selected" : ""}`}
                        style={{ background: c.value }}
                        aria-label={c.name}
                        title={c.name}
                        onClick={() => pickAccent(c.id)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="ms-detail-empty">
              <i className="fa-regular fa-comment-dots" />
              <p>Select a conversation to see details</p>
            </div>
          )}
        </aside>
      </div>

      {/* Hype player — plays the hype someone sent me, styled exactly
          like the Hype page: edge-to-edge video, info block, comments. */}
      {hypeView && (
        <div className="ms-hype-player" onClick={() => setHypeView(null)}>
          <HypePlayerSlide
            hype={hypeView.hype}
            author={hypeView.user}
            onClose={() => setHypeView(null)}
          />
        </div>
      )}

      {/* Send hype — pick a friend, then record the clip */}
      {sendMode && (
        <div className="ms-send-overlay">
          {!friend ? (
            <div className="ms-send-panel">
              <div className="ms-send-head">
                <h3>
                  <i className="fa-solid fa-fire" /> Send hype
                </h3>
                <button
                  className="ms-hype-close"
                  aria-label="Close"
                  onClick={closeSend}
                >
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>
              <div className="user-search">
                <div className="search">
                  <i className="fa-solid fa-magnifying-glass" />
                  <input
                    placeholder="Search friends…"
                    value={sendQuery}
                    onChange={(e) => setSendQuery(e.target.value)}
                    aria-label="Search friends"
                  />
                </div>
              </div>
              <div className="ms-send-list">
                {sendMatches.length === 0 ? (
                  <p className="pick-empty">
                    No one found — ask a friend to join Fest GH first.
                  </p>
                ) : (
                  sendMatches.map((p) => (
                    <button
                      key={p.id}
                      className="user-row"
                      onClick={() => setFriend(p)}
                    >
                      <Avatar
                        name={p.name}
                        seed={p.avatar ?? 0}
                        src={p.avatar_url || null}
                        size={36}
                      />
                      <b>{p.name}</b>
                      <i className="fa-solid fa-chevron-right" />
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
            <VideoRecorder
              sendToName={friend.name}
              onDone={handleHypeSend}
              onCancel={closeSend}
            />
          )}
        </div>
      )}
    </div>
  );
}
