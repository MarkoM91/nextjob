import { env } from "cloudflare:workers";
import { getCurrentUser } from "../../../auth";
import { candidate } from "../../../../lib/demo-data";
import { rankJobs } from "../../../../lib/engine";
import { databaseFromEnvironment, resolveRealJob } from "../../../../lib/job-store";
import { readStoredResume, safeOwnerId } from "../../../../lib/resume-storage";
import { clientKey, rateLimit } from "../../../../lib/security";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const limit = rateLimit(`job-detail:${clientKey(request)}`, 90);
  if (!limit.allowed) return Response.json({ error: "Too many requests" }, { status: 429 });
  const { id } = await params;
  if (!id || id.length > 80) return Response.json({ error: "Invalid job" }, { status: 400 });
  const storage = (env as unknown as { DOCUMENTS?: R2Bucket }).DOCUMENTS;
  const job = await resolveRealJob(id, databaseFromEnvironment(env), storage);
  if (!job) return Response.json({ error: "This live job is no longer available" }, { status: 404 });
  const user = await getCurrentUser();
  const storedResume = await readStoredResume(storage, safeOwnerId(user?.id)).catch(() => null);
  const profile = storedResume?.verifiedAt ? storedResume.profile : candidate;
  const match = rankJobs(profile, [job], true)[0];
  return Response.json({ match, profileSource: storedResume?.verifiedAt ? "verified-cv" : "fallback-profile" }, { headers: { "cache-control": "private, max-age=60" } });
}
