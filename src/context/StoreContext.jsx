import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { SEED_PARTIES, SEED_REVIEWS, SEED_TICKETS, SEED_BLOG } from "../data/seed";
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

// Normalise a row from the `parties` table into the app's party shape.
function mapPartyRow(p) {
  return {
    ...p,
    isUser: true, // column default — ownership is checked via userId now
    userId: p.user_id ?? null,
    ticketDesign: p.ticket_design ?? null,
    ticketsSold: p.tickets_sold ?? 0,
  };
}

export function StoreProvider({ children }) {
  const [cart, setCart] = useState(() => load("festivity.cart", []));
  const [myTickets, setMyTickets] = useState(() => load("festivity.tickets", []));
  const [userParties, setUserParties] = useState(() => load("festivity.parties", []));
  const [userReviews, setUserReviews] = useState(() => load("festivity.reviews", []));
  const [userPosts, setUserPosts] = useState(() => load("festivity.posts", []));
  const [going, setGoing] = useState(() => load("festivity.going", []));
  // Every party on the scene (all users), so the Parties page shows the
  // whole community — not just the signed-in user's own parties.
  const [communityParties, setCommunityParties] = useState([]);
  // Host's sales log: every pass sold on their party tickets.
  const [hostLogs, setHostLogs] = useState([]);
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
  useEffect(() => {
    goingRef.current = going;
  }, [going]);

  useEffect(() => save("festivity.cart", cart), [cart]);
  useEffect(() => save("festivity.tickets", myTickets), [myTickets]);
  useEffect(() => save("festivity.parties", userParties), [userParties]);
  useEffect(() => save("festivity.reviews", userReviews), [userReviews]);
  useEffect(() => save("festivity.posts", userPosts), [userPosts]);
  useEffect(() => save("festivity.going", going), [going]);

  // ----------------------------------------------------------
  // Derived lists. Declared before the callbacks below because
  // checkout depends on cartItems (via its dependency array).
  // ----------------------------------------------------------
  const allParties = useMemo(() => {
    // user first (their freshest copy wins on id collisions), then the
    // whole community scene, then the editorial seed parties.
    const map = new Map();
    [...userParties, ...communityParties, ...SEED_PARTIES].forEach((p) => {
      if (p && p.id) map.set(p.id, p);
    });
    return [...map.values()];
  }, [userParties, communityParties]);

  // Hosted parties that are selling tickets become purchasable tickets.
  const communityTickets = useMemo(
    () =>
      communityParties
        .filter((p) => p.ticketDesign && p.ticketDesign.enabled)
        .map((p) => ({
          id: p.id,
          name: p.ticketDesign.name || p.title,
          category: p.category,
          hostName: p.host,
          hostId: p.userId,
          date: p.date,
          location: p.location,
          price: Number(p.ticketDesign.price || p.price || 0),
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
          party: p,
        })),
    [communityParties]
  );
  const allTickets = useMemo(
    () => [...SEED_TICKETS, ...communityTickets],
    [communityTickets]
  );
  const allReviews = useMemo(
    () => [...userReviews, ...SEED_REVIEWS],
    [userReviews]
  );
  const allPosts = useMemo(
    () => [...userPosts, ...SEED_BLOG],
    [userPosts]
  );
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

      if (cloudParties.length) {
        setUserParties((prev) => {
          const have = new Set(prev.map((p) => p.id));
          return [...cloudParties, ...prev.filter((p) => !have.has(p.id))];
        });
      }
      if (cloudReviews.length) {
        setUserReviews((prev) => {
          const have = new Set(prev.map((r) => r.id));
          return [...cloudReviews, ...prev.filter((r) => !have.has(r.id))];
        });
      }
      const cloudGoing = (goingRes.data ?? []).map((g) => g.party_id);
      if (cloudGoing.length) {
        setGoing((prev) => [...new Set([...prev, ...cloudGoing])]);
      }
      if (cloudTickets.length) {
        setMyTickets((prev) => {
          const have = new Set(prev.map((t) => t.code));
          const mapped = cloudTickets.map((t) => ({
            code: t.code,
            ticketId: t.ticket_id,
            partyId: t.party_id ?? null,
            hash: t.hash ?? null,
            design: t.design ?? null,
            name: t.name,
            date: t.date,
            location: t.location,
            price: Number(t.price),
            holder: parseHolder(t.holder),
          }));
          return [...mapped, ...prev.filter((t) => !have.has(t.code))];
        });
      }
      const cloudPosts = (postsRes.data ?? []).map((p) => ({
        ...p,
        isUser: true,
        userId: p.user_id ?? null,
        date: fmtShortDate(p.created_at),
        readTime: `${Math.max(
          1,
          Math.ceil((p.body || "").split(/\s+/).length / 200)
        )} min read`,
        excerpt: (p.body || "").replace(/\s+/g, " ").trim().slice(0, 180),
      }));
      if (cloudPosts.length) {
        setUserPosts((prev) => {
          const have = new Set(prev.map((p) => p.id));
          return [...cloudPosts, ...prev.filter((p) => !have.has(p.id))];
        });
      }
    } catch {
      /* offline — keep local */
    }
  }, [fetchSceneParties]);

  const addToCart = useCallback(
    (ticket, qty = 1) => {
      // Snapshot the ticket at add time so hosted-party tickets (which
      // aren't in SEED_TICKETS) survive checkout and the cart drawer.
      const snapshot = {
        id: ticket.id,
        name: ticket.name,
        date: ticket.date,
        location: ticket.location,
        price: ticket.price,
        partyId: ticket.party?.id || (ticket.isParty ? ticket.id : null) || null,
        hostId: ticket.hostId || null,
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

  const removeFromCart = useCallback((id) => {
    setCart((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const checkout = useCallback(
    (holder) => {
      const purchased = cartItems.flatMap((item) => {
        const t = item.ticket;
        if (!t) return [];
        return Array.from({ length: item.qty }, () => ({
          code: genCode(),
          hash: genHash(),
          ticketId: t.id,
          name: t.name,
          date: t.date,
          location: t.location,
          price: t.price,
          holder,
          partyId: item.partyId || null,
          hostId: item.hostId || null,
          design: item.design || null,
        }));
      });
      setMyTickets((prev) => [...purchased, ...prev]);
      setCart([]);

      const uid = cloudUserRef.current?.id;
      if (uid && purchased.length) {
        supabase
          .from("tickets")
          .insert(
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
              holder: JSON.stringify(t.holder),
              design: t.design ? JSON.stringify(t.design) : null,
            }))
          )
          .then(({ error }) => {
            if (error) console.warn("tickets sync:", error.message);
          });

        // Host log: every pass sold on a hosted party's ticket lands in
        // the host's dashboard with the buyer's details + unique hash.
        const logRows = purchased
          .filter((t) => t.partyId && t.hostId)
          .map((t) => ({
            party_id: t.partyId,
            host_id: t.hostId,
            buyer_id: uid,
            buyer_name: t.holder.name,
            buyer_email: t.holder.email,
            buyer_phone: t.holder.phone,
            code: t.code,
            hash: t.hash,
            price: t.price,
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
    [cartItems, notify]
  );

  const postParty = useCallback(
    (party) => {
      const record = {
        ...party,
        id: `u${Date.now()}`,
        isUser: true,
        rsvps: 0,
        userId: cloudUserRef.current?.id ?? null,
      };
      setUserParties((prev) => [record, ...prev]);
      // Put it on the scene list instantly so it's live everywhere.
      setCommunityParties((prev) => [record, ...prev]);

      const uid = cloudUserRef.current?.id;
      if (uid) {
        // Send snake_case column names — `is_user` and `rsvps` default.
        // ticket_design is the host's designer output (JSONB).
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
            capacity: record.capacity,
            description: record.description,
            category: record.category,
            ticket_design: record.ticketDesign
              ? JSON.stringify(record.ticketDesign)
              : null,
          })
          .then(({ error }) => {
            if (error) console.warn("parties sync:", error.message);
          });
      }

      notify("Your party is live on the scene!");
    },
    [notify]
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
      const uid = cloudUserRef.current?.id;
      if (uid) {
        supabase
          .from("parties")
          .update({ ticket_design: JSON.stringify(next) })
          .eq("id", partyId)
          .eq("user_id", uid)
          .then(({ error }) => {
            if (error) console.warn("design sync:", error.message);
          });
      }
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
      const uid = cloudUserRef.current?.id;
      if (uid && nextDesign) {
        supabase
          .from("parties")
          .update({ ticket_design: JSON.stringify(nextDesign) })
          .eq("id", party.id)
          .eq("user_id", uid)
          .then(({ error }) => {
            if (error) console.warn("stock sync:", error.message);
          });
      }
    },
    []
  );

  // Load every sale logged against this host's parties.
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
          .eq("user_id", uid)
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
      notify("Party removed");
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
      removeFromCloud("posts", id);
      notify("Post removed");
    },
    [notify, removeFromCloud]
  );

  const deleteTicket = useCallback(
    (code) => {
      setMyTickets((prev) => prev.filter((t) => t.code !== code));
      removeFromCloud("tickets", code);
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
    setGoing([]);
    setRsvpPatches({});
    try {
      localStorage.removeItem("festivity.parties");
      localStorage.removeItem("festivity.reviews");
      localStorage.removeItem("festivity.posts");
      localStorage.removeItem("festivity.tickets");
      localStorage.removeItem("festivity.going");
    } catch {
      /* ignore */
    }
  }, []);

  const value = {
    tickets: SEED_TICKETS,
    allTickets,
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
    myTickets,
    userParties,
    userReviews,
    userPosts,
    allParties,
    postParty,
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
    fetchHostLogs,
    saveTicketDesign,
    updateTicketStock,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
