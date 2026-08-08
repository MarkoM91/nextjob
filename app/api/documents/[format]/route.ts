import { candidate, jobs } from "../../../../lib/demo-data";
import { createDemoApplication } from "../../../../lib/engine";
import { applicationPlainText, generateDocx, generatePdf } from "../../../../lib/documents";
import { clientKey, rateLimit } from "../../../../lib/security";

const contentTypes = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", txt: "text/plain; charset=utf-8" } as const;

export async function GET(request: Request, { params }: { params: Promise<{ format: string }> }) {
  const limit = rateLimit(`document:${clientKey(request)}`, 30, 60 * 60 * 1000);
  if (!limit.allowed) return Response.json({ error: "Document download limit reached" }, { status: 429 });
  const { format } = await params;
  if (!(format in contentTypes)) return Response.json({ error: "Use pdf, docx, or txt" }, { status: 400 });
  const jobId = new URL(request.url).searchParams.get("job") ?? "job-01";
  const job = jobs.find((item) => item.id === jobId);
  if (!job) return Response.json({ error: "Job not found" }, { status: 404 });
  const application = createDemoApplication(candidate, job);
  const bytes = format === "pdf" ? generatePdf(candidate, job, application) : format === "docx" ? generateDocx(candidate, job, application) : new TextEncoder().encode(applicationPlainText(candidate, job, application));
  const safeTitle = job.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return new Response(bytes.buffer as ArrayBuffer, { headers: { "content-type": contentTypes[format as keyof typeof contentTypes], "content-disposition": `attachment; filename="anna-bianchi-${safeTitle}.${format}"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}
