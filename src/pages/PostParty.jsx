import { useState } from "react";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import Reveal from "../components/Reveal";
import TicketDesigner from "../components/TicketDesigner";
import { DEFAULT_DESIGN } from "../lib/ticketPresets";

const CATEGORIES = ["Kickback", "Rave", "Rooftop", "Pool", "Villa", "Birthday", "Games night"];

export default function PostParty({ setTab }) {
  const { postParty } = useStore();
  const { user, authLoading, name: authName, openAuth } = useAuth();
  const [form, setForm] = useState({
    title: "",
    host: authName || "",
    date: "",
    location: "",
    price: "0",
    capacity: "",
    description: "",
    category: CATEGORIES[0],
  });
  const [sellTickets, setSellTickets] = useState(false);
  const [design, setDesign] = useState(null);
  const [error, setError] = useState("");

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const toggleTickets = () => {
    if (!sellTickets && (!design || !Object.keys(design).length)) {
      // First time on: seed the ticket from what they've typed so far.
      setDesign({
        ...DEFAULT_DESIGN,
        name: form.title || "",
        depart: form.location || "",
        date: form.date || "",
        price: String(form.price || ""),
        stock: Number(form.capacity) || 100,
      });
    }
    setSellTickets((on) => !on);
  };

  const submit = (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.date.trim() || !form.location.trim() || !form.description.trim()) {
      setError("Title, date, location and description are required.");
      return;
    }
    setError("");
    postParty({
      title: form.title.trim(),
      host: form.host.trim() || authName || "Anonymous Host",
      date: form.date.trim(),
      location: form.location.trim(),
      price: Math.max(0, Number(form.price) || 0),
      capacity: form.capacity.trim(),
      description: form.description.trim(),
      category: form.category,
      ticketDesign:
        sellTickets && design && Object.keys(design).length
          ? { ...design, enabled: true }
          : null,
    });
    setTab("parties");
  };

  const back = (
    <button className="back-link" onClick={() => setTab("parties")}>
      <i className="fa-solid fa-arrow-left" /> Back to parties
    </button>
  );

  const head = (
    <header className="page-head reveal in">
      <div className="kicker">Host on the scene</div>
      <h1>
        Post a party<span className="outline">.</span>
      </h1>
      <p className="lede">
        Put your kickback, rave or rooftop session on the calendar for the
        whole city to see.
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
            <i className="fa-solid fa-champagne-glasses" />
          </div>
          <h2>Sign in to post a party</h2>
          <p>
            Your parties show up on the scene with your name and stay in sync
            across your devices.
          </p>
          <button className="btn" onClick={() => openAuth("parties/new")}>
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
        <div className={`form-panel ${sellTickets ? "wide" : ""}`}>
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="pp-title">Party name</label>
              <input
                id="pp-title"
                className="input"
                placeholder="e.g. The Mansion Rave"
                value={form.title}
                onChange={set("title")}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="field">
                <label htmlFor="pp-host">Your name</label>
                <input
                  id="pp-host"
                  className="input"
                  placeholder="Host"
                  value={form.host}
                  onChange={set("host")}
                />
              </div>
              <div className="field">
                <label htmlFor="pp-date">Date & time</label>
                <input
                  id="pp-date"
                  className="input"
                  placeholder="Sat, Dec 20 · 7 PM"
                  value={form.date}
                  onChange={set("date")}
                />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="field">
                <label htmlFor="pp-location">Location</label>
                <input
                  id="pp-location"
                  className="input"
                  placeholder="e.g. East Legon, Accra"
                  value={form.location}
                  onChange={set("location")}
                />
              </div>
              <div className="field">
                <label htmlFor="pp-price">Door price (GH₵, 0 = free)</label>
                <input
                  id="pp-price"
                  type="number"
                  min="0"
                  className="input"
                  value={form.price}
                  onChange={set("price")}
                />
              </div>
            </div>
            <div className="field">
              <label>Category</label>
              <div className="chips" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {CATEGORIES.map((c) => (
                  <button
                    type="button"
                    key={c}
                    className={`chip ${form.category === c ? "active" : ""}`}
                    onClick={() => setForm((f) => ({ ...f, category: c }))}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label htmlFor="pp-desc">Description</label>
              <textarea
                id="pp-desc"
                className="input"
                placeholder="What's the vibe? Music, food, dress code..."
                value={form.description}
                onChange={set("description")}
              />
            </div>
            <div className="field">
              <label className="toggle-row" htmlFor="pp-tickets">
                <input
                  id="pp-tickets"
                  type="checkbox"
                  checked={sellTickets}
                  onChange={toggleTickets}
                />
                <span>
                  <b>Sell tickets for this party</b>
                  <small>Build a custom ticket — presets, photo, your own lines.</small>
                </span>
              </label>
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
              Put it on the scene <i className="fa-solid fa-arrow-right icon" />
            </button>
          </form>

          {sellTickets && (
            <div className="post-ticket-designer">
              <TicketDesigner
                value={design || DEFAULT_DESIGN}
                onChange={setDesign}
              />
            </div>
          )}
        </div>
      </Reveal>
    </div>
  );
}
