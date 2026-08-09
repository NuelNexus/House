import { useMemo, useState } from "react";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { GH_CD } from "../data/seed";
import { promoOf } from "../lib/ticketPresets";
import TicketStub from "../components/TicketStub";
import DesignedTicket from "../components/DesignedTicket";
import Reveal from "../components/Reveal";

const STEP_LABELS = ["Order", "Details", "Done"];

export default function Checkout({ setTab }) {
  const { cartItems, total, checkout, globalPromos } = useStore();
  const { user, authLoading, name: authName, openAuth } = useAuth();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: authName || "", email: "", phone: "" });
  const [tickets, setTickets] = useState([]);
  const [error, setError] = useState("");
  const [promoInput, setPromoInput] = useState("");
  const [promoApplied, setPromoApplied] = useState("");
  const [promoError, setPromoError] = useState("");

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  // Every discount code that could apply to this order: the host's own
  // per-party promos plus any platform-wide codes the creator runs.
  // Used to validate the code and as a placeholder hint.
  const promos = useMemo(() => {
    const out = {};
    cartItems.forEach((i) => {
      const p = promoOf(i.design);
      if (p) out[p.code] = p;
    });
    globalPromos.forEach((g) => {
      if (g && g.code) out[g.code] = { code: g.code, pct: g.pct };
    });
    return out;
  }, [cartItems, globalPromos]);

  // Mirrors StoreContext.checkout exactly: a host promo discounts only
  // its own ticket, a global code discounts every ticket, max wins.
  const savings = useMemo(() => {
    if (!promoApplied) return 0;
    const g = globalPromos.find((x) => x.code === promoApplied);
    let s = 0;
    cartItems.forEach((i) => {
      const p = promoOf(i.design);
      const pct = Math.max(
        p && p.code === promoApplied ? p.pct : 0,
        g ? Math.max(0, Math.min(100, Number(g.pct) || 0)) : 0
      );
      if (pct > 0) s += Math.round(i.ticket.price * (pct / 100)) * i.qty;
    });
    return s;
  }, [promoApplied, cartItems, globalPromos]);

  const finalTotal = Math.max(0, total - savings);

  const applyPromo = () => {
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    if (promos[code]) {
      setPromoApplied(code);
      setPromoError("");
    } else {
      setPromoApplied("");
      setPromoError("That code doesn't match this order.");
    }
  };

  const submitDetails = (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim()) {
      setError("Please fill in all fields to secure your tickets.");
      return;
    }
    setError("");
    const purchased = checkout(
      {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
      },
      promoApplied
    );
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
              {cartItems.map((item) => {
                const { ticket, qty } = item;
                const p = promoOf(item.design || null);
                const gPromo = globalPromos.find((x) => x.code === promoApplied);
                const linePrice = ticket.price * qty;
                const linePct = Math.max(
                  p && p.code === promoApplied ? p.pct : 0,
                  gPromo ? Math.max(0, Math.min(100, Number(gPromo.pct) || 0)) : 0
                );
                const lineSave = promoApplied && linePct > 0
                    ? Math.round(ticket.price * (linePct / 100)) * qty
                    : 0;
                return (
                  <div className="order-row" key={ticket.id}>
                    <span>
                      {ticket.name}
                      <span className="sub">
                        {qty} × {GH_CD(ticket.price)} · {ticket.date}
                        {p && (
                          <b style={{ color: "var(--rose-deep)" }}>
                            {" "}
                            · promo {p.code} −{p.pct}%
                          </b>
                        )}
                      </span>
                    </span>
                    <span>
                      {lineSave > 0 && (
                        <span
                          style={{
                            textDecoration: "line-through",
                            opacity: 0.5,
                            marginRight: 8,
                          }}
                        >
                          {GH_CD(linePrice)}
                        </span>
                      )}
                      {GH_CD(linePrice - lineSave)}
                    </span>
                  </div>
                );
              })}

              {Object.keys(promos).length > 0 && (
                <div className="promo-box">
                  <label htmlFor="chk-promo">Have a promo code?</label>
                  <div className="promo-row">
                    <input
                      id="chk-promo"
                      className="input"
                      placeholder={Object.keys(promos)[0]}
                      value={promoInput}
                      onChange={(e) => {
                        setPromoInput(e.target.value);
                        setPromoError("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          applyPromo();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={applyPromo}
                    >
                      {promoApplied ? (
                        <>
                          <i className="fa-solid fa-check" /> Applied
                        </>
                      ) : (
                        "Apply"
                      )}
                    </button>
                  </div>
                  {promoApplied && (
                    <p className="promo-ok">
                      <i className="fa-solid fa-tag" aria-hidden="true" />{" "}
                      {promoApplied} applied — you save {GH_CD(savings)}
                    </p>
                  )}
                  {promoError && <p className="promo-err">{promoError}</p>}
                </div>
              )}

              <div
                className="order-row"
                style={{ borderBottom: "none", fontWeight: 700, fontSize: 18 }}
              >
                <span>
                  Total
                  {savings > 0 && (
                    <span className="sub">incl. {GH_CD(savings)} off</span>
                  )}
                </span>
                <span>{GH_CD(finalTotal)}</span>
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
                  Pay {GH_CD(finalTotal)} <i className="fa-solid fa-lock icon" />
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
              {tickets.map((t) =>
                t.design ? (
                  <DesignedTicket
                    key={t.code}
                    design={t.design}
                    passenger={
                      typeof t.holder === "object" ? t.holder.name : t.holder
                    }
                    code={t.code}
                    hash={t.hash}
                    price={t.price}
                    promo={t.promoUsed}
                  />
                ) : (
                  <TicketStub key={t.code} ticket={t} />
                )
              )}
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
