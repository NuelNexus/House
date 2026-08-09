import { useMemo, useState } from "react";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { GH_CD } from "../data/seed";
import { DEFAULT_DESIGN } from "../lib/ticketPresets";
import Modal from "../components/Modal";
import TicketDesigner from "../components/TicketDesigner";
import TicketQR from "../components/TicketQR";
import Reveal from "../components/Reveal";

export default function Host({ setTab }) {
  const { userParties, hostLogs, saveTicketDesign, updateTicketStock, notify } = useStore();
  const { user, authLoading, openAuth } = useAuth();
  const [editing, setEditing] = useState(null);
  const [design, setDesign] = useState(null);
  const [copied, setCopied] = useState("");

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

  const head = (
    <header className="page-head reveal in">
      <div className="kicker">Host dashboard</div>
      <h1>
        Host<span className="outline">.</span>
      </h1>
      <p className="lede">
        Your parties, your tickets, your sales. Design a ticket for any party
        you've posted and every buyer's pass — with its unique hash — lands in
        your log.
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
          <h2>Sign in to see your host dashboard</h2>
          <p>Post a party and this tab unlocks — tickets, sales and buyer hashes live here.</p>
          <button className="btn" onClick={() => openAuth("host")}>
            Sign in to continue <i className="fa-solid fa-arrow-right icon" />
          </button>
        </div>
      </div>
    );
  }

  if (userParties.length === 0) {
    return (
      <div className="page">
        {head}
        <div className="empty-state">
          <i className="fa-solid fa-wand-magic-sparkles" />
          <h3>Nothing hosted yet</h3>
          <p>
            Post your first party and this tab unlocks — then design tickets
            and track every sale here.
          </p>
          <button className="btn" onClick={() => setTab("parties/new")}>
            Post your first party <i className="fa-solid fa-arrow-right icon" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      {head}

      <Reveal>
        <div className="section-label">Your parties ({userParties.length})</div>
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
              When someone buys a ticket to your party, their name and unique
              ticket hash show up here.
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="sales-table">
              <thead>
                <tr>
                  <th>Party</th>
                  <th>Buyer</th>
                  <th>Contact</th>
                  <th>Price</th>
                  <th>Ticket hash</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {hostLogs.map((l) => (
                  <tr key={l.id}>
                    <td>{partyById.get(l.party_id)?.title || "Party"}</td>
                    <td>{l.buyer_name || "—"}</td>
                    <td className="sales-contact">
                      {l.buyer_email || "—"}
                      <br />
                      {l.buyer_phone || "—"}
                    </td>
                    <td>{GH_CD(Number(l.price) || 0)}</td>
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
                ))}
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
