import { useState } from "react";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import Reveal from "../components/Reveal";

const CATEGORIES = ["Community", "Culture", "Guide", "Playlist", "Scene"];
const ACCENTS = {
  Community: "#a04646",
  Culture: "#4a7a8f",
  Guide: "#5f8f2a",
  Playlist: "#8f4a6a",
  Scene: "#8f6a2a",
};

export default function NewPost({ setTab }) {
  const { addPost } = useStore();
  const { user, authLoading, name: authName, openAuth } = useAuth();
  const [form, setForm] = useState({
    title: "",
    category: "Community",
    body: "",
    author: authName || "",
  });
  const [error, setError] = useState("");

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) {
      setError("Give your post a headline and some words.");
      return;
    }
    setError("");
    addPost({
      title: form.title.trim(),
      category: form.category,
      body: form.body.trim(),
      author: form.author.trim() || authName || "Community writer",
      accent: ACCENTS[form.category] || "#a04646",
      date: new Date().toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
      readTime: `${Math.max(1, Math.ceil(form.body.trim().split(/\s+/).length / 200))} min read`,
      excerpt: form.body.trim().replace(/\s+/g, " ").slice(0, 180),
    });
    setTab("blog");
  };

  const back = (
    <button className="back-link" onClick={() => setTab("blog")}>
      <i className="fa-solid fa-arrow-left" /> Back to blog
    </button>
  );

  const head = (
    <header className="page-head reveal in">
      <div className="kicker">05 · Your voice on the scene</div>
      <h1>
        Write a post<span className="outline">.</span>
      </h1>
      <p className="lede">
        Share a scene report, a hosting guide or the playlist that owns your
        floor — straight to the blog.
      </p>
    </header>
  );

  if (authLoading) {
    return (
      <div className="page">
        <div className="profile-loader" aria-label="Loading" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="page">
        {back}
        {head}
        <div className="form-panel gate-panel">
          <div className="gate-icon">
            <i className="fa-solid fa-feather" />
          </div>
          <h2>Sign in to write a post</h2>
          <p>Your posts carry your name and sync across your devices.</p>
          <button className="btn" onClick={() => openAuth("blog/new")}>
            Sign in to continue <i className="fa-solid fa-arrow-right icon" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      {back}
      {head}

      <Reveal>
        <div className="form-panel">
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="np-title">Headline</label>
              <input
                id="np-title"
                className="input"
                placeholder="e.g. The best jollof stations in Accra this season"
                value={form.title}
                onChange={set("title")}
                maxLength={120}
              />
            </div>
            <div className="field">
              <label htmlFor="np-category">Category</label>
              <select
                id="np-category"
                className="input"
                value={form.category}
                onChange={set("category")}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="np-body">Your post</label>
              <textarea
                id="np-body"
                className="input"
                rows={10}
                placeholder="Leave a blank line between paragraphs — they become the story."
                value={form.body}
                onChange={set("body")}
              />
            </div>
            <div className="field">
              <label htmlFor="np-author">Your name (optional)</label>
              <input
                id="np-author"
                className="input"
                placeholder="e.g. Akosua"
                value={form.author}
                onChange={set("author")}
                maxLength={60}
              />
            </div>
            {error && (
              <p style={{ color: "var(--rose-deep)", marginBottom: 14, fontSize: 14 }}>
                {error}
              </p>
            )}
            <button
              type="submit"
              className="btn"
              style={{ width: "100%", justifyContent: "center" }}
            >
              Publish post <i className="fa-solid fa-feather icon" />
            </button>
          </form>
        </div>
      </Reveal>
    </div>
  );
}
