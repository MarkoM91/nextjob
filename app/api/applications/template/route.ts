import { env } from "cloudflare:workers";
import { z } from "zod";
import { getCurrentUser } from "../../../auth";
import { databaseFromEnvironment, resolveRealJob } from "../../../../lib/job-store";
import { readStoredResume, readStoredTailoredApplication, resumeProfileKey, safeOwnerId, tailoredApplicationKey, tailoredResumeKey, type StoredTailoredApplication } from "../../../../lib/resume-storage";
import { assertSameOrigin, clientKey, rateLimit } from "../../../../lib/security";
import { isReactiveResumeConfigured, REACTIVE_RESUME_TEMPLATES, ReactiveResumeApiError, setReactiveResumeTemplate } from "../../../../lib/reactive-resume";

const requestSchema = z.object({ jobId: z.string().min(1).max(80), template: z.enum(REACTIVE_RESUME_TEMPLATES) });

export function GET() {
  return Response.json({ templates: REACTIVE_RESUME_TEMPLATES }, { headers: { "cache-control": "public, max-age=3600" } });
}

/** Changes the design of an already tailored CV; the PDF is re-exported and the choice is kept for future applications. */
export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return Response.json({ error: "Invalid request origin" }, { status: 403 });
  const limit = rateLimit(`template:${clientKey(request)}`, 30, 60 * 60 * 1000);
  if (!limit.allowed) return Response.json({ error: "Design change limit reached", retryAfterSeconds: limit.retryAfterSeconds }, { status: 429 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Choose one of the available CV designs", details: parsed.error.flatten(), templates: REACTIVE_RESUME_TEMPLATES }, { status: 400 });
  const storage = (env as unknown as { DOCUMENTS?: R2Bucket }).DOCUMENTS;
  const job = await resolveRealJob(parsed.data.jobId, databaseFromEnvironment(env), storage);
  if (!job) return Response.json({ error: "This live job is no longer available" }, { status: 404 });
  if (!isReactiveResumeConfigured()) return Response.json({ error: "Résumé designs need Reactive Resume + AI to be configured.", code: "PROVIDER_NOT_CONFIGURED" }, { status: 503 });
  if (!storage) return Response.json({ error: "Private document storage is not available.", code: "DOCUMENT_STORAGE_NOT_CONFIGURED" }, { status: 503 });
  const user = await getCurrentUser();
  const ownerId = safeOwnerId(user?.id);
  const [pkg, storedResume] = await Promise.all([
    readStoredTailoredApplication(storage, ownerId, job.id).catch(() => null),
    readStoredResume(storage, ownerId).catch(() => null),
  ]);
  if (!pkg?.externalResumeId) return Response.json({ error: "Create the tailored application before choosing a CV design.", code: "NOT_GENERATED" }, { status: 409 });
  const { template } = parsed.data;
  try {
    const { pdf } = await setReactiveResumeTemplate(pkg.externalResumeId, template);
    await storage.put(tailoredResumeKey(ownerId, job.id), pdf, { httpMetadata: { contentType: "application/pdf" }, customMetadata: { ownerId, provider: "reactive-resume", jobId: job.id, applicationId: pkg.applicationId ?? "", externalResumeId: pkg.externalResumeId, template } });
  } catch (error) {
    const message = error instanceof ReactiveResumeApiError ? error.message : "The résumé design could not be changed";
    return Response.json({ error: message, code: error instanceof ReactiveResumeApiError ? error.code : "TEMPLATE_FAILED" }, { status: 502 });
  }
  const updated: StoredTailoredApplication = { ...pkg, template, content: pkg.content ? { ...pkg.content, metadata: { ...pkg.content.metadata, template } } : pkg.content };
  await storage.put(tailoredApplicationKey(ownerId, job.id), new TextEncoder().encode(JSON.stringify(updated)), { httpMetadata: { contentType: "application/json" }, customMetadata: { ownerId, jobId: job.id, resumeProvider: updated.resumeProvider, documentsProvider: updated.documentsProvider } });
  if (storedResume) {
    storedResume.preferredTemplate = template;
    await storage.put(resumeProfileKey(ownerId), new TextEncoder().encode(JSON.stringify(storedResume)), { httpMetadata: { contentType: "application/json" }, customMetadata: { ownerId, provider: "reactive-resume", verified: storedResume.verifiedAt ? "true" : "false", externalResumeId: storedResume.externalResumeId } }).catch(() => undefined);
  }
  return Response.json({ template, templates: REACTIVE_RESUME_TEMPLATES, documentUrl: `/api/documents/pdf?job=${encodeURIComponent(job.id)}`, updatedAt: new Date().toISOString() }, { headers: { "cache-control": "private, no-store" } });
}
