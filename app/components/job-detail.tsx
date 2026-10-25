"use client";
import { useI18n } from "./language-provider";
import { matchExplanation, reviewNote } from "../../lib/localized-copy";
import { DownloadPrice } from "./billing-context";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Bookmark, BriefcaseBusiness, Check, CheckCircle2, CircleHelp, Clock3, ExternalLink, MapPin, ShieldCheck } from "lucide-react";
import type { MatchResult } from "../../lib/domain";
import { aggregatorName } from "../../lib/job-source";
import { AppContent, ApplicationMethodBadge, applicationMethodCopy, bandClass, CompanyMark, Fact, formatDate, formatSalary, LiveJobState, relativeDate, ScoreRing, SourceNotice, sourceLabel, useLiveMatch } from "./shared";

export function JobDetail({ jobId }: { jobId?: string }) {
  const { match, loading, error, profileRequired } = useLiveMatch(jobId);
  if (!match) return <LiveJobState loading={loading} error={error} profileRequired={profileRequired} />;
  return <JobDetailView match={match} />;
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="detail-section"><h2>{title}</h2><ul>{children}</ul></section>;
}

import { useSavedJobs } from "./saved-jobs";

function JobDetailView({ match }: { match: MatchResult }) {
  const { t, locale } = useI18n();
  const method = applicationMethodCopy(match.job, locale);
  const savedState = useSavedJobs();
  const saved = savedState.ids.has(match.job.id);
  return <AppContent narrow>
    <Link href="/matches" className="back-link"><ArrowLeft /> {t("Back to matches")}</Link>
    <section className="job-detail-hero"><div className="job-detail-main"><CompanyMark name={match.job.company} large /><div><p className="kicker">{match.job.providerName} · {sourceLabel(match.job, locale)}</p><h1>{match.job.title}</h1><p className="company-name">{match.job.company}</p><div className="job-meta"><span><MapPin />{match.job.locationText}</span><span><BriefcaseBusiness />{t(match.job.workplace)}</span><span><Clock3 />{relativeDate(match.job.publishedAt, locale)}</span></div></div></div><div className="detail-actions"><Link className="button button-small" href={`/generating?job=${match.job.id}`}>{t("Preview tailored CV")}</Link><button className={`icon-text ${saved ? "saved" : ""}`} disabled={savedState.busy || savedState.loading} onClick={() => void savedState.toggle(match, !saved)}><Bookmark fill={saved ? "currentColor" : "none"} />{saved ? t("Saved") : t("Save")}</button></div></section>
    <div className="detail-layout"><div className="detail-content">
      <section className="match-hero panel"><div className="match-score-large"><strong className="evidence-label">{match.evidenceCoverage === "limited" ? t("Preliminary fit") : t("CV evidence")}</strong><div><span className={`match-label ${bandClass(match.band)}`}>{t(match.band)}</span><h2>{t("Why this job matches you")}</h2></div></div><p>{matchExplanation(match, locale)}</p>{match.reviewNotes?.length ? <div className="match-review-summary"><h3>{t("Check before applying")}</h3><ul>{match.reviewNotes.map((note) => <li key={note}>{reviewNote(note, locale)}</li>)}</ul></div> : null}{savedState.error && <p className="form-error" role="alert">{t(savedState.error)}</p>}<div className="requirement-columns"><div><h3><CheckCircle2 /> {t("Skills found in your CV")}</h3>{match.matchedSkills.length ? match.matchedSkills.map((skill) => <p key={skill}><Check />{skill}<span>{t("Verified in your profile")}</span></p>) : <p className="requirement-none">{t("The listing states no requirements NextJOB can verify against your profile.")}</p>}</div><div><h3><CircleHelp /> {t("Possible gaps")}</h3>{match.gaps.length ? match.gaps.map((gap) => <p key={gap}><CircleHelp />{gap}<span>{t("Not confirmed")}</span></p>) : <p className="requirement-none">{t("No gaps identified against the stated requirements.")}</p>}</div></div></section>
      <DetailSection title={t("What you’ll do")}>{match.job.responsibilities.map((item) => <li key={item}>{item}</li>)}</DetailSection>
      <DetailSection title={t("Requirements")}>{match.job.requirements.map((item) => <li key={item.value}><strong>{item.value}</strong> — {item.mandatory ? t("required") : t("preferred")}<small>{item.confidence >= 0.9 ? t("Stated in the listing") : t("Identified from the listing; check the original")}</small></li>)}</DetailSection>
      <section className="detail-section"><h2>{t("Original description")}</h2><p>{match.job.description}</p><p className="source-note"><ShieldCheck /> {t("Check the original listing for complete requirements and availability.")}</p></section>
    </div><aside className="detail-sidebar"><section className="apply-card"><ApplicationMethodBadge job={match.job} /><h2>{method.title}</h2><p>{method.description}</p><Link className="button" href={`/generating?job=${match.job.id}`}>{t("Preview tailored CV")}</Link>{match.job.originalUrl ? <a className="apply-secondary" href={match.job.originalUrl} target="_blank" rel="noreferrer">{aggregatorName(match.job) ? t("Open on {0}", {"0": aggregatorName(match.job)}) : t("View original job")} <ExternalLink /></a> : <span className="apply-secondary">{t("Added from pasted text · apply where you found it")}</span>}<SourceNotice job={match.job} /><small>{t("Free preview · CV download ")}<DownloadPrice />{t(". Nothing is submitted automatically.")}</small></section><section className="facts-card"><h3>{t("Role at a glance")}</h3><Fact label={t("Salary")} value={formatSalary(match.job, locale)} /><Fact label={t("Work style")} value={t(match.job.workplace)} /><Fact label={t("Employment")} value={match.job.employmentType} /><Fact label={t("Visa sponsorship")} value={match.job.visaSponsorship === null ? "Not stated" : match.job.visaSponsorship ? "Available" : "Not available"} /><Fact label={t("Closes")} value={formatDate(match.job.expiresAt, locale)} /></section></aside></div>
    <div className="job-mobile-action"><Link className="button" href={`/generating?job=${match.job.id}`}>{t("Preview tailored CV")}</Link></div>
  </AppContent>;
}
