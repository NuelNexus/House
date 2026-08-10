// ============================================================
// For You (FYP) — a tiny ranking engine that personalises the
// feed. Everything runs client-side from data the app already
// has: RSVPs, purchased tickets, reviews, follows and saves.
// No backend, no setup, no tracking — it just learns what you
// engage with and surfaces more of it.
//
// Signals (0-1 weights):
//   category affinity — categories the user RSVPs to / buys / reviews
//   popularity        — rsvps, tickets sold, review count
//   recency           — how fresh the item is
//   social            — posted by someone the user follows
//   saved             — explicit save = instant boost
// ============================================================

// Parse fuzzy date strings like "Sat, Dec 28 · 8 PM" or ISO dates.
function dateRank(createdAt, dateStr) {
  if (createdAt) {
    const t = new Date(createdAt).getTime();
    if (!Number.isNaN(t)) {
      const days = (Date.now() - t) / 86400000;
      return Math.max(0, 1 - days / 60); // fresh this week, decays over 2 months
    }
  }
  if (dateStr) {
    const m = dateStr.match(/[A-Za-z]{3},? ([A-Za-z]{3}) (\d{1,2})/);
    if (m) {
      const months = [
        "jan","feb","mar","apr","may","jun",
        "jul","aug","sep","oct","nov","dec",
      ];
      const mi = months.indexOf(m[1].toLowerCase());
      if (mi !== -1) {
        const day = parseInt(m[2], 10);
        const now = new Date();
        // Rough: events in the future are "upcoming" — mildly fresh.
        const monthDiff = mi - now.getMonth();
        return monthDiff >= -1 && monthDiff <= 3 ? 0.6 : 0.2;
      }
    }
  }
  return 0.3;
}

// Build the user's interest profile from everything they've done.
export function buildSignals({
  going = [],
  myTickets = [],
  userReviews = [],
  following = [],
  saved = [],
  allParties = [],
  allTickets = [],
}) {
  const cats = {}; // category -> engagement count
  const bump = (c, w = 1) => {
    if (!c) return;
    cats[c] = (cats[c] || 0) + w;
  };

  const partyById = new Map(allParties.map((p) => [p.id, p]));
  const ticketById = new Map(allTickets.map((t) => [t.id, t]));

  going.forEach((id) => {
    const p = partyById.get(id);
    if (p) bump(p.category || "Kickback", 2);
  });
  myTickets.forEach((t) => {
    const src = ticketById.get(t.ticketId);
    bump(src?.category || t.category || "Kickback", 1.5);
  });
  userReviews.forEach((r) => bump(r.category || "Kickback", 1));

  // Normalise to a 0-1 weight map.
  const max = Math.max(1, ...Object.values(cats));
  const weights = {};
  Object.entries(cats).forEach(([c, n]) => {
    weights[c] = n / max;
  });

  return {
    weights,
    followed: new Set(following || []),
    saved: new Set(saved || []),
    topCategory: Object.entries(weights).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
  };
}

// Rank one mixed feed of tickets / parties / posts.
// Each item: { kind, id, category, authorId, rsvps, sold, reviews, date, createdAt, saved }
export function scoreFeed(items, signals) {
  const scored = items.map((item) => {
    const affinity = signals.weights[item.category] || 0;
    const popularity = Math.min(
      1,
      ((item.rsvps || 0) * 0.5 + (item.sold || 0) * 0.6 + (item.reviews || 0) * 0.3) /
        40
    );
    const recency = dateRank(item.createdAt, item.date);
    const social = item.authorId && signals.followed.has(item.authorId) ? 1 : 0;
    const saved = signals.saved.has(item.id) ? 1 : 0;

    // Weighted blend — affinity is the star, then fresh + popular.
    const score =
      affinity * 0.42 +
      popularity * 0.2 +
      recency * 0.16 +
      social * 0.12 +
      saved * 0.1;

    // Pick the strongest reason to explain the recommendation.
    let reason = "Popular right now";
    if (saved) reason = "You saved this";
    else if (affinity >= 0.55) reason = `Matches your ${item.category} taste`;
    else if (social) reason = "From someone you follow";
    else if (recency >= 0.75) reason = "Fresh on the scene";
    else if (popularity >= 0.5) reason = "Trending this week";

    return { ...item, score, affinity, popularity, recency, social, reason };
  });

  scored.sort((a, b) => b.score - a.score);

  // Keep the mix interesting: cap each kind so one category can't
  // dominate the whole feed.
  const caps = { ticket: 4, party: 4, post: 3 };
  const counts = { ticket: 0, party: 0, post: 0 };
  const mixed = [];
  scored.forEach((s) => {
    if (counts[s.kind] < caps[s.kind]) {
      counts[s.kind] += 1;
      mixed.push(s);
    }
  });

  return mixed;
}

// ============================================================
// Hype feed helpers — hashtag SEO + compact counts.
// ============================================================

// Pull #hashtags out of a caption: [#tag1 #tag2] deduped + lowercased.
export function extractHashtags(caption = "") {
  const tags = (caption.match(/#([\w]+)/g) || []).map((t) => t.slice(1).toLowerCase());
  return [...new Set(tags)];
}

// 1234 -> "1.2K", 1_250_000 -> "1.3M", 900 -> "900".
export function formatCount(n) {
  const num = Number(n) || 0;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(num);
}

// SEO-style ranking for the For You hype feed. A clip's score rewards
// the things that make it discoverable: hashtags (up to 3), view count
// (log-ish curve so 1M views doesn't dwarf everything), and freshness.
// Keeps each hashtag worth roughly ~6% of the max possible score, and
// views cap out around a third — so a hashtagged, viewed clip floats
// above an equal-age clip that has neither.
export function hypeRankScore(h) {
  const tags = h.hashtags && h.hashtags.length ? h.hashtags : extractHashtags(h.caption);
  const tagBoost = Math.min(tags.length, 3) * 0.06;
  const viewBoost = Math.min(0.34, Math.log10(1 + (h.views || 0)) * 0.06);
  const ageHours = Math.max(
    0,
    (Date.now() - new Date(h.created_at || Date.now()).getTime()) / 3.6e6
  );
  const recency = Math.max(0, 1 - ageHours / 168); // fade over a week
  return tagBoost + viewBoost + recency * 0.5;
}

export function rankHypeFeed(list) {
  return [...list].sort((a, b) => hypeRankScore(b) - hypeRankScore(a));
}

// A few evergreen picks for signed-out users (trending, no profile).
export function trendingFeed(items) {
  const scored = items.map((item) => ({
    ...item,
    score:
      Math.min(1, ((item.rsvps || 0) * 0.5 + (item.sold || 0) * 0.6 + (item.reviews || 0) * 0.3) / 40) * 0.7 +
      dateRank(item.createdAt, item.date) * 0.3,
    reason: "Trending now",
  }));
  scored.sort((a, b) => b.score - a.score);
  const caps = { ticket: 4, party: 4, post: 3 };
  const counts = { ticket: 0, party: 0, post: 0 };
  const mixed = [];
  scored.forEach((s) => {
    if (counts[s.kind] < caps[s.kind]) {
      counts[s.kind] += 1;
      mixed.push(s);
    }
  });
  return mixed;
}
