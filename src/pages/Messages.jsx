import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useSocial } from "../context/SocialContext";
import { useStore } from "../context/StoreContext";
import { useTheme } from "../context/ThemeContext";
import { goUser } from "../lib/nav";
import Avatar from "../components/Avatar";
import VideoRecorder from "../components/VideoRecorder";
import HypePlayerSlide from "../components/HypePlayerSlide";
import Modal from "../components/Modal";

const COVERS = ["👥", "🎧", "🎪", "🔥", "🍹", "🎬", "🕺", "🎨", "🎤", "🏖️"];

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

// A group opened inside Messages — posts + composer + members.
function MsGroupDetail({
  group,
  members,
  posts,
  profs,
  me,
  myRole,
  onBack,
  onJoin,
  onLeave,
  onPost,
  posting,
  composer,
  setComposer,
  onDeletePost,
}) {
  return (
    <div className="ms-group-detail">
      <div className="ms-chat-head">
        <button className="ms-back" aria-label="Back" onClick={onBack}>
          <i className="fa-solid fa-arrow-left" />
        </button>
        <span className="ms-group-cover">{group.cover || "👥"}</span>
        <div className="ms-chat-title">
          <b>{group.name}</b>
          <span>{group.member_count || 0} members</span>
        </div>
        {myRole === "owner" ? (
          <span className="group-role-chip">Owner</span>
        ) : myRole ? (
          <button className="ms-head-icon" title="Leave group" onClick={onLeave}>
            <i className="fa-solid fa-right-from-bracket" />
          </button>
        ) : (
          <button className="btn btn-sm" onClick={onJoin}>
            <i className="fa-solid fa-user-plus" /> Join
          </button>
        )}
      </div>

      {myRole && (
        <form className="ms-group-composer" onSubmit={onPost}>
          <input
            className="input"
            placeholder={`Post in ${group.name}…`}
            value={composer}
            onChange={(e) => setComposer(e.target.value)}
            maxLength={400}
          />
          <button className="btn btn-sm" type="submit" disabled={posting || !composer.trim()}>
            {posting ? "Posting…" : "Post"}
          </button>
        </form>
      )}

      <div className="ms-bubbles ms-group-posts">
        {posts.length === 0 ? (
          <p className="ms-none">
            {myRole ? "Start the conversation." : "Join the group to post here."}
          </p>
        ) : (
          posts.map((p) => {
            const author = profs[p.user_id] || null;
            return (
              <div className="group-post" key={p.id}>
                <div className="group-post-head">
                  <Avatar
                    name={author?.name || "Member"}
                    seed={author?.avatar ?? 0}
                    src={author?.avatar_url || null}
                    size={34}
                  />
                  <div>
                    <b>{author?.name || "Member"}</b>
                    <small>{formatDay(p.created_at)}</small>
                  </div>
                  {me === p.user_id && (
                    <button
                      className="gallery-item-del"
                      title="Delete"
                      onClick={() => onDeletePost(p.id)}
                    >
                      <i className="fa-solid fa-trash-can" />
                    </button>
                  )}
                </div>
                <p className="group-post-body">{p.body}</p>
              </div>
            );
          })
        )}
      </div>

      <div className="ms-group-members">
        {members.length === 0 ? (
          <small>No members yet.</small>
        ) : (
          members.map((m) => {
            const prof = profs[m.user_id] || null;
            return (
              <span
                className="ms-group-member"
                key={m.user_id}
                title={prof?.name || "Member"}
              >
                <Avatar
                  name={prof?.name || "M"}
                  seed={prof?.avatar ?? 0}
                  src={prof?.avatar_url || null}
                  size={34}
                />
              </span>
            );
          })
        )}
      </div>
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
    fetchProfiles,
  } = useSocial();
  const {
    groups,
    groupMembers,
    groupPosts,
    loadGroupDetail,
    createGroup,
    joinGroup,
    leaveGroup,
    postToGroup,
    deleteGroupPost,
  } = useStore();
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

  // Groups live on the message side: Chats | Groups sections, a plus
  // button to start a chat or make a group, and an in-chat group detail.
  const [msSection, setMsSection] = useState("chats");
  const [openGroupId, setOpenGroupId] = useState(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [groupForm, setGroupForm] = useState({ name: "", description: "", cover: null });
  const [groupComposer, setGroupComposer] = useState("");
  const [groupPosting, setGroupPosting] = useState(false);
  const [groupProfs, setGroupProfs] = useState({});
  const chatSearchRef = useRef(null);

  const openGroup = openGroupId ? groups.find((g) => g.id === openGroupId) : null;
  const groupMembersList = openGroupId ? groupMembers[openGroupId] || [] : [];
  const groupPostList = openGroupId ? groupPosts[openGroupId] || [] : [];

  useEffect(() => {
    if (openGroupId) loadGroupDetail(openGroupId);
  }, [openGroupId, loadGroupDetail]);

  useEffect(() => {
    if (!openGroupId) return;
    const ids = [
      openGroup?.owner_id,
      ...groupMembersList.map((m) => m.user_id),
      ...groupPostList.map((p) => p.user_id),
    ].filter(Boolean);
    const missing = [...new Set(ids)].filter((id) => !groupProfs[id]);
    if (!missing.length) return;
    (async () => {
      const map = await fetchProfiles(missing);
      setGroupProfs((p) => ({ ...p, ...map }));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openGroupId, openGroup, groupMembersList, groupPostList]);

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
          name: f.name || "FesGH member",
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

  // ---- Groups ------------------------------------------------
  const doJoinGroup = async (id) => {
    await joinGroup(id);
  };

  const doLeaveGroup = async (id) => {
    if (openGroupId === id) setOpenGroupId(null);
    await leaveGroup(id);
  };

  const submitGroupPost = async (e) => {
    e.preventDefault();
    if (!openGroupId || !groupComposer.trim()) return;
    setGroupPosting(true);
    await postToGroup(openGroupId, groupComposer);
    setGroupPosting(false);
    setGroupComposer("");
  };

  const createGroupNow = async (e) => {
    e.preventDefault();
    if (!groupForm.name.trim()) return;
    const g = await createGroup({
      name: groupForm.name.trim().slice(0, 60),
      description: groupForm.description.trim().slice(0, 300),
      cover: groupForm.cover || null,
    });
    if (g) {
      setCreateOpen(false);
      setGroupForm({ name: "", description: "", cover: null });
      setMsSection("groups");
      setOpenGroupId(g.id);
    }
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
                  <span>FesGH member</span>
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
          ) : openGroup ? (
            <MsGroupDetail
              group={openGroup}
              members={groupMembersList}
              posts={groupPostList}
              profs={groupProfs}
              me={user?.id}
              myRole={openGroup?.myRole || null}
              onBack={() => setOpenGroupId(null)}
              onJoin={() => doJoinGroup(openGroup.id)}
              onLeave={() => doLeaveGroup(openGroup.id)}
              onPost={submitGroupPost}
              posting={groupPosting}
              composer={groupComposer}
              setComposer={setGroupComposer}
              onDeletePost={(postId) => deleteGroupPost(openGroup.id, postId)}
            />
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

              {/* Chats | Groups + the add (+) chooser */}
              <div className="ms-compose-head">
                <div className="ms-section-switch" role="tablist" aria-label="Chats or groups">
                  <button
                    role="tab"
                    aria-selected={msSection === "chats"}
                    className={msSection === "chats" ? "active" : ""}
                    onClick={() => setMsSection("chats")}
                  >
                    <i className="fa-solid fa-comment-dots" /> Chats
                  </button>
                  <button
                    role="tab"
                    aria-selected={msSection === "groups"}
                    className={msSection === "groups" ? "active" : ""}
                    onClick={() => setMsSection("groups")}
                  >
                    <i className="fa-solid fa-people-group" /> Groups
                  </button>
                </div>
                <div className="ms-plus-wrap">
                  <button
                    className="ms-plus"
                    aria-label="Add"
                    aria-expanded={plusOpen}
                    onClick={() => setPlusOpen((o) => !o)}
                  >
                    <i className="fa-solid fa-plus" />
                  </button>
                  {plusOpen && (
                    <div className="ms-plus-menu">
                      <button
                        onClick={() => {
                          setPlusOpen(false);
                          setMsSection("chats");
                          window.setTimeout(() => chatSearchRef.current?.focus(), 50);
                        }}
                      >
                        <i className="fa-solid fa-user-plus" />
                        <span>
                          <b>Add someone</b>
                          <small>Start a new chat</small>
                        </span>
                      </button>
                      <button
                        onClick={() => {
                          setPlusOpen(false);
                          setCreateOpen(true);
                        }}
                      >
                        <i className="fa-solid fa-people-group" />
                        <span>
                          <b>Make a group</b>
                          <small>Create a community</small>
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {msSection === "chats" ? (
                <>
                  <div className="user-search">
                    <div className="search">
                      <i className="fa-solid fa-magnifying-glass" />
                      <input
                        ref={chatSearchRef}
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
                </>
              ) : (
                <div className="ms-groups">
                  {groups.length === 0 ? (
                    <p className="pick-empty">
                      No groups yet — hit the + and make one for your people.
                    </p>
                  ) : (
                    groups.map((g) => (
                      <button
                        key={g.id}
                        className="ms-group-row"
                        onClick={() => setOpenGroupId(g.id)}
                      >
                        <span className="ms-group-cover">{g.cover || "👥"}</span>
                        <span className="ms-group-mid">
                          <b>{g.name}</b>
                          <small>
                            {g.member_count || 0} members ·{" "}
                            {g.description || "A FesGH community."}
                          </small>
                        </span>
                        {g.myRole ? (
                          <span className="group-role-chip">
                            {g.myRole === "owner" ? "Yours" : "Joined"}
                          </span>
                        ) : (
                          <em
                            className="ms-group-join"
                            onClick={(e) => {
                              e.stopPropagation();
                              doJoinGroup(g.id);
                            }}
                          >
                            Join
                          </em>
                        )}
                      </button>
                    ))
                  )}
                </div>
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
                <div className="ms-detail-sub">FesGH member</div>
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
                    No one found — ask a friend to join FesGH first.
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

      {/* Make a group */}
      {createOpen && (
        <Modal title="Make a group" onClose={() => setCreateOpen(false)}>
          <form onSubmit={createGroupNow}>
            <div className="field">
              <label htmlFor="mg-name">Group name</label>
              <input
                id="mg-name"
                className="input"
                placeholder="e.g. Accra House Heads"
                value={groupForm.name}
                onChange={(e) =>
                  setGroupForm((f) => ({ ...f, name: e.target.value }))
                }
                maxLength={60}
                autoFocus
              />
            </div>
            <div className="field">
              <label htmlFor="mg-desc">Description</label>
              <textarea
                id="mg-desc"
                className="input"
                rows={3}
                placeholder="What's this community about?"
                value={groupForm.description}
                onChange={(e) =>
                  setGroupForm((f) => ({ ...f, description: e.target.value }))
                }
                maxLength={300}
              />
            </div>
            <div className="field">
              <label>Cover</label>
              <div className="chips" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {COVERS.map((c) => (
                  <button
                    type="button"
                    key={c}
                    className={`chip group-cover-chip ${groupForm.cover === c ? "active" : ""}`}
                    onClick={() => setGroupForm((f) => ({ ...f, cover: c }))}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div className="designer-save">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </button>
              <button type="submit" className="btn" disabled={!groupForm.name.trim()}>
                <i className="fa-solid fa-check icon" /> Create group
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
