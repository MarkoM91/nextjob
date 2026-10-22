import type { BillingCatalog, PaymentModel } from "./payment";
import type { CvSnapshot } from "./billing-cv";
import { versionKey } from "./billing-cv";

export type BillingOrder = {
  id: string; owner_id: string; cv_version_id: string; job_id: string | null; model: PaymentModel;
  product_id: string; provider: string; provider_checkout_id: string | null; provider_payment_id: string | null;
  amount_cents: number; currency: string; redownload_days: number; status: string;
  created_at: number; expires_at: number; paid_at: number | null;
};
export type Subscription = { status: string; period_ends_at: number; cancel_at_period_end: number; provider_subscription_id: string; price_id: string };

export async function subscriptionState(db: D1Database | undefined, ownerId: string) {
  const row = db ? await db.prepare("SELECT status, period_ends_at, cancel_at_period_end, provider_subscription_id, price_id FROM billing_subscriptions WHERE owner_id = ? ORDER BY period_ends_at DESC LIMIT 1").bind(ownerId).first<Subscription>() : null;
  const active = Boolean(row && ["active", "trialing"].includes(row.status) && row.period_ends_at > Date.now());
  return { active, status: active ? "active" : row ? row.status === "canceled" ? "cancelled" : row.period_ends_at <= Date.now() ? "expired" : row.status : "none", periodEndsAt: row?.period_ends_at ?? null, cancelAtPeriodEnd: Boolean(row?.cancel_at_period_end) };
}

export async function cvAccess(db: D1Database | undefined, ownerId: string, versionId: string) {
  const subscription = await subscriptionState(db, ownerId);
  const row = db && versionId ? await db.prepare("SELECT expires_at FROM billing_entitlements WHERE owner_id = ? AND cv_version_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY expires_at DESC LIMIT 1").bind(ownerId, versionId, Date.now()).first<{ expires_at: number }>() : null;
  return { allowed: Boolean(row) || subscription.active, purchased: Boolean(row), expiresAt: row?.expires_at ?? null, subscription };
}

export async function saveCvRecord(db: D1Database, snapshot: CvSnapshot) {
  await db.prepare("INSERT OR IGNORE INTO billing_cv_versions (id, owner_id, version_id, job_id, object_prefix, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), snapshot.ownerId, snapshot.id, snapshot.jobId, versionKey(snapshot.ownerId, snapshot.id), snapshot.createdAt).run();
}

export async function pendingOrder(db: D1Database, ownerId: string, versionId: string, model: PaymentModel): Promise<BillingOrder | null> {
  return db.prepare("SELECT * FROM billing_orders WHERE owner_id = ? AND cv_version_id = ? AND model = ? AND status = 'pending' LIMIT 1").bind(ownerId, versionId, model).first<BillingOrder>();
}

export async function reserveOrder(db: D1Database, ownerId: string, snapshot: CvSnapshot | null, model: PaymentModel, catalog: BillingCatalog): Promise<BillingOrder | null> {
  const item = model === "pay_per_download" ? catalog.download : catalog.subscription;
  const now = Date.now();
  await db.prepare("INSERT OR IGNORE INTO billing_orders (id, owner_id, cv_version_id, job_id, model, product_id, provider, amount_cents, currency, redownload_days, status, created_at, expires_at) SELECT ?, ?, ?, ?, ?, ?, 'stripe', ?, ?, ?, 'pending', ?, ? WHERE NOT EXISTS (SELECT 1 FROM billing_entitlements WHERE owner_id = ? AND cv_version_id = ? AND revoked_at IS NULL AND expires_at > ?)")
    .bind(crypto.randomUUID(), ownerId, snapshot?.id ?? "", snapshot?.jobId ?? null, model, item.productId, item.amountCents, catalog.currency, catalog.download.redownloadDays, now, now + 3600000, ownerId, snapshot?.id ?? "", now).run();
  return pendingOrder(db, ownerId, snapshot?.id ?? "", model);
}

export async function orderById(db: D1Database, id: string): Promise<BillingOrder | null> {
  return db.prepare("SELECT * FROM billing_orders WHERE id = ?").bind(id).first<BillingOrder>();
}

/** One atomic transaction: mark paid and create an immutable, non-extending entitlement. */
export async function grantOrder(db: D1Database, order: BillingOrder, checkoutId: string, paymentId: string | null, paidAt: number) {
  await db.batch([
    db.prepare("UPDATE billing_orders SET status = 'paid', provider_checkout_id = ?, provider_payment_id = ?, paid_at = COALESCE(paid_at, ?) WHERE id = ? AND status IN ('pending', 'expired', 'failed', 'paid')").bind(checkoutId, paymentId, paidAt, order.id),
    db.prepare("INSERT OR IGNORE INTO billing_entitlements (id, owner_id, cv_version_id, order_id, granted_at, expires_at) SELECT ?, owner_id, cv_version_id, id, paid_at, paid_at + redownload_days * 86400000 FROM billing_orders WHERE id = ? AND status = 'paid' AND model = 'pay_per_download'").bind(crypto.randomUUID(), order.id),
  ]);
}

export async function recordCustomer(db: D1Database, ownerId: string, customerId: string) {
  await db.prepare("INSERT INTO billing_customers (id, owner_id, provider, customer_id) VALUES (?, ?, 'stripe', ?) ON CONFLICT(owner_id, provider) DO UPDATE SET customer_id = excluded.customer_id").bind(crypto.randomUUID(), ownerId, customerId).run();
}

export async function revokePayment(db: D1Database, paymentId: string) {
  await db.batch([
    db.prepare("UPDATE billing_entitlements SET revoked_at = ? WHERE order_id IN (SELECT id FROM billing_orders WHERE provider = 'stripe' AND provider_payment_id = ?)").bind(Date.now(), paymentId),
    db.prepare("UPDATE billing_orders SET status = 'revoked' WHERE provider = 'stripe' AND provider_payment_id = ?").bind(paymentId),
  ]);
}

export async function billingHistory(db: D1Database, ownerId: string) {
  const result = await db.prepare("SELECT v.version_id AS versionId, v.job_id AS jobId, MAX(e.expires_at) AS expiresAt FROM billing_cv_versions v JOIN billing_entitlements e ON e.owner_id = v.owner_id AND e.cv_version_id = v.version_id WHERE v.owner_id = ? AND e.revoked_at IS NULL AND e.expires_at > ? GROUP BY v.version_id, v.job_id ORDER BY expiresAt DESC LIMIT 100").bind(ownerId, Date.now()).all();
  return result.results ?? [];
}
