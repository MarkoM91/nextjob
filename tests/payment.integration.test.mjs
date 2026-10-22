import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";
import { env } from "cloudflare:workers";
import { createGuestToken } from "../lib/auth-session.ts";
import { candidate, jobs } from "../lib/demo-data.ts";
import { createDemoApplication } from "../lib/engine.ts";
import { textToPdf } from "../lib/documents.ts";
import { billingDatabase } from "./billing-fixture.mjs";

process.env.NEXTJOB_DISABLE_LIVE_JOBS = "true";
process.env.AUTH_SECRET = "payment-tests-private-secret-123456789";
const { default: worker } = await import("../dist/server/index.js");
const owner = "guest_abcdefghijklmnopqrstuvwx";
const other = "guest_zyxwvutsrqponmlkjihgfedc";
const cookies = { [owner]: `nextjob_guest=${await createGuestToken(owner, process.env.AUTH_SECRET)}`, [other]: `nextjob_guest=${await createGuestToken(other, process.env.AUTH_SECRET)}` };
const job = { ...jobs[0], id: "payment-test-job", fictional: false };
const profile = { ...candidate, fullName: "Test Candidate", email: "candidate@example.invalid" };
const profileKey = `private/${owner}/profile/latest.json`;
const packageKey = `private/${owner}/applications/${job.id}/package.json`;
const pdfKey = `private/${owner}/applications/${job.id}/tailored-cv.pdf`;
const originalFetch = globalThis.fetch;
let db, files, metadata, sessions, creates, byIdempotency;
const bytes = (value) => typeof value === "string" ? new TextEncoder().encode(value) : value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
function setJson(key, value) { files.set(key, bytes(JSON.stringify(value))); }
function readJson(key) { return JSON.parse(new TextDecoder().decode(files.get(key))); }
const request = (route, init = {}, identity = owner) => worker.fetch(new Request(`http://localhost${route}`, { ...init, headers: { cookie: cookies[identity], origin: "http://localhost", accept: "application/json", ...init.headers } }), { ASSETS: { fetch: async () => new Response(null, { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
const post = (body = {}, headers = {}) => request("/api/payments/cv-download", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ jobId: job.id, format: "pdf", ...body }) });
const status = () => request(`/api/payments/cv-download?job=${job.id}`).then((response) => response.json());

beforeEach(() => {
  process.env.PAYMENTS_ENABLED = "true"; process.env.STRIPE_SECRET_KEY = "sk_test_mock_only"; process.env.STRIPE_WEBHOOK_SECRET = "whsec_mock_only";
  for (const key of ["CV_DOWNLOAD_PRICE_CENTS", "CV_REDOWNLOAD_DAYS", "BILLING_CURRENCY", "STRIPE_CV_DOWNLOAD_PRICE_ID", "MONTHLY_SUBSCRIPTIONS_ENABLED", "STRIPE_MONTHLY_SUBSCRIPTION_PRICE_ID"]) delete process.env[key];
  db = billingDatabase(); env.DB = db;
  files = new Map(); metadata = new Map(); sessions = new Map(); creates = []; byIdempotency = new Map();
  setJson(`jobs/${job.id}.json`, { job, cachedAt: Date.now() });
  setJson(profileKey, { provider: "nextjob-parser", parsedAt: "2026-01-01", verifiedAt: "2026-01-02", updatedAt: "2026-01-02", profile, content: { basics: { name: profile.fullName }, sections: {} } });
  setJson(packageKey, { jobId: job.id, generatedAt: "2026-01-03", sourceRevision: "2026-01-02", template: "nextjob:professional:a8c9c4", content: { basics: { name: profile.fullName } }, application: createDemoApplication(profile, job), resumeProvider: "nextjob-template", documentsProvider: "nextjob-template", warnings: [], tone: "professional" });
  files.set(pdfKey, textToPdf("Original purchased CV"));
  env.DOCUMENTS = {
    async get(key) { const value = files.get(key); if (!value) return null; return { body: value, size: value.byteLength, customMetadata: metadata.get(key), text: async () => new TextDecoder().decode(value), json: async () => JSON.parse(new TextDecoder().decode(value)), arrayBuffer: async () => value.slice().buffer }; },
    async put(key, value, options) { files.set(key, bytes(value).slice()); metadata.set(key, options?.customMetadata); },
    async delete(key) { for (const item of Array.isArray(key) ? key : [key]) files.delete(item); },
  };
  globalThis.fetch = async (url, init) => {
    const route = String(url).replace("https://api.stripe.com/v1/", "");
    if (route === "checkout/sessions") {
      const params = new URLSearchParams(init.body);
      const key = init.headers["Idempotency-Key"];
      creates.push({ params, key });
      if (byIdempotency.has(key)) return Response.json(byIdempotency.get(key));
      const id = `cs_test_${sessions.size + 1}`;
      const sessionMetadata = Object.fromEntries([...params].filter(([name]) => /^metadata\[/.test(name)).map(([name, value]) => [name.slice(9, -1), value]));
      const session = { id, url: `https://checkout.stripe.com/${id}`, created: Math.floor(Date.now() / 1000), mode: params.get("mode"), status: "open", payment_status: "unpaid", amount_total: Number(params.get("line_items[0][price_data][unit_amount]") || 200), currency: "eur", metadata: sessionMetadata, payment_intent: `pi_${id}`, customer: "cus_test" };
      sessions.set(id, session); byIdempotency.set(key, session); return Response.json(session);
    }
    if (route.startsWith("checkout/sessions?")) {
      const paymentId = new URLSearchParams(route.split("?")[1]).get("payment_intent");
      return Response.json({ data: [...sessions.values()].filter((session) => session.payment_intent === paymentId) });
    }
    if (route.endsWith("/expire")) { const session = sessions.get(route.split("/").at(-2)); if (!session) return new Response(null, { status: 404 }); session.status = "expired"; return Response.json(session); }
    if (route.startsWith("checkout/sessions/")) return sessions.has(route.split("/").at(-1)) ? Response.json(sessions.get(route.split("/").at(-1))) : new Response(null, { status: 404 });
    throw new Error(`Unexpected Stripe request ${route}`);
  };
});
afterEach(() => { globalThis.fetch = originalFetch; db.sqlite.close(); delete env.DB; });

async function begin() { const response = await post(); assert.equal(response.status, 200, await response.clone().text()); const result = await response.json(); return { result, session: sessions.values().next().value }; }
async function paid() { const { result, session } = await begin(); Object.assign(session, { status: "complete", payment_status: "paid" }); return { result, session }; }
async function returnFromStripe(session) { return request(`/api/payments/cv-download/success?session_id=${session.id}&job=${job.id}&format=pdf`); }
async function webhook(type, object, id = `evt_${crypto.randomUUID().replaceAll("-", "")}`, created = Math.floor(Date.now() / 1000)) {
  const body = JSON.stringify({ id, type, created, data: { object } });
  const timestamp = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(process.env.STRIPE_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`));
  const signature = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return request("/api/payments/webhook", { method: "POST", headers: { "stripe-signature": `t=${timestamp},v1=${signature}` }, body });
}

test("free previews and catalog do not create orders; subscription sales are disabled", async () => {
  const catalog = await (await request("/api/payments/catalog")).json();
  assert.equal(catalog.download.label, "€1.50"); assert.equal(catalog.subscription.enabled, false);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM billing_orders").get().count, 0);
  const access = await status(); assert.equal(access.purchased, false); assert.equal(creates.length, 0);
  const subscription = await post({ model: "monthly_subscription" }); assert.equal(subscription.status, 409);
});

test("all CV formats and inline PDF require a server entitlement", async () => {
  for (const format of ["pdf", "docx", "txt"]) assert.equal((await request(`/api/documents/${format}?job=${job.id}`)).status, 402);
  assert.equal((await request(`/api/documents/pdf?job=${job.id}&inline=true`)).status, 402);
});

test("missing checkout configuration fails closed and never issues a status cookie", async () => {
  delete process.env.STRIPE_WEBHOOK_SECRET;
  const response = await request(`/api/payments/cv-download?job=${job.id}`);
  assert.equal(response.headers.get("set-cookie"), null); assert.equal((await response.json()).available, false);
  assert.equal((await post()).status, 503); assert.equal(creates.length, 0);
});

test("the server fixes price and owner, freezes the CV, and reuses an open checkout", async () => {
  const response = await post({ ownerId: other, amount: 1 }); assert.equal(response.status, 200);
  assert.equal(creates[0].params.get("line_items[0][price_data][unit_amount]"), "150");
  assert.equal(creates[0].params.get("metadata[ownerId]"), owner);
  assert.equal(creates[0].params.has("customer_email"), false, "CV email is not sent to Stripe");
  assert.ok(files.has(`private/${owner}/cv-versions/${(await status()).versionId}/snapshot.json`));
  assert.equal((await post()).status, 200); assert.equal(creates.length, 1);
});

test("concurrent checkout attempts reserve one order and use one Stripe idempotency key", async () => {
  const results = await Promise.all([post(), post()]); assert.ok(results.every((response) => response.status === 200));
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM billing_orders").get().count, 1);
  assert.equal(new Set(creates.map((item) => item.key)).size, 1);
});

test("only a paid session matching the saved order can unlock its exact CV", async () => {
  const { session, result } = await paid();
  const original = structuredClone(session);
  for (const change of [{ payment_status: "unpaid" }, { amount_total: 1 }, { currency: "usd" }, { metadata: { ...session.metadata, ownerId: other } }, { metadata: { ...session.metadata, cvVersionId: "cv_" + "a".repeat(64) } }]) {
    Object.assign(session, original, change); const response = await returnFromStripe(session); assert.doesNotMatch(response.headers.get("location"), /payment=successful/);
    assert.equal((await status()).purchased, false);
  }
  Object.assign(session, original);
  const response = await returnFromStripe(session); assert.match(response.headers.get("location"), /payment=successful/);
  assert.equal((await status()).purchased, true);
  for (const format of ["pdf", "docx", "txt"]) assert.equal((await request(`/api/documents/${format}?job=${job.id}&version=${result.versionId}`)).status, 200);
  assert.notEqual((await request(`/api/documents/pdf?job=${job.id}&version=${result.versionId}`, {}, other)).status, 200);
  const history = await (await request("/api/payments/status")).json(); assert.equal(history.downloads.length, 1);
});

test("signed webhooks fulfill without a browser return and replays do not extend access", async () => {
  const { session } = await paid();
  assert.equal((await webhook("checkout.session.completed", session, "evt_repeat")).status, 200);
  const first = db.sqlite.prepare("SELECT * FROM billing_entitlements").get();
  assert.equal((await webhook("checkout.session.completed", session, "evt_repeat")).status, 200);
  assert.equal((await webhook("checkout.session.async_payment_succeeded", session)).status, 200);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM billing_entitlements").get().count, 1);
  assert.equal(db.sqlite.prepare("SELECT expires_at FROM billing_entitlements").get().expires_at, first.expires_at);
  assert.equal((await status()).purchased, true);
});

test("the purchased copy survives CV edits and profile removal; an edited CV needs new access", async () => {
  const { session, result } = await paid(); await returnFromStripe(session);
  const original = new Uint8Array(await (await request(`/api/documents/pdf?job=${job.id}&version=${result.versionId}`)).arrayBuffer());
  const pkg = readJson(packageKey); pkg.application.summary += " Updated wording."; pkg.template = "nextjob:professional:d9534f"; setJson(packageKey, pkg);
  files.set(pdfKey, textToPdf("Edited CV"));
  assert.notEqual((await status()).versionId, result.versionId);
  assert.equal((await request(`/api/documents/pdf?job=${job.id}`)).status, 402);
  const repeated = new Uint8Array(await (await request(`/api/documents/pdf?job=${job.id}&version=${result.versionId}`)).arrayBuffer()); assert.deepEqual(repeated, original);
  files.delete(profileKey);
  assert.equal((await request(`/api/documents/pdf?job=${job.id}&version=${result.versionId}`)).status, 200);
  assert.equal(creates.length, 1);
});

test("generation timestamps alone do not change the purchased CV version", async () => {
  const { session } = await paid(); await returnFromStripe(session);
  const version = (await status()).versionId;
  const pkg = readJson(packageKey); pkg.generatedAt = new Date().toISOString(); pkg.application.generatedAt = pkg.generatedAt; setJson(packageKey, pkg);
  assert.equal((await status()).versionId, version); assert.equal((await post()).status, 200); assert.equal(creates.length, 1);
});

test("a mismatched saved design cannot be sold while a PDF update is in progress", async () => {
  metadata.set(pdfKey, { cvVersionId: "cv_" + "f".repeat(64) });
  assert.equal((await post()).status, 409); assert.equal(creates.length, 0);
});

test("runtime prices can change without invalidating an already paid order", async () => {
  const { session } = await paid(); process.env.CV_DOWNLOAD_PRICE_CENTS = "275";
  assert.equal((await (await request("/api/payments/catalog")).json()).download.label, "€2.75");
  assert.match((await returnFromStripe(session)).headers.get("location"), /payment=successful/);
  assert.equal((await status()).purchased, true);
});

test("expired access requires a new purchase rather than silently extending the old grant", async () => {
  const { session } = await paid(); await returnFromStripe(session);
  db.sqlite.prepare("UPDATE billing_entitlements SET expires_at = ?").run(Date.now() - 1);
  assert.equal((await status()).purchased, false); assert.equal((await request(`/api/documents/pdf?job=${job.id}`)).status, 402);
  assert.equal((await post()).status, 200); assert.equal(creates.length, 2);
});

test("refunds revoke access and late completion events cannot restore it", async () => {
  const { session } = await paid(); await returnFromStripe(session);
  assert.equal((await webhook("charge.refunded", { payment_intent: session.payment_intent, amount_refunded: 150 })).status, 200);
  assert.equal((await status()).purchased, false);
  assert.equal((await webhook("checkout.session.completed", session)).status, 200);
  assert.equal((await request(`/api/documents/pdf?job=${job.id}`)).status, 402);
});

test("a refund arriving before Checkout fulfillment permanently blocks the later grant", async () => {
  const { session } = await paid();
  assert.equal(db.sqlite.prepare("SELECT provider_payment_id FROM billing_orders").get().provider_payment_id, null);
  assert.equal((await webhook("charge.refunded", { payment_intent: session.payment_intent, amount_refunded: 150 })).status, 200);
  assert.equal(db.sqlite.prepare("SELECT status FROM billing_orders").get().status, "revoked");
  assert.equal((await webhook("checkout.session.completed", session)).status, 200);
  assert.doesNotMatch((await returnFromStripe(session)).headers.get("location"), /payment=successful/);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM billing_entitlements").get().count, 0);
  assert.equal((await status()).purchased, false);
});

test("unrelated Stripe account subscriptions and invoices are acknowledged without granting access", async () => {
  process.env.STRIPE_MONTHLY_SUBSCRIPTION_PRICE_ID = "price_monthly";
  const subscription = { id: "sub_unrelated", customer: "cus_other_product", metadata: { ownerId: other }, status: "active", current_period_end: Math.floor(Date.now() / 1000) + 2592000, items: { data: [{ price: { id: "price_monthly" } }] } };
  globalThis.fetch = async (url) => {
    assert.match(String(url), /\/subscriptions\/sub_unrelated$/);
    return Response.json(subscription);
  };
  assert.equal((await webhook("customer.subscription.created", subscription, "evt_unrelated_subscription")).status, 200);
  assert.equal((await webhook("invoice.paid", { subscription: subscription.id })).status, 200);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM billing_subscriptions").get().count, 0);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM billing_events").get().count, 2);
  assert.equal((await status()).subscription.active, false);
});

test("pending, cancelled and failed payments never unlock a download", async () => {
  const { session } = await begin(); session.status = "complete";
  assert.match((await returnFromStripe(session)).headers.get("location"), /payment=pending/);
  assert.equal((await status()).purchased, false);
  assert.equal((await webhook("checkout.session.async_payment_failed", session)).status, 200);
  assert.equal(db.sqlite.prepare("SELECT status FROM billing_orders").get().status, "failed");
  assert.equal((await request(`/api/documents/pdf?job=${job.id}&payment=successful`)).status, 402);
  assert.equal((await request(`/api/documents/pdf?job=${job.id}&payment=cancelled`)).status, 402);
});

test("an active subscription unlocks downloads and scheduled cancellation preserves the paid period", async () => {
  db.sqlite.prepare("INSERT INTO billing_subscriptions VALUES (?, ?, 'stripe', ?, ?, ?, 'active', ?, 1, ?)").run("sub-row", owner, "sub_test", "monthly_subscription", "price_monthly", Date.now() + 86400000, Date.now());
  const access = await status(); assert.equal(access.subscription.active, true); assert.equal(access.subscription.cancelAtPeriodEnd, true);
  const result = await (await post()).json(); assert.equal(result.state, "subscription_active"); assert.equal(creates.length, 0);
  assert.equal((await request(result.downloadUrl)).status, 200);
  db.sqlite.prepare("UPDATE billing_subscriptions SET period_ends_at = ?").run(Date.now() - 1);
  assert.equal((await status()).subscription.status, "expired"); assert.equal((await request(`/api/documents/pdf?job=${job.id}`)).status, 402);
  db.sqlite.prepare("UPDATE billing_subscriptions SET status = 'canceled', period_ends_at = ?").run(Date.now() + 86400000);
  assert.equal((await status()).subscription.status, "cancelled"); assert.equal((await status()).subscription.active, false);
});

test("Android checkout cannot fall back to Stripe, even when web payments are configured", async () => {
  const result = await post({}, { "x-nextjob-platform": "android" }); assert.equal(result.status, 503); assert.equal((await result.json()).code, "PLAY_BILLING_NOT_CONFIGURED"); assert.equal(creates.length, 0);
});

test("forged webhooks are rejected before accessing payment records", async () => {
  const response = await request("/api/payments/webhook", { method: "POST", headers: { "stripe-signature": "t=1,v1=bad" }, body: JSON.stringify({ id: "evt_forged", type: "checkout.session.completed" }) });
  assert.equal(response.status, 400); assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM billing_entitlements").get().count, 0);
});

test("a saved recovery link restores only the purchased CV without restoring the guest workspace", async () => {
  const { session, result } = await paid(); await returnFromStripe(session);
  const response = await request("/api/payments/recovery-link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ versionId: result.versionId }) });
  assert.equal(response.status, 200);
  const recovery = await response.json(); const path = recovery.url.replace("http://localhost", "");
  const download = await request(path, { headers: { cookie: "" } });
  assert.equal(download.status, 200); assert.equal(download.headers.get("set-cookie"), null);
  assert.equal(download.headers.get("referrer-policy"), "no-referrer");
  assert.match(download.headers.get("content-type"), /application\/pdf/);
  const forged = await request(path + "x", { headers: { cookie: "" } }); assert.equal(forged.status, 403);
  const otherLink = await request("/api/payments/recovery-link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ versionId: result.versionId }) }, other); assert.equal(otherLink.status, 403);
  await webhook("charge.refunded", { payment_intent: session.payment_intent, amount_refunded: 150 });
  assert.equal((await request(path, { headers: { cookie: "" } })).status, 403);
});

test("stale displayed pricing is rejected before any payment attempt", async () => {
  process.env.CV_DOWNLOAD_PRICE_CENTS = "275";
  const result = await post({ expectedAmountCents: 150 });
  assert.equal(result.status, 409); assert.equal((await result.json()).code, "PRICE_CHANGED"); assert.equal(creates.length, 0);
});

test("future monthly checkout validates its recurring price and tracks cancellation via webhooks", async () => {
  process.env.MONTHLY_SUBSCRIPTIONS_ENABLED = "true";
  process.env.STRIPE_MONTHLY_SUBSCRIPTION_PRICE_ID = "price_monthly";
  const stub = globalThis.fetch;
  const subscription = { id: "sub_test", metadata: { ownerId: owner }, customer: "cus_test", status: "active", current_period_end: Math.floor(Date.now() / 1000) + 2592000, items: { data: [{ price: { id: "price_monthly" } }] } };
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("/prices/price_monthly")) return Response.json({ active: true, unit_amount: 200, currency: "eur", recurring: { interval: "month", interval_count: 1 } });
    if (String(url).endsWith("/subscriptions/sub_test")) return Response.json(subscription);
    return stub(url, init);
  };
  const checkout = await post({ model: "monthly_subscription" }); assert.equal(checkout.status, 200, await checkout.clone().text());
  assert.equal(creates[0].params.get("line_items[0][price]"), "price_monthly");
  const session = sessions.values().next().value; Object.assign(session, { status: "complete", payment_status: "paid", subscription: "sub_test" });
  assert.equal((await webhook("customer.subscription.created", subscription, "evt_early_subscription")).status, 503, "our subscription retries until Checkout links its customer");
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM billing_events WHERE event_id = 'evt_early_subscription'").get().count, 0);
  assert.match((await returnFromStripe(session)).headers.get("location"), /payment=successful/);
  assert.equal((await webhook("customer.subscription.created", subscription, "evt_early_subscription")).status, 200);
  assert.equal((await status()).subscription.active, true);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM billing_entitlements").get().count, 0, "subscription access is independent of per-CV grants");
  process.env.STRIPE_MONTHLY_SUBSCRIPTION_PRICE_ID = "price_future";
  subscription.status = "canceled";
  assert.equal((await webhook("customer.subscription.deleted", subscription, "evt_sub_cancel", Math.floor(Date.now() / 1000) + 1)).status, 200);
  assert.equal((await status()).subscription.status, "cancelled"); assert.equal((await status()).subscription.active, false);
});

test("a predefined Stripe price with the wrong amount is rejected before Checkout creation", async () => {
  process.env.STRIPE_CV_DOWNLOAD_PRICE_ID = "price_download";
  globalThis.fetch = async () => Response.json({ active: true, unit_amount: 999, currency: "eur" });
  const response = await post(); assert.equal(response.status, 502); assert.equal((await response.json()).code, "PRICE_CONFIGURATION_MISMATCH"); assert.equal(creates.length, 0);
});

test("provider timeouts can be retried against the same saved order", async () => {
  const stub = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("simulated provider outage"); };
  assert.equal((await post()).status, 502);
  const order = db.sqlite.prepare("SELECT id FROM billing_orders").get().id;
  globalThis.fetch = stub;
  assert.equal((await post()).status, 200);
  assert.equal(creates[0].key, `nextjob-order-${order}`);
});

test("a changed price expires an old unpaid checkout and shows the new charge", async () => {
  const { session } = await begin(); process.env.CV_DOWNLOAD_PRICE_CENTS = "275";
  const response = await post({ expectedAmountCents: 275 }); assert.equal(response.status, 200);
  assert.equal(session.status, "expired"); assert.equal(creates.length, 2);
  assert.equal(creates[1].params.get("line_items[0][price_data][unit_amount]"), "275");
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM billing_orders WHERE status = 'pending'").get().count, 1);
});

test("subscription management uses the server-linked customer and rejects another workspace", async () => {
  const { session } = await paid(); await returnFromStripe(session);
  const stub = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("billing_portal/sessions")) { const params = new URLSearchParams(init.body); assert.equal(params.get("customer"), "cus_test"); return Response.json({ url: "https://billing.stripe.com/test-portal" }); }
    return stub(url, init);
  };
  const response = await request("/api/payments/portal", { method: "POST", body: JSON.stringify({ customer: "cus_attacker" }) });
  assert.equal(response.status, 200); assert.equal((await response.json()).url, "https://billing.stripe.com/test-portal");
  assert.equal((await request("/api/payments/portal", { method: "POST" }, other)).status, 404);
  assert.equal((await request("/api/payments/portal", { method: "POST", headers: { "x-nextjob-platform": "android" } })).status, 409);
});
