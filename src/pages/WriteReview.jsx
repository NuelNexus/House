import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import Reveal from "../components/Reveal";

export default function WriteReview({ setTab, q }) {
  const { allParties, tickets, addReview } = useStore();
  const { user, authLoading, name: authName, openAuth } = useAuth();
  const prefilled = q?.party || "";
  const options = useMemo(() => {
    const list = [
      ...allParties.map((p) => p.title),
      ...tickets.map((t) => t.name),
    ];
    // A party can arrive via the URL (?party=...) even if it was
    // removed from the lists — keep it selectable either way.
    return prefilled && !list.includes(prefilled) ? [prefilled, ...list] : list;
  }, [allParties, tickets, prefilled]);
  const [form, setForm] = useState({
    partyName: prefilled || options[0] || "",
    rating: 0,
    title: "",
    comment: "",
    author: authName || "",
  });
  const [error, setError] = useState("");

  // Keep the selection in sync if the deep link changes while mounted
  // (e.g. #reviews/new?party=A → ?party=B). Only reacts when the
  // prefilled party itself changes, so the user's own selection in the
  // dropdown is never overwritten by unrelated store re-renders.
  const lastPrefilledRef = useRef(prefilled);
  useEffect(() => {
    if (prefilled !== lastPrefilledRef.current) {
      lastPrefilledRef.current = prefilled;
      if (options.includes(prefilled)) {
        setForm((f) => ({ ...f, partyName: prefilled }));
      }
    }
  }, [prefilled, options]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    if (form.rating === 0 || !form.title.trim() || !form.comment.trim()) {
      setError("Pick a rating, a headline and your thoughts.");
      return;
    }
    setError("");
    addReview({
      partyName: form.partyName,
      rating: form.rating,
      title: form.title.trim(),
      comment: form.comment.trim(),
      author: form.author.trim() || authName || "Anonymous Guest",
      date: new Date().toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
    });
    // Reviews now live under the party — head back there if we came
    // from one, otherwise land on the parties tab.
    setTab(q?.back ? `party/${q.back}` : "parties");
  };

  const back = (
    <button className="back-link" onClick={() => setTab(q?.back ? `party/${q.back}` : "parties")}>
      <i className="fa-solid fa-arrow-left" /> {q?.back ? "Back to the party" : "Back to parties"}
    </button>
  );

  const head = (
    <header className="page-head reveal in">
      <div className="kicker">03 · Honest opinions</div>
      <h1>
        Write a review<span className="outline">.</span>
      </h1>
      <p className="lede">
        No hype, just truth. Rate the vibe, the crowd, the music and the drinks.
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
            <i className="fa-solid fa-comment-dots" />
          </div>
          <h2>Sign in to write a review</h2>
          <p>
            Reviews carry your name and stay in sync across your devices.
          </p>
          <button className="btn" onClick={() => openAuth("reviews/new")}>
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
              <label htmlFor="rv-party">Which party?</label>
              <select
                id="rv-party"
                className="input"
                value={form.partyName}
                onChange={set("partyName")}
              >
                {options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Your rating</label>
              <div className="star-picker" role="radiogroup" aria-label="Rating">
                {[1, 2, 3, 4, 5].map((n) => (
                  <i
                    key={n}
                    role="radio"
                    aria-checked={form.rating === n}
                    tabIndex={0}
                    className={`${n <= form.rating ? "on" : ""} fa-solid fa-star`}
                    onClick={() => setForm((f) => ({ ...f, rating: n }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setForm((f) => ({ ...f, rating: n }));
                      }
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="field">
              <label htmlFor="rv-title">Headline</label>
              <input
                id="rv-title"
                className="input"
                placeholder="e.g. Best night of the year"
                value={form.title}
                onChange={set("title")}
              />
            </div>
            <div className="field">
              <label htmlFor="rv-comment">Your review</label>
              <textarea
                id="rv-comment"
                className="input"
                placeholder="How was the vibe, the crowd, the music?"
                value={form.comment}
                onChange={set("comment")}
              />
            </div>
            <div className="field">
              <label htmlFor="rv-author">Your name (optional)</label>
              <input
                id="rv-author"
                className="input"
                placeholder="e.g. Akosua"
                value={form.author}
                onChange={set("author")}
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
              Publish review <i className="fa-solid fa-pen icon" />
            </button>
          </form>
        </div>
      </Reveal>
    </div>
  );
}
