import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { useSocial } from "../context/SocialContext";
import Avatar from "./Avatar";

// ------------------------------------------------------------------
// Live overlays — free peer-to-peer streaming, embedded anywhere
// (the Hype page). The catalog (live_sessions) and WebRTC signaling
// (live_signals) live in Supabase; video flows host → viewer over
// WebRTC. No servers, no setup, free.
//   · LiveStrip          — horizontal "on air now" bar
//   · LiveHostOverlay    — Go Live: camera, title, end stream
//   · LiveViewerOverlay  — watch a stream full-screen
// ------------------------------------------------------------------

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:global.stun.twilio.com:3478" },
];

function makePC() {
  return new RTCPeerConnection({ iceServers: ICE_SERVERS });
}

// ----------------------------------------------------------------
// "On air now" horizontal bar
// ----------------------------------------------------------------
export function LiveStrip({ onWatch }) {
  const { liveSessions } = useStore();
  const { fetchProfiles } = useSocial();
  const [profs, setProfs] = useState({});

  useEffect(() => {
    const ids = liveSessions.map((s) => s.host_id).filter(Boolean);
    if (!ids.length) return;
    (async () => {
      const map = await fetchProfiles(ids);
      setProfs((p) => ({ ...p, ...map }));
    })();
  }, [liveSessions, fetchProfiles]);

  if (!liveSessions.length) return null;

  return (
    <div className="live-strip">
      <span className="live-strip-label">
        <i className="fa-solid fa-circle" /> LIVE
      </span>
      <div className="live-strip-row">
        {liveSessions.map((s) => {
          const host = profs[s.host_id] || null;
          return (
            <button
              key={s.id}
              className="live-strip-item"
              onClick={() => onWatch(s)}
              title={`Watch ${s.title}`}
            >
              <span className="live-strip-avatar">
                <Avatar
                  name={host?.name || "Host"}
                  seed={host?.avatar ?? 0}
                  src={host?.avatar_url || null}
                  size={40}
                />
                <i className="fa-solid fa-circle" aria-hidden="true" />
              </span>
              <span className="live-strip-meta">
                <b>{host?.name || "Someone"}</b>
                <small>{s.title}</small>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------
// Host flow — camera preview, title, start, end
// ----------------------------------------------------------------
export function LiveHostOverlay({ onClose }) {
  const { startLive, endLive, notify } = useStore();
  const { user, ensureAuth } = useAuth();
  const uid = user?.id ?? null;
  const [title, setTitle] = useState("");
  const [previewReady, setPreviewReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState(null);
  const [hostViewers, setHostViewers] = useState(0);
  const [ended, setEnded] = useState(false);

  const localStreamRef = useRef(null);
  const videoRef = useRef(null);
  const hostPcsRef = useRef(new Map());
  const pollRef = useRef(null);
  const lastSigRef = useRef(0);
  const sessionIdRef = useRef(null);

  // Host → viewer signaling is written directly; offers/ICE from viewers
  // come back through the poll below. Handlers are read via a ref so the
  // memoized polling closure always dispatches with the freshest state.
  const handlersRef = useRef({});
  const dispatchSignal = useCallback((s) => {
    let payload = null;
    try {
      payload = JSON.parse(s.payload);
    } catch {
      return;
    }
    const h = handlersRef.current;
    if (s.type === "offer") h.onOffer?.(s.from_id, payload);
    else if (s.type === "ice") {
      const c = new RTCIceCandidate(payload);
      h.onIce?.(s.from_id, c);
    }
  }, []);

  handlersRef.current = {
    onOffer: async (viewerId, offer) => {
      const local = localStreamRef.current;
      const sid = sessionIdRef.current;
      if (!local || !sid) return;
      if (!hostPcsRef.current.has(viewerId)) {
        const pc = makePC();
        hostPcsRef.current.set(viewerId, pc);
        pc.onicecandidate = (e) => {
          if (e.candidate) {
            supabase.from("live_signals").insert({
              session_id: sid,
              from_id: uid,
              to_id: viewerId,
              type: "ice",
              payload: JSON.stringify(e.candidate.toJSON()),
            }).then(() => {});
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
        await supabase.from("live_signals").insert({
          session_id: sid,
          from_id: uid,
          to_id: viewerId,
          type: "answer",
          payload: JSON.stringify(answer),
        }).then(() => {});
      } catch (err) {
        console.warn("host answer:", err);
      }
    },
    onIce: (viewerId, candidate) => {
      const pc = hostPcsRef.current.get(viewerId);
      if (!pc) return;
      pc.addIceCandidate(candidate).catch(() => {});
    },
  };

  const pollSignals = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid || !uid) return;
    let q = supabase
      .from("live_signals")
      .select("*")
      .eq("session_id", sid)
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
  }, [dispatchSignal, uid]);

  const start = async () => {
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
      const s = await startLive(title.trim() || "Untitled stream");
      if (!s) throw new Error("Couldn't start the session");
      sessionIdRef.current = s.id;
      setSession(s);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      pollRef.current = window.setInterval(pollSignals, 900);
      notify("You're live! 🎥");
    } catch (err) {
      notify(err.message || "Couldn't access your camera.");
    } finally {
      setBusy(false);
    }
  };

  const enableCamera = async () => {
    setBusy(true);
    try {
      localStreamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: true,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = localStreamRef.current;
        videoRef.current.play().catch(() => {});
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
  };

  const stop = async () => {
    if (ended) return;
    setEnded(true);
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = null;
    hostPcsRef.current.forEach((pc) => {
      try {
        pc.close();
      } catch {
        /* ignore */
      }
    });
    hostPcsRef.current.clear();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (sessionIdRef.current) await endLive(sessionIdRef.current);
    sessionIdRef.current = null;
    onClose();
  };

  // Unmount safety: end the session + release the camera.
  useEffect(
    () => () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
      if (sessionIdRef.current) {
        const sid = sessionIdRef.current;
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

  return (
    <div className="live-stage">
      <div className="live-stage-top">
        <span className="live-badge">
          <i className="fa-solid fa-circle" /> LIVE
        </span>
        {session ? (
          <>
            <b>{session.title}</b>
            <span className="live-viewers">
              <i className="fa-solid fa-eye" /> {hostViewers}
            </span>
            <button className="btn btn-sm danger" onClick={stop}>
              <i className="fa-solid fa-stop icon" /> End stream
            </button>
          </>
        ) : (
          <>
            <b>Go Live</b>
            <button className="btn btn-sm btn-outline" onClick={onClose}>
              <i className="fa-solid fa-xmark icon" /> Cancel
            </button>
          </>
        )}
      </div>

      {session ? (
        <>
          <video ref={videoRef} autoPlay muted playsInline className="live-stage-video" />
          <p className="live-stage-note">
            {hostViewers === 0
              ? "Waiting for viewers… share the Live tab."
              : `${hostViewers} viewer${hostViewers === 1 ? "" : "s"} watching`}
          </p>
        </>
      ) : (
        <div className="live-setup-body">
          <div className="live-preview">
            <video
              ref={videoRef}
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
              onClick={previewReady ? start : enableCamera}
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
      )}
    </div>
  );
}

// ----------------------------------------------------------------
// Viewer flow — watch a live stream full-screen
// ----------------------------------------------------------------
export function LiveViewerOverlay({ session, onClose }) {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const [state, setState] = useState("connecting"); // connecting|live|error|ended
  const [connError, setConnError] = useState("");
  const [muted, setMuted] = useState(true);

  const videoRef = useRef(null);
  const pcRef = useRef(null);
  const pollRef = useRef(null);
  const lastSigRef = useRef(0);
  const iceQueueRef = useRef([]);
  const liveSessions = useStore().liveSessions;

  const insertSignal = useCallback(
    async (type, toId, payload) => {
      if (!uid) return;
      try {
        await supabase.from("live_signals").insert({
          session_id: session.id,
          from_id: uid,
          to_id: toId,
          type,
          payload,
        });
      } catch {
        /* offline */
      }
    },
    [uid, session.id]
  );

  // Fresh handlers via ref — the polling closure is memoized on uid.
  const handlersRef = useRef({});
  const dispatchSignal = useCallback((s) => {
    let payload = null;
    try {
      payload = JSON.parse(s.payload);
    } catch {
      return;
    }
    const h = handlersRef.current;
    if (s.type === "answer") h.onAnswer?.(payload);
    else if (s.type === "ice") {
      const c = new RTCIceCandidate(payload);
      h.onIce?.(c);
    }
  }, []);

  handlersRef.current = {
    onAnswer: async (answer) => {
      const pc = pcRef.current;
      if (!pc) return;
      try {
        await pc.setRemoteDescription(answer);
        iceQueueRef.current.forEach((c) => pc.addIceCandidate(c).catch(() => {}));
        iceQueueRef.current = [];
      } catch (err) {
        console.warn("viewer answer:", err);
      }
    },
    onIce: (candidate) => {
      const pc = pcRef.current;
      if (pc && pc.remoteDescription) pc.addIceCandidate(candidate).catch(() => {});
      else iceQueueRef.current.push(candidate);
    },
  };

  const pollSignals = useCallback(async () => {
    if (!uid) return;
    let q = supabase
      .from("live_signals")
      .select("*")
      .eq("session_id", session.id)
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
  }, [uid, session.id, dispatchSignal]);

  useEffect(() => {
    if (!uid) {
      setState("error");
      setConnError("Sign in to watch live.");
      return undefined;
    }
    let active = true;
    (async () => {
      try {
        const pc = makePC();
        pcRef.current = pc;
        pc.ontrack = (e) => {
          if (active && videoRef.current && e.streams[0]) {
            videoRef.current.srcObject = e.streams[0];
            videoRef.current.play().catch(() => {});
            setState("live");
          }
        };
        pc.onicecandidate = (e) => {
          if (e.candidate) insertSignal("ice", session.host_id, JSON.stringify(e.candidate.toJSON()));
        };
        pc.onconnectionstatechange = () => {
          if (active && ["failed", "disconnected"].includes(pc.connectionState)) {
            setState("error");
            setConnError(
              "Couldn't reach the host's stream. Direct connections need a stable network — try again."
            );
          }
        };
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await insertSignal("offer", session.host_id, JSON.stringify(offer));
        lastSigRef.current = 0;
        pollRef.current = window.setInterval(pollSignals, 900);
      } catch (err) {
        if (active) {
          setState("error");
          setConnError(err.message || "Couldn't connect to the stream.");
        }
      }
    })();
    return () => {
      active = false;
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
      if (pcRef.current) {
        try {
          pcRef.current.close();
        } catch {
          /* ignore */
        }
        pcRef.current = null;
      }
      if (videoRef.current) videoRef.current.srcObject = null;
      iceQueueRef.current = [];
    };
  }, [uid, session.id, insertSignal, pollSignals]);

  // Host ended the stream → show the ended state.
  useEffect(() => {
    if (state === "live" || state === "connecting") {
      if (!liveSessions.some((s) => s.id === session.id)) setState("ended");
    }
  }, [liveSessions, session.id, state]);

  return (
    <div className="live-stage">
      <div className="live-stage-top">
        <span className="live-badge">
          <i className="fa-solid fa-circle" /> LIVE
        </span>
        <b>{session.title}</b>
        <button className="btn btn-sm btn-outline" onClick={onClose}>
          <i className="fa-solid fa-xmark icon" /> Close
        </button>
      </div>

      {state === "connecting" ? (
        <div className="live-connecting">
          <i className="fa-solid fa-spinner fa-spin" />
          <p>Connecting to the stream…</p>
        </div>
      ) : state === "error" ? (
        <div className="live-connecting">
          <i className="fa-solid fa-tower-broadcast" />
          <p>{connError}</p>
        </div>
      ) : state === "ended" ? (
        <div className="live-connecting">
          <i className="fa-solid fa-circle-check" />
          <p>The stream has ended.</p>
          <button className="btn btn-sm" onClick={onClose}>
            Back
          </button>
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={muted}
            className="live-stage-video"
          />
          <button
            className="live-unmute"
            aria-label={muted ? "Unmute stream" : "Mute stream"}
            onClick={() => setMuted((m) => !m)}
          >
            <i className={`fa-solid ${muted ? "fa-volume-xmark" : "fa-volume-high"}`} />
          </button>
        </>
      )}
    </div>
  );
}
