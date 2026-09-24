"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ArrowRight, Bell, BriefcaseBusiness, CircleHelp, ExternalLink, FileText, Info, LayoutDashboard, LogOut, Radar, RefreshCw, Search, Settings, ArrowLeft } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { SessionUser } from "../../lib/auth-session";
import { candidate, jobs } from "../../lib/demo-data";
import { rankJobs } from "../../lib/engine";
import type { Job, MatchResult } from "../../lib/domain";
import { aggregatorName, employerSearchUrl, jobSourceKind, linkMayAskHumanCheck } from "../../lib/job-source";

export type Props = { screen: string; jobId?: string; appliedJobId?: string; applicationState?: string; generationProvider?: string; format?: string; payment?: string; user?: SessionUser | null; demoMode?: boolean };
export type NavItem = { href: string; label: string; icon: LucideIcon };
export type MatchesApiResponse = { matches: MatchResult[]; sourceMode: "live" | "unavailable" | "profile-required"; profileRequired?: boolean; providerFailures?: Array<{ providerId: string; message: string }>; sourceCounts?: Record<string, number> };
export type ApplicationRecord = { id: string; jobId: string; status: string; verification: string; applicationDate?: string | null; updatedAt: string; title: string; company: string; location: string; sourceUrl?: string | null; providerName: string };

export const rankedMatches = rankJobs(candidate, jobs, true);
export const visibleMatches = rankedMatches.filter((match) => match.eligible);
export const bestMatch = visibleMatches[0];
export { candidate };

export const productNav: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/matches", label: "Jobs", icon: Radar },
  { href: "/tracker", label: "Applications", icon: BriefcaseBusiness },
  { href: "/profile", label: "Profile", icon: FileText },
];

export const supportNav: NavItem[] = [
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/help", label: "Help", icon: CircleHelp },
];

/** A restrained radar mark: verified opportunities resolved from a wider search. */
export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <span className="brand-mark" aria-hidden>
      <svg viewBox="0 0 40 40" width={size} height={size} focusable="false">
        <rect className="mark-field" width="40" height="40" rx="7" />
        <g className="mark-rings" fill="none" strokeWidth="2" strokeLinecap="square">
          <path d="M8 29V11h24" opacity=".45" />
          <path d="m10 26 7-7 5 4 9-11" />
        </g>
        <circle className="mark-signal" cx="31" cy="12" r="3.5" />
      </svg>
    </span>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return <Link href="/" className="brand" aria-label="NextJOB home"><LogoMark />{!compact && <span>Next<span>JOB</span></span>}</Link>;
}

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return <Link href={item.href} className={`side-link ${active ? "active" : ""}`}><Icon size={17} />{item.label}</Link>;
}

export function AppShell({ screen, user, demoMode, children }: Props & { children: React.ReactNode }) {
  const displayName = user?.displayName ?? candidate.fullName;
  const isGuest = user?.provider === "guest";
  const isActive = (href: string) => href === "/dashboard" ? screen === "dashboard" : href === "/matches" ? ["matches", "saved", "job", "add-job"].includes(screen) : href === "/tracker" ? ["tracker", "package", "done", "generating", "ats", "studio", "workspace", "cv-editor", "cover-letter", "application-email", "interview"].includes(screen) : ["profile", "profile-review", "preferences", "settings"].includes(screen);
  return <div className="app-frame">
    <aside className="sidebar">
      <div className="sidebar-head"><Logo /></div>
      <nav aria-label="Product">{productNav.map((item) => <SidebarLink key={item.href} item={item} active={isActive(item.href)} />)}<p className="nav-label support-label">Account</p>{supportNav.map((item) => <SidebarLink key={item.href} item={item} active={screen === item.href.slice(1)} />)}</nav>
      <div className="profile-card">
        <span className="avatar">{displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2)}</span>
        <div><strong>{displayName.split(" ")[0]}</strong><span>{demoMode ? "Private QA profile" : isGuest ? "Guest workspace" : user?.email ?? "Guest workspace"}</span></div>
        {user && !isGuest ? <form action="/api/auth/signout?return_to=%2F" method="post"><button type="submit" className="profile-action" title="Sign out" aria-label="Sign out"><LogOut /></button></form> : null}
      </div>
    </aside>
    <div className="app-main">
      <header className="mobile-appbar"><Logo /><Link className="mobile-alerts" href="/notifications" aria-label="Notifications"><Bell /><i /></Link></header>
      {children}
    </div>
    <nav className="bottom-nav" aria-label="Mobile navigation">{productNav.map(({ href, label, icon: Icon }) => <Link href={href} key={href} className={isActive(href) ? "active" : ""}><Icon /><span>{label}</span></Link>)}</nav>
  </div>;
}

export function AppContent({ children, narrow = false }: { children: React.ReactNode; narrow?: boolean }) {
  return <main className={`app-content ${narrow ? "narrow" : ""}`}>{children}</main>;
}

export function PageIntro({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: React.ReactNode }) {
  return <header className="page-intro"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{subtitle}</p></div>{action}</header>;
}

export function PanelHead({ title, subtitle, href }: { title: string; subtitle?: string; href?: string }) {
  return <div className="panel-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{href && <Link href={href}>View all <ArrowRight size={15} /></Link>}</div>;
}

export function CompanyMark({ name, large = false }: { name: string; large?: boolean }) {
  return <span className={`company-mark ${large ? "large" : ""}`}>{name.replace(" (fictional)", "").split(/\s+/).slice(0, 2).map((word) => word[0]).join("")}</span>;
}

export function EmptyState({ icon: Icon, title, text, action, href, onAction }: { icon: LucideIcon; title: string; text: string; action: string; href?: string; onAction?: () => void }) {
  return <div className="empty-state"><Icon /><h2>{title}</h2><p>{text}</p>
    {onAction
      ? <button className="button" onClick={onAction}>{action}<RefreshCw /></button>
      : <Link className="button" href={href ?? "/"}>{action}<ArrowRight /></Link>}
  </div>;
}

export function ScoreRing({ score, small = false }: { score: number; small?: boolean }) {
  return <div className={`score-ring ${small ? "small" : ""}`} style={{ "--score": `${score * 3.6}deg` } as React.CSSProperties}><div><strong>{score}</strong>{!small && <span>/100</span>}</div></div>;
}

export function Metric({ value, label, note, accent = false }: { value: string; label: string; note: string; accent?: boolean }) {
  return <div className={`metric ${accent ? "accent" : ""}`}><div><strong>{value}</strong><span>{label}</span></div><p>{note}</p></div>;
}

export function Fact({ label, value }: { label: string; value: string }) {
  return <div className="fact"><span>{label}</span><strong>{value}</strong></div>;
}

export function applicationMethodCopy(job: Job) {
  if (job.applicationMethod === "native") return { label: "Apply in NextJOB", title: "Apply without leaving NextJOB", description: "This employer-authorized ATS connection supports verified in-app submission after you review every document.", action: "Submit in NextJOB" };
  if (job.applicationMethod === "autofill") return { label: "Autofill available", title: "Autofill the employer form", description: "NextJOB can hand your reviewed profile and documents to the assisted-apply extension. You still verify and submit on the employer form.", action: "Continue with autofill" };
  const via = aggregatorName(job);
  if (via) return { label: "Employer-site application", title: "Review here, apply on the employer's site", description: `This vacancy reached NextJOB through ${via}. Its link opens ${via}'s page first, which passes you on to the employer's own form.`, action: `Continue via ${via}` };
  return { label: "Employer-site application", title: "Review here, submit to the employer", description: "NextJOB prepares your documents and opens the official application. You confirm the status after returning.", action: "Continue to employer" };
}

/** "Live employer listing", "Re-published by Careerjet" or "Added by you". */
export function sourceLabel(job: Job): string {
  const kind = jobSourceKind(job);
  if (kind === "user") return "Added by you";
  if (kind === "aggregator") return `Re-published by ${aggregatorName(job)}`;
  return "Live employer listing";
}

/**
 * Honest note for an aggregator link: it opens on the aggregator's site, which may put a
 * human check in front of the employer page, so a direct route to the employer is offered too.
 */
export function SourceNotice({ job }: { job: Job }) {
  const via = aggregatorName(job);
  if (!via) return null;
  const search = employerSearchUrl(job);
  return <div className="source-notice" role="note"><Info /><div><p>Opens on {via} first, then continues to the employer.{linkMayAskHumanCheck(job) ? ` ${via} may ask you to confirm you are human before showing the employer's page; if it blocks you, open the link in your usual browser or go to the employer directly.` : ""}</p>{search ? <a href={search} target="_blank" rel="noreferrer"><Search /> Find it on {job.company}&rsquo;s careers site <ExternalLink /></a> : null}</div></div>;
}

export function ApplicationMethodBadge({ job }: { job: Job }) {
  return <span className={`application-method ${job.applicationMethod}`}><i />{applicationMethodCopy(job).label}</span>;
}

type LiveMatchState = { jobId?: string; match: MatchResult | null; loading: boolean; error: string };

function initialLiveMatchState(jobId?: string): LiveMatchState {
  return { jobId, match: null, loading: Boolean(jobId), error: jobId ? "" : "No live job was selected." };
}

export function useLiveMatch(jobId?: string) {
  const [state, setState] = useState<LiveMatchState>(() => initialLiveMatchState(jobId));
  if (state.jobId !== jobId) setState(initialLiveMatchState(jobId));
  useEffect(() => {
    if (!jobId) return;
    let active = true;
    void fetch(`/api/jobs/${encodeURIComponent(jobId)}`, { headers: { accept: "application/json" } }).then(async (response) => {
      const payload = await response.json().catch(() => ({})) as { match?: MatchResult; error?: string };
      if (!response.ok || !payload.match) throw new Error(payload.error ?? "This job is no longer available.");
      if (active) setState({ jobId, match: payload.match, loading: false, error: "" });
    }).catch((loadError) => { if (active) setState({ jobId, match: null, loading: false, error: loadError instanceof Error ? loadError.message : "This job is no longer available." }); });
    return () => { active = false; };
  }, [jobId]);
  return { match: state.match, loading: state.loading, error: state.error };
}

export function LiveJobState({ loading, error }: { loading: boolean; error: string }) {
  return <AppContent narrow><Link href="/matches" className="back-link"><ArrowLeft /> Back to jobs</Link><section className="live-job-state">{loading ? <><RefreshCw className="spin" /><h1>Loading the employer listing…</h1><p>Checking the original source and latest job details.</p></> : <><CircleHelp /><h1>This job is unavailable</h1><p>{error || "The employer may have closed or removed the listing."}</p><Link className="button" href="/matches">View current jobs <ArrowRight /></Link></>}</section></AppContent>;
}

export function formatSalary(job: MatchResult["job"]): string {
  const salary = job.salary;
  if (!salary) return "Salary not provided";
  const formatter = new Intl.NumberFormat("en", { style: "currency", currency: salary.originalCurrency, maximumFractionDigits: 0 });
  return `${formatter.format(salary.originalAmountMin)}–${formatter.format(salary.originalAmountMax)} / ${salary.originalPeriod.toLowerCase()}`;
}

export function relativeDate(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Recently";
  const days = Math.max(0, Math.floor((Date.now() - timestamp) / 86400000));
  return days === 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days ago`;
}

export function formatDate(value?: string): string {
  if (!value) return "Not provided";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Not provided";
  return new Date(timestamp).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}

export function bandClass(band: string): string {
  return band.startsWith("Excellent") ? "green" : band.startsWith("Strong") ? "teal" : band.startsWith("Possible") ? "gold" : "muted";
}

export function toggleSet(current: Set<string>, setter: (next: Set<string>) => void, value: string) {
  const next = new Set(current);
  if (next.has(value)) next.delete(value); else next.add(value);
  setter(next);
}

/* ---------- Target countries (persisted client-side until preferences get a backend) ---------- */

export const COUNTRY_SUGGESTIONS = [
  "Italy", "Spain", "Germany", "France", "Netherlands", "Ireland", "Portugal", "Austria", "Belgium",
  "Switzerland", "United Kingdom", "Poland", "Sweden", "Denmark", "Norway", "Finland", "Czechia",
  "Romania", "Greece", "Hungary", "Lithuania", "European Union", "United States", "Canada", "Australia",
  "Singapore", "Japan", "Brazil", "Mexico", "India",
] as const;

const TARGET_COUNTRIES_KEY = "nextjob.target-countries.v1";
const DEFAULT_TARGET_COUNTRIES = ["Italy"];
let targetCountriesCache: string[] | null = null;
const targetCountryListeners = new Set<() => void>();

function readTargetCountries(): string[] {
  if (targetCountriesCache) return targetCountriesCache;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(TARGET_COUNTRIES_KEY) ?? "null") as unknown;
    const stored = Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
    targetCountriesCache = stored.length ? stored : DEFAULT_TARGET_COUNTRIES;
  } catch {
    targetCountriesCache = DEFAULT_TARGET_COUNTRIES;
  }
  return targetCountriesCache;
}

export function setTargetCountries(next: string[]): void {
  const cleaned = [...new Set(next.map((entry) => entry.trim()).filter(Boolean))];
  targetCountriesCache = cleaned.length ? cleaned : DEFAULT_TARGET_COUNTRIES;
  try { window.localStorage.setItem(TARGET_COUNTRIES_KEY, JSON.stringify(targetCountriesCache)); } catch { /* storage unavailable */ }
  targetCountryListeners.forEach((listener) => listener());
}

export function useTargetCountries(): string[] {
  return useSyncExternalStore(
    (listener) => { targetCountryListeners.add(listener); return () => targetCountryListeners.delete(listener); },
    readTargetCountries,
    () => DEFAULT_TARGET_COUNTRIES,
  );
}

export function splitResumeLines(value?: string): string[] {
  return value?.split(/\n+/).map((line) => line.replace(/^\s*[•*-]\s*/, "").trim()).filter(Boolean) ?? [];
}

export function ResumeLines({ value }: { value?: string }) {
  const lines = splitResumeLines(value);
  return lines.length ? <ul>{lines.map((line, index) => <li key={`${line}-${index}`}>{line}</li>)}</ul> : null;
}
