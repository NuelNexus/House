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
            <div className="brand-foot">FesGH</div>
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
              <a
                href="https://www.instagram.com/fesgh_official?igsh=bjY3djJ3bGthMmdi&utm_source=qr"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
              >
                <i className="fa-brands fa-instagram" />
              </a>
              <a
                href="https://x.com/fesgh_official?s=11"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="X"
              >
                <i className="fa-brands fa-x-twitter" />
              </a>
              <a
                href="https://www.tiktok.com/@fesgh_official"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="TikTok"
              >
                <i className="fa-brands fa-tiktok" />
              </a>
              <a
                href="https://www.youtube.com/@FesGH_official"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="YouTube"
              >
                <i className="fa-brands fa-youtube" />
              </a>
              <a
                href="https://www.facebook.com/profile.php?id=61593069602744&mibextid=wwXIfr"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook"
              >
                <i className="fa-brands fa-facebook" />
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
          FesGH
        </div>
        <div className="bottom-bar">
          <span>© 2026 FesGH · All rights reserved</span>
          <span>Made in Accra, Ghana</span>
        </div>
      </div>
    </footer>
  );
}
