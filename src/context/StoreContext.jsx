import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "../lib/supabase";

const StoreContext = createContext(null);

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — ignore */
  }
}

const genCode = () =>
  `FST-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

// Every ticket sale splits on the party's two prices:
//   base price  = what the HOST set when they posted the party
//   sale price  = the repost price the buyer actually pays
// The platform takes 30% of the base + 30% of the affiliate's margin
// (sale − base) — which is exactly 30% of the sale price. The host
// keeps 70% of their base price, and the affiliate keeps 70% of their
// margin (AFFILIATE_MARGIN_RATE).
export const COMMISSION_RATE = 0.3;
export const AFFILIATE_MARGIN_RATE = 0.7;

// Unique per-ticket security hash shown to the buyer and logged for
// the host (e.g. "A1B2-C3D4-E5F6-A7B8").
const genHash = () => {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()
    .replace(/(.{4})/g, "$1-")
    .replace(/-$/, "");
};

// Hash/code comparison is case- and whitespace-insensitive everywhere
// (typed input vs QR payload vs the stored value).
const normalizeHash = (v) =>
  String(v || "").trim().toUpperCase().replace(/\s+/g, "");

function fmtShortDate(iso) {
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

function parseHolder(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

// jsonb columns sometimes come back as a JSON string (older rows were
// double-encoded) — normalise to a real object so the ticket design
// always renders and never falls back to the default pass.
function parseJson(raw) {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw;
}

// Normalise a row from the `parties` table into the app's party shape.
function mapPartyRow(p) {
  return {
    ...p,
    isUser: true, // column default — ownership is checked via userId now
    userId: p.user_id ?? null,
    affiliateId: p.affiliate_id ?? null,
    // Original host of a repost (keeps 70% of their base price) and the
    // party a repost copies. Null on host-posted originals.
    hostId: p.host_id ?? null,
    sourcePartyId: p.source_party_id ?? null,
    // The host's base price a repost marked up from — the split's anchor.
    originalPrice: p.original_price ?? null,
    // Where the seller's ticket share is paid out (mobile money).
    payoutPhone: p.payout_phone ?? null,
    payoutNetwork: p.payout_network ?? null,
    // Map-picked coordinates (null when typed manually).
    locationLat: p.location_lat ?? null,
    locationLng: p.location_lng ?? null,
    // Cover image the host/affiliate set when posting (null = default art).
    coverUrl: p.cover_url ?? null,
    // Missing status = live (legacy). Every party is 'live' — host
    // originals just have no affiliate_id, so they stay in the pool.
    status: p.status ?? "live",
    ticketDesign: parseJson(p.ticket_design),
    ticketsSold: p.tickets_sold ?? 0,
  };
}

// Normalise a row from the `posts` table into the blog post shape.
function mapPostRow(p) {
  return {
    ...p,
    isUser: true,
    userId: p.user_id ?? null,
    date: fmtShortDate(p.created_at),
    readTime: `${Math.max(
      1,
      Math.ceil((p.body || "").split(/\s+/).length / 200)
    )} min read`,
    excerpt: (p.body || "").replace(/\s+/g, " ").trim().slice(0, 180),
  };
}

export function StoreProvider({ children }) {
  const [cart, setCart] = useState(() => load("festivity.cart", []));
  const [myTickets, setMyTickets] = useState(() => load("festivity.tickets", []));
  const [userParties, setUserParties] = useState(() => load("festivity.parties", []));
  const [userReviews, setUserReviews] = useState(() => load("festivity.reviews", []));
  const [userPosts, setUserPosts] = useState(() => load("festivity.posts", []));
  // Every community blog post (all users) — the blog shows the whole
  // community, not just what this device has published.
  const [communityPosts, setCommunityPosts] = useState([]);
  // Codes of passes deleted on THIS device — a reload or re-import can
  // never resurrect them, even if the cloud soft-delete hasn't landed.
  const [deletedTicketCodes, setDeletedTicketCodes] = useState(() =>
    load("festivity.deletedTickets", [])
  );
  const [going, setGoing] = useState(() => load("festivity.going", []));
  // Saved parties (wishlist) — stored locally, shown in the FYP + profile.
  const [saved, setSaved] = useState(() => load("festivity.saved", []));
  // Global promo codes created from the Admin dashboard. These apply to
  // every ticket in any checkout, on any device. They're saved locally
  // first (so they work offline) and mirrored to the promo_codes table
  // so the whole platform sees them.
  const [globalPromos, setGlobalPromos] = useState(() =>
    load("festivity.globalPromos", [])
  );
  // Every party on the scene (all users), so the Parties page shows the
  // whole community — not just the signed-in user's own parties.
  const [communityParties, setCommunityParties] = useState([]);
  // Host's sales log: every pass sold on their party tickets (70% of base).
  const [hostLogs, setHostLogs] = useState([]);
  // Affiliate's sales log: every sale they drove via a repost (70% of margin).
  const [affiliateLogs, setAffiliateLogs] = useState([]);
  // Affiliates — every application (pending / approved / rejected).
  const [affiliates, setAffiliates] = useState([]);
  const [cloudUid, setCloudUid] = useState(null);
  // In-session RSVP adjustments so the "X going" number responds the
  // instant someone taps the button. The database counter (parties.rsvps,
  // kept true by a trigger) is the source of truth after any reload.
  const [rsvpPatches, setRsvpPatches] = useState({});
  const [cartOpen, setCartOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const goingRef = useRef(going);
  const cloudUserRef = useRef(null);
  const deletedTicketCodesRef = useRef(deletedTicketCodes);
  useEffect(() => {
    goingRef.current = going;
  }, [going]);
  useEffect(() => {
    deletedTicketCodesRef.current = deletedTicketCodes;
  }, [deletedTicketCodes]);

  useEffect(() => save("festivity.cart", cart), [cart]);
  useEffect(() => save("festivity.tickets", myTickets), [myTickets]);
  useEffect(() => save("festivity.parties", userParties), [userParties]);
  useEffect(() => save("festivity.reviews", userReviews), [userReviews]);
  useEffect(() => save("festivity.posts", userPosts), [userPosts]);
  useEffect(
    () => save("festivity.deletedTickets", deletedTicketCodes),
    [deletedTicketCodes]
  );
  useEffect(() => save("festivity.going", going), [going]);
  useEffect(() => save("festivity.saved", saved), [saved]);
  useEffect(() => save("festivity.globalPromos", globalPromos), [globalPromos]);

  // ----------------------------------------------------------
  // Derived lists. Declared before the callbacks below because
  // checkout depends on cartItems (via its dependency array).
  // ----------------------------------------------------------
  // Every party (host originals + affiliate reposts) — real user posts
  // only. The Events page filters to reposts (marketplaceParties); host
  // originals surface in the Affiliate tab's pool (hostPartyPool).
  const allParties = useMemo(() => {
    // user first (their freshest copy wins on id collisions), then the
    // whole community scene.
    const map = new Map();
    [...userParties, ...communityParties].forEach((p) => {
      if (p && p.id && (p.status ?? "live") === "live") map.set(p.id, p);
    });
    return [...map.values()];
  }, [userParties, communityParties]);

  // Host-posted parties waiting for an affiliate to repost them. These
  // are the originals (no affiliate_id) — they show in the pool on the
  // Affiliate page until someone reposts one with their own price.
  const hostPartyPool = useMemo(
    () =>
      communityParties.filter(
        (p) => (p.status ?? "live") === "live" && !p.affiliateId
      ),
    [communityParties]
  );

  // Reposts this affiliate has made — their own priced listings of host
  // parties. Every sale on one of these pays them 70% of their margin.
  const myReposts = useMemo(
    () =>
      cloudUid
        ? communityParties.filter((p) => p.affiliateId === cloudUid)
        : [],
    [communityParties, cloudUid]
  );

  // Hosted parties that are selling tickets become purchasable tickets.
  // ONLY affiliate reposts sell — a host's original party has no sale
  // price of its own, it waits in the pool until an affiliate reposts it.
  // On a repost sale the ORIGINAL host keeps 70% of the base price
  // (hostId), the reposting affiliate keeps 70% of their margin
  // (affiliateId), and the platform takes 30% of the sale.
  const communityTickets = useMemo(
    () =>
      communityParties
        .filter(
          (p) =>
            (p.status ?? "live") === "live" &&
            !!p.affiliateId &&
            p.ticketDesign &&
            p.ticketDesign.enabled
        )
        .map((p) => ({
          id: p.id,
          name: p.ticketDesign.name || p.title,
          category: p.category,
          hostName: p.host,
          hostId: p.hostId || p.userId,
          affiliateId: p.affiliateId || null,
          originalPrice: Number(p.originalPrice || 0),
          date: p.date,
          location: p.location,
          // The AFFILIATE's sale price (party.price) is the source of
          // truth — the design's "door price" defaults to "0" and must
          // never override the price the affiliate actually set.
          price: Number(p.price) || Number(p.ticketDesign.price) || 0,
          capacity: Number(p.ticketDesign.stock || 0),
          ticketsLeft: Math.max(
            0,
            Number(p.ticketDesign.stock || 0) - (p.ticketsSold ?? 0)
          ),
          lineup: [],
          vibe: p.description,
          accent: "#a04646",
          isParty: true,
          ticketDesign: p.ticketDesign,
          coverUrl: p.coverUrl,
          party: p,
        })),
    [communityParties]
  );
  // Real user tickets only — affiliate reposts that are on sale.
  const allTickets = useMemo(() => communityTickets, [communityTickets]);

  // The Events page = affiliate REPOSTS only. A host's original party is
  // invisible here until an affiliate reposts it with a price; un-reposted
  // rows stay visible on profiles but not on Events.
  const marketplaceParties = useMemo(
    () => allParties.filter((p) => !!p.affiliateId),
    [allParties]
  );

  // Real user reviews only.
  const allReviews = useMemo(() => userReviews, [userReviews]);
  // The blog feed = the whole community (all users) merged with this
  // device's own posts — a story posted anywhere shows up everywhere.
  const allPosts = useMemo(() => {
    const map = new Map();
    [...userPosts, ...communityPosts].forEach((p) => {
      if (p && p.id) map.set(p.id, p);
    });
    return [...map.values()];
  }, [userPosts, communityPosts]);
  const cartItems = useMemo(() => {
    return cart
      .map((i) => {
        // New-style entries carry a snapshot; legacy {id, qty} entries
        // are resolved against the full ticket list.
        if (i.name) {
          return {
            ...i,
            ticket: {
              id: i.id,
              name: i.name,
              date: i.date,
              location: i.location,
              price: i.price,
            },
          };
        }
        const t = allTickets.find((x) => x.id === i.id);
        return t
          ? {
              ...i,
              ticket: {
                id: t.id,
                name: t.name,
                date: t.date,
                location: t.location,
                price: t.price,
              },
            }
          : null;
      })
      .filter(Boolean);
  }, [cart, allTickets]);
  const cartCount = cartItems.reduce((n, i) => n + i.qty, 0);
  const total = cartItems.reduce((s, i) => s + i.ticket.price * i.qty, 0);

  const notify = useCallback((message) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2800);
  }, []);

  // ----------------------------------------------------------
  // Cloud sync (Supabase). The app degrades gracefully when the
  // tables haven't been created yet — local storage keeps working.
  // ----------------------------------------------------------
  const attachCloud = useCallback((user) => {
    cloudUserRef.current = user;
    setCloudUid(user?.id ?? null);
  }, []);

  // Load every party in the `parties` table (public read) so anyone can
  // see what the whole scene has posted. Fires on mount and again after
  // sign-in so the list is fresh.
  const fetchSceneParties = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("parties")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) return;
      if (data && data.length) setCommunityParties(data.map(mapPartyRow));
    } catch {
      /* offline — keep what we have */
    }
  }, []);

  useEffect(() => {
    fetchSceneParties();
  }, [fetchSceneParties]);

  // The blog feed = EVERYONE's community posts (public read), so a story
  // posted on one device shows up on every device — not just the
  // author's. Own posts still win locally (freshest copy on id clash).
  const fetchCommunityPosts = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("posts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) return;
      if (data && data.length) setCommunityPosts(data.map(mapPostRow));
    } catch {
      /* offline — keep what we have */
    }
  }, []);

  useEffect(() => {
    fetchCommunityPosts();
  }, [fetchCommunityPosts]);

  // Live blog: new posts, edits and removals (including admin
  // moderation) land everywhere instantly (needs `posts` in the
  // realtime publication, which the schema sets up).
  useEffect(() => {
    const channel = supabase
      .channel("community-posts")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "posts" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const p = mapPostRow(payload.new);
            setCommunityPosts((prev) =>
              prev.some((x) => x.id === p.id) ? prev : [p, ...prev]
            );
          } else if (payload.eventType === "UPDATE") {
            const p = mapPostRow(payload.new);
            setCommunityPosts((prev) =>
              prev.map((x) => (x.id === p.id ? { ...x, ...p } : x))
            );
          } else if (payload.eventType === "DELETE") {
            setCommunityPosts((prev) =>
              prev.filter((x) => x.id !== payload.old.id)
            );
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Pull any promo codes the creator saved to the promo_codes table, so
  // buyers on other devices can use them at checkout too. Merges with
  // local copies (cloud wins on a code collision).
  const fetchGlobalPromos = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("promo_codes").select("*");
      if (error) return;
      if (data && data.length) {
        setGlobalPromos((prev) => {
          const map = new Map(prev.map((g) => [g.code, g]));
          data.forEach((g) => {
            const code = String(g.code || "").trim().toUpperCase();
            if (code)
              map.set(code, {
                code,
                pct: Number(g.pct) || 0,
                createdAt: g.created_at ?? null,
              });
          });
          return [...map.values()];
        });
      }
    } catch {
      /* offline — keep local */
    }
  }, []);

  useEffect(() => {
    fetchGlobalPromos();
  }, [fetchGlobalPromos]);

  // Live scene: a party posted by anyone appears on every user's
  // Parties page instantly (needs `parties` in the realtime publication).
  useEffect(() => {
    const channel = supabase
      .channel("scene-parties")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "parties" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const p = mapPartyRow(payload.new);
            setCommunityParties((prev) =>
              prev.some((x) => x.id === p.id) ? prev : [p, ...prev]
            );
          } else if (payload.eventType === "UPDATE") {
            const p = mapPartyRow(payload.new);
            setCommunityParties((prev) =>
              prev.map((x) => (x.id === p.id ? { ...x, ...p } : x))
            );
          } else if (payload.eventType === "DELETE") {
            setCommunityParties((prev) =>
              prev.filter((x) => x.id !== payload.old.id)
            );
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Live host log: new ticket sales for this user appear without a reload.
  useEffect(() => {
    if (!cloudUid) return undefined;
    const channel = supabase
      .channel(`host-log-${cloudUid}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ticket_purchases" },
        (payload) => {
          if (payload.new && payload.new.host_id === cloudUid) {
            setHostLogs((prev) => [payload.new, ...prev]);
          }
          if (payload.new && payload.new.affiliate_id === cloudUid) {
            setAffiliateLogs((prev) => [payload.new, ...prev]);
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [cloudUid]);

  const importCloud = useCallback(async (userId) => {
    if (!userId) return;
    try {
      const [partiesRes, reviewsRes, ticketsRes, goingRes, postsRes] =
        await Promise.all([
          supabase
            .from("parties")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: false }),
          supabase
            .from("reviews")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: false }),
          supabase
            .from("tickets")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: false }),
          supabase.from("going").select("party_id").eq("user_id", userId),
          supabase
            .from("posts")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: false }),
        ]);
      // If the tables don't exist yet, keep everything local.
      if (
        partiesRes.error &&
        reviewsRes.error &&
        ticketsRes.error &&
        goingRes.error &&
        postsRes.error
      )
        return;

      // PostgREST returns snake_case columns — map back to the app's shape.
      const cloudParties = (partiesRes.data ?? []).map((p) => ({
        ...p,
        isUser: p.is_user ?? true,
        userId: p.user_id ?? null,
        affiliateId: p.affiliate_id ?? null,
        hostId: p.host_id ?? null,
        sourcePartyId: p.source_party_id ?? null,
        originalPrice: p.original_price ?? null,
        status: p.status ?? "live",
        ticketDesign: parseJson(p.ticket_design),
        ticketsSold: p.tickets_sold ?? 0,
        coverUrl: p.cover_url ?? null,
      }));
      const cloudReviews = (reviewsRes.data ?? []).map((r) => ({
        ...r,
        partyName: r.party_name ?? r.partyName,
        userId: r.user_id ?? null,
      }));
      const cloudTickets = ticketsRes.data ?? [];
      // Refresh the whole scene after sign-in so the user's own rows
      // (and everyone else's) are in the community list.
      fetchSceneParties();

      // REPLACE (never merge) each list with THIS account's cloud rows.
      // The queries above are already scoped to userId, and replacing
      // stops one account's local cache from bleeding into another
      // account's session on the same device (the old merge kept stale
      // rows from a previous sign-in in the mix).
      if (!partiesRes.error) setUserParties(cloudParties);
      if (!reviewsRes.error) setUserReviews(cloudReviews);
      const cloudGoing = (goingRes.data ?? []).map((g) => g.party_id);
      if (!goingRes.error) setGoing(cloudGoing);
      if (!ticketsRes.error) {
        // MERGE (never replace): the cloud row is authoritative for the
        // same pass, but a pass that only exists locally — e.g. its
        // cloud insert failed silently, or this device bought it while
        // offline — must NEVER be dropped. A plain replace used to wipe
        // the wall on every reload when the tickets table was missing
        // rows, which is exactly how passes "disappeared" after a scan.
        // Deletes sync too: passes soft-deleted in the cloud (another
        // device) or tombstoned here (deleted while offline) never come
        // back into the merged wall.
        const tombstoned = new Set(deletedTicketCodesRef.current || []);
        const liveCloudTickets = cloudTickets.filter(
          (t) => !t.deleted && !tombstoned.has(t.code)
        );
        setMyTickets((prev) => {
          const merged = new Map(
            prev
              .filter((t) => !tombstoned.has(t.code))
              .map((t) => [t.code, t])
          );
          liveCloudTickets.forEach((t) => {
            merged.set(t.code, {
              code: t.code,
              ticketId: t.ticket_id,
              partyId: t.party_id ?? null,
              hash: t.hash ?? null,
              design: parseJson(t.design),
              name: t.name,
              date: t.date,
              location: t.location,
              price: Number(t.price),
              originalPrice: Number(t.original_price ?? 0),
              commission: t.commission ?? null,
              paymentRef: t.payment_reference ?? null,
              holder: parseHolder(t.holder),
              promoUsed: parseJson(t.promo_used),
              // Set when the host's door check marked this pass as used.
              verifiedAt: t.verified_at ?? null,
            });
          });
          return [...merged.values()];
        });
      }
      const cloudPosts = (postsRes.data ?? []).map(mapPostRow);
      if (!postsRes.error) setUserPosts(cloudPosts);
    } catch {
      /* offline — keep local */
    }
  }, [fetchSceneParties]);

  const addToCart = useCallback(
    (ticket, qty = 1) => {
      // Snapshot the ticket at add time so hosted-party tickets survive
      // checkout and the cart drawer.
      const snapshot = {
        id: ticket.id,
        name: ticket.name,
        date: ticket.date,
        location: ticket.location,
        price: ticket.price,
        originalPrice: ticket.originalPrice || null,
        partyId: ticket.party?.id || (ticket.isParty ? ticket.id : null) || null,
        hostId: ticket.hostId || null,
        affiliateId: ticket.affiliateId || null,
        design: ticket.party?.ticketDesign || ticket.ticketDesign || null,
      };
      setCart((prev) => {
        const found = prev.find((i) => i.id === ticket.id);
        if (found) {
          return prev.map((i) =>
            i.id === ticket.id ? { ...i, qty: i.qty + qty } : i
          );
        }
        return [...prev, { ...snapshot, qty }];
      });
      notify(`${ticket.name} added to cart`);
    },
    [notify]
  );

  const updateQty = useCallback((id, qty) => {
    setCart((prev) =>
      qty <= 0
        ? prev.filter((i) => i.id !== id)
        : prev.map((i) => (i.id === id ? { ...i, qty } : i))
    );
  }, []);

  // Wishlist: save a party so it shows up in your For You feed + profile.
  const toggleSave = useCallback(
    (partyId) => {
      const on = !saved.includes(partyId);
      setSaved(on ? [...saved, partyId] : saved.filter((x) => x !== partyId));
      notify(on ? "Saved to your list" : "Removed from your list");
      return on;
    },
    [saved, notify]
  );
  const isSaved = useCallback((partyId) => saved.includes(partyId), [saved]);

  // ---- Admin: platform-wide promo codes ---------------------------
  // A global code discounts every ticket in any checkout. Saved
  // locally instantly (works offline) and upserted to the promo_codes
  // table so buyers on other devices see it too.
  const addGlobalPromo = useCallback(
    (code, pct) => {
      const c = String(code || "").trim().toUpperCase();
      const p = Math.max(1, Math.min(100, Math.round(Number(pct) || 0)));
      if (!c || !p) return false;
      if (globalPromos.some((g) => g.code === c)) {
        notify(`Promo ${c} already exists`);
        return false;
      }
      const row = { code: c, pct: p, createdAt: new Date().toISOString() };
      setGlobalPromos((prev) => [...prev, row]);
      supabase
        .from("promo_codes")
        .upsert({ code: c, pct: p })
        .then(({ error }) => {
          if (error) console.warn("promo sync:", error.message);
        });
      notify(`Promo ${c} is live — ${p}% off everywhere`);
      return true;
    },
    [globalPromos, notify]
  );

  const removeGlobalPromo = useCallback(
    (code) => {
      setGlobalPromos((prev) => prev.filter((g) => g.code !== code));
      supabase
        .from("promo_codes")
        .delete()
        .eq("code", code)
        .then(({ error }) => {
          if (error) console.warn("promo delete:", error.message);
        });
      notify("Promo code removed");
    },
    [notify]
  );

  // ----------------------------------------------------------
  // Affiliate hosts — apply, list, approve (creator's Admin panel)
  // ----------------------------------------------------------
  // Apply to become an affiliate. Signing up is FREE right now — the
  // application just lands as 'pending' for the admin to review (the
  // RLS insert policy requires status = 'pending', so nobody can
  // insert themselves straight into 'approved').
  const applyAffiliate = useCallback(async () => {
    const uid = cloudUserRef.current?.id;
    if (!uid) return false;
    const { error } = await supabase.from("affiliates").upsert({
      user_id: uid,
      status: "pending",
    });
    if (error) {
      console.warn("affiliate apply:", error.message);
      notify("Couldn't apply right now — try again in a moment.");
      return false;
    }
    notify("Application sent — the admin will review it soon.");
    return true;
  }, [notify]);

  const fetchAffiliates = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("affiliates")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) return;
      if (data && data.length) setAffiliates(data);
    } catch {
      /* offline — keep what we have */
    }
  }, []);

  useEffect(() => {
    fetchAffiliates();
  }, [fetchAffiliates]);

  const approveAffiliate = useCallback(
    async (userId, status) => {
      const { error } = await supabase
        .from("affiliates")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
      if (error) {
        console.warn("affiliate update:", error.message);
        notify("Couldn't update that application.");
        return false;
      }
      setAffiliates((prev) =>
        prev.map((a) => (a.user_id === userId ? { ...a, status } : a))
      );
      notify(
        status === "approved" ? "Affiliate approved 🎉" : "Application rejected"
      );
      return true;
    },
    [notify]
  );

  // ----------------------------------------------------------
  // Groups & communities
  // ----------------------------------------------------------
  const [groups, setGroups] = useState([]);
  const [groupMembers, setGroupMembers] = useState({}); // groupId -> rows
  const [groupPosts, setGroupPosts] = useState({}); // groupId -> rows
  const [groupsLoading, setGroupsLoading] = useState(false);

  const loadGroups = useCallback(async () => {
    setGroupsLoading(true);
    try {
      const { data, error } = await supabase
        .from("groups")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) return;
      const rows = data || [];
      // My membership edges so Join/Leave buttons know the state.
      const me = cloudUserRef.current?.id;
      const { data: mem } = me
        ? await supabase
            .from("group_members")
            .select("group_id, role")
            .eq("user_id", me)
        : { data: [] };
      const mine = new Map((mem || []).map((m) => [m.group_id, m.role]));
      setGroups(rows.map((g) => ({ ...g, myRole: mine.get(g.id) || null })));
    } catch {
      /* offline */
    } finally {
      setGroupsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups, cloudUid]);

  // Realtime: group list + posts refresh live (needs the tables in the
  // realtime publication, which the schema sets up). Also reloads when
  // I'M added as a member (an invite) so the Join button flips to Joined.
  useEffect(() => {
    const channel = supabase
      .channel("community-groups")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "groups" },
        () => loadGroups()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "group_members" },
        (payload) => {
          if (payload.new && payload.new.user_id === cloudUserRef.current?.id) {
            loadGroups();
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "group_posts" },
        (payload) => {
          if (!payload.new || !payload.new.group_id) return;
          setGroupPosts((prev) => {
            const list = prev[payload.new.group_id] || [];
            if (list.some((p) => p.id === payload.new.id)) return prev;
            return { ...prev, [payload.new.group_id]: [payload.new, ...list] };
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadGroups]);

  const createGroup = useCallback(
    async ({ name, description, cover }) => {
      const me = cloudUserRef.current?.id;
      if (!me) return null;
      const { data, error } = await supabase
        .from("groups")
        .insert({ name, description, owner_id: me, cover: cover || null })
        .select("*")
        .single();
      if (error) {
        console.warn("group create:", error.message);
        notify("Couldn't create the group right now.");
        return null;
      }
      const { error: memErr } = await supabase
        .from("group_members")
        .insert({ group_id: data.id, user_id: me, role: "owner" });
      if (memErr) console.warn("group owner join:", memErr.message);
      setGroups((prev) => [{ ...data, myRole: "owner" }, ...prev]);
      notify("Group created — invite your people!");
      return data;
    },
    [notify]
  );

  const joinGroup = useCallback(
    async (groupId) => {
      const me = cloudUserRef.current?.id;
      if (!me) return false;
      const { error } = await supabase
        .from("group_members")
        .insert({ group_id: groupId, user_id: me, role: "member" });
      if (error) {
        console.warn("group join:", error.message);
        notify("Couldn't join right now.");
        return false;
      }
      setGroups((prev) =>
        prev.map((g) =>
          g.id === groupId
            ? {
                ...g,
                myRole: "member",
                member_count: (g.member_count || 0) + 1,
              }
            : g
        )
      );
      setGroupMembers((prev) => ({ ...prev, [groupId]: undefined }));
      notify("You're in the group!");
      return true;
    },
    [notify]
  );

  const leaveGroup = useCallback(
    async (groupId) => {
      const me = cloudUserRef.current?.id;
      if (!me) return false;
      const { error } = await supabase
        .from("group_members")
        .delete()
        .eq("group_id", groupId)
        .eq("user_id", me);
      if (error) {
        console.warn("group leave:", error.message);
        return false;
      }
      setGroups((prev) =>
        prev.map((g) =>
          g.id === groupId
            ? {
                ...g,
                myRole: null,
                member_count: Math.max(1, (g.member_count || 0) - 1),
              }
            : g
        )
      );
      setGroupMembers((prev) => ({ ...prev, [groupId]: undefined }));
      setGroupPosts((prev) => ({ ...prev, [groupId]: undefined }));
      notify("You left the group.");
      return true;
    },
    [notify]
  );

  const loadGroupDetail = useCallback(async (groupId) => {
    const [memRes, postRes] = await Promise.all([
      supabase.from("group_members").select("*").eq("group_id", groupId),
      supabase
        .from("group_posts")
        .select("*")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false })
        .limit(80),
    ]);
    if (!memRes.error)
      setGroupMembers((prev) => ({ ...prev, [groupId]: memRes.data || [] }));
    if (!postRes.error)
      setGroupPosts((prev) => ({ ...prev, [groupId]: postRes.data || [] }));
  }, []);

  const postToGroup = useCallback(
    async (groupId, body) => {
      const me = cloudUserRef.current?.id;
      if (!me || !body.trim()) return false;
      const { data, error } = await supabase
        .from("group_posts")
        .insert({ group_id: groupId, user_id: me, body: body.trim() })
        .select("*")
        .single();
      if (error) {
        console.warn("group post:", error.message);
        notify("Couldn't post — are you a member of this group?");
        return false;
      }
      setGroupPosts((prev) => ({
        ...prev,
        [groupId]: [data, ...(prev[groupId] || [])],
      }));
      return true;
    },
    [notify]
  );

  const deleteGroupPost = useCallback(async (groupId, postId) => {
    // A video post also created a hype row (it may be on the public feed
    // if the group's videos_to_hype setting is on) — remove that too so
    // nothing orphaned stays live, and clean up the storage file.
    const { data: post } = await supabase
      .from("group_posts")
      .select("hype_id")
      .eq("id", postId)
      .maybeSingle();
    const { error } = await supabase
      .from("group_posts")
      .delete()
      .eq("id", postId);
    if (error) return false;
    if (post?.hype_id) {
      const { data: hype } = await supabase
        .from("hypes")
        .select("video_url")
        .eq("id", post.hype_id)
        .maybeSingle();
      await supabase
        .from("hypes")
        .delete()
        .eq("id", post.hype_id)
        .catch((e) => console.warn("group hype delete:", e?.message));
      if (hype?.video_url) {
        const marker = "/object/public/hype/";
        const idx = hype.video_url.indexOf(marker);
        if (idx !== -1) {
          const path = hype.video_url.slice(idx + marker.length).split("?")[0];
          await supabase.storage.from("hype").remove([path]).catch(() => {});
        }
      }
    }
    setGroupPosts((prev) => ({
      ...prev,
      [groupId]: (prev[groupId] || []).filter((p) => p.id !== postId),
    }));
    return true;
  }, []);

  // Owner settings (e.g. videos_to_hype). Owner-only RLS in the schema.
  const updateGroup = useCallback(
    async (groupId, patch) => {
      const { error } = await supabase
        .from("groups")
        .update(patch)
        .eq("id", groupId);
      if (error) {
        console.warn("group update:", error.message);
        notify("Couldn't save that setting.");
        return false;
      }
      setGroups((prev) =>
        prev.map((g) => (g.id === groupId ? { ...g, ...patch } : g))
      );
      return true;
    },
    [notify]
  );

  // Invite people into a group — any member can add their friends.
  // Inserts membership rows directly (invited users are in). Existing
  // members are filtered out first so the upsert never tries to update
  // someone else's row (which RLS would reject) and the count only
  // reflects genuinely-new invitees.
  const inviteToGroup = useCallback(
    async (groupId, userIds) => {
      const already = new Set((groupMembers[groupId] || []).map((m) => m.user_id));
      const ids = [...new Set((userIds || []).filter(Boolean))].filter(
        (id) => !already.has(id)
      );
      if (!ids.length) {
        notify("Everyone picked is already in the group.");
        return 0;
      }
      const rows = ids.map((user_id) => ({ group_id: groupId, user_id, role: "member" }));
      const { data, error } = await supabase
        .from("group_members")
        .insert(rows)
        .select("*");
      if (error) {
        console.warn("group invite:", error.message);
        notify("Couldn't invite right now.");
        return 0;
      }
      const added = data || [];
      setGroupMembers((prev) => {
        const list = prev[groupId] || [];
        const have = new Set(list.map((m) => m.user_id));
        return { ...prev, [groupId]: [...added.filter((m) => !have.has(m.user_id)), ...list] };
      });
      setGroups((prev) =>
        prev.map((g) =>
          g.id === groupId
            ? { ...g, member_count: (g.member_count || 0) + added.length }
            : g
        )
      );
      notify(added.length === 1 ? "1 person invited" : `${added.length} people invited`);
      return added.length;
    },
    [groupMembers, notify]
  );

  // Upload a group cover photo to the groups bucket (creates the bucket
  // if the schema hasn't run yet, mirroring the hype bucket fallback).
  const uploadGroupCover = useCallback(async (file) => {
    const me = cloudUserRef.current?.id;
    if (!me) throw new Error("Sign in to upload a cover");
    const ext = (file.name || "cover").split(".").pop().replace(/[^a-zA-Z0-9]/g, "") || "jpg";
    const path = `groups/${me}/${Date.now()}-cover.${ext}`;
    const bucket = supabase.storage.from("groups");
    const upload = () => bucket.upload(path, file, { upsert: true, cacheControl: "3600" });
    let { error } = await upload();
    if (error) {
      const { error: createErr } = await supabase.storage.createBucket("groups", {
        public: true,
      });
      if (!createErr || /exist/i.test(createErr.message || "")) {
        ({ error } = await upload());
      }
      if (error) throw new Error("Couldn't upload the cover — is the groups bucket set up?");
    }
    const { data } = supabase.storage.from("groups").getPublicUrl(path);
    return data.publicUrl;
  }, []);

  // Upload a party cover photo to the party-covers bucket (creates the
  // bucket if the schema hasn't run yet, mirroring the groups fallback).
  // Returns the public URL to store on the party row.
  const uploadPartyCover = useCallback(async (file) => {
    const me = cloudUserRef.current?.id;
    if (!me) throw new Error("Sign in to upload a cover");
    const ext =
      (file.name || "cover").split(".").pop().replace(/[^a-zA-Z0-9]/g, "") || "jpg";
    const path = `parties/${me}/${Date.now()}-cover.${ext}`;
    const bucket = supabase.storage.from("party-covers");
    const upload = () =>
      bucket.upload(path, file, { upsert: true, cacheControl: "3600" });
    let { error } = await upload();
    if (error) {
      const { error: createErr } = await supabase.storage.createBucket(
        "party-covers",
        { public: true }
      );
      if (!createErr || /exist/i.test(createErr.message || "")) {
        ({ error } = await upload());
      }
      if (error)
        throw new Error(
          "Couldn't upload the cover — is the party-covers bucket set up?"
        );
    }
    const { data } = supabase.storage.from("party-covers").getPublicUrl(path);
    return data.publicUrl;
  }, []);

  // Post a VIDEO to a group. The clip also becomes a hype row: it shows
  // on the public Hype feed when the group's videos_to_hype setting is on
  // (default), otherwise it stays a group-only clip. Returns the post row.
  const postGroupVideo = useCallback(
    async (groupId, { blob, name, caption }) => {
      const me = cloudUserRef.current?.id;
      if (!me) throw new Error("Sign in to post");
      const g = groups.find((x) => x.id === groupId);
      if (!g) throw new Error("Group not found");
      const toHype = g.videos_to_hype !== false;
      // Upload to the hype bucket (same fallback as SocialContext).
      const path = `hype/${me}/${Date.now()}-${(name || "clip.webm").replace(/[^a-zA-Z0-9.-]/g, "_")}`;
      const bucket = supabase.storage.from("hype");
      const upload = () =>
        bucket.upload(path, blob, { contentType: blob.type || "video/webm" });
      let { error: upErr } = await upload();
      if (upErr) {
        const { error: createErr } = await supabase.storage.createBucket("hype", {
          public: true,
        });
        if (!createErr || /exist/i.test(createErr.message || "")) {
          ({ error: upErr } = await upload());
        }
        if (upErr) throw new Error("Couldn't upload the video.");
      }
      const { data: pub } = supabase.storage.from("hype").getPublicUrl(path);
      const videoUrl = pub.publicUrl;
      const text = (caption || "").trim();
      const hashtags = (text.match(/#[\w]+/g) || []).slice(0, 8);
      // The hype row: public feed when the group setting allows it.
      const { data: hype, error: hypeErr } = await supabase
        .from("hypes")
        .insert({
          user_id: me,
          recipient_id: null,
          video_url: videoUrl,
          caption: text,
          hashtags,
          published: toHype,
        })
        .select("id")
        .single();
      if (hypeErr) throw new Error(hypeErr.message);
      const { data: post, error: postErr } = await supabase
        .from("group_posts")
        .insert({
          group_id: groupId,
          user_id: me,
          body: text || "Sent a video",
          kind: "video",
          video_url: videoUrl,
          hype_id: hype.id,
        })
        .select("*")
        .single();
      if (postErr) throw new Error(postErr.message);
      setGroupPosts((prev) => ({
        ...prev,
        [groupId]: [post, ...(prev[groupId] || [])],
      }));
      notify(toHype ? "Video posted to the group + Hype feed" : "Video posted to the group");
      return post;
    },
    [groups, notify]
  );

  const deleteGroup = useCallback(
    async (groupId) => {
      const { error } = await supabase.from("groups").delete().eq("id", groupId);
      if (error) {
        console.warn("group delete:", error.message);
        return false;
      }
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
      const clear = (map) => {
        const n = { ...map };
        delete n[groupId];
        return n;
      };
      setGroupMembers(clear);
      setGroupPosts(clear);
      notify("Group deleted.");
      return true;
    },
    [notify]
  );

  // ----------------------------------------------------------
  // Live streams (sessions catalog; WebRTC happens in the Live page)
  // ----------------------------------------------------------
  const [liveSessions, setLiveSessions] = useState([]);

  const loadLiveSessions = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("live_sessions")
        .select("*")
        .eq("status", "live")
        .order("started_at", { ascending: false });
      if (error) return;
      setLiveSessions(data || []);
    } catch {
      /* offline */
    }
  }, []);

  useEffect(() => {
    loadLiveSessions();
  }, [loadLiveSessions]);

  // Realtime: streams appear / disappear as hosts go live and end.
  useEffect(() => {
    const channel = supabase
      .channel("live-sessions")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_sessions" },
        () => loadLiveSessions()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadLiveSessions]);

  const startLive = useCallback(
    async (title) => {
      const me = cloudUserRef.current?.id;
      if (!me) return null;
      const { data, error } = await supabase
        .from("live_sessions")
        .insert({ host_id: me, title: (title || "Live").slice(0, 80) })
        .select("*")
        .single();
      if (error) {
        console.warn("start live:", error.message);
        notify("Couldn't go live — is the schema applied?");
        return null;
      }
      setLiveSessions((prev) => [data, ...prev]);
      return data;
    },
    [notify]
  );

  const endLive = useCallback(
    async (sessionId) => {
      const { error } = await supabase
        .from("live_sessions")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("id", sessionId);
      if (error) console.warn("end live:", error.message);
      supabase
        .from("live_signals")
        .delete()
        .eq("session_id", sessionId)
        .then(({ error: e }) => {
          if (e) console.warn("signal cleanup:", e.message);
        });
      setLiveSessions((prev) => prev.filter((s) => s.id !== sessionId));
      notify("Stream ended.");
    },
    [notify]
  );

  const removeFromCart = useCallback((id) => {
    setCart((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  // Sync purchased passes to the `tickets` table. Retries once after a
  // beat when the first attempt fails (DB error OR network rejection) —
  // a pass must never silently fail to land on other devices (the wall
  // keeps the local copy regardless). Upserts on the code primary key so
  // the retry is idempotent even if the first attempt actually committed
  // but its response was lost.
  const syncTicketRows = useCallback((rows) => {
    if (!rows || !rows.length) return;
    const attempt = () => supabase.from("tickets").upsert(rows);
    const run = (label) =>
      attempt()
        .then(({ error }) => {
          if (error) throw error;
        })
        .catch((err) => {
          if (label === "first") {
            console.warn("ticket sync:", err?.message || err);
            setTimeout(() => run("retry"), 2500);
          } else {
            console.warn("ticket sync retry:", err?.message || err);
          }
        });
    run("first");
  }, []);

  // Buy ONE ticket for an event directly from the listing — no cart, no
  // checkout page. Mirrors checkout()'s split exactly: platform 30% of
  // the sale, host 70% of base, affiliate 70% of margin — so a quick
  // purchase logs the same money trail as a cart order. Returns the
  // issued ticket record (or null).
  const buyNow = useCallback(
    (ticket, holder, paymentRef = null) => {
      if (!ticket) return null;
      const unit = Math.max(0, Number(ticket.price) || 0);
      const base = Math.max(0, Number(ticket.originalPrice) || 0);
      const margin = Math.max(0, unit - base);
      const commission = Math.round(unit * COMMISSION_RATE);
      const affiliateShare =
        ticket.affiliateId && base > 0
          ? Math.round(margin * AFFILIATE_MARGIN_RATE)
          : 0;
      const record = {
        code: genCode(),
        hash: genHash(),
        ticketId: ticket.id,
        // Cards shape the ticket, but PartyDetail can pass a raw party
        // (title, host on userId) — fall back so the pass never prints
        // "undefined" and the host always gets their sales log row.
        name: ticket.name || ticket.title,
        date: ticket.date,
        location: ticket.location,
        price: unit,
        originalPrice: base,
        commission,
        affiliateShare,
        paymentRef,
        holder,
        partyId: ticket.partyId || (ticket.isParty ? ticket.id : null) || null,
        hostId: ticket.hostId || ticket.userId || null,
        affiliateId: ticket.affiliateId || null,
        design: ticket.design || ticket.ticketDesign || null,
        promoUsed: null,
      };
      setMyTickets((prev) => [record, ...prev]);

      const uid = cloudUserRef.current?.id;
      if (uid) {
        syncTicketRows([
          {
            code: record.code,
            user_id: uid,
            ticket_id: record.ticketId,
            party_id: record.partyId,
            hash: record.hash,
            name: record.name,
            date: record.date,
            location: record.location,
            price: record.price,
            original_price: record.originalPrice ?? null,
            commission: record.commission ?? null,
            affiliate_share: record.affiliateShare ?? null,
            payment_reference: record.paymentRef ?? null,
            holder: JSON.stringify(record.holder),
            // design/promo_used are jsonb columns — send the object
            // directly (never JSON.stringify it, or it gets double-
            // encoded as a string and other devices lose the design).
            design: record.design ?? null,
            promo_used: null,
          },
        ]);

        // Sale log: one row for the ORIGINAL host (70% of base) and the
        // reposting affiliate (70% of margin) — same as a cart checkout.
        if (record.partyId && record.hostId) {
          supabase
            .from("ticket_purchases")
            .insert({
              party_id: record.partyId,
              host_id: record.hostId,
              affiliate_id: record.affiliateId ?? null,
              buyer_id: uid,
              buyer_name: record.holder.name,
              buyer_email: record.holder.email,
              buyer_phone: record.holder.phone,
              code: record.code,
              hash: record.hash,
              price: record.price,
              original_price: record.originalPrice ?? null,
              commission: record.commission ?? null,
              affiliate_share: record.affiliateShare ?? null,
              payment_reference: record.paymentRef ?? null,
            })
            .then(({ error }) => {
              if (error) console.warn("host log sync:", error.message);
            });
        }
      }

      return record;
    },
    [syncTicketRows]
  );

  const checkout = useCallback(
    (holder, promoCode, paymentRef = null) => {
      const code = (promoCode || "").trim().toUpperCase();
      // A platform-wide code the creator runs — applies to every ticket.
      const gPromo = globalPromos.find((g) => g.code === code);
      const purchased = cartItems.flatMap((item) => {
        const t = item.ticket;
        if (!t) return [];
        // Discount = the host's own promo when it matches this ticket's
        // design, otherwise a global code (applies to everything).
        const promo = item.design && item.design.promo ? item.design.promo : null;
        const designPct =
          promo && code && String(promo.code).trim().toUpperCase() === code
            ? Math.max(0, Math.min(100, Number(promo.pct) || 0))
            : 0;
        const pct = Math.max(
          designPct,
          gPromo ? Math.max(0, Math.min(100, Number(gPromo.pct) || 0)) : 0
        );
        const unit = pct > 0 ? Math.round(t.price * (1 - pct / 100)) : t.price;
        // The split is anchored on the host's base price (the party's
        // original_price on a repost). Platform = 30% of the sale, host
        // keeps 70% of their base, affiliate keeps 70% of the margin.
        const base = Math.max(0, Number(item.originalPrice) || 0);
        const margin = Math.max(0, unit - base);
        const commission = Math.round(unit * COMMISSION_RATE);
        const affiliateShare =
          item.affiliateId && base > 0
            ? Math.round(margin * AFFILIATE_MARGIN_RATE)
            : 0;
        return Array.from({ length: item.qty }, () => ({
          code: genCode(),
          hash: genHash(),
          ticketId: t.id,
          name: t.name,
          date: t.date,
          location: t.location,
          price: unit,
          originalPrice: base,
          commission,
          affiliateShare,
          paymentRef,
          holder,
          partyId: item.partyId || null,
          hostId: item.hostId || null,
          affiliateId: item.affiliateId || null,
          design: item.design || null,
          promoUsed: pct > 0 ? { code, pct } : null,
        }));
      });
      setMyTickets((prev) => [...purchased, ...prev]);
      setCart([]);

      const uid = cloudUserRef.current?.id;
      if (uid && purchased.length) {
        syncTicketRows(
          purchased.map((t) => ({
            code: t.code,
            user_id: uid,
            ticket_id: t.ticketId,
            party_id: t.partyId,
            hash: t.hash,
            name: t.name,
            date: t.date,
            location: t.location,
            price: t.price,
            original_price: t.originalPrice ?? null,
            commission: t.commission ?? null,
            affiliate_share: t.affiliateShare ?? null,
            payment_reference: t.paymentRef ?? null,
            holder: JSON.stringify(t.holder),
            // jsonb columns — send objects, never pre-stringified
            // values, so the design survives across devices.
            design: t.design ?? null,
            promo_used: t.promoUsed ?? null,
          }))
        );

        // Sale log: every pass sold on a repost lands once for the
        // ORIGINAL host (host_id — they keep 70% of the base) and once
        // for the reposting affiliate (affiliate_id — 70% of margin).
        const logRows = purchased
          .filter((t) => t.partyId && t.hostId)
          .map((t) => ({
            party_id: t.partyId,
            host_id: t.hostId,
            affiliate_id: t.affiliateId ?? null,
            buyer_id: uid,
            buyer_name: t.holder.name,
            buyer_email: t.holder.email,
            buyer_phone: t.holder.phone,
            code: t.code,
            hash: t.hash,
            price: t.price,
            original_price: t.originalPrice ?? null,
            commission: t.commission ?? null,
            affiliate_share: t.affiliateShare ?? null,
            payment_reference: t.paymentRef ?? null,
          }));
        if (logRows.length) {
          supabase
            .from("ticket_purchases")
            .insert(logRows)
            .then(({ error }) => {
              if (error) console.warn("host log sync:", error.message);
            });
        }
      }

      notify("Payment received — your tickets are ready");
      return purchased;
    },
    [cartItems, notify, globalPromos, syncTicketRows]
  );

  // Anyone signed in can post a party — they become the HOST and set
  // their base price. The party lands in the pool on the Affiliate page
  // (status 'live' but no affiliate_id, so it never appears on the
  // Events page) until an approved affiliate reposts it with their own
  // price. On every repost sale the host keeps 70% of this base price.
  const postParty = useCallback((party) => {
    const record = {
      ...party,
      id: `u${Date.now()}`,
      isUser: true,
      rsvps: 0,
      status: "live",
      affiliateId: null,
      hostId: null,
      sourcePartyId: null,
      originalPrice: Number(party.price) || 0,
      userId: cloudUserRef.current?.id ?? null,
      // Coordinates from the map picker — stay null for manual typing.
      locationLat:
        party.lat != null ? Number(party.lat) : party.locationLat ?? null,
      locationLng:
        party.lng != null ? Number(party.lng) : party.locationLng ?? null,
      coverUrl: party.coverUrl ?? null,
    };
    setUserParties((prev) => [record, ...prev]);
    setCommunityParties((prev) => [record, ...prev]);

    const uid = cloudUserRef.current?.id;
    if (uid) {
      // Send snake_case column names — `is_user` and `rsvps` default.
      // location_lat/lng only travel when picked on the map, so a DB
      // that hasn't had the new columns run never fails the upsert.
      supabase
        .from("parties")
        .upsert({
          id: record.id,
          user_id: uid,
          title: record.title,
          host: record.host,
          date: record.date,
          location: record.location,
          price: record.price,
          original_price: record.originalPrice,
          capacity: record.capacity,
          description: record.description,
          category: record.category,
          status: "live",
          affiliate_id: null,
          host_id: null,
          source_party_id: null,
          payout_phone: record.payoutPhone || null,
          payout_network: record.payoutNetwork || null,
          ...(record.locationLat != null
            ? { location_lat: record.locationLat }
            : {}),
          ...(record.locationLng != null
            ? { location_lng: record.locationLng }
            : {}),
          // Only travel with the cover URL when one is set, so a DB that
          // hasn't had the new column run never fails the upsert.
          ...(record.coverUrl ? { cover_url: record.coverUrl } : {}),
        })
        .then(({ error }) => {
          if (error) console.warn("parties sync:", error.message);
        });
    }

    notify("Event posted — it's in the pool for affiliates to repost");
  }, [notify]);

  // An approved affiliate REPOSTS a host's party: a brand-new listing — a
  // copy of the original with the affiliate's own price + ticket design.
  // original_price stays pinned to the host's base price so every sale
  // splits as: platform 30% of sale · host 70% of base · affiliate 70%
  // of the margin (host_id pinned by the lifecycle trigger). Returns
  // the new repost row or null.
  const repostParty = useCallback(
    (partyId, { price, capacity, payoutPhone = "", payoutNetwork = "MTN", ticketDesign, coverUrl }) => {
      const uid = cloudUserRef.current?.id;
      if (!uid) return null;
      const original = communityParties.find((p) => p.id === partyId);
      if (!original) return null;
      const salePrice = Math.max(0, Number(price) || 0);
      const design =
        ticketDesign && Object.keys(ticketDesign).length
          ? { ...ticketDesign, enabled: true, price: String(salePrice) }
          : null;
      const base = Math.max(0, Number(original.price) || Number(original.originalPrice) || 0);
      const record = {
        id: `u${Date.now()}`,
        title: original.title,
        host: original.host || "Host",
        date: original.date,
        location: original.location,
        price: Math.max(0, Number(price) || 0),
        originalPrice: base,
        capacity: capacity ?? original.capacity ?? null,
        description: original.description,
        category: original.category,
        // A fresh repost starts at zero — RSVPs are per-listing.
        rsvps: 0,
        isUser: true,
        status: "live",
        userId: uid,
        affiliateId: uid,
        hostId: original.userId ?? null,
        sourcePartyId: original.id,
        ticketDesign: design,
        ticketsSold: 0,
        // Where the AFFILIATE's share of every sale is sent.
        payoutPhone: String(payoutPhone || "").trim() || null,
        payoutNetwork: payoutNetwork || "MTN",
        // A repost keeps the original's map pin too.
        locationLat: original.locationLat ?? null,
        locationLng: original.locationLng ?? null,
        // Cover: whatever the affiliate set, else the original's photo
        // (null = the illustrated fallback).
        coverUrl: String(coverUrl || "").trim() || original.coverUrl || null,
      };
      setUserParties((prev) => [record, ...prev]);
      setCommunityParties((prev) => [record, ...prev]);
      supabase
        .from("parties")
        .upsert({
          id: record.id,
          user_id: uid,
          title: record.title,
          host: record.host,
          date: record.date,
          location: record.location,
          price: record.price,
          original_price: base,
          capacity: record.capacity,
          description: record.description,
          category: record.category,
          status: "live",
          affiliate_id: uid,
          host_id: record.hostId,
          source_party_id: record.sourcePartyId,
          payout_phone: record.payoutPhone || null,
          payout_network: record.payoutNetwork || null,
          ...(record.locationLat != null
            ? { location_lat: record.locationLat }
            : {}),
          ...(record.locationLng != null
            ? { location_lng: record.locationLng }
            : {}),
          // Only travel with the cover URL when one is set, so a DB that
          // hasn't had the new column run never fails the upsert.
          ...(record.coverUrl ? { cover_url: record.coverUrl } : {}),
          // jsonb column — send the design object directly so the
          // design survives on every device.
          ticket_design: design,
        })
        .then(({ error }) => {
          if (error) console.warn("repost sync:", error.message);
        });
      notify("Posted with your price — it's live on the scene!");
      return record;
    },
    [communityParties, notify]
  );

  // Update just the ticket design on an existing party (Host dashboard).
  const saveTicketDesign = useCallback(
    (partyId, design) => {
      const next = { ...design, enabled: true };
      setUserParties((prev) =>
        prev.map((p) => (p.id === partyId ? { ...p, ticketDesign: next } : p))
      );
      setCommunityParties((prev) =>
        prev.map((p) => (p.id === partyId ? { ...p, ticketDesign: next } : p))
      );
      // The owner or the claiming affiliate can update (RLS enforces it).
      supabase
        .from("parties")
        .update({ ticket_design: next })
        .eq("id", partyId)
        .then(({ error }) => {
          if (error) console.warn("design sync:", error.message);
        });
      notify("Ticket design saved — it's on sale now");
    },
    [notify]
  );

  // Host dashboard: change how many tickets remain for a party. Keeps the
  // design's stock field in sync locally and in the parties table so the
  // "X left" counter on the ticket card updates everywhere.
  const updateTicketStock = useCallback(
    (party, stock) => {
      const next = Math.max(0, Math.floor(Number(stock) || 0));
      const nextDesign =
        party.ticketDesign && party.ticketDesign.enabled
          ? { ...party.ticketDesign, stock: next }
          : null;
      const patch = (p) => {
        if (p.id !== party.id) return p;
        return nextDesign ? { ...p, ticketDesign: nextDesign } : p;
      };
      setUserParties((prev) => prev.map(patch));
      setCommunityParties((prev) => prev.map(patch));
      if (nextDesign) {
        supabase
          .from("parties")
          .update({ ticket_design: nextDesign })
          .eq("id", party.id)
          .then(({ error }) => {
            if (error) console.warn("stock sync:", error.message);
          });
      }
    },
    []
  );

  // Load every sale logged against this host's parties (70% of base).
  const fetchHostLogs = useCallback(async (userId) => {
    if (!userId) return;
    try {
      const { data, error } = await supabase
        .from("ticket_purchases")
        .select("*")
        .eq("host_id", userId)
        .order("created_at", { ascending: false });
      if (error) return;
      if (data && data.length) setHostLogs(data);
    } catch {
      /* offline — keep what we have */
    }
  }, []);

  // Load every sale this affiliate drove through their reposts (70% of margin).
  const fetchAffiliateLogs = useCallback(async (userId) => {
    if (!userId) return;
    try {
      const { data, error } = await supabase
        .from("ticket_purchases")
        .select("*")
        .eq("affiliate_id", userId)
        .order("created_at", { ascending: false });
      if (error) return;
      if (data && data.length) setAffiliateLogs(data);
    } catch {
      /* offline — keep what we have */
    }
  }, []);

  // A successful door check claims the pass as used — atomic in the DB
  // (only the first scanner flips verified_at), ownership-checked (the
  // caller must host the party or be the reposting affiliate). Returns
  // { claimed, verified_at } or null when the claim couldn't run. The
  // verified_at is stamped onto the local sales log instantly so a
  // rescan in this session already shows "used".
  const claimTicketScan = useCallback(async (hash) => {
    try {
      const { data, error } = await supabase.rpc("claim_ticket_scan", {
        p_hash: String(hash || "").trim(),
      });
      if (error) {
        console.warn("claim scan:", error.message);
        return null;
      }
      const res = data && data[0] ? data[0] : null;
      if (res && (res.claimed || res.verified_at)) {
        const stamp = new Date(res.verified_at || Date.now()).toISOString();
        const mark = (l) =>
          l && normalizeHash(l.hash) === normalizeHash(hash)
            ? { ...l, verified_at: stamp }
            : l;
        setHostLogs((prev) => prev.map(mark));
        setAffiliateLogs((prev) => prev.map(mark));
      }
      return res;
    } catch {
      return null;
    }
  }, []);

  // Display count = the database counter + this session's own toggles.
  const displayRsvps = useCallback(
    (party) => (party?.rsvps ?? 0) + (rsvpPatches[party?.id] ?? 0),
    [rsvpPatches]
  );

  const toggleGoing = useCallback(
    (id) => {
      const has = goingRef.current.includes(id);
      setGoing((prev) =>
        has ? prev.filter((g) => g !== id) : [...prev, id]
      );
      setRsvpPatches((prev) => ({
        ...prev,
        [id]: Math.max(0, (prev[id] ?? 0) + (has ? -1 : 1)),
      }));
      const uid = cloudUserRef.current?.id;
      if (uid) {
        if (has) {
          supabase
            .from("going")
            .delete()
            .eq("user_id", uid)
            .eq("party_id", id)
            .then(({ error }) => {
              if (error) console.warn("going sync:", error.message);
            });
        } else {
          supabase
            .from("going")
            .upsert({ user_id: uid, party_id: id })
            .then(({ error }) => {
              if (error) console.warn("going sync:", error.message);
            });
        }
      }
      notify(has ? "RSVP removed" : "You're going! See you there");
    },
    [notify]
  );

  const addReview = useCallback(
    (review) => {
      const record = {
        ...review,
        id: `r${Date.now()}`,
        verified: false,
        userId: cloudUserRef.current?.id ?? null,
      };
      setUserReviews((prev) => [record, ...prev]);

      const uid = cloudUserRef.current?.id;
      if (uid) {
        // `party_name` is the column — map from the app's partyName.
        supabase
          .from("reviews")
          .upsert({
            id: record.id,
            user_id: uid,
            party_name: record.partyName,
            rating: record.rating,
            title: record.title,
            comment: record.comment,
            author: record.author,
            date: record.date,
            verified: false,
          })
          .then(({ error }) => {
            if (error) console.warn("reviews sync:", error.message);
          });
      }

      notify("Thanks for the review!");
    },
    [notify]
  );

  // ---- Delete own content (local + cloud) ----------------------
  const removeFromCloud = useCallback((table, id) => {
    const uid = cloudUserRef.current?.id;
    if (!uid) return;
    supabase
      .from(table)
      .delete()
      .eq("user_id", uid)
      .eq(table === "tickets" ? "code" : "id", id)
      .then(({ error }) => {
        if (error) console.warn(`${table} delete sync:`, error.message);
      });
  }, []);

  // Deletes a party the signed-in user owns — a HOST original they
  // posted, or an AFFILIATE repost they made (RLS's parties_delete
  // policy permits auth.uid() = user_id OR auth.uid() = affiliate_id,
  // so deleting by id alone is safe and covers both). The host's
  // original party a repost copies is a SEPARATE row and is never
  // touched.
  const deleteParty = useCallback(
    (id) => {
      setUserParties((prev) => prev.filter((p) => p.id !== id));
      setCommunityParties((prev) => prev.filter((p) => p.id !== id));
      setGoing((prev) => prev.filter((g) => g !== id));
      const uid = cloudUserRef.current?.id;
      if (uid) {
        supabase
          .from("parties")
          .delete()
          .eq("id", id)
          .then(({ error }) => {
            if (error) console.warn("parties delete sync:", error.message);
          });
        // Clean up the caller's RSVP rows for this party too.
        supabase
          .from("going")
          .delete()
          .eq("party_id", id)
          .then(({ error }) => {
            if (error) console.warn("going cleanup:", error.message);
          });
      }
      notify("Event removed");
    },
    [notify]
  );

  const deleteReview = useCallback(
    (id) => {
      setUserReviews((prev) => prev.filter((r) => r.id !== id));
      removeFromCloud("reviews", id);
      notify("Review removed");
    },
    [notify, removeFromCloud]
  );

  const addPost = useCallback(
    (post) => {
      const record = {
        ...post,
        id: `b${Date.now()}`,
        isUser: true,
        userId: cloudUserRef.current?.id ?? null,
      };
      setUserPosts((prev) => [record, ...prev]);

      const uid = cloudUserRef.current?.id;
      if (uid) {
        supabase
          .from("posts")
          .upsert({
            id: record.id,
            user_id: uid,
            title: record.title,
            category: record.category,
            body: record.body,
            author: record.author || null,
            accent: record.accent || null,
          })
          .then(({ error }) => {
            if (error) console.warn("posts sync:", error.message);
          });
      }

      notify("Your post is live on the blog!");
    },
    [notify]
  );

  const deletePost = useCallback(
    (id) => {
      setUserPosts((prev) => prev.filter((p) => p.id !== id));
      // The post is also in the community feed — drop it there too so
      // it never lingers on this device until a reload or realtime event.
      setCommunityPosts((prev) => prev.filter((p) => p.id !== id));
      removeFromCloud("posts", id);
      notify("Post removed");
    },
    [notify, removeFromCloud]
  );

  const deleteTicket = useCallback(
    (code) => {
      setMyTickets((prev) => prev.filter((t) => t.code !== code));
      // Tombstone the code so no reload or re-import resurrects it, even
      // if the cloud soft-delete hasn't landed yet.
      setDeletedTicketCodes((prev) => {
        const next = prev.includes(code) ? prev : [...prev, code];
        deletedTicketCodesRef.current = next;
        return next;
      });
      const uid = cloudUserRef.current?.id;
      if (uid) {
        // Soft-delete the cloud row so EVERY device drops the pass (a
        // hard delete can't tell other devices' local copies it's gone).
        supabase
          .from("tickets")
          .update({ deleted: true })
          .eq("code", code)
          .eq("user_id", uid)
          .then(({ error }) => {
            if (error) {
              console.warn("ticket soft-delete sync:", error.message);
              // Fall back to the old hard delete (pre-deleted-column DBs).
              removeFromCloud("tickets", code);
            }
          });
      }
      notify("Pass removed");
    },
    [notify, removeFromCloud]
  );

  // Wipe user content when someone signs out so the next person on
  // this device never sees the previous account's parties, reviews
  // or passes. Their cloud data comes back when they sign in again.
  const resetUserContent = useCallback(() => {
    setUserParties([]);
    setUserReviews([]);
    setUserPosts([]);
    setMyTickets([]);
    setDeletedTicketCodes([]);
    deletedTicketCodesRef.current = [];
    setGoing([]);
    setSaved([]);
    setRsvpPatches({});
    try {
      localStorage.removeItem("festivity.parties");
      localStorage.removeItem("festivity.reviews");
      localStorage.removeItem("festivity.posts");
      localStorage.removeItem("festivity.tickets");
      localStorage.removeItem("festivity.deletedTickets");
      localStorage.removeItem("festivity.going");
      localStorage.removeItem("festivity.saved");
    } catch {
      /* ignore */
    }
  }, []);

  const value = {
    tickets: allTickets,
    allTickets,
    marketplaceParties,
    cart,
    cartItems,
    cartCount,
    total,
    cartOpen,
    setCartOpen,
    addToCart,
    updateQty,
    removeFromCart,
    clearCart,
    checkout,
    buyNow,
    myTickets,
    userParties,
    userReviews,
    userPosts,
    allParties,
    hostPartyPool,
    myReposts,
    postParty,
    repostParty,
    going,
    toggleGoing,
    displayRsvps,
    allReviews,
    addReview,
    allPosts,
    addPost,
    deletePost,
    toast,
    notify,
    attachCloud,
    importCloud,
    resetUserContent,
    deleteParty,
    deleteReview,
    deleteTicket,
    hostLogs,
    affiliateLogs,
    fetchHostLogs,
    fetchAffiliateLogs,
    claimTicketScan,
    saveTicketDesign,
    updateTicketStock,
    saved,
    toggleSave,
    isSaved,
    globalPromos,
    addGlobalPromo,
    removeGlobalPromo,
    // affiliates
    affiliates,
    applyAffiliate,
    fetchAffiliates,
    approveAffiliate,
    // groups
    groups,
    groupMembers,
    groupPosts,
    groupsLoading,
    loadGroups,
    loadGroupDetail,
    createGroup,
    updateGroup,
    joinGroup,
    leaveGroup,
    postToGroup,
    postGroupVideo,
    inviteToGroup,
    uploadGroupCover,
    uploadPartyCover,
    deleteGroupPost,
    deleteGroup,
    // live
    liveSessions,
    loadLiveSessions,
    startLive,
    endLive,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
