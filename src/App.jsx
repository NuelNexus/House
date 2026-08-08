import { useCallback, useEffect, useState } from "react";
import { StoreProvider, useStore } from "./context/StoreContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { SocialProvider } from "./context/SocialContext";
import MouseEffect from "./components/MouseEffect";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import CartDrawer from "./components/CartDrawer";
import Toast from "./components/Toast";
import Home from "./pages/Home";
import Tickets from "./pages/Tickets";
import Parties from "./pages/Parties";
import Blog from "./pages/Blog";
import PartyDetail from "./pages/PartyDetail";
import Profile from "./pages/Profile";
import PublicProfile from "./pages/PublicProfile";
import Auth from "./pages/Auth";
import PostParty from "./pages/PostParty";
import WriteReview from "./pages/WriteReview";
import NewPost from "./pages/NewPost";
import Checkout from "./pages/Checkout";
import EditProfile from "./pages/EditProfile";
import Hype from "./pages/Hype";
import Messages from "./pages/Messages";
import Contact from "./pages/Contact";
import Appearance from "./pages/Appearance";

// Bridges the auth session into the store. Parties/reviews/tickets are
// local-first for now (Appwrite auth phase 1) — cloud sync arrives
// with the Appwrite database port.
function CloudSync() {
  const { user } = useAuth();
  const { attachCloud, importCloud } = useStore();

  useEffect(() => {
    attachCloud(user);
    if (user) importCloud(user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, attachCloud, importCloud]);

  return null;
}

const VALID_TABS = [
  "home",
  "tickets",
  "parties",
  "blog",
  "profile",
  "hype",
  "messages",
  "appearance",
];
const AUTH_MODES = ["signin", "signup", "forgot"];

// Deep links: #user/<id>, #party/<id>, #auth[/signup], #parties/new,
// #reviews/new, #blog/new, #profile/edit, #checkout, #hype[/send],
// #messages[/new], #contact/<id>, #appearance. Query strings
// (#reviews/new?party=..&back=.., #messages/new?to=x) carry context.
// Old #news and #reviews hashes redirect to their merged homes.
function parseHash(hash) {
  const [path, query = ""] = hash.replace("#", "").split("?");
  const parts = path.split("/").filter(Boolean);
  const head = parts[0] || "";
  const q = {};
  new URLSearchParams(query).forEach((v, k) => {
    q[k] = v;
  });
  const base = {
    tab: "home",
    userId: null,
    partyId: null,
    authMode: "signin",
    contactId: null,
    messagesCompose: false,
    hypeSend: false,
    q,
  };

  // Appwrite recovery/verification links land on #auth/recovery or
  // #auth/verify (with userId+secret in the query) — the Auth page
  // detects those itself and shows the right completion form.

  if (head === "user" && parts[1]) {
    return { ...base, tab: "user", userId: decodeURIComponent(parts[1]) };
  }
  if (head === "auth") {
    return {
      ...base,
      tab: "auth",
      authMode: AUTH_MODES.includes(parts[1]) ? parts[1] : "signin",
    };
  }
  if (head === "party" && parts[1])
    return { ...base, tab: "party", partyId: decodeURIComponent(parts[1]) };
  if (head === "parties" && parts[1] === "new") return { ...base, tab: "post-party" };
  if (head === "reviews" && parts[1] === "new") return { ...base, tab: "write-review" };
  if (head === "blog" && parts[1] === "new") return { ...base, tab: "new-post" };
  if (head === "profile" && parts[1] === "edit") return { ...base, tab: "edit-profile" };
  if (head === "checkout") return { ...base, tab: "checkout" };
  if (head === "contact" && parts[1])
    return { ...base, tab: "contact", contactId: decodeURIComponent(parts[1]) };
  if (head === "messages")
    return { ...base, tab: "messages", messagesCompose: parts[1] === "new" };
  if (head === "hype")
    return { ...base, tab: "hype", hypeSend: parts[1] === "send" };
  if (head === "appearance") return { ...base, tab: "appearance" };
  // Merged tabs: old URLs keep working.
  if (head === "reviews") return { ...base, tab: "parties" };
  if (head === "news") return { ...base, tab: "blog" };
  if (VALID_TABS.includes(head)) return { ...base, tab: head };
  return base;
}

function Shell() {
  const { toast, setCartOpen } = useStore();
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  const [introDone, setIntroDone] = useState(false);
  const { tab, userId, partyId, authMode, contactId, messagesCompose, hypeSend, q } =
    route;

  // Keep routes deep-linkable so back/forward and shared links work.
  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const setTab = useCallback((t) => {
    const target = t.startsWith("#") ? t : `#${t}`;
    if (window.location.hash !== target) window.location.hash = target;
    setRoute(parseHash(target));
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [tab, userId, partyId]);

  // Navigating anywhere closes the cart drawer so it never lingers
  // behind a page transition.
  useEffect(() => {
    setCartOpen(false);
  }, [tab, setCartOpen]);

  const onHome = tab === "home";
  const navHidden = onHome && !introDone;

  return (
    <>
      <CloudSync />
      <MouseEffect active={!onHome || introDone} />
      {/* The messenger is a full-screen app — it brings its own
          back-to-home button, so the site navbar is hidden there. */}
      {tab !== "messages" && tab !== "hype" && (
        <Navbar tab={tab} setTab={setTab} hidden={navHidden} />
      )}

      <main>
        {tab === "home" && (
          <Home setTab={setTab} onIntroDone={() => setIntroDone(true)} />
        )}
        {tab === "tickets" && <Tickets />}
        {tab === "parties" && <Parties setTab={setTab} />}
        {tab === "blog" && <Blog setTab={setTab} />}
        {tab === "party" && <PartyDetail partyId={partyId} setTab={setTab} />}
        {tab === "profile" && <Profile setTab={setTab} />}
        {tab === "user" && <PublicProfile userId={userId} />}
        {tab === "auth" && <Auth authMode={authMode} />}
        {tab === "post-party" && <PostParty setTab={setTab} />}
        {tab === "write-review" && <WriteReview setTab={setTab} q={q} />}
        {tab === "new-post" && <NewPost setTab={setTab} />}
        {tab === "checkout" && <Checkout setTab={setTab} />}
        {tab === "edit-profile" && <EditProfile setTab={setTab} />}
        {tab === "hype" && <Hype send={hypeSend} q={q} setTab={setTab} />}
        {tab === "messages" && (
          <Messages compose={messagesCompose} q={q} setTab={setTab} />
        )}
        {tab === "contact" && <Contact contactId={contactId} q={q} />}
        {tab === "appearance" && <Appearance />}
      </main>

      {tab !== "messages" && tab !== "hype" && <Footer setTab={setTab} />}
      <CartDrawer setTab={setTab} />
      <Toast message={toast} />
    </>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <AuthProvider>
        <ThemeProvider>
          <SocialProvider>
            <Shell />
          </SocialProvider>
        </ThemeProvider>
      </AuthProvider>
    </StoreProvider>
  );
}
