"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Check, Mail, RefreshCw, Settings2 } from "lucide-react";
import { useI18n } from "./language-provider";
import { AppContent, PageIntro } from "./shared";
import type { AlertConfig, InboxAlert } from "../../lib/alerts";

type Status = { config: AlertConfig; email: string; verified: boolean; verificationPending: boolean; emailAvailable: boolean; inbox: InboxAlert[]; unread: number; lastChecked: number | null; lastError: string | null; delivery?: { status: string; failure_code: string | null } | null };
export const alertErrors: Record<string, string> = {
  ALERTS_UNAVAILABLE: "Notifications could not be loaded. Please try again.",
  INVALID_REQUEST: "Check your alert settings and try again.",
  EMAIL_NOT_VERIFIED: "Verify your email before enabling email alerts.",
  EMAIL_NOT_CONFIGURED: "Email delivery is not available yet. In-app alerts are available.",
  EMAIL_RATE_LIMIT: "Please wait before requesting another email. You can request up to five per day.",
  INVALID_EMAIL: "Enter a valid email address.",
  PROFILE_REQUIRED: "Upload and confirm your CV before enabling job alerts.",
  JOB_SOURCES_UNAVAILABLE: "Job sources are temporarily unavailable. We will try again automatically.",
  JOB_CHECK_FAILED: "The latest job check failed. We will try again automatically.",
};
const announce = () => window.dispatchEvent(new Event("nextjob-alerts-updated"));
export function NotificationBell() {
  const { t } = useI18n();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const update = () => { if (document.visibilityState === "hidden") return; void fetch("/api/notifications", { cache: "no-store", signal: controller.signal }).then(async response => response.ok ? response.json() : null).then(payload => { if (!controller.signal.aborted && payload) setUnread(payload.config.inApp ? payload.unread : 0); }).catch(() => {}); };
    update(); const timer = setInterval(update, 60000);
    window.addEventListener("nextjob-alerts-updated", update); document.addEventListener("visibilitychange", update);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("nextjob-alerts-updated", update); document.removeEventListener("visibilitychange", update); };
  }, []);
  return <Link className="mobile-alerts" href="/notifications" aria-label={unread ? t("Notifications: {0} unread", { 0: unread }) : t("Notifications")}><Bell />{unread > 0 && <span className="alert-count">{unread > 99 ? "99+" : unread}</span>}</Link>;
}
export function Notifications() {
  const { t, locale } = useI18n();
  const [status, setStatus] = useState<Status | null>(null);
  const [config, setConfig] = useState<AlertConfig | null>(null);
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState(false);
  const setPayload = (payload: Status, replaceForm = true) => {
    setStatus(payload);
    if (replaceForm) { setConfig(payload.config); setEmail(payload.email); }
    announce();
  };
  async function load() {
    setLoading(true); setError("");
    try { const response = await fetch("/api/notifications", { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setPayload(data); }
    catch { setError("Notifications could not be loaded. Please try again."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function action(body: Record<string, unknown>, success: string, replaceForm = true) {
    setBusy(true); setError(""); setNotice("");
    try { const response = await fetch("/api/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setPayload(data, replaceForm); setNotice(success); }
    catch (reason) { setError(alertErrors[reason instanceof Error ? reason.message : ""] ?? "Notifications could not be loaded. Please try again."); }
    finally { setBusy(false); }
  }
  const update = <K extends keyof AlertConfig>(key: K, value: AlertConfig[K]) => setConfig(current => current ? { ...current, [key]: value } : current);
  return <AppContent narrow>
    <PageIntro eyebrow={t("Useful, not noisy")} title={t("Notifications")} subtitle={t("New roles that match your profile, in one place.")} action={<button className="secondary-action" aria-expanded={open} onClick={() => setOpen(!open)}><Settings2 size={18} />{t("Alert settings")}</button>} />
    {error && <div className="alert-feedback error" role="alert">{t(error)}{!status && <button onClick={load}>{t("Try again")}</button>}{error === alertErrors.PROFILE_REQUIRED && <Link href="/upload">{t("Upload CV")}</Link>}</div>}
    {notice && <div className="alert-feedback" role="status"><Check size={18} />{t(notice)}</div>}
    {loading && <p role="status"><RefreshCw className="spin" size={18} /> {t("Loading notifications…")}</p>}
    {status && config && <>
      <section className="panel alerts-inbox" aria-label={t("Your alerts")}>
        <div className="panel-head"><h2>{t("Your alerts")}{status.unread > 0 && <span className="unread-label">{status.unread}</span>}</h2>{status.unread > 0 && <button className="secondary-action" disabled={busy} onClick={() => action({ action: "read", id: "all" }, "All alerts marked as read.", false)}>{t("Mark all as read")}</button>}</div>
        {status.inbox.length ? <ul className="alert-list">{status.inbox.map(alert => <li key={alert.id} className={alert.read_at ? "" : "unread"}><div><Link href={`/job?job=${encodeURIComponent(alert.job_id)}`} onClick={() => { void action({ action: "read", id: alert.id }, "", false); }}>{alert.title}</Link><p>{alert.company} · {alert.location}</p><time dateTime={new Date(alert.created_at).toISOString()}>{new Date(alert.created_at).toLocaleDateString(locale, { day: "numeric", month: "short" })}</time></div>{!alert.read_at && <button className="secondary-action" disabled={busy} aria-label={t("Mark as read: {0}", { 0: alert.title })} onClick={() => action({ action: "read", id: alert.id }, "", false)}><Check size={18} /></button>}</li>)}</ul> : <div className="alerts-empty"><Bell /><h3>{t("No new alerts yet")}</h3><p>{t(status.config.inApp || status.config.emailEnabled ? "We will notify you about new matching roles after the first check. Your existing matches are on the Jobs page." : "Enable job alerts to hear about new roles matching your verified profile.")}</p><Link className="secondary-action" href="/matches">{t("Browse jobs")}</Link></div>}
        {status.lastChecked && <p className="alerts-check-time">{t("Last checked: {0}", { 0: new Date(status.lastChecked).toLocaleString(locale) })}</p>}
        {status.lastError && <p className="alerts-warning" role="status">{t(alertErrors[status.lastError] ?? alertErrors.JOB_CHECK_FAILED)}</p>}
      </section>
      <details className="panel alert-settings" open={open || (!status.config.inApp && !status.config.emailEnabled)} onToggle={event => setOpen(event.currentTarget.open)}>
        <summary><Settings2 size={19} />{t("Alert settings")}</summary>
        <form onSubmit={event => { event.preventDefault(); void action({ action: "save", config: { ...config, locale, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || config.timeZone } }, "Alert preferences saved."); }}>
          <label className="alert-switch"><span><strong>{t("In-app job alerts")}</strong><small>{t("See new matching roles here. No phone notifications or email required.")}</small></span><input type="checkbox" checked={config.inApp} onChange={event => update("inApp", event.target.checked)} /></label>
          <label className="settings-field">{t("Notify me for")}<select value={config.minimumScore} onChange={event => update("minimumScore", Number(event.target.value) as 72 | 85)}><option value="72">{t("Excellent and Strong matches")}</option><option value="85">{t("Excellent matches only")}</option></select></label>
          <p className="alert-help">{t("Uses your confirmed profile and saved job preferences, with local roles first.")} <Link href="/preferences">{t("Edit job preferences")}</Link></p>
          <div className="alert-email-section"><h3><Mail size={19} />{t("Email alerts")}</h3>
            {!status.emailAvailable && <p className="consent-note">{t("Email delivery is not available yet. In-app alerts are available.")}</p>}
            {status.emailAvailable && <>
            <label className="settings-field">{t("Email address")}<input type="email" maxLength={254} autoComplete="email" value={email} disabled={!status.emailAvailable} onChange={event => { setEmail(event.target.value); setConsent(false); }} placeholder="you@example.com" /></label>
            {status.verified && email === status.email ? <><p className="alert-verified"><Check size={16} />{t("Email verified")}</p><label className="alert-switch"><span>{t("Send me email job alerts")}</span><input type="checkbox" checked={config.emailEnabled} disabled={!status.emailAvailable} onChange={event => update("emailEnabled", event.target.checked)} /></label></> : <>
              {status.verificationPending && <p role="status">{t("Check your inbox and confirm your email. The link expires in 24 hours.")}</p>}
              {status.emailAvailable && <><label className="alert-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /><span>{t("I want email job alerts. I can unsubscribe at any time.")}</span></label><button type="button" className="secondary-action" disabled={busy || !email || !consent} onClick={() => action({ action: "verify", email, locale, consent }, "Verification requested. Check the delivery status below.")}>{t("Verify and enable email")}</button></>}
            </>}
            {status.delivery && <p className="alert-help" role="status">{t(({ accepted: "Email accepted by the delivery provider.", delivered: "Email delivered.", pending: "Email queued for delivery.", processing: "Sending email…", retry: "Delivery delayed. We will retry automatically.", failed: "Email delivery failed. Check your address and request verification again.", cancelled: "Email delivery cancelled." } as Record<string, string>)[status.delivery.status] ?? "Email queued for delivery.")}</p>}
            <label className="settings-field">{t("Email frequency")}<select value={config.frequency} onChange={event => update("frequency", event.target.value as "daily" | "weekly")}><option value="daily">{t("Daily digest")}</option><option value="weekly">{t("Weekly summary")}</option></select></label>
            <div className="settings-columns"><label>{t("Quiet hours start")}<input type="time" required value={config.quietStart} onChange={event => update("quietStart", event.target.value)} /></label><label>{t("Quiet hours end")}<input type="time" required value={config.quietEnd} onChange={event => update("quietEnd", event.target.value)} /></label></div>
            <p className="alert-help">{t("At most one digest per day, or one per week. Verification emails are sent only when you request them.")}</p>
            </>}
          </div>
          <button className="button" type="submit" disabled={busy}>{busy ? <RefreshCw className="spin" size={18} /> : <Check size={18} />}{t("Save preferences")}</button>
          <p className="alert-help">{t("Alerts stay with this workspace. Email verification does not create an account or recover your CV on another device.")}</p>
        </form>
      </details>
    </>}
  </AppContent>;
}
