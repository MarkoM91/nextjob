import { env } from "cloudflare:workers";
import { z } from "zod";
import { getCurrentUser } from "../../auth";
import { databaseFromEnvironment, ensureApplicationUser, resolveRealJob } from "../../../lib/job-store";
import { assertSameOrigin, clientKey, rateLimit } from "../../../lib/security";
import { readStoredResume, safeOwnerId } from "../../../lib/resume-storage";
import { scoreJob } from "../../../lib/engine";
import type { Job } from "../../../lib/domain";

type SavedRecord = { job: Job; savedAt: string };
const bodySchema = z.object({ jobId: z.string().min(1).max(80), saved: z.boolean() }).strict();
const headers = { "cache-control": "private, no-store" };
const keyFor = (ownerId: string) => `private/${safeOwnerId(ownerId)}/saved-jobs/index.json`;
async function readSaved(ownerId: string, storage?: R2Bucket): Promise<SavedRecord[] | null> {
  const object = await storage?.get(keyFor(ownerId)) as { text(): Promise<string> } | null;
  if (!object) return null;
  const records = JSON.parse(await object.text()) as SavedRecord[];
  return Array.isArray(records) ? records.filter((item) => item.job?.id && !item.job.fictional).slice(0, 200) : [];
}
async function loadSaved(ownerId: string, storage?: R2Bucket, db?: D1Database): Promise<SavedRecord[]> {
    const index = await readSaved(ownerId, storage);
    const records = index ?? [];
    if (db && index === null) {
      const rows = await db.prepare("SELECT job_id, created_at FROM saved_jobs WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 200").bind(ownerId).all<{ job_id: string; created_at: string }>();
      const existing = new Set(records.map((item) => item.job.id));
      for (const row of rows.results ?? []) {
        if (existing.has(row.job_id)) continue;
        const job = await resolveRealJob(row.job_id, db, storage);
        if (job) { records.push({ job, savedAt: row.created_at }); existing.add(job.id); }
      }
    }
  return records;
}
export async function GET(request: Request) {
  if (!rateLimit(`saved-read:${clientKey(request)}`, 90).allowed) return Response.json({ error: "Too many requests" }, { status: 429, headers });
  const user = await getCurrentUser();
  if (!user) return Response.json({ savedJobIds: [], matches: [] }, { headers });
  const storage = (env as unknown as { DOCUMENTS?: R2Bucket }).DOCUMENTS;
  const db = databaseFromEnvironment(env);
  let records: SavedRecord[];
  try { records = await loadSaved(user.id, storage, db); } catch { return Response.json({ error: "Saved jobs could not be loaded. Try again." }, { status: 503, headers }); }
  const resume = await readStoredResume(storage, safeOwnerId(user.id));
  return Response.json({ savedJobIds: records.map((item) => item.job.id), matches: resume?.verifiedAt ? records.map((item) => scoreJob(resume.profile, item.job)) : [] }, { headers });
}
export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return Response.json({ error: "Invalid request origin" }, { status: 403 });
  if (!rateLimit(`saved-write:${clientKey(request)}`, 60).allowed) return Response.json({ error: "Too many requests" }, { status: 429 });
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Upload your CV to start your private workspace." }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid saved-job request" }, { status: 400 });
  const storage = (env as unknown as { DOCUMENTS?: R2Bucket }).DOCUMENTS;
  const db = databaseFromEnvironment(env);
  if (!storage && !db) return Response.json({ error: "Saved jobs are temporarily unavailable." }, { status: 503 });
  const job = parsed.data.saved ? await resolveRealJob(parsed.data.jobId, db, storage) : null;
  if (parsed.data.saved && (!job || job.fictional)) return Response.json({ error: "This job is no longer available." }, { status: 404 });
  try {
    if (storage) {
      const records = (await loadSaved(user.id, storage, db)).filter((item) => item.job.id !== parsed.data.jobId);
      if (job) records.unshift({ job, savedAt: new Date().toISOString() });
      if (records.length > 200) return Response.json({ error: "You have 200 saved jobs. Remove one before saving another." }, { status: 409 });
      await storage.put(keyFor(user.id), new TextEncoder().encode(JSON.stringify(records)), { httpMetadata: { contentType: "application/json" } });
    }
    if (db) {
      await ensureApplicationUser(db, user);
      if (parsed.data.saved) await db.prepare("INSERT INTO saved_jobs (id, user_id, job_id, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id, job_id) DO UPDATE SET deleted_at = NULL").bind(crypto.randomUUID(), user.id, parsed.data.jobId).run();
      else await db.prepare("UPDATE saved_jobs SET deleted_at = CURRENT_TIMESTAMP WHERE user_id = ? AND job_id = ?").bind(user.id, parsed.data.jobId).run();
    }
  } catch { return Response.json({ error: "Your change could not be saved. Please try again." }, { status: 503 }); }
  return Response.json({ saved: parsed.data.saved, persisted: true }, { headers });
}
