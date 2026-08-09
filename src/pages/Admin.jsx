import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useStore } from "../context/StoreContext";
import { useSocial } from "../context/SocialContext";
import { GH_CD } from "../data/seed";
import { COMMISSION_RATE } from "../context/StoreContext";
import { promoOf } from "../lib/ticketPresets";
import Reveal from "../components/Reveal";
import CoverArt from "../components/CoverArt";

// ------------------------------------------------------------------
// Admin dashboard — the creator's private command center. Password
// gated (hashed, session unlock + attempt limiter). It shows the
// platform overview, every order, and — most importantly — the
// creator's 20% commission on every ticket sold, broken down per
// party. Reads the same public tables the site already uses, so it
// needs zero setup.
// ------------------------------------------------------------------

// djb2 hash of the admin password — compare hashes, never the plaintext.
const ADMIN_PW_HASH = 4279517490;
const MAX_ATTEMPTS = 5;
const LOCK_MS = 30000; // 30s lock after too many wrong attempts

function hashPw(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (h * 33 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

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
  const { allParties, hostLogs, myTickets, globalPromos, addGlobalPromo, removeGlobalPromo } =
    useStore();
  const { hypeFeed } = useSocial();

  // Promo-code creator form.
  const [newCode, setNewCode] = useState("");
  const [newPct, setNewPct] = useState("");
  const [promoError, setPromoError] = useState("");

  // ------------------------------------------------------------
  // Password gate — session unlock + attempt limiter.
  // ------------------------------------------------------------
  const [unlocked, setUnlocked] = useState(() => {
    try {
      return sessionStorage.getItem("festivity.adminUnlock") === "1";
    } catch {
      return false;
    }
  });
  const [pw, setPw] = useState("");
  const [pwError, setPwError] = useState("");
  const [attempts, setAttempts] = useState(() => {
    try {
      return Number(sessionStorage.getItem("festivity.adminAttempts")) || 0;
    } catch {
      return 0;
    }
  });
  const [lockedUntil, setLockedUntil] = useState(() => {
    try {
      return Number(sessionStorage.getItem("festivity.adminLockUntil")) || 0;
    } catch {
      return 0;
    }
  });
  const [now, setNow] = useState(Date.now());

  // Countdown ticker while locked. Self-clears the moment the lock
  // expires so the interval never outlives the lockout.
  useEffect(() => {
    if (lockedUntil <= Date.now()) return undefined;
    const t = window.setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= lockedUntil) window.clearInterval(t);
    }, 250);
    return () => window.clearInterval(t);
  }, [lockedUntil]);

  const lockRemaining = Math.max(0, Math.ceil((lockedUntil - now) / 1000));
  const locked = lockedUntil > now;

  const unlock = (e) => {
    e.preventDefault();
    if (locked) return;
    if (hashPw(pw.trim()) === ADMIN_PW_HASH) {
      try {
        sessionStorage.setItem("festivity.adminUnlock", "1");
        sessionStorage.removeItem("festivity.adminAttempts");
        sessionStorage.removeItem("festivity.adminLockUntil");
      } catch {
        /* storage unavailable */
      }
      setUnlocked(true);
      setPw("");
      setPwError("");
      setAttempts(0);
      setLockedUntil(0);
      return;
    }
    const next = attempts + 1;
    setAttempts(next);
    try {
      sessionStorage.setItem("festivity.adminAttempts", String(next));
    } catch {
      /* ignore */
    }
    if (next >= MAX_ATTEMPTS) {
      const until = Date.now() + LOCK_MS;
      setLockedUntil(until);
      setNow(Date.now());
      try {
        sessionStorage.setItem("festivity.adminLockUntil", String(until));
      } catch {
        /* ignore */
      }
      setPwError(`Too many attempts — locked for 30 seconds.`);
      setPw("");
    } else {
      setPwError(
        `That's not the right password. ${MAX_ATTEMPTS - next} attempt${
          MAX_ATTEMPTS - next === 1 ? "" : "s"
        } left.`
      );
      setPw("");
    }
  };

  const lock = () => {
    setUnlocked(false);
    try {
      sessionStorage.removeItem("festivity.adminUnlock");
    } catch {
      /* ignore */
    }
  };

  // ------------------------------------------------------------
  // Revenue + the creator's 20% commission.
  // ------------------------------------------------------------
  const commissionOf = (price) => Math.round((Number(price) || 0) * COMMISSION_RATE);

  const revenueByParty = useMemo(() => {
    const map = new Map();
    hostLogs.forEach((l) => {
      const cur = map.get(l.party_id) || { count: 0, income: 0, commission: 0 };
      cur.count += 1;
      cur.income += Number(l.price) || 0;
      cur.commission += commissionOf(l.price);
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
  // Creator commission on confirmed sales in the host log (20% of each).
  const ownCommission = hostLogs.reduce((s, l) => s + commissionOf(l.price), 0);
  // Creator commission on tickets bought on this device.
  const boughtCommission = myTickets.reduce(
    (s, t) => s + (Number(t.commission) || commissionOf(t.price)),
    0
  );
  // Platform-wide estimate: 20% of the gross the public data shows.
  const estCommission = stats ? Math.round(stats.estIncome * COMMISSION_RATE) : 0;

  // ------------------------------------------------------------
  // Promo codes — every live discount: the ones the creator runs
  // (global, apply everywhere) plus host promos on party designs.
  // ------------------------------------------------------------
  const allPromos = useMemo(() => {
    const map = new Map();
    globalPromos.forEach((g) => {
      if (g && g.code) map.set(g.code, { code: g.code, pct: g.pct, scope: "global" });
    });
    allParties.forEach((p) => {
      const pr = promoOf(p.ticketDesign || null);
      if (pr && !map.has(pr.code)) {
        map.set(pr.code, { code: pr.code, pct: pr.pct, scope: "host", party: p.title });
      }
    });
    return [...map.values()].sort((a, b) =>
      a.scope === b.scope ? a.code.localeCompare(b.code) : a.scope === "global" ? -1 : 1
    );
  }, [globalPromos, allParties]);

  // Usage + money saved for buyers, counted from purchases on this device.
  const promoStats = (code) => {
    let used = 0;
    let saved = 0;
    myTickets.forEach((t) => {
      if (t.promoUsed && t.promoUsed.code === code) {
        used += 1;
        const pct = Math.max(0, Math.min(99, Number(t.promoUsed.pct) || 0));
        saved += Math.round(Number(t.price) / (1 - pct / 100)) - Number(t.price);
      }
    });
    return { used, saved };
  };

  const createPromo = () => {
    const pct = Number(newPct);
    if (!newCode.trim() || !pct || pct < 1 || pct > 100) {
      setPromoError("Enter a code and a discount between 1 and 100%.");
      return;
    }
    const ok = addGlobalPromo(newCode, pct);
    if (ok) {
      setNewCode("");
      setNewPct("");
      setPromoError("");
    }
  };

  const head = (
    <header className="page-head reveal in">
      <div className="kicker">Creator · Command center</div>
      <h1>
        Admin<span className="outline">.</span>
      </h1>
      <p className="lede">
        Your private dashboard. Every ticket sold earns you a{" "}
        {Math.round(COMMISSION_RATE * 100)}% commission — here's the whole
        picture: orders, income, commission per party, hype and growth.
      </p>
    </header>
  );

  // ------------------------- Gate -----------------------------
  if (!unlocked) {
    return (
      <div className="page">
        {head}
        <div className="form-panel gate-panel">
          <div className="gate-icon">
            <i className="fa-solid fa-lock" />
          </div>
          <h2>Admin only</h2>
          <p>
            Enter the admin password to open the platform dashboard.
          </p>
          <form onSubmit={unlock}>
            <div className="field" style={{ textAlign: "left" }}>
              <label htmlFor="admin-pw">Password</label>
              <input
                id="admin-pw"
                className="input"
                type="password"
                placeholder="••••••••••"
                value={pw}
                disabled={locked}
                onChange={(e) => {
                  setPw(e.target.value);
                  setPwError("");
                }}
                autoFocus
              />
            </div>
            {locked ? (
              <p
                className="admin-lock-msg"
                role="status"
              >
                <i className="fa-solid fa-hourglass-half" aria-hidden="true" />{" "}
                Too many attempts — try again in {lockRemaining}s
              </p>
            ) : (
              pwError && (
                <p
                  style={{
                    color: "var(--rose-deep)",
                    margin: "-6px 0 14px",
                    fontSize: 14,
                    textAlign: "left",
                  }}
                >
                  {pwError}
                </p>
              )
            )}
            <button
              className="btn"
              type="submit"
              disabled={locked}
              style={{ width: "100%", justifyContent: "center" }}
            >
              <i className="fa-solid fa-unlock-keyhole icon" /> Unlock dashboard
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="page">
        {head}
        <div className="profile-loader" aria-label="Loading platform stats" />
      </div>
    );
  }

  const kpis = [
    { icon: "fa-coins", label: "Your commission", value: GH_CD(estCommission), sub: `${Math.round(COMMISSION_RATE * 100)}% of every ticket`, accent: "#1f7a4d" },
    { icon: "fa-champagne-glasses", label: "Parties", value: stats.parties, sub: `${stats.rsvps} RSVPs total` },
    { icon: "fa-ticket", label: "Tickets sold", value: stats.ticketsSold, sub: "across all parties" },
    { icon: "fa-sack-dollar", label: "Gross income", value: GH_CD(stats.estIncome), sub: "before your 20% cut" },
    { icon: "fa-star", label: "Reviews", value: stats.reviews, sub: `${stats.avgRating.toFixed(1)}/5 avg · ${stats.verifiedReviews} verified` },
    { icon: "fa-users", label: "Users", value: stats.users, sub: "signed-up members" },
    { icon: "fa-fire", label: "Hypes", value: stats.hypes, sub: "public clips posted" },
    { icon: "fa-user-plus", label: "Follows", value: stats.follows, sub: "social connections" },
  ];

  return (
    <div className="page">
      {head}

      <Reveal>
        <div className="admin-toolbar" style={{ marginTop: 0 }}>
          <div className="section-label" style={{ margin: 0 }}>
            Platform overview
          </div>
          <button className="btn btn-sm btn-outline" onClick={lock}>
            <i className="fa-solid fa-lock icon" /> Lock
          </button>
        </div>
        <div className="admin-kpis">
          {kpis.map((k) => (
            <StatCard key={k.label} {...k} />
          ))}
        </div>
      </Reveal>

      <Reveal>
        <div className="section-label">
          Promo codes · {allPromos.length} live
        </div>
        <div className="admin-promo">
          <div className="promo-create">
            <input
              className="input promo-code-input"
              placeholder="CODE · e.g. LAUNCH20"
              value={newCode}
              maxLength={20}
              onChange={(e) => {
                setNewCode(e.target.value);
                setPromoError("");
              }}
              aria-label="Promo code"
            />
            <input
              className="input promo-pct-input"
              type="number"
              min={1}
              max={100}
              placeholder="% off"
              value={newPct}
              onChange={(e) => {
                setNewPct(e.target.value);
                setPromoError("");
              }}
              aria-label="Discount percent"
            />
            <button
              className="btn btn-sm"
              onClick={createPromo}
              disabled={!newCode.trim() || !newPct}
            >
              <i className="fa-solid fa-tag icon" /> Create promo
            </button>
          </div>
          {promoError && <p className="promo-err">{promoError}</p>}
          <p className="admin-promo-note">
            Global codes work at any checkout, on any device — perfect for
            launch discounts or influencer codes. Host promos on party
            tickets are listed here too. You still earn your{" "}
            {Math.round(COMMISSION_RATE * 100)}% commission on the
            discounted price. Usage counts purchases made on this device.
          </p>
          {allPromos.length === 0 ? (
            <div className="empty-state" style={{ padding: 36 }}>
              <i className="fa-solid fa-tags" />
              <h3>No promos running</h3>
              <p>
                Create one above and buyers get the discount at checkout.
              </p>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="sales-table admin-promo-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Discount</th>
                    <th>Scope</th>
                    <th>Used</th>
                    <th>Saved for buyers</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {allPromos.map((r) => {
                    const st = promoStats(r.code);
                    return (
                      <tr key={r.code}>
                        <td>
                          <b>{r.code}</b>
                        </td>
                        <td>−{r.pct}%</td>
                        <td>
                          <span
                            className={`promo-chip ${r.scope === "global" ? "global" : "host"}`}
                          >
                            {r.scope === "global" ? "Global · you" : `By host · ${r.party}`}
                          </span>
                        </td>
                        <td>{st.used}×</td>
                        <td>{GH_CD(st.saved)}</td>
                        <td>
                          {r.scope === "global" && (
                            <button
                              className="btn btn-sm btn-outline"
                              onClick={() => removeGlobalPromo(r.code)}
                            >
                              Remove
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
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
                      <th>Your 20%</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hostLogs.slice(0, 12).map((l) => (
                      <tr key={l.id}>
                        <td>{partyName(l.party_id)}</td>
                        <td>{l.buyer_name || "—"}</td>
                        <td>{GH_CD(Number(l.price) || 0)}</td>
                        <td className="admin-commission-cell">
                          {GH_CD(commissionOf(l.price))}
                        </td>
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
                  <span>
                    {GH_CD(Number(t.price) || 0)}
                    <small style={{ display: "block", color: "#1f7a4d" }}>
                      commission {GH_CD(Number(t.commission) || commissionOf(t.price))}
                    </small>
                  </span>
                </div>
              ))}
              {myTickets.length === 0 && (
                <p style={{ color: "var(--ink-soft)" }}>No purchases on this device yet.</p>
              )}
            </div>
          </div>

          <div>
            <div className="section-label">Commission by party · you</div>
            {topParties.length === 0 ? (
              <div className="empty-state" style={{ padding: 40 }}>
                <i className="fa-solid fa-chart-simple" />
                <h3>No commission yet</h3>
                <p>Your cut so far: {GH_CD(ownCommission)}.</p>
              </div>
            ) : (
              <div className="income-bars">
                {topParties.map((p) => (
                  <div className="income-row" key={p.id}>
                    <div className="income-row-head">
                      <span>{p.name}</span>
                      <b>
                        {p.count} sold · your {GH_CD(p.commission)}
                      </b>
                    </div>
                    <div className="income-bar">
                      <div
                        className="income-fill"
                        style={{
                          width: `${Math.max(
                            6,
                            (p.commission / Math.max(1, topParties[0].commission)) * 100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
                <div className="income-total">
                  Your confirmed commission: <b>{GH_CD(ownCommission)}</b>
                  <span className="income-total-sub">
                    ({Math.round(COMMISSION_RATE * 100)}% of {GH_CD(ownIncome)} in sales)
                  </span>
                </div>
                <div className="income-total">
                  Commission from this device's purchases:{" "}
                  <b>{GH_CD(boughtCommission)}</b>
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
