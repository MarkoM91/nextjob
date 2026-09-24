import { env } from "cloudflare:workers";
import { z } from "zod";
import { getCurrentUser } from "../../../auth";
import { candidate } from "../../../../lib/demo-data";
import { aiWriterConfiguration, AiWriterError, applyWrittenDocuments, writeApplicationDocuments, type WriterTone } from "../../../../lib/ai-writer";
import { atsAnalyze, createDemoApplication, validateGeneratedClaims } from "../../../../lib/engine";
import { databaseFromEnvironment, resolveRealJob } from "../../../../lib/job-store";
import { readStoredResume, readStoredTailoredApplication, safeOwnerId, tailoredApplicationKey, tailoredResumeKey, type StoredTailoredApplication } from "../../../../lib/resume-storage";
import { assertSameOrigin, clientKey, rateLimit } from "../../../../lib/security";
import { createTailoredReactiveResume, isReactiveResumeConfigured, isReactiveResumeTemplate, REACTIVE_RESUME_TEMPLATES, ReactiveResumeApiError } from "../../../../lib/reactive-resume";

const requestSchema = z.object({ jobId: z.string().min(1).max(80), tone: z.enum(["Professional", "Direct", "Warm", "Concise"]).default("Professional"), regenerate: z.boolean().default(false) });

function documentsStatement(pkg: StoredTailoredApplication): string {
  if (pkg.resumeProvider !== "reactive-resume") return "NextJOB improves wording and relevance but never invents experience.";
  return pkg.documentsProvider === "ai-writer"
    ? "Reactive Resume + AI tailored the CV to this posting, and the cover letter, email and interview prep were written from the posting and your verified CV. Review everything before applying."
    : "Reactive Resume + AI tailored the CV to this posting. The cover letter, email and interview prep use the NextJOB template.";
}

function packageResponse(pkg: StoredTailoredApplication, reused: boolean, profileForValidation: Parameters<typeof validateGeneratedClaims>[1]) {
  return Response.json({
    application: pkg.application,
    tailoredResume: pkg.content,
    factualValidation: validateGeneratedClaims(pkg.application, profileForValidation),
    statement: documentsStatement(pkg),
    generationProvider: pkg.resumeProvider,
    documentsProvider: pkg.documentsProvider,
    writerModel: pkg.writerModel,
    providerConfigured: pkg.resumeProvider === "reactive-resume",
    providerRunId: pkg.applicationId,
    tailoredResumeId: pkg.externalResumeId,
    documentUrl: `/api/documents/pdf?job=${encodeURIComponent(pkg.jobId)}`,
    generatedAt: pkg.generatedAt,
    tone: pkg.tone,
    template: pkg.template,
    templates: REACTIVE_RESUME_TEMPLATES,
    reused,
    warnings: pkg.warnings,
    demoMode: pkg.resumeProvider !== "reactive-resume",
  }, { headers: { "cache-control": "private, no-store" } });
}

/** The stored package for a job, so the studio shows what was generated rather than a template. */
export async function GET(request: Request) {
  const limit = rateLimit(`generate-read:${clientKey(request)}`, 60);
  if (!limit.allowed) return Response.json({ error: "Too many requests" }, { status: 429 });
  const jobId = new URL(request.url).searchParams.get("job");
  if (!jobId || jobId.length > 80) return Response.json({ error: "A valid live job is required" }, { status: 400 });
  const user = await getCurrentUser();
  const ownerId = safeOwnerId(user?.id);
  const storage = (env as unknown as { DOCUMENTS?: R2Bucket }).DOCUMENTS;
  const [pkg, storedResume] = await Promise.all([
    readStoredTailoredApplication(storage, ownerId, jobId).catch(() => null),
    readStoredResume(storage, ownerId).catch(() => null),
  ]);
  if (!pkg) return Response.json({ error: "No application has been generated for this job yet", code: "NOT_GENERATED" }, { status: 404, headers: { "cache-control": "private, no-store" } });
  return packageResponse(pkg, true, storedResume?.profile ?? candidate);
}

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return Response.json({ error: "Invalid request origin" }, { status: 403 });
  const limit = rateLimit(`generate:${clientKey(request)}`, 10, 60 * 60 * 1000);
  if (!limit.allowed) return Response.json({ error: "Generation limit reached", retryAfterSeconds: limit.retryAfterSeconds }, { status: 429 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid generation request", details: parsed.error.flatten() }, { status: 400 });
  const storage = (env as unknown as { DOCUMENTS?: R2Bucket }).DOCUMENTS;
  const job = await resolveRealJob(parsed.data.jobId, databaseFromEnvironment(env), storage);
  if (!job) return Response.json({ error: "This live job is no longer available" }, { status: 404 });

  const providerConfigured = isReactiveResumeConfigured();
  const user = await getCurrentUser();
  const ownerId = safeOwnerId(user?.id);
  const storedResume = providerConfigured ? await readStoredResume(storage, ownerId).catch(() => null) : null;
  if (providerConfigured && !storage) return Response.json({ error: "Private document storage is not available.", code: "DOCUMENT_STORAGE_NOT_CONFIGURED" }, { status: 503 });
  if (providerConfigured && !storedResume) return Response.json({ error: "Upload and verify your CV before creating a tailored application.", code: "CV_PROFILE_REQUIRED" }, { status: 409 });
  if (storedResume && !storedResume.verifiedAt) return Response.json({ error: "Confirm every extracted CV fact before creating a tailored application.", code: "CV_PROFILE_UNVERIFIED" }, { status: 409 });

  const sourceProfile = storedResume?.profile ?? candidate;
  const tone: WriterTone = parsed.data.tone;
  // Every visit to the generating screen posts here; a finished package is reused so the
  // AI providers are not billed again for the same job and tone.
  if (!parsed.data.regenerate && storage) {
    const existing = await readStoredTailoredApplication(storage, ownerId, job.id).catch(() => null);
    if (existing && existing.tone === tone && existing.externalResumeId === storedResume?.externalResumeId) return packageResponse(existing, true, sourceProfile);
  }

  let application = createDemoApplication(sourceProfile, job, tone);
  if (!providerConfigured || !storedResume) {
    const validation = validateGeneratedClaims(application, sourceProfile);
    if (!validation.valid) return Response.json({ error: "Generated claims failed factual validation", unsupported: validation.unsupported }, { status: 422 });
    return Response.json({ application, factualValidation: validation, statement: "NextJOB improves wording and relevance but never invents experience.", generationProvider: "nextjob-fallback", documentsProvider: "nextjob-template", providerConfigured: false, demoMode: true, warnings: [] });
  }

  const warnings: string[] = [];
  const preferredTemplate = isReactiveResumeTemplate(storedResume.preferredTemplate) ? storedResume.preferredTemplate : undefined;
  let generated: Awaited<ReturnType<typeof createTailoredReactiveResume>>;
  try {
    generated = await createTailoredReactiveResume(storedResume.externalResumeId, job, preferredTemplate);
    await storage!.put(tailoredResumeKey(ownerId, job.id), generated.pdf, { httpMetadata: { contentType: "application/pdf" }, customMetadata: { ownerId, provider: "reactive-resume", jobId: job.id, applicationId: generated.applicationId, externalResumeId: generated.resumeId } });
  } catch (error) {
    const message = error instanceof ReactiveResumeApiError ? error.message : "The résumé generator is temporarily unavailable";
    return Response.json({ error: message, code: error instanceof ReactiveResumeApiError ? error.code : "GENERATION_FAILED" }, { status: 502 });
  }
  const tailoredSummary = generated.content?.summary?.content?.trim();
  if (tailoredSummary) application = { ...application, summary: tailoredSummary };
  if (!generated.content) warnings.push("Reactive Resume exported the tailored PDF but did not return its structured content, so the on-screen CV shows your base résumé.");

  let documentsProvider: StoredTailoredApplication["documentsProvider"] = "nextjob-template";
  let writerModel: string | undefined;
  const writer = aiWriterConfiguration();
  if (!writer.configured) warnings.push(`The cover letter, email and interview prep use the NextJOB template because the AI writer is not configured: ${writer.missing.join(", ")}.`);
  else {
    try {
      const written = await writeApplicationDocuments({ profile: sourceProfile, job, tone, tailoredSummary, resume: generated.content });
      application = applyWrittenDocuments(application, written, sourceProfile);
      documentsProvider = "ai-writer";
      writerModel = written.model;
    } catch (error) {
      warnings.push(`The AI writer could not run (${error instanceof AiWriterError ? error.message : "unexpected error"}), so the cover letter, email and interview prep use the NextJOB template.`);
    }
  }

  application = { ...application, ats: atsAnalyze(sourceProfile, job, [application.summary, ...application.cvBullets.map((bullet) => bullet.text), application.coverLetter].join("\n")) };
  const validation = validateGeneratedClaims(application, sourceProfile);
  if (!validation.valid) return Response.json({ error: "Generated claims failed factual validation", unsupported: validation.unsupported }, { status: 422 });

  const pkg: StoredTailoredApplication = {
    jobId: job.id, generatedAt: application.generatedAt, tone, resumeProvider: "reactive-resume", documentsProvider,
    externalResumeId: generated.resumeId, applicationId: generated.applicationId, writerModel, content: generated.content, application, warnings,
    template: generated.content?.metadata?.template ?? preferredTemplate,
  };
  await storage!.put(tailoredApplicationKey(ownerId, job.id), new TextEncoder().encode(JSON.stringify(pkg)), { httpMetadata: { contentType: "application/json" }, customMetadata: { ownerId, jobId: job.id, resumeProvider: pkg.resumeProvider, documentsProvider } });
  return packageResponse(pkg, false, sourceProfile);
}
