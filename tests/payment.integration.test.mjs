import assert from "node:assert/strict";
import test from "node:test";
import { env } from "cloudflare:workers";
import { createGuestToken, createSessionToken, guestUser, readGuestToken, signPayload } from "../lib/auth-session.ts";

process.env.NEXTJOB_DISABLE_LIVE_JOBS = "true";
process.env.AUTH_SECRET = "payment-tests-private-secret-123456789";
process.env.STRIPE_SECRET_KEY = "sk_test_fake_for_mock_only";
const { default: worker } = await import("../dist/server/index.js");
const ownerId = "guest_abcdefghijklmnopqrstuvwx";
const jobId = "payment-test-job";
const token = await createGuestToken(ownerId, process.env.AUTH_SECRET);
const cookie = `nextjob_guest=${token}`;
const profile = { verifiedAt: new Date().toISOString(), profile: { fullName: "Test Candidate" } };
const purchases = new Map();
env.DOCUMENTS = { get: async (key) => {
  if (purchases.has(key)) return { json: async () => JSON.parse(purchases.get(key)) };
  if (key === `jobs/${jobId}.json`) return { text: async () => JSON.stringify({ job: { id: jobId, title: "Engineer", company: "Test Employer", fictional: false }, cachedAt: Date.now() }) };
  if (key === `private/${ownerId}/profile/latest.json`) return { text: async () => JSON.stringify(profile) };
  if (key === `private/${ownerId}/applications/${jobId}/tailored-cv.pdf`) return { body: "%PDF-1.4\npaid-test-file" };
  return null;
}, put: async (key, value) => { purchases.set(key, typeof value === "string" ? value : new TextDecoder().decode(value)); } };
const request = (path, init = {}) => worker.fetch(new Request(`http://localhost${path}`, { ...init, headers: { cookie, ...init.headers } }), { ASSETS: { fetch: async () => new Response(null, { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });

test("guest workspace signatures reject tampering and expiry", async () => {
  assert.equal(await readGuestToken(token, process.env.AUTH_SECRET), ownerId);
  assert.equal(await readGuestToken(token + "x", process.env.AUTH_SECRET), null);
  const stale = await signPayload({ v: 1, id: ownerId, exp: 1 }, process.env.AUTH_SECRET);
  assert.equal(await readGuestToken(stale, process.env.AUTH_SECRET), null);
});

test("every CV format including inline PDF requires payment", async () => {
  for (const format of ["pdf", "docx", "txt"]) {
    const response = await request(`/api/documents/${format}?job=${jobId}`, { headers: { accept: "application/json" } });
    assert.equal(response.status, 402);
  }
  const preview = await request(`/api/documents/pdf?job=${jobId}&inline=true`, { headers: { accept: "application/json" } });
  assert.equal(preview.status, 402);
});

test("checkout fixes the price at 150 EUR cents and uses the server owner", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, "https://api.stripe.com/v1/checkout/sessions");
      const body = new URLSearchParams(init.body);
      assert.equal(body.get("line_items[0][price_data][unit_amount]"), "150");
      assert.equal(body.get("line_items[0][price_data][currency]"), "eur");
      assert.equal(body.get("metadata[ownerId]"), ownerId);
      return Response.json({ url: "https://checkout.stripe.com/test" });
    };
    const response = await request("/api/payments/cv-download", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId, format: "pdf", amount: 1, ownerId: "attacker" }) });
    assert.equal(response.status, 200);
  } finally { globalThis.fetch = original; }
});

test("only a paid session for this workspace, job, currency and amount unlocks the file", async () => {
  const original = globalThis.fetch;
  const paid = { id: "cs_test", created: Math.floor(Date.now() / 1000), status: "complete", payment_status: "paid", mode: "payment", currency: "eur", amount_total: 150, metadata: { ownerId, jobId, doc: "cv" } };
  try {
    for (const change of [{ payment_status: "unpaid" }, { amount_total: 1 }, { currency: "usd" }, { metadata: { ...paid.metadata, ownerId: "someone-else" } }]) {
      globalThis.fetch = async () => Response.json({ ...paid, ...change });
      const response = await request(`/api/payments/cv-download/success?session_id=cs_test&job=${jobId}&format=pdf`);
      assert.match(response.headers.get("location"), /not-confirmed/);
      assert.equal(response.headers.get("set-cookie"), null);
    }
    globalThis.fetch = async () => Response.json(paid);
    const success = await request(`/api/payments/cv-download/success?session_id=cs_test&job=${jobId}&format=pdf`);
    assert.equal(success.status, 303);
    assert.match(success.headers.get("location"), /api\/documents\/pdf/);
    const download = await request(`/api/documents/pdf?job=${jobId}`);
    assert.equal(download.status, 200);
    assert.match(await download.text(), /^%PDF/);
    const other = await createSessionToken(guestUser("guest_zyxwvutsrqponmlkjihgfedc"), process.env.AUTH_SECRET);
    const wrongOwner = await request(`/api/documents/pdf?job=${jobId}`, { headers: { cookie: `nextjob_session=${other}`, accept: "application/json" } });
    assert.notEqual(wrongOwner.status, 200);
  } finally { globalThis.fetch = original; }
});

test("signed Stripe webhooks record payment even if the browser never returns", async () => {
  purchases.clear();
  const secret = "whsec_test_only";
  process.env.STRIPE_WEBHOOK_SECRET = secret;
  const session = { id: "cs_webhook", created: Math.floor(Date.now() / 1000), status: "complete", payment_status: "paid", mode: "payment", currency: "eur", amount_total: 150, metadata: { ownerId, jobId, doc: "cv" } };
  const body = JSON.stringify({ type: "checkout.session.completed", data: { object: session } });
  const timestamp = Math.floor(Date.now() / 1000);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${body}`));
  const hex = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  const headers = { "stripe-signature": `t=${timestamp},v1=${hex}` };
  const forged = await request("/api/payments/webhook", { method: "POST", headers, body: body + " " });
  assert.equal(forged.status, 400);
  const valid = await request("/api/payments/webhook", { method: "POST", headers, body });
  assert.equal(valid.status, 200);
  assert.equal((await request(`/api/documents/pdf?job=${jobId}`)).status, 200);
  const originalRecord = purchases.values().next().value;
  const replay = await request("/api/payments/webhook", { method: "POST", headers, body });
  assert.equal(replay.status, 200);
  assert.equal(purchases.values().next().value, originalRecord);
});
