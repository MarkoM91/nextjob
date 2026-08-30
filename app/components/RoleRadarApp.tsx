"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowRight, Bell, Bookmark, BriefcaseBusiness, Building2, CalendarDays, Check, CheckCircle2,
  ChevronDown, CircleHelp, Clock3, Download, ExternalLink, FileCheck2, FileText, Filter, Globe2, Heart,
  Home, LayoutDashboard, Mail, MapPin, MessageCircle, MoreHorizontal,
  PencilLine, Radar, RefreshCw, Search, Settings, ShieldCheck, Sparkles, UploadCloud, WandSparkles, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ChatGPTUser } from "../chatgpt-auth";
import { candidate, jobs } from "../../lib/demo-data";
import { createDemoApplication, rankJobs } from "../../lib/engine";
import { getDictionary } from "../../lib/i18n";
import type { CandidateProfile, Job, MatchResult } from "../../lib/domain";
import type { ReactiveResumeData } from "../../lib/reactive-resume";

type Props = { screen: string; jobId?: string; appliedJobId?: string; applicationState?: string; generationProvider?: string; user?: ChatGPTUser | null; demoMode?: boolean };
type NavItem = { href: string; label: string; icon: LucideIcon };
type MatchesApiResponse = { matches: MatchResult[]; sourceMode: "live" | "unavailable" | "profile-required"; profileRequired?: boolean; providerFailures?: Array<{ providerId: string; message: string }>; sourceCounts?: Record<string, number> };
type ApplicationRecord = { id: string; jobId: string; status: string; verification: string; applicationDate?: string | null; updatedAt: string; title: string; company: string; location: string; sourceUrl?: string | null; providerName: string };
type ReactiveExperienceItem = { id?: string; company?: string; position?: string; location?: string; period?: string; description?: string; roles?: Array<{ id?: string; position?: string; period?: string; description?: string }> };

function isReactiveExperience(value: CandidateProfile["experiences"][number] | ReactiveExperienceItem): value is ReactiveExperienceItem { return !("bullets" in value); }

const copy = getDictionary("en");
const rankedMatches = rankJobs(candidate, jobs, true);
const visibleMatches = rankedMatches.filter((match) => match.eligible);
const bestMatch = visibleMatches[0];

const productNav: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/matches", label: "Jobs", icon: Radar },
  { href: "/tracker", label: "Applications", icon: BriefcaseBusiness },
  { href: "/profile", label: "Profile", icon: FileText },
];

const supportNav: NavItem[] = [
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/help", label: "Help", icon: CircleHelp },
];

function Logo({ compact = false }: { compact?: boolean }) {
  return <Link href="/" className="brand" aria-label="NextJOB home"><span className="brand-mark"><i /></span>{!compact && <span>NextJOB</span>}</Link>;
}

function Landing() {
  const match = bestMatch;
  return <main className="android-welcome">
    <header className="welcome-appbar"><Logo /><Link href="/sign-in">Sign in</Link></header>
    <section className="welcome-content">
      <div className="welcome-copy">
        <p className="landing-kicker">Your job search, in one calm place.</p>
        <h1>Find work that fits. Apply without the busywork.</h1>
        <p>Upload your CV once. NextJOB finds relevant jobs, explains every match, and prepares the application from your real experience.</p>
        <div className="landing-actions"><Link className="button" href="/upload">Start with my CV <ArrowRight /></Link><Link className="button secondary" href="/dashboard">Explore the demo</Link></div>
        <small><ShieldCheck /> Private by default · Nothing sent without your review</small>
      </div>
      <div className="welcome-phone" aria-label="Example NextJOB match">
        <div className="phone-status"><span>9:41</span><strong>NextJOB</strong><Bell /></div>
        <div className="phone-screen">
          <p className="eyebrow">BEST MATCH TODAY</p>
          <h2>{match.job.title}</h2>
          <p>{match.job.company} · {match.job.locationText}</p>
          <div className="phone-match"><strong>{match.score}% match</strong><span>{match.matchedSkills.length} requirements confirmed</span></div>
          <div className="phone-proof">{match.matchedSkills.slice(0, 3).map((skill) => <span key={skill}><Check />{skill}</span>)}</div>
          <Link className="button" href={`/job?job=${match.job.id}`}>View why it fits <ArrowRight /></Link>
        </div>
      </div>
    </section>
    <section className="welcome-steps" aria-label="How NextJOB works">
      <article><span>1</span><div><strong>Upload once</strong><p>We create a profile you approve.</p></div></article>
      <article><span>2</span><div><strong>See jobs worth your time</strong><p>Every recommendation comes with evidence.</p></div></article>
      <article><span>3</span><div><strong>Review and apply</strong><p>Submit in-app when supported, or continue with autofill.</p></div></article>
    </section>
    <footer className="welcome-footer"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><span>© 2026 NextJOB</span></footer>
  </main>;
}

function AppShell({ screen, user, demoMode, children }: Props & { children: React.ReactNode }) {
  const displayName = user?.displayName ?? candidate.fullName;
  const isActive = (href: string) => href === "/dashboard" ? screen === "dashboard" : href === "/matches" ? ["matches", "saved", "job"].includes(screen) : href === "/tracker" ? ["tracker", "package", "done", "generating", "ats", "studio", "workspace", "cv-editor", "cover-letter", "application-email", "interview"].includes(screen) : ["profile", "profile-review", "preferences", "settings"].includes(screen);
  return <div className="app-frame">
    <aside className="sidebar">
      <div className="sidebar-head"><Logo /></div>
      <nav aria-label="Product">{productNav.map((item) => <SidebarLink key={item.href} item={item} active={isActive(item.href)} />)}<p className="nav-label support-label">Account</p>{supportNav.map((item) => <SidebarLink key={item.href} item={item} active={screen === item.href.slice(1)} />)}</nav>
      <div className="profile-card"><span className="avatar">{displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2)}</span><div><strong>{displayName.split(" ")[0]}</strong><span>{demoMode ? "Private QA profile" : user?.email ?? "Sign in to save progress"}</span></div></div>
    </aside>
    <div className="app-main">
      <header className="mobile-appbar"><Logo /><Link className="mobile-alerts" href="/notifications" aria-label="Notifications"><Bell /><i /></Link></header>
      {children}
    </div>
    <nav className="bottom-nav" aria-label="Mobile navigation">{productNav.map(({ href, label, icon: Icon }) => <Link href={href} key={href} className={isActive(href) ? "active" : ""}><Icon /><span>{label}</span></Link>)}</nav>
  </div>;
}

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) { const Icon = item.icon; return <Link href={item.href} className={`side-link ${active ? "active" : ""}`}><Icon size={18} />{item.label}{item.label === "Job matches" && <span className="nav-count">8</span>}</Link>; }

function ScoreRing({ score, small = false }: { score: number; small?: boolean }) {
  return <div className={`score-ring ${small ? "small" : ""}`} style={{ "--score": `${score * 3.6}deg` } as React.CSSProperties}><div><strong>{score}</strong>{!small && <span>/100</span>}</div></div>;
}

function Dashboard() {
  const [liveMatches, setLiveMatches] = useState<MatchResult[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [profileRequired, setProfileRequired] = useState(false);
  useEffect(() => {
    let active = true;
    void fetch("/api/matches?limit=4", { headers: { accept: "application/json" } }).then(async (response) => {
      if (!response.ok) throw new Error("Live jobs unavailable");
      return response.json() as Promise<MatchesApiResponse>;
    }).then((payload) => { if (active) { setLiveMatches(payload.matches); setProfileRequired(Boolean(payload.profileRequired)); } }).catch(() => undefined).finally(() => { if (active) setLoadingJobs(false); });
    return () => { active = false; };
  }, []);
  const topMatch = liveMatches[0];
  return <AppContent narrow>
    <section className="dashboard-welcome"><p className="dashboard-greeting">Good morning, {candidate.fullName.split(" ")[0]}</p><h1>{loadingJobs ? "Checking today’s employer listings…" : profileRequired ? "Verify your CV to unlock real matches." : liveMatches.length ? `${liveMatches.length} live job${liveMatches.length === 1 ? " is" : "s are"} worth a look.` : "No live matches right now."}</h1><p>{profileRequired ? "NextJOB will not match jobs against a sample profile. Upload and confirm your own experience first." : liveMatches.length ? "Filtered from current employer listings using your verified profile and preferences." : "NextJOB will show only real, currently available listings—never invented replacements."}</p><Link className="button" href={profileRequired ? "/upload" : "/matches"}>{profileRequired ? "Add my CV" : "See live jobs"} <ArrowRight /></Link></section>
    <div className="search-focus"><span><strong>{candidate.targetTitles[0]}</strong> and related roles</span><span>All work styles</span><span>Italy + EU</span><Link href="/preferences">Edit</Link></div>
    {topMatch && <section className="best-today"><div className="section-row"><div><p className="eyebrow">BEST LIVE MATCH</p><h2>{topMatch.job.title}</h2><p>{topMatch.job.company} · {topMatch.job.locationText} · {formatSalary(topMatch.job)}</p></div><em className={`match-state ${bandClass(topMatch.band)}`}>● {topMatch.band}</em></div><p>{topMatch.explanation}</p><div className="best-proof">{topMatch.matchedSkills.slice(0, 3).map((skill) => <span key={skill}><CheckCircle2 />{skill}</span>)}</div><Link className="button full" href={`/job?job=${topMatch.job.id}`}>View job <ArrowRight /></Link></section>}
    {liveMatches.length > 1 && <section className="dashboard-matches"><div className="section-row"><h2>More live matches</h2><Link href="/matches">See all</Link></div><div className="compact-list">{liveMatches.slice(1, 4).map((match) => <CompactJob key={match.job.id} match={match} />)}</div></section>}
    <p className="dashboard-tip">Improve your results by confirming Active Directory and Intune in your profile. <Link href="/profile">Review profile</Link></p>
    <p className="demo-disclaimer">Job availability comes directly from connected employer feeds. Matching is a NextJOB estimate; application submission is identified separately as verified or user-reported.</p>
  </AppContent>;
}

function Metric({ value, label, note, accent = false }: { value: string; label: string; note: string; accent?: boolean }) { return <div className={`metric ${accent ? "accent" : ""}`}><div><strong>{value}</strong><span>{label}</span></div><p>{note}</p></div>; }
function PanelHead({ title, subtitle, href }: { title: string; subtitle?: string; href?: string }) { return <div className="panel-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{href && <Link href={href}>View all <ArrowRight size={15} /></Link>}</div>; }
function CompactJob({ match }: { match: MatchResult }) { return <Link className="compact-job" href={`/job?job=${match.job.id}`}><div><h3>{match.job.title}</h3><p>{match.job.company} · {match.job.locationText} · {match.job.workplace} · {formatSalary(match.job)}</p></div><span className={`match-state ${bandClass(match.band)}`}>● {match.band}</span></Link>; }

function applicationMethodCopy(job: Job) {
  if (job.applicationMethod === "native") return { label: "Apply in NextJOB", title: "Apply without leaving NextJOB", description: "This employer-authorized ATS connection supports verified in-app submission after you review every document.", action: "Submit in NextJOB" };
  if (job.applicationMethod === "autofill") return { label: "Autofill available", title: "Autofill the employer form", description: "NextJOB can hand your reviewed profile and documents to the assisted-apply extension. You still verify and submit on the employer form.", action: "Continue with autofill" };
  return { label: "Employer-site application", title: "Review here, submit to the employer", description: "NextJOB prepares your documents and opens the official application. You confirm the status after returning.", action: "Continue to employer" };
}

function ApplicationMethodBadge({ job }: { job: Job }) {
  return <span className={`application-method ${job.applicationMethod}`}><i />{applicationMethodCopy(job).label}</span>;
}

function useLiveMatch(jobId?: string) {
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [loading, setLoading] = useState(Boolean(jobId));
  const [error, setError] = useState("");
  useEffect(() => {
    if (!jobId) { setLoading(false); setError("No live job was selected."); return; }
    let active = true;
    setLoading(true); setError("");
    void fetch(`/api/jobs/${encodeURIComponent(jobId)}`, { headers: { accept: "application/json" } }).then(async (response) => {
      const payload = await response.json().catch(() => ({})) as { match?: MatchResult; error?: string };
      if (!response.ok || !payload.match) throw new Error(payload.error ?? "This job is no longer available.");
      if (active) setMatch(payload.match);
    }).catch((loadError) => { if (active) setError(loadError instanceof Error ? loadError.message : "This job is no longer available."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [jobId]);
  return { match, loading, error };
}

function LiveJobState({ loading, error }: { loading: boolean; error: string }) {
  return <AppContent narrow><Link href="/matches" className="back-link"><ArrowLeft /> Back to jobs</Link><section className="live-job-state">{loading ? <><RefreshCw className="spin" /><h1>Loading the employer listing…</h1><p>Checking the original source and latest job details.</p></> : <><CircleHelp /><h1>This job is unavailable</h1><p>{error || "The employer may have closed or removed the listing."}</p><Link className="button" href="/matches">View current jobs <ArrowRight /></Link></>}</section></AppContent>;
}

function MatchesScreen({ savedOnly = false, appliedJobId, applicationState }: { savedOnly?: boolean; appliedJobId?: string; applicationState?: string }) {
  const [query, setQuery] = useState("");
  const [workplace, setWorkplace] = useState("All work styles");
  const [countryCode, setCountryCode] = useState("ALL");
  const [tab, setTab] = useState<"Best matches" | "New" | "Saved" | "Not interested">(savedOnly ? "Saved" : "Best matches");
  const [showFilters, setShowFilters] = useState(false);
  const [feedMatches, setFeedMatches] = useState<MatchResult[]>([]);
  const [sourceMode, setSourceMode] = useState<"loading" | "live" | "unavailable" | "profile-required">("loading");
  const [sourceCounts, setSourceCounts] = useState<Record<string, number>>({});
  const [saved, setSaved] = useState(new Set<string>());
  const [rejected, setRejected] = useState(new Set<string>());
  const [newJobCutoff] = useState(() => Date.now() - 7 * 86400000);
  useEffect(() => {
    let active = true;
    const country = countryCode === "ALL" ? "" : `&country=${encodeURIComponent(countryCode)}`;
    void fetch(`/api/matches?limit=30${country}`, { headers: { accept: "application/json" } })
      .then(async (response) => { if (!response.ok) throw new Error("Job feed unavailable"); return response.json() as Promise<MatchesApiResponse>; })
      .then((payload) => { if (!active) return; setFeedMatches(payload.matches); setSourceMode(payload.sourceMode); setSourceCounts(payload.sourceCounts ?? {}); })
      .catch(() => { if (active) { setFeedMatches([]); setSourceMode("unavailable"); } });
    return () => { active = false; };
  }, [countryCode]);
  const countryOptions = useMemo(() => {
    const countries = new Map<string, string>();
    for (const match of feedMatches) countries.set(match.job.countryCode, match.job.country);
    return [...countries].map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [feedMatches]);
  const isNewJob = (match: MatchResult) => new Date(match.job.publishedAt).getTime() >= newJobCutoff;
  const byTab = feedMatches.filter((match) => {
    if (tab === "Saved") return saved.has(match.job.id) && !rejected.has(match.job.id);
    if (tab === "Not interested") return rejected.has(match.job.id);
    if (tab === "New") return isNewJob(match) && !rejected.has(match.job.id);
    return !rejected.has(match.job.id);
  });
  const filtered = byTab.filter((match) => (!query || `${match.job.title} ${match.job.company}`.toLowerCase().includes(query.toLowerCase())) && (workplace === "All work styles" || match.job.workplace === workplace) && (countryCode === "ALL" || match.job.countryCode === countryCode));
  const setSavedJob = (jobId: string, nextSaved: boolean) => {
    setSaved((current) => { const next = new Set(current); if (nextSaved) next.add(jobId); else next.delete(jobId); return next; });
    void fetch("/api/saved-jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId, saved: nextSaved }) }).catch(() => undefined);
  };
  const appliedJob = appliedJobId ? feedMatches.find((match) => match.job.id === appliedJobId)?.job : undefined;
  const activeSources = Object.values(sourceCounts).filter((count) => count > 0).length;
  const activeFilterCount = Number(Boolean(query.trim())) + Number(workplace !== "All work styles") + Number(countryCode !== "ALL");
  return <AppContent>
    {appliedJobId && <div className={`application-success ${applicationState === "verified" ? "verified" : "reported"}`} role="status"><CheckCircle2 /><div><strong>{applicationState === "verified" ? "Application verified and submitted" : "Application recorded"}</strong><p>{applicationState === "verified" ? `${appliedJob?.title ?? "Your application"} was accepted by the employer system.` : `You marked ${appliedJob?.title ?? "this job"} as applied. NextJOB has not received an employer confirmation.`}</p></div><Link href="/tracker">View application <ArrowRight /></Link></div>}
    <div className="matches-heading"><div><h1>{savedOnly ? "Saved jobs" : "Job matches"}</h1><p>{savedOnly ? "Roles you marked for a closer look." : "Selected from your verified profile and preferences."}</p></div><button className="filter-button" aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}><Filter /> Filters{activeFilterCount ? ` · ${activeFilterCount}` : ""}</button></div>
    {!savedOnly && <div className={`source-status ${sourceMode}`} role="status"><span><i />{sourceMode === "loading" ? "Refreshing live jobs…" : sourceMode === "live" ? `Live employer jobs · ${activeSources} active source${activeSources === 1 ? "" : "s"}` : sourceMode === "profile-required" ? "Your verified CV is required" : "Live jobs are temporarily unavailable"}</span>{sourceMode === "live" && <small>Greenhouse, Lever and approved employer feeds · no fictional listings</small>}{sourceMode === "profile-required" && <small>NextJOB will not create matches from a sample profile.</small>}{sourceMode === "unavailable" && <small>NextJOB will not replace unavailable sources with invented jobs.</small>}</div>}
    {!savedOnly && <div className="feed-tabs">{(["Best matches", "New", "Saved", "Not interested"] as const).map((name) => <button key={name} className={tab === name ? "active" : ""} onClick={() => setTab(name)}>{name} <span>{name === "Saved" ? saved.size : name === "Not interested" ? rejected.size : name === "New" ? feedMatches.filter(isNewJob).length : feedMatches.length}</span></button>)}</div>}
    {showFilters && <div className="filter-bar"><label className="search-input"><Search /><input aria-label="Search roles" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title or company" /></label><label className="select-wrap"><Globe2 /><select value={countryCode} onChange={(event) => { if (event.target.value !== countryCode) setSourceMode("loading"); setCountryCode(event.target.value); }} aria-label="Country"><option value="ALL">All countries</option>{countryOptions.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}</select><ChevronDown /></label><label className="select-wrap"><BriefcaseBusiness /><select value={workplace} onChange={(event) => setWorkplace(event.target.value)} aria-label="Work style"><option>All work styles</option><option>Remote</option><option>Hybrid</option><option>On-site</option></select><ChevronDown /></label><button className="filter-reset" onClick={() => { setQuery(""); if (countryCode !== "ALL") setSourceMode("loading"); setCountryCode("ALL"); setWorkplace("All work styles"); }}>Reset</button></div>}
    {!filtered.length ? <EmptyState icon={sourceMode === "profile-required" ? FileText : Bookmark} title={sourceMode === "loading" ? "Finding live jobs…" : sourceMode === "profile-required" ? "Start with your verified CV" : "No live matches found"} text={tab === "Saved" ? "Save a match and it will appear here." : sourceMode === "profile-required" ? "Upload your CV and confirm the extracted facts before NextJOB matches any job to you." : sourceMode === "unavailable" ? "The connected employer feeds returned no available roles. Try again shortly." : "Try a broader country or work-style filter."} action={sourceMode === "profile-required" ? "Upload my CV" : "Refresh jobs"} href={sourceMode === "profile-required" ? "/upload" : "/matches"} /> : <section className="match-list" aria-label="Matching jobs">{filtered.map((match) => <article key={match.job.id} className="match-list-item"><div className="match-list-copy"><h2>{match.job.title}</h2><small>{match.job.company} · {match.job.locationText} · {match.job.workplace} · {relativeDate(match.job.publishedAt)}</small><p>{match.explanation}</p><span className="match-proof"><CheckCircle2 /> {match.matchedSkills.length ? match.matchedSkills.slice(0, 3).join(", ") : "Profile and preference filters passed"}</span></div><div className="match-list-next"><div className="match-list-labels"><em className={`match-state ${bandClass(match.band)}`}>● {match.band}</em><ApplicationMethodBadge job={match.job} /></div><Link className="button button-small" href={`/job?job=${match.job.id}`}>View job <ArrowRight /></Link><div><button className={saved.has(match.job.id) ? "saved" : ""} onClick={() => setSavedJob(match.job.id, !saved.has(match.job.id))}>{saved.has(match.job.id) ? "Saved" : "Save"}</button><button onClick={() => setRejected((current) => new Set(current).add(match.job.id))}>Not interested</button></div></div></article>)}</section>}
  </AppContent>;
}

function JobDetail({ jobId }: { jobId?: string }) {
  const { match, loading, error } = useLiveMatch(jobId);
  if (!match) return <LiveJobState loading={loading} error={error} />;
  return <JobDetailView match={match} />;
}

function JobDetailView({ match }: { match: MatchResult }) {
  const method = applicationMethodCopy(match.job);
  const [saved, setSaved] = useState(false);
  return <AppContent narrow>
    <Link href="/matches" className="back-link"><ArrowLeft /> Back to matches</Link>
    <section className="job-detail-hero"><div className="job-detail-main"><CompanyMark name={match.job.company} large /><div><p className="kicker">{match.job.providerName} · LIVE EMPLOYER LISTING</p><h1>{match.job.title}</h1><p className="company-name">{match.job.company}</p><div className="job-meta"><span><MapPin />{match.job.locationText}</span><span><BriefcaseBusiness />{match.job.workplace}</span><span><Clock3 />{relativeDate(match.job.publishedAt)}</span></div></div></div><div className="detail-actions"><Link className="button button-small" href={`/generating?job=${match.job.id}`}>Create application <ArrowRight /></Link><button className={`icon-text ${saved ? "saved" : ""}`} onClick={() => setSaved(!saved)}><Bookmark fill={saved ? "currentColor" : "none"} />{saved ? "Saved" : "Save"}</button></div></section>
    <div className="detail-layout"><div className="detail-content">
      <section className="match-hero panel"><div className="match-score-large"><ScoreRing score={match.score} /><div><span className={`match-label ${bandClass(match.band)}`}>{match.band}</span><h2>Why this job matches you</h2></div></div><p>{match.explanation}</p><div className="requirement-columns"><div><h3><CheckCircle2 /> Requirements you meet</h3>{match.matchedSkills.map((skill) => <p key={skill}><Check />{skill}<span>Verified in your profile</span></p>)}</div><div><h3><CircleHelp /> Possible gaps</h3>{match.gaps.map((gap) => <p key={gap}><CircleHelp />{gap}<span>Not confirmed</span></p>)}</div></div></section>
      <DetailSection title="What you’ll do">{match.job.responsibilities.map((item) => <li key={item}>{item}</li>)}</DetailSection>
      <DetailSection title="Requirements">{match.job.requirements.map((item) => <li key={item.value}><strong>{item.value}</strong> — {item.mandatory ? "required" : "preferred"}<small>Evidence confidence {Math.round(item.confidence * 100)}%</small></li>)}</DetailSection>
      <section className="detail-section"><h2>Original description</h2><p>{match.job.description}</p><p className="source-note"><ShieldCheck /> Description is rendered as sanitized text and preserved separately from normalized fields.</p></section>
    </div><aside className="detail-sidebar"><section className="apply-card"><ApplicationMethodBadge job={match.job} /><h2>{method.title}</h2><p>{method.description}</p><Link className="button" href={`/generating?job=${match.job.id}`}>Create application <ArrowRight /></Link><a className="apply-secondary" href={match.job.originalUrl} target="_blank" rel="noreferrer">View original job <ExternalLink /></a><small>Nothing is submitted before your final confirmation.</small></section><section className="facts-card"><h3>Role at a glance</h3><Fact label="Salary" value={formatSalary(match.job)} /><Fact label="Work style" value={match.job.workplace} /><Fact label="Employment" value={match.job.employmentType} /><Fact label="Visa sponsorship" value={match.job.visaSponsorship === null ? "Not stated" : match.job.visaSponsorship ? "Available" : "Not available"} /><Fact label="Closes" value={match.job.expiresAt ? "30 September" : "Not provided"} /></section></aside></div>
    <div className="job-mobile-action"><Link className="button" href={`/generating?job=${match.job.id}`}>Create application <ArrowRight /></Link></div>
  </AppContent>;
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="detail-section"><h2>{title}</h2><ul>{children}</ul></section>; }
function Fact({ label, value }: { label: string; value: string }) { return <div className="fact"><span>{label}</span><strong>{value}</strong></div>; }

function UploadScreen({ stage = "upload" }: { stage?: "upload" | "profile" | "preferences" }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const upload = async () => {
    if (!file || !consent || uploading) return;
    setUploading(true); setError("");
    const form = new FormData(); form.set("cv", file); form.set("aiProcessingConsent", "true");
    try {
      const response = await fetch("/api/cv/upload", { method: "POST", body: form });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "We could not upload that file.");
      router.push("/profile-review");
    } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : "We could not upload that file."); setUploading(false); }
  };
  if (stage === "profile") return <ProfileReview />;
  if (stage === "preferences") return <Preferences />;
  return <OnboardingFrame step={1}><div className="upload-layout"><div><h1>Upload your current CV</h1><p className="onboarding-lead">We&apos;ll analyze it once, then take you directly to the facts and skills you need to review.</p><div className={`dropzone ${file ? "has-file" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); setFile(event.dataTransfer.files?.[0] ?? null); }}><input ref={fileInput} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />{file ? <><FileCheck2 /><strong>{file.name}</strong><span>{Math.max(1, Math.round(file.size / 1024))} KB · ready to analyze</span><button type="button" onClick={() => fileInput.current?.click()}>Choose another file</button></> : <><UploadCloud /><strong>Drop your CV here</strong><span>PDF or DOCX · maximum 10 MB</span><button type="button" className="button" onClick={() => fileInput.current?.click()}>Choose file</button></>}</div>{error && <p className="form-error" role="alert">{error}</p>}<label className="consent-check"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span><strong>I agree to secure AI processing</strong><small>Reactive Resume and the configured AI provider process this file to extract your profile and generate only the applications you request. <Link href="/privacy">Learn more</Link></small></span></label><button disabled={!file || !consent || uploading} className="button full" onClick={upload}>{uploading ? "Analyzing your CV…" : "Analyze CV and continue"}<ArrowRight /></button><p className="upload-privacy">Private by default. Nothing is matched or generated until you review the extracted facts.</p></div></div></OnboardingFrame>;
}

function OnboardingFrame({ step, children }: { step: number; children: React.ReactNode }) { return <main className="onboarding"><header><Logo /><Link href="/help">Help</Link></header><div className="onboarding-progress"><span className={step >= 1 ? "active" : ""}>1 <em>Add CV</em></span><i /><span className={step >= 2 ? "active" : ""}>2 <em>Check profile</em></span><i /><span className={step >= 3 ? "active" : ""}>3 <em>Choose jobs</em></span></div>{children}<footer><ShieldCheck /> Private by default. You approve every application.</footer></main>; }

function ProfileReview() {
  const router = useRouter();
  const [profile, setProfile] = useState<CandidateProfile>(candidate);
  const [profileSource, setProfileSource] = useState("nextjob-fallback");
  const [verified, setVerified] = useState(new Set(candidate.facts.filter((fact) => fact.verifiedByUser).map((fact) => fact.id)));
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  useEffect(() => {
    let active = true;
    void fetch("/api/cv/profile", { headers: { accept: "application/json" } }).then((response) => response.ok ? response.json() : null).then((payload: { profile?: CandidateProfile; source?: string } | null) => {
      if (!active || !payload?.profile) return;
      setProfile(payload.profile); setProfileSource(payload.source ?? "nextjob-fallback"); setVerified(new Set(payload.profile.facts.filter((fact) => fact.verifiedByUser).map((fact) => fact.id)));
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const confirmProfile = async () => {
    if (confirming || verified.size !== profile.facts.length) return;
      if (profileSource !== "reactive-resume") { router.push("/preferences"); return; }
    setConfirming(true); setConfirmError("");
    const response = await fetch("/api/cv/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmAll: true }) }).catch(() => null);
    if (!response?.ok) { const body = await response?.json().catch(() => null) as { error?: string } | null; setConfirmError(body?.error ?? "Your profile could not be confirmed."); setConfirming(false); return; }
    router.push("/preferences");
  };
  return <OnboardingFrame step={2}><div className="review-wrap"><div className="review-heading"><div><p className="eyebrow">ALMOST THERE</p><h1>Does this look like you?</h1><p>Confirm the facts we extracted. Only approved information is used to tailor applications.</p></div><div className="review-score"><strong>{profileSource === "reactive-resume" ? "AI" : "DEMO"}</strong><span>{profileSource === "reactive-resume" ? "Reactive Resume extraction" : "sample profile"}</span></div></div><section className="review-section"><PanelHead title="Professional profile" subtitle={profileSource === "reactive-resume" ? "Parsed securely from your uploaded CV" : "Demo profile until Reactive Resume + AI is configured"} /><div className="fact-list">{profile.facts.map((fact) => <div className="extracted-fact" key={fact.id}><button className={verified.has(fact.id) ? "verified" : ""} onClick={() => setVerified((current) => { const next = new Set(current); if (next.has(fact.id)) next.delete(fact.id); else next.add(fact.id); return next; })}>{verified.has(fact.id) ? <Check /> : <CircleHelp />}</button><div><span>{fact.label}</span><strong>{fact.value}</strong><small>“{fact.sourceText}” · {Math.round(fact.confidence * 100)}% confidence</small></div><button aria-label={`Edit ${fact.label}`}><PencilLine /></button></div>)}</div></section><section className="review-section"><PanelHead title="Skills" subtitle="Choose a level now or leave it unspecified" /><div className="skill-editor">{profile.skills.map((skill, index) => <div key={skill}><span>{skill}</span><select aria-label={`${skill} level`} defaultValue={index < 3 ? "advanced" : "unspecified"}><option value="unspecified">Level not set</option><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select><CheckCircle2 /></div>)}</div></section>{confirmError && <p className="form-error" role="alert">{confirmError}</p>}<div className="sticky-review"><p><ShieldCheck /> {verified.size} of {profile.facts.length} facts confirmed · confirm each fact before continuing</p><button className="button" disabled={verified.size !== profile.facts.length || confirming} onClick={confirmProfile}>{confirming ? "Saving…" : "Confirm profile"} <ArrowRight /></button></div></div></OnboardingFrame>;
}

function Preferences() {
  const [workstyles, setWorkstyles] = useState(new Set(["Remote", "Hybrid", "On-site"]));
  return <OnboardingFrame step={3}><div className="preferences-wrap"><p className="eyebrow">SHAPE YOUR SEARCH</p><h1>What should NextJOB look for?</h1><p className="onboarding-lead">Start simple. You can fine-tune advanced preferences later.</p><section className="preference-section"><h2>Where would you like to work?</h2><div className="choice-grid"><Choice icon={Home} label="Remote" selected={workstyles.has("Remote")} onClick={() => toggleSet(workstyles, setWorkstyles, "Remote")} /><Choice icon={Building2} label="Hybrid" selected={workstyles.has("Hybrid")} onClick={() => toggleSet(workstyles, setWorkstyles, "Hybrid")} /><Choice icon={MapPin} label="On-site" selected={workstyles.has("On-site")} onClick={() => toggleSet(workstyles, setWorkstyles, "On-site")} /></div></section><section className="preference-section"><h2>Target locations</h2><label className="token-input"><Globe2 /><span>Italy <button aria-label="Remove Italy"><X /></button></span><span>Spain <button aria-label="Remove Spain"><X /></button></span><input aria-label="Add country" placeholder="Add a country" /></label></section><section className="preference-section"><h2>Roles you’re interested in</h2><label className="field-label">Target titles<textarea defaultValue={candidate.targetTitles.join("\n")} /></label></section><details className="advanced-preferences"><summary>Advanced preferences <ChevronDown /></summary><div className="advanced-grid"><label>Minimum annual salary<input type="number" defaultValue="34000" /></label><label>Currency<select><option>EUR</option><option>GBP</option><option>USD</option></select></label><label><input type="checkbox" /> I need visa sponsorship</label><label><input type="checkbox" /> I am open to relocation</label></div></details><div className="sticky-review"><p><ShieldCheck /> You can change these preferences anytime.</p><Link className="button" href="/dashboard">Find my matches <Radar /></Link></div></div></OnboardingFrame>;
}

function Choice({ icon: Icon, label, selected, onClick }: { icon: LucideIcon; label: string; selected: boolean; onClick: () => void }) { return <button className={`choice ${selected ? "selected" : ""}`} onClick={onClick}><Icon /><span>{label}</span>{selected && <CheckCircle2 />}</button>; }

function ApplicationSetup({ jobId }: { jobId?: string }) {
  const match = rankedMatches.find((item) => item.job.id === jobId) ?? bestMatch;
  const [documents, setDocuments] = useState({ cv: true, cover: true, email: true });
  const options = [
    ["cv", "ATS-optimized CV", "Reordered and rephrased for this role's requirements."],
    ["cover", "Cover letter", "Grounded in your verified experience. 250–400 words."],
    ["email", "Application email", "Concise, ready to send, with your documents attached."],
  ] as const;
  return <AppContent narrow><Link className="back-link" href={`/job?job=${match.job.id}`}><ArrowLeft /> Back to job</Link><section className="application-setup"><p className="flow-step">Step 1 of 3 · Choose documents</p><h1>Prepare your application</h1><p>Select what you want NextJOB to tailor for this job.</p><small>{match.job.title} · {match.job.company}</small><div className="document-options">{options.map(([key, title, description]) => <button key={key} onClick={() => setDocuments((current) => ({ ...current, [key]: !current[key] }))}><span className={documents[key] ? "checked" : ""}>{documents[key] ? <Check /> : null}</span><div><strong>{title}</strong><p>{description}</p></div></button>)}</div><p className="grounding-note"><ShieldCheck /> We only use information confirmed in your profile. Experience is never invented.</p><Link aria-disabled={!Object.values(documents).some(Boolean)} className={`button full ${!Object.values(documents).some(Boolean) ? "disabled" : ""}`} href={`/generating?job=${match.job.id}`}>Create my application <ArrowRight /></Link></section></AppContent>;
}

function Generating({ jobId }: { jobId?: string }) {
  const { match, loading, error } = useLiveMatch(jobId);
  if (!match) return <LiveJobState loading={loading} error={error} />;
  return <GeneratingView match={match} />;
}

function GeneratingView({ match }: { match: MatchResult }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [generationError, setGenerationError] = useState("");
  const [retryAttempt, setRetryAttempt] = useState(0);
  const steps = ["Reading the job requirements", "Matching your verified experience", "Drafting your documents", "Running ATS checks"];
  useEffect(() => {
    let active = true;
    const interval = window.setInterval(() => setStep((current) => Math.min(steps.length, current + 1)), 550);
    void fetch("/api/applications/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId: match.job.id, tone: "Professional" }) }).then(async (response) => {
      const payload = await response.json().catch(() => ({})) as { error?: string; generationProvider?: string };
      if (!response.ok) throw new Error(payload.error ?? "Your tailored CV could not be generated.");
      if (!active) return;
      setStep(steps.length); window.clearInterval(interval);
      const provider = payload.generationProvider === "reactive-resume" ? "reactive-resume" : "nextjob";
      window.setTimeout(() => router.push(`/workspace?job=${match.job.id}&provider=${provider}`), 350);
    }).catch((error) => { if (active) { window.clearInterval(interval); setGenerationError(error instanceof Error ? error.message : "Your tailored CV could not be generated."); } });
    return () => { active = false; window.clearInterval(interval); };
  }, [match.job.id, retryAttempt, router, steps.length]);
  return <AppContent narrow><section className="generation-card"><h1>Preparing your documents</h1><p>{match.job.title} · {match.job.company}</p><div>{steps.map((label, index) => <span key={label} className={index < step ? "done" : index === step ? "active" : ""}>{index < step ? <Check /> : index === step ? <RefreshCw /> : <i />} {label}</span>)}</div>{generationError && <div className="generation-error"><p className="form-error" role="alert">{generationError}</p><div className="generation-error-actions"><button className="button" onClick={() => { setStep(0); setGenerationError(""); setRetryAttempt((current) => current + 1); }}>Try again</button><Link className="secondary-action" href={`/job?job=${match.job.id}`}>Back to job</Link></div></div>}</section></AppContent>;
}

function Studio({ jobId, generationProvider }: { jobId?: string; generationProvider?: string }) {
  const { match, loading, error } = useLiveMatch(jobId);
  if (!match) return <LiveJobState loading={loading} error={error} />;
  return <StudioView match={match} generationProvider={generationProvider} />;
}

function StudioView({ match, generationProvider }: { match: MatchResult; generationProvider?: string }) {
  const router = useRouter();
  const [cvProfile, setCvProfile] = useState<CandidateProfile>(candidate);
  const [resumeContent, setResumeContent] = useState<ReactiveResumeData | null>(null);
  useEffect(() => {
    let active = true;
    void fetch("/api/cv/profile", { headers: { accept: "application/json" } }).then(async (response) => {
      const payload = await response.json().catch(() => null) as { profile?: CandidateProfile; resume?: ReactiveResumeData | null } | null;
      if (active && response.ok && payload?.profile) { setCvProfile(payload.profile); setResumeContent(payload.resume ?? null); }
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const application = useMemo(() => createDemoApplication(cvProfile, match.job), [cvProfile, match.job]);
  const method = applicationMethodCopy(match.job);
  const [tab, setTab] = useState<"cv" | "cover" | "email" | "interview">("cv");
  const [summary, setSummary] = useState("");
  const [showSubmit, setShowSubmit] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [externalOpened, setExternalOpened] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const submitNativeApplication = async () => {
    if (!confirmed || submitting) return;
    setSubmitting(true); setSubmitError("");
    const response = await fetch("/api/applications/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId: match.job.id, action: "native", confirmed: true }) }).catch(() => null);
    if (!response?.ok) { const body = await response?.json().catch(() => null) as { error?: string } | null; setSubmitError(body?.error ?? "Submission could not be confirmed."); setSubmitting(false); return; }
    setSubmitted(true); setSubmitting(false); setShowSubmit(false);
    router.replace(`/matches?application=verified&job=${encodeURIComponent(match.job.id)}`);
  };
  const openedEmployerForm = () => {
    setExternalOpened(true); setSubmitError("");
    void fetch("/api/applications/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId: match.job.id, action: "opened" }) }).catch(() => undefined);
  };
  const recordSelfReportedApplication = async () => {
    if (submitting) return;
    setSubmitting(true); setSubmitError("");
    const response = await fetch("/api/applications/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId: match.job.id, action: "self_reported", confirmed: true }) }).catch(() => null);
    if (!response?.ok) { const body = await response?.json().catch(() => null) as { error?: string } | null; setSubmitError(body?.error ?? "Application activity could not be recorded."); setSubmitting(false); return; }
    router.replace(`/matches?application=reported&job=${encodeURIComponent(match.job.id)}`);
  };
  const applyAction = (mobile = false) => match.job.applicationMethod === "native"
    ? <button className={`button ${mobile ? "" : "button-small"}`} disabled={submitted} onClick={() => setShowSubmit(true)}>{submitted ? <><CheckCircle2 /> Submitted</> : <>{method.action} <ArrowRight /></>}</button>
    : <a className={`button ${mobile ? "" : "button-small"}`} href={match.job.originalUrl} target="_blank" rel="noreferrer" onClick={openedEmployerForm}>{method.action} <ExternalLink /></a>;
  return <div className="studio-shell"><header className="studio-top"><Link href={`/job?job=${match.job.id}`} className="back-link"><ArrowLeft /> Back to job</Link><div><span>Application for</span><strong>{match.job.title} · {match.job.company}</strong></div><div className="studio-quick-actions"><a className="secondary-action" href={`/api/documents/pdf?job=${match.job.id}`} download><Download /> Download CV</a>{applyAction()}</div></header><div className="studio-ready"><div><ApplicationMethodBadge job={match.job} /><span><CheckCircle2 /><strong>{submitted ? "Application submitted" : "Ready for your review"}</strong><small>{submitted ? "Submission confirmed" : "Your documents use only verified information"}</small></span></div></div><div className="studio-body"><aside className="studio-nav"><p className="nav-label">YOUR APPLICATION</p><button className={tab === "cv" ? "active" : ""} onClick={() => setTab("cv")}><FileText /> CV <CheckCircle2 /></button><button className={tab === "cover" ? "active" : ""} onClick={() => setTab("cover")}><Heart /> Cover letter <CheckCircle2 /></button><button className={tab === "email" ? "active" : ""} onClick={() => setTab("email")}><Mail /> Email <CheckCircle2 /></button><button className={tab === "interview" ? "active" : ""} onClick={() => setTab("interview")}><MessageCircle /> Interview prep <CheckCircle2 /></button><div className="truth-card"><ShieldCheck /><strong>Based on your profile</strong><p>No experience was invented.</p><Link href="/profile">Review profile</Link></div></aside><main className="editor-main">
      {tab === "cv" && <><div className="editor-head"><div><p className="kicker">YOUR COMPLETE CV</p><h1>Review your complete CV</h1><p>Every parsed section is preserved. Only the professional summary is tailored to this job.</p></div></div><div className="editor-layout editor-layout-simple"><section className="document-paper"><div className="document-name"><h2>{cvProfile.fullName}</h2><p>{cvProfile.currentRole}</p><span>{[cvProfile.location, cvProfile.email, cvProfile.phone].filter(Boolean).join(" · ")}</span>{(resumeContent?.sections?.profiles?.items ?? []).map((profile) => <small key={profile.id ?? `${profile.network}-${profile.username}`}>{[profile.network, profile.username, profile.website].filter(Boolean).join(" · ")}</small>)}</div><DocumentSection title="Professional Summary"><textarea aria-label="Professional summary" value={summary || application.summary} onChange={(event) => setSummary(event.target.value)} /><p className="source-chip"><ShieldCheck /> Tailored from your verified profile</p></DocumentSection><DocumentSection title="Work Experience">{(resumeContent?.sections?.experience?.items?.length ? resumeContent.sections.experience.items : cvProfile.experiences).map((experience, index) => isReactiveExperience(experience) ? <article className="cv-entry" key={experience.id ?? `experience-${index}`}><h4>{experience.position || "Role"}</h4><p className="document-meta">{[experience.company, experience.location, experience.period].filter(Boolean).join(" · ")}</p><ResumeLines value={experience.description} />{experience.roles?.map((role, roleIndex) => <div className="cv-nested-role" key={role.id ?? `role-${roleIndex}`}><h5>{role.position || "Role"}</h5><p className="document-meta">{role.period}</p><ResumeLines value={role.description} /></div>)}</article> : <article className="cv-entry" key={experience.id}><h4>{experience.role}</h4><p className="document-meta">{[experience.company, [experience.startDate, experience.endDate ?? "Present"].filter(Boolean).join(" — ")].filter(Boolean).join(" · ")}</p><ul>{experience.bullets.flatMap((bullet) => splitResumeLines(bullet.text)).map((line, lineIndex) => <li key={`${experience.id}-${lineIndex}`}>{line}</li>)}</ul></article>)}</DocumentSection><DocumentSection title="Skills"><div className="cv-skill-groups">{(resumeContent?.sections?.skills?.items ?? []).length ? resumeContent!.sections!.skills!.items!.map((skill) => <p key={skill.id ?? skill.name}><strong>{skill.name}</strong>{skill.proficiency ? ` · ${skill.proficiency}` : ""}{skill.keywords?.length ? ` · ${skill.keywords.join(" · ")}` : ""}</p>) : <p>{cvProfile.skills.join(" · ")}</p>}</div></DocumentSection><DocumentSection title="Education">{(resumeContent?.sections?.education?.items ?? []).length ? resumeContent!.sections!.education!.items!.map((item, index) => <article className="cv-entry" key={item.id ?? `education-${index}`}><h4>{[item.degree, item.area].filter(Boolean).join(" — ") || "Education"}</h4><p className="document-meta">{[item.school, item.location, item.period].filter(Boolean).join(" · ")}</p><ResumeLines value={item.description} /></article>) : cvProfile.education.map((item, index) => <p key={`${item}-${index}`}>{item}</p>)}</DocumentSection>{(resumeContent?.sections?.certifications?.items ?? []).length > 0 && <DocumentSection title="Certifications">{resumeContent!.sections!.certifications!.items!.map((item, index) => <article className="cv-entry" key={item.id ?? `certification-${index}`}><h4>{item.title}</h4><p className="document-meta">{[item.issuer, item.date].filter(Boolean).join(" · ")}</p><ResumeLines value={item.description} /></article>)}</DocumentSection>}{(resumeContent?.sections?.projects?.items ?? []).length > 0 && <DocumentSection title="Projects">{resumeContent!.sections!.projects!.items!.map((item, index) => <article className="cv-entry" key={item.id ?? `project-${index}`}><h4>{item.name}</h4><p className="document-meta">{item.period}</p><ResumeLines value={item.description} /></article>)}</DocumentSection>}{cvProfile.languages.length > 0 && <DocumentSection title="Languages"><p>{cvProfile.languages.join(" · ")}</p></DocumentSection>}</section></div></>}
      {tab === "cover" && <DocumentEditor title="Cover letter" kicker="250–400 WORDS · PROFESSIONAL" content={application.coverLetter} />}
      {tab === "email" && <EmailEditor subject={application.email.subject} body={application.email.body} />}
      {tab === "interview" && <InterviewEditor application={application} />}
    </main></div><div className="studio-mobile-action"><a className="secondary-action" href={`/api/documents/pdf?job=${match.job.id}`} download><Download /> CV</a>{applyAction(true)}</div>{generationProvider === "reactive-resume" && <div className="document-provider-note"><ShieldCheck /> PDF generated by Reactive Resume + AI from your verified CV and this job description. Review it before applying.</div>}{showSubmit && <div className="submit-overlay"><section className="submit-dialog" role="dialog" aria-modal="true" aria-labelledby="submit-title"><button className="submit-close" onClick={() => setShowSubmit(false)} aria-label="Close submission confirmation"><X /></button><ApplicationMethodBadge job={match.job} /><h2 id="submit-title">Submit this application?</h2><p>NextJOB will send your reviewed profile, tailored CV, cover letter and answers to {match.job.company} through its authorized {match.job.providerName} connection.</p><div className="submit-summary"><span><FileText /><strong>Tailored CV</strong>Attached</span><span><Heart /><strong>Cover letter</strong>Attached</span><span><ShieldCheck /><strong>Factual check</strong>Passed</span></div><label className="submit-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span><strong>I reviewed this application</strong><small>Submit only the information shown in this workspace.</small></span></label>{submitError && <p className="form-error" role="alert">{submitError}</p>}<div className="submit-actions"><button className="secondary-action" onClick={() => setShowSubmit(false)}>Cancel</button><button className="button" disabled={!confirmed || submitting} onClick={submitNativeApplication}>{submitting ? "Submitting…" : "Submit application"}</button></div><small className="submit-demo-note">Verified submission is enabled only for employers that authorize NextJOB and return a receipt.</small></section></div>}{externalOpened && <div className="submit-overlay"><section className="submit-dialog" role="dialog" aria-modal="true" aria-labelledby="external-submit-title"><button className="submit-close" onClick={() => setExternalOpened(false)} aria-label="Close application status"><X /></button><ApplicationMethodBadge job={match.job} /><h2 id="external-submit-title">Did you submit on the employer site?</h2><p>The official form opened in a new tab. NextJOB cannot see whether the employer accepted it, so choose the accurate status.</p><div className="submit-summary"><span><ExternalLink /><strong>Employer form</strong>Opened</span><span><FileText /><strong>Tailored CV</strong>Ready</span><span><ShieldCheck /><strong>Employer receipt</strong>Not received</span></div>{submitError && <p className="form-error" role="alert">{submitError}</p>}<div className="submit-actions"><button className="secondary-action" onClick={() => setExternalOpened(false)}>Not yet</button><button className="button" disabled={submitting} onClick={recordSelfReportedApplication}>{submitting ? "Recording…" : "Yes, I submitted"}</button></div><small className="submit-demo-note">This status is user-reported until an employer or ATS confirms it.</small></section></div>}</div>;
}

function DocumentSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="document-section"><h3>{title}</h3>{children}</section>; }
function splitResumeLines(value?: string): string[] { return value?.split(/\n+/).map((line) => line.replace(/^\s*[•*-]\s*/, "").trim()).filter(Boolean) ?? []; }
function ResumeLines({ value }: { value?: string }) { const lines = splitResumeLines(value); return lines.length ? <ul>{lines.map((line, index) => <li key={`${line}-${index}`}>{line}</li>)}</ul> : null; }
function DocumentEditor({ title, kicker, content }: { title: string; kicker: string; content: string }) { const [text, setText] = useState(content); return <><div className="editor-head"><div><p className="kicker">{kicker}</p><h1>{title}</h1><p>Edit freely, change tone, or regenerate one paragraph.</p></div><div className="tone-select">Tone <select><option>Professional</option><option>Direct</option><option>Warm</option><option>Concise</option></select></div></div><section className="letter-paper"><textarea value={text} onChange={(event) => setText(event.target.value)} aria-label={title} /><div className="document-footer"><span>{text.trim().split(/\s+/).length} words</span><span><ShieldCheck /> Claims grounded</span><button><RefreshCw /> Restore previous</button></div></section></>; }
function EmailEditor({ subject, body }: { subject: string; body: string }) { return <><div className="editor-head"><div><p className="kicker">CONCISE · READY TO EDIT</p><h1>Application email</h1><p>A short note to send with your tailored documents.</p></div></div><section className="email-paper"><label>Subject<input defaultValue={subject} /></label><label>Message<textarea defaultValue={body} /></label><div className="attachment-reminder"><FileText /><div><strong>Before sending</strong><p>Attach the tailored CV and cover letter from your package.</p></div></div></section></>; }
function InterviewEditor({ application }: { application: ReturnType<typeof createDemoApplication> }) { return <><div className="editor-head"><div><p className="kicker">JOB-SPECIFIC PREPARATION</p><h1>Walk in with a clear story.</h1><p>Prompts use your verified experience. They never fabricate answers.</p></div></div><div className="prep-grid"><PrepList number="01" title="Likely questions" items={application.interview.likelyQuestions} /><PrepList number="02" title="Address possible gaps" items={application.interview.gapQuestions} /><PrepList number="03" title="STAR story prompts" items={application.interview.starPrompts} /><PrepList number="04" title="Questions to ask" items={application.interview.questionsToAsk} /></div></>; }
function PrepList({ number, title, items }: { number: string; title: string; items: string[] }) { return <section className="prep-list"><span>{number}</span><h2>{title}</h2>{items.map((item) => <p key={item}>{item}</p>)}</section>; }

function PackageScreen({ jobId }: { jobId?: string }) {
  const { match, loading, error } = useLiveMatch(jobId);
  if (!match) return <LiveJobState loading={loading} error={error} />;
  return <PackageView match={match} />;
}
function PackageView({ match }: { match: MatchResult }) {
  return <AppContent narrow><Link href={`/workspace?job=${match.job.id}`} className="back-link"><ArrowLeft /> Back to review</Link><PageIntro eyebrow="DOWNLOAD & APPLY" title="Your application is ready" subtitle={`${match.job.title} · ${match.job.company}`} /><div className="package-layout"><section className="panel package-list"><PackageItem icon={FileText} title="Tailored CV" note="Ready to send · Version 2" formats={["PDF", "DOCX", "TXT"]} jobId={match.job.id} /><PackageItem icon={Heart} title="Cover letter" note="Professional tone · 287 words · Version 1" formats={["PDF", "DOCX", "TXT"]} jobId={match.job.id} /><PackageItem icon={Mail} title="Application email" note="Subject and concise message" formats={["TXT"]} jobId={match.job.id} /><PackageItem icon={MessageCircle} title="Interview preparation" note="10 questions · 3 STAR prompts" formats={["PDF", "TXT"]} jobId={match.job.id} /></section><aside className="manual-apply"><p className="kicker">FINAL STEP</p><h2>Continue to the employer</h2><ol><li>Download the documents you need.</li><li>Open the official application form.</li><li>Return to the review screen to record the accurate status.</li></ol><a className="button" href={match.job.originalUrl} target="_blank" rel="noreferrer">Open employer form <ExternalLink /></a><small>Opening the form is not a submission. NextJOB records “applied” only after you confirm it.</small></aside></div></AppContent>;
}
function PackageItem({ icon: Icon, title, note, formats, jobId }: { icon: LucideIcon; title: string; note: string; formats: string[]; jobId: string }) { return <article className="package-item"><div className="package-icon"><Icon /></div><div><h2>{title}</h2><p>{note}</p><span><ShieldCheck /> Factual validation passed</span></div><div className="format-actions">{formats.map((format) => <a key={format} href={`/api/documents/${format.toLowerCase()}?job=${jobId}`} download>{format}<Download /></a>)}</div></article>; }

function Tracker() {
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
  return <AppContent><PageIntro eyebrow="YOUR PIPELINE" title="Application tracker" subtitle="Real employer jobs with honest confirmation status." action={<Link className="button" href="/matches"><BriefcaseBusiness /> Find jobs</Link>} /><div className="tracker-summary"><span><strong>{opened}</strong> Forms opened</span><span><strong>{applied}</strong> User-reported</span><span><strong>{verified}</strong> Employer-verified</span></div>{loading ? <section className="panel tracker-loading"><RefreshCw className="spin" /> Loading your applications…</section> : !applications.length ? <EmptyState icon={BriefcaseBusiness} title="No applications recorded" text="Open a live employer application from NextJOB and its status will appear here." action="View live jobs" href="/matches" /> : <section className="panel tracker-list"><div className="tracker-head"><span>Opportunity</span><span>Status</span><span>Source</span><span /></div>{applications.map((application) => { const employerVerified = application.verification === "employer_verified"; const userReported = application.status === "self_reported_applied"; const label = employerVerified ? "Employer verified" : userReported ? "Applied · user reported" : "Employer form opened"; const tone = employerVerified ? "green" : userReported ? "blue" : "gold"; return <article key={application.id}><CompanyMark name={application.company} /><div><strong>{application.title}</strong><span>{application.company} · {application.location}</span></div><div><span className={`status ${tone}`}>{label}</span><small>{new Date(application.applicationDate ?? application.updatedAt).toLocaleDateString()}</small></div><div><strong>{application.providerName}</strong><span>{employerVerified ? <><CheckCircle2 /> Receipt received</> : <><CircleHelp /> Not employer verified</>}</span></div>{application.sourceUrl ? <a href={application.sourceUrl} target="_blank" rel="noreferrer" aria-label={`Open ${application.title}`}><ExternalLink /></a> : <span />}</article>; })}</section>}</AppContent>;
}

function DocumentsScreen() { return <AppContent><PageIntro eyebrow="VERSIONED & EDITABLE" title="Your documents" subtitle="Every original, tailored version, and grounded source stays organized." action={<Link className="button" href={`/generating?job=${bestMatch.job.id}`}><WandSparkles /> Create application</Link>} /><div className="document-filters"><button className="active">All documents <span>7</span></button><button>Tailored CVs <span>3</span></button><button>Cover letters <span>2</span></button><button>Emails <span>2</span></button></div><div className="documents-grid">{visibleMatches.slice(0, 3).map((match, index) => <article className="document-tile" key={match.job.id}><div className="doc-preview"><FileText /><span>CV</span><div className="fake-lines"><i /><i /><i /><i /></div></div><div><span className="match-label green">Version {index + 1}</span><h2>{match.job.title}</h2><p>{match.job.company}</p><small>Updated {index ? `${index + 1} days ago` : "today"}</small><div><a href={`/api/documents/pdf?job=${match.job.id}`}><Download /> Download</a><Link href={`/workspace?job=${match.job.id}`}><PencilLine /> Edit</Link></div></div></article>)}</div></AppContent>; }

function Notifications() { const [email, setEmail] = useState(true); const [whatsapp, setWhatsapp] = useState(false); return <AppContent narrow><PageIntro eyebrow="USEFUL, NOT NOISY" title="Notification settings" subtitle="Choose which opportunities deserve to interrupt your day." /><div className="settings-layout"><section className="panel settings-panel"><h2>Channels</h2><SettingToggle icon={Mail} title="Email alerts" text="Daily digest and time-sensitive reminders" enabled={email} setEnabled={setEmail} /><SettingToggle icon={MessageCircle} title="WhatsApp alerts" text="Strong matches only · explicit opt-in required" enabled={whatsapp} setEnabled={setWhatsapp} /><div className="consent-note"><ShieldCheck /><p>WhatsApp is off by default. A verified number and explicit consent are required before any message can be sent. Demo deliveries are simulated.</p></div></section><section className="panel settings-panel"><h2>Relevance rules</h2><label className="settings-field">Notify me for<select defaultValue="strong"><option value="strong">Excellent and Strong matches</option><option>Excellent matches only</option><option>Possible matches and above</option></select></label><label className="settings-field">Email frequency<select defaultValue="daily"><option value="daily">Daily digest</option><option>Instant strong matches</option><option>Weekly summary</option></select></label><div className="settings-columns"><label>Quiet hours start<input type="time" defaultValue="21:00" /></label><label>Quiet hours end<input type="time" defaultValue="08:00" /></label></div><label className="settings-field">Daily cap<input type="number" min="0" max="10" defaultValue="2" /></label></section><button className="button settings-save"><Check /> Save preferences</button></div></AppContent>; }
function SettingToggle({ icon: Icon, title, text, enabled, setEnabled }: { icon: LucideIcon; title: string; text: string; enabled: boolean; setEnabled: (value: boolean) => void }) { return <div className="setting-toggle"><span><Icon /></span><div><strong>{title}</strong><p>{text}</p></div><button aria-label={`Toggle ${title}`} className={enabled ? "on" : ""} onClick={() => setEnabled(!enabled)}><i /></button></div>; }

function Admin() { const providers = [
  ["Direct ATS", "Healthy", "2 min ago", "9", "118 ms"], ["Atlas Jobs API", "Healthy", "8 min ago", "6", "164 ms"], ["EURES demo feed", "Healthy", "21 min ago", "5", "302 ms"], ["Public Jobs JSON", "Degraded", "34 min ago", "4", "842 ms"], ["Civic Careers Feed", "Offline", "2 hours ago", "0", "—"],
]; return <AppContent><PageIntro eyebrow="PROTECTED ADMIN" title="Provider health" subtitle="Operational visibility without access to private user documents." /><div className="admin-metrics"><Metric value="5" label="providers enabled" note="3 healthy · 1 degraded" /><Metric value="30" label="jobs imported" note="last scheduled run" /><Metric value="6.7%" label="duplicate rate" note="2 roles grouped" /><Metric value="0" label="AI validation errors" note="past 24 hours" /></div><section className="panel provider-table"><div className="table-head"><span>Provider</span><span>Health</span><span>Last success</span><span>Imported</span><span>Latency</span></div>{providers.map(([name, health, last, count, latency]) => <div key={name}><strong>{name}</strong><span className={`health ${health.toLowerCase()}`}><i />{health}</span><span>{last}</span><span>{count}</span><span>{latency}</span></div>)}</section><div className="admin-grid"><section className="panel"><PanelHead title="Delivery health" subtitle="Simulated in demo mode" /><Fact label="Email" value="Healthy · 12 delivered" /><Fact label="WhatsApp" value="Demo · 3 simulated" /><Fact label="Failed deliveries" value="0" /></section><section className="panel"><PanelHead title="Processing queues" subtitle="Replaceable queue adapter" /><Fact label="Ingestion" value="Idle" /><Fact label="Document generation" value="0 waiting" /><Fact label="Dead-letter queue" value="0 records" /></section></div></AppContent>; }

function AuthScreen({ mode }: { mode: "sign-in" | "sign-up" | "forgot-password" }) { const title = mode === "sign-in" ? "Welcome back" : mode === "sign-up" ? "Create your NextJOB account" : "Reset your password"; return <main className="auth-page"><div className="auth-brand"><Logo /><div><p className="eyebrow light">YOUR SEARCH, IN FOCUS</p><h1>One verified profile.<br />A world of relevant roles.</h1><p>Private by default. Factual by design. You stay in control of every application.</p></div><span><ShieldCheck /> Nothing is ever submitted automatically.</span></div><div className="auth-form"><Link href="/" className="back-link"><ArrowLeft /> Back home</Link><div><h1>{title}</h1><p>{mode === "forgot-password" ? "Enter your email and we’ll send a secure reset link." : mode === "sign-in" ? "Continue to your private job-search workspace." : "Start with your email. Your first CV stays private."}</p></div>{mode !== "forgot-password" && <Link href="/signin-with-chatgpt?return_to=%2Fdashboard" className="chatgpt-button"><Sparkles /> Continue securely with ChatGPT</Link>}<div className="auth-divider"><span>or use email</span></div><label>Email address<input type="email" placeholder="you@example.com" /></label>{mode !== "forgot-password" && <label>Password<span>{mode === "sign-in" && <Link href="/forgot-password">Forgot password?</Link>}</span><input type="password" placeholder="At least 12 characters" /></label>}<Link className="button full" href={mode === "forgot-password" ? "/sign-in" : mode === "sign-up" ? "/upload" : "/dashboard"}>{mode === "forgot-password" ? "Send reset link" : mode === "sign-up" ? "Create account" : "Sign in"}<ArrowRight /></Link><p className="auth-switch">{mode === "sign-in" ? <>New to NextJOB? <Link href="/sign-up">Create an account</Link></> : mode === "sign-up" ? <>Already have an account? <Link href="/sign-in">Sign in</Link></> : <Link href="/sign-in">Return to sign in</Link>}</p><small className="auth-note">Hosted identity uses secure, dispatch-owned sign-in. Email/password and Google adapters remain in demo mode until a production identity provider is configured.</small></div></main>; }

function StaticScreen({ screen }: { screen: string }) { const content: Record<string, [string, string, string[]]> = {
  privacy: ["Privacy", "Your career history deserves careful handling.", ["Private CV and document storage", "Explicit consent before Reactive Resume and AI processing", "Data export and deletion controls", "No raw CV text in analytics"]],
  terms: ["Terms", "A focused assistant, not an application guarantee.", ["NextJOB never auto-applies in the MVP", "ATS readiness is an estimate", "Generated content must stay factual", "Worldwide coverage depends on enabled, licensed providers"]],
  help: ["Help centre", "A clear answer at every step.", ["Uploading and verifying your CV", "Understanding match explanations", "Editing and downloading documents", "Managing privacy and alerts"]],
  billing: ["Billing", "Simple plans, clear limits.", ["Free demo workspace", "Production subscription adapter", "No payment details collected in demo mode", "Cancel before a paid integration is activated"]],
  profile: ["Profile", "Your verified source of truth.", ["6 years of confirmed experience", "7 verified skills", "3 languages", "4 grounded experience bullets"]],
  settings: ["Settings", "Control your workspace.", ["Account and security", "Language and regional formats", "Data retention", "Export or delete your account"]],
}; const [title, subtitle, items] = content[screen] ?? ["Not found", "This workspace view is not available.", []]; return <AppContent narrow><PageIntro eyebrow="NEXTJOB" title={title} subtitle={subtitle} /><section className="panel static-panel">{items.map((item) => <div key={item}><CheckCircle2 /><span>{item}</span></div>)}</section></AppContent>; }

function AppContent({ children, narrow = false }: { children: React.ReactNode; narrow?: boolean }) { return <main className={`app-content ${narrow ? "narrow" : ""}`}>{children}</main>; }
function PageIntro({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: React.ReactNode }) { return <header className="page-intro"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{subtitle}</p></div>{action}</header>; }
function CompanyMark({ name, large = false }: { name: string; large?: boolean }) { return <span className={`company-mark ${large ? "large" : ""}`}>{name.replace(" (fictional)", "").split(/\s+/).slice(0, 2).map((word) => word[0]).join("")}</span>; }
function EmptyState({ icon: Icon, title, text, action, href }: { icon: LucideIcon; title: string; text: string; action: string; href: string }) { return <div className="empty-state"><Icon /><h2>{title}</h2><p>{text}</p><Link className="button" href={href}>{action}<ArrowRight /></Link></div>; }
function formatSalary(job: MatchResult["job"]): string { const salary = job.salary; if (!salary) return "Salary not provided"; const formatter = new Intl.NumberFormat("en", { style: "currency", currency: salary.originalCurrency, maximumFractionDigits: 0 }); return `${formatter.format(salary.originalAmountMin)}–${formatter.format(salary.originalAmountMax)} / ${salary.originalPeriod.toLowerCase()}`; }
function relativeDate(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Recently";
  const days = Math.max(0, Math.floor((Date.now() - timestamp) / 86400000));
  return days === 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days ago`;
}
function bandClass(band: string): string { return band.startsWith("Excellent") ? "green" : band.startsWith("Strong") ? "teal" : band.startsWith("Possible") ? "gold" : "muted"; }
function toggleSet(current: Set<string>, setter: (next: Set<string>) => void, value: string) { const next = new Set(current); if (next.has(value)) next.delete(value); else next.add(value); setter(next); }

export function NextJobApp({ screen, jobId, appliedJobId, applicationState, generationProvider, user, demoMode = true }: Props) {
  if (screen === "landing") return <Landing />;
  if (screen === "sign-in" || screen === "sign-up" || screen === "forgot-password") return <AuthScreen mode={screen} />;
  if (screen === "upload") return <UploadScreen />;
  if (screen === "profile-review") return <UploadScreen stage="profile" />;
  if (screen === "preferences") return <UploadScreen stage="preferences" />;
  let content: React.ReactNode;
  if (screen === "dashboard") content = <Dashboard />;
  else if (screen === "matches") content = <MatchesScreen appliedJobId={applicationState ? jobId : appliedJobId} applicationState={applicationState ?? (appliedJobId ? "reported" : undefined)} />;
  else if (screen === "saved") content = <MatchesScreen savedOnly />;
  else if (screen === "job") content = <JobDetail jobId={jobId} />;
  else if (screen === "setup") content = <Generating jobId={jobId} />;
  else if (screen === "generating") content = <Generating jobId={jobId} />;
  else if (screen === "ats") content = <Studio jobId={jobId} generationProvider={generationProvider} />;
  else if (["studio", "workspace", "cv-editor", "cover-letter", "application-email", "interview"].includes(screen)) content = <Studio jobId={jobId} generationProvider={generationProvider} />;
  else if (screen === "package" || screen === "done") content = <PackageScreen jobId={jobId} />;
  else if (screen === "tracker") content = <Tracker />;
  else if (screen === "documents") content = <DocumentsScreen />;
  else if (screen === "notifications" || screen === "notification-settings") content = <Notifications />;
  else if (screen === "admin") content = <Admin />;
  else content = <StaticScreen screen={screen} />;
  return <AppShell screen={screen} user={user} demoMode={demoMode}>{content}</AppShell>;
}
