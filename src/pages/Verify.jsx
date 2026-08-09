import { useEffect, useMemo, useRef, useState } from "react";
import jsQR from "jsqr";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { GH_CD } from "../data/seed";
import Reveal from "../components/Reveal";

// ------------------------------------------------------------------
// Verify — the host's door tool. Paste a ticket's hash (or scan its
// QR with the camera) and it's checked against this account's sales
// log. Fully client-side, no setup: hashes come from ticket_purchases
// the host already owns, so the check is private and instant.
// ------------------------------------------------------------------

export default function Verify() {
  const { hostLogs, allParties } = useStore();
  const { user, authLoading, openAuth } = useAuth();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState(null); // { status, row }
  const [scanning, setScanning] = useState(false);
  const [camError, setCamError] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(0);

  const partyName = (id) => {
    const p = allParties.find((x) => x.id === id);
    return p ? p.title : "Your party";
  };

  const normalize = (v) => (v || "").trim().toUpperCase().replace(/\s+/g, "");

  const checkHash = (raw) => {
    const q = normalize(raw);
    if (!q) return;
    const row = hostLogs.find(
      (l) => normalize(l.hash) === q || normalize(l.code) === q
    );
    setResult(row ? { status: "valid", row } : { status: "invalid", row: null });
  };

  const stopCamera = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
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
      const tick = () => {
        const video = videoRef.current;
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

  useEffect(() => () => stopCamera(), []);

  const head = (
    <header className="page-head reveal in">
      <div className="kicker">Host · Door tool</div>
      <h1>
        Verify<span className="outline">.</span>
      </h1>
      <p className="lede">
        Paste a buyer's ticket hash or scan their QR — it's checked against
        your sales log in an instant. Only your party's sales can be verified.
      </p>
    </header>
  );

  const stats = useMemo(() => {
    const byParty = {};
    hostLogs.forEach((l) => {
      byParty[l.party_id] = (byParty[l.party_id] || 0) + 1;
    });
    return byParty;
  }, [hostLogs]);

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
                placeholder="e.g. A1B2-C3D4-E5F6-A7B8"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setResult(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") checkHash(query);
                }}
                autoFocus
              />
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                className="btn"
                style={{ flex: 1, justifyContent: "center" }}
                onClick={() => checkHash(query)}
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

            {result && (
              <div
                className={`verify-result ${
                  result.status === "valid" ? "ok" : "bad"
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
                        it may belong to another host's party.
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="verify-stats">
            <div className="section-label" style={{ marginTop: 0 }}>
              Your sales at a glance
            </div>
            {hostLogs.length === 0 ? (
              <div className="empty-state" style={{ padding: 36 }}>
                <i className="fa-solid fa-receipt" />
                <h3>No sales yet</h3>
                <p>Buyer hashes will appear here once tickets sell.</p>
              </div>
            ) : (
              <div className="verify-party-stats">
                {Object.entries(stats).map(([pid, n]) => (
                  <div className="verify-party-row" key={pid}>
                    <span>{partyName(pid)}</span>
                    <b>{n} sold</b>
                  </div>
                ))}
              </div>
            )}
            <p className="verify-hint">
              <i className="fa-solid fa-shield-halved" aria-hidden="true" /> The
              check is private — hashes never leave your browser.
            </p>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
