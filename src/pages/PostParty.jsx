import { useEffect, useMemo, useState } from "react";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import Reveal from "../components/Reveal";
import TicketDesigner from "../components/TicketDesigner";
import { DEFAULT_DESIGN } from "../lib/ticketPresets";

const CATEGORIES = ["Kickback", "Rave", "Rooftop", "Pool", "Villa", "Birthday", "Games night"];

// ------------------------------------------------------------------
// Post a party — two roles, never mixed:
//   · HOST (anyone signed in): posts a party's details. It lands in the
//     pool on the Affiliate page — NOT the Events page — until an
//     approved affiliate reposts it. Hosts keep 65% of every repost sale.
//   · AFFILIATE: #parties/new?repost=<id> copies a host's party from the
//     pool, sets their own price + ticket design, and puts it live on
//     the scene. They earn 5% on every ticket sold through their repost.
// ------------------------------------------------------------------

export default function PostParty({ setTab, q }) {
  const { postParty, repostParty, hostPartyPool } = useStore();
  const { user, authLoading, name: authName, openAuth, affiliate } = useAuth();
  const isAffiliate = affiliate?.status === "approved";
  const repostId = q?.repost || null;

  // The host party being reposted (affiliate flow).
  const repostTarget = useMemo(
    () => (repostId ? hostPartyPool.find((p) => p.id === repostId) || null : null),
    [repostId, hostPartyPool]
  );

  const [form, setForm] = useState(() => ({
    title: repostTarget?.title || "",
    host: authName || repostTarget?.host || "",
    date: repostTarget?.date || "",
    location: repostTarget?.location || "",
    price: "0",
    capacity: "",
    description: repostTarget?.description || "",
    category: repostTarget?.category || CATEGORIES[0],
  }));
  const [sellTickets, setSellTickets] = useState(false);
  const [design, setDesign] = useState(null);
  const [error, setError] = useState("");

  // The repost target loads from the cloud (hostPartyPool arrives async),
  // so prefill the form once the party appears — e.g. on a deep link or
  // after a refresh the pool may not be loaded yet. Repost mode defaults
  // to selling tickets with a ready design, so a repost is never posted
  // without a priceable ticket by accident.
  useEffect(() => {
    if (!repostTarget) return;
    setForm((f) => ({
      ...f,
      title: f.title || repostTarget.title || "",
      host: f.host || repostTarget.host || authName || "",
      date: f.date || repostTarget.date || "",
      location: f.location || repostTarget.location || "",
      description: f.description || repostTarget.description || "",
      category: f.category || repostTarget.category || CATEGORIES[0],
    }));
    setSellTickets(true);
    setDesign((d) =>
      d || {
        ...DEFAULT_DESIGN,
        name: repostTarget.title || "",
        depart: repostTarget.location || "",
        date: repostTarget.date || "",
        price: "0",
        stock: 100,
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repostTarget?.id]);

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

    if (repostTarget) {
      // Affiliate reposting a host's party — their price + ticket go
      // live on the scene as their own listing.
      if (!isAffiliate) {
        setError("Reposting parties is exclusive to approved affiliates.");
        return;
      }
      repostParty(repostTarget.id, {
        price: Math.max(0, Number(form.price) || 0),
        capacity: form.capacity.trim(),
        ticketDesign:
          sellTickets && design && Object.keys(design).length
            ? { ...design, enabled: true }
            : null,
      });
      setTab("host");
      return;
    }

    // Host role: post the party's details into the affiliate pool.
    postParty({
      title: form.title.trim(),
      host: form.host.trim() || authName || "Anonymous Host",
      date: form.date.trim(),
      location: form.location.trim(),
      price: 0,
      capacity: "",
      description: form.description.trim(),
      category: form.category,
    });
    setTab("affiliate");
  };

  const backTarget = repostTarget ? "host" : "affiliate";
  const back = (
    <button className="back-link" onClick={() => setTab(backTarget)}>
      <i className="fa-solid fa-arrow-left" />{" "}
      Back to the Affiliate program
    </button>
  );

  const head = (
    <header className="page-head reveal in">
      <div className="kicker">
        {repostTarget ? "Affiliate repost" : "Post a party"}
      </div>
      <h1>
        {repostTarget ? "Repost with your price" : "Post a party"}
        <span className="outline">.</span>
      </h1>
      <p className="lede">
        {repostTarget
          ? `${repostTarget.host || "Someone"} posted “${repostTarget.title}” on the scene. Repost it with your own price and ticket — it goes live on the Events page and you earn 5% on every sale.`
          : "You're the host — post your party's details and it lands in the pool on the Affiliate page. An approved affiliate reposts it with their price and puts it on the scene; you keep 65% of every sale."}
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
            Post your party and it lands in the affiliate pool — approved
            affiliates repost it with their price and sell the tickets.
          </p>
          <button className="btn" onClick={() => openAuth("parties/new")}>
            Sign in to continue <i className="fa-solid fa-arrow-right icon" />
          </button>
        </div>
      </div>
    );
  }

  // Reposting + pricing is exclusive to approved affiliates — a
  // non-affiliate hitting a repost link sees this gate instead of a
  // confusing "already gone" screen (they can't see the pool either).
  if (!isAffiliate && repostId) {
    return (
      <div className="page">
        {back}
        {head}
        <div className="form-panel gate-panel">
          <div className="gate-icon">
            <i className="fa-solid fa-handshake" />
          </div>
          <h2>Reposting is for approved affiliates</h2>
          <p>
            You can post your own parties anytime — but reposting one with
            your own price and selling tickets is exclusive to approved
            affiliates.
          </p>
          <button className="btn" onClick={() => setTab("host")}>
            Go to the Affiliate program <i className="fa-solid fa-arrow-right icon" />
          </button>
        </div>
      </div>
    );
  }

  // An approved affiliate trying to repost a party that no longer exists.
  if (repostId && !repostTarget) {
    return (
      <div className="page">
        {back}
        {head}
        <div className="form-panel gate-panel">
          <div className="gate-icon">
            <i className="fa-solid fa-hourglass-half" />
          </div>
          <h2>That party's gone</h2>
          <p>
            The host may have removed it. Head back to the Affiliate
            program to see the parties still waiting in the pool.
          </p>
          <button className="btn" onClick={() => setTab("host")}>
            Back to the Affiliate program <i className="fa-solid fa-arrow-right icon" />
          </button>
        </div>
      </div>
    );
  }

  const showCommerce = !!repostTarget;

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
                disabled={!!repostTarget}
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
                  disabled={!!repostTarget}
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
                  disabled={!!repostTarget}
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
                  disabled={!!repostTarget}
                />
              </div>
              {showCommerce ? (
                <div className="field">
                  <label htmlFor="pp-price">
                    Your repost price (GH₵, 0 = free)
                  </label>
                  <input
                    id="pp-price"
                    type="number"
                    min="0"
                    className="input"
                    value={form.price}
                    onChange={set("price")}
                  />
                </div>
              ) : (
                <div className="field">
                  <label>Status</label>
                  <input
                    className="input"
                    value="Pool — waiting for an affiliate repost"
                    disabled
                  />
                </div>
              )}
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
                disabled={!!repostTarget}
              />
            </div>

            {showCommerce && (
              <div className="field">
                <label className="toggle-row" htmlFor="pp-tickets">
                  <input
                    id="pp-tickets"
                    type="checkbox"
                    checked={sellTickets}
                    onChange={toggleTickets}
                  />
                  <span>
                    <b>Sell tickets for this repost</b>
                    <small>Build a custom ticket — presets, photo, your own lines.</small>
                  </span>
                </label>
              </div>
            )}

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
              {repostTarget ? (
                <>
                  <i className="fa-solid fa-retweet icon" /> Repost & put on the scene
                </>
              ) : (
                <>
                  Post party <i className="fa-solid fa-arrow-right icon" />
                </>
              )}
            </button>
          </form>

          {showCommerce && sellTickets && (
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
