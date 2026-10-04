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
  assert.match(html, /One place to find, assess and apply for the right roles/);
  assert.match(html, /Private by default/);
  assert.match(html, /No account required/);
  assert.doesNotMatch(html, /codex-preview|Building your site|react-loading-skeleton/);
});

test("HTML and version checks identify the same deployment and cannot reuse stale responses", async () => {
  const versionResponse = await request("/api/version");
  assert.equal(versionResponse.status, 200);
  assert.match(versionResponse.headers.get("cache-control"), /no-store/);
  const { version } = await versionResponse.json();
  assert.equal(typeof version, "string");
  assert.notEqual(version, "dev", "production builds must identify the deployed bundle");
  const page = await request("/matches");
  assert.match(page.headers.get("cache-control"), /no-store/);
  assert.equal(page.headers.get("x-nextjob-build"), version);
  assert.ok((await page.text()).includes(`name="nextjob-build" content="${version}"`));
});

test("main onboarding pages render in a complete walkthrough", async () => {
  for (const [path, text] of [["/upload", "Upload your current CV"], ["/profile-review", "Ready to find your next job?"], ["/preferences", "Your job search"], ["/dashboard", "Checking current employer listings"]]) {
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

test("matches API never invents fallback jobs when a verified profile is unavailable", async () => {
  const response = await request("/api/matches?limit=5");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.matches.length, 0);
  assert.equal(body.sourceMode, "profile-required");
  assert.equal(body.profileRequired, true);
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

test("an anonymous CV upload stays private and explains missing workspace configuration", async () => {
  const form = new FormData();
  form.set("cv", new File([new TextEncoder().encode("%PDF-1.4\n")], "candidate.pdf", { type: "application/pdf" }));
  form.set("aiProcessingConsent", "true");
  const response = await request("/api/cv/upload", { method: "POST", headers: { origin: "http://localhost" }, body: form });
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.code, "ANONYMOUS_WORKSPACE_NOT_CONFIGURED");
  assert.equal("profile" in body, false);
  // The refusal comes before any server configuration is described.
  assert.equal("missingConfiguration" in body, false);
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

test("CV design changes validate the template and require a real job", async () => {
  const headers = { "content-type": "application/json", origin: "http://localhost" };
  const list = await request("/api/applications/template");
  assert.equal(list.status, 200);
  assert.ok((await list.json()).templates.includes("onyx"));
  const unknownDesign = await request("/api/applications/template", { method: "POST", headers, body: JSON.stringify({ jobId: "job-01", template: "bulbasaur" }) });
  assert.equal(unknownDesign.status, 400);
  const fictionalJob = await request("/api/applications/template", { method: "POST", headers, body: JSON.stringify({ jobId: "job-01", template: "kakuna" }) });
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
  // The in-browser CV designer runs the PDF engine's WebAssembly, which loads from a data: URL.
  assert.match(response.headers.get("content-security-policy") ?? "", /script-src[^;]*'wasm-unsafe-eval'/);
  assert.match(response.headers.get("content-security-policy") ?? "", /connect-src[^;]*data:/);
  assert.match(response.headers.get("permissions-policy") ?? "", /camera=\(\)/);
});

test("the sign-in page offers only the providers this server has configured", async () => {
  const response = await request("/api/auth/session");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.signedIn, false);
  assert.deepEqual(body.providers, []);
  assert.equal(body.passwordEnabled, false, "AUTH_SECRET is unset in tests, so no sign-in method is advertised");
});

test("an unconfigured provider never redirects to a half-built consent screen", async () => {
  const response = await request("/api/auth/google/start");
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get("location"));
  assert.equal(location.pathname, "/sign-in");
  assert.match(location.searchParams.get("error"), /not configured/i);
});

test("an unknown provider is refused rather than guessed at", async () => {
  const response = await request("/api/auth/myspace/start");
  assert.equal(response.status, 302);
  assert.match(new URL(response.headers.get("location")).searchParams.get("error"), /not available/i);
});

test("a forged callback without matching state cannot create a session", async () => {
  const response = await request("/api/auth/google/callback?code=stolen-code&state=forged");
  assert.equal(response.status, 302);
  const setCookie = response.headers.get("set-cookie") ?? "";
  assert.doesNotMatch(setCookie, /nextjob_session=[^;]+/, "no session cookie is ever issued for an unverified callback");
  assert.equal(new URL(response.headers.get("location")).pathname, "/sign-in");
});

test("password sign-in refuses cross-origin posts and unconfigured servers", async () => {
  const crossOrigin = await request("/api/auth/password", { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: JSON.stringify({ intent: "sign-in", email: "a@b.com", password: "a-long-enough-password" }) });
  assert.equal(crossOrigin.status, 403);
  const sameOrigin = await request("/api/auth/password", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost" }, body: JSON.stringify({ intent: "sign-in", email: "a@b.com", password: "a-long-enough-password" }) });
  assert.equal(sameOrigin.status, 503);
  assert.equal((await sameOrigin.json()).code, "AUTH_NOT_CONFIGURED");
});

test("signing out clears the session cookie", async () => {
  const response = await request("/api/auth/signout?return_to=%2F");
  assert.equal(response.status, 302);
  assert.match(response.headers.get("set-cookie") ?? "", /nextjob_session=;[^]*Max-Age=0/);
});

test("legacy sign-in URLs return people to the account-free upload flow", async () => {
  const response = await request("/sign-in");
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "http://localhost/upload");
});


test("the upload screen is reachable without an account so the CV comes first", async () => {
  const response = await request("/upload");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Upload your current CV/);
  assert.doesNotMatch(html, /Save your CV to your account/, "the sign-in step appears only once an upload is attempted");
});
