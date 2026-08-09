import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useStore } from "../context/StoreContext";
import { useSocial } from "../context/SocialContext";
import { useAuth } from "../context/AuthContext";
import { GH_CD } from "../data/seed";
import Reveal from "../components/Reveal";
import CoverArt from "../components/CoverArt";

// ------------------------------------------------------------------
// Admin dashboard — a zero-setup platform monitor. It reads the same
// public tables the site already uses (parties, reviews, profiles,
// hypes, follows, posts) plus this account's own sales log, and
// combines them into orders / income / hype / scene overviews.
// No admin role, no extra tables, no configuration.
// ------------------------------------------------------------------

function usePlatformStats() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        // Select "*" so queries never 400 against columns that only exist
        // after the schema is applied — zero-setup means it must work with
        // the live DB as-is.
        const [partiesRes, reviewsRes, profilesRes, hypesRes, followsRes, postsRes] =
          await Promise.all([
            supabase.from("parties").select("*"),
            supabase.from("reviews").select("*"),
            supabase.from("profiles").select("id", { count: "exact", head: true }),
            supabase.from("hypes").select("id", { count: "exact", head: true }).is("recipient_id", null),
            supabase.from("follows").select("follower_id", { count: "exact", head: true }),
            supabase.from("posts").select("*"),
          ]);
        if (!active) return;
        const parties = partiesRes.data || [];
        const reviews = reviewsRes.data || [];
        const avgRating = reviews.length
          ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
          : 0;
        const priceOf = (p) => {
          try {
            const d = p.ticket_design;
            if (d && typeof d === "object" && d.price) return Number(d.price);
          } catch {
            /* ignore */
          }
          return Number(p.price) || 0;
        };
        const ticketsSold = parties.reduce((s, p) => s + (p.tickets_sold || 0), 0);
        const estIncome = parties.reduce(
          (s, p) => s + (p.tickets_sold || 0) * priceOf(p),
          0
        );
        setStats({
          parties: parties.length,
          rsvps: parties.reduce((s, p) => s + (p.rsvps || 0), 0),
          ticketsSold,
          estIncome,
          reviews: reviews.length,
          avgRating,
          verifiedReviews: reviews.filter((r) => r.verified).length,
          users: profilesRes.count ?? 0,
          hypes: hypesRes.count ?? 0,
          follows: followsRes.count ?? 0,
          posts: postsRes.data?.length || 0,
        });
      } catch {
        if (active) setStats(null);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return stats;
}

function StatCard({ icon, label, value, sub, accent }) {
  return (
    <div className="card admin-stat">
      <div className="admin-stat-top">
        <span className="admin-stat-icon">
          <i className={`fa-solid ${icon}`} aria-hidden="true" />
        </span>
        <span className="admin-stat-label">{label}</span>
      </div>
      <div className="admin-stat-value" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {sub && <div className="admin-stat-sub">{sub}</div>}
    </div>
  );
}

export default function Admin({ setTab }) {
  const stats = usePlatformStats();
  const { allParties, hostLogs, myTickets } = useStore();
  const { hypeFeed } = useSocial();

  const revenueByParty = useMemo(() => {
    const map = new Map();
    hostLogs.forEach((l) => {
      const cur = map.get(l.party_id) || { count: 0, income: 0 };
      cur.count += 1;
      cur.income += Number(l.price) || 0;
      map.set(l.party_id, cur);
    });
    return map;
  }, [hostLogs]);

  const partyName = (id) => {
    const p = allParties.find((x) => x.id === id);
    return p ? p.title : "Party";
  };

  const topParties = useMemo(
    () =>
      [...revenueByParty.entries()]
        .map(([id, v]) => ({ id, ...v, name: partyName(id) }))
        .sort((a, b) => b.income - a.income)
        .slice(0, 6),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [revenueByParty, allParties]
  );

  const ownIncome = hostLogs.reduce((s, l) => s + (Number(l.price) || 0), 0);

  const head = (
    <header className="page-head reveal in">
      <div className="kicker">Platform · Monitor</div>
      <h1>
        Admin<span className="outline">.</span>
      </h1>
      <p className="lede">
        A live view of the whole scene — orders, income, hype and growth —
        drawn straight from the community's own data. No setup required.
      </p>
    </header>
  );

  if (!stats) {
    return (
      <div className="page">
        {head}
        <div className="profile-loader" aria-label="Loading platform stats" />
      </div>
    );
  }

  const kpis = [
    { icon: "fa-champagne-glasses", label: "Parties", value: stats.parties, sub: `${stats.rsvps} RSVPs total` },
    { icon: "fa-ticket", label: "Tickets sold", value: stats.ticketsSold, sub: "across all parties" },
    { icon: "fa-coins", label: "Est. income", value: GH_CD(stats.estIncome), sub: "from party ticket sales" },
    { icon: "fa-star", label: "Reviews", value: stats.reviews, sub: `${stats.avgRating.toFixed(1)}/5 avg · ${stats.verifiedReviews} verified` },
    { icon: "fa-users", label: "Users", value: stats.users, sub: "signed-up members" },
    { icon: "fa-fire", label: "Hypes", value: stats.hypes, sub: "public clips posted" },
    { icon: "fa-user-plus", label: "Follows", value: stats.follows, sub: "social connections" },
    { icon: "fa-newspaper", label: "Posts", value: stats.posts, sub: "community stories" },
  ];

  return (
    <div className="page">
      {head}

      <Reveal>
        <div className="section-label" style={{ marginTop: 0 }}>Platform overview</div>
        <div className="admin-kpis">
          {kpis.map((k) => (
            <StatCard key={k.label} {...k} />
          ))}
        </div>
      </Reveal>

      <Reveal>
        <div className="admin-cols">
          <div>
            <div className="section-label">Your orders ({hostLogs.length})</div>
            {hostLogs.length === 0 ? (
              <div className="empty-state" style={{ padding: 40 }}>
                <i className="fa-solid fa-receipt" />
                <h3>No sales yet</h3>
                <p>When buyers grab tickets to your parties, every order lands here.</p>
              </div>
            ) : (
              <div className="table-scroll">
                <table className="sales-table admin-orders">
                  <thead>
                    <tr>
                      <th>Party</th>
                      <th>Buyer</th>
                      <th>Price</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hostLogs.slice(0, 12).map((l) => (
                      <tr key={l.id}>
                        <td>{partyName(l.party_id)}</td>
                        <td>{l.buyer_name || "—"}</td>
                        <td>{GH_CD(Number(l.price) || 0)}</td>
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

            <div className="section-label">Your passes bought ({myTickets.length})</div>
            <div className="admin-ticket-list">
              {myTickets.slice(0, 8).map((t) => (
                <div className="admin-ticket-row" key={t.code}>
                  <span>
                    <b>{t.name}</b>
                    <small>{t.code}</small>
                  </span>
                  <span>{GH_CD(Number(t.price) || 0)}</span>
                </div>
              ))}
              {myTickets.length === 0 && (
                <p style={{ color: "var(--ink-soft)" }}>No purchases on this device yet.</p>
              )}
            </div>
          </div>

          <div>
            <div className="section-label">Income by party · you</div>
            {topParties.length === 0 ? (
              <div className="empty-state" style={{ padding: 40 }}>
                <i className="fa-solid fa-chart-simple" />
                <h3>No income yet</h3>
                <p>Your total: {GH_CD(0)}.</p>
              </div>
            ) : (
              <div className="income-bars">
                {topParties.map((p) => (
                  <div className="income-row" key={p.id}>
                    <div className="income-row-head">
                      <span>{p.name}</span>
                      <b>
                        {p.count} sold · {GH_CD(p.income)}
                      </b>
                    </div>
                    <div className="income-bar">
                      <div
                        className="income-fill"
                        style={{
                          width: `${Math.max(
                            6,
                            (p.income / Math.max(1, topParties[0].income)) * 100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
                <div className="income-total">
                  Your total income: <b>{GH_CD(ownIncome)}</b>
                </div>
              </div>
            )}

            <div className="section-label">Hype feed</div>
            <div className="admin-hypes">
              {hypeFeed.slice(0, 4).map((h) => (
                <div className="admin-hype" key={h.id}>
                  <div
                    className="admin-hype-thumb"
                    style={{
                      backgroundImage: h.video_url ? `url(${h.video_url})` : "none",
                    }}
                  >
                    <i className="fa-solid fa-play" aria-hidden="true" />
                  </div>
                  <div>
                    <b>{h.author?.name || "Someone"}</b>
                    <small>{h.caption || "No caption"}</small>
                  </div>
                </div>
              ))}
              {hypeFeed.length === 0 && (
                <p style={{ color: "var(--ink-soft)" }}>
                  No public hypes yet — the scene is quiet.
                </p>
              )}
            </div>
          </div>
        </div>
      </Reveal>

      <Reveal>
        <div className="section-label">Latest on the scene</div>
        <div className="admin-latest">
          {allParties.slice(0, 6).map((p) => (
            <button
              className="admin-latest-party"
              key={p.id}
              onClick={() => setTab(`party/${p.id}`)}
            >
              <CoverArt category={p.category} />
              <span>
                <b>{p.title}</b>
                <small>
                  {p.date} · {p.rsvps || 0} going
                </small>
              </span>
            </button>
          ))}
          {allParties.length === 0 && (
            <p style={{ color: "var(--ink-soft)" }}>Nothing posted yet.</p>
          )}
        </div>
      </Reveal>
    </div>
  );
}
