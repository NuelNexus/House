import { useRef, useState } from "react";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { payWithPaystack, verifyPaystack, isFailedVerification } from "../lib/paystack";

// Buy a ticket for ONE event straight from the listing — no cart, no
// checkout page. Clicking "Get ticket" opens Paystack for that event's
// price and issues the pass on confirmation. Free events (GH₵ 0) skip
// the popup and issue the ticket immediately.
export function useBuyNow() {
  const { buyNow, notify } = useStore();
  const { user, name, profile, openAuth } = useAuth();
  const [buyingId, setBuyingId] = useState(null);
  // Ref-based in-flight guard: state updates are async, so two rapid
  // clicks on the same button could both pass a state check and both
  // open Paystack. The ref is synchronous — a second click returns
  // immediately, closing the double-charge window.
  const inFlightRef = useRef(null);

  const buy = async (ticket) => {
    if (!user) {
      openAuth();
      return;
    }
    const price = Math.max(0, Number(ticket?.price) || 0);
    const id = ticket?.id;
    if (!id || inFlightRef.current) return;
    inFlightRef.current = id;
    setBuyingId(id);
    try {
      let paymentRef = null;
      if (price > 0) {
        if (!user.email) {
          throw new Error("Add an email to your account before buying a ticket.");
        }
        paymentRef = await payWithPaystack({
          email: user.email,
          amount: price,
          label: ticket.name || "Event ticket",
        });
        // Best-effort server verification when the secret key is set;
        // explicitly failed charges always block the ticket.
        const verified = await verifyPaystack(paymentRef).catch(() => null);
        if (isFailedVerification(verified)) {
          throw new Error("Payment could not be verified — please try again.");
        }
      }
      const holder = {
        name: (profile?.name || name || "").trim() || "FesGH member",
        email: user.email || "",
        phone: profile?.phone || "",
      };
      buyNow(ticket, holder, paymentRef);
      notify(
        price > 0
          ? "Payment received — your ticket is ready!"
          : "You're in! Free ticket secured."
      );
    } catch (err) {
      notify(
        err?.message || "Payment didn't go through — nothing was charged, try again."
      );
    } finally {
      inFlightRef.current = null;
      setBuyingId(null);
    }
  };

  return { buy, buyingId };
}
