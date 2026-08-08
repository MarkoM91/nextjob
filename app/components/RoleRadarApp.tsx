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
import { candidate, demoDocument, jobs } from "../../lib/demo-data";
import { createDemoApplication, rankJobs } from "../../lib/engine";
import { getDictionary } from "../../lib/i18n";
import type { Job, MatchResult } from "../../lib/domain";

type Props = { screen: string; jobId?: string; user?: ChatGPTUser | null; demoMode?: boolean };
type NavItem = { href: string; label: string; icon: LucideIcon };

const copy = getDictionary("en");
const rankedMatches = rankJobs(candidate, jobs, true);
const visibleMatches = rankedMatches.filter((match) => match.eligible);
const bestMatch = visibleMatches[0];

const productNav: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/matches", label: "Job matches", icon: Radar },
  { href: "/saved", label: "Saved", icon: Bookmark },
  { href: "/tracker", label: "Applications", icon: BriefcaseBusiness },
  { href: "/documents", label: "Documents", icon: FileText },
];

const supportNav: NavItem[] = [
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/help", label: "Help", icon: CircleHelp },
];

function Logo({ compact = false }: { compact?: boolean }) {
  return <Link href="/" className="brand" aria-label="RoleRadar home"><span className="brand-mark"><i /></span>{!compact && <span>RoleRadar</span>}</Link>;
}

function Landing() {
  return <main className="landing">
    <header className="landing-nav">
      <Logo />
      <nav aria-label="Main navigation"><a href="#how">How it works</a><Link href="/billing">Pricing</Link><Link href="/privacy">Privacy</Link></nav>
      <div className="landing-auth"><Link href="/sign-in">Sign in</Link><Link className="button button-small" href="/upload">Upload CV</Link></div>
      <Link className="mobile-menu button button-small" href="/upload">Upload CV</Link>
    </header>

    <section className="landing-hero landing-wrap">
      <p className="landing-kicker">Job search and tailored applications, in one place.</p>
      <h1>Upload your CV. Get relevant jobs. Tailor every application.</h1>
      <p>RoleRadar finds suitable roles across multiple markets and creates an ATS-ready CV and cover letter for each job.</p>
      <div className="landing-actions"><Link className="button" href="/upload">Upload CV</Link><Link className="button secondary" href="/dashboard">View demo</Link></div>
      <small>Private by default. Nothing is submitted automatically.</small>
    </section>

    <section className="journey-preview landing-wrap" aria-label="How RoleRadar works">
      <div className="journey-head"><span>1 · Your profile</span><span>2 · Relevant jobs</span><span>3 · Tailored application</span></div>
      <div className="journey-grid">
        <article><strong>{candidate.fullName}</strong><p>{candidate.currentRole} · {candidate.location}</p><div className="tag-row">{candidate.skills.slice(0, 4).map((skill) => <span key={skill}>{skill}</span>)}</div></article>
        <article className="mini-matches">{visibleMatches.slice(0, 2).map((match) => <div key={match.job.id}><span><strong>{match.job.title}</strong><em>● {match.band}</em></span><p>{match.job.company} · {match.job.locationText}</p></div>)}</article>
        <article className="mini-document"><p>CV tailored for {bestMatch.job.company.replace(" (fictional)", "")}</p><i /><i /><i /><i /><strong>ATS readiness {createDemoApplication(candidate, bestMatch.job).ats.overallScore} / 100</strong></article>
      </div>
    </section>

    <section id="how" className="landing-proof">
      <div className="landing-wrap proof-grid">
        <article><h2>Matches you can verify</h2><p>Every match is explained with evidence from your CV. Requirements we cannot confirm are marked, not hidden.</p><div className="evidence-list"><span><strong>Confirmed</strong> {candidate.yearsOfExperience} years of relevant experience</span><span><strong>Confirmed</strong> {candidate.skills.slice(0, 2).join(", ")}</span><span className="warning"><strong>Unverified</strong> Enterprise account experience</span></div></article>
        <article><h2>Alerts where you already are</h2><p>New strong matches arrive by email or WhatsApp. One tap opens the job—the whole flow works on your phone.</p><div className="alert-preview"><small>WhatsApp · 09:12</small>RoleRadar: A new strong match is available. <Link href="/matches">View job</Link></div><div className="alert-preview"><small>Email · 08:00</small><strong>4 new jobs match your profile</strong> — opportunities worth reviewing today.</div></article>
      </div>
    </section>

    <section id="trust" className="principles landing-wrap"><article><strong>Private by default</strong><p>Your CV is never shared. Delete it anytime.</p></article><article><strong>Nothing sent automatically</strong><p>You review and download every document, then apply through the original source.</p></article><article><strong>Facts only</strong><p>Documents use only information confirmed in your profile. Your experience is never invented.</p></article></section>
    <section className="landing-cta"><div className="landing-wrap"><h2>Start with the CV you already have.</h2><p>Free to try in demo mode. Review every fact before it is used.</p><Link className="button" href="/upload">Upload CV</Link></div></section>
    <footer className="landing-footer landing-wrap"><Logo /><p>{copy.tagline}</p><div><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/help">Help</Link></div><span>© 2026 RoleRadar</span></footer>
  </main>;
}

function AppShell({ screen, user, demoMode, children }: Props & { children: React.ReactNode }) {
  const displayName = user?.displayName ?? candidate.fullName;
  return <div className="app-frame">
    <aside className="sidebar">
      <div className="sidebar-head"><Logo /></div>
      <nav aria-label="Product">{productNav.map((item) => <SidebarLink key={item.href} item={item} active={screen === item.href.slice(1) || (item.href === "/tracker" && ["package", "done"].includes(screen))} />)}<p className="nav-label support-label">Account</p>{supportNav.map((item) => <SidebarLink key={item.href} item={item} active={screen === item.href.slice(1)} />)}</nav>
      <div className="profile-card"><span className="avatar">{displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2)}</span><div><strong>{displayName.split(" ")[0]}</strong><span>{demoMode ? "Fictional demo" : user?.email}</span></div></div>
    </aside>
    <div className="app-main">
      <header className="mobile-appbar"><Logo /><Link href="/notifications" aria-label="Notifications"><Bell /></Link></header>
      {children}
    </div>
    <nav className="bottom-nav" aria-label="Mobile navigation">{productNav.slice(0, 4).map(({ href, label, icon: Icon }) => <Link href={href} key={href} className={screen === href.slice(1) ? "active" : ""}><Icon /><span>{label.replace("Application ", "")}</span></Link>)}</nav>
  </div>;
}

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) { const Icon = item.icon; return <Link href={item.href} className={`side-link ${active ? "active" : ""}`}><Icon size={18} />{item.label}{item.label === "Job matches" && <span className="nav-count">8</span>}</Link>; }

function ScoreRing({ score, small = false }: { score: number; small?: boolean }) {
  return <div className={`score-ring ${small ? "small" : ""}`} style={{ "--score": `${score * 3.6}deg` } as React.CSSProperties}><div><strong>{score}</strong>{!small && <span>/100</span>}</div></div>;
}

function Dashboard() {
  return <AppContent narrow>
    <section className="dashboard-welcome"><h1>Good morning, {candidate.fullName.split(" ")[0]}</h1><p>Your search is in focus. 6 new jobs match your profile.</p><Link className="button" href="/matches">View today&apos;s matches</Link></section>
    <div className="dashboard-stats"><span><strong>2</strong> saved</span><span><strong>1</strong> application prepared</span><span><strong>1</strong> deadline this week — {bestMatch.job.company.replace(" (fictional)", "")}, 18 Aug</span></div>
    <section className="dashboard-matches"><h2>Top matches today</h2><div className="compact-list">{visibleMatches.slice(0, 3).map((match) => <CompactJob key={match.job.id} match={match} />)}</div></section>
    <p className="dashboard-tip">Tip: add your Salesforce Service Cloud experience to improve customer-success matches. <Link href="/profile">Update profile</Link></p>
    <p className="demo-disclaimer">All candidates, companies, vacancies, providers, and delivery events shown in demo mode are fictional.</p>
  </AppContent>;
}

function Metric({ value, label, note, accent = false }: { value: string; label: string; note: string; accent?: boolean }) { return <div className={`metric ${accent ? "accent" : ""}`}><div><strong>{value}</strong><span>{label}</span></div><p>{note}</p></div>; }
function PanelHead({ title, subtitle, href }: { title: string; subtitle?: string; href?: string }) { return <div className="panel-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{href && <Link href={href}>View all <ArrowRight size={15} /></Link>}</div>; }
function CompactJob({ match }: { match: MatchResult }) { return <Link className="compact-job" href={`/job?job=${match.job.id}`}><div><h3>{match.job.title}</h3><p>{match.job.company} · {match.job.locationText} · {match.job.workplace} · {formatSalary(match.job)}</p></div><span className={`match-state ${bandClass(match.band)}`}>● {match.band}</span></Link>; }

function applicationMethodCopy(job: Job) {
  if (job.applicationMethod === "native") return { label: "Apply in RoleRadar", title: "Apply without leaving RoleRadar", description: "This employer-authorized ATS connection supports verified in-app submission after you review every document.", action: "Submit in RoleRadar" };
  if (job.applicationMethod === "autofill") return { label: "Autofill available", title: "Autofill the employer form", description: "RoleRadar can hand your reviewed profile and documents to the assisted-apply extension. You still verify and submit on the employer form.", action: "Continue with autofill" };
  return { label: "Employer-site application", title: "Prepare here, apply on the company site", description: "RoleRadar prepares and downloads everything, then opens the original application. Submission is never claimed until you confirm it.", action: "Apply on company site" };
}

function ApplicationMethodBadge({ job }: { job: Job }) {
  return <span className={`application-method ${job.applicationMethod}`}><i />{applicationMethodCopy(job).label}</span>;
}

function MatchesScreen({ savedOnly = false }: { savedOnly?: boolean }) {
  const [query, setQuery] = useState("");
  const [workplace, setWorkplace] = useState("All work styles");
  const [tab, setTab] = useState<"Best matches" | "New" | "Saved" | "Not interested">(savedOnly ? "Saved" : "Best matches");
  const [showFilters, setShowFilters] = useState(false);
  const [saved, setSaved] = useState(new Set(visibleMatches.filter((_, index) => index === 1 || index === 3).map((match) => match.job.id)));
  const [rejected, setRejected] = useState(new Set<string>());
  const byTab = visibleMatches.filter((match) => {
    if (tab === "Saved") return saved.has(match.job.id) && !rejected.has(match.job.id);
    if (tab === "Not interested") return rejected.has(match.job.id);
    if (tab === "New") return match.job.publishedAt.includes("05T") && !rejected.has(match.job.id);
    return !rejected.has(match.job.id);
  });
  const filtered = byTab.filter((match) => (!query || `${match.job.title} ${match.job.company}`.toLowerCase().includes(query.toLowerCase())) && (workplace === "All work styles" || match.job.workplace === workplace));
  const setSavedJob = (jobId: string, nextSaved: boolean) => {
    setSaved((current) => { const next = new Set(current); if (nextSaved) next.add(jobId); else next.delete(jobId); return next; });
    void fetch("/api/saved-jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId, saved: nextSaved }) }).catch(() => undefined);
  };
  return <AppContent>
    <div className="matches-heading"><div><h1>{savedOnly ? "Saved jobs" : "Job matches"}</h1><p>{savedOnly ? "Roles you marked for a closer look." : "Selected from your verified profile and preferences."}</p></div><button className="filter-button" onClick={() => setShowFilters(!showFilters)}><Filter /> Filters · {workplace === "All work styles" ? 1 : 2}</button></div>
    {!savedOnly && <div className="feed-tabs">{(["Best matches", "New", "Saved", "Not interested"] as const).map((name) => <button key={name} className={tab === name ? "active" : ""} onClick={() => setTab(name)}>{name} <span>{name === "Saved" ? saved.size : name === "Not interested" ? rejected.size : name === "New" ? visibleMatches.filter((match) => match.job.publishedAt.includes("05T")).length : visibleMatches.length}</span></button>)}</div>}
    {showFilters && <div className="filter-bar"><label className="search-input"><Search /><input aria-label="Search roles" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title or company" /></label><label className="select-wrap"><BriefcaseBusiness /><select value={workplace} onChange={(event) => setWorkplace(event.target.value)} aria-label="Work style"><option>All work styles</option><option>Remote</option><option>Hybrid</option><option>On-site</option></select><ChevronDown /></label><button className="filter-reset" onClick={() => { setQuery(""); setWorkplace("All work styles"); }}>Reset</button></div>}
    {!filtered.length ? <EmptyState icon={Bookmark} title="Nothing here yet" text={tab === "Saved" ? "Save a match and it will appear here." : "Try a broader filter to see more roles."} action="View best matches" href="/matches" /> : <section className="match-list" aria-label="Matching jobs">{filtered.map((match) => <article key={match.job.id} className="match-list-item"><div className="match-list-copy"><h2>{match.job.title}</h2><small>{match.job.company} · {match.job.locationText} · {match.job.workplace} · {relativeDate(match.job.publishedAt)}</small><p>{match.explanation}</p><span className="match-proof"><CheckCircle2 /> {match.matchedSkills.slice(0, 3).join(", ")}</span></div><div className="match-list-next"><div className="match-list-labels"><em className={`match-state ${bandClass(match.band)}`}>● {match.band}</em><ApplicationMethodBadge job={match.job} /></div><Link className="button button-small" href={`/job?job=${match.job.id}`}>View job <ArrowRight /></Link><div><button className={saved.has(match.job.id) ? "saved" : ""} onClick={() => setSavedJob(match.job.id, !saved.has(match.job.id))}>{saved.has(match.job.id) ? "Saved" : "Save"}</button><button onClick={() => setRejected((current) => new Set(current).add(match.job.id))}>Not interested</button></div></div></article>)}</section>}
  </AppContent>;
}

function JobDetail({ jobId }: { jobId?: string }) {
  const match = rankedMatches.find((item) => item.job.id === jobId) ?? bestMatch;
  const method = applicationMethodCopy(match.job);
  const [saved, setSaved] = useState(false);
  return <AppContent narrow>
    <Link href="/matches" className="back-link"><ArrowLeft /> Back to matches</Link>
    <section className="job-detail-hero"><div className="job-detail-main"><CompanyMark name={match.job.company} large /><div><p className="kicker">{match.job.providerName} · FICTIONAL DEMO ROLE</p><h1>{match.job.title}</h1><p className="company-name">{match.job.company}</p><div className="job-meta"><span><MapPin />{match.job.locationText}</span><span><BriefcaseBusiness />{match.job.workplace}</span><span><Clock3 />{relativeDate(match.job.publishedAt)}</span></div></div></div><div className="detail-actions"><Link className="button button-small" href={`/generating?job=${match.job.id}`}>Create application <ArrowRight /></Link><button className={`icon-text ${saved ? "saved" : ""}`} onClick={() => setSaved(!saved)}><Bookmark fill={saved ? "currentColor" : "none"} />{saved ? "Saved" : "Save"}</button></div></section>
    <div className="detail-layout"><div className="detail-content">
      <section className="match-hero panel"><div className="match-score-large"><ScoreRing score={match.score} /><div><span className={`match-label ${bandClass(match.band)}`}>{match.band}</span><h2>Why this job matches you</h2></div></div><p>{match.explanation}</p><div className="requirement-columns"><div><h3><CheckCircle2 /> Requirements you meet</h3>{match.matchedSkills.map((skill) => <p key={skill}><Check />{skill}<span>Verified in your profile</span></p>)}</div><div><h3><CircleHelp /> Possible gaps</h3>{match.gaps.map((gap) => <p key={gap}><CircleHelp />{gap}<span>Not confirmed</span></p>)}</div></div></section>
      <DetailSection title="What you’ll do">{match.job.responsibilities.map((item) => <li key={item}>{item}</li>)}</DetailSection>
      <DetailSection title="Requirements">{match.job.requirements.map((item) => <li key={item.value}><strong>{item.value}</strong> — {item.mandatory ? "required" : "preferred"}<small>Evidence confidence {Math.round(item.confidence * 100)}%</small></li>)}</DetailSection>
      <section className="detail-section"><h2>Original description</h2><p>{match.job.description}</p><p className="source-note"><ShieldCheck /> Description is rendered as sanitized text and preserved separately from normalized fields.</p></section>
    </div><aside className="detail-sidebar"><section className="apply-card"><ApplicationMethodBadge job={match.job} /><h2>{method.title}</h2><p>{method.description}</p><Link className="button" href={`/generating?job=${match.job.id}`}>Create application <ArrowRight /></Link><a className="apply-secondary" href={match.job.originalUrl} target="_blank" rel="noreferrer">View original job <ExternalLink /></a><small>Nothing is submitted before your final confirmation.</small></section><section className="facts-card"><h3>Role at a glance</h3><Fact label="Salary" value={formatSalary(match.job)} /><Fact label="Work style" value={match.job.workplace} /><Fact label="Employment" value={match.job.employmentType} /><Fact label="Visa sponsorship" value={match.job.visaSponsorship === null ? "Not stated" : match.job.visaSponsorship ? "Available" : "Not available"} /><Fact label="Closes" value={match.job.expiresAt ? "30 September" : "Not provided"} /></section></aside></div>
  </AppContent>;
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="detail-section"><h2>{title}</h2><ul>{children}</ul></section>; }
function Fact({ label, value }: { label: string; value: string }) { return <div className="fact"><span>{label}</span><strong>{value}</strong></div>; }

function UploadScreen({ stage = "upload" }: { stage?: "upload" | "processing" | "profile" | "preferences" }) {
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
      router.push("/processing");
    } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : "We could not upload that file."); setUploading(false); }
  };
  if (stage === "processing") return <OnboardingFrame step={1}><div className="processing-card"><p className="eyebrow">READING YOUR CV</p><h1>Turning your experience into a factual profile</h1><p>We are organizing roles, skills, education, and languages so you can verify everything next.</p><div className="progress-list"><p className="done"><CheckCircle2 /> File validated <span>Complete</span></p><p className="done"><CheckCircle2 /> Text extracted <span>Complete</span></p><p className="active"><RefreshCw /> Organizing your skills <span>In progress</span></p><p><CircleHelp /> Preparing your job profile <span>Waiting</span></p></div><Link className="button" href="/profile-review">Review profile <ArrowRight /></Link></div></OnboardingFrame>;
  if (stage === "profile") return <ProfileReview />;
  if (stage === "preferences") return <Preferences />;
  return <OnboardingFrame step={1}><div className="upload-layout"><div><h1>Upload your current CV</h1><p className="onboarding-lead">We&apos;ll turn it into a profile you can review before any information is used.</p><div className={`dropzone ${file ? "has-file" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); setFile(event.dataTransfer.files?.[0] ?? null); }}><input ref={fileInput} type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />{file ? <><FileCheck2 /><strong>{file.name}</strong><span>{Math.max(1, Math.round(file.size / 1024))} KB · ready to upload</span><button type="button" onClick={() => fileInput.current?.click()}>Choose another file</button></> : <><UploadCloud /><strong>Drop your CV here</strong><span>PDF, DOCX, or TXT · maximum 10 MB</span><button type="button" className="button" onClick={() => fileInput.current?.click()}>Choose file</button></>}</div>{error && <p className="form-error" role="alert">{error}</p>}<label className="consent-check"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span><strong>I agree to secure AI processing</strong><small>Used only to extract your profile and create applications you request. <Link href="/privacy">Learn more</Link></small></span></label><button disabled={!file || !consent || uploading} className="button full" onClick={upload}>{uploading ? "Uploading…" : "Upload and continue"}<ArrowRight /></button><p className="upload-privacy">Private by default. Delete your CV anytime.</p></div></div></OnboardingFrame>;
}

function OnboardingFrame({ step, children }: { step: number; children: React.ReactNode }) { return <main className="onboarding"><header><Logo /><Link href="/help">Need help?</Link></header><div className="onboarding-progress"><span className={step >= 1 ? "active" : ""}>1 <em>Upload CV</em></span><i /><span className={step >= 2 ? "active" : ""}>2 <em>Review profile</em></span><i /><span className={step >= 3 ? "active" : ""}>3 <em>Set preferences</em></span><i /><span className={step >= 4 ? "active" : ""}>4 <em>Matches</em></span></div>{children}<footer><ShieldCheck /> Private by default. Nothing is submitted automatically.</footer></main>; }

function ProfileReview() {
  const [verified, setVerified] = useState(new Set(candidate.facts.filter((fact) => fact.verifiedByUser).map((fact) => fact.id)));
  return <OnboardingFrame step={2}><div className="review-wrap"><div className="review-heading"><div><p className="eyebrow">ALMOST THERE</p><h1>Does this look like you?</h1><p>Confirm the facts we extracted. Only approved information is used to tailor applications.</p></div><div className="review-score"><strong>92%</strong><span>extraction confidence</span></div></div><section className="review-section"><PanelHead title="Professional profile" subtitle="Extracted from Anna_Bianchi_CV.pdf" /><div className="fact-list">{candidate.facts.map((fact) => <div className="extracted-fact" key={fact.id}><button className={verified.has(fact.id) ? "verified" : ""} onClick={() => setVerified((current) => new Set(current).add(fact.id))}>{verified.has(fact.id) ? <Check /> : <CircleHelp />}</button><div><span>{fact.label}</span><strong>{fact.value}</strong><small>“{fact.sourceText}” · {Math.round(fact.confidence * 100)}% confidence</small></div><button aria-label={`Edit ${fact.label}`}><PencilLine /></button></div>)}</div></section><section className="review-section"><PanelHead title="Skills" subtitle="Choose a level now or leave it unspecified" /><div className="skill-editor">{candidate.skills.map((skill, index) => <div key={skill}><span>{skill}</span><select aria-label={`${skill} level`} defaultValue={index < 3 ? "advanced" : "unspecified"}><option value="unspecified">Level not set</option><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select><CheckCircle2 /></div>)}</div></section><div className="sticky-review"><p><ShieldCheck /> {verified.size} facts confirmed · unconfirmed facts will not be used</p><Link className="button" href="/preferences">Confirm profile <ArrowRight /></Link></div></div></OnboardingFrame>;
}

function Preferences() {
  const [workstyles, setWorkstyles] = useState(new Set(["Remote", "Hybrid"]));
  return <OnboardingFrame step={3}><div className="preferences-wrap"><p className="eyebrow">SHAPE YOUR SEARCH</p><h1>What should RoleRadar look for?</h1><p className="onboarding-lead">Start simple. You can fine-tune advanced preferences later.</p><section className="preference-section"><h2>Where would you like to work?</h2><div className="choice-grid"><Choice icon={Home} label="Remote" selected={workstyles.has("Remote")} onClick={() => toggleSet(workstyles, setWorkstyles, "Remote")} /><Choice icon={Building2} label="Hybrid" selected={workstyles.has("Hybrid")} onClick={() => toggleSet(workstyles, setWorkstyles, "Hybrid")} /><Choice icon={MapPin} label="On-site" selected={workstyles.has("On-site")} onClick={() => toggleSet(workstyles, setWorkstyles, "On-site")} /></div></section><section className="preference-section"><h2>Target locations</h2><label className="token-input"><Globe2 /><span>Italy <button aria-label="Remove Italy"><X /></button></span><span>Spain <button aria-label="Remove Spain"><X /></button></span><input aria-label="Add country" placeholder="Add a country" /></label></section><section className="preference-section"><h2>Roles you’re interested in</h2><label className="field-label">Target titles<textarea defaultValue={candidate.targetTitles.join("\n")} /></label></section><details className="advanced-preferences"><summary>Advanced preferences <ChevronDown /></summary><div className="advanced-grid"><label>Minimum annual salary<input type="number" defaultValue="34000" /></label><label>Currency<select><option>EUR</option><option>GBP</option><option>USD</option></select></label><label><input type="checkbox" /> I need visa sponsorship</label><label><input type="checkbox" /> I am open to relocation</label></div></details><div className="sticky-review"><p><ShieldCheck /> You can change these preferences anytime.</p><Link className="button" href="/dashboard">Find my matches <Radar /></Link></div></div></OnboardingFrame>;
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
  return <AppContent narrow><Link className="back-link" href={`/job?job=${match.job.id}`}><ArrowLeft /> Back to job</Link><section className="application-setup"><p className="flow-step">Step 1 of 3 · Choose documents</p><h1>Prepare your application</h1><p>Select what you want RoleRadar to tailor for this job.</p><small>{match.job.title} · {match.job.company}</small><div className="document-options">{options.map(([key, title, description]) => <button key={key} onClick={() => setDocuments((current) => ({ ...current, [key]: !current[key] }))}><span className={documents[key] ? "checked" : ""}>{documents[key] ? <Check /> : null}</span><div><strong>{title}</strong><p>{description}</p></div></button>)}</div><p className="grounding-note"><ShieldCheck /> We only use information confirmed in your profile. Experience is never invented.</p><Link aria-disabled={!Object.values(documents).some(Boolean)} className={`button full ${!Object.values(documents).some(Boolean) ? "disabled" : ""}`} href={`/generating?job=${match.job.id}`}>Create my application <ArrowRight /></Link></section></AppContent>;
}

function Generating({ jobId }: { jobId?: string }) {
  const router = useRouter();
  const match = rankedMatches.find((item) => item.job.id === jobId) ?? bestMatch;
  const [step, setStep] = useState(0);
  const steps = ["Reading the job requirements", "Matching your verified experience", "Drafting your documents", "Running ATS checks"];
  useEffect(() => {
    void fetch("/api/applications/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId: match.job.id, tone: "Professional" }) }).catch(() => undefined);
    const interval = window.setInterval(() => setStep((current) => Math.min(steps.length, current + 1)), 550);
    const timeout = window.setTimeout(() => router.push(`/workspace?job=${match.job.id}`), 2900);
    return () => { window.clearInterval(interval); window.clearTimeout(timeout); };
  }, [match.job.id, router, steps.length]);
  return <AppContent narrow><section className="generation-card"><h1>Preparing your documents</h1><p>{match.job.title} · {match.job.company}</p><div>{steps.map((label, index) => <span key={label} className={index < step ? "done" : index === step ? "active" : ""}>{index < step ? <Check /> : index === step ? <RefreshCw /> : <i />} {label}</span>)}</div></section></AppContent>;
}

function AtsAnalysis({ jobId }: { jobId?: string }) {
  const match = rankedMatches.find((item) => item.job.id === jobId) ?? bestMatch;
  const application = createDemoApplication(candidate, match.job);
  const scores = [["Required keyword coverage", application.ats.requiredKeywordCoverage], ["Preferred keyword coverage", application.ats.preferredKeywordCoverage], ["Formatting quality", application.ats.formattingScore], ["Factual integrity", application.ats.factualIntegrityScore]] as const;
  return <AppContent narrow><section className="ats-analysis"><div className="ats-heading"><div><h1>Full ATS analysis</h1><p>{application.ats.disclaimer}</p></div><Link className="secondary-action" href={`/job?job=${match.job.id}`}>View job <ExternalLink /></Link></div><small>{match.job.title} · {match.job.company}</small><div className="ats-result"><strong>{application.ats.overallScore}</strong><span>/ 100 · ready for your review</span></div><div className="ats-analysis-grid"><section className="panel score-list">{scores.map(([label, value]) => <ScoreBar key={label} label={label} value={value} />)}</section><section className="recommendations"><h2>What to check</h2><div><p><strong>HIGH</strong>Add stakeholder-management evidence only if it appears in your verified profile.</p><p><strong>MEDIUM</strong>Move the strongest matching skills higher in your CV.</p><p><strong>INFO</strong>RoleRadar did not add any experience it could not verify.</p></div><div className="ats-actions"><Link className="button" href={`/workspace?job=${match.job.id}`}>Back to application <ArrowLeft /></Link></div></section></div></section></AppContent>;
}

function Studio({ jobId }: { jobId?: string }) {
  const match = rankedMatches.find((item) => item.job.id === jobId) ?? bestMatch;
  const application = useMemo(() => createDemoApplication(candidate, match.job), [match.job]);
  const method = applicationMethodCopy(match.job);
  const [tab, setTab] = useState<"cv" | "cover" | "email" | "interview">("cv");
  const [view, setView] = useState<"tailored" | "original" | "changes">("tailored");
  const [summary, setSummary] = useState(application.summary);
  const [showSubmit, setShowSubmit] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const submitNativeApplication = async () => {
    if (!confirmed || submitting) return;
    setSubmitting(true); setSubmitError("");
    const response = await fetch("/api/applications/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId: match.job.id, confirmed: true }) }).catch(() => null);
    if (!response?.ok) { const body = await response?.json().catch(() => null) as { error?: string } | null; setSubmitError(body?.error ?? "Submission could not be confirmed."); setSubmitting(false); return; }
    setSubmitted(true); setSubmitting(false); setShowSubmit(false);
  };
  const applyAction = (mobile = false) => match.job.applicationMethod === "native"
    ? <button className={`button ${mobile ? "" : "button-small"}`} disabled={submitted} onClick={() => setShowSubmit(true)}>{submitted ? <><CheckCircle2 /> Submitted</> : <>{method.action} <ArrowRight /></>}</button>
    : <a className={`button ${mobile ? "" : "button-small"}`} href={match.job.originalUrl} target="_blank" rel="noreferrer">{method.action} <ExternalLink /></a>;
  return <div className="studio-shell"><header className="studio-top"><Link href={`/job?job=${match.job.id}`} className="back-link"><ArrowLeft /> Back to job</Link><div><span>Application for</span><strong>{match.job.title} · {match.job.company}</strong></div><div className="studio-quick-actions"><a className="secondary-action" href={`/api/documents/pdf?job=${match.job.id}`} download><Download /> Download CV</a>{applyAction()}</div></header><div className="studio-ready"><div><ApplicationMethodBadge job={match.job} /><span><CheckCircle2 /><strong>{submitted ? "Application submitted" : "Application ready"}</strong><small>{submitted ? "Confirmed by the demo Direct ATS connection" : `ATS estimate ${application.ats.overallScore}/100 · factual check passed`}</small></span></div><Link href={`/ats?job=${match.job.id}`}>View full analysis <ArrowRight /></Link></div><div className="studio-body"><aside className="studio-nav"><p className="nav-label">YOUR APPLICATION</p><button className={tab === "cv" ? "active" : ""} onClick={() => setTab("cv")}><FileText /> Tailored CV <span>82</span></button><button className={tab === "cover" ? "active" : ""} onClick={() => setTab("cover")}><Heart /> Cover letter <CheckCircle2 /></button><button className={tab === "email" ? "active" : ""} onClick={() => setTab("email")}><Mail /> Application email <CheckCircle2 /></button><button className={tab === "interview" ? "active" : ""} onClick={() => setTab("interview")}><MessageCircle /> Interview prep <CheckCircle2 /></button><div className="truth-card"><ShieldCheck /><strong>Grounded in your profile</strong><p>Every claim traces to verified experience.</p><Link href="/profile">View sources</Link></div></aside><main className="editor-main">
      {tab === "cv" && <><div className="editor-head"><div><p className="kicker">TAILORED CV</p><h1>Make the match easy to see.</h1><p>Optimized for relevance while preserving your facts and chronology.</p></div><div className="editor-actions"><button><RefreshCw /> Regenerate</button><button><MoreHorizontal /></button></div></div><div className="view-tabs"><button className={view === "original" ? "active" : ""} onClick={() => setView("original")}>Original</button><button className={view === "tailored" ? "active" : ""} onClick={() => setView("tailored")}>Tailored</button><button className={view === "changes" ? "active" : ""} onClick={() => setView("changes")}>Changes <span>7</span></button></div><div className="editor-layout"><section className="document-paper"><div className="document-name"><h2>{candidate.fullName}</h2><p>{candidate.currentRole}</p><span>{candidate.location} · {candidate.email} · {candidate.phone}</span></div><DocumentSection title="Professional Summary"><textarea aria-label="Professional summary" value={view === "original" ? demoDocument.originalSummary : summary} onChange={(event) => setSummary(event.target.value)} /><p className="source-chip"><ShieldCheck /> Supported by 4 verified facts</p></DocumentSection><DocumentSection title="Work Experience"><h4>{candidate.experiences[0].role}</h4><p className="document-meta">{candidate.experiences[0].company} · Mar 2022 — Present</p><ul>{application.cvBullets.slice(0, 3).map((bullet) => <li key={bullet.text}>{bullet.text}<button aria-label="Edit bullet"><PencilLine /></button></li>)}</ul></DocumentSection><DocumentSection title="Skills"><p>{candidate.skills.join(" · ")}</p></DocumentSection><DocumentSection title="Education"><p>{candidate.education[0]}</p></DocumentSection></section><aside className="ats-panel"><div className="ats-score"><ScoreRing score={application.ats.overallScore} /><div><span>{application.ats.label}</span><strong>Ready for review</strong></div></div><p className="ats-disclaimer">{application.ats.disclaimer}</p><div className="score-bars"><ScoreBar label="Required keywords" value={application.ats.requiredKeywordCoverage} /><ScoreBar label="Preferred keywords" value={application.ats.preferredKeywordCoverage} /><ScoreBar label="Formatting" value={application.ats.formattingScore} /><ScoreBar label="Factual integrity" value={application.ats.factualIntegrityScore} /></div><div className="ats-tip"><Sparkles /><div><strong>One improvement</strong><p>Add “SaaS onboarding” only if it reflects real experience. It is not currently verified.</p></div></div><button className="text-button">Open full ATS analysis <ArrowRight /></button></aside></div></>}
      {tab === "cover" && <DocumentEditor title="Cover letter" kicker="250–400 WORDS · PROFESSIONAL" content={application.coverLetter} />}
      {tab === "email" && <EmailEditor subject={application.email.subject} body={application.email.body} />}
      {tab === "interview" && <InterviewEditor application={application} />}
    </main></div><div className="studio-mobile-action"><a className="secondary-action" href={`/api/documents/pdf?job=${match.job.id}`} download><Download /> CV</a>{applyAction(true)}</div>{showSubmit && <div className="submit-overlay"><section className="submit-dialog" role="dialog" aria-modal="true" aria-labelledby="submit-title"><button className="submit-close" onClick={() => setShowSubmit(false)} aria-label="Close submission confirmation"><X /></button><ApplicationMethodBadge job={match.job} /><h2 id="submit-title">Submit this application?</h2><p>RoleRadar will send your reviewed profile, tailored CV, cover letter and answers to {match.job.company} through its authorized {match.job.providerName} connection.</p><div className="submit-summary"><span><FileText /><strong>Tailored CV</strong>Attached</span><span><Heart /><strong>Cover letter</strong>Attached</span><span><ShieldCheck /><strong>Factual check</strong>Passed</span></div><label className="submit-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span><strong>I reviewed this application</strong><small>Submit only the information shown in this workspace.</small></span></label>{submitError && <p className="form-error" role="alert">{submitError}</p>}<div className="submit-actions"><button className="secondary-action" onClick={() => setShowSubmit(false)}>Cancel</button><button className="button" disabled={!confirmed || submitting} onClick={submitNativeApplication}>{submitting ? "Submitting…" : "Submit application"}</button></div><small className="submit-demo-note">Fictional demo: no real employer receives this application. Production submission requires an employer-authorized ATS connection.</small></section></div>}</div>;
}

function DocumentSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="document-section"><h3>{title}</h3>{children}</section>; }
function ScoreBar({ label, value }: { label: string; value: number }) { return <div><span>{label}<strong>{value}%</strong></span><i><em style={{ width: `${value}%` }} /></i></div>; }
function DocumentEditor({ title, kicker, content }: { title: string; kicker: string; content: string }) { const [text, setText] = useState(content); return <><div className="editor-head"><div><p className="kicker">{kicker}</p><h1>{title}</h1><p>Edit freely, change tone, or regenerate one paragraph.</p></div><div className="tone-select">Tone <select><option>Professional</option><option>Direct</option><option>Warm</option><option>Concise</option></select></div></div><section className="letter-paper"><textarea value={text} onChange={(event) => setText(event.target.value)} aria-label={title} /><div className="document-footer"><span>{text.trim().split(/\s+/).length} words</span><span><ShieldCheck /> Claims grounded</span><button><RefreshCw /> Restore previous</button></div></section></>; }
function EmailEditor({ subject, body }: { subject: string; body: string }) { return <><div className="editor-head"><div><p className="kicker">CONCISE · READY TO EDIT</p><h1>Application email</h1><p>A short note to send with your tailored documents.</p></div></div><section className="email-paper"><label>Subject<input defaultValue={subject} /></label><label>Message<textarea defaultValue={body} /></label><div className="attachment-reminder"><FileText /><div><strong>Before sending</strong><p>Attach the tailored CV and cover letter from your package.</p></div></div></section></>; }
function InterviewEditor({ application }: { application: ReturnType<typeof createDemoApplication> }) { return <><div className="editor-head"><div><p className="kicker">JOB-SPECIFIC PREPARATION</p><h1>Walk in with a clear story.</h1><p>Prompts use your verified experience. They never fabricate answers.</p></div></div><div className="prep-grid"><PrepList number="01" title="Likely questions" items={application.interview.likelyQuestions} /><PrepList number="02" title="Address possible gaps" items={application.interview.gapQuestions} /><PrepList number="03" title="STAR story prompts" items={application.interview.starPrompts} /><PrepList number="04" title="Questions to ask" items={application.interview.questionsToAsk} /></div></>; }
function PrepList({ number, title, items }: { number: string; title: string; items: string[] }) { return <section className="prep-list"><span>{number}</span><h2>{title}</h2>{items.map((item) => <p key={item}>{item}</p>)}</section>; }

function PackageScreen({ jobId }: { jobId?: string }) {
  const match = rankedMatches.find((item) => item.job.id === jobId) ?? bestMatch;
  return <AppContent narrow><Link href={`/workspace?job=${match.job.id}`} className="back-link"><ArrowLeft /> Back to review</Link><PageIntro eyebrow="STEP 3 OF 3 · DOWNLOAD & APPLY" title="Your application is ready" subtitle={`${match.job.title} · ${match.job.company} · ATS estimate ${createDemoApplication(candidate, match.job).ats.overallScore}/100`} /><div className="package-layout"><section className="panel package-list"><PackageItem icon={FileText} title="Tailored CV" note={`RoleRadar ATS estimate ${createDemoApplication(candidate, match.job).ats.overallScore}/100 · Version 2`} formats={["PDF", "DOCX", "TXT"]} jobId={match.job.id} /><PackageItem icon={Heart} title="Cover letter" note="Professional tone · 287 words · Version 1" formats={["PDF", "DOCX", "TXT"]} jobId={match.job.id} /><PackageItem icon={Mail} title="Application email" note="Subject and concise message" formats={["TXT"]} jobId={match.job.id} /><PackageItem icon={MessageCircle} title="Interview preparation" note="10 questions · 3 STAR prompts" formats={["PDF", "TXT"]} jobId={match.job.id} /></section><aside className="manual-apply"><p className="kicker">FINAL STEP</p><h2>Apply on the company site</h2><ol><li>Download the documents you need.</li><li>Open the original job page.</li><li>Return here and mark it applied.</li></ol><a className="button" href={match.job.originalUrl} target="_blank" rel="noreferrer">Apply on company site <ExternalLink /></a><label><input type="checkbox" /> Mark this application as submitted</label><small>RoleRadar never submits anything automatically.</small></aside></div></AppContent>;
}
function PackageItem({ icon: Icon, title, note, formats, jobId }: { icon: LucideIcon; title: string; note: string; formats: string[]; jobId: string }) { return <article className="package-item"><div className="package-icon"><Icon /></div><div><h2>{title}</h2><p>{note}</p><span><ShieldCheck /> Factual validation passed</span></div><div className="format-actions">{formats.map((format) => <a key={format} href={`/api/documents/${format.toLowerCase()}?job=${jobId}`} download>{format}<Download /></a>)}</div></article>; }

function Tracker() {
  const rows = [
    { status: "Interview", role: "Customer Success Specialist", company: "Northstar Loom (fictional)", date: "Interview · 8 Aug", next: "Review STAR stories", tone: "purple" },
    { status: "Applied", role: "Support Quality Lead", company: "Kiteframe Systems (fictional)", date: "Applied · 3 Aug", next: "Follow up 10 Aug", tone: "blue" },
    { status: "Application prepared", role: "Customer Operations Analyst", company: "Forma Harbor (fictional)", date: "Updated today", next: "Review and submit", tone: "gold" },
    { status: "Interested", role: "Customer Journey Specialist", company: "Sundial Works (fictional)", date: "Saved · 2 Aug", next: "Create application", tone: "green" },
  ];
  return <AppContent><PageIntro eyebrow="YOUR PIPELINE" title="Application tracker" subtitle="The essentials, without the recruiting-software clutter." action={<button className="button"><BriefcaseBusiness /> Add application</button>} /><div className="tracker-summary"><span><strong>1</strong> Interested</span><span><strong>1</strong> Prepared</span><span><strong>1</strong> Applied</span><span><strong>1</strong> Interview</span><span><strong>0</strong> Offer</span></div><section className="panel tracker-list"><div className="tracker-head"><span>Opportunity</span><span>Status</span><span>Next action</span><span /></div>{rows.map((row) => <article key={row.role}><CompanyMark name={row.company} /><div><strong>{row.role}</strong><span>{row.company}</span></div><div><span className={`status ${row.tone}`}>{row.status}</span><small>{row.date}</small></div><div><strong>{row.next}</strong><span><CalendarDays /> Set reminder</span></div><button aria-label="More actions"><MoreHorizontal /></button></article>)}</section></AppContent>;
}

function DocumentsScreen() { return <AppContent><PageIntro eyebrow="VERSIONED & EDITABLE" title="Your documents" subtitle="Every original, tailored version, and grounded source stays organized." action={<Link className="button" href={`/generating?job=${bestMatch.job.id}`}><WandSparkles /> Create application</Link>} /><div className="document-filters"><button className="active">All documents <span>7</span></button><button>Tailored CVs <span>3</span></button><button>Cover letters <span>2</span></button><button>Emails <span>2</span></button></div><div className="documents-grid">{visibleMatches.slice(0, 3).map((match, index) => <article className="document-tile" key={match.job.id}><div className="doc-preview"><FileText /><span>CV</span><div className="fake-lines"><i /><i /><i /><i /></div></div><div><span className="match-label green">Version {index + 1}</span><h2>{match.job.title}</h2><p>{match.job.company}</p><small>Updated {index ? `${index + 1} days ago` : "today"}</small><div><a href={`/api/documents/pdf?job=${match.job.id}`}><Download /> Download</a><Link href={`/workspace?job=${match.job.id}`}><PencilLine /> Edit</Link></div></div></article>)}</div></AppContent>; }

function Notifications() { const [email, setEmail] = useState(true); const [whatsapp, setWhatsapp] = useState(false); return <AppContent narrow><PageIntro eyebrow="USEFUL, NOT NOISY" title="Notification settings" subtitle="Choose which opportunities deserve to interrupt your day." /><div className="settings-layout"><section className="panel settings-panel"><h2>Channels</h2><SettingToggle icon={Mail} title="Email alerts" text="Daily digest and time-sensitive reminders" enabled={email} setEnabled={setEmail} /><SettingToggle icon={MessageCircle} title="WhatsApp alerts" text="Strong matches only · explicit opt-in required" enabled={whatsapp} setEnabled={setWhatsapp} /><div className="consent-note"><ShieldCheck /><p>WhatsApp is off by default. A verified number and explicit consent are required before any message can be sent. Demo deliveries are simulated.</p></div></section><section className="panel settings-panel"><h2>Relevance rules</h2><label className="settings-field">Notify me for<select defaultValue="strong"><option value="strong">Excellent and Strong matches</option><option>Excellent matches only</option><option>Possible matches and above</option></select></label><label className="settings-field">Email frequency<select defaultValue="daily"><option value="daily">Daily digest</option><option>Instant strong matches</option><option>Weekly summary</option></select></label><div className="settings-columns"><label>Quiet hours start<input type="time" defaultValue="21:00" /></label><label>Quiet hours end<input type="time" defaultValue="08:00" /></label></div><label className="settings-field">Daily cap<input type="number" min="0" max="10" defaultValue="2" /></label></section><button className="button settings-save"><Check /> Save preferences</button></div></AppContent>; }
function SettingToggle({ icon: Icon, title, text, enabled, setEnabled }: { icon: LucideIcon; title: string; text: string; enabled: boolean; setEnabled: (value: boolean) => void }) { return <div className="setting-toggle"><span><Icon /></span><div><strong>{title}</strong><p>{text}</p></div><button aria-label={`Toggle ${title}`} className={enabled ? "on" : ""} onClick={() => setEnabled(!enabled)}><i /></button></div>; }

function Admin() { const providers = [
  ["Direct ATS", "Healthy", "2 min ago", "9", "118 ms"], ["Atlas Jobs API", "Healthy", "8 min ago", "6", "164 ms"], ["EURES demo feed", "Healthy", "21 min ago", "5", "302 ms"], ["Public Jobs JSON", "Degraded", "34 min ago", "4", "842 ms"], ["Civic Careers Feed", "Offline", "2 hours ago", "0", "—"],
]; return <AppContent><PageIntro eyebrow="PROTECTED ADMIN" title="Provider health" subtitle="Operational visibility without access to private user documents." /><div className="admin-metrics"><Metric value="5" label="providers enabled" note="3 healthy · 1 degraded" /><Metric value="30" label="jobs imported" note="last scheduled run" /><Metric value="6.7%" label="duplicate rate" note="2 roles grouped" /><Metric value="0" label="AI validation errors" note="past 24 hours" /></div><section className="panel provider-table"><div className="table-head"><span>Provider</span><span>Health</span><span>Last success</span><span>Imported</span><span>Latency</span></div>{providers.map(([name, health, last, count, latency]) => <div key={name}><strong>{name}</strong><span className={`health ${health.toLowerCase()}`}><i />{health}</span><span>{last}</span><span>{count}</span><span>{latency}</span></div>)}</section><div className="admin-grid"><section className="panel"><PanelHead title="Delivery health" subtitle="Simulated in demo mode" /><Fact label="Email" value="Healthy · 12 delivered" /><Fact label="WhatsApp" value="Demo · 3 simulated" /><Fact label="Failed deliveries" value="0" /></section><section className="panel"><PanelHead title="Processing queues" subtitle="Replaceable queue adapter" /><Fact label="Ingestion" value="Idle" /><Fact label="Document generation" value="0 waiting" /><Fact label="Dead-letter queue" value="0 records" /></section></div></AppContent>; }

function AuthScreen({ mode }: { mode: "sign-in" | "sign-up" | "forgot-password" }) { const title = mode === "sign-in" ? "Welcome back" : mode === "sign-up" ? "Create your RoleRadar account" : "Reset your password"; return <main className="auth-page"><div className="auth-brand"><Logo /><div><p className="eyebrow light">YOUR SEARCH, IN FOCUS</p><h1>One verified profile.<br />A world of relevant roles.</h1><p>Private by default. Factual by design. You stay in control of every application.</p></div><span><ShieldCheck /> Nothing is ever submitted automatically.</span></div><div className="auth-form"><Link href="/" className="back-link"><ArrowLeft /> Back home</Link><div><h1>{title}</h1><p>{mode === "forgot-password" ? "Enter your email and we’ll send a secure reset link." : mode === "sign-in" ? "Continue to your private job-search workspace." : "Start with your email. Your first CV stays private."}</p></div>{mode !== "forgot-password" && <Link href="/signin-with-chatgpt?return_to=%2Fdashboard" className="chatgpt-button"><Sparkles /> Continue securely with ChatGPT</Link>}<div className="auth-divider"><span>or use email</span></div><label>Email address<input type="email" placeholder="you@example.com" /></label>{mode !== "forgot-password" && <label>Password<span>{mode === "sign-in" && <Link href="/forgot-password">Forgot password?</Link>}</span><input type="password" placeholder="At least 12 characters" /></label>}<Link className="button full" href={mode === "forgot-password" ? "/sign-in" : mode === "sign-up" ? "/upload" : "/dashboard"}>{mode === "forgot-password" ? "Send reset link" : mode === "sign-up" ? "Create account" : "Sign in"}<ArrowRight /></Link><p className="auth-switch">{mode === "sign-in" ? <>New to RoleRadar? <Link href="/sign-up">Create an account</Link></> : mode === "sign-up" ? <>Already have an account? <Link href="/sign-in">Sign in</Link></> : <Link href="/sign-in">Return to sign in</Link>}</p><small className="auth-note">Hosted identity uses secure, dispatch-owned sign-in. Email/password and Google adapters remain in demo mode until a production identity provider is configured.</small></div></main>; }

function StaticScreen({ screen }: { screen: string }) { const content: Record<string, [string, string, string[]]> = {
  privacy: ["Privacy", "Your career history deserves careful handling.", ["Private CV and document storage", "Explicit AI-processing and notification consent", "Data export and deletion controls", "No raw CV text in analytics"]],
  terms: ["Terms", "A focused assistant, not an application guarantee.", ["RoleRadar never auto-applies in the MVP", "ATS readiness is an estimate", "Generated content must stay factual", "Worldwide coverage depends on enabled, licensed providers"]],
  help: ["Help centre", "A clear answer at every step.", ["Uploading and verifying your CV", "Understanding match explanations", "Editing and downloading documents", "Managing privacy and alerts"]],
  billing: ["Billing", "Simple plans, clear limits.", ["Free demo workspace", "Production subscription adapter", "No payment details collected in demo mode", "Cancel before a paid integration is activated"]],
  profile: ["Profile", "Your verified source of truth.", ["6 years of confirmed experience", "7 verified skills", "3 languages", "4 grounded experience bullets"]],
  settings: ["Settings", "Control your workspace.", ["Account and security", "Language and regional formats", "Data retention", "Export or delete your account"]],
}; const [title, subtitle, items] = content[screen] ?? ["Not found", "This workspace view is not available.", []]; return <AppContent narrow><PageIntro eyebrow="ROLERADAR" title={title} subtitle={subtitle} /><section className="panel static-panel">{items.map((item) => <div key={item}><CheckCircle2 /><span>{item}</span></div>)}</section></AppContent>; }

function AppContent({ children, narrow = false }: { children: React.ReactNode; narrow?: boolean }) { return <main className={`app-content ${narrow ? "narrow" : ""}`}>{children}</main>; }
function PageIntro({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: React.ReactNode }) { return <header className="page-intro"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{subtitle}</p></div>{action}</header>; }
function CompanyMark({ name, large = false }: { name: string; large?: boolean }) { return <span className={`company-mark ${large ? "large" : ""}`}>{name.replace(" (fictional)", "").split(/\s+/).slice(0, 2).map((word) => word[0]).join("")}</span>; }
function EmptyState({ icon: Icon, title, text, action, href }: { icon: LucideIcon; title: string; text: string; action: string; href: string }) { return <div className="empty-state"><Icon /><h2>{title}</h2><p>{text}</p><Link className="button" href={href}>{action}<ArrowRight /></Link></div>; }
function formatSalary(job: MatchResult["job"]): string { const salary = job.salary; if (!salary) return "Salary not provided"; const formatter = new Intl.NumberFormat("en", { style: "currency", currency: salary.originalCurrency, maximumFractionDigits: 0 }); return `${formatter.format(salary.originalAmountMin)}–${formatter.format(salary.originalAmountMax)} / ${salary.originalPeriod.toLowerCase()}`; }
function relativeDate(value: string): string { const day = new Date(value).getUTCDate(); return day === 5 ? "Today" : day === 4 ? "Yesterday" : `${5 - day} days ago`; }
function bandClass(band: string): string { return band.startsWith("Excellent") ? "green" : band.startsWith("Strong") ? "teal" : band.startsWith("Possible") ? "gold" : "muted"; }
function toggleSet(current: Set<string>, setter: (next: Set<string>) => void, value: string) { const next = new Set(current); if (next.has(value)) next.delete(value); else next.add(value); setter(next); }

export function RoleRadarApp({ screen, jobId, user, demoMode = true }: Props) {
  if (screen === "landing") return <Landing />;
  if (screen === "sign-in" || screen === "sign-up" || screen === "forgot-password") return <AuthScreen mode={screen} />;
  if (screen === "upload") return <UploadScreen />;
  if (screen === "processing") return <UploadScreen stage="processing" />;
  if (screen === "profile-review") return <UploadScreen stage="profile" />;
  if (screen === "preferences") return <UploadScreen stage="preferences" />;
  let content: React.ReactNode;
  if (screen === "dashboard") content = <Dashboard />;
  else if (screen === "matches") content = <MatchesScreen />;
  else if (screen === "saved") content = <MatchesScreen savedOnly />;
  else if (screen === "job") content = <JobDetail jobId={jobId} />;
  else if (screen === "setup") content = <Generating jobId={jobId} />;
  else if (screen === "generating") content = <Generating jobId={jobId} />;
  else if (screen === "ats") content = <AtsAnalysis jobId={jobId} />;
  else if (["studio", "workspace", "cv-editor", "cover-letter", "application-email", "interview"].includes(screen)) content = <Studio jobId={jobId} />;
  else if (screen === "package" || screen === "done") content = <PackageScreen jobId={jobId} />;
  else if (screen === "tracker") content = <Tracker />;
  else if (screen === "documents") content = <DocumentsScreen />;
  else if (screen === "notifications" || screen === "notification-settings") content = <Notifications />;
  else if (screen === "admin") content = <Admin />;
  else content = <StaticScreen screen={screen} />;
  return <AppShell screen={screen} user={user} demoMode={demoMode}>{content}</AppShell>;
}
