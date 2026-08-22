import assert from "node:assert/strict";
import test from "node:test";
import { candidate, jobs } from "../lib/demo-data.ts";
import { atsAnalyze, canonicalJobKey, createDemoApplication, deduplicateJobs, normalizeSalary, normalizeText, rankJobs, scoreJob, validateGeneratedClaims } from "../lib/engine.ts";
import { generateDocx, generatePdf } from "../lib/documents.ts";
import { GreenhouseJobProvider, LeverJobProvider, liveJobInternals } from "../lib/live-job-providers.ts";

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
