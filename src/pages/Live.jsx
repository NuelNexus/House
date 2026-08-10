import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { useSocial } from "../context/SocialContext";
import Avatar from "../components/Avatar";
import Reveal from "../components/Reveal";

// ------------------------------------------------------------------
// Live — free peer-to-peer streaming. The catalog (live_sessions) and
// WebRTC signaling (live_signals) live in Supabase; video flows
// directly host → viewer over WebRTC. No servers, no setup, free.
// Small audiences work great; for stadium-sized streams you'd add a
// media server later.
// ------------------------------------------------------------------

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:global.stun.twilio.com:3478" },
];

function startedAgo(iso) {
  if (!iso) return "";
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ${mins % 60}m ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function makePC() {
  return new RTCPeerConnection({ iceServers: ICE_SERVERS });
}

export default function Live() {
  const { liveSessions, startLive, endLive, notify } = useStore();
  const { user, ensureAuth } = useAuth();
  const { fetchProfiles } = useSocial();
  const uid = user?.id ?? null;

  const [profs, setProfs] = useState({});
  const [setupOpen, setSetupOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [previewReady, setPreviewReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hosting, setHosting] = useState(false);
  const [hostSession, setHostSession] = useState(null);
  const [hostViewers, setHostViewers] = useState(0);
  const [watching, setWatching] = useState(null); // session being watched
  const [watchingState, setWatchingState] = useState("idle"); // idle|connecting|live|ended|error
  const [connError, setConnError] = useState("");
  const [muted, setMuted] = useState(true);

  const localStreamRef = useRef(null);
  const previewVideoRef = useRef(null);
  const hostVideoRef = useRef(null);
  const hostPcsRef = useRef(new Map());
  const hostPollRef = useRef(null);
  const hostSessionIdRef = useRef(null);
  const viewerVideoRef = useRef(null);
  const viewerPcRef = useRef(null);
  const viewerPollRef = useRef(null);
  const lastSigRef = useRef(0);
  const iceQueueRef = useRef([]);

  // Resolve host avatars for the catalog.
  useEffect(() => {
    const ids = liveSessions.map((s) => s.host_id).filter(Boolean);
    if (!ids.length) return;
    (async () => {
      const map = await fetchProfiles(ids);
      setProfs((p) => ({ ...p, ...map }));
    })();
  }, [liveSessions, fetchProfiles]);

  // ---------------------------------------------------------------
  // Signaling helpers
  // ---------------------------------------------------------------
  const insertSignal = useCallback(
    async (sessionId, type, toId, payload) => {
      if (!uid) return;
      try {
        await supabase.from("live_signals").insert({
          session_id: sessionId,
          from_id: uid,
          to_id: toId,
          type,
          payload,
        });
      } catch {
        /* offline */
      }
    },
    [uid]
  );

  const pollSignals = useCallback(
    async (sessionId) => {
      if (!uid) return;
      let q = supabase
        .from("live_signals")
        .select("*")
        .eq("session_id", sessionId)
        .eq("to_id", uid)
        .order("id", { ascending: true })
        .limit(60);
      if (lastSigRef.current) q = q.gt("id", lastSigRef.current);
      const { data, error } = await q;
      if (error) return;
      (data || []).forEach((s) => {
        if (s.id > lastSigRef.current) lastSigRef.current = s.id;
        dispatchSignal(s);
      });
    },
    [uid]
  );

  // The polling closure is memoized on uid, so the handlers it dispatches
  // to are read through a ref — always the freshest (hostSession, hosting)
  // values, never the first render's. Without this the host would capture
  // hostSession = null and silently ignore every viewer offer.
  const dispatchRef = useRef({});
  dispatchRef.current = {
    hosting,
    onHostOffer,
    onViewerAnswer,
    onHostIce,
    onViewerIce,
  };

  const dispatchSignal = (s) => {
    let payload = null;
    try {
      payload = JSON.parse(s.payload);
    } catch {
      return;
    }
    const h = dispatchRef.current;
    if (s.type === "offer") h.onHostOffer(s.from_id, payload);
    else if (s.type === "answer") h.onViewerAnswer(payload);
    else if (s.type === "ice") {
      const c = new RTCIceCandidate(payload);
      if (h.hosting) h.onHostIce(s.from_id, c);
      else h.onViewerIce(c);
    }
  };

  // ---------------------------------------------------------------
  // HOST side
  // ---------------------------------------------------------------
  const onHostOffer = useCallback(
    async (viewerId, offer) => {
      const local = localStreamRef.current;
      if (!local || !hostSession) return;
      if (!hostPcsRef.current.has(viewerId)) {
        const pc = makePC();
        hostPcsRef.current.set(viewerId, pc);
        pc.onicecandidate = (e) => {
          if (e.candidate) {
            insertSignal(hostSession.id, "ice", viewerId, JSON.stringify(e.candidate.toJSON()));
          }
        };
        pc.onconnectionstatechange = () => {
          if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
            hostPcsRef.current.delete(viewerId);
            setHostViewers(hostPcsRef.current.size);
          }
        };
        local.getTracks().forEach((t) => pc.addTrack(t, local));
      }
      const pc = hostPcsRef.current.get(viewerId);
      try {
        await pc.setRemoteDescription(offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await insertSignal(hostSession.id, "answer", viewerId, JSON.stringify(answer));
      } catch (err) {
        console.warn("host answer:", err);
      }
    },
    [hostSession, insertSignal]
  );

  const onHostIce = useCallback((viewerId, candidate) => {
    const pc = hostPcsRef.current.get(viewerId);
    if (!pc) return;
    pc.addIceCandidate(candidate).catch(() => {});
  }, []);

  const startHosting = async () => {
    if (!ensureAuth()) return;
    setBusy(true);
    try {
      if (!localStreamRef.current) {
        localStreamRef.current = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });
      }
      const stream = localStreamRef.current;
      const session = await startLive(title.trim() || "Untitled stream");
      if (!session) throw new Error("Couldn't start the session");
      hostSessionIdRef.current = session.id;
      setHostSession(session);
      setHosting(true);
      setSetupOpen(false);
      setPreviewReady(false);
      setTitle("");
      lastSigRef.current = 0;
      // Stream the local camera to the host's own preview too.
      if (hostVideoRef.current) {
        hostVideoRef.current.srcObject = stream;
        hostVideoRef.current.play().catch(() => {});
      }
      hostPollRef.current = window.setInterval(() => pollSignals(session.id), 900);
      notify("You're live! 🎥");
    } catch (err) {
      notify(err.message || "Couldn't access your camera.");
    } finally {
      setBusy(false);
    }
  };

  const stopHosting = async () => {
    if (hostPollRef.current) window.clearInterval(hostPollRef.current);
    hostPollRef.current = null;
    hostPcsRef.current.forEach((pc) => {
      try {
        pc.close();
      } catch {
        /* ignore */
      }
    });
    hostPcsRef.current.clear();
    setHostViewers(0);
    hostSessionIdRef.current = null;
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (hostSession) await endLive(hostSession.id);
    setHosting(false);
    setHostSession(null);
    setWatching(null);
  };

  // ---------------------------------------------------------------
  // VIEWER side
  // ---------------------------------------------------------------
  const onViewerAnswer = useCallback(
    async (answer) => {
      const pc = viewerPcRef.current;
      if (!pc) return;
      try {
        await pc.setRemoteDescription(answer);
        iceQueueRef.current.forEach((c) => pc.addIceCandidate(c).catch(() => {}));
        iceQueueRef.current = [];
      } catch (err) {
        console.warn("viewer answer:", err);
      }
    },
    []
  );

  const onViewerIce = useCallback((candidate) => {
    const pc = viewerPcRef.current;
    if (pc && pc.remoteDescription) pc.addIceCandidate(candidate).catch(() => {});
    else iceQueueRef.current.push(candidate);
  }, []);

  const connectAsViewer = async (session) => {
    if (!user) {
      setConnError("Sign in to watch live.");
      setWatchingState("error");
      return;
    }
    setWatchingState("connecting");
    setConnError("");
    try {
      const pc = makePC();
      viewerPcRef.current = pc;
      pc.ontrack = (e) => {
        if (viewerVideoRef.current && e.streams[0]) {
          viewerVideoRef.current.srcObject = e.streams[0];
          viewerVideoRef.current.play().catch(() => {});
          setWatchingState("live");
        }
      };
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          insertSignal(session.id, "ice", session.host_id, JSON.stringify(e.candidate.toJSON()));
        }
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          setWatchingState("error");
          setConnError(
            "Couldn't reach the host's stream. Direct connections need a stable network — try again."
          );
        }
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await insertSignal(session.id, "offer", session.host_id, JSON.stringify(offer));
      lastSigRef.current = 0;
      viewerPollRef.current = window.setInterval(() => pollSignals(session.id), 900);
      // Best-effort viewer count.
      supabase
        .from("live_sessions")
        .update({ viewers: session.viewers + 1 })
        .eq("id", session.id)
        .then(({ error }) => {
          if (error) console.warn("viewer count:", error.message);
        });
    } catch (err) {
      setWatchingState("error");
      setConnError(err.message || "Couldn't connect to the stream.");
    }
  };

  const closeWatching = useCallback(() => {
    if (viewerPollRef.current) window.clearInterval(viewerPollRef.current);
    viewerPollRef.current = null;
    if (viewerPcRef.current) {
      try {
        viewerPcRef.current.close();
      } catch {
        /* ignore */
      }
      viewerPcRef.current = null;
    }
    if (viewerVideoRef.current) viewerVideoRef.current.srcObject = null;
    iceQueueRef.current = [];
    lastSigRef.current = 0;
    setWatching(null);
    setWatchingState("idle");
    setConnError("");
  }, []);

  // If the stream ends while watching, surface it.
  useEffect(() => {
    if (watching && watchingState !== "idle" && watchingState !== "ended") {
      if (!liveSessions.some((s) => s.id === watching.id)) {
        setWatchingState("ended");
      }
    }
  }, [liveSessions, watching, watchingState]);

  // Cleanup on unmount — including closing a stream left running if the
  // host navigates away mid-broadcast (no dead "live" sessions listed).
  useEffect(
    () => () => {
      if (hostPollRef.current) window.clearInterval(hostPollRef.current);
      if (viewerPollRef.current) window.clearInterval(viewerPollRef.current);
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
      if (hostSessionIdRef.current) {
        const sid = hostSessionIdRef.current;
        supabase
          .from("live_sessions")
          .update({ status: "ended", ended_at: new Date().toISOString() })
          .eq("id", sid)
          .then(() => {});
        supabase
          .from("live_signals")
          .delete()
          .eq("session_id", sid)
          .then(() => {});
      }
    },
    []
  );

  const openSetup = () => {
    if (!ensureAuth()) return;
    setTitle("");
    setPreviewReady(false);
    setSetupOpen(true);
  };

  // ---------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------
  const head = (
    <header className="page-head reveal in">
      <div className="kicker">Live</div>
      <h1>
        Live<span className="outline">.</span>
      </h1>
      <p className="lede">
        Real-time streams from the scene — hosts broadcasting right now,
        straight to you. Go live in one tap, no equipment needed.
      </p>
    </header>
  );

  return (
    <div className="page">
      {head}

      <Reveal>
        <div className="page-tools">
          <div className="section-label" style={{ margin: 0 }}>
            On air now ({liveSessions.length})
          </div>
          {!hosting && (
            <button className="btn live-go" onClick={openSetup}>
              <i className="fa-solid fa-video icon" /> Go Live
            </button>
          )}
        </div>
      </Reveal>

      {liveSessions.length === 0 ? (
        <div className="empty-state">
          <i className="fa-solid fa-tower-broadcast" />
          <h3>No one is live right now</h3>
          <p>Be the first — hit "Go Live" and the whole scene can watch.</p>
          <button className="btn" onClick={openSetup}>
            <i className="fa-solid fa-video icon" /> Go Live
          </button>
        </div>
      ) : (
        <div className="grid">
          {liveSessions.map((s, i) => {
            const host = profs[s.host_id] || null;
            return (
              <Reveal key={s.id} delay={Math.min(i, 8) * 60}>
                <article
                  className="card live-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setWatching(s);
                    connectAsViewer(s);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setWatching(s);
                      connectAsViewer(s);
                    }
                  }}
                >
                  <div className="live-card-thumb">
                    <i className="fa-solid fa-tower-broadcast" />
                    <span className="live-badge">
                      <i className="fa-solid fa-circle" /> LIVE
                    </span>
                    <span className="live-ago">{startedAgo(s.started_at)}</span>
                  </div>
                  <div className="live-card-body">
                    <h3>{s.title}</h3>
                    <div className="live-card-host">
                      <Avatar
                        name={host?.name || "Host"}
                        seed={host?.avatar ?? 0}
                        src={host?.avatar_url || null}
                        size={30}
                      />
                      <span>{host?.name || "Someone"} is live</span>
                    </div>
                  </div>
                </article>
              </Reveal>
            );
          })}
        </div>
      )}

      {/* ---------------- Host overlay ---------------- */}
      {hosting && hostSession && (
        <div className="live-stage">
          <div className="live-stage-top">
            <span className="live-badge">
              <i className="fa-solid fa-circle" /> LIVE
            </span>
            <b>{hostSession.title}</b>
            <span className="live-viewers">
              <i className="fa-solid fa-eye" /> {hostViewers}
            </span>
            <button className="btn btn-sm danger" onClick={stopHosting}>
              <i className="fa-solid fa-stop icon" /> End stream
            </button>
          </div>
          <video ref={hostVideoRef} autoPlay muted playsInline className="live-stage-video" />
          <p className="live-stage-note">
            {hostViewers === 0
              ? "Waiting for viewers… share the Live tab."
              : `${hostViewers} viewer${hostViewers === 1 ? "" : "s"} watching`}
          </p>
        </div>
      )}

      {/* ---------------- Viewer overlay ---------------- */}
      {watching && !hosting && (
        <div className="live-stage" onClick={() => watchingState === "ended" && closeWatching()}>
          <div className="live-stage-top">
            <span className="live-badge">
              <i className="fa-solid fa-circle" /> LIVE
            </span>
            <b>{watching.title}</b>
            <button className="btn btn-sm btn-outline" onClick={closeWatching}>
              <i className="fa-solid fa-xmark icon" /> Close
            </button>
          </div>

          {watchingState === "idle" || watchingState === "connecting" ? (
            <div className="live-connecting">
              <i className="fa-solid fa-spinner fa-spin" />
              <p>Connecting to the stream…</p>
            </div>
          ) : watchingState === "error" ? (
            <div className="live-connecting">
              <i className="fa-solid fa-tower-broadcast" />
              <p>{connError}</p>
              <button className="btn btn-sm" onClick={() => connectAsViewer(watching)}>
                Try again
              </button>
            </div>
          ) : watchingState === "ended" ? (
            <div className="live-connecting">
              <i className="fa-solid fa-circle-check" />
              <p>The stream has ended.</p>
              <button className="btn btn-sm" onClick={closeWatching}>
                Back to Live
              </button>
            </div>
          ) : (
            <>
              <video
                ref={viewerVideoRef}
                autoPlay
                playsInline
                muted={muted}
                className="live-stage-video"
                onClick={(e) => e.stopPropagation()}
              />
              <button
                className="live-unmute"
                aria-label={muted ? "Unmute stream" : "Mute stream"}
                onClick={(e) => {
                  e.stopPropagation();
                  setMuted((m) => !m);
                }}
              >
                <i className={`fa-solid ${muted ? "fa-volume-xmark" : "fa-volume-high"}`} />
              </button>
            </>
          )}
        </div>
      )}

      {/* ---------------- Go Live setup modal ---------------- */}
      {setupOpen && !hosting && (
        <div className="live-stage live-setup" onClick={() => !previewReady && setSetupOpen(false)}>
          <div className="live-stage-top">
            <b>Go Live</b>
            <button className="btn btn-sm btn-outline" onClick={() => setSetupOpen(false)}>
              <i className="fa-solid fa-xmark icon" /> Cancel
            </button>
          </div>
          <div className="live-setup-body">
            <div className="live-preview">
              <video
                ref={previewVideoRef}
                autoPlay
                muted
                playsInline
                className="live-stage-video"
              />
              {!previewReady && (
                <div className="live-connecting">
                  <i className="fa-solid fa-video" />
                  <p>Your camera preview</p>
                </div>
              )}
            </div>
            <div className="live-setup-form">
              <div className="field">
                <label htmlFor="live-title">Stream title</label>
                <input
                  id="live-title"
                  className="input"
                  placeholder="e.g. Rooftop sesh — come through 🎶"
                  value={title}
                  maxLength={80}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <button
                className="btn"
                style={{ width: "100%", justifyContent: "center" }}
                disabled={busy}
                onClick={async () => {
                  if (previewReady) {
                    await startHosting();
                  } else {
                    setBusy(true);
                    try {
                      localStreamRef.current = await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: "user" },
                        audio: true,
                      });
                      if (previewVideoRef.current) {
                        previewVideoRef.current.srcObject = localStreamRef.current;
                        previewVideoRef.current.play().catch(() => {});
                      }
                      setPreviewReady(true);
                    } catch (err) {
                      notify(
                        err.name === "NotAllowedError"
                          ? "Camera permission denied — allow it to go live."
                          : "Couldn't access your camera."
                      );
                    } finally {
                      setBusy(false);
                    }
                  }
                }}
              >
                {busy ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin icon" /> Starting…
                  </>
                ) : previewReady ? (
                  <>
                    <i className="fa-solid fa-tower-broadcast icon" /> Start stream
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-video icon" /> Enable camera
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
