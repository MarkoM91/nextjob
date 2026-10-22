import { env } from "cloudflare:workers";
import { getCurrentUser } from "../../../auth";
import { databaseFromEnvironment, resolveRealJob } from "../../../../lib/job-store";
import { applicationNeedsRefresh, readStoredResume, readStoredTailoredApplication, resumeProfileKey, safeOwnerId, tailoredApplicationKey, tailoredResumeKey, type StoredTailoredApplication } from "../../../../lib/resume-storage";
import { prepareDesignedResume } from "../../../../lib/cv-tailoring";
import { assertSameOrigin, clientKey, rateLimit } from "../../../../lib/security";
import { parseDesignKey } from "../../../components/cv-design-catalog";
import { makeCvSnapshot } from "../../../../lib/billing-cv";

const MAX_PDF_BYTES = 5 * 1024 * 1024;

/**
 * Stores a CV the studio rendered in the browser with one of NextJOB's own designs, so
 * "Download CV", the tracker and later visits all hand out the same document.
 */
export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return Response.json({ error: "Invalid request origin" }, { status: 403 });
  const limit = rateLimit(`cv-upload:${clientKey(request)}`, 60, 60 * 60 * 1000);
  if (!limit.allowed) return Response.json({ error: "Too many CV updates", retryAfterSeconds: limit.retryAfterSeconds }, { status: 429 });
  const url = new URL(request.url);
  const jobId = url.searchParams.get("job");
  const design = url.searchParams.get("design") ?? "";
  if (!jobId || jobId.length > 80) return Response.json({ error: "A valid live job is required" }, { status: 400 });
  if (!parseDesignKey(design)) return Response.json({ error: "Unknown CV design" }, { status: 400 });
  const contentType = request.headers.get("content-type") ?? "";
  let bytes: ArrayBuffer;
  let submittedSummary: string | undefined;
  if (/^multipart\/form-data/i.test(contentType)) {
    const form = await request.formData().catch(() => null);
    const file = form?.get("pdf");
    const text = form?.get("summary");
    if (!(file instanceof Blob) || typeof text !== "string" || !text.trim() || text.length > 5000) return Response.json({ error: "Send the rendered PDF and its summary." }, { status: 400 });
    submittedSummary = text.trim();
    bytes = await file.arrayBuffer();
  } else if (/^application\/pdf/i.test(contentType)) bytes = await request.arrayBuffer();
  else return Response.json({ error: "Send the rendered PDF" }, { status: 415 });
  if (bytes.byteLength < 100 || bytes.byteLength > MAX_PDF_BYTES || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") return Response.json({ error: "The file is not a valid PDF" }, { status: 415 });
  const storage = (env as unknown as { DOCUMENTS?: R2Bucket }).DOCUMENTS;
  if (!storage) return Response.json({ error: "Private document storage is not available.", code: "DOCUMENT_STORAGE_NOT_CONFIGURED" }, { status: 503 });
  const job = await resolveRealJob(jobId, databaseFromEnvironment(env), storage);
  if (!job) return Response.json({ error: "This live job is no longer available" }, { status: 404 });
  const user = await getCurrentUser();
  const ownerId = safeOwnerId(user?.id);
  const [pkg, storedResume] = await Promise.all([
    readStoredTailoredApplication(storage, ownerId, job.id).catch(() => null),
    readStoredResume(storage, ownerId).catch(() => null),
  ]);
  if (!pkg) return Response.json({ error: "Create the tailored application before saving a CV design.", code: "NOT_GENERATED" }, { status: 409 });
  if (applicationNeedsRefresh(pkg, storedResume)) return Response.json({ error: "Update the application with your profile corrections before changing its design.", code: "PROFILE_CHANGED" }, { status: 409 });
  const designed = storedResume ? prepareDesignedResume(storedResume.content, storedResume.profile, job, submittedSummary ?? pkg.application.summary) : null;
  const updated: StoredTailoredApplication = { ...pkg, template: design, ...(designed ? { content: designed.content, application: { ...pkg.application, summary: designed.summary } } : {}) };
  const cvVersion = storedResume ? await makeCvSnapshot(ownerId, job, storedResume, updated) : null;
  await storage.put(tailoredResumeKey(ownerId, job.id), bytes, { httpMetadata: { contentType: "application/pdf" }, customMetadata: { ownerId, provider: "nextjob-designer", jobId: job.id, design, ...(cvVersion ? { cvVersionId: cvVersion.id } : {}) } });
  await storage.put(tailoredApplicationKey(ownerId, job.id), new TextEncoder().encode(JSON.stringify(updated)), { httpMetadata: { contentType: "application/json" }, customMetadata: { ownerId, jobId: job.id, resumeProvider: updated.resumeProvider, documentsProvider: updated.documentsProvider } });
  if (storedResume) {
    storedResume.preferredTemplate = design;
    await storage.put(resumeProfileKey(ownerId), new TextEncoder().encode(JSON.stringify(storedResume)), { httpMetadata: { contentType: "application/json" }, customMetadata: { ownerId, provider: storedResume.provider, verified: storedResume.verifiedAt ? "true" : "false", externalResumeId: storedResume.externalResumeId ?? "" } });
  }
  return Response.json({ design, documentUrl: `/api/documents/pdf?job=${encodeURIComponent(job.id)}`, bytes: bytes.byteLength }, { headers: { "cache-control": "private, no-store" } });
}
