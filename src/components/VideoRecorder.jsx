import { useEffect, useRef, useState } from "react";

const MAX_SECONDS = 30;

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

// Snapchat-style: tap record, camera opens and records straight away,
// stop at 30s (or tap to stop), then caption + post/send. Also accepts
// an existing video file as a fallback for devices without a camera.
export default function VideoRecorder({
  sendToName,
  onDone, // ({ blob, name, caption }) => Promise
  onCancel,
}) {
  const [mode, setMode] = useState("record"); // record | upload
  const [phase, setPhase] = useState("idle"); // idle | recording | preview
  const [error, setError] = useState(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [hasFile, setHasFile] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const fileRef = useRef(null);
  const previewUrlRef = useRef(null);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    return () => {
      stopStream();
      window.clearInterval(timerRef.current);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const switchMode = (m) => {
    if (m === mode) return;
    setMode(m);
    setError(null);
    resetCapture();
  };

  const resetCapture = () => {
    stopStream();
    window.clearInterval(timerRef.current);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
      videoRef.current.removeAttribute("src");
      videoRef.current.controls = false;
    }
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    chunksRef.current = [];
    setElapsed(0);
    setHasFile(false);
    setPhase("idle");
  };

  const startRecording = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Recording isn't supported here — use the Upload tab instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: true,
      });
      streamRef.current = stream;
      chunksRef.current = [];
      const mime = pickMimeType();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: rec.mimeType || "video/webm",
        });
        if (videoRef.current) {
          videoRef.current.srcObject = null;
          const url = URL.createObjectURL(blob);
          if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
          previewUrlRef.current = url;
          videoRef.current.src = url;
          videoRef.current.controls = true;
        }
        fileRef.current = blob;
        setHasFile(true);
        setPhase("preview");
      };
      recorderRef.current = rec;
      rec.start();
      // Show a live mirror while recording.
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.controls = false;
        videoRef.current.play().catch(() => {});
      }
      setPhase("recording");
      let s = 0;
      window.clearInterval(timerRef.current);
      timerRef.current = window.setInterval(() => {
        s += 1;
        setElapsed(s);
        if (s >= MAX_SECONDS) stopRecording();
      }, 1000);
    } catch (err) {
      setError("Camera unavailable — allow camera access or use the Upload tab.");
    }
  };

  const stopRecording = () => {
    window.clearInterval(timerRef.current);
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    stopStream();
  };

  const onPickFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setError("That file isn't a video.");
      return;
    }
    setError(null);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      const url = URL.createObjectURL(file);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = url;
      videoRef.current.src = url;
      videoRef.current.controls = true;
    }
    fileRef.current = file;
    setHasFile(true);
    setPhase("preview");
  };

  const submit = async () => {
    if (!hasFile || !fileRef.current || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onDone({
        blob: fileRef.current,
        name: fileRef.current.name || `hype-${Date.now()}.webm`,
        caption,
      });
    } catch (err) {
      setError(err.message || "Upload failed. Is the hype storage bucket set up?");
      setBusy(false);
    }
  };

  return (
    <div className="recorder">
      <div className="rec-tabs">
        <button
          className={mode === "record" ? "active" : ""}
          onClick={() => switchMode("record")}
        >
          <i className="fa-solid fa-video" /> Record
        </button>
        <button
          className={mode === "upload" ? "active" : ""}
          onClick={() => switchMode("upload")}
        >
          <i className="fa-solid fa-upload" /> Upload
        </button>
      </div>

      <div className="rec-stage">
        <video ref={videoRef} muted playsInline />

        {phase === "idle" && (
          <div className="rec-placeholder">
            <i className="fa-solid fa-fire" />
            {mode === "record" ? (
              <>
                <p>Camera preview</p>
                <button className="btn btn-sm" onClick={startRecording}>
                  <i className="fa-solid fa-circle-dot" /> Start recording
                </button>
              </>
            ) : (
              <>
                <p>Pick a video from your device</p>
                <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>
                  <i className="fa-solid fa-folder-open" /> Choose video
                </button>
              </>
            )}
          </div>
        )}

        {phase === "recording" && (
          <>
            <div className="rec-timer">
              <i className="fa-solid fa-circle" /> {String(MAX_SECONDS - elapsed).padStart(2, "0")}
            </div>
            <button
              className="rec-stop"
              aria-label="Stop recording"
              onClick={stopRecording}
            />
          </>
        )}

        {phase === "preview" && (
          <>
            <div className="rec-done">
              <i className="fa-solid fa-check" /> Ready to go
            </div>
            {mode === "upload" && (
              <button className="rec-rechoose" onClick={() => fileRef.current?.click()}>
                <i className="fa-solid fa-rotate" /> Choose another
              </button>
            )}
          </>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => onPickFile(e.target.files?.[0])}
      />

      {error && <p className="rec-error">{error}</p>}

      {sendToName && (
        <p className="rec-sendto">
          <i className="fa-solid fa-paper-plane" /> Sending to{" "}
          <b>{sendToName}</b> — a 2-way hype keeps your streak alive.
        </p>
      )}

      {phase === "preview" && (
        <>
          <div className="field">
            <label htmlFor="hype-caption">Caption (optional)</label>
            <textarea
              id="hype-caption"
              className="input"
              maxLength={140}
              placeholder="Say something to the scene…"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
          </div>
          <div className="rec-actions">
            <button className="btn btn-outline" onClick={resetCapture} disabled={busy}>
              Retake
            </button>
            <button className="btn" onClick={submit} disabled={busy || !hasFile}>
              {busy ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin" /> Uploading…
                </>
              ) : sendToName ? (
                <>
                  <i className="fa-solid fa-fire" /> Send hype
                </>
              ) : (
                <>
                  <i className="fa-solid fa-fire" /> Post hype
                </>
              )}
            </button>
          </div>
        </>
      )}

      <button className="rec-cancel" onClick={onCancel}>
        <i className="fa-solid fa-xmark" /> Cancel
      </button>
    </div>
  );
}
