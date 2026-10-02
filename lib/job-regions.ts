import type { Job, MatchResult } from "./domain";
import { DEFAULT_RADIUS_KM, resolvePlace, withinRadius, type GeoPoint } from "./geo.ts";
import { sortMatches, type SortOrder } from "./job-filters.ts";

// Country choices are independent of the jobs returned on the current page.
export const EUROPE_COUNTRIES = [
  ["AL", "Albania"], ["AD", "Andorra"], ["AT", "Austria"], ["BE", "Belgium"], ["BA", "Bosnia and Herzegovina"],
  ["BG", "Bulgaria"], ["HR", "Croatia"], ["CY", "Cyprus"], ["CZ", "Czechia"], ["DK", "Denmark"], ["EE", "Estonia"],
  ["FI", "Finland"], ["FR", "France"], ["DE", "Germany"], ["GR", "Greece"], ["HU", "Hungary"], ["IS", "Iceland"],
  ["IE", "Ireland"], ["IT", "Italy"], ["XK", "Kosovo"], ["LV", "Latvia"], ["LI", "Liechtenstein"], ["LT", "Lithuania"],
  ["LU", "Luxembourg"], ["MT", "Malta"], ["MD", "Moldova"], ["MC", "Monaco"], ["ME", "Montenegro"], ["NL", "Netherlands"],
  ["MK", "North Macedonia"], ["NO", "Norway"], ["PL", "Poland"], ["PT", "Portugal"], ["RO", "Romania"], ["SM", "San Marino"],
  ["RS", "Serbia"], ["SK", "Slovakia"], ["SI", "Slovenia"], ["ES", "Spain"], ["SE", "Sweden"], ["CH", "Switzerland"],
  ["UA", "Ukraine"], ["GB", "United Kingdom"], ["VA", "Vatican City"],
] as const;
export const EUROPE_CODES: string[] = EUROPE_COUNTRIES.map(([code]) => code);
const NORTH_ITALY = new Set(["Valle d'Aosta", "Piemonte", "Liguria", "Lombardia", "Trentino-Alto Adige", "Veneto", "Friuli-Venezia Giulia", "Emilia-Romagna"]);
export type SearchRegion = "nearby" | "north-italy" | "home-country" | "europe";
type Origin = GeoPoint & { name: string; country?: string };

export function isEuropeanJob(job: Pick<Job, "countryCode">): boolean {
  return job.countryCode === "EU" || EUROPE_CODES.includes(job.countryCode);
}

export function searchRegion(job: Job, origin: Origin | null): SearchRegion | null {
  if (!isEuropeanJob(job)) return null;
  if (origin && job.workplace !== "Remote" && job.countryCode === origin.country && withinRadius(job, origin, DEFAULT_RADIUS_KM, origin.country)) return "nearby";
  if (job.countryCode === "IT" && origin?.country === "IT") {
    const place = resolvePlace(`${job.city}, ${job.locationText}`);
    if (job.workplace !== "Remote" && place && NORTH_ITALY.has(place.region ?? place.name)) return "north-italy";
  }
  if (origin?.country && job.countryCode === origin.country) return "home-country";
  return "europe";
}

export function regionLabel(region: SearchRegion, origin?: Origin | null): string {
  return region === "nearby" ? `${origin?.name ?? "Your city"} area`
    : region === "north-italy" ? "Northern Italy"
    : region === "home-country" ? (EUROPE_COUNTRIES.find(([code]) => code === origin?.country)?.[1] ?? "Your country")
    : "Rest of Europe";
}

/** Geographic priority always leads; relevance/date/distance orders each area. */
export function sortRegionalMatches(matches: MatchResult[], origin: Origin | null, sort: SortOrder): MatchResult[] {
  const regions: SearchRegion[] = ["nearby", "north-italy", "home-country", "europe"];
  return regions.flatMap((region) => sortMatches(matches.filter((match) => searchRegion(match.job, origin) === region), sort));
}
