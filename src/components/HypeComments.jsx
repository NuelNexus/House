import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useSocial } from "../context/SocialContext";
import Avatar from "./Avatar";

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
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function HypeComments({ hype, onClose }) {
  const { user, openAuth } = useAuth();
  const { loadComments, addComment, deleteComment } = useSocial();
  const [comments, setComments] = useState(null); // null = loading
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef(null);

  useEffect(() => {
    let active = true;
    loadComments(hype.id)
      .then((rows) => {
        if (active) setComments(rows || []);
      })
      .catch(() => {
        if (active) setComments([]);
      });
    return () => {
      active = false;
    };
  }, [hype.id, loadComments]);

  // New comments land at the bottom — keep the newest in view.
  useEffect(() => {
    if (comments && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [comments]);

  // Escape closes the drawer.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = useCallback(
    async (e) => {
      e.preventDefault();
      if (!user) {
        openAuth();
        return;
      }
      const text = body.trim();
      if (!text || sending) return;
      setSending(true);
      setError("");
      try {
        const row = await addComment(hype.id, text);
        setComments((p) => [...(p || []), row]);
        setBody("");
      } catch (err) {
        setError(err.message || "Couldn't post the comment");
      } finally {
        setSending(false);
      }
    },
    [user, openAuth, body, sending, addComment, hype.id]
  );

  const remove = useCallback(
    async (c) => {
      try {
        await deleteComment(c.id, hype.id);
        setComments((p) => (p || []).filter((x) => x.id !== c.id));
      } catch {
        /* keep it simple — failure just leaves the comment */
      }
    },
    [deleteComment, hype.id]
  );

  return (
    <div className="hype-comments" onClick={(e) => e.stopPropagation()}>
      <div className="hype-comments-head">
        <h4>
          Comments <span>{comments ? comments.length : "…"}</span>
        </h4>
        <button className="hype-comments-close" aria-label="Close comments" onClick={onClose}>
          <i className="fa-solid fa-xmark" />
        </button>
      </div>

      <div className="hype-comments-list" ref={listRef}>
        {comments === null ? (
          <div className="hype-comments-empty">
            <i className="fa-solid fa-spinner fa-spin" /> Loading…
          </div>
        ) : comments.length === 0 ? (
          <div className="hype-comments-empty">
            <i className="fa-solid fa-comment-dots" />
            <p>No comments yet — be the first to hype it up.</p>
          </div>
        ) : (
          comments.map((c) => (
            <div className="hype-comment" key={c.id}>
              <Avatar
                name={c.author?.name || "Fest GH member"}
                seed={c.author?.avatar ?? 0}
                src={c.author?.avatar_url || null}
                size={34}
              />
              <div className="hype-comment-body">
                <div className="hype-comment-meta">
                  <span className="hype-comment-name">
                    {c.author?.name || "Fest GH member"}
                  </span>
                  <span className="hype-comment-time">{timeAgo(c.created_at)}</span>
                </div>
                <p className="hype-comment-text">{c.body}</p>
              </div>
              {user && c.user_id === user.id && (
                <button
                  className="hype-comment-del"
                  aria-label="Delete comment"
                  onClick={() => remove(c)}
                >
                  <i className="fa-solid fa-trash-can" />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <form className="hype-comment-form" onSubmit={submit}>
        {error && <p className="hype-comment-error">{error}</p>}
        <div className="hype-comment-input">
          <Avatar
            name={user?.name || "Guest"}
            seed={user ? 3 : 0}
            size={30}
          />
          <input
            value={body}
            maxLength={280}
            placeholder={user ? "Add a comment…" : "Sign in to comment"}
            onChange={(e) => setBody(e.target.value)}
            aria-label="Add a comment"
            onClick={() => {
              if (!user) openAuth();
            }}
          />
          <button className="hype-comment-send" disabled={sending || !body.trim()} type="submit">
            {sending ? (
              <i className="fa-solid fa-spinner fa-spin" />
            ) : (
              <i className="fa-solid fa-paper-plane" />
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
