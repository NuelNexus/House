import { useRef, useState } from "react";
import { useTheme, PRESETS, PATTERNS } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";

const MAX_IMAGE_BYTES = 1_500_000; // ~1.5MB data-URL cap after compression

export default function Appearance() {
  const { theme, setMode, setPreset, setAccent, setBackground, resetTheme } =
    useTheme();
  const { user } = useAuth();
  const fileRef = useRef(null);
  const [imageError, setImageError] = useState(null);

  const { mode, preset, accent, background } = theme;
  const bgKind = background.kind;

  // Compress uploaded images on a canvas so they stay inside
  // localStorage's budget while still looking sharp full-screen.
  const onPickImage = (file) => {
    setImageError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setImageError("That file isn't an image.");
      return;
    }
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1600 / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
      if (dataUrl.length > MAX_IMAGE_BYTES) {
        setImageError("Image too large — try a smaller picture.");
        return;
      }
      setBackground({ kind: "image", value: dataUrl });
    };
    img.onerror = () => setImageError("Couldn't read that image.");
    img.src = URL.createObjectURL(file);
  };

  return (
    <div className="page">
      <header className="page-head reveal in">
        <div className="kicker">06 · Make it yours</div>
        <h1>
          Appearance<span className="outline">.</span>
        </h1>
        <p className="lede">
          Pick a look for the whole site — dark or light, a color preset,
          and a background pattern or your own image.
          {user && " Your choice syncs to your account."}
        </p>
      </header>

      <div className="appearance-wrap">
        {/* Light / dark */}
        <section className="app-sec">
          <h2>Mode</h2>
          <div className="mode-switch">
            <button
              className={mode === "light" ? "active" : ""}
              onClick={() => setMode("light")}
            >
              <i className="fa-solid fa-sun" /> Light
            </button>
            <button
              className={mode === "dark" ? "active" : ""}
              onClick={() => setMode("dark")}
            >
              <i className="fa-solid fa-moon" /> Dark
            </button>
          </div>
        </section>

        {/* Presets */}
        <section className="app-sec">
          <h2>Presets</h2>
          <div className="preset-grid">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                className={`preset-card ${preset === p.id ? "on" : ""}`}
                onClick={() => setPreset(p.id)}
              >
                <span
                  className="preset-swatch"
                  style={{
                    background: p.swatch,
                    boxShadow: p.accent
                      ? `inset 0 -22px 0 ${p.accent}`
                      : "inset 0 -22px 0 rgba(0,0,0,0.18)",
                  }}
                />
                <b>{p.name}</b>
                <small>{p.desc}</small>
              </button>
            ))}
          </div>
        </section>

        {/* Custom accent */}
        <section className="app-sec">
          <h2>Accent colour</h2>
          <div className="accent-row">
            <input
              type="color"
              value={accent || (mode === "dark" ? "#e07a9e" : "#a04646")}
              aria-label="Custom accent colour"
              onChange={(e) => setAccent(e.target.value)}
            />
            <button className="btn btn-sm btn-outline" onClick={() => setAccent(null)}>
              Use preset accent
            </button>
            <span className="accent-hint">
              Overrides the pink on buttons, links and highlights.
            </span>
          </div>
        </section>

        {/* Background */}
        <section className="app-sec">
          <h2>Background</h2>

          <div className="pattern-grid">
            {PATTERNS.map((p) => (
              <button
                key={p.id}
                className={`pattern-tile ${bgKind === "pattern" && background.value === p.id ? "on" : ""} ${bgKind === "none" && p.id === "none" ? "on" : ""}`}
                title={p.name}
                aria-label={p.name}
                onClick={() =>
                  setBackground({ kind: p.id === "none" ? "none" : "pattern", value: p.id })
                }
              >
                <i className={p.icon} />
              </button>
            ))}
          </div>

          <div className="bg-upload">
            <div
              className={`bg-preview ${bgKind === "image" ? "has-img" : ""}`}
              style={
                bgKind === "image"
                  ? { backgroundImage: `url("${background.value}")` }
                  : undefined
              }
            >
              {bgKind === "image" ? (
                <button
                  className="bg-remove"
                  onClick={() => setBackground({ kind: "none", value: null })}
                >
                  <i className="fa-solid fa-xmark" /> Remove image
                </button>
              ) : (
                <span>
                  <i className="fa-regular fa-image" /> Custom image preview
                </span>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => onPickImage(e.target.files?.[0])}
            />
            <div className="bg-actions">
              <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>
                <i className="fa-solid fa-upload" /> Upload a background image
              </button>
              <button
                className="btn btn-sm btn-outline"
                onClick={() => setBackground({ kind: "none", value: null })}
              >
                No background
              </button>
            </div>
            {imageError && <p className="app-error">{imageError}</p>}
            <p className="app-note">
              Patterns are pure CSS (no downloads). Uploaded images are stored
              on this device (and synced to your account) so they work anywhere
              you're signed in.
            </p>
          </div>
        </section>

        <section className="app-sec">
          <button className="btn btn-outline" onClick={resetTheme}>
            <i className="fa-solid fa-rotate-left" /> Reset to default
          </button>
        </section>
      </div>
    </div>
  );
}
