import { useStore } from "../context/StoreContext";

export default function Footer({ setTab }) {
  const { userParties } = useStore();
  const links = [
    { id: "fyp", label: "For You" },
    { id: "events", label: "Events" },
    { id: "blog", label: "Blog" },
    { id: "hype", label: "Hype" },
    // The Host link only appears once the user has hosted a party.
    ...(userParties.length > 0 ? [{ id: "host", label: "Host" }] : []),
    { id: "admin", label: "Admin" },
    { id: "verify", label: "Verify" },
    { id: "profile", label: "Profile" },
  ];

  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-grid">
          <div>
            <div className="brand-foot">Fest GH</div>
            <p className="about-foot">
              The event hosting site for Ghana. Host events, sell tickets,
              and discover what's happening from Accra to Takoradi.
            </p>
          </div>
          <div>
            <h4>Explore</h4>
            <ul>
              {links.map((l) => (
                <li key={l.id}>
                  <a
                    href={`#${l.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      setTab(l.id);
                    }}
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Follow</h4>
            <div className="socials">
              <a href="#" aria-label="Instagram" onClick={(e) => e.preventDefault()}>
                <i className="fa-brands fa-instagram" />
              </a>
              <a href="#" aria-label="X" onClick={(e) => e.preventDefault()}>
                <i className="fa-brands fa-x-twitter" />
              </a>
              <a href="#" aria-label="TikTok" onClick={(e) => e.preventDefault()}>
                <i className="fa-brands fa-tiktok" />
              </a>
              <a href="#" aria-label="YouTube" onClick={(e) => e.preventDefault()}>
                <i className="fa-brands fa-youtube" />
              </a>
            </div>
          </div>
          <div>
            <h4>Contact</h4>
            <ul>
              <li>
                <a href="mailto:hello@festgh.gh">hello@festgh.gh</a>
              </li>
              <li>
                <a href="#" onClick={(e) => e.preventDefault()}>
                  +233 20 000 0000
                </a>
              </li>
              <li>
                <a href="#" onClick={(e) => e.preventDefault()}>
                  Cantonments, Accra
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="watermark" aria-hidden="true">
          Fest GH
        </div>
        <div className="bottom-bar">
          <span>© 2026 Fest GH · All rights reserved</span>
          <span>Made in Accra, Ghana</span>
        </div>
      </div>
    </footer>
  );
}
