import { useMemo, useState } from "react";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import PartyCard from "../components/PartyCard";
import Reveal from "../components/Reveal";

// ------------------------------------------------------------------
// Events — the affiliate marketplace: every listing is an affiliate's
// repost of a host's party, priced and ticketed by them. There is no
// separate "ticket" — every party IS a ticket, one unified listing.
// Old #tickets / #parties links still land here via the router.
// ------------------------------------------------------------------

export default function Events({ setTab }) {
  // Only affiliate reposts show here — host originals wait in the pool
  // on the Affiliate tab until someone reposts them with a price.
  const { marketplaceParties } = useStore();
  const { ensureAuth } = useAuth();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");

  // Posting a party = becoming a host: the party lands in the pool on
  // the Affiliate tab, where approved affiliates repost it with their
  // own price to put it on the scene.
  const openForm = () => {
    if (!ensureAuth("parties/new")) return;
    setTab("parties/new");
  };

  const categories = useMemo(
    () => ["All", ...new Set(marketplaceParties.map((p) => p.category))],
    [marketplaceParties]
  );

  const q = query.trim().toLowerCase();
  const matches = (text = "") => !q || text.toLowerCase().includes(q);

  const filteredParties = useMemo(
    () =>
      marketplaceParties.filter(
        (p) =>
          (category === "All" || p.category === category) &&
          matches(`${p.title} ${p.host} ${p.location} ${p.description} ${p.category}`)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [marketplaceParties, category, q]
  );

  const nothing = filteredParties.length === 0;

  return (
    <div className="page">
      <header className="page-head reveal in">
        <div className="kicker">02 · Events</div>
        <h1>
          Events<span className="outline">.</span>
        </h1>
        <p className="lede">
          Every party here is its own ticket — an affiliate's repost of a
          host's party, priced and ticketed by them. Grab a pass right from
          the listing. Want to host? Post your party on the Affiliate tab.
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

      {nothing ? (
        <div className="empty-state">
          <i className="fa-solid fa-magnifying-glass" />
          <h3>No parties match</h3>
          <p>Try a different search or category — or post a party for an affiliate to repost.</p>
          <button className="btn" onClick={openForm}>
            Post a party
          </button>
        </div>
      ) : (
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
    </div>
  );
}
