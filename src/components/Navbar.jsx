import { useEffect, useRef, useState } from "react";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { useSocial } from "../context/SocialContext";

const LINKS = [
  { id: "home", label: "Home", idx: "00" },
  { id: "fyp", label: "For You", idx: "01" },
  { id: "tickets", label: "Tickets", idx: "02" },
  { id: "parties", label: "Parties", idx: "03" },
  { id: "blog", label: "Blog", idx: "04" },
  { id: "hype", label: "Hype", idx: "05" },
];

export default function Navbar({ tab, setTab, hidden }) {
  const { cartCount, setCartOpen, userParties } = useStore();
  // The Host tab only appears once the user has hosted a party.
  const isHost = userParties.length > 0;
  const links = isHost
    ? [...LINKS, { id: "host", label: "Host", idx: "06" }]
    : LINKS;
  const mobileExtras = [
    ...(isHost ? [{ id: "host", label: "Host", idx: "06" }] : []),
    { id: "messages", label: "Messages", idx: isHost ? "07" : "06" },
    { id: "appearance", label: "Appearance", idx: isHost ? "08" : "07" },
    { id: "profile", label: "Profile", idx: isHost ? "09" : "08" },
    { id: "admin", label: "Admin", idx: isHost ? "10" : "09" },
    { id: "verify", label: "Verify", idx: isHost ? "11" : "10" },
  ];
  const { user, name, initial, profile, openAuth, signOut, authLoading } = useAuth();
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
            Festivity<span className="dot" />
          </a>
          <nav aria-label="Primary">
            <ul>
              {links.map((l) => (
                <li key={l.id}>
                  <a
                    href={`#${l.id}`}
                    className={tab === l.id ? "active" : ""}
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
                    {isHost && (
                      <button className="user-menu-item" onClick={() => go("host")}>
                        <i className="fa-solid fa-wand-magic-sparkles" /> Host dashboard
                      </button>
                    )}
                    <button className="user-menu-item" onClick={() => go("fyp")}>
                      <i className="fa-solid fa-wand-magic-sparkles" /> For You
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
              Host a party
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

      <div className={`mobile-menu ${menuOpen ? "open" : ""}`} aria-hidden={!menuOpen}>
        <button className="close-menu" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
          <i className="fa-solid fa-xmark" />
        </button>
        <div className="mm-brand">
          Festivity<span className="dot">.</span>
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
          {links.map((l, i) => (
            <li key={l.id}>
              <a
                href={`#${l.id}`}
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
          ))}
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
          <span>House Party Tickets</span>
        </div>
      </div>
    </>
  );
}
