import { z } from "zod";
import { candidate, jobs } from "../../../lib/demo-data";
import { rankJobs } from "../../../lib/engine";
import { clientKey, rateLimit } from "../../../lib/security";

const querySchema = z.object({ includeIneligible: z.enum(["true", "false"]).optional(), country: z.string().length(2).optional(), cursor: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(30).default(12) });

export async function GET(request: Request) {
  const limit = rateLimit(`matches:${clientKey(request)}`, 60);
  if (!limit.allowed) return Response.json({ error: "Too many requests" }, { status: 429 });
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return Response.json({ error: "Invalid filters", details: parsed.error.flatten() }, { status: 400 });
  const filtered = parsed.data.country ? jobs.filter((job) => job.countryCode === parsed.data.country) : jobs;
  const matches = rankJobs(candidate, filtered, parsed.data.includeIneligible === "true");
  const page = matches.slice(parsed.data.cursor, parsed.data.cursor + parsed.data.limit);
  const nextCursor = parsed.data.cursor + page.length < matches.length ? parsed.data.cursor + page.length : null;
  return Response.json({ matches: page, nextCursor, estimateLabel: "NextJOB match estimate", fictional: true });
}
