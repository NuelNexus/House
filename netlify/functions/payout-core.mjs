// ============================================================
// FesGH — payout core (shared by the Netlify function and the
// dev server). Splits every verified ticket charge to the people
// who earned it:
//   · platform/admin  — keeps its 30% automatically (it stays in
//     the FesGH Paystack balance, no transfer needed)
//   · host            — 70% of the base price → mobile money
//   · affiliate       — 70% of the margin  → mobile money
// Payout numbers come from the party the seller posted (or their
// profile phone). Every attempt is written to the `payouts`
// ledger, and each purchase is paid at most once per role.
//
// Env required to actually pay out:
//   PAYSTACK_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Without them the sale still completes — it just stays "pending"
// in the ledger until the admin retries.
// ============================================================

import { createClient } from "@supabase/supabase-js";

// Paystack Ghana mobile-money bank codes (POST /transferrecipient).
// If a code is wrong for a network the transfer fails and shows up
// in the ledger, so the admin can fix the network on the party.
export const NETWORK_BANK_CODES = {
  MTN: "MTN-GH",
  Vodafone: "VODAFONE-GH",
  AirtelTigo: "ATL-GH",
  Telecel: "TGO-GH",
};

// Normalise a Ghana phone to Paystack's local format (0X…). Accepts
// +233…, 233…, 0… and spaced/dashed variants.
export function normalizePhone(raw) {
  if (!raw) return "";
  let p = String(raw).trim().replace(/[\s\-()]/g, "");
  if (p.startsWith("+")) p = p.slice(1);
  if (p.startsWith("233") && p.length === 12) p = "0" + p.slice(3);
  if (!/^0\d{9}$/.test(p)) return p; // keep as-is; Paystack will tell us
  return p;
}

async function paystackFetch(secretKey, path, options = {}) {
  const res = await fetch(`https://api.paystack.co${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.status !== true) {
    throw new Error(json.message || `Paystack error ${res.status}`);
  }
  return json;
}

// Confirm a charge actually settled before any money moves.
async function verifyCharge(reference, secretKey) {
  const json = await paystackFetch(
    secretKey,
    `/transaction/verify/${encodeURIComponent(reference)}`
  );
  return {
    settled: json.data?.status === "success",
    amount: json.data?.amount ?? null,
  };
}

async function createRecipient({ secretKey, name, phone, network }) {
  const json = await paystackFetch(secretKey, "/transferrecipient", {
    method: "POST",
    body: JSON.stringify({
      type: "mobile_money",
      name: name || "FesGH member",
      account_number: phone,
      bank_code: NETWORK_BANK_CODES[network] || "MTN-GH",
      currency: "GHS",
    }),
  });
  return json.data?.recipient_code || "";
}

async function initiateTransfer({ secretKey, recipientCode, amountPesewas, reason }) {
  const json = await paystackFetch(secretKey, "/transfer", {
    method: "POST",
    headers: { "X-Transfer-Source": "balance" },
    body: JSON.stringify({
      source: "balance",
      amount: Math.max(1, Math.round(amountPesewas)),
      recipient: recipientCode,
      reason: reason || "FesGH ticket share",
      currency: "GHS",
    }),
  });
  return json.data?.transfer_code || json.data?.reference || "";
}

// The host's payout number lives on the ORIGINAL party (the repost's
// source). Fall back to the party itself, then the host's profile.
async function resolveHostPayout(sb, party, row) {
  let phone = "";
  let network = "";
  let name = "Host";
  const sourceId = party?.source_party_id || null;
  if (sourceId) {
    const { data: src } = await sb
      .from("parties")
      .select("payout_phone, payout_network")
      .eq("id", sourceId)
      .maybeSingle();
    if (src?.payout_phone) {
      phone = src.payout_phone;
      network = src.payout_network || "";
    }
  }
  if (!phone && party?.payout_phone) {
    phone = party.payout_phone;
    network = party.payout_network || "";
  }
  if (row.host_id) {
    const { data: prof } = await sb
      .from("profiles")
      .select("name, phone")
      .eq("id", row.host_id)
      .maybeSingle();
    if (!phone) phone = prof?.phone || "";
    if (prof?.name) name = prof.name;
  }
  return { phone, network, name };
}

// The affiliate's payout number lives on their repost row, falling
// back to their profile phone.
async function resolveAffiliatePayout(sb, party, row) {
  let phone = party?.payout_phone || "";
  let network = party?.payout_network || "";
  let name = "Affiliate";
  if (row.affiliate_id) {
    const { data: prof } = await sb
      .from("profiles")
      .select("name, phone")
      .eq("id", row.affiliate_id)
      .maybeSingle();
    if (!phone) phone = prof?.phone || "";
    if (prof?.name) name = prof.name;
  }
  return { phone, network, name };
}

// One ledger row per (purchase, role) — retries overwrite it.
async function recordPayout(sb, data) {
  const payload = {
    purchase_id: data.row.id,
    party_id: data.row.party_id ?? null,
    role: data.role,
    amount: data.amount,
    phone: data.phone || null,
    network: data.network || null,
    status: data.status,
    payment_reference: data.row.payment_reference ?? null,
    recipient_code: data.recipientCode || null,
    transfer_code: data.transferCode || null,
    error: data.error || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await sb
    .from("payouts")
    .upsert(payload, { onConflict: "purchase_id,role" });
  if (error) {
    return {
      role: data.role,
      amount: data.amount,
      status: "failed",
      error: `ledger write failed: ${error.message}`,
      ok: false,
    };
  }
  return {
    role: data.role,
    amount: data.amount,
    status: data.status,
    error: data.error || null,
    ok: data.status === "paid",
  };
}

// Pay out every share of one payment reference. `role` optionally
// narrows to a single role (used by the Admin retry button).
export async function runPayoutsForReference({ reference, role = null, env }) {
  const secretKey = env.PAYSTACK_SECRET_KEY;
  const url = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secretKey || !url || !serviceKey) {
    return {
      ok: false,
      reason:
        "payouts not configured — set PAYSTACK_SECRET_KEY, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
    };
  }
  if (!reference) return { ok: false, reason: "missing reference" };

  // 1. Never pay out a charge Paystack hasn't confirmed settled.
  const charge = await verifyCharge(reference, secretKey).catch((err) => ({
    settled: false,
    amount: null,
    error: err.message,
  }));
  if (!charge.settled) {
    return { ok: false, reason: charge.error || `charge not settled (${reference})` };
  }

  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

  // 2. The purchase rows land right after the client calls us — poll
  // briefly so a just-recorded sale isn't skipped.
  let rows = null;
  for (let i = 0; i < 12; i++) {
    const { data, error } = await sb
      .from("ticket_purchases")
      .select("*")
      .eq("payment_reference", reference);
    if (!error && data && data.length) {
      rows = data;
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!rows || !rows.length) {
    return { ok: false, reason: "no purchase rows for this reference yet" };
  }

  // 2b. The charge amount must match the recorded purchase prices — a
  // mismatched/replayed reference never pays out against a charge it
  // doesn't correspond to. (Tolerance = a few pesewas of rounding.)
  const totalPesewas = rows.reduce(
    (s, r) => s + Math.round((Number(r.price) || 0) * 100),
    0
  );
  if (charge.amount && Math.abs(Number(charge.amount) - totalPesewas) > rows.length + 2) {
    return { ok: false, reason: "charge amount does not match the recorded purchase" };
  }

  const results = [];
  // Reuse one transfer recipient per (phone, network) per invocation
  // instead of re-creating it for every ticket in an order.
  const recipientCache = new Map();

  for (const row of rows) {
    const price = Number(row.price) || 0;
    const base = Number(row.original_price) || 0;
    const margin = Math.max(0, price - base);
    const platformShare = Number(row.commission) || Math.round(price * 0.3);
    const affiliateShare = Number(row.affiliate_share) || Math.round(margin * 0.7);
    const hostShare = Math.max(0, price - platformShare - affiliateShare);

    const { data: party } = await sb
      .from("parties")
      .select("*")
      .eq("id", row.party_id)
      .maybeSingle();
    const hostPayout = await resolveHostPayout(sb, party || {}, row);
    const affPayout = await resolveAffiliatePayout(sb, party || {}, row);

    const attempts = [];
    if (row.host_id && hostShare > 0) {
      attempts.push({ role: "host", amount: hostShare, payout: hostPayout });
    }
    if (row.affiliate_id && affiliateShare > 0) {
      attempts.push({ role: "affiliate", amount: affiliateShare, payout: affPayout });
    }

    for (const attempt of attempts) {
      if (role && attempt.role !== role) continue;

      // Idempotent + single-flight: a role already paid is never paid
      // twice, and a role another call is processing right now is left
      // alone. Only the caller that wins the atomic claim transfers.
      const { data: existing } = await sb
        .from("payouts")
        .select("status")
        .eq("purchase_id", row.id)
        .eq("role", attempt.role)
        .maybeSingle();
      if (existing?.status === "paid") {
        results.push({
          role: attempt.role,
          amount: attempt.amount,
          status: "already-paid",
          ok: true,
        });
        continue;
      }

      const phone = normalizePhone(attempt.payout.phone);
      if (!phone) {
        results.push(
          await recordPayout(sb, {
            row,
            role: attempt.role,
            amount: attempt.amount,
            status: "failed",
            error: "no payout phone on file",
          })
        );
        continue;
      }

      const claimId = existing
        ? (await sb.rpc("retry_payout", {
            p_purchase: row.id,
            p_role: attempt.role,
          })).data
        : (await sb.rpc("claim_payout", {
            p_purchase: row.id,
            p_role: attempt.role,
          })).data;

      if (!claimId) {
        // Another call is mid-flight on this role right now (a fresh
        // 'pending' claim) — their result lands in the ledger.
        results.push({
          role: attempt.role,
          amount: attempt.amount,
          status: "in-flight",
          ok: true,
        });
        continue;
      }

      try {
        const cacheKey = `${phone}|${attempt.payout.network || "MTN"}`;
        let recipientCode = recipientCache.get(cacheKey);
        if (!recipientCode) {
          recipientCode = await createRecipient({
            secretKey,
            name: attempt.payout.name,
            phone,
            network: attempt.payout.network,
          });
          recipientCache.set(cacheKey, recipientCode);
        }
        const transferCode = await initiateTransfer({
          secretKey,
          recipientCode,
          amountPesewas: Math.round(attempt.amount * 100),
          reason: `FesGH ticket share — ${attempt.role} (${row.hash || row.code || ""})`,
        });
        results.push(
          await recordPayout(sb, {
            row,
            role: attempt.role,
            amount: attempt.amount,
            status: "paid",
            phone,
            network: attempt.payout.network,
            recipientCode,
            transferCode,
          })
        );
      } catch (err) {
        results.push(
          await recordPayout(sb, {
            row,
            role: attempt.role,
            amount: attempt.amount,
            status: "failed",
            phone,
            network: attempt.payout.network,
            error: err.message,
          })
        );
      }
    }
  }

  // 3. Mark the purchase(s). Status comes from the ledger, not just this
  // run — a role-filtered retry must not flip a purchase to "paid" while
  // the other share is still unpaid.
  for (const row of rows) {
    const expectedRoles = [];
    const price = Number(row.price) || 0;
    const base = Number(row.original_price) || 0;
    const margin = Math.max(0, price - base);
    const platformShare = Number(row.commission) || Math.round(price * 0.3);
    const affiliateShare = Number(row.affiliate_share) || Math.round(margin * 0.7);
    const hostShare = Math.max(0, price - platformShare - affiliateShare);
    if (row.host_id && hostShare > 0) expectedRoles.push("host");
    if (row.affiliate_id && affiliateShare > 0) expectedRoles.push("affiliate");
    if (!expectedRoles.length) {
      await sb.from("ticket_purchases").update({ payout_status: "paid" }).eq("id", row.id);
      continue;
    }
    const { data: ledger } = await sb
      .from("payouts")
      .select("role, status")
      .eq("purchase_id", row.id)
      .in("role", expectedRoles);
    const paidRoles = (ledger || []).filter((l) => l.status === "paid").length;
    const failedAny = (ledger || []).some((l) => l.status === "failed");
    const next =
      paidRoles === expectedRoles.length
        ? "paid"
        : failedAny
          ? "failed"
          : "pending";
    await sb.from("ticket_purchases").update({ payout_status: next }).eq("id", row.id);
  }

  const failed = results.filter((r) => r.status === "failed");
  return { ok: failed.length === 0, results };
}
