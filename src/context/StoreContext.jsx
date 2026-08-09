import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { apiSaveContent, apiDeleteContent, apiListContent } from "../lib/contentApi";
import { SEED_PARTIES, SEED_REVIEWS, SEED_TICKETS, SEED_BLOG } from "../data/seed";

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
  // Guards against React StrictMode double-invoking the sign-in effect
  // (which would fetch + push up twice in dev).
  const cloudImportingRef = useRef(false);
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
  // Cloud backup (Netlify Blobs via /api/data). User content
  // (posts, parties, reviews, tickets) is backed up to Netlify's
  // built-in storage — no external service, no setup — so it
  // survives sign-out, browser wipes and other devices.
  // localStorage is the fast offline cache; every write is
  // best-effort, so if the API is unreachable the row stays local
  // and importCloud pushes it up on the next sign-in.
  // ----------------------------------------------------------
  const attachCloud = useCallback((user) => {
    cloudUserRef.current = user;
  }, []);

  const saveContent = useCallback(
    (type, id, data) => {
      const me = cloudUserRef.current?.id;
      if (!me || !id) return Promise.resolve(false);
      return apiSaveContent(me, type, id, data);
    },
    []
  );

  const deleteContent = useCallback((type, id) => {
    const me = cloudUserRef.current?.id;
    if (!me || !id) return;
    apiDeleteContent(me, type, id);
  }, []);

  // Pull the signed-in user's content back from the Netlify backup and
  // merge it with anything local (e.g. rows written while the API was
  // unreachable). Local-only rows are pushed up so they're safe too.
  // Note: without tombstones, a stale local copy on another device can
  // re-push a row deleted elsewhere — acceptable for this app.
  const importCloud = useCallback(
    async (userId) => {
      if (!userId) return;
      if (cloudImportingRef.current) return; // StrictMode double-invoke guard
      cloudImportingRef.current = true;
      try {
        const me = userId;

        // Shared-device privacy: the local cache is per-account. When a
        // different account signs in, drop the previous account's backed-up
        // rows before merging (the same account keeps everything on
        // sign-out). The RSVP list (going) is intentionally left alone —
        // it isn't backed up, so clearing it would permanently lose it;
        // party names are public anyway. Session-only RSVP patches reset.
        let owner = "";
        try {
          owner = localStorage.getItem("festivity.contentOwner") || "";
        } catch {
          /* storage unavailable */
        }
        if (owner && owner !== me) {
          [
            "festivity.posts",
            "festivity.parties",
            "festivity.reviews",
            "festivity.tickets",
          ].forEach((k) => {
            try {
              localStorage.removeItem(k);
            } catch {
              /* ignore */
            }
          });
          setUserPosts([]);
          setUserParties([]);
          setUserReviews([]);
          setMyTickets([]);
          setRsvpPatches({});
        }
        try {
          localStorage.setItem("festivity.contentOwner", me);
        } catch {
          /* ignore */
        }

        const remote = await apiListContent(me); // { posts?, parties?, ... }

        const readLocal = (key) => {
          try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : [];
          } catch {
            return [];
          }
        };
        const merge = (rows, localRows, key) => {
          if (!rows) return null; // backup unavailable — keep local as-is
          const ids = new Set(rows.map((r) => r[key]));
          return [...rows, ...localRows.filter((r) => !ids.has(r[key]))];
        };
        // Backup list order is unspecified — keep the merged feed
        // newest-first so the Blog "featured" slot is always the latest.
        const sortNewest = (rows) =>
          rows.sort((a, b) =>
            String(b.created_at || b.date || "").localeCompare(
              String(a.created_at || a.date || "")
            )
          );
        const pushUp = (type, rows, key, toData) => {
          rows.forEach((row) => saveContent(type, row[key], toData(row)));
        };

        // --- posts ---
        if (remote.posts) {
          const local = readLocal("festivity.posts");
          const merged = merge(remote.posts, local, "id");
          if (merged) {
            pushUp(
              "posts",
              local.filter((p) => !remote.posts.some((c) => c.id === p.id)),
              "id",
              (p) => p
            );
            setUserPosts(sortNewest(merged));
          }
        }

        // --- parties ---
        if (remote.parties) {
          const local = readLocal("festivity.parties");
          const merged = merge(remote.parties, local, "id");
          if (merged) {
            pushUp(
              "parties",
              local.filter((p) => !remote.parties.some((c) => c.id === p.id)),
              "id",
              (p) => p
            );
            setUserParties(sortNewest(merged));
          }
        }

        // --- reviews ---
        if (remote.reviews) {
          const local = readLocal("festivity.reviews");
          const merged = merge(remote.reviews, local, "id");
          if (merged) {
            pushUp(
              "reviews",
              local.filter((r) => !remote.reviews.some((c) => c.id === r.id)),
              "id",
              (r) => r
            );
            setUserReviews(sortNewest(merged));
          }
        }

        // --- tickets ---
        if (remote.tickets) {
          const local = readLocal("festivity.tickets");
          const merged = merge(remote.tickets, local, "code");
          if (merged) {
            pushUp(
              "tickets",
              local.filter((t) => !remote.tickets.some((c) => c.code === t.code)),
              "code",
              (t) => t
            );
            setMyTickets(sortNewest(merged));
          }
        }
      } finally {
        cloudImportingRef.current = false;
      }
    },
    [saveContent]
  );

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

      // Back each pass up to Netlify so it comes back after sign-out /
      // on another device. Fire-and-forget: the passes are already shown
      // instantly, the backup settles in the background.
      purchased.forEach((t) => saveContent("tickets", t.code, t));

      notify("Payment received — your tickets are ready");
      return purchased;
    },
    [cart, saveContent, notify]
  );

  const postParty = useCallback(
    async (party) => {
      const record = {
        ...party,
        id: `u${Date.now()}`,
        isUser: true,
        rsvps: 0,
        userId: cloudUserRef.current?.id ?? null,
        created_at: new Date().toISOString(),
      };
      setUserParties((prev) => [record, ...prev]);

      const me = cloudUserRef.current?.id;
      if (me) {
        // Await the backup so the success toast only fires once the
        // party is safe — a quick sign-out can no longer lose it.
        await saveContent("parties", record.id, record);
      }

      notify("Your party is live on the scene!");
    },
    [saveContent, notify]
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
      notify(has ? "RSVP removed" : "You're going! See you there");
    },
    [notify]
  );

  const addReview = useCallback(
    async (review) => {
      const record = {
        ...review,
        id: `r${Date.now()}`,
        verified: false,
        userId: cloudUserRef.current?.id ?? null,
        created_at: new Date().toISOString(),
      };
      setUserReviews((prev) => [record, ...prev]);

      const me = cloudUserRef.current?.id;
      if (me) {
        // Await the backup so the success toast only appears once the
        // review is safe (survives sign-out).
        await saveContent("reviews", record.id, record);
      }

      notify("Thanks for the review!");
    },
    [saveContent, notify]
  );

  // ---- Delete own content (local + backup) --------------------
  const deleteParty = useCallback(
    (id) => {
      setUserParties((prev) => prev.filter((p) => p.id !== id));
      setGoing((prev) => prev.filter((g) => g !== id));
      deleteContent("parties", id);
      notify("Party removed");
    },
    [deleteContent, notify]
  );

  const deleteReview = useCallback(
    (id) => {
      setUserReviews((prev) => prev.filter((r) => r.id !== id));
      deleteContent("reviews", id);
      notify("Review removed");
    },
    [deleteContent, notify]
  );

  const addPost = useCallback(
    async (post) => {
      const record = {
        ...post,
        id: `b${Date.now()}`,
        isUser: true,
        userId: cloudUserRef.current?.id ?? null,
        created_at: new Date().toISOString(),
      };
      setUserPosts((prev) => [record, ...prev]);

      const me = cloudUserRef.current?.id;
      if (me) {
        // Await the backup so the "live" toast only fires once the post
        // is safe — a quick sign-out can no longer lose it.
        await saveContent("posts", record.id, record);
      }

      notify("Your post is live on the blog!");
    },
    [saveContent, notify]
  );

  const deletePost = useCallback(
    (id) => {
      setUserPosts((prev) => prev.filter((p) => p.id !== id));
      deleteContent("posts", id);
      notify("Post removed");
    },
    [deleteContent, notify]
  );

  const deleteTicket = useCallback(
    (code) => {
      setMyTickets((prev) => prev.filter((t) => t.code !== code));
      deleteContent("tickets", code);
      notify("Pass removed");
    },
    [deleteContent, notify]
  );

  // Sign-out deliberately does NOT wipe user content anymore — posts,
  // parties, reviews and tickets survive in localStorage AND the Netlify
  // backup, RSVPs survive locally, so nothing "goes anywhere". Privacy
  // on shared devices is handled by the content-owner check in
  // importCloud, which drops the previous account's cache when a
  // different account signs in.
  const resetUserContent = useCallback(() => {}, []);

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
