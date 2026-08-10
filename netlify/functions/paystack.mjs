// ============================================================
// FesGH — Paystack transaction verification
//
// Confirms a charge actually settled before tickets are issued.
// Set PAYSTACK_SECRET_KEY in the Netlify environment variables.
// Without it, this reports not-configured and the client trusts
// the Paystack popup callback.
// ============================================================

export const handler = async (event) => {
  const reference = event.queryStringParameters?.reference || "";
  const secretKey = process.env.PAYSTACK_SECRET_KEY;

  if (!reference) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verified: false, reason: "missing reference" }),
    };
  }

  if (!secretKey) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        verified: false,
        reason: "PAYSTACK_SECRET_KEY is not set in the Netlify environment variables.",
      }),
    };
  }

  try {
    const res = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: { Authorization: `Bearer ${secretKey}` },
      }
    );
    const json = await res.json();
    if (!res.ok || json.status !== true) {
      return {
        statusCode: 502,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verified: false,
          reference,
          reason: json.message || `Paystack error ${res.status}`,
        }),
      };
    }
    const settled = json.data?.status === "success";
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        verified: settled,
        reference,
        // Always carry a reason so the client can distinguish "not
        // configured" from a genuinely failed/abandoned charge.
        reason: settled ? null : `charge status: ${json.data?.status || "unknown"}`,
        amount: json.data?.amount ?? null,
        currency: json.data?.currency ?? null,
        paidAt: json.data?.paid_at ?? null,
      }),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verified: false, reason: err.message }),
    };
  }
};
