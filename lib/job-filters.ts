import type { EmploymentType, Job, MatchResult, Workplace } from "./domain";
import { normalizeText } from "./engine.ts";
import { IMPORT_PROVIDER_ID } from "./job-source.ts";

export { IMPORT_PROVIDER_ID };

/**
 * Feed filters shared by the matches API and the Jobs screen, so the rows already on
 * screen are narrowed with exactly the rule the server applies to the next page.
 */

export type SortOrder = "relevance" | "date" | "distance";

export type JobFilters = {
  q: string;
  location: string;
  /** "Near me" radius in km; 0 is off. The origin point travels separately because it needs the candidate's place. */
  radiusKm: number;
  postedDays: number | null;
  workplace: Workplace | null;
  employmentType: EmploymentType | null;
  seniority: Job["seniority"] | null;
  /** Annual EUR floor; a posting that states no pay is never hidden by it. */
  minSalary: number;
  salaryOnly: boolean;
  sort: SortOrder;
};

export type JobFacets = {
  workplace: Record<string, number>;
  employmentType: Record<string, number>;
  seniority: Record<string, number>;
  posted: Record<string, number>;
  withSalary: number;
  total: number;
};

export const EMPTY_FILTERS: JobFilters = { q: "", location: "", radiusKm: 0, postedDays: null, workplace: null, employmentType: null, seniority: null, minSalary: 0, salaryOnly: false, sort: "relevance" };
export const POSTED_OPTIONS = [{ days: 1, label: "Last 24 hours" }, { days: 3, label: "Last 3 days" }, { days: 7, label: "Last 7 days" }, { days: 14, label: "Last 14 days" }] as const;
export const PAY_OPTIONS = [20_000, 30_000, 40_000, 50_000, 70_000, 100_000] as const;
export const WORKPLACES: Workplace[] = ["Remote", "Hybrid", "On-site"];
export const EMPLOYMENT_TYPES: EmploymentType[] = ["Full-time", "Part-time", "Contract", "Internship"];
export const SENIORITIES: Job["seniority"][] = ["Entry", "Mid", "Senior", "Lead"];

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return value !== null && allowed.includes(value as T) ? (value as T) : null;
}

export function filtersFromParams(params: URLSearchParams): JobFilters {
  const posted = Number(params.get("posted"));
  const minSalary = Number(params.get("minSalary"));
  const radius = Number(params.get("radius"));
  const sort = params.get("sort");
  return {
    q: (params.get("q") ?? "").trim().slice(0, 80),
    location: (params.get("location") ?? "").trim().slice(0, 80),
    radiusKm: Number.isFinite(radius) && radius > 0 ? Math.min(Math.round(radius), 500) : 0,
    postedDays: Number.isInteger(posted) && posted > 0 && posted <= 30 ? posted : null,
    workplace: oneOf(params.get("workplace"), WORKPLACES),
    employmentType: oneOf(params.get("type"), EMPLOYMENT_TYPES),
    seniority: oneOf(params.get("level"), SENIORITIES),
    minSalary: Number.isFinite(minSalary) && minSalary > 0 ? Math.min(Math.round(minSalary), 1_000_000) : 0,
    salaryOnly: params.get("salaryOnly") === "true",
    sort: sort === "date" || sort === "distance" ? sort : "relevance",
  };
}

export function filtersToParams(filters: JobFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.location.trim()) params.set("location", filters.location.trim());
  if (filters.radiusKm > 0) params.set("radius", String(filters.radiusKm));
  if (filters.postedDays) params.set("posted", String(filters.postedDays));
  if (filters.workplace) params.set("workplace", filters.workplace);
  if (filters.employmentType) params.set("type", filters.employmentType);
  if (filters.seniority) params.set("level", filters.seniority);
  if (filters.minSalary > 0) params.set("minSalary", String(filters.minSalary));
  if (filters.salaryOnly) params.set("salaryOnly", "true");
  if (filters.sort !== "relevance") params.set("sort", filters.sort);
  return params;
}

/** Every word must appear somewhere in the posting, in any order. */
export function matchesSearchWords(job: Pick<Job, "title" | "company" | "requiredSkills" | "description">, search: string): boolean {
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = `${job.title} ${job.company} ${job.requiredSkills.join(" ")} ${job.description}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
}

/** "Milano" finds "Provincia di Milano" and "Milan, Lombardia"; accents and case are ignored. */
export function matchesLocation(job: Pick<Job, "city" | "locationText" | "country">, location: string): boolean {
  const wanted = normalizeText(location).split(" ").filter(Boolean);
  if (!wanted.length) return true;
  const placeWords = normalizeText([job.city, job.locationText, job.country].join(" ")).split(" ").filter(Boolean);
  return wanted.every((word) => placeWords.some((placeWord) => placeWord.startsWith(word) || (word.length >= 4 && placeWord.length >= 4 && word.startsWith(placeWord))));
}

function publishedTime(job: Pick<Job, "publishedAt">): number {
  const time = new Date(job.publishedAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

/** An undated posting cannot claim recency, so it is left out of "posted in the last N days". */
export function postedWithin(job: Pick<Job, "publishedAt">, days: number, now = Date.now()): boolean {
  const published = publishedTime(job);
  return published > 0 && published >= now - days * 86400000;
}

export function jobPassesFilters(job: Job, filters: JobFilters, now = Date.now()): boolean {
  if (filters.location && !matchesLocation(job, filters.location)) return false;
  if (filters.postedDays && !postedWithin(job, filters.postedDays, now)) return false;
  if (filters.workplace && job.workplace !== filters.workplace) return false;
  if (filters.employmentType && job.employmentType !== filters.employmentType) return false;
  if (filters.seniority && job.seniority !== filters.seniority) return false;
  if (filters.salaryOnly && !job.salary) return false;
  if (filters.minSalary > 0 && job.salary && job.salary.normalizedAnnualMax < filters.minSalary) return false;
  return true;
}

/**
 * Orders the feed. Jobs the candidate added lead every order: they chose them, and pinning
 * keeps them on the first page instead of buried under higher-scoring live listings.
 */
export function sortMatches(matches: MatchResult[], sort: SortOrder): MatchResult[] {
  const byOrder = (a: MatchResult, b: MatchResult) => sort === "date"
    ? publishedTime(b.job) - publishedTime(a.job) || b.score - a.score
    // Unlocated postings sink to the end rather than pretending to be close.
    : sort === "distance"
      ? Number(a.job.workplace === "Remote") - Number(b.job.workplace === "Remote") || (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || b.score - a.score
      : b.score - a.score || publishedTime(b.job) - publishedTime(a.job);
  const pinned = (match: MatchResult) => Number(match.job.providerId === IMPORT_PROVIDER_ID);
  return [...matches].sort((a, b) => pinned(b) - pinned(a) || byOrder(a, b));
}

function tally(record: Record<string, number>, key: string): void { record[key] = (record[key] ?? 0) + 1; }

/** Counts per filter value over the relevant feed, so a chip can say how many jobs it keeps. */
export function facetCounts(jobs: Job[], now = Date.now()): JobFacets {
  const facets: JobFacets = { workplace: {}, employmentType: {}, seniority: {}, posted: {}, withSalary: 0, total: jobs.length };
  for (const job of jobs) {
    tally(facets.workplace, job.workplace);
    tally(facets.employmentType, job.employmentType);
    tally(facets.seniority, job.seniority);
    for (const option of POSTED_OPTIONS) if (postedWithin(job, option.days, now)) tally(facets.posted, String(option.days));
    if (job.salary) facets.withSalary += 1;
  }
  return facets;
}

export function activeFilterCount(filters: JobFilters): number {
  return Number(Boolean(filters.q.trim())) + Number(Boolean(filters.location.trim())) + Number(filters.radiusKm > 0) + Number(Boolean(filters.postedDays)) + Number(Boolean(filters.workplace))
    + Number(Boolean(filters.employmentType)) + Number(Boolean(filters.seniority)) + Number(filters.minSalary > 0) + Number(filters.salaryOnly);
}
