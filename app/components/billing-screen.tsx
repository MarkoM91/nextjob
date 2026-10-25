"use client";
import { useI18n } from "./language-provider";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppContent, PageIntro } from "./shared";
import { DownloadPrice, useBilling } from "./billing-context";

type BillingState = { downloads: Array<{ versionId: string; jobId: string; expiresAt: number }>; subscription: { active: boolean; status: string; periodEndsAt?: number; cancelAtPeriodEnd?: boolean } };
export function BillingScreen() {
  const { t, locale } = useI18n();
  const { platform, platformReady } = useBilling();
  const [state, setState] = useState<BillingState | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [managing, setManaging] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    void fetch("/api/payments/status", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Download history could not be loaded.");
      if (!controller.signal.aborted) setState(body);
    }).catch((reason) => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [attempt]);
  const manage = async () => {
    setManaging(true); setError("");
    try {
      const response = await fetch("/api/payments/portal", { method: "POST", headers: { "x-nextjob-platform": platform } });
      const body = await response.json();
      if (!response.ok || !body.url) throw new Error(body.error || "Subscription management is unavailable.");
      window.location.assign(body.url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Subscription management is unavailable."); setManaging(false); }
  };
  return <AppContent narrow><PageIntro eyebrow={t("Your workspace")} title={t("Your downloads")} subtitle={t("Creating and previewing your CV is free. Pay only when you want the finished file.")} /><section className="panel static-panel">
    <h2>{t("One-time CV download · ")}<DownloadPrice /></h2><p>{t("No subscription is required. Purchased copies stay available here for the repeat-download period, even if you later edit your CV.")}</p>
    {state?.subscription.status !== "none" && state?.subscription && <div className={state.subscription.active ? "billing-success" : "billing-notice"} role="status">{t("Subscription ")}{state.subscription.status}{state.subscription.periodEndsAt ? ` · ${state.subscription.active ? "access until" : "period ended"} ${new Date(state.subscription.periodEndsAt).toLocaleDateString()}` : ""}{state.subscription.cancelAtPeriodEnd ? t(" · cancellation scheduled") : ""}{state.subscription.active ? t(". CV downloads are included.") : t(". One-time downloads remain available.")}</div>}
    {state?.subscription && state.subscription.status !== "none" && platformReady && platform === "web" && <button className="secondary-action" disabled={managing} onClick={() => void manage()}>{managing ? t("Opening billing…") : t("Manage or cancel subscription")}</button>}
    {error && <><p className="form-error" role="alert">{t(error)}</p><button className="secondary-action" onClick={() => setAttempt((value) => value + 1)}>{t("Try again")}</button></>}
    {!state && !error && <p role="status">{t("Loading your downloads…")}</p>}
    {state?.downloads.length === 0 && <p>{t("No purchased CV downloads in this browser’s workspace yet. ")}<Link href="/matches">{t("Browse your jobs")}</Link></p>}
    {state?.downloads.map((item, index) => <article className="billing-download" key={item.versionId}><h3>{t("Purchased CV ")}{index + 1}</h3><p>{t("Re-download at no extra cost until ")}{new Date(item.expiresAt).toLocaleDateString()}.</p><div className="format-actions">{["pdf", "docx", "txt"].map((format) => <a key={format} href={`/api/documents/${format}?job=${encodeURIComponent(item.jobId)}&version=${encodeURIComponent(item.versionId)}`}>{format.toUpperCase()}</a>)}</div></article>)}
    <p className="checkout-fineprint">{t("Keep your browser’s workspace cookies to retain access. Clearing them or changing browsers currently loses access to this guest workspace.")}</p>
  </section></AppContent>;
}
