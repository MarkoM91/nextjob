"use client";
import { LanguageSettings, useI18n } from "./language-provider";
import { BillingScreen } from "./billing-screen";
import { PrivacyScreen } from "./privacy";

import { useEffect, useState } from "react";
import { Check, CheckCircle2, Mail, MessageCircle, RefreshCw, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { CandidateProfile } from "../../lib/domain";
import { NEXTJOB_CONTACT_EMAIL } from "../../lib/contact";
import { AppContent, Metric, PageIntro } from "./shared";

export function Notifications() {
  const { t, locale } = useI18n();
  const [email, setEmail] = useState(true);
  const [whatsapp, setWhatsapp] = useState(false);
  return <AppContent narrow><PageIntro eyebrow={t("Useful, not noisy")} title={t("Notification settings")} subtitle={t("Choose which opportunities deserve to interrupt your day.")} /><div className="settings-layout"><section className="panel settings-panel"><h2>{t("Channels")}</h2><SettingToggle icon={Mail} title={t("Email alerts")} text={t("Daily digest and time-sensitive reminders")} enabled={email} setEnabled={setEmail} /><SettingToggle icon={MessageCircle} title={t("WhatsApp alerts")} text={t("Strong matches only · explicit opt-in required")} enabled={whatsapp} setEnabled={setWhatsapp} /><div className="consent-note"><ShieldCheck /><p>{t("WhatsApp is off by default. A verified number and explicit consent are required before any message can be sent. Demo deliveries are simulated.")}</p></div></section><section className="panel settings-panel"><h2>{t("Relevance rules")}</h2><label className="settings-field">{t("Notify me for")}<select defaultValue="strong"><option value="strong">{t("Excellent and Strong matches")}</option><option value="Excellent matches only">{t("Excellent matches only")}</option><option value="Possible matches and above">{t("Possible matches and above")}</option></select></label><label className="settings-field">{t("Email frequency")}<select defaultValue="daily"><option value="daily">{t("Daily digest")}</option><option value="Instant strong matches">{t("Instant strong matches")}</option><option value="Weekly summary">{t("Weekly summary")}</option></select></label><div className="settings-columns"><label>{t("Quiet hours start")}<input type="time" defaultValue="21:00" /></label><label>{t("Quiet hours end")}<input type="time" defaultValue="08:00" /></label></div><label className="settings-field">{t("Daily cap")}<input type="number" min="0" max="10" defaultValue="2" /></label></section><button className="button settings-save"><Check /> {t("Save preferences")}</button></div></AppContent>;
}

function SettingToggle({ icon: Icon, title, text, enabled, setEnabled }: { icon: LucideIcon; title: string; text: string; enabled: boolean; setEnabled: (value: boolean) => void }) {
  const { t, locale } = useI18n();
  return <div className="setting-toggle"><span><Icon /></span><div><strong>{title}</strong><p>{text}</p></div><button aria-label={t("Toggle {0}", {"0": title})} className={enabled ? "on" : ""} onClick={() => setEnabled(!enabled)}><i /></button></div>;
}

type ProviderHealth = { id: string; name: string; status: "healthy" | "degraded" | "offline"; latencyMs: number; checkedAt: string; countriesSupported: string[] };
type HealthPayload = { checkedAt: string; providers: ProviderHealth[]; queue?: { status: string; waiting: number; deadLettered: number } };

export function Admin() {
  const { t, locale } = useI18n();
  const [payload, setPayload] = useState<HealthPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void fetch("/api/providers/health", { headers: { accept: "application/json" } }).then(async (response) => {
      if (response.status === 403) throw new Error("This page is restricted to NextJOB administrators. Provider health was not loaded.");
      if (!response.ok) throw new Error("Provider health could not be loaded. No status results are available.");
      const data = await response.json() as HealthPayload;
      if (!Array.isArray(data.providers) || !data.checkedAt) throw new Error("Provider health could not be loaded. No status results are available.");
      if (active) setPayload(data);
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Provider health could not be loaded."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const providers = payload?.providers ?? [];
  const healthy = providers.filter((provider) => provider.status === "healthy").length;
  const degraded = providers.filter((provider) => provider.status === "degraded").length;
  if (error) return <AppContent narrow><PageIntro eyebrow={t("Protected admin")} title={t("Provider health unavailable")} subtitle={t("Health results are shown only after an authorized request succeeds.")} /><section className="panel profile-overview"><p role="alert">{t(error)}</p><Link className="secondary-action" href="/dashboard">{t("Back to your workspace")}</Link></section></AppContent>;
  return <AppContent><PageIntro eyebrow={t("Protected admin")} title={t("Provider health")} subtitle={t("Operational visibility without access to private user documents.")} />{payload && <div className="admin-metrics"><Metric value={String(providers.length)} label={t("providers configured")} note={t("{0} healthy · {1} degraded", {"0": healthy, "1": degraded})} /><Metric value={payload.queue?.status ?? "—"} label={t("ingestion queue")} note={t("{0} waiting", {"0": payload.queue?.waiting ?? 0})} /><Metric value={String(payload.queue?.deadLettered ?? 0)} label={t("dead-lettered")} note={t("records awaiting review")} /><Metric value={new Date(payload.checkedAt).toLocaleTimeString()} label={t("last check")} note={t("live health probe")} /></div>}{loading ? <section className="panel tracker-loading"><RefreshCw className="spin" /> {t("Checking providers…")}</section> : <section className="panel provider-table"><div className="table-head"><span>{t("Provider")}</span><span>{t("Health")}</span><span>{t("Coverage")}</span><span>{t("Latency")}</span></div>{providers.map((provider) => <div key={provider.id}><strong>{provider.name}</strong><span className={`health ${provider.status}`}><i />{provider.status}</span><span>{provider.countriesSupported.slice(0, 4).join(", ") || "—"}</span><span>{provider.latencyMs ? t("{0} ms", {"0": provider.latencyMs}) : "—"}</span></div>)}</section>}</AppContent>;
}

export function StaticScreen({ screen }: { screen: string }) {
  const { t, locale } = useI18n();
  if (screen === "billing") return <BillingScreen />;
  if (screen === "profile") return <ProfileOverview />;
  if (screen === "privacy") return <PrivacyScreen />;
  const content: Record<string, [string, string, string[]]> = {
    terms: ["Terms", "A career workspace, not an application guarantee.", ["NextJOB never auto-applies in the MVP", "ATS readiness is an estimate", "Prepared content must stay factual", "Worldwide coverage depends on enabled, licensed providers"]],
    help: ["Help centre", "A clear answer at every step.", ["Uploading and verifying your CV", "Understanding match explanations", "Editing and downloading documents", "Managing privacy and alerts"]],
    billing: ["Billing", "Simple plans, clear limits.", ["Free demo workspace", "Production subscription adapter", "No payment details collected in demo mode", "Cancel before a paid integration is activated"]],
    settings: ["Settings", "Control your workspace.", ["Workspace privacy", "Language and regional formats", "Data retention", "Your CV and application data"]],
  };
  const [title, subtitle, items] = content[screen] ?? ["Not found", "This workspace view is not available.", []];
  return <AppContent narrow><PageIntro eyebrow="NextJOB" title={t(title)} subtitle={t(subtitle)} />{screen === "settings" && <LanguageSettings />}<section className="panel static-panel">{items.map((item) => <div key={item}><CheckCircle2 /><span>{t(item)}</span></div>)}{screen === "help" && <div><Mail aria-hidden="true" /><span>{t("For help with your CV, downloads or payments, email ")}<a href={`mailto:${NEXTJOB_CONTACT_EMAIL}`}>{NEXTJOB_CONTACT_EMAIL}</a>.</span></div>}</section></AppContent>;
}

function ProfileOverview() {
  const { t, locale } = useI18n();
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/cv/profile", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("Your profile could not be loaded.");
      const body = await response.json(); if (["reactive-resume", "nextjob-parser"].includes(body.source)) setProfile(body.profile);
    }).catch((reason) => { if (!controller.signal.aborted) setError(reason.message); }).finally(() => setLoaded(true));
    return () => controller.abort();
  }, []);
  return <AppContent narrow><PageIntro eyebrow={t("Your CV")} title={profile?.fullName || t("Your profile")} subtitle={profile ? `${profile.currentRole} · ${profile.location}` : t("The experience used for your matches and documents.")} /><section className="panel profile-overview">{profile ? <><h2>{t("Experience and skills")}</h2><p>{profile.yearsOfExperience} {t("years of experience · ")}{profile.skills.length} {t("skills")}</p>{profile.experiences.map((item) => <p key={item.id}><strong>{item.role}</strong><br />{item.company} · {item.startDate} — {item.endDate || t("Present")}</p>)}<p>{profile.languages.join(" · ")}</p><div className="profile-overview-actions"><Link className="button" href="/profile-review">{t("Edit and verify profile")}</Link><Link className="secondary-action" href="/preferences">{t("Edit job preferences")}</Link></div></> : <p role="status">{error || (loaded ? <>{t("Upload a CV to build your profile. ")}<Link href="/upload">{t("Upload CV")}</Link></> : t("Loading your profile…"))}</p>}</section></AppContent>;
}
