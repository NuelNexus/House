import { useMemo, useState } from "react";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { useSocial } from "../context/SocialContext";
import { buildSignals, scoreFeed, trendingFeed } from "../lib/fyp";
import TicketCard from "../components/TicketCard";
import PartyCard from "../components/PartyCard";
import ArticleCard from "../components/ArticleCard";
import ArticleModal from "../components/ArticleModal";
import Reveal from "../components/Reveal";

const KIND_LABEL = { ticket: "Tickets", party: "Parties", post: "Blog" };

export default function ForYou() {
  const { allTickets, allParties, allPosts, going, myTickets, userReviews, saved } =
    useStore();
  const { following } = useSocial();
  const { user } = useAuth();
  const [openPost, setOpenPost] = useState(null);

  const feed = useMemo(() => {
    // Normalise everything into one mixed pool the engine can rank.
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
    const pool = [...tickets, ...parties, ...posts];

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
    going,
    myTickets,
    userReviews,
    following,
    saved,
    user,
  ]);

  const renderItem = (item) => {
    if (item.kind === "ticket") return <TicketCard ticket={item.ref} />;
    if (item.kind === "party") return <PartyCard party={item.ref} />;
    return <ArticleCard article={item.ref} onOpen={setOpenPost} />;
  };

  return (
    <div className="page">
      <header className="page-head reveal in">
        <div className="kicker">02 · Curated for you</div>
        <h1>
          For You<span className="outline">.</span>
        </h1>
        <p className="lede">
          {user
            ? "Ranked by what you RSVP to, buy and read — fresh picks from the scene, no feed drama."
            : "Trending across the scene right now. Sign in and this feed learns your taste."}
        </p>
      </header>

      {feed.length === 0 ? (
        <div className="empty-state">
          <i className="fa-solid fa-wand-magic-sparkles" />
          <h3>Nothing to show yet</h3>
          <p>Post a party or buy a ticket and your feed will fill up.</p>
        </div>
      ) : (
        <div className="grid fyp-grid">
          {feed.map((item, i) => (
            <Reveal key={`${item.kind}-${item.id}`} delay={Math.min(i, 8) * 60}>
              <div className="fyp-wrap">
                {renderItem(item)}
                <div className="fyp-reason">
                  <i className="fa-solid fa-sparkles" aria-hidden="true" />
                  {KIND_LABEL[item.kind]} · {item.reason}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      )}

      {openPost && <ArticleModal article={openPost} onClose={() => setOpenPost(null)} />}
    </div>
  );
}
