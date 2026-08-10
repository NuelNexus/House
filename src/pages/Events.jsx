import { useMemo, useState } from "react";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import TicketCard from "../components/TicketCard";
import PartyCard from "../components/PartyCard";
import TicketStub from "../components/TicketStub";
import DesignedTicket from "../components/DesignedTicket";
import Reveal from "../components/Reveal";

// ------------------------------------------------------------------
// Events — the affiliate marketplace: every listing is an affiliate's
// repost of a host's party, priced and ticketed by them. Browse by
// Everything / Tickets / Parties with search + category filters.
// Old #tickets / #parties links still land here via the router.
// ------------------------------------------------------------------

const VIEWS = [
  { id: "all", label: "Everything" },
  { id: "tickets", label: "Tickets" },
  { id: "parties", label: "Parties" },
];

export default function Events({ initialView = "all", setTab }) {
  // Only affiliate reposts show here — host originals wait in the pool
  // on the Affiliate tab until someone reposts them with a price.
  const {
    marketplaceTickets: allTickets,
    marketplaceParties: allParties,
    myTickets,
  } = useStore();
  const { ensureAuth } = useAuth();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [view, setView] = useState(
    VIEWS.some((v) => v.id === initialView) ? initialView : "all"
  );

  // Posting a party = becoming a host: the party lands in the pool on
  // the Affiliate tab, where approved affiliates repost it with their
  // own price to put it on the scene.
  const openForm = () => {
    if (!ensureAuth("parties/new")) return;
    setTab("parties/new");
  };

  const categories = useMemo(
    () => [
      "All",
      ...new Set([
        ...allTickets.map((t) => t.category),
        ...allParties.map((p) => p.category),
      ]),
    ],
    [allTickets, allParties]
  );

  const q = query.trim().toLowerCase();
  const matches = (text = "") => !q || text.toLowerCase().includes(q);

  const filteredTickets = useMemo(
    () =>
      allTickets.filter(
        (t) =>
          (category === "All" || t.category === category) &&
          matches(`${t.name} ${t.location} ${(t.lineup || []).join(" ")} ${t.category}`)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allTickets, category, q]
  );

  const filteredParties = useMemo(
    () =>
      allParties.filter(
        (p) =>
          (category === "All" || p.category === category) &&
          matches(`${p.title} ${p.host} ${p.location} ${p.description} ${p.category}`)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allParties, category, q]
  );

  const showTickets = view === "all" || view === "tickets";
  const showParties = view === "all" || view === "parties";
  const nothing =
    (showTickets && filteredTickets.length === 0) &&
    (showParties && filteredParties.length === 0);

  return (
    <div className="page">
      <header className="page-head reveal in">
        <div className="kicker">02 · Events</div>
        <h1>
          Events<span className="outline">.</span>
        </h1>
        <p className="lede">
          Every event here is an affiliate's repost of a host's party —
          picked from the pool, priced and ticketed by them. Want to
          host? Post your party on the Affiliate tab.
        </p>
      </header>

      <Reveal>
        <div className="page-tools">
          <div className="search">
            <i className="fa-solid fa-magnifying-glass" />
            <input
              placeholder="Search parties, cities, artists…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search events"
            />
          </div>
          <div className="view-switch" role="tablist" aria-label="Filter events">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                role="tab"
                aria-selected={view === v.id}
                className={`view-tab ${view === v.id ? "active" : ""}`}
                onClick={() => setView(v.id)}
              >
                {v.label}
              </button>
            ))}
          </div>
          <div className="chips">
            {categories.map((c) => (
              <button
                key={c}
                className={`chip ${category === c ? "active" : ""}`}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <button className="btn" onClick={openForm}>
            <i className="fa-solid fa-plus icon" /> Post a party
          </button>
        </div>
      </Reveal>

      {myTickets.length > 0 && view !== "parties" && (
        <Reveal>
          <div className="section-label">Your Tickets ({myTickets.length})</div>
          <div
            className="grid"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 100%), 1fr))",
            }}
          >
            {myTickets.map((t) =>
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
          </div>
        </Reveal>
      )}

      {nothing ? (
        <div className="empty-state">
          <i className="fa-solid fa-magnifying-glass" />
          <h3>No events match</h3>
          <p>Try a different search or category — or post a party for an affiliate to repost.</p>
          <button className="btn" onClick={openForm}>
            Post a party
          </button>
        </div>
      ) : (
        <>
          {showTickets && filteredTickets.length > 0 && (
            <>
              <Reveal>
                <div className="section-label">
                  On sale now ({filteredTickets.length})
                </div>
              </Reveal>
              <div className="grid">
                {filteredTickets.map((t, i) => (
                  <Reveal key={t.id} delay={Math.min(i, 8) * 60}>
                    <TicketCard ticket={t} />
                  </Reveal>
                ))}
              </div>
            </>
          )}

          {showParties && filteredParties.length > 0 && (
            <>
              <Reveal>
                <div className="section-label">
                  On the scene ({filteredParties.length})
                </div>
              </Reveal>
              <div className="grid">
                {filteredParties.map((p, i) => (
                  <Reveal key={p.id} delay={Math.min(i, 8) * 60}>
                    <PartyCard party={p} />
                  </Reveal>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
