"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BriefcaseBusiness, CheckCircle2, CircleHelp, Download, ExternalLink, FileText, PencilLine, RefreshCw, WandSparkles } from "lucide-react";
import { AppContent, CompanyMark, EmptyState, PageIntro, visibleMatches, bestMatch, type ApplicationRecord } from "./shared";

export function Tracker() {
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void fetch("/api/applications/submit", { headers: { accept: "application/json" } }).then(async (response) => {
      if (!response.ok) throw new Error("Tracker unavailable");
      return response.json() as Promise<{ applications?: ApplicationRecord[] }>;
    }).then((payload) => { if (active) setApplications(payload.applications ?? []); }).catch(() => undefined).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const opened = applications.filter((item) => item.status === "employer_form_opened").length;
  const applied = applications.filter((item) => item.status === "self_reported_applied").length;
  const verified = applications.filter((item) => item.verification === "employer_verified").length;
  return <AppContent><PageIntro eyebrow="Your pipeline" title="Application tracker" subtitle="Real employer jobs with honest confirmation status." action={<Link className="button" href="/matches"><BriefcaseBusiness /> Find jobs</Link>} /><div className="tracker-summary"><span><strong>{opened}</strong> Forms opened</span><span><strong>{applied}</strong> User-reported</span><span><strong>{verified}</strong> Employer-verified</span></div>{loading ? <section className="panel tracker-loading"><RefreshCw className="spin" /> Loading your applications…</section> : !applications.length ? <EmptyState icon={BriefcaseBusiness} title="No applications recorded" text="Open a live employer application from NextJOB and its status will appear here." action="View live jobs" href="/matches" /> : <section className="panel tracker-list"><div className="tracker-head"><span>Opportunity</span><span>Status</span><span>Source</span><span /></div>{applications.map((application) => { const employerVerified = application.verification === "employer_verified"; const userReported = application.status === "self_reported_applied"; const label = employerVerified ? "Employer verified" : userReported ? "Applied · user reported" : "Employer form opened"; const tone = employerVerified ? "green" : userReported ? "blue" : "gold"; return <article key={application.id}><CompanyMark name={application.company} /><div><strong>{application.title}</strong><span>{application.company} · {application.location}</span></div><div><span className={`status ${tone}`}>{label}</span><small>{new Date(application.applicationDate ?? application.updatedAt).toLocaleDateString()}</small></div><div><strong>{application.providerName}</strong><span>{employerVerified ? <><CheckCircle2 /> Receipt received</> : <><CircleHelp /> Not employer verified</>}</span></div>{application.sourceUrl ? <a href={application.sourceUrl} target="_blank" rel="noreferrer" aria-label={`Open ${application.title}`}><ExternalLink /></a> : <span />}</article>; })}</section>}</AppContent>;
}

export function DocumentsScreen() {
  return <AppContent><PageIntro eyebrow="Tailored per job" title="Your documents" subtitle="Documents are generated for a specific job and grounded in your verified profile." action={bestMatch ? <Link className="button" href={`/generating?job=${bestMatch.job.id}`}><WandSparkles /> Create application</Link> : undefined} /><div className="documents-grid">{visibleMatches.slice(0, 3).map((match) => <article className="document-tile" key={match.job.id}><div className="doc-preview"><FileText /><span>CV</span></div><div><h2>{match.job.title}</h2><p>{match.job.company}</p><small>Tailored CV, cover letter and email for this role</small><div><a href={`/api/documents/pdf?job=${match.job.id}`}><Download /> Download</a><Link href={`/workspace?job=${match.job.id}`}><PencilLine /> Edit</Link></div></div></article>)}</div><p className="demo-disclaimer">Every document stays editable and traceable to your verified profile. <Link href="/matches">Pick another job <ArrowRight /></Link></p></AppContent>;
}
