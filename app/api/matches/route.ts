import { env } from "cloudflare:workers";
import { z } from "zod";
import { candidate, jobs } from "../../../lib/demo-data";
import { rankJobs } from "../../../lib/engine";
import { searchAllProviders } from "../../../lib/providers";
import { clientKey, rateLimit } from "../../../lib/security";
import type { Job } from "../../../lib/domain";

const querySchema = z.object({ includeIneligible: z.enum(["true", "false"]).optional(), country: z.string().length(2).optional(), cursor: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(30).default(12) });

async function contentHash(job: Job): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${job.canonicalUrl}\n${job.title}\n${job.description}`));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function persistLiveJobs(db: D1Database | undefined, liveJobs: Job[]): Promise<void> {
  if (!db || !liveJobs.length) return;
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  for (const job of liveJobs.slice(0, 60)) {
    const hash = await contentHash(job);
    statements.push(db.prepare("INSERT INTO job_providers (id, name, enabled, countries_json, languages_json, rate_limit_per_minute, created_at, updated_at) VALUES (?, ?, 1, ?, ?, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET name = excluded.name, enabled = 1, updated_at = CURRENT_TIMESTAMP").bind(job.providerId, job.providerName, JSON.stringify([job.countryCode]), JSON.stringify(job.languages)));
    statements.push(db.prepare("INSERT INTO normalized_jobs (id, canonical_url, title, normalized_title, company, normalized_company, company_domain, country_code, city, location_text, workplace, employment_type, seniority, description_original, description_sanitized, source_language, published_at, expires_at, first_seen_at, last_seen_at, content_hash, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET canonical_url = excluded.canonical_url, title = excluded.title, normalized_title = excluded.normalized_title, company = excluded.company, normalized_company = excluded.normalized_company, company_domain = excluded.company_domain, country_code = excluded.country_code, city = excluded.city, location_text = excluded.location_text, workplace = excluded.workplace, employment_type = excluded.employment_type, seniority = excluded.seniority, description_original = excluded.description_original, description_sanitized = excluded.description_sanitized, source_language = excluded.source_language, published_at = excluded.published_at, expires_at = excluded.expires_at, last_seen_at = excluded.last_seen_at, content_hash = excluded.content_hash, active = 1, updated_at = CURRENT_TIMESTAMP").bind(job.id, job.canonicalUrl, job.title, job.normalizedTitle, job.company, job.company.toLowerCase(), job.companyDomain, job.countryCode, job.city, job.locationText, job.workplace, job.employmentType, job.seniority, job.description, job.description, job.sourceLanguage, job.publishedAt, job.expiresAt ?? null, now, now, hash));
    statements.push(db.prepare("INSERT INTO job_sources (id, job_id, raw_job_id, provider_id, external_id, source_url, is_employer_direct, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT(provider_id, external_id) DO UPDATE SET job_id = excluded.job_id, source_url = excluded.source_url, updated_at = CURRENT_TIMESTAMP").bind(`source-${job.id}`, job.id, job.providerId, job.externalId, job.originalUrl));
  }
  await db.batch(statements);
}

function isTargetSupportRole(job: Job): boolean {
  const title = job.title.toLowerCase();
  return /\b(?:it|technical|desktop|workplace|service|help|network|systems?)\b.*\b(?:support|desk|helpdesk|technician|analyst|engineer)\b|\b(?:support|desk|helpdesk)\b.*\b(?:it|technical|desktop|workplace|service|network|systems?)\b/i.test(title);
}

export async function GET(request: Request) {
  const limit = rateLimit(`matches:${clientKey(request)}`, 60);
  if (!limit.allowed) return Response.json({ error: "Too many requests" }, { status: 429 });
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return Response.json({ error: "Invalid filters", details: parsed.error.flatten() }, { status: 400 });
  const live = await searchAllProviders({ keywords: [...candidate.targetTitles, "IT support", "help desk", "service desk", "workplace support", "desktop support", "technical support", "network support"], countries: parsed.data.country ? [parsed.data.country] : undefined });
  const liveJobs = live.jobs.filter((job) => job.active);
  await persistLiveJobs((env as unknown as { DB?: D1Database }).DB, liveJobs).catch(() => undefined);
  const liveMatches = rankJobs(candidate, liveJobs, parsed.data.includeIneligible === "true").filter((match) => match.score >= 55 && isTargetSupportRole(match.job));
  const sourceMode = liveMatches.length ? "live" : "demo-fallback";
  const fallbackJobs = parsed.data.country ? jobs.filter((job) => job.countryCode === parsed.data.country) : jobs;
  const matches = liveMatches.length ? liveMatches : rankJobs(candidate, fallbackJobs, parsed.data.includeIneligible === "true");
  const page = matches.slice(parsed.data.cursor, parsed.data.cursor + parsed.data.limit);
  const nextCursor = parsed.data.cursor + page.length < matches.length ? parsed.data.cursor + page.length : null;
  return Response.json({ matches: page, nextCursor, estimateLabel: "NextJOB match estimate", sourceMode, fictional: sourceMode !== "live", refreshedAt: new Date().toISOString(), providerFailures: live.failures, sourceCounts: live.sourceCounts }, { headers: { "cache-control": "private, max-age=60" } });
}
