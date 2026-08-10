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
// Affiliate — two roles, never mixed:
//   · HOST (anyone signed in) posts a party's details. It lands in the
//     pool below and stays there until an approved affiliate reposts it.
//     The host keeps 65% of every ticket sold on a repost of their party.
//   · AFFILIATE (approved by the admin) reposts host parties from the
//     pool with their OWN price + ticket design — the repost is what goes
//     live on the Events page. They earn 5% on every sale of a repost,
//     and share their repost link to bring people to the site.
//   · Split per sale: 5% affiliate · 65% host · 30% platform.
// ------------------------------------------------------------------

const shareUrl = (id) =>
  `${window.location.origin}${window.location.pathname}#party/${id}`;

export default function Host({ setTab }) {
  const {
    userParties,
    hostPartyPool,
    myReposts,
    hostLogs,
    affiliateLogs,
    saveTicketDesign,
    updateTicketStock,
    notify,
    applyAffiliate,
  } = useStore();
  const { user, authLoading, openAuth, affiliate, refreshAffiliate } = useAuth();
  const [editing, setEditing] = useState(null);
  const [design, setDesign] = useState(null);
  const [copied, setCopied] = useState("");
  const [copiedLink, setCopiedLink] = useState("");
  const [busy, setBusy] = useState(false);

  const isApproved = affiliate?.status === "approved";
  const uid = user?.id ?? null;

  // Parties this affiliate already reposted, keyed by the original id.
  const repostedSourceIds = useMemo(
    () => new Set(myReposts.map((r) => r.sourcePartyId).filter(Boolean)),
    [myReposts]
  );

  const partyById = useMemo(() => {
    const m = new Map();
    [...hostPartyPool, ...myReposts, ...userParties].forEach((p) => {
      if (p && p.id) m.set(p.id, p);
    });
    return m;
  }, [hostPartyPool, myReposts, userParties]);

  // Repost sales — the affiliate's 5% per sale, grouped per repost.
  const affiliateStats = useMemo(() => {
    const soldByParty = {};
    let commission = 0;
    affiliateLogs.forEach((l) => {
      const price = Number(l.price) || 0;
      const aff = Number(l.affiliate_share) || Math.round(price * AFFILIATE_RATE);
      soldByParty[l.party_id] = (soldByParty[l.party_id] || 0) + 1;
      commission += aff;
    });
    return { commission, sold: affiliateLogs.length, soldByParty };
  }, [affiliateLogs]);

  // Host sales — the 65% the party owner keeps on every repost sale.
  const hostStats = useMemo(() => {
    let earnings = 0;
    hostLogs.forEach((l) => {
      const price = Number(l.price) || 0;
      const aff = Number(l.affiliate_share) || Math.round(price * AFFILIATE_RATE);
      const plat = Number(l.commission) || Math.round(price * COMMISSION_RATE);
      earnings += Math.max(0, price - aff - plat);
    });
    return { earnings, sold: hostLogs.length };
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

  const copyLink = (id) => {
    try {
      navigator.clipboard?.writeText(shareUrl(id));
    } catch {
      /* clipboard unavailable */
    }
    setCopiedLink(id);
    notify("Your repost link copied — share it to bring people in");
    window.setTimeout(() => setCopiedLink(""), 1600);
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
      <div className="kicker">Affiliate · hosts post, affiliates repost</div>
      <h1>
        Affiliate<span className="outline">.</span>
      </h1>
      <p className="lede">
        Hosts post their parties and they land in the pool below. Approved
        affiliates repost a party with their own price, put it on the
        Events page and earn {Math.round(AFFILIATE_RATE * 100)}% of every
        sale — the host keeps {Math.round((1 - COMMISSION_RATE - AFFILIATE_RATE) * 100)}%,
        the platform takes {Math.round(COMMISSION_RATE * 100)}%.
      </p>
    </header>
  );

  // ---- The pool: host-posted parties waiting for an affiliate repost.
  // Visible to every signed-in user (hosts see their own, marked "Yours").
  const poolSection = (
    <Reveal>
      <div className="host-toolbar">
        <div className="section-label" style={{ margin: 0 }}>
          Host parties in the pool ({hostPartyPool.length})
        </div>
        <button className="btn btn-sm" onClick={() => setTab("parties/new")}>
          <i className="fa-solid fa-plus icon" /> Post a party
        </button>
      </div>
      {hostPartyPool.length === 0 ? (
        <div className="empty-state">
          <i className="fa-solid fa-champagne-glasses" />
          <h3>No parties in the pool yet</h3>
          <p>
            Anyone on FesGH can post a party — it lands here for approved
            affiliates to repost with their price. Post one and it shows up
            in this pool.
          </p>
          <button className="btn" onClick={() => setTab("parties/new")}>
            Post a party <i className="fa-solid fa-arrow-right icon" />
          </button>
        </div>
      ) : (
        <div className="grid host-grid">
          {hostPartyPool.map((p) => {
            const mine = p.userId === uid;
            const alreadyReposted = repostedSourceIds.has(p.id);
            return (
              <article className="card host-party" key={p.id}>
                <div className="card-top">
                  <span className="card-tag">{p.category}</span>
                  <span className="card-status">{mine ? "Yours" : "In the pool"}</span>
                </div>
                <h3>{p.title}</h3>
                <p className="host">
                  {p.date} · {p.location}
                </p>
                <p className="desc">{p.description}</p>
                <div className="host-party-stats">
                  <span>
                    <b>{p.host}</b> posted this
                  </span>
                  {!mine && (
                    <span>
                      <b>{p.rsvps}</b> RSVPs
                    </span>
                  )}
                </div>
                <div className="card-foot host-party-actions">
                  {isApproved && !mine && !alreadyReposted ? (
                    <button
                      className="btn btn-sm"
                      onClick={() => setTab(`parties/new?repost=${p.id}`)}
                    >
                      <i className="fa-solid fa-retweet icon" /> Repost with your price
                    </button>
                  ) : alreadyReposted && isApproved ? (
                    <button className="btn btn-sm" disabled>
                      <i className="fa-solid fa-check icon" /> Reposted by you
                    </button>
                  ) : (
                    <button className="btn btn-sm" onClick={() => setTab(`party/${p.id}`)}>
                      <i className="fa-solid fa-eye icon" /> View
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </Reveal>
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
          <h2>Sign in to open the Affiliate program</h2>
          <p>
            Post your party into the pool, or apply to become an affiliate
            and repost parties with your own price — earning 5% on every
            sale you drive.
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
            <h2>Become an affiliate</h2>
            <p className="affiliate-pitch-lead">
              Affiliates don't host — they repost. Pick any host's party
              from the pool, attach your own price and put it on the scene.
              Every ticket sold on your repost pays you 5%.
            </p>
            <div className="affiliate-perks">
              <div className="affiliate-perk">
                <i className="fa-solid fa-retweet" />
                <b>Repost any party</b>
                <span>Copy a host's party from the pool and set your own price.</span>
              </div>
              <div className="affiliate-perk">
                <i className="fa-solid fa-share-nodes" />
                <b>Share your link</b>
                <span>Every repost gets a link — bring your people straight to it.</span>
              </div>
              <div className="affiliate-perk">
                <i className="fa-solid fa-piggy-bank" />
                <b>Earn {Math.round(AFFILIATE_RATE * 100)}% per sale</b>
                <span>
                  The host keeps {Math.round((1 - COMMISSION_RATE - AFFILIATE_RATE) * 100)}%,
                  you take {Math.round(AFFILIATE_RATE * 100)}% of every ticket sold.
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
                  Apply to become an affiliate <i className="fa-solid fa-arrow-right icon" />
                </>
              )}
            </button>
            <div className="affiliate-or">or</div>
            <div className="affiliate-idea">
              <i className="fa-solid fa-champagne-glasses" />
              <div>
                <b>Got a party? Post it as a host</b>
                <p>
                  Post your party's details — it lands in the pool for
                  affiliates to repost with their price. You keep 65% of
                  every sale they make.
                </p>
              </div>
              <button
                className="btn btn-sm btn-outline"
                onClick={() => setTab("parties/new")}
              >
                Post a party
              </button>
            </div>
          </div>
        </Reveal>
        {poolSection}
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
          <h2>Affiliate application under review</h2>
          <p>
            Your affiliate application is with the admin. Once approved you
            can repost parties from the pool with your own price and start
            earning your 5% commission. You can still post your own parties
            as a host while you wait.
          </p>
          <button className="btn btn-outline" onClick={() => refreshAffiliate()}>
            <i className="fa-solid fa-rotate icon" /> Check status
          </button>
        </div>
        {poolSection}
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
          <h2>Affiliate application declined</h2>
          <p>
            Your request wasn't approved this time. You can re-apply — and
            you can still post your own parties as a host while you wait.
          </p>
          <button className="btn" onClick={apply} disabled={busy}>
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
        {poolSection}
      </div>
    );
  }

  // ---- Approved: the full affiliate dashboard -------------------
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
              Repost host parties with your own price — you earn{" "}
              <b>{Math.round(AFFILIATE_RATE * 100)}%</b> of every ticket sold
              on your reposts. The host keeps{" "}
              {Math.round((1 - COMMISSION_RATE - AFFILIATE_RATE) * 100)}%, the
              platform takes {Math.round(COMMISSION_RATE * 100)}%.
            </p>
          </div>
          <div className="affiliate-summary-stats">
            <div>
              <b>{GH_CD(affiliateStats.commission)}</b>
              <span>your {Math.round(AFFILIATE_RATE * 100)}% commission</span>
            </div>
            <div>
              <b>{affiliateStats.sold}</b>
              <span>repost tickets sold</span>
            </div>
            <div>
              <b>{GH_CD(hostStats.earnings)}</b>
              <span>host earnings ({Math.round((1 - COMMISSION_RATE - AFFILIATE_RATE) * 100)}%)</span>
            </div>
          </div>
        </div>
      </Reveal>

      {poolSection}

      {/* Your reposts — priced listings that are live on the Events page */}
      <Reveal>
        <div className="host-toolbar">
          <div className="section-label" style={{ margin: 0 }}>
            Your reposts ({myReposts.length})
          </div>
          <button className="btn btn-sm" onClick={() => setTab("parties/new")}>
            <i className="fa-solid fa-plus icon" /> Post a party
          </button>
        </div>
        {myReposts.length === 0 ? (
          <div className="empty-state">
            <i className="fa-solid fa-retweet" />
            <h3>No reposts yet</h3>
            <p>
              Pick a party from the pool above and repost it with your own
              price — it goes live on the Events page and every sale pays
              you 5%. Share your repost link to bring people in.
            </p>
          </div>
        ) : (
          <div className="grid host-grid">
            {myReposts.map((p) => {
              const onSale = !!(p.ticketDesign && p.ticketDesign.enabled);
              const sold = affiliateStats.soldByParty[p.id] || 0;
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
                      <b>{GH_CD(p.price)}</b> your price
                    </span>
                    {onSale && (
                      <>
                        <span>
                          <b>{sold}</b> sold
                        </span>
                        <span>
                          <b>{GH_CD(sold * (Number(p.price) || 0))}</b> revenue
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
                      className={`btn btn-sm ${copiedLink === p.id ? "" : "btn-outline"}`}
                      onClick={() => copyLink(p.id)}
                      title="Copy your repost link"
                    >
                      <i
                        className={`fa-solid ${
                          copiedLink === p.id ? "fa-check" : "fa-link"
                        } icon`}
                      />
                      {copiedLink === p.id ? "Link copied" : "Share link"}
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

      {/* Sales you drove — the 5% commission on every repost sale */}
      <Reveal>
        <div className="host-toolbar">
          <div className="section-label" style={{ margin: 0 }}>
            Repost sales — your {Math.round(AFFILIATE_RATE * 100)}% ({affiliateLogs.length})
          </div>
          <button className="btn btn-sm btn-outline" onClick={() => setTab("verify")}>
            <i className="fa-solid fa-shield-halved icon" /> Verify a ticket
          </button>
        </div>
        {affiliateLogs.length === 0 ? (
          <div className="empty-state">
            <i className="fa-solid fa-receipt" />
            <h3>No repost sales yet</h3>
            <p>
              When someone buys a ticket on one of your reposts, your 5%
              commission and the buyer's details show up here. Share your
              repost links to get the word out.
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="sales-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Buyer</th>
                  <th>Price</th>
                  <th>Your {Math.round(AFFILIATE_RATE * 100)}%</th>
                  <th>Ticket hash</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {affiliateLogs.map((l) => {
                  const price = Number(l.price) || 0;
                  const aff = Number(l.affiliate_share) || Math.round(price * AFFILIATE_RATE);
                  return (
                    <tr key={l.id}>
                      <td>{partyById.get(l.party_id)?.title || "Event"}</td>
                      <td>{l.buyer_name || "—"}</td>
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

      {/* Host sales — the 65% you keep when your parties get reposted */}
      {hostLogs.length > 0 && (
        <Reveal>
          <div className="host-toolbar">
            <div className="section-label" style={{ margin: 0 }}>
              Your parties' sales — your{" "}
              {Math.round((1 - COMMISSION_RATE - AFFILIATE_RATE) * 100)}% (
              {hostLogs.length})
            </div>
          </div>
          <div className="table-scroll">
            <table className="sales-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Buyer</th>
                  <th>Price</th>
                  <th>
                    Your {Math.round((1 - COMMISSION_RATE - AFFILIATE_RATE) * 100)}%
                  </th>
                  <th>Ticket hash</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {hostLogs.map((l) => {
                  const price = Number(l.price) || 0;
                  const aff = Number(l.affiliate_share) || Math.round(price * AFFILIATE_RATE);
                  const plat = Number(l.commission) || Math.round(price * COMMISSION_RATE);
                  const mine = Math.max(0, price - aff - plat);
                  return (
                    <tr key={l.id}>
                      <td>{partyById.get(l.party_id)?.title || "Event"}</td>
                      <td>{l.buyer_name || "—"}</td>
                      <td>{GH_CD(price)}</td>
                      <td className="admin-commission-cell">{GH_CD(mine)}</td>
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
        </Reveal>
      )}

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
