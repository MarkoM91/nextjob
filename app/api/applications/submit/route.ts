import { env } from "cloudflare:workers";
import { z } from "zod";
import { getCurrentUser } from "../../../auth";
import { databaseFromEnvironment, ensureApplicationUser, resolveRealJob } from "../../../../lib/job-store";
import { assertSameOrigin, clientKey, rateLimit } from "../../../../lib/security";

const requestSchema = z.object({
  jobId: z.string().min(1).max(80),
  action: z.enum(["opened", "self_reported", "native"]),
  confirmed: z.boolean().optional(),
});

type ApplicationRow = {
  id: string;
  job_id: string;
  status: string;
  notes: string | null;
  application_date: string | null;
  created_at: string;
  updated_at: string;
  title: string;
  company: string;
  location_text: string;
  source_url: string | null;
  provider_name: string | null;
};

export async function GET() {
  const user = await getCurrentUser();
  const db = databaseFromEnvironment(env);
  if (!user || !db) return Response.json({ applications: [], persisted: false });
  const result = await db.prepare(`SELECT a.id, a.job_id, a.status, a.notes, a.application_date, a.created_at, a.updated_at,
    n.title, n.company, n.location_text, s.source_url, p.name AS provider_name
    FROM applications a
    JOIN normalized_jobs n ON n.id = a.job_id
    LEFT JOIN job_sources s ON s.job_id = n.id
    LEFT JOIN job_providers p ON p.id = s.provider_id
    WHERE a.user_id = ? AND a.deleted_at IS NULL
    GROUP BY a.id
    ORDER BY COALESCE(a.application_date, a.updated_at) DESC
    LIMIT 100`).bind(user.id).all<ApplicationRow>();
  return Response.json({
    applications: (result.results ?? []).map((row) => {
      let metadata: Record<string, unknown> = {};
      try { metadata = row.notes ? JSON.parse(row.notes) as Record<string, unknown> : {}; } catch { /* old notes remain readable */ }
      return {
        id: row.id,
        jobId: row.job_id,
        status: row.status,
        verification: metadata.verification ?? "unverified",
        applicationDate: row.application_date,
        updatedAt: row.updated_at,
        title: row.title,
        company: row.company,
        location: row.location_text,
        sourceUrl: row.source_url,
        providerName: row.provider_name ?? "Employer career site",
      };
    }),
    persisted: true,
  }, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return Response.json({ error: "Invalid request origin" }, { status: 403 });
  const limit = rateLimit(`application-activity:${clientKey(request)}`, 30, 60 * 60 * 1000);
  if (!limit.allowed) return Response.json({ error: "Application activity limit reached", retryAfterSeconds: limit.retryAfterSeconds }, { status: 429 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid application action", details: parsed.error.flatten() }, { status: 400 });
  if ((parsed.data.action === "self_reported" || parsed.data.action === "native") && parsed.data.confirmed !== true) {
    return Response.json({ error: "Review confirmation is required" }, { status: 400 });
  }

  const db = databaseFromEnvironment(env);
  const job = await resolveRealJob(parsed.data.jobId, db, (env as unknown as { DOCUMENTS?: R2Bucket }).DOCUMENTS);
  if (!job) return Response.json({ error: "This live job is no longer available" }, { status: 404 });
  const user = await getCurrentUser();
  if (parsed.data.action === "native") {
    if (!user) return Response.json({ error: "Sign in before submitting an application" }, { status: 401 });
    if (job.applicationMethod !== "native") return Response.json({ error: "This employer has not authorized in-app submission", applicationMethod: job.applicationMethod, sourceUrl: job.originalUrl }, { status: 409 });
    return Response.json({ error: "The employer submission connector is not configured", code: "NATIVE_CONNECTOR_NOT_CONFIGURED" }, { status: 503 });
  }

  const verification = parsed.data.action === "self_reported" ? "user_reported" : "not_submitted";
  const status = parsed.data.action === "self_reported" ? "self_reported_applied" : "employer_form_opened";
  const now = new Date().toISOString();
  if (parsed.data.action === "self_reported" && !user) return Response.json({ error: "Sign in to save this application to your private tracker" }, { status: 401 });
  if (parsed.data.action === "self_reported" && !db) return Response.json({ error: "The private application tracker is temporarily unavailable" }, { status: 503 });
  if (!user || !db) {
    return Response.json({
      applicationId: null,
      jobId: job.id,
      status,
      verification,
      persisted: false,
      statement: parsed.data.action === "self_reported" ? "You reported the application as sent. NextJOB has not received employer confirmation." : "The official employer form was opened. Nothing has been submitted by NextJOB.",
    });
  }

  await ensureApplicationUser(db, user);
  const existing = await db.prepare("SELECT id, status FROM applications WHERE user_id = ? AND job_id = ? AND deleted_at IS NULL LIMIT 1").bind(user.id, job.id).first<{ id: string; status: string }>();
  const applicationId = existing?.id ?? crypto.randomUUID();
  const effectiveStatus = existing?.status === "self_reported_applied" && parsed.data.action === "opened" ? existing.status : status;
  const effectiveVerification = effectiveStatus === "self_reported_applied" ? "user_reported" : verification;
  const notes = JSON.stringify({ verification: effectiveVerification, provider: job.providerName, sourceUrl: job.originalUrl, recordedAt: now });
  await db.prepare(`INSERT INTO applications (id, user_id, job_id, status, notes, application_date, next_action, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, job_id) DO UPDATE SET status = excluded.status, notes = excluded.notes,
    application_date = COALESCE(excluded.application_date, applications.application_date), next_action = excluded.next_action,
    updated_at = CURRENT_TIMESTAMP, deleted_at = NULL`).bind(
      applicationId,
      user.id,
      job.id,
      effectiveStatus,
      notes,
      effectiveStatus === "self_reported_applied" ? now : null,
      effectiveStatus === "self_reported_applied" ? "Check for an employer confirmation email" : "Complete the official employer form",
    ).run();
  if (!existing || existing.status !== effectiveStatus) {
    await db.prepare("INSERT INTO application_status_history (id, application_id, from_status, to_status, changed_by_user_id, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)").bind(crypto.randomUUID(), applicationId, existing?.status ?? null, effectiveStatus, user.id).run();
  }
  return Response.json({
    applicationId,
    jobId: job.id,
    status: effectiveStatus,
    verification: effectiveVerification,
    persisted: true,
    statement: effectiveStatus === "self_reported_applied" ? "Recorded from your confirmation. Employer receipt has not been verified." : "The official employer form was opened. Nothing has been submitted by NextJOB.",
  });
}
