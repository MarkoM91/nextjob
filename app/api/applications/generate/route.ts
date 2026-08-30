import { env } from "cloudflare:workers";
import { z } from "zod";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { candidate } from "../../../../lib/demo-data";
import { createDemoApplication, validateGeneratedClaims } from "../../../../lib/engine";
import { databaseFromEnvironment, resolveRealJob } from "../../../../lib/job-store";
import { readStoredResume, safeOwnerId, tailoredResumeKey } from "../../../../lib/resume-storage";
import { assertSameOrigin, clientKey, rateLimit } from "../../../../lib/security";
import { createTailoredReactiveResume, isReactiveResumeConfigured, ReactiveResumeApiError } from "../../../../lib/reactive-resume";

const requestSchema = z.object({ jobId: z.string().min(1).max(80), tone: z.enum(["Professional", "Direct", "Warm", "Concise"]).default("Professional") });

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return Response.json({ error: "Invalid request origin" }, { status: 403 });
  const limit = rateLimit(`generate:${clientKey(request)}`, 10, 60 * 60 * 1000);
  if (!limit.allowed) return Response.json({ error: "Generation limit reached", retryAfterSeconds: limit.retryAfterSeconds }, { status: 429 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid generation request", details: parsed.error.flatten() }, { status: 400 });
  const job = await resolveRealJob(parsed.data.jobId, databaseFromEnvironment(env));
  if (!job) return Response.json({ error: "This live job is no longer available" }, { status: 404 });

  const providerConfigured = isReactiveResumeConfigured();
  const user = await getChatGPTUser();
  const ownerId = safeOwnerId(user?.id);
  const storage = (env as unknown as { DOCUMENTS?: R2Bucket }).DOCUMENTS;
  const storedResume = providerConfigured ? await readStoredResume(storage, ownerId).catch(() => null) : null;
  if (providerConfigured && !storage) return Response.json({ error: "Private document storage is not available.", code: "DOCUMENT_STORAGE_NOT_CONFIGURED" }, { status: 503 });
  if (providerConfigured && !storedResume) return Response.json({ error: "Upload and verify your CV before creating a tailored application.", code: "CV_PROFILE_REQUIRED" }, { status: 409 });
  if (storedResume && !storedResume.verifiedAt) return Response.json({ error: "Confirm every extracted CV fact before creating a tailored application.", code: "CV_PROFILE_UNVERIFIED" }, { status: 409 });

  const sourceProfile = storedResume?.profile ?? candidate;
  const application = createDemoApplication(sourceProfile, job, parsed.data.tone);
  const validation = validateGeneratedClaims(application, sourceProfile);
  if (!validation.valid) return Response.json({ error: "Generated claims failed factual validation", unsupported: validation.unsupported }, { status: 422 });
  if (!providerConfigured || !storedResume) return Response.json({ application, factualValidation: validation, statement: "NextJOB improves wording and relevance but never invents experience.", generationProvider: "nextjob-fallback", providerConfigured: false, demoMode: true });

  try {
    const generated = await createTailoredReactiveResume(storedResume.externalResumeId, job);
    await storage!.put(tailoredResumeKey(ownerId, job.id), generated.pdf, { httpMetadata: { contentType: "application/pdf" }, customMetadata: { ownerId, provider: "reactive-resume", jobId: job.id, applicationId: generated.applicationId, externalResumeId: generated.resumeId } });
    return Response.json({ application, factualValidation: validation, statement: "Reactive Resume + AI created the PDF from your verified résumé and the exact job description. Review it before applying.", generationProvider: "reactive-resume", providerConfigured: true, providerRunId: generated.applicationId, tailoredResumeId: generated.resumeId, documentUrl: `/api/documents/pdf?job=${encodeURIComponent(job.id)}`, demoMode: false });
  } catch (error) {
    const message = error instanceof ReactiveResumeApiError ? error.message : "The résumé generator is temporarily unavailable";
    return Response.json({ error: message, code: error instanceof ReactiveResumeApiError ? error.code : "GENERATION_FAILED" }, { status: 502 });
  }
}
