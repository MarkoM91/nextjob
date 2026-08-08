import { z } from "zod";
import { candidate, jobs } from "../../../../lib/demo-data";
import { createDemoApplication, validateGeneratedClaims } from "../../../../lib/engine";
import { assertSameOrigin, clientKey, rateLimit } from "../../../../lib/security";

const requestSchema = z.object({ jobId: z.string().regex(/^job-\d{2}$/), tone: z.enum(["Professional", "Direct", "Warm", "Concise"]).default("Professional") });

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return Response.json({ error: "Invalid request origin" }, { status: 403 });
  const limit = rateLimit(`generate:${clientKey(request)}`, 10, 60 * 60 * 1000);
  if (!limit.allowed) return Response.json({ error: "Generation limit reached", retryAfterSeconds: limit.retryAfterSeconds }, { status: 429 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid generation request", details: parsed.error.flatten() }, { status: 400 });
  const job = jobs.find((item) => item.id === parsed.data.jobId);
  if (!job) return Response.json({ error: "Job not found" }, { status: 404 });
  const application = createDemoApplication(candidate, job, parsed.data.tone);
  const validation = validateGeneratedClaims(application, candidate);
  if (!validation.valid) return Response.json({ error: "Generated claims failed factual validation", unsupported: validation.unsupported }, { status: 422 });
  return Response.json({ application, factualValidation: validation, statement: "NextJOB improves wording and relevance but never invents experience.", demoMode: true });
}
