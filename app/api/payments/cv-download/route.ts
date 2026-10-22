import { env } from "cloudflare:workers";
import { z } from "zod";
import { ensureGuestUser, getCurrentUser } from "../../../auth";
import { databaseFromEnvironment, resolveRealJob } from "../../../../lib/job-store";
import { safeOwnerId } from "../../../../lib/resume-storage";
import { billingCatalog } from "../../../../lib/payment";
import { currentCv, freezeCvVersion, readCvVersion } from "../../../../lib/billing-cv";
import { cvAccess, reserveOrder, saveCvRecord, pendingOrder } from "../../../../lib/billing-store";
import { fulfillStripeSession, stripeRequest, validatePrice, type StripeSession } from "../../../../lib/stripe-billing";
import { assertSameOrigin, clientKey, rateLimit } from "../../../../lib/security";

const schema = z.object({ jobId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/), format: z.enum(["pdf", "docx", "txt"]).default("pdf"), model: z.enum(["pay_per_download", "monthly_subscription"]).default("pay_per_download"), versionId: z.string().regex(/^cv_[a-f0-9]{64}$/).optional(), expectedAmountCents: z.number().int().positive().optional() });
const respond = (body: object, status = 200, cookie?: string) => Response.json(body, { status, headers: { "cache-control": "private, no-store", ...(cookie ? { "set-cookie": cookie } : {}) } });
const ready = (db: D1Database | undefined, storage: R2Bucket | undefined) => Boolean(db && storage && process.env.PAYMENTS_ENABLED === "true" && process.env.STRIPE_SECRET_KEY?.trim() && process.env.STRIPE_WEBHOOK_SECRET?.trim());
function origin(request: Request) { return new URL(process.env.PAYMENTS_PUBLIC_ORIGIN?.trim() || request.url).origin; }
export const downloadPath = (jobId: string, versionId: string, format: string) => `/api/documents/${format}?job=${encodeURIComponent(jobId)}&doc=cv&version=${encodeURIComponent(versionId)}`;

export async function GET(request: Request) {
  if (!rateLimit(`cv-payment-status:${clientKey(request)}`, 90).allowed) return respond({ error: "Please wait a moment before checking again." }, 429);
  const url = new URL(request.url);
  const jobId = schema.shape.jobId.safeParse(url.searchParams.get("job"));
  if (!jobId.success) return respond({ error: "Choose a valid job." }, 400);
  const db = databaseFromEnvironment(env);
  const storage = env.DOCUMENTS;
  try {
    const catalog = billingCatalog();
    const user = await getCurrentUser();
    const owner = user ? safeOwnerId(user.id) : "";
    const requested = schema.shape.versionId.safeParse(url.searchParams.get("version") ?? undefined);
    if (!requested.success) return respond({ error: "Choose a valid CV version." }, 400);
    const job = await resolveRealJob(jobId.data, db, storage);
    const snapshot = user ? requested.data ? await readCvVersion(storage, owner, requested.data) : job ? await currentCv(storage, owner, job) : null : null;
    const access = await cvAccess(db, owner, snapshot?.id ?? "");
    const android = request.headers.get("x-nextjob-platform") === "android";
    return respond({ available: Boolean(snapshot && (access.allowed || ready(db, storage) && !android)), purchased: access.purchased, subscription: access.subscription, expiresAt: access.expiresAt, versionId: snapshot?.id ?? null, job: snapshot?.job ?? job ?? null, price: catalog.download.label, amountCents: catalog.download.amountCents, redownloadDays: catalog.download.redownloadDays, subscriptionOffer: catalog.subscription, provider: android ? "google_play" : "stripe", code: android && !access.allowed ? "PLAY_BILLING_NOT_CONFIGURED" : snapshot ? undefined : "CV_NOT_READY" });
  } catch {
    return respond({ error: "We couldn’t check download access. Your preview is still free; try again.", code: "BILLING_UNAVAILABLE" }, 503);
  }
}

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return respond({ error: "Invalid request origin" }, 403);
  const limit = rateLimit(`cv-payment:${clientKey(request)}`, 30, 3600000);
  if (!limit.allowed) return respond({ error: "Please wait before trying checkout again." }, 429);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return respond({ error: "Choose a valid CV and format." }, 400);
  const { user, setCookie } = await ensureGuestUser(request);
  if (!user) return respond({ error: "Your private workspace is unavailable. Please try again." }, 503);
  const owner = safeOwnerId(user.id);
  const db = databaseFromEnvironment(env);
  const storage = env.DOCUMENTS;
  if (!db || !storage) return respond({ error: "Downloads are temporarily unavailable. Your CV preview is free.", code: "BILLING_UNAVAILABLE" }, 503, setCookie);
  try {
    const catalog = billingCatalog();
    const { jobId, format, model, versionId } = parsed.data;
    const job = await resolveRealJob(jobId, db, storage);
    const current = job ? await currentCv(storage, owner, job) : null;
    const snapshot = versionId ? await readCvVersion(storage, owner, versionId) ?? (current?.id === versionId ? current : null) : current;
    if (!snapshot || snapshot.jobId !== jobId) return respond({ error: "Finish and save your CV preview before downloading.", code: "CV_NOT_READY" }, 409, setCookie);
    const access = await cvAccess(db, owner, snapshot.id);
    if (access.allowed) {
      await freezeCvVersion(storage, snapshot);
      await saveCvRecord(db, snapshot);
      return respond({ downloadUrl: downloadPath(jobId, snapshot.id, format), reused: true, state: access.subscription.active ? "subscription_active" : "already_purchased" }, 200, setCookie);
    }
    // Never send Play-distributed Android users into an unconfigured web checkout.
    if (request.headers.get("x-nextjob-platform") === "android") return respond({ error: "Android purchases are not available yet. You can still create and preview your CV for free.", code: "PLAY_BILLING_NOT_CONFIGURED" }, 503, setCookie);
    if (!ready(db, storage)) return respond({ error: "Payments are not available yet. Your CV is saved and its preview remains free.", code: "PAYMENTS_NOT_CONFIGURED" }, 503, setCookie);
    if (model === "monthly_subscription" && !catalog.subscription.enabled) return respond({ error: "Subscriptions are not offered yet. You can pay once for a CV download.", code: "SUBSCRIPTIONS_DISABLED" }, 409, setCookie);
    const item = model === "pay_per_download" ? catalog.download : catalog.subscription;
    if (parsed.data.expectedAmountCents !== undefined && parsed.data.expectedAmountCents !== item.amountCents) return respond({ error: "The price has changed. Review the updated price before continuing.", code: "PRICE_CHANGED", price: item.label }, 409, setCookie);
    await freezeCvVersion(storage, snapshot);
    await saveCvRecord(db, snapshot);
    let order = await pendingOrder(db, owner, model === "pay_per_download" ? snapshot.id : "", model);
    if (order?.provider_checkout_id) {
      const existing = await stripeRequest<StripeSession>(`checkout/sessions/${encodeURIComponent(order.provider_checkout_id)}`);
      const fulfilled = await fulfillStripeSession(db, existing, owner);
      if (fulfilled) return respond({ downloadUrl: downloadPath(jobId, snapshot.id, format), reused: true, state: "already_purchased" }, 200, setCookie);
      if (existing.status === "open" && existing.url) {
        if (order.amount_cents === item.amountCents && order.currency === catalog.currency && order.product_id === item.productId) return respond({ checkoutUrl: existing.url, reusedCheckout: true }, 200, setCookie);
        await stripeRequest(`checkout/sessions/${encodeURIComponent(existing.id)}/expire`, new URLSearchParams());
        await db.prepare("UPDATE billing_orders SET status = 'expired' WHERE id = ? AND status = 'pending'").bind(order.id).run();
        order = null;
      }
      if (existing.status === "complete") return respond({ error: "Your payment is still being confirmed. Check again shortly; do not pay a second time.", code: "PAYMENT_PENDING" }, 409, setCookie);
      if (order) {
        if (existing.status !== "expired") throw new Error("PAYMENT_PROVIDER_ERROR");
        await db.prepare("UPDATE billing_orders SET status = 'expired' WHERE id = ? AND status = 'pending'").bind(order.id).run();
        order = null;
      }
    }
    order ??= await reserveOrder(db, owner, model === "pay_per_download" ? snapshot : null, model, catalog);
    if (!order) return respond({ error: "Download access has changed. Check again before paying.", code: "ACCESS_CHANGED" }, 409, setCookie);
    const priceId = await validatePrice(model, order.amount_cents, order.currency);
    const params = new URLSearchParams({ mode: model === "monthly_subscription" ? "subscription" : "payment", "line_items[0][quantity]": "1", "metadata[orderId]": order.id, "metadata[ownerId]": owner, "metadata[model]": model, "metadata[cvVersionId]": snapshot.id, "metadata[productId]": order.product_id });
    if (priceId) params.set("line_items[0][price]", priceId);
    else {
      params.set("line_items[0][price_data][currency]", order.currency);
      params.set("line_items[0][price_data][unit_amount]", String(order.amount_cents));
      const productId = process.env.STRIPE_CV_DOWNLOAD_PRODUCT_ID?.trim();
      if (productId) params.set("line_items[0][price_data][product]", productId);
      else params.set("line_items[0][price_data][product_data][name]", "NextJOB CV download");
    }
    const customer = await db.prepare("SELECT customer_id FROM billing_customers WHERE owner_id = ? AND provider = 'stripe'").bind(owner).first<{ customer_id: string }>();
    if (customer) params.set("customer", customer.customer_id);
    else if (model === "pay_per_download") params.set("customer_creation", "always");
    if (model === "monthly_subscription") params.set("subscription_data[metadata][ownerId]", owner);
    const base = origin(request);
    params.set("success_url", `${base}/api/payments/cv-download/success?session_id={CHECKOUT_SESSION_ID}&job=${encodeURIComponent(jobId)}&format=${format}`);
    params.set("cancel_url", `${base}/checkout?job=${encodeURIComponent(jobId)}&format=${format}&payment=cancelled`);
    params.set("expires_at", String(Math.floor(order.expires_at / 1000)));
    const checkout = await stripeRequest<StripeSession>("checkout/sessions", params, `nextjob-order-${order.id}`);
    if (!checkout.id || !checkout.url?.startsWith("https://checkout.stripe.com/")) throw new Error("PAYMENT_PROVIDER_ERROR");
    await db.prepare("UPDATE billing_orders SET provider_checkout_id = ? WHERE id = ?").bind(checkout.id, order.id).run();
    return respond({ checkoutUrl: checkout.url, price: model === "pay_per_download" ? catalog.download.label : catalog.subscription.label, versionId: snapshot.id }, 200, setCookie);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "";
    const code = ["CV_NOT_READY", "PAYMENTS_NOT_CONFIGURED", "SUBSCRIPTIONS_NOT_CONFIGURED", "PRICE_NOT_CONFIGURED", "PRICE_CONFIGURATION_MISMATCH"].includes(reason) ? reason : "PAYMENT_PROVIDER_ERROR";
    return respond({ error: code === "CV_NOT_READY" ? "Your CV is still being saved. Return to the preview and try again." : "Checkout could not be started. Your CV is saved; please try again.", code }, code === "CV_NOT_READY" ? 409 : 502, setCookie);
  }
}
