import assert from "node:assert/strict";
import test from "node:test";
import { candidate, jobs } from "../lib/demo-data.ts";
import { aiWriterInternals, applyWrittenDocuments, parseWrittenDocuments, writeApplicationDocuments } from "../lib/ai-writer.ts";
import { coverLetterText, interviewPrepText, textToPdf } from "../lib/documents.ts";
import { createDemoApplication, rankJobs, validateGeneratedClaims } from "../lib/engine.ts";
import { EMPTY_FILTERS, facetCounts, filtersFromParams, filtersToParams, IMPORT_PROVIDER_ID, jobPassesFilters, matchesLocation, sortMatches } from "../lib/job-filters.ts";
import { createTailoredReactiveResume, isReactiveResumeTemplate, REACTIVE_RESUME_TEMPLATES, setReactiveResumeTemplate } from "../lib/reactive-resume.ts";

test("a chosen CV design is patched onto the tailored résumé and applied to later tailoring", async () => {
  assert.equal(isReactiveResumeTemplate("kakuna"), true);
  assert.equal(isReactiveResumeTemplate("bulbasaur"), false);
  assert.ok(REACTIVE_RESUME_TEMPLATES.includes("onyx"));
  const originalFetch = globalThis.fetch;
  const saved = { REACTIVE_RESUME_API_KEY: process.env.REACTIVE_RESUME_API_KEY, AI_PROVIDER: process.env.AI_PROVIDER, AI_PROVIDER_API_KEY: process.env.AI_PROVIDER_API_KEY, AI_MODEL: process.env.AI_MODEL };
  process.env.REACTIVE_RESUME_API_KEY = "reactive-unit-key"; process.env.AI_PROVIDER = "openai"; process.env.AI_PROVIDER_API_KEY = "ai-unit-key"; process.env.AI_MODEL = "test-model";
  const patches: string[] = [];
  let template = "onyx";
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/resumes/resume-tailored-1") && init?.method === "PATCH") { patches.push(String(init.body)); template = JSON.parse(String(init.body)).operations[0].value; return Response.json({ id: "resume-tailored-1" }); }
    if (url.endsWith("/resumes/resume-tailored-1") && init?.method === "GET") return Response.json({ id: "resume-tailored-1", data: { basics: { name: "Jane" }, summary: {}, sections: {}, metadata: { template } } });
    if (url.endsWith("/resumes/resume-tailored-1/pdf?target=resume")) return new Response(new TextEncoder().encode(`%PDF-${template}`), { headers: { "content-type": "application/pdf" } });
    if (url.endsWith("/ai-providers") && init?.method === "GET") return Response.json([{ id: "provider-1", label: "NextJOB", provider: "openai", model: "test-model", enabled: true, testStatus: "success" }]);
    if (url.endsWith("/applications") && init?.method === "GET") return Response.json([{ id: "application-1", company: jobs[0].company.replace(/\s+\(fictional\)$/i, ""), role: jobs[0].title, resumeId: "resume-tailored-1", sourceUrl: "https://rotated.example/other", tags: ["NextJOB"] }]);
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const changed = await setReactiveResumeTemplate("resume-tailored-1", "kakuna");
    assert.match(patches[0], /"op":"replace","path":"\/metadata\/template","value":"kakuna"/);
    assert.equal(new TextDecoder().decode(changed.pdf), "%PDF-kakuna");
    // An existing application is matched by employer and title even though the aggregator link rotated.
    const reused = await createTailoredReactiveResume("resume-base-1", jobs[0], "kakuna");
    assert.equal(reused.resumeId, "resume-tailored-1");
    assert.equal(patches.length, 1, "a résumé already in the chosen design is not patched again");
    const switched = await createTailoredReactiveResume("resume-base-1", jobs[0], "gengar");
    assert.equal(patches.length, 2);
    assert.equal(switched.content?.metadata?.template, "gengar");
    assert.equal(new TextDecoder().decode(switched.pdf), "%PDF-gengar");
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test("feed filters parse leniently, round-trip, and narrow like Indeed-style chips", () => {
  const parsed = filtersFromParams(new URLSearchParams("q=real+estate&location=Milano&posted=7&workplace=On-site&type=Full-time&level=Mid&minSalary=30000&salaryOnly=true&sort=date"));
  assert.equal(parsed.postedDays, 7);
  assert.equal(parsed.workplace, "On-site");
  assert.equal(parsed.minSalary, 30000);
  assert.equal(parsed.sort, "date");
  assert.deepEqual(filtersFromParams(filtersToParams(parsed)), parsed, "serialising and parsing must be lossless");
  const lenient = filtersFromParams(new URLSearchParams("posted=99&workplace=Moon&level=CEO"));
  assert.equal(lenient.postedDays, null, "unknown values are ignored, not errors");
  assert.equal(lenient.workplace, null);
  assert.equal(matchesLocation({ city: "", locationText: "Provincia di Milano", country: "Italy" }, "Milano"), true);
  assert.equal(matchesLocation({ city: "Milan", locationText: "Milan, Lombardia", country: "Italy" }, "milano"), true, "Italian and English spellings of a city meet on their common stem");
  assert.equal(matchesLocation({ city: "Bologna", locationText: "Bologna", country: "Italy" }, "Milano"), false);
  const now = Date.now();
  const recent = { ...jobs[0], publishedAt: new Date(now - 2 * 86400000).toISOString(), salary: undefined };
  const stale = { ...jobs[0], id: "stale", publishedAt: new Date(now - 20 * 86400000).toISOString() };
  const undated = { ...jobs[0], id: "undated", publishedAt: "" };
  assert.equal(jobPassesFilters(recent, { ...EMPTY_FILTERS, postedDays: 7 }, now), true);
  assert.equal(jobPassesFilters(stale, { ...EMPTY_FILTERS, postedDays: 7 }, now), false);
  assert.equal(jobPassesFilters(undated, { ...EMPTY_FILTERS, postedDays: 7 }, now), false, "an undated posting cannot claim to be recent");
  assert.equal(jobPassesFilters(recent, { ...EMPTY_FILTERS, minSalary: 50000 }, now), true, "a pay floor never hides a posting that states no pay");
  assert.equal(jobPassesFilters(recent, { ...EMPTY_FILTERS, salaryOnly: true }, now), false);
  const facets = facetCounts([recent, stale, undated], now);
  assert.equal(facets.total, 3);
  assert.equal(facets.posted["7"], 1);
  assert.equal(facets.workplace[jobs[0].workplace], 3);
  // A job the candidate added leads every order, so it is never pushed off the first page by higher-scoring live listings.
  const live = { job: { ...jobs[0], id: "live" }, score: 92, distanceKm: 3 } as unknown as Parameters<typeof sortMatches>[0][number];
  const added = { job: { ...jobs[1], id: "added", providerId: IMPORT_PROVIDER_ID, publishedAt: new Date(now - 5 * 86400000).toISOString() }, score: 61, distanceKm: 40 } as unknown as Parameters<typeof sortMatches>[0][number];
  for (const sort of ["relevance", "date", "distance"] as const) assert.equal(sortMatches([live, added], sort)[0].job.id, "added", sort + " sort keeps added jobs first");
  assert.equal(sortMatches([live, { ...live, job: { ...live.job, id: "closer" }, distanceKm: 1 }], "distance")[0].job.id, "closer");
  const remote = { ...live, job: { ...live.job, id: "remote", workplace: "Remote" as const }, distanceKm: 0, score: 99 };
  const local = { ...live, job: { ...live.job, workplace: "On-site" as const } };
  assert.equal(sortMatches([remote, local], "distance")[0].job.id, "live", "physical nearby roles lead remote roles, whose zero distance is not a physical location");
  const newest = sortMatches(rankJobs(candidate, jobs, true), "date");
  assert.ok(new Date(newest[0].job.publishedAt).getTime() >= new Date(newest[newest.length - 1].job.publishedAt).getTime());
});

const careerChanger = {
  ...candidate,
  currentRole: "IT Help Desk Technician",
  targetTitles: ["IT Help Desk Technician"],
  experiences: [
    { id: "exp-it", company: "Engineering Spa", role: "IT Help Desk Technician", startDate: "2026", endDate: undefined, bullets: [{ id: "it-1", text: "Imaging dei PC e installazione di Windows 11" }, { id: "it-2", text: "Migrazione dei dati dai vecchi ai nuovi computer" }] },
    { id: "exp-re", company: "Linea Casa", role: "Agente Immobiliare", startDate: "2013", endDate: "2018", bullets: [{ id: "re-1", text: "Negoziazione di contratti di vendita per proprietari e clienti" }, { id: "re-2", text: "Sopralluoghi e stima del valore delle proprietà immobiliari" }] },
  ],
};
const realEstatePosting = { ...jobs[0], title: "Agente Immobiliare Residenziale", company: "Michael Page", requiredSkills: [], preferredSkills: [], responsibilities: [], description: "Selezione di proprietari che desiderano vendere, sopralluoghi, stima delle proprietà e negoziazione dei contratti di vendita con i clienti." };

test("the template application follows the posting, not a fixed occupation", () => {
  const application = createDemoApplication(careerChanger, realEstatePosting);
  assert.ok(application.cvBullets.slice(0, 2).every((bullet) => bullet.sourceFactIds[0].startsWith("re-")), "the older real-estate bullets outrank the unrelated current role");
  assert.doesNotMatch(application.coverLetter, /IT support|troubleshooting|workplace technology/i);
  assert.match(application.coverLetter, /Michael Page/);
  assert.match(application.summary, /Agente Immobiliare at Linea Casa/);
  assert.equal(validateGeneratedClaims(application, careerChanger).valid, true);
  const letter = coverLetterText(careerChanger, realEstatePosting, application);
  assert.match(letter, /Agente Immobiliare Residenziale — Michael Page/);
  assert.match(interviewPrepText(careerChanger, realEstatePosting, application), /STAR STORY PROMPTS/);
  const pdf = new TextDecoder("latin1").decode(textToPdf(Array.from({ length: 130 }, (_, index) => `Riga ${index} — proprietà`).join("\n")));
  assert.match(pdf, /\/Count 3/, "long documents paginate instead of being cut off");
  assert.match(pdf, /propriet\\340/, "accented characters are encoded for the PDF font rather than replaced");
  assert.match(pdf, /\\227/, "typographic dashes map to WinAnsi instead of becoming question marks");
});

test("the AI writer only chooses verified bullets, never sees contact details, and degrades to the template", async () => {
  const input = { profile: candidate, job: jobs[0], tone: "Professional" as const, tailoredSummary: "Tailored summary" };
  const prompt = JSON.stringify(aiWriterInternals.buildMessages(input));
  assert.ok(!prompt.includes(candidate.email), "the writer does not need the candidate's email");
  assert.ok(!prompt.includes(candidate.phone), "the writer does not need the candidate's phone");
  assert.match(prompt, /Never invent employers/);
  assert.equal(aiWriterInternals.detectLanguage("Buona padronanza di strumenti Microsoft Office e CRM. Il nostro cliente è una Società di Real Estate che opera su Milano per la sede di zona.", "en"), "it", "an Italian posting flagged as English by the aggregator is still written in Italian");
  assert.equal(aiWriterInternals.detectLanguage("We are looking for an agent to join our team in Milan and you will work with our clients.", "it"), "en");
  assert.equal(aiWriterInternals.detectLanguage("Short", "it"), "it", "too little text keeps the source flag");
  const italianPrompt = JSON.stringify(aiWriterInternals.buildMessages({ ...input, job: { ...jobs[0], description: "Il nostro cliente è una società che ricerca un candidato con esperienza per la sede di Milano." } }));
  assert.match(italianPrompt, /which is \\"it\\"/);
  const realBullet = candidate.experiences[0].bullets[0].id;
  const written = parseWrittenDocuments({ summary: "S", coverLetter: "C", selectedBulletIds: [realBullet, "invented-bullet"], email: { subject: "Sub", body: "Body" }, interview: { likelyQuestions: ["Q1"] }, language: "IT" }, input, "test-model");
  assert.ok(written.selectedBulletIds.length >= 2, "too few valid ids fall back to relevance-ranked verified bullets");
  assert.ok(!written.selectedBulletIds.includes("invented-bullet"));
  assert.equal(written.language, "it");
  const base = createDemoApplication(candidate, jobs[0]);
  const merged = applyWrittenDocuments(base, written, candidate);
  assert.equal(merged.coverLetter, "C");
  assert.equal(validateGeneratedClaims(merged, candidate).valid, true);
  assert.ok(merged.cvBullets.every((bullet) => candidate.experiences.some((experience) => experience.bullets.some((fact) => fact.text === bullet.text))), "bullets stay verbatim CV facts");
  assert.equal(merged.interview.questionsToAsk.length, base.interview.questionsToAsk.length, "missing sections keep the template");
  assert.throws(() => parseWrittenDocuments({ summary: "", coverLetter: "" }, { ...input, tailoredSummary: undefined }, "m"), /incomplete/);

  const originalFetch = globalThis.fetch;
  const saved = { AI_PROVIDER: process.env.AI_PROVIDER, AI_PROVIDER_API_KEY: process.env.AI_PROVIDER_API_KEY, AI_MODEL: process.env.AI_MODEL, AI_BASE_URL: process.env.AI_BASE_URL };
  process.env.AI_PROVIDER = "openai"; process.env.AI_PROVIDER_API_KEY = "unit-key"; process.env.AI_MODEL = "unit-model"; process.env.AI_BASE_URL = "";
  const calls: Array<{ url: string; body: Record<string, unknown>; auth: string }> = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ url: String(url), body, auth: new Headers(init?.headers).get("authorization") ?? "" });
    if (calls.length === 1) return new Response(JSON.stringify({ error: { message: "response_format is not supported" } }), { status: 400 });
    const content = "```json\n" + JSON.stringify({ summary: "Sommario", coverLetter: "Lettera", selectedBulletIds: [realBullet], email: { subject: "Oggetto", body: "Testo" }, interview: {}, language: "it" }) + "\n```";
    return Response.json({ choices: [{ message: { content } }] });
  };
  try {
    const result = await writeApplicationDocuments(input);
    assert.equal(calls[0].url, "https://api.openai.com/v1/chat/completions");
    assert.equal(calls[0].auth, "Bearer unit-key");
    assert.equal(calls[0].body.model, "unit-model");
    assert.ok("response_format" in calls[0].body);
    assert.ok(!("response_format" in calls[1].body), "a server that rejects JSON mode is retried without it");
    assert.equal(result.coverLetter, "Lettera");
    assert.equal(result.model, "unit-model");
    process.env.AI_PROVIDER = "anthropic";
    await assert.rejects(() => writeApplicationDocuments(input), /not configured/);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});


test("reviewed facts carry through to tailoring without invented levels or career history", async () => {
  const { reviewedResumeData, tailoredResumeData } = await import("../lib/cv-tailoring.ts");
  const { applyProfileUpdate, profileUpdateSchema, reviewFields } = await import("../lib/profile-review.ts");
  const { applicationNeedsRefresh } = await import("../lib/resume-storage.ts");
  const profile = structuredClone(careerChanger);
  const content = { basics: { name: profile.fullName }, sections: { experience: { items: profile.experiences.map(item => ({ id: item.id, company: item.company, position: item.role, period: item.startDate + " - " + (item.endDate || "Present"), description: item.bullets.map(b => b.text).join("\n") })) }, skills: { items: [{ id: "skill-1", name: "PowerShell", proficiency: "Basic" }] }, languages: { items: [{ id: "lang-1", language: "English", fluency: "B2" }] } } };
  const stored = { provider: "reactive-resume" as const, externalResumeId: "base", parsedAt: "2026-01-01", verifiedAt: "2026-01-02", content, profile };
  const corrected = { ...reviewFields(profile), fullName: "Corrected Name", experiences: profile.experiences.map(item => ({ ...item, company: item.id === "exp-re" ? "Corrected Company" : item.company })) };
  const update = profileUpdateSchema.parse({ profile: corrected, confirmAll: true });
  const saved = applyProfileUpdate(stored, update);
  assert.equal(saved.profile.fullName, "Corrected Name");
  assert.ok(saved.verifiedAt && saved.updatedAt);
  assert.equal(saved.profile.id, profile.id);
  assert.equal(saved.content.sections?.skills?.items?.[0].proficiency, "Basic");
  assert.throws(() => profileUpdateSchema.parse({ profile: { ...corrected, id: "other-owner" } }));
  const raw = { ...content, sections: { ...content.sections, education: { items: [{ school: "Verified School" }] } }, metadata: { template: "onyx", layout: { pages: [{ main: ["summary", "education", "experience"], sidebar: ["skills"] }] } } };
  const reviewed = reviewedResumeData(raw, saved.content);
  const tailored = tailoredResumeData(reviewed, { ...raw, basics: { name: "Invented Name" }, sections: { experience: { items: [{ company: "Invented Employer" }] } } }, saved.profile, realEstatePosting, "Verified summary");
  assert.equal(tailored.basics.name, "Corrected Name");
  assert.equal(tailored.sections.experience.items[0].company, "Corrected Company");
  assert.equal(tailored.sections.education.items[0].school, "Verified School");
  assert.equal(tailored.sections.skills.items[0].proficiency, "Basic");
  assert.equal(tailored.sections.skills.items[0].level, 0);
  assert.equal(tailored.sections.languages.items[0].fluency, "B2");
  assert.deepEqual(tailored.metadata.layout.pages[0].main, ["summary", "experience", "education"]);
  assert.equal(tailored.metadata.template, "onyx");
  assert.equal(applicationNeedsRefresh({ generatedAt: "2026-01-03", sourceRevision: stored.parsedAt }, saved), true);
  assert.equal(applicationNeedsRefresh({ generatedAt: "2026-01-03", sourceRevision: saved.updatedAt }, saved), false);
});


test("the provider export uses corrected facts and keeps the selected design", async () => {
  const originalFetch = globalThis.fetch;
  const names = ["REACTIVE_RESUME_API_KEY", "AI_PROVIDER", "AI_PROVIDER_API_KEY", "AI_MODEL"];
  const settings = Object.fromEntries(names.map(name => [name, process.env[name]]));
  process.env.REACTIVE_RESUME_API_KEY = "unit-resume-key"; process.env.AI_PROVIDER = "openai"; process.env.AI_PROVIDER_API_KEY = "unit-ai-key"; process.env.AI_MODEL = "unit-model";
  let base = { basics: { name: "Original" }, summary: {}, sections: { experience: { items: careerChanger.experiences.map(item => ({ id: item.id, company: item.company, position: item.role, period: item.startDate, description: item.bullets.map(b => b.text).join("\n") })) }, skills: { items: [] }, languages: { items: [] }, education: { items: [{ school: "Verified school" }] } }, metadata: { template: "onyx", layout: { pages: [{ main: ["education", "experience"], sidebar: [] }] } } };
  let tailored = { ...structuredClone(base), basics: { name: "Invented" }, sections: { experience: { items: [{ company: "Invented" }] } } };
  const apply = <T extends object>(data: T, init?: RequestInit): T => { const result = structuredClone(data) as T & Record<string, unknown>; for (const operation of JSON.parse(String(init?.body)).operations) (result as Record<string, unknown>)[operation.path.slice(1)] = operation.value; return result; };
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/ai-providers")) return Response.json([{ id: "ai", label: "NextJOB", provider: "openai", model: "unit-model", enabled: true, tested: true }]);
    if (url.endsWith("/applications")) return Response.json([{ id: "application", company: realEstatePosting.company, role: realEstatePosting.title, resumeId: "tailored", tags: ["NextJOB"] }]);
    if (url.endsWith("/resumes/base")) { if (init?.method === "PATCH") base = apply(base, init); return Response.json({ data: base }); }
    if (url.endsWith("/resumes/tailored")) { if (init?.method === "PATCH") tailored = apply(tailored, init); return Response.json({ data: tailored }); }
    if (url.endsWith("/resumes/tailored/pdf?target=resume")) return new Response(new TextEncoder().encode("%PDF-" + tailored.basics.name), { headers: { "content-type": "application/pdf" } });
    throw new Error("Unexpected provider request: " + url);
  };
  try {
    const content = { ...structuredClone(base), basics: { name: "Corrected" } };
    const result = await createTailoredReactiveResume("base", realEstatePosting, "onyx", { content, profile: careerChanger, summary: "A factual summary" });
    assert.ok(result.content);
    assert.equal(base.basics.name, "Corrected");
    assert.equal(result.content.basics?.name, "Corrected");
    assert.equal(result.content.sections?.experience?.items?.[0].company, "Linea Casa");
    assert.equal(result.content.sections?.education?.items?.[0].school, "Verified school");
    assert.equal(result.content.metadata?.template, "onyx");
    assert.equal(new TextDecoder().decode(result.pdf), "%PDF-Corrected");
  } finally { globalThis.fetch = originalFetch; for (const [name, value] of Object.entries(settings)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } }
});


test("suspicious pay is not treated as a valid salary or used to exclude a job", () => {
  const job = { ...jobs[0], salary: { ...jobs[0].salary!, originalAmountMin: 27, originalAmountMax: 32, originalPeriod: "YEAR" as const, normalizedAnnualMin: 27, normalizedAnnualMax: 32 } };
  assert.equal(jobPassesFilters(job, { ...EMPTY_FILTERS, minSalary: 28000 }), true);
  assert.equal(jobPassesFilters(job, { ...EMPTY_FILTERS, salaryOnly: true }), false);
  assert.equal(facetCounts([job]).withSalary, 0);
});

test("Help Desk experience outranks generic support vocabulary in unrelated work", async () => {
  const { tailoredResumeData } = await import("../lib/cv-tailoring.ts");
  const profile = structuredClone(careerChanger);
  profile.experiences[1].bullets = Array.from({ length: 6 }, (_, index) => ({ id: `property-${index}`, text: "Supporto clienti, gestione dei sistemi CRM e delle applicazioni per contratti, relazioni e vendite." }));
  const job = { ...jobs[0], title: "Help Desk IT", description: "Supporto clienti, gestione sistemi, applicazioni e relazioni", requiredSkills: [], preferredSkills: [] };
  const application = createDemoApplication(profile, job);
  assert.equal(application.cvBullets[0].sourceFactIds[0], "it-1");
  assert.doesNotMatch(application.summary, /Linea Casa|verified experience/);
  const base = { basics: {}, sections: { experience: { items: profile.experiences.map(item => ({ id: item.id, company: item.company, position: item.role })) } } };
  const tailored = tailoredResumeData(base, base, profile, job, application.summary);
  assert.equal(tailored.sections.experience.items[0].company, "Engineering Spa");
  assert.equal((tailored.sections.experience.items[1].description.match(/<li>/g) ?? []).length, 2);
  assert.equal(tailored.sections.experience.items.length, 2, "unrelated history remains present");
});

test("the professional design keeps employment dates and employers as structured text", async () => {
  const { buildCvModel } = await import("../app/components/cv-design-model.ts");
  const { parseDesignKey } = await import("../app/components/cv-design-catalog.ts");
  assert.equal(parseDesignKey("nextjob:professional:a8c9c4")?.design, "professional");
  assert.equal(parseDesignKey("nextjob:unknown:a8c9c4"), null);
  const model = buildCvModel({ profile: careerChanger, resume: null, summary: "Tecnico IT", design: "professional", accent: "a8c9c4" });
  assert.equal(model.experience.entries[0].company, "Engineering Spa");
  assert.match(model.experience.entries[0].period!, /2026/);
  assert.equal(model.experience.entries[0].lines[0], careerChanger.experiences[0].bullets[0].text);
});
