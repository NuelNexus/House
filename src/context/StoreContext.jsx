import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Query } from "appwrite";
import { databases, DB_ID, COLLECTIONS } from "../lib/appwrite";
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
  // Cloud sync (Appwrite). User content (posts, parties, reviews,
  // tickets) mirrors to the database so it survives sign-out and
  // follows the account across devices. Every write is best-effort:
  // if a collection is missing or the device is offline, the row just
  // stays local and importCloud pushes it up on the next sign-in.
  // ----------------------------------------------------------
  const attachCloud = useCallback((user) => {
    cloudUserRef.current = user;
  }, []);

  const cloudCreate = useCallback((collection, docId, data, userId, readPerm = "any") => {
    if (!userId) return Promise.resolve(false);
    return databases
      .createDocument(DB_ID, collection, docId, data, [
        `read("${readPerm}")`,
        `write("user:${userId}")`,
        `delete("user:${userId}")`,
      ])
      .then(() => true)
      .catch((e) => {
        console.warn(`cloud create ${collection}:`, e.message);
        return false;
      });
  }, []);

  const cloudDelete = useCallback((collection, docId) => {
    if (!docId) return;
    databases.deleteDocument(DB_ID, collection, docId).catch(() => {
      /* not in cloud (offline/local-only) — nothing to remove */
    });
  }, []);

  // Pull the signed-in user's content back from the cloud and merge it
  // with anything local (e.g. rows written while the cloud was
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
      const fetchCloud = async (collection) => {
        try {
          const res = await databases.listDocuments(DB_ID, collection, [
            Query.equal("user_id", me),
            Query.limit(300),
          ]);
          return res.documents || [];
        } catch {
          return null; // collection missing / offline — keep local rows
        }
      };
      const readLocal = (key) => {
        try {
          const raw = localStorage.getItem(key);
          return raw ? JSON.parse(raw) : [];
        } catch {
          return [];
        }
      };
      const merge = (cloud, localRows, key) => {
        if (!cloud) return null; // cloud unavailable — keep local as-is
        const cloudIds = new Set(cloud.map((c) => c[key]));
        return [...cloud, ...localRows.filter((r) => !cloudIds.has(r[key]))];
      };
      // Appwrite list order is unspecified — keep the merged feed
      // newest-first so the Blog "featured" slot is always the latest.
      const sortNewest = (rows) =>
        rows.sort((a, b) =>
          String(b.created_at || b.date || "").localeCompare(
            String(a.created_at || a.date || "")
          )
        );
      const pushUp = (collection, rows, key, toData) => {
        rows.forEach((row) => cloudCreate(collection, row[key], toData(row), me));
      };

      // --- posts ---
      const postDocs = await fetchCloud(COLLECTIONS.posts);
      if (postDocs) {
        const cloud = postDocs.map((d) => ({
          id: d.$id,
          title: d.title,
          category: d.category,
          body: d.body,
          author: d.author,
          accent: d.accent,
          date: d.date,
          readTime: d.readTime,
          excerpt: d.excerpt,
          isUser: true,
          userId: d.user_id,
          cloud: true,
          created_at: d.created_at,
        }));
        const local = readLocal("festivity.posts");
        const merged = merge(cloud, local, "id");
        if (merged) {
          pushUp(
            COLLECTIONS.posts,
            local.filter((p) => !cloud.some((c) => c.id === p.id)),
            "id",
            (p) => ({
              user_id: me,
              title: p.title || "",
              category: p.category || "",
              body: p.body || "",
              author: p.author || "",
              accent: p.accent || "",
              date: p.date || "",
              readTime: p.readTime || "",
              excerpt: p.excerpt || "",
              created_at: p.created_at || new Date().toISOString(),
            })
          );
          setUserPosts(sortNewest(merged));
        }
      }

      // --- parties ---
      const partyDocs = await fetchCloud(COLLECTIONS.parties);
      if (partyDocs) {
        const cloud = partyDocs.map((d) => ({
          id: d.$id,
          title: d.title,
          host: d.host,
          date: d.date,
          location: d.location,
          price: d.price ?? 0,
          capacity: d.capacity || "",
          description: d.description,
          category: d.category,
          rsvps: d.rsvps ?? 0,
          isUser: true,
          userId: d.user_id,
          cloud: true,
          created_at: d.created_at,
        }));
        const local = readLocal("festivity.parties");
        const merged = merge(cloud, local, "id");
        if (merged) {
          pushUp(
            COLLECTIONS.parties,
            local.filter((p) => !cloud.some((c) => c.id === p.id)),
            "id",
            (p) => ({
              user_id: me,
              title: p.title || "",
              host: p.host || "",
              date: p.date || "",
              location: p.location || "",
              price: p.price ?? 0,
              capacity: p.capacity || "",
              description: p.description || "",
              category: p.category || "",
              rsvps: p.rsvps ?? 0,
              created_at: p.created_at || new Date().toISOString(),
            })
          );
          setUserParties(sortNewest(merged));
        }
      }

      // --- reviews ---
      const reviewDocs = await fetchCloud(COLLECTIONS.reviews);
      if (reviewDocs) {
        const cloud = reviewDocs.map((d) => ({
          id: d.$id,
          partyName: d.partyName,
          rating: d.rating ?? 0,
          title: d.title,
          comment: d.comment,
          author: d.author,
          date: d.date,
          verified: false,
          userId: d.user_id,
          cloud: true,
          created_at: d.created_at,
        }));
        const local = readLocal("festivity.reviews");
        const merged = merge(cloud, local, "id");
        if (merged) {
          pushUp(
            COLLECTIONS.reviews,
            local.filter((r) => !cloud.some((c) => c.id === r.id)),
            "id",
            (r) => ({
              user_id: me,
              partyName: r.partyName || "",
              rating: r.rating ?? 0,
              title: r.title || "",
              comment: r.comment || "",
              author: r.author || "",
              date: r.date || "",
              created_at: r.created_at || new Date().toISOString(),
            })
          );
          setUserReviews(sortNewest(merged));
        }
      }

      // --- tickets ---
      const ticketDocs = await fetchCloud(COLLECTIONS.tickets);
      if (ticketDocs) {
        const cloud = ticketDocs.map((d) => ({
          code: d.$id,
          ticketId: d.ticket_id,
          name: d.name,
          date: d.date,
          location: d.location,
          price: d.price ?? 0,
          holder: d.holder,
          cloud: true,
          userId: d.user_id,
          created_at: d.created_at,
        }));
        const local = readLocal("festivity.tickets");
        const merged = merge(cloud, local, "code");
        if (merged) {
          pushUp(
            COLLECTIONS.tickets,
            local.filter((t) => !cloud.some((c) => c.code === t.code)),
            "code",
            (t) => ({
              user_id: me,
              ticket_id: t.ticketId || "",
              name: t.name || "",
              date: t.date || "",
              location: t.location || "",
              price: t.price ?? 0,
              holder: t.holder?.name || t.holder || "",
              created_at: t.created_at || new Date().toISOString(),
            })
          );
          setMyTickets(sortNewest(merged));
        }
      }
      } finally {
        cloudImportingRef.current = false;
      }
    },
    [cloudCreate]
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

      // Mirror each pass to the cloud (private to this account) so they
      // come back after sign-out / on another device.
      const me = cloudUserRef.current?.id;
      if (me) {
        purchased.forEach((t) =>
          cloudCreate(
            COLLECTIONS.tickets,
            t.code,
            {
              user_id: me,
              ticket_id: t.ticketId,
              name: t.name,
              date: t.date,
              location: t.location,
              price: t.price,
              holder: holder.name || "",
              created_at: new Date().toISOString(),
            },
            me,
            `user:${me}`
          )
        );
      }

      notify("Payment received — your tickets are ready");
      return purchased;
    },
    [cart, cloudCreate, notify]
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
        // Await the cloud write so the success toast only fires once the
        // party is backed up — a quick sign-out can no longer lose it.
        await cloudCreate(
          COLLECTIONS.parties,
          record.id,
          {
            user_id: me,
            title: record.title || "",
            host: record.host || "",
            date: record.date || "",
            location: record.location || "",
            price: Number(record.price) || 0,
            capacity: record.capacity || "",
            description: record.description || "",
            category: record.category || "",
            rsvps: 0,
            created_at: record.created_at,
          },
          me
        );
      }

      notify("Your party is live on the scene!");
    },
    [cloudCreate, notify]
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
        // Wait for the cloud write so the success toast only appears
        // once the review is actually safe (survives sign-out).
        await cloudCreate(
          COLLECTIONS.reviews,
          record.id,
          {
            user_id: me,
            partyName: record.partyName || "",
            rating: Number(record.rating) || 0,
            title: record.title || "",
            comment: record.comment || "",
            author: record.author || "",
            date: record.date || "",
            created_at: record.created_at,
          },
          me
        );
      }

      notify("Thanks for the review!");
    },
    [cloudCreate, notify]
  );

  // ---- Delete own content (local + cloud) ---------------------
  const deleteParty = useCallback(
    (id) => {
      setUserParties((prev) => prev.filter((p) => p.id !== id));
      setGoing((prev) => prev.filter((g) => g !== id));
      cloudDelete(COLLECTIONS.parties, id);
      notify("Party removed");
    },
    [cloudDelete, notify]
  );

  const deleteReview = useCallback(
    (id) => {
      setUserReviews((prev) => prev.filter((r) => r.id !== id));
      cloudDelete(COLLECTIONS.reviews, id);
      notify("Review removed");
    },
    [cloudDelete, notify]
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
        // Await the cloud write so the "live" toast only fires once the
        // post is backed up — a quick sign-out can no longer lose it.
        await cloudCreate(
          COLLECTIONS.posts,
          record.id,
          {
            user_id: me,
            title: record.title || "",
            category: record.category || "",
            body: record.body || "",
            author: record.author || "",
            accent: record.accent || "",
            date: record.date || "",
            readTime: record.readTime || "",
            excerpt: record.excerpt || "",
            created_at: record.created_at,
          },
          me
        );
      }

      notify("Your post is live on the blog!");
    },
    [cloudCreate, notify]
  );

  const deletePost = useCallback(
    (id) => {
      setUserPosts((prev) => prev.filter((p) => p.id !== id));
      cloudDelete(COLLECTIONS.posts, id);
      notify("Post removed");
    },
    [cloudDelete, notify]
  );

  const deleteTicket = useCallback(
    (code) => {
      setMyTickets((prev) => prev.filter((t) => t.code !== code));
      cloudDelete(COLLECTIONS.tickets, code);
      notify("Pass removed");
    },
    [cloudDelete, notify]
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
