import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { candidate } from "../../../../lib/demo-data";
import { createDemoApplication } from "../../../../lib/engine";
import { applicationPlainText, generateDocx, generatePdf } from "../../../../lib/documents";
import { databaseFromEnvironment, resolveRealJob } from "../../../../lib/job-store";
import { readStoredResume, safeOwnerId, tailoredResumeKey } from "../../../../lib/resume-storage";
import { clientKey, rateLimit } from "../../../../lib/security";

const contentTypes = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", txt: "text/plain; charset=utf-8" } as const;

export async function GET(request: Request, { params }: { params: Promise<{ format: string }> }) {
  const limit = rateLimit(`document:${clientKey(request)}`, 30, 60 * 60 * 1000);
  if (!limit.allowed) return Response.json({ error: "Document download limit reached" }, { status: 429 });
  const { format } = await params;
  if (!(format in contentTypes)) return Response.json({ error: "Use pdf, docx, or txt" }, { status: 400 });
  const jobId = new URL(request.url).searchParams.get("job");
  if (!jobId || jobId.length > 80) return Response.json({ error: "A valid live job is required" }, { status: 400 });
  const job = await resolveRealJob(jobId, databaseFromEnvironment(env));
  if (!job) return Response.json({ error: "This live job is no longer available" }, { status: 404 });
  const user = await getChatGPTUser();
  const storage = (env as unknown as { DOCUMENTS?: R2Bucket }).DOCUMENTS;
  const storedResume = await readStoredResume(storage, safeOwnerId(user?.id)).catch(() => null);
  const profile = storedResume?.verifiedAt ? storedResume.profile : candidate;
  const safeTitle = job.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const safeName = profile.fullName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  if (format === "pdf") {
    const generated = await storage?.get(tailoredResumeKey(safeOwnerId(user?.id), job.id)) as { body: ReadableStream; customMetadata?: Record<string, string> } | null | undefined;
    if (generated) return new Response(generated.body, { headers: { "content-type": contentTypes.pdf, "content-disposition": `attachment; filename="${safeName}-${safeTitle}.pdf"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff", "x-nextjob-document-provider": generated.customMetadata?.provider ?? "reactive-resume" } });
  }
  const application = createDemoApplication(profile, job);
  const bytes = format === "pdf" ? generatePdf(profile, job, application) : format === "docx" ? generateDocx(profile, job, application) : new TextEncoder().encode(applicationPlainText(profile, job, application));
  return new Response(bytes.buffer as ArrayBuffer, { headers: { "content-type": contentTypes[format as keyof typeof contentTypes], "content-disposition": `attachment; filename="${safeName}-${safeTitle}.${format}"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff", "x-nextjob-document-provider": "nextjob-fallback" } });
}
