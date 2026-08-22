import { env } from "cloudflare:workers";
import { z } from "zod";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { candidate, jobs } from "../../../../lib/demo-data";
import { createDemoApplication, validateGeneratedClaims } from "../../../../lib/engine";
import { readStoredResume, safeOwnerId, tailoredResumeKey } from "../../../../lib/resume-storage";
import { assertSameOrigin, clientKey, rateLimit } from "../../../../lib/security";
import { createTailoredResume, downloadTailoredPdf, isUseResumeConfigured, UseResumeApiError } from "../../../../lib/useresume";

const requestSchema = z.object({ jobId: z.string().regex(/^job-\d{2}$/), tone: z.enum(["Professional", "Direct", "Warm", "Concise"]).default("Professional") });

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return Response.json({ error: "Invalid request origin" }, { status: 403 });
  const limit = rateLimit(`generate:${clientKey(request)}`, 10, 60 * 60 * 1000);
  if (!limit.allowed) return Response.json({ error: "Generation limit reached", retryAfterSeconds: limit.retryAfterSeconds }, { status: 429 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid generation request", details: parsed.error.flatten() }, { status: 400 });
  const job = jobs.find((item) => item.id === parsed.data.jobId);
  if (!job) return Response.json({ error: "Job not found" }, { status: 404 });
  const application = createDemoApplication(candidate, job, parsed.data.tone);
  const validation = validateGeneratedClaims(application, candidate);
  if (!validation.valid) return Response.json({ error: "Generated claims failed factual validation", unsupported: validation.unsupported }, { status: 422 });
  if (!isUseResumeConfigured()) return Response.json({ application, factualValidation: validation, statement: "NextJOB improves wording and relevance but never invents experience.", generationProvider: "nextjob-fallback", providerConfigured: false, demoMode: true });
  const user = await getChatGPTUser();
  const ownerId = safeOwnerId(user?.id);
  const storage = (env as unknown as { DOCUMENTS?: R2Bucket }).DOCUMENTS;
  const storedResume = await readStoredResume(storage, ownerId).catch(() => null);
  if (!storedResume) return Response.json({ error: "Upload and verify your CV before creating a tailored application.", code: "CV_PROFILE_REQUIRED" }, { status: 409 });
  if (!storedResume.verifiedAt) return Response.json({ error: "Confirm every extracted CV fact before creating a tailored application.", code: "CV_PROFILE_UNVERIFIED" }, { status: 409 });
  try {
    const generated = await createTailoredResume(storedResume.content, job);
    const pdf = await downloadTailoredPdf(generated.fileUrl);
    if (storage) await storage.put(tailoredResumeKey(ownerId, job.id), pdf, { httpMetadata: { contentType: "application/pdf" }, customMetadata: { ownerId, provider: "useresume", jobId: job.id, runId: generated.runId ?? "" } });
    return Response.json({ application, factualValidation: validation, statement: "UseResume tailored the PDF from the uploaded CV and job description; NextJOB still requires user review.", generationProvider: "useresume", providerConfigured: true, providerRunId: generated.runId, creditsUsed: generated.creditsUsed, creditsRemaining: generated.creditsRemaining, documentUrl: `/api/documents/pdf?job=${encodeURIComponent(job.id)}`, demoMode: !storage });
  } catch (error) {
    const message = error instanceof UseResumeApiError ? error.message : "The résumé generator is temporarily unavailable";
    return Response.json({ error: message, code: error instanceof UseResumeApiError ? error.code : "GENERATION_FAILED" }, { status: 502 });
  }
}
