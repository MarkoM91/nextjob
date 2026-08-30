import assert from "node:assert/strict";
import test from "node:test";
import { candidate, jobs } from "../lib/demo-data.ts";
import { atsAnalyze, canonicalJobKey, createDemoApplication, deduplicateJobs, normalizeSalary, normalizeText, rankJobs, scoreJob, validateGeneratedClaims } from "../lib/engine.ts";
import { generateDocx, generatePdf } from "../lib/documents.ts";
import { GreenhouseJobProvider, LeverJobProvider, liveJobInternals } from "../lib/live-job-providers.ts";
import { candidateFromReactiveResume, createTailoredReactiveResume, parseAndImportReactiveResume, reactiveResumeInternals, sanitizeReactiveResumeData } from "../lib/reactive-resume.ts";

test("normalizes titles and accents deterministically", () => {
  assert.equal(normalizeText("  Customer-Succès  Manager "), "customer succes manager");
  assert.equal(canonicalJobKey(jobs[0]), canonicalJobKey(jobs[19]));
});

test("normalizes annual and hourly salaries without inventing a range", () => {
  assert.deepEqual(normalizeSalary(20, 25, "EUR", "HOUR", { EUR: 1 }), { annualMinEur: 41600, annualMaxEur: 52000, estimated: false });
  assert.deepEqual(normalizeSalary(5000, 6000, "USD", "MONTH", { USD: 0.9 }), { annualMinEur: 54000, annualMaxEur: 64800, estimated: true });
  assert.throws(() => normalizeSalary(50, 40, "EUR", "YEAR", { EUR: 1 }), /Invalid salary range/);
});

test("groups duplicate vacancies and prefers an employer ATS source", () => {
  const groups = deduplicateJobs(jobs);
  assert.equal(jobs.length, 30);
  assert.equal(groups.length, 29);
  const duplicate = groups.find((group) => group.sources.length === 2);
  assert.ok(duplicate);
  assert.equal(duplicate.canonical.providerName, "Direct ATS");
});

test("scoring uses hard eligibility and transparent match bands", () => {
  const good = scoreJob(candidate, jobs[0]);
  const unauthorized = scoreJob(candidate, jobs.find((job) => job.workAuthorization === "United States")!);
  assert.ok(good.score >= 72);
  assert.ok(["Excellent match", "Strong match"].includes(good.band));
  assert.equal(unauthorized.eligible, false);
  assert.equal(unauthorized.band, "Not eligible");
  assert.match(unauthorized.explanation, /work authorization/i);
  assert.ok(Object.keys(good.breakdown).includes("requiredSkills"));
});

test("ranking hides ineligible roles by default", () => {
  const publicFeed = rankJobs(candidate, jobs);
  const fullFeed = rankJobs(candidate, jobs, true);
  assert.ok(publicFeed.every((match) => match.eligible));
  assert.ok(fullFeed.some((match) => !match.eligible));
  assert.ok(publicFeed[0].score >= publicFeed[1].score);
});

test("ATS analysis is explicitly an estimate and flags unsupported keywords", () => {
  const report = atsAnalyze(candidate, jobs[0], "Salesforce customer support process improvement and fictional AWS mastery");
  assert.equal(report.label, "NextJOB ATS readiness estimate");
  assert.match(report.disclaimer, /Actual systems may differ/);
  assert.ok(report.overallScore >= 0 && report.overallScore <= 100);
});

test("every generated CV bullet is grounded in a verified source fact", () => {
  const application = createDemoApplication(candidate, jobs[0]);
  const validation = validateGeneratedClaims(application, candidate);
  assert.equal(validation.valid, true);
  assert.equal(validation.unsupported.length, 0);
  assert.ok(application.cvBullets.every((bullet) => bullet.sourceFactIds.length > 0 && bullet.supported));
});

test("document generators produce selectable PDF and editable DOCX packages", () => {
  const application = createDemoApplication(candidate, jobs[0]);
  const pdf = generatePdf(candidate, jobs[0], application);
  const docx = generateDocx(candidate, jobs[0], application);
  assert.equal(new TextDecoder().decode(pdf.slice(0, 8)), "%PDF-1.4");
  assert.deepEqual([...docx.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  assert.ok(pdf.byteLength > 1000);
  assert.ok(docx.byteLength > 1000);
});

test("crawler policy honors robots.txt specificity and rejects unsafe URLs", () => {
  const robots = `User-agent: *\nDisallow: /careers/private\nAllow: /careers/private/public-role`;
  assert.equal(liveJobInternals.robotsAllows(robots, "/careers/open-role"), true);
  assert.equal(liveJobInternals.robotsAllows(robots, "/careers/private/internal"), false);
  assert.equal(liveJobInternals.robotsAllows(robots, "/careers/private/public-role"), true);
  assert.throws(() => liveJobInternals.safeConfiguredUrl("http://example.com/job"), /public HTTPS/);
  assert.throws(() => liveJobInternals.safeConfiguredUrl("https://127.0.0.1/job"), /public HTTPS/);
  assert.throws(() => liveJobInternals.safeConfiguredUrl("https://www.linkedin.com/jobs/view/123"), /authorized partner API/);
  assert.throws(() => liveJobInternals.safeConfiguredUrl("https://it.indeed.com/viewjob?jk=123"), /authorized partner API/);
});

test("Greenhouse and Lever public feeds normalize real jobs without inventing employer data", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("boards-api.greenhouse.io")) return Response.json({ jobs: [{ id: 42, title: "IT Support Specialist", updated_at: "2026-08-20T10:00:00Z", absolute_url: "https://example.org/jobs/42", location: { name: "Milan, Italy" }, content: "Support Windows 11, Microsoft 365, DNS and VPN users." }] });
    if (url.includes("api.eu.lever.co")) return Response.json([{ id: "lever-42", text: "Workplace Support Technician", createdAt: 1787216400000, hostedUrl: "https://jobs.eu.lever.co/example/lever-42", descriptionPlain: "Troubleshoot hardware and Microsoft 365.", categories: { location: "Milan, Italy", commitment: "Full-time" } }]);
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const greenhouse = await new GreenhouseJobProvider("unit-test-board", "Unit Test Employer").searchJobs({ keywords: ["IT Support"] });
    const lever = await new LeverJobProvider("unit-test-site", "Unit Test Employer", "eu").searchJobs({ keywords: ["Workplace Support"] });
    assert.equal(greenhouse[0].fictional, false);
    assert.equal(greenhouse[0].countryCode, "IT");
    assert.ok(greenhouse[0].requiredSkills.includes("Microsoft 365"));
    assert.equal(lever[0].providerName, "Lever · Unit Test Employer");
    assert.equal(lever[0].applicationMethod, "external");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Reactive Resume parsing keeps career facts and discards unnecessary sensitive fields", () => {
  const content = sanitizeReactiveResumeData({
    basics: { name: "Jane Doe", headline: "Support Engineer", email: "jane@example.com", passport_or_id: "do-not-store", marital_status: "do-not-store" },
    sections: {
      experience: { items: [{ position: "Support Engineer", company: "Example", period: "2020 — Present", description: "<p>Resolved customer incidents and documented fixes.</p>" }] },
      skills: { items: [{ name: "Microsoft 365", proficiency: "Advanced" }] },
      languages: { items: [{ language: "English", fluency: "Fluent" }] },
    },
  });
  const profile = candidateFromReactiveResume(content, "owner-1");
  assert.equal(profile.fullName, "Jane Doe");
  assert.equal(profile.currentRole, "Support Engineer");
  assert.deepEqual(profile.skills, ["Microsoft 365"]);
  assert.equal(profile.experiences[0].bullets[0].text, "Resolved customer incidents and documented fixes.");
  assert.equal("passport_or_id" in (content.basics ?? {}), false);
  assert.equal("marital_status" in (content.basics ?? {}), false);
  assert.equal(reactiveResumeInternals.cleanRichText("<p>Clean &amp; factual</p>"), "Clean & factual");
});

test("Reactive Resume parser authenticates the account, uses the configured AI provider, and imports structured data", async () => {
  const originalFetch = globalThis.fetch;
  const originals = { apiKey: process.env.REACTIVE_RESUME_API_KEY, provider: process.env.AI_PROVIDER, aiKey: process.env.AI_PROVIDER_API_KEY, model: process.env.AI_MODEL };
  process.env.REACTIVE_RESUME_API_KEY = "reactive-unit-key";
  process.env.AI_PROVIDER = "openai";
  process.env.AI_PROVIDER_API_KEY = "ai-unit-key";
  process.env.AI_MODEL = "test-model";
  const requests: Array<{ url: string; apiKey: string; body: string }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input); const body = String(init?.body ?? "");
    requests.push({ url, apiKey: new Headers(init?.headers).get("x-api-key") ?? "", body });
    if (url.endsWith("/ai-providers") && init?.method === "GET") return Response.json([]);
    if (url.endsWith("/ai-providers") && init?.method === "POST") return Response.json({ id: "provider-1" });
    if (url.endsWith("/ai-providers/provider-1/test")) return Response.json({ tested: true });
    if (url.endsWith("/ai-providers/provider-1") && init?.method === "PATCH") return Response.json({ id: "provider-1", enabled: true });
    if (url.endsWith("/ai/parse-pdf")) return Response.json({ basics: { name: "Jane Doe", headline: "Support Engineer" }, sections: { skills: { items: [{ name: "Microsoft 365" }] } } });
    if (url.endsWith("/resumes/import")) return Response.json("resume-1");
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const parsed = await parseAndImportReactiveResume(new TextEncoder().encode("resume").buffer as ArrayBuffer, "jane.pdf", "application/pdf");
    assert.equal(requests[0].url, "https://rxresu.me/api/openapi/ai-providers");
    assert.equal(requests[0].apiKey, "reactive-unit-key");
    assert.match(requests[1].body, /"provider":"openai"/);
    assert.match(requests[1].body, /"apiKey":"ai-unit-key"/);
    assert.equal(requests[2].url, "https://rxresu.me/api/openapi/ai-providers/provider-1/test");
    assert.equal(requests[3].url, "https://rxresu.me/api/openapi/ai-providers/provider-1");
    assert.equal(requests[4].url, "https://rxresu.me/api/openapi/ai/parse-pdf");
    assert.match(requests[4].body, /"aiProviderId":"provider-1"/);
    assert.doesNotMatch(requests[4].body, /"apiKey"/);
    assert.equal(requests[5].url, "https://rxresu.me/api/openapi/resumes/import");
    assert.equal(parsed.resumeId, "resume-1");
    assert.equal(parsed.content.basics?.name, "Jane Doe");
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries({ REACTIVE_RESUME_API_KEY: originals.apiKey, AI_PROVIDER: originals.provider, AI_PROVIDER_API_KEY: originals.aiKey, AI_MODEL: originals.model })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test("Reactive Resume creates a job application, tailors its linked resume, and exports the PDF", async () => {
  const originalFetch = globalThis.fetch;
  const originals = { apiKey: process.env.REACTIVE_RESUME_API_KEY, provider: process.env.AI_PROVIDER, aiKey: process.env.AI_PROVIDER_API_KEY, model: process.env.AI_MODEL };
  process.env.REACTIVE_RESUME_API_KEY = "reactive-unit-key";
  process.env.AI_PROVIDER = "openai";
  process.env.AI_PROVIDER_API_KEY = "ai-unit-key";
  process.env.AI_MODEL = "test-model";
  let applicationBody = ""; let providerBody = ""; let pdfAttempts = 0; let applicationPosts = 0; let tailorPosts = 0; let providerCreated = false; let tailoredExists = false;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/ai-providers") && init?.method === "GET") return Response.json(providerCreated ? [{ id: "provider-1", label: "NextJOB", provider: "openai", model: "test-model", enabled: true, testStatus: "success" }] : []);
    if (url.endsWith("/ai-providers") && init?.method === "POST") { providerCreated = true; providerBody = String(init.body ?? ""); return Response.json({ id: "provider-1" }); }
    if (url.endsWith("/ai-providers/provider-1/test")) return Response.json({ tested: true });
    if (url.endsWith("/ai-providers/provider-1") && init?.method === "PATCH") return Response.json({ id: "provider-1", enabled: true });
    if (url.endsWith("/applications") && init?.method === "GET") return Response.json(tailoredExists ? [{ id: "application-1", company: jobs[0].company.replace(/\s+\(fictional\)$/i, ""), role: jobs[0].title, resumeId: "resume-tailored-1", sourceUrl: jobs[0].originalUrl, tags: ["NextJOB"] }] : []);
    if (url.endsWith("/applications") && init?.method === "POST") { applicationPosts += 1; applicationBody = String(init.body ?? ""); return Response.json("application-1"); }
    if (url.endsWith("/applications/application-1/ai/tailor-resume")) { tailorPosts += 1; tailoredExists = true; return Response.json({ resumeId: "resume-tailored-1", name: "Jane — Support" }); }
    if (url.endsWith("/resumes/resume-tailored-1/pdf?target=resume")) {
      pdfAttempts += 1;
      if (pdfAttempts === 1) return Response.json({ message: "PDF is still rendering" }, { status: 425 });
      return new Response(new TextEncoder().encode("%PDF-test"), { headers: { "content-type": "application/pdf" } });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const generated = await createTailoredReactiveResume("resume-base-1", jobs[0]);
    assert.equal(generated.applicationId, "application-1");
    assert.equal(generated.resumeId, "resume-tailored-1");
    assert.match(providerBody, /"label":"NextJOB"/);
    assert.match(applicationBody, new RegExp(jobs[0].title));
    assert.match(applicationBody, /"resumeId":"resume-base-1"/);
    assert.equal(pdfAttempts, 2);
    assert.equal(new TextDecoder().decode(generated.pdf), "%PDF-test");
    const reused = await createTailoredReactiveResume("resume-base-1", jobs[0]);
    assert.equal(reused.applicationId, "application-1");
    assert.equal(reused.resumeId, "resume-tailored-1");
    assert.equal(applicationPosts, 1);
    assert.equal(tailorPosts, 1);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries({ REACTIVE_RESUME_API_KEY: originals.apiKey, AI_PROVIDER: originals.provider, AI_PROVIDER_API_KEY: originals.aiKey, AI_MODEL: originals.model })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
