import assert from "node:assert/strict";
import test from "node:test";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

async function request(path, init = {}) {
  return worker.fetch(
    new Request(`http://localhost${path}`, init),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("landing page replaces the starter and communicates the core promise", async () => {
  const response = await request("/");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Upload your CV\. Find jobs worldwide\. Apply with confidence\./);
  assert.match(html, /Nothing is submitted automatically/);
  assert.match(html, /Your experience is never invented/);
  assert.doesNotMatch(html, /codex-preview|Building your site|react-loading-skeleton/);
});

test("main onboarding pages render in a complete walkthrough", async () => {
  for (const [path, text] of [["/upload", "Upload your current CV"], ["/processing", "Turning your experience into a factual profile"], ["/profile-review", "Does this look like you?"], ["/preferences", "What should NextJOB look for?"], ["/dashboard", "Your search is in focus"]]) {
    const response = await request(path);
    assert.equal(response.status, 200, path);
    assert.match(await response.text(), new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), path);
  }
});

test("matches API returns curated, eligible, fictional jobs", async () => {
  const response = await request("/api/matches?limit=5");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.matches.length, 5);
  assert.ok(body.matches.every((match) => match.eligible && match.job.fictional));
  assert.equal(body.estimateLabel, "NextJOB match estimate");
});

test("provider ingestion degrades gracefully", async () => {
  const response = await request("/api/providers/health");
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.ok(body.providers.some((provider) => provider.status === "offline"));
  assert.ok(body.providers.some((provider) => provider.status === "healthy"));
});

test("application generation is structured and factually validated", async () => {
  const response = await request("/api/applications/generate", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost" }, body: JSON.stringify({ jobId: "job-01", tone: "Professional" }) });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.factualValidation.valid, true);
  assert.equal(body.application.validationResult, "passed");
  assert.equal(body.application.ats.label, "NextJOB ATS readiness estimate");
});

test("native applications require authorization and explicit review confirmation", async () => {
  const headers = { "content-type": "application/json", origin: "http://localhost" };
  const nativeResponse = await request("/api/applications/submit", { method: "POST", headers, body: JSON.stringify({ jobId: "job-01", confirmed: true }) });
  const nativeBody = await nativeResponse.json();
  assert.equal(nativeResponse.status, 200);
  assert.equal(nativeBody.status, "submitted");
  assert.equal(nativeBody.demoMode, true);

  const unsupportedResponse = await request("/api/applications/submit", { method: "POST", headers, body: JSON.stringify({ jobId: "job-02", confirmed: true }) });
  const unsupportedBody = await unsupportedResponse.json();
  assert.equal(unsupportedResponse.status, 409);
  assert.equal(unsupportedBody.applicationMethod, "autofill");
});

test("document endpoint downloads real PDF, DOCX, and plain text", async () => {
  for (const [format, signature] of [["pdf", [0x25, 0x50, 0x44, 0x46]], ["docx", [0x50, 0x4b, 0x03, 0x04]]]) {
    const response = await request(`/api/documents/${format}?job=job-01`);
    assert.equal(response.status, 200);
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer()).slice(0, 4)], signature);
    assert.match(response.headers.get("content-disposition") ?? "", /attachment/);
  }
  const textResponse = await request("/api/documents/txt?job=job-01");
  assert.match(await textResponse.text(), /PROFESSIONAL SUMMARY/);
});

test("write endpoints reject cross-site origins", async () => {
  const response = await request("/api/applications/generate", { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: JSON.stringify({ jobId: "job-01", tone: "Professional" }) });
  assert.equal(response.status, 403);
});

test("security headers protect rendered routes", async () => {
  const response = await request("/dashboard");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  assert.match(response.headers.get("permissions-policy") ?? "", /camera=\(\)/);
});
