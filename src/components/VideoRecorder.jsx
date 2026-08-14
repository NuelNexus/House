import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  OVERLAYS,
  DEFAULT_OVERLAY,
  loadSpriteImages,
  overlaySpriteRect,
  drawOverlays,
  mapIntrinsicToStage,
  createFaceTracker,
} from "../lib/hypeFilters";

const MAX_SECONDS = 30;

const STICKERS = ["😎", "🎉", "🔥", "👑", "💖", "🤩", "🥂", "🎤", "💃", "🕶️", "⭐", "🍾"];

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  return (
    [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ].find((m) => MediaRecorder.isTypeSupported(m)) || null
  );
}

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

// Full-screen Snapchat-style camera. Tap the shutter for a snap
// (photo), hold it for a video; switch modes with the Snap/Video
// toggle. Live filters on the right rail, stickers on the left,
// flash / timer / grid up top, gallery upload bottom-left.
export default function VideoRecorder({
  sendToName,
  onDone, // ({ blob, name, caption, kind }) => Promise
  onCancel,
}) {
  const [mode, setMode] = useState("snap"); // snap | video
  const [phase, setPhase] = useState("camera"); // camera | recording | preview | denied
  const [facing, setFacing] = useState("user"); // user | environment
  const [filterIdx, setFilterIdx] = useState(0);
  const [flashOn, setFlashOn] = useState(false);
  const [flashFx, setFlashFx] = useState(false);
  const [timer, setTimer] = useState(0); // 0 | 3 | 10
  const [countdown, setCountdown] = useState(0);
  const [gridOn, setGridOn] = useState(false);
  const [lensOpen, setLensOpen] = useState(false);
  const [stickers, setStickers] = useState([]);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [isImage, setIsImage] = useState(false);
  // Clips go to the public Hype feed by default; users can turn that
  // off in their profile (then this box starts unchecked).
  const { hypeByDefault } = useAuth();
  const [publish, setPublish] = useState(!!hypeByDefault);

  const videoRef = useRef(null);
  const stageRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const fileRef = useRef(null);
  const previewUrlRef = useRef(null);
  const holdRef = useRef(null);
  const countdownRef = useRef(null);
  const stickersRef = useRef(stickers);
  // Overlay filters (hat, glasses, doggy...) replace the old CSS color
  // filters: real sprites tracked onto the face live, and baked into
  // both photos and recorded videos.
  const overlay = OVERLAYS[filterIdx] || DEFAULT_OVERLAY;
  const overlayRef = useRef(overlay);
  const faceBoxRef = useRef(null); // latest tracked face box (intrinsic px)
  const trackerRef = useRef(null); // face tracker instance
  const overlayLayerRef = useRef(null); // live sprite layer in the stage

  // Keep the sticker mirror fresh without writing refs during render.
  useEffect(() => {
    stickersRef.current = stickers;
  }, [stickers]);

  // Keep the active overlay in a ref so the photo/video bakes always use
  // the same filter the preview is showing, even mid-recording.
  useEffect(() => {
    overlayRef.current = overlay;
  }, [overlay]);

  // Preload the filter sprites once so overlays render instantly.
  useEffect(() => {
    loadSpriteImages();
  }, []);

  // Face tracking: live while the camera is on screen. A captured snap's
  // preview already has the overlay baked in, so tracking stops there.
  useEffect(() => {
    if (phase === "camera" || phase === "recording") {
      if (!trackerRef.current) trackerRef.current = createFaceTracker();
      trackerRef.current.start(videoRef.current, (fb) => {
        faceBoxRef.current = fb;
      });
      return () => trackerRef.current?.stop();
    }
    faceBoxRef.current = null;
    return undefined;
  }, [phase]);

  // Build the sprite <img>s for the active overlay (imperatively — they
  // get repositioned every frame without re-rendering React).
  useEffect(() => {
    const layer = overlayLayerRef.current;
    if (!layer) return;
    layer.innerHTML = "";
    if (overlay.id === "original" || (phase !== "camera" && phase !== "recording")) {
      return;
    }
    for (const key of overlay.sprites) {
      const img = document.createElement("img");
      img.className = "snap-overlay-sprite";
      img.alt = "";
      img.dataset.sprite = key;
      layer.appendChild(img);
    }
  }, [overlay, phase]);

  // Position the overlay sprites on the live video every frame, mapping
  // the tracked face box from the video's intrinsic pixels onto the
  // stage (which shows the video with object-fit: cover).
  useEffect(() => {
    if (overlay.id === "original" || (phase !== "camera" && phase !== "recording")) {
      return undefined;
    }
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const layer = overlayLayerRef.current;
      const v = videoRef.current;
      const stage = stageRef.current;
      if (!layer || !v || !v.videoWidth || !stage) return;
      const imgs = layer.querySelectorAll("img");
      if (!imgs.length) return;
      const fb = faceBoxRef.current;
      if (!fb) {
        for (const img of imgs) img.style.display = "none";
        return;
      }
      const t = performance.now();
      const vw = v.videoWidth;
      const vh = v.videoHeight;
      const sw = stage.clientWidth;
      const sh = stage.clientHeight;
      for (const img of imgs) {
        const hit = overlaySpriteRect(overlay, img.dataset.sprite, fb, t);
        if (!hit) {
          img.style.display = "none";
          continue;
        }
        const s = mapIntrinsicToStage(hit.rect, vw, vh, sw, sh);
        if (!s) continue;
        img.style.display = "block";
        img.src = hit.src;
        img.style.left = `${s.left}px`;
        img.style.top = `${s.top}px`;
        img.style.width = `${s.w}px`;
        img.style.height = `${s.h}px`;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [overlay, phase]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const cleanup = useCallback(() => {
    stopStream();
    window.clearInterval(timerRef.current);
    window.clearTimeout(holdRef.current);
    window.clearInterval(countdownRef.current);
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
  }, [stopStream]);

  useEffect(() => cleanup, [cleanup]);

  // Live viewfinder opens the moment the camera appears — like Snapchat.
  const openCamera = useCallback(async () => {
    setError(null);
    // Never open a second stream while an old one is still live (e.g.
    // after a photo Retake — photos don't stop the camera).
    stopStream();
    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase("denied");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: true,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        v.muted = true;
        v.controls = false;
        v.play().catch(() => {});
      }
      setPhase("camera");
    } catch {
      setPhase("denied");
      setError("Camera unavailable — allow camera access or upload from your gallery.");
    }
  }, [facing]);

  useEffect(() => {
    openCamera();
    return () => window.clearInterval(countdownRef.current);
  }, [openCamera]);

  const flip = () => {
    if (phase === "recording") return;
    stopStream();
    setFacing((f) => (f === "user" ? "environment" : "user"));
  };

  // ------------------------------------------------------------
  // Capture
  // ------------------------------------------------------------
  const doCapturePhoto = () => {
    // Never fire a snap while a hold-recording is already going.
    if (recorderRef.current && recorderRef.current.state === "recording") return;
    const v = videoRef.current;
    if (!v || !v.videoWidth) {
      setError("Camera isn't ready yet — give it a second.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    // Bake the active overlay filter onto the face (the same tracked
    // position the preview shows), then stickers on top.
    drawOverlays(ctx, overlayRef.current, faceBoxRef.current, Date.now());
    // Bake stickers into the photo (positioned by % of the frame).
    stickersRef.current.forEach((s) => {
      ctx.font = `${Math.round(canvas.height * 0.16)}px "Segoe UI Emoji", "Noto Color Emoji", serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(s.emoji, (s.x / 100) * canvas.width, (s.y / 100) * canvas.height);
    });
    if (flashOn) {
      setFlashFx(true);
      window.setTimeout(() => setFlashFx(false), 200);
    }
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = URL.createObjectURL(blob);
        fileRef.current = blob;
        setIsImage(true);
        setPhase("preview");
      },
      "image/jpeg",
      0.92
    );
  };

  const capturePhoto = () => {
    if (timer > 0) {
      let n = timer;
      setCountdown(n);
      window.clearInterval(countdownRef.current);
      countdownRef.current = window.setInterval(() => {
        n -= 1;
        if (n <= 0) {
          window.clearInterval(countdownRef.current);
          setCountdown(0);
          doCapturePhoto();
        } else {
          setCountdown(n);
        }
      }, 1000);
      return;
    }
    doCapturePhoto();
  };

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream || typeof MediaRecorder === "undefined") {
      setError("Recording isn't supported here — take a snap or upload instead.");
      return;
    }
    setError(null);
    chunksRef.current = [];
    const mime = pickMimeType();

    // Record through a canvas so the overlay filter is baked into the
    // clip: every frame the live video + tracked overlay are redrawn
    // onto an offscreen canvas, and that canvas stream is what gets
    // recorded (with the camera's audio track attached).
    const v = videoRef.current;
    const bw = v?.videoWidth || 1280;
    const bh = v?.videoHeight || 720;
    const bake = document.createElement("canvas");
    bake.width = bw;
    bake.height = bh;
    const bctx = bake.getContext("2d");
    let bakeRaf = 0;
    const drawBake = () => {
      bakeRaf = requestAnimationFrame(drawBake);
      if (v?.videoWidth) bctx.drawImage(v, 0, 0, bw, bh);
      drawOverlays(bctx, overlayRef.current, faceBoxRef.current, Date.now());
    };
    drawBake();
    const outStream = bake.captureStream(30);
    const audio = stream.getAudioTracks()[0];
    if (audio) outStream.addTrack(audio);

    const rec = new MediaRecorder(outStream, mime ? { mimeType: mime } : undefined);
    rec.ondataavailable = (e) => {
      if (e.data.size) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      cancelAnimationFrame(bakeRaf);
      const blob = new Blob(chunksRef.current, {
        type: rec.mimeType || "video/webm",
      });
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = URL.createObjectURL(blob);
      fileRef.current = blob;
      setIsImage(false);
      stopStream();
      const v = videoRef.current;
      if (v) {
        v.srcObject = null;
        v.src = previewUrlRef.current;
        v.muted = true;
        v.controls = true;
        v.play().catch(() => {});
      }
      setPhase("preview");
    };
    recorderRef.current = rec;
    rec.start();
    setPhase("recording");
    let s = 0;
    window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      s += 1;
      setElapsed(s);
      if (s >= MAX_SECONDS) stopRecording();
    }, 1000);
  };

  const stopRecording = () => {
    window.clearInterval(timerRef.current);
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  };

  // Snap mode: tap = photo, press-and-hold = video. The pointer is
  // captured so releasing off the button still ends the recording.
  const onShutterDown = (e) => {
    if (mode !== "snap" || phase !== "camera" || countdown > 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* pointer capture unsupported — pointerup still lands here */
    }
    window.clearTimeout(holdRef.current);
    holdRef.current = window.setTimeout(() => {
      startRecording();
    }, 450);
  };

  const onShutterUp = () => {
    window.clearTimeout(holdRef.current);
    if (mode === "video") return;
    if (phase === "recording") {
      stopRecording();
    } else if (phase === "camera") {
      capturePhoto();
    }
  };

  const onShutterTap = () => {
    if (mode !== "video") return;
    if (phase === "recording") stopRecording();
    else if (phase === "camera") startRecording();
  };

  // ------------------------------------------------------------
  // Gallery upload (bottom-left "Memories")
  // ------------------------------------------------------------
  const onPickFile = (file) => {
    if (!file) return;
    const isImg = file.type.startsWith("image/");
    if (!isImg && !file.type.startsWith("video/")) {
      setError("Pick an image or a video.");
      return;
    }
    setError(null);
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = URL.createObjectURL(file);
    fileRef.current = file;
    setIsImage(isImg);
    stopStream();
    setPhase("preview");
  };

  const reset = () => {
    setCaption("");
    setStickers([]);
    setError(null);
    setBusy(false);
    setPhase("camera");
    openCamera();
  };

  const submit = async () => {
    if (!fileRef.current || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onDone({
        blob: fileRef.current,
        name: isImage
          ? `hype-${Date.now()}.jpg`
          : fileRef.current.name || `hype-${Date.now()}.webm`,
        caption,
        kind: isImage ? "image" : "video",
        // Private sends always go through; public posts respect the box.
        published: sendToName ? true : publish,
      });
    } catch (err) {
      setError(err.message || "Upload failed. Is the hype storage bucket set up?");
      setBusy(false);
    }
  };

  const toggleTimer = () => setTimer((t) => (t === 0 ? 3 : t === 3 ? 10 : 0));

  const addSticker = (emoji) => {
    setStickers((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, emoji, x: 50, y: 42 }]);
    setLensOpen(false);
  };

  const moveSticker = (id, x, y) => {
    setStickers((prev) =>
      prev.map((s) => (s.id === id ? { ...s, x: clamp(x), y: clamp(y, 5, 95) } : s))
    );
  };

  // ------------------------------------------------------------
  // Render
  // ------------------------------------------------------------
  const camClassName = `snap-cam snap-mode-${mode}${phase === "recording" ? " is-recording" : ""}`;

  return (
    <div className={camClassName}>
      <div className="snap-stage" ref={stageRef}>
        {/* Live viewfinder */}
        <video
          ref={videoRef}
          className="snap-video"
          muted
          playsInline
          autoPlay
        />

        {/* Tracked overlay filters — sprites positioned over the face
            every frame (imperative, so tracking stays smooth). */}
        <div className="snap-overlay-layer" ref={overlayLayerRef} />

        {/* Grid overlay */}
        {gridOn && phase === "camera" && <div className="snap-grid" aria-hidden="true" />}

        {/* Countdown */}
        {countdown > 0 && <div className="snap-countdown">{countdown}</div>}

        {/* Flash effect */}
        {flashFx && <div className="snap-flash-fx" aria-hidden="true" />}

        {/* Placed stickers (draggable) */}
        {phase === "camera" &&
          stickers.map((s) => (
            <button
              key={s.id}
              className="snap-sticker"
              style={{ left: `${s.x}%`, top: `${s.y}%` }}
              onPointerDown={(e) => {
                e.preventDefault();
                const rect = stageRef.current.getBoundingClientRect();
                const startX = e.clientX;
                const startY = e.clientY;
                const sx = s.x;
                const sy = s.y;
                let moved = 0;
                const move = (ev) => {
                  const dx = ((ev.clientX - startX) / rect.width) * 100;
                  const dy = ((ev.clientY - startY) / rect.height) * 100;
                  moved = Math.max(
                    moved,
                    Math.hypot(ev.clientX - startX, ev.clientY - startY)
                  );
                  moveSticker(s.id, sx + dx, sy + dy);
                };
                const up = () => {
                  window.removeEventListener("pointermove", move);
                  window.removeEventListener("pointerup", up);
                  // A tap (no drag) removes the sticker; a drag keeps it.
                  if (moved < 6) {
                    setStickers((prev) => prev.filter((x) => x.id !== s.id));
                  }
                };
                window.addEventListener("pointermove", move);
                window.addEventListener("pointerup", up);
              }}
              aria-label={`${s.emoji} sticker — tap to remove, drag to move`}
            >
              {s.emoji}
            </button>
          ))}

        {/* Recording timer */}
        {phase === "recording" && (
          <div className="snap-rec-timer">
            <span className="dot" /> 0:{String(elapsed).padStart(2, "0")}
          </div>
        )}
      </div>

      {/* Top bar — back (left), timer + grid (right) */}
      <div className="snap-top">
        <button className="snap-top-btn" onClick={onCancel} aria-label="Close camera">
          <i className="fa-solid fa-arrow-left" />
        </button>
        <div className="snap-top-right">
          <button
            className={`snap-top-btn${timer > 0 ? " active" : ""}`}
            onClick={toggleTimer}
            aria-label="Timer"
          >
            <i className="fa-regular fa-clock" />
            {timer > 0 && <span className="snap-badge">{timer}</span>}
          </button>
          <button
            className={`snap-top-btn${gridOn ? " active" : ""}`}
            onClick={() => setGridOn((g) => !g)}
            aria-label="Grid"
          >
            <i className="fa-solid fa-grip-lines" />
          </button>
        </div>
      </div>

      {/* Right rail — flash + flip, then the filter tray */}
      <div className="snap-right">
        <button
          className={`snap-top-btn${flashOn ? " active" : ""}`}
          onClick={() => setFlashOn((f) => !f)}
          aria-label="Flash"
          title="Flash"
        >
          <i className={`fa-solid ${flashOn ? "fa-bolt" : "fa-bolt-slash"}`} />
        </button>
        <button className="snap-top-btn" onClick={flip} aria-label="Flip camera" title="Flip">
          <i className="fa-solid fa-rotate" />
        </button>
      </div>

      {/* Filter tray (Snapchat's right-edge swatches) */}
      <div className="snap-filter-rail" aria-label="Filters">
        {OVERLAYS.map((o, i) => (
          <button
            key={o.id}
            className={`snap-swatch${i === filterIdx ? " active" : ""}`}
            style={
              o.thumb
                ? {
                    backgroundImage: `url(${o.thumb})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }
                : { background: "rgba(255,255,255,0.28)" }
            }
            onClick={() => setFilterIdx(i)}
            aria-label={o.label}
            title={o.label}
          >
            <span />
          </button>
        ))}
      </div>

      {/* Left rail — lenses/stickers */}
      <div className="snap-left">
        <button
          className={`snap-top-btn${lensOpen ? " active" : ""}`}
          onClick={() => setLensOpen((o) => !o)}
          aria-label="Lenses"
          title="Lenses"
        >
          <i className="fa-solid fa-face-smile" />
        </button>
      </div>
      {lensOpen && (
        <div className="snap-lens-tray">
          {STICKERS.map((st) => (
            <button key={st} className="snap-lens-sticker" onClick={() => addSticker(st)}>
              {st}
            </button>
          ))}
        </div>
      )}

      {/* Bottom bar — memories, shutter, mode */}
      <div className="snap-bottom">
        <button
          className="snap-memories"
          onClick={() => fileRef.current?.click()}
          aria-label="Upload from gallery"
        >
          <i className="fa-solid fa-images" />
        </button>

        <button
          className="snap-shutter"
          aria-label={mode === "video" ? "Start or stop video" : "Take a snap"}
          onPointerDown={onShutterDown}
          onPointerUp={onShutterUp}
          onPointerCancel={onShutterUp}
          onClick={onShutterTap}
        >
          <span />
        </button>

        <div className="snap-mode">
          <button className={mode === "snap" ? "active" : ""} onClick={() => setMode("snap")}>
            Snap
          </button>
          <button className={mode === "video" ? "active" : ""} onClick={() => setMode("video")}>
            Video
          </button>
        </div>
      </div>

      {/* Camera-unavailable fallback */}
      {phase === "denied" && (
        <div className="snap-denied">
          <div className="snap-denied-card">
            <i className="fa-solid fa-video-slash" />
            <h3>Camera unavailable</h3>
            <p>{error}</p>
            <div className="snap-denied-actions">
              <button className="btn btn-sm" onClick={openCamera}>
                <i className="fa-solid fa-rotate icon" /> Try again
              </button>
              <button
                className="btn btn-sm btn-outline"
                onClick={() => fileRef.current?.click()}
              >
                <i className="fa-solid fa-images icon" /> Upload
              </button>
            </div>
            <button className="snap-denied-back" onClick={onCancel}>
              <i className="fa-solid fa-xmark" /> Back
            </button>
          </div>
        </div>
      )}

      {/* Preview + caption + post */}
      {phase === "preview" && (
        <div className="snap-preview">
          {isImage ? (
            <img src={previewUrlRef.current} alt="Your snap" />
          ) : (
            <video src={previewUrlRef.current} controls autoPlay muted loop playsInline />
          )}

          <div className="snap-preview-ui">
            {sendToName && (
              <p className="snap-sendto">
                <i className="fa-solid fa-paper-plane" /> Sending to <b>{sendToName}</b>
              </p>
            )}
            <input
              className="snap-caption"
              maxLength={220}
              placeholder={
                isImage
                  ? "Add a caption… #hashtags boost your hype"
                  : "Add a caption… #hashtags boost your hype"
              }
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              aria-label="Caption"
            />
            {!sendToName && (
              <label className="snap-publish">
                <input
                  type="checkbox"
                  checked={publish}
                  onChange={(e) => setPublish(e.target.checked)}
                />
                <span>
                  Post to the Hype feed
                  <small>Off = profile-only clip</small>
                </span>
              </label>
            )}
            {error && <p className="snap-error">{error}</p>}
            <div className="snap-preview-actions">
              <button className="snap-preview-btn ghost" onClick={reset} disabled={busy}>
                <i className="fa-solid fa-rotate-left" /> Retake
              </button>
              <button
                className="snap-preview-btn send"
                onClick={submit}
                disabled={busy || !fileRef.current}
              >
                {busy ? (
                  <i className="fa-solid fa-spinner fa-spin" />
                ) : sendToName ? (
                  <>
                    Send <i className="fa-solid fa-fire" />
                  </>
                ) : (
                  <>
                    Post <i className="fa-solid fa-fire" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        hidden
        onChange={(e) => onPickFile(e.target.files?.[0])}
      />
    </div>
  );
}
