import { env } from "cloudflare:workers";
import { verifyStripeSignature } from "../../../../lib/payment-records";
import { orderById } from "../../../../lib/billing-store";
import { fulfillStripeSession, revokeStripePayment, stripeId, stripeRequest, syncSubscription, type StripeSession } from "../../../../lib/stripe-billing";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const db = env.DB;
  if (!secret || !db || !env.DOCUMENTS) return Response.json({ error: "Payment processing unavailable" }, { status: 503 });
  const body = await request.text();
  if (body.length > 1000000) return new Response(null, { status: 413 });
  if (!await verifyStripeSignature(body, request.headers.get("stripe-signature"), secret)) return Response.json({ error: "Invalid signature" }, { status: 400 });
  let event: { id: string; type: string; created?: number; data?: { object?: Record<string, unknown> } };
  try { event = JSON.parse(body); } catch { return new Response(null, { status: 400 }); }
  if (!/^evt_[a-zA-Z0-9_]+$/.test(event.id ?? "") || typeof event.type !== "string") return new Response(null, { status: 400 });
  try {
    if (await db.prepare("SELECT id FROM billing_events WHERE provider = 'stripe' AND event_id = ?").bind(event.id).first()) return Response.json({ received: true, duplicate: true });
    const object = event.data?.object ?? {};
    if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type) && typeof object.id === "string") {
      // Fetch authoritative current state; a stale event must not overwrite a newer payment.
      const session = await stripeRequest<StripeSession>(`checkout/sessions/${encodeURIComponent(object.id)}`);
      const order = await fulfillStripeSession(db, session);
      if (session.payment_status === "paid" && session.metadata?.orderId && !order) {
        const saved = await orderById(db, session.metadata.orderId);
        if (saved && saved.status !== "revoked") throw new Error("PAID_ORDER_NOT_FULFILLED");
      }
    } else if (["checkout.session.expired", "checkout.session.async_payment_failed"].includes(event.type) && typeof object.id === "string") {
      await db.prepare("UPDATE billing_orders SET status = ? WHERE provider = 'stripe' AND provider_checkout_id = ? AND status = 'pending'").bind(event.type.endsWith("failed") ? "failed" : "expired", object.id).run();
    } else if (event.type.startsWith("customer.subscription.") && typeof object.id === "string") {
      await syncSubscription(db, object.id, undefined, event.created);
    } else if (["invoice.paid", "invoice.payment_failed"].includes(event.type)) {
      const parent = object.parent as { subscription_details?: { subscription?: unknown } } | undefined;
      const subscription = stripeId(object.subscription ?? parent?.subscription_details?.subscription);
      if (subscription) await syncSubscription(db, subscription, undefined, event.created);
    } else if ((event.type === "charge.refunded" && Number(object.amount_refunded) > 0) || event.type === "charge.dispute.created") {
      const paymentId = stripeId(object.payment_intent);
      if (paymentId) await revokeStripePayment(db, paymentId);
    }
    await db.prepare("INSERT OR IGNORE INTO billing_events (id, provider, event_id, processed_at) VALUES (?, 'stripe', ?, ?)").bind(crypto.randomUUID(), event.id, Date.now()).run();
    return Response.json({ received: true });
  } catch {
    // Do not acknowledge a failed write: Stripe retries, and idempotent grants prevent double access.
    return Response.json({ error: "Payment confirmation will be retried." }, { status: 503 });
  }
}
