import type { Job, SalaryPeriod } from "./domain";
import { liveJobInternals } from "./live-job-providers";
import { findRecentJob, searchAllProviders } from "./providers";

type JobRow = {
  id: string;
  canonical_url: string | null;
  title: string;
  normalized_title: string;
  company: string;
  company_domain: string | null;
  country_code: string;
  city: string | null;
  location_text: string;
  workplace: Job["workplace"];
  employment_type: Job["employmentType"];
  seniority: Job["seniority"] | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: SalaryPeriod | null;
  normalized_annual_min_eur: number | null;
  normalized_annual_max_eur: number | null;
  salary_estimated: number;
  description_original: string;
  source_language: string | null;
  published_at: string | null;
  expires_at: string | null;
  provider_id: string | null;
  provider_name: string | null;
  external_id: string | null;
  source_url: string | null;
};

const countryNames: Record<string, string> = {
  AT: "Austria", AU: "Australia", BE: "Belgium", BR: "Brazil", CA: "Canada", CH: "Switzerland", CO: "Colombia",
  CR: "Costa Rica", CZ: "Czechia", DE: "Germany", DK: "Denmark", ES: "Spain", EU: "European Union", FI: "Finland",
  FR: "France", GB: "United Kingdom", GR: "Greece", HU: "Hungary", IE: "Ireland", IN: "India", IT: "Italy",
  JP: "Japan", LT: "Lithuania", MX: "Mexico", NL: "Netherlands", NO: "Norway", PL: "Poland", PT: "Portugal",
  RO: "Romania", SE: "Sweden", SG: "Singapore", US: "United States",
};

export function databaseFromEnvironment(environment: unknown): D1Database | undefined {
  return (environment as { DB?: D1Database } | undefined)?.DB;
}

async function hashJob(job: Job): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${job.canonicalUrl}\n${job.title}\n${job.description}`));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function persistLiveJobs(db: D1Database | undefined, liveJobs: Job[]): Promise<void> {
  if (!db || !liveJobs.length) return;
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  for (const job of liveJobs.slice(0, 80)) {
    const hash = await hashJob(job);
    statements.push(db.prepare("INSERT INTO job_providers (id, name, enabled, countries_json, languages_json, rate_limit_per_minute, created_at, updated_at) VALUES (?, ?, 1, ?, ?, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET name = excluded.name, enabled = 1, updated_at = CURRENT_TIMESTAMP").bind(job.providerId, job.providerName, JSON.stringify([job.countryCode]), JSON.stringify(job.languages)));
    statements.push(db.prepare("INSERT INTO normalized_jobs (id, canonical_url, title, normalized_title, company, normalized_company, company_domain, country_code, city, location_text, workplace, employment_type, seniority, description_original, description_sanitized, source_language, published_at, expires_at, first_seen_at, last_seen_at, content_hash, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET canonical_url = excluded.canonical_url, title = excluded.title, normalized_title = excluded.normalized_title, company = excluded.company, normalized_company = excluded.normalized_company, company_domain = excluded.company_domain, country_code = excluded.country_code, city = excluded.city, location_text = excluded.location_text, workplace = excluded.workplace, employment_type = excluded.employment_type, seniority = excluded.seniority, description_original = excluded.description_original, description_sanitized = excluded.description_sanitized, source_language = excluded.source_language, published_at = excluded.published_at, expires_at = excluded.expires_at, last_seen_at = excluded.last_seen_at, content_hash = excluded.content_hash, active = 1, updated_at = CURRENT_TIMESTAMP").bind(job.id, job.canonicalUrl, job.title, job.normalizedTitle, job.company, job.company.toLowerCase(), job.companyDomain, job.countryCode, job.city, job.locationText, job.workplace, job.employmentType, job.seniority, job.description, job.description, job.sourceLanguage, job.publishedAt, job.expiresAt ?? null, now, now, hash));
    statements.push(db.prepare("INSERT INTO job_sources (id, job_id, raw_job_id, provider_id, external_id, source_url, is_employer_direct, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT(provider_id, external_id) DO UPDATE SET job_id = excluded.job_id, source_url = excluded.source_url, updated_at = CURRENT_TIMESTAMP").bind(`source-${job.id}`, job.id, job.providerId, job.externalId, job.originalUrl));
  }
  await db.batch(statements);
}

function rowToJob(row: JobRow): Job {
  const description = row.description_original;
  const requiredSkills = liveJobInternals.extractSkills(`${row.title}\n${description}`);
  const responsibilities = description.split(/\n|(?<=[.!?])\s+/).map((line) => line.trim()).filter((line) => line.length > 35).slice(0, 5);
  const sourceUrl = row.source_url ?? row.canonical_url ?? "";
  const salary = row.salary_min !== null && row.salary_max !== null && row.salary_currency && row.salary_period
    ? {
        originalAmountMin: row.salary_min,
        originalAmountMax: row.salary_max,
        originalCurrency: row.salary_currency,
        originalPeriod: row.salary_period,
        normalizedAnnualMin: row.normalized_annual_min_eur ?? row.salary_min,
        normalizedAnnualMax: row.normalized_annual_max_eur ?? row.salary_max,
        normalizedCurrency: "EUR" as const,
        estimated: Boolean(row.salary_estimated),
      }
    : undefined;
  return {
    id: row.id,
    externalId: row.external_id ?? row.id,
    providerId: row.provider_id ?? "employer-site",
    providerName: row.provider_name ?? "Employer career site",
    applicationMethod: "external",
    canonicalUrl: sourceUrl,
    originalUrl: sourceUrl,
    title: row.title,
    normalizedTitle: row.normalized_title,
    company: row.company,
    companyDomain: row.company_domain ?? "",
    countryCode: row.country_code,
    country: countryNames[row.country_code] ?? row.country_code,
    city: row.city ?? row.location_text,
    locationText: row.location_text,
    workplace: row.workplace,
    employmentType: row.employment_type,
    seniority: row.seniority ?? "Mid",
    salary,
    description,
    responsibilities: responsibilities.length ? responsibilities : ["Review the original employer listing for responsibilities."],
    requirements: requiredSkills.map((value) => ({ value, kind: "skill", mandatory: true, confidence: 0.82, evidence: `${value} appears in the employer's published description.` })),
    requiredSkills,
    preferredSkills: [],
    languages: /\bitalian|italiano\b/i.test(description) ? ["Italian", "English"] : ["English"],
    visaSponsorship: null,
    publishedAt: row.published_at ?? new Date().toISOString(),
    expiresAt: row.expires_at ?? undefined,
    sourceLanguage: row.source_language ?? "en",
    active: true,
    fictional: false,
  };
}

export async function readStoredJob(db: D1Database | undefined, jobId: string): Promise<Job | null> {
  if (!db) return null;
  const row = await db.prepare(`SELECT n.id, n.canonical_url, n.title, n.normalized_title, n.company, n.company_domain,
    n.country_code, n.city, n.location_text, n.workplace, n.employment_type, n.seniority,
    n.salary_min, n.salary_max, n.salary_currency, n.salary_period, n.normalized_annual_min_eur,
    n.normalized_annual_max_eur, n.salary_estimated, n.description_original, n.source_language,
    n.published_at, n.expires_at, s.provider_id, p.name AS provider_name, s.external_id, s.source_url
    FROM normalized_jobs n
    LEFT JOIN job_sources s ON s.job_id = n.id
    LEFT JOIN job_providers p ON p.id = s.provider_id
    WHERE n.id = ? AND n.active = 1 AND n.deleted_at IS NULL
    ORDER BY s.is_employer_direct DESC LIMIT 1`).bind(jobId).first<JobRow>();
  return row ? rowToJob(row) : null;
}

/**
 * A job the candidate opened is kept as an object for a month, so the studio, tracker
 * and document links keep working across worker restarts even where the relational
 * store is unavailable or not yet migrated.
 */
const JOB_CACHE_TTL_MS = 30 * 86400000;

function jobCacheKey(jobId: string): string { return `jobs/${jobId.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 160)}.json`; }

export async function cacheResolvedJob(storage: R2Bucket | undefined, job: Job): Promise<void> {
  if (!storage || job.fictional) return;
  await storage.put(jobCacheKey(job.id), new TextEncoder().encode(JSON.stringify({ job, cachedAt: Date.now() })), { httpMetadata: { contentType: "application/json" }, customMetadata: { providerId: job.providerId } }).catch(() => undefined);
}

async function readCachedJob(storage: R2Bucket | undefined, jobId: string): Promise<Job | null> {
  if (!storage) return null;
  const object = await storage.get(jobCacheKey(jobId)).catch(() => null) as { text(): Promise<string> } | null;
  if (!object) return null;
  try {
    const { job, cachedAt } = JSON.parse(await object.text()) as { job: Job; cachedAt: number };
    return job && cachedAt + JOB_CACHE_TTL_MS > Date.now() ? job : null;
  } catch { return null; }
}

export async function resolveRealJob(jobId: string, db?: D1Database, storage?: R2Bucket): Promise<Job | null> {
  const stored = await readStoredJob(db, jobId).catch(() => null);
  if (stored) return stored;
  // The feed the user clicked from was keyword-driven, so resolve from what that
  // search actually returned before falling back to a broad re-search.
  const remembered = findRecentJob(jobId);
  if (remembered) {
    await Promise.all([persistLiveJobs(db, [remembered]).catch(() => undefined), cacheResolvedJob(storage, remembered)]);
    return remembered;
  }
  const cached = await readCachedJob(storage, jobId);
  if (cached) return cached;
  const live = await searchAllProviders({});
  const job = live.jobs.find((item) => item.id === jobId && !item.fictional) ?? null;
  if (job) await Promise.all([persistLiveJobs(db, [job]).catch(() => undefined), cacheResolvedJob(storage, job)]);
  return job;
}

export async function ensureApplicationUser(db: D1Database, user: { id: string; email: string; displayName: string }): Promise<void> {
  await db.prepare("INSERT INTO users (id, email, display_name, locale, role, created_at, updated_at) VALUES (?, ?, ?, 'en', 'user', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, updated_at = CURRENT_TIMESTAMP").bind(user.id, user.email, user.displayName).run();
}
