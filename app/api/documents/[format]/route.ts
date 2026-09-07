import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { candidate } from "../../../../lib/demo-data";
import { createDemoApplication } from "../../../../lib/engine";
import { applicationPlainText, coverLetterText, emailText, interviewPrepText, textToDocx, textToPdf } from "../../../../lib/documents";
import { databaseFromEnvironment, resolveRealJob } from "../../../../lib/job-store";
import { readStoredResume, readStoredTailoredApplication, safeOwnerId, tailoredResumeKey } from "../../../../lib/resume-storage";
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
  const storage = (env as unknown as { DOCUMENTS?: R2Bucket }).DOCUMENTS;
  const job = await resolveRealJob(jobId, databaseFromEnvironment(env), storage);
  if (!job) return Response.json({ error: "This live job is no longer available" }, { status: 404 });
  const user = await getChatGPTUser();
  const ownerId = safeOwnerId(user?.id);
  const [storedResume, storedPackage] = await Promise.all([
    readStoredResume(storage, ownerId).catch(() => null),
    readStoredTailoredApplication(storage, ownerId, job.id).catch(() => null),
  ]);
  const profile = storedResume?.verifiedAt ? storedResume.profile : candidate;
  const kind = doc as keyof typeof documentKinds;
  const fileBase = kind === "cv" ? `${slug(profile.fullName)}-${slug(job.title)}` : `${slug(profile.fullName)}-${kind}-${slug(job.title)}`;
  // The studio previews the PDF in a frame; downloads keep the attachment disposition.
  const inline = url.searchParams.get("inline") === "true" && format === "pdf";
  const headers = (contentType: string, provider: string) => ({
    "content-type": contentType,
    "content-disposition": `${inline ? "inline" : "attachment"}; filename="${fileBase}.${format}"`,
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    "x-nextjob-document-provider": provider,
    // The app's default policy forbids framing; the preview frame is same-origin and the PDF runs no scripts.
    ...(inline ? { "content-security-policy": "default-src 'none'; frame-ancestors 'self'" } : {}),
  });
  if (kind === "cv" && format === "pdf") {
    const generated = await storage?.get(tailoredResumeKey(ownerId, job.id)) as { body: ReadableStream; customMetadata?: Record<string, string> } | null | undefined;
    if (generated) return new Response(generated.body, { headers: headers(contentTypes.pdf, generated.customMetadata?.provider ?? "reactive-resume") });
  }
  // The stored package is what the candidate reviewed; the template only stands in when nothing was generated.
  const application = storedPackage?.application ?? createDemoApplication(profile, job);
  const provider = storedPackage ? (kind === "cv" ? storedPackage.resumeProvider : storedPackage.documentsProvider) : "nextjob-fallback";
  const text = kind === "cv" ? applicationPlainText(profile, job, application)
    : kind === "cover-letter" ? coverLetterText(profile, job, application)
      : kind === "email" ? emailText(profile, job, application)
        : interviewPrepText(profile, job, application);
  const bytes = format === "pdf" ? textToPdf(text)
    : format === "docx" ? textToDocx(text, { title: `${documentKinds[kind]} — ${job.title}`, author: profile.fullName })
      : new TextEncoder().encode(text);
  return new Response(bytes.buffer as ArrayBuffer, { headers: headers(contentTypes[format as keyof typeof contentTypes], provider) });
}
