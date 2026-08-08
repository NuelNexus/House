import { useMemo, useState } from "react";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import PartyCard from "../components/PartyCard";
import Reveal from "../components/Reveal";

export default function Parties({ setTab }) {
  const { allParties } = useStore();
  const { ensureAuth } = useAuth();
  const [category, setCategory] = useState("All");

  const openForm = () => {
    if (!ensureAuth("parties/new")) return;
    setTab("parties/new");
  };

  const categories = useMemo(
    () => ["All", ...new Set(allParties.map((p) => p.category))],
    [allParties]
  );

  const filtered = useMemo(
    () =>
      category === "All"
        ? allParties
        : allParties.filter((p) => p.category === category),
    [allParties, category]
  );

  return (
    <div className="page">
      <header className="page-head reveal in">
        <div className="kicker">02 · Community events</div>
        <h1>
          Parties<span className="outline">.</span>
        </h1>
        <p className="lede">
          House parties posted by real people, from compound kickbacks to villa
          takeovers. RSVP, show up, and bring the energy.
        </p>
      </header>

      <Reveal>
        <div className="page-tools">
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
            <i className="fa-solid fa-plus icon" /> Post your party
          </button>
        </div>
      </Reveal>

      <Reveal>
        <div className="section-label">On the scene ({filtered.length})</div>
      </Reveal>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <i className="fa-solid fa-champagne-glasses" />
          <h3>Nothing in this category yet</h3>
          <p>Be the first to post a party here.</p>
          <button className="btn" onClick={openForm}>
            Post your party
          </button>
        </div>
      ) : (
        <div className="grid">
          {filtered.map((p, i) => (
            <Reveal key={p.id} delay={Math.min(i, 8) * 60}>
              <PartyCard party={p} />
            </Reveal>
          ))}
        </div>
      )}

    </div>
  );
}
