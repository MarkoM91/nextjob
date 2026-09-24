import { env } from "cloudflare:workers";
import { z } from "zod";
import { ensureGuestUser, getCurrentUser } from "../../../auth";
import { importJobFromText, importJobFromUrl, JobImportError, listImportedJobs, removeImportedJob, saveImportedJob } from "../../../../lib/job-import";
import { cacheResolvedJob } from "../../../../lib/job-store";
import { safeOwnerId } from "../../../../lib/resume-storage";
import { assertSameOrigin, clientKey, rateLimit } from "../../../../lib/security";

const requestSchema = z.object({
  url: z.string().trim().max(2_000).optional(),
  title: z.string().trim().max(180).optional(),
  company: z.string().trim().max(140).optional(),
  location: z.string().trim().max(240).optional(),
  description: z.string().trim().max(30_000).optional(),
  sourceUrl: z.string().trim().max(2_000).optional(),
});

function storageOf(): R2Bucket | undefined { return (env as unknown as { DOCUMENTS?: R2Bucket }).DOCUMENTS; }

export async function GET(request: Request) {
  const limit = rateLimit(`import-list:${clientKey(request)}`, 60);
  if (!limit.allowed) return Response.json({ error: "Too many requests" }, { status: 429 });
  const user = await getCurrentUser();
  const jobs = await listImportedJobs(storageOf(), safeOwnerId(user?.id)).catch(() => []);
  return Response.json({ jobs }, { headers: { "cache-control": "private, no-store" } });
}

/** Adds one job from a link (fetched like the crawler, robots.txt permitting) or from pasted text. */
export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return Response.json({ error: "Invalid request origin" }, { status: 403 });
  const limit = rateLimit(`import:${clientKey(request)}`, 30, 60 * 60 * 1000);
  if (!limit.allowed) return Response.json({ error: "Import limit reached", retryAfterSeconds: limit.retryAfterSeconds }, { status: 429 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid job import", details: parsed.error.flatten() }, { status: 400 });
  const storage = storageOf();
  if (!storage) return Response.json({ error: "Private storage is not available.", code: "DOCUMENT_STORAGE_NOT_CONFIGURED" }, { status: 503 });
  const { user, setCookie } = await ensureGuestUser(request);
  if (!user) return Response.json({ error: "A private workspace is not available yet. Please try again later.", code: "ANONYMOUS_WORKSPACE_NOT_CONFIGURED" }, { status: 503 });
  const ownerId = safeOwnerId(user.id);
  try {
    const job = parsed.data.url && !parsed.data.description
      ? await importJobFromUrl(parsed.data.url)
      : importJobFromText({ title: parsed.data.title ?? "", company: parsed.data.company, location: parsed.data.location, description: parsed.data.description ?? "", sourceUrl: parsed.data.sourceUrl ?? parsed.data.url });
    await saveImportedJob(storage, ownerId, job);
    await cacheResolvedJob(storage, job);
    const headers = new Headers({ "cache-control": "private, no-store" });
    if (setCookie) headers.set("set-cookie", setCookie);
    return Response.json({ job }, { status: 201, headers });
  } catch (error) {
    if (error instanceof JobImportError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
    return Response.json({ error: "The job could not be imported" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!assertSameOrigin(request)) return Response.json({ error: "Invalid request origin" }, { status: 403 });
  const jobId = new URL(request.url).searchParams.get("job");
  if (!jobId || jobId.length > 80) return Response.json({ error: "A job id is required" }, { status: 400 });
  const storage = storageOf();
  if (!storage) return Response.json({ error: "Private storage is not available." }, { status: 503 });
  const user = await getCurrentUser();
  const jobs = await removeImportedJob(storage, safeOwnerId(user?.id), jobId);
  return Response.json({ jobs }, { headers: { "cache-control": "private, no-store" } });
}
