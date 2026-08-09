const CARDS = [
  {
    tab: "tickets",
    tag: "Tickets",
    title: "Shop all parties",
    sub: "Passes to the hottest house parties in Ghana",
    cls: "main",
    shapes: ["orb", "ring", "orb2", "tri"],
  },
  {
    tab: "blog",
    tag: "News, stories & live wire",
    title: "Read the blog",
    sub: "Headlines, guides, playlists & community posts",
    cls: "side",
    shapes: ["tri", "dot", "ring"],
  },
  {
    tab: "hype",
    tag: "Short videos",
    title: "Post hype",
    sub: "Send clips straight to your crew",
    cls: "corner1",
    shapes: ["orb", "dot", "orb2"],
  },
  {
    tab: "parties/new",
    tag: "Join the scene",
    title: "Post your party",
    sub: "Community events & RSVPs",
    cls: "corner2",
    shapes: ["ring", "tri", "dot"],
  },
];

function CardShapes({ shapes }) {
  return (
    <div className="pc-anim" aria-hidden="true">
      {shapes.map((shape, i) => (
        <div key={i} className={`shape ${shape}`} style={{ animationDelay: `${i * 0.9}s` }} />
      ))}
    </div>
  );
}

export default function ProgramCards({ setTab }) {
  return (
    <section className="cards-section" aria-label="Explore the programs">
      <div className="cards-head">
        <span className="cards-kicker">More from the scene</span>
        <h2>
          There is something <em>else</em> for you
        </h2>
        <p>Four ways into the party. Pick your door.</p>
      </div>

      <div className="cards-grid">
        {CARDS.map((c) => (
          <button
            key={c.tab}
            className={`program-card pc-${c.cls}`}
            onClick={() => setTab(c.tab)}
            aria-label={`Go to ${c.title}`}
          >
            <CardShapes shapes={c.shapes} />

            <div className="pc-header">
              <span>{c.tag}</span>
              <i className="fa-solid fa-arrow-right" aria-hidden="true" />
            </div>

            <div className="pc-body">
              {c.cls === "main" ? (
                <>
                  <h2>{c.title}</h2>
                  <div className="pc-btn">
                    <div className="pc-btn-text">
                      <span>Shop</span>
                      <p>All parties</p>
                    </div>
                    <i className="fa-solid fa-bag-shopping" aria-hidden="true" />
                  </div>
                </>
              ) : (
                <>
                  <h2>{c.title}</h2>
                  <p className="pc-sub">{c.sub}</p>
                </>
              )}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
