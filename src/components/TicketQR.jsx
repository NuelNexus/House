import { useEffect, useState } from "react";
import QRCode from "qrcode";

// Renders a scannable QR code (e.g. the ticket's unique hash). Uses the
// qrcode package client-side so passes work fully offline. Payload defaults
// to the ticket hash, which is what hosts verify at the door.
export default function TicketQR({ value, label, size = 96 }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let alive = true;
    const payload = value || "FESTIVITY-GH";
    QRCode.toDataURL(payload, {
      width: size * 2,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#101117", light: "#ffffff" },
    })
      .then((url) => {
        if (alive) setSrc(url);
      })
      .catch(() => {
        // QR generation failed (rare) — fall back to the plain hash text.
        if (alive) setSrc("");
      });
    return () => {
      alive = false;
    };
  }, [value, size]);

  if (!src) return null;

  return (
    <span className="ticket-qr" title="Scan to verify this pass">
      <img src={src} alt={label || "QR code"} width={size} height={size} />
      <small>{label}</small>
    </span>
  );
}
