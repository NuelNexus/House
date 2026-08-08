import { useState } from "react";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { GH_CD } from "../data/seed";
import TicketStub from "../components/TicketStub";
import Reveal from "../components/Reveal";

const STEP_LABELS = ["Order", "Details", "Done"];

export default function Checkout({ setTab }) {
  const { cartItems, total, checkout } = useStore();
  const { user, authLoading, name: authName, openAuth } = useAuth();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: authName || "", email: "", phone: "" });
  const [tickets, setTickets] = useState([]);
  const [error, setError] = useState("");

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submitDetails = (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim()) {
      setError("Please fill in all fields to secure your tickets.");
      return;
    }
    setError("");
    const purchased = checkout({
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
    });
    setTickets(purchased);
    setStep(3);
  };

  const head = (
    <header className="page-head reveal in">
      <div className="kicker">01 · Secure your spot</div>
      <h1>
        Checkout<span className="outline">.</span>
      </h1>
      <p className="lede">
        Digital passes, instant confirmation, show the code at the door.
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
        <button className="back-link" onClick={() => setTab("tickets")}>
          <i className="fa-solid fa-arrow-left" /> Back to tickets
        </button>
        {head}
        <div className="form-panel gate-panel">
          <div className="gate-icon">
            <i className="fa-solid fa-lock" />
          </div>
          <h2>Sign in to check out</h2>
          <p>
            Your passes land in your account and stay in sync across your
            devices.
          </p>
          <button className="btn" onClick={() => openAuth("checkout")}>
            Sign in to continue <i className="fa-solid fa-arrow-right icon" />
          </button>
        </div>
      </div>
    );
  }

  // Nothing to pay for (e.g. the cart was cleared while away).
  if (cartItems.length === 0 && step < 3) {
    return (
      <div className="page">
        <button className="back-link" onClick={() => setTab("tickets")}>
          <i className="fa-solid fa-arrow-left" /> Back to tickets
        </button>
        {head}
        <div className="form-panel gate-panel">
          <div className="gate-icon">
            <i className="fa-solid fa-bag-shopping" />
          </div>
          <h2>Your cart is empty</h2>
          <p>Pick up some party passes before checking out.</p>
          <button className="btn" onClick={() => setTab("tickets")}>
            Browse tickets <i className="fa-solid fa-arrow-right icon" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      {step < 3 && (
        <button className="back-link" onClick={() => setTab("tickets")}>
          <i className="fa-solid fa-arrow-left" /> Back to tickets
        </button>
      )}
      {head}

      <Reveal>
        <div className="form-panel">
          {step < 3 && (
            <div className="steps">
              {STEP_LABELS.map((label, i) => (
                <div
                  key={label}
                  className={`step ${step === i + 1 ? "active" : ""} ${
                    step > i + 1 ? "done" : ""
                  }`}
                >
                  {step > i + 1 ? "✓" : `${i + 1}. ${label}`}
                </div>
              ))}
            </div>
          )}

          {step === 1 && (
            <>
              {cartItems.map(({ ticket, qty }) => (
                <div className="order-row" key={ticket.id}>
                  <span>
                    {ticket.name}
                    <span className="sub">
                      {qty} × {GH_CD(ticket.price)} · {ticket.date}
                    </span>
                  </span>
                  <span>{GH_CD(ticket.price * qty)}</span>
                </div>
              ))}
              <div
                className="order-row"
                style={{ borderBottom: "none", fontWeight: 700, fontSize: 18 }}
              >
                <span>Total</span>
                <span>{GH_CD(total)}</span>
              </div>
              <button
                className="btn"
                style={{ width: "100%", marginTop: 20, justifyContent: "center" }}
                onClick={() => setStep(2)}
              >
                Continue <i className="fa-solid fa-arrow-right icon" />
              </button>
            </>
          )}

          {step === 2 && (
            <form onSubmit={submitDetails}>
              <div className="field">
                <label htmlFor="chk-name">Full name</label>
                <input
                  id="chk-name"
                  className="input"
                  placeholder="e.g. Kwame Asante"
                  value={form.name}
                  onChange={set("name")}
                />
              </div>
              <div className="field">
                <label htmlFor="chk-email">Email</label>
                <input
                  id="chk-email"
                  type="email"
                  className="input"
                  placeholder="you@email.com"
                  value={form.email}
                  onChange={set("email")}
                />
              </div>
              <div className="field">
                <label htmlFor="chk-phone">Phone (MTN / Vodafone / Telecel)</label>
                <input
                  id="chk-phone"
                  className="input"
                  placeholder="+233 20 000 0000"
                  value={form.phone}
                  onChange={set("phone")}
                />
              </div>
              {error && (
                <p style={{ color: "var(--rose-deep)", marginBottom: 14, fontSize: 14 }}>
                  {error}
                </p>
              )}
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ flex: 1, justifyContent: "center" }}
                  onClick={() => setStep(1)}
                >
                  Back
                </button>
                <button type="submit" className="btn" style={{ flex: 2, justifyContent: "center" }}>
                  Pay {GH_CD(total)} <i className="fa-solid fa-lock icon" />
                </button>
              </div>
              <p
                style={{
                  marginTop: 14,
                  fontSize: 12,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  color: "var(--ink-soft)",
                }}
              >
                Demo checkout — no real payment is processed.
              </p>
            </form>
          )}

          {step === 3 && (
            <>
              <div className="success-check">
                <i className="fa-solid fa-check" />
              </div>
              <p
                style={{
                  textAlign: "center",
                  marginBottom: 22,
                  fontWeight: 300,
                  fontSize: 17,
                  color: "var(--ink-soft)",
                }}
              >
                {form.name}, your party passes are confirmed. Show the codes at
                the door.
              </p>
              {tickets.map((t) => (
                <TicketStub key={t.code} ticket={t} />
              ))}
              <button
                className="btn"
                style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
                onClick={() => setTab("tickets")}
              >
                Done <i className="fa-solid fa-check icon" />
              </button>
            </>
          )}
        </div>
      </Reveal>
    </div>
  );
}
