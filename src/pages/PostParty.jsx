import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { GH_CD } from "../data/seed";
import Reveal from "../components/Reveal";
import TicketDesigner from "../components/TicketDesigner";
import LocationPicker from "../components/LocationPicker";
import { DEFAULT_DESIGN } from "../lib/ticketPresets";

const CATEGORIES = ["Kickback", "Rave", "Rooftop", "Pool", "Villa", "Birthday", "Games night"];

const NETWORKS = ["MTN", "Vodafone", "AirtelTigo", "Telecel"];

// ------------------------------------------------------------------
// Post a party — two roles, never mixed:
//   · HOST (anyone signed in): posts a party's details + base price. It
//     lands in the pool on the Affiliate page — NOT the Events page —
//     until an approved affiliate reposts it. Hosts keep 70% of their
//     base price on every repost sale.
//   · AFFILIATE: #parties/new?repost=<id> copies a host's party from the
//     pool, sets their own price + ticket design, and puts it live on
//     the scene. They keep 70% of their margin (price − base).
// ------------------------------------------------------------------

export default function PostParty({ setTab, q }) {
  const { postParty, repostParty, hostPartyPool, uploadPartyCover, notify } = useStore();
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
    payoutPhone: "",
    payoutNetwork: "MTN",
    // Map-picked coordinates (null = not picked yet; typing still works).
    lat: null,
    lng: null,
    // Uploaded cover image (null = the illustrated cover shows instead).
    coverUrl: null,
  }));
  const [coverUploading, setCoverUploading] = useState(false);
  const coverFileRef = useRef(null);
  const [sellTickets, setSellTickets] = useState(false);
  const [design, setDesign] = useState(null);
  const [error, setError] = useState("");
  const [showMap, setShowMap] = useState(false);

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
      // The affiliate keeps the host's cover unless they swap in their own.
      coverUrl: f.coverUrl || repostTarget.coverUrl || "",
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

  // A spot picked on the map fills the location field automatically
  // (so everything downstream keeps working) and records the coords.
  const onLocationPicked = ({ lat, lng, name }) => {
    setForm((f) => ({
      ...f,
      location: name || f.location,
      lat: Number.isFinite(lat) ? lat : f.lat,
      lng: Number.isFinite(lng) ? lng : f.lng,
    }));
    setShowMap(false);
  };

  // Pick + upload a cover photo. The URL lands in the form and travels
  // with the party so the Events page and party page show the real image.
  const onPickCover = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      notify("Pick an image file for the cover.");
      return;
    }
    setCoverUploading(true);
    try {
      const url = await uploadPartyCover(file);
      setForm((f) => ({ ...f, coverUrl: url }));
      notify("Cover added — it'll show on the event page");
    } catch (err) {
      notify(err.message || "Couldn't upload the cover.");
    } finally {
      setCoverUploading(false);
    }
  };

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
    if (!repostTarget && Number(form.price) <= 0) {
      setError("Set a base price for your event — the host keeps 70% of it on every repost sale.");
      return;
    }
    setError("");

    if (repostTarget) {
      // Affiliate reposting a host's party — their price + ticket go
      // live on the scene as their own listing.
      if (!isAffiliate) {
        setError("Setting a price on an event is exclusive to approved affiliates.");
        return;
      }
      repostParty(repostTarget.id, {
        price: Math.max(0, Number(form.price) || 0),
        capacity: form.capacity.trim(),
        payoutPhone: form.payoutPhone.trim(),
        payoutNetwork: form.payoutNetwork,
        coverUrl: form.coverUrl || "",
        ticketDesign:
          sellTickets && design && Object.keys(design).length
            ? { ...design, enabled: true }
            : null,
      });
      setTab("host");
      return;
    }

    // Host role: post the party's details + base price into the pool.
    postParty({
      title: form.title.trim(),
      host: form.host.trim() || authName || "Anonymous Host",
      date: form.date.trim(),
      location: form.location.trim(),
      price: Math.max(0, Number(form.price) || 0),
      capacity: "",
      description: form.description.trim(),
      category: form.category,
      payoutPhone: form.payoutPhone.trim(),
      payoutNetwork: form.payoutNetwork,
      // Coordinates from the map picker (optional — manual typing still
      // works and leaves them null).
      lat: form.lat,
      lng: form.lng,
      coverUrl: form.coverUrl || null,
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
        {repostTarget ? "Affiliate post" : "Post an event"}
      </div>
      <h1>
        {repostTarget ? "Set your price" : "Post an event"}
        <span className="outline">.</span>
      </h1>
      <p className="lede">
        {repostTarget
          ? `${repostTarget.host || "Someone"} posted “${repostTarget.title}” with a base price of ${GH_CD(Number(repostTarget.price) || 0)}. Post it with your own price and ticket — it goes live on the Events page and you keep 70% of your margin (price − base).`
          : "You're the host — post your event's details and set a base price. It lands in the pool on the Affiliate page; an approved affiliate posts it with their own price and puts it on the scene. You keep 70% of your base price on every sale."}
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
          <h2>Sign in to post an event</h2>
          <p>
            Post your event and it lands in the affiliate pool — approved
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
          <h2>That event's gone</h2>
          <p>
            The host may have removed it. Head back to the Affiliate
            program to see the events still waiting in the pool.
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
              <label htmlFor="pp-title">Event name</label>
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
              <div
                className="field"
                style={showMap ? { gridColumn: "1 / -1" } : undefined}
              >
                <label htmlFor="pp-location">Location</label>
                <input
                  id="pp-location"
                  className="input"
                  placeholder="e.g. East Legon, Accra"
                  value={form.location}
                  onChange={set("location")}
                  disabled={!!repostTarget}
                />
                {!repostTarget && (
                  <div className="loc-toggle-row">
                    <button
                      type="button"
                      className={`btn btn-sm ${showMap ? "btn-outline" : ""}`}
                      onClick={() => setShowMap((on) => !on)}
                    >
                      {showMap ? (
                        <>
                          <i className="fa-solid fa-xmark icon" /> Close map
                        </>
                      ) : (
                        <>
                          <i className="fa-solid fa-map-location-dot icon" />{" "}
                          Pick on map
                        </>
                      )}
                    </button>
                    {form.lat != null && form.lng != null && !showMap && (
                      <span className="loc-picked">
                        <i className="fa-solid fa-circle-check" aria-hidden="true" />{" "}
                        Pinned on map
                      </span>
                    )}
                  </div>
                )}
                {showMap && !repostTarget && (
                  <LocationPicker
                    value={{ lat: form.lat, lng: form.lng }}
                    onChange={onLocationPicked}
                  />
                )}
              </div>
              {showCommerce ? (
                <div className="field">
                  <label htmlFor="pp-price">
                    Your price (GH₵) — base is{" "}
                    {GH_CD(Number(repostTarget?.price) || 0)}
                  </label>
                  <input
                    id="pp-price"
                    type="number"
                    min="0"
                    className="input"
                    value={form.price}
                    onChange={set("price")}
                  />
                  <small
                    style={{
                      display: "block",
                      marginTop: 6,
                      fontSize: 12,
                      color: "var(--ink-soft)",
                      lineHeight: 1.5,
                    }}
                  >
                    You keep 70% of your margin (price − base{" "}
                    {GH_CD(Number(repostTarget?.price) || 0)}). The host
                    keeps 70% of the base, the platform takes 30%.
                  </small>
                </div>
              ) : (
                <div className="field">
                  <label htmlFor="pp-price">Base price (GH₵)</label>
                  <input
                    id="pp-price"
                    type="number"
                    min="0"
                    className="input"
                    placeholder="e.g. 50"
                    value={form.price}
                    onChange={set("price")}
                  />
                  <small
                    style={{
                      display: "block",
                      marginTop: 6,
                      fontSize: 12,
                      color: "var(--ink-soft)",
                      lineHeight: 1.5,
                    }}
                  >
                    Your base price is what you earn from — you keep 70% of
                    it on every ticket sold when an affiliate posts your
                    event. Affiliates mark it up with their own price.
                  </small>
                </div>
              )}
            </div>
            <div className="field">
              <label htmlFor="pp-payout-phone">
                Payout phone — where your ticket share is sent
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <input
                  id="pp-payout-phone"
                  className="input"
                  type="tel"
                  placeholder="+233 20 000 0000"
                  value={form.payoutPhone}
                  onChange={set("payoutPhone")}
                />
                <select
                  className="input"
                  aria-label="Mobile money network"
                  value={form.payoutNetwork}
                  onChange={set("payoutNetwork")}
                >
                  {NETWORKS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <small
                style={{
                  display: "block",
                  marginTop: 6,
                  fontSize: 12,
                  color: "var(--ink-soft)",
                  lineHeight: 1.5,
                }}
              >
                {repostTarget
                  ? "Your affiliate share (70% of your margin) is paid to this number after every sale."
                  : "Your host share (70% of the base price) is paid to this number after every sale an affiliate drives."}
              </small>
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

            <div className="field">
              <label>Cover image</label>
              <div className="group-cover-upload pp-cover-upload">
                {form.coverUrl ? (
                  <img
                    src={form.coverUrl}
                    alt="Cover preview"
                    className="group-cover-preview"
                  />
                ) : (
                  <div className="group-cover-placeholder">
                    <i className="fa-solid fa-image" />
                    <span>No cover yet</span>
                  </div>
                )}
                <div className="group-cover-actions">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={() => coverFileRef.current?.click()}
                    disabled={coverUploading}
                  >
                    {coverUploading ? (
                      <i className="fa-solid fa-spinner fa-spin icon" />
                    ) : (
                      <i className="fa-solid fa-camera icon" />
                    )}
                    {form.coverUrl ? "Change photo" : "Upload cover"}
                  </button>
                  {/* Removing only makes sense for a HOST's own cover — on
                      a repost, emptying it just reverts to the host's photo. */}
                  {form.coverUrl && !repostTarget && (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline danger"
                      onClick={() => setForm((f) => ({ ...f, coverUrl: null }))}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <input
                  ref={coverFileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={onPickCover}
                />
              </div>
              <small
                style={{
                  display: "block",
                  marginTop: 6,
                  fontSize: 12,
                  color: "var(--ink-soft)",
                  lineHeight: 1.5,
                }}
              >
                This photo becomes the event's cover on the Events page and
                event page. {repostTarget ? "Leave it to keep the host's cover." : ""}
              </small>
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
                  <i className="fa-solid fa-upload icon" /> Post & put on the scene
                </>
              ) : (
                <>
                  Post event <i className="fa-solid fa-arrow-right icon" />
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
