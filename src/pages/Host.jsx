import { useMemo, useState } from "react";
import { useStore, COMMISSION_RATE, AFFILIATE_RATE } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { GH_CD } from "../data/seed";
import { DEFAULT_DESIGN } from "../lib/ticketPresets";
import Modal from "../components/Modal";
import TicketDesigner from "../components/TicketDesigner";
import TicketQR from "../components/TicketQR";
import Reveal from "../components/Reveal";

// ------------------------------------------------------------------
// Host Events — the affiliate program tab. Posting events and selling
// tickets is exclusive to approved affiliates:
//   · Anyone can apply (this page) — the creator approves them in Admin.
//   · Affiliates post events at their own prices and keep 65% of sales.
//   · The affiliate earns a 5% commission per sale on top.
//   · The platform (creator) takes 30% per sale.
// ------------------------------------------------------------------

export default function Host({ setTab }) {
  const {
    userParties,
    hostLogs,
    saveTicketDesign,
    updateTicketStock,
    notify,
    applyAffiliate,
  } = useStore();
  const { user, authLoading, openAuth, affiliate, refreshAffiliate } = useAuth();
  const [editing, setEditing] = useState(null);
  const [design, setDesign] = useState(null);
  const [copied, setCopied] = useState("");
  const [busy, setBusy] = useState(false);

  const partyById = useMemo(() => {
    const m = new Map();
    userParties.forEach((p) => m.set(p.id, p));
    return m;
  }, [userParties]);

  const { soldByParty, revenueByParty } = useMemo(() => {
    const sold = {};
    const revenue = {};
    hostLogs.forEach((l) => {
      sold[l.party_id] = (sold[l.party_id] || 0) + 1;
      revenue[l.party_id] = (revenue[l.party_id] || 0) + Number(l.price || 0);
    });
    return { soldByParty: sold, revenueByParty: revenue };
  }, [hostLogs]);

  // Affiliate earnings on every logged sale: their 5% commission plus the
  // 65% they keep as the host (the platform's 30% is already taken).
  const affiliateStats = useMemo(() => {
    let commission = 0;
    let earnings = 0;
    hostLogs.forEach((l) => {
      const price = Number(l.price) || 0;
      const aff = Number(l.affiliate_share) || Math.round(price * AFFILIATE_RATE);
      const plat = Number(l.commission) || Math.round(price * COMMISSION_RATE);
      commission += aff;
      earnings += Math.max(0, price - aff - plat);
    });
    return { commission, earnings };
  }, [hostLogs]);

  const copyHash = (hash) => {
    try {
      navigator.clipboard?.writeText(hash);
    } catch {
      /* clipboard unavailable */
    }
    setCopied(hash);
    notify("Ticket hash copied");
    window.setTimeout(() => setCopied(""), 1600);
  };

  const adjustStock = (party, delta) => {
    const current = Number(party.ticketDesign?.stock ?? 0);
    const next = Math.max(0, current + delta);
    updateTicketStock(party, next);
    notify(delta > 0 ? `Stock raised to ${next}` : `Stock lowered to ${next}`);
  };

  const openDesigner = (party) => {
    setEditing(party);
    setDesign(
      party.ticketDesign
        ? { ...party.ticketDesign }
        : {
            ...DEFAULT_DESIGN,
            name: party.title || "",
            depart: party.location || "",
            date: party.date || "",
            price: String(party.price ?? ""),
            stock: Number(party.capacity) || 100,
          }
    );
  };

  const save = () => {
    if (!editing) return;
    saveTicketDesign(editing.id, design);
    setEditing(null);
  };

  const apply = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await applyAffiliate();
    setBusy(false);
    if (ok) refreshAffiliate();
  };

  const head = (
    <header className="page-head reveal in">
      <div className="kicker">Host Events · affiliate program</div>
      <h1>
        Host Events<span className="outline">.</span>
      </h1>
      <p className="lede">
        Post events, set your own prices and sell tickets. You keep 65% of
        every sale plus a {Math.round(AFFILIATE_RATE * 100)}% commission —
        the platform takes {Math.round(COMMISSION_RATE * 100)}%.
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
        {head}
        <div className="form-panel gate-panel">
          <div className="gate-icon">
            <i className="fa-solid fa-champagne-glasses" />
          </div>
          <h2>Sign in to open Host Events</h2>
          <p>
            Apply to become an affiliate host — post events, sell tickets at
            your own prices and earn on every pass.
          </p>
          <button className="btn" onClick={() => openAuth("host")}>
            Sign in to continue <i className="fa-solid fa-arrow-right icon" />
          </button>
        </div>
      </div>
    );
  }

  // ---- Not an affiliate yet: pitch the program -----------------
  if (!affiliate || !affiliate.status) {
    return (
      <div className="page">
        {head}
        <Reveal>
          <div className="form-panel gate-panel affiliate-pitch">
            <div className="gate-icon">
              <i className="fa-solid fa-handshake" />
            </div>
            <h2>Become an affiliate host</h2>
            <p className="affiliate-pitch-lead">
              Hosting on FesGH is exclusive to approved affiliates. Apply and
              the admin will review your request.
            </p>
            <div className="affiliate-perks">
              <div className="affiliate-perk">
                <i className="fa-solid fa-calendar-plus" />
                <b>Post events</b>
                <span>Parties, raves, kickbacks — your calendar, your prices.</span>
              </div>
              <div className="affiliate-perk">
                <i className="fa-solid fa-ticket" />
                <b>Sell tickets</b>
                <span>Design custom tickets with presets, photos and QR hashes.</span>
              </div>
              <div className="affiliate-perk">
                <i className="fa-solid fa-piggy-bank" />
                <b>Keep {Math.round((1 - COMMISSION_RATE - AFFILIATE_RATE) * 100)}% + {Math.round(AFFILIATE_RATE * 100)}%</b>
                <span>
                  Every sale: you keep 65% and earn a 5% affiliate commission.
                  The platform takes {Math.round(COMMISSION_RATE * 100)}%.
                </span>
              </div>
            </div>
            <button
              className="btn"
              style={{ width: "100%", justifyContent: "center" }}
              onClick={apply}
              disabled={busy}
            >
              {busy ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin icon" /> Applying…
                </>
              ) : (
                <>
                  Apply to become a host <i className="fa-solid fa-arrow-right icon" />
                </>
              )}
            </button>
          </div>
        </Reveal>
      </div>
    );
  }

  // ---- Pending review ------------------------------------------
  if (affiliate.status === "pending") {
    return (
      <div className="page">
        {head}
        <div className="form-panel gate-panel">
          <div className="gate-icon">
            <i className="fa-solid fa-hourglass-half" />
          </div>
          <h2>Application under review</h2>
          <p>
            Your affiliate application is with the admin. Once approved, this
            tab unlocks — you'll be able to post events and sell tickets at
            your own prices.
          </p>
          <button className="btn btn-outline" onClick={() => refreshAffiliate()}>
            <i className="fa-solid fa-rotate icon" /> Check status
          </button>
        </div>
      </div>
    );
  }

  // ---- Rejected ------------------------------------------------
  if (affiliate.status === "rejected") {
    return (
      <div className="page">
        {head}
        <div className="form-panel gate-panel">
          <div className="gate-icon">
            <i className="fa-solid fa-circle-xmark" />
          </div>
          <h2>Application declined</h2>
          <p>
            Your request wasn't approved this time. You can re-apply — make
            sure your events match the FesGH vibe.
          </p>
          <button
            className="btn"
            onClick={apply}
            disabled={busy}
          >
            {busy ? (
              <>
                <i className="fa-solid fa-spinner fa-spin icon" /> Applying…
              </>
            ) : (
              <>
                Re-apply <i className="fa-solid fa-arrow-right icon" />
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ---- Approved: the full host dashboard ------------------------
  return (
    <div className="page">
      {head}

      <Reveal>
        <div className="affiliate-summary card">
          <div className="affiliate-summary-main">
            <span className="affiliate-badge">
              <i className="fa-solid fa-badge-check" /> Approved affiliate
            </span>
            <p>
              You keep <b>{Math.round((1 - COMMISSION_RATE - AFFILIATE_RATE) * 100)}%</b> of every
              ticket sale + your <b>{Math.round(AFFILIATE_RATE * 100)}%</b> commission. The
              platform's {Math.round(COMMISSION_RATE * 100)}% is handled automatically.
            </p>
          </div>
          <div className="affiliate-summary-stats">
            <div>
              <b>{GH_CD(affiliateStats.commission)}</b>
              <span>your {Math.round(AFFILIATE_RATE * 100)}% commission</span>
            </div>
            <div>
              <b>{GH_CD(affiliateStats.earnings)}</b>
              <span>host earnings (65%)</span>
            </div>
            <div>
              <b>{hostLogs.length}</b>
              <span>tickets sold</span>
            </div>
          </div>
        </div>
      </Reveal>

      <Reveal>
        <div className="host-toolbar">
          <div className="section-label" style={{ margin: 0 }}>
            Your events ({userParties.length})
          </div>
          <button className="btn btn-sm" onClick={() => setTab("parties/new")}>
            <i className="fa-solid fa-plus icon" /> Post an event
          </button>
        </div>
        {userParties.length === 0 ? (
          <div className="empty-state">
            <i className="fa-solid fa-wand-magic-sparkles" />
            <h3>Nothing hosted yet</h3>
            <p>
              Post your first event — then design tickets and track every
              sale here. Your 65% + 5% are calculated per ticket.
            </p>
            <button className="btn" onClick={() => setTab("parties/new")}>
              Post your first event <i className="fa-solid fa-arrow-right icon" />
            </button>
          </div>
        ) : (
          <div className="grid host-grid">
            {userParties.map((p) => {
              const onSale = !!(p.ticketDesign && p.ticketDesign.enabled);
              const sold = soldByParty[p.id] || 0;
              const revenue = revenueByParty[p.id] || 0;
              return (
                <article className="card host-party" key={p.id}>
                  <div className="card-top">
                    <span className="card-tag">{p.category}</span>
                    {onSale ? (
                      <span className="card-status">On sale</span>
                    ) : (
                      <span className="card-status low">No ticket yet</span>
                    )}
                  </div>
                  <h3>{p.title}</h3>
                  <p className="host">
                    {p.date} · {p.location}
                  </p>
                  <div className="host-party-stats">
                    <span>
                      <b>{p.rsvps}</b> RSVPs
                    </span>
                    {onSale && (
                      <>
                        <span>
                          <b>{sold}</b> sold
                        </span>
                        <span>
                          <b>{GH_CD(revenue)}</b> revenue
                        </span>
                      </>
                    )}
                  </div>
                  {onSale && (
                    <div className="stock-control">
                      <span className="stock-label">
                        Tickets left:{" "}
                        <b>
                          {Math.max(
                            0,
                            Number(p.ticketDesign.stock ?? 0) - sold
                          )}
                        </b>
                      </span>
                      <div className="stock-stepper">
                        <button
                          className="stock-btn"
                          aria-label="Remove 10 tickets"
                          title="Remove 10 tickets"
                          onClick={() => adjustStock(p, -10)}
                        >
                          −10
                        </button>
                        <button
                          className="stock-btn"
                          aria-label="Remove 1 ticket"
                          title="Remove 1 ticket"
                          onClick={() => adjustStock(p, -1)}
                        >
                          −1
                        </button>
                        <span className="stock-count">
                          {Number(p.ticketDesign.stock ?? 0)}
                        </span>
                        <button
                          className="stock-btn"
                          aria-label="Add 1 ticket"
                          title="Add 1 ticket"
                          onClick={() => adjustStock(p, 1)}
                        >
                          +1
                        </button>
                        <button
                          className="stock-btn"
                          aria-label="Add 10 tickets"
                          title="Add 10 tickets"
                          onClick={() => adjustStock(p, 10)}
                        >
                          +10
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="card-foot host-party-actions">
                    <button className="btn btn-sm" onClick={() => openDesigner(p)}>
                      <i className="fa-solid fa-wand-magic-sparkles icon" />
                      {onSale ? "Edit ticket" : "Design ticket"}
                    </button>
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => setTab(`party/${p.id}`)}
                    >
                      View
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Reveal>

      <Reveal>
        <div className="host-toolbar">
          <div className="section-label" style={{ margin: 0 }}>
            Sales log ({hostLogs.length})
          </div>
          <button className="btn btn-sm btn-outline" onClick={() => setTab("verify")}>
            <i className="fa-solid fa-shield-halved icon" /> Verify a ticket
          </button>
        </div>
        {hostLogs.length === 0 ? (
          <div className="empty-state">
            <i className="fa-solid fa-receipt" />
            <h3>No sales yet</h3>
            <p>
              When someone buys a ticket to your event, their name, unique
              ticket hash and your commission show up here.
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="sales-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Buyer</th>
                  <th>Contact</th>
                  <th>Price</th>
                  <th>Your {Math.round(AFFILIATE_RATE * 100)}%</th>
                  <th>Ticket hash</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {hostLogs.map((l) => {
                  const price = Number(l.price) || 0;
                  const aff = Number(l.affiliate_share) || Math.round(price * AFFILIATE_RATE);
                  return (
                    <tr key={l.id}>
                      <td>{partyById.get(l.party_id)?.title || "Event"}</td>
                      <td>{l.buyer_name || "—"}</td>
                      <td className="sales-contact">
                        {l.buyer_email || "—"}
                        <br />
                        {l.buyer_phone || "—"}
                      </td>
                      <td>{GH_CD(price)}</td>
                      <td className="admin-commission-cell">{GH_CD(aff)}</td>
                      <td>
                        <code className="sales-hash">{l.hash}</code>
                        <button
                          className="sales-copy"
                          title="Copy hash"
                          aria-label="Copy ticket hash"
                          onClick={() => copyHash(l.hash)}
                        >
                          <i
                            className={`fa-solid ${
                              copied === l.hash ? "fa-check" : "fa-copy"
                            }`}
                          />
                        </button>
                        <TicketQR value={l.hash} label="verify" size={40} />
                      </td>
                      <td>
                        {new Date(l.created_at).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Reveal>

      {editing && (
        <Modal
          title={`Ticket generator — ${editing.title}`}
          onClose={() => setEditing(null)}
          className="host-designer-modal"
        >
          <TicketDesigner value={design} onChange={setDesign} />
          <div className="designer-save">
            <button className="btn btn-outline" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className="btn" onClick={save}>
              <i className="fa-solid fa-check icon" /> Save ticket design
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
