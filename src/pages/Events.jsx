import { useMemo, useState } from "react";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { useSocial } from "../context/SocialContext";
import { buildSignals, scoreFeed, trendingFeed, formatCount } from "../lib/fyp";
import TicketCard from "../components/TicketCard";
import PartyCard from "../components/PartyCard";
import TicketStub from "../components/TicketStub";
import DesignedTicket from "../components/DesignedTicket";
import ArticleCard from "../components/ArticleCard";
import ArticleModal from "../components/ArticleModal";
import Reveal from "../components/Reveal";

// ------------------------------------------------------------------
// Events — the merged Tickets + Parties + For You tab. A ranked
// "For You" section sits on top (events + hype videos in one feed),
// with the full searchable browse below. Old #tickets / #parties
// links still land here via the router.
// ------------------------------------------------------------------

const VIEWS = [
  { id: "all", label: "Everything" },
  { id: "tickets", label: "Tickets" },
  { id: "parties", label: "Parties" },
];

const KIND_LABEL = { ticket: "Tickets", party: "Parties", post: "Blog", hype: "Hype" };

// One hype clip in the merged feed — a muted looping 16:9 preview that
// jumps straight into the full Hype player when tapped.
function HypeCard({ hype, setTab }) {
  const author = hype.author?.name || "Creator";
  return (
    <a
      className="card fyp-hype"
      href="#hype"
      onClick={(e) => {
        e.preventDefault();
        setTab("hype");
      }}
    >
      <div className="fyp-hype-media">
        <video src={hype.video_url} muted loop playsInline preload="metadata" />
        <span className="fyp-hype-play">
          <i className="fa-solid fa-play" aria-hidden="true" />
        </span>
        <span className="fyp-hype-badge">
          <i className="fa-solid fa-fire" aria-hidden="true" />
        </span>
      </div>
      <div className="fyp-hype-info">
        <b>@{author}</b>
        <p>{hype.caption || "A hype clip"}</p>
        <span>
          <i className="fa-solid fa-eye" aria-hidden="true" /> {formatCount(hype.views || 0)} views
        </span>
      </div>
    </a>
  );
}

export default function Events({ initialView = "all", setTab }) {
  const { allTickets, allParties, allPosts, myTickets, going, userReviews, saved } =
    useStore();
  const { following, hypeFeed } = useSocial();
  const { user, ensureAuth } = useAuth();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [view, setView] = useState(
    VIEWS.some((v) => v.id === initialView) ? initialView : "all"
  );
  const [openPost, setOpenPost] = useState(null);

  // Anyone can post a party idea — approved hosts pick it up and set
  // the price. Non-affiliates land on the idea form; affiliates get the
  // full pricing + ticket flow.
  const openForm = () => {
    if (!ensureAuth("parties/new")) return;
    setTab("parties/new");
  };

  // Ranked For You feed — events + hype clips in one personalised mix.
  const feed = useMemo(() => {
    const tickets = allTickets.map((t) => ({
      kind: "ticket",
      id: t.id,
      category: t.category,
      authorId: t.hostId || null,
      rsvps: 0,
      sold: t.capacity ? Math.max(0, t.capacity - t.ticketsLeft) : 0,
      reviews: 0,
      date: t.date,
      createdAt: null,
      ref: t,
    }));
    const parties = allParties.map((p) => ({
      kind: "party",
      id: p.id,
      category: p.category,
      authorId: p.userId || p.hostId || null,
      rsvps: p.rsvps || 0,
      sold: p.ticketsSold || 0,
      reviews: 0,
      date: p.date,
      createdAt: p.created_at || null,
      ref: p,
    }));
    const posts = allPosts.map((b) => ({
      kind: "post",
      id: b.id,
      category: b.category,
      authorId: b.userId || null,
      rsvps: 0,
      sold: 0,
      reviews: 0,
      date: b.date,
      createdAt: b.created_at || null,
      ref: b,
    }));
    const hypes = hypeFeed.map((h) => ({
      kind: "hype",
      id: h.id,
      category: null,
      authorId: h.user_id || null,
      rsvps: 0,
      sold: h.views || 0,
      reviews: 0,
      date: null,
      createdAt: h.created_at || null,
      ref: h,
    }));
    const pool = [...tickets, ...parties, ...posts, ...hypes];

    if (user) {
      const signals = buildSignals({
        going,
        myTickets,
        userReviews,
        following,
        saved,
        allParties,
        allTickets,
      });
      return scoreFeed(pool, signals);
    }
    return trendingFeed(pool);
  }, [
    allTickets,
    allParties,
    allPosts,
    hypeFeed,
    going,
    myTickets,
    userReviews,
    following,
    saved,
    user,
  ]);

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

  const renderFeedItem = (item) => {
    if (item.kind === "ticket") return <TicketCard ticket={item.ref} />;
    if (item.kind === "party") return <PartyCard party={item.ref} />;
    if (item.kind === "hype") return <HypeCard hype={item.ref} setTab={setTab} />;
    return <ArticleCard article={item.ref} onOpen={setOpenPost} />;
  };

  return (
    <div className="page">
      <header className="page-head reveal in">
        <div className="kicker">02 · Events + For You</div>
        <h1>
          Events<span className="outline">.</span>
        </h1>
        <p className="lede">
          Events and hype clips in one place — ranked by what you RSVP to,
          buy, watch and read. Browse every party below, grab passes, and
          never miss what's on. Anyone can post a party idea; approved
          hosts pick it up, set a price and put it on the scene.
        </p>
      </header>

      {/* For You — the ranked feed, merged into the Events tab. It's a
          separate recommendation rail, so it only shows on the
          "Everything" view — picking Tickets or Parties browses just
          those. */}
      {view === "all" && feed.length > 0 && (
        <Reveal>
          <div className="section-label">
            <i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true" />
            For You
          </div>
          <div className="grid fyp-grid">
            {feed.map((item, i) => (
              <Reveal key={`${item.kind}-${item.id}`} delay={Math.min(i, 8) * 60}>
                <div className="fyp-wrap">
                  {renderFeedItem(item)}
                  <div className="fyp-reason">
                    <i className="fa-solid fa-sparkles" aria-hidden="true" />
                    {KIND_LABEL[item.kind]} · {item.reason}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </Reveal>
      )}

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
            <i className="fa-solid fa-plus icon" /> Host an event
          </button>
        </div>
      </Reveal>

      {myTickets.length > 0 && view !== "parties" && (
        <Reveal>
          <div className="section-label">Your Tickets ({myTickets.length})</div>
          <div
            className="grid"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}
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
          <p>Try a different search or category — or host the party yourself.</p>
          <button className="btn" onClick={openForm}>
            Host an event
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

      {openPost && <ArticleModal article={openPost} onClose={() => setOpenPost(null)} />}
    </div>
  );
}
