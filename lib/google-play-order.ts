import type { BillingCatalog } from "./payment";
import type { CvSnapshot } from "./billing-cv";
import type { BillingOrder } from "./billing-store";
import { playAccountId, playOption, playProduct, PlayError } from "./google-play-api";

export const playReturnPath = (order: BillingOrder, format = "pdf", state = "successful") => `/checkout?${new URLSearchParams({ job: order.job_id ?? "", version: order.cv_version_id, format, payment: state })}`;
export async function reservePlayOrder(db: D1Database, owner: string, snapshot: CvSnapshot, catalog: BillingCatalog) {
  const id = crypto.randomUUID();
  const now = Date.now();
  const account = await playAccountId(owner);
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO billing_orders (id, owner_id, cv_version_id, job_id, model, product_id, provider, amount_cents, currency, redownload_days, status, created_at, expires_at) VALUES (?, ?, ?, ?, 'pay_per_download', ?, 'google_play', ?, ?, ?, 'pending', ?, ?)").bind(id, owner, snapshot.id, snapshot.jobId, playProduct(), catalog.download.amountCents, catalog.currency, catalog.download.redownloadDays, now, now + 3600000),
    db.prepare("INSERT OR IGNORE INTO billing_play_orders (order_id, account_id, mode, purchase_option_id, allow_test) SELECT id, ?, ?, ?, ? FROM billing_orders WHERE id = ? AND provider = 'google_play'").bind(account, process.env.GOOGLE_PLAY_BILLING_MODE, playOption(), +(process.env.GOOGLE_PLAY_ALLOW_TEST_PURCHASES === "true"), id),
  ]);
  const order = await db.prepare("SELECT o.*, p.mode FROM billing_orders o JOIN billing_play_orders p ON p.order_id = o.id WHERE o.owner_id = ? AND o.cv_version_id = ? AND o.provider = 'google_play' AND o.status = 'pending' LIMIT 1").bind(owner, snapshot.id).first<BillingOrder & { mode: string }>();
  if (!order) throw new PlayError("PAYMENT_PENDING", 409);
  if (await db.prepare("SELECT token_hash FROM billing_play_tokens WHERE order_id = ?").bind(order.id).first()) throw new PlayError("PAYMENT_PENDING", 409);
  if (order.product_id !== playProduct() || order.amount_cents !== catalog.download.amountCents || order.currency !== catalog.currency || order.mode !== process.env.GOOGLE_PLAY_BILLING_MODE) throw new PlayError("PAYMENT_PENDING", 409);
  return order;
}
