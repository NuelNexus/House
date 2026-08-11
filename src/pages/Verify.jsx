import { useEffect, useMemo, useRef, useState } from "react";
import jsQR from "jsqr";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { GH_CD } from "../data/seed";
import Reveal from "../components/Reveal";

// ------------------------------------------------------------------
// Verify — the host's door tool. Paste a ticket's hash (or scan its
// QR with the camera) and it's checked against every sale tied to
// this account — both the parties you originally hosted (hostLogs)
// and the parties you reposted as an affiliate (affiliateLogs), so a
// reposted event's passes verify for the affiliate too. A successful
// check CLAIMS the pass (claim_ticket_scan RPC): it's logged as used
// and can never be let in or rescanned again.
// ------------------------------------------------------------------

export default function Verify() {
  const { hostLogs, affiliateLogs, allParties, userParties, claimTicketScan, notify } = useStore();
  const { user, authLoading, openAuth } = useAuth();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState(null); // { status, row }
  const [checking, setChecking] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [camError, setCamError] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(0);
  const debounceRef = useRef(null);

  // Every sale this account can verify — deduped by hash so a pass you
  // both hosted and reposted counts once.
  const salesLog = useMemo(() => {
    const seen = new Set();
    const merged = [];
    [...hostLogs, ...affiliateLogs].forEach((l) => {
      if (!l?.hash) return;
      const key = l.hash.toUpperCase();
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(l);
    });
    return merged;
  }, [hostLogs, affiliateLogs]);

  const partyName = (id) => {
    if (!id) return "Your event";
    const p =
      allParties.find((x) => x.id === id) ||
      userParties.find((x) => x.id === id);
    return p ? p.title : "Your event";
  };

  const normalize = (v) => (v || "").trim().toUpperCase().replace(/\s+/g, "");

  // A successful check claims the pass — it's logged as used so the
  // same hash can never be scanned in twice (the DB enforces this
  // atomically, so two devices at the door can't both let it in).
  const checkHash = async (raw) => {
    const q = normalize(raw);
    if (!q) return;
    // A manual check cancels any pending live-check debounce so the two
    // never race over the result.
    clearTimeout(debounceRef.current);
    setChecking(true);
    setResult(null);
    const row = salesLog.find(
      (l) => normalize(l.hash) === q || normalize(l.code) === q
    );
    if (!row) {
      setResult({ status: "invalid", row: null });
      setChecking(false);
      return;
    }
    if (row.verified_at) {
      setResult({ status: "used", row });
      setChecking(false);
      return;
    }
    // Claim with the row's canonical hash — the typed query may be a
    // pass CODE (FST-…), which the claim RPC doesn't match.
    const claim = await claimTicketScan(row.hash);
    if (claim && claim.claimed) {
      setResult({ status: "valid", row: { ...row, verified_at: claim.verified_at } });
      notify("Ticket marked as used — it can't be scanned again");
    } else if (claim && claim.verified_at) {
      // Lost the race — another scanner got there first.
      setResult({ status: "used", row: { ...row, verified_at: claim.verified_at } });
    } else {
      // Claim unavailable (schema not applied / offline) — fall back to
      // the plain valid check, just without the used-logging.
      setResult({ status: "valid", row });
    }
    setChecking(false);
  };

  // Live check as the host types — only once the input looks like a
  // complete hash/code, then a short debounce so it never fires mid-keystroke.
  const onQueryChange = (v) => {
    setQuery(v);
    setResult(null);
    clearTimeout(debounceRef.current);
    const clean = normalize(v);
    if (clean.length >= 8) {
      setChecking(true);
      debounceRef.current = setTimeout(() => {
        const row = salesLog.find(
          (l) => normalize(l.hash) === clean || normalize(l.code) === clean
        );
        // Live preview only — no claiming while typing. Used passes show
        // their used state; only an explicit check/scan claims the pass.
        setResult(
          row
            ? { status: row.verified_at ? "used" : "valid", row }
            : { status: "invalid", row: null }
        );
        setChecking(false);
      }, 420);
    } else {
      setChecking(false);
    }
  };

  const reset = () => {
    setQuery("");
    setResult(null);
    setChecking(false);
  };

  const stopCamera = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
  };

  const startCamera = async () => {
    setCamError("");
    setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      // One shared canvas — recreated only if the video size changes.
      let canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      let hit = false; // guard: one decode per scan session
      const tick = () => {
        const video = videoRef.current;
        if (hit) return;
        if (!video || video.readyState < 2) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        if (
          canvas.width !== video.videoWidth ||
          canvas.height !== video.videoHeight
        ) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        ctx.drawImage(video, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });
        if (code && code.data) {
          hit = true;
          stopCamera();
          setQuery(code.data);
          checkHash(code.data);
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      setScanning(false);
      setCamError(
        "Camera unavailable or permission denied — paste the hash manually instead."
      );
    }
  };

  useEffect(
    () => () => {
      clearTimeout(debounceRef.current);
      stopCamera();
    },
    []
  );

  const head = (
    <header className="page-head reveal in">
      <div className="kicker">Host · Door tool</div>
      <h1>
        Verify<span className="outline">.</span>
      </h1>
      <p className="lede">
        Paste a buyer's ticket hash or scan their QR — it's checked against
        your sales log in an instant. Covers the parties you host and the
        reposts you sell as an affiliate. A successful check logs the pass
        as used, so it can't be let in or rescanned twice.
      </p>
    </header>
  );

  const stats = useMemo(() => {
    const byParty = {};
    salesLog.forEach((l) => {
      const pid = l.party_id || "unlisted";
      byParty[pid] = (byParty[pid] || 0) + 1;
    });
    return byParty;
  }, [salesLog]);

  if (authLoading) {
    return (
      <div className="page">
        <div className="profile-loader" aria-label="Loading" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="page">
        {head}
        <div className="form-panel gate-panel">
          <div className="gate-icon">
            <i className="fa-solid fa-shield-halved" />
          </div>
          <h2>Sign in to verify tickets</h2>
          <p>The check runs against your own sales log — sign in as the host.</p>
          <button className="btn" onClick={() => openAuth("verify")}>
            Sign in to continue <i className="fa-solid fa-arrow-right icon" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      {head}

      <Reveal>
        <div className="verify-wrap">
          <div className="form-panel verify-panel">
            <div className="field">
              <label htmlFor="verify-hash">Ticket hash or pass code</label>
              <input
                id="verify-hash"
                className="input"
                placeholder="e.g. 6D68-D31B-2442-7EB8"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") checkHash(query);
                }}
                autoFocus
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                className="btn"
                style={{ flex: 1, justifyContent: "center" }}
                onClick={() => checkHash(query)}
                disabled={checking || !normalize(query)}
              >
                <i className="fa-solid fa-magnifying-glass icon" /> Check ticket
              </button>
              <button
                className="btn btn-outline"
                style={{ flex: 1, justifyContent: "center" }}
                onClick={scanning ? stopCamera : startCamera}
              >
                <i className={`fa-solid ${scanning ? "fa-stop" : "fa-camera"} icon`} />
                {scanning ? "Stop camera" : "Scan QR"}
              </button>
            </div>
            {camError && (
              <p style={{ color: "var(--rose-deep)", marginTop: 14, fontSize: 14 }}>
                {camError}
              </p>
            )}

            {scanning && (
              <div className="verify-camera">
                <video ref={videoRef} muted playsInline />
                <div className="verify-scan-frame" aria-hidden="true" />
                <p>Point the camera at the ticket's QR code…</p>
              </div>
            )}

            {checking && (
              <p className="verify-hint" style={{ marginTop: 14 }}>
                <i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true" />{" "}
                Checking…
              </p>
            )}

            {result && (
              <div
                className={`verify-result ${
                  result.status === "valid"
                    ? "ok"
                    : result.status === "used"
                    ? "warn"
                    : "bad"
                }`}
              >
                {result.status === "valid" ? (
                  <>
                    <div className="verify-result-icon">
                      <i className="fa-solid fa-circle-check" />
                    </div>
                    <div className="verify-result-body">
                      <b>Valid ticket — let them in!</b>
                      <span>
                        {result.row.buyer_name || "A guest"} ·{" "}
                        {partyName(result.row.party_id)}
                      </span>
                      <span>
                        {GH_CD(Number(result.row.price) || 0)} ·{" "}
                        {new Date(result.row.created_at).toLocaleDateString(
                          "en-GB",
                          { day: "numeric", month: "short" }
                        )}
                      </span>
                      <span className="verify-hash">
                        <i className="fa-solid fa-qrcode" aria-hidden="true" />{" "}
                        {result.row.hash}
                      </span>
                    </div>
                  </>
                ) : result.status === "used" ? (
                  <>
                    <div className="verify-result-icon">
                      <i className="fa-solid fa-clock-rotate-left" />
                    </div>
                    <div className="verify-result-body">
                      <b>Already used — this pass was scanned in before</b>
                      <span>
                        {result.row.buyer_name || "A guest"} ·{" "}
                        {partyName(result.row.party_id)}
                      </span>
                      {result.row.verified_at && (
                        <span>
                          Scanned{" "}
                          {new Date(result.row.verified_at).toLocaleString("en-GB", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      )}
                      <span className="verify-hash">
                        <i className="fa-solid fa-qrcode" aria-hidden="true" />{" "}
                        {result.row.hash}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="verify-result-icon">
                      <i className="fa-solid fa-circle-xmark" />
                    </div>
                    <div className="verify-result-body">
                      <b>No match found</b>
                      <span>
                        This hash isn't in your sales log. Double-check it, or
                        it may belong to another host's event.
                      </span>
                    </div>
                  </>
                )}
                <button className="btn btn-sm btn-outline" onClick={reset}>
                  <i className="fa-solid fa-rotate icon" /> Check another
                </button>
              </div>
            )}
          </div>

          <div className="verify-stats">
            <div className="section-label" style={{ marginTop: 0 }}>
              Your sales at a glance
            </div>
            {salesLog.length === 0 ? (
              <div className="empty-state" style={{ padding: 36 }}>
                <i className="fa-solid fa-receipt" />
                <h3>No sales yet</h3>
                <p>Buyer hashes will appear here once tickets sell.</p>
              </div>
            ) : (
              <div className="verify-party-stats">
                {Object.entries(stats).map(([pid, n]) => (
                  <div className="verify-party-row" key={pid}>
                    <span>{pid === "unlisted" ? "Unlisted event" : partyName(pid)}</span>
                    <b>{n} sold</b>
                  </div>
                ))}
              </div>
            )}
            <p className="verify-hint">
              <i className="fa-solid fa-shield-halved" aria-hidden="true" /> Your
              sales log is private to your account — other hosts can't see
              your buyers or hashes.
            </p>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
