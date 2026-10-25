import { randomToken, sha256Base64Url } from "./auth-session.ts";
import { isRecentPosting, rankJobs } from "./engine.ts";
import { resolvePlace } from "./geo.ts";
import { isEuropeanJob, EUROPE_CODES, EUROPE_COUNTRIES, sortRegionalMatches } from "./job-regions.ts";
import { persistLiveJobs, cacheResolvedJob } from "./job-store.ts";
import { isRelevantRoleTitle, searchKeywords } from "./relevance.ts";
import { readStoredResume } from "./resume-storage.ts";
import { searchAllProviders } from "./providers.ts";
import { AlertError, configFor, deliverAlerts, getAlertSettings, queueDigest, type AlertSettings } from "./alerts.ts";
import type { CandidateProfile, Job } from "./domain.ts";

type CheckDependencies = { profile: typeof readStoredResume; search: typeof searchAllProviders; persist: typeof persistLiveJobs; cache: typeof cacheResolvedJob };
const dependencies: CheckDependencies = { profile: readStoredResume, search: searchAllProviders, persist: persistLiveJobs, cache: cacheResolvedJob };
export function alertMatches(profile: CandidateProfile, jobs: Job[], minimumScore: number) {
  const place = resolvePlace(profile.location);
  const countries = alertCountryCodes(profile);
  const ranked = rankJobs(profile, jobs.filter(job => !job.fictional && job.active && isRecentPosting(job, 30) && (profile.preferences.countries.length ? countries.includes(job.countryCode) : isEuropeanJob(job))))
    .filter(match => match.eligible && match.score >= minimumScore && isRelevantRoleTitle(match.job.title, profile) && profile.preferences.workplace.includes(match.job.workplace));
  return sortRegionalMatches(ranked, place, "relevance");
}
export function alertCountryCodes(profile: CandidateProfile): string[] {
  return profile.preferences.countries.flatMap(country => {
    if (country === "Europe" || country === "European Union") return EUROPE_CODES;
    const match = EUROPE_COUNTRIES.find(([code, name]) => country === code || country.toLowerCase() === name.toLowerCase());
    return match ? [match[0]] : /^[A-Z]{2}$/.test(country) ? [country] : [];
  });
}
export async function checkOwnerAlerts(db: D1Database, storage: R2Bucket | undefined, owner: string, now = Date.now(), deps: CheckDependencies = dependencies) {
  const lease = randomToken();
  const claim = await db.prepare("UPDATE alert_settings SET check_lease = ?, lease_until = ?, next_check = ? WHERE owner_id = ? AND next_check <= ? AND (lease_until IS NULL OR lease_until < ?) AND (in_app = 1 OR email_enabled = 1)").bind(lease, now + 300000, now + 3600000, owner, now, now).run();
  if (!claim.meta?.changes) return { checked: false, added: 0 };
  try {
    const row = (await getAlertSettings(db, owner))!;
    const stored = await deps.profile(storage, owner);
    if (!stored?.verifiedAt) throw new AlertError("PROFILE_REQUIRED", 409);
    const profile = stored.profile;
    const config = configFor(row);
    const place = resolvePlace(profile.location);
    const countries = profile.preferences.countries.length ? alertCountryCodes(profile) : EUROPE_CODES;
    const keywords = searchKeywords(profile);
    const feeds = await Promise.all([
      ...(place && countries.includes(place.country) ? [deps.search({ keywords, countries: [place.country], location: place.name, radiusKm: 50 })] : []),
      deps.search({ keywords, countries, regional: countries.length > 1 }),
    ]);
    const live = { jobs: feeds.flatMap(feed => feed.jobs), failures: feeds.flatMap(feed => feed.failures) };
    if (!live.jobs.length && live.failures.length) throw new AlertError("JOB_SOURCES_UNAVAILABLE", 503);
    const matches = alertMatches(profile, live.jobs, config.minimumScore);
    const revision = await sha256Base64Url(JSON.stringify({ role: profile.currentRole, location: profile.location, preferences: profile.preferences, skills: profile.skills, minimumScore: config.minimumScore }));
    const baseline = row.baseline_revision !== revision;
    const jobs = [...new Map(matches.map(match => [match.job.id, match.job])).values()].slice(0, 80);
    await deps.persist(db, jobs);
    const statements: D1PreparedStatement[] = [];
    for (const job of jobs) {
      // The inbox also supplies the email digest, even when the in-app badge is off.
      if (!baseline) statements.push(db.prepare("INSERT OR IGNORE INTO alert_inbox (id, owner_id, job_id, title, company, location, created_at) SELECT ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM alert_seen WHERE owner_id = ? AND job_id = ?) AND EXISTS (SELECT 1 FROM alert_settings WHERE owner_id = ? AND check_lease = ? AND (in_app = 1 OR email_enabled = 1))").bind(randomToken(), owner, job.id, job.title, job.company, job.locationText, now, owner, job.id, owner, lease));
      statements.push(db.prepare("INSERT OR IGNORE INTO alert_seen (owner_id, job_id, seen_at) VALUES (?, ?, ?)").bind(owner, job.id, now));
    }
    statements.push(db.prepare("UPDATE alert_settings SET baseline_revision = ?, last_checked = ?, last_error = NULL WHERE owner_id = ? AND check_lease = ?").bind(revision, now, owner, lease));
    const results = await db.batch(statements);
    const added = baseline ? 0 : results.filter((_, index) => index < jobs.length * 2 && index % 2 === 0).reduce((total, result) => total + Number(result.meta?.changes ?? 0), 0);
    await Promise.all(jobs.map(job => deps.cache(storage, job)));
    const current = await getAlertSettings(db, owner);
    if (current) await queueDigest(db, current, now);
    return { checked: true, added, baseline };
  } catch (error) {
    const code = error instanceof AlertError ? error.code : "JOB_CHECK_FAILED";
    await db.prepare("UPDATE alert_settings SET last_error = ? WHERE owner_id = ? AND check_lease = ?").bind(code, owner, lease).run();
    return { checked: true, added: 0, error: code };
  } finally {
    await db.prepare("UPDATE alert_settings SET lease_until = NULL, check_lease = NULL WHERE owner_id = ? AND check_lease = ?").bind(owner, lease).run();
  }
}
export async function runAlertChecks(db: D1Database, storage: R2Bucket | undefined, now = Date.now()) {
  const lease = randomToken();
  const claimed = await db.prepare("INSERT INTO alert_runtime (id, lease_until, lease_token, last_run) VALUES ('job-alerts', ?, ?, ?) ON CONFLICT(id) DO UPDATE SET lease_until = excluded.lease_until, lease_token = excluded.lease_token, last_run = excluded.last_run WHERE alert_runtime.lease_until < ?").bind(now + 600000, lease, now, now).run();
  if (!claimed.meta?.changes) return { busy: true };
  try {
    const due = (await db.prepare("SELECT owner_id FROM alert_settings WHERE next_check <= ? AND (in_app = 1 OR email_enabled = 1) ORDER BY next_check LIMIT 10").bind(now).all<Pick<AlertSettings, "owner_id">>()).results;
    let checked = 0, added = 0, errors = 0;
    // Bounded, serial work keeps provider fan-out and CPU predictable during the test.
    for (const row of due ?? []) { const result = await checkOwnerAlerts(db, storage, row.owner_id, now); checked += +result.checked; added += result.added; if (result.error) errors++; }
    const deliveries = await deliverAlerts(db, now);
    await db.batch([
      db.prepare("DELETE FROM alert_inbox WHERE created_at < ?").bind(now - 30 * 86400000),
      db.prepare("DELETE FROM alert_seen WHERE seen_at < ?").bind(now - 45 * 86400000),
      db.prepare("DELETE FROM alert_deliveries WHERE updated_at < ? AND status NOT IN ('pending', 'retry', 'processing')").bind(now - 30 * 86400000),
    ]);
    return { checked, added, errors, ...deliveries };
  } finally {
    await db.prepare("UPDATE alert_runtime SET lease_until = 0 WHERE id = 'job-alerts' AND lease_token = ?").bind(lease).run();
  }
}
