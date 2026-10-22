import { billingCatalog, type PaymentModel } from "./payment";
import { grantOrder, orderById, recordCustomer, revokePayment, type BillingOrder } from "./billing-store";

type StripeObject = { id: string; [key: string]: unknown };
export type StripeSession = {
  id: string; url?: string; status?: string; payment_status?: string; mode?: string; amount_total?: number; currency?: string; created?: number;
  metadata?: Record<string, string>; payment_intent?: string | StripeObject; customer?: string | StripeObject; subscription?: string | StripeObject;
};
export function stripeId(value: unknown): string | null { return typeof value === "string" ? value : value && typeof value === "object" && "id" in value && typeof value.id === "string" ? value.id : null; }

export async function stripeRequest<T>(route: string, params?: URLSearchParams, idempotencyKey?: string): Promise<T> {
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) throw new Error("PAYMENTS_NOT_CONFIGURED");
  const response = await fetch(`https://api.stripe.com/v1/${route}`, {
    method: params ? "POST" : "GET", signal: AbortSignal.timeout(20000),
    headers: { authorization: `Bearer ${secret}`, "Stripe-Version": "2024-06-20", ...(params ? { "content-type": "application/x-www-form-urlencoded" } : {}), ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) }, body: params?.toString(),
  });
  if (!response.ok) throw new Error("PAYMENT_PROVIDER_ERROR");
  return response.json() as Promise<T>;
}

export async function validatePrice(model: PaymentModel, amount: number, currency: string): Promise<string | null> {
  const priceId = (model === "pay_per_download" ? process.env.STRIPE_CV_DOWNLOAD_PRICE_ID : process.env.STRIPE_MONTHLY_SUBSCRIPTION_PRICE_ID)?.trim();
  if (!priceId) { if (model === "monthly_subscription") throw new Error("SUBSCRIPTIONS_NOT_CONFIGURED"); return null; }
  if (!/^price_[a-zA-Z0-9]+$/.test(priceId)) throw new Error("PRICE_NOT_CONFIGURED");
  const price = await stripeRequest<{ active?: boolean; unit_amount?: number; currency?: string; recurring?: { interval?: string; interval_count?: number } }>(`prices/${priceId}`);
  if (!price.active || price.unit_amount !== amount || price.currency !== currency || (model === "monthly_subscription" ? price.recurring?.interval !== "month" || price.recurring.interval_count !== 1 : Boolean(price.recurring))) throw new Error("PRICE_CONFIGURATION_MISMATCH");
  return priceId;
}

export async function syncSubscription(db: D1Database, subscriptionId: string, expectedOwner?: string, eventCreated = 0) {
  const sub = await stripeRequest<{ id: string; metadata?: Record<string, string>; customer?: unknown; status?: string; current_period_end?: number; cancel_at_period_end?: boolean; items?: { data?: Array<{ current_period_end?: number; price?: { id?: string } }> } }>(`subscriptions/${encodeURIComponent(subscriptionId)}`);
  const customerId = stripeId(sub.customer);
  const mapped = customerId ? await db.prepare("SELECT owner_id FROM billing_customers WHERE provider = 'stripe' AND customer_id = ?").bind(customerId).first<{ owner_id: string }>() : null;
  const previous = await db.prepare("SELECT owner_id, price_id FROM billing_subscriptions WHERE provider = 'stripe' AND provider_subscription_id = ?").bind(sub.id).first<{ owner_id: string; price_id: string }>();
  const item = sub.items?.data?.[0];
  const priceId = item?.price?.id;
  const knownPrice = Boolean(priceId && (priceId === process.env.STRIPE_MONTHLY_SUBSCRIPTION_PRICE_ID?.trim() || priceId === previous?.price_id));
  const metadataOwner = sub.metadata?.ownerId;
  const awaitingCheckout = !previous && !expectedOwner && metadataOwner && knownPrice
    ? await db.prepare("SELECT id FROM billing_orders WHERE owner_id = ? AND provider = 'stripe' AND model = 'monthly_subscription' AND status IN ('pending', 'paid') LIMIT 1").bind(metadataOwner).first()
    : null;
  // A shared Stripe account can send subscriptions for other products. Acknowledge those,
  // but retry our own early subscription event until Checkout establishes its customer.
  if (!expectedOwner && !previous && !(metadataOwner && knownPrice && (mapped?.owner_id === metadataOwner || awaitingCheckout))) return false;
  const ownerId = previous?.owner_id ?? mapped?.owner_id ?? expectedOwner;
  // A subscription must be tied to a server-created Checkout order/customer, never arbitrary metadata alone.
  if (!ownerId || (expectedOwner && expectedOwner !== ownerId) || (mapped && mapped.owner_id !== ownerId) || metadataOwner !== ownerId) throw new Error("SUBSCRIPTION_OWNER_MISMATCH");
  if (!priceId || !knownPrice) throw new Error("SUBSCRIPTION_PRICE_MISMATCH");
  const periodEnd = (sub.current_period_end ?? item?.current_period_end ?? 0) * 1000;
  const updatedAt = (eventCreated || Math.floor(Date.now() / 1000)) * 1000;
  await db.prepare("INSERT INTO billing_subscriptions (id, owner_id, provider, provider_subscription_id, product_id, price_id, status, period_ends_at, cancel_at_period_end, provider_updated_at) VALUES (?, ?, 'stripe', ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(provider, provider_subscription_id) DO UPDATE SET status = excluded.status, period_ends_at = excluded.period_ends_at, cancel_at_period_end = excluded.cancel_at_period_end, provider_updated_at = excluded.provider_updated_at WHERE excluded.provider_updated_at >= billing_subscriptions.provider_updated_at")
    .bind(crypto.randomUUID(), ownerId, sub.id, billingCatalog().subscription.productId, priceId, sub.status ?? "incomplete", periodEnd, sub.cancel_at_period_end ? 1 : 0, updatedAt).run();
  return true;
}

async function matchingSessionOrder(db: D1Database, session: StripeSession, expectedOwner?: string): Promise<BillingOrder | null> {
  const id = session.metadata?.orderId;
  if (!id) return null;
  const order = await orderById(db, id);
  if (!order || order.provider !== "stripe" || (expectedOwner && order.owner_id !== expectedOwner) || session.metadata?.ownerId !== order.owner_id || session.metadata?.model !== order.model || (order.provider_checkout_id && order.provider_checkout_id !== session.id)) return null;
  if (session.currency !== order.currency || session.amount_total !== order.amount_cents || session.mode !== (order.model === "monthly_subscription" ? "subscription" : "payment")) return null;
  if (order.model === "pay_per_download" && session.metadata?.cvVersionId !== order.cv_version_id) return null;
  return order;
}

/** The return URL and the webhook share the same server-side fulfillment logic. */
export async function fulfillStripeSession(db: D1Database, session: StripeSession, expectedOwner?: string): Promise<BillingOrder | null> {
  const order = await matchingSessionOrder(db, session, expectedOwner);
  if (!order || order.status === "revoked" || session.status !== "complete" || session.payment_status !== "paid") return null;
  const customerId = stripeId(session.customer);
  if (customerId) await recordCustomer(db, order.owner_id, customerId);
  if (order.model === "monthly_subscription") {
    const subscriptionId = stripeId(session.subscription);
    if (!subscriptionId) return null;
    await syncSubscription(db, subscriptionId, order.owner_id);
  }
  // Payment time is recorded once; neither webhook retries nor browser refreshes extend access.
  await grantOrder(db, order, session.id, stripeId(session.payment_intent), Date.now());
  return order;
}

/** Refund/dispute delivery can precede Checkout completion, before its payment ID is saved. */
export async function revokeStripePayment(db: D1Database, paymentId: string) {
  const known = await db.prepare("SELECT id FROM billing_orders WHERE provider = 'stripe' AND provider_payment_id = ? LIMIT 1").bind(paymentId).first();
  if (!known) {
    const sessions = await stripeRequest<{ data?: StripeSession[] }>(`checkout/sessions?payment_intent=${encodeURIComponent(paymentId)}&limit=100`);
    for (const session of sessions.data ?? []) {
      if (stripeId(session.payment_intent) !== paymentId) continue;
      const order = await matchingSessionOrder(db, session);
      if (!order) continue;
      await db.batch([
        db.prepare("UPDATE billing_orders SET status = 'revoked', provider_payment_id = ? WHERE id = ?").bind(paymentId, order.id),
        db.prepare("UPDATE billing_entitlements SET revoked_at = ? WHERE order_id = ?").bind(Date.now(), order.id),
      ]);
    }
  }
  await revokePayment(db, paymentId);
}
