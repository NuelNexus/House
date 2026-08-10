import { useEffect, useMemo, useState } from "react";
import { useStore } from "../context/StoreContext";
import { useSocial } from "../context/SocialContext";
import { useAuth } from "../context/AuthContext";
import Avatar from "../components/Avatar";
import Reveal from "../components/Reveal";
import Modal from "../components/Modal";

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

const COVERS = ["👥", "🎧", "🎪", "🔥", "🍹", "🎬", "🕺", "🎨", "🎤", "🏖️"];

const ROLE_LABEL = { owner: "Owner", admin: "Admin", member: "Member" };

export default function Groups() {
  const {
    groups,
    groupMembers,
    groupPosts,
    groupsLoading,
    loadGroupDetail,
    createGroup,
    joinGroup,
    leaveGroup,
    postToGroup,
    deleteGroupPost,
    deleteGroup,
    notify,
  } = useStore();
  const { user, ensureAuth } = useAuth();
  const { fetchProfiles } = useSocial();

  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });
  const [composer, setComposer] = useState("");
  const [posting, setPosting] = useState(false);
  const [profs, setProfs] = useState({});

  const openGroup = useMemo(
    () => groups.find((g) => g.id === openId) || null,
    [groups, openId]
  );
  const members = openId ? groupMembers[openId] || [] : [];
  const posts = openId ? groupPosts[openId] || [] : [];

  const ensureProfs = async (ids) => {
    const clean = [...new Set((ids || []).filter(Boolean))];
    const missing = clean.filter((id) => !profs[id]);
    if (!missing.length) return;
    const map = await fetchProfiles(missing);
    setProfs((p) => ({ ...p, ...map }));
  };

  useEffect(() => {
    if (!openId) return;
    loadGroupDetail(openId);
  }, [openId, loadGroupDetail]);

  useEffect(() => {
    if (openGroup) {
      ensureProfs([
        openGroup.owner_id,
        ...members.map((m) => m.user_id),
        ...posts.map((p) => p.user_id),
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openGroup, members, posts]);

  const create = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const group = await createGroup({
      name: form.name.trim().slice(0, 60),
      description: form.description.trim().slice(0, 300),
      cover: form.cover || null,
    });
    if (group) {
      setCreating(false);
      setForm({ name: "", description: "" });
      setOpenId(group.id);
    }
  };

  const doJoin = async (id) => {
    if (!ensureAuth()) return;
    await joinGroup(id);
  };

  const doLeave = async (id) => {
    await leaveGroup(id);
    if (openId === id) setOpenId(null);
  };

  const submitPost = async (e) => {
    e.preventDefault();
    if (!ensureAuth()) return;
    if (!composer.trim()) return;
    setPosting(true);
    await postToGroup(openId, composer);
    setPosting(false);
    setComposer("");
  };

  const removePost = async (postId) => {
    const ok = await deleteGroupPost(openId, postId);
    if (ok) notify("Post removed");
  };

  const removeGroup = async () => {
    const ok = await deleteGroup(openId);
    if (ok) setOpenId(null);
  };

  const myRole = openGroup?.myRole || null;
  const me = user?.id;

  const head = (
    <header className="page-head reveal in">
      <div className="kicker">Communities</div>
      <h1>
        Groups<span className="outline">.</span>
      </h1>
      <p className="lede">
        Find your people — join a community, post inside it, and keep the
        conversation going beyond the party.
      </p>
    </header>
  );

  // ---------- Group detail -------------------------------------
  if (openGroup) {
    return (
      <div className="page">
        <button className="back-link" onClick={() => setOpenId(null)}>
          <i className="fa-solid fa-arrow-left" /> All groups
        </button>
        {head}

        <Reveal>
          <div className="card group-hero">
            <div className="group-cover">{openGroup.cover || "👥"}</div>
            <div className="group-hero-main">
              <h2>{openGroup.name}</h2>
              <p>{openGroup.description || "No description yet."}</p>
              <div className="group-meta">
                <span>
                  <i className="fa-solid fa-users" /> {openGroup.member_count || 0} members
                </span>
                <span>
                  <i className="fa-solid fa-user-tie" />{" "}
                  {profs[openGroup.owner_id]?.name || "Founder"}
                </span>
              </div>
            </div>
            <div className="group-hero-actions">
              {myRole === "owner" ? (
                <>
                  <span className="group-role-chip">
                    <i className="fa-solid fa-crown" /> You own this group
                  </span>
                  <button className="btn btn-sm btn-outline danger" onClick={removeGroup}>
                    <i className="fa-solid fa-trash-can" /> Delete group
                  </button>
                </>
              ) : myRole ? (
                <button className="btn btn-sm btn-outline" onClick={() => doLeave(openGroup.id)}>
                  <i className="fa-solid fa-right-from-bracket" /> Leave
                </button>
              ) : (
                <button className="btn btn-sm" onClick={() => doJoin(openGroup.id)}>
                  <i className="fa-solid fa-user-plus" /> Join group
                </button>
              )}
            </div>
          </div>
        </Reveal>

        <div className="group-cols">
          <div>
            <Reveal>
              <div className="section-label">Posts ({posts.length})</div>
              {myRole && (
                <form className="group-composer card" onSubmit={submitPost}>
                  <div className="group-composer-top">
                    <Avatar
                      name={user ? "You" : "?"}
                      seed={0}
                      size={34}
                    />
                    <input
                      className="input"
                      placeholder={`Post in ${openGroup.name}…`}
                      value={composer}
                      onChange={(e) => setComposer(e.target.value)}
                      maxLength={400}
                    />
                  </div>
                  <div className="group-composer-foot">
                    <button className="btn btn-sm" type="submit" disabled={posting || !composer.trim()}>
                      {posting ? "Posting…" : "Post"}
                    </button>
                  </div>
                </form>
              )}
              {posts.length === 0 ? (
                <div className="empty-state">
                  <i className="fa-solid fa-comments" />
                  <h3>No posts yet</h3>
                  <p>
                    {myRole
                      ? "Start the conversation — say something to the group."
                      : "Join the group to post here."}
                  </p>
                </div>
              ) : (
                <div className="group-post-list">
                  {posts.map((p) => {
                    const author = profs[p.user_id] || null;
                    return (
                      <article className="card group-post" key={p.id}>
                        <div className="group-post-head">
                          <Avatar
                            name={author?.name || "Member"}
                            seed={author?.avatar ?? 0}
                            src={author?.avatar_url || null}
                            size={36}
                          />
                          <div>
                            <b>{author?.name || "Member"}</b>
                            <small>{timeAgo(p.created_at)}</small>
                          </div>
                          {me === p.user_id && (
                            <button
                              className="gallery-item-del"
                              aria-label="Delete post"
                              title="Delete"
                              onClick={() => removePost(p.id)}
                            >
                              <i className="fa-solid fa-trash-can" />
                            </button>
                          )}
                        </div>
                        <p className="group-post-body">{p.body}</p>
                      </article>
                    );
                  })}
                </div>
              )}
            </Reveal>
          </div>

          <div>
            <Reveal>
              <div className="section-label">Members ({members.length || openGroup.member_count || 0})</div>
              <div className="card group-members">
                {members.length === 0 ? (
                  <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>
                    No members yet — be the first to join.
                  </p>
                ) : (
                  members.map((m) => {
                    const prof = profs[m.user_id] || null;
                    return (
                      <div className="group-member" key={m.user_id}>
                        <Avatar
                          name={prof?.name || "Member"}
                          seed={prof?.avatar ?? 0}
                          src={prof?.avatar_url || null}
                          size={38}
                        />
                        <span>{prof?.name || "Member"}</span>
                        {m.role !== "member" && (
                          <em className="group-role-chip">{ROLE_LABEL[m.role]}</em>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Group list ---------------------------------------
  return (
    <div className="page">
      {head}

      <Reveal>
        <div className="page-tools">
          <div className="section-label" style={{ margin: 0 }}>
            All groups ({groups.length})
          </div>
          <button className="btn" onClick={() => setCreating(true)}>
            <i className="fa-solid fa-plus icon" /> Create a group
          </button>
        </div>
      </Reveal>

      {groupsLoading && groups.length === 0 ? (
        <div className="profile-loader" aria-label="Loading groups" />
      ) : groups.length === 0 ? (
        <div className="empty-state">
          <i className="fa-solid fa-people-group" />
          <h3>No groups yet</h3>
          <p>
            Create the first community — parties, vibes, your city, anything.
          </p>
          <button className="btn" onClick={() => setCreating(true)}>
            Create a group
          </button>
        </div>
      ) : (
        <div className="grid">
          {groups.map((g, i) => (
            <Reveal key={g.id} delay={Math.min(i, 8) * 60}>
              <article
                className="card group-card"
                role="button"
                tabIndex={0}
                onClick={() => setOpenId(g.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setOpenId(g.id);
                  }
                }}
              >
                <div className="group-card-top">
                  <span className="group-cover">{g.cover || "👥"}</span>
                  {g.myRole && <span className="group-role-chip">{g.myRole === "owner" ? "Yours" : "Joined"}</span>}
                </div>
                <h3>{g.name}</h3>
                <p className="group-card-desc">
                  {g.description || "A FesGH community."}
                </p>
                <div className="group-card-foot">
                  <span>
                    <i className="fa-solid fa-users" /> {g.member_count || 0}
                  </span>
                  <button
                    className={`btn btn-sm ${g.myRole ? "btn-outline" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (g.myRole) doLeave(g.id);
                      else doJoin(g.id);
                    }}
                  >
                    {g.myRole ? "Leave" : "Join"}
                  </button>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      )}

      {creating && (
        <Modal title="Create a group" onClose={() => setCreating(false)}>
          <form onSubmit={create}>
            <div className="field">
              <label htmlFor="gr-name">Group name</label>
              <input
                id="gr-name"
                className="input"
                placeholder="e.g. Accra House Heads"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                maxLength={60}
                autoFocus
              />
            </div>
            <div className="field">
              <label htmlFor="gr-desc">Description</label>
              <textarea
                id="gr-desc"
                className="input"
                rows={3}
                placeholder="What's this community about?"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
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
                    className={`chip group-cover-chip ${form.cover === c ? "active" : ""}`}
                    onClick={() => setForm((f) => ({ ...f, cover: c }))}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div className="designer-save">
              <button type="button" className="btn btn-outline" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button type="submit" className="btn" disabled={!form.name.trim()}>
                <i className="fa-solid fa-check icon" /> Create group
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
