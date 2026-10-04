import assert from "node:assert/strict";
import test from "node:test";
import { env } from "cloudflare:workers";
import { createGuestToken } from "../lib/auth-session.ts";
import { candidate, jobs } from "../lib/demo-data.ts";
import { candidateFromReactiveResume } from "../lib/reactive-resume.ts";

process.env.AUTH_SECRET = "upload-tests-private-secret-123456789";
process.env.NEXTJOB_DISABLE_LIVE_JOBS = "true";
process.env.AI_PROVIDER = "openai";
process.env.AI_PROVIDER_API_KEY = "private-test-key";
process.env.AI_MODEL = "test-model";
delete process.env.REACTIVE_RESUME_API_KEY;
const { default: worker } = await import("../dist/server/index.js");
// Initialise vinext's request globals before replacing the external fetch adapter.
await worker.fetch(new Request("http://localhost/api/version"), {}, { waitUntil() {} });
const owner = "guest_uploadtestsabcdefghijkl";
const token = await createGuestToken(owner, process.env.AUTH_SECRET);
const key = `private/${owner}/profile/latest.json`;
const store = new Map();
env.DOCUMENTS = {
  get: async name => store.has(name) ? { text: async () => store.get(name) } : null,
  put: async (name, bytes) => { store.set(name, typeof bytes === "string" ? bytes : new TextDecoder().decode(bytes)); },
  delete: async name => { store.delete(name); },
};
const parsedContent = {
  basics: { name: "Jane Doe", headline: "IT Help Desk", location: "Milano" },
  sections: { experience: { items: [{ id: "work-1", position: "IT Help Desk", company: "Source Employer", period: "2020 — 2025", description: "Resolved help desk incidents." }] }, skills: { items: [{ name: "PowerShell", proficiency: "basic" }] }, languages: { items: [{ language: "English", fluency: "B2" }] } },
};
const result = content => Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(content) }] }] });
let ip = 1;
function upload(bytes = "%PDF-source", filename = "cv.pdf", mediaType = "application/pdf", consent = true, cookie = `nextjob_guest=${token}`) {
  const form = new FormData(); form.set("cv", new File([bytes], filename, { type: mediaType }));
  if (consent) form.set("aiProcessingConsent", "true");
  return worker.fetch(new Request("http://localhost/api/cv/upload", { method: "POST", headers: { origin: "http://localhost", cookie, "cf-connecting-ip": `10.1.1.${ip++}` }, body: form }), {}, { waitUntil() {} });
}

test("PDF/DOCX parsing works without Reactive Resume and preserves explicit source levels", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => { requests.push({ url: String(url), body: JSON.parse(init.body), headers: new Headers(init.headers) }); return result(parsedContent); };
  try {
    const pdf = await upload(); assert.equal(pdf.status, 201, await pdf.clone().text());
    assert.equal((await pdf.json()).parsingProvider, "nextjob-parser");
    const stored = JSON.parse(store.get(key));
    assert.equal(stored.content.sections.languages.items[0].fluency, "B2");
    assert.equal(stored.content.sections.skills.items[0].proficiency, "basic");
    assert.equal(stored.verifiedAt, undefined);
    assert.equal(stored.externalResumeId, undefined);
    assert.equal(stored.sourceHash.length, 64);
    const docx = await upload(new Uint8Array([80, 75, 3, 4, 1]), "cv.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    assert.equal(docx.status, 201);
    assert.equal(requests.length, 2);
    assert.ok(requests.every(request => request.url === "https://api.openai.com/v1/responses" && request.body.store === false));
    assert.equal(requests[0].headers.get("authorization"), "Bearer private-test-key");
    assert.match(requests[0].body.input[0].content[0].file_data, /^data:application\/pdf;base64,/);
    assert.match(requests[1].body.input[0].content[0].file_data, /^data:application\/vnd.openxmlformats/);
  } finally { globalThis.fetch = originalFetch; }
});

test("identical uploads retain reviewed corrections, preferences and design without a new provider request", async () => {
  const before = JSON.parse(store.get(key)); before.verifiedAt = "2026-01-02"; before.profile.fullName = "Reviewed Jane"; before.preferredTemplate = "nextjob:professional:a8c9c4";
  store.set(key, JSON.stringify(before));
  const originalFetch = globalThis.fetch; globalThis.fetch = async () => { throw new Error("Duplicate must not call provider"); };
  try {
    const response = await upload(new Uint8Array([80, 75, 3, 4, 1]), "renamed.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    assert.equal(response.status, 200); assert.equal((await response.json()).reused, true);
    assert.deepEqual(JSON.parse(store.get(key)), before);
  } finally { globalThis.fetch = originalFetch; }
});

test("provider failure keeps the saved CV and gives a safe recoverable error, including a guest cookie", async () => {
  const snapshot = store.get(key);
  const originalFetch = globalThis.fetch; let attempts = 0;
  globalThis.fetch = async () => { attempts++; return Response.json({ error: "private-provider-detail" }, { status: 503 }); };
  try {
    const response = await upload("%PDF-different"); assert.equal(response.status, 502);
    const body = await response.text(); assert.doesNotMatch(body, /private-provider-detail|Reactive Resume request failed|private-test-key/);
    assert.match(body, /selected file is still here/); assert.equal(attempts, 2);
    assert.equal(store.get(key), snapshot);
    assert.ok(![...store.values()].includes("%PDF-different"));
    const anonymous = await upload("%PDF-anonymous", "cv.pdf", "application/pdf", true, "");
    assert.equal(anonymous.status, 502); assert.match(anonymous.headers.get("set-cookie"), /nextjob_guest=/);
  } finally { globalThis.fetch = originalFetch; }
});

test("unreadable content, invalid signatures, mismatched types and missing consent never replace a saved CV", async () => {
  const snapshot = store.get(key);
  const originalFetch = globalThis.fetch; let attempts = 0;
  globalThis.fetch = async () => { attempts++; return result({ unreadable: true }); };
  try {
    assert.equal((await upload("%PDF-unreadable")).status, 422);
    assert.equal((await upload("not a PDF")).status, 415);
    assert.equal((await upload("%PDF-wrongmime", "cv.pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).status, 415);
    assert.equal((await upload("%PDF-no-consent", "cv.pdf", "application/pdf", false)).status, 400);
    assert.equal(attempts, 1); assert.equal(store.get(key), snapshot);
  } finally { globalThis.fetch = originalFetch; }
});

test("locally parsed CVs can be verified and used for a real tailored application during provider downtime", async () => {
  const source = JSON.parse(store.get(key)); source.profile = candidateFromReactiveResume(parsedContent, owner); source.content = parsedContent; delete source.verifiedAt;
  store.set(key, JSON.stringify(source));
  const job = { ...jobs[0], id: "upload-real-job", fictional: false };
  store.set(`jobs/${job.id}.json`, JSON.stringify({ job, cachedAt: Date.now() }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Simulated writer outage"); };
  try {
    const generate = () => worker.fetch(new Request("http://localhost/api/applications/generate", { method: "POST", headers: { cookie: `nextjob_guest=${token}`, origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify({ jobId: job.id }) }), {}, { waitUntil() {} });
    assert.equal((await generate()).status, 409, "extraction must not silently verify a CV");
    const confirm = await worker.fetch(new Request("http://localhost/api/cv/profile", { method: "POST", headers: { cookie: `nextjob_guest=${token}`, origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify({ confirmAll: true }) }), {}, { waitUntil() {} });
    assert.equal(confirm.status, 200);
    const response = await generate();
    assert.equal(response.status, 200, await response.clone().text());
    const pkg = await response.json(); assert.equal(pkg.demoMode, false); assert.equal(pkg.generationProvider, "nextjob-template"); assert.equal(pkg.tailoredResume.basics.name, "Jane Doe"); assert.deepEqual(pkg.templates, []);
    assert.ok(store.has(`private/${owner}/applications/${job.id}/package.json`));
    const profileResponse = await worker.fetch(new Request("http://localhost/api/cv/profile", { headers: { cookie: `nextjob_guest=${token}` } }), {}, { waitUntil() {} });
    assert.equal((await profileResponse.json()).source, "nextjob-parser");
  } finally { globalThis.fetch = originalFetch; }
});
