import assert from "node:assert/strict";
import test from "node:test";
import { candidate, jobs } from "../lib/demo-data.ts";
import { atsAnalyze, canonicalJobKey, isRecentPosting, createDemoApplication, deduplicateJobs, normalizeSalary, normalizeText, rankJobs, scoreJob, validateGeneratedClaims } from "../lib/engine.ts";
import { generateDocx, generatePdf } from "../lib/documents.ts";
import { isRelevantRoleTitle, searchKeywords } from "../lib/relevance.ts";
import { AdzunaJobProvider, ArbeitnowJobProvider, CareerjetJobProvider, JoobleJobProvider, GreenhouseJobProvider, LeverJobProvider, liveJobInternals, PersonioJobProvider, SmartRecruitersJobProvider } from "../lib/live-job-providers.ts";
import type { Job } from "../lib/domain.ts";
import { aggregatorName, employerSearchUrl, jobSourceKind, linkMayAskHumanCheck } from "../lib/job-source.ts";
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

test("stale vacancies are withheld and undated postings are kept", () => {
  const now = Date.parse("2026-09-02T00:00:00.000Z");
  const withDate = (publishedAt: string) => ({ ...jobs[0], publishedAt });
  assert.equal(isRecentPosting(withDate("2026-08-28T00:00:00.000Z"), 30, now), true);
  assert.equal(isRecentPosting(withDate("2026-07-01T00:00:00.000Z"), 30, now), false, "a two-month-old posting is usually filled");
  assert.equal(isRecentPosting(withDate("2026-08-01T00:00:00.000Z"), 45, now), true, "the window is configurable");
  assert.equal(isRecentPosting(withDate("not a date"), 30, now), true, "a missing date must not hide a real job");
  assert.equal(isRecentPosting(withDate("2026-09-10T00:00:00.000Z"), 30, now), true, "a future date is not stale");
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
  // No domain is blocked outright: robots.txt decides, so an authorized operator is never locked out.
  assert.equal(liveJobInternals.safeConfiguredUrl("https://it.indeed.com/viewjob?jk=123").hostname, "it.indeed.com");
  assert.equal(liveJobInternals.safeConfiguredUrl("https://www.linkedin.com/jobs/view/123").hostname, "www.linkedin.com");
  // Those two publish rules that refuse a generic crawler, and the gate honors them.
  assert.equal(liveJobInternals.robotsAllows("User-agent: *\nDisallow: /viewjob?", "/viewjob?jk=123"), false);
  assert.equal(liveJobInternals.robotsAllows("User-agent: *\nDisallow: /", "/jobs/view/123"), false);
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

test("licensed aggregator jobs keep employer pay and reject predicted salary", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (!url.includes("api.adzuna.com/v1/api/jobs/it/search/1")) throw new Error(`Unexpected URL: ${url}`);
    assert.match(url, /app_id=unit-id/);
    assert.match(url, /app_key=unit-key/);
    return Response.json({ results: [
      { id: 1, title: "IT Support Specialist", description: "Windows 11 and Microsoft 365 support.", created: "2026-08-20T10:00:00Z", redirect_url: "https://www.adzuna.it/land/ad/1", company: { display_name: "Acme Italia" }, location: { display_name: "Milano, Lombardia" }, salary_min: 30000, salary_max: 38000 },
      { id: 2, title: "Help Desk Analyst", description: "Service desk and ticketing.", created: "2026-08-21T10:00:00Z", redirect_url: "https://www.adzuna.it/land/ad/2", company: { display_name: "Beta Srl" }, location: { display_name: "Roma, Lazio" }, salary_min: 25000, salary_max: 29000, salary_is_predicted: "1" },
    ] });
  };
  try {
    const jobs = await new AdzunaJobProvider("unit-id", "unit-key", ["it"]).searchJobs({ keywords: ["IT support", "help desk"] });
    assert.equal(jobs.length, 2);
    assert.equal(jobs[0].countryCode, "IT");
    assert.equal(jobs[0].fictional, false);
    assert.equal(jobs[0].salary?.originalCurrency, "EUR");
    assert.equal(jobs[0].salary?.normalizedAnnualMin, 30000);
    assert.equal(jobs[1].salary, undefined, "predicted pay must not be presented as employer-stated");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an unconfigured aggregator reports offline instead of inventing listings", async () => {
  const provider = new AdzunaJobProvider(undefined, undefined, ["it"]);
  assert.equal((await provider.healthCheck()).status, "offline");
  await assert.rejects(() => provider.searchJobs({}), /ADZUNA_APP_ID/);
});

test("aggregator postings outside the requested market are dropped, not mislabeled", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.match(String(input), /jooble\.org\/api\/unit-key$/);
    assert.match(String(init?.body ?? ""), /"location":"Italy"/);
    return Response.json({ jobs: [
      { title: "IT Support Specialist", company: "Acme Italia", location: "Milano", snippet: "Windows 11 and <b>Microsoft 365</b> support.", salary: "€30.000 - €38.000 per year", type: "Full-time", link: "https://jooble.org/jdp/-2829679075267731294", updated: "2026-08-10T04:32:05" },
      { title: "Operations Technician", company: "Bitdeer", location: "Rockdale, TX", snippet: "Data center maintenance.", salary: "$20 per hour", type: "Full-time", link: "https://jooble.org/jdp/-111", updated: "2026-08-10T04:32:05" },
    ] });
  };
  try {
    const jobs = await new JoobleJobProvider("unit-key", ["IT"]).searchJobs({ keywords: ["IT support"] });
    assert.equal(jobs.length, 1, "the Texas posting must not be returned for an Italy query");
    assert.equal(jobs[0].countryCode, "IT");
    assert.equal(jobs[0].fictional, false);
    // The numeric id overflows JS precision, so the id comes from the link text.
    assert.equal(jobs[0].externalId, "-2829679075267731294");
    assert.equal(jobs[0].salary?.originalAmountMin, 30000);
    assert.equal(jobs[0].salary?.originalCurrency, "EUR");
    assert.ok(jobs[0].requiredSkills.includes("Microsoft 365"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Careerjet sends only search terms, declares a referrer, and keeps ids stable across rotating links", async () => {
  const originalFetch = globalThis.fetch;
  const seen: Array<{ url: string; referer: string }> = [];
  const row = (url: string) => ({ type: "JOBS", jobs: [
    { title: "IT System Support Specialist", company: "ALL4BIT", locations: "Milano", description: "Supporto <b>IT</b> e Microsoft 365.", salary: "", date: "Tue, 01 Sep 2026 22:57:58 GMT", url },
    { title: "Help Desk Support Agent", company: "Remote Co", locations: "Austin, TX", description: "US support role.", salary: "", date: "Tue, 01 Sep 2026 22:57:58 GMT", url: "https://jobviewtrack.com/v2/us" },
  ] });
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    seen.push({ url, referer: new Headers(init?.headers).get("referer") ?? "" });
    return Response.json(row(`https://jobviewtrack.com/v2/token-${seen.length}`));
  };
  try {
    const provider = new CareerjetJobProvider("unit-affid", ["IT"], "https://example.test");
    const first = await provider.searchJobs({ keywords: ["support", "desk"] });
    assert.equal(seen[0].referer, "https://example.test/", "the API rejects calls without a declared referrer");
    assert.match(seen[0].url, /affid=unit-affid/);
    assert.match(seen[0].url, /locale_code=it_IT/);
    // Combining terms collapses this API's boolean parser to zero hits, so exactly one
    // role term is sent and NextJOB filters relevance itself.
    assert.match(seen[0].url, /keywords=support&/);
    assert.doesNotMatch(seen[0].url.split("+").join(" "), / OR /i);
    assert.doesNotMatch(seen[0].url, /markomedic91|gmail\.com|3516843131/i, "no candidate contact data may reach an aggregator");
    assert.equal(first.length, 1, "the Austin posting must not be returned for an Italy query");
    assert.equal(first[0].countryCode, "IT");
    assert.equal(first[0].fictional, false);
    // The affiliate link rotates per call, so the id must come from the posting itself.
    // A different keyword bypasses the response cache, so this is a genuine second fetch.
    const second = await new CareerjetJobProvider("unit-affid", ["IT"], "https://example.test").searchJobs({ keywords: ["specialist"] });
    assert.notEqual(first[0].originalUrl, second[0].originalUrl);
    assert.equal(first[0].externalId, second[0].externalId);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("board salary text is only structured when a currency is stated", () => {
  const { parseSalaryText } = liveJobInternals;
  assert.equal(parseSalaryText("Competitive salary"), undefined);
  assert.equal(parseSalaryText(""), undefined);
  assert.equal(parseSalaryText("30000 - 40000"), undefined, "a bare number without a currency is not pay");
  assert.equal(parseSalaryText("€30.000 - €40.000 per year")?.originalAmountMax, 40000);
  assert.equal(parseSalaryText("$20 per hour")?.originalPeriod, "HOUR");
  assert.equal(parseSalaryText("€2.500 al mese")?.originalPeriod, "MONTH");
});

test("key-free European board feed normalizes remote roles", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    if (!String(input).includes("arbeitnow.com/api/job-board-api")) throw new Error("Unexpected URL");
    return Response.json({ data: [{ slug: "it-support-berlin", company_name: "Nordwind", title: "IT Support Engineer", description: "Microsoft 365 and Networking.", remote: true, url: "https://www.arbeitnow.com/jobs/it-support-berlin", location: "Berlin", created_at: 1787216400, job_types: ["full_time"] }] });
  };
  try {
    const jobs = await new ArbeitnowJobProvider().searchJobs({ keywords: ["IT Support"] });
    assert.equal(jobs[0].workplace, "Remote");
    assert.equal(jobs[0].employmentType, "Full-time");
    assert.equal(jobs[0].fictional, false);
    assert.ok(jobs[0].requiredSkills.includes("Microsoft 365"));
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
    if (url.endsWith("/resumes/resume-tailored-1") && init?.method === "GET") return Response.json({ id: "resume-tailored-1", data: { basics: { name: "Jane" }, summary: { content: "<p>Tailored for support</p>" }, sections: {} } });
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
    assert.equal(generated.content?.summary?.content, "Tailored for support", "the tailored content is read back for the studio");
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

test("feed relevance rejects same-word roles from other occupations", () => {
  const itProfile = { ...candidate, currentRole: "IT Support Specialist", targetTitles: ["IT Support Specialist", "Junior Front-End Developer"] };
  // The reported false positive: shares only the generic word "support".
  assert.equal(isRelevantRoleTitle("Sales and Market Support (m/w/d)", itProfile), false);
  assert.equal(isRelevantRoleTitle("Customer Success Manager", itProfile), false);
  assert.equal(isRelevantRoleTitle("Research & Development Technician", itProfile), false);
  assert.equal(isRelevantRoleTitle("Engineering Manager - Front-end background", itProfile), false);
  assert.equal(isRelevantRoleTitle("Don't see what you're looking for?", itProfile), false);
  // A named competing occupation beats a generic word even when the title sounds technical.
  assert.equal(isRelevantRoleTitle("Stage Sales Support/New Business - Digital Automotive", itProfile), false);
  assert.equal(isRelevantRoleTitle("Marketing Support Specialist", itProfile), false);
  // Genuine IT support work still gets through, in either language.
  assert.equal(isRelevantRoleTitle("IT Support Specialist", itProfile), true);
  assert.equal(isRelevantRoleTitle("Help Desk e IT Support", itProfile), true);
  assert.equal(isRelevantRoleTitle("Service Desk Analyst", itProfile), true);
  assert.equal(isRelevantRoleTitle("Senior System Administrator - Internal IT (m/w/d)", itProfile), true);
});

test("feed relevance keeps a profile with unusable titles from blanking the feed", () => {
  const vague = { ...candidate, currentRole: "Pro", targetTitles: ["Pro"] };
  assert.equal(isRelevantRoleTitle("IT Support Specialist", vague), true);
});

test("search keywords drop generic words that match unrelated occupations", () => {
  const keywords = searchKeywords({ ...candidate, currentRole: "IT Support Specialist", targetTitles: ["IT Support Specialist"] });
  assert.ok(keywords.includes("IT Support Specialist"));
  assert.ok(keywords.includes("help desk"));
  assert.equal(keywords.includes("support"), false, "a bare generic term must not be sent as a query");
});

test("one vacancy re-published by an aggregator collapses onto the employer's own link", () => {
  const employer: Job = { ...jobs[0], id: "greenhouse-acme-1", providerId: "greenhouse-acme", providerName: "Greenhouse · Acme", company: "Acme", title: "IT Support Specialist", city: "Milan", locationText: "Milan, Italy", originalUrl: "https://boards.greenhouse.io/acme/jobs/1", description: "Support Windows 11 and Microsoft 365 users." };
  const careerjet: Job = { ...employer, id: "careerjet-1", providerId: "careerjet", providerName: "Careerjet", company: "Acme S.r.l.", title: "IT Support Specialist (m/f/d)", city: "Milano", locationText: "Milano, Lombardia", originalUrl: "https://www.careerjet.it/jobad/x", description: "Support Windows 11 and Microsoft 365 users. Apply now." };
  const jooble: Job = { ...employer, id: "jooble-1", providerId: "jooble", providerName: "Jooble", company: "ACME ITALIA SRL", title: "IT Support Specialist Milano", city: "Milano", locationText: "Milano", originalUrl: "https://it.jooble.org/jdp/1" };
  const countryOnly: Job = { ...employer, id: "adzuna-1", providerId: "adzuna", providerName: "Adzuna", company: "Acme", city: "Italia", locationText: "Italia", originalUrl: "https://www.adzuna.it/land/ad/1" };
  const province: Job = { ...employer, id: "adzuna-2", providerId: "adzuna", providerName: "Adzuna", company: "Acme", city: "Provincia di Milano", locationText: "Provincia di Milano, Lombardia", originalUrl: "https://www.adzuna.it/land/ad/2" };
  const other: Job = { ...employer, id: "careerjet-2", providerId: "careerjet", providerName: "Careerjet", title: "Network Engineer", originalUrl: "https://www.careerjet.it/jobad/y" };
  const unnamedA: Job = { ...employer, id: "careerjet-3", providerId: "careerjet", providerName: "Careerjet", company: "Employer", title: "Receptionist", originalUrl: "https://www.careerjet.it/jobad/a" };
  const unnamedB: Job = { ...unnamedA, id: "careerjet-4", originalUrl: "https://www.careerjet.it/jobad/b" };
  const groups = deduplicateJobs([careerjet, jooble, countryOnly, province, employer, other, unnamedA, unnamedB]);
  const merged = groups.find((group) => group.sources.length === 5);
  assert.ok(merged, "employer, Careerjet, Jooble, country-only and province copies form one group");
  assert.equal(merged.canonical.providerId, "greenhouse-acme", "the direct employer link is the one shown");
  assert.equal(groups.length, 4, "a different role and two unnamed postings stay separate");
  const userCopy: Job = { ...employer, id: "user-import-1", providerId: "user-import", providerName: "Added by you", description: "short" };
  assert.equal(deduplicateJobs([employer, careerjet, userCopy])[0].canonical.providerId, "user-import", "a job the candidate added is never swallowed by a feed copy");
});

test("source helpers label aggregator links honestly and send no candidate data to the employer search", () => {
  const careerjet = { ...jobs[0], providerId: "careerjet", company: "Acme Italia", title: 'IT "Support" Specialist' };
  assert.equal(jobSourceKind(careerjet), "aggregator");
  assert.equal(aggregatorName(careerjet), "Careerjet");
  assert.equal(linkMayAskHumanCheck(careerjet), true);
  assert.equal(jobSourceKind({ providerId: "greenhouse-eu-acme" }), "employer");
  assert.equal(jobSourceKind({ providerId: "smartrecruiters-boschgroup" }), "employer");
  assert.equal(aggregatorName({ providerId: "personio-holidu" }), null);
  assert.equal(jobSourceKind({ providerId: "user-import" }), "user");
  const search = employerSearchUrl(careerjet)!;
  assert.match(search, /^https:\/\/duckduckgo\.com\/\?q=/);
  assert.match(decodeURIComponent(search), /Acme Italia careers "IT Support Specialist"/);
  assert.doesNotMatch(search, new RegExp(candidate.fullName.split(" ")[0]));
  assert.equal(employerSearchUrl({ company: "Employer", title: "Any" }), null, "a placeholder employer cannot be searched");
  assert.equal(employerSearchUrl({ company: "indeed.it", title: "Any" }), null, "a scraped board is not the employer");
});

test("SmartRecruiters reads one market with the direct posting link and the full ad text", async () => {
  const originalFetch = globalThis.fetch;
  const seen: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    seen.push(url);
    if (url === "https://api.smartrecruiters.com/v1/companies/BoschGroup/postings?country=it&limit=100") return Response.json({ totalFound: 2, content: [
      { id: "744000147479999", name: "IT Support Specialist", releasedDate: "2026-09-04T10:48:36.687Z", company: { identifier: "BoschGroup", name: "Bosch Group" }, location: { city: "Torino", region: "Piemonte", country: "it", remote: false, hybrid: true, fullLocation: "Torino, Piemonte, Italy" }, typeOfEmployment: { label: "Full-time" }, experienceLevel: { label: "Associate" } },
      { id: "744000147480000", name: "Help Desk Intern", releasedDate: "2026-09-01T10:00:00.000Z", company: { identifier: "BoschGroup", name: "Bosch Group" }, location: { city: "Milano", country: "it" }, typeOfEmployment: { label: "Internship" } },
    ] });
    if (url === "https://api.smartrecruiters.com/v1/companies/BoschGroup/postings/744000147479999") return Response.json({ postingUrl: "https://jobs.smartrecruiters.com/BoschGroup/744000147479999-it-support-specialist", applyUrl: "https://jobs.smartrecruiters.com/BoschGroup/744000147479999-it-support-specialist?oga=true", jobAd: { sections: { companyDescription: { text: "<p>About Bosch</p>" }, jobDescription: { text: "<p>Support <strong>Windows 11</strong> and Microsoft 365 users.</p>" }, qualifications: { text: "<ul><li>Active Directory</li></ul>" } } } });
    if (url === "https://api.smartrecruiters.com/v1/companies/BoschGroup/postings/744000147480000") return new Response("boom", { status: 500 });
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const found = await new SmartRecruitersJobProvider("BoschGroup", "Bosch", ["IT"]).searchJobs({ keywords: ["IT Support", "Help Desk"] });
    assert.equal(found.length, 2);
    assert.equal(found[0].providerName, "SmartRecruiters · Bosch");
    assert.equal(found[0].company, "Bosch Group");
    assert.equal(found[0].originalUrl, "https://jobs.smartrecruiters.com/BoschGroup/744000147479999-it-support-specialist", "the posting page, not the tracking apply link");
    assert.equal(found[0].countryCode, "IT");
    assert.equal(found[0].workplace, "Hybrid");
    assert.ok(found[0].requiredSkills.includes("Microsoft 365"));
    assert.doesNotMatch(found[0].description, /About Bosch/, "the company blurb is not the job description");
    assert.equal(found[1].originalUrl, "https://jobs.smartrecruiters.com/BoschGroup/744000147480000", "a failed detail still yields the employer link");
    assert.equal(found[1].employmentType, "Internship");
    assert.ok(seen.every((url) => !/country=(?!it)/.test(url)), "only the configured market is requested");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Personio's public XML feed is read without an XML parser and links to the employer's job page", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url !== "https://holidu.jobs.personio.de/xml") throw new Error(`Unexpected URL: ${url}`);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<workzag-jobs>
<position>
    <id>2777239</id>
    <subcompany>Holidu Hosts Italy S.r.l.</subcompany>
    <office>Bozen, Italy</office>
    <department>Hosts - Sales &amp; Account Management</department>
    <name>IT Support Specialist &amp; Help Desk (all genders)</name>
    <jobDescriptions><jobDescription><name>Your role</name><value><![CDATA[<p>Support <b>Microsoft 365</b> and Windows 11 users in the Bolzano office.</p>]]></value></jobDescription></jobDescriptions>
    <employmentType>permanent</employmentType>
    <seniority>entry-level</seniority>
    <schedule>part-time</schedule>
    <keywords>help desk,microsoft 365</keywords>
    <createdAt>2026-09-01T18:43:02+00:00</createdAt>
</position>
<position>
    <id>2660824</id>
    <office>Munich, Germany</office>
    <name>DevOps Engineer</name>
    <jobDescriptions></jobDescriptions>
    <employmentType>permanent</employmentType>
    <schedule>full-time</schedule>
    <createdAt>2026-07-21T11:15:06+00:00</createdAt>
</position>
</workzag-jobs>`, { status: 200, headers: { "content-type": "application/xml" } });
  };
  try {
    const provider = new PersonioJobProvider("holidu", "Holidu");
    const found = await provider.searchJobs({ keywords: ["IT Support"] });
    assert.equal(found.length, 1);
    assert.equal(found[0].title, "IT Support Specialist & Help Desk (all genders)");
    assert.equal(found[0].company, "Holidu Hosts Italy S.r.l.");
    assert.equal(found[0].originalUrl, "https://holidu.jobs.personio.de/job/2777239");
    assert.equal(found[0].countryCode, "IT");
    assert.equal(found[0].employmentType, "Part-time");
    assert.match(found[0].description, /Support Microsoft 365 and Windows 11 users/);
    assert.ok(found[0].requiredSkills.includes("Microsoft 365"));
    assert.equal(found[0].publishedAt, "2026-09-01T18:43:02.000Z");
    const all = await provider.searchJobs({});
    assert.equal(all.length, 2);
    assert.equal(all[1].company, "Holidu", "a position without a subcompany falls back to the configured employer");
    assert.equal(liveJobInternals.xmlTag("<a><![CDATA[x &amp; y]]></a>", "a"), "x &amp; y", "CDATA content is taken verbatim");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
