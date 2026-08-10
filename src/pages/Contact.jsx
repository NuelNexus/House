import { useMemo, useState } from "react";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { useSocial } from "../context/SocialContext";

export default function Contact({ contactId, q }) {
  const { tickets, allParties } = useStore();
  const { user, name } = useAuth();
  const { sendContactRequest } = useSocial();

  const kind = q.kind === "offer" ? "offer" : "contact";

  const event = useMemo(
    () =>
      tickets.find((t) => t.id === contactId) ||
      allParties.find((p) => p.id === contactId),
    [tickets, allParties, contactId]
  );

  const eventName = q.event || event?.name || event?.title || "this event";
  const hostName = q.host || event?.hostName || event?.host || "the host";

  const [senderName, setSenderName] = useState(name || "");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await sendContactRequest({
        senderName: senderName.trim() || null,
        eventName,
        hostName,
        kind,
        body: body.trim(),
      });
      setDone(true);
    } catch (err) {
      setError(err.message || "Something went wrong — try again.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="page">
        <div className="gate-panel form-panel">
          <div className="success-check">
            <i className="fa-solid fa-check" />
          </div>
          <h2>{kind === "offer" ? "Offer sent!" : "Message sent!"}</h2>
          <p>
            Your {kind === "offer" ? "service offer" : "message"} for{" "}
            <b>{eventName}</b> is on its way to {hostName}. They'll get back to
            you as soon as they're on Fest GH.
          </p>
          <div className="gate-actions">
            <a className="btn" href="#tickets">
              Back to tickets <i className="fa-solid fa-arrow-right icon" />
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-head reveal in">
        <div className="kicker">
          {kind === "offer" ? "Work with the host" : "Say hello to the host"}
        </div>
        <h1 style={{ fontSize: "clamp(44px, 8vw, 92px)" }}>
          {kind === "offer" ? "Offer service" : "Contact the host"}
          <span className="outline">.</span>
        </h1>
        <p className="lede">
          {eventName} · hosted by <b>{hostName}</b>
        </p>
      </header>

      <div className="form-panel">
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="contact-name">Your name</label>
            <input
              id="contact-name"
              className="input"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              placeholder="e.g. Ama's Catering"
              maxLength={60}
            />
          </div>

          <div className="field">
            <label htmlFor="contact-msg">
              {kind === "offer"
                ? "What can you offer the host?"
                : "Your message to the host"}
            </label>
            <textarea
              id="contact-msg"
              className="input"
              required
              minLength={10}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={
                kind === "offer"
                  ? "Hi! I run a catering service in Accra — food, setup and staff for up to 200 guests. I'd love to work on your event…"
                  : "Hi! I'm interested in the party and had a few questions…"
              }
            />
          </div>

          {error && (
            <p className="auth-msg error">
              <i className="fa-solid fa-circle-exclamation" /> {error}
            </p>
          )}

          <div className="rec-actions">
            <a className="btn btn-outline" href="#tickets">
              Cancel
            </a>
            <button className="btn" type="submit" disabled={busy || !body.trim()}>
              {busy ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin" /> Sending…
                </>
              ) : kind === "offer" ? (
                <>
                  <i className="fa-solid fa-briefcase" /> Send offer
                </>
              ) : (
                <>
                  <i className="fa-solid fa-paper-plane" /> Send message
                </>
              )}
            </button>
          </div>

          <p className="app-note" style={{ marginTop: 18 }}>
            {hostName} isn't on Fest GH yet — this message is saved for them.
            {user
              ? " It's also logged to your account."
              : " No sign-in needed."}
          </p>
        </form>
      </div>
    </div>
  );
}
