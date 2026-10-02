import { env } from "cloudflare:workers";
import { ensureGuestUser, getCurrentUser } from "../../../auth";
import { candidate } from "../../../../lib/demo-data";
import { readStoredResume, resumeProfileKey, safeOwnerId } from "../../../../lib/resume-storage";
import { assertSameOrigin, clientKey, rateLimit } from "../../../../lib/security";
import { applyProfileUpdate, profileUpdateSchema } from "../../../../lib/profile-review";

export async function GET(request: Request) {
  const limit = rateLimit(`cv-profile:${clientKey(request)}`, 60);
  if (!limit.allowed) return Response.json({ error: "Too many requests" }, { status: 429 });
  const user = await getCurrentUser();
  const storage = (env as unknown as { DOCUMENTS?: R2Bucket }).DOCUMENTS;
  const stored = await readStoredResume(storage, safeOwnerId(user?.id)).catch(() => null);
  return Response.json(stored ? { profile: stored.profile, resume: stored.content, source: stored.provider, parsedAt: stored.parsedAt, verifiedAt: stored.verifiedAt, updatedAt: stored.updatedAt, preferredTemplate: stored.preferredTemplate ?? null } : { profile: candidate, resume: null, source: "nextjob-fallback", preferredTemplate: null }, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return Response.json({ error: "Invalid request origin" }, { status: 403 });
  const limit = rateLimit(`cv-profile-confirm:${clientKey(request)}`, 20, 60 * 60 * 1000);
  if (!limit.allowed) return Response.json({ error: "Too many requests" }, { status: 429 });
  const body = profileUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Check your profile fields and try again.", details: body.error.flatten() }, { status: 400 });
  const { user, setCookie } = await ensureGuestUser(request);
  if (!user) return Response.json({ error: "A private workspace is not available yet. Please try again later.", code: "ANONYMOUS_WORKSPACE_NOT_CONFIGURED" }, { status: 503 });
  const ownerId = safeOwnerId(user.id);
  const storage = (env as unknown as { DOCUMENTS?: R2Bucket }).DOCUMENTS;
  const original = await readStoredResume(storage, ownerId).catch(() => null);
  if (!storage || !original) return Response.json({ error: "Upload and parse your CV first" }, { status: 409 });
  const stored = applyProfileUpdate(original, body.data);
  await storage.put(resumeProfileKey(ownerId), new TextEncoder().encode(JSON.stringify(stored)), { httpMetadata: { contentType: "application/json" }, customMetadata: { ownerId, provider: "reactive-resume", verified: "true", externalResumeId: stored.externalResumeId } });
  const headers = new Headers({ "cache-control": "private, no-store" });
  if (setCookie) headers.set("set-cookie", setCookie);
  return Response.json({ profile: stored.profile, source: stored.provider, verifiedAt: stored.verifiedAt, updatedAt: stored.updatedAt }, { headers });
}
