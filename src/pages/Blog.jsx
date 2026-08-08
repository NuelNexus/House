import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { SEED_NEWS } from "../data/seed";
import ArticleCard from "../components/ArticleCard";
import ArticleModal from "../components/ArticleModal";
import Marquee from "../components/Marquee";
import Reveal from "../components/Reveal";

const LIVE_QUERY =
  'Ghana music OR afrobeats OR "Ghana entertainment" OR Accra OR Kumasi';

// The news wire runs through the tiny Node proxy (server/news-proxy.mjs)
// because NewsAPI blocks browsers. In dev, Vite proxies /api to it; on a
// static host, set VITE_API_BASE to your deployed proxy (e.g.
// https://festivity-proxy.onrender.com) and the fetch goes there instead.
const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/+$/, "");

const FILTERS = [
  { id: "All", label: "All" },
  { id: "Live", label: "Live wire" },
  { id: "Scene", label: "Scene reports" },
  { id: "Community", label: "Community" },
];

function formatWhen(iso) {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function toArticle(a) {
  return {
    id: a.url,
    kind: "live",
    category: a.source?.name || "Live",
    title: a.title || "Untitled",
    date: formatWhen(a.publishedAt),
    author: a.author || a.source?.name || "Wire",
    readTime: "Live",
    accent: "#3a3b45",
    excerpt:
      (a.description || a.content || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 180) || "Open the full story.",
    url: a.url,
    image: a.urlToImage || null,
  };
}

export default function Blog({ setTab }) {
  const { allPosts, user } = useStore();
  const { ensureAuth } = useAuth();
  const [open, setOpen] = useState(null);
  const [filter, setFilter] = useState("All");
  const [live, setLive] = useState(null); // null = loading, [] = empty/failed
  const [liveError, setLiveError] = useState(false);

  const loadLive = useCallback(async () => {
    setLiveError(false);
    setLive(null);
    try {
      const res = await fetch(`${API_BASE}/api/news?q=${encodeURIComponent(LIVE_QUERY)}`);
      if (!res.ok) throw new Error("live feed unavailable");
      const data = await res.json();
      setLive(Array.isArray(data.articles) ? data.articles.map(toArticle) : []);
    } catch {
      setLiveError(true);
      setLive([]);
    }
  }, []);

  useEffect(() => {
    loadLive();
  }, [loadLive]);

  const openPost = () => {
    if (!ensureAuth("blog/new")) return;
    setTab("blog/new");
  };

  const showLive = filter === "All" || filter === "Live";
  const showScene = filter === "All" || filter === "Scene";
  const showCommunity = filter === "All" || filter === "Community";

  const [sceneFeatured, ...sceneRest] = SEED_NEWS;
  const [commFeatured, ...commRest] = allPosts;

  return (
    <div className="page">
      <header className="page-head reveal in">
        <div className="kicker">04 · Stories & the scene report</div>
        <h1>
          Blog<span className="outline">.</span>
        </h1>
        <p className="lede">
          News from the wire, scene reports from our desk, and stories posted by
          the community — all in one place.
        </p>
      </header>

      <Reveal>
        <div className="page-tools">
          <div className="chips">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                className={`chip ${filter === f.id ? "active" : ""}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button className="btn" onClick={openPost}>
            <i className="fa-solid fa-feather icon" /> Write a post
          </button>
        </div>
      </Reveal>

      {/* Live wire */}
      {showLive && (
        <>
          <Reveal>
            <div className="section-label">
              Live wire {live === null ? "· loading…" : ""}
            </div>
          </Reveal>

          {live === null ? (
            <Reveal>
              <div className="news-loading">
                <div className="profile-loader" aria-label="Loading live news" />
              </div>
            </Reveal>
          ) : live.length > 0 ? (
            <div className="grid">
              {live.slice(0, 8).map((a, i) => (
                <Reveal key={a.id} delay={Math.min(i, 8) * 60}>
                  <ArticleCard article={a} onOpen={setOpen} image={a.image} external />
                </Reveal>
              ))}
            </div>
          ) : (
            <Reveal>
              <p className="live-offline">
                <i className="fa-solid fa-plug-circle-xmark" />
                {liveError
                  ? "The live feed is offline right now — start the news server (npm run proxy) to fetch headlines."
                  : "No live headlines matched this time."}
              </p>
            </Reveal>
          )}
        </>
      )}

      {/* Curated scene reports (ex-News) */}
      {showScene && (
        <>
          <Reveal>
            <div className="section-label">
              Scene reports · Ghana ({SEED_NEWS.length})
            </div>
          </Reveal>
          {sceneFeatured && (
            <Reveal>
              <ArticleCard article={sceneFeatured} onOpen={setOpen} featured />
            </Reveal>
          )}
          {sceneRest.length === 0 ? (
            <div className="empty-state">
              <i className="fa-solid fa-newspaper" />
              <h3>Nothing here yet</h3>
              <p>Check back soon for the latest from the scene.</p>
            </div>
          ) : (
            <div className="grid">
              {sceneRest.map((n, i) => (
                <Reveal key={n.id} delay={Math.min(i, 8) * 60}>
                  <ArticleCard article={n} onOpen={setOpen} />
                </Reveal>
              ))}
            </div>
          )}
        </>
      )}

      {/* Community posts (user-published + editors' blog) */}
      {showCommunity && (
        <>
          <Reveal>
            <div className="section-label">
              Community ({allPosts.length})
              {user && (
                <span className="section-hint">· includes your posts</span>
              )}
            </div>
          </Reveal>

          {commFeatured && (
            <Reveal>
              <ArticleCard
                article={commFeatured}
                onOpen={setOpen}
                featured
                postedByYou={commFeatured.isUser}
              />
            </Reveal>
          )}

          {allPosts.length === 0 ? (
            <div className="empty-state">
              <i className="fa-solid fa-feather" />
              <h3>No community posts yet</h3>
              <p>Be the first to share a story on the blog.</p>
              <button className="btn" onClick={openPost}>
                Write a post
              </button>
            </div>
          ) : (
            <div className="grid">
              {commRest.map((b, i) => (
                <Reveal key={b.id} delay={Math.min(i, 8) * 60}>
                  <ArticleCard
                    article={b}
                    onOpen={setOpen}
                    postedByYou={b.isUser}
                  />
                </Reveal>
              ))}
            </div>
          )}
        </>
      )}

      <div style={{ margin: "70px -20px -80px" }}>
        <Marquee items={["Breaking", "Exclusive", "Community posts", "Live from the scene"]} />
      </div>

      {open && <ArticleModal article={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
