import { useEffect, useMemo, useState } from "react";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import Reveal from "../components/Reveal";
import TicketDesigner from "../components/TicketDesigner";
import { DEFAULT_DESIGN } from "../lib/ticketPresets";

const CATEGORIES = ["Kickback", "Rave", "Rooftop", "Pool", "Villa", "Birthday", "Games night"];

// ------------------------------------------------------------------
// Post a party.
//   · Anyone signed in can post a party IDEA — it's marked 'proposed'
//     and only approved affiliate hosts can see it (Host Events tab).
//   · An approved affiliate posting straight here can set their own
//     price + ticket design and publish live immediately.
//   · #parties/new?claim=<id> = an affiliate picking up someone else's
//     proposed idea: details prefill, they set the price + ticket, and
//     the party goes live on the scene with their price.
// ------------------------------------------------------------------

export default function PostParty({ setTab, q }) {
  const { postParty, claimParty, proposedParties } = useStore();
  const { user, authLoading, name: authName, openAuth, affiliate } = useAuth();
  const isAffiliate = affiliate?.status === "approved";
  const claimId = q?.claim || null;

  // The proposed idea being picked up (affiliate claim flow).
  const claimTarget = useMemo(
    () => (claimId ? proposedParties.find((p) => p.id === claimId) || null : null),
    [claimId, proposedParties]
  );

  const [form, setForm] = useState(() => ({
    title: claimTarget?.title || "",
    host: authName || claimTarget?.host || "",
    date: claimTarget?.date || "",
    location: claimTarget?.location || "",
    price: "0",
    capacity: "",
    description: claimTarget?.description || "",
    category: claimTarget?.category || CATEGORIES[0],
  }));
  const [sellTickets, setSellTickets] = useState(false);
  const [design, setDesign] = useState(null);
  const [error, setError] = useState("");

  // The claim target loads from the cloud (proposedParties arrives async),
  // so prefill the form once the idea appears — e.g. on a deep link or
  // after a refresh the pool may not be loaded yet.
  useEffect(() => {
    if (!claimTarget) return;
    setForm((f) => ({
      ...f,
      title: f.title || claimTarget.title || "",
      host: f.host || claimTarget.host || authName || "",
      date: f.date || claimTarget.date || "",
      location: f.location || claimTarget.location || "",
      description: f.description || claimTarget.description || "",
      category: f.category || claimTarget.category || CATEGORIES[0],
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimTarget?.id]);

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

    const base = {
      title: form.title.trim(),
      host: form.host.trim() || authName || "Anonymous Host",
      date: form.date.trim(),
      location: form.location.trim(),
      price: Math.max(0, Number(form.price) || 0),
      capacity: form.capacity.trim(),
      description: form.description.trim(),
      category: form.category,
    };

    if (claimTarget) {
      // Affiliate picking up a proposed idea — price + ticket go live now.
      claimParty(claimTarget.id, {
        price: base.price,
        capacity: base.capacity,
        description: base.description,
        ticketDesign:
          sellTickets && design && Object.keys(design).length
            ? { ...design, enabled: true }
            : null,
      });
      setTab("host");
      return;
    }

    postParty(
      {
        ...base,
        ticketDesign:
          sellTickets && design && Object.keys(design).length
            ? { ...design, enabled: true }
            : null,
      },
      isAffiliate // approved hosts publish live with their price
    );
    setTab("parties");
  };

  const backTarget = claimTarget ? "host" : "parties";
  const back = (
    <button className="back-link" onClick={() => setTab(backTarget)}>
      <i className="fa-solid fa-arrow-left" />{" "}
      {claimTarget ? "Back to Host Events" : "Back to parties"}
    </button>
  );

  const head = (
    <header className="page-head reveal in">
      <div className="kicker">
        {claimTarget ? "Affiliate pick-up · Host Events" : "Post on the scene"}
      </div>
      <h1>
        {claimTarget ? "Price this party" : "Post a party"}
        <span className="outline">.</span>
      </h1>
      <p className="lede">
        {claimTarget
          ? `Someone posted “${claimTarget.title}” as an idea. Set your price and ticket, claim it as the host, and it goes live on the scene.`
          : isAffiliate
          ? "Post an event, set your own price and sell tickets — it goes live on the scene immediately."
          : "Anyone can post a party idea. Approved hosts on FesGH pick it up, set a price and put it on the scene for everyone."}
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
            Post a party idea for the whole city, or pick one up as an
            approved host — it all starts with your account.
          </p>
          <button className="btn" onClick={() => openAuth("parties/new")}>
            Sign in to continue <i className="fa-solid fa-arrow-right icon" />
          </button>
        </div>
      </div>
    );
  }

  // Picking up + pricing an idea is exclusive to approved hosts — a
  // non-affiliate hitting a claim link sees this gate instead of a
  // confusing "already gone" screen (they can't see the pool at all).
  if (!isAffiliate && claimId) {
    return (
      <div className="page">
        {back}
        {head}
        <div className="form-panel gate-panel">
          <div className="gate-icon">
            <i className="fa-solid fa-handshake" />
          </div>
          <h2>Picking up parties is for approved hosts</h2>
          <p>
            You can post your own party ideas anytime — but claiming and
            pricing a party is exclusive to approved affiliate hosts.
          </p>
          <button className="btn" onClick={() => setTab("host")}>
            Go to Host Events <i className="fa-solid fa-arrow-right icon" />
          </button>
        </div>
      </div>
    );
  }

  // An approved affiliate trying to claim an idea that no longer exists.
  if (claimId && !claimTarget) {
    return (
      <div className="page">
        {back}
        {head}
        <div className="form-panel gate-panel">
          <div className="gate-icon">
            <i className="fa-solid fa-hourglass-half" />
          </div>
          <h2>That idea's already gone</h2>
          <p>
            Another host may have picked this party up first. Head back to
            Host Events to see the ideas still waiting.
          </p>
          <button className="btn" onClick={() => setTab("host")}>
            Back to Host Events <i className="fa-solid fa-arrow-right icon" />
          </button>
        </div>
      </div>
    );
  }

  // Non-affiliates can only post ideas — no pricing/ticket controls here.
  const showCommerce = isAffiliate || claimTarget;

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
                disabled={!!claimTarget}
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
                  disabled={!!claimTarget}
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
                  disabled={!!claimTarget}
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
                  disabled={!!claimTarget}
                />
              </div>
              {showCommerce ? (
                <div className="field">
                  <label htmlFor="pp-price">
                    Ticket price (GH₵, 0 = free)
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
                    value="Idea — waiting for a host"
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
                disabled={!!claimTarget}
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
                    <b>Sell tickets for this party</b>
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

            {claimTarget && !isAffiliate ? null : (
              <button
                type="submit"
                className="btn"
                style={{ width: "100%", justifyContent: "center" }}
              >
                {claimTarget ? (
                  <>
                    <i className="fa-solid fa-ticket icon" /> Claim & put on the scene
                  </>
                ) : isAffiliate ? (
                  <>
                    Put it on the scene <i className="fa-solid fa-arrow-right icon" />
                  </>
                ) : (
                  <>
                    Post party idea <i className="fa-solid fa-lightbulb icon" />
                  </>
                )}
              </button>
            )}
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
