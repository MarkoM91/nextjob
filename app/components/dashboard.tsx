"use client";
import { useI18n } from "./language-provider";
import { matchExplanation } from "../../lib/localized-copy";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import type { CandidateProfile, MatchResult } from "../../lib/domain";
import { AppContent, bandClass, formatSalary, useTargetCountries, type MatchesApiResponse } from "./shared";

/** CVs often shout the name in capitals; the greeting should not. */
function greetingName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? "";
  return first === first.toUpperCase() ? first.charAt(0) + first.slice(1).toLowerCase() : first;
}

function CompactJob({ match }: { match: MatchResult }) {
  const { t, locale } = useI18n();
  return <Link className="compact-job" href={`/job?job=${match.job.id}`}><div><h3>{match.job.title}</h3><p>{match.job.company} · {match.job.locationText} · {t(match.job.workplace)} · {formatSalary(match.job, locale)}</p></div><span className={`match-state ${bandClass(match.band)}`}>● {t(match.band)}</span></Link>;
}

export function Dashboard() {
  const { t, locale } = useI18n();
  const targetCountries = useTargetCountries();
  const [liveMatches, setLiveMatches] = useState<MatchResult[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [profileRequired, setProfileRequired] = useState(false);
  // The greeting and search focus come from the verified CV, not the sample profile.
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  useEffect(() => {
    let active = true;
    void fetch("/api/cv/profile", { headers: { accept: "application/json" } }).then(async (response) => {
      const payload = await response.json().catch(() => null) as { profile?: CandidateProfile; source?: string } | null;
      if (active && response.ok && ["reactive-resume", "nextjob-parser"].includes(payload?.source ?? "") && payload?.profile) setProfile(payload.profile);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  // Start from the verified CV city, with the network location as a fallback.
  const [origin, setOrigin] = useState<{ name: string; lat: number; lon: number } | null>(null);
  const [nearby, setNearby] = useState(false);
  useEffect(() => {
    let active = true;
    const load = async () => {
      const where = await fetch("/api/whereami", { headers: { accept: "application/json" } }).then((response) => response.ok ? response.json() : null).catch(() => null) as { profile?: { name: string; lat: number; lon: number } | null; network?: { name: string; lat: number; lon: number } | null } | null;
      const place = where?.profile ?? where?.network ?? null;
      if (active) setOrigin(place);
      const feed = async (near: boolean) => fetch(`/api/matches?limit=4${near && place ? `&scope=nearby&near=${place.lat},${place.lon}&area=${encodeURIComponent(place.name)}&radius=50&sort=distance` : "&scope=anywhere"}`, { headers: { accept: "application/json" } }).then(async (response) => { if (!response.ok) throw new Error("Live jobs unavailable"); return response.json() as Promise<MatchesApiResponse>; });
      let payload = await feed(Boolean(place));
      let close = Boolean(place) && payload.matches.length > 0;
      if (place && !payload.matches.length && !payload.profileRequired) { payload = await feed(false); close = false; }
      if (active) { setLiveMatches(payload.matches); setNearby(close); setProfileRequired(Boolean(payload.profileRequired)); }
    };
    void load().catch(() => undefined).finally(() => { if (active) setLoadingJobs(false); });
    return () => { active = false; };
  }, []);
  const topMatch = liveMatches[0];
  const topGaps = topMatch?.gaps.slice(0, 2) ?? [];
  return <AppContent narrow>
    <section className="dashboard-welcome">
      <p className="dashboard-greeting">{t("Search overview")}{profile ? ` · ${greetingName(profile.fullName)}` : ""}</p>
      <h1>{loadingJobs ? t("Checking current employer listings…") : profileRequired ? t("Verify your CV to unlock real matches.") : liveMatches.length ? t("Current matching roles: {0}", {0: liveMatches.length}) + (nearby && origin ? " · " + t("Near {0}", {0: origin.name}) : "") : t("No current matches.")}</h1>
      <p>{profileRequired ? t("NextJOB will not match jobs against a sample profile. Upload and confirm your own experience first.") : liveMatches.length ? (nearby && origin ? t("Within 50 km of {0}, filtered from current employer listings using your verified profile.", {"0": origin.name}) : origin ? t("Nothing within 50 km of {0} right now, so this is the wider feed for your target countries.", {"0": origin.name}) : t("Filtered from current employer listings using your verified profile and preferences.")) : t("NextJOB will show only real, currently available listings—never invented replacements.")}</p>
      <Link className="button" href={profileRequired ? "/upload" : "/matches"}>{profileRequired ? t("Add my CV") : t("See live jobs")} <ArrowRight /></Link>
    </section>
    {profile && <div className="search-focus"><span><strong>{profile.targetTitles[0] ?? profile.currentRole}</strong> {t("and related roles")}</span><span>{profile.preferences.workplace.length === 3 ? t("All work styles") : profile.preferences.workplace.join(", ")}</span><span>{targetCountries.join(", ")} {t("+ remote EU")}</span><Link href="/preferences">{t("Edit")}</Link></div>}
    {topMatch && <section className="best-today"><div className="section-row"><div><p className="eyebrow">{t("Best live match")}</p><h2>{topMatch.job.title}</h2><p>{topMatch.job.company} · {topMatch.job.locationText} · {formatSalary(topMatch.job)}</p></div><em className={`match-state ${bandClass(topMatch.band)}`}>● {topMatch.band}</em></div><p>{topMatch.explanation}</p><div className="best-proof">{topMatch.matchedSkills.slice(0, 3).map((skill) => <span key={skill}><CheckCircle2 />{skill}</span>)}</div><Link className="button full" href={`/job?job=${topMatch.job.id}`}>{t("View job ")}<ArrowRight /></Link></section>}
    {liveMatches.length > 1 && <section className="dashboard-matches"><div className="section-row"><h2>{t("More live matches")}</h2><Link href="/matches">{t("See all")}</Link></div><div className="compact-list">{liveMatches.slice(1, 4).map((match) => <CompactJob key={match.job.id} match={match} />)}</div></section>}
    {topGaps.length > 0 && <p className="dashboard-tip">{t("Improve your results by confirming ")}{topGaps.join(" and ")} {t("in your profile. ")}<Link href="/profile">{t("Review profile")}</Link></p>}
    <p className="demo-disclaimer">{t("Job availability comes directly from connected employer feeds. Matching is a NextJOB estimate; application submission is identified separately as verified or user-reported.")}</p>
  </AppContent>;
}
