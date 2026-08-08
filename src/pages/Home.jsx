import { useEffect, useState } from "react";
import SphereBackground from "../components/SphereBackground";
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

      <h1 className={`main-txt ${ready ? "fade-out" : ""}`}>Festivity</h1>

      <section className="banner hide-text">
        <div className="banner-inner">
          <div className="top-desc">
            <h5>House Party Collective</h5>
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
              <h2>House Parties</h2>
              <div className="cta-row">
                <button className="btn" onClick={() => setTab("tickets")}>
                  Get tickets <i className="fa-solid fa-arrow-right icon" />
                </button>
                <button className="btn btn-outline" onClick={() => setTab("parties/new")}>
                  Post a party
                </button>
              </div>
            </div>

            <div className="right-desc">
              <h1>01</h1>
              <div className="desc-inner">
                <span>Social Links</span>
                <ul>
                  <li>
                    <a href="#" aria-label="Instagram" onClick={(e) => e.preventDefault()}>
                      <i className="fa-brands fa-instagram" />
                    </a>
                  </li>
                  <li>
                    <a href="#" aria-label="X" onClick={(e) => e.preventDefault()}>
                      <i className="fa-brands fa-x-twitter" />
                    </a>
                  </li>
                  <li>
                    <a href="#" aria-label="TikTok" onClick={(e) => e.preventDefault()}>
                      <i className="fa-brands fa-tiktok" />
                    </a>
                  </li>
                  <li>
                    <a href="#" aria-label="YouTube" onClick={(e) => e.preventDefault()}>
                      <i className="fa-brands fa-youtube" />
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
