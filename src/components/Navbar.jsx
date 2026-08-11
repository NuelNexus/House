import { useEffect, useRef, useState } from "react";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { useSocial } from "../context/SocialContext";

const LINKS = [
  { id: "home", label: "Home", idx: "00" },
  { id: "events", label: "Events", idx: "01" },
  { id: "hype", label: "Hype", idx: "02" },
  { id: "blog", label: "Blog", idx: "03" },
  { id: "affiliate", label: "Affiliate", idx: "04" },
];

// Bottom tab bar shown on phones — the essentials, one thumb away.
// Post a party takes the Profile slot: profile lives in the avatar menu.
const MOBILE_TABS = [
  { id: "home", label: "Home", icon: "fa-house" },
  { id: "events", label: "Events", icon: "fa-champagne-glasses" },
  { id: "hype", label: "Hype", icon: "fa-fire" },
  { id: "messages", label: "Chat", icon: "fa-comment-dots" },
  { id: "parties/new", label: "Post", icon: "fa-plus", post: true },
];

export default function Navbar({ tab, setTab, hidden }) {
  const { cartCount, setCartOpen } = useStore();
  const { user, name, initial, profile, openAuth, signOut, authLoading } = useAuth();
  // The Affiliate tab is open to everyone — sign up to host, or post a
  // party idea for approved hosts to pick up.
  const links = LINKS;
  const mobileExtras = [
    { id: "appearance", label: "Appearance", idx: "05" },
    { id: "admin", label: "Admin", idx: "06" },
    { id: "verify", label: "Verify", idx: "07" },
  ];
  // Events tab is active for its merged aliases too.
  const eventsActive = tab === "events" || tab === "tickets" || tab === "parties";
  // The Affiliate page keeps its legacy "host" route id.
  const affiliateActive = tab === "affiliate" || tab === "host";
  const { unreadTotal } = useSocial();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [bump, setBump] = useState(false);
  const userMenuRef = useRef(null);

  useEffect(() => {
    if (cartCount === 0) return;
    setBump(true);
    const t = setTimeout(() => setBump(false), 400);
    return () => clearTimeout(t);
  }, [cartCount]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!userMenuOpen) return undefined;
    const onClick = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [userMenuOpen]);

  const go = (id) => {
    setMenuOpen(false);
    setUserMenuOpen(false);
    setTab(id);
  };

  const handleSignOut = () => {
    setUserMenuOpen(false);
    setMenuOpen(false);
    signOut();
  };

  return (
    <>
      <header className={`navbar ${hidden ? "nav-hidden" : ""}`}>
        <div className="navbar-inner">
          <a
            href="#home"
            className="navbar-brand"
            onClick={(e) => {
              e.preventDefault();
              go("home");
            }}
          >
            FesGH<span className="dot" />
          </a>
          <nav aria-label="Primary">
            <ul>
              {links.map((l) => (
                <li key={l.id}>
                  <a
                    href={`#${l.id}`}
                    className={
                      (l.id === "events"
                        ? eventsActive
                        : l.id === "affiliate"
                        ? affiliateActive
                        : tab === l.id)
                        ? "active"
                        : ""
                    }
                    onClick={(e) => {
                      e.preventDefault();
                      go(l.id);
                    }}
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="nav-actions">
            {!authLoading && user ? (
              <div className="user-chip" ref={userMenuRef}>
                <button
                  className="user-btn"
                  aria-haspopup="true"
                  aria-expanded={userMenuOpen}
                  onClick={() => setUserMenuOpen((o) => !o)}
                >
                  <span className="avatar-sm">
                    {profile?.avatarUrl ? (
                      <img src={profile.avatarUrl} alt="" />
                    ) : (
                      initial
                    )}
                  </span>
                  <span className="user-name">{name}</span>
                  <i className="fa-solid fa-chevron-down" />
                </button>
                {userMenuOpen && (
                  <div className="user-menu">
                    <button
                      className="user-menu-head"
                      onClick={() => go("profile")}
                    >
                      <span className="avatar-sm">
                        {profile?.avatarUrl ? (
                          <img src={profile.avatarUrl} alt="" />
                        ) : (
                          initial
                        )}
                      </span>
                      <div className="um-id">
                        <b>{name}</b>
                        <small>{user.email}</small>
                      </div>
                    </button>
                    <button className="user-menu-item" onClick={() => go("profile")}>
                      <i className="fa-solid fa-id-card" /> Profile
                    </button>
                    <button className="user-menu-item" onClick={() => go("messages")}>
                      <i className="fa-solid fa-comments" /> Messages
                      {unreadTotal > 0 && (
                        <span className="um-badge">{unreadTotal}</span>
                      )}
                    </button>
                    <button className="user-menu-item" onClick={() => go("hype")}>
                      <i className="fa-solid fa-fire" /> Hype
                    </button>
                    <button className="user-menu-item" onClick={() => go("affiliate")}>
                      <i className="fa-solid fa-handshake" /> Affiliate
                    </button>
                    <button className="user-menu-item" onClick={() => go("events")}>
                      <i className="fa-solid fa-champagne-glasses" /> Events
                    </button>
                    <button className="user-menu-item" onClick={() => go("appearance")}>
                      <i className="fa-solid fa-palette" /> Appearance
                    </button>
                    <button className="user-menu-item" onClick={() => go("admin")}>
                      <i className="fa-solid fa-chart-simple" /> Admin
                    </button>
                    <button className="user-menu-item" onClick={() => go("verify")}>
                      <i className="fa-solid fa-shield-halved" /> Verify ticket
                    </button>
                    <button className="user-menu-item" onClick={handleSignOut}>
                      <i className="fa-solid fa-right-from-bracket" /> Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button className="btn btn-sm signin-btn" onClick={() => openAuth()}>
                <i className="fa-solid fa-right-to-bracket icon" /> Sign in
              </button>
            )}

            <button className="btn btn-sm host-btn" onClick={() => go("parties/new")}>
              Post an event
            </button>
            <button
              className="cart-btn msg-btn"
              aria-label="Open messages"
              onClick={() => go("messages")}
            >
              <i className="fa-solid fa-comment-dots" />
              {unreadTotal > 0 && (
                <span className={`badge ${bump ? "bump" : ""}`}>{unreadTotal}</span>
              )}
            </button>
            <button
              className="cart-btn"
              aria-label="Open cart"
              onClick={() => setCartOpen(true)}
            >
              <i className="fa-solid fa-bag-shopping" />
              {cartCount > 0 && (
                <span className={`badge ${bump ? "bump" : ""}`}>{cartCount}</span>
              )}
            </button>
            <button
              className="ham-btn"
              aria-label="Open menu"
              onClick={() => setMenuOpen(true)}
            >
              <i className="fa-solid fa-bars" />
            </button>
          </div>
        </div>
      </header>

      {/* Bottom tab bar — phones only (CSS hides it on bigger screens). */}
      <nav className="mobile-tabbar" aria-label="Quick navigation">
        {MOBILE_TABS.map((t) => {
          const active =
            t.id === "events"
              ? eventsActive
              : t.id === "parties/new"
              ? tab === "parties/new"
              : tab === t.id;
          return (
            <button
              key={t.id}
              className={`mtab ${t.post ? "mtab-post" : ""} ${active ? "active" : ""}`}
              aria-label={t.label}
              onClick={() => go(t.id)}
            >
              <i className={`fa-solid ${t.icon}`} aria-hidden="true" />
              <span>{t.label}</span>
              {t.id === "messages" && unreadTotal > 0 && (
                <b className="mtab-badge">{unreadTotal}</b>
              )}
            </button>
          );
        })}
      </nav>

      <div className={`mobile-menu ${menuOpen ? "open" : ""}`} aria-hidden={!menuOpen}>
        <button className="close-menu" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
          <i className="fa-solid fa-xmark" />
        </button>
        <div className="mm-brand">
          FesGH<span className="dot">.</span>
        </div>
        {!authLoading && user ? (
          <div className="mm-user">
            <span className="avatar-sm">
              {profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : initial}
            </span>
            <span className="mm-user-name">{name}</span>
            <button className="mm-signout" aria-label="Sign out" onClick={handleSignOut}>
              <i className="fa-solid fa-right-from-bracket" />
            </button>
          </div>
        ) : (
          <button
            className="mm-signin"
            onClick={() => {
              setMenuOpen(false);
              openAuth();
            }}
          >
            <i className="fa-solid fa-right-to-bracket" /> Sign in
          </button>
        )}
        <ul>
          {links.map((l, i) => {
            const active =
              l.id === "events"
                ? eventsActive
                : l.id === "affiliate"
                ? affiliateActive
                : tab === l.id;
            return (
              <li key={l.id}>
                <a
                  href={`#${l.id}`}
                  className={active ? "active" : ""}
                  style={{ transitionDelay: menuOpen ? `${0.08 + i * 0.05}s` : "0s" }}
                  onClick={(e) => {
                    e.preventDefault();
                    go(l.id);
                  }}
                >
                  <span className="idx">{l.idx}</span>
                  {l.label}
                </a>
              </li>
            );
          })}
          {user &&
            mobileExtras.map((l, i) => (
              <li key={l.id}>
                <a
                  href={`#${l.id}`}
                  style={{
                    transitionDelay: menuOpen
                      ? `${0.08 + (links.length + i) * 0.05}s`
                      : "0s",
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    go(l.id);
                  }}
                >
                  <span className="idx">{l.idx}</span>
                  {l.label}
                  {l.id === "messages" && unreadTotal > 0 && (
                    <span className="um-badge">{unreadTotal}</span>
                  )}
                </a>
              </li>
            ))}
        </ul>
        <div className="mm-footer">
          <span>Accra · GH</span>
          <span>Event Hosting & Tickets</span>
        </div>
      </div>
    </>
  );
}
