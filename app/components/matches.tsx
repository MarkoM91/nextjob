"use client";
import { useI18n } from "./language-provider";
import { matchExplanation, reviewNote } from "../../lib/localized-copy";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ArrowUpDown, Award, Bookmark, BriefcaseBusiness, CheckCircle2, ChevronDown, Clock3, Euro, FileText, Globe2, Home, LocateFixed, MapPin, Plus, Search, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { MatchResult } from "../../lib/domain";
import { aggregatorName } from "../../lib/job-source";
import { EUROPE_COUNTRIES, isEuropeanJob, regionLabel, sortRegionalMatches } from "../../lib/job-regions";
import { jobDistanceKm, locateJob, RADIUS_OPTIONS_KM, resolvePlace, withinRadius, type GeoPoint } from "../../lib/geo";
import { activeFilterCount, EMPLOYMENT_TYPES, EMPTY_FILTERS, facetCounts, filtersToParams, IMPORT_PROVIDER_ID, jobPassesFilters, matchesSearchWords, PAY_OPTIONS, POSTED_OPTIONS, SENIORITIES, sortMatches, WORKPLACES, type JobFacets, type JobFilters } from "../../lib/job-filters";
import { AppContent, ApplicationMethodBadge, bandClass, EmptyState, formatSalary, relativeDate, useTargetCountries, type MatchesApiResponse } from "./shared";

import { useSavedJobs } from "./saved-jobs";

type FeedResponse = MatchesApiResponse & { facets?: JobFacets | null; total?: number; nextCursor?: number | null };
type ChipOption = { value: string; label: string; count?: number };
type Located = GeoPoint & { name: string; country?: string };
type WhereAmI = { profile: Located | null; network: Located | null };
type Origin = Located & { source: "typed" | "network" | "cv" };
const TABS = ["Best matches", "New", "Added by you", "Saved", "Not interested"] as const;
type Tab = (typeof TABS)[number];

/** Indeed-style pill: reads as a label until a value is chosen, then shows the choice. */
function ChipSelect({ icon: Icon, label, value, display, options, onChange }: { icon: LucideIcon; label: string; value: string; display?: string; options: ChipOption[]; onChange: (value: string) => void }) {
  const { t } = useI18n();
  return <label className={`chip-select ${value ? "active" : ""}`}><Icon /><span>{t(value ? display ?? value : label)}</span><select aria-label={t(label)} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option.value} value={option.value}>{t(option.label)}{option.count !== undefined ? ` (${option.count})` : ""}</option>)}</select><ChevronDown /></label>;
}



export function MatchesScreen({ savedOnly = false, appliedJobId, applicationState, initialLocation = "" }: { savedOnly?: boolean; appliedJobId?: string; applicationState?: string; initialLocation?: string }) {
  const { t, locale } = useI18n();
  const euro = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const targetCountries = useTargetCountries();
  const [filters, setFilters] = useState<JobFilters>(() => ({ ...EMPTY_FILTERS, location: savedOnly ? "" : initialLocation }));
  const [geoMode, setGeoMode] = useState<"regional" | "nearby" | "anywhere">(savedOnly ? "anywhere" : "regional");
  const locationEdited = useRef(Boolean(initialLocation) && !savedOnly);
  const [countryCode, setCountryCode] = useState(savedOnly ? "ALL" : "EUROPE");
  const [tab, setTab] = useState<Tab>(savedOnly ? "Saved" : "Best matches");
  const savedState = useSavedJobs();
  const saved = savedState.ids;
  const [rejected, setRejected] = useState(new Set<string>());
  const [newJobCutoff] = useState(() => Date.now() - 7 * 86400000);
  const countryParam = countryCode.length === 2 ? countryCode : "";
  const update = (patch: Partial<JobFilters>) => setFilters((current) => ({ ...current, ...patch }));
  // Typed text reaches the providers after a pause; chip filters are sent immediately.
  const [typed, setTyped] = useState({ q: "", location: savedOnly ? "" : initialLocation });
  useEffect(() => {
    const timer = window.setTimeout(() => setTyped({ q: filters.q.trim(), location: filters.location.trim() }), 400);
    return () => window.clearTimeout(timer);
  }, [filters.q, filters.location]);
  // Use the candidate's CV city before the network location, which can be a VPN
  // or a temporary trip. Never overwrite a city the candidate has already typed.
  const [whereAmI, setWhereAmI] = useState<WhereAmI | null>(null);
  const regional = geoMode === "regional";
  const wantsOrigin = regional || filters.radiusKm > 0;
  useEffect(() => {
    let active = true;
    void fetch("/api/whereami", { cache: "no-store", headers: { accept: "application/json" } })
      .then((response) => response.ok ? response.json() : { profile: null, network: null })
      .then((payload: WhereAmI) => {
        if (!active) return;
        setWhereAmI(payload);
        if (!savedOnly && !locationEdited.current) {
          const place = payload.profile ?? payload.network;
          if (place) {
            setFilters((current) => ({ ...current, location: place.name }));
            setTyped((current) => ({ ...current, location: place.name }));
          } else setFilters((current) => ({ ...current, radiusKm: 0, sort: "relevance" }));
        }
      })
      .catch(() => { if (active) setWhereAmI({ profile: null, network: null }); });
    return () => { active = false; };
  }, [savedOnly]);
  const locating = wantsOrigin && whereAmI === null;
  const typedPlace = useMemo(() => (typed.location ? resolvePlace(typed.location) : null), [typed.location]);
  const origin = useMemo<Origin | null>(() => wantsOrigin
    ? typedPlace ? { ...typedPlace, source: "typed" } : typed.location ? null : whereAmI?.profile ? { ...whereAmI.profile, source: "cv" } : whereAmI?.network ? { ...whereAmI.network, source: "network" } : null
    : null, [wantsOrigin, typedPlace, whereAmI, typed.location]);
  // A typed city that became the radius origin must not also act as a text filter, or "Monza" jobs 15 km away would vanish.
  const effective = useMemo<JobFilters>(() => origin?.source === "typed" ? { ...filters, location: "" } : filters, [origin, filters]);
  const [reloadToken, setReloadToken] = useState(0);
  const serverParams = useMemo(() => {
    const params = filtersToParams({ ...effective, q: typed.q, location: effective.location ? typed.location : "" });
    params.set("scope", geoMode);
    if (origin) { params.set("near", `${origin.lat},${origin.lon}`); params.set("area", origin.name); }
    return params.toString();
  }, [effective, typed, origin, geoMode]);
  const requestKey = `${countryParam}|${serverParams}|${reloadToken}`;
  const [loaded, setLoaded] = useState<{ key: string; matches: MatchResult[]; mode: "live" | "unavailable" | "profile-required"; counts: Record<string, number>; facets: JobFacets | null; total: number; nextCursor: number | null } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState("");
  useEffect(() => {
    if (whereAmI === null || savedOnly) return;
    let active = true;
    const country = countryParam ? `&country=${encodeURIComponent(countryParam)}` : "";
    void fetch(`/api/matches?limit=30${country}${serverParams ? `&${serverParams}` : ""}`, { cache: "no-store", headers: { accept: "application/json" } })
      .then(async (response) => { if (!response.ok) throw new Error("Job feed unavailable"); return response.json() as Promise<FeedResponse>; })
      .then((payload) => { if (active) setLoaded({ key: requestKey, matches: payload.matches, mode: payload.sourceMode, counts: payload.sourceCounts ?? {}, facets: payload.facets ?? null, total: payload.total ?? payload.matches.length, nextCursor: payload.nextCursor ?? null }); })
      .catch(() => { if (active) setLoaded({ key: requestKey, matches: [], mode: "unavailable", counts: {}, facets: null, total: 0, nextCursor: null }); });
    return () => { active = false; };
  }, [requestKey, countryParam, serverParams, whereAmI, savedOnly]);
  // Loading is derived, and the previous rows stay on screen while a new query is in
  // flight, so the list never flashes empty between searches.
  const settled = loaded?.key === requestKey ? loaded : null;
  const feedMatches = useMemo(() => {
    const rows = [...new Map((loaded?.matches ?? []).map((match) => [match.job.id, match])).values()];
    return origin ? rows.map((match) => ({ ...match, distanceKm: jobDistanceKm(match.job, origin) })) : rows;
  }, [loaded, origin]);
  const sourceMode = settled ? settled.mode : "loading";
  const sourceCounts = settled?.counts ?? {};
  const facets = useMemo(() => settled?.facets ?? facetCounts(feedMatches.map((match) => match.job)), [settled, feedMatches]);
  const countryOptions = EUROPE_COUNTRIES.map(([code, name]) => ({ code, name: new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? name }));
  const isNewJob = (match: MatchResult) => new Date(match.job.publishedAt).getTime() >= newJobCutoff;
  const countryFits = (match: MatchResult) => countryCode === "ALL" ? true : countryCode === "EUROPE"
    ? isEuropeanJob(match.job)
    : countryCode === "MINE"
      ? match.job.workplace === "Remote" || match.job.countryCode === "EU" || targetCountries.includes(match.job.country) || match.job.providerId === IMPORT_PROVIDER_ID
      : match.job.countryCode === countryCode;
  const withinReach = (match: MatchResult) => !origin || !filters.radiusKm || withinRadius(match.job, origin, filters.radiusKm, countryParam || origin.country);
  // The same rules the server applies, so rows already loaded narrow instantly while the next page is in flight.
  const narrowed = feedMatches.filter((match) => matchesSearchWords(match.job, filters.q) && jobPassesFilters(match.job, effective) && withinReach(match) && countryFits(match));
  const order = filters.sort === "distance" && !origin ? "relevance" : filters.sort;
  const inScope = regional ? sortRegionalMatches(narrowed, origin, order) : sortMatches(narrowed, order);
  const visible = (match: MatchResult) => !rejected.has(match.job.id);
  const savedMatches = sortMatches(savedState.matches.map(match => origin ? { ...match, distanceKm: jobDistanceKm(match.job, origin) } : match).filter(match => matchesSearchWords(match.job, filters.q) && jobPassesFilters(match.job, effective) && withinReach(match) && countryFits(match)), order);
  const forTab = (name: Tab) => name === "Saved" ? savedMatches : inScope.filter((match) => {
    if (name === "Not interested") return rejected.has(match.job.id);
    if (name === "New") return isNewJob(match) && visible(match);
    if (name === "Added by you") return match.job.providerId === IMPORT_PROVIDER_ID && visible(match);
    return visible(match);
  });
  const filtered = forTab(tab);
  const appliedJob = appliedJobId ? feedMatches.find((match) => match.job.id === appliedJobId)?.job : undefined;
  const activeSources = Object.values(sourceCounts).filter((count) => count > 0).length;
  const activeFilters = activeFilterCount({ ...filters, location: regional ? "" : filters.location }) + Number(countryCode !== (savedOnly ? "ALL" : "EUROPE"));
  const clearAll = () => { locationEdited.current = true; const location = savedOnly ? "" : (whereAmI?.profile ?? whereAmI?.network)?.name ?? ""; setFilters({ ...EMPTY_FILTERS, location }); setTyped({ q: "", location }); setGeoMode(savedOnly ? "anywhere" : "regional"); setCountryCode(savedOnly ? "ALL" : "EUROPE"); };
  const chooseCountry = (value: string) => {
    locationEdited.current = true;
    setCountryCode(value);
    const location = value === "EUROPE" ? (whereAmI?.profile ?? whereAmI?.network)?.name ?? "" : "";
    setGeoMode(value === "EUROPE" ? "regional" : "anywhere");
    update({ location, radiusKm: 0, sort: "relevance" });
    setTyped((current) => ({ ...current, location }));
  };
  const loadMore = async () => {
    if (settled?.nextCursor == null || loadingMore) return;
    setLoadingMore(true); setPageError("");
    try {
      const response = await fetch(`/api/matches?limit=30&cursor=${settled.nextCursor}${countryParam ? `&country=${countryParam}` : ""}&${serverParams}`, { cache: "no-store", headers: { accept: "application/json" } });
      if (!response.ok) throw new Error("Could not load more jobs");
      const payload = await response.json() as FeedResponse;
      setLoaded((current) => current?.key === requestKey ? { ...current, matches: [...current.matches, ...payload.matches.filter((match) => !current.matches.some((previous) => previous.job.id === match.job.id))], nextCursor: payload.nextCursor ?? null, total: payload.total ?? current.total } : current);
    } catch { setPageError("More jobs could not be loaded. Try again."); }
    finally { setLoadingMore(false); }
  };
  const postedLabel = POSTED_OPTIONS.find((option) => option.days === filters.postedDays)?.label;
  const nearLabel = filters.radiusKm ? (origin ? t("Within {0} km of {1}", {0: filters.radiusKm, 1: origin.name}) : locating || !whereAmI ? t("Locating…") : t("Within {0} km", {0: filters.radiusKm})) : undefined;
  const cannotLocate = Boolean(filters.radiusKm) && Boolean(whereAmI) && !origin && !locating;
  const distanceLabel = (match: MatchResult) => match.distanceKm === undefined ? null : match.job.workplace === "Remote" ? t("Remote") : locateJob(match.job)?.kind === "region" ? t("Region location") : match.distanceKm === 0 ? t("City area") : t("About {0} km", {0: match.distanceKm});
  return <AppContent>
    {appliedJobId && <div className={`application-success ${applicationState === "verified" ? "verified" : "reported"}`} role="status"><CheckCircle2 /><div><strong>{applicationState === "verified" ? t("Application verified and submitted") : t("Application recorded")}</strong><p>{applicationState === "verified" ? t("{0} was accepted by the employer system.", {"0": appliedJob?.title ?? "Your application"}) : t("You marked {0} as applied. NextJOB has not received an employer confirmation.", {"0": appliedJob?.title ?? "this job"})}</p></div><Link href="/tracker">{t("View application ")}<ArrowRight /></Link></div>}
    <div className="matches-heading"><div><h1>{savedOnly ? t("Saved jobs") : t("Job matches")}</h1><p>{savedOnly ? t("Roles you marked for a closer look.") : t("Selected from your verified profile and preferences.")}</p></div><Link className="button button-small" href="/add-job"><Plus /> {t("Add a job")}</Link></div>
    <div className="search-row">
      <label className="search-input"><Search /><input aria-label={t("Search roles")} value={filters.q} onChange={(event) => update({ q: event.target.value })} placeholder={t("Job title, keywords or company")} /></label>
      <label className="search-input"><MapPin /><input aria-label={t("Location")} value={filters.location} onChange={(event) => { locationEdited.current = true; update({ location: event.target.value }); }} placeholder={t("City or area, e.g. Milano")} /></label>
    </div>
    <div className="filter-chips" aria-label={t("Filters")}>
      <ChipSelect icon={LocateFixed} label={t("Search area")} value={regional ? "regional" : filters.radiusKm ? String(filters.radiusKm) : ""} display={regional ? "Local first, then Europe" : nearLabel} options={[{ value: "regional", label: "Local first, then Europe" }, { value: "", label: "Across Europe" }, ...RADIUS_OPTIONS_KM.map((km) => ({ value: String(km), label: t("Within {0} km", {0: km}) }))]} onChange={(value) => { locationEdited.current = true; setCountryCode("EUROPE"); setGeoMode(value === "regional" ? "regional" : value ? "nearby" : "anywhere"); const location = value ? filters.location || (whereAmI?.profile ?? whereAmI?.network)?.name || "" : ""; setTyped((current) => ({ ...current, location })); update({ location, radiusKm: value && value !== "regional" ? Number(value) : 0, sort: value && value !== "regional" ? "distance" : "relevance" }); }} />
      <ChipSelect icon={Home} label={t("Work style")} value={filters.workplace ?? ""} options={[{ value: "", label: "All work styles" }, ...WORKPLACES.map((workplace) => ({ value: workplace, label: workplace, count: facets.workplace[workplace] ?? 0 }))]} onChange={(value) => update({ workplace: (value || null) as JobFilters["workplace"] })} />
      <ChipSelect icon={Globe2} label={t("Country")} value={countryCode} display={countryCode === "ALL" ? "All countries" : countryCode === "EUROPE" ? "Europe" : countryCode === "MINE" ? "My target countries" : countryOptions.find((country) => country.code === countryCode)?.name ?? countryCode} options={[...(tab === "Saved" ? [{ value: "ALL", label: "All countries" }] : []), { value: "EUROPE", label: "Europe — local jobs first" }, { value: "MINE", label: t("My target countries ({0})", {0: targetCountries.join(", ")}) }, ...countryOptions.map((country) => ({ value: country.code, label: country.name }))]} onChange={chooseCountry} />
      <ChipSelect icon={ArrowUpDown} label={t("Sort: relevance")} value={filters.sort === "relevance" ? "" : filters.sort} display={filters.sort === "date" ? "Sort: newest" : "Sort: nearest"} options={[{ value: "", label: "Relevance" }, { value: "date", label: "Newest first" }, ...(origin ? [{ value: "distance", label: "Nearest first" }] : [])]} onChange={(value) => update({ sort: value === "date" || value === "distance" ? value : "relevance" })} />
      {activeFilters > 0 && <button type="button" className="filter-reset" onClick={clearAll}><X /> {t("Clear all (")}{activeFilters})</button>}
    </div>
    <details className="more-job-filters"><summary>{t("More filters")}{(Number(Boolean(filters.postedDays)) + Number(Boolean(filters.employmentType)) + Number(Boolean(filters.seniority)) + Number(Boolean(filters.minSalary)) + Number(filters.salaryOnly)) > 0 ? ` (${Number(Boolean(filters.postedDays)) + Number(Boolean(filters.employmentType)) + Number(Boolean(filters.seniority)) + Number(Boolean(filters.minSalary)) + Number(filters.salaryOnly)})` : ""}</summary><div className="filter-chips">
      <ChipSelect icon={Clock3} label={t("Date posted")} value={filters.postedDays ? String(filters.postedDays) : ""} display={postedLabel} options={[{ value: "", label: "Any time" }, ...POSTED_OPTIONS.map((option) => ({ value: String(option.days), label: option.label, count: facets.posted[String(option.days)] ?? 0 }))]} onChange={(value) => update({ postedDays: value ? Number(value) : null })} />
      <ChipSelect icon={BriefcaseBusiness} label={t("Job type")} value={filters.employmentType ?? ""} options={[{ value: "", label: "All job types" }, ...EMPLOYMENT_TYPES.map((type) => ({ value: type, label: type, count: facets.employmentType[type] ?? 0 }))]} onChange={(value) => update({ employmentType: (value || null) as JobFilters["employmentType"] })} />
      <ChipSelect icon={Award} label={t("Experience level")} value={filters.seniority ?? ""} options={[{ value: "", label: "Any level" }, ...SENIORITIES.map((level) => ({ value: level, label: level, count: facets.seniority[level] ?? 0 }))]} onChange={(value) => update({ seniority: (value || null) as JobFilters["seniority"] })} />
      <ChipSelect icon={Euro} label={t("Pay")} value={filters.minSalary ? String(filters.minSalary) : ""} display={filters.minSalary ? t("{0}+ per year", {0: euro.format(filters.minSalary)}) : undefined} options={[{ value: "", label: "Any pay" }, ...PAY_OPTIONS.map((amount) => ({ value: String(amount), label: t("{0}+ per year", {0: euro.format(amount)}) }))]} onChange={(value) => update({ minSalary: value ? Number(value) : 0 })} />
      <button type="button" className={`chip-toggle ${filters.salaryOnly ? "active" : ""}`} aria-pressed={filters.salaryOnly} onClick={() => update({ salaryOnly: !filters.salaryOnly })}><CheckCircle2 /> {t("Stated pay only")}{facets.total ? ` (${facets.withSalary})` : ""}</button>
    </div></details>
    {regional && <p className="regional-order"><strong>{t("Search order")}</strong><span>{t("{0} area", {0: origin?.name ?? t("Your city")})}</span><ArrowRight />{origin?.country === "IT" && <><span>{t("Northern Italy")}</span><ArrowRight /></>}<span>{countryOptions.find((country) => country.code === origin?.country)?.name ?? t("Your country")}</span><ArrowRight /><span>{t("Rest of Europe")}</span></p>}{cannotLocate && <p className="form-error" role="alert">{t("NextJOB could not work out where you are. Type a city in the location box, or add your town to your CV.")}</p>}
    {!savedOnly && <div className={`source-status ${sourceMode}`} role="status"><span><i />{sourceMode === "loading" ? t("Refreshing live jobs…") : sourceMode === "live" ? t("Live jobs: {0} · Active sources: {1}", {0: settled?.total ?? inScope.length, 1: activeSources}) + (origin && filters.radiusKm ? " · " + t("Within {0} km of {1}", {0: filters.radiusKm, 1: origin.name}) : "") : sourceMode === "profile-required" ? t("Your verified CV is required") : t("Live jobs are temporarily unavailable")}</span>{sourceMode === "live" && <small>{t("Employer boards, licensed aggregators and jobs you added · posted in the last 30 days")}</small>}{sourceMode === "profile-required" && <small>{t("NextJOB will not create matches from a sample profile.")}</small>}{sourceMode === "unavailable" && <small>{t("NextJOB will not replace unavailable sources with invented jobs.")}</small>}</div>}
    {!savedOnly && <div className="feed-tabs">{TABS.map((name) => <button key={name} className={tab === name ? "active" : ""} onClick={() => setTab(name)}>{t(name)} <span>{forTab(name).length}</span></button>)}</div>}
    {!filtered.length ? <EmptyState icon={sourceMode === "profile-required" ? FileText : tab === "Added by you" ? Plus : Bookmark} title={tab === "Saved" ? (savedState.loading ? t("Loading saved jobs…") : t("No saved jobs here")) : sourceMode === "loading" ? t("Finding live jobs…") : sourceMode === "profile-required" ? t("Start with your verified CV") : tab === "Added by you" ? t("No jobs added yet") : t("No live matches found")} text={tab === "Saved" ? (savedState.loading ? t("Retrieving your saved roles.") : t("Save a job to keep it here, or clear a filter to see all your saved jobs.")) : sourceMode === "loading" ? (origin ? t("Checking current employer listings around {0}.", {"0": origin.name}) : t("Checking current employer listings against your verified profile."))  : tab === "Added by you" ? t("Paste a link or the text of a job you found anywhere, and NextJOB will match it and prepare the application.") : sourceMode === "profile-required" ? t("Upload your CV and confirm the extracted facts before NextJOB matches any job to you.") : sourceMode === "unavailable" ? t("The connected employer feeds could not be reached. Nothing was invented to fill the gap.") : activeFilters ? t("No live jobs match these filters. Try fewer words, a wider radius or date range, or clear a filter.") : t("Try a broader country or work-style filter.")} action={sourceMode === "profile-required" ? t("Upload my CV") : tab === "Added by you" ? t("Add a job") : activeFilters ? t("Clear all filters") : t("Try again")} href={sourceMode === "profile-required" ? "/upload" : tab === "Added by you" ? "/add-job" : undefined} onAction={sourceMode === "profile-required" || tab === "Added by you" ? undefined : activeFilters ? clearAll : () => setReloadToken((token) => token + 1)} /> : <section className="match-list" aria-label={t("Matching jobs")}>{filtered.map((match, index) => <Fragment key={match.job.id}>{regional && match.searchRegion && (index === 0 || filtered[index - 1].searchRegion !== match.searchRegion) && <h2 className="match-area-heading">{match.searchRegion === "nearby" ? t("{0} area", {0: origin?.name ?? t("Your city")}) : match.searchRegion === "home-country" ? countryOptions.find(country => country.code === origin?.country)?.name ?? t("Your country") : t(regionLabel(match.searchRegion, origin))}</h2>}<article key={match.job.id} className="match-list-item"><div className="match-list-copy"><h2>{match.job.title}</h2><small>{match.job.company} · {match.job.locationText}{distanceLabel(match) ? <> · <span className="match-distance">{distanceLabel(match)}</span></> : null} · {t(match.job.workplace)} · {t(match.job.employmentType)} · {relativeDate(match.job.publishedAt, locale)}{aggregatorName(match.job) ? <> · <span className="match-via">{t("via ")}{aggregatorName(match.job)}</span></> : null}</small><strong className="match-salary">{formatSalary(match.job, locale)}</strong><p>{matchExplanation(match, locale)}</p>{match.reviewNotes?.length ? <details className="match-review-notes"><summary>{t("Check before applying (")}{match.reviewNotes.length})</summary><ul>{match.reviewNotes.map((note) => <li key={note}>{reviewNote(note, locale)}</li>)}</ul></details> : null}<span className="match-proof"><CheckCircle2 /> {match.job.providerId === IMPORT_PROVIDER_ID ? t("Added by you") : match.matchedSkills.length ? match.matchedSkills.slice(0, 3).join(", ") : t("Profile and preference filters passed")}</span></div><div className="match-list-next"><div className="match-list-labels"><em className={`match-state ${bandClass(match.band)}`}>{match.evidenceCoverage === "limited" ? t("Preliminary fit") : t(match.band)}</em><ApplicationMethodBadge job={match.job} /></div><Link className="button button-small" href={`/job?job=${match.job.id}`}>{t("View job ")}<ArrowRight /></Link><div><button className={saved.has(match.job.id) ? "saved" : ""} disabled={savedState.busy || savedState.loading} onClick={() => void savedState.toggle(match, !saved.has(match.job.id))}>{saved.has(match.job.id) ? t("Saved") : t("Save")}</button><button onClick={() => setRejected((current) => new Set(current).add(match.job.id))}>{t("Not interested")}</button></div></div></article></Fragment>)}</section>}{tab !== "Saved" && settled?.nextCursor != null && <div className="matches-pagination"><button type="button" className="button button-small" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? t("Loading more jobs…") : t("Load more jobs")}</button><small>{t("Showing ")}{feedMatches.length} {t("of ")}{settled.total} {t("matches")}</small></div>}{savedState.error && <p className="form-error" role="alert">{t(savedState.error)} <button onClick={() => void savedState.reload()}>{t("Retry")}</button></p>}{pageError && <p className="form-error" role="alert">{t(pageError)}</p>}
  </AppContent>;
}
