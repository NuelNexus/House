import { useRef, useState } from "react";
import DesignedTicket from "./DesignedTicket";
import TicketStub from "./TicketStub";
import { GH_CD } from "../data/seed";

// ------------------------------------------------------------------
// TicketWall — the "Your Tickets" wall for the Profile page.
//   · Desktop: a dense grid of full-width horizontal passes.
//   · Mobile: one big pass at a time, swiped with scroll-snap; dots
//     show where you are in the stack.
// Passes render their host-designed layout when one exists, otherwise
// the classic stub. `onOpen` lets the profile open the pass modal.
// ------------------------------------------------------------------
export default function TicketWall({ tickets, onOpen }) {
  const railRef = useRef(null);
  const [active, setActive] = useState(0);

  // Which slide sits closest to the rail's center — gap-proof, so the
  // active dot stays accurate even with the gutter between slides.
  const railIndex = (el) => {
    const center = el.scrollLeft + el.clientWidth / 2;
    let best = 0;
    let bestDist = Infinity;
    Array.from(el.children).forEach((child, i) => {
      const d = Math.abs(child.offsetLeft + child.offsetWidth / 2 - center);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  };

  const renderPass = (t) => (
    <div className="profile-ticket" key={t.code}>
      <div className="profile-ticket-wrap">
        {t.design ? (
          <DesignedTicket
            design={t.design}
            passenger={typeof t.holder === "object" ? t.holder.name : t.holder}
            code={t.code}
            hash={t.hash}
            price={t.price}
            promo={t.promoUsed}
          />
        ) : (
          <TicketStub ticket={t} />
        )}
      </div>
      <div className="profile-ticket-meta">
        <span>
          <i className="fa-solid fa-ticket" aria-hidden="true" /> {t.name}
        </span>
        <span>{GH_CD(Number(t.price) || 0)}</span>
        {t.verifiedAt && (
          <span className="ticket-used-badge">
            <i className="fa-solid fa-circle-check" aria-hidden="true" /> Used
          </span>
        )}
        <button
          className="profile-ticket-open"
          onClick={() => onOpen && onOpen(t)}
          aria-label={`Open ${t.name} pass`}
          title="Open pass"
        >
          <i className="fa-solid fa-expand" aria-hidden="true" />
        </button>
      </div>
    </div>
  );

  if (tickets.length === 0) return null;

  return (
    <div className="ticket-wall">
      <div className="ticket-wall-head">
        <span className="ticket-wall-label">
          Your Tickets <b>({tickets.length})</b>
        </span>
        <span className="ticket-wall-hint">swipe · tap to open · show at the door</span>
      </div>

      {/* Desktop / wide: grid of passes */}
      <div className="ticket-wall-grid">{tickets.map(renderPass)}</div>

      {/* Mobile: one pass at a time with swipe + dots */}
      <div
        className="ticket-wall-rail"
        ref={railRef}
        onScroll={(e) => {
          const idx = railIndex(e.currentTarget);
          if (idx !== active) setActive(idx);
        }}
      >
        {tickets.map((t, i) => (
          <div
            className="ticket-wall-slide"
            key={t.code}
            onClick={() => onOpen && onOpen(t)}
          >
            {renderPass(t)}
          </div>
        ))}
      </div>

      {tickets.length > 1 && (
        <div className="ticket-wall-dots" role="tablist" aria-label="Your passes">
          {tickets.map((t, i) => (
            <button
              key={t.code}
              role="tab"
              aria-selected={active === i}
              aria-label={`Pass ${i + 1}`}
              className={active === i ? "active" : ""}
              onClick={() => {
                const slide = railRef.current?.children[i];
                slide?.scrollIntoView({
                  behavior: "smooth",
                  block: "nearest",
                  inline: "center",
                });
                setActive(i);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
