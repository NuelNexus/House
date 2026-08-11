// ============================================================
// FesGH — Paystack auto-payouts
//
// POST /api/paystack/payout  { "reference": "…", "role"?: "host" }
//
// Called right after a verified ticket charge: splits the sale to
// the host's and affiliate's mobile-money numbers (platform keeps
// its 30% in the FesGH balance). Idempotent — a purchase is paid
// once per role, retries are safe.
//
// Requires env (Netlify → Site settings → Environment):
//   PAYSTACK_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ============================================================

import { runPayoutsForReference } from "./payout-core.mjs";

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json", Allow: "POST" },
      body: JSON.stringify({ ok: false, reason: "method not allowed" }),
    };
  }

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, reason: "invalid JSON body" }),
    };
  }

  const reference = String(body.reference || "").trim();
  const role = body.role === "host" || body.role === "affiliate" ? body.role : null;

  try {
    const result = await runPayoutsForReference({
      reference,
      role,
      env: process.env,
    });
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: result.ok, ...result }),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, reason: err.message }),
    };
  }
};
