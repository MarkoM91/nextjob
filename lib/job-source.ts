import type { Job } from "./domain";

/** Provider id of the jobs the candidate added themselves (see job-import); defined here so the browser bundle never loads the crawler. */
export const IMPORT_PROVIDER_ID = "user-import";

/**
 * Where a posting's link actually leads. Kept free of server-only imports so the
 * Jobs screen and the API can label a source with the same rule.
 *
 * - employer: the company's own board (an ATS feed or a crawled careers page); the link
 *   opens the official form directly.
 * - aggregator: a licensed re-publisher; its link is an affiliate redirect through the
 *   aggregator's site, which may put a bot check in front of the employer's page.
 * - user: a job the candidate pasted or linked themselves.
 */
export type JobSourceKind = "employer" | "aggregator" | "user";

const AGGREGATOR_LABELS: Record<string, string> = { adzuna: "Adzuna", jooble: "Jooble", careerjet: "Careerjet", arbeitnow: "Arbeitnow", "eures-partner": "EURES" };

/** Aggregators whose redirect domain is known to sit behind an interactive bot check. */
const HUMAN_CHECK_PROVIDERS = new Set(["careerjet", "jooble"]);

function aggregatorKey(providerId: string): string | null {
  const key = Object.keys(AGGREGATOR_LABELS).find((id) => providerId === id || providerId.startsWith(`${id}-`));
  return key ?? null;
}

export function jobSourceKind(job: Pick<Job, "providerId">): JobSourceKind {
  if (job.providerId === IMPORT_PROVIDER_ID) return "user";
  return aggregatorKey(job.providerId) ? "aggregator" : "employer";
}

/** "Careerjet" for an aggregator posting, null when the link goes straight to the employer. */
export function aggregatorName(job: Pick<Job, "providerId">): string | null {
  const key = aggregatorKey(job.providerId);
  return key ? AGGREGATOR_LABELS[key] : null;
}

/** Whether the aggregator's redirect is known to demand a "verify you are human" step. */
export function linkMayAskHumanCheck(job: Pick<Job, "providerId">): boolean {
  const key = aggregatorKey(job.providerId);
  return key !== null && HUMAN_CHECK_PROVIDERS.has(key);
}

const PLACEHOLDER_COMPANY = /^(?:employer|employer not stated|company|confidential|azienda|n\/a)$/i;
/** Aggregators sometimes report the board they scraped (indeed.it, linkedin.com) instead of the employer. */
const BOARD_AS_COMPANY = /\.(?:it|com|net|org|eu|de|fr|es|co\.uk)$/i;

export function hasNamedEmployer(job: Pick<Job, "company">): boolean {
  const company = job.company.trim();
  return company.length > 1 && !PLACEHOLDER_COMPANY.test(company) && !BOARD_AS_COMPANY.test(company);
}

/**
 * A web search for the vacancy on the employer's own careers site. Only the employer
 * and title travel in the query, never anything about the candidate, and the engine
 * is one that does not profile the searcher.
 */
export function employerSearchUrl(job: Pick<Job, "company" | "title">): string | null {
  if (!hasNamedEmployer(job)) return null;
  const query = `${job.company.trim()} careers "${job.title.trim().replace(/"/g, "")}"`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
}
