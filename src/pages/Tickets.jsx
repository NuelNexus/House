import { useMemo, useState } from "react";
import { useStore } from "../context/StoreContext";
import TicketCard from "../components/TicketCard";
import TicketStub from "../components/TicketStub";
import Reveal from "../components/Reveal";

export default function Tickets() {
  const { tickets, myTickets } = useStore();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");

  const categories = useMemo(
    () => ["All", ...new Set(tickets.map((t) => t.category))],
    [tickets]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickets.filter(
      (t) =>
        (category === "All" || t.category === category) &&
        (!q ||
          `${t.name} ${t.location} ${t.lineup.join(" ")} ${t.category}`
            .toLowerCase()
            .includes(q))
    );
  }, [tickets, query, category]);

  return (
    <div className="page">
      <header className="page-head reveal in">
        <div className="kicker">01 · On sale now</div>
        <h1>
          Tickets<span className="outline">.</span>
        </h1>
        <p className="lede">
          Secure your spot at the hottest house parties in Ghana. Digital
          passes, instant confirmation, show the code at the door.
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
              aria-label="Search tickets"
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
        </div>
      </Reveal>

      {myTickets.length > 0 && (
        <>
          <Reveal>
            <div className="section-label">Your Tickets ({myTickets.length})</div>
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
              {myTickets.map((t) => (
                <TicketStub key={t.code} ticket={t} />
              ))}
            </div>
          </Reveal>
        </>
      )}

      <Reveal>
        <div className="section-label">On sale now ({filtered.length})</div>
      </Reveal>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <i className="fa-solid fa-ticket" />
          <h3>No tickets match</h3>
          <p>Try a different search or category.</p>
        </div>
      ) : (
        <div className="grid">
          {filtered.map((t, i) => (
            <Reveal key={t.id} delay={Math.min(i, 8) * 60}>
              <TicketCard ticket={t} />
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}
