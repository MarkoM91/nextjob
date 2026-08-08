import { z } from "zod";
import { jobs } from "../../../../lib/demo-data";
import { assertSameOrigin, clientKey, rateLimit } from "../../../../lib/security";

const requestSchema = z.object({
  jobId: z.string().regex(/^job-\d{2}$/),
  confirmed: z.literal(true),
});

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return Response.json({ error: "Invalid request origin" }, { status: 403 });
  const limit = rateLimit(`submit:${clientKey(request)}`, 12, 60 * 60 * 1000);
  if (!limit.allowed) return Response.json({ error: "Submission limit reached", retryAfterSeconds: limit.retryAfterSeconds }, { status: 429 });

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Review confirmation is required" }, { status: 400 });

  const job = jobs.find((item) => item.id === parsed.data.jobId);
  if (!job) return Response.json({ error: "Job not found" }, { status: 404 });
  if (job.applicationMethod !== "native") {
    return Response.json({ error: "This employer does not support verified in-app submission", applicationMethod: job.applicationMethod }, { status: 409 });
  }

  return Response.json({
    applicationId: `demo-application-${job.id}`,
    status: "submitted",
    submittedAt: new Date().toISOString(),
    destination: job.providerName,
    demoMode: true,
    statement: "This fictional demo confirms the authorized native-submission flow without contacting a real employer.",
  });
}
