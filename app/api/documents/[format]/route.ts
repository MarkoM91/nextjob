import { env } from "cloudflare:workers";
import { getCurrentUser } from "../../../auth";
import { createDemoApplication } from "../../../../lib/engine";
import { coverLetterText, emailText, interviewPrepText, textToDocx, textToPdf } from "../../../../lib/documents";
import { databaseFromEnvironment, resolveRealJob } from "../../../../lib/job-store";
import { applicationNeedsRefresh, readStoredResume, readStoredTailoredApplication, safeOwnerId } from "../../../../lib/resume-storage";
import { downloadCv } from "../../../../lib/billing-download";
import { clientKey, rateLimit } from "../../../../lib/security";

const contentTypes = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", txt: "text/plain; charset=utf-8" } as const;
const documentKinds = { cv: "Tailored CV", "cover-letter": "Cover letter", email: "Application email", interview: "Interview preparation" } as const;

function slug(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }

export async function GET(request: Request, { params }: { params: Promise<{ format: string }> }) {
  const limit = rateLimit(`document:${clientKey(request)}`, 30, 60 * 60 * 1000);
  if (!limit.allowed) return Response.json({ error: "Document download limit reached" }, { status: 429 });
  const { format } = await params;
  if (!(format in contentTypes)) return Response.json({ error: "Use pdf, docx, or txt" }, { status: 400 });
  const url = new URL(request.url);
  const jobId = url.searchParams.get("job");
  if (!jobId || jobId.length > 80) return Response.json({ error: "A valid live job is required" }, { status: 400 });
  const doc = url.searchParams.get("doc") ?? "cv";
  if (!(doc in documentKinds)) return Response.json({ error: "Use doc=cv, cover-letter, email, or interview" }, { status: 400 });
  const kind = doc as keyof typeof documentKinds;
  // The studio previews the PDF in a frame; downloads keep the attachment disposition.
  const inline = url.searchParams.get("inline") === "true" && format === "pdf";
  const storage = (env as unknown as { DOCUMENTS?: R2Bucket }).DOCUMENTS;
  const cvUser = await getCurrentUser();
  if (kind === "cv") {
    try { return await downloadCv(request, format as "pdf" | "docx" | "txt", cvUser?.id, databaseFromEnvironment(env), storage); }
    catch { return Response.json({ error: "Your CV download is temporarily unavailable. Please try again; your preview remains free." }, { status: 503, headers: { "cache-control": "private, no-store" } }); }
  }
  const job = await resolveRealJob(jobId, databaseFromEnvironment(env), storage);
  if (!job) return Response.json({ error: "This live job is no longer available" }, { status: 404 });
  const user = await getCurrentUser();
  const ownerId = safeOwnerId(user?.id);
  const [storedResume, storedPackage] = await Promise.all([
    readStoredResume(storage, ownerId).catch(() => null),
    readStoredTailoredApplication(storage, ownerId, job.id).catch(() => null),
  ]);
  if (storedPackage && applicationNeedsRefresh(storedPackage, storedResume)) {
    const reviewUrl = new URL(`/generating?job=${encodeURIComponent(job.id)}`, request.url);
    if (request.headers.get("accept")?.includes("application/json")) return Response.json({ error: "Update your documents with your corrected profile first.", code: "PROFILE_CHANGED", reviewUrl: reviewUrl.toString() }, { status: 409 });
    return Response.redirect(reviewUrl.toString(), 303);
  }
  if (!storedResume?.verifiedAt) {
    return Response.json({ error: "Upload and verify your CV before exporting application documents.", code: "CV_PROFILE_REQUIRED" }, { status: 409, headers: { "cache-control": "private, no-store" } });
  }
  const profile = storedResume.profile;
  const fileBase = `${slug(profile.fullName)}-${kind}-${slug(job.title)}`;
  const headers = (contentType: string, provider: string) => ({
    "content-type": contentType,
    "content-disposition": `${inline ? "inline" : "attachment"}; filename="${fileBase}.${format}"`,
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    "x-nextjob-document-provider": provider,
    // The app's default policy forbids framing; the preview frame is same-origin and the PDF runs no scripts.
    ...(inline ? { "content-security-policy": "default-src 'none'; frame-ancestors 'self'" } : {}),
  });
  // The stored package is what the candidate reviewed; the template only stands in when nothing was generated.
  const application = storedPackage?.application ?? createDemoApplication(profile, job);
  const provider = storedPackage ? storedPackage.documentsProvider : "nextjob-fallback";
  const text = kind === "cover-letter" ? coverLetterText(profile, job, application)
      : kind === "email" ? emailText(profile, job, application)
        : interviewPrepText(profile, job, application);
  const bytes = format === "pdf" ? textToPdf(text)
    : format === "docx" ? textToDocx(text, { title: `${documentKinds[kind]} — ${job.title}`, author: profile.fullName })
      : new TextEncoder().encode(text);
  return new Response(bytes.buffer as ArrayBuffer, { headers: headers(contentTypes[format as keyof typeof contentTypes], provider) });
}
