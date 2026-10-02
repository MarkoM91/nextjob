import { env } from "cloudflare:workers";
import { z } from "zod";
import { getCurrentUser } from "../../../auth";
import { applicationNeedsRefresh, readStoredResume, readStoredTailoredApplication, safeOwnerId, tailoredApplicationKey, tailoredResumeKey } from "../../../../lib/resume-storage";
import { assertSameOrigin, clientKey, rateLimit } from "../../../../lib/security";
import { ReactiveResumeApiError, setReactiveResumeSummary } from "../../../../lib/reactive-resume";

const schema = z.object({ jobId: z.string().min(1).max(80), summary: z.string().trim().min(1).max(5000) }).strict();
export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return Response.json({ error: "Invalid request origin" }, { status: 403 });
  if (!rateLimit(`cv-summary:${clientKey(request)}`, 30, 3600000).allowed) return Response.json({ error: "Too many updates. Please try later." }, { status: 429 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Enter a summary of 1–5,000 characters." }, { status: 400 });
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Upload your CV first." }, { status: 401 });
  const storage = (env as unknown as { DOCUMENTS?: R2Bucket }).DOCUMENTS;
  const owner = safeOwnerId(user.id);
  const [pkg, resume] = await Promise.all([readStoredTailoredApplication(storage, owner, parsed.data.jobId), readStoredResume(storage, owner)]);
  if (!storage || !pkg?.externalResumeId || !resume?.verifiedAt) return Response.json({ error: "Create a CV from your verified profile first." }, { status: 409 });
  if (applicationNeedsRefresh(pkg, resume)) return Response.json({ error: "Update your CV with your profile corrections first." }, { status: 409 });
  try {
    const { pdf } = await setReactiveResumeSummary(pkg.externalResumeId, parsed.data.summary);
    await storage.put(tailoredResumeKey(owner, pkg.jobId), pdf, { httpMetadata: { contentType: "application/pdf" } });
    pkg.application.summary = parsed.data.summary;
    if (pkg.content) pkg.content.summary = { content: parsed.data.summary };
    await storage.put(tailoredApplicationKey(owner, pkg.jobId), new TextEncoder().encode(JSON.stringify(pkg)), { httpMetadata: { contentType: "application/json" } });
    return Response.json({ saved: true }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) { return Response.json({ error: error instanceof ReactiveResumeApiError ? error.message : "Your summary could not be saved. Try again." }, { status: 502 }); }
}
