import { env } from "cloudflare:workers";
import { z } from "zod";
import { getCurrentUser } from "../../auth";
import { databaseFromEnvironment, ensureApplicationUser } from "../../../lib/job-store";
import { assertSameOrigin } from "../../../lib/security";

const bodySchema = z.object({ jobId: z.string().min(1).max(80), saved: z.boolean() });

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return Response.json({ error: "Invalid request origin" }, { status: 403 });
  const user = await getCurrentUser();
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid saved-job request" }, { status: 400 });
  const db = databaseFromEnvironment(env);
  if (!db || !user) return Response.json({ saved: parsed.data.saved, persisted: false });
  await ensureApplicationUser(db, user);
  const userId = user.id;
  if (parsed.data.saved) {
    await db.prepare("INSERT INTO saved_jobs (id, user_id, job_id, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id, job_id) DO UPDATE SET deleted_at = NULL").bind(crypto.randomUUID(), userId, parsed.data.jobId).run();
  } else {
    await db.prepare("UPDATE saved_jobs SET deleted_at = CURRENT_TIMESTAMP WHERE user_id = ? AND job_id = ?").bind(userId, parsed.data.jobId).run();
  }
  return Response.json({ saved: parsed.data.saved, persisted: true });
}
