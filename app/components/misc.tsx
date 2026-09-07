"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Mail, MessageCircle, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AppContent, candidate, Logo, Metric, PageIntro } from "./shared";

export function Notifications() {
  const [email, setEmail] = useState(true);
  const [whatsapp, setWhatsapp] = useState(false);
  return <AppContent narrow><PageIntro eyebrow="Useful, not noisy" title="Notification settings" subtitle="Choose which opportunities deserve to interrupt your day." /><div className="settings-layout"><section className="panel settings-panel"><h2>Channels</h2><SettingToggle icon={Mail} title="Email alerts" text="Daily digest and time-sensitive reminders" enabled={email} setEnabled={setEmail} /><SettingToggle icon={MessageCircle} title="WhatsApp alerts" text="Strong matches only · explicit opt-in required" enabled={whatsapp} setEnabled={setWhatsapp} /><div className="consent-note"><ShieldCheck /><p>WhatsApp is off by default. A verified number and explicit consent are required before any message can be sent. Demo deliveries are simulated.</p></div></section><section className="panel settings-panel"><h2>Relevance rules</h2><label className="settings-field">Notify me for<select defaultValue="strong"><option value="strong">Excellent and Strong matches</option><option>Excellent matches only</option><option>Possible matches and above</option></select></label><label className="settings-field">Email frequency<select defaultValue="daily"><option value="daily">Daily digest</option><option>Instant strong matches</option><option>Weekly summary</option></select></label><div className="settings-columns"><label>Quiet hours start<input type="time" defaultValue="21:00" /></label><label>Quiet hours end<input type="time" defaultValue="08:00" /></label></div><label className="settings-field">Daily cap<input type="number" min="0" max="10" defaultValue="2" /></label></section><button className="button settings-save"><Check /> Save preferences</button></div></AppContent>;
}

function SettingToggle({ icon: Icon, title, text, enabled, setEnabled }: { icon: LucideIcon; title: string; text: string; enabled: boolean; setEnabled: (value: boolean) => void }) {
  return <div className="setting-toggle"><span><Icon /></span><div><strong>{title}</strong><p>{text}</p></div><button aria-label={`Toggle ${title}`} className={enabled ? "on" : ""} onClick={() => setEnabled(!enabled)}><i /></button></div>;
}

type ProviderHealth = { id: string; name: string; status: "healthy" | "degraded" | "offline"; latencyMs: number; checkedAt: string; countriesSupported: string[] };
type HealthPayload = { checkedAt: string; providers: ProviderHealth[]; queue?: { status: string; waiting: number; deadLettered: number } };

export function Admin() {
  const [payload, setPayload] = useState<HealthPayload | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void fetch("/api/providers/health", { headers: { accept: "application/json" } }).then((response) => response.ok ? response.json() as Promise<HealthPayload> : null).then((data) => { if (active) setPayload(data); }).catch(() => undefined).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const providers = payload?.providers ?? [];
  const healthy = providers.filter((provider) => provider.status === "healthy").length;
  const degraded = providers.filter((provider) => provider.status === "degraded").length;
  return <AppContent><PageIntro eyebrow="Protected admin" title="Provider health" subtitle="Operational visibility without access to private user documents." /><div className="admin-metrics"><Metric value={String(providers.length)} label="providers configured" note={`${healthy} healthy · ${degraded} degraded`} /><Metric value={payload?.queue?.status ?? "—"} label="ingestion queue" note={`${payload?.queue?.waiting ?? 0} waiting`} /><Metric value={String(payload?.queue?.deadLettered ?? 0)} label="dead-lettered" note="records awaiting review" /><Metric value={payload ? new Date(payload.checkedAt).toLocaleTimeString() : "—"} label="last check" note="live health probe" /></div>{loading ? <section className="panel tracker-loading"><RefreshCw className="spin" /> Checking providers…</section> : <section className="panel provider-table"><div className="table-head"><span>Provider</span><span>Health</span><span>Coverage</span><span>Latency</span></div>{providers.map((provider) => <div key={provider.id}><strong>{provider.name}</strong><span className={`health ${provider.status}`}><i />{provider.status}</span><span>{provider.countriesSupported.slice(0, 4).join(", ") || "—"}</span><span>{provider.latencyMs ? `${provider.latencyMs} ms` : "—"}</span></div>)}</section>}</AppContent>;
}

export function AuthScreen({ mode }: { mode: "sign-in" | "sign-up" | "forgot-password" }) {
  const title = mode === "sign-in" ? "Welcome back" : mode === "sign-up" ? "Create your NextJOB account" : "Reset your password";
  return <main className="auth-page"><div className="auth-brand"><Logo /><div><p className="eyebrow light">Your search, in focus</p><h1>One verified profile.<br />A world of <em>relevant</em> roles.</h1><p>Private by default. Factual by design. You stay in control of every application.</p></div><span><ShieldCheck /> Nothing is ever submitted automatically.</span></div><div className="auth-form"><Link href="/" className="back-link"><ArrowLeft /> Back home</Link><div><h1>{title}</h1><p>{mode === "forgot-password" ? "Enter your email and we’ll send a secure reset link." : mode === "sign-in" ? "Continue to your private job-search workspace." : "Start with your email. Your first CV stays private."}</p></div>{mode !== "forgot-password" && <Link href="/signin-with-chatgpt?return_to=%2Fdashboard" className="chatgpt-button"><Sparkles /> Continue securely with ChatGPT</Link>}<div className="auth-divider"><span>or use email</span></div><label>Email address<input type="email" placeholder="you@example.com" /></label>{mode !== "forgot-password" && <label>Password<span>{mode === "sign-in" && <Link href="/forgot-password">Forgot password?</Link>}</span><input type="password" placeholder="At least 12 characters" /></label>}<Link className="button full" href={mode === "forgot-password" ? "/sign-in" : mode === "sign-up" ? "/upload" : "/dashboard"}>{mode === "forgot-password" ? "Send reset link" : mode === "sign-up" ? "Create account" : "Sign in"}<ArrowRight /></Link><p className="auth-switch">{mode === "sign-in" ? <>New to NextJOB? <Link href="/sign-up">Create an account</Link></> : mode === "sign-up" ? <>Already have an account? <Link href="/sign-in">Sign in</Link></> : <Link href="/sign-in">Return to sign in</Link>}</p><small className="auth-note">Hosted identity uses secure, dispatch-owned sign-in. Email/password and Google adapters remain in demo mode until a production identity provider is configured.</small></div></main>;
}

export function StaticScreen({ screen }: { screen: string }) {
  const experienceBullets = candidate.experiences.reduce((count, experience) => count + experience.bullets.length, 0);
  const content: Record<string, [string, string, string[]]> = {
    privacy: ["Privacy", "Your career history deserves careful handling.", ["Private CV and document storage", "Explicit consent before Reactive Resume and AI processing", "Data export and deletion controls", "No raw CV text in analytics"]],
    terms: ["Terms", "A focused assistant, not an application guarantee.", ["NextJOB never auto-applies in the MVP", "ATS readiness is an estimate", "Generated content must stay factual", "Worldwide coverage depends on enabled, licensed providers"]],
    help: ["Help centre", "A clear answer at every step.", ["Uploading and verifying your CV", "Understanding match explanations", "Editing and downloading documents", "Managing privacy and alerts"]],
    billing: ["Billing", "Simple plans, clear limits.", ["Free demo workspace", "Production subscription adapter", "No payment details collected in demo mode", "Cancel before a paid integration is activated"]],
    profile: ["Profile", "Your verified source of truth.", [`${candidate.yearsOfExperience} years of confirmed experience`, `${candidate.skills.length} verified skills`, `${candidate.languages.length} language${candidate.languages.length === 1 ? "" : "s"}`, `${experienceBullets} grounded experience bullets`]],
    settings: ["Settings", "Control your workspace.", ["Account and security", "Language and regional formats", "Data retention", "Export or delete your account"]],
  };
  const [title, subtitle, items] = content[screen] ?? ["Not found", "This workspace view is not available.", []];
  return <AppContent narrow><PageIntro eyebrow="NextJOB" title={title} subtitle={subtitle} /><section className="panel static-panel">{items.map((item) => <div key={item}><CheckCircle2 /><span>{item}</span></div>)}</section></AppContent>;
}
