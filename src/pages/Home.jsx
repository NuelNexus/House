import { useEffect, useState } from "react";
import SphereBackground from "../components/SphereBackground";
import CssHouse from "../components/CssHouse";
import Marquee from "../components/Marquee";
import ProgramCards from "../components/ProgramCards";

const MARQUEE_ITEMS = [
  "Accra",
  "Kumasi",
  "Takoradi",
  "Cape Coast",
  "Tema",
  "Ho",
  "Tamale",
  "Kwahu",
];

export default function Home({ setTab, onIntroDone }) {
  const [ready, setReady] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className={`home-page ${scrolled ? "scrolled" : ""}`}>
    <div className={`home ${ready ? "ready" : ""}`}>
      <SphereBackground
        onReady={() => {
          setReady(true);
          onIntroDone();
        }}
      />

      {/* Pure-CSS 3D villa — the centerpiece, right where the bubbles are */}
      <CssHouse />

      <h1 className={`main-txt ${ready ? "fade-out" : ""}`}>Fest GH</h1>

      <section className="banner hide-text">
        <div className="banner-inner">
          <div className="top-desc">
            <h5>Event Collective</h5>
            <h6>Accra · Kumasi · Takoradi</h6>
            <span />
          </div>

          <div className="bottom-desc">
            <div className="left-desc">
              <h1>GH</h1>
              <div className="desc-inner">
                <h5>Ghana Edition</h5>
                <h6>Season 2026 · Live & Local</h6>
              </div>
            </div>

            <div className="middle-desc">
              <h2>Events</h2>
              <div className="cta-row">
                <button className="btn" onClick={() => setTab("tickets")}>
                  Get tickets <i className="fa-solid fa-arrow-right icon" />
                </button>
                <button className="btn btn-outline" onClick={() => setTab("parties/new")}>
                  Host an event
                </button>
              </div>
            </div>

            <div className="right-desc">
              <h1>01</h1>
              <div className="desc-inner">
                <span>Social Links</span>
                <ul>
                  <li>
                    <a
                      href="https://www.instagram.com/fesgh_official?igsh=bjY3djJ3bGthMmdi&utm_source=qr"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Instagram"
                    >
                      <i className="fa-brands fa-instagram" />
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://x.com/fesgh_official?s=11"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="X"
                    >
                      <i className="fa-brands fa-x-twitter" />
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://www.tiktok.com/@fesgh_official"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="TikTok"
                    >
                      <i className="fa-brands fa-tiktok" />
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://www.youtube.com/@FesGH_official"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="YouTube"
                    >
                      <i className="fa-brands fa-youtube" />
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://www.facebook.com/profile.php?id=61593069602744&mibextid=wwXIfr"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Facebook"
                    >
                      <i className="fa-brands fa-facebook" />
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      <span className="rotated-text hide-text">Scroll · Accra live · 2026</span>

      <Marquee items={MARQUEE_ITEMS} />
    </div>

    <ProgramCards setTab={setTab} />
    </div>
  );
}
