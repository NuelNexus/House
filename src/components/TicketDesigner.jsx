import { useEffect, useRef, useState } from "react";
import { PRESETS } from "../lib/ticketPresets";
import DesignedTicket from "./DesignedTicket";

// The ticket generator hosts use to build their party's ticket.
// `value` is the current design object; `onChange` receives the next
// one. Renders controls on the left and a live preview on the right.
export default function TicketDesigner({ value, onChange }) {
  const fileRef = useRef(null);
  const previewRef = useRef(null);
  const [zoom, setZoom] = useState(100);

  // The ticket is designed at 680px wide. On larger preview areas it's
  // scaled up (CSS zoom, layout-aware) so the generator fills the screen
  // edge-to-edge; smaller screens keep the responsive stacked layout.
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return undefined;
    const update = () => {
      const w = el.clientWidth;
      setZoom(w > 680 ? Math.min(185, Math.round((w / 680) * 100)) : 100);
    };
    update();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const set = (key) => (e) => onChange({ ...value, [key]: e.target.value });
  const pickPreset = (id) => onChange({ ...value, preset: id });

  // Downscale + re-encode uploads so the data-URL stored in the design
  // (and copied onto every buyer's pass) stays small.
  const compressImage = (file) =>
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const MAX = 1400;
          const scale = Math.min(1, MAX / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        };
        img.onerror = () => resolve(reader.result);
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });

  const handleFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const dataUrl = await compressImage(file);
    onChange({ ...value, bg: dataUrl });
    e.target.value = "";
  };

  const urlBg =
    typeof value.bg === "string" && !value.bg.startsWith("data:") ? value.bg : "";

  const field = (label, key, opts = {}) => (
    <div className="field" key={key}>
      <label htmlFor={`td-${key}`}>{label}</label>
      <input
        id={`td-${key}`}
        className="input"
        type={opts.type || "text"}
        placeholder={opts.placeholder || ""}
        value={value[key] || ""}
        onChange={set(key)}
      />
    </div>
  );

  return (
    <div className="ticket-designer">
      <div className="designer-head">
        <h3>
          <i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true" />{" "}
          Ticket generator
        </h3>
        <p>
          Pick a style, drop in a photo, edit every line. Buyers get this exact
          ticket with their own name and a unique hash — and every sale lands
          in your host log.
        </p>
      </div>

      <div className="designer-grid">
        <div className="designer-controls">
          <div className="field">
            <label>Style</label>
            <div className="preset-grid">
              {PRESETS.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  className={`preset-card ${value.preset === p.id ? "active" : ""}`}
                  onClick={() => pickPreset(p.id)}
                  aria-pressed={value.preset === p.id}
                >
                  <span className={`preset-swatch sw-${p.id}`}>
                    <i className={`fa-solid ${p.icon}`} aria-hidden="true" />
                  </span>
                  <b>{p.label}</b>
                  <small>{p.description}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="designer-fields">
            {field("Event name", "name", { placeholder: "e.g. The Mansion Rave" })}
            {field("Tagline", "tagline", { placeholder: "e.g. First Class · Admission" })}
            <div className="field-row">
              {field("From", "depart", { placeholder: "e.g. Osu, Accra" })}
              {field("To / Venue", "arrive", { placeholder: "e.g. Main Gate" })}
            </div>
            <div className="field-row">
              {field("Entry / Gate", "gate", { placeholder: "e.g. Platform 9¾" })}
              {field("Section / Seat", "section", { placeholder: "e.g. GA" })}
            </div>
            <div className="field-row">
              {field("Date", "date", { placeholder: "e.g. Sat, Dec 20 · 7 PM" })}
              {field("Time", "time", { placeholder: "e.g. 7:00 PM" })}
            </div>
            <div className="field-row">
              {field("Door price (GH₵)", "price", { type: "number", placeholder: "0 = free" })}
              {field("Tickets available", "stock", { type: "number", placeholder: "100" })}
            </div>
            <div className="field">
              <label>Promo code (optional)</label>
              <div className="field-row">
                <div style={{ flex: 1.4 }}>
                  <input
                    className="input"
                    placeholder="e.g. EARLY10"
                    value={value.promo?.code || ""}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        promo: {
                          code: e.target.value.trim().toUpperCase(),
                          pct: Number(value.promo?.pct) || 0,
                        },
                      })
                    }
                    aria-label="Promo code"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    max="100"
                    placeholder="% off"
                    value={value.promo?.pct || ""}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        promo: {
                          code: (value.promo?.code || "").trim().toUpperCase(),
                          pct: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                        },
                      })
                    }
                    aria-label="Promo discount percent"
                  />
                </div>
                {(value.promo?.code || value.promo?.pct) && (
                  <button
                    type="button"
                    className="bg-clear"
                    onClick={() => onChange({ ...value, promo: null })}
                  >
                    <i className="fa-solid fa-xmark" aria-hidden="true" /> Remove
                  </button>
                )}
              </div>
              <small className="designer-field-hint">
                Buyers type this code at checkout for the discount — e.g.
                EARLY10 = 10% off.
              </small>
            </div>
            <div className="field">
              <label htmlFor="td-footnote">Fine print</label>
              <textarea
                id="td-footnote"
                className="input"
                rows="2"
                value={value.footnote || ""}
                onChange={set("footnote")}
              />
            </div>
            <div className="field">
              <label>Background image</label>
              <div className="bg-controls">
                <input
                  className="input"
                  placeholder="Paste an image URL…"
                  value={urlBg}
                  onChange={set("bg")}
                  aria-label="Background image URL"
                />
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={() => fileRef.current && fileRef.current.click()}
                >
                  <i className="fa-solid fa-image" aria-hidden="true" /> Upload
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={handleFile}
                />
                {value.bg && (
                  <button
                    type="button"
                    className="bg-clear"
                    onClick={() => onChange({ ...value, bg: null })}
                  >
                    <i className="fa-solid fa-xmark" aria-hidden="true" /> Remove
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="designer-preview" ref={previewRef}>
          <div className="section-label" style={{ marginTop: 0 }}>
            Live preview
          </div>
          <div style={{ zoom: `${zoom}%` }}>
            <DesignedTicket
              design={value}
              passenger="You"
              code="FST-2026-0001"
              hash="A1B2-C3D4-E5F6-A7B8"
              price={value.price}
            />
          </div>
          <p className="designer-hint">
            Every buyer's ticket carries their own name, pass code and a unique
            security hash at the bottom.
          </p>
        </div>
      </div>
    </div>
  );
}
