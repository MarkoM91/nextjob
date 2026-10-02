"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Bookmark, BriefcaseBusiness, Check, CheckCircle2, CircleHelp, Clock3, ExternalLink, MapPin, ShieldCheck } from "lucide-react";
import type { MatchResult } from "../../lib/domain";
import { aggregatorName } from "../../lib/job-source";
import { AppContent, ApplicationMethodBadge, applicationMethodCopy, bandClass, CompanyMark, Fact, formatDate, formatSalary, LiveJobState, relativeDate, ScoreRing, SourceNotice, sourceLabel, useLiveMatch } from "./shared";

export function JobDetail({ jobId }: { jobId?: string }) {
  const { match, loading, error } = useLiveMatch(jobId);
  if (!match) return <LiveJobState loading={loading} error={error} />;
  return <JobDetailView match={match} />;
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="detail-section"><h2>{title}</h2><ul>{children}</ul></section>;
}

import { useSavedJobs } from "./saved-jobs";

function JobDetailView({ match }: { match: MatchResult }) {
  const method = applicationMethodCopy(match.job);
  const savedState = useSavedJobs();
  const saved = savedState.ids.has(match.job.id);
  return <AppContent narrow>
    <Link href="/matches" className="back-link"><ArrowLeft /> Back to matches</Link>
    <section className="job-detail-hero"><div className="job-detail-main"><CompanyMark name={match.job.company} large /><div><p className="kicker">{match.job.providerName} · {sourceLabel(match.job)}</p><h1>{match.job.title}</h1><p className="company-name">{match.job.company}</p><div className="job-meta"><span><MapPin />{match.job.locationText}</span><span><BriefcaseBusiness />{match.job.workplace}</span><span><Clock3 />{relativeDate(match.job.publishedAt)}</span></div></div></div><div className="detail-actions"><Link className="button button-small" href={`/generating?job=${match.job.id}`}>Preview tailored CV</Link><button className={`icon-text ${saved ? "saved" : ""}`} disabled={savedState.busy || savedState.loading} onClick={() => void savedState.toggle(match, !saved)}><Bookmark fill={saved ? "currentColor" : "none"} />{saved ? "Saved" : "Save"}</button></div></section>
    <div className="detail-layout"><div className="detail-content">
      <section className="match-hero panel"><div className="match-score-large"><strong className="evidence-label">{match.evidenceCoverage === "limited" ? "Preliminary fit" : "CV evidence"}</strong><div><span className={`match-label ${bandClass(match.band)}`}>{match.band}</span><h2>Why this job matches you</h2></div></div><p>{match.explanation}</p>{match.reviewNotes?.length ? <div className="match-review-summary"><h3>Check before applying</h3><ul>{match.reviewNotes.map((note) => <li key={note}>{note}</li>)}</ul></div> : null}{savedState.error && <p className="form-error" role="alert">{savedState.error}</p>}<div className="requirement-columns"><div><h3><CheckCircle2 /> Skills found in your CV</h3>{match.matchedSkills.length ? match.matchedSkills.map((skill) => <p key={skill}><Check />{skill}<span>Verified in your profile</span></p>) : <p className="requirement-none">The listing states no requirements NextJOB can verify against your profile.</p>}</div><div><h3><CircleHelp /> Possible gaps</h3>{match.gaps.length ? match.gaps.map((gap) => <p key={gap}><CircleHelp />{gap}<span>Not confirmed</span></p>) : <p className="requirement-none">No gaps identified against the stated requirements.</p>}</div></div></section>
      <DetailSection title="What you’ll do">{match.job.responsibilities.map((item) => <li key={item}>{item}</li>)}</DetailSection>
      <DetailSection title="Requirements">{match.job.requirements.map((item) => <li key={item.value}><strong>{item.value}</strong> — {item.mandatory ? "required" : "preferred"}<small>{item.confidence >= 0.9 ? "Stated in the listing" : "Identified from the listing; check the original"}</small></li>)}</DetailSection>
      <section className="detail-section"><h2>Original description</h2><p>{match.job.description}</p><p className="source-note"><ShieldCheck /> Check the original listing for complete requirements and availability.</p></section>
    </div><aside className="detail-sidebar"><section className="apply-card"><ApplicationMethodBadge job={match.job} /><h2>{method.title}</h2><p>{method.description}</p><Link className="button" href={`/generating?job=${match.job.id}`}>Preview tailored CV</Link>{match.job.originalUrl ? <a className="apply-secondary" href={match.job.originalUrl} target="_blank" rel="noreferrer">{aggregatorName(match.job) ? `Open on ${aggregatorName(match.job)}` : "View original job"} <ExternalLink /></a> : <span className="apply-secondary">Added from pasted text · apply where you found it</span>}<SourceNotice job={match.job} /><small>Free preview · CV download €1.50. Nothing is submitted automatically.</small></section><section className="facts-card"><h3>Role at a glance</h3><Fact label="Salary" value={formatSalary(match.job)} /><Fact label="Work style" value={match.job.workplace} /><Fact label="Employment" value={match.job.employmentType} /><Fact label="Visa sponsorship" value={match.job.visaSponsorship === null ? "Not stated" : match.job.visaSponsorship ? "Available" : "Not available"} /><Fact label="Closes" value={formatDate(match.job.expiresAt)} /></section></aside></div>
    <div className="job-mobile-action"><Link className="button" href={`/generating?job=${match.job.id}`}>Preview tailored CV</Link></div>
  </AppContent>;
}
