import { env } from "cloudflare:workers";
import { z } from "zod";
import { getCurrentUser } from "../../auth";
import { isRelevantRoleTitle, searchKeywords } from "../../../lib/relevance";
import { DEFAULT_MAX_JOB_AGE_DAYS, isRecentPosting, rankJobs } from "../../../lib/engine";
import { DEFAULT_RADIUS_KM, jobDistanceKm, parseGeoPoint, resolvePlace, withinRadius } from "../../../lib/geo";
import { facetCounts, filtersFromParams, jobPassesFilters, matchesSearchWords, sortMatches } from "../../../lib/job-filters";
import { IMPORT_PROVIDER_ID, listImportedJobs } from "../../../lib/job-import";
import { searchAllProviders } from "../../../lib/providers";
import { databaseFromEnvironment, persistLiveJobs } from "../../../lib/job-store";
import { EUROPE_CODES, isEuropeanJob, searchRegion, sortRegionalMatches } from "../../../lib/job-regions";
import { readStoredResume, safeOwnerId } from "../../../lib/resume-storage";
import { clientKey, rateLimit } from "../../../lib/security";

const querySchema = z.object({
  includeIneligible: z.enum(["true", "false"]).optional(),
  country: z.string().length(2).optional(),
  q: z.string().trim().max(80).optional(),
  location: z.string().trim().max(80).optional(),
  area: z.string().trim().max(80).optional(),
  scope: z.enum(["regional", "nearby", "anywhere"]).optional(),
  near: z.string().trim().max(40).optional(),
  radius: z.coerce.number().int().min(1).max(500).optional(),
  posted: z.coerce.number().int().min(1).max(30).optional(),
  workplace: z.enum(["Remote", "Hybrid", "On-site"]).optional(),
  type: z.enum(["Full-time", "Part-time", "Contract", "Internship"]).optional(),
  level: z.enum(["Entry", "Mid", "Senior", "Lead"]).optional(),
  minSalary: z.coerce.number().int().min(0).max(1_000_000).optional(),
  salaryOnly: z.enum(["true", "false"]).optional(),
  sort: z.enum(["relevance", "date", "distance"]).optional(),
  cursor: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(30).default(12),
});

export async function GET(request: Request) {
  const limit = rateLimit(`matches:${clientKey(request)}`, 60);
  if (!limit.allowed) return Response.json({ error: "Too many requests" }, { status: 429 });
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return Response.json({ error: "Invalid filters", details: parsed.error.flatten() }, { status: 400 });
  let filters = filtersFromParams(url.searchParams);
  const explicitNear = parseGeoPoint(parsed.data.near);
  if (parsed.data.near && !explicitNear) return Response.json({ error: "Invalid search coordinates" }, { status: 400 });
  const user = await getCurrentUser();
  const ownerId = safeOwnerId(user?.id);
  const storage = (env as unknown as { DOCUMENTS?: R2Bucket }).DOCUMENTS;
  const storedResume = await readStoredResume(storage, ownerId).catch(() => null);
  if (!storedResume?.verifiedAt) {
    return Response.json({ matches: [], nextCursor: null, facets: null, filters, estimateLabel: "NextJOB match estimate", sourceMode: "profile-required", fictional: false, profileRequired: true, profileSource: "missing", refreshedAt: new Date().toISOString(), providerFailures: [], sourceCounts: {} }, { headers: { "cache-control": "private, no-store" } });
  }
  const profile = storedResume.profile;
  if (!parsed.data.workplace && profile.preferences.workplace.length === 1) filters = { ...filters, workplace: profile.preferences.workplace[0] };
  if (!parsed.data.minSalary) filters = { ...filters, minSalary: profile.preferences.minimumAnnualSalaryEur };
  // Start from the verified CV city unless the candidate deliberately widens the
  // search or supplies another city. Never substitute a sample location.
  const areaText = parsed.data.area || filters.location;
  const place = resolvePlace(areaText || profile.location);
  const regional = !parsed.data.country && (parsed.data.scope === "regional" || (!parsed.data.scope && !parsed.data.near && !areaText));
  const nearby = !parsed.data.country && !regional && parsed.data.scope !== "anywhere";
  const near = regional || nearby ? explicitNear ?? place : null;
  const radiusKm = nearby && near ? filters.radiusKm || DEFAULT_RADIUS_KM : 0;
  filters = { ...filters, radiusKm, location: parsed.data.country ? filters.location : (near && place) ? "" : areaText, sort: parsed.data.sort ?? (nearby && near ? "distance" : "relevance") };
  const providerLocation = nearby ? areaText || place?.name : filters.location || undefined;
  const country = parsed.data.country || (nearby ? place?.country : undefined);
  const search = filters.q;
  // An explicit search is sent to the providers too, so results are not limited to
  // what the profile keywords already pulled back.
  const keywords = search ? [search, ...searchKeywords(profile)].slice(0, 30) : searchKeywords(profile);
  const queries = regional && place
    ? [{ keywords, countries: [place.country], location: place.name, radiusKm: DEFAULT_RADIUS_KM }, { keywords, countries: EUROPE_CODES, regional: true }]
    : [{ keywords, countries: country ? [country] : EUROPE_CODES, location: providerLocation, radiusKm: radiusKm || undefined, regional: !country }];
  const [feeds, imported] = await Promise.all([
    Promise.all(queries.map((query) => searchAllProviders(query))),
    listImportedJobs(storage, ownerId).catch(() => []),
  ]);
  const live = { jobs: feeds.flatMap((feed) => feed.jobs), failures: feeds.flatMap((feed) => feed.failures), sourceCounts: {} as Record<string, number> };
  for (const feed of feeds) for (const [id, count] of Object.entries(feed.sourceCounts)) live.sourceCounts[id] = Math.max(live.sourceCounts[id] ?? 0, count);
  // Aggregators keep serving long-closed vacancies, so anything past the freshness
  // window is withheld instead of being shown as an opportunity.
  const maxAgeDays = Number(process.env.MAX_JOB_AGE_DAYS ?? DEFAULT_MAX_JOB_AGE_DAYS) || DEFAULT_MAX_JOB_AGE_DAYS;
  const liveJobs = live.jobs.filter((job) => job.active && isRecentPosting(job, maxAgeDays));
  await persistLiveJobs(databaseFromEnvironment(env), liveJobs).catch(() => undefined);
  // A chosen search area overrides stored geographic preferences for this query,
  // while work authorization, language and other eligibility checks still apply.
  const searchProfile = regional || parsed.data.country ? { ...profile, preferences: { ...profile.preferences, countries: [] } } : profile;
  const geographicJobs = [...liveJobs, ...imported].filter((job) => parsed.data.country ? job.countryCode === parsed.data.country : isEuropeanJob(job));
  const relevant = rankJobs(searchProfile, geographicJobs, parsed.data.includeIneligible === "true")
    .filter((match) => (parsed.data.workplace || profile.preferences.workplace.includes(match.job.workplace)) && (!profile.preferences.visaSponsorshipRequired || match.job.visaSponsorship !== false))
    // A job the candidate added is always theirs to see; for the rest an explicit search outranks the occupation heuristic.
    .filter((match) => match.job.providerId === IMPORT_PROVIDER_ID || (match.score >= 45 && (search ? matchesSearchWords(match.job, search) && (isRelevantRoleTitle(match.job.title, profile) || matchesSearchWords({ ...match.job, description: "", requiredSkills: [] }, search)) : isRelevantRoleTitle(match.job.title, profile))))
    .map((match) => near ? { ...match, distanceKm: jobDistanceKm(match.job, near) } : match);
  // Facets describe the relevant feed before the narrowing chips, so every chip shows what it would keep.
  const facets = facetCounts(relevant.map((match) => match.job));
  const withinReach = (match: (typeof relevant)[number]) => !near || !filters.radiusKm || withinRadius(match.job, near, filters.radiusKm, country);
  const sort = filters.sort === "distance" && !near ? "relevance" : filters.sort;
  const narrowed = relevant.filter((match) => jobPassesFilters(match.job, filters) && withinReach(match));
  const matches = regional ? sortRegionalMatches(narrowed, place, sort).map((match) => ({ ...match, searchRegion: searchRegion(match.job, place) ?? undefined })) : sortMatches(narrowed, sort);
  const sourceMode = liveJobs.length || imported.length ? "live" : "unavailable";
  const page = matches.slice(parsed.data.cursor, parsed.data.cursor + parsed.data.limit);
  const nextCursor = parsed.data.cursor + page.length < matches.length ? parsed.data.cursor + page.length : null;
  const sourceCounts = imported.length ? { ...live.sourceCounts, [IMPORT_PROVIDER_ID]: imported.length } : live.sourceCounts;
  return Response.json({ matches: page, nextCursor, total: matches.length, facets, filters, near, estimateLabel: "NextJOB match estimate", sourceMode, fictional: false, profileRequired: false, refreshedAt: new Date().toISOString(), providerFailures: live.failures, sourceCounts, profileSource: "verified-cv" }, { headers: { "cache-control": "private, no-store" } });
}
