import { useEffect, useState } from "react";

// The site tour — simplified English, one step per feature. `go` jumps
// the visitor to that page when they tap the button (and closes the
// tour so they can try it for real).
const STEPS = [
  {
    title: "Welcome to FesGH!",
    body: (
      <>
        FesGH is where people in Ghana find parties and events, buy
        tickets, and share short videos. I'm <b>your guide</b> — this
        tour shows you every part of the site. It only takes 2 minutes.
      </>
    ),
    icon: "fa-house",
  },
  {
    title: "Events — find your next party",
    body: (
      <>
        The <b>Events</b> page is the marketplace. Search or filter by
        category to find something you like. Tap any event to see
        photos, details and reviews — then buy your ticket right there
        with mobile money.
      </>
    ),
    icon: "fa-champagne-glasses",
    go: "events",
    goLabel: "Go to Events",
  },
  {
    title: "Your tickets & profile",
    body: (
      <>
        Every ticket you buy lands in your <b>Profile</b> with its own
        QR code — the door team scans it to let you in. You can also
        save events you like and write reviews after the party.
      </>
    ),
    icon: "fa-id-card",
    go: "profile",
    goLabel: "See your Profile",
  },
  {
    title: "Hype — short videos",
    body: (
      <>
        <b>Hype</b> is the video feed. Watch clips from the scene, post
        your own, and send private clips to your friends. Send videos
        back and forth to build a streak — don't break the chain!
      </>
    ),
    icon: "fa-fire",
    go: "hype",
    goLabel: "Open Hype",
  },
  {
    title: "Blog — news & stories",
    body: (
      <>
        The <b>Blog</b> mixes the latest news with posts from the
        community. Read what's happening in Ghana, or write your own
        story — anyone can post.
      </>
    ),
    icon: "fa-newspaper",
    go: "blog",
    goLabel: "Read the Blog",
  },
  {
    title: "Messages & Groups",
    body: (
      <>
        Chat with your friends in <b>Messages</b>, send friend
        requests, and join or create <b>groups</b> around the things
        you love.
      </>
    ),
    icon: "fa-comment-dots",
    go: "messages",
    goLabel: "Open Messages",
  },
  {
    title: "Host or Affiliate",
    body: (
      <>
        The <b>Affiliate</b> page has two jobs. <b>Host:</b> post your
        event with a base price and it waits in the pool.{" "}
        <b>Affiliate:</b> apply free, then repost an event with your
        own price and design the ticket. You keep 70% of your margin
        on every sale.
      </>
    ),
    icon: "fa-handshake",
    go: "affiliate",
    goLabel: "See the Affiliate page",
  },
  {
    title: "Verify & Admin",
    body: (
      <>
        Hosts and affiliates use <b>Verify</b> to scan ticket QR codes
        at the door. The <b>Admin</b> panel is for the site creator —
        approve affiliates, make promo codes, and track payouts.
      </>
    ),
    icon: "fa-shield-halved",
    go: "verify",
    goLabel: "See Verify",
  },
  {
    title: "Make it yours — you're ready!",
    body: (
      <>
        Change the look anytime under <b>Appearance</b> — pick your
        theme and colours. Whenever you need this tour again, tap the
        help button in the corner of the screen.
      </>
    ),
    icon: "fa-palette",
    go: "appearance",
    goLabel: "Change Appearance",
  },
];

// The Bart Simpson figure — pure CSS (design by Álvaro Montoro).
// The markup mirrors the original exactly so the CSS shapes line up.
function BartFigure() {
  return (
    <div id="bart" aria-hidden="true">
      <div id="shadow" />
      <div id="legs">
        <div className="sock" />
        <div className="sock left" />
        <div className="leg left" />
        <div className="leg right" />
        <div className="shorts-leg right" />
        <div id="shorts" />
        <div className="shorts-leg left" />
        <div className="shoe left">
          <div className="filling" />
          <div className="shoe-line-2" />
          <div className="shoe-line-1" />
          <div className="logo" />
        </div>
        <div className="shoe">
          <div className="filling" />
          <div className="shoe-line-2" />
          <div className="shoe-line-3" />
          <div className="shoe-line-1" />
        </div>
      </div>
      <div id="body">
        <div className="arm left" />
        <div className="shirt-manga left">
          <div />
        </div>
        <div id="shirt">
          <div />
        </div>
        <div className="shirt-back" />
        <div className="shirt-neck" />
        <div className="shirt-body" />
        <div className="shirt-manga">
          <div />
        </div>
        <div className="arm right" />
        <div className="shirt-open" />
        <div className="pants-pocket" />
      </div>
      <div id="head">
        <div id="hair">
          <div className="hair" id="hair-1" />
          <div className="hair" id="hair-2" />
          <div className="hair" id="hair-3" />
          <div className="hair" id="hair-4" />
          <div className="hair" id="hair-5" />
          <div className="hair" id="hair-6" />
          <div className="hair" id="hair-7" />
          <div className="hair" id="hair-8" />
          <div className="hair" id="hair-9" />
        </div>
        <div id="mouth" />
        <div id="neck" />
        <div id="forehead" />
        <div className="eyelash" />
        <div className="lip" />
        <div className="eye left" />
        <div className="cheecks" />
        <div id="nose" />
        <div className="eye right" />
        <div className="back" />
        <div id="ear" />
      </div>
    </div>
  );
}

export default function TourOverlay({ setTab }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  // Show the tour once for new visitors (until they finish or close it).
  useEffect(() => {
    try {
      if (!localStorage.getItem("festivity.tourSeen")) {
        setOpen(true);
      }
    } catch {
      /* storage unavailable — stay closed */
    }
  }, []);

  // Lock page scroll while the tour is open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Keyboard: Esc closes, arrows move between steps.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        markSeen();
      } else if (e.key === "ArrowRight") {
        setStep((s) => Math.min(STEPS.length - 1, s + 1));
      } else if (e.key === "ArrowLeft") {
        setStep((s) => Math.max(0, s - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const markSeen = () => {
    try {
      localStorage.setItem("festivity.tourSeen", "1");
    } catch {
      /* ignore */
    }
  };

  const close = () => {
    markSeen();
    setOpen(false);
  };

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const jump = () => {
    if (current.go) setTab(current.go);
    close();
  };

  return (
    <>
      {open && (
        <div id="tour-root" className="tour-overlay">
          <div
            className="tour-backdrop"
            onClick={close}
            aria-hidden="true"
          />
          <div className="tour-card" role="dialog" aria-modal="true" aria-label="How to use FesGH">
            <button
              className="tour-close"
              aria-label="Close tour"
              title="Close tour (Esc)"
              onClick={close}
            >
              <i className="fa-solid fa-xmark" />
            </button>

            <div className="tour-bart-wrap">
              <BartFigure />
            </div>

            <div className="tour-panel">
              <div className="tour-kicker">
                <i className={`fa-solid ${current.icon}`} aria-hidden="true" />
                Step {step + 1} of {STEPS.length}
              </div>
              <h2 className="tour-title">{current.title}</h2>
              <p className="tour-body">{current.body}</p>

              {current.go && (
                <button className="btn btn-outline tour-jump" onClick={jump}>
                  <i className="fa-solid fa-arrow-up-right-from-square icon" />
                  {current.goLabel}
                </button>
              )}

              <div className="tour-controls">
                <button
                  className="btn btn-sm btn-outline"
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                  disabled={step === 0}
                >
                  <i className="fa-solid fa-arrow-left icon" /> Back
                </button>
                <div className="tour-dots" aria-hidden="true">
                  {STEPS.map((s, i) => (
                    <span
                      key={s.title}
                      className={`tour-dot ${i === step ? "on" : ""}`}
                    />
                  ))}
                </div>
                <button
                  className="btn btn-sm"
                  onClick={() =>
                    isLast ? close() : setStep((s) => s + 1)
                  }
                >
                  {isLast ? (
                    <>
                      <i className="fa-solid fa-check icon" /> Done
                    </>
                  ) : (
                    <>
                      Next <i className="fa-solid fa-arrow-right icon" />
                    </>
                  )}
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {!open && (
        <button
          className="tour-help-btn"
          onClick={() => setOpen(true)}
          title="How to use FesGH"
          aria-label="How to use FesGH"
        >
          <i className="fa-solid fa-circle-question" aria-hidden="true" />
          How to use
        </button>
      )}
    </>
  );
}
