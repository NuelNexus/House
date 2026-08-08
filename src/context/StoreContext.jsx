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
  // Cloud sync. Phase 1 (Appwrite auth only): the app is local-first
  // — user content lives in localStorage per device. Cloud sync of
  // parties/reviews/passes arrives with the Appwrite database port.
  // ----------------------------------------------------------
  const attachCloud = useCallback((user) => {
    cloudUserRef.current = user;
  }, []);

  const importCloud = useCallback(async () => {}, []);

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

      notify("Thanks for the review!");
    },
    [notify]
  );

  // ---- Delete own content (local) -----------------------------
  const deleteParty = useCallback(
    (id) => {
      setUserParties((prev) => prev.filter((p) => p.id !== id));
      setGoing((prev) => prev.filter((g) => g !== id));
      notify("Party removed");
    },
    [notify]
  );

  const deleteReview = useCallback(
    (id) => {
      setUserReviews((prev) => prev.filter((r) => r.id !== id));
      notify("Review removed");
    },
    [notify]
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

      notify("Your post is live on the blog!");
    },
    [notify]
  );

  const deletePost = useCallback(
    (id) => {
      setUserPosts((prev) => prev.filter((p) => p.id !== id));
      notify("Post removed");
    },
    [notify]
  );

  const deleteTicket = useCallback(
    (code) => {
      setMyTickets((prev) => prev.filter((t) => t.code !== code));
      notify("Pass removed");
    },
    [notify]
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
