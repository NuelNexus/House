// ============================================================
// Paystack — checkout + affiliate fee payments (GHS)
//
// The public key is safe to ship in the client (it's meant to be
// public); the SECRET key must never reach the browser — it lives
// in the Netlify env (PAYSTACK_SECRET_KEY) and powers the
// /api/paystack/verify endpoint. Until the secret key is set, the
// app completes checkout on Paystack's popup callback.
//
// Override the key per-deploy with VITE_PAYSTACK_PUBLIC_KEY.
// ============================================================

export const PAYSTACK_PUBLIC_KEY =
  import.meta.env.VITE_PAYSTACK_PUBLIC_KEY ||
  "pk_live_4dd8b9df2f265b83e2dda191062e4233278a74fe";

let scriptPromise = null;

// Load Paystack's inline popup script once and cache the promise.
export function loadPaystack() {
  if (window.PaystackPop) return Promise.resolve(window.PaystackPop);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://js.paystack.co/v1/inline.js";
      s.onload = () => resolve(window.PaystackPop);
      s.onerror = () => reject(new Error("Couldn't load Paystack — check your connection."));
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

// Open the Paystack popup for a charge.
//   amount   — in GH₵ (cedis); Paystack wants pesewas (×100) internally
//   email    — payer's email (required by Paystack)
//   label    — what's being paid for, shown on the payment page
// Resolves with the transaction reference on success, rejects if the
// user closes the popup without paying.
export function payWithPaystack({ email, amount, label, meta }) {
  return loadPaystack().then((PaystackPop) => {
    return new Promise((resolve, reject) => {
      const ref = `FESGH-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const handler = PaystackPop.setup({
        key: PAYSTACK_PUBLIC_KEY,
        email,
        amount: Math.max(1, Math.round(Number(amount) * 100)),
        currency: "GHS",
        ref,
        metadata: {
          ...(meta || {}),
          custom_fields: [
            { display_name: "Item", variable_name: "item", value: label || "FesGH purchase" },
          ],
        },
        callback: (response) => resolve(response.reference),
        onClose: () => reject(new Error("Payment window closed — nothing was charged.")),
      });
      handler.openIframe();
    });
  });
}

// Server-side verification hook. Once PAYSTACK_SECRET_KEY is set in
// Netlify env, this confirms the charge actually settled. Without the
// secret key it reports not-configured and the client trusts the
// popup callback (current behaviour).
export async function verifyPaystack(reference) {
  try {
    const res = await fetch(
      `/api/paystack/verify?reference=${encodeURIComponent(reference)}`
    );
    const json = await res.json();
    return json;
  } catch {
    return { verified: false, reason: "verify-unavailable" };
  }
}

// True when verification genuinely failed — as opposed to the harmless
// "secret key not set yet" state where the popup callback is trusted.
export function isFailedVerification(verified) {
  return (
    verified &&
    verified.verified === false &&
    verified.reason &&
    !/not set|MISSING|unavailable|missing reference/.test(verified.reason)
  );
}
