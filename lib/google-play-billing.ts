import { sha256Base64Url } from "./auth-session";
import { consumePlayPurchase, getPlayPurchase, openPlayToken, playConfigured, PlayError, sealPlayToken, type PlayPurchase } from "./google-play-api";
import type { BillingOrder } from "./billing-store";

type TokenRow = { token_hash: string; order_id: string; token_encrypted: string; consumed_at: number | null };
type PlayOrder = BillingOrder & { account_id: string; mode: string; purchase_option_id: string; allow_test: number };
async function revoke(db: D1Database, orderId: string) {
  await db.batch([
    db.prepare("UPDATE billing_entitlements SET revoked_at = ? WHERE order_id = ? AND revoked_at IS NULL").bind(Date.now(), orderId),
    db.prepare("UPDATE billing_orders SET status = 'revoked' WHERE id = ? AND provider = 'google_play'").bind(orderId),
  ]);
}
function lineFor(purchase: PlayPurchase, order: PlayOrder) {
  const lines = purchase.productLineItem;
  if (!lines || lines.length !== 1 || lines[0].productId !== order.product_id) throw new PlayError("PLAY_PURCHASE_MISMATCH", 409);
  const line = lines[0].productOfferDetails;
  if (!line || line.quantity !== 1 || line.rentOfferDetails || line.preorderOfferDetails || line.purchaseOptionId !== order.purchase_option_id) throw new PlayError("PLAY_PURCHASE_MISMATCH", 409);
  return line;
}
function associated(purchase: PlayPurchase, order: PlayOrder) {
  if (order.provider !== "google_play" || purchase.obfuscatedExternalAccountId !== order.account_id || purchase.obfuscatedExternalProfileId !== order.id) throw new PlayError("PLAY_PURCHASE_MISMATCH", 409);
}

/** Google is the authority, never the device's purchase JSON or a success URL. */
export async function fulfillPlayPurchase(db: D1Database, owner: string, token: string) {
  if (!playConfigured()) throw new PlayError("PLAY_BILLING_NOT_CONFIGURED");
  const purchase = await getPlayPurchase(token);
  const order = purchase.obfuscatedExternalProfileId ? await db.prepare("SELECT o.*, p.account_id, p.mode, p.purchase_option_id, p.allow_test FROM billing_orders o JOIN billing_play_orders p ON p.order_id = o.id WHERE o.id = ? AND o.owner_id = ? AND o.provider = 'google_play'").bind(purchase.obfuscatedExternalProfileId, owner).first<PlayOrder>() : null;
  if (!order) throw new PlayError("PLAY_PURCHASE_MISMATCH", 409);
  await associated(purchase, order);
  const line = lineFor(purchase, order);
  const state = purchase.purchaseStateContext?.purchaseState;
  if (state === "CANCELLED" || line.refundableQuantity === 0) { await revoke(db, order.id); return { state: "cancelled", order }; }
  if (state === "PENDING") {
    const hash = await sha256Base64Url(token);
    await db.prepare("INSERT OR IGNORE INTO billing_play_tokens (token_hash, order_id, token_encrypted, verified_at) VALUES (?, ?, ?, ?)").bind(hash, order.id, await sealPlayToken(token), Date.now()).run();
    const bound = await db.prepare("SELECT order_id, token_hash FROM billing_play_tokens WHERE token_hash = ? OR order_id = ? LIMIT 1").bind(hash, order.id).first<TokenRow>();
    if (!bound || bound.order_id !== order.id || bound.token_hash !== hash) throw new PlayError("PLAY_PURCHASE_MISMATCH", 409);
    return { state: "pending", order };
  }
  if (state !== "PURCHASED" || line.refundableQuantity !== 1 || order.status === "revoked") throw new PlayError("PLAY_PURCHASE_MISMATCH", 409);
  if (purchase.testPurchaseContext && !order.allow_test || !purchase.testPurchaseContext && order.mode !== "live") throw new PlayError("PLAY_PURCHASE_MODE_MISMATCH", 409);
  const completed = Date.parse(purchase.purchaseCompletionTime ?? "");
  if (!Number.isFinite(completed) || completed < order.created_at - 60000 || completed > Date.now() + 60000) throw new PlayError("PLAY_PURCHASE_MISMATCH", 409);
  const hash = await sha256Base64Url(token);
  const existing = await db.prepare("SELECT * FROM billing_play_tokens WHERE token_hash = ? OR order_id = ? LIMIT 1").bind(hash, order.id).first<TokenRow>();
  if (existing && (existing.order_id !== order.id || existing.token_hash !== hash)) throw new PlayError("PLAY_PURCHASE_MISMATCH", 409);
  // The unique token and order constraints and all fulfillment writes commit together.
  // A retry cannot bind this payment to another CV or extend the original expiry.
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO billing_play_tokens (token_hash, order_id, token_encrypted, verified_at) VALUES (?, ?, ?, ?)").bind(hash, order.id, await sealPlayToken(token), Date.now()),
    db.prepare("UPDATE billing_orders SET status = 'paid', provider_checkout_id = ?, provider_payment_id = ?, paid_at = COALESCE(paid_at, ?) WHERE id = ? AND provider = 'google_play' AND status IN ('pending', 'paid') AND EXISTS (SELECT 1 FROM billing_play_tokens WHERE token_hash = ? AND order_id = ?)").bind(hash, purchase.orderId ?? null, completed, order.id, hash, order.id),
    db.prepare("INSERT OR IGNORE INTO billing_entitlements (id, owner_id, cv_version_id, order_id, granted_at, expires_at) SELECT ?, owner_id, cv_version_id, id, paid_at, paid_at + redownload_days * 86400000 FROM billing_orders WHERE id = ? AND status = 'paid' AND provider = 'google_play' AND EXISTS (SELECT 1 FROM billing_play_tokens WHERE token_hash = ? AND order_id = ?)").bind(crypto.randomUUID(), order.id, hash, order.id),
  ]);
  const bound = await db.prepare("SELECT * FROM billing_play_tokens WHERE token_hash = ? AND order_id = ?").bind(hash, order.id).first<TokenRow>();
  if (!bound) throw new PlayError("PLAY_PURCHASE_MISMATCH", 409);
  let consumeRetry = false;
  // Durable access exists before consuming/acknowledging. Unconsumed payments
  // are returned by Play on app resume and retried through this same verifier.
  try {
    if (line.consumptionState !== "CONSUMPTION_STATE_CONSUMED") await consumePlayPurchase(order.product_id, token);
    await db.prepare("UPDATE billing_play_tokens SET consumed_at = COALESCE(consumed_at, ?), verified_at = ? WHERE token_hash = ?").bind(Date.now(), Date.now(), hash).run();
  } catch { consumeRetry = true; }
  return { state: "successful", order, consumeRetry };
}

/** Recheck refunds/revocations before every paid download, including private recovery links. */
export async function checkPlayEntitlement(db: D1Database, orderId: string): Promise<boolean> {
  const order = await db.prepare("SELECT o.*, p.account_id, p.mode, p.purchase_option_id, p.allow_test FROM billing_orders o JOIN billing_play_orders p ON p.order_id = o.id WHERE o.id = ? AND o.provider = 'google_play'").bind(orderId).first<PlayOrder>();
  const stored = await db.prepare("SELECT * FROM billing_play_tokens WHERE order_id = ?").bind(orderId).first<TokenRow>();
  if (!order || order.status !== "paid" || !stored) return false;
  const purchase = await getPlayPurchase(await openPlayToken(stored.token_encrypted));
  await associated(purchase, order);
  const line = lineFor(purchase, order);
  if (purchase.purchaseStateContext?.purchaseState !== "PURCHASED" || line.refundableQuantity !== 1) { await revoke(db, orderId); return false; }
  return true;
}

/** Hourly owner-only maintenance also retries acknowledgment if the app stays closed. */
export async function retryPlayConsumptions(db: D1Database) {
  if (!playConfigured()) return { retried: 0, errors: 0 };
  const rows = (await db.prepare("SELECT t.token_encrypted, t.token_hash, o.owner_id FROM billing_play_tokens t JOIN billing_orders o ON o.id = t.order_id WHERE t.consumed_at IS NULL AND o.status IN ('pending', 'paid') AND t.verified_at < ? ORDER BY t.verified_at LIMIT 20").bind(Date.now() - 60000).all<{ token_encrypted: string; token_hash: string; owner_id: string }>()).results ?? [];
  let errors = 0;
  for (const row of rows) {
    try { const result = await fulfillPlayPurchase(db, row.owner_id, await openPlayToken(row.token_encrypted)); if (result.consumeRetry) errors++; }
    catch { errors++; }
    finally { await db.prepare("UPDATE billing_play_tokens SET verified_at = ? WHERE token_hash = ?").bind(Date.now(), row.token_hash).run(); }
  }
  return { retried: rows.length, errors };
}
