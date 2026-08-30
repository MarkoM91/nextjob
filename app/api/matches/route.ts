import { env } from "cloudflare:workers";
import { z } from "zod";
import { getChatGPTUser } from "../../chatgpt-auth";
import { candidate } from "../../../lib/demo-data";
import { rankJobs } from "../../../lib/engine";
import { searchAllProviders } from "../../../lib/providers";
import { databaseFromEnvironment, persistLiveJobs } from "../../../lib/job-store";
import { readStoredResume, safeOwnerId } from "../../../lib/resume-storage";
import { clientKey, rateLimit } from "../../../lib/security";

const querySchema = z.object({ includeIneligible: z.enum(["true", "false"]).optional(), country: z.string().length(2).optional(), cursor: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(30).default(12) });

function searchKeywords(profile: typeof candidate): string[] {
  const simplifiedTitles = profile.targetTitles.map((title) => title.replace(/\b(?:junior|senior|lead|specialist|associate|manager|coordinator)\b/gi, " ").replace(/\s+/g, " ").trim());
  const roleTerms = profile.targetTitles.flatMap((title) => title.split(/[^a-zA-Z0-9+#.]+/)).filter((term) => term.length >= 4 && !/^(?:specialist|associate|manager|coordinator)$/i.test(term));
  const roleText = `${profile.currentRole} ${profile.targetTitles.join(" ")}`;
  const supportAliases = /\b(?:support|help\s*desk|service\s*desk|technician)\b/i.test(roleText) ? ["IT support", "technical support", "service desk", "help desk", "desktop support", "support engineer"] : [];
  return [...new Set([...profile.targetTitles, ...simplifiedTitles, profile.currentRole, ...supportAliases, ...roleTerms, ...profile.skills.slice(0, 10)].filter(Boolean))].slice(0, 30);
}

function isRelevantRoleTitle(title: string, profile: typeof candidate): boolean {
  if (/don't see what|general application|talent pool|future opportunities|open application|speculative application/i.test(title)) return false;
  if (/\b(?:software|devops|platform|backend|frontend|full[- ]?stack)\b.*\b(?:engineer|developer)\b/i.test(title)) return false;
  const stopWords = new Set(["specialist", "associate", "manager", "coordinator", "senior", "junior", "lead", "the", "and", "for"]);
  const targetTerms = [...profile.targetTitles, profile.currentRole]
    .flatMap((value) => value.toLowerCase().split(/[^a-z0-9+#.]+/))
    .filter((term) => term.length >= 4 && !stopWords.has(term));
  const normalizedTitle = title.toLowerCase();
  const exactTermMatch = [...new Set(targetTerms)].some((term) => normalizedTitle.includes(term));
  const supportFamily = targetTerms.some((term) => /^(?:support|help|desk|technician)$/.test(term));
  return exactTermMatch || (supportFamily && /\b(?:support|help\s*desk|service\s*desk|desktop|workplace|euc|technician)\b/i.test(title));
}

export async function GET(request: Request) {
  const limit = rateLimit(`matches:${clientKey(request)}`, 60);
  if (!limit.allowed) return Response.json({ error: "Too many requests" }, { status: 429 });
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return Response.json({ error: "Invalid filters", details: parsed.error.flatten() }, { status: 400 });
  const user = await getChatGPTUser();
  const storage = (env as unknown as { DOCUMENTS?: R2Bucket }).DOCUMENTS;
  const storedResume = await readStoredResume(storage, safeOwnerId(user?.id)).catch(() => null);
  const profile = storedResume?.verifiedAt ? storedResume.profile : candidate;
  const live = await searchAllProviders({ keywords: searchKeywords(profile), countries: parsed.data.country ? [parsed.data.country] : undefined });
  const liveJobs = live.jobs.filter((job) => job.active);
  await persistLiveJobs(databaseFromEnvironment(env), liveJobs).catch(() => undefined);
  const matches = rankJobs(profile, liveJobs, parsed.data.includeIneligible === "true").filter((match) => match.score >= 45 && isRelevantRoleTitle(match.job.title, profile));
  const sourceMode = liveJobs.length ? "live" : "unavailable";
  const page = matches.slice(parsed.data.cursor, parsed.data.cursor + parsed.data.limit);
  const nextCursor = parsed.data.cursor + page.length < matches.length ? parsed.data.cursor + page.length : null;
  return Response.json({ matches: page, nextCursor, estimateLabel: "NextJOB match estimate", sourceMode, fictional: false, refreshedAt: new Date().toISOString(), providerFailures: live.failures, sourceCounts: live.sourceCounts, profileSource: storedResume?.verifiedAt ? "verified-cv" : "fallback-profile" }, { headers: { "cache-control": "private, max-age=60" } });
}
