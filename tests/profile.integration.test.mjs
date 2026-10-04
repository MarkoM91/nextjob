import assert from "node:assert/strict";
import test from "node:test";
import { env } from "cloudflare:workers";
import { candidate, jobs } from "../lib/demo-data.ts";
import { createGuestToken } from "../lib/auth-session.ts";
import { reviewFields } from "../lib/profile-review.ts";
import { createDemoApplication } from "../lib/engine.ts";

process.env.AUTH_SECRET = "profile-tests-private-secret-123456789";
process.env.NEXTJOB_DISABLE_LIVE_JOBS = "true";
const { default: worker } = await import("../dist/server/index.js");
const owner = "guest_profiletestsabcdefghijkl";
const other = "guest_otherprofileabcdefghijkl";
const tokens = { [owner]: await createGuestToken(owner, process.env.AUTH_SECRET), [other]: await createGuestToken(other, process.env.AUTH_SECRET) };
const profileKey = `private/${owner}/profile/latest.json`;
const realJob = { ...jobs[0], id: "persisted-real-job", fictional: false };
const store = new Map([[profileKey, JSON.stringify({ provider: "reactive-resume", externalResumeId: "base", parsedAt: "2026-01-01", verifiedAt: "2026-01-02", profile: candidate, content: { basics: { name: candidate.fullName }, sections: {} } })], [`jobs/${realJob.id}.json`, JSON.stringify({ job: realJob, cachedAt: Date.now() })]]);
let unavailable = false;
env.DOCUMENTS = {
  get: async (key) => store.has(key) ? { text: async () => store.get(key) } : null,
  put: async (key, bytes) => { if (unavailable) throw new Error("storage unavailable"); store.set(key, new TextDecoder().decode(bytes)); },
};
const request = (path, body, identity = owner) => worker.fetch(new Request(`http://localhost${path}`, { method: body ? "POST" : "GET", headers: { cookie: `nextjob_guest=${tokens[identity]}`, origin: "http://localhost", accept: "application/json", "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }), { ASSETS: { fetch: async () => new Response(null, { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });

test("profile corrections and job preferences survive a fresh request without changing ownership", async () => {
  const corrected = { ...reviewFields(candidate), location: "Milano", fullName: "Reviewed Candidate", skills: [...candidate.skills, "PowerShell (basic)"] };
  assert.equal((await request("/api/cv/profile", { profile: corrected, confirmAll: true })).status, 200);
  const preferences = { ...candidate.preferences, targetTitles: ["IT Help Desk"], workplace: ["Hybrid"], countries: ["Italy", "Germany"], minimumAnnualSalaryEur: 28000 };
  assert.equal((await request("/api/cv/profile", { preferences })).status, 200);
  const persisted = await (await request("/api/cv/profile")).json();
  assert.equal(persisted.profile.fullName, corrected.fullName);
  assert.equal(persisted.profile.location, "Milano");
  assert.deepEqual(persisted.profile.targetTitles, ["IT Help Desk"]);
  assert.deepEqual(persisted.profile.preferences.workplace, ["Hybrid"]);
  assert.deepEqual(persisted.profile.preferences.countries, ["Italy", "Germany"]);
  assert.ok(persisted.verifiedAt && persisted.updatedAt);
  assert.equal(persisted.resume.basics.name, corrected.fullName);
  assert.equal(persisted.profile.id, candidate.id);
  assert.equal((await request("/api/cv/profile", { profile: { ...corrected, id: "other" } })).status, 400);
  assert.equal((await request("/api/cv/profile", { profile: corrected, confirmAll: true }, other)).status, 409);
});

test("saved jobs round-trip, remain visible outside the feed, and are isolated by owner", async () => {
  const save = await request("/api/saved-jobs", { jobId: realJob.id, saved: true });
  assert.equal(save.status, 200);
  assert.equal((await save.json()).persisted, true);
  const reloaded = await (await request("/api/saved-jobs")).json();
  assert.deepEqual(reloaded.savedJobIds, [realJob.id]);
  assert.equal(reloaded.matches[0].job.id, realJob.id);
  assert.deepEqual((await (await request("/api/saved-jobs", undefined, other)).json()).savedJobIds, []);
  assert.equal((await request("/api/saved-jobs", { jobId: jobs[0].id, saved: true })).status, 404);
  assert.equal((await request("/api/saved-jobs", { jobId: realJob.id, saved: false })).status, 200);
  assert.deepEqual((await (await request("/api/saved-jobs")).json()).savedJobIds, []);
  unavailable = true;
  try { assert.equal((await request("/api/saved-jobs", { jobId: realJob.id, saved: true })).status, 503); }
  finally { unavailable = false; }
  assert.deepEqual((await (await request("/api/saved-jobs")).json()).savedJobIds, []);
});

test("a local CV design persists its PDF, reviewed content and edited summary without calling a provider", async () => {
  const resume = JSON.parse(store.get(profileKey));
  const { tailoredApplicationKey } = await import("../lib/resume-storage.ts");
  const key = tailoredApplicationKey(owner, realJob.id);
  store.set(key, JSON.stringify({ jobId: realJob.id, generatedAt: new Date().toISOString(), sourceRevision: resume.updatedAt, resumeProvider: "reactive-resume", application: createDemoApplication(resume.profile, realJob), content: resume.content }));
  const form = new FormData();
  form.set("pdf", new Blob(["%PDF-" + "test ".repeat(40)], { type: "application/pdf" }), "cv.pdf");
  form.set("summary", "My reviewed and edited summary.");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("A design change must not call a provider"); };
  try {
    const response = await worker.fetch(new Request(`http://localhost/api/documents/cv?job=${realJob.id}&design=nextjob:professional:a8c9c4`, { method: "POST", headers: { cookie: `nextjob_guest=${tokens[owner]}`, origin: "http://localhost" }, body: form }), {}, { waitUntil() {} });
    assert.equal(response.status, 200, await response.text());
    const saved = JSON.parse(store.get(key));
    assert.equal(saved.application.summary, "My reviewed and edited summary.");
    assert.equal(saved.content.basics.name, "Reviewed Candidate");
    assert.equal(saved.template, "nextjob:professional:a8c9c4");
    assert.equal(JSON.parse(store.get(profileKey)).preferredTemplate, saved.template);
  } finally { globalThis.fetch = originalFetch; }
});
