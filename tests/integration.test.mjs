import assert from "node:assert/strict";
import test from "node:test";

process.env.NEXTJOB_DISABLE_LIVE_JOBS = "true";

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
  assert.match(html, /Find work that fits\. Apply without the busywork\./);
  assert.match(html, /Private by default/);
  assert.match(html, /Nothing sent without your review/);
  assert.doesNotMatch(html, /codex-preview|Building your site|react-loading-skeleton/);
});

test("main onboarding pages render in a complete walkthrough", async () => {
  for (const [path, text] of [["/upload", "Upload your current CV"], ["/profile-review", "Does this look like you?"], ["/preferences", "What should NextJOB look for?"], ["/dashboard", "Checking today’s employer listings"]]) {
    const response = await request(path);
    assert.equal(response.status, 200, path);
    assert.match(await response.text(), new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), path);
  }
});

test("the obsolete simulated processing screen returns to the real upload flow", async () => {
  const response = await request("/processing");
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "http://localhost/upload");
});

test("legacy application links never claim verified submission", async () => {
  const response = await request("/matches?applied=job-01");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Application recorded/);
  assert.match(html, /has not received an employer confirmation/);
  assert.doesNotMatch(html, /Application verified and submitted/);
});

test("matches API never invents fallback jobs when live providers are unavailable", async () => {
  const response = await request("/api/matches?limit=5");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.matches.length, 0);
  assert.equal(body.sourceMode, "unavailable");
  assert.equal(body.fictional, false);
  assert.equal(body.estimateLabel, "NextJOB match estimate");
});

test("provider ingestion degrades gracefully", async () => {
  const response = await request("/api/providers/health");
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.ok(body.providers.some((provider) => provider.status === "offline"));
  assert.ok(body.providers.some((provider) => provider.status === "healthy"));
});

test("application generation refuses nonexistent or fictional jobs", async () => {
  const response = await request("/api/applications/generate", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost" }, body: JSON.stringify({ jobId: "job-01", tone: "Professional" }) });
  const body = await response.json();
  assert.equal(response.status, 404);
  assert.match(body.error, /live job/i);
});

test("profile endpoint exposes the safe fallback until a CV is parsed", async () => {
  const response = await request("/api/cv/profile");
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.source, "nextjob-fallback");
  assert.ok(body.profile.fullName);
});

test("a real CV upload never silently becomes the fictional fallback profile", async () => {
  const form = new FormData();
  form.set("cv", new File([new TextEncoder().encode("%PDF-1.4\n")], "candidate.pdf", { type: "application/pdf" }));
  form.set("aiProcessingConsent", "true");
  const response = await request("/api/cv/upload", { method: "POST", headers: { origin: "http://localhost" }, body: form });
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.code, "PROVIDER_NOT_CONFIGURED");
  assert.equal("profile" in body, false);
});

test("application activity requires a real job and an explicit action", async () => {
  const headers = { "content-type": "application/json", origin: "http://localhost" };
  const invalidResponse = await request("/api/applications/submit", { method: "POST", headers, body: JSON.stringify({ jobId: "job-01", confirmed: true }) });
  assert.equal(invalidResponse.status, 400);
  const missingJobResponse = await request("/api/applications/submit", { method: "POST", headers, body: JSON.stringify({ jobId: "job-01", action: "native", confirmed: true }) });
  assert.equal(missingJobResponse.status, 404);
});

test("document endpoint requires a current live job", async () => {
  const missingJob = await request("/api/documents/pdf");
  assert.equal(missingJob.status, 400);
  const fictionalJob = await request("/api/documents/pdf?job=job-01");
  assert.equal(fictionalJob.status, 404);
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
