import { Component, useCallback, useEffect, useRef, useState } from "react";
import { StoreProvider, useStore } from "./context/StoreContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { SocialProvider } from "./context/SocialContext";
import MouseEffect from "./components/MouseEffect";
import TourOverlay from "./components/TourOverlay";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import CartDrawer from "./components/CartDrawer";
import Toast from "./components/Toast";
import Home from "./pages/Home";
import Events from "./pages/Events";
import Blog from "./pages/Blog";
import PartyDetail from "./pages/PartyDetail";
import Profile from "./pages/Profile";
import PublicProfile from "./pages/PublicProfile";
import Auth from "./pages/Auth";
import PostParty from "./pages/PostParty";
import Host from "./pages/Host";
import Admin from "./pages/Admin";
import Verify from "./pages/Verify";
import WriteReview from "./pages/WriteReview";
import NewPost from "./pages/NewPost";
import Checkout from "./pages/Checkout";
import EditProfile from "./pages/EditProfile";
import Hype from "./pages/Hype";
import Messages from "./pages/Messages";
import Contact from "./pages/Contact";
import Appearance from "./pages/Appearance";

// Safety net: a crash in any single component used to unmount the entire
// React tree (blank page). Now the site shows a reload screen instead and
// one broken section can never take the whole app down.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error("App error boundary caught:", error, info);
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="page" style={{ textAlign: "center", paddingTop: 140 }}>
          <div className="kicker" style={{ justifyContent: "center" }}>
            Something went sideways
          </div>
          <h1 style={{ fontSize: "clamp(48px, 9vw, 110px)", fontWeight: 900, letterSpacing: -3 }}>
            Oops<span style={{ color: "var(--rose-deep)" }}>.</span>
          </h1>
          <p
            style={{
              color: "var(--ink-soft)",
              maxWidth: 420,
              margin: "0 auto 28px",
              lineHeight: 1.6,
            }}
          >
            A part of the page hit a snag. Reload and you'll be right back in.
          </p>
          <button className="btn" onClick={() => window.location.reload()}>
            Reload the site <i className="fa-solid fa-rotate-right icon" />
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Bridges the auth session into the store so parties / reviews /
// tickets sync to Supabase (and back) when the user is signed in.
function CloudSync() {
  const { user } = useAuth();
  const {
    attachCloud,
    importCloud,
    resetUserContent,
    fetchHostLogs,
    fetchAffiliateLogs,
  } = useStore();
  // Tracks the account this session started with so switching users (a
  // different account signs in on this device) wipes the previous
  // account's local cache before the new one imports — accounts can
  // never bleed into each other.
  const uidRef = useRef(null);

  useEffect(() => {
    attachCloud(user);
    if (user) {
      if (uidRef.current && uidRef.current !== user.id) {
        resetUserContent();
      }
      uidRef.current = user.id;
      importCloud(user.id);
      fetchHostLogs(user.id);
      fetchAffiliateLogs(user.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, attachCloud, importCloud, resetUserContent, fetchHostLogs, fetchAffiliateLogs]);

  return null;
}

const VALID_TABS = [
  "home",
  "events",
  "tickets",
  "parties",
  "blog",
  "profile",
  "hype",
  "messages",
  "appearance",
  "host",
  "admin",
  "verify",
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
    messagesSend: false,
    q,
  };

  // Password-reset emails land on #access_token=...&type=recovery —
  // route those to the auth page so the "set new password" form shows.
  if (hash.includes("type=recovery")) {
    return { ...base, tab: "auth" };
  }

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
  // Merged Events tab: #events is the new home, old #tickets / #parties
  // links land on the same unified page.
  if (head === "events") return { ...base, tab: "events" };
  if (head === "tickets") return { ...base, tab: "tickets" };
  if (head === "parties") return { ...base, tab: "parties" };
  if (head === "blog" && parts[1] === "new") return { ...base, tab: "new-post" };
  if (head === "profile" && parts[1] === "edit") return { ...base, tab: "edit-profile" };
  if (head === "checkout") return { ...base, tab: "checkout" };
  if (head === "contact" && parts[1])
    return { ...base, tab: "contact", contactId: decodeURIComponent(parts[1]) };
  if (head === "messages")
    return { ...base, tab: "messages", messagesCompose: parts[1] === "new" };
  // Sending a hype now lives in Messages, not the Hype feed.
  if (head === "hype" && parts[1] === "send")
    return { ...base, tab: "messages", messagesSend: true };
  if (head === "hype") return { ...base, tab: "hype" };
  if (head === "appearance") return { ...base, tab: "appearance" };
  // Merged tabs: old URLs keep working.
  if (head === "reviews") return { ...base, tab: "parties" };
  if (head === "news") return { ...base, tab: "blog" };
  // Merged tabs: For You is part of Events, Groups lives in Messages,
  // and Live lives on the Hype page — old URLs land on their new homes.
  if (head === "fyp") return { ...base, tab: "events" };
  if (head === "groups") return { ...base, tab: "messages" };
  if (head === "live") return { ...base, tab: "hype" };
  // The Affiliate tab (registration + host dashboard) lives on the host
  // page internally — #affiliate and #host both land there.
  if (head === "affiliate") return { ...base, tab: "host" };
  if (VALID_TABS.includes(head)) return { ...base, tab: head };
  return base;
}

function Shell() {
  const { toast, setCartOpen } = useStore();
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  const [introDone, setIntroDone] = useState(false);
  const { tab, userId, partyId, authMode, contactId, messagesCompose, messagesSend, q } =
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
    <ErrorBoundary>
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
        {tab === "events" && <Events setTab={setTab} />}
        {tab === "tickets" && <Events setTab={setTab} />}
        {tab === "parties" && <Events setTab={setTab} />}
        {tab === "blog" && <Blog setTab={setTab} />}
        {tab === "party" && <PartyDetail partyId={partyId} setTab={setTab} />}
        {tab === "profile" && <Profile setTab={setTab} />}
        {tab === "user" && <PublicProfile userId={userId} />}
        {tab === "auth" && <Auth authMode={authMode} />}
        {tab === "post-party" && <PostParty setTab={setTab} q={q} />}
        {tab === "host" && <Host setTab={setTab} />}
        {tab === "admin" && <Admin setTab={setTab} />}
        {tab === "verify" && <Verify setTab={setTab} />}
        {tab === "write-review" && <WriteReview setTab={setTab} q={q} />}
        {tab === "new-post" && <NewPost setTab={setTab} />}
        {tab === "checkout" && <Checkout setTab={setTab} />}
        {tab === "edit-profile" && <EditProfile setTab={setTab} />}
        {tab === "hype" && <Hype setTab={setTab} />}
        {tab === "messages" && (
          <Messages
            compose={messagesCompose}
            sendHype={messagesSend}
            q={q}
            setTab={setTab}
          />
        )}
        {tab === "contact" && <Contact contactId={contactId} q={q} />}
        {tab === "appearance" && <Appearance />}
      </main>

      {tab !== "messages" && tab !== "hype" && <Footer setTab={setTab} />}
      <CartDrawer setTab={setTab} />
      <Toast message={toast} />
      <TourOverlay setTab={setTab} />
    </ErrorBoundary>
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
