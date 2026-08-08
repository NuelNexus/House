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

export function StoreProvider({ children }) {
  const [cart, setCart] = useState(() => load("festivity.cart", []));
  const [myTickets, setMyTickets] = useState(() => load("festivity.tickets", []));
  const [userParties, setUserParties] = useState(() => load("festivity.parties", []));
  const [userReviews, setUserReviews] = useState(() => load("festivity.reviews", []));
  const [userPosts, setUserPosts] = useState(() => load("festivity.posts", []));
  const [going, setGoing] = useState(() => load("festivity.going", []));
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
  }, []);

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
  }, []);

  const addToCart = useCallback(
    (ticket, qty = 1) => {
      setCart((prev) => {
        const found = prev.find((i) => i.id === ticket.id);
        if (found) {
          return prev.map((i) =>
            i.id === ticket.id ? { ...i, qty: i.qty + qty } : i
          );
        }
        return [...prev, { id: ticket.id, qty }];
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
      const purchased = cart.flatMap((item) => {
        const ticket = SEED_TICKETS.find((t) => t.id === item.id);
        if (!ticket) return [];
        return Array.from({ length: item.qty }, () => ({
          code: genCode(),
          ticketId: ticket.id,
          name: ticket.name,
          date: ticket.date,
          location: ticket.location,
          price: ticket.price,
          holder,
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
              name: t.name,
              date: t.date,
              location: t.location,
              price: t.price,
              holder: JSON.stringify(t.holder),
            }))
          )
          .then(({ error }) => {
            if (error) console.warn("tickets sync:", error.message);
          });
      }

      notify("Payment received — your tickets are ready");
      return purchased;
    },
    [cart, notify]
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

      const uid = cloudUserRef.current?.id;
      if (uid) {
        // Send snake_case column names — `is_user` and `rsvps` default.
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
          })
          .then(({ error }) => {
            if (error) console.warn("parties sync:", error.message);
          });
      }

      notify("Your party is live on the scene!");
    },
    [notify]
  );

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

  const allParties = useMemo(
    () => [...userParties, ...SEED_PARTIES],
    [userParties]
  );
  const allReviews = useMemo(
    () => [...userReviews, ...SEED_REVIEWS],
    [userReviews]
  );
  const allPosts = useMemo(
    () => [...userPosts, ...SEED_BLOG],
    [userPosts]
  );
  const cartItems = useMemo(
    () =>
      cart
        .map((i) => ({ ...i, ticket: SEED_TICKETS.find((t) => t.id === i.id) }))
        .filter((i) => i.ticket),
    [cart]
  );
  const cartCount = cartItems.reduce((n, i) => n + i.qty, 0);
  const total = cartItems.reduce((s, i) => s + i.ticket.price * i.qty, 0);

  const value = {
    tickets: SEED_TICKETS,
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
    attachCloud,
    importCloud,
    resetUserContent,
    deleteParty,
    deleteReview,
    deleteTicket,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
