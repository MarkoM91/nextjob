import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";
import { env } from "cloudflare:workers";
import { createGuestToken } from "../lib/auth-session.ts";
import { candidate, jobs } from "../lib/demo-data.ts";
import { createDemoApplication } from "../lib/engine.ts";
import { textToPdf } from "../lib/documents.ts";
import { billingDatabase } from "./billing-fixture.mjs";

process.env.AUTH_SECRET = "play-test-secret-abcdefghijklmnopqrstuvwxyz";
process.env.NEXTJOB_DISABLE_LIVE_JOBS = "true";
const keyPair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const privateKey = Buffer.from(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey)).toString("base64");
const owner = "guest_abcdefghijklmnopqrstuvwx", other = "guest_zyxwvutsrqponmlkjihgfedc";
const cookies = { [owner]: `nextjob_guest=${await createGuestToken(owner, process.env.AUTH_SECRET)}`, [other]: `nextjob_guest=${await createGuestToken(other, process.env.AUTH_SECRET)}` };
const job = { ...jobs[0], id: "play-test-job", fictional: false };
const profile = { ...candidate, fullName: "Fictional Candidate", email: "fictional@example.invalid" };
const { default: worker } = await import("../dist/server/index.js");
const originalFetch = globalThis.fetch;
const appHeaders = { "x-nextjob-platform": "android", "user-agent": "NextJOBAndroid/0.1.2" };
let db, files, context, purchase, consumed, consumeFails, outage;
const request = (path, init = {}, identity = owner) => worker.fetch(new Request(`http://localhost${path}`, { ...init, headers: { cookie: cookies[identity], origin: "http://localhost", accept: "application/json", ...appHeaders, ...init.headers } }), { ASSETS: { fetch: async () => new Response(null, { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
const post = (body = {}, headers = {}) => request("/api/payments/cv-download", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ jobId: job.id, format: "pdf", expectedAmountCents: 150, ...body }) });
const verify = (token = "test-purchase-token-12345", identity = owner) => request("/api/payments/google-play", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ purchaseToken: token, amount: 1, ownerId: other, state: "successful" }) }, identity);
const status = () => request(`/api/payments/cv-download?job=${job.id}`).then(r => r.json());

beforeEach(() => {
  process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL = "billing@example.iam.gserviceaccount.com";
  process.env.GOOGLE_PLAY_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`;
  process.env.GOOGLE_PLAY_BILLING_MODE = "test";
  process.env.GOOGLE_PLAY_ALLOW_TEST_PURCHASES = "true";
  for (const key of ["GOOGLE_PLAY_CV_PRODUCT_ID", "GOOGLE_PLAY_PURCHASE_OPTION_ID", "GOOGLE_PLAY_PACKAGE_NAME", "CV_DOWNLOAD_PRICE_CENTS", "MONTHLY_SUBSCRIPTIONS_ENABLED"]) delete process.env[key];
  db = billingDatabase(); env.DB = db; files = new Map(); consumed = 0; consumeFails = false; outage = false;
  const setJson = (key, value) => files.set(key, new TextEncoder().encode(JSON.stringify(value)));
  setJson(`jobs/${job.id}.json`, { job, cachedAt: Date.now() });
  setJson(`private/${owner}/profile/latest.json`, { provider: "nextjob-parser", parsedAt: "2026-01-01", verifiedAt: "2026-01-02", updatedAt: "2026-01-02", profile, content: { basics: { name: profile.fullName }, sections: {} } });
  setJson(`private/${owner}/applications/${job.id}/package.json`, { jobId: job.id, generatedAt: "2026-01-03", sourceRevision: "2026-01-02", template: "nextjob:professional:a8c9c4", content: { basics: { name: profile.fullName } }, application: createDemoApplication(profile, job), resumeProvider: "nextjob-template", documentsProvider: "nextjob-template", warnings: [], tone: "professional" });
  files.set(`private/${owner}/applications/${job.id}/tailored-cv.pdf`, textToPdf("Frozen purchased copy"));
  env.DOCUMENTS = {
    async get(key) { const value = files.get(key); if (!value) return null; return { body: value, text: async () => new TextDecoder().decode(value), arrayBuffer: async () => value.slice().buffer }; },
    async put(key, value) { files.set(key, value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value)); },
  };
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    if (target === "https://oauth2.googleapis.com/token") {
      const params = new URLSearchParams(init.body);
      assert.equal(params.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
      const parts = params.get("assertion").split(".");
      assert.equal(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", keyPair.publicKey, Buffer.from(parts[2], "base64url"), new TextEncoder().encode(parts.slice(0, 2).join("."))), true);
      const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      assert.equal(claims.scope, "https://www.googleapis.com/auth/androidpublisher");
      return Response.json({ access_token: "mock-oauth-token", expires_in: 3600 });
    }
    assert.equal(init.headers.authorization, "Bearer mock-oauth-token");
    assert.ok(target.startsWith("https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.markom91.nextjob/"));
    if (outage) return new Response(null, { status: 503 });
    if (target.endsWith(":consume")) {
      consumed++;
      if (consumeFails) return new Response(null, { status: 503 });
      purchase.productLineItem[0].productOfferDetails.consumptionState = "CONSUMPTION_STATE_CONSUMED";
      return new Response(null, { status: 204 });
    }
    assert.match(target, /purchases\/productsv2\/tokens\//);
    return Response.json(purchase);
  };
});
afterEach(() => { globalThis.fetch = originalFetch; db.sqlite.close(); delete env.DB; delete env.DOCUMENTS; });

async function prepare() {
  const response = await post(); assert.equal(response.status, 200, await response.clone().text());
  const result = await response.json(); assert.match(result.checkoutUrl, /^\/android-billing\?/);
  const id = new URL(result.checkoutUrl, "http://localhost").searchParams.get("order");
  context = await (await request(`/api/payments/google-play?order=${id}`)).json();
  purchase = { obfuscatedExternalAccountId: context.accountId, obfuscatedExternalProfileId: context.profileId, orderId: "GPA.test-1234", purchaseStateContext: { purchaseState: "PURCHASED" }, purchaseCompletionTime: new Date().toISOString(), testPurchaseContext: { fopType: "TEST" }, productLineItem: [{ productId: context.productId, productOfferDetails: { purchaseOptionId: "download", quantity: 1, refundableQuantity: 1, consumptionState: "CONSUMPTION_STATE_YET_TO_BE_CONSUMED" } }] };
  return result;
}

test("Android billing is off by default and unavailable to the previous wrapper", async () => {
  delete process.env.GOOGLE_PLAY_BILLING_MODE;
  assert.equal((await status()).available, false); assert.equal((await post()).status, 503);
  process.env.GOOGLE_PLAY_BILLING_MODE = "test";
  assert.equal((await post({}, { "user-agent": "NextJOBAndroid/0.1.1" })).status, 503);
  assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM billing_orders").get().n, 0);
});
test("a server-owned order freezes one CV and concurrent clicks reuse it", async () => {
  const result = await prepare();
  const responses = await Promise.all([post(), post()]);
  assert.ok(responses.every(r => r.status === 200));
  assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM billing_orders").get().n, 1);
  assert.ok(files.has(`private/${owner}/cv-versions/${result.versionId}/snapshot.json`));
  assert.equal(context.testOnly, true); assert.equal(context.amountCents, 150); assert.equal(context.productId, "tailored_cv_download");
  assert.notEqual(context.accountId, owner);
  assert.equal((await request(`/api/payments/google-play?order=${context.orderId}`, {}, other)).status, 404);
  assert.equal((await post({ model: "monthly_subscription" })).status, 409);
});
test("stale pricing and cross-origin requests cannot start a purchase", async () => {
  assert.equal((await post({ expectedAmountCents: 50 })).status, 409);
  assert.equal((await post({}, { origin: "https://evil.example" })).status, 403);
});
test("pending payments and untrusted success fields grant nothing", async () => {
  await prepare(); purchase.purchaseStateContext.purchaseState = "PENDING";
  assert.equal((await (await verify()).json()).state, "pending");
  assert.equal((await status()).purchased, false);
  assert.equal((await status()).available, false); assert.equal((await status()).code, "PAYMENT_PENDING");
  assert.equal((await post()).status, 409);
  assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM billing_entitlements").get().n, 0); assert.equal(consumed, 0);
});
test("Google account, CV profile, product, quantity and test mode must match the reserved order", async () => {
  await prepare(); const valid = structuredClone(purchase);
  for (const mutate of [p => p.obfuscatedExternalAccountId = "another-account", p => p.obfuscatedExternalProfileId = crypto.randomUUID(), p => p.productLineItem[0].productId = "other-product", p => p.productLineItem[0].productOfferDetails.quantity = 2, p => p.productLineItem[0].productOfferDetails.purchaseOptionId = "other-option", p => delete p.testPurchaseContext, p => p.purchaseCompletionTime = "2020-01-01T00:00:00Z"]) {
    purchase = structuredClone(valid); mutate(purchase);
    assert.equal((await verify()).status, 409);
    assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM billing_entitlements").get().n, 0);
  }
  purchase = valid; assert.equal((await verify("test-purchase-token-12345", other)).status, 409);
});
test("verified payment grants exactly one frozen CV and replay cannot extend access", async () => {
  const result = await prepare(); assert.equal((await verify()).status, 200);
  assert.equal(consumed, 1); assert.equal((await status()).purchased, true);
  const expiry = db.sqlite.prepare("SELECT expires_at FROM billing_entitlements").get().expires_at;
  assert.equal((await verify()).status, 200); assert.equal(consumed, 1);
  assert.equal(db.sqlite.prepare("SELECT expires_at FROM billing_entitlements").get().expires_at, expiry);
  assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM billing_entitlements").get().n, 1);
  const stored = db.sqlite.prepare("SELECT token_encrypted FROM billing_play_tokens").get();
  assert.ok(!stored.token_encrypted.includes("test-purchase-token"));
  for (const format of ["pdf", "docx", "txt"]) assert.equal((await request(`/api/documents/${format}?job=${job.id}&version=${result.versionId}`)).status, 200);
  const repeat = await (await post()).json(); assert.equal(repeat.reused, true); assert.ok(repeat.downloadUrl);
});
test("different tokens cannot fulfill the same order twice, including concurrent submissions", async () => {
  await prepare(); const responses = await Promise.all([verify("first-purchase-token-12345"), verify("second-purchase-token-12345")]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM billing_entitlements").get().n, 1);
});
test("consumption failure preserves paid access and resume retries without a second charge", async () => {
  await prepare(); consumeFails = true;
  const first = await (await verify()).json(); assert.equal(first.state, "successful"); assert.equal(first.consumeRetry, true);
  assert.equal((await status()).purchased, true);
  consumeFails = false; assert.equal((await (await verify()).json()).consumeRetry, false);
  assert.equal(consumed, 2); assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM billing_entitlements").get().n, 1);
});
test("the owner-only hourly task retries consumption even if the app stays closed", async () => {
  await prepare(); consumeFails = true; await verify(); consumeFails = false;
  db.sqlite.prepare("UPDATE billing_play_tokens SET verified_at = ?").run(Date.now() - 120000);
  process.env.NOTIFICATION_ADMIN_EMAIL = "billing-owner@example.invalid";
  const response = await request("/mcp", { method: "POST", headers: { "content-type": "application/json", "oai-authenticated-user-id": "owner", "oai-authenticated-user-email": "billing-owner@example.invalid" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "check_job_alerts" } }) });
  const body = await response.json();
  assert.equal(body.result.isError, undefined);
  assert.equal(JSON.parse(body.result.content[0].text).billing.retried, 1);
  assert.equal(consumed, 2);
  assert.ok(db.sqlite.prepare("SELECT consumed_at FROM billing_play_tokens").get().consumed_at);
});
test("disabling new sales does not lose a payment already made for a reserved order", async () => {
  await prepare(); process.env.GOOGLE_PLAY_BILLING_MODE = "off";
  assert.equal((await verify()).status, 200); assert.equal((await status()).purchased, true);
});
test("refunds revoke access and private recovery links cannot bypass Google verification", async () => {
  const result = await prepare(); await verify();
  const saved = await (await request("/api/payments/recovery-link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ versionId: result.versionId }) })).json();
  assert.ok(saved.url);
  purchase.productLineItem[0].productOfferDetails.refundableQuantity = 0;
  const recovery = await request(new URL(saved.url).pathname + new URL(saved.url).search, { headers: { cookie: "" } });
  assert.notEqual(recovery.status, 200);
  assert.equal(db.sqlite.prepare("SELECT status FROM billing_orders").get().status, "revoked");
  purchase.productLineItem[0].productOfferDetails.refundableQuantity = 1;
  assert.equal((await verify()).status, 409); assert.equal((await status()).purchased, false);
});
test("verification outage fails closed for both new grants and already-paid downloads", async () => {
  const result = await prepare(); outage = true;
  assert.equal((await verify()).status, 503); assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM billing_entitlements").get().n, 0);
  outage = false; await verify(); outage = true;
  assert.equal((await request(`/api/documents/pdf?job=${job.id}&version=${result.versionId}`)).status, 503);
});
