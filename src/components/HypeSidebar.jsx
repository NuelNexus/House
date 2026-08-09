import { useAuth } from "../context/AuthContext";
import { useStore } from "../context/StoreContext";
import { useSocial } from "../context/SocialContext";
import Avatar from "./Avatar";

const LINKS = [
  { id: "home",    label: "Home",    icon: "fa-house" },
  { id: "tickets", label: "Tickets", icon: "fa-ticket" },
  { id: "parties", label: "Parties", icon: "fa-champagne-glasses" },
  { id: "blog",    label: "Blog",    icon: "fa-newspaper" },
  { id: "hype",    label: "Hype",    icon: "fa-fire" },
];

export default function HypeSidebar({ tab, setTab, onPost, onSend }) {
  const { user, name, profile, openAuth, signOut } = useAuth();
  const { userParties } = useStore();
  const { streaks, unreadTotal } = useSocial();
  // The Host tab only shows once the user has hosted a party.
  const links =
    userParties.length > 0
      ? [...LINKS, { id: "host", label: "Host", icon: "fa-wand-magic-sparkles" }]
      : LINKS;

  const handlePost = () => {
    if (!user) { openAuth(); return; }
    onPost();
  };

  const handleSend = () => {
    if (!user) { openAuth(); return; }
    onSend();
  };

  return (
    <aside className="hype-sidebar">
      <a
        className="hype-sidebar-brand"
        href="#hype"
        onClick={(e) => { e.preventDefault(); setTab("hype"); }}
      >
        Festivity<span className="dot" />
      </a>

      <nav className="hype-sidebar-nav" aria-label="Hype navigation">
        <ul>
          {links.map((l) => (
            <li key={l.id}>
              <a
                href={`#${l.id}`}
                className={tab === l.id ? "active" : ""}
                onClick={(e) => { e.preventDefault(); setTab(l.id); }}
              >
                <i className={`fa-solid ${l.icon}`} aria-hidden="true" />
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="hype-sidebar-actions">
        <button className="btn btn-sm" onClick={handlePost}>
          <i className="fa-solid fa-fire" /> Post a hype
        </button>
        <button className="btn btn-sm btn-outline" onClick={handleSend}>
          <i className="fa-solid fa-paper-plane" /> Send to a friend
        </button>
      </div>

      {user && streaks.length > 0 && (
        <div className="hype-sidebar-streaks">
          <div className="hype-sidebar-section-label">Streaks</div>
          {streaks.map((s) => (
            <div className="hype-streak-row" key={s.user_a + s.user_b}>
              <i className="fa-solid fa-fire" style={{ color: "#ff7a45" }} />
              <span className="streak-num">{s.streak}</span>
              <span className="streak-who">{s.partnerName}</span>
            </div>
          ))}
        </div>
      )}

      <div className="hype-sidebar-foot">
        {user ? (
          <>
            <button
              className="hype-sidebar-mini"
              onClick={() => setTab("messages")}
            >
              <i className="fa-solid fa-comment-dots" />
              Messages
              {unreadTotal > 0 && (
                <span className="hype-mini-badge">{unreadTotal}</span>
              )}
            </button>
            <button className="hype-sidebar-mini" onClick={() => setTab("profile")}>
              <i className="fa-solid fa-user" />
              Profile
            </button>
            <div className="hype-sidebar-user">
              <Avatar
                name={name || ""}
                seed={profile?.avatar ?? 0}
                src={profile?.avatarUrl || null}
                size={30}
              />
              <span className="hype-sidebar-username">{name}</span>
              <button
                className="hype-sidebar-signout"
                aria-label="Sign out"
                onClick={signOut}
              >
                <i className="fa-solid fa-right-from-bracket" />
              </button>
            </div>
          </>
        ) : (
          <button className="btn btn-sm" onClick={openAuth}>
            <i className="fa-solid fa-right-to-bracket" /> Sign in
          </button>
        )}
      </div>
    </aside>
  );
}
