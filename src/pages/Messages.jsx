import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useSocial } from "../context/SocialContext";
import { useTheme } from "../context/ThemeContext";
import { goUser } from "../lib/nav";
import Avatar from "../components/Avatar";

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

export default function Messages({ compose, q, setTab }) {
  const { user, name, profile, authLoading, openAuth } = useAuth();
  const {
    conversations,
    threads,
    unread,
    openThread,
    sendMessage,
    people,
    loadPeople,
  } = useSocial();
  const { theme, setMode } = useTheme();

  const [recipient, setRecipient] = useState(null);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [chatSearch, setChatSearch] = useState("");
  const [sending, setSending] = useState(false);
  const [accent, setAccent] = useState(() => {
    try {
      return localStorage.getItem(ACCENT_KEY) || "rose";
    } catch {
      return "rose";
    }
  });
  const bubblesRef = useRef(null);

  const messages = recipient ? threads[recipient] || [] : [];
  // Mobile panel: list → compose → thread, based on route + selection.
  const panel = recipient ? "thread" : compose ? "compose" : "list";

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
    } else if (compose && !q.to) {
      setRecipient(null);
      setDraft("");
    }
  }, [compose, q.to, q.event, q.offer, q.host]);

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

  const filteredConvs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.lastBody || "").toLowerCase().includes(q)
    );
  }, [conversations, search]);

  const filteredMessages = useMemo(() => {
    const q = chatSearch.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter((m) => m.body.toLowerCase().includes(q));
  }, [messages, chatSearch]);

  const matches = useMemo(
    () =>
      people.filter(
        (p) =>
          p.id !== user?.id &&
          p.name.toLowerCase().includes(memberSearch.toLowerCase())
      ),
    [people, memberSearch, user]
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

  const openComposer = () => {
    setRecipient(null);
    setDraft("");
    if (!people.length) loadPeople();
    window.location.hash = "messages/new";
  };

  const backToList = () => {
    setRecipient(null);
    window.location.hash = "messages";
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
              src={profile?.avatar_url || null}
              size={40}
            />
          </button>
        </div>
      </header>

      <div className="ms-wrap">
        {/* Conversation list */}
        <aside
          className={`ms-convs ${panel !== "list" ? "mobile-hidden" : ""}`}
        >
          <div className="ms-convs-head">
            <h3>Chats</h3>
            <button
              className="ms-new"
              aria-label="New message"
              title="New message"
              onClick={openComposer}
            >
              <i className="fa-solid fa-pen" />
            </button>
          </div>

          <div className="ms-convs-list">
            {filteredConvs.length === 0 ? (
              <div className="ms-empty">
                <i className="fa-solid fa-comment-slash" />
                <p>No chats yet. Tap the + to start one.</p>
              </div>
            ) : (
              filteredConvs.map((c) => (
                <button
                  key={c.other}
                  className={`ms-item ${recipient === c.other ? "active" : ""}`}
                  onClick={() => setRecipient(c.other)}
                >
                  <Avatar
                    name={c.name}
                    seed={c.avatar?.avatar ?? 0}
                    src={c.avatar?.avatar_url || null}
                    size={44}
                  />
                  <span className="ms-body">
                    <b>{c.name}</b>
                    <p>
                      {c.lastMine ? "You: " : ""}
                      {c.lastBody}
                    </p>
                  </span>
                  <span className="ms-side">
                    <span className="ms-time">{formatDay(c.lastAt)}</span>
                    {unread[c.other] > 0 && (
                      <span
                        className="ms-unread"
                        aria-label={`${unread[c.other]} unread`}
                      >
                        {unread[c.other]}
                      </span>
                    )}
                  </span>
                </button>
              ))
            )}
            <button
              className="ms-add"
              aria-label="New message"
              title="New message"
              onClick={openComposer}
            >
              <i className="fa-solid fa-plus" />
            </button>
          </div>
        </aside>

        {/* Chat area */}
        <section
          className={`ms-chat ${panel === "list" ? "mobile-hidden" : ""}`}
        >
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
                  <span>Festivity member</span>
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
                              ? profile?.avatar_url || null
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
              <h3 className="ms-compose-title">
                <i className="fa-solid fa-pen" /> New message
              </h3>
              <div className="user-search">
                <div className="search">
                  <i className="fa-solid fa-magnifying-glass" />
                  <input
                    placeholder="Search members…"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    aria-label="Search members"
                  />
                </div>
              </div>
              {matches.length === 0 ? (
                <p className="pick-empty">
                  No members found
                  {memberSearch ? ` for "${memberSearch}"` : ""}. They need to
                  sign up first.
                </p>
              ) : (
                matches.map((p) => (
                  <button
                    key={p.id}
                    className="user-row"
                    onClick={() => {
                      setRecipient(p.id);
                      setDraft("");
                      setChatSearch("");
                    }}
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
                <div className="ms-detail-sub">Festivity member</div>
                <div className="ms-detail-btns">
                  <button
                    className="ms-detail-btn"
                    onClick={() => goUser(recipient)}
                  >
                    <i className="fa-solid fa-id-card" /> Profile
                  </button>
                  <button
                    className="ms-detail-btn"
                    onClick={() =>
                      (window.location.hash = `hype/send?to=${recipient}`)
                    }
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
    </div>
  );
}
